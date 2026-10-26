import { atom, read, update } from 'claude-code'
import type { BoxProps, ButtonProps, ElementConstructor, EngineInterface, RenderElement, TextProps } from 'claude-code'
import type { Board, Diagnose, Engage, RunView } from '../types'
import type { AgentsView } from './agentstab'
import { gitBin, runCall } from './lib/host'
import { parseRuns, scriptPathOf } from './lib/runs'
import { continuePrompt, engageOf, finishedLine, isFinished, runLines, stageTickets as ticketsOf } from './lib/runlines'
import type { RunLine } from './lib/runlines'
import { treeLines } from './lib/agents'
import { diagnose } from './lib/diagnose'
import type { ShaState } from './lib/diagnose'
export { continuePrompt, runLines, waves } from './lib/runlines'

// F50, design §8: the Runs tab (mock m-plan). relay-morpheus list, then resume (F85: the
// run file whole) for each run not all done; a planned run shows its stage table, what runs
// in parallel and its parked decisions. F85: a run's mode, its script's phases (the
// .workflow.js beside the run file, read as data, never run) and, under it, the Workflow
// runs and agents serving its stages. Engage asks first, in this pane (B5), then submits
// /skillator:marathon-run (a script) or queues the run and submits its continue prompt.
// Ticket state is a coloured dot from the board, never a bracket code.

const runsA = atom({ plugin: 'ops-board', key: 'runs' } as const, [])
const relayA = atom({ plugin: 'ops-board', key: 'relay' } as const, null)
const boardA = atom({ plugin: 'ops-board', key: 'board' } as const, null)
const engageA = atom({ plugin: 'ops-board', key: 'engage' } as const, null)
const diagnoseA = atom({ plugin: 'ops-board', key: 'diagnose' } as const, null)   // F99
const tabA = atom({ plugin: 'ops-board', key: 'tab' } as const, 'tickets')

const PANE = 'ops-board'          // pane.tsx's PANE_ID (it imports this file)
const PANE_NAME = 'ops board'     // pane.tsx's PANE_TITLE

export const RUNS_POLL_MS = 30_000
const CHAIN_STATUS_AT_ONCE = 2
let polling = false
let closing = false   // F99: Diagnose's Close running

// One read of relay: the list, then each open run's file and its script. A failed list keeps what was shown.
export async function pollRuns($: EngineInterface): Promise<void> {
  if (polling) return
  polling = true
  try {
    const r = await runCall($, 'relay-list', [])
    if (r.code !== 0) return
    const chains: Record<string, string> = {}
    const scripts: Record<string, string> = {}
    const root = (await $.session.repo())?.root ?? ''
    const open = parseRuns(r.out, {}).filter(x => x.done < x.total)
    // The open runs' resume calls overlap, at most CHAIN_STATUS_AT_ONCE at a time.
    let next = 0
    const worker = async () => {
      while (next < open.length) {
        const run = open[next++]!
        const c = await runCall($, 'relay-resume', [run.id])
        if (c.code !== 0) continue
        chains[run.id] = c.out
        const js = scriptPathOf(c.out, root)
        if (js) { try { scripts[run.id] = await $.fs.read(js) } catch { /* no script: an agents run */ } }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CHAIN_STATUS_AT_ONCE, open.length) }, worker))
    const runs = parseRuns(r.out, chains, scripts)
    await update($, runsA, () => runs)
    const first = runs.find(x => x.done < x.total)
    const text = first ? `${first.id} ${first.done}/${first.total}` : null
    if (text !== await read($, relayA)) await update($, relayA, () => text)
  } finally {
    polling = false
  }
}

// F85: the confirm is up while the Workflows tab is the one shown (as the Run tab's form); F99: the Diagnose view likewise
export async function isEngageUp($: EngineInterface): Promise<boolean> {
  return (await read($, tabA)) === 'runs' && ((await read($, engageA)) !== null || (await read($, diagnoseA)) !== null)
}
// /ops to another tab and an unload: the confirm just goes.
export async function dropEngage($: EngineInterface) {
  if ((await read($, engageA)) !== null) await update($, engageA, () => null)
  if ((await read($, diagnoseA)) !== null) await update($, diagnoseA, () => null)   // F99
}
// Cancel, Esc and done: the tab back, Esc the pane's own again.
export async function closeEngage($: EngineInterface) {
  const up = (await read($, engageA)) !== null || (await read($, diagnoseA)) !== null   // F99: the Diagnose view too
  if (!up) return
  await update($, engageA, () => null)
  await update($, diagnoseA, () => null)
  await $.ui.open({ id: PANE, title: PANE_NAME })
}

// Engage: refused at once (a toast naming the driver) while another driver is live, else
// the confirm, Esc its Cancel.
export async function openEngage($: EngineInterface, id: string): Promise<void> {
  const run = (await read($, runsA)).find(r => r.id === id)
  if (!run) return
  const e = engageOf(run, await $.clock.now())
  if ('refused' in e) { $.ui.toast(e.refused); return }
  await update($, engageA, () => ({ id, ...e }))
  await $.ui.open({ id: PANE, title: PANE_NAME, closeOnEscape: true })
  void $.ui.focus({ requestId: PANE, key: 'engage:go' }).catch(() => {})
}

// Engage confirmed: checked again (a driver may have come since), then submitted - a run
// with no script after relay-morpheus queue-run add, said with what relay said and what ran.
export async function engageGo($: EngineInterface): Promise<void> {
  const g = await read($, engageA)
  await closeEngage($)
  if (!g) return
  const run = (await read($, runsA)).find(r => r.id === g.id)
  const e = run ? engageOf(run, await $.clock.now()) : { refused: `■ ${g.id} is no longer an open run` }
  if ('refused' in e) { $.ui.toast(e.refused); return }
  if (!e.queue) {
    // a slash command is run as one, never submitted as a prompt (the host refuses that)
    const [command, ...args] = e.text.slice(1).split(' ')
    $.ui.toast(`✓ ${g.id} engaged: ${e.text}`)
    void $.command.run({ command: command!, args: args.join(' ') })
      .catch(err => { $.ui.toast(`■ ${g.id} not engaged: ${e.text} - ${err instanceof Error ? err.message : String(err)}`) })
    return
  }
  const r = await runCall($, 'relay-queue-add', [g.id])
  const ran = r.argv.length ? `\nran: ${r.argv.join(' ')}` : ''
  const said = r.out.trim() || r.err.trim()
  if (r.code !== 0) {
    $.ui.toast(`■ ${g.id} not queued: ${r.err.trim() || r.out.trim() || `exit ${r.code}`}${ran}`)
    return
  }
  $.ui.toast(`✓ ${g.id} queued${said ? ` - ${said}` : ''}. Its continue prompt runs as the next turn.${ran}`)
  void $.prompt.submit({ text: continuePrompt(g.id) })
  void pollRuns($).catch(() => {})
}

// F99: Diagnose - the run file read fresh (resume, read-only), every landed sha asked of git
// (on HEAD / elsewhere / unknown), the board and the driver stamp; diagnose() judges. For each
// stage the file still holds open whose tickets are built, the sha Close would write: the
// file's landed cell, else the newest `<ticket>: ...` commit on HEAD; none - said, not closed.
export async function openDiagnose($: EngineInterface, id: string): Promise<void> {
  const listed = (await read($, runsA)).find(r => r.id === id)
  if (!listed) return
  const c = await runCall($, 'relay-resume', [id])
  if (c.code !== 0) { $.ui.toast(`■ ${id} not diagnosed: ${c.err.trim() || c.out.trim() || `exit ${c.code}`}`); return }
  // one list row rebuilt from what list said, so parseRuns reads the file as the poll does
  const run = parseRuns(`${id}  ${listed.title}  ${listed.done}/${listed.total} done`, { [id]: c.out })[0]!
  const repo = await $.session.repo()
  const git = repo ? await gitBin($) : null
  const ask = async (args: string[]) => {
    if (!git || !repo) return null
    try { return await $.process.run([git, ...args], { cwd: repo.root, timeoutMs: 10000 }) } catch { return null }
  }
  const shas = new Map<string, ShaState>()
  for (const s of run.stages) {
    // a sha only: relay also takes a path, and a > row's cell names a stage - neither is git's
    if (!s.landed || shas.has(s.landed) || !/^[0-9a-f]{4,40}$/i.test(s.landed)) continue
    const r = await ask(['merge-base', '--is-ancestor', s.landed, 'HEAD'])
    if (r) shas.set(s.landed, r.exitCode === 0 ? 'head' : r.exitCode === 1 ? 'off' : 'none')
  }
  const d = diagnose(run, await read($, boardA), shas, await $.clock.now())
  const closes: Diagnose['closes'] = []
  for (const c of d.closable) {
    const own = run.stages.find(s => s.n === c.n)?.landed
    const sha = own ?? (await ask(['log', '-1', '--format=%h', `--grep=^${c.ticket}:`, 'HEAD']))?.stdout.trim()
    if (sha) closes.push({ n: c.n, sha })
    else d.lines.push(`stage ${c.n}: no commit "${c.ticket}: ..." on HEAD to mark it landed with - by hand: relay-morpheus.sh ${id} stage ${c.n} x <owner> <sha>`)
  }
  if ((await read($, tabA)) !== 'runs') return              // the tab left while git answered: no stale view
  await update($, diagnoseA, () => ({ id, verdict: d.verdict, lines: d.lines, closes, confirm: false }))
  await $.ui.open({ id: PANE, title: PANE_NAME, closeOnEscape: true })
  void $.ui.focus({ requestId: PANE, key: closes.length ? 'diag:close' : 'diag:back' }).catch(() => {})
}

// Close confirmed: each lagging stage marked landed through relay-morpheus (never a hand edit);
// the first refusal stops it and is said with what ran.
async function closeRun($: EngineInterface): Promise<void> {
  if (closing) return                                       // a second Yes while the first runs closes nothing
  closing = true
  try {
    const d = await read($, diagnoseA)
    if (!d) return
    await closeEngage($)
    const done: number[] = []
    for (const c of d.closes) {
      const r = await runCall($, 'relay-stage-landed', [d.id, String(c.n), c.sha])
      if (r.code !== 0) {
        $.ui.toast(`■ ${d.id} stage ${c.n} not closed: ${r.err.trim() || r.out.trim() || `exit ${r.code}`}${r.argv.length ? `\nran: ${r.argv.join(' ')}` : ''}`)
        break
      }
      done.push(c.n)
    }
    if (done.length) $.ui.toast(`✓ ${d.id}: stage${done.length === 1 ? '' : 's'} ${done.join(', ')} marked landed`)
    void pollRuns($).catch(() => {})
  } finally {
    closing = false
  }
}

export async function readDiagnose($: EngineInterface): Promise<Diagnose | null> {
  return read($, diagnoseA)
}

export type RunsView = { runs: RunView[]; board: Board | null; cols: number; engage: Engage | null }

// The runs the tab draws: those not all done (the rest are counted, not drawn).
export const openRuns = (runs: RunView[]) => runs.filter(r => !isFinished(r))   // F99: the one definition

export async function readRuns($: EngineInterface, cols: number): Promise<RunsView> {
  return { runs: await read($, runsA), board: await read($, boardA), cols, engage: await read($, engageA) }
}

type Els = { Box: ElementConstructor<BoxProps>; Text: ElementConstructor<TextProps>; Button: ElementConstructor<ButtonProps> }

// F85: the engage confirm, drawn in place of the tab (B5: never a second pane).
export function EngageConfirm($: EngineInterface, els: Els, g: Engage): RenderElement[] {
  const { Box, Text, Button } = els
  return [
    <Box key="engage:title"><Text bold>{`Engage ${g.id}?`}</Text><Text dimColor>{'  Esc cancels'}</Text></Box>,
    <Text> </Text>,
    ...(g.queue ? [<Box key="engage:queue" flexDirection="row"><Text dimColor>{'First    '}</Text><Text wrap="wrap">{`relay-morpheus queue-run add ${g.id}`}</Text></Box>] : []),
    <Box key="engage:submits" flexDirection="row"><Text dimColor>{'Submits  '}</Text><Text wrap="wrap">{g.text}</Text></Box>,
    <Text> </Text>,
    <Box flexDirection="row" gap={4}>
      <Button key="engage:go" variant="primary" onPress={() => { void engageGo($) }}>Engage</Button>
      <Button key="engage:cancel" onPress={() => { void closeEngage($) }}>Cancel</Button>
    </Box>,
  ]
}

// F99: the Diagnose view, in place of the tab (B5). Read-only; Close asks once more.
export function DiagnoseView($: EngineInterface, els: Els, d: Diagnose): RenderElement[] {
  const { Box, Text, Button } = els
  const color = d.verdict === 'finished' ? 'success' : d.verdict === 'still running' ? 'warning' : 'error'
  const n = d.closes.length
  return [
    <Box key="diag:title"><Text bold>{`Diagnose ${d.id}: `}</Text><Text bold color={color}>{d.verdict}</Text><Text dimColor>{'  Esc back'}</Text></Box>,
    <Text> </Text>,
    ...(d.lines.length
      ? d.lines.map((l, i) => <Box key={`diag:line:${i}`}><Text wrap="wrap">{l}</Text></Box>)
      : [<Box key="diag:agree"><Text dimColor>run file, board, git and the driver stamp agree</Text></Box>]),
    <Text> </Text>,
    ...(n ? [<Box key="diag:close-what"><Text dimColor wrap="wrap">{`Close: relay-morpheus stage <n> x <sha> for ${d.closes.map(c => `${c.n} (${c.sha})`).join(', ')} - the run file only; tickets and git untouched`}</Text></Box>] : []),
    d.confirm
      ? <Box key="diag:confirm" flexDirection="row" gap={2}>
          <Text color="warning">{`mark ${n} stage${n === 1 ? '' : 's'} landed in ${d.id}'s run file?`}</Text>
          <Button key="diag:close-yes" onPress={() => { void closeRun($) }}>Yes, close</Button>
          <Button key="diag:close-no" onPress={() => { void update($, diagnoseA, x => (x ? { ...x, confirm: false } : x)) }}>No</Button>
        </Box>
      : <Box flexDirection="row" gap={4}>
          {n > 0 && <Button key="diag:close" variant="primary" onPress={() => { void update($, diagnoseA, x => (x ? { ...x, confirm: true } : x)) }}>Close run</Button>}
          <Button key="diag:back" onPress={() => { void closeEngage($) }}>Back</Button>
        </Box>,
  ]
}

export function RunsTab($: EngineInterface, els: Els, v: RunsView, a: AgentsView): RenderElement[] {
  const { Box, Text, Button } = els
  const out: RenderElement[] = []
  const draw = (l: RunLine) =>
    <Box key={l.key}><Text wrap="truncate-end">{l.segs.map(s => <Text color={s.color} dimColor={s.dim}>{s.text}</Text>)}</Text></Box>
  const open = openRuns(v.runs)
  if (!open.length) out.push(<Box key="none"><Text dimColor>{'no relay run open - /skillator:plan-runs <tickets> plans one'}</Text></Box>)
  open.forEach((run, i) => {
    if (i) out.push(<Text> </Text>)
    out.push(...runLines(run, v.board).map(draw))
    out.push(...treeLines(run, open, a.agents, a.workflows, v.board).map(draw))
    const ids = [...new Set(run.stages.flatMap(ticketsOf))]
    out.push(
      <Box flexDirection="row" gap={3}>
        <Button key={'engage:' + run.id} variant="primary" onPress={() => { void openEngage($, run.id) }}>Engage</Button>
        <Button key={'diagnose:' + run.id} onPress={() => { void openDiagnose($, run.id) }}>Diagnose</Button>
        {run.planned && <Box key={'edit:' + run.id}><Text dimColor>{`Edit in chat: /skillator:plan-runs ${ids.join(' ')}`}</Text></Box>}
      </Box>,
    )
  })
  const loose = treeLines(null, open, a.agents, a.workflows, v.board)
  if (loose.length) {
    out.push(<Text> </Text>, <Box key="norun"><Text bold>no run</Text></Box>, ...loose.map(draw))
  }
  // F99: finished runs after the active ones - one dim row each, Diagnose only, never Engage
  v.runs.filter(isFinished).forEach((run, i) => {
    if (open.length || loose.length || i) out.push(<Text> </Text>)
    const l = finishedLine(run)
    out.push(
      <Box key={l.key} flexDirection="row" gap={2}>
        <Text wrap="truncate-end">{l.segs.map(s => <Text color={s.color} dimColor={s.dim}>{s.text}</Text>)}</Text>
        <Button key={'diagnose:' + run.id} plain dimColor onPress={() => { void openDiagnose($, run.id) }}>diagnose</Button>
      </Box>,
    )
  })
  return out
}
