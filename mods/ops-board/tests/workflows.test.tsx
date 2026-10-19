import { test, expect } from 'claude-code/testing'
import { agentWorld, mountTab, RUN, spawnIn, start, SURFACES } from './agentworld'

// F53: the Workflows tab. A run from the Workflow tool's answer (name, runId) and
// agent.spawn's workflow.runId; its agents done / running / failed from their spawns
// and turn.complete; started when first seen. No phase: the engine reports none.

const wfAgent = (d: string, i: number, runId = 'wf_r1') =>
  spawnIn({ description: d, tool_use_id: 'tu-wf', workflow: { runId, agentIndex: i } })
const end = (agentId: string, reason: 'answer' | 'error' | 'aborted') =>
  ({ answer: '', durationMs: 1000, isAborted: reason === 'aborted', turnId: 't-' + agentId, agentId, reason })

for (const surface of SURFACES) {
  test(`${surface}: a run - its name, started, agents done / running / failed; phase said not reported`, async ($, on) => {
    const [w, clock] = agentWorld(on)
    await start($, clock)
    await $.tool.call({ tool: 'Workflow', name: 'deep-review', tool_use_id: 'tu-wf' })
    for (const [d, i] of [['r1', 1], ['r2', 2], ['r3', 3]] as const) await $.agent.spawn(wfAgent(d, i))
    w.spawn = () => ({ deny: 'over the cap' })
    await $.agent.spawn(wfAgent('r4', 4))
    await $.turn.complete(end('a-r1', 'answer'))
    await $.turn.complete(end('a-r2', 'error'))
    await clock.settle()
    const ui = await mountTab($, surface, 'workflows', 54)
    const text = async (key: string) => (await ui.find({ key }))?.text
    expect(await text('wf:count')).toBe('1 workflow run')
    expect(await text('wf:wf_r1')).toBe('deep-review  started 14:02:11')
    expect(await text('wfc:wf_r1')).toBe('    1 done · 1 running · 2 failed  wf_r1')
    expect(JSON.stringify(await ui.find({ key: 'wfc:wf_r1' }))).toContain('"color":"error"')
    expect(await text('wf:phase')).toBe('phase: not shown - the engine reports no workflow phase')
    expect(w.lists).toBe(0)                                // the Workflows tab never reads $.agent.list()
    await ui.unmount()
  })
}

test('live: the counts move as its agents start and end, while the tab is shown', async ($, on) => {
  const [, clock] = agentWorld(on)
  await start($, clock)
  await $.tool.call({ tool: 'Workflow', name: 'deep-review', tool_use_id: 'tu-wf' })
  const ui = await mountTab($, 'terminal', 'workflows', 96)
  const counts = async () => (await ui.find({ key: 'wfc:wf_r1' }))?.text
  expect(await counts()).toBe('    0 done · 0 running · 0 failed  wf_r1')
  await $.agent.spawn(wfAgent('r1', 1))
  await clock.settle()
  expect(await counts()).toBe('    0 done · 1 running · 0 failed  wf_r1')
  await $.turn.complete(end('a-r1', 'answer'))
  await clock.settle()
  expect(await counts()).toBe('    1 done · 0 running · 0 failed  wf_r1')
  await $.agent.spawn(wfAgent('r2', 2))
  await $.turn.complete(end('a-r2', 'aborted'))
  await clock.settle()
  expect(await counts()).toBe('    1 done · 0 running · 1 failed  wf_r1')
  await ui.unmount()
})

test('a run met first through its agents shows its id, then its name once the Workflow call answers', async ($, on) => {
  const [, clock] = agentWorld(on)
  await start($, clock)
  await $.agent.spawn(wfAgent('r1', 1))
  await clock.settle()
  const ui = await mountTab($, 'terminal', 'workflows', 96)
  const text = async (key: string) => (await ui.find({ key }))?.text
  expect(await text('wf:wf_r1')).toBe('wf_r1  started 14:02:11')
  await clock.advance(3000)
  await $.tool.call({ tool: 'Workflow', name: 'deep-review', tool_use_id: 'tu-wf' })
  await clock.settle()
  expect(await text('wf:wf_r1')).toBe('deep-review  started 14:02:11')     // started stays the earliest seen
  expect(await text('wf:count')).toBe('1 workflow run')
  await ui.unmount()
})

test('a remote run: no runId and its agents not reported here - said, not counted', async ($, on) => {
  const [w, clock] = agentWorld(on)
  w.workflow = { status: 'remote_launched', taskId: 'task-9', taskType: 'remote_agent', workflowName: 'cloud-sweep', sessionUrl: 'https://claude.ai/code/s' }
  await start($, clock)
  await $.tool.call({ tool: 'Workflow', name: 'cloud-sweep', tool_use_id: 'tu-cloud' })
  await clock.settle()
  const ui = await mountTab($, 'terminal', 'workflows', 96)
  expect((await ui.find({ key: 'wf:call:tu-cloud' }))?.text).toBe('cloud-sweep  started 14:02:11')
  expect((await ui.find({ key: 'wfc:call:tu-cloud' }))?.text).toBe('    remote - its agents run in the cloud, not reported here')
  await ui.unmount()
})

test('a Workflow call that failed its check shows the engine\'s error, in red', async ($, on) => {
  const [w, clock] = agentWorld(on)
  w.workflow = { status: 'async_launched', taskId: 'task-8', error: 'meta must be a pure literal' }
  await start($, clock)
  await $.tool.call({ tool: 'Workflow', name: 'broken', tool_use_id: 'tu-bad' })
  await clock.settle()
  const ui = await mountTab($, 'terminal', 'workflows', 96)
  expect((await ui.find({ key: 'wf:call:tu-bad' }))?.text).toBe('Workflow call  started 14:02:11')
  expect((await ui.find({ key: 'wfc:call:tu-bad' }))?.text).toBe('    ■ meta must be a pure literal')
  expect(JSON.stringify(await ui.find({ key: 'wfc:call:tu-bad' }))).toContain('"color":"error"')
  await ui.unmount()
})

test('no workflow run yet: the tab says so, and no phase line', async ($, on) => {
  const [, clock] = agentWorld(on)
  await start($, clock)
  const ui = await mountTab($, 'terminal', 'workflows', 96)
  expect((await ui.find({ key: 'none' }))?.text).toBe('no workflow run in this session yet')
  expect(await ui.find({ key: 'wf:phase' })).toBeUndefined()
  await ui.unmount()
})

test('/ops workflows opens the pane on Workflows; the agents list is not read for it', async ($, on) => {
  const [w, clock] = agentWorld(on)
  await start($, clock)
  expect((await $.command.run({ command: 'ops', args: 'workflows', ...RUN })).text).toBe('ops board opened on Workflows.')
  await clock.advance(20_000)
  expect(w.lists).toBe(0)
})
