import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeEngine } from '../engine'
import { initial } from '../state'
import type { Host } from '../nodehost'
import { spawnArgv } from '../nodehost'

const host = (): Host => ({
  win: false, skillsDir: '/s', repoRoot: '/fixture',
  run: async () => ({ code: 0, out: '', err: '', argv: [] }),
  stat: async () => null, read: async () => '', gitEmail: async () => null,
})
const engine = (h: Host) => makeEngine({ host: h, state: initial(100, 40, 0), email: null, once: false, onChange() {}, onQuit() {} })

test('F137: rejected commands become visible failed results, then recover on success', async () => {
  const h = host(), e = engine(h)
  h.run = async () => { throw new Error('fixture denied') }
  try {
    await e.key({ name: '6' })
    assert.match(e.state.toast ?? '', /run-entries scan failed.*fixture denied/)
    assert.match(e.state.notes.join('\n'), /run-scan failed.*fixture denied/)
    h.run = async () => ({ code: 0, out: 'scan complete', err: '', argv: ['fixture-scan'] })
    await e.key({ name: 'r' })
    assert.match(e.state.toast ?? '', /✓ scan complete/)
    assert.doesNotMatch(e.state.notes.join('\n'), /run-scan failed/)
  } finally { e.stop() }
})

test('F137: detached poll rejection is visible; stop suppresses late failures', async () => {
  const h = host(), e = engine(h)
  h.stat = async () => { throw new Error('fixture stat denied') }
  try {
    await e.start()
    assert.match(e.state.notes.join('\n'), /board poll failed.*fixture stat denied/)
  } finally { e.stop() }
  const h2 = host(), e2 = engine(h2)
  let reject!: (err: Error) => void
  h2.stat = () => new Promise((_, no) => { reject = no })
  const pending = e2.start()
  e2.stop()
  const before = e2.state
  reject(new Error('late failure'))
  await pending
  assert.equal(e2.state, before)
})

test('F137: nonzero background commands show bounded diagnostic and operation', async () => {
  const h = host(), e = engine(h)
  h.run = async () => ({ code: 7, out: '', err: 'fixture failure ' + 'x'.repeat(8000), argv: ['fixture'] })
  try {
    await e.readAll()
    const notes = e.state.notes.join('\n')
    assert.match(notes, /pending-machine failed.*fixture failure/)
    assert.match(notes, /usage-level failed.*fixture failure/)
    assert.ok(e.state.notes.every(n => n.length < 1200))
  } finally { e.stop() }
})

test('F137: rejected git is a failed explorer result and late rejected runs stay stopped', async () => {
  const h = host(), e = engine(h)
  h.git = async () => { throw new Error('fixture git denied') }
  try {
    await e.key({ name: '5' })
    assert.match(e.state.notes.join('\n'), /git failed.*fixture git denied/)
  } finally { e.stop() }
  const h2 = host(), e2 = engine(h2)
  let reject!: (err: Error) => void
  h2.run = () => new Promise((_, no) => { reject = no })
  const pending = e2.key({ name: '6' })
  await new Promise(resolve => setImmediate(resolve))
  e2.stop()
  const before = e2.state
  reject(new Error('late run failure'))
  await pending
  assert.equal(e2.state, before)
})

test('F137: automatic unmute reports success only after writing, and denied writes stay visible', async () => {
  for (const outcome of ['denied', 'success', 'stopped'] as const) {
    const h = host(), e = engine(h)
    let finish!: () => void, reached!: () => void
    const waiting = new Promise<void>(resolve => { reached = resolve })
    h.write = () => new Promise((resolve, reject) => { finish = () => outcome === 'success' ? resolve() : reject(new Error('fixture write denied')); reached() })
    h.run = async call => ({ code: 0, out: call === 'pending-machine' ? 'MEM_FREE=9000000000\nMUTE=force 2026-10-30T00:00:00Z\n' : '', err: '', argv: [] })
    try {
      const pending = e.readAll()
      await waiting
      assert.doesNotMatch(e.state.toast ?? '', /watchdog unmuted/)
      assert.ok(e.state.machine?.mute)
      if (outcome === 'stopped') e.stop()
      const before = e.state
      finish()
      await pending
      if (outcome === 'stopped') assert.equal(e.state, before)
      else if (outcome === 'denied') {
        assert.match(e.state.toast ?? '', /mute.*failed.*fixture write denied/)
        assert.doesNotMatch(e.state.toast ?? '', /watchdog unmuted/)
        assert.ok(e.state.machine?.mute)
      } else {
        assert.match(e.state.toast ?? '', /watchdog unmuted/)
        assert.equal(e.state.machine?.mute, undefined)
      }
    } finally { e.stop() }
  }
})

test('F137: spawn failures, nonzero stderr and timeout retain failed command results', async () => {
  const missing = await spawnArgv(['skillator-fixture-missing-executable'], process.cwd(), 1000)
  assert.notEqual(missing.code, 0)
  assert.match(missing.err, /ENOENT|not found|spawn/i)
  assert.deepEqual(missing.argv, ['skillator-fixture-missing-executable'])
  const thrown = await spawnArgv([process.execPath, '\0'], process.cwd(), 1000)
  assert.notEqual(thrown.code, 0)
  assert.ok(thrown.err)
  const nonzero = await spawnArgv([process.execPath, '-e', 'process.stderr.write("fixture denied"); process.exit(7)'], process.cwd(), 3000)
  assert.equal(nonzero.code, 7)
  assert.equal(nonzero.err, 'fixture denied')
  const timed = await spawnArgv([process.execPath, '-e', 'setInterval(() => {}, 1000)'], process.cwd(), 100)
  assert.notEqual(timed.code, 0)
  assert.match(timed.err, /timed out/)
  const bounded = await spawnArgv([process.execPath, '-e', 'process.stderr.write("x".repeat(10000)); process.exit(1)'], process.cwd(), 3000)
  assert.notEqual(bounded.code, 0)
  assert.ok(bounded.err.length <= 4096)
})
