import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initial, reduce, runsCursor, onBoard, onMachine, onUsage, onRuns, dialogLines, formLines, personArgs, personError, reconcileLines, viewOf, startHandle, settle, afterRun, point, ticketsItems, activeUser } from '../state'
import type { State } from '../state'
import type { Box } from '../../types'
import { parseBoard } from '../../hooks/lib/board'
import { buildModel, isUserSectionOpen } from '../../hooks/lib/ticketsmodel'
import { continuePrompt } from '../../hooks/lib/runlines'

// The board's groups run IN PROGRESS, BLOCKED, PENDING DECISION, PENDING (buildModel):
// F3 [?] is drawn before F1 [ ], so the first row - the selection in force - is F3.
const BOARD = '- [ ] F1 — Dark mode [owner: @asha]\n- [?] F3 — Pick chart [decide: @asha]\n- [x] F4 — Done one\n'
const team = [{ handle: '@asha', emails: ['a@x'], name: 'Asha' }, { handle: '@vidul', emails: ['v@x'] }]
// F61: groups start collapsed; the row tests below run on every group open, F3 selected.
const ALL: Box[] = ['~', '%', '!', '?', ' ', '>', 'x', '-']
const s0: State = { ...onBoard(initial(80, 24, 0), parseBoard(BOARD, 'T', 1, 1), team, '@vidul'), open: ALL, selected: 'F3' }
const key = (name: string, extra = {}) => ({ name, ...extra })
const press = (s: typeof s0, ...names: string[]) => names.reduce((x, n) => reduce(x, key(n)).state, s)
const ok = (out: string, argv = ['sh', 'x']) => ({ code: 0, out, err: '', argv })
const GREEN = 'DRIVE=C:\nDISK_FREE=90000000000\nDISK_TOTAL=1\nMEM_FREE=9000000000\nHOLD=-\n'
const RED = 'DRIVE=C:\nDISK_FREE=500000000\nDISK_TOTAL=1\nMEM_FREE=9000000000\nHOLD=-\n'
const RED_HELD = 'DRIVE=C:\nDISK_FREE=500000000\nDISK_TOTAL=1\nMEM_FREE=9000000000\nHOLD=2026-10-20T03:29Z disk\n'

test('initial: tickets tab, nothing selected, green watch, no dialog', () => {
  const s = initial(80, 24, 5)
  assert.equal(s.tab, 'tickets'); assert.equal(s.selected, null); assert.equal(s.dialog, null)
  assert.deepEqual(s.watch, { level: 'green', reasons: [] })
  assert.deepEqual([s.cols, s.rows, s.now, s.quit], [80, 24, 5, false])
})

test('viewOf feeds buildModel: rows in group order, filter mode shown as filterOpen', () => {
  const v = viewOf(s0)
  assert.deepEqual(buildModel(v).rows.map(t => t.id), ['F3', 'F1'])
  assert.equal(v.filterOpen, false)
  assert.equal(viewOf(reduce(s0, key('f')).state).filterOpen, true)
})

test('down/up (and j/k) move the selection over headers and visible rows, stopping at the ends; x shows done', () => {
  let { state } = reduce(s0, key('down'))
  assert.equal(state.selected, 'head: ')                 // F61: the Pending header between F3 and F1
  ;({ state } = reduce(state, key('down')))
  assert.equal(state.selected, 'F1')
  assert.equal(reduce(state, key('down')).state.selected, 'F1')
  ;({ state } = reduce(press(state, 'up'), key('up')))
  assert.equal(state.selected, 'F3')
  assert.equal(press(state, 'j', 'j').selected, 'F1')
  assert.equal(press(state, 'j', 'j', 'k', 'k').selected, 'F3')
  const done = reduce(state, key('x')).state
  assert.equal(done.filter.showDone, true)
  assert.deepEqual(buildModel(viewOf(done)).rows.map(t => t.id), ['F3', 'F1', 'F4'])
  assert.equal(reduce(done, key('x')).state.filter.showDone, false)
})

test('Enter toggles the raw line of the selected row', () => {
  const s = reduce(s0, key('return')).state
  assert.equal(s.expanded, 'F3')
  assert.equal(reduce(s, key('return')).state.expanded, null)
})

test('a opens the assign dialog on the selected row, starts on the owner, Enter runs meta-assign', () => {
  const { state } = reduce(press(s0, 'down', 'down'), key('a'))
  assert.equal(state.dialog?.id, 'F1'); assert.equal(state.dialog?.handle, '@asha'); assert.equal(state.dialog?.kind, 'owner')
  assert.deepEqual(dialogLines(state), [
    'Assign F1',
    '  Ticket  F1 · [ ] pending · Dark mode',
    '  (•) implementation   ( ) decision          a / d',
    '  › @asha     Asha',
    '    @vidul',
    '    + add person',
    '  Change  [ ] pending → [ ] pending, owner @asha',
    '  Runs    ticket-meta assign F1 @asha',
    '  Enter confirm · Esc cancel',
  ])
  const moved = reduce(state, key('down')).state
  assert.equal(moved.dialog?.handle, '@vidul'); assert.equal(moved.dialogIndex, 1)
  assert.equal(reduce(moved, key('down')).state.dialog?.handle, '@vidul')       // last person: the cursor goes to + add person
  const r = reduce(moved, key('return'))
  assert.equal(r.effects[0]?.kind, 'run')
  assert.deepEqual([r.effects[0]!.call, r.effects[0]!.args], ['meta-assign', ['F1', '@vidul']])
  const after = settle(r.effects[0]!.then(ok('- [ ] F1 — Dark mode [owner: @vidul]\nwarning: x\n', ['sh', 'a b']))(r.state)).state
  assert.equal(after.dialog, null)
  assert.equal(after.toast, '✓ F1 now pending, owned by @vidul: Dark mode\nwarning: x\nran: sh "a b"')
  const refused = settle(r.effects[0]!.then({ code: 1, out: '', err: 'not on the team\n', argv: [] })(r.state)).state
  assert.equal(refused.dialog?.result, 'not on the team')
  const slow = settle(r.effects[0]!.then({ code: -1, out: '', err: 'timed out after 30 s', argv: ['sh'] })(r.state)).state
  assert.equal(slow.toast, 'ticket-meta did not finish in 30 s'); assert.equal(slow.dialog?.id, 'F1')
})

test('dialog: Esc cancels, q does not quit, the result line shows a refusal', () => {
  const d = reduce(s0, key('a')).state
  assert.equal(reduce(d, key('escape')).state.dialog, null)
  const q = reduce(d, key('q'))
  assert.equal(q.effects.length, 0); assert.equal(q.state.dialog?.id, 'F3')
  const bad = { ...d, dialog: { ...d.dialog!, result: 'not on the team' } }
  assert.ok(dialogLines(bad).includes('  not on the team'))
})

test('d on a row opens a decision; a / d in the dialog switch kind; D on a [?] row runs decided', () => {
  const state = reduce(s0, key('d')).state                 // F3, the first row
  assert.equal(state.dialog?.kind, 'decide'); assert.equal(state.dialog?.handle, '@asha')
  assert.equal(dialogLines(state)[0], 'Assign F3 for a decision')
  assert.equal(dialogLines(state)[1], '  Ticket  F3 · [?] pending decision · Pick chart')
  assert.equal(dialogLines(state)[2], '  ( ) implementation   (•) decision          a / d')
  assert.ok(dialogLines(state).includes('  Change  [?] decision → [?] decision, decide @asha'))
  const flipped = reduce(state, key('a')).state
  assert.equal(flipped.dialog?.kind, 'owner'); assert.equal(dialogLines(flipped)[0], 'Assign F3')
  const r = reduce(reduce(flipped, key('d')).state, key('return'))
  assert.deepEqual([r.effects[0]!.call, r.effects[0]!.args], ['meta-decide', ['F3', '@asha']])
  assert.match(settle(r.effects[0]!.then(ok(''))(r.state)).state.toast ?? '', /^✓ F3 now pending decision, for @asha to decide: Pick chart/)
  const dd = reduce(state, key('escape')).state
  const dr = reduce(dd, key('D'))
  assert.deepEqual([dr.effects[0]!.call, dr.effects[0]!.args], ['meta-decided', ['F3']])
  assert.equal(settle(dr.effects[0]!.then(ok(''))(dr.state)).state.toast, '✓ F3 decided, now pending: Pick chart\nran: sh x')
  assert.match(settle(dr.effects[0]!.then({ code: 2, out: '', err: 'no', argv: ['sh'] })(dr.state)).state.toast ?? '', /^✗ ticket-meta decided F3 refused: no/)
  const notDecidable = reduce(press(s0, 'down', 'down'), key('D'))   // F1 is [ ]
  assert.equal(notDecidable.effects.length, 0); assert.ok(notDecidable.state.toast)
})

test('a dialog on a ticket in progress warns; an empty team starts on no one and Enter runs nothing', () => {
  const b = parseBoard('- [~] F9 — Busy (@cc-1)\n', 'T', 1, 1)
  const s = reduce({ ...onBoard(initial(80, 24, 0), b, [], null), open: ['~'] as Box[], selected: 'F9' }, key('a')).state
  assert.equal(s.dialog?.handle, null)
  assert.ok(dialogLines(s).some(l => l.includes('F9 is in progress under @cc-1')))
  // A143: ticket-meta keeps the session tag beside the owner; the warning must not say it drops
  assert.ok(dialogLines(s).some(l => l.includes('the tag stays - tell that session')))
  assert.ok(!dialogLines(s).some(l => l.includes('drops that tag')))
  assert.ok(dialogLines(s).some(l => l.includes('no .skillator/team.md yet')))
  assert.equal(reduce(s, key('return')).effects.length, 0)
  // F77: nothing selected (no board yet) opens the dialog on an empty Ticket field, no toast
  const none = reduce(initial(80, 24, 0), key('a')).state
  assert.equal(none.toast, null); assert.equal(none.dialog?.id, ''); assert.equal(none.dialogField, 'ticket')
})

test('startHandle: the ticket\'s own handle on the team, else me, else the first member', () => {
  const t = parseBoard('- [ ] F1 — x [owner: @VIDUL]\n- [ ] F2 — y [owner: @zed]\n', 'T', 1, 1).tickets
  assert.equal(startHandle(t[0]!, 'owner', team, null), '@vidul')
  assert.equal(startHandle(t[1]!, 'owner', team, '@vidul'), '@vidul')
  assert.equal(startHandle(t[1]!, 'owner', team, null), '@asha')
  assert.equal(startHandle(t[1]!, 'decide', [], null), null)
})

test('red machine facts hold through relay once; R resumes only on a fresh green reading', () => {
  const red = onMachine(s0, RED, 0)
  assert.equal(red.state.watch.level, 'red')
  assert.equal(red.effects[0]?.call, 'relay-hold')
  assert.deepEqual(red.effects[0]?.args, ['disk 0.5 GB free (below 1 GB)'])
  const held = settle(red.effects[0]!.then(ok('held'))(red.state)).state
  assert.equal(held.toast, '■ HOLD - disk 0.5 GB free (below 1 GB). New relay stages and GREEN runs are held. Free space, then R to resume.\nran: sh x')
  const again = onMachine(held, RED_HELD, 0)
  assert.equal(again.effects.length, 0)
  // An unchanged outcome toasts nothing new.
  const twice = onMachine({ ...held, toast: null }, RED, 0)
  assert.equal(settle(twice.effects[0]!.then(ok('held'))(twice.state)).state.toast, null)
  const failed = settle(red.effects[0]!.then({ code: 1, out: '', err: 'locked', argv: ['sh', 'x'] })(red.state)).state
  assert.match(failed.toast ?? '', /the watchdog hold could not be set: locked/)
  assert.ok(failed.notes.some(n => n.startsWith('■ watchdog hold not set: locked')))

  const rr = reduce(again.state, key('R'))
  assert.equal(rr.effects[0]?.call, 'pending-machine')
  const still = settle(rr.effects[0]!.then(ok(RED_HELD))(rr.state))
  assert.match(still.state.toast ?? '', /^still red: disk .* - not released$/)
  assert.ok(!still.effects.some(e => e.kind === 'run' && e.call === 'relay-release'))
  const none = settle(rr.effects[0]!.then({ code: 127, out: '', err: 'x', argv: [] })(rr.state))
  assert.equal(none.state.toast, 'could not read the machine facts - not released'); assert.equal(none.effects.length, 0)
  const green = settle(rr.effects[0]!.then(ok(GREEN.replace('HOLD=-', 'HOLD=2026-10-20T03:29Z disk')))(rr.state))
  const rel = green.effects.find(e => e.kind === 'run' && e.call === 'relay-release')
  assert.ok(rel && rel.kind === 'run')
  const freed = settle(rel.then(ok('released'))(green.state)).state
  assert.equal(freed.machine?.hold, null); assert.equal(freed.watch.level, 'green')
  assert.equal(freed.toast, 'released\nran: sh x')
  assert.match(settle(rel.then({ code: 1, out: '', err: 'nope', argv: ['sh'] })(green.state)).state.toast ?? '', /^release failed \(exit 1\): nope/)
})

test('R: the fresh reading is stamped with the clock when it lands, not the launch time', () => {
  const launched = initial(80, 24, 1000)
  const rr = reduce(launched, key('R'))
  const e = rr.effects[0]!
  assert.ok(e.kind === 'run')
  const later = afterRun(e, ok(GREEN), rr.state, 600000)
  assert.equal(later.state.machine?.at, 600000)
  assert.equal(later.state.now, 600000)
})

// F87: F on Health = /ops resume force; MUTE= is the line the engine appends from watchdog.mute.
const MEM_RED = 'DRIVE=C:\nDISK_FREE=90000000000\nDISK_TOTAL=1\nMEM_FREE=600000000\nHOLD=-\n'
const MUTED = 'MUTE=2026-10-25T09:00Z mem 0.6 GB free\n'
const health: State = { ...s0, tab: 'health' }

test('F87: F on Health releases whatever the reading - the mute written first, then relay release, then a poll', () => {
  const f = reduce({ ...health, now: Date.UTC(2026, 9, 25, 9, 0) }, key('F'))
  assert.equal(f.effects[0]?.kind === 'run' && f.effects[0].call, 'pending-machine')
  const read = f.effects[0]!
  assert.ok(read.kind === 'run')
  const wrote = settle(read.then(ok(MEM_RED + 'HOLD=2026-10-25T08:00Z mem\n'))(f.state))
  const mute = wrote.effects[0]!
  assert.ok(mute.kind === 'mute' && mute.then)
  assert.equal(mute.text, '2026-10-25T09:00Z mem 0.6 GB free')
  // the write failing: not released
  const nope = settle(mute.then({ code: 1, out: '', err: 'EACCES', argv: [] })(wrote.state))
  assert.equal(nope.state.toast, 'could not write .skillator/watchdog.mute: EACCES - not released'); assert.equal(nope.effects.length, 0)
  const rel = settle(mute.then({ code: 0, out: '', err: '', argv: [] })(wrote.state)).effects[0]!
  assert.ok(rel.kind === 'run' && rel.call === 'relay-release')
  const done = settle(rel.then(ok('watchdog: released'))({ ...wrote.state, machine: onMachine(s0, MEM_RED, 0).state.machine }))
  assert.equal(done.state.toast, 'watchdog: released\nwatchdog muted (forced 09:00Z), mem 0.6 GB free - memory red does not hold until memory reads green once, or /ops watchdog on; disk red still holds\nran: sh x')
  assert.equal(done.state.watch.level, 'amber')
  assert.deepEqual(done.effects, [{ kind: 'poll', what: 'slow' }])
  // F is Health's only; elsewhere it is not a force
  assert.ok(!reduce(s0, key('F')).effects.some(e => e.kind === 'run' && e.call === 'pending-machine'))
})

test('F87: muted, memory red does not hold, disk red does; memory green once unmutes; plain R unchanged', () => {
  const muted = onMachine(s0, MEM_RED + MUTED, 0)
  assert.equal(muted.state.watch.level, 'amber')
  assert.ok(muted.state.watch.reasons.includes('watchdog muted (forced 09:00Z)'))
  assert.equal(muted.effects.length, 0)
  const disk = onMachine(s0, RED.replace('MEM_FREE=9000000000', 'MEM_FREE=600000000') + MUTED, 0)
  assert.equal(disk.state.watch.level, 'red')
  assert.equal(disk.effects[0]?.kind === 'run' && disk.effects[0].call, 'relay-hold')
  const green = onMachine(muted.state, GREEN + MUTED, 0)
  assert.deepEqual(green.effects, [{ kind: 'mute', text: '' }])
  assert.equal(green.state.machine?.mute, undefined)
  assert.equal(green.state.toast, 'watchdog unmuted - memory reads green; memory red holds again')
  // not muted: memory red holds, and R still refuses on it
  const red = onMachine(s0, MEM_RED, 0)
  assert.equal(red.effects[0]?.kind === 'run' && red.effects[0].call, 'relay-hold')
  const rr = reduce(red.state, key('R'))
  assert.ok(rr.effects[0]?.kind === 'run')
  assert.match(settle(rr.effects[0].then(ok(MEM_RED))(rr.state)).state.toast ?? '', /^still red: mem 0\.6 GB free \(below 1 GB\) - not released$/)
})

test('stale locks are listed in one note, replaced when they change, never deleted', () => {
  const kv = GREEN + 'LOCK=.skillator/x.lock|22|pid 7\n'
  const a = onMachine(s0, kv, 0).state
  assert.equal(a.watch.level, 'amber')
  assert.equal(a.notes.filter(n => n.startsWith('▲ 1 stale lock, not deleted:')).length, 1)
  assert.equal(onMachine(a, GREEN, 0).state.notes.some(n => n.includes('stale lock')), false)
})

test('usage: a changed level line asks relay to decide; same line asks nothing; the answer is kept', () => {
  const a = onUsage(s0, 'src=codex 5h=41 7d=55 ctx=- max=-\n', 0)
  assert.deepEqual([a.effects[0]?.call, a.effects[0]?.args], ['relay-decide', ['src=watch-cortana 5h=41 7d=55 ctx=- max=-']])
  assert.equal(a.state.usage?.five?.pct, 41); assert.equal(a.state.usage?.seven?.source, 'watch-cortana')
  assert.equal(onUsage(a.state, 'src=codex 5h=41 7d=55 ctx=- max=-\n', 1).effects.length, 0)
  const d = settle(a.effects[0]!.then(ok('RELEASE 41\n'))(a.state)).state
  assert.equal(d.usage?.decision, 'RELEASE 41')
  const failed = settle(a.effects[0]!.then({ code: 1, out: '', err: '', argv: [] })(a.state)).state
  assert.equal(failed.usage?.decision, null); assert.equal(failed.decidedLine, null)
  const none = onUsage(s0, 'src=none 5h=- 7d=- ctx=- max=-\n', 0)
  assert.deepEqual(none.effects[0]?.args, ['src=none 5h=- 7d=- ctx=- max=-'])
})

const LIST = 'RUN-0012  Ops everywhere                               0/2 done\n  owner: @asha\nRUN-0013  Other                                      1/3 done  (stage 2 open)\n'
const CHAIN = '## Chain\n### S1 - stage 1 - F1 Dark mode\ntickets: F1\n### S2 - stage 2 - F3 Chart\ntickets: F3\nafter: 1\n'

test('runs: onRuns sets the runs and the relay text; up/down move; Enter expands; e engages (F85: a confirm, then queue-run add)', () => {
  const s = onRuns(reduce(s0, key('2')).state, LIST, { 'RUN-0012': CHAIN })
  assert.equal(s.runs.length, 2); assert.equal(s.relay, 'RUN-0012 0/2'); assert.equal(s.runsSelected, 'RUN-0012')
  assert.equal(reduce(s, key('down')).state.runsSelected, 'RUN-0013')
  assert.equal(reduce(press(s, 'down'), key('up')).state.runsSelected, 'RUN-0012')
  assert.equal(reduce(s, key('return')).state.runsExpanded, 'RUN-0012')
  const asked = reduce(s, key('e'))
  assert.deepEqual(asked.effects, [])                              // F85: the confirm first
  assert.deepEqual(asked.state.engage, { id: 'RUN-0012', text: continuePrompt('RUN-0012'), queue: true })
  assert.equal(reduce(asked.state, key('escape')).state.engage, null)
  const r = reduce(asked.state, key('return'))
  assert.deepEqual([r.effects[0]!.call, r.effects[0]!.args], ['relay-queue-add', ['RUN-0012']])
  const q = settle(r.effects[0]!.then(ok('queued RUN-0012'))(r.state))
  assert.ok(q.state.toast?.startsWith('✓ RUN-0012 queued - queued RUN-0012.'))
  assert.ok(q.state.toast?.includes(continuePrompt('RUN-0012')))
  assert.deepEqual(q.effects, [{ kind: 'poll', what: 'runs' }])
  assert.match(settle(r.effects[0]!.then({ code: 1, out: '', err: 'busy', argv: ['sh'] })(r.state)).state.toast ?? '', /^■ RUN-0012 not queued: busy/)
})
// F99: e on a finished run is refused - nothing left to drive.
test('runs: e on a finished run is refused with a toast, no confirm', () => {
  const s = onRuns(reduce(s0, key('2')).state, 'RUN-0012  two  0/2 done\nRUN-0011  done before  3/3 done\n', {})
  assert.deepEqual(s.runs.map(r => r.id), ['RUN-0012', 'RUN-0011'])
  const r = reduce(press(s, 'down'), key('e'))
  assert.equal(r.state.engage, null)
  assert.equal(r.state.toast, '■ RUN-0011 not engaged: all 3 stages landed - nothing left to drive')
})

// F76: the Runs tab holds a Runs and a Workflows section that open and close as F61's
// groups: up/down walk the headers and the rows of an open section, Enter on a header
// opens or closes it (a run hidden in it shows as its header selected), s on a header runs nothing.
test('F76: runs and workflows sections - both start open, Enter on a header closes it, the cursor walks headers', () => {
  const s = onRuns(reduce(s0, key('2')).state, LIST, { 'RUN-0012': CHAIN })
  assert.deepEqual(s.runsOpen, ['runs', 'workflows'])
  assert.equal(runsCursor(s), 'RUN-0012')
  assert.equal(runsCursor(press(s, 'up')), 'head:runs')
  assert.equal(runsCursor(press(s, 'up', 'up')), 'head:runs')
  assert.equal(runsCursor(press(s, 'down', 'down')), 'head:workflows')
  assert.equal(runsCursor(press(s, 'down', 'down', 'down')), 'head:workflows')
  // Enter on the Runs header closes it; the cursor stays on the header; down goes to Workflows
  const shut = press(s, 'up', 'return')
  assert.deepEqual(shut.runsOpen, ['workflows'])
  assert.equal(runsCursor(shut), 'head:runs')
  assert.equal(runsCursor(press(shut, 'down')), 'head:workflows')
  assert.deepEqual(press(shut, 'return').runsOpen, ['workflows', 'runs'])
  // e on a header engages nothing
  const onHead = reduce(press(s, 'up'), key('e'))
  assert.equal(onHead.effects.length, 0); assert.ok(onHead.state.toast)
  // closed with a run selected: the header shows selected; opening lands back on the run
  const hid = { ...s, runsSelected: 'RUN-0013', runsOpen: ['workflows' as const] }
  assert.equal(runsCursor(hid), 'head:runs')
  assert.equal(runsCursor(press(hid, 'return')), 'RUN-0013')
  // the Workflows header
  const wf = press(s, 'down', 'down', 'return')
  assert.deepEqual(wf.runsOpen, ['runs'])
  assert.equal(runsCursor(wf), 'head:workflows')
  // a new list keeps a header selection
  assert.equal(onRuns(press(s, 'up'), LIST, {}).runsSelected, 'head:runs')
})

test('tabs, filter mode, team view, refresh, quit', () => {
  assert.equal(reduce(s0, key('2')).state.tab, 'runs')
  assert.deepEqual(reduce(s0, key('2')).effects, [{ kind: 'poll', what: 'runs' }])
  assert.equal(reduce(s0, key('3')).state.tab, 'health')
  assert.equal(reduce(press(s0, '3'), key('1')).state.tab, 'tickets')
  assert.equal(reduce(s0, key('tab')).state.tab, 'runs')
  assert.equal(reduce(s0, key('tab', { shift: true })).state.tab, 'run')   // F79: Run is the last tab
  assert.equal(reduce(press(s0, '4'), key('tab')).state.tab, 'explorer')  // F75: Explorer after Messages
  assert.equal(reduce(press(s0, '5'), key('tab')).state.tab, 'run')
  assert.equal(reduce(press(s0, '6'), key('tab')).state.tab, 'tickets')
  assert.equal(reduce(press(s0, '3'), key('tab')).state.tab, 'messages')

  const f = reduce(s0, key('f')).state
  assert.equal(f.filterField, 'app')
  assert.equal(reduce(f, key('right')).state.filterField, 'who')
  assert.equal(reduce(f, key('left')).state.filterField, 'mine')
  const who = reduce(press(f, 'right'), key('down')).state
  assert.equal(who.filter.who, '@asha')
  assert.equal(reduce(who, key('down')).state.filter.who, '@vidul')
  assert.equal(reduce(who, key('up')).state.filter.who, null)
  const mine = reduce(press(f, 'right', 'right'), key('down')).state
  assert.equal(mine.filter.mine, true); assert.equal(mine.filter.who, null)
  assert.deepEqual(buildModel(viewOf(mine)).rows.map(t => t.id), [])        // @vidul owns nothing
  const app = reduce(onBoard(f, parseBoard('- [ ] F1 — a [app: web]\n- [ ] F2 — b [app: cli]\n', 'T', 1, 1), team, null), key('down')).state
  assert.equal(app.filter.app, 'cli')
  assert.equal(reduce(f, key('escape')).state.filterField, null)
  assert.equal(reduce(f, key('return')).state.filterField, null)

  const t = reduce(s0, key('t')).state
  assert.equal(t.showTeam, true)
  assert.equal(reduce(t, key('escape')).state.showTeam, false)
  assert.equal(reduce(t, key('t')).state.showTeam, false)
  assert.equal(reduce(t, key('a')).state.dialog, null)

  assert.deepEqual(reduce(s0, key('r')).effects, [{ kind: 'poll', what: 'board' }, { kind: 'poll', what: 'slow' }])
  assert.equal(reduce(s0, key('q')).effects[0]?.kind, 'quit')
  assert.equal(reduce(s0, key('q')).state.quit, true)
  assert.equal(reduce(s0, key('c', { ctrl: true })).effects[0]?.kind, 'quit')
  assert.equal(reduce(reduce(s0, key('a')).state, key('c', { ctrl: true })).effects[0]?.kind, 'quit')
})

test('reduce is pure: the input state is never changed', () => {
  const before = JSON.stringify(s0)
  for (const n of ['down', 'a', 'down', 'return', 'x', 'f', 'right', 'down', 't', '2', 'R', 'q']) reduce(s0, key(n))
  assert.equal(JSON.stringify(s0), before)
})

// --- T7a: team add / remove (ticket-meta team add|remove is the only writer of team.md) ---

const type = (s: State, text: string) => [...text].reduce((x, ch) => reduce(x, { name: ch.toLowerCase(), sequence: ch }).state, s)

test('+ add person from the dialog: validation, then meta-team-add, back on the dialog with the new handle', () => {
  let { state } = reduce(s0, key('a'))                                      // F3, starts on me (@vidul)
  assert.equal(state.dialog?.handle, '@vidul')
  state = reduce(reduce(state, key('down')).state, key('down')).state          // to "+ add person", and it stays
  assert.ok(dialogLines(state).includes('  › + add person'))
  assert.ok(dialogLines(state).includes('    @vidul'))
  state = reduce(state, key('return')).state
  assert.equal(state.person?.back, 'assign'); assert.equal(state.dialog?.id, 'F3')
  state = type(state, 'Zed')
  assert.equal(state.person?.handle, 'Zed')
  let r = reduce(state, key('return'))
  assert.equal(r.effects.length, 0); assert.equal(r.state.person?.result, 'emails: at least one (a@x, b@y)')
  state = reduce(reduce(r.state, key('tab')).state, key('tab')).state       // to Emails
  assert.equal(state.personField, 'emails')
  state = type(state, 'z@x')
  assert.equal(state.person?.emails, 'z@x'); assert.equal(state.person?.result, null)
  r = reduce(state, key('return'))
  assert.equal(r.effects[0]?.kind, 'run')
  assert.deepEqual([r.effects[0]!.call, r.effects[0]!.args], ['meta-team-add', ['@zed', 'zed', 'z@x']])
  const step = settle(r.effects[0]!.then(ok('- @zed: z@x\n  name: zed\n', ['sh', 'tm', 'team', 'add']))(r.state))
  const after = step.state
  assert.equal(after.person, null); assert.equal(after.dialog?.handle, '@zed'); assert.match(after.toast ?? '', /✓ @zed added to \.skillator\/team\.md/)
  assert.match(after.toast ?? '', /\nran: sh tm team add$/)
  assert.ok(dialogLines(after).includes('  › @zed'))                         // listed before the poll re-reads the team
  assert.deepEqual(step.effects, [{ kind: 'poll', what: 'board' }])          // the team is read again
  // the re-read team has @zed: the cursor stays on it
  const reread = onBoard(after, after.board!, [...team, { handle: '@zed', emails: ['z@x'], name: 'zed' }], '@vidul')
  assert.ok(dialogLines(reread).includes('  › @zed      zed'))
  assert.deepEqual([reduce(reread, key('return')).effects[0]!.call, reduce(reread, key('return')).effects[0]!.args], ['meta-assign', ['F3', '@zed']])
})

test('add person: a refusal keeps the form open with ticket-meta\'s stderr; Esc goes back where it came from', () => {
  let state = type(press(s0, 't', 'n'), 'asha')
  state = type(press(state, 'tab', 'tab'), 'a@x')
  const r = reduce(state, key('return'))
  assert.deepEqual(r.effects[0]!.kind === 'run' && r.effects[0]!.args, ['@asha', 'asha', 'a@x'])
  const refused = settle(r.effects[0]!.then({ code: 1, out: '', err: 'ticket-meta: @asha is already in /r/.skillator/team.md\n', argv: ['sh'] })(r.state))
  assert.equal(refused.state.person?.result, 'ticket-meta: @asha is already in /r/.skillator/team.md')
  assert.equal(refused.effects.length, 0)
  const slow = settle(r.effects[0]!.then({ code: -1, out: '', err: 'timed out after 30 s', argv: ['sh'] })(r.state)).state
  assert.equal(slow.person?.result, 'ticket-meta did not finish in 30 s')
  const back = reduce(refused.state, key('escape')).state
  assert.equal(back.person, null); assert.equal(back.showTeam, true); assert.equal(back.dialog, null)
  // from the dialog, Esc returns to the dialog
  const fromDialog = press(s0, 'a', 'down', 'return')
  assert.equal(fromDialog.person?.back, 'assign')
  const d = reduce(fromDialog, key('escape')).state
  assert.equal(d.person, null); assert.equal(d.dialog?.id, 'F3')
  // the form owns the keys: q, 1, t type, never quit or switch
  const typed = type(press(s0, 't', 'n'), 'q1t')
  assert.equal(typed.person?.handle, 'q1t'); assert.equal(typed.quit, false); assert.equal(typed.tab, 'tickets')
  assert.equal(reduce(typed, key('backspace')).state.person?.handle, 'q1')
  assert.equal(reduce(typed, key('tab', { shift: true })).state.personField, 'emails')
  // A146: ctrl+c in a form with typed text cancels the form first; the board stays
  const cc = reduce(typed, key('c', { ctrl: true }))
  assert.equal(cc.state.quit, false); assert.deepEqual(cc.effects, [])
  assert.equal(cc.state.person, null); assert.equal(cc.state.showTeam, true)
  assert.equal(reduce(cc.state, key('c', { ctrl: true })).effects[0]?.kind, 'quit')   // a second one quits
  const ccDialog = reduce(type(press(s0, 'a', 'down', 'return'), 'z'), key('c', { ctrl: true }))
  assert.equal(ccDialog.state.quit, false); assert.equal(ccDialog.state.person, null); assert.equal(ccDialog.state.dialog?.id, 'F3')
  // an empty form holds nothing to lose: ctrl+c quits as anywhere else
  assert.equal(reduce(press(s0, 't', 'n'), key('c', { ctrl: true })).effects[0]?.kind, 'quit')
  // q from the Team view closes the board (its footer says so - draw.test)
  assert.equal(reduce(press(s0, 't'), key('q')).effects[0]?.kind, 'quit')
  // Name: given, it is passed as typed (trimmed)
  const named = type(press(type(press(type(press(s0, 't', 'n'), '@Ravi'), 'tab'), ' Ravi Menon '), 'tab'), 'r@x, r2@y')
  const nr = reduce(named, key('return'))
  assert.deepEqual(nr.effects[0]!.kind === 'run' && nr.effects[0]!.args, ['@ravi', 'Ravi Menon', 'r@x,r2@y'])
  assert.ok(formLines(named).includes('  Runs    ticket-meta team add @ravi "Ravi Menon" r@x,r2@y'))
})

test('team view: n opens the form (back=team); del asks, y removes, n keeps', () => {
  let { state } = reduce(s0, key('t'))
  assert.equal(reduce(state, key('n')).state.person?.back, 'team')
  assert.equal(reduce(state, key('down')).state.teamSelected, '@vidul')
  assert.equal(reduce(press(state, 'down', 'down'), key('up')).state.teamSelected, '@asha')
  state = reduce(state, key('delete')).state
  assert.equal(state.teamConfirm, '@asha')
  assert.equal(reduce(state, key('n')).state.teamConfirm, null)
  assert.equal(reduce(state, key('escape')).state.teamConfirm, null)
  assert.equal(reduce(state, key('q')).state.quit, false)                     // asking: only y / n / esc
  const r = reduce(state, key('y'))
  assert.equal(r.state.teamConfirm, null)
  assert.deepEqual([r.effects[0]!.call, r.effects[0]!.args], ['meta-team-remove', ['@asha']])
  const done = settle(r.effects[0]!.then(ok('removed: @asha\nwarning: @asha is still named on open tickets: F1, F3 - reassign them\n', ['sh', 'tm']))(r.state))
  assert.equal(done.state.toast, '✓ @asha removed from .skillator/team.md\nwarning: @asha is still named on open tickets: F1, F3 - reassign them\nran: sh tm')
  assert.deepEqual(done.effects, [{ kind: 'poll', what: 'board' }])
  const no = settle(r.effects[0]!.then({ code: 1, out: '', err: 'ticket-meta: @asha is not in x', argv: ['sh'] })(r.state)).state
  assert.match(no.toast ?? '', /^✗ ticket-meta team remove @asha refused: ticket-meta: @asha is not in x\nran: sh$/)
  // backspace (a Mac's delete key) asks too; the selected member is the one asked about
  assert.equal(reduce(press(s0, 't', 'down'), key('backspace')).state.teamConfirm, '@vidul')
  // no team: nothing to remove
  const empty = reduce(onBoard(initial(80, 24, 0), s0.board!, [], null), key('t')).state
  assert.equal(reduce(empty, key('delete')).state.teamConfirm, null)
})

// F80: l makes the selected person lead - ticket-meta team lead, the only writer; its refusal is the toast.
test('F80 team view: l makes the selected person lead through ticket-meta; a refusal is the toast', () => {
  const r = reduce(press(s0, 't', 'down'), key('l'))
  assert.deepEqual([r.effects[0]!.call, r.effects[0]!.args], ['meta-team-lead', ['@vidul']])
  const done = settle(r.effects[0]!.then(ok('lead: @vidul\n', ['sh', 'tm']))(r.state))
  assert.equal(done.state.toast, '✓ @vidul is the lead\nran: sh tm')
  assert.deepEqual(done.effects, [{ kind: 'poll', what: 'board' }])
  const no = settle(r.effects[0]!.then({ code: 1, out: '', err: 'ticket-meta: only the lead @asha may hand the lead over or clear it (you: @vidul)', argv: ['sh'] })(r.state)).state
  assert.match(no.toast ?? '', /^✗ ticket-meta team lead @vidul refused: ticket-meta: only the lead @asha may hand the lead over or clear it \(you: @vidul\)\nran: sh$/)
  assert.equal(reduce(onBoard(initial(80, 24, 0), s0.board!, [], null), key('t')).state.showTeam, true)
  assert.equal(reduce(reduce(onBoard(initial(80, 24, 0), s0.board!, [], null), key('t')).state, key('l')).effects.length, 0)
})

// F81: c - ticket-meta reconcile's proposals in a box; accept all / pick / none, each
// accepted row through its ticket-meta subcommand, a refusal in the toast, the board re-read.
const PROPOSALS = 'F1 [ ] -> [~]  2 commits name it, newest abc1234\nF3 [?] -> [?]  evidence unclear: x\nF9 [!] -> [ ]  blocked on F4, now done\n'
test('F81 c opens the reconcile box from ticket-meta reconcile; nothing to change or a refusal is a toast', () => {
  const r = reduce(s0, key('c'))
  assert.deepEqual([r.effects[0]!.call, r.effects[0]!.args], ['meta-reconcile', []])
  const s = settle(r.effects[0]!.then(ok(PROPOSALS))(r.state)).state
  assert.deepEqual(s.reconcile?.picked, [])
  assert.equal(s.reconcile?.index, 0)
  assert.deepEqual(reconcileLines(s), ['Reconcile tickets - 2 to change',
    '› [ ] F1  pending → in progress  2 commits name it, newest abc1234',
    '      F3  pending decision stays - evidence unclear: x',
    '  [ ] F9  blocked → pending  blocked on F4, now done'])
  assert.equal(settle(r.effects[0]!.then(ok('no change: nothing to reconcile\n'))(r.state)).state.toast, 'reconcile - every [!] [ ] [~] row matches its evidence')
  const no = settle(r.effects[0]!.then({ code: 1, out: '', err: 'ticket-meta: no TICKETS.md at /r', argv: ['sh'] })(r.state)).state
  assert.equal(no.toast, '✗ ticket-meta reconcile refused: ticket-meta: no TICKETS.md at /r')
  assert.equal(no.reconcile, null)
})

test('F81 reconcile: a accepts all - each row its subcommand, the toast says each, then the board is read', () => {
  const r0 = reduce(s0, key('c'))
  const s = settle(r0.effects[0]!.then(ok(PROPOSALS))(r0.state)).state
  const r = reduce(s, key('a'))
  assert.equal(r.state.reconcile, null)
  assert.deepEqual(r.effects.map(e => (e.kind === 'run' ? [e.call, e.args] : e)), [['meta-start', ['F1']], ['meta-unblock', ['F9']], { kind: 'poll', what: 'board' }])
  let x = r.state
  x = settle((r.effects[0] as { then: (y: unknown) => (z: State) => State }).then(ok('- [~] F1'))(x)).state
  x = settle((r.effects[1] as { then: (y: unknown) => (z: State) => State }).then({ code: 1, out: '', err: 'ticket-meta: F9 is [ ], not [!] - nothing to change', argv: ['sh'] })(x)).state
  assert.equal(x.toast, '✗ reconcile: 1 of 2 applied\n✓ F1 now in progress\n✗ F9 refused: ticket-meta: F9 is [ ], not [!] - nothing to change')
})

test('F81 reconcile: space picks, enter applies only the picked; a kept row is never picked; esc is none', () => {
  const r0 = reduce(s0, key('c'))
  const s = settle(r0.effects[0]!.then(ok(PROPOSALS))(r0.state)).state
  assert.deepEqual(press(s, 'down', 'space').reconcile?.picked, [])          // F3: evidence unclear
  const picked = press(s, 'down', 'down', 'space')
  assert.deepEqual(picked.reconcile?.picked, ['F9'])
  assert.deepEqual(press(picked, 'space').reconcile?.picked, [])
  const r = reduce(picked, key('return'))
  assert.deepEqual(r.effects.map(e => (e.kind === 'run' ? [e.call, e.args] : e.kind)), [['meta-unblock', ['F9']], 'poll'])
  assert.equal(reduce(s, key('return')).state.toast, 'nothing picked - space picks a row, a accepts all')
  assert.equal(reduce(s, key('return')).state.reconcile !== null, true)
  const none = reduce(s, key('escape'))
  assert.equal(none.state.reconcile, null)
  assert.deepEqual(none.effects, [])
  assert.equal(reduce(s, key('1')).state.reconcile !== null, true)          // the box holds the keys
})

test('F81 review: a proposal with no writer ([x], [>]) is never applied', () => {
  const r0 = reduce(s0, key('c'))
  const s = settle(r0.effects[0]!.then(ok('F1 [ ] -> [x]  done\nF3 [?] -> [>]  later\n'))(r0.state)).state
  assert.deepEqual(reduce(s, key('a')).effects.filter(e => e.kind === 'run'), [])
})

test('a bad handle never runs', () => {
  let { state } = reduce(reduce(s0, key('t')).state, key('n'))
  for (const ch of 'A B') state = reduce(state, { name: ch, sequence: ch }).state
  const r = reduce(reduce(reduce(state, key('tab')).state, key('tab')).state, { name: 'x', sequence: 'x' })
  const c = reduce(r.state, key('return'))
  assert.equal(c.effects.length, 0); assert.equal(c.state.person?.result, 'handle: lower-case a-z 0-9 _ - after the @')
})

test('personArgs / personError: as the mod\'s addArgs and its check', () => {
  const p = (handle: string, name: string, emails: string) => ({ handle, name, emails, result: null, back: 'team' as const })
  assert.deepEqual(personArgs(p(' @@Asha ', '', 'a@x; b@y  c@z')), ['@asha', 'asha', 'a@x,b@y,c@z'])
  assert.equal(personError(p('asha', '', 'a@x')), null)
  assert.equal(personError(p('', '', 'a@x')), 'handle: lower-case a-z 0-9 _ - after the @')
  assert.equal(personError(p('a.b', '', 'a@x')), 'handle: lower-case a-z 0-9 _ - after the @')
  assert.equal(personError(p('ab', 'x', ' , ')), 'emails: at least one (a@x, b@y)')
})

test('no team file: the dialog offers only + add person, the first add creates the file', () => {
  const s = reduce({ ...onBoard(initial(80, 24, 0), s0.board!, [], null), open: ALL, selected: 'F3' }, key('a')).state
  assert.equal(s.dialog?.handle, null)
  const ls = dialogLines(s)
  assert.ok(ls.includes('  no .skillator/team.md yet - + add person creates it'), ls.join('\n'))
  assert.ok(ls.includes('  › + add person'))
  const f = reduce(s, key('return')).state
  assert.equal(f.person?.back, 'assign')
  assert.equal(reduce(s, key('n')).state.person?.back, 'assign')         // n on + add person, too
})

// ---- F61: collapsible status groups ----

const fresh = onBoard(initial(80, 24, 0), parseBoard(BOARD, 'T', 1, 1), team, '@vidul')

test('F61: every group starts collapsed - headers only, the first one selected; counts are every ticket the filter shows', () => {
  assert.deepEqual(fresh.open, [])
  const m = buildModel(viewOf(fresh))
  assert.deepEqual(m.items, ['head:?', 'head: '])
  assert.deepEqual(m.rows, [])
  assert.equal(m.selected, 'head:?')
  assert.deepEqual(m.groups.map(g => [g.box, g.tickets.length, g.open]), [['?', 1, false], [' ', 1, false]])
  assert.equal(reduce(fresh, key('down')).state.selected, 'head: ')
  assert.equal(press(fresh, 'down', 'down').selected, 'head: ')        // the end
  assert.equal(press(fresh, 'down', 'up').selected, 'head:?')
})

test('F61: Enter on a header opens and closes it; the selection stays on the header; Enter on a row still shows its line', () => {
  const o = reduce(fresh, key('return')).state
  assert.deepEqual(o.open, ['?'])
  assert.equal(o.selected, 'head:?')
  assert.equal(o.expanded, null)
  assert.deepEqual(buildModel(viewOf(o)).items, ['head:?', 'F3', 'head: '])
  const row = press(o, 'down', 'return')
  assert.equal(row.selected, 'F3'); assert.equal(row.expanded, 'F3'); assert.deepEqual(row.open, ['?'])
  assert.deepEqual(press(o, 'return').open, [])
  // the open set is kept across tabs and board reloads (session state)
  const back = onBoard(press(o, '2', '1'), parseBoard(BOARD, 'T', 2, 2), team, '@vidul')
  assert.deepEqual(back.open, ['?'])
})

test('F61: a / d / D on a header ask for a ticket; on a row they work as before', () => {
  // F77: a / d on a header open the dialog on an empty Ticket field (was: a toast)
  for (const k of ['a', 'd']) {
    const r = reduce(fresh, key(k)).state
    assert.equal(r.toast, null); assert.equal(r.dialog?.id, ''); assert.equal(r.dialogField, 'ticket')
  }
  const D = reduce(fresh, key('D'))
  assert.equal(D.effects.length, 0); assert.ok(D.state.toast)
  const onRow = press(fresh, 'return', 'down')
  assert.equal(reduce(onRow, key('d')).state.dialog?.id, 'F3')
  assert.deepEqual(reduce(onRow, key('D')).effects.map(e => e.kind === 'run' ? e.call : e.kind), ['meta-decided'])
})

test('F61: the selected ticket in a group that closes shows as its header; reopening lands back on it', () => {
  const onF3 = press(fresh, 'return', 'down')
  const closed = { ...onF3, open: [] as Box[] }
  assert.equal(buildModel(viewOf(closed)).selected, 'head:?')
  assert.equal(closed.selected, 'F3')
  assert.equal(buildModel(viewOf({ ...closed, open: ['?'] as Box[] })).selected, 'F3')
  // from the header shown selected, down moves on from the header
  assert.equal(reduce(closed, key('down')).state.selected, 'head: ')
  // Enter on that header opens the group and lands back on the ticket
  const back = reduce(closed, key('return')).state
  assert.deepEqual(back.open, ['?']); assert.equal(buildModel(viewOf(back)).selected, 'F3')
  // a header Enter closes (the selection on it) stays on the header when opened again
  const shut = press(fresh, 'return', 'return', 'return')
  assert.equal(shut.selected, 'head:?'); assert.deepEqual(shut.open, ['?'])
})

test('F61: a filter keeps matching groups with their filtered counts; x adds Done and Cancelled collapsed', () => {
  const asha = { ...fresh, filter: { ...fresh.filter, who: '@asha' } }
  assert.deepEqual(buildModel(viewOf(asha)).groups.map(g => [g.box, g.tickets.length]), [['?', 1], [' ', 1]])
  const vidul = { ...fresh, filter: { ...fresh.filter, mine: true } }
  assert.deepEqual(buildModel(viewOf(vidul)).items, [])
  const done = reduce(fresh, key('x')).state
  assert.deepEqual(buildModel(viewOf(done)).items, ['head:?', 'head: ', 'head:x'])
})

// F77: the ticket chosen by number in the dialog - selected, unselected, unknown, changed.
const typing = (st: State, text: string) => [...text].reduce((x, ch) => reduce(x, key(ch, { sequence: ch })).state, st)
test('F77: a ticket selected - the Ticket field is prefilled, the cursor on the people; tab reaches the field', () => {
  const d = reduce(s0, key('a')).state                              // F3 selected
  assert.equal(d.dialog?.id, 'F3'); assert.equal(d.dialogField, 'who')
  assert.equal(dialogLines(d)[1], '  Ticket  F3 · [?] pending decision · Pick chart')
  const onField = reduce(d, key('tab')).state
  assert.equal(onField.dialogField, 'ticket')
  assert.equal(dialogLines(onField)[1], '  Ticket  F3_ · [?] pending decision · Pick chart')
  assert.equal(reduce(onField, key('tab')).state.dialogField, 'who')
})
test('F77: no ticket selected - the dialog opens on an empty Ticket field; f1 resolves, Enter runs on F1', () => {
  const fresh0: State = { ...s0, selected: 'head:?' }
  let d = reduce(fresh0, key('a')).state
  assert.equal(d.toast, null); assert.equal(d.dialog?.id, ''); assert.equal(d.dialogField, 'ticket')
  assert.equal(dialogLines(d)[0], 'Assign a ticket')
  assert.equal(dialogLines(d)[1], '  Ticket  _ · type a ticket ID, e.g. F12')
  assert.ok(!dialogLines(d).some(l => l.startsWith('  Change')))
  assert.equal(reduce(d, key('return')).effects.length, 0)          // Assign waits for a ticket
  d = typing(d, 'fd1')                                               // a / d / j are text in the field, not keys
  assert.equal(d.dialog?.kind, 'owner'); assert.equal(d.dialog?.id, 'fd1')
  d = reduce(reduce(d, key('backspace')).state, key('backspace')).state
  d = typing(d, '1')
  assert.equal(d.dialog?.id, 'f1')
  assert.equal(dialogLines(d)[0], 'Assign F1')
  assert.equal(dialogLines(d)[1], '  Ticket  f1_ · [ ] pending · Dark mode')
  assert.ok(dialogLines(d).includes('  Runs    ticket-meta assign F1 @vidul'))
  const r = reduce(d, key('return'))
  assert.deepEqual([r.effects[0]!.call, r.effects[0]!.args], ['meta-assign', ['F1', '@vidul']])
  assert.match(settle(r.effects[0]!.then(ok(''))(r.state)).state.toast ?? '', /^✓ F1 now pending, owned by @vidul: Dark mode/)
})
test('F77: an unknown ID says no such ticket and Enter runs nothing', () => {
  const d = typing(reduce({ ...s0, selected: 'head:?' }, key('d')).state, 'F99')
  assert.equal(dialogLines(d)[0], 'Assign a ticket for a decision')
  assert.equal(dialogLines(d)[1], '  Ticket  F99_ · no such ticket')
  assert.ok(dialogLines(d).includes('  Runs    ticket-meta decide <ID> @vidul'))
  const r = reduce(d, key('return'))
  assert.equal(r.effects.length, 0); assert.equal(r.state.dialog?.result, 'no such ticket')
})
test('F77: a changed ID moves the dialog to that ticket; Enter runs on the new one', () => {
  let d = reduce(s0, key('d')).state                                 // F3 selected
  d = reduce(d, key('tab')).state
  d = reduce(reduce(d, key('backspace')).state, key('backspace')).state
  d = typing(d, 'f1')
  assert.equal(dialogLines(d)[0], 'Assign F1 for a decision')
  assert.ok(dialogLines(d).includes('  Change  [ ] pending → [?] decision, decide @asha'))
  d = reduce(d, key('tab')).state
  const r = reduce(d, key('return'))
  assert.deepEqual([r.effects[0]!.call, r.effects[0]!.args], ['meta-decide', ['F1', '@asha']])
})

// F85: the ops app shows a run's mode, its script's phases and the next one; e engages
// it - having no session, Enter prints the exact command to paste; another live driver
// refuses. Fixture run text and script only.
test('F85: a workflow run - mode, phases, next phase; e then Enter prints /skillator:marathon-run; a live driver refuses', async () => {
  const { engageLines } = await import('../state')
  const { frameSegs } = await import('../draw')
  const SEP = '     '
  const run20 = (driver: string) => ['# Resuming .skillator/run-0020-m.md', '',
    '## Stages', '| # | stage | state | owner | heartbeat | landed |', '|---|---|---|---|---|---|',
    '| 136 | AAA8 A155 yoda | x | w | - | a |', '| 137 | AAA9 B10 muse |   | - | - | - |', '',
    '## Chain', `driver: ${driver}${SEP}hold: -${SEP}mode: workflow`,
    '### AAA8 - stage 136 - A155 yoda', 'tickets: A155', '### AAA9 - stage 137 - B10 muse', 'tickets: B10', ''].join('\n')
  const script = 'const PLAN = {\n  "phases": [\n    [ { "stage": 136, "ticket": "A155" } ],\n    [ { "stage": 137, "ticket": "B10" } ]\n  ]\n}\n'
  const list = 'RUN-0020  marathon  1/2 done\n'
  const s = onRuns(reduce(s0, key('2')).state, list, { 'RUN-0020': run20('-') }, { 'RUN-0020': script })
  assert.deepEqual(s.runs[0]!.phases, [[{ n: 136, ticket: 'A155' }], [{ n: 137, ticket: 'B10' }]])
  const open = reduce(s, key('return')).state
  const txt = frameSegs({ ...open, rows: 40 }).map(l => l.map(x => x.text).join(''))
  assert.ok(txt.some(l => /RUN-0020  marathon +workflow · 1\/2 done/.test(l)), txt.join('\n'))
  assert.ok(txt.some(l => l === '    phase 2  s137 B10  ← next'), txt.join('\n'))
  const asked = reduce(open, key('e')).state
  assert.deepEqual(engageLines(asked), ['Engage RUN-0020?', 'Paste    /skillator:marathon-run RUN-0020'])
  assert.ok(frameSegs({ ...asked, rows: 40 }).some(l => l.map(x => x.text).join('').includes('Engage RUN-0020?')))
  const go = reduce(asked, key('return'))
  assert.deepEqual(go.effects, [])                                  // nothing queued for a script run
  assert.equal(go.state.toast, 'Paste into your CLI:\n/skillator:marathon-run RUN-0020')
  assert.equal(go.state.engage, null)
  // another driver's stamp 5 minutes old: refused, naming it, no confirm
  const now = Date.parse('2026-10-18T12:00:00Z')
  const live = onRuns({ ...reduce(s0, key('2')).state, now }, list, { 'RUN-0020': run20('@cc-live 2026-10-18T11:55Z') }, { 'RUN-0020': script })
  const refused = reduce(live, key('e')).state
  assert.equal(refused.engage, null)
  assert.equal(refused.toast, '■ RUN-0020 not engaged: driven by @cc-live (heartbeat 5m ago, stale at 20m) - never two drivers')
  // a stamp not in relay's shape fails closed
  const odd = onRuns({ ...reduce(s0, key('2')).state, now }, list, { 'RUN-0020': run20('@cc-odd 2026-10-18T11:55:30Z') }, { 'RUN-0020': script })
  assert.equal(reduce(odd, key('e')).state.toast, '■ RUN-0020 not engaged: driven by @cc-odd (heartbeat unreadable: 2026-10-18T11:55:30Z) - never two drivers')
  // a stale one (45 minutes) engages
  const stale = onRuns({ ...reduce(s0, key('2')).state, now }, list, { 'RUN-0020': run20('@cc-old 2026-10-18T11:15Z') }, { 'RUN-0020': script })
  assert.equal(reduce(stale, key('e')).state.engage?.text, '/skillator:marathon-run RUN-0020')
})

test('B20: r key triggers poll effects and sets reload toast; onBoard reconciles selected/expanded', () => {
  const r = reduce(s0, key('r'))
  assert.equal(r.state.toast, '↻ TICKETS.md reloaded')
  assert.deepEqual(r.effects, [{ kind: 'poll', what: 'board' }, { kind: 'poll', what: 'slow' }])

  const b1 = parseBoard('- [ ] F1 — a\n- [ ] F2 — b\n', 'T', 0, 0)
  const st1 = onBoard({ ...s0, open: [' '], selected: 'F1' }, b1, [], null)
  assert.equal(st1.selected, 'F1')

  const b2 = parseBoard('- [ ] F3 — c\n', 'T', 0, 0)
  const st2 = onBoard({ ...st1, selected: 'F2', expanded: 'F2' }, b2, [], null)
  assert.equal(st2.selected, 'head: ')
  assert.equal(st2.expanded, null)
})

// F128: Ops board Tickets: collapsible Assigned and Decide sections
test('F128: Assigned (N) and Decide (N) sections personalized to active user', () => {
  const b = parseBoard(
    '- [ ] F1 — Dark mode [owner: @asha]\n- [?] F3 — Pick chart [decide: @asha]\n- [ ] F5 — Other task [owner: @vidul]\n',
    'T', 1, 1
  )
  const tm = [{ handle: '@asha', emails: [] }, { handle: '@vidul', emails: [] }]
  const sAsha = onBoard(initial(80, 24, 0), b, tm, '@asha')
  const mAsha = buildModel(viewOf(sAsha))
  const itemsAsha = ticketsItems(sAsha, mAsha)
  assert.equal(itemsAsha[0], 'head:assigned')
  assert.equal(itemsAsha[1], 'assigned:F1')
  assert.equal(itemsAsha[2], 'head:decide')
  assert.equal(itemsAsha[3], 'decide:F3')

  const sVidul = onBoard(initial(80, 24, 0), b, tm, '@vidul')
  const mVidul = buildModel(viewOf(sVidul))
  const itemsVidul = ticketsItems(sVidul, mVidul)
  assert.equal(itemsVidul[0], 'head:assigned')
  assert.equal(itemsVidul[1], 'assigned:F5')
  assert.equal(itemsVidul[2], 'head:decide')
  assert.equal(itemsVidul[3], 'head:?')
})

test('F128: Enter, Space, and mouse click toggle expansion/folding of Assigned and Decide', () => {
  const b = parseBoard(
    '- [ ] F1 — Dark mode [owner: @asha]\n- [?] F3 — Pick chart [decide: @asha]\n',
    'T', 1, 1
  )
  const tm = [{ handle: '@asha', emails: [] }]
  let s = onBoard(initial(80, 24, 0), b, tm, '@asha')
  s.selected = 'head:assigned'
  assert.ok(isUserSectionOpen(s.open, 'assigned'))

  // Enter toggles folding
  s = reduce(s, key('return')).state
  assert.ok(!isUserSectionOpen(s.open, 'assigned'))
  let items = ticketsItems(s, buildModel(viewOf(s)))
  assert.ok(!items.includes('assigned:F1'))

  // Space toggles it back open
  s = reduce(s, key('space')).state
  assert.ok(isUserSectionOpen(s.open, 'assigned'))
  items = ticketsItems(s, buildModel(viewOf(s)))
  assert.ok(items.includes('assigned:F1'))

  // Mouse click via point toggles decide
  s.selected = 'head:decide'
  assert.ok(isUserSectionOpen(s.open, 'decide'))
  s = point(s, { kind: 'row', area: 'tickets', id: 'head:decide' }).state
  assert.ok(!isUserSectionOpen(s.open, 'decide'))
  assert.ok(!ticketsItems(s, buildModel(viewOf(s))).includes('decide:F3'))

  // Click again unfolds decide
  s = point(s, { kind: 'row', area: 'tickets', id: 'head:decide' }).state
  assert.ok(isUserSectionOpen(s.open, 'decide'))
  assert.ok(ticketsItems(s, buildModel(viewOf(s))).includes('decide:F3'))
})

test('F128: dynamically adapts when switching users in Team view (t)', () => {
  const b = parseBoard(
    '- [ ] F1 — Dark mode [owner: @asha]\n- [?] F3 — Pick chart [decide: @vidul]\n',
    'T', 1, 1
  )
  const tm = [{ handle: '@asha', emails: [] }, { handle: '@vidul', emails: [] }]
  let s = onBoard(initial(80, 24, 0), b, tm, '@asha')
  assert.equal(activeUser(s), '@asha')
  assert.ok(ticketsItems(s, buildModel(viewOf(s))).includes('assigned:F1'))
  assert.ok(!ticketsItems(s, buildModel(viewOf(s))).includes('decide:F3'))

  // Open team view with 't'
  s = reduce(s, key('t')).state
  assert.equal(s.showTeam, true)

  // Navigate to @vidul and press Enter to select
  s = reduce(s, key('down')).state
  assert.equal(s.teamSelected, '@vidul')
  s = reduce(s, key('return')).state
  assert.equal(s.showTeam, false)
  assert.equal(activeUser(s), '@vidul')
  assert.equal(s.me, '@vidul')

  // Tickets tab now adapts to @vidul
  const items = ticketsItems(s, buildModel(viewOf(s)))
  assert.ok(!items.includes('assigned:F1'))
  assert.ok(items.includes('decide:F3'))
})

test('F122: Workflows tab action bar operations (m mode, r rerun, p push pending, click triggers)', () => {
  const chainWithPending = [
    '## Stages',
    '| # | stage | state | owner | heartbeat | landed |',
    '|---|---|---|---|---|---|',
    '| 1 | S1 F1 | x | b | - | sha1 |',
    '| 2 | S2 F2 | pending | b | - | |',
    '',
    '## Chain',
    '### S1 - stage 1 - F1 one',
    'tickets: F1',
    '### S2 - stage 2 - F2 two',
    'tickets: F2',
  ].join('\n')

  let s = onRuns(reduce(s0, key('2')).state, LIST, { 'RUN-0012': chainWithPending })
  assert.equal(s.tab, 'runs')
  assert.equal(s.runMode, 'parallel')

  // 1. m key toggles mode
  const modeStep = reduce(s, key('m'))
  assert.equal(modeStep.state.runMode, 'sequential')
  assert.match(modeStep.state.toast ?? '', /sequential/)

  const modeStep2 = reduce(modeStep.state, key('m'))
  assert.equal(modeStep2.state.runMode, 'parallel')
  assert.match(modeStep2.state.toast ?? '', /parallel/)

  // 2. r key reruns selected run
  s = { ...s, runsSelected: 'RUN-0012' }
  const rerunStep = reduce(s, key('r'))
  assert.match(rerunStep.state.toast ?? '', /Rerunning RUN-0012/)
  assert.equal(rerunStep.effects.length, 1)
  assert.equal(rerunStep.effects[0]!.kind, 'run')
  assert.equal((rerunStep.effects[0] as any).call, 'relay-queue-add')

  // 3. p key pushes pending stages
  const pushStep = reduce(s, key('p'))
  assert.match(pushStep.state.toast ?? '', /Pushing 1 pending stages of RUN-0012/)
  assert.equal(pushStep.effects.length, 1)
  assert.equal(pushStep.effects[0]!.kind, 'run')
  assert.equal((pushStep.effects[0] as any).call, 'relay-queue-add')

  // 4. Pointer clicks route through point()
  const ptMode = point(s, { kind: 'key', key: { name: 'm' } })
  assert.equal(ptMode.state.runMode, 'sequential')
})



