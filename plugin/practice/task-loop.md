# The task loop

How a controller drives a design's TASKS to done: one implementer per task, a
reviewer after each, a bounded fix loop, one whole-branch review at the end.
`PRACTICE.md` §4 states the rule; this is the procedure. The prompts it
dispatches are in [prompts.md](prompts.md).

**You are the controller.** You dispatch, you rule, you keep the ledger. You do
not implement and you do not review — those are seats you fill with subagents,
each with fresh context and none with your session history.

`taskwork.sh` (Windows: `taskwork.ps1`) produces the two files this loop hands to
subagents, names the third — the implementer's report — and prints the paths so
the diff never enters your context.

## Where taskwork.sh lives

**Not in the user's project, and not relative to your cwd.** It ships with these
docs: the file you are reading is `<practice>/task-loop.md` and the script is
`<practice>/scripts/taskwork.sh` — always in `scripts/`, right next to this doc.

| Layout | `<practice>` |
|---|---|
| Installed by `install.sh` | `<skills-dir>/practice/` — e.g. `~/.claude/skills/practice/`, `~/.agents/skills/practice/`, `~/.codex/skills/practice/`, `~/.cursor/skills/practice/`, `~/.gemini/config/skills/practice/`, `~/.pi/skills/practice/` |
| Claude Code plugin | `~/.claude/plugins/cache/skillator/skillator/<version>/practice/` |
| A clone of the skillator repo | `<repo>/practice/` |

**Resolve it once, at setup, into an absolute path.** You know where this file is
— you just read it — so the first form is the reliable one:

```sh
TASKWORK=/absolute/path/to/practice/scripts/taskwork.sh   # dir of this doc + /scripts
```

Don't know the path of the doc you read? Search the install roots instead:

```sh
TASKWORK=$(find ~/.claude/plugins/cache/skillator ~/.claude/skills ~/.agents/skills \
  ~/.cursor/skills ~/.codex/skills ~/.gemini/config/skills ~/.pi/skills \
  -path '*/practice/scripts/taskwork.sh' 2>/dev/null | head -1)
```

Either way, confirm it before the loop starts — this prints the usage lines and
exits 2, which is proof the script is there and runnable:

```sh
sh "$TASKWORK"; echo "exit $?"
```

On Windows without a POSIX shell, use `taskwork.ps1` from the same directory:
`& "$TASKWORK.ps1" brief <DESIGN_FILE> <N>` — hence `$TASKWORK` holding the
directory-plus-name, never a bare `taskwork.sh`.

**Then call it from the project repo root**, because `review` runs `git` against
your cwd and `<DESIGN_FILE>` is resolved from your cwd:

```sh
cd /path/to/the/users/project
BRIEF=$(sh "$TASKWORK"  brief  <DESIGN_FILE> <N>)
REPORT=$(sh "$TASKWORK" report <DESIGN_FILE> <N>)
DIFF=$(sh "$TASKWORK"   review <DESIGN_FILE> <BASE> <HEAD>)
```

All three print an absolute path under `.taskwork/` beside the design file —
delete that directory when the design is done. `brief` and `review` write the
file; `report` only names it, and the implementer writes it.
`sh "$(dirname "$TASKWORK")/selftest.sh"` prints `ok`.

---

## Setup, once per design

1. **Resolve `$TASKWORK`** — the section above. Do it before anything else and
   confirm it runs; every later step calls it.
2. **Isolation** — PRACTICE.md §8. If the tasks will collide, get a worktree
   first; if they are disjoint, don't bother.
2. **Ledger** — a single append-only file beside the design file,
   `<design>-ledger.md`. One line per event: task completed, ruling made,
   finding parked. It is how a resumed session knows what already happened.
   Check it before doing anything — a ledger with entries means this design is
   already part-built, so resume rather than restart.
3. **Read the design in full**, including the tasks you will dispatch last.
4. **Lift the constraints** — copy the design's `CONSTRAINTS:` block
   (PRACTICE.md §2) out verbatim and keep it to hand. It is `[GLOBAL_CONSTRAINTS]`
   in every task reviewer dispatch and it goes into every implementer prompt; you
   paste the same text each time, unedited, so the tenth task is held to the same
   invariants as the first. The design has no `CONSTRAINTS:` block at all → that
   is a defect in the design, not a licence to invent one: send it back, or write
   the block yourself from the design body and record in the ledger that you did.
   `CONSTRAINTS: none` is a legitimate answer and means you pass "none".
5. **Pre-flight** — run PRACTICE.md §3's self-review over it now if nobody has.
   A placeholder found here costs one edit; found in task 6 it costs six.
6. **Record BASE** — `git rev-parse HEAD`. Every review package needs it.

---

## Model selection

Use the least powerful tier that can do each seat. **Always name the model
explicitly** — an omitted model inherits the session's, usually the most
expensive one, which defeats this entire section.

There are exactly three worker tiers — **cheap**, **build**, **deep** — plus the
**orchestrator**, which is you. They are the tiers defined in `PLATFORMS.md`, and
no seat below is described in any other vocabulary.

| Seat | Tier |
|---|---|
| Task text contains the complete code — transcription plus testing | cheap |
| Single-file mechanical fix | cheap |
| 1-2 files, complete spec | cheap |
| Multiple files, integration concerns | build |
| Design judgement or broad codebase understanding needed | deep |
| Task reviewer | build — go **deep** where the diff carries real subtlety (concurrency, a contract change, shared mutable state) |
| Scoped re-review of a small fix diff | build |
| **Final whole-branch review** | **deep, never the session default** |
| The escalated fix round (round 3) | one tier above the implementer that got stuck — cheap → build, build → deep |

**Turn count beats token price.** Wall-clock and context cost scale with how many
turns a subagent takes, and cheap models routinely take 2-3× the turns on
multi-step work — costing more overall. **build** is the floor for reviewers, and
for implementers working from prose rather than from code in the task text: a
seat the table puts at cheap moves up to build the moment the task text stops
carrying the code.

[`PLATFORMS.md` § Role tiers](../PLATFORMS.md#role-tiers) turns each of these
three tiers into the actual model slug for the host you are on, one column per
host. No slug there for a tier → take the closest and record the substitution.

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
`sh "$TASKWORK" brief <design> <N>` for the brief file and
`sh "$TASKWORK" report <design> <N>` for the report path. Dispatch
[prompts.md §1](prompts.md#1-implementer) with those paths as `[BRIEF_FILE]` and
`[REPORT_FILE]`, the **design file's own path** as `[DESIGN_FILE]`, the
constraints you lifted in setup as `[GLOBAL_CONSTRAINTS]`, and the absolute path
of the repo root or worktree you are running in as `[DIRECTORY]`. Keep
`[REPORT_FILE]` in the ledger: every reviewer of this task gets that same path.

The brief is one `### Task N` block and nothing else — `taskwork brief` cuts
it out of the design. That is deliberate: the implementer must not read the other
tasks. But the template holds it to the design's file structure, so it needs the
design file *by path* to check that structure and the shape around its task. Both
slots are filled, always. Passing the brief alone leaves the agent guessing at a
structure it was told to follow.

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

`sh "$TASKWORK" review <design> <BASE> <HEAD>` writes the commit list, the stat and
the full diff **to a file** and prints its path — the diff never enters your
context. Dispatch [prompts.md §2](prompts.md#2-task-reviewer) with the brief, the
`[REPORT_FILE]` you gave the implementer (from the ledger, not from its reply),
that diff file, BASE and HEAD as `[BASE_SHA]` and `[HEAD_SHA]`, and the design's
`CONSTRAINTS:` block verbatim as `[GLOBAL_CONSTRAINTS]` — the same text you gave
the implementer, so reviewer and implementer are held to one set of invariants.

Spec ✅ and quality Approved → step 5.

### 4. The fix loop — three rounds, then a breaker

Before dispatching a fix: **does any finding conflict with the design's own
text?** If so, you rule on it — the design does not grade its own work, and the
reviewer does not overrule the design unasked. Write the ruling to the ledger and
carry it into the fix brief.

Then, per round R:

- **R = 1, R = 2** — resume the same implementer with the findings.
- **R = 3** — fresh implementer, at least one tier up. The one that got stuck
  will stay stuck. This is the last round.
- After each fix, `sh "$TASKWORK" review <design> <FIX_BASE> <HEAD>` and dispatch
  [prompts.md §3](prompts.md#3-scoped-re-review) over the fix diff only — the
  brief, the task's `[REPORT_FILE]` (fix reports are appended to it), the
  previous review's findings verbatim as `[FINDINGS]`, and FIX_BASE and HEAD as
  `[FIX_BASE_SHA]` and `[HEAD_SHA]`.
- All findings ADDRESSED and no new Critical/Important breakage → step 5.

**After round 3 the breaker trips.** There is no round 4. This is PRACTICE.md
§7's three-fix rule applied to the loop, and the reasoning is the same one: three
attempts that do not converge is not a failing implementer, it is a wrong design.
Stop fixing and adjudicate every finding still open, one at a time:

- **Load-bearing** (the task is wrong without it) → rule on it and continue.
  Stop and ask the user only when every path forward is a guess.
- **Not load-bearing** → park it in the ledger with your ruling and move on.

Say so in the ledger, in those terms: three rounds without convergence is a
signal about the *task*, and if the ruling you had to make touched the design's
own shape, say that too — §7 wants the architecture questioned at exactly this
point.

### 5. Complete

Append the completion to the ledger: task, commits, verdict, any parked
findings and their rulings. Mark it done. Next task.

---

## Final review

Every task complete → dispatch [prompts.md §4](prompts.md#4-final-reviewer) over
the whole branch, on the **deep** tier. This is the seat that
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
| "One more fix round will do it" | After round three the breaker trips — PRACTICE.md §7's count, same rule. Round four has never once been the answer. |
| "I'll paste the diff so I can see it too" | Then it is in your context forever. Pass the path. |
| "I'll let the reviewer re-run the tests to be sure" | The implementer ran them and reported the output. Duplicating a suite per review is how a build costs triple. |
| "The implementer can spawn its own reviewer" | Its approval counts for nothing and costs full price. Review is the controller's seat. |
| "I'll dispatch all six implementers at once" | Only if their files are disjoint. Otherwise you are buying a merge conflict per task. |
