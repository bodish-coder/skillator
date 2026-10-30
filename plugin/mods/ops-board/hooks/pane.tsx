import { atom, read, update } from 'claude-code'
import type { BoxProps, ButtonProps, Color, ElementConstructor, EngineInterface, RenderElement, RenderInput,
  SelectProps, TextProps } from 'claude-code'
import type { Filter } from '../types'
import { STATE_COLOR } from './lib/board'
import { buildModel, chipsOf, headKey, isDecidable, toggleGroup, UNI, ASCII, cutTo, headText, rowText, chromeRows, windowOf } from './lib/ticketsmodel'
import type { Model, View } from './lib/ticketsmodel'
export { buildModel, lineKey, offsetFor } from './lib/ticketsmodel'
export type { View, Model } from './lib/ticketsmodel'
import { clearForm, openAssign, renderForm, runDecided } from './assign'
import { openStatus, renderStatus } from './status'
import { openReconcile, renderReconcile } from './reconcile'
import { paint } from './paint'
import { TeamTab } from './teamview'
import { HealthTab, readHealth } from './health'
import { DiagnoseView, EngageConfirm, openRuns, pollRuns, readDiagnose, readRuns, RunsTab } from './runstab'
import { runStatus, RUNS_SECTIONS, sectionHead, sectionStatus, statusColor } from './lib/runlines'
import type { RunsSection } from './lib/runlines'
import { workflowStatus } from './lib/agents'
import { AgentsTab, pollAgents, readAgents, WorkflowsTab } from './agentstab'
import { enterMessages, MessagesTab, renderSetup, unreadOf } from './messagestab'
import { enterRun, isRunFormUp, RunTab } from './runtab'
import { ActionConfirm, enterExplorer, ExplorerTab, readExplorer, readExplorerAction } from './explorertab'

// The ops board pane (design §5): tab bar, the Tickets tab with its filter row,
// status rails, a yielding list, and wrapping footer keys.

export const PANE_ID = 'ops-board'
export const PANE_TITLE = 'ops board'

// F76: one tab, id 'runs', labelled Workflows (owner: relay runs and workflows are one thing):
// a Runs section and a Workflows section. /ops workflows opens it; /ops runs is an alias.
// F93: its Agents section is the old Agents tab; tab 'run' is labelled Build.
export type Tab = 'tickets' | 'runs' | 'health' | 'messages' | 'explorer' | 'run'
// Each file names the atoms it reads or writes as its own consts: the engine's scan
// lists state access from those, not from an import (register.tsx repeats them).
const boardA = atom({ plugin: 'ops-board', key: 'board' } as const, null)
const teamA = atom({ plugin: 'ops-board', key: 'team' } as const, [])
const meA = atom({ plugin: 'ops-board', key: 'me' } as const, null)
const tabA = atom({ plugin: 'ops-board', key: 'tab' } as const, 'tickets')
const asciiA = atom({ plugin: 'ops-board', key: 'ascii' } as const, false)
const selectedA = atom({ plugin: 'ops-board', key: 'selected' } as const, null)
const ticketOffsetA = atom({ plugin: 'ops-board', key: 'ticketOffset' } as const, null)
const expandedA = atom({ plugin: 'ops-board', key: 'expanded' } as const, null)
const filterA = atom({ plugin: 'ops-board', key: 'filter' } as const, { app: null, who: null, mine: false, showDone: false })
const filterOpenA = atom({ plugin: 'ops-board', key: 'filterOpen' } as const, false)
const teamViewA = atom({ plugin: 'ops-board', key: 'teamView' } as const, null)
// F61: the boxes of the open groups, this session; empty = every group collapsed. Only
// the set is held, never rows: the board's own value stays within $.state's cap (B4).
const openA = atom({ plugin: 'ops-board', key: 'openGroups' } as const, [])
// F76: the Workflows tab's open sections (Runs, Workflows, F93 Agents), this session; all start open.
const runsOpenA = atom({ plugin: 'ops-board', key: 'runsOpen' } as const, ['runs', 'workflows', 'agents'])

const CHIP_KEY: Color = 'permission'
const CHIP_VALUE: Color = 'suggestion'

const cut = (s: string, room: number) => cutTo(s, room, UNI.cut)

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
  const glyphs = v.ascii ? ASCII : UNI
  const entries: RenderElement[] = []
  const list = m.lines.slice(m.lines.findIndex(l => l.key === 'gap') + 1, m.lines.findIndex(l => l.key === 'gap2'))
  const w = windowOf(m, v.rows ? Math.max(1, v.rows - chromeRows(v, m, glyphs).total) : null, v.offset)
  const f = v.filter
  const hasTeam = v.team.length > 0
  const setFilter = (fn: (f: Filter) => Filter) => { void update($, ticketOffsetA, () => null); void update($, filterA, fn) }

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
        {hasTeam && v.me && <Button key="key:mine" hotkey="m" plain onPress={() => setFilter(x => ({ ...x, mine: !x.mine, who: null }))}>
          {(f.mine ? '[x]' : '[ ]') + ' mine'}</Button>}
      </Box>,
    )
  } else {
    out.push(
      <Box key="filters"><Text wrap="truncate-end">
        {cutTo(`app ${f.app ?? 'all'} ${glyphs.open}  ` + (hasTeam ? `who ${f.mine ? 'me' : f.who ?? 'all'} ${glyphs.open}  ${f.mine ? '[x]' : '[ ]'} mine  ` : '') + `${f.showDone ? '[x]' : '[ ]'} done`, v.cols, glyphs.cut)}
      </Text></Box>,
    )
  }
  out.push(<Text key="gap"> </Text>)

  if (!v.board || v.board.error) {
    entries.push(<Text dimColor>{v.board?.error ?? `reading TICKETS.md${glyphs.more}`}</Text>)
  } else if (!m.groups.length) {   // F61: m.rows holds only open groups' rows; test the groups
    entries.push(<Text dimColor>{m.filterActive ? 'no ticket matches the filter' : 'no open tickets'}</Text>)
  }

  const shownIds = new Set(m.rows.map(t => t.id))
  for (const g of m.groups) {
    // F61: a header is a Button - Enter under the focus or a click opens or closes it.
    const hk = headKey(g.box)
    const head = cutTo(headText(g, glyphs, !!v.ascii), v.cols - (v.ascii ? 0 : 2) - (hk === m.selected ? 3 : 0), glyphs.cut)
    entries.push(
      <Button key={hk} hotkey={hk === m.selected ? 'o' : undefined} plain onPress={() => {
        void update($, ticketOffsetA, () => null)
        // the header stands for a ticket hidden in it (moved there by an edit): opening lands on it
        void update($, selectedA, x => (hk === m.selected && x && !x.startsWith('head:') && g.tickets.some(t => t.id === x) ? x : hk))
        void update($, openA, x => toggleGroup(x, g.box))
      }}>
        {!v.ascii && <Text color={g.open ? paint(g.box) : undefined} dimColor={!g.open} inverse={hk === m.selected}>{g.open ? glyphs.rail : glyphs.railDim}</Text>}
        <Text color={v.ascii ? undefined : paint(g.box)} bold inverse={hk === m.selected}>{head}</Text>
      </Button>,
    )
    if (!g.open) continue
    for (const t of g.tickets) {
      const nested = !!t.parent && shownIds.has(t.parent) && g.tickets.some(p => p.id === t.parent)
      const row = rowText(t, v.cols, glyphs, !!v.ascii, nested, t.id === m.selected ? 3 : 0)
      const isSel = t.id === m.selected
      const body = v.ascii && isSel ? '> ' + row.text.slice(2) : row.text
      entries.push(
        <Button key={'row:' + t.id} hotkey={isSel ? 'o' : undefined} plain onPress={() => {
          void update($, ticketOffsetA, () => null)
          void update($, selectedA, () => t.id)
          void update($, expandedA, x => (x === t.id ? null : t.id))
        }}>
          {!v.ascii && <Text color={paint(t.box)}>{glyphs.rail}</Text>}
          {isSel ? <Text inverse>{body.padEnd(v.cols - (v.ascii ? 0 : 2) - 3)}</Text>
            : <Text dimColor={STATE_COLOR[t.box] === 'dim'}>{row.owner && body.endsWith(row.owner)
              ? [body.slice(0, -row.owner.length), <Text dimColor>{row.owner}</Text>] : body}</Text>}
        </Button>,
      )
      if (chipsOf(t)) {
        const parts: (RenderElement | string)[] = ['    ']
        const groupCount = [t.apps.length, t.owner, t.decide, t.tester, t.by.length, t.session].filter(Boolean).length
        let room = v.cols - 4 - (isDecidable(t) ? (isSel ? 13 : 10) : 0) - Math.max(0, groupCount - 1) * 2
        const take = (s: string) => { const text = cutTo(s, Math.max(0, room), glyphs.cut); room -= text.length; return text }
        const chip = (k: string, val: string) => [<Text color={CHIP_KEY}>{take(k + ':')}</Text>, <Text color={CHIP_VALUE}>{take(val)}</Text>]
        const groupsOf: (RenderElement | string)[][] = []
        if (t.apps.length) groupsOf.push(t.apps.flatMap((a, i) => [...(i ? [take(' ')] : []), ...chip('app', a)]))
        if (t.owner) groupsOf.push(chip('owner', t.owner))
        if (t.decide) groupsOf.push(chip('decide', t.decide))
        if (t.tester) groupsOf.push(chip('tester', t.tester))
        if (t.by.length) groupsOf.push(chip('by', t.by.join(' ')))
        if (t.session) groupsOf.push([<Text dimColor>{take(t.session)}</Text>])
        groupsOf.forEach((gr, i) => { if (i) parts.push('  '); parts.push(...gr) })
        entries.push(
          <Box key={'chips:' + t.id} flexDirection="row" gap={3}>
            <Text wrap="truncate-end">{parts}</Text>
            {isDecidable(t) && <Button key={'decided:' + t.id} plain hotkey={isSel ? 'v' : undefined} onPress={() => { void runDecided($, t.id) }}>Decided</Button>}
          </Box>,
        )
      }
      if (v.expanded === t.id) {
        const raw = `    - [${t.box}] ${t.line}`
        const at = list.slice(0, entries.length).reduce((n, l) => n + l.rows, 0)
        const from = Math.max(0, w.start - at), to = Math.min(Math.ceil(raw.length / v.cols), w.end - at)
        entries.push(<Box key={'raw:' + t.id} flexDirection="column">{Array.from({ length: Math.max(0, to - from) }, (_, i) => <Text dimColor>{raw.slice((from + i) * v.cols, (from + i + 1) * v.cols)}</Text>)}</Box>)
      }
    }
  }

  if (w.above) out.push(<Box key="more:up"><Text dimColor>{`  ${glyphs.more} ${w.above} rows above ${glyphs.up}`}</Text></Box>)
  let at = 0
  out.push(...(m.groups.length ? entries.filter((_, i) => {
    const start = at; at += list[i]!.rows
    return start < w.end && at > w.start
  }) : entries))
  if (w.below) out.push(<Box key="more:down"><Text dimColor>{`  ${glyphs.more} ${w.below} more rows ${glyphs.down}`}</Text></Box>)
  out.push(<Text key="gap2"> </Text>)
  const c = m.count
  out.push(<Box key="count" flexDirection="row" flexWrap="wrap" gap={1}>{m.filterActive
    ? <Text dimColor>{c.text.replace(UNI.sep, glyphs.sep)}</Text>
    : [
        <Text dimColor>{`${c.open} open`}</Text>,
        ...c.dots.map(d => <Text color={paint(d.box)}>{glyphs.dot + d.n}</Text>),
        ...(f.showDone
          ? (c.closed.length ? [<Text dimColor>{glyphs.sep}</Text>, ...c.closed.map(d => <Text color={paint(d.box)}>{glyphs.dot + d.n}</Text>), <Text dimColor>closed</Text>] : [])
          : (c.closed.length ? [<Text dimColor>{`${glyphs.sep} ${c.closed.reduce((s, d) => s + d.n, 0)} done hidden`}</Text>] : []))
      ]}</Box>)
  out.push(
    <Box key="keys" flexDirection="row" flexWrap="wrap" gap={2}>
      <Text dimColor>{glyphs.move + ' move'}</Text>
      <Button key="key:assign" plain dimColor hotkey="a" onPress={() => { void openAssign($, 'owner', m.ticket, els.canType) }}>assign</Button>
      <Button key="key:decide" plain dimColor hotkey="d" onPress={() => { void openAssign($, 'decide', m.ticket, els.canType) }}>decide</Button>
      <Button key="key:filter" plain dimColor hotkey="f" onPress={() => { void update($, filterOpenA, x => !x) }}>filter</Button>
      <Button key="key:done" plain dimColor hotkey="x" onPress={() => setFilter(x => ({ ...x, showDone: !x.showDone }))}>done</Button>
      <Button key="key:team" plain dimColor hotkey="t" onPress={() => { void update($, teamViewA, () => ({ selected: null, confirm: false })) }}>team</Button>
      <Button key="key:reconcile" plain dimColor hotkey="c" onPress={() => { void clearForm($).then(() => openReconcile($)) }}>reconcile</Button>
      <Button key="key:status" plain dimColor hotkey="s" onPress={() => { void openStatus($, m.ticket, els.canType, 'status') }}>status</Button>
      <Button key="key:help" plain dimColor hotkey="h" onPress={() => { void openStatus($, m.ticket, els.canType, 'help') }}>help</Button>
      {/* F78: register.tsx takes this press (ui.press) - the forced poll lives there */}
      <Button key="key:refresh" plain dimColor hotkey="r" onPress={() => {}}>refresh</Button>
    </Box>,
  )
  return out
}

export async function readView($: EngineInterface, cols: number, rows: number | null = null, unread = 0): Promise<View> {
  return {
    board: await read($, boardA), team: await read($, teamA), me: await read($, meA),
    filter: await read($, filterA), filterOpen: await read($, filterOpenA),
    selected: await read($, selectedA), expanded: await read($, expandedA), open: await read($, openA), cols,
    ascii: await read($, asciiA), rows, unread, offset: await read($, ticketOffsetA),
  }
}

const TABS: { id: Tab; label: string }[] = [{ id: 'tickets', label: 'Tickets' }, { id: 'runs', label: 'Workflows' },
  { id: 'health', label: 'Health' }, { id: 'messages', label: 'Messages' },
  { id: 'explorer', label: 'Explorer' },   // F75: git-tracked files and recent commits (explorertab.tsx)
  { id: 'run', label: 'Build' }]   // F79: the repo's entry points (runtab.tsx) - not Workflows (id 'runs')

// F76: the Workflows tab (id 'runs') - a Runs section (relay runs, F50) and a Workflows section (F53),
// each a header Button with its count that Enter or a click opens and closes, as F61's
// status groups; an open section draws its body as the old tab did.
async function RunsAndWorkflows($: EngineInterface, els: Els, cols: number): Promise<RenderElement[]> {
  const { Text, Button } = els
  const open = await read($, runsOpenA)
  const runs = await readRuns($, cols)
  const agents = await readAgents($, cols)
  const active = openRuns(runs.runs)   // F99: finished runs count and draw (RunsTab); the agents tree matches active ones only
  const out: RenderElement[] = []
  for (const sec of [...RUNS_SECTIONS, 'agents'] as RunsSection[]) {   // F93: the pane's agents last
    const on = open.includes(sec)
    const n = sec === 'runs' ? runs.runs.length : sec === 'workflows' ? agents.workflows.length : agents.agents.length
    // F76: the header in the colour of the most pressing status under it, as a ticket group's
    // (F93: Agents uncoloured - each agent row carries its own status colour)
    const st = sec === 'agents' ? null
      : sectionStatus(sec === 'runs' ? runs.runs.map(runStatus) : agents.workflows.map(r => workflowStatus(agents.agents, r)))
    if (sec !== RUNS_SECTIONS[0]) out.push(<Text> </Text>)
    out.push(
      <Button key={'sect:' + sec} hotkey={sec === 'runs' ? 'r' : sec === 'workflows' ? 'w' : 'g'} plain onPress={() => { void update($, runsOpenA, x => toggleGroup(x, sec)) }}>
        <Text bold color={st ? statusColor(st) : undefined}>{cut(sectionHead(sec, on, n), cols - 4)}</Text>
      </Button>,
    )
    if (on) out.push(...(sec === 'runs' ? await RunsTab($, els, runs, agents) : sec === 'workflows' ? WorkflowsTab(els, agents)
      : AgentsTab(els, { ...agents, runs: active, board: runs.board })))
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
  const ascii = await read($, asciiA)
  const glyphs = ascii ? ASCII : UNI
  const unread = await unreadOf($)          // F66: the unread count rides on the Messages tab
  const bar = (   // B14: whole tabs wrap to a second row in a narrow pane, never cut mid-word
    <Box key="tabs" flexDirection="row" flexWrap="wrap" gap={1}>
      {TABS.map(x => (
        <Button key={'tab:' + x.id} variant={x.id === tab ? 'primary' : undefined} dimColor={x.id !== tab}
          onPress={() => {
            void update($, tabA, () => x.id)
            if (x.id === 'runs') void pollRuns($).catch(() => {})       // read on entering the tab
            if (x.id === 'runs') void pollAgents($).catch(() => {})     // F93: its Agents section likewise
            if (x.id === 'messages' && tab !== 'messages') void enterMessages($).catch(() => {})
            if (x.id === 'explorer') void enterExplorer($).catch(() => {})        // F75: read on entering the tab
            if (x.id === 'run') void enterRun($).catch(() => {})            // F79: first open scans
          }}>{ascii ? (x.id === tab ? '[' : ' ') : x.id === tab ? glyphs.active : ''}{x.id === 'messages' && unread ? `${x.label} ${unread}` : x.label}{ascii ? (x.id === tab ? ']' : ' ') : ''}</Button>
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
        <Text> </Text>
        {/* F87: register.tsx takes this press (ui.press) - /ops resume force */}
        <Box key="keys" flexDirection="row" flexWrap="wrap" gap={2}>
          <Button key="key:force" plain dimColor hotkey="f" onPress={() => {}}>force resume</Button>
          <Text dimColor wrap="wrap">whatever the reading; mutes memory red</Text>
        </Box>
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
    const a = await readExplorerAction($)      // F103: the git action confirm, without the tab bar
    if (a) return <Box flexDirection="column">{await ActionConfirm($, els, a)}</Box>
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
    const d = await readDiagnose($)
    if (d) return <Box flexDirection="column">{await DiagnoseView($, els, d)}</Box>   // F99: the Diagnose view likewise
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
  const form = (await renderStatus($, e)) ?? (await renderForm($, e)) ?? (await renderReconcile($, e))   // F81: the reconcile form likewise
  if (form) return form
  const v = await readView($, cols, e.props.scroll?.bodyRows ?? null, unread)
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
