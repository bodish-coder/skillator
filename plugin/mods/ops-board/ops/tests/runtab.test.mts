import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { initial, reduce } from '../state'
import type { State } from '../state'
import { frame } from '../draw'
import { makeEngine } from '../engine'
import { spawnJob } from '../nodehost'
import type { Host, RunResult } from '../nodehost'
import type { Call } from '../../hooks/lib/calls'
import { OUT_MAX, duration, parseRunFile } from '../../hooks/lib/runentries'

// F79: the standalone app's Run tab (5) - .skillator/run.json written only by
// live-friday's run-entries (here a fake that plays it), read by the engine; a row asks
// first with the exact argv and cwd; the job streams in with its exit code and duration.

const RUN_JSON = '/r/.skillator/run.json'
const entry = (id: string, name: string, kind: string, target: string, source: string, missing = false, args: string[] = []) =>
  ({ id, name, kind, target, args, command: `${kind} ${target}`, cwd: '.', source, missing })
const FOUND = [entry('npm:build', 'npm run build', 'npm', 'build', 'package.json'), entry('sh:install.sh', 'install.sh', 'sh', 'install.sh', 'install.sh')]
const file = (entries: unknown[]) => JSON.stringify({ version: 1, entries }, null, 2) + '\n'
const BINS = { sh: '/bin/sh', ps: null, make: '/usr/bin/make', npm: ['/usr/bin/npm'] }

type Fake = {
  host: Host; files: Record<string, string>; calls: string[]; spawns: { argv: string[]; cwd: string }[]
  scan: () => void; out?: (t: string) => void; end?: (c: number | null, e: string | null) => void; stops: number
}
function fake(files: Record<string, string>): Fake {
  const f: Fake = { files, calls: [], spawns: [], stops: 0, scan: () => { f.files[RUN_JSON] = file(FOUND) }, host: null as unknown as Host }
  const res = (out: string, code = 0, err = '', argv = ['/bin/sh', 'run-entries.sh']): RunResult => ({ code, out, err, argv })
  f.host = {
    win: false, skillsDir: '/s', repoRoot: '/r',
    async run(call: Call, args: string[]) {
      f.calls.push([call, ...args].join(' '))
      if (call === 'run-scan') {
        const had = RUN_JSON in f.files
        f.scan()
        return res(had ? '.skillator/run.json updated - 3 entries, 1 new, 1 missing\n' : '.skillator/run.json created - 2 entries\n', 0, '', ['/bin/sh', '/s/live-friday/scripts/run-entries.sh', 'scan'])
      }
      if (call === 'run-rename') {
        const j = JSON.parse(f.files[RUN_JSON]!) as { entries: { id: string; name: string }[] }
        const x = j.entries.find(y => y.id === args[0])
        if (!x) return res('', 1, `run-entries: no entry with id ${args[0]} in .skillator/run.json`)
        x.name = args[1]!
        f.files[RUN_JSON] = file(j.entries)
        return res(`renamed ${args[0]} to ${args[1]} in .skillator/run.json\n`)
      }
      return res('', 127, 'not here', [])
    },
    async stat(p) { return p in f.files ? { mtimeMs: 1, size: f.files[p]!.length } : null },
    async read(p) { if (!(p in f.files)) throw new Error('ENOENT ' + p); return f.files[p]! },
    gitEmail: async () => null,
    bins: async () => BINS,
    spawn(argv, cwd, onOut, onEnd) { f.spawns.push({ argv, cwd }); f.out = onOut; f.end = onEnd; return { stop() { f.stops++ } } },
  }
  return f
}
const engineOf = (f: Fake) => makeEngine({ host: f.host, email: null, once: false, state: initial(100, 40, 0), onChange: () => {}, onQuit: () => {} })
const text = (s: State) => frame({ ...s, now: s.runJob?.ended ?? s.now }, { color: false, ascii: false, plain: true }).join('\n')
const keys = async (e: ReturnType<typeof engineOf>, ...ks: string[]) => { for (const k of ks) await e.key(k.length === 1 ? { name: k, sequence: k } : { name: k }) }

test('F137: synchronous spawn failure ends the job visibly with its command', async () => {
  const f = fake({ [RUN_JSON]: file(FOUND) })
  f.host.spawn = () => { throw new Error('fixture spawn denied') }
  const e = engineOf(f)
  try {
    await keys(e, '6', 'return', 'return')
    assert.notEqual(e.state.runJob?.ended, null)
    assert.notEqual(e.state.runJob?.code, 0)
    assert.match(text(e.state), /could not run: fixture spawn denied/)
    assert.match(text(e.state), /ran: \/usr\/bin\/npm run build/)
  } finally { e.stop() }
})

test('the Run tab: the first open scans and saves .skillator/run.json through run-entries; the next open reads it', async () => {
  const f = fake({})
  const e = engineOf(f)
  await keys(e, '6')
  assert.equal(e.state.tab, 'run')
  assert.deepEqual(f.calls, ['run-scan'])
  assert.equal(f.files[RUN_JSON], file(FOUND))
  assert.deepEqual(e.state.runFile?.entries.map(x => x.id), ['npm:build', 'sh:install.sh'])
  assert.match(e.state.toast ?? '', /^✓ \.skillator\/run\.json created - 2 entries\nran: \/bin\/sh /)
  const t = text(e.state)
  assert.match(t, /6 Build/)
  assert.match(t, /› ● npm run build +package\.json/)
  assert.match(t, / {2}● install\.sh +install\.sh/)
  await keys(e, '1', '6')
  assert.deepEqual(f.calls, ['run-scan'])                    // there now: read, not scanned again
})

test('the Run tab: r scans again and the merge shows - a rename and a hand entry kept, a gone file missing, a new one added', async () => {
  const f = fake({ [RUN_JSON]: file([{ ...FOUND[0]!, name: 'Build it' }, entry('ps1:install.ps1', 'install.ps1', 'ps1', 'install.ps1', 'install.ps1')]) })
  const e = engineOf(f)
  await keys(e, '6')
  assert.deepEqual(f.calls, [])
  f.scan = () => {
    f.files[RUN_JSON] = file([entry('hand-1', 'install selftest', 'sh', 'install.sh', 'hand', false, ['--selftest']), { ...FOUND[0]!, name: 'Build it' },
      entry('ps1:install.ps1', 'install.ps1', 'ps1', 'install.ps1', 'install.ps1', true), FOUND[1]!])
  }
  await keys(e, 'r')
  assert.deepEqual(f.calls, ['run-scan'])                    // r on this tab is the rescan, not the board reload
  assert.match(e.state.toast ?? '', /updated - 3 entries, 1 new, 1 missing/)
  const t = text(e.state)
  assert.match(t, /● install selftest +hand/)
  assert.match(t, /● Build it +package\.json/)
  assert.match(t, /● install\.ps1 +missing/)
  assert.match(t, /● install\.sh +install\.sh/)
})

test('the Run tab: n renames the selected entry through run-entries rename; the new name is in the file', async () => {
  const f = fake({ [RUN_JSON]: file(FOUND) })
  const e = engineOf(f)
  await keys(e, '6', 'n')
  assert.equal(e.state.runForm?.mode, 'rename')
  for (let i = 0; i < 'npm run build'.length; i++) await keys(e, 'backspace')
  await keys(e, 'B', 'u', 'i', 'l', 'd', 'space')
  await e.key({ name: 'space', sequence: ' ' })
  await keys(e, 'a', 'l', 'l')
  assert.match(text(e.state), /Rename npm run build[\s\S]*Name {2}Build all_/)
  await keys(e, 'return')
  assert.deepEqual(f.calls, ['run-rename npm:build Build all'])
  assert.equal((JSON.parse(f.files[RUN_JSON]!) as { entries: { name: string }[] }).entries[0]!.name, 'Build all')
  assert.equal(e.state.runForm, null)
  assert.match(text(e.state), /● Build all +package\.json/)
})

test('the Run tab: Enter asks first - the exact argv and cwd - and Esc runs nothing', async () => {
  const f = fake({ [RUN_JSON]: file(FOUND) })
  const e = engineOf(f)
  await keys(e, '6', 'down', 'return')
  const t = text(e.state)
  assert.match(t, /Run install\.sh\?/)
  assert.match(t, /Command {2}\/bin\/sh \/r\/install\.sh/)
  assert.match(t, /In {7}\/r/)
  assert.match(t, /runs the repo's own code/)
  assert.match(t, /\[enter run\] · \[n rename\] · \[esc cancel\]/)
  await keys(e, 'escape')
  assert.equal(e.state.runForm, null)
  assert.deepEqual(f.spawns, [])
})

test('the Run tab: a run streams its output with the exit code and duration; one at a time; s stops it', async () => {
  const f = fake({ [RUN_JSON]: file(FOUND) })
  const e = engineOf(f)
  await keys(e, '6', 'return', 'return')
  assert.deepEqual(f.spawns, [{ argv: ['/usr/bin/npm', 'run', 'build'], cwd: '/r' }])
  f.out!('building\n')
  f.out!('ok: 3 files\n')
  assert.match(text({ ...e.state, now: e.state.runJob!.started + 1200 }), /● npm run build running - 1\.2 s[\s\S]*ran: \/usr\/bin\/npm run build\n {2}building\n {2}ok: 3 files/)
  assert.match(text(e.state), /s stop/)
  // one at a time
  await keys(e, 'down', 'return', 'return')
  assert.equal(e.state.runForm?.result, 'a job is running - s stops it first')
  await keys(e, 'escape', 's')
  assert.equal(f.stops, 1)
  f.end!(null, null)
  assert.match(text(e.state), /■ npm run build stopped after/)
  assert.doesNotMatch(text(e.state), /s stop/)
})

test('the Run tab: a failing command shows its exit code; only the tail of the output is kept', async () => {
  const f = fake({ [RUN_JSON]: file(FOUND) })
  const e = engineOf(f)
  await keys(e, '6', 'return', 'return')
  f.out!('x'.repeat(40_000) + '\n')
  f.out!('error: no such target\n')
  f.end!(2, null)
  assert.ok(e.state.runJob!.out.length <= OUT_MAX)
  assert.match(text(e.state), /✗ npm run build exit 2 in [\d.]+ s[\s\S]*error: no such target/)
})

test('the Run tab: a missing entry cannot run; the reducer alone - keys, no process', () => {
  let s: State = { ...initial(100, 40, 0), tab: 'run', runBins: BINS, runRoot: '/r',
    runFile: { path: RUN_JSON, entries: [entry('ps1:install.ps1', 'install.ps1', 'ps1', 'install.ps1', 'install.ps1', true)], error: null }, runSel: 'ps1:install.ps1' }
  s = reduce(s, { name: 'return' }).state
  assert.match(text(s), /install\.ps1: its source is gone \(install\.ps1\) - r scans again/)
  const st = reduce(s, { name: 'return' })
  assert.deepEqual(st.effects, [])
  assert.match(st.state.runForm?.result ?? '', /source is gone/)
})

test('the Run tab opened by --tab run: readAll (--once) and start read run.json and find the bins - no r needed, no scan in --once', async () => {
  const f = fake({ [RUN_JSON]: file(FOUND) })
  const once = makeEngine({ host: f.host, email: null, once: true, state: { ...initial(100, 40, 0), tab: 'run' }, onChange: () => {}, onQuit: () => {} })
  await once.readAll()
  assert.deepEqual(once.state.runFile?.entries.map(x => x.id), ['npm:build', 'sh:install.sh'])
  assert.deepEqual(once.state.runBins, BINS)
  assert.match(text(once.state), /› ● npm run build +package\.json/)
  const g = fake({})
  const none = makeEngine({ host: g.host, email: null, once: true, state: { ...initial(100, 40, 0), tab: 'run' }, onChange: () => {}, onQuit: () => {} })
  await none.readAll()
  assert.ok(!g.calls.includes('run-scan'), g.calls.join())   // --once never scans (a write)
  assert.match(none.state.runFile?.error ?? '', /no \.skillator\/run\.json/)
  let read = () => {}
  const wasRead = new Promise<void>(res => { read = res })
  const live = makeEngine({ host: f.host, email: null, once: false, state: { ...initial(100, 40, 0), tab: 'run' }, onChange: () => { if (live?.state.runFile) read() }, onQuit: () => {} })
  await live.start()                                         // start's run.json read is not awaited: wait for its draw
  await Promise.race([wasRead, new Promise(res => setTimeout(res, 2000))])
  live.stop()
  assert.deepEqual(live.state.runFile?.entries.map(x => x.id), ['npm:build', 'sh:install.sh'])
  assert.deepEqual(live.state.runBins, BINS)
})

test('parseRunFile: an entry with no id gets the id run-entries.sh would write (hand-<index+1>, -2 on a clash)', () => {
  const j = JSON.stringify({ entries: [{ name: 'a', kind: 'sh', target: 'a.sh' }, 'junk', { name: 'b', kind: 'sh', target: 'b.sh' }, { id: 'hand-1', kind: 'sh', target: 'c.sh' }, { id: 'x' }, { id: 'x' }] })
  assert.deepEqual(parseRunFile(j, RUN_JSON).entries.map(x => x.id), ['hand-1', 'hand-3', 'hand-1-2', 'x', 'x-2'])
})

// A154: the id is run-entries' own - its JSON text, escapes kept, never cut - so a pane
// rename finds the entry; ab and ab decode alike but are two ids there.
const LONG = 'x'.repeat(310)
const ODD = `{"entries":[{"id":"ab"},{"id":"a\\u0062"},{"name":"no id"},{"id":"${LONG}"},{"id":"${LONG}"}]}\n`
test('parseRunFile: ids as run-entries keys them - escapes kept, an id over 300 chars whole', () => {
  assert.deepEqual(parseRunFile(ODD, RUN_JSON).entries.map(x => x.id), ['ab', 'a\\u0062', 'hand-3', LONG, LONG + '-2'])
})

const RE = resolve(import.meta.dirname, '../../../../skills/live-friday/scripts/run-entries')
const reRuns: [string, string | false, string[]][] = [
  ['sh', spawnSync('sh', ['-c', 'exit 0']).status !== 0 && 'no sh', ['sh', RE + '.sh']],
  ['ps1', process.platform !== 'win32' && 'Windows only', ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', RE + '.ps1']],
]
for (const [kind, skip, [cmd, ...pre]] of reRuns) {
  test(`${kind}: run-entries rename by each id parseRunFile gives renames that entry (the pane's round trip)`, { skip }, () => {
    const t = mkdtempSync(join(tmpdir(), 'run-ids-'))
    try {
      mkdirSync(join(t, '.skillator'))
      writeFileSync(join(t, '.skillator/run.json'), ODD)
      parseRunFile(ODD, RUN_JSON).entries.forEach((e, i) => {
        const r = spawnSync(cmd, [...pre, 'rename', e.id, `n${i}`], { cwd: t, encoding: 'utf8' })
        assert.equal(r.status, 0, `rename ${e.id.slice(0, 20)}: ${r.stderr}`)
      })
      const after = parseRunFile(readFileSync(join(t, '.skillator/run.json'), 'utf8'), RUN_JSON).entries
      assert.deepEqual(after.map(x => x.name), ['n0', 'n1', 'n2', 'n3', 'n4'])
    } finally { rmSync(t, { recursive: true, force: true }) }
  })
}

test('duration: seconds carry into minutes - 119.6 s is 2 min 0 s, never 1 min 60 s', () => {
  assert.equal(duration(119_600), '2 min 0 s')
  assert.equal(duration(59_960), '1 min 0 s')
  assert.equal(duration(59_940), '59.9 s')
  assert.equal(duration(61_400), '1 min 1 s')
})

test('spawnJob: a real child - output streams, the exit code comes back; stop ends a long one', async () => {
  const node = process.execPath
  const got: string[] = []
  const code = await new Promise<number | null>(res => spawnJob([node, '-e', 'console.log("hi"); console.error("oops"); process.exit(3)'], process.cwd(), t => got.push(t), c => res(c)))
  assert.equal(code, 3)
  assert.match(got.join(''), /hi/)
  assert.match(got.join(''), /oops/)
  const ended = new Promise<number | null>(res => {
    const j = spawnJob([node, '-e', 'console.log("up"); setInterval(() => {}, 1000)'], process.cwd(), () => j.stop(), c => res(c))
  })
  const c2 = await ended
  assert.notEqual(c2, 0)
})
