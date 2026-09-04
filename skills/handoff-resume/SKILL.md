---
name: handoff-resume
description: >-
  Use when the user says "execute the handoff", "run the handoff", "work
  through the handoffs", "pick up the pending tasks", "resume from the handoff
  doc(s)", "do the next tasks in the handout", "process docs/handoffs", or
  wants a repeatable pass — safe to re-run or /loop — that picks up where a
  handoff left off. The execution counterpart to handoff, which writes the
  doc. NOT for writing a handoff (use handoff), and not for arbitrary tasks
  that live outside a handoff document.
---

# Handoff Resume (execute a handoff doc)

A handoff doc is a plan someone already wrote down — a status table of what's
done vs. not, and a "how to resume" list of concrete next steps. This skill is
the other half of that loop: it **reads the handout and executes the pending
work**, then records what it did back into the file so the doc stays truthful and
the next run doesn't repeat itself.

The core promise is **safe repeatability**: run it once, run it ten times, run it
on a `/loop` — each pass advances the pending tasks and leaves a marker, so a
finished handoff is never touched again and a half-done one always resumes exactly
where it stopped.

## The marker system (this is what makes re-runs safe)

Every handout this skill touches carries one machine-readable marker block,
inserted immediately **after the H1 title**. It is the single source of truth for
whether a later run should pick the file up or ignore it:

```
<!-- skillator-execute
status: in-progress        # in-progress | complete | blocked
last-run: <YYYY-MM-DD>
runs: <n>                  # how many times this skill has processed the file
remaining: <count>         # pending tasks still open (0 when complete)
note: <one line — what's left, or why blocked>
-->
```

Rules — apply them literally:

- **On discovery**, grep every candidate handout for this marker:
  - `status: complete` → **ignore it.** This is the "later runs skip the file"
    behavior. Do not read further or re-execute it.
  - `status: blocked` → skip by default, but list it in the report as needing a
    human (it stopped on a decision or an error, not on completion).
  - `status: in-progress`, or **no marker at all** → eligible; process it.
- **After executing** a file's pending tasks, rewrite the marker:
  - all tasks now DONE → `status: complete`, `remaining: 0`.
  - some tasks executed, others still open → `status: in-progress` with the real
    `remaining` count and a `note` naming what's left, so the next run resumes there.
  - stopped on a blocker (missing decision, failing step you can't fix, needs
    credentials) → `status: blocked` with the reason in `note`.
  - always bump `runs` and set `last-run` to today's date.
- **Never** mark `complete` on the basis of the chat alone. A task is done only
  when it is verified in the repo (see below). An honest `in-progress` beats a
  false `complete`.

Overrides: if the user names a specific file or passes `--force` / "redo", process
it even if marked `complete` (and reset the marker afterward). Removing the marker
by hand also makes a file eligible again — that is the intended manual reset.

## Method

### 1. Discover the handouts

Find candidate docs. Default search root is `docs/handoffs/*.md` (where
handoff writes). If the user named a path (file or directory), use that.
Also honor an obvious conventions dir if the repo uses one (e.g.
`docs/superpowers/`). Grep the marker in each and split into: **eligible**
(no marker or `in-progress`), **blocked**, and **done** (`complete`).

If nothing is eligible, say so plainly and stop — do not invent work.

### 2. Select what to run

- Default: process the **single next** eligible handout — the oldest by filename
  date / mtime, or the one the user pointed at — to completion or until blocked,
  then report and offer to continue to the next one.
- `--all` (or "work through all of them"): process every eligible handout in
  order, one fully before the next.

Announce which file(s) you selected and why before doing work.

### 3. Read the plan, don't guess it

Within the chosen handout, the pending work is whatever is **not** DONE:

- The **state table** rows marked 🟡 IN-PROGRESS, 📝 CLAIMED, or ⬜ NOT STARTED
  (handoff's legend). ✅ rows are done — leave them.
- The **"How to resume" / next-actions** section — the concrete ordered steps.
- Respect the doc's **constraints & "do not re-fix" traps** and **decisions &
  rationale** sections: do not re-litigate settled choices or retry documented
  dead ends.

Execute the pending items **in the order the doc implies** (resume steps first,
then remaining table rows). A 📝 CLAIMED item means "asserted but unverified" —
verify it against the repo before treating it as done; only actually do the work
if verification shows it isn't there.

### 4. Execute — and verify like real work

Do the tasks the way you'd do any engineering work in this repo: make the change,
run the tests/linters the doc or repo specifies, and confirm the result in the
repo (files exist, tests pass, `git status`). Ground every "done" in evidence —
a commit, a `path:line`, a passing test — exactly as the handoff itself demands.

Guardrails:

- **Stop and ask** (`AskUserQuestion`) before anything destructive, irreversible,
  or outward-facing that the doc didn't clearly authorize, and when a pending step
  is ambiguous enough that guessing risks the wrong system. Mark the file
  `blocked` with the question in `note` rather than plowing ahead.
- **Follow the repo's git rules.** If the handoff or repo prescribes a branch,
  commit style, or PR flow, honor it. Do not push or open a PR unless the doc or
  the user asks.
- If a step fails and you can't fix it, record the failure honestly in the
  marker `note` and the report; do not mark it done.

### 5. Write back — update the doc, then the marker

Keep the handout truthful so it remains a valid handoff for the next reader:

1. Update the **state table**: flip each task you completed to ✅ with its evidence
   (commit hash / `path:line` / test name), and update any 🟡 you advanced.
2. Optionally append a short **"Execution log"** entry — date, what this run did,
   and anything newly discovered — under the resume section.
3. Rewrite the **marker block** per the rules above (status, remaining, runs,
   last-run, note). The marker is the last thing you write, and it must match
   reality: `complete` only if `remaining: 0` and every item is verified.

### 6. Report

Reply with: which handout(s) you processed, the tasks completed (with evidence),
what remains and why (open / blocked), the new marker status of each file, and the
single recommended next action. If more eligible handouts remain, offer to
continue. If everything is `complete`, say the queue is drained.

## Principles

- **The marker is a contract.** `complete` means "verified done, never touch
  again"; honor it on read, earn it on write. When unsure, stay `in-progress`.
- **Verify, don't narrate.** A handoff can contain claims and abandoned ideas.
  Execute against the repo and prove results — never mark done from the chat.
- **Idempotent by design.** Re-running must never duplicate work or corrupt a
  file. Everything keys off the marker and the ✅ rows.
- **Resume, don't restart.** A partially-done handout picks up at its first
  non-DONE item, guided by the doc's own resume steps.
- **Ask at the cliffs.** Destructive, irreversible, or ambiguous-enough-to-be-
  risky → stop and ask; mark `blocked` instead of guessing.
