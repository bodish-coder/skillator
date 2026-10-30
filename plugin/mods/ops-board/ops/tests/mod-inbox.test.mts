// Narrow offline replay of the actual mod polling source. This does not emulate the UI runtime.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { inboxDirOfCommonGitDir, INBOX_FILE, READ_FILE, parseInbox } from '../../hooks/lib/inbox'

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
