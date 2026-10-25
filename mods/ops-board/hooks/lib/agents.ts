import type { AgentInfo, AgentStatus, Color, TurnCompleteReason } from 'claude-code'
import type { AgentKind, AgentRow, Board, RunView, WorkflowRow } from '../../types'
import type { RunStatus } from './runlines'
import { shortTitle, stageLead, statusColor } from './runlines'

// F53: the folds behind the Agents and Workflows tabs - pure, so a test reads them
// without an engine. A row is only ever an agent this session saw spawn (agent.spawn)
// or the list named; a loop id neither knows (an engine fork) is never one.

export const MAX_AGENTS = 200
export const MAX_WORKFLOWS = 50
export const ACTIVITY_MIN_MS = 1000

const ENDED: AgentStatus[] = ['completed', 'failed', 'killed']
export const isEnded = (s: AgentStatus | null) => s !== null && ENDED.includes(s)

const two = (n: number) => String(n).padStart(2, '0')
export function hms(t: number | null): string {
  if (t === null) return '-'
  const d = new Date(t)
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`
}

// Past MAX_AGENTS the oldest ended rows go first; still over (all in flight), the oldest.
function capAgents(rows: AgentRow[]): AgentRow[] {
  let over = rows.length - MAX_AGENTS
  if (over <= 0) return rows
  const out: AgentRow[] = []
  for (const r of rows) {
    if (over > 0 && isEnded(r.status)) { over--; continue }
    out.push(r)
  }
  return out.slice(-MAX_AGENTS)
}

function patch(rows: AgentRow[], id: string, f: (r: AgentRow) => AgentRow): AgentRow[] {
  const i = rows.findIndex(r => r.id === id)
  if (i < 0) return rows
  const next = f(rows[i]!)
  if (next === rows[i]) return rows
  const out = rows.slice()
  out[i] = next
  return out
}

export type Spawned = {
  id: string; kind: AgentKind; name: string | null; description: string; type: string
  model: string; runId: string | null; at: number
}

// agent.spawn settled with an agentId: the agent started (d.ts 415), so it runs. A
// resume keeps the row's first start.
export function spawned(rows: AgentRow[], s: Spawned): AgentRow[] {
  const cur = rows.find(r => r.id === s.id)
  const row: AgentRow = {
    id: s.id, kind: cur?.kind === 'workflow' ? 'workflow' : s.kind, name: s.name ?? cur?.name ?? null,
    description: s.description || cur?.description || '', type: s.type || cur?.type || '', model: s.model,
    status: 'running', startedAt: cur?.startedAt ?? s.at, lastAt: s.at, runId: s.runId ?? cur?.runId ?? null,
    listed: cur?.listed ?? false,
  }
  return capAgents(cur ? rows.map(r => (r.id === s.id ? row : r)) : [...rows, row])
}

export const turnStarted = (rows: AgentRow[], id: string, at: number) =>
  patch(rows, id, r => ({ ...r, status: 'running', lastAt: at }))

// turn.complete's reason (d.ts 13997) as the loop's status: a teammate answering goes
// idle until a message wakes it (d.ts 564); the list, when it names the agent, decides.
export function endStatus(kind: AgentKind, reason: TurnCompleteReason): AgentStatus {
  if (reason === 'answer') return kind === 'teammate' ? 'idle' : 'completed'
  return reason === 'aborted' ? 'killed' : 'failed'
}

export const turnEnded = (rows: AgentRow[], id: string, reason: TurnCompleteReason, at: number) =>
  patch(rows, id, r => ({ ...r, status: endStatus(r.kind, reason), lastAt: at }))

export const touched = (rows: AgentRow[], id: string, at: number) =>
  patch(rows, id, r => (r.lastAt !== null && at - r.lastAt < ACTIVITY_MIN_MS ? r : { ...r, lastAt: at }))

const kindOf = (i: AgentInfo): AgentKind => (i.teammateId || i.type === 'teammate' ? 'teammate' : 'subagent')

// $.agent.list(): its status, name, description and type stand for a listed agent; one
// it no longer names keeps an end it was seen to reach, else its status is not known.
export function listed(rows: AgentRow[], infos: AgentInfo[]): AgentRow[] {
  const byId = new Map(infos.map(i => [i.id, i]))
  const out = rows.map(r => {
    const i = byId.get(r.id)
    if (!i) return r.listed ? { ...r, listed: false, status: isEnded(r.status) ? r.status : null } : r
    return { ...r, listed: true, status: i.status, name: i.name ?? r.name, description: i.description, type: i.type,
      kind: r.kind === 'workflow' ? r.kind : kindOf(i) }
  })
  for (const i of infos) {
    if (rows.some(r => r.id === i.id)) continue
    out.push({ id: i.id, kind: kindOf(i), name: i.name ?? null, description: i.description, type: i.type, model: null,
      status: i.status, startedAt: null, lastAt: null, runId: null, listed: true })
  }
  return capAgents(out)
}

// In flight first, then the newest start (unknown last), then as they arrived.
export function agentOrder(rows: AgentRow[]): AgentRow[] {
  const ended = (r: AgentRow) => (r.status !== null && !isEnded(r.status) ? 0 : 1)
  return rows.map((r, i) => ({ r, i }))
    .sort((a, b) => ended(a.r) - ended(b.r) || (b.r.startedAt ?? -1) - (a.r.startedAt ?? -1) || a.i - b.i)
    .map(x => x.r)
}

export type Launch = { key: string; runId: string | null; name: string | null; remote: boolean; error: string | null; at: number }

const capRuns = (runs: WorkflowRow[]) => runs.slice(-MAX_WORKFLOWS)

// The Workflow tool's answer (d.ts 22332-22352). Started stays the earliest seen.
export function launched(runs: WorkflowRow[], l: Launch): WorkflowRow[] {
  const cur = runs.find(r => r.key === l.key)
  const row: WorkflowRow = { key: l.key, runId: l.runId, name: l.name ?? cur?.name ?? null, remote: l.remote,
    startedAt: cur ? Math.min(cur.startedAt, l.at) : l.at, error: l.error, denied: cur?.denied ?? 0 }
  return capRuns(cur ? runs.map(r => (r.key === l.key ? row : r)) : [...runs, row])
}

// An agent() of a run: the run is listed by its id until its Workflow answer names it.
export function runSeen(runs: WorkflowRow[], runId: string, at: number, denied: number): WorkflowRow[] {
  const cur = runs.find(r => r.key === runId)
  if (cur) return denied ? runs.map(r => (r.key === runId ? { ...r, denied: r.denied + denied } : r)) : runs
  return capRuns([...runs, { key: runId, runId, name: null, remote: false, startedAt: at, error: null, denied }])
}

export type Counts = { done: number; running: number; failed: number }

export function countsOf(rows: AgentRow[], run: WorkflowRow): Counts {
  const mine = run.runId === null ? [] : rows.filter(r => r.runId === run.runId)
  return {
    done: mine.filter(r => r.status === 'completed').length,
    running: mine.filter(r => r.status !== null && !isEnded(r.status)).length,
    failed: mine.filter(r => r.status === 'failed' || r.status === 'killed').length + run.denied,
  }
}

// F76: a Workflow run's status from what the engine reports. The engine says no run
// ended, so it is read from its agents: one running = running; all ended = completed,
// or failed when one failed; none started yet = pending. A failed check is failed; a
// remote run's agents are not reported here, so launched counts as running.
export function workflowStatus(rows: AgentRow[], run: WorkflowRow): RunStatus {
  if (run.error) return 'failed'
  if (run.remote) return 'running'
  const c = countsOf(rows, run)
  if (c.running) return 'running'
  if (c.failed) return 'failed'
  return c.done ? 'completed' : 'pending'
}

// F85: the run and stage an agent or a Workflow run serves - `RUN-<n> s<stage>` in its
// text, a stage's chain code in it (a Workflow agent's label `AAA9 fix:B10`), or its
// workflow runId as an In-flight block's `run:` id. null: tied to no run.
export type Lead = { run: string; n: number }
export function leadOf(text: string, runId: string | null, runs: RunView[]): Lead | null {
  const m = /\bRUN-(\d+) s(\d+)\b/.exec(text)
  const named = m ? runs.find(r => Number(r.id.replace(/^RUN-/, '')) === Number(m[1])) : undefined
  if (named) return { run: named.id, n: Number(m![2]) }
  const words = new Set(text.split(/[^A-Za-z0-9]+/))
  for (const r of runs) {
    const st = r.stages.find(s => words.has(s.code))
    if (st) return { run: r.id, n: st.n }
    const f = runId ? r.flights.find(x => x.run === runId) : undefined
    if (f) return { run: r.id, n: f.n }
  }
  return null
}
const agentText = (a: AgentRow) => `${a.name ?? ''} ${a.description}`
export const agentLead = (a: AgentRow, runs: RunView[]) => leadOf(agentText(a), a.runId, runs)

type TreeLine = { key: string; segs: { text: string; color?: Color; dim?: boolean }[] }
// F85: one tree - under a run (null: `no run`) its Workflow runs and agents, each led by the
// stage it serves, or, tied to no run, by a short title of its task.
export function treeLines(run: RunView | null, runs: RunView[], agents: AgentRow[], workflows: WorkflowRow[], board: Board | null): TreeLine[] {
  const mine = (l: Lead | null) => (run ? l?.run === run.id : l === null)
  const lead = (l: Lead | null, own: string) => (l && run ? stageLead(run, l.n, board) : shortTitle(own))
  const out: TreeLine[] = []
  for (const w of workflows) {
    const l = leadOf(w.name ?? '', w.runId, runs)
    if (!mine(l)) continue
    out.push({ key: `tree:${run?.id ?? '-'}:wf:${w.key}`, segs: [{ text: '  ● ', color: statusColor(workflowStatus(agents, w)) },
      { text: lead(l, w.name ?? w.runId ?? 'Workflow call') }, { text: '  workflow ' + (w.name ?? w.runId ?? ''), dim: true }] })
  }
  for (const a of agentOrder(agents)) {
    const l = agentLead(a, runs)
    if (!mine(l)) continue
    out.push({ key: `tree:${run?.id ?? '-'}:ag:${a.id}`, segs: [{ text: '  ● ', color: a.status ? statusColor(isEnded(a.status) ? (a.status === 'completed' ? 'completed' : 'failed') : 'running') : undefined, dim: !a.status },
      { text: lead(l, a.description || a.name || a.id) }, { text: `  ${a.kind} ${a.name ?? a.type}  ${a.status ?? 'not listed'}`, dim: true }] })
  }
  return out
}
