import type { Board, Member } from '../../types'
import { isOpen } from './board'

// `.skillator/team.md`, read as ticket-meta reads it (team_rows / team_members): a
// member line is `^[ \t]*[-*][ \t]*@[A-Za-z0-9_.-]+[ \t]*:` then emails, comma-split
// and lower-cased; the handle is kept as written, since ticket-meta assign / decide /
// team remove match it exactly. An indented `  name: Full Name` line straight under a
// member names it (the last one wins, as in ticket-meta); any other line ends that.
// F80: the first `lead: @handle` line (ticket-meta lead_of) marks that member lead.
const MEMBER = /^[ \t]*[-*][ \t]*(@[A-Za-z0-9_.-]+)[ \t]*:(.*)$/
const NAME = /^[ \t]+name:[ \t]*(.*?)[ \t]*$/
const LEAD = /^lead:[ \t]*(@[A-Za-z0-9_.-]+)[ \t]*$/m

export function parseTeam(text: string): Member[] {
  const out: Member[] = []
  let last: Member | null = null
  const lead = LEAD.exec(text.replace(/\r/g, ''))?.[1]
  for (const raw of text.split(/\r?\n/)) {
    const m = MEMBER.exec(raw)
    if (m) {
      const emails = m[2]!.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      last = { handle: m[1]!, emails, ...(sameHandle(m[1], lead) ? { lead: true as const } : {}) }
      out.push(last)
      continue
    }
    const n = NAME.exec(raw)
    if (n && last) {
      if (n[1]) last.name = n[1]
      else delete last.name
    } else last = null
  }
  return out
}

// Handles compare without case where the board is read (its tags are lower-cased).
export const sameHandle = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase()

// F109: the 4-character session code - ticket-meta session_code: h = (h*33 + b) mod 36^4
// over the raw id's UTF-8 bytes, base36, zero-padded. Vectors in team.test and ticket-meta's selftests.
export function sessionCode(id: string): string {
  let h = 0
  for (const b of new TextEncoder().encode(id)) h = (h * 33 + b) % 1679616
  return h.toString(36).padStart(4, '0')
}

// F97: this session's tag as ticket-meta session_tag: SKILLATOR_SESSION (one leading @
// off, lower-cased), else cc-<F109 code of the session id>; a file name, so it must be
// [a-z0-9_-]+, else there is no tag.
export function sessionTag(envSession: string | null | undefined, sessionId: string | null | undefined): string | null {
  let tag = (envSession ?? '').replace(/^@/, '').toLowerCase()
  if (!tag && sessionId) tag = 'cc-' + sessionCode(sessionId)
  if (!/^[a-z0-9_-]+$/.test(tag)) return null
  // the dash is what tells a session tag from a title's own (@handle)
  if (!/.-./.test(tag)) throw new Error(`SKILLATOR_SESSION must be @<agent>-<id>, not '${envSession}'`)
  return tag
}

// F80: as ticket-meta whoami / me_of - F97: the F92 session owner file first (its one
// line, exact; a handle not on the team is nobody, never a fall back), then SKILLATOR_ME
// (a member as written, @ optional), then the email.
export function meOf(team: Member[], email: string, envMe?: string | null, owner?: string | null): string | null {
  if (owner !== null && owner !== undefined) return team.find(m => m.handle === owner)?.handle ?? null
  if (envMe) { const h = envMe.startsWith('@') ? envMe : '@' + envMe; return team.find(m => m.handle === h)?.handle ?? null }
  const e = email.trim().toLowerCase()
  if (!e) return null
  return team.find(m => m.emails.includes(e))?.handle ?? null
}

// "lead · (you) · 3 owned · 1 decide" over the open tickets ([ ] [~] [%] [!] [?]).
export function ticketsOf(m: Member, board: Board | null, me: string | null): string {
  const open = (board?.tickets ?? []).filter(isOpen)
  const owned = open.filter(t => sameHandle(t.owner, m.handle)).length
  const decide = open.filter(t => sameHandle(t.decide, m.handle)).length
  const parts = [...(m.lead ? ['lead'] : []), ...(m.handle === me ? ['(you)'] : []), ...(owned ? [`${owned} owned`] : []), ...(decide ? [`${decide} decide`] : [])]
  return parts.join(' · ') || '-'
}
