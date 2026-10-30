import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ansi, frame, frameSegs, fit, cells, glyph, plain, paintScreen } from '../draw'
import { initial, onBoard, onMachine, onRuns, onUsage, reduce } from '../state'
import type { State } from '../state'
import type { Box } from '../../types'
import { parseBoard } from '../../hooks/lib/board'
import { headKey } from '../../hooks/lib/ticketsmodel'
import { BOARD } from '../../tests/fixtures'
// The block's excerpt, with the layout the owner approved in the mock (controller ruling
// 2026-10-20: where the mock and the excerpt differ on what the user sees, the mock wins).
// F61: groups start collapsed; the row tests run with every group open, the first row selected.
const ALL: Box[] = ['~', '%', '!', '?', ' ', '>', 'x', '-']
const fresh = onBoard(initial(80, 24, 0), parseBoard(BOARD, 'T', 1, 1), [{ handle: '@asha', emails: [] }], null)
const s: State = { ...fresh, open: ALL, selected: 'B2' }
const opened = (x: State): State => ({ ...x, open: ALL })
const P = { color: false, ascii: false, plain: true }
const text = (x: State) => frame(x, P).join('\n')
const sized = (x: State) => {
  const f = frame(x, P)
  assert.equal(f.length, x.rows)
  for (const l of f) { assert.ok(cells(l) <= x.cols, `${cells(l)} > ${x.cols}: ${l}`); assert.doesNotMatch(l, /\x1b/) }
  return f
}
const RED_HELD = 'DRIVE=C:\nDISK_FREE=90000000000\nDISK_TOTAL=1\nMEM_FREE=500000000\nHOLD=2026-10-20T03:29Z mem 0.5 GB\n'

test('a frame is rows × ≤cols, tab bar first, band last, no escapes without colour', () => {
  const f = sized(s)
  assert.equal(f.length, 24)
  assert.match(f[0]!, /^ 1 Tickets   2 Workflows   3 Health   4 Messages   5 Explorer   6 Build +ops$/)
  // F75 + F79: with six tabs "ops · <repo>" fits from 87 columns; at 80 spread() drops it, as at any narrow width
  assert.match(sized({ ...s, repo: 'skillator2' })[0]!, /^ 1 Tickets   2 Workflows   3 Health   4 Messages   5 Explorer   6 Build$/)
  assert.match(sized({ ...s, repo: 'skillator2', cols: 100 })[0]!, /^ 1 Tickets   2 Workflows   3 Health   4 Messages   5 Explorer   6 Build +ops · skillator2$/)
  assert.match(f[23]!, /^● ops · mem \? · disk \? · 5h \? · 7d \?$/)       // one band line at 80 columns
  assert.match(text(s), /  ▾ In progress \(1\)\n› ● B2  CSV export drops the last row/)
})
test('colour on: dot carries the state colour, selected row highlighted', () => {
  const f = frame(s, { color: true, ascii: false })
  assert.match(f.find(l => l.includes('B2  CSV'))!, /› \x1b\[33m●\x1b\[0m\x1b\[1;97;44m/)
  for (const l of f) assert.ok(cells(l.replace(/\x1b\[[0-9;]*m/g, '')) <= 80, l)
})
test('ascii swaps the glyphs; fit cuts with an ellipsis; a long title never wraps', () => {
  assert.equal(glyph('● ▲ ■ █ ░ … ▾', true), '* ^ # = - ... v')
  assert.equal(glyph('┌─│└┘┐', true), '+-|+++')
  assert.equal(glyph('● ▾', false), '● ▾')
  assert.equal(fit('abcdef', 4), 'abc…')
  assert.equal(fit('abcd', 4), 'abcd')
  const long = onBoard(initial(80, 24, 0), parseBoard('- [ ] F1 — ' + 'x'.repeat(200) + '\n', 'T', 1, 1), [], null)
  sized(long)
  for (const x of [long, reduce(s, { name: 'a' }).state, reduce(s, { name: '3' }).state]) {
    const a = frame(x, { color: false, ascii: true, plain: true })
    assert.equal(a.length, 24)
    for (const l of a) { assert.ok(cells(l) <= 80, l); assert.doesNotMatch(l, /[^\x20-\x7e]/, l) }
  }
})
test('runs and health tabs as the mock; the assign box overlays the body', () => {
  const h = text(reduce(s, { name: '3' }).state)
  assert.match(h, /Usage +from watch-cortana usage-watch level\n  5-hour        not observable here\n  7-day         not observable here\n  Relay         no decision without a reading\n  Credit        not available/)
  assert.match(h, /Machine\n  machine facts not read yet/)
  assert.match(text(reduce(s, { name: '2' }).state), /reading runs…/)
  assert.match(text(reduce(onRuns(s, '', {}), { name: '2' }).state), /no open runs - plan one with relay-morpheus \(plan-runs\)/)
  const d = text(reduce(s, { name: 'a' }).state)
  assert.match(d, /  ┌─ Assign B2 ─+┐\n  │  Ticket  B2 · \[~\] in progress · CSV export drops the last row +│\n  │  \(•\) implementation   \( \) decision          a \/ d +│\n  │ +│/)
  assert.match(d, /  │  › @asha +│/)
  assert.match(d, /  │  Change  \[~\] in progress → \[ \] pending, owner @asha +│/)
  assert.match(d, /  └─+┘/)
  const red = onMachine(s, 'DRIVE=C:\nDISK_FREE=1\nDISK_TOTAL=1\nMEM_FREE=1\nHOLD=-\n', 0).state
  assert.match(frame(red, P).at(-1)!, /^■ HOLD /)
})
test('the band: one line from 80 columns, the hold first, R resume at the right; two lines below 80', () => {
  const held = onUsage(onMachine(s, RED_HELD, 0).state, 'src=codex 5h=41 7d=55 ctx=- max=-\n', 0).state
  const b = frame(held, P).at(-1)!
  assert.match(b, /^■ HOLD mem 0\.5 GB at 03:29Z · mem 0\.5 GB · C: 84 GB · 5h 41% · 7d 55% +R resume$/)
  assert.ok(cells(b) <= 80)
  assert.match(frame({ ...held, cols: 120 }, P).at(-1)!, /C: 84 GB free · 5h/)
  const c = frame(held, { color: true, ascii: false }).at(-1)!
  assert.match(c, /\x1b\[31m■ HOLD/)
  assert.match(c, /mem \x1b\[31m0\.5 GB\x1b\[0m/)
  assert.match(c, /\x1b\[2mR resume\x1b\[0m$/)
  assert.doesNotMatch(frame({ ...s, cols: 120 }, P).at(-2)!, /ops ·/)
  const narrow = sized({ ...held, cols: 60 })
  assert.match(narrow.at(-2)!, /^■ HOLD/)
  assert.match(narrow.at(-1)!, /5h 41% · 7d 55% +R resume$/)
})
test('no Claude Code-only words in any frame', () => {
  const held = onMachine(s, RED_HELD, 0).state
  for (const x of [s, held, reduce(s, { name: '2' }).state, reduce(s, { name: '3' }).state, reduce(held, { name: '3' }).state,
    reduce(s, { name: 'a' }).state, reduce(s, { name: 't' }).state, { ...held, cols: 60 }]) {
    assert.doesNotMatch(text(x), /\/ops|\/pending|\/list-tickets|\/skillator:/)
  }
})

test('ansi: SGR per seg from the theme names, reset after each; none without colour', () => {
  const segs = [{ text: 'a', color: 'warning' }, { text: 'b' }, { text: 'c', color: 'error', bold: true, inverse: true },
    { text: 'd', dim: true }, { text: 'e', color: 'inactive' }, { text: 'f', color: 'text' }, { text: 'g', color: 'permission' },
    { text: 'h', color: 'success' }, { text: 'i', color: 'suggestion' }]
  assert.equal(ansi(segs, { color: true, ascii: false }),
    '\x1b[33ma\x1b[0mb\x1b[1;97;44mc\x1b[0m\x1b[2md\x1b[0m\x1b[2me\x1b[0mf\x1b[35mg\x1b[0m\x1b[32mh\x1b[0m\x1b[36mi\x1b[0m')
  assert.equal(ansi(segs, P), 'abcdefghi')
  assert.equal(plain(segs), 'abcdefghi')
  assert.equal(ansi([{ text: '●' }], { color: false, ascii: true, plain: true }), '*')
})
// F89: a highlight is an explicit background + bold with colour; NO_COLOR / --no-color drops
// the colours only - bold, dim and inverse stay, and so does the › marker
test('highlights: background + bold with colour; inverse and bold kept under --no-color', () => {
  const segs = [{ text: 'a', color: 'warning', bold: true }, { text: 'b', inverse: true }, { text: 'c', color: 'error', inverse: true, bold: true }, { text: 'd', dim: true }]
  assert.equal(ansi(segs, { color: false, ascii: false }), '\x1b[1ma\x1b[0m\x1b[7mb\x1b[0m\x1b[1;7mc\x1b[0m\x1b[2md\x1b[0m')
  assert.equal(ansi(segs, { color: true, ascii: false }), '\x1b[33;1ma\x1b[0m\x1b[1;97;44mb\x1b[0m\x1b[1;97;44mc\x1b[0m\x1b[2md\x1b[0m')
  const no = { color: false, ascii: false }
  const f = frame(s, no)
  assert.match(f.find(l => l.includes('B2  CSV'))!, /^› ●\x1b\[7m B2  CSV/)                     // selected row
  assert.match(f[0]!, /^ \x1b\[1;7m1 Tickets\x1b\[0m/)                                        // active tab
  assert.match(frame({ ...s, selected: headKey('~') }, no).join('\n'), /› \x1b\[1;7m▾ In progress \(1\)/)  // selected header
  assert.match(frame({ ...s, filterField: 'app' }, no).join('\n'), /app: \x1b\[7mall\x1b\[0m/)   // focused field
  for (const l of f) assert.doesNotMatch(l, /\x1b\[(?:[0-9;]*;)?(?:3\d|4\d|9\d)[;m]/)          // no colour code
  const c = frame(s, { color: true, ascii: false })
  assert.match(c[0]!, /^ \x1b\[1;97;44m1 Tickets\x1b\[0m/)
})
test('paintScreen: home, every line cleared to its end', () => {
  assert.equal(paintScreen(['a', 'b']), '\x1b[Ha\x1b[K\r\nb\x1b[K')
})
test('frameSegs is exactly rows lines at any size; tiny terminals still draw', () => {
  const held = onMachine(s, RED_HELD, 0).state
  for (const [cols, rows] of [[80, 24], [40, 12], [20, 5], [200, 60], [80, 3], [10, 1], [3, 2]] as const) {
    assert.equal(frameSegs({ ...s, cols, rows }).length, rows)
    for (const x of [s, held]) {
      sized({ ...x, cols, rows })
      sized(reduce({ ...x, cols, rows }, { name: 'a' }).state)
      sized(reduce({ ...x, cols, rows }, { name: '2' }).state)
      sized(reduce({ ...x, cols, rows }, { name: '3' }).state)
    }
  }
})
// F81: the reconcile box in place of the Tickets view, its keys on the keys line.
test('F81 the reconcile box draws its proposals and its keys', () => {
  const x: State = { ...s, reconcile: { rows: [{ id: 'F1', from: ' ', to: '~', why: '2 commits name it' }, { id: 'F3', from: '!', to: '!', why: 'evidence unclear: x' }], picked: ['F1'], index: 1 } }
  const t = text(x)
  assert.match(t, /┌─ Reconcile tickets - 1 to change ─/)
  assert.match(t, /│ {2}\[x\] F1 {2}pending → in progress {2}2 commits name it/)
  assert.match(t, /│› {5}F3 {2}blocked stays - evidence unclear: x/)
  assert.ok(frame(x, P).includes('↑↓ move · space pick · enter apply picked · a accept all · esc none'))
})
test('the keys line as the mock; D decided only on a decidable row', () => {
  const keys = (x: State) => frame({ ...x, cols: 100 }, P).find(l => l.includes('a assign'))!   // F81: room for c reconcile
  assert.equal(keys(s), '↑↓ move · enter line · a assign · d decide · t team · c reconcile · r reload · q quit')
  const f3: State = { ...s, selected: 'F3' }
  assert.match(keys(f3), /D decided/)
  assert.match(keys(f3), /q quit$/)
  // A144: one separator throughout - " · " stays when "D decided" joins the row.
  for (const cols of [80, 60, 40]) {
    for (const x of [{ ...s, cols }, { ...f3, cols }, reduce({ ...s, cols }, { name: '3' }).state]) {
      const f = frame(x, P)
      const line = f.find(l => /r reload/.test(l))
      assert.ok(line, `${cols}: no keys line ending q quit\n${f.join('\n')}`)
      assert.ok(cells(line) <= cols, `${cells(line)} > ${cols}: ${line}`)
      assert.doesNotMatch(line, /\S {2}\S/, line)
      assert.match(line, /q quit$/, line)
    }
  }
  assert.match(keys(f3), / · D decided · /)
  // F76: no run yet, the cursor is on the Runs header (Enter closes it); on a run, Enter shows its stages
  assert.match(text(reduce(s, { name: '2' }).state), /↑↓ move · enter close · e engage/)
  assert.match(text(reduce(onRuns(s, 'RUN-0012  board sweep  2/4 done\n', {}), { name: '2' }).state), /↑↓ move · enter stages · e engage/)
  assert.match(text(reduce(s, { name: '3' }).state), /R resume \(on a fresh non-red reading\) · F force resume · r reload · q quit/)
})
test('the selection scrolls into view in a short terminal; a cut list says so', () => {
  let x: State = { ...s, rows: 13 }
  assert.match(text(x), /\n  …\n/)
  for (let i = 0; i < 9; i++) x = reduce(x, { name: 'down' }).state     // headers are stops too (F61)
  assert.equal(x.selected, 'A1')
  assert.ok(sized(x).some(l => l.startsWith('› ● A1 ')), text(x))
})
test('filter row, tags, expanded chips and raw line, count line, done shown', () => {
  const f = text(s)
  assert.match(f, /^filter  app: all · who: all · mine: off +f filter · x show done$/m)
  assert.match(f, /^  ● F3  Pick the chart library +decide @asha$/m)
  assert.match(f, /^7 open \(4 pending · 1 in progress · 1 blocked · 1 decision\) · 1 deferred$/m)
  assert.match(f, /  ▾ Pending decision \(1\)\n/)
  const ex = text(reduce({ ...s, selected: 'F3' }, { name: 'return' }).state)
  assert.match(ex, /      decide:@asha   D decided\n      - \[\?\] F3 — Pick the chart library \[decide: @asha\]/)
  const done = text(reduce(s, { name: 'x' }).state)
  assert.match(done, /  ▾ Done \(8\)/)
  assert.match(done, /^7 open \(4 pending · 1 in progress · 1 blocked · 1 decision\) · 1 deferred$/m)
  assert.match(text({ ...reduce(s, { name: 'x' }).state, cols: 100 }), /· 1 deferred · 9 closed$/m)
  const fm = reduce(s, { name: 'f' }).state
  assert.match(text(fm), /←→ field/)
  assert.match(frame(fm, { color: true, ascii: false }).find(l => l.startsWith('\x1b[2mfilter'))!, /\x1b\[1;97;44mall\x1b\[0m/)
})
// F62: [%] testing - its own group between In progress and Blocked, cyan, named in the count line.
test('[%] testing: group after in progress, cyan dot, counted open', () => {
  const t = opened(onBoard(initial(80, 24, 0), parseBoard('- [!] B1 — stuck\n- [%] F7 — built thing (testing: owner live check)\n- [~] F8 — working\n', 'T', 1, 1), [], null))
  const f = text(t)
  assert.match(f, /▾ In progress \(1\)\n[› ] ● F8 +working[^\n]*\n\n?  ▾ Testing \(1\)\n[› ] ● F7 +built thing[^\n]*\n\n?  ▾ Blocked \(1\)/)
  assert.match(f, /^3 open \(0 pending · 1 in progress · 1 testing · 1 blocked · 0 decision\)$/m)
  assert.match(frame(t, { color: true, ascii: false }).find(l => l.includes('F7  built'))!, /\x1b\[36m●/)
  assert.doesNotMatch(text(s), /testing/)          // none under test: the count line stays as it was
})
test('toast and the dialog result show; control characters never reach the terminal', () => {
  const t = sized({ ...s, toast: '✓ B2 now pending\nran: sh x' })
  assert.ok(t.some(l => l === '✓ B2 now pending'))
  assert.ok(t.some(l => l === 'ran: sh x'))
  const d = reduce(s, { name: 'a' }).state
  const refused = { ...d, dialog: { ...d.dialog!, result: 'not on the team' } }
  assert.match(frame(refused, { color: true, ascii: false }).find(l => l.includes('not on the team'))!, /\x1b\[31m  not on the team/)
  const evil = opened(onBoard(initial(80, 24, 0), parseBoard('- [ ] F1 — bad \x1b[2J\x07title\n', 'T', 1, 1), [], null))
  for (const l of frame(evil, P)) assert.doesNotMatch(l, /[\x00-\x08\x0b-\x1f\x7f]/)
})
test('no board yet; team view; runs as the mock with stages on Enter', () => {
  assert.match(text(initial(80, 24, 0)), /reading TICKETS\.md/)
  const tv = reduce({ ...s, team: [{ handle: '@asha', emails: ['a@x'], name: 'Asha Rao' }] }, { name: 't' }).state
  assert.match(text(tv), /@asha\s+Asha Rao\s+a@x/)
  const list = 'RUN-0012  board sweep  2/4 done  (stage 3 open)\nRUN-0011  older run  3/3 done\n'
  const r = reduce(onRuns(s, list, {}), { name: '2' }).state
  assert.equal(r.runs.length, 2)
  const f = sized(r)
  assert.ok(f.some(l => /^› ● RUN-0012  board sweep +agents · 2\/4 done$/.test(l)), f.join('\n'))
  assert.ok(f.some(l => /^  ● RUN-0011  older run +agents · 3\/3 done$/.test(l)), f.join('\n'))
  assert.match(text(reduce(r, { name: 'return' }).state), /  RUN-0012 stages\n/)
})
// F76: the Runs tab draws a Runs section and a Workflows section, headers with counts
// that open and close; the Workflow tool is not observable outside the host that runs it.
test('F76: Runs and Workflows sections draw as headers; closed, their rows go', () => {
  const list = 'RUN-0012  board sweep  2/4 done  (stage 3 open)\nRUN-0011  older run  3/3 done\n'
  const r = reduce(onRuns(s, list, {}), { name: '2' }).state
  const f = sized(r)
  assert.ok(f.some(l => /^  ▾ Runs \(2\)$/.test(l)), f.join('\n'))
  assert.ok(f.some(l => /^  ▾ Workflows$/.test(l)), f.join('\n'))
  assert.ok(f.some(l => /^    not observable here - only the host that runs a workflow sees it$/.test(l)), f.join('\n'))
  const up = reduce(r, { name: 'up' }).state
  assert.ok(sized(up).some(l => /^› ▾ Runs \(2\)$/.test(l)))
  assert.match(text(up), /enter close/)
  const shut = sized(reduce(up, { name: 'return' }).state)
  assert.ok(shut.some(l => /^› ▸ Runs \(2\)$/.test(l)), shut.join('\n'))
  assert.ok(!shut.some(l => /RUN-0012/.test(l)), shut.join('\n'))
  const down2 = reduce(reduce(r, { name: 'down' }).state, { name: 'down' }).state
  assert.ok(sized(down2).some(l => /^› ▾ Workflows$/.test(l)), sized(down2).join('\n'))
  const wfShut = sized(reduce(down2, { name: 'return' }).state)
  assert.ok(wfShut.some(l => /^› ▸ Workflows$/.test(l)), wfShut.join('\n'))
  assert.ok(!wfShut.some(l => /not observable here - only the host/.test(l)), wfShut.join('\n'))
  assert.match(text(reduce(onRuns(s, '', {}), { name: '2' }).state), /▾ Runs \(0\)\n    no open runs/)
  assert.match(text(reduce(s, { name: '2' }).state), /▾ Runs\n    reading runs…/)
})
// F76 (owner): every run and stage row has a `●` in its status colour, the Tickets tab's
// colours - completed green ([x]), in progress amber ([~]), not started as a pending
// ticket ([ ]), failed red ([!]); the Runs header takes the colour of what is under way.
test('F76: a status dot on every run and stage row, coloured as the Tickets tab', () => {
  const list = 'RUN-0012  board sweep  1/4 done  (stage 3 open)\nRUN-0011  older run  3/3 done\nRUN-0014  planned one  0/2 done\n'
  const chain12 = ['## Stages', '| # | stage | state | owner | heartbeat | landed |', '|---|---|---|---|---|---|',
    '| 1 | S1 F1 | x | b | - | a |', '| 2 | S2 F2 | ! | b | - | |', '| 3 | S3 F3 | ~ | b | - | |', '| 4 | S4 B2 | pending | b | - | |', '',
    '## Chain', '### S1 - stage 1 - F1 one', 'tickets: F1', '### S2 - stage 2 - F2 two', 'tickets: F2',
    '### S3 - stage 3 - F3 three', 'tickets: F3', '### S4 - stage 4 - B2 four', 'tickets: B2', ''].join('\n')
  const chain14 = '## Chain\n### P1 - stage 1 - F1 one\ntickets: F1\n### P2 - stage 2 - F3 three\ntickets: F3\n'
  const r = reduce(reduce(onRuns(s, list, { 'RUN-0012': chain12, 'RUN-0014': chain14 }), { name: '2' }).state, { name: 'return' }).state
  const segs = frameSegs({ ...r, rows: 40 })
  const line = (re: RegExp) => segs.find(l => re.test(l.map(x => x.text).join('')))
  const dot = (re: RegExp) => line(re)?.find(x => x.text === '●')?.color
  assert.equal(dot(/RUN-0012  board sweep/), 'warning')     // dispatched, not all landed: in progress
  assert.equal(dot(/RUN-0011  older run/), 'success')       // all landed: completed
  assert.equal(dot(/RUN-0014  planned one/), 'text')        // planned: not started
  assert.equal(dot(/^    ●  1  F1 /), 'success')
  assert.equal(dot(/^    ●  2  F2 /), 'error')                // failed keeps its red
  assert.equal(dot(/^    ●  3  F3 /), 'warning')
  assert.equal(dot(/^    ●  4  B2 /), 'text')
  assert.equal(line(/▾ Runs \(3\)/)?.find(x => /Runs/.test(x.text))?.color, 'warning')
})
// F99: a finished run sorts after the active ones and draws dim whole, its done dot kept.
test('F99: finished runs after the active ones, their rows dim', () => {
  const list = 'RUN-0011  older run  3/3 done\nRUN-0012  board sweep  2/4 done  (stage 3 open)\n'
  const r = reduce(onRuns(s, list, {}), { name: '2' }).state
  const f = sized(r)
  const i11 = f.findIndex(l => /RUN-0011  older run/.test(l)), i12 = f.findIndex(l => /RUN-0012  board sweep/.test(l))
  assert.ok(i12 >= 0 && i11 > i12, f.join('\n'))
  const segs = frameSegs({ ...r, rows: 40 })
  const line = segs.find(l => /RUN-0011  older run/.test(l.map(x => x.text).join('')))!
  assert.equal(line.find(x => x.text === '●')?.color, 'success')
  assert.ok(line.filter(x => x.text !== '●' && x.text.trim()).every(x => x.dim), JSON.stringify(line))
})
// T7a, as the mock's "Add person" frame and Team view (the mock wins over the block's
// excerpt: the form is boxed like the assign dialog, the Team view's selected row is
// marked at the left edge, its keys read "n add · del remove (asks first) · esc back").
const two = { ...s, team: [{ handle: '@asha', emails: ['a@x', 'asha@y'], name: 'Asha Rao' }, { handle: '@vidul', emails: ['v@x'], name: 'Vidul K' }] }
test('team view and add-person form draw in the body at 80 columns', () => {
  const tv = reduce(two, { name: 't' }).state
  const t = text(tv)
  assert.match(t, /Team  \.skillator\/team\.md · 2 people\n› @asha +Asha Rao +a@x, asha@y +\S.*\n  @vidul +Vidul K +v@x/)
  // A146: q closes the whole board from the Team view too, so its footer lists it
  assert.match(t, /\nn add · del remove \(asks first\) · l make lead · esc back · q quit\n/)
  // F80: the lead marked lead, me (you), the header says who you are
  const marked = text(reduce({ ...two, team: [{ ...two.team[0]!, lead: true as const }, two.team[1]!], me: '@vidul' }, { name: 't' }).state)
  assert.match(marked, /Team  \.skillator\/team\.md · 2 people · you: @vidul\n› @asha +Asha Rao +a@x, asha@y +lead\b.*\n  @vidul +Vidul K +v@x +\(you\)/)
  assert.match(text(reduce(tv, { name: 'down' }).state), /\n  @asha .*\n› @vidul /)
  const f = reduce(tv, { name: 'n' }).state
  const ft = text(f)
  assert.match(ft, /  ┌─ Add person ─+┐\n  │  Handle   @_ +│\n  │  Name +│\n  │  Emails +│\n  │ +│\n  │  Runs    ticket-meta team add @\? \? \? +│\n  │  tab next field · enter add · esc cancel +│\n  └─+┘/)
  assert.match(ft, /\ntab \/ shift-tab field · enter add · esc cancel\n/)
  const ask = reduce(tv, { name: 'delete' }).state
  assert.match(text(ask), /\nremove @asha from \.skillator\/team\.md\? \(y\/n\)\n/)
  assert.match(frame(ask, { color: true, ascii: false }).find(l => l.includes('(y/n)'))!, /\x1b\[33mremove @asha/)
})
test('the form: typed fields, the cursor on the active one, a long command wraps its emails, a refusal in red', () => {
  let f = reduce(reduce(two, { name: 't' }).state, { name: 'n' }).state
  for (const ch of 'ravi') f = reduce(f, { name: ch, sequence: ch }).state
  f = reduce(f, { name: 'tab' }).state
  for (const ch of 'Ravi Menon') f = reduce(f, { name: ch.toLowerCase(), sequence: ch }).state
  f = reduce(f, { name: 'tab' }).state
  for (const ch of 'ravi@ikran.in, ravi.m@gmail.com') f = reduce(f, { name: ch, sequence: ch }).state
  const t = text(f)
  assert.match(t, /│  Handle   @ravi +│\n  │  Name     Ravi Menon +│\n  │  Emails   ravi@ikran\.in, ravi\.m@gmail\.com_ +│/)
  assert.match(t, /│  Runs    ticket-meta team add @ravi "Ravi Menon" +│\n  │          ravi@ikran\.in,ravi\.m@gmail\.com +│/)
  const no = { ...f, person: { ...f.person!, result: 'ticket-meta: not an email: x' } }
  assert.match(frame(no, { color: true, ascii: false }).find(l => l.includes('not an email'))!, /\x1b\[31m  ticket-meta: not an email: x/)
  const path = 'C:/Users/someone/AppData/Local/Temp/ops-x/.skillator/team.md'
  const dup = text({ ...f, person: { ...f.person!, result: `ticket-meta: @ravi is already in ${path}` } })
  assert.match(dup, /│  ticket-meta: @ravi is already in C:\/Users\/someone\/AppData\/Local│\n  │  \/Temp\/ops-x\/\.skillator\/team\.md +│/)
  for (const [cols, rows] of [[80, 24], [40, 12], [20, 5], [120, 40]] as const) {
    sized({ ...f, cols, rows }); sized({ ...no, cols, rows })
    sized({ ...reduce(two, { name: 't' }).state, cols, rows })
    sized({ ...reduce(reduce(two, { name: 't' }).state, { name: 'delete' }).state, cols, rows })
  }
  for (const l of frame(no, { color: false, ascii: true, plain: true })) assert.doesNotMatch(l, /[^\x20-\x7e]/, l)
})
test('the assign box lists + add person; from it the form overlays the dialog; no team file offers it', () => {
  const d = reduce(two, { name: 'a' }).state
  assert.match(text(d), /  │  › @asha     Asha Rao +│\n  │    @vidul    Vidul K +│\n  │    \+ add person +│/)
  const onAdd = reduce(reduce(d, { name: 'down' }).state, { name: 'down' }).state
  assert.match(text(onAdd), /  │  › \+ add person +│/)
  assert.match(text(reduce(onAdd, { name: 'return' }).state), /┌─ Add person ─/)
  const none = text(reduce({ ...s, team: [] }, { name: 'a' }).state)
  assert.match(none, /│  no \.skillator\/team\.md yet - \+ add person creates it +│\n  │  › \+ add person +│/)
})

test('health with readings: bars, relay, machine rows with their thresholds', () => {
  const held = onMachine(s, RED_HELD, 0).state
  const u = onUsage(held, 'src=codex 5h=41 7d=55 ctx=- max=-\n', 0)
  const x = reduce(u.effects[0]!.kind === 'run' ? (u.effects[0]!.then({ code: 0, out: 'RELEASE 41\n', err: '', argv: [] })(u.state) as State) : u.state, { name: '3' }).state
  const h = text(x)
  assert.match(h, /  5-hour        ████████░+  41% \(0m old\)/)
  assert.match(h, /  Relay         stages run \(RELEASE 41\)/)
  assert.match(h, /  Memory        0\.5 GB free +amber < 2 GB · red < 1 GB/)
  assert.match(h, /  Disk C:       84 GB free +amber < 5 GB · red < 1 GB/)
  assert.match(h, /  Hold          set 03:29Z: mem 0\.5 GB/)
  assert.match(h, /  Stale locks   none/)
})
test('F87: muted - the band and the Health tab say so with the time forced and the memory then; F is in the keys', () => {
  const kv = 'DRIVE=C:\nDISK_FREE=90000000000\nDISK_TOTAL=1\nMEM_FREE=500000000\nHOLD=-\nMUTE=2026-10-25T09:00Z mem 0.5 GB free\n'
  const x = reduce({ ...onMachine(s, kv, 0).state, cols: 160 }, { name: '3' }).state
  const h = text(x)
  assert.match(h, /watchdog muted \(forced 09:00Z\)/)
  assert.match(h, /  Muted         watchdog muted \(forced 09:00Z\), mem 0\.5 GB free then\n {16}memory red does not hold until memory reads green once/)
  assert.match(h, /F force resume/)
  assert.doesNotMatch(text(reduce(onMachine(s, RED_HELD, 0).state, { name: '3' }).state), /Muted/)
})
test('F82: the Health tab says a stale board amber and board-fresh\'s refusal red; none when not behind', () => {
  const kvb = RED_HELD + 'BOARD=refused|3|origin/main|3 behind origin/main, 1 local commit(s) not on it\n'
  const x = reduce(onMachine(s, kvb, 0).state, { name: '3' }).state
  const h = text(x)
  assert.match(h, /  Board         stale: 3 behind origin\/main\n {16}refused: 3 behind origin\/main, 1 local commit\(s\) not on it/)
  const col = frame(x, { color: true, ascii: false }).join('\n')
  assert.match(col, /\x1b\[[0-9;]*m[^\x1b]*stale: 3 behind/)
  assert.doesNotMatch(text(reduce(onMachine(s, RED_HELD, 0).state, { name: '3' }).state), /Board/)
})
test('A143 follow-up: a row shows its session tag only while [~] or [%]; a stale one left on [ ] yields to the owner', () => {
  const b = '# Tickets\n\n- [~] F1 — live work [owner: @vidul] (@cc-aaaaaa)\n- [ ] F2 — handed over [owner: @asha] (@cc-bbbbbb)\n'
    + '- [%] F3 — built (testing: live check) [owner: @asha] (@cc-cccccc)\n'
  const f = text(opened(onBoard(initial(80, 24, 0), parseBoard(b, 'T', 1, 1), [{ handle: '@asha', emails: [] }], null)))
  assert.match(f, /F1 +live work +@cc-aaaaaa/)
  assert.match(f, /F3 +built.* +@cc-cccccc/)
  assert.match(f, /F2 +handed over +@asha/)
  assert.doesNotMatch(f, /F2 .*@cc-bbbbbb/)
})

// ---- F61: collapsible status groups ----

test('F61: every group starts collapsed - one header per group with its count, the first selected, no rows', () => {
  const f = text(fresh)
  assert.match(f, /\n› ▸ In progress \(1\)\n  ▸ Blocked \(1\)\n  ▸ Pending decision \(1\)\n  ▸ Pending \(4\)\n  ▸ Deferred \(1\)\n/)
  assert.doesNotMatch(f, /● B2 /)
  // the count line is the board's, not the view's
  assert.match(f, /^7 open \(4 pending · 1 in progress · 1 blocked · 1 decision\) · 1 deferred$/m)
  // colour: the glyph and the words in the state's colour, the selected header highlighted (F89)
  const c = frame(fresh, { color: true, ascii: false })
  assert.match(c.find(l => l.includes('In progress'))!, /\x1b\[1;97;44m▸ In progress \(1\)/)
  assert.match(c.find(l => l.includes('Blocked'))!, /\x1b\[31;1m▸ Blocked \(1\)/)
})

test('F61: Enter opens a group under its header, ▾; the keys line says what Enter does on a header', () => {
  const keys = (x: State) => frame({ ...x, cols: 100 }, P).find(l => l.includes('a assign'))!   // F81: room for c reconcile
  assert.match(keys(fresh), /^↑↓ move · enter open · a assign/)
  const o = reduce(fresh, { name: 'return' }).state
  assert.match(text(o), /› ▾ In progress \(1\)\n  ● B2  CSV export drops the last row[^\n]*\n  ▸ Blocked \(1\)/)
  assert.match(keys(o), /^↑↓ move · enter close · a assign/)
  assert.match(keys(reduce(o, { name: 'down' }).state), /^↑↓ move · enter line · a assign/)
})

test('F61: ascii draws the headers > and v', () => {
  const a = frame(reduce(fresh, { name: 'return' }).state, { color: false, ascii: true, plain: true }).join('\n')
  assert.match(a, /> v In progress \(1\)\n  \* B2 /)
  assert.match(a, /\n  > Blocked \(1\)/)
  assert.equal(glyph('▸', true), '>')
})

test('F61: headers fit 80, 60 and 40 columns, a 240-ticket group too, colour and ascii', () => {
  const many = Array.from({ length: 240 }, (_, i) => `- [ ] F${i + 1} — pending ticket number ${i + 1} with a long title`).join('\n') + '\n- [?] F999 — decide\n'
  const big = onBoard(initial(80, 24, 0), parseBoard(many, 'T', 1, 1), [], null)
  for (const cols of [80, 60, 40]) {
    for (const x of [big, opened(big), fresh, s]) {
      const f = sized({ ...x, cols })
      for (const p of [{ color: true, ascii: false }, { color: false, ascii: true, plain: true }])
        for (const l of frame({ ...x, cols }, p)) assert.ok(cells(l.replace(/\x1b\[[0-9;]*m/g, '')) <= cols, l)
      if (x === big) assert.ok(f.some(l => /^  ▸ Pending \(240\)$/.test(l)), f.join('\n'))
    }
  }
})

test('F61: the selected header scrolls into view in a short terminal', () => {
  let x: State = { ...opened(fresh), rows: 13, selected: 'B2' }
  for (let i = 0; i < 10; i++) x = reduce(x, { name: 'down' }).state
  assert.equal(x.selected, 'head:>')
  assert.ok(sized(x).some(l => l.startsWith('› ▾ Deferred (1)')), text(x))
})

// F77: the assign box carries the Ticket field; the keys line follows the field in use.
test('F77: the assign box draws the Ticket line; typing an ID there, the keys say so', () => {
  const sel = reduce(s, { name: 'a' }).state                        // B2 selected
  const t = text(sel)
  assert.match(t, /┌─ Assign B2 ─+┐\n  │  Ticket  B2 · \[~\] in progress · CSV export drops the last row +│/)
  assert.match(t, /\n↑↓ person · a \/ d kind · tab ticket · enter confirm · esc cancel\n/)
  const none = reduce({ ...fresh }, { name: 'a' }).state             // a header selected: no ticket
  const n = text(none)
  assert.match(n, /┌─ Assign a ticket ─+┐\n  │  Ticket  _ · type a ticket ID, e.g. F12 +│/)
  assert.match(n, /\ntype the ID · tab person · enter confirm · esc cancel\n/)
  for (const [cols, rows] of [[80, 24], [40, 12], [20, 5]] as const) sized({ ...none, cols, rows })
})
// Review #6: the stage dot differs only by colour; with colour off (--no-color, NO_COLOR)
// or --ascii each stage keeps its state glyph (done, in flight, failed, pending).
test('F76: with colour off or --ascii a stage row keeps its state glyph', () => {
  const list = 'RUN-0012  board sweep  1/4 done  (stage 3 open)\n'
  const chain = ['## Stages', '| # | stage | state | owner | heartbeat | landed |', '|---|---|---|---|---|---|',
    '| 1 | S1 F1 | x | b | - | a |', '| 2 | S2 F2 | ! | b | - | |', '| 3 | S3 F3 | ~ | b | - | |', '| 4 | S4 B2 | pending | b | - | |', '',
    '## Chain', '### S1 - stage 1 - F1 one', 'tickets: F1', '### S2 - stage 2 - F2 two', 'tickets: F2',
    '### S3 - stage 3 - F3 three', 'tickets: F3', '### S4 - stage 4 - B2 four', 'tickets: B2', ''].join('\n')
  const r = { ...reduce(reduce(onRuns(s, list, { 'RUN-0012': chain }), { name: '2' }).state, { name: 'return' }).state, rows: 40 }
  const mono = frame(r, P).join('\n')
  assert.match(mono, /^    ✓  1  F1 /m)
  assert.match(mono, /^    ✗  2  F2 /m)
  assert.match(mono, /^    ●  3  F3 /m)
  assert.match(mono, /^    ·  4  B2 /m)
  const ascii = frame(r, { color: true, ascii: true }).map(l => l.replace(/\x1b\[[0-9;]*m/g, '')).join('\n')
  assert.match(ascii, /^    \+  1  F1 /m)
  assert.match(ascii, /^    x  2  F2 /m)
  assert.match(ascii, /^    \*  3  F3 /m)
  assert.match(ascii, /^    \.  4  B2 /m)
  // colour on: the owner's dots, each in its status colour
  const col = frame(r, { color: true, ascii: false }).join('\n')
  assert.match(col, /^    \x1b\[32m●\x1b\[0m  1  /m)
  assert.match(col, /^    \x1b\[31m●\x1b\[0m  2  /m)
})

// F128: Ops board Tickets: collapsible Assigned and Decide sections draw
test('F128 draw: Assigned and Decide sections render with fold indicators and adapt to folding and ascii', () => {
  const b = parseBoard(
    '- [ ] F1 — Dark mode [owner: @asha]\n- [?] F3 — Pick chart [decide: @asha]\n',
    'T', 1, 1
  )
  const tm = [{ handle: '@asha', emails: [] }]
  let sUser = onBoard(initial(80, 24, 0), b, tm, '@asha')
  let f = frame(sUser, P).join('\n')
  assert.match(f, /▾ Assigned \(1\)/)
  assert.match(f, /F1  Dark mode/)
  assert.match(f, /▾ Decide \(1\)/)
  assert.match(f, /F3  Pick chart/)

  // Fold assigned section
  sUser = { ...sUser, open: [...sUser.open, 'fold:assigned' as any] }
  f = frame(sUser, P).join('\n')
  assert.match(f, /▸ Assigned \(1\)/)
  assert.match(f, /▸ Assigned \(1\)\n  ▾ Decide \(1\)/)

  // In ASCII mode, ▾ / ▸ become v / >
  const fAscii = frame(sUser, { color: false, ascii: true, plain: true }).join('\n')
  assert.match(fAscii, /> Assigned \(1\)/)
  assert.match(fAscii, /v Decide \(1\)/)
})

test('F120: responsive footer actions and wrapping across 40, 60, 80, 100, 120 columns without dropping keys', () => {
  const expectedKeys = ['↑↓ move', 'enter line', 'a assign', 'd decide', 't team', 'c reconcile', 'r reload', 'q quit']
  for (const cols of [40, 60, 80, 100, 120]) {
    const f = frame({ ...s, cols }, P)
    assert.equal(f.length, s.rows)
    for (const l of f) assert.ok(cells(l) <= cols, `${cells(l)} > ${cols}: ${l}`)
    const full = f.join('\n')
    for (const k of expectedKeys) {
      assert.ok(full.includes(k), `cols ${cols}: missing shortcut "${k}"\n${full}`)
    }

    // Decidable row adds D decided; none of the keys are dropped
    const f3: State = { ...s, selected: 'F3', cols }
    const f3Frame = frame(f3, P)
    assert.equal(f3Frame.length, f3.rows)
    for (const l of f3Frame) assert.ok(cells(l) <= cols, `${cells(l)} > ${cols}: ${l}`)
    const f3Full = f3Frame.join('\n')
    for (const k of [...expectedKeys, 'D decided']) {
      assert.ok(f3Full.includes(k), `cols ${cols} (decidable): missing shortcut "${k}"\n${f3Full}`)
    }

    // Health tab shortcuts preserved across all widths
    const h = reduce({ ...s, cols }, { name: '3' }).state
    const hFrame = frame(h, P)
    assert.equal(hFrame.length, h.rows)
    for (const l of hFrame) assert.ok(cells(l) <= cols, `${cells(l)} > ${cols}: ${l}`)
    const hFull = hFrame.join('\n')
    for (const k of ['R resume', 'F force resume', 'r reload', 'q quit']) {
      assert.ok(hFull.includes(k), `cols ${cols} (health): missing shortcut "${k}"\n${hFull}`)
    }
  }

  // Body layout budget intact across narrow terminals
  const narrow12 = frame({ ...s, cols: 40, rows: 12 }, P)
  assert.equal(narrow12.length, 12)
  for (const l of narrow12) assert.ok(cells(l) <= 40, `${cells(l)} > 40: ${l}`)
  assert.ok(narrow12.some(l => l.includes('In progress') || l.includes('B2')))
})

