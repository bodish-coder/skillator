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

// F76: a run part way through - stage 1 landed, 2 failed, 3 in flight, 4 not started.
const CHAIN_13 = [
  '## Stages', '| # | stage | state | owner | heartbeat | landed |', '|---|---|---|---|---|---|',
  '| 1 | S1 F46 | x | build | - | abc |', '| 2 | S2 F47 | ! | build | - | |', '| 3 | S3 F48 | ~ | build | - | |', '| 4 | S4 B2 | pending | build | - | |',
  '', '## Chain',
  '### S1 - stage 1 - F46 tickets pane', 'tickets: F46', '### S2 - stage 2 - F47 assign', 'tickets: F47',
  '### S3 - stage 3 - F48 band', 'tickets: F48', '### S4 - stage 4 - B2 cart', 'tickets: B2', '',
].join('\n')

// The colour of the first `●` under a drawn line (its status dot).
function dotColor(n: unknown): string | undefined {
  const node = n as { children?: unknown[]; props?: { color?: string } } | null
  if (!node || typeof node !== 'object') return undefined
  if (node.children?.[0] === '●') return node.props?.color ?? 'none'
  for (const c of node.children ?? []) { const x = dotColor(c); if (x) return x }
  return undefined
}
// A section header's colour: its Button's Text, as the Tickets tab's group headers.
const headColor = async (ui: { find(q: { key: string }): Promise<{ children: unknown[] } | undefined> }, key: string) =>
  ((await ui.find({ key }))?.children[0] as { props?: { color?: string } } | undefined)?.props?.color

type World = {
  files: Record<string, string>
  list: string
  queue: ProcessRunResult
  runs: (readonly string[])[]
  submits: string[]
  toasts: string[]
  inFlight: number; maxInFlight: number   // resume calls running at once
  resume: Record<string, string>          // F85: a run's resume text, over the CHAIN_* ones
  git: Record<string, number>             // F99: merge-base --is-ancestor <sha> HEAD's exit code per sha
  gitDown?: string                        // F99: git cannot be asked - every git call refused with this
  // F104: Close's run-branch reads and its one write
  branches: Record<string, boolean>       // rev-parse --verify --quiet <b>: 0 when true, else 1
  fork?: string                           // merge-base --fork-point HEAD <b>; unset: exit 1
  base?: string                           // merge-base HEAD <b>
  log: string                             // log --format=%H%x1f%s <range>
  merges?: string                         // the merge commits log prints before w.log unless --no-merges
  line?: string                           // rev-list --first-parent --parents <fork>..<b>: the run's own line, "sha p1 [p2]" newest first
  lines?: Record<string, string>          // rev-list --first-parent --parents <fork>..<tip> per tip
  main?: string                           // rev-list --first-parent HEAD
  stages?: string[]                       // second parents grown from the run line (merge-base --is-ancestor <own> <p2> exit 0)
  under?: Record<string, string>          // what a ^<sha> on git log hides: its lines of w.log
  reflog?: string                         // the run branch's reflog, newest first; unset: no reflog
  stageWrites: (readonly string[])[]      // relay-morpheus ... stage argv
  stageResult?: ProcessRunResult
}
const ran = (stdout: string, exitCode = 0, stderr = ''): ProcessRunResult =>
  ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false })

function world(on: On, env: Record<string, string> = {}): [World, MockClock] {
  const w: World = {
    files: { '/r/TICKETS.md': BOARD, [ROOT + '/skills/tickets-zordon/scripts/ticket-meta.sh']: '#!/bin/sh\n' },
    list: LIST, queue: ran('queued: RUN-0014\n'), runs: [], submits: [], toasts: [], inFlight: 0, maxInFlight: 0, resume: {},
    git: {}, branches: {}, log: '', stageWrites: [],
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
    const win = a[5] === RELAY + '.ps1'                       // Windows: -Mode at 7, -Id's value at 9
    if ((a[1] === RELAY + '.sh' && a[2] === 'list') || (win && a[7] === 'list')) return { value: ran(w.list) }
    if ((a[1] === RELAY + '.sh' && a[2] === 'resume') || (win && a[7] === 'resume')) {
      w.maxInFlight = Math.max(w.maxInFlight, ++w.inFlight)
      for (let i = 0; i < 200; i++) await Promise.resolve()   // stays in flight a while, no timer
      w.inFlight--
      const id = win ? a[9] : a[3]
      return { value: w.resume[id!] !== undefined ? ran(w.resume[id!]!) : id === 'RUN-0014' ? ran(CHAIN_14) : id === 'RUN-0012' ? ran(CHAIN_12) : id === 'RUN-0013' ? ran(CHAIN_13) : ran('', 1, 'no such run') }
    }
    if (a[1] === RELAY + '.sh' && a[2] === 'queue-run') return { value: w.queue }
    // F104: Close's one write, either spelling
    if ((a[1] === RELAY + '.sh' && a[3] === 'stage') || (win && a[7] === 'stage')) { w.stageWrites.push(a); return { value: w.stageResult ?? ran('') } }
    // F99: Diagnose's git reads (F104: git by absolute path on Windows)
    const isGit = a[0] === 'git' || a[0]!.endsWith('/git.exe')
    if (isGit && w.gitDown) return { deny: w.gitDown }
    if (isGit && a[1] === 'rev-parse') return { value: w.branches[a[4]!] ? ran('9a9a\n') : ran('', 1) }
    if (isGit && a[1] === 'merge-base' && a[2] === '--fork-point') return { value: w.fork ? ran(w.fork + '\n') : ran('', 1) }
    if (isGit && a[1] === 'merge-base' && a[2] === 'HEAD') return { value: w.base ? ran(w.base + '\n') : ran('', 1) }
    if (isGit && a[1] === 'log') {
      let log = w.log
      for (const x of a.filter(x => x.startsWith('^'))) log = log.replace(w.under?.[x.slice(1)] ?? '\0', '')
      return { value: ran((a.includes('--no-merges') ? '' : w.merges ?? '') + log) }
    }
    if (isGit && a[1] === 'rev-list' && a[2] === '--first-parent' && a[3] === 'HEAD') return { value: ran(w.main ?? '') }
    if (isGit && a[1] === 'rev-list' && a[2] === '--first-parent') {
      const target = a[4]?.split('..')[1] ?? a[3]?.split('..')[1]
      return { value: ran(target && w.lines?.[target] !== undefined ? w.lines[target]! : w.line ?? '') }
    }
    if (isGit && a[1] === 'merge-base' && a[2] === '--is-ancestor' && a[4] !== 'HEAD') return { value: ran('', w.stages?.includes(a[4]!) ? 0 : 1) }
    if (isGit && a[1] === 'reflog' && a[2] === 'exists') return { value: ran('', w.reflog ? 0 : 1) }
    if (isGit && a[1] === 'rev-list' && a[2] === '--walk-reflogs') return { value: ran(w.reflog ?? '') }
    if (isGit && a[1] === 'merge-base') return { value: ran('', w.git[a[3]!] ?? 128) }
    if (a.includes('decide')) return { value: ran('UNOBSERVABLE\n') }
    return { value: ran('', 1, 'not in this test') }
  })
  on('prompt.submit', ($, e) => { w.submits.push(e.text); return { text: e.text } })
  // F85: a slash command goes through command.run, the way a person's /command does
  on('command.run', { command: 'skillator:marathon-run' }, ($, e) => { w.submits.push(`/${e.command} ${e.args}`); return { text: 'ok' } })
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
const statuses = (w: World) => w.runs.filter(a => a[2] === 'resume').map(a => ['', '', a[3]!])

for (const surface of SURFACES) {
  test(`${surface}: m-plan - a planned run's stages, what runs in parallel, parked decisions, Start run`, async ($, on) => {
    const [w, clock] = world(on)
    await start($, clock)
    const ui = await runsTab($, surface)
    const text = async (key: string) => (await ui.find({ key }))?.text
    // chain status is read for the runs not all done only
    expect(statuses(w).map(a => a[2]).sort()).toEqual(['RUN-0012', 'RUN-0014'])
    // F85 review: the poll reads read-only - it never recreates a removed run worktree
    expect(w.runs.filter(a => a[2] === 'resume').every(a => a[4] === '--read-only')).toBe(true)
    expect(await text('run:RUN-0014')).toBe('● RUN-0014  plan from /plan-runs  owner @vidul  workflow · planned · 3 tickets → 3 stages')
    expect(await text('cols:RUN-0014')).toBe(cols('stage', 'ticket', 'work', 'after', 'files'))
    expect(await text('stage:RUN-0014:1')).toBe(cols('● 1', '● F46', 'tickets pane', '-', 'mods/ops-board/hooks/tickets.tsx'))
    expect(await text('stage:RUN-0014:2')).toBe(cols('● 2', '● F47', 'assign from the pane', '1', 'same file as 1, so after 1'))
    expect(await text('stage:RUN-0014:3')).toBe(cols('● 3', '● F48', 'watchdog band', '-', 'mods/ops-board/hooks/band.tsx'))
    expect(await text('par:RUN-0014')).toBe('runs in parallel: 1 and 3 · then 2')
    expect(await text('dec:RUN-0014:0')).toBe('parked  Q1 ● F49 credit source? - planning waits on it')
    expect(await text('edit:RUN-0014')).toBe('Edit in chat: /skillator:plan-runs F46 F47 F48')
    // Ticket state is colour, never a bracket code: F48 in progress is amber, F49 violet.
    expect(JSON.stringify(await ui.find({ key: 'stage:RUN-0014:3' }))).toContain('"color":"warning"')
    expect(JSON.stringify(await ui.find({ key: 'dec:RUN-0014:0' }))).toContain('"color":"permission"')
    expect(await text('stage:RUN-0014:3')).not.toContain('[~]')
    // a dispatched run: no Start, its stage open
    expect(await text('run:RUN-0012')).toBe('● RUN-0012  the ops board  owner @asha  workflow · 2/4 done')
    expect(await text('stage:RUN-0012:3')).toContain('open')
    expect(await ui.find({ key: 'engage:RUN-0012' })).toBeDefined()     // F85: every open run has Engage
    // F99: a finished run is drawn after the active ones, dim, with Diagnose and no Engage
    expect(await text('run:RUN-0011')).toContain('● RUN-0011  done before  3/3 done')
    expect(await ui.find({ key: 'engage:RUN-0011' })).toBeUndefined()
    expect(await ui.find({ key: 'diagnose:RUN-0011' })).toBeDefined()
    expect(await ui.find({ key: 'finished' })).toBeUndefined()
    const order = (await ui.findAll({})).map(x => x.key).filter((k): k is string => !!k && k.startsWith('run:'))
    expect(order).toEqual(['run:RUN-0012', 'run:RUN-0014', 'run:RUN-0011'])

    await ui.press({ key: 'engage:RUN-0014' })
    expect(w.submits).toEqual([])                                  // F85: the confirm first
    expect((await ui.find({ key: 'engage:submits' }))?.text).toBe('Submits  ' + 'continue RUN-0014: drive its chain with skillator:relay-morpheus (chain next / chain dispatch)')
    await ui.press({ key: 'engage:go' })
    expect(w.runs.filter(a => a[2] === 'queue-run')).toEqual([['/bin/sh', RELAY + '.sh', 'queue-run', 'add', 'RUN-0014']])
    expect(w.submits).toHaveLength(1)
    expect(w.submits[0]).toStartWith('continue RUN-0014')
    expect(w.toasts.at(-1)).toContain('✓ RUN-0014 queued')
    expect(w.toasts.at(-1)).toContain(`ran: /bin/sh ${RELAY}.sh queue-run add RUN-0014`)
    await ui.unmount()
  })
}

test('Engage: queue-run add refusing is said with its words and the command; no prompt goes', async ($, on) => {
  const [w, clock] = world(on)
  w.queue = ran('', 2, 'REFUSED: RUN-0014 is already queued\n')
  await start($, clock)
  const ui = await runsTab($, 'terminal')
  await ui.press({ key: 'engage:RUN-0014' })
  await ui.press({ key: 'engage:go' })
  expect(w.submits).toEqual([])
  expect(w.toasts.at(-1)).toContain('■ RUN-0014 not queued: REFUSED: RUN-0014 is already queued')
  expect(w.toasts.at(-1)).toContain(`ran: /bin/sh ${RELAY}.sh queue-run add RUN-0014`)
  await ui.unmount()
})

test('Windows: list goes through the ps1', async ($, on) => {
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
  expect((await ui.find({ key: 'run:RUN-0014' }))?.text).toBe('● RUN-0014  plan from /plan-runs  owner @vidul  workflow · 1/3 done')
  await ui.press({ key: 'tab:tickets' })
  const m = statuses(w).length
  await clock.advance(30_000)
  expect(statuses(w)).toHaveLength(m)
  await ui.unmount()
})

// F76: Runs and Workflows are one tab (labelled Workflows), a section each, opening and closing as F61's
// status groups do (a header Button with its count; the choice kept for the session).
for (const surface of SURFACES) {
  test(`${surface}: F76 one tab - a Runs and a Workflows section, each opens and closes`, async ($, on) => {
    const [, clock] = world(on)
    await start($, clock)
    const ui = await runsTab($, surface)
    const text = async (key: string) => (await ui.find({ key }))?.text
    expect(await ui.find({ key: 'tab:workflows' })).toBeUndefined()
    expect(await text('tab:runs')).toBe('● Workflows')            // owner: the merged tab is labelled Workflows
    expect(await text('sect:runs')).toBe('▾ Runs (3)')   // F99: the finished run counts
    expect(await text('sect:workflows')).toBe('▾ Workflows (0)')
    expect(await text('run:RUN-0014')).toBe('● RUN-0014  plan from /plan-runs  owner @vidul  workflow · planned · 3 tickets → 3 stages')
    expect(await text('wf:none')).toBe('no workflow run in this session yet')
    await ui.press({ key: 'sect:runs' })
    expect(await text('sect:runs')).toBe('▸ Runs (3)')   // F99: the finished run counts
    expect(await ui.find({ key: 'run:RUN-0014' })).toBeUndefined()
    expect(await ui.find({ key: 'finished' })).toBeUndefined()
    expect(await text('wf:none')).toBe('no workflow run in this session yet')
    await ui.press({ key: 'sect:workflows' })
    expect(await text('sect:workflows')).toBe('▸ Workflows (0)')
    expect(await ui.find({ key: 'wf:none' })).toBeUndefined()
    // kept for the session: away and back, both stay closed
    await ui.press({ key: 'tab:tickets' })
    await ui.press({ key: 'tab:runs' })
    expect(await text('sect:runs')).toBe('▸ Runs (3)')   // F99: the finished run counts
    expect(await text('sect:workflows')).toBe('▸ Workflows (0)')
    await ui.press({ key: 'sect:runs' })
    expect(await text('run:RUN-0014')).toBe('● RUN-0014  plan from /plan-runs  owner @vidul  workflow · planned · 3 tickets → 3 stages')
    expect(await text('run:RUN-0011')).toContain('3/3 done')
    await ui.unmount()
  })
}

// F76 (owner): every run and stage row has a `●` in its status colour, the Tickets tab's
// colours for the matching ticket states - completed green ([x]), in progress amber ([~]),
// pending / not started as a pending ticket ([ ]), failed red ([!]); the section header
// takes the colour of what is under way in it.
for (const surface of SURFACES) {
  test(`${surface}: F76 a status dot on every run and stage row, coloured as the Tickets tab`, async ($, on) => {
    const [w, clock] = world(on)
    w.list = [LIST.trimEnd(), row('0013', 'colours', 1, 4, '3'), ''].join('\n')
    await start($, clock)
    const ui = await runsTab($, surface)
    const dot = async (key: string) => dotColor(await ui.find({ key }))
    expect((await ui.find({ key: 'run:RUN-0012' }))?.text).toBe('● RUN-0012  the ops board  owner @asha  workflow · 2/4 done')
    expect(await dot('run:RUN-0012')).toBe('warning')          // dispatched, not all landed: in progress
    expect(await dot('run:RUN-0014')).toBe('text')             // planned, not started: pending
    expect(await dot('stage:RUN-0013:1')).toBe('success')      // landed
    expect(await dot('stage:RUN-0013:2')).toBe('error')        // failed keeps its red
    expect(await dot('stage:RUN-0013:3')).toBe('warning')      // in flight
    expect(await dot('stage:RUN-0013:4')).toBe('text')         // not started
    expect(await dot('stage:RUN-0014:1')).toBe('text')         // a planned run's stage
    expect((await ui.find({ key: 'stage:RUN-0013:1' }))?.text).toStartWith('● 1    ')
    expect(await headColor(ui, 'sect:runs')).toBe('warning')   // a run under way: the header is amber
    await ui.unmount()
  })
}

test('F76: the runs poll fires while the tab is shown, its sections closed', async ($, on) => {
  const [w, clock] = world(on)
  await start($, clock)
  const ui = await runsTab($, 'terminal')
  await ui.press({ key: 'sect:runs' })
  await ui.press({ key: 'sect:workflows' })
  const n = statuses(w).length
  await clock.advance(30_000)
  expect(statuses(w).length).toBeGreaterThan(n)
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

// F85: engage planned workflows and runs. Fixture run files and scripts only - never the
// repo's own .skillator. Stamps are minutes before the mock clock, so any time zone reads
// the same ages.
const NOW = new Date(2026, 9, 18, 12, 0).getTime()
const stampAgo = (min: number) => new Date(NOW - min * 60_000).toISOString().slice(0, 16) + 'Z'
const STAGES = (rows: string[]) => ['## Stages', '| # | stage | state | owner | heartbeat | landed |', '|---|---|---|---|---|---|', ...rows, '']
const WF_RUN = (driver: string, b10: string, flight: string[] = []) => [
  '# Resuming .skillator/run-0020-marathon.md', '# Read the plan named below', '',
  '# RUN-0020 - marathon', 'plan: TICKETS.md', 'branch: run/RUN-0020-marathon', '',
  ...STAGES(['| 136 | AAA8 A155 code-yoda | x | workflow | - | abc1 |', `| 137 | AAA9 B10 muse | ${b10} | - | - | - |`, '| 138 | AABA F81 reconcile |   | - | - | - |']),
  '## In flight', ...flight, '',
  '## Chain', `driver: ${driver}${SEP}hold: -${SEP}mode: workflow`,
  '### AAA8 - stage 136 - A155 code-yoda', 'tickets: A155', 'prompt: |', '  x',
  '### AAA9 - stage 137 - B10 muse', 'tickets: B10', 'prompt: |', '  x',
  '### AABA - stage 138 - F81 reconcile', 'tickets: F81', 'prompt: |', '  x', '',
].join('\n')
// The /marathon-plan template's shape: meta, then `const PLAN = <JSON>` closed at column 0;
// a prompt holding "\n}" must not end it early.
const SCRIPT = [
  "export const meta = { name: 'marathon-RUN-0020', phases: [{ title: 'Phase 1' }] }",
  'const PLAN = {',
  '  "run": "RUN-0020",',
  '  "phases": [',
  '    [ { "stage": 136, "code": "AAA8", "ticket": "A155", "prompt": "do it\\n}\\nnot the end" } ],',
  '    [ { "stage": 137, "code": "AAA9", "ticket": "B10" }, { "stage": 138, "code": "AABA", "ticket": "F81" } ]',
  '  ]',
  '}',
  'throw new Error("never run by the board")',
  '',
].join('\n')
const AGENTS_RUN = [
  '# Resuming .skillator/run-0021-agents.md', '',
  ...STAGES(['| 1 | AC01 B2 cart |   | - | - | - |', '| 2 | AC02 F46 pane |   | - | - | - |']),
  '## Chain', `driver: -${SEP}hold: -${SEP}mode: agents`,
  '### AC01 - stage 1 - B2 cart', 'tickets: B2', 'prompt: |', '  x',
  '### AC02 - stage 2 - F46 pane', 'tickets: F46', 'prompt: |', '  x', '',
].join('\n')
const f85World = (on: On, run20: string, env: Record<string, string> = {}) => {
  const [w, clock] = world(on, env)
  w.list = [row('0020', 'marathon', 1, 3), row('0021', 'agents', 0, 2), ''].join('\n')
  w.resume = { 'RUN-0020': run20, 'RUN-0021': AGENTS_RUN }
  w.files['/r/.skillator/run-0020-marathon.workflow.js'] = SCRIPT
  return [w, clock] as const
}

for (const surface of SURFACES) {
  test(`${surface}: F85 a workflow run - its mode, its script's phases and the next one; engage confirms, then submits /marathon-run`, async ($, on) => {
    const [w, clock] = f85World(on, WF_RUN('@cc-old ' + stampAgo(45), ' '))
    await start($, clock)
    const ui = await runsTab($, surface)
    const text = async (key: string) => (await ui.find({ key }))?.text
    expect(await text('run:RUN-0020')).toBe('● RUN-0020  marathon  workflow · 1/3 done')
    expect(await text('phase:RUN-0020:1')).toBe('phase 1  s136 A155')
    expect(await text('phase:RUN-0020:2')).toBe('phase 2  s137 B10 · s138 F81  ← next')
    // an agents run planned, nothing started: listed planned, no phases
    expect(await text('run:RUN-0021')).toBe('● RUN-0021  agents  agents · planned · 2 tickets → 2 stages')
    expect(await ui.find({ key: 'phase:RUN-0021:1' })).toBeUndefined()

    await ui.press({ key: 'engage:RUN-0020' })
    expect(w.submits).toEqual([])                             // the confirm, in this pane
    expect(await text('engage:title')).toBe('Engage RUN-0020?  Esc cancels')
    expect(await text('engage:submits')).toBe('Submits  /skillator:marathon-run RUN-0020')
    expect(await ui.find({ key: 'engage:queue' })).toBeUndefined()
    expect(await ui.find({ key: 'tab:runs' })).toBeUndefined()   // drawn in place of the tab
    await ui.press({ key: 'engage:go' })
    expect(w.submits).toEqual(['/skillator:marathon-run RUN-0020'])
    expect(w.runs.filter(a => a[2] === 'queue-run')).toEqual([])
    expect(await text('run:RUN-0020')).toBe('● RUN-0020  marathon  workflow · 1/3 done')   // the tab back
    await ui.unmount()
  })
}

test('F85 an agents run: engage confirms, then queue-run add and its continue prompt; Cancel sends nothing', async ($, on) => {
  const [w, clock] = f85World(on, WF_RUN('-', ' '))
  await start($, clock)
  const ui = await runsTab($, 'terminal')
  await ui.press({ key: 'engage:RUN-0021' })
  expect((await ui.find({ key: 'engage:queue' }))?.text).toBe('First    relay-morpheus queue-run add RUN-0021')
  await ui.press({ key: 'engage:cancel' })
  expect(w.submits).toEqual([])
  expect(await ui.find({ key: 'engage:title' })).toBeUndefined()
  await ui.press({ key: 'engage:RUN-0021' })
  await ui.press({ key: 'engage:go' })
  expect(w.runs.filter(a => a[2] === 'queue-run')).toEqual([['/bin/sh', RELAY + '.sh', 'queue-run', 'add', 'RUN-0021']])
  expect(w.submits).toEqual(['continue RUN-0021: drive its chain with skillator:relay-morpheus (chain next / chain dispatch)'])
  await ui.unmount()
})

test('F85 never two drivers: a live driver stamp or a stage in flight refuses with a toast naming the driver, no confirm', async ($, on) => {
  const [w, clock] = f85World(on, WF_RUN('@cc-live ' + stampAgo(5), ' '))
  await start($, clock)
  const ui = await runsTab($, 'terminal')
  await ui.press({ key: 'engage:RUN-0020' })
  expect(w.toasts.at(-1)).toBe('■ RUN-0020 not engaged: driven by @cc-live (heartbeat 5m ago, stale at 20m) - never two drivers')
  expect(await ui.find({ key: 'engage:title' })).toBeUndefined()
  expect(w.submits).toEqual([])
  // a stage in flight, its dispatcher named by the In-flight block
  w.resume['RUN-0020'] = WF_RUN('-', '~', ['### stage 137 - AAA9 B10 muse  (dispatched 2026-10-18T09:00Z, @cc-f9797c)', 'run: wf_r9', 'prompt: |', '  x'])
  await clock.advance(30_000)
  await ui.press({ key: 'engage:RUN-0020' })
  expect(w.toasts.at(-1)).toBe('■ RUN-0020 not engaged: stage 137 is in flight, driven by @cc-f9797c - never two drivers')
  expect(w.submits).toEqual([])
  await ui.unmount()
})

// F99: Diagnose reads the run file, the board, git and the driver stamp - read-only (Close is F104).
// runnable as copied: the script runCall runs, the owner cell kept ('' / no -Owner)
const BY_HAND = `sh "${RELAY}.sh" RUN-0020 stage 137 x ''`
test('F99 Diagnose: inconsistent - a stage in flight whose ticket is [x]; the by-hand close command shown, nothing run', async ($, on) => {
  // stage 137 in flight under a driver 3 h gone; B10 is [x] on the board; no landed cell, so the sha is the placeholder
  const [w, clock] = f85World(on, WF_RUN(`@cc-gone ${stampAgo(183)}`, '~', ['### stage 137 - B10 muse  (dispatched 09:00Z, @cc-gone)', 'run: -']))
  w.files['/r/TICKETS.md'] = BOARD.replace('- [ ] B2 — cart', '- [ ] B2 — cart\n- [x] B10 — muse\n- [x] A155 — yoda')
  w.git = { abc1: 0 }
  await start($, clock)
  const ui = await runsTab($, 'terminal')
  await clock.settle()
  const before = w.runs.length
  await ui.press({ key: 'diagnose:RUN-0020' })
  await clock.settle()
  expect((await ui.find({ key: 'diag:title' }))?.text).toBe('Diagnose RUN-0020: inconsistent  Esc back')
  expect((await ui.find({ key: 'diag:line:0' }))?.text).toBe('stage 137: in flight in the run file, but B10 is [x] on the board')
  expect((await ui.find({ key: 'diag:line:1' }))?.text).toBe('driver @cc-gone: last heartbeat 183m ago, stale at 20m - a stage is still marked in flight')
  expect((await ui.find({ key: 'diag:byhand:0' }))?.text).toBe(`${BY_HAND} <sha>`)
  expect(await ui.find({ key: 'diag:close' })).toBeUndefined()
  // list and resume read fresh, then only the landed sha asked of git (F104: and the run branch, read-only, for Close)
  expect(w.runs.slice(before).map(a => a[0] === 'git' ? a.join(' ') : a[2])).toEqual(['list', 'resume', 'git merge-base --is-ancestor abc1 HEAD',
    'git rev-parse --verify --quiet run/RUN-0020-marathon'])
  await ui.press({ key: 'diag:back' })
  // the stage's own landed cell: its sha when on HEAD, else the placeholder
  const cell = WF_RUN(`@cc-gone ${stampAgo(183)}`, '~').replace('| 137 | AAA9 B10 muse | ~ | - | - | - |', '| 137 | AAA9 B10 muse | ~ | - | - | beef01 |')
  w.resume['RUN-0020'] = cell
  w.git = { abc1: 0, beef01: 0 }
  await ui.press({ key: 'diagnose:RUN-0020' })
  await clock.settle()
  expect((await ui.find({ key: 'diag:byhand:0' }))?.text).toBe(`${BY_HAND} beef01`)
  await ui.press({ key: 'diag:back' })
  w.git.beef01 = 1
  await ui.press({ key: 'diagnose:RUN-0020' })
  await clock.settle()
  expect((await ui.find({ key: 'diag:byhand:0' }))?.text).toBe(`${BY_HAND} <sha>`)
  await ui.press({ key: 'diag:back' })
  // a landed path (relay takes one) is the line's value, quoted - never asked of git
  w.resume['RUN-0020'] = cell.replace('| beef01 |', '| docs/out.md |')
  await ui.press({ key: 'diagnose:RUN-0020' })
  await clock.settle()
  expect((await ui.find({ key: 'diag:byhand:0' }))?.text).toBe(`${BY_HAND} "docs/out.md"`)
  expect(w.runs.some(a => a[3] === 'stage' || a[1] === 'log')).toBe(false)   // nothing written, no run-branch reads
  await ui.unmount()
})
test('F99 Diagnose on Windows: the by-hand line is the ps1 form, no -Owner (the cell kept)', async ($, on) => {
  const [w, clock] = f85World(on, WF_RUN(`@cc-gone ${stampAgo(183)}`, '~'), { OS: 'Windows_NT' })
  w.files['/r/TICKETS.md'] = BOARD.replace('- [ ] B2 — cart', '- [ ] B2 — cart\n- [x] B10 — muse')
  await start($, clock)
  const ui = await runsTab($, 'terminal')
  await clock.settle()
  await ui.press({ key: 'diagnose:RUN-0020' })
  await clock.settle()
  expect((await ui.find({ key: 'diag:byhand:0' }))?.text)
    .toBe(`powershell -NoProfile -ExecutionPolicy Bypass -File "${RELAY}.ps1" -Mode stage -Id RUN-0020 -N 137 -State x -Landed <sha>`)
  await ui.unmount()
})
test('F99 Diagnose: finished and still running draw their verdict with no by-hand line; Back runs nothing', async ($, on) => {
  const [w, clock] = f85World(on, WF_RUN(`@cc-live ${stampAgo(5)}`, '~'))
  w.git = { abc1: 1 }                                                        // off HEAD: the run branch, no disagreement while running
  await start($, clock)
  const ui = await runsTab($, 'terminal')
  await clock.settle()
  await ui.press({ key: 'diagnose:RUN-0020' })
  await clock.settle()
  expect((await ui.find({ key: 'diag:title' }))?.text).toBe('Diagnose RUN-0020: still running  Esc back')
  expect((await ui.find({ key: 'diag:agree' }))?.text).toBe('run file, board, git and the driver stamp agree')
  expect(await ui.find({ key: 'diag:byhand:0' })).toBeUndefined()
  await ui.press({ key: 'diag:back' })
  expect(await ui.find({ key: 'diag:title' })).toBeUndefined()
  // a finished run (RUN-0011, 3/3 in LIST) diagnosed: its file read fresh
  w.list = [row('0020', 'marathon', 1, 3), row('0011', 'done before', 1, 1), ''].join('\n')
  // review fix: a landed path (relay takes a sha or a path) is never asked of git, nor a disagreement
  w.resume['RUN-0011'] = ['# Resuming .skillator/run-0011-done.md', '', ...STAGES(['| 1 | AA01 A155 yoda | x | build | - | abc1 |', '| 2 | AA02 A156 docs | x | build | - | docs/out.md |']),
    '## Chain', `driver: -${SEP}hold: -${SEP}mode: agents`, '### AA01 - stage 1 - A155 yoda', 'tickets: A155', 'prompt: |', '  x',
    '### AA02 - stage 2 - A156 docs', 'tickets: A156', 'prompt: |', '  x', ''].join('\n')
  w.git = { abc1: 0 }
  await clock.advance(30_000)                                               // the poll re-reads the list
  await clock.settle()
  await ui.press({ key: 'diagnose:RUN-0011' })
  await clock.settle()
  expect((await ui.find({ key: 'diag:title' }))?.text).toBe('Diagnose RUN-0011: finished  Esc back')
  expect(await ui.find({ key: 'diag:byhand:0' })).toBeUndefined()
  expect(w.runs.some(a => a[3] === 'stage')).toBe(false)
  expect(w.runs.some(a => a[1] === 'merge-base' && a[3] === 'docs/out.md')).toBe(false)
  await ui.unmount()
})
test('F99 Diagnose: a tab switch while it reads leaves no stale view behind', async ($, on) => {
  const [, clock] = f85World(on, WF_RUN(`@cc-live ${stampAgo(5)}`, '~'))
  await start($, clock)
  const ui = await runsTab($, 'terminal')
  await clock.settle()
  const p = ui.press({ key: 'diagnose:RUN-0020' })
  await ui.press({ key: 'tab:tickets' })                                    // before the resume answers
  await p
  await clock.settle()
  await ui.press({ key: 'tab:runs' })
  expect(await ui.find({ key: 'diag:title' })).toBeUndefined()
  expect(await ui.find({ key: 'sect:runs' })).toBeDefined()
  await ui.unmount()
})
test('F99 Diagnose: git that cannot be asked is said - never "agree"', async ($, on) => {
  const [w, clock] = f85World(on, WF_RUN(`@cc-live ${stampAgo(5)}`, '~'))
  w.list = [row('0011', 'done before', 1, 1), ''].join('\n')
  w.resume['RUN-0011'] = ['# Resuming .skillator/run-0011-done.md', '', ...STAGES(['| 1 | AA01 A155 yoda | x | build | - | abc1 |']),
    '## Chain', `driver: -${SEP}hold: -${SEP}mode: agents`, '### AA01 - stage 1 - A155 yoda', 'tickets: A155', 'prompt: |', '  x', ''].join('\n')
  w.gitDown = 'spawn git ENOENT'
  await start($, clock)
  const ui = await runsTab($, 'terminal')
  await clock.settle()
  await ui.press({ key: 'diagnose:RUN-0011' })
  await clock.settle()
  expect((await ui.find({ key: 'diag:title' }))?.text).toBe('Diagnose RUN-0011: finished  Esc back')
  expect(await ui.find({ key: 'diag:agree' })).toBeUndefined()
  expect((await ui.find({ key: 'diag:line:0' }))?.text).toMatch(/^git not asked: .*spawn git ENOENT/)
  await ui.unmount()
})
test('F99 Diagnose: the run read fresh - its list row with the open stage, not the last poll\'s', async ($, on) => {
  // no Stages table: the open stage comes from the list row's "(stage 137 open)" only
  const [w, clock] = f85World(on, ['# Resuming .skillator/run-0020-marathon.md', '', '## Chain', `driver: @cc-gone ${stampAgo(183)}${SEP}hold: -${SEP}mode: workflow`,
    '### AAA9 - stage 137 - B10 muse', 'tickets: B10', 'prompt: |', '  x', ''].join('\n'))
  w.files['/r/TICKETS.md'] = BOARD.replace('- [ ] B2 — cart', '- [ ] B2 — cart\n- [x] B10 — muse')
  w.list = [row('0020', 'marathon', 0, 1), ''].join('\n')
  await start($, clock)
  const ui = await runsTab($, 'terminal')
  await clock.settle()
  w.list = [row('0020', 'marathon', 0, 1, '137'), ''].join('\n')          // dispatched since the poll
  await ui.press({ key: 'diagnose:RUN-0020' })
  await clock.settle()
  expect((await ui.find({ key: 'diag:line:0' }))?.text).toBe('stage 137: in flight in the run file, but B10 is [x] on the board')
  await ui.unmount()
})
test('F99: only finished runs - a blank row between "no relay run open" and the first', async ($, on) => {
  const [w, clock] = world(on)
  w.list = [row('0011', 'done before', 3, 3), ''].join('\n')
  await start($, clock)
  const ui = await runsTab($, 'terminal')
  await clock.settle()
  const nodes = await ui.findAll({})
  const [i, j] = [nodes.findIndex(x => x.key === 'none'), nodes.findIndex(x => x.key === 'run:RUN-0011')]
  expect(i >= 0 && j > i).toBe(true)
  expect(nodes.slice(i + 1, j).some(x => !x.key && x.text === ' ')).toBe(true)
  await ui.unmount()
})

// F104: Diagnose's Close - a closable stage (pending / ~ / open, its tickets built, no live driver)
// lands a derived sha through relay-morpheus after a confirm that re-reads everything.
const STALE = `@cc-gone ${stampAgo(183)}`
const B10_BUILT = BOARD.replace('- [ ] B2 — cart', '- [ ] B2 — cart\n- [x] B10 — muse\n- [x] A155 — yoda')
const WITH_CELL = (state: string, cell: string, driver = STALE) =>
  WF_RUN(driver, state).replace(`| 137 | AAA9 B10 muse | ${state} | - | - | - |`, `| 137 | AAA9 B10 muse | ${state} | - | - | ${cell} |`)
const BRANCH = 'run/RUN-0020-marathon'
const [SHA_A, SHA_C, SHA_D, SHA_E] = ['a1'.padEnd(40, 'a'), 'c0ffee'.padEnd(40, '0'), 'd00d'.padEnd(40, 'd'), 'e1'.padEnd(40, 'e')]
const SH_WRITE = (sha: string) => ['/bin/sh', RELAY + '.sh', 'RUN-0020', 'stage', '137', 'x', '', sha]
const closeWorld = (on: On, run: string, env: Record<string, string> = {}) => {
  const [w, clock] = f85World(on, run, env)
  w.files['/r/TICKETS.md'] = B10_BUILT
  w.git = { abc1: 0 }
  return [w, clock] as const
}
type UI = Awaited<ReturnType<typeof runsTab>>
async function diagnoseOpen($: Engine, clock: MockClock): Promise<UI> {
  await start($, clock)
  const ui = await runsTab($, 'terminal')
  await clock.settle()
  await ui.press({ key: 'diagnose:RUN-0020' })
  await clock.settle()
  return ui
}
const again = async (ui: UI, clock: MockClock) => {
  await ui.press({ key: 'diag:back' })
  await ui.press({ key: 'diagnose:RUN-0020' })
  await clock.settle()
}
const closeKeys = async (ui: UI) => (await ui.findAll({})).map(x => x.key).filter((k): k is string => !!k && k.startsWith('diag:close:'))
const diagLines = async (ui: UI) => (await ui.findAll({})).filter(x => x.key?.startsWith('diag:line:')).map(x => x.text)

test('F104 Close offered for a stage whose landed cell is on HEAD; confirm names the argv; Close runs relay-morpheus stage x with the owner cell kept', async ($, on) => {
  const [w, clock] = closeWorld(on, WITH_CELL('~', 'beef01'))
  w.git.beef01 = 0
  const ui = await diagnoseOpen($, clock)
  expect((await ui.find({ key: 'diag:close:137' }))?.text).toBe('Close stage 137 with beef01')
  expect((await ui.find({ key: 'diag:close:why:137' }))?.text).toBe('landed cell on HEAD')
  expect(w.stageWrites).toEqual([])
  await ui.press({ key: 'diag:close:137' })
  expect((await ui.find({ key: 'diag:confirm' }))?.text).toBe('Close stage 137 of RUN-0020?')
  expect((await ui.find({ key: 'diag:confirm:runs' }))?.text).toBe(`runs    sh "${RELAY}.sh" RUN-0020 stage 137 x '' beef01`)
  expect((await ui.find({ key: 'diag:confirm:landed' }))?.text).toBe('landed  beef01  (landed cell on HEAD)')
  expect(w.stageWrites).toEqual([])
  await ui.press({ key: 'diag:close:go' })
  await clock.settle()
  expect(w.stageWrites).toEqual([SH_WRITE('beef01')])
  const t = w.toasts.find(x => x.startsWith('✓ stage 137 of RUN-0020 landed beef01'))
  expect(t).toContain(`ran: /bin/sh ${RELAY}.sh RUN-0020 stage 137 x  beef01`)
  await ui.unmount()
})

test('F104 the sha from the run branch\'s own range, ticket id matched case-insensitively, newest first', async ($, on) => {
  const [w, clock] = closeWorld(on, WF_RUN(STALE, '~'))
  w.branches = { [BRANCH]: true }
  w.fork = 'f0f0'
  w.log = `${SHA_E}\x1fAB10 not a whole word\n${SHA_C}\x1fb10: muse pane\n${SHA_D}\x1fF81 reconcile\n${SHA_A}\x1fB10 first try\n`
  w.git[SHA_C] = 0
  const ui = await diagnoseOpen($, clock)
  expect((await ui.find({ key: 'diag:close:137' }))?.text).toBe('Close stage 137 with c0ffee0')
  expect((await ui.find({ key: 'diag:close:why:137' }))?.text).toBe(`c0ffee0 "b10: muse pane" on ${BRANCH}`)
  expect(w.runs).toContainEqual(['git', 'rev-parse', '--verify', '--quiet', BRANCH])
  expect(w.runs).toContainEqual(['git', 'merge-base', '--fork-point', 'HEAD', BRANCH])
  expect(w.runs).toContainEqual(['git', 'log', '--no-merges', '--format=%H%x1f%s', 'f0f0..' + BRANCH])
  expect(w.runs).toContainEqual(['git', 'merge-base', '--is-ancestor', SHA_C, 'HEAD'])
  await ui.press({ key: 'diag:close:137' })
  await ui.press({ key: 'diag:close:go' })
  await clock.settle()
  expect(w.stageWrites).toEqual([SH_WRITE(SHA_C)])
  // no fork point in the reflog: the plain merge-base is the range's start
  w.fork = undefined
  w.base = 'b0b0'
  await again(ui, clock)
  expect(w.runs).toContainEqual(['git', 'merge-base', 'HEAD', BRANCH])
  expect(w.runs).toContainEqual(['git', 'log', '--no-merges', '--format=%H%x1f%s', 'b0b0..' + BRANCH])
  expect((await ui.find({ key: 'diag:close:137' }))?.text).toBe('Close stage 137 with c0ffee0')
  // merged into HEAD: merge-base answers the tip (an empty range); the branch's oldest reflog entry is its fork
  w.base = 'a7a7'
  w.reflog = 'a7a7\n5e5e\nf1f1\n'
  await again(ui, clock)
  expect(w.runs).toContainEqual(['git', 'reflog', 'exists', 'refs/heads/' + BRANCH])
  expect(w.runs).toContainEqual(['git', 'rev-list', '--walk-reflogs', 'refs/heads/' + BRANCH])
  expect(w.runs).toContainEqual(['git', 'log', '--no-merges', '--format=%H%x1f%s', 'f1f1..' + BRANCH])
  expect((await ui.find({ key: 'diag:close:137' }))?.text).toBe('Close stage 137 with c0ffee0')
  await ui.unmount()
})

test('F104 a stage merge or a board commit naming the ticket, newer than its own commit, is never the sha', async ($, on) => {
  const [w, clock] = closeWorld(on, WF_RUN(STALE, '~'))
  const [SHA_M, SHA_B] = ['m1'.padEnd(40, '1'), 'b0a4d'.padEnd(40, '2')]
  w.branches = { [BRANCH]: true }
  w.fork = 'f0f0'
  w.merges = `${SHA_M}\x1fmerge stage 140 (run/RUN-0020-marathon-b10-s140)\n`
  // main merged into the run branch: its board commit falls in the range, newer, and on HEAD
  w.log = `${SHA_B}\x1fboard: testing B10\n${SHA_C}\x1fB10: muse pane\n`
  w.git = { ...w.git, [SHA_M]: 0, [SHA_B]: 0, [SHA_C]: 0 }
  const ui = await diagnoseOpen($, clock)
  expect(w.runs).toContainEqual(['git', 'log', '--no-merges', '--format=%H%x1f%s', 'f0f0..' + BRANCH])
  expect((await ui.find({ key: 'diag:close:137' }))?.text).toBe('Close stage 137 with c0ffee0')
  await ui.unmount()
})

test('F104 what a merge of main into the run brought (a side branch merged into main too) is never the sha; a stage merge\'s commits stay', async ($, on) => {
  const [w, clock] = closeWorld(on, WF_RUN(STALE, '~'))
  const [SHA_MM, SHA_MS, SHA_T, SHA_ST, SHA_S, SHA_H] = ['a1'.padEnd(40, 'a'), 'a2'.padEnd(40, 'a'), 'a3'.padEnd(40, 'a'), 'a4'.padEnd(40, 'a'), 'a5'.padEnd(40, 'a'), 'a6'.padEnd(40, 'a')]
  w.branches = { [BRANCH]: true }
  w.reflog = `${SHA_MS}\n${SHA_MM}\n${SHA_C}\nf1f1\n`
  // the run line newest first: merge stage (p2 SHA_ST, forked off the run line), merge main (p2 SHA_T), B10: muse pane
  w.line = `${SHA_MS} ${SHA_MM} ${SHA_ST}\n${SHA_MM} ${SHA_C} ${SHA_T}\n${SHA_C} f1f1\n`
  w.stages = [SHA_ST]
  w.under = { [SHA_T]: `${SHA_S}\x1fB10: side branch work\n${SHA_H}\x1fB10: main hotfix\n` }
  w.log = `${SHA_D}\x1fF81 reconcile\n${SHA_S}\x1fB10: side branch work\n${SHA_H}\x1fB10: main hotfix\n${SHA_C}\x1fB10: muse pane\n`
  // HEAD = main, the run not landed: main's commits are on HEAD, the run's is not
  w.git = { ...w.git, [SHA_S]: 0, [SHA_H]: 0, [SHA_C]: 1, [SHA_D]: 1 }
  const ui = await diagnoseOpen($, clock)
  expect(w.runs).toContainEqual(['git', 'rev-list', '--first-parent', '--parents', 'f1f1..' + BRANCH])
  expect(w.runs).toContainEqual(['git', 'log', '--no-merges', '--format=%H%x1f%s', 'f1f1..' + BRANCH, '^' + SHA_T])
  expect(w.runs.some(a => a[0] === 'git' && a[1] === 'rev-list' && a.includes('f1f1..HEAD'))).toBe(false)
  expect(await closeKeys(ui)).toEqual([])
  expect(await diagLines(ui)).toContain(`stage 137: c0ffee0 "B10: muse pane" is on ${BRANCH} but not on HEAD - land the run first - close by hand`)
  // the run landed (merged into main, or main fast-forwarded to it, or HEAD on the run branch): every sha on HEAD
  w.git = { ...w.git, [SHA_C]: 0, [SHA_D]: 0 }
  await again(ui, clock)
  expect((await ui.find({ key: 'diag:close:137' }))?.text).toBe('Close stage 137 with c0ffee0')
  expect((await ui.find({ key: 'diag:close:why:137' }))?.text).toBe(`c0ffee0 "B10: muse pane" on ${BRANCH}`)
  await ui.unmount()
})

test('A160 (1) merge on run line counts as main merged in when rev-list --first-parent fork..p2 shares no commit with run line', async ($, on) => {
  const [w, clock] = closeWorld(on, WF_RUN(STALE, '~'))
  const [SHA_M, SHA_T, SHA_S] = ['b1'.padEnd(40, 'b'), 'b2'.padEnd(40, 'b'), 'b3'.padEnd(40, 'b')]
  w.branches = { [BRANCH]: true }
  w.reflog = `${SHA_M}\n${SHA_C}\nf1f1\n`
  w.line = `${SHA_M} ${SHA_C} ${SHA_T}\n${SHA_C} f1f1\n`
  w.lines = { [SHA_T]: `${SHA_S} f0f0\n` }
  w.under = { [SHA_T]: `${SHA_S}\x1fB10: leaked commit from main\n` }
  w.log = `${SHA_S}\x1fB10: leaked commit from main\n${SHA_C}\x1fB10: muse pane\n`
  w.git = { ...w.git, [SHA_S]: 0, [SHA_C]: 0 }
  const ui = await diagnoseOpen($, clock)
  expect(w.runs).toContainEqual(['git', 'log', '--no-merges', '--format=%H%x1f%s', 'f1f1..' + BRANCH, '^' + SHA_T])
  expect((await ui.find({ key: 'diag:close:137' }))?.text).toBe('Close stage 137 with c0ffee0')
  await ui.unmount()
})

test('A160 (2) fork point from reflog excludes main first-parent commits', async ($, on) => {
  const [w, clock] = closeWorld(on, WF_RUN(STALE, '~'))
  w.branches = { [BRANCH]: true }
  w.main = '9a9a\ne0e0\n'
  w.reflog = `${SHA_C}\nf1f1\ne0e0\n`
  w.line = `${SHA_C} f1f1\n`
  w.log = `${SHA_C}\x1fB10: muse pane\n`
  w.git = { ...w.git, [SHA_C]: 0 }
  const ui = await diagnoseOpen($, clock)
  expect(w.runs).toContainEqual(['git', 'rev-list', '--walk-reflogs', 'refs/heads/' + BRANCH])
  expect(w.runs).toContainEqual(['git', 'rev-list', '--first-parent', '--parents', 'f1f1..' + BRANCH])
  expect((await ui.find({ key: 'diag:close:137' }))?.text).toBe('Close stage 137 with c0ffee0')
  await ui.unmount()
})

test('A160 (3) merges on kept stage branch own line hide main merges into the stage', async ($, on) => {
  const [w, clock] = closeWorld(on, WF_RUN(STALE, '~'))
  const [SHA_MS, SHA_ST, SHA_SM, SHA_MT, SHA_S] = ['c1'.padEnd(40, 'c'), 'c2'.padEnd(40, 'c'), 'c3'.padEnd(40, 'c'), 'c4'.padEnd(40, 'c'), 'c5'.padEnd(40, 'c')]
  w.branches = { [BRANCH]: true }
  w.reflog = `${SHA_MS}\n${SHA_C}\nf1f1\n`
  w.line = `${SHA_MS} ${SHA_C} ${SHA_ST}\n${SHA_C} f1f1\n`
  w.lines = {
    [SHA_ST]: `${SHA_SM} ${SHA_C} ${SHA_MT}\n`,
    [SHA_MT]: `${SHA_S} f0f0\n`
  }
  w.under = { [SHA_MT]: `${SHA_S}\x1fB10: main commit into stage\n` }
  w.log = `${SHA_S}\x1fB10: main commit into stage\n${SHA_C}\x1fB10: muse pane\n`
  w.git = { ...w.git, [SHA_S]: 0, [SHA_C]: 0 }
  const ui = await diagnoseOpen($, clock)
  expect(w.runs).toContainEqual(['git', 'log', '--no-merges', '--format=%H%x1f%s', 'f1f1..' + BRANCH, '^' + SHA_MT])
  expect((await ui.find({ key: 'diag:close:137' }))?.text).toBe('Close stage 137 with c0ffee0')
  await ui.unmount()
})

test('F104 a run-file branch starting with - never reaches git', async ($, on) => {
  const [w, clock] = closeWorld(on, WF_RUN(STALE, '~').replace('branch: run/RUN-0020-marathon', 'branch: --output=x'))
  const ui = await diagnoseOpen($, clock)
  expect(w.runs.some(a => a[0] === 'git' && a.some(x => x.startsWith('--output')))).toBe(false)
  expect(await diagLines(ui)).toContain('stage 137: run branch "--output=x" starts with - - not asked of git - close by hand')
  await ui.unmount()
})

test('F104 a double press on Close writes once', async ($, on) => {
  const [w, clock] = closeWorld(on, WITH_CELL('~', 'beef01'))
  w.git.beef01 = 0
  const ui = await diagnoseOpen($, clock)
  await ui.press({ key: 'diag:close:137' })
  await Promise.all([ui.press({ key: 'diag:close:go' }), ui.press({ key: 'diag:close:go' }).catch(() => {})])
  await clock.settle()
  expect(w.stageWrites).toEqual([SH_WRITE('beef01')])
  await ui.unmount()
})

test('F104 a matching commit not on HEAD, or none in the range, or the branch gone: no Close, the by-hand line, said why', async ($, on) => {
  const [w, clock] = closeWorld(on, WF_RUN(STALE, '~'))
  w.branches = { [BRANCH]: true }
  w.fork = 'f0f0'
  w.log = `${SHA_C}\x1fB10 muse\n`
  w.git[SHA_C] = 1
  const ui = await diagnoseOpen($, clock)
  expect(await closeKeys(ui)).toEqual([])
  expect(await diagLines(ui)).toContain(`stage 137: c0ffee0 "B10 muse" is on ${BRANCH} but not on HEAD - land the run first - close by hand`)
  expect((await ui.find({ key: 'diag:byhand:0' }))?.text).toBe(`${BY_HAND} <sha>`)
  w.log = `${SHA_D}\x1fF81 reconcile\n`
  await again(ui, clock)
  expect(await closeKeys(ui)).toEqual([])
  expect(await diagLines(ui)).toContain(`stage 137: no commit for B10 between f0f0..${BRANCH} - close by hand`)
  w.branches = {}
  await again(ui, clock)
  expect(await closeKeys(ui)).toEqual([])
  expect(await diagLines(ui)).toContain(`stage 137: ${BRANCH} is gone (landed and removed?) and no landed sha on HEAD - close by hand`)
  expect(w.stageWrites).toEqual([])
  await ui.unmount()
})

test('F104 git that cannot be asked says not checked, never missing', async ($, on) => {
  const [w, clock] = closeWorld(on, WITH_CELL('~', 'beef01'))
  w.gitDown = 'EACCES'
  const ui = await diagnoseOpen($, clock)
  expect(await closeKeys(ui)).toEqual([])
  expect((await diagLines(ui)).some(l => /^stage 137: close not checked - git merge-base: .*EACCES$/.test(l ?? ''))).toBe(true)
  expect((await diagLines(ui)).some(l => /missing|is gone|no commit/.test(l ?? ''))).toBe(false)
  w.gitDown = undefined
  w.git.beef01 = 128
  await again(ui, clock)
  expect(await closeKeys(ui)).toEqual([])
  expect(await diagLines(ui)).toContain('stage 137: close not checked - git merge-base exit 128')
  expect(w.stageWrites).toEqual([])
  await ui.unmount()
})

test('F104 the confirm re-checks: a driver alive since, or a stage no longer open, refuses and writes nothing', async ($, on) => {
  const [w, clock] = closeWorld(on, WITH_CELL('~', 'beef01'))
  w.git.beef01 = 0
  const ui = await diagnoseOpen($, clock)
  await ui.press({ key: 'diag:close:137' })
  w.resume['RUN-0020'] = WITH_CELL('~', 'beef01', `@cc-2 ${stampAgo(1)}`)
  await ui.press({ key: 'diag:close:go' })
  await clock.settle()
  expect(w.toasts.at(-1)).toBe('■ stage 137 of RUN-0020 not closed: stage 137 driven by @cc-2 1m ago - not closable')
  expect(w.stageWrites).toEqual([])
  expect(await ui.find({ key: 'diag:confirm' })).toBeUndefined()
  await ui.press({ key: 'diag:close:137' })
  w.resume['RUN-0020'] = WITH_CELL('x', 'beef01')
  await ui.press({ key: 'diag:close:go' })
  await clock.settle()
  expect(w.toasts.at(-1)).toBe('■ stage 137 of RUN-0020 not closed: stage 137 is no longer open')
  expect(w.stageWrites).toEqual([])
  // its ticket moved [x] -> [~] on the board since the last poll: TICKETS.md is read again, refused
  w.resume['RUN-0020'] = WITH_CELL('~', 'beef01')
  await again(ui, clock)
  await ui.press({ key: 'diag:close:137' })
  w.files['/r/TICKETS.md'] = B10_BUILT.replace('- [x] B10 — muse', '- [~] B10 — muse')
  await ui.press({ key: 'diag:close:go' })
  await clock.settle()
  expect(w.toasts.at(-1)).toBe('■ stage 137 of RUN-0020 not closed: stage 137 is no longer closable')
  expect(w.stageWrites).toEqual([])
  w.files['/r/TICKETS.md'] = B10_BUILT
  // the sha moved since the confirm: refused too
  w.resume['RUN-0020'] = WF_RUN(STALE, '~')
  w.branches = { [BRANCH]: true }
  w.fork = 'f0f0'
  w.log = `${SHA_C}\x1fB10 muse\n`
  w.git[SHA_C] = 0
  await again(ui, clock)
  await ui.press({ key: 'diag:close:137' })
  w.log = `${SHA_D}\x1fB10 muse again\n${SHA_C}\x1fB10 muse\n`
  w.git[SHA_D] = 0
  await ui.press({ key: 'diag:close:go' })
  await clock.settle()
  expect(w.toasts.at(-1)).toBe('■ stage 137 of RUN-0020 not closed: the commit changed since the confirm - look again')
  expect(w.stageWrites).toEqual([])
  await ui.unmount()
})

test('F104 cancel, Esc and Back run nothing', async ($, on) => {
  const [w, clock] = closeWorld(on, WITH_CELL('~', 'beef01'))
  w.git.beef01 = 0
  const ui = await diagnoseOpen($, clock)
  await ui.press({ key: 'diag:close:137' })
  await ui.press({ key: 'diag:close:cancel' })
  expect(await ui.find({ key: 'diag:confirm' })).toBeUndefined()
  expect(await ui.find({ key: 'diag:close:137' })).toBeDefined()
  await ui.press({ key: 'diag:close:137' })
  await ui.press({ key: 'diag:back' })
  await clock.settle()
  expect(await ui.find({ key: 'diag:title' })).toBeUndefined()
  expect(w.stageWrites).toEqual([])
  expect(w.runs.some(a => a.includes('stage'))).toBe(false)
  await ui.unmount()
})

for (const state of ['?', '!']) {
  test(`F104 parked and failed stages never get Close (${state})`, async ($, on) => {
    const [w, clock] = closeWorld(on, WITH_CELL(state, 'beef01'))
    w.git.beef01 = 0
    const ui = await diagnoseOpen($, clock)
    expect((await ui.find({ key: 'diag:title' }))?.text).toContain('Diagnose RUN-0020')
    expect(await closeKeys(ui)).toEqual([])
    expect(w.stageWrites).toEqual([])
    await ui.unmount()
  })
}

test('F104 on Windows the write is the ps1 form with no -Owner', async ($, on) => {
  const [w, clock] = closeWorld(on, WITH_CELL('~', 'beef01'), { OS: 'Windows_NT', PATH: 'C:/git/cmd' })
  w.files['/git/cmd/git.exe'] = ''
  w.git.beef01 = 0
  const ui = await diagnoseOpen($, clock)
  expect((await ui.find({ key: 'diag:confirm:runs' }))).toBeUndefined()
  await ui.press({ key: 'diag:close:137' })
  expect((await ui.find({ key: 'diag:confirm:runs' }))?.text)
    .toBe(`runs    powershell -NoProfile -ExecutionPolicy Bypass -File "${RELAY}.ps1" -Mode stage -Id RUN-0020 -N 137 -State x -Landed beef01`)
  await ui.press({ key: 'diag:close:go' })
  await clock.settle()
  expect(w.stageWrites).toEqual([['C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', RELAY + '.ps1',
    '-Mode', 'stage', '-Id', 'RUN-0020', '-N', '137', '-State', 'x', '-Landed', 'beef01']])
  expect(w.stageWrites[0]).not.toContain('-Owner')
  await ui.unmount()
})

test('F104 a relay failure is shown with what ran', async ($, on) => {
  const [w, clock] = closeWorld(on, WITH_CELL('~', 'beef01'))
  w.git.beef01 = 0
  w.stageResult = ran('', 2, 'no stage 137 in .skillator/run-0020-marathon.md\n')
  const ui = await diagnoseOpen($, clock)
  await ui.press({ key: 'diag:close:137' })
  await ui.press({ key: 'diag:close:go' })
  await clock.settle()
  expect(w.toasts.at(-1)).toBe(`■ stage 137 of RUN-0020 not closed: no stage 137 in .skillator/run-0020-marathon.md\nran: /bin/sh ${RELAY}.sh RUN-0020 stage 137 x  beef01`)
  expect(w.toasts.some(x => x.startsWith('✓ stage 137'))).toBe(false)
  await ui.unmount()
})

// F99: a finished run (done >= total) sorts after the active ones, draws dim and never engages.
import { engageOf, finishedLine, isFinished, orderRuns, stampAge } from '../hooks/lib/runlines'
test('F99 pure: isFinished, orderRuns, finishedLine, stampAge, engageOf refuses a finished run', () => {
  const mk = (id: string, done: number, total: number) => ({ id, title: 't ' + id, done, total, owner: null, stages: [], planned: false, decisions: [], mode: null, driver: null, flights: [], phases: null })
  const [a, b, c] = [mk('RUN-0011', 3, 3), mk('RUN-0012', 2, 4), mk('RUN-0013', 0, 0)]
  expect([a, b, c].map(isFinished)).toEqual([true, false, false])
  expect(orderRuns([a, b, c]).map(r => r.id)).toEqual(['RUN-0012', 'RUN-0013', 'RUN-0011'])
  const l = finishedLine(a)
  expect(l.key).toBe('run:RUN-0011')
  expect(l.segs[0]).toEqual({ text: '●', color: 'success' })
  expect(l.segs.slice(1).every(s => s.dim)).toBe(true)
  expect(l.segs.map(s => s.text).join('')).toBe('● RUN-0011  t RUN-0011  3/3 done')
  expect(stampAge(stampAgo(5), NOW)).toBe(5)
  expect(Number.isNaN(stampAge('yesterday', NOW))).toBe(true)
  expect(engageOf(a, NOW)).toEqual({ refused: '■ RUN-0011 not engaged: all 3 stages landed - nothing left to drive' })
})
