---
name: merge-prep
description: >-
  Prepare a branch for a clean merge — bring it onto the current base, strip the
  parts it never meant to carry, and commit a handoff document recording every
  decision, all ON THE BRANCH ITSELF. Use when the user wants to "prep a branch
  for merge", "clean up a branch before merging", "make sure only the real
  changes get merged", "strip stale/old parts", or is about to run merge-agent
  and wants the branch normalized first. It never creates a side branch, never
  rewrites history, never force-pushes, and never touches the base — it only
  appends commits to the branch, behind a pre-prep tag that undoes the whole run.
  NOT for the actual merge (use merge-agent) or for non-git tasks.
---

# Merge Prep — the branch carries only its real changes, and says so

The problem this fixes: a branch that's behind base, or carries stale file
versions, whitespace churn, reverted-to-zero edits, or files it never meant to
touch — so merging it drags in "old or untouched parts". This skill brings the
branch **onto the current base**, removes what it didn't mean to change, and
commits a **prep document** to the branch so the next person (or `merge-agent`)
inherits every decision.

**Safety rails:** the branch is only ever **appended to** — no rebase, no history
rewrite, no force-push, base untouched. A `<branch>-preprep-<date>` tag is cut before
anything changes; `git reset --hard <tag>` undoes the entire run.

## Phase 0 — Orient

Establish and confirm: the **branch** to prep and its **base** (main/develop).

```
git fetch --all
git fetch origin <base>:<base>     # fast-forward the LOCAL base ref; refuses if diverged
git checkout <branch>
git tag <branch>-preprep-<date>    # the undo button; cut it before touching anything
```

`git fetch --all` updates `origin/<base>` only — **the local `<base>` ref does not
move.** Working off a stale local `<base>` silently defeats this entire skill: the
result carries old content while every later check reports "clean". If the second fetch
refuses, local `<base>` has diverged from origin — stop and ask which is the real base.
Note how far behind the branch is (`git rev-list --left-right --count <base>...<branch>`).

If the branch is already pushed, say so now: this prep adds commits that will need a
(normal, non-force) push, and anyone else on the branch will pull them.

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

Draft the **prep document** — `docs/merges/prep-<branch>-<date>.md`, in the repo, since
it gets committed to the branch — and record every path as one row, before changing
anything:

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

The document also carries: base and pre-prep tag, the merge conflicts resolved in
Phase 2 and how, the Phase-3 verification result, and what a reader should revert if
they disagree. It is the handoff — `merge-agent` and the next human both read it.

## Phase 2 — Prep the branch in place

Up to four appended commits, in this order, on `<branch>` itself. Any of them may be
empty and is then simply skipped.

```
git checkout <branch>

# 1. onto current base — a merge, not a rebase: no history rewrite, no force-push
git merge <base>
#   Conflicts here are real: base and the branch collide. Resolve them as merges, log
#   each one in the prep doc, and never `git checkout --ours`/`--theirs` a whole file
#   to make the conflict go away — that is how base's newer work disappears with exit 0.

# 2. remove what the branch never meant to carry (NO-OPs + reviewer exclusions).
#    EVERY dropped path goes through ONE pipe — modified, added, deleted, renamed, binary:
git diff --binary -M <base>...<pre-prep tag> -- <path> | git apply --reverse
#   renames: pass BOTH pathspecs -- <old> <new>, or the rename degrades to a bare
#   add or delete and one side's content is lost.
#   CHECK THE EXIT CODE EVERY TIME. Non-zero means the branch's change to that path is
#   no longer present verbatim (the step-1 merge moved it) — escalate; never route
#   around it with `git rm` or `git checkout <base> -- <path>`, both of which also
#   destroy whatever base did to that file, exit 0, and leave no trace.
git commit -m "merge-prep: drop unintended and no-op paths"

# 3. reviewer content edits (stripped debug blocks, etc.), ONLY if any
git commit -m "merge-prep: reviewer decisions"

# 4. the handoff document
git add docs/merges/prep-<branch>-<date>.md
git commit -m "merge-prep: handoff document for <branch>"
```

**Why each piece is its own commit, and all of them sit on top of untouched developer
history.** `git log` still shows exactly what the developer wrote. Everything this prep
decided sits above it, named, and each piece is independently `git revert`-able. If the
developer disagrees with an exclusion, they revert one commit; they don't have to argue
it out or unpick a squash. That is the deconfliction, and it is why this runs in place
rather than on a side branch: the decisions live in the branch's own history, where the
person who owns the code will actually see them.

**Apply the diff, not the file — for every path class, with no shortcuts.**
`git checkout <base> -- <path>` copies base's *whole file*, discarding anything the
branch legitimately changed in it. `git rm <path>` is the same bug wearing a different
hat: if base fixed that file, `git rm` deletes the fix, exits 0, and leaves no trace in
any diff or log. The `apply --reverse` pipe refuses (exit 1) and surfaces the collision,
which is the point. `--binary` matters too — without it `git diff` emits
`Binary files … differ`, an unappliable stub.

Three-dot (`<base>...<pre-prep tag>`) against the **pre-prep tag** is deliberate: it is
merge-base→branch-as-it-was, exactly what the branch did before this prep started.
Two-dot, or three-dot against the post-merge tip, would smuggle in reversals of base's
own progress.

**Never `git add -A` in this phase.** A conflicted merge or apply leaves unmerged index
entries (which make `git commit` refuse — a useful accident); `git add -A` stages the
conflict markers and commits them. Check exit codes per path, and `git diff --check`
before each commit.

Because the branch now sits on current base, untouched files carry base's latest version
(no old parts), and dropped no-op/unintended paths no longer appear in its diff.

## Phase 3 — Verify the diff is exactly the intended set

`git diff --stat <base> <branch>` — confirm it equals the INTENDED (+approved) set and
nothing else, plus the prep document itself.

Then **reconcile against the pre-prep tag.** A name-only tip-vs-tip diff is *not*
enough: it works at path granularity, so on any file base also moved it lists the path
either way, and the doc row "base moved ahead" truthfully explains the file while
absolving a hunk that vanished inside it. Check per hunk instead — if the intended
change is present, removing it succeeds:

```
git checkout <branch>
# for each KEPT path — must exit 0:
git diff --binary -M <base>...<pre-prep tag> -- <path> | git apply --reverse --check
# for each DROPPED path — must print nothing:
git diff --stat <base> <branch> -- <dropped paths>
```

Exit 0 means every intended hunk for that path is present verbatim in the prepped tree.
Non-zero means a hunk is missing or altered — legitimate only if a prep-doc row names
*that path and that hunk* (an exclusion, or a merge conflict resolved the other way);
anything else is a change that vanished. Stop and find it. Comparing the branch to its
own intended list is circular; this is the only check that can actually fail.

Record the verification result in the prep document (amend commit 4, or add a fifth).
Then **ask** whether to run the project's build/tests on the prepped branch (default yes
if a test command exists) — since it now sits on current base, this is where you'd catch
integration breakage early.

## Phase 4 — Hand off

Relay: the branch name (unchanged), the pre-prep tag, the kept-vs-dropped counts, the
verified diff, and the **path of the committed prep document**. If a reviewer-decisions
commit exists, say so explicitly and list what it changed — the developer hasn't seen
those edits and gets the last word on their own code; if they object, they revert that
commit. Then **ask at run time**: hand off locally (the user / `merge-agent` targets the
branch), or — only on an explicit yes — push it (normal push, never force). `merge-agent`
can now integrate a branch that carries only its real changes and documents why.

## Rules

- **In place, append-only.** No side branch, no rebase, no history rewrite, no
  force-push, base untouched. The pre-prep tag makes the whole run reversible with
  `git reset --hard <tag>`.
- **The prep document is the deliverable and it is committed to the branch.** A decision
  that lives only in a chat transcript is a decision nobody downstream has.
- **Merge base in, don't rebase onto it.** This is what guarantees "no old/untouched
  parts" while leaving the developer's commits byte-identical.
- **Route the judgment:** NO-OP → auto-drop (reported), SUSPICIOUS → user decides,
  INTENDED → keep. Unsure = suspicious (escalate), never silently include.
- **Developer intent owns content; reviewer intent owns inclusion.** A reviewer may
  exclude a path freely, but changing what the code *says* is an edit — it goes in the
  separate reviewer commit, named in the handoff, never folded in with anything else.
- **Every path gets a logged decision and an owner** (developer / reviewer / auto).
  A change nobody is recorded as having decided is a change nobody can defend at review.
- **One pipe for every dropped path class.** Modified, added, deleted, renamed, binary —
  all go through `git diff --binary -M <base>...<pre-prep tag> -- <path> | git apply
  --reverse`. Whole-file `checkout` and `git rm` both destroy base's newer edits with
  exit 0 and no trace.
- **A non-zero `git apply` is data, not an obstacle.** It means base and the branch
  genuinely collide on that path. Escalate it; never reach for a command that succeeds.
- **Reconcile per hunk, not per path,** via `git apply --reverse --check` against the
  pre-prep tag. Name-only diffs cannot see a hunk lost inside a file base also touched —
  which is where losses actually hide.
- **"Current base" is the local ref, and `git fetch` does not move it.** Fast-forward
  `<base>` explicitly or the whole skill quietly operates on stale content.
- Pairs with `merge-agent`: prep first, then merge the clean branch.
