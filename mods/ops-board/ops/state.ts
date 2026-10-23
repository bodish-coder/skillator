// The ops app's state and its one reducer (design D5). Pure and sync: a key gives a new
// state and the effects to run; every script run is a `run` effect with a Call from the
// one table, and its `then` folds the result back in. No process, terminal or fs here -
// app.ts executes the effects, the tests drive reduce without any process, and F56 takes
// it as is.
import type { AssignDraft, Board, Box, Filter, Machine, Member, Msg, PersonDraft, RunView, TeamsCfgView, Ticket, Usage, Watch } from '../types'
import type { Call } from '../hooks/lib/calls'
import type { View } from '../hooks/lib/ticketsmodel'
import type { RunResult } from './nodehost'
import { NO_SCRIPTS } from '../hooks/lib/calls'
import { buildModel, headKey, isHead, toggleGroup } from '../hooks/lib/ticketsmodel'
import { STATE_NAME } from '../hooks/lib/board'
import { sameHandle } from '../hooks/lib/team'
import { classify, levelLine, parseMachine, usageFromLevel } from '../hooks/lib/facts'
import { parseRuns } from '../hooks/lib/runs'
import { continuePrompt } from '../hooks/lib/runlines'
import { moveSel, parseInbox, selectedOf } from '../hooks/lib/inbox'
import { freshSetup, parseCfgView, setupError, setupJson, SETUP_FIELDS, tokenShown, urlShown } from '../hooks/lib/teamsconfig'
import type { SetupField, SetupValues } from '../hooks/lib/teamsconfig'

export type Tab = 'tickets' | 'runs' | 'health' | 'messages'
export type FilterField = 'app' | 'who' | 'mine'
// node readline keypress names: 'up', 'down', 'left', 'right', 'return', 'escape', 'tab', 'a', 'D', ...
// `sequence` is the character typed (app.ts sets it for printable keys): the Add person form's text.
export type Key = { name: string; sequence?: string; shift?: boolean; ctrl?: boolean }
export type PersonField = 'handle' | 'name' | 'emails'

export type State = {
  tab: Tab
  board: Board | null; team: Member[]; me: string | null
  filter: Filter; filterField: FilterField | null
  selected: string | null; expanded: string | null; showTeam: boolean
  open: Box[]                              // F61: the open groups' boxes this session; none = all collapsed
  machine: Machine | null; usage: Usage | null; watch: Watch
  relay: string | null                     // band: "RUN-0012 2/4", the first relay run not all done
  runs: RunView[]; runsSelected: string | null; runsExpanded: string | null
  runsRead: boolean                        // false until relay's list was first read: 'reading runs…'
  dialog: AssignDraft | null; dialogIndex: number    // -1: the cursor is on "+ add person"
  person: PersonDraft | null; personField: PersonField  // the Add person form, over the dialog or the Team view
  teamSelected: string | null                         // the Team view's row
  teamConfirm: string | null                          // the handle the Team view asks to remove (y/n)
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
}
export type Setup = SetupValues & { result: string | null; confirmClear: boolean; touched: boolean }

export type Step = { state: State; effects: Effect[] }
// A run's result folded into the state as it then is; it may ask for more effects.
export type Then = (r: RunResult) => (s: State) => State | Step
// stdin (F66): written to the run's standard input - the setup form's values, never argv.
export type Effect = { kind: 'run'; call: Call; args: string[]; then: Then; stdin?: string }
  | { kind: 'poll'; what: 'board' | 'slow' | 'runs' } | { kind: 'quit' }

// A `then`'s answer as a step: a bare state asks for nothing more.
export const settle = (x: State | Step): Step => ('effects' in x ? x : { state: x, effects: [] })

// A run's result applied at `now`, the clock when it landed (a `then` stamps facts with s.now).
export const afterRun = (e: { then: Then }, r: RunResult, s: State, now: number): Step => settle(e.then(r)({ ...s, now }))

const TABS: Tab[] = ['tickets', 'runs', 'health', 'messages']

export const initial = (cols: number, rows: number, now: number): State => ({
  tab: 'tickets', board: null, team: [], me: null,
  filter: { app: null, who: null, mine: false, showDone: false }, filterField: null,
  selected: null, expanded: null, showTeam: false, open: [],
  machine: null, usage: null, watch: { level: 'green', reasons: [] }, relay: null,
  runs: [], runsSelected: null, runsExpanded: null, runsRead: false,
  dialog: null, dialogIndex: 0, person: null, personField: 'handle', teamSelected: null, teamConfirm: null, toast: null, notes: [],
  cols, rows, now, quit: false, repo: null, decidedLine: null, holdOutcome: null, lockSig: '',
  messages: [], msgRead: null, msgSelected: null, msgExpanded: null, teamsCfg: null, setup: null, setupField: 'token',
})

export const viewOf = (s: State): View => ({
  board: s.board, team: s.team, me: s.me, filter: s.filter, filterOpen: s.filterField !== null,
  selected: s.selected, expanded: s.expanded, open: s.open, cols: s.cols,
})

export function onBoard(s: State, board: Board, team: Member[], me: string | null): State {
  return { ...s, board, team, me }
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
export function startHandle(t: Ticket, kind: 'owner' | 'decide', team: Member[], me: string | null): string | null {
  const on = (h: string | null) => team.find(m => sameHandle(m.handle, h))?.handle ?? null
  return on(kind === 'owner' ? t.owner : t.decide) ?? on(me) ?? team[0]?.handle ?? null
}

// The people the dialog lists: the team, plus the draft's handle when it is not on it.
function peopleOf(s: State): Member[] {
  const d = s.dialog
  return d?.handle && !s.team.some(m => m.handle === d.handle) ? [...s.team, { handle: d.handle, emails: [] }] : s.team
}

const titleOf = (d: AssignDraft) => (d.kind === 'decide' ? `Assign ${d.id} for a decision` : `Assign ${d.id}`)

export function dialogLines(s: State): string[] {
  const d = s.dialog
  if (!d) return []
  const tk = ticketOf(s, d.id)
  const from: Box = tk?.box ?? ' '
  const to: Box = d.kind === 'decide' ? '?' : ' '
  const radio = (k: AssignDraft['kind']) => (d.kind === k ? '(•)' : '( )')
  const out = [titleOf(d), `  ${radio('owner')} implementation   ${radio('decide')} decision          a / d`]
  const onAdd = s.dialogIndex === -1
  if (!s.team.length) out.push('  no .skillator/team.md yet - + add person creates it')
  for (const m of peopleOf(s)) out.push(`  ${!onAdd && m.handle === d.handle ? '› ' : '  '}${m.handle.padEnd(10)}${m.name ?? ''}`.trimEnd())
  out.push(`  ${onAdd ? '› ' : '  '}+ add person`)
  out.push(`  Change  [${from}] ${word(from)} → [${to}] ${word(to)}, ${d.kind === 'decide' ? 'decide' : 'owner'} ${d.handle ?? '(pick someone)'}`)
  if (tk?.box === '~') {
    out.push(tk.session
      ? `  ! ${tk.id} is in progress under ${tk.session} - this moves it to ${word(to)}; the tag stays - tell that session`
      : `  ! ${tk.id} is in progress - this moves it to ${word(to)}; tell whoever is working it`)
  }
  out.push(`  Runs    ticket-meta ${d.kind === 'decide' ? 'decide' : 'assign'} ${d.id} ${d.handle ?? '@?'}`)
  if (d.result) out.push(`  ${d.result}`)
  out.push('  Enter confirm · Esc cancel')
  return out
}

// F61: a header selected is no ticket - `ticket` is null there, and the toast asks for one.
function openDialog(s: State, kind: AssignDraft['kind']): State {
  const id = buildModel(viewOf(s)).ticket
  const t = id ? ticketOf(s, id) : null
  if (!t) return toast(s, 'ops board: select a ticket first')
  const handle = startHandle(t, kind, s.team, s.me)
  const dialog: AssignDraft = { id: t.id, kind, handle, result: null }
  // No one to start on (no team file): the cursor starts on "+ add person".
  return { ...s, dialog, dialogIndex: handle ? Math.max(0, s.team.findIndex(m => m.handle === handle)) : -1 }
}

// Assign: ticket-meta assign|decide <ID> @h. Done: a toast with what it said and the
// command that ran, the dialog closed. Refused: its stderr in the dialog.
function confirmAssign(s: State): Step {
  const d = s.dialog
  if (!d) return { state: s, effects: [] }
  if (!d.handle) return { state: { ...s, dialog: { ...d, result: 'pick someone first' } }, effects: [] }
  const handle = d.handle
  const then: Then = r => x => {
    if (r.code !== 0) {
      const text = timedOut(r) ? 'ticket-meta did not finish in 30 s' : why(r, 'ticket-meta')
      const next = x.dialog ? { ...x, dialog: { ...x.dialog, result: text } } : x
      return timedOut(r) ? toast(next, text) : next
    }
    const t = ticketOf(x, d.id)
    const closed = !t || t.box === 'x' || t.box === '-'
    const state = d.kind === 'decide' ? 'pending decision' : 'pending'
    const role = d.kind === 'decide' ? `for ${handle} to decide` : `owned by ${handle}`
    const head = `✓ ${d.id} ${closed ? 'reopened as' : 'now'} ${state}, ${role}${t ? ': ' + t.title : ''}`
    return { ...x, dialog: null, toast: [head, ...notesOf(r.out), ran(r.argv)].join('\n') }
  }
  return { state: s, effects: [run(d.kind === 'decide' ? 'meta-decide' : 'meta-assign', [d.id, handle], then)] }
}

function dialogKey(s: State, k: Key): Step {
  const d = s.dialog!
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
    case 'return': case 'enter': return onAdd ? { state: openPerson(s, 'assign'), effects: [] } : confirmAssign(s)
    case 'escape': return { state: { ...s, dialog: null, dialogIndex: 0 }, effects: [] }
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
    case 't': case 'escape': return { state: { ...s, showTeam: false }, effects: [] }
    case 'up': case 'k': return move(-1)
    case 'down': case 'j': return move(1)
    case 'n': return { state: openPerson(s, 'team'), effects: [] }
    case 'delete': case 'backspace': return cur ? { state: { ...s, teamConfirm: cur }, effects: [] } : same
    default: return same
  }
}

// D: ticket-meta decided <ID> ([?] -> [ ], the [decide:] tag kept).
function decided(s: State): Step {
  const id = buildModel(viewOf(s)).ticket
  const t = id ? ticketOf(s, id) : null
  if (!t || t.box !== '?' || !t.decide) {
    return { state: toast(s, 'D marks a decision taken: only on a [?] row with a [decide:] tag'), effects: [] }
  }
  const then: Then = r => x => r.code !== 0
    ? toast(x, [`✗ ticket-meta decided ${t.id} refused: ${r.err.trim() || r.out.trim() || 'exit ' + r.code}`, ran(r.argv)].join('\n'))
    : toast(x, [`✓ ${t.id} decided, now pending: ${t.title}`, ...notesOf(r.out), ran(r.argv)].join('\n'))
  return { state: s, effects: [run('meta-decided', [t.id], then)] }
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
export function onMachine(s: State, kv: string, now: number): Step {
  const m = parseMachine(kv, now)
  const w = classify(m)
  let state: State = { ...s, machine: m, watch: w }
  const effects: Effect[] = []
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

export function onRuns(s: State, list: string, chains: Record<string, string>): State {
  const runs = parseRuns(list, chains)
  const first = runs.find(x => x.done < x.total)
  const runsSelected = runs.some(r => r.id === s.runsSelected) ? s.runsSelected : runs[0]?.id ?? null
  return { ...s, runs, runsSelected, runsRead: true, relay: first ? `${first.id} ${first.done}/${first.total}` : null }
}

// s: relay-morpheus queue-run add <id> on a planned run; the continue prompt is shown to
// paste into the CLI (no host to submit it), then the runs are read again.
function startRun(s: State): Step {
  const r0 = s.runs.find(r => r.id === s.runsSelected) ?? s.runs[0]
  if (!r0 || !r0.planned) return { state: toast(s, 's starts a planned run only'), effects: [] }
  const id = r0.id
  const then: Then = r => x => {
    const tail = r.argv.length ? `\nran: ${r.argv.join(' ')}` : ''
    if (r.code !== 0) return toast(x, `■ ${id} not queued: ${r.err.trim() || r.out.trim() || `exit ${r.code}`}${tail}`)
    const said = r.out.trim() || r.err.trim()
    return { state: toast(x, `✓ ${id} queued${said ? ` - ${said}` : ''}. Paste its continue prompt into your CLI:\n${continuePrompt(id)}${tail}`),
      effects: [{ kind: 'poll', what: 'runs' }] }
  }
  return { state: s, effects: [run('relay-queue-add', [id], then)] }
}

function runsKey(s: State, k: Key): Step {
  const ids = s.runs.map(r => r.id)
  const cur = s.runsSelected ?? ids[0] ?? null
  const move = (by: number): Step => {
    const to = ids[ids.indexOf(cur ?? '') + by]
    return { state: to ? { ...s, runsSelected: to } : s, effects: [] }
  }
  switch (k.name) {
    case 'up': case 'k': return move(-1)
    case 'down': case 'j': return move(1)
    case 'return': case 'enter': return { state: { ...s, runsExpanded: cur && s.runsExpanded !== cur ? cur : null }, effects: [] }
    case 's': return startRun(s)
    default: return { state: s, effects: [] }
  }
}

// --- tickets ---

function ticketsKey(s: State, k: Key): Step {
  const same = { state: s, effects: [] }
  if (s.showTeam) return teamKey(s, k)
  const m = buildModel(viewOf(s))
  // F61: up/down walk the group headers and the rows of open groups (the model's items).
  const move = (by: number): Step => {
    const at = m.selected === null ? -1 : m.items.indexOf(m.selected)
    const to = at < 0 ? undefined : m.items[at + by]
    return { state: to ? { ...s, selected: to } : s, effects: [] }
  }
  switch (k.name) {
    case 'up': case 'k': return move(-1)
    case 'down': case 'j': return move(1)
    case 'return': case 'enter': {
      const id = m.selected
      // on a header: open or close its group, the header stays selected - unless it stands
      // for a ticket hidden in it (the stored selection), which opening lands back on
      if (isHead(id)) {
        const g = m.groups.find(x => headKey(x.box) === id)
        const keep = s.selected && !isHead(s.selected) && g?.tickets.some(t => t.id === s.selected)
        return { state: g ? { ...s, selected: keep ? s.selected : id, open: toggleGroup(s.open, g.box) } : s, effects: [] }
      }
      return { state: { ...s, expanded: id && s.expanded !== id ? id : null }, effects: [] }
    }
    case 'a': return { state: openDialog(s, 'owner'), effects: [] }
    case 'd': return { state: openDialog(s, 'decide'), effects: [] }
    case 'D': return decided(s)
    case 'f': return { state: { ...s, filterField: 'app' }, effects: [] }
    case 'x': return { state: { ...s, filter: { ...s.filter, showDone: !s.filter.showDone } }, effects: [] }
    case 't': return { state: { ...s, showTeam: true }, effects: [] }
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
  return { state: { ...s, tab }, effects }
}

export function reduce(s: State, k: Key): Step {
  const quit: Step = { state: { ...s, quit: true }, effects: [{ kind: 'quit' }] }
  // A146: a form holding typed text is not thrown away by one ctrl+c - it cancels the
  // form (as Esc), the board stays; the next ctrl+c quits. An empty form has nothing to lose.
  if (k.ctrl && k.name === 'c') {
    if (s.setup?.touched) return { state: { ...s, setup: null }, effects: [] }
    return s.person && (s.person.handle || s.person.name || s.person.emails) ? personKey(s, { name: 'escape' }) : quit
  }
  if (s.setup) return setupKey(s, k)
  if (s.person) return personKey(s, k)
  if (s.dialog) return dialogKey(s, k)
  if (s.teamConfirm) return teamKey(s, k)
  if (s.filterField) return filterKey(s, k)
  switch (k.name) {
    case 'q': return quit
    case '1': return toTab(s, 'tickets')
    case '2': return toTab(s, 'runs')
    case '3': return toTab(s, 'health')
    case '4': return toTab(s, 'messages')
    case 'tab': {
      const at = TABS.indexOf(s.tab)
      return toTab(s, TABS[(at + (k.shift ? TABS.length - 1 : 1)) % TABS.length]!)
    }
    case 'r': return { state: s, effects: [{ kind: 'poll', what: 'board' }, { kind: 'poll', what: 'slow' }] }
    case 'R': return resume(s)
  }
  if (s.tab === 'tickets') return ticketsKey(s, k)
  if (s.tab === 'runs') return runsKey(s, k)
  if (s.tab === 'messages') return messagesKey(s, k)
  return k.name === 'escape' ? { state: { ...s, toast: null }, effects: [] } : { state: s, effects: [] }
}
