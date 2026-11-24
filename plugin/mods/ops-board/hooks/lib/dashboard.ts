import type { AgentRow, Board, RunView, WorkflowRow } from '../../types'
import { isOpen } from './board'
import { ageText, classify, DISK, figure, isStale, MEM } from './facts'
import type { HealthView } from './healthlines'
import { runStatus } from './runlines'
import { workflowStatus } from './agents'

type DashboardView = {
  board: Board | null
  health: HealthView
  runs: RunView[] | null
  unread: number
  workflow?: { agents: AgentRow[]; workflows: WorkflowRow[] }
}

export type DashboardPanel = {
  title: string
  summary: string
  details?: string[]
  warning?: boolean
}

export const DASHBOARD_WIDE = 84

export function dashboardPanels({ board, health, runs, unread, workflow }: DashboardView): DashboardPanel[] {
  const tickets = board && !board.error ? board.tickets : []
  const count = (box: Board['tickets'][number]['box']) => tickets.filter(t => t.box === box).length
  const blocked = count('!'), decide = count('?')
  const ticketPanel: DashboardPanel = {
    title: 'Tickets',
    summary: board?.error ? 'Board unavailable' : !board ? 'Reading TICKETS.md' :
      `${tickets.filter(isOpen).length} open / ${blocked} blocked / ${decide} to decide`,
    details: board?.error ? [board.error] : board ? [
      `${count(' ')} pending / ${count('~')} in progress`,
      `${count('%')} testing / ${count('v')} verified / ${count('>')} deferred`,
    ] : undefined,
    warning: !!(board?.error || blocked || decide),
  }

  const { machine, usage, now, relay } = health
  const usageText = (w: NonNullable<HealthView['usage']>['five']) =>
    w ? `${w.pct}%${isStale(w, now) ? ' stale' : w.source === 'watch-cortana' ? ` cached (${ageText(w, now)})` : ''}` : 'unavailable'
  const mem = figure(machine?.memFree ?? null, MEM)
  const disk = figure(machine?.diskFree ?? null, DISK)
  const machineText = machine
    ? `RAM ${mem.text} free / Disk ${disk.text} free`
    : 'Machine facts unavailable'
  const hold = machine?.hold ? 'Watchdog hold' : usage?.decision?.startsWith('HOLD ') ? 'Relay hold' : null
  const watchdog = machine?.watchdogOff ? 'Watchdog off' : machine?.mute ? 'Watchdog muted' : null
  const healthPanel: DashboardPanel = {
    title: 'Health',
    summary: hold ?? watchdog ?? machineText,
    details: [
      ...(hold || watchdog ? [machineText] : []),
      `5h ${usageText(usage?.five ?? null)} / 7d ${usageText(usage?.seven ?? null)}`,
    ],
    warning: !!hold || !!machine && classify(machine).level !== 'green',
  }

  const statuses = runs?.map(runStatus) ?? []
  const running = statuses.filter(s => s === 'running').length
  const planned = statuses.filter(s => s === 'pending').length
  const active = runs?.find(r => runStatus(r) !== 'completed')
  const workflowCount = workflow?.workflows.filter(w => workflowStatus(workflow.agents, w) === 'running').length
  const runPanel: DashboardPanel = {
    title: 'Workflows',
    summary: runs ? `${running} running / ${planned} planned / ${statuses.filter(s => s === 'completed').length} completed` : 'Relay runs unavailable',
    details: [
      ...(active ? [`${active.id} ${active.done}/${active.total} stages`] : relay ? [relay] : []),
      ...(workflowCount !== undefined && workflow?.workflows.length ? [`${workflowCount} live session workflows`] : []),
    ],
  }

  return [ticketPanel, healthPanel, runPanel, {
    title: 'Messages',
    summary: `${unread} unread`,
  }]
}
