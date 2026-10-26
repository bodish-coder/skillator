import { atom, read, update } from 'claude-code'
import type { BoxProps, ButtonProps, ElementConstructor, EngineInterface, RenderElement, TextProps } from 'claude-code'
import type { Board, Engage, RunView } from '../types'
import type { AgentsView } from './agentstab'
import { runCall } from './lib/host'
import { parseRuns, scriptPathOf } from './lib/runs'
import { continuePrompt, engageOf, runLines, stageTickets as ticketsOf } from './lib/runlines'
import type { RunLine } from './lib/runlines'
import { treeLines } from './lib/agents'
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
const tabA = atom({ plugin: 'ops-board', key: 'tab' } as const, 'tickets')

const PANE = 'ops-board'          // pane.tsx's PANE_ID (it imports this file)
const PANE_NAME = 'ops board'     // pane.tsx's PANE_TITLE

export const RUNS_POLL_MS = 30_000
const CHAIN_STATUS_AT_ONCE = 2
let polling = false

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

// F85: the confirm is up while the Workflows tab is the one shown (as the Run tab's form).
export async function isEngageUp($: EngineInterface): Promise<boolean> {
  return (await read($, tabA)) === 'runs' && (await read($, engageA)) !== null
}
// /ops to another tab and an unload: the confirm just goes.
export async function dropEngage($: EngineInterface) {
  if ((await read($, engageA)) !== null) await update($, engageA, () => null)
}
// Cancel, Esc and done: the tab back, Esc the pane's own again.
export async function closeEngage($: EngineInterface) {
  if ((await read($, engageA)) === null) return
  await update($, engageA, () => null)
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

export type RunsView = { runs: RunView[]; board: Board | null; cols: number; engage: Engage | null }

// The runs the tab draws: those not all done (the rest are counted, not drawn).
export const openRuns = (runs: RunView[]) => runs.filter(r => !(r.total > 0 && r.done >= r.total))

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

export function RunsTab($: EngineInterface, els: Els, v: RunsView, a: AgentsView): RenderElement[] {
  const { Box, Text, Button } = els
  const out: RenderElement[] = []
  const draw = (l: RunLine) =>
    <Box key={l.key}><Text wrap="truncate-end">{l.segs.map(s => <Text color={s.color} dimColor={s.dim}>{s.text}</Text>)}</Text></Box>
  const open = openRuns(v.runs)
  const finished = v.runs.length - open.length
  if (!open.length) out.push(<Box key="none"><Text dimColor>{'no relay run open - /skillator:plan-runs <tickets> plans one'}</Text></Box>)
  open.forEach((run, i) => {
    if (i) out.push(<Text> </Text>)
    out.push(...runLines(run, v.board).map(draw))
    out.push(...treeLines(run, open, a.agents, a.workflows, v.board).map(draw))
    const ids = [...new Set(run.stages.flatMap(ticketsOf))]
    out.push(
      <Box flexDirection="row" gap={3}>
        <Button key={'engage:' + run.id} variant="primary" onPress={() => { void openEngage($, run.id) }}>Engage</Button>
        {run.planned && <Box key={'edit:' + run.id}><Text dimColor>{`Edit in chat: /skillator:plan-runs ${ids.join(' ')}`}</Text></Box>}
      </Box>,
    )
  })
  const loose = treeLines(null, open, a.agents, a.workflows, v.board)
  if (loose.length) {
    out.push(<Text> </Text>, <Box key="norun"><Text bold>no run</Text></Box>, ...loose.map(draw))
  }
  if (finished) {
    out.push(<Text> </Text>)
    out.push(<Box key="finished"><Text dimColor>{`${finished} finished run${finished === 1 ? '' : 's'} not shown`}</Text></Box>)
  }
  return out
}
