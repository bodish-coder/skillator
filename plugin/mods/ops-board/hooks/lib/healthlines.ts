import type { Color } from 'claude-code'
import type { Level, Machine, Usage, Window } from '../../types'
import type { Seg } from './bandlines'
import { ageText, DISK, figure, gb, GiB, holdWords, isStale, levelLine, MEM, MUTED_HOW, mutedWords } from './facts'
import type { Limits } from './facts'

// F49, design §8: the Health tab's lines (mocks m-health, m-health-hold). Pure;
// health.tsx draws them.

export type HealthView = { usage: Usage | null; machine: Machine | null; relay: string | null; now: number; profile?: { name: string | null; note?: string | null } }
export type Line = { key: string; segs: Seg[] }

// Relay's own thresholds (relay-morpheus chain decide): the 5-hour hold and the
// 7-day hard stop, env RELAY_CHAIN_HOLD_PCT / RELAY_CHAIN_WEEKLY_PCT there.
export const FIVE_HOLD_PCT = 80
export const WEEKLY_STOP_PCT = 97
const NEAR_PCT = 10   // within this of a threshold the bar is amber; at/past it, red

// A usage bar's colour: plain below near, amber near the threshold, red at/past it.
export function usageColor(pct: number, limit: number): Color | undefined {
  if (pct >= limit) return 'error'
  if (pct >= limit - NEAR_PCT) return 'warning'
  return undefined
}

const fmtPct = (n: number) => String(Math.round(n * 10) / 10)

// The hosting CLI's profile name from its env, named as status.ts's discovery
// names a profile dir: `.claude` is `claude`, `.claude-foo` is `claude-foo`.
export function hostingProfileName(cli: string | null, dir: string | null): string {
  if (dir) {
    const base = dir.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? ''
    if (base === 'antigravity-cli') return 'agy'
    if (base.startsWith('.') && base.length > 1) return base.slice(1)
    if (base) return base
  }
  return cli || 'claude'
}

const BAR = 22
const LABEL = 8                     // "5-hour  ", "7-day   "
const FACTS_OLD_MS = 3 * 60 * 1000  // a machine poll missed twice: the facts show their age
const LEVEL_COLOR: Record<Level, Color | undefined> = { green: undefined, amber: 'warning', red: 'error' }
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
function windowLines(key: string, label: string, w: Window | null, now: number, limit: number): Line[] {
  const head: Seg = { text: label.padEnd(LABEL) }
  if (!w) return [{ key: 'u:' + key, segs: [head, { text: 'not available', dim: true }] }]
  const stale = isStale(w, now)
  const old = stale || w.source === 'watch-cortana'
  const filled = Math.round(Math.min(100, Math.max(0, w.pct)) / 100 * BAR)
  const color: Color | undefined = old ? undefined : usageColor(w.pct, limit)
  const segs: Seg[] = [head, { text: '█'.repeat(filled), color, dim: old }, { text: '░'.repeat(BAR - filled), dim: true },
    { text: '  ' }, { text: `${w.pct}%`, color, dim: old }]
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
    const segs: Seg[] = [{ text: 'relay: ' }, { text: 'stages run' }, { text: ` (${d})` }]
    const seven = u.seven && !isStale(u.seven, v.now) ? u.seven : null
    if (seven) {
      const dist = seven.pct >= WEEKLY_STOP_PCT
        ? (seven.pct === WEEKLY_STOP_PCT ? 'at stop' : `${fmtPct(seven.pct - WEEKLY_STOP_PCT)}% past stop`)
        : `${fmtPct(WEEKLY_STOP_PCT - seven.pct)}% to stop`
      segs.push({ text: ` - 7-day ${seven.pct}% of ${WEEKLY_STOP_PCT}% stop (${dist})`, color: usageColor(seven.pct, WEEKLY_STOP_PCT) })
    }
    out.push({ key: 'relay', segs })
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
    : { key: 'locks', segs: [{ text: 'locks'.padEnd(9) + 'none stale'.padEnd(26) }, { text: 'ok' }] })
  if (m.hold) out.push({ key: 'held', segs: [{ text: 'held'.padEnd(9) }, { text: `${holdWords(m.hold)} - /ops resume to release`, color: 'warning' }] })
  // F87: muted by /ops resume force - when, the free memory then, and how it ends
  if (m.mute) {
    out.push({ key: 'muted', segs: [{ text: 'muted'.padEnd(9) }, { text: `${mutedWords(m.mute)}, ${m.mute.slice(m.mute.indexOf(' ') + 1)} then`, color: 'warning' }] })
    out.push({ key: 'muted:how', segs: [{ text: ' '.repeat(9) + MUTED_HOW, dim: true }] })
  }
  // F82: a stale board amber, board-fresh's refusal red with its reason
  if (m.board) out.push({ key: 'board', segs: [{ text: 'board'.padEnd(9) }, { text: `stale: ${m.board.behind} behind ${m.board.up}`, color: 'warning' }] })
  if (m.board?.state === 'refused') out.push({ key: 'board:why', segs: [{ text: ' '.repeat(9) }, { text: `refused: ${m.board.reason}`, color: 'error' }] })
  if (now - m.at > FACTS_OLD_MS) out.push({ key: 'age', segs: [{ text: `facts ${Math.floor((now - m.at) / 60000)}m old`, dim: true }] })
  return out
}

// This CLI's own profile, as an `ops --status` row: its name, the 5h/7d figures
// (the same reading the bars below draw, never a second one), its reset when
// known; unreadable shows its reason in place, never a guessed figure.
function profileLine(v: HealthView): Line {
  const head: Seg = { text: 'profile'.padEnd(LABEL) }
  const u = v.usage
  const name = v.profile?.name ?? null
  if (!u?.five && !u?.seven) {
    const reason = v.profile?.note ?? (u?.decision?.trim() === 'UNOBSERVABLE' ? 'no usage reading' : u ? 'not available' : 'not read yet')
    return { key: 'profile', segs: [head, { text: name ? `${name} · ${reason}` : 'none detected', dim: !name }] }
  }
  const pct = (w: Window | null) => (w ? `${w.pct}%` : '-')
  const reset = resetsText(u.five?.resetsAt ?? null, v.now) ?? resetsText(u.seven?.resetsAt ?? null, v.now)
  return { key: 'profile', segs: [head, { text: `${name ?? 'none detected'} · 5h ${pct(u.five)} · 7d ${pct(u.seven)}${reset ? ` · ${reset}` : ''}` }] }
}

export function healthLines(v: HealthView): Line[] {
  const u = v.usage
  const lines: Line[] = [{ key: 'h:usage', segs: [{ text: 'USAGE', bold: true }] }]
  lines.push(profileLine(v))
  lines.push(...windowLines('five', '5-hour', u?.five ?? null, v.now, FIVE_HOLD_PCT))
  lines.push(...windowLines('seven', '7-day', u?.seven ?? null, v.now, WEEKLY_STOP_PCT))
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
