import { test, expect, mock } from 'claude-code/testing'
import type { On, ProcessRunInit, ProcessRunResult } from 'claude-code'
import type { Engine, MockClock, Mounted, Plugin } from 'claude-code/testing'

// F79: the Run tab - the repo's build / run / installer entry points from
// .skillator/run.json. The mod never writes the file: live-friday's run-entries does
// (scan, rename), and this world plays that script. Running an entry asks first, shows
// the exact argv and cwd, streams the output with the exit code and duration; s stops it.
// B5: every form is drawn in the one ops-board pane.

const SCRIPT = '/s/skills/live-friday/scripts/run-entries'
const RUN_JSON = '/r/.skillator/run.json'
const entry = (id: string, name: string, kind: string, target: string, source: string, missing = false, args: string[] = []) =>
  ({ id, name, kind, target, args, command: `${kind} ${target}`, cwd: '.', source, missing })
const FOUND = [entry('npm:build', 'npm run build', 'npm', 'build', 'package.json'), entry('sh:install.sh', 'install.sh', 'sh', 'install.sh', 'install.sh')]
const file = (entries: unknown[]) => JSON.stringify({ version: 1, entries }, null, 2) + '\n'

type Run = { argv: readonly string[]; init: ProcessRunInit | undefined }
type Spawn = { argv: readonly string[]; cwd: string | undefined }
type World = {
  files: Record<string, string>
  runs: Run[]
  spawns: Spawn[]
  opens: { id: string; closeOnEscape?: true }[]
  toasts: string[]
  writes: string[]
  scan: () => void                       // what `run-entries scan` does to the files
  child: { chunks: string[]; code: number; hang: boolean; killed: boolean }
  gate: Promise<void> | null             // a plain ui.open (a form closing) waits on it
  exists: number                         // fs.exists calls (the PATH walk)
}
const ran = (stdout: string, exitCode = 0, stderr = ''): ProcessRunResult =>
  ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false })

function world(on: On, files: Record<string, string>): [World, MockClock] {
  const w: World = {
    files: { ...files, '/s/skills/tickets-zordon/scripts/ticket-meta.sh': '#!/bin/sh\n', '/usr/bin/npm': '', '/usr/bin/make': '' },
    runs: [], spawns: [], opens: [], toasts: [], writes: [],
    scan: () => { w.files[RUN_JSON] = file(FOUND) },
    child: { chunks: [], code: 0, hang: false, killed: false },
    gate: null, exists: 0,
  }
  const at = (p: string) => w.files[p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')]
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.env(on, { SKILLATOR_ROOT: '/s', PATH: '/usr/bin:/bin' })
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.repo', () => ({ value: { root: '/r', remote: null, internal: false, name: 'r' } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('fs.stat', ($, e) => {
    const f = at(e.path)
    return f !== undefined ? { value: { kind: 'file' as const, size: f.length, mtimeMs: 1000, isLink: false } } : { deny: 'ENOENT ' + e.path }
  })
  on('fs.exists', ($, e) => { w.exists++; return { value: at(e.path) !== undefined } })
  on('fs.read', ($, e) => {
    const f = at(e.path)
    return f !== undefined ? { value: f } : { deny: 'ENOENT ' + e.path }
  })
  on('fs.write', ($, e) => { w.writes.push(e.path); return { deny: 'the mod must not write files' } })
  on('process.run', ($, e) => {
    if (e.argv.join(' ') === 'git config user.email') return { value: ran('vidul@ikran.in\n') }
    if (e.argv.some(a => /(pending|relay-morpheus|usage-watch)\.(sh|ps1)$/.test(a))) return { value: ran('', 1, 'not in this test') }
    w.runs.push({ argv: e.argv, init: e.init })
    if (e.argv[1] === SCRIPT + '.sh' && e.argv[2] === 'scan') {
      const had = at(RUN_JSON) !== undefined
      w.scan()
      return { value: ran(had ? '.skillator/run.json updated - 3 entries, 1 new, 1 missing\n' : '.skillator/run.json created - 2 entries\n') }
    }
    if (e.argv[1] === SCRIPT + '.sh' && e.argv[2] === 'rename') {
      const j = JSON.parse(w.files[RUN_JSON]!) as { entries: { id: string; name: string }[] }
      const x = j.entries.find(y => y.id === e.argv[3])
      if (!x) return { value: ran('', 1, `run-entries: no entry with id ${e.argv[3]} in .skillator/run.json`) }
      x.name = e.argv[4]!
      w.files[RUN_JSON] = file(j.entries)
      return { value: ran(`renamed ${e.argv[3]} to ${e.argv[4]} in .skillator/run.json\n`) }
    }
    return { value: ran('', 1, 'unexpected call') }
  })
  // The child: its chunks, then its exit - or, hanging, until the board leaves its loop.
  on('process.spawn', async function* ($, e, next) {
    w.spawns.push({ argv: e.argv, cwd: e.cwd })
    try {
      for (const text of w.child.chunks) yield { stream: 'stdout' as const, text }
      if (w.child.hang) await new Promise<void>(res => next.signal.addEventListener('abort', () => res()))
      return { value: { code: w.child.code, signal: null } }
    } finally {
      if (w.child.hang) w.child.killed = true
    }
  })
  on('ui.open', async ($, e) => {
    w.opens.push({ id: e.id, closeOnEscape: e.closeOnEscape })
    if (w.gate && !e.closeOnEscape) await w.gate
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', ($, e) => { w.toasts.push(e.text); return { value: undefined } })
  on('ui.status', () => ({ value: undefined }))
  on('ui.scroll', () => ({}))
  on('ui.focus', () => ({}))
  return [w, clock]
}

const PEEK: Plugin = {
  name: 'peek',
  register(on) {
    on('command.run', { command: 'close' }, async ($, e) => { await $.ui.close({ id: e.args }); return { text: 'closed' } })
    on('command.run', { command: 'peek' }, async ($, e) => {
      const v = await $.state.get({ plugin: 'ops-board', key: 'runJob' })
      return { text: e.args === 'runJob' ? JSON.stringify(v.value ?? null) : 'null' }
    })
  },
}
const WITH = { plugins: [PEEK] }
const RUN = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } }
const peek = async ($: Engine, key: string) => JSON.parse((await $.command.run({ command: 'peek', args: key, ...RUN })).text ?? 'null') as unknown

const SURFACES = ['terminal', 'desktop'] as const
type Surface = (typeof SURFACES)[number]
type Pane = Mounted<Surface, 'Pane'>
const props = { title: 'ops board', isFocused: true, bodyColumns: 80, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 60 }, view: {} }

async function openRun($: Engine, clock: MockClock, surface: Surface): Promise<Pane> {
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const pane = await $.ui.mount({ plugin: 'ops-board', surface, component: 'Pane', requestId: 'ops-board', props })
  await pane.press({ key: 'tab:run' })
  await clock.settle()
  return pane
}
const text = async (pane: Pane, key: string) => (await pane.find({ key }))?.text
const scans = (w: World) => w.runs.filter(r => r.argv[2] === 'scan')
const onlyBoard = (w: World) => expect([...new Set(w.opens.map(o => o.id))]).toEqual(['ops-board'])

for (const surface of SURFACES) {
  test(`${surface}: the Run tab's first open scans and saves .skillator/run.json through run-entries; the next open reads it`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': '# Tickets\n' })
    const pane = await openRun($, clock, surface)
    expect((await pane.find({ key: 'tab:run' }))?.text).toBe('● Build')
    expect((await pane.find({ key: 'tab:runs' }))?.text).toBe('Workflows')         // F76's tab stays itself
    expect(scans(w)).toHaveLength(1)
    expect(scans(w)[0]!.argv).toEqual(['/bin/sh', SCRIPT + '.sh', 'scan'])
    expect(scans(w)[0]!.init?.cwd?.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')).toBe('/r')
    expect(w.files[RUN_JSON]).toBe(file(FOUND))
    expect(w.writes).toEqual([])                                                   // the script writes it, never the mod
    expect(w.toasts.at(-1)).toContain('✓ .skillator/run.json created - 2 entries')
    expect(await text(pane, 'entry:npm:build')).toMatch(/^● npm run build +package\.json$/)
    expect(await text(pane, 'entry:sh:install.sh')).toMatch(/^● install\.sh +install\.sh$/)
    // back on another tab and in again: the file is there, read, not scanned
    await pane.press({ key: 'tab:tickets' })
    await pane.press({ key: 'tab:run' })
    await clock.settle()
    expect(scans(w)).toHaveLength(1)
    expect(await text(pane, 'entry:npm:build')).toBeDefined()
  })

  test(`${surface}: r scans again - found entries added, a gone one marked missing, a rename and a hand entry kept`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': '# Tickets\n', [RUN_JSON]: file([
      entry('hand-1', 'install selftest', 'sh', 'install.sh', 'hand', false, ['--selftest']),
      { ...FOUND[0]!, name: 'Build it' }, entry('ps1:install.ps1', 'install.ps1', 'ps1', 'install.ps1', 'install.ps1')]) })
    const pane = await openRun($, clock, surface)
    expect(scans(w)).toHaveLength(0)                                               // the file is there: read, not scanned
    expect(await text(pane, 'entry:ps1:install.ps1')).toMatch(/install\.ps1$/)
    // the script's merge: install.ps1 gone, install.sh new; the rename and the hand entry stay
    w.scan = () => {
      w.files[RUN_JSON] = file([entry('hand-1', 'install selftest', 'sh', 'install.sh', 'hand', false, ['--selftest']),
        { ...FOUND[0]!, name: 'Build it' }, entry('ps1:install.ps1', 'install.ps1', 'ps1', 'install.ps1', 'install.ps1', true), FOUND[1]!])
    }
    expect((await pane.find({ key: 'key:rescan' }))?.props.hotkey).toBe('r')
    await pane.press({ key: 'key:rescan' })
    expect(scans(w)).toHaveLength(1)
    expect(w.toasts.at(-1)).toContain('✓ .skillator/run.json updated - 3 entries, 1 new, 1 missing')
    expect(await text(pane, 'entry:hand-1')).toMatch(/^● install selftest +hand$/)
    expect(await text(pane, 'entry:npm:build')).toMatch(/^● Build it +package\.json$/)
    expect(await text(pane, 'entry:ps1:install.ps1')).toMatch(/^● install\.ps1 +missing$/)
    expect(await text(pane, 'entry:sh:install.sh')).toMatch(/^● install\.sh +install\.sh$/)
    expect(w.writes).toEqual([])
  })

  test(`${surface}: Rename from the confirm form saves the new name through run-entries rename`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': '# Tickets\n', [RUN_JSON]: file(FOUND) })
    const pane = await openRun($, clock, surface)
    await pane.press({ key: 'entry:npm:build' })
    await pane.press({ key: 'run:rename' })
    expect(await text(pane, 'form:title')).toBe('Rename npm run build  Esc cancels')
    expect(w.opens.at(-1)).toEqual({ id: 'ops-board', closeOnEscape: true })
    await pane.input({ key: 'run:name', text: '  Build all  ', kind: 'change' })
    await pane.press({ key: 'run:save' })
    expect(w.runs.at(-1)!.argv).toEqual(['/bin/sh', SCRIPT + '.sh', 'rename', 'npm:build', 'Build all'])
    expect(JSON.parse(w.files[RUN_JSON]!).entries[0].name).toBe('Build all')    // persisted in the file
    expect(w.toasts.at(-1)).toContain('✓ renamed npm:build to Build all in .skillator/run.json')
    expect(await pane.find({ key: 'form:title' })).toBeUndefined()
    expect(await text(pane, 'entry:npm:build')).toMatch(/^● Build all +package\.json$/)
    // a refusal stays in the form
    await pane.press({ key: 'entry:npm:build' })
    await pane.press({ key: 'run:rename' })
    w.files[RUN_JSON] = file([])
    await pane.press({ key: 'run:save' })
    expect(await text(pane, 'run:result')).toBe('run-entries: no entry with id npm:build in .skillator/run.json')
    onlyBoard(w)
    expect(w.writes).toEqual([])
  })

  test(`${surface}: a row asks first - the exact argv and cwd - and Esc / Cancel runs nothing`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': '# Tickets\n', [RUN_JSON]: file(FOUND) })
    const pane = await openRun($, clock, surface)
    await pane.press({ key: 'entry:sh:install.sh' })
    expect(await text(pane, 'form:title')).toBe('Run install.sh?  Esc cancels')
    expect(await text(pane, 'run:command')).toBe('Command  /bin/sh /r/install.sh')
    expect(await text(pane, 'run:cwd')).toBe('In       /r')
    expect(await text(pane, 'run:warn')).toContain('runs the repo\'s own code')
    expect(w.opens.at(-1)).toEqual({ id: 'ops-board', closeOnEscape: true })
    expect(w.spawns).toEqual([])
    await $.command.run({ command: 'close', args: 'ops-board', ...RUN })             // Esc
    expect(await pane.find({ key: 'form:title' })).toBeUndefined()
    expect(w.opens.at(-1)).toEqual({ id: 'ops-board', closeOnEscape: undefined })
    await pane.press({ key: 'entry:npm:build' })
    expect(await text(pane, 'run:command')).toBe('Command  /usr/bin/npm run build')
    await pane.press({ key: 'run:cancel' })
    expect(w.spawns).toEqual([])
    onlyBoard(w)
  })

  test(`${surface}: Run streams the output into the tab with the exit code and duration`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': '# Tickets\n', [RUN_JSON]: file(FOUND) })
    w.child.chunks = ['building\n', 'ok: 3 files\n']
    const pane = await openRun($, clock, surface)
    await pane.press({ key: 'entry:sh:install.sh' })
    await pane.press({ key: 'run:go' })
    await clock.settle()
    expect(w.spawns).toEqual([{ argv: ['/bin/sh', '/r/install.sh'], cwd: '/r' }])
    expect(await text(pane, 'job:status')).toBe('✓ install.sh exit 0 in 0.0 s')
    expect(await text(pane, 'job:ran')).toBe('ran: /bin/sh /r/install.sh')
    expect(await text(pane, 'job:line:0')).toBe('building')
    expect(await text(pane, 'job:line:1')).toBe('ok: 3 files')
    expect(await pane.find({ key: 'key:stop' })).toBeUndefined()
    expect(((await peek($, 'runJob')) as { out: string }).out).toBe('building\nok: 3 files\n')
    onlyBoard(w)
  })

  test(`${surface}: a failing command shows its exit code; the board keeps only the tail of its output`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': '# Tickets\n', [RUN_JSON]: file(FOUND) })
    w.child.chunks = ['x'.repeat(30_000) + '\n', 'error: no such target\n']
    w.child.code = 2
    const pane = await openRun($, clock, surface)
    await pane.press({ key: 'entry:npm:build' })
    await pane.press({ key: 'run:go' })
    await clock.settle()
    expect(await text(pane, 'job:status')).toBe('✗ npm run build exit 2 in 0.0 s')
    const lines = (await pane.findAll({ type: 'Box' })).filter(b => b.key?.startsWith('job:line:')).map(b => b.text)
    expect(lines.at(-1)).toBe('error: no such target')
    const out = ((await peek($, 'runJob')) as { out: string }).out
    expect(out.length).toBeLessThanOrEqual(16_000)                                 // B4: a tail, not the whole stream
    expect(out.endsWith('error: no such target\n')).toBe(true)
  })

  test(`${surface}: s stops a running job; a second Run waits for it`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': '# Tickets\n', [RUN_JSON]: file(FOUND) })
    w.child.chunks = ['serving on :3000\n']
    w.child.hang = true
    const pane = await openRun($, clock, surface)
    await pane.press({ key: 'entry:sh:install.sh' })
    await pane.press({ key: 'run:go' })
    await clock.settle()
    expect(await text(pane, 'job:status')).toMatch(/^● install\.sh running - /)
    expect(await text(pane, 'job:line:0')).toBe('serving on :3000')
    expect(await text(pane, 'entry:sh:install.sh')).toMatch(/^● install\.sh/)
    // one job at a time
    await pane.press({ key: 'entry:npm:build' })
    await pane.press({ key: 'run:go' })
    expect(await text(pane, 'run:result')).toBe('a job is running - s stops it first')
    await pane.press({ key: 'run:cancel' })
    expect(w.spawns).toHaveLength(1)
    expect((await pane.find({ key: 'key:stop' }))?.props.hotkey).toBe('s')
    await clock.advance(2500)
    await pane.press({ key: 'key:stop' })
    await clock.settle()
    expect(w.child.killed).toBe(true)
    expect(await text(pane, 'job:status')).toBe('■ install.sh stopped after 2.5 s')
    expect(await pane.find({ key: 'key:stop' })).toBeUndefined()
  })

  test(`${surface}: /ops run opens the Run tab; a missing entry cannot run`, WITH, async ($, on) => {
    const [w, clock] = world(on, { '/r/TICKETS.md': '# Tickets\n', [RUN_JSON]: file([entry('ps1:install.ps1', 'install.ps1', 'ps1', 'install.ps1', 'install.ps1', true)]) })
    await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
    await clock.settle()
    const said = await $.command.run({ command: 'ops', args: 'run', ...RUN })
    expect(said.text).toBe('ops board opened on Build.')
    await clock.settle()
    const pane = await $.ui.mount({ plugin: 'ops-board', surface, component: 'Pane', requestId: 'ops-board', props })
    expect(await text(pane, 'entry:ps1:install.ps1')).toMatch(/missing$/)
    await pane.press({ key: 'entry:ps1:install.ps1' })
    expect(await text(pane, 'run:error')).toBe('install.ps1: its source is gone (install.ps1) - r scans again')
    expect(await pane.find({ key: 'run:go' })).toBeUndefined()
    expect(w.spawns).toEqual([])
  })
}

// F93: the tab reads Build; /ops build opens it (id run), /ops run stays an alias.
test('F93: /ops build opens the Build tab; run is an alias', WITH, async ($, on) => {
  const [, clock] = world(on, { '/r/TICKETS.md': '# Tickets\n', [RUN_JSON]: file([entry('ps1:install.ps1', 'install.ps1', 'ps1', 'install.ps1', 'install.ps1')]) })
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect((await $.command.run({ command: 'ops', args: 'build', ...RUN })).text).toBe('ops board opened on Build.')
  await clock.settle()
  const pane = await $.ui.mount({ plugin: 'ops-board', surface: 'terminal', component: 'Pane', requestId: 'ops-board', props })
  expect((await pane.find({ key: 'tab:run' }))?.text).toBe('● Build')
  expect((await pane.find({ key: 'tab:run' }))?.props.variant).toBe('primary')
  expect(await text(pane, 'entry:ps1:install.ps1')).toBeDefined()
  await pane.press({ key: 'tab:tickets' })
  expect((await $.command.run({ command: 'ops', args: 'run', ...RUN })).text).toBe('ops board opened on Build.')
})

// Review #7: the tab bar is hidden while a Run form is up, as the assign forms hide it:
// a tab press would leave the form up and Esc on that tab would close the whole board.
test('the Run form hides the tab bar; Cancel brings it back', WITH, async ($, on) => {
  const [, clock] = world(on, { '/r/TICKETS.md': '# Tickets\n', [RUN_JSON]: file(FOUND) })
  const pane = await openRun($, clock, 'terminal')
  expect(await pane.find({ key: 'tab:tickets' })).toBeDefined()
  await pane.press({ key: 'entry:sh:install.sh' })
  expect(await text(pane, 'form:title')).toBe('Run install.sh?  Esc cancels')
  expect(await pane.find({ key: 'tab:tickets' })).toBeUndefined()
  await pane.press({ key: 'run:rename' })
  expect(await pane.find({ key: 'tab:tickets' })).toBeUndefined()
  await pane.press({ key: 'run:cancel' })
  expect(await pane.find({ key: 'tab:tickets' })).toBeDefined()
})

// Review #7 rest: /ops <tab> leaves the Run tab with its form up - the form goes, so
// coming back shows the list, never a stale confirm.
test('/ops to another tab drops the Run form', WITH, async ($, on) => {
  const [, clock] = world(on, { '/r/TICKETS.md': '# Tickets\n', [RUN_JSON]: file(FOUND) })
  const pane = await openRun($, clock, 'terminal')
  await pane.press({ key: 'entry:sh:install.sh' })
  expect(await text(pane, 'form:title')).toBe('Run install.sh?  Esc cancels')
  await $.command.run({ command: 'ops', args: 'tickets', ...RUN })
  await $.command.run({ command: 'ops', args: 'run', ...RUN })
  await clock.settle()
  expect(await pane.find({ key: 'form:title' })).toBeUndefined()
  expect(await pane.find({ key: 'tab:tickets' })).toBeDefined()
})

// Review #4: s pressed after the job shows but before the child is spawned - the child
// never starts, and a later Run is the only job.
test('s before the child is spawned: nothing runs, the job reads stopped, the next Run is the one job', WITH, async ($, on) => {
  const [w, clock] = world(on, { '/r/TICKETS.md': '# Tickets\n', [RUN_JSON]: file(FOUND) })
  w.child.hang = true
  const pane = await openRun($, clock, 'terminal')
  await pane.press({ key: 'entry:sh:install.sh' })
  let release = () => {}
  w.gate = new Promise<void>(res => { release = res })
  await pane.press({ key: 'run:go' })
  expect(await text(pane, 'job:status')).toMatch(/^● install\.sh running - /)
  await pane.press({ key: 'key:stop' })
  w.gate = null
  release()
  await clock.settle()
  expect(w.spawns).toEqual([])
  expect(await text(pane, 'job:status')).toMatch(/^■ install\.sh stopped after /)
  expect(await pane.find({ key: 'key:stop' })).toBeUndefined()
  await pane.press({ key: 'entry:npm:build' })
  await pane.press({ key: 'run:go' })
  await clock.settle()
  expect(w.spawns).toEqual([{ argv: ['/usr/bin/npm', 'run', 'build'], cwd: '/r' }])
})

// Review #5: the job lives in $.state (it outlives a reload of the mod), its child in the
// module (a reload kills it). A running job the last load left reads stopped, not running.
test('a job a reload orphaned reads stopped - no stop key that does nothing, a new Run runs', WITH, async ($, on) => {
  const [w, clock] = world(on, { '/r/TICKETS.md': '# Tickets\n', [RUN_JSON]: file(FOUND) })
  const orphan = { id: 'sh:install.sh', name: 'install.sh', argv: ['/bin/sh', '/r/install.sh'], cwd: '/r', started: 990_000,
    ended: null, code: null, stopped: false, error: null, out: 'serving\n' }
  let written = false
  on('state.set', ($, e, next) => { if (e.key === 'runJob') written = true; return next(e) })
  on('state.get', ($, e, next) => (e.key === 'runJob' && !written ? { value: { value: orphan, version: 0 } } : next(e)))
  const pane = await openRun($, clock, 'terminal')
  await clock.settle()
  expect(await text(pane, 'job:status')).toMatch(/^■ install\.sh stopped after /)
  expect(await pane.find({ key: 'key:stop' })).toBeUndefined()
  await pane.press({ key: 'entry:npm:build' })
  await pane.press({ key: 'run:go' })
  await clock.settle()
  expect(w.spawns).toHaveLength(1)
})

// Review #8: names from run.json are drawn without control bytes (an ESC or a newline).
test('entry names from run.json are drawn without control bytes', WITH, async ($, on) => {
  const [, clock] = world(on, { '/r/TICKETS.md': '# Tickets\n', [RUN_JSON]: file([entry('hand-1', 'evil\u001b[31mred\nname', 'sh', 'install.sh', 'ha\u001bnd')]) })
  const pane = await openRun($, clock, 'terminal')
  expect(await text(pane, 'entry:hand-1')).toMatch(/^● evil\[31mredname +hand$/)
  await pane.press({ key: 'entry:hand-1' })
  expect(await text(pane, 'form:title')).toBe('Run evil[31mredname?  Esc cancels')
})

// Review #15: the PATH walk runs once per scan, not on every draw of the form and again at Run.
test('the confirm form and Run share one PATH walk', WITH, async ($, on) => {
  const [w, clock] = world(on, { '/r/TICKETS.md': '# Tickets\n', [RUN_JSON]: file(FOUND) })
  const pane = await openRun($, clock, 'terminal')
  await pane.press({ key: 'entry:npm:build' })
  const walked = w.exists
  expect(walked).toBeGreaterThan(0)
  await pane.press({ key: 'run:cancel' })
  await pane.press({ key: 'entry:sh:install.sh' })
  await pane.press({ key: 'run:go' })
  await clock.settle()
  expect(w.spawns).toHaveLength(1)
  expect(w.exists).toBe(walked)
})
