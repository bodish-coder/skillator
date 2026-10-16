---
name: build-jarvis
description: >-
  Use whenever a feature is to be added, built, implemented or changed, any
  size - "add an import command", "implement F12", "support dark mode", "log
  a feature and work it" - or an F ticket is about to be worked, from the
  board or headless. Style words switch tiers inside it: "use fable",
  "cheap", "opus only", "full ceremony". NOT for a non-feature one-line edit
  (typo, comment, rename, formatting), an unexplained bug, UI craft
  (design-arwen) or design with no code.
---

# build-jarvis — every feature, graded, designed, built

The one build skill. It **is** `PRACTICE.md` §§1-6 for a feature, design
included, so nothing runs in front of it — not `superpowers:brainstorming`, not
`writing-plans`, not a second `build-*`. You are the **orchestrator**: you grade,
dispatch, rule and keep the record. Design and code run in subagents, each with
an explicit model, because a skill cannot change the main session's model.

Read **`PRACTICE.md`** first — beside `PLATFORMS.md`, at the plugin root (`../`
in the `install.sh` layout, `../../` in a checkout or the plugin cache). It owns
classification, questions, the TASKS shape, self-review, test-first, evidence
and review. Everything below assumes it.

## Step 0 — GRADE, before anything is spent

1. **Classify** spike / bounded / architectural (PRACTICE §1).
2. **Criticality.** The work is **critical** when it touches auth, money,
   concurrency, or a contract others depend on (a shared API, a file format, a
   schema). Say which word made it critical.
3. **Tier each seat** from this table — the same one as `practice/task-loop.md`
   § Model selection and `tickets-zordon`'s scout:

   | The work reads like | design | build | verify |
   |---|---|---|---|
   | One file, mechanical, the change is named | — | cheap | build |
   | 1-2 files, complete spec, nothing left to decide | — | cheap | build |
   | Several files, integration, or choices left open | deep | build | build |
   | Cause unknown, design judgement, architectural | deep | build | deep |
   | Critical (any row) | deep | build | **deep, held** |

   Critical's build seat is the **build** tier (`build=opus` on Claude Code,
   per `PLATFORMS.md`), never cheap.

   `—` = no design pass: the request or ticket *is* the spec, and you write it
   into the design file as its one task. **build is the floor** for every verify
   seat and for a build seat working from prose rather than named code.
4. **Tier → model:** read `.skillator/tiers.local.md` (written by
   `grayskull-power`'s `tiers` arm step). Missing → the first slug in your
   host's column of `PLATFORMS.md` § Role tiers, and say `tiers: defaults`.
5. **Step down, never up on your own** — the one exception is Phase 2's
   third fix round, and only with its `Ruling:` line:
   - a tier whose model the file marks `down:` → that seat goes one tier lower;
   - usage ≥ 70 % of the 5-hour window (`watch-cortana`'s `usage-watch.* level`,
     the `5h=` field) → every **non-critical** seat one tier lower; `src=none`
     → no step-down, and say `usage unobservable`;
   - never below cheap, never a verify seat below build, and a **held** seat
     keeps the highest tier still available.
   Every downgrade is a line: `Ruling: <seat> <from>-><to> - <why> - <cost if wrong>`.
6. **User words win over the table** (unavailability still wins over them):
   "use fable" / "fable designs" → design and deep seats on fable · "opus only"
   / "all opus" → every seat opus · "cheap" / "on a budget" → every
   non-critical seat one tier lower · "top tier" / "best models" → every seat
   deep · a named model → that seat on it.
7. **Your first reply text after loading this skill is the grade line** —
   before the design-file Write, before any Agent call. No confirmation gate;
   the line is there so the user can overrule before the first token is spent:

   ```
   grade: bounded · critical no · design - · build cheap=sonnet · verify build=opus · ceremony lean · usage 5h 41%
   ```

   **Printed means reply text the user sees**, starting `grade:`, before the
   design file is written or anything is dispatched. A grade worked out in your
   thinking, a `Ruling: critical no` in the design file, or a summary at the
   end is not printed — the user cannot overrule a line they never saw.

   **The line is a required input.** It is the design file's first line and
   the first line of every Agent prompt (design, build, verify), verbatim. So
   whichever spend comes first — the design-file Write *or* a design agent —
   print the line as reply text, then paste the same line into that call.

**Ceremony** is `full` when the work is architectural, has 4+ tasks, runs
inside a relay run, or is said to outlive this session ("keep going after",
"hand it over", "full ceremony"); otherwise `lean`. Full adds the session
record, the handoff checkpoint, the TRACE table and the rework loop —
**[references/ceremony.md](references/ceremony.md)**.

Grade detail, the tiers file, the unavailable-at-dispatch retry and worked
examples: **[references/grade.md](references/grade.md)**.

## Design questions — ruled or parked, never asked mid-build

- **Decidable** from the repo, the ticket, PRACTICE or a stated rule → rule it
  and write it into the design file's `## Decisions`:
  `Ruling: <what> - <why> - <cost if wrong>`.
- **Only the user can answer** (taste, a fact only they hold, a conflict nothing
  settles) → `relay-morpheus park`, and build everything that does not depend on
  it. A relay run in flight → park on its stage. A standalone build → open a
  one-stage run first so the park has a home (commands in
  [references/grade.md](references/grade.md#parking-from-a-standalone-build)).
- **The six stops** (destructive op, security-sensitive action, a side effect
  outside this worktree, the 7-day limit at 90 %, a scope breach, a failed
  repro) → ask now, alone.
- **Architectural** keeps PRACTICE §1's one approval gate after the design is
  written and reviewed — asked when the user is present, parked when the run is
  headless, chained or the user is away.
- "ask me as you go", "brainstorm with me", "let's design it together" →
  live questions instead, one at a time (PRACTICE §1); each answer still lands
  in `## Decisions`.

## Phase 1 — Design

Design seat `—` → write the design file yourself from the request. Otherwise
dispatch one design agent on the design seat's model with the request verbatim,
the repo context and `PRACTICE.md`; it writes the file and returns only its path
plus two lines:

```
grade: <the Step 0 line, verbatim - also already printed as reply text>
GOAL:         <the task in one line>
CHOSEN:       <the approach + why; architectural lists 2-3 APPROACHES first>
DESIGN:       <data model / contracts, key edge cases, out of scope>
CONSTRAINTS:  <what stays true across every task - exact values, names,
              formats; copied verbatim into every reviewer as
              [GLOBAL_CONSTRAINTS]>
TASKS:        <one block per task in PRACTICE §2 shape (Files, Interfaces,
              test-first steps with real code and commands), each tagged
              build=<tier> from the Step 0 table>
VERIFICATION: <the exact end-to-end command and its expected output>
## Decisions  <every Ruling: made so far; parked questions by Q-id>
```

Lean: `design-<YYYY-MM-DD>-<slug>.md` in the scratchpad. Full:
`docs/sessions/session-<YYYY-MM-DD>-<slug>.md`, plus the REQUIREMENTS / TRACE
slots in [references/ceremony.md](references/ceremony.md). Then self-review it
(PRACTICE §3) and fix inline. A **spike** stops at Phase 1: the probe and a
recommendation, nothing kept.

## Phase 2 — Build

One agent per task, fresh context, the **design file path** and its own task
block — never the design pasted, never this session's history (PRACTICE §4;
procedure `practice/task-loop.md`, prompt text `practice/prompts.md`). Each task
runs on its own tagged tier. Several F tickets are one pass, one task block per
ticket; each ticket's build agent implements its block only — it never loads
this skill, regrades or runs its own verify. Review each task against its block
before the next dispatch; a failed review goes to a fix agent. A third round may
go one tier up, and only with
`Ruling: <seat> <from>-><to> - reviews <1> and <2> failed: <why each failed> - <cost if wrong>`
citing both failed reviews; no Ruling, no step up. Independent tasks fan out;
same-file tasks do not.

**4+ independent tasks, a sweep, or the user asked** → run Phases 1-3 as one
workflow script (`WORKFLOW.md`): write the design file first, pass its path in
`args`, and the build stage reads each task's tier: `model: M[t.build]`.

## Phase 3 — Verify, review, relay

Run VERIFICATION through PRACTICE §5 — the command, now, in full, exit code
read — on the verify seat. Anything bigger than bounded, or critical, gets one
whole-diff review on the verify seat's tier (PRACTICE §6,
`code-review:code-review`). Failures go back through Phase 2's fix loop. Then
relay: the grade line again as the report's first line, what was built
(files), the verification evidence, every Ruling, every parked Q-id.

## Rules

- **Grade before spending.** No design file, no dispatch, before the grade
  line is printed as reply text.
- **A budget is a step-down, never a merge.** A spend cap (`--max-budget-usd`,
  "on a budget", a cost ceiling) means "cheap" — every non-critical seat one
  tier lower, said in a `Ruling:`. It never reaches critical work: critical
  keeps its deep design seat (a dispatched design agent) and its deep, held
  verify. It never folds the seats into this session:
  a subagent costs no more than the same work done here, and the orchestrator
  that builds has nobody to verify it.

| Rationalization | Reality |
|---|---|
| "I graded it — it's in my reasoning / the design file's Rulings." | Not printed. The line exists so the user can overrule it before spend; invisible, it overrules nothing. |
| "Small and obvious; the grade line is ceremony." | It is one line. Size does not waive it; `design -` already says it was small. |
| "The budget won't cover subagents, so I'll design, build and verify here." | Same tokens, minus the second pair of eyes. Step seats down; keep them separate. |
| "Critical work — safer if I do it all myself." | Critical makes verify **deep, held**: a different seat, not this one. |
| "The cap reads as cheap, so the critical design seat drops to build." | The step-down is for non-critical seats only. Critical design stays deep and dispatched. |

**Red flag:** about to Write the design file, or call Agent — a design agent
included — with no `grade:` line in your reply text yet: stop and print it
first. Critical work is no exception; it is where the overrule matters most.
- **Never an unnamed model.** An omitted model inherits the session's.
- **The design file is the handover.** Pass it by path; the orchestrator does
  not design or code, bar writing a `—`-seat design file and the record.
- **Autonomous, honest.** A phase that fails or an agent that returns nothing is
  said plainly; nothing continues on a missing piece.
- **Handoff before context loss.** About to `/compact` or `/clear` → run
  `handoff-cortana` first.

## Other hosts

`PLATFORMS.md` turns tiers into slugs and dispatch into the host's delegate
mechanism; no delegation → run the seats sequentially in one session, each
phase's output written to disk before the model switch. Per-host notes, the
seat table and the Opus-version limit: [references/platforms.md](references/platforms.md).
The `UserPromptSubmit` route hook that puts a feature prompt here on Claude
Code: [references/route-hook.md](references/route-hook.md).
