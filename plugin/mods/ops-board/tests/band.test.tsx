import { test, expect, mock } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'
import type { Engine, MockClock, Plugin } from 'claude-code/testing'
import { bandLines, bandSegs, countsOf, statusText } from '../hooks/band'
import type { BandInput } from '../hooks/band'
import { classify, parseMachine, usageFrom, STALE_MS } from '../hooks/lib/facts'
import { parseBoard } from '../hooks/lib/board'

// F48: the band above the prompt (always on, green when fine), the watchdog hold on
// red, /ops resume, the status line and the CLAUDE.md restore at session end.

const GB = 1073741824
// Local times, so the weekday reads the same in any time zone: Sun 18 Oct 2026 12:00.
const NOW = new Date(2026, 9, 18, 12, 0).getTime()
const TUE_9 = new Date(2026, 9, 20, 9, 0).toISOString()

const BOARD = `# Tickets

## Open

- [~] F3 — cart drawer keeps items on reload [app: web] [owner: @vidul] (@cc-4ae496)
- [!] B2 — /orders 500s past page 3 [app: api] [by: @asha]
- [?] F2 — /orders endpoint returns the last 20 orders [app: api] [decide: @asha]
- [ ] F1 — product grid on the home page [app: web, ui] [by: @vidul, @asha]
- [ ] B1 — button focus ring missing [app: ui]
- [>] A4 — dark-mode tokens for packages/ui

## Closed

- [x] B3 — login redirect loop
`
const kv = (disk: number, mem: number, extra: string[] = []) =>
  [`DRIVE=C:`, `DISK_FREE=${disk}`, `DISK_TOTAL=${1000 * GB}`, `MEM_FREE=${mem}`, ...extra, ''].join('\n')
const GREEN_KV = kv(18253611008, 3435973836, ['HOLD=-'])
const AMBER_KV = kv(Math.round(4.12 * GB), 3435973836, [
  'LOCK=.skillator/run.md.lock|34|1234 sh MINGW', 'LOCK=TICKETS.md.lock|12|pid 9120', 'HOLD=-'])
const RED_KV = kv(858993459, 3435973836, ['HOLD=-'])
const RELAY_LIST = 'RUN-0011  done before                                  3/3 done\nRUN-0012  the ops board                                2/4 done  (stage 3 open)\n'
const USAGE = usageFrom([{ kind: 'five_hour', percentUsed: 41 }, { kind: 'seven_day', percentUsed: 55, resetsAt: TUE_9 }], null, NOW)
const COUNTS = countsOf(parseBoard(BOARD, 'T', 0, 0))

const input = (machineKv: string, over: Partial<BandInput> = {}): BandInput => {
  const machine = parseMachine(machineKv, NOW)
  return { watch: classify(machine), machine, usage: USAGE, relay: 'RUN-0012 2/4', counts: COUNTS,
    narrow: false, cols: 140, now: NOW, me: null, ...over }
}

// ---- pure: the texts of mocks m-band, m-narrow and the status line ----

test('band, three states: the m-band texts', () => {
  expect(bandLines(input(GREEN_KV))).toEqual(
    ['● ops  disk 17 GB  mem 3.2 GB  5h 41%  7d 55% resets Tue 09:00  relay RUN-0012 2/4  locks ok'])
  expect(bandLines(input(AMBER_KV))).toEqual(
    ['▲ ops  disk 4.1 GB low  mem 3.2 GB  5h 41%  7d 55%  relay RUN-0012 2/4  locks 2 stale'])
  expect(bandLines(input(RED_KV))).toEqual(
    [' ■ HOLD  disk 0.8 GB free (below 1 GB). New relay stages and GREEN runs are held. Free space, then /ops resume. '])
})

test('band: memory red says to free memory; a hold still set reads amber with how to release it', () => {
  expect(bandLines(input(kv(50 * GB, GB - 1)))[0]).toBe(
    ' ■ HOLD  mem 0.9 GB free (below 1 GB). New relay stages and GREEN runs are held. Free memory, then /ops resume. ')
  expect(bandLines(input(kv(50 * GB, 8 * GB, ['HOLD=2026-10-18T09:00Z disk 0.8 GB free (below 1 GB)'])))[0]).toBe(
    '▲ ops  disk 50 GB  mem 8.0 GB  5h 41%  7d 55%  relay RUN-0012 2/4  locks ok  held - /ops resume to release')
})

test('band: unknown figures are ?, no usage reading is -, a stale one shows its age', () => {
  const none = { watch: { level: 'green' as const, reasons: [] }, machine: null, usage: null, relay: null,
    counts: null, narrow: false, cols: 140, now: NOW }
  expect(bandLines(none)).toEqual(['● ops  disk ?  mem ?  5h -  7d -  locks ?'])
  const old = input(GREEN_KV, { now: NOW + STALE_MS + 2 * 3600_000 })
  expect(bandLines(old)[0]).toBe('● ops  disk 17 GB  mem 3.2 GB  5h 41% (2h old)  7d 55% (2h old)  relay RUN-0012 2/4  locks ok  facts 135m old')
})

test('band: cut to its columns - resets go first, then relay', () => {
  expect(bandLines(input(GREEN_KV, { cols: 80 }))).toEqual(['● ops  disk 17 GB  mem 3.2 GB  5h 41%  7d 55%  relay RUN-0012 2/4  locks ok'])
  expect(bandLines(input(GREEN_KV, { cols: 60 }))).toEqual(['● ops  disk 17 GB  mem 3.2 GB  5h 41%  7d 55%  locks ok'])
})

test('narrow band: the m-narrow two lines', () => {
  expect(bandLines(input(GREEN_KV, { narrow: true, cols: 96 }))).toEqual([
    '● ops  5 open ●1 ●1 ●1  RUN-0012 2/4  disk 17 GB  mem 3.2 GB',
    '  5h 41%  7d 55%  /pending  /list-tickets  /ops opens the pane',
  ])
  expect(bandLines(input(AMBER_KV, { narrow: true, cols: 96 }))).toEqual([
    '▲ ops  5 open ●1 ●1 ●1  RUN-0012 2/4  disk 4.1 GB low  mem 3.2 GB',
    '  5h 41%  7d 55%  locks 2 stale  /pending  /list-tickets  /ops opens the pane',
  ])
})

// F95: pending = [ ], in progress = [~], total = every open box; 5h, then 7d while the line stays short.
test('status line: pending | in progress | total · 5h, 7d while short; stale says so; unknown is left out', () => {
  const head = 'ops 2 pending | 1 in progress | 5 total'
  expect(statusText(COUNTS, USAGE, NOW, null)).toBe(`${head} · 5h 41% · 7d 55%`)
  expect(statusText(COUNTS, USAGE, NOW + STALE_MS + 1, null)).toBe(`${head} · 5h 41% (stale)`)
  expect(statusText(COUNTS, null, NOW, null)).toBe(head)
  expect(statusText(COUNTS, usageFrom([{ kind: 'five_hour', percentUsed: 41 }], null, NOW), NOW, null)).toBe(`${head} · 5h 41%`)
  expect(statusText(null, USAGE, NOW, null)).toBe('ops - · 5h 41% · 7d 55%')
  // [%] testing is in the total only; a 244-box board's line is too long for 7d.
  const testing = countsOf(parseBoard('- [~] F1 — a\n- [%] F2 — b\n- [%] F3 — c\n- [!] F4 — d\n- [>] F5 — e\n- [x] F6 — f\n', 'T', 0, 0))
  expect(statusText(testing, null, NOW, null)).toBe('ops 0 pending | 1 in progress | 4 total')
  expect(statusText({ open: 244, progress: 13, testing: 200, blocked: 2, decision: 1 }, USAGE, NOW, null))
    .toBe('ops 28 pending | 13 in progress | 244 total · 5h 41%')
})

// F97: the session owner's handle after `ops`; under STATUS_MAX the 7d goes first, the handle second.
test('status line: F97 the session owner after ops; 7d dropped first, then the handle', () => {
  expect(statusText(COUNTS, USAGE, NOW, '@sher')).toBe('ops @sher 2 pending | 1 in progress | 5 total · 5h 41%')   // 63 with 7d > 60
  expect(statusText(COUNTS, USAGE, NOW, null)).toBe('ops 2 pending | 1 in progress | 5 total · 5h 41% · 7d 55%')
  expect(statusText(null, USAGE, NOW, '@sher')).toBe('ops @sher - · 5h 41% · 7d 55%')
  const big = { open: 244, progress: 13, testing: 200, blocked: 2, decision: 1 }
  expect(statusText(big, USAGE, NOW, '@sher')).toBe('ops @sher 28 pending | 13 in progress | 244 total · 5h 41%')     // 58
  expect(statusText(big, USAGE, NOW, '@shamsher-rao')).toBe('ops 28 pending | 13 in progress | 244 total · 5h 41%')   // 66 > 60: handle off
})

test('band: F97 the session owner after ops on the wide and the narrow line', () => {
  expect(bandLines(input(GREEN_KV, { me: '@sher' }))).toEqual(
    ['● ops @sher  disk 17 GB  mem 3.2 GB  5h 41%  7d 55% resets Tue 09:00  relay RUN-0012 2/4  locks ok'])
  expect(bandLines(input(GREEN_KV, { me: '@sher', narrow: true, cols: 96 }))[0]).toBe(
    '● ops @sher  5 open ●1 ●1 ●1  RUN-0012 2/4  disk 17 GB  mem 3.2 GB')
  expect(bandLines(input(RED_KV, { me: '@sher' }))).toEqual(bandLines(input(RED_KV)))   // red: the HOLD line, no handle
})

// F109: the session's sid rides in the lead, after the handle - on line one when narrow too.
test('band: F109 the session sid after the handle', () => {
  expect(bandLines(input(GREEN_KV, { me: '@sher', session: 'cc-k7q2' }))).toEqual(
    ['● ops @sher cc-k7q2  disk 17 GB  mem 3.2 GB  5h 41%  7d 55% resets Tue 09:00  relay RUN-0012 2/4  locks ok'])
  expect(bandLines(input(GREEN_KV, { session: 'cc-k7q2' }))[0]!.startsWith('● ops cc-k7q2  disk')).toBe(true)
  expect(bandLines(input(GREEN_KV, { me: '@sher', session: 'cc-k7q2', narrow: true, cols: 96 }))[0]).toBe(
    '● ops @sher cc-k7q2  5 open ●1 ●1 ●1  RUN-0012 2/4  disk 17 GB  mem 3.2 GB')
})

// F130: status band shows the addressee of a pending handoff
test('status line & band: F130 pending handoff to teammate ends with → @handle', () => {
  const big = { open: 258, progress: 1, testing: 0, blocked: 0, decision: 0 }
  const u = usageFrom([{ kind: 'five_hour', percentUsed: 1 }, { kind: 'seven_day', percentUsed: 33 }], null, NOW)
  expect(statusText(big, u, NOW, null, '@vidul')).toBe('ops 257 pending | 1 in progress | 258 total · 5h 1% · 7d 33% → @vidul')
  expect(statusText(big, u, NOW, null, null)).toBe('ops 257 pending | 1 in progress | 258 total · 5h 1% · 7d 33%')

  // 120 columns: fits with handoff
  const l120 = bandLines(input(GREEN_KV, { handoff: '@vidul', cols: 120 }))[0]!
  expect(l120.endsWith('→ @vidul')).toBe(true)

  // 80 columns: fits with handoff (relay drops)
  const l80 = bandLines(input(GREEN_KV, { handoff: '@vidul', cols: 80 }))[0]!
  expect(l80.endsWith('→ @vidul')).toBe(true)
  expect(l80.length <= 80).toBe(true)

  // 60 columns: handoff cut before usage figures are
  const l60 = bandLines(input(GREEN_KV, { handoff: '@vidul', cols: 60 }))[0]!
  expect(l60.includes('→ @vidul')).toBe(false)
  expect(l60.includes('5h 41%')).toBe(true)
})

test('countsOf: open excludes deferred and closed', () => {
  expect(COUNTS).toEqual({ open: 5, progress: 1, testing: 0, blocked: 1, decision: 1 })
  expect(countsOf(null)).toBeNull()
})

// F62: [%] testing is open; on the narrow band its dot sits after in progress, before blocked.
test('countsOf: [%] testing counts as open; the narrow band dots it after in progress', () => {
  const c = countsOf(parseBoard('- [~] F1 — a\n- [%] F2 — b (testing: x)\n- [%] F3 — c\n- [!] F4 — d\n- [>] F5 — e\n', 'T', 0, 0))
  expect(c).toEqual({ open: 4, progress: 1, testing: 2, blocked: 1, decision: 0 })
  const segs = bandSegs(input(GREEN_KV, { narrow: true, cols: 96, counts: c }))[0]!
  const dots = segs.filter(s => s.text.startsWith('●') && s.text.length > 1)
  expect(dots.map(s => [s.text, s.color])).toEqual([['●1', 'warning'], ['●2', 'suggestion'], ['●1', 'error']])
})

// ---- the engine: polls, hold, resume, status line, restore ----

const ROOT = '/s'
const RELAY = ROOT + '/skills/relay-morpheus/hooks/relay-morpheus.sh'
type World = {
  files: Record<string, string>
  machine: string
  relay: string
  runs: (readonly string[])[]
  toasts: string[]
  statuses: (string | undefined)[]
  logs: string[]
  rate: { kind: string; percentUsed: number; resetsAt?: string }[]
  held: string | null          // the watchdog hold file: what pending --machine says as HOLD=
  holdFails: boolean
  machineFails: boolean        // pending --machine exits 1
}
const ran = (stdout: string, exitCode = 0, stderr = ''): ProcessRunResult =>
  ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false })

function world(on: On, env: Record<string, string> = {}): [World, MockClock] {
  const w: World = {
    files: { '/r/TICKETS.md': BOARD, [ROOT + '/skills/tickets-zordon/scripts/ticket-meta.sh']: '#!/bin/sh\n' },
    machine: GREEN_KV, relay: RELAY_LIST, runs: [], toasts: [], statuses: [], logs: [],
    rate: [{ kind: 'five_hour', percentUsed: 41 }, { kind: 'seven_day', percentUsed: 55, resetsAt: TUE_9 }],
    held: null, holdFails: false, machineFails: false,
  }
  const at = (p: string) => p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')
  const clock = mock.clock(on, { now: NOW })
  mock.env(on, { SKILLATOR_ROOT: ROOT, HOME: '/h', ...env })
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('session.repo', () => ({ value: { root: '/r', remote: null, internal: false, name: 'r' } }))
  on('session.id', () => ({ value: 'sid-1' }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: w.rate } }))
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
  on('fs.write', ($, e) => { w.files[at(e.path)] = e.text; return { value: undefined } })
  on('process.run', ($, e) => {
    const a = e.argv
    if (a.join(' ') === 'git config user.email') return { value: ran('vidul@ikran.in\n') }
    w.runs.push(a)
    if (a.includes('--machine') && w.machineFails) return { value: ran('', 1, 'pending: cannot read the disk') }
    if (a.includes('--machine')) return { value: ran(w.held ? w.machine.replace('HOLD=-', 'HOLD=' + w.held) : w.machine) }
    if (a[1] === RELAY && a[2] === 'list') return { value: ran(w.relay) }
    if (a[1] === RELAY && a[3] === 'hold') {
      if (w.holdFails) return { value: ran('', 1, 'cannot write the hold file') }
      w.held = `2026-10-18T12:00Z ${a[4]}`
      return { value: ran(`watchdog: held ${w.held}\n`) }
    }
    if (a[1] === RELAY && a[3] === 'release') { w.held = null; return { value: ran('watchdog: released\n') } }
    if (a[0] === 'rm') { delete w.files[a[3]!]; return { value: ran('') } }
    return { value: ran('', 1, 'unexpected call') }
  })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.toast', ($, e) => { w.toasts.push(e.text); return { value: undefined } })
  on('ui.status', ($, e) => { w.statuses.push(e.text); return { value: undefined } })
  on('ui.log', ($, e) => { w.logs.push(e.text); return { value: undefined } })
  return [w, clock]
}

const RUN = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 144 } }
const PEEK: Plugin = {
  name: 'peek',
  register(on) {
    on('command.run', { command: 'peek' }, async ($, e) => {
      const v = e.args === 'notes' ? await $.state.get({ plugin: 'ops-board', key: 'notes' })
        : await $.state.get({ plugin: 'ops-board', key: 'watch' })
      return { text: JSON.stringify(v.value ?? null) }
    })
  },
}
const WITH = { plugins: [PEEK] }

async function start($: Engine, clock: MockClock) {
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.settle()
}
const SURFACES = ['terminal', 'desktop'] as const
const BAND = { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 139, scroll: { offset: 0, bodyRows: 12 }, view: {} }
const mountBand = ($: Engine, surface: (typeof SURFACES)[number], columns = 144, props = BAND) =>
  $.ui.mount({ plugin: 'ops-board', surface, component: 'AbovePrompt', props: { ...props, bodyColumns: columns - 5 },
    viewport: { columns, rows: 40 } })
const holds = (w: World) => w.runs.filter(a => a[3] === 'hold')

for (const surface of SURFACES) {
  test(`${surface}: the band draws green when fine, from the machine poll, relay and usage`, WITH, async ($, on) => {
    const [, clock] = world(on)
    await start($, clock)
    const ui = await mountBand($, surface)
    expect((await ui.find({ key: 'line:0' }))?.text).toBe(
      '● ops cc-icym  disk 17 GB  mem 3.2 GB  5h 41%  7d 55% resets Tue 09:00  relay RUN-0012 2/4  locks ok')
    await ui.unmount()
  })

  test(`${surface}: below 110 columns the band folds to the two narrow lines`, WITH, async ($, on) => {
    const [, clock] = world(on)
    await start($, clock)
    const ui = await mountBand($, surface, 100)
    expect((await ui.find({ key: 'line:0' }))?.text).toBe('● ops cc-icym  5 open ●1 ●1 ●1  RUN-0012 2/4  disk 17 GB  mem 3.2 GB')
    expect((await ui.find({ key: 'line:1' }))?.text).toBe('  5h 41%  7d 55%  /pending  /list-tickets  /ops opens the pane')
    await ui.unmount()
  })

  test(`${surface}: red holds once through relay-morpheus and says why; resume refuses while red, releases after`, WITH, async ($, on) => {
    const [w, clock] = world(on)
    w.machine = RED_KV
    await start($, clock)
    expect(holds(w).map(a => a.slice(2))).toEqual([['watchdog', 'hold', 'disk 0.8 GB free (below 1 GB)']])
    expect(w.toasts.at(-1)).toContain('HOLD - disk 0.8 GB free (below 1 GB). New relay stages and GREEN runs are held.')
    expect(w.toasts.at(-1)).toContain(`ran: /bin/sh ${RELAY} watchdog hold disk 0.8 GB free (below 1 GB)`)
    const ui = await mountBand($, surface)
    expect((await ui.find({ key: 'line:0' }))?.text).toBe(
      ' ■ HOLD  disk 0.8 GB free (below 1 GB). New relay stages and GREEN runs are held. Free space, then /ops resume. ')
    await clock.advance(60_000)
    await clock.advance(60_000)
    expect(holds(w)).toHaveLength(1)                      // staying red holds no second time

    const resume = () => $.command.run({ command: 'ops', args: 'resume', ...RUN })
    expect((await resume()).text).toBe('still red: disk 0.8 GB free (below 1 GB) - not released')
    expect(w.runs.filter(a => a[3] === 'release')).toHaveLength(0)

    w.machine = kv(Math.round(4.12 * GB), 3435973836, ['HOLD=2026-10-18T12:00Z disk 0.8 GB free (below 1 GB)'])
    await clock.advance(60_000)
    expect((await ui.find({ key: 'line:0' }))?.text).toContain('held - /ops resume to release')
    const out = (await resume()).text ?? ''
    expect(w.runs.filter(a => a[3] === 'release').map(a => a.slice(2))).toEqual([['watchdog', 'release']])
    expect(out).toBe(`watchdog: released\nran: /bin/sh ${RELAY} watchdog release`)
    expect((await ui.find({ key: 'line:0' }))?.text).not.toContain('held')
    expect(holds(w)).toHaveLength(1)
    await ui.unmount()
  })
}

// Review fix: while red, every poll checks the hold (HOLD= from pending --machine) and
// holds again when it is not set - a failed hold is retried, an outside release re-held;
// a toast only when the outcome changes.
test('red: a failed hold is retried next poll, an outside release is held again; toasts only on a change', WITH, async ($, on) => {
  const [w, clock] = world(on)
  w.machine = RED_KV
  w.holdFails = true
  await start($, clock)
  expect(holds(w)).toHaveLength(1)
  expect(w.toasts.at(-1)).toContain('the watchdog hold could not be set: cannot write the hold file')
  const n = w.toasts.length
  await clock.advance(60_000)
  expect(holds(w)).toHaveLength(2)                      // retried
  expect(w.toasts).toHaveLength(n)                      // same outcome: no second toast
  w.holdFails = false
  await clock.advance(60_000)
  expect(holds(w)).toHaveLength(3)
  expect(w.toasts).toHaveLength(n + 1)
  expect(w.toasts.at(-1)).toContain('HOLD - disk 0.8 GB free (below 1 GB). New relay stages and GREEN runs are held.')
  await clock.advance(60_000)
  expect(holds(w)).toHaveLength(3)                      // held: not asked again
  w.held = null                                         // released from outside
  await clock.advance(60_000)
  expect(holds(w)).toHaveLength(4)
  expect(w.held).not.toBeNull()
  expect(w.toasts).toHaveLength(n + 1)
})

test('the band yields to a survey', WITH, async ($, on) => {
  const [, clock] = world(on)
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return <Box key="survey"><Text>engine survey</Text></Box>
  })
  await start($, clock)
  const ui = await mountBand($, 'terminal', 144, { ...BAND, hasSurvey: true })
  expect(await ui.find({ key: 'line:0' })).toBeUndefined()
  expect((await ui.find({ key: 'survey' }))?.text).toBe('engine survey')
  await ui.unmount()
})

test('/ops resume when not red: relay-morpheus answers, shown with the command that ran', WITH, async ($, on) => {
  const [w, clock] = world(on)
  await start($, clock)
  const out = await $.command.run({ command: 'ops', args: 'resume', ...RUN })
  expect(out.text).toBe(`watchdog: released\nran: /bin/sh ${RELAY} watchdog release`)
  expect(w.runs.filter(a => a[1] === RELAY && a[2] === 'watchdog').map(a => a[3])).toEqual(['release'])
})

// F87: /ops resume force - releases whatever the reading and mutes memory red (watchdog.mute
// beside the hold) until memory reads green once or /ops watchdog on; disk red still holds.
const MUTE = '/r/.skillator/watchdog.mute'
const MEM_RED_KV = kv(50 * GB, Math.round(0.6 * GB), ['HOLD=-'])
const DISK_RED_KV = kv(Math.round(0.8 * GB), Math.round(0.6 * GB), ['HOLD=-'])
const MEM_GREEN_KV = kv(50 * GB, 3 * GB, ['HOLD=-'])
const releases = (w: World) => w.runs.filter(a => a[3] === 'release')

test('F87: plain /ops resume still refuses on memory red; force releases, writes the mute and says so', WITH, async ($, on) => {
  const [w, clock] = world(on)
  w.machine = MEM_RED_KV
  await start($, clock)
  expect(holds(w)).toHaveLength(1)
  const ops = (args: string) => $.command.run({ command: 'ops', args, ...RUN })
  expect((await ops('resume')).text).toBe('still red: mem 0.6 GB free (below 1 GB) - not released')
  expect(releases(w)).toHaveLength(0)
  const out = (await ops('resume  FORCE')).text ?? ''
  expect(releases(w)).toHaveLength(1)
  expect(w.held).toBeNull()
  expect(w.files[MUTE]).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\dZ mem 0\.6 GB free\n$/)
  expect(out).toMatch(/^watchdog: released\nwatchdog muted \(forced \d\d:\d\dZ\), mem 0\.6 GB free - memory red does not hold until memory reads green once, or \/ops watchdog on; disk red still holds\nran: /)
  const ui = await mountBand($, 'terminal')
  expect((await ui.find({ key: 'line:0' }))?.text).toMatch(/^▲ ops .* watchdog muted \(forced \d\d:\d\dZ\)$/)
  await ui.unmount()
})

test('F87: while muted a memory-red poll does not hold again, disk red does', WITH, async ($, on) => {
  const [w, clock] = world(on)
  w.machine = MEM_RED_KV
  await start($, clock)
  await $.command.run({ command: 'ops', args: 'resume force', ...RUN })
  const n = holds(w).length
  await clock.advance(60_000)
  await clock.advance(60_000)
  expect(holds(w)).toHaveLength(n)                      // memory red, muted: no hold
  expect(w.held).toBeNull()
  w.machine = DISK_RED_KV
  await clock.advance(60_000)
  expect(holds(w)).toHaveLength(n + 1)                  // disk red holds, muted or not
  expect(holds(w).at(-1)?.[4]).toBe('disk 0.8 GB free (below 1 GB)')
})

test('F87: memory green once unmutes - the next memory red holds again; /ops watchdog on unmutes too', WITH, async ($, on) => {
  const [w, clock] = world(on)
  w.machine = MEM_RED_KV
  await start($, clock)
  await $.command.run({ command: 'ops', args: 'resume force', ...RUN })
  const n = holds(w).length
  w.machine = MEM_GREEN_KV
  await clock.advance(60_000)
  expect(w.files[MUTE]).toBe('')
  expect(w.toasts.at(-1)).toBe('watchdog unmuted - memory reads green; memory red holds again')
  w.machine = MEM_RED_KV
  await clock.advance(60_000)
  expect(holds(w)).toHaveLength(n + 1)

  await $.command.run({ command: 'ops', args: 'resume force', ...RUN })
  expect(w.files[MUTE]).not.toBe('')
  const m = holds(w).length
  expect((await $.command.run({ command: 'ops', args: 'watchdog on', ...RUN })).text).toBe('watchdog on: memory red holds again')
  expect(w.files[MUTE]).toBe('')
  expect(holds(w)).toHaveLength(m + 1)                  // the reading it takes holds at once
})

test('F87: the Health tab says muted, and its f key forces the resume', WITH, async ($, on) => {
  const [w, clock] = world(on)
  w.machine = MEM_RED_KV
  await start($, clock)
  const ui = await $.ui.mount({ plugin: 'ops-board', surface: 'terminal', component: 'Pane', requestId: 'ops-board',
    props: { title: 'ops board', isFocused: true, bodyColumns: 120, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} } })
  await ui.press({ key: 'tab:health' })
  await ui.press({ key: 'key:force' })
  expect(releases(w)).toHaveLength(1)
  expect(w.toasts.at(-1)).toContain('watchdog muted (forced ')
  expect((await ui.find({ key: 'muted' }))?.text).toMatch(/^muted {4}watchdog muted \(forced \d\d:\d\dZ\), mem 0\.6 GB free then$/)
  expect((await ui.find({ key: 'muted:how' }))?.text).toContain('memory red does not hold until memory reads green once')
  await ui.unmount()
})

test('stale locks: listed in a note, never deleted; ok dismisses it', WITH, async ($, on) => {
  const [w, clock] = world(on)
  w.machine = AMBER_KV
  await start($, clock)
  const ui = await mountBand($, 'terminal')
  expect((await ui.find({ key: 'line:0' }))?.text).toBe('▲ ops cc-icym  disk 4.1 GB low  mem 3.2 GB  5h 41%  7d 55%  relay RUN-0012 2/4  locks 2 stale')
  const note = (await ui.find({ key: 'note:0' }))?.text ?? ''
  expect(note).toContain('▲ 2 stale locks, not deleted:')
  expect(note).toContain('.skillator/run.md.lock        34 min')
  expect(note).toContain('TICKETS.md.lock               12 min')
  expect(note).toContain('remove them yourself, or ask Claude to check and clear them')
  expect(w.runs.some(a => a.some(x => /^(rm|del|Remove-Item)/.test(x)))).toBe(false)
  await ui.press({ key: 'ok:0' })
  expect(await ui.find({ key: 'note:0' })).toBeUndefined()
  await clock.advance(60_000)                            // the same locks do not come back
  expect(await ui.find({ key: 'note:0' })).toBeUndefined()
  await ui.unmount()
})

test('status line: pending | in progress | total · 5h, updated only when the text changes', WITH, async ($, on) => {
  const [w, clock] = world(on)
  await start($, clock)
  expect(w.statuses.at(-1)).toBe('ops 2 pending | 1 in progress | 5 total · 5h 41% · 7d 55%')
  const n = w.statuses.length
  await clock.advance(4000)
  expect(w.statuses).toHaveLength(n)
  w.rate = [{ kind: 'five_hour', percentUsed: 47 }, { kind: 'seven_day', percentUsed: 61 }]
  await $.session.measure({ context: { window: 200000 }, rateLimits: w.rate, changed: ['rateLimits'] })
  await clock.settle()
  expect(w.statuses.at(-1)).toBe('ops 2 pending | 1 in progress | 5 total · 5h 47% · 7d 61%')
})

// F97: the session owner (ticket-meta iam, written AFTER the mod armed) reaches the status
// line and the band on the next 2 s poll; it wins over the email; gone when its file goes.
// With a handle the line is over STATUS_MAX with 7d, so 7d is left off.
test('status line and band: F97 the session owner file is polled and wins over the email', WITH, async ($, on) => {
  const [w, clock] = world(on)
  w.files['/r/.skillator/team.md'] = '# Team\n\n- @vidul: vidul@ikran.in\n- @sher: s@x\n'
  await start($, clock)
  expect(w.statuses.at(-1)).toBe('ops @vidul 2 pending | 1 in progress | 5 total · 5h 41%')
  w.files['/r/.skillator/sessions/cc-icym.owner'] = '@sher\r\n'          // session.id is 'sid-1' -> cc-icym (F109)
  await clock.advance(2000)
  expect(w.statuses.at(-1)).toBe('ops @sher 2 pending | 1 in progress | 5 total · 5h 41%')
  const ui = await mountBand($, 'terminal')
  expect((await ui.find({ key: 'line:0' }))?.text).toBe(
    '● ops @sher cc-icym  disk 17 GB  mem 3.2 GB  5h 41%  7d 55% resets Tue 09:00  relay RUN-0012 2/4  locks ok')
  await ui.unmount()
  w.files['/r/.skillator/sessions/cc-icym.owner'] = '@ghost\r\n'          // not on the team: nobody, no fall back (8 bytes: the mock's mtime is fixed, the size must move)
  await clock.advance(2000)
  expect(w.statuses.at(-1)).toBe('ops 2 pending | 1 in progress | 5 total · 5h 41% · 7d 55%')
  delete w.files['/r/.skillator/sessions/cc-icym.owner']
  await clock.advance(2000)
  expect(w.statuses.at(-1)).toBe('ops @vidul 2 pending | 1 in progress | 5 total · 5h 41%')
})

// F109: an owner file whose line 2 names another session is nobody's (a colliding code);
// one naming this session, or a one-line pre-F109 file, is honoured.
test('status line: F109 the owner file is guarded by its session line', WITH, async ($, on) => {
  const [w, clock] = world(on)
  w.files['/r/.skillator/team.md'] = '# Team\n\n- @vidul: vidul@ikran.in\n- @asha: a@x\n'
  w.files['/r/.skillator/sessions/cc-icym.owner'] = '@asha\nsession: other-id\n'
  await start($, clock)
  expect(w.statuses.at(-1)).toBe('ops @vidul 2 pending | 1 in progress | 5 total · 5h 41%')
  w.files['/r/.skillator/sessions/cc-icym.owner'] = '@asha\nsession: sid-1\n'
  await clock.advance(2000)
  expect(w.statuses.at(-1)).toBe('ops @asha 2 pending | 1 in progress | 5 total · 5h 41%')
  w.files['/r/.skillator/sessions/cc-icym.owner'] = '@asha\n'
  await clock.advance(2000)
  expect(w.statuses.at(-1)).toBe('ops @asha 2 pending | 1 in progress | 5 total · 5h 41%')
})

test('status line: F97 SKILLATOR_SESSION names the owner file', WITH, async ($, on) => {
  const [w, clock] = world(on, { SKILLATOR_SESSION: '@Sher-1' })
  w.files['/r/.skillator/team.md'] = '- @sher: s@x\n'
  w.files['/r/.skillator/sessions/sher-1.owner'] = '@sher\n'
  await start($, clock)
  expect(w.statuses.at(-1)).toBe('ops @sher 2 pending | 1 in progress | 5 total · 5h 41%')
})

test('session end puts a hidden CLAUDE.md back and logs it; the next start shows the note', WITH, async ($, on) => {
  const [w, clock] = world(on, { CLAUDE_CONFIG_DIR: '/c' })
  w.files['/h/.claude/CLAUDE.md.skillator-hidden'] = '# mine\n'
  await start($, clock)
  // At start: reported, never moved (a baseline GREEN may be running).
  expect(w.runs.filter(a => a[0] === 'rm')).toEqual([])
  expect(w.files['/h/.claude/CLAUDE.md']).toBeUndefined()
  const ui = await mountBand($, 'terminal')
  expect((await ui.find({ key: 'note:0' }))?.text).toContain('▲ ~/.claude/CLAUDE.md is hidden as CLAUDE.md.skillator-hidden')
  await ui.unmount()

  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'sid-1', resume: { id: 'sid-1' } })
  await clock.settle()
  expect(w.runs.filter(a => a[0] === 'rm')).toEqual([['rm', '-f', '--', '/h/.claude/CLAUDE.md.skillator-hidden']])
  expect(w.files['/h/.claude/CLAUDE.md']).toBe('# mine\n')
  expect(w.files['/h/.claude/CLAUDE.md.skillator-hidden']).toBeUndefined()
  expect(w.logs.some(l => l.startsWith('✓ Restored ~/.claude/CLAUDE.md from CLAUDE.md.skillator-hidden'))).toBe(true)

  await start($, clock)
  const again = await mountBand($, 'terminal')
  expect((await again.find({ key: 'note:0' }))?.text).toContain('✓ Restored ~/.claude/CLAUDE.md from CLAUDE.md.skillator-hidden')
  await again.unmount()
})

test('session end with nothing hidden moves nothing', WITH, async ($, on) => {
  const [w, clock] = world(on, { CLAUDE_CONFIG_DIR: '/c' })
  w.files['/h/.claude/CLAUDE.md'] = '# mine\n'
  w.files['/h/.claude/CLAUDE.md.skillator-hidden'] = '# old\n'
  await start($, clock)
  await $.session.end({ reason: 'prompt_input_exit', sessionId: 'sid-1', resume: { id: 'sid-1' } })
  expect(w.runs.filter(a => a[0] === 'rm')).toEqual([])
  expect(w.files['/h/.claude/CLAUDE.md']).toBe('# mine\n')
  expect(w.logs).toEqual([])
})

// Review round 2, R6: an empty hold file (HOLD=? -) is held, its reason unknown.
test('band: a hold with no reason reads held (reason unknown)', () => {
  expect(bandLines(input(kv(50 * GB, 8 * GB, ['HOLD=? -'])))[0]).toBe(
    '▲ ops  disk 50 GB  mem 8.0 GB  5h 41%  7d 55%  relay RUN-0012 2/4  locks ok  held (reason unknown) - /ops resume to release')
})

// Review round 2: /ops resume releases only on a fresh reading of the machine facts that
// is not red - the facts of an earlier poll never release a hold.
test('/ops resume: the machine facts failing or empty - not released, relay never asked', WITH, async ($, on) => {
  const [w, clock] = world(on)
  await start($, clock)                                 // green facts from the first poll
  for (const fail of [() => { w.machineFails = true }, () => { w.machineFails = false; w.machine = '' }]) {
    fail()
    const out = await $.command.run({ command: 'ops', args: 'resume', ...RUN })
    expect(out.text).toBe('could not read the machine facts - not released')
  }
  expect(w.runs.filter(a => a[3] === 'release')).toHaveLength(0)
})
