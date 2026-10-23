// teams-uhura (F66): the Claude Code UserPromptSubmit hook (hooks/hooks.json at the
// plugin root). Messages the listener accepted since the last delivery go into this turn
// as context, framed as data, never as instructions; then they are marked delivered.
// No inbox, or nothing new: prints nothing, exits 0 - filesystem only, no git, no
// network. Any failure is silent too: it never blocks a prompt.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { mainRoot, readInbox, after, readMarker, writeMarker, frameMessages, INBOX, DELIVERED } from './inbox.mjs'

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
  const m = mainRoot(cwd)
  if (!m || !existsSync(join(m.root, INBOX))) return
  const fresh = after(readInbox(m.root), readMarker(m.root, DELIVERED))
  if (!fresh.length) return
  const additionalContext = frameMessages(fresh)
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext } }) + '\n')
  writeMarker(m.root, DELIVERED, fresh[fresh.length - 1].id)
}

main().catch(() => {}).finally(() => { process.exitCode = 0 })
