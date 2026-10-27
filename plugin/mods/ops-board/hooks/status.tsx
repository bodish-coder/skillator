import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'
import type { StatusDraft, Ticket } from '../types'
import { STATE_NAME } from './lib/board'
import { runCall } from './lib/host'

const statusA = atom({ plugin: 'ops-board', key: 'status' } as const, null)
const flightA = atom({ plugin: 'ops-board', key: 'statusFlight' } as const, null)
const boardA = atom({ plugin: 'ops-board', key: 'board' } as const, null)
const actionFocusA = atom({ plugin: 'ops-board', key: 'actionFocus' } as const, null)
const assignA = atom({ plugin: 'ops-board', key: 'assign' } as const, null)
const personA = atom({ plugin: 'ops-board', key: 'person' } as const, null)
const reconcileA = atom({ plugin: 'ops-board', key: 'reconcile' } as const, null)
let generation = 0
const snapshot = (t: Ticket | null) => t ? `[${t.box}] ${t.line}` : null
const eligible = (t: Ticket | null) => !!t && [' ', '!', '>'].includes(t.box)
async function resolveTicket($: EngineInterface, id: string): Promise<Ticket | null> {
  const matches = (await read($, boardA))?.tickets.filter(t => t.id.toUpperCase() === id.trim().toUpperCase()) ?? []
  return matches.length === 1 ? matches[0]! : null
}
const fresh = (id: string, t: Ticket | null, mode: StatusDraft['mode']): StatusDraft =>
  ({ id, target: null, reason: '', expectedRow: snapshot(t), result: null, busy: false, helpPath: null, mode, generation: ++generation })
export async function clearStatus($: EngineInterface) { await update($, statusA, () => null) }
export async function openStatus($: EngineInterface, shown: string | null, canType = true, mode: StatusDraft['mode'] = 'status') {
  const t = shown ? await resolveTicket($, shown) : null
  if (!t && !canType) { $.ui.toast('Select a ticket first; typing an ID needs a keyboard surface.'); return }
  await update($, actionFocusA, () => null)
  await update($, assignA, () => null)
  await update($, personA, () => null)
  await update($, reconcileA, () => null)
  await update($, statusA, () => fresh(t?.id ?? '', t, mode))
  await $.ui.open({ id: 'ops-board', title: 'ops board', closeOnEscape: true })
  void $.ui.focus({ requestId: 'ops-board', key: t ? 'status:help' : 'status:ticket' }).catch(() => {})
  if (mode === 'help' && t) await generateStatusHelp($)
}
async function cancel($: EngineInterface) {
  await clearStatus($)
  await update($, actionFocusA, () => null)
  await $.ui.open({ id: 'ops-board', title: 'ops board' })
}
// The atom update claims the operation before any process await. Old rendered buttons
// and completions must still match the draft generation, including after cancel/reopen.
async function claim($: EngineInterface): Promise<StatusDraft | null> {
  let acquired = false
  const token = ++generation
  await update($, flightA, x => { acquired = x === null; return acquired ? token : x })
  if (!acquired) return null
  let claimed: StatusDraft | null = null
  await update($, statusA, x => {
    claimed = null // update may retry its callback after a version conflict
    if (!x || x.busy) return x
    claimed = { ...x, busy: true, result: null }
    return claimed
  })
  if (!claimed) await update($, flightA, x => x === token ? null : x)
  return claimed
}
async function finish($: EngineInterface, d: StatusDraft, result: string, helpPath: string | null = null) {
  await update($, flightA, () => null)
  await update($, statusA, x => x?.generation === d.generation ? { ...x, busy: false, result, helpPath } : x)
}
export async function applyStatus($: EngineInterface): Promise<boolean> {
  const d = await claim($)
  if (!d) return false
  const t = await resolveTicket($, d.id)
  if (!t || !eligible(t) || !d.target || !d.expectedRow) {
    await finish($, d, 'Choose a Pending, Blocked or Deferred ticket and a target.'); return false
  }
  if (d.expectedRow !== snapshot(t)) { await finish($, d, 'Board changed; reopen status and reselect the change.'); return false }
  if (d.target === 'pending' && t.box === ' ') { await finish($, d, 'Already Pending; no change.'); return false }
  if (d.target !== 'pending' && (!d.reason.trim() || /[\r\n()]/.test(d.reason))) {
    await finish($, d, 'Reason must be nonempty, one line, without parentheses.'); return false
  }
  const args = [t.id, d.target, d.expectedRow, ...(d.target === 'pending' ? [] : [d.reason])]
  try {
    const r = await runCall($, 'meta-status', args)
    if (r.code !== 0) {
      await finish($, d, (r.err.trim() || r.out.trim() || `exit ${r.code}`) + '\nCheck the board before retrying; reopen to capture a new snapshot.'); return false
    }
    await update($, flightA, () => null)
    $.ui.toast(r.out.trim() || `${t.id}: status updated`, { timeoutMs: 8000 })
    // Completion only clears its own generation, even if update retries. It must
    // not reset focus or reopen the pane: another form may now own that UI.
    await update($, statusA, x => x?.generation === d.generation ? null : x)
    return true
  } catch (err) { await finish($, d, `${String(err)}\nCheck the board before retrying.`); return false }
}
export async function generateStatusHelp($: EngineInterface): Promise<void> {
  const d = await claim($)
  if (!d) return
  const t = await resolveTicket($, d.id)
  if (!t) { await finish($, d, 'Type a unique ticket ID first.'); return }
  try {
    const r = await runCall($, 'holo-ticket', [t.id])
    const path = r.code === 0 ? / -> (.+?)(?: \(standalone page\))?\s*$/.exec(r.out)?.[1]?.trim() : null
    if (!path) { await finish($, d, r.err.trim() || r.out.trim() || `holo exited ${r.code}`); return }
    await finish($, d, 'Read-only decision support generated.', path)
    $.ui.toast(path, { timeoutMs: 10000 })
  } catch (err) { await finish($, d, String(err)) }
}
export async function renderStatus($: EngineInterface, e: RenderInput<'Pane'>): Promise<RenderElement | null> {
  const d = await read($, statusA)
  if (!d) return null
  const els = $.ui.resolve(e), { Box, Text, Button } = els
  const Input = e.surface !== 'mobile' && 'Input' in els ? els.Input : null
  const t = await resolveTicket($, d.id), focus = await read($, actionFocusA)
  const armed = !d.busy && !!focus && ['status:pending', 'status:blocked', 'status:deferred', 'status:apply', 'status:help', 'status:cancel'].includes(focus)
  const setId = async (id: string) => {
    const tk = await resolveTicket($, id)
    await update($, statusA, x => x && !x.busy && x.generation === d.generation ? { ...fresh(id, tk, x.mode), generation: x.generation } : x)
  }
  const set = (fn: (x: StatusDraft) => StatusDraft) => { void update($, statusA, x => x && !x.busy && x.generation === d.generation ? fn(x) : x) }
  return <Box flexDirection="column">
    <Text bold>{d.mode === 'help' ? 'Ticket decision help' : 'Ticket status'}</Text>
    <Text dimColor>Tab to actions; letters there. Esc cancels.</Text>
    {Input && !d.busy ? <Input key="status:ticket" label="Ticket " value={d.id} onInput={v => { void setId(v) }} onSubmit={v => { void setId(v) }} /> : <Text wrap="wrap">{'Ticket: ' + (d.id || '(select a ticket first)')}</Text>}
    <Text key="status:current" wrap="wrap">{t ? `${t.id}: ${STATE_NAME[t.box]} - ${t.title}\n${t.line}` : 'Type a unique ticket ID.'}</Text>
    {d.mode === 'status' && eligible(t) && !d.busy && <Box flexDirection="row" flexWrap="wrap" gap={2}>
      {(['pending', 'blocked', 'deferred'] as const).map((target, i) => <Button key={'status:' + target} plain hotkey={armed ? ['p', 'b', 'd'][i] : undefined} onPress={() => set(x => ({ ...x, target, result: null }))}>{`${d.target === target ? '(*)' : '( )'} ${target}`}</Button>)}
    </Box>}
    {d.mode === 'status' && t && !eligible(t) && <Text wrap="wrap">Use the existing worker, verification, decision or reopen workflow for this state.</Text>}
    {d.target && d.target !== 'pending' && (Input && !d.busy ? <Input key="status:reason" label="Reason " value={d.reason} onInput={v => set(x => ({ ...x, reason: v, result: null }))} onSubmit={v => set(x => ({ ...x, reason: v, result: null }))} /> : <Text wrap="wrap">{d.busy ? d.reason : 'A new wait reason needs a keyboard surface.'}</Text>)}
    {d.target && <Text wrap="wrap">{`${t ? STATE_NAME[t.box] : '?'} -> ${d.target}. ${d.target === 'pending' ? 'Clear resolved managed wait notes.' : 'Record one wait reason; no parentheses.'} Ownership and existing session claims stay.`}</Text>}
    {d.result && <Box key="status:result"><Text wrap="wrap">{d.result}</Text></Box>}
    {d.helpPath && <Box key="status:path"><Text wrap="wrap">{d.helpPath}</Text></Box>}
    {d.mode === 'help' && <Text wrap="wrap">{`Read-only. Fallback: node <skills>/holo-r2d2/scripts/holo.mjs --ticket ${t?.id ?? '<ID>'} --html`}</Text>}
    <Box flexDirection="row" flexWrap="wrap" gap={2}>
      {d.busy ? <Text>Working; check status before retrying.</Text> : <Box flexDirection="row" flexWrap="wrap" gap={2}>
      {d.mode === 'status' && eligible(t) && d.target && (d.target === 'pending' || Input) && <Button key="status:apply" plain onPress={() => {}}>{d.busy ? 'Applying...' : 'Apply'}</Button>}
      {t && <Button key="status:help" plain hotkey={armed ? 'h' : undefined} onPress={() => { void generateStatusHelp($) }}>Help</Button>}
      <Button key="status:cancel" plain hotkey={armed ? 'c' : undefined} onPress={() => { void cancel($) }}>Cancel</Button>
      </Box>}
    </Box>
  </Box>
}
