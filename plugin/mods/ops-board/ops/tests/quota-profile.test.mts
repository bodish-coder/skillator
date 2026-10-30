import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, utimesSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { row } from '../status'
import type { Reader } from '../status'

const hooks = fileURLToPath(new URL('../../../../skills/watch-cortana/hooks/', import.meta.url))
const selectors = ['CODEX_THREAD_ID', 'CODEX_SESSION_ID', 'CLAUDE_CODE_SESSION_ID', 'SKILLATOR_CLI', 'SKILLATOR_PROFILE_DIR', 'CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'CLAUDE_USAGE_WATCH_DIR', 'AGY_CONFIG_DIR', 'ANTIGRAVITY_APP_DATA_DIR', 'MUSE_CONFIG_DIR', 'CURSOR_LEDGER_PATH', 'SKILLATOR_CONFIG_DIR']
for (const port of ['ps1', 'sh']) {
  test(`${port}: refresh host receives the requested profile`, () => {
    const root = mkdtempSync(`${hooks}/.quota-integration-`).replace(/\\/g, '/')
    try {
      const log = `${root}/host.log`, profile = `${root}/selected`
      mkdirSync(profile)
      const source = readFileSync(`${hooks}/usage-watch.${port}`, 'utf8')
      const stub = port === 'ps1'
        ? `function agy { [IO.File]::WriteAllText('${log}', "$env:AGY_CONFIG_DIR|$env:ANTIGRAVITY_APP_DATA_DIR") }\nfunction muse { [IO.File]::WriteAllText('${log}', $env:MUSE_CONFIG_DIR); $global:LASTEXITCODE=0 }\nfunction claude { [IO.File]::WriteAllText('${log}', $env:CLAUDE_CONFIG_DIR) }\n`
        : `agy() { printf '%s|%s' "$AGY_CONFIG_DIR" "$ANTIGRAVITY_APP_DATA_DIR" > '${log}'; }\nmuse() { printf '%s' "$MUSE_CONFIG_DIR" > '${log}'; }\nclaude() { printf '%s' "$CLAUDE_CONFIG_DIR" > '${log}'; }\n`
      const marker = port === 'ps1' ? "\nif ($Mode -eq 'refresh') {" : '\nif [ "$mode" = refresh ]; then'
      const script = `${root}/usage-watch.${port}`
      writeFileSync(script, source.replace(marker, '\n' + stub + marker))
      const env = { ...process.env, HOME: root, USERPROFILE: root }
      for (const name of selectors) delete env[name]
      for (const name of ['AGY_CONFIG_DIR', 'ANTIGRAVITY_APP_DATA_DIR', 'MUSE_CONFIG_DIR', 'CLAUDE_CONFIG_DIR']) env[name] = `${root}/other`
      for (const cli of ['agy', 'muse', 'claude']) {
        const args = port === 'ps1' ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Mode', 'refresh', '-Cli', cli, '-Dir', profile] : [script, 'refresh', cli, profile]
        execFileSync(port === 'ps1' ? 'powershell' : 'sh', args, { env, encoding: 'utf8', timeout: 10000 })
        assert.equal(readFileSync(log, 'utf8'), cli === 'agy' ? `${profile}|${profile}` : profile)
      }
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  test(`${port}: cold/stale profile refresh stays scoped`, () => {
    const root = mkdtempSync(`${hooks}/.quota-integration-`).replace(/\\/g, '/')
    try {
      const log = `${root}/refresh.log`
      const source = readFileSync(`${hooks}/usage-watch.${port}`, 'utf8')
      // Override only the refresh boundary, leaving source selection and level intact.
      const stub = port === 'ps1'
        ? `function Start-QuotaRefresh([string]$targetCli, [string]$targetDir) { [IO.File]::AppendAllText('${log}', "$targetCli|$targetDir\n") }\n`
        : `start_quota_refresh() { printf '%s|%s\\n' "$1" "$2" >> '${log}'; }\n`
      const script = `${root}/usage-watch.${port}`
      writeFileSync(script, source.replace('# level (F31)', stub + '# level (F31)'))
      const env = { ...process.env, HOME: root, USERPROFILE: root }
      for (const name of selectors) delete env[name]
      for (const cli of ['agy', 'muse', 'claude']) {
        for (const state of ['cold', 'stale']) {
          const profile = `${root}/${cli}-${state}`
          mkdirSync(profile)
          if (state === 'stale') {
            const cache = `${profile}/quota-cache.json`
            writeFileSync(cache, JSON.stringify({ src: cli === 'claude' ? 'claude-code' : cli, '5h': 88 }))
            const old = new Date(Date.now() - 4 * 3600000); utimesSync(cache, old, old)
          }
          const out = read(port, script, { ...env, SKILLATOR_CLI: cli, SKILLATOR_PROFILE_DIR: profile })
          assert.match(out, /^src=none /)
          assert.ok(existsSync(log), `${cli} ${state}: refresh requested`)
          assert.equal(readFileSync(log, 'utf8').trim().split('\n').at(-1), `${cli}|${profile}`)
        }
        const profile = `${root}/${cli}-fresh`; mkdirSync(profile)
        writeFileSync(`${profile}/quota-cache.json`, JSON.stringify({ src: cli === 'claude' ? 'claude-code' : cli, '5h': 0 }))
        const before = readFileSync(log, 'utf8')
        assert.match(read(port, script, { ...env, SKILLATOR_CLI: cli, SKILLATOR_PROFILE_DIR: profile }), /5h=0.0/)
        assert.match(read(port, script, { ...env, SKILLATOR_CLI: cli, SKILLATOR_PROFILE_DIR: `${root}/${cli}-cold`, CODEX_THREAD_ID: 'missing' }), /^src=none /)
        assert.equal(readFileSync(log, 'utf8'), before, 'fresh cache or explicit session never refreshes')
      }
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  test(`${port}: real profile rows discard inherited Codex IDs; direct sessions remain strict`, async () => {
    const root = mkdtempSync(`${hooks}/.quota-integration-`).replace(/\\/g, '/')
    try {
      const env = { ...process.env, HOME: root, USERPROFILE: root }
      for (const name of selectors) delete env[name]
      env.CODEX_THREAD_ID = 'parent'; env.CODEX_SESSION_ID = 'parent'
      const before = { ...env }, parentBefore = { ...process.env }
      const script = `${root}/usage-watch.${port}`
      const stub = port === 'ps1' ? 'function Start-QuotaRefresh { throw "Unexpected refresh" }\n' : 'start_quota_refresh() { echo "Unexpected refresh" >&2; exit 99; }\n'
      writeFileSync(script, readFileSync(`${hooks}/usage-watch.${port}`, 'utf8').replace('# level (F31)', stub + '# level (F31)'))
      const reader: Reader = async e => ({ code: 0, out: read(port, script, e), err: '' })
      for (const [cli, id, pct] of [['codex', 'a', 10], ['codex', 'b', 75], ['agy', 'c', 35]] as const) {
        const profile = `${root}/${id}`; mkdirSync(`${profile}/sessions`, { recursive: true })
        if (cli === 'codex') writeFileSync(`${profile}/sessions/rollout-${id}.jsonl`, JSON.stringify({ type: 'session_meta', payload: { id } }) + '\n' + JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', rate_limits: { primary: { used_percent: pct, window_minutes: 300 } } } }))
        else writeFileSync(`${profile}/quota-cache.json`, JSON.stringify({ src: cli, '5h': pct }))
        assert.deepEqual(await row({ name: id, cli, dir: profile }, reader, env, false), [id, `${pct}%`, '-', ''])
        for (const identity of ['CODEX_THREAD_ID', 'CODEX_SESSION_ID']) {
          const direct = { ...env, SKILLATOR_CLI: cli, SKILLATOR_PROFILE_DIR: profile }
          delete direct.CODEX_THREAD_ID; delete direct.CODEX_SESSION_ID; direct[identity] = 'missing'
          assert.match(read(port, script, direct), /^src=none /)
        }
      }
      assert.deepEqual(env, before)
      assert.ok(JSON.stringify({ ...process.env }) === JSON.stringify(parentBefore), 'parent environment unchanged')
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
}
function read(port: string, script: string, env: Record<string, string | undefined>): string {
  return execFileSync(port === 'ps1' ? 'powershell' : 'sh', port === 'ps1' ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Mode', 'level'] : [script, 'level'], { env, encoding: 'utf8', timeout: 10000 }).trim()
}
