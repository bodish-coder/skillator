import { test, expect, mock } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'
import type { Engine, MockClock, Plugin } from 'claude-code/testing'

// The pane of mock `m-tickets`: one ticket per state, seven closed ones.
const OPEN = `# Tickets

## Open

- [~] F3 — cart drawer keeps items on reload [app: web] [owner: @vidul] (@cc-4ae496)
- [!] B2 — /orders 500s past page 3 [app: api] [by: @asha]
- [?] F2 — /orders endpoint returns the last 20 orders [app: api] [decide: @asha]
- [ ] F1 — product grid on the home page [app: web, ui] [by: @vidul, @asha]
- [ ] B1 — button focus ring missing [app: ui]
- [>] A4 — dark-mode tokens for packages/ui
`
const CLOSED = `
## Closed

- [x] B3 — login redirect loop
- [x] B4 — typo on the pricing page
- [x] B5 — footer overlaps on mobile
- [x] F4 — export button
- [x] F5 — search box
- [x] F6 — saved filters
- [-] B6 — old report layout
`
const BOARD = OPEN + CLOSED
const TEAM = '# Team\n\n- @vidul: Vidul@ikran.in\n- @asha: asha@example.com\n'

const PANE_ID = 'ops-board'
const PANE = { title: 'ops board', isFocused: true, bodyColumns: 54, placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 40 }, view: {} }

type File = { text: string; mtimeMs: number }
type World = {
  files: Record<string, File>
  placed?: boolean
  opens: { id: string; title?: string; focus?: true }[]
  scrolls: number
  offsets: number[]
  runs: (readonly string[])[]
  commands: string[]
}
const ran = (stdout: string, exitCode = 0): ProcessRunResult =>
  ({ exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })

// The engine beneath the plugin: a repo at /r, its files, git's email, the pane opener.
// readErr: TICKETS.md is there (stat answers) but the engine refuses its read.
function world(on: On, files: Record<string, string>, placed = true, readErr?: string): [World, MockClock] {
  const w: World = { files: {}, placed, opens: [], scrolls: 0, offsets: [], runs: [], commands: [] }
  for (const [p, text] of Object.entries(files)) w.files[p] = { text, mtimeMs: 1000 }
  // The engine hands a hook the path resolved for this machine (C:\r\TICKETS.md on Windows).
  const at = (p: string) => w.files[p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')]
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.env(on, {})
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.repo', () => ({ value: { root: '/r', remote: null, internal: false, name: 'r' } }))
  on('command.register', ($, e) => { w.commands.push(e.name); return { value: { command: e.name } } })
  on('fs.stat', ($, e) => {
    const f = at(e.path)
    return f ? { value: { kind: 'file' as const, size: f.text.length, mtimeMs: f.mtimeMs, isLink: false } } : { deny: 'ENOENT ' + e.path }
  })
  on('fs.exists', ($, e) => ({ value: !!at(e.path) }))
  on('fs.read', ($, e) => {
    const f = at(e.path)
    if (readErr && f && e.path.endsWith('TICKETS.md')) return { deny: readErr }
    return f ? { value: f.text } : { deny: 'ENOENT ' + e.path }
  })
  on('process.run', ($, e) => {
    w.runs.push(e.argv)
    return { value: e.argv.join(' ') === 'git config user.email' ? ran('vidul@ikran.in\n') : ran('', 1) }
  })
  on('ui.open', ($, e) => {
    w.opens.push({ id: e.id, title: e.title, focus: e.focus })
    return { value: w.placed ? { isPlaced: true as const } : { isPlaced: false as const, reason: 'narrow: 100 columns, 144 needed' } }
  })
  on('ui.scroll', ($, e) => { w.scrolls++; w.offsets.push(e.offset); return {} })
  on('ui.focus', () => ({}))
  return [w, clock]
}

async function start($: Engine, clock: MockClock) {
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.settle()
}

// The test's `$` has no state noun: an inline plugin reads the pane's state back.
const PEEK: Plugin = {
  name: 'peek',
  register(on) {
    on('command.run', { command: 'peek' }, async ($, e) => {
      const v = e.args === 'selected' ? await $.state.get({ plugin: 'ops-board', key: 'selected' })
        : e.args === 'expanded' ? await $.state.get({ plugin: 'ops-board', key: 'expanded' })
        : e.args === 'narrow' ? await $.state.get({ plugin: 'ops-board', key: 'narrow' })
        : e.args === 'tab' ? await $.state.get({ plugin: 'ops-board', key: 'tab' })
        : await $.state.get({ plugin: 'ops-board', key: 'me' })
      return { text: JSON.stringify(v.value ?? null) }
    })
  },
}
const WITH = { plugins: [PEEK] }
const RUN = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
const state = async ($: Engine, key: 'selected' | 'expanded' | 'narrow' | 'tab' | 'me') =>
  JSON.parse((await $.command.run({ command: 'peek', args: key, ...RUN })).text ?? 'undefined') as unknown

const SURFACES = ['terminal', 'desktop'] as const

const mountPane = ($: Engine, surface: (typeof SURFACES)[number], props = PANE) =>
  $.ui.mount({ plugin: 'ops-board', surface, component: 'Pane', requestId: PANE_ID, props })

const texts = async (ui: { findAll: (q: { type?: string; key?: string }) => Promise<{ key: string | undefined; text: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(t => t.text)

for (const surface of SURFACES) {
  test(`${surface}: rows grouped by state, coloured dots, chips and the count line`, WITH, async ($, on) => {
    const [, clock] = world(on, { '/r/TICKETS.md': BOARD })
    await start($, clock)
    const ui = await mountPane($, surface)

    expect((await ui.find({ key: 'row:F3' }))?.text).toMatch(/^● F3  cart drawer/)
    const heads = (await ui.findAll({ type: 'Box' })).filter(t => t.key?.startsWith('head:')).map(t => t.text)
    expect(heads).toEqual(['IN PROGRESS 1', 'BLOCKED 1', 'PENDING DECISION 1', 'PENDING 2', 'DEFERRED 1'])
    const rows = (await ui.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('row:')).map(b => b.key)
    expect(rows).toEqual(['row:F3', 'row:B2', 'row:F2', 'row:F1', 'row:B1', 'row:A4'])
    // State is colour, not a bracket code: the head and the dot share it.
    const dot = async (id: string) => ((await ui.find({ key: 'row:' + id }))!.children
      .find(c => (c as { children?: unknown[] }).children?.[0] === '●') as { props: { color?: string } }).props.color
    const head = async (box: string) => ((await ui.find({ key: 'head:' + box }))!.children[0] as { props: { color?: string } }).props.color
    expect(await dot('F3')).toBeDefined()
    expect(await head('~')).toBe(await dot('F3'))
    expect(await head('?')).toBe(await dot('F2'))
    expect(await dot('B2')).not.toBe(await dot('F3'))
    expect(await ui.find({ type: 'Button', text: /\[~\]/ })).toBeUndefined()
    // chips; the Decided button only on a ticket waiting on a decision
    expect((await ui.find({ key: 'chips:F3' }))?.text).toBe('    app:web  owner:@vidul  @cc-4ae496')
    expect((await ui.find({ key: 'chips:F1' }))?.text).toBe('    app:web app:ui  by:@vidul @asha')
    expect(await ui.find({ key: 'decided:F2' })).toBeDefined()
    expect(await ui.find({ key: 'decided:F1' })).toBeUndefined()
    expect((await ui.find({ key: 'count' }))?.text).toBe('5 open ●1 ●1 ●1 ●2 ●1 · 7 done hidden')
    for (const k of ['key:assign', 'key:decide', 'key:filter', 'key:done', 'tab:tickets', 'tab:runs', 'tab:health'])
      expect(await ui.find({ key: k }), k).toBeDefined()
    expect((await ui.find({ key: 'key:filter' }))?.props.hotkey).toBe('f')
    expect((await ui.find({ key: 'key:done' }))?.props.hotkey).toBe('x')
    await ui.unmount()
  })

  test(`${surface}: a board that is there but will not load names the error, never "no TICKETS.md"`, WITH, async ($, on) => {
    const [, clock] = world(on, { '/r/TICKETS.md': BOARD }, true, 'read budget exceeded')
    await start($, clock)
    const ui = await mountPane($, surface)
    const all = (await texts(ui)).join('\n')
    expect(all).not.toContain('no TICKETS.md')
    expect(all).toContain('read budget exceeded')
    expect(all).toContain('/archive-tickets')
    await ui.unmount()
  })

  test(`${surface}: x shows the closed groups, f opens the filters, app:api leaves B2 and F2`, WITH, async ($, on) => {
    const [, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': TEAM })
    await start($, clock)
    const ui = await mountPane($, surface)

    await ui.press({ key: 'key:done' })
    expect((await ui.find({ key: 'head:x' }))?.text).toBe('DONE 6')
    expect((await ui.find({ key: 'head:-' }))?.text).toBe('CANCELLED 1')
    expect((await ui.find({ key: 'count' }))?.text).toBe('5 open ●1 ●1 ●1 ●2 ●1 · ●6 ●1 closed')
    await ui.press({ key: 'key:done' })
    expect(await ui.find({ key: 'head:x' })).toBeUndefined()

    expect(await ui.find({ key: 'sel:app' })).toBeUndefined()
    await ui.press({ key: 'key:filter' })
    await ui.select({ key: 'sel:app', value: 'api' })
    const rows = (await ui.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('row:')).map(b => b.key)
    expect(rows).toEqual(['row:B2', 'row:F2'])
    // 5 open (deferred A4 not among them): 2 match, 3 hidden - agrees with "5 open".
    expect((await ui.find({ key: 'count' }))?.text).toBe('2 open match · 3 hidden by filter')

    await ui.select({ key: 'sel:who', value: '@vidul' })
    expect((await ui.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('row:'))).toHaveLength(0)
    await ui.select({ key: 'sel:app', value: 'all' })
    const mine = (await ui.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('row:')).map(b => b.key)
    expect(mine).toEqual(['row:F3', 'row:F1'])
    await ui.unmount()
  })

  test(`${surface}: no team file - no who or mine filter`, WITH, async ($, on) => {
    const [, clock] = world(on, { '/r/TICKETS.md': BOARD })
    await start($, clock)
    const ui = await mountPane($, surface)
    await ui.press({ key: 'key:filter' })
    expect(await ui.find({ key: 'sel:app' })).toBeDefined()
    expect(await ui.find({ key: 'sel:who' })).toBeUndefined()
    expect(await ui.find({ key: 'key:mine' })).toBeUndefined()
    await ui.unmount()
  })

  test(`${surface}: arrows move the selection, the window stays; focus and enter`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': BOARD })
    await start($, clock)
    const ui = await mountPane($, surface)
    const arrow = (by: number) => $.ui.scroll({ component: 'Pane', requestId: PANE_ID, offset: Math.max(0, by), by,
      bodyRows: 40, contentRows: 30, origin: { kind: 'person' } })

    await arrow(1)
    expect(await state($, 'selected')).toBe('B2')
    expect(w.scrolls).toBe(0)
    await arrow(1)
    await arrow(-1)
    expect(await state($, 'selected')).toBe('B2')
    expect(w.scrolls).toBe(0)
    // the selected row is drawn inverted
    expect((await ui.find({ key: 'row:B2' }))?.children.some(c => (c as { props?: { inverse?: boolean } }).props?.inverse)).toBe(true)
    // a wheel tick (pointer present) scrolls as the engine does
    await $.ui.scroll({ component: 'Pane', requestId: PANE_ID, offset: 1, by: 1, bodyRows: 10, contentRows: 30,
      origin: { kind: 'person' }, pointer: { column: 3, row: 2 } })
    expect(w.scrolls).toBe(1)

    await $.ui.focus({ component: 'Pane', requestId: PANE_ID, plugin: 'ops-board', element: 'row:F1', origin: { kind: 'person' } })
    expect(await state($, 'selected')).toBe('F1')

    await ui.press({ key: 'row:F1' })
    expect(await state($, 'expanded')).toBe('F1')
    expect((await ui.find({ key: 'raw:F1' }))?.text).toContain('[ ] F1 — product grid on the home page [app: web, ui]')
    await ui.press({ key: 'row:F1' })
    expect(await state($, 'expanded')).toBeNull()
    await ui.unmount()
  })

  test(`${surface}: an arrow past the window moves it to keep the selection in view`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': BOARD })
    await start($, clock)
    const ui = await mountPane($, surface, { ...PANE, scroll: { offset: 0, bodyRows: 6 } })
    const arrow = (by: number) => $.ui.scroll({ component: 'Pane', requestId: PANE_ID, offset: 1, by,
      bodyRows: 6, contentRows: 20, origin: { kind: 'person' } })
    await arrow(1)
    // B2 and its chips are lines 7-8 (tabs, filters, gap, IN PROGRESS, F3, chips, BLOCKED): the window moves to 3.
    expect(await state($, 'selected')).toBe('B2')
    expect(w.offsets).toEqual([3])
    for (let i = 0; i < 3; i++) await arrow(1)
    expect(await state($, 'selected')).toBe('B1')
    expect(w.scrolls).toBe(4)
    await ui.unmount()
  })

  test(`${surface}: a board edit shows within one 2 s poll`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': BOARD })
    await start($, clock)
    const ui = await mountPane($, surface)
    expect(await ui.find({ key: 'row:F9' })).toBeUndefined()
    w.files['/r/TICKETS.md'] = { text: OPEN + '- [ ] F9 — a new ticket\n' + CLOSED, mtimeMs: 5000 }
    await clock.advance(2000)
    expect((await ui.find({ key: 'row:F9' }))?.text).toMatch(/^● F9  a new ticket/)
    await ui.unmount()
  })

  test(`${surface}: tabs switch; Runs and Health draw their own bodies`, WITH, async ($, on) => {
    const [, clock] = world(on, { '/r/TICKETS.md': BOARD })
    await start($, clock)
    const ui = await mountPane($, surface)
    expect((await ui.find({ key: 'tab:tickets' }))?.props.variant).toBe('primary')
    await ui.press({ key: 'tab:health' })
    expect(await state($, 'tab')).toBe('health')
    expect(await ui.find({ key: 'row:F3' })).toBeUndefined()
    expect((await ui.find({ key: 'tab:health' }))?.props.variant).toBe('primary')
    expect((await ui.find({ key: 'h:usage' }))?.text).toBe('USAGE')
    await ui.press({ key: 'tab:runs' })
    expect(await state($, 'tab')).toBe('runs')
    expect(await ui.find({ key: 'h:usage' })).toBeUndefined()
    await ui.press({ key: 'tab:tickets' })
    expect(await ui.find({ key: 'row:F3' })).toBeDefined()
    await ui.unmount()
  })
}

test('open counts [ ] [~] [%] [!] [?] only; deferred keeps its own dim dot after them', WITH, async ($, on) => {
  const [, clock] = world(on, { '/r/TICKETS.md': '- [>] A4 — later\n- [>] A5 — later too\n- [ ] F1 — now\n' })
  await start($, clock)
  const ui = await mountPane($, 'terminal')
  const count = (await ui.find({ key: 'count' }))!
  expect(count.text).toBe('1 open ●1 ●2')
  type El = { props?: { color?: string }; children?: unknown[] }
  const all = (c: unknown): El[] => (c && typeof c === 'object' ? [c as El, ...((c as El).children ?? []).flatMap(all)] : [])
  const dots = count.children.flatMap(all).filter(c => typeof c.children?.[0] === 'string'
    && (c.children[0] as string).startsWith('●')) as { props: { color?: string }; children: string[] }[]
  expect(dots.map(d => d.children[0])).toEqual(['●1', '●2'])
  expect(dots[1]!.props.color).toBe('inactive')            // deferred is drawn dim
  expect(dots[0]!.props.color).not.toBe('inactive')
  await ui.unmount()
})

// F62: [%] testing is its own group between In progress and Blocked, open, drawn in suggestion.
test('[%] testing: its own group after in progress, counted open, its own colour', WITH, async ($, on) => {
  const [, clock] = world(on, { '/r/TICKETS.md': '- [!] B1 — stuck\n- [%] F7 — built thing (testing: owner live check)\n- [~] F8 — working\n- [ ] F9 — later\n' })
  await start($, clock)
  const ui = await mountPane($, 'terminal')
  const heads = (await ui.findAll({ type: 'Box' })).filter(t => t.key?.startsWith('head:')).map(t => t.text)
  expect(heads).toEqual(['IN PROGRESS 1', 'TESTING 1', 'BLOCKED 1', 'PENDING 1'])
  expect((await ui.find({ key: 'row:F7' }))?.text).toMatch(/^● F7  built thing/)
  expect(((await ui.find({ key: 'head:%' }))!.children[0] as { props: { color?: string } }).props.color).toBe('suggestion')
  expect((await ui.find({ key: 'count' }))!.text).toBe('4 open ●1 ●1 ●1 ●1')
  await ui.unmount()
})

test('the key line names t team', WITH, async ($, on) => {
  const [, clock] = world(on, { '/r/TICKETS.md': BOARD })
  await start($, clock)
  const ui = await mountPane($, 'terminal')
  expect((await ui.find({ key: 'keys' }))?.text).toContain('team')
  expect((await ui.find({ key: 'key:team' }))?.props.hotkey).toBe('t')
  await ui.unmount()
})

test('long titles are cut to the pane with an ellipsis', WITH, async ($, on) => {
  const long = '- [ ] F7 — ' + 'a very long title that goes on '.repeat(4) + '\n'
  const [, clock] = world(on, { '/r/TICKETS.md': OPEN + long })
  await start($, clock)
  const ui = await mountPane($, 'terminal')
  const row = (await ui.find({ key: 'row:F7' }))!.text
  expect(row.length).toBeLessThanOrEqual(54)
  expect(row).toEndWith('…')
  await ui.unmount()
})

test('no board: the pane says so', WITH, async ($, on) => {
  const [, clock] = world(on, {})
  await start($, clock)
  const ui = await mountPane($, 'terminal')
  expect(await ui.find({ type: 'Text', text: /TICKETS\.md/ })).toBeDefined()
  expect(await ui.find({ key: 'row:F3' })).toBeUndefined()
  await ui.unmount()
})

test('session.start registers /ops, loads me from git and the team file, opens the pane', WITH, async ($, on) => {
  const [w, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': TEAM })
  await start($, clock)
  expect(w.commands).toContain('ops')
  expect(w.opens[0]).toEqual({ id: 'ops-board', title: 'ops board', focus: undefined })
  expect(w.runs).toContainEqual(['git', 'config', 'user.email'])
  expect(await state($, 'me')).toBe('@vidul')
  expect(await state($, 'narrow')).toBe(false)
})

test('an unasked open left unplaced sets narrow; /ops opens it and clears narrow', WITH, async ($, on) => {
  const [w, clock] = world(on, { '/r/TICKETS.md': BOARD }, false)
  await start($, clock)
  expect(await state($, 'narrow')).toBe(true)
  w.placed = true
  const out = await $.command.run({ command: 'ops', args: '', ...RUN })
  expect(out.text).toBe('ops board opened.')
  expect(w.opens).toHaveLength(2)
  expect(await state($, 'narrow')).toBe(false)
})

test('/ops runs switches the tab; an unknown word says how to use it', WITH, async ($, on) => {
  const [, clock] = world(on, { '/r/TICKETS.md': BOARD })
  await start($, clock)
  const run = (args: string) => $.command.run({ command: 'ops', args, ...RUN })
  expect((await run('runs')).text).toBe('ops board opened on Runs.')
  expect(await state($, 'tab')).toBe('runs')
  expect((await run('bogus')).text).toBe('usage: /ops [tickets|runs|health|agents|workflows|resume]')
})

test('the first render arms the poll when session.start never ran (a hot reload)', WITH, async ($, on) => {
  const [w, clock] = world(on, { '/r/TICKETS.md': BOARD })
  const ui = await mountPane($, 'terminal')
  await clock.settle()
  expect((await ui.find({ key: 'row:F3' }))?.text).toMatch(/^● F3/)
  w.files['/r/TICKETS.md'] = { text: OPEN + '- [ ] F9 — later\n', mtimeMs: 9000 }
  await clock.advance(2000)
  expect(await ui.find({ key: 'row:F9' })).toBeDefined()
  await ui.unmount()
})

// B4: a 3.8 MB board of long ticket lines (the owner's shape: ~1400 tickets, most closed,
// a line up to tens of KB). Held whole - title and line both carrying the text - the
// parsed board was 7.7 M characters, over the host's 4 MiB $.state value limit, and
// the pane said "TICKETS.md not loaded" with the file fine. Generated, never a real board.
function bigBoard(): string {
  const words = 'the operator sees the map widget overlap the coverage layer after a link drop and '
  const out = ['# Tickets', '', '## Open', '']
  for (let i = 1; i <= 1400; i++) {
    const box = i % 7 === 0 ? '~' : i % 11 === 0 ? '!' : 'x'
    const len = i === 1400 ? 43_000 : 2_700
    out.push(`- [${box}] F${i} — ${words.repeat(Math.ceil(len / words.length)).slice(0, len)}`)
  }
  return out.join('\r\n') + '\r\n'
}

test('a 3.8 MB board of long lines loads in the pane (B4)', WITH, async ($, on) => {
  const big = bigBoard()
  expect(big.length).toBeGreaterThan(3_800_000)
  expect(big.length).toBeLessThan(4 * 1024 * 1024)
  const [, clock] = world(on, { '/r/TICKETS.md': big })
  await start($, clock)
  const ui = await mountPane($, 'terminal')
  const all = (await texts(ui)).join('\n')
  expect(all).not.toContain('not loaded')
  expect(await ui.find({ key: 'row:F7' })).toBeDefined()
  expect((await ui.find({ key: 'count' }))?.text).toBe('309 open ●200 ●109 · 1091 done hidden')
  await ui.unmount()
})
