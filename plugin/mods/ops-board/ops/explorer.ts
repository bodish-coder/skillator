// F75: the standalone app's Explorer tab - the pane's model (hooks/lib/explorer.ts) on
// the app's state: git ls-files and git log asked as `git` effects (engine.ts runs them
// through the host's absolute git, A150), folded back by their `then`. Pure, as state.ts.
import type { Seg } from './draw'
import { clean } from '../hooks/lib/bandlines'
import type { Action, ActionKind, Explorer, ExplorerAiDelegate, Here, WorkTreeFile } from '../hooks/lib/explorer'
import type { Effect, Key, RunResult, State, Step, Then } from './state'
import {
  abortConflictArgs, ACTION_ARGS, beginActionRun, BRANCH_ARGS, BRANCHES_ARGS, buildConflictResolutionPlan, canRunSwitch,
  changeArgs, COUNT_ARGS, DIFF_CACHED_ARGS, DIRTY_ARGS, EMPTY, explorerLines, explorerOffset, finishActionRun, HEAD_ARGS,
  INCOMING_ARGS, isActionRunning, isSha, LOG_ARGS, LS_ARGS, moveSel, NO_GIT, OUTGOING_ARGS, parseFiles, parseStatus,
  pickBranch, planAction, pushToArgs, reviewStagedCommit, reviewSyncChanges, selectedOf, stageArgs, stagedSignature,
  staleAction, STATUS_ARGS, toggle, unstageArgs, UPSTREAM_ARGS, verifyCommitPreconditions, withActionNotice, withChanges,
  withError, withFiles, withIncoming, withLog, withUpstream, withWorktree,
} from '../hooks/lib/explorer'

// The model, the file list it was drawn from, and the active standalone git action (F154).
export type ExState = { x: Explorer; files: string[] | null; action?: Action | null }
export const EX0: ExState = { x: EMPTY, files: null, action: null }

const git = (args: string[], then: Then): Effect => ({ kind: 'git', args, then })
const setX = (s: State, f: (x: Explorer) => Explorer): State => ({ ...s, explorer: { ...s.explorer, x: f(s.explorer.x) } })
const why = (name: string, r: RunResult) =>
  (r.err === NO_GIT ? NO_GIT : `git ${name} failed: ${r.err.trim() || r.out.trim() || 'exit ' + r.code}`)
// A second failure joins the first, said once.
const addError = (x: Explorer, e: string) => withError(x, x.error && x.error !== e ? `${x.error}; ${e}` : e)

const statusThen: Then = r => s => setX(s, x => (r.code !== 0 ? addError(x, why('status', r)) : withWorktree(x, parseStatus(r.out))))

// A195: surface non-zero stage/unstage exit codes instead of dropping them, then refresh status.
const stageThen: Then = r => s => {
  const next = r.code !== 0
    ? setX(s, x => {
        const msg = why('stage', r)
        return withActionNotice(addError(x, msg), msg)
      })
    : setX(s, x => withActionNotice(x, null))
  return { state: next, effects: [git(STATUS_ARGS, statusThen)] }
}

const filesThen: Then = r => s => {
  if (r.code !== 0) return setX(s, x => withError(x, why('ls-files', r)))
  const files = parseFiles(r.out)
  return { ...s, explorer: { ...s.explorer, files, x: withError(withFiles(s.explorer.x, files), null) } }
}
const logThen: Then = r => s => setX(s, x => (r.code !== 0 ? addError(x, why('log', r)) : withLog(x, r.out)))
const changesThen = (sha: string): Then => r => s => setX(s, x => (r.code !== 0 ? addError(x, why('log', r)) : withChanges(x, sha, r.out)))

// F103: the upstream: exit 128 is none, another failure leaves it unread; known, its ahead/behind and incoming commits follow.
const countThen = (name: string): Then => r => s => setX(s, x => withUpstream(x, name, r.code === 0 ? r.out : null))
const incomingThen: Then = r => s => (r.code === 0 ? setX(s, x => withIncoming(x, r.out)) : s)
const upstreamThen: Then = r => s => {
  if (r.code === 128) return setX(s, x => withUpstream(x, null, null))
  if (r.code !== 0) return setX(s, x => ({ ...x, upstream: null, incoming: null }))   // unread: no stale arrows drawn
  return { state: s, effects: [git(COUNT_ARGS, countThen(r.out.trim())), git(INCOMING_ARGS, incomingThen)] }
}

// Entering the tab and r: the file list and the log read again; open commits' files too.
export function enterExplorer(s: State): Step {
  const shas = Object.keys(s.explorer.x.changes).filter(isSha)
  return { state: s, effects: [git(STATUS_ARGS, statusThen), git(LS_ARGS, filesThen), git(LOG_ARGS, logThen), git(UPSTREAM_ARGS, upstreamThen),
    ...shas.map(sha => git(changeArgs(sha), changesThen(sha)))] }
}

// --- F154 / F151 / F152 / F153 / F155 / F156: standalone Explorer action parity ---

export function planExplorerAction(
  s: State,
  kind: ActionKind,
  here: Here,
  opts?: { delegate?: ExplorerAiDelegate | null; diff?: string; instructions?: string }
): State {
  if (isActionRunning(s.explorer.action)) {
    const msg = `■ git ${s.explorer.action!.kind} is still running`
    return { ...s, toast: msg, explorer: { ...s.explorer, x: withActionNotice(s.explorer.x, msg) } }
  }
  const x = { ...s.explorer.x, selected: selectedOf(s.explorer.x) }
  const p = planAction(x, kind, here)
  if ('refused' in p) {
    const msg = '■ ' + p.refused
    return { ...s, toast: msg, explorer: { ...s.explorer, action: null, x: withActionNotice(s.explorer.x, msg) } }
  }
  let action: Action = p.action
  if (kind === 'commit') {
    const diff = opts?.diff ?? ''
    const aiReview = reviewStagedCommit(x, {
      diff,
      instructions: opts?.instructions,
      ticketId: here.activeTicket,
      delegate: opts?.delegate,
    })
    const message = aiReview.draftMessage ?? action.message ?? ''
    action = {
      ...action,
      message,
      args: ACTION_ARGS.commit(message),
      stagedSig: stagedSignature(x.worktree, diff),
      aiReview,
    }
  } else if (kind === 'pull' || kind === 'push' || kind === 'sync') {
    const aiReview = reviewSyncChanges(x, kind, {
      outgoingRaw: here.outgoing,
      diff: opts?.diff,
      delegate: opts?.delegate,
    })
    action = { ...action, aiReview }
  }
  return { ...s, toast: null, explorer: { ...s.explorer, action } }
}

export function pickExplorerBranch(s: State, branch: string): State {
  const a = s.explorer.action
  if (!a) return s
  return { ...s, explorer: { ...s.explorer, action: pickBranch(a, branch) } }
}

export function editExplorerCommitMessage(s: State, message: string): State {
  const a = s.explorer.action
  if (!a || a.kind !== 'commit') return s
  const trimmed = message.trim()
  return {
    ...s,
    explorer: {
      ...s.explorer,
      action: { ...a, message, args: trimmed ? ACTION_ARGS.commit(trimmed) : [], result: null },
    },
  }
}

const actionDoneThen = (plan: Action): Then => r => cur => {
  const timedOut = r.code === -1 || /timed? ?out/i.test(r.err)
  const finished = finishActionRun(plan, { code: r.code, out: r.out, err: r.err, timedOut }, cur.now)
  if (r.code === 0 && !timedOut) {
    const firstLine = (r.out.trim() || r.err.trim()).split(/\r?\n/)[0] || 'done'
    const msg = `✓ git ${plan.args.join(' ')}: ${firstLine}`
    const next: State = {
      ...cur,
      toast: msg,
      explorer: { ...cur.explorer, action: null, x: withActionNotice(cur.explorer.x, msg) },
    }
    const reload = enterExplorer(next)
    return { state: reload.state, effects: reload.effects }
  }
  const combined = [r.err, r.out].filter(Boolean).join('\n')
  const isConflict = (plan.kind === 'merge' || plan.kind === 'revert' || plan.kind === 'pull' || plan.kind === 'sync') && /CONFLICT/i.test(combined)
  const errMsg = finished.result ?? why(plan.kind, r)
  const updatedAction: Action = isConflict ? { ...finished, conflictAi: true } : finished
  const next: State = {
    ...cur,
    toast: '■ ' + errMsg,
    explorer: {
      ...cur.explorer,
      action: updatedAction,
      x: addError(withActionNotice(cur.explorer.x, errMsg), errMsg),
    },
  }
  const reload = enterExplorer(next)
  return { state: reload.state, effects: reload.effects }
}

export function executeExplorerAction(
  s: State,
  currentHead: { branch: string; sha?: string; head?: string; dirty?: number | boolean } | null,
  opts?: { currentWorktree?: WorkTreeFile[] | null; currentDiff?: string }
): Step {
  const plan = s.explorer.action
  if (!plan) return { state: s, effects: [] }
  if (isActionRunning(plan)) {
    return { state: { ...s, toast: `■ git ${plan.kind} is already running` }, effects: [] }
  }
  if (plan.kind === 'switch') {
    const swErr = canRunSwitch(plan)
    if (swErr) {
      return {
        state: { ...s, toast: '■ ' + swErr, explorer: { ...s.explorer, action: { ...plan, result: swErr } } },
        effects: [],
      }
    }
  }
  if (plan.kind === 'commit') {
    if (!plan.message?.trim() || !plan.args.length) {
      const msgErr = 'commit message cannot be empty.'
      return {
        state: { ...s, toast: '■ ' + msgErr, explorer: { ...s.explorer, action: { ...plan, result: msgErr } } },
        effects: [],
      }
    }
    const headSha = currentHead ? (currentHead.sha ?? currentHead.head ?? '') : null
    const branchName = currentHead ? currentHead.branch : null
    const wt = opts?.currentWorktree !== undefined ? opts.currentWorktree : s.explorer.x.worktree
    const commitErr = verifyCommitPreconditions(plan, headSha, branchName, wt, opts?.currentDiff ?? '')
    if (commitErr) {
      return {
        state: { ...s, toast: `■ ${commitErr}`, explorer: { ...s.explorer, action: null, x: withActionNotice(s.explorer.x, '■ ' + commitErr) } },
        effects: [],
      }
    }
  }
  const stale = staleAction(plan, currentHead)
  if (stale) {
    return {
      state: { ...s, toast: `■ ${stale} - nothing run`, explorer: { ...s.explorer, action: null, x: withActionNotice(s.explorer.x, `■ ${stale} - nothing run`) } },
      effects: [],
    }
  }
  if (!plan.args.length) {
    return { state: { ...s, toast: '■ pick a branch first' }, effects: [] }
  }
  const runningPlan = beginActionRun(plan, s.now)
  const nextState: State = { ...s, explorer: { ...s.explorer, action: runningPlan } }
  return { state: nextState, effects: [git(runningPlan.args, actionDoneThen(runningPlan))] }
}

export function abortExplorerConflict(s: State): Step {
  const plan = s.explorer.action
  const args = abortConflictArgs(plan?.kind ?? 'merge')
  const then: Then = r => cur => {
    if (r.code !== 0) {
      const msg = why(args[0] ?? 'abort', r)
      return {
        ...cur,
        toast: '■ ' + msg,
        explorer: { ...cur.explorer, x: addError(withActionNotice(cur.explorer.x, msg), msg) },
      }
    }
    const msg = `✓ git ${args.join(' ')}: aborted`
    const next: State = {
      ...cur,
      toast: msg,
      explorer: { ...cur.explorer, action: null, x: withActionNotice(withError(cur.explorer.x, null), msg) },
    }
    const reload = enterExplorer(next)
    return { state: reload.state, effects: reload.effects }
  }
  return { state: s, effects: [git(args, then)] }
}

function openActionByKey(s: State, kind: ActionKind): Step {
  if (isActionRunning(s.explorer.action)) {
    return { state: { ...s, toast: `■ git ${s.explorer.action!.kind} is still running` }, effects: [] }
  }
  const thenBranch: Then = brRes => s1 => {
    if (brRes.code !== 0) return setX(s1, x => addError(x, why('branch', brRes)))
    const branch = brRes.out.trim() || 'HEAD'
    return {
      state: s1,
      effects: [
        git(HEAD_ARGS, hdRes => s2 => {
          const head = hdRes.code === 0 ? hdRes.out.trim() : ''
          return {
            state: s2,
            effects: [
              git(DIRTY_ARGS, dtRes => s3 => {
                if (dtRes.code !== 0) return setX(s3, x => addError(x, why('status', dtRes)))
                const dirty = dtRes.out.split(/\r?\n/).filter(Boolean).length
                const baseHere: Here = { branch, head, dirty }
                if (kind === 'merge' || kind === 'switch') {
                  return {
                    state: s3,
                    effects: [
                      git(BRANCHES_ARGS, bListRes => s4 => {
                        const branches = bListRes.code === 0 ? bListRes.out.split(/\r?\n/).filter(Boolean) : []
                        return planExplorerAction(s4, kind, { ...baseHere, branches })
                      }),
                    ],
                  }
                }
                if (kind === 'push' && branch !== 'HEAD') {
                  return {
                    state: s3,
                    effects: [
                      git(pushToArgs(branch), ptRes => s4 => {
                        const [remote = '', ref = ''] = ptRes.code === 0 ? ptRes.out.trim().split('\t') : []
                        return {
                          state: s4,
                          effects: [
                            git(OUTGOING_ARGS, outRes => s5 =>
                              planExplorerAction(s5, kind, {
                                ...baseHere,
                                pushTo: { remote, ref },
                                outgoing: outRes.code === 0 ? outRes.out : undefined,
                              })
                            ),
                          ],
                        }
                      }),
                    ],
                  }
                }
                if (kind === 'commit') {
                  return {
                    state: s3,
                    effects: [
                      git(DIFF_CACHED_ARGS, dfRes => s4 =>
                        planExplorerAction(s4, kind, baseHere, { diff: dfRes.code === 0 ? dfRes.out : '' })
                      ),
                    ],
                  }
                }
                return planExplorerAction(s3, kind, baseHere)
              }),
            ],
          }
        }),
      ],
    }
  }
  return { state: s, effects: [git(BRANCH_ARGS, thenBranch)] }
}

const KEY_TO_ACTION: Record<string, ActionKind> = {
  c: 'commit',
  p: 'pull',
  u: 'push',
  m: 'merge',
  b: 'switch',
  f: 'fetch',
  v: 'revert',
}

export function explorerKey(s: State, k: Key): Step {
  const x = s.explorer.x
  const activeAction = s.explorer.action
  if (activeAction) {
    if (isActionRunning(activeAction)) {
      return { state: { ...s, toast: `■ git ${activeAction.kind} is still running` }, effects: [] }
    }
    if (k.name === 'escape' || k.name === 'n') {
      return { state: { ...s, explorer: { ...s.explorer, action: null } }, effects: [] }
    }
    if (activeAction.conflictAi && activeAction.result) {
      if (k.name === 'a') return abortExplorerConflict(s)
      if (k.name === 'm') {
        const cp = buildConflictResolutionPlan(x, activeAction)
        return {
          state: {
            ...s,
            toast: cp.prompt,
            explorer: { ...s.explorer, action: null, x: withActionNotice(x, cp.prompt) },
          },
          effects: [],
        }
      }
    }
    if (activeAction.pick && activeAction.pick.length > 0 && (k.name === 'return' || k.name === 'enter' || k.name === 'o')) {
      return { state: pickExplorerBranch(s, activeAction.pick[0]!), effects: [] }
    }
    if (k.name === 'y' || k.name === 'return' || k.name === 'enter') {
      const trackedDirty = (x.worktree ?? []).filter(w => !w.isUntracked).length
      return executeExplorerAction(s, { branch: activeAction.branch, sha: activeAction.head, dirty: trackedDirty })
    }
    return { state: s, effects: [] }
  }

  const move = (by: number): Step => {
    const to = moveSel(x, by)
    return { state: to ? setX(s, y => ({ ...y, selected: to })) : s, effects: [] }
  }
  if (k.name in KEY_TO_ACTION && !k.ctrl) {
    return openActionByKey(s, KEY_TO_ACTION[k.name]!)
  }
  switch (k.name) {
    case 'up': case 'k': return move(-1)
    case 'down': case 'j': return move(1)
    case 'space': {
      const sel = selectedOf(x)
      if (sel.startsWith('xw:')) {
        const path = sel.slice(3)
        const f = (x.worktree ?? []).find(w => w.path === path)
        const isStaged = f && f.staged !== null
        const args = isStaged ? unstageArgs(f ?? path) : stageArgs(f ?? path)
        return { state: s, effects: [git(args, stageThen)] }
      }
      return { state: s, effects: [] }
    }
    case 'return': case 'enter': {
      const t = toggle(x, selectedOf(x))
      let state = setX(s, () => t.x)
      const effects: Effect[] = []
      if (t.need.stagePath) {
        const path = t.need.stagePath
        const f = (x.worktree ?? []).find(w => w.path === path)
        const isStaged = f && f.staged !== null
        const args = isStaged ? unstageArgs(f ?? path) : stageArgs(f ?? path)
        effects.push(git(args, stageThen))
      }
      const files = s.explorer.files
      if (t.need.files) {
        if (files) state = setX(state, y => withFiles(y, files))
        else effects.push(git(LS_ARGS, filesThen))
      }
      if (t.need.sha) effects.push(git(changeArgs(t.need.sha), changesThen(t.need.sha)))
      return { state, effects }
    }
    case 'r': {
      const again = enterExplorer(s)
      return { state: s, effects: [{ kind: 'poll', what: 'board' }, { kind: 'poll', what: 'slow' }, ...again.effects] }
    }
    case 'escape': return { state: { ...s, toast: null }, effects: [] }
    default: return { state: s, effects: [] }
  }
}

function actionConfirmSegs(a: Action): Seg[][] {
  const rows: Seg[][] = []
  const statusTag = a.runState?.status === 'running' ? ' (running…)' : ''
  rows.push([
    { text: `git ${a.kind}?${statusTag}`, color: 'suggestion', bold: true },
    { text: a.conflictAi && a.result ? '  [m /skillator:merge-smith] · [a abort] · [esc close]' : '  [y run] · [n/esc cancel]', color: 'permission' },
  ])
  if (a.args.length) {
    rows.push([{ text: '  runs    ', color: 'permission' }, { text: 'git ' + clean(a.args.join(' ')), color: 'suggestion' }])
  } else if (a.pick?.length) {
    rows.push([{ text: '  pick    ', color: 'permission' }, { text: a.pick.map(clean).join(' · '), color: 'suggestion' }])
  }
  rows.push([{ text: '  on      ', color: 'permission' }, { text: clean(a.branch), color: 'warning', bold: true }])
  if (a.message) {
    rows.push([{ text: '  message ', color: 'permission' }, { text: clean(a.message), bold: true }])
  }
  if (a.aiReview) {
    rows.push([{ text: `  review  ${clean(a.aiReview.source)} (${a.aiReview.status})`, color: 'suggestion' }])
    for (const f of (a.aiReview.findings ?? []).slice(0, 2)) {
      rows.push([{ text: '    • ' + clean(f), color: 'warning' }])
    }
  }
  for (const w of a.warn) {
    rows.push([{ text: '  ! ' + clean(w), color: 'warning' }])
  }
  if (a.result) {
    rows.push([{ text: '  ■ ' + clean(a.result), color: 'error' }])
  }
  rows.push([])
  return rows
}

// Control characters out (git's error text can hold them); the window keeps the selection
// in view and says when lines are left below it.
export function explorerBody(s: State, h: number): Seg[][] {
  const x = s.explorer.x
  const prefix = s.explorer.action ? actionConfirmSegs(s.explorer.action) : []
  const remH = Math.max(0, h - prefix.length)
  const lines = explorerLines(x, s.cols).map(l => ({ ...l, segs: l.segs.map(g => ({ ...g, text: clean(g.text), ...(l.item ? { action: { kind: 'row' as const, area: 'explorer' as const, id: l.item } } : {}) })) }))
  if (lines.length <= remH) return [...prefix, ...lines.map(l => l.segs)]
  if (remH <= 1) return [...prefix, ...(remH ? [lines[0]!.segs] : [])].slice(0, h)
  const top = explorerOffset(lines, selectedOf(x), 0, remH - 1) ?? 0
  const shown = lines.slice(top, top + remH - 1).map(l => l.segs)
  const body = top + remH - 1 < lines.length ? [...shown, [{ text: '  …', dim: true }]] : lines.slice(lines.length - remH).map(l => l.segs)
  return [...prefix, ...body]
}
