import { test, expect } from 'claude-code/testing'
import { buildModel, offsetFor } from '../hooks/lib/ticketsmodel'
import { bandLines, countsOf, NARROW_COLUMNS } from '../hooks/lib/bandlines'
import { healthLines } from '../hooks/lib/healthlines'
import { runLines, waves } from '../hooks/lib/runlines'
import { isOpen, parseBoard } from '../hooks/lib/board'
import { ticketsOf } from '../hooks/lib/team'
import { BOARD } from './fixtures'

const board = parseBoard(BOARD, 'T', 0, 0)
test('tickets model lives in lib', () => {
  const m = buildModel({ board, team: [], me: null, filter: { app: null, who: null, mine: false, showDone: false }, filterOpen: false, selected: null, expanded: null, cols: 80 })
  expect(m.rows.map(t => t.id)).toEqual(['B2', 'B3', 'F3', 'B2b', 'F1', 'F2', 'A1', 'A2'])
  expect(offsetFor(m, 'A2', 0, 5)).not.toBeNull()
})
test('band, health, runs line builders live in lib', () => {
  expect(NARROW_COLUMNS).toBe(110)
  expect(countsOf(board)).toEqual({ open: 7, progress: 1, blocked: 1, decision: 1 })
  const band = bandLines({ watch: { level: 'green', reasons: [] }, machine: null, usage: null, relay: null, counts: countsOf(board), narrow: true, cols: 80, now: 0 })
  expect(band).toHaveLength(2)
  expect(healthLines({ usage: null, machine: null, relay: null, now: 0 }).map(l => l.key)).toContain('h:machine')
  expect(waves([{ n: 1, code: 'a', ticket: 'F1', title: 'x', after: '-', files: '-', state: '' }])).toEqual([[1]])
  expect(runLines({ id: 'RUN-0001', title: 't', done: 0, total: 1, owner: null, stages: [], planned: false, decisions: [] }, board)[0]!.key).toBe('run:RUN-0001')
  expect(isOpen(board.tickets[0]!)).toBe(true)
  expect(ticketsOf({ handle: '@asha', emails: [] }, board, null)).toBe('1 decide')
})
