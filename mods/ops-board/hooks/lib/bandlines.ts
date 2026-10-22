import type { Color } from 'claude-code'
import type { Board, Level, Machine, Usage, Watch, Window } from '../../types'
import { paint } from './board'
import { ageText, DISK, figure, HOLD_UNKNOWN, isStale, MEM } from './facts'

// F48, design §7: the band's lines - always on, green when fine - the narrow
// two-line fold and the status line's text. Pure; band.tsx draws them.

export const NARROW_COLUMNS = 110
const FACTS_OLD_MS = 3 * 60 * 1000          // a machine poll missed twice: its facts show their age

export type Counts = { open: number; progress: number; testing: number; blocked: number; decision: number }
export type BandInput = {
  watch: Watch; machine: Machine | null; usage: Usage | null
  relay: string | null              // "RUN-0012 2/4": the first run not all done
  counts: Counts | null; narrow: boolean; cols: number; now: number
}
// One Seg for band, health and runs lines: bold is health's headings, drop the band's fold order.
export type Seg = { text: string; color?: Color; dim?: boolean; inverse?: boolean; bold?: boolean; drop?: 1 | 2 }

const LEVEL_COLOR: Record<Level, Color> = { green: 'success', amber: 'warning', red: 'error' }
const GLYPH: Record<Level, string> = { green: '●', amber: '▲', red: '■' }

// Open = [ ] [~] [%] [!] [?]; deferred and closed are not open (tickets-zordon, pending).
export function countsOf(board: Board | null): Counts | null {
  if (!board || board.error) return null
  const n = (b: string) => board.tickets.filter(t => t.box === b).length
  return { open: n(' ') + n('~') + n('%') + n('!') + n('?'), progress: n('~'), testing: n('%'), blocked: n('!'), decision: n('?') }
}

// The status line: `ops <n> open · 7d <pct>`. A figure past 15 minutes says so; none
// is left out, never a stale one shown as live.
export function statusText(open: number | null, u: Usage | null, now: number): string {
  const head = `ops ${open === null ? '-' : open} open`
  const w = u?.seven
  if (!w) return head
  return `${head} · 7d ${w.pct}%${isStale(w, now) ? ' (stale)' : ''}`
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const two = (n: number) => String(n).padStart(2, '0')
function resetsText(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `resets ${DAYS[d.getDay()]} ${two(d.getHours())}:${two(d.getMinutes())}`
}

// One usage window: fresh host figures bare; a stale one, or one from watch-cortana's
// file, dim with its age; none `-`. relay's decision, when known, colours a held window.
function windowSegs(label: string, w: Window | null, now: number, held: boolean): Seg[] {
  if (!w) return [{ text: label + ' ' }, { text: '-', dim: true }]
  if (isStale(w, now) || w.source === 'watch-cortana') return [{ text: label + ' ' }, { text: `${w.pct}% (${ageText(w, now)})`, dim: true }]
  return [{ text: label + ' ' }, { text: `${w.pct}%`, color: held ? 'warning' : 'success' }]
}

function figSegs(label: string, bytes: number | null | undefined, t: typeof DISK | typeof MEM): Seg[] {
  const f = figure(bytes ?? null, t)
  if (f.level === null) return [{ text: label + ' ' }, { text: '?', dim: true }]
  return [{ text: label + ' ' }, { text: f.level === 'amber' ? f.text + ' low' : f.text, color: LEVEL_COLOR[f.level] }]
}

const join = (parts: Seg[][], sep = '  '): Seg[] => parts.flatMap((p, i) => (i ? [{ text: sep, drop: p[0]?.drop }, ...p] : p))
const width = (line: Seg[]) => line.reduce((s, x) => s + x.text.length, 0)

// The red line: why, what is held, how to clear it (mock m-band).
function redLine(w: Watch): Seg[] {
  const disk = w.reasons.some(r => r.startsWith('disk')), mem = w.reasons.some(r => r.startsWith('mem'))
  const fix = disk && mem ? 'Free disk space and memory' : mem ? 'Free memory' : 'Free space'
  return [{ text: ` ■ HOLD  ${w.reasons.join('. ')}. New relay stages and GREEN runs are held. ${fix}, then /ops resume. `, color: 'error', inverse: true }]
}

export function bandSegs(v: BandInput): Seg[][] {
  const { watch: w, machine: m, usage: u, now } = v
  if (w.level === 'red') return [redLine(w)]
  const held = (u?.decision ?? '').startsWith('HOLD')
  const held7 = held && / 7d$/.test(u?.decision ?? '')
  const lead: Seg[] = [{ text: GLYPH[w.level], color: LEVEL_COLOR[w.level] }, { text: ' ops' }]
  const disk = figSegs('disk', m?.diskFree, DISK), mem = figSegs('mem', m?.memFree, MEM)
  const five = windowSegs('5h', u?.five ?? null, now, held && !held7)
  const seven = windowSegs('7d', u?.seven ?? null, now, held7)
  const locks: Seg[] = !m ? [{ text: 'locks ' }, { text: '?', dim: true }]
    : m.locks.length ? [{ text: 'locks ' }, { text: `${m.locks.length} stale`, color: 'warning' }]
    : [{ text: 'locks ' }, { text: 'ok', color: 'success' }]
  const extra: Seg[][] = []
  if (m?.hold) extra.push([{ text: `${m.hold === HOLD_UNKNOWN ? 'held (reason unknown)' : 'held'} - /ops resume to release`, color: 'warning' }])
  if (m && now - m.at > FACTS_OLD_MS) extra.push([{ text: `facts ${Math.floor((now - m.at) / 60000)}m old`, dim: true }])

  if (v.narrow) {
    const c = v.counts
    const counts: Seg[][] = c ? [[{ text: `${c.open} open` },
      ...([['~', c.progress], ['%', c.testing], ['!', c.blocked], ['?', c.decision]] as const)
        .filter(([, n]) => n > 0).flatMap(([b, n]): Seg[] => [{ text: ' ' }, { text: '●' + n, color: paint(b) }])]] : []
    const one = join([lead, ...counts, ...(v.relay ? [[{ text: v.relay }]] : []), disk, mem])
    const amberWords: Seg[][] = m?.locks.length ? [[{ text: 'locks ' }, { text: `${m.locks.length} stale`, color: 'warning' }]] : []
    const second = join([[{ text: "" }], five, seven, ...amberWords, ...extra,
      [{ text: '/pending  /list-tickets  /ops opens the pane', dim: true }]])
    return [one, second]
  }

  const resets = w.level === 'green' && u?.seven && !isStale(u.seven, now) && u.seven.source === 'host'
    ? resetsText(u.seven.resetsAt) : null
  const sevenR: Seg[] = resets ? [...seven, { text: ' ', drop: 1 }, { text: resets, dim: true, drop: 1 }] : seven
  const relay: Seg[][] = v.relay ? [[{ text: 'relay ' + v.relay, drop: 2 }]] : []
  let line = join([lead, disk, mem, five, sevenR, ...relay, locks, ...extra])
  // Too wide: the reset time goes first, then the relay run; past that the Text truncates.
  for (const level of [1, 2] as const) {
    if (width(line) <= v.cols) break
    line = line.filter(s => s.drop !== level)
  }
  return [line]
}

export function bandLines(v: BandInput): string[] {
  return bandSegs(v).map(l => l.map(s => s.text).join(''))
}
