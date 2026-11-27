import { atom, read, update } from 'claude-code'
import type { EngineInterface, FsEntry, RenderElement, RenderInput } from 'claude-code'
import type { AssignDraft, AutoPriorityDraft, Box as State, LiveSession, Member, PersonDraft, Priority, PriorityDraft, Ticket } from '../types'
import { parseBoard, PRIORITIES, priorityFilterOptions, prioritySelectors, SESSION_HEARTBEAT_MS, STATE_NAME, ticketById } from './lib/board'
export { isOpen } from './lib/board'
import { runCall } from './lib/host'
import { norm } from './lib/calls'
import { sameHandle } from './lib/team'
import type { Call } from './lib/host'
import { clearStatus } from './status'
import { paint } from './paint'
import { say } from './logtab'

// F47: the assign / decide form, the Decided button's call and the Add person
// form. Every write is a ticket-meta run; the mod writes no file.
//
// B5: the forms are a mode of the ops-board pane's own body, never a second pane.
// `a` / `d` / add are pressed while the ops-board pane holds the keys, and the host
// refuses another pane's focus then (PaneOpenArgs.focus): a dialog pane opened as an
// unshown tab behind it, so the press showed nothing. A form up is the assign or
// person atom set; renderPane draws it in place of the view it came from.

const actionFocusA = atom({ plugin: 'ops-board', key: 'actionFocus' } as const, null)
const PANE = 'ops-board'          // pane.tsx's PANE_ID (it imports this file)
const PANE_NAME = 'ops board'     // pane.tsx's PANE_TITLE

// While a form is up, Esc (closeOnEscape) raises ui.close on the pane, which the
// register hook refuses and turns into Cancel; the ring goes to the form's first
// element. A deny (the pane does not hold the keys) leaves the ring to the person.
export async function showForm($: EngineInterface, ring: string) {
  await update($, actionFocusA, () => null)
  await $.ui.open({ id: PANE, title: PANE_NAME, closeOnEscape: true })
  void $.ui.focus({ requestId: PANE, key: ring }).catch(() => {})
}

// Each file names the atoms it reads or writes as its own consts (see pane.tsx).
const boardA = atom({ plugin: 'ops-board', key: 'board' } as const, null)
const teamA = atom({ plugin: 'ops-board', key: 'team' } as const, [])
const meA = atom({ plugin: 'ops-board', key: 'me' } as const, null)
const assignA = atom({ plugin: 'ops-board', key: 'assign' } as const, null)
const priorityA = atom({ plugin: 'ops-board', key: 'priorityDraft' } as const, null)
const autoPriorityA = atom({ plugin: 'ops-board', key: 'autoPriority' } as const, null)
const ruleDraftA = atom({ plugin: 'ops-board', key: 'ruleDraft' } as const, null)         // F203: rules.tsx's forms
const rulesPreviewA = atom({ plugin: 'ops-board', key: 'rulesPreview' } as const, null)
let priorityRequest = 0
const personA = atom({ plugin: 'ops-board', key: 'person' } as const, null)
const statusA = atom({ plugin: 'ops-board', key: 'status' } as const, null)
const reconcileA = atom({ plugin: 'ops-board', key: 'reconcile' } as const, null)   // F81: reconcile.tsx's form
const intakeA = atom({ plugin: 'ops-board', key: 'intake' } as const, null)
const sessionA = atom({ plugin: 'ops-board', key: 'session' } as const, null)       // F109: this session's code

const HANDLE = /^@[a-z0-9_-]+$/

const cut = (s: string, room: number) => (s.length <= room ? s : s.slice(0, Math.max(1, room - 1)) + '…')
const quote = (a: string) => (/[\s"]/.test(a) || a === '' ? '"' + a.replace(/"/g, '\\"') + '"' : a)
const ran = (argv: string[]) => 'ran: ' + argv.map(quote).join(' ')
// ticket-meta's output less the ticket line it echoes: warnings, "no change", the rest.
const notes = (out: string) => out.split(/\r?\n/).map(l => l.trimEnd()).filter(l => l && !/^\s*- \[/.test(l))

// F77: the heading names the ticket the Ticket field resolves to, else "a ticket".
const titleOf = (d: AssignDraft, t: Ticket | null) =>
  `Assign ${t ? t.id : 'a ticket'}${d.kind === 'decide' ? ' for a decision' : d.kind === 'tester' ? ' for testing' : d.kind === 'session' ? ' to a session' : ''}`

// A239: an owner identifies the participant; a recent matching heartbeat proves activity.
let sessionLoad = 0
async function liveSessions($: EngineInterface): Promise<LiveSession[]> {
  const own = await read($, sessionA)
  const out: LiveSession[] = own ? [{ code: own, owner: await read($, meA) }] : []
  const repo = await $.session.repo().catch(() => null)
  if (!repo) return out
  const dir = norm(repo.root) + '/.skillator/sessions'
  let entries: FsEntry[] = []
  try { entries = await $.fs.list(dir) } catch { return out }
  const now = await $.clock.now()
  const files = new Map(entries.filter(e => e.kind === 'file' && !e.isLink).map(e => [e.name, e]))
  const others = await Promise.all([...files.values()].map(async e => {
    const code = /^([a-z0-9_]+-[a-z0-9_-]+)\.live$/.exec(e.name)?.[1]
    if (!code || code === own || now - e.mtimeMs >= SESSION_HEARTBEAT_MS || !files.has(code + '.owner')) return null
    try {
      const [heartbeat, record] = await Promise.all([$.fs.read(dir + '/' + e.name), $.fs.read(dir + '/' + code + '.owner')])
      const [owner, identity] = record.split(/\r?\n/)
      if (!identity?.startsWith('session: ') || identity === 'session: ' || identity !== heartbeat.trimEnd()) return null
      return { code, owner: owner?.trim() || null }
    } catch { return null }
  }))
  return [...out, ...others.filter((session): session is LiveSession => session !== null)]
}
// The ticket an ID names on the loaded board, typed in any case (F77).
async function findTicket($: EngineInterface, id: string): Promise<Ticket | null> {
  return ticketById((await read($, boardA))?.tickets, id)
}

async function refreshBoardTicket($: EngineInterface, id: string, patch: (t: Ticket) => Ticket) {
  const b = await read($, boardA)
  if (!b) return
  if (b.path) {
    try {
      const text = await $.fs.read(b.path)
      const parsed = parseBoard(text, b.path, b.mtimeMs, text.length)
      const before = b.tickets.find(x => x.id === id)
      const after = parsed.tickets.find(x => x.id === id)
      if (after && JSON.stringify(before) !== JSON.stringify(after)) {
        await update($, boardA, () => parsed)
        return
      }
    } catch {}
  }
  await update($, boardA, cur => (cur ? { ...cur, tickets: cur.tickets.map(x => (x.id === id ? patch(x) : x)) } : cur))
}

// The handle a fresh dialog starts on: the ticket's own (owner or decider) when
// on the team, else me, else the first member - always as team.md writes it, since
// ticket-meta matches the handle exactly (the board's tags are read lower-cased).
// No ticket yet (F77: the ID still to be typed): me, else the first member.
function startHandle(t: Ticket | null, kind: AssignDraft['kind'], team: Member[], me: string | null): string | null {
  const on = (h: string | null) => team.find(m => sameHandle(m.handle, h))?.handle ?? null
  return on(t ? (kind === 'owner' ? t.owner : kind === 'decide' ? t.decide : t.tester) : null) ?? on(me) ?? team[0]?.handle ?? null
}

// `a` / `d`: the dialog on the ticket the pane shows selected (its model resolves a
// stale selection to the first item). F61: a header selected - or a ticket hidden in a
// collapsed group, shown as its header - is no ticket. F77: then the form opens all the
// same, its Ticket field empty and the ring on it, for the ID to be typed; with a ticket
// the field is prefilled with its ID and can still be changed. A surface with no Input
// (mobile, `canType` false) cannot fill the field: there the old refusal stands.
export async function openAssign($: EngineInterface, kind: AssignDraft['kind'], shown: string | null, canType = true) {
  await update($, actionFocusA, () => null)
  const t = shown ? ((await read($, boardA))?.tickets.find(x => x.id === shown) ?? null) : null
  if (!t && !canType) { say($, 'ops board: select a ticket first'); return }
  sessionLoad++
  const sessions = kind === 'session' ? await liveSessions($) : []
  const draft: AssignDraft = { id: t?.id ?? '', kind, handle: startHandle(t, kind, await read($, teamA), await read($, meA)), result: null,
    sessions, session: t?.assignedSession ?? sessions[0]?.code ?? null }
  await clearStatus($)
  await update($, personA, () => null)
  await update($, assignA, () => draft)
  await showForm($, t ? whoKey(draft) : 'ticket')
}

const whoKey = (d: AssignDraft) => (d.handle ? 'who:' + d.handle : 'who:+add')

export async function isFormUp($: EngineInterface): Promise<boolean> {
  return (await read($, statusA)) !== null || (await read($, assignA)) !== null || (await read($, personA)) !== null || (await read($, reconcileA)) !== null || (await read($, intakeA)) !== null || (await read($, priorityA)) !== null || (await read($, autoPriorityA)) !== null || (await read($, ruleDraftA)) !== null || (await read($, rulesPreviewA)) !== null
}

export async function clearForm($: EngineInterface) {
  sessionLoad++
  await clearStatus($)
  await update($, actionFocusA, () => null)
  await update($, assignA, () => null)
  await update($, personA, () => null)
  await update($, reconcileA, () => null)
  await update($, intakeA, () => null)
  await update($, priorityA, () => null)
  await update($, autoPriorityA, () => null)
  await update($, ruleDraftA, () => null)
  await update($, rulesPreviewA, () => null)
}

// Done or Cancel: back to the view the form came from, Esc the pane's own again
// (it hands the keys back, the board stays). A form already gone (Esc during a
// run) leaves the pane as it is.
export async function closeForm($: EngineInterface) {
  if (!(await isFormUp($))) return
  await clearForm($)
  await $.ui.open({ id: PANE, title: PANE_NAME })
}

export async function openPriority($: EngineInterface, id: string | null) {
  if (!id || !(await findTicket($, id))) { say($, 'ops board: select a ticket first'); return }
  await clearForm($)
  const request = ++priorityRequest
  await update($, priorityA, () => ({ request, id, level: null, busy: false, preview: null, result: null }))
  await showForm($, 'priority:P1')
}

async function changePriority($: EngineInterface, draft: PriorityDraft, level: Priority, save = false) {
  const token = save ? draft.preview?.token : undefined
  if (save && !token) return
  let started = false
  const request = ++priorityRequest
  await update($, priorityA, current => {
    started = !!current && current.request === draft.request && !current.busy
    return started ? { ...draft, request, level, busy: true, preview: null, result: null } : current
  })
  if (!started) return

  const args = token ? ['apply', token, level] : ['preview', level]
  const next = (preview: PriorityDraft['preview'], result: string | null) =>
    update($, priorityA, current => current?.request === request ? { ...current, busy: false, preview, result } : current)
  const r = await runCall($, 'queue-priority', ['--current-worktree', ...args, 'id=' + draft.id])
    .catch(err => ({ code: -1, out: '', err: String(err) }))
  if (r.code !== 0) {
    await next(null, r.err.trim() || r.out.trim() || `Queue Jarvis exited ${r.code}`)
    return
  }
  if (token) {
    await refreshBoardTicket($, draft.id, t => ({ ...t, priority: level, rule: undefined }))
    say($, `✓ ${draft.id} priority set to ${level}`, { timeoutMs: 8000 })
    if ((await read($, priorityA))?.request === request) await closeForm($)
    return
  }

  const previewToken = /^Preview token: ([a-f0-9]{64})\s*$/m.exec(r.out)?.[1]
  const change = r.out.split(/\r?\n/).find(line => line.startsWith(draft.id + ' ') && line.includes(' -> '))
  if (!previewToken || !change) {
    await next(null, 'No priority change to save. Check the ticket and choose a level again.')
    return
  }
  await next({ token: previewToken, change: change.replace(/ {2,}/g, ' ') }, null)
  if ((await read($, priorityA))?.request === request) {
    void $.ui.focus({ requestId: PANE, key: 'priority:save' }).catch(() => {})
  }
}

export async function openAutoPriority($: EngineInterface) {
  await clearForm($)
  const request = ++priorityRequest
  await update($, autoPriorityA, () => ({ request, selection: {}, picker: null, busy: false, error: null, preview: null }))
  await showForm($, 'priority:auto-filter:id')
}

export async function runAutoPriority($: EngineInterface, save = false): Promise<boolean> {
  const draft = await read($, autoPriorityA)
  if (!draft || draft.busy || (save && !draft.preview?.token)) return false
  const request = ++priorityRequest
  let started = false
  await update($, autoPriorityA, current => {
    started = current?.request === draft.request && !current.busy && !current.picker
      && JSON.stringify(current.selection) === JSON.stringify(draft.selection)
    return started ? { ...draft, request, busy: true, error: null, preview: null } : current
  })
  if (!started) return false
  const finish = (preview: AutoPriorityDraft['preview'], error: string | null) =>
    update($, autoPriorityA, current => current?.request === request ? { ...current, busy: false, error, preview } : current)
  const selectors = save ? draft.preview!.selectors : prioritySelectors(draft.selection)
  const args = save ? ['auto-apply', draft.preview!.token!] : ['auto-preview']
  const r = await runCall($, 'queue-priority', ['--current-worktree', ...args, ...selectors])
    .catch(err => ({ code: -1, out: '', err: String(err) }))
  if (r.code !== 0) {
    await finish(null, r.err.trim() || r.out.trim() || `Queue Jarvis exited ${r.code}`)
    return false
  }
  if (save) {
    say($, r.out.trim() || 'Ticket priorities assigned.', { timeoutMs: 8000 })
    if ((await read($, autoPriorityA))?.request === request) await closeForm($)
    return true
  }

  const [, count = '', levels = '', ...rows] = r.out.trimEnd().split(/\r?\n/)
  const expected = /^(\d+) ticket\(s\) would change\.$/.exec(count)?.[1]
  const token = /^Preview token: ([a-f0-9]{64})$/.exec(rows.at(-1) ?? '')?.[1] ?? null
  const changes = token ? rows.slice(0, -1) : rows
  if (expected === undefined || !levels.startsWith('P1:') || Number(expected) !== changes.length || (changes.length > 0 && !token)
    || changes.some(line => !/^[A-Z]{1,3}\d+[a-z]?\s+Unranked -> P[1-5]\s/.test(line))) {
    await finish(null, 'Queue Jarvis returned an incomplete preview. Run Preview again.')
    return false
  }
  await finish({ token, selectors, count, levels, changes }, null)
  if (token && (await read($, autoPriorityA))?.request === request) {
    void $.ui.focus({ requestId: PANE, key: 'priority:auto-save' }).catch(() => {})
  }
  return false
}

export async function renderAutoPriority($: EngineInterface, e: RenderInput<'Pane'>): Promise<RenderElement | null> {
  const draft = await read($, autoPriorityA)
  if (!draft) return null
  const t = $.ui.resolve(e)
  const { Box, Text, Button } = t
  const Select = e.surface !== 'mobile' && 'Select' in t ? t.Select : null
  const filters = priorityFilterOptions(await read($, boardA))
  const optionsFor = (key: string, values: string[]) =>
    [...new Set(['-', ...values, draft.selection[key] ?? '-'])]
  const setFilter = (key: string, value: string) => {
    void update($, autoPriorityA, current => {
      if (!current || current.busy || current.request !== draft.request) return current
      if ((current.selection[key] ?? '-') === value) return { ...current, picker: null }
      return { ...current, picker: null, selection: { ...current.selection, [key]: value }, preview: null, error: null }
    })
  }
  const setPicker = (picker: AutoPriorityDraft['picker']) => {
    void update($, autoPriorityA, current => current && !current.busy && current.request === draft.request ? { ...current, picker } : current)
  }
  const picker = draft.picker
  const choosing = picker && filters.find(filter => filter.key === picker.key)
  if (picker && choosing) {
    const values = optionsFor(choosing.key, choosing.values)
    const pageSize = 12
    const start = picker.page * pageSize
    return (
      <Box flexDirection="column">
        <Text bold>{choosing.label}</Text>
        {values.slice(start, start + pageSize).map(value =>
          <Button key={'priority:auto-option:' + value} plain variant={(draft.selection[picker.key] ?? '-') === value ? 'primary' : undefined}
            onPress={() => setFilter(picker.key, value)}>{value}</Button>)}
        <Box flexDirection="row" flexWrap="wrap" gap={2}>
          {start > 0 && <Button key="priority:auto-previous" plain onPress={() => setPicker({ ...picker, page: picker.page - 1 })}>Previous</Button>}
          {start + pageSize < values.length && <Button key="priority:auto-next" plain onPress={() => setPicker({ ...picker, page: picker.page + 1 })}>Next</Button>}
          <Button key="priority:auto-back" plain onPress={() => setPicker(null)}>Back</Button>
        </Box>
      </Box>
    )
  }
  return (
    <Box flexDirection="column">
      <Box key="form:title"><Text bold>Auto-assign priorities</Text><Text dimColor>{'  Esc cancels'}</Text></Box>
      <Text dimColor wrap="wrap">Only open unprioritized tickets are eligible. Leave a filter at - to include any value.</Text>
      {filters.map(({ key, label, values }) => {
        const elementKey = 'priority:auto-filter:' + key
        const value = draft.selection[key] ?? '-'
        if (draft.busy) return <Text key={elementKey} wrap="wrap">{label + ' ' + value}</Text>
        // B33: the pane refuses a Select over 64 options (and draws nothing); a longer list pages
        return Select && optionsFor(key, values).length <= 64
          ? <Select key={elementKey} label={label} value={value} options={optionsFor(key, values).map(option => ({ value: option, label: option }))}
              onSelect={option => setFilter(key, option)} />
          : <Button key={elementKey} plain onPress={() => setPicker({ key, page: 0 })}>{label + ' ' + value}</Button>
      })}
      {draft.busy && <Text dimColor>Working…</Text>}
      {draft.error && <Box key="priority:auto-error"><Text color="error" wrap="wrap">{draft.error}</Text></Box>}
      {draft.preview && <Box key="priority:auto-summary" flexDirection="column">
        <Text>{draft.preview.count}</Text><Text wrap="wrap">{draft.preview.levels}</Text>
      </Box>}
      <Box flexDirection="row" flexWrap="wrap" gap={2}>
        {!draft.busy && <Button key="priority:auto-preview" plain onPress={() => { void runAutoPriority($) }}>Preview</Button>}
        {draft.preview?.token && <Button key="priority:auto-save" variant="primary" onPress={() => {}}>Save</Button>}
        <Button key="priority:auto-cancel" plain onPress={() => { void closeForm($) }}>Cancel</Button>
      </Box>
      {draft.preview?.changes.length ? <Box key="priority:auto-changes"><Text wrap="wrap">{draft.preview.changes.join('\n')}</Text></Box> : null}
    </Box>
  )
}

// Assign: ticket-meta assign|decide|assign-tester <ID> @h. Done: a toast with what it said and
// the command that ran, the dialog closed. Refused: its stderr in the dialog.
async function confirm($: EngineInterface) {
  const d = await read($, assignA)
  if (!d) return
  // F77: Assign only on a ticket the field resolves to, under the board's own ID.
  const t = await findTicket($, d.id)
  if (!t) return
  if (d.kind === 'session') { await confirmSession($, t, d); return }
  if (!d.handle) return
  const call: Call = d.kind === 'decide' ? 'meta-decide' : d.kind === 'tester' ? 'meta-assign-tester' : 'meta-assign'
  const r = await runCall($, call, [t.id, d.handle])
  if (r.code !== 0) {
    const why = (r.err.trim() || r.out.trim() || `ticket-meta exited ${r.code}`)
    await update($, assignA, x => (x ? { ...x, result: why } : x))
    return
  }
  const h = d.handle.toLowerCase()
  await refreshBoardTicket($, t.id, tk => d.kind === 'tester'
    ? { ...tk, tester: h }
    : d.kind === 'decide'
      ? { ...tk, box: '?', decide: h }
      : { ...tk, box: ' ', owner: h })
  const closed = t.box === 'x' || t.box === '-'
  const state = d.kind === 'decide' ? 'decide' : 'pending'
  const role = d.kind === 'decide' ? `for ${d.handle} to decide` : d.kind === 'tester' ? `tester ${d.handle}` : `owned by ${d.handle}`
  const head = d.kind === 'tester'
    ? `✓ ${t.id} tester assigned ${role}: ${t.title}`
    : `✓ ${t.id} ${closed ? 'reopened as' : 'now'} ${state}, ${role}: ${t.title}`
  say($, [head, ...notes(r.out), ran(r.argv)].join('\n'), { timeoutMs: 8000 })
  await closeForm($)
}

// F178: ticket-meta assign-session <ID> <code> - the box, owner and the rest kept.
async function confirmSession($: EngineInterface, t: Ticket, d: AssignDraft) {
  const code = d.session
  if (!code) return
  const r = await runCall($, 'meta-assign-session', [t.id, code])
  if (r.code !== 0) {
    await update($, assignA, x => (x ? { ...x, result: r.err.trim() || r.out.trim() || `ticket-meta exited ${r.code}` } : x))
    return
  }
  await refreshBoardTicket($, t.id, tk => ({ ...tk, assignedSession: code === '-' ? null : code }))
  say($, [`✓ ${t.id} ${code === '-' ? 'session cleared' : 'assigned to session ' + code}: ${t.title}`, ...notes(r.out), ran(r.argv)].join('\n'), { timeoutMs: 8000 })
  await closeForm($)
}

// The Decided button: ticket-meta decided <ID> ([?] -> [ ], the [decide:] tag kept).
export async function runDecided($: EngineInterface, id: string) {
  const t = await findTicket($, id)
  const r = await runCall($, 'meta-decided', [id])
  if (r.code !== 0) {
    say($, [`✗ ticket-meta decided ${id} refused: ${r.err.trim() || r.out.trim() || 'exit ' + r.code}`, ran(r.argv)].join('\n'), { timeoutMs: 8000 })
    return
  }
  await refreshBoardTicket($, id, tk => ({ ...tk, box: ' ' }))
  say($, [`✓ ${id} decided, now pending${t ? ': ' + t.title : ''}`, ...notes(r.out), ran(r.argv)].join('\n'), { timeoutMs: 8000 })
}

// --- team: Add person (a form in the pane) and remove (from the Team view) ---

export async function openAddPerson($: EngineInterface, back: PersonDraft['back']) {
  await update($, actionFocusA, () => null)
  if (back === 'team') await update($, assignA, () => null)
  await update($, personA, () => ({ handle: '', name: '', emails: '', result: null, back }))
  await showForm($, 'handle')
}

const handleOf = (s: string) => '@' + s.trim().replace(/^@+/, '').toLowerCase()
const emailsOf = (s: string) => s.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean).join(',')
const nameOf = (p: PersonDraft) => p.name.trim() || handleOf(p.handle).slice(1)
const addArgs = (p: PersonDraft) => [handleOf(p.handle), nameOf(p), emailsOf(p.emails)]

async function addPerson($: EngineInterface) {
  const p = await read($, personA)
  if (!p) return
  const [h, name, emails] = addArgs(p) as [string, string, string]
  const bad = !HANDLE.test(h) ? 'handle: lower-case a-z 0-9 _ - after the @'
    : !emails ? 'emails: at least one (a@x, b@y)' : null
  if (bad) { await update($, personA, x => (x ? { ...x, result: bad } : x)); return }
  const r = await runCall($, 'meta-team-add', [h, name, emails])
  if (r.code !== 0) {
    const why = r.err.trim() || r.out.trim() || `ticket-meta exited ${r.code}`
    await update($, personA, x => (x ? { ...x, result: why } : x))
    return
  }
  say($, [`✓ ${h} added to .skillator/team.md`, ran(r.argv)].join('\n'), { timeoutMs: 8000 })
  const d = await read($, assignA)
  if (p.back === 'assign' && d) {
    // Back on the assign form, the new person picked; the 2 s poll lists them.
    const next = { ...d, handle: h, result: `✓ ${h} added to .skillator/team.md` }
    await update($, actionFocusA, () => null)
    await update($, personA, () => null)
    await update($, assignA, () => next)
    await showForm($, whoKey(next))
    return
  }
  await closeForm($)
}

// Cancel, and Esc (the register hook's refused ui.close): one level back - Add person
// opened from the assign form returns to it, any other form goes.
export async function cancelPerson($: EngineInterface) {
  const p = await read($, personA)
  const d = await read($, assignA)
  if (p?.back === 'assign' && d) {
    await update($, actionFocusA, () => null)
    await update($, personA, () => null)
    await showForm($, whoKey(d))
    return
  }
  await closeForm($)
}

export async function removeMember($: EngineInterface, h: string) {
  const r = await runCall($, 'meta-team-remove', [h])
  if (r.code !== 0) {
    say($, [`✗ ticket-meta team remove ${h} refused: ${r.err.trim() || r.out.trim() || 'exit ' + r.code}`, ran(r.argv)].join('\n'), { timeoutMs: 8000 })
    return
  }
  const said = notes(r.out).filter(l => !/^removed:/.test(l))
  say($, [`✓ ${h} removed from .skillator/team.md`, ...said, ran(r.argv)].join('\n'), { timeoutMs: 10000 })
}

// F80: ticket-meta decides who may (the lead hands over; none set, anyone sets the first).
export async function makeLead($: EngineInterface, h: string) {
  const r = await runCall($, 'meta-team-lead', [h])
  if (r.code !== 0) {
    say($, [`✗ ticket-meta team lead ${h} refused: ${r.err.trim() || r.out.trim() || 'exit ' + r.code}`, ran(r.argv)].join('\n'), { timeoutMs: 8000 })
    return
  }
  const said = notes(r.out).filter(l => !/^lead:/.test(l))
  say($, [`✓ ${h} is the lead`, ...said, ran(r.argv)].join('\n'), { timeoutMs: 10000 })
}

// --- drawing ---

// The form up in the ops-board pane, or null when none is (the pane draws its view).
// Cancel is a plain Button, not role="dismiss": a desktop would draw that as the
// whole pane's close control.
export async function renderForm($: EngineInterface, e: RenderInput<'Pane'>): Promise<RenderElement | null> {
  const p = await read($, personA)
  const d = await read($, assignA)
  const priority = await read($, priorityA)
  if (!p && !d && !priority) return null
  const t = $.ui.resolve(e)
  const { Box, Text, Button } = t
  const Input = e.surface !== 'mobile' && 'Input' in t ? t.Input : null
  const cols = Math.max(20, e.props.bodyColumns)
  const focus = await read($, actionFocusA)
  const team = await read($, teamA)
  const label = (s: string) => <Text dimColor>{s}</Text>
  const heading = (s: string) => <Box key="form:title"><Text bold>{s}</Text><Text dimColor>{'  Esc cancels'}</Text></Box>

  if (priority) {
    const level = priority.level
    return (
      <Box flexDirection="column">
        {heading(`Priority for ${priority.id}`)}
        {(Object.keys(PRIORITIES) as Priority[]).map(value =>
          <Button key={'priority:' + value} plain hotkey={value.slice(1)} variant={value === level ? 'primary' : undefined}
            onPress={() => { void changePriority($, priority, value) }}>
            <Text color={PRIORITIES[value].color}>{value}</Text>{'  ' + PRIORITIES[value].label}
          </Button>)}
        {priority.busy && <Text dimColor>Working…</Text>}
        {priority.preview && <Box key="priority:preview"><Text wrap="wrap">{priority.preview.change}</Text></Box>}
        {priority.result && <Box key="priority:result"><Text color="error" wrap="wrap">{priority.result}</Text></Box>}
        <Box flexDirection="row" gap={2}>
          {priority.preview && level && <Button key="priority:save" variant="primary" onPress={() => { void changePriority($, priority, level, true) }}>Save</Button>}
          <Button key="priority:cancel" plain onPress={() => { void closeForm($) }}>Cancel</Button>
        </Box>
      </Box>
    )
  }

  if (p) {
    const armed = focus === 'add' || focus === 'cancel'
    const [who, name, emails] = addArgs(p) as [string, string, string]   // never `h`: the JSX factory
    const set = (k: 'handle' | 'name' | 'emails') => (v: string) => { void update($, personA, x => (x ? { ...x, [k]: v, result: null } : x)) }
    return (
      <Box flexDirection="column">
        {heading('Add person')}
        <Text dimColor>Tab to actions; letters there</Text>
        <Text> </Text>
        {Input
          ? [
              <Input key="handle" label="Handle  " placeholder="@handle" value={p.handle} autoFocus onInput={set('handle')} onSubmit={set('handle')} />,
              <Input key="name" label="Name    " placeholder="Full Name" value={p.name} onInput={set('name')} onSubmit={set('name')} />,
              <Input key="emails" label="Emails  " placeholder="a@x, b@y" value={p.emails} onInput={set('emails')} onSubmit={set('emails')} />,
            ]
          : <Text dimColor>Adding a person needs a keyboard surface (terminal or desktop).</Text>}
        <Text> </Text>
        <Box key="writes" flexDirection="row" flexWrap="wrap">{label('Writes  ')}<Text>.skillator/team.md</Text>{label(' (committed later)')}</Box>
        <Box key="runs" flexDirection="row" flexWrap="wrap">{label('Runs')}<Text wrap="wrap">{`    ticket-meta team add ${who} ${quote(name)} ${emails}`}</Text></Box>
        {p.result && <Box key="result"><Text color="error" wrap="wrap">{p.result}</Text></Box>}
        <Text> </Text>
        <Box flexDirection="row" flexWrap="wrap" gap={4}>
          <Button key="add" plain hotkey={armed ? 'a' : undefined} variant="primary" onPress={() => { void addPerson($) }}>Add</Button>
          <Button key="cancel" plain hotkey={armed ? 'c' : undefined} onPress={() => { void cancelPerson($) }}>Cancel</Button>
        </Box>
      </Box>
    )
  }

  if (!d) return null
  const tk = await findTicket($, d.id)
  const people = [...team]
  if (d.handle && !people.some(m => m.handle === d.handle)) people.push({ handle: d.handle, emails: [] })
  const isSession = d.kind === 'session'
  // F178: the ticket's own [session:] code is listed even when not live; '-' (clear) drops it.
  const current = tk?.assignedSession ?? null
  const sessions = [...(d.sessions ?? [])]
  if (current && !sessions.some(x => x.code === current)) sessions.push({ code: current, owner: null })
  if (current) sessions.push({ code: '-', owner: null })
  const canGo = !!tk && (isSession ? !!d.session && d.session !== (current ?? '-') : !!d.handle)
  const armed = !!focus && (['kind:implementation', 'kind:decision', 'kind:tester', 'kind:session', 'who:+add', 'cancel', ...(canGo ? ['go'] : [])].includes(focus)
    || people.some(m => focus === 'who:' + m.handle) || sessions.some(x => focus === 'ses:' + x.code))
  const from: State = tk?.box ?? ' '
  const to: State = d.kind === 'decide' ? '?' : ' '
  const set = (fn: (x: AssignDraft) => AssignDraft) => { void update($, assignA, x => (x ? fn({ ...x, result: null }) : x)) }
  const radioKey = (kind: AssignDraft['kind']) => (kind === 'owner' ? 'kind:implementation' : kind === 'decide' ? 'kind:decision' : kind === 'session' ? 'kind:session' : 'kind:tester')
  const radioHotkey = (kind: AssignDraft['kind']) => (kind === 'owner' ? 'a' : kind === 'decide' ? 'd' : kind === 'session' ? 'e' : 't')
  const radio = (kind: AssignDraft['kind'], text: string) => (
    <Button key={radioKey(kind)} hotkey={armed ? radioHotkey(kind) : undefined} plain onPress={async () => {
      const load = ++sessionLoad
      if (kind === 'session') {
        const sessions = await liveSessions($)
        if (load !== sessionLoad) return
        await update($, assignA, x => x ? { ...x, kind, sessions, session: x.session ?? sessions[0]?.code ?? null, result: null } : x)
      } else set(x => ({ ...x, kind }))
      // the old ring (a person or session row) may not be drawn under the new kind: keep it on a drawn control
      void (async () => { await $.ui.focus({ requestId: PANE, key: radioKey(kind) }).catch(() => {}); await update($, actionFocusA, () => radioKey(kind)) })()
    }}>
      <Text color={d.kind === kind ? 'success' : undefined}>{d.kind === kind ? '(•)' : '( )'}</Text>{' ' + text}
    </Button>
  )
  const who = people.map(m => {
    const isSel = m.handle === d.handle
    const body = `${isSel ? '› ' : '  '}${m.handle.padEnd(9)}${m.name ?? ''}`
    return (
      <Button key={'who:' + m.handle} hotkey={armed && m.handle === (people.find(p => 'who:' + p.handle === focus)?.handle ?? d.handle ?? people[0]?.handle) ? 'o' : undefined} plain onPress={() => set(x => ({ ...x, handle: m.handle }))}>
        {isSel ? <Text inverse wrap="wrap">{body.padEnd(Math.max(body.length, 24))}</Text> : <Text wrap="wrap">{body}</Text>}
      </Button>
    )
  })
  // F178: the live sessions as `@owner code`; a pick sets the [session:] tag
  const ses = sessions.map(x => {
    const isSel = x.code === d.session
    const body = `${isSel ? '› ' : '  '}${x.code === '-' ? 'clear (drop the tag)' : `${x.owner ?? '@?'} ${x.code}${x.code === current && !d.sessions?.some(y => y.code === current) ? ' (not live)' : ''}`}`
    return (
      <Button key={'ses:' + x.code} hotkey={armed && x.code === (sessions.find(y => 'ses:' + y.code === focus)?.code ?? d.session) ? 'o' : undefined} plain onPress={() => set(y => ({ ...y, session: x.code }))}>
        {isSel ? <Text inverse wrap="wrap">{body.padEnd(Math.max(body.length, 24))}</Text> : <Text wrap="wrap">{body}</Text>}
      </Button>
    )
  })
  const verb = d.kind === 'decide' ? 'decide' : d.kind === 'tester' ? 'assign-tester' : d.kind === 'session' ? 'assign-session' : 'assign'
  // F77: the Ticket field - typed in any case; its line under it says what it resolves to.
  const typed = d.id.trim()
  const ticketField = Input
    ? <Input key="ticket" label="Ticket  " placeholder="F12" value={d.id} autoFocus={tk ? undefined : true}
        onInput={v => set(x => ({ ...x, id: v }))} onSubmit={v => set(x => ({ ...x, id: v }))} />
    : <Box key="ticket" flexDirection="row" flexWrap="wrap">{label('Ticket  ')}<Text>{typed || '(none - needs a keyboard surface)'}</Text></Box>
  const said = tk
    ? <Box key="title" flexDirection="row" flexWrap="wrap">
        <Text color={paint(tk.box)}>{'● ' + STATE_NAME[tk.box]}</Text>
        <Text dimColor wrap="truncate-end">{'  ' + cut(tk.title, Math.max(4, cols - STATE_NAME[tk.box].length - 4))}</Text>
      </Box>
    : <Box key="title">{typed ? <Text color="error">no such ticket</Text> : <Text dimColor>type a ticket ID, e.g. F12</Text>}</Box>
  const warn = tk?.box === '~' && d.kind !== 'tester' && !isSession
    ? (tk.session
        ? `! ${tk.id} is in progress under ${tk.session} - this moves it to ${STATE_NAME[to]}; the tag stays - tell that session`
        : `! ${tk.id} is in progress - this moves it to ${STATE_NAME[to]}; tell whoever is working it`)
    : null
  const isGood = !!d.result?.startsWith('✓')
  return (
    <Box flexDirection="column">
      {heading(titleOf(d, tk))}
      <Text dimColor>Tab to actions; letters there</Text>
      {ticketField}
      {said}
      <Text> </Text>
      <Box key="for" flexDirection="row" flexWrap="wrap" gap={3}>{label('For')}{radio('owner', 'implementation')}{radio('decide', 'decision')}{radio('tester', 'tester')}{radio('session', 'session')}</Box>
      {isSession ? <Box key="who" flexDirection="row" flexWrap="wrap">
        {label('Who   ')}
        <Box flexDirection="column">
          {sessions.length ? ses : <Box key="nosession"><Text color="warning">no live session known - ticket-meta iam names one</Text></Box>}
        </Box>
      </Box>
      : <Box key="who" flexDirection="row" flexWrap="wrap">
        {label('Who   ')}
        <Box flexDirection="column">
          {team.length === 0 && <Box key="noteam"><Text color="warning">no .skillator/team.md yet - add a person first</Text></Box>}
          {who}
          <Button key="who:+add" hotkey={armed ? 'n' : undefined} plain dimColor onPress={() => { void openAddPerson($, 'assign') }}>{'  + add person'}</Button>
        </Box>
      </Box>}
      {tk && (isSession
        ? <Box key="change" flexDirection="row" flexWrap="wrap">
            <Text dimColor>Change  </Text>
            <Text>{`session ${d.session ?? '(pick one)'} (keeps state, owner & the rest)`}</Text>
          </Box>
        : d.kind === 'tester'
        ? <Box key="change" flexDirection="row" flexWrap="wrap">
            <Text dimColor>Change  </Text>
            <Text color={paint(from)}>{'● ' + STATE_NAME[from]}</Text>
            <Text>{`, tester ${d.handle ?? '(pick someone)'} (keeps state, owner & decide; open to any teammate)`}</Text>
          </Box>
        : <Box key="change" flexDirection="row" flexWrap="wrap">
            <Text dimColor>Change  </Text>
            <Text color={paint(from)}>{'● ' + STATE_NAME[from]}</Text>
            <Text>{' -> '}</Text>
            <Text color={paint(to)}>{'● ' + STATE_NAME[to]}</Text>
            <Text>{`  ${d.kind === 'decide' ? 'decide' : 'owner'} ${d.handle ?? '(pick someone)'}`}</Text>
          </Box>)}
      {warn && <Box key="warn"><Text color="warning" wrap="wrap">{warn}</Text></Box>}
      <Box key="runs" flexDirection="row" flexWrap="wrap">{label('Runs')}<Text>{`    ticket-meta ${verb} ${tk?.id ?? '<ID>'} ${isSession ? d.session ?? '?' : d.handle ?? '@?'}`}</Text></Box>
      {d.result && <Box key="result"><Text color={isGood ? 'success' : 'error'} wrap="wrap">{d.result}</Text></Box>}
      <Text> </Text>
      <Box flexDirection="row" flexWrap="wrap" gap={4}>
        {canGo && <Button key="go" plain hotkey={armed ? 's' : undefined} variant="primary" onPress={() => { void confirm($) }}>Assign</Button>}
        <Button key="cancel" plain hotkey={armed ? 'c' : undefined} onPress={() => { void closeForm($) }}>Cancel</Button>
      </Box>
    </Box>
  )
}
