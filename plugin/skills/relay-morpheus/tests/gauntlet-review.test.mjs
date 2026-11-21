import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const hook = resolve(import.meta.dirname, '../hooks/gauntlet-review.mjs')
const cases = [
  ['UI', 'medium', 'screen.tsx', 'fixture\n', [['code-review', 'build'], ['design-arwen', 'deep'], ['a11y-toph', 'build']]],
  ['security', 'low', 'handler.js', 'export const handler = req => req.body\n', [['code-review', 'deep'], ['security-review', 'deep']]],
  ['plain', 'low', 'tasks.md', 'fixture\n', [['code-review', 'build']]],
  ['high risk plain', 'high', 'tasks.md', 'fixture\n', [['code-review', 'deep']]],
]

for (const [label, risk, file, content, expected] of cases) {
  test(`records ${label} reviewer seats and tiers from the actual Git changes`, t => {
    const dir = mkdtempSync(join(tmpdir(), 'gauntlet review '))
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    const worktree = join(dir, 'tree')
    mkdirSync(worktree)
    const git = (...args) => execFileSync('git', ['-C', worktree, ...args], { encoding: 'utf8' }).trim()
    git('init', '-q')
    writeFileSync(join(worktree, 'existing.txt'), 'baseline\n')
    git('add', 'existing.txt')
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.org', 'commit', '-qm', 'baseline')
    const base = git('rev-parse', 'HEAD')
    writeFileSync(join(worktree, file), content)
    if (label === 'UI') git('add', '--', file)
    const ledger = join(dir, 'run-0001-test.md')
    const initial = [
      '# RUN-0001', '', '## Chain', '### AAAA - stage 1 - fixture',
      'tickets: F1', 'files: planned.md', `triage: ACCEPT ${risk}`, 'prompt: |',
      '  preserve this prompt', '', '## Rulings', '',
    ].join('\n')
    writeFileSync(ledger, initial)
    const gate = join(dir, 'result.json')
    const route = () => spawnSync(process.execPath, [hook, worktree, base, ledger, '1', dir], { encoding: 'utf8' })
    writeFileSync(gate, JSON.stringify({ status: 'retry', exit: 1 }))
    assert.notEqual(route().status, 0)
    assert.equal(readFileSync(ledger, 'utf8'), initial)
    writeFileSync(gate, JSON.stringify({ status: 'skip', reason: 'Fixture has no checks script' }))
    const proc = route()
    assert.equal(proc.status, 0, proc.stderr)
    const record = JSON.parse(proc.stdout)
    assert.deepEqual(record.files, [file])
    assert.deepEqual(record.reviewers.map(({ seat, tier }) => [seat, tier]), expected)
    const saved = readFileSync(ledger, 'utf8')
    const line = saved.split('\n').find(line => line.startsWith('reviewers: '))
    assert.deepEqual(JSON.parse(line.slice('reviewers: '.length)), record)
    assert.equal(saved.replace(line + '\n', ''), initial)
    assert.equal(route().status, 0)
    assert.equal(readFileSync(ledger, 'utf8'), saved)
  })
}
