import { atom, read, update } from 'claude-code'
import type { AgentSpawnInput, AgentSpawnResult, AgentStatus, BoxProps, Color, ElementConstructor, EngineInterface,
  RenderElement, TextProps, ToolCallResult, TurnCompleteReason } from 'claude-code'
import type { AgentRow, WorkflowRow } from '../types'
import { agentOrder, countsOf, hms, launched, listed, runSeen, spawned, touched, turnEnded, turnStarted, workflowStatus } from './lib/agents'
import { statusColor } from './lib/runlines'

// F53: the Agents tab and the Workflows section (F76: of the Workflows tab) - read-only, nothing the engine does not report.
// Rows come from agent.spawn (model, started, workflow run), $.agent.list() (status,
// name, type: read on entering the Agents tab and every 5 s while it is shown, as no
// event says a status moved) and the loops' own events (turn.start, tool.call,
// turn.complete: last activity and the end). Runs come from the Workflow tool's answer
// and agent.spawn's workflow.runId. The engine reports no phase, so the tab says so.

const agentsA = atom({ plugin: 'ops-board', key: 'agents' } as const, [])
const workflowsA = atom({ plugin: 'ops-board', key: 'workflows' } as const, [])

export const AGENTS_POLL_MS = 5000
export const WIDE = 96

// A fold that changes nothing writes nothing.
async function setAgents($: EngineInterface, f: (rows: AgentRow[]) => AgentRow[]) {
  const cur = await read($, agentsA)
  if (f(cur) !== cur) await update($, agentsA, f)
}
async function setRuns($: EngineInterface, f: (runs: WorkflowRow[]) => WorkflowRow[]) {
  const cur = await read($, workflowsA)
  if (f(cur) !== cur) await update($, workflowsA, f)
}

export async function noteSpawn($: EngineInterface, e: AgentSpawnInput, r: AgentSpawnResult): Promise<void> {
  const runId = e.workflow?.runId || null
  const at = await $.clock.now()
  if (r.deny !== undefined) {                       // nothing started; a workflow's agent() threw
    if (runId) await setRuns($, runs => runSeen(runs, runId, at, 1))
    return
  }
  if (runId) await setRuns($, runs => runSeen(runs, runId, at, 0))
  const id = r.agentId ?? e.resume?.agentId
  if (!id) return                                   // a workflow's remote agent: no local loop (d.ts 432)
  await setAgents($, rows => spawned(rows, {
    id, kind: e.workflow ? 'workflow' : e.isTeammate ? 'teammate' : 'subagent', name: e.name ?? null,
    description: e.description, type: e.subagentType, model: r.model, runId, at,
  }))
}

export async function noteTurnStart($: EngineInterface, id: string): Promise<void> {
  const at = await $.clock.now()
  await setAgents($, rows => turnStarted(rows, id, at))
}
export async function noteTurnEnd($: EngineInterface, id: string, reason: TurnCompleteReason): Promise<void> {
  const at = await $.clock.now()
  await setAgents($, rows => turnEnded(rows, id, reason, at))
}
export async function noteActivity($: EngineInterface, id: string): Promise<void> {
  const at = await $.clock.now()
  await setAgents($, rows => touched(rows, id, at))
}

const str = (x: unknown): string | null => (typeof x === 'string' && x ? x : null)

// The Workflow tool's answer (d.ts 22332-22352): a run by its runId; a call with none
// (remote, or its check failed) by the call's own id.
export async function noteWorkflowCall($: EngineInterface, toolUseId: string, r: ToolCallResult): Promise<void> {
  if (r.deny !== undefined) return                  // refused: no run
  const at = await $.clock.now()
  const res = (r.isError ? {} : r.result ?? {}) as Record<string, unknown>
  const runId = str(res['runId'])
  const error = r.isError ? (r.text ?? 'the Workflow call failed') : str(res['error'])
  await setRuns($, runs => launched(runs, {
    key: runId ?? 'call:' + toolUseId, runId, name: str(res['workflowName']),
    remote: res['taskType'] === 'remote_agent' || res['status'] === 'remote_launched', error, at,
  }))
}

let listing = false
export async function pollAgents($: EngineInterface): Promise<void> {
  if (listing) return
  listing = true
  try {
    const infos = await $.agent.list()
    const cur = await read($, agentsA)
    if (JSON.stringify(listed(cur, infos)) !== JSON.stringify(cur)) await update($, agentsA, rows => listed(rows, infos))
  } catch { /* no list yet (the session not bound): the rows stay */ } finally {
    listing = false
  }
}

export type AgentsView = { agents: AgentRow[]; workflows: WorkflowRow[]; cols: number }

export async function readAgents($: EngineInterface, cols: number): Promise<AgentsView> {
  return { agents: await read($, agentsA), workflows: await read($, workflowsA), cols }
}

type Seg = { text: string; color?: Color; dim?: boolean; bold?: boolean }
type Line = { key: string; segs: Seg[] }
type Els = { Box: ElementConstructor<BoxProps>; Text: ElementConstructor<TextProps> }

const STATUS_ORDER: AgentStatus[] = ['pending', 'running', 'waiting', 'idle', 'completed', 'failed', 'killed']
const STATUS_COLOR: Record<AgentStatus, Color> = {
  pending: 'warning', running: 'warning', waiting: 'warning', idle: 'inactive', completed: 'success', failed: 'error', killed: 'error',
}
const cut = (s: string, room: number) => (s.length <= room ? s : s.slice(0, Math.max(1, room - 1)) + '…')
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
const nameOf = (r: AgentRow) => r.name || r.description || r.id
const statusSeg = (r: AgentRow, pad = 0): Seg =>
  r.status === null ? { text: 'not listed'.padEnd(pad), dim: true } : { text: r.status.padEnd(pad), color: STATUS_COLOR[r.status] }
const runTitle = (v: AgentsView, runId: string) => v.workflows.find(w => w.runId === runId)?.name ?? runId

export function agentLines(v: AgentsView): Line[] {
  if (!v.agents.length) {
    return [{ key: 'none', segs: [{ text: 'no agents in this session yet - subagents, teammates and workflow agents show here as they start', dim: true }] }]
  }
  const n = (s: AgentStatus | null) => v.agents.filter(r => r.status === s).length
  const words = [...STATUS_ORDER.map(s => [n(s), s] as const), [n(null), 'not listed'] as const]
    .filter(([k]) => k > 0).map(([k, s]) => `${k} ${s}`)
  const lines: Line[] = [{ key: 'agents:count', segs: [{ text: [plural(v.agents.length, 'agent'), ...words].join(' · ') }] }, { key: '', segs: [] }]
  const wide = v.cols >= WIDE
  if (wide) {
    lines.push({ key: 'agents:cols', segs: [{ text: 'name'.padEnd(20) + 'type'.padEnd(16) + 'model'.padEnd(18) + 'status'.padEnd(12) +
      'started'.padEnd(10) + 'last'.padEnd(10) + 'workflow', dim: true }] })
  }
  for (const r of agentOrder(v.agents)) {
    const wf = r.runId ? runTitle(v, r.runId) : null
    if (wide) {
      lines.push({ key: 'agent:' + r.id, segs: [
        { text: cut(nameOf(r), 18).padEnd(20) + cut(r.type, 15).padEnd(16) + cut(r.model ?? '-', 16).padEnd(18) },
        statusSeg(r, 12),
        { text: hms(r.startedAt).padEnd(10) + hms(r.lastAt).padEnd(10) + (wf ?? '-') },
      ] })
    } else {
      const s = statusSeg(r)
      lines.push({ key: 'agent:' + r.id, segs: [
        { text: '●', color: s.color, dim: s.dim }, { text: ' ' + cut(nameOf(r), Math.max(8, v.cols - 34)) + '  ' }, s,
        { text: '  started ' + hms(r.startedAt), dim: true },
      ] })
      lines.push({ key: 'agentd:' + r.id, segs: [{ text: '    ' +
        [r.type, r.model ?? '-', 'last ' + hms(r.lastAt), ...(wf ? ['wf ' + wf] : [])].join(' · '), dim: true }] })
    }
  }
  return lines
}

export function workflowLines(v: AgentsView): Line[] {
  if (!v.workflows.length) return [{ key: 'wf:none', segs: [{ text: 'no workflow run in this session yet', dim: true }] }]
  const runs = v.workflows.map((r, i) => ({ r, i })).sort((a, b) => b.r.startedAt - a.r.startedAt || a.i - b.i).map(x => x.r)
  const lines: Line[] = [{ key: 'wf:count', segs: [{ text: plural(runs.length, 'workflow run') }] }]
  const count = (k: number, w: string, color: Color): Seg => (k ? { text: `${k} ${w}`, color } : { text: `${k} ${w}`, dim: true })
  for (const r of runs) {
    lines.push({ key: '', segs: [] })
    lines.push({ key: 'wf:' + r.key, segs: [{ text: '●', color: statusColor(workflowStatus(v.agents, r)) }, { text: ' ' }, { text: r.name ?? r.runId ?? 'Workflow call', bold: true }, { text: '  started ' + hms(r.startedAt), dim: true }] })
    if (r.error) lines.push({ key: 'wfc:' + r.key, segs: [{ text: '    ■ ' + r.error, color: 'error' }] })
    else if (r.remote) lines.push({ key: 'wfc:' + r.key, segs: [{ text: '    remote - its agents run in the cloud, not reported here', dim: true }] })
    else {
      const c = countsOf(v.agents, r)
      lines.push({ key: 'wfc:' + r.key, segs: [{ text: '    ' }, count(c.done, 'done', 'success'), { text: ' · ' },
        count(c.running, 'running', 'warning'), { text: ' · ' }, count(c.failed, 'failed', 'error'), { text: '  ' + (r.runId ?? ''), dim: true }] })
    }
  }
  lines.push({ key: '', segs: [] }, { key: 'wf:phase', segs: [{ text: 'phase: not shown - the engine reports no workflow phase', dim: true }] })
  return lines
}

function draw(els: Els, lines: Line[]): RenderElement[] {
  const { Box, Text } = els
  return lines.map(l => l.key
    ? <Box key={l.key}><Text wrap="truncate-end">{l.segs.map(s => <Text color={s.color} dimColor={s.dim} bold={s.bold}>{s.text}</Text>)}</Text></Box>
    : <Text> </Text>)
}

export const AgentsTab = (els: Els, v: AgentsView): RenderElement[] => draw(els, agentLines(v))
export const WorkflowsTab = (els: Els, v: AgentsView): RenderElement[] => draw(els, workflowLines(v))
