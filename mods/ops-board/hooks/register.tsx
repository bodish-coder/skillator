import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SiteScroll } from 'claude-code'
import type { Board, Machine, Member, Usage, Watch } from '../types'
import { listView, parseBoard } from './lib/board'
import { meOf, parseTeam } from './lib/team'
import { classify, levelLine, parseMachine, usageFrom } from './lib/facts'
import { gitBin, NO_SCRIPTS, readUsage, runCall } from './lib/host'
import { parseRuns } from './lib/runs'
import { HIDDEN, restoreClaudeMd, RESTORE_NOTE } from './lib/restore'
import { countsOf, renderBand, statusText } from './band'
import { buildModel, lineKey, offsetFor, PANE_ID, PANE_TITLE, readView, renderPane } from './pane'
import type { Tab } from './pane'
import { cancelPerson, clearForm, isFormUp } from './assign'
import { pollRuns, RUNS_POLL_MS } from './runstab'
import { AGENTS_POLL_MS, noteActivity, noteSpawn, noteTurnEnd, noteTurnStart, noteWorkflowCall, pollAgents } from './agentstab'
import { closeSetup, enterMessages, isSetupUp, pollInbox } from './messagestab'
import { arrowExplorer, enterExplorer, focusExplorer, isExplorerItem } from './explorertab'

// Wiring only (design §4): /ops, the 2 s TICKETS.md poll, team and me, the pane
// and its keys; the 60 s machine / relay / usage poll, the band, the watchdog hold on
// red, /ops resume, the status line and the CLAUDE.md restore (F48).

// The engine lists what a module reads and writes from consts of the file itself,
// so each file names its own atoms (same literal refs as pane.tsx).
const boardA = atom({ plugin: 'ops-board', key: 'board' } as const, null)
const teamA = atom({ plugin: 'ops-board', key: 'team' } as const, [])
const meA = atom({ plugin: 'ops-board', key: 'me' } as const, null)
const tabA = atom({ plugin: 'ops-board', key: 'tab' } as const, 'tickets')
const selectedA = atom({ plugin: 'ops-board', key: 'selected' } as const, null)
const narrowA = atom({ plugin: 'ops-board', key: 'narrow' } as const, false)
const machineA = atom({ plugin: 'ops-board', key: 'machine' } as const, null)
const usageA = atom({ plugin: 'ops-board', key: 'usage' } as const, null)
const watchA = atom({ plugin: 'ops-board', key: 'watch' } as const, { level: 'green', reasons: [] })
const notesA = atom({ plugin: 'ops-board', key: 'notes' } as const, [])
const relayA = atom({ plugin: 'ops-board', key: 'relay' } as const, null)

const MAX_READ = 4 * 1024 * 1024
const POLL_MS = 2000
const SLOW_MS = 60_000                 // machine facts, relay, usage
const norm = (p: string) => p.replace(/\\/g, '/').replace(/(.)\/+$/, '$1')

// Module state is per load: a hot reload starts a fresh module, so it re-arms.
let armed = false
let email: string | null = null
let teamSeen = ''
let lastScroll: SiteScroll = { offset: 0, bodyRows: 0 }
let lastCols = 54
let lastStatus: string | null = null
let lockSig = ''
let scriptsNoted = false
let decidedLine: string | null = null      // the level line relay-morpheus last decided on
let holdOutcome: string | null = null      // while red: '' held, else why the hold failed; null = not red

async function setBoard($: EngineInterface, next: Board) {
  const cur = await read($, boardA)
  if (cur && cur.path === next.path && cur.error === next.error && cur.mtimeMs === next.mtimeMs && cur.size === next.size) return
  await update($, boardA, () => next)
}

const failed = (path: string, error: string): Board => ({ path, mtimeMs: 0, size: 0, tickets: [], error })
const TOO_BIG = 'TICKETS.md is over 4 MiB - not read; /archive-tickets moves the closed rows out'
const notLoaded = (e: unknown) =>
  `TICKETS.md not loaded: ${String((e as Error)?.message ?? e)} - /archive-tickets moves the closed rows out`

// The board at path. Only a stat that fails is "no TICKETS.md"; a read the engine
// refuses or a parse that throws names its error (a big board read as missing, before).
async function loadBoard($: EngineInterface, path: string, st: { mtimeMs: number; size: number }): Promise<Board> {
  if (st.size > MAX_READ) return failed(path, TOO_BIG)
  try { return parseBoard(await $.fs.read(path), path, st.mtimeMs, st.size) } catch (e) { return failed(path, notLoaded(e)) }
}

// B4: the pane holds the board in one $.state value, which the host caps at 4194304
// characters of JSON. Title and line both carry a ticket's text, so a 3.8 MB board of
// long lines came to 7.7 M and never loaded. The pane draws a title on one row and a
// line wrapped under it, so it keeps the head of each; /list-tickets reads the file whole.
const TITLE_MAX = 200
const LINE_MAX = 2000
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const held = (b: Board): Board => (b.error ? b
  : { ...b, tickets: b.tickets.map(t => ({ ...t, title: clip(t.title, TITLE_MAX), line: clip(t.line, LINE_MAX) })) })

// One poll: TICKETS.md re-read when its mtime or size moved; team.md likewise.
async function poll($: EngineInterface) {
  const repo = await $.session.repo()
  if (!repo) return setBoard($, failed('', 'not a git repo - no TICKETS.md board here'))
  const root = norm(repo.root)
  const path = root + '/TICKETS.md'
  let st: { mtimeMs: number; size: number } | null = null
  try { st = await $.fs.stat(path) } catch { /* no board */ }
  if (!st) await setBoard($, failed(path, `no TICKETS.md at ${root}`))
  else {
    const cur = await read($, boardA)
    if (!cur || cur.error || cur.path !== path || cur.mtimeMs !== st.mtimeMs || cur.size !== st.size) {
      // the engine can refuse to hold the parsed board too - say so, not "missing"
      try { await setBoard($, held(await loadBoard($, path, st))) } catch (e) { await setBoard($, failed(path, notLoaded(e))) }
    }
  }
  const teamPath = root + '/.skillator/team.md'
  let seen = 'none'
  try { const st = await $.fs.stat(teamPath); seen = `${st.mtimeMs}:${st.size}` } catch { /* no team file */ }
  if (seen !== teamSeen) {
    teamSeen = seen
    let t: Member[] = []
    if (seen !== 'none') { try { t = parseTeam(await $.fs.read(teamPath)) } catch { t = [] } }
    await update($, teamA, () => t)
    await update($, meA, () => (email ? meOf(t, email) : null))
  }
  await pollInbox($).catch(() => {})       // F66: the Teams inbox, re-read when it moved
  await updateStatus($)
}

// ---- F48: machine facts, the watchdog, relay, usage, status line, notes ----

async function addNotes($: EngineInterface, add: string[], drop: (n: string) => boolean = () => false) {
  await update($, notesA, xs => [...xs.filter(n => !drop(n)), ...add.filter(n => !xs.includes(n) || drop(n))])
}

// The status line: `ops <n> open · 7d <pct>`, set only when its text changes.
async function updateStatus($: EngineInterface) {
  const board = await read($, boardA)
  if (!board) return
  const text = statusText(countsOf(board)?.open ?? null, await read($, usageA), await $.clock.now())
  if (text === lastStatus) return
  lastStatus = text
  $.ui.status(text)
}

function redFix(w: Watch): string {
  const disk = w.reasons.some(r => r.startsWith('disk')), mem = w.reasons.some(r => r.startsWith('mem'))
  return disk && mem ? 'Free disk space and memory' : mem ? 'Free memory' : 'Free space'
}
const isLockNote = (n: string) => /^▲ \d+ stale locks?, not deleted:/.test(n)
const isHiddenNote = (n: string) => n.startsWith('▲ ') && n.includes(HIDDEN)

function lockNote(m: Machine): string {
  const w = Math.max(30, ...m.locks.map(l => l.path.length + 2))
  const n = m.locks.length
  return [`▲ ${n} stale lock${n === 1 ? '' : 's'}, not deleted:`,
    ...m.locks.map(l => `    ${l.path.padEnd(w)}${`${l.ageMin} min`.padEnd(9)}${l.holder}`.trimEnd()),
    '  remove them yourself, or ask Claude to check and clear them'].join('\n')
}

// New facts: classify; while red, every reading checks the hold (its HOLD fact) and,
// when it is not set, holds through relay-morpheus - so a failed hold is tried again
// and a release from outside is held again. A toast says why and how to clear it only
// when the outcome changes. Stale locks are listed in a note, never deleted.
async function applyMachine($: EngineInterface, m: Machine) {
  const w = classify(m)
  await update($, machineA, () => m)
  await update($, watchA, () => w)
  if (w.level !== 'red') holdOutcome = null
  else if (m.hold === null) {
    const r = await runCall($, 'relay-hold', [w.reasons.join('; ')])
    const ran = r.argv.length ? `\nran: ${r.argv.join(' ')}` : ''
    const why = r.code === 0 ? '' : r.err.trim() || r.out.trim() || `exit ${r.code}`
    if (why !== holdOutcome) {
      if (!why) {
        $.ui.toast(`■ HOLD - ${w.reasons.join('. ')}. New relay stages and GREEN runs are held. ${redFix(w)}, then /ops resume.${ran}`)
      } else {
        $.ui.toast(`■ ${w.reasons.join('. ')} - the watchdog hold could not be set: ${why}${ran}`)
        await addNotes($, [`■ watchdog hold not set: ${why}${ran.replace('\n', ' - ')}`])
      }
    }
    holdOutcome = why
  } else if (holdOutcome === null) holdOutcome = ''          // red and already held: nothing to do
  const sig = m.locks.map(l => l.path).sort().join('|')
  if (sig !== lockSig) {
    lockSig = sig
    await addNotes($, m.locks.length ? [lockNote(m)] : [], isLockNote)
  }
}

async function pollMachine($: EngineInterface) {
  const r = await runCall($, 'pending-machine', [])
  if (r.code === 0 && r.out.trim()) return applyMachine($, parseMachine(r.out, await $.clock.now()))
  // Failed: the last facts stay (the band shows their age).
  if (r.err === NO_SCRIPTS && !scriptsNoted) {
    scriptsNoted = true
    await addNotes($, [`▲ ${NO_SCRIPTS} - no disk, memory or lock facts`])
  }
}

// relay: the first run of `relay-morpheus list` not all done, "RUN-0012 2/4". On the
// Runs tab its own 30 s poll lists relay and sets this too: one relay list per cycle.
async function pollRelay($: EngineInterface) {
  if ((await read($, tabA)) === 'runs') return
  const r = await runCall($, 'relay-list', [])
  if (r.code !== 0) return
  const run = parseRuns(r.out, {}).find(x => x.done < x.total)
  const text = run ? `${run.id} ${run.done}/${run.total}` : null
  if (text !== await read($, relayA)) await update($, relayA, () => text)
}

// A reading with no window keeps the last one's: it then shows its age, never as live.
async function setUsage($: EngineInterface, u: Usage) {
  await update($, usageA, prev => ({
    ...u,
    five: u.five ?? prev?.five ?? null,
    seven: u.seven ?? prev?.seven ?? null,
    decision: prev?.decision ?? null,
  }))
  await updateStatus($)
  await decide($).catch(() => {})
}

// F49: the hold decision is relay-morpheus's own (`chain decide --level`), on this
// session's line - stale figures left out, never empty. Asked again only when the line
// changes (a new figure, or one going stale); a failed ask leaves the decision unknown.
async function decide($: EngineInterface) {
  const u = await read($, usageA)
  if (!u) return
  const line = levelLine(u, await $.clock.now())
  if (line === decidedLine) return
  decidedLine = line
  const r = await runCall($, 'relay-decide', [line])
  const word = r.code === 0
    ? r.out.split('\n').map(s => s.trim()).find(s => /^(RELEASE|HOLD) \S+( 7d)?$|^UNOBSERVABLE$/.test(s)) ?? null
    : null
  if (!word) decidedLine = null
  await update($, usageA, cur => (cur ? { ...cur, decision: word } : cur))
}

async function pollUsage($: EngineInterface) {
  let u: Usage
  try { u = await readUsage($, await $.clock.now()) } catch { return }
  await setUsage($, u)
}

async function slowPoll($: EngineInterface) {
  await pollMachine($).catch(() => {})
  await pollRelay($).catch(() => {})
  await pollUsage($).catch(() => {})
}

// /ops resume: re-read the facts; only a fresh reading that is not red releases (a
// failed or empty reading refuses - an earlier poll's facts never release a hold);
// relay-morpheus releases it, and the answer shows what it said and the command that ran.
async function resume($: EngineInterface): Promise<string> {
  const r = await runCall($, 'pending-machine', [])
  if (r.code !== 0 || !r.out.trim()) return 'could not read the machine facts - not released'
  const m = parseMachine(r.out, await $.clock.now())
  await applyMachine($, m)
  const w = classify(m)
  if (w.level === 'red') return `still red: ${w.reasons.join('; ')} - not released`
  const rel = await runCall($, 'relay-release', [])
  if (!rel.argv.length) return rel.err || NO_SCRIPTS
  const said = rel.out.trim() || rel.err.trim()
  const ran = `ran: ${rel.argv.join(' ')}`
  if (rel.code !== 0) return `release failed (exit ${rel.code}): ${said || 'no output'}\n${ran}`
  const freed: Machine = { ...m, hold: null }
  await update($, machineA, () => freed)
  await update($, watchA, () => classify(freed))
  return `${said}\n${ran}`
}

// At start: a hidden CLAUDE.md is reported (never moved: a GREEN may be running), and
// what the last session's end restored is shown once.
async function startNotes($: EngineInterface) {
  const add: string[] = []
  try {
    const kept = await $.store.get(RESTORE_NOTE)
    if (Array.isArray(kept)) add.push(...kept.filter((x): x is string => typeof x === 'string'))
    if (kept !== undefined) await $.store.delete(RESTORE_NOTE)
  } catch { /* no store: nothing kept */ }
  try { add.push(...await restoreClaudeMd($, 'report')) } catch { /* reported next start */ }
  await addNotes($, add, isHiddenNote)
}

async function loadEmail($: EngineInterface) {
  const repo = await $.session.repo()
  try {
    const git = await gitBin($)                    // A150: absolute on Windows; none: no email
    if (!git) { email = null; return }
    const r = await $.process.run([git, 'config', 'user.email'], repo ? { cwd: repo.root, timeoutMs: 10000 } : { timeoutMs: 10000 })
    email = r.exitCode === 0 ? r.stdout.trim().toLowerCase() || null : null
  } catch { email = null }
}

// Arms the poll once per load: from session.start, or from the first draw or
// command when the module was reloaded mid-session (session.start does not re-fire).
async function arm($: EngineInterface) {
  if (armed) return
  armed = true
  await loadEmail($)
  await poll($)
  $.clock.every(POLL_MS, () => { void poll($).catch(() => {}) })
  await slowPoll($)
  $.clock.every(SLOW_MS, () => { void slowPoll($).catch(() => {}) })
  // F50: the Runs tab re-reads relay every 30 s while it is the tab shown.
  $.clock.every(RUNS_POLL_MS, () => {
    void (async () => { if ((await read($, tabA)) === 'runs') await pollRuns($) })().catch(() => {})
  })
  // F53: the Agents tab re-reads $.agent.list() every 5 s while it is the tab shown.
  $.clock.every(AGENTS_POLL_MS, () => {
    void (async () => { if ((await read($, tabA)) === 'agents') await pollAgents($) })().catch(() => {})
  })
}

// closeOnEscape is set anew by every ui.open: while a form is up it stays, so Esc is
// still the form's Cancel after a re-open.
async function openPane($: EngineInterface, asked: boolean) {
  const esc = (await isFormUp($)) ? { closeOnEscape: true as const } : {}
  const r = await $.ui.open(asked ? { id: PANE_ID, title: PANE_TITLE, focus: true, ...esc } : { id: PANE_ID, title: PANE_TITLE, ...esc })
  await update($, narrowA, () => !r.isPlaced)
  return r
}

const TAB_NAME: Record<Tab, string> = { tickets: 'Tickets', runs: 'Runs', health: 'Health', messages: 'Messages', agents: 'Agents', workflows: 'Workflows', explorer: 'Explorer' }
const TABS: Tab[] = ['tickets', 'runs', 'health', 'messages', 'agents', 'workflows', 'explorer']
const USAGE = 'usage: /ops [tickets|runs|health|messages|agents|workflows|explorer|resume]'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'ops',
      description: 'Open the ops board pane: the TICKETS.md board, runs, health, Teams messages, agents, workflows and the explorer',
      argumentHint: '[tickets|runs|health|messages|agents|workflows|explorer|resume]',
    })
    await $.command.register({
      name: 'list-tickets',
      description: 'List the TICKETS.md board (tickets-zordon text format), no model turn',
      argumentHint: '[status] [app:<a>] [@person] [prefix|ID] [all]',
    })
    await $.command.register({
      name: 'pending',
      description: 'What is pending: board counts, runs, sessions, machine (pending script), no model turn',
    })
    void startNotes($).catch(() => {})
    void arm($).catch(() => {})
    void openPane($, false).catch(() => {})
    return next(e)
  })

  // F50: /list-tickets and /pending answer on their own - { text }, no next, no model turn.
  on('command.run', { command: 'list-tickets' }, async ($, e) => {
    const repo = await $.session.repo()
    if (!repo) return { text: 'not a git repo - no TICKETS.md board here' }
    const path = norm(repo.root) + '/TICKETS.md'
    let st: { mtimeMs: number; size: number }
    try { st = await $.fs.stat(path) } catch { return { text: `no TICKETS.md at ${norm(repo.root)}` } }
    const board = await loadBoard($, path, st)
    return { text: board.error ?? listView(board, e.args) }
  })

  on('command.run', { command: 'pending' }, async ($) => {
    const r = await runCall($, 'pending', [])
    if (!r.argv.length) return { text: r.err || NO_SCRIPTS }
    if (r.code === 0) return { text: r.out }
    const why = r.err.trim() || r.out.trim() || `exit ${r.code}`
    return { text: `pending failed (exit ${r.code}): ${why}\nran: ${r.argv.join(' ')}` }
  })

  on('command.run', { command: 'ops' }, async ($, e) => {
    void arm($).catch(() => {})
    const word = e.args.trim().toLowerCase()
    if (word === 'resume') return { text: await resume($) }
    if (word && !TABS.includes(word as Tab)) return { text: USAGE }
    // A form draws only on Tickets: leaving it drops the form, or a later Esc / close
    // on that tab would be taken as the hidden form's Cancel.
    if (word && word !== 'tickets') await clearForm($)
    if (word) await update($, tabA, () => word as Tab)
    if (word === 'runs') void pollRuns($).catch(() => {})
    if (word === 'agents') void pollAgents($).catch(() => {})
    if (word === 'messages') void enterMessages($).catch(() => {})
    if (word === 'explorer') void enterExplorer($).catch(() => {})
    const r = await openPane($, true)
    if (!r.isPlaced) return { text: `ops board is open but not drawn: ${r.reason}` }
    return { text: word ? `ops board opened on ${TAB_NAME[word as Tab]}.` : 'ops board opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: 'ops-board' }, async ($, e) => {
    if (!armed) $.clock.after(0, () => { void arm($).catch(() => {}) })
    lastScroll = e.props.scroll
    lastCols = Math.max(20, e.props.bodyColumns)
    return renderPane($, e)
  })

  // F48: the band above the prompt, always drawn (green when fine); a survey has it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    if (!armed) $.clock.after(0, () => { void arm($).catch(() => {}) })
    return renderBand($, e)
  })

  on('session.measure', async ($, e, next) => {
    const now = await $.clock.now()
    if (e.rateLimits.length) await setUsage($, usageFrom(e.rateLimits, e.cost?.usd ?? null, now)).catch(() => {})
    else await pollUsage($).catch(() => {})
    return next(e)
  })

  // Session end: a CLAUDE.md the baseline harness left hidden goes back, said in the
  // log and kept for the next session's band.
  on('session.end', async ($, e, next) => {
    try {
      const lines = await restoreClaudeMd($, 'restore', next.budget.remainingMs - 500)
      for (const l of lines) $.ui.log(l)
      if (lines.length) await addNotes($, lines, isHiddenNote)
    } catch { /* the next start reports it */ }
    return next(e)
  })

  // F53: the Agents and Workflows tabs read the engine's own events; each passes its
  // event through as it came (the spawn, the turn, the tool call untouched).
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    await noteSpawn($, e, r).catch(() => {})
    return r
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) await noteTurnStart($, e.agentId).catch(() => {})
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) await noteTurnEnd($, e.agentId, e.reason).catch(() => {})
    return next(e)
  }).catch(($, e, next) => next(e))

  // Every tool call in an agent's loop stamps its last activity, unawaited so no tool
  // waits on it; the Workflow tool's answer names its run.
  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) void noteActivity($, e.agentId).catch(() => {})
    if (e.tool !== 'Workflow') return next(e)
    const r = await next(e)
    await noteWorkflowCall($, e.tool_use_id, r).catch(() => {})
    return r
  }).catch(($, e, next) => next(e))

  // B5: while an assign / add person form is up in the board, Esc (the form opens
  // the pane closeOnEscape) or the close mark is its Cancel: the form goes, the
  // view it came from is back, the board stays open. An unload passes, form cleared.
  on('ui.close', async ($, e, next) => {
    // F66: the Teams setup form up - Esc is its Cancel (an unload just drops it)
    if (e.id === PANE_ID && (await isSetupUp($))) {
      await closeSetup($)
      if (e.origin.kind === 'unload') return next(e)
      return { value: undefined }
    }
    if (e.id !== PANE_ID || !(await isFormUp($))) return next(e)
    if (e.origin.kind === 'unload') { await clearForm($); return next(e) }
    await cancelPerson($)                                   // what the form's Cancel does
    return { value: undefined }
  }).catch(($, e, next) => next(e))

  // Up/down: the arrows on a focused pane arrive as scrolls with no pointer. One
  // row moves the selection instead of the window; the window follows only when
  // the selection would leave it. Wheel ticks and page keys scroll as ever.
  // F61: the selection walks the group headers and the rows of open groups, and the
  // focus ring follows it, so Enter opens or closes the header shown selected.
  on('ui.scroll', { requestId: 'ops-board' }, async ($, e, next) => {
    if (e.pointer || e.origin.kind !== 'person' || Math.abs(e.by) !== 1) return next(e)
    if ((await read($, tabA)) === 'explorer') {           // F75: the Explorer's own items
      const o = await arrowExplorer($, e.by, lastScroll.offset, e.bodyRows, lastCols)
      return o === undefined ? next(e) : o === null || e.contentRows <= e.bodyRows ? {} : next({ ...e, offset: o })
    }
    if ((await read($, tabA)) !== 'tickets' || (await isFormUp($))) return next(e)   // a form scrolls as itself
    const m = buildModel(await readView($, lastCols))
    const at = m.selected === null ? -1 : m.items.indexOf(m.selected)
    const to = m.items[at + e.by]
    if (at < 0 || !to) return next(e)
    await update($, selectedA, () => to)
    void $.ui.focus({ requestId: PANE_ID, key: lineKey(to) }).catch(() => {})   // a site not holding the keys: no ring to move
    if (e.contentRows <= e.bodyRows) return {}
    const offset = offsetFor(m, to, lastScroll.offset, e.bodyRows)
    return offset === null ? {} : next({ ...e, offset })
  }).catch(($, e, next) => next(e))   // failing, the arrow scrolls as the engine would

  // Tab and shift-Tab walk the row and header buttons: the ring landing on one selects it.
  on('ui.focus', { requestId: 'ops-board' }, async ($, e, next) => {
    const el = e.element
    if (el?.startsWith('row:')) await update($, selectedA, () => el.slice(4))
    else if (el?.startsWith('head:')) await update($, selectedA, () => el)
    else if (el && isExplorerItem(el)) await focusExplorer($, el)          // F75
    return next(e)
  }).catch(($, e, next) => next(e))
}
