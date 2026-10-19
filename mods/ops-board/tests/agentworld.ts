import { mock } from 'claude-code/testing'
import type { AgentInfo, AgentSpawnInput, AgentSpawnResult, BuiltinToolResults, On, ProcessRunResult } from 'claude-code'
import type { Engine, MockClock } from 'claude-code/testing'

// F53: the engine beneath the plugin for the Agents and Workflows tabs: a repo at /r
// with a one-ticket board, $.agent.list() from w.list (counted), agent.spawn answered
// by w.spawn, the Workflow tool answered with w.workflow; every other script fails.

// Local time, so the clock reads the same in any time zone: Tue 20 Oct 2026 14:02:11.
export const NOW = new Date(2026, 9, 20, 14, 2, 11).getTime()
export const SURFACES = ['terminal', 'desktop'] as const
export const RUN = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 144 } }

export type AgentWorld = {
  list: AgentInfo[]
  lists: number                                   // $.agent.list() calls so far
  spawn: (e: AgentSpawnInput) => AgentSpawnResult
  workflow: BuiltinToolResults['Workflow']
}
const ran = (stdout: string, exitCode = 0, stderr = ''): ProcessRunResult =>
  ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false })

export function agentWorld(on: On): [AgentWorld, MockClock] {
  const w: AgentWorld = {
    list: [], lists: 0,
    spawn: e => ({ model: 'claude-haiku-4-5', agentId: 'a-' + e.description }),
    workflow: { status: 'async_launched', taskId: 'task-1', taskType: 'local_workflow', workflowName: 'deep-review', runId: 'wf_r1' },
  }
  const files: Record<string, string> = { '/r/TICKETS.md': '# Tickets\n\n## Open\n\n- [ ] F1 — one\n' }
  const at = (p: string) => files[p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')]
  const clock = mock.clock(on, { now: NOW })
  mock.env(on, { SKILLATOR_ROOT: '/s', HOME: '/h' })
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.repo', () => ({ value: { root: '/r', remote: null, internal: false, name: 'r' } }))
  on('session.id', () => ({ value: 'sid-1' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('fs.stat', ($, e) => {
    const f = at(e.path)
    return f !== undefined ? { value: { kind: 'file' as const, size: f.length, mtimeMs: 1000, isLink: false } } : { deny: 'ENOENT ' + e.path }
  })
  on('fs.exists', ($, e) => ({ value: at(e.path) !== undefined }))
  on('fs.read', ($, e) => {
    const f = at(e.path)
    return f !== undefined ? { value: f } : { deny: 'ENOENT ' + e.path }
  })
  on('fs.list', ($, e) => ({ deny: 'ENOENT ' + e.path }))
  on('process.run', ($, e) => ({ value: e.argv.join(' ') === 'git config user.email' ? ran('vidul@ikran.in\n') : ran('', 1, 'not in this test') }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('agent.list', () => { w.lists++; return { value: w.list } })
  on('agent.spawn', ($, e) => w.spawn(e))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('tool.call', ($, e) => (e.tool === 'Workflow' ? { result: w.workflow } : { deny: 'not in this test' }))
  return [w, clock]
}

export async function start($: Engine, clock: MockClock) {
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.settle()
}

// agent.spawn's whole input as the engine raises it (d.ts 261-409); the test names the rest.
export const spawnIn = (o: Partial<AgentSpawnInput> & Pick<AgentSpawnInput, 'description'>): AgentSpawnInput => ({
  tool_use_id: 'tu-' + o.description, prompt: 'go', subagentType: 'general-purpose',
  provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-opus-4-5', background: true, fork: false, ...o,
})
export const info = (o: Partial<AgentInfo> & Pick<AgentInfo, 'id'>): AgentInfo =>
  ({ description: 'task', type: 'general-purpose', status: 'running', ...o })

export async function mountTab($: Engine, surface: (typeof SURFACES)[number], tab: 'agents' | 'workflows', bodyColumns: number) {
  const ui = await $.ui.mount({ plugin: 'ops-board', surface, component: 'Pane', requestId: 'ops-board',
    props: { title: 'ops board', isFocused: true, bodyColumns, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} } })
  await ui.press({ key: 'tab:' + tab })
  return ui
}
