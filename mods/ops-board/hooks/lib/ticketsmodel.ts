import type { Board, Box as State, Filter, Member, Ticket } from '../../types'
import { GROUPS, isOpen, visible } from './board'

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
}

export const HEAD = 'head:'
export const headKey = (b: State) => HEAD + b
export const isHead = (item: string | null): item is string => !!item && item.startsWith(HEAD)
// The drawn line an item sits on: a header's own key, a ticket's row.
export const lineKey = (item: string) => (isHead(item) ? item : 'row:' + item)
export const toggleGroup = (open: readonly State[], b: State): State[] =>
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
  return { groups, rows, items, selected, ticket, lines, count: { open: openT.length, dots, closed, text }, filterActive }
}

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
