import type { Color } from 'claude-code'
import type { Board, Box, Filter, Ticket } from '../../types'

export type StateColor = 'amber' | 'cyan' | 'red' | 'violet' | 'neutral' | 'dim' | 'green'
// The pane shows state by colour; listView() keeps the bracket codes.
export const STATE_COLOR: Record<Box, StateColor> = {
  '~': 'amber', '%': 'cyan', '!': 'red', '?': 'violet', ' ': 'neutral', '>': 'dim', 'x': 'green', '-': 'dim',
}
// Theme keys follow the person's theme on every surface; dim states are drawn dim.
export const PAINT: Record<StateColor, Color> = {
  amber: 'warning', cyan: 'suggestion', red: 'error', violet: 'permission', neutral: 'text', dim: 'inactive', green: 'success',
}
export const paint = (b: Box): Color => PAINT[STATE_COLOR[b]]
// Open = [ ] [~] [%] [!] [?] (tickets-zordon, pending); deferred and closed are not.
// F62: [%] is testing - built, waiting on a test result.
const OPEN: Box[] = [' ', '~', '%', '!', '?']
export const isOpen = (t: Ticket) => OPEN.includes(t.box)
export const STATE_NAME: Record<Box, string> = {
  '~': 'in progress', '%': 'testing', '!': 'blocked', '?': 'pending decision', ' ': 'pending', '>': 'deferred', 'x': 'done', '-': 'cancelled',
}
export const GROUPS: { box: Box; title: string }[] = [
  { box: '~', title: 'IN PROGRESS' }, { box: '%', title: 'TESTING' }, { box: '!', title: 'BLOCKED' }, { box: '?', title: 'PENDING DECISION' },
  { box: ' ', title: 'PENDING' }, { box: '>', title: 'DEFERRED' }, { box: 'x', title: 'DONE' }, { box: '-', title: 'CANCELLED' },
]

// A ticket line as ticket-meta and pending read it: `- [b]`, blanks, the id
// ([A-Z]{1,3}[0-9]+[a-z]?), then an em dash, an en dash or a plain `-`.
const TICKET = /^([ \t]*)- \[([ ~%!?>x-])\][ \t]+([A-Z]{1,3}[0-9]+[a-z]?)[ \t]*(?:—|–|-)[ \t]*(.*)$/
// Anchored on the id, so `F3—re-run the GREEN` keeps "re-run the GREEN".
const ID_DASH = /^[A-Z]{1,3}[0-9]+[a-z]?[ \t]*(?:—|–|-)[ \t]*/
const handles = (s: string) => s.split(',').map(x => x.trim().toLowerCase()).filter(Boolean)
const tag = (s: string, name: string) => new RegExp('\\[' + name + ':\\s*([^\\]]*)\\]').exec(s)?.[1]?.trim() ?? null
const SESSION_TAIL = /\s\((@[\w-]+)\)\s*$/

export function parseBoard(text: string, path: string, mtimeMs: number, size: number): Board {
  const tickets: Ticket[] = []
  const stack: Ticket[] = []
  let section = ''
  for (const raw of text.split(/\r?\n/)) {
    const h = /^#{1,6}\s+(.*?)\s*$/.exec(raw)
    if (h) { section = h[1]!; stack.length = 0; continue }
    const m = TICKET.exec(raw)
    if (!m) continue
    const indent = m[1]!.length
    const line = raw.slice(indent + 5).replace(/^[ \t]+/, '')   // text after "- [b] "
    let body = m[4]!
    let session: string | null = null
    const s = SESSION_TAIL.exec(body)
    if (s) { session = s[1]!; body = body.slice(0, s.index) }
    let cut = body.search(/ \[(?:app|decide|owner|by):/)
    if (cut < 0) cut = body.search(/ \([^()]*\)\s*$/)
    const title = (cut < 0 ? body : body.slice(0, cut)).trim()
    while (stack.length && stack[stack.length - 1]!.indent >= indent) stack.pop()
    const t: Ticket = {
      id: m[3]!, box: m[2] as Box, title, line, parent: stack.length ? stack[stack.length - 1]!.id : null,
      indent, section,
      apps: handles(tag(body, 'app') ?? ''), decide: tag(body, 'decide')?.toLowerCase() ?? null,
      owner: tag(body, 'owner')?.toLowerCase() ?? null, by: handles(tag(body, 'by') ?? ''), session,
    }
    tickets.push(t)
    stack.push(t)
  }
  return { path, mtimeMs, size, tickets, error: null }
}

export function visible(b: Board, f: Filter, me: string | null): Ticket[] {
  const who = (f.mine ? me : f.who)?.toLowerCase() ?? null
  const app = f.app?.toLowerCase() ?? null
  return b.tickets.filter(t => {
    if (!f.showDone && (t.box === 'x' || t.box === '-')) return false
    if (app && !t.apps.includes(app)) return false
    if (f.mine && !me) return false
    if (who && t.owner !== who && t.decide !== who && !t.by.includes(who)) return false
    return true
  })
}

export function countLine(ts: Ticket[]): string {
  const n = (b: Box) => ts.filter(t => t.box === b).length
  const open = n(' ') + n('~') + n('%') + n('!') + n('?')
  const closed = n('x') + n('-')
  return `${open} open (${n(' ')} pending · ${n('~')} in-progress · ${n('%')} testing · ${n('!')} blocked · ${n('?')} pending decision)` +
    ` · ${n('>')} deferred · ${closed} closed (${n('x')} done · ${n('-')} cancelled) · ${ts.length} total`
}

const TYPE_NAME: Record<string, string> = { B: 'Bugs', F: 'Features', A: 'Agent-found' }
const TYPE_ORDER = ['B', 'F', 'A']
const STATUS_RANK: Box[] = ['~', '%', '!', '?', '>', ' ']
const STATUS_VIEW: { box: Box; title: string }[] = [
  { box: '~', title: 'In progress' }, { box: '%', title: 'Testing' }, { box: '!', title: 'Blocked' }, { box: '?', title: 'Pending decision' },
  { box: '>', title: 'Deferred' }, { box: ' ', title: 'Pending' }, { box: 'x', title: 'Done' }, { box: '-', title: 'Cancelled' },
]
const prefixOf = (id: string) => (/^[A-Za-z]+/.exec(id)?.[0] ?? id).toUpperCase()
const numOf = (id: string) => Number(/\d+/.exec(id)?.[0] ?? 0)

// The ticket's own words with the bracket code; the session tag is bookkeeping and is left off.
// Any of the three dashes the file may hold is shown as the em dash.
const shown = (t: Ticket) => `[${t.box}] ${t.id} — ${t.line.replace(ID_DASH, '').replace(SESSION_TAIL, '')}`

// /list-tickets body: tickets-zordon "Showing the board". Args: status, all, app:<a>, @person, <prefix>, <ID>.
export function listView(b: Board, args: string): string {
  let status = false, all = false
  let app: string | null = null, person: string | null = null, prefix: string | null = null, id: string | null = null
  for (const w of args.split(/\s+/).filter(Boolean)) {
    const lw = w.toLowerCase()
    if (lw === 'status') status = true
    else if (lw === 'all') all = true
    else if (lw.startsWith('app:')) app = lw.slice(4)
    else if (w.startsWith('@')) person = lw
    else if (/^[A-Za-z]+$/.test(w)) prefix = w.toUpperCase()
    else if (/^[A-Za-z]+\d+[A-Za-z]*$/.test(w)) id = lw
  }
  const pool = b.tickets.filter(t =>
    (!app || t.apps.includes(app)) &&
    (!person || t.owner === person || t.by.includes(person)) &&
    (!prefix || (prefixOf(t.id) === prefix && /^\d/.test(t.id.slice(prefix.length)))) &&
    (!id || t.id.toLowerCase() === id))
  const list = pool.filter(t => all || (t.box !== 'x' && t.box !== '-'))
  const ids = new Set(list.map(t => t.id))
  const byId = new Map(b.tickets.map(t => [t.id, t] as const))
  const openCount = pool.filter(isOpen).length
  const big = openCount >= 30 && !prefix
  const out: string[] = []

  if (status) {
    for (const g of STATUS_VIEW) {
      const rows = list.filter(t => t.box === g.box)
      if (!rows.length) continue
      out.push(g.title)
      for (const t of rows) out.push('  ' + shown(t) + (t.parent ? ` (${t.parent})` : ''))
      out.push('')
    }
  } else {
    const types = [...new Set(list.map(t => prefixOf(t.id)))].sort((a, c) => {
      const ia = TYPE_ORDER.indexOf(a), ic = TYPE_ORDER.indexOf(c)
      return (ia < 0 ? 99 : ia) - (ic < 0 ? 99 : ic) || a.localeCompare(c)
    })
    for (const ty of types) {
      let rows = list.filter(t => prefixOf(t.id) === ty)
      let extra = 0
      if (big) {
        rows = [...rows].sort((p, q) => {
          const rp = STATUS_RANK.indexOf(p.box), rq = STATUS_RANK.indexOf(q.box)
          return (rp < 0 ? 9 : rp) - (rq < 0 ? 9 : rq) || numOf(p.id) - numOf(q.id)
        })
        const drop = new Set(rows.filter(t => t.box === ' ').slice(20))
        extra = drop.size
        rows = rows.filter(t => !drop.has(t))
      }
      out.push(TYPE_NAME[ty] ?? ty)
      for (const t of rows) {
        // Nest under a shown parent; a parent that is not shown is named in trailing parentheses.
        let depth = 0, gone: string | null = null
        for (let p = t.parent; p && !big; p = byId.get(p)?.parent ?? null) {
          if (ids.has(p)) depth++
          else { gone = p; break }
        }
        const hang = big ? (t.parent ? ` (${t.parent})` : '') : (gone ? ` (${gone})` : '')
        out.push('  '.repeat(1 + depth) + shown(t) + hang)
      }
      if (extra) out.push(`… ${extra} more pending in ${TYPE_NAME[ty] ?? ty} — \`list tickets ${ty}\` for all of them`)
      out.push('')
    }
  }
  out.push(countLine(pool))
  return out.join('\n')
}
