import { atom, read } from 'claude-code'
import type { BoxProps, Color, ElementConstructor, EngineInterface, RenderElement, TextProps } from 'claude-code'
import type { Level, Machine, Usage, Window } from '../types'
import { ageText, DISK, figure, gb, GiB, holdWords, isStale, levelLine, MEM } from './lib/facts'
import type { Limits } from './lib/facts'

// F49, design §8: the Health tab (mocks m-health, m-health-hold). Usage is this
// session's own reading (register.tsx polls it; nothing here polls), each figure with
// its age and marked stale past 15 minutes; the hold decision is relay-morpheus's own
// (`chain decide --level`, run by register.tsx on the same line shown here); credit is
// not available on this host, spend is said apart; machine words agree with colour.

const usageA = atom({ plugin: 'ops-board', key: 'usage' } as const, null)
const machineA = atom({ plugin: 'ops-board', key: 'machine' } as const, null)
const relayA = atom({ plugin: 'ops-board', key: 'relay' } as const, null)

export type HealthView = { usage: Usage | null; machine: Machine | null; relay: string | null; now: number }
type Seg = { text: string; color?: Color; dim?: boolean; bold?: boolean }
type Line = { key: string; segs: Seg[] }

const BAR = 22
const LABEL = 8                     // "5-hour  ", "7-day   "
const FACTS_OLD_MS = 3 * 60 * 1000  // a machine poll missed twice: the facts show their age
const LEVEL_COLOR: Record<Level, Color> = { green: 'success', amber: 'warning', red: 'error' }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const two = (n: number) => String(n).padStart(2, '0')

function when(iso: string | null, now: number): { today: boolean; hm: string; full: string; mins: number } | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const n = new Date(now)
  const hm = `${two(d.getHours())}:${two(d.getMinutes())}`
  const today = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
  return { today, hm, full: `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${hm}`, mins: Math.floor((d.getTime() - now) / 60000) }
}

// "resets today 14:20 · in 2h 05m" | "resets Tue 22 Oct 09:00"
export function resetsText(iso: string | null, now: number): string | null {
  const w = when(iso, now)
  if (!w) return null
  if (!w.today) return `resets ${w.full}`
  if (w.mins <= 0) return `resets today ${w.hm} · due now`
  return `resets today ${w.hm} · in ${Math.floor(w.mins / 60)}h ${two(w.mins % 60)}m`
}

// One window: a bar, the figure; a stale one or one from watch-cortana's file is dim
// with its age (never shown as live); none is "not available".
function windowLines(key: string, label: string, w: Window | null, now: number, held: boolean): Line[] {
  const head: Seg = { text: label.padEnd(LABEL) }
  if (!w) return [{ key: 'u:' + key, segs: [head, { text: 'not available', dim: true }] }]
  const stale = isStale(w, now)
  const old = stale || w.source === 'watch-cortana'
  const filled = Math.round(Math.min(100, Math.max(0, w.pct)) / 100 * BAR)
  const color: Color | undefined = old ? undefined : held ? 'warning' : 'success'
  const segs: Seg[] = [head, { text: '█'.repeat(filled), color, dim: old }, { text: '░'.repeat(BAR - filled), dim: true },
    { text: '  ' }, { text: `${w.pct}%`, color: held && !old ? 'warning' : undefined, dim: old }]
  if (old) segs.push({ text: ` (${ageText(w, now)}${stale ? ', stale' : ''})${w.source === 'watch-cortana' ? ' · watch-cortana' : ''}`, dim: true })
  const out: Line[] = [{ key: 'u:' + key, segs }]
  const r = resetsText(w.resetsAt, now)
  if (r) out.push({ key: 'r:' + key, segs: [{ text: ' '.repeat(LABEL) + r, dim: true }] })
  return out
}

// relay-morpheus's decision on this reading, worded per m-health-hold.
function relayLines(u: Usage, v: HealthView): Line[] {
  const d = (u.decision ?? '').trim()
  const run = v.relay ? v.relay.split(' ')[0] : null
  const out: Line[] = []
  const hold = /^HOLD (\S+)( 7d)?$/.exec(d)
  if (hold) {
    const seven = !!hold[2]
    out.push({ key: '', segs: [] })
    out.push({ key: 'hold', segs: [seven
      ? { text: `■ 7-day hold reached (${hold[1]}%)`, color: 'error' }
      : { text: `▲ 5-hour hold reached (${hold[1]}%)`, color: 'warning' }] })
    out.push({ key: 'hold:run', segs: [{ text: run ? `${run} finishes its stage in flight, then holds.` : 'New relay stages wait.' }] })
    if (seven) {
      const w = when(u.seven?.resetsAt ?? null, v.now)
      out.push({ key: 'hold:when', segs: [{ text: `It waits for the 7-day reset${w ? ` (${w.full})` : ''}, or your go past it.` }] })
    } else {
      const w = when(u.five?.resetsAt ?? null, v.now)
      if (w) out.push({ key: 'hold:when', segs: [{ text: `It resumes on its own after ${w.today ? w.hm : w.full}.` }] })
    }
  } else if (/^RELEASE /.test(d)) {
    out.push({ key: 'relay', segs: [{ text: 'relay: ' }, { text: 'stages run', color: 'success' }, { text: ` (${d})` }] })
  } else if (d === 'UNOBSERVABLE') {
    out.push({ key: 'relay', segs: [{ text: 'relay: ' }, { text: 'no usage reading', color: 'warning' }, { text: ' (UNOBSERVABLE)' }] })
  } else {
    out.push({ key: 'relay', segs: [{ text: 'relay: decision not known yet', dim: true }] })
  }
  out.push({ key: 'decide', segs: [{ text: `same decision relay-morpheus makes: chain decide --level "${levelLine(u, v.now)}"`, dim: true }] })
  return out
}

// "disk C:  17 GB free of 953 GB      ok": label 9, figure 26, the word in its colour.
function factLine(key: string, label: string, bytes: number | null, t: Limits, total: number | null, held: boolean): Line {
  const f = figure(bytes, t)
  if (f.level === null) return { key, segs: [{ text: label.padEnd(9) + '?'.padEnd(26) }, { text: 'not known', dim: true }] }
  const fig = `${f.text} free${total !== null ? ` of ${gb(total)}` : ''}`
  const word = f.level === 'green' ? 'ok' : f.level === 'amber' ? 'low' : held ? 'HOLD' : `below ${t.red / GiB} GB`
  return { key, segs: [{ text: label.padEnd(9) + fig.padEnd(26) }, { text: word, color: LEVEL_COLOR[f.level] }] }
}

function machineLines(m: Machine | null, now: number): Line[] {
  if (!m) return [{ key: 'machine', segs: [{ text: 'machine facts not read yet', dim: true }] }]
  const out: Line[] = [
    factLine('disk', m.drive ? `disk ${m.drive}` : 'disk', m.diskFree, DISK, m.diskTotal, m.hold !== null),
    factLine('mem', 'memory', m.memFree, MEM, null, m.hold !== null),
  ]
  const n = m.locks.length
  out.push(n
    ? { key: 'locks', segs: [{ text: 'locks'.padEnd(9) + `${n} stale, not deleted`.padEnd(26) }, { text: 'stale', color: 'warning' }] }
    : { key: 'locks', segs: [{ text: 'locks'.padEnd(9) + 'none stale'.padEnd(26) }, { text: 'ok', color: 'success' }] })
  if (m.hold) out.push({ key: 'held', segs: [{ text: 'held'.padEnd(9) }, { text: `${holdWords(m.hold)} - /ops resume to release`, color: 'warning' }] })
  if (now - m.at > FACTS_OLD_MS) out.push({ key: 'age', segs: [{ text: `facts ${Math.floor((now - m.at) / 60000)}m old`, dim: true }] })
  return out
}

export function healthLines(v: HealthView): Line[] {
  const u = v.usage
  const d = (u?.decision ?? '').trim()
  const held5 = /^HOLD \S+$/.test(d), held7 = /^HOLD \S+ 7d$/.test(d)
  const lines: Line[] = [{ key: 'h:usage', segs: [{ text: 'USAGE', bold: true }] }]
  lines.push(...windowLines('five', '5-hour', u?.five ?? null, v.now, held5))
  lines.push(...windowLines('seven', '7-day', u?.seven ?? null, v.now, held7))
  lines.push(...relayLines(u ?? { five: null, seven: null, spendLimitPct: null, costUsd: null, decision: null }, v))
  lines.push({ key: '', segs: [] }, { key: 'h:credit', segs: [{ text: 'CREDIT', bold: true }] })
  lines.push({ key: 'credit', segs: [{ text: 'not available' }, { text: ' · this host exposes no credit source', dim: true }] })
  if (u?.spendLimitPct !== null && u?.spendLimitPct !== undefined) {
    lines.push({ key: 'spend', segs: [{ text: `spend limit ${u.spendLimitPct}% used` }] })
  }
  if (u?.costUsd !== null && u?.costUsd !== undefined) {
    lines.push({ key: 'cost', segs: [{ text: `this session spent $${u.costUsd.toFixed(2)}` }, { text: ' (from /cost)', dim: true }] })
  }
  lines.push({ key: '', segs: [] }, { key: 'h:machine', segs: [{ text: 'MACHINE', bold: true }] })
  lines.push(...machineLines(v.machine, v.now))
  return lines
}

export async function readHealth($: EngineInterface): Promise<HealthView> {
  return { usage: await read($, usageA), machine: await read($, machineA), relay: await read($, relayA), now: await $.clock.now() }
}

type Els = { Box: ElementConstructor<BoxProps>; Text: ElementConstructor<TextProps> }

export function HealthTab(els: Els, v: HealthView): RenderElement[] {
  const { Box, Text } = els
  return healthLines(v).map(l => l.key
    ? <Box key={l.key}><Text wrap="truncate-end">{l.segs.map(s => <Text color={s.color} dimColor={s.dim} bold={s.bold}>{s.text}</Text>)}</Text></Box>
    : <Text> </Text>)
}
