import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const scripts = new URL('../scripts/', import.meta.url)
const win = process.platform === 'win32'
const shell = process.env.F185_SH || (win ? 'powershell' : '/bin/sh')
const ps = win && !process.env.F185_SH
const script = fileURLToPath(new URL(ps ? 'ticket-meta.ps1' : 'ticket-meta.sh', scripts))
const prefix = ps ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script] : [script]
const payload = data => Buffer.from(JSON.stringify(data)).toString('base64url')

test('intake shares drafts across worktrees and records only an explicit approval', () => {
  const root = mkdtempSync(join(process.cwd(), '.f185-test-'))
  const worktree = join(root, 'second')
  const board = join(root, 'TICKETS.md')
  const initial = '# Tickets\r\n\r\n## Bugs\r\n\r\n- [x] B3 - Login screen crashes\r\n\r\n'
    + '## Features\r\n\r\n- [ ] F9 - Login screen crashes\r\n\r\n## Agent-found\r\n'
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  function invoke(args, cwd = worktree) {
    return spawnSync(shell, [...prefix, 'intake', ...args], {
      cwd, encoding: 'utf8', env: { ...process.env, TICKET_META_LOCK_WAIT: '0' },
    })
  }
  function intake(args, cwd) {
    const r = invoke(args, cwd)
    assert.equal(r.status, 0, r.stderr || String(r.error))
    return r.stdout.trim()
  }
  try {
    git('init', '-q')
    git('config', 'user.email', 'fixture@example.test')
    git('config', 'user.name', 'Fixture')
    git('config', 'core.autocrlf', 'false')
    git('config', 'commit.gpgsign', 'false')
    writeFileSync(board, initial)
    writeFileSync(join(root, 'TICKETS-archive.md'), '- [x] B6 - Archived\n')
    git('add', 'TICKETS.md', 'TICKETS-archive.md')
    git('commit', '-qm', 'fixture')
    git('worktree', 'add', '-qb', 'second', worktree)
    const pending = JSON.parse(intake(['add', payload({
      type: 'B', title: 'Login screen crashes', source: 'Teams', sourceId: '42',
    })]))
    const rejected = JSON.parse(intake(['add', payload({ type: 'F', title: 'Reject me' })], root))
    const listed = JSON.parse(intake(['list'], root)).find(d => d.id === pending.id)
    assert.deepEqual(listed.duplicates, ['F9'])
    assert.equal(listed.sourceId, '42')
    const edited = JSON.parse(intake(['edit', pending.id, pending.revision, payload({
      title: 'Café login crashes', description: 'Details\n- [ ] B777 - injected', sourceId: 'changed',
    })]))
    assert.equal(edited.sourceId, '42')
    assert.notEqual(edited.revision, pending.revision)
    assert.notEqual(invoke(['accept', pending.id, pending.revision]).status, 0)
    intake(['reject', rejected.id, rejected.revision])
    assert.equal(readFileSync(board, 'utf8'), initial)
    assert.equal(readFileSync(join(worktree, 'TICKETS.md'), 'utf8'), initial)
    writeFileSync(board + '.lock', 'fixture lock')
    assert.match(invoke(['accept', edited.id, edited.revision]).stderr, /locked/)
    assert.equal(readFileSync(board + '.lock', 'utf8'), 'fixture lock')
    rmSync(board + '.lock')
    writeFileSync(board, initial + '\r\nUncommitted owner edit\r\n')
    assert.match(invoke(['accept', edited.id, edited.revision]).stderr, /uncommitted changes/)
    assert.match(readFileSync(board, 'utf8'), /Uncommitted owner edit/)
    writeFileSync(board, initial)
    assert.equal(intake(['accept', edited.id, edited.revision]), 'B7')
    const updated = readFileSync(board, 'utf8')
    assert.match(updated, /B3 - Login screen crashes\r\n- \[ \] B7 — Café login crashes.*Source ID: 42\.\r\n\r\n## Features/)
    assert.doesNotMatch(updated, /\n- \[ \] B777|Reject me/)
    assert.equal(git('log', '-1', '--format=%s'), 'board: intake B7')
    assert.deepEqual(JSON.parse(intake(['list'])), [])
    assert.notEqual(invoke(['accept', edited.id, edited.revision]).status, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
