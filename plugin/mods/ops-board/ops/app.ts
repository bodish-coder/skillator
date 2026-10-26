// The ops app's entry (design D5): flags, the terminal, the main loop. The only file of
// ops/ that touches the terminal: state.ts decides, draw.ts draws, engine.ts runs the
// polls and effects (through nodehost's run), this wires them to the terminal.
//   node --import ./loader.mjs app.ts [--once] [--cols N] [--rows N] [--no-color] [--ascii]
//                                     [--skills <dir>] [--tab tickets|workflows|health|messages|explorer|build]
// F76: --tab workflows is the Workflows tab (state id 'runs'); --tab runs stays an alias.
// F93: --tab build is the Build tab (state id 'run'); --tab run stays an alias, --tab agents opens Workflows.
// --once draws one frame to stdout and exits 0, without raw mode - the smoke test and the
// screenshot helper. It reads only: of the effects the polls ask for it runs relay's
// decision (a read) and nothing else, so it never sets or releases the watchdog hold.
import { emitKeypressEvents } from 'node:readline'
import { writeSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import type { Host } from './nodehost'
import type { Key, State, Tab } from './state'
import type { Paint } from './draw'
import { makeHost } from './nodehost'
import { initial } from './state'
import { frame, paintScreen } from './draw'
import { makeEngine } from './engine'

export type Opts = {
  once: boolean; cols: number | null; rows: number | null; color: boolean; ascii: boolean
  skills: string | null; tab: Tab; error: string | null
}

export const USAGE = 'usage: ops [repo-dir] [--once] [--cols N] [--rows N] [--no-color] [--ascii] [--skills <dir>] [--tab tickets|workflows|health|messages|explorer|build]'
// F89: --help prints this and exits 0. --open is the launchers' (ops.sh / ops.ps1), never the app's.
export const HELP = USAGE + '\n'
  + '  launcher: ops [repo-dir] --open   (ops.ps1: -Open) the board in a new tab of the current\n'
  + '            Windows Terminal window when wt.exe is on PATH, else here as without it\n'
  + '  NO_COLOR or --no-color drops the colours only; bold, inverse and the › marker stay'
const TAB_WORDS: Record<string, Tab> = { tickets: 'tickets', workflows: 'runs', runs: 'runs', agents: 'runs', health: 'health', messages: 'messages', explorer: 'explorer', build: 'run', run: 'run' }

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
        const tab = v && Object.hasOwn(TAB_WORDS, v) ? TAB_WORDS[v] : undefined
        if (tab) o.tab = tab
        else o.error = `ops: --tab is one of tickets, workflows, health, messages, explorer, build, got ${v ?? 'nothing'}`
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

// The tab bar's "ops · <repo>": the repo root's basename.
export const repoName = (root: string): string | null => root.split('/').filter(Boolean).pop() ?? null

export async function main(argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) { process.stdout.write(HELP + '\n'); return 0 }
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
  // --once without colour is read as text (pipes, tests, screenshots): no SGR at all
  const paint: Paint = { color: opts.color, ascii: opts.ascii, plain: once && !opts.color }
  const size = () => ({ cols: opts.cols ?? (out.isTTY && out.columns ? out.columns : 80), rows: opts.rows ?? (out.isTTY && out.rows ? out.rows : 24) })
  const sz = size()
  const state: State = { ...initial(sz.cols, sz.rows, Date.now()), tab: opts.tab, repo: repoName(host.repoRoot) }
  const email = await host.gitEmail()

  let live = false
  const draw = () => { if (live) out.write(paintScreen(frame({ ...engine.state, now: Date.now() }, paint))) }
  const engine = makeEngine({ host, email, envMe: process.env.SKILLATOR_ME ?? null, once, state, onChange: draw, onQuit: () => quit(0) })

  if (!stdin) {
    await engine.readAll()
    out.write(frame({ ...engine.state, now: Date.now() }, paint).join('\n') + '\n')
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
    if (k) void engine.key(k)
  })
  out.on('resize', () => {
    const z = size()
    engine.resize(z.cols, z.rows)
    writeSync(out.fd, '\x1b[2J')
    draw()
  })

  await engine.start()
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
