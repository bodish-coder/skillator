import type { Color } from 'claude-code'
import type { Board, Box, RunView, SeatUsage, Stage, Ticket } from '../../types'
import type { Seg } from './bandlines'
import type { Line } from './healthlines'
import { paint } from './board'

// F50, design §8: the Runs tab's lines (mock m-plan) and the continue prompt.
// Ticket state is a coloured dot from the board, never a bracket code. Pure;
// runstab.tsx draws them.

export type RunLine = Line

// F76: the Workflows tab (id 'runs') holds two sections, Runs (relay runs) and Workflows (the Workflow
// tool's runs), each a header with its count that opens and closes as F61's groups.
// Both start open, so the merged tab first shows every row the two old tabs did.
// F93: the pane adds Agents (the old Agents tab); the ops app has no agent source.
export type RunsSection = 'runs' | 'workflows' | 'agents'
export const RUNS_SECTIONS: RunsSection[] = ['runs', 'workflows']
const SECTION_WORD: Record<RunsSection, string> = { runs: 'Runs', workflows: 'Workflows', agents: 'Agents' }
// '▾ Runs (2)' / '▸ Workflows (1)'; n null: no count is known (none read yet, or not observable).
export const sectionHead = (sec: RunsSection, open: boolean, n: number | null) =>
  `${open ? '▾' : '▸'} ${SECTION_WORD[sec]}${n === null ? '' : ` (${n})`}`

// F76 (owner): a run, a stage and a Workflow run each carry a `●` in its status colour,
// the colour the Tickets tab gives the matching ticket state, so done, in progress and
// pending read the same in every tab: completed = [x], running = [~], pending (not
// started) = [ ], failed = [!] (red, as before). A section header takes the colour of
// the most pressing status in it: running, then failed, pending, completed.
export type RunStatus = 'completed' | 'running' | 'pending' | 'failed' | 'rejected'
const STATUS_BOX: Record<RunStatus, Box> = { completed: 'x', running: '~', pending: ' ', failed: '!', rejected: '-' }
export const statusColor = (st: RunStatus): Color => paint(STATUS_BOX[st])
// Relay counts landed, re-planned and rejected stages as closed.
export const isFinished = (r: RunView) => r.total > 0 && r.done >= r.total
// Active runs in list order, then the finished ones - a finished run sorts below every active one.
export const orderRuns = (runs: RunView[]) => [...runs.filter(r => !isFinished(r)), ...runs.filter(isFinished)]
// A run: all landed = completed, planned (nothing dispatched) = pending, else running -
// a failed stage shows red on its own row.
export const runStatus = (r: RunView): RunStatus =>
  isFinished(r) ? 'completed' : r.planned ? 'pending' : 'running'
// Rejected stages are terminal and have their own status.
export const stageStatus = (s: Stage, planned: boolean): RunStatus =>
  planned ? 'pending' : s.state === 'rejected' ? 'rejected' : s.state === 'x' ? 'completed' : s.state === '~' || s.state === 'open' ? 'running' : s.state === '!' ? 'failed' : 'pending'
const PRESSING: RunStatus[] = ['running', 'failed', 'pending', 'completed']
export const sectionStatus = (all: RunStatus[]): RunStatus | null => PRESSING.find(st => all.includes(st)) ?? null

export const continuePrompt = (id: string) =>
  `continue ${id}: drive its chain with skillator:relay-morpheus (chain next / chain dispatch)`

// F85: a run with a /gauntlet-plan script beside it is a workflow run; else the Chain
// header's mode, else agents.
export const modeOf = (r: RunView) => (r.phases ? 'workflow' : r.mode ?? 'agents')
// The first phase with an unclosed stage; -1 means none.
export const nextPhase = (r: RunView) =>
  r.phases?.findIndex(ph => ph.some(it => !['x', '>', 'rejected'].includes(r.stages.find(s => s.n === it.n)?.state ?? ''))) ?? -1

// F85: engage - relay-morpheus.sh's DRIVER_STALE default: a driver stamp younger is live.
export const DRIVER_STALE_MIN = 20
export type EngageCheck = { text: string; queue: boolean } | { refused: string }
// Never two drivers: a stage in flight, or a driver stamp under 20 min, refuses. A run with
// a script runs it with /gauntlet-run; one without is queued (queue-run add) and continued.
// F99: a driver stamp's age in minutes. relay writes `<tag> YYYY-MM-DDTHH:MMZ`; a stamp that
// does not read so is NaN (engageOf then fails closed: not stale).
export const stampAge = (stamp: string | undefined, now: number) => {
  const at = /^\d{4}-\d\d-\d\dT\d\d:\d\dZ$/.test(stamp ?? '') ? Date.parse(stamp!.replace(/Z$/, ':00Z')) : NaN
  return Math.floor((now - at) / 60_000)
}
export function engageOf(r: RunView, now: number): EngageCheck {
  if (isFinished(r)) return { refused: `■ ${r.id} not engaged: all ${r.total} stages landed - nothing left to drive` }   // F99
  const [tag, stamp] = (r.driver ?? '').split(' ')
  const flying = r.stages.find(s => s.state === '~')
  if (flying) {
    const by = r.flights.find(f => f.n === flying.n)?.by || tag || 'a driver not named'
    return { refused: `■ ${r.id} not engaged: stage ${flying.n} is in flight, driven by ${by} - never two drivers` }
  }
  const age = stampAge(stamp, now)
  if (tag && !(age >= DRIVER_STALE_MIN)) {
    const beat = Number.isNaN(age) ? `heartbeat unreadable: ${stamp ?? '-'}` : `heartbeat ${age}m ago, stale at ${DRIVER_STALE_MIN}m`
    return { refused: `■ ${r.id} not engaged: driven by ${tag} (${beat}) - never two drivers` }
  }
  return r.phases ? { text: `/skillator:gauntlet-run ${r.id}`, queue: false } : { text: continuePrompt(r.id), queue: true }
}

// F85: a short title - up to the first '. ' or ' (', as /pending cuts one, at most 40 wide.
export const shortTitle = (s: string) => cut(s.split(/\. | \(/)[0]!.trim(), 40)
// Finished runs use a dim header and no Engage.
export const finishedLine = (r: RunView): Line =>
  ({ key: 'run:' + r.id, segs: [{ text: '●', color: statusColor('completed') }, { text: ` ${r.id}  ${r.title}  ${r.done}/${r.total} done`, dim: true }] })
// The lead of a row serving stage n of a run: `s137 B10 Muse marketplace add installs nothing`.
export function stageLead(r: RunView, n: number, board: Board | null): string {
  const st = r.stages.find(s => s.n === n)
  const id = st ? ticketsOf(st)[0] : r.phases?.flat().find(it => it.n === n)?.ticket
  const title = board?.tickets.find(t => t.id === id)?.title ?? (st ? workOf(st) : '')
  return [`s${n}`, id, shortTitle(title)].filter(Boolean).join(' ')
}

const STATE_WORD: Record<string, string> = {
  x: 'landed', '~': 'in flight', '!': 'failed', '?': 'parked', '>': 're-planned', rejected: 'rejected', open: 'open', pending: 'pending',
}
const cut = (s: string, room: number) => (s.length <= room ? s : s.slice(0, Math.max(1, room - 1)) + '…')
// A stage's ticket ids; exported as stageTickets, apart from team.ts's ticketsOf.
const ticketsOf = (s: Stage) => s.ticket.split(/\s+/).filter(Boolean)
export function usageText(seats: SeatUsage[]): string {
  if (!seats.length) return ''
  const time = seats.flatMap(s => s.elapsedMs === null ? [] : [s.elapsedMs])
  const costs = seats.flatMap(s => s.usd === undefined ? [] : [s.usd])
  const tokens = seats.flatMap(s => s.tokens === undefined || s.usd !== undefined ? [] : [s.tokens])
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
  const minutes = sum(time) / 60_000
  const wall = time.length ? `${minutes > 0 && minutes < 0.01 ? '<0.01' : minutes.toFixed(2)} min seat time${time.length < seats.length ? ' (partial)' : ''}` : 'seat time unavailable'
  const dollars = sum(costs)
  const usage = [
    ...(costs.length ? [dollars > 0 && dollars < 0.0001 ? '<$0.0001' : '$' + dollars.toFixed(4)] : []),
    ...(tokens.length ? [`${sum(tokens)} tokens`] : []),
  ].join(' + ')
  return wall + ' · ' + (usage ? usage + (costs.length + tokens.length < seats.length ? ' (partial usage)' : '') : 'usage unavailable')
}

export const runUsage = (r: RunView) => usageText(r.stages.flatMap(s => s.seats ?? []))

export function runDetails(r: RunView): Line[] {
  const lines: Line[] = []
  const total = runUsage(r)
  if (total) lines.push({ key: 'usage:' + r.id, segs: [{ text: 'Run total · ' + total, dim: true }] })
  const tickets = new Map<string, SeatUsage[]>()
  for (const s of r.stages) {
    if (s.triage) lines.push({ key: `triage:${r.id}:${s.n}`, segs: [
      { text: `s${s.n} ${s.ticket} · ${s.triage}` },
      { text: [s.triageScope, s.triageWhy].filter(Boolean).map(t => ' · ' + t).join(''), dim: true },
    ] })
    if (s.seats?.length) {
      const label = s.ticket || `stage ${s.n}`
      const records = tickets.get(label) ?? []
      records.push(...s.seats)
      tickets.set(label, records)
    }
  }
  for (const [ticket, records] of tickets) {
    lines.push({ key: `usage:${r.id}:${ticket}`, segs: [{ text: ticket + ' · ' + usageText(records) }] })
  }
  return lines
}

const afterOf = (s: Stage) => s.after.split(/[\s,]+/).filter(x => /^\d+$/.test(x)).map(Number)

function dot(board: Board | null, id: string): Seg {
  const t = board?.tickets.find(x => x.id === id)
  return t ? { text: '●', color: paint(t.box) } : { text: '●', dim: true }
}
function ticketSegs(board: Board | null, ids: string[]): Seg[] {
  if (!ids.length) return [{ text: '-' }]
  return ids.flatMap((id, i) => [...(i ? [{ text: ' ' }] : []), dot(board, id), { text: ' ' + id }])
}
const width = (segs: Seg[]) => segs.reduce((n, s) => n + s.text.length, 0)

// "1 and 3 · then 2": stages whose `after` stages are all in earlier waves run together.
export function waves(stages: Stage[]): number[][] {
  const own = new Set(stages.map(s => s.n))
  const left = new Map(stages.map(s => [s.n, afterOf(s).filter(a => own.has(a) && a !== s.n)]))
  const done = new Set<number>()
  const out: number[][] = []
  while (left.size) {
    let wave = [...left].filter(([, deps]) => deps.every(d => done.has(d))).map(([n]) => n)
    if (!wave.length) wave = [...left.keys()]            // a cycle: the rest, as they stand
    for (const n of wave) { done.add(n); left.delete(n) }
    out.push(wave)
  }
  return out
}
export function wavesText(stages: Stage[]): string {
  const ws = waves(stages)
  const and = (w: number[]) => (w.length > 1 ? `${w.slice(0, -1).join(', ')} and ${w.at(-1)}` : String(w[0]))
  return `${ws.some(w => w.length > 1) ? 'runs in parallel' : 'runs in order'}: ${ws.map(and).join(' · then ')}`
}

// The stage's work: its title without the ticket ids it starts with.
function workOf(s: Stage): string {
  const ids = new Set(ticketsOf(s))
  const words = s.title.split(' ')
  while (words.length > 1 && ids.has(words[0]!)) words.shift()
  return words.join(' ')
}

export function runLines(run: RunView, board: Board | null): Line[] {
  const lines: Line[] = []
  const owner: Seg[] = run.owner ? [{ text: '  ' }, { text: 'owner', dim: true }, { text: ' ' + run.owner }] : []
  const ids = [...new Set(run.stages.flatMap(ticketsOf))]
  // F85: the run's mode, and `planned` for a run nothing of which has started
  const tail = modeOf(run) + ' · ' + (run.planned
    ? `planned · ${ids.length} ticket${ids.length === 1 ? '' : 's'} → ${run.stages.length} stage${run.stages.length === 1 ? '' : 's'}`
    : `${run.done}/${run.total} done`)
  lines.push({ key: 'run:' + run.id, segs: [{ text: '●', color: statusColor(runStatus(run)) }, { text: ' ' }, { text: run.id, color: 'suggestion' }, { text: '  ' + run.title }, ...owner, { text: '  ' + tail, dim: run.planned }] })
  if (!run.stages.length) return lines
  const tw = Math.max(8, ...run.stages.map(s => width(ticketSegs(board, ticketsOf(s))) + 2))
  const head = 'stage'.padEnd(7) + 'ticket'.padEnd(tw) + 'work'.padEnd(26) + 'after'.padEnd(8) + 'files'
  lines.push({ key: 'cols:' + run.id, segs: [{ text: head, dim: true }] })
  for (const s of run.stages) {
    const tk = ticketSegs(board, ticketsOf(s))
    const pad = ' '.repeat(Math.max(0, tw - width(tk)))
    const after = afterOf(s)
    const same = s.files !== '-' ? run.stages.find(o => o.n !== s.n && after.includes(o.n) && o.files === s.files) : undefined
    const files: Seg = same ? { text: `same file as ${same.n}, so after ${same.n}`, dim: true } : { text: s.files }
    const word = run.planned ? '' : STATE_WORD[s.state] ?? ''
    lines.push({ key: `stage:${run.id}:${s.n}`, segs: [
      { text: '●', color: statusColor(stageStatus(s, run.planned)) }, { text: ` ${s.n}`.padEnd(6) }, ...tk, { text: pad + cut(workOf(s), 24).padEnd(26) + s.after.padEnd(8) }, files,
      ...(word ? [{ text: '  ' + word, color: (s.state === '!' ? 'error' : s.state === 'x' ? 'success' : undefined) as Color | undefined, dim: s.state === 'pending' }] : []),
    ] })
  }
  lines.push(...runDetails(run))
  if (run.planned && run.stages.length > 1) {
    const t = wavesText(run.stages)
    const [lead, rest] = [t.slice(0, t.indexOf(':') + 1), t.slice(t.indexOf(':') + 1)]
    lines.push({ key: 'par:' + run.id, segs: [{ text: lead, dim: true }, { text: rest }] })
  }
  // F85: the script's phases, each with its stages and tickets; the next one marked
  const next = nextPhase(run)
  run.phases?.forEach((ph, k) => {
    lines.push({ key: `phase:${run.id}:${k + 1}`, segs: [{ text: `phase ${k + 1}`, dim: k !== next },
      { text: '  ' + ph.map(it => `s${it.n} ${it.ticket}`).join(' · ') },
      ...(k === next ? [{ text: '  ← next', color: 'suggestion' as Color }] : [])] })
  })
  run.decisions.forEach((d, i) => {
    const m = /^(Q\d+) (\S+) (.*)$/.exec(d)
    lines.push({ key: `dec:${run.id}:${i}`, segs: m
      ? [{ text: 'parked', color: 'permission' }, { text: '  ' + m[1] + ' ' }, dot(board, m[2]!), { text: ` ${m[2]} ${m[3]}` }]
      : [{ text: 'parked', color: 'permission' }, { text: '  ' + d }] })
  })
  return lines
}

export { ticketsOf as stageTickets }

// F113 / A196: canonical Start Run command builder shared by standalone ops/state.ts and native hooks/runstab.tsx.
export type RunnerChoice = 'gauntlet-run' | 'pending-sentinel'
export type ModeChoice = 'sequential' | 'parallel'

export function startRunCmd(
  runner: RunnerChoice,
  mode: ModeChoice,
  tickets: readonly string[] | string,
  count?: number | null,
): string {
  const runnerCmd = `/${runner}`
  const modeStr = mode === 'parallel' && count ? `parallel ${count}` : mode
  const ticketsStr = (typeof tickets === 'string' ? tickets : tickets.join(' ')).trim().replace(/\s+/g, ' ')
  return [runnerCmd, modeStr, ticketsStr].filter(Boolean).join(' ')
}

export function eligibleRunTickets(board: Board | readonly Ticket[] | null | undefined): Ticket[] {
  const tickets = Array.isArray(board) ? board : (board as Board | null | undefined)?.tickets ?? []
  return tickets.filter(t => t.box === ' ' || t.box === '~' || t.box === '?' || t.box === '!')
}

// A197: structured backend output from `relay-morpheus queue-run push-pending <id> [--mode <mode>]`.
export type FollowupResult = {
  id: string
  moved: number
  stages: string[]
  tickets: string[]
  mode: string
  from: string
}

const FOLLOWUP_RE = /^FOLLOWUP (RUN-\S+) moved=(\d+)(?: stages=(\S+))?(?: tickets=(\S+))? mode=(\S+) from=(RUN-\S+)\s*$/m

export function parseFollowupOut(out: string): FollowupResult | null {
  const m = FOLLOWUP_RE.exec(out)
  if (!m) return null
  const moved = Number(m[2])
  if (!Number.isFinite(moved) || moved <= 0) return null
  const stages = m[3] && m[3] !== '-' ? m[3].split(',').filter(Boolean) : []
  const tickets = m[4] && m[4] !== '-' ? m[4].split(',').filter(Boolean) : []
  return { id: m[1]!, moved, stages, tickets, mode: m[5]!, from: m[6]! }
}
