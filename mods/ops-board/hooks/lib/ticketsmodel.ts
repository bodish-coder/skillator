import type { Board, Box as State, Filter, Member, Ticket } from '../../types'
import { GROUPS, isOpen, visible } from './board'

// The Tickets tab's model (design §5): groups, drawn rows, line keys for keeping a
// row in view, the count line. Pure; pane.tsx draws it, the ops app frames it.

const OPEN_STATES: State[] = ['~', '!', '?', ' ', '>']

export type Model = {
  groups: { box: State; title: string; tickets: Ticket[] }[]
  rows: Ticket[]                      // visible rows in drawn order: what up/down walk
  selected: string | null             // the selection in force (the first row when none is)
  lines: { key: string; rows: number }[]   // every drawn line in order, for keeping a row in view
  count: { open: number; dots: { box: State; n: number }[]; closed: { box: State; n: number }[]; text: string }
  filterActive: boolean
}

export type View = {
  board: Board | null; team: Member[]; me: string | null; filter: Filter; filterOpen: boolean
  selected: string | null; expanded: string | null; cols: number
}

export const chipsOf = (t: Ticket) =>
  t.apps.length > 0 || !!t.owner || !!t.decide || t.by.length > 0 || !!t.session || isDecidable(t)
export const isDecidable = (t: Ticket) => t.box === '?' && !!t.decide

export function buildModel(v: View): Model {
  const shown = v.board ? visible(v.board, v.filter, v.me) : []
  const groups = GROUPS
    .filter(g => v.filter.showDone || (g.box !== 'x' && g.box !== '-'))
    .map(g => ({ ...g, tickets: shown.filter(t => t.box === g.box) }))
    .filter(g => g.tickets.length > 0)
  const rows = groups.flatMap(g => g.tickets)
  const selected = rows.find(t => t.id === v.selected)?.id ?? rows[0]?.id ?? null

  const lines: Model['lines'] = [{ key: 'tabs', rows: 1 }, { key: 'filters', rows: 1 }, { key: 'gap', rows: 1 }]
  for (const g of groups) {
    lines.push({ key: 'head:' + g.box, rows: 1 })
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
  // Open = [ ] [~] [!] [?] (tickets-zordon, countLine, pending.sh); deferred keeps
  // its own dot after the open ones. "hidden by filter" is the open ones the filter
  // leaves out, deferred not among them, so match + hidden = the unfiltered "n open".
  const open = pool.filter(isOpen)
  const hidden = all.filter(isOpen).length - open.length
  const n = (list: Ticket[], b: State) => list.filter(t => t.box === b).length
  const dots = OPEN_STATES.map(box => ({ box, n: n(pool, box) })).filter(d => d.n > 0)
  const closed = (['x', '-'] as State[]).map(box => ({ box, n: n(pool, box) })).filter(d => d.n > 0)
  const closedN = closed.reduce((s, d) => s + d.n, 0)
  const text = filterActive
    ? `${open.length} open match · ${hidden} hidden by filter`
    : `${open.length} open` + dots.map(d => ` ●${d.n}`).join('') +
      (v.filter.showDone ? (closedN ? ' ·' + closed.map(d => ` ●${d.n}`).join('') + ' closed' : '')
        : (closedN ? ` · ${closedN} done hidden` : ''))
  return { groups, rows, selected, lines, count: { open: open.length, dots, closed, text }, filterActive }
}

// The first line of the window that keeps row `id` (and its chips) in view, or null when it shows.
export function offsetFor(m: Model, id: string, top: number, bodyRows: number): number | null {
  let at = 0, start = -1, end = -1
  for (const l of m.lines) {
    if (l.key === 'row:' + id) start = at
    if (start >= 0 && (l.key === 'row:' + id || l.key === 'chips:' + id)) end = at + l.rows - 1
    at += l.rows
  }
  if (start < 0) return null
  if (start < top) return Math.max(0, start - 1)        // the heading above a group's first row too
  if (end >= top + bodyRows) return end - bodyRows + 1
  return null
}

