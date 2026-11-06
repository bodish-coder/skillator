import { atom, read, update } from 'claude-code'
import type { BoxProps, ButtonProps, ElementConstructor, EngineInterface, RenderElement, TextProps, ToastOptions } from 'claude-code'
import type { LogEntry } from '../types'
import { copyText, logLines, pushLog } from './lib/log'

// The Log tab (design 2026-11-02): every popup the board shows, recorded so it
// can be read in full and copied. say() is the one place a popup is made: it
// records, then toasts - the 8 hook files say through it, never $.ui.toast
// directly. The log is session state ($.state), never a repo file: popups can
// carry machine facts and paths. Session only; nothing persists.

const logA = atom({ plugin: 'ops-board', key: 'log' } as const, [])
const actionFocusA = atom({ plugin: 'ops-board', key: 'actionFocus' } as const, null)

// Say a popup: record it in the log, then toast it. The record is
// fire-and-forget - a failed log update never swallows the popup itself.
export function say($: EngineInterface, text: string, opts?: ToastOptions): void {
  void update($, logA, xs => pushLog(xs, text, Date.now())).catch(() => {})
  $.ui.toast(text, opts)
}

export async function readLog($: EngineInterface): Promise<LogEntry[]> {
  return read($, logA)
}

type Els = { Box: ElementConstructor<BoxProps>; Text: ElementConstructor<TextProps>; Button: ElementConstructor<ButtonProps> }

// A copy, said either way (the saying is itself logged, as every popup is).
function copyEntry($: EngineInterface, entry: LogEntry, surface: Parameters<EngineInterface['ui']['copy']>[0]['surface']): void {
  void $.ui.copy({ text: copyText(entry), surface }).then(
    r => say($, r.isCopied ? '✓ log entry copied' : `■ copy failed (${r.reason})`),
    () => say($, '■ copy failed'),
  )
}

// The tab body: entries newest first, each a Button drawing its whole text
// wrapped (never truncated) - pressing it copies that entry. The pane's own
// scroll windows the list; y copies the selected entry, C clears the log.
export async function LogTab($: EngineInterface, els: Els, cols: number, ascii: boolean): Promise<RenderElement[]> {
  const { Box, Text, Button } = els
  const entries = await read($, logA)
  const focus = await read($, actionFocusA)
  const current = entries.findIndex((_, i) => 'log:' + i === focus)
  const sel = current >= 0 ? current : 0
  const out: RenderElement[] = []
  if (!entries.length) {
    out.push(<Box key="log:empty"><Text dimColor>{'no popups yet - what the board says in a popup lands here, in full'}</Text></Box>)
  }
  const lines = logLines(entries, ascii ? cols - 2 : cols)
  entries.forEach((entry, i) => {
    const mine = lines.filter(l => l.entry === i).map(l => l.text)
    const text = ascii && i === sel ? ['> ' + mine[0]!, ...mine.slice(1)].join('\n') : mine.join('\n')
    out.push(
      <Button key={'log:' + i} plain onPress={press => copyEntry($, entry, press.surface)}>
        <Text wrap="wrap" inverse={!ascii && i === sel}>{text}</Text>
      </Button>,
    )
  })
  out.push(<Text> </Text>)
  out.push(
    <Box key="keys" flexDirection="row" flexWrap="wrap" gap={2}>
      <Text dimColor>{'enter copy'}</Text>
      <Button key="key:log-copy" plain dimColor hotkey="y" onPress={press => { const e = entries[sel]; if (e) copyEntry($, e, press.surface) }}>copy</Button>
      <Button key="key:log-clear" plain dimColor hotkey="c" onPress={() => { void update($, logA, () => []) }}>clear</Button>
    </Box>,
  )
  return out
}
