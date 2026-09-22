---
name: tasks-sentinels
description: >-
  Use when a plan's tasks are already written down and now have to be built — a
  design's TASKS list, a milestone's task blocks, a checklist of independent
  changes — and there are enough of them that doing it all in this session's
  context would crowd out the coordination. Also when the user says "work the
  plan", "execute the plan", "one agent per task", "subagent-driven", "fan out
  the tasks", or asks why an implementer keeps wandering outside its task. NOT
  for a plan that does not exist yet (`the build-* skills`), and NOT for a
  single change.
---

# Replicator Agent (one task, one fresh agent)

Ported from `superpowers:subagent-driven-development` so it exists on every host
skillator installs to, not only the one with that plugin. Named for SG-1's
replicators for the obvious reason and the cautionary one: a unit built to
build more units is only useful while something decides how many. That
something is you. **It is an entry
point, not a copy.** The procedure it runs is already in this repo, in better
shape than the upstream file — five prompt templates against three, and a fix
loop with a documented breaker. Restating it here would create a second version
to drift.

```
ONE TASK, ONE AGENT, FRESH CONTEXT, REVIEWED BEFORE THE NEXT ONE STARTS
```

An implementer that inherits your session history inherits your assumptions,
your half-abandoned approaches and your token budget. You construct exactly
what it needs instead: the design file's path, its own task, the global
constraints. Nothing else. That is what keeps it inside its task, and it is
what keeps *your* context free for the only job you cannot delegate — deciding.

## What this skill does not restate

| You need | Read |
|---|---|
| The loop itself — dispatch, report, review, fix, complete | [`practice/task-loop.md`](../../practice/task-loop.md) §Per task 1-5 |
| The three-round fix cap and its breaker | `practice/task-loop.md` §4 |
| Setup, batching, context hygiene, the final review | `practice/task-loop.md` |
| Which tier fills which seat | `practice/task-loop.md` §Model selection, then `PLATFORMS.md` for the slug you type on this host |
| The text you actually dispatch | [`practice/prompts.md`](../../practice/prompts.md) §1 implementer · §2 task reviewer · §3 scoped re-review · §4 final reviewer · §5 design reviewer |
| Why the loop is shaped this way | `PRACTICE.md` §4 |
| The brief/report/review-package plumbing | `taskwork.sh`, resolved once per `task-loop.md` §Where taskwork.sh lives |

Those paths resolve beside the installed skills (`../../`, or `../` on the
`install.sh` layout). If neither resolves, say so — do not reconstruct the loop
from memory of this table.

## Continuous execution

**Do not check in between tasks.** No "shall I continue?", no progress summary
nobody asked for. They handed you a plan; execute it.

**Six things stop you, and only these:**

1. An **irreversible or destructive** operation.
2. A **security-sensitive** action.
3. A **side effect outside this worktree** that norms say you ask about first —
   a merge, a push to a shared branch, a publish, a deploy.
4. The **7-day usage window at 90%** — `watch-cortana` fires it and its order
   ends by asking the user where to go next.
5. A **scope-contract breach** — the work has reached outside the ticket
   (`grayskull-power` §3).
6. A plan **so broken that every path forward is a guess**, or a **failed
   repro** under it.

1-3 and 6 come from upstream; 4-5 are skillator's, and `grayskull-power`
§3 **run to the end** is the same list in short form. A stop that is not on
this list is a stall.

## Rulings, not stalls

Everything else you decide. Conflicts, ambiguities, a defect in the plan, a cap
you would have asked permission to exceed. The spec binds, the plan argues for
it, and your judgement settles what neither answers. Then write it down:

```
Ruling: <what you decided> - <why> - <what it costs if wrong>
```

**In `.skillator/run.md`, not in your head and not only in the transcript** —
that is the one thing this port changes about upstream. Its ledger lives in the
session, so a dropped connection or a usage stop takes every ruling with it.
`relay-morpheus` owns that file; the stage row goes in **before** the agent is
dispatched, with the exact prompt, so an agent that dies mid-task is still
recoverable. See [`relay-morpheus`](../relay-morpheus/SKILL.md).

A wrong ruling costs rework the user can see and undo. A session parked on a
question costs their whole day and buys nothing.

## The two calls that are yours

**Does this task get its own agent?** Independent tasks fan out; tasks that
touch the same files do not (`PRACTICE.md` §4). Check the *files*, not the
plan's claim about them — a plan saying "these three are independent" while all
three land in one module is wrong, and a baseline run caught exactly that
(`practice/baselines/scenario-tasks-sentinels-v2.txt`).

**Is the report true?** A returning agent reports on itself. Review the diff
against the task's own spec first, then its quality — `practice/prompts.md` §2,
and `code-review:code-review` over the staged diff before any commit. A failed
review goes back to a **fix** agent with the finding, never forward to the next
task. `sherlock-codes` is the whole-app sweep and never runs inside an
implementer.

## Rationalizations

| Thought | Reality |
|---|---|
| "Faster if I just do this one myself" | Then you are holding the code and the coordination in one context, which is the failure this prevents. |
| "It only needs a bit of my session's context" | "A bit" is how a task ends up built on an approach you abandoned an hour ago. Construct the prompt. |
| "I'll review both tasks at the end" | Task 2 is then built on task 1's defect. Review before dispatch. |
| "The plan says they're independent" | Plans say that. Check the files. |
| "I should ask before deciding this" | Is it on the six-item list? Then it is a `Ruling:`. |
| "I'll record the rulings when I write the handoff" | The session you are guarding against does not reach the handoff. |
