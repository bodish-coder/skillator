---
name: merge-prep
description: >-
  Prepare a branch for a clean merge — produce a merge-ready branch whose diff
  against the base is ONLY the branch's intended changes, on top of the current
  base, with no stale/old versions and no accidental or no-op edits. Use when the
  user wants to "prep a branch for merge", "clean up a branch before merging",
  "make sure only the real changes get merged", "strip stale/old parts", "rebase
  and clean before merge", or is about to run merge-agent and wants the
  branch normalized first. It creates a new <branch>-merge-ready branch off the
  current base and overlays only the intended changes (auto-dropping no-ops,
  escalating anything substantive-but-maybe-unintended) — it never rewrites the
  original branch, never force-pushes, and never touches the base. NOT for the
  actual merge (use merge-agent) or for non-git tasks.
---

# Merge Prep — a branch that carries only its real changes

The problem this fixes: a branch that's behind base, or carries stale file
versions, whitespace churn, reverted-to-zero edits, or files it never meant to
touch — so merging it drags in "old or untouched parts". This skill rebuilds the
branch's changes **on top of the current base**, keeping **only what it actually
meant to change**, as a fresh `<branch>-merge-ready` branch.

**Safety rails:** never rewrites the original branch, never force-pushes, never
touches the base. Everything lands on a new throwaway branch — delete it = zero harm.

## Phase 0 — Orient

Establish and confirm: the **branch** to prep and its **base** (main/develop).
`git fetch --all` so "current base" means the real latest. Note how far behind the
branch is (`git rev-list --left-right --count <base>...<branch>`).

## Phase 1 — Inventory the branch's true changes

Compute the branch's diff against the **merge base**, per file:
`git diff --stat <base>...<branch>` and the full diff. Classify every changed path
(a cheap-tier analysis agent — Haiku on Claude Code, the equivalent row in the
`PLATFORMS.md` (beside the installed skills or at the repo root) elsewhere, or just the main session where no delegation
exists — can summarize the branch's *intent* from its commits/PR body and flag
off-purpose files, cheap and it's the whole judgment):

- **INTENDED** — substantive changes that match the branch's apparent purpose. Keep.
- **NO-OP** — whitespace/formatting-only, files touched but byte-identical to base,
  hunks reverted to base within the branch, EOL churn. **Auto-drop** (report them).
- **SUSPICIOUS / maybe-unintended** — substantive but off-purpose: unrelated files,
  debug/commented-out leftovers, committed secrets (`.env`), large generated/vendored
  blobs, lockfile churn with no matching dependency change. **Escalate to the user**
  (include or exclude, one line each) before deciding.

Present the inventory (INTENDED / NO-OP / SUSPICIOUS) and get the suspicious calls.

**Two different intents are in play and must never be blended:**
- **Developer intent** — what the branch's commits/PR say it set out to do. It is the
  default, and it owns *content*.
- **Reviewer intent** — the calls made during this prep (drop this file, strip that
  debug block, exclude the committed `.env`). It owns *inclusion*, not content.

Open a **prep log** (`docs/merges/prep-<branch>-<date>.md`, or scratchpad) and record
every path as one row, before building anything:

```
| path        | class      | decision                   | decided by | why                   |
|-------------|------------|----------------------------|------------|-----------------------|
| src/auth.ts | INTENDED   | keep                       | developer  | matches branch intent |
| .env        | SUSPICIOUS | exclude                    | reviewer   | committed secret      |
| src/api.ts  | SUSPICIOUS | keep, debug block stripped | reviewer   | leftover console.log  |
| README.md   | NO-OP      | drop                       | auto       | whitespace only       |
```

`decided by: developer` means kept as written, no judgment applied. `reviewer` means a
call this prep made that the developer never saw. Auto-dropped NO-OPs are logged too —
silent drops are how "but I *did* change that file" happens at review.

## Phase 2 — Build the merge-ready branch

Start from the **current base** so no stale/old content can survive, then overlay
**only the kept (INTENDED + user-approved) paths**:

```
git checkout -b <branch>-merge-ready <base>        # current base, clean slate
# for each kept path, apply the branch's version:
#   modified/added → git checkout <branch> -- <path>
#   deleted        → git rm <path>
#   renamed        → apply the rename (old path removed, new path from branch)
git commit -m "merge-prep: <branch> intended changes onto <base>"
# then, ONLY if the reviewer altered content (not merely excluded paths):
#   apply those edits and commit them separately
git commit -m "merge-prep: reviewer decisions on <branch>"
```

**Two commits, not one — that is the deconfliction.** Commit 1 is the developer's work
byte-for-byte as they wrote it, minus excluded paths. Commit 2 is everything the
reviewer changed. `git log -p` then carries the attribution natively, the developer can
review or `git revert` the reviewer's commit alone, and nobody has to trust the log to
know who wrote what. Reviewer-only exclusions produce no second commit — they live in
the prep log, since an excluded path has nothing to show in a diff.

Because the branch starts at current base and only kept paths are overlaid,
untouched files keep base's latest version (no old parts) and dropped no-op/
unintended paths never appear. The prep is a **single clean commit** — history is
intentionally flattened; the point is a minimal, correct diff, not commit archaeology.
(Need per-commit history preserved? That's the rewrite-in-place mode this skill
deliberately doesn't do — say so and cherry-pick instead.)

## Phase 3 — Verify the diff is exactly the intended set

`git diff --stat <base> <branch>-merge-ready` — confirm it equals the INTENDED
(+approved) set and nothing else. Then **ask** whether to run the project's
build/tests on the prepped branch (default yes if a test command exists) — since
it now sits on current base, this is where you'd catch integration breakage early.

## Phase 4 — Hand off

Relay: the `<branch>-merge-ready` name, the kept-vs-dropped counts, the verified
diff, and the **prep log path**. If a reviewer-decisions commit exists, say so
explicitly and list what it changed — the developer hasn't seen those edits and gets
the last word on their own code; if they object, revert that commit rather than
arguing it through here. Then **ask at run time**: hand off locally (the user / `merge-agent`
targets it), or — only on an explicit yes — push it (normal push, never force).
`merge-agent` can now integrate a branch that carries only its real changes.

## Rules

- **Original branch and base are untouched.** Only the new `<branch>-merge-ready`
  is created; no history rewrite, no force-push ever.
- **Start from current base, overlay only kept paths.** This is what guarantees "no
  old/untouched parts" — don't merge the stale branch in and hope.
- **Route the judgment:** NO-OP → auto-drop (reported), SUSPICIOUS → user decides,
  INTENDED → keep. Unsure = suspicious (escalate), never silently include.
- **Developer intent owns content; reviewer intent owns inclusion.** A reviewer may
  exclude a path freely, but changing what the code *says* is an edit — it goes in the
  separate reviewer commit, named in the handoff, never folded into the developer's.
- **Every path gets a logged decision and an owner** (developer / reviewer / auto).
  A change nobody is recorded as having decided is a change nobody can defend at review.
- **Everything is reversible** by deleting the prepped branch.
- Pairs with `merge-agent`: prep first, then merge the clean branch.
