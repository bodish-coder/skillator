import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { reset, ANSI_RESET } from '../reset'
import { HELP } from '../app'
import { spawnArgv } from '../nodehost'

const ops = resolve(import.meta.dirname, '..')

test('reset cleans up stale quota refreshing locks and reports cleanly', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ops-reset-')).replace(/\\/g, '/')
  try {
    const profileDir = `${root}/.claude-test`
    mkdirSync(profileDir)
    const lock = `${profileDir}/quota-cache.json.refreshing`
    writeFileSync(lock, new Date().toISOString())
    assert.ok(existsSync(lock))

    const report = await reset({ HOME: root, USERPROFILE: root })
    assert.ok(report.includes('ops --reset:'))
    assert.ok(report.includes('[ok] Terminal attributes'))
    assert.ok(report.includes('Cleared 1 stale lock(s)'))
    assert.ok(!existsSync(lock), 'stale lock file was removed')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('ANSI_RESET disables mouse tracking, restores cursor and exits alt screen', () => {
  assert.ok(ANSI_RESET.includes('\x1b[0m'))
  assert.ok(ANSI_RESET.includes('\x1b[?1000l'))
  assert.ok(ANSI_RESET.includes('\x1b[?1006l'))
  assert.ok(ANSI_RESET.includes('\x1b[?25h'))
  assert.ok(ANSI_RESET.includes('\x1b[?1049l'))
})

test('app --help documents ops --reset and app.ts --reset exits 0', () => {
  assert.ok(HELP.includes('ops --reset'))
  const root = mkdtempSync(join(tmpdir(), 'ops-reset-cli-')).replace(/\\/g, '/')
  try {
    const r = spawnSync(
      process.execPath,
      ['--import', pathToFileURL(join(ops, 'loader.mjs')).href, join(ops, 'app.ts'), '--reset'],
      { encoding: 'utf8', env: { ...process.env, HOME: root, USERPROFILE: root } },
    )
    assert.equal(r.status, 0, r.stderr)
    assert.ok(r.stdout.includes('ops --reset:'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('spawnArgv does not hang when a child spawns a detached background process inheriting stdio handles', async () => {
  const start = Date.now()
  const script = "const { spawn } = require('node:child_process'); const c = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { stdio: 'inherit', windowsHide: true }); c.unref(); process.stdout.write('ok\\n'); process.exit(0);"
  const r = await spawnArgv([process.execPath, '-e', script], process.cwd(), 5000)
  const elapsed = Date.now() - start
  assert.equal(r.code, 0)
  assert.equal(r.out.trim(), 'ok')
  assert.ok(elapsed < 2000, `expected spawnArgv to finish promptly after child exit, took ${elapsed}ms`)
})
