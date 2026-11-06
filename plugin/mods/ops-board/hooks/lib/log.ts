import type { LogEntry } from '../../types'

export type { LogEntry }

// The Log tab's data (design 2026-11-02): every popup the pane shows, kept in
// $.state like every other tab (B4). Pure: hooks/logtab.tsx records through
// pushLog and draws through logLines; nothing here touches the engine.

export const MAX_LOG = 100              // entries kept, newest first
export const LOG_TEXT_MAX = 4000        // one entry's text, clipped past this
const CLIP_MARK = '… [clipped]'

// A popup recorded: the text clipped at LOG_TEXT_MAX (marked when clipped),
// capped at MAX_LOG entries, newest first. The list handed in is not changed.
export function pushLog(entries: LogEntry[], text: string, at: number): LogEntry[] {
  const clipped = text.length > LOG_TEXT_MAX ? text.slice(0, LOG_TEXT_MAX - CLIP_MARK.length) + CLIP_MARK : text
  return [{ at, text: clipped }, ...entries].slice(0, MAX_LOG)
}

export type LogLine = { key: string; text: string; entry: number }

const timeOf = (at: number) => new Date(at).toISOString().slice(11, 19)   // HH:MM:SS, UTC

// The display lines of every entry, newest first: the time, then the whole
// text wrapped at cols - hard-wrapped, never truncated, so a popup can be
// read in full. Newlines in the text stay line breaks; continuation lines
// align under the text. entry is the entry's index in entries.
export function logLines(entries: LogEntry[], cols: number): LogLine[] {
  const width = Math.max(10, cols)
  const out: LogLine[] = []
  entries.forEach((e, entry) => {
    const head = timeOf(e.at) + ' '
    const indent = ' '.repeat(head.length)
    const room = Math.max(1, width - head.length)
    let first = true
    let n = 0
    const push = (chunk: string) => {
      out.push({ key: `log:${entry}:${n++}`, text: (first ? head : indent) + chunk, entry })
      first = false
    }
    for (const seg of e.text.split('\n')) {
      let rest = seg
      let chunks = 0
      while (rest.length > room) { push(rest.slice(0, room)); rest = rest.slice(room); chunks++ }
      if (rest || !chunks) push(rest)
    }
  })
  return out
}

// What a copy of an entry puts on the clipboard: its text, whole.
export const copyText = (entry: LogEntry): string => entry.text
