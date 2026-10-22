// The ops board's loop without a terminal (design D5): the polls, the effects, a key in.
// state.ts decides, this runs what it asks through the Host; whoever draws is told on
// every change (onChange) and reads `state`. The standalone app (app.ts) and the Pi
// extension (../pi) both run this one loop - neither re-implements a poll.
import type { Board, Member } from '../types'
import type { Host } from './nodehost'
import type { Effect, Key, State, Step } from './state'
import { onBoard, onMachine, onRuns, onUsage, reduce, afterRun } from './state'
import { parseBoard } from '../hooks/lib/board'
import { meOf, parseTeam } from '../hooks/lib/team'
import { parseRuns } from '../hooks/lib/runs'
import { NO_SCRIPTS } from '../hooks/lib/calls'

export type Engine = {
  readonly state: State
  resize(cols: number, rows: number): void
  key(k: Key): Promise<void>
  readAll(): Promise<void>        // one read of each poll: the --once frame's facts
  start(): Promise<void>          // the first board read, then every poll on its timer
  stop(): void                    // the timers off; nothing runs after
}

export type EngineOpts = {
  host: Host
  state: State                    // the first state (size, tab, repo)
  email: string | null            // git's user.email: who "me" is on the team
  once: boolean                   // read only: of the effects the polls ask for, relay's decision (a read) and nothing else
  onChange(): void                // the state moved: draw it
  onQuit(): void                  // the reducer asked to quit
}

const MAX_READ = 4 * 1024 * 1024
const BOARD_MS = 2000
const SLOW_MS = 60_000
const RUNS_MS = 30_000
const failed = (path: string, error: string): Board => ({ path, mtimeMs: 0, size: 0, tickets: [], error })
const isScriptsNote = (n: string) => n.startsWith(`▲ ${NO_SCRIPTS}`)
const isRelayNote = (n: string) => n.startsWith('▲ relay-morpheus list failed')

export function makeEngine(o: EngineOpts): Engine {
  const { host, email, once } = o
  let state = o.state
  let stopped = false
  const timers: ReturnType<typeof setInterval>[] = []
  const draw = () => { if (!stopped) o.onChange() }
  const setNote = (drop: (n: string) => boolean, add: string | null) => {
    const kept = state.notes.filter(n => !drop(n))
    const notes = add ? [...kept, add] : kept
    if (notes.join('\n') !== state.notes.join('\n')) state = { ...state, notes }
  }

  // --- effects: state.ts asks, this runs; a run's result is folded into the state as it
  // then is, and may ask for more ---
  const apply = async (step: Step): Promise<void> => {
    state = step.state
    draw()
    for (const e of step.effects) await runEffect(e)
  }
  const runEffect = async (e: Effect): Promise<void> => {
    if (e.kind === 'quit') { o.onQuit(); return }
    if (e.kind === 'poll') return e.what === 'board' ? guarded('board', () => pollBoard(true)) : guarded(e.what, e.what === 'slow' ? pollSlow : pollRuns)
    if (once && e.call !== 'relay-decide') return
    const r = await host.run(e.call, e.args)
    await apply(afterRun(e, r, state, Date.now()))
  }

  // --- polls (as the mod): the board every 2 s, the slow facts every 60 s, the runs
  // every 30 s while on Runs. A failed poll keeps the last facts. One of each at a time. ---
  const busy = new Set<string>()
  const guarded = async (what: string, f: () => Promise<void>) => {
    if (busy.has(what) || stopped) return
    busy.add(what)
    try { await f() } finally { busy.delete(what) }
  }

  let boardSig = '', teamSig = ''
  let team: Member[] = []
  const pollBoard = async (force = false) => {
    const root = host.repoRoot
    const path = root + '/TICKETS.md'
    const st = await host.stat(path)
    const sig = st ? `${st.mtimeMs}:${st.size}` : 'none'
    let board = state.board
    let moved = false
    if (force || !board || sig !== boardSig) {
      boardSig = sig
      moved = true
      if (!st) board = failed(path, `no TICKETS.md at ${root}`)
      else if (st.size > MAX_READ) board = failed(path, 'TICKETS.md is over 4 MiB - not read; /archive-tickets moves the closed rows out')
      else {
        // there but unreadable is its own error, never "no TICKETS.md" (same as the mod's loadBoard)
        try { board = parseBoard(await host.read(path), path, st.mtimeMs, st.size) }
        catch (e) { board = failed(path, `TICKETS.md not loaded: ${String((e as Error)?.message ?? e)} - /archive-tickets moves the closed rows out`) }
      }
    }
    const teamPath = root + '/.skillator/team.md'
    const tst = await host.stat(teamPath)
    const tsig = tst ? `${tst.mtimeMs}:${tst.size}` : 'none'
    if (force || tsig !== teamSig) {
      teamSig = tsig
      moved = true
      team = []
      if (tst) { try { team = parseTeam(await host.read(teamPath)) } catch { team = [] } }
    }
    if (moved && board) state = onBoard(state, board, team, email ? meOf(team, email) : null)
    draw()
  }

  let chains: Record<string, string> = {}
  const relayFailed = (r: { code: number; err: string; out: string }) => {
    if (r.err === NO_SCRIPTS) return
    setNote(isRelayNote, `▲ relay-morpheus list failed: ${r.err.trim() || r.out.trim() || `exit ${r.code}`}`)
  }

  const pollRuns = async () => {
    const r = await host.run('relay-list', [])
    if (r.code !== 0) { relayFailed(r); draw(); return }
    setNote(isRelayNote, null)
    const open = parseRuns(r.out, {}).filter(x => x.done < x.total)
    const next: Record<string, string> = {}
    for (let i = 0; i < open.length; i += 2) {
      await Promise.all(open.slice(i, i + 2).map(async run => {
        const c = await host.run('relay-chain-status', [run.id])
        if (c.code === 0) next[run.id] = c.out
      }))
    }
    chains = next
    state = onRuns(state, r.out, chains)
    draw()
  }

  // Machine facts (and the red → hold rule), relay's first open run for the band, usage
  // (and relay's decision on it). On Runs its own poll reads relay.
  const pollSlow = async () => {
    const m = await host.run('pending-machine', [])
    if (m.code === 0 && m.out.trim()) await apply(onMachine(state, m.out, Date.now()))
    else if (m.err === NO_SCRIPTS) { setNote(isScriptsNote, `▲ ${NO_SCRIPTS} - no disk, memory, lock, run or usage facts`); draw() }
    if (state.tab !== 'runs') {
      const r = await host.run('relay-list', [])
      if (r.code === 0) { setNote(isRelayNote, null); state = onRuns(state, r.out, chains) } else relayFailed(r)
      draw()
    }
    const u = await host.run('usage-level', [])
    if (u.code === 0 && u.out.trim()) await apply(onUsage(state, u.out, Date.now()))
  }

  return {
    get state() { return state },
    resize(cols, rows) { if (cols !== state.cols || rows !== state.rows) state = { ...state, cols, rows } },
    key: k => apply(reduce(state, k)),
    async readAll() {
      await pollBoard()
      await pollSlow()
      if (state.tab === 'runs') await pollRuns()
    },
    async start() {
      draw()
      await guarded('board', () => pollBoard())
      if (stopped) return
      void guarded('slow', pollSlow)
      if (state.tab === 'runs') void guarded('runs', pollRuns)
      timers.push(setInterval(() => { void guarded('board', () => pollBoard()) }, BOARD_MS))
      timers.push(setInterval(() => { void guarded('slow', pollSlow) }, SLOW_MS))
      timers.push(setInterval(() => { if (state.tab === 'runs') void guarded('runs', pollRuns) }, RUNS_MS))
    },
    stop() {
      stopped = true
      for (const t of timers.splice(0)) clearInterval(t)
    },
  }
}
