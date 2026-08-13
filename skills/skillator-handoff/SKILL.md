---
name: skillator-handoff
description: >
  Generate an in-depth, verified session-handoff document (a Markdown file) so a
  different person or AI can continue the work with zero loss of context, plan, or
  intent. Use when the user asks to "hand off", "write a handoff", "create a
  handoff doc", "document where we are", "prepare for the next session/person",
  or wants a continuity/checkpoint summary of the current session. Reads the whole
  conversation, VERIFIES done-vs-not-done against the actual repo (git, files,
  tests) rather than trusting claims, and captures the reasoning behind decisions
  so the thread of thought survives the handoff.
---

# Session Handoff

Produce a single, self-contained Markdown handoff document that lets the next
worker (human or AI) resume **exactly where this session left off** — with the
same understanding of what is done, what remains, why choices were made, and what
to do next. The output must prevent loss of plan or intent.

## Prime directive: verify, don't narrate

A handoff that just recounts the chat is dangerous — the chat contains intentions,
abandoned ideas, and claims that may not match reality. **Ground every
"done" against the repo.** Before writing a status, confirm it:

- `git log --oneline -20` and `git status --short` — what actually landed vs. what
  is uncommitted/dirty vs. only discussed.
- Read/`ls`/`grep` the files a claim depends on — does the module/route/setting
  actually exist? (Absence of evidence ≠ done.)
- Run or locate the tests that would prove a claim; note pass/fail. If you can't
  run them, say so — never imply verification you didn't do.

Classify every item as one of: **DONE (verified)**, **CLAIMED (asserted in chat
but not confirmed in repo)**, **IN-PROGRESS (partial / uncommitted)**, or
**NOT STARTED**. Never collapse CLAIMED into DONE.

## Method

1. **Reconstruct the goal.** Re-read the session from the top. State the original
   objective and any scope changes in the user's own terms. Distinguish the
   *mission* (why) from the *tasks* (what).
2. **Inventory the work.** List everything attempted. For each, assign a status
   from the four above **with evidence** (commit hash, file path:line, test name,
   or "asserted in chat, unverified").
3. **Capture the reasoning.** For every non-obvious decision: what was chosen,
   what was rejected, and *why*. This is what prevents the next worker from
   re-litigating settled questions or repeating dead ends. Pull rationale out of
   the conversation — it is the most perishable, highest-value content.
4. **Surface the constraints & gotchas.** Environment quirks, air-gap/offline
   limits, credentials, flaky steps, "do not re-fix this" traps (check the repo docs
   and whichever instruction file this host loads — CLAUDE.md, AGENTS.md,
   SYSTEM.md). These cost the next worker hours if lost.
5. **Define the resume path.** The exact next 1–3 actions, the first commands to
   run to get oriented, and the branch/PR state. Be concrete enough that someone
   can start in under five minutes.
6. **List open questions.** Anything awaiting a user decision, unknowns, or risks.

## Writing the document

Fill in `template.md` (in this skill's directory). Read it and follow its
structure and section-by-section guidance. Rules for the output:

- **Self-contained.** The reader has *not* seen this chat. Spell out acronyms,
  link file paths as `path:line`, quote the relevant commit messages. Do not write
  "as discussed above" — there is no above.
- **Evidence over assertion.** Prefer "`geo/mosaic_qa.py` — ABSENT (grep returned
  0 matches)" to "QA judge not done".
- **Ruthlessly current.** If the plan changed mid-session, document the *final*
  plan and note what was superseded, so nobody follows a stale branch of thought.
- **Depth where it matters, brevity where it doesn't.** In-depth on decisions,
  rationale, gotchas, and resume steps; terse on boilerplate.
- **No invention.** If something is unknown, write "UNKNOWN — needs checking",
  never a plausible guess. A confident wrong handoff is worse than an honest gap.

## Output location & naming

Default to `docs/handoffs/HANDOFF-<YYYY-MM-DD>-<short-topic-slug>.md` (create the
folder if absent). If the repo has an obvious conventions dir (e.g.
`docs/superpowers/`), prefer matching it. If the user named a path or the
scratchpad, honor that. Confirm the location in your reply.

Optional args: treat any argument as the output path or a focus hint
(e.g. `/skillator-handoff docs/notes/handoff.md` or `/skillator-handoff mosaic tracks`).

## Finish

After writing, reply with: the file path, a 3–5 line summary of the current state
it captured, and the single recommended next action. Do **not** commit or push
unless the user asks — the handoff is theirs to place.
