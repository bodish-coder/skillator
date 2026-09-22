# PLAN — relay: staged workflows that survive sessions

**Status:** stage 0 done · **Revive with:** `skillator:resume-cortana` or just
say *"continue the relay plan"* — read this file top to bottom, find the first
stage not `[x]`, and start there. Nothing else is needed from a previous session.

**Board:** F14–F19 in `TICKETS.md`. **Owner skill once built:** `skillator:r2d2-relay`.

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
| `skills/handoff` · `resume-cortana` | writing and executing a handoff doc. |
| `skills/brainstorm-build-*` | design→build phases, task blocks, `TRACE:`/`SATISFIES:`. |
| `skills/ticket-master` | `TICKETS.md`, workflow mode at 4+ open. |

The gap is a **durable run file** that outlives the session, plus the rules that
say to keep going and the monitoring that notices when an agent died.

---

## Stages

Each stage is independently committable. Tick the box here when it lands.

### [x] S0 — this plan + tickets  (F14)
`docs/plans/PLAN-r2d2-relay.md` (this file) and F14–F19 on the board.

### [x] S1 — RED first  (gates F15 and F17)
`PRACTICE.md` §4/§5 and `skill-smith` bind this: **no skill without a failing
test first**. Two scenarios in `practice/baselines/`, built and run with
`practice/scripts/baseline-harness.sh`:

- `scenario-r2d2-relay.txt` — an agent given a multi-stage plan and told its session
  may end mid-run. **FAIL** = it executes without leaving durable, stage-level
  state on disk, so a fresh session cannot tell what landed or what was in
  flight. **PASS** = it writes a run ledger unprompted.
- `scenario-r2d2-relay-resume.txt` — a *fresh, isolated* session handed only the
  repo, mid-run. **FAIL** = it re-does finished work, or declares the run
  complete, or asks the user to reconstruct it.

**Run 2026-09-22. Verdicts in the scenario files.**
- `scenario-r2d2-relay.txt` — **VIOLATED 3/3.** No run wrote stage state while
  working; run 3's tool ordering shows PLAN.md written once, last, after every
  stage's code. Earns the ledger.
- `scenario-r2d2-relay-resume.txt` — **COMPLIED.** Against "the checkboxes are the
  source of truth", the run checked the tree, found stage 2 half-built, said
  so, and filled it before moving on. **The resume half is not earned and is
  not being written** — relay teaches writing state down, not reading a tree.

Host note: the auto-mode classifier here refuses a nested `claude` with
`--permission-mode bypassPermissions`, so runs used `acceptEdits`. pytest was
denied inside every run; that limits the verification half of the scenarios,
not the rule they tested. Both recorded in the scenario files.

### [x] S2 — `skillator:r2d2-relay` skill + run file  (F15)
`skills/r2d2-relay/SKILL.md`. Defines `.skillator/run.md` — the durable, human-readable
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
`skills/r2d2-relay/hooks/r2d2-r2d2-relay.sh` + `r2d2-relay.ps1` (mirror pair, like handoff-watch):
`relay init|stage|heartbeat|status|orphans`. `orphans` lists stages `[~]` with a
heartbeat older than N minutes — those are the network-loss casualties. The model
reads `orphans`, redispatches from the stored prompt, and never double-commits
(stage rows are idempotent by id).
Also: a `SessionStart` hook line that prints open relay runs, so a fresh session
sees the run without being told.

### [x] S4 — `skillator:replicator-agent`  (F17) — shipped as an entry point
Both REDs are void and stay recorded as such — `scenario-replicator-agent.txt`
forbade subagents in its own prompt, and v2's fixture put four "independent"
stages in one file. **The fixture is the defect.** The first pass then declined
to write the skill at all, which was wrong: `skill-smith` ranks a direct user
request above its own test-first rule, and the port was directly requested.
Reopened and shipped the same day.

**Entry point, not a copy** — ~120 lines, not 568. `practice/task-loop.md` and
`practice/prompts.md` already hold the procedure and hold it better (five
prompt templates to upstream's three; a three-round fix cap with a breaker), so
the skill routes to them. What it adds:

- one task, one fresh agent, a constructed prompt, never the session history
- **six** stop conditions, not four — the port caught that S6's list omitted
  *destructive operations* and *security-sensitive actions*, so "run to the
  end" read as licence to run a destructive command unasked. Fixed in all
  four copies of the list.
- `Ruling:` lines written to `.skillator/run.md`, so they survive the session
  that upstream's in-session ledger does not

Why it has to exist at all rather than deferring to the upstream skill:
skillator installs to Cursor, Codex, Antigravity and Pi, where `superpowers`
is not present. Evidence debt tracked as **A76**, not as a blocker.

### [x] S5 — watch-cortana: weekly 90% hard stop  (F18)
- per-window thresholds instead of one max: 7-day ≥ 90% is the hard stop;
  5-hour and context keep their current advisory behaviour.
- preserve order gains **step 4**: after the handoff doc, `AskUserQuestion`
  with concrete next-direction options and a recommendation, not prose.
- update `hooks/usage-watch.{sh,ps1}` and `selftest.ps1` together — mirror pair.

### [x] S6 — grayskull-power rules  (F19)
`skills/grayskull-power/SKILL.md`:
- §1 arming gains `r2d2-relay` (open runs) beside `watch-cortana`.
- §2 routing: "a multi-stage build that must survive sessions" → `r2d2-relay`;
  "executing a plan with independent tasks" → `replicator-agent`.
- §3 ground rules gain two lines:
  - **Subagent-first.** Independent tasks get a fresh implementer each; the
    orchestrator holds context, not code.
  - **Run to the end.** A staged run does not stop for approval between stages.
    **Six** things stop it, not the four first written here: a destructive op ·
    a security-sensitive action · a side effect outside this worktree · the
    7-day limit at 90% · a scope breach · a failed repro. Everything else is a
    `Ruling:`. S4 corrected this; the four-item version shipped in one commit
    and read as licence to run a destructive command unasked.
- Depth goes in `references/`, not the always-on file (A8 budget).

### [x] S7 — GREEN + ship  (closes F14–F16, F18, F19)
`practice/baselines/green-r2d2-relay.txt`. **Body PASSES** — the run wrote the
documented ledger, put paths in `landed` rather than a claim, and recorded the
verification gap as a `Ruling:` instead of prose. **Description PASSES** on the
same situation with the counter-pressure sentence removed: relay auto-invokes
and writes the ledger unprompted.

**It does not invoke with that sentence present (2/2)** — and the cause is the
competing instruction, not the description, proved by the clean run. Since the
sentence is a direct user prohibition ("don't write status files"), obeying it
is correct and no description edit was made. Filed as **A74**: a scenario
pressured to the point where obedience is the right answer stops discriminating
— fine for a RED whose claim is "nothing gets written", fatal for a GREEN.

Sweep: `check-tickets`, `check-grayskull-sync`, `baseline-harness selftest`,
`r2d2-relay.sh selftest`, `r2d2-relay.ps1 selftest`, `handoff-watch selftest`, plus a
cross-mirror round trip. **A75** filed for the harness's `bypassPermissions`
command, which this host's classifier refuses.

---

## Standing decisions (do not relitigate)

- One new skill (`r2d2-relay`) + one ported skill (`replicator-agent`) + edits to
  `watch-cortana` and `grayskull-power`. No new top-level docs beyond this plan.
- Run state is **a markdown file in the repo**, not a database and not
  `resumeFromRunId` — it must be readable by a human and by any host.
- Windows + POSIX script pair for anything executable, always both.
