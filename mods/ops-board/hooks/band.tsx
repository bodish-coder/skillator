import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, RenderElement, RenderInput } from 'claude-code'
import type { Board, Level, Machine, Usage, Watch, Window } from '../types'
import { ageText, DISK, figure, HOLD_UNKNOWN, isStale, MEM } from './lib/facts'
import { paint } from './paint'

// F48, design §7: the band above the prompt - always on, green when fine - the
// narrow two-line fold, the notes under it, and the status line's text.

const machineA = atom({ plugin: 'ops-board', key: 'machine' } as const, null)
const usageA = atom({ plugin: 'ops-board', key: 'usage' } as const, null)
const watchA = atom({ plugin: 'ops-board', key: 'watch' } as const, { level: 'green', reasons: [] })
const notesA = atom({ plugin: 'ops-board', key: 'notes' } as const, [])
const relayA = atom({ plugin: 'ops-board', key: 'relay' } as const, null)
const boardA = atom({ plugin: 'ops-board', key: 'board' } as const, null)
const narrowA = atom({ plugin: 'ops-board', key: 'narrow' } as const, false)

export const NARROW_COLUMNS = 110
const FACTS_OLD_MS = 3 * 60 * 1000          // a machine poll missed twice: its facts show their age

export type Counts = { open: number; progress: number; blocked: number; decision: number }
export type BandInput = {
  watch: Watch; machine: Machine | null; usage: Usage | null
  relay: string | null              // "RUN-0012 2/4": the first run not all done
  counts: Counts | null; narrow: boolean; cols: number; now: number
}
export type Seg = { text: string; color?: Color; dim?: boolean; inverse?: boolean; drop?: 1 | 2 }

const LEVEL_COLOR: Record<Level, Color> = { green: 'success', amber: 'warning', red: 'error' }
const GLYPH: Record<Level, string> = { green: '●', amber: '▲', red: '■' }

// Open = [ ] [~] [!] [?]; deferred and closed are not open (tickets-zordon, pending).
export function countsOf(board: Board | null): Counts | null {
  if (!board || board.error) return null
  const n = (b: string) => board.tickets.filter(t => t.box === b).length
  return { open: n(' ') + n('~') + n('!') + n('?'), progress: n('~'), blocked: n('!'), decision: n('?') }
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
      ...([['~', c.progress], ['!', c.blocked], ['?', c.decision]] as const)
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

// The AbovePrompt hook's body: the band, then the notes, each with its own [ ok ].
export async function renderBand($: EngineInterface, e: RenderInput<'AbovePrompt'>): Promise<RenderElement> {
  const { Box, Text, Button } = $.ui.resolve(e)
  const cols = Math.max(20, e.props.bodyColumns)
  const narrow = (await read($, narrowA)) || (e.viewport !== undefined && e.viewport.columns < NARROW_COLUMNS)
  const v: BandInput = {
    watch: await read($, watchA), machine: await read($, machineA), usage: await read($, usageA),
    relay: await read($, relayA), counts: countsOf(await read($, boardA)), narrow, cols, now: await $.clock.now(),
  }
  const notes = await read($, notesA)
  const seg = (s: Seg) => <Text color={s.color} dimColor={s.dim} inverse={s.inverse}>{s.text}</Text>
  const lines = bandSegs(v).map((l, i) => (
    <Box key={'line:' + i}><Text wrap={v.watch.level === 'red' ? 'wrap' : 'truncate-end'}>{l.map(seg)}</Text></Box>
  ))
  const noteEls = notes.map((n, i) => {
    const rows = n.split('\n')
    const head = rows[0] ?? ''
    const color: Color | undefined = head.startsWith('✓') ? 'success' : head.startsWith('▲') ? 'warning' : head.startsWith('■') ? 'error' : undefined
    return (
      <Box key={'note:' + i} flexDirection="row" gap={2}>
        <Box flexDirection="column">
          <Text wrap="wrap"><Text color={color}>{head.slice(0, 1)}</Text>{head.slice(1)}</Text>
          {rows.slice(1).map(r => <Text dimColor={r.startsWith('  ') && !r.startsWith('    ')} wrap="truncate-end">{r}</Text>)}
        </Box>
        <Button key={'ok:' + i} onPress={() => { void update($, notesA, xs => xs.filter((_, j) => j !== i)) }}>ok</Button>
      </Box>
    )
  })
  return <Box flexDirection="column">{lines}{noteEls}</Box>
}
