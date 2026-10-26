# merge-smith — git procedure

The exact commands behind the phases in `SKILL.md`. Each block is sh. A line printed
as `STOP:` (or, where noted, any output at all) stops the run — report it, do not
route around it.

## Phase 0 — Pre-flight

```sh
B=<base>
# 1. Clean tree, else STOP. Never auto-stash: a dirty tree aborts `git merge`, and a
#    dirty or untracked file corrupts every `git apply --check` in Phase 4.
if [ -n "$(git status --porcelain)" ]; then echo "STOP: tree not clean"; git status --short
else

# 2. Local <base> = origin/<base>. `fetch --all` moves origin/<base>, not <base>, and the
#    integration branch is cut from the local ref.
git fetch --all --prune
if ! git merge-base --is-ancestor "$B" "origin/$B"; then
  echo "STOP: local $B is not an ancestor of origin/$B (diverged or unpushed) - ask which is the real base"
elif [ "$(git symbolic-ref -q --short HEAD)" = "$B" ]; then
  git merge --ff-only "origin/$B"        # checked out here: `fetch origin B:B` refuses (exit 128)
else
  git fetch origin "$B:$B" || echo "STOP: $B is checked out in another worktree - update it there"
fi

# 3. Already merged? Skip that source.
git merge-base --is-ancestor <source> "$B" && echo "skip <source>: already in $B"

# 4. Merge drivers and LFS on the paths in play (once per source). Any output names a
#    path git will NOT merge the normal way - log it.
git diff --name-only "$B"...<source> | git check-attr --stdin merge filter | grep -v ': unspecified$'
git config --get-regexp '^merge\..*\.driver$'
fi
```

What step 4's output means:
- `merge: union` — both sides' lines kept with no conflict: duplicates and wrong
  order merge silently, and the reconcile cannot see a duplicate. Review the merged
  file (`git diff HEAD^1 HEAD -- <path>`) as a semantic hunk and log it.
- `merge: ours` or a custom driver — the source's change can be dropped with exit 0.
  Phase 4 direction 1 will `FAIL` it; treat the path as semantic from the start.
- `filter: lfs` — conflicts are whole-file by nature: semantic, ask which side, never
  `--ours`. `git lfs version` must succeed, else STOP. The reconcile compares the
  pointer files, which is the right comparison.

Rerere is disabled per merge (Phase 3 command): a resolution recorded on another run
would be replayed without anyone deciding it.

## Phase 2 — Integration branch

```sh
b=integration/$(date +%F)-<slug>; name=$b; i=2
while git rev-parse -q --verify "refs/heads/$name" >/dev/null; do name=$b-$i; i=$((i+1)); done
git switch -c "$name" <base>
git rev-parse HEAD          # the cut commit - record it in the merge log
```

Never reuse, reset or delete an existing `integration/*` branch: it is a previous
run's audit trail.

## Phase 3 — One source per merge commit

```sh
git -c rerere.enabled=false merge --no-ff --no-commit <source>
```

Never squash, octopus or fast-forward: Phase 4 needs `HEAD^1` to be the integration
branch as it was before this source. `--no-commit` even when clean: ticket renumbering
and the hazard check (between-merges.md) land in the merge commit. Resolve, `git commit`,
then reconcile — the reconcile runs on the merge commit, not a half-merged tree.

### Taking a side mid-conflict

`git diff … | git apply --3way` does not work here — a conflicted path has no stage-0
index entry, so `apply` reports `does not exist in index`. Use the three index stages
instead: stage 1 = merge base, stage 2 = the destination (the integration branch,
"ours"), stage 3 = the source ("theirs").

```sh
t=${TMPDIR:-/tmp}/merge-smith.$$
for n in 1 2 3; do git show ":$n:<path>" > "$t.$n"; done
git merge-file -p --theirs "$t.2" "$t.1" "$t.3" > <path> && git add <path>; rm -f "$t".?
#   --theirs = take: source   --ours = take: destination   --union = take: both (ours first)
```

Only the *conflicting* hunks go to the named side; every non-conflicting hunk from
both sides is kept — the difference from whole-file `git checkout --ours/--theirs`.
Use it only when every conflicted hunk in the file goes the same way; mixed decisions
are edited in the diff3 markers. A modify/delete conflict lacks stage 2 or 3: semantic.

### Lockfiles

Start from the destination's lockfile, then let the package manager reconcile it with
the merged manifest:

```sh
git checkout --ours -- <lockfile>
npm install --package-lock-only --ignore-scripts      # package-lock.json
pnpm install --lockfile-only                          # pnpm-lock.yaml
yarn install --mode=update-lockfile                   # yarn.lock (Berry; v1: yarn install)
cargo metadata --format-version 1 >/dev/null          # Cargo.lock
go mod tidy                                           # go.sum
```

No network: retry with `--offline` (npm, pnpm, yarn v1), `cargo metadata --offline`,
`GOFLAGS=-mod=mod GOPROXY=off go mod tidy`. If that fails too, keep the destination's
lockfile, log `take: destination — lockfile not regenerated (offline)`, and put
"regenerate `<lockfile>` before pushing" in the Phase 5 report.

A regenerated lockfile legitimately differs from both sides. Log it `take:
regenerated`; that row explains a Phase 4 `FAIL` on that path, in either direction,
and nothing else.

## Phase 5 — Swap-in: base checked out in another worktree?

```sh
git worktree list --porcelain | awk -v b="branch refs/heads/<base>" -v me="$(git rev-parse --show-toplevel)" \
  '/^worktree /{w=substr($0,10)} $0==b && w!=me {print "STOP: <base> is checked out in " w}'
```

Any output = STOP: renaming `<base>` would leave that worktree on the archive. Checked
out *here* is fine — HEAD follows the rename.
