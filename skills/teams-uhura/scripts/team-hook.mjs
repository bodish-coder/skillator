// teams-uhura (F66): the Claude Code UserPromptSubmit hook (hooks/hooks.json at the
// plugin root). Messages the listener accepted since the last delivery go into this turn
// as context, framed as data, never as instructions; then they are marked delivered.
// The inbox is read only from the repo's common git dir (inbox.mjs): a file in the
// working tree - committed, pulled - is never read. Every field is checked and every
// text line quoted (frameMessages). No inbox, or nothing new: prints nothing, exits 0 -
// filesystem only, no git, no network. Any failure is silent too: it never blocks a prompt.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { inboxDir, readInbox, after, readMarker, writeMarker, frameMessages, INBOX, DELIVERED } from './inbox.mjs'

async function stdinText() {
  if (process.stdin.isTTY) return ''
  let s = ''
  process.stdin.setEncoding('utf8')
  for await (const d of process.stdin) s += d
  return s
}

async function main() {
  let cwd = process.cwd()
  try {
    const e = JSON.parse(await stdinText())
    if (e && typeof e.cwd === 'string' && e.cwd) cwd = e.cwd
  } catch { /* no event: the process cwd */ }
  const box = inboxDir(cwd)
  if (!box || !existsSync(join(box, INBOX))) return
  const fresh = after(readInbox(box), readMarker(box, DELIVERED))
  if (!fresh.length) return
  const additionalContext = frameMessages(fresh)
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext } }) + '\n')
  writeMarker(box, DELIVERED, fresh[fresh.length - 1].id)
}

main().catch(() => {}).finally(() => { process.exitCode = 0 })
