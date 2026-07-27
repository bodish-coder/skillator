---
name: skillator-brainstorm-build
description: >-
  Develop a feature or task using three models by strength — Fable
  (claude-fable-5) does the design thinking / brainstorm, Opus (claude-opus-4-8)
  implements the complex/core work, and Sonnet (claude-sonnet-5) handles the
  simpler/mechanical tasks. Use when the user hands over a feature/task to build
  and wants the "brainstorm with Fable, build with Opus/Sonnet" split, asks to
  "use the right model per task", or "brainstorm then build" a feature. The design
  is written to a file so it survives a planned /compact; after build + test it
  records a session .md (what / why / tests), does any rework, then prompts /clear.
  NOT for tiny one-line edits (just do them) or pure design/no-build work.
---

# Brainstorm (Fable) → Build (Opus + Sonnet) → Record → Clear

Three models, each on its strength: **Fable** is the creative model → design
thinking and brainstorming. **Opus** is the strongest coder → complex/core
implementation and final verification. **Sonnet** is the cost-efficient mid tier
→ the simpler, mechanical tasks. A skill can't change the *main* session's model,
so the split is done with **subagents** carrying explicit model overrides.

You (the main session) are the **orchestrator only** — you spawn the agents, route
each task to the right model, keep the record, and prompt the two manual
checkpoints (`/compact`, `/clear`). You do not design or write the code yourself.

## Phase 1 — Fable designs (design thinking)

Dispatch one subagent, `model: "fable"`, `subagent_type: "general-purpose"`. Give
it the task verbatim + enough repo context (paths, stack, files you've seen). Ask
it to **diverge then commit** and return an implementation-ready design **with each
task tagged by complexity**, so routing is unambiguous:

```
GOAL:         <the task in one line>
APPROACHES:   <2-3 candidates, one line each + the tradeoff>
CHOSEN:       <which, and why it wins>
DESIGN:
  - Data model / contracts: <entities, signatures, inputs→outputs>
  - Edge cases & error handling: <the ones that matter>
  - Out of scope: <what NOT to build>
TASKS:        <ordered list; tag each [SIMPLE] or [COMPLEX] + the files it touches>
VERIFICATION: <the concrete end-to-end check that proves it works>
```

**Write this design to a file** — `docs/sessions/session-<YYYY-MM-DD>-<slug>.md`
(or the scratchpad if no `docs/`). This file is the session's spine: it survives
`/compact` and `/clear`, and the build agents read it instead of relying on chat
context. Confirm the path.

## Checkpoint A — planned /compact

The design is now safely on disk, so the main thread can shed the brainstorm
tokens before the build. **Ask the user to run `/compact` now** (the skill can't
run it). Say why: "design is saved to `<path>`; compacting keeps the build lean."
Wait for them; then continue reading the design from the file.

## Phase 2 — Build (route by complexity)

Work the TASKS list. Route each task by its tag:
- **[COMPLEX] / core → `model: "opus"`** subagent.
- **[SIMPLE] / mechanical → `model: "sonnet"`** subagent.

Each build agent gets the **design file path** + its specific task(s), builds
exactly that, and stays inside its declared files. Independent tasks can run in
parallel; give parallel agents a git worktree if they'd touch the same tree.
If the design has a real blocker only the user can resolve, stop and surface it —
don't guess.

## Phase 3 — Test

Run the VERIFICATION step from the design (use an Opus agent, or the main session
if it's a quick check). Capture the **actual result** — pass/fail with evidence
(command output, a real render), never a claim. If it fails, that feeds rework.

## Phase 4 — Record the session

Append an outcome section to the same session `.md` so it captures **what / why /
tests** in one self-contained file:

```
## Outcome
- Built:     <what shipped — files changed, per task>
- Why:       <key decisions and why (pull from Fable's design + any build deviations)>
- Tests:     <the verification run + its actual result: pass/fail + evidence>
- Deviations:<where the build differed from the design, and why>
```

## Phase 5 — Rework

Address anything Phase 3 surfaced (failing tests, gaps, deviations that shouldn't
stand). Route rework the same way — [SIMPLE]→Sonnet, [COMPLEX]→Opus. Re-run the
verification, and **update the Outcome section** so the record stays true.

## Checkpoint B — /clear

Once the build is green, the record is written, and rework is done: relay a short
summary (approach, what shipped, test result, record path), then **ask the user to
run `/clear`** to reset context for the next task. The session `.md` is the
durable memory — nothing is lost by clearing.

## Rules

- **Route by the design's tags, not by vibe.** [SIMPLE]→Sonnet, [COMPLEX]→Opus,
  design→Fable. Don't send mechanical work to Opus (waste) or core logic to Sonnet.
- **The design/record file is the source of truth** — it must survive compact/clear.
  Pass the file path to agents; don't rely on chat context outliving a compact.
- **Both build phases are subagents.** Don't design or code in the main session.
- **The two checkpoints are manual.** The skill prompts; the user runs `/compact`
  and `/clear`. Never claim you ran them.
- **Autonomous within phases, honest across them.** No confirmation gate between
  design and build, but if a phase fails or an agent returns nothing, say so and stop.
- If a subagent dies / returns null, report it rather than continuing on a missing piece.
