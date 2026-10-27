import { atom, update } from 'claude-code'
import type { BoxProps, ButtonProps, ElementConstructor, EngineInterface, RenderElement, TextProps } from 'claude-code'
import type { Board, Member, TeamView } from '../types'
import { makeLead, openAddPerson, removeMember } from './assign'
import { ticketsOf } from './lib/team'
export { ticketsOf } from './lib/team'

// F47 team management: `t` in the Tickets tab. Who is on .skillator/team.md, what
// open tickets name them, you marked. Add and remove run ticket-meta `team`; F80: the
// lead marked, `l` makes the selected person lead (ticket-meta team lead rules on it).

const teamViewA = atom({ plugin: 'ops-board', key: 'teamView' } as const, null)

type Els = { Box: ElementConstructor<BoxProps>; Text: ElementConstructor<TextProps>; Button: ElementConstructor<ButtonProps> }

export function TeamTab($: EngineInterface, els: Els, tv: TeamView, team: Member[], board: Board | null, me: string | null, cols: number): RenderElement[] {
  const { Box, Text, Button } = els
  const out: RenderElement[] = []
  const sel = team.find(m => m.handle === tv.selected)?.handle ?? team[0]?.handle ?? null
  const setTv = (fn: (x: TeamView) => TeamView) => { void update($, teamViewA, x => (x ? fn(x) : x)) }
  const line = (hd: string, n: string, e: string, t: string) => `${hd.padEnd(9)}${n.padEnd(8)}${e.padEnd(22)}${t}`

  if (team.length > 0) out.push(<Box key="team:you"><Text dimColor>{`you: ${me ?? '- (not on the team)'}`}</Text></Box>)
  out.push(<Box key="team:head"><Text dimColor wrap="truncate-end">{line('handle', 'name', 'email', 'tickets')}</Text></Box>)
  if (team.length === 0) out.push(<Text dimColor>no .skillator/team.md yet - a adds the first person</Text>)
  for (const m of team) {
    const body = line(m.handle + ' ', (m.name ?? '') + ' ', m.emails.join(', ') + ' ', ticketsOf(m, board, me))
    const isSel = m.handle === sel
    out.push(
      <Button key={'member:' + m.handle} hotkey={!tv.confirm && isSel ? 'o' : undefined} plain onPress={() => setTv(x => ({ ...x, selected: m.handle, confirm: false }))}>
        {isSel ? <Text inverse wrap="wrap">{body}</Text> : <Text wrap="wrap">{body}</Text>}
      </Button>,
    )
  }
  out.push(<Text> </Text>)
  out.push(<Button key="team:add-row" plain onPress={() => { void openAddPerson($, 'team') }}><Text color="success">+ add person</Text></Button>)
  if (tv.confirm && sel) {
    out.push(
      <Box key="confirm" flexDirection="row" flexWrap="wrap" gap={2}>
        <Text color="warning">{`remove ${sel} from .skillator/team.md?`}</Text>
        <Button key="team:remove-yes" plain hotkey={'y'} onPress={() => {
          setTv(x => ({ ...x, confirm: false }))
          void removeMember($, sel)
        }}>Remove</Button>
        <Button key="team:remove-no" plain hotkey={'n'} onPress={() => setTv(x => ({ ...x, confirm: false }))}>Keep</Button>
      </Box>,
    )
  }
  out.push(<Text> </Text>)
  out.push(
    <Box key="team:keys" flexDirection="row" flexWrap="wrap" gap={2}>
      <Button key="team:add" plain dimColor hotkey={!tv.confirm ? 'a' : undefined} onPress={() => { void openAddPerson($, 'team') }}>add</Button>
      {sel && <Button key="team:remove" plain dimColor hotkey={!tv.confirm ? 'r' : undefined} onPress={() => setTv(x => ({ ...x, selected: sel, confirm: true }))}>remove</Button>}
      {sel && <Button key="team:lead" plain dimColor hotkey={!tv.confirm ? 'l' : undefined} onPress={() => { void makeLead($, sel) }}>make lead</Button>}
      <Button key="team:back" plain dimColor hotkey={!tv.confirm ? 't' : undefined} onPress={() => { void update($, teamViewA, () => null) }}>back to tickets</Button>
      <Text dimColor>.skillator/team.md</Text>
    </Box>,
  )
  return out
}
