import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, RenderElement, RenderInput } from 'claude-code'
import { bandSegs, countsOf, NARROW_COLUMNS } from './lib/bandlines'
import type { BandInput, Seg } from './lib/bandlines'
export { bandLines, bandSegs, countsOf, NARROW_COLUMNS, statusText } from './lib/bandlines'
export type { BandInput, Counts, Seg } from './lib/bandlines'

// F48, design §7: the band above the prompt - always on, green when fine - the
// narrow two-line fold, the notes under it, and the status line's text.

const machineA = atom({ plugin: 'ops-board', key: 'machine' } as const, null)
const usageA = atom({ plugin: 'ops-board', key: 'usage' } as const, null)
const watchA = atom({ plugin: 'ops-board', key: 'watch' } as const, { level: 'green', reasons: [] })
const notesA = atom({ plugin: 'ops-board', key: 'notes' } as const, [])
const relayA = atom({ plugin: 'ops-board', key: 'relay' } as const, null)
const boardA = atom({ plugin: 'ops-board', key: 'board' } as const, null)
const narrowA = atom({ plugin: 'ops-board', key: 'narrow' } as const, false)
const meA = atom({ plugin: 'ops-board', key: 'me' } as const, null)
const sessionA = atom({ plugin: 'ops-board', key: 'session' } as const, null)

// The AbovePrompt hook's body: the band, then the notes, each with its own [ ok ].
export async function renderBand($: EngineInterface, e: RenderInput<'AbovePrompt'>): Promise<RenderElement> {
  const { Box, Text, Button } = $.ui.resolve(e)
  const cols = Math.max(20, e.props.bodyColumns)
  const narrow = (await read($, narrowA)) || (e.viewport !== undefined && e.viewport.columns < NARROW_COLUMNS)
  const v: BandInput = {
    watch: await read($, watchA), machine: await read($, machineA), usage: await read($, usageA),
    relay: await read($, relayA), counts: countsOf(await read($, boardA)), narrow, cols, now: await $.clock.now(),
    me: await read($, meA), session: await read($, sessionA),
  }
  const notes = await read($, notesA)
  const seg = (s: Seg) => <Text color={s.color} dimColor={s.dim} inverse={s.inverse}>{s.text}</Text>
  const lines = bandSegs(v).map((l, i) => (
    <Box key={'line:' + i}><Text wrap={v.watch.level === 'red' ? 'wrap' : 'truncate-end'}>{l.map(seg)}</Text></Box>
  ))
  const noteEls = notes.map((n, i) => {
    const rows = n.split('\n')
    const head = rows[0] ?? ''
    const color: Color | undefined = head.startsWith('✓') ? 'success' : head.startsWith('▲') ? 'warning' : head.startsWith('■') ? 'error' : undefined
    return (
      <Box key={'note:' + i} flexDirection="row" gap={2}>
        <Box flexDirection="column">
          <Text wrap="wrap"><Text color={color}>{head.slice(0, 1)}</Text>{head.slice(1)}</Text>
          {rows.slice(1).map(r => <Text dimColor={r.startsWith('  ') && !r.startsWith('    ')} wrap="truncate-end">{r}</Text>)}
        </Box>
        <Button key={'ok:' + i} onPress={() => { void update($, notesA, xs => xs.filter((_, j) => j !== i)) }}>ok</Button>
      </Box>
    )
  })
  return <Box flexDirection="column">{lines}{noteEls}</Box>
}
