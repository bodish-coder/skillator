import type { Color } from 'claude-code'
import type { Board, RunView, Stage } from '../../types'
import type { Seg } from './bandlines'
import type { Line } from './healthlines'
import { paint } from './board'

// F50, design §8: the Runs tab's lines (mock m-plan) and the continue prompt.
// Ticket state is a coloured dot from the board, never a bracket code. Pure;
// runstab.tsx draws them.

export type RunLine = Line

export const continuePrompt = (id: string) =>
  `continue ${id}: drive its chain with skillator:relay-morpheus (chain next / chain dispatch)`

const STATE_WORD: Record<string, string> = {
  x: 'landed', '~': 'in flight', '!': 'failed', '?': 'parked', '>': 're-planned', open: 'open', pending: 'pending',
}
const cut = (s: string, room: number) => (s.length <= room ? s : s.slice(0, Math.max(1, room - 1)) + '…')
// A stage's ticket ids; exported as stageTickets, apart from team.ts's ticketsOf.
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
export function wavesText(stages: Stage[]): string {
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

export function runLines(run: RunView, board: Board | null): Line[] {
  const lines: Line[] = []
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

export { ticketsOf as stageTickets }
