import { test, expect } from 'claude-code/testing'
import { LOG_TEXT_MAX, MAX_LOG, copyText, logLines, pushLog } from '../hooks/lib/log'
import type { LogEntry } from '../hooks/lib/log'

// Log tab (design 2026-11-02): every popup is recorded, newest first, capped and
// clipped, drawn wrapped in full and copied whole. lib/log.ts is the pure part.

test('pushLog: newest first, the stamp kept, short text untouched', () => {
  let xs: LogEntry[] = []
  xs = pushLog(xs, 'first popup', 1000)
  xs = pushLog(xs, 'second popup', 2000)
  expect(xs).toEqual([{ at: 2000, text: 'second popup' }, { at: 1000, text: 'first popup' }])
})

test('pushLog: at most MAX_LOG entries, the oldest dropped', () => {
  let xs: LogEntry[] = []
  for (let i = 0; i < MAX_LOG + 5; i++) xs = pushLog(xs, 'popup ' + i, i)
  expect(xs.length).toBe(MAX_LOG)
  expect(xs[0]!.text).toBe('popup ' + (MAX_LOG + 4))
  expect(xs.at(-1)!.text).toBe('popup 5')
})

test('pushLog: text over LOG_TEXT_MAX is clipped to it with a marker', () => {
  const [e] = pushLog([], 'x'.repeat(LOG_TEXT_MAX + 1000), 7)
  expect(e!.text.length).toBe(LOG_TEXT_MAX)
  expect(e!.text.endsWith('[clipped]')).toBe(true)
  expect(e!.text.startsWith('xxxx')).toBe(true)
  const [s] = pushLog([], 'short', 7)
  expect(s!.text).toBe('short')
})

test('pushLog: pure - the list handed in is not changed', () => {
  const before: LogEntry[] = [{ at: 1, text: 'old' }]
  const after = pushLog(before, 'new', 2)
  expect(before).toEqual([{ at: 1, text: 'old' }])
  expect(after).not.toBe(before)
})

test('logLines: time first, the whole text wrapped to the width, never cut', () => {
  const text = 'a long popup that must be read in full however narrow the pane is drawn today'
  const lines = logLines([{ at: 1000, text }], 20)
  expect(lines.length).toBeGreaterThan(2)
  for (const l of lines) expect(l.text.length).toBeLessThanOrEqual(20)
  expect(lines[0]!.text.startsWith('00:00:01 ')).toBe(true)
  // unwrapping (dropping each line's 9-char time/indent prefix) gives the text back whole
  expect(lines.map(l => l.text.slice(9)).join('')).toBe(text)
  expect(lines.every(l => l.entry === 0)).toBe(true)
})

test('logLines: newlines in a popup stay line breaks; each entry keeps its index', () => {
  const lines = logLines([{ at: 0, text: 'line one\nline two' }, { at: 61_000, text: 'other' }], 40)
  const first = lines.filter(l => l.entry === 0).map(l => l.text)
  expect(first.some(t => t.includes('line one'))).toBe(true)
  expect(first.some(t => t.includes('line two'))).toBe(true)
  expect(lines.filter(l => l.entry === 1)[0]!.text.startsWith('00:01:01 ')).toBe(true)
  expect(new Set(lines.map(l => l.key)).size).toBe(lines.length)
})

test('copyText: the entry text whole, as copied', () => {
  expect(copyText({ at: 5, text: 'multi\nline\npopup' })).toBe('multi\nline\npopup')
})
