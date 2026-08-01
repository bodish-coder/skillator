---
name: skillator-brainstorm-build-prime
description: >-
  The top-tier "brainstorm then build" skill — Fable (claude-fable-5) does the
  design thinking / brainstorm, then Opus (the run's Opus) implements the whole
  thing, with full ceremony: the design is written to a file so it survives a
  planned /compact; after build + test it records a session .md (what / why /
  tests), does any rework, then prompts /clear — and it runs the skillator-handoff
  skill before each /compact and /clear. Use when the user wants Fable's creative
  design, Opus-quality implementation, and a durable, resumable session. For
  all-Opus with no ceremony use skillator-brainstorm-build-mid; to offload the
  simple build tasks to Sonnet use skillator-brainstorm-build-lite. NOT for tiny
  one-line edits or pure design/no-build work.
---

# Brainstorm (Fable) → Build (Opus) — with ceremony

Fable is the creative model → it does the design thinking. Opus is the strongest
coder → it does the whole implementation. A skill can't change the main session's
model, so each phase runs as a **subagent** with an explicit `model` override:
**design → Fable**, **build → Opus**. You (the main session) orchestrate only —
spawn the agents, keep the record, and prompt the two manual checkpoints
(`/compact`, `/clear`).

## Phase 1 — Fable designs (design thinking)

Dispatch one subagent, `model: "fable"`, `subagent_type: "general-purpose"`. Give it
the task verbatim + repo context. Return an implementation-ready design:

```
GOAL:         <the task in one line>
APPROACHES:   <2-3 candidates, one line each + the tradeoff>
CHOSEN:       <which, and why it wins>
DESIGN:       <data model / contracts, key edge cases, out of scope>
TASKS:        <ordered build steps + the files each touches>
VERIFICATION: <the concrete end-to-end check that proves it works>
```

**Write this design to a file** — `docs/sessions/session-<YYYY-MM-DD>-<slug>.md`
(or the scratchpad). This file is the session's spine: it survives `/compact` and
`/clear`, and the build agent reads it instead of chat context. Confirm the path.

## Checkpoint A — planned /compact

The design is safely on disk. **First run the `skillator-handoff` skill** (Skill
tool) to capture a verified handoff — never compact without one. Then **ask the user
to run `/compact` now** (the skill can't run it). Wait for them; then continue from
the design file.

## Phase 2 — Opus builds

Dispatch Opus subagent(s), `model: "opus"`, given the **design file path** + the
TASKS. Build exactly the design, stay inside the declared files. Independent tasks can
run in parallel (git worktree if they'd touch the same tree). If the design hits a
real blocker only the user can resolve, stop and surface it — don't guess.

## Phase 3 — Test

Run the VERIFICATION step (Opus agent or main session). Capture the **actual result**
— pass/fail with evidence, never a claim. Failure feeds rework.

## Phase 4 — Record the session

Append an outcome section to the same session `.md` so it captures **what / why /
tests** in one self-contained file:

```
## Outcome
- Built:     <what shipped — files changed>
- Why:       <key decisions and why (from Fable's design + any build deviations)>
- Tests:     <the verification run + its actual result: pass/fail + evidence>
- Deviations:<where the build differed from the design, and why>
```

## Phase 5 — Rework

Address anything Phase 3 surfaced (failing tests, gaps, deviations that shouldn't
stand). Re-run the verification and **update the Outcome section** so the record stays true.

## Checkpoint B — /clear

Once the build is green, the record is written, and rework is done: **first run the
`skillator-handoff` skill** to write a verified handoff — never clear without one.
Then relay a short summary (approach, what shipped, test result, record + handoff
paths) and **ask the user to run `/clear`**. The session `.md` + handoff are the
durable memory — nothing is lost by clearing.

## Rules

- **Design → Fable subagent, build → Opus subagent(s).** Don't design or code in the
  main session.
- **The design/record file is the source of truth** — it must survive compact/clear.
  Pass its path to the build agent; don't rely on chat context outliving a compact.
- **Handoff before any context loss.** Run the `skillator-handoff` skill *before*
  either checkpoint prompts `/compact` or `/clear` — never compact/clear without a
  verified handoff on disk.
- **The two checkpoints are manual.** The skill prompts; the user runs `/compact` and
  `/clear`. Never claim you ran them.
- **Autonomous within phases, honest across them.** No confirmation gate between design
  and build, but if a phase fails or an agent returns nothing, say so and stop.
- Want all-Opus with no ceremony? Use skillator-brainstorm-build-mid. Want to offload
  the simple build tasks to Sonnet? Use skillator-brainstorm-build-lite.
