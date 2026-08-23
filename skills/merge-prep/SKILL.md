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

```
git fetch --all
git fetch origin <base>:<base>     # fast-forward the LOCAL base ref; refuses if diverged
```

`git fetch --all` updates `origin/<base>` only — **the local `<base>` ref does not
move.** Building off a stale local `<base>` silently defeats this entire skill: the
result carries old content while every later check reports "clean". If the second fetch
refuses, local `<base>` has diverged from origin — stop and ask which is the real base.
Note how far behind the branch is (`git rev-list --left-right --count <base>...<branch>`).

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

# EVERY kept path goes through ONE pipe — modified, added, deleted, renamed, binary:
git diff --binary -M <base>...<branch> -- <path> | git apply -3
#   renames: pass BOTH pathspecs -- <old> <new>, or the rename degrades to a bare
#   add or delete and one side's content is lost.
#   CHECK THE EXIT CODE EVERY TIME. Non-zero, or unmerged entries left behind, means
#   base changed that path in a way the branch's change cannot be replayed over. That
#   is a modify/delete or content collision — escalate it. Never route around it.

git commit --author="$(git log -1 --format='%an <%ae>' <branch>)" \
           -m "merge-prep: <branch> intended changes onto <base>"
# then, ONLY if the reviewer altered content (not merely excluded paths):
#   apply those edits and commit them separately
git commit -m "merge-prep: reviewer decisions on <branch>"
```

**Apply the diff, not the file — for every path class, with no shortcuts.**
`git checkout <branch> -- <path>` copies the branch-era *whole file*, discarding
anything base changed in it since the merge base. `git rm <path>` for a branch-deleted
file is the same bug wearing a different hat: if base fixed that file since the merge
base, `git rm` deletes the fix, exits 0, and leaves no trace in any diff or log. The
same pipe refuses (exit 1) and surfaces the modify/delete conflict, which is the point.
`--binary` matters too — without it `git diff` emits `Binary files … differ`, an
unappliable stub.

Three-dot (`<base>...<branch>`) is deliberate: it is merge-base→branch, exactly what the
branch did. Two-dot would smuggle in reversals of base's own progress.

**Rename caveat:** before applying a rename patch, check
`git diff --quiet $(git merge-base <base> <branch>) <base> -- <old>`. If base edited the
old path, a real merge would carry that edit into the new path but this patch will not —
escalate as a semantic conflict and merge base's edit in by hand.

**Never `git add -A` in this phase.** A conflicted `apply -3` leaves unmerged index
entries (which make `git commit` refuse — a useful accident); `git add -A` stages the
conflict markers and commits them. Check exit codes per path, and `git diff --check`
before either commit.

**Two commits, not one — that is the deconfliction.** Commit 1 is the developer's
*change*, three-way-applied onto current base, minus excluded paths — not their bytes,
since any path base moved on is a genuine merge. Where `apply -3` conflicted, resolve
commit 1 to the **developer's side verbatim** and put the integration fix in commit 2;
resolving in place would bake a reviewer decision into the developer's commit, exactly
where attribution matters most. `--author` keeps their name on it. Commit 2 is everything the
reviewer changed. `git log -p` then carries the attribution natively, the developer can
review or `git revert` the reviewer's commit alone, and nobody has to trust the log to
know who wrote what. Reviewer-only exclusions produce no second commit — they live in
the prep log, since an excluded path has nothing to show in a diff.

If `<branch>-merge-ready` already exists, a prep has run before — **stop and ask**
(delete and redo, or suffix `-2`). Never `checkout -B` over it: a previous prep may hold
hand-resolved conflicts that exist nowhere else.

Because the branch starts at current base and only kept paths are overlaid,
untouched files keep base's latest version (no old parts) and dropped no-op/
unintended paths never appear. The prep is **one or two clean commits** — history is
intentionally flattened; the point is a minimal, correct diff, not commit archaeology.
(Need per-commit history preserved? That's the rewrite-in-place mode this skill
deliberately doesn't do — say so and cherry-pick instead.)

## Phase 3 — Verify the diff is exactly the intended set

`git diff --stat <base> <branch>-merge-ready` — confirm it equals the INTENDED
(+approved) set and nothing else.

Then **reconcile against the source branch.** A name-only tip-vs-tip diff is *not*
enough: it works at path granularity, so on any file base also moved it lists the path
either way, and the log row "base moved ahead" truthfully explains the file while
absolving a hunk that vanished inside it. Check per hunk instead — if the intended
change is present, removing it succeeds:

```
git checkout <branch>-merge-ready
# for each KEPT path — must exit 0:
git diff --binary -M <base>...<branch> -- <path> | git apply --reverse --check
# for each DROPPED path — must print nothing:
git diff --stat <base> <branch>-merge-ready -- <dropped paths>
```

Exit 0 means every intended hunk for that path is present verbatim in the built tree.
Non-zero means a hunk is missing or altered — legitimate only if a prep-log row names
*that path and that hunk*; anything else is a change that vanished. Stop and find it.
Comparing merge-ready to its own intended list is circular; this is the only check that
can actually fail.

Then **ask** whether to run the project's
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
- **One pipe for every path class.** Modified, added, deleted, renamed, binary — all go
  through `git diff --binary -M <base>...<branch> -- <path> | git apply -3`. Whole-file
  `checkout` and `git rm` both destroy base's newer edits with exit 0 and no trace.
- **A non-zero `git apply` is data, not an obstacle.** It means base and the branch
  genuinely collide on that path. Escalate it; never reach for a command that succeeds.
- **Reconcile per hunk, not per path,** via `git apply --reverse --check`. Name-only
  diffs cannot see a hunk lost inside a file base also touched — which is where losses
  actually hide.
- **"Current base" is the local ref, and `git fetch` does not move it.** Fast-forward
  `<base>` explicitly or the whole skill quietly operates on stale content.
- **Everything is reversible** by deleting the prepped branch.
- Pairs with `merge-agent`: prep first, then merge the clean branch.
