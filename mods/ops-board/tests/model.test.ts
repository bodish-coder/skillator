import { test, expect } from 'claude-code/testing'
import { buildModel, lineKey, offsetFor, toggleGroup } from '../hooks/lib/ticketsmodel'
import type { View } from '../hooks/lib/ticketsmodel'
import type { Box } from '../types'
import { bandLines, countsOf, NARROW_COLUMNS } from '../hooks/lib/bandlines'
import { healthLines } from '../hooks/lib/healthlines'
import { runLines, waves } from '../hooks/lib/runlines'
import { isOpen, parseBoard } from '../hooks/lib/board'
import { ticketsOf } from '../hooks/lib/team'
import { BOARD } from './fixtures'

const board = parseBoard(BOARD, 'T', 0, 0)
const ALL: Box[] = ['~', '%', '!', '?', ' ', '>', 'x', '-']
const view = (over: Partial<View> = {}): View => ({ board, team: [], me: null, filter: { app: null, who: null, mine: false, showDone: false },
  filterOpen: false, selected: null, expanded: null, open: [], cols: 80, ...over })
test('tickets model lives in lib', () => {
  const m = buildModel(view({ open: ALL }))
  expect(m.rows.map(t => t.id)).toEqual(['B2', 'B3', 'F3', 'B2b', 'F1', 'F2', 'A1', 'A2'])
  expect(offsetFor(m, 'A2', 0, 5)).not.toBeNull()
})

// F61: every group a header with its count; every group starts collapsed; only the rows of
// open groups are drawn; the cursor walks headers and the rows of open groups.
test('F61: groups start collapsed - headers only, every count kept, the first header selected', () => {
  const m = buildModel(view())
  expect(m.groups.map(g => [g.box, g.tickets.length, g.open])).toEqual([['~', 1, false], ['!', 1, false], ['?', 1, false], [' ', 4, false], ['>', 1, false]])
  expect(m.rows).toEqual([])
  expect(m.items).toEqual(['head:~', 'head:!', 'head:?', 'head: ', 'head:>'])
  expect(m.selected).toBe('head:~')
  expect(m.ticket).toBeNull()
  expect(m.lines.filter(l => l.key.startsWith('row:'))).toEqual([])
  expect(m.count.text).toBe('7 open ●1 ●1 ●1 ●4 ●1 · 9 done hidden')     // the count line is not the view's
})
test('F61: an open group draws its rows; items run header, its rows, next header', () => {
  const m = buildModel(view({ open: [' '] }))
  expect(m.rows.map(t => t.id)).toEqual(['B2b', 'F1', 'F2', 'A1'])
  expect(m.items).toEqual(['head:~', 'head:!', 'head:?', 'head: ', 'B2b', 'F1', 'F2', 'A1', 'head:>'])
  expect(m.groups.find(g => g.box === ' ')!.open).toBe(true)
  expect(m.lines.map(l => l.key).filter(k => /^(head|row):/.test(k)))
    .toEqual(['head:~', 'head:!', 'head:?', 'head: ', 'row:B2b', 'row:F1', 'row:F2', 'row:A1', 'head:>'])
})
test('F61: a selected ticket in a collapsed group shows as its header; opening the group lands back on it', () => {
  const closed = buildModel(view({ selected: 'F1' }))
  expect(closed.selected).toBe('head: ')
  expect(closed.ticket).toBeNull()
  const open = buildModel(view({ selected: 'F1', open: [' '] }))
  expect(open.selected).toBe('F1')
  expect(open.ticket).toBe('F1')
  expect(buildModel(view({ selected: 'head:!' })).selected).toBe('head:!')
  // a header gone (done hidden) or a ticket gone: the first item
  expect(buildModel(view({ selected: 'head:x' })).selected).toBe('head:~')
  expect(buildModel(view({ selected: 'Z9' })).selected).toBe('head:~')
})
test('F61: toggleGroup adds and removes one box; a filtered view keeps its groups with filtered counts', () => {
  expect(toggleGroup([], ' ')).toEqual([' '])
  expect(toggleGroup([' ', '~'], ' ')).toEqual(['~'])
  const f = buildModel(view({ filter: { app: null, who: '@asha', mine: false, showDone: false } }))
  expect(f.groups.map(g => [g.box, g.tickets.length])).toEqual([['?', 1]])
  expect(f.items).toEqual(['head:?'])
})
test('F61: offsetFor keeps a header in view too', () => {
  const m = buildModel(view({ open: ALL }))
  expect(offsetFor(m, 'head:>', 0, 5)).not.toBeNull()
  expect(offsetFor(m, 'head:~', 0, 5)).toBeNull()
  expect(lineKey('head:~')).toBe('head:~')
  expect(lineKey('F1')).toBe('row:F1')
})
test('band, health, runs line builders live in lib', () => {
  expect(NARROW_COLUMNS).toBe(110)
  expect(countsOf(board)).toEqual({ open: 7, progress: 1, testing: 0, blocked: 1, decision: 1 })
  const band = bandLines({ watch: { level: 'green', reasons: [] }, machine: null, usage: null, relay: null, counts: countsOf(board), narrow: true, cols: 80, now: 0 })
  expect(band).toHaveLength(2)
  expect(healthLines({ usage: null, machine: null, relay: null, now: 0 }).map(l => l.key)).toContain('h:machine')
  expect(waves([{ n: 1, code: 'a', ticket: 'F1', title: 'x', after: '-', files: '-', state: '' }])).toEqual([[1]])
  expect(runLines({ id: 'RUN-0001', title: 't', done: 0, total: 1, owner: null, stages: [], planned: false, decisions: [] }, board)[0]!.key).toBe('run:RUN-0001')
  expect(isOpen(board.tickets[0]!)).toBe(true)
  expect(ticketsOf({ handle: '@asha', emails: [] }, board, null)).toBe('1 decide')
})
