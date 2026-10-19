import { test, expect, mock } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { parseBoard, listView } from '../hooks/lib/board'

// F50: /list-tickets and /pending answer on their own: text out, no model turn.

const BOARD = `# Tickets

## Open

- [~] F3 — cart drawer keeps items on reload [app: web] [owner: @vidul] (@cc-4ae496)
- [!] B2 — /orders 500s past page 3 [app: api] [by: @asha]
- [?] F2 — /orders endpoint returns the last 20 orders [app: api] [decide: @asha]
- [ ] B1 — button focus ring missing [app: ui]

## Closed

- [x] B3 — login redirect loop
`
const PENDING = '/s/skills/tickets-zordon/scripts/pending.sh'
const RUN = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 144 } }
const ran = (stdout: string, exitCode = 0, stderr = ''): ProcessRunResult =>
  ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false })

type World = { runs: (readonly string[])[]; model: string[]; pending: ProcessRunResult }

function world(on: On, board: string | null = BOARD): World {
  const w: World = { runs: [], model: [], pending: ran('TICKETS   4 open\n') }
  mock.clock(on, { now: 1_000_000 })
  mock.env(on, { SKILLATOR_ROOT: '/s' })
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.repo', () => ({ value: { root: '/r', remote: null, internal: false, name: 'r' } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  const at = (p: string): string | undefined => {
    const n = p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')
    if (n === '/r/TICKETS.md') return board ?? undefined
    return n === '/s/skills/tickets-zordon/scripts/ticket-meta.sh' ? '#!/bin/sh\n' : undefined
  }
  on('fs.stat', ($, e) => {
    const f = at(e.path)
    return f !== undefined ? { value: { kind: 'file' as const, size: f.length, mtimeMs: 1000, isLink: false } } : { deny: 'ENOENT' }
  })
  on('fs.exists', ($, e) => ({ value: at(e.path) !== undefined }))
  on('fs.read', ($, e) => { const f = at(e.path); return f !== undefined ? { value: f } : { deny: 'ENOENT' } })
  on('process.run', ($, e) => {
    if (e.argv.join(' ') === 'git config user.email') return { value: ran('') }
    if (e.argv[1] === PENDING && e.argv.length === 2) { w.runs.push(e.argv); return { value: w.pending } }
    return { value: ran('', 1, 'not in this test') }   // the band's background polls
  })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.status', () => ({ value: undefined }))
  on('prompt.submit', ($, e) => { w.model.push('prompt.submit'); return { text: e.text } })
  return w
}

async function start($: Engine) {
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
}

test('/list-tickets answers { text } = listView of the main checkout board, no model turn', async ($, on) => {
  const w = world(on)
  await start($)
  const board = parseBoard(BOARD, '/r/TICKETS.md', 0, 0)
  for (const args of ['', 'status app:api', '@asha', 'B']) {
    const out = await $.command.run({ command: 'list-tickets', args, ...RUN })
    expect(out.text).toBe(listView(board, args))
  }
  expect(w.model).toEqual([])
})

test('/pending answers the pending script stdout, no model turn', async ($, on) => {
  const w = world(on)
  await start($)
  const out = await $.command.run({ command: 'pending', args: '', ...RUN })
  expect(out.text).toBe('TICKETS   4 open\n')
  expect(w.runs).toHaveLength(1)
  expect(w.model).toEqual([])
})

test('/pending failure returns the error and the command that ran', async ($, on) => {
  const w = world(on)
  w.pending = ran('', 3, 'boom')
  await start($)
  const out = await $.command.run({ command: 'pending', args: '', ...RUN })
  expect(out.text).toContain('boom')
  expect(out.text).toContain(`sh ${PENDING}`)
})

test('/list-tickets without a TICKETS.md says so', async ($, on) => {
  world(on, null)
  await start($)
  const out = await $.command.run({ command: 'list-tickets', args: '', ...RUN })
  expect(out.text).toContain('no TICKETS.md')
})
