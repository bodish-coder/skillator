import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'
import type { Proposal } from '../types'
import { STATE_NAME } from './lib/board'
import { runCall } from './lib/host'
import { appliedHead, appliedLine, applyOf, canApply, parseReconcile } from './lib/ticketsmodel'
import { closeForm } from './assign'
import { paint } from './paint'

// F81: `c` on the Tickets tab - ticket-meta reconcile's proposals as a form in the
// ops-board pane (B5: never a second pane): accept all, pick, or none. Each accepted
// row is written by its ticket-meta subcommand; the mod writes no file. Esc and the
// form's close go through assign.tsx's form handling (isFormUp / clearForm see it);
// the two apply buttons are taken in register.tsx, which re-reads the board after.

const PANE = 'ops-board'
const PANE_NAME = 'ops board'
const reconcileA = atom({ plugin: 'ops-board', key: 'reconcile' } as const, null)   // assign.tsx's twin: the hooks scan reads only this file's consts

const why = (r: { code: number; out: string; err: string }) => r.err.trim() || r.out.trim() || `exit ${r.code}`

export async function openReconcile($: EngineInterface) {
  const r = await runCall($, 'meta-reconcile', [])
  if (r.code !== 0) { $.ui.toast(`✗ ticket-meta reconcile refused: ${why(r)}`, { timeoutMs: 8000 }); return }
  const rows = parseReconcile(r.out)
  if (!rows.length) { $.ui.toast('ops board: reconcile - every [!] [ ] [~] row matches its evidence'); return }
  if (!rows.some(canApply)) {   // B16: nothing pressable - say what reconcile said instead of a dead form
    $.ui.toast(['ops board: reconcile - nothing to change', ...rows.map(p => `${p.id} stays - ${p.why}`)].join('\n'), { timeoutMs: 10000 })
    return
  }
  await update($, reconcileA, () => ({ rows, picked: [] }))
  await $.ui.open({ id: PANE, title: PANE_NAME, closeOnEscape: true })
  const first = rows.find(canApply)
  void $.ui.focus({ requestId: PANE, key: first ? 'rec:' + first.id : 'reconcile:none' }).catch(() => {})
}

// all: every row that changes; else the picked ones. One toast says what each run did.
export async function applyReconcile($: EngineInterface, all: boolean) {
  const v = await read($, reconcileA)
  if (!v) return
  const todo = v.rows.filter(p => canApply(p) && (all || v.picked.includes(p.id)))
  const lines: string[] = []
  for (const p of todo) {
    const { call, args } = applyOf(p)
    const r = await runCall($, call, args)
    lines.push(appliedLine(p, r.code === 0 ? null : why(r)))
  }
  const ok = lines.filter(l => l.startsWith('✓')).length
  $.ui.toast([appliedHead(ok, todo.length), ...lines].join('\n'), { timeoutMs: 10000 })
  await closeForm($)
}

export async function renderReconcile($: EngineInterface, e: RenderInput<'Pane'>): Promise<RenderElement | null> {
  const v = await read($, reconcileA)
  if (!v) return null
  const { Box, Text, Button } = $.ui.resolve(e)
  const n = v.rows.filter(canApply).length
  const dot = (b: Proposal['to']) => <Text color={paint(b)}>{'● ' + STATE_NAME[b]}</Text>
  const rows = v.rows.map(p => {
    if (!canApply(p)) {
      return <Box key={'rec:' + p.id} flexDirection="row"><Text dimColor>{`    ${p.id}  `}</Text>{dot(p.from)}<Text dimColor wrap="wrap">{'  stays - ' + p.why}</Text></Box>
    }
    const on = v.picked.includes(p.id)
    const toggle = () => { void update($, reconcileA, x => (x ? { ...x, picked: on ? x.picked.filter(i => i !== p.id) : [...x.picked, p.id] } : x)) }
    return (
      <Button key={'rec:' + p.id} plain onPress={toggle}>
        <Text color={on ? 'success' : undefined}>{on ? '[x]' : '[ ]'}</Text>{` ${p.id}  `}{dot(p.from)}{' -> '}{dot(p.to)}<Text dimColor wrap="wrap">{'  ' + p.why}</Text>
      </Button>
    )
  })
  return (
    <Box flexDirection="column">
      <Box key="form:title"><Text bold>Reconcile tickets</Text><Text dimColor>{'  Esc cancels'}</Text></Box>
      <Text dimColor>{`${n} to change, from ticket-meta reconcile - nothing is written until you apply`}</Text>
      <Text> </Text>
      {rows}
      <Text> </Text>
      <Box flexDirection="row" gap={4}>
        {n > 0 && <Button key="reconcile:all" variant="primary" onPress={() => {}}>Accept all</Button>}
        {v.picked.length > 0 && <Button key="reconcile:picked" onPress={() => {}}>{`Apply picked (${v.picked.length})`}</Button>}
        <Button key="reconcile:none" onPress={() => { void closeForm($) }}>None</Button>
      </Box>
    </Box>
  )
}
