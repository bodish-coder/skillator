import { test, expect } from 'claude-code/testing'
import type { EngineInterface, ProcessRunInit, ProcessRunResult, FsEntry, SessionRepo, SessionUsage } from 'claude-code'
import { argvFor, isWindows, skillatorRoot, runCall, readUsage } from '../hooks/lib/host'
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
const PS = ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File']
const TM = 'skills/tickets-zordon/scripts/ticket-meta'
const PE = 'skills/tickets-zordon/scripts/pending'
const RM = 'skills/relay-morpheus/hooks/relay-morpheus'
const META = '/skills/tickets-zordon/scripts/ticket-meta.sh'

test('argvFor: both spellings of every call', () => {
  const cases: [Call, string[], string[], string[]][] = [
    ['pending', [], [`/s/${PE}.sh`], [`C:/s/${PE}.ps1`]],
    ['pending-kv', [], [`/s/${PE}.sh`, '--kv'], [`C:/s/${PE}.ps1`, '--kv']],
    ['pending-machine', [], [`/s/${PE}.sh`, '--machine'], [`C:/s/${PE}.ps1`, '--machine']],
    ['meta-assign', ['F1', '@vidul'], [`/s/${TM}.sh`, 'assign', 'F1', '@vidul'], [`C:/s/${TM}.ps1`, 'assign', 'F1', '@vidul']],
    ['meta-decide', ['F2', '@asha'], [`/s/${TM}.sh`, 'decide', 'F2', '@asha'], [`C:/s/${TM}.ps1`, 'decide', 'F2', '@asha']],
    ['meta-decided', ['F2'], [`/s/${TM}.sh`, 'decided', 'F2'], [`C:/s/${TM}.ps1`, 'decided', 'F2']],
    ['meta-team-add', ['@ravi', 'Ravi Kumar', 'r@x.org,s@y.org'], [`/s/${TM}.sh`, 'team', 'add', '@ravi', 'Ravi Kumar', 'r@x.org,s@y.org'], [`C:/s/${TM}.ps1`, 'team', 'add', '@ravi', 'Ravi Kumar', 'r@x.org,s@y.org']],
    ['meta-team-remove', ['@asha'], [`/s/${TM}.sh`, 'team', 'remove', '@asha'], [`C:/s/${TM}.ps1`, 'team', 'remove', '@asha']],
    ['relay-list', [], [`/s/${RM}.sh`, 'list'], [`C:/s/${RM}.ps1`, '-Mode', 'list']],
    ['relay-chain-status', ['RUN-0014'], [`/s/${RM}.sh`, 'RUN-0014', 'chain', 'status'],
      [`C:/s/${RM}.ps1`, '-Mode', 'chain', '-Action', 'status', '-Id', 'RUN-0014']],
    ['relay-queue-add', ['RUN-0014'], [`/s/${RM}.sh`, 'queue-run', 'add', 'RUN-0014'],
      [`C:/s/${RM}.ps1`, '-Mode', 'queue-run', '-Sub', 'add', '-Id', 'RUN-0014']],
    ['relay-hold', ['disk 0.8 GB free (below 1 GB)'], [`/s/${RM}.sh`, 'watchdog', 'hold', 'disk 0.8 GB free (below 1 GB)'],
      [`C:/s/${RM}.ps1`, '-Mode', 'watchdog', '-Action', 'hold', '-Reason', 'disk 0.8 GB free (below 1 GB)']],
    ['relay-release', [], [`/s/${RM}.sh`, 'watchdog', 'release'], [`C:/s/${RM}.ps1`, '-Mode', 'watchdog', '-Action', 'release']],
    ['relay-hold-status', [], [`/s/${RM}.sh`, 'watchdog', 'status'], [`C:/s/${RM}.ps1`, '-Mode', 'watchdog', '-Action', 'status']],
    ['relay-decide', ['src=host 5h=41 7d=55 ctx=- max=-'], [`/s/${RM}.sh`, 'chain', 'decide', '--level', 'src=host 5h=41 7d=55 ctx=- max=-'],
      [`C:/s/${RM}.ps1`, '-Mode', 'chain', '-Action', 'decide', '-Text', 'src=host 5h=41 7d=55 ctx=- max=-']],
  ]
  for (const [call, args, sh, ps] of cases) {
    expect(argvFor(call, false, '/s', args)).toEqual(['sh', ...sh])
    expect(argvFor(call, true, 'C:/s/', args)).toEqual([...PS, ...ps])
  }
  expect(argvFor('meta-assign', true, 'C:/s', ['F1', '@vidul'])).toEqual(
    ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'C:/s/skills/tickets-zordon/scripts/ticket-meta.ps1', 'assign', 'F1', '@vidul'])
  expect(argvFor('meta-assign', false, '/s', ['F1', '@vidul'])).toEqual(
    ['sh', '/s/skills/tickets-zordon/scripts/ticket-meta.sh', 'assign', 'F1', '@vidul'])
})

test('isWindows: OS=Windows_NT, anything else is not', async () => {
  expect(await isWindows(fake({ env: { OS: 'Windows_NT' } })[0])).toBe(true)
  expect(await isWindows(fake({ env: { HOME: '/h' } })[0])).toBe(false)
})

test('skillatorRoot: SKILLATOR_ROOT first', async () => {
  const [$] = fake({ env: { SKILLATOR_ROOT: 'D:\\sk\\', HOME: '/h' }, exists: ['D:/sk' + META, '/s' + META] })
  expect(await skillatorRoot($)).toBe('D:/sk')
})
test('skillatorRoot: the plugin folder two up; never the session repo (A136)', async () => {
  const env = { SKILLATOR_ROOT: '/nowhere', HOME: '/h' }, exists = ['C:/x/skillator' + META, '/r' + META]
  expect(await skillatorRoot(fake({ env, exists, root: 'C:\\x\\skillator\\mods\\ops-board' })[0])).toBe('C:/x/skillator')
  // a repo opened in the session that ships the scripts is not trusted to run them
  expect(await skillatorRoot(fake({ env, exists, root: '/elsewhere/mods/ops-board' })[0])).toBe(null)
})
test('skillatorRoot: installed_plugins.json of the config dir', async () => {
  const [$, seen] = fake({
    root: '/elsewhere/mods/ops-board',
    env: { CLAUDE_CONFIG_DIR: 'C:\\Users\\i\\.claude-v', HOME: '/h' },
    exists: ['C:/Users/i/.claude-v/plugins/cache/skillator/skillator/4.8.1' + META],
    files: { 'C:/Users/i/.claude-v/plugins/installed_plugins.json': JSON.stringify({ version: 2, plugins: {
      'other@x': [{ installPath: 'C:\\o' }],
      'skillator@skillator': [{ scope: 'project', installPath: 'C:\\gone' },
        { scope: 'user', installPath: 'C:\\Users\\i\\.claude-v\\plugins\\cache\\skillator\\skillator\\4.8.1' }] } }) },
  })
  expect(await skillatorRoot($)).toBe('C:/Users/i/.claude-v/plugins/cache/skillator/skillator/4.8.1')
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
  const [$, seen] = fake({ env: { HOME: '/h' }, exists: ['/s' + META], repo: repo('/r'), run: () => ran('watchdog: held x\n') })
  const r = await runCall($, 'relay-hold', ['disk 0.8 GB free (below 1 GB)'])
  expect(seen.runs.length).toBe(1)
  expect(seen.runs[0]!.argv).toEqual(['sh', `/s/${RM}.sh`, 'watchdog', 'hold', 'disk 0.8 GB free (below 1 GB)'])
  expect(seen.runs[0]!.init).toEqual({ cwd: '/r', timeoutMs: 30000 })
  expect(r).toEqual({ code: 0, out: 'watchdog: held x\n', err: '', argv: seen.runs[0]!.argv })
})
test('runCall: ps1 form on Windows; --machine has a 15 s budget; stderr and exit code kept', async () => {
  const [$, seen] = fake({
    root: 'C:\\s\\mods\\ops-board', env: { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\i' }, exists: ['C:/s' + META],
    repo: repo('C:\\r'), run: () => ran('', 2, 'pending: no TICKETS.md'),
  })
  const r = await runCall($, 'pending-machine', [])
  expect(seen.runs[0]!.argv).toEqual([...PS, `C:/s/${PE}.ps1`, '--machine'])
  expect(seen.runs[0]!.init).toEqual({ cwd: 'C:\\r', timeoutMs: 15000 })
  expect([r.code, r.out, r.err]).toEqual([2, '', 'pending: no TICKETS.md'])
})
test('runCall: outside a repo the session cwd is used', async () => {
  const [$, seen] = fake({ exists: ['/s' + META], repo: null })
  await runCall($, 'relay-list', [])
  expect(seen.runs[0]!.init).toEqual({ timeoutMs: 30000 })
})
test('runCall: a command that cannot start or times out resolves code -1', async () => {
  const [$] = fake({ exists: ['/s' + META], run: () => { throw new Error('timed out after 30000 ms') } })
  expect(await runCall($, 'pending', [])).toEqual({ code: -1, out: '', err: 'timed out after 30000 ms', argv: ['sh', `/s/${PE}.sh`] })
})
test('runCall: no scripts found runs nothing and says how to fix it', async () => {
  const [$, seen] = fake({ root: '/elsewhere/mods/ops-board', env: { HOME: '/h' } })
  const r = await runCall($, 'pending', [])
  expect(seen.runs.length).toBe(0)
  expect(r).toEqual({ code: 127, out: '', err: 'skillator scripts not found - set SKILLATOR_ROOT', argv: [] })
})
test('runCall: a session repo that ships the scripts is never run from (A136)', async () => {
  const [$, seen] = fake({ root: '/elsewhere/mods/ops-board', env: { HOME: '/h' }, exists: ['/evil' + META],
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
