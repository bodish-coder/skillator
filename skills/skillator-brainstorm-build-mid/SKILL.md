---
name: skillator-brainstorm-build-mid
description: >-
  Mid-tier feature build on a single model tier end to end — Opus (the run's Opus)
  does BOTH the planning/design and the implementation, fully autonomously with no
  stop in between. No Fable brainstorm, no Sonnet cost-tiering, no /compact, no
  session record, no /clear — just Opus plan → Opus build. Use when the user wants
  straight Opus quality for both the thinking and the code, without Fable's creative
  ideation and without offloading simple tasks. For a Fable-led creative design plus
  the full ceremony use skillator-brainstorm-build-prime; to offload the simple /
  mechanical parts to Sonnet use skillator-brainstorm-build-lite. NOT for tiny
  one-line edits (just do them) or pure design/no-build work.
---

# Plan (Opus) → Build (Opus)

One model tier end to end: **Opus** does the design thinking, then **Opus** does the
implementation. A skill can't change the main session's model, so each phase runs as
an **Opus subagent** (`model: "opus"`). You (the main session) orchestrate only —
spawn the agents, pass the design between them, relay the result.

> **Version note (honest limit):** the `opus` alias resolves to whatever Opus the run
> uses — a specific version (Opus 5 vs Opus 4.8) **can't be pinned per-subagent**, so
> both phases use the same Opus. To plan/build on a particular Opus (e.g. Opus 5), run
> the whole session on that model; both phases follow it.

## Phase 1 — Opus plans

Dispatch one subagent, `model: "opus"`, `subagent_type: "general-purpose"`. Give it
the task verbatim + repo context. Ask it to commit to an approach and return an
implementation-ready design:

```
CHOSEN:       <the approach, one line + why>
DESIGN:       <data model / contracts, key edge cases, out of scope>
TASKS:        <ordered list + the files each touches>
VERIFICATION: <the concrete end-to-end check that proves it works>
```

## Phase 2 — Opus builds

Dispatch Opus subagent(s), `model: "opus"`, given the design **verbatim** + the
task(s). Build exactly the design, stay inside the declared files. Independent tasks
can run in parallel (git worktree if they'd touch the same tree). If the design hits
a real blocker only the user can resolve, stop and surface it — don't guess.

## Phase 3 — Verify & relay

Run the VERIFICATION step (Opus agent or main session) and capture the actual result
— pass/fail with evidence, not a claim. On failure, fix it and re-run. Then relay
concisely: the approach, what was built (files), and the verification result.

## Rules

- **Both phases are Opus subagents.** Don't design or code in the main session.
- **Pass the design verbatim** from plan to build — the contracts and edge cases are
  the point.
- **Autonomous but honest.** No confirmation gate; but if a phase fails or an agent
  returns nothing, say so plainly and stop rather than continuing on a missing piece.
- **Handoff before any context loss.** This tier runs no `/compact` or `/clear` of its
  own, but if you or the user are about to run either, **first run the
  `skillator-handoff` skill** — never compact/clear without a verified handoff.
- Want Fable's creative brainstorm + the full ceremony? Use
  skillator-brainstorm-build-prime. Want to offload simple/mechanical tasks to Sonnet?
  Use skillator-brainstorm-build-lite.

## Other hosts

"Opus" and the Agent tool above are the **Claude Code** defaults. On Cursor,
Codex, Antigravity, Pi, or Prime Agent, read `PLATFORMS.md` (beside the installed skills, or at the repo/plugin
root) and use the host's **build tier** for both phases, with its own delegate
mechanism. No delegation available → run plan then build **sequentially in one
session**, writing the design to disk before building from it.
