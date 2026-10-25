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
import { openReconcile, renderReconcile } from './reconcile'
import { paint } from './paint'
import { TeamTab } from './teamview'
import { HealthTab, readHealth } from './health'
import { EngageConfirm, openRuns, pollRuns, readRuns, RunsTab } from './runstab'
import { runStatus, RUNS_SECTIONS, sectionHead, sectionStatus, statusColor } from './lib/runlines'
import { workflowStatus } from './lib/agents'
import { AgentsTab, pollAgents, readAgents, WorkflowsTab } from './agentstab'
import { enterMessages, MessagesTab, renderSetup, unreadOf } from './messagestab'
import { enterRun, isRunFormUp, RunTab } from './runtab'
import { enterExplorer, ExplorerTab, readExplorer } from './explorertab'

// The ops board pane (design §5): tab bar, the Tickets tab with its filter row,
// state shown by colour (a `●` per row, headings in the same colour), footer keys.

export const PANE_ID = 'ops-board'
export const PANE_TITLE = 'ops board'

// F76: one tab, id 'runs', labelled Workflows (owner: relay runs and workflows are one thing):
// a Runs section and a Workflows section. /ops workflows opens it; /ops runs is an alias.
export type Tab = 'tickets' | 'runs' | 'health' | 'messages' | 'agents' | 'explorer' | 'run'
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
// F76: the Workflows tab's open sections (Runs, Workflows), this session; both start open.
const runsOpenA = atom({ plugin: 'ops-board', key: 'runsOpen' } as const, ['runs', 'workflows'])

const CHIP_KEY: Color = 'permission'
const CHIP_VALUE: Color = 'suggestion'

const cut = (s: string, room: number) => s.length <= room ? s : s.slice(0, Math.max(1, room - 1)) + '…'

type Els = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
  Select: ElementConstructor<SelectProps> | null
  canType?: boolean       // the surface draws an Input (F77's typed Ticket field)
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
  } else if (!m.groups.length) {   // F61: m.rows holds only open groups' rows; test the groups
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
      <Button key="key:assign" plain dimColor hotkey="a" onPress={() => { void openAssign($, 'owner', m.ticket, els.canType) }}>assign</Button>
      <Button key="key:decide" plain dimColor hotkey="d" onPress={() => { void openAssign($, 'decide', m.ticket, els.canType) }}>decide</Button>
      <Button key="key:filter" plain dimColor hotkey="f" onPress={() => { void update($, filterOpenA, x => !x) }}>filter</Button>
      <Button key="key:done" plain dimColor hotkey="x" onPress={() => setFilter(x => ({ ...x, showDone: !x.showDone }))}>done</Button>
      <Button key="key:team" plain dimColor hotkey="t" onPress={() => { void update($, teamViewA, () => ({ selected: null, confirm: false })) }}>team</Button>
      <Button key="key:reconcile" plain dimColor hotkey="c" onPress={() => { void openReconcile($) }}>reconcile</Button>
      {/* F78: register.tsx takes this press (ui.press) - the forced poll lives there */}
      <Button key="key:refresh" plain dimColor hotkey="r" onPress={() => {}}>refresh</Button>
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

const TABS: { id: Tab; label: string }[] = [{ id: 'tickets', label: 'Tickets' }, { id: 'runs', label: 'Workflows' },
  { id: 'health', label: 'Health' }, { id: 'messages', label: 'Messages' }, { id: 'agents', label: 'Agents' },
  { id: 'explorer', label: 'Explorer' },   // F75: git-tracked files and recent commits (explorertab.tsx)
  { id: 'run', label: 'Run' }]   // F79: the repo's entry points (runtab.tsx) - not Workflows (id 'runs')

// F76: the Workflows tab (id 'runs') - a Runs section (relay runs, F50) and a Workflows section (F53),
// each a header Button with its count that Enter or a click opens and closes, as F61's
// status groups; an open section draws its body as the old tab did.
async function RunsAndWorkflows($: EngineInterface, els: Els, cols: number): Promise<RenderElement[]> {
  const { Text, Button } = els
  const open = await read($, runsOpenA)
  const runs = await readRuns($, cols)
  const agents = await readAgents($, cols)
  const shown = openRuns(runs.runs)
  const out: RenderElement[] = []
  for (const sec of RUNS_SECTIONS) {
    const on = open.includes(sec)
    const n = sec === 'runs' ? shown.length : agents.workflows.length
    // F76: the header in the colour of the most pressing status under it, as a ticket group's
    const st = sectionStatus(sec === 'runs' ? shown.map(runStatus) : agents.workflows.map(r => workflowStatus(agents.agents, r)))
    if (sec !== RUNS_SECTIONS[0]) out.push(<Text> </Text>)
    out.push(
      <Button key={'sect:' + sec} plain onPress={() => { void update($, runsOpenA, x => toggleGroup(x, sec)) }}>
        <Text bold color={st ? statusColor(st) : undefined}>{cut(sectionHead(sec, on, n), cols - 1)}</Text>
      </Button>,
    )
    if (on) out.push(...(sec === 'runs' ? RunsTab($, els, runs, agents) : WorkflowsTab(els, agents)))
  }
  return out
}

export async function renderPane($: EngineInterface, e: RenderInput<'Pane'>): Promise<RenderElement> {
  const t = $.ui.resolve(e)
  const els: Els = { Box: t.Box, Text: t.Text, Button: t.Button, Select: e.surface !== 'mobile' && 'Select' in t ? t.Select : null,
    canType: e.surface !== 'mobile' && 'Input' in t }
  const { Box, Text, Button } = els
  const cols = Math.max(20, e.props.bodyColumns)
  const tab = await read($, tabA)
  const unread = await unreadOf($)          // F66: the unread count rides on the Messages tab
  const bar = (
    <Box key="tabs" flexDirection="row" gap={1}>
      {TABS.map(x => (
        <Button key={'tab:' + x.id} variant={x.id === tab ? 'primary' : undefined} dimColor={x.id !== tab}
          onPress={() => {
            void update($, tabA, () => x.id)
            if (x.id === 'runs') void pollRuns($).catch(() => {})       // read on entering the tab
            if (x.id === 'agents') void pollAgents($).catch(() => {})   // read on entering the tab
            if (x.id === 'agents') void pollRuns($).catch(() => {})     // F85: the runs its lead column names
            if (x.id === 'messages' && tab !== 'messages') void enterMessages($).catch(() => {})
            if (x.id === 'explorer') void enterExplorer($).catch(() => {})        // F75: read on entering the tab
            if (x.id === 'run') void enterRun($).catch(() => {})            // F79: first open scans
          }}>{x.id === 'messages' && unread ? `${x.label} ${unread}` : x.label}</Button>
      ))}
    </Box>
  )
  // F66: the Teams setup form draws in place of any view, as the assign forms do
  const setup = await renderSetup($, e)
  if (setup) return setup
  if (tab === 'messages') {
    return (
      <Box flexDirection="column">
        {bar}
        <Text> </Text>
        {await MessagesTab($, els, cols)}
      </Box>
    )
  }
  if (tab === 'health') {
    return (
      <Box flexDirection="column">
        {bar}
        <Text> </Text>
        {HealthTab(els, await readHealth($))}
      </Box>
    )
  }
  if (tab === 'agents') {
    return (
      <Box flexDirection="column">
        {bar}
        <Text> </Text>
        {AgentsTab(els, { ...await readAgents($, cols), runs: openRuns((await readRuns($, cols)).runs), board: await read($, boardA) })}
      </Box>
    )
  }
  // A Run form up draws without the tab bar, as the assign forms do: a tab press would
  // leave it up, and Esc on that tab (the pane still closeOnEscape) close the board.
  if (tab === 'run') {
    const formUp = await isRunFormUp($)
    return (
      <Box flexDirection="column">
        {!formUp && bar}
        {!formUp && <Text> </Text>}
        {await RunTab($, e, els, cols)}
      </Box>
    )
  }
  if (tab === 'explorer') {
    return (
      <Box flexDirection="column">
        {bar}
        <Text> </Text>
        {ExplorerTab($, els, await readExplorer($), cols)}
      </Box>
    )
  }
  if (tab === 'runs') {
    // F85: the engage confirm draws without the tab bar, as the Run tab's form does
    const g = (await readRuns($, cols)).engage
    if (g) return <Box flexDirection="column">{EngageConfirm($, els, g)}</Box>
    return (
      <Box flexDirection="column">
        {bar}
        <Text> </Text>
        {await RunsAndWorkflows($, els, cols)}
      </Box>
    )
  }
  // B5: an assign / decide / add person form up draws in place of the view it came
  // from (Tickets or Team); Esc or Cancel brings that view back.
  const form = (await renderForm($, e)) ?? (await renderReconcile($, e))   // F81: the reconcile form likewise
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
