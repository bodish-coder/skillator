// marathon-workflow.js - relay-morpheus's Workflow script template (F73).
// /marathon-plan copies it beside the run file - .skillator/run-<0000>-<slug>.md ->
// .skillator/run-<0000>-<slug>.workflow.js - and fills `meta` and `PLAN` (nothing below them).
// /marathon-run runs it one phase per Workflow call, after `chain dispatch` of that phase's stages:
//   Workflow({scriptPath: '<that file>', args: {phase: 1, worktrees: {'12': '<path>'}}})
// args.phase   - the phase to run, 1-based. Required: a phase is one Workflow call, so every stage
//                in it is on disk (`~`, its prompt in the In-flight block) before its agent exists.
// args.worktrees - stage number -> the worktree `chain dispatch` named for it (a stage worktree
//                when another stage was in flight); missing = PLAN.runWorktree.
// PLAN.mode (F112) is the plan shape: 'sequential' = one ticket per phase, 'parallel' = file-disjoint tickets, 'parallel <N>' = at most N; the check below refuses a wider phase.
// Returns one row per ticket: {stage, code, ticket, worktree, verdict}; verdict null = the agent died.
// Agents: one implementer and one read-and-run-only verifier per ticket, both under its phase. Pure ASCII.
// The agents never touch the board: each ticket is [~] and claimed before its phase runs - chain dispatch
// claims it (F80), and RM board <ID> '~' claims an unowned one again on the flip, as ticket-meta start does (F106).
// Hosts with no Workflow tool read meta and PLAN as data and never execute this file -
// relay-morpheus references/marathon.md, "Run without the Workflow tool".

export const meta = {
  name: 'marathon-RUN-0000',
  description: 'RUN-0000 <title> (<mode>): one implementer per ticket, phases serial where tickets share files, one verifier per ticket in its phase',
  phases: [
    { title: 'Phase 1', detail: '<tickets in phase 1, e.g. F1 F2>' },
  ],
}

// One inner array per phase. Tickets in one phase share no file; a ticket sharing a file with an
// earlier one sits in a later phase (its `chain plan` has --after that stage). `prompt` is the
// stage's prompt file, verbatim - the same text `chain plan --prompt-file` stored in the run file.
// With grayskull-power on (.skillator/grayskull.md present) that text opens with this line (A155):
// Load skillator:code-yoda first (restraint, full): the smallest diff that meets the ticket - no speculative abstraction, no new dependency, no refactor outside the ticket, no ceremony; run its review lens on your diff before /code-review and cut what it flags.
const PLAN = {
  run: 'RUN-0000',
  runWorktree: '<the run worktree init printed>',
  mode: 'sequential', // 'sequential' | 'parallel' | 'parallel <N>' - the mode /marathon-plan or /marathon-run was given (F112)
  phases: [
    [
      { stage: 0, code: 'XXXX', ticket: 'F0', files: ['<path>'], done: '<the ticket Done line>', prompt: '<prompt file text>' },
    ],
  ],
}

// ---- nothing below is edited per run ----

const VERDICT = {
  type: 'object',
  properties: {
    ticket: { type: 'string' },
    passed: { type: 'boolean' },
    sha: { type: 'string', description: 'the short sha of the commit that does the ticket, or empty' },
    evidence: { type: 'string', description: 'the check that ran now and what it printed' },
    why: { type: 'string', description: 'on passed:false, what is missing or wrong' },
    parked: {
      type: 'object',
      properties: {
        question: { type: 'string' }, header: { type: 'string', maxLength: 8 },
        options: { type: 'array', minItems: 2, maxItems: 4, items: { type: 'object', properties: { label: { type: 'string' }, does: { type: 'string' }, hurts: { type: 'string' } } } },
        recommended: { type: 'string' }, default: { type: 'string' }, reason: { enum: ['taste', 'fact', 'conflict'] },
        genuine: { type: 'boolean' }, gated: { type: 'string' }, files: { type: 'array', minItems: 1, items: { type: 'string' } },
        done: { type: 'string' }, stop: { enum: ['none', 'destructive', 'security', 'outside', 'scope', 'repro'] },
      },
      required: ['question', 'header', 'options', 'default', 'reason', 'genuine', 'gated', 'files', 'stop'],
    },
  },
  required: ['ticket', 'passed', 'sha', 'evidence'],
}

const cap = PLAN.mode === 'sequential' ? 1 : /^parallel \d+$/.test(PLAN.mode) ? Number(PLAN.mode.slice(9)) : PLAN.mode === 'parallel' ? Infinity : NaN
if (Number.isNaN(cap) || (PLAN.mode !== 'sequential' && PLAN.mode !== 'parallel' && (!Number.isSafeInteger(cap) || cap < 2))) throw new Error(`PLAN.mode must be 'sequential', 'parallel' or 'parallel <N>' - got ${JSON.stringify(PLAN.mode)}`)
PLAN.phases.forEach((p, i) => {
  if (p.length > cap) throw new Error(`PLAN.mode ${PLAN.mode} needs ${cap === 1 ? 'one ticket per phase' : `at most ${cap} tickets per phase`} - phase ${i + 1} holds ${p.length}`)
})

const k = args && args.phase
if (!Number.isInteger(k) || k < 1 || k > PLAN.phases.length) {
  throw new Error(`args.phase must be 1..${PLAN.phases.length} - /marathon-run runs one phase per call, after chain dispatch of its stages`)
}
const items = PLAN.phases[k - 1]
const wts = (args && args.worktrees) || {}
const wtOf = it => wts[String(it.stage)] || PLAN.runWorktree
const title = `Phase ${k}`

const implement = it => {
  const wt = wtOf(it)
  const here = wt === PLAN.runWorktree ? '' :
    `This stage works and commits in its own worktree: ${wt} - it replaces the run worktree wherever the prompt below names it.\n\n`
  return here + it.prompt
}

const verify = (it, report) => `You verify one ticket of ${PLAN.run}. Read and run only: never edit a file, commit, or touch TICKETS.md.
Ticket ${it.ticket} (stage ${it.stage}, ${it.code}). Done = ${it.done}
Its files: ${it.files.join(', ')}. Worktree: ${wtOf(it)} - use git -C "<worktree>" and absolute paths, never cd.
The implementer's report:
---
${report == null ? '(none - the implementer returned nothing)' : report}
---
1. Find the commit for ${it.ticket} on that worktree's branch (git -C "<worktree>" log --oneline -5); its diff must touch only what the ticket needs.
2. Run the check the Done line names, now, and quote what it printed. passed: true only on that evidence.
3. If the report says PARKED: check that the independent part works, check (git diff) that the gated files hold no partial guess, judge whether the decision is genuinely the user's, and list every file the gated part would touch; parked.files is the union of yours and the implementer's.
Return the VERDICT: sha = that commit's short sha (empty when there is none).`

phase(title)
log(`${PLAN.run} ${title}: ${items.map(it => it.ticket).join(' ')} - ${items.length * 2} agents`)
const verdicts = await pipeline(items,
  it => agent(implement(it), { label: `${it.code} fix:${it.ticket}`, phase: title }),
  (report, it) => agent(verify(it, report), { label: `${it.code} verify:${it.ticket}`, phase: title, schema: VERDICT }))
return items.map((it, i) => ({ stage: it.stage, code: it.code, ticket: it.ticket, worktree: wtOf(it), verdict: verdicts[i] || null }))
