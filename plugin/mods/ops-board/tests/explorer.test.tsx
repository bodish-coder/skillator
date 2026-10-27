import { test, expect, mock } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'
import type { Engine, MockClock, Plugin } from 'claude-code/testing'
import { ACTION_ARGS, COMMITS, EMPTY, explorerLines, INCOMING, isRunRef, parseCount, planAction, toggle, withIncoming, withLog,
  withUpstream } from '../hooks/lib/explorer'

// F75: the Explorer tab - the project's git-tracked files as a tree and the recent
// commits, each opening to the files it changed. Read-only; git by the mod's own
// absolute-path helper (A150), never a bare `git` on Windows. Sections, folders and
// commits open and close as F61's groups; only what is drawn is held (B4).

const SHA1 = '1234567' + 'a'.repeat(33)
const SHA2 = '89abcde' + 'b'.repeat(33)
const FILES = ['README.md', 'mods/a/x.ts', 'mods/a/y.ts', 'mods/b.ts'].join('\0') + '\0'
const LOG = `${SHA1}\x1f1234567\x1f2026-10-24\x1fVidul\x1fF75: explorer\n${SHA2}\x1f89abcde\x1f2026-10-23\x1fAsha\x1fF74: rename\n`
const CH1 = ':100644 100644 aaa bbb M\tmods/a/x.ts\n:000000 100644 000 ccc A\tmods/b.ts\n:100644 000000 ddd 000 D\told.md\n\n3\t1\tmods/a/x.ts\n10\t0\tmods/b.ts\n0\t4\told.md\n'
const CH2 = ':100644 100644 eee eee R100\tsrc/old.ts\tsrc/new.ts\n:100644 100644 fff 111 M\tlogo.png\n\n0\t0\tsrc/{old.ts => new.ts}\n-\t-\tlogo.png\n'

const SHA3 = 'fedcba9' + 'c'.repeat(33)          // F103: the upstream's commit HEAD has not

// F103: `actions` records the argv of every fetch/pull/push/revert/merge run; each answers `actionResult`.
type World = { runs: { argv: readonly string[]; cwd?: string; env?: Record<string, string> }[]; git: (args: readonly string[]) => ProcessRunResult
  exes: string[]; actions: string[][]; actionResult: ProcessRunResult | string; dirty: string; branch: string; head: string; pushTo: string
  root: string; toasts: string[]; repoFails: boolean; existsFails: boolean }
const ran = (stdout: string, exitCode = 0, stderr = ''): ProcessRunResult =>
  ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false })

const answer = (args: readonly string[]): ProcessRunResult => {
  const a = args.join(' ')
  if (a === 'config user.email') return ran('vidul@ikran.in\n')
  if (a.includes('ls-files')) return ran(FILES)
  if (a === 'rev-parse --abbrev-ref @{upstream}') return ran('origin/main\n')
  if (a.startsWith('rev-list --left-right --count')) return ran('1\t1\n')
  if (a.includes('HEAD..@{upstream}')) return ran(`${SHA3}\x1ffedcba9\x1f2026-10-26\x1fAsha\x1fF100: incoming\n`)
  if (a.includes(SHA1)) return ran(CH1)
  if (a.includes(SHA2)) return ran(CH2)
  if (a.includes(SHA3)) return ran(CH1)
  if (a.includes(' log ')) return ran(LOG)
  return ran('', 1, 'not in this test')
}
const ACTION = /^(fetch|pull|push|revert|merge)$/

function world(on: On, env: Record<string, string> = {}): [World, MockClock] {
  const w: World = { runs: [], git: answer, exes: [], actions: [], actionResult: ran('Already up to date.\n'), dirty: '', branch: 'main', head: SHA1,
    pushTo: 'origin\trefs/heads/main', root: '/r', toasts: [], repoFails: false, existsFails: false }
  // the reads an action plan needs, from the world; the actions themselves recorded, never run
  // a string: the host rejecting the run (a timeout)
  const local = (args: readonly string[]): ProcessRunResult | string => {
    const a = args.join(' ')
    if (ACTION.test(args[0] ?? '')) { w.actions.push([...args]); return w.actionResult }
    if (a === 'rev-parse --abbrev-ref HEAD') return ran(w.branch + '\n')
    if (a === 'rev-parse HEAD') return ran(w.head + '\n')
    if (a === 'rev-parse --absolute-git-dir') return ran('/r/.git\n')
    if (a.startsWith('for-each-ref')) return ran(w.pushTo + '\n')
    if (a.startsWith('status --porcelain')) return ran(w.dirty)
    if (a.startsWith('branch --format')) return ran('main\nfeature/x\nrun/RUN-0021-y\n')
    return w.git(args)
  }
  const files: Record<string, string> = { '/r/TICKETS.md': '# Tickets\n\n## Open\n\n- [ ] F1 — one\n' }
  const at = (p: string) => files[p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')]
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.env(on, env)
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.repo', () => (w.repoFails ? { deny: 'repo read failed' } : { value: { root: w.root, remote: null, internal: false, name: 'r' } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('fs.stat', ($, e) => {
    const f = at(e.path)
    return f !== undefined ? { value: { kind: 'file' as const, size: f.length, mtimeMs: 1000, isLink: false } } : { deny: 'ENOENT ' + e.path }
  })
  on('fs.exists', ($, e) => w.existsFails ? { deny: 'EIO ' + e.path } : ({ value:at(e.path) !== undefined || w.exes.includes(e.path.replace(/\\/g, '/'))
    || w.exes.includes(e.path.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')) }))
  on('fs.read', ($, e) => {
    const f = at(e.path)
    return f !== undefined ? { value: f } : { deny: 'ENOENT ' + e.path }
  })
  on('fs.list', ($, e) => ({ deny: 'ENOENT ' + e.path }))
  on('process.run', ($, e) => {
    w.runs.push({ argv: e.argv, cwd: e.init?.cwd, env: e.init?.env })
    const v = /(^|\/)git(\.exe)?$/.test(e.argv[0] ?? '') ? local(e.argv.slice(1)) : ran('', 1, 'not in this test')
    return typeof v === 'string' ? { deny: v } : { value: v }
  })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', ($, e) => { w.toasts.push(e.text); return { value: undefined } })
  on('ui.status', () => ({ value: undefined }))
  on('ui.scroll', () => ({}))
  on('ui.focus', () => ({}))
  return [w, clock]
}

const PEEK: Plugin = {
  name: 'peek',
  register(on) {
    on('command.run', { command: 'close' }, async ($, e) => { await $.ui.close({ id: e.args }); return { text: 'closed' } })
    on('command.run', { command: 'peek' }, async ($, e) => {
      const v = e.args === 'explorer' ? await $.state.get({ plugin: 'ops-board', key: 'explorer' })
        : e.args === 'tab' ? await $.state.get({ plugin: 'ops-board', key: 'tab' })
        : await $.state.get({ plugin: 'ops-board', key: 'selected' })
      return { text: JSON.stringify(v.value ?? null) }
    })
  },
}
const WITH = { plugins: [PEEK] }
const RUN = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
const peek = async ($: Engine, key: string) => JSON.parse((await $.command.run({ command: 'peek', args: key, ...RUN })).text ?? 'null') as unknown
const SURFACES = ['terminal', 'desktop'] as const

async function start($: Engine, clock: MockClock) {
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.settle()
}
async function mountExplorer($: Engine, clock: MockClock, surface: (typeof SURFACES)[number], bodyColumns = 54) {
  const ui = await $.ui.mount({ plugin: 'ops-board', surface, component: 'Pane', requestId: 'ops-board',
    props: { title: 'ops board', isFocused: true, bodyColumns, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} } })
  await ui.press({ key: 'tab:explorer' })
  await clock.settle()
  return ui
}
const gitRuns = (w: World) => w.runs.filter(r => /(^|\/)git(\.exe)?$/.test(r.argv[0] ?? '') && !r.argv.includes('user.email'))

for (const surface of SURFACES) {
  test(`${surface}: the tree - sections start collapsed, folders open to their files, counts on every folder`, WITH, async ($, on) => {
    const [w, clock] = world(on)
    await start($, clock)
    const ui = await mountExplorer($, clock, surface)
    const text = async (key: string) => (await ui.find({ key }))?.text
    expect(await text('xs:files')).toBe('▸ Files (4)')
    expect(await text('xs:commits')).toBe('▸ Commits (2)  ↑1 ↓1 vs origin/main')
    expect(await ui.find({ key: 'xd:mods' })).toBeUndefined()
    await ui.press({ key: 'xs:files' })
    await clock.settle()
    expect(await text('xs:files')).toBe('▾ Files (4)')
    expect(await text('xd:mods')).toBe('  ▸ mods/ (3)')
    expect(await text('xf:README.md')).toBe('    README.md')
    expect(await ui.find({ key: 'xf:mods/b.ts' })).toBeUndefined()
    await ui.press({ key: 'xd:mods' })
    await clock.settle()
    expect(await text('xd:mods')).toBe('  ▾ mods/ (3)')
    expect(await text('xd:mods/a')).toBe('    ▸ a/ (2)')
    expect(await text('xf:mods/b.ts')).toBe('      b.ts')
    await ui.press({ key: 'xd:mods/a' })
    await clock.settle()
    expect(await text('xf:mods/a/x.ts')).toBe('        x.ts')
    // every git run: the repo's cwd, `git ls-files` (it respects .gitignore), no shell
    for (const r of gitRuns(w)) { expect(r.argv[0]).toBe('git'); expect(r.cwd).toBe('/r') }
    expect(gitRuns(w).some(r => r.argv.includes('ls-files'))).toBe(true)
    await ui.unmount()
  })

  test(`${surface}: the commits - each opens to its files, A/M/D/R coloured with +/- counts, read only when opened`, WITH, async ($, on) => {
    const [w, clock] = world(on)
    await start($, clock)
    const ui = await mountExplorer($, clock, surface, 60)
    const text = async (key: string) => (await ui.find({ key }))?.text
    await ui.press({ key: 'xs:commits' })
    await clock.settle()
    expect(await text('xc:' + SHA1)).toBe('  ▸ 1234567  2026-10-24  F75: explorer')
    expect(await text('xc:' + SHA2)).toBe('  ▸ 89abcde  2026-10-23  F74: rename')
    expect(gitRuns(w).filter(r => r.argv.includes(SHA1))).toHaveLength(0)      // lazy: not read until opened
    const log = gitRuns(w).find(r => r.argv.includes('log') && !r.argv.includes('-1'))!
    expect(log.argv).toContain('-n40')                                         // a bounded number of commits
    await ui.press({ key: 'xc:' + SHA1 })
    await clock.settle()
    expect(await text('xc:' + SHA1)).toBe('  ▾ 1234567  2026-10-24  F75: explorer')
    expect(await text(`xch:${SHA1}:0`)).toBe('      M  mods/a/x.ts  +3 -1')
    expect(await text(`xch:${SHA1}:1`)).toBe('      A  mods/b.ts  +10 -0')
    expect(await text(`xch:${SHA1}:2`)).toBe('      D  old.md  +0 -4')
    const shown = JSON.stringify(await ui.find({ key: `xch:${SHA1}:1` }))
    expect(shown).toContain('"color":"success"')
    expect(JSON.stringify(await ui.find({ key: `xch:${SHA1}:2` }))).toContain('"color":"error"')
    const one = gitRuns(w).find(r => r.argv.includes(SHA1))!
    expect(one.argv).toEqual(expect.arrayContaining(['log', '-1', '--numstat', '--raw', SHA1]))
    await ui.press({ key: 'xc:' + SHA2 })
    await clock.settle()
    expect(await text(`xch:${SHA2}:0`)).toBe('      R  src/old.ts → src/new.ts  +0 -0')
    expect(await text(`xch:${SHA2}:1`)).toBe('      M  logo.png  binary')
    // closed again: its files go from the pane's state too (B4: only what is drawn is held)
    await ui.press({ key: 'xc:' + SHA1 })
    await clock.settle()
    expect(await ui.find({ key: `xch:${SHA1}:0` })).toBeUndefined()
    const held = await peek($, 'explorer') as { changes: Record<string, unknown> }
    expect(Object.keys(held.changes)).toEqual([SHA2])
    await ui.unmount()
  })
}

test('arrows walk the sections, folders, files and commits; the selection is drawn inverse; Enter is the press', WITH, async ($, on) => {
  const [, clock] = world(on)
  await start($, clock)
  const ui = await mountExplorer($, clock, 'terminal')
  const arrow = (by: number) => $.ui.scroll({ component: 'Pane', requestId: 'ops-board', offset: 0, by,
    bodyRows: 40, contentRows: 30, origin: { kind: 'person' } })
  const inv = async (k: string) => JSON.stringify(await ui.find({ key: k })).includes('"inverse":true')
  expect(await inv('xs:files')).toBe(true)                  // the first item is the selection
  await arrow(1)
  expect((await peek($, 'explorer') as { selected: string }).selected).toBe('xs:commits')
  expect(await inv('xs:commits')).toBe(true)
  await arrow(-1)
  await ui.press({ key: 'xs:files' })
  await clock.settle()
  await arrow(1)
  expect((await peek($, 'explorer') as { selected: string }).selected).toBe('xd:mods')
  await arrow(1)
  expect((await peek($, 'explorer') as { selected: string }).selected).toBe('xf:README.md')
  await arrow(1)
  expect((await peek($, 'explorer') as { selected: string }).selected).toBe('xs:commits')
  // the Tickets tab's selection is not touched by the Explorer's arrows
  expect(await peek($, 'selected')).toBe(null)
  await ui.unmount()
})

test('Windows: git by its absolute path from PATH, never a bare git; none found - said in the tab', WITH, async ($, on) => {
  const [w, clock] = world(on, { OS: 'Windows_NT', PATH: '.;C:\\Git\\cmd' })
  w.exes.push('C:/Git/cmd/git.exe')
  await start($, clock)
  const ui = await mountExplorer($, clock, 'terminal')
  expect((await ui.find({ key: 'xs:files' }))?.text).toBe('▸ Files (4)')
  expect(gitRuns(w).length).toBeGreaterThan(0)
  for (const r of gitRuns(w)) expect(r.argv[0]).toBe('C:/Git/cmd/git.exe')
  w.exes.length = 0
  await ui.press({ key: 'key:reload' })
  await clock.settle()
  expect((await ui.find({ key: 'xerr' }))?.text).toBe('git not found on PATH (absolute entries only)')
  await ui.unmount()
})

test('git refusing (not a repo, a broken index) shows what it said, not an empty tree', WITH, async ($, on) => {
  const [w, clock] = world(on)
  w.git = args => (args.includes('ls-files') ? ran('', 128, 'fatal: index file corrupt\n') : answer(args))
  await start($, clock)
  const ui = await mountExplorer($, clock, 'terminal')
  expect((await ui.find({ key: 'xerr' }))?.text).toBe('git ls-files failed: fatal: index file corrupt')
  expect((await ui.find({ key: 'xs:commits' }))?.text).toBe('▸ Commits (2)  ↑1 ↓1 vs origin/main')
  await ui.unmount()
})

test('/ops explorer opens the pane on Explorer and reads the tree; the keys line names r', WITH, async ($, on) => {
  const [w, clock] = world(on)
  await start($, clock)
  expect((await $.command.run({ command: 'ops', args: 'explorer', ...RUN })).text).toBe('ops board opened on Explorer.')
  await clock.settle()
  expect(await peek($, 'tab')).toBe('explorer')
  expect(gitRuns(w).some(r => r.argv.includes('ls-files'))).toBe(true)
  const ui = await $.ui.mount({ plugin: 'ops-board', surface: 'terminal', component: 'Pane', requestId: 'ops-board',
    props: { title: 'ops board', isFocused: true, bodyColumns: 54, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} } })
  expect((await ui.find({ key: 'key:reload' }))?.props.hotkey).toBe('r')
  await ui.unmount()
})

// Review #8: git file names and commit subjects are drawn without control bytes, as the
// standalone app's Explorer draws them (ops/explorer.ts clean()): an ESC never reaches the
// terminal, a newline never makes one item two rows.
test('a file name or commit subject with control bytes is drawn without them', WITH, async ($, on) => {
  const [w, clock] = world(on)
  w.git = args => {
    const a = args.join(' ')
    if (a.includes('ls-files')) return ran('ev\u001b[31mil.ts\0')
    if (a.includes(' log ')) return ran(`${SHA1}\x1f1234567\x1f2026-10-24\x1fVidul\x1fbad\u001b]0;pwned\u0007 sub\rject\n`)
    return answer(args)
  }
  await start($, clock)
  const ui = await mountExplorer($, clock, 'terminal')
  await ui.press({ key: 'xs:files' })
  await ui.press({ key: 'xs:commits' })
  await clock.settle()
  const all = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
  expect(all).toContain('ev[31mil.ts')
  expect(all).toContain('bad]0;pwned subject')
  expect(all).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f]/)
  await ui.unmount()
})

// A154: cleaned where git's output is parsed, so explorerLines() measures the text drawn -
// a long name with an ESC and a CR is cut to the width of any other long name.
test('a long file name with an ESC and a CR lines up with any other long name', WITH, async ($, on) => {
  const [w, clock] = world(on)
  const long = (c: string) => c.repeat(60) + '.ts'
  w.git = args => (args.join(' ').includes('ls-files') ? ran(`${long('a')}\0b\u001b\r${long('b')}\0`) : answer(args))
  await start($, clock)
  const ui = await mountExplorer($, clock, 'terminal', 40)
  await ui.press({ key: 'xs:files' })
  await clock.settle()
  const rows = (await ui.findAll({ type: 'Text' })).map(t => t.text ?? '').filter(t => /^ {4}[ab]{5}/.test(t))
  expect(rows).toHaveLength(2)
  expect(rows[1]!.length).toBe(rows[0]!.length)
  await ui.unmount()
})

// F103: the git actions - the argv is fixed per action, a plan refuses what git would refuse
// or stop half way on, and run branches / worktrees are warned before anything runs.
test('F103 argv per action is fixed: ff-only no-rebase pull, push by explicit refspec, no-edit revert, merge with --', () => {
  expect(ACTION_ARGS.fetch('')).toEqual(['fetch', '--prune'])
  expect(ACTION_ARGS.pull('')).toEqual(['pull', '--ff-only', '--no-rebase'])
  expect(ACTION_ARGS.push('origin', 'main')).toEqual(['push', 'origin', 'HEAD:refs/heads/main'])
  expect(ACTION_ARGS.revert('abc1')).toEqual(['revert', '--no-edit', 'abc1'])
  expect(ACTION_ARGS.merge('feature/x')).toEqual(['merge', '--no-edit', '--', 'feature/x'])
  expect(ACTION_ARGS.merge('-n')).toEqual(['merge', '--no-edit', '--', '-n'])   // a branch named -n is no option
  for (const k of Object.keys(ACTION_ARGS) as (keyof typeof ACTION_ARGS)[]) expect(ACTION_ARGS[k]('t').some(a => /force/.test(a))).toBe(false)
})

test('F103 planAction: dirty tree refuses pull/merge/revert, push needs an upstream, revert needs a selected commit, run refs warn', () => {
  const x = { ...withUpstream(EMPTY, 'origin/main', '2\t3'), selected: 'xc:' + SHA1 }
  const at = { branch: 'main', head: SHA1, root: '/r', dirty: 0 }
  expect(planAction(x, 'pull', { ...at, dirty: 2 })).toEqual({ refused: 'working tree has 2 uncommitted changes - git would refuse or stop half way; commit or stash first' })
  expect(planAction(x, 'push', { ...at, dirty: 2, pushTo: { remote: 'origin', ref: 'refs/heads/main' } }))
    .toEqual({ action: { kind: 'push', args: ['push', 'origin', 'HEAD:refs/heads/main'], warn: [], pick: null, result: null, branch: 'main', head: SHA1 } })
  expect(planAction(x, 'push', at)).toEqual({ refused: 'no upstream for main - git push -u origin main by hand sets one' })   // none read: refused
  expect(planAction(withUpstream(EMPTY, null, null), 'push', at)).toEqual({ refused: 'no upstream for main - git push -u origin main by hand sets one' })
  expect(planAction({ ...x, selected: 'xs:files' }, 'revert', at)).toEqual({ refused: 'select a commit first' })
  const r = planAction(x, 'revert', { ...at, branch: 'run/RUN-0022-x', root: '/r/.skillator/worktrees/RUN-0022-x' })
  expect(r).toEqual({ action: { kind: 'revert', args: ['revert', '--no-edit', SHA1], warn: ['on relay run branch run/RUN-0022-x - runs land through relay-morpheus; continue only if you mean it', 'this checkout is a run worktree (/r/.skillator/worktrees/RUN-0022-x)'], pick: null, result: null, branch: 'run/RUN-0022-x', head: SHA1 } })
  const m = planAction(x, 'merge', { ...at, branches: ['main', 'feature/x', 'run/RUN-0021-y'] })
  expect(m).toEqual({ action: { kind: 'merge', args: [], warn: [], pick: ['feature/x', 'run/RUN-0021-y'], result: null, branch: 'main', head: SHA1 } })
})

test('F103 upstream and incoming: the count line, the Incoming section only when behind, its items open like commits', () => {
  expect(parseCount('2\t3\n')).toEqual({ ahead: 2, behind: 3 }); expect(parseCount('junk')).toBeNull()
  let x = withUpstream({ ...EMPTY, open: [COMMITS] }, 'origin/main', '0\t0'); x = withLog(x, LOG)
  expect(explorerLines(x, 60).find(l => l.key === COMMITS)!.segs.map(s => s.text).join('')).toBe('▾ Commits (2)  ↑0 ↓0 vs origin/main')
  expect(explorerLines(x, 60).some(l => l.key === INCOMING)).toBe(false)
  x = withIncoming(withUpstream(x, 'origin/main', '0\t1'), `${SHA2}\x1f89abcde\x1f2026-10-25\x1fAsha\x1fF99: diagnose\n`)
  expect(explorerLines({ ...x, open: [COMMITS, INCOMING] }, 60).find(l => l.key === 'xi:' + SHA2)!.segs.map(s => s.text).join('')).toBe('  ▸ 89abcde  2026-10-25  F99: diagnose')
  expect(toggle(x, 'xi:' + SHA2).need).toEqual({ files: false, sha: SHA2 })
  expect(explorerLines(withUpstream(x, null, null), 60).find(l => l.key === COMMITS)!.segs.map(s => s.text).join('')).toBe('▾ Commits (2)  no upstream')
  expect(isRunRef('run/RUN-0022-x')).toBe(true); expect(isRunRef('C:/r/.skillator/worktrees/RUN-1-a')).toBe(true); expect(isRunRef('main')).toBe(false)
})

// F103 in the pane: each action behind a confirm that names its argv; only Run runs it.
const go = async (ui: Awaited<ReturnType<typeof mountExplorer>>, clock: MockClock, key: string) => {
  await ui.press({ key }); await clock.settle(); await ui.press({ key: 'xa:go' }); await clock.settle()
}

test('F103 pull: the confirm names the exact argv; Run runs it once; Cancel and Esc run nothing', WITH, async ($, on) => {
  const [w, clock] = world(on); await start($, clock); const ui = await mountExplorer($, clock, 'terminal', 70)
  await ui.press({ key: 'key:pull' }); await clock.settle()
  expect((await ui.find({ key: 'xa:title' }))?.text).toBe('git pull?  Esc cancels')
  expect((await ui.find({ key: 'xa:argv' }))?.text).toBe('runs    git pull --ff-only --no-rebase')
  expect((await ui.find({ key: 'xa:on' }))?.text).toBe('on      main')
  await ui.press({ key: 'xa:cancel' }); await clock.settle()
  expect(w.actions).toEqual([])                                     // cancel does not run
  expect(await ui.find({ key: 'xa:title' })).toBeUndefined()
  await ui.press({ key: 'key:pull' }); await clock.settle()
  await $.command.run({ command: 'close', args: 'ops-board', ...RUN }); await clock.settle()   // Esc
  expect(w.actions).toEqual([])                                     // Esc does not run
  expect(await ui.find({ key: 'xa:title' })).toBeUndefined()
  await go(ui, clock, 'key:pull')
  expect(w.actions).toEqual([['pull', '--ff-only', '--no-rebase']])  // confirm runs, once
  expect(w.actions.flat().some(a => /force/.test(a))).toBe(false)
  expect(w.toasts.at(-1)).toBe('✓ git pull --ff-only --no-rebase: Already up to date.')
  await ui.unmount()
})

test('F103 every action: fetch, push, revert of the selected commit, merge of a picked branch - argv pinned; a dirty tree refuses pull/merge/revert with a toast', WITH, async ($, on) => {
  const [w, clock] = world(on); await start($, clock); const ui = await mountExplorer($, clock, 'terminal', 70)
  await go(ui, clock, 'key:fetch'); expect(w.actions).toEqual([['fetch', '--prune']]); w.actions = []
  await go(ui, clock, 'key:push'); expect(w.actions).toEqual([['push', 'origin', 'HEAD:refs/heads/main']]); w.actions = []
  await ui.press({ key: 'xs:commits' }); await ui.press({ key: 'xc:' + SHA1 }); await clock.settle()
  await go(ui, clock, 'key:revert'); expect(w.actions).toEqual([['revert', '--no-edit', SHA1]]); w.actions = []
  await ui.press({ key: 'key:merge' }); await clock.settle()
  expect(await ui.find({ key: 'xb:main' })).toBeUndefined()        // the current branch is no merge source
  expect((await ui.find({ key: 'xa:go' }))).toBeUndefined()         // nothing to run until a branch is picked
  await ui.press({ key: 'xb:feature/x' }); await clock.settle()
  expect((await ui.find({ key: 'xa:argv' }))?.text).toBe('runs    git merge --no-edit -- feature/x')
  await ui.press({ key: 'xa:go' }); await clock.settle()
  expect(w.actions).toEqual([['merge', '--no-edit', '--', 'feature/x']]); w.actions = []
  w.dirty = ' M a.ts\n'
  for (const k of ['key:pull', 'key:merge', 'key:revert']) {
    await ui.press({ key: k }); await clock.settle()
    expect(w.toasts.at(-1)).toBe('■ working tree has 1 uncommitted changes - git would refuse or stop half way; commit or stash first')
    expect(await ui.find({ key: 'xa:title' })).toBeUndefined()
  }
  expect(w.actions).toEqual([])
  await ui.unmount()
})

test('F103 a failed command shows git\'s message; a merge conflict says the merge stopped', WITH, async ($, on) => {
  const [w, clock] = world(on); await start($, clock); const ui = await mountExplorer($, clock, 'terminal', 70)
  w.actionResult = ran('', 1, 'CONFLICT (content): Merge conflict in a.ts\nAutomatic merge failed; fix conflicts and then commit the result.\n')
  await ui.press({ key: 'key:merge' }); await clock.settle(); await ui.press({ key: 'xb:feature/x' }); await clock.settle()
  await ui.press({ key: 'xa:go' }); await clock.settle()
  const t = w.toasts.at(-1)!
  expect(t.startsWith('■ git merge --no-edit -- feature/x failed: CONFLICT')).toBe(true)
  expect(t.endsWith('- merge stopped on conflict: resolve by hand, or git merge --abort')).toBe(true)
  w.actionResult = ran('', 1, 'fatal: Not possible to fast-forward, aborting.\n')
  await go(ui, clock, 'key:pull')
  expect(w.toasts.at(-1)).toBe('■ git pull --ff-only --no-rebase failed: fatal: Not possible to fast-forward, aborting.')
  // a revert conflict: git says CONFLICT on stdout, a hint on stderr - both read, the stop said
  w.actionResult = ran('CONFLICT (content): Merge conflict in a.ts\n', 1, 'error: could not revert 1234567... F75\n')
  await ui.press({ key: 'xs:commits' }); await ui.press({ key: 'xc:' + SHA1 }); await clock.settle()
  await go(ui, clock, 'key:revert')
  expect(w.toasts.at(-1)!.endsWith('- revert stopped on conflict: resolve by hand, or git revert --abort')).toBe(true)
  await ui.unmount()
})

test('F103 Run pressed twice runs git once; a detached HEAD is no merge source', WITH, async ($, on) => {
  const [w, clock] = world(on); await start($, clock); const ui = await mountExplorer($, clock, 'terminal', 70)
  await ui.press({ key: 'key:push' }); await clock.settle()
  const run = ui.press({ key: 'xa:go' }); await ui.press({ key: 'xa:go' }).catch(() => {}); await run; await clock.settle()
  expect(w.actions).toEqual([['push', 'origin', 'HEAD:refs/heads/main']])
  expect(planAction(EMPTY, 'merge', { branch: 'main', head: SHA1, root: '/r', dirty: 0, branches: ['(HEAD detached at abc1234)', 'main', 'x'] }))
    .toEqual({ action: { kind: 'merge', args: [], warn: [], pick: ['x'], result: null, branch: 'main', head: SHA1 } })
  await ui.unmount()
})

test('F103 a run branch and a run worktree are warned in the confirm; the keys line names f p u v m', WITH, async ($, on) => {
  const [w, clock] = world(on); w.branch = 'run/RUN-0022-x'; w.root = '/r/.skillator/worktrees/RUN-0022-x'
  await start($, clock); const ui = await mountExplorer($, clock, 'terminal', 70)
  for (const [k, h] of [['fetch', 'f'], ['pull', 'p'], ['push', 'u'], ['revert', 'v'], ['merge', 'm']])
    expect((await ui.find({ key: 'key:' + k }))?.props.hotkey).toBe(h)
  await ui.press({ key: 'key:push' }); await clock.settle()
  expect((await ui.find({ key: 'xa:warn:0' }))?.text).toBe('on relay run branch run/RUN-0022-x - runs land through relay-morpheus; continue only if you mean it')
  expect((await ui.find({ key: 'xa:warn:1' }))?.text).toBe('this checkout is a run worktree (/r/.skillator/worktrees/RUN-0022-x)')
  await ui.unmount()
})

test('F103 after a fetch the Commits head shows ↑1 ↓1 vs origin/main and Incoming (1) opens to its files', WITH, async ($, on) => {
  const [w, clock] = world(on); await start($, clock); const ui = await mountExplorer($, clock, 'terminal', 70)
  await go(ui, clock, 'key:fetch')
  expect(w.actions).toEqual([['fetch', '--prune']])
  expect((await ui.find({ key: 'xs:commits' }))?.text).toBe('▸ Commits (2)  ↑1 ↓1 vs origin/main')
  expect((await ui.find({ key: 'xs:incoming' }))?.text).toBe('▸ Incoming (1)')
  await ui.press({ key: 'xs:incoming' }); await clock.settle()
  expect((await ui.find({ key: 'xi:' + SHA3 }))?.text).toBe('  ▸ fedcba9  2026-10-26  F100: incoming')
  await ui.press({ key: 'xi:' + SHA3 }); await clock.settle()
  expect((await ui.find({ key: `xch:${SHA3}:0` }))?.text).toBe('      M  mods/a/x.ts  +3 -1')
  await ui.unmount()
})

// F103 review round 1.
test('F103 push: the argv names the upstream remote and branch as an explicit refspec, the confirm shows it, git asks no password', WITH, async ($, on) => {
  const [w, clock] = world(on); w.branch = 'feature/x'; w.pushTo = 'up/stream\trefs/heads/team/x'
  await start($, clock); const ui = await mountExplorer($, clock, 'terminal', 70)
  await ui.press({ key: 'key:push' }); await clock.settle()
  expect((await ui.find({ key: 'xa:argv' }))?.text).toBe('runs    git push up/stream HEAD:refs/heads/team/x')
  expect((await ui.find({ key: 'xa:on' }))?.text).toBe('on      feature/x')
  await ui.press({ key: 'xa:go' }); await clock.settle()
  expect(w.actions).toEqual([['push', 'up/stream', 'HEAD:refs/heads/team/x']])
  expect(w.runs.find(r => r.argv[1] === 'push')?.env).toEqual({ GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' })   // A159: no GCM window either
  w.actions = []; w.pushTo = '\t'                                   // no upstream remote read: refused, nothing run
  await ui.press({ key: 'key:push' }); await clock.settle()
  expect(w.toasts.at(-1)).toBe('■ no upstream for feature/x - git push -u origin feature/x by hand sets one')
  expect(w.actions).toEqual([])
  await ui.unmount()
})

test('F103 a plan gone stale between the confirm and Run runs nothing: branch changed, HEAD moved, tree dirtied', WITH, async ($, on) => {
  const [w, clock] = world(on); await start($, clock); const ui = await mountExplorer($, clock, 'terminal', 70)
  const cases: [() => void, string][] = [
    [() => { w.branch = 'other' }, '■ the branch changed (main → other) since the confirm opened - nothing run'],
    [() => { w.head = SHA2 }, '■ HEAD moved since the confirm opened - nothing run'],
    [() => { w.dirty = ' M a.ts\n' }, '■ working tree has 1 uncommitted changes now - nothing run'],
  ]
  for (const [change, said] of cases) {
    w.branch = 'main'; w.head = SHA1; w.dirty = ''
    await ui.press({ key: 'key:pull' }); await clock.settle()
    change()
    await ui.press({ key: 'xa:go' }); await clock.settle()
    expect(w.toasts.at(-1)).toBe(said)
    expect(await ui.find({ key: 'xa:title' })).toBeUndefined()
  }
  expect(w.actions).toEqual([])
  await ui.unmount()
})

test('F103 a detached HEAD and a merge/revert/cherry-pick/rebase in progress refuse pull, push, merge and revert', WITH, async ($, on) => {
  const [w, clock] = world(on); await start($, clock); const ui = await mountExplorer($, clock, 'terminal', 70)
  await ui.press({ key: 'xs:commits' }); await ui.press({ key: 'xc:' + SHA1 }); await clock.settle()
  w.branch = 'HEAD'
  for (const k of ['pull', 'push', 'merge', 'revert']) {
    await ui.press({ key: 'key:' + k }); await clock.settle()
    expect(w.toasts.at(-1)).toBe(`■ HEAD is detached - git ${k} needs a branch; check one out first`)
  }
  w.branch = 'main'
  for (const m of ['MERGE_HEAD', 'REVERT_HEAD', 'CHERRY_PICK_HEAD', 'rebase-merge', 'rebase-apply']) {
    w.exes = ['/r/.git/' + m]
    for (const k of ['pull', 'push', 'merge', 'revert']) {
      await ui.press({ key: 'key:' + k }); await clock.settle()
      expect(w.toasts.at(-1)).toBe(`■ ${m} exists in the git dir - a merge, revert, cherry-pick or rebase is in progress; finish it or --abort it first`)
    }
  }
  expect(await ui.find({ key: 'xa:title' })).toBeUndefined()
  expect(w.actions).toEqual([])
  await ui.unmount()
})

test('F103 an upstream read failing (not "no upstream") clears the counts and Incoming', WITH, async ($, on) => {
  const [w, clock] = world(on); await start($, clock); const ui = await mountExplorer($, clock, 'terminal', 70)
  expect((await ui.find({ key: 'xs:commits' }))?.text).toBe('▸ Commits (2)  ↑1 ↓1 vs origin/main')
  w.git = args => (args.join(' ') === 'rev-parse --abbrev-ref @{upstream}' ? ran('', 1, 'fatal: something else') : answer(args))
  await ui.press({ key: 'key:reload' }); await clock.settle()
  expect((await ui.find({ key: 'xs:commits' }))?.text).toBe('▸ Commits (2)')
  expect(await ui.find({ key: 'xs:incoming' })).toBeUndefined()
  await ui.unmount()
})

test('F103 an action that throws toasts the error and frees the next action; a timeout says index.lock may be left', WITH, async ($, on) => {
  const [w, clock] = world(on); await start($, clock); const ui = await mountExplorer($, clock, 'terminal', 70)
  await ui.press({ key: 'key:fetch' }); await clock.settle()
  w.repoFails = true
  await ui.press({ key: 'xa:go' }); await clock.settle()
  expect(w.toasts.at(-1)).toMatch(/^■ .*repo read failed/)
  w.repoFails = false
  w.actionResult = 'timed out'
  await go(ui, clock, 'key:fetch')                                  // not "still running": the throw freed it
  expect(w.actions).toEqual([['fetch', '--prune']])
  expect(w.toasts.at(-1)).toBe('■ git fetch --prune timed out after 120s - .git/index.lock may be left; remove it once no git runs')
  await ui.unmount()
})

// A159: the F103 re-review leftovers.
test('A159 a push remote named like an option (-f) is refused, never put in the argv', () => {
  const at = { branch: 'main', head: SHA1, root: '/r', dirty: 0 }
  expect(planAction(withUpstream(EMPTY, 'origin/main', '0\t0'), 'push', { ...at, pushTo: { remote: '-f', ref: 'refs/heads/main' } }))
    .toEqual({ refused: 'remote -f starts with - - git push would read it as an option; rename the remote' })
})

test('A159 an action key whose plan read throws (fs.exists rejecting) toasts the error, no confirm drawn', WITH, async ($, on) => {
  const [w, clock] = world(on); await start($, clock); const ui = await mountExplorer($, clock, 'terminal', 70)
  w.existsFails = true
  await ui.press({ key: 'key:pull' }); await clock.settle()
  expect(w.toasts.at(-1)).toMatch(/^■ .*EIO/)
  expect(await ui.find({ key: 'xa:title' })).toBeUndefined()
  expect(w.actions).toEqual([])
  await ui.unmount()
})
