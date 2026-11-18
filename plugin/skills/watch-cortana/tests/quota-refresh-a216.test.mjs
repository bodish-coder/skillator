import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
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
      `function claude { [IO.File]::AppendAllText('${argsFile}', "claude|1|$($args -join ' ')\`n"); [IO.File]::WriteAllText('${stdinFile}', (@($input) -join "\`n")); $n = @([IO.File]::ReadAllLines('${argsFile}')).Count; [IO.File]::AppendAllText('${root}/cli-wait.log', "w=$env:SKILLATOR_QUOTA_REFRESH_WAIT\`n"); if (Test-Path "${root}/cli-cache-$n.txt") { [IO.File]::WriteAllText("$env:CLAUDE_CONFIG_DIR/quota-cache.json", [IO.File]::ReadAllText("${root}/cli-cache-$n.txt")) }; if (Test-Path "${root}/cli-child-$n.txt") { $si = New-Object Diagnostics.ProcessStartInfo 'ping', '-n 120 127.0.0.1'; $si.UseShellExecute = $false; $si.CreateNoWindow = $true; [IO.File]::WriteAllText('${root}/child.pid', "$([Diagnostics.Process]::Start($si).Id)") }; if (Test-Path "${root}/cli-sleep-$n.txt") { Start-Sleep -Seconds ([int][IO.File]::ReadAllText("${root}/cli-sleep-$n.txt")) }; $f = "${root}/cli-response-$n.txt"; if (Test-Path $f) { [IO.File]::ReadAllText($f) } elseif (Test-Path '${responseFile}') { [IO.File]::ReadAllText('${responseFile}') }; $global:LASTEXITCODE = [int][IO.File]::ReadAllText('${exitCodeFile}') }`,
      `function agy { [IO.File]::AppendAllText('${argsFile}', "agy|1|$($args -join ' ')\`n"); if (Test-Path '${responseFile}') { [IO.File]::ReadAllText('${responseFile}') }; $global:LASTEXITCODE = [int][IO.File]::ReadAllText('${exitCodeFile}') }`,
      // F176: orphan.pid - a process that started before the refresh, listed as its child (a reused parent PID).
      `function Get-CimInstance { if (Test-Path '${root}/orphan.pid') { CimCmdlets\\Get-CimInstance Win32_Process -Filter "ProcessId=$([IO.File]::ReadAllText('${root}/orphan.pid').Trim())" } elseif (Test-Path '${root}/no-creation') { CimCmdlets\\Get-CimInstance @args | Select-Object ProcessId, @{ n = 'CreationDate'; e = { $null } } } else { CimCmdlets\\Get-CimInstance @args } }`,
      // A236: no-creation - a listed child's CreationDate cannot be read.
      // F176: no-starttime - this process's own start time cannot be read.
      `function Get-Process { if (Test-Path '${root}/no-starttime') { throw 'denied' } else { Microsoft.PowerShell.Management\\Get-Process @args } }`,
      `function muse { if (Test-Path '${responseFile}') { [IO.File]::ReadAllText('${responseFile}') }; $global:LASTEXITCODE = [int][IO.File]::ReadAllText('${exitCodeFile}') }`,
      '',
    ].join('\n')
    writeFileSync(script, source.replace('function Start-QuotaRefresh', stub + 'function Start-QuotaRefresh'), 'utf8')
  } else {
    const stub = [
      `spawn_quota_refresh() { printf '%s|%s\\n' "$1" "$2" >> '${launchesFile}'; }`,
      `claude() { printf 'claude|%s|%s\\n' "\${MSYS_NO_PATHCONV:-}" "$*" >> '${argsFile}'; cat > '${stdinFile}'; n=$(wc -l < '${argsFile}' | tr -d ' '); printf 'w=%s\\n' "\${SKILLATOR_QUOTA_REFRESH_WAIT:-}" >> '${root}/cli-wait.log'; [ ! -f "${root}/cli-cache-$n.txt" ] || cp "${root}/cli-cache-$n.txt" "$CLAUDE_CONFIG_DIR/quota-cache.json"; [ ! -f "${root}/cli-sleep-$n.txt" ] || sleep "$(cat "${root}/cli-sleep-$n.txt")"; if [ -f "${root}/cli-response-$n.txt" ]; then cat "${root}/cli-response-$n.txt"; elif [ -f '${responseFile}' ]; then cat '${responseFile}'; fi; return "$(cat '${exitCodeFile}')"; }`,
      `agy() { printf 'agy|%s|%s\\n' "\${MSYS_NO_PATHCONV:-}" "$*" >> '${argsFile}'; [ -f '${responseFile}' ] && cat '${responseFile}'; return "$(cat '${exitCodeFile}')"; }`,
      `ps() { command ps "$@"; [ -f '${root}/orphan.pid' ] || return 0; command ps "$@" | awk -v o="$(cat '${root}/orphan.pid')" 'NR > 1 && $2 != o { print "x", o, $2, "?", "00:00:00", "orphan" }'; }`,
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

  const runLevel = (envOverrides = {}, mode = 'level') => {
    const env = { ...baseEnv, ...envOverrides }
    const args = port === 'ps1'
      ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Mode', mode]
      : [script, mode]
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

  // F176: the nth claude call answers cli-response-<n>.txt (get_usage first, the turn second).
  const setCliResponses = texts => texts.forEach((t, i) => writeFileSync(`${root}/cli-response-${i + 1}.txt`, t, 'utf8'))

  const cleanup = () => rmSync(root, { recursive: true, force: true })

  const cliCalls = () => existsSync(argsFile) ? readFileSync(argsFile, 'utf8').trim().split('\n').filter(Boolean) : []
  const cliStdin = () => existsSync(stdinFile) ? readFileSync(stdinFile, 'utf8') : ''

  const cliWaits = () => existsSync(`${root}/cli-wait.log`) ? readFileSync(`${root}/cli-wait.log`, 'utf8').trim().split(/\r?\n/).filter(Boolean) : []

  // A level read left running (F176 lock tests); resolves with its run time in ms.
  const spawnLevel = (envOverrides = {}) => new Promise(resolve => {
    const args = port === 'ps1'
      ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Mode', 'level']
      : [script, 'level']
    const t0 = Date.now()
    const child = spawn(port === 'ps1' ? 'powershell' : shExe, args, { env: { ...baseEnv, ...envOverrides }, windowsHide: true, stdio: 'ignore' })
    const kill = setTimeout(() => child.kill(), 70000)
    child.on('exit', () => { clearTimeout(kill); resolve(Date.now() - t0) })
  })

  // F176: a bystander started before the refresh; its pid (MSYS pid for sh) lands in orphan.pid.
  const spawnOrphan = async () => {
    const child = port === 'ps1'
      ? spawn('ping', ['-n', '120', '127.0.0.1'], { windowsHide: true, stdio: 'ignore' })
      : spawn(shExe, ['-c', `echo $$ > '${root}/orphan.tmp'; exec sleep 120`], { env: baseEnv, windowsHide: true, stdio: 'ignore' })
    if (port === 'ps1') writeFileSync(`${root}/orphan.pid`, String(child.pid))
    else {
      const until = Date.now() + 10000
      while (!existsSync(`${root}/orphan.tmp`) && Date.now() < until) await new Promise(r => setTimeout(r, 100))
      writeFileSync(`${root}/orphan.pid`, readFileSync(`${root}/orphan.tmp`, 'utf8').trim())
    }
    await new Promise(r => setTimeout(r, 1500))
    return child
  }

  return { root, runLevel, runRefresh, launchCount, setCliResponse, setCliResponses, cleanup, cliCalls, cliStdin, cliWaits, spawnLevel, spawnOrphan }
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

      // Concurrent/second cold read while lock is fresh (< 90s, F176) must not launch again
      const whileLocked = fx.runLevel(env)
      assert.equal(whileLocked, 'src=none 5h=- 7d=- ctx=- max=- note=refresh_pending')
      assert.equal(fx.launchCount(), 1, 'in-flight lock prevents duplicate refresh launch')
      const lockAt65 = new Date(Date.now() - 65 * 1000)
      utimesSync(lock, lockAt65, lockAt65)
      fx.runLevel(env)
      assert.equal(fx.launchCount(), 1, 'a 65 s old lock still holds (capped calls end by 50 s)')

      // Stale lock (> 90s old) is replaced by a new launch
      const staleLockTime = new Date(Date.now() - 95 * 1000)
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
        last: null,
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
        last: null,
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
      assert.deepEqual(cache, { src: 'claude-code', note: 'no plan rate limits (API key or limited-scope login)', failures: 1, backoff_secs: 60, last: null })
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

  // F176 owner ruling 2026-11-17, narrowed by the RUN-0039 verify: when get_usage has
  // limits but no windows yet, a FORCED read of a logged-in profile spends one tiny turn
  // (haiku, prompt `1`) and reads the turn's rate_limit_event. Never from the background,
  // at a last-known 7d >= 90%, on an unknown cache, on API-key billing, on a login that
  // looks expired, or twice inside the backoff. When in doubt, no turn. Stubbed CLI only.
  //   -nowindows: limits with no windows (the one shape that may turn).
  //   -null: rate_limits null with rate_limits_available true - what the installed CLI
  //     (2.1.x) answers when its usage fetch failed, an expired login included; inferred
  //     from the binary (the fetch error only reaches its debug log), not a live capture.
  //   -unavailable: rate_limits_available false - API key / Bedrock / Vertex.
  const turnSetup = (fx, name, cache, creds = true) => {
    const profile = `${fx.root}/${name}`
    mkdirSync(profile, { recursive: true })
    if (creds) writeFileSync(`${profile}/.credentials.json`, '{}')
    if (cache != null) writeFileSync(`${profile}/quota-cache.json`, typeof cache === 'string' ? cache : JSON.stringify(cache))
    return { profile, env: { SKILLATOR_CLI: 'claude', SKILLATOR_PROFILE_DIR: profile, CLAUDE_CONFIG_DIR: profile } }
  }
  const FORCED = { SKILLATOR_QUOTA_REFRESH_WAIT: '1' }
  const age = (f, secs) => { const t = new Date(Date.now() - secs * 1000); utimesSync(f, t, t) }
  // Both no-reading shapes: -null turned on 7fd079c, -nowindows is the one that may turn now.
  const NO_READING = ['claude-get-usage-null.jsonl', 'claude-get-usage-nowindows.jsonl']

  test(`${port}: F176 forced read: get_usage with limits spends no turn`, { skip }, () => {
    const fx = makeFixture(port)
    try {
      const { profile, env } = turnSetup(fx, 'turn-limits')
      fx.setCliResponses([fixture('claude-get-usage.jsonl'), fixture('claude-turn.jsonl')])
      fx.runRefresh('claude', profile, { ...env, ...FORCED })
      assert.equal(fx.cliCalls().length, 1)
    } finally { fx.cleanup() }
  })

  test(`${port}: F176 forced read: limits with no windows spend exactly one minimal turn - prompt 1, haiku`, { skip }, () => {
    const fx = makeFixture(port)
    try {
      const { profile, env } = turnSetup(fx, 'turn-one')
      fx.setCliResponses([fixture('claude-get-usage-nowindows.jsonl'), fixture('claude-turn.jsonl')])
      fx.runRefresh('claude', profile, { ...env, ...FORCED })
      const calls = fx.cliCalls()
      assert.equal(calls.length, 2, 'get_usage, then one turn')
      const [, pathconv, args] = calls[1].split('|')
      assert.equal(pathconv, '1')
      assert.match(args, /^-p 1 --model haiku --max-turns 1 /, `prompt exactly 1, model haiku: ${args}`)
      assert.match(args, /--no-session-persistence/)
      assert.match(args, /--strict-mcp-config/)
      assert.match(args, /--tools( ""|\s*$)/, `no tools: ${args}`)
      assert.ok(!args.includes('/'), `no slash in the turn: ${args}`)
      assert.deepEqual(fx.cliWaits(), ['w=', 'w='], 'neither claude child sees SKILLATOR_QUOTA_REFRESH_WAIT')
      const cache = JSON.parse(readFileSync(`${profile}/quota-cache.json`, 'utf8'))
      assert.deepEqual(cache, { src: 'claude-code', '5h': 23, '7d': 5, via: 'turn' })
    } finally { fx.cleanup() }
  })

  test(`${port}: F176 background refresh never spends a turn`, { skip }, () => {
    const fx = makeFixture(port)
    try {
      const { profile, env } = turnSetup(fx, 'turn-bg')
      fx.setCliResponses([fixture('claude-get-usage-nowindows.jsonl'), fixture('claude-turn.jsonl')])
      fx.runRefresh('claude', profile, env)
      assert.equal(fx.cliCalls().length, 1)
      assert.equal(JSON.parse(readFileSync(`${profile}/quota-cache.json`, 'utf8')).note, 'no plan rate limits')
    } finally { fx.cleanup() }
  })

  test(`${port}: F176 forced read never spends a turn at a last 7d of 90% or more`, { skip }, () => {
    const fx = makeFixture(port)
    try {
      const { profile, env } = turnSetup(fx, 'turn-90', { src: 'claude-code', '5h': 10, '7d': 90, models: [{ name: 'Opus', '7d': 3 }] })
      fx.setCliResponses([fixture('claude-get-usage-nowindows.jsonl'), fixture('claude-turn.jsonl')])
      fx.runRefresh('claude', profile, { ...env, ...FORCED })
      assert.equal(fx.cliCalls().length, 1)
    } finally { fx.cleanup() }
  })

  test(`${port}: F176 verify - an expired login (rate_limits null, shape inferred from the binary) spends no turn`, { skip }, () => {
    const fx = makeFixture(port)
    try {
      const { profile, env } = turnSetup(fx, 'turn-expired')
      fx.setCliResponses([fixture('claude-get-usage-null.jsonl'), fixture('claude-turn.jsonl')])
      fx.runRefresh('claude', profile, { ...env, ...FORCED })
      assert.equal(fx.cliCalls().length, 1)
      assert.equal(JSON.parse(readFileSync(`${profile}/quota-cache.json`, 'utf8')).note, 'no usage reading - login may have expired, run claude /login')
    } finally { fx.cleanup() }
  })

  test(`${port}: F176 verify - API-key billing (rate_limits_available false) never spends a turn`, { skip }, () => {
    const fx = makeFixture(port)
    try {
      const { profile, env } = turnSetup(fx, 'turn-apikey')
      fx.setCliResponses([fixture('claude-get-usage-unavailable.jsonl'), fixture('claude-turn.jsonl')])
      fx.runRefresh('claude', profile, { ...env, ...FORCED })
      assert.equal(fx.cliCalls().length, 1)
      assert.equal(JSON.parse(readFileSync(`${profile}/quota-cache.json`, 'utf8')).note, 'no plan rate limits (API key or limited-scope login)')
    } finally { fx.cleanup() }
  })

  test(`${port}: F176 verify - no .credentials.json spends no turn`, { skip }, () => {
    for (const shape of NO_READING) {
      const fx = makeFixture(port)
      try {
        const { profile, env } = turnSetup(fx, 'turn-nocreds', null, false)
        fx.setCliResponses([fixture(shape), fixture('claude-turn.jsonl')])
        fx.runRefresh('claude', profile, { ...env, ...FORCED })
        assert.equal(fx.cliCalls().length, 1, shape)
      } finally { fx.cleanup() }
    }
  })

  test(`${port}: F176 two forced reads inside the backoff spend one turn`, { skip }, () => {
    const fx = makeFixture(port)
    try {
      const { profile, env } = turnSetup(fx, 'turn-backoff')
      fx.setCliResponses([fixture('claude-get-usage-nowindows.jsonl'), fixture('claude-turn-nolimits.jsonl')])
      fx.runLevel({ ...env, ...FORCED })
      assert.equal(fx.cliCalls().length, 2, 'first forced read: get_usage + one turn')
      assert.equal(JSON.parse(readFileSync(`${profile}/quota-cache.json`, 'utf8')).backoff_secs, 60)
      fx.runLevel({ ...env, ...FORCED })
      assert.equal(fx.cliCalls().length, 2, 'inside the backoff: no read, no turn')
    } finally { fx.cleanup() }
  })

  // The verifier's two-step: 95% read via a turn, the cache goes stale, a plain read's
  // background refresh fails - its failure record must keep the 95 - then `p` after the backoff.
  test(`${port}: F176 verify - a failure record keeps the last 7d, so a later forced read spends no turn`, { skip }, () => {
    for (const shape of NO_READING) {
      const fx = makeFixture(port)
      try {
        const { profile, env } = turnSetup(fx, 'carry', { src: 'claude-code', '5h': 10, '7d': 95, via: 'turn' })
        const cache = `${profile}/quota-cache.json`
        age(cache, 4 * 3600)
        fx.setCliResponse(fixture(shape), 0)
        writeFileSync(`${fx.root}/cli-response-3.txt`, fixture('claude-turn.jsonl'))
        assert.match(fx.runLevel(env), /note=refresh_pending$/)
        assert.equal(fx.launchCount(), 1)
        rmSync(`${cache}.refreshing`, { force: true })
        fx.runRefresh('claude', profile, env)
        const rec = JSON.parse(readFileSync(cache, 'utf8'))
        assert.equal(rec.last?.['7d'], 95, `${shape}: ${JSON.stringify(rec)}`)
        assert.equal(rec.last?.['5h'], 10)
        assert.equal(typeof rec.last?.at, 'number')
        age(cache, 120)
        fx.runLevel({ ...env, ...FORCED })
        assert.equal(fx.cliCalls().length, 2, `${shape}: two get_usage reads, no turn`)
        assert.equal(JSON.parse(readFileSync(cache, 'utf8')).last?.['7d'], 95, 'still carried')
      } finally { fx.cleanup() }
    }
  })

  test(`${port}: F176 verify - forced at a stale 95, then forced again after the backoff: no turn`, { skip }, () => {
    for (const shape of NO_READING) {
      const fx = makeFixture(port)
      try {
        const { profile, env } = turnSetup(fx, 'carry2', { src: 'claude-code', '5h': 10, '7d': 95, via: 'turn' })
        const cache = `${profile}/quota-cache.json`
        age(cache, 4 * 3600)
        fx.setCliResponse(fixture(shape), 0)
        writeFileSync(`${fx.root}/cli-response-3.txt`, fixture('claude-turn.jsonl'))
        fx.runLevel({ ...env, ...FORCED })
        assert.equal(fx.cliCalls().length, 1, shape)
        age(cache, 120)
        fx.runLevel({ ...env, ...FORCED })
        assert.equal(fx.cliCalls().length, 2, `${shape}: no turn`)
      } finally { fx.cleanup() }
    }
  })

  test(`${port}: F176 verify - a corrupt cache, a legacy weekly 95 or a legacy failure record is unknown: no turn`, { skip }, () => {
    const caches = {
      corrupt: '{"src":"claude-code","7d":95',
      weekly: { src: 'claude-code', weekly: 95 },
      string7d: { src: 'claude-code', '7d': '50' },
      legacyFailure: { src: 'claude-code', note: 'unparseable', failures: 1, backoff_secs: 60 },
    }
    for (const shape of NO_READING) {
      for (const [name, c] of Object.entries(caches)) {
        const fx = makeFixture(port)
        try {
          const { profile, env } = turnSetup(fx, name, c)
          fx.setCliResponses([fixture(shape), fixture('claude-turn.jsonl')])
          fx.runRefresh('claude', profile, { ...env, ...FORCED })
          assert.equal(fx.cliCalls().length, 1, `${shape} ${name}: no turn`)
        } finally { fx.cleanup() }
      }
    }
  })

  test(`${port}: F176 verify - a weekly 50 is read as 7d and may turn; a carried "last":null is blank`, { skip }, () => {
    for (const c of [{ src: 'claude-code', weekly: 50 }, { src: 'claude-code', note: 'x', failures: 1, backoff_secs: 60, last: null }]) {
      const fx = makeFixture(port)
      try {
        const { profile, env } = turnSetup(fx, 'blank', c)
        fx.setCliResponses([fixture('claude-get-usage-nowindows.jsonl'), fixture('claude-turn.jsonl')])
        fx.runRefresh('claude', profile, { ...env, ...FORCED })
        assert.equal(fx.cliCalls().length, 2, JSON.stringify(c))
      } finally { fx.cleanup() }
    }
  })

  // A hung turn is killed at its 30 s cap, inside the 90 s lock; a second `p` meanwhile
  // finds the lock and never starts a read or a turn of its own.
  test(`${port}: F176 verify - a hung turn is capped, and a second forced read while it runs starts nothing`, { skip }, async () => {
    const fx = makeFixture(port)
    try {
      const { profile, env } = turnSetup(fx, 'hung')
      fx.setCliResponses([fixture('claude-get-usage-nowindows.jsonl'), fixture('claude-turn.jsonl')])
      writeFileSync(`${fx.root}/cli-sleep-2.txt`, '60')
      const orphan = await fx.spawnOrphan()
      const first = fx.spawnLevel({ ...env, ...FORCED })
      const until = Date.now() + 20000
      while (fx.cliCalls().length < 2 && Date.now() < until) await new Promise(r => setTimeout(r, 200))
      assert.equal(fx.cliCalls().length, 2, 'the turn started')
      assert.match(fx.runLevel({ ...env, ...FORCED }), /note=refresh_pending$/)
      const ms = await first
      assert.equal(fx.cliCalls().length, 2, 'the second read started nothing')
      assert.ok(ms < 45000, `capped: the first read took ${ms} ms`)
      assert.equal(existsSync(`${profile}/quota-cache.json.refreshing`), false, 'lock released')
      assert.equal(JSON.parse(readFileSync(`${profile}/quota-cache.json`, 'utf8')).note, 'one turn gave no limits')
      await new Promise(r => setTimeout(r, 1000))
      const alive = orphan.exitCode === null && orphan.signalCode === null
      orphan.kill()
      assert.ok(alive, 'the tree kill spares a parent-PID match that started before the refresh')
    } finally { fx.cleanup() }
  })

  // F176 money round 1: a turn that hangs (killed at its cap) gave no limits - the next `p`
  // after the plain backoff reads get_usage only; the turn waits 24 h.
  test(`${port}: F176 money - a hung turn holds turns 24 h while plain reads still retry`, { skip }, async () => {
    const fx = makeFixture(port)
    try {
      const { profile, env } = turnSetup(fx, 'hold')
      const cache = `${profile}/quota-cache.json`
      const nw = fixture('claude-get-usage-nowindows.jsonl')
      fx.setCliResponses([nw, fixture('claude-turn.jsonl'), nw, nw, fixture('claude-turn.jsonl')])
      writeFileSync(`${fx.root}/cli-sleep-2.txt`, '60')
      await fx.spawnLevel({ ...env, ...FORCED })
      assert.equal(fx.cliCalls().length, 2, 'get_usage + the hung turn')
      const rec = JSON.parse(readFileSync(cache, 'utf8'))
      assert.equal(rec.note, 'one turn gave no limits')
      assert.equal(rec.backoff_secs, 60, 'plain reads keep the short backoff')
      age(cache, 900)
      fx.runLevel({ ...env, ...FORCED })
      assert.equal(fx.cliCalls().length, 3, 'after 900 s: a plain read, no second turn')
      const held = JSON.parse(readFileSync(cache, 'utf8'))
      assert.equal(typeof held.turned_at, 'number', JSON.stringify(held))
      writeFileSync(cache, JSON.stringify({ ...held, turned_at: held.turned_at - 86400 - 60 }))
      age(cache, 900)
      fx.runLevel({ ...env, ...FORCED })
      assert.equal(fx.cliCalls().length, 5, '24 h later: get_usage, then a turn')
      assert.equal(JSON.parse(readFileSync(cache, 'utf8')).via, 'turn')
    } finally { fx.cleanup() }
  })

  // F176 money round 2: a carried 7d is known for 7 days from its `at`; older is unknown - no turn.
  test(`${port}: F176 money - a carried last 7d counts for 7 days from its at; older or no at is unknown`, { skip }, () => {
    const now = Math.floor(Date.now() / 1000), day = 86400
    const cases = [
      ['50, 1 day', { '7d': 50, at: now - day }, 2],
      ['50, 8 days', { '7d': 50, at: now - 8 * day }, 1],
      ['50, no at', { '7d': 50 }, 1],
      ['95, 1 day', { '7d': 95, at: now - day }, 1],
      ['95, 8 days', { '7d': 95, at: now - 8 * day }, 1],
    ]
    for (const [name, last, calls] of cases) {
      const fx = makeFixture(port)
      try {
        const { profile, env } = turnSetup(fx, 'at', { src: 'claude-code', note: 'x', failures: 1, backoff_secs: 60, last })
        fx.setCliResponses([fixture('claude-get-usage-nowindows.jsonl'), fixture('claude-turn.jsonl')])
        fx.runRefresh('claude', profile, { ...env, ...FORCED })
        assert.equal(fx.cliCalls().length, calls, name)
      } finally { fx.cleanup() }
    }
  })

  // F176 money round 3: the refresh lock holds for its full 90 s (capped calls end by 50 s).
  test(`${port}: F176 money - the refresh lock holds at 85 s and is stale at 95 s`, { skip }, () => {
    const fx = makeFixture(port)
    try {
      const profile = `${fx.root}/lock`
      mkdirSync(profile, { recursive: true })
      const env = { SKILLATOR_CLI: 'claude', SKILLATOR_PROFILE_DIR: profile, CLAUDE_CONFIG_DIR: profile }
      const lock = `${profile}/quota-cache.json.refreshing`
      writeFileSync(lock, 'x')
      age(lock, 85)
      fx.runLevel(env)
      assert.equal(fx.launchCount(), 0, 'an 85 s old lock still holds')
      age(lock, 95)
      fx.runLevel(env)
      assert.equal(fx.launchCount(), 1, 'a 95 s old lock is stale')
    } finally { fx.cleanup() }
  })

  // F176 money round 5: the gate reads the cache after get_usage, not before.
  test(`${port}: F176 money - the gate reads the cache after get_usage`, { skip }, () => {
    const fx = makeFixture(port)
    try {
      const { profile, env } = turnSetup(fx, 'after')
      fx.setCliResponses([fixture('claude-get-usage-nowindows.jsonl'), fixture('claude-turn.jsonl')])
      writeFileSync(`${fx.root}/cli-cache-1.txt`, JSON.stringify({ src: 'claude-code', '5h': 10, '7d': 95 }))
      fx.runRefresh('claude', profile, { ...env, ...FORCED })
      assert.equal(fx.cliCalls().length, 1, 'a 95 written while get_usage ran: no turn')
    } finally { fx.cleanup() }
  })

  // F176 money round 6: limits with no windows, but the stream also says the login failed.
  test(`${port}: F176 money - an authentication error beside no windows spends no turn`, { skip }, () => {
    const fx = makeFixture(port)
    try {
      const { profile, env } = turnSetup(fx, 'autherr')
      const err = '{"type":"result","is_error":true,"result":"Failed to authenticate: OAuth session expired and could not be refreshed"}'
      fx.setCliResponses([fixture('claude-get-usage-nowindows.jsonl').trimEnd() + '\n' + err + '\n', fixture('claude-turn.jsonl')])
      fx.runRefresh('claude', profile, { ...env, ...FORCED })
      assert.equal(fx.cliCalls().length, 1)
      assert.equal(JSON.parse(readFileSync(`${profile}/quota-cache.json`, 'utf8')).note, 'login expired - run claude /login')
    } finally { fx.cleanup() }
  })

  // A236 (5): a good reading stored while the turn ran is the current reading - kept, with the
  // turn's 24 h hold stamped on it, never moved into last under a failure record; level and
  // check still see its 95% weekly.
  test(`${port}: A236 a reading written during a turn with no limits stays the current reading`, { skip }, () => {
    const fx = makeFixture(port)
    try {
      const { profile, env } = turnSetup(fx, 'during-good')
      fx.setCliResponses([fixture('claude-get-usage-nowindows.jsonl'), fixture('claude-turn-nolimits.jsonl')])
      writeFileSync(`${fx.root}/cli-cache-2.txt`, JSON.stringify({ src: 'claude-code', '5h': 10, '7d': 95 }))
      fx.runRefresh('claude', profile, { ...env, ...FORCED })
      assert.equal(fx.cliCalls().length, 2)
      const rec = JSON.parse(readFileSync(`${profile}/quota-cache.json`, 'utf8'))
      assert.equal(typeof rec.turned_at, 'number', JSON.stringify(rec))
      delete rec.turned_at
      assert.deepEqual(rec, { src: 'claude-code', '5h': 10, '7d': 95 })
      assert.equal(fx.runLevel(env), 'src=claude-code 5h=10.0 7d=95.0 ctx=- max=95.0')
      assert.match(fx.runLevel({ ...env, CLAUDE_USAGE_HANDOFF_WEEKLY_PCT: '90' }, 'check'), /HANDOFF NOW \(claude-code 7-day 95(\.0)?%\)/)
    } finally { fx.cleanup() }
  })

  // F176 last round: the failure record re-reads the cache at write time in both ports, so a
  // corrupt one still keeps the 24 h hold.
  test(`${port}: F176 last round - a record written after a turn with no limits carries what the cache holds then`, { skip }, () => {
    for (const [name, during, last] of [['corrupt', '{"x":', undefined], ['array', '[1]', undefined]]) {
      const fx = makeFixture(port)
      try {
        const { profile, env } = turnSetup(fx, 'during')
        fx.setCliResponses([fixture('claude-get-usage-nowindows.jsonl'), fixture('claude-turn-nolimits.jsonl')])
        writeFileSync(`${fx.root}/cli-cache-2.txt`, during)
        fx.runRefresh('claude', profile, { ...env, ...FORCED })
        assert.equal(fx.cliCalls().length, 2, name)
        const rec = JSON.parse(readFileSync(`${profile}/quota-cache.json`, 'utf8'))
        assert.equal(rec.note, 'one turn gave no limits', name)
        assert.equal(rec.failures, 1, name)
        assert.equal(typeof rec.turned_at, 'number', `${name}: ${JSON.stringify(rec)}`)
        assert.ok(Math.abs(rec.turned_at - Date.now() / 1000) < 120, name)
        if (last) { assert.equal(typeof rec.last.at, 'number', name); delete rec.last.at; assert.deepEqual(rec.last, last, name) }
        else assert.equal(Object.hasOwn(rec, 'last'), false, `${name}: unknown, last left out`)
      } finally { fx.cleanup() }
    }
  })

  // A236 (2): without node the sh counter must not read the "7d" inside a carried last as a
  // reading - the counter keeps counting and the backoff grows.
  test(`${port}: A236 without node a record carrying last keeps counting failures`, { skip: port !== 'sh' || skip }, () => {
    const fx = makeFixture(port)
    try {
      const { profile, env } = turnSetup(fx, 'nonode', { src: 'claude-code', note: 'unparseable', failures: 2, backoff_secs: 120, last: { '5h': 10, '7d': 95, at: 1 } })
      fx.setCliResponse('fixture: usage unavailable', 0)
      fx.runRefresh('claude', profile, { ...env, PATH: 'C:/Program Files/Git/usr/bin' })
      const rec = JSON.parse(readFileSync(`${profile}/quota-cache.json`, 'utf8'))
      assert.equal(rec.failures, 3, JSON.stringify(rec))
      assert.equal(rec.backoff_secs, 240)
    } finally { fx.cleanup() }
  })

  // A236 (8): ps1 kills only a listed child with a readable start not before its own; with
  // its own start or the child's unreadable, a reused PID could be anyone's - spared.
  test(`${port}: A236 the capped call kills a child it started, and spares one whose start (or its own) cannot be read`, { skip: port !== 'ps1' || skip }, async () => {
    for (const [flag, killed] of [[null, true], ['no-starttime', false], ['no-creation', false]]) {
      const fx = makeFixture(port)
      let pid = 0
      try {
        const { env } = turnSetup(fx, 'kids')
        fx.setCliResponses([fixture('claude-get-usage-nowindows.jsonl'), fixture('claude-turn.jsonl')])
        writeFileSync(`${fx.root}/cli-child-2.txt`, '')
        writeFileSync(`${fx.root}/cli-sleep-2.txt`, '60')
        if (flag) writeFileSync(`${fx.root}/${flag}`, '')
        await fx.spawnLevel({ ...env, ...FORCED })
        await new Promise(r => setTimeout(r, 1500))
        pid = Number(readFileSync(`${fx.root}/child.pid`, 'utf8'))
        let alive = true
        try { process.kill(pid, 0) } catch { alive = false }
        assert.equal(alive, !killed, `${flag ?? 'readable'}: child ${killed ? 'killed' : 'spared'}`)
      } finally {
        try { if (pid) process.kill(pid) } catch { }
        fx.cleanup()
      }
    }
  })

  // A236 (3, 8): sh kill_tree kills only a child whose start is readable and not before its
  // parent's (a reused PID can never take down an unrelated tree); taskkill /T only on the
  // capped call's own process, never on a listed child.
  test(`${port}: A236 kill_tree spares a child whose start cannot be read or is earlier; /T only on the root`, { skip: port !== 'sh' || skip }, () => {
    const src = readFileSync(`${hooksDir}/usage-watch.sh`, 'utf8')
    const fns = src.slice(src.indexOf('  started() {'), src.indexOf('  capped() {'))
    for (const [pt, ct, killed] of [['100', '', false], ['100', 'abc', false], ['100', '200', true], ['100', '100', true], ['100', '50', false], ['', '200', false]]) {
      const root = mkdtempSync(join(tmpdir(), 'kill-tree-')).replace(/\\/g, '/')
      try {
        const harness = `${fns}
  taskkill() { echo "$*" >> '${root}/tk'; }
  ( sleep 120 & echo $! > '${root}/child'; wait ) & P=$!
  while [ ! -s '${root}/child' ]; do sleep 0.1; done; C=$(cat '${root}/child')
  started() { if [ "$1" = "$P" ]; then printf '%s' '${pt}'; elif [ "$1" = "$C" ]; then printf '%s' '${ct}'; fi; }
  kill_tree "$P"; sleep 1
  if kill -0 "$C" 2>/dev/null; then echo alive; kill "$C"; else echo dead; fi
`
        const r = spawnSync(shExe, ['-c', harness], { encoding: 'utf8', windowsHide: true, timeout: 30000, env: { ...process.env, PATH: shPathPrefix + (process.env.PATH || process.env.Path || '') } })
        assert.equal(r.stdout.trim(), killed ? 'dead' : 'alive', `parent "${pt}" child "${ct}": ${r.stderr}`)
        const tk = existsSync(`${root}/tk`) ? readFileSync(`${root}/tk`, 'utf8').trim().split(/\r?\n/) : []
        if (tk.length) {
          assert.match(tk[0], /^\/T \/F \/PID \d+$/, 'the root: its whole tree')
          for (const l of tk.slice(1)) assert.match(l, /^\/F \/PID \d+$/, `a listed child: never /T (${l})`)
          assert.equal(tk.length, killed ? 2 : 1)
        }
      } finally { rmSync(root, { recursive: true, force: true }) }
    }
  })
}
