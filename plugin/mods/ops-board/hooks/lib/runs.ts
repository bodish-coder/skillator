import type { Flight, PlanItem, RunView, Stage } from '../../types'

// Pure: `relay-morpheus list` plus, per run, `relay-morpheus resume <id>` (F85: the run
// file whole - before it, `chain status`, its `## Chain` and `## Decisions` only). A text
// holding the run's `## Stages` table gives exact stage states. Otherwise a stage is `open`
// when the list row names it open, `pending` while the run is planned, and `-` (not known) else.

// cmd_list: printf 'RUN-%s  %-42s  %s/%s done' [ '  (stage %s open)' ]
const ROW = /^(RUN-\S+)  (.*?)\s+(\d+)\/(\d+) done(?:  \(stage ([\d,]+) open\))?\s*$/
const BLOCK = /^### (\S+) - stage (\d+) - (.*)$/
const TABLE_ROW = /^\|\s*(\d+)\s*\|([^|]*)\|([^|]*)\|/

type Parsed = { stages: Stage[]; hasChain: boolean; states: Map<number, string>; landed: Map<number, string>; decisions: string[]
  mode: string | null; driver: string | null; flights: Flight[] }

// F85: the Chain header is
// `driver: <cell>     hold: <cell>     mode: <mode>` (relay-morpheus.sh chain_hdr); an
// In-flight block `### stage <n> - <name>  (dispatched <time>, @tag)` then `run: <id>`.
const HDR = /^driver: (.*?)     hold: .*?     mode: (\S*)\s*$/
const FLIGHT = /^### stage (\d+) - .*?(@[^\s)]+)?\)?\s*$/

// A `### Q<k> <state> <time>` block of `## Decisions` (relay-morpheus.sh park). Only
// `open` and `asked` ones still wait on an answer; answered, ruled, moot... do not.
type Q = { k: string; state: string; fields: Map<string, string> }
const Q_HEAD = /^### (Q\d+) (\S+)/

function decisionText(q: Q): string | null {
  if (q.state !== 'open' && q.state !== 'asked') return null
  const f = (name: string) => (q.fields.get(name) ?? '').trim()
  const ticket = f('ticket').split(/\s+/)[0] || '-'
  const what = f('question') || f('reason') || f('header') || 'a decision'
  const parked = f('parked') || 'the run'
  return `${q.k} ${ticket} ${what} - ${parked} waits on it`
}

function parseChain(text: string): Parsed {
  const stages: Stage[] = []
  const states = new Map<number, string>()
  const landed = new Map<number, string>()
  const qs: Q[] = []
  const flights: Flight[] = []
  let section = '', cur: Stage | null = null, hasChain = false, q: Q | null = null
  let mode: string | null = null, driver: string | null = null
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (line.startsWith('## ')) {
      section = line.slice(3).trim(); cur = null; q = null
      if (section === 'Chain') hasChain = true
      continue
    }
    if (section === 'Decisions') {
      if (line.startsWith('### ')) {
        const h = Q_HEAD.exec(line)
        q = h ? { k: h[1]!, state: h[2]!, fields: new Map() } : null
        if (q) qs.push(q)
        continue
      }
      // Unindented `name: value` lines only: options are indented.
      const fv = /^([a-z]+): (.*)$/.exec(line)
      if (q && fv && !q.fields.has(fv[1]!)) q.fields.set(fv[1]!, fv[2]!)
      continue
    }
    if (section === 'Stages') {
      const t = TABLE_ROW.exec(line)
      if (t) {
        states.set(Number(t[1]), t[3]!.trim() || 'pending')
        const la = line.split('|')[6]?.trim()          // F99: the landed cell, 7th column
        if (la && la !== '-') landed.set(Number(t[1]), la)
      }
      continue
    }
    if (section === 'In flight') {
      const fl = FLIGHT.exec(line)
      if (fl) flights.push({ n: Number(fl[1]), by: fl[2] ?? null, run: null })
      const rn = /^run: (\S+)/.exec(line)
      if (rn && flights.length && rn[1] !== '-') flights.at(-1)!.run = rn[1]!
      continue
    }
    if (section !== 'Chain') continue
    const h: RegExpExecArray | null = !cur && mode === null ? HDR.exec(line) : null
    if (h) { mode = h[2] || null; driver = h[1]!.trim() === '-' ? null : h[1]!.trim(); continue }
    const b = BLOCK.exec(line)
    if (b) {
      const code = b[1]!
      let title = b[3]!.trim()
      if (title.startsWith(code + ' ')) title = title.slice(code.length + 1)
      cur = { n: Number(b[2]), code, ticket: '', title, after: '-', files: '-', state: '' }
      stages.push(cur)
      continue
    }
    if (!cur) continue
    // Unindented fields only: a prompt's lines are indented two spaces.
    const f = /^(tickets|files|after): (.*)$/.exec(line)
    if (!f) continue
    const val = f[2]!.trim()
    if (f[1] === 'tickets') cur.ticket = val.split(' . ').map(p => p.trim().split(/\s+/)[0]!).filter(Boolean).join(' ')
    else if (f[1] === 'files') cur.files = val || '-'
    else cur.after = val || '-'
  }
  const decisions = qs.map(decisionText).filter((d): d is string => d !== null)
  return { stages, hasChain, states, landed, decisions, mode, driver, flights }
}

// F85: a /marathon-plan script's PLAN, read as data - never imported or run. The template
// writes `const PLAN = <JSON>` closed by a `}` at column 0; null when it is not that.
export function parsePlan(js: string): PlanItem[][] | null {
  const i = js.indexOf('const PLAN = ')
  const j = i < 0 ? -1 : js.indexOf('\n}', i)
  if (j < 0) return null
  try {
    const p = JSON.parse(js.slice(i + 'const PLAN = '.length, j + 2)) as { phases?: unknown }
    if (!Array.isArray(p.phases)) return null
    return p.phases.map(ph => (Array.isArray(ph) ? ph : []).map((it: { stage?: unknown; ticket?: unknown }) =>
      ({ n: Number(it.stage), ticket: String(it.ticket ?? '') })))
  } catch { return null }
}

// `resume` opens `# Resuming <run file>`; the script beside it (`run-0019-x.md` -> `run-0019-x.workflow.js`), joined to the
// repo root when resume named it relative; null when the text names no run file.
export function scriptPathOf(text: string, root: string): string | null {
  const m = /^# Resuming (.+\.md)\s*$/m.exec(text)
  if (!m) return null
  const f = m[1]!.trim().replace(/\\/g, '/')
  return (/^([A-Za-z]:)?\//.test(f) ? f : root.replace(/\/+$/, '') + '/' + f).replace(/\.md$/, '.workflow.js')
}

export function parseRuns(list: string, chains: Record<string, string>, scripts: Record<string, string> = {}): RunView[] {
  const out: RunView[] = []
  let cur: RunView | null = null
  const open = new Map<string, Set<number>>()
  for (const raw of list.split('\n')) {
    const line = raw.replace(/\r$/, '')
    const r = ROW.exec(line)
    if (r) {
      cur = { id: r[1]!, title: r[2]!.trim(), done: Number(r[3]), total: Number(r[4]), owner: null, stages: [], planned: false, decisions: [],
        mode: null, driver: null, flights: [], phases: null }
      open.set(cur.id, new Set((r[5] ?? '').split(',').filter(Boolean).map(Number)))
      out.push(cur)
      continue
    }
    const o = /^\s+owner: (\S+)\s*$/.exec(line)
    if (o && cur) cur.owner = o[1]!
  }
  for (const run of out) {
    const text = chains[run.id]
    if (text === undefined) continue
    const p = parseChain(text)
    const openSet = open.get(run.id) ?? new Set<number>()
    run.planned = p.hasChain && p.stages.length > 0 && run.done === 0 && openSet.size === 0 &&
      [...p.states.values()].every(s => s === 'pending')
    run.decisions = p.decisions
    Object.assign(run, { mode: p.mode, driver: p.driver, flights: p.flights })
    const js = scripts[run.id]
    if (js !== undefined) run.phases = parsePlan(js)
    run.stages = p.stages.map(s => ({
      ...s,
      state: p.states.get(s.n) ?? (openSet.has(s.n) ? 'open' : run.planned ? 'pending' : '-'),
      ...(p.landed.has(s.n) ? { landed: p.landed.get(s.n)! } : {}),   // F99: only when the cell has a sha
    }))
  }
  return out
}
