import type { Board, Box as State, Filter, Member, Proposal, Ticket } from '../../types'
import type { Call } from './calls'
import { GROUPS, isOpen, STATE_NAME, visible } from './board'

// The Tickets tab's model (design §5): groups, drawn rows, line keys for keeping a
// row in view, the count line. Pure; pane.tsx draws it, the ops app frames it.
// F61: every group is a header with its count that opens and closes; `open` holds the
// boxes of the open groups (empty: every group collapsed). The cursor walks `items`:
// each header ('head:<box>') and the rows of open groups (their ticket ids).

const OPEN_STATES: State[] = ['~', '%', '!', '?', ' ', '>']

export type Group = { box: State; title: string; tickets: Ticket[]; open: boolean }
export type Model = {
  groups: Group[]                     // tickets: every one the filter shows, open or not (the count)
  rows: Ticket[]                      // the rows drawn, in order: those of open groups
  items: string[]                     // what up/down walk: 'head:<box>' and ticket ids, drawn order
  selected: string | null             // the item in force (the first item when none is)
  ticket: string | null               // the selected ticket's id; null on a header
  lines: { key: string; rows: number }[]   // every drawn line in order, for keeping an item in view
  count: { open: number; dots: { box: State; n: number }[]; closed: { box: State; n: number }[]; text: string }
  filterActive: boolean
}

export type View = {
  board: Board | null; team: Member[]; me: string | null; filter: Filter; filterOpen: boolean
  selected: string | null; expanded: string | null; open: State[]; cols: number
  ascii?: boolean; rows?: number | null // omitted by the standalone ops app
  offset?: number | null              // list rows; null follows the selection
  unread?: number
}

export type Glyphs = { open: string; closed: string; rail: string; railDim: string; dot: string;
  more: string; down: string; up: string; move: string; sep: string; active: string; cut: string }
export const UNI: Glyphs = { open: '▾', closed: '▸', rail: '▌ ', railDim: '▏ ', dot: '●', more: '…', down: '↓', up: '↑', move: '↑↓', sep: '·', active: '● ', cut: '…' }
export const ASCII: Glyphs = { open: 'v', closed: '>', rail: '| ', railDim: ': ', dot: '*', more: '...', down: 'v', up: '^', move: '^v', sep: '-', active: '', cut: '...' }
export const STATE_WORD: Record<State, string> = { ' ': 'open', '~': 'wip ', '%': 'test', '!': 'blkd', '?': 'dec ', '>': 'defr', x: 'done', '-': 'canc' }
export const TAB_LABELS = ['Tickets', 'Workflows', 'Health', 'Messages', 'Explorer', 'Build']
export const KEY_LABELS = ['move', 'a assign', 'd decide', 'f filter', 'x done', 't team', 'c reconcile', 's status', 'h help', 'r refresh']

export function packRows(widths: number[], cols: number, gap: number): number {
  let rows = 0, used = -1
  for (const w of widths) {
    if (used < 0 || used + gap + w > cols) { rows++; used = w }
    else used += gap + w
  }
  return rows
}

export function headText(g: Group, glyphs: Glyphs, ascii: boolean): string {
  if (ascii) return `${g.title} (${g.tickets.length})${g.open ? '' : ' +'}`
  return `${g.title}  ${g.tickets.length}${g.open ? '' : '  ' + glyphs.closed}`
}

export const cutTo = (s: string, room: number, cut: string) => s.length <= room ? s : s.slice(0, Math.max(0, room - cut.length)) + cut.slice(0, room)

export function rowText(t: Ticket, cols: number, glyphs: Glyphs, ascii: boolean, nested: boolean, prefix = 0): { text: string; owner: string | null } {
  const width = cols - (ascii ? 0 : 2) - prefix
  const owner = cols >= 56 ? t.owner : null
  const lead = ascii ? `  ${STATE_WORD[t.box]} ` : nested ? '   ' : ' '
  const tail = t.parent && !nested ? ` (${t.parent})` : ''
  const fixed = lead.length + t.id.length + 2 + tail.length + (owner ? owner.length + 1 : 0)
  const title = cutTo(t.title, Math.max(0, width - fixed), glyphs.cut)
  let text = `${lead}${t.id}  ${title}${tail}`
  if (owner) text = text.padEnd(Math.max(0, width - owner.length - 1)) + ' ' + owner
  return { text: cutTo(text, width, glyphs.cut), owner }
}

export function chromeRows(v: View, m: Model, g: Glyphs) {
  const tabs = packRows(TAB_LABELS.map((l, i) => l.length + (v.ascii ? 2 : i === 0 ? g.active.length : 0)
    + (i === 3 && v.unread ? String(v.unread).length + 1 : 0)), v.cols, 1)
  const c = m.count
  const countItems = m.filterActive ? [c.text.length] : [`${c.open} open`.length, ...c.dots.map(d => (g.dot + d.n).length),
    ...(c.closed.length ? v.filter.showDone ? [g.sep.length, ...c.closed.map(d => (g.dot + d.n).length), 6]
      : [`${g.sep} ${c.closed.reduce((s, d) => s + d.n, 0)} done hidden`.length] : [])]
  const count = packRows(countItems, v.cols, 1)
  const keys = packRows([g.move.length + 5, ...KEY_LABELS.slice(1).map(l => l.length + 1)], v.cols, 2)
  return { tabs, count, keys, total: tabs + 3 + count + keys }
}

export function windowOf(m: Model, avail: number | null, offset: number | null = null) {
  const list = m.lines.slice(m.lines.findIndex(l => l.key === 'gap') + 1, m.lines.findIndex(l => l.key === 'gap2'))
  const heights = [0]
  for (const l of list) heights.push(heights[heights.length - 1]! + l.rows)
  const n = list.length, total = heights[n]!
  if (avail === null || total <= avail) return { start: 0, end: total, above: 0, below: 0 }
  const sel = Math.max(0, list.findIndex(l => l.key === lineKey(m.selected ?? '')))
  const a = Math.max(1, avail)
  let start = 0, end = 0
  // Include the selected row first, then spend the remaining height on its neighbours.
  while (end < n && heights[end + 1]! + (end + 1 < n ? 1 : 0) <= a) end++
  if (sel >= end) {
    start = sel; end = sel + 1
    while (start > 0 && heights[end]! - heights[start - 1]! + (start > 1 ? 1 : 0) + (end < n ? 1 : 0) <= a) start--
    while (start < sel && /^(chips|raw):/.test(list[start]!.key)) start++
    while (end < n && heights[end + 1]! - heights[start]! + (start > 0 ? 1 : 0) + (end + 1 < n ? 1 : 0) <= a) end++
  }
  // Window physical rows, including a slice of an expanded block taller than the list.
  const top = offset === null ? heights[start]! : Math.max(0, Math.min(offset, total - Math.max(1, a - 1)))
  const room = a - (top > 0 && a > 1 ? 1 : 0)
  const bottom = Math.min(total, top + room - (top + room < total && room > 1 ? 1 : 0))
  return { start: top, end: bottom, above: top, below: total - bottom }
}

export const HEAD = 'head:'
export const headKey = (b: string) => HEAD + b       // a group's box; F76: a Workflows tab section
export const isHead = (item: string | null): item is string => !!item && item.startsWith(HEAD)
// The drawn line an item sits on: a header's own key, a ticket's row.
export const lineKey = (item: string) => (isHead(item) ? item : 'row:' + item)
// F76: the Workflows tab's sections open and close by the same rule (their names, not boxes);
// F75: the Explorer's sections, folders and commits too - so it is generic.
export const toggleGroup = <T>(open: readonly T[], b: T): T[] =>
  open.includes(b) ? open.filter(x => x !== b) : [...open, b]

export const chipsOf = (t: Ticket) =>
  t.apps.length > 0 || !!t.owner || !!t.decide || t.by.length > 0 || !!t.session || isDecidable(t)
export const isDecidable = (t: Ticket) => t.box === '?' && !!t.decide

export function buildModel(v: View): Model {
  const shown = v.board ? visible(v.board, v.filter, v.me) : []
  const open = v.open ?? []
  const groups = GROUPS
    .filter(g => v.filter.showDone || (g.box !== 'x' && g.box !== '-'))
    .map(g => ({ ...g, tickets: shown.filter(t => t.box === g.box), open: open.includes(g.box) }))
    .filter(g => g.tickets.length > 0)
  const rows = groups.flatMap(g => (g.open ? g.tickets : []))
  const items = groups.flatMap(g => [headKey(g.box), ...(g.open ? g.tickets.map(t => t.id) : [])])
  // A ticket whose group is collapsed shows as its header selected; it is still the one
  // stored, so opening the group lands back on it.
  const want = v.selected
  const home = want && !isHead(want) ? groups.find(g => g.tickets.some(t => t.id === want)) : undefined
  const selected = (want && items.includes(want) ? want : home ? headKey(home.box) : null) ?? items[0] ?? null
  const ticket = selected && !isHead(selected) ? selected : null

  const lines: Model['lines'] = [{ key: 'tabs', rows: 1 }, { key: 'filters', rows: 1 }, { key: 'gap', rows: 1 }]
  for (const g of groups) {
    lines.push({ key: headKey(g.box), rows: 1 })
    if (!g.open) continue
    for (const t of g.tickets) {
      lines.push({ key: 'row:' + t.id, rows: 1 })
      if (chipsOf(t)) lines.push({ key: 'chips:' + t.id, rows: 1 })
      if (v.expanded === t.id) lines.push({ key: 'raw:' + t.id, rows: Math.max(1, Math.ceil((t.line.length + 10) / Math.max(10, v.cols))) })
    }
  }
  lines.push({ key: 'gap2', rows: 1 }, { key: 'count', rows: 1 }, { key: 'keys', rows: 1 })

  const filterActive = !!(v.filter.app || v.filter.who || v.filter.mine)
  const all = v.board?.tickets ?? []
  const pool = v.board ? visible(v.board, { ...v.filter, showDone: true }, v.me) : []
  // Open = [ ] [~] [%] [!] [?] (tickets-zordon, countLine, pending.sh); deferred keeps
  // its own dot after the open ones. "hidden by filter" is the open ones the filter
  // leaves out, deferred not among them, so match + hidden = the unfiltered "n open".
  const openT = pool.filter(isOpen)
  const hidden = all.filter(isOpen).length - openT.length
  const n = (list: Ticket[], b: State) => list.filter(t => t.box === b).length
  const dots = OPEN_STATES.map(box => ({ box, n: n(pool, box) })).filter(d => d.n > 0)
  const closed = (['x', '-'] as State[]).map(box => ({ box, n: n(pool, box) })).filter(d => d.n > 0)
  const closedN = closed.reduce((s, d) => s + d.n, 0)
  const text = filterActive
    ? `${openT.length} open match · ${hidden} hidden by filter`
    : `${openT.length} open` + dots.map(d => ` ●${d.n}`).join('') +
      (v.filter.showDone ? (closedN ? ' ·' + closed.map(d => ` ●${d.n}`).join('') + ' closed' : '')
        : (closedN ? ` · ${closedN} done hidden` : ''))
  const model = { groups, rows, items, selected, ticket, lines, count: { open: openT.length, dots, closed, text }, filterActive }
  if (v.ascii !== undefined) {
    const chrome = chromeRows(v, model, v.ascii ? ASCII : UNI)
    for (const key of ['tabs', 'count', 'keys'] as const) lines.find(l => l.key === key)!.rows = chrome[key]
  }
  return model
}

// F81: `ticket-meta reconcile`'s proposals, `<ID> [<now>] -> [<proposed>]  <reason>`; any
// other line ("no change: ..") is none. A row whose box stays is shown, never applied.
export function parseReconcile(out: string): Proposal[] {
  const rows: Proposal[] = []
  for (const l of out.split(/\r?\n/)) {
    const m = /^(\S+) \[(.)\] -> \[(.)\] {2}(.*)$/.exec(l)
    if (m) rows.push({ id: m[1]!, from: m[2] as State, to: m[3] as State, why: m[4]! })
  }
  return rows
}
// Only a box applyOf has a writer for; any other (a [x], a [>]) is shown, never applied.
export const canApply = (p: Proposal) => p.to !== p.from && ' ~%!'.includes(p.to)
// The ticket-meta subcommand that writes a proposal - the mod writes no file.
export const applyOf = (p: Proposal): { call: Call; args: string[] } =>
  p.to === ' ' ? { call: 'meta-unblock', args: [p.id] }
    : p.to === '~' ? { call: 'meta-start', args: [p.id] }
    : p.to === '%' ? { call: 'meta-testing', args: [p.id, p.why] }
    : { call: 'meta-block', args: [p.id, p.why] }
// The apply toast's lines, the pane's and the ops app's: one per row (err null: written), the head over them.
export const appliedLine = (p: Proposal, err: string | null) => err === null ? `✓ ${p.id} now ${STATE_NAME[p.to]}` : `✗ ${p.id} refused: ${err}`
export const appliedHead = (ok: number, n: number) => `${ok === n ? '✓' : '✗'} reconcile: ${ok} of ${n} applied`

// The first line of the window that keeps `item` (a ticket's row and its chips, or a
// header) in view, or null when it shows.
export function offsetFor(m: Model, item: string, top: number, bodyRows: number): number | null {
  const key = lineKey(item)
  const chips = isHead(item) ? null : 'chips:' + item
  let at = 0, start = -1, end = -1
  for (const l of m.lines) {
    if (l.key === key) start = at
    if (start >= 0 && (l.key === key || l.key === chips)) end = at + l.rows - 1
    at += l.rows
  }
  if (start < 0) return null
  if (start < top) return Math.max(0, start - 1)        // the heading above a group's first row too
  if (end >= top + bodyRows) return end - bodyRows + 1
  return null
}
