import { test, expect } from 'claude-code/testing'
import { meOf, parseTeam } from '../hooks/lib/team'

// team.md as ticket-meta `team add` writes it: the member line, then an indented
// `  name:` line straight under it (T2b). The old shape, with no name, still reads.
test('team: the name line under a member is read', () => {
  const team = parseTeam('# Team\n\n- @asha: asha@x.com\n  name: Asha Rao\n- @vidul: Vidul@ikran.in, V2@X.com\n  name: Vidul Ikran\n')
  expect(team).toEqual([
    { handle: '@asha', emails: ['asha@x.com'], name: 'Asha Rao' },
    { handle: '@vidul', emails: ['vidul@ikran.in', 'v2@x.com'], name: 'Vidul Ikran' },
  ])
  expect(meOf(team, 'v2@x.com')).toBe('@vidul')
})

test('team: a member with no name line has no name; a stray name line names nobody', () => {
  const team = parseTeam('  name: Nobody\n- @asha: a@b\n\n  name: Too Late\n- @neo: n@x\r\n  name: Neo\r\n')
  expect(team).toEqual([{ handle: '@asha', emails: ['a@b'] }, { handle: '@neo', emails: ['n@x'], name: 'Neo' }])
  expect('name' in team[0]!).toBe(false)
})

test('team: the old shape still reads', () => {
  expect(parseTeam('- @vidul: vidul@ikran.in\n- @asha: asha@example.com\n'))
    .toEqual([{ handle: '@vidul', emails: ['vidul@ikran.in'] }, { handle: '@asha', emails: ['asha@example.com'] }])
})

// Review fix: the member line is ticket-meta's (`^[ \t]*[-*][ \t]*@[A-Za-z0-9_.-]+[ \t]*:`),
// the handle kept as written (ticket-meta assign / team remove match it exactly).
test('team: member lines as ticket-meta reads them - case kept, dots, * bullets, no space after the bullet', () => {
  const team = parseTeam('- @Asha: A@x.com\n- @j.doe: j@x.com\n* @neo: n@x.com\n-@kai : k@x.com\n\t- @sub: s@x.com\n  name: Sub\n  name: Sub Two\n')
  expect(team.map(m => m.handle)).toEqual(['@Asha', '@j.doe', '@neo', '@kai', '@sub'])
  expect(team[0]!.emails).toEqual(['a@x.com'])
  expect(team[4]!.name).toBe('Sub Two')                 // ticket-meta: the last name line under it
  expect(meOf(team, 'a@x.com')).toBe('@Asha')
})

// F80: one `lead: @handle` line under `# Team` marks that member the lead; a second
// lead line (hand-written) is ignored, as ticket-meta reads the first.
test('team: F80 the one lead line marks its member', () => {
  const team = parseTeam('# Team\nlead: @neo\nlead: @asha\n\n- @asha: a@x\n- @neo: n@x\r\n  name: Neo\r\n')
  expect(team).toEqual([{ handle: '@asha', emails: ['a@x'] }, { handle: '@neo', emails: ['n@x'], name: 'Neo', lead: true }])
  expect(parseTeam('- @asha: a@x\n').some(m => m.lead)).toBe(false)
})

// F80 review: me as ticket-meta whoami finds it - SKILLATOR_ME (a member, @ optional)
// overrides the email; one not on the team is nobody, never a fall back to the email.
test('team: F80 SKILLATOR_ME overrides the email for me', () => {
  const team = parseTeam('- @asha: a@x\n- @neo: n@x\n')
  expect(meOf(team, 'a@x', 'neo')).toBe('@neo')
  expect(meOf(team, '', '@neo')).toBe('@neo')
  expect(meOf(team, 'a@x', '@ghost')).toBe(null)
  expect(meOf(team, 'a@x', null)).toBe('@asha')
})
