# The task loop

How a controller drives a design's TASKS to done: one implementer per task, a
reviewer after each, a bounded fix loop, one whole-branch review at the end.
`PRACTICE.md` §4 states the rule; this is the procedure. The prompts it
dispatches are in [prompts.md](prompts.md).

**You are the controller.** You dispatch, you rule, you keep the ledger. You do
not implement and you do not review — those are seats you fill with subagents,
each with fresh context and none with your session history.

`scripts/taskwork.sh` (Windows: `taskwork.ps1`) produces the two files this loop
hands to subagents, and prints their paths so the diff never enters your context:

```
BRIEF=$(practice/scripts/taskwork.sh brief  <DESIGN_FILE> <N>)
DIFF=$(practice/scripts/taskwork.sh  review <DESIGN_FILE> <BASE> <HEAD>)
```

Both write into `.taskwork/` beside the design file — delete that directory when
the design is done. `sh practice/scripts/selftest.sh` prints `ok`.

---

## Setup, once per design

1. **Isolation** — PRACTICE.md §8. If the tasks will collide, get a worktree
   first; if they are disjoint, don't bother.
2. **Ledger** — a single append-only file beside the design file,
   `<design>-ledger.md`. One line per event: task completed, ruling made,
   finding parked. It is how a resumed session knows what already happened.
   Check it before doing anything — a ledger with entries means this design is
   already part-built, so resume rather than restart.
3. **Read the design in full**, including the tasks you will dispatch last.
4. **Pre-flight** — run PRACTICE.md §3's self-review over it now if nobody has.
   A placeholder found here costs one edit; found in task 6 it costs six.
5. **Record BASE** — `git rev-parse HEAD`. Every review package needs it.

---

## Model selection

Use the least powerful model that can do each seat. **Always name it
explicitly** — an omitted model inherits the session's, usually the most
expensive one, which defeats this entire section.

| Seat | Tier |
|---|---|
| Task text contains the complete code — transcription plus testing | cheapest |
| Single-file mechanical fix | cheapest |
| 1-2 files, complete spec | cheap |
| Multiple files, integration concerns | standard |
| Design judgement or broad codebase understanding needed | most capable |
| Task reviewer | scaled to the diff — small mechanical diff cheap, subtle concurrency change capable |
| Scoped re-review of a small fix diff | cheap-to-mid |
| **Final whole-branch review** | **most capable available, never the session default** |
| Fix rounds 4-5 | at least one tier above the implementer that got stuck |

**Turn count beats token price.** Wall-clock and context cost scale with how many
turns a subagent takes, and the cheapest models routinely take 2-3× the turns on
multi-step work — costing more overall. Mid-tier is the floor for reviewers, and
for implementers working from prose rather than from code in the task text.

`PLATFORMS.md` maps these tiers to each host's actual slugs.

---

## Batching

When the design lists several tasks that are each a small, independent edit of
the same kind — the same one-line fix, constant change or field addition across
files — **do not dispatch one agent per task.** Compose one brief listing every
file and its change, send the batch to a single subagent, and review its diff as
one unit.

Reserve one-dispatch-per-task for work that needs its own judgement, its own
tests, or its own review surface.

---

## Context hygiene

Everything you paste into a dispatch prompt, and everything a subagent prints
back, stays resident in your context for the rest of the session and is re-read
on every later turn. **Hand artifacts over as file paths.** The implementer
writes its report to a file and replies in under fifteen lines. The review
package is written to a file and never enters your context. The design file is
passed by path.

**Waiting on dispatched subagents:** never poll with short timeouts, and never
sit in one silent open-ended wait either. While you have local work — ledger
updates, packaging the next review, reading reports — keep working; results
arrive on their own. When genuinely idle, wait in bounded stretches (five to ten
minutes where the host allows), and between stretches post one line of status and
reconcile your live children: list them, chase any that finished without
reporting. A stuck or lost child is then noticed in minutes, not at the end of
the session.

---

## Per task

### 1. Dispatch the implementer

Record BASE for this task (`git rev-parse HEAD`), then
`taskwork.sh brief <design> <N>` for the brief file. Dispatch
[prompts.md §1](prompts.md#1-implementer) with that path as `[BRIEF_FILE]`.

It may come back with questions before starting — answer them and provide the
context. That is the cheapest moment in the whole loop to fix a
misunderstanding.

### 2. Handle the report

| Status | Do |
|---|---|
| `DONE` | Go to review |
| `DONE_WITH_CONCERNS` | Go to review; pass the concerns to the reviewer as named risks |
| `BLOCKED` | Provide what it is missing and resume, or re-dispatch on a higher tier, or split the task |
| `NEEDS_CONTEXT` | Give it the context; do not guess on its behalf |

Never accept a report as evidence of working code — that is what the reviewer is
for, and PRACTICE.md §5 binds you too.

### 3. Review the task

`taskwork.sh review <design> <BASE> <HEAD>` writes the commit list, the stat and
the full diff **to a file** and prints its path — the diff never enters your
context. Dispatch [prompts.md §2](prompts.md#2-task-reviewer) with the brief, the
report file, that diff file, and the design's binding constraints.

Spec ✅ and quality Approved → step 5.

### 4. The fix loop — five rounds, then a breaker

Before dispatching a fix: **does any finding conflict with the design's own
text?** If so, you rule on it — the design does not grade its own work, and the
reviewer does not overrule the design unasked. Write the ruling to the ledger and
carry it into the fix brief.

Then, per round R:

- **R ≤ 3** — resume the same implementer with the findings.
- **R ≥ 4** — fresh implementer, at least one tier up. The one that got stuck
  will stay stuck.
- After each fix, `taskwork.sh review <design> <FIX_BASE> <HEAD>` and dispatch
  [prompts.md §3](prompts.md#3-scoped-re-review) over the fix diff only.
- All findings ADDRESSED and no new Critical/Important breakage → step 5.

**At R = 5 the breaker trips.** Stop fixing and adjudicate every finding still
open, one at a time:

- **Load-bearing** (the task is wrong without it) → rule on it and continue.
  Stop and ask the user only when every path forward is a guess.
- **Not load-bearing** → park it in the ledger with your ruling and move on.

Five rounds without convergence is a signal about the *task*, not the
implementer. Say so in the ledger.

### 5. Complete

Append the completion to the ledger: task, commits, verdict, any parked
findings and their rulings. Mark it done. Next task.

---

## Final review

Every task complete → dispatch [prompts.md §4](prompts.md#4-final-reviewer) over
the whole branch, on the most capable model available. This is the seat that
catches what per-task review structurally cannot: cross-task inconsistency,
architecture drift, an interface that three tasks each implemented slightly
differently.

Findings get **one** fix dispatch and **one** scoped re-review. Adjudicate the
residuals the same way the breaker does. The final review does not loop.

Then clean up this design's workspace, and finish the branch per PRACTICE.md §8.

---

## Rationalizations

| Thought | Reality |
|---|---|
| "The task is small, I'll just do it myself" | Then it was not a task, it was a step. Fold it into a real task or do it before the loop starts — don't half-run the loop. |
| "The implementer's report says it passes" | A report is a claim. The reviewer reads the diff. PRACTICE.md §5. |
| "I'll skip review on this one, it's obviously fine" | Obviously-fine tasks pass review in one cheap pass. Skipping is how the sixth task inherits the second's mistake. |
| "One more fix round will do it" | At round five the breaker trips. Rounds six through nine have never once been the answer. |
| "I'll paste the diff so I can see it too" | Then it is in your context forever. Pass the path. |
| "I'll let the reviewer re-run the tests to be sure" | The implementer ran them and reported the output. Duplicating a suite per review is how a build costs triple. |
| "The implementer can spawn its own reviewer" | Its approval counts for nothing and costs full price. Review is the controller's seat. |
| "I'll dispatch all six implementers at once" | Only if their files are disjoint. Otherwise you are buying a merge conflict per task. |
