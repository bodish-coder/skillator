import { test, expect, mock } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'
import type { Engine, MockClock, Plugin } from 'claude-code/testing'

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

type World = { runs: { argv: readonly string[]; cwd?: string }[]; git: (args: readonly string[]) => ProcessRunResult; exes: string[] }
const ran = (stdout: string, exitCode = 0, stderr = ''): ProcessRunResult =>
  ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false })

const answer = (args: readonly string[]): ProcessRunResult => {
  const a = args.join(' ')
  if (a === 'config user.email') return ran('vidul@ikran.in\n')
  if (a.includes('ls-files')) return ran(FILES)
  if (a.includes(SHA1)) return ran(CH1)
  if (a.includes(SHA2)) return ran(CH2)
  if (a.includes(' log ')) return ran(LOG)
  return ran('', 1, 'not in this test')
}

function world(on: On, env: Record<string, string> = {}): [World, MockClock] {
  const w: World = { runs: [], git: answer, exes: [] }
  const files: Record<string, string> = { '/r/TICKETS.md': '# Tickets\n\n## Open\n\n- [ ] F1 — one\n' }
  const at = (p: string) => files[p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')]
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.env(on, env)
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.repo', () => ({ value: { root: '/r', remote: null, internal: false, name: 'r' } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('fs.stat', ($, e) => {
    const f = at(e.path)
    return f !== undefined ? { value: { kind: 'file' as const, size: f.length, mtimeMs: 1000, isLink: false } } : { deny: 'ENOENT ' + e.path }
  })
  on('fs.exists', ($, e) => ({ value: at(e.path) !== undefined || w.exes.includes(e.path.replace(/\\/g, '/')) }))
  on('fs.read', ($, e) => {
    const f = at(e.path)
    return f !== undefined ? { value: f } : { deny: 'ENOENT ' + e.path }
  })
  on('fs.list', ($, e) => ({ deny: 'ENOENT ' + e.path }))
  on('process.run', ($, e) => {
    w.runs.push({ argv: e.argv, cwd: e.init?.cwd })
    return { value: /(^|\/)git(\.exe)?$/.test(e.argv[0] ?? '') ? w.git(e.argv.slice(1)) : ran('', 1, 'not in this test') }
  })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.scroll', () => ({}))
  on('ui.focus', () => ({}))
  return [w, clock]
}

const PEEK: Plugin = {
  name: 'peek',
  register(on) {
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
    expect(await text('xs:commits')).toBe('▸ Commits (2)')
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
  expect((await ui.find({ key: 'xs:commits' }))?.text).toBe('▸ Commits (2)')
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
