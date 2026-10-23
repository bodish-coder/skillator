// The node binding of the shared lib (design D2, D5): where skillator's scripts live, the
// repo being viewed, and running a call from ../hooks/lib/calls. No Claude Code API here -
// the standalone ops app uses it, and F56 (Pi) takes it as is. argv only, no shell.
import { spawn, execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { readFile, stat as fsStat } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { argvFor, MARKER, NO_SCRIPTS, norm, up } from '../hooks/lib/calls'
import type { Call } from '../hooks/lib/calls'

export type RunResult = { code: number; out: string; err: string; argv: string[] }
export type Host = {
  win: boolean
  skillsDir: string | null
  repoRoot: string                                   // main checkout (git-common-dir's parent), else toplevel, else cwd
  run(call: Call, args: string[], stdin?: string): Promise<RunResult> // never rejects; 30 s / 15 s budgets; cwd = repoRoot; stdin (F66) written then closed
  stat(path: string): Promise<{ mtimeMs: number; size: number } | null>
  read(path: string): Promise<string>
  gitEmail(): Promise<string | null>
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

// git's stdout trimmed, or null when git is absent, fails, or prints nothing.
function git(args: string[], cwd: string): Promise<string | null> {
  return new Promise(res => {
    try {
      execFile('git', args, { cwd, windowsHide: true, timeout: 10000 }, (err, out) => {
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
      return spawnArgv(argvFor(call, win, skillsDir, args), repoRoot, call === 'pending-machine' ? 15000 : 30000, stdin)
    },
    async stat(path) {
      try { const s = await fsStat(abs(path)); return { mtimeMs: s.mtimeMs, size: s.size } } catch { return null }
    },
    read: path => readFile(abs(path), 'utf8'),
    gitEmail: () => git(['config', 'user.email'], repoRoot),
  }
}
