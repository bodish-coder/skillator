// F79: the standalone ops app's Run tab (state id 'run'; not Workflows, id 'runs') - the
// repo's build / run / installer entry points from .skillator/run.json, as the mod's
// hooks/runtab.tsx. Pure and sync like state.ts: keys give a state and the effects the
// engine runs - the run-entries script (the file's one writer) through the call table,
// the file read, a job started or stopped. The engine finds the programs (Bins) on entering.
import type { Seg } from '../hooks/lib/bandlines'
import type { Bins, Job, RunFile, RunForm } from '../hooks/lib/runentries'
import { argvText, entryNote, jobStatus, keepTail, outLines, planEntry, RUN_FILE } from '../hooks/lib/runentries'
import type { Effect, Key, State, Step, Then } from './state'

export type RunState = { runFile: RunFile | null; runSel: string | null; runForm: RunForm | null; runJob: Job | null; runBins: Bins | null; runRoot: string }
export const RUN_INITIAL: RunState = { runFile: null, runSel: null, runForm: null, runJob: null, runBins: null, runRoot: '' }

const OUT_ROWS = 14
const same = (s: State): Step => ({ state: s, effects: [] })
const why = (r: { code: number; out: string; err: string }) => r.err.trim() || r.out.trim() || `run-entries exited ${r.code}`
const ranText = (argv: string[]) => 'ran: ' + argvText(argv)

// Entering the tab: the file read (and the programs found); absent, it is scanned.
export const enterRunEffect = (): Effect => ({ kind: 'runfile', scanIfMissing: true })

// The engine's read of run.json (and the programs found).
export function onRunFile(s: State, f: RunFile, bins: Bins | null, root: string): State {
  const ids = f.entries.map(e => e.id)
  return { ...s, runFile: f, runBins: bins ?? s.runBins, runRoot: root, runSel: s.runSel && ids.includes(s.runSel) ? s.runSel : ids[0] ?? null }
}

// r: run-entries scan, then the file read again; the toast says what it did.
export function rescan(s: State): Step {
  const then: Then = r => x => r.code !== 0
    ? { state: { ...x, toast: [`✗ run-entries scan failed: ${why(r)}`, ...(r.argv.length ? [ranText(r.argv)] : [])].join('\n') }, effects: [{ kind: 'runfile', scanIfMissing: false }] }
    : { state: { ...x, toast: [`✓ ${r.out.trim()}`, ranText(r.argv)].join('\n') }, effects: [{ kind: 'runfile', scanIfMissing: false }] }
  return { state: s, effects: [{ kind: 'run', call: 'run-scan', args: [], then }] }
}

const selected = (s: State) => s.runFile?.entries.find(e => e.id === s.runSel) ?? null
export const planOf = (s: State, id: string) => {
  const e = s.runFile?.entries.find(x => x.id === id)
  if (!e) return { error: `${id} is no longer in ${RUN_FILE}` }
  if (!s.runBins) return { error: 'still finding the programs on PATH - try again' }
  return planEntry(e, s.runRoot, s.runBins)
}

function start(s: State): Step {
  const f = s.runForm!
  if (s.runJob && s.runJob.ended === null) return { state: { ...s, runForm: { ...f, result: 'a job is running - s stops it first' } }, effects: [] }
  const p = planOf(s, f.id)
  if ('error' in p) return { state: { ...s, runForm: { ...f, result: p.error } }, effects: [] }
  const job: Job = { id: f.id, name: f.name, argv: p.argv, cwd: p.cwd, started: s.now, ended: null, code: null, stopped: false, error: null, out: '' }
  return { state: { ...s, runForm: null, runJob: job }, effects: [{ kind: 'job', argv: p.argv, cwd: p.cwd }] }
}

function saveName(s: State): Step {
  const f = s.runForm!
  const name = f.name.trim()
  if (!name) return { state: { ...s, runForm: { ...f, result: 'a name cannot be empty' } }, effects: [] }
  const then: Then = r => x => r.code !== 0
    ? (x.runForm ? { ...x, runForm: { ...x.runForm, result: why(r) } } : { ...x, toast: why(r) })
    : { state: { ...x, runForm: null, toast: [`✓ ${r.out.trim()}`, ranText(r.argv)].join('\n') }, effects: [{ kind: 'runfile', scanIfMissing: false }] }
  return { state: s, effects: [{ kind: 'run', call: 'run-rename', args: [f.id, name], then }] }
}

// The job's output and its end, as the engine sees them.
export const onJobOut = (s: State, text: string): State => (s.runJob ? { ...s, runJob: { ...s.runJob, out: keepTail(s.runJob.out, text) } } : s)
export const onJobEnd = (s: State, code: number | null, error: string | null, now: number): State =>
  (s.runJob && s.runJob.ended === null ? { ...s, runJob: { ...s.runJob, ended: now, code, error: s.runJob.stopped ? null : error } } : s)

function formKey(s: State, k: Key): Step {
  const f = s.runForm!
  if (f.mode === 'confirm') {
    switch (k.name) {
      case 'return': case 'enter': case 'y': return start(s)
      case 'n': return { state: { ...s, runForm: { ...f, mode: 'rename', result: null } }, effects: [] }
      case 'escape': return { state: { ...s, runForm: null }, effects: [] }
      default: return same(s)
    }
  }
  const edit = (name: string): Step => ({ state: { ...s, runForm: { ...f, name, result: null } }, effects: [] })
  switch (k.name) {
    case 'return': case 'enter': return saveName(s)
    case 'escape': return { state: { ...s, runForm: null }, effects: [] }
    case 'backspace': return edit([...f.name].slice(0, -1).join(''))
  }
  const ch = k.sequence
  if (!k.ctrl && ch && [...ch].length === 1 && ch >= ' ' && ch !== '\x7f' && [...f.name].length < 80) return edit(f.name + ch)
  return same(s)
}

// The Run tab's keys (a form up takes them all; app-wide keys stay with state.ts).
export function runKey(s: State, k: Key): Step {
  if (s.runForm) return formKey(s, k)
  const ids = s.runFile?.entries.map(e => e.id) ?? []
  const move = (by: number): Step => {
    const to = ids[Math.max(0, ids.indexOf(s.runSel ?? '')) + by]
    return { state: to ? { ...s, runSel: to } : s, effects: [] }
  }
  const e = selected(s)
  switch (k.name) {
    case 'up': case 'k': return move(-1)
    case 'down': case 'j': return move(1)
    case 'return': case 'enter': return e ? { state: { ...s, runForm: { mode: 'confirm', id: e.id, name: e.name, result: null } }, effects: [] } : same(s)
    case 'n': return e ? { state: { ...s, runForm: { mode: 'rename', id: e.id, name: e.name, result: null } }, effects: [] } : same(s)
    case 'r': return rescan(s)
    case 's': return s.runJob && s.runJob.ended === null ? { state: { ...s, runJob: { ...s.runJob, stopped: true } }, effects: [{ kind: 'stop' }] } : same(s)
    case 'escape': return { state: { ...s, toast: null }, effects: [] }
    default: return same(s)
  }
}

export function runKeys(s: State): string[] {
  if (s.runForm?.mode === 'confirm') return ['enter run', 'n rename', 'esc cancel']
  if (s.runForm) return ['type the name', 'enter save', 'esc cancel']
  const running = s.runJob && s.runJob.ended === null
  return ['↑↓ move', 'enter run', 'n rename', 'r rescan', ...(running ? ['s stop'] : []), 'q quit']
}

const dim = (text: string): Seg => ({ text, dim: true })
const cut = (t: string, room: number) => ([...t].length <= room ? t : [...t].slice(0, Math.max(1, room - 1)).join('') + '…')

// The tab's lines, each keyed (the selected row's key is 'row:<id>').
export function runLines(s: State): { key: string; segs: Seg[] }[] {
  const out: { key: string; segs: Seg[] }[] = []
  const f = s.runForm
  if (f) {
    const was = s.runFile?.entries.find(e => e.id === f.id)?.name ?? f.id   // the saved name, not the one being typed
    const head = f.mode === 'confirm' ? `Run ${was}?` : `Rename ${was}`
    out.push({ key: 'title', segs: [{ text: '  ' + head, bold: true }, dim('  esc cancels')] }, { key: 'gap', segs: [] })
    if (f.mode === 'confirm') {
      const p = planOf(s, f.id)
      if ('error' in p) out.push({ key: 'error', segs: [{ text: '  ' + p.error, color: 'error' }] })
      else out.push({ key: 'command', segs: [dim('  Command  '), { text: argvText(p.argv) }] }, { key: 'cwd', segs: [dim('  In       '), { text: p.cwd }] },
        { key: 'warn', segs: [{ text: '  This runs the repo\'s own code on this machine.', color: 'warning' }] })
    } else {
      out.push({ key: 'name', segs: [dim('  Name  '), { text: f.name + '_' }] }, { key: 'runs', segs: [dim('  Runs  '), { text: `run-entries rename ${f.id} ${f.name.trim()}` }] })
    }
    if (f.result) out.push({ key: 'result', segs: [{ text: '  ' + f.result, color: 'error' }] })
    return out
  }
  const rf = s.runFile
  if (!rf) out.push({ key: 'none', segs: [dim(`  reading ${RUN_FILE}…`)] })
  else if (rf.error) out.push({ key: 'none', segs: [{ text: '  ' + rf.error, color: 'error' }] })
  else if (!rf.entries.length) out.push({ key: 'none', segs: [dim(`  no entry points found - r scans again; ${RUN_FILE} takes hand-added ones`)] })
  else {
    const nameW = Math.min(Math.max(...rf.entries.map(e => [...e.name].length)) + 2, Math.max(8, s.cols - 18))
    for (const e of rf.entries) {
      const isSel = e.id === s.runSel
      const busy = s.runJob && s.runJob.id === e.id && s.runJob.ended === null
      const body = ' ' + cut(e.name, nameW).padEnd(nameW)
      out.push({ key: 'row:' + e.id, segs: [{ text: isSel ? '› ' : '  ' }, { text: '●', color: busy ? 'warning' : e.missing ? 'error' : 'success' },
        { text: body, inverse: isSel, dim: e.missing && !isSel }, dim(entryNote(e))] })
    }
  }
  const j = s.runJob
  if (j) {
    const st = jobStatus(j, s.now)
    out.push({ key: 'jgap', segs: [] }, { key: 'job', segs: [{ text: '  ' + st.text, color: st.color, bold: true }] }, { key: 'ran', segs: [dim('  ' + ranText(j.argv))] })
    outLines(j.out, OUT_ROWS).forEach((l, i) => out.push({ key: 'out:' + i, segs: [{ text: '  ' + l }] }))
  }
  return out
}
