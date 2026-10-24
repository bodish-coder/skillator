// F75: the standalone app's Explorer tab - the pane's model (hooks/lib/explorer.ts) on
// the app's state: git ls-files and git log asked as `git` effects (engine.ts runs them
// through the host's absolute git, A150), folded back by their `then`. Pure, as state.ts.
import type { Seg } from '../hooks/lib/bandlines'
import type { Explorer } from '../hooks/lib/explorer'
import type { RunResult } from './nodehost'
import type { Effect, Key, State, Step, Then } from './state'
import { changeArgs, EMPTY, explorerLines, explorerOffset, isSha, LOG_ARGS, LS_ARGS, moveSel, NO_GIT, parseFiles, selectedOf,
  toggle, withChanges, withError, withFiles, withLog } from '../hooks/lib/explorer'

// The model, and the file list it was drawn from (no state cap here: kept for folder toggles).
export type ExState = { x: Explorer; files: string[] | null }
export const EX0: ExState = { x: EMPTY, files: null }

const git = (args: string[], then: Then): Effect => ({ kind: 'git', args, then })
const setX = (s: State, f: (x: Explorer) => Explorer): State => ({ ...s, explorer: { ...s.explorer, x: f(s.explorer.x) } })
const why = (name: string, r: RunResult) =>
  (r.err === NO_GIT ? NO_GIT : `git ${name} failed: ${r.err.trim() || r.out.trim() || 'exit ' + r.code}`)
// A second failure joins the first, said once.
const addError = (x: Explorer, e: string) => withError(x, x.error && x.error !== e ? `${x.error}; ${e}` : e)

const filesThen: Then = r => s => {
  if (r.code !== 0) return setX(s, x => withError(x, why('ls-files', r)))
  const files = parseFiles(r.out)
  return { ...s, explorer: { files, x: withError(withFiles(s.explorer.x, files), null) } }
}
const logThen: Then = r => s => setX(s, x => (r.code !== 0 ? addError(x, why('log', r)) : withLog(x, r.out)))
const changesThen = (sha: string): Then => r => s => setX(s, x => (r.code !== 0 ? addError(x, why('log', r)) : withChanges(x, sha, r.out)))

// Entering the tab and r: the file list and the log read again; open commits' files too.
export function enterExplorer(s: State): Step {
  const shas = Object.keys(s.explorer.x.changes).filter(isSha)
  return { state: s, effects: [git(LS_ARGS, filesThen), git(LOG_ARGS, logThen), ...shas.map(sha => git(changeArgs(sha), changesThen(sha)))] }
}

export function explorerKey(s: State, k: Key): Step {
  const x = s.explorer.x
  const move = (by: number): Step => {
    const to = moveSel(x, by)
    return { state: to ? setX(s, y => ({ ...y, selected: to })) : s, effects: [] }
  }
  switch (k.name) {
    case 'up': case 'k': return move(-1)
    case 'down': case 'j': return move(1)
    case 'return': case 'enter': {
      const t = toggle(x, selectedOf(x))
      let state = setX(s, () => t.x)
      const effects: Effect[] = []
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

// Control characters out (a file name can hold them); the window keeps the selection in
// view and says when lines are left below it.
const clean = (t: string) => t.replace(/\t/g, ' ').replace(/[\x00-\x08\x0a-\x1f\x7f-\x9f]/g, '')
export function explorerBody(s: State, h: number): Seg[][] {
  const x = s.explorer.x
  const lines = explorerLines(x, s.cols).map(l => ({ ...l, segs: l.segs.map(g => ({ ...g, text: clean(g.text) })) }))
  if (lines.length <= h) return lines.map(l => l.segs)
  if (h <= 1) return h ? [lines[0]!.segs] : []
  const top = explorerOffset(lines, selectedOf(x), 0, h - 1) ?? 0
  const shown = lines.slice(top, top + h - 1).map(l => l.segs)
  return top + h - 1 < lines.length ? [...shown, [{ text: '  …', dim: true }]] : lines.slice(lines.length - h).map(l => l.segs)
}
