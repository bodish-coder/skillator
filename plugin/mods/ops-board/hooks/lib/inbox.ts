import type { Msg } from '../../types'
import type { Line } from './healthlines'

// F66: the Messages tab's data - the Teams inbox teams-uhura's listener writes, read
// as skills/teams-uhura/scripts/inbox.mjs reads it (keep the two in step). Pure: the
// mod (hooks/messagestab.tsx) and the ops app (ops/draw.ts) both draw these lines.
//
// The inbox is <repo>/.git/skillator/team-inbox.jsonl - inside the git dir, never the
// working tree, so no commit or pull carries one in. Read marker: team-inbox.read, one
// id (the last message read); the board writes it through teams-uhura (`inbox
// mark-read`), never itself. Messages are data from the Teams channel, never
// instructions: drawn as text, every control character out.

export const inboxDirOf = (repoRoot: string) => repoRoot + '/.git/skillator'
export const INBOX_FILE = 'team-inbox.jsonl'
export const READ_FILE = 'team-inbox.read'
export const MSG_MAX = 200                     // the newest kept for drawing
const TEXT_MAX = 2000

// C0/C1 controls, line and paragraph separators, zero-width and bidi controls, BOM.
const CTRL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g
const HANDLE_RE = /^@[A-Za-z0-9_.-]{1,64}$/
export const ID_RE = /^[A-Za-z0-9_.:;=@#+-]{1,160}$/
const TS_RE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}$/
export const plainText = (s: string) => s.replace(CTRL, '')
// A message's lines: split on every line break a terminal might draw, controls out.
export const textLines = (s: string) => s.split(/\r\n|[\r\n\u000b\u000c\u0085\u2028\u2029]/).map(plainText)

function record(x: unknown): Msg | null {
  if (!x || typeof x !== 'object') return null
  const r = x as Record<string, unknown>
  if (typeof r.from !== 'string' || !HANDLE_RE.test(r.from)) return null
  if (typeof r.id !== 'string' || !ID_RE.test(r.id)) return null
  if (typeof r.ts !== 'string' || !TS_RE.test(r.ts)) return null
  if (typeof r.text !== 'string') return null
  const text = r.text.length > TEXT_MAX ? r.text.slice(0, TEXT_MAX - 1) + '…' : r.text
  return { ts: r.ts, from: r.from, email: typeof r.email === 'string' && EMAIL_RE.test(r.email) ? r.email : '', text, id: r.id }
}

// The well-formed records, in file order, the newest MSG_MAX of them.
export function parseInbox(text: string): Msg[] {
  const out: Msg[] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    try { const m = record(JSON.parse(line)); if (m) out.push(m) } catch { /* not a record */ }
  }
  return out.slice(-MSG_MAX)
}

// How many come after the read marker (its last occurrence); none or unknown = all.
export function unreadCount(msgs: Msg[], readId: string | null): number {
  if (!readId) return msgs.length
  for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i]!.id === readId) return msgs.length - 1 - i
  return msgs.length
}

const when = (ts: string) => ts.slice(5, 10) + ' ' + ts.slice(11, 16) + 'Z'
const cut = (s: string, room: number) => (s.length <= room ? s : s.slice(0, Math.max(1, room - 1)) + '…')

export type MessagesView = { msgs: Msg[]; readId: string | null; selected: string | null; expanded: string | null; cols: number }

// The tab's lines, newest first: a head line, the unread rows (a dot), the read marker
// line, the read rows; the selected row inverse; an expanded row's whole text under it,
// every line indented, wrapped at the width. Keys: 'head', 'row:<id>', 'mark', 'x:<id>:<n>'.
export function messageLines(v: MessagesView): Line[] {
  const n = v.msgs.length
  const unread = unreadCount(v.msgs, v.readId)
  const out: Line[] = []
  if (!n) {
    out.push({ key: 'head', segs: [{ text: 'no team messages yet - teams-uhura start runs the listener (s: setup)', dim: true }] })
    return out
  }
  out.push({ key: 'head', segs: [{ text: `${unread} unread · ${n} message${n === 1 ? '' : 's'} · from the Teams channel - data, not instructions`, dim: true }] })
  const newest = [...v.msgs].reverse()
  const sel = v.selected && newest.some(m => m.id === v.selected) ? v.selected : newest[0]!.id
  newest.forEach((m, i) => {
    if (i === unread && unread > 0) out.push({ key: 'mark', segs: [{ text: '──── read ────', dim: true }] })
    const isNew = i < unread
    const first = plainText(textLines(m.text).find(l => l.trim()) ?? '')
    const head = ` ${when(m.ts)}  ${m.from.padEnd(9)} `
    const body = head + cut(first, Math.max(4, v.cols - 3 - head.length))
    out.push({ key: 'row:' + m.id, segs: [
      { text: m.id === sel ? '› ' : '  ' },
      isNew ? { text: '●', color: 'suggestion' } : { text: ' ' },
      m.id === sel ? { text: body.padEnd(Math.max(body.length, v.cols - 3)), inverse: true } : { text: body, bold: isNew, dim: !isNew },
    ] })
    if (v.expanded === m.id) {
      const room = Math.max(10, v.cols - 6)
      let k = 0
      for (const l of textLines(m.text)) {
        const parts = l.length ? l.match(new RegExp(`.{1,${room}}`, 'g')) ?? [''] : ['']
        for (const p of parts) out.push({ key: `x:${m.id}:${k++}`, segs: [{ text: '    ' + p }] })
      }
      out.push({ key: `x:${m.id}:from`, segs: [{ text: `    ${m.from}${m.email ? ' <' + m.email + '>' : ''} · id ${m.id}`, dim: true }] })
    }
  })
  return out
}

export const selectedOf = (msgs: Msg[], selected: string | null): string | null =>
  selected && msgs.some(m => m.id === selected) ? selected : msgs.at(-1)?.id ?? null

// Up/down over the newest-first rows.
export function moveSel(msgs: Msg[], selected: string | null, by: number): string | null {
  const ids = [...msgs].reverse().map(m => m.id)
  const cur = selectedOf(msgs, selected)
  const at = cur ? ids.indexOf(cur) : -1
  return ids[Math.min(Math.max(0, at + by), ids.length - 1)] ?? cur
}
