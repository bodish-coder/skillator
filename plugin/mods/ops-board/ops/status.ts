// F94: `ops --status` - one row per CLI profile: name, 5-hour and 7-day % used, or why it
// cannot be read. Read-only: the one process it starts is watch-cortana's `level` reader
// (Claude and Codex rows), at most 5 s each, one after another; no CLI is run, no
// credential file is ever opened (its existence is the login check). Sources and rulings:
// docs/plans/PLAN-ops-status.md.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { argvFor, NO_SCRIPTS, NO_SH, norm, shellFor } from '../hooks/lib/calls'
import { findSkillsDir, spawnArgv, windowsScripts } from './nodehost'

type Env = Record<string, string | undefined>
export type Profile = { name: string; cli: string; dir: string }
export type Row = [name: string, five: string, seven: string, note: string]
export type Reader = (env: Env, ms: number) => Promise<{ code: number; out: string; err: string }>

const MS = 5000
// cli, its default dir under home (row name = the cli), the prefix of its named profiles.
const KINDS: [cli: string, def: string, prefix: string][] = [
  ['claude', '.claude', '.claude-'], ['codex', '.codex', '.codex-'],
  ['cursor', '.cursor', '.cursor-'], ['agy', '.gemini/antigravity-cli', '.agy-'],
]
const key = (d: string) => (process.platform === 'win32' ? norm(d).toLowerCase() : norm(d))

// The profiles under home, then ~/.skillator/profiles: `<name> <cli> <dir>` per line renames
// a dir already found, adds a new one, and name `-` hides it.
export function discover(home: string): Profile[] {
  let names: string[] = []
  try { names = readdirSync(home, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort() } catch { /* no home */ }
  const out: Profile[] = []
  for (const [cli, def, prefix] of KINDS) {
    if (existsSync(`${home}/${def}`)) out.push({ name: cli, cli, dir: `${home}/${def}` })
    for (const n of names) if (n.startsWith(prefix)) out.push({ name: n.slice(1), cli, dir: `${home}/${n}` })
  }
  let text = ''
  try { text = readFileSync(`${home}/.skillator/profiles`, 'utf8') } catch { return out }
  for (const line of text.split(/\r?\n/)) {
    const m = /^(\S+)\s+(\S+)\s+(.+)$/.exec(line.trim())
    if (!m || m[1]!.startsWith('#')) continue
    const dir = norm(m[3]!.replace(/^~(?=$|[\\/])/, home))
    const i = out.findIndex(p => key(p.dir) === key(dir))
    if (m[1] === '-') { if (i >= 0) out.splice(i, 1) }
    else if (i >= 0) out[i] = { name: m[1]!, cli: m[2]!, dir: out[i]!.dir }
    else out.push({ name: m[1]!, cli: m[2]!, dir })
  }
  return out
}

// The reader's env for one profile: its own home set, the other CLI's pointed at a path that
// does not exist (`level` only reads), and the in-session overrides dropped.
function readerEnv(p: Profile, base: Env): Env {
  const e: Env = { ...base }
  delete e.CLAUDE_USAGE_WATCH_DIR
  delete e.CLAUDE_CODE_SESSION_ID
  const none = `${p.dir}/.ops-status-none`
  if (p.cli === 'claude') { e.CLAUDE_CONFIG_DIR = p.dir; e.CODEX_HOME = none }
  else { e.CODEX_HOME = p.dir; e.CLAUDE_USAGE_WATCH_DIR = none }
  return e
}

const pct = (v: string | undefined) => (v && /^\d+(\.\d+)?$/.test(v) ? `${Math.round(Number(v))}%` : '-')

// darwin: Claude keeps its login in the Keychain there, so a missing file proves nothing.
export async function row(p: Profile, read: Reader, base: Env, darwin: boolean): Promise<Row> {
  const r = (note: string, five = '-', seven = '-'): Row => [p.name, five, seven, note]
  if (p.cli === 'cursor') return r('no quota source: cursor-agent has no usage command')
  if (p.cli === 'agy') return r('no quota source: agy has no usage command')
  if (p.cli !== 'claude' && p.cli !== 'codex') return r(`profiles file: unknown cli ${p.cli}`)
  const res = await read(readerEnv(p, base), MS)
  if (res.err.startsWith('timed out')) return r(res.err.trim())
  const kv = new Map(res.out.trim().split(/\s+/).map(w => [w.slice(0, w.indexOf('=')), w.slice(w.indexOf('=') + 1)] as const))
  if (!kv.has('src')) return r(`unreadable: ${(res.err || res.out).trim().split(/\r?\n/)[0] || `exit ${res.code}`}`)
  const five = pct(kv.get('5h')), seven = pct(kv.get('7d'))
  if (kv.get('src') !== 'none' && (five !== '-' || seven !== '-')) return r('', five, seven)
  const cred = p.cli === 'claude' ? '.credentials.json' : 'auth.json'
  if (!(darwin && p.cli === 'claude') && !existsSync(`${p.dir}/${cred}`)) return r('not logged in')
  return r('no quota source: no reading in the last 3 h')
}

export function render(rows: Row[]): string {
  const all: Row[] = [['profile', '5h used', '7d used', ''], ...rows]
  const w = [0, 1, 2].map(i => Math.max(...all.map(x => x[i]!.length)))
  return all.map(x => x.map((c, i) => (i < 3 ? c.padEnd(w[i]! + 2) : c)).join('').trimEnd()).join('\n') + '\n'
}

export async function status(env: Env, appDir: string): Promise<string> {
  const home = norm(env.HOME || env.USERPROFILE || homedir())
  const skills = findSkillsDir(appDir, env, existsSync, p => JSON.parse(readFileSync(p, 'utf8')))
  const win = windowsScripts(env)
  const sh = await shellFor(win, process.platform === 'win32', { path: env.PATH ?? env.Path, systemRoot: env.SystemRoot ?? env.SYSTEMROOT }, async p => existsSync(p))
  const read: Reader = async (e, ms) => {
    if (!skills) return { code: 127, out: '', err: NO_SCRIPTS }
    if (!sh) return { code: 127, out: '', err: NO_SH }
    return spawnArgv(argvFor('usage-level', win, skills, [], sh), home, ms, undefined, e)
  }
  const rows: Row[] = []
  for (const p of discover(home)) rows.push(await row(p, read, env, process.platform === 'darwin'))
  return rows.length ? render(rows) : `ops --status: no CLI profiles found under ${home}\n`
}
