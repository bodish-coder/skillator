// The one call table (design D3): each skillator script call in both spellings, argv
// only, no shell. Pure: the mod's host.ts and the standalone ops app both build on it.
// Paths are relative to the *skills dir* - the directory that contains tickets-zordon/
// (<repo>/skills, <plugin cache>/skills, or an install.sh dest) - so no skills/ segment.

export type Call = 'pending' | 'pending-kv' | 'pending-machine' | 'meta-assign' | 'meta-decide' | 'meta-decided'
  | 'meta-team-add' | 'meta-team-remove'
  | 'relay-list' | 'relay-chain-status' | 'relay-queue-add' | 'relay-hold' | 'relay-release' | 'relay-hold-status' | 'relay-decide'
  | 'usage-level'
  | 'team-mark-read' | 'team-config-show' | 'team-config-save' | 'team-config-clear'

// Exists under a skills dir: what marks a directory as one.
export const MARKER = 'tickets-zordon/scripts/ticket-meta.sh'
export const NO_SCRIPTS = 'skillator scripts not found - set SKILLATOR_ROOT'

const PENDING = 'tickets-zordon/scripts/pending'
const META = 'tickets-zordon/scripts/ticket-meta'
const RELAY = 'relay-morpheus/hooks/relay-morpheus'
const WATCH = 'watch-cortana/hooks/usage-watch'

// Forward slashes, no trailing one: both hosts take them, and joins stay simple.
export const norm = (p: string) => p.replace(/\\/g, '/').replace(/(.)\/+$/, '$1')
export const up = (p: string, n: number) => {
  let s = norm(p)
  for (let i = 0; i < n; i++) s = s.slice(0, Math.max(s.lastIndexOf('/'), 0)) || s
  return s
}

// args: meta-assign/meta-decide [id, @handle]; meta-decided [id]; meta-team-add
// [@handle, name, emails comma-joined]; meta-team-remove [@handle]; relay-chain-status and
// relay-queue-add [RUN-id]; relay-hold [reason]; relay-decide [level line]; others none.
type ScriptCall = Exclude<Call, 'team-mark-read' | 'team-config-show' | 'team-config-save' | 'team-config-clear'>
const TABLE: Record<ScriptCall, { script: string; sh: (a: string[]) => string[]; ps: (a: string[]) => string[] }> = {
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
  'usage-level':        { script: WATCH, sh: () => ['level'], ps: () => ['-Mode', 'level'] },
}

// F66: teams-uhura's script is Node (no sh / ps1 twin): `node <skills>/teams-uhura/
// scripts/team.mjs ...` on every platform. team-mark-read [id]; team-config-save takes
// the setup form's values on stdin (runCall / Host.run's stdin) - never argv, where
// another process could read them; the others no args.
const TEAM_JS = 'teams-uhura/scripts/team.mjs'
const NODE: Partial<Record<Call, (a: string[]) => string[]>> = {
  'team-mark-read': a => ['inbox', 'mark-read', '--upto', a[0] ?? ''],
  'team-config-show': () => ['config', 'show'],
  'team-config-save': () => ['config', 'save'],
  'team-config-clear': () => ['config', 'clear'],
}

export const isNodeCall = (call: Call) => NODE[call] !== undefined
export const NO_NODE = 'node not found on PATH (absolute entries only) - teams-uhura needs Node'

// The node binary for a node call, by absolute path. Never a bare `node`: on Windows
// libuv looks in the child's cwd (the repo) before PATH, so a node.exe committed to a
// repo would run. PATH entries that are empty, relative ('.', 'bin') or UNC are skipped;
// the first absolute one holding node (node.exe on Windows) wins. Quotes are stripped.
export async function findNode(pathEnv: string | undefined, win: boolean, exists: (p: string) => Promise<boolean>): Promise<string | null> {
  for (const raw of (pathEnv ?? '').split(win ? ';' : ':')) {
    const d = raw.trim().replace(/^"(.*)"$/, '$1')
    if (!(win ? /^[A-Za-z]:[\\/]/.test(d) : d.startsWith('/'))) continue
    const c = norm(d) + '/' + (win ? 'node.exe' : 'node')
    try { if (await exists(c)) return c } catch { /* not there */ }
  }
  return null
}

// `nodeBin`: the absolute node for a node call (findNode, or the host's own node).
export function argvFor(call: Call, win: boolean, skillsDir: string, args: string[], nodeBin = ''): string[] {
  const n = NODE[call]
  if (n) return [nodeBin, norm(skillsDir) + '/' + TEAM_JS, ...n(args)]
  const t = TABLE[call as ScriptCall]
  const base = norm(skillsDir) + '/' + t.script
  return win
    ? ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', base + '.ps1', ...t.ps(args)]
    : ['sh', base + '.sh', ...t.sh(args)]
}
