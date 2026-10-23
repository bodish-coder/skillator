// The one call table (design D3): each skillator script call in both spellings, argv
// only, no shell. Pure: the mod's host.ts and the standalone ops app both build on it.
// Paths are relative to the *skills dir* - the directory that contains tickets-zordon/
// (<repo>/skills, <plugin cache>/skills, or an install.sh dest) - so no skills/ segment.

export type Call = 'pending' | 'pending-kv' | 'pending-machine' | 'meta-assign' | 'meta-decide' | 'meta-decided'
  | 'meta-team-add' | 'meta-team-remove'
  | 'relay-list' | 'relay-chain-status' | 'relay-queue-add' | 'relay-hold' | 'relay-release' | 'relay-hold-status' | 'relay-decide'
  | 'usage-level'
  | 'team-mark-read' | 'team-config-show' | 'team-config-save' | 'team-config-clear' | 'team-inbox-tail'

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
type ScriptCall = Exclude<Call, 'team-mark-read' | 'team-config-show' | 'team-config-save' | 'team-config-clear' | 'team-inbox-tail'>
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
  'team-inbox-tail': () => ['inbox', 'tail'],     // the newest 200 records of an inbox too big to read whole
}

export const isNodeCall = (call: Call) => NODE[call] !== undefined
export const NO_NODE = 'node not found on PATH (absolute entries only) - teams-uhura needs Node'

// The node binary for a node call, by absolute path. Never a bare `node`: on Windows
// libuv looks in the child's cwd (the repo) before PATH, so a node.exe committed to a
// repo would run. PATH entries that are empty, relative ('.', 'bin') or UNC are skipped;
// the first absolute one holding node (node.exe on Windows) wins. Quotes are stripped.
export const findNode = (pathEnv: string | undefined, win: boolean, exists: (p: string) => Promise<boolean>) =>
  findExe('node', pathEnv, win, exists)

// A150: any program by name, the same way - PATH only, absolute entries only, `<name>.exe`
// on Windows. null when no absolute entry holds it.
export async function findExe(name: string, pathEnv: string | undefined, win: boolean, exists: (p: string) => Promise<boolean>): Promise<string | null> {
  for (const raw of (pathEnv ?? '').split(win ? ';' : ':')) {
    const d = raw.trim().replace(/^"(.*)"$/, '$1')
    if (!(win ? /^[A-Za-z]:[\\/]/.test(d) : d.startsWith('/'))) continue
    const c = norm(d) + '/' + (win ? name + '.exe' : name)
    try { if (await exists(c)) return c } catch { /* not there */ }
  }
  return null
}

// A150: Windows' own folder - %SystemRoot% when it is an absolute drive path, else
// C:/Windows (a relative or UNC SystemRoot would put the repo or a share back in reach).
export const systemRoot = (v: string | undefined) => {
  const s = (v ?? '').trim()
  return /^[A-Za-z]:[\\/]/.test(s) ? norm(s) : 'C:/Windows'
}
export const powershellExe = (sysRoot: string | undefined) => systemRoot(sysRoot) + '/System32/WindowsPowerShell/v1.0/powershell.exe'
export const tasklistExe = (sysRoot: string | undefined) => systemRoot(sysRoot) + '/System32/tasklist.exe'
// POSIX guarantees /bin/sh; naming it needs no PATH (Ruling A150: no lookup there).
export const BIN_SH = '/bin/sh'
export const NO_SH = 'sh not found on PATH (absolute entries only) - the .sh scripts need it'

// A150: the shell a script call runs, by absolute path - never a bare `sh` / `powershell`,
// which libuv on Windows looks up in the child's cwd (the repo) before PATH. `scriptsWin`:
// the .ps1 spelling (System32's Windows PowerShell); else the .sh one - on Windows (Git
// Bash) the first sh.exe in an absolute PATH entry, elsewhere /bin/sh. null: no sh found.
export async function shellFor(scriptsWin: boolean, platformWin: boolean, env: { path?: string; systemRoot?: string },
  exists: (p: string) => Promise<boolean>): Promise<string | null> {
  if (scriptsWin) return powershellExe(env.systemRoot)
  return platformWin ? findExe('sh', env.path, true, exists) : BIN_SH
}

// `bin`: the absolute program the call runs - node for a node call (findNode, or the
// host's own node), else the shell (shellFor).
export function argvFor(call: Call, win: boolean, skillsDir: string, args: string[], bin: string): string[] {
  const n = NODE[call]
  if (n) return [bin, norm(skillsDir) + '/' + TEAM_JS, ...n(args)]
  const t = TABLE[call as ScriptCall]
  const base = norm(skillsDir) + '/' + t.script
  return win
    ? [bin, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', base + '.ps1', ...t.ps(args)]
    : [bin, base + '.sh', ...t.sh(args)]
}
