import type { Member } from '../../types'

// `.skillator/team.md`, read as ticket-meta reads it (team_rows / team_members): a
// member line is `^[ \t]*[-*][ \t]*@[A-Za-z0-9_.-]+[ \t]*:` then emails, comma-split
// and lower-cased; the handle is kept as written, since ticket-meta assign / decide /
// team remove match it exactly. An indented `  name: Full Name` line straight under a
// member names it (the last one wins, as in ticket-meta); any other line ends that.
const MEMBER = /^[ \t]*[-*][ \t]*(@[A-Za-z0-9_.-]+)[ \t]*:(.*)$/
const NAME = /^[ \t]+name:[ \t]*(.*?)[ \t]*$/

export function parseTeam(text: string): Member[] {
  const out: Member[] = []
  let last: Member | null = null
  for (const raw of text.split(/\r?\n/)) {
    const m = MEMBER.exec(raw)
    if (m) {
      const emails = m[2]!.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      last = { handle: m[1]!, emails }
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

export function meOf(team: Member[], email: string): string | null {
  const e = email.trim().toLowerCase()
  if (!e) return null
  return team.find(m => m.emails.includes(e))?.handle ?? null
}
