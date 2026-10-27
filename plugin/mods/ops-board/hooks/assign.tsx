import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'
import type { AssignDraft, Box as State, Member, PersonDraft, Ticket } from '../types'
import { STATE_NAME, ticketById } from './lib/board'
export { isOpen } from './lib/board'
import { runCall } from './lib/host'
import { sameHandle } from './lib/team'
import type { Call } from './lib/host'
import { clearStatus } from './status'
import { paint } from './paint'

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
async function showForm($: EngineInterface, ring: string) {
  await update($, actionFocusA, () => null)
  await $.ui.open({ id: PANE, title: PANE_NAME, closeOnEscape: true })
  void $.ui.focus({ requestId: PANE, key: ring }).catch(() => {})
}

// Each file names the atoms it reads or writes as its own consts (see pane.tsx).
const boardA = atom({ plugin: 'ops-board', key: 'board' } as const, null)
const teamA = atom({ plugin: 'ops-board', key: 'team' } as const, [])
const meA = atom({ plugin: 'ops-board', key: 'me' } as const, null)
const assignA = atom({ plugin: 'ops-board', key: 'assign' } as const, null)
const personA = atom({ plugin: 'ops-board', key: 'person' } as const, null)
const statusA = atom({ plugin: 'ops-board', key: 'status' } as const, null)
const reconcileA = atom({ plugin: 'ops-board', key: 'reconcile' } as const, null)   // F81: reconcile.tsx's form

const HANDLE = /^@[a-z0-9_-]+$/

// A state in words for the Change line: `?` reads "decision" there.
const word = (b: State) => (b === '?' ? 'decision' : STATE_NAME[b])
const cut = (s: string, room: number) => (s.length <= room ? s : s.slice(0, Math.max(1, room - 1)) + '…')
const quote = (a: string) => (/[\s"]/.test(a) || a === '' ? '"' + a.replace(/"/g, '\\"') + '"' : a)
const ran = (argv: string[]) => 'ran: ' + argv.map(quote).join(' ')
// ticket-meta's output less the ticket line it echoes: warnings, "no change", the rest.
const notes = (out: string) => out.split(/\r?\n/).map(l => l.trimEnd()).filter(l => l && !/^\s*- \[/.test(l))

// F77: the heading names the ticket the Ticket field resolves to, else "a ticket".
const titleOf = (d: AssignDraft, t: Ticket | null) => `Assign ${t ? t.id : 'a ticket'}${d.kind === 'decide' ? ' for a decision' : ''}`
// The ticket an ID names on the loaded board, typed in any case (F77).
async function findTicket($: EngineInterface, id: string): Promise<Ticket | null> {
  return ticketById((await read($, boardA))?.tickets, id)
}

// The handle a fresh dialog starts on: the ticket's own (owner or decider) when
// on the team, else me, else the first member - always as team.md writes it, since
// ticket-meta matches the handle exactly (the board's tags are read lower-cased).
// No ticket yet (F77: the ID still to be typed): me, else the first member.
function startHandle(t: Ticket | null, kind: AssignDraft['kind'], team: Member[], me: string | null): string | null {
  const on = (h: string | null) => team.find(m => sameHandle(m.handle, h))?.handle ?? null
  return on(t ? (kind === 'owner' ? t.owner : t.decide) : null) ?? on(me) ?? team[0]?.handle ?? null
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
  if (!t && !canType) { $.ui.toast('ops board: select a ticket first'); return }
  const draft: AssignDraft = { id: t?.id ?? '', kind, handle: startHandle(t, kind, await read($, teamA), await read($, meA)), result: null }
  await clearStatus($)
  await update($, personA, () => null)
  await update($, assignA, () => draft)
  await showForm($, t ? whoKey(draft) : 'ticket')
}

const whoKey = (d: AssignDraft) => (d.handle ? 'who:' + d.handle : 'who:+add')

export async function isFormUp($: EngineInterface): Promise<boolean> {
  return (await read($, statusA)) !== null || (await read($, assignA)) !== null || (await read($, personA)) !== null || (await read($, reconcileA)) !== null
}

export async function clearForm($: EngineInterface) {
  await clearStatus($)
  await update($, actionFocusA, () => null)
  await update($, assignA, () => null)
  await update($, personA, () => null)
  await update($, reconcileA, () => null)
}

// Done or Cancel: back to the view the form came from, Esc the pane's own again
// (it hands the keys back, the board stays). A form already gone (Esc during a
// run) leaves the pane as it is.
export async function closeForm($: EngineInterface) {
  if (!(await isFormUp($))) return
  await clearForm($)
  await $.ui.open({ id: PANE, title: PANE_NAME })
}

// Assign: ticket-meta assign|decide <ID> @h. Done: a toast with what it said and
// the command that ran, the dialog closed. Refused: its stderr in the dialog.
async function confirm($: EngineInterface) {
  const d = await read($, assignA)
  if (!d || !d.handle) return
  // F77: Assign only on a ticket the field resolves to, under the board's own ID.
  const t = await findTicket($, d.id)
  if (!t) return
  const call: Call = d.kind === 'decide' ? 'meta-decide' : 'meta-assign'
  const r = await runCall($, call, [t.id, d.handle])
  if (r.code !== 0) {
    const why = (r.err.trim() || r.out.trim() || `ticket-meta exited ${r.code}`)
    await update($, assignA, x => (x ? { ...x, result: why } : x))
    return
  }
  const closed = t.box === 'x' || t.box === '-'
  const state = d.kind === 'decide' ? 'pending decision' : 'pending'
  const role = d.kind === 'decide' ? `for ${d.handle} to decide` : `owned by ${d.handle}`
  const head = `✓ ${t.id} ${closed ? 'reopened as' : 'now'} ${state}, ${role}: ${t.title}`
  $.ui.toast([head, ...notes(r.out), ran(r.argv)].join('\n'), { timeoutMs: 8000 })
  await closeForm($)
}

// The Decided button: ticket-meta decided <ID> ([?] -> [ ], the [decide:] tag kept).
export async function runDecided($: EngineInterface, id: string) {
  const t = await findTicket($, id)
  const r = await runCall($, 'meta-decided', [id])
  if (r.code !== 0) {
    $.ui.toast([`✗ ticket-meta decided ${id} refused: ${r.err.trim() || r.out.trim() || 'exit ' + r.code}`, ran(r.argv)].join('\n'), { timeoutMs: 8000 })
    return
  }
  $.ui.toast([`✓ ${id} decided, now pending${t ? ': ' + t.title : ''}`, ...notes(r.out), ran(r.argv)].join('\n'), { timeoutMs: 8000 })
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
  $.ui.toast([`✓ ${h} added to .skillator/team.md`, ran(r.argv)].join('\n'), { timeoutMs: 8000 })
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
    $.ui.toast([`✗ ticket-meta team remove ${h} refused: ${r.err.trim() || r.out.trim() || 'exit ' + r.code}`, ran(r.argv)].join('\n'), { timeoutMs: 8000 })
    return
  }
  const said = notes(r.out).filter(l => !/^removed:/.test(l))
  $.ui.toast([`✓ ${h} removed from .skillator/team.md`, ...said, ran(r.argv)].join('\n'), { timeoutMs: 10000 })
}

// F80: ticket-meta decides who may (the lead hands over; none set, anyone sets the first).
export async function makeLead($: EngineInterface, h: string) {
  const r = await runCall($, 'meta-team-lead', [h])
  if (r.code !== 0) {
    $.ui.toast([`✗ ticket-meta team lead ${h} refused: ${r.err.trim() || r.out.trim() || 'exit ' + r.code}`, ran(r.argv)].join('\n'), { timeoutMs: 8000 })
    return
  }
  const said = notes(r.out).filter(l => !/^lead:/.test(l))
  $.ui.toast([`✓ ${h} is the lead`, ...said, ran(r.argv)].join('\n'), { timeoutMs: 10000 })
}

// --- drawing ---

// The form up in the ops-board pane, or null when none is (the pane draws its view).
// Cancel is a plain Button, not role="dismiss": a desktop would draw that as the
// whole pane's close control.
export async function renderForm($: EngineInterface, e: RenderInput<'Pane'>): Promise<RenderElement | null> {
  const p = await read($, personA)
  const d = await read($, assignA)
  if (!p && !d) return null
  const t = $.ui.resolve(e)
  const { Box, Text, Button } = t
  const Input = e.surface !== 'mobile' && 'Input' in t ? t.Input : null
  const cols = Math.max(20, e.props.bodyColumns)
  const focus = await read($, actionFocusA)
  const team = await read($, teamA)
  const label = (s: string) => <Text dimColor>{s}</Text>
  const heading = (s: string) => <Box key="form:title"><Text bold>{s}</Text><Text dimColor>{'  Esc cancels'}</Text></Box>

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
  const armed = !!focus && (['kind:implementation', 'kind:decision', 'who:+add', 'cancel', ...(tk && d.handle ? ['go'] : [])].includes(focus) || people.some(m => focus === 'who:' + m.handle))
  const from: State = tk?.box ?? ' '
  const to: State = d.kind === 'decide' ? '?' : ' '
  const set = (fn: (x: AssignDraft) => AssignDraft) => { void update($, assignA, x => (x ? fn({ ...x, result: null }) : x)) }
  const radio = (kind: AssignDraft['kind'], text: string) => (
    <Button key={kind === 'owner' ? 'kind:implementation' : 'kind:decision'} hotkey={armed ? kind === 'owner' ? 'a' : 'd' : undefined} plain onPress={() => set(x => ({ ...x, kind }))}>
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
  const verb = d.kind === 'decide' ? 'decide' : 'assign'
  // F77: the Ticket field - typed in any case; its line under it says what it resolves to.
  const typed = d.id.trim()
  const ticketField = Input
    ? <Input key="ticket" label="Ticket  " placeholder="F12" value={d.id}
        onInput={v => set(x => ({ ...x, id: v }))} onSubmit={v => set(x => ({ ...x, id: v }))} />
    : <Box key="ticket" flexDirection="row" flexWrap="wrap">{label('Ticket  ')}<Text>{typed || '(none - needs a keyboard surface)'}</Text></Box>
  const said = tk
    ? <Box key="title" flexDirection="row" flexWrap="wrap">
        <Text color={paint(tk.box)}>{'● ' + STATE_NAME[tk.box]}</Text>
        <Text dimColor wrap="truncate-end">{'  ' + cut(tk.title, Math.max(4, cols - STATE_NAME[tk.box].length - 4))}</Text>
      </Box>
    : <Box key="title">{typed ? <Text color="error">no such ticket</Text> : <Text dimColor>type a ticket ID, e.g. F12</Text>}</Box>
  const warn = tk?.box === '~'
    ? (tk.session
        ? `! ${tk.id} is in progress under ${tk.session} - this moves it to ${word(to)}; the tag stays - tell that session`
        : `! ${tk.id} is in progress - this moves it to ${word(to)}; tell whoever is working it`)
    : null
  const isGood = !!d.result?.startsWith('✓')
  return (
    <Box flexDirection="column">
      {heading(titleOf(d, tk))}
      <Text dimColor>Tab to actions; letters there</Text>
      {ticketField}
      {said}
      <Text> </Text>
      <Box key="for" flexDirection="row" flexWrap="wrap" gap={3}>{label('For')}{radio('owner', 'implementation')}{radio('decide', 'decision')}</Box>
      <Box key="who" flexDirection="row" flexWrap="wrap">
        {label('Who   ')}
        <Box flexDirection="column">
          {team.length === 0 && <Box key="noteam"><Text color="warning">no .skillator/team.md yet - add a person first</Text></Box>}
          {who}
          <Button key="who:+add" hotkey={armed ? 'n' : undefined} plain dimColor onPress={() => { void openAddPerson($, 'assign') }}>{'  + add person'}</Button>
        </Box>
      </Box>
      {tk && <Box key="change" flexDirection="row" flexWrap="wrap">
        <Text dimColor>Change  </Text>
        <Text color={paint(from)}>{'● ' + word(from)}</Text>
        <Text>{' -> '}</Text>
        <Text color={paint(to)}>{'● ' + word(to)}</Text>
        <Text>{`  ${d.kind === 'decide' ? 'decide' : 'owner'} ${d.handle ?? '(pick someone)'}`}</Text>
      </Box>}
      {warn && <Box key="warn"><Text color="warning" wrap="wrap">{warn}</Text></Box>}
      <Box key="runs" flexDirection="row" flexWrap="wrap">{label('Runs')}<Text>{`    ticket-meta ${verb} ${tk?.id ?? '<ID>'} ${d.handle ?? '@?'}`}</Text></Box>
      {d.result && <Box key="result"><Text color={isGood ? 'success' : 'error'} wrap="wrap">{d.result}</Text></Box>}
      <Text> </Text>
      <Box flexDirection="row" flexWrap="wrap" gap={4}>
        {tk && d.handle && <Button key="go" plain hotkey={armed ? 's' : undefined} variant="primary" onPress={() => { void confirm($) }}>Assign</Button>}
        <Button key="cancel" plain hotkey={armed ? 'c' : undefined} onPress={() => { void closeForm($) }}>Cancel</Button>
      </Box>
    </Box>
  )
}
