import { test, expect, mock } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'
import type { Engine, MockClock, Plugin } from 'claude-code/testing'
import type { LogEntry } from '../hooks/lib/log'

// Log tab (design 2026-11-02): a popup from an existing path lands in the log atom;
// the Log tab draws it wrapped in full; a press (or y) copies its whole text; C clears.

const SHA1 = '1234567' + 'a'.repeat(33)
const FILES = ['README.md', 'mods/a/x.ts'].join('\0') + '\0'
const LOG = `${SHA1}\x1f1234567\x1f2026-10-24\x1fVidul\x1fF75: explorer\n`

type World = { runs: { argv: readonly string[] }[]; git: (args: readonly string[]) => ProcessRunResult
  exes: string[]; actions: string[][]; dirty: string; branch: string; head: string; pushTo: string
  root: string; toasts: string[]; copies: string[]; branchError?: ProcessRunResult }
const ran = (stdout: string, exitCode = 0, stderr = ''): ProcessRunResult =>
  ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false })

const answer = (args: readonly string[]): ProcessRunResult => {
  const a = args.join(' ')
  if (a === 'config user.email') return ran('vidul@ikran.in\n')
  if (a.includes('ls-files')) return ran(FILES)
  if (a === 'rev-parse --abbrev-ref @{upstream}') return ran('origin/main\n')
  if (a.startsWith('rev-list --left-right --count')) return ran('1\t1\n')
  if (a.includes(' log ')) return ran(LOG)
  return ran('', 1, 'not in this test')
}
const ACTION = /^(fetch|pull|push|revert|merge|commit|sync)$/

function world(on: On, env: Record<string, string> = {}): [World, MockClock] {
  const w: World = { runs: [], git: answer, exes: [], actions: [], dirty: '', branch: 'main', head: SHA1,
    pushTo: 'origin\trefs/heads/main', root: '/r', toasts: [], copies: [] }
  const local = (args: readonly string[]): ProcessRunResult | string => {
    const a = args.join(' ')
    if (ACTION.test(args[0] ?? '')) { w.actions.push([...args]); return ran('Already up to date.\n') }
    if (a === 'rev-parse --abbrev-ref HEAD') return ran(w.branch + '\n')
    if (a === 'branch --show-current') return w.branchError ?? ran(w.branch === 'HEAD' ? '' : w.branch + '\n')
    if (a === 'rev-parse HEAD') return w.head ? ran(w.head + '\n') : ran('HEAD\n', 128, 'fatal: ambiguous argument HEAD')
    if (a === 'rev-parse --absolute-git-dir') return ran('/r/.git\n')
    if (a.startsWith('for-each-ref')) return ran(w.pushTo + '\n')
    if (a.startsWith('status --porcelain')) return ran(w.dirty)
    if (a.startsWith('branch --format')) return ran('main\nfeature/x\n')
    return w.git(args)
  }
  const files: Record<string, string> = { '/r/TICKETS.md': '# Tickets\n\n## Open\n\n- [ ] F1 — one\n' }
  const at = (p: string) => files[p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')]
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.env(on, env)
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.repo', () => ({ value: { root: w.root, remote: null, internal: false, name: 'r' } }))
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
    w.runs.push({ argv: e.argv })
    const v = /(^|\/)git(\.exe)?$/.test(e.argv[0] ?? '') ? local(e.argv.slice(1)) : ran('', 1, 'not in this test')
    return typeof v === 'string' ? { deny: v } : { value: v }
  })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', ($, e) => { w.toasts.push(e.text); return { value: undefined } })
  on('ui.copy', ($, e) => { w.copies.push(e.text); return { value: { isCopied: true as const } } })
  on('ui.status', () => ({ value: undefined }))
  on('ui.scroll', () => ({}))
  on('ui.focus', () => ({}))
  on('prompt.submit', () => ({ value: undefined }))
  return [w, clock]
}

const PEEK: Plugin = {
  name: 'peek',
  register(on) {
    on('command.run', { command: 'peek' }, async ($, e) => {
      const v = e.args === 'log' ? await $.state.get({ plugin: 'ops-board', key: 'log' })
        : await $.state.get({ plugin: 'ops-board', key: 'tab' })
      return { text: JSON.stringify(v.value ?? null) }
    })
  },
}
const WITH = { plugins: [PEEK] }
const RUN = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
const peekLog = async ($: Engine) => JSON.parse((await $.command.run({ command: 'peek', args: 'log', ...RUN })).text ?? 'null') as LogEntry[]
const peekTab = async ($: Engine) => JSON.parse((await $.command.run({ command: 'peek', args: 'tab', ...RUN })).text ?? 'null') as unknown

async function start($: Engine, clock: MockClock) {
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.settle()
}
async function mountPane($: Engine, clock: MockClock, bodyColumns = 40) {
  const ui = await $.ui.mount({ plugin: 'ops-board', surface: 'terminal', component: 'Pane', requestId: 'ops-board',
    props: { title: 'ops board', isFocused: true, bodyColumns, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} } })
  await clock.settle()
  return ui
}

// A refused pull whose toast is two lines and longer than the pane is wide.
const LONG_TOAST = '■ git branch failed: fatal: the branch query failed badly\nfatal: second line here'
async function seedLongPopup(ui: Awaited<ReturnType<typeof mountPane>>, w: World, clock: MockClock) {
  w.branchError = ran('', 128, 'fatal: the branch query failed badly\nfatal: second line here\n')
  await ui.press({ key: 'tab:explorer' }); await clock.settle()
  await ui.press({ key: 'key:pull' }); await clock.settle()
  expect(w.toasts.at(-1)).toBe(LONG_TOAST)
}

test('log: a popup from an existing path lands in the log atom, newest first', WITH, async ($, on) => {
  const [w, clock] = world(on); await start($, clock); const ui = await mountPane($, clock)
  await seedLongPopup(ui, w, clock)
  expect((await peekLog($)).map(e => e.text)).toEqual([LONG_TOAST])
  w.branchError = undefined; w.dirty = ' M a.ts\n'
  await ui.press({ key: 'key:pull' }); await clock.settle()
  const log = await peekLog($)
  expect(log).toHaveLength(2)
  expect(log[0]!.text).toContain('working tree has 1 uncommitted changes')
  expect(log[1]!.text).toBe(LONG_TOAST)
  await ui.unmount()
})

test('log: the Log tab draws a popup wrapped in full; pressing its row copies the whole text', WITH, async ($, on) => {
  const [w, clock] = world(on); await start($, clock); const ui = await mountPane($, clock, 40)
  await seedLongPopup(ui, w, clock)
  await ui.press({ key: 'tab:log' }); await clock.settle()
  expect((await ui.find({ key: 'tab:log' }))?.text).toContain('Log 1')       // the entry count rides on the tab
  const drawn = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
  expect(drawn).toContain('branch query failed badly')                         // the tail is there: never truncated
  expect(drawn).toContain('fatal: second line here')
  const entry = await ui.find({ key: 'log:0' })
  expect(entry).toBeDefined()
  for (const line of (entry!.text ?? '').split('\n')) expect(line.length).toBeLessThanOrEqual(40)
  await ui.press({ key: 'log:0' }); await clock.settle()
  expect(w.copies).toEqual([LONG_TOAST])                                     // ui.copy with the entry's whole text
  expect(w.toasts.at(-1)).toBe('✓ log entry copied')
  expect((await peekLog($))[0]!.text).toBe('✓ log entry copied')              // the outcome is itself logged
  await ui.unmount()
})

test('log: y copies the selected entry; C clears the log', WITH, async ($, on) => {
  const [w, clock] = world(on); await start($, clock); const ui = await mountPane($, clock)
  await seedLongPopup(ui, w, clock)
  await ui.press({ key: 'tab:log' }); await clock.settle()
  expect((await ui.find({ key: 'key:log-copy' }))?.props.hotkey).toBe('y')
  expect((await ui.find({ key: 'key:log-clear' }))?.props.hotkey).toBe('c')   // shift+c: the engine takes one lowercase letter
  await ui.press({ key: 'key:log-copy' }); await clock.settle()
  expect(w.copies).toEqual([LONG_TOAST])
  await ui.press({ key: 'key:log-clear' }); await clock.settle()
  expect(await peekLog($)).toEqual([])
  await ui.unmount()
})

test('log: /ops log opens the pane on the Log tab', WITH, async ($, on) => {
  const [, clock] = world(on); await start($, clock)
  expect((await $.command.run({ command: 'ops', args: 'log', ...RUN })).text).toBe('ops board opened on Log.')
  await clock.settle()
  expect(await peekTab($)).toBe('log')
})
