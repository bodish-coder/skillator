# Workflow mode — deterministic orchestration for the brainstorm-build skills

The brainstorm-build skills normally dispatch phases as **individual subagents**
you spawn one at a time. That is the default and stays the default.

**Workflow mode** runs the same phases as a single deterministic script instead:
one call, fan-out and loops in real control flow, structured results, and a
resumable run. Use it when the work is wide, not when it is deep.

## When to switch

Switch to workflow mode when **any** of these hold:

- The design's TASKS list has **4+ independent items** (real fan-out).
- The task is a sweep: migration, audit, codemod, "do this across N files".
- You want **adversarial verification** of the design or the build (N judges).
- The user explicitly asked — "ultracode", "use a workflow", "fan out agents",
  "orchestrate this with subagents", or a slash command that says to.

Stay with plain subagent dispatch when:

- The build is 1-3 sequential tasks (a script buys nothing).
- The phases need your judgement between them (prime's checkpoints, a design
  you want to read before building).
- The host has no Workflow tool — see the host table below.

**Never start a workflow the user didn't opt into**, unless the criteria above
are met *and* the skill was itself invoked for a build. Workflows can spawn
dozens of agents; when in doubt, say what it would cost and ask.

## Host support

| Host | Mechanism |
|------|-----------|
| **claude-code** | `Workflow` tool, inline `script`. The real thing. |
| **codex** | No script runtime — emulate: dispatch stage 1 subagents, collect, dispatch stage 2. Same shape, manual barriers. |
| **cursor** · **antigravity** · **pi** | No Workflow tool. Use the host's parallel delegate mechanism per `PLATFORMS.md`; drop back to plain dispatch. |
| **prime-agent** | `rlm(...)` fan-out in a loop; no caching or resume. |

Off `claude-code`, workflow mode is a *pattern*, not a tool. Don't pretend a
`Workflow` call happened.

## Phase → script mapping

The skills' phases map onto script stages one-for-one. Roles keep their tiers
(`references/platforms.md` in prime, `PLATFORMS.md` for the rest) — pass them as
`opts.model`.

| Skill phase | Script |
|-------------|--------|
| Design / plan | one `agent()` at the **design tier**, with a `schema` so TASKS comes back as an array — not prose you have to parse |
| Build | `pipeline(design.tasks, buildStage, verifyStage)` at the **build tier** |
| Verify | second pipeline stage, or a `parallel()` judge panel per task |
| Rework | loop the failed items back through the build stage |

`pipeline()` is the default — item B starts stage 2 while item C is still in
stage 1. Only use `parallel()` between stages when a stage genuinely needs *all*
prior results at once (dedup, an early exit on zero findings).

## Design schema

Force the design agent into structured output so the build stage can iterate it:

```js
const DESIGN = {
  type: 'object',
  required: ['chosen', 'design', 'tasks', 'verification'],
  properties: {
    chosen: { type: 'string' },
    design: { type: 'string' },
    verification: { type: 'string' },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'summary', 'files', 'complexity'],
        properties: {
          id: { type: 'string' },
          summary: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          complexity: { type: 'string', enum: ['SIMPLE', 'COMPLEX'] },
          dependsOn: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}
```

`complexity` is what **-lite** routes on. `-mid` and **-prime** can ignore it.

## Reference script

Written for **-prime**. For `-mid`, use `model: 'opus'` in both stages and drop
the session-file lines. For `-lite`, drop the design file too and pick the build
model per task: `t.complexity === 'SIMPLE' ? 'sonnet' : 'opus'`.

```js
export const meta = {
  name: 'brainstorm-build',
  description: 'Design at the design tier, then build + verify each task in parallel',
  phases: [
    { title: 'Design', detail: 'one design-tier agent, structured output' },
    { title: 'Build', detail: 'one build-tier agent per task' },
    { title: 'Verify', detail: 'verification check per task' },
  ],
}

const TASK = args.task
const SESSION_FILE = args.sessionFile   // prime only; null for -mid / -lite

phase('Design')
const design = await agent(
  `Design, do not implement. Task: ${TASK}
   Read the repo for context. Commit to ONE approach.
   Split the work into independently-buildable tasks, each naming the files it
   touches. Tag each SIMPLE or COMPLEX. Give one concrete end-to-end check.`,
  { model: 'fable', schema: DESIGN, phase: 'Design' },
)
if (!design?.tasks?.length) return { error: 'design returned no tasks' }
log(`${design.tasks.length} tasks: ${design.chosen}`)

phase('Build')
const results = await pipeline(
  design.tasks,
  (_, t) => agent(
    `Implement exactly this task, nothing more.
     ${SESSION_FILE ? `Design file: ${SESSION_FILE} (read it first).` : ''}
     Approach: ${design.chosen}
     Design: ${design.design}
     Task ${t.id}: ${t.summary}
     Touch ONLY: ${t.files.join(', ')}
     If you hit a blocker only a human can resolve, stop and say so.`,
    { model: 'opus', label: `build:${t.id}`, phase: 'Build', isolation: 'worktree' },
  ),
  (built, t) => agent(
    `Verify task ${t.id} landed. Check: ${design.verification}
     Files: ${t.files.join(', ')}
     Build agent reported: ${built}
     Run the check. Report the ACTUAL result with evidence, never a claim.`,
    { model: 'opus', label: `verify:${t.id}`, phase: 'Verify', schema: VERDICT },
  ).then(v => ({ task: t, built, verdict: v })),
)

const done = results.filter(Boolean)
return {
  chosen: design.chosen,
  design: design.design,
  verification: design.verification,
  passed: done.filter(r => r.verdict?.pass),
  failed: done.filter(r => !r.verdict?.pass),
  dropped: design.tasks.length - done.length,
}
```

`VERDICT` is `{ type: 'object', required: ['pass', 'evidence'], properties: {
pass: { type: 'boolean' }, evidence: { type: 'string' } } }`.

## Rules that don't change

- **`isolation: 'worktree'` whenever parallel tasks touch the same tree.**
  It is not free (~200-500ms + disk each) — skip it for a single build task.
- **`dependsOn` is not free either.** `pipeline()` runs items independently. If
  tasks have a real ordering, either chain them inside one `agent()` prompt or
  run the dependent ones in a second `pipeline()` after the first returns.
- **The design/session file still rules.** In `-prime`, write it *before* the
  workflow starts and pass its path in `args` — the workflow's own result is
  not durable memory. Append the Outcome section from the returned object.
- **Checkpoints stay yours.** A workflow cannot run `handoff`, `/compact`, or
  `/clear`. Run them in the orchestrator session, around the workflow call —
  never skip the handoff.
- **Report what actually came back.** `agent()` returns `null` on a skipped or
  dead agent, and `pipeline()` drops a throwing item to `null`. Filter, then say
  how many were dropped. Never report a silent truncation as full coverage.
- **Read the journal before diagnosing an empty result** —
  `<transcriptDir>/journal.jsonl` records each agent's real return value.
- **Resume rather than restart.** A killed or edited run relaunches with
  `{ scriptPath, resumeFromRunId }`; the unchanged prefix comes back cached.
- **Respect the session's workflow size guideline.** Default is ~15 agents. A
  50-task design means batching tasks per agent, not 50 agents.
