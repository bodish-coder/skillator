import type { FsEntry, ProcessRunInit, ProcessRunResult, SessionRepo, SessionUsage } from 'claude-code'
import type { Usage } from '../../types'
import { usageFrom, usageFromFlags } from './facts'
import type { Flag } from './facts'
import { argvFor, findExe, findNode, isNodeCall, MARKER, NO_NODE, NO_SCRIPTS, NO_SH, norm, shellFor, up } from './calls'
import type { Call } from './calls'
export { argvFor, findNode, NO_SCRIPTS } from './calls'
export type { Call } from './calls'

// $-using: the platform, where skillator's scripts live (the skills dir), and running a
// call from the table in ./calls (design §2, D2/D3). No shell: argv only.

// The part of `$` this file uses. The plugin's `$` (EngineInterface) is one.
export type HostApi = {
  plugin: { root: string }
  env: { get: (name: string) => Promise<string | undefined> }
  process: { run: (argv: readonly string[], init?: ProcessRunInit) => Promise<ProcessRunResult> }
  fs: {
    exists: (path: string) => Promise<boolean>
    read: (path: string) => Promise<string>
    list: (path?: string) => Promise<FsEntry[]>
  }
  session: {
    repo: () => Promise<SessionRepo | null>
    usage: () => Promise<SessionUsage>
    id: () => Promise<string>
  }
}

export async function isWindows($: HostApi): Promise<boolean> {
  return (await $.env.get('OS')) === 'Windows_NT'
}

async function has($: HostApi, dir: string): Promise<boolean> {
  try { return await $.fs.exists(dir + '/' + MARKER) } catch { return false }
}

async function configDir($: HostApi): Promise<string | null> {
  const cfg = await $.env.get('CLAUDE_CONFIG_DIR')
  if (cfg) return norm(cfg)
  const home = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE'))
  return home ? norm(home) + '/.claude' : null
}

// The skills dir (the directory that contains tickets-zordon/): the first that holds
// tickets-zordon/scripts/ticket-meta.sh of $SKILLATOR_ROOT/skills, $SKILLATOR_ROOT itself
// (a flat install dest), the plugin folder two up + /skills (a repo checkout), then each
// installPath + /skills of skillator@skillator in <config dir>/plugins/installed_plugins.json.
// None: null. A136: never the session's repo - any repo opened would otherwise have its
// own scripts run by the band's poll, unasked. Developing in a checkout: set SKILLATOR_ROOT.
export async function skillatorRoot($: HostApi): Promise<string | null> {
  const env = await $.env.get('SKILLATOR_ROOT')
  const tries = env ? [norm(env) + '/skills', norm(env)] : []
  tries.push(up($.plugin.root, 2) + '/skills')
  for (const t of tries) if (await has($, t)) return t
  const cfg = await configDir($)
  if (!cfg) return null
  let installed: unknown
  try { installed = JSON.parse(await $.fs.read(cfg + '/plugins/installed_plugins.json')) } catch { return null }
  const entries = (installed as { plugins?: Record<string, unknown> })?.plugins?.['skillator@skillator']
  if (!Array.isArray(entries)) return null
  for (const e of entries) {
    const p = (e as { installPath?: unknown })?.installPath
    if (typeof p === 'string' && p && await has($, norm(p) + '/skills')) return norm(p) + '/skills'
  }
  return null
}

async function pathOf($: HostApi): Promise<string | undefined> {
  return (await $.env.get('PATH')) ?? (await $.env.get('Path'))
}
async function systemRootOf($: HostApi): Promise<string | undefined> {
  return (await $.env.get('SystemRoot')) ?? (await $.env.get('SYSTEMROOT'))
}

// A150: the git the mod runs (cwd = the repo). Windows: git.exe in the first absolute PATH
// entry holding one, else none - never a bare `git`, which a Windows spawn may look up in
// the cwd first. Elsewhere `git` as is (Ruling: execvp searches PATH only, never the cwd,
// unless PATH itself names '.' or an empty entry - the user's own shell does the same).
export async function gitBin($: HostApi): Promise<string | null> {
  return await isWindows($) ? findExe('git', await pathOf($), true, p => $.fs.exists(p)) : 'git'
}

// Runs one call in the main checkout (the session's cwd outside a repo). Never rejects:
// a command that cannot start or outlasts its budget comes back as code -1, its reason
// in `err`. 30 s budget; `pending --machine` (the band's poll) 15 s.
// `stdin` (F66: the setup form's values for team-config-save) is written to the child's
// standard input - never put on argv.
export async function runCall($: HostApi, call: Call, args: string[], stdin?: string): Promise<{ code: number; out: string; err: string; argv: string[] }> {
  const win = await isWindows($)
  const repo = await $.session.repo()
  const skills = await skillatorRoot($)
  if (!skills) return { code: 127, out: '', err: NO_SCRIPTS, argv: [] }
  // F66 / A150: node, sh and powershell all by absolute path, never a bare name the
  // child's cwd (the repo) could supply. node: found on PATH (absolute entries) - the mod
  // has no node of its own to reuse; powershell: System32's; sh: /bin/sh.
  let bin: string
  const exists = (p: string) => $.fs.exists(p)
  if (isNodeCall(call)) {
    const found = await findNode(await pathOf($), win, exists)
    if (!found) return { code: 127, out: '', err: NO_NODE, argv: [] }
    bin = found
  } else {
    const sh = await shellFor(win, win, { path: await pathOf($), systemRoot: await systemRootOf($) }, exists)
    if (!sh) return { code: 127, out: '', err: NO_SH, argv: [] }
    bin = sh
  }
  const argv = argvFor(call, win, skills, args, bin)
  const timeoutMs = call === 'pending-machine' ? 15000 : 30000
  const init: ProcessRunInit = { ...(repo ? { cwd: repo.root } : {}), timeoutMs, ...(stdin !== undefined ? { stdin } : {}) }
  try {
    const r = await $.process.run(argv, init)
    return { code: r.exitCode, out: r.stdout, err: r.stderr, argv }
  } catch (e) {
    return { code: -1, out: '', err: e instanceof Error ? e.message : String(e), argv }
  }
}

// Usage: this session's own host reading first. Only when the host has none, the
// watch-cortana flag files named by THIS session's id (`<id>`, `<id>.weekly` in
// $CLAUDE_USAGE_WATCH_DIR, else $CLAUDE_CONFIG_DIR/handoff-watch, else
// ~/.claude/handoff-watch - the order usage-watch writes them), dated by their mtime.
export async function readUsage($: HostApi, now: number): Promise<Usage> {
  const u = await $.session.usage()
  const cost = u.cost?.usd ?? null
  if (u.rateLimits.length) return usageFrom(u.rateLimits, cost, now)
  const dirEnv = await $.env.get('CLAUDE_USAGE_WATCH_DIR')
  const cfgEnv = await $.env.get('CLAUDE_CONFIG_DIR')
  const home = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE'))
  const dir = dirEnv ? norm(dirEnv) : cfgEnv ? norm(cfgEnv) + '/handoff-watch' : home ? norm(home) + '/.claude/handoff-watch' : null
  const id = await $.session.id()
  if (!dir || !id) return usageFromFlags(null, null, cost)
  let entries: FsEntry[] = []
  try { entries = await $.fs.list(dir) } catch { return usageFromFlags(null, null, cost) }
  const flag = async (name: string): Promise<Flag | null> => {
    const e = entries.find(x => x.name === name && x.kind === 'file')
    if (!e) return null
    try { return { text: await $.fs.read(dir + '/' + name), mtimeMs: e.mtimeMs } } catch { return null }
  }
  return usageFromFlags(await flag(id), await flag(id + '.weekly'), cost)
}
