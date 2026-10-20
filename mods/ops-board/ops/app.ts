// The ops app's entry (design D5): flags, the terminal, the polls, the effects, the main
// loop. The only file of ops/ that touches the terminal or spawns (through nodehost's
// run): state.ts decides, draw.ts draws, this runs them.
//   node --import ./loader.mjs app.ts [--once] [--cols N] [--rows N] [--no-color] [--ascii]
//                                     [--skills <dir>] [--tab tickets|runs|health]
// --once draws one frame to stdout and exits 0, without raw mode - the smoke test and the
// screenshot helper. It reads only: of the effects the polls ask for it runs relay's
// decision (a read) and nothing else, so it never sets or releases the watchdog hold.
import { emitKeypressEvents } from 'node:readline'
import { writeSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import type { Board, Member } from '../types'
import type { Host } from './nodehost'
import type { Effect, Key, State, Step, Tab } from './state'
import type { Paint } from './draw'
import { makeHost } from './nodehost'
import { initial, onBoard, onMachine, onRuns, onUsage, reduce, afterRun } from './state'
import { frame, paintScreen } from './draw'
import { parseBoard } from '../hooks/lib/board'
import { meOf, parseTeam } from '../hooks/lib/team'
import { parseRuns } from '../hooks/lib/runs'
import { NO_SCRIPTS } from '../hooks/lib/calls'

export type Opts = {
  once: boolean; cols: number | null; rows: number | null; color: boolean; ascii: boolean
  skills: string | null; tab: Tab; error: string | null
}

const USAGE = 'usage: ops [repo-dir] [--once] [--cols N] [--rows N] [--no-color] [--ascii] [--skills <dir>] [--tab tickets|runs|health]'
const TABS: Tab[] = ['tickets', 'runs', 'health']

// The flags; the first wrong one is `error` (the launcher has taken the repo dir already).
// NO_COLOR (any non-empty value) turns colour off as --no-color does.
export function parseArgs(argv: string[], env: Record<string, string | undefined> = process.env): Opts {
  const o: Opts = { once: false, cols: null, rows: null, color: !env.NO_COLOR, ascii: false, skills: null, tab: 'tickets', error: null }
  for (let i = 0; i < argv.length && !o.error; i++) {
    const a = argv[i]!
    const value = () => argv[++i]
    const size = (name: string) => {
      const v = value()
      const n = Number(v)
      if (!v || !Number.isInteger(n) || n < 1) { o.error = `ops: ${name} needs a whole number, got ${v ?? 'nothing'}`; return null }
      return n
    }
    switch (a) {
      case '--once': o.once = true; break
      case '--no-color': o.color = false; break
      case '--ascii': o.ascii = true; break
      case '--cols': o.cols = size('--cols'); break
      case '--rows': o.rows = size('--rows'); break
      case '--skills': {
        const v = value()
        if (!v) o.error = 'ops: --skills needs a directory'
        else o.skills = v
        break
      }
      case '--tab': {
        const v = value()
        if (TABS.includes(v as Tab)) o.tab = v as Tab
        else o.error = `ops: --tab is one of ${TABS.join(', ')}, got ${v ?? 'nothing'}`
        break
      }
      default: o.error = `ops: unknown flag ${a}`
    }
  }
  return o
}

type RawKey = { name?: string; shift?: boolean; ctrl?: boolean } | undefined

// A readline keypress as the reducer's Key: readline names 'D' as d + shift, the reducer
// wants 'D' (and 'R'); a character readline does not name is its own name. A printable
// character rides along as `sequence` (the Add person form types it); 'backspace' and
// 'delete' keep readline's names.
export function keyOf(str: string | undefined, key: RawKey): Key | null {
  const one = str !== undefined && [...str].length === 1 ? str : null
  const name = one && /^[A-Z]$/.test(one) ? one : key?.name ?? (one && one >= ' ' ? one : null)
  const printable = one && !key?.ctrl && one >= ' ' && one !== '\x7f' ? one : null
  if (!name) return null
  return printable ? { name, sequence: printable, shift: !!key?.shift, ctrl: !!key?.ctrl } : { name, shift: !!key?.shift, ctrl: !!key?.ctrl }
}

const MAX_READ = 4 * 1024 * 1024
const BOARD_MS = 2000
const SLOW_MS = 60_000
const RUNS_MS = 30_000
const failed = (path: string, error: string): Board => ({ path, mtimeMs: 0, size: 0, tickets: [], error })
const isScriptsNote = (n: string) => n.startsWith(`▲ ${NO_SCRIPTS}`)
const isRelayNote = (n: string) => n.startsWith('▲ relay-morpheus list failed')

export async function main(argv: string[]): Promise<number> {
  const opts = parseArgs(argv)
  if (opts.error) { process.stderr.write(`${opts.error}\n${USAGE}\n`); return 2 }
  const out = process.stdout
  const once = opts.once
  // Touched only when live: --once never opens stdin.
  const stdin = once ? null : process.stdin
  if (stdin && (!stdin.isTTY || typeof stdin.setRawMode !== 'function')) {
    const msys = !!process.env.MSYSTEM
    process.stderr.write('ops needs an interactive terminal (raw keys) - stdin is not one.\n'
      + (msys ? 'In Git Bash (mintty) run it through winpty (ops.sh does when winpty is on PATH), or use Windows Terminal.\n' : '')
      + 'One frame to stdout: --once\n')
    return 2
  }

  const host: Host = await makeHost({ appDir: import.meta.dirname, cwd: process.cwd(), ...(opts.skills ? { skills: opts.skills } : {}) })
  const paint: Paint = { color: opts.color, ascii: opts.ascii }
  const size = () => ({ cols: opts.cols ?? (out.isTTY && out.columns ? out.columns : 80), rows: opts.rows ?? (out.isTTY && out.rows ? out.rows : 24) })
  const sz = size()
  let state: State = { ...initial(sz.cols, sz.rows, Date.now()), tab: opts.tab, repo: host.repoRoot.split('/').filter(Boolean).pop() ?? null }
  const email = await host.gitEmail()

  let live = false
  const draw = () => { if (live) out.write(paintScreen(frame({ ...state, now: Date.now() }, paint))) }
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
    if (e.kind === 'quit') return quit(0)
    if (e.kind === 'poll') return e.what === 'board' ? guarded('board', () => pollBoard(true)) : guarded(e.what, e.what === 'slow' ? pollSlow : pollRuns)
    if (once && e.call !== 'relay-decide') return
    const r = await host.run(e.call, e.args)
    await apply(afterRun(e, r, state, Date.now()))
  }

  // --- polls (as the mod): the board every 2 s, the slow facts every 60 s, the runs
  // every 30 s while on Runs. A failed poll keeps the last facts. One of each at a time. ---
  const busy = new Set<string>()
  const guarded = async (what: string, f: () => Promise<void>) => {
    if (busy.has(what)) return
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
      else if (st.size > MAX_READ) board = failed(path, 'TICKETS.md is over 4 MiB - not read')
      else {
        try { board = parseBoard(await host.read(path), path, st.mtimeMs, st.size) }
        catch { board = failed(path, `no TICKETS.md at ${root}`) }
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

  if (!stdin) {
    await pollBoard()
    await pollSlow()
    if (state.tab === 'runs') await pollRuns()
    out.write(frame({ ...state, now: Date.now() }, paint).join('\n') + '\n')
    return 0
  }

  // --- the terminal: alt screen, hidden cursor, raw keys; restored on every way out ---
  let restored = false
  const restore = () => {
    if (restored) return
    restored = true
    try { stdin.setRawMode(false) } catch { /* already gone */ }
    // Sync: a TTY write is asynchronous on Windows and would be lost at exit.
    try { writeSync(out.fd, '\x1b[0m\x1b[?25h\x1b[?1049l') } catch { /* no terminal left */ }
  }
  const quit = (code: number): never => { restore(); process.exit(code) }
  process.on('exit', restore)
  process.on('uncaughtException', e => { restore(); process.stderr.write(`ops: ${(e as Error)?.stack ?? e}\n`); process.exit(1) })
  process.on('unhandledRejection', e => { restore(); process.stderr.write(`ops: ${(e as Error)?.stack ?? e}\n`); process.exit(1) })
  process.on('SIGINT', () => quit(130))
  process.on('SIGTERM', () => quit(143))
  process.on('SIGHUP', () => quit(129))

  writeSync(out.fd, '\x1b[?1049h\x1b[?25l\x1b[2J')
  live = true
  emitKeypressEvents(stdin)
  stdin.setRawMode(true)
  stdin.setEncoding('utf8')
  stdin.resume()
  stdin.on('keypress', (str: string | undefined, key: RawKey) => {
    const k = keyOf(str, key)
    if (k) void apply(reduce(state, k))
  })
  out.on('resize', () => {
    const z = size()
    state = { ...state, cols: z.cols, rows: z.rows }
    writeSync(out.fd, '\x1b[2J')
    draw()
  })

  draw()
  await guarded('board', () => pollBoard())
  void guarded('slow', pollSlow)
  if (state.tab === 'runs') void guarded('runs', pollRuns)
  setInterval(() => { void guarded('board', () => pollBoard()) }, BOARD_MS)
  setInterval(() => { void guarded('slow', pollSlow) }, SLOW_MS)
  setInterval(() => { if (state.tab === 'runs') void guarded('runs', pollRuns) }, RUNS_MS)
  return new Promise<number>(() => { /* runs until quit */ })
}

// Run when started as the entry (node ... app.ts), not when a test imports it.
// Windows paths compare without case (c:\ and C:\ are one file).
const entryKey = (p: string) => (process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p))
if (process.argv[1] && entryKey(process.argv[1]) === entryKey(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code }, e => {
    process.stderr.write(`ops: ${(e as Error)?.stack ?? e}\n`)
    process.exitCode = 1
  })
}
