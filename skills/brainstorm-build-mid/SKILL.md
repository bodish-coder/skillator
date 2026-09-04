---
name: brainstorm-build-mid
description: >-
  Use when the user wants straight Opus quality for both the thinking and the
  code — an all-Opus plan then build, run autonomously with no stop in
  between, no Fable creative ideation, no Sonnet cost-tiering and no ceremony
  (no session record, no handoff checkpoint). For a Fable-led creative design
  plus the full ceremony use brainstorm-build-prime; to offload the simple /
  mechanical parts to Sonnet use brainstorm-build-lite. NOT for tiny one-line
  edits (just do them) or pure design/no-build work.
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

## Craft — read this first

Read **`PRACTICE.md`** at the plugin root (beside `PLATFORMS.md`). It is
skillator's process canon — the superpowers process skills merged in, in
skillator's own words — so none of them is chained in front of this one: classify
the request spike/bounded/architectural and say which out loud; one question at a
time; the plan-grade TASKS shape a build agent can work from cold; design
self-review; the test-first law; fresh-evidence verification; debugging (§7);
branch lifecycle (§8). Everything below assumes it.

## Phase 1 — Opus plans

Dispatch one subagent, `model: "opus"` (the Opus 5 slug where the host has one),
`subagent_type: "general-purpose"`. Give it the user's task text and the repo
context. Ask it to commit to an approach and **write** an implementation-ready
design to a file, returning only that path plus a two-line summary:

```
CHOSEN:       <the approach, one line + why>
DESIGN:       <data model / contracts, key edge cases, out of scope>
CONSTRAINTS:  <the binding requirements every task must respect — exact
              values, names, formats, and the stated relationships
              between components. Not per-task detail: this is what
              stays true across all of them, copied verbatim into each
              task reviewer's prompt as [GLOBAL_CONSTRAINTS].>
TASKS:        <one block per task in PRACTICE.md §2 shape: Files
              create/modify/test, Interfaces consumes/produces,
              test-first steps with real code and real commands>
VERIFICATION: <the concrete end-to-end check that proves it works>
```

**The design file — minimal, not a session record.** Write it to the scratchpad
(or `docs/sessions/` if the user wants it kept) as
`design-<YYYY-MM-DD>-<slug>.md`. It exists for one reason: `practice/task-loop.md`
and every template in `practice/prompts.md` take a `<DESIGN_FILE>` path
(`taskwork.sh brief <DESIGN_FILE> <N>`), and a build agent that never saw this
conversation reads the design from disk, not from a pasted prompt. That is the
whole ceremony this tier keeps — no outcome section, no session narrative, no
handoff-and-shed checkpoint. Confirm the path in your reply.

## Phase 2 — Opus builds

Dispatch Opus subagent(s), `model: "opus"` (the Opus 4.8 slug where the host has
one). Each gets the **design file path** and its own task block — never the
design pasted into the prompt and never this session's history (PRACTICE.md §4;
procedure in `practice/task-loop.md`, prompt text in `practice/prompts.md`).
Build exactly the design, stay inside the declared files. Independent tasks
can run in parallel (git worktree if they'd touch the same tree). If the design hits
a real blocker only the user can resolve, stop and surface it — don't guess.

## Phase 3 — Verify & relay

Run the VERIFICATION step (Opus agent or main session) through PRACTICE.md §5:
identify the command, run it in full now, read the whole output and exit code,
and only then claim — with the evidence attached. Never from an earlier run. On failure, fix it and re-run. Then relay
concisely: the approach, what was built (files), and the verification result.

## Workflow mode — wide builds

When the plan returns **4+ independent tasks**, or the work is a sweep
(migration, audit, codemod), or the user asked for it, run Phases 1-3 as a
**single deterministic workflow script** instead of hand-dispatched subagents:
plan → one Opus build agent per task → verify each → loop the failures. Read
**`WORKFLOW.md`** (beside the installed skills, or at the repo/plugin root) for
the criteria, host table, and a ready script — use the same two model
picks as Phases 1-2 in its design/build stages, and ignore its `complexity` tag.
Write the design file before the call and pass its path in `args`, exactly as
Phase 2 would.

For 1-3 sequential tasks, stay with plain dispatch — a script buys nothing.

## Rules

- **Both phases are Opus subagents.** Don't design or code in the main session.
- **Pass the design by path, never by paste.** The design file carries the
  contracts and edge cases; a build agent reads it. Pasting it into the prompt
  parks the whole design in your context for the rest of the session
  (`practice/task-loop.md`, Context hygiene) and is not what the canon's
  templates take.
- **Minimal ceremony, real canon.** This tier writes the design file and nothing
  else: no session record, no Outcome section, no rework loop, and no §6
  whole-branch reviewer — that end-of-build `deep`-tier pass is prime's ceremony,
  and this tier seats no `deep` model. It ships on §5 evidence plus §4's per-task
  review. PRACTICE.md §§1-5, and §6's receiving-review discipline, still apply —
  that is what the design file makes possible.
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
