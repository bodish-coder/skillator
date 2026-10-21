import { test, expect, mock } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'
import type { Engine, MockClock } from 'claude-code/testing'

// F49: the Health tab (mocks m-health, m-health-hold). Usage from this session's own
// host reading (else its own watch-cortana files), each figure with its age, stale past
// 15 minutes; relay-morpheus's own hold decision on that reading; credit (none on this
// host) apart from spend; the machine facts, worded as the band colours them.

const GB = 1073741824
// Local times, so weekday and clock read the same in any time zone: Sun 18 Oct 2026 12:15.
const NOW = new Date(2026, 9, 18, 12, 15).getTime()
const FIVE_RESET = new Date(2026, 9, 18, 14, 20).toISOString()
const SEVEN_RESET = new Date(2026, 9, 22, 9, 0).toISOString()
const ROOT = '/s'
const RELAY = ROOT + '/skills/relay-morpheus/hooks/relay-morpheus'
const BOARD = '# Tickets\n\n## Open\n\n- [ ] F1 — one\n'
const kv = (disk: number, mem: number, extra: string[] = []) =>
  [`DRIVE=C:`, `DISK_FREE=${disk}`, `DISK_TOTAL=${1000 * GB}`, `MEM_FREE=${mem}`, ...extra, ''].join('\n')
const GREEN_KV = kv(18253611008, 3435973836, ['HOLD=-'])
const RELAY_LIST = 'RUN-0012  the ops board                                2/4 done  (stage 3 open)\n'

type Rate = { kind: string; percentUsed: number; resetsAt?: string }
type World = {
  files: Record<string, string>
  flags: { name: string; mtimeMs: number }[]
  machine: string
  decide: string
  rate: Rate[]
  cost: number | null
  runs: (readonly string[])[]
}
const ran = (stdout: string, exitCode = 0, stderr = ''): ProcessRunResult =>
  ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false })
const WATCH = '/h/.claude/handoff-watch'

function world(on: On, env: Record<string, string> = {}): [World, MockClock] {
  const w: World = {
    files: { '/r/TICKETS.md': BOARD, [ROOT + '/skills/tickets-zordon/scripts/ticket-meta.sh']: '#!/bin/sh\n' },
    flags: [], machine: GREEN_KV, decide: 'RELEASE 41\n', cost: null, runs: [],
    rate: [{ kind: 'five_hour', percentUsed: 41, resetsAt: FIVE_RESET }, { kind: 'seven_day', percentUsed: 55, resetsAt: SEVEN_RESET }],
  }
  const at = (p: string) => p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')
  const clock = mock.clock(on, { now: NOW })
  mock.env(on, { SKILLATOR_ROOT: ROOT, HOME: '/h', ...env })
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.repo', () => ({ value: { root: '/r', remote: null, internal: false, name: 'r' } }))
  on('session.id', () => ({ value: 'sid-1' }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: w.rate,
    ...(w.cost === null ? {} : { cost: { usd: w.cost } }) } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('fs.stat', ($, e) => {
    const f = w.files[at(e.path)]
    return f !== undefined ? { value: { kind: 'file' as const, size: f.length, mtimeMs: 1000, isLink: false } } : { deny: 'ENOENT ' + e.path }
  })
  on('fs.exists', ($, e) => ({ value: w.files[at(e.path)] !== undefined }))
  on('fs.read', ($, e) => {
    const f = w.files[at(e.path)]
    return f !== undefined ? { value: f } : { deny: 'ENOENT ' + e.path }
  })
  on('fs.list', ($, e) => at(e.path) === WATCH
    ? { value: w.flags.map(f => ({ name: f.name, kind: 'file' as const, size: 3, mtimeMs: f.mtimeMs, isLink: false })) }
    : { deny: 'ENOENT ' + e.path })
  on('process.run', ($, e) => {
    const a = e.argv
    if (a.join(' ') === 'git config user.email') return { value: ran('vidul@ikran.in\n') }
    w.runs.push(a)
    if (a.includes('--machine')) return { value: ran(w.machine) }
    if (a.includes('decide')) return { value: ran(w.decide) }
    if (a.includes('list')) return { value: ran(RELAY_LIST) }
    if (a.includes('hold')) return { value: ran('watchdog: held\n') }
    return { value: ran('', 1, 'not in this test') }
  })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  return [w, clock]
}

async function start($: Engine, clock: MockClock) {
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.settle()
}
const SURFACES = ['terminal', 'desktop'] as const
const PANE = { title: 'ops board', isFocused: true, bodyColumns: 70, placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 40 }, view: {} }
async function health($: Engine, surface: (typeof SURFACES)[number]) {
  const ui = await $.ui.mount({ plugin: 'ops-board', surface, component: 'Pane', requestId: 'ops-board', props: PANE })
  await ui.press({ key: 'tab:health' })
  return ui
}
const bar = (pct: number) => '█'.repeat(Math.round(pct / 100 * 22)) + '░'.repeat(22 - Math.round(pct / 100 * 22))
// m-health's columns: a 9-wide label, a 26-wide figure, the word.
const row = (label: string, fig: string, word: string) => label.padEnd(9) + fig.padEnd(26) + word
const decides = (w: World) => w.runs.filter(a => a.includes('decide'))

for (const surface of SURFACES) {
  test(`${surface}: m-health - bars, resets, relay's decision, no credit source, machine ok`, async ($, on) => {
    const [w, clock] = world(on)
    await start($, clock)
    const ui = await health($, surface)
    const text = async (key: string) => (await ui.find({ key }))?.text
    expect(await text('h:usage')).toBe('USAGE')
    expect(await text('u:five')).toBe(`5-hour  ${bar(41)}  41%`)
    expect(await text('r:five')).toBe('        resets today 14:20 · in 2h 05m')
    expect(await text('u:seven')).toBe(`7-day   ${bar(55)}  55%`)
    expect(await text('r:seven')).toBe('        resets Thu 22 Oct 09:00')
    expect(await text('relay')).toBe('relay: stages run (RELEASE 41)')
    expect(await text('decide')).toBe('same decision relay-morpheus makes: chain decide --level "src=host 5h=41 7d=55 ctx=- max=-"')
    // relay-morpheus decided it, on this session's own line, never empty.
    expect(decides(w)).toEqual([['sh', RELAY + '.sh', 'chain', 'decide', '--level', 'src=host 5h=41 7d=55 ctx=- max=-']])
    expect(await text('h:credit')).toBe('CREDIT')
    expect(await text('credit')).toBe('not available · this host exposes no credit source')
    expect(await ui.find({ key: 'spend' })).toBeUndefined()
    expect(await ui.find({ key: 'cost' })).toBeUndefined()
    expect(await text('h:machine')).toBe('MACHINE')
    expect(await text('disk')).toBe(row('disk C:', '17 GB free of 1000 GB', 'ok'))
    expect(await text('mem')).toBe('memory   3.2 GB free               ok')
    expect(await text('locks')).toBe('locks    none stale                ok')
    await ui.unmount()
  })

  test(`${surface}: m-health-hold - relay says HOLD 82: the hold, what finishes, when it resumes`, async ($, on) => {
    const [w, clock] = world(on)
    w.rate = [{ kind: 'five_hour', percentUsed: 82, resetsAt: FIVE_RESET }, { kind: 'seven_day', percentUsed: 61 }]
    w.decide = 'HOLD 82\n'
    await start($, clock)
    const ui = await health($, surface)
    const text = async (key: string) => (await ui.find({ key }))?.text
    expect(await text('u:five')).toBe(`5-hour  ${bar(82)}  82%`)
    expect(await text('u:seven')).toBe(`7-day   ${bar(61)}  61%`)
    expect(await ui.find({ key: 'r:seven' })).toBeUndefined()
    expect(await text('hold')).toBe('▲ 5-hour hold reached (82%)')
    expect(await text('hold:run')).toBe('RUN-0012 finishes its stage in flight, then holds.')
    expect(await text('hold:when')).toBe('It resumes on its own after 14:20.')
    expect(await text('decide')).toBe('same decision relay-morpheus makes: chain decide --level "src=host 5h=82 7d=61 ctx=- max=-"')
    expect(await ui.find({ key: 'relay' })).toBeUndefined()
    await ui.unmount()
  })
}

test('HOLD 91 7d: the 7-day stop, waiting for its reset', async ($, on) => {
  const [w, clock] = world(on)
  w.rate = [{ kind: 'five_hour', percentUsed: 41 }, { kind: 'seven_day', percentUsed: 91, resetsAt: SEVEN_RESET }]
  w.decide = 'HOLD 91 7d\n'
  await start($, clock)
  const ui = await health($, 'terminal')
  expect((await ui.find({ key: 'hold' }))?.text).toBe('■ 7-day hold reached (91%)')
  expect((await ui.find({ key: 'hold:when' }))?.text).toBe('It waits for the 7-day reset (Thu 22 Oct 09:00), or your go past it.')
  await ui.unmount()
})

test('spend limit and this session spend are shown as spend, apart from credit', async ($, on) => {
  const [w, clock] = world(on)
  w.rate.push({ kind: 'spend_limit', percentUsed: 34 })
  w.cost = 1.234
  await start($, clock)
  const ui = await health($, 'terminal')
  expect((await ui.find({ key: 'credit' }))?.text).toBe('not available · this host exposes no credit source')
  expect((await ui.find({ key: 'spend' }))?.text).toBe('spend limit 34% used')
  expect((await ui.find({ key: 'cost' }))?.text).toBe('this session spent $1.23 (from /cost)')
  await ui.unmount()
})

test('no host reading: this session\'s weekly flag file, 3h old, shows its age and stale; the decision drops it', async ($, on) => {
  const [w, clock] = world(on)
  w.rate = []
  w.decide = 'UNOBSERVABLE\n'
  w.flags = [{ name: 'sid-1.weekly', mtimeMs: NOW - 3 * 3600_000 }]
  w.files[WATCH + '/sid-1.weekly'] = '55\n'
  await start($, clock)
  const ui = await health($, 'terminal')
  expect((await ui.find({ key: 'u:five' }))?.text).toBe('5-hour  not available')
  expect((await ui.find({ key: 'u:seven' }))?.text).toBe(`7-day   ${bar(55)}  55% (3h old, stale) · watch-cortana`)
  expect((await ui.find({ key: 'relay' }))?.text).toBe('relay: no usage reading (UNOBSERVABLE)')
  // A stale figure never decides a hold; the line is still never empty.
  expect(decides(w).at(-1)?.at(-1)).toBe('src=none 5h=- 7d=- ctx=- max=-')
  await ui.unmount()
})

test('a flag file named for another session is ignored: not available', async ($, on) => {
  const [w, clock] = world(on)
  w.rate = []
  w.flags = [{ name: 'sid-2.weekly', mtimeMs: NOW - 60_000 }, { name: 'sid-2', mtimeMs: NOW - 60_000 }]
  w.files[WATCH + '/sid-2.weekly'] = '55\n'
  w.files[WATCH + '/sid-2'] = '40\n'
  await start($, clock)
  const ui = await health($, 'terminal')
  expect((await ui.find({ key: 'u:five' }))?.text).toBe('5-hour  not available')
  expect((await ui.find({ key: 'u:seven' }))?.text).toBe('7-day   not available')
  await ui.unmount()
})

// A140: 16 minutes on the mock clock run every wait due on the way - ~720 timer
// callbacks (2 s board poll x480, 5 s agents x192, 30 s runs x32, 60 s slow x16),
// measured at 300-640 ms per simulated minute: 6-8 s of real work, past the 5 s default.
test('a host figure past 15 minutes shows its age and stale, and is re-decided without it', { timeoutMs: 30_000 }, async ($, on) => {
  const [w, clock] = world(on)
  await start($, clock)
  w.rate = []                                   // no new reading: the last one ages
  await clock.advance(16 * 60_000)
  const ui = await health($, 'terminal')
  expect((await ui.find({ key: 'u:seven' }))?.text).toBe(`7-day   ${bar(55)}  55% (16m old, stale)`)
  expect(decides(w).at(-1)?.at(-1)).toBe('src=none 5h=- 7d=- ctx=- max=-')
  // decided again only when the line changed, not on every poll
  const n = decides(w).length
  await clock.advance(60_000)
  expect(decides(w)).toHaveLength(n)
  await ui.unmount()
})

test('Windows: the decision runs through the ps1 with -Text', async ($, on) => {
  const [w, clock] = world(on, { OS: 'Windows_NT' })
  await start($, clock)
  expect(decides(w)[0]).toEqual(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', RELAY + '.ps1',
    '-Mode', 'chain', '-Action', 'decide', '-Text', 'src=host 5h=41 7d=55 ctx=- max=-'])
})

test('machine below a threshold: the words agree with the colour', async ($, on) => {
  const [w, clock] = world(on)
  w.machine = kv(Math.round(0.97 * GB), Math.round(1.99 * GB), ['LOCK=.skillator/run.md.lock|34|pid 1', 'HOLD=-'])
  await start($, clock)
  const ui = await health($, 'terminal')
  const disk = await ui.find({ key: 'disk' })
  expect(disk?.text).toBe(row('disk C:', '0.9 GB free of 1000 GB', 'below 1 GB'))
  expect(JSON.stringify(disk)).toContain('"color":"error"')
  expect((await ui.find({ key: 'mem' }))?.text).toBe('memory   1.9 GB free               low')
  expect((await ui.find({ key: 'locks' }))?.text).toBe('locks    1 stale, not deleted      stale')
  await ui.unmount()
})

test('no machine facts yet, no usage at all: said, never a figure', async ($, on) => {
  const [w, clock] = world(on)
  w.machine = ''
  w.rate = []
  await start($, clock)
  const ui = await health($, 'terminal')
  expect((await ui.find({ key: 'machine' }))?.text).toBe('machine facts not read yet')
  expect((await ui.find({ key: 'u:five' }))?.text).toBe('5-hour  not available')
  await ui.unmount()
})

// Review round 2, R6: an empty hold file (HOLD=? -) is held, its reason unknown.
test('a hold with no reason: held (reason unknown)', async ($, on) => {
  const [w, clock] = world(on)
  w.machine = kv(18253611008, 3435973836, ['HOLD=? -'])
  await start($, clock)
  const ui = await health($, 'terminal')
  expect((await ui.find({ key: 'held' }))?.text).toBe('held     held (reason unknown) - /ops resume to release')
  await ui.unmount()
})
