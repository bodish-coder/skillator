import { test, expect } from 'claude-code/testing'
import { diagnose } from '../hooks/lib/diagnose'
import { parseBoard } from '../hooks/lib/board'
import type { RunView, Stage } from '../types'

// F99: the four verdicts from the four witnesses - run-file stage states, the stages' tickets
// on the board, each landed sha in git, the Chain driver stamp. Fixtures only.
const NOW = new Date(2026, 9, 26, 12, 0).getTime()
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString().slice(0, 16) + 'Z'
const BOARD = parseBoard('- [x] F93 — build tab\n- [%] F94 — ops status\n- [~] F95 — band\n- [ ] F96 — marathon\n', 'T', 0, 0)
const st = (n: number, ticket: string, state: string, landed?: string): Stage =>
  ({ n, code: 'AA' + n, ticket, title: `${ticket} work`, after: '-', files: '-', state, ...(landed ? { landed } : {}) })
const run = (stages: Stage[], driver: string | null, planned = false): RunView => {
  const done = stages.filter(s => s.state === 'x' || s.state === '>').length
  return { id: 'RUN-0021', title: 'pending F93', done, total: stages.length, owner: null, stages, planned, decisions: [], mode: 'workflow', driver, flights: [], phases: null }
}
const shas = (m: Record<string, 'head' | 'off' | 'none'>) => new Map(Object.entries(m))

test('finished: every stage landed, every sha on HEAD, every ticket built', () => {
  const d = diagnose(run([st(157, 'F93', 'x', 'aaa1'), st(159, 'F94', 'x', 'bbb2')], `@cc-1 ${ago(300)}`), BOARD, shas({ aaa1: 'head', bbb2: 'head' }), NOW)
  expect(d).toEqual({ verdict: 'finished', lines: [], closable: [] })
})
test('still running: a stage in flight under a live driver; a landed sha off HEAD is the run branch, not a disagreement', () => {
  const d = diagnose(run([st(157, 'F93', 'x', 'aaa1'), st(160, 'F95', '~')], `@cc-1 ${ago(5)}`), BOARD, shas({ aaa1: 'off' }), NOW)
  expect(d).toEqual({ verdict: 'still running', lines: [], closable: [] })
  expect(diagnose(run([st(161, 'F96', 'pending')], null, true), BOARD, shas({}), NOW).verdict).toBe('still running')   // planned
})
test('stalled: open stages, the driver stamp stale - the driver named with its age', () => {
  const d = diagnose(run([st(157, 'F93', 'x', 'aaa1'), st(160, 'F95', '~'), st(161, 'F96', 'pending')], `@cc-1 ${ago(183)}`), BOARD, shas({ aaa1: 'head' }), NOW)
  expect(d.verdict).toBe('stalled')
  expect(d.lines).toEqual(['driver @cc-1: last heartbeat 183m ago, stale at 20m - a stage is still marked in flight'])
  expect(diagnose(run([st(161, 'F96', 'pending')], null), BOARD, shas({}), NOW).lines).toEqual(['no driver on the Chain header, 1 stage open'])
})
test('inconsistent: one line per disagreement; a lagging stage whose ticket is built is closable', () => {
  const d = diagnose(run([st(157, 'F93', '~'), st(159, 'F94', '!'), st(160, 'F95', 'x', 'ccc3'), st(161, 'F96', 'x', 'ddd4')], `@cc-1 ${ago(183)}`), BOARD, shas({ ccc3: 'none', ddd4: 'head' }), NOW)
  expect(d.verdict).toBe('inconsistent')
  expect(d.lines).toEqual([
    'stage 157: in flight in the run file, but F93 is [x] on the board',
    'stage 159: failed in the run file, but F94 is [%] on the board',
    'stage 160: landed ccc3 is not in this repo',
    'stage 160: landed, but F95 is [~] on the board',
    'stage 161: landed, but F96 is [ ] on the board',
    'driver @cc-1: last heartbeat 183m ago, stale at 20m - a stage is still marked in flight',
  ])
  expect(d.closable).toEqual([{ n: 157, tickets: ['F93'] }])          // review fix 2: a failed stage is said, never closed
  // a finished run whose landed sha is off HEAD: the run branch was never merged
  const f = diagnose(run([st(157, 'F93', 'x', 'aaa1')], null), BOARD, shas({ aaa1: 'off' }), NOW)
  expect(f).toEqual({ verdict: 'inconsistent', lines: ['stage 157: landed aaa1 is not on HEAD - the run branch is not merged'], closable: [] })
  expect(diagnose(run([], null), null, shas({}), NOW)).toEqual({ verdict: 'inconsistent', lines: ['no stages read from the run file'], closable: [] })
})
// Review fixes 2: which stages get the by-hand close command.
test('a stage under a live driver is never closable - said why', () => {
  const d = diagnose(run([st(157, 'F93', '~'), st(158, 'F94', 'pending')], `@cc-1 ${ago(5)}`), BOARD, shas({}), NOW)
  expect(d.closable).toEqual([])
  expect(d.lines).toEqual([
    'stage 157: in flight in the run file, but F93 is [x] on the board',
    'stage 157 driven by @cc-1 5m ago - not closable',
    'stage 158: not started in the run file, but F94 is [%] on the board',
    'stage 158 driven by @cc-1 5m ago - not closable',
  ])
})
test('a driver cell with a tag but no stamp: heartbeat unreadable, never "undefined"', () => {
  const d = diagnose(run([st(157, 'F93', '~')], '@cc-1'), BOARD, shas({}), NOW)
  expect(d.lines).toEqual(['stage 157: in flight in the run file, but F93 is [x] on the board', 'stage 157 driven by @cc-1 (heartbeat unreadable) - not closable'])
})
test('parked and failed stages are said, never closable; pending and in flight with no live driver are', () => {
  const d = diagnose(run([st(157, 'F93', '?'), st(158, 'F94', '!'), st(159, 'F93', 'pending'), st(160, 'F94', '~')], `@cc-1 ${ago(183)}`), BOARD, shas({}), NOW)
  expect(d.lines.slice(0, 2)).toEqual(['stage 157: parked in the run file, but F93 is [x] on the board', 'stage 158: failed in the run file, but F94 is [%] on the board'])
  expect(d.closable).toEqual([{ n: 159, tickets: ['F93'] }, { n: 160, tickets: ['F94'] }])
})
test('a stage of two tickets: one box per ticket, every ticket in the closable stage', () => {
  const d = diagnose(run([st(158, 'F93 F94', 'pending')], null), BOARD, shas({}), NOW)
  expect(d.lines[0]).toBe('stage 158: not started in the run file, but F93 is [x], F94 is [%] on the board')
  expect(d.closable).toEqual([{ n: 158, tickets: ['F93', 'F94'] }])
})
test('tickets are looked up on the board whatever their case', () => {
  const d = diagnose(run([st(157, 'f93', 'x', 'aaa1'), st(158, 'f95', 'x', 'bbb2')], null), BOARD, shas({ aaa1: 'head', bbb2: 'head' }), NOW)
  expect(d.lines).toEqual(['stage 158: landed, but f95 is [~] on the board'])
})
