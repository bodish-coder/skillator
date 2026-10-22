import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'
import type { AssignDraft, Box as State, Member, PersonDraft, Ticket } from '../types'
import { STATE_NAME } from './lib/board'
export { isOpen } from './lib/board'
import { runCall } from './lib/host'
import { sameHandle } from './lib/team'
import type { Call } from './lib/host'
import { paint } from './paint'

// F47: the assign / decide dialog (pane `ops-assign`), the Decided button's call
// and the Add person form. Every write is a ticket-meta run; the mod writes no file.

export const DIALOG_ID = 'ops-assign'
const DIALOG = { focus: true, closeOnEscape: true, holdToasts: true, rows: 12 } as const

// B5: the host can leave a pane open but undrawn (a narrow terminal, a surface that
// places none) - say why, or the press does nothing the person can see.
async function openDialog($: EngineInterface, title: string) {
  const r = await $.ui.open({ id: DIALOG_ID, title, ...DIALOG })
  if (!r.isPlaced) $.ui.toast(`ops board: the ${title} dialog is not drawn: ${r.reason}`, { timeoutMs: 10000 })
}

// Each file names the atoms it reads or writes as its own consts (see pane.tsx).
const boardA = atom({ plugin: 'ops-board', key: 'board' } as const, null)
const teamA = atom({ plugin: 'ops-board', key: 'team' } as const, [])
const meA = atom({ plugin: 'ops-board', key: 'me' } as const, null)
const selectedA = atom({ plugin: 'ops-board', key: 'selected' } as const, null)
const assignA = atom({ plugin: 'ops-board', key: 'assign' } as const, null)
const personA = atom({ plugin: 'ops-board', key: 'person' } as const, null)

const HANDLE = /^@[a-z0-9_-]+$/

// A state in words for the Change line: `?` reads "decision" there.
const word = (b: State) => (b === '?' ? 'decision' : STATE_NAME[b])
const cut = (s: string, room: number) => (s.length <= room ? s : s.slice(0, Math.max(1, room - 1)) + '…')
const quote = (a: string) => (/[\s"]/.test(a) || a === '' ? '"' + a.replace(/"/g, '\\"') + '"' : a)
const ran = (argv: string[]) => 'ran: ' + argv.map(quote).join(' ')
// ticket-meta's output less the ticket line it echoes: warnings, "no change", the rest.
const notes = (out: string) => out.split(/\r?\n/).map(l => l.trimEnd()).filter(l => l && !/^\s*- \[/.test(l))

const titleOf = (d: AssignDraft) => (d.kind === 'decide' ? `Assign ${d.id} for a decision` : `Assign ${d.id}`)
async function findTicket($: EngineInterface, id: string): Promise<Ticket | null> {
  return (await read($, boardA))?.tickets.find(t => t.id === id) ?? null
}

// The handle a fresh dialog starts on: the ticket's own (owner or decider) when
// on the team, else me, else the first member - always as team.md writes it, since
// ticket-meta matches the handle exactly (the board's tags are read lower-cased).
function startHandle(t: Ticket, kind: AssignDraft['kind'], team: Member[], me: string | null): string | null {
  const on = (h: string | null) => team.find(m => sameHandle(m.handle, h))?.handle ?? null
  return on(kind === 'owner' ? t.owner : t.decide) ?? on(me) ?? team[0]?.handle ?? null
}

// `a` / `d`: the dialog on the row the pane shows selected (its model resolves
// a stale or hidden selection to the first row), else the stored selection.
export async function openAssign($: EngineInterface, kind: AssignDraft['kind'], shown: string | null) {
  const id = shown ?? (await read($, selectedA))
  const t = id ? await findTicket($, id) : null
  if (!t) { $.ui.toast('ops board: select a ticket first'); return }
  const draft: AssignDraft = { id: t.id, kind, handle: startHandle(t, kind, await read($, teamA), await read($, meA)), result: null }
  await update($, personA, () => null)
  await update($, assignA, () => draft)
  await openDialog($, titleOf(draft))
}

export async function closeDialog($: EngineInterface) {
  await clearDialog($)
  await $.ui.close({ id: DIALOG_ID })
}

export async function clearDialog($: EngineInterface) {
  await update($, assignA, () => null)
  await update($, personA, () => null)
}

// Assign: ticket-meta assign|decide <ID> @h. Done: a toast with what it said and
// the command that ran, the dialog closed. Refused: its stderr in the dialog.
async function confirm($: EngineInterface) {
  const d = await read($, assignA)
  if (!d || !d.handle) return
  const t = await findTicket($, d.id)
  const call: Call = d.kind === 'decide' ? 'meta-decide' : 'meta-assign'
  const r = await runCall($, call, [d.id, d.handle])
  if (r.code !== 0) {
    const why = (r.err.trim() || r.out.trim() || `ticket-meta exited ${r.code}`)
    await update($, assignA, x => (x ? { ...x, result: why } : x))
    return
  }
  const closed = !t || t.box === 'x' || t.box === '-'
  const state = d.kind === 'decide' ? 'pending decision' : 'pending'
  const role = d.kind === 'decide' ? `for ${d.handle} to decide` : `owned by ${d.handle}`
  const head = `✓ ${d.id} ${closed ? 'reopened as' : 'now'} ${state}, ${role}${t ? ': ' + t.title : ''}`
  $.ui.toast([head, ...notes(r.out), ran(r.argv)].join('\n'), { timeoutMs: 8000 })
  await closeDialog($)
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

// --- team: Add person (in this dialog) and remove (from the Team view) ---

export async function openAddPerson($: EngineInterface, back: PersonDraft['back']) {
  if (back === 'team') await update($, assignA, () => null)
  await update($, personA, () => ({ handle: '', name: '', emails: '', result: null, back }))
  await openDialog($, 'Add person')
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
    await update($, personA, () => null)
    await update($, assignA, () => next)
    await openDialog($, titleOf(next))
    return
  }
  await closeDialog($)
}

async function cancelPerson($: EngineInterface) {
  const p = await read($, personA)
  const d = await read($, assignA)
  if (p?.back === 'assign' && d) {
    await update($, personA, () => null)
    await openDialog($, titleOf(d))
    return
  }
  await closeDialog($)
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

// --- drawing ---

export async function renderDialog($: EngineInterface, e: RenderInput<'Pane'>): Promise<RenderElement> {
  const t = $.ui.resolve(e)
  const { Box, Text, Button } = t
  const Input = e.surface !== 'mobile' && 'Input' in t ? t.Input : null
  const cols = Math.max(20, e.props.bodyColumns)
  const p = await read($, personA)
  const d = await read($, assignA)
  const team = await read($, teamA)
  const label = (s: string) => <Text dimColor>{s}</Text>

  if (p) {
    const [who, name, emails] = addArgs(p) as [string, string, string]   // never `h`: the JSX factory
    const set = (k: 'handle' | 'name' | 'emails') => (v: string) => { void update($, personA, x => (x ? { ...x, [k]: v, result: null } : x)) }
    return (
      <Box flexDirection="column">
        {Input
          ? [
              <Input key="handle" label="Handle  " placeholder="@handle" value={p.handle} autoFocus onInput={set('handle')} onSubmit={set('handle')} />,
              <Input key="name" label="Name    " placeholder="Full Name" value={p.name} onInput={set('name')} onSubmit={set('name')} />,
              <Input key="emails" label="Emails  " placeholder="a@x, b@y" value={p.emails} onInput={set('emails')} onSubmit={set('emails')} />,
            ]
          : <Text dimColor>Adding a person needs a keyboard surface (terminal or desktop).</Text>}
        <Text> </Text>
        <Box key="writes" flexDirection="row">{label('Writes  ')}<Text>.skillator/team.md</Text>{label(' (committed later)')}</Box>
        <Box key="runs" flexDirection="row">{label('Runs')}<Text wrap="wrap">{`    ticket-meta team add ${who} ${quote(name)} ${emails}`}</Text></Box>
        {p.result && <Box key="result"><Text color="error" wrap="wrap">{p.result}</Text></Box>}
        <Text> </Text>
        <Box flexDirection="row" gap={4}>
          <Button key="add" variant="primary" onPress={() => { void addPerson($) }}>Add</Button>
          <Button key="cancel" role="dismiss" onPress={() => { void cancelPerson($) }}>Cancel</Button>
        </Box>
      </Box>
    )
  }

  if (!d) return <Box flexDirection="column"><Text dimColor>Nothing to assign - press a or d on a ticket.</Text></Box>
  const tk = await findTicket($, d.id)
  const from: State = tk?.box ?? ' '
  const to: State = d.kind === 'decide' ? '?' : ' '
  const set = (fn: (x: AssignDraft) => AssignDraft) => { void update($, assignA, x => (x ? fn({ ...x, result: null }) : x)) }
  const radio = (kind: AssignDraft['kind'], text: string) => (
    <Button key={kind === 'owner' ? 'kind:implementation' : 'kind:decision'} plain onPress={() => {
      set(x => ({ ...x, kind }))
      void openDialog($, titleOf({ ...d, kind }))
    }}>
      <Text color={d.kind === kind ? 'success' : undefined}>{d.kind === kind ? '(•)' : '( )'}</Text>{' ' + text}
    </Button>
  )
  const people = [...team]
  if (d.handle && !people.some(m => m.handle === d.handle)) people.push({ handle: d.handle, emails: [] })
  const who = people.map(m => {
    const isSel = m.handle === d.handle
    const body = `${isSel ? '› ' : '  '}${m.handle.padEnd(9)}${m.name ?? ''}`
    return (
      <Button key={'who:' + m.handle} plain onPress={() => set(x => ({ ...x, handle: m.handle }))}>
        {isSel ? <Text inverse>{body.padEnd(Math.max(body.length, 24))}</Text> : body}
      </Button>
    )
  })
  const verb = d.kind === 'decide' ? 'decide' : 'assign'
  const warn = tk?.box === '~'
    ? (tk.session
        ? `! ${tk.id} is in progress under ${tk.session} - this moves it to ${word(to)} and drops that tag`
        : `! ${tk.id} is in progress - this moves it to ${word(to)}; tell whoever is working it`)
    : null
  const isGood = !!d.result?.startsWith('✓')
  return (
    <Box flexDirection="column">
      <Box key="title"><Text dimColor wrap="truncate-end">{cut(tk?.title ?? d.id, cols)}</Text></Box>
      <Text> </Text>
      <Box key="for" flexDirection="row" gap={3}>{label('For')}{radio('owner', 'implementation')}{radio('decide', 'decision')}</Box>
      <Box key="who" flexDirection="row">
        {label('Who   ')}
        <Box flexDirection="column">
          {team.length === 0 && <Box key="noteam"><Text color="warning">no .skillator/team.md yet - add a person first</Text></Box>}
          {who}
          <Button key="who:+add" plain dimColor onPress={() => { void openAddPerson($, 'assign') }}>{'  + add person'}</Button>
        </Box>
      </Box>
      <Box key="change" flexDirection="row">
        <Text dimColor>Change  </Text>
        <Text color={paint(from)}>{'● ' + word(from)}</Text>
        <Text>{' -> '}</Text>
        <Text color={paint(to)}>{'● ' + word(to)}</Text>
        <Text>{`  ${d.kind === 'decide' ? 'decide' : 'owner'} ${d.handle ?? '(pick someone)'}`}</Text>
      </Box>
      {warn && <Box key="warn"><Text color="warning" wrap="wrap">{warn}</Text></Box>}
      <Box key="runs" flexDirection="row">{label('Runs')}<Text>{`    ticket-meta ${verb} ${d.id} ${d.handle ?? '@?'}`}</Text></Box>
      {d.result && <Box key="result"><Text color={isGood ? 'success' : 'error'} wrap="wrap">{d.result}</Text></Box>}
      <Text> </Text>
      <Box flexDirection="row" gap={4}>
        {d.handle && <Button key="go" variant="primary" onPress={() => { void confirm($) }}>Assign</Button>}
        <Button key="cancel" role="dismiss" onPress={() => { void closeDialog($) }}>Cancel</Button>
      </Box>
    </Box>
  )
}
