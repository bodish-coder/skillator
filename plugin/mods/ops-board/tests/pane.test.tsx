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
function world(on: On, files: Record<string, string>, placed = true, readErr?: string, env: Record<string, string> = {}): [World, MockClock] {
  const w: World = { files: {}, placed, opens: [], scrolls: 0, offsets: [], runs: [], commands: [] }
  for (const [p, text] of Object.entries(files)) w.files[p] = { text, mtimeMs: 1000 }
  // The engine hands a hook the path resolved for this machine (C:\r\TICKETS.md on Windows).
  const at = (p: string) => w.files[p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')]
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.env(on, env)
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
        : e.args === 'openGroups' ? await $.state.get({ plugin: 'ops-board', key: 'openGroups' })
        : await $.state.get({ plugin: 'ops-board', key: 'me' })
      return { text: JSON.stringify(v.value ?? null) }
    })
  },
}
const WITH = { plugins: [PEEK] }
const RUN = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
const state = async ($: Engine, key: 'selected' | 'expanded' | 'narrow' | 'tab' | 'me' | 'openGroups') =>
  JSON.parse((await $.command.run({ command: 'peek', args: key, ...RUN })).text ?? 'undefined') as unknown

const SURFACES = ['terminal', 'desktop'] as const

for (const ascii of [false, true]) {
  test(`A161: wheel and page keys reach every expanded row with fixed chrome, ASCII ${ascii}`, WITH, async ($, on) => {
    const raw = 'long detail '.repeat(50) + 'LAST-DETAIL'
    const [, clock] = world(on, { '/r/TICKETS.md': `- [ ] F1 — ${raw}\n` }, true, undefined, ascii ? { SKILLATOR_ASCII: '1' } : {})
    await start($, clock)
    const ui = await mountPane($, 'terminal', { ...PANE, bodyColumns: 40, scroll: { offset: 0, bodyRows: 14 } })
    await ui.press({ key: 'head: ' })
    await ui.press({ key: 'row:F1' })
    expect(await ui.find({ key: 'raw:F1' })).toBeDefined()
    const seen = new Set<string>()
    const collect = async () => {
      const detail = await ui.find({ key: 'raw:F1' })
      for (const child of detail?.children ?? []) seen.add(labelOf(child))
      expect(await frameRows(ui, 40)).toBeLessThanOrEqual(14)
      for (const key of ['tabs', 'filters', 'count', 'keys']) expect(await ui.find({ key })).toBeDefined()
    }
    await collect()
    // The host clamps offset to zero because our rendered frame fits. by still carries the wheel distance.
    for (let i = 0; i < 25; i++) {
      await $.ui.scroll({ component: 'Pane', requestId: PANE_ID, offset: 0, by: 1, bodyRows: 14, contentRows: 14,
        origin: { kind: 'person' }, pointer: { column: 3, row: 6 } })
      await collect()
    }
    const full = `    - [ ] F1 — ${raw}`
    for (let i = 0; i < full.length; i += 40) expect(seen.has(full.slice(i, i + 40)), full.slice(i, i + 40)).toBe(true)
    expect((await ui.find({ key: 'raw:F1' }))?.text).toContain('LAST-DETAIL')
    for (let i = 0; i < 8; i++) await $.ui.scroll({ component: 'Pane', requestId: PANE_ID, offset: 0, by: -14, bodyRows: 14, contentRows: 14, origin: { kind: 'person' } })
    expect(await ui.find({ key: 'row:F1' })).toBeDefined()
    await ui.unmount()
  })

  test(`A161: PageDown reaches the last ticket without moving selection, ASCII ${ascii}`, WITH, async ($, on) => {
    const many = Array.from({ length: 30 }, (_, i) => `- [ ] F${i + 1} — ticket ${i + 1}`).join('\n')
    const [w, clock] = world(on, { '/r/TICKETS.md': many }, true, undefined, ascii ? { SKILLATOR_ASCII: '1' } : {})
    await start($, clock)
    const ui = await mountPane($, 'terminal', { ...PANE, bodyColumns: 40, scroll: { offset: 0, bodyRows: 14 } })
    await ui.press({ key: 'head: ' })
    await $.ui.focus({ component: 'Pane', requestId: PANE_ID, plugin: 'ops-board', element: 'row:F1', origin: { kind: 'person' } })
    const seen = new Set(await rowKeys(ui))
    for (let i = 0; i < 12; i++) {
      await $.ui.scroll({ component: 'Pane', requestId: PANE_ID, offset: 0, by: 14, bodyRows: 14, contentRows: 14, origin: { kind: 'person' } })
      for (const key of await rowKeys(ui)) seen.add(key)
      expect(await frameRows(ui, 40)).toBeLessThanOrEqual(14)
    }
    expect(await ui.find({ key: 'row:F30' })).toBeDefined()
    expect(seen.size).toBe(30)
    expect(await state($, 'selected')).toBe('F1')
    expect(w.offsets.every(offset => offset === 0)).toBe(true)
    await $.ui.scroll({ component: 'Pane', requestId: PANE_ID, offset: 0, by: 1, bodyRows: 14, contentRows: 14, origin: { kind: 'person' } })
    expect(await state($, 'selected')).toBe('F2')
    expect(await ui.find({ key: 'row:F2' })).toBeDefined()
    await ui.press({ key: 'key:assign' })
    expect((await ui.find({ key: 'form:title' }))?.text).toContain('Assign F2')
    const before = w.scrolls
    await $.ui.scroll({ component: 'Pane', requestId: PANE_ID, offset: 2, by: 14, bodyRows: 14, contentRows: 16, origin: { kind: 'person' } })
    expect(w.scrolls).toBe(before + 1)
    expect(w.offsets.at(-1)).toBe(2)
    await ui.press({ key: 'cancel' })
    expect(await ui.find({ key: 'row:F2' })).toBeDefined()
    await ui.unmount()
  })
}

const mountPane = ($: Engine, surface: (typeof SURFACES)[number], props = PANE) =>
  $.ui.mount({ plugin: 'ops-board', surface, component: 'Pane', requestId: PANE_ID, props })

const texts = async (ui: { findAll: (q: { type?: string; key?: string }) => Promise<{ key: string | undefined; text: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(t => t.text)

// F61: every group starts collapsed. The group headers, as drawn; openAll presses each
// collapsed one open, as a person clicking down the list would.
type Ui = { findAll: (q: { type?: string }) => Promise<{ key: string | undefined; text: string }[]>; press: (q: { key: string }) => Promise<unknown> }
const heads = async (ui: Ui) => (await ui.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('head:')).map(b => b.text.replace(/^[▌▏] /, ''))
async function openAll(ui: Ui) {
  for (const b of (await ui.findAll({ type: 'Button' })).filter(x => x.key?.startsWith('head:') && / (▸|\+)$/.test(x.text)))
    await ui.press({ key: b.key! })
}
const rowKeys = async (ui: Ui) => (await ui.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('row:')).map(b => b.key)

const everyText = async (ui: Ui) => [...await ui.findAll({ type: 'Text' }), ...await ui.findAll({ type: 'Button' })]
// Measure the mounted primitives, including hotkey labels and Box gaps, not the model.
type Drawn = { type?: string; props?: { label?: string; hotkey?: string }; children?: unknown[] }
const labelOf = (el: unknown): string => typeof el === 'string' ? el : el && typeof el === 'object'
  ? (el as Drawn).props?.label ?? ((el as Drawn).children ?? []).map(labelOf).join('') : ''
async function frameRows(ui: Awaited<ReturnType<typeof mountPane>>, cols: number) {
  let height = 3 // filters and the two gaps
  for (const key of ['tabs', 'count', 'keys']) {
    const box = (await ui.find({ key }))!
    let used = 0, rows = 1
    for (const child of box.children) {
      const width = labelOf(child).length + ((child as Drawn).props?.hotkey ? 3 : 0)
      const gap = used ? Number(box.props.gap ?? 0) : 0
      if (used && used + gap + width > cols) { rows++; used = width }
      else used += gap + width
    }
    height += rows
  }
  height += (await ui.findAll({ type: 'Button' })).filter(b => /^(head|row):/.test(b.key ?? '')).length
  for (const box of await ui.findAll({ type: 'Box' })) {
    if (/^(chips|more):/.test(box.key ?? '')) height++
    if (box.key?.startsWith('raw:')) height += box.children.length
  }
  return height
}
for (const cols of [40, 60, 80, 120]) {
  for (const ascii of [false, true]) {
    test(`F111: frame ${cols} columns, ASCII ${ascii}: labels fit, actions remain, list yields`, WITH, async ($, on) => {
      const many = OPEN + Array.from({ length: 40 }, (_, i) => `- [ ] F${i + 10} — pending ticket number ${i + 10}`).join('\n') + CLOSED
      const [, clock] = world(on, { '/r/TICKETS.md': many, '/r/.skillator/team.md': TEAM }, true, undefined, ascii ? { SKILLATOR_ASCII: '1' } : {})
      await start($, clock)
      const ui = await mountPane($, 'terminal', { ...PANE, bodyColumns: cols, scroll: { offset: 0, bodyRows: 14 } })
      await ui.press({ key: 'head:~' })
      for (const el of await everyText(ui)) {
        expect(el.text.length, el.key ?? el.text).toBeLessThanOrEqual(cols)
        if (ascii) expect([...el.text].filter(c => c.charCodeAt(0) > 127), el.key ?? el.text).toEqual([])
      }
      const all = (await everyText(ui)).map(e => e.text).join('\n')
      for (const label of ['move', 'assign', 'decide', 'filter', 'done', 'team', 'reconcile', 'refresh']) expect(all).toContain(label)
      for (const id of ['tickets', 'runs', 'health', 'messages', 'explorer', 'run']) expect(await ui.find({ key: 'tab:' + id })).toBeDefined()
      expect((await ui.find({ key: 'count' }))?.props.flexWrap).toBe('wrap')
      expect((await ui.find({ key: 'tab:tickets' }))?.text).toBe(ascii ? '[Tickets]' : '● Tickets')
      expect((await ui.find({ key: 'row:F3' }))?.text).toMatch(ascii ? /^  wip  F3 / : /^▌  F3 /)
      expect((await heads(ui))[0]).toBe(ascii ? 'IN PROGRESS (1)' : 'IN PROGRESS  1')
      // Move to Pending, then open it: a long list must reserve the footer at every width.
      await $.ui.focus({ component: 'Pane', requestId: PANE_ID, plugin: 'ops-board', element: 'head: ', origin: { kind: 'person' } })
      expect(await state($, 'selected')).toBe('head: ')
      expect(await ui.find({ key: 'head: ' })).toBeDefined()
      await ui.press({ key: 'head: ' })
      expect(await state($, 'openGroups')).toContain(' ')
      expect((await ui.find({ key: 'more:down' }))?.text).toMatch(ascii ? /^  \.\.\. \d+ more rows v$/ : /^  … \d+ more rows ↓$/)
      expect((await rowKeys(ui)).length).toBeLessThanOrEqual(14)
      expect(await frameRows(ui, cols)).toBeLessThanOrEqual(14)
      await $.ui.focus({ component: 'Pane', requestId: PANE_ID, plugin: 'ops-board', element: 'row:F20', origin: { kind: 'person' } })
      expect(await ui.find({ key: 'row:F20' })).toBeDefined()
      expect(await ui.find({ key: 'more:up' })).toBeDefined()
      await ui.press({ key: 'row:F20' })
      expect(await frameRows(ui, cols)).toBeLessThanOrEqual(14)
      expect(await ui.find({ key: 'row:F20' })).toBeDefined()
      await ui.unmount()
    })
  }
}
test('F111: selected full-width bar and owner from 56 columns', WITH, async ($, on) => {
  const [, clock] = world(on, { '/r/TICKETS.md': BOARD })
  await start($, clock)
  for (const cols of [40, 60]) {
    const ui = await mountPane($, 'terminal', { ...PANE, bodyColumns: cols })
    if (!(await ui.find({ key: 'row:F3' }))) await ui.press({ key: 'head:~' })
    await $.ui.focus({ component: 'Pane', requestId: PANE_ID, plugin: 'ops-board', element: 'head:~', origin: { kind: 'person' } })
    if (cols >= 56) {
      const unselected = (await ui.find({ key: 'row:F3' }))!
      expect(unselected.text.length).toBe(cols)
      expect(unselected.text.endsWith('@vidul')).toBe(true)
      expect((await ui.findAll({ type: 'Text' })).some(t => t.text === '@vidul' && t.props.dimColor === true)).toBe(true)
    }
    await $.ui.focus({ component: 'Pane', requestId: PANE_ID, plugin: 'ops-board', element: 'row:F3', origin: { kind: 'person' } })
    const row = await ui.find({ key: 'row:F3' })
    expect((row?.text.length ?? 0) + 3).toBe(cols)
    expect(row?.text.includes('@vidul')).toBe(cols >= 56)
    expect(row?.children.some(c => (c as { props?: { inverse?: boolean } }).props?.inverse)).toBe(true)
    await ui.unmount()
  }
})
for (const cols of [40, 60, 80, 120]) {
  for (const ascii of [false, true]) {
    test(`F111: long owner stays within ${cols} columns, ASCII ${ascii}, selected and unselected`, WITH, async ($, on) => {
      const owner = '@' + 'a'.repeat(80)
      const [, clock] = world(on, { '/r/TICKETS.md': `- [~] F1 — bounded title [owner: ${owner}]\n` }, true, undefined, ascii ? { SKILLATOR_ASCII: '1' } : {})
      await start($, clock)
      const ui = await mountPane($, 'terminal', { ...PANE, bodyColumns: cols })
      await ui.press({ key: 'head:~' })
      for (const selected of [false, true, false]) {
        await $.ui.focus({ component: 'Pane', requestId: PANE_ID, plugin: 'ops-board', element: selected ? 'row:F1' : 'head:~', origin: { kind: 'person' } })
        const row = (await ui.find({ key: 'row:F1' }))!
        expect(row.text.length).toBeLessThanOrEqual(cols)
        expect(row.text).toContain('F1')
        if (selected) expect(row.text.length + 3).toBe(cols)
        for (const el of await everyText(ui)) expect(el.text.length, el.key ?? el.text).toBeLessThanOrEqual(cols)
      }
      await ui.unmount()
    })
  }
}
test('F111: /ops ascii toggles, stores and restores the glyph set', WITH, async ($, on) => {
  const [, clock] = world(on, { '/r/TICKETS.md': BOARD })
  await start($, clock)
  await $.command.run({ command: 'ops', args: 'ascii', ...RUN })
  await start($, clock)
  const ui = await mountPane($, 'terminal')
  expect((await ui.find({ key: 'tab:tickets' }))?.text).toBe('[Tickets]')
  await $.command.run({ command: 'ops', args: 'ascii', ...RUN })
  expect((await ui.find({ key: 'tab:tickets' }))?.text).toBe('● Tickets')
  await start($, clock)
  expect((await ui.find({ key: 'tab:tickets' }))?.text).toBe('● Tickets')
  await ui.unmount()
})

for (const surface of SURFACES) {
  test(`${surface}: rows grouped by state, coloured dots, chips and the count line`, WITH, async ($, on) => {
    const [, clock] = world(on, { '/r/TICKETS.md': BOARD })
    await start($, clock)
    const ui = await mountPane($, surface)
    await openAll(ui)

    expect((await ui.find({ key: 'row:F3' }))?.text).toMatch(/^▌  F3  cart drawer/)
    expect(await heads(ui)).toEqual(['IN PROGRESS  1', 'BLOCKED  1', 'PENDING DECISION  1', 'PENDING  2', 'DEFERRED  1'])
    expect(await rowKeys(ui)).toEqual(['row:F3', 'row:B2', 'row:F2', 'row:F1', 'row:B1', 'row:A4'])
    // State is colour, not a bracket code: the head and the dot share it.
    const dot = async (id: string) => ((await ui.find({ key: 'row:' + id }))!.children
      .find(c => (c as { children?: unknown[] }).children?.[0] === '▌ ') as { props: { color?: string } }).props.color
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
    expect((await ui.find({ key: 'count' }))?.text).toBe('5 open●1●1●1●2●1· 7 done hidden')
    for (const k of ['key:assign', 'key:decide', 'key:filter', 'key:done', 'tab:tickets', 'tab:runs', 'tab:health'])
      expect(await ui.find({ key: k }), k).toBeDefined()
    expect(await ui.find({ key: 'tab:workflows' })).toBeUndefined()      // F76: a section of Runs now
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

    await openAll(ui)
    await ui.press({ key: 'key:done' })
    expect((await ui.find({ key: 'head:x' }))?.text).toBe('▏ DONE  6  ▸')
    expect((await ui.find({ key: 'head:-' }))?.text).toBe('▏ CANCELLED  1  ▸')
    expect((await ui.find({ key: 'count' }))?.text).toBe('5 open●1●1●1●2●1·●6●1closed')
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
    await openAll(ui)
    await $.ui.focus({ component: 'Pane', requestId: PANE_ID, plugin: 'ops-board', element: 'row:F3', origin: { kind: 'person' } })
    const arrow = (by: number) => $.ui.scroll({ component: 'Pane', requestId: PANE_ID, offset: Math.max(0, by), by,
      bodyRows: 40, contentRows: 30, origin: { kind: 'person' } })

    await arrow(1)                                        // F3 -> the BLOCKED header -> B2
    expect(await state($, 'selected')).toBe('head:!')
    await arrow(1)
    expect(await state($, 'selected')).toBe('B2')
    expect(w.scrolls).toBe(0)
    await arrow(1)
    await arrow(-1)
    expect(await state($, 'selected')).toBe('B2')
    expect(w.scrolls).toBe(0)
    // the selected row is drawn inverted
    expect((await ui.find({ key: 'row:B2' }))?.children.some(c => (c as { props?: { inverse?: boolean } }).props?.inverse)).toBe(true)
    // a wheel tick moves the list without moving the fixed chrome
    await $.ui.scroll({ component: 'Pane', requestId: PANE_ID, offset: 1, by: 1, bodyRows: 10, contentRows: 30,
      origin: { kind: 'person' }, pointer: { column: 3, row: 2 } })
    expect(w.scrolls).toBe(0)

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
    const setup = await mountPane($, surface)
    await openAll(setup)
    await setup.unmount()
    const ui = await mountPane($, surface, { ...PANE, scroll: { offset: 0, bodyRows: 14 } })
    await $.ui.focus({ component: 'Pane', requestId: PANE_ID, plugin: 'ops-board', element: 'row:F3', origin: { kind: 'person' } })
    const arrow = (by: number) => $.ui.scroll({ component: 'Pane', requestId: PANE_ID, offset: 1, by,
      bodyRows: 14, contentRows: 14, origin: { kind: 'person' } })
    await arrow(1)
    await arrow(1)
    // The list follows the selection while the host window remains on its chrome.
    expect(await state($, 'selected')).toBe('B2')
    expect(await ui.find({ key: 'row:B2' })).toBeDefined()
    expect(w.scrolls).toBe(0)
    const before = w.scrolls
    for (let i = 0; i < 5; i++) await arrow(1)            // the PENDING DECISION header, F2, the PENDING header, F1, B1
    expect(await state($, 'selected')).toBe('B1')
    expect(w.scrolls).toBe(before)
    expect(await ui.find({ key: 'row:B1' })).toBeDefined()
    expect(await frameRows(ui, PANE.bodyColumns)).toBeLessThanOrEqual(14)
    await ui.unmount()
  })

  test(`${surface}: a board edit shows within one 2 s poll`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': BOARD })
    await start($, clock)
    const ui = await mountPane($, surface)
    await openAll(ui)
    expect(await ui.find({ key: 'row:F9' })).toBeUndefined()
    w.files['/r/TICKETS.md'] = { text: OPEN + '- [ ] F9 — a new ticket\n' + CLOSED, mtimeMs: 5000 }
    await clock.advance(2000)
    expect((await ui.find({ key: 'row:F9' }))?.text).toMatch(/^▌  F9  a new ticket/)
    await ui.unmount()
  })

  test(`${surface}: tabs switch; Runs and Health draw their own bodies`, WITH, async ($, on) => {
    const [, clock] = world(on, { '/r/TICKETS.md': BOARD })
    await start($, clock)
    const ui = await mountPane($, surface)
    await openAll(ui)
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
  expect(count.text).toBe('1 open●1●2')
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
  await openAll(ui)
  expect(await heads(ui)).toEqual(['IN PROGRESS  1', 'TESTING  1', 'BLOCKED  1', 'PENDING  1'])
  expect((await ui.find({ key: 'row:F7' }))?.text).toMatch(/^▌  F7  built thing/)
  expect(((await ui.find({ key: 'head:%' }))!.children[0] as { props: { color?: string } }).props.color).toBe('suggestion')
  expect((await ui.find({ key: 'count' }))!.text).toBe('4 open●1●1●1●1')
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
  await openAll(ui)
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
  expect((await run('runs')).text).toBe('ops board opened on Workflows, Runs open.')   // F76: runs is an alias
  expect(await state($, 'tab')).toBe('runs')
  expect((await run('bogus')).text).toBe('usage: /ops [tickets|workflows|health|messages|explorer|build|resume [force]|watchdog on] - runs and agents open Workflows too, run opens Build;'
    + ' resume force releases the hold whatever the reading and mutes memory red until it reads green once (watchdog on unmutes)')
})

test('the first render arms the poll when session.start never ran (a hot reload)', WITH, async ($, on) => {
  const [w, clock] = world(on, { '/r/TICKETS.md': BOARD })
  const ui = await mountPane($, 'terminal')
  await clock.settle()
  await openAll(ui)
  expect((await ui.find({ key: 'row:F3' }))?.text).toMatch(/^▌  F3/)
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
  // F61: headers only at first; the open set held is a few boxes, never rows.
  expect(await heads(ui)).toEqual(['IN PROGRESS  200  ▸', 'BLOCKED  109  ▸'])
  expect(await ui.find({ key: 'row:F7' })).toBeUndefined()
  await ui.press({ key: 'head:~' })
  expect(await ui.find({ key: 'row:F7' })).toBeDefined()
  expect(JSON.stringify(await state($, 'openGroups'))).toBe('["~"]')
  expect((await ui.find({ key: 'count' }))?.text).toBe('309 open●200●109· 1091 done hidden')
  await ui.unmount()
})

// ---- F61: collapsible status groups ----

test('F61: every group starts collapsed - headers with counts, no rows; a click opens one, again closes it', WITH, async ($, on) => {
  const [, clock] = world(on, { '/r/TICKETS.md': BOARD })
  await start($, clock)
  const ui = await mountPane($, 'terminal')
  expect(await heads(ui)).toEqual(['IN PROGRESS  1  ▸', 'BLOCKED  1  ▸', 'PENDING DECISION  1  ▸', 'PENDING  2  ▸', 'DEFERRED  1  ▸'])
  expect(await rowKeys(ui)).toEqual([])
  // collapsed groups are not an empty board: no "no open tickets" over the headers
  expect((await texts(ui)).join('\n')).not.toMatch(/no open tickets|no ticket matches/)
  expect(await state($, 'openGroups')).toBeNull()       // never set: the atom's default, no groups open
  // the first header is the selection, drawn inverse; the count line is the board's, not the view's
  const inv = async (k: string) => ((await ui.find({ key: k }))!.children[0] as { props: { inverse?: boolean } }).props.inverse
  expect(await inv('head:~')).toBe(true)
  expect(await inv('head:!')).toBe(false)
  expect((await ui.find({ key: 'count' }))?.text).toBe('5 open●1●1●1●2●1· 7 done hidden')

  await ui.press({ key: 'head: ' })
  expect(await state($, 'openGroups')).toEqual([' '])
  expect(await state($, 'selected')).toBe('head: ')
  expect((await ui.find({ key: 'head: ' }))?.text).toBe('▌ PENDING  2')
  expect(await rowKeys(ui)).toEqual(['row:F1', 'row:B1'])
  await ui.press({ key: 'head: ' })
  expect(await rowKeys(ui)).toEqual([])
  expect((await ui.find({ key: 'head: ' }))?.text).toBe('▏ PENDING  2  ▸')
  await ui.unmount()
})

// The mod also moves the focus ring onto the item ($.ui.focus) so Enter acts on it; the
// test engine has no ring to move (no implementation for ui.focus) - checked live.
test('F61: up/down walk the headers and the rows of open groups; Tab onto a header selects it', WITH, async ($, on) => {
  const [, clock] = world(on, { '/r/TICKETS.md': BOARD })
  await start($, clock)
  const ui = await mountPane($, 'terminal')
  const arrow = (by: number) => $.ui.scroll({ component: 'Pane', requestId: PANE_ID, offset: 0, by,
    bodyRows: 40, contentRows: 30, origin: { kind: 'person' } })
  await arrow(1)
  expect(await state($, 'selected')).toBe('head:!')       // collapsed: header to header
  await ui.press({ key: 'head:!' })
  await arrow(1)
  expect(await state($, 'selected')).toBe('B2')           // into the open group's rows
  await arrow(1)
  expect(await state($, 'selected')).toBe('head:?')
  await arrow(-1)
  await arrow(-1)
  expect(await state($, 'selected')).toBe('head:!')
  await arrow(-1)
  await arrow(-1)                                         // at the top: the arrow scrolls as the engine would
  expect(await state($, 'selected')).toBe('head:~')
  // Tab landing on a header selects it
  await $.ui.focus({ component: 'Pane', requestId: PANE_ID, plugin: 'ops-board', element: 'head:>', origin: { kind: 'person' } })
  expect(await state($, 'selected')).toBe('head:>')
  await ui.unmount()
})

test('F61: a click on the header of the selected ticket\'s group closes it and selects the header', WITH, async ($, on) => {
  const [, clock] = world(on, { '/r/TICKETS.md': BOARD })
  await start($, clock)
  const ui = await mountPane($, 'terminal')
  await ui.press({ key: 'head: ' })
  await $.ui.focus({ component: 'Pane', requestId: PANE_ID, plugin: 'ops-board', element: 'row:B1', origin: { kind: 'person' } })
  await ui.press({ key: 'head:~' })                       // another group opened: B1 stays selected
  await $.ui.focus({ component: 'Pane', requestId: PANE_ID, plugin: 'ops-board', element: 'row:B1', origin: { kind: 'person' } })
  expect(await state($, 'selected')).toBe('B1')
  // collapse PENDING by its header: the header is the selection, drawn inverse
  await ui.press({ key: 'head: ' })
  expect(await ui.find({ key: 'row:B1' })).toBeUndefined()
  expect(((await ui.find({ key: 'head: ' }))!.children[0] as { props: { inverse?: boolean } }).props.inverse).toBe(true)
  await ui.unmount()
})

// F77: on a header a / d no longer toast 'select a ticket first' - the form opens with
// an empty Ticket field to type the ID in; on a row it opens on that ticket as before.
test('F61: a and d on a ticket row still open the in-pane form; on a header they ask for a ticket by number', WITH, async ($, on) => {
  const [w, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': TEAM })
  const toasts: string[] = []
  on('ui.toast', ($, e) => { toasts.push(e.text); return { value: undefined } })
  await start($, clock)
  const ui = await mountPane($, 'terminal')
  await ui.press({ key: 'key:assign' })                   // the first header is selected: the form asks for the ID
  expect(toasts).toEqual([])
  expect((await ui.find({ key: 'form:title' }))?.text).toBe('Assign a ticket  Esc cancels')
  expect((await ui.find({ key: 'ticket' }))?.props.value).toBe('')
  expect(await ui.find({ key: 'go' })).toBeUndefined()
  await ui.press({ key: 'cancel' })
  expect(await ui.find({ key: 'form:title' })).toBeUndefined()
  await ui.press({ key: 'head:?' })
  await $.ui.scroll({ component: 'Pane', requestId: PANE_ID, offset: 0, by: 1, bodyRows: 40, contentRows: 30, origin: { kind: 'person' } })
  expect(await state($, 'selected')).toBe('F2')
  await ui.press({ key: 'key:decide' })
  expect((await ui.find({ key: 'form:title' }))?.text).toBe('Assign F2 for a decision  Esc cancels')
  expect(w.opens.length).toBeGreaterThan(0)
  await ui.unmount()
})

test('F61: a filter shows the matching groups with their filtered counts; x adds Done collapsed', WITH, async ($, on) => {
  const [, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': TEAM })
  await start($, clock)
  const ui = await mountPane($, 'terminal')
  await ui.press({ key: 'key:filter' })
  await ui.select({ key: 'sel:app', value: 'web' })
  expect(await heads(ui)).toEqual(['IN PROGRESS  1  ▸', 'PENDING  1  ▸'])
  expect((await texts(ui)).join('\n')).not.toContain('no ticket matches the filter')
  await ui.select({ key: 'sel:app', value: 'all' })
  await ui.press({ key: 'key:done' })
  expect(await heads(ui)).toEqual(['IN PROGRESS  1  ▸', 'BLOCKED  1  ▸', 'PENDING DECISION  1  ▸', 'PENDING  2  ▸', 'DEFERRED  1  ▸', 'DONE  6  ▸', 'CANCELLED  1  ▸'])
  await ui.unmount()
})

for (const cols of [80, 60, 40]) {
  test(`F61: headers fit ${cols} columns`, WITH, async ($, on) => {
    const many = Array.from({ length: 240 }, (_, i) => `- [ ] F${i + 1} — pending ticket number ${i + 1}`).join('\n') + '\n- [?] F999 — ' + 'a decision '.repeat(10) + '\n'
    const [, clock] = world(on, { '/r/TICKETS.md': many })
    await start($, clock)
    const ui = await mountPane($, 'terminal', { ...PANE, bodyColumns: cols })
    expect(await heads(ui)).toEqual(['PENDING DECISION  1  ▸', 'PENDING  240  ▸'])
    await openAll(ui)
    for (const b of (await ui.findAll({ type: 'Button' })).filter(x => /^(head|row):/.test(x.key ?? '')))
      expect(b.text.length, b.key).toBeLessThanOrEqual(cols)
    await ui.unmount()
  })
}

test('F61: a selected ticket an edit moves into a collapsed group shows as its header; opening lands back on it', WITH, async ($, on) => {
  const [w, clock] = world(on, { '/r/TICKETS.md': BOARD })
  await start($, clock)
  const ui = await mountPane($, 'terminal')
  await ui.press({ key: 'head: ' })
  await $.ui.focus({ component: 'Pane', requestId: PANE_ID, plugin: 'ops-board', element: 'row:B1', origin: { kind: 'person' } })
  expect(await state($, 'selected')).toBe('B1')
  // B1 goes [ ] -> [!] in the file: BLOCKED is collapsed, its header stands for B1
  w.files['/r/TICKETS.md'] = { text: BOARD.replace('- [ ] B1', '- [!] B1'), mtimeMs: 7000 }
  await clock.advance(2000)
  expect(await ui.find({ key: 'row:B1' })).toBeUndefined()
  expect(((await ui.find({ key: 'head:!' }))!.children[0] as { props: { inverse?: boolean } }).props.inverse).toBe(true)
  await ui.press({ key: 'head:!' })
  expect(await state($, 'selected')).toBe('B1')
  expect((await ui.find({ key: 'row:B1' }))?.children.some(c => (c as { props?: { inverse?: boolean } }).props?.inverse)).toBe(true)
  await ui.unmount()
})

// F78: r re-reads TICKETS.md and team.md now, even when the 2 s poll sees no mtime or
// size change (an edit inside the stat's resolution, a board the pane holds stale).
for (const surface of SURFACES) {
  test(`${surface}: F78 r refreshes the board and the team regardless of mtime and size`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': TEAM })
    const toasts: string[] = []
    on('ui.toast', ($, e) => { toasts.push(e.text); return { value: undefined } })
    await start($, clock)
    const ui = await mountPane($, surface)
    await openAll(ui)
    expect((await ui.find({ key: 'row:B1' }))?.text).toMatch(/button focus ring missing/)
    // same length, same mtime: the 2 s poll keeps the board it holds
    w.files['/r/TICKETS.md'] = { text: BOARD.replace('button focus ring missing', 'button focus ring MISSING'), mtimeMs: 1000 }
    w.files['/r/.skillator/team.md'] = { text: TEAM.replace('@asha', '@ashb'), mtimeMs: 1000 }
    await clock.advance(2000)
    expect((await ui.find({ key: 'row:B1' }))?.text).toMatch(/button focus ring missing/)
    await ui.press({ key: 'key:refresh' })
    await clock.settle()
    expect((await ui.find({ key: 'row:B1' }))?.text).toMatch(/button focus ring MISSING/)
    expect(toasts.at(-1)).toBe('ops board: refreshed - 13 tickets, 2 people')
    await ui.unmount()
  })
}

// Review #14: F77's typed Ticket field needs an Input; a surface without one (mobile) keeps
// the old refusal on a header rather than a form whose Ticket field cannot be filled.
test('mobile: a on a header says select a ticket first - no form it cannot fill', WITH, async ($, on) => {
  const [, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': TEAM })
  const toasts: string[] = []
  on('ui.toast', ($, e) => { toasts.push(e.text); return { value: undefined } })
  await start($, clock)
  const ui = await $.ui.mount({ plugin: 'ops-board', surface: 'mobile', component: 'Pane', requestId: PANE_ID, props: PANE })
  await ui.press({ key: 'key:assign' })
  expect(toasts).toEqual(['ops board: select a ticket first'])
  expect(await ui.find({ key: 'form:title' })).toBeUndefined()
  await ui.unmount()
})

// B14: six tabs are ~72 cells; a 54-column pane cut Explorer mid-word and dropped Build.
// The bar and the key rows wrap whole buttons instead.
test('B14: the tab bar and the key rows wrap whole buttons', WITH, async ($, on) => {
  const [, clock] = world(on, { '/r/TICKETS.md': BOARD })
  await start($, clock)
  const ui = await mountPane($, 'terminal', { ...PANE, bodyColumns: 40 })
  expect((await ui.find({ key: 'tabs' }))?.props.flexWrap).toBe('wrap')
  expect((await ui.find({ key: 'keys' }))?.props.flexWrap).toBe('wrap')
  for (const id of ['tickets', 'runs', 'health', 'messages', 'explorer', 'run']) expect(await ui.find({ key: 'tab:' + id }), id).toBeDefined()
  await ui.unmount()
})
