import { atom, read, update } from 'claude-code'
import type { BoxProps, ButtonProps, ElementConstructor, EngineInterface, ProcessRunResult, RenderElement, TextProps } from 'claude-code'
import type { Board, Diagnose, Engage, RunView, Stage } from '../types'
import type { AgentsView } from './agentstab'
import { gitBin, runCall } from './lib/host'
import { parseBoard } from './lib/board'
import { norm } from './lib/calls'
import { parseRuns, scriptPathOf } from './lib/runs'
import { continuePrompt, engageOf, finishedLine, isFinished, runLines, stageTickets as ticketsOf } from './lib/runlines'
import type { RunLine } from './lib/runlines'
import { treeLines } from './lib/agents'
import { diagnose } from './lib/diagnose'
import type { ShaState } from './lib/diagnose'
export { continuePrompt, runLines, waves } from './lib/runlines'

// F50, design §8: the Runs tab (mock m-plan). relay-morpheus list, then resume (F85: the
// run file whole) for each run not all done; a planned run shows its stage table, what runs
// in parallel and its parked decisions. F85: a run's mode, its script's phases (the
// .workflow.js beside the run file, read as data, never run) and, under it, the Workflow
// runs and agents serving its stages. Engage asks first, in this pane (B5), then submits
// /skillator:marathon-run (a script) or queues the run and submits its continue prompt.
// Ticket state is a coloured dot from the board, never a bracket code.

const runsA = atom({ plugin: 'ops-board', key: 'runs' } as const, [])
const relayA = atom({ plugin: 'ops-board', key: 'relay' } as const, null)
const boardA = atom({ plugin: 'ops-board', key: 'board' } as const, null)
const engageA = atom({ plugin: 'ops-board', key: 'engage' } as const, null)
const diagnoseA = atom({ plugin: 'ops-board', key: 'diagnose' } as const, null)   // F99
const tabA = atom({ plugin: 'ops-board', key: 'tab' } as const, 'tickets')

const PANE = 'ops-board'          // pane.tsx's PANE_ID (it imports this file)
const PANE_NAME = 'ops board'     // pane.tsx's PANE_TITLE

export const RUNS_POLL_MS = 30_000
const CHAIN_STATUS_AT_ONCE = 2
let polling = false

// One read of relay: the list, then each open run's file and its script. A failed list keeps what was shown.
export async function pollRuns($: EngineInterface): Promise<void> {
  if (polling) return
  polling = true
  try {
    const r = await runCall($, 'relay-list', [])
    if (r.code !== 0) return
    const chains: Record<string, string> = {}
    const scripts: Record<string, string> = {}
    const root = (await $.session.repo())?.root ?? ''
    const open = parseRuns(r.out, {}).filter(x => x.done < x.total)
    // The open runs' resume calls overlap, at most CHAIN_STATUS_AT_ONCE at a time.
    let next = 0
    const worker = async () => {
      while (next < open.length) {
        const run = open[next++]!
        const c = await runCall($, 'relay-resume', [run.id])
        if (c.code !== 0) continue
        chains[run.id] = c.out
        const js = scriptPathOf(c.out, root)
        if (js) { try { scripts[run.id] = await $.fs.read(js) } catch { /* no script: an agents run */ } }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CHAIN_STATUS_AT_ONCE, open.length) }, worker))
    const runs = parseRuns(r.out, chains, scripts)
    await update($, runsA, () => runs)
    const first = runs.find(x => x.done < x.total)
    const text = first ? `${first.id} ${first.done}/${first.total}` : null
    if (text !== await read($, relayA)) await update($, relayA, () => text)
  } finally {
    polling = false
  }
}

// F85: the confirm is up while the Workflows tab is the one shown (as the Run tab's form); F99: the Diagnose view likewise
export async function isEngageUp($: EngineInterface): Promise<boolean> {
  return (await read($, tabA)) === 'runs' && ((await read($, engageA)) !== null || (await read($, diagnoseA)) !== null)
}
// /ops to another tab and an unload: the confirm just goes.
export async function dropEngage($: EngineInterface) {
  if ((await read($, engageA)) !== null) await update($, engageA, () => null)
  if ((await read($, diagnoseA)) !== null) await update($, diagnoseA, () => null)   // F99
}
// Cancel, Esc and done: the tab back, Esc the pane's own again.
export async function closeEngage($: EngineInterface) {
  const up = (await read($, engageA)) !== null || (await read($, diagnoseA)) !== null   // F99: the Diagnose view too
  if (!up) return
  await update($, engageA, () => null)
  await update($, diagnoseA, () => null)
  await $.ui.open({ id: PANE, title: PANE_NAME })
}

// Engage: refused at once (a toast naming the driver) while another driver is live, else
// the confirm, Esc its Cancel.
export async function openEngage($: EngineInterface, id: string): Promise<void> {
  const run = (await read($, runsA)).find(r => r.id === id)
  if (!run) return
  const e = engageOf(run, await $.clock.now())
  if ('refused' in e) { $.ui.toast(e.refused); return }
  await update($, engageA, () => ({ id, ...e }))
  await $.ui.open({ id: PANE, title: PANE_NAME, closeOnEscape: true })
  void $.ui.focus({ requestId: PANE, key: 'engage:go' }).catch(() => {})
}

// Engage confirmed: checked again (a driver may have come since), then submitted - a run
// with no script after relay-morpheus queue-run add, said with what relay said and what ran.
export async function engageGo($: EngineInterface): Promise<void> {
  const g = await read($, engageA)
  await closeEngage($)
  if (!g) return
  const run = (await read($, runsA)).find(r => r.id === g.id)
  const e = run ? engageOf(run, await $.clock.now()) : { refused: `■ ${g.id} is no longer an open run` }
  if ('refused' in e) { $.ui.toast(e.refused); return }
  if (!e.queue) {
    // a slash command is run as one, never submitted as a prompt (the host refuses that)
    const [command, ...args] = e.text.slice(1).split(' ')
    $.ui.toast(`✓ ${g.id} engaged: ${e.text}`)
    void $.command.run({ command: command!, args: args.join(' ') })
      .catch(err => { $.ui.toast(`■ ${g.id} not engaged: ${e.text} - ${err instanceof Error ? err.message : String(err)}`) })
    return
  }
  const r = await runCall($, 'relay-queue-add', [g.id])
  const ran = r.argv.length ? `\nran: ${r.argv.join(' ')}` : ''
  const said = r.out.trim() || r.err.trim()
  if (r.code !== 0) {
    $.ui.toast(`■ ${g.id} not queued: ${r.err.trim() || r.out.trim() || `exit ${r.code}`}${ran}`)
    return
  }
  $.ui.toast(`✓ ${g.id} queued${said ? ` - ${said}` : ''}. Its continue prompt runs as the next turn.${ran}`)
  void $.prompt.submit({ text: continuePrompt(g.id) })
  void pollRuns($).catch(() => {})
}

const IS_SHA = /^[0-9a-f]{4,40}$/i
type Ask = (args: string[]) => Promise<ProcessRunResult | null>

// F99: git asked read-only in the repo root; null once it cannot be asked, why() saying why.
async function gitAsker($: EngineInterface): Promise<{ ask: Ask; why: () => string }> {
  const repo = await $.session.repo()
  const git = repo ? await gitBin($) : null
  let gitWhy = ''
  const ask: Ask = async args => {
    if (!gitWhy && !repo) gitWhy = 'not in a git repo'
    if (!gitWhy && !git) gitWhy = 'no git found on PATH'
    if (gitWhy) return null
    try { return await $.process.run([git!, ...args], { cwd: repo!.root, timeoutMs: 10000 }) } catch (e) {
      gitWhy = `git ${args[0]}: ${e instanceof Error ? e.message : String(e)}`
      return null
    }
  }
  return { ask, why: () => gitWhy }
}

// F99: the run read fresh (list and resume, read-only), every landed sha asked of git (on HEAD /
// elsewhere / unknown), the board and the driver stamp; diagnose() judges.
async function readDiagnosis($: EngineInterface, id: string, fresh = false) {
  const l = await runCall($, 'relay-list', [])
  const c = l.code === 0 ? await runCall($, 'relay-resume', [id]) : l
  const run = c.code === 0 ? parseRuns(l.out, { [id]: c.out }).find(r => r.id === id) : undefined
  if (!run) return { refused: c.code === 0 ? 'not in relay-morpheus list' : c.err.trim() || c.out.trim() || `exit ${c.code}` }
  // fresh (Close's re-check): TICKETS.md read now, never the board as last polled
  let board = await read($, boardA)
  if (fresh) {
    const root = (await $.session.repo())?.root
    if (!root) return { refused: 'not in a git repo - no TICKETS.md to check' }
    const path = norm(root) + '/TICKETS.md'
    try { board = parseBoard(await $.fs.read(path), path, 0, 0) } catch (e) { return { refused: `TICKETS.md not read: ${e instanceof Error ? e.message : String(e)}` } }
  }
  const g = await gitAsker($)
  const shas = new Map<string, ShaState>()
  for (const s of run.stages) {
    // a sha only: relay also takes a path, and a > row's cell names a stage - neither is git's
    if (!s.landed || shas.has(s.landed) || !IS_SHA.test(s.landed)) continue
    const r = await g.ask(['merge-base', '--is-ancestor', s.landed, 'HEAD'])
    if (r) shas.set(s.landed, r.exitCode === 0 ? 'head' : r.exitCode === 1 ? 'off' : 'none')
  }
  const d = diagnose(run, board, shas, await $.clock.now())
  return { l, resume: c.out, run, shas, d, g }
}

// F104: the sha Close lands for stage s - its landed cell when HEAD has it, else the newest commit
// on the run branch's own range (fork point..branch) naming one of its tickets, when HEAD has it.
// A git exit other than 0/1 (or git not askable) is `unchecked`, never a missing commit.
type ShaFor = { sha: string; why: string } | { none: string } | { unchecked: string }
async function shaFor(s: Stage, resume: string, g: { ask: Ask; why: () => string }): Promise<ShaFor> {
  const git = async (args: string[], judged = [0, 1]) => {
    const r = await g.ask(args)
    if (!r) throw g.why()
    if (!judged.includes(r.exitCode)) throw `git ${args[0]} exit ${r.exitCode}`
    return r
  }
  const onHead = async (sha: string) => (await git(['merge-base', '--is-ancestor', sha, 'HEAD'])).exitCode === 0
  try {
    if (s.landed && IS_SHA.test(s.landed) && await onHead(s.landed)) return { sha: s.landed, why: 'landed cell on HEAD' }
    const branch = /^branch: (\S+)$/m.exec(resume)?.[1]
    if (!branch) return { none: 'no run branch in the run file and no landed sha on HEAD' }
    if (branch.startsWith('-')) return { none: `run branch "${branch}" starts with - - not asked of git` }
    if ((await git(['rev-parse', '--verify', '--quiet', branch])).exitCode) return { none: `${branch} is gone (landed and removed?) and no landed sha on HEAD` }
    // the fork point: the branch's own oldest reflog entry (where it was created) - after a merge into
    // HEAD, merge-base (even --fork-point) answers the branch tip, an empty range
    const ref = 'refs/heads/' + branch
    let fork = (await git(['reflog', 'exists', ref])).exitCode ? ''
      : (await git(['rev-list', '--walk-reflogs', ref], [0])).stdout.trim().split('\n').at(-1) ?? ''
    if (!fork) {
      let base = await git(['merge-base', '--fork-point', 'HEAD', branch])
      if (base.exitCode) base = await git(['merge-base', 'HEAD', branch])
      if (base.exitCode) return { none: `${branch} shares no commit with HEAD` }
      fork = base.stdout.trim()
    }
    const ids = ticketsOf(s)
    // the subject leads with the id: never a stage merge or a "board: testing F1" naming it
    const words = ids.map(id => new RegExp('^\\s*' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9])', 'i'))
    // HEAD's own line since the fork is never the run's: a fork before the run, main merged into it
    const mainline = new Set((await git(['rev-list', '--first-parent', `${fork}..HEAD`], [0])).stdout.split('\n'))
    const hit = (await git(['log', '--no-merges', '--format=%H%x1f%s', `${fork}..${branch}`], [0])).stdout.split('\n')
      .map(l => l.split('\x1f')).find(([h, subj]) => h && !mainline.has(h) && words.some(w => w.test(subj ?? '')))
    if (!hit) return { none: `no commit for ${ids.join(' ')} between ${fork.slice(0, 7)}..${branch}` }
    const [sha, subj] = [hit[0]!, hit[1] ?? '']
    const said = `${sha.slice(0, 7)} "${subj}"`
    if (!await onHead(sha)) return { none: `${said} is on ${branch} but not on HEAD - land the run first` }
    return { sha, why: `${said} on ${branch}` }
  } catch (e) {
    return { unchecked: String(e) }
  }
}

// runnable as copied: the script and platform form runCall used for the list; no owner, so the cell is kept
const closeLine = (script: string, id: string, n: number, sha: string) => script.endsWith('.ps1')
  ? `powershell -NoProfile -ExecutionPolicy Bypass -File "${script}" -Mode stage -Id ${id} -N ${n} -State x -Landed ${sha}`
  : `sh "${script}" ${id} stage ${n} x '' ${sha}`

// F99: Diagnose. Each closable stage gets the by-hand close command - its landed cell's path, or
// its sha when on HEAD, else `<sha>`. F104: and Close, when shaFor finds its sha. Git that cannot be asked is said.
export async function openDiagnose($: EngineInterface, id: string): Promise<void> {
  const r = await readDiagnosis($, id)
  if (r.refused !== undefined) { $.ui.toast(`■ ${id} not diagnosed: ${r.refused}`); return }
  const { l, resume, run, shas, d, g } = r
  const script = l.argv.find(a => /relay-morpheus\.(sh|ps1)$/.test(a))
  const byHand = !script ? [] : d.closable.map(cl => {   // no script in the argv: no line, never `sh "undefined"`
    const own = run.stages.find(s => s.n === cl.n)?.landed
    const isSha = own !== undefined && IS_SHA.test(own)
    const sha = own && (!isSha || shas.get(own) === 'head') ? (isSha ? own : `"${own}"`) : '<sha>'   // a path (quoted), or a sha on HEAD
    return closeLine(script, id, cl.n, sha)
  })
  const close: Diagnose['close'] = []
  for (const cl of script ? d.closable : []) {
    const f = await shaFor(run.stages.find(s => s.n === cl.n)!, resume, g)
    if ('sha' in f) close.push({ n: cl.n, sha: f.sha, why: f.why, runs: closeLine(script!, id, cl.n, f.sha) })
    else if ('unchecked' in f) d.lines.push(`stage ${cl.n}: close not checked - ${f.unchecked}`)
    else d.lines.push(`stage ${cl.n}: ${f.none} - close by hand`)
  }
  if (g.why()) d.lines.push(`git not asked: ${g.why()}`)
  if ((await read($, tabA)) !== 'runs') return              // the tab left while git answered: no stale view
  await update($, diagnoseA, () => ({ id, verdict: d.verdict, lines: d.lines, byHand, close, confirm: null }))
  await $.ui.open({ id: PANE, title: PANE_NAME, closeOnEscape: true })
  void $.ui.focus({ requestId: PANE, key: 'diag:back' }).catch(() => {})
}

async function closeConfirm($: EngineInterface, n: number | null) {
  await update($, diagnoseA, d => d && { ...d, confirm: n })
  if (n !== null) void $.ui.focus({ requestId: PANE, key: 'diag:close:go' }).catch(() => {})
}

// F104: Close confirmed - as engageGo, everything read again first: the stage must still be
// closable (open, its tickets built, no live driver since) and derive the same sha; then the one write.
let closing = false   // a second press while one Close runs is dropped: never two writes
export async function closeGo($: EngineInterface): Promise<void> {
  if (closing) return
  closing = true
  try { await closeOnce($) } finally { closing = false }
}
async function closeOnce($: EngineInterface): Promise<void> {
  const v = await read($, diagnoseA)
  const want = v?.close?.find(c => c.n === v.confirm)
  if (!v || !want) return
  await closeConfirm($, null)
  const n = want.n
  const no = (why: string) => { $.ui.toast(`■ stage ${n} of ${v.id} not closed: ${why}`) }
  const r = await readDiagnosis($, v.id, true)
  if (r.refused !== undefined) { no(r.refused); return }
  const s = r.run.stages.find(x => x.n === n)
  if (!s || !r.d.closable.some(c => c.n === n)) {
    no(r.d.lines.find(x => x.startsWith(`stage ${n} driven by`))
      ?? `stage ${n} is no longer ${s && ['pending', '~', 'open'].includes(s.state) ? 'closable' : 'open'}`)
    return
  }
  const f = await shaFor(s, r.resume, r.g)
  if (!('sha' in f)) { no('unchecked' in f ? `close not checked - ${f.unchecked}` : f.none); return }
  if (f.sha !== want.sha) { no('the commit changed since the confirm - look again'); return }
  const w = await runCall($, 'relay-stage-landed', [v.id, String(n), f.sha])
  const ran = w.argv.length ? `\nran: ${w.argv.join(' ')}` : ''
  if (w.code !== 0) { no(`${w.err.trim() || w.out.trim() || `exit ${w.code}`}${ran}`); return }
  $.ui.toast(`✓ stage ${n} of ${v.id} landed ${f.sha.slice(0, 7)}${ran}`)
  await openDiagnose($, v.id)
  void pollRuns($).catch(() => {})
}

export async function readDiagnose($: EngineInterface): Promise<Diagnose | null> {
  return read($, diagnoseA)
}

export type RunsView = { runs: RunView[]; board: Board | null; cols: number; engage: Engage | null }

// The runs the tab draws in full: those not all done (F99: the finished ones get one dim row after them).
export const openRuns = (runs: RunView[]) => runs.filter(r => !isFinished(r))   // F99: the one definition

export async function readRuns($: EngineInterface, cols: number): Promise<RunsView> {
  return { runs: await read($, runsA), board: await read($, boardA), cols, engage: await read($, engageA) }
}

type Els = { Box: ElementConstructor<BoxProps>; Text: ElementConstructor<TextProps>; Button: ElementConstructor<ButtonProps> }

// F85: the engage confirm, drawn in place of the tab (B5: never a second pane).
export function EngageConfirm($: EngineInterface, els: Els, g: Engage): RenderElement[] {
  const { Box, Text, Button } = els
  return [
    <Box key="engage:title"><Text bold>{`Engage ${g.id}?`}</Text><Text dimColor>{'  Esc cancels'}</Text></Box>,
    <Text> </Text>,
    ...(g.queue ? [<Box key="engage:queue" flexDirection="row"><Text dimColor>{'First    '}</Text><Text wrap="wrap">{`relay-morpheus queue-run add ${g.id}`}</Text></Box>] : []),
    <Box key="engage:submits" flexDirection="row"><Text dimColor>{'Submits  '}</Text><Text wrap="wrap">{g.text}</Text></Box>,
    <Text> </Text>,
    <Box flexDirection="row" gap={4}>
      <Button key="engage:go" variant="primary" onPress={() => { void engageGo($) }}>Engage</Button>
      <Button key="engage:cancel" onPress={() => { void closeEngage($) }}>Cancel</Button>
    </Box>,
  ]
}

// F99: the Diagnose view, in place of the tab (B5). F104: a Close per stage with a derived sha, and its confirm.
export function DiagnoseView($: EngineInterface, els: Els, d: Diagnose): RenderElement[] {
  const { Box, Text, Button } = els
  const color = d.verdict === 'finished' ? 'success' : d.verdict === 'still running' ? 'warning' : 'error'
  const close = d.close ?? []   // a view stored before F104 has none
  const c = close.find(x => x.n === d.confirm)
  return [
    <Box key="diag:title"><Text bold>{`Diagnose ${d.id}: `}</Text><Text bold color={color}>{d.verdict}</Text><Text dimColor>{'  Esc back'}</Text></Box>,
    <Text> </Text>,
    ...(c ? [
      <Box key="diag:confirm"><Text bold>{`Close stage ${c.n} of ${d.id}?`}</Text></Box>,
      <Box key="diag:confirm:runs" flexDirection="row"><Text dimColor>{'runs    '}</Text><Text wrap="wrap">{c.runs}</Text></Box>,
      <Box key="diag:confirm:landed" flexDirection="row"><Text dimColor>{'landed  '}</Text><Text wrap="wrap">{`${c.sha}  (${c.why})`}</Text></Box>,
      <Box flexDirection="row" gap={4}>
        <Button key="diag:close:go" variant="primary" onPress={() => { void closeGo($) }}>Close</Button>
        <Button key="diag:close:cancel" onPress={() => { void closeConfirm($, null) }}>Cancel</Button>
      </Box>,
      <Text> </Text>,
    ] : []),
    ...(d.lines.length
      ? d.lines.map((l, i) => <Box key={`diag:line:${i}`}><Text wrap="wrap">{l}</Text></Box>)
      : [<Box key="diag:agree"><Text dimColor>run file, board, git and the driver stamp agree</Text></Box>]),
    <Text> </Text>,
    ...(d.byHand ?? []).map((l, i) => <Box key={`diag:byhand:${i}`}><Text dimColor wrap="wrap">{l}</Text></Box>),
    ...(c ? [] : close.map(x =>
      <Box key={`diag:closerow:${x.n}`} flexDirection="row" gap={2}>
        <Button key={`diag:close:${x.n}`} onPress={() => { void closeConfirm($, x.n) }}>{`Close stage ${x.n} with ${x.sha.slice(0, 7)}`}</Button>
        <Box key={`diag:close:why:${x.n}`}><Text dimColor wrap="wrap">{x.why}</Text></Box>
      </Box>)),
    <Button key="diag:back" onPress={() => { void closeEngage($) }}>Back</Button>,
  ]
}

export function RunsTab($: EngineInterface, els: Els, v: RunsView, a: AgentsView): RenderElement[] {
  const { Box, Text, Button } = els
  const out: RenderElement[] = []
  const draw = (l: RunLine) =>
    <Box key={l.key}><Text wrap="truncate-end">{l.segs.map(s => <Text color={s.color} dimColor={s.dim}>{s.text}</Text>)}</Text></Box>
  const open = openRuns(v.runs)
  if (!open.length) out.push(<Box key="none"><Text dimColor>{'no relay run open - /skillator:plan-runs <tickets> plans one'}</Text></Box>)
  open.forEach((run, i) => {
    if (i) out.push(<Text> </Text>)
    out.push(...runLines(run, v.board).map(draw))
    out.push(...treeLines(run, open, a.agents, a.workflows, v.board).map(draw))
    const ids = [...new Set(run.stages.flatMap(ticketsOf))]
    out.push(
      <Box flexDirection="row" gap={3}>
        <Button key={'engage:' + run.id} variant="primary" onPress={() => { void openEngage($, run.id) }}>Engage</Button>
        <Button key={'diagnose:' + run.id} onPress={() => { void openDiagnose($, run.id) }}>Diagnose</Button>
        {run.planned && <Box key={'edit:' + run.id}><Text dimColor>{`Edit in chat: /skillator:plan-runs ${ids.join(' ')}`}</Text></Box>}
      </Box>,
    )
  })
  const loose = treeLines(null, open, a.agents, a.workflows, v.board)
  if (loose.length) {
    out.push(<Text> </Text>, <Box key="norun"><Text bold>no run</Text></Box>, ...loose.map(draw))
  }
  // F99: finished runs after the active ones - one dim row each, Diagnose only, never Engage
  v.runs.filter(isFinished).forEach(run => {
    out.push(<Text> </Text>)                                // after a run, the no-run tree or 'no relay run open'
    const l = finishedLine(run)
    out.push(
      <Box key={l.key} flexDirection="row" gap={2}>
        <Text wrap="truncate-end">{l.segs.map(s => <Text color={s.color} dimColor={s.dim}>{s.text}</Text>)}</Text>
        <Button key={'diagnose:' + run.id} plain dimColor onPress={() => { void openDiagnose($, run.id) }}>diagnose</Button>
      </Box>,
    )
  })
  return out
}
