---
name: ticket-checker
description: >-
  Serialised, Jira-style ticket IDs for AI coding chats — every bug is B1, B2,
  B3… and every feature F1, F2, F3…, with sub-parts as B7a/B7b, all recorded in a
  single shared TICKETS.md at the repo root so nothing is forgotten across chats,
  sessions, or teammates on the same branch. Use when the user reports a bug or
  asks for a feature, says "log this", "what's pending", "ticket", "B3", "F12",
  "next ticket number", "mark it done", or when starting work and you need to know
  what's already open. Also use before closing a session to sync statuses. It
  allocates IDs by scanning the file (never reusing a number), keeps status as
  pending/in-progress/done, and appends rather than renumbering so parallel
  teammates don't conflict. NOT an issue tracker replacement and NOT for
  syncing to real Jira/GitHub Issues.
---

# ticket-checker — serialised tickets in one file

One file, `TICKETS.md`, at the repo root. It is the source of truth. Bugs are
`B<n>`, features are `F<n>`, sub-parts are the parent ID plus a letter (`B7a`).
Numbers are **never reused** and **never renumbered** — an ID means one thing
forever, in commits, branch names, and chat.

## The file

Create it if missing, with exactly this shape:

```markdown
# TICKETS

Legend: `[ ]` pending · `[~]` in-progress · `[x]` done
IDs are permanent — never reuse or renumber. Append new tickets at the end of
their section.

## Bugs

- [x] B1 — Login redirect loops on expired session
- [~] B2 — CSV export drops the last row
  - [x] B2a — off-by-one in the writer
  - [ ] B2b — add regression test
- [ ] B3 — Avatar upload 500s over 5MB

## Features

- [ ] F1 — Dark mode
- [ ] F2 — Bulk delete in the table view
```

Line format, kept greppable: `- [<status>] <ID> — <one-line title>`. Optional
trailing ` (@owner)` or ` (branch: x)` if the user wants it; nothing else.
Sub-parts are indented two spaces under their parent.

## Allocating an ID

1. Read `TICKETS.md` (create it from the template above if absent).
2. Next ID = highest existing number in that section + 1. Scan the *whole* file,
   including done tickets — done never frees a number.
3. On a shared branch, also check for uncommitted/incoming edits before
   allocating: `git fetch && git diff HEAD origin/<branch> -- TICKETS.md`. If the
   remote has higher numbers, take the next one above those.
4. Sub-parts: next unused letter under that parent (`B2a`, `B2b`, …). Use them
   only when a ticket genuinely splits into separately-completable pieces.

**Collision rule:** if two teammates ever land the same number, the later commit
renames its ticket to a fresh number and leaves ` (was B7)` on the line. Never
renumber the earlier one.

## When to log

- User reports a bug → log a `B` ticket before fixing.
- User asks for a feature/change of any size → log an `F` ticket before building.
- You discover an unrelated problem mid-task → log it as pending, keep going.
  This is the whole point: nothing found in a chat gets lost when the chat ends.

Trivial one-line edits the user asked for inline don't need a ticket. If in
doubt, log it — a pending line is cheap.

## Working a ticket

- Starting → flip to `[~]`.
- Finished *and verified* (tests/build/manual check actually run) → `[x]`.
  Not verified, not done.
- Reference the ID in commit messages: `B3: reject uploads over 5MB`.
- Cycle end / session end: re-read the file and correct any status that drifted,
  then report the open set (`[ ]` and `[~]`) to the user.

## Fetching state

Whole board: read `TICKETS.md`. Just the open ones:

```
grep -nE '^\s*- \[[ ~]\]' TICKETS.md
```

When the user says a bare ID ("do B3", "what's F12"), grep for it and act on
that line.

## Rules

- **One file, repo root, committed.** It travels with the branch; that is how
  teammates and future chats see it.
- **Append, never rewrite.** New tickets go at the end of their section; edits
  touch only the one line being changed. Keeps merge conflicts to single lines.
- **IDs are permanent.** No reuse, no renumbering, no deleting done tickets —
  delete a ticket only if it was logged in error (say so to the user).
- **Status reflects reality.** `[x]` means verified, not "should work".
