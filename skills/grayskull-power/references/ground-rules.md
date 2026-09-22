# Ground rules — grounding, scope, and the pre-commit gate

The laws are in SKILL.md §3. This is how each one is carried out.

## Ground it before you remedy

**No presumption.** A fix for code you have not read is a guess, and a guess that
half-lands is how one bug becomes three `A` tickets.

1. **Reproduce first.** No failing test, failing command, or copied error text →
   no remedy. A fix for a bug you cannot trigger is untestable by definition.
   Cannot reproduce (needs hardware, a device, a build)? Say so and ticket it —
   do not fix blind.
2. **Read the source of truth** — the actual file, the actual error, the actual
   upstream docs. Not memory of how the library "usually" behaves. The map is
   second-hand; a stale index lies confidently, so code beats graph on conflict.
3. **Map before you cut.** `codegraph explore "<area>"` for the lay of the land,
   `codegraph callers <symbol>` and `codegraph impact <symbol>` for who breaks.
   `understand-anything:understand` for architecture, `graphify` for a repo-wide
   graph, `claude-mem:mem-search` for "have we hit this before".
4. **Tag every claim** — `verified` (you ran it or read it), `inferred` (follows
   from what you read), `guessed` (neither). One word, in the diagnosis. A
   `guessed` root cause never justifies an edit; go back to step 1.

State the blast radius in one line before editing — **no line, no edit**:

```
foo() → impact: 3 callers (a.ts:40, b.ts:12, worker.ts:88) · no schema change · affected tests: 2 of 3 · verified
```

**The consequence, because a rule without one is decoration.** Gathering the
callers in your head and skipping the line does not count — a tested agent did
exactly that and called itself compliant. If you reach the edit and the line is
not in your visible output, you have two moves and neither is "proceed": write it
now from what you actually checked, or, if you cannot fill a field without
guessing, say which field and go back to step 3 above (map before you cut). A
blast-radius line written *after* the edit is a report, not a check, and must be
labelled as one. The same holds for §1's state line: unannounced means unarmed.

## Scope contract

Every ticket names the files it may touch, before work starts. Then:

- **Two-file rule** — a fix spanning more than 2 unrelated files stops and asks
  via `AskUserQuestion`. Needing a second unrelated file to stay correct is a
  design problem, not a bigger diff.
- **Out-of-contract file** → new ticket, not a wider commit. That is the whole
  point of the board.
- **Smallest change that fixes the cause** and breaks nothing downstream.
  Refactoring while fixing hides the fix inside the noise.

## Before a commit — sweep, then review the diff

**Regression sweep first.** The blast-radius line is worthless if nobody checks
it afterwards. Run the callers you named, plus `codegraph affected <changed
files>` for the tests that cover them. Green, or the fix is not done.

Then **`code-review:code-review` over the staged diff** — the cheap, correct tool
for a working diff, and the one `audit-sherlock` itself points at for this job.
Scope it to the files in this commit (`git diff --cached --name-only`), so a
finding is about this change and not the file's whole history. Loop:

1. Findings? Fix them, re-stage, run it again.
2. Real but out of scope → `A` ticket via `tickets-zordon`, then commit.
3. Clean → commit, then `codegraph sync` so the map matches the tree.

Cap at 3 passes. Still surfacing new findings on the third → stop and
`AskUserQuestion`. Never commit past a finding by declaring it unrelated.

**`audit-sherlock` is the whole-app sweep, not a per-commit gate.** Run it
before a release or handover, on a repo with unknown-cause rot, or when the user
asks for it by name. It is a Fable fan-out over the entire codebase; wiring it
into every commit both burns the budget and is impossible for an implementer
subagent that has been told not to spawn subagents of its own.

**Revert first.** A fix that caused a regression gets reverted before it gets
re-fixed. Never stack a fix on a broken fix — that is how a one-line bug becomes
an afternoon.

## Blocked? Ask properly

Anything that stops for the user — a decision, a missing fact, an approval —
uses `AskUserQuestion`, never a plain paragraph of prose. Every option carries:

- **what it does** — the concrete change, in one line
- **where it hurts** — the cost, risk, or thing it rules out
- **(Recommended)** on the first option, which is the one you'd pick

If the choice needs more than a chip's worth of context to judge — a layout, a
diff, a table of trade-offs, a plan, competing designs — build it as an
**artifact** first (load `artifact-design`), hand it over, then ask. Terminal
scrollback is not where a decision gets made.

**Keep artifacts local.** Write the HTML to a file in the repo or scratchpad and
give the user the path — do not call the `Artifact` tool. Publishing puts the
page on claude.ai; only do that when the user asks for a link or says to share
it.

## Run to the end

A staged plan stops for exactly six things:

1. An **irreversible or destructive** operation.
2. A **security-sensitive** action.
3. A **side effect outside this worktree** that norms say you ask about first —
   a merge, a push to a shared branch, a publish, a deploy.
4. The **7-day** usage window at 90% — `watch-cortana` fires it, and its order
   ends with `AskUserQuestion` for the next direction. The 5-hour window is a
   pause, not a stop; it gets the three-step preserve and nothing more.
5. A **scope-contract breach** — the work has reached outside the ticket.
6. A **failed repro**, or a plan so broken every path forward is a guess.

Plus the obvious one: the plan being **done**. 1-3 are the upstream
`subagent-driven-development` list, and they are the half an earlier draft of
this section left out — "run to the end" was never licence to run a destructive
command unasked.

Nothing else. "Shall I continue?" between stages, a progress summary nobody
asked for, a clarifying question whose answer you could decide — those are
stalls. The spec is the binding authority, the plan is its argument, and your
judgement settles what neither answers. Write the decision down instead:

```
Ruling: <what you decided> - <why> - <what it costs if wrong>
```

in `.skillator/run.md`, appended, never rewritten. A wrong ruling costs rework
the user can see and undo. A stall costs the whole session's momentum and
tells them nothing.

**Before the stage, not after it.** The run file is written when the stage is
dispatched, with the exact prompt that was sent. Three isolated baseline runs
executed a four-stage plan and wrote nothing to disk until the last write
(`practice/baselines/scenario-relay-morpheus.txt`), which is the failure `relay-morpheus` exists
to stop: a session that ends mid-run leaves a tree full of diff and no record
of which stage produced it.

Independent tasks go to a fresh implementer each — one task per agent, a
constructed prompt, never the session history (`PRACTICE.md` §4). Tasks that
touch the same files do not fan out; that is `scenario-tasks-sentinels-v2.txt`,
where a run correctly refused to parallelise three stages that all landed in
the same file. `skillator:tasks-sentinels` is that loop's entry point, and
`practice/task-loop.md` + `practice/prompts.md` are the loop itself.
