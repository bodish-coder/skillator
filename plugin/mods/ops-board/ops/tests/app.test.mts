import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { keyOf, parseArgs, USAGE } from '../app'
const tmpDirs: string[] = []
const mkTmp = (prefix: string): string => { const d = mkdtempSync(prefix); tmpDirs.push(d); return d }
after(() => { for (const d of tmpDirs) rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) })

// The launchers end to end: `--once` draws one frame through ops.sh / ops.ps1, against
// a fixture repo and against this repo (read-only), with a fixture skills dir whose
// scripts print canned facts and log every call - never the real scripts, so no real
// hold is set or released and no board or team file is written.
const ops = resolve(import.meta.dirname, '..')
const win = process.platform === 'win32'
const hasSh = spawnSync('sh', ['-c', 'exit 0']).status === 0
const MACHINE = 'DRIVE=C:\nDISK_FREE=90000000000\nDISK_TOTAL=100000000000\nMEM_FREE=9000000000\nHOLD=-\n'
const RUNS = 'RUN-0099  fixture run  1/2 done  (stage 2 open)\n'

// A skills dir: pending --machine, relay list / chain status / chain decide and usage-watch
// level answer from fixtures; ticket-meta and the watchdog refuse. Every call is logged.
function fixtureSkills(): { dir: string; log: string } {
  const dir = mkTmp(join(tmpdir(), 'ops-skills-'))
  const log = join(dir, 'calls.log')
  const put = (rel: string, sh: string, ps: string) => {
    mkdirSync(join(dir, rel, '..'), { recursive: true })
    writeFileSync(join(dir, rel + '.sh'), `printf '%s\\n' "$(basename "$0") $*" >> '${log.replace(/\\/g, '/')}'\n${sh}\n`)
    writeFileSync(join(dir, rel + '.ps1'), `Add-Content -LiteralPath '${log}' -Value ((Split-Path -Leaf $PSCommandPath) + ' ' + ($args -join ' '))\n$all = $args -join ' '\n${ps}\n`)
  }
  const m = MACHINE.trimEnd().split('\n')
  put('tickets-zordon/scripts/ticket-meta', 'echo "fixture: no writes" >&2; exit 1', '[Console]::Error.WriteLine("fixture: no writes"); exit 1')
  put('tickets-zordon/scripts/pending',
    `case "$*" in *--machine*) printf '%s\\n' ${m.map(l => `'${l}'`).join(' ')} ;; *) exit 1 ;; esac`,
    `if ($all -match '--machine') { ${m.map(l => `Write-Output '${l}'`).join('; ')} } else { exit 1 }`)
  put('relay-morpheus/hooks/relay-morpheus',
    `case "$*" in list*) printf '%s\\n' '${RUNS.trimEnd()}' ;; *'chain status'*) printf '' ;; *'chain decide'*) echo UNOBSERVABLE ;; *) echo "fixture: no $*" >&2; exit 1 ;; esac`,
    `if ($all -match 'list') { Write-Output '${RUNS.trimEnd()}' } elseif ($all -match 'status') { } elseif ($all -match 'decide') { Write-Output 'UNOBSERVABLE' } else { [Console]::Error.WriteLine('fixture: no ' + $all); exit 1 }`)
  put('watch-cortana/hooks/usage-watch', 'echo "src=none 5h=- 7d=- ctx=- max=-"', "Write-Output 'src=none 5h=- 7d=- ctx=- max=-'")
  return { dir, log }
}

// The env with PATH (whatever its case on Windows) led by `dir`.
function withPath(dir: string): NodeJS.ProcessEnv {
  const env = { ...process.env }
  const key = Object.keys(env).find(k => k.toUpperCase() === 'PATH') ?? 'PATH'
  env[key] = dir + (win ? ';' : ':') + (env[key] ?? '')
  return env
}

type Launcher = 'sh' | 'ps1'
function launch(kind: Launcher, repo: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  const r = kind === 'sh'
    ? spawnSync('sh', [join(ops, 'ops.sh'), repo, ...args], { encoding: 'utf8', env })
    : spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(ops, 'ops.ps1'), '-Repo', repo, ...args], { encoding: 'utf8', env })
  return { code: r.status, out: r.stdout ?? '', err: r.stderr ?? '' }
}
const launchers: [Launcher, boolean][] = [['sh', !hasSh], ['ps1', !win]]

function fixtureRepo(): string {
  const t = mkTmp(join(tmpdir(), 'ops-app-'))
  execFileSync('git', ['init', '-q'], { cwd: t })
  writeFileSync(join(t, 'TICKETS.md'), '# Tickets\n\n## Features\n\n- [ ] F1 — Dark mode [owner: @asha]\n- [~] F2 — Bulk delete\n')
  mkdirSync(join(t, '.skillator'))
  writeFileSync(join(t, '.skillator/team.md'), '- @asha: a@x\n')
  return t
}

const ONCE = ['--once', '--cols', '80', '--rows', '20', '--no-color']

for (const [kind, skip] of launchers) {
  test(`${kind}: --once draws the fixture repo's board at 80 columns, the band from the scripts' facts`, { skip }, () => {
    const t = fixtureRepo()
    const s = fixtureSkills()
    const r = launch(kind, t, [...ONCE, '--skills', s.dir])
    assert.equal(r.code, 0, r.err)
    const lines = r.out.replace(/\r?\n$/, '').split(/\r?\n/)
    assert.equal(lines.length, 20, r.out)
    for (const l of lines) { assert.ok([...l].length <= 80, l); assert.doesNotMatch(l, /\x1b/) }
    // F75 + F79: six tabs leave no room at 80 columns for "ops · <repo>" - spread() drops it (draw.test: it shows at 100)
    assert.match(lines[0]!, /^ 1 Tickets   2 Workflows   3 Health   4 Messages   5 Explorer   6 Build$/)
    // F61: every group starts collapsed - its header and count, no rows
    assert.match(r.out, /› ▸ In progress \(1\)\r?\n  ▸ Pending \(1\)\r?\n/)
    assert.doesNotMatch(r.out, /F2  Bulk delete/)
    assert.match(lines.at(-1)!, /^● ops · mem 8\.4 GB · C: 84 GB free · 5h \? · 7d \?/)
    const calls = readFileSync(s.log, 'utf8')
    assert.match(calls, /--machine/)
    assert.match(calls, /list/)
    assert.match(calls, /level/)
    assert.doesNotMatch(calls, /ticket-meta|watchdog|hold|release|queue/)
  })

  test(`${kind}: --once on this repo reads its board and runs read-only; no board, team or hold file touched`, { skip }, () => {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: ops, encoding: 'utf8' }).trim()
    const repo = resolve(common, '..')
    const files = ['TICKETS.md', '.skillator/team.md', '.skillator/watchdog.hold'].map(f => join(repo, f))
    const before = files.map(f => (existsSync(f) ? `${statSync(f).mtimeMs}:${readFileSync(f, 'utf8')}` : 'none'))
    const s = fixtureSkills()
    const r = launch(kind, repo, [...ONCE, '--skills', s.dir, '--tab', 'runs'])
    assert.equal(r.code, 0, r.err)
    const lines = r.out.replace(/\r?\n$/, '').split(/\r?\n/)
    assert.equal(lines.length, 20, r.out)
    assert.match(lines[0]!, /3 Health   4 Messages   5 Explorer   6 Build$/)        // the repo label does not fit at 80 beside six tabs
    assert.match(r.out, /› ● RUN-0099  fixture run +agents · 1\/2 done/)
    assert.match(lines.at(-1)!, /RUN-0099|mem 8\.4 GB/)
    assert.deepEqual(files.map(f => (existsSync(f) ? `${statSync(f).mtimeMs}:${readFileSync(f, 'utf8')}` : 'none')), before)
    assert.doesNotMatch(readFileSync(s.log, 'utf8'), /ticket-meta|watchdog|hold|release|queue/)
  })

  test(`${kind}: a TICKETS.md that is there but will not read names the error, never "no TICKETS.md"`, { skip }, () => {
    const t = mkTmp(join(tmpdir(), 'ops-app-'))
    execFileSync('git', ['init', '-q'], { cwd: t })
    mkdirSync(join(t, 'TICKETS.md'))                  // stat answers, the read fails (EISDIR)
    const r = launch(kind, t, [...ONCE, '--skills', fixtureSkills().dir])
    assert.equal(r.code, 0, r.err)
    assert.doesNotMatch(r.out, /no TICKETS\.md/)
    assert.match(r.out, /TICKETS\.md not loaded: /)
  })

  test(`${kind}: a bad flag is refused by the app, its exit code passed through`, { skip }, () => {
    const r = launch(kind, fixtureRepo(), ['--bogus'])
    assert.equal(r.code, 2)
    assert.match(r.out + r.err, /ops: unknown flag --bogus/)
  })
}

// F89: --open. PATH loses every dir holding a real wt (never launched from a test); `stub`
// puts a wt first that logs its arguments one per line.
function wtEnv(stub: Launcher | null, lad: string): { env: NodeJS.ProcessEnv; log: string } {
  const env = { ...process.env, LOCALAPPDATA: lad }
  const key = Object.keys(env).find(k => k.toUpperCase() === 'PATH') ?? 'PATH'
  const hasWt = (d: string) => { try { return readdirSync(d).some(n => /^wt(\.exe|\.cmd)?$/i.test(n)) } catch { return false } }
  const dirs = (env[key] ?? '').split(';').filter(d => d && !hasWt(d))
  const bin = mkTmp(join(tmpdir(), 'ops-wt-'))
  const log = join(bin, 'wt.log')
  if (stub === 'ps1') writeFileSync(join(bin, 'wt.cmd'), `@echo off\r\nfor %%a in (%*) do >>"${log}" echo(%%~a\r\n`)
  if (stub === 'sh') writeFileSync(join(bin, 'wt'), `#!/bin/sh\nprintf '%s\\n' "$@" > '${log.replace(/\\/g, '/')}'\n`)
  if (stub) dirs.unshift(bin)
  env[key] = dirs.join(';')
  return { env, log }
}

for (const [kind, flag] of [['ps1', '-Open'], ['sh', '--open']] as const) {
  const skip = !win || (kind === 'sh' && !hasSh)
  test(`${kind}: ${flag} with wt on PATH starts the board in a new tab of the current window, the profile when installed`, { skip }, () => {
    const t = fixtureRepo()
    const lad = mkTmp(join(tmpdir(), 'ops-lad-'))
    mkdirSync(join(lad, 'Microsoft/Windows Terminal/Fragments/skillator'), { recursive: true })
    writeFileSync(join(lad, 'Microsoft/Windows Terminal/Fragments/skillator/ops.json'), '{}')
    const { env, log } = wtEnv(kind, lad)
    const r = launch(kind, t, [flag, '--tab', 'health'], env)
    assert.equal(r.code, 0, r.err)
    assert.equal(r.out, '')                                  // nothing drawn here
    const a = readFileSync(log, 'utf8').trim().split(/\r?\n/)
    assert.deepEqual(a.slice(0, 7), ['-w', '0', 'new-tab', '--title', 'ops', '-p', 'skillator ops'])
    assert.equal(a[7], '-d')
    assert.equal(resolve(a[8]!).toLowerCase(), resolve(t).toLowerCase())
    assert.match(a.slice(9).join(' '), kind === 'ps1' ? /^powershell -NoProfile -ExecutionPolicy Bypass -File \S+ops\.ps1 -Repo \S+ --tab health$/ : /sh\.exe \S+\/ops\.sh --tab health$/)
    assert.ok(!a.includes('--open') && !a.includes('-Open'), a.join(' '))
    // no fragment installed: the tab opens in the default profile
    const bare = wtEnv(kind, mkTmp(join(tmpdir(), 'ops-lad-')))
    assert.equal(launch(kind, t, [flag], bare.env).code, 0)
    assert.ok(!readFileSync(bare.log, 'utf8').includes('skillator ops'))
  })
  test(`${kind}: ${flag} with no wt runs the board here, as without it`, { skip }, () => {
    const { env, log } = wtEnv(null, mkTmp(join(tmpdir(), 'ops-lad-')))
    const r = launch(kind, fixtureRepo(), [flag, ...ONCE, '--skills', fixtureSkills().dir], env)
    assert.equal(r.code, 0, r.err)
    assert.equal(r.out.replace(/\r?\n$/, '').split(/\r?\n/).length, 20, r.out)
    assert.ok(!existsSync(log))
  })
}

test('--help prints the usage and the launcher line, exit 0', () => {
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(join(ops, 'loader.mjs')).href, join(ops, 'app.ts'), '--help'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.ok(r.stdout.startsWith(USAGE + '\n'), r.stdout)
  assert.match(r.stdout, /--open/)
})

test('sh launcher refuses an old node with exit 2', { skip: !hasSh }, () => {
  const t = mkTmp(join(tmpdir(), 'ops-node-'))
  mkdirSync(join(t, 'bin'))
  writeFileSync(join(t, 'bin/node'), '#!/bin/sh\n[ "$1" = "-p" ] && echo 20.0.0\n')
  execFileSync('chmod', ['+x', join(t, 'bin/node')])
  const r = launch('sh', t, ['--once'], withPath(join(t, 'bin')))
  assert.equal(r.code, 2)
  assert.match(r.out + r.err, /ops needs node 22\.18 or newer \(found 20\.0\.0\): https:\/\/nodejs\.org/)
})

test('ps1 launcher refuses an old node with exit 2', { skip: !win }, () => {
  const t = mkTmp(join(tmpdir(), 'ops-node-'))
  mkdirSync(join(t, 'bin'))
  writeFileSync(join(t, 'bin/node.cmd'), '@echo 22.17.9\r\n')
  const r = launch('ps1', t, ['--once'], withPath(join(t, 'bin')))
  assert.equal(r.code, 2)
  assert.match(r.out + r.err, /ops needs node 22\.18 or newer \(found 22\.17\.9\): https:\/\/nodejs\.org/)
})

// The live loop without a pty: stdin is a pipe that says it is a TTY and logs raw mode.
const FAKE_TTY = 'data:text/javascript,' + encodeURIComponent(
  "process.stdin.isTTY = true; process.stdin.setRawMode = on => { process.stderr.write('raw:' + on + '\\n'); return process.stdin }")

test('live: alt screen, hidden cursor, raw keys; 2 reads the runs, q quits and restores the terminal', async () => {
  const s = fixtureSkills()
  const child = spawn(process.execPath, ['--import', FAKE_TTY, '--import', pathToFileURL(join(ops, 'loader.mjs')).href, join(ops, 'app.ts'),
    '--cols', '80', '--rows', '20', '--no-color', '--skills', s.dir], { cwd: fixtureRepo() })
  let out = '', err = ''
  child.stderr.setEncoding('utf8').on('data', (d: string) => { err += d })
  const sent = new Set<string>()
  const send = (k: string) => { if (!sent.has(k)) { sent.add(k); child.stdin.write(k) } }
  child.stdout.setEncoding('utf8').on('data', (d: string) => {
    out += d
    if (/▸ In progress \(1\)/.test(out)) send('2')
    if (sent.has('2') && /RUN-0099  fixture run/.test(out)) send('q')
  })
  const timer = setTimeout(() => child.kill(), 60000)
  const code = await new Promise<number | null>(res => child.on('close', c => res(c)))
  clearTimeout(timer)
  assert.equal(code, 0, err + out.slice(-400))
  assert.ok(out.startsWith('\x1b[?1049h\x1b[?25l'), JSON.stringify(out.slice(0, 40)))
  assert.ok(out.endsWith('\x1b[0m\x1b[?25h\x1b[?1049l'), JSON.stringify(out.slice(-40)))
  assert.match(out, /\x1b\[H \x1b\[1;7m1 Tickets\x1b\[0m/)        // F89: --no-color keeps the active tab marked
  assert.match(err, /raw:true[\s\S]*raw:false/)
  assert.doesNotMatch(readFileSync(s.log, 'utf8'), /ticket-meta|watchdog|hold|release|queue/)
})

test('flags: sizes, paint, tab, skills; anything else is an error', () => {
  assert.deepEqual(parseArgs(['--once', '--cols', '90', '--rows', '30', '--no-color', '--ascii', '--skills', '/s', '--tab', 'health']),
    { once: true, cols: 90, rows: 30, color: false, ascii: true, skills: '/s', tab: 'health', error: null })
  assert.equal(parseArgs([], {}).color, true)
  assert.equal(parseArgs([], { NO_COLOR: '1' }).color, false)
  assert.match(parseArgs(['--cols', 'x']).error ?? '', /--cols/)
  assert.match(parseArgs(['--tab', 'bogus']).error ?? '', /--tab/)
  // F76: the Workflows tab (id runs) is --tab workflows; --tab runs stays an alias
  assert.equal(parseArgs(['--tab', 'workflows']).tab, 'runs')
  assert.equal(parseArgs(['--tab', 'runs']).tab, 'runs')
  assert.equal(parseArgs(['--tab', 'bogus']).error, 'ops: --tab is one of tickets, workflows, health, messages, explorer, build, got bogus')
  assert.equal(parseArgs(['--tab', 'agents']).tab, 'runs')          // F93: the agents word opens Workflows
  assert.equal(parseArgs(['--tab', 'build']).tab, 'run')            // F93: Build is tab run; run stays an alias
  assert.equal(parseArgs(['--tab', 'explorer']).tab, 'explorer')
  assert.equal(parseArgs(['--tab', 'run']).tab, 'run')
  assert.match(USAGE, /--tab tickets\|workflows\|health\|messages\|explorer\|build\]$/)
  assert.match(parseArgs(['stray']).error ?? '', /unknown flag stray/)
})

test('keys: readline keypresses become the reducer keys (capitals keep their letter)', () => {
  assert.deepEqual(keyOf('D', { name: 'd', shift: true }), { name: 'D', sequence: 'D', shift: true, ctrl: false })
  assert.deepEqual(keyOf('R', { name: 'r', shift: true }), { name: 'R', sequence: 'R', shift: true, ctrl: false })
  assert.deepEqual(keyOf('1', { name: '1' }), { name: '1', sequence: '1', shift: false, ctrl: false })
  assert.deepEqual(keyOf(undefined, { name: 'up' }), { name: 'up', shift: false, ctrl: false })
  assert.deepEqual(keyOf('\x03', { name: 'c', ctrl: true }), { name: 'c', shift: false, ctrl: true })
  assert.deepEqual(keyOf('\x1b[Z', { name: 'tab', shift: true }), { name: 'tab', shift: true, ctrl: false })
  assert.equal(keyOf('é', undefined)?.name, 'é')
  assert.equal(keyOf(undefined, undefined), null)
  // T7a: the typed character rides along for the Add person form; editing keys by readline's names
  assert.deepEqual(keyOf(' ', { name: 'space' }), { name: 'space', sequence: ' ', shift: false, ctrl: false })
  assert.deepEqual(keyOf('@', undefined), { name: '@', sequence: '@', shift: false, ctrl: false })
  assert.deepEqual(keyOf('\x7f', { name: 'backspace' }), { name: 'backspace', shift: false, ctrl: false })
  assert.deepEqual(keyOf('\x1b[3~', { name: 'delete' }), { name: 'delete', shift: false, ctrl: false })
  assert.deepEqual(keyOf('\t', { name: 'tab' }), { name: 'tab', shift: false, ctrl: false })
  assert.equal(keyOf('\x01', { name: 'a', ctrl: true })?.sequence, undefined)
})
