grade: architectural · critical yes (F109 changes the TICKETS.md line format, a contract check-tickets, ticket-meta and the ops board all parse) · design deep=fable · build build=opus · verify deep=fable, held · ceremony full (relay run, 5 tickets) · mode per-task (ruled: inside a relay run, /pending-subagent parallel) · usage unobservable · tiers: defaults

# DESIGN F111 - ops-board pane: layout B (whole-word wrap) in style 2 (Status rails), style 4 (Mono ASCII) as the fallback

## GOAL

The Tickets pane never overlaps regions or hides an action at any width down to 40 columns. Layout B:
tabs, the key row and the count line wrap **whole items** onto as many rows as they need, never
shortened or clipped; the ticket list yields rows to that chrome and ends in `… N more rows ↓` when
rows are below. Style 2 "Status rails": a coloured rail glyph per group down the left edge, the group
header naming the state and its count, the selected row a full-width bar, the active tab marked. Style 4
"Mono ASCII" when the console cannot draw Unicode: state as a word (`wip`, `test`, `dec`, ...), groups in
capitals, selection in reverse video, ASCII glyphs only. Proof: `claude plugin test` frames at 40/60/80/120
columns - no element wider than the width, every action label present, the ASCII path emitting no
codepoint > 127 (owner ruling Q-F100-1: plugin-test frames are the render proof for pane work).

Ground truth read: the executable mocks `scratchpad/f111/styles.py` (classes `Rails`, `Mono`; `frame()`
= `pack(tabs) + gap + body(yielding) + gap + counts + pack(keys)`, `H = 14`, owner column when `w >= 56`,
`cut()` with `…`/`...`, `more()` text `  … N more rows ↓` / `  ... N more rows v`) and `mocks.py` (`pack`
= whole items, gap, `WIDTHS = [40, 60, 80, 120]`, `ALL_KEYS = ↑↓ move, a assign, d decide, f filter, x done,
t team, c reconcile, r refresh`); `plugin/mods/ops-board/hooks/pane.tsx` (TicketsTab l.66-200: filter row,
group header Buttons `▾/▸ TITLE (n)`, row Buttons with `●` + `cut(title)` + inverse `padEnd` when selected,
chips line, raw line, count `<Text>` with `●n` dots, keys `<Box flexWrap="wrap" gap={2}>`; `renderPane`
l.233+: the B14 tab bar `<Box key="tabs" flexDirection="row" flexWrap="wrap" gap={1}>`, `cols =
e.props.bodyColumns`, `readView`), `hooks/lib/ticketsmodel.ts` (`buildModel`: groups/rows/items/lines with
`rows: 1` per line, `offsetFor`, `lineKey`), `hooks/lib/board.ts` (`GROUPS` titles upper-case, `STATE_NAME`,
`paint`, `STATE_COLOR`), `hooks/paint.ts` (re-export only), `hooks/register.tsx` (`/ops <word>` command
l.509-518 test; `$.env.get` for `SKILLATOR_ME` l.348; `$.store` l.339), `tests/pane.test.tsx` (`PANE` props
`{bodyColumns: 54, scroll: {offset: 0, bodyRows: 40}}`, `world()`, `heads()`/`openAll()` keyed on `▸`,
`F61: headers fit ${cols}` for 80/60/40 asserting `b.text.length <= cols` on head/row Buttons, `B14` test
asserting `flexWrap` on `tabs` and `keys` and all six `tab:<id>` present), `tests/band.test.tsx` (`mock.env`),
`types/index.d.ts`, `tui-tron/SKILL.md §4` (two glyph sets chosen once at startup; never delete a glyph),
RUN-0023 stage 170 (F103: `pane.tsx`, `register.tsx`, `types/index.d.ts`, `tests/explorer.test.tsx`) and 171
(F104: `types/index.d.ts`, `tests/runs.test.tsx`).

## APPROACHES

1. **The pane windows its own list; wrap stays the host's `flexWrap`; two glyph tables.** The chrome row
   count is computed in the pure model with a `pack()` identical to the mock's (whole items + gap), the list
   is sliced to `bodyRows - chrome` with a `more` line, tabs/keys keep B14's `flexWrap` and the count line
   gets it too. One `Glyphs` table per style, chosen once per render from an `ascii` atom.
2. **Keep host scrolling, only restyle.** Rails and Mono as pure restyling; the chrome scrolls away with
   the list as today. Fails "every action reachable at every width": at 40 columns the key row is three
   rows below a 240-row list.
3. **A fixed-height frame drawn as one `<Text>` block (the mock, literally).** The pane composes 14 lines
   of text itself. Loses Buttons (click/focus/hotkeys are host primitives on `Button`), and the F61 header
   Buttons, assign forms and B14 wrap already live on primitives.

**CHOSEN: 1.** It keeps every primitive (Buttons, hotkeys, forms), reuses B14's wrap, and the one new
mechanism - the model knowing how many rows the chrome takes - is pure and testable.

## DESIGN

### Regions (top to bottom, never overlapping)

```
tabs      Box flexWrap gap=1   whole tab Buttons, as many rows as needed (B14, kept)   - active tab: "● Tickets" / "*Tickets*"-less ASCII: "[Tickets]"
filters   1 row (unchanged text; truncate-end as today)
gap       1 row
list      rows_avail = bodyRows - rows(tabs) - 1 - 1 - 1 - rows(count) - rows(keys); window of the model's list lines ending in a more line
gap       1 row
count     Box flexWrap gap=1   "23 open" "●14" "●2" ... "· 140 done hidden" as separate Texts
keys      Box flexWrap gap=2   "↑↓ move" + the seven action Buttons (B14, kept)
```
`bodyRows` = `e.props.scroll?.bodyRows`; unknown or 0 -> no windowing (every list line drawn, as today).

### Model additions (`hooks/lib/ticketsmodel.ts`, pure)

```ts
export type Glyphs = {
  open: string; closed: string      // group header: open / collapsed marker ("▾"/"▸" -> ASCII "v"/">")
  rail: string; railDim: string     // Rails: "▌ " coloured rail, "▏ " dim rail for a collapsed group; ASCII: "| " and ": "
  dot: string                       // "●" -> "*"
  more: string; down: string; up: string   // "…", "↓", "↑" -> "...", "v", "^"
  move: string                      // "↑↓" -> "^v"
  sep: string                       // "·" -> "-"
  active: string                    // active tab marker "● " -> ""  (ASCII marks the tab with brackets instead)
  cut: string                       // ellipsis for a cut title "…" -> "..."
}
export const UNI: Glyphs = { open: '▾', closed: '▸', rail: '▌ ', railDim: '▏ ', dot: '●', more: '…', down: '↓', up: '↑', move: '↑↓', sep: '·', active: '● ', cut: '…' }
export const ASCII: Glyphs = { open: 'v', closed: '>', rail: '| ', railDim: ': ', dot: '*', more: '...', down: 'v', up: '^', move: '^v', sep: '-', active: '', cut: '...' }
// Mono (ASCII) state words, 4 cells, the mock's three plus the rest of Box
export const STATE_WORD: Record<State, string> = { ' ': 'open', '~': 'wip ', '%': 'test', '!': 'blkd', '?': 'dec ', '>': 'defr', 'x': 'done', '-': 'canc' }
export const TAB_LABELS = ['Tickets', 'Workflows', 'Health', 'Messages', 'Explorer', 'Build']
export const KEY_LABELS = ['move', 'a assign', 'd decide', 'f filter', 'x done', 't team', 'c reconcile', 'r refresh']  // 'move' is prefixed by g.move
// pack(): whole items onto rows of at most `cols` cells, `gap` between items, an item never splits -
// the host's flexWrap rule, so the model counts the rows the host will draw.
export function packRows(widths: number[], cols: number, gap: number): number
export function chromeRows(v: View, m: Model, g: Glyphs): { tabs: number; count: number; keys: number; total: number }
// the list window: the model's list lines (between 'gap' and 'gap2') that fit `avail` rows, the selected
// item kept in view; above/below = rows hidden on each side (each costs one indicator row when > 0).
export function windowOf(m: Model, avail: number | null): { start: number; end: number; above: number; below: number }
export function headText(g: Group, glyphs: Glyphs, ascii: boolean): string
// Rails:  open "IN PROGRESS  2"  -> drawn after a coloured rail;  collapsed "PENDING  14  ▸"  after a dim rail
// Mono:   open "IN PROGRESS (2)"                                  collapsed "PENDING (14) +"
export function rowText(t: Ticket, cols: number, glyphs: Glyphs, ascii: boolean, nested: boolean): { text: string; owner: string | null }
// the row's body after the rail/word: " F101  <cut title>[ (parent)]" with the owner right-aligned when cols >= 56 (the mock's rule)
```
`View` gains `ascii: boolean` and `rows: number | null`; `Model.lines` is unchanged in shape; `chromeRows`
sets the `tabs`/`count`/`keys` entries' `rows` so `offsetFor` stays truthful for hosts that still scroll.
`windowOf` algorithm: `L` = list lines (`m.lines` strictly between keys `gap` and `gap2`), `T = sum(rows)`;
`avail === null || T <= avail` -> `{0, L.length, 0, 0}`; else `sel` = index of `lineKey(m.selected)` (0 when
none); first try `start = 0`, `keep = avail - 1` (one row for the below line); if `sel >= keep` then `start =
sel - keep + 2` (an above line takes one row and the selected line stays visible) and `keep = avail - 2`;
`end = start + keep`; `above = start`, `below = L.length - end`; when `below === 0` give the row back
(`end = L.length`, recompute `start` so the window is `avail - 1` rows). Chips lines move with their row
(a selected row's chips may fall below the window; the row itself is always inside).

### Pane (`hooks/pane.tsx`)

- `TicketsTab` builds the list as `entries: { key: string; el: RenderElement }[]` in model order (head,
  row, chips, raw - the same keys as `m.lines`), then slices `[w.start, w.end)` and inserts
  `<Text dimColor key="more:up">{`  ${g.more} ${w.above} rows above ${g.up}`}</Text>` /
  `<Text dimColor key="more:down">{`  ${g.more} ${w.below} more rows ${g.down}`}</Text>`.
- Group header (Button, F61 keeps `hk` keys and the open/close press): Rails
  `<Text color={paint(g.box)}>{g.open ? glyphs.rail : glyphs.railDim}</Text><Text color={paint(g.box)} bold inverse={hk === m.selected}>{headText(...)}</Text>`
  (the dim rail for a collapsed group is `dimColor`, not coloured); Mono: `<Text bold inverse={sel}>{headText}</Text>`.
- Row (Button `row:<id>`): Rails `<Text color={paint(t.box)}>{glyphs.rail}</Text>` + body Text; selected
  -> the body `padEnd` to `cols - 2` and `inverse` (the full-width bar, as today's `padEnd`); the owner
  (`t.owner`) right-aligned inside the body when `cols >= 56`, `dimColor` when not selected. Mono: one Text
  `${sel ? '> ' : '  '}${STATE_WORD[t.box]} ${t.id} ${title}` + the owner, `inverse` when selected.
- Count line: `<Box key="count" flexDirection="row" flexWrap="wrap" gap={1}>` of Texts: `${c.open} open`,
  one `<Text color={paint(d.box)}>{glyphs.dot + d.n}</Text>` per dot, then `${glyphs.sep} ${n} done hidden`
  or the closed dots + `closed` (the words as today); filter-active: one Text `c.text`.
- Keys row: unchanged Buttons; the first Text is `${glyphs.move} move`.
- Tabs: Button label `${x.id === tab ? glyphs.active : ''}${label}` in Unicode; ASCII marks the active tab
  as `[${label}]` and the others ` ${label} ` (the mock's Mono tab); `variant="primary"` kept as today.
- `cut()` uses `glyphs.cut`.
- `readView` gets `ascii` (atom) and `rows` (`e.props.scroll?.bodyRows ?? null`).

### Choosing ASCII

Atom `{ plugin: 'ops-board', key: 'ascii' }` (boolean, default false). Set at `session.start` from the env:
`SKILLATOR_ASCII` is `1`/`true`/`yes` (case-insensitive) -> true; else from `$.store.get('ascii')` when the
person toggled it before; else false. `/ops ascii` toggles and stores (`$.store.set('ascii', v)`), toasting
`ops board: ASCII glyphs on - /ops ascii again for Unicode` / `... Unicode glyphs on`. Ruled: no automatic
codepage probe - the mod draws through the host's renderer and cannot read the console's encoding; the
symptom (mojibake) is the person's to see and flip once, and it persists.

### What B14 keeps, what changes on purpose

Kept: `flexWrap` on `tabs` and `keys`, whole Buttons, the six `tab:<id>` keys, `gap` values. Changed on
purpose: the count line becomes a wrapping Box of Texts (today one `<Text>` that the host truncates);
group headers lose the `(n)` parens for `  n` in Rails (Mono keeps them, per the mock); the list no
longer relies on the host's scroll to reach the keys.

### Edge cases

- `bodyRows` smaller than the chrome (e.g. 40 columns, 14 rows: chrome = 3 tab rows + 1 + 1 + 1 + 2 count
  rows + 3 key rows = 11 -> 3 list rows): `avail = max(1, ...)`; one list line + the more line.
- No board / error / empty filter: the message line is the list; no more line.
- A selected item inside a collapsed group (F61 maps it to the header): the header line is kept in view.
- `expanded` raw line (`rows` computed from `line.length`): counted by its `rows` in the window sum.
- Width < 56: no owner column (the mock); width < 20: `cols` is already clamped at 20.
- ASCII and a title with non-ASCII characters (an em dash in `t.title`): the **glyphs** are ASCII; the
  ticket's own words are its own - the ASCII test asserts over the pane's chrome and a board whose titles
  are ASCII (the fixture), and documents that titles pass through (ruled: never rewrite the user's text).
- The Workflows/Health/Explorer/Build tabs keep their bodies; only the bar wraps (already) - out of scope
  to re-window them.

### Out of scope

The standalone ops app (`ops/draw.ts`, `ops/state.ts` - its own frame), the band, the other tabs' bodies,
tab hotkeys `1-6` (the mock numbered tabs for the picture only), the `?` legend (layout A), host scroll
removal (the `offsetFor` path stays for hosts that scroll).

## CONSTRAINTS

- Glyph tables are exactly `UNI` and `ASCII` above; every glyph the Tickets tab draws comes from the table in force - no literal `●▾▸…↓↑▌▏·` in `pane.tsx`'s Tickets code paths.
- `STATE_WORD` values are 4 cells each, as listed.
- `packRows(widths, cols, gap)` is the host's flexWrap rule: items whole, `gap` between items on a row, a new row when `used + gap + w > cols`; an item wider than `cols` takes a row alone.
- The more lines read `  … N more rows ↓` / `  … N rows above ↑` (ASCII `  ... N more rows v` / `  ... N rows above ^`).
- Owner column only when `cols >= 56`; the selected row is one inverse element padded to the row width.
- Keys: `tabs`, `filters`, `head:<box>`, `row:<id>`, `chips:<id>`, `raw:<id>`, `count`, `keys`, `key:<name>`, `tab:<id>`, `more:up`, `more:down` - the first ten unchanged from today.
- The `ascii` atom key is `ascii`; the env is `SKILLATOR_ASCII`; the command is `/ops ascii`.
- Tests mount at `bodyColumns` 40, 60, 80, 120 with `bodyRows: 14` and assert per element `text.length <= cols`, every label of `KEY_LABELS` present, all six tabs present, and in ASCII no `charCode > 127` in any Text/Button text.
- Pure ASCII source where the file is ASCII today; `pane.tsx` already holds Unicode literals - they move into `UNI` in `ticketsmodel.ts` (the one place).

## FILES

- plugin/mods/ops-board/hooks/lib/ticketsmodel.ts
- plugin/mods/ops-board/hooks/pane.tsx
- plugin/mods/ops-board/hooks/register.tsx
- plugin/mods/ops-board/types/index.d.ts
- plugin/mods/ops-board/tests/pane.test.tsx
- plugin/mods/ops-board/tests/model.test.ts
- plugin/mods/ops-board/README.md

Shared: `pane.tsx` and `register.tsx` (F103, RUN-0023 stage 170), `types/index.d.ts` (F103 stage 170,
F104 stage 171, F109 in this run), `register.tsx` (F109 - its `sessionA` atom and owner guard; F111's
touch is the `ascii` atom, the env read and the `/ops ascii` word), `README.md` of the mod (F102 landed,
F105 stage 173). Order: after RUN-0023 stages 170 and 171, after F109; before F110 (which does not touch
the mod - the "last" rule is F110's).

## TASKS

### Task 1: the pure model - glyph tables, `packRows`, `chromeRows`, `windowOf`, `headText`, `rowText`

**Files:**
- Modify: `plugin/mods/ops-board/hooks/lib/ticketsmodel.ts` (exports above; `View` gains `ascii`, `rows`)
- Modify: `plugin/mods/ops-board/types/index.d.ts` (no type change needed unless `View` lives there - it lives in ticketsmodel.ts; touch only if the build complains)
- Test: `plugin/mods/ops-board/tests/model.test.ts`
- Run: `claude plugin test plugin/mods/ops-board`

**Interfaces:**
- Produces: `Glyphs`, `UNI`, `ASCII`, `STATE_WORD`, `TAB_LABELS`, `KEY_LABELS`, `packRows`, `chromeRows`, `windowOf`, `headText`, `rowText`; `View.ascii: boolean`, `View.rows: number | null`. Task 2 consumes all of them.

- [ ] Step 1: failing tests in `tests/model.test.ts` (import from `'../hooks/lib/ticketsmodel'`):
  ```ts
  test('F111 packRows: whole items, gap, a new row when the next does not fit', () => {
    expect(packRows([7, 9, 6, 10, 8, 5], 40, 1)).toBe(2)      // 7+1+9+1+6+1+10=35, 8 -> 36+... second row
    expect(packRows([7, 9, 6, 10, 8, 5], 120, 1)).toBe(1)
    expect(packRows([7, 9, 6, 10, 8, 5], 20, 1)).toBe(3)
    expect(packRows([50], 40, 1)).toBe(1)                       // wider than the row: a row of its own
    expect(packRows([], 40, 1)).toBe(0)
  })
  test('F111 windowOf: the list yields rows to the chrome and says how many are below / above', () => {
    const board = parseBoard(Array.from({ length: 30 }, (_, i) => `- [ ] F${i + 1} — t${i + 1}`).join('\n'), '/r/T', 1, 1)
    const v: View = { board, team: [], me: null, filter: { app: null, who: null, mine: false, showDone: false }, filterOpen: false,
      selected: 'F1', expanded: null, open: [' '], cols: 80, ascii: false, rows: 14 }
    const m = buildModel(v)
    expect(windowOf(m, null)).toEqual({ start: 0, end: 31, above: 0, below: 0 })          // 1 header + 30 rows, no window
    expect(windowOf(m, 6)).toEqual({ start: 0, end: 5, above: 0, below: 26 })             // 5 lines + the more line
    const far = buildModel({ ...v, selected: 'F20' })
    const w = windowOf(far, 6)
    expect(w.start).toBeGreaterThan(0); expect(w.end - w.start).toBe(4); expect(w.above + w.below + 4).toBe(31)   // above line + 4 + below line
    expect(w.start <= 20 && 20 < w.end).toBe(true)                                        // F20 is line 20 (header is 0)
    const last = windowOf(buildModel({ ...v, selected: 'F30' }), 6)
    expect(last).toEqual({ start: 26, end: 31, above: 26, below: 0 })                     // no below line: the row comes back
  })
  test('F111 headText and rowText: Rails and Mono shapes, owner only from 56 columns', () => {
    const g = { box: '~' as const, title: 'IN PROGRESS', tickets: [], open: true }
    expect(headText(g, UNI, false)).toBe('IN PROGRESS  0')
    expect(headText({ ...g, open: false, title: 'PENDING' }, UNI, false)).toBe('PENDING  0  ▸')
    expect(headText(g, ASCII, true)).toBe('IN PROGRESS (0)')
    expect(headText({ ...g, open: false, title: 'PENDING' }, ASCII, true)).toBe('PENDING (0) +')
    const t = parseBoard('- [~] F101 — Marathon on hosts with no Workflow tool [owner: @sher]', '/r/T', 1, 1).tickets[0]!
    expect(rowText(t, 40, UNI, false, false)).toEqual({ text: ' F101  Marathon on hosts with no Work…', owner: null })   // 38 cells: 40 minus the rail
    expect(rowText(t, 60, UNI, false, false).owner).toBe('@sher')
    expect(rowText(t, 60, UNI, false, false).text.length).toBe(60 - 2)                   // body fills the row minus the rail
    expect(rowText(t, 40, ASCII, true, false).text).toMatch(/^  wip  F101 /)
    expect([...rowText(t, 40, ASCII, true, false).text].every(c => c.charCodeAt(0) < 128)).toBe(true)
  })
  test('F111 chromeRows at 40 and 120 columns', () => {
    const v: View = { board: null, team: [], me: null, filter: { app: null, who: null, mine: false, showDone: false }, filterOpen: false,
      selected: null, expanded: null, open: [], cols: 40, ascii: false, rows: 14 }
    const m = buildModel(v)
    expect(chromeRows(v, m, UNI).tabs).toBe(2)       // "● Tickets" 9, Workflows 9, Health 6, Messages 8, Explorer 8, Build 5, gap 1 -> 2 rows at 40
    expect(chromeRows(v, m, UNI).keys).toBe(2)       // "↑↓ move" 7 +2 "a assign" 8 +2 "d decide" 8 +2 "f filter" 8 = 37; "x done" would make 45 > 40 -> row 2: 6+2+6+2+11+2+9 = 38
    expect(chromeRows({ ...v, cols: 120 }, m, UNI).total).toBe(6)   // 1 + 1 + 1 + 1 + 1 + 1
  })
  ```
  (verify the arithmetic in Step 2's failure output and fix the expected numbers against `packRows` once it exists - the widths are label lengths; the test pins the rule, the numbers follow it.)
- [ ] Step 2: `claude plugin test plugin/mods/ops-board` -> `packRows is not a function` (and the rest), 4 failing tests.
- [ ] Step 3: implement in `ticketsmodel.ts`:
  ```ts
  export function packRows(widths: number[], cols: number, gap: number): number {
    let rows = 0, used = -1
    for (const w of widths) {
      const add = used < 0 ? w : gap + w
      if (used >= 0 && used + add > cols) { rows++; used = w } else used = used < 0 ? w : used + add
    }
    return rows + (used >= 0 ? 1 : 0)
  }
  export function headText(g: Group, glyphs: Glyphs, ascii: boolean): string {
    if (ascii) return `${g.title} (${g.tickets.length})${g.open ? '' : ' +'}`
    return `${g.title}  ${g.tickets.length}${g.open ? '' : '  ' + glyphs.closed}`
  }
  const cutTo = (s: string, room: number, cut: string) => s.length <= room ? s : s.slice(0, Math.max(1, room - cut.length)) + cut
  export function rowText(t: Ticket, cols: number, glyphs: Glyphs, ascii: boolean, nested: boolean): { text: string; owner: string | null } {
    const owner = cols >= 56 ? t.owner : null
    const lead = ascii ? `  ${STATE_WORD[t.box]} ` : (nested ? '   ' : ' ')
    const width = ascii ? cols : cols - 2                      // Rails: the 2-cell rail is drawn beside this text; Mono: the text is the whole row (its lead holds the `> ` / `  `)
    const tail = t.parent && !nested ? ` (${t.parent})` : ''
    const fixed = lead.length + t.id.length + 2 + tail.length + (owner ? owner.length + 1 : 0)
    const title = cutTo(t.title, Math.max(4, width - fixed), glyphs.cut)
    let text = `${lead}${t.id}  ${title}${tail}`
    if (owner) text = text.padEnd(width - owner.length - 1) + ' ' + owner
    return { text, owner }
  }
  export function chromeRows(v: View, m: Model, g: Glyphs) {
    const tabs = packRows(TAB_LABELS.map((l, i) => (i === 0 ? (v.ascii ? l.length + 2 : g.active.length + l.length) : v.ascii ? l.length + 2 : l.length)), v.cols, 1)
    const countItems = m.filterActive ? [m.count.text.length] : [`${m.count.open} open`.length, ...m.count.dots.map(d => (g.dot + d.n).length),
      ...(m.count.closed.length ? [(`${g.sep} ${m.count.closed.reduce((s, d) => s + d.n, 0)} done hidden`).length] : [])]
    const count = packRows(countItems, v.cols, 1)
    const keys = packRows([g.move.length + 5, ...KEY_LABELS.slice(1).map(l => l.length)], v.cols, 2)
    return { tabs, count, keys, total: tabs + 1 + 1 + 1 + count + keys }
  }
  export function windowOf(m: Model, avail: number | null) {
    const i0 = m.lines.findIndex(l => l.key === 'gap') + 1, i1 = m.lines.findIndex(l => l.key === 'gap2')
    const L = m.lines.slice(i0, i1), n = L.length
    const total = L.reduce((s, l) => s + l.rows, 0)
    if (avail === null || total <= avail) return { start: 0, end: n, above: 0, below: 0 }
    const a = Math.max(1, avail)
    const sel = Math.max(0, m.selected ? L.findIndex(l => l.key === lineKey(m.selected!)) : 0)
    let keep = a - 1, start = 0
    if (sel >= keep) { keep = Math.max(1, a - 2); start = sel - keep + 1 }
    let end = Math.min(n, start + keep)
    if (end === n) { keep = Math.max(1, a - 1); start = Math.max(0, n - keep); end = n }
    return { start, end, above: start, below: n - end }
  }
  ```
  `View` type: add `ascii: boolean; rows: number | null`. In `buildModel`, set `lines[0].rows` etc. from `chromeRows` after the model is built (`tabs`, `count`, `keys` entries). The tab label widths: ASCII marks the active tab as `[Tickets]` and the rest ` Label ` (both +2), Unicode prefixes the active one with `g.active`. (Mono's lead already holds the `> `/`  ` selection cells, so its text is the whole row - `width` is `cols` there and `cols - 2` beside a Rails rail, as the code above says.)
- [ ] Step 4: `claude plugin test plugin/mods/ops-board` -> the four tests pass; existing model tests pass.
- [ ] Step 5: `git add plugin/mods/ops-board/hooks/lib/ticketsmodel.ts plugin/mods/ops-board/tests/model.test.ts && git commit -m "F111: tickets model - glyph tables, packRows, chromeRows, windowOf, Rails/Mono head and row text"`

### Task 2: the pane draws layout B in Rails, Mono when `ascii`; frames at 40/60/80/120

**Files:**
- Modify: `plugin/mods/ops-board/hooks/pane.tsx:66-200` (TicketsTab), `:201-208` (readView), `:210-213` (TABS) and the bar in `renderPane`
- Modify: `plugin/mods/ops-board/hooks/register.tsx` (atom `asciiA`; `session.start` env read; `/ops ascii`)
- Modify: `plugin/mods/ops-board/README.md` (one paragraph: layout B, Rails, ASCII fallback, `/ops ascii`, `SKILLATOR_ASCII`)
- Test: `plugin/mods/ops-board/tests/pane.test.tsx` (update `heads`/`openAll`, the F61 header expectations, B14; add the F111 frame tests)
- Run: `claude plugin test plugin/mods/ops-board`

**Interfaces:**
- Consumes: Task 1's exports.
- Produces: atom `{ plugin: 'ops-board', key: 'ascii' }`; keys `more:up`, `more:down`; `/ops ascii`.

- [ ] Step 1: failing tests in `pane.test.tsx`. Update the helpers: `openAll` presses heads whose text ends with `' ▸'` or `' +'`; `heads()` unchanged. Replace the F61 header expectation `['▸ PENDING DECISION (1)', '▸ PENDING (240)']` with `['PENDING DECISION  1  ▸', 'PENDING  240  ▸']` (the rail is its own Text inside the Button and the harness's Button `text` concatenates its children, so assert `heads(ui).map(h => h.replace(/^.. /, ''))` equals that list - the first two cells are the rail). Add:
  ```ts
  const NON_ASCII = (s: string) => [...s].filter(c => c.charCodeAt(0) > 127)
  const everyText = async (ui: Ui) => [...(await ui.findAll({ type: 'Text' })), ...(await ui.findAll({ type: 'Button' }))]
  for (const cols of [40, 60, 80, 120]) {
    test(`F111: at ${cols} columns no element is wider than the pane, every action is on screen, the list yields rows`, WITH, async ($, on) => {
      const many = OPEN + Array.from({ length: 40 }, (_, i) => `- [ ] F${i + 10} — pending ticket number ${i + 10}`).join('\n') + '\n'
      const [, clock] = world(on, { '/r/TICKETS.md': many, '/r/.skillator/team.md': TEAM })
      await start($, clock)
      const ui = await mountPane($, 'terminal', { ...PANE, bodyColumns: cols, scroll: { offset: 0, bodyRows: 14 } })
      await openAll(ui)
      for (const el of await everyText(ui)) expect(el.text.length, el.key ?? el.text).toBeLessThanOrEqual(cols)
      const all = (await everyText(ui)).map(e => e.text).join('\n')
      for (const label of ['move', 'assign', 'decide', 'filter', 'done', 'team', 'reconcile', 'refresh']) expect(all, label).toContain(label)
      for (const id of ['tickets', 'runs', 'health', 'messages', 'explorer', 'run']) expect(await ui.find({ key: 'tab:' + id }), id).toBeDefined()
      expect((await ui.find({ key: 'count' }))?.props.flexWrap).toBe('wrap')
      const more = await ui.find({ key: 'more:down' })
      expect(more?.text).toMatch(/^  … \d+ more rows ↓$/)
      const rows = (await ui.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('row:')).length
      expect(rows).toBeLessThanOrEqual(14)
      await ui.unmount()
    })
  }
  test('F111: the selected row is a full-width bar; the owner column appears from 56 columns', WITH, async ($, on) => {
    const [, clock] = world(on, { '/r/TICKETS.md': BOARD, '/r/.skillator/team.md': TEAM })
    await start($, clock)
    for (const cols of [40, 60]) {
      const ui = await mountPane($, 'terminal', { ...PANE, bodyColumns: cols })
      await openAll(ui)
      await ui.press({ key: 'row:F3' })
      const row = await ui.find({ key: 'row:F3' })
      expect(row?.text.length).toBe(cols)
      expect(row?.text.includes('@vidul')).toBe(cols >= 56)
      await ui.unmount()
    }
  })
  test('F111: SKILLATOR_ASCII=1 draws the Mono style - no codepoint over 127, state words, brackets on the active tab', WITH, async ($, on) => {
    const [, clock] = world(on, { '/r/TICKETS.md': BOARD })
    mock.env(on, { SKILLATOR_ASCII: '1' })
    await start($, clock)
    const ui = await mountPane($, 'terminal', { ...PANE, bodyColumns: 40, scroll: { offset: 0, bodyRows: 14 } })
    await openAll(ui)
    for (const el of await everyText(ui)) expect(NON_ASCII(el.text), el.key ?? el.text).toEqual([])
    expect((await ui.find({ key: 'row:F3' }))?.text).toMatch(/^  wip  F3 /)
    expect((await ui.find({ key: 'tab:tickets' }))?.text).toBe('[Tickets]')
    expect((await heads(ui)).some(h => /^IN PROGRESS \(1\)/.test(h))).toBe(true)
    await ui.unmount()
  })
  test('F111: /ops ascii toggles and persists the glyph set', WITH, async ($, on) => {
    const [, clock] = world(on, { '/r/TICKETS.md': BOARD })
    await start($, clock)
    await $.command.run({ command: 'ops', args: 'ascii', ...RUN })
    const ui = await mountPane($, 'terminal', { ...PANE, bodyColumns: 60 })
    expect((await ui.find({ key: 'tab:tickets' }))?.text).toBe('[Tickets]')
    await ui.unmount()
    await $.command.run({ command: 'ops', args: 'ascii', ...RUN })
    const ui2 = await mountPane($, 'terminal', { ...PANE, bodyColumns: 60 })
    expect((await ui2.find({ key: 'tab:tickets' }))?.text).toBe('● Tickets')
    await ui2.unmount()
  })
  ```
  (`world()` calls `mock.env(on, {})` itself - for the ASCII test call `mock.env` *after* `world()` so the later registration wins, or give `world()` an `env` parameter as band.test.tsx's world has; do the latter.)
- [ ] Step 2: `claude plugin test plugin/mods/ops-board` -> the F111 tests fail (`more:down` undefined, count has no flexWrap, Unicode present under ASCII, `/ops ascii` says "unknown word"); the F61 header expectation fails on the old `▸ PENDING (240)`.
- [ ] Step 3: implement `pane.tsx` per DESIGN (entries array, window slice, Rails/Mono header and row, wrapping count Box, glyph-driven tabs and keys; `const g = v.ascii ? ASCII : UNI`), `readView(..., rows, ascii)`; `register.tsx`: `const asciiA = atom({ plugin: 'ops-board', key: 'ascii' } as const, false)`, at `session.start` `const envA = ((await $.env.get('SKILLATOR_ASCII')) ?? '').toLowerCase(); const stored = await $.store.get('ascii'); await update($, asciiA, () => stored === undefined ? ['1', 'true', 'yes'].includes(envA) : !!stored)`; in the `/ops` word switch add `ascii`: toggle, `$.store.set('ascii', v)`, toast. README paragraph.
- [ ] Step 4: `claude plugin test plugin/mods/ops-board` -> all pass (the F61 40/60/80 header-fit tests, B14, the F111 four); `npm test --prefix plugin/mods/ops-board/ops` -> pass (the ops app imports `ticketsmodel.ts` for `buildModel` - its frames are unchanged because it does not call the new functions).
- [ ] Step 5: `git add plugin/mods/ops-board && git commit -m "F111: ops pane layout B - whole-item wrap, the list yields rows, Status rails style, Mono ASCII fallback (/ops ascii, SKILLATOR_ASCII); frames pinned at 40/60/80/120"`

## VERIFICATION

```
claude plugin test plugin/mods/ops-board                                   -> all tests pass, incl. "F111: at 40 columns ...", "... 60 ...", "... 80 ...", "... 120 ...", the Mono test, the toggle test
npm test --prefix plugin/mods/ops-board/ops                                -> pass
grep -c '[●▾▸…↓↑▌▏·]' plugin/mods/ops-board/hooks/pane.tsx                 -> 0 in the TicketsTab/bar code (the only literals are in ticketsmodel.ts UNI)
python -I "C:/Users/Ikran/AppData/Local/Temp/claude/C--tools-Projects-skillator2/147ee797-591f-4b4f-98fa-687ea69de7d9/scratchpad/f111/styles.py" "$TMP/styles.html"   -> the mock still passes its own checks (S2/S4 at 40/60/80/120), the reference the frames were built to
```

## Decisions

- Ruling: the pane windows its own list from `bodyRows`; wrap stays the host's `flexWrap` - the one new mechanism is a pure row count - cost if wrong: a host whose `flexWrap` packs differently from `packRows` draws one chrome row more or fewer than counted, and the list is one row short or long (never overlapping - the host still lays regions out in a column).
- Ruling: ASCII is chosen by `SKILLATOR_ASCII` or `/ops ascii` (persisted), never by probing the console - the mod cannot read the terminal's encoding through the host - cost if wrong: a mojibake console shows garbage until the person flips once.
- Ruling: Rails headers read `TITLE  n` (count after two spaces, no parens) and a collapsed one ends `  ▸`; Mono keeps `TITLE (n)` and `+` - straight from `styles.py` `Rails.group/collapsed` and `Mono.group/collapsed` - cost if wrong: the F61 header tests change wording once.
- Ruling: the owner column from 56 columns, the mock's rule - cost if wrong: none.
- Ruling: an above indicator is drawn when the window starts past the first line (the mock never scrolled, so it showed below only) - symmetry, else a reader cannot tell rows are hidden above - cost if wrong: one row of the list at a scrolled position.
- Ruling: the user's own title text passes through untouched in ASCII mode (never rewrite their words); the ASCII assertion runs over the chrome and an ASCII fixture - cost if wrong: a title with an em dash shows mojibake on a broken console, as any text would.
- Ruling: the standalone ops app and the other tabs are out of scope; only the Tickets tab yields rows - cost if wrong: the Workflows tab at 40 columns still relies on host scroll (as today).
- Ruling: order after RUN-0023 stages 170 (F103: pane.tsx, register.tsx) and 171 (F104: index.d.ts) and after F109 (register.tsx) - cost if wrong: conflicts in `renderPane`'s tab-switch block and the atoms list.
- Q-F111-1: should the ASCII switch also flip automatically when `TERM=dumb` or `LANG` lacks `UTF-8`? Recommended default: no (env + toggle only, above); build continues on no.
- Q-F111-2: should tabs carry `1-6` hotkeys as the mock's numbering suggests? Recommended default: no - not in the ticket's Done line; the mock numbered them for the picture; build continues on no.


## Resume ruling: omitted regression callers

FILES additionally permits plugin/mods/ops-board/tests/{assign,reconcile,messages,runs,runtab}.test.tsx, solely for helpers/assertions tied to the requested changed header/tab labels. Preserve behavioral assertions and B16 coverage. These are callers of the designed pane change, not additional feature scope.
