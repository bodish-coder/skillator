---
name: skillator-brainstorm-build-prime
description: >-
  Top-tier "brainstorm then build" — a design-tier model does creative design
  thinking, a build-tier model implements, with full ceremony: design written to
  disk (survives context loss), handoff before checkpoints, session .md record,
  rework, then clean session reset. Works across Claude Code, Cursor, Codex,
  Antigravity, Pi, and Prime Agent
  via role tiers and platform adapters (see references/platforms.md). On Claude
  Code: Fable designs, Opus builds, auto /compact and /clear after handoff. On
  Cursor: GPT-5.6-Sol designs, Claude Opus builds, fresh-chat checkpoints. On Codex:
  GPT-5.6-Sol high-reasoning design pass then Sol build, auto-compaction aware.
  For all-Opus without ceremony use skillator-brainstorm-build-mid; for Sonnet
  offload use skillator-brainstorm-build-lite. NOT for tiny one-line edits or
  pure design/no-build work.
---

# Brainstorm (design tier) → Build (build tier) — with ceremony

**Design tier** does creative design thinking. **Build tier** is the strongest
coder and implements the whole thing. A skill cannot change the main session's
model, so each phase runs as a **subagent** (or platform-equivalent delegation)
with an explicit model override. You (orchestrator) spawn agents, keep the
record, and run context checkpoints automatically where the platform allows.

## Step 0 — Platform & models

1. Read `references/platforms.md` in this skill's directory (and the root
   `PLATFORMS.md` it points to for the generic mechanics).
2. Detect platform — claude-code · cursor · codex · antigravity · pi ·
   prime-agent — using the signals there.
3. Note the **design** and **build** model slugs / overrides for this run.
4. If the user named models or a platform, those override the defaults — record
   them in the session file header.

---

## Phase 1 — Design tier designs

Dispatch one **design-tier** agent (see platforms.md). Give it the task verbatim
+ repo context. Return an implementation-ready design:

```
GOAL:         <the task in one line>
APPROACHES:   <2-3 candidates, one line each + the tradeoff>
CHOSEN:       <which, and why it wins>
DESIGN:       <data model / contracts, key edge cases, out of scope>
TASKS:        <ordered build steps + the files each touches>
VERIFICATION: <the concrete end-to-end check that proves it works>
```

**Write this design to a file** — `docs/sessions/session-<YYYY-MM-DD>-<slug>.md`
(or the scratchpad). This file is the session's spine: it survives context loss,
and the build agent reads it instead of chat context. Confirm the path.

Include a short header in that file:

```
PLATFORM: <detected platform>
DESIGN_MODEL: <model used>
BUILD_MODEL: <model planned for Phase 2>
```

---

## Checkpoint A — planned context trim

The design is safely on disk.

1. **Run the handoff skill** using the platform's method (platforms.md) —
   `skillator-handoff` — to capture a verified handoff. Never trim context
   without one.
2. **Run Checkpoint A** — the row for your host in `references/platforms.md`
   (Claude Code compacts itself; every other host either auto-compacts or needs
   the user to start a fresh turn/session).

Continue from the design file, not chat memory.

---

## Phase 2 — Build tier builds

Dispatch **build-tier** agent(s) (platforms.md), given the **design file path** +
TASKS. Build exactly the design, stay inside the declared files. Independent
tasks can run in parallel (git worktree if they'd touch the same tree). If the
design hits a real blocker only the user can resolve, stop and surface it — don't
guess.

---

## Phase 3 — Test

Run the VERIFICATION step (build agent or orchestrator). Capture the **actual
result** — pass/fail with evidence, never a claim. Failure feeds rework.

---

## Phase 4 — Record the session

Append an outcome section to the same session `.md`:

```
## Outcome
- Built:     <what shipped — files changed>
- Why:       <key decisions and why (from design + any build deviations)>
- Tests:     <verification run + actual result: pass/fail + evidence>
- Deviations:<where the build differed from the design, and why>
```

---

## Phase 5 — Rework

Address anything Phase 3 surfaced. Re-run verification and **update the Outcome
section** so the record stays true.

---

## Checkpoint B — clean session

Once the build is green, the record is written, and rework is done:

1. **Run `skillator-handoff`** again (platform method).
2. Relay a short summary (approach, what shipped, test result, record + handoff
   paths).
3. **Run Checkpoint B** — the row for your host in `references/platforms.md`
   (Claude Code clears itself; elsewhere prompt the user for a new chat/session).

The session `.md` + handoff are the durable memory — nothing is lost by clearing.

---

## Rules

- **Design → design-tier agent, build → build-tier agent(s).** Don't design or
  code in the orchestrator session (except writing the session record).
- **The design/record file is the source of truth** — pass its path to build
  agents; don't rely on chat context outliving a compact/trim.
- **Handoff before any context loss.** Run `skillator-handoff` before either
  checkpoint — never compact/clear/reset without a verified handoff on disk.
- **Checkpoints: auto on Claude Code, manual elsewhere.** On Claude Code, you
  invoke `/compact` and `/clear` yourself after handoff. Everywhere else follow
  platforms.md (prompt the user when the host cannot clear context for you).
  If a slash command fails or is unavailable, say so and ask the user once.
- **Use host-native dispatch.** Agent tool, Task tool, background subagents,
  `rlm(...)` — per platforms.md, never a tool that isn't available. Where the
  host has no delegation at all, run the phases sequentially in-session with the
  design file as the handover, and say so.
- **Autonomous within phases, honest across them.** No confirmation gate between
  design and build, but if a phase fails or an agent returns nothing, say so and
  stop.
- Want all-build-tier with no ceremony? Use skillator-brainstorm-build-mid. Want
  to offload simple build tasks to a fast tier? Use skillator-brainstorm-build-lite.
