import { atom, read, update } from 'claude-code'
import type { BoxProps, ButtonProps, Color, ElementConstructor, EngineInterface, RenderElement, RenderInput,
  SelectProps, TextProps } from 'claude-code'
import type { Filter, FilterPicker } from '../types'
import { PRIORITIES, STATE_COLOR } from './lib/board'
import { buildModel, chipsOf, groupKey, headKey, isDecidable, toggleGroup, toggleUserSection, UNI, ASCII, cutTo, headText, userHeadText, rowText, chromeRows, windowOf, paneTabs } from './lib/ticketsmodel'
import type { Model, PANE_TABS, UserSection, View } from './lib/ticketsmodel'
export { buildModel, lineKey, offsetFor } from './lib/ticketsmodel'
export type { View, Model } from './lib/ticketsmodel'
import { clearForm, openAssign, openAutoPriority, openPriority, renderAutoPriority, renderForm, runDecided } from './assign'
import { decideQuestionsPrompt } from './lib/calls'
import { openDecide, openStatus, renderStatus } from './status'
import { openReconcile, renderReconcile } from './reconcile'
import { openIntake, renderIntake } from './intake'
import { paint } from './paint'
import { TeamTab } from './teamview'
import { HealthTab, readHealth } from './health'
import { hostingProfileName } from './lib/healthlines'
import { DiagnoseView, EngageConfirm, openRuns, pollRuns, readDiagnose, readRuns, RunsTab } from './runstab'
import { runStatus, RUNS_SECTIONS, sectionHead, sectionStatus, statusColor } from './lib/runlines'
import type { RunsSection } from './lib/runlines'
import { workflowStatus } from './lib/agents'
import { AgentsTab, pollAgents, readAgents, WorkflowsTab } from './agentstab'
import { enterMessages, MessagesTab, renderSetup, unreadOf } from './messagestab'
import { enterRun, isRunFormUp, RunTab } from './runtab'
import { ActionConfirm, enterExplorer, ExplorerTab, readExplorer, readExplorerAction } from './explorertab'
import { enterHelp, HelpTab } from './helptab'
import { LogTab, readLog, say } from './logtab'
import { DASHBOARD_WIDE, dashboardPanels } from './lib/dashboard'
import { loadRules, renderRuleForm, renderRules } from './rules'

// The ops board pane (design §5): tab bar, the Tickets tab with its filter row,
// status rails, a yielding list, and wrapping footer keys.

export const PANE_ID = 'ops-board'
export const PANE_TITLE = 'ops board'

// F76: one tab, id 'runs', labelled Workflows (owner: relay runs and workflows are one thing):
// a Runs section and a Workflows section. /ops workflows opens it; /ops runs is an alias.
// F93: its Agents section is the old Agents tab; tab 'run' is labelled Build.
export type Tab = typeof PANE_TABS[number]['id']
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
const filterPickerA = atom({ plugin: 'ops-board', key: 'filterPicker' } as const, null)   // B35
const teamViewA = atom({ plugin: 'ops-board', key: 'teamView' } as const, null)
// F61: the boxes of the open groups, this session; empty = every group collapsed. Only
// the set is held, never rows: the board's own value stays within $.state's cap (B4).
const openA = atom({ plugin: 'ops-board', key: 'openGroups' } as const, [])
const byPriorityA = atom({ plugin: 'ops-board', key: 'ticketsByPriority' } as const, false)   // F201

// F202: coming back to Tickets from another tab: every group closed, the selection at the top
export async function collapseTickets($: EngineInterface, keepSections = false) {
  // keepSections (the g toggle): the personal sections' unfold: choices stay; grouping does not touch them
  await update($, openA, x => (keepSections ? x.filter(k => k.startsWith('unfold:')) : []))
  await update($, selectedA, () => null)
  await update($, ticketOffsetA, () => null)
  await update($, expandedA, () => null)
  await update($, filterPickerA, () => null)   // B35: a paged filter list does not outlive the tab
}
const sessionA = atom({ plugin: 'ops-board', key: 'session' } as const, null)   // F109: register.tsx sets it
// F76: the Workflows tab's open sections (Runs, Workflows, F93 Agents), this session; all start open.
const runsOpenA = atom({ plugin: 'ops-board', key: 'runsOpen' } as const, ['runs', 'workflows', 'agents'])

export async function toggleUserGroup($: EngineInterface, sec: UserSection) {
  await update($, ticketOffsetA, () => null)
  await update($, openA, x => toggleUserSection(x, sec))
}

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

  // F201: g flips the list between state groups and P1..P5 groups; it rides on the filter
  // row (one row always), not the keys line, so the chrome budget does not move
  const byPriority = (
    <Button key="key:by-priority" plain dimColor hotkey="g" onPress={() => {
      void update($, byPriorityA, x => !x)
      void collapseTickets($, true)
    }}>{v.byPriority ? 'by state' : 'by priority'}</Button>
  )
  const choices = {
    app: ['all', ...[...new Set((v.board?.tickets ?? []).flatMap(t => t.apps))].sort()],
    who: ['all', ...v.team.map(p => p.handle)],
  }
  const pick = (key: 'app' | 'who', val: string) => setFilter(x => key === 'app'
    ? { ...x, app: val === 'all' ? null : val } : { ...x, who: val === 'all' ? null : val, mine: false })
  const setPicker = (p: FilterPicker) => { void update($, filterPickerA, () => p) }
  // B35: past 64 choices the filter pages in place of the list, as B33's Auto-assign filters do
  const pk = v.filterOpen ? v.filterPicker : null
  if (pk) {
    const pageSize = 12, values = choices[pk.key]
    const page = Math.min(pk.page, Math.max(0, Math.ceil(values.length / pageSize) - 1)), start = page * pageSize   // the values can shrink under it
    return [
      <Text key="filter:title" bold>{pk.key}</Text>,
      ...values.slice(start, start + pageSize).map(value =>
        <Button key={'filter:option:' + value} plain variant={(f[pk.key] ?? 'all') === value ? 'primary' : undefined}
          onPress={() => { setPicker(null); pick(pk.key, value) }}>{value}</Button>),
      <Box key="filter:pages" flexDirection="row" flexWrap="wrap" gap={2}>
        {start > 0 && <Button key="filter:previous" plain onPress={() => setPicker({ ...pk, page: page - 1 })}>Previous</Button>}
        {start + pageSize < values.length && <Button key="filter:next" plain onPress={() => setPicker({ ...pk, page: page + 1 })}>Next</Button>}
        <Button key="filter:back" plain onPress={() => setPicker(null)}>Back</Button>
      </Box>,
    ]
  }
  const filterSelect = (key: 'app' | 'who') => choices[key].length <= 64
    ? <Select key={'sel:' + key} label={key} value={f[key] ?? 'all'} options={choices[key].map(c => ({ value: c, label: c }))}
        onSelect={val => pick(key, val)} />
    : <Button key={'sel:' + key} plain onPress={() => setPicker({ key, page: 0 })}>{key + ' ' + (f[key] ?? 'all')}</Button>
  // filter row (closed: the g button's label, its 'g: ' hotkey prefix and the gap come off the text width)
  if (v.filterOpen && Select) {
    out.push(
      <Box key="filters" flexDirection="row" gap={2}>
        {filterSelect('app')}
        {hasTeam && filterSelect('who')}
        {hasTeam && v.me && <Button key="key:mine" hotkey="m" plain onPress={() => setFilter(x => ({ ...x, mine: !x.mine, who: null }))}>
          {(f.mine ? '[x]' : '[ ]') + ' mine'}</Button>}
      </Box>,
    )
  } else {
    out.push(
      <Box key="filters" flexDirection="row" gap={2}>{byPriority}<Text wrap="truncate-end">
        {cutTo(`app ${f.app ?? 'all'} ${glyphs.open}  ` + (hasTeam ? `who ${f.mine ? 'me' : f.who ?? 'all'} ${glyphs.open}  ${f.mine ? '[x]' : '[ ]'} mine  ` : '') + `${f.showDone ? '[x]' : '[ ]'} done`, Math.max(0, v.cols - (v.byPriority ? 8 : 11) - 3 - 2), glyphs.cut)}
      </Text></Box>,
    )
  }
  out.push(<Text key="gap"> </Text>)

  if (!v.board || v.board.error) {
    entries.push(<Text dimColor>{v.board?.error ?? `reading TICKETS.md${glyphs.more}`}</Text>)
  } else if (!m.groups.length && !m.userGroups.length) {   // F61: m.rows holds only open groups' rows; test the groups
    entries.push(<Text dimColor>{m.filterActive ? 'no ticket matches the filter' : 'no open tickets'}</Text>)
  }

  const pushTicketEntry = (t: Model['rows'][number], itemKey: string, nested: boolean) => {
    const isSel = itemKey === m.selected
    const priorityWidth = t.priority ? 3 : 0   // F201: 'P1 ' in place of the 2-cell rail
    // A251: the chip goes in the prefix so rowText's 56-column owner cut-off sees the pane width
    const row = rowText(t, v.cols, glyphs, !!v.ascii, nested, (isSel ? 3 : 0) + (t.priority && !v.ascii ? priorityWidth - 2 : priorityWidth))
    const body = v.ascii && isSel ? '> ' + row.text.slice(2) : row.text
    entries.push(
      <Button key={'row:' + itemKey} hotkey={isSel ? 'o' : undefined} plain onPress={() => {
        void update($, ticketOffsetA, () => null)
        void update($, selectedA, () => itemKey)
        void update($, expandedA, x => (x === itemKey || x === t.id ? null : itemKey))
      }}>
        {t.priority ? <Text color={v.ascii ? undefined : PRIORITIES[t.priority].color}>{t.priority + ' '}</Text>
          : !v.ascii && <Text color={paint(t.box)}>{glyphs.rail}</Text>}
        {isSel ? <Text inverse>{body.padEnd(v.cols - (t.priority ? priorityWidth : v.ascii ? 0 : 2) - 3)}</Text>
          : <Text dimColor={STATE_COLOR[t.box] === 'dim'}>{row.owner && body.endsWith(row.owner)
            ? [body.slice(0, -row.owner.length), <Text dimColor>{row.owner}</Text>] : body}</Text>}
      </Button>,
    )
    if (chipsOf(t)) {
      const parts: (RenderElement | string)[] = ['    ']
      const groupCount = [t.apps.length, t.owner, t.workingSession, t.assignedSession, t.decide, t.tester, t.by.length, t.rule, t.session].filter(Boolean).length
      let room = v.cols - 4 - (isDecidable(t) ? (isSel ? 13 : 10) : 0) - Math.max(0, groupCount - 1) * 2
      const take = (s: string) => { const text = cutTo(s, Math.max(0, room), glyphs.cut); room -= text.length; return text }
      const chip = (k: string, val: string) => [<Text color={k === 'decide' ? 'autoAccept' : CHIP_KEY}>{take(k + ':')}</Text>, <Text color={CHIP_VALUE}>{take(val)}</Text>]
      const groupsOf: (RenderElement | string)[][] = []
      if (t.apps.length) groupsOf.push(t.apps.flatMap((a, i) => [...(i ? [take(' ')] : []), ...chip('app', a)]))
      if (t.owner) groupsOf.push(chip('owner', t.owner))
      if (t.box === '~' && t.workingSession) groupsOf.push(chip('working', t.workingSession + (t.workingState ? ' (' + t.workingState + ')' : '')))
      if (t.assignedSession) groupsOf.push(chip('session', t.assignedSession))
      if (t.decide) groupsOf.push(chip('decide', t.decide))
      if (t.tester) groupsOf.push(chip('tester', t.tester))
      if (t.by.length) groupsOf.push(chip('by', t.by.join(' ')))
      if (t.rule) groupsOf.push(chip('rule', String(t.rule)))
      if (t.session) groupsOf.push([<Text dimColor>{take(t.session)}</Text>])
      groupsOf.forEach((gr, i) => { if (i) parts.push('  '); parts.push(...gr) })
      entries.push(
        <Box key={'chips:' + itemKey} flexDirection="row" gap={3}>
          <Text wrap="truncate-end">{parts}</Text>
          {isDecidable(t) && <Button key={'decided:' + itemKey} plain hotkey={isSel ? 'v' : undefined} onPress={() => { void runDecided($, t.id) }}>Decided</Button>}
        </Box>,
      )
    }
    if (v.expanded === itemKey || v.expanded === t.id) {   // B36: as buildModel counts it (the ops TUI expands by bare id)
      const raw = `    - [${t.box}] ${t.line}`
      const at = list.slice(0, entries.length).reduce((n, l) => n + l.rows, 0)
      const from = Math.max(0, w.start - at), to = Math.min(Math.ceil(raw.length / v.cols), w.end - at)
      entries.push(<Box key={'raw:' + itemKey} flexDirection="column">{Array.from({ length: Math.max(0, to - from) }, (_, i) => <Text dimColor>{raw.slice((from + i) * v.cols, (from + i + 1) * v.cols)}</Text>)}</Box>)
    }
  }

  for (const ug of m.userGroups) {
    const hk = headKey(ug.id)
    const head = cutTo(userHeadText(ug, glyphs, !!v.ascii), v.cols - (v.ascii ? 0 : 2) - (hk === m.selected ? 3 : 0), glyphs.cut)
    entries.push(
      <Button key={hk} hotkey={hk === m.selected ? 'o' : undefined} plain onPress={() => {
        void update($, selectedA, x => (hk === m.selected && x && x.startsWith(ug.id + ':') && ug.tickets.some(t => `${ug.id}:${t.id}` === x) ? x : hk))
        void toggleUserGroup($, ug.id)
      }}>
        {!v.ascii && <Text color={ug.open ? ug.color : undefined} dimColor={!ug.open} inverse={hk === m.selected}>{ug.open ? glyphs.rail : glyphs.railDim}</Text>}
        <Text color={v.ascii ? undefined : ug.color} bold inverse={hk === m.selected}>{head}</Text>
      </Button>,
    )
    if (!ug.open) continue
    for (const t of ug.tickets) pushTicketEntry(t, `${ug.id}:${t.id}`, false)
  }

  const shownIds = new Set(m.rows.map(t => t.id))
  for (const g of m.groups) {
    // F61: a header is a Button - Enter under the focus or a click opens or closes it.
    const hk = headKey(groupKey(g))
    const color = g.color ?? paint(g.box)
    const head = cutTo(headText(g, glyphs, !!v.ascii), v.cols - (v.ascii ? 0 : 2) - (hk === m.selected ? 3 : 0), glyphs.cut)
    entries.push(
      <Button key={hk} hotkey={hk === m.selected ? 'o' : undefined} plain onPress={() => {
        void update($, ticketOffsetA, () => null)
        // the header stands for a ticket hidden in it (moved there by an edit): opening lands on it
        void update($, selectedA, x => (hk === m.selected && x && !x.startsWith('head:') && g.tickets.some(t => t.id === x) ? x : hk))
        void update($, openA, x => toggleGroup(x, groupKey(g)))
      }}>
        {!v.ascii && <Text color={g.open ? color : undefined} dimColor={!g.open} inverse={hk === m.selected}>{g.open ? glyphs.rail : glyphs.railDim}</Text>}
        <Text color={v.ascii ? undefined : color} bold inverse={hk === m.selected}>{head}</Text>
      </Button>,
    )
    if (!g.open) continue
    for (const t of g.tickets) {
      const nested = !!t.parent && shownIds.has(t.parent) && g.tickets.some(p => p.id === t.parent)
      pushTicketEntry(t, t.id, nested)
    }
  }

  if (w.above) out.push(<Box key="more:up"><Text dimColor>{`  ${glyphs.more} ${w.above} rows above ${glyphs.up}`}</Text></Box>)
  let at = 0
  out.push(...(m.groups.length || m.userGroups.length ? entries.filter((_, i) => {
    const start = at; at += list[i]?.rows ?? 1
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
    <Box key="keys" flexDirection="row" flexWrap="wrap" gap={v.cols <= 40 ? 0 : 1}>
      <Text dimColor>{glyphs.move + ' move'}</Text>
      <Button key="key:assign" plain dimColor hotkey="a" onPress={() => { void openAssign($, 'owner', m.ticket, els.canType) }}>assign</Button>
      {m.ticket && <Button key="key:priority" plain dimColor hotkey="p" onPress={() => { void openPriority($, m.ticket) }}>priority</Button>}
      <Button key="key:decide" plain dimColor hotkey="d" onPress={() => { void openDecide($, m.ticket, els.canType) }}>decide</Button>
      <Button key="key:filter" plain dimColor hotkey="f" onPress={() => { void update($, filterOpenA, x => !x) }}>filter</Button>
      <Button key="key:done" plain dimColor hotkey="x" onPress={() => setFilter(x => ({ ...x, showDone: !x.showDone }))}>done</Button>
      <Button key="key:team" plain dimColor hotkey="t" onPress={() => { void update($, teamViewA, () => ({ selected: null, confirm: false })) }}>team</Button>
      <Button key="key:reconcile" plain dimColor hotkey="c" onPress={() => { void clearForm($).then(() => openReconcile($)) }}>reconcile</Button>
      <Button key="key:intake" plain dimColor hotkey="i" onPress={() => { void clearForm($).then(() => openIntake($)) }}>intake</Button>
      <Button key="key:questions" plain dimColor hotkey="u" onPress={() => {
        const text = decideQuestionsPrompt()
        void $.prompt.submit({ text }).then(
          () => { say($, `✓ Sent to session: ${text}`, { timeoutMs: 8000 }) },
          err => { say($, `✗ ${String(err)}`, { timeoutMs: 8000 }) },
        )
      }}>ask</Button>
      <Button key="key:status" plain dimColor hotkey="s" onPress={() => { void openStatus($, m.ticket, els.canType, 'status') }}>status</Button>
      <Button key="key:help" plain dimColor hotkey="h" onPress={() => { void openStatus($, m.ticket, els.canType, 'help') }}>help</Button>
      {/* F78: register.tsx takes this press (ui.press) - the forced poll lives there */}
      <Button key="key:refresh" plain dimColor hotkey="r" onPress={() => {}}>refresh</Button>
      {v.me && <Text key="key:me" color="suggestion">{v.me}</Text>}
    </Box>,
  )
  return out
}

export async function readView($: EngineInterface, cols: number, rows: number | null = null, unread = 0, logCount = 0): Promise<View> {
  return {
    board: await read($, boardA), team: await read($, teamA), me: await read($, meA),
    filter: await read($, filterA), filterOpen: await read($, filterOpenA), filterPicker: await read($, filterPickerA),
    selected: await read($, selectedA), expanded: await read($, expandedA), open: await read($, openA),
    session: await read($, sessionA), byPriority: await read($, byPriorityA),
    cols, ascii: await read($, asciiA), rows, unread, logCount, offset: await read($, ticketOffsetA),
  }
}

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
  const log = await readLog($)
  const bar = (   // B14: whole tabs wrap to a second row in a narrow pane, never cut mid-word
    <Box key="tabs" flexDirection="row" flexWrap="wrap" gap={1}>
      {paneTabs(cols).map(x => (
        <Button key={'tab:' + x.id} variant={x.id === tab ? 'primary' : undefined} dimColor={x.id !== tab}
          onPress={() => {
            if (x.id !== 'tickets') void clearForm($).catch(() => {})
            if (x.id === 'tickets' && tab !== 'tickets') void collapseTickets($).catch(() => {})   // F202
            void update($, tabA, () => x.id)
            if (x.id === 'runs' || (x.id === 'dashboard' && tab !== 'dashboard')) {
              void pollRuns($).catch(() => {})
              void pollAgents($).catch(() => {})
            }
            if (x.id === 'messages' && tab !== 'messages') void enterMessages($).catch(() => {})
            if (x.id === 'priorities') void loadRules($).catch(() => {})            // F203: the rules list
            if (x.id === 'explorer') void enterExplorer($).catch(() => {})        // F75: read on entering the tab
            if (x.id === 'run') void enterRun($).catch(() => {})            // F79: first open scans
            if (x.id === 'help') void enterHelp($).catch(() => {})          // F160 / A198: load selected skill doc
          }}>{ascii ? (x.id === tab ? '[' : ' ') : x.id === tab ? glyphs.active : ''}{x.id === 'messages' && unread ? `${x.label} ${unread}` : x.id === 'log' && log.length ? `${x.label} ${log.length}` : x.label}{ascii ? (x.id === tab ? ']' : ' ') : ''}</Button>
      ))}
    </Box>
  )
  // F66: the Teams setup form draws in place of any view, as the assign forms do
  const setup = await renderSetup($, e)
  if (setup) return setup
  if (tab === 'dashboard') {
    const [board, health, { runs, loaded }, workflow] = await Promise.all([
      read($, boardA), readHealth($), readRuns($, cols), readAgents($, cols),
    ])
    const wide = cols >= DASHBOARD_WIDE
    const room = wide ? Math.floor((cols - 4) / 2) : cols
    const panels = dashboardPanels({ board, health, runs: loaded ? runs : null, unread, workflow }).map(panel => (
      <Box key={panel.title} width={room} flexDirection="column">
        <Text bold color="suggestion">{panel.title}</Text>
        <Text wrap="truncate-end" color={panel.warning ? 'warning' : undefined}>{panel.summary}</Text>
        {panel.details?.map(text => <Text key={text} wrap="truncate-end" dimColor>{text}</Text>)}
      </Box>
    ))
    return (
      <Box flexDirection="column">
        {bar}
        <Text> </Text>
        {wide ? <Box flexDirection="column" gap={1}>
          <Box flexDirection="row" gap={4}>{panels.slice(0, 2)}</Box>
          <Box flexDirection="row" gap={4}>{panels.slice(2)}</Box>
        </Box> : <Box flexDirection="column" gap={1}>{panels}</Box>}
      </Box>
    )
  }
  if (tab === 'priorities') {
    const form = (await renderAutoPriority($, e)) ?? (await renderRuleForm($, e))
    if (form) return form
    return (
      <Box flexDirection="column">
        {bar}
        <Text> </Text>
        {await renderRules($, e, ascii, glyphs.dot)}
        <Button key="priority:auto-open" plain hotkey="a" onPress={() => { void openAutoPriority($) }}>Auto-assign</Button>
      </Box>
    )
  }
  if (tab === 'help') {
    return (
      <Box flexDirection="column">
        {bar}
        <Text> </Text>
        {await HelpTab($, e, els, cols)}
      </Box>
    )
  }
  if (tab === 'log') {
    return (
      <Box flexDirection="column">
        {bar}
        <Text> </Text>
        {await LogTab($, els, cols, ascii, log)}
      </Box>
    )
  }
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
    // F172: the USAGE block names the hosting CLI's own profile (env-named, else claude)
    let profile = 'claude'
    try {
      const dir = (await $.env.get('SKILLATOR_PROFILE_DIR')) || (await $.env.get('CLAUDE_CONFIG_DIR')) || (await $.env.get('CODEX_HOME')) || (await $.env.get('MUSE_CONFIG_DIR')) || (await $.env.get('AGY_CONFIG_DIR')) || null
      profile = hostingProfileName((await $.env.get('SKILLATOR_CLI')) || null, dir)
    } catch { /* the hosting CLI's name stands */ }
    return (
      <Box flexDirection="column">
        {bar}
        <Text> </Text>
        {HealthTab(els, { ...(await readHealth($)), profile: { name: profile } })}
        <Text> </Text>
        {/* F87: register.tsx takes this press (ui.press) - /ops resume force */}
        <Box key="keys" flexDirection="row" flexWrap="wrap" gap={2}>
          <Button key="key:health-refresh" plain dimColor hotkey="r" onPress={() => {}}>refresh</Button>
          <Button key="key:resume" plain dimColor hotkey="u" onPress={() => {}}>resume</Button>
          <Button key="key:resume-cli" plain dimColor hotkey="c" onPress={() => {}}>resume CLI</Button>
          <Button key="key:force" plain dimColor hotkey="f" onPress={() => {}}>force resume</Button>
          <Button key="key:health-profiles" plain dimColor hotkey="p" onPress={() => {}}>profiles</Button>
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
        {ExplorerTab($, els, await readExplorer($), cols, await read($, teamA))}
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
  const form = (await renderStatus($, e)) ?? (await renderForm($, e)) ?? (await renderReconcile($, e)) ?? (await renderIntake($, e))
  if (form) return form
  const v = await readView($, cols, e.props.scroll?.bodyRows ?? null, unread, log.length)
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
