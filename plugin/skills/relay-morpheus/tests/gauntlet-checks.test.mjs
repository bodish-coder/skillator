import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const gate = resolve(import.meta.dirname, '../hooks/gauntlet-checks.mjs')
const windows = process.platform === 'win32'

for (const shell of windows ? ['sh', 'ps1'] : ['sh']) {
  test(`${shell} gate records skips and passes, and retains the final log after three failures`, t => {
    const dir = mkdtempSync(join(tmpdir(), 'gauntlet checks '))
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    const worktree = join(dir, 'stage worktree')
    const config = join(worktree, '.skillator')
    mkdirSync(config, { recursive: true })
    writeFileSync(join(worktree, 'source.txt'), 'fixture source\n')
    const logs = name => join(dir, name)
    const script = join(config, `checks.${shell}`)
    const check = (name, code) => {
      const proc = spawnSync(process.execPath, [gate, worktree, logs(name)], { cwd: dir, encoding: 'utf8' })
      const result = JSON.parse(proc.stdout)
      assert.equal(proc.status, code, result.log ? readFileSync(result.log, 'utf8') : proc.stderr)
      assert.deepEqual(result, JSON.parse(readFileSync(join(logs(name), 'result.json'), 'utf8')))
      return result
    }
    const checks = (stdout, stderr, code) => {
      writeFileSync(script, shell === 'sh'
        ? `cat source.txt\nprintf '%s\\n' '${stdout}'\nprintf '%s\\n' '${stderr}' >&2\nexit ${code}\n`
        : `Get-Content source.txt\n[Console]::WriteLine('${stdout}')\n[Console]::Error.WriteLine('${stderr}')\nexit ${code}\n`)
    }

    assert.equal(check('unconfigured', 0).status, 'skip')
    checks('running checks', 'first failure', 7)
    let result = check('repairable', 7)
    assert.equal(result.status, 'retry')
    assert.match(readFileSync(result.log, 'utf8'), /first failure/)
    checks('repaired checks', 'stderr captured', 0)
    result = check('repairable', 0)
    assert.equal(result.status, 'pass')
    assert.equal(result.attempt, 2)
    assert.match(readFileSync(result.log, 'utf8'), /fixture source\s+repaired checks\s+stderr captured\s+Exit 0/)

    for (let attempt = 1; attempt <= 3; attempt++) {
      checks('running checks', `failure ${attempt}`, 7)
      result = check('unrepairable', 7)
      assert.equal(result.attempt, attempt)
      assert.equal(result.status, attempt < 3 ? 'retry' : 'blocked')
      assert.ok(readFileSync(result.log, 'utf8').includes(`failure ${attempt}`))
    }
    checks('unexpected fourth call', 'unexpected stderr', 0)
    assert.deepEqual(check('unrepairable', 7), result)
    assert.deepEqual(readdirSync(logs('unrepairable')).sort(), [
      'attempt-1.log', 'attempt-2.log', 'attempt-3.log', 'result.json',
    ])
    assert.match(readFileSync(result.log, 'utf8'), /failure 3/)

    const ledger = join(dir, 'run-0001-checks.md')
    writeFileSync(ledger, [
      '# RUN-0001 - checks fixture', '', '## Stages',
      '| # | stage | state | owner | heartbeat | landed |',
      '|---|---|---|---|---|---|',
      '| 1 | F1 | ~ | builder | - | - |', '', '## In flight', '', '## Rulings', '',
    ].join('\n'))
    const hooks = resolve(import.meta.dirname, '../hooks')
    const relay = shell === 'ps1'
      ? ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(hooks, 'relay-morpheus.ps1'),
        '-Mode', 'stage', '-N', '1', '-State', '!', '-Run', ledger]
      : [windows ? 'sh.exe' : 'sh', join(hooks, 'relay-morpheus.sh').replaceAll('\\', '/'),
        'stage', '1', '!']
    const blocked = spawnSync(relay[0], relay.slice(1), {
      cwd: dir, encoding: 'utf8', env: { ...process.env, RELAY_RUN: ledger.replaceAll('\\', '/') },
    })
    assert.equal(blocked.status, 0, blocked.stderr + blocked.stdout)
    assert.match(readFileSync(ledger, 'utf8'), /\| 1 \| F1 \| ! \|/)
    assert.match(readFileSync(result.log, 'utf8'), /failure 3/)
  })
}
