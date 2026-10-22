import { atom, read, update } from 'claude-code'
import type { BoxProps, ButtonProps, Color, ElementConstructor, EngineInterface, RenderElement, RenderInput,
  SelectProps, TextProps } from 'claude-code'
import type { Filter } from '../types'
import { STATE_COLOR } from './lib/board'
import { buildModel, chipsOf, headKey, isDecidable, toggleGroup } from './lib/ticketsmodel'
import type { Model, View } from './lib/ticketsmodel'
export { buildModel, lineKey, offsetFor } from './lib/ticketsmodel'
export type { View, Model } from './lib/ticketsmodel'
import { openAssign, renderForm, runDecided } from './assign'
import { paint } from './paint'
import { TeamTab } from './teamview'
import { HealthTab, readHealth } from './health'
import { pollRuns, readRuns, RunsTab } from './runstab'
import { AgentsTab, pollAgents, readAgents, WorkflowsTab } from './agentstab'

// The ops board pane (design §5): tab bar, the Tickets tab with its filter row,
// state shown by colour (a `●` per row, headings in the same colour), footer keys.

export const PANE_ID = 'ops-board'
export const PANE_TITLE = 'ops board'

export type Tab = 'tickets' | 'runs' | 'health' | 'agents' | 'workflows'
// Each file names the atoms it reads or writes as its own consts: the engine's scan
// lists state access from those, not from an import (register.tsx repeats them).
const boardA = atom({ plugin: 'ops-board', key: 'board' } as const, null)
const teamA = atom({ plugin: 'ops-board', key: 'team' } as const, [])
const meA = atom({ plugin: 'ops-board', key: 'me' } as const, null)
const tabA = atom({ plugin: 'ops-board', key: 'tab' } as const, 'tickets')
const selectedA = atom({ plugin: 'ops-board', key: 'selected' } as const, null)
const expandedA = atom({ plugin: 'ops-board', key: 'expanded' } as const, null)
const filterA = atom({ plugin: 'ops-board', key: 'filter' } as const, { app: null, who: null, mine: false, showDone: false })
const filterOpenA = atom({ plugin: 'ops-board', key: 'filterOpen' } as const, false)
const teamViewA = atom({ plugin: 'ops-board', key: 'teamView' } as const, null)
// F61: the boxes of the open groups, this session; empty = every group collapsed. Only
// the set is held, never rows: the board's own value stays within $.state's cap (B4).
const openA = atom({ plugin: 'ops-board', key: 'openGroups' } as const, [])

const CHIP_KEY: Color = 'permission'
const CHIP_VALUE: Color = 'suggestion'

const cut = (s: string, room: number) => s.length <= room ? s : s.slice(0, Math.max(1, room - 1)) + '…'

type Els = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
  Select: ElementConstructor<SelectProps> | null
}

// The Tickets tab body: filter row, groups, count line and keys. Handlers write state.
export function TicketsTab($: EngineInterface, els: Els, v: View, m: Model): RenderElement[] {
  const { Box, Text, Button, Select } = els
  const out: RenderElement[] = []
  const f = v.filter
  const hasTeam = v.team.length > 0
  const setFilter = (fn: (f: Filter) => Filter) => { void update($, filterA, fn) }

  // filter row
  if (v.filterOpen && Select) {
    const apps = [...new Set((v.board?.tickets ?? []).flatMap(t => t.apps))].sort()
    out.push(
      <Box key="filters" flexDirection="row" gap={2}>
        <Select key="sel:app" label="app" value={f.app ?? 'all'}
          options={[{ value: 'all', label: 'all' }, ...apps.map(a => ({ value: a, label: a }))]}
          onSelect={val => setFilter(x => ({ ...x, app: val === 'all' ? null : val }))} />
        {hasTeam && <Select key="sel:who" label="who" value={f.who ?? 'all'}
          options={[{ value: 'all', label: 'all' }, ...v.team.map(p => ({ value: p.handle, label: p.handle }))]}
          onSelect={val => setFilter(x => ({ ...x, who: val === 'all' ? null : val, mine: false }))} />}
        {hasTeam && v.me && <Button key="key:mine" plain onPress={() => setFilter(x => ({ ...x, mine: !x.mine, who: null }))}>
          {(f.mine ? '[x]' : '[ ]') + ' mine'}</Button>}
      </Box>,
    )
  } else {
    out.push(
      <Box key="filters"><Text wrap="truncate-end">
        <Text dimColor>app</Text>{` ${f.app ?? 'all'} ▾  `}
        {hasTeam && <Text dimColor>who</Text>}{hasTeam ? ` ${f.mine ? 'me' : f.who ?? 'all'} ▾  ${f.mine ? '[x]' : '[ ]'} mine  ` : ''}
        {`${f.showDone ? '[x]' : '[ ]'} done`}
      </Text></Box>,
    )
  }
  out.push(<Text> </Text>)

  if (!v.board || v.board.error) {
    out.push(<Text dimColor>{v.board?.error ?? 'reading TICKETS.md…'}</Text>)
  } else if (m.rows.length === 0) {
    out.push(<Text dimColor>{m.filterActive ? 'no ticket matches the filter' : 'no open tickets'}</Text>)
  }

  const shownIds = new Set(m.rows.map(t => t.id))
  for (const g of m.groups) {
    // F61: a header is a Button - Enter under the focus or a click opens or closes it.
    const hk = headKey(g.box)
    const head = cut(`${g.open ? '▾' : '▸'} ${g.title} (${g.tickets.length})`, v.cols - 1)
    out.push(
      <Button key={hk} plain onPress={() => {
        // the header stands for a ticket hidden in it (moved there by an edit): opening lands on it
        void update($, selectedA, x => (hk === m.selected && x && !x.startsWith('head:') && g.tickets.some(t => t.id === x) ? x : hk))
        void update($, openA, x => toggleGroup(x, g.box))
      }}>
        <Text color={paint(g.box)} bold inverse={hk === m.selected}>{head}</Text>
      </Button>,
    )
    if (!g.open) continue
    for (const t of g.tickets) {
      const nested = !!t.parent && shownIds.has(t.parent) && g.tickets.some(p => p.id === t.parent)
      const lead = nested ? '  ' : ''
      const tail = t.parent && !nested ? ` (${t.parent})` : ''
      const room = v.cols - lead.length - 2 - t.id.length - 2 - tail.length
      const body = ` ${t.id}  ${cut(t.title, Math.max(4, room))}${tail}`
      const isSel = t.id === m.selected
      out.push(
        <Button key={'row:' + t.id} plain onPress={() => {
          void update($, selectedA, () => t.id)
          void update($, expandedA, x => (x === t.id ? null : t.id))
        }}>
          {lead}
          <Text color={paint(t.box)}>●</Text>
          {isSel ? <Text inverse>{body.padEnd(Math.max(body.length, v.cols - lead.length - 1))}</Text>
            : <Text dimColor={STATE_COLOR[t.box] === 'dim'}>{body}</Text>}
        </Button>,
      )
      if (chipsOf(t)) {
        const parts: (RenderElement | string)[] = ['    ']
        const chip = (k: string, val: string) => [<Text color={CHIP_KEY}>{k + ':'}</Text>, <Text color={CHIP_VALUE}>{val}</Text>]
        const groupsOf: (RenderElement | string)[][] = []
        if (t.apps.length) groupsOf.push(t.apps.flatMap((a, i) => [...(i ? [' '] : []), ...chip('app', a)]))
        if (t.owner) groupsOf.push(chip('owner', t.owner))
        if (t.decide) groupsOf.push(chip('decide', t.decide))
        if (t.by.length) groupsOf.push(chip('by', t.by.join(' ')))
        if (t.session) groupsOf.push([<Text dimColor>{t.session}</Text>])
        groupsOf.forEach((gr, i) => { if (i) parts.push('  '); parts.push(...gr) })
        out.push(
          <Box key={'chips:' + t.id} flexDirection="row" gap={3}>
            <Text wrap="truncate-end">{parts}</Text>
            {isDecidable(t) && <Button key={'decided:' + t.id} onPress={() => { void runDecided($, t.id) }}>Decided</Button>}
          </Box>,
        )
      }
      if (v.expanded === t.id) {
        out.push(<Box key={'raw:' + t.id}><Text dimColor>{`    - [${t.box}] ${t.line}`}</Text></Box>)
      }
    }
  }

  out.push(<Text> </Text>)
  const c = m.count
  out.push(m.filterActive
    ? <Box key="count"><Text dimColor>{c.text}</Text></Box>
    : <Box key="count"><Text>
        <Text dimColor>{`${c.open} open`}</Text>
        {c.dots.flatMap(d => [' ', <Text color={paint(d.box)}>{'●' + d.n}</Text>])}
        {f.showDone
          ? (c.closed.length ? [<Text dimColor> ·</Text>, ...c.closed.flatMap(d => [' ', <Text color={paint(d.box)}>{'●' + d.n}</Text>]), <Text dimColor> closed</Text>] : [])
          : (c.closed.length ? [<Text dimColor>{` · ${c.closed.reduce((s, d) => s + d.n, 0)} done hidden`}</Text>] : [])}
      </Text></Box>)
  out.push(
    <Box key="keys" flexDirection="row" gap={2}>
      <Text dimColor>↑↓ move</Text>
      <Button key="key:assign" plain dimColor hotkey="a" onPress={() => { void openAssign($, 'owner', m.ticket) }}>assign</Button>
      <Button key="key:decide" plain dimColor hotkey="d" onPress={() => { void openAssign($, 'decide', m.ticket) }}>decide</Button>
      <Button key="key:filter" plain dimColor hotkey="f" onPress={() => { void update($, filterOpenA, x => !x) }}>filter</Button>
      <Button key="key:done" plain dimColor hotkey="x" onPress={() => setFilter(x => ({ ...x, showDone: !x.showDone }))}>done</Button>
      <Button key="key:team" plain dimColor hotkey="t" onPress={() => { void update($, teamViewA, () => ({ selected: null, confirm: false })) }}>team</Button>
    </Box>,
  )
  return out
}

export async function readView($: EngineInterface, cols: number): Promise<View> {
  return {
    board: await read($, boardA), team: await read($, teamA), me: await read($, meA),
    filter: await read($, filterA), filterOpen: await read($, filterOpenA),
    selected: await read($, selectedA), expanded: await read($, expandedA), open: await read($, openA), cols,
  }
}

const TABS: { id: Tab; label: string }[] = [{ id: 'tickets', label: 'Tickets' }, { id: 'runs', label: 'Runs' },
  { id: 'health', label: 'Health' }, { id: 'agents', label: 'Agents' }, { id: 'workflows', label: 'Workflows' }]

export async function renderPane($: EngineInterface, e: RenderInput<'Pane'>): Promise<RenderElement> {
  const t = $.ui.resolve(e)
  const els: Els = { Box: t.Box, Text: t.Text, Button: t.Button, Select: e.surface !== 'mobile' && 'Select' in t ? t.Select : null }
  const { Box, Text, Button } = els
  const cols = Math.max(20, e.props.bodyColumns)
  const tab = await read($, tabA)
  const bar = (
    <Box key="tabs" flexDirection="row" gap={1}>
      {TABS.map(x => (
        <Button key={'tab:' + x.id} variant={x.id === tab ? 'primary' : undefined} dimColor={x.id !== tab}
          onPress={() => {
            void update($, tabA, () => x.id)
            if (x.id === 'runs') void pollRuns($).catch(() => {})       // read on entering the tab
            if (x.id === 'agents') void pollAgents($).catch(() => {})   // read on entering the tab
          }}>{x.label}</Button>
      ))}
    </Box>
  )
  if (tab === 'health') {
    return (
      <Box flexDirection="column">
        {bar}
        <Text> </Text>
        {HealthTab(els, await readHealth($))}
      </Box>
    )
  }
  if (tab === 'agents' || tab === 'workflows') {
    const v = await readAgents($, cols)
    return (
      <Box flexDirection="column">
        {bar}
        <Text> </Text>
        {tab === 'agents' ? AgentsTab(els, v) : WorkflowsTab(els, v)}
      </Box>
    )
  }
  if (tab === 'runs') {
    return (
      <Box flexDirection="column">
        {bar}
        <Text> </Text>
        {RunsTab($, els, await readRuns($, cols))}
      </Box>
    )
  }
  // B5: an assign / decide / add person form up draws in place of the view it came
  // from (Tickets or Team); Esc or Cancel brings that view back.
  const form = await renderForm($, e)
  if (form) return form
  const v = await readView($, cols)
  const tv = await read($, teamViewA)
  if (tv) {
    return (
      <Box flexDirection="column">
        {bar}
        {TeamTab($, els, tv, v.team, v.board, v.me, cols)}
      </Box>
    )
  }
  const m = buildModel(v)
  return (
    <Box flexDirection="column">
      {bar}
      {TicketsTab($, els, v, m)}
    </Box>
  )
}
