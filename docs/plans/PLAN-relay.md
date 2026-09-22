# PLAN — relay: staged workflows that survive sessions

**Status:** stage 0 done · **Revive with:** `skillator:handoff-resume` or just
say *"continue the relay plan"* — read this file top to bottom, find the first
stage not `[x]`, and start there. Nothing else is needed from a previous session.

**Board:** F14–F19 in `TICKETS.md`. **Owner skill once built:** `skillator:relay`.

---

## Why

Six asks from the user, 2026-09-22:

1. Staged workflows run **continuously** — no "shall I continue?" between stages.
2. The only stop is the **weekly (7-day) limit at 90%** → handoff → ask for the
   next direction **with recommendations**.
3. **Subagent-driven development is the default**; port
   `superpowers:subagent-driven-development` into a skillator skill.
4. **Monitor** running workflows and agents — network loss must not silently
   orphan them; detect, resume, restart in the worst case.
5. **Between-session handling** of a staged run must be better than it is.
6. **grayskull makes the rules** — this lands as grayskull ground rules plus a
   skill it routes to.

## What already exists (do not rebuild)

| Piece | Owns |
|---|---|
| `WORKFLOW.md` | workflow mode, phase→script mapping, host table. `resumeFromRunId` is **same-session only** — that is the hole. |
| `skills/handoff-watch` | statusLine `probe` + `Stop` `gate`, threshold, 3-step preserve order. Takes the **max** of 5h/7d/context — user wants the 7-day window to be the hard stop. |
| `skills/handoff` · `handoff-resume` | writing and executing a handoff doc. |
| `skills/brainstorm-build-*` | design→build phases, task blocks, `TRACE:`/`SATISFIES:`. |
| `skills/ticket-master` | `TICKETS.md`, workflow mode at 4+ open. |

The gap is a **durable run file** that outlives the session, plus the rules that
say to keep going and the monitoring that notices when an agent died.

---

## Stages

Each stage is independently committable. Tick the box here when it lands.

### [x] S0 — this plan + tickets  (F14)
`docs/plans/PLAN-relay.md` (this file) and F14–F19 on the board.

### [x] S1 — RED first  (gates F15 and F17)
`PRACTICE.md` §4/§5 and `skill-smith` bind this: **no skill without a failing
test first**. Two scenarios in `practice/baselines/`, built and run with
`practice/scripts/baseline-harness.sh`:

- `scenario-relay.txt` — an agent given a multi-stage plan and told its session
  may end mid-run. **FAIL** = it executes without leaving durable, stage-level
  state on disk, so a fresh session cannot tell what landed or what was in
  flight. **PASS** = it writes a run ledger unprompted.
- `scenario-relay-resume.txt` — a *fresh, isolated* session handed only the
  repo, mid-run. **FAIL** = it re-does finished work, or declares the run
  complete, or asks the user to reconstruct it.

**Run 2026-09-22. Verdicts in the scenario files.**
- `scenario-relay.txt` — **VIOLATED 3/3.** No run wrote stage state while
  working; run 3's tool ordering shows PLAN.md written once, last, after every
  stage's code. Earns the ledger.
- `scenario-relay-resume.txt` — **COMPLIED.** Against "the checkboxes are the
  source of truth", the run checked the tree, found stage 2 half-built, said
  so, and filled it before moving on. **The resume half is not earned and is
  not being written** — relay teaches writing state down, not reading a tree.

Host note: the auto-mode classifier here refuses a nested `claude` with
`--permission-mode bypassPermissions`, so runs used `acceptEdits`. pytest was
denied inside every run; that limits the verification half of the scenarios,
not the rule they tested. Both recorded in the scenario files.

### [x] S2 — `skillator:relay` skill + run file  (F15)
`skills/relay/SKILL.md`. Defines `.skillator/run.md` — the durable, human-readable
run ledger, committed or gitignored per repo:

- run id, the plan file it executes, created/updated timestamps
- one row per stage: `[ ] / [~] / [x] / [!]`, owner agent, last heartbeat
- in-flight registry: agent name/id, the **exact prompt to redispatch it**,
  what it had produced when last seen
- `Ruling:` lines (from subagent-driven-development) appended, never rewritten

Rule: **the run file is written before dispatch, not after** — an agent that
dies before reporting is still recoverable. This one rule is the whole earned
surface; S1's resume scenario says agents already read a mid-run tree
correctly, so relay says nothing about that.

### [x] S3 — monitoring + restart  (F16)
`skills/relay/hooks/relay.sh` + `relay.ps1` (mirror pair, like handoff-watch):
`relay init|stage|heartbeat|status|orphans`. `orphans` lists stages `[~]` with a
heartbeat older than N minutes — those are the network-loss casualties. The model
reads `orphans`, redispatches from the stored prompt, and never double-commits
(stage rows are idempotent by id).
Also: a `SessionStart` hook line that prints open relay runs, so a fresh session
sees the run without being told.

### [-] S4 — `skillator:subagent-drive`  (F17) — NOT WRITTEN, and that is the finding
**No valid RED exists, so no skill was written** — `skill-smith` §5 reason 3,
the F12/F13 precedent. Two scenarios, both void:

- `scenario-subagent-drive.txt` — the prompt forbade subagents ("don't go
  burning tokens on them") and the run obeyed. Correct: user instructions
  outrank skills. A scenario that forbids what it tests cannot discriminate.
- `scenario-subagent-drive-v2.txt` — pressure removed; 2 runs, 0 spawned, and
  run 1 was right to decline: the fixture's "independent" stages all land in
  `notekeep/cli.py`, which `PRACTICE.md` §4 says is exactly when not to fan
  out. **The fixture is the defect**, not the model.

What was done instead: the discipline is a **project rule**, not a skill —
`skill-smith` §1 puts project-specific rules in the always-on file, and this
repo's is `.skillator/grayskull.md`, which S6 amends. The procedure it needs
already exists here (`PRACTICE.md` §4, `practice/task-loop.md`,
`practice/prompts.md`); a 568-line port would have duplicated it.

**To test this properly**, a future session needs a fixture whose stages live
in genuinely separate modules with no shared file. That is the whole remaining
cost, and F17 stays open for it.

### [x] S5 — handoff-watch: weekly 90% hard stop  (F18)
- per-window thresholds instead of one max: 7-day ≥ 90% is the hard stop;
  5-hour and context keep their current advisory behaviour.
- preserve order gains **step 4**: after the handoff doc, `AskUserQuestion`
  with concrete next-direction options and a recommendation, not prose.
- update `hooks/usage-watch.{sh,ps1}` and `selftest.ps1` together — mirror pair.

### [x] S6 — grayskull-power rules  (F19)
`skills/grayskull-power/SKILL.md`:
- §1 arming gains `relay` (open runs) beside `handoff-watch`.
- §2 routing: "a multi-stage build that must survive sessions" → `relay`;
  "executing a plan with independent tasks" → `subagent-drive`.
- §3 ground rules gain two lines:
  - **Subagent-first.** Independent tasks get a fresh implementer each; the
    orchestrator holds context, not code.
  - **Run to the end.** A staged run does not stop for approval between stages.
    It stops for: the 7-day limit at 90%, a scope-contract breach, a failed
    repro, or the plan being done. Everything else is a `Ruling:`.
- Depth goes in `references/`, not the always-on file (A8 budget).

### [ ] S7 — GREEN + ship  (closes F14–F19)
Re-run S1's two scenarios with the skills **loaded** (`green-relay*.txt`):
the fresh session must resume from `.skillator/run.md` alone, with no re-done
work. Plus `relay.{sh,ps1}` selftest, `check-tickets.sh`, regression sweep,
`code-review:code-review` over the staged diff, commit.

---

## Standing decisions (do not relitigate)

- One new skill (`relay`) + one ported skill (`subagent-drive`) + edits to
  `handoff-watch` and `grayskull-power`. No new top-level docs beyond this plan.
- Run state is **a markdown file in the repo**, not a database and not
  `resumeFromRunId` — it must be readable by a human and by any host.
- Windows + POSIX script pair for anything executable, always both.
