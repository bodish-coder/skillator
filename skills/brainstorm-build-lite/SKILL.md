---
name: brainstorm-build-lite
description: >-
  The lightest "brainstorm then build" skill — no Fable, two models only: Opus
  (claude-opus-4-8) does the design thinking and the complex/core implementation,
  Sonnet (claude-sonnet-5) handles the simpler/mechanical tasks. Fully autonomous,
  no ceremony (no /compact, no session record, no /clear). Use when the user wants
  a quick, cost-aware build and doesn't need Fable's creative brainstorm — "just
  design and build it, cheap where it can be". For a straight all-Opus plan→build
  (no Sonnet offload) use brainstorm-build-mid; for a Fable-led creative
  design plus the full ceremony (/compact + session record + /clear) use
  brainstorm-build-prime. NOT for tiny one-line edits (just do them) or
  pure design/no-build work.
---

# Build (Opus design + build) + Sonnet (simple tasks)

Two models, no Fable. **Opus** does the design thinking and the complex/core
implementation; **Sonnet** offloads the simple, mechanical tasks so you don't pay
Opus rates for boilerplate. A skill can't change the main session's model, so the
split is done with **subagents** carrying explicit `model` overrides. You (the main
session) orchestrate only — spawn the agents, route by complexity, relay the result.

## Phase 1 — Opus designs

Dispatch one subagent, `model: "opus"`, `subagent_type: "general-purpose"`. Give it
the task verbatim + repo context. Ask it to commit to an approach and return an
implementation-ready design **with each task tagged by complexity**:

```
CHOSEN:       <the approach, one line + why>
DESIGN:       <data model / contracts, key edge cases, out of scope>
TASKS:        <ordered list; tag each [SIMPLE] or [COMPLEX] + the files it touches>
VERIFICATION: <the concrete end-to-end check that proves it works>
```

## Phase 2 — Build (route by complexity)

Work the TASKS list, routing each:
- **[COMPLEX] / core → `model: "opus"`** subagent.
- **[SIMPLE] / mechanical → `model: "sonnet"`** subagent.

Each agent gets the design + its task(s), builds exactly that, and stays inside its
declared files. Independent tasks can run in parallel (git worktree if they'd touch
the same tree). If the design hits a real blocker only the user can resolve, stop
and surface it — don't guess.

## Phase 3 — Verify & relay

Run the VERIFICATION step (Opus agent or main session) and capture the actual
result — pass/fail with evidence, not a claim. On failure, fix it ([SIMPLE]→Sonnet,
[COMPLEX]→Opus) and re-run. Then relay concisely: the approach, what was built
(files), and the verification result.

## Workflow mode — wide builds

When the design returns **4+ independent tasks**, or the work is a sweep
(migration, audit, codemod), or the user asked for it, run Phases 1-3 as a
**single deterministic workflow script** instead of hand-dispatched subagents:
design → one build agent per task → verify each → loop the failures. Read
**`WORKFLOW.md`** (beside the installed skills, or at the repo/plugin root) for
the criteria, host table, and a ready script.

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
- Need Fable's creative brainstorm, a /compact checkpoint, or a session record? Use
  brainstorm-build-prime. Want all-Opus (no Sonnet offload)? Use -mid.

## Other hosts

Opus/Sonnet and the Agent tool above are the **Claude Code** defaults. On Cursor,
Codex, Antigravity, Pi, or Prime Agent, map them through `PLATFORMS.md` (beside the
installed skills, or at the repo/plugin root): design + [COMPLEX] → **build
tier**, [SIMPLE] → **cheap tier**,
dispatched with that host's delegate mechanism. Where the host has no delegation,
run the phases **sequentially in one session**, switching model between them and
writing each phase's output to disk before the switch — the file is the handover,
not chat history.
