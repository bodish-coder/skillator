import { test, expect, mock } from 'claude-code/testing'
import type { On, ProcessRunInit, ProcessRunResult } from 'claude-code'
import type { Engine, MockClock, Mounted, Plugin } from 'claude-code/testing'

// F47: the assign / decide form, the Decided button and the team (add, remove),
// every write through ticket-meta, never a file write of the mod's own.
// B5: the forms are drawn INSIDE the ops-board pane - no second pane is opened
// (a pane opened while the board holds the keys is refused the focus and stays an
// unshown tab). Every flow here runs in the one mounted ops-board pane.

const BOARD = `# Tickets

## Open

- [~] F3 — cart drawer keeps items on reload [app: web] [owner: @vidul] (@cc-4ae496)
- [?] F2 — /orders endpoint returns the last 20 orders [app: api] [decide: @asha]
- [ ] B1 — button focus ring missing [app: ui]
- [>] A4 — dark-mode tokens for packages/ui

## Closed

- [x] F1 — product grid on the home page [app: web, ui] [by: @vidul, @asha]
`
const TEAM = '# Team\n\n- @vidul: Vidul@ikran.in\n  name: Vidul\n- @asha: asha@example.com\n  name: Asha\n'
const META = '/s/skills/tickets-zordon/scripts/ticket-meta'

type Run = { argv: readonly string[]; init: ProcessRunInit | undefined }
type Open = { id: string; title?: string; focus?: true; closeOnEscape?: true; holdToasts?: true; rows?: number }
type World = {
  files: Record<string, string>
  runs: Run[]
  opens: Open[]
  closes: string[]
  scrolls: number[]
  toasts: string[]
  writes: string[]
  answer: (argv: readonly string[]) => ProcessRunResult | null
}
const ran = (stdout: string, exitCode = 0, stderr = ''): ProcessRunResult =>
  ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false })

function world(on: On, files: Record<string, string>, env: Record<string, string> = {}): [World, MockClock] {
  const w: World = { files: { ...files, [META + '.sh']: '#!/bin/sh\n' }, runs: [], opens: [], closes: [], scrolls: [], toasts: [], writes: [], answer: () => null }
  const at = (p: string) => w.files[p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')]
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.env(on, { SKILLATOR_ROOT: '/s', ...env })
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
    // The band's background polls (pending --machine, relay list: F48) are not the form's calls.
    if (e.argv.some(a => /(pending|relay-morpheus)\.(sh|ps1)$/.test(a))) return { value: ran('', 1, 'not in this test') }
    w.runs.push({ argv: e.argv, init: e.init })
    return { value: w.answer(e.argv) ?? ran('', 1, 'unexpected call') }
  })
  on('ui.open', ($, e) => {
    w.opens.push({ id: e.id, title: e.title, focus: e.focus, closeOnEscape: e.closeOnEscape, holdToasts: e.holdToasts, rows: e.rows })
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', ($, e) => { w.closes.push(e.id); return { value: undefined } })
  on('ui.toast', ($, e) => { w.toasts.push(e.text); return { value: undefined } })
  on('ui.scroll', ($, e) => { w.scrolls.push(e.offset); return {} })
  // The person's ring moves (select). The mod's own $.ui.focus onto a form's first
  // element is not answered by the mock engine (no ring beneath it): it is caught,
  // and the ring's landing is the owner's live check.
  on('ui.focus', () => ({}))
  return [w, clock]
}

// The test's `$` has no state noun: an inline plugin reads the mod's state back.
const PEEK: Plugin = {
  name: 'peek',
  register(on) {
    // Another plugin closing the pane stands for Esc: the same ui.close chain.
    on('command.run', { command: 'close' }, async ($, e) => { await $.ui.close({ id: e.args }); return { text: 'closed' } })
    on('command.run', { command: 'peek' }, async ($, e) => {
      const v = e.args === 'assign' ? await $.state.get({ plugin: 'ops-board', key: 'assign' })
        : e.args === 'person' ? await $.state.get({ plugin: 'ops-board', key: 'person' })
        : e.args === 'selected' ? await $.state.get({ plugin: 'ops-board', key: 'selected' })
        : await $.state.get({ plugin: 'ops-board', key: 'teamView' })
      return { text: JSON.stringify(v.value ?? null) }
    })
  },
}
const WITH = { plugins: [PEEK] }
const RUN = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
const state = async ($: Engine, key: 'assign' | 'person' | 'teamView' | 'selected') =>
  JSON.parse((await $.command.run({ command: 'peek', args: key, ...RUN })).text ?? 'null') as unknown

async function start($: Engine, clock: MockClock) {
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.settle()
}

const SURFACES = ['terminal', 'desktop'] as const
type Surface = (typeof SURFACES)[number]
const props = (title: string) => ({ title, isFocused: true, bodyColumns: 54, placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 40 }, view: {} })
// F61: groups start collapsed; these tests act on rows, so every group is opened first.
async function openAll(pane: Mounted<Surface, 'Pane'>) {
  for (const b of (await pane.findAll({ type: 'Button' })).filter(x => x.key?.startsWith('head:') && x.text.endsWith(' ▸')))
    await pane.press({ key: b.key! })
}
const mountPane = async ($: Engine, surface: Surface) => {
  const pane = await $.ui.mount({ plugin: 'ops-board', surface, component: 'Pane', requestId: 'ops-board', props: props('ops board') })
  await openAll(pane)
  // opening ends on a header; the first row is the selection, as before groups collapsed
  const first = (await pane.findAll({ type: 'Button' })).find(x => x.key?.startsWith('row:'))
  if (first) await $.ui.focus({ component: 'Pane', requestId: 'ops-board', plugin: 'ops-board', element: first.key!, origin: { kind: 'person' } })
  return pane
}
const select = ($: Engine, id: string) =>
  $.ui.focus({ component: 'Pane', requestId: 'ops-board', plugin: 'ops-board', element: 'row:' + id, origin: { kind: 'person' } })
// Every pane the mod opened is the ops board itself: never a second pane.
const onlyBoard = (w: World) => expect([...new Set(w.opens.map(o => o.id))]).toEqual(['ops-board'])
// A form up: the board re-opened with Esc as the form's Cancel, nothing else asked.
const formOpen = (w: World) => {
  const o = w.opens.at(-1)!
  expect([o.id, o.title, o.closeOnEscape, o.focus, o.holdToasts]).toEqual(['ops-board', 'ops board', true, undefined, undefined])
}
// The form gone: Esc is the board's own again (hands the keys back, no close).
const formClosed = (w: World) => {
  const o = w.opens.at(-1)!
  expect([o.id, o.closeOnEscape]).toEqual(['ops-board', undefined])
}
const title = async (pane: Mounted<Surface, 'Pane'>) => (await pane.find({ key: 'form:title' }))?.text

for (const surface of SURFACES) {
  test(`${surface}: a on a done ticket opens the form in the pane; who and kind change the preview; Assign runs ticket-meta`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': TEAM })
    w.answer = argv => argv.at(-3) === 'decide' ? ran('- [?] F1 — product grid on the home page [app: web, ui] [decide: @asha] [by: @vidul, @asha]\n') : null
    await start($, clock)
    const pane = await mountPane($, surface)
    expect((await pane.find({ key: 'key:assign' }))?.props.hotkey).toBe('a')
    expect((await pane.find({ key: 'key:decide' }))?.props.hotkey).toBe('d')
    expect((await pane.find({ key: 'key:team' }))?.props.hotkey).toBe('t')
    await pane.press({ key: 'key:done' })
    await openAll(pane)
    await select($, 'F1')
    await pane.press({ key: 'key:assign' })

    formOpen(w)
    onlyBoard(w)
    expect(await state($, 'assign')).toEqual({ id: 'F1', kind: 'owner', handle: '@vidul', result: null })
    // the form replaces the Tickets view in the same pane
    expect(await pane.find({ key: 'row:F3' })).toBeUndefined()
    expect(await title(pane)).toBe('Assign F1  Esc cancels')
    expect((await pane.find({ key: 'title' }))?.text).toBe('● done  product grid on the home page')
    expect((await pane.find({ key: 'kind:implementation' }))?.text).toBe('(•) implementation')
    expect((await pane.find({ key: 'kind:decision' }))?.text).toBe('( ) decision')
    expect((await pane.find({ key: 'who:@vidul' }))?.text).toMatch(/^› @vidul +Vidul/)
    expect((await pane.find({ key: 'who:@asha' }))?.text).toMatch(/^ {2}@asha +Asha/)
    expect((await pane.find({ key: 'who:+add' }))?.text).toBe('  + add person')
    expect((await pane.find({ key: 'change' }))?.text).toBe('Change  ● done -> ● pending  owner @vidul')
    expect((await pane.find({ key: 'runs' }))?.text).toBe('Runs    ticket-meta assign F1 @vidul')
    expect((await pane.find({ key: 'go' }))?.props.variant).toBe('primary')
    expect(await pane.find({ key: 'cancel' })).toBeDefined()
    // State is colour in the Change line: the two dots differ.
    const dots = (await pane.find({ key: 'change' }))!.children
      .filter(c => typeof (c as { children?: unknown[] }).children?.[0] === 'string' && ((c as { children: string[] }).children[0]!).startsWith('●'))
      .map(c => (c as { props: { color?: string } }).props.color)
    expect(dots).toHaveLength(2)
    expect(dots[0]).not.toBe(dots[1])

    await pane.press({ key: 'who:@asha' })
    expect((await pane.find({ key: 'runs' }))?.text).toBe('Runs    ticket-meta assign F1 @asha')
    await pane.press({ key: 'kind:decision' })
    expect((await pane.find({ key: 'kind:decision' }))?.text).toBe('(•) decision')
    expect(await title(pane)).toBe('Assign F1 for a decision  Esc cancels')
    expect((await pane.find({ key: 'change' }))?.text).toBe('Change  ● done -> ● decision  decide @asha')
    expect((await pane.find({ key: 'runs' }))?.text).toBe('Runs    ticket-meta decide F1 @asha')

    await pane.press({ key: 'go' })
    // runCall, end to end: the engine sees the sh argv, run in the main checkout.
    expect(w.runs).toHaveLength(1)
    expect(w.runs[0]!.argv).toEqual(['/bin/sh', META + '.sh', 'decide', 'F1', '@asha'])
    expect(w.runs[0]!.init?.cwd?.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')).toBe('/r')
    expect(w.runs[0]!.init?.timeoutMs).toBe(30000)
    expect(w.toasts).toHaveLength(1)
    expect(w.toasts[0]).toContain('✓ F1 reopened as pending decision, for @asha to decide: product grid on the home page')
    expect(w.toasts[0]).toContain(`ran: /bin/sh ${META}.sh decide F1 @asha`)
    // back on the Tickets view, the board never closed
    expect(w.closes).toEqual([])
    formClosed(w)
    onlyBoard(w)
    expect(await state($, 'assign')).toBeNull()
    expect(await pane.find({ key: 'row:F3' })).toBeDefined()
    expect(await pane.find({ key: 'form:title' })).toBeUndefined()
    expect(w.writes).toEqual([])
    await pane.unmount()
  })

  test(`${surface}: d on an in-progress ticket warns first; the ps1 form on Windows; its warning reaches the toast`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': TEAM }, { OS: 'Windows_NT' })
    w.answer = () => ran('- [ ] F3 — cart drawer keeps items on reload [app: web] [owner: @asha] (@cc-4ae496)\n' +
      'warning: F3 was in progress under @cc-4ae496 - its box left [~], the session tag stays; tell that session\n')
    await start($, clock)
    const pane = await mountPane($, surface)
    await pane.press({ key: 'key:decide' })            // F3, the first row, is selected
    expect(await state($, 'assign')).toEqual({ id: 'F3', kind: 'decide', handle: '@vidul', result: null })
    formOpen(w)
    expect(await title(pane)).toBe('Assign F3 for a decision  Esc cancels')
    expect((await pane.find({ key: 'kind:decision' }))?.text).toBe('(•) decision')
    expect((await pane.find({ key: 'warn' }))?.text).toBe('! F3 is in progress under @cc-4ae496 - this moves it to decision; the tag stays - tell that session')
    await pane.press({ key: 'kind:implementation' })
    await pane.press({ key: 'who:@asha' })
    expect((await pane.find({ key: 'change' }))?.text).toBe('Change  ● in progress -> ● pending  owner @asha')
    expect((await pane.find({ key: 'warn' }))?.text).toBe('! F3 is in progress under @cc-4ae496 - this moves it to pending; the tag stays - tell that session')
    await pane.press({ key: 'go' })
    expect(w.runs[0]!.argv).toEqual(['C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', META + '.ps1', 'assign', 'F3', '@asha'])
    expect(w.toasts[0]).toContain('✓ F3 now pending, owned by @asha: cart drawer keeps items on reload')
    expect(w.toasts[0]).toContain('warning: F3 was in progress under @cc-4ae496 - its box left [~], the session tag stays; tell that session')
    expect(w.toasts[0]).toContain('ran: C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -ExecutionPolicy Bypass -File ' + META + '.ps1 assign F3 @asha')
    onlyBoard(w)
    expect(w.writes).toEqual([])
    await pane.unmount()
  })

  test(`${surface}: ticket-meta refusing leaves the form up with its stderr; Cancel goes back to Tickets`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': TEAM })
    w.answer = () => ran('', 1, 'ticket-meta: board is locked by another edit (TICKETS.md.lock)\n')
    await start($, clock)
    const pane = await mountPane($, surface)
    await select($, 'B1')
    await pane.press({ key: 'key:assign' })
    await pane.press({ key: 'go' })
    expect((await pane.find({ key: 'result' }))?.text).toBe('ticket-meta: board is locked by another edit (TICKETS.md.lock)')
    expect(w.toasts).toEqual([])
    expect((await state($, 'assign') as { result: string }).result).toContain('board is locked')
    formOpen(w)
    expect(w.writes).toEqual([])
    await pane.press({ key: 'cancel' })
    expect(w.closes).toEqual([])
    expect(await state($, 'assign')).toBeNull()
    formClosed(w)
    expect(await pane.find({ key: 'row:B1' })).toBeDefined()
    onlyBoard(w)
    await pane.unmount()
  })

  test(`${surface}: Decided on a ticket waiting on a decision runs ticket-meta decided`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': TEAM })
    w.answer = () => ran('- [ ] F2 — /orders endpoint returns the last 20 orders [app: api] [decide: @asha]\n')
    await start($, clock)
    const pane = await mountPane($, surface)
    await pane.press({ key: 'decided:F2' })
    expect(w.runs.map(r => r.argv)).toEqual([['/bin/sh', META + '.sh', 'decided', 'F2']])
    expect(w.toasts[0]).toContain('✓ F2 decided, now pending: /orders endpoint returns the last 20 orders')
    expect(w.toasts[0]).toContain(`ran: /bin/sh ${META}.sh decided F2`)
    expect(w.writes).toEqual([])
    await pane.unmount()
  })

  test(`${surface}: + add person in the assign form runs ticket-meta team add, then picks the new person`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': TEAM })
    w.answer = argv => argv.includes('team') ? ran('- @ravi: ravi@example.com, r@x.org   name: Ravi Kumar\n') : null
    await start($, clock)
    const pane = await mountPane($, surface)
    await select($, 'B1')
    await pane.press({ key: 'key:assign' })
    await pane.press({ key: 'who:+add' })
    expect(await title(pane)).toBe('Add person  Esc cancels')
    expect(await pane.find({ key: 'handle' })).toBeDefined()
    await pane.input({ key: 'handle', text: 'Ravi', kind: 'change' })
    await pane.input({ key: 'name', text: 'Ravi Kumar', kind: 'change' })
    await pane.input({ key: 'emails', text: 'ravi@example.com, r@x.org', kind: 'change' })
    expect((await pane.find({ key: 'runs' }))?.text).toBe('Runs    ticket-meta team add @ravi "Ravi Kumar" ravi@example.com,r@x.org')
    await pane.press({ key: 'add' })
    expect(w.runs.map(r => r.argv)).toEqual([['/bin/sh', META + '.sh', 'team', 'add', '@ravi', 'Ravi Kumar', 'ravi@example.com,r@x.org']])
    expect(w.toasts[0]).toContain('✓ @ravi added to .skillator/team.md')
    // back on the assign form, the new person picked
    expect(await state($, 'person')).toBeNull()
    expect((await state($, 'assign') as { handle: string }).handle).toBe('@ravi')
    expect(await title(pane)).toBe('Assign B1  Esc cancels')
    expect((await pane.find({ key: 'runs' }))?.text).toBe('Runs    ticket-meta assign B1 @ravi')
    formOpen(w)
    onlyBoard(w)
    expect(w.closes).toEqual([])
    expect(w.writes).toEqual([])
    await pane.unmount()
  })

  test(`${surface}: Cancel on add person from the assign form goes back to the assign form`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': TEAM })
    await start($, clock)
    const pane = await mountPane($, surface)
    await select($, 'B1')
    await pane.press({ key: 'key:assign' })
    await pane.press({ key: 'who:+add' })
    await pane.press({ key: 'cancel' })
    expect(await state($, 'person')).toBeNull()
    expect(await title(pane)).toBe('Assign B1  Esc cancels')
    formOpen(w)
    expect(w.runs).toEqual([])
    await pane.unmount()
  })

  // F77: the ticket chosen by number. A ticket selected: the Ticket field is there,
  // prefilled with its ID, and shows its title and state.
  test(`${surface}: F77 a on a selected ticket prefills the Ticket field with its ID, title and state`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': TEAM })
    await start($, clock)
    const pane = await mountPane($, surface)
    await select($, 'B1')
    await pane.press({ key: 'key:assign' })
    expect(w.toasts).toEqual([])
    expect((await pane.find({ key: 'ticket' }))?.props.value).toBe('B1')
    expect(await title(pane)).toBe('Assign B1  Esc cancels')
    expect((await pane.find({ key: 'title' }))?.text).toBe('● pending  button focus ring missing')
    expect(await pane.find({ key: 'go' })).toBeDefined()
    formOpen(w)
    onlyBoard(w)
    await pane.unmount()
  })

  // No ticket selected (a header): the form opens with an empty Ticket field instead
  // of the toast; a typed ID, any case, resolves against the board; Assign waits for it.
  test(`${surface}: F77 a with no ticket selected opens the form with a Ticket field; f2 resolves and Assign runs on F2`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': TEAM })
    w.answer = () => ran('- [?] F2 — /orders endpoint returns the last 20 orders [app: api] [decide: @asha]\n')
    await start($, clock)
    const pane = await mountPane($, surface)
    await $.ui.focus({ component: 'Pane', requestId: 'ops-board', plugin: 'ops-board', element: 'head:?', origin: { kind: 'person' } })
    expect(await state($, 'selected')).toBe('head:?')
    await pane.press({ key: 'key:decide' })
    expect(w.toasts).toEqual([])
    formOpen(w)
    onlyBoard(w)
    expect(await title(pane)).toBe('Assign a ticket for a decision  Esc cancels')
    expect((await pane.find({ key: 'ticket' }))?.props.value).toBe('')
    expect((await pane.find({ key: 'title' }))?.text).toBe('type a ticket ID, e.g. F12')
    expect(await pane.find({ key: 'go' })).toBeUndefined()
    expect(await pane.find({ key: 'change' })).toBeUndefined()
    await pane.input({ key: 'ticket', text: 'f2', kind: 'change' })
    expect(await title(pane)).toBe('Assign F2 for a decision  Esc cancels')
    expect((await pane.find({ key: 'title' }))?.text).toBe('● pending decision  /orders endpoint returns the last…')   // cut to the 54-column body
    expect((await pane.find({ key: 'runs' }))?.text).toBe('Runs    ticket-meta decide F2 @vidul')
    await pane.press({ key: 'who:@asha' })
    await pane.press({ key: 'go' })
    expect(w.runs.map(r => r.argv)).toEqual([['/bin/sh', META + '.sh', 'decide', 'F2', '@asha']])
    expect(w.toasts[0]).toContain('✓ F2 now pending decision, for @asha to decide: /orders endpoint returns the last 20 orders')
    formClosed(w)
    expect(w.writes).toEqual([])
    await pane.unmount()
  })

  test(`${surface}: F77 an unknown ID says no such ticket and offers no Assign`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': TEAM })
    await start($, clock)
    const pane = await mountPane($, surface)
    await $.ui.focus({ component: 'Pane', requestId: 'ops-board', plugin: 'ops-board', element: 'head: ', origin: { kind: 'person' } })
    await pane.press({ key: 'key:assign' })
    await pane.input({ key: 'ticket', text: 'F99', kind: 'change' })
    expect((await pane.find({ key: 'title' }))?.text).toBe('no such ticket')
    expect(await title(pane)).toBe('Assign a ticket  Esc cancels')
    expect(await pane.find({ key: 'go' })).toBeUndefined()
    expect((await pane.find({ key: 'runs' }))?.text).toBe('Runs    ticket-meta assign <ID> @vidul')
    await pane.input({ key: 'ticket', text: 'F99', kind: 'submit' })
    expect(w.runs).toEqual([])
    expect(w.toasts).toEqual([])
    formOpen(w)
    await pane.unmount()
  })

  test(`${surface}: F77 a changed ID moves the form to that ticket; Assign runs on the new one`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': TEAM })
    w.answer = () => ran('- [ ] F3 — cart drawer keeps items on reload [app: web] [owner: @asha] (@cc-4ae496)\n')
    await start($, clock)
    const pane = await mountPane($, surface)
    await select($, 'B1')
    await pane.press({ key: 'key:assign' })
    expect((await pane.find({ key: 'ticket' }))?.props.value).toBe('B1')
    await pane.input({ key: 'ticket', text: 'f3', kind: 'change' })
    expect(await title(pane)).toBe('Assign F3  Esc cancels')
    expect((await pane.find({ key: 'title' }))?.text).toBe('● in progress  cart drawer keeps items on reload')
    expect((await pane.find({ key: 'warn' }))?.text).toBe('! F3 is in progress under @cc-4ae496 - this moves it to pending; the tag stays - tell that session')
    await pane.press({ key: 'who:@asha' })
    await pane.press({ key: 'go' })
    expect(w.runs.map(r => r.argv)).toEqual([['/bin/sh', META + '.sh', 'assign', 'F3', '@asha']])
    expect(w.toasts[0]).toContain('✓ F3 now pending, owned by @asha: cart drawer keeps items on reload')
    onlyBoard(w)
    expect(w.writes).toEqual([])
    await pane.unmount()
  })

  test(`${surface}: t opens the team view; add and remove go through ticket-meta; t goes back`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': TEAM })
    w.answer = argv => argv.includes('remove')
      ? ran('removed: @asha\nwarning: @asha is still named on open tickets: F2 - reassign them\n')
      : argv.includes('add') ? ran('- @ravi: ravi@example.com   name: Ravi\n') : null
    await start($, clock)
    const pane = await mountPane($, surface)
    await pane.press({ key: 'key:team' })
    expect(await pane.find({ key: 'row:F3' })).toBeUndefined()
    expect((await pane.find({ key: 'member:@vidul' }))?.text).toMatch(/^@vidul +Vidul +vidul@ikran\.in +\(you\) · 1 owned/)
    expect((await pane.find({ key: 'member:@asha' }))?.text).toMatch(/^@asha +Asha +asha@example\.com +1 decide/)
    expect((await pane.find({ key: 'team:add' }))?.props.hotkey).toBe('a')
    expect((await pane.find({ key: 'team:remove' }))?.props.hotkey).toBe('r')
    expect((await pane.find({ key: 'team:back' }))?.props.hotkey).toBe('t')

    await pane.press({ key: 'team:add' })
    formOpen(w)
    onlyBoard(w)
    expect(await title(pane)).toBe('Add person  Esc cancels')
    expect(await pane.find({ key: 'member:@vidul' })).toBeUndefined()
    await pane.input({ key: 'handle', text: '@ravi', kind: 'change' })
    await pane.input({ key: 'name', text: 'Ravi', kind: 'change' })
    await pane.input({ key: 'emails', text: 'ravi@example.com', kind: 'change' })
    await pane.press({ key: 'add' })
    expect(w.runs.at(-1)!.argv).toEqual(['/bin/sh', META + '.sh', 'team', 'add', '@ravi', 'Ravi', 'ravi@example.com'])
    // back on the Team view
    expect(w.closes).toEqual([])
    formClosed(w)
    expect(await pane.find({ key: 'member:@asha' })).toBeDefined()

    await pane.press({ key: 'member:@asha' })
    await pane.press({ key: 'team:remove' })
    expect(w.runs).toHaveLength(1)                       // asks first
    expect((await pane.find({ key: 'confirm' }))?.text).toContain('remove @asha from .skillator/team.md?')
    await pane.press({ key: 'team:remove-yes' })
    expect(w.runs.at(-1)!.argv).toEqual(['/bin/sh', META + '.sh', 'team', 'remove', '@asha'])
    expect(w.toasts.at(-1)).toContain('warning: @asha is still named on open tickets: F2 - reassign them')
    expect(w.toasts.at(-1)).toContain(`ran: /bin/sh ${META}.sh team remove @asha`)

    await pane.press({ key: 'team:back' })
    expect(await pane.find({ key: 'row:F3' })).toBeDefined()
    expect(await state($, 'teamView')).toBeNull()
    expect(w.writes).toEqual([])
    await pane.unmount()
  })

  // F80: the lead marked `lead`, me `(you)`, `you: @h` heading the view; l makes the
  // selected person lead through ticket-meta team lead, its refusal the toast.
  test(`${surface}: F80 the Team view marks the lead and you; l makes the selected person lead through ticket-meta`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': TEAM.replace('# Team\n', '# Team\nlead: @asha\n') })
    w.answer = argv => argv.includes('lead') ? ran('', 1, 'ticket-meta: only the lead @asha may hand the lead over or clear it (you: @vidul)\n') : null
    await start($, clock)
    const pane = await mountPane($, surface)
    await pane.press({ key: 'key:team' })
    expect((await pane.find({ key: 'team:you' }))?.text).toBe('you: @vidul')
    expect((await pane.find({ key: 'member:@asha' }))?.text).toMatch(/^@asha +Asha +asha@example\.com +lead · 1 decide/)
    expect((await pane.find({ key: 'member:@vidul' }))?.text).toMatch(/^@vidul +Vidul +vidul@ikran\.in +\(you\) · 1 owned/)
    expect((await pane.find({ key: 'team:lead' }))?.props.hotkey).toBe('l')
    await pane.press({ key: 'member:@vidul' })
    await pane.press({ key: 'team:lead' })
    expect(w.runs.at(-1)!.argv).toEqual(['/bin/sh', META + '.sh', 'team', 'lead', '@vidul'])
    expect(w.toasts.at(-1)).toContain('✗ ticket-meta team lead @vidul refused: ticket-meta: only the lead @asha may hand the lead over or clear it (you: @vidul)')
    expect(w.writes).toEqual([])
    await pane.unmount()
  })
}

// B5: the owner pressed a / d / add with the ops-board pane holding the keys and saw
// nothing: each opened a second pane (`ops-assign`) the host refused the focus, left
// as an unshown tab. No press may open any pane but the board itself.
test('a, d, + add person and the Team view add open NO second pane', WITH, async ($, on) => {
  const [w, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': TEAM })
  await start($, clock)
  const pane = await mountPane($, 'terminal')
  await pane.press({ key: 'key:assign' })
  expect(await pane.find({ key: 'form:title' })).toBeDefined()
  await pane.press({ key: 'who:+add' })
  await pane.press({ key: 'cancel' })
  await pane.press({ key: 'cancel' })
  await pane.press({ key: 'key:decide' })
  await pane.press({ key: 'cancel' })
  await pane.press({ key: 'key:team' })
  await pane.press({ key: 'team:add' })
  await pane.press({ key: 'cancel' })
  await pane.press({ key: 'team:add-row' })
  expect(await pane.find({ key: 'handle' })).toBeDefined()
  expect(w.opens.length).toBeGreaterThan(0)
  expect(w.opens.filter(o => o.id !== 'ops-board')).toEqual([])
  expect(w.opens.filter(o => o.focus)).toEqual([])      // no focus request the host could refuse
  await pane.unmount()
})

test('Cancel on add person from the Team view goes back to the Team view', WITH, async ($, on) => {
  const [w, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': TEAM })
  await start($, clock)
  const pane = await mountPane($, 'terminal')
  await pane.press({ key: 'key:team' })
  await pane.press({ key: 'team:add' })
  await pane.press({ key: 'cancel' })
  expect(await state($, 'person')).toBeNull()
  expect(await pane.find({ key: 'member:@vidul' })).toBeDefined()
  expect(await state($, 'teamView')).not.toBeNull()
  formClosed(w)
  await pane.unmount()
})

test('no team file: the form says so and still offers + add person', WITH, async ($, on) => {
  const [w, clock] = world(on, { '/r/TICKETS.md': BOARD })
  await start($, clock)
  const pane = await mountPane($, 'terminal')
  await pane.press({ key: 'key:assign' })
  expect((await pane.find({ key: 'noteam' }))?.text).toBe('no .skillator/team.md yet - add a person first')
  expect(await pane.find({ key: 'who:+add' })).toBeDefined()
  expect(await pane.find({ key: 'go' })).toBeUndefined()
  expect(w.runs).toEqual([])
  await pane.unmount()
})

test('the add person form refuses a bad handle before any run', WITH, async ($, on) => {
  const [w, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': TEAM })
  await start($, clock)
  const pane = await mountPane($, 'terminal')
  await pane.press({ key: 'key:team' })
  await pane.press({ key: 'team:add' })
  await pane.input({ key: 'handle', text: 'bad name', kind: 'change' })
  await pane.input({ key: 'emails', text: 'b@x.com', kind: 'change' })
  await pane.press({ key: 'add' })
  expect(w.runs).toEqual([])
  expect((await pane.find({ key: 'result' }))?.text).toBe('handle: lower-case a-z 0-9 _ - after the @')
  await pane.unmount()
})

// Esc on the board while a form is up raises ui.close on the board (the form opens
// it closeOnEscape): the mod refuses that close and cancels the form instead.
test('Esc on a form clears the draft, keeps the board open and goes back to the view', WITH, async ($, on) => {
  const [w, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': TEAM })
  await start($, clock)
  const pane = await mountPane($, 'terminal')
  await pane.press({ key: 'key:assign' })
  expect(await state($, 'assign')).not.toBeNull()
  await $.command.run({ command: 'close', args: 'ops-board', ...RUN })
  expect(await state($, 'assign')).toBeNull()
  expect(w.closes).toEqual([])                          // refused: the board stays
  formClosed(w)
  expect(await pane.find({ key: 'row:F3' })).toBeDefined()
  // with no form up, a close is the board's own
  await $.command.run({ command: 'close', args: 'ops-board', ...RUN })
  expect(w.closes).toEqual(['ops-board'])
  await pane.unmount()
})

// B5 round 2 (1): a one-row arrow while a form is up is the form's scroll, never a
// move of the hidden Tickets selection.
test('up/down while a form is up scroll the form and leave the Tickets selection where it was', WITH, async ($, on) => {
  const [w, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': TEAM })
  await start($, clock)
  const pane = await mountPane($, 'terminal')
  await select($, 'F3')
  await pane.press({ key: 'key:assign' })
  await $.ui.scroll({ component: 'Pane', requestId: 'ops-board', offset: 1, by: 1, bodyRows: 6, contentRows: 20, origin: { kind: 'person' } })
  expect(await state($, 'selected')).toBe('F3')
  expect(w.scrolls).toEqual([1])                       // passed through as it came
  await pane.press({ key: 'cancel' })
  expect((await pane.find({ key: 'row:F3' }))?.children.some(c => (c as { props?: { inverse?: boolean } }).props?.inverse)).toBe(true)
  await pane.unmount()
})

// B5 round 2 (2): /ops while a form is up keeps Esc as the form's Cancel; /ops to
// another tab drops the form, so a later Esc or close is the board's own.
test('/ops while a form is up keeps Esc-as-Cancel; /ops runs drops the form and close is the board\'s', WITH, async ($, on) => {
  const [w, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': TEAM })
  await start($, clock)
  const pane = await mountPane($, 'terminal')
  await pane.press({ key: 'key:assign' })
  await $.command.run({ command: 'ops', args: '', ...RUN })
  expect([w.opens.at(-1)!.id, w.opens.at(-1)!.closeOnEscape]).toEqual(['ops-board', true])
  expect(await state($, 'assign')).not.toBeNull()
  await $.command.run({ command: 'ops', args: 'runs', ...RUN })
  expect(await state($, 'assign')).toBeNull()
  formClosed(w)
  await $.command.run({ command: 'close', args: 'ops-board', ...RUN })
  expect(w.closes).toEqual(['ops-board'])
  await pane.unmount()
})

// B5 round 2 (3): Esc on Add person opened from the assign form does what its Cancel
// does - one level back, to the assign form.
test('Esc on add person from the assign form goes back to the assign form', WITH, async ($, on) => {
  const [w, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': TEAM })
  await start($, clock)
  const pane = await mountPane($, 'terminal')
  await select($, 'B1')
  await pane.press({ key: 'key:assign' })
  await pane.press({ key: 'who:+add' })
  await $.command.run({ command: 'close', args: 'ops-board', ...RUN })
  expect(await state($, 'person')).toBeNull()
  expect((await state($, 'assign') as { id: string } | null)?.id).toBe('B1')
  expect(await title(pane)).toBe('Assign B1  Esc cancels')
  expect(w.closes).toEqual([])
  formOpen(w)
  await pane.unmount()
})

// Review fix: team.md is read as ticket-meta reads it (`- ` or `* `, handle case kept,
// dots allowed), and ticket-meta gets the handle exactly as written there.
test('team handles as ticket-meta reads them: @Asha assignable and removable, @j.doe and * @vidul listed', WITH, async ($, on) => {
  const team = '# Team\n\n- @Asha: asha@example.com\n  name: Asha\n- @j.doe: j@example.com\n* @vidul: Vidul@ikran.in\n'
  const [w, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': team })
  w.answer = argv => argv.includes('remove') ? ran('removed: @Asha\n')
    : argv.includes('decide') ? ran('- [?] F2 — /orders endpoint returns the last 20 orders [app: api] [decide: @Asha]\n') : null
  await start($, clock)
  const pane = await mountPane($, 'terminal')
  await select($, 'F2')
  await pane.press({ key: 'key:decide' })
  expect(await state($, 'assign')).toEqual({ id: 'F2', kind: 'decide', handle: '@Asha', result: null })
  expect(await pane.find({ key: 'who:@Asha' })).toBeDefined()
  expect(await pane.find({ key: 'who:@j.doe' })).toBeDefined()
  expect(await pane.find({ key: 'who:@vidul' })).toBeDefined()
  expect(await pane.find({ key: 'who:@asha' })).toBeUndefined()
  await pane.press({ key: 'go' })
  expect(w.runs.at(-1)!.argv).toEqual(['/bin/sh', META + '.sh', 'decide', 'F2', '@Asha'])

  await pane.press({ key: 'key:team' })
  expect((await pane.find({ key: 'member:@Asha' }))?.text).toMatch(/^@Asha +Asha +asha@example\.com +1 decide/)
  expect((await pane.find({ key: 'member:@vidul' }))?.text).toMatch(/\(you\) · 1 owned/)
  await pane.press({ key: 'member:@Asha' })
  await pane.press({ key: 'team:remove' })
  await pane.press({ key: 'team:remove-yes' })
  expect(w.runs.at(-1)!.argv).toEqual(['/bin/sh', META + '.sh', 'team', 'remove', '@Asha'])
  await pane.unmount()
})
