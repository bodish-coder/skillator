// F94: `ops --status` - one row per CLI profile: name, 5-hour and 7-day % used, or why it
// cannot be read. It starts watch-cortana's `level` reader, at most 5 s each,
// one after another; missing/stale profile caches request asynchronous refresh. No
// credential file is ever opened (its existence is the login check). Sources and rulings:
// docs/plans/PLAN-ops-status.md.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
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
  ['muse', '.muse', '.muse-'],
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
// does not exist, and the in-session overrides dropped.
function readerEnv(p: Profile, base: Env): Env {
  const e: Env = { ...base }
  delete e.CLAUDE_USAGE_WATCH_DIR
  delete e.CLAUDE_CODE_SESSION_ID
  delete e.CODEX_THREAD_ID
  delete e.CODEX_SESSION_ID
  e.SKILLATOR_CLI = p.cli
  e.SKILLATOR_PROFILE_DIR = p.dir
  const none = `${p.dir}/.ops-status-none`
  if (p.cli === 'claude') { e.CLAUDE_CONFIG_DIR = p.dir; e.CODEX_HOME = none }
  else if (p.cli === 'codex') { e.CODEX_HOME = p.dir; e.CLAUDE_USAGE_WATCH_DIR = none }
  else if (p.cli === 'agy') { e.AGY_CONFIG_DIR = p.dir; e.CLAUDE_USAGE_WATCH_DIR = none; e.CODEX_HOME = none }
  else if (p.cli === 'muse') { e.MUSE_CONFIG_DIR = p.dir; e.CLAUDE_USAGE_WATCH_DIR = none; e.CODEX_HOME = none }
  else { e.CODEX_HOME = none; e.CLAUDE_USAGE_WATCH_DIR = none }
  return e
}

const pct = (v: string | undefined) => (v && /^\d+(\.\d+)?$/.test(v) ? `${Math.round(Number(v))}%` : '-')

export type CursorRun = {
  timestamp?: string | number
  usage?: {
    inputTokens?: number
    outputTokens?: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    cost?: number
    cost_usd?: number
  }
  tokens?: number
  cost?: number
  cost_usd?: number
  [key: string]: any
}

export type CursorLedger = {
  budget?: number
  budget_tokens?: number
  budget_cost?: number
  billing_day?: number
  runs?: CursorRun[]
}

export function findCursorLedgerPath(dir: string, base?: Env): string | null {
  const home = norm(base?.HOME || base?.USERPROFILE || homedir())
  const cands = [
    base?.CURSOR_LEDGER_PATH,
    base?.SKILLATOR_PROFILE_DIR ? `${norm(base.SKILLATOR_PROFILE_DIR)}/cursor-ledger.json` : undefined,
    `${norm(dir)}/cursor-ledger.json`,
    base?.SKILLATOR_CONFIG_DIR ? `${norm(base.SKILLATOR_CONFIG_DIR)}/cursor-ledger.json` : undefined,
    `${home}/.skillator/cursor-ledger.json`,
    `${home}/.cursor/cursor-ledger.json`,
    '.skillator/cursor-ledger.json',
  ].filter((p): p is string => Boolean(p))

  for (const c of cands) {
    if (existsSync(c)) return c
  }
  return null
}

export function loadCursorLedger(dir: string, base?: Env): CursorLedger | null {
  const p = findCursorLedgerPath(dir, base)
  if (!p) return null
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as CursorLedger
  } catch {
    return null
  }
}

export function getBillingCycleStart(billingDay: number, now: Date): Date {
  const bDay = Math.max(1, Math.min(31, Math.floor(billingDay)))
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const day = now.getUTCDate()

  let cycleYear = year
  let cycleMonth = month

  if (day < bDay) {
    cycleMonth -= 1
    if (cycleMonth < 0) {
      cycleMonth = 11
      cycleYear -= 1
    }
  }

  const maxDays = new Date(Date.UTC(cycleYear, cycleMonth + 1, 0)).getUTCDate()
  const clampedDay = Math.min(bDay, maxDays)
  return new Date(Date.UTC(cycleYear, cycleMonth, clampedDay, 0, 0, 0, 0))
}

export function calculateCursorUsage(ledger: CursorLedger, now: Date = new Date()): { totalUsage: number; budget: number; pct: number } | null {
  const budget = ledger.budget_tokens ?? ledger.budget_cost ?? ledger.budget
  if (budget == null || budget <= 0) return null

  const billingDay = ledger.billing_day ?? 1
  const cycleStart = getBillingCycleStart(billingDay, now)
  const isCostBudget = Boolean(ledger.budget_cost)

  let total = 0
  for (const r of ledger.runs ?? []) {
    if (r.timestamp) {
      const t = new Date(r.timestamp)
      if (!isNaN(t.getTime()) && t < cycleStart) continue
    }

    if (isCostBudget) {
      const c = r.cost ?? r.cost_usd ?? r.usage?.cost ?? r.usage?.cost_usd ?? 0
      total += Number(c) || 0
    } else {
      const tok = r.tokens ?? r.usage?.total_tokens ?? (
        (r.usage?.inputTokens ?? r.usage?.prompt_tokens ?? 0) +
        (r.usage?.outputTokens ?? r.usage?.completion_tokens ?? 0) +
        (r.usage?.cacheReadTokens ?? 0) +
        (r.usage?.cacheWriteTokens ?? 0)
      )
      total += Number(tok) || 0
    }
  }

  const pct = Math.round((total / budget) * 100)
  return { totalUsage: total, budget, pct }
}

export function recordCursorRun(targetPathOrDir: string, runOrOutput: any): CursorLedger {
  let targetPath = targetPathOrDir
  if (existsSync(targetPathOrDir) && !targetPathOrDir.endsWith('.json')) {
    targetPath = `${targetPathOrDir}/cursor-ledger.json`
  } else if (!targetPathOrDir.endsWith('.json')) {
    targetPath = `${targetPathOrDir}/cursor-ledger.json`
  }

  let ledger: CursorLedger = { budget: 0, billing_day: 1, runs: [] }
  if (existsSync(targetPath)) {
    try {
      ledger = JSON.parse(readFileSync(targetPath, 'utf8'))
      if (!Array.isArray(ledger.runs)) ledger.runs = []
    } catch {
      ledger = { budget: 0, billing_day: 1, runs: [] }
    }
  }

  let entry: CursorRun
  if (typeof runOrOutput === 'string') {
    const lines = runOrOutput.trim().split(/\r?\n/)
    let foundUsage: any = null
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line.trim())
        if (parsed.type === 'result' && parsed.usage) {
          foundUsage = parsed.usage
        } else if (parsed.usage) {
          foundUsage = parsed.usage
        }
      } catch {
        // Not JSON
      }
    }
    entry = {
      timestamp: new Date().toISOString(),
      usage: foundUsage || {},
    }
  } else if (typeof runOrOutput === 'object' && runOrOutput !== null) {
    if (runOrOutput.type === 'result' && runOrOutput.usage) {
      entry = {
        timestamp: runOrOutput.timestamp || new Date().toISOString(),
        usage: runOrOutput.usage,
      }
    } else {
      entry = {
        timestamp: runOrOutput.timestamp || new Date().toISOString(),
        ...runOrOutput,
      }
    }
  } else {
    entry = { timestamp: new Date().toISOString() }
  }

  ledger.runs!.push(entry)
  const parent = targetPath.replace(/[\\/][^\\/]+$/, '')
  if (parent && !existsSync(parent)) {
    mkdirSync(parent, { recursive: true })
  }
  writeFileSync(targetPath, JSON.stringify(ledger, null, 2))
  return ledger
}

// darwin: Claude keeps its login in the Keychain there, so a missing file proves nothing.
export async function row(p: Profile, read: Reader, base: Env, darwin: boolean): Promise<Row> {
  const r = (note: string, five = '-', seven = '-'): Row => [p.name, five, seven, note]
  if (p.cli === 'cursor') {
    const ledger = loadCursorLedger(p.dir, base)
    if (ledger) {
      const now = base.SKILLATOR_NOW ? new Date(base.SKILLATOR_NOW) : new Date()
      const usage = calculateCursorUsage(ledger, now)
      if (usage != null) {
        return r(`cursor est ${usage.pct}% of budget (skillator runs only); check cursor.com/settings`)
      }
    }
    return r('no quota source: cursor-agent has no usage command')
  }
  if (p.cli !== 'claude' && p.cli !== 'codex' && p.cli !== 'agy' && p.cli !== 'muse') return r(`profiles file: unknown cli ${p.cli}`)
  const res = await read(readerEnv(p, base), MS)
  if (res.err.startsWith('timed out')) return r(res.err.trim())
  const kv = new Map(res.out.trim().split(/\s+/).map(w => [w.slice(0, w.indexOf('=')), w.slice(w.indexOf('=') + 1)] as const))
  if (!kv.has('src')) return r(`unreadable: ${(res.err || res.out).trim().split(/\r?\n/)[0] || `exit ${res.code}`}`)
  const five = pct(kv.get('5h')), seven = pct(kv.get('7d'))
  if (kv.get('src') !== 'none' && (five !== '-' || seven !== '-')) return r('', five, seven)
  if (kv.has('note') && kv.get('note')) return r(kv.get('note')!.replace(/_/g, ' '))
  const cred = p.cli === 'claude' ? '.credentials.json' : (p.cli === 'agy' ? 'antigravity-oauth-token' : 'auth.json')
  const loggedIn = (darwin && p.cli === 'claude') || existsSync(`${p.dir}/${cred}`) || (p.cli === 'agy' && existsSync(`${p.dir}/oauth_credentials.json`))
  if (!loggedIn) return r('not logged in')
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
