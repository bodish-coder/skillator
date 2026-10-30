import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeEngine } from '../engine'
import { initial } from '../state'
import type { Host } from '../nodehost'

const machine = 'DRIVE=C:\nDISK_FREE=500000000\nDISK_TOTAL=1\nMEM_FREE=9000000000\nHOLD=-\n'
const runFile = JSON.stringify({ entries: [{ id: 'build', name: 'build', kind: 'npm', target: 'build', args: [], cwd: '.', source: 'package.json' }] })
function fixture(pause = -1, missing = false) {
  const calls: string[] = []
  let release = () => {}, reached = () => {}
  const waiting = new Promise<void>(r => { reached = r })
  const gate = new Promise<void>(r => { release = r })
  const op = async <T>(name: string, value: T): Promise<T> => {
    calls.push(name)
    if (calls.length - 1 === pause) { reached(); await gate }
    return value
  }
  let draws = 0, stops = 0
  let out = (_: string) => {}, end = (_: number | null, __: string | null) => {}
  const host: Host = {
    win: false, skillsDir: '/s', repoRoot: '/r', inboxDir: '/common/skillator',
    stat: p => op('stat ' + p, missing && p.endsWith('run.json') ? null : { mtimeMs: 1, size: 50 }),
    read: p => op('read ' + p, p.endsWith('run.json') ? runFile : p.endsWith('TICKETS.md') ? '- [ ] F1 — Example\n' : ''),
    run: call => op('run ' + call, { code: 0, err: '', argv: [], out: call === 'pending-machine' ? machine : call === 'usage-level' ? 'src=codex 5h=41 7d=55 ctx=- max=-\n' : call === 'relay-list' ? 'RUN-0099  fixture run  1/2 done  (stage 2 open)\n' : call === 'relay-resume' ? '# Resuming .skillator/workflows/test.md\n' : '' }),
    git: args => op('git ' + args.join(' '), { code: 0, err: '', out: '', argv: [] }),
    write: (p, text) => op('write ' + p, undefined),
    bins: () => op('bins', { npm: ['/bin/npm'], sh: '/bin/sh', ps: null, make: null }),
    gitEmail: async () => null,
    spawn: (argv, cwd, onOut, onEnd) => { calls.push('spawn'); out = onOut; end = onEnd; return { stop() { stops++ } } },
  }
  const e = makeEngine({ host, state: initial(100, 40, 0), email: null, once: false, onChange: () => { draws++ }, onQuit: () => {} })
  return { e, calls, waiting, release, get draws() { return draws }, get stops() { return stops }, out: (s: string) => out(s), end: () => end(0, null) }
}

for (const scenario of ['facts', 'runs', 'runfile', 'scan', 'explorer', 'force'] as const) {
  test(`A176: stop ignores every deferred ${scenario} completion`, async () => {
    const action = async (f: ReturnType<typeof fixture>) => {
      if (scenario === 'facts') await f.e.readAll()
      else if (scenario === 'force') { await f.e.key({ name: '3' }); await f.e.key({ name: 'F' }) }
      else await f.e.key({ name: scenario === 'runs' ? '2' : scenario === 'explorer' ? '5' : '6' })
    }
    const control = fixture(-1, scenario === 'scan')
    // A scan completes with a missing file; the follow-up read does not scan again.
    await action(control)
    control.e.stop()
    if (scenario === 'facts') assert.ok(control.calls.includes('run relay-hold'))
    if (scenario === 'force') assert.ok(control.calls.includes('write /r/.skillator/watchdog.mute'))
    const indices = control.calls.map((_, i) => i)
    if (scenario === 'facts') indices.sort((a, b) => Number(control.calls[b] === 'run pending-machine') - Number(control.calls[a] === 'run pending-machine'))
    for (const i of indices) {
      const f = fixture(i, scenario === 'scan')
      const pending = action(f)
      await f.waiting
      f.e.stop()
      const state = f.e.state, draws = f.draws, calls = [...f.calls]
      f.release()
      await pending
      assert.deepEqual(f.calls, calls, `new operation after ${calls.at(-1)}`)
      assert.equal(f.e.state, state, `state changed after ${calls.at(-1)}`)
      assert.equal(f.draws, draws)
      await f.e.key({ name: '6' })
      await f.e.point({ kind: 'tab', tab: 'run' })
      f.e.resize(80, 20)
      await f.e.readAll()
      await f.e.start()
      f.e.stop()
      assert.deepEqual(f.calls, calls)
      assert.equal(f.e.state, state)
    }
  })
}

test('A176: stop clears owned timers and stops the job once without requiring onEnd', async t => {
  const timers = new Set<unknown>()
  t.mock.method(globalThis, 'setInterval', () => { const timer = {}; timers.add(timer); return timer })
  t.mock.method(globalThis, 'clearInterval', timer => { timers.delete(timer) })
  const f = fixture()
  await f.e.start()
  await f.e.key({ name: '6' })
  await f.e.key({ name: 'return' })
  await f.e.key({ name: 'return' })
  assert.ok(f.calls.includes('spawn'))
  assert.equal(timers.size, 4)
  f.e.stop()
  f.e.stop()
  const state = f.e.state, draws = f.draws
  f.out('late output')
  f.end()
  assert.equal(f.stops, 1)
  assert.equal(timers.size, 0)
  assert.equal(f.e.state, state)
  assert.equal(f.draws, draws)
})
