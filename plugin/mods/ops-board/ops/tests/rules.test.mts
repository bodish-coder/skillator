import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cells, frame, screen } from '../draw'
import { initial, onBoard, point, reduce, settle } from '../state'
import type { State } from '../state'
import { makeEngine } from '../engine'
import { parseBoard } from '../../hooks/lib/board'

const REV = '5'.repeat(64), TOKEN = '7'.repeat(64)
const BOARD = '- [ ] B1 — First [app: ops-board] [owner: @sher]\n- [ ] F2 — Second [app: web] [priority: P3]\n- [x] B3 — Closed [app: old]\n'
const LIST = `Queue Jarvis | Priority rules\n3 rule(s).\n1  P2: severity=high\n2  P1: type=bug app=ops-board,web\n3  P1: severity=critical\nRules revision: ${REV}\n`
const s0: State = onBoard(initial(80, 24, 0), parseBoard(BOARD, 'T', 1, 1), [], null)
const key = (name: string, extra = {}) => ({ name, ...extra })
const press = (s: State, ...names: string[]) => names.reduce((x, n) => reduce(x, key(n)).state, s)
const ok = (out: string) => ({ code: 0, out, err: '', argv: ['node', 'queue.mjs'] })
const no = (err: string) => ({ code: 1, out: '', err, argv: ['node', 'queue.mjs'] })
const runOf = (step: { effects: any[] }) => step.effects.find(e => e.kind === 'run' && e.call === 'queue-priority')
const loaded = (() => { const entered = reduce(s0, key('9')); return settle(runOf(entered).then(ok(LIST))(entered.state)).state })()
const P = { color: false, ascii: false, plain: true }
const text = (x: State) => frame(x, P).join('\n')

test('F203: entering Priorities loads the rules; the cursor moves over them', () => {
  const entered = reduce(s0, key('9'))
  assert.deepEqual(runOf(entered).args, ['--current-worktree', 'rules', 'list'])
  assert.match(text(entered.state), /Loading priority rules…/)
  assert.deepEqual(loaded.rules?.list.map(rule => rule.n), [1, 2, 3])
  assert.equal(loaded.rules?.revision, REV)
  // grouped by level: P1 rules (2, 3) first, then P2 (1); the cursor starts on the first shown
  const body = text(loaded)
  assert.ok(body.indexOf('type=bug app=ops-board,web') < body.indexOf('severity=critical'))
  assert.ok(body.indexOf('severity=critical') < body.indexOf('● P2'))
  assert.ok(body.indexOf('● P2') < body.indexOf('severity=high'))
  assert.match(body, /›  2  type=bug app=ops-board,web/)
  assert.match(text(press(loaded, 'down', 'down', 'down')), /›  1  severity=high/)
  assert.match(text(press(loaded, 'j', 'k', 'up')), /›  2  type=bug/)
  assert.match(body, /\[n new rule\]/); assert.match(body, /\[p apply rules\]/); assert.match(body, /\[a Auto-assign\]/)
  const empty = settle(runOf(entered).then(ok(`0 rule(s).\nRules revision: ${REV}\n`))(entered.state)).state
  assert.match(text(empty), /No priority rules yet\. Press n to add one/)
  assert.doesNotMatch(text(empty), /\[p apply rules\]/)
  const broken = settle(runOf(entered).then(no('Queue Jarvis: priority-rules.md must be a regular file.'))(entered.state)).state
  assert.match(text(broken), /must be a regular file/)
  const invalid = settle(runOf(entered).then(ok(LIST.replace('Rules revision', 'Invalid line 9: Unknown field colour. | - P2: colour=red\nRules revision')))(entered.state)).state
  assert.match(text(invalid), /Invalid line 9: Unknown field colour/)
  assert.equal(runOf(reduce(invalid, key('p'))), undefined)
  const five = [5, 6, 7, 8, 9].map(n => `Invalid line ${n}: Unknown field colour. | - P2: colour=red`).join('\n')
  const many = text(settle(runOf(entered).then(ok(LIST.replace('Rules revision', `${five}\nRules revision`)))(entered.state)).state)
  assert.match(many, /Invalid line 7:/); assert.doesNotMatch(many, /Invalid line 8:/)
  assert.match(many, /\+2 more/)
  assert.deepEqual(runOf(reduce(loaded, key('r'))).args, ['--current-worktree', 'rules', 'list'])
  assert.ok(press(loaded, 'a').autoPriority?.editing)      // Auto-assign still opens
  assert.equal(reduce(loaded, key('2')).state.tab, 'tickets')
})

test('F203: n adds, enter edits and d deletes a rule through the CLI', () => {
  const form = press(loaded, 'n')
  assert.deepEqual(form.ruleEdit, { n: null, level: 'P1', values: {}, row: 0 })
  assert.match(text(form), /New priority rule/)
  const unsaved = reduce(form, key('s'))
  assert.equal(runOf(unsaved), undefined)
  assert.equal(unsaved.state.ruleEdit?.message, 'Choose at least one condition.')
  // level 3, App row -> picker -> two values toggled, one toggled off again
  let cur = press(form, '3', 'down', 'return')
  assert.equal(cur.ruleEdit?.option, 0)
  assert.match(text(cur), /Choose App/); assert.match(text(cur), /› \[ \] ops-board/); assert.match(text(cur), /\[ \] web/)
  assert.doesNotMatch(text(cur), /\bold\b/)
  cur = press(cur, 'space', 'down', 'return', 'up', 'space', 'space')
  assert.deepEqual(cur.ruleEdit?.values.app, ['web', 'ops-board'])
  cur = press(cur, 'escape')
  assert.equal(cur.ruleEdit?.option, undefined)
  assert.match(text(cur), /App +web, ops-board/)
  const saving = reduce(cur, key('s'))
  assert.deepEqual(runOf(saving).args, ['--current-worktree', 'rules', 'add', 'P3', 'app=web,ops-board'])
  assert.equal(runOf(reduce(saving.state, key('s'))), undefined)               // busy: no second run
  const saved = settle(runOf(saving).then(ok('Queue Jarvis | Rule added\n4  P3: app=web,ops-board\nRules revision: ' + REV))(saving.state))
  assert.equal(saved.state.ruleEdit, undefined)
  assert.equal(saved.state.toast, 'Priority rule saved.')
  assert.deepEqual(runOf(saved).args, ['--current-worktree', 'rules', 'list'])
  const refused = settle(runOf(saving).then(no('Queue Jarvis: That rule already exists (rule 2).'))(saving.state)).state
  assert.match(refused.ruleEdit?.message ?? '', /already exists/)
  assert.equal(press(refused, 'escape').ruleEdit, undefined)

  // edit the selected rule (rule 2): values load; a value the board does not show stays an option
  const editing = press(loaded, 'return')
  assert.deepEqual(editing.ruleEdit, { n: 2, level: 'P1', values: { type: ['bug'], app: ['ops-board', 'web'] }, row: 0 })
  assert.match(text(editing), /Edit rule 2/)
  const edited = reduce(press(editing, '2'), key('s'))
  assert.deepEqual(runOf(edited).args, ['--current-worktree', 'rules', 'edit', '2', 'P2', 'app=ops-board,web', 'type=bug', '--rev', REV])
  assert.equal(press(editing, 'return').ruleEdit?.level, 'P2')                  // enter on the Level row cycles

  // delete asks; any key but y keeps
  const asking = press(loaded, 'd')
  assert.equal(asking.rules?.confirm, true)
  assert.match(text(asking), /Delete rule 2\?/); assert.match(text(asking), /\[y delete\]/)
  assert.equal(press(asking, 'n').rules?.confirm, undefined)
  const removing = reduce(asking, key('y'))
  assert.deepEqual(runOf(removing).args, ['--current-worktree', 'rules', 'remove', '2', '--rev', REV])
  const removed = settle(runOf(removing).then(ok('Queue Jarvis | Rule removed\nP1: type=bug app=ops-board,web\nRules revision: ' + REV))(removing.state))
  assert.equal(removed.state.toast, 'Priority rule deleted.')
  assert.deepEqual(runOf(removed).args, ['--current-worktree', 'rules', 'list'])
  const stale = settle(runOf(removing).then(no('Queue Jarvis: The rules changed. Reload them and try again.'))(removing.state))
  assert.match(stale.state.toast ?? '', /The rules changed/)
  assert.deepEqual(runOf(stale).args, ['--current-worktree', 'rules', 'list'])

  // mouse: a click selects, a click on the selected row edits
  const clicked = point(loaded, { kind: 'rule-row', index: 2 }).state
  assert.equal(clicked.rules?.sel, 2)
  assert.equal(point(clicked, { kind: 'rule-row', index: 2 }).state.ruleEdit?.n, 1)
  assert.ok(screen(loaded, P).hits.some(hit => hit.action.kind === 'rule-row'))
})

test('F203: p previews the rules and enter saves with the token', () => {
  const started = reduce(loaded, key('p'))
  assert.deepEqual(runOf(started).args, ['--current-worktree', 'rules', 'preview'])
  assert.equal(runOf(reduce(started.state, key('return'))), undefined)
  const out = `Queue Jarvis | Rules preview\n2 ticket(s) would change.\nP1: 2 · P2: 0 · P3: 0 · P4: 0 · P5: 0\nB1       Unranked -> P1   rule 2   First\nF2       P3       -> P1   rule 2   Second\nPreview token: ${TOKEN}\n`
  const ready = settle(runOf(started).then(ok(out))(started.state)).state
  assert.match(text(ready), /Apply priority rules/); assert.match(text(ready), /2 ticket\(s\) would change\./)
  assert.match(text(ready), /F2 P3 -> P1 rule 2 Second/); assert.match(text(ready), /\[enter save\]/)
  assert.equal(reduce(ready, key('down')).state.rulesPreview?.preview?.offset, 1)
  assert.equal(press(ready, 'escape').rulesPreview, undefined)
  const saving = reduce(ready, key('return'))
  assert.deepEqual(runOf(saving).args, ['--current-worktree', 'rules', 'apply', TOKEN])
  const rejected = settle(runOf(saving).then(no('Queue Jarvis: The board or rule changed. Run a new preview before applying.'))(saving.state)).state
  assert.match(rejected.rulesPreview?.message ?? '', /Run a new preview/)
  assert.equal(runOf(reduce(rejected, key('return'))), undefined)
  assert.deepEqual(runOf(reduce(rejected, key('p'))).args, ['--current-worktree', 'rules', 'preview'])
  const saved = settle(runOf(saving).then(ok('Queue Jarvis | Applied\n2 ticket(s) updated by the priority rules.'))(saving.state))
  assert.equal(saved.state.rulesPreview, undefined)
  assert.equal(saved.state.toast, '2 ticket(s) updated by the priority rules.')
  assert.deepEqual(saved.effects, [{ kind: 'poll', what: 'board' }])
  const none = settle(runOf(started).then(ok('0 ticket(s) would change.\nP1: 0 · P2: 0 · P3: 0 · P4: 0 · P5: 0\n'))(started.state)).state
  assert.match(none.rulesPreview?.message ?? '', /No ticket would change/)
  assert.equal(runOf(reduce(none, key('return'))), undefined)
})

test('F203: Priorities frames fit 40, 80 and 120 columns', () => {
  const rows = Array.from({ length: 30 }, (_, i) => `B${i + 1} Unranked -> P1 rule 2 Ticket ${i + 1}`)
  const states: State[] = [
    loaded, press(loaded, 'd'), press(loaded, 'n'), press(loaded, 'n', 'down', 'return'), press(loaded, 'return'),
    { ...loaded, rulesPreview: { message: '30 ticket(s) would change.', preview: { token: TOKEN, counts: 'P1: 30 · P2: 0 · P3: 0 · P4: 0 · P5: 0', rows, offset: 0 } } },
    { ...loaded, rules: { ...loaded.rules!, list: Array.from({ length: 40 }, (_, i) => ({ n: i + 1, level: 'P1' as const, conditions: [['app', ['a' + i]]] as [string, string[]][] })), sel: 39 } },
  ]
  for (const cols of [40, 80, 120]) for (const rowsCount of [12, 30]) for (const state of states) {
    const f = frame({ ...state, cols, rows: rowsCount }, P)
    assert.equal(f.length, rowsCount)
    for (const line of f) assert.ok(cells(line) <= cols, `${cells(line)} > ${cols}: ${line}`)
  }
  // the selected rule stays in view in a long list, and the picker/form titles survive 40 columns
  assert.match(frame({ ...states[6]!, cols: 40, rows: 30 }, P).join('\n'), /› 40  app=a39/)
  assert.match(frame({ ...states[3]!, cols: 40, rows: 30 }, P).join('\n'), /Choose App/)
})

test('F203: --once reads the rules list and nothing else from queue-priority', async () => {
  const calls: string[][] = []
  const host = {
    win: false, skillsDir: '/s', repoRoot: '/r', inboxDir: '/common/skillator',
    stat: async () => ({ mtimeMs: 1, size: 20 }),
    read: async (p: string) => (p.endsWith('TICKETS.md') ? BOARD : ''),
    run: async (call: string, args: string[]) => {
      if (call === 'queue-priority') calls.push(args)
      return { code: 0, err: '', argv: [], out: call === 'queue-priority' ? LIST : '' }
    },
    git: async () => ({ code: 0, err: '', out: '', argv: [] }),
    write: async () => undefined,
    bins: async () => ({ npm: [], sh: null, ps: null, make: null }),
    gitEmail: async () => null,
    spawn: () => ({ stop() {} }),
  }
  const e = makeEngine({ host: host as any, state: { ...initial(80, 24, 0), tab: 'priorities' }, email: null, once: true, onChange: () => {}, onQuit: () => {} })
  try {
    await e.readAll()
    assert.deepEqual(calls, [['--current-worktree', 'rules', 'list']])
    assert.match(frame(e.state, P).join('\n'), /type=bug app=ops-board,web/)
  } finally { e.stop() }
})

test('F203: a failed save reads the rules again; the form stays only while its rule is still at n', () => {
  const REV2 = '6'.repeat(64)
  const saving = reduce(press(loaded, 'return', '3'), key('s'))                 // edit rule 2 -> P3
  const failed = settle(runOf(saving).then(no('Queue Jarvis: The rules changed. Reload them and try again.'))(saving.state))
  assert.match(failed.state.ruleEdit?.message ?? '', /The rules changed/)
  const reload = runOf(failed)
  assert.deepEqual(reload?.args, ['--current-worktree', 'rules', 'list'])
  // the same rule still at 2: the form stays, its next save carries the fresh revision
  const same = settle(reload.then(ok(LIST.replace(REV, REV2)))(failed.state)).state
  assert.equal(same.rules?.revision, REV2)
  assert.equal(same.ruleEdit?.n, 2)
  assert.equal(same.ruleEdit?.level, 'P3')
  assert.deepEqual(runOf(reduce(same, key('s'))).args, ['--current-worktree', 'rules', 'edit', '2', 'P3', 'app=ops-board,web', 'type=bug', '--rev', REV2])
  // another rule now at 2: the form closes, nothing is saved over it
  const moved = `2 rule(s).\n1  P1: type=bug app=ops-board,web\n2  P5: app=old\nRules revision: ${REV2}\n`
  const gone = settle(reload.then(ok(moved))(failed.state)).state
  assert.equal(gone.ruleEdit, undefined)
  assert.match(gone.toast ?? '', /The rules changed/)
  assert.equal(gone.rules?.revision, REV2)
})

test('F203: while the delete question is up, r and a keep the rule and do nothing else', () => {
  const asking = press(loaded, 'd')
  for (const name of ['r', 'a']) {
    const step = reduce(asking, key(name))
    assert.equal(step.state.rules?.confirm, undefined, name)
    assert.deepEqual(step.effects, [], name)
    assert.equal(step.state.autoPriority, undefined, name)
    assert.equal(step.state.toast, asking.toast, name)
    assert.equal(step.state.rules?.loading, undefined, name)
  }
})

test('F203: after a save the cursor lands on the saved rule; after a delete it stays clamped', () => {
  // add P3 app=web: re-read list shows it last (P1 2, P1 3, P2 1, P3 4)
  const adding = reduce(press(loaded, 'n', '3', 'down', 'return', 'down', 'space', 'escape'), key('s'))
  assert.deepEqual(runOf(adding).args, ['--current-worktree', 'rules', 'add', 'P3', 'app=web'])
  const added = settle(runOf(adding).then(ok('Queue Jarvis | Rule added\nRules revision: ' + REV))(adding.state))
  const LIST4 = LIST.replace('3 rule(s).', '4 rule(s).').replace('Rules revision', '4  P3: app=web\nRules revision')
  const afterAdd = settle(runOf(added).then(ok(LIST4))(added.state)).state
  assert.equal(afterAdd.rules?.sel, 3)
  assert.match(text(afterAdd), /›  4  app=web/)
  // edit rule 1 (P2 severity=high, shown third) to P1: it moves to the top group, after 2 and 3
  const editing = reduce(press(loaded, 'down', 'down', 'return', '1'), key('s'))
  assert.deepEqual(runOf(editing).args, ['--current-worktree', 'rules', 'edit', '1', 'P1', 'severity=high', '--rev', REV])
  const edited = settle(runOf(editing).then(ok('Queue Jarvis | Rule saved\nRules revision: ' + REV))(editing.state))
  const afterEdit = settle(runOf(edited).then(ok(LIST.replace('1  P2: severity=high', '1  P1: severity=high')))(edited.state)).state
  assert.equal(afterEdit.rules?.sel, 0)
  assert.match(text(afterEdit), /›  1  severity=high/)
  // delete the last shown rule: the cursor is clamped to the new last row
  const deleting = reduce(press(loaded, 'down', 'down', 'd'), key('y'))
  const deleted = settle(runOf(deleting).then(ok('Queue Jarvis | Rule removed\nRules revision: ' + REV))(deleting.state))
  const afterDelete = settle(runOf(deleted).then(ok(`Queue Jarvis | Priority rules\n2 rule(s).\n1  P1: type=bug app=ops-board,web\n2  P1: severity=critical\nRules revision: ${REV}\n`))(deleted.state)).state
  assert.equal(afterDelete.rules?.sel, 1)
})

// A253: the box rows joined, so a wrapped line reads as one
const flat = (x: State) => text(x).split('\n').map(l => l.replace(/^\s*│/, '').replace(/│\s*$/, '').trim()).join(' ')

test('A253: the rule form reads as a sentence with a live count of the tickets it matches', () => {
  const blank = press(loaded, 'n')
  assert.match(flat(blank), /Reads as: P1 - choose at least one field/)
  assert.doesNotMatch(flat(blank), /Matches/)
  const two: State = { ...loaded, ruleEdit: { n: null, level: 'P2', values: { app: ['ops-board', 'web'] }, row: 0 } }
  assert.match(flat(two), /Reads as: P2 when app is ops-board or web/)
  assert.match(flat(two), /Matches 2 tickets now: B1 · F2/)
  const one: State = { ...two, ruleEdit: { ...two.ruleEdit!, values: { app: ['ops-board', 'web', 'old'], type: ['bug'] } } }
  assert.match(flat(one), /Reads as: P2 when app is ops-board, web or old and ticket type is bug/)
  assert.match(flat(one), /Matches 1 ticket now: B1/)                 // B3 is closed
  const closed: State = { ...two, ruleEdit: { ...two.ruleEdit!, values: { status: ['done'] } } }
  assert.match(flat(closed), /Matches 1 ticket now: B3/)              // a status condition reaches closed tickets
  const none: State = { ...two, ruleEdit: { ...two.ruleEdit!, values: { app: ['nowhere'] } } }
  assert.match(flat(none), /Matches no ticket now/)
})

test('A253: the preview warns when a hand-set priority would go down', () => {
  const started = reduce(loaded, key('p'))
  const out = `2 ticket(s) would change.\nP1: 1 · P2: 0 · P3: 0 · P4: 1 · P5: 0\nB1       Unranked -> P1   rule 2   First\nF2       P3       -> P4   rule 4   Second\n`
    + `Warning: 1 ticket goes down from a priority set by hand: F2 P3 -> P4 (rule 4).\nPreview token: ${TOKEN}\n`
  const ready = settle(runOf(started).then(ok(out))(started.state)).state
  assert.match(flat(ready), /Warning: 1 ticket goes down from a priority set by hand: F2 P3 -> P4 \(rule 4\)\./)
  assert.match(flat(ready), /\[enter save\]/)
})

test('A253: an expanded Tickets row shows rule:N only when its priority carries the rule marker', () => {
  const board = parseBoard('- [ ] B1 — Ruled [app: web] [priority: P1] [priority-rule: 3]\n- [ ] B2 — By hand [app: web] [priority: P2]\n- [ ] B3 — Marker alone [priority-rule: 4]\n', 'T', 1, 1)
  assert.deepEqual(board.tickets.map(t => t.rule), [3, undefined, undefined])
  assert.equal(board.tickets[0]!.title, 'Ruled')
  assert.equal(board.tickets[2]!.title, 'Marker alone')
  const st = { ...onBoard(initial(80, 24, 0), board, [], null), open: [' '] as State['open'] }
  assert.match(text(reduce({ ...st, selected: 'B1' }, key('return')).state), /app:web +rule:3/)
  assert.doesNotMatch(text(reduce({ ...st, selected: 'B2' }, key('return')).state), /rule:/)
})
