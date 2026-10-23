// teams-uhura (F66): the Claude Code UserPromptSubmit hook (hooks/hooks.json at the
// plugin root). Messages the listener accepted since the last delivery go into this turn
// as context, framed as data, never as instructions; then they are marked delivered.
// The inbox is read only from the repo's common git dir (inbox.mjs): a file in the
// working tree - committed, pulled - is never read. Every field is checked and every
// text line quoted (frameMessages). No inbox, or nothing new: prints nothing, exits 0 -
// filesystem only, no git, no network. Any failure is silent too: it never blocks a prompt.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { inboxDir, readInbox, after, readMarker, writeMarker, frameMessages, INBOX, DELIVERED, READ } from './inbox.mjs'

async function stdinText() {
  if (process.stdin.isTTY) return ''
  let s = ''
  process.stdin.setEncoding('utf8')
  for await (const d of process.stdin) s += d
  return s
}

const SHOWN = 20

// The delivered marker is per session (team-inbox.delivered.<session id>), so a parallel
// session - a worktree, another window - never takes another's messages. A session with
// no marker yet starts at the read marker: what a person has not read, not all history.
// The marker moves only past what this turn framed; the rest come with the next prompt.
// Ruling: old sessions' marker files are left (one short line each).
async function main() {
  let cwd = process.cwd()
  let sid = ''
  try {
    const e = JSON.parse(await stdinText())
    if (e && typeof e.cwd === 'string' && e.cwd) cwd = e.cwd
    if (e && typeof e.session_id === 'string') sid = e.session_id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80)
  } catch { /* no event: the process cwd */ }
  const box = inboxDir(cwd)
  if (!box || !existsSync(join(box, INBOX))) return
  const marker = sid ? `${DELIVERED}.${sid}` : DELIVERED
  const from = readMarker(box, marker) ?? readMarker(box, READ)
  const fresh = after(readInbox(box), from)
  if (!fresh.length) return
  const shown = fresh.slice(0, SHOWN)
  const additionalContext = frameMessages(shown, { max: SHOWN, more: fresh.length - shown.length })
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext } }) + '\n')
  writeMarker(box, marker, shown[shown.length - 1].id)
}

main().catch(() => {}).finally(() => { process.exitCode = 0 })
