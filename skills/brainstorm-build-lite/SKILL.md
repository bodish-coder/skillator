---
name: brainstorm-build-lite
description: >-
  The lightest "brainstorm then build". Use when the user wants a quick,
  cost-aware build that offloads the simpler or mechanical parts to a cheaper
  model and doesn't need Fable's creative brainstorm — "just design and build
  it, cheap where it can be". For a straight all-Opus planâ†’build (no Sonnet
  offload) use brainstorm-build-mid; for a Fable-led creative design plus the
  full ceremony use brainstorm-build-prime. NOT for tiny one-line edits (just
  do them) or pure design/no-build work.
---

# Build (Opus design + build) + Sonnet (simple tasks)

Two models, no Fable. **Opus** does the design thinking and the complex/core
implementation; **Sonnet** offloads the simple, mechanical tasks so you don't pay
Opus rates for boilerplate. A skill can't change the main session's model, so the
split is done with **subagents** carrying explicit `model` overrides. You (the main
session) orchestrate only — spawn the agents, route by complexity, relay the result.

## Craft — read this first

Read **`PRACTICE.md`** at the plugin root (beside `PLATFORMS.md`). It is
skillator's process canon — the superpowers process skills merged in, in
skillator's own words — so none of them is chained in front of this one: classify
the request spike/bounded/architectural and say which out loud; one question at a
time; the plan-grade TASKS shape a build agent can work from cold; design
self-review; the test-first law; fresh-evidence verification; debugging (§7);
branch lifecycle (§8). Everything below assumes it.

## Phase 1 — Opus designs

Dispatch one subagent, `model: "opus"`, `subagent_type: "general-purpose"`. Give it
the user's task text and the repo context. Ask it to commit to an approach and
**write** an implementation-ready design **with each task tagged by complexity**
to a file, returning only that path plus a two-line summary:

```
CHOSEN:       <the approach, one line + why>
DESIGN:       <data model / contracts, key edge cases, out of scope>
CONSTRAINTS:  <the binding requirements every task must respect — exact
              values, names, formats, and the stated relationships
              between components. Not per-task detail: this is what
              stays true across all of them, copied verbatim into each
              task reviewer's prompt as [GLOBAL_CONSTRAINTS].>
TASKS:        <one block per task in PRACTICE.md §2 shape (Files,
              Interfaces, test-first steps), each tagged
              [SIMPLE] or [COMPLEX]>
VERIFICATION: <the concrete end-to-end check that proves it works>
```

**The design file — one file, no ceremony.** Write it to the scratchpad as
`design-<YYYY-MM-DD>-<slug>.md`. It is not a session record and this tier keeps
none; it exists because `practice/task-loop.md` and every template in
`practice/prompts.md` take a `<DESIGN_FILE>` path
(`taskwork.sh brief <DESIGN_FILE> <N>`), and because a Sonnet agent working one
task needs the contracts on disk rather than re-summarised into its prompt.
Confirm the path in your reply.

## Phase 2 — Build (route by complexity)

Work the TASKS list, routing each:
- **[COMPLEX] / core → `model: "opus"`** subagent.
- **[SIMPLE] / mechanical → `model: "sonnet"`** subagent.

Each agent gets the **design file path** and its own task block — never the design
pasted into the prompt, never this session's history (PRACTICE.md §4; procedure in
`practice/task-loop.md`, prompt text in `practice/prompts.md`). It builds exactly
that and stays inside its declared files. Independent tasks can run in parallel (git worktree if they'd touch
the same tree). If the design hits a real blocker only the user can resolve, stop
and surface it — don't guess.

## Phase 3 — Verify & relay

Run the VERIFICATION step (Opus agent or main session) through PRACTICE.md §5:
identify the command, run it in full now, read the whole output and exit code,
and only then claim — with the evidence attached. Never from an earlier run. On failure, fix it ([SIMPLE]→Sonnet,
[COMPLEX]→Opus) and re-run. Then relay concisely: the approach, what was built
(files), and the verification result.

## Workflow mode — wide builds

When the design returns **4+ independent tasks**, or the work is a sweep
(migration, audit, codemod), or the user asked for it, run Phases 1-3 as a
**single deterministic workflow script** instead of hand-dispatched subagents:
design → one build agent per task → verify each → loop the failures. Read
**`WORKFLOW.md`** (beside the installed skills, or at the repo/plugin root) for
the criteria, host table, and a ready script. Write the design file before the
call and pass its path in `args`, exactly as Phase 2 would.

The [SIMPLE]/[COMPLEX] routing survives the switch — it becomes the schema's
`complexity` field, and the build stage picks the model per task:
`model: t.complexity === 'SIMPLE' ? 'sonnet' : 'opus'`. Same rule, one call.

For 1-3 sequential tasks, stay with plain dispatch.

## Rules

- **Route by tag, not vibe.** [SIMPLE]→Sonnet, [COMPLEX]→Opus, design→Opus. Don't
  send boilerplate to Opus (waste) or core logic to Sonnet.
- **Both build phases are subagents.** Don't design or code in the main session.
- **Autonomous but honest.** No confirmation gate; but if a phase fails or an agent
  returns nothing, say so and stop rather than continuing on a missing piece.
- **Handoff before any context loss.** This tier runs no `/compact` or `/clear` of
  its own, but if you or the user are about to run either, **first run the
  `handoff` skill** — never compact/clear without a verified handoff.
- **Pass the design by path, never by paste.** Pasting it parks the whole design
  in your context for the rest of the session (`practice/task-loop.md`, Context
  hygiene), and the canon's templates take a `<DESIGN_FILE>` path anyway.
- **Minimal ceremony, real canon.** The scratchpad design file is the only
  artifact this tier writes — no session record, no Outcome section, no rework
  loop, and no §6 whole-branch reviewer — that end-of-build `deep`-tier pass is
  prime's ceremony, and this tier seats no `deep` model. It ships on §5 evidence
  plus §4's per-task review. PRACTICE.md §§1-5, and §6's receiving-review
  discipline, still apply.
- Need Fable's creative brainstorm, a handoff checkpoint, or a kept session
  record? Use brainstorm-build-prime. Want all-Opus (no Sonnet offload)? Use -mid.

## Other hosts

Opus/Sonnet and the Agent tool above are the **Claude Code** defaults. On Cursor,
Codex, Antigravity, Pi, or Prime Agent, map them through `PLATFORMS.md` (beside the
installed skills, or at the repo/plugin root): design + [COMPLEX] → **build
tier**, [SIMPLE] → **cheap tier**,
dispatched with that host's delegate mechanism. Where the host has no delegation,
run the phases **sequentially in one session**, switching model between them and
writing each phase's output to disk before the switch — the file is the handover,
not chat history.
