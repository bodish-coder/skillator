import { test, expect } from 'claude-code/testing'
import { parseBoard, listView, countLine, visible, STATE_COLOR, STATE_NAME, GROUPS, isOpen, paint } from '../hooks/lib/board'
import { parseTeam, meOf } from '../hooks/lib/team'
import { BOARD, BY_TYPE, BY_STATUS } from './fixtures'

const NOFILTER = { app: null, who: null, mine: false, showDone: true }

test('by type matches tickets-zordon', () => {
  expect(listView(parseBoard(BOARD, 'T', 0, 0), '')).toBe(BY_TYPE)
})
test('by status matches tickets-zordon', () => {
  expect(listView(parseBoard(BOARD, 'T', 0, 0), 'status')).toBe(BY_STATUS)
})
test('empty board prints all eight states', () => {
  expect(countLine([])).toBe('0 open (0 pending · 0 in-progress · 0 testing · 0 blocked · 0 pending decision) · 0 deferred · 0 closed (0 done · 0 cancelled) · 0 total')
})
// F62: [%] testing - built, waiting on a test result. Open; its own group and status
// heading between In progress and Blocked; drawn in the suggestion colour.
test('[%] testing parses, is open, groups and lists between in progress and blocked', () => {
  const b = parseBoard('- [!] B1 — stuck\n- [%] F7 — built thing (testing: owner live check)\n- [~] F8 — working\n- [ ] F9 — later\n', 'T', 0, 0)
  const t = b.tickets.find(x => x.id === 'F7')!
  expect([t.box, t.title]).toEqual(['%', 'built thing'])
  expect(isOpen(t)).toBe(true)
  expect(STATE_NAME['%']).toBe('testing')
  expect(STATE_COLOR['%']).toBe('cyan')
  expect(paint('%')).toBe('suggestion')
  expect(GROUPS.map(g => g.box).slice(0, 3)).toEqual(['~', '%', '!'])
  expect(GROUPS.find(g => g.box === '%')!.title).toBe('TESTING')
  expect(countLine(b.tickets)).toBe('4 open (1 pending · 1 in-progress · 1 testing · 1 blocked · 0 pending decision) · 0 deferred · 0 closed (0 done · 0 cancelled) · 4 total')
  expect(listView(b, 'status').split('\n').filter(l => l && !l.startsWith(' ')).slice(0, 4)).toEqual(['In progress', 'Testing', 'Blocked', 'Pending'])
  expect(listView(b, '')).toContain('[%] F7 — built thing (testing: owner live check)')
})
test('tags parsed, title kept', () => {
  const t = parseBoard('- [?] F3 — Pick the chart library [app: web, api] [decide: @asha] (@cc-a4f1c9)\n', 'T', 0, 0).tickets[0]!
  expect([t.box, t.title, t.apps, t.decide, t.session]).toEqual(['?', 'Pick the chart library', ['web', 'api'], '@asha', '@cc-a4f1c9'])
})
// F109: the (@sid:owner:mode) tag is the session too - off the title and the list line
test('F109: the new session tag shape parsed, left off the title', () => {
  const b = parseBoard('- [~] F9 — Wip [owner: @asha] (@cc-k7q2:asha:run)\n', 'T', 0, 0)
  const t = b.tickets[0]!
  expect([t.title, t.session, t.owner]).toEqual(['Wip', '@cc-k7q2:asha:run', '@asha'])
  expect(listView(b, 'F9')).toContain('F9 — Wip [owner: @asha]')
  expect(listView(b, 'F9')).not.toContain('k7q2')
})
test('parent, section, and non-tickets', () => {
  const b = parseBoard('## Bugs\n- [~] B2 — x\n  - [ ] B2b — y\n- [ ] no dash here\n', 'T', 1, 2)
  expect(b.tickets.map(t => [t.id, t.parent, t.indent, t.section])).toEqual([['B2', null, 0, 'Bugs'], ['B2b', 'B2', 2, 'Bugs']])
  expect([b.path, b.mtimeMs, b.size, b.error]).toEqual(['T', 1, 2, null])
})
test('app filter; F1 never matches F12', () => {
  const b = parseBoard('- [ ] F1 — a [app: api]\n- [ ] F12 — b [app: web]\n- [ ] F2 — c [app: api, web]\n', 'T', 0, 0)
  expect(visible(b, { ...NOFILTER, app: 'api' }, null).map(t => t.id)).toEqual(['F1', 'F2'])
  expect(listView(b, 'F1')).toContain('F1 — a')
  expect(listView(b, 'F1')).not.toContain('F12')
})
test('visible: showDone, who, mine', () => {
  const b = parseBoard('- [ ] F1 — a [owner: @asha]\n- [x] F2 — b\n- [?] F3 — c [decide: @asha]\n- [ ] F4 — d [owner: @vidul]\n', 'T', 0, 0)
  expect(visible(b, { ...NOFILTER, showDone: false }, null).map(t => t.id)).toEqual(['F1', 'F3', 'F4'])
  expect(visible(b, { ...NOFILTER, who: '@asha' }, null).map(t => t.id)).toEqual(['F1', 'F3'])
  expect(visible(b, { ...NOFILTER, mine: true }, '@vidul').map(t => t.id)).toEqual(['F4'])
})
test('@person = owner or by in list view, not decide-only', () => {
  const b = parseBoard('- [ ] F1 — a [owner: @asha]\n- [?] F3 — c [decide: @asha]\n- [ ] F4 — d [by: @vidul, @asha]\n', 'T', 0, 0)
  const out = listView(b, '@asha')
  expect(out).toContain('F1 — a')
  expect(out).toContain('F4 — d')
  expect(out).not.toContain('F3')
})
test('team parse and me', () => {
  const team = parseTeam('# Team\n- @vidul: Vidul@ikran.in, x@y\n- @asha: a@b\n')
  expect(team).toEqual([{ handle: '@vidul', emails: ['vidul@ikran.in', 'x@y'] }, { handle: '@asha', emails: ['a@b'] }])
  expect(meOf(team, 'vidul@ikran.in')).toBe('@vidul')
  expect(meOf(team, 'nobody@x')).toBe(null)
})
test('closed shown only with all; big boards cap pending at 20', () => {
  expect(listView(parseBoard(BOARD, 'T', 0, 0), 'all')).toContain('[x] B1 — Login redirect loop')
  expect(listView(parseBoard(BOARD, 'T', 0, 0), 'all')).toContain('[-] B6')
  const many = Array.from({ length: 44 }, (_, i) => `- [ ] A${i + 1} — item ${i + 1}\n`).join('')
  const out = listView(parseBoard(many, 'T', 0, 0), '')
  expect(out).toContain('… 24 more pending in Agent-found — `list tickets A` for all of them')
  expect(listView(parseBoard(many, 'T', 0, 0), 'A').split('\n').filter(l => l.includes('item')).length).toBe(44)
})
test('state colours', () => {
  expect(STATE_COLOR['~']).toBe('amber')
  expect(STATE_COLOR['x']).toBe('green')
})

// Review fix: ticket-meta and pending take an em dash, an en dash or a plain `-` after the id.
test('plain - and en dash after the id count and show like the em dash', () => {
  const b = parseBoard('- [ ] F9 - quick fix\n- [~] F10 – en dash one\n- [!]  B1— tight [owner: @asha]\n- [ ] not-a-ticket - x\n', 'T', 0, 0)
  expect(b.tickets.map(t => [t.id, t.box, t.title])).toEqual([['F9', ' ', 'quick fix'], ['F10', '~', 'en dash one'], ['B1', '!', 'tight']])
  expect(b.tickets[2]!.owner).toBe('@asha')
  const out = listView(b, '')
  expect(out).toContain('[ ] F9 — quick fix')
  expect(out).toContain('[~] F10 — en dash one')
  expect(out).toContain('[!] B1 — tight [owner: @asha]')
  expect(countLine(b.tickets)).toStartWith('3 open')
})

// Review round 2: the dash after the id is the one stripped, not a hyphen in the words.
test('list view: a dash glued to the id keeps the hyphenated words after it', () => {
  const b = parseBoard('- [ ] F3—re-run the GREEN\n- [ ] F4 – semi-final pass\n', 'T', 0, 0)
  const out = listView(b, '')
  expect(out).toContain('[ ] F3 — re-run the GREEN')
  expect(out).toContain('[ ] F4 — semi-final pass')
})
