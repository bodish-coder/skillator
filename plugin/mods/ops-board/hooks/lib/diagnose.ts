import type { Board, RunView } from '../../types'
import { ticketById } from './board'
import { DRIVER_STALE_MIN, stageTickets, stampAge } from './runlines'

// F99: a run diagnosed, read-only, from four witnesses - the run file's stage states, the
// stages' tickets on the board, each landed sha in git (on HEAD / elsewhere / unknown) and
// the Chain driver stamp. One line per disagreement; any disagreement is `inconsistent`,
// else all landed is `finished`, else a live driver (or a planned run) is `still running`,
// else `stalled`. `closable`: pending or in-flight stages whose tickets are built, with no
// live driver - what Close may mark landed (runstab.tsx closeRun, after a confirm). Pure.

export type Verdict = 'finished' | 'still running' | 'stalled' | 'inconsistent'
export type ShaState = 'head' | 'off' | 'none'
export type Diagnosis = { verdict: Verdict; lines: string[]; closable: { n: number; tickets: string[] }[] }

const BUILT = ['x', '%']            // the ticket's work exists: verified, or testing
const CLOSED = ['x', '>']           // a stage row no longer open (a > row names where its work went)
const CLOSABLE = ['pending', '~', 'open']   // parked (?) and failed (!) are said, never closed
const WORD: Record<string, string> = { '~': 'in flight', open: 'in flight', '!': 'failed', '?': 'parked' }

export function diagnose(run: RunView, board: Board | null, shas: Map<string, ShaState>, now: number): Diagnosis {
  const lines: string[] = []
  const closable: Diagnosis['closable'] = []
  const box = (id: string) => ticketById(board?.tickets, id)?.box ?? null
  const [tag, stamp] = (run.driver ?? '').split(' ')
  const age = stampAge(stamp, now)
  const live = !!tag && !(age >= DRIVER_STALE_MIN)        // unreadable (NaN) counts live, as engageOf fails closed
  const open = run.stages.filter(s => !CLOSED.includes(s.state))
  const finished = run.stages.length > 0 && open.length === 0
  if (!run.stages.length) lines.push('no stages read from the run file')
  for (const s of run.stages) {
    const ids = stageTickets(s)
    const known = ids.flatMap(id => { const b = box(id); return b === null ? [] : [[id, b] as const] })
    if (s.state === 'x') {
      const g = s.landed ? shas.get(s.landed) : undefined
      if (!s.landed) lines.push(`stage ${s.n}: landed with no sha in the run file`)
      else if (g === 'none') lines.push(`stage ${s.n}: landed ${s.landed} is not in this repo`)
      else if (g === 'off' && finished) lines.push(`stage ${s.n}: landed ${s.landed} is not on HEAD - the run branch is not merged`)
      for (const [id, b] of known) if (!BUILT.includes(b)) lines.push(`stage ${s.n}: landed, but ${id} is [${b}] on the board`)
      continue
    }
    if (s.state === '>') continue
    const built = known.length > 0 && known.length === ids.length && known.every(([, b]) => BUILT.includes(b))
    if (!built) continue
    lines.push(`stage ${s.n}: ${WORD[s.state] ?? 'not started'} in the run file, but ${known.map(([id, b]) => `${id} is [${b}]`).join(', ')} on the board`)
    if (!CLOSABLE.includes(s.state)) continue
    if (live) lines.push(`stage ${s.n} driven by ${tag} ${Number.isNaN(age) ? `(heartbeat unreadable: ${stamp})` : `${age}m ago`} - not closable`)
    else closable.push({ n: s.n, tickets: ids })
  }
  const verdict: Verdict = lines.length ? 'inconsistent' : finished ? 'finished' : run.planned || live ? 'still running' : 'stalled'
  if (open.length && !live && !run.planned) {
    const flying = open.some(s => s.state === '~' || s.state === 'open')
    lines.push(tag
      ? `driver ${tag}: last heartbeat ${Number.isNaN(age) ? `unreadable (${stamp})` : `${age}m ago`}, stale at ${DRIVER_STALE_MIN}m${flying ? ' - a stage is still marked in flight' : ''}`
      : `no driver on the Chain header, ${open.length} stage${open.length === 1 ? '' : 's'} open`)
  }
  return { verdict, lines, closable }
}
