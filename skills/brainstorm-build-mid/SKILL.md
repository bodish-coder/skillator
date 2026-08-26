---
name: brainstorm-build-mid
description: >-
  Mid-tier feature build on the Opus tier end to end — Opus 5 plans/designs and
  Opus 4.8 implements where the host exposes version slugs; on Claude Code, where
  only the `opus` tier is selectable, the run's Opus does both. Fully autonomously
  with no stop in between. No Fable brainstorm, no Sonnet cost-tiering, no /compact, no
  session record, no /clear — just Opus plan → Opus build. Use when the user wants
  straight Opus quality for both the thinking and the code, without Fable's creative
  ideation and without offloading simple tasks. For a Fable-led creative design plus
  the full ceremony use brainstorm-build-prime; to offload the simple /
  mechanical parts to Sonnet use brainstorm-build-lite. NOT for tiny
  one-line edits (just do them) or pure design/no-build work.
---

# Plan (Opus 5) → Build (Opus 4.8)

The Opus tier end to end: **Opus 5** does the design thinking, then **Opus 4.8**
does the implementation. A skill can't change the main session's model, so each phase runs as
an **Opus subagent** (`model: "opus"`). You (the main session) orchestrate only —
spawn the agents, pass the design between them, relay the result.

**Intended split: Opus 5 plans, Opus 4.8 builds** — the newer model for the design
thinking, the proven coder for the implementation.

> **Version note (honest limit):** on **Claude Code** this split is currently
> *not expressible*. The Agent tool's `model` field takes tiers (`opus`,
> `sonnet`, `haiku`, `fable`), not version slugs, so `opus` resolves to whatever
> Opus the run is on and **both phases get the same one**. Say so once, then run
> both on the session's Opus. To plan and build on a specific Opus today, run the
> whole session on it.
>
> On hosts that *do* expose version slugs (Cursor, and any host whose model list
> in `PLATFORMS.md` names versions), take the split: design on the Opus 5 slug,
> build on the Opus 4.8 slug. Record both in the run's summary.

## Phase 1 — Opus plans

Dispatch one subagent, `model: "opus"` (the Opus 5 slug where the host has one),
`subagent_type: "general-purpose"`. Give it the task verbatim + repo context. Ask it to commit to an approach and return an
implementation-ready design:

```
CHOSEN:       <the approach, one line + why>
DESIGN:       <data model / contracts, key edge cases, out of scope>
TASKS:        <ordered list + the files each touches>
VERIFICATION: <the concrete end-to-end check that proves it works>
```

## Phase 2 — Opus builds

Dispatch Opus subagent(s), `model: "opus"` (the Opus 4.8 slug where the host has
one), given the design **verbatim** + the task(s). Build exactly the design, stay inside the declared files. Independent tasks
can run in parallel (git worktree if they'd touch the same tree). If the design hits
a real blocker only the user can resolve, stop and surface it — don't guess.

## Phase 3 — Verify & relay

Run the VERIFICATION step (Opus agent or main session) and capture the actual result
— pass/fail with evidence, not a claim. On failure, fix it and re-run. Then relay
concisely: the approach, what was built (files), and the verification result.

## Workflow mode — wide builds

When the plan returns **4+ independent tasks**, or the work is a sweep
(migration, audit, codemod), or the user asked for it, run Phases 1-3 as a
**single deterministic workflow script** instead of hand-dispatched subagents:
plan → one Opus build agent per task → verify each → loop the failures. Read
**`WORKFLOW.md`** (beside the installed skills, or at the repo/plugin root) for
the criteria, host table, and a ready script — use the same two model
picks as Phases 1-2 in its design/build stages, and ignore its `complexity` tag.

For 1-3 sequential tasks, stay with plain dispatch — a script buys nothing.

## Rules

- **Both phases are Opus subagents.** Don't design or code in the main session.
- **Pass the design verbatim** from plan to build — the contracts and edge cases are
  the point.
- **Autonomous but honest.** No confirmation gate; but if a phase fails or an agent
  returns nothing, say so plainly and stop rather than continuing on a missing piece.
- **Handoff before any context loss.** This tier runs no `/compact` or `/clear` of its
  own, but if you or the user are about to run either, **first run the
  `handoff` skill** — never compact/clear without a verified handoff.
- Want Fable's creative brainstorm + the full ceremony? Use
  brainstorm-build-prime. Want to offload simple/mechanical tasks to Sonnet?
  Use brainstorm-build-lite.

## Other hosts

"Opus" and the Agent tool above are the **Claude Code** defaults. On Cursor,
Codex, Antigravity, Pi, or Prime Agent, read `PLATFORMS.md` (beside the installed skills, or at the repo/plugin
root) and use the host's **build tier** for both phases, with its own delegate
mechanism. No delegation available → run plan then build **sequentially in one
session**, writing the design to disk before building from it.
