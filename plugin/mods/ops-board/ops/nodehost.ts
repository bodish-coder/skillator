// The node binding of the shared lib (design D2, D5): where skillator's scripts live, the
// repo being viewed, and running a call from ../hooks/lib/calls. No Claude Code API here -
// the standalone ops app uses it, and F56 (Pi) takes it as is. argv only, no shell.
import { spawn, execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, stat as fsStat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { argvFor, findExe, findNode, isNodeCall, MARKER, NO_NODE, NO_SCRIPTS, NO_SH, norm, shellFor, systemRoot, up } from '../hooks/lib/calls'
import { findBins } from '../hooks/lib/runentries'
import type { Bins } from '../hooks/lib/runentries'
import type { Call } from '../hooks/lib/calls'
import { NO_GIT } from '../hooks/lib/explorer'

export type RunResult = { code: number; out: string; err: string; argv: string[] }
export type Host = {
  win: boolean
  skillsDir: string | null
  repoRoot: string                                   // main checkout (git-common-dir's parent), else toplevel, else cwd
  run(call: Call, args: string[], stdin?: string): Promise<RunResult> // never rejects; 30 s / 15 s budgets; cwd = repoRoot; stdin (F66) written then closed
  stat(path: string): Promise<{ mtimeMs: number; size: number } | null>
  read(path: string): Promise<string>
  write?(path: string, text: string): Promise<void>  // F87: the watchdog mute file; its folder made as needed
  gitEmail(): Promise<string | null>
  // F79: the Run tab - the programs an entry runs (absolute), and one job: its output as it
  // comes, then its end; stop() kills it with its children. Optional: a host may not run jobs.
  bins?(): Promise<Bins>
  spawn?(argv: string[], cwd: string, onOut: (text: string) => void, onEnd: (code: number | null, err: string | null) => void): { stop(): void }
  git?(args: string[]): Promise<RunResult>         // F75: git <args> by its absolute path (A150), cwd = repoRoot; 15 s
}

type Env = Record<string, string | undefined>

// The skills dir (the directory that contains tickets-zordon/): the first holding the
// marker of $SKILLATOR_ROOT/skills, $SKILLATOR_ROOT (a flat install dest), appDir three up
// + /skills (repo: mods/ops-board/ops), appDir two up (installed: <dest>/ops-board/ops),
// then each installPath + /skills of skillator@skillator in installed_plugins.json under
// $CLAUDE_CONFIG_DIR, else ~/.claude. None: null. A136: never the repo being viewed - any
// repo opened would otherwise have its own scripts run by the polls, unasked.
export function findSkillsDir(appDir: string, env: Env, exists: (p: string) => boolean, readJson: (p: string) => unknown): string | null {
  const has = (d: string) => { try { return exists(d + '/' + MARKER) } catch { return false } }
  const root = env.SKILLATOR_ROOT
  const tries = root ? [norm(root) + '/skills', norm(root)] : []
  tries.push(up(appDir, 3) + '/skills', up(appDir, 2))
  for (const t of tries) if (has(t)) return t
  const home = env.HOME || env.USERPROFILE
  const cfg = env.CLAUDE_CONFIG_DIR ? norm(env.CLAUDE_CONFIG_DIR) : home ? norm(home) + '/.claude' : null
  if (!cfg) return null
  let installed: unknown
  try { installed = readJson(cfg + '/plugins/installed_plugins.json') } catch { return null }
  const entries = (installed as { plugins?: Record<string, unknown> } | null)?.plugins?.['skillator@skillator']
  if (!Array.isArray(entries)) return null
  for (const e of entries) {
    const p = (e as { installPath?: unknown })?.installPath
    if (typeof p === 'string' && p && has(norm(p) + '/skills')) return norm(p) + '/skills'
  }
  return null
}

const readJsonFile = (p: string): unknown => JSON.parse(readFileSync(p, 'utf8'))

const platformWin = () => process.platform === 'win32'
const fileExists = async (p: string) => existsSync(p)

// git's stdout trimmed, or null when git is absent, fails, or prints nothing.
async function git(args: string[], cwd: string): Promise<string | null> {
  const bin = await gitFor(process.env, platformWin(), fileExists)
  if (!bin) return null
  return new Promise(res => {
    try {
      execFile(bin, args, { cwd, windowsHide: true, timeout: 10000 }, (err, out) => {
        const s = String(out ?? '').trim()
        res(err || !s ? null : s)
      })
    } catch { res(null) }
  })
}

// The main checkout from any worktree (as pending.sh's find_main): git-common-dir's
// parent; else the toplevel; else the cwd.
async function findRepoRoot(cwd: string): Promise<string> {
  const common = await git(['rev-parse', '--path-format=absolute', '--git-common-dir'], cwd)
  if (common && /\/\.git$/.test(norm(common))) return norm(common).replace(/\/\.git$/, '')
  const top = await git(['rev-parse', '--show-toplevel'], cwd)
  return norm(top ?? cwd)
}

function spawnArgv(argv: string[], cwd: string, timeoutMs: number, stdin?: string): Promise<RunResult> {
  return new Promise(res => {
    let out = '', err = '', done = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (r: Omit<RunResult, 'argv'>) => { if (done) return; done = true; clearTimeout(timer); res({ ...r, argv }) }
    let child: ReturnType<typeof spawn>
    try { child = spawn(argv[0]!, argv.slice(1), { cwd, windowsHide: true }) }
    catch (e) { finish({ code: -1, out: '', err: String((e as Error)?.message ?? e) }); return }
    timer = setTimeout(() => {
      try { child.kill() } catch { /* already gone */ }
      finish({ code: -1, out, err: 'timed out after ' + timeoutMs / 1000 + ' s' })
    }, timeoutMs)
    child.stdout?.setEncoding('utf8').on('data', (d: string) => { out += d })
    child.stderr?.setEncoding('utf8').on('data', (d: string) => { err += d })
    child.on('error', e => finish({ code: -1, out, err: err + String(e?.message ?? e) }))
    child.on('close', code => finish({ code: code ?? -1, out, err }))
    child.stdin?.on('error', () => { /* the child closed it early */ })
    child.stdin?.end(stdin ?? '')
  })
}

// F79: one Run tab job - argv only, no shell; output piece by piece, then its end. Stop kills
// the tree: taskkill /T by absolute path on Windows (A150), the process group elsewhere.
export function spawnJob(argv: string[], cwd: string, onOut: (text: string) => void, onEnd: (code: number | null, err: string | null) => void): { stop(): void } {
  let done = false
  const end = (code: number | null, err: string | null) => { if (!done) { done = true; onEnd(code, err) } }
  const win = platformWin()
  let child: ReturnType<typeof spawn>
  try { child = spawn(argv[0]!, argv.slice(1), { cwd, windowsHide: true, detached: !win }) }
  catch (e) { queueMicrotask(() => end(null, String((e as Error)?.message ?? e))); return { stop() { /* never started */ } } }
  child.stdout?.setEncoding('utf8').on('data', (d: string) => onOut(d))
  child.stderr?.setEncoding('utf8').on('data', (d: string) => onOut(d))
  child.on('error', e => end(null, String(e?.message ?? e)))
  child.on('close', code => end(code, null))
  child.stdin?.on('error', () => { /* closed early */ })
  child.stdin?.end()
  return {
    stop() {
      if (done || !child.pid) return
      try {
        if (win) execFile(systemRoot(process.env.SystemRoot ?? process.env.SYSTEMROOT) + '/System32/taskkill.exe', ['/T', '/F', '/PID', String(child.pid)], { windowsHide: true }, () => {})
        else process.kill(-child.pid, 'SIGTERM')
      } catch { try { child.kill() } catch { /* gone */ } }
    },
  }
}

// Which spelling of the scripts runs (A142): the .ps1 on Windows, the .sh elsewhere - and
// under Git Bash on Windows too, chosen by the launching shell, not the platform. The
// launcher says which it is (SKILLATOR_OPS_SHELL: ops.sh sets sh, ops.ps1 sets ps1); with
// no launcher word, MSYSTEM (set by Git Bash / MSYS2) means sh. The Claude Code mod
// (hooks/lib/host.ts) keeps the platform: no shell launches it.
export function windowsScripts(env: Env): boolean {
  if (env.OS !== 'Windows_NT') return false
  if (env.SKILLATOR_OPS_SHELL === 'sh') return false
  if (env.SKILLATOR_OPS_SHELL === 'ps1') return true
  return !env.MSYSTEM
}

// F66: the node a node call runs, by absolute path - never a bare `node`, which libuv on
// Windows looks up in the child's cwd (the repo) first. Ruling: this process's own
// binary when it is node (the standalone app, pi on node); otherwise (the Antigravity
// IDE's Electron, a bun-run host) the first node on PATH in an absolute entry; else none.
export async function nodeFor(execPath: string, env: Env, win: boolean, exists: (p: string) => Promise<boolean>): Promise<string | null> {
  if (/(^|[\\/])node(\.exe)?$/i.test(execPath)) return execPath
  return findNode(env.PATH ?? env.Path, win, exists)
}

// A150: the git this host runs (cwd = the repo). Windows: git.exe in the first absolute
// PATH entry holding one, else none - never a bare `git`, which libuv looks up in the cwd
// first. Elsewhere `git` as is (Ruling: execvp searches PATH only, never the cwd, unless
// PATH itself names '.' or an empty entry - the user's own shell does the same there).
export async function gitFor(env: Env, win: boolean, exists: (p: string) => Promise<boolean>): Promise<string | null> {
  return win ? findExe('git', env.PATH ?? env.Path, true, exists) : 'git'
}

// opts.skills (the app's --skills): that dir, or its skills/ child, when it holds the marker.
export async function makeHost(opts: { appDir: string; cwd: string; skills?: string }): Promise<Host> {
  const win = windowsScripts(process.env)
  const has = (d: string) => existsSync(d + '/' + MARKER)
  const skillsDir = opts.skills !== undefined
    ? [norm(opts.skills), norm(opts.skills) + '/skills'].find(has) ?? null
    : findSkillsDir(opts.appDir, process.env, existsSync, readJsonFile)
  const repoRoot = await findRepoRoot(opts.cwd)
  const abs = (p: string) => (isAbsolute(p) ? p : join(repoRoot, p))
  return {
    win, skillsDir, repoRoot,
    async run(call, args, stdin) {
      if (!skillsDir) return { code: 127, out: '', err: NO_SCRIPTS, argv: [] }
      // F66 / A150: node, sh and powershell all by absolute path - never from the repo.
      let bin: string
      if (isNodeCall(call)) {
        const n = await nodeFor(process.execPath, process.env, platformWin(), fileExists)
        if (!n) return { code: 127, out: '', err: NO_NODE, argv: [] }
        bin = n
      } else {
        const env = process.env
        const sh = await shellFor(win, platformWin(), { path: env.PATH ?? env.Path, systemRoot: env.SystemRoot ?? env.SYSTEMROOT }, fileExists)
        if (!sh) return { code: 127, out: '', err: NO_SH, argv: [] }
        bin = sh
      }
      return spawnArgv(argvFor(call, win, skillsDir, args, bin), repoRoot, call === 'pending-machine' ? 15000 : 30000, stdin)
    },
    async stat(path) {
      try { const s = await fsStat(abs(path)); return { mtimeMs: s.mtimeMs, size: s.size } } catch { return null }
    },
    read: path => readFile(abs(path), 'utf8'),
    async write(path, text) { await mkdir(dirname(abs(path)), { recursive: true }); await writeFile(abs(path), text, 'utf8') },
    gitEmail: () => git(['config', 'user.email'], repoRoot),
    bins: async () => {
      const env = process.env
      const node = await nodeFor(process.execPath, env, platformWin(), fileExists)
      return findBins(platformWin(), { path: env.PATH ?? env.Path, systemRoot: env.SystemRoot ?? env.SYSTEMROOT }, fileExists, node)
    },
    spawn: (argv, cwd, onOut, onEnd) => spawnJob(argv, cwd, onOut, onEnd),
    async git(args) {
      const bin = await gitFor(process.env, platformWin(), fileExists)
      if (!bin) return { code: 127, out: '', err: NO_GIT, argv: [] }
      return spawnArgv([bin, ...args], repoRoot, 15000)
    },
  }
}
