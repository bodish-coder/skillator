import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initial, reduce, afterRun } from '../state'
import type { Effect, State, Step } from '../state'
import { frame, cells } from '../draw'
import { makeEngine } from '../engine'
import { parseArgs } from '../app'
import type { Host, RunResult } from '../nodehost'
import {
  abortConflictArgs, ACTION_ARGS, auditOutgoing, beginActionRun, boundOutput, buildConflictResolutionPlan,
  canRunSwitch, canShutdownExplorer, changeArgs, COUNT_ARGS, detectUnwanted, draftCommitMessage, EMPTY,
  findUntrackedSwitchBlockers, finishActionRun, formatGitFailure, INCOMING_ARGS, isActionRunning, LOG_ARGS,
  LS_ARGS, MAX_DIFF_BYTES, NO_GIT, OUT_TAIL_MAX, parseStatus, pickBranch, planAction, reviewStagedCommit,
  reviewStagedCommitAsync, reviewSyncChanges, stageArgs, stagedSignature, STATUS_ARGS, summarizeIncoming,
  unstageArgs, UPSTREAM_ARGS, verifyCommitPreconditions, withUpstream, withWorktree,
} from '../../hooks/lib/explorer'
import {
  abortExplorerConflict, editExplorerCommitMessage, executeExplorerAction, pickExplorerBranch, planExplorerAction,
} from '../explorer'

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
  if (a === STATUS_ARGS.join(' ')) return ok('')
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
  assert.deepEqual(gits(st.effects).map(e => e.args), [STATUS_ARGS, LS_ARGS, LOG_ARGS, UPSTREAM_ARGS])
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
  assert.match(text(s), /^\[↑↓ move\] · \[enter open\/close\] · \[r reload\] · \[q quit\]$/m)
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
  assert.deepEqual(gits(st.effects).map(e => e.args), [STATUS_ARGS, LS_ARGS, LOG_ARGS, UPSTREAM_ARGS])
  const failed = afterRun(gits(st.effects)[1]!, { code: 128, out: '', err: 'fatal: not a git repository\n', argv: [] }, s, 0).state
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
  assert.deepEqual(asked, [STATUS_ARGS, LS_ARGS, LOG_ARGS, UPSTREAM_ARGS, COUNT_ARGS, INCOMING_ARGS])
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
  assert.match(text(s), /^\[↑↓ move\] · \[enter open\/close\] · \[r reload\] · \[q quit\]$/m)
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

// F133: Working tree changes, staging, and AI commit / digest helpers
test('F133: changes section shows staged and unstaged files with warnings, space toggles staging', () => {
  const STATUS_SAMPLE = 'M  staged-file.ts\n M unstaged-file.ts\n?? .env.local\n'
  const gitOutWithStatus = (args: string[]): RunResult => {
    const a = args.join(' ')
    if (a === STATUS_ARGS.join(' ')) return ok(STATUS_SAMPLE)
    return gitOut(args)
  }
  const customSettle = (step: Step): State => {
    let s = step.state
    const queue = [...step.effects]
    while (queue.length) {
      const e = queue.shift()!
      if (e.kind !== 'git') continue
      const next = afterRun(e, gitOutWithStatus(e.args), s, 0)
      s = next.state
      queue.push(...next.effects)
    }
    return s
  }
  let s = customSettle(reduce(initial(80, 24, 0), { name: '5' }))
  assert.match(text(s), /^▸ Changes \(3\)  staged 1 · unstaged 2$/m)
  s = customSettle(reduce(s, { name: 'return' }))
  assert.match(text(s), /^▾ Changes \(3\)  staged 1 · unstaged 2$/m)
  assert.match(text(s), /● \[M\] staged-file\.ts/)
  assert.match(text(s), /○ \[M\] unstaged-file\.ts/)
  assert.match(text(s), /○ \[\?\] \.env\.local ⚠/)

  // Move down to staged-file.ts and press space to unstage
  const s2 = reduce(s, { name: 'down' })
  const stageStep = reduce(s2.state, { name: 'space' })
  assert.deepEqual(gits(stageStep.effects).map(e => e.args), [unstageArgs('staged-file.ts')])
})

test('F133 AI commit message drafting and change digest helpers', () => {
  const files = parseStatus('M  plugin/mods/ops-board/hooks/explorertab.tsx\n?? .env\n')
  assert.equal(detectUnwanted('.env'), 'environment file (.env)')
  assert.equal(detectUnwanted('id_rsa'), 'credential/private key')
  assert.equal(detectUnwanted('scratch/test.tmp'), 'temporary scratch file')

  const draftWithTicket = draftCommitMessage(files, 'F133')
  assert.match(draftWithTicket, /^F133: update explorertab/)

  const digest = summarizeIncoming([{ sha: SHA1, short: '1234567', date: '2026-10-24', author: 'Vidul', subject: 'feat: add git workbench' }])
  assert.match(digest[0]!, /1 new commit from upstream/)
  assert.match(digest[1]!, /• 1234567 feat: add git workbench \(Vidul\)/)

  const audit = auditOutgoing('1234567 wip: temp fix\n89abcde fixup! prev commit\n')
  assert.equal(audit.count, 2)
  assert.equal(audit.warnings.length, 2)
  assert.match(audit.warnings[0]!, /temporary or WIP/)
  assert.match(audit.warnings[1]!, /fixup\/squash/)
})

// A195: NUL-delimited status parsing, special paths, renames, and stage failure reporting
test('A195: STATUS_ARGS uses -z and parseStatus preserves spaces, arrows, quotes, Unicode, and renames', () => {
  assert.ok(STATUS_ARGS.includes('-z'))
  assert.deepEqual(parseStatus('M  a.ts\n'), [{ path: 'a.ts', staged: 'M', unstaged: null, isUntracked: false }])

  // NUL-delimited porcelain v1 output: R has destination first, then source NUL-separated; literal " -> " in non-rename path is kept intact
  const nulOut = [
    'M   leading and trailing.ts ',
    '?? file -> with -> arrow.ts',
    'A  "quoted-name".ts',
    'M  café-🚀.ts',
    'R  renamed new.ts',
    'renamed old.ts',
    '',
  ].join('\0')
  const parsed = parseStatus(nulOut)
  assert.equal(parsed.length, 5)
  assert.equal(parsed[0]!.path, ' leading and trailing.ts ')
  assert.equal(parsed[1]!.path, 'file -> with -> arrow.ts')
  assert.equal(parsed[2]!.path, '"quoted-name".ts')
  assert.equal(parsed[3]!.path, 'café-🚀.ts')
  assert.equal(parsed[4]!.path, 'renamed new.ts')
  assert.equal(parsed[4]!.from, 'renamed old.ts')

  // stageArgs / unstageArgs include both source and destination on rename
  assert.deepEqual(stageArgs(parsed[0]!), ['add', '--', ' leading and trailing.ts '])
  assert.deepEqual(stageArgs(parsed[4]!), ['add', '--', 'renamed old.ts', 'renamed new.ts'])
  assert.deepEqual(unstageArgs(parsed[4]!), ['reset', 'HEAD', '--', 'renamed old.ts', 'renamed new.ts'])

  // Failed git add/reset surfaces error on Explorer state while still refreshing status
  const STATUS_NUL = 'M  staged.ts\0'
  let s = initial(80, 24, 0)
  s = { ...s, tab: 'explorer', explorer: { ...s.explorer, x: withWorktree({ ...s.explorer.x, open: ['xs:changes'], selected: 'xw:staged.ts' }, parseStatus(STATUS_NUL)) } }
  const step = reduce(s, { name: 'space' })
  assert.deepEqual(gits(step.effects).map(e => e.args), [unstageArgs('staged.ts')])
  const afterFail = afterRun(gits(step.effects)[0]!, { code: 128, out: '', err: 'fatal: Unable to create .git/index.lock', argv: ['git'] }, step.state, 0)
  assert.match(afterFail.state.explorer.x.error ?? '', /git stage failed: fatal: Unable to create \.git\/index\.lock/)
  assert.deepEqual(gits(afterFail.effects).map(e => e.args), [STATUS_ARGS])
})

// F151: AI-assisted commit flow, honest local fallback, secret detection, diff truncation, and precondition verification
test('F151: reviewStagedCommit handles host AI delegate, honest local fallback, secret detection, and verifyCommitPreconditions', async () => {
  const wt = parseStatus('M  src/index.ts\0A  .env.production\0')
  const x = withWorktree(EMPTY, wt)
  const bigDiff = '+const token = "ghp_1234567890abcdefghijklmnopqrstuv";\n' + 'x'.repeat(MAX_DIFF_BYTES + 100)

  // Without delegate: honest 'unavailable' status, secret + unwanted file + truncation findings
  const localReview = reviewStagedCommit(x, { diff: bigDiff, ticketId: 'F151', instructions: 'keep concise' })
  assert.equal(localReview.status, 'unavailable')
  assert.equal(localReview.source, 'deterministic-local')
  assert.equal(localReview.truncated, true)
  assert.ok(localReview.findings.some(f => f.includes('.env.production')))
  assert.ok(localReview.findings.some(f => f.includes('secret or private key')))
  assert.ok(localReview.findings.some(f => f.includes('truncated')))
  assert.ok(localReview.findings.some(f => f.includes('active-host AI delegate unavailable')))
  assert.match(localReview.draftMessage ?? '', /^F151: update index and 1 other files \(keep concise\)$/)

  // With active-host AI delegate
  const hostReview = await reviewStagedCommitAsync(x, {
    diff: '+const a = 1;\n',
    ticketId: 'F151',
    delegate: {
      hostName: 'claude-host',
      reviewCommit: ctx => ({
        status: 'ready',
        source: 'claude-host',
        findings: [`Reviewed ${ctx.stagedFiles.length} staged files`],
        draftMessage: 'F151: refine staged commit flow',
      }),
    },
  })
  assert.equal(hostReview.status, 'ready')
  assert.equal(hostReview.source, 'claude-host')
  assert.equal(hostReview.draftMessage, 'F151: refine staged commit flow')
  assert.ok(hostReview.findings.some(f => f.includes('Reviewed 2 staged files')))

  // Preconditions check: stagedSig drift, empty staged set, HEAD moved
  const sig = stagedSignature(wt, '+const a = 1;\n')
  const plan = {
    kind: 'commit' as const,
    args: ['commit', '-m', 'F151: test'],
    warn: [],
    pick: null,
    result: null,
    branch: 'main',
    head: SHA1,
    stagedSig: sig,
  }
  assert.equal(verifyCommitPreconditions(plan, SHA1, 'main', wt, '+const a = 1;\n'), null)
  assert.match(verifyCommitPreconditions(plan, SHA1, 'main', wt, '+const a = 2;\n') ?? '', /staged files changed/)
  assert.match(verifyCommitPreconditions(plan, SHA2, 'main', wt, '+const a = 1;\n') ?? '', /HEAD moved/)
  assert.match(verifyCommitPreconditions(plan, SHA1, 'main', []) ?? '', /no staged files/)
})

// F152: AI incoming and outgoing sync change analysis
test('F152: reviewSyncChanges preserves source/target refs, handles no-upstream, deterministic fallback, and host delegate', () => {
  const noUp = reviewSyncChanges(withUpstream(EMPTY, null, null), 'pull')
  assert.equal(noUp.status, 'unavailable')
  assert.equal(noUp.source, 'no-upstream')

  let x = withUpstream(EMPTY, 'origin/main', '1\t1')
  x = { ...x, incoming: [{ sha: SHA3, short: 'fedcba9', date: '2026-10-26', author: 'Asha', subject: 'F152: sync' }] }

  const fallback = reviewSyncChanges(x, 'push', {
    outgoingRaw: '1234567 wip: debug logging\n',
    diff: 'a'.repeat(MAX_DIFF_BYTES + 50),
  })
  assert.equal(fallback.status, 'fallback')
  assert.equal(fallback.source, 'deterministic-fallback')
  assert.equal(fallback.truncated, true)
  assert.ok(fallback.summary?.some(s => s.includes('HEAD ↔ origin/main')))
  assert.ok(fallback.findings.some(f => f.includes('WIP')))
  assert.ok(fallback.findings.some(f => f.includes('deterministic fallback')))

  const delegated = reviewSyncChanges(x, 'sync', {
    outgoingRaw: '1234567 feat: clean commit\n',
    delegate: {
      hostName: 'agy-host',
      reviewSync: ctx => ({
        status: 'ready',
        source: 'agy-host',
        summary: [`${ctx.direction}: ${ctx.sourceRef} -> ${ctx.targetRef}`],
        findings: ['No conflict risk detected'],
      }),
    },
  })
  assert.equal(delegated.status, 'ready')
  assert.equal(delegated.source, 'agy-host')
  assert.ok(delegated.summary?.includes('both: HEAD -> origin/main'))
})

// F153: Conflict resolution handoff (/skillator:merge-smith) and abort workflow
test('F153: buildConflictResolutionPlan and abortConflictArgs produce explicit merge-smith handoff and abort commands', () => {
  assert.deepEqual(abortConflictArgs('merge'), ['merge', '--abort'])
  assert.deepEqual(abortConflictArgs('revert'), ['revert', '--abort'])
  assert.deepEqual(abortConflictArgs('rebase'), ['rebase', '--abort'])

  const wt = parseStatus('UU src/conflict.ts\0M  src/clean.ts\0')
  const x = withWorktree(EMPTY, wt)
  const plan = {
    kind: 'merge' as const,
    args: ['merge', '--no-edit', '--', 'feature/x'],
    warn: [],
    pick: null,
    result: 'CONFLICT',
    branch: 'main',
    head: SHA1,
    conflictAi: true,
  }
  const res = buildConflictResolutionPlan(x, plan)
  assert.deepEqual(res.conflictedFiles, ['src/conflict.ts'])
  assert.deepEqual(res.abortArgs, ['merge', '--abort'])
  assert.match(res.prompt, /^\/skillator:merge-smith/)
  assert.match(res.prompt, /main/)
  assert.match(res.prompt, /feature\/x/)
  assert.match(res.prompt, /src\/conflict\.ts/)
})

// F154, F155, F156: Standalone Explorer parity, branch switching, and execution guards/diagnostics
test('F155: branch switching planAction, pickBranch, findUntrackedSwitchBlockers, and canRunSwitch guards', () => {
  assert.deepEqual(ACTION_ARGS.switch('feature/b'), ['switch', '--', 'feature/b'])
  assert.deepEqual(ACTION_ARGS.switch(EMPTY, { branch: 'feature/b' }), ['switch', '--', 'feature/b'])
  assert.equal(ACTION_ARGS.switch('feature/b').some(a => /force/.test(a)), false)

  const wt = parseStatus('?? collision.ts\0?? safe.ts\0')
  const blockers = findUntrackedSwitchBlockers(wt, ['src/index.ts', 'collision.ts'])
  assert.deepEqual(blockers, ['collision.ts'])

  // Refused when inProgress or no other branches
  const inProg = planAction(EMPTY, 'switch', { branch: 'main', head: SHA1, dirty: 0, inProgress: 'MERGE_HEAD', branches: ['main', 'dev'] })
  assert.ok('refused' in inProg && inProg.refused.includes('MERGE_HEAD'))
  const singleBranch = planAction(EMPTY, 'switch', { branch: 'main', head: SHA1, dirty: 0, branches: ['main'] })
  assert.ok('refused' in singleBranch && singleBranch.refused.includes('no other local branches'))

  // Warns on dirty worktree or untracked blockers and blocks execution via canRunSwitch
  const dirtySwitch = planAction(EMPTY, 'switch', {
    branch: 'main',
    head: SHA1,
    dirty: 1,
    branches: ['main', 'feature/b'],
    untrackedBlockers: blockers,
  })
  assert.ok('action' in dirtySwitch)
  assert.deepEqual(dirtySwitch.action.pick, ['feature/b'])
  assert.equal(canRunSwitch(dirtySwitch.action), 'pick a target branch first.')
  const pickedDirty = pickBranch(dirtySwitch.action, 'feature/b')
  assert.deepEqual(pickedDirty.args, ['switch', '--', 'feature/b'])
  assert.match(canRunSwitch(pickedDirty) ?? '', /cannot switch branches with uncommitted or conflicting untracked files/)

  // Clean switch allowed
  const cleanSwitch = planAction(EMPTY, 'switch', { branch: 'main', head: SHA1, dirty: 0, branches: ['main', 'feature/b'] })
  assert.ok('action' in cleanSwitch)
  const pickedClean = pickBranch(cleanSwitch.action, 'feature/b')
  assert.equal(canRunSwitch(pickedClean), null)
})

test('F154 & F156: standalone Explorer action flow, bounded diagnostics, duplicate-run guard, and shutdown guard', () => {
  // F156: boundOutput and formatGitFailure
  const huge = 'line1\n' + 'x'.repeat(OUT_TAIL_MAX + 500) + '\nlast-line'
  const bounded = boundOutput(huge)
  assert.ok(bounded.length <= OUT_TAIL_MAX)
  assert.ok(bounded.startsWith('line1'))
  assert.ok(bounded.endsWith('last-line'))

  const timeoutFail = formatGitFailure('push', ['push', 'origin', 'HEAD:refs/heads/main'], {
    code: null,
    err: 'git push timed out after 120s',
    timedOut: true,
  })
  assert.equal(timeoutFail.uncertain, true)
  assert.match(timeoutFail.summary, /index\.lock/)
  assert.match(timeoutFail.details, /Outcome uncertain/)

  // F154: standalone commit plan, message edit, execution, and conflict abort
  let s = initial(80, 24, 1000)
  const wt = parseStatus('M  src/app.ts\0')
  s = { ...s, tab: 'explorer', explorer: { ...s.explorer, x: withUpstream(withWorktree(s.explorer.x, wt), 'origin/main', '0\t0') } }

  s = planExplorerAction(s, 'commit', { branch: 'main', head: SHA1, dirty: 1 }, { diff: '+const x = 1;\n' })
  assert.equal(s.explorer.action?.kind, 'commit')
  assert.match(text(s), /git commit\?/)

  // Empty commit message is blocked
  s = editExplorerCommitMessage(s, '   ')
  const blockedStep = executeExplorerAction(s, { branch: 'main', sha: SHA1, dirty: 1 })
  assert.equal(blockedStep.effects.length, 0)
  assert.match(blockedStep.state.toast ?? '', /commit message cannot be empty/)

  // Valid commit message runs and guards against duplicate concurrent run or shutdown
  s = editExplorerCommitMessage(s, 'F154: standalone commit')
  const runStep = executeExplorerAction(s, { branch: 'main', sha: SHA1, dirty: 1 }, { currentWorktree: wt, currentDiff: '+const x = 1;\n' })
  assert.equal(isActionRunning(runStep.state.explorer.action), true)
  assert.equal(canShutdownExplorer(runStep.state.explorer.action).ok, false)
  assert.deepEqual(gits(runStep.effects).map(e => e.args), [['commit', '-m', 'F154: standalone commit']])

  // Duplicate execute while running is refused
  const dupStep = executeExplorerAction(runStep.state, { branch: 'main', sha: SHA1, dirty: 1 })
  assert.equal(dupStep.effects.length, 0)
  assert.match(dupStep.state.toast ?? '', /already running/)

  // Finish commit -> reloads Explorer
  const afterCommit = afterRun(gits(runStep.effects)[0]!, ok('[main abc1234] F154: standalone commit\n'), runStep.state, 2000)
  assert.equal(afterCommit.state.explorer.action, null)
  assert.match(afterCommit.state.toast ?? '', /✓ git commit -m F154: standalone commit/)

  // Standalone merge conflict -> abortExplorerConflict
  let sMerge = planExplorerAction(afterCommit.state, 'merge', { branch: 'main', head: SHA1, dirty: 0, branches: ['main', 'feature/conflict'] })
  sMerge = pickExplorerBranch(sMerge, 'feature/conflict')
  const mergeStep = executeExplorerAction(sMerge, { branch: 'main', sha: SHA1, dirty: 0 })
  const afterConflict = afterRun(
    gits(mergeStep.effects)[0]!,
    { code: 1, out: 'CONFLICT (content): Merge conflict in src/app.ts\n', err: 'Automatic merge failed\n', argv: ['git'] },
    mergeStep.state,
    3000
  )
  assert.equal(afterConflict.state.explorer.action?.conflictAi, true)
  assert.equal(afterConflict.state.explorer.action?.runState?.status, 'failed')

  const abortStep = abortExplorerConflict(afterConflict.state)
  assert.deepEqual(gits(abortStep.effects).map(e => e.args), [['merge', '--abort']])
  const afterAbort = afterRun(gits(abortStep.effects)[0]!, ok(''), abortStep.state, 4000)
  assert.equal(afterAbort.state.explorer.action, null)
  assert.match(afterAbort.state.toast ?? '', /✓ git merge --abort: aborted/)
})
