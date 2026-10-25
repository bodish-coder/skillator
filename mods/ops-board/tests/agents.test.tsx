import { test, expect } from 'claude-code/testing'
import type { AgentRow } from '../types'
import { endStatus, leadOf, MAX_AGENTS, spawned, touched, treeLines } from '../hooks/lib/agents'
import { agentLines } from '../hooks/agentstab'
import { parseBoard } from '../hooks/lib/board'
import { parseRuns } from '../hooks/lib/runs'
import { agentWorld, info, mountTab, RUN, spawnIn, start, SURFACES } from './agentworld'

// F53: the Agents tab. Rows from agent.spawn (model, started, workflow run),
// $.agent.list() (status, name, type) and the loops' events (last activity, end);
// read-only, nothing the engine does not report ('-' or 'not listed' instead).

const COLS = (n: string, t: string, m: string, s: string, st: string, l: string, wf: string) =>
  n.padEnd(20) + t.padEnd(16) + m.padEnd(18) + s.padEnd(12) + st.padEnd(10) + l.padEnd(10) + wf
const HAIKU = 'claude-haiku-4-5'
const row = (o: Partial<AgentRow> & Pick<AgentRow, 'id'>): AgentRow => ({ kind: 'subagent', name: null, description: o.id,
  type: 'Explore', model: null, status: 'running', startedAt: 0, lastAt: 0, runId: null, listed: false, ...o })

for (const surface of SURFACES) {
  test(`${surface}: wide - a subagent, a teammate and a workflow agent, each with what the engine reported`, async ($, on) => {
    const [w, clock] = agentWorld(on)
    await start($, clock)                                                         // 14:02:11
    await $.agent.spawn(spawnIn({ description: 'scout', subagentType: 'Explore', name: 'scout' }))
    await clock.advance(5000)                                                     // 14:02:16
    await $.agent.spawn(spawnIn({ description: 'pair', subagentType: 'teammate', name: 'pair', isTeammate: true }))
    await $.tool.call({ tool: 'Workflow', name: 'deep-review', tool_use_id: 'tu-wf' })
    await $.agent.spawn(spawnIn({ description: 'review-1', tool_use_id: 'tu-wf', workflow: { runId: 'wf_r1', agentIndex: 1 } }))
    await clock.settle()
    w.list = [
      info({ id: 'a-scout', name: 'scout', description: 'scout', type: 'Explore', status: 'running' }),
      info({ id: 'a-pair', teammateId: 'pair@ops', name: 'pair', description: 'pair', type: 'teammate', status: 'idle' }),
    ]
    const ui = await mountTab($, surface, 'agents', 96)
    const text = async (key: string) => (await ui.find({ key }))?.text
    expect(w.lists).toBe(1)                                    // read once, on entering the tab
    expect(await text('agents:count')).toBe('3 agents · 2 running · 1 idle')
    expect(await text('agents:cols')).toBe(COLS('name', 'type', 'model', 'status', 'started', 'last', 'workflow'))
    expect(await text('agent:a-scout')).toBe(COLS('scout', 'Explore', HAIKU, 'running', '14:02:11', '14:02:11', '-'))
    expect(await text('agent:a-pair')).toBe(COLS('pair', 'teammate', HAIKU, 'idle', '14:02:16', '14:02:16', '-'))
    // a workflow agent: never in the list (d.ts 3268), its run named by the Workflow call's answer
    expect(await text('agent:a-review-1')).toBe(COLS('review-1', 'general-purpose', HAIKU, 'running', '14:02:16', '14:02:16', 'deep-review'))
    // in flight first, newest start first, then arrival
    const keys = (await ui.findAll({ type: 'Box' })).map(b => b.key).filter(k => k?.startsWith('agent:'))
    expect(keys).toEqual(['agent:a-pair', 'agent:a-review-1', 'agent:a-scout'])
    // status is colour as well as a word: in flight amber, idle dim
    expect(JSON.stringify(await ui.find({ key: 'agent:a-scout' }))).toContain('"color":"warning"')
    expect(JSON.stringify(await ui.find({ key: 'agent:a-pair' }))).toContain('"color":"inactive"')
    await ui.unmount()
  })

  test(`${surface}: narrow - below 96 columns each agent folds to two lines`, async ($, on) => {
    const [, clock] = agentWorld(on)
    await start($, clock)
    await $.tool.call({ tool: 'Workflow', name: 'deep-review', tool_use_id: 'tu-wf' })
    await $.agent.spawn(spawnIn({ description: 'review-1', subagentType: 'Explore', tool_use_id: 'tu-wf', workflow: { runId: 'wf_r1', agentIndex: 1 } }))
    await clock.settle()
    const ui = await mountTab($, surface, 'agents', 54)
    const text = async (key: string) => (await ui.find({ key }))?.text
    expect(await ui.find({ key: 'agents:cols' })).toBeUndefined()
    expect(await text('agent:a-review-1')).toBe('● review-1  running  started 14:02:11')
    expect(await text('agentd:a-review-1')).toBe('    Explore · claude-haiku-4-5 · last 14:02:11 · wf deep-review')
    await ui.unmount()
  })
}

test('live: its loop\'s events move last activity and end it, with no poll', async ($, on) => {
  const [, clock] = agentWorld(on)
  await start($, clock)
  await $.agent.spawn(spawnIn({ description: 'scout', subagentType: 'Explore' }))
  const ui = await mountTab($, 'terminal', 'agents', 96)
  const text = async (key: string) => (await ui.find({ key }))?.text
  await clock.advance(30_000)                                                     // 14:02:41
  await $.turn.start({ text: '', turnId: 't-2', agentId: 'a-scout' })
  await clock.settle()
  expect(await text('agent:a-scout')).toBe(COLS('scout', 'Explore', HAIKU, 'running', '14:02:11', '14:02:41', '-'))
  await clock.advance(19_000)                                                     // 14:03:00
  await $.turn.complete({ answer: 'done', durationMs: 19_000, isAborted: false, turnId: 't-2', agentId: 'a-scout', reason: 'answer' })
  await clock.settle()
  expect(await text('agent:a-scout')).toBe(COLS('scout', 'Explore', HAIKU, 'completed', '14:02:11', '14:03:00', '-'))
  expect(await text('agents:count')).toBe('1 agent · 1 completed')
  await ui.unmount()
})

test('the list: its status stands while listed; dropped with no end seen it is "not listed"; read every 5 s on the Agents tab only', async ($, on) => {
  const [w, clock] = agentWorld(on)
  await start($, clock)
  await $.agent.spawn(spawnIn({ description: 'scout', subagentType: 'Explore' }))
  w.list = [info({ id: 'a-scout', description: 'scout', type: 'Explore', status: 'waiting' })]
  const ui = await mountTab($, 'terminal', 'agents', 96)
  const text = async (key: string) => (await ui.find({ key }))?.text
  expect(await text('agent:a-scout')).toBe(COLS('scout', 'Explore', HAIKU, 'waiting', '14:02:11', '14:02:11', '-'))
  w.list = []
  await clock.advance(5000)
  expect(await text('agent:a-scout')).toBe(COLS('scout', 'Explore', HAIKU, 'not listed', '14:02:11', '14:02:11', '-'))
  await ui.press({ key: 'tab:tickets' })
  const n = w.lists
  await clock.advance(20_000)
  expect(w.lists).toBe(n)
  await ui.unmount()
})

test('an agent only the list names (started before this load): model, started and last are not reported, so -', async ($, on) => {
  const [w, clock] = agentWorld(on)
  await start($, clock)
  w.list = [info({ id: 'a-old', name: 'old', description: 'old task', type: 'Plan', status: 'running' })]
  const ui = await mountTab($, 'terminal', 'agents', 96)
  expect((await ui.find({ key: 'agent:a-old' }))?.text).toBe(COLS('old', 'Plan', '-', 'running', '-', '-', '-'))
  await ui.unmount()
})

test('a loop no spawn or list named (an engine fork) is no row; with none, the tab says so', async ($, on) => {
  const [, clock] = agentWorld(on)
  await start($, clock)
  const ui = await mountTab($, 'terminal', 'agents', 96)
  await $.turn.start({ text: '', turnId: 't-f', agentId: 'fork-1' })
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't-f', agentId: 'fork-1', reason: 'answer' })
  await clock.settle()
  expect(await ui.find({ key: 'agent:fork-1' })).toBeUndefined()
  expect((await ui.find({ key: 'none' }))?.text)
    .toBe('no agents in this session yet - subagents, teammates and workflow agents show here as they start')
  await ui.unmount()
})

test('/ops agents opens the pane on Agents and reads the list; an unknown word gives the usage', async ($, on) => {
  const [w, clock] = agentWorld(on)
  await start($, clock)
  const run = (args: string) => $.command.run({ command: 'ops', args, ...RUN })
  expect((await run('agents')).text).toBe('ops board opened on Agents.')
  await clock.settle()
  expect(w.lists).toBe(1)
  expect((await run('bogus')).text).toBe('usage: /ops [tickets|workflows|health|messages|agents|explorer|run|resume] - runs opens Workflows too')
})

test('endStatus: an answer completes a subagent and idles a teammate; aborted is killed; error and refusal fail', () => {
  expect(endStatus('subagent', 'answer')).toBe('completed')
  expect(endStatus('workflow', 'answer')).toBe('completed')
  expect(endStatus('teammate', 'answer')).toBe('idle')
  expect(endStatus('subagent', 'aborted')).toBe('killed')
  expect(endStatus('subagent', 'error')).toBe('failed')
  expect(endStatus('workflow', 'refusal')).toBe('failed')
})

// tool.call's agentId cannot be raised from a test's $ (ToolCallArgs, d.ts 13283): the
// stamp the tool.call hook makes is this fold; the live check sees it in a real loop.
test('touched: last activity moves at most once a second, and only on a known row', () => {
  const rows = [row({ id: 'a', lastAt: 1000 })]
  expect(touched(rows, 'a', 1500)).toBe(rows)
  expect(touched(rows, 'a', 2000)[0]!.lastAt).toBe(2000)
  expect(touched(rows, 'fork-1', 9000)).toBe(rows)
})

test('the rows are capped: past MAX_AGENTS the oldest ended rows go first', () => {
  let rows: AgentRow[] = [row({ id: 'old', status: 'completed' }), row({ id: 'live' })]
  for (let i = 0; i < MAX_AGENTS - 1; i++) {
    rows = spawned(rows, { id: 'n' + i, kind: 'subagent', name: null, description: 'n', type: 'Explore', model: 'm', runId: null, at: i })
  }
  expect(rows).toHaveLength(MAX_AGENTS)
  expect(rows.some(r => r.id === 'old')).toBe(false)
  expect(rows.some(r => r.id === 'live')).toBe(true)
})

// F85: one tree - run -> workflow / agent, each row led by the stage it serves; tied to no
// run, a short title of its task. Matched by a chain code in a label, `RUN-<n> s<stage>`
// in a description, or a workflow runId as an In-flight block's `run:` id.
test('F85 tree: leads by chain code, RUN-n sN and the In-flight run id; the rest under no run; the Agents tab gains the lead column', () => {
  const SEP = '     '
  const runs = parseRuns('RUN-0020  marathon                                    1/3 done\n', { 'RUN-0020': [
    '## Stages', '| # | stage | state | owner | heartbeat | landed |', '|---|---|---|---|---|---|',
    '| 136 | AAA8 A155 yoda | x | w | - | a |', '| 137 | AAA9 B10 muse | ~ | w | - | - |', '| 138 | AABA F81 reconcile | ~ | w | - | - |', '',
    '## In flight', '### stage 138 - AABA F81 reconcile  (dispatched 2026-10-18T09:00Z, @cc-f9797c)', 'run: wf_r9', 'prompt: |', '  x', '',
    '## Chain', `driver: -${SEP}hold: -${SEP}mode: workflow`,
    '### AAA8 - stage 136 - A155 yoda', 'tickets: A155', '### AAA9 - stage 137 - B10 muse', 'tickets: B10', '### AABA - stage 138 - F81 reconcile', 'tickets: F81', '',
  ].join('\n') })
  const board = parseBoard(['# Tickets', '', '## Open', '',
    '- [~] B10 — Muse marketplace add installs nothing. It clones (owner 2026-10-25)',
    '- [~] F81 — Ops board reconcile button (owner)', ''].join('\n'), '/r/TICKETS.md', 0, 0)
  const agents = [
    row({ id: 'a1', kind: 'workflow', name: 'AAA9 fix:B10', runId: 'wf_r1' }),
    row({ id: 'a2', description: 'RUN-0020 s138 verify F81' }),
    row({ id: 'a3', description: 'Explore the auth flow. Find every caller (deep)' }),
  ]
  const workflows = [{ key: 'wf_r9', runId: 'wf_r9', name: 'marathon-RUN-0020', remote: false, startedAt: 0, error: null, denied: 0 }]
  expect(leadOf('AAA9 fix:B10', null, runs)).toEqual({ run: 'RUN-0020', n: 137 })
  expect(leadOf('not AAA9X', null, runs)).toBeNull()
  const txt = (ls: { segs: { text: string }[] }[]) => ls.map(l => l.segs.map(x => x.text).join(''))
  expect(txt(treeLines(runs[0]!, runs, agents, workflows, board))).toEqual([
    '  ● s138 F81 Ops board reconcile button  workflow marathon-RUN-0020',
    '  ● s137 B10 Muse marketplace add installs nothing  workflow AAA9 fix:B10  running',
    '  ● s138 F81 Ops board reconcile button  subagent Explore  running',
  ])
  expect(txt(treeLines(null, runs, agents, workflows, board))).toEqual(['  ● Explore the auth flow  subagent Explore  running'])
  const lines = agentLines({ agents, workflows, cols: 120, runs, board })
  expect(lines.find(l => l.key === 'agents:cols')!.segs[0]!.text).toStartWith('stage'.padEnd(30) + 'name')
  expect(lines.find(l => l.key === 'agent:a1')!.segs[0]!.text).toStartWith('s137 B10 Muse marketplace a…  ')
  expect(lines.find(l => l.key === 'agent:a3')!.segs[0]!.text).toStartWith('no run'.padEnd(30) + 'Explore the auth')
  // no run read yet: no lead column, as before
  expect(agentLines({ agents, workflows, cols: 120 }).find(l => l.key === 'agents:cols')!.segs[0]!.text).toStartWith('name')
})
