import { atom, read, update } from 'claude-code'
import type { BoxProps, ButtonProps, ElementConstructor, EngineInterface, RenderElement, RenderInput, TextProps } from 'claude-code'
import { clean } from './lib/bandlines'
import { runCall, isWindows } from './lib/host'
import { argvText, entryNote, findBins, jobStatus, keepTail, outLines, parseRunFile, planEntry, RUN_FILE } from './lib/runentries'
import type { Bins, Job, RunEntry, RunFile, RunForm } from './lib/runentries'

// F79: the Run tab (id 'run') - the repo's build / run / installer entry points from
// .skillator/run.json. Not the Workflows tab (id 'runs', runstab.tsx). The first open in
// a repo with no run.json scans (live-friday's run-entries - the file's one writer; the
// mod writes no file); r scans again and merges. A row (Enter or a click) shows the exact
// argv and working directory first and asks (it runs repo code); the job's output streams
// into the tab with its exit code and duration, s stops it. A150: every program by
// absolute path. B5: the confirm and rename forms draw in this pane, never a second one.
// B4: one job at a time, only the tail of its output held.

const PANE = 'ops-board'          // pane.tsx's PANE_ID (it imports this file)
const PANE_NAME = 'ops board'     // pane.tsx's PANE_TITLE

const tabA = atom({ plugin: 'ops-board', key: 'tab' } as const, 'tickets')
const runFileA = atom({ plugin: 'ops-board', key: 'runFile' } as const, null)
const runFormA = atom({ plugin: 'ops-board', key: 'runForm' } as const, null)
const runJobA = atom({ plugin: 'ops-board', key: 'runJob' } as const, null)

const OUT_ROWS = 14

// The live child: leaving its loop (stream.return()) kills it. One at a time. `stopped`:
// s came before the child was spawned - it is then never spawned.
type Live = { id: string; stop: () => Promise<unknown>; stopped: boolean }
let live: Live | null = null
// The programs on PATH, walked once per scan (r, entering the tab) - not on every draw of
// the confirm form and again at Run, so the argv shown is the argv run.
let bins: { key: string; bins: Bins } | null = null

const ran = (argv: string[]) => 'ran: ' + argvText(argv)
const why = (r: { code: number; out: string; err: string }) => r.err.trim() || r.out.trim() || `run-entries exited ${r.code}`

async function rootOf($: EngineInterface): Promise<string | null> {
  const repo = await $.session.repo()
  return repo ? repo.root.replace(/\\/g, '/').replace(/\/+$/, '') : null
}

// run.json read into the tab's state; absent: { missing: true }.
async function load($: EngineInterface): Promise<RunFile> {
  const root = await rootOf($)
  if (!root) return { path: '', entries: [], error: 'not a git repo - no entry points to run' }
  const path = root + '/' + RUN_FILE
  let st: { size: number } | null = null
  try { st = await $.fs.stat(path) } catch { st = null }
  if (!st) return { path, entries: [], error: null, missing: true }
  if (st.size > 1024 * 1024) return { path, entries: [], error: `${RUN_FILE} is over 1 MiB - not read` }
  try { return parseRunFile(await $.fs.read(path), path) } catch (e) {
    return { path, entries: [], error: `${RUN_FILE} not read: ${String((e as Error)?.message ?? e)}` }
  }
}

// r: run-entries scan (it creates or merges run.json), then the file read again.
export async function rescan($: EngineInterface, quiet = false) {
  bins = null
  const r = await runCall($, 'run-scan', [])
  if (r.code !== 0) {
    const text = `✗ run-entries scan failed: ${why(r)}${r.argv.length ? '\n' + ran(r.argv) : ''}`
    $.ui.toast(text, { timeoutMs: 8000 })
    const f = await load($)
    await update($, runFileA, () => (f.missing ? { ...f, error: text } : f))
    return
  }
  if (!quiet) $.ui.toast([`✓ ${r.out.trim()}`, ran(r.argv)].join('\n'), { timeoutMs: 6000 })
  const f = await load($)
  await update($, runFileA, () => f)
}

// Entering the tab: run.json read; the first time in a repo (no file yet) it is scanned.
export async function enterRun($: EngineInterface) {
  bins = null
  const lost = await jobOf($)       // a job a reload orphaned (see jobOf), ended in state
  if (lost?.stopped && !live) await update($, runJobA, x => (x && x.ended === null ? { ...x, stopped: true, ended: lost.ended } : x))
  const f = await load($)
  if (f.missing) return rescan($, false)
  await update($, runFileA, () => f)
}

export async function isRunFormUp($: EngineInterface): Promise<boolean> {
  return (await read($, tabA)) === 'run' && (await read($, runFormA)) !== null
}

async function showForm($: EngineInterface, ring: string) {
  await $.ui.open({ id: PANE, title: PANE_NAME, closeOnEscape: true })
  void $.ui.focus({ requestId: PANE, key: ring }).catch(() => {})
}

// /ops to another tab and an unload: the form just goes (the pane is reopened or gone).
export async function dropRunForm($: EngineInterface) {
  if ((await read($, runFormA)) !== null) await update($, runFormA, () => null)
}

// Cancel, Esc and done: the list back, Esc the pane's own again.
export async function closeRunForm($: EngineInterface) {
  if ((await read($, runFormA)) === null) return
  await update($, runFormA, () => null)
  await $.ui.open({ id: PANE, title: PANE_NAME })
}

async function openConfirm($: EngineInterface, e: RunEntry) {
  await update($, runFormA, () => ({ mode: 'confirm' as const, id: e.id, name: e.name, result: null }))
  await showForm($, 'run:go')
}

async function plan($: EngineInterface, e: RunEntry) {
  const root = await rootOf($)
  if (!root) return { error: 'not a git repo' }
  const win = await isWindows($)
  const path = (await $.env.get('PATH')) ?? (await $.env.get('Path'))
  const systemRoot = (await $.env.get('SystemRoot')) ?? (await $.env.get('SYSTEMROOT'))
  const key = [win, path, systemRoot].join('\0')
  if (bins?.key !== key) bins = { key, bins: await findBins(win, { path, systemRoot }, p => $.fs.exists(p)) }
  return planEntry(e, root, bins.bins)
}

async function entryOf($: EngineInterface, id: string): Promise<RunEntry | null> {
  return (await read($, runFileA))?.entries.find(x => x.id === id) ?? null
}

// Run (the confirm form's): the argv shown is the argv run, cwd the entry's own dir.
async function start($: EngineInterface) {
  const f = await read($, runFormA)
  const e = f ? await entryOf($, f.id) : null
  if (!f || !e) return
  const setResult = (result: string) => update($, runFormA, x => (x ? { ...x, result } : x))
  if (live) { await setResult('a job is running - s stops it first'); return }
  // claimed before any await: a second Run (a double press) meets the guard above
  const me: Live = { id: e.id, stop: async () => undefined, stopped: false }
  live = me
  const p = await plan($, e).catch(err => ({ error: String((err as Error)?.message ?? err) }))
  if ('error' in p) { live = null; await setResult(p.error); return }
  const now = await $.clock.now()
  const job: Job = { id: e.id, name: e.name, argv: p.argv, cwd: p.cwd, started: now, ended: null, code: null, stopped: false, error: null, out: '' }
  await update($, runJobA, () => job)
  await closeRunForm($)
  // s pressed in the awaits above: stopJob has ended the job - the child never starts
  // stopJob lets `live` go once it has written the end - letting go here would let a
  // second Run in before that write lands on the new job
  if (me.stopped || live !== me) return
  let stream: ReturnType<EngineInterface['process']['spawn']>
  try { stream = $.process.spawn({ argv: p.argv, cwd: p.cwd }) } catch (err) {
    // a spawn that throws at once ends the job here, never "running" for good
    await update($, runJobA, j => (j && j.started === now ? { ...j, ended: now, error: String((err as Error)?.message ?? err) } : j))
    if (live === me) live = null
    return
  }
  me.stop = () => stream.return(undefined as never)
  void (async () => {
    let code: number | null = null
    let error: string | null = null
    try {
      for (;;) {
        const r = await stream.next()
        if (r.done) { code = r.value?.code ?? null; break }
        await update($, runJobA, j => (j ? { ...j, out: keepTail(j.out, r.value.text) } : j))
      }
    } catch (err) { error = String((err as Error)?.message ?? err) }
    const ended = await $.clock.now()
    // the job ended in state before `live` lets go: ended === null with no live is a lost job
    await update($, runJobA, j => (j && j.started === now ? { ...j, ended, code, error: j.stopped ? null : error } : j))
    if (live === me) live = null
  })().catch(() => { if (live === me) live = null })
}

// s: the running job stopped (its loop left: the engine kills the child).
export async function stopJob($: EngineInterface) {
  const l = live
  if (!l) return
  l.stopped = true                                  // before any await: start() checks it
  await update($, runJobA, j => (j && j.ended === null ? { ...j, stopped: true } : j))
  try { await l.stop() } catch { /* already ended */ }
  const ended = await $.clock.now()
  await update($, runJobA, j => (j && j.ended === null ? { ...j, ended } : j))
  if (live === l) live = null
}

// A job left running in $.state with no live child here: the module was reloaded (the
// unload killed its child, the state outlived it). It reads stopped, never running for ever:
// drawn so (a draw is pure), and written so on entering the tab.
// The end is the first time this load saw it lost, so a redraw never moves it.
let lostAt: { started: number; at: number } | null = null
async function jobOf($: EngineInterface): Promise<Job | null> {
  const j = await read($, runJobA)
  if (!j || j.ended !== null || live) return j
  if (lostAt?.started !== j.started) lostAt = { started: j.started, at: await $.clock.now() }
  return { ...j, stopped: true, ended: lostAt.at }
}

async function saveName($: EngineInterface) {
  const f = await read($, runFormA)
  if (!f) return
  const name = f.name.trim()
  if (!name) { await update($, runFormA, x => (x ? { ...x, result: 'a name cannot be empty' } : x)); return }
  const r = await runCall($, 'run-rename', [f.id, name])
  if (r.code !== 0) { await update($, runFormA, x => (x ? { ...x, result: why(r) } : x)); return }
  $.ui.toast([`✓ ${r.out.trim()}`, ran(r.argv)].join('\n'), { timeoutMs: 6000 })
  const file = await load($)
  await update($, runFileA, () => file)
  await closeRunForm($)
}

type Els = { Box: ElementConstructor<BoxProps>; Text: ElementConstructor<TextProps>; Button: ElementConstructor<ButtonProps> }
const cut = (s: string, room: number) => (s.length <= room ? s : s.slice(0, Math.max(1, room - 1)) + '…')

// The form up (confirm or rename), drawn in place of the list.
async function formBody($: EngineInterface, e: RenderInput<'Pane'>, els: Els, f: RunForm, cols: number): Promise<RenderElement[]> {
  const { Box, Text, Button } = els
  const t = $.ui.resolve(e)
  const Input = e.surface !== 'mobile' && 'Input' in t ? t.Input : null
  const entry = await entryOf($, f.id)
  const label = (s: string) => <Text dimColor>{s}</Text>
  const result = f.result ? <Box key="run:result"><Text color="error" wrap="wrap">{f.result}</Text></Box> : null
  if (f.mode === 'rename') {
    const set = (v: string) => { void update($, runFormA, x => (x ? { ...x, name: v, result: null } : x)) }
    return [
      <Box key="form:title"><Text bold>{`Rename ${clean(entry?.name ?? f.id)}`}</Text><Text dimColor>{'  Esc cancels'}</Text></Box>,
      <Text> </Text>,
      Input ? <Input key="run:name" label="Name  " placeholder="a short name" value={f.name} autoFocus onInput={set} onSubmit={set} />
        : <Text dimColor>Renaming needs a keyboard surface (terminal or desktop).</Text>,
      <Box key="run:writes" flexDirection="row">{label('Runs  ')}<Text wrap="wrap">{clean(`run-entries rename ${f.id} ${f.name.trim()}`)}</Text></Box>,
      ...(result ? [result] : []),
      <Text> </Text>,
      <Box flexDirection="row" gap={4}>
        <Button key="run:save" variant="primary" onPress={() => { void saveName($) }}>Save</Button>
        <Button key="run:cancel" onPress={() => { void closeRunForm($) }}>Cancel</Button>
      </Box>,
    ]
  }
  const p = entry ? await plan($, entry) : { error: `${f.id} is no longer in ${RUN_FILE}` }
  return [
    <Box key="form:title"><Text bold>{`Run ${clean(entry?.name ?? f.id)}?`}</Text><Text dimColor>{'  Esc cancels'}</Text></Box>,
    <Text> </Text>,
    ...('error' in p
      ? [<Box key="run:error"><Text color="error" wrap="wrap">{clean(p.error)}</Text></Box>]
      : [
          <Box key="run:command" flexDirection="row">{label('Command  ')}<Text wrap="wrap">{clean(argvText(p.argv))}</Text></Box>,
          <Box key="run:cwd" flexDirection="row">{label('In       ')}<Text wrap="wrap">{clean(p.cwd)}</Text></Box>,
          <Box key="run:warn"><Text color="warning" wrap="wrap">{cut('This runs the repo\'s own code on this machine.', cols)}</Text></Box>,
        ]),
    ...(result ? [result] : []),
    <Text> </Text>,
    <Box flexDirection="row" gap={4}>
      {!('error' in p) && <Button key="run:go" variant="primary" onPress={() => { void start($) }}>Run</Button>}
      <Button key="run:rename" onPress={() => {
        void (async () => {
          await update($, runFormA, x => (x ? { ...x, mode: 'rename' as const, result: null } : x))
          await showForm($, 'run:name')
        })()
      }}>Rename</Button>
      <Button key="run:cancel" onPress={() => { void closeRunForm($) }}>Cancel</Button>
    </Box>,
  ]
}

export async function RunTab($: EngineInterface, e: RenderInput<'Pane'>, els: Els, cols: number): Promise<RenderElement[]> {
  const { Box, Text, Button } = els
  const form = await read($, runFormA)
  if (form) return formBody($, e, els, form, cols)
  const f = await read($, runFileA)
  const job = await jobOf($)
  const out: RenderElement[] = []
  if (!f) out.push(<Text dimColor>{`reading ${RUN_FILE}…`}</Text>)
  else if (f.error) out.push(<Box key="run:file-error"><Text color="error" wrap="wrap">{f.error}</Text></Box>)
  else if (!f.entries.length) out.push(<Text dimColor>{`no entry points found - r scans again; ${RUN_FILE} takes hand-added ones`}</Text>)
  else {
    const nameW = Math.min(Math.max(...f.entries.map(x => clean(x.name).length)) + 2, Math.max(8, cols - 16))
    for (const x of f.entries) {
      const note = clean(entryNote(x))
      const isJob = job && job.id === x.id && job.ended === null
      out.push(
        <Button key={'entry:' + x.id} plain onPress={() => { void openConfirm($, x) }}>
          <Text color={isJob ? 'warning' : x.missing ? 'error' : 'success'}>●</Text>
          <Text dimColor={x.missing}>{' ' + cut(clean(x.name), nameW).padEnd(nameW)}</Text>
          <Text dimColor>{cut(note, Math.max(4, cols - nameW - 3))}</Text>
        </Button>,
      )
    }
  }
  if (job) {
    const now = await $.clock.now()
    const st = jobStatus(job, now)
    out.push(<Text> </Text>)
    out.push(<Box key="job:status"><Text color={st.color} bold>{cut(clean(st.text), cols - 1)}</Text></Box>)
    out.push(<Box key="job:ran"><Text dimColor wrap="truncate-end">{clean(ran(job.argv))}</Text></Box>)
    outLines(job.out, OUT_ROWS).forEach((l, i) => out.push(<Box key={'job:line:' + i}><Text wrap="truncate-end">{l || ' '}</Text></Box>))
  }
  out.push(<Text> </Text>)
  out.push(
    <Box key="keys" flexDirection="row" gap={2}>
      <Text dimColor>enter run</Text>
      <Button key="key:rescan" plain dimColor hotkey="r" onPress={() => { void rescan($) }}>rescan</Button>
      {job && job.ended === null && <Button key="key:stop" plain dimColor hotkey="s" onPress={() => { void stopJob($) }}>stop</Button>}
    </Box>,
  )
  return out
}
