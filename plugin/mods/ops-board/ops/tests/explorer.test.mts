import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initial, reduce, afterRun } from '../state'
import type { Effect, State, Step } from '../state'
import { frame, cells } from '../draw'
import { makeEngine } from '../engine'
import { parseArgs } from '../app'
import type { Host, RunResult } from '../nodehost'
import { changeArgs, COUNT_ARGS, INCOMING_ARGS, LOG_ARGS, LS_ARGS, NO_GIT, UPSTREAM_ARGS } from '../../hooks/lib/explorer'

// F75: the standalone app's Explorer tab (5) - the same model as the pane's
// (hooks/lib/explorer.ts): git-tracked files as a tree, the newest commits opening to
// their files. git runs as a `git` effect through the host's absolute git (A150).

const SHA1 = '1234567' + 'a'.repeat(33)
const SHA2 = '89abcde' + 'b'.repeat(33)
const FILES = ['README.md', 'mods/a/x.ts', 'mods/a/y.ts', 'mods/b.ts'].join('\0') + '\0'
const LOG = `${SHA1}\x1f1234567\x1f2026-10-24\x1fVidul\x1fF75: explorer\n${SHA2}\x1f89abcde\x1f2026-10-23\x1fAsha\x1fF74: rename\n`
const CH1 = ':100644 100644 aaa bbb M\tmods/a/x.ts\n:000000 100644 000 ccc A\tmods/b.ts\n:100644 000000 ddd 000 D\told.md\n\n3\t1\tmods/a/x.ts\n10\t0\tmods/b.ts\n0\t4\told.md\n'

const SHA3 = 'fedcba9' + 'c'.repeat(33)      // F103: the upstream's commit HEAD has not
const ok = (out: string): RunResult => ({ code: 0, out, err: '', argv: ['git'] })
const gitOut = (args: string[]): RunResult => {
  const a = args.join(' ')
  if (a === LS_ARGS.join(' ')) return ok(FILES)
  if (a === LOG_ARGS.join(' ')) return ok(LOG)
  if (a === UPSTREAM_ARGS.join(' ')) return ok('origin/main\n')
  if (a === COUNT_ARGS.join(' ')) return ok('1\t1\n')
  if (a === INCOMING_ARGS.join(' ')) return ok(`${SHA3}\x1ffedcba9\x1f2026-10-26\x1fAsha\x1fF100: incoming\n`)
  if (a === changeArgs(SHA1).join(' ')) return ok(CH1)
  return { code: 128, out: '', err: 'fatal: bad revision', argv: ['git', ...args] }
}
type GitEffect = Extract<Effect, { kind: 'git' }>
const gits = (es: Effect[]) => es.filter((e): e is GitEffect => e.kind === 'git')
// Every git effect run (and those its results ask for), as the engine would.
function settle(step: Step): State {
  let s = step.state
  const queue = [...step.effects]
  while (queue.length) {
    const e = queue.shift()!
    if (e.kind !== 'git') continue
    const next = afterRun(e, gitOut(e.args), s, 0)
    s = next.state
    queue.push(...next.effects)
  }
  return s
}
const press = (s: State, ...keys: string[]) => keys.reduce((x, k) => settle(reduce(x, { name: k })), s)
const P = { color: false, ascii: false, plain: true }
const text = (s: State) => frame(s, P).join('\n')

test('5 opens Explorer: git ls-files and git log asked as git effects, nothing run through the scripts table', () => {
  const st = reduce(initial(80, 24, 0), { name: '5' })
  assert.equal(st.state.tab, 'explorer')
  assert.deepEqual(gits(st.effects).map(e => e.args), [LS_ARGS, LOG_ARGS, UPSTREAM_ARGS])
  assert.equal(st.effects.filter(e => e.kind === 'run').length, 0)
  assert.match(frame(st.state, P)[0]!, /5 Explorer/)
})

test('the tree: sections start collapsed; enter opens Files, then a folder; counts on every folder', () => {
  let s = press(initial(80, 24, 0), '5')
  assert.match(text(s), /^▸ Files \(4\)$/m)
  assert.match(text(s), /^▸ Commits \(2\) {2}↑1 ↓1 vs origin\/main$/m)
  s = press(s, 'return')
  assert.match(text(s), /^▾ Files \(4\)$/m)
  assert.match(text(s), /^ {2}▸ mods\/ \(3\)$/m)
  assert.match(text(s), /^ {4}README\.md$/m)
  s = press(s, 'down', 'return')                               // mods/
  assert.match(text(s), /^ {4}▸ a\/ \(2\)$/m)
  assert.match(text(s), /^ {6}b\.ts$/m)
  assert.match(text(s), /↑↓ move · enter open\/close · r reload · q quit/)
})

test('the commits: one opens to its files with A/M/D and +/- counts, read only when opened; closing drops them', () => {
  let s = press(initial(80, 24, 0), '5', 'down', 'return')     // the Commits section
  assert.match(text(s), /^ {2}▸ 1234567 {2}2026-10-24 {2}F75: explorer$/m)
  const st = reduce(press(s, 'down'), { name: 'return' })
  assert.deepEqual(gits(st.effects).map(e => e.args), [changeArgs(SHA1)])
  s = settle(st)
  assert.match(text(s), /^ {6}M {2}mods\/a\/x\.ts {2}\+3 -1$/m)
  assert.match(text(s), /^ {6}A {2}mods\/b\.ts {2}\+10 -0$/m)
  assert.match(text(s), /^ {6}D {2}old\.md {2}\+0 -4$/m)
  s = press(s, 'return')
  assert.doesNotMatch(text(s), /mods\/a\/x\.ts/)
  assert.deepEqual(Object.keys(s.explorer.x.changes), [])
})

test('git failing is said in the tab; r reads again with the board', () => {
  let s = settle({ state: initial(80, 24, 0), effects: [] })
  s = { ...s, tab: 'explorer' }
  const st = reduce(s, { name: 'r' })
  assert.deepEqual(st.effects.filter(e => e.kind === 'poll').map(e => (e as { what: string }).what), ['board', 'slow'])
  assert.deepEqual(gits(st.effects).map(e => e.args), [LS_ARGS, LOG_ARGS, UPSTREAM_ARGS])
  const failed = afterRun(gits(st.effects)[0]!, { code: 128, out: '', err: 'fatal: not a git repository\n', argv: [] }, s, 0).state
  assert.match(text(failed), /git ls-files failed: fatal: not a git repository/)
})

test('fits 80, 60 and 40 columns with folders and a commit open', () => {
  for (const cols of [80, 60, 40]) {
    const s = press({ ...initial(cols, 24, 0) }, '5', 'return', 'down', 'return', 'down', 'down', 'down', 'return', 'down', 'return')
    const f = frame(s, P)
    assert.equal(f.length, 24)
    for (const l of f) assert.ok(cells(l) <= cols, `${cells(l)} > ${cols}: ${l}`)
  }
})

// A154: cleaned where git's output is parsed, so the cut is measured on the text drawn.
test('a long file name or subject with an ESC and a CR is cut to the width of any other', () => {
  const long = (c: string) => c.repeat(60)
  const files = `${long('a')}.ts\0b\x1b\r${long('b')}.ts\0`
  const log = `${SHA1}\x1f1234567\x1f2026-10-24\x1fV\x1f${long('c')}\n${SHA2}\x1f89abcde\x1f2026-10-23\x1fA\x1fd\x1b\r${long('d')}\n`
  const key = (s: State, name: string): State => {
    const step = reduce(s, { name })
    let x = step.state
    for (const e of gits(step.effects)) x = afterRun(e, ok(e.args === LS_ARGS ? files : log), x, 0).state
    return x
  }
  const s = ['5', 'return', 'down', 'down', 'down', 'return'].reduce(key, initial(40, 24, 0))   // Files, then Commits open
  const rows = text(s).split('\n')
  const width = (re: RegExp) => rows.filter(l => re.test(l)).map(l => cells(l))
  const [a, b] = width(/^ {4}[ab]{5}/)
  assert.equal(b, a)
  const [c, d] = width(/2026-10-2[34] {2}[cd]{5}/)
  assert.equal(d, c)
})

const hostOf = (git?: Host['git']): Host => ({
  win: false, skillsDir: null, repoRoot: '/r',
  async run() { return { code: 127, out: '', err: 'not here', argv: [] } },
  async stat() { return null },
  async read(p) { throw new Error('no ' + p) },
  gitEmail: async () => null,
  ...(git ? { git } : {}),
})

test('the engine runs git effects through the host (--once too: git only reads)', async () => {
  const asked: string[][] = []
  const host = hostOf(async args => { asked.push(args); return gitOut(args) })
  const engine = makeEngine({ host, email: null, once: true, state: { ...initial(80, 24, 0), tab: 'explorer' }, onChange: () => {}, onQuit: () => {} })
  await engine.readAll()
  assert.deepEqual(asked, [LS_ARGS, LOG_ARGS, UPSTREAM_ARGS, COUNT_ARGS, INCOMING_ARGS])
  assert.match(text(engine.state), /▸ Files \(4\)/)
  const none = makeEngine({ host: hostOf(), email: null, once: true, state: { ...initial(80, 24, 0), tab: 'explorer' }, onChange: () => {}, onQuit: () => {} })
  await none.readAll()
  assert.match(text(none.state), new RegExp(NO_GIT.replace(/[()]/g, '\\$&')))
})

// F103: read-only here - the upstream's ahead/behind and the incoming commits, no actions.
test('F103 ahead/behind vs the upstream and the incoming commits, read-only; no upstream said', () => {
  let s = settle(reduce(initial(80, 24, 0), { name: '5' }))
  assert.match(text(s), /↑1 ↓1 vs origin\/main/)
  assert.match(text(s), /^▸ Incoming \(1\)$/m)
  s = press(s, 'down', 'down', 'return')                          // Files, Commits, Incoming
  assert.match(text(s), /^ {2}▸ fedcba9 {2}2026-10-26 {2}F100: incoming$/m)
  assert.match(text(s), /↑↓ move · enter open\/close · r reload · q quit/)
  const st = reduce(initial(80, 24, 0), { name: '5' })
  let n = st.state
  for (const e of gits(st.effects)) {
    n = afterRun(e, e.args === UPSTREAM_ARGS ? { code: 128, out: '', err: 'fatal: no upstream configured\n', argv: [] } : gitOut(e.args), n, 0).state
  }
  assert.match(text(n), /^▸ Commits \(2\) {2}no upstream$/m)
  assert.doesNotMatch(text(n), /git rev-parse failed/)
})

// A159: as the pane - an upstream read failing other than 128 leaves no stale counts or Incoming.
test('A159 an upstream read failing (not 128) clears the counts and Incoming', () => {
  const s = settle(reduce(initial(80, 24, 0), { name: '5' }))
  assert.match(text(s), /↑1 ↓1 vs origin\/main/)
  const st = reduce(s, { name: 'r' })
  let n = st.state
  for (const e of gits(st.effects)) {
    n = afterRun(e, e.args === UPSTREAM_ARGS ? { code: 1, out: '', err: 'fatal: something else\n', argv: [] } : gitOut(e.args), n, 0).state
  }
  assert.match(text(n), /^▸ Commits \(2\)$/m)
  assert.doesNotMatch(text(n), /Incoming/)
})

test('--tab explorer is a tab the app opens on', () => {
  assert.equal(parseArgs(['--tab', 'explorer'], {}).tab, 'explorer')
})

// A164: use real Git to distinguish an unborn branch from detached HEAD.
test('A164 shared branch query works before the first commit and identifies detached HEAD safely', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { spawnSync } = await import('node:child_process')
  const { BRANCH_ARGS, EMPTY, planAction } = await import('../../hooks/lib/explorer')
  const repo = mkdtempSync(join(tmpdir(), 'ops-a164-'))
  const run = (...args: string[]) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' })
  try {
    assert.equal(run('init', '-b', 'main').status, 0)
    const unborn = run(...BRANCH_ARGS)
    assert.equal(unborn.status, 0, unborn.stderr)
    assert.equal(unborn.stdout.trim(), 'main')
    assert.equal(run('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-m', 'initial').status, 0)
    assert.equal(run('checkout', '--detach').status, 0)
    const detached = run(...BRANCH_ARGS)
    assert.equal(detached.status, 0, detached.stderr)
    assert.equal(detached.stdout.trim(), '')
    assert.match((planAction(EMPTY, 'push', { branch: detached.stdout.trim() || 'HEAD', head: '', root: repo, dirty: 0 }) as { refused: string }).refused, /HEAD is detached/)
  } finally { rmSync(repo, { recursive: true, force: true }) }
})
