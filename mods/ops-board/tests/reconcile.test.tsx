import { test, expect, mock } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'
import type { Engine, MockClock, Mounted, Plugin } from 'claude-code/testing'

// F81: `c` on the Tickets tab - ticket-meta reconcile's proposals as a form inside the
// ops-board pane (B5: no second pane); accept all / pick / none, each accepted row
// written by its ticket-meta subcommand (the mod writes no file), a refusal in the
// toast, then the board re-read.

const BOARD = `# Tickets

## Open

- [~] F3 — cart drawer keeps items on reload [owner: @vidul] (@cc-4ae496)
- [!] B2 — /orders 500s past page 3 (blocked: F1)
- [ ] B1 — button focus ring missing
- [ ] B7 — pairing screen, needs an owner live look
- [~] F8 — sync worker
- [!] B9 — vendor SDK (blocked: the vendor fix)

## Closed

- [x] F1 — product grid on the home page
`
const PROPOSALS = `B2 [!] -> [ ]  blocked on F1, now done
B1 [ ] -> [~]  2 commits name it, newest abc1234
B7 [ ] -> [%]  code landed in abc1235; the owner must confirm: a live check
F8 [~] -> [!]  RUN-0001 stage 1 failed
B9 [!] -> [!]  evidence unclear: blocked on 'the vendor fix', no ticket to check
`
const META = '/s/skills/tickets-zordon/scripts/ticket-meta'
const sh = (...a: string[]) => ['/bin/sh', META + '.sh', ...a]

type World = {
  files: Record<string, string>
  runs: (readonly string[])[]
  opens: { id: string; focus?: true; closeOnEscape?: true }[]
  closes: string[]
  toasts: string[]
  writes: string[]
  answer: (argv: readonly string[]) => ProcessRunResult | null
}
const ran = (stdout: string, exitCode = 0, stderr = ''): ProcessRunResult =>
  ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false })

function world(on: On, files: Record<string, string>): [World, MockClock] {
  const w: World = { files: { ...files, [META + '.sh']: '#!/bin/sh\n' }, runs: [], opens: [], closes: [], toasts: [], writes: [], answer: () => null }
  const at = (p: string) => w.files[p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')]
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.env(on, { SKILLATOR_ROOT: '/s' })
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.repo', () => ({ value: { root: '/r', remote: null, internal: false, name: 'r' } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('fs.stat', ($, e) => {
    const f = at(e.path)
    return f !== undefined ? { value: { kind: 'file' as const, size: f.length, mtimeMs: 1000, isLink: false } } : { deny: 'ENOENT ' + e.path }
  })
  on('fs.exists', ($, e) => ({ value: at(e.path) !== undefined }))
  on('fs.read', ($, e) => {
    const f = at(e.path)
    return f !== undefined ? { value: f } : { deny: 'ENOENT ' + e.path }
  })
  on('fs.write', ($, e) => { w.writes.push(e.path); return { deny: 'the mod must not write files' } })
  on('process.run', ($, e) => {
    if (e.argv.join(' ') === 'git config user.email') return { value: ran('vidul@ikran.in\n') }
    if (e.argv.some(a => /(pending|relay-morpheus)\.(sh|ps1)$/.test(a))) return { value: ran('', 1, 'not in this test') }
    w.runs.push(e.argv)
    return { value: w.answer(e.argv) ?? ran('', 1, 'unexpected call') }
  })
  on('ui.open', ($, e) => { w.opens.push({ id: e.id, focus: e.focus, closeOnEscape: e.closeOnEscape }); return { value: { isPlaced: true as const } } })
  on('ui.close', ($, e) => { w.closes.push(e.id); return { value: undefined } })
  on('ui.toast', ($, e) => { w.toasts.push(e.text); return { value: undefined } })
  on('ui.focus', () => ({}))
  return [w, clock]
}

// Another plugin closing the pane stands for Esc (the same ui.close chain); peek reads state.
const PEEK: Plugin = {
  name: 'peek',
  register(on) {
    on('command.run', { command: 'close' }, async ($, e) => { await $.ui.close({ id: e.args }); return { text: 'closed' } })
    on('command.run', { command: 'peek' }, async ($) => ({ text: JSON.stringify((await $.state.get({ plugin: 'ops-board', key: 'reconcile' })).value ?? null) }))
  },
}
const WITH = { plugins: [PEEK] }
const RUN = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
const form = async ($: Engine) => JSON.parse((await $.command.run({ command: 'peek', args: '', ...RUN })).text ?? 'null') as unknown

const SURFACES = ['terminal', 'desktop'] as const
type Surface = (typeof SURFACES)[number]
const PROPS = { title: 'ops board', isFocused: true, bodyColumns: 120, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }

async function start($: Engine, clock: MockClock, surface: Surface): Promise<Mounted<Surface, 'Pane'>> {
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.settle()
  return $.ui.mount({ plugin: 'ops-board', surface, component: 'Pane', requestId: 'ops-board', props: PROPS })
}
const head = async (pane: Mounted<Surface, 'Pane'>, box: string) => (await pane.find({ key: 'head:' + box }))?.text

for (const surface of SURFACES) {
  test(`${surface}: F81 c lists the proposals in the pane; Accept all runs each one's ticket-meta subcommand, then re-reads the board`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': BOARD })
    w.answer = argv => {
      const a = argv.slice(2)
      if (a[0] === 'reconcile') return ran(PROPOSALS)
      if (a[0] === 'unblock') {
        w.files['/r/TICKETS.md'] = w.files['/r/TICKETS.md']!.replace('- [!] B2 — /orders 500s past page 3 (blocked: F1)', '- [ ] B2 — /orders 500s past page 3')
        return ran('- [ ] B2 — /orders 500s past page 3\n')
      }
      return ['start', 'testing', 'block'].includes(a[0]!) ? ran('- [x] ok\n') : null
    }
    const pane = await start($, clock, surface)
    expect((await pane.find({ key: 'key:reconcile' }))?.props.hotkey).toBe('c')
    expect(await head(pane, '!')).toMatch(/\(2\)$/)
    await pane.press({ key: 'key:reconcile' })

    expect(w.runs).toEqual([sh('reconcile')])
    expect(w.opens.filter(o => o.id !== 'ops-board')).toEqual([])        // B5: the board itself, no second pane
    expect(w.opens.at(-1)).toEqual({ id: 'ops-board', focus: undefined, closeOnEscape: true })
    expect((await pane.find({ key: 'form:title' }))?.text).toBe('Reconcile tickets  Esc cancels')
    expect(await pane.find({ key: 'row:B1' })).toBeUndefined()           // the form in place of the Tickets view
    expect((await pane.find({ key: 'rec:B2' }))?.text).toBe('[ ] B2  ● blocked -> ● pending  blocked on F1, now done')
    expect((await pane.find({ key: 'rec:F8' }))?.text).toBe('[ ] F8  ● in progress -> ● blocked  RUN-0001 stage 1 failed')
    // evidence unclear: shown, kept, not a button
    expect((await pane.find({ key: 'rec:B9' }))?.type).not.toBe('Button')
    expect((await pane.find({ key: 'rec:B9' }))?.text).toBe("    B9  ● blocked  stays - evidence unclear: blocked on 'the vendor fix', no ticket to check")
    expect(await pane.find({ key: 'reconcile:picked' })).toBeUndefined()

    await pane.press({ key: 'reconcile:all' })
    await clock.settle()
    expect(w.runs.slice(1)).toEqual([sh('unblock', 'B2'), sh('start', 'B1'),
      sh('testing', 'B7', 'code landed in abc1235; the owner must confirm: a live check'), sh('block', 'F8', 'RUN-0001 stage 1 failed')])
    expect(w.toasts.at(-1)).toBe(['✓ reconcile: 4 of 4 applied', '✓ B2 now pending', '✓ B1 now in progress', '✓ B7 now testing', '✓ F8 now blocked'].join('\n'))
    expect(await form($)).toBeNull()
    expect(await pane.find({ key: 'form:title' })).toBeUndefined()
    expect(w.closes).toEqual([])
    // the board read again at once: B2 left the blocked group
    expect(await head(pane, '!')).toMatch(/\(1\)$/)
    expect(w.writes).toEqual([])
    await pane.unmount()
  })

  test(`${surface}: F81 pick applies only the rows picked; a refusal goes in the toast`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': BOARD })
    w.answer = argv => argv[2] === 'reconcile' ? ran(PROPOSALS)
      : argv[2] === 'block' ? ran('', 1, 'ticket-meta: F8 is [x] (closed) - reopen it first (assign), then block\n') : null
    const pane = await start($, clock, surface)
    await pane.press({ key: 'key:reconcile' })
    await pane.press({ key: 'rec:F8' })
    expect((await pane.find({ key: 'rec:F8' }))?.text).toMatch(/^\[x\] F8 /)
    await pane.press({ key: 'rec:B1' })
    await pane.press({ key: 'rec:B1' })                                  // picked, then unpicked
    expect((await pane.find({ key: 'rec:B1' }))?.text).toMatch(/^\[ \] B1 /)
    expect(await form($)).toMatchObject({ picked: ['F8'] })
    expect((await pane.find({ key: 'reconcile:picked' }))?.text).toBe('Apply picked (1)')
    await pane.press({ key: 'reconcile:picked' })
    expect(w.runs.slice(1)).toEqual([sh('block', 'F8', 'RUN-0001 stage 1 failed')])
    expect(w.toasts.at(-1)).toBe('✗ reconcile: 0 of 1 applied\n✗ F8 refused: ticket-meta: F8 is [x] (closed) - reopen it first (assign), then block')
    expect(await form($)).toBeNull()
    expect(w.writes).toEqual([])
    await pane.unmount()
  })

  test(`${surface}: F81 None and Esc close the form with nothing applied`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': BOARD })
    w.answer = argv => argv[2] === 'reconcile' ? ran(PROPOSALS) : null
    const pane = await start($, clock, surface)
    await pane.press({ key: 'key:reconcile' })
    await pane.press({ key: 'rec:B2' })
    await pane.press({ key: 'reconcile:none' })
    expect(await form($)).toBeNull()
    expect(await pane.find({ key: 'key:reconcile' })).toBeDefined()
    await pane.press({ key: 'key:reconcile' })
    await $.command.run({ command: 'close', args: 'ops-board', ...RUN })
    expect(await form($)).toBeNull()
    expect(w.closes).toEqual([])                                        // Esc cancels the form, the board stays
    expect(w.runs).toEqual([sh('reconcile'), sh('reconcile')])
    await pane.unmount()
  })
}

test('F81 nothing to reconcile, or reconcile refused: a toast, no form', WITH, async ($, on) => {
  const [w, clock] = world(on, { '/r/TICKETS.md': BOARD })
  let out = ran('no change: nothing to reconcile\n')
  w.answer = () => out
  const pane = await start($, clock, 'terminal')
  await pane.press({ key: 'key:reconcile' })
  expect(w.toasts.at(-1)).toBe('ops board: reconcile - every [!] [ ] [~] row matches its evidence')
  expect(await form($)).toBeNull()
  out = ran('', 1, 'ticket-meta: no TICKETS.md at /r/TICKETS.md\n')
  await pane.press({ key: 'key:reconcile' })
  expect(w.toasts.at(-1)).toBe('✗ ticket-meta reconcile refused: ticket-meta: no TICKETS.md at /r/TICKETS.md')
  expect(await pane.find({ key: 'form:title' })).toBeUndefined()
  await pane.unmount()
})
