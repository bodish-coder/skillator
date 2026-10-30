// The ops board's loop without a terminal (design D5): the polls, the effects, a key in.
// state.ts decides, this runs what it asks through the Host; whoever draws is told on
// every change (onChange) and reads `state`. The standalone app (app.ts) and the Pi
// extension (../pi) both run this one loop - neither re-implements a poll.
import type { Board, Member } from '../types'
import type { Host, RunResult } from './nodehost'
import { MUTE_FILE, muteKv } from '../hooks/lib/facts'
import type { Effect, Key, PointerAction, State, Step } from './state'
import { onBoard, onInbox, onMachine, onRuns, onUsage, reduce, afterRun, point } from './state'
import { INBOX_FILE, READ_FILE } from '../hooks/lib/inbox'
import { parseBoard } from '../hooks/lib/board'
import { meOf, parseTeam } from '../hooks/lib/team'
import { parseRuns, scriptPathOf } from '../hooks/lib/runs'
import { NO_SCRIPTS } from '../hooks/lib/calls'
import { parseRunFile, RUN_FILE } from '../hooks/lib/runentries'
import type { Bins } from '../hooks/lib/runentries'
import { enterRunEffect, onJobEnd, onJobOut, onRunFile, rescan } from './runtab'
import { NO_GIT } from '../hooks/lib/explorer'
import { enterExplorer } from './explorer'

export type Engine = {
  readonly state: State
  resize(cols: number, rows: number): void
  key(k: Key): Promise<void>
  point(action: PointerAction): Promise<void>
  readAll(): Promise<void>        // one read of each poll: the --once frame's facts
  start(): Promise<void>          // the first board read, then every poll on its timer
  stop(): void                    // the timers off; nothing runs after
}

export type EngineOpts = {
  host: Host
  state: State                    // the first state (size, tab, repo)
  email: string | null            // git's user.email: who "me" is on the team
  envMe?: string | null           // F80: SKILLATOR_ME, overriding the email as ticket-meta whoami does
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
    if (e.kind === 'runfile') return readRunFile(e.scanIfMissing && !once)
    if (e.kind === 'job') return startJob(e.argv, e.cwd)
    if (e.kind === 'stop') { job?.stop(); return }
    if (e.kind === 'git') {                     // F75: read-only, so --once runs it too
      const g = host.git ? await host.git(e.args) : { code: 127, out: '', err: NO_GIT, argv: [] }
      return apply(afterRun(e, g, state, Date.now()))
    }
    if (e.kind === 'mute') {                    // F87: a write, so never in --once
      let r: RunResult = { code: 0, out: '', err: '', argv: [] }
      try {
        if (once) throw new Error('read only (--once)')
        if (!host.write) throw new Error('this host cannot write files')
        await host.write(host.repoRoot + '/' + MUTE_FILE, e.text ? e.text + '\n' : '')
      } catch (err) { r = { ...r, code: 1, err: String((err as Error)?.message ?? err) } }
      if (e.then) await apply(afterRun({ then: e.then }, r, state, Date.now()))
      return
    }
    if (once && e.call !== 'relay-decide') return
    const r = await host.run(e.call, e.args, e.stdin)
    await apply(afterRun(e, e.call === 'pending-machine' ? await withMute(r) : r, state, Date.now()))
  }

  // F87: pending --machine's facts with the mute file's line appended (MUTE=), as the mod does.
  const withMute = async (r: RunResult): Promise<RunResult> => {
    if (r.code !== 0 || !r.out.trim()) return r
    const path = host.repoRoot + '/' + MUTE_FILE
    let text: string | null = null
    try { if (await host.stat(path)) text = await host.read(path) } catch { text = null }
    return { ...r, out: r.out + muteKv(text) }
  }

  // --- F79: the Run tab - run.json read (scanned when absent, through run-entries), one job ---
  let bins: Bins | null = null
  let job: { stop(): void } | null = null
  const readRunFile = async (scanIfMissing: boolean): Promise<void> => {
    const path = host.repoRoot + '/' + RUN_FILE
    let st: Awaited<ReturnType<typeof host.stat>>
    try { st = await host.stat(path) } catch (err) {   // an unreadable .skillator: said on the tab, never a dropped rejection
      state = onRunFile(state, { path, entries: [], error: `${RUN_FILE} not read: ${String((err as Error)?.message ?? err)}` }, bins, host.repoRoot)
      draw()
      return
    }
    if (!st && scanIfMissing) return apply(rescan(state))
    if (!bins && host.bins) { try { bins = await host.bins() } catch { bins = null } }
    let f = { path, entries: [], error: `no ${RUN_FILE} - r scans the repo for its entry points` } as ReturnType<typeof parseRunFile>
    if (st && st.size > 1024 * 1024) f = { ...f, error: `${RUN_FILE} is over 1 MiB - not read` }
    else if (st) { try { f = parseRunFile(await host.read(path), path) } catch (err) { f = { ...f, error: `${RUN_FILE} not read: ${String((err as Error)?.message ?? err)}` } } }
    state = onRunFile(state, f, bins, host.repoRoot)
    draw()
  }
  const startJob = async (argv: string[], cwd: string): Promise<void> => {
    if (state.runJob) state = { ...state, runJob: { ...state.runJob, started: Date.now() } }
    if (!host.spawn) { state = onJobEnd(state, null, 'this host cannot run commands', Date.now()); draw(); return }
    const tick = setInterval(draw, 1000)
    job = host.spawn(argv, cwd, text => { state = onJobOut(state, text); draw() }, (code, err) => {
      clearInterval(tick)
      job = null
      state = onJobEnd(state, code, err, Date.now())
      draw()
    })
    draw()
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
    if (moved && board) state = onBoard(state, board, team, meOf(team, email ?? '', o.envMe))
    await pollInbox()
    draw()
  }

  // F66: teams-uhura's inbox and read marker (in the repo's git dir), re-read when either moved.
  let inboxSig = ''
  const pollInbox = async () => {
    const dir = host.inboxDir
    if (!dir) return
    const ist = await host.stat(dir + '/' + INBOX_FILE)
    const rst = await host.stat(dir + '/' + READ_FILE)
    const sig = `${ist ? `${ist.mtimeMs}:${ist.size}` : 'none'}|${rst ? `${rst.mtimeMs}:${rst.size}` : 'none'}`
    if (sig === inboxSig) return
    inboxSig = sig
    let text = '', readId: string | null = null
    if (ist && ist.size <= MAX_READ) { try { text = await host.read(dir + '/' + INBOX_FILE) } catch { text = '' } }
    else if (ist) {
      // too big to read whole: its newest records, through teams-uhura (it reads the tail)
      const r = await host.run('team-inbox-tail', [])
      text = r.code === 0 ? r.out : ''
    }
    if (rst) { try { readId = (await host.read(dir + '/' + READ_FILE)).trim() || null } catch { readId = null } }
    state = onInbox(state, text, readId)
  }

  let chains: Record<string, string> = {}
  let scripts: Record<string, string> = {}     // F85: each run's .workflow.js, read as text
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
    const js: Record<string, string> = {}
    for (let i = 0; i < open.length; i += 2) {
      await Promise.all(open.slice(i, i + 2).map(async run => {
        const c = await host.run('relay-resume', [run.id])
        if (c.code !== 0) return
        next[run.id] = c.out
        const path = scriptPathOf(c.out, host.repoRoot)
        if (path) { try { js[run.id] = await host.read(path) } catch { /* no script: an agents run */ } }
      }))
    }
    chains = next
    scripts = js
    state = onRuns(state, r.out, chains, scripts)
    draw()
  }

  // Machine facts (and the red → hold rule), relay's first open run for the band, usage
  // (and relay's decision on it). On Runs its own poll reads relay.
  const pollSlow = async () => {
    const m = await withMute(await host.run('pending-machine', []))
    if (m.code === 0 && m.out.trim()) await apply(onMachine(state, m.out, Date.now()))
    else if (m.err === NO_SCRIPTS) { setNote(isScriptsNote, `▲ ${NO_SCRIPTS} - no disk, memory, lock, run or usage facts`); draw() }
    if (state.tab !== 'runs') {
      const r = await host.run('relay-list', [])
      if (r.code === 0) { setNote(isRelayNote, null); state = onRuns(state, r.out, chains, scripts) } else relayFailed(r)
      draw()
    }
    const u = await host.run('usage-level', [])
    if (u.code === 0 && u.out.trim()) await apply(onUsage(state, u.out, Date.now()))
  }

  return {
    get state() { return state },
    resize(cols, rows) { if (cols !== state.cols || rows !== state.rows) state = { ...state, cols, rows } },
    key: k => apply(reduce(state, k)),
    point: action => apply(point(state, action)),
    async readAll() {
      await pollBoard()
      await pollSlow()
      if (state.tab === 'runs') await pollRuns()
      if (state.tab === 'explorer') await apply(enterExplorer(state))
      if (state.tab === 'run') await runEffect(enterRunEffect())    // --tab run: read run.json (never scanned in --once)
    },
    async start() {
      draw()
      await guarded('board', () => pollBoard())
      if (stopped) return
      void guarded('slow', pollSlow)
      if (state.tab === 'runs') void guarded('runs', pollRuns)
      if (state.tab === 'explorer') void apply(enterExplorer(state))
      if (state.tab === 'run') void runEffect(enterRunEffect())
      timers.push(setInterval(() => { void guarded('board', () => pollBoard()) }, BOARD_MS))
      timers.push(setInterval(() => { void guarded('slow', pollSlow) }, SLOW_MS))
      timers.push(setInterval(() => { if (state.tab === 'runs') void guarded('runs', pollRuns) }, RUNS_MS))
    },
    stop() {
      stopped = true
      job?.stop()
      for (const t of timers.splice(0)) clearInterval(t)
    },
  }
}
