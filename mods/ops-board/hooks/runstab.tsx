import { atom, read, update } from 'claude-code'
import type { BoxProps, ButtonProps, Color, ElementConstructor, EngineInterface, RenderElement, TextProps } from 'claude-code'
import type { Board, RunView, Stage } from '../types'
import { runCall } from './lib/host'
import { parseRuns } from './lib/runs'
import { paint } from './paint'

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

export const continuePrompt = (id: string) =>
  `continue ${id}: drive its chain with skillator:relay-morpheus (chain next / chain dispatch)`

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

type Seg = { text: string; color?: Color; dim?: boolean }
type Els = { Box: ElementConstructor<BoxProps>; Text: ElementConstructor<TextProps>; Button: ElementConstructor<ButtonProps> }

const STATE_WORD: Record<string, string> = {
  x: 'landed', '~': 'in flight', '!': 'failed', '?': 'parked', '>': 're-planned', open: 'open', pending: 'pending',
}
const cut = (s: string, room: number) => (s.length <= room ? s : s.slice(0, Math.max(1, room - 1)) + '…')
const ticketsOf = (s: Stage) => s.ticket.split(/\s+/).filter(Boolean)
const afterOf = (s: Stage) => s.after.split(/[\s,]+/).filter(x => /^\d+$/.test(x)).map(Number)

function dot(board: Board | null, id: string): Seg {
  const t = board?.tickets.find(x => x.id === id)
  return t ? { text: '●', color: paint(t.box) } : { text: '●', dim: true }
}
function ticketSegs(board: Board | null, ids: string[]): Seg[] {
  if (!ids.length) return [{ text: '-' }]
  return ids.flatMap((id, i) => [...(i ? [{ text: ' ' }] : []), dot(board, id), { text: ' ' + id }])
}
const width = (segs: Seg[]) => segs.reduce((n, s) => n + s.text.length, 0)

// "1 and 3 · then 2": stages whose `after` stages are all in earlier waves run together.
export function waves(stages: Stage[]): number[][] {
  const own = new Set(stages.map(s => s.n))
  const left = new Map(stages.map(s => [s.n, afterOf(s).filter(a => own.has(a) && a !== s.n)]))
  const done = new Set<number>()
  const out: number[][] = []
  while (left.size) {
    let wave = [...left].filter(([, deps]) => deps.every(d => done.has(d))).map(([n]) => n)
    if (!wave.length) wave = [...left.keys()]            // a cycle: the rest, as they stand
    for (const n of wave) { done.add(n); left.delete(n) }
    out.push(wave)
  }
  return out
}
function wavesText(stages: Stage[]): string {
  const ws = waves(stages)
  const and = (w: number[]) => (w.length > 1 ? `${w.slice(0, -1).join(', ')} and ${w.at(-1)}` : String(w[0]))
  return `${ws.some(w => w.length > 1) ? 'runs in parallel' : 'runs in order'}: ${ws.map(and).join(' · then ')}`
}

// The stage's work: its title without the ticket ids it starts with.
function workOf(s: Stage): string {
  const ids = new Set(ticketsOf(s))
  const words = s.title.split(' ')
  while (words.length > 1 && ids.has(words[0]!)) words.shift()
  return words.join(' ')
}

function runLines(run: RunView, board: Board | null): { key: string; segs: Seg[] }[] {
  const lines: { key: string; segs: Seg[] }[] = []
  const owner: Seg[] = run.owner ? [{ text: '  ' }, { text: 'owner', dim: true }, { text: ' ' + run.owner }] : []
  const ids = [...new Set(run.stages.flatMap(ticketsOf))]
  const tail = run.planned
    ? `${ids.length} ticket${ids.length === 1 ? '' : 's'} → ${run.stages.length} stage${run.stages.length === 1 ? '' : 's'}`
    : `${run.done}/${run.total} done`
  lines.push({ key: 'run:' + run.id, segs: [{ text: run.id, color: 'suggestion' }, { text: '  ' + run.title }, ...owner, { text: '  ' + tail, dim: run.planned }] })
  if (!run.stages.length) return lines
  const tw = Math.max(8, ...run.stages.map(s => width(ticketSegs(board, ticketsOf(s))) + 2))
  const head = 'stage'.padEnd(7) + 'ticket'.padEnd(tw) + 'work'.padEnd(26) + 'after'.padEnd(8) + 'files'
  lines.push({ key: 'cols:' + run.id, segs: [{ text: head, dim: true }] })
  for (const s of run.stages) {
    const tk = ticketSegs(board, ticketsOf(s))
    const pad = ' '.repeat(Math.max(0, tw - width(tk)))
    const after = afterOf(s)
    const same = s.files !== '-' ? run.stages.find(o => o.n !== s.n && after.includes(o.n) && o.files === s.files) : undefined
    const files: Seg = same ? { text: `same file as ${same.n}, so after ${same.n}`, dim: true } : { text: s.files }
    const word = run.planned ? '' : STATE_WORD[s.state] ?? ''
    lines.push({ key: `stage:${run.id}:${s.n}`, segs: [
      { text: `  ${s.n}`.padEnd(7) }, ...tk, { text: pad + cut(workOf(s), 24).padEnd(26) + s.after.padEnd(8) }, files,
      ...(word ? [{ text: '  ' + word, color: (s.state === '!' ? 'error' : s.state === 'x' ? 'success' : undefined) as Color | undefined, dim: s.state === 'pending' }] : []),
    ] })
  }
  if (run.planned && run.stages.length > 1) {
    const t = wavesText(run.stages)
    const [lead, rest] = [t.slice(0, t.indexOf(':') + 1), t.slice(t.indexOf(':') + 1)]
    lines.push({ key: 'par:' + run.id, segs: [{ text: lead, dim: true }, { text: rest }] })
  }
  run.decisions.forEach((d, i) => {
    const m = /^(Q\d+) (\S+) (.*)$/.exec(d)
    lines.push({ key: `dec:${run.id}:${i}`, segs: m
      ? [{ text: 'parked', color: 'permission' }, { text: '  ' + m[1] + ' ' }, dot(board, m[2]!), { text: ` ${m[2]} ${m[3]}` }]
      : [{ text: 'parked', color: 'permission' }, { text: '  ' + d }] })
  })
  return lines
}

export function RunsTab($: EngineInterface, els: Els, v: RunsView): RenderElement[] {
  const { Box, Text, Button } = els
  const out: RenderElement[] = []
  const draw = (l: { key: string; segs: Seg[] }) =>
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
