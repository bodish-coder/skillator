import { test, expect } from 'claude-code/testing'
import { parseBoard, priorityFilterOptions } from '../hooks/lib/board'
import { hasValue, orderedRules, parseRulesList, parseRulesPreview, ruleArgs, ruleOptions, ruleSummary, toggleValue } from '../hooks/lib/rules'

const REV = '5'.repeat(64)
const LIST = ['Queue Jarvis | Priority rules', '3 rule(s).', '1  P2: severity=high', '2  P1: type=bug app=a,b,c',
  '3  P1: release=next release app=ops board,web', 'Invalid line 9: Unknown field colour. | - P2: colour=red', 'Rules revision: ' + REV, ''].join('\n')

test('parseRulesList reads rules, invalid lines and the revision; an incomplete list is null', () => {
  const list = parseRulesList(LIST)!
  expect(list.revision).toBe(REV)
  expect(list.rules).toEqual([
    { n: 1, level: 'P2', conditions: [['severity', ['high']]] },
    { n: 2, level: 'P1', conditions: [['type', ['bug']], ['app', ['a', 'b', 'c']]] },
    { n: 3, level: 'P1', conditions: [['release', ['next release']], ['app', ['ops board', 'web']]] },
  ])
  expect(list.invalid).toEqual(['Invalid line 9: Unknown field colour. | - P2: colour=red'])
  expect(orderedRules(list.rules).map(rule => rule.n)).toEqual([2, 3, 1])
  expect(ruleSummary(list.rules[2]!)).toBe('release=next release app=ops board,web')
  expect(parseRulesList('0 rule(s).\nRules revision: ' + REV + '\n')).toEqual({ rules: [], invalid: [], revision: REV })
  expect(parseRulesList(LIST.replace('Rules revision: ' + REV, ''))).toBeNull()
  expect(parseRulesList(LIST.replace('3 rule(s).', '4 rule(s).'))).toBeNull()
})

test('parseRulesPreview needs the count, every change row and a token when anything changes', () => {
  const token = '7'.repeat(64)
  const out = ['Queue Jarvis | Rules preview', '2 ticket(s) would change.', 'P1: 2 · P2: 0 · P3: 0 · P4: 0 · P5: 0',
    'B1       Unranked -> P1   rule 1   Crash in a', 'F3       P3       -> P1   rule 2   Feature in c', 'Preview token: ' + token, ''].join('\n')
  expect(parseRulesPreview(out)).toEqual({ token, count: '2 ticket(s) would change.', levels: 'P1: 2 · P2: 0 · P3: 0 · P4: 0 · P5: 0',
    changes: ['B1 Unranked -> P1 rule 1 Crash in a', 'F3 P3 -> P1 rule 2 Feature in c'] })
  expect(parseRulesPreview('0 ticket(s) would change.\nP1: 0 · P2: 0 · P3: 0 · P4: 0 · P5: 0\n')?.token).toBeNull()
  expect(parseRulesPreview(out.replace('Preview token: ' + token, ''))).toBeNull()
  expect(parseRulesPreview(out.replace('2 ticket(s)', '3 ticket(s)'))).toBeNull()
})

test('ruleArgs, ruleOptions and toggleValue build a rule from picked values', () => {
  expect(ruleArgs('P1', { type: ['bug'], app: ['a', 'b'], owner: [] })).toEqual(['P1', 'app=a,b', 'type=bug'])
  expect(ruleArgs('P3', {})).toEqual(['P3'])
  expect(ruleOptions(['web', 'F3'], ['f3', 'legacy'])).toEqual(['web', 'F3', 'legacy'])
  expect(hasValue(['f3'], 'F3')).toBe(true)
  expect(toggleValue(['f3', 'web'], 'F3')).toEqual(['web'])
  expect(toggleValue(['web'], 'api')).toEqual(['web', 'api'])
})

test('priorityFilterOptions(board, true) offers values of ranked open tickets too', () => {
  const board = parseBoard('- [ ] B1 — one [app: web] [priority: P2]\n- [ ] B2 — two [app: api]\n- [x] B3 — three [app: old]\n', 'T', 1, 1)
  const apps = (ranked: boolean) => priorityFilterOptions(board, ranked).find(field => field.key === 'app')!.values
  expect(apps(false)).toEqual(['api'])
  expect(apps(true)).toEqual(['api', 'web'])
})
