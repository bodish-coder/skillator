import { test, expect } from 'claude-code/testing'
import type { EngineInterface, ProcessRunInit, ProcessRunResult, FsEntry, SessionRepo, SessionUsage } from 'claude-code'
import { argvFor, findNode, gitBin, isWindows, skillatorRoot, runCall, readUsage } from '../hooks/lib/host'
import type { Call, HostApi } from '../hooks/lib/host'

// Compile-time: the plugin's own `$` is a HostApi, so register passes `$` as is.
export const asHost = ($: EngineInterface): HostApi => $

// A test's `$` is the engine's (the events it raises), not a plugin's: `process.run`,
// `env.get` and `fs.*` are raised only by a plugin's own calls, and register does not
// call this library yet (T5+). So the library is driven through a recorded fake `$`.
type World = {
  root?: string
  env?: Record<string, string>
  exists?: string[]
  files?: Record<string, string>
  dirs?: Record<string, FsEntry[]>
  repo?: SessionRepo | null
  usage?: SessionUsage
  id?: string
  run?: (argv: readonly string[]) => ProcessRunResult
}
type Seen = { runs: { argv: readonly string[]; init?: ProcessRunInit }[]; reads: string[]; lists: string[] }
const ran = (stdout: string, exitCode = 0, stderr = ''): ProcessRunResult =>
  ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false })
const fake = (w: World): [HostApi, Seen] => {
  const seen: Seen = { runs: [], reads: [], lists: [] }
  const $: HostApi = {
    plugin: { root: w.root ?? '/s/mods/ops-board' },
    env: { get: async name => w.env?.[name] },
    process: { run: async (argv, init) => { seen.runs.push({ argv, init }); return (w.run ?? (() => ran('')))(argv) } },
    fs: {
      exists: async p => (w.exists ?? []).includes(p),
      read: async p => { seen.reads.push(p); const t = w.files?.[p]; if (t === undefined) throw new Error('ENOENT ' + p); return t },
      list: async p => { seen.lists.push(p ?? ''); const d = w.dirs?.[p ?? '']; if (!d) throw new Error('ENOENT ' + p); return d },
    },
    session: {
      repo: async () => w.repo ?? null,
      usage: async () => w.usage ?? { startedAt: 0, context: { window: 200000 }, rateLimits: [] },
      id: async () => w.id ?? 'sid-1',
    },
  }
  return [$, seen]
}
// A150: the shells by absolute path - System32's Windows PowerShell (no SystemRoot in
// these worlds: C:/Windows), /bin/sh elsewhere.
const PWSH = 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
const SH = '/bin/sh'
const PS = [PWSH, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File']
const TM = 'tickets-zordon/scripts/ticket-meta'
const PE = 'tickets-zordon/scripts/pending'
const RM = 'relay-morpheus/hooks/relay-morpheus'
const UW = 'watch-cortana/hooks/usage-watch'
const META = '/tickets-zordon/scripts/ticket-meta.sh'

test('argvFor joins the skills dir, no skills/ segment', () => {
  expect(argvFor('pending', false, '/s/skills', [], SH)).toEqual([SH, '/s/skills/' + PE + '.sh'])
  expect(argvFor('meta-assign', true, 'C:/u/.codex/skills', ['F1', '@a'], PWSH)).toEqual([...PS, 'C:/u/.codex/skills/' + TM + '.ps1', 'assign', 'F1', '@a'])
})
test('skillatorRoot: plugin tree -> its skills dir', async () => {
  const [$] = fake({ root: '/s/mods/ops-board', exists: ['/s/skills' + META] })
  expect(await skillatorRoot($)).toBe('/s/skills')
})
test('skillatorRoot: SKILLATOR_ROOT as a repo or as a flat install dest', async () => {
  const [a] = fake({ env: { SKILLATOR_ROOT: '/r' }, exists: ['/r/skills' + META] })
  expect(await skillatorRoot(a)).toBe('/r/skills')
  const [b] = fake({ env: { SKILLATOR_ROOT: '/u/.codex/skills' }, exists: ['/u/.codex/skills' + META] })
  expect(await skillatorRoot(b)).toBe('/u/.codex/skills')
})
test('skillatorRoot: installPath + /skills', async () => {
  const [$] = fake({ env: { HOME: '/h' }, exists: ['C:/c/skills' + META],
    files: { '/h/.claude/plugins/installed_plugins.json': JSON.stringify({ plugins: { 'skillator@skillator': [{ installPath: 'C:\\c' }] } }) } })
  expect(await skillatorRoot($)).toBe('C:/c/skills')
})

test('argvFor: both spellings of every call', () => {
  const cases: [Call, string[], string[], string[]][] = [
    ['pending', [], [`/s/skills/${PE}.sh`], [`C:/s/skills/${PE}.ps1`]],
    ['pending-kv', [], [`/s/skills/${PE}.sh`, '--kv'], [`C:/s/skills/${PE}.ps1`, '--kv']],
    ['pending-machine', [], [`/s/skills/${PE}.sh`, '--machine'], [`C:/s/skills/${PE}.ps1`, '--machine']],
    ['meta-assign', ['F1', '@vidul'], [`/s/skills/${TM}.sh`, 'assign', 'F1', '@vidul'], [`C:/s/skills/${TM}.ps1`, 'assign', 'F1', '@vidul']],
    ['meta-decide', ['F2', '@asha'], [`/s/skills/${TM}.sh`, 'decide', 'F2', '@asha'], [`C:/s/skills/${TM}.ps1`, 'decide', 'F2', '@asha']],
    ['meta-decided', ['F2'], [`/s/skills/${TM}.sh`, 'decided', 'F2'], [`C:/s/skills/${TM}.ps1`, 'decided', 'F2']],
    ['meta-team-add', ['@ravi', 'Ravi Kumar', 'r@x.org,s@y.org'], [`/s/skills/${TM}.sh`, 'team', 'add', '@ravi', 'Ravi Kumar', 'r@x.org,s@y.org'], [`C:/s/skills/${TM}.ps1`, 'team', 'add', '@ravi', 'Ravi Kumar', 'r@x.org,s@y.org']],
    ['meta-team-remove', ['@asha'], [`/s/skills/${TM}.sh`, 'team', 'remove', '@asha'], [`C:/s/skills/${TM}.ps1`, 'team', 'remove', '@asha']],
    ['meta-team-lead', ['@asha'], [`/s/skills/${TM}.sh`, 'team', 'lead', '@asha'], [`C:/s/skills/${TM}.ps1`, 'team', 'lead', '@asha']],
    ['relay-list', [], [`/s/skills/${RM}.sh`, 'list'], [`C:/s/skills/${RM}.ps1`, '-Mode', 'list']],
    // F85 review: read-only - a poll never recreates a removed run worktree
    ['relay-resume', ['RUN-0014'], [`/s/skills/${RM}.sh`, 'resume', 'RUN-0014', '--read-only'],
      [`C:/s/skills/${RM}.ps1`, '-Mode', 'resume', '-Id', 'RUN-0014', '-ReadOnly']],
    ['relay-queue-add', ['RUN-0014'], [`/s/skills/${RM}.sh`, 'queue-run', 'add', 'RUN-0014'],
      [`C:/s/skills/${RM}.ps1`, '-Mode', 'queue-run', '-Sub', 'add', '-Id', 'RUN-0014']],
    ['relay-hold', ['disk 0.8 GB free (below 1 GB)'], [`/s/skills/${RM}.sh`, 'watchdog', 'hold', 'disk 0.8 GB free (below 1 GB)'],
      [`C:/s/skills/${RM}.ps1`, '-Mode', 'watchdog', '-Action', 'hold', '-Reason', 'disk 0.8 GB free (below 1 GB)']],
    ['relay-release', [], [`/s/skills/${RM}.sh`, 'watchdog', 'release'], [`C:/s/skills/${RM}.ps1`, '-Mode', 'watchdog', '-Action', 'release']],
    ['relay-hold-status', [], [`/s/skills/${RM}.sh`, 'watchdog', 'status'], [`C:/s/skills/${RM}.ps1`, '-Mode', 'watchdog', '-Action', 'status']],
    ['relay-decide', ['src=host 5h=41 7d=55 ctx=- max=-'], [`/s/skills/${RM}.sh`, 'chain', 'decide', '--level', 'src=host 5h=41 7d=55 ctx=- max=-'],
      [`C:/s/skills/${RM}.ps1`, '-Mode', 'chain', '-Action', 'decide', '-Text', 'src=host 5h=41 7d=55 ctx=- max=-']],
    ['usage-level', [], [`/s/skills/${UW}.sh`, 'level'], [`C:/s/skills/${UW}.ps1`, '-Mode', 'level']],
    // F98: teams-uhura's first-time setup, its --check pass only (the walk is interactive)
    ['team-setup-check', [], ['/s/skills/teams-uhura/scripts/setup.sh', '--check'], ['C:/s/skills/teams-uhura/scripts/setup.ps1', '--check']],
  ]
  for (const [call, args, sh, ps] of cases) {
    expect(argvFor(call, false, '/s/skills', args, SH)).toEqual([SH, ...sh])
    expect(argvFor(call, true, 'C:/s/skills/', args, PWSH)).toEqual([...PS, ...ps])
  }
  expect(argvFor('meta-assign', true, 'C:/s/skills', ['F1', '@vidul'], PWSH)).toEqual(
    [PWSH, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'C:/s/skills/tickets-zordon/scripts/ticket-meta.ps1', 'assign', 'F1', '@vidul'])
  expect(argvFor('meta-assign', false, '/s/skills', ['F1', '@vidul'], SH)).toEqual(
    [SH, '/s/skills/tickets-zordon/scripts/ticket-meta.sh', 'assign', 'F1', '@vidul'])
  // F104: Diagnose's Close - stage <n> x with the owner cell kept ('' / no -Owner)
  expect(argvFor('relay-stage-landed', false, '/s/skills', ['RUN-0020', '137', 'beef01'], SH)).toEqual([SH, '/s/skills/' + RM + '.sh', 'RUN-0020', 'stage', '137', 'x', '', 'beef01'])
  expect(argvFor('relay-stage-landed', true, 'C:/s/skills', ['RUN-0020', '137', 'beef01'], PWSH)).toEqual([...PS, 'C:/s/skills/' + RM + '.ps1', '-Mode', 'stage', '-Id', 'RUN-0020', '-N', '137', '-State', 'x', '-Landed', 'beef01'])
  expect(argvFor('relay-stage-landed', true, 'C:/s/skills', ['RUN-0020', '137', 'beef01'], PWSH)).not.toContain('-Owner')
})

test('argvFor: F66 teams-uhura calls run the node binary given, by absolute path; the config never rides argv', () => {
  const T = 'teams-uhura/scripts/team.mjs'
  const N = '/usr/bin/node'
  for (const win of [false, true]) {
    expect(argvFor('team-mark-read', win, '/s/skills', ['1729'], N)).toEqual([N, `/s/skills/${T}`, 'inbox', 'mark-read', '--upto', '1729'])
    expect(argvFor('team-config-show', win, '/s/skills', [], N)).toEqual([N, `/s/skills/${T}`, 'config', 'show'])
    expect(argvFor('team-config-save', win, '/s/skills', ['ignored'], N)).toEqual([N, `/s/skills/${T}`, 'config', 'save'])
    expect(argvFor('team-config-clear', win, '/s/skills', [], N)).toEqual([N, `/s/skills/${T}`, 'config', 'clear'])
  }
})

// A bare `node` is searched in the child's cwd first on Windows (libuv): a node.exe
// committed to the repo would run. node is found on PATH, absolute entries only.
test('findNode: PATH only - empty, ".", relative and UNC entries skipped; Windows wants node.exe', async () => {
  const has = (...ps: string[]) => async (p: string) => ps.includes(p)
  expect(await findNode('.:bin:/usr/local/bin:/usr/bin', false, has('/usr/bin/node', './node', 'bin/node'))).toBe('/usr/bin/node')
  expect(await findNode('.:bin::', false, has('./node', 'bin/node'))).toBe(null)
  expect(await findNode('.;tools;\\\\host\\share;"C:\\Program Files\\nodejs"', true,
    has('./node.exe', 'tools/node.exe', '//host/share/node.exe', 'C:/Program Files/nodejs/node.exe'))).toBe('C:/Program Files/nodejs/node.exe')
  expect(await findNode(undefined, true, has('node.exe'))).toBe(null)
})

test('runCall: a node.exe in the repo (the cwd) is never what runs - the PATH one is, or nothing', async () => {
  const [$, seen] = fake({ env: { SKILLATOR_ROOT: '/s', OS: 'Windows_NT', Path: '.;C:\\nodejs' }, repo: { root: 'C:/r', remote: null, internal: false, name: 'r' },
    exists: ['/s/skills' + META, 'C:/r/node.exe', './node.exe', 'C:/nodejs/node.exe'], run: () => ran('{}') })
  await runCall($, 'team-config-show', [])
  expect(seen.runs[0]!.argv[0]).toBe('C:/nodejs/node.exe')
  const [$2, seen2] = fake({ env: { SKILLATOR_ROOT: '/s', PATH: '.:node_modules/.bin' }, repo: { root: '/r', remote: null, internal: false, name: 'r' },
    exists: ['/s/skills' + META, '/r/node', './node', 'node_modules/.bin/node'] })
  const r = await runCall($2, 'team-mark-read', ['1'])
  expect(r.code).toBe(127)
  expect(r.err).toContain('node not found')
  expect(seen2.runs).toHaveLength(0)
})

// A150: a script call never runs a powershell.exe / sh the repo (the child's cwd)
// supplies: argv[0] is System32's Windows PowerShell (SystemRoot honoured) or /bin/sh -
// absolute, outside the repo - whatever the repo or a '.' PATH entry holds.
test('runCall: a powershell.exe / sh in the repo (the cwd) is never what runs', async () => {
  const [$, seen] = fake({ env: { SKILLATOR_ROOT: '/s', OS: 'Windows_NT', Path: '.;C:\\r' }, repo: { root: 'C:/r', remote: null, internal: false, name: 'r' },
    exists: ['/s/skills' + META, 'C:/r/powershell.exe', './powershell.exe', 'C:/r/sh.exe'], run: () => ran('') })
  await runCall($, 'pending-machine', [])
  expect(seen.runs[0]!.argv[0]).toBe(PWSH)
  expect(seen.runs[0]!.init?.cwd).toBe('C:/r')
  const [$2, seen2] = fake({ env: { SKILLATOR_ROOT: '/s', OS: 'Windows_NT', SystemRoot: 'D:\\Win' }, repo: { root: 'C:/r', remote: null, internal: false, name: 'r' },
    exists: ['/s/skills' + META], run: () => ran('') })
  await runCall($2, 'relay-list', [])
  expect(seen2.runs[0]!.argv[0]).toBe('D:/Win/System32/WindowsPowerShell/v1.0/powershell.exe')
  const [$3, seen3] = fake({ env: { SKILLATOR_ROOT: '/s', PATH: '.::/r' }, repo: { root: '/r', remote: null, internal: false, name: 'r' },
    exists: ['/s/skills' + META, '/r/sh', './sh'], run: () => ran('') })
  await runCall($3, 'pending', [])
  expect(seen3.runs[0]!.argv[0]).toBe(SH)
})

test('gitBin: Windows - git.exe from an absolute PATH entry, else none; elsewhere git', async () => {
  const [$] = fake({ env: { OS: 'Windows_NT', Path: '.;tools;C:\\Git\\cmd' }, exists: ['./git.exe', 'tools/git.exe', 'C:/Git/cmd/git.exe'] })
  expect(await gitBin($)).toBe('C:/Git/cmd/git.exe')
  const [$2] = fake({ env: { OS: 'Windows_NT', Path: '.;tools' }, exists: ['./git.exe', 'tools/git.exe'] })
  expect(await gitBin($2)).toBe(null)
  const [$3] = fake({ env: { PATH: '/usr/bin' } })
  expect(await gitBin($3)).toBe('git')
})

test('runCall: stdin reaches the process (the setup form\'s values), never argv', async () => {
  const [$, seen] = fake({ env: { SKILLATOR_ROOT: '/s', PATH: '/usr/bin' }, exists: ['/s/skills' + META, '/usr/bin/node'], run: () => ran('saved') })
  const r = await runCall($, 'team-config-save', [], '{"token":"c2VjcmV0"}')
  expect(r.code).toBe(0)
  expect(seen.runs[0]!.argv[0]).toBe('/usr/bin/node')
  expect(seen.runs[0]!.init?.stdin).toBe('{"token":"c2VjcmV0"}')
  expect(seen.runs[0]!.argv.join(' ')).not.toContain('c2VjcmV0')
})

test('isWindows: OS=Windows_NT, anything else is not', async () => {
  expect(await isWindows(fake({ env: { OS: 'Windows_NT' } })[0])).toBe(true)
  expect(await isWindows(fake({ env: { HOME: '/h' } })[0])).toBe(false)
})

test('skillatorRoot: SKILLATOR_ROOT first', async () => {
  const [$] = fake({ env: { SKILLATOR_ROOT: 'D:\\sk\\', HOME: '/h' }, exists: ['D:/sk/skills' + META, '/s/skills' + META] })
  expect(await skillatorRoot($)).toBe('D:/sk/skills')
})
test('skillatorRoot: the plugin folder two up; never the session repo (A136)', async () => {
  const env = { SKILLATOR_ROOT: '/nowhere', HOME: '/h' }, exists = ['C:/x/skillator/skills' + META, '/r/skills' + META]
  expect(await skillatorRoot(fake({ env, exists, root: 'C:\\x\\skillator\\mods\\ops-board' })[0])).toBe('C:/x/skillator/skills')
  // a repo opened in the session that ships the scripts is not trusted to run them
  expect(await skillatorRoot(fake({ env, exists, root: '/elsewhere/mods/ops-board' })[0])).toBe(null)
})
test('skillatorRoot: installed_plugins.json of the config dir', async () => {
  const [$, seen] = fake({
    root: '/elsewhere/mods/ops-board',
    env: { CLAUDE_CONFIG_DIR: 'C:\\Users\\i\\.claude-v', HOME: '/h' },
    exists: ['C:/Users/i/.claude-v/plugins/cache/skillator/skillator/4.8.1/skills' + META],
    files: { 'C:/Users/i/.claude-v/plugins/installed_plugins.json': JSON.stringify({ version: 2, plugins: {
      'other@x': [{ installPath: 'C:\\o' }],
      'skillator@skillator': [{ scope: 'project', installPath: 'C:\\gone' },
        { scope: 'user', installPath: 'C:\\Users\\i\\.claude-v\\plugins\\cache\\skillator\\skillator\\4.8.1' }] } }) },
  })
  expect(await skillatorRoot($)).toBe('C:/Users/i/.claude-v/plugins/cache/skillator/skillator/4.8.1/skills')
  expect(seen.reads).toEqual(['C:/Users/i/.claude-v/plugins/installed_plugins.json'])
})
test('skillatorRoot: HOME/.claude without CLAUDE_CONFIG_DIR; nothing found is null', async () => {
  const [$, seen] = fake({ root: '/elsewhere/mods/ops-board', env: { HOME: '/h' } })
  expect(await skillatorRoot($)).toBe(null)
  expect(seen.reads).toEqual(['/h/.claude/plugins/installed_plugins.json'])
  const bad = fake({ root: '/e/mods/ops-board', env: { HOME: '/h' }, files: { '/h/.claude/plugins/installed_plugins.json': 'not json' } })[0]
  expect(await skillatorRoot(bad)).toBe(null)
})

const repo = (root: string): SessionRepo => ({ root, remote: null, internal: false, name: null })

test('runCall: sh form, cwd the main checkout, argv returned', async () => {
  const [$, seen] = fake({ env: { HOME: '/h' }, exists: ['/s/skills' + META], repo: repo('/r'), run: () => ran('watchdog: held x\n') })
  const r = await runCall($, 'relay-hold', ['disk 0.8 GB free (below 1 GB)'])
  expect(seen.runs.length).toBe(1)
  expect(seen.runs[0]!.argv).toEqual([SH, `/s/skills/${RM}.sh`, 'watchdog', 'hold', 'disk 0.8 GB free (below 1 GB)'])
  expect(seen.runs[0]!.init).toEqual({ cwd: '/r', timeoutMs: 30000 })
  expect(r).toEqual({ code: 0, out: 'watchdog: held x\n', err: '', argv: seen.runs[0]!.argv })
})
test('runCall: ps1 form on Windows; --machine has a 15 s budget; stderr and exit code kept', async () => {
  const [$, seen] = fake({
    root: 'C:\\s\\mods\\ops-board', env: { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\i' }, exists: ['C:/s/skills' + META],
    repo: repo('C:\\r'), run: () => ran('', 2, 'pending: no TICKETS.md'),
  })
  const r = await runCall($, 'pending-machine', [])
  expect(seen.runs[0]!.argv).toEqual([...PS, `C:/s/skills/${PE}.ps1`, '--machine'])
  expect(seen.runs[0]!.init).toEqual({ cwd: 'C:\\r', timeoutMs: 15000 })
  expect([r.code, r.out, r.err]).toEqual([2, '', 'pending: no TICKETS.md'])
})
test('runCall: outside a repo the session cwd is used', async () => {
  const [$, seen] = fake({ exists: ['/s/skills' + META], repo: null })
  await runCall($, 'relay-list', [])
  expect(seen.runs[0]!.init).toEqual({ timeoutMs: 30000 })
})
test('runCall: a command that cannot start or times out resolves code -1', async () => {
  const [$] = fake({ exists: ['/s/skills' + META], run: () => { throw new Error('timed out after 30000 ms') } })
  expect(await runCall($, 'pending', [])).toEqual({ code: -1, out: '', err: 'timed out after 30000 ms', argv: [SH, `/s/skills/${PE}.sh`] })
})
test('runCall: no scripts found runs nothing and says how to fix it', async () => {
  const [$, seen] = fake({ root: '/elsewhere/mods/ops-board', env: { HOME: '/h' } })
  const r = await runCall($, 'pending', [])
  expect(seen.runs.length).toBe(0)
  expect(r).toEqual({ code: 127, out: '', err: 'skillator scripts not found - set SKILLATOR_ROOT', argv: [] })
})
test('runCall: a session repo that ships the scripts is never run from (A136)', async () => {
  const [$, seen] = fake({ root: '/elsewhere/mods/ops-board', env: { HOME: '/h' }, exists: ['/evil/skills' + META],
    repo: { root: '/evil' } as SessionRepo })
  const r = await runCall($, 'pending', [])
  expect(seen.runs.length).toBe(0)
  expect(r.code).toBe(127)
})

const NOW = 1_800_000_000_000
const entry = (name: string, mtimeMs: number): FsEntry => ({ name, kind: 'file', size: 3, mtimeMs } as FsEntry)
test('readUsage: the host reading first; flag files untouched', async () => {
  const [$, seen] = fake({ env: { HOME: '/h' }, usage: { startedAt: 0, context: { window: 200000 }, rateLimits: [
    { kind: 'five_hour', percentUsed: 41, resetsAt: '2026-10-18T14:20:00Z' }, { kind: 'seven_day', percentUsed: 55 }], cost: { usd: 1.23 } } })
  const u = await readUsage($, NOW)
  expect([seen.lists, seen.reads]).toEqual([[], []])
  expect(u.five).toEqual({ pct: 41, resetsAt: '2026-10-18T14:20:00Z', source: 'host', at: NOW })
  expect(u.seven?.pct).toBe(55)
  expect(u.costUsd).toBe(1.23)
})
test('readUsage: no host reading, this session only: its watch-cortana files', async () => {
  const [$, seen] = fake({
    env: { HOME: '/h' }, id: 'sid-1',
    dirs: { '/h/.claude/handoff-watch': [entry('other', NOW), entry('other.weekly', NOW), entry('sid-1.weekly', NOW - 3 * 3600_000), entry('sid-1.done', NOW)] },
    files: { '/h/.claude/handoff-watch/sid-1.weekly': '55\r\n', '/h/.claude/handoff-watch/other': '99' },
  })
  const u = await readUsage($, NOW)
  expect(seen.reads).toEqual(['/h/.claude/handoff-watch/sid-1.weekly'])
  expect(u.five).toBe(null)
  expect(u.seven).toEqual({ pct: 55, resetsAt: null, source: 'watch-cortana', at: NOW - 3 * 3600_000 })
})
test('readUsage: another session file is never read; CLAUDE_USAGE_WATCH_DIR wins', async () => {
  const [$, seen] = fake({ env: { HOME: '/h', CLAUDE_USAGE_WATCH_DIR: '/w' }, id: 'sid-1', dirs: { '/w': [entry('sid-2', NOW), entry('sid-2.weekly', NOW)] } })
  const u = await readUsage($, NOW)
  expect([u.five, u.seven, seen.reads, seen.lists]).toEqual([null, null, [], ['/w']])
})
test('readUsage: CLAUDE_CONFIG_DIR/handoff-watch is read when CLAUDE_USAGE_WATCH_DIR is unset', async () => {
  const [$, seen] = fake({
    env: { HOME: '/h', CLAUDE_CONFIG_DIR: 'C:\\cfg\\prof' }, id: 'sid-1',
    dirs: { 'C:/cfg/prof/handoff-watch': [entry('sid-1', NOW)], '/h/.claude/handoff-watch': [entry('sid-1', NOW)] },
    files: { 'C:/cfg/prof/handoff-watch/sid-1': '41', '/h/.claude/handoff-watch/sid-1': '99' },
  })
  const u = await readUsage($, NOW)
  expect(seen.lists).toEqual(['C:/cfg/prof/handoff-watch'])
  expect(u.five?.pct).toBe(41)
})
test('readUsage: CLAUDE_USAGE_WATCH_DIR still wins over CLAUDE_CONFIG_DIR', async () => {
  const [$, seen] = fake({ env: { HOME: '/h', CLAUDE_CONFIG_DIR: '/cfg', CLAUDE_USAGE_WATCH_DIR: '/w' }, id: 'sid-1', dirs: { '/w': [], '/cfg/handoff-watch': [entry('sid-1', NOW)] } })
  await readUsage($, NOW)
  expect(seen.lists).toEqual(['/w'])
})
test('readUsage: no flag dir at all is not observed', async () => {
  const [$] = fake({ env: { HOME: '/h' } })
  const u = await readUsage($, NOW)
  expect([u.five, u.seven]).toEqual([null, null])
})
