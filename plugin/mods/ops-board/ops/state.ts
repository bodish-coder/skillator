// The ops app's state and its one reducer (design D5). Pure and sync: a key gives a new
// state and the effects to run; every script run is a `run` effect with a Call from the
// one table, and its `then` folds the result back in. No process, terminal or fs here -
// app.ts executes the effects, the tests drive reduce without any process, and F56 takes
// it as is.
import type { AssignDraft, Board, Box, Engage, Filter, Machine, Member, Msg, PersonDraft, Reconcile, RunView, TeamsCfgView, Ticket, Usage, Watch } from '../types'
import type { Call } from '../hooks/lib/calls'
import type { Model, View } from '../hooks/lib/ticketsmodel'
import type { RunResult } from './nodehost'
import { NO_SCRIPTS } from '../hooks/lib/calls'
import { appliedHead, appliedLine, applyOf, assignedTickets, buildModel, canApply, decideTickets, HEAD, headKey, isHead, isUserHead, isUserSectionOpen, parseReconcile, rawTicketId, toggleGroup, toggleUserSection } from '../hooks/lib/ticketsmodel'
import type { UserSection } from '../hooks/lib/ticketsmodel'
import { STATE_NAME, ticketById, visible } from '../hooks/lib/board'
import { sameHandle } from '../hooks/lib/team'
import { classify, levelLine, MUTE_FILE, MUTED_HOW, mutedWords, muteText, parseMachine, unmuteDue, usageFromLevel } from '../hooks/lib/facts'
import { parseRuns } from '../hooks/lib/runs'
import { continuePrompt, engageOf, orderRuns, RUNS_SECTIONS, stageTickets } from '../hooks/lib/runlines'
import type { RunsSection } from '../hooks/lib/runlines'
import { moveSel, parseInbox, selectedOf } from '../hooks/lib/inbox'
import { freshSetup, parseCfgView, setupError, setupJson, SETUP_FIELDS, tokenShown, urlShown } from '../hooks/lib/teamsconfig'
import type { SetupField, SetupValues } from '../hooks/lib/teamsconfig'
import { enterRunEffect, RUN_INITIAL, runKey } from './runtab'
import type { RunState } from './runtab'
import { enterExplorer, EX0, explorerKey } from './explorer'
import type { ExState } from './explorer'

// F79: run = the Run tab (runtab.ts); F75: explorer = the Explorer tab (explorer.ts)
export type Tab = 'tickets' | 'runs' | 'health' | 'messages' | 'explorer' | 'run'
export type FilterField = 'app' | 'who' | 'mine'

export type SkillGuide = {
  id: string
  name: string
  category: string
  aliases: string[]
  summary: string
  triggers: string[]
  usage: string
  examples: string[]
}

export type HelpState = {
  selected: string
  filter: string
  filtering: boolean
  expanded: boolean
  scroll: number
}
// node readline keypress names: 'up', 'down', 'left', 'right', 'return', 'escape', 'tab', 'a', 'D', ...
// `sequence` is the character typed (app.ts sets it for printable keys): the Add person form's text.
export type Key = { name: string; sequence?: string; shift?: boolean; ctrl?: boolean }
export type PersonField = 'handle' | 'name' | 'emails'
export type DialogField = 'ticket' | 'who'
export type PointerAction =
  | { kind: 'key'; key: Key }
  | { kind: 'tab'; tab: Tab }
  | { kind: 'row'; area: 'tickets' | 'runs' | 'messages' | 'explorer' | 'run' | 'team'; id: string }
  | { kind: 'person'; index: number }
  | { kind: 'reconcile'; index: number }
  | { kind: 'person-field'; field: PersonField }
  | { kind: 'setup-field'; field: SetupField }
  | { kind: 'filter-field'; field: FilterField }
  | { kind: 'ticket-field' }
  | { kind: 'dialog-kind'; value: 'owner' | 'decide' }
  | { kind: 'help' }
  | { kind: 'help-skill'; id: string }
  | { kind: 'help-close' }

export const pointerModal = (s: State) => !!(s.setup || s.person || s.dialog || s.reconcile || s.teamConfirm || s.engage || s.filterField || s.runForm || s.help)

// Targets come only from the rendered frame, never from labels or terminal payloads.
export function point(s: State, a: PointerAction): Step {
  const same = { state: s, effects: [] }
  if (a.kind === 'key') return reduce(s, a.key)
  if (a.kind === 'help') return s.help ? { state: { ...s, help: null }, effects: [] } : openHelp(s)
  if (a.kind === 'help-close') return { state: { ...s, help: null }, effects: [] }
  if (a.kind === 'help-skill') {
    if (!s.help) return openHelp(s, a.id)
    if (s.help.selected === a.id) {
      return { state: { ...s, help: { ...s.help, expanded: !s.help.expanded, scroll: 0 } }, effects: [] }
    }
    return { state: { ...s, help: { ...s.help, selected: a.id, expanded: false, scroll: 0 } }, effects: [] }
  }
  if (a.kind === 'person-field') return s.person ? { state: { ...s, personField: a.field }, effects: [] } : same
  if (a.kind === 'setup-field') {
    if (!s.setup || s.setup.confirmClear) return same
    const next = { ...s, setupField: a.field }
    return a.field === 'posts' ? reduce(next, { name: 'space' }) : a.field === 'clear' ? reduce(next, { name: 'return' }) : { state: next, effects: [] }
  }
  if (s.person || s.setup) return same
  if (a.kind === 'ticket-field') return s.dialog ? { state: { ...s, dialogField: 'ticket' }, effects: [] } : same
  if (a.kind === 'dialog-kind') return s.dialog ? reduce({ ...s, dialogField: 'who' }, { name: a.value === 'owner' ? 'a' : 'd' }) : same
  if (a.kind === 'person') {
    if (!s.dialog) return same
    const people = peopleOf(s), member = people[a.index]
    if (a.index !== -1 && !member) return same
    const next: State = { ...s, dialogField: 'who', dialogIndex: a.index, dialog: { ...s.dialog, handle: member?.handle ?? s.dialog.handle } }
    return a.index === -1 ? reduce(next, { name: 'return' }) : { state: next, effects: [] }
  }
  if (a.kind === 'reconcile') return s.reconcile?.rows[a.index]
    ? reduce({ ...s, reconcile: { ...s.reconcile, index: a.index } }, { name: 'space' }) : same
  if (a.kind === 'filter-field') return !pointerModal(s) || s.filterField ? { state: { ...s, filterField: a.field }, effects: [] } : same
  if (pointerModal(s)) return same
  if (a.kind === 'tab') return toTab(s, a.tab)
  if (a.kind !== 'row') return same
  let next = s
  if (a.area === 'tickets' && s.tab === 'tickets' && !s.showTeam && ticketsItems(s, buildModel(viewOf(s))).includes(a.id)) next = { ...s, selected: a.id }
  else if (a.area === 'team' && s.tab === 'tickets' && s.showTeam && s.team.some(m => m.handle === a.id)) return { state: { ...s, teamSelected: a.id, me: a.id }, effects: [] }
  else if (a.area === 'runs' && s.tab === 'runs' && runsItems(s).includes(a.id)) next = { ...s, runsSelected: a.id }
  else if (a.area === 'messages' && s.tab === 'messages' && s.messages.some(m => m.id === a.id)) next = { ...s, msgSelected: a.id }
  else if (a.area === 'explorer' && s.tab === 'explorer') next = { ...s, explorer: { ...s.explorer, x: { ...s.explorer.x, selected: a.id } } }
  else if (a.area === 'run' && s.tab === 'run' && s.runFile?.entries.some(e => e.id === a.id)) next = { ...s, runSel: a.id }
  if (a.area === 'tickets' && isHead(a.id)) return reduce({ ...s, selected: a.id }, { name: 'return' })
  return next === s ? same : reduce(next, { name: 'return' })
}

export type State = {
  tab: Tab
  board: Board | null; team: Member[]; me: string | null
  filter: Filter; filterField: FilterField | null
  selected: string | null; expanded: string | null; showTeam: boolean
  open: Box[]                              // F61: the open groups' boxes this session; none = all collapsed
  machine: Machine | null; usage: Usage | null; watch: Watch
  relay: string | null                     // band: "RUN-0012 2/4", the first relay run not all done
  runs: RunView[]; runsSelected: string | null; runsExpanded: string | null   // runsSelected: a run id or 'head:<section>'
  runsOpen: RunsSection[]                  // F76: the Workflows tab's open sections (Runs, Workflows); both start open
  runsRead: boolean                        // false until relay's list was first read: 'reading runs…'
  runMode?: 'parallel' | 'sequential'      // F122: execution mode toggle
  engage: Engage | null                    // F85: the engage confirm box up
  dialog: AssignDraft | null; dialogIndex: number    // -1: the cursor is on "+ add person"
  dialogField: DialogField                            // F77: the keys go to the Ticket field or the people
  person: PersonDraft | null; personField: PersonField  // the Add person form, over the dialog or the Team view
  teamSelected: string | null                         // the Team view's row
  teamConfirm: string | null                          // the handle the Team view asks to remove (y/n)
  reconcile: (Reconcile & { index: number }) | null   // F81: the reconcile box, its cursor row
  toast: string | null; notes: string[]
  cols: number; rows: number; now: number; quit: boolean
  repo: string | null                      // the repo root's basename, for the tab bar (app.ts sets it)
  decidedLine: string | null               // the level line relay last decided on
  holdOutcome: string | null               // while red: '' held, else why the hold failed; null = not red
  lockSig: string                          // the stale locks the note lists
  // F66: the Messages tab (teams-uhura's inbox) and the Teams setup form. The form's
  // values live only in this process; the token is drawn masked, never logged.
  messages: Msg[]; msgRead: string | null; msgSelected: string | null; msgExpanded: string | null
  teamsCfg: TeamsCfgView | null
  setup: Setup | null; setupField: SetupField
  help: HelpState | null                       // F127: Help & Skills guide viewer
  explorer: ExState                        // F75: the Explorer tab (ops/explorer.ts)
} & RunState                               // F79: the Run tab's file, row, form, job
export type Setup = SetupValues & { result: string | null; confirmClear: boolean; touched: boolean }

export type Step = { state: State; effects: Effect[] }
// A run's result folded into the state as it then is; it may ask for more effects.
export type Then = (r: RunResult) => (s: State) => State | Step
// stdin (F66): written to the run's standard input - the setup form's values, never argv.
export type Effect = { kind: 'run'; call: Call; args: string[]; then: Then; stdin?: string }
  | { kind: 'poll'; what: 'board' | 'slow' | 'runs' } | { kind: 'quit' }
  | { kind: 'runfile'; scanIfMissing: boolean } | { kind: 'job'; argv: string[]; cwd: string } | { kind: 'stop' }   // F79
  | { kind: 'git'; args: string[]; then: Then }       // F75: read-only git, the host's absolute git
  | { kind: 'mute'; text: string; then?: Then }       // F87: write the watchdog mute file ('' = unmuted); code 1 + err when it failed

// A `then`'s answer as a step: a bare state asks for nothing more.
export const settle = (x: State | Step): Step => ('effects' in x ? x : { state: x, effects: [] })

// A run's result applied at `now`, the clock when it landed (a `then` stamps facts with s.now).
export const afterRun = (e: { then: Then }, r: RunResult, s: State, now: number): Step => settle(e.then(r)({ ...s, now }))

const TABS: Tab[] = ['tickets', 'runs', 'health', 'messages', 'explorer', 'run']

export const initial = (cols: number, rows: number, now: number): State => ({
  tab: 'tickets', board: null, team: [], me: null,
  filter: { app: null, who: null, mine: false, showDone: false }, filterField: null,
  selected: null, expanded: null, showTeam: false, open: [],
  machine: null, usage: null, watch: { level: 'green', reasons: [] }, relay: null,
  runs: [], runsSelected: null, runsExpanded: null, runsOpen: ['runs', 'workflows'], runsRead: false, runMode: 'parallel', engage: null,
  dialog: null, dialogIndex: 0, dialogField: 'who', person: null, personField: 'handle', teamSelected: null, teamConfirm: null, reconcile: null, toast: null, notes: [],
  cols, rows, now, quit: false, repo: null, decidedLine: null, holdOutcome: null, lockSig: '',
  messages: [], msgRead: null, msgSelected: null, msgExpanded: null, teamsCfg: null, setup: null, setupField: 'token',
  help: null,
  explorer: EX0,
  ...RUN_INITIAL,
})

export const viewOf = (s: State): View => ({
  board: s.board, team: s.team, me: s.me, filter: s.filter, filterOpen: s.filterField !== null,
  selected: s.selected, expanded: s.expanded, open: s.open, cols: s.cols,
})

export const activeUser = (s: State): string | null => s.me ?? s.teamSelected ?? null

export function ticketsItems(s: State, m: Model): string[] {
  const user = activeUser(s)
  if (!user || !s.board) return m.items
  const tickets = visible(s.board, s.filter, s.me)
  const assigned = assignedTickets(tickets, user)
  const decide = decideTickets(tickets, user)
  const assignedOpen = isUserSectionOpen(s.open as string[], 'assigned')
  const decideOpen = isUserSectionOpen(s.open as string[], 'decide')
  return [
    'head:assigned',
    ...(assignedOpen ? assigned.map(t => 'assigned:' + t.id) : []),
    'head:decide',
    ...(decideOpen ? decide.map(t => 'decide:' + t.id) : []),
    ...m.items,
  ]
}

export function onBoard(s: State, board: Board, team: Member[], me: string | null): State {
  const next: State = { ...s, board, team, me }
  const m = buildModel(viewOf(next))
  const items = ticketsItems(next, m)
  const selected = items.includes(s.selected ?? '') ? s.selected : (m.items[0] ?? items[0] ?? null)
  const expanded = s.expanded && board.tickets.some(t => t.id === s.expanded) ? s.expanded : null
  return { ...next, selected, expanded }
}

// --- words, as the mod says them (assign.tsx, register.tsx, runstab.tsx) ---

const quote = (a: string) => (/[\s"]/.test(a) || a === '' ? '"' + a.replace(/"/g, '\\"') + '"' : a)
const ran = (argv: string[]) => 'ran: ' + argv.map(quote).join(' ')
// ticket-meta's output less the ticket line it echoes: warnings, "no change", the rest.
const notesOf = (out: string) => out.split(/\r?\n/).map(l => l.trimEnd()).filter(l => l && !/^\s*- \[/.test(l))
const why = (r: RunResult, what: string) => r.err.trim() || r.out.trim() || `${what} exited ${r.code}`
const timedOut = (r: RunResult) => r.code === -1 && /^timed out/.test(r.err)
const word = (b: Box) => (b === '?' ? 'decision' : STATE_NAME[b])
const ticketOf = (s: State, id: string): Ticket | null => s.board?.tickets.find(t => t.id === id) ?? null
const toast = (s: State, text: string): State => ({ ...s, toast: text })
const run = (call: Call, args: string[], then: Then, stdin?: string): Effect =>
  (stdin === undefined ? { kind: 'run', call, args, then } : { kind: 'run', call, args, then, stdin })

function addNotes(xs: string[], add: string[], drop: (n: string) => boolean = () => false): string[] {
  return [...xs.filter(n => !drop(n)), ...add.filter(n => !xs.includes(n) || drop(n))]
}

// --- the assign / decide dialog ---

// The handle a fresh dialog starts on: the ticket's own (owner or decider) when on the
// team, else me, else the first member - as team.md writes it (moved verbatim from assign.tsx).
// F77: no ticket yet (its ID still to be typed) - me, else the first member.
export function startHandle(t: Ticket | null, kind: 'owner' | 'decide', team: Member[], me: string | null): string | null {
  const on = (h: string | null) => team.find(m => sameHandle(m.handle, h))?.handle ?? null
  return on(t ? (kind === 'owner' ? t.owner : t.decide) : null) ?? on(me) ?? team[0]?.handle ?? null
}

// The people the dialog lists: the team, plus the draft's handle when it is not on it.
function peopleOf(s: State): Member[] {
  const d = s.dialog
  return d?.handle && !s.team.some(m => m.handle === d.handle) ? [...s.team, { handle: d.handle, emails: [] }] : s.team
}

// F77: the heading names the ticket the Ticket field resolves to, else "a ticket".
const titleOf = (d: AssignDraft, t: Ticket | null) => `Assign ${t ? t.id : 'a ticket'}${d.kind === 'decide' ? ' for a decision' : ''}`
// The ticket the dialog's Ticket field names (typed in any case), or null.
const dialogTicket = (s: State): Ticket | null => (s.dialog ? ticketById(s.board?.tickets, s.dialog.id) : null)

export function dialogLines(s: State): string[] {
  const d = s.dialog
  if (!d) return []
  const tk = dialogTicket(s)
  const from: Box = tk?.box ?? ' '
  const to: Box = d.kind === 'decide' ? '?' : ' '
  const radio = (k: AssignDraft['kind']) => (d.kind === k ? '(•)' : '( )')
  // F77: the Ticket line - the field as typed ('_' the cursor while the keys are on it),
  // then what it resolves to.
  const said = tk ? `[${tk.box}] ${STATE_NAME[tk.box]} · ${tk.title}` : d.id.trim() ? 'no such ticket' : 'type a ticket ID, e.g. F12'
  const out = [titleOf(d, tk), `  Ticket  ${d.id}${s.dialogField === 'ticket' ? '_' : ''} · ${said}`,
    `  ${radio('owner')} implementation   ${radio('decide')} decision          a / d`]
  const onAdd = s.dialogIndex === -1
  if (!s.team.length) out.push('  no .skillator/team.md yet - + add person creates it')
  for (const m of peopleOf(s)) out.push(`  ${!onAdd && m.handle === d.handle ? '› ' : '  '}${m.handle.padEnd(10)}${m.name ?? ''}`.trimEnd())
  out.push(`  ${onAdd ? '› ' : '  '}+ add person`)
  if (tk) out.push(`  Change  [${from}] ${word(from)} → [${to}] ${word(to)}, ${d.kind === 'decide' ? 'decide' : 'owner'} ${d.handle ?? '(pick someone)'}`)
  if (tk?.box === '~') {
    out.push(tk.session
      ? `  ! ${tk.id} is in progress under ${tk.session} - this moves it to ${word(to)}; the tag stays - tell that session`
      : `  ! ${tk.id} is in progress - this moves it to ${word(to)}; tell whoever is working it`)
  }
  out.push(`  Runs    ticket-meta ${d.kind === 'decide' ? 'decide' : 'assign'} ${tk?.id ?? '<ID>'} ${d.handle ?? '@?'}`)
  if (d.result) out.push(`  ${d.result}`)
  out.push('  Enter confirm · Esc cancel')
  return out
}

// F61: a header selected is no ticket - `ticket` is null there. F77: the dialog opens all
// the same, the keys on its empty Ticket field for the ID to be typed; with a ticket the
// field is prefilled (tab reaches it to change it) and the keys start on the people.
function openDialog(s: State, kind: AssignDraft['kind']): State {
  const raw = rawTicketId(s.selected)
  const id = raw && !isHead(raw) ? raw : buildModel(viewOf(s)).ticket
  const t = id ? ticketOf(s, id) : null
  const handle = startHandle(t, kind, s.team, s.me)
  const dialog: AssignDraft = { id: t?.id ?? '', kind, handle, result: null }
  // No one to start on (no team file): the cursor starts on "+ add person".
  return { ...s, dialog, dialogField: t ? 'who' : 'ticket',
    dialogIndex: handle ? Math.max(0, s.team.findIndex(m => m.handle === handle)) : -1 }
}

// Assign: ticket-meta assign|decide <ID> @h. Done: a toast with what it said and the
// command that ran, the dialog closed. Refused: its stderr in the dialog.
function confirmAssign(s: State): Step {
  const d = s.dialog
  if (!d) return { state: s, effects: [] }
  // F77: Assign waits for the Ticket field to name a ticket; ticket-meta gets the board's ID.
  const tk = dialogTicket(s)
  if (!tk) return { state: { ...s, dialog: { ...d, result: d.id.trim() ? 'no such ticket' : 'type a ticket ID first' } }, effects: [] }
  if (!d.handle) return { state: { ...s, dialog: { ...d, result: 'pick someone first' } }, effects: [] }
  const handle = d.handle
  const id = tk.id
  const then: Then = r => x => {
    if (r.code !== 0) {
      const text = timedOut(r) ? 'ticket-meta did not finish in 30 s' : why(r, 'ticket-meta')
      const next = x.dialog ? { ...x, dialog: { ...x.dialog, result: text } } : x
      return timedOut(r) ? toast(next, text) : next
    }
    const t = ticketOf(x, id)
    const closed = !t || t.box === 'x' || t.box === '-'
    const state = d.kind === 'decide' ? 'pending decision' : 'pending'
    const role = d.kind === 'decide' ? `for ${handle} to decide` : `owned by ${handle}`
    const head = `✓ ${id} ${closed ? 'reopened as' : 'now'} ${state}, ${role}${t ? ': ' + t.title : ''}`
    return { ...x, dialog: null, toast: [head, ...notesOf(r.out), ran(r.argv)].join('\n') }
  }
  return { state: s, effects: [run(d.kind === 'decide' ? 'meta-decide' : 'meta-assign', [id, handle], then)] }
}

// F77: the keys on the Ticket field - a printable character is text there (a / d / j
// are letters of an ID, not keys), backspace deletes, tab goes to the people.
function ticketFieldKey(s: State, k: Key): Step {
  const d = s.dialog!
  const edit = (id: string): Step => ({ state: { ...s, dialog: { ...d, id, result: null } }, effects: [] })
  switch (k.name) {
    case 'tab': case 'down': return { state: { ...s, dialogField: 'who' }, effects: [] }
    case 'backspace': return edit([...d.id].slice(0, -1).join(''))
    case 'return': case 'enter': return confirmAssign(s)
    case 'escape': return { state: { ...s, dialog: null, dialogIndex: 0, dialogField: 'who' }, effects: [] }
  }
  const ch = k.sequence
  if (!k.ctrl && ch && [...ch].length === 1 && ch > ' ' && ch !== '\x7f' && [...d.id].length < 20) return edit(d.id + ch)
  return { state: s, effects: [] }
}

function dialogKey(s: State, k: Key): Step {
  const d = s.dialog!
  if (s.dialogField === 'ticket') return ticketFieldKey(s, k)
  const same = { state: s, effects: [] }
  const people = peopleOf(s)
  const onAdd = s.dialogIndex === -1
  // The rows are the people, then "+ add person" (position people.length, kept as -1).
  const move = (by: number): Step => {
    const at = onAdd ? people.length : Math.max(0, people.findIndex(m => m.handle === d.handle))
    const i = Math.min(Math.max(0, at + by), people.length)
    const m = people[i]
    if (!m) return { state: { ...s, dialog: { ...d, result: null }, dialogIndex: -1 }, effects: [] }
    return { state: { ...s, dialog: { ...d, handle: m.handle, result: null }, dialogIndex: i }, effects: [] }
  }
  switch (k.name) {
    case 'up': case 'k': return move(-1)
    case 'down': case 'j': return move(1)
    case 'a': return { state: { ...s, dialog: { ...d, kind: 'owner', result: null } }, effects: [] }
    case 'd': return { state: { ...s, dialog: { ...d, kind: 'decide', result: null } }, effects: [] }
    case 'n': return onAdd ? { state: openPerson(s, 'assign'), effects: [] } : same
    case 'tab': return { state: { ...s, dialogField: 'ticket' }, effects: [] }
    case 'return': case 'enter': return onAdd ? { state: openPerson(s, 'assign'), effects: [] } : confirmAssign(s)
    case 'escape': return { state: { ...s, dialog: null, dialogIndex: 0, dialogField: 'who' }, effects: [] }
    default: return same
  }
}

// --- team: the Add person form (from the dialog or the Team view) and remove ---

const HANDLE = /^@[a-z0-9_-]+$/
const PERSON_FIELDS: PersonField[] = ['handle', 'name', 'emails']

// Moved verbatim from assign.tsx (addArgs and its check): the handle lower-cased with one
// '@', the name or the bare handle, the emails comma-joined.
const handleOf = (s: string) => '@' + s.trim().replace(/^@+/, '').toLowerCase()
const emailsOf = (s: string) => s.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean).join(',')
const nameOf = (p: PersonDraft) => p.name.trim() || handleOf(p.handle).slice(1)
export const personArgs = (p: PersonDraft): [string, string, string] => [handleOf(p.handle), nameOf(p), emailsOf(p.emails)]

export function personError(p: PersonDraft): string | null {
  const [h, , emails] = personArgs(p)
  return !HANDLE.test(h) ? 'handle: lower-case a-z 0-9 _ - after the @'
    : !emails ? 'emails: at least one (a@x, b@y)' : null
}

function openPerson(s: State, back: PersonDraft['back']): State {
  return { ...s, person: { handle: '', name: '', emails: '', result: null, back }, personField: 'handle', teamConfirm: null }
}

// The form as text (the mock's "Add person" frame): the active field carries the cursor
// '_'; the command shown is the one Enter runs.
export function formLines(s: State): string[] {
  const p = s.person
  if (!p) return []
  const cur = (f: PersonField) => (s.personField === f ? '_' : '')
  const [h, name, emails] = personArgs(p)
  const who = p.handle.trim().replace(/^@+/, '') ? `${h} ${quote(name)}` : '@? ?'
  const out = ['Add person',
    `  Handle   @${p.handle.replace(/^@+/, '')}${cur('handle')}`,
    `  Name     ${p.name}${cur('name')}`,
    `  Emails   ${p.emails}${cur('emails')}`,
    '',
    `  Runs    ticket-meta team add ${who} ${emails || '?'}`]
  if (p.result) out.push(`  ${p.result}`)
  out.push('  tab next field · enter add · esc cancel')
  return out
}

const closePerson = (s: State): State => ({ ...s, person: null, personField: 'handle' })

// Enter: checked as the mod does, then ticket-meta team add @h "Name" a@x,b@y (the first
// add creates team.md). Done: a toast, the team read again, and - opened from the
// dialog - the dialog back with the new person picked. Refused: its stderr in the form.
function addPerson(s: State): Step {
  const p = s.person!
  const bad = personError(p)
  if (bad) return { state: { ...s, person: { ...p, result: bad } }, effects: [] }
  const [h, name, emails] = personArgs(p)
  const then: Then = r => x => {
    if (r.code !== 0) {
      const text = timedOut(r) ? 'ticket-meta did not finish in 30 s' : why(r, 'ticket-meta')
      return x.person ? { ...x, person: { ...x.person, result: text } } : toast(x, text)
    }
    const y: State = { ...closePerson(x), toast: [`✓ ${h} added to .skillator/team.md`, ran(r.argv)].join('\n') }
    if (p.back === 'assign' && x.dialog) {
      y.dialog = { ...x.dialog, handle: h, result: null }
      y.dialogIndex = Math.max(0, peopleOf(y).findIndex(m => m.handle === h))
    } else if (p.back === 'team') y.teamSelected = h
    return { state: y, effects: [{ kind: 'poll', what: 'board' }] }
  }
  return { state: s, effects: [run('meta-team-add', [h, name, emails], then)] }
}

function personKey(s: State, k: Key): Step {
  const p = s.person!
  const f = s.personField
  const edit = (v: string): Step => ({ state: { ...s, person: { ...p, [f]: v, result: null } }, effects: [] })
  const field = (by: number): Step => {
    const at = PERSON_FIELDS.indexOf(f)
    return { state: { ...s, personField: PERSON_FIELDS[(at + by + PERSON_FIELDS.length) % PERSON_FIELDS.length]! }, effects: [] }
  }
  switch (k.name) {
    case 'escape': return { state: closePerson(s), effects: [] }
    case 'tab': return field(k.shift ? -1 : 1)
    case 'up': return field(-1)
    case 'down': return field(1)
    case 'backspace': return edit([...p[f]].slice(0, -1).join(''))
    case 'return': case 'enter': return addPerson(s)
  }
  const ch = k.sequence
  if (!k.ctrl && ch && [...ch].length === 1 && ch >= ' ' && ch !== '\x7f' && [...p[f]].length < 200) return edit(p[f] + ch)
  return { state: s, effects: [] }
}

// y: ticket-meta team remove @h (it warns on open tickets still naming them; the warning
// goes in the toast). The team is read again.
function removeMember(s: State, h: string): Step {
  const then: Then = r => x => {
    if (r.code !== 0) return toast(x, [`✗ ticket-meta team remove ${h} refused: ${r.err.trim() || r.out.trim() || 'exit ' + r.code}`, ran(r.argv)].join('\n'))
    const said = notesOf(r.out).filter(l => !/^removed:/.test(l))
    return { state: toast(x, [`✓ ${h} removed from .skillator/team.md`, ...said, ran(r.argv)].join('\n')), effects: [{ kind: 'poll', what: 'board' }] }
  }
  return { state: { ...s, teamConfirm: null }, effects: [run('meta-team-remove', [h], then)] }
}

// F80 l: ticket-meta team lead @h - it rules who may (a refusal goes in the toast).
function makeLead(s: State, h: string): Step {
  const then: Then = r => x => {
    if (r.code !== 0) return toast(x, [`✗ ticket-meta team lead ${h} refused: ${r.err.trim() || r.out.trim() || 'exit ' + r.code}`, ran(r.argv)].join('\n'))
    const said = notesOf(r.out).filter(l => !/^lead:/.test(l))
    return { state: toast(x, [`✓ ${h} is the lead`, ...said, ran(r.argv)].join('\n')), effects: [{ kind: 'poll', what: 'board' }] }
  }
  return { state: s, effects: [run('meta-team-lead', [h], then)] }
}

// The Team view's row: the one picked while still on the team, else the first member.
export const teamRow = (s: State): string | null =>
  s.team.some(m => m.handle === s.teamSelected) ? s.teamSelected : s.team[0]?.handle ?? null

function teamKey(s: State, k: Key): Step {
  const same = { state: s, effects: [] }
  if (s.teamConfirm) {
    if (k.name === 'y') return removeMember(s, s.teamConfirm)
    return k.name === 'n' || k.name === 'escape' ? { state: { ...s, teamConfirm: null }, effects: [] } : same
  }
  const hs = s.team.map(m => m.handle)
  const cur = teamRow(s)
  const move = (by: number): Step => {
    const to = hs[hs.indexOf(cur ?? '') + by]
    return { state: to ? { ...s, teamSelected: to } : s, effects: [] }
  }
  switch (k.name) {
    case 't': return { state: { ...s, showTeam: false, me: cur ?? s.me }, effects: [] }
    case 'escape': return { state: { ...s, showTeam: false }, effects: [] }
    case 'up': case 'k': return move(-1)
    case 'down': case 'j': return move(1)
    case 'n': return { state: openPerson(s, 'team'), effects: [] }
    case 'delete': case 'backspace': return cur ? { state: { ...s, teamConfirm: cur }, effects: [] } : same
    case 'l': return cur ? makeLead(s, cur) : same
    case 'return': case 'enter': return cur ? { state: { ...s, showTeam: false, me: cur, teamSelected: cur }, effects: [] } : same
    case 'space': return cur ? { state: { ...s, me: cur, teamSelected: cur }, effects: [] } : same
    default: return same
  }
}

// D: ticket-meta decided <ID> ([?] -> [ ], the [decide:] tag kept).
function decided(s: State): Step {
  const raw = rawTicketId(s.selected)
  const id = raw && !isHead(raw) ? raw : buildModel(viewOf(s)).ticket
  const t = id ? ticketOf(s, id) : null
  if (!t || t.box !== '?' || !t.decide) {
    return { state: toast(s, 'D marks a decision taken: only on a [?] row with a [decide:] tag'), effects: [] }
  }
  const then: Then = r => x => r.code !== 0
    ? toast(x, [`✗ ticket-meta decided ${t.id} refused: ${r.err.trim() || r.out.trim() || 'exit ' + r.code}`, ran(r.argv)].join('\n'))
    : toast(x, [`✓ ${t.id} decided, now pending: ${t.title}`, ...notesOf(r.out), ran(r.argv)].join('\n'))
  return { state: s, effects: [run('meta-decided', [t.id], then)] }
}

// --- F81: reconcile (`c`): ticket-meta reconcile's proposals; accept all / pick / none ---

// The box's title, then a row per proposal: a kept one (evidence unclear) is never picked.
export function reconcileLines(s: State): string[] {
  const v = s.reconcile
  if (!v) return []
  return [`Reconcile tickets - ${v.rows.filter(canApply).length} to change`, ...v.rows.map((p, i) => {
    const cur = i === v.index ? '› ' : '  '
    return canApply(p)
      ? `${cur}${v.picked.includes(p.id) ? '[x]' : '[ ]'} ${p.id}  ${STATE_NAME[p.from]} → ${STATE_NAME[p.to]}  ${p.why}`
      : `${cur}    ${p.id}  ${STATE_NAME[p.from]} stays - ${p.why}`
  })]
}

function openReconcile(s: State): Step {
  const then: Then = r => x => {
    if (r.code !== 0) return toast(x, `✗ ticket-meta reconcile refused: ${why(r, 'ticket-meta')}`)
    const rows = parseReconcile(r.out)
    if (!rows.length) return toast(x, 'reconcile - every [!] [ ] [~] row matches its evidence')
    return { ...x, reconcile: { rows, picked: [], index: Math.max(0, rows.findIndex(canApply)) } }
  }
  return { state: s, effects: [run('meta-reconcile', [], then)] }
}

// all: every row that changes; else the picked ones. Each one's ticket-meta run adds its
// line to the toast (the mod's words), then the board is read again.
function applyReconcile(s: State, all: boolean): Step {
  const v = s.reconcile!
  const todo = v.rows.filter(p => canApply(p) && (all || v.picked.includes(p.id)))
  if (!todo.length) return { state: toast(s, 'nothing picked - space picks a row, a accepts all'), effects: [] }
  const effects: Effect[] = todo.map(p => {
    const { call, args } = applyOf(p)
    return run(call, args, r => x => {
      const lines = [...(x.toast ?? '').split('\n').slice(1), appliedLine(p, r.code === 0 ? null : why(r, 'ticket-meta'))]
      return toast(x, [appliedHead(lines.filter(l => l.startsWith('✓')).length, todo.length), ...lines].join('\n'))
    })
  })
  return { state: { ...s, reconcile: null, toast: `reconcile: applying ${todo.length}` }, effects: [...effects, { kind: 'poll', what: 'board' }] }
}

function reconcileKey(s: State, k: Key): Step {
  const v = s.reconcile!
  const set = (r: NonNullable<State['reconcile']>): Step => ({ state: { ...s, reconcile: r }, effects: [] })
  const p = v.rows[v.index]
  switch (k.name) {
    case 'up': case 'k': return set({ ...v, index: Math.max(0, v.index - 1) })
    case 'down': case 'j': return set({ ...v, index: Math.min(v.rows.length - 1, v.index + 1) })
    case 'space': return p && canApply(p) ? set({ ...v, picked: v.picked.includes(p.id) ? v.picked.filter(i => i !== p.id) : [...v.picked, p.id] }) : set(v)
    case 'a': return applyReconcile(s, true)
    case 'return': case 'enter': return applyReconcile(s, false)
    case 'escape': case 'n': return { state: { ...s, reconcile: null }, effects: [] }
    default: return set(v)
  }
}

// --- the filter row: ← → pick a field, ↑ ↓ its value ---

function fieldsOf(s: State): FilterField[] {
  return s.team.length ? ['app', 'who', 'mine'] : ['app']
}

function filterKey(s: State, k: Key): Step {
  const f = s.filter
  const field = s.filterField!
  const set = (filter: Filter): Step => ({ state: { ...s, filter }, effects: [] })
  const fields = fieldsOf(s)
  const at = Math.max(0, fields.indexOf(field))
  const step = (by: number) => {
    if (field === 'mine') return set({ ...f, mine: !f.mine, who: null })
    const values: (string | null)[] = field === 'app'
      ? [null, ...[...new Set((s.board?.tickets ?? []).flatMap(t => t.apps))].sort()]
      : [null, ...s.team.map(m => m.handle)]
    const cur = values.indexOf(field === 'app' ? f.app : f.who)
    const v = values[Math.min(Math.max(0, cur + by), values.length - 1)] ?? null
    return set(field === 'app' ? { ...f, app: v } : { ...f, who: v, mine: false })
  }
  switch (k.name) {
    case 'left': return { state: { ...s, filterField: fields[(at + fields.length - 1) % fields.length]! }, effects: [] }
    case 'right': return { state: { ...s, filterField: fields[(at + 1) % fields.length]! }, effects: [] }
    case 'up': case 'k': return step(-1)
    case 'down': case 'j': return step(1)
    case 'escape': case 'return': case 'enter': case 'f': return { state: { ...s, filterField: null }, effects: [] }
    default: return { state: s, effects: [] }
  }
}

// --- the watchdog: machine facts, the red → hold rule, R ---

function redFix(w: Watch): string {
  const disk = w.reasons.some(r => r.startsWith('disk')), mem = w.reasons.some(r => r.startsWith('mem'))
  return disk && mem ? 'Free disk space and memory' : mem ? 'Free memory' : 'Free space'
}
const isLockNote = (n: string) => /^▲ \d+ stale locks?, not deleted:/.test(n)

function lockNote(m: Machine): string {
  const w = Math.max(30, ...m.locks.map(l => l.path.length + 2))
  const n = m.locks.length
  return [`▲ ${n} stale lock${n === 1 ? '' : 's'}, not deleted:`,
    ...m.locks.map(l => `    ${l.path.padEnd(w)}${`${l.ageMin} min`.padEnd(9)}${l.holder}`.trimEnd()),
    '  remove them yourself, or ask Claude to check and clear them'].join('\n')
}

// New facts (register.tsx applyMachine): classify; while red and not held, hold through
// relay-morpheus - every reading, so a failed hold is tried again and a release from
// outside is held again; the toast only when the outcome changes. Locks: one note.
// F87: memory read green while muted - the mute file is emptied and the mute ends here.
export function onMachine(s: State, kv: string, now: number): Step {
  let m = parseMachine(kv, now)
  const effects: Effect[] = []
  let unmuted = false
  if (unmuteDue(m)) {
    const { mute: _, ...rest } = m
    m = rest
    unmuted = true
    effects.push({ kind: 'mute', text: '' })
  }
  const w = classify(m)
  let state: State = { ...s, machine: m, watch: w }
  if (unmuted) state.toast = 'watchdog unmuted - memory reads green; memory red holds again'
  if (w.level !== 'red') state.holdOutcome = null
  else if (m.hold === null) {
    effects.push(run('relay-hold', [w.reasons.join('; ')], r => x => {
      const tail = r.argv.length ? `\nran: ${r.argv.join(' ')}` : ''
      const failed = r.code === 0 ? '' : r.err.trim() || r.out.trim() || `exit ${r.code}`
      let y: State = { ...x, holdOutcome: failed }
      if (failed === x.holdOutcome) return y
      if (!failed) return toast(y, `■ HOLD - ${w.reasons.join('. ')}. New relay stages and GREEN runs are held. ${redFix(w)}, then R to resume.${tail}`)
      y = toast(y, `■ ${w.reasons.join('. ')} - the watchdog hold could not be set: ${failed}${tail}`)
      return { ...y, notes: addNotes(y.notes, [`■ watchdog hold not set: ${failed}${tail.replace('\n', ' - ')}`]) }
    }))
  } else if (state.holdOutcome === null) state.holdOutcome = ''      // red and already held
  const sig = m.locks.map(l => l.path).sort().join('|')
  if (sig !== s.lockSig) state = { ...state, lockSig: sig, notes: addNotes(state.notes, m.locks.length ? [lockNote(m)] : [], isLockNote) }
  return { state, effects }
}

// R (as /ops resume): a fresh reading; only one that is not red releases, through
// relay-morpheus; the toast says what it said and the command that ran.
function resume(s: State): Step {
  const release: Then = r => x => {
    if (!r.argv.length) return toast(x, r.err || NO_SCRIPTS)
    const said = r.out.trim() || r.err.trim()
    const line = `ran: ${r.argv.join(' ')}`
    if (r.code !== 0) return toast(x, `release failed (exit ${r.code}): ${said || 'no output'}\n${line}`)
    const freed = x.machine ? { ...x.machine, hold: null } : null
    return { ...x, toast: `${said}\n${line}`, machine: freed, watch: freed ? classify(freed) : x.watch }
  }
  const read: Then = r => x => {
    if (r.code !== 0 || !r.out.trim()) return toast(x, 'could not read the machine facts - not released')
    const m = onMachine(x, r.out, x.now)
    const w = m.state.watch
    if (w.level === 'red') return { state: toast(m.state, `still red: ${w.reasons.join('; ')} - not released`), effects: m.effects }
    return { state: m.state, effects: [...m.effects, run('relay-release', [], release)] }
  }
  return { state: s, effects: [run('pending-machine', [], read)] }
}

// F87: F on Health (as /ops resume force) - the mute written first, then the hold released
// whatever the reading; a slow poll after, so disk red holds again at once.
function forceResume(s: State): Step {
  const read: Then = r => x => {
    const m = r.code === 0 && r.out.trim() ? parseMachine(r.out, x.now) : null
    const mute = muteText(x.now, m?.memFree ?? null)
    const release: Then = rr => y => {
      if (!rr.argv.length) return toast(y, rr.err || NO_SCRIPTS)
      const said = rr.out.trim() || rr.err.trim()
      const line = `ran: ${rr.argv.join(' ')}`
      if (rr.code !== 0) return toast(y, `release failed (exit ${rr.code}): ${said || 'no output'}\n${line}`)
      const freed = y.machine ? { ...y.machine, hold: null, mute } : null
      return { state: { ...y, toast: `${said}\n${mutedWords(mute)}, ${mute.slice(mute.indexOf(' ') + 1)} - ${MUTED_HOW}\n${line}`,
        machine: freed, watch: freed ? classify(freed) : y.watch }, effects: [{ kind: 'poll', what: 'slow' }] }
    }
    const wrote: Then = w => y => (w.code !== 0
      ? toast(y, `could not write ${MUTE_FILE}: ${w.err} - not released`)
      : { state: y, effects: [run('relay-release', [], release)] })
    return { state: x, effects: [{ kind: 'mute', text: mute, then: wrote }] }
  }
  return { state: s, effects: [run('pending-machine', [], read)] }
}

// --- usage: watch-cortana's level line, relay's decision ---

// A reading with no window keeps the last one's (it then shows its age). The hold decision
// is relay-morpheus's own, asked again only when the level line changes; a failed ask
// leaves it unknown and asks again next time.
export function onUsage(s: State, levelOut: string, now: number): Step {
  const line = levelOut.split(/\r?\n/).map(l => l.trim()).find(Boolean) ?? ''
  const u = usageFromLevel(line, now)
  const prev = s.usage
  const usage: Usage = { ...u, five: u.five ?? prev?.five ?? null, seven: u.seven ?? prev?.seven ?? null, decision: prev?.decision ?? null }
  const ask = levelLine(usage, now)
  if (ask === s.decidedLine) return { state: { ...s, usage }, effects: [] }
  const then: Then = r => x => {
    const said = r.code === 0
      ? r.out.split('\n').map(l => l.trim()).find(l => /^(RELEASE|HOLD) \S+( 7d)?$|^UNOBSERVABLE$/.test(l)) ?? null
      : null
    return { ...x, decidedLine: said ? x.decidedLine : null, usage: x.usage ? { ...x.usage, decision: said } : x.usage }
  }
  return { state: { ...s, usage, decidedLine: ask }, effects: [run('relay-decide', [ask], then)] }
}

// --- runs ---

export function onRuns(s: State, list: string, chains: Record<string, string>, scripts: Record<string, string> = {}): State {
  const runs = orderRuns(parseRuns(list, chains, scripts))   // F99: finished runs after the active ones
  const first = runs.find(x => x.done < x.total)
  const runsSelected = runs.some(r => r.id === s.runsSelected) || isHead(s.runsSelected) ? s.runsSelected : runs[0]?.id ?? null
  return { ...s, runs, runsSelected, runsRead: true, relay: first ? `${first.id} ${first.done}/${first.total}` : null }
}

// F76: the Workflows tab's cursor walks each section's header and the runs of an open Runs
// section (Workflows draws no rows here: the Workflow tool is not observable outside the
// host that runs it). A run hidden in a closed section shows as its header selected, and
// stays the one stored, so opening the section lands back on it - as F61's groups.
export function runsItems(s: State): string[] {
  return RUNS_SECTIONS.flatMap(sec => [headKey(sec), ...(sec === 'runs' && s.runsOpen.includes('runs') ? s.runs.map(r => r.id) : [])])
}
export function runsCursor(s: State): string {
  const items = runsItems(s)
  const want = s.runsSelected
  if (want && items.includes(want)) return want
  return items[0]!                          // a hidden run (or none): the Runs header
}

// F85: e engages the run under the cursor - refused (a toast naming the driver) while another
// driver is live, else the confirm box. No session to submit into: Enter shows the exact
// command to paste - after relay-morpheus queue-run add for a run with no script.
function openEngage(s: State): Step {
  const r0 = s.runs.find(r => r.id === runsCursor(s))
  if (!r0) return { state: toast(s, 'e engages the run under the cursor'), effects: [] }
  const e = engageOf(r0, s.now)
  if ('refused' in e) return { state: toast(s, e.refused), effects: [] }
  return { state: { ...s, engage: { id: r0.id, ...e } }, effects: [] }
}
export function engageLines(s: State): string[] {
  const g = s.engage
  if (!g) return []
  return [`Engage ${g.id}?`, ...(g.queue ? [`First    relay-morpheus queue-run add ${g.id}`] : []), `Paste    ${g.text}`]
}
function engageKey(s: State, k: Key): Step {
  const g = s.engage!
  const s0 = { ...s, engage: null }
  if (k.name === 'escape') return { state: s0, effects: [] }
  if (k.name !== 'return' && k.name !== 'enter') return { state: s, effects: [] }
  if (!g.queue) return { state: toast(s0, `Paste into your CLI:\n${g.text}`), effects: [] }
  const id = g.id
  const then: Then = r => x => {
    const tail = r.argv.length ? `\nran: ${r.argv.join(' ')}` : ''
    if (r.code !== 0) return toast(x, `■ ${id} not queued: ${r.err.trim() || r.out.trim() || `exit ${r.code}`}${tail}`)
    const said = r.out.trim() || r.err.trim()
    return { state: toast(x, `✓ ${id} queued${said ? ` - ${said}` : ''}. Paste its continue prompt into your CLI:\n${continuePrompt(id)}${tail}`),
      effects: [{ kind: 'poll', what: 'runs' }] }
  }
  return { state: s0, effects: [run('relay-queue-add', [id], then)] }
}

function rerunRun(s: State): Step {
  const cur = runsCursor(s)
  const r0 = s.runs.find(r => r.id === cur)
  if (!r0) return { state: toast(s, 'r reruns the run under the cursor'), effects: [{ kind: 'poll', what: 'runs' }] }
  const then: Then = r => x => {
    if (r.code !== 0) return toast(x, `■ ${r0.id} rerun failed: ${r.err.trim() || r.out.trim() || `exit ${r.code}`}`)
    return { state: toast(x, `✓ ${r0.id} queued for rerun. Continue prompt:\n${continuePrompt(r0.id)}`), effects: [{ kind: 'poll', what: 'runs' }] }
  }
  return { state: toast(s, `Rerunning ${r0.id}…`), effects: [run('relay-queue-add', [r0.id], then)] }
}

function pushPendingRun(s: State): Step {
  const cur = runsCursor(s)
  const r0 = s.runs.find(r => r.id === cur)
  if (!r0) return { state: toast(s, 'p pushes pending stages of the run under cursor to a follow-up run'), effects: [] }
  const pend = r0.stages.filter(st => st.state === 'pending' || st.state === ' ')
  if (!pend.length) return { state: toast(s, `No pending stages left in ${r0.id} to push`), effects: [] }
  const tickets = pend.flatMap(st => stageTickets(st)).filter(Boolean)
  const then: Then = r => x => {
    if (r.code !== 0) return toast(x, `■ push pending failed: ${r.err.trim() || r.out.trim() || 'exit ' + r.code}`)
    return { state: toast(x, `✓ Pushed ${pend.length} pending stages (${tickets.join(' ')}) from ${r0.id} to follow-up run`), effects: [{ kind: 'poll', what: 'runs' }] }
  }
  return {
    state: toast(s, `Pushing ${pend.length} pending stages of ${r0.id} to follow-up run…`),
    effects: [run('relay-queue-add', [r0.id], then)]
  }
}

function toggleMode(s: State): Step {
  const next = s.runMode === 'sequential' ? 'parallel' : 'sequential'
  return { state: { ...s, runMode: next, toast: `Mode: ${next === 'parallel' ? 'parallel (||)' : 'sequential (seq)'}` }, effects: [] }
}

function runsKey(s: State, k: Key): Step {
  const items = runsItems(s)
  const cur = runsCursor(s)
  const move = (by: number): Step => {
    const to = items[items.indexOf(cur) + by]
    return { state: to ? { ...s, runsSelected: to } : s, effects: [] }
  }
  switch (k.name) {
    case 'up': case 'k': return move(-1)
    case 'down': case 'j': return move(1)
    case 'return': case 'enter': {
      // on a header: open or close its section, the header stays selected - unless it
      // stands for a run hidden in it (the stored selection), which opening lands back on
      if (isHead(cur)) {
        const sec = cur.slice(HEAD.length) as RunsSection
        const keep = sec === 'runs' && s.runs.some(r => r.id === s.runsSelected)
        return { state: { ...s, runsSelected: keep ? s.runsSelected : cur, runsOpen: toggleGroup(s.runsOpen, sec) }, effects: [] }
      }
      return { state: { ...s, runsExpanded: s.runsExpanded !== cur ? cur : null }, effects: [] }
    }
    case 'e': return openEngage(s)
    case 'r': return rerunRun(s)
    case 'p': return pushPendingRun(s)
    case 'm': return toggleMode(s)
    default: return { state: s, effects: [] }
  }
}

// --- tickets ---

function ticketsKey(s: State, k: Key): Step {
  const same = { state: s, effects: [] }
  if (s.showTeam) return teamKey(s, k)
  const m = buildModel(viewOf(s))
  const items = ticketsItems(s, m)
  // F61: up/down walk the group headers and the rows of open groups (the model's items).
  const move = (by: number): Step => {
    const cur = items.includes(s.selected ?? '') ? s.selected : m.selected
    const at = cur === null ? -1 : items.indexOf(cur)
    const to = at < 0 ? undefined : items[at + by]
    return { state: to ? { ...s, selected: to } : s, effects: [] }
  }
  const toggleHeader = (id: string): Step => {
    if (id === 'head:assigned') {
      return { state: { ...s, open: toggleUserSection(s.open as string[], 'assigned') as any }, effects: [] }
    }
    if (id === 'head:decide') {
      return { state: { ...s, open: toggleUserSection(s.open as string[], 'decide') as any }, effects: [] }
    }
    const g = m.groups.find(x => headKey(x.box) === id)
    const keep = s.selected && !isHead(s.selected) && g?.tickets.some(t => t.id === s.selected)
    return { state: g ? { ...s, selected: keep ? s.selected : id, open: toggleGroup(s.open, g.box) } : s, effects: [] }
  }
  switch (k.name) {
    case 'up': case 'k': return move(-1)
    case 'down': case 'j': return move(1)
    case 'return': case 'enter': {
      const cur = items.includes(s.selected ?? '') ? s.selected : m.selected
      if (cur && isHead(cur)) return toggleHeader(cur)
      const rawId = rawTicketId(cur)
      return { state: { ...s, expanded: rawId && s.expanded !== rawId ? rawId : null }, effects: [] }
    }
    case 'space': {
      const cur = items.includes(s.selected ?? '') ? s.selected : m.selected
      if (cur && isHead(cur)) return toggleHeader(cur)
      return same
    }
    case 'a': return { state: openDialog(s, 'owner'), effects: [] }
    case 'd': return { state: openDialog(s, 'decide'), effects: [] }
    case 'D': return decided(s)
    case 'f': return { state: { ...s, filterField: 'app' }, effects: [] }
    case 'x': return { state: { ...s, filter: { ...s.filter, showDone: !s.filter.showDone } }, effects: [] }
    case 't': return { state: { ...s, showTeam: true }, effects: [] }
    case 'c': return openReconcile(s)
    case 'escape': return { state: { ...s, toast: null }, effects: [] }
    default: return same
  }
}

// --- F66: the Messages tab and the Teams setup form ---

// The inbox (its text) and the read marker's id, as the engine read them.
export function onInbox(s: State, text: string, readId: string | null): State {
  const messages = parseInbox(text)
  return { ...s, messages, msgRead: readId, msgSelected: selectedOf(messages, s.msgSelected) }
}

const teamWhy = (r: RunResult, what: string) => (timedOut(r) ? `${what} did not finish in 30 s` : why(r, what).replace(/^team: /, ''))

const openSetup = (s: State): State =>
  ({ ...s, setup: { ...freshSetup(s.teamsCfg), result: null, confirmClear: false, touched: false }, setupField: 'token' })

// `config show` read: the view kept; `auto` (entering the tab) opens the form when no
// token is saved yet; a form not typed in yet takes the saved port and posts.
const cfgThen = (auto: boolean): Then => r => x => {
  if (r.code !== 0) return x
  const cfg = parseCfgView(r.out)
  if (!cfg) return x
  const y: State = { ...x, teamsCfg: cfg }
  if (y.setup && !y.setup.touched) return { ...y, setup: { ...y.setup, ...freshSetup(cfg) } }
  return auto && !cfg.token && !y.setup ? openSetup(y) : y
}
const showCfg = (auto: boolean): Effect => run('team-config-show', [], cfgThen(auto))

// Enter: checked here first (the same rules teams-uhura applies again), then `config
// save` with the values on stdin. Done: the form goes, a toast, the view read again.
function saveSetup(s: State): Step {
  const v = s.setup!
  const bad = setupError(v, s.teamsCfg)
  if (bad) return { state: { ...s, setup: { ...v, result: bad } }, effects: [] }
  const then: Then = r => x => {
    if (r.code !== 0) return x.setup ? { ...x, setup: { ...x.setup, result: teamWhy(r, 'teams-uhura') } } : toast(x, teamWhy(r, 'teams-uhura'))
    const said = r.out.trim().split(/\r?\n/)[0] ?? ''
    return { state: { ...x, setup: null, toast: [`✓ Teams settings saved${said ? ' - ' + said : ''}`, ran(r.argv)].join('\n') }, effects: [showCfg(false)] }
  }
  return { state: { ...s, setup: { ...v, result: null } }, effects: [run('team-config-save', [], then, setupJson(v))] }
}

function clearSetup(s: State): Step {
  const then: Then = r => x => {
    if (r.code !== 0) return x.setup ? { ...x, setup: { ...x.setup, result: teamWhy(r, 'teams-uhura'), confirmClear: false } } : toast(x, teamWhy(r, 'teams-uhura'))
    return { state: { ...x, setup: null, toast: [`✓ Teams settings cleared - ${r.out.trim().split(/\r?\n/)[0] ?? ''}`, ran(r.argv)].join('\n') }, effects: [showCfg(false)] }
  }
  return { state: { ...s, setup: { ...s.setup!, confirmClear: false } }, effects: [run('team-config-clear', [], then)] }
}

const TEXT_FIELDS: Partial<Record<SetupField, 'token' | 'url' | 'port'>> = { token: 'token', url: 'url', port: 'port' }

function setupKey(s: State, k: Key): Step {
  const v = s.setup!
  const same = { state: s, effects: [] }
  if (v.confirmClear) {
    if (k.name === 'y') return clearSetup(s)
    return k.name === 'n' || k.name === 'escape' ? { state: { ...s, setup: { ...v, confirmClear: false } }, effects: [] } : same
  }
  const f = s.setupField
  const field = (by: number): Step => {
    const at = SETUP_FIELDS.indexOf(f)
    return { state: { ...s, setupField: SETUP_FIELDS[(at + by + SETUP_FIELDS.length) % SETUP_FIELDS.length]! }, effects: [] }
  }
  const set = (patch: Partial<SetupValues>): Step => ({ state: { ...s, setup: { ...v, ...patch, result: null, touched: true } }, effects: [] })
  const tf = TEXT_FIELDS[f]
  switch (k.name) {
    case 'escape': return { state: { ...s, setup: null }, effects: [] }
    case 'tab': return field(k.shift ? -1 : 1)
    case 'up': return field(-1)
    case 'down': return field(1)
    case 'return': case 'enter': return f === 'clear' ? { state: { ...s, setup: { ...v, confirmClear: true, result: null } }, effects: [] } : saveSetup(s)
    case 'backspace': return tf ? set({ [tf]: [...v[tf]].slice(0, -1).join('') }) : same
    case 'left': case 'right': return f === 'posts' ? set({ posts: !v.posts }) : same
    case 'space': if (f === 'posts') return set({ posts: !v.posts }); break
  }
  const ch = k.sequence
  if (f === 'posts' && ch === ' ') return set({ posts: !v.posts })
  if (tf && !k.ctrl && ch && [...ch].length === 1 && ch > ' ' && ch !== '\x7f' && [...v[tf]].length < 2000) return set({ [tf]: v[tf] + ch })
  return same
}

// The form as text: the token masked (one bullet a character; a saved one only "set"),
// the URL as typed or only its host when saved. Never the token, never in a log.
export function setupLines(s: State): string[] {
  const v = s.setup
  if (!v) return []
  const cur = (f: SetupField) => (s.setupField === f ? '› ' : '  ')
  const caret = (f: SetupField) => (s.setupField === f ? '_' : '')
  const cfg = s.teamsCfg
  const out = ['Teams setup',
    `${cur('token')}Token          ${tokenShown(v, cfg)}${caret('token')}`,
    `${cur('url')}Workflow URL   ${urlShown(v, cfg)}${caret('url')}`,
    `${cur('port')}Port           ${v.port}${caret('port')}`,
    `${cur('posts')}Status posts   ${v.posts ? '[x] on' : '[ ] off'}`,
    `${cur('clear')}[ Clear the saved settings ]`,
    '',
    `  Saves ${cfg?.path || '~/.skillator/teams.json'} - this user only, outside every repo`]
  if (v.confirmClear) out.push('  clear the saved Teams settings? (y/n)')
  if (v.result) out.push(`  ${v.result}`)
  out.push('  tab next field · space on/off · enter save · esc cancel')
  return out
}

// m: everything read - teams-uhura writes the marker (the newest id).
function markRead(s: State): Step {
  const id = s.messages.at(-1)?.id
  if (!id) return { state: toast(s, 'no team messages to mark read'), effects: [] }
  const then: Then = r => x => (r.code !== 0 ? toast(x, `✗ not marked read: ${teamWhy(r, 'teams-uhura')}`) : { ...x, msgRead: id })
  return { state: s, effects: [run('team-mark-read', [id], then)] }
}

function messagesKey(s: State, k: Key): Step {
  const cur = selectedOf(s.messages, s.msgSelected)
  switch (k.name) {
    case 'up': case 'k': return { state: { ...s, msgSelected: moveSel(s.messages, s.msgSelected, -1) }, effects: [] }
    case 'down': case 'j': return { state: { ...s, msgSelected: moveSel(s.messages, s.msgSelected, 1) }, effects: [] }
    case 'return': case 'enter': return { state: { ...s, msgSelected: cur, msgExpanded: cur && s.msgExpanded !== cur ? cur : null }, effects: [] }
    case 'm': return markRead(s)
    case 's': return { state: openSetup(s), effects: [showCfg(false)] }
    case 'escape': return { state: { ...s, toast: null }, effects: [] }
    default: return { state: s, effects: [] }
  }
}

function toTab(s: State, tab: Tab): Step {
  const effects: Effect[] = tab === 'runs' && s.tab !== 'runs' ? [{ kind: 'poll', what: 'runs' }] : []
  if (tab === 'messages' && s.tab !== 'messages') effects.push(showCfg(true))
  if (tab === 'explorer' && s.tab !== 'explorer') effects.push(...enterExplorer(s).effects)
  if (tab === 'run' && s.tab !== 'run') effects.push(enterRunEffect())
  return { state: { ...s, tab }, effects }
}


// --- F127: Help & Skills Guide Viewer ---

export const SKILLS: SkillGuide[] = [
  {
    "id": "a11y-toph",
    "name": "a11y-toph",
    "category": "UI & Accessibility",
    "aliases": [
      "toph",
      "a11y"
    ],
    "summary": "Accessibility audits, WCAG compliance, VPAT checks, and a11y test automation",
    "triggers": [
      "can't tab to it",
      "focus ring invisible",
      "screen reader reads nothing",
      "the toast never announces",
      "fails contrast"
    ],
    "usage": "Use when accessibility is the subject: an a11y or WCAG audit of existing code, a VPAT or compliance question, or a reported bug — \"can't tab to it\", \"focus ring invisible\", \"screen reader reads nothing\", \"the toast never announces\", \"fails contrast\", \"no reduced-motion\", \"tap target too small\", \"the error is only red\". Also for wiring axe, pa11y or Lighthouse into tests or CI.",
    "examples": [
      "/skillator:a11y-toph",
      "/skillator:toph"
    ]
  },
  {
    "id": "audit-sherlock",
    "name": "audit-sherlock",
    "category": "Review & Audit",
    "aliases": [
      "sherlock",
      "audit"
    ],
    "summary": "Full-application forensic codebase audits for hidden defects and release readiness",
    "triggers": [
      "sherlock",
      "audit the app",
      "review everything",
      "find what's broken",
      "full code review"
    ],
    "usage": "Use when the user says \"sherlock\", \"audit the app\", \"review everything\", \"find what's broken\", \"full code review\", \"what's wrong with this codebase\", \"check the whole thing\", \"sherlock #482\", wants a full-application forensic audit for the defects nobody filed, or is before a release/handover. Can also be pointed at a single GitHub PR. Merging and conflict resolution are handed to `skillator:merge-smith`.",
    "examples": [
      "/skillator:audit-sherlock",
      "/skillator:sherlock"
    ]
  },
  {
    "id": "build-jarvis",
    "name": "build-jarvis",
    "category": "Build & Feature",
    "aliases": [
      "jarvis",
      "build"
    ],
    "summary": "Single entry point to build features, designs, and F tickets with tiered ceremony",
    "triggers": [
      "add an import command",
      "implement F12",
      "add a settings screen",
      "use fable",
      "cheap"
    ],
    "usage": "Use whenever a feature is to be added, built, implemented or changed, any size - \"add an import command\", \"implement F12\", \"add a settings screen\", a dashboard, a TUI - or an F ticket is about to be worked, from the board or headless. Style words switch tiers: \"use fable\", \"cheap\", \"opus only\", \"full ceremony\".",
    "examples": [
      "/skillator:build-jarvis",
      "/skillator:jarvis",
      "/skillator:build-jarvis F127 \"cheap\"",
      "/skillator:build-jarvis \"use fable\""
    ]
  },
  {
    "id": "build-ultron",
    "name": "build-ultron",
    "category": "Build & Feature",
    "aliases": [
      "ultron (retired, -> jarvis)"
    ],
    "summary": "Retired build skill; redirects to build-jarvis with opus-only mode",
    "triggers": [
      "build-ultron"
    ],
    "usage": "Use only when the user names \"build-ultron\" itself. A retired name, kept for one release so old prompts and docs still resolve; it points at build-jarvis.",
    "examples": [
      "/skillator:build-ultron",
      "/skillator:ultron (retired, -> jarvis)"
    ]
  },
  {
    "id": "build-vision",
    "name": "build-vision",
    "category": "Build & Feature",
    "aliases": [
      "vision (retired, -> jarvis)"
    ],
    "summary": "Retired build skill; redirects to build-jarvis with full ceremony",
    "triggers": [
      "build-vision"
    ],
    "usage": "Use only when the user names \"build-vision\" itself. A retired name, kept for one release so old prompts and docs still resolve; it points at build-jarvis.",
    "examples": [
      "/skillator:build-vision",
      "/skillator:vision (retired, -> jarvis)"
    ]
  },
  {
    "id": "chief-fury",
    "name": "chief-fury",
    "category": "Workflow & Orchestration",
    "aliases": [
      "fury",
      "dri"
    ],
    "summary": "Directly Responsible Individual owning long-running goals across multiple sessions",
    "triggers": [
      "you own getting X to v1",
      "be the DRI",
      "chief of staff",
      "I'm away for a month, keep it moving",
      "I won't remember and neither will you"
    ],
    "usage": "Use when one session is handed a long-running goal to own across weeks and sessions - \"you own getting X to v1\", \"be the DRI\", \"chief of staff\", \"I'm away for a month, keep it moving\", \"I won't remember and neither will you\" - or when a decision on such a goal touches several seats and needs a board meeting.",
    "examples": [
      "/skillator:chief-fury",
      "/skillator:fury"
    ]
  },
  {
    "id": "clone-odo",
    "name": "clone-odo",
    "category": "Product & Market",
    "aliases": [
      "odo",
      "clone"
    ],
    "summary": "Clean-room app cloning, app store review complaint analysis, and UI mapping",
    "triggers": [
      "Clone this app",
      "build my own version of X",
      "map X's screens",
      "how close is my clone",
      "rebrand the clone"
    ],
    "usage": "Use before quoting or counting what users hate about an app - top complaints from a reviews.csv or .skillator/clone/, a quote and count each, for an investor or pitch, or review rows lacking a link. \"Clone this app\" (web, Android, iOS, Windows), \"build my own version of X\", \"map X's screens\", \"how close is my clone\", \"rebrand the clone\", or its URL, App Store, Google Play or Microsoft Store link.",
    "examples": [
      "/skillator:clone-odo",
      "/skillator:odo"
    ]
  },
  {
    "id": "code-vader",
    "name": "code-vader",
    "category": "Code Quality & Review",
    "aliases": [
      "vader",
      "pre-commit"
    ],
    "summary": "Unified pre-commit diff review combining correctness and ponytail restraint checks",
    "triggers": [
      "/code-vader",
      "code-vader",
      "vader",
      "pre-commit review",
      "review staged diff"
    ],
    "usage": "Use when the user says \"/code-vader\", \"code-vader\", \"vader\", \"pre-commit review\", \"review staged diff\", \"review before commit\", or wants a unified pre-commit diff review on non-Claude hosts (Antigravity, Codex, Cursor, Pi, OpenCode) combining correctness/safety checks (Claude Code /code-review) and restraint/anti-bloat checks (Ponytail / code-yoda) into a binary commit verdict.",
    "examples": [
      "/skillator:code-vader",
      "/skillator:vader"
    ]
  },
  {
    "id": "code-yoda",
    "name": "code-yoda",
    "category": "Code Quality & Review",
    "aliases": [
      "yoda",
      "lazy"
    ],
    "summary": "Anti-bloat, lazy mode, and debt ledger tracking (ponytail markers)",
    "triggers": [
      "yoda",
      "be lazy",
      "lazy mode",
      "simplest solution",
      "yagni"
    ],
    "usage": "Use when the user says \"yoda\", \"be lazy\", \"lazy mode\", \"simplest solution\", \"yagni\", \"do less\", complains about over-engineering, bloat, boilerplate or an unnecessary dependency, asks what can be deleted from a diff or a whole repo, or - before a release or handover - asks what was knowingly deferred, shortcut, \"left for later\" or \"should be tracked\" in the code (`ponytail:` markers).",
    "examples": [
      "/skillator:code-yoda",
      "/skillator:yoda"
    ]
  },
  {
    "id": "deploy-merlin",
    "name": "deploy-merlin",
    "category": "Deployment",
    "aliases": [
      "merlin",
      "deploy"
    ],
    "summary": "VPS deployment wizard with Docker Compose, nginx, TLS, and CI pipeline",
    "triggers": [
      "prep the deployment",
      "set up deploy",
      "deployment wizard",
      "get this ready to ship to my server",
      "scaffold the deploy"
    ],
    "usage": "Use when the user says \"prep the deployment\", \"set up deploy\", \"deployment wizard\", \"get this ready to ship to my server\", \"scaffold the deploy\", or is about to stand up a new app on a Linux VPS with the standard single-VPS pattern (Docker Compose + nginx + GitHub Actions, one-push deploy, maintenance gate, TLS via Let's Encrypt).",
    "examples": [
      "/skillator:deploy-merlin",
      "/skillator:merlin"
    ]
  },
  {
    "id": "deploy-niyoj",
    "name": "deploy-niyoj",
    "category": "Deployment",
    "aliases": [
      "niyoj",
      "manual-deploy"
    ],
    "summary": "Direct desktop SSH deployment to a VPS without GitHub Actions CI",
    "triggers": [
      "niyoj",
      "set up niyoj deploy",
      "deploy without CI",
      "manual deploy",
      "no github actions deploy"
    ],
    "usage": "Use when the user says \"niyoj\", \"set up niyoj deploy\", \"deploy without CI\", \"manual deploy\", \"no github actions deploy\", \"one-button deploy from my laptop\", when converting a project off `.github/workflows/deploy.yml`, or when a NiYoj deploy failed and needs diagnosing. The target is a single-VPS app (Docker Compose + nginx + maintenance gate + Let's Encrypt) deployed over SSH from the NiYoj desktop app, with no CI runner.",
    "examples": [
      "/skillator:deploy-niyoj",
      "/skillator:niyoj"
    ]
  },
  {
    "id": "design-arwen",
    "name": "design-arwen",
    "category": "UI & Design",
    "aliases": [
      "arwen",
      "design"
    ],
    "summary": "UI/UX design critique, styling polish, design system styling, typography, spacing",
    "triggers": [
      "[build|redesign|improve|critique] [UI-only target]"
    ],
    "usage": "Use for UI-only work on a UI/UX, native or web - redesign, improve or critique a page, screen, dashboard, form or design system; make it less generic, bolder, less AI-made; pick fonts/colors/layout/motion; fix hierarchy, spacing, contrast, a11y or UI performance; write UX copy and error states; one design language across native and web - or when this skill is named.",
    "examples": [
      "/skillator:design-arwen",
      "/skillator:arwen"
    ]
  },
  {
    "id": "designui-galadriel",
    "name": "designui-galadriel",
    "category": "UI & Design",
    "aliases": [
      "galadriel",
      "wire-up"
    ],
    "summary": "Converts existing static UI mockups into working features wired to logic",
    "triggers": [
      "just a UI",
      "not functional",
      "fake / hardcoded data",
      "no backend",
      "the buttons don't do anything"
    ],
    "usage": "Use when an EXISTING UI-only mockup must become real and working - the user says their app is \"just a UI\", \"not functional\", \"fake / hardcoded data\", \"no backend\", \"the buttons don't do anything\", or asks to \"make it real\", \"wire it up\", \"connect it to a backend/API/database\". Ends at a confirmed plan; does not build.",
    "examples": [
      "/skillator:designui-galadriel",
      "/skillator:galadriel"
    ]
  },
  {
    "id": "grayskull-power",
    "name": "grayskull-power",
    "category": "Workflow & Orchestration",
    "aliases": [
      "grayskull",
      "dev-mode"
    ],
    "summary": "Main programming workflow router; arms standing skills and routes requests",
    "triggers": [
      "dev mode",
      "activate the programming skills",
      "turn on the skillator workflow",
      "use our skills",
      "by the power of grayskull"
    ],
    "usage": "Use when the user says \"dev mode\", \"activate the programming skills\", \"turn on the skillator workflow\", \"use our skills\", \"by the power of grayskull\", \"grayskull\", \"check screenshot\", \"set up for coding\", or starts real development work in a repo with no skillator skill active. The single entry point that routes each request to the right skillator skill; it does not do the work itself.",
    "examples": [
      "/skillator:grayskull-power",
      "/skillator:grayskull"
    ]
  },
  {
    "id": "handoff-cortana",
    "name": "handoff-cortana",
    "category": "Continuity & Safety",
    "aliases": [
      "cortana",
      "handoff"
    ],
    "summary": "Verified session handoff documentation for cross-session continuity",
    "triggers": [
      "hand off",
      "write a handoff",
      "create a handoff doc",
      "document where we are",
      "prepare for the next session/person"
    ],
    "usage": "Use when the user asks to \"hand off\", \"write a handoff\", \"create a handoff doc\", \"document where we are\", \"prepare for the next session/person\", or wants a continuity/checkpoint summary of the current session — an in-depth, verified session-handoff document (a Markdown file) so a different person or AI can continue the work with zero loss of context, plan, or intent.",
    "examples": [
      "/skillator:handoff-cortana",
      "/skillator:cortana"
    ]
  },
  {
    "id": "holo-r2d2",
    "name": "holo-r2d2",
    "category": "Workflow & Orchestration",
    "aliases": [
      "r2d2",
      "obiwan"
    ],
    "summary": "Visualizes runs, architectures, decisions, and plans as diagrams and artifacts",
    "triggers": [
      "Help me, Obi-Wan",
      "help me obiwan",
      "help me obi wan kenobi",
      "draw it"
    ],
    "usage": "Use when the user says \"Help me, Obi-Wan\", \"help me obiwan\" or \"help me obi wan kenobi\" - alone, with a run (RUN-12) or a ticket (F39): it means \"draw it\". Also to show a run, its decisions, a plan or a design as a diagram - as an Artifact, an HTML file, Markdown with Mermaid or an SVG, named or asked once - and when several owner decisions need answering - the decision wizard.",
    "examples": [
      "/skillator:holo-r2d2",
      "/skillator:r2d2"
    ]
  },
  {
    "id": "live-friday",
    "name": "live-friday",
    "category": "UI & Live Preview",
    "aliases": [
      "friday",
      "live-preview"
    ],
    "summary": "Live background preview runner for servers, web apps, TUIs, and dev processes",
    "triggers": [
      "let me see it",
      "show me while you work",
      "don't make me wait",
      "live preview",
      "run it while you build"
    ],
    "usage": "Use when the user says \"let me see it\", \"show me while you work\", \"don't make me wait\", \"live preview\", \"run it while you build\", \"stream the build\", or whenever a change is about to be made to a project that has a runnable surface — JS/web dev server, Rust, C++, Python, Go, Electron, mobile or a plain CLI. Armed as standard by grayskull-power.",
    "examples": [
      "/skillator:live-friday",
      "/skillator:friday"
    ]
  },
  {
    "id": "merge-smith",
    "name": "merge-smith",
    "category": "Git & Integration",
    "aliases": [
      "smith",
      "merge"
    ],
    "summary": "Consolidates and integrates multiple git branches with conflict resolution",
    "triggers": [
      "merge-smith",
      "smith",
      "merge"
    ],
    "usage": "Use when the user wants to combine/consolidate several GitHub branches into one integration branch, merge a feature branch into a base (main/develop), or reconcile divergent branches that touched the same code — and wants conflicts handled intelligently rather than by hand. The merge direction (`<source>` INTO `<destination>`) is confirmed before anything is touched; the base branch is never touched directly and nothing is pushed without explicit approval.",
    "examples": [
      "/skillator:merge-smith",
      "/skillator:smith"
    ]
  },
  {
    "id": "mergeprep-oracle",
    "name": "mergeprep-oracle",
    "category": "Git & Integration",
    "aliases": [
      "oracle",
      "mergeprep"
    ],
    "summary": "Prepares and normalizes git branches prior to merge integration",
    "triggers": [
      "prep a branch for merge",
      "clean up a branch before merging",
      "make sure only the real changes get merged",
      "strip stale/old parts"
    ],
    "usage": "Use when the user wants to \"prep a branch for merge\", \"clean up a branch before merging\", \"make sure only the real changes get merged\", \"strip stale/old parts\", or is about to run merge-smith and wants the branch normalized first. Everything happens ON THE BRANCH ITSELF — never a side branch, never a history rewrite, never a force-push, never the base.",
    "examples": [
      "/skillator:mergeprep-oracle",
      "/skillator:oracle"
    ]
  },
  {
    "id": "relay-morpheus",
    "name": "relay-morpheus",
    "category": "Workflow & Orchestration",
    "aliases": [
      "morpheus",
      "relay",
      "marathon"
    ],
    "summary": "Multi-stage workflow and marathon runner surviving across session limits",
    "triggers": [
      "marathon",
      "May the Force be with you",
      "Use the Force on F35 F36",
      "work the board",
      "keep going"
    ],
    "usage": "Use when work runs in stages and the session may not survive to their end — a multi-stage plan, fan-out, a sleeping laptop, a dropping link, a usage limit. Also on \"marathon\", \"May the Force be with you\", \"Use the Force on F35 F36\", \"work the board\", \"keep going\", \"I'll be back\", \"I'm back\", \"ask me everything at the end\", \"resume the run\".",
    "examples": [
      "/skillator:relay-morpheus",
      "/skillator:morpheus",
      "/skillator:marathon-run",
      "/skillator:marathon-plan"
    ]
  },
  {
    "id": "remote-cerebro",
    "name": "remote-cerebro",
    "category": "Remote Access",
    "aliases": [
      "cerebro",
      "remote"
    ],
    "summary": "Remote control bridge to drive coding sessions from mobile or Telegram",
    "triggers": [
      "remote control",
      "control pi remotely",
      "drive codex from my phone",
      "keep working away from the desk",
      "I'm leaving my desk"
    ],
    "usage": "Use when the user wants to drive codex, cursor-agent, pi or gemini from a phone or another device: \"remote control\", \"control pi remotely\", \"drive codex from my phone\", \"keep working away from the desk\", \"I'm leaving my desk\", a Telegram bot for a coding agent, pairing a phone to a CLI, or turning approvals off so the phone needs fewer taps.",
    "examples": [
      "/skillator:remote-cerebro",
      "/skillator:cerebro"
    ]
  },
  {
    "id": "resume-cortana",
    "name": "resume-cortana",
    "category": "Continuity & Safety",
    "aliases": [
      "resume"
    ],
    "summary": "Executes tasks from previous session handoff documents",
    "triggers": [
      "execute the handoff",
      "run the handoff",
      "work through the handoffs",
      "pick up the pending tasks",
      "resume from the handoff doc(s)"
    ],
    "usage": "Use when the user says \"execute the handoff\", \"run the handoff\", \"work through the handoffs\", \"pick up the pending tasks\", \"resume from the handoff doc(s)\", \"do the next tasks in the handout\", \"process docs/handoffs\", or wants a repeatable pass — safe to re-run or /loop — that picks up where a handoff left off. The execution counterpart to handoff, which writes the doc.",
    "examples": [
      "/skillator:resume-cortana",
      "/skillator:resume"
    ]
  },
  {
    "id": "rules-orko",
    "name": "rules-orko",
    "category": "Rules & Conventions",
    "aliases": [
      "orko",
      "rules"
    ],
    "summary": "Manages standing repository rules and conventions across team chats",
    "triggers": [
      "always X",
      "never Y",
      "from now on",
      "stop doing",
      "I prefer"
    ],
    "usage": "Use when the user states how they work - \"always X\", \"never Y\", \"from now on\", \"stop doing\", \"I prefer\", \"in this repo nobody\", \"we don't\" - or asks what rules apply here, why a preference was forgotten between chats, or how a teammate gets the same conventions. Also at session start, to load the standing rules.",
    "examples": [
      "/skillator:rules-orko",
      "/skillator:orko"
    ]
  },
  {
    "id": "screenshot-argus",
    "name": "screenshot-argus",
    "category": "Testing & UI",
    "aliases": [
      "argus",
      "screenshots"
    ],
    "summary": "Inspects and processes test screenshots dropped in screenshot directories",
    "triggers": [
      "screenshots",
      "check the screenshots",
      "I dropped new screenshots",
      "test screenshots",
      "look at the latest run"
    ],
    "usage": "Use when the user says \"screenshots\", \"check the screenshots\", \"I dropped new screenshots\", \"test screenshots\", \"look at the latest run\", or gives a screenshot directory path — test screenshots dropped in a project's screenshot folder that need acting on and then clearing.",
    "examples": [
      "/skillator:screenshot-argus",
      "/skillator:argus"
    ]
  },
  {
    "id": "skill-prometheus",
    "name": "skill-prometheus",
    "category": "Skill Authoring",
    "aliases": [
      "prometheus",
      "author-skill"
    ],
    "summary": "Authors, tests, and improves agent skills and prompt engineering",
    "triggers": [
      "write a skill",
      "make this a skill",
      "skillify this",
      "my skill isn't triggering",
      "the agent ignored the skill"
    ],
    "usage": "Use when writing a new agent skill, editing an existing one, or diagnosing a skill agents don't load or don't follow - a SKILL.md, slash command, reference file, or always-on file (CLAUDE.md, AGENTS.md, GEMINI.md). Also when the user says \"write a skill\", \"make this a skill\", \"skillify this\", \"my skill isn't triggering\", \"the agent ignored the skill\", \"improve this skill\", or asks why a rule keeps getting rationalized away.",
    "examples": [
      "/skillator:skill-prometheus",
      "/skillator:prometheus"
    ]
  },
  {
    "id": "skill-smith",
    "name": "skill-smith",
    "category": "Skill Authoring",
    "aliases": [
      "skill-smith (retired, -> prometheus)"
    ],
    "summary": "Retired skill authoring skill; redirects to skill-prometheus",
    "triggers": [
      "skill-smith"
    ],
    "usage": "Use only when the user names \"skill-smith\" itself. A retired name, kept for one release so old prompts and docs still resolve; it points at skill-prometheus.",
    "examples": [
      "/skillator:skill-smith",
      "/skillator:skill-smith (retired, -> prometheus)"
    ]
  },
  {
    "id": "skillator-sync",
    "name": "skillator-sync",
    "category": "Upstream & Sync",
    "aliases": [
      "sync",
      "upstream-sync"
    ],
    "summary": "Detects and absorbs upstream skill updates and UPSTREAM.md manifests",
    "triggers": [
      "/skillator-sync",
      "skillator-sync",
      "sync upstream skills",
      "check upstream skills",
      "absorb upstream"
    ],
    "usage": "Use when the user says \"/skillator-sync\", \"skillator-sync\", \"sync upstream skills\", \"check upstream skills\", \"absorb upstream\", or wants to sweep tracked UPSTREAM.md manifests (code-yoda, design-arwen, clone-odo), inspect upstream commit diffs and rule changes, and absorb new upstream commit hashes into local skills.",
    "examples": [
      "/skillator:skillator-sync",
      "/skillator:sync"
    ]
  },
  {
    "id": "spec-watson",
    "name": "spec-watson",
    "category": "Build & Feature",
    "aliases": [
      "watson",
      "spec"
    ],
    "summary": "Converts conversation briefs into persistent tracked specifications",
    "triggers": [
      "spec-watson",
      "watson",
      "spec"
    ],
    "usage": "Use when what a feature must do exists only in conversation — a spoken brief, a chat thread, a ticket body, a handover — and the work outlives the session: a contract ending, someone else picking it up, a spec a later pass must re-check against the code. Also on requests for spec-driven development, spec-kit, specify/plan/tasks artifacts, or a traceability matrix.",
    "examples": [
      "/skillator:spec-watson",
      "/skillator:watson"
    ]
  },
  {
    "id": "tasks-sentinels",
    "name": "tasks-sentinels",
    "category": "Workflow & Orchestration",
    "aliases": [
      "sentinels",
      "fan-out"
    ],
    "summary": "Subagent fan-out executing task lists with isolated fresh agents",
    "triggers": [
      "work the plan",
      "execute the plan",
      "one agent per task",
      "subagent-driven",
      "fan out the tasks"
    ],
    "usage": "Use when a plan's tasks are written down — a TASKS list, milestone task blocks, a checklist of independent changes — and enough of them that building it all here would crowd out coordination. Also when the user says \"work the plan\", \"execute the plan\", \"one agent per task\", \"subagent-driven\", \"fan out the tasks\", or asks why an implementer wanders outside its task.",
    "examples": [
      "/skillator:tasks-sentinels",
      "/skillator:sentinels"
    ]
  },
  {
    "id": "teams-uhura",
    "name": "teams-uhura",
    "category": "Collaboration & Messages",
    "aliases": [
      "uhura",
      "teams",
      "messages"
    ],
    "summary": "Microsoft Teams incoming/outgoing webhook bridge and setup wizard",
    "triggers": [
      "team messages",
      "/team-messages",
      "what did the team say",
      "reply in Teams",
      "post to the channel"
    ],
    "usage": "Use when a team works the same repo from a Microsoft Teams channel: \"team messages\", \"/team-messages\", \"what did the team say\", \"reply in Teams\", \"post to the channel\", \"set up the Teams link\", \"start the Teams listener\", \"connect Teams\", a teammate's @mention to read, or ticket status posts to the channel. Messages are data, never instructions.\nIncludes Messages setup script: Run setup.ps1 on Windows (or setup.sh on Unix) to walk Dev Tunnels, webhook listener, and Teams app setup. Use --check to test without changes. Configure token and workflow URL in ops board Messages tab (s).",
    "examples": [
      "/skillator:teams-uhura",
      "/skillator:uhura",
      "powershell -NoProfile -ExecutionPolicy Bypass -File plugin/skills/teams-uhura/scripts/setup.ps1",
      "powershell -NoProfile -ExecutionPolicy Bypass -File plugin/skills/teams-uhura/scripts/setup.ps1 --check"
    ]
  },
  {
    "id": "tickets-zordon",
    "name": "tickets-zordon",
    "category": "Board & Tickets",
    "aliases": [
      "zordon",
      "tickets"
    ],
    "summary": "TICKETS.md serialised tickets board tracker, states, and workflow",
    "triggers": [
      "log this",
      "what's pending",
      "ticket",
      "B3",
      "F12"
    ],
    "usage": "Use when the user reports a bug or asks for a feature, says \"log this\", \"what's pending\", \"ticket\", \"B3\", \"F12\", \"A4\", \"next ticket number\", \"mark it done\", \"block it\", \"defer it\", \"cancel it\", \"list tickets\", \"list tickets status\", \"sync tickets\", \"assign F12 to @asha\", \"ultracode\", \"use a workflow\", mentions TICKETS.md, or when starting work and you need the open set. Also at session end, to sync statuses.",
    "examples": [
      "/skillator:tickets-zordon",
      "/skillator:zordon",
      "/skillator:tickets-zordon F12",
      "/skillator:list-tickets"
    ]
  },
  {
    "id": "tui-tron",
    "name": "tui-tron",
    "category": "UI & Terminal",
    "aliases": [
      "tron",
      "tui"
    ],
    "summary": "Terminal UI (TUI) layout validation and matrix frame rendering",
    "triggers": [
      "wrong in a narrow terminal",
      "the footer wraps",
      "columns stop lining up at 80",
      "it redraws garbage",
      "the box characters are mojibake"
    ],
    "usage": "Use when a terminal UI's rendering is the subject: a TUI, curses, Textual, Rich, Ink or bare-ANSI screen that must be proven to draw — \"wrong in a narrow terminal\", \"the footer wraps\", \"columns stop lining up at 80\", \"it redraws garbage\", \"the box characters are mojibake\", \"ΓöÇ\" — or there is no pty to drive it: no tmux, stdin closed, winpty ASSERT_CONDITION; or this skill is named.",
    "examples": [
      "/skillator:tui-tron",
      "/skillator:tron"
    ]
  },
  {
    "id": "watch-cortana",
    "name": "watch-cortana",
    "category": "Monitoring & Safety",
    "aliases": [
      "watch",
      "limits"
    ],
    "summary": "Monitors token usage limits and triggers automated session handoffs",
    "triggers": [
      "monitor usage limits",
      "auto handoff before I run out",
      "warn me at 92%",
      "save the session before the limit",
      "hand off automatically"
    ],
    "usage": "Use when the user asks to \"monitor usage limits\", \"auto handoff before I run out\", \"warn me at 92%\", \"save the session before the limit\", \"hand off automatically\", or wants to install, configure or debug the usage watcher. Installs hooks — the monitoring is done by those hooks, not the model, and the handoff document itself comes from the handoff skill.",
    "examples": [
      "/skillator:watch-cortana",
      "/skillator:watch"
    ]
  }
];


export function filteredSkills(filter: string): SkillGuide[] {
  const q = filter.trim().toLowerCase()
  if (!q) return SKILLS
  return SKILLS.filter(sk =>
    sk.id.toLowerCase().includes(q) ||
    sk.name.toLowerCase().includes(q) ||
    sk.category.toLowerCase().includes(q) ||
    sk.summary.toLowerCase().includes(q) ||
    sk.aliases.some(a => a.toLowerCase().includes(q)) ||
    sk.triggers.some(t => t.toLowerCase().includes(q))
  )
}

export function openHelp(s: State, skillId?: string): Step {
  const skills = filteredSkills(s.help?.filter ?? '')
  const sel = skillId && SKILLS.some(sk => sk.id === skillId)
    ? skillId
    : (s.help?.selected && skills.some(x => x.id === s.help!.selected) ? s.help!.selected : (skills[0]?.id ?? SKILLS[0]!.id))
  return {
    state: {
      ...s,
      help: {
        selected: sel,
        filter: s.help?.filter ?? '',
        filtering: false,
        expanded: false,
        scroll: 0,
      },
    },
    effects: [],
  }
}

export function helpKey(s: State, k: Key): Step {
  const h = s.help!
  const same = { state: s, effects: [] }
  const close = { state: { ...s, help: null }, effects: [] }
  const skills = filteredSkills(h.filter)

  if (h.filtering) {
    if (k.name === 'escape') {
      return { state: { ...s, help: { ...h, filtering: false } }, effects: [] }
    }
    if (k.name === 'return' || k.name === 'enter') {
      return { state: { ...s, help: { ...h, filtering: false } }, effects: [] }
    }
    if (k.name === 'backspace') {
      const nextFilter = [...h.filter].slice(0, -1).join('')
      const nextSkills = filteredSkills(nextFilter)
      const nextSel = nextSkills.some(x => x.id === h.selected) ? h.selected : (nextSkills[0]?.id ?? '')
      return { state: { ...s, help: { ...h, filter: nextFilter, selected: nextSel } }, effects: [] }
    }
    const ch = k.sequence
    if (!k.ctrl && ch && ch.length === 1 && ch >= ' ' && ch !== '\x7f') {
      const nextFilter = h.filter + ch
      const nextSkills = filteredSkills(nextFilter)
      const nextSel = nextSkills.some(x => x.id === h.selected) ? h.selected : (nextSkills[0]?.id ?? '')
      return { state: { ...s, help: { ...h, filter: nextFilter, selected: nextSel } }, effects: [] }
    }
    return same
  }

  if (k.name === 'escape') {
    if (h.expanded) return { state: { ...s, help: { ...h, expanded: false, scroll: 0 } }, effects: [] }
    return close
  }
  if (k.name === '?' || k.sequence === '?') {
    return close
  }
  if (k.name === '/') {
    return { state: { ...s, help: { ...h, filtering: true } }, effects: [] }
  }
  if (k.name === 'c') {
    const cur = skills.find(x => x.id === h.selected) ?? SKILLS.find(x => x.id === h.selected)
    if (!cur) return same
    const aliasStr = cur.aliases.length ? ` (alias: ${cur.aliases.join(', ')})` : ''
    return { state: toast(s, `✓ Copied reference: skillator:${cur.id}${aliasStr}`), effects: [] }
  }

  if (h.expanded) {
    switch (k.name) {
      case 'up': case 'k':
        return { state: { ...s, help: { ...h, scroll: Math.max(0, h.scroll - 1) } }, effects: [] }
      case 'down': case 'j':
        return { state: { ...s, help: { ...h, scroll: h.scroll + 1 } }, effects: [] }
      case 'pageup':
        return { state: { ...s, help: { ...h, scroll: Math.max(0, h.scroll - 6) } }, effects: [] }
      case 'pagedown':
        return { state: { ...s, help: { ...h, scroll: h.scroll + 6 } }, effects: [] }
      case 'home':
        return { state: { ...s, help: { ...h, scroll: 0 } }, effects: [] }
      case 'return': case 'enter':
        return { state: { ...s, help: { ...h, expanded: false, scroll: 0 } }, effects: [] }
      default:
        return same
    }
  }

  const at = skills.findIndex(x => x.id === h.selected)
  const move = (by: number): Step => {
    if (!skills.length) return same
    const idx = Math.max(0, Math.min(skills.length - 1, (at < 0 ? 0 : at) + by))
    return { state: { ...s, help: { ...h, selected: skills[idx]!.id } }, effects: [] }
  }

  switch (k.name) {
    case 'up': case 'k': return move(-1)
    case 'down': case 'j': return move(1)
    case 'pageup': return move(-5)
    case 'pagedown': return move(5)
    case 'home': return { state: { ...s, help: { ...h, selected: skills[0]?.id ?? h.selected } }, effects: [] }
    case 'end': return { state: { ...s, help: { ...h, selected: skills[skills.length - 1]?.id ?? h.selected } }, effects: [] }
    case 'return': case 'enter': {
      if (!h.selected) return same
      return { state: { ...s, help: { ...h, expanded: true, scroll: 0 } }, effects: [] }
    }
    default: return same
  }
}

export function reduce(s: State, k: Key): Step {
  const quit: Step = { state: { ...s, quit: true }, effects: [{ kind: 'quit' }] }
  // A146: a form holding typed text is not thrown away by one ctrl+c - it cancels the
  // form (as Esc), the board stays; the next ctrl+c quits. An empty form has nothing to lose.
  if (k.ctrl && k.name === 'c') {
    if (s.help) return { state: { ...s, help: null }, effects: [] }
    if (s.setup?.touched) return { state: { ...s, setup: null }, effects: [] }
    if (s.runForm?.mode === 'rename' && s.tab === 'run') return { state: { ...s, runForm: null }, effects: [] }
    return s.person && (s.person.handle || s.person.name || s.person.emails) ? personKey(s, { name: 'escape' }) : quit
  }
  if (s.help) return helpKey(s, k)
  if (s.setup) return setupKey(s, k)
  if (s.person) return personKey(s, k)
  if (s.dialog) return dialogKey(s, k)
  if (s.reconcile) return reconcileKey(s, k)
  if (s.teamConfirm) return teamKey(s, k)
  if (s.engage) return engageKey(s, k)          // F85
  if (s.filterField) return filterKey(s, k)
  if (s.tab === 'explorer' && k.name === 'r') return explorerKey(s, k)     // F75: r reads git again too
  if (s.tab === 'run' && (s.runForm || k.name === 'r')) return runKey(s, k)   // F79: r rescans here
  if (s.tab === 'runs' && k.name === 'r') return runsKey(s, k)                // F122: r reruns on Workflows tab
  switch (k.name) {
    case 'q': return quit
    case '1': return toTab(s, 'tickets')
    case '2': return toTab(s, 'runs')
    case '3': return toTab(s, 'health')
    case '4': return toTab(s, 'messages')
    case '5': return toTab(s, 'explorer')
    case '6': return toTab(s, 'run')          // F79's Run moved to 6: F75's Explorer took 5
    case '7': return openHelp(s)
    case '?': return openHelp(s)
    case 'tab': {
      const at = TABS.indexOf(s.tab)
      return toTab(s, TABS[(at + (k.shift ? TABS.length - 1 : 1)) % TABS.length]!)
    }
    case 'r': return { state: { ...s, toast: '↻ TICKETS.md reloaded' }, effects: [{ kind: 'poll', what: 'board' }, { kind: 'poll', what: 'slow' }] }
    case 'R': return resume(s)
  }
  if (k.sequence === '?' || k.sequence === '7') return openHelp(s)
  if (s.tab === 'health' && k.name === 'F') return forceResume(s)     // F87
  if (s.tab === 'tickets') return ticketsKey(s, k)
  if (s.tab === 'runs') return runsKey(s, k)
  if (s.tab === 'messages') return messagesKey(s, k)
  if (s.tab === 'explorer') return explorerKey(s, k)
  if (s.tab === 'run') return runKey(s, k)
  return k.name === 'escape' ? { state: { ...s, toast: null }, effects: [] } : { state: s, effects: [] }
}
