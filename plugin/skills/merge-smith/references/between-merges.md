# merge-smith — between merges: tickets, hazards, resume

What happens around each `git merge` in Phase 3, and what a session that inherits a
half-finished run does first. Each block is sh. `$PRACTICE` is the `practice/` beside
the installed skills, resolved as `tickets-zordon` resolves it; `$RELAY` is
`relay-morpheus/hooks/relay-morpheus.sh` beside them.

## The step, in order

```
relay stage ~  ->  merge --no-commit  ->  resolve hunks  ->  renumber tickets
  ->  hazard check  ->  commit  ->  reconcile  ->  relay stage x  ->  commit log
```

Every source merges with `--no-commit`, conflicted or not, so the ticket renumbering
and any hazard fix land **in the merge commit** — Phase 4 needs `HEAD^1` to be the
branch before this source, and a follow-up commit would sit between them.

## Ticket ID collisions (before the commit)

Two branches that each took "next free" from their own board both made `A43`. Git
keeps both lines without a conflict, or the obvious `take: both` keeps them, and
`check-tickets.sh` fails. Per `tickets-zordon`'s collision rule the **destination's
IDs never move**; the source's do. This works without `mergeprep-oracle` having run.

```sh
git diff --quiet HEAD MERGE_HEAD -- TICKETS.md ||          # source touched the board
  sh "$PRACTICE/scripts/renumber-tickets.sh"                # after every conflict is resolved
```

A source ID collides when the merge base lacks it and the destination has it on a
different line. The script takes the next free number from `next-id.sh`, writes
`A110 (was A43)` on the moved line, moves sub-parts with the parent (`A43a` →
`A110a`; a sub-part colliding under a shared parent takes the next free letter), and
rewrites references **only on lines the source added**, in every file the source added
or changed — other ticket lines, docs, run files, code comments. Commit messages are
never rewritten. It prints `map: A43 -> A110` and `renumbered: <path>:<line>` rows,
and exits 1 on any `unresolved:` line (an old ID on a hand-merged line it cannot
attribute) — fix those by hand and log each. `--dry-run` prints the map only.

Log the map in the merge log as one row per renumbered path and line: `take:
renumbered` + the map. Phase 4 direction 1 then `FAIL`s those paths by design; the
row is the exception that explains them, and nothing else.

## Hazard check (before the commit, every step)

A clean merge is not a safe one. Three breakages produce no conflict:

```sh
# 1. Two sources each took the next migration number: both files exist, nothing
#    conflicts, and the runner applies one, both in the wrong order, or errors.
git ls-files | grep -iE '(^|/)(migrations?|migrate)/[^/]+$' |
  sed -nE 's#^(.*/)([0-9]+)[_.-][^/]*$#\1\2#p' | sort | uniq -d
#    Hash-chained (Alembic): `alembic heads` must print one head.
# 2. The board (renumbering above should already have made this pass).
git diff --cached --quiet HEAD -- TICKETS.md || sh "$PRACTICE/scripts/check-tickets.sh"
# 3. The project's build or typecheck (not the full suite - that is Phase 4).
```

Any output from 1, a fail from 2, or a red build stops the next merge. A duplicate
migration is **semantic** (Fable proposes the renumber, the user approves, logged as
`take: rewrite`); a red build is Opus's, as in Phase 4. Log each check's result for
the step, clean or not.

## Progress on disk (relay-morpheus)

At Phase 2, one stage per source, in merge order:

```sh
sh "$RELAY" init docs/merges/merge-<date>-<slug>.md "merge <slug>" <source1> <source2> ...
```

Record the RUN id, integration branch and cut commit in the merge log. Then per step:

1. **Before `git merge`** — `sh "$RELAY" stage <n> '~' main`, In-flight block = the
   merge command, the source's tip sha, the integration `HEAD`.
2. After the reconcile passes — `sh "$RELAY" stage <n> x main <merge-sha>`, then
   commit the merge log and the run file together (`merge-log: through step <k>`).
   The tree is clean again before the next merge.

The merge log is therefore **committed on the integration branch**, step by step —
never kept only in a scratchpad, which dies with the session the log has to outlive.
It travels with the branch: into `<base>` on swap-in or when the PR merges, the same
audit trail `mergeprep-oracle`'s prep document is.

## Resume (on entry, before Phase 0's clean-tree check)

```sh
sh "$RELAY" list                                  # an open "merge <slug>" run = resume it
git rev-parse -q --verify MERGE_HEAD && git branch --points-at MERGE_HEAD
git log --first-parent --merges --format='%H %P' <cut>..HEAD    # 2nd parent = a source tip
```

- **`MERGE_HEAD` present** — the session died mid-step. `git merge --abort` and redo
  that step. Decisions the log already holds for it are reused (an approved `rewrite`
  is re-applied by the main session, not re-asked; mark the row `redone on resume`);
  a resolution in the tree with no row is discarded — nobody can say who decided it.
- **Merged through step k** = the last `x` row, checked against that `git log`: a merge
  commit whose row is still `~` died after its commit — run its reconcile and hazard
  check, then mark it `x`. A `~` row with no merge commit is simply redone.
- The run file and the merge log may show as modified — the `~` row and that step's
  rows. That is the only dirt a resume accepts; anything else is Phase 0's `STOP`.
- `<base>` moved since the cut: do not re-cut. Finish on the recorded cut and say so in
  the Phase 5 report.

## The integration branch afterwards

merge-smith never deletes one on its own (git-procedure.md §Phase 2). **Hand off
locally** — it stays until the user's PR merges; `git branch -d` then succeeds and is
theirs to run. **Swap-in** — it *becomes* `<base>`; nothing is left to clean. A failed
or abandoned run — it stays as the audit trail, deleted only on the user's explicit
ask, and never while `MERGE_HEAD` or a `~` row points at it.
