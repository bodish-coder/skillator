import type { FsEntry, ProcessRunInit, ProcessRunResult, SessionRepo, SessionUsage } from 'claude-code'
import type { Usage } from '../../types'
import { usageFrom, usageFromFlags } from './facts'
import type { Flag } from './facts'

// $-using: the platform, where skillator's scripts live, and every script call in
// both spellings (design §2). No shell: argv only.

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

export type Call = 'pending' | 'pending-kv' | 'pending-machine' | 'meta-assign' | 'meta-decide' | 'meta-decided'
  | 'meta-team-add' | 'meta-team-remove'
  | 'relay-list' | 'relay-chain-status' | 'relay-queue-add' | 'relay-hold' | 'relay-release' | 'relay-hold-status' | 'relay-decide'

const PENDING = 'skills/tickets-zordon/scripts/pending'
const META = 'skills/tickets-zordon/scripts/ticket-meta'
const RELAY = 'skills/relay-morpheus/hooks/relay-morpheus'
const MARKER = '/' + META + '.sh'

// Forward slashes, no trailing one: both hosts take them, and joins stay simple.
const norm = (p: string) => p.replace(/\\/g, '/').replace(/(.)\/+$/, '$1')
const up = (p: string, n: number) => {
  let s = norm(p)
  for (let i = 0; i < n; i++) s = s.slice(0, Math.max(s.lastIndexOf('/'), 0)) || s
  return s
}

export async function isWindows($: HostApi): Promise<boolean> {
  return (await $.env.get('OS')) === 'Windows_NT'
}

// One table: each call's script and its words for the sh and the ps1 port.
// args: meta-assign/meta-decide [id, @handle]; meta-decided [id]; meta-team-add
// [@handle, name, emails comma-joined]; meta-team-remove [@handle]; relay-chain-status and
// relay-queue-add [RUN-id]; relay-hold [reason]; relay-decide [level line]; others none.
const TABLE: Record<Call, { script: string; sh: (a: string[]) => string[]; ps: (a: string[]) => string[] }> = {
  'pending':            { script: PENDING, sh: a => a, ps: a => a },
  'pending-kv':         { script: PENDING, sh: a => ['--kv', ...a], ps: a => ['--kv', ...a] },
  'pending-machine':    { script: PENDING, sh: a => ['--machine', ...a], ps: a => ['--machine', ...a] },
  'meta-assign':        { script: META, sh: a => ['assign', ...a], ps: a => ['assign', ...a] },
  'meta-decide':        { script: META, sh: a => ['decide', ...a], ps: a => ['decide', ...a] },
  'meta-decided':       { script: META, sh: a => ['decided', ...a], ps: a => ['decided', ...a] },
  'meta-team-add':      { script: META, sh: a => ['team', 'add', ...a], ps: a => ['team', 'add', ...a] },
  'meta-team-remove':   { script: META, sh: a => ['team', 'remove', ...a], ps: a => ['team', 'remove', ...a] },
  'relay-list':         { script: RELAY, sh: () => ['list'], ps: () => ['-Mode', 'list'] },
  'relay-chain-status': { script: RELAY, sh: a => [a[0] ?? '', 'chain', 'status'], ps: a => ['-Mode', 'chain', '-Action', 'status', '-Id', a[0] ?? ''] },
  'relay-queue-add':    { script: RELAY, sh: a => ['queue-run', 'add', a[0] ?? ''], ps: a => ['-Mode', 'queue-run', '-Sub', 'add', '-Id', a[0] ?? ''] },
  'relay-hold':         { script: RELAY, sh: a => ['watchdog', 'hold', a[0] ?? ''], ps: a => ['-Mode', 'watchdog', '-Action', 'hold', '-Reason', a[0] ?? ''] },
  'relay-release':      { script: RELAY, sh: () => ['watchdog', 'release'], ps: () => ['-Mode', 'watchdog', '-Action', 'release'] },
  'relay-hold-status':  { script: RELAY, sh: () => ['watchdog', 'status'], ps: () => ['-Mode', 'watchdog', '-Action', 'status'] },
  'relay-decide':       { script: RELAY, sh: a => ['chain', 'decide', '--level', a[0] ?? ''], ps: a => ['-Mode', 'chain', '-Action', 'decide', '-Text', a[0] ?? ''] },
}

export function argvFor(call: Call, win: boolean, root: string, args: string[]): string[] {
  const t = TABLE[call]
  const base = norm(root) + '/' + t.script
  return win
    ? ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', base + '.ps1', ...t.ps(args)]
    : ['sh', base + '.sh', ...t.sh(args)]
}

async function has($: HostApi, root: string): Promise<boolean> {
  try { return await $.fs.exists(root + MARKER) } catch { return false }
}

async function configDir($: HostApi): Promise<string | null> {
  const cfg = await $.env.get('CLAUDE_CONFIG_DIR')
  if (cfg) return norm(cfg)
  const home = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE'))
  return home ? norm(home) + '/.claude' : null
}

// The first that holds skills/tickets-zordon/scripts/ticket-meta.sh: $SKILLATOR_ROOT,
// the plugin folder two up (a repo checkout), then the installPath of
// skillator@skillator in <config dir>/plugins/installed_plugins.json. None: null.
// A136: never the session's repo - any repo opened would otherwise have its own
// scripts run by the band's poll, unasked. Developing in a checkout: set SKILLATOR_ROOT.
export async function skillatorRoot($: HostApi): Promise<string | null> {
  const env = await $.env.get('SKILLATOR_ROOT')
  const tries = [env ? norm(env) : null, up($.plugin.root, 2)]
  for (const t of tries) if (t && await has($, t)) return t
  const cfg = await configDir($)
  if (!cfg) return null
  let installed: unknown
  try { installed = JSON.parse(await $.fs.read(cfg + '/plugins/installed_plugins.json')) } catch { return null }
  const entries = (installed as { plugins?: Record<string, unknown> })?.plugins?.['skillator@skillator']
  if (!Array.isArray(entries)) return null
  for (const e of entries) {
    const p = (e as { installPath?: unknown })?.installPath
    if (typeof p === 'string' && p && await has($, norm(p))) return norm(p)
  }
  return null
}

export const NO_SCRIPTS = 'skillator scripts not found - set SKILLATOR_ROOT'

// Runs one call in the main checkout (the session's cwd outside a repo). Never rejects:
// a command that cannot start or outlasts its budget comes back as code -1, its reason
// in `err`. 30 s budget; `pending --machine` (the band's poll) 15 s.
export async function runCall($: HostApi, call: Call, args: string[]): Promise<{ code: number; out: string; err: string; argv: string[] }> {
  const win = await isWindows($)
  const repo = await $.session.repo()
  const root = await skillatorRoot($)
  if (!root) return { code: 127, out: '', err: NO_SCRIPTS, argv: [] }
  const argv = argvFor(call, win, root, args)
  const timeoutMs = call === 'pending-machine' ? 15000 : 30000
  const init: ProcessRunInit = repo ? { cwd: repo.root, timeoutMs } : { timeoutMs }
  try {
    const r = await $.process.run(argv, init)
    return { code: r.exitCode, out: r.stdout, err: r.stderr, argv }
  } catch (e) {
    return { code: -1, out: '', err: e instanceof Error ? e.message : String(e), argv }
  }
}

// Usage: this session's own host reading first. Only when the host has none, the
// watch-cortana flag files named by THIS session's id (`<id>`, `<id>.weekly` in
// $CLAUDE_USAGE_WATCH_DIR or ~/.claude/handoff-watch), dated by their mtime.
export async function readUsage($: HostApi, now: number): Promise<Usage> {
  const u = await $.session.usage()
  const cost = u.cost?.usd ?? null
  if (u.rateLimits.length) return usageFrom(u.rateLimits, cost, now)
  const dirEnv = await $.env.get('CLAUDE_USAGE_WATCH_DIR')
  const home = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE'))
  const dir = dirEnv ? norm(dirEnv) : home ? norm(home) + '/.claude/handoff-watch' : null
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
