import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initial, reduce, onBoard, onMachine, onUsage, onRuns, dialogLines, formLines, personArgs, personError, viewOf, startHandle, settle, afterRun } from '../state'
import type { State } from '../state'
import { parseBoard } from '../../hooks/lib/board'
import { buildModel } from '../../hooks/lib/ticketsmodel'
import { continuePrompt } from '../../hooks/lib/runlines'

// The board's groups run IN PROGRESS, BLOCKED, PENDING DECISION, PENDING (buildModel):
// F3 [?] is drawn before F1 [ ], so the first row - the selection in force - is F3.
const BOARD = '- [ ] F1 — Dark mode [owner: @asha]\n- [?] F3 — Pick chart [decide: @asha]\n- [x] F4 — Done one\n'
const team = [{ handle: '@asha', emails: ['a@x'], name: 'Asha' }, { handle: '@vidul', emails: ['v@x'] }]
const s0 = onBoard(initial(80, 24, 0), parseBoard(BOARD, 'T', 1, 1), team, '@vidul')
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

test('down/up (and j/k) move the selection over visible rows, stopping at the ends; x shows done', () => {
  let { state } = reduce(s0, key('down'))
  assert.equal(state.selected, 'F1')
  assert.equal(reduce(state, key('down')).state.selected, 'F1')
  ;({ state } = reduce(state, key('up')))
  assert.equal(state.selected, 'F3')
  assert.equal(reduce(state, key('j')).state.selected, 'F1')
  assert.equal(reduce(press(state, 'j'), key('k')).state.selected, 'F3')
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
  const { state } = reduce(press(s0, 'down'), key('a'))
  assert.equal(state.dialog?.id, 'F1'); assert.equal(state.dialog?.handle, '@asha'); assert.equal(state.dialog?.kind, 'owner')
  assert.deepEqual(dialogLines(state), [
    'Assign F1',
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
  assert.equal(dialogLines(state)[1], '  ( ) implementation   (•) decision          a / d')
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
  const notDecidable = reduce(press(s0, 'down'), key('D'))           // F1 is [ ]
  assert.equal(notDecidable.effects.length, 0); assert.ok(notDecidable.state.toast)
})

test('a dialog on a ticket in progress warns; an empty team starts on no one and Enter runs nothing', () => {
  const b = parseBoard('- [~] F9 — Busy (@cc-1)\n', 'T', 1, 1)
  const s = reduce(onBoard(initial(80, 24, 0), b, [], null), key('a')).state
  assert.equal(s.dialog?.handle, null)
  assert.ok(dialogLines(s).some(l => l.includes('F9 is in progress under @cc-1')))
  // A143: ticket-meta keeps the session tag beside the owner; the warning must not say it drops
  assert.ok(dialogLines(s).some(l => l.includes('the tag stays - tell that session')))
  assert.ok(!dialogLines(s).some(l => l.includes('drops that tag')))
  assert.ok(dialogLines(s).some(l => l.includes('no .skillator/team.md yet')))
  assert.equal(reduce(s, key('return')).effects.length, 0)
  assert.equal(reduce(initial(80, 24, 0), key('a')).state.toast, 'ops board: select a ticket first')
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

test('runs: onRuns sets the runs and the relay text; up/down move; Enter expands; s queues a planned run', () => {
  const s = onRuns(reduce(s0, key('2')).state, LIST, { 'RUN-0012': CHAIN })
  assert.equal(s.runs.length, 2); assert.equal(s.relay, 'RUN-0012 0/2'); assert.equal(s.runsSelected, 'RUN-0012')
  assert.equal(reduce(s, key('down')).state.runsSelected, 'RUN-0013')
  assert.equal(reduce(press(s, 'down'), key('up')).state.runsSelected, 'RUN-0012')
  assert.equal(reduce(s, key('return')).state.runsExpanded, 'RUN-0012')
  const r = reduce(s, key('s'))
  assert.deepEqual([r.effects[0]!.call, r.effects[0]!.args], ['relay-queue-add', ['RUN-0012']])
  const q = settle(r.effects[0]!.then(ok('queued RUN-0012'))(r.state))
  assert.ok(q.state.toast?.startsWith('✓ RUN-0012 queued - queued RUN-0012.'))
  assert.ok(q.state.toast?.includes(continuePrompt('RUN-0012')))
  assert.deepEqual(q.effects, [{ kind: 'poll', what: 'runs' }])
  assert.match(settle(r.effects[0]!.then({ code: 1, out: '', err: 'busy', argv: ['sh'] })(r.state)).state.toast ?? '', /^■ RUN-0012 not queued: busy/)
  const notPlanned = reduce(press(s, 'down'), key('s'))
  assert.equal(notPlanned.effects.length, 0); assert.ok(notPlanned.state.toast)
})

test('tabs, filter mode, team view, refresh, quit', () => {
  assert.equal(reduce(s0, key('2')).state.tab, 'runs')
  assert.deepEqual(reduce(s0, key('2')).effects, [{ kind: 'poll', what: 'runs' }])
  assert.equal(reduce(s0, key('3')).state.tab, 'health')
  assert.equal(reduce(press(s0, '3'), key('1')).state.tab, 'tickets')
  assert.equal(reduce(s0, key('tab')).state.tab, 'runs')
  assert.equal(reduce(s0, key('tab', { shift: true })).state.tab, 'health')
  assert.equal(reduce(press(s0, '3'), key('tab')).state.tab, 'tickets')

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
  assert.equal(reduce(typed, key('c', { ctrl: true })).effects[0]?.kind, 'quit')
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
  const s = reduce(onBoard(initial(80, 24, 0), s0.board!, [], null), key('a')).state
  assert.equal(s.dialog?.handle, null)
  const ls = dialogLines(s)
  assert.ok(ls.includes('  no .skillator/team.md yet - + add person creates it'), ls.join('\n'))
  assert.ok(ls.includes('  › + add person'))
  const f = reduce(s, key('return')).state
  assert.equal(f.person?.back, 'assign')
  assert.equal(reduce(s, key('n')).state.person?.back, 'assign')         // n on + add person, too
})
