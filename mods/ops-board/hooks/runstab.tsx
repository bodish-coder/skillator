import { atom, read, update } from 'claude-code'
import type { BoxProps, ButtonProps, ElementConstructor, EngineInterface, RenderElement, TextProps } from 'claude-code'
import type { Board, RunView } from '../types'
import { runCall } from './lib/host'
import { parseRuns } from './lib/runs'
import { continuePrompt, runLines, stageTickets as ticketsOf } from './lib/runlines'
import type { RunLine } from './lib/runlines'
export { continuePrompt, runLines, waves } from './lib/runlines'

// F50, design §8: the Runs tab (mock m-plan). relay-morpheus list, then chain status
// for each run not all done; a planned run shows its stage table, what runs in
// parallel and its parked decisions; Start run queues it through relay-morpheus
// (queue-run add) and queues the prompt that drives it, said with the command that ran.
// Ticket state is a coloured dot from the board, never a bracket code.

const runsA = atom({ plugin: 'ops-board', key: 'runs' } as const, [])
const relayA = atom({ plugin: 'ops-board', key: 'relay' } as const, null)
const boardA = atom({ plugin: 'ops-board', key: 'board' } as const, null)

export const RUNS_POLL_MS = 30_000
const CHAIN_STATUS_AT_ONCE = 2
let polling = false

// One read of relay: the list, then each open run's chain. A failed list keeps what was shown.
export async function pollRuns($: EngineInterface): Promise<void> {
  if (polling) return
  polling = true
  try {
    const r = await runCall($, 'relay-list', [])
    if (r.code !== 0) return
    const chains: Record<string, string> = {}
    const open = parseRuns(r.out, {}).filter(x => x.done < x.total)
    // The open runs' chain status calls overlap, at most CHAIN_STATUS_AT_ONCE at a time.
    let next = 0
    const worker = async () => {
      while (next < open.length) {
        const run = open[next++]!
        const c = await runCall($, 'relay-chain-status', [run.id])
        if (c.code === 0) chains[run.id] = c.out
      }
    }
    await Promise.all(Array.from({ length: Math.min(CHAIN_STATUS_AT_ONCE, open.length) }, worker))
    const runs = parseRuns(r.out, chains)
    await update($, runsA, () => runs)
    const first = runs.find(x => x.done < x.total)
    const text = first ? `${first.id} ${first.done}/${first.total}` : null
    if (text !== await read($, relayA)) await update($, relayA, () => text)
  } finally {
    polling = false
  }
}

// Start run: relay-morpheus queue-run add <id>; on success the continue prompt is
// queued as its own turn. Either way a toast says what relay said and what ran.
export async function startRun($: EngineInterface, id: string): Promise<void> {
  const r = await runCall($, 'relay-queue-add', [id])
  const ran = r.argv.length ? `\nran: ${r.argv.join(' ')}` : ''
  const said = r.out.trim() || r.err.trim()
  if (r.code !== 0) {
    $.ui.toast(`■ ${id} not queued: ${r.err.trim() || r.out.trim() || `exit ${r.code}`}${ran}`)
    return
  }
  $.ui.toast(`✓ ${id} queued${said ? ` - ${said}` : ''}. Its continue prompt runs as the next turn.${ran}`)
  void $.prompt.submit({ text: continuePrompt(id) })
  void pollRuns($).catch(() => {})
}

export type RunsView = { runs: RunView[]; board: Board | null; cols: number }

export async function readRuns($: EngineInterface, cols: number): Promise<RunsView> {
  return { runs: await read($, runsA), board: await read($, boardA), cols }
}

type Els = { Box: ElementConstructor<BoxProps>; Text: ElementConstructor<TextProps>; Button: ElementConstructor<ButtonProps> }

export function RunsTab($: EngineInterface, els: Els, v: RunsView): RenderElement[] {
  const { Box, Text, Button } = els
  const out: RenderElement[] = []
  const draw = (l: RunLine) =>
    <Box key={l.key}><Text wrap="truncate-end">{l.segs.map(s => <Text color={s.color} dimColor={s.dim}>{s.text}</Text>)}</Text></Box>
  const open = v.runs.filter(r => !(r.total > 0 && r.done >= r.total))
  const finished = v.runs.length - open.length
  if (!open.length) out.push(<Box key="none"><Text dimColor>{'no relay run open - /skillator:plan-runs <tickets> plans one'}</Text></Box>)
  open.forEach((run, i) => {
    if (i) out.push(<Text> </Text>)
    out.push(...runLines(run, v.board).map(draw))
    if (run.planned) {
      const ids = [...new Set(run.stages.flatMap(ticketsOf))]
      out.push(
        <Box flexDirection="row" gap={3}>
          <Button key={'start:' + run.id} variant="primary" onPress={() => { void startRun($, run.id) }}>Start run</Button>
          <Box key={'edit:' + run.id}><Text dimColor>{`Edit in chat: /skillator:plan-runs ${ids.join(' ')}`}</Text></Box>
        </Box>,
      )
    }
  })
  if (finished) {
    out.push(<Text> </Text>)
    out.push(<Box key="finished"><Text dimColor>{`${finished} finished run${finished === 1 ? '' : 's'} not shown`}</Text></Box>)
  }
  return out
}
