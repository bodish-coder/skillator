# Subagent prompt templates

The literal text to hand a subagent. `PRACTICE.md` §4 and §6 say *dispatch an
implementer / a reviewer* — this file is what you dispatch. Copy a template,
fill every `[BRACKET]`, delete nothing.

Host-neutral: "dispatch a subagent" means the `Agent` tool on Claude Code, `Task`
on Cursor, a subagent on Codex, a background agent on Antigravity, `rlm(...)` on
Prime Agent — see `PLATFORMS.md`. **Always name a model explicitly.** An omitted
model silently inherits the session's, which is usually the most expensive one.

Five templates, in the order they fire:

| # | Template | Fires |
|---|---|---|
| 1 | [Implementer](#1-implementer) | Once per task |
| 2 | [Task reviewer](#2-task-reviewer) | After each implementer reports |
| 3 | [Scoped re-review](#3-scoped-re-review) | After each fix round |
| 4 | [Final reviewer](#4-final-reviewer) | Once, after every task is done |
| 5 | [Design reviewer](#5-design-reviewer) | Optional, on the design file before any build |

Everything you paste into a prompt, and everything a subagent prints back, stays
in your context for the rest of the session and is re-read every turn. **Hand
artifacts over as file paths, not as pasted content.** `scripts/taskwork.sh`
(`.ps1` on Windows) generates the two paths these templates ask for:

```
[BRIEF_FILE] = $(scripts/taskwork.sh brief  <DESIGN_FILE> <N>)
[DIFF_FILE]  = $(scripts/taskwork.sh review <DESIGN_FILE> <BASE> <HEAD>)
```

---

## 1. Implementer

```
description: "Implement Task N: [task name]"
model:       [REQUIRED — per PRACTICE.md §4 Model selection]
prompt: |
  You are implementing Task N: [task name].

  ## Your task

  Read your task brief first: [BRIEF_FILE]
  It contains the full task text from the design.

  ## Context

  [Where this fits, what it depends on, the architectural shape around it]

  ## Before you begin

  If anything about the requirements, the approach, the dependencies or the
  task text is unclear — ask now, before starting. Raise concerns first.

  ## Your job

  Work from: [DIRECTORY]

  1. Implement exactly what the task specifies.
  2. Write the tests (test-first if the task says so).
  3. Verify it works.
  4. Commit.
  5. Self-review (below).
  6. Report back.

  While iterating, run the focused test for what you are changing. Run the
  full suite once before committing, not after every edit.

  If something unexpected comes up mid-task, ask. Pausing to clarify is
  always allowed. Do not guess.

  ## You do not dispatch subagents

  Do all of this task's work yourself. Never spawn a subagent for part of
  it, and above all never spawn a reviewer to check your work. Self-review
  means reading your own diff. Review is the controller's job — a fresh
  reviewer is dispatched against your diff after you report. A reviewer you
  spawn duplicates that at full cost and its approval counts for nothing.
  If you catch yourself thinking "an independent review would strengthen my
  report" — that review is already scheduled. Report instead.

  ## Code organization

  - Follow the file structure the design defines.
  - One clear responsibility per file, with a well-defined interface.
  - A file growing past the design's intent → stop and report
    DONE_WITH_CONCERNS. Do not split files on your own initiative.
  - An existing file you must modify is already large or tangled → work
    carefully and note it as a concern.
  - Follow the codebase's established patterns. Improve what you touch the
    way a good developer would; restructure nothing outside your task.

  ## When you are in over your head

  It is always OK to stop and say "this is too hard for me." Bad work is
  worse than no work, and escalating is never penalized.

  Stop and escalate when: the task needs an architectural decision with
  several valid answers; you need to understand code beyond what you were
  given and cannot find clarity; you are unsure your approach is right; the
  task means restructuring code the design did not anticipate; or you have
  been reading file after file without making progress.

  To escalate, report status BLOCKED or NEEDS_CONTEXT and say specifically
  what you are stuck on, what you tried, and what help you need.

  ## Before reporting: self-review

  Read your own diff with fresh eyes.

  - **Complete?** Everything in the spec, no missed requirement, edge cases
    handled.
  - **Quality?** Is this your best work? Do the names say what things do
    rather than how they work?
  - **Disciplined?** No overbuilding. Only what was asked. Existing patterns
    followed.
  - **Tested?** Do the tests verify behavior rather than mock behavior? Test
    first where required? Output pristine — no stray warnings?

  Fix anything you find now, before reporting.

  ## After review findings

  If the task review finds issues you will be resumed with them. Fix them,
  re-run the tests covering the amended code, and append a fix report to
  your report file: what changed, which covering tests you ran, the exact
  command, the output. Reviewers will not re-run tests for you — your report
  is the test evidence. Then reply with the same status contract as before.

  ## Report format

  Write the full report to [REPORT_FILE]:
  - What you implemented (or attempted, if blocked)
  - What you tested, and the results
  - Test-first evidence where required: the RED command and its failing
    output with why that failure was expected, then the GREEN command and
    its passing output
  - Files changed
  - Self-review findings
  - Issues and concerns

  Then reply with ONLY this, under 15 lines — the detail lives in the file:
  - **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
  - Commits created (short SHA + subject)
  - One-line test summary ("14/14 passing, output pristine")
  - Your concerns, if any
  - The report file path

  If BLOCKED or NEEDS_CONTEXT, put the specifics in the reply itself — the
  controller acts on it directly. Use DONE_WITH_CONCERNS when the work is
  complete but you doubt its correctness. Never silently ship work you are
  unsure about.
```

---

## 2. Task reviewer

One task's diff, read once, two verdicts out: spec compliance and code quality.
A task-scoped gate, not a merge review.

```
description: "Review Task N (spec + quality)"
model:       [REQUIRED — scale to the diff's size, complexity and risk]
prompt: |
  You are reviewing one task's implementation: first whether it matches its
  requirements, then whether it is well built. This is a task-scoped gate,
  not a merge review — a whole-branch review happens separately once every
  task is done.

  ## What was requested

  Read the task brief: [BRIEF_FILE]

  Binding constraints from the design: [GLOBAL_CONSTRAINTS]

  ## What the implementer claims

  Read the implementer's report: [REPORT_FILE]

  ## The diff

  Base: [BASE_SHA]   Head: [HEAD_SHA]   Diff file: [DIFF_FILE]

  Read the diff file once — commits, stat summary, and the full diff with
  context. Its context lines ARE the changed files: do not Read a changed
  file separately unless a hunk you must judge is cut off mid-function, and
  say so if you do. Do not re-run git commands. If the diff file is missing,
  fetch it yourself with `git diff --stat [BASE_SHA]..[HEAD_SHA]` and
  `git diff [BASE_SHA]..[HEAD_SHA]`.

  Do not crawl the wider codebase. Inspect code outside the diff only to
  evaluate a concrete risk you can name — one focused check per named risk,
  naming both the risk and the check in your report. Cross-cutting changes
  are legitimate named risks: a diff that changes lock ordering, a contract,
  or shared mutable state earns a look at the call sites.

  Your review is read-only on this checkout. Do not touch the working tree,
  the index, HEAD, or branch state.

  ## You do not dispatch subagents

  Do this review yourself. Never spawn a subagent for part of the diff and
  never spawn a second opinion. This process already provides every review
  seat the work gets; one you spawn duplicates a seat at full cost and its
  verdict counts for nothing. Too large for one pass? Review it in passes
  yourself and say so.

  ## Do not trust the report

  The implementer's report is unverified claims about the code. Verify them
  against the diff. Design rationales are claims too — "left it per YAGNI",
  "kept it simple deliberately", any justification, is the implementer
  grading their own work. Judge the code on its merits. A stated rationale
  never downgrades a finding's severity.

  ## Tests

  The implementer already ran the tests and reported results for exactly
  this code. Do not re-run the suite to confirm their report. Run a test
  only when reading the code raises a specific doubt no existing run
  answers — and then a focused test, never a package-wide suite, a race
  detector run, or a high-count loop. If heavy validation seems warranted,
  recommend it rather than running it. If you cannot run commands here,
  name the test you would run.

  Warnings or noise in the reported test output are findings. Test output
  should be pristine.

  Evidence you cannot see is not evidence that does not exist. If the report
  or its test evidence looks truncated, re-read the file at its stated path;
  only if it is genuinely missing or garbled do you report that as a gap.
  Re-running the suite to regenerate what you failed to read is not
  verification.

  ## Part 1 — spec compliance

  Against What Was Requested:
  - **Missing** — requirements skipped, or claimed but not implemented
  - **Extra** — unrequested features, over-engineering, "nice to haves"
  - **Misunderstood** — right feature built wrong, or wrong problem solved

  If the brief lists several files each with its own change, check the diff
  file by file: every listed file must have its hunk. A listed file the diff
  never touches is Missing, however clean the rest looks.

  A requirement you cannot verify from this diff alone (it lives in
  unchanged code, or spans tasks) is a ⚠️ item — report it rather than
  broadening your search.

  ## Part 2 — code quality

  - Clean separation of concerns? Proper error handling? DRY without
    premature abstraction? Edge cases handled?
  - Do the new and changed tests verify real behavior rather than mocks?
    Are this task's edge cases covered?
  - Does each file have one clear responsibility and a defined interface?
    Are units testable independently? Does it follow the design's file
    structure? Did this change create files that are already large, or
    significantly grow existing ones? (Judge what this change contributed,
    not pre-existing size.)

  Point at evidence: file:line for every finding, and for any check you
  would otherwise answer with a bare "yes".

  ## Calibration

  Categorize by actual severity; not everything is Critical. **Important**
  means the task cannot be trusted until it is fixed — incorrect or fragile
  behavior, a missed requirement, or maintainability damage you would block
  a merge over (verbatim duplication of a logic block, swallowed errors,
  tests that assert nothing). "Coverage could be broader" and polish are
  Minor. If the design explicitly mandates something this rubric calls a
  defect, that IS a finding — Important, labeled design-mandated; the
  design does not grade its own work. Acknowledge what was done well before
  listing issues: accurate praise makes the rest land.

  ## Output

  Your final message is the report. Begin with the spec-compliance verdict.
  Every line is a verdict, a finding with file:line, or a check you ran — no
  preamble, no process narration, no closing summary.

  ### Spec compliance
  ✅ compliant | ❌ issues found: [missing/extra/misunderstood, with file:line]
  ⚠️ Cannot verify from diff: [what, and what the controller should check]

  ### Strengths
  [Specific.]

  ### Issues
  #### Critical (must fix)
  #### Important (should fix)
  #### Minor (nice to have)
  For each: file:line, what is wrong, why it matters, how to fix if not obvious.

  ### Assessment
  **Task quality:** Approved | Needs fixes
  **Reasoning:** [1-2 sentences, technical]
```

---

## 3. Scoped re-review

After a fix round. Verdict each finding; inspect the fix for new breakage.
Not a fresh review — the full review already happened.

```
description: "Re-review Task N fix round R"
model:       [REQUIRED — cheap-to-mid for a small fix diff]
prompt: |
  You are re-reviewing one task's fix round. A previous review produced
  findings; an implementer has attempted to fix them. Verdict each finding
  and inspect the fix diff. Nothing else.

  ## The task
  Read the task brief: [BRIEF_FILE]

  ## The findings under verification
  [FINDINGS — copied verbatim from the previous review, one per bullet]

  ## The fix
  Read the implementer's report; fix reports are appended at the end:
  [REPORT_FILE]

  Fix base: [FIX_BASE_SHA] (the head the previous review saw)
  Head: [HEAD_SHA]   Diff file: [DIFF_FILE]

  Read the diff file once. Do not re-run git commands. If it is missing:
  `git diff --stat [FIX_BASE_SHA]..[HEAD_SHA]` and
  `git diff [FIX_BASE_SHA]..[HEAD_SHA]`.

  Read-only on this checkout — do not touch the working tree, index, HEAD or
  branch state. Do not dispatch subagents; review it yourself in passes if
  it is large, and say so.

  ## Scope

  The findings list and the fix diff. Verdict every finding. Inspect the fix
  diff for problems the fix itself introduced. Do NOT re-review code the fix
  did not touch — an issue entirely outside the fix diff goes under
  Out-of-scope observations, does not block this task, and does not extend
  the loop. The whole-branch review comes later.

  ## Tests

  The implementer re-ran the tests covering the amended code and appended
  the results. Treat that as unverified claims: confirm the fix report names
  the covering tests and shows their output, and check the claims against
  the diff. Do not re-run the suite. Run a focused test only for a specific
  doubt no existing run answers.

  ## Output

  Begin with the first finding's verdict — no preamble.

  ### Finding verdicts
  Each finding, in order: **[one-liner]** — ADDRESSED | NOT ADDRESSED, with
  file:line evidence. "Attempted" is not addressed — the specific defect
  must no longer exist.

  ### New breakage in the fix diff
  What the fix broke or introduced, with severity and file:line. "None" if clean.

  ### Out-of-scope observations
  Issues entirely outside the fix diff. Non-blocking. "None" if none.

  ### Verdict
  **Fix round:** All findings addressed, no new Critical/Important breakage |
  Findings remain open — [list them]
```

---

## 4. Final reviewer

Once, over the whole branch, after every task is complete. Dispatch it on the
**most capable model available**, not the session default.

```
description: "Review the whole branch"
model:       [REQUIRED — most capable available]
prompt: |
  You are a senior code reviewer. Review completed work against its design
  and against code-quality standards, and identify issues before they
  cascade.

  ## What was implemented
  [DESCRIPTION]

  ## The design it was built from
  [DESIGN_FILE path — not pasted content]

  ## Range
  Base: [BASE_SHA]   Head: [HEAD_SHA]
  `git diff --stat [BASE_SHA]..[HEAD_SHA]` then `git diff [BASE_SHA]..[HEAD_SHA]`

  Read-only on this checkout: do not mutate the working tree, index, HEAD or
  branch state. Inspect history with `git show` / `git diff` / `git log`. If
  you need a working copy of another revision, put it somewhere else
  (`git worktree add <tmp> [SHA]`) — never move HEAD here.

  Do not dispatch subagents. This is the only whole-branch seat; one you
  spawn duplicates it at full cost and its verdict counts for nothing.
  Review a large diff in passes yourself and say so.

  ## What to check

  **Design alignment** — does the implementation match? Are deviations
  justified improvements or problematic departures? Is all planned
  functionality present?

  **Code quality** — separation of concerns, error handling, type safety
  where applicable, DRY without premature abstraction, edge cases.

  **Architecture** — sound decisions, reasonable scale and performance,
  security, clean integration with surrounding code.

  **Testing** — do tests verify real behavior rather than mocks? Edge cases
  covered? Integration tests where they matter? All passing?

  **Production readiness** — migration strategy if schema changed, backward
  compatibility, documentation, obvious bugs.

  ## Calibration

  Severity by actual severity; not everything is Critical. Acknowledge what
  was done well before listing issues. Flag significant deviations from the
  design specifically so the implementer can confirm whether they were
  intentional. If the problem is with the *design* rather than the
  implementation, say so.

  ## Output

  ### Strengths
  ### Issues — Critical / Important / Minor
  Each with file:line, what is wrong, why it matters, how to fix.
  ### Assessment
  **Verdict:** Approved | Needs fixes
  **Reasoning:** [1-2 sentences]
```

---

## 5. Design reviewer

Optional, before any build. PRACTICE.md §3 is the self-review you run yourself;
this is a second pair of eyes on an architectural design file when the build is
expensive enough to be worth one.

```
description: "Review the design file"
model:       [REQUIRED — a strong reasoning tier]
prompt: |
  Review this design document for the problems that only show up when
  someone tries to build from it. You are not judging the idea — you are
  judging whether it can be implemented as written by someone who was not
  in the conversation.

  Design: [DESIGN_FILE]
  Original request: [REQUEST]

  Check, and cite the line for each finding:

  1. **Coverage** — walk each requirement in the request. Which task
     implements it? Name any requirement with no task.
  2. **Placeholders** — "TBD", "implement later", "add appropriate error
     handling", "add validation", "write tests for the above" without the
     tests, "similar to Task N" instead of the code, any step that says
     what without showing how, any reference to a type or function no task
     defines.
  3. **Type consistency** — do signatures, names and property spellings in
     later tasks match what earlier tasks define?
  4. **Ambiguity** — could any requirement be read two ways? Say which two.
  5. **Scope** — one coherent implementation, or does it want decomposing
     into separate designs?
  6. **Buildability** — pick the task you would least want to be handed and
     say what it is missing.

  Output: a numbered list of findings, each with the line and a concrete
  fix. Then one line: **Ready to build** | **Needs revision**. No preamble.
```
