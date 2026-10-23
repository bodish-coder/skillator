import { test, expect, mock } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'
import type { Engine, MockClock } from 'claude-code/testing'

// F50: the Runs tab (mock m-plan). relay-morpheus list + chain status per open run;
// a planned run's stage table, what runs in parallel, its parked decisions, ticket
// states as coloured dots; Start run = relay-morpheus queue-run add + the queued
// continue prompt, said with the command that ran; Edit in chat is a hint.

const ROOT = '/s'
const RELAY = ROOT + '/skills/relay-morpheus/hooks/relay-morpheus'
const BOARD = `# Tickets

## Open

- [ ] F46 — tickets pane
- [ ] F47 — assign from the pane
- [~] F48 — watchdog band
- [?] F49 — credit source [decide: @vidul]
- [ ] B2 — cart
`
const row = (id: string, title: string, d: number, t: number, open = '') =>
  `RUN-${id}  ${title.padEnd(42)}  ${d}/${t} done${open ? `  (stage ${open} open)` : ''}`
const LIST = [
  row('0012', 'the ops board', 2, 4, '3'), '          owner: @asha', '          resume: continue RUN-0012',
  row('0014', 'plan from /plan-runs', 0, 3), '          owner: @vidul', '          resume: continue RUN-0014',
  row('0011', 'done before', 3, 3), '          resume: continue RUN-0011',
  '',
].join('\n')
const SEP = '     '
const CHAIN_14 = [
  '## Chain',
  `driver: -${SEP}hold: -${SEP}mode: workflow`,
  '### AB12 - stage 1 - F46 tickets pane',
  'tickets: F46 build/sonnet',
  'files: mods/ops-board/hooks/tickets.tsx',
  'prompt: |',
  '  do F46',
  '### AB13 - stage 2 - F47 assign from the pane',
  'tickets: F47 build/sonnet',
  'files: mods/ops-board/hooks/tickets.tsx',
  'after: 1',
  'prompt: |',
  '  do F47',
  '### AB14 - stage 3 - F48 watchdog band',
  'tickets: F48 deep/build',
  'files: mods/ops-board/hooks/band.tsx',
  'prompt: |',
  '  do F48',
  '## Decisions',
  'asks: end',
  '### Q1 open 2026-10-18T09:00Z',
  'parked: planning',
  'ticket: F49',
  'question: credit source?',
  'answer: -',
  '',
].join('\n')
const CHAIN_12 = [
  '## Chain',
  `driver: @cc-4ae496 2026-10-18T08:00Z${SEP}hold: -${SEP}mode: workflow`,
  '### AA01 - stage 3 - B2 cart',
  'tickets: B2 build/sonnet',
  'files: web/cart.tsx',
  'prompt: |',
  '  x',
  '',
].join('\n')

type World = {
  files: Record<string, string>
  list: string
  queue: ProcessRunResult
  runs: (readonly string[])[]
  submits: string[]
  toasts: string[]
  inFlight: number; maxInFlight: number   // chain status calls running at once
}
const ran = (stdout: string, exitCode = 0, stderr = ''): ProcessRunResult =>
  ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false })

function world(on: On, env: Record<string, string> = {}): [World, MockClock] {
  const w: World = {
    files: { '/r/TICKETS.md': BOARD, [ROOT + '/skills/tickets-zordon/scripts/ticket-meta.sh']: '#!/bin/sh\n' },
    list: LIST, queue: ran('queued: RUN-0014\n'), runs: [], submits: [], toasts: [], inFlight: 0, maxInFlight: 0,
  }
  const at = (p: string) => p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')
  const clock = mock.clock(on, { now: new Date(2026, 9, 18, 12, 0).getTime() })
  mock.env(on, { SKILLATOR_ROOT: ROOT, HOME: '/h', ...env })
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.repo', () => ({ value: { root: '/r', remote: null, internal: false, name: 'r' } }))
  on('session.id', () => ({ value: 'sid-1' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [] } }))
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
  on('fs.list', ($, e) => ({ deny: 'ENOENT ' + e.path }))
  on('process.run', async ($, e) => {
    const a = e.argv
    if (a.join(' ') === 'git config user.email') return { value: ran('vidul@ikran.in\n') }
    w.runs.push(a)
    if (a[1] === RELAY + '.sh' && a[2] === 'list') return { value: ran(w.list) }
    if (a[1] === RELAY + '.sh' && a[3] === 'chain' && a[4] === 'status') {
      w.maxInFlight = Math.max(w.maxInFlight, ++w.inFlight)
      for (let i = 0; i < 200; i++) await Promise.resolve()   // stays in flight a while, no timer
      w.inFlight--
      return { value: a[2] === 'RUN-0014' ? ran(CHAIN_14) : a[2] === 'RUN-0012' ? ran(CHAIN_12) : ran('', 1, 'no such run') }
    }
    if (a[1] === RELAY + '.sh' && a[2] === 'queue-run') return { value: w.queue }
    if (a.includes('decide')) return { value: ran('UNOBSERVABLE\n') }
    return { value: ran('', 1, 'not in this test') }
  })
  on('prompt.submit', ($, e) => { w.submits.push(e.text); return { text: e.text } })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.toast', ($, e) => { w.toasts.push(e.text); return { value: undefined } })
  on('ui.status', () => ({ value: undefined }))
  return [w, clock]
}

async function start($: Engine, clock: MockClock) {
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.settle()
}
const SURFACES = ['terminal', 'desktop'] as const
const PANE = { title: 'ops board', isFocused: true, bodyColumns: 96, placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 40 }, view: {} }
async function runsTab($: Engine, surface: (typeof SURFACES)[number]) {
  const ui = await $.ui.mount({ plugin: 'ops-board', surface, component: 'Pane', requestId: 'ops-board', props: PANE })
  await ui.press({ key: 'tab:runs' })
  return ui
}
// m-plan's columns: stage 7, ticket 8, work 26, after 8, files.
const cols = (s: string, t: string, wk: string, af: string, f: string) => s.padEnd(7) + t.padEnd(8) + wk.padEnd(26) + af.padEnd(8) + f
const statuses = (w: World) => w.runs.filter(a => a[3] === 'chain' && a[4] === 'status')

for (const surface of SURFACES) {
  test(`${surface}: m-plan - a planned run's stages, what runs in parallel, parked decisions, Start run`, async ($, on) => {
    const [w, clock] = world(on)
    await start($, clock)
    const ui = await runsTab($, surface)
    const text = async (key: string) => (await ui.find({ key }))?.text
    // chain status is read for the runs not all done only
    expect(statuses(w).map(a => a[2]).sort()).toEqual(['RUN-0012', 'RUN-0014'])
    expect(await text('run:RUN-0014')).toBe('RUN-0014  plan from /plan-runs  owner @vidul  3 tickets → 3 stages')
    expect(await text('cols:RUN-0014')).toBe(cols('stage', 'ticket', 'work', 'after', 'files'))
    expect(await text('stage:RUN-0014:1')).toBe(cols('  1', '● F46', 'tickets pane', '-', 'mods/ops-board/hooks/tickets.tsx'))
    expect(await text('stage:RUN-0014:2')).toBe(cols('  2', '● F47', 'assign from the pane', '1', 'same file as 1, so after 1'))
    expect(await text('stage:RUN-0014:3')).toBe(cols('  3', '● F48', 'watchdog band', '-', 'mods/ops-board/hooks/band.tsx'))
    expect(await text('par:RUN-0014')).toBe('runs in parallel: 1 and 3 · then 2')
    expect(await text('dec:RUN-0014:0')).toBe('parked  Q1 ● F49 credit source? - planning waits on it')
    expect(await text('edit:RUN-0014')).toBe('Edit in chat: /skillator:plan-runs F46 F47 F48')
    // Ticket state is colour, never a bracket code: F48 in progress is amber, F49 violet.
    expect(JSON.stringify(await ui.find({ key: 'stage:RUN-0014:3' }))).toContain('"color":"warning"')
    expect(JSON.stringify(await ui.find({ key: 'dec:RUN-0014:0' }))).toContain('"color":"permission"')
    expect(await text('stage:RUN-0014:3')).not.toContain('[~]')
    // a dispatched run: no Start, its stage open
    expect(await text('run:RUN-0012')).toBe('RUN-0012  the ops board  owner @asha  2/4 done')
    expect(await text('stage:RUN-0012:3')).toContain('open')
    expect(await ui.find({ key: 'start:RUN-0012' })).toBeUndefined()
    // a finished run is counted, not drawn
    expect(await ui.find({ key: 'run:RUN-0011' })).toBeUndefined()
    expect(await text('finished')).toBe('1 finished run not shown')

    await ui.press({ key: 'start:RUN-0014' })
    expect(w.runs.filter(a => a[2] === 'queue-run')).toEqual([['/bin/sh', RELAY + '.sh', 'queue-run', 'add', 'RUN-0014']])
    expect(w.submits).toHaveLength(1)
    expect(w.submits[0]).toStartWith('continue RUN-0014')
    expect(w.toasts.at(-1)).toContain('✓ RUN-0014 queued')
    expect(w.toasts.at(-1)).toContain(`ran: /bin/sh ${RELAY}.sh queue-run add RUN-0014`)
    await ui.unmount()
  })
}

test('Start run: queue-run add refusing is said with its words and the command; no prompt goes', async ($, on) => {
  const [w, clock] = world(on)
  w.queue = ran('', 2, 'REFUSED: RUN-0014 is already queued\n')
  await start($, clock)
  const ui = await runsTab($, 'terminal')
  await ui.press({ key: 'start:RUN-0014' })
  expect(w.submits).toEqual([])
  expect(w.toasts.at(-1)).toContain('■ RUN-0014 not queued: REFUSED: RUN-0014 is already queued')
  expect(w.toasts.at(-1)).toContain(`ran: /bin/sh ${RELAY}.sh queue-run add RUN-0014`)
  await ui.unmount()
})

test('Windows: list, chain status and queue-run add go through the ps1', async ($, on) => {
  const [w, clock] = world(on, { OS: 'Windows_NT' })
  await start($, clock)
  const ui = await runsTab($, 'terminal')
  const ps = ['C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', RELAY + '.ps1']
  expect(w.runs).toContainEqual([...ps, '-Mode', 'list'])
  await ui.press({ key: 'tab:runs' })
  await ui.unmount()
})

test('the runs poll: every 30 s on the Runs tab, never on another tab', async ($, on) => {
  const [w, clock] = world(on)
  await start($, clock)
  const ui = await runsTab($, 'terminal')
  const n = statuses(w).length
  w.list = LIST.replace(row('0014', 'plan from /plan-runs', 0, 3), row('0014', 'plan from /plan-runs', 1, 3, '1'))
  await clock.advance(30_000)
  expect(statuses(w).length).toBeGreaterThan(n)
  expect((await ui.find({ key: 'run:RUN-0014' }))?.text).toBe('RUN-0014  plan from /plan-runs  owner @vidul  1/3 done')
  await ui.press({ key: 'tab:tickets' })
  const m = statuses(w).length
  await clock.advance(30_000)
  expect(statuses(w)).toHaveLength(m)
  await ui.unmount()
})

test('no relay runs: the tab says how to plan one', async ($, on) => {
  const [w, clock] = world(on)
  w.list = 'no runs in /r/.skillator\n'
  await start($, clock)
  const ui = await runsTab($, 'terminal')
  expect((await ui.find({ key: 'none' }))?.text).toBe('no relay run open - /skillator:plan-runs <tickets> plans one')
  await ui.unmount()
})

test('/ops runs reads the runs on entering the tab', async ($, on) => {
  const [w, clock] = world(on)
  await start($, clock)
  const before = statuses(w).length
  await $.command.run({ command: 'ops', args: 'runs', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 144 } })
  await clock.settle()
  expect(statuses(w).length).toBeGreaterThan(before)
})

// Review fix: the open runs' chain status calls go out together, and while the Runs tab
// polls relay, the 60 s band poll does not list relay again (one relay list per cycle).
test('chain status for the open runs runs in parallel', async ($, on) => {
  const [w, clock] = world(on)
  await start($, clock)
  const ui = await runsTab($, 'terminal')
  expect(statuses(w).map(a => a[2]).sort()).toEqual(['RUN-0012', 'RUN-0014'])
  expect(w.maxInFlight).toBe(2)
  await ui.unmount()
})

test('on the Runs tab the band poll leaves relay list to the runs poll', async ($, on) => {
  const [w, clock] = world(on)
  await start($, clock)
  const ui = await runsTab($, 'terminal')
  await clock.settle()
  const lists = () => w.runs.filter(a => a[2] === 'list').length
  const n = lists()
  await clock.advance(60_000)                          // runs poll at 30 s and 60 s; the band poll at 60 s
  expect(lists() - n).toBe(2)
  await ui.unmount()
})

// Review round 2: no more than two chain status calls at once, however many runs are open.
test('chain status: four open runs, at most two calls in flight, every run asked', async ($, on) => {
  const [w, clock] = world(on)
  w.list = [LIST.trimEnd(), row('0015', 'third', 0, 2), row('0016', 'fourth', 1, 2), ''].join('\n')
  await start($, clock)
  const ui = await runsTab($, 'terminal')
  expect(statuses(w).map(a => a[2]).sort()).toEqual(['RUN-0012', 'RUN-0014', 'RUN-0015', 'RUN-0016'])
  expect(w.maxInFlight).toBe(2)
  await ui.unmount()
})
