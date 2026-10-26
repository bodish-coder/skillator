// The ops app's frames (design D5 Drawing, laid out as the owner-approved mock). Pure:
// a State gives exactly `rows` lines, each at most `cols` cells - tab bar first, then a
// blank line, the body (tickets, runs, health, team or the assign box, with the toast
// and notes at its foot), a blank, the count line, the keys line and the band last
// (one line from 80 columns, two below). Nothing ever wraps: every line is cut, the cut
// segment ends in '…'. No Claude Code-only words: this runs beside any CLI. app.ts
// writes what frame() returns; tests read it as text.
import type { Color } from 'claude-code'
import type { Seg } from '../hooks/lib/bandlines'
import { clean } from '../hooks/lib/bandlines'
import type { Model } from '../hooks/lib/ticketsmodel'
import type { Box, Level, Machine, RunView, Stage, Ticket, Usage, Window } from '../types'
import type { State } from './state'
import { dialogLines, engageLines, formLines, reconcileLines, runsCursor, setupLines, teamRow, viewOf } from './state'
import { messageLines, selectedOf, unreadCount } from '../hooks/lib/inbox'
import { buildModel, chipsOf, headKey, isDecidable, isHead, offsetFor } from '../hooks/lib/ticketsmodel'
import { modeOf, runLines, runStatus, RUNS_SECTIONS, sectionHead, sectionStatus, stageStatus, stageTickets, statusColor } from '../hooks/lib/runlines'
import { paint, STATE_COLOR, visible } from '../hooks/lib/board'
import { ageText, DISK, figure, GiB, HOLD_UNKNOWN, isStale, MEM, MUTED_HOW, mutedWords } from '../hooks/lib/facts'
import type { Limits } from '../hooks/lib/facts'
import { ticketsOf } from '../hooks/lib/team'
import { runKeys, runLines as runTabLines } from './runtab'
import { explorerBody } from './explorer'

// `plain`: text only, no SGR at all - for readers of text (--once without colour, a host's
// notification, tests). Colour off alone drops only the colours (F89: NO_COLOR asks no more).
export type Paint = { color: boolean; ascii: boolean; plain?: boolean }
// A seg whose meaning rides on its colour: `mono` is what it reads with colour off or --ascii.
type Mono = Seg & { mono?: string }

// Theme names → SGR (CONSTRAINTS); 'text' and any other name draw in the default colour.
const SGR: Record<string, string> = { warning: '33', error: '31', permission: '35', success: '32', suggestion: '36', inactive: '2' }
const HIGHLIGHT = ['1', '97', '44']

// --ascii: the design's map, plus the arrows, marks, dashes and box lines a raster console
// font lacks. Every glyph used maps to one cell except '…', which becomes three.
const ASCII: Record<string, string> = {
  '●': '*', '▲': '^', '■': '#', '█': '=', '░': '-', '…': '...', '▾': 'v', '▸': '>',
  '✓': '+', '✗': 'x', '→': '>', '←': '<', '↑': '^', '↓': 'v', '•': '*', '›': '>', '‹': '<', '—': '-', '–': '-',
  '┌': '+', '┐': '+', '└': '+', '┘': '+', '─': '-', '│': '|', '·': '.',
}
const ASCII_RE = new RegExp('[' + Object.keys(ASCII).join('') + ']', 'g')

export function glyph(s: string, ascii: boolean): string {
  return ascii ? s.replace(ASCII_RE, c => ASCII[c] ?? c) : s
}

export function cells(s: string): number {
  return [...s].length
}

export function fit(s: string, cols: number): string {
  if (cells(s) <= cols) return s
  return cols <= 0 ? '' : [...s].slice(0, cols - 1).join('') + '…'
}

export function plain(segs: Seg[]): string {
  return segs.map(s => s.text).join('')
}

export function ansi(segs: Seg[], p: Paint): string {
  return segs.map(s => {
    const text = glyph(!p.color ? (s as Mono).mono ?? s.text : s.text, p.ascii)
    if (p.plain || !text) return text
    const codes: string[] = []
    const add = (c: string | undefined) => { if (c && !codes.includes(c)) codes.push(c) }
    // F89: a highlight (selected row, focused field, active tab) is bold bright white on
    // blue - plain inverse reads poorly on coloured text and some themes; colour off keeps inverse
    if (p.color && s.inverse) HIGHLIGHT.forEach(add)
    else {
      add(p.color && s.color ? SGR[s.color] : undefined)
      add(s.dim ? '2' : undefined)
      add(s.bold ? '1' : undefined)
      add(s.inverse ? '7' : undefined)
    }
    return codes.length ? `\x1b[${codes.join(';')}m${text}\x1b[0m` : text
  }).join('')
}

export function paintScreen(lines: string[]): string {
  return '\x1b[H' + lines.join('\x1b[K\r\n') + '\x1b[K'
}

// One line cut to `cols` cells: the segment that crosses the limit is cut and ends in
// `ell`, the rest dropped.
function fitSegs(line: Seg[], cols: number, ell = '…'): Seg[] {
  const segs = line.map(s => ({ ...s, text: clean(s.text) }))
  if (segs.reduce((n, s) => n + cells(s.text), 0) <= cols) return segs
  let room = cols - cells(ell)
  if (room < 0) return [{ text: [...ell].slice(0, Math.max(0, cols)).join('') }]
  const out: Seg[] = []
  for (const s of segs) {
    const n = cells(s.text)
    if (n < room) { out.push(s); room -= n; continue }
    out.push({ ...s, text: [...s.text].slice(0, room).join('') + ell })
    return out
  }
  return out
}

const width = (line: Seg[]) => line.reduce((n, s) => n + cells(s.text), 0)
const cut = (s: string, room: number) => (cells(s) <= room ? s : [...s].slice(0, Math.max(1, room - 1)).join('') + '…')
const dim = (text: string): Seg => ({ text, dim: true })
const join = (parts: Seg[][], sep: string): Seg[] => parts.flatMap((p, i) => (i ? [{ text: sep }, ...p] : p))
const LEVEL_COLOR: Record<Level, Color> = { green: 'success', amber: 'warning', red: 'error' }

// `right` against the right edge when both fit with two cells between, else `left` alone.
function spread(left: Seg[], right: Seg[], cols: number): Seg[] {
  const gap = cols - width(left) - width(right)
  return right.length && gap >= 2 ? [...left, { text: ' '.repeat(gap) }, ...right] : left
}

type Keyed = { key: string; segs: Seg[] }

// The window of `h` lines that keeps item `id` (line 'row:'+id and its chips, or a header) in view;
// when lines are left below it, the last line says so.
function windowOf(lines: Keyed[], id: string | null, h: number): Seg[][] {
  if (lines.length <= h) return lines.map(l => l.segs)
  if (h <= 1) return h ? [lines[0]!.segs] : []
  const m = { lines: lines.map(l => ({ key: l.key, rows: 1 })) } as Pick<Model, 'lines'> as Model
  const top = id ? offsetFor(m, id, 0, h - 1) ?? 0 : 0
  const shown = lines.slice(top, top + h - 1).map(l => l.segs)
  return top + h - 1 < lines.length ? [...shown, [dim('  …')]] : lines.slice(lines.length - h).map(l => l.segs)
}

// --- the fixed lines ---

const TABS: [State['tab'], string][] = [['tickets', '1 Tickets'], ['runs', '2 Workflows'], ['health', '3 Health'], ['messages', '4 Messages'], ['explorer', '5 Explorer'], ['run', '6 Build']]

function tabsLine(s: State): Seg[] {
  // F66: the unread count rides on the Messages label
  const unread = unreadCount(s.messages, s.msgRead)
  const label = (id: State['tab'], l: string) => (id === 'messages' && unread ? `${l} (${unread})` : l)
  const tabs = join(TABS.map(([id, l]): Seg[] => [id === s.tab ? { text: label(id, l), inverse: true, bold: true }
    : id === 'messages' && unread ? { text: label(id, l), color: 'suggestion' } : dim(l)]), '   ')
  return spread([{ text: ' ' }, ...tabs], [dim(s.repo ? `ops · ${s.repo}` : 'ops')], s.cols)
}

// "7 open (6 pending · 1 in progress · 0 blocked · 0 decision) · 2 deferred", over the
// tickets the filter shows; a filter in force says what it hides instead.
function countLine(s: State, m: Model): Seg[] {
  if (!s.board || s.board.error) return []
  if (m.filterActive) return [dim(m.count.text)]
  const pool = visible(s.board, { ...s.filter, showDone: true }, s.me)
  const n = (b: Box) => pool.filter(t => t.box === b).length
  const open = n(' ') + n('~') + n('%') + n('!') + n('?')
  // F62: testing is named only while a ticket is under test, so the line keeps its 80-column fit.
  const head = `${open} open (${n(' ')} pending · ${n('~')} in progress` + (n('%') ? ` · ${n('%')} testing` : '')
    + ` · ${n('!')} blocked · ${n('?')} decision)`
    + (n('>') ? ` · ${n('>')} deferred` : '')
  // Done shown: the closed count too when it fits (the Done and Cancelled heads carry it anyway).
  const closed = ` · ${n('x') + n('-')} closed`
  return [dim(s.filter.showDone && n('x') + n('-') && cells(head + closed) <= s.cols ? head + closed : head)]
}

function keysOf(s: State, m: Model): string[] {
  if (s.setup) return ['tab / shift-tab field', 'space on/off', 'enter save', 'esc cancel']
  if (s.person) return ['tab / shift-tab field', 'enter add', 'esc cancel']
  if (s.dialog) return s.dialogField === 'ticket' ? ['type the ID', 'tab person', 'enter confirm', 'esc cancel']
    : ['↑↓ person', 'a / d kind', 'tab ticket', 'enter confirm', 'esc cancel']
  if (s.reconcile) return ['↑↓ move', 'space pick', 'enter apply picked', 'a accept all', 'esc none']   // F81
  if (s.engage) return ['enter engage', 'esc cancel']        // F85
  if (s.filterField) return ['←→ field', '↑↓ value', 'enter/esc leave']
  if (s.tab === 'run') return runKeys(s)                     // F79
  if (s.tab === 'runs') {
    // F76: on a section header Enter opens or closes it
    const cur = runsCursor(s)
    const enter = isHead(cur) ? (s.runsOpen.some(x => headKey(x) === cur) ? 'enter close' : 'enter open') : 'enter stages'
    return ['↑↓ move', enter, 'e engage', 'r reload', 'q quit']
  }
  if (s.tab === 'health') return ['R resume (on a fresh non-red reading)', 'F force resume', 'r reload', 'q quit']
  if (s.tab === 'messages') return ['↑↓ move', 'enter open', 'm mark all read', 's setup', 'q quit']
  if (s.tab === 'explorer') return ['↑↓ move', 'enter open/close', 'r reload', 'q quit']
  if (s.showTeam) return ['n add', 'del remove (asks first)', 'l make lead', 'esc back', 'q quit']   // A146: q closes the board here too
  const sel = m.rows.find(t => t.id === m.ticket)
  // F61: on a header Enter opens or closes its group
  const head = isHead(m.selected) ? m.groups.find(g => headKey(g.box) === m.selected) : undefined
  const enter = head ? (head.open ? 'enter close' : 'enter open') : 'enter line'
  return ['↑↓ move', enter, 'a assign', 'd decide', ...(sel && isDecidable(sel) ? ['D decided'] : []), 't team', 'c reconcile', 'r reload', 'q quit']
}

function keysLine(s: State, m: Model): Seg[] {
  // The Team view asking before a remove: the question takes the keys line's place.
  if (s.teamConfirm && !s.person && !s.dialog) return [{ text: `remove ${s.teamConfirm} from .skillator/team.md? (y/n)`, color: 'warning' }]
  // A144: one separator throughout. Too wide: drop the arrow hints, then the first hint,
  // until it fits - never the last (quit / leave / cancel).
  const ks = keysOf(s, m)
  while (ks.length > 1 && cells(ks.join(' · ')) > s.cols) {
    const arrow = ks.findIndex(k => /^[↑↓←→]/.test(k))
    ks.splice(arrow >= 0 && arrow < ks.length - 1 ? arrow : 0, 1)
  }
  return [dim(ks.join(' · '))]
}

// --- the band: one line from 80 columns, as the mock ---

// "2026-10-20T03:29Z mem 0.5 GB free" → "mem 0.5 GB free at 03:29Z".
function holdShort(hold: string): string {
  if (hold === HOLD_UNKNOWN) return '(reason unknown)'
  const m = /^(\S+)\s+(.*)$/.exec(hold)
  const hm = m ? /T(\d\d:\d\d)/.exec(m[1]!)?.[1] : undefined
  return m && hm ? `${m[2]} at ${hm}Z` : hold
}

function figSeg(bytes: number | null | undefined, t: Limits, tail: string): Seg {
  const f = figure(bytes ?? null, t)
  return f.level === null ? dim('?') : { text: f.text + tail, color: LEVEL_COLOR[f.level] }
}

// A usage figure: its colour from relay's decision on it; a stale one dim with its age.
function usageSeg(w: Window | null, held: boolean, now: number): Seg {
  if (!w) return dim('?')
  if (isStale(w, now)) return dim(`${w.pct}% (${ageText(w, now)})`)
  return { text: `${w.pct}%`, color: held ? 'warning' : 'success' }
}

const heldOf = (u: Usage | null) => {
  const d = (u?.decision ?? '').trim()
  return { five: /^HOLD \S+$/.test(d), seven: /^HOLD \S+ 7d$/.test(d) }
}

function bandSegs(s: State): Seg[][] {
  const { machine: m, usage: u, watch: w, now, cols } = s
  const red = w.level === 'red'
  const right: Seg[] = m?.hold || red ? [dim('R resume')] : []
  const lead: Seg[] = m?.hold || red
    ? [{ text: `${red ? '■' : '▲'} HOLD ${m?.hold ? holdShort(m.hold) : w.reasons.join('; ')}`, color: red ? 'error' : 'warning' }]
    : [{ text: '●', color: LEVEL_COLOR[w.level] }, { text: ' ops' }]
  const held = heldOf(u)
  const facts: Seg[][] = [
    [{ text: 'mem ' }, figSeg(m?.memFree, MEM, '')],
    [{ text: `${m?.drive || 'disk'} ` }, figSeg(m?.diskFree, DISK, ' free')],
  ]
  const usage: Seg[][] = [
    [{ text: '5h ' }, usageSeg(u?.five ?? null, held.five, now)],
    [{ text: '7d ' }, usageSeg(u?.seven ?? null, held.seven, now)],
    ...(m?.locks.length ? [[{ text: `${m.locks.length} stale lock${m.locks.length === 1 ? '' : 's'}`, color: 'warning' as Color }]] : []),
    ...(m?.mute ? [[{ text: mutedWords(m.mute), color: 'warning' as Color }]] : []),     // F87
    ...(m && now - m.at > 3 * 60 * 1000 ? [[dim(`facts ${Math.floor((now - m.at) / 60000)}m old`)]] : []),
  ]
  const room = cols - (right.length ? width(right) + 2 : 0)
  const edge = (left: Seg[]) => spread(fitSegs(left, Math.max(0, room)), right, cols)
  // Too wide: the disk figure loses its ' free' (as the mock), then the line is cut.
  const tight = (line: () => Seg[], limit: number) => {
    if (width(line()) > limit) facts[1] = [facts[1]![0]!, figSeg(m?.diskFree, DISK, '')]
    return line()
  }
  if (cols >= 80) return [edge(tight(() => join([lead, ...facts, ...usage], ' · '), room))]
  return [tight(() => join([lead, ...facts], ' · '), cols), edge(join(usage, ' · '))]
}

// --- the Tickets tab, as the mock ---

const GROUP_WORD: Record<Box, string> = {
  '~': 'In progress', '%': 'Testing', '!': 'Blocked', '?': 'Pending decision', ' ': 'Pending', '>': 'Deferred', x: 'Done', '-': 'Cancelled',
}

function filterLine(s: State): Seg[] {
  const f = s.filter, ff = s.filterField
  const val = (field: string, text: string): Seg => ({ text, inverse: ff === field })
  const left: Seg[] = [dim('filter  '), { text: 'app: ' }, val('app', f.app ?? 'all')]
  if (s.team.length) {
    left.push({ text: ' · who: ' }, val('who', f.mine ? 'me' : f.who ?? 'all'), { text: ' · mine: ' }, val('mine', f.mine ? 'on' : 'off'))
  }
  if (f.showDone) left.push({ text: ' · done: shown' })
  return spread(left, [dim(`f filter · x ${f.showDone ? 'hide' : 'show'} done`)], s.cols)
}

function chipLine(t: Ticket): Seg[] {
  const chip = (k: string, v: string): Seg[] => [{ text: k + ':', color: 'permission' }, { text: v, color: 'suggestion' }]
  const groups: Seg[][] = []
  if (t.apps.length) groups.push(t.apps.flatMap((a, i) => [...(i ? [{ text: ' ' }] : []), ...chip('app', a)]))
  if (t.owner) groups.push(chip('owner', t.owner))
  if (t.decide) groups.push(chip('decide', t.decide))
  if (t.by.length) groups.push(chip('by', t.by.join(' ')))
  if (t.session) groups.push([dim(t.session)])
  const out: Seg[] = [{ text: '      ' }]
  groups.forEach((g, i) => { if (i) out.push({ text: '  ' }); out.push(...g) })
  if (isDecidable(t)) out.push(dim('   D decided'))
  return out
}

// The tag a row carries at its right: the session working it (only while [~] or [%] - A143
// keeps the tag after the box moves on), else its owner or decider.
const tagOf = (t: Ticket) => (t.box === '~' || t.box === '%' ? t.session : null) ?? t.owner ?? (t.decide ? 'decide ' + t.decide : null)

// F61: groups as headers `  ▸ In progress (1)` (open: `▾`) in the state's colour, every one
// collapsed at first; Enter on a header opens or closes it. The selected header or row is
// `› ` and inverse. Rows `  ● F52  title    @tag` under an open header; Enter shows the
// chips and the raw line under a row.
function ticketLines(s: State, m: Model): Keyed[] {
  const b = s.board
  if (!b || b.error) return [{ key: 'msg', segs: [dim(b?.error ?? 'reading TICKETS.md…')] }]
  if (!m.groups.length) return [{ key: 'msg', segs: [dim(m.filterActive ? 'no ticket matches the filter' : 'no open tickets')] }]
  const out: Keyed[] = []
  const shown = new Set(m.rows.map(t => t.id))
  const idW = Math.max(4, ...m.rows.map(t => t.id.length + 1))
  for (const g of m.groups) {
    const hk = headKey(g.box)
    const on = hk === m.selected
    out.push({ key: hk, segs: [{ text: on ? '› ' : '  ' },
      { text: `${g.open ? '▾' : '▸'} ${GROUP_WORD[g.box]} (${g.tickets.length})`, color: paint(g.box), bold: true, inverse: on }] })
    if (!g.open) continue
    for (const t of g.tickets) {
      const nested = !!t.parent && shown.has(t.parent) && g.tickets.some(p => p.id === t.parent)
      const sel = t.id === m.selected
      const lead = (sel ? '› ' : '  ') + (nested ? '  ' : '')
      const tail = t.parent && !nested ? ` (${t.parent})` : ''
      const avail = s.cols - cells(lead) - 1                    // after the dot
      let tag = tagOf(t)
      let room = avail - 1 - idW - cells(tail) - (tag ? cells(tag) + 2 : 0)
      if (tag && room < 12) { tag = null; room = avail - 1 - idW - cells(tail) }
      const body = ` ${t.id.padEnd(idW)}${cut(clean(t.title), Math.max(4, room))}${tail}`
      const tagText = tag ? ' '.repeat(Math.max(2, avail - cells(body) - cells(tag))) + tag : ''
      const dot: Seg = { text: '●', color: paint(t.box) }
      out.push({ key: 'row:' + t.id, segs: sel
        ? [{ text: lead }, dot, { text: (body + tagText).padEnd(Math.max(0, avail)), inverse: true }]
        : [{ text: lead }, dot, { text: body, dim: STATE_COLOR[t.box] === 'dim' }, dim(tagText)] })
      if (s.expanded === t.id) {
        if (chipsOf(t)) out.push({ key: 'chips:' + t.id, segs: chipLine(t) })
        out.push({ key: 'raw:' + t.id, segs: [dim(`      - [${t.box}] ${t.line}`)] })
      }
    }
  }
  return out
}

// The Team view, as the mock: the picked member marked '› ' at the left edge and inverse.
function teamLines(s: State): Seg[][] {
  const line = (hd: string, n: string, e: string, t: string) => `${hd.padEnd(9)}${n.padEnd(14)}${e.padEnd(22)}${t}`
  const n = s.team.length
  const out: Seg[][] = [[{ text: 'Team', bold: true }, dim(`  .skillator/team.md · ${n} ${n === 1 ? 'person' : 'people'}${s.me ? ` · you: ${s.me}` : ''}`)]]
  if (!n) out.push([dim('  no .skillator/team.md yet - n adds the first person (ticket-meta creates the file)')])
  const sel = teamRow(s)
  for (const m of s.team) {
    const text = line(m.handle + ' ', (m.name ?? '') + ' ', m.emails.join(', ') + ' ', ticketsOf(m, s.board, s.me))
    out.push(m.handle === sel ? [{ text: '› ' }, { text: text.padEnd(Math.max(0, s.cols - 2)), inverse: true }] : [{ text: '  ' + text }])
  }
  return out
}

function ticketsBody(s: State, m: Model, h: number): Seg[][] {
  if (s.showTeam) return teamLines(s)
  return [filterLine(s), [], ...windowOf(ticketLines(s, m), m.selected, Math.max(0, h - 2))]
}

// --- the Runs tab, as the mock ---

// F76: a stage's mark is a `●` in its status colour, as the Tickets tab colours a ticket;
// with colour off or --ascii, the state's own glyph (review #6).
const STAGE_MONO: Record<string, string> = { x: '✓', '~': '●', open: '●', '!': '✗', '?': '?' }
function stageLine(st: Stage, planned: boolean): Seg[] {
  const ids = new Set(stageTickets(st))
  const words = st.title.split(' ')
  while (words.length > 1 && ids.has(words[0]!)) words.shift()
  const t = [...ids].join(' ')
  const dot: Mono = { text: '●', color: statusColor(stageStatus(st, planned)), mono: STAGE_MONO[st.state] ?? '·' }
  return [{ text: '    ' }, dot, { text: ` ${String(st.n).padStart(2)}  ` },
    ...(t ? [{ text: t + ' ', color: 'suggestion' as Color }] : []), { text: words.join(' ') }]
}

// F76: the Workflows tab (id 'runs') - a Runs section (relay runs) and a Workflows section, each a header
// with its count that Enter opens and closes, as F61's groups. The Workflow tool's runs
// are seen only by the host that runs it (the Claude Code pane), so here it says so.
function runsBody(s: State, h: number): Seg[][] {
  const sel = runsCursor(s)
  const out: Keyed[] = []
  for (const sec of RUNS_SECTIONS) {
    const hk = headKey(sec)
    const on = s.runsOpen.includes(sec)
    const n = sec === 'runs' ? (s.runsRead || s.runs.length ? s.runs.length : null) : null
    const st = sec === 'runs' ? sectionStatus(s.runs.map(runStatus)) : null     // F76: the header's colour
    out.push({ key: hk, segs: [{ text: hk === sel ? '› ' : '  ' },
      { text: sectionHead(sec, on, n), bold: true, inverse: hk === sel, color: st ? statusColor(st) : undefined }] })
    if (!on) continue
    if (sec === 'workflows') out.push({ key: 'wf:none', segs: [dim('    not observable here - only the host that runs a workflow sees it')] })
    else out.push(...runRows(s, sel))
  }
  return windowOf(out, sel, h)
}

function runRows(s: State, sel: string): Keyed[] {
  if (!s.runs.length) return [{ key: 'none', segs: [dim('    ' + (s.runsRead ? 'no open runs - plan one with relay-morpheus (plan-runs)' : 'reading runs…'))] }]
  const idW = Math.max(...s.runs.map(r => r.id.length)) + 2
  const out: Keyed[] = s.runs.map((run: RunView): Keyed => {
    const dot: Seg = { text: '●', color: statusColor(runStatus(run)) }   // F76: the Tickets tab's colours
    const right = modeOf(run) + ' · ' + (run.planned ? `planned · ${run.stages.length} stage${run.stages.length === 1 ? '' : 's'}` : `${run.done}/${run.total} done`)
    const isSel = run.id === sel
    const avail = s.cols - 3
    const body = ` ${run.id.padEnd(idW)}${cut(clean(run.title), Math.max(4, avail - idW - 1 - right.length - 2))}`
    const text = body + ' '.repeat(Math.max(2, avail - cells(body) - right.length)) + right
    return { key: 'row:' + run.id, segs: isSel
      ? [{ text: '› ' }, dot, { text: text.padEnd(avail), inverse: true }]
      : [{ text: '  ' }, dot, { text: body }, dim(text.slice(body.length))] }
  })
  const ex = s.runs.find(r => r.id === s.runsExpanded)
  if (ex) {
    out.push({ key: 'gap', segs: [] }, { key: 'stages', segs: [{ text: `  ${ex.id} stages`, bold: true }] })
    if (!ex.stages.length) out.push({ key: 'none', segs: [dim('    no stages read yet')] })
    ex.stages.forEach(st => out.push({ key: 'st:' + st.n, segs: stageLine(st, ex.planned) }))
    for (const l of runLines(ex, s.board)) {
      if (/^(par|dec|phase):/.test(l.key)) out.push({ key: l.key, segs: [{ text: '    ' }, ...l.segs] })
    }
    out.push({ key: 'start', segs: [dim('    e engages it; the command is then shown to paste into your CLI')] })
  }
  return out
}

// --- the Health tab, as the mock: Usage and Machine, a label column ---

const BAR = 20
const row = (label: string, value: Seg[]): Seg[] => [{ text: '  ' + label.padEnd(14) }, ...value]

function usageRow(label: string, w: Window | null, held: boolean, now: number): Seg[] {
  if (!w) return row(label, [dim('not observable here')])
  const stale = isStale(w, now)
  const filled = Math.round(Math.min(100, Math.max(0, w.pct)) / 100 * BAR)
  const c: Color | undefined = stale ? undefined : held ? 'warning' : 'success'
  return row(label, [{ text: '█'.repeat(filled), color: c, dim: stale }, dim('░'.repeat(BAR - filled)),
    { text: `  ${w.pct}%`, color: c, dim: stale }, dim(` (${ageText(w, now)}${stale ? ', stale' : ''})`)])
}

function relayRow(u: Usage | null): Seg[] {
  const d = (u?.decision ?? '').trim()
  const h = /^HOLD (\S+)( 7d)?$/.exec(d)
  if (h) return row('Relay', h[2]
    ? [{ text: `■ 7-day hold reached (${h[1]}%)`, color: 'error' }, dim(' - waits for the reset or your go')]
    : [{ text: `▲ 5-hour hold reached (${h[1]}%)`, color: 'warning' }, dim(' - new stages wait')])
  if (/^RELEASE /.test(d)) return row('Relay', [{ text: 'stages run', color: 'success' }, dim(` (${d})`)])
  if (d === 'UNOBSERVABLE') return row('Relay', [{ text: 'no usage reading', color: 'warning' }, dim(' (UNOBSERVABLE)')])
  if (!u?.five && !u?.seven) return row('Relay', [dim('no decision without a reading')])
  return row('Relay', [dim('decision not known yet')])
}

function factRow(label: string, bytes: number | null, t: Limits): Seg[] {
  const f = figure(bytes, t)
  const value: Seg = f.level === null ? dim('not known') : { text: `${f.text} free`, color: LEVEL_COLOR[f.level] }
  return row(label, [{ ...value, text: value.text.padEnd(19) }, dim(`amber < ${t.amber / GiB} GB · red < ${t.red / GiB} GB`)])
}

function machineRows(m: Machine | null, red: boolean, now: number): Seg[][] {
  if (!m) return [[dim('  machine facts not read yet')]]
  const n = m.locks.length
  const out: Seg[][] = [
    factRow('Memory', m.memFree, MEM),
    factRow(m.drive ? `Disk ${m.drive}` : 'Disk', m.diskFree, DISK),
    row('Hold', m.hold
      ? [{ text: m.hold === HOLD_UNKNOWN ? 'set (reason unknown)' : `set ${holdShort(m.hold).replace(/^(.*) at (\S+)$/, '$2: $1')}`, color: red ? 'error' : 'warning' }]
      : [dim('none')]),
    row('Stale locks', n ? [{ text: `${n} stale, not deleted`, color: 'warning' }] : [dim('none')]),
  ]
  // F87: muted by F / /ops resume force - when, the free memory then, how it ends
  if (m.mute) out.push(row('Muted', [{ text: `${mutedWords(m.mute)}, ${m.mute.slice(m.mute.indexOf(' ') + 1)} then`, color: 'warning' }]),
    row('', [dim(MUTED_HOW)]))
  // F82: a stale board amber, board-fresh's refusal red with its reason
  if (m.board) out.push(row('Board', [{ text: `stale: ${m.board.behind} behind ${m.board.up}`, color: 'warning' }]))
  if (m.board?.state === 'refused') out.push(row('', [{ text: `refused: ${m.board.reason}`, color: 'error' }]))
  if (now - m.at > 3 * 60 * 1000) out.push([dim(`  facts ${Math.floor((now - m.at) / 60000)}m old`)])
  return out
}

function healthBody(s: State): Seg[][] {
  const u = s.usage
  const held = heldOf(u)
  const out: Seg[][] = [
    [{ text: 'Usage'.padEnd(15), bold: true }, dim('from watch-cortana usage-watch level')],
    usageRow('5-hour', u?.five ?? null, held.five, s.now),
    usageRow('7-day', u?.seven ?? null, held.seven, s.now),
    relayRow(u),
    row('Credit', [dim('not available')]),
  ]
  if (u?.spendLimitPct !== null && u?.spendLimitPct !== undefined) out.push(row('Spend limit', [{ text: `${u.spendLimitPct}% used` }]))
  if (u?.costUsd !== null && u?.costUsd !== undefined) out.push(row('Spent', [{ text: `$${u.costUsd.toFixed(2)} this session` }]))
  out.push([], [{ text: 'Machine', bold: true }], ...machineRows(s.machine, s.watch.level === 'red', s.now))
  return out
}

// --- the assign box and the Add person form, as the mock ---

// A box as the mock draws it: `title` in the top edge, then `rows` (the line a script
// refused with drawn in red) inside, two cells in from the left edge when there is room.
type Boxed = { title: string; rows: { text: string; color?: Color }[] }
const innerOf = (s: State) => Math.max(4, Math.min(s.cols - 2, 67)) - 2
function boxBody(s: State, b: Boxed): Seg[][] {
  const inner = innerOf(s)
  const pad = s.cols - inner - 2 >= 2 ? '  ' : ''
  const title = cut(clean(b.title), Math.max(1, inner - 4))
  const out: Seg[][] = [[{ text: pad + '┌─ ' }, { text: title, bold: true }, { text: ' ' + '─'.repeat(Math.max(0, inner - cells(title) - 3)) + '┐' }]]
  for (const r of b.rows) out.push([{ text: pad + '│' }, { text: fit(clean(r.text), inner).padEnd(inner), color: r.color }, { text: '│' }])
  out.push([{ text: pad + '└' + '─'.repeat(inner) + '┘' }])
  return out
}

function dialogBody(s: State): Seg[][] {
  const r = s.dialog?.result ? '  ' + s.dialog.result : null
  const ls = dialogLines(s)
  const rows: Boxed['rows'] = []
  ls.slice(1).forEach((l, i, all) => {
    const last = i === all.length - 1
    if (last || /^ {2}Change /.test(l)) rows.push({ text: '' })
    for (const part of l.split(/\r?\n/)) rows.push({ text: part, color: l === r ? 'error' : undefined })
    if (i === 1) rows.push({ text: '' })   // F77: after the Ticket line and the kind
  })
  return boxBody(s, { title: ls[0] ?? '', rows })
}

// The Add person form, boxed as the mock: a Runs line too wide for the box puts its
// emails on the next line, under the command; ticket-meta's refusal (it names the team
// file's full path) wraps inside the box, in red, up to three lines.
function formBody(s: State): Seg[][] {
  const r = s.person?.result ? '  ' + s.person.result : null
  const ls = formLines(s)
  const inner = innerOf(s)
  const rows: Boxed['rows'] = []
  for (const l of ls.slice(1)) {
    const runs = /^( {2}Runs {4})(.* )(\S+)$/.exec(l)
    if (runs && cells(l) > inner) {
      rows.push({ text: (runs[1]! + runs[2]!).trimEnd() }, { text: ' '.repeat(runs[1]!.length) + runs[3]! })
      continue
    }
    if (l !== r) { rows.push({ text: l }); continue }
    const room = Math.max(1, inner - 2)
    const chars = [...clean(r.slice(2).replace(/\r?\n/g, ' '))]
    for (let i = 0; i < chars.length && i < room * 3; i += room) rows.push({ text: '  ' + chars.slice(i, i + room).join(''), color: 'error' })
  }
  return boxBody(s, { title: ls[0] ?? '', rows })
}

// --- F66: the Messages tab and the Teams setup form ---

function messagesBody(s: State, h: number): Seg[][] {
  const lines = messageLines({ msgs: s.messages, readId: s.msgRead, selected: s.msgSelected, expanded: s.msgExpanded, cols: s.cols })
  const sel = selectedOf(s.messages, s.msgSelected)
  return windowOf(lines.map(l => ({ key: l.key, segs: l.segs.map(x => ({ ...x, text: clean(x.text) })) })), sel, h)
}

// The setup form, boxed like Add person; its result line (a check or teams-uhura's
// refusal) in red. The token is never in these lines (setupLines masks it).
function setupBody(s: State): Seg[][] {
  const ls = setupLines(s)
  const res = s.setup?.result ? '  ' + s.setup.result : null
  const rows: Boxed['rows'] = ls.slice(1).map(l => ({ text: l, color: l === res ? 'error' : /\(y\/n\)$/.test(l) ? 'warning' : undefined }))
  return boxBody(s, { title: ls[0] ?? '', rows })
}

// --- the frame ---

// The toast (what the last action said) and the notes (stale locks, a hold not set).
function tailLines(s: State): Seg[][] {
  const out: Seg[][] = []
  const lead = (t: string): Seg['color'] => (/^[✓]/.test(t) ? 'success' : /^[■✗]/.test(t) ? 'error' : /^▲/.test(t) ? 'warning' : undefined)
  for (const block of [...(s.toast ? [s.toast] : []), ...s.notes]) {
    block.split(/\r?\n/).forEach((l, i) => out.push([/^ran: /.test(l) ? dim(l) : { text: l, color: i === 0 ? lead(l) : undefined }]))
  }
  return out
}

function bodyOf(s: State, m: Model, h: number): Seg[][] {
  const tail = tailLines(s).slice(0, Math.floor(h / 2))
  const block = tail.length && h - tail.length >= 2 ? [[], ...tail] : tail
  const room = h - block.length
  const [recTitle = '', ...recRows] = reconcileLines(s)    // F81: [] with no reconcile box up
  const [engTitle = '', ...engRows] = engageLines(s)       // F85: [] with no engage box up
  const main = s.setup ? setupBody(s)
    : s.person ? formBody(s)
    : s.dialog ? dialogBody(s)
    : s.reconcile ? boxBody(s, { title: recTitle, rows: recRows.map(text => ({ text })) })   // F81
    : s.engage ? boxBody(s, { title: engTitle, rows: engRows.map(text => ({ text })) })      // F85
    : s.tab === 'runs' ? runsBody(s, room)
    : s.tab === 'health' ? healthBody(s)
    : s.tab === 'messages' ? messagesBody(s, room)
    : s.tab === 'explorer' ? explorerBody(s, room)
    : s.tab === 'run' ? windowOf(runTabLines(s), s.runForm ? null : s.runSel, room)
    : ticketsBody(s, m, room)
  const top = main.slice(0, room)
  while (top.length < room) top.push([])
  return [...top, ...block]
}

export function frameSegs(s: State): Seg[][] {
  const cols = Math.max(0, s.cols), rows = Math.max(0, s.rows)
  const m = buildModel(viewOf(s))
  const band = bandSegs(s)
  const fixed = 2 + 3 + band.length                 // tabs, blank | blank, count, keys | band
  const body = bodyOf(s, m, Math.max(0, rows - fixed))
  let lines: Seg[][] = [tabsLine(s), [], ...body, [], countLine(s, m), keysLine(s, m), ...band]
  if (lines.length > rows) lines = rows ? [lines[0]!, ...lines.slice(lines.length - (rows - 1))] : []
  return lines.map(l => fitSegs(l, cols))
}

export function frame(s: State, p: Paint): string[] {
  const cols = Math.max(0, s.cols)
  return frameSegs(s).map(l => p.ascii
    ? ansi(fitSegs(l.map((x: Mono) => ({ ...x, text: glyph(x.mono ?? x.text, true), mono: undefined })), cols, '...'), { ...p, ascii: false })
    : ansi(l, p))
}
