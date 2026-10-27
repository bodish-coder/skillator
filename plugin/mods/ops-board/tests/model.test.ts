import { test, expect } from 'claude-code/testing'
import { buildModel, lineKey, offsetFor, toggleGroup, packRows, chromeRows, windowOf, headText, rowText, UNI, ASCII } from '../hooks/lib/ticketsmodel'
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
  filterOpen: false, selected: null, expanded: null, open: [], cols: 80, ascii: false, rows: null, ...over })

test('F111 packRows: whole items and gaps', () => {
  expect(packRows([7, 9, 6, 10, 8, 5], 40, 1)).toBe(2)
  expect(packRows([7, 9, 6, 10, 8, 5], 120, 1)).toBe(1)
  expect(packRows([7, 9, 6, 10, 8, 5], 20, 1)).toBe(3)
  expect(packRows([50], 40, 1)).toBe(1)
  expect(packRows([], 40, 1)).toBe(0)
})
test('F111 windowOf: list yields rows and keeps selection visible', () => {
  const board = parseBoard(Array.from({ length: 30 }, (_, i) => `- [ ] F${i + 1} — t${i + 1}`).join('\n'), '/r/T', 1, 1)
  const v = view({ board, selected: 'F1', open: [' '], rows: 14 })
  const m = buildModel(v)
  expect(windowOf(m, null)).toEqual({ start: 0, end: 31, above: 0, below: 0 })
  expect(windowOf(m, 6)).toEqual({ start: 0, end: 5, above: 0, below: 26 })
  const w = windowOf(buildModel({ ...v, selected: 'F20' }), 6)
  expect(w.start).toBeGreaterThan(0)
  expect(w.end - w.start).toBe(4)
  expect(w.above + w.below + 4).toBe(31)
  expect(w.start <= 20 && 20 < w.end).toBe(true)
  expect(windowOf(buildModel({ ...v, selected: 'F30' }), 6)).toEqual({ start: 26, end: 31, above: 26, below: 0 })
})
test('F111 headText and rowText: Rails, Mono and owner threshold', () => {
  const g = { box: '~' as const, title: 'IN PROGRESS', tickets: [], open: true }
  expect(headText(g, UNI, false)).toBe('IN PROGRESS  0')
  expect(headText({ ...g, open: false, title: 'PENDING' }, UNI, false)).toBe('PENDING  0  ▸')
  expect(headText(g, ASCII, true)).toBe('IN PROGRESS (0)')
  expect(headText({ ...g, open: false, title: 'PENDING' }, ASCII, true)).toBe('PENDING (0) +')
  const t = parseBoard('- [~] F101 — Marathon on hosts with no Workflow tool [owner: @sher]', '/r/T', 1, 1).tickets[0]!
  expect(rowText(t, 40, UNI, false, false)).toEqual({ text: ' F101  Marathon on hosts with no Work…', owner: null })
  expect(rowText(t, 60, UNI, false, false).owner).toBe('@sher')
  expect(rowText(t, 60, UNI, false, false).text.length).toBe(58)
  expect(rowText(t, 40, ASCII, true, false).text).toMatch(/^  wip  F101 /)
  expect([...rowText(t, 40, ASCII, true, false).text].every(c => c.charCodeAt(0) < 128)).toBe(true)
})
test('F111 chromeRows at 40 and 120 columns', () => {
  const v = view({ board: null, cols: 40, rows: 14 })
  const m = buildModel(v)
  expect(chromeRows(v, m, UNI).tabs).toBe(2)
  expect(chromeRows(v, m, UNI).keys).toBe(2)
  expect(chromeRows({ ...v, cols: 120 }, m, UNI).total).toBe(6)
})

test('F111 weighted raw lines fit the window; chips never start without their row', () => {
  const board = parseBoard(Array.from({ length: 12 }, (_, i) => `- [ ] F${i + 1} — ${'long title '.repeat(6)} [owner: @sher]`).join('\n'), '/r/T', 1, 1)
  for (const selected of ['F1', 'F3', 'F8', 'F12']) {
    const m = buildModel(view({ board, selected, expanded: 'F3', open: [' '], cols: 40 }))
    const list = m.lines.slice(3, -3).flatMap(l => Array.from({ length: l.rows }, () => ({ key: l.key, rows: 1 })))
    const w = windowOf(m, 6)
    const drawn = list.slice(w.start, w.end)
    expect(drawn.some(l => l.key === 'row:' + selected)).toBe(true)
    expect(drawn[0]!.key).toMatch(/^(row|head):/)
    expect(drawn.reduce((n, l) => n + l.rows, 0) + (w.above ? 1 : 0) + (w.below ? 1 : 0)).toBeLessThanOrEqual(6)
    expect(w.above + w.below + drawn.reduce((n, l) => n + l.rows, 0)).toBe(list.reduce((n, l) => n + l.rows, 0))
  }
})

test('A161: physical-row windows include every slice of oversized raw text', () => {
  const board = parseBoard('- [ ] F1 — ' + 'long detail '.repeat(50), '/r/T', 1, 1)
  const m = buildModel(view({ board, selected: 'F1', expanded: 'F1', open: [' '], cols: 40, rows: 14 }))
  const list = m.lines.slice(3, -3).flatMap(l => Array.from({ length: l.rows }, () => l.key))
  expect(list.filter(k => k === 'raw:F1').length).toBeGreaterThan(6)
  const seen = new Set<number>()
  for (let offset = 0; offset < list.length; offset++) {
    const w = windowOf(m, 6, offset)
    expect(w.end - w.start + Number(w.above > 0) + Number(w.below > 0)).toBeLessThanOrEqual(6)
    for (let row = w.start; row < w.end; row++) seen.add(row)
  }
  expect(seen.size).toBe(list.length)
  expect(windowOf(m, null).end).toBe(list.length)
})
test('F111 unread count participates in tab wrapping', () => {
  const v = view({ cols: 60, ascii: true, unread: 3 })
  expect(chromeRows(v, buildModel(v), ASCII).tabs).toBe(2)
})
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
  expect(runLines({ id: 'RUN-0001', title: 't', done: 0, total: 1, owner: null, stages: [], planned: false, decisions: [],
    mode: null, driver: null, flights: [], phases: null }, board)[0]!.key).toBe('run:RUN-0001')
  expect(isOpen(board.tickets[0]!)).toBe(true)
  expect(ticketsOf({ handle: '@asha', emails: [] }, board, null)).toBe('1 decide')
})
