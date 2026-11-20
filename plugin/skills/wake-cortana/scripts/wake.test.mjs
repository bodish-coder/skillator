import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { quotaAvailable } from './wake.mjs'

const script = fileURLToPath(new URL('./wake.mjs', import.meta.url))

test('only a fresh reading below both limits permits launch', () => {
  const ready = { src: 'codex', at: 1000, '5h': 95.9, '7d': 96.9 }
  assert.equal(quotaAvailable(ready, 1001), true)
  for (const row of [{ ...ready, at: 900 }, { ...ready, '5h': 96 }, { ...ready, '7d': 97 }, { ...ready, '7d': null }, null]) {
    assert.equal(quotaAvailable(row, 1001), false)
  }
})

test('an armed handoff launches the fixed run once in the chosen profile', () => {
  const root = mkdtempSync(join(tmpdir(), 'wake-cortana-'))
  try {
    execFileSync('git', ['init', '-q'], { cwd: root })
    const relay = join(root, '.skillator')
    const bin = join(root, 'bin')
    const handoff = join(root, 'handoff.md')
    const receipt = join(root, 'receipt')
    const stub = join(bin, 'fake.cjs')
    const dir = join(root, '.git', 'skillator', 'wake-cortana')
    const generation = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const profile = join(root, 'profile')
    mkdirSync(relay)
    mkdirSync(bin)
    mkdirSync(dir, { recursive: true })
    writeFileSync(handoff, '# Saved handoff')
    writeFileSync(join(relay, 'run-0042-example.md'), '# RUN-0042\n\n## Stages\n| 1 | build |   | - |\n\n## In flight\n')
    writeFileSync(join(dir, 'on'), '')
    writeFileSync(join(dir, 'arm.json'), JSON.stringify({ id: 'RUN-0042', profile, generation, handoff: null }))
    writeFileSync(stub, `
if (process.argv[2] === 'exec') {
  require('node:fs').appendFileSync(process.env.WAKE_RECEIPT, JSON.stringify({args: process.argv.slice(3), profile: process.env.CODEX_HOME}) + '\\n')
} else {
  require('node:readline').createInterface({input: process.stdin}).on('line', raw => {
    const req = JSON.parse(raw)
    if (req.id === 1) console.log(JSON.stringify({id: 1, result: {}}))
    if (req.id === 2) console.log(JSON.stringify({id: 2, result: {rateLimits: {
      primary: {usedPercent: 2, windowDurationMins: 300}, secondary: {usedPercent: 3, windowDurationMins: 10080}
    }}}))
  })
}`)
    const win = process.platform === 'win32'
    writeFileSync(join(bin, win ? 'codex.cmd' : 'codex'),
      win ? '@echo off\r\n"' + process.execPath + '" "%~dp0fake.cjs" %*\r\n'
        : '#!/bin/sh\nexec "' + process.execPath + '" "$(dirname "$0")/fake.cjs" "$@"\n', { mode: 0o755 })
    const env = { ...process.env, PATH: bin + (win ? ';' : ':') + process.env.PATH, WAKE_RECEIPT: receipt }
    const invoke = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: root, env, encoding: 'utf8', timeout: 25_000 })
    assert.equal(invoke('handoff', 'RUN-0007', handoff).status, 1)
    const armed = invoke('handoff', 'RUN-0042', handoff)
    assert.equal(armed.status, 0, armed.stderr)
    assert.match(invoke('status').stdout, /RUN-0042 waiting for quota/)
    for (let i = 0; i < 2; i++) {
      const result = invoke('worker', root, dir, generation)
      assert.equal(result.status, 0, result.stderr)
    }
    const rows = readFileSync(receipt, 'utf8').trim().split('\n').map(JSON.parse)
    assert.deepEqual(rows, [{ args: ['Resume RUN-0042 from its Relay Morpheus run record.'], profile }])
    assert.match(invoke('status').stdout, /finished/)
    assert.match(invoke('off').stdout, /off/)
    assert.equal(invoke('handoff', 'RUN-0042', handoff).status, 1)
  } finally { rmSync(root, { force: true, recursive: true }) }
})
