// Narrow offline replay of the actual mod polling source. This does not emulate the UI runtime.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { inboxDirOfCommonGitDir, INBOX_FILE, READ_FILE, parseInbox, pendingHandoffOf } from '../../hooks/lib/inbox'
import { bandLines, countsOf, NARROW_COLUMNS, statusText } from '../../hooks/lib/bandlines'
import { parseBoard } from '../../hooks/lib/board'
import { parseTeam } from '../../hooks/lib/team'

const source = readFileSync(new URL('../../hooks/messagestab.tsx', import.meta.url), 'utf8')
const start = source.indexOf("let inboxSig = ''")
const end = source.indexOf('export async function unreadOf', start)
assert.ok(start >= 0 && end > start, 'poll source boundaries must exist')
const polling = stripTypeScriptTypes(source.slice(start, end).replace('export async function pollInbox', 'async function pollInbox'))

for (const failure of ['nonzero', 'empty', 'throws', 'missing-bin', 'changed-root']) {
  test('A175 mod poll: success -> ' + failure + ' -> unchanged-stat recovery', async () => {
    const state = { messages: [], readId: null } as { messages: { id: string }[]; readId: string | null }
    let root = '/linked checkout', broken = false
    const files: Record<string, string> = {
      '/main checkout/.git/skillator/team-inbox.jsonl': JSON.stringify({ id: 'shared', from: '@fixture', ts: '2026-10-31T00:00:00Z', text: 'shared' }),
      '/main checkout/.git/skillator/team-inbox.read': 'shared\r\n',
    }
    const paths: string[] = []
    const host = {
      session: { repo: async () => ({ root }) },
      process: { run: async (argv: string[], init: { cwd: string }) => {
        assert.deepEqual(argv, ['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'])
        assert.equal(init.cwd, root)
        if (broken && failure === 'throws') throw new Error('resolution failed')
        return { exitCode: broken && failure !== 'empty' ? 128 : 0, stdout: broken ? '' : '/main checkout/.git\r\n' }
      } },
      fs: {
        stat: async (p: string) => { paths.push(p); assert.ok(p in files); return { mtimeMs: 1, size: files[p].length } },
        read: async (p: string) => files[p],
      },
    }
    const poll = new Function('gitBin', 'inboxDirOfCommonGitDir', 'INBOX_FILE', 'READ_FILE', 'parseInbox', 'update', 'messagesA', 'msgReadA', 'runCall', polling + '\nreturn pollInbox')(
      async () => broken && failure === 'missing-bin' ? null : 'git', inboxDirOfCommonGitDir, INBOX_FILE, READ_FILE, parseInbox,
      async (_host: unknown, key: string, fn: () => unknown) => { (state as Record<string, unknown>)[key] = fn() }, 'messages', 'readId',
      async () => { throw new Error('unexpected script call') },
    )
    await poll(host)
    assert.deepEqual(state.messages.map(m => m.id), ['shared'])
    assert.equal(state.readId, 'shared')
    const reads = paths.length
    broken = true
    if (failure === 'changed-root') root = '/other checkout'
    await poll(host)
    assert.deepEqual(state.messages, [], 'failed resolution must clear stale messages')
    assert.equal(state.readId, null, 'failed resolution must clear stale read marker')
    assert.equal(paths.length, reads, 'failed resolution must not probe guessed storage')
    broken = false
    await poll(host)
    assert.deepEqual(state.messages.map(m => m.id), ['shared'], 'unchanged stats must reload after recovery')
    assert.equal(state.readId, 'shared')
  })
}

test('A178 mod integration: serialized inbox record flows through pollInbox to both band.tsx and register.tsx status callers', async () => {
  const regSrc = readFileSync(new URL('../../hooks/register.tsx', import.meta.url), 'utf8')
  const uStart = regSrc.indexOf('async function updateStatus')
  const uEnd = regSrc.indexOf('function redFix', uStart)
  assert.ok(uStart >= 0 && uEnd > uStart, 'updateStatus boundaries must exist in register.tsx')
  const updateStatusJs = stripTypeScriptTypes("let lastStatus = null\n" + regSrc.slice(uStart, uEnd))

  const bandSrc = readFileSync(new URL('../../hooks/band.tsx', import.meta.url), 'utf8')
  const bStart = bandSrc.indexOf('export async function renderBand')
  const bEnd = bandSrc.indexOf('const notes = await read($, notesA)', bStart)
  assert.ok(bStart >= 0 && bEnd > bStart, 'renderBand boundaries must exist in band.tsx')
  const renderBandInputJs = stripTypeScriptTypes(
    bandSrc.slice(bStart, bEnd).replace('export async function renderBand', 'async function renderBand') + '\nreturn bandLines(v)\n}',
  )

  const board = parseBoard('- [~] F3 — a\n- [ ] F1 — b\n- [ ] B1 — c\n', 'T', 1, 1)
  const team = parseTeam('- @asha: asha@ikran.in\n- @vidul: vidul@ikran.in\n')
  const state: Record<string, unknown> = {
    board,
    team,
    me: '@asha',
    session: 'cc-1',
    narrow: false,
    watch: { level: 'green', reasons: [] },
    machine: null,
    usage: {
      five: { pct: 12, resetsAt: null, source: 'host', at: 0 },
      seven: { pct: 34, resetsAt: null, source: 'host', at: 0 },
      spendLimitPct: null,
      costUsd: null,
      decision: null,
    },
    relay: null,
    messages: [],
    msgRead: null,
  }

  let mtime = 1
  const files: Record<string, string> = {
    '/repo/.git/skillator/team-inbox.jsonl': [
      JSON.stringify({ id: 'h1', from: '@asha', to: '@VIDUL', email: 'asha@ikran.in', ts: '2026-10-31T10:00:00Z', text: 'handoff F130' }),
      JSON.stringify({ id: 'h2', from: '@asha', email: 'asha@ikran.in', ts: '2026-10-31T10:01:00Z', text: 'plain note' }),
    ].join('\n') + '\n',
  }
  const statuses: string[] = []
  const host = {
    session: { repo: async () => ({ root: '/repo' }) },
    process: { run: async () => ({ exitCode: 0, stdout: '/repo/.git\n' }) },
    fs: {
      stat: async (p: string) => {
        if (!(p in files)) throw new Error('ENOENT')
        return { mtimeMs: mtime, size: files[p]!.length }
      },
      read: async (p: string) => files[p]!,
    },
    clock: { now: async () => 0 },
    ui: {
      status: (t: string) => { statuses.push(t) },
      resolve: () => ({ Box: 'div', Text: 'span', Button: 'button' }),
    },
  }
  const read = async (_h: unknown, key: string) => state[key]
  const update = async (_h: unknown, key: string, fn: (prev: unknown) => unknown) => { state[key] = fn(state[key]) }

  const poll = new Function('gitBin', 'inboxDirOfCommonGitDir', 'INBOX_FILE', 'READ_FILE', 'parseInbox', 'update', 'messagesA', 'msgReadA', 'runCall', polling + '\nreturn pollInbox')(
    async () => 'git', inboxDirOfCommonGitDir, INBOX_FILE, READ_FILE, parseInbox, update, 'messages', 'msgRead',
    async () => { throw new Error('unexpected script call') },
  )
  const runUpdateStatus = new Function(
    'read', 'boardA', 'messagesA', 'msgReadA', 'teamA', 'usageA', 'meA', 'pendingHandoffOf', 'statusText', 'countsOf',
    updateStatusJs + '\nreturn updateStatus',
  )(read, 'board', 'messages', 'msgRead', 'team', 'usage', 'me', pendingHandoffOf, statusText, countsOf)

  const runRenderBand = new Function(
    'read', 'narrowA', 'NARROW_COLUMNS', 'messagesA', 'msgReadA', 'teamA', 'watchA', 'machineA', 'usageA', 'relayA', 'boardA', 'meA', 'sessionA', 'pendingHandoffOf', 'countsOf', 'bandLines',
    renderBandInputJs + '\nreturn renderBand',
  )(read, 'narrow', NARROW_COLUMNS, 'messages', 'msgRead', 'team', 'watch', 'machine', 'usage', 'relay', 'board', 'me', 'session', pendingHandoffOf, countsOf, bandLines)

  // 1. Unread handoff to @VIDUL resolves to canonical @vidul in both status and band
  await poll(host)
  await runUpdateStatus(host)
  assert.equal(statuses.at(-1), 'ops @asha 2 pending | 1 in progress | 3 total · 5h 12% · 7d 34% → @vidul')
  const wideLines = await runRenderBand(host, { props: { bodyColumns: 120 }, viewport: { columns: 120 } })
  assert.match(wideLines[0], /→ @vidul$/)
  const narrowLines = await runRenderBand(host, { props: { bodyColumns: 96 }, viewport: { columns: 96 } })
  assert.match(narrowLines[1], /→ @vidul/)

  // 2. Read marker clears handoff from both status and band
  files['/repo/.git/skillator/team-inbox.read'] = 'h1\n'
  mtime++
  await poll(host)
  await runUpdateStatus(host)
  assert.equal(statuses.at(-1), 'ops @asha 2 pending | 1 in progress | 3 total · 5h 12%')
  const readLines = await runRenderBand(host, { props: { bodyColumns: 120 }, viewport: { columns: 120 } })
  assert.doesNotMatch(readLines[0], /→/)

  // 3. Unknown team handle and malicious `to` records are rejected safely
  files['/repo/.git/skillator/team-inbox.jsonl'] += [
    JSON.stringify({ id: 'h3', from: '@asha', to: '@outsider', email: 'asha@ikran.in', ts: '2026-10-31T10:02:00Z', text: 'unknown recipient' }),
    JSON.stringify({ id: 'h4', from: '@asha', to: '@vidul\u001b[31m', email: 'asha@ikran.in', ts: '2026-10-31T10:03:00Z', text: 'malicious ansi' }),
    JSON.stringify({ id: 'h5', from: '@asha', to: 'vidul', email: 'asha@ikran.in', ts: '2026-10-31T10:04:00Z', text: 'missing @' }),
  ].join('\n') + '\n'
  mtime++
  await poll(host)
  await runUpdateStatus(host)
  assert.equal(statuses.at(-1), 'ops @asha 2 pending | 1 in progress | 3 total · 5h 12%')
  const safeLines = await runRenderBand(host, { props: { bodyColumns: 120 }, viewport: { columns: 120 } })
  assert.doesNotMatch(safeLines[0], /→/)
})
