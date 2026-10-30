// The ops app's frames (design D5 Drawing, laid out as the owner-approved mock). Pure:
// a State gives exactly `rows` lines, each at most `cols` cells - tab bar first, then a
// blank line, the body (tickets, runs, health, team or the assign box, with the toast
// and notes at its foot), a blank, the count line, the keys line and the band last
// (one line from 80 columns, two below). Nothing ever wraps: every line is cut, the cut
// segment ends in '…'. No Claude Code-only words: this runs beside any CLI. app.ts
// writes what frame() returns; tests read it as text.
import type { Color } from 'claude-code'
import type { Seg as BaseSeg } from '../hooks/lib/bandlines'
import { clean } from '../hooks/lib/bandlines'
import type { Model } from '../hooks/lib/ticketsmodel'
import type { Box, Level, Machine, RunView, Stage, Ticket, Usage, Window } from '../types'
import type { State, PointerAction, SkillGuide } from './state'
import { activeUser, pointerModal, dialogLines, engageLines, filteredSkills, formLines, reconcileLines, runsCursor, setupLines, SKILLS, startRunLines, teamRow, viewOf } from './state'
import { messageLines, selectedOf, unreadCount } from '../hooks/lib/inbox'
import { assignedTickets, buildModel, chipsOf, decideTickets, headKey, isDecidable, isHead, isUserHead, isUserSectionOpen, offsetFor } from '../hooks/lib/ticketsmodel'
import type { UserSection } from '../hooks/lib/ticketsmodel'
import { isFinished, modeOf, runLines, runStatus, RUNS_SECTIONS, sectionHead, sectionStatus, stageStatus, stageTickets, statusColor } from '../hooks/lib/runlines'
import { paint, STATE_COLOR, visible } from '../hooks/lib/board'
import { ageText, DISK, figure, GiB, HOLD_UNKNOWN, isStale, MEM, MUTED_HOW, mutedWords } from '../hooks/lib/facts'
import type { Limits } from '../hooks/lib/facts'
import { ticketsOf } from '../hooks/lib/team'
import { runLines as runTabLines } from './runtab'
import { explorerBody } from './explorer'

export type Seg = BaseSeg & { action?: PointerAction }
const hot = (text: string, name: string, shift = false): Seg => ({
  text: text.startsWith('[') && text.endsWith(']') ? text : `[${text}]`,
  dim: true,
  action: { kind: 'key', key: { name, shift } },
})
const actionLine = (line: Seg[], action: PointerAction): Seg[] => line.map(s => ({ ...s, action: s.action ?? action }))

// plain: text only, no SGR at all - for readers of text (--once without colour, a host's
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

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const parts = (s: string) => [...graphemes.segment(s)].map(x => x.segment)
const cellWidth = (s: string): number => {
  if (/^[\p{Mark}\u200d\ufe0e\ufe0f]+$/u.test(s)) return 0
  const c = s.codePointAt(0) ?? 0
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(s) || c >= 0x1100 && (c <= 0x115f || c >= 0x2329 && c <= 0x232a || c >= 0x2e80 && c <= 0xa4cf || c >= 0xac00 && c <= 0xd7a3 || c >= 0xf900 && c <= 0xfaff || c >= 0xfe10 && c <= 0xfe19 || c >= 0xfe30 && c <= 0xfe6f || c >= 0xff01 && c <= 0xff60 || c >= 0xffe0 && c <= 0xffe6 || c >= 0x20000) ? 2 : 1
}
export const cells = (s: string): number => parts(s).reduce((n, g) => n + cellWidth(g), 0)
const prefix = (s: string, room: number): string => {
  let out = '', n = 0
  for (const g of parts(s)) { n += cellWidth(g); if (n > room) break; out += g }
  return out
}
export function fit(s: string, cols: number): string {
  return cells(s) <= cols ? s : cols <= 0 ? '' : prefix(s, cols - 1) + '…'
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
  if (room < 0) return [{ text: prefix(ell, Math.max(0, cols)) }]
  const out: Seg[] = []
  for (const s of segs) {
    const n = cells(s.text)
    if (n < room) { out.push(s); room -= n; continue }
    out.push({ ...s, text: prefix(s.text, room) }, { text: ell })
    return out
  }
  return out
}

const width = (line: Seg[]) => line.reduce((n, s) => n + cells(s.text), 0)
const cut = (s: string, room: number) => (cells(s) <= room ? s : prefix(s, Math.max(0, room - 1)) + '…')
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
function windowOf(lines: Keyed[], id: string | null, h: number, area?: 'tickets' | 'runs' | 'messages' | 'run'): Seg[][] {
  if (area) lines = lines.map(l => ({ ...l, segs: /^(row:|head:)/.test(l.key) ? actionLine(l.segs, { kind: 'row', area, id: l.key.startsWith('row:') ? l.key.slice(4) : l.key }) : l.segs }))
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
  const tabs = join(TABS.map(([id, l]): Seg[] => actionLine([id === s.tab ? { text: label(id, l), inverse: true, bold: true }
    : id === 'messages' && unread ? { text: label(id, l), color: 'suggestion' } : dim(l)], { kind: 'tab', tab: id })), '   ')
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

function keysOf(s: State, m: Model): Seg[][] {
  const h = (text: string, key: string) => [hot(text, key)]
  const move: Seg[] = [
    { text: '[↑', dim: true, action: { kind: 'key', key: { name: 'up' } } },
    { text: '↓ move]', dim: true, action: { kind: 'key', key: { name: 'down' } } },
  ]
  const cancel = h('esc cancel', 'escape'), quit = h('q quit', 'q')
  const field: Seg[] = [
    { text: '[tab', dim: true, action: { kind: 'key', key: { name: 'tab' } } },
    dim(' / '),
    { text: 'shift-tab field]', dim: true, action: { kind: 'key', key: { name: 'tab', shift: true } } },
  ]
  if (s.help?.filtering) return [[dim('type filter')], h('enter apply', 'return'), cancel]
  if (s.help?.expanded) return [move, h('enter/esc back', 'return'), h('/ filter', '/'), h('c copy ref', 'c'), cancel]
  if (s.help) return [move, h('enter doc', 'return'), h('/ filter', '/'), h('c copy ref', 'c'), cancel]
  if (s.setup?.confirmClear) return [h('y clear', 'y'), h('n cancel', 'n')]
  if (s.setup) return [field, h('space on/off', 'space'), h('enter save', 'return'), cancel]
  if (s.person) return [field, h('enter add', 'return'), cancel]
  if (s.dialog) return s.dialogField === 'ticket' ? [[dim('type the ID')], h('tab person', 'tab'), h('enter confirm', 'return'), cancel]
    : [[{ text: '[↑', dim: true, action: { kind: 'key', key: { name: 'up' } } }, { text: '↓ person]', dim: true, action: { kind: 'key', key: { name: 'down' } } }], [{ text: '[a', dim: true, action: { kind: 'key', key: { name: 'a' } } }, dim(' / '), { text: 'd kind]', dim: true, action: { kind: 'key', key: { name: 'd' } } }], h('tab ticket', 'tab'), h('enter confirm', 'return'), cancel]
  if (s.reconcile) return [move, h('space pick', 'space'), h('enter apply picked', 'return'), h('a accept all', 'a'), h('esc none', 'escape')]
  if (s.engage) return [h('enter engage', 'return'), cancel]
  if (s.startRun) return [field, h('space change', 'space'), h('enter confirm', 'return'), cancel]
  if (s.filterField) return [[{ text: '[←', dim: true, action: { kind: 'key', key: { name: 'left' } } }, { text: '→ field]', dim: true, action: { kind: 'key', key: { name: 'right' } } }], [{ text: '[↑', dim: true, action: { kind: 'key', key: { name: 'up' } } }, { text: '↓ value]', dim: true, action: { kind: 'key', key: { name: 'down' } } }], h('enter/esc leave', 'escape')]
  if (s.tab === 'run') {
    if (s.runForm?.mode === 'confirm') return [h('enter run', 'return'), h('n rename', 'n'), cancel]
    if (s.runForm) return [[dim('type the name')], h('enter save', 'return'), cancel]
    return [move, h('enter run', 'return'), h('n rename', 'n'), h('r rescan', 'r'), ...(s.runJob && s.runJob.ended === null ? [h('s stop', 's')] : []), quit]
  }
  if (s.tab === 'runs') {
    const cur = runsCursor(s)
    const enter = isHead(cur) ? (s.runsOpen.some(x => headKey(x) === cur) ? 'enter close' : 'enter open') : 'enter stages'
    return [move, h(enter, 'return'), h('s Start', 's'), h('Engage', 'e'), h('Rerun', 'r'), h('Push Pending', 'p'), h('Mode: ||/seq', 'm'), quit]
  }
  if (s.tab === 'health') return [h('R resume (on a fresh non-red reading)', 'R'), h('F force resume', 'F'), h('r reload', 'r'), quit]
  if (s.tab === 'messages') return [move, h('enter open', 'return'), h('m mark all read', 'm'), h('s setup', 's'), quit]
  if (s.tab === 'explorer') return [move, h('enter open/close', 'return'), h('r reload', 'r'), quit]
  if (s.showTeam) return [h('n add', 'n'), h('del remove (asks first)', 'delete'), h('l make lead', 'l'), h('esc back', 'escape'), quit]
  const sel = m.rows.find(t => t.id === m.ticket)
  const isUsrHead = isUserHead(s.selected)
  const userOpen = isUsrHead ? isUserSectionOpen(s.open as string[], s.selected === 'head:assigned' ? 'assigned' : 'decide') : false
  const head = isHead(s.selected ?? m.selected) ? m.groups.find(g => headKey(g.box) === (s.selected ?? m.selected)) : undefined
  const enter = isUsrHead ? (userOpen ? 'enter close' : 'enter open') : head ? (head.open ? 'enter close' : 'enter open') : 'enter line'
  return [move, h(enter, 'return'), h('a assign', 'a'), h('d decide', 'd'), ...(sel && isDecidable(sel) ? [h('D decided', 'D')] : []), h('t team', 't'), h('c reconcile', 'c'), h('r reload', 'r'), quit]
}

export function keysLines(s: State, m: Model): Seg[][] {
  if (s.teamConfirm && !s.person && !s.dialog) {
    return [[{ text: `remove ${s.teamConfirm} from .skillator/team.md? (y/n)`, color: 'warning', action: { kind: 'key', key: { name: 'y' } } }]]
  }
  const ks = keysOf(s, m)
  if (!ks.length) return []
  const full = join(ks, ' · ')
  if (width(full) <= s.cols) return [full]

  // If terminal height is too constrained to permit wrapping without breaking body viewport
  if (s.rows < 8) return [fitSegs(full, s.cols)]

  // Try 2 lines: balanced split where both fit in s.cols
  let best2: Seg[][] | null = null
  for (let i = 1; i < ks.length; i++) {
    const l1 = join(ks.slice(0, i), ' · ')
    const l2 = join(ks.slice(i), ' · ')
    if (width(l1) <= s.cols && width(l2) <= s.cols) {
      if (!best2 || Math.abs(width(l1) - width(l2)) < Math.abs(width(best2[0]!) - width(best2[1]!))) {
        best2 = [l1, l2]
      }
    }
  }
  if (best2) return best2

  // Multiple lines (e.g. 3 lines on narrow viewports like 40 cols):
  const lines: Seg[][] = []
  let cur: Seg[][] = []
  let curWidth = 0
  for (const k of ks) {
    const kw = width(k)
    const sep = cur.length ? 3 : 0
    if (cur.length && curWidth + sep + kw > s.cols) {
      lines.push(join(cur, ' · '))
      cur = [k]
      curWidth = kw
    } else {
      cur.push(k)
      curWidth += sep + kw
    }
  }
  if (cur.length) lines.push(join(cur, ' · '))
  return lines
}

export function keysLine(s: State, m: Model): Seg[] {
  return keysLines(s, m)[0] ?? []
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
  const right: Seg[] = m?.hold || red ? [hot('R resume', 'R')] : []
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
  const handoff = (s as any).handoff ?? pendingHandoffOf(s.messages, s.msgRead)
  const ho: Seg[] = handoff ? [{ text: `→ ${handoff}`, color: 'suggestion' }] : []
  if (cols >= 80) {
    if (ho.length) {
      const withHo = () => join([lead, ...facts, ...usage, ho], ' · ')
      if (width(withHo()) <= room) return [edge(tight(withHo, room))]
    }
    return [edge(tight(() => join([lead, ...facts, ...usage], ' · '), room))]
  }
  if (ho.length) {
    const line2 = join([...usage, ho], ' · ')
    if (width(line2) <= cols) return [tight(() => join([lead, ...facts], ' · '), cols), edge(line2)]
  }
  return [tight(() => join([lead, ...facts], ' · '), cols), edge(join(usage, ' · '))]
}

function pendingHandoffOf(msgs: Msg[] | undefined | null, readId: string | null): string | null {
  if (!msgs || !msgs.length) return null
  const unreadIdx = readId ? msgs.findLastIndex(m => m.id === readId) : -1
  const unread = unreadIdx >= 0 ? msgs.slice(unreadIdx + 1) : msgs
  for (let i = unread.length - 1; i >= 0; i--) {
    const to = (unread[i] as any)?.to
    if (typeof to === 'string' && to.startsWith('@')) return to
  }
  return null
}

// --- the Tickets tab, as the mock ---

const GROUP_WORD: Record<Box, string> = {
  '~': 'In progress', '%': 'Testing', '!': 'Blocked', '?': 'Pending decision', ' ': 'Pending', '>': 'Deferred', x: 'Done', '-': 'Cancelled',
}

function filterLine(s: State): Seg[] {
  const f = s.filter, ff = s.filterField
  const val = (field: State['filterField'] & string, text: string): Seg => ({ text, inverse: ff === field, action: { kind: 'filter-field', field } })
  const left: Seg[] = [dim('filter  '), { text: 'app: ' }, val('app', f.app ?? 'all')]
  if (s.team.length) {
    left.push({ text: ' · who: ' }, val('who', f.mine ? 'me' : f.who ?? 'all'), { text: ' · mine: ' }, val('mine', f.mine ? 'on' : 'off'))
  }
  if (f.showDone) left.push({ text: ' · done: shown' })
  return spread(left, [hot('f filter', 'f'), dim(' · '), hot(`x ${f.showDone ? 'hide' : 'show'} done`, 'x')], s.cols)
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
  if (isDecidable(t)) out.push({ text: '   ' }, hot('D decided', 'D'))
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
  const user = activeUser(s)
  const pool = visible(b, s.filter, s.me)
  const userSecs: { id: UserSection; title: string; tickets: Ticket[]; color: Color }[] = user ? [
    { id: 'assigned', title: 'Assigned', tickets: assignedTickets(pool, user), color: 'suggestion' },
    { id: 'decide', title: 'Decide', tickets: decideTickets(pool, user), color: 'permission' },
  ] : []
  if (!m.groups.length && !userSecs.length) return [{ key: 'msg', segs: [dim(m.filterActive ? 'no ticket matches the filter' : 'no open tickets')] }]
  const out: Keyed[] = []
  const shown = new Set(m.rows.map(t => t.id))
  const idW = Math.max(4, ...m.rows.map(t => t.id.length + 1), ...userSecs.flatMap(sec => sec.tickets.map(t => t.id.length + 1)))

  for (const sec of userSecs) {
    const hk = headKey(sec.id)
    const on = hk === s.selected
    const open = isUserSectionOpen(s.open as string[], sec.id)
    out.push({ key: hk, segs: [{ text: on ? '› ' : '  ' },
      { text: `${open ? '▾' : '▸'} ${sec.title} (${sec.tickets.length})`, color: sec.color, bold: true, inverse: on }] })
    if (!open) continue
    for (const t of sec.tickets) {
      const itemKey = sec.id + ':' + t.id
      const sel = itemKey === s.selected || t.id === s.selected
      const lead = sel ? '› ' : '  '
      const avail = s.cols - cells(lead) - 1
      let tag = tagOf(t)
      let room = avail - 1 - idW - (tag ? cells(tag) + 2 : 0)
      if (tag && room < 12) { tag = null; room = avail - 1 - idW }
      const body = ` ${t.id.padEnd(idW)}${cut(clean(t.title), Math.max(4, room))}`
      const tagText = tag ? ' '.repeat(Math.max(2, avail - cells(body) - cells(tag))) + tag : ''
      const dot: Seg = { text: '●', color: paint(t.box) }
      out.push({ key: 'row:' + itemKey, segs: sel
        ? [{ text: lead }, dot, { text: (body + tagText).padEnd(Math.max(0, avail)), inverse: true }]
        : [{ text: lead }, dot, { text: body, dim: STATE_COLOR[t.box] === 'dim' }, dim(tagText)] })
      if (s.expanded === itemKey || s.expanded === t.id) {
        if (chipsOf(t)) out.push({ key: 'chips:' + itemKey, segs: chipLine(t) })
        out.push({ key: 'raw:' + itemKey, segs: [dim(`      - [${t.box}] ${t.line}`)] })
      }
    }
  }

  for (const g of m.groups) {
    const hk = headKey(g.box)
    const on = hk === s.selected
    out.push({ key: hk, segs: [{ text: on ? '› ' : '  ' },
      { text: `${g.open ? '▾' : '▸'} ${GROUP_WORD[g.box]} (${g.tickets.length})`, color: paint(g.box), bold: true, inverse: on }] })
    if (!g.open) continue
    for (const t of g.tickets) {
      const nested = !!t.parent && shown.has(t.parent) && g.tickets.some(p => p.id === t.parent)
      const sel = t.id === s.selected
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
    out.push(actionLine(m.handle === sel ? [{ text: '› ' }, { text: text.padEnd(Math.max(0, s.cols - 2)), inverse: true }] : [{ text: '  ' + text }], { kind: 'row', area: 'team', id: m.handle }))
  }
  return out
}

function ticketsBody(s: State, m: Model, h: number): Seg[][] {
  if (s.showTeam) return teamLines(s)
  return [filterLine(s), [], ...windowOf(ticketLines(s, m), s.selected ?? m.selected, Math.max(0, h - 2), 'tickets')]
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
  return windowOf(out, sel, h, 'runs')
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
      : [{ text: '  ' }, dot, { text: body, dim: isFinished(run) }, dim(text.slice(body.length))] }   // F99: a finished run dim whole
  })
  const ex = s.runs.find(r => r.id === s.runsExpanded)
  if (ex) {
    out.push({ key: 'gap', segs: [] }, { key: 'stages', segs: [{ text: `  ${ex.id} stages`, bold: true }] })
    if (!ex.stages.length) out.push({ key: 'none', segs: [dim('    no stages read yet')] })
    ex.stages.forEach(st => out.push({ key: 'st:' + st.n, segs: stageLine(st, ex.planned) }))
    for (const l of runLines(ex, s.board)) {
      if (/^(par|dec|phase):/.test(l.key)) out.push({ key: l.key, segs: [{ text: '    ' }, ...l.segs] })
    }
    out.push({ key: 'start', segs: [{ text: '    ' }, hot('e engage', 'e'), dim('; the command is then shown to paste into your CLI')] })
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
type Boxed = { title: string; rows: { text: string; color?: Color; action?: PointerAction; segs?: Seg[] }[] }
const innerOf = (s: State) => Math.max(4, Math.min(s.cols - 2, 67)) - 2
function boxBody(s: State, b: Boxed): Seg[][] {
  const inner = innerOf(s)
  const pad = s.cols - inner - 2 >= 2 ? '  ' : ''
  const title = cut(clean(b.title), Math.max(1, inner - 4))
  const out: Seg[][] = [[{ text: pad + '┌─ ' }, { text: title, bold: true }, { text: ' ' + '─'.repeat(Math.max(0, inner - cells(title) - 3)) + '┐' }]]
  for (const r of b.rows) {
    const content = r.segs ? fitSegs(r.segs, inner) : fitSegs([{ text: r.text, color: r.color, action: r.action }], inner)
    out.push([{ text: pad + '│' }, ...content, { text: ' '.repeat(Math.max(0, inner - width(content))) + '│' }])
  }
  out.push([{ text: pad + '└' + '─'.repeat(inner) + '┘' }])
  return out
}

function dialogBody(s: State): Seg[][] {
  const r = s.dialog?.result ? '  ' + s.dialog.result : null
  const ls = dialogLines(s)
  const rows: Boxed['rows'] = []
  ls.slice(1).forEach((l, i, all) => {
    const people = s.dialog?.handle && !s.team.some(m => m.handle === s.dialog!.handle) ? [...s.team, { handle: s.dialog.handle }] : s.team
    const start = 2 + (s.team.length ? 0 : 1)
    const action: PointerAction | undefined = i === 0 ? { kind: 'ticket-field' }
      : i >= start && i < start + people.length ? { kind: 'person', index: i - start }
      : i === start + people.length ? { kind: 'person', index: -1 } : undefined
    const last = i === all.length - 1
    if (last || /^ {2}Change /.test(l)) rows.push({ text: '' })
    for (const part of l.split(/\r?\n/)) rows.push({ text: part, color: l === r ? 'error' : undefined, action,
      segs: last ? [dim('  '), hot('Enter confirm', 'return'), dim(' · '), hot('Esc cancel', 'escape')]
        : i === 1 ? [{ text: part.slice(0, 23), action: { kind: 'dialog-kind', value: 'owner' } }, { text: part.slice(23), action: { kind: 'dialog-kind', value: 'decide' } }] : undefined })
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
  for (const [i, l] of ls.slice(1).entries()) {
    const runs = /^( {2}Runs {4})(.* )(\S+)$/.exec(l)
    if (runs && cells(l) > inner) {
      rows.push({ text: (runs[1]! + runs[2]!).trimEnd() }, { text: ' '.repeat(runs[1]!.length) + runs[3]! })
      continue
    }
    if (l !== r) { rows.push({ text: l, action: i < 3 ? { kind: 'person-field', field: (['handle', 'name', 'emails'] as const)[i]! } : undefined,
      segs: i === ls.length - 2 ? [dim('  '), hot('tab next field', 'tab'), dim(' · '), hot('enter add', 'return'), dim(' · '), hot('esc cancel', 'escape')] : undefined }); continue }
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
  return windowOf(lines.map(l => ({ key: l.key, segs: l.segs.map(x => ({ ...x, text: clean(x.text) })) })), sel, h, 'messages')
}

// The setup form, boxed like Add person; its result line (a check or teams-uhura's
// refusal) in red. The token is never in these lines (setupLines masks it).
function setupBody(s: State): Seg[][] {
  const ls = setupLines(s)
  const res = s.setup?.result ? '  ' + s.setup.result : null
  const rows: Boxed['rows'] = ls.slice(1).map((l, i) => ({ text: l, color: l === res ? 'error' : undefined,
    action: i < 5 ? { kind: 'setup-field', field: (['token', 'url', 'port', 'posts', 'clear'] as const)[i]! } : undefined,
    segs: s.setup?.confirmClear && i === 7 ? [dim('  clear the saved Teams settings? ('), { text: 'y', dim: true, action: { kind: 'key', key: { name: 'y' } } }, dim('/'), { text: 'n', dim: true, action: { kind: 'key', key: { name: 'n' } } }, dim(')')]
      : i === ls.length - 2 ? [dim('  '), hot('tab next field', 'tab'), dim(' · '), hot('space on/off', 'space'), dim(' · '), hot('enter save', 'return'), dim(' · '), hot('esc cancel', 'escape')] : undefined }))
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

// --- F127: Help & Skills Guide Viewer ---

export function skillDocLines(sk: SkillGuide, inner: number): { text: string; segs?: Seg[] }[] {
  const lines: { text: string; segs?: Seg[] }[] = []
  lines.push({ text: `Skill: ${sk.id} [${sk.category}]`, segs: [{ text: 'Skill: ', dim: true }, { text: sk.id, bold: true }, { text: `  [${sk.category}]`, color: 'suggestion' }] })
  if (sk.aliases.length) {
    lines.push({ text: `Aliases: ${sk.aliases.join(', ')}`, segs: [{ text: 'Aliases: ', dim: true }, { text: sk.aliases.join(', ') }] })
  }
  lines.push({ text: `Summary: ${sk.summary}`, segs: [{ text: 'Summary: ', dim: true }, { text: sk.summary }] })
  lines.push({ text: '─'.repeat(Math.max(4, Math.min(inner, 48))) })
  lines.push({ text: 'Triggers (when to use):', segs: [{ text: 'Triggers:', bold: true }] })
  for (const tr of sk.triggers) {
    lines.push({ text: `  • ${tr}`, segs: [{ text: '  • ', dim: true }, { text: tr }] })
  }
  lines.push({ text: '' })
  lines.push({ text: 'Usage Guide:', segs: [{ text: 'Usage Guide:', bold: true }] })
  for (const u of sk.usage.split('\n')) {
    lines.push({ text: `  ${u}` })
  }
  if (sk.examples.length) {
    lines.push({ text: '' })
    lines.push({ text: 'Examples & Invocations:', segs: [{ text: 'Examples & Invocations:', bold: true }] })
    for (const ex of sk.examples) {
      lines.push({ text: `  ${ex}`, segs: [{ text: '  ', dim: true }, { text: ex, color: 'success' }] })
    }
  }
  return lines
}

export function helpBody(s: State, room: number): Seg[][] {
  const h = s.help
  if (!h || room <= 0) return []
  if (room <= 2) return [[{ text: 'Help & Skills Guide', bold: true }]]
  const inner = Math.max(4, s.cols <= 40 ? s.cols - 2 : Math.min(s.cols - 4, 116))
  const pad = s.cols - inner - 2 >= 2 ? '  ' : s.cols - inner - 2 >= 1 ? ' ' : ''
  const skills = filteredSkills(h.filter)
  const avail = Math.max(0, room - 2)

  const topTitle = cut(h.expanded ? `Help · ${h.selected}` : `Help & Skills Guide (${skills.length} skills)`, Math.max(1, inner - 4))
  const topSegs: Seg[] = [
    { text: pad + '┌─ ' },
    { text: topTitle, bold: true },
    { text: ' ' + '─'.repeat(Math.max(0, inner - cells(topTitle) - 3)) + '┐' },
  ]
  const botSegs: Seg[] = [{ text: pad + '└' + '─'.repeat(inner) + '┘' }]

  const contentRows: { segs: Seg[] }[] = []

  if (h.expanded) {
    const sk = skills.find(x => x.id === h.selected) ?? SKILLS.find(x => x.id === h.selected)
    if (!sk) {
      contentRows.push({ segs: [{ text: `Skill not found: ${h.selected}`, color: 'error' }] })
    } else {
      const doc = skillDocLines(sk, inner)
      const maxScroll = Math.max(0, doc.length - avail)
      const scroll = Math.min(h.scroll, maxScroll)
      const windowed = doc.slice(scroll, scroll + avail)
      windowed.forEach((row, i) => {
        if (i === 0 && scroll > 0) {
          contentRows.push({ segs: [dim(`▲ (${scroll} lines above)`)] })
        } else if (i === windowed.length - 1 && scroll + avail < doc.length) {
          contentRows.push({ segs: [dim(`▼ (${doc.length - scroll - avail} lines below · use ↑/↓ to scroll)`)] })
        } else {
          contentRows.push({ segs: row.segs ?? [{ text: row.text }] })
        }
      })
    }
  } else {
    // List view
    const filterText = h.filtering
      ? `Filter: ${h.filter}_`
      : h.filter
      ? `Filter: "${h.filter}" (${skills.length})`
      : `Filter: all (${skills.length})`
    const hintText = h.filtering ? 'Enter apply · Esc cancel' : '/ filter · Enter doc'
    const filterSegs: Seg[] = spread(
      [{ text: filterText, bold: h.filtering, color: h.filtering ? 'suggestion' : undefined, action: { kind: 'help-skill', id: h.selected } }],
      [dim(hintText)],
      inner
    )
    contentRows.push({ segs: filterSegs })

    const listRoom = Math.max(0, avail - 1)
    if (!skills.length) {
      contentRows.push({ segs: [{ text: `  No skills matching "${h.filter}"`, color: 'warning' }] })
    } else {
      const selIdx = Math.max(0, skills.findIndex(x => x.id === h.selected))
      const top = Math.max(0, Math.min(skills.length - listRoom, selIdx - Math.floor(listRoom / 2)))
      const slice = skills.slice(top, top + listRoom)
      slice.forEach(sk => {
        const isSel = sk.id === h.selected
        const catStr = `[${sk.category}]`
        const aliasStr = sk.aliases.length ? `(${sk.aliases[0]})` : ''
        const lead = `${isSel ? '› ' : '  '}${sk.id.padEnd(17)} `
        const meta = `${catStr.padEnd(20)} ${aliasStr.padEnd(10)} `
        const rem = inner - cells(lead) - cells(meta)
        const summary = rem > 5 ? cut(sk.summary, rem) : ''
        const rowSegs: Seg[] = [
          { text: lead, bold: isSel, inverse: isSel, action: { kind: 'help-skill', id: sk.id } },
          { text: catStr.padEnd(20), color: 'suggestion', inverse: isSel, action: { kind: 'help-skill', id: sk.id } },
          { text: (aliasStr.padEnd(10) + ' ' + summary).trimEnd(), dim: !isSel, inverse: isSel, action: { kind: 'help-skill', id: sk.id } },
        ]
        contentRows.push({ segs: rowSegs })
      })
    }
  }

  const out: Seg[][] = [topSegs]
  for (let i = 0; i < avail; i++) {
    const row = contentRows[i]
    if (row) {
      const content = fitSegs(row.segs, inner)
      const w = width(content)
      out.push([{ text: pad + '│' }, ...content, { text: ' '.repeat(Math.max(0, inner - w)) + '│' }])
    } else {
      out.push([{ text: pad + '│' + ' '.repeat(inner) + '│' }])
    }
  }
  out.push(botSegs)
  return out
}

function bodyOf(s: State, m: Model, h: number): Seg[][] {
  const tail = tailLines(s).slice(0, Math.floor(h / 2))
  const block = tail.length && h - tail.length >= 2 ? [[], ...tail] : tail
  const room = h - block.length
  const [recTitle = '', ...recRows] = reconcileLines(s)    // F81: [] with no reconcile box up
  const [engTitle = '', ...engRows] = engageLines(s)       // F85: [] with no engage box up
  const [startTitle = '', ...startRows] = startRunLines(s) // F113: [] with no start run box up
  const main = s.help ? helpBody(s, room)
    : s.setup ? setupBody(s)
    : s.person ? formBody(s)
    : s.dialog ? dialogBody(s)
    : s.reconcile ? boxBody(s, { title: recTitle, rows: recRows.map((text, index) => ({ text, action: { kind: 'reconcile' as const, index } })) })   // F81
    : s.engage ? boxBody(s, { title: engTitle, rows: engRows.map(text => ({ text })) })      // F85
    : s.startRun ? boxBody(s, {
        title: startTitle,
        rows: [
          ...startRows.map((text, i) => ({
            text,
            action: i < 3 ? { kind: 'start-run-field' as const, field: (['runner', 'mode', 'tickets'] as const)[i]! } : undefined,
            color: (i === 0 && s.startRun?.field === 'runner') || (i === 1 && s.startRun?.field === 'mode') || (i === 2 && s.startRun?.field === 'tickets') ? 'suggestion' as Color : undefined,
          })),
          { text: '' },
          { text: '', segs: [dim('  '), hot('Enter confirm', 'return'), dim(' · '), hot('Esc cancel', 'escape')] },
        ],
      })
    : s.tab === 'runs' ? runsBody(s, room)
    : s.tab === 'health' ? healthBody(s)
    : s.tab === 'messages' ? messagesBody(s, room)
    : s.tab === 'explorer' ? explorerBody(s, room)
    : s.tab === 'run' ? windowOf(runTabLines(s), s.runForm ? null : s.runSel, room, 'run')
    : ticketsBody(s, m, room)
  const top = main.slice(0, room)
  while (top.length < room) top.push([])
  return [...top, ...block]
}

export function frameSegs(s: State): Seg[][] {
  const cols = Math.max(0, s.cols), rows = Math.max(0, s.rows)
  const m = buildModel(viewOf(s))
  const band = bandSegs(s)
  const kLines = keysLines(s, m)
  const fixed = 2 + 2 + kLines.length + band.length // tabs, blank | blank, count, ...keys | band
  const body = bodyOf(s, m, Math.max(0, rows - fixed))
  let lines: Seg[][] = [tabsLine(s), [], ...body, [], countLine(s, m), ...kLines, ...band]
  if (lines.length > rows) lines = rows ? [lines[0]!, ...lines.slice(lines.length - (rows - 1))] : []
  return lines.map(l => fitSegs(l, cols))
}

export type Hit = { x: number; y: number; width: number; action: PointerAction }
export function screen(s: State, p: Paint): { lines: string[]; hits: Hit[] } {
  const cols = Math.max(0, s.cols)
  const segs = frameSegs(s).map(l => fitSegs(l.map((x: Mono & Seg) => ({ ...x, text: glyph((!p.color || p.ascii ? x.mono : undefined) ?? x.text, p.ascii), mono: undefined })), cols, p.ascii ? '...' : '…'))
  const hits: Hit[] = []
  segs.forEach((line, row) => {
    let x = 1
    for (const g of line) {
      const width = cells(g.text)
      if (g.action && width && !(pointerModal(s) && (row === 0 || row >= s.rows - (s.cols < 80 ? 2 : 1)))) hits.push({ x, y: row + 1, width, action: g.action })
      x += width
    }
  })
  return { lines: segs.map(l => ansi(l, { ...p, ascii: false })), hits }
}
export const frame = (s: State, p: Paint): string[] => screen(s, p).lines
