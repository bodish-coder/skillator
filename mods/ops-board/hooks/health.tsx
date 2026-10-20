import { atom, read } from 'claude-code'
import type { BoxProps, ElementConstructor, EngineInterface, RenderElement, TextProps } from 'claude-code'
import { healthLines } from './lib/healthlines'
import type { HealthView } from './lib/healthlines'
export { healthLines, resetsText } from './lib/healthlines'
export type { HealthView } from './lib/healthlines'

// F49, design §8: the Health tab (mocks m-health, m-health-hold). Usage is this
// session's own reading (register.tsx polls it; nothing here polls), each figure with
// its age and marked stale past 15 minutes; the hold decision is relay-morpheus's own
// (`chain decide --level`, run by register.tsx on the same line shown here); credit is
// not available on this host, spend is said apart; machine words agree with colour.

const usageA = atom({ plugin: 'ops-board', key: 'usage' } as const, null)
const machineA = atom({ plugin: 'ops-board', key: 'machine' } as const, null)
const relayA = atom({ plugin: 'ops-board', key: 'relay' } as const, null)

export async function readHealth($: EngineInterface): Promise<HealthView> {
  return { usage: await read($, usageA), machine: await read($, machineA), relay: await read($, relayA), now: await $.clock.now() }
}

type Els = { Box: ElementConstructor<BoxProps>; Text: ElementConstructor<TextProps> }

export function HealthTab(els: Els, v: HealthView): RenderElement[] {
  const { Box, Text } = els
  return healthLines(v).map(l => l.key
    ? <Box key={l.key}><Text wrap="truncate-end">{l.segs.map(s => <Text color={s.color} dimColor={s.dim} bold={s.bold}>{s.text}</Text>)}</Text></Box>
    : <Text> </Text>)
}
