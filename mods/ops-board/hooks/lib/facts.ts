import type { Level, Lock, Machine, Usage, Watch, Window } from '../../types'

// Pure: the facts the band and the Health tab draw from (design §6, §7, §8).

export const GiB = 1073741824
export const STALE_MS = 15 * 60 * 1000          // a usage figure older than this is stale
export const HOLD_UNKNOWN = '? -'               // HOLD= of an empty hold file: no since, no reason

// A hold in words: its own "<since> <reason>", or "held (reason unknown)" for `? -`.
export function holdWords(hold: string): string {
  return hold === HOLD_UNKNOWN ? 'held (reason unknown)' : hold
}

const num = (v: string | undefined): number | null => {
  if (v === undefined || !/^\d+(\.\d+)?$/.test(v.trim())) return null
  return Number(v.trim())
}

// `pending --machine` (or the same keys inside `pending --kv`): DRIVE, DISK_FREE,
// DISK_TOTAL, MEM_FREE, LOCK=<path>|<age min>|<holder> (0..n), HOLD=<since> <reason> | -, BOARD (F82).
// Keys it does not know are skipped, so the whole --kv output parses too.
export function parseMachine(kv: string, now: number): Machine {
  const m: Machine = { at: now, drive: '', diskFree: null, diskTotal: null, memFree: null, locks: [], hold: null }
  for (const raw of kv.split('\n')) {
    const line = raw.replace(/\r$/, '')
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const key = line.slice(0, eq), val = line.slice(eq + 1)
    switch (key) {
      case 'DRIVE': m.drive = val.trim(); break
      case 'DISK_FREE': m.diskFree = num(val); break
      case 'DISK_TOTAL': m.diskTotal = num(val); break
      case 'MEM_FREE': m.memFree = num(val); break
      // R6: only `-` (no hold file) is no hold; any other value, an empty one too, is held.
      case 'HOLD': m.hold = val.trim() === '-' ? null : val.trim() || HOLD_UNKNOWN; break
      // F87: MUTE= is not pending's: each host appends the mute file's first line (muteKv)
      case 'MUTE': if (val.trim()) m.mute = val.trim(); break
      // F82: BOARD=stale|<behind>|<upstream>|- or BOARD=refused|<behind>|<upstream>|<reason>
      case 'BOARD': {
        const [state, behind, up, ...why] = val.split('|')
        if (state === 'stale' || state === 'refused') m.board = { state, behind: num(behind) ?? 0, up: up ?? '', reason: state === 'refused' ? why.join('|') : '' }
        break
      }
      case 'LOCK': {
        const a = val.indexOf('|'), b = a < 0 ? -1 : val.indexOf('|', a + 1)
        if (a < 0) break
        const lock: Lock = {
          path: val.slice(0, a),
          ageMin: num(b < 0 ? val.slice(a + 1) : val.slice(a + 1, b)) ?? 0,
          holder: b < 0 ? '' : val.slice(b + 1),
        }
        m.locks.push(lock)
        break
      }
    }
  }
  return m
}

// "17 GB" | "3.2 GB" | "?": one decimal below 10, a whole number from 10.
// Given the threshold a figure is below (`limit`, bytes), its text never reads as that
// threshold: where rounding would reach it ("1.0 GB" for 0.97 GB below 1 GB), the
// figure is floored instead ("0.9 GB"), to two decimals should one still reach it.
export function gb(bytes: number | null, limit?: number): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return '?'
  const v = bytes / GiB
  const tenth = Math.round(v * 10) / 10
  const text = tenth < 10 ? tenth.toFixed(1) : String(Math.round(v))
  if (limit === undefined || bytes >= limit || Number(text) * GiB < limit) return text + ' GB'
  const floor1 = Math.floor(v * 10) / 10
  if (floor1 * GiB < limit) return floor1.toFixed(1) + ' GB'
  return (Math.floor(v * 100) / 100).toFixed(2) + ' GB'
}

// Thresholds (design CONSTRAINTS): disk free red < 1 GB, amber < 5 GB; memory free
// red < 1 GB, amber < 2 GB.
export const DISK = { red: GiB, amber: 5 * GiB } as const
export const MEM = { red: GiB, amber: 2 * GiB } as const
export type Limits = { readonly red: number; readonly amber: number }

// One figure as the band and the Health tab show it: its level (null when unknown)
// and its text, floored against the threshold it is below.
export function figure(bytes: number | null, t: Limits): { level: Level | null; text: string } {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return { level: null, text: '?' }
  if (bytes < t.red) return { level: 'red', text: gb(bytes, t.red) }
  if (bytes < t.amber) return { level: 'amber', text: gb(bytes, t.amber) }
  return { level: 'green', text: gb(bytes) }
}

// red: disk or memory free < 1 GB. amber: disk < 5 GB, memory < 2 GB, a stale lock
// (the script lists only locks older than 10 min), or a watchdog hold still set.
// An unknown figure is never red. `reasons` are the band's words for the level.
// F87: while muted, memory red is amber (it never holds); disk red stays red.
export function classify(m: Machine): Watch {
  const red: string[] = [], amber: string[] = []
  for (const [name, bytes, t] of [['disk', m.diskFree, DISK], ['mem', m.memFree, MEM]] as const) {
    const f = figure(bytes, t)
    if (f.level === 'red') (name === 'mem' && m.mute ? amber : red).push(`${name} ${f.text} free (below 1 GB)`)
    else if (f.level === 'amber') amber.push(`${name} ${f.text} low`)
  }
  if (red.length) return { level: 'red', reasons: red }
  if (m.mute) amber.push(mutedWords(m.mute))
  if (m.locks.length) amber.push(`locks ${m.locks.length} stale`)
  if (m.hold !== null) amber.push('held - /ops resume to release')
  return amber.length ? { level: 'amber', reasons: amber } : { level: 'green', reasons: [] }
}

// F87: /ops resume force mutes memory red until memory reads green once (or /ops watchdog
// on). The mute lives beside relay-morpheus's watchdog.hold, in the main checkout, so the
// pane and the ops app (two processes) both read it; "<since> mem <figure> free", blank =
// not muted (the pane's fs cannot delete, so unmuting writes it empty).
export const MUTE_FILE = '.skillator/watchdog.mute'
export const muteText = (now: number, memFree: number | null) =>
  `${new Date(now).toISOString().slice(0, 16)}Z mem ${gb(memFree)} free`
// The kv line a host appends to pending --machine's output: the file's first line, or none.
export const muteKv = (text: string | null) => {
  const line = (text ?? '').split(/\r?\n/)[0]!.trim()
  return line ? `\nMUTE=${line}\n` : ''
}
export function mutedWords(mute: string): string {
  const hm = /T(\d\d:\d\d)/.exec(mute.split(' ')[0] ?? '')?.[1]
  return `watchdog muted (forced ${hm ? hm + 'Z' : mute.split(' ')[0]})`
}
// Memory read green (2 GB or more free) while muted: the mute ends.
export const unmuteDue = (m: Machine) => !!m.mute && figure(m.memFree, MEM).level === 'green'
export const MUTED_HOW = 'memory red does not hold until memory reads green once, or /ops watchdog on; disk red still holds'

const mkWindow =(pct: number, resetsAt: string | null, source: Window['source'], at: number): Window =>
  ({ pct, resetsAt, source, at })

// `$.session.usage().rateLimits` (the status line's windows) and `cost.usd`.
export function usageFrom(rate: { kind: string; percentUsed: number; resetsAt?: string }[], cost: number | null, now: number): Usage {
  const pick = (kind: string) => rate.find(r => r.kind === kind && Number.isFinite(r.percentUsed))
  const five = pick('five_hour'), seven = pick('seven_day'), spend = pick('spend_limit')
  return {
    five: five ? mkWindow(five.percentUsed, five.resetsAt ?? null, 'host', now) : null,
    seven: seven ? mkWindow(seven.percentUsed, seven.resetsAt ?? null, 'host', now) : null,
    spendLimitPct: spend ? spend.percentUsed : null,
    costUsd: cost,
    decision: null,
  }
}

// `usage-watch level`: "src=<claude-code|codex|none> 5h=<pct|-> 7d=<pct|-> ctx=<pct|-> max=<pct|->".
// src=none or a '-' figure is null. Never throws. The hold decision stays relay's.
export function usageFromLevel(line: string, now: number): Usage {
  const kv = new Map<string, string>()
  for (const w of line.replace(/\r/g, '').trim().split(/\s+/)) { const i = w.indexOf('='); if (i > 0) kv.set(w.slice(0, i), w.slice(i + 1)) }
  const pct = (k: string) => { const v = kv.get(k); return v !== undefined && /^\d+(\.\d+)?$/.test(v) ? Number(v) : null }
  const w = (p: number | null) => (p === null || kv.get('src') === 'none' ? null : mkWindow(p, null, 'watch-cortana', now))
  return { five: w(pct('5h')), seven: w(pct('7d')), spendLimitPct: null, costUsd: null, decision: null }
}

// The first number in a watch-cortana flag file (a BOM, CR or stray space never counts).
export function pctOf(text: string): number | null {
  const m = /[0-9]+(\.[0-9]+)?/.exec(text)
  return m ? Number(m[0]) : null
}

export type Flag = { text: string; mtimeMs: number }
// Fallback only: this session's own `<id>` (5-hour) and `<id>.weekly` flag files; the
// reading's time is the file's mtime, so its age shows.
export function usageFromFlags(five: Flag | null, weekly: Flag | null, cost: number | null): Usage {
  const w = (f: Flag | null) => {
    const p = f ? pctOf(f.text) : null
    return f && p !== null ? mkWindow(p, null, 'watch-cortana', f.mtimeMs) : null
  }
  return { five: w(five), seven: w(weekly), spendLimitPct: null, costUsd: cost, decision: null }
}

export function isStale(w: Window, now: number): boolean {
  return now - w.at > STALE_MS
}

// "7m old" | "2h old" | "3d old"
export function ageText(w: Window, now: number): string {
  const min = Math.max(0, Math.floor((now - w.at) / 60000))
  if (min < 60) return `${min}m old`
  if (min < 24 * 60) return `${Math.floor(min / 60)}h old`
  return `${Math.floor(min / (24 * 60))}d old`
}

// The line `relay-morpheus chain decide --level` reads (usage-watch `level` format):
// "src=host 5h=41 7d=55 ctx=- max=-". Given `now`, a figure past 15 minutes is left out,
// so a stale reading never decides a hold; nothing left is `src=none` (UNOBSERVABLE).
export function levelLine(u: Usage, now?: number): string {
  const ok = (w: Window | null) => (w && (now === undefined || !isStale(w, now)) ? w : null)
  const five = ok(u.five), seven = ok(u.seven)
  const src = !five && !seven ? 'none'
    : [five, seven].some(w => w?.source === 'watch-cortana') ? 'watch-cortana' : 'host'
  const p = (w: Window | null) => (w ? String(w.pct) : '-')
  return `src=${src} 5h=${p(five)} 7d=${p(seven)} ctx=- max=-`
}
