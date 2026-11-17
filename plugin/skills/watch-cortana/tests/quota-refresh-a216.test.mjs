import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const hooksDir = fileURLToPath(new URL('../hooks/', import.meta.url)).replace(/\\/g, '/')
const shExe = ['sh', 'C:/Program Files/Git/bin/sh.exe', 'C:/Program Files/Git/usr/bin/sh.exe'].find(
  bin => spawnSync(bin, ['-c', 'exit 0'], { windowsHide: true, timeout: 5000 }).status === 0
)
const hasSh = Boolean(shExe)
const shPathPrefix = shExe && shExe.includes('/') ? [dirname(shExe), 'C:/Program Files/Git/usr/bin'].join(delimiter) + delimiter : ''

const fixture = name => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8')

const selectors = [
  'CODEX_THREAD_ID', 'CODEX_SESSION_ID', 'CLAUDE_CODE_SESSION_ID',
  'SKILLATOR_CLI', 'SKILLATOR_PROFILE_DIR', 'CODEX_HOME',
  'CLAUDE_CONFIG_DIR', 'CLAUDE_USAGE_WATCH_DIR', 'AGY_CONFIG_DIR',
  'ANTIGRAVITY_APP_DATA_DIR', 'MUSE_CONFIG_DIR', 'CURSOR_LEDGER_PATH',
  'SKILLATOR_CONFIG_DIR', 'CLAUDE_USAGE_HANDOFF_PCT', 'CLAUDE_USAGE_HANDOFF_WEEKLY_PCT',
]

function makeFixture(port) {
  const root = mkdtempSync(join(tmpdir(), `quota-refresh-a216-${port}-`)).replace(/\\/g, '/')
  const launchesFile = `${root}/launches.log`
  const responseFile = `${root}/cli-response.txt`
  const exitCodeFile = `${root}/cli-exit.txt`
  const argsFile = `${root}/cli-args.log`
  const stdinFile = `${root}/cli-stdin.txt`
  writeFileSync(responseFile, 'fixture: usage unavailable', 'utf8')
  writeFileSync(exitCodeFile, '0', 'utf8')

  const source = readFileSync(`${hooksDir}/usage-watch.${port}`, 'utf8')
  const script = `${root}/usage-watch.${port}`

  if (port === 'ps1') {
    const stub = [
      `function Start-Process { param($FilePath, $ArgumentList, $WindowStyle) [IO.File]::AppendAllText('${launchesFile}', "$ArgumentList\`n") }`,
      `function claude { [IO.File]::AppendAllText('${argsFile}', "claude|1|$($args -join ' ')\`n"); [IO.File]::WriteAllText('${stdinFile}', (@($input) -join "\`n")); if (Test-Path '${responseFile}') { [IO.File]::ReadAllText('${responseFile}') }; $global:LASTEXITCODE = [int][IO.File]::ReadAllText('${exitCodeFile}') }`,
      `function agy { [IO.File]::AppendAllText('${argsFile}', "agy|1|$($args -join ' ')\`n"); if (Test-Path '${responseFile}') { [IO.File]::ReadAllText('${responseFile}') }; $global:LASTEXITCODE = [int][IO.File]::ReadAllText('${exitCodeFile}') }`,
      `function muse { if (Test-Path '${responseFile}') { [IO.File]::ReadAllText('${responseFile}') }; $global:LASTEXITCODE = [int][IO.File]::ReadAllText('${exitCodeFile}') }`,
      '',
    ].join('\n')
    writeFileSync(script, source.replace('function Start-QuotaRefresh', stub + 'function Start-QuotaRefresh'), 'utf8')
  } else {
    const stub = [
      `spawn_quota_refresh() { printf '%s|%s\\n' "$1" "$2" >> '${launchesFile}'; }`,
      `claude() { printf 'claude|%s|%s\\n' "\${MSYS_NO_PATHCONV:-}" "$*" >> '${argsFile}'; cat > '${stdinFile}'; [ -f '${responseFile}' ] && cat '${responseFile}'; return "$(cat '${exitCodeFile}')"; }`,
      `agy() { printf 'agy|%s|%s\\n' "\${MSYS_NO_PATHCONV:-}" "$*" >> '${argsFile}'; [ -f '${responseFile}' ] && cat '${responseFile}'; return "$(cat '${exitCodeFile}')"; }`,
      `muse() { [ -f '${responseFile}' ] && cat '${responseFile}'; return "$(cat '${exitCodeFile}')"; }`,
      '',
    ].join('\n')
    writeFileSync(script, source.replace('if [ "$mode" = refresh ]; then', stub + 'if [ "$mode" = refresh ]; then'), 'utf8')
  }

  const baseEnv = {
    ...process.env,
    HOME: `${root}/home`,
    USERPROFILE: `${root}/home`,
    PATH: shPathPrefix + (process.env.PATH || process.env.Path || ''),
  }
  for (const name of selectors) delete baseEnv[name]

  const runLevel = (envOverrides = {}) => {
    const env = { ...baseEnv, ...envOverrides }
    const args = port === 'ps1'
      ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Mode', 'level']
      : [script, 'level']
    return execFileSync(port === 'ps1' ? 'powershell' : shExe, args, { env, encoding: 'utf8', windowsHide: true, timeout: 10000 }).trim()
  }

  const runRefresh = (cli, dir, envOverrides = {}) => {
    const env = { ...baseEnv, ...envOverrides }
    const args = port === 'ps1'
      ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Mode', 'refresh', '-Cli', cli, '-Dir', dir]
      : [script, 'refresh', cli, dir]
    execFileSync(port === 'ps1' ? 'powershell' : shExe, args, { env, encoding: 'utf8', windowsHide: true, timeout: 10000 })
  }

  const launchCount = () => {
    if (!existsSync(launchesFile)) return 0
    return readFileSync(launchesFile, 'utf8').trim().split('\n').filter(Boolean).length
  }

  const setCliResponse = (text, exitCode = 0) => {
    writeFileSync(responseFile, text, 'utf8')
    writeFileSync(exitCodeFile, String(exitCode), 'utf8')
  }

  const cleanup = () => rmSync(root, { recursive: true, force: true })

  const cliCalls = () => existsSync(argsFile) ? readFileSync(argsFile, 'utf8').trim().split('\n').filter(Boolean) : []
  const cliStdin = () => existsSync(stdinFile) ? readFileSync(stdinFile, 'utf8') : ''

  return { root, runLevel, runRefresh, launchCount, setCliResponse, cleanup, cliCalls, cliStdin }
}

for (const port of ['ps1', 'sh']) {
  const skip = port === 'sh' && !hasSh ? 'sh unavailable in this environment' : false

  test(`${port}: cold level read acquires launch lock, reports refresh_pending, and prevents duplicate launches while in-flight`, { skip }, () => {
    const fx = makeFixture(port)
    try {
      const profile = `${fx.root}/claude-cold`
      mkdirSync(profile, { recursive: true })
      const env = { SKILLATOR_CLI: 'claude', SKILLATOR_PROFILE_DIR: profile, CLAUDE_CONFIG_DIR: profile }
      const lock = `${profile}/quota-cache.json.refreshing`

      const first = fx.runLevel(env)
      assert.equal(first, 'src=none 5h=- 7d=- ctx=- max=- note=refresh_pending')
      assert.equal(fx.launchCount(), 1, 'first cold read launches exactly one refresh')
      assert.equal(existsSync(lock), true, 'launch lock is created before background refresh completes')

      // Concurrent/second cold read while lock is fresh (< 60s) must not launch again
      const whileLocked = fx.runLevel(env)
      assert.equal(whileLocked, 'src=none 5h=- 7d=- ctx=- max=- note=refresh_pending')
      assert.equal(fx.launchCount(), 1, 'in-flight lock prevents duplicate refresh launch')

      // Stale lock (> 60s old) is replaced by a new launch
      const staleLockTime = new Date(Date.now() - 65 * 1000)
      utimesSync(lock, staleLockTime, staleLockTime)
      const afterStaleLock = fx.runLevel(env)
      assert.equal(afterStaleLock, 'src=none 5h=- 7d=- ctx=- max=- note=refresh_pending')
      assert.equal(fx.launchCount(), 2, 'expired launch lock allows a fresh launch')
    } finally {
      fx.cleanup()
    }
  })

  test(`${port}: unparseable refresh writes failure cache, clears lock, throttles retries with bounded backoff, and never infers auth failure`, { skip }, () => {
    const fx = makeFixture(port)
    try {
      const profile = `${fx.root}/claude-unparseable`
      mkdirSync(profile, { recursive: true })
      const env = { SKILLATOR_CLI: 'claude', SKILLATOR_PROFILE_DIR: profile, CLAUDE_CONFIG_DIR: profile }
      const lock = `${profile}/quota-cache.json.refreshing`
      const cache = `${profile}/quota-cache.json`

      // 1. Cold read starts refresh
      const first = fx.runLevel(env)
      assert.equal(first, 'src=none 5h=- 7d=- ctx=- max=- note=refresh_pending')
      assert.equal(fx.launchCount(), 1)
      assert.equal(existsSync(lock), true)

      // 2. Refresh finishes with unparseable response
      fx.setCliResponse('fixture: usage unavailable', 0)
      fx.runRefresh('claude', profile, env)
      assert.equal(existsSync(lock), false, 'lock is cleared after refresh finishes')
      assert.equal(existsSync(cache), true, 'failure cache is written after unparseable response')

      const record1 = JSON.parse(readFileSync(cache, 'utf8'))
      assert.deepEqual(record1, {
        src: 'claude-code',
        note: 'unparseable',
        failures: 1,
        backoff_secs: 60,
      })

      // 3. Immediate second level read is throttled by backoff and reports unparseable (never not_logged_in)
      const second = fx.runLevel(env)
      assert.equal(second, 'src=claude-code 5h=- 7d=- ctx=- max=- note=unparseable')
      assert.ok(!second.includes('not_logged_in'), 'never infers authentication failure from missing credentials or unparseable output')
      assert.equal(fx.launchCount(), 1, 'second read within backoff window does not schedule another refresh')

      // 4. Expire the 60s backoff window -> next level read schedules retry #2
      const past65s = new Date(Date.now() - 65 * 1000)
      utimesSync(cache, past65s, past65s)
      const retryRead = fx.runLevel(env)
      assert.equal(retryRead, 'src=none 5h=- 7d=- ctx=- max=- note=refresh_pending')
      assert.equal(fx.launchCount(), 2, 'read after backoff expiry schedules a retry')

      // 5. Second consecutive failure doubles backoff to 120s
      fx.runRefresh('claude', profile, env)
      const record2 = JSON.parse(readFileSync(cache, 'utf8'))
      assert.deepEqual(record2, {
        src: 'claude-code',
        note: 'unparseable',
        failures: 2,
        backoff_secs: 120,
      })

      // At 70s old (< 120s backoff), still throttled!
      const past70s = new Date(Date.now() - 70 * 1000)
      utimesSync(cache, past70s, past70s)
      assert.equal(fx.runLevel(env), 'src=claude-code 5h=- 7d=- ctx=- max=- note=unparseable')
      assert.equal(fx.launchCount(), 2, 'still throttled inside 120s backoff window')

      // 6. Verify backoff is bounded at 900s (15m) even after many failures
      writeFileSync(cache, JSON.stringify({ src: 'claude-code', note: 'unparseable', failures: 8, backoff_secs: 900 }), 'utf8')
      fx.setCliResponse('', 1) // empty output failure -> note: "refresh failed"
      fx.runRefresh('claude', profile, env)
      const recordCap = JSON.parse(readFileSync(cache, 'utf8'))
      assert.deepEqual(recordCap, {
        src: 'claude-code',
        note: 'refresh failed',
        failures: 9,
        backoff_secs: 900,
      })
      assert.equal(fx.runLevel(env), 'src=claude-code 5h=- 7d=- ctx=- max=- note=refresh_failed')
    } finally {
      fx.cleanup()
    }
  })

  test(`${port}: recovery on valid response clears failure/backoff state, and explicit profile isolation holds`, { skip }, () => {
    const fx = makeFixture(port)
    try {
      const profileA = `${fx.root}/profile-a`
      const profileB = `${fx.root}/profile-b`
      mkdirSync(profileA, { recursive: true })
      mkdirSync(profileB, { recursive: true })

      const envA = { SKILLATOR_CLI: 'claude', SKILLATOR_PROFILE_DIR: profileA, CLAUDE_CONFIG_DIR: profileA }
      const envB = { SKILLATOR_CLI: 'claude', SKILLATOR_PROFILE_DIR: profileB, CLAUDE_CONFIG_DIR: profileB }

      // Fail refresh on profileA
      fx.setCliResponse('broken output', 0)
      fx.runRefresh('claude', profileA, envA)
      assert.equal(fx.runLevel(envA), 'src=claude-code 5h=- 7d=- ctx=- max=- note=unparseable')
      assert.equal(fx.launchCount(), 0, 'profileA is throttled by its failure cache')

      // profileB is unaffected by profileA's failure cache
      assert.equal(fx.runLevel(envB), 'src=none 5h=- 7d=- ctx=- max=- note=refresh_pending')
      assert.equal(fx.launchCount(), 1, 'profileB schedules its own refresh independently')
      assert.equal(existsSync(`${profileB}/quota-cache.json.refreshing`), true)
      assert.equal(existsSync(`${profileA}/quota-cache.json.refreshing`), false)

      // Querying profileA as a different host (agy) ignores claude-code's failure cache
      const envAgyOnA = { SKILLATOR_CLI: 'agy', SKILLATOR_PROFILE_DIR: profileA, AGY_CONFIG_DIR: profileA }
      assert.equal(fx.runLevel(envAgyOnA), 'src=none 5h=- 7d=- ctx=- max=- note=refresh_pending')

      // Now profileA recovers when refresh gets a valid Claude usage response
      fx.setCliResponse(fixture('claude-get-usage.jsonl'), 0)
      fx.runRefresh('claude', profileA, envA)
      const recovered = JSON.parse(readFileSync(`${profileA}/quota-cache.json`, 'utf8'))
      assert.equal(recovered.src, 'claude-code')
      assert.equal(recovered['5h'], 12.5)
      assert.equal(recovered['7d'], 61)
      assert.equal(recovered.note, undefined)
      assert.equal(recovered.failures, undefined)
      assert.equal(recovered.backoff_secs, undefined)

      assert.equal(fx.runLevel(envA), 'src=claude-code 5h=12.5 7d=61.0 ctx=- max=61.0')
    } finally {
      fx.cleanup()
    }
  })

  test(`${port}: muse non-zero exit without 'not logged in' reports unparseable/refresh_failed, not false auth failure`, { skip }, () => {
    const fx = makeFixture(port)
    try {
      const profile = `${fx.root}/muse-profile`
      mkdirSync(profile, { recursive: true })
      const env = { SKILLATOR_CLI: 'muse', SKILLATOR_PROFILE_DIR: profile, MUSE_CONFIG_DIR: profile }

      // Non-zero exit with generic error text must NOT report not_logged_in
      fx.setCliResponse('Error: ECONNRESET network failure', 1)
      fx.runRefresh('muse', profile, env)
      assert.equal(fx.runLevel(env), 'src=muse 5h=- 7d=- ctx=- max=- note=unparseable')

      // Explicit 'not logged in' message is reported accurately
      fx.setCliResponse('Error: user is not logged in', 1)
      fx.runRefresh('muse', profile, env)
      assert.equal(fx.runLevel(env), 'src=muse 5h=- 7d=- ctx=- max=- note=not_logged_in')
    } finally {
      fx.cleanup()
    }
  })

  test(`${port}: B27 an expired claude login says login expired with the fix, not unparseable`, { skip }, () => {
    const fx = makeFixture(port)
    try {
      const profile = `${fx.root}/claude-expired`
      mkdirSync(profile, { recursive: true })
      const env = { SKILLATOR_CLI: 'claude', SKILLATOR_PROFILE_DIR: profile, CLAUDE_CONFIG_DIR: profile }
      fx.setCliResponse('{"is_error":true,"result":"Failed to authenticate: OAuth session expired and could not be refreshed","type":"result"}', 1)
      fx.runRefresh('claude', profile, env)
      const cache = JSON.parse(readFileSync(`${profile}/quota-cache.json`, 'utf8'))
      assert.equal(cache.note, 'login expired - run claude /login')
      assert.equal(fx.runLevel(env), 'src=claude-code 5h=- 7d=- ctx=- max=- note=login_expired_-_run_claude_/login')
    } finally {
      fx.cleanup()
    }
  })

  // F176 / B27: the Claude read is the get_usage control request on stdin - no prompt,
  // so no model turn; sh keeps Git Bash from rewriting any arg (it turned "/usage"
  // into a paid prompt). claude-get-usage.jsonl is schema-derived (field names from
  // the installed Claude Code 2.1.326's get_usage schema, numbers made up): a sandboxed
  // live capture could only get the null answer, which is the -unavailable fixture.
  test(`${port}: F176 claude refresh sends get_usage on stdin, never a prompt, and keeps per-model windows`, { skip }, () => {
    const fx = makeFixture(port)
    try {
      const profile = `${fx.root}/claude-models`
      mkdirSync(profile, { recursive: true })
      const env = { SKILLATOR_CLI: 'claude', SKILLATOR_PROFILE_DIR: profile, CLAUDE_CONFIG_DIR: profile }
      // a verbose stream can open with a long system line - past Windows' 32K argv limit
      const init = JSON.stringify({ type: 'system', subtype: 'init', tools: Array.from({ length: 2000 }, (_, i) => `tool_${i}_padding_padding`) })
      fx.setCliResponse(init + '\n' + fixture('claude-get-usage.jsonl'), 0)
      fx.runRefresh('claude', profile, env)
      const [call] = fx.cliCalls()
      const [, pathconv, args] = call.split('|')
      assert.equal(pathconv, '1', 'MSYS path conversion is off for the claude call')
      assert.ok(!args.includes('/usage'), `no /usage arg: ${args}`)
      assert.match(args, /--input-format stream-json/)
      const req = JSON.parse(fx.cliStdin().trim())
      assert.equal(req.type, 'control_request')
      assert.equal(req.request.subtype, 'get_usage')
      assert.equal(req.request.skip_behaviors, true)
      const cache = JSON.parse(readFileSync(`${profile}/quota-cache.json`, 'utf8'))
      assert.deepEqual(cache, { src: 'claude-code', '5h': 12.5, '7d': 61, models: [{ name: 'Opus', '7d': 40 }, { name: 'Fable', '7d': 43 }] })
      assert.equal(fx.runLevel(env), 'src=claude-code 5h=12.5 7d=61.0 ctx=- max=61.0')
    } finally {
      fx.cleanup()
    }
  })

  test(`${port}: F176 claude get_usage with no plan rate limits says so and backs off`, { skip }, () => {
    const fx = makeFixture(port)
    try {
      const profile = `${fx.root}/claude-nolimits`
      mkdirSync(profile, { recursive: true })
      const env = { SKILLATOR_CLI: 'claude', SKILLATOR_PROFILE_DIR: profile, CLAUDE_CONFIG_DIR: profile }
      fx.setCliResponse(fixture('claude-get-usage-unavailable.jsonl'), 0)
      fx.runRefresh('claude', profile, env)
      const cache = JSON.parse(readFileSync(`${profile}/quota-cache.json`, 'utf8'))
      assert.deepEqual(cache, { src: 'claude-code', note: 'no plan rate limits', failures: 1, backoff_secs: 60 })
    } finally {
      fx.cleanup()
    }
  })

  test(`${port}: F176 agy refresh keeps each model group's windows and turns MSYS path conversion off`, { skip }, () => {
    const fx = makeFixture(port)
    try {
      const profile = `${fx.root}/agy-models`
      mkdirSync(profile, { recursive: true })
      const env = { SKILLATOR_CLI: 'agy', SKILLATOR_PROFILE_DIR: profile, AGY_CONFIG_DIR: profile }
      fx.setCliResponse(fixture('agy-usage.json'), 0)
      fx.runRefresh('agy', profile, env)
      const [, pathconv, args] = fx.cliCalls()[0].split('|')
      assert.equal(pathconv, '1')
      assert.match(args, /-p \/usage --output-format json/)
      const cache = JSON.parse(readFileSync(`${profile}/quota-cache.json`, 'utf8'))
      assert.deepEqual(cache, { src: 'agy', '5h': 0, '7d': 24.5, models: [
        { name: 'Gemini Models', '5h': 0, '7d': 24.5 },
        { name: 'Claude and GPT models', '5h': 0, '7d': 0 },
      ] })
    } finally {
      fx.cleanup()
    }
  })

  test(`${port}: F176 SKILLATOR_QUOTA_REFRESH_WAIT runs the cold refresh in the foreground, once, under the lock`, { skip }, () => {
    const fx = makeFixture(port)
    try {
      const profile = `${fx.root}/claude-wait`
      mkdirSync(profile, { recursive: true })
      const env = { SKILLATOR_CLI: 'claude', SKILLATOR_PROFILE_DIR: profile, CLAUDE_CONFIG_DIR: profile, SKILLATOR_QUOTA_REFRESH_WAIT: '1' }
      fx.setCliResponse(fixture('claude-get-usage.jsonl'), 0)
      fx.runLevel(env)
      assert.equal(fx.launchCount(), 0, 'no background launch')
      assert.equal(fx.cliCalls().length, 1, 'one read')
      assert.equal(existsSync(`${profile}/quota-cache.json.refreshing`), false, 'lock released')
      assert.equal(fx.runLevel(env), 'src=claude-code 5h=12.5 7d=61.0 ctx=- max=61.0')
      assert.equal(fx.cliCalls().length, 1, 'a fresh cache is not read again')
      // a held lock still wins: no second read while another refresh runs
      rmSync(`${profile}/quota-cache.json`)
      writeFileSync(`${profile}/quota-cache.json.refreshing`, 'x')
      assert.match(fx.runLevel(env), /note=refresh_pending$/)
      assert.equal(fx.cliCalls().length, 1)
    } finally {
      fx.cleanup()
    }
  })
}
