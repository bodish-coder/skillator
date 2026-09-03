---
name: merge-agent
description: >-
  Analyse GitHub branches with agents and merge them gracefully, handling
  conflicts by risk. Use when the user wants to combine/consolidate several
  branches into one integration branch, merge a feature branch into a base
  (main/develop), or reconcile divergent branches that touched the same code —
  and wants conflicts handled intelligently rather than by hand. Agents summarize
  each branch's intent, build an overlap/conflict map, pick a safe merge order,
  then merge on a throwaway integration branch: trivial conflicts (lockfiles,
  imports, formatting) auto-resolve, semantic/logic conflicts escalate to the user
  per hunk — not per file — with both versions, a proposed resolution, and the
  direction asked rather than assumed, so only the parts you choose are taken in.
  The merge direction (`<source>` INTO `<destination>`) is confirmed before anything
  is touched, and completeness is verified both ways: every hunk the source intended
  arrives, and every hunk the destination gained is still there. Optionally verifies with the project's tests and
  optionally opens a PR — both asked at run time. Never touches the base branch
  directly and never pushes without explicit approval. NOT for a single trivial
  fast-forward, or non-git tasks.
---

# Merge Agent — analyse branches, merge by risk

Agents do the reading and the routing; **git does the merging on a throwaway
integration branch**, so nothing is risked. The base branch (main/develop) is
never modified directly and nothing leaves the machine without an explicit yes.

**Model tiers (best model where being wrong is expensive, cheap everywhere
else):** branch **analysis → Sonnet**, **trivial conflict auto-resolve →
Sonnet**, **semantic conflict resolution proposed → Fable**, **that resolution
applied, plus verification failures and rework → Opus**. Dispatch via the Agent
tool with the matching `model` override.

Same split the rest of skillator uses — **Fable decides, Opus builds.** A bad
semantic merge is the worst failure this skill has: it exits 0, the tests pass,
and a change quietly disappears until production. *Deciding* what the merged hunk
should say is judgement, not lookup, so it goes to the strongest model
(`model: "fable"`; on another host, its top reasoning tier per §Other hosts).
*Writing it in*, and fixing whatever the verification then catches, is
implementation — that is Opus's job, and handing it to the design tier is both
worse and dearer.

**Neither tier touches the mechanical majority.** Fable sees only the semantic
conflict hunks — typically a handful, not the merge. Opus sees only those
resolutions and a failing check. Enumerating branches, regenerating a lockfile
and re-running a green suite stay on Sonnet.

**The aim:** the source's work arrives in the destination, and the destination
is not disturbed on the way in. Both halves are *verified* in Phase 4 — a merge
that lands the feature while silently reverting base's newer work is a failed
merge that reports success.

**Vocabulary, shared with `merge-prep`:** the **source** is the branch being
merged, the **destination** (`<base>`) is what it merges into. Same words, same
`apply --reverse --check` reconcile, same rule that a non-zero exit is evidence.

**Mechanism:** local git for all merge/conflict work; `gh` for PR context (titles,
descriptions, review/check state) and the optional final PR. If `gh` isn't
authenticated, fall back to pure git and say so.

---

## Phase 0 — Orient & confirm

Establish, then confirm back before touching anything:
- **Branches** in scope and the **base/target** (main, develop, a release branch).
- **Mode:** `consolidate` (many → one integration branch) · `into-base` (one
  feature → base) · `reconcile` (branches that edited the same code differently —
  conflicts are the main event, prefer best-version selection over union).
  Detect from the request; if ambiguous, ask once.
- **Direction — always stated, never inferred.** Write it back as one line and get a
  yes before anything else: `merging <source> INTO <destination>`. Branch names lie
  (`develop` merged into a feature is a legitimate and completely different
  operation), and the two directions produce different trees, different conflict
  winners, and different blast radii. If the user's phrasing is reversible at all
  ("merge dev and my branch"), ask — this is the one question that is never worth
  guessing.
- `git fetch --all`, then `git fetch origin <base>:<base>` — **`fetch --all` moves
  `origin/<base>`, not the local `<base>` ref.** The integration branch is cut from the
  local ref, so without that second fetch the whole merge happens on a stale base and
  every later check still reports clean. If it refuses, local `<base>` has diverged from
  origin — stop and ask which is the real base.
- Confirm the branches exist and their base. Note anything already merged (skip it) or
  wildly stale.

Never start merging on an unconfirmed branch list or base.

> If a branch is stale or carries unrelated/no-op churn, run **`merge-prep`**
> on it first — it preps the branch **in place** (onto current base, unintended paths
> dropped) and commits a prep document to it, so this merge integrates nothing old or
> untouched. Read that document (`docs/merges/prep-<branch>-*.md`) before merging: it
> names every path deliberately dropped and every reviewer edit.

## Phase 1 — Analyse the branches (Sonnet, in parallel)

One analysis subagent per branch (`model: "sonnet"`), each returns structured:

```
BRANCH:     <name>  (ahead <n> / behind <n> vs base)
INTENT:     <what it does — from commits, diff, and the PR body if gh has one>
TOUCHES:    <key files / areas>
RISK:       <low|med|high> + why (migrations, shared core, deletions, deps)
```

Then build two things from the results (main session, cheap):
- **Overlap matrix** — which branches touch the same files (the conflict predictor).
- **Recommended merge order** — least-overlapping / lowest-risk first, dependencies
  respected, so early merges don't compound conflicts. In `reconcile` mode, order
  by which branch is the intended base of truth.

Present the analysis + predicted conflicts + proposed order. This *is* the "analyse
the branches" deliverable — a light confirm here is cheap; a wrong order is not.

## Phase 2 — Set up the integration branch

Create a throwaway branch from the base — `integration/<YYYY-MM-DD>-<slug>` — and
open a **merge log** file (`docs/merges/merge-<date>-<slug>.md` or scratchpad):
record base, branches, order, and (as you go) every conflict + how it was resolved.
The log makes the whole run auditable and revertible (drop the branch = zero harm).

## Phase 3 — Merge by risk

Merge each branch onto the integration branch in order. On a conflict, **classify
each conflicted file, then route**:

- **Trivial / mechanical → auto-resolve (`model: "sonnet"`):** lockfiles
  (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Cargo.lock`, `go.sum` →
  prefer regenerate over hand-merge), import ordering, formatting/whitespace-only,
  append-only files (changelogs), both-sides-added non-overlapping code, generated
  files.
- **Semantic / logic → escalate (`model: "fable"` proposes, user approves,
  `model: "opus"` applies):** the
  same function/body edited both sides, signature/API changes, one side deleted
  what the other modified, config/schema/migration conflicts, any overlapping logic.
  The agent explains **both sides + a proposed resolution + why**; the user
  approves or adjusts before it's applied.
- **Unsure → treat as semantic.** Escalation is the safe default.

**Resolve per hunk, not per file.** A conflicted file is rarely wholly one side's;
`--ours`/`--theirs` on a whole file is the single most common way a real change
disappears with exit 0. Open the conflict with all three versions visible and decide
each hunk on its own:

```
git checkout --conflict=diff3 -- <path>   # shows base|ours|theirs, not just two sides
git checkout --ours   -- <path>   # ONLY legitimate for lockfiles and generated files
```

`diff3` markers matter: two-way markers show you what the sides *say* and hide what
they *started from*, so "both changed this line" and "one side changed it, the other
inherited it" look identical. With the base section visible, most hunks resolve
themselves.

For each conflicted hunk, decide and log one of:

| Take | When |
|---|---|
| `source` | The hunk is the feature. The destination's version is the old world. |
| `destination` | Base moved ahead here and the source is stale — its version predates base's change. |
| `both` | Non-overlapping additions in the same region: keep both, order deliberately. |
| `rewrite` | Neither side is right once combined — Fable proposes, user approves, Opus applies, and the log carries the proposed text. |

**Ask the direction on any hunk where the two sides genuinely disagree about
behaviour** — do not resolve it from the merge's overall direction. Merging a feature
into base does *not* mean the feature wins every hunk: a hunk where base fixed a bug
the source still carries must go to `destination`, or the merge reintroduces the bug.
Present both versions, say which way you'd go and why, and let the user pick.

Where a hunk was taken from one side wholesale, prefer applying it rather than editing
markers by hand — same pipe as `merge-prep`, so both skills fail the same way and the
failure is visible:

```
git diff --binary -M <merge-base>...<side> -- <path> | git apply --3way
```

Record each resolution in the merge log — **one row per hunk**, not per file
(file · hunk/lines · trivial/semantic · take: source/destination/both/rewrite · who
decided · why). Phase 4's reconcile checks hunks; a log written at file granularity
cannot explain the failures it will find. If a merge goes sideways, `git merge --abort`, note it, and re-plan that step —
never leave the tree half-merged.

## Phase 4 — Verify (ask at run time)

**First, reconcile against every source branch.** Tests prove the merge *works*; this
proves it is *complete*. Do it per hunk — a `--name-only` tip diff works at path
granularity, so on any file that base or another branch also moved it lists the path
either way, and "another branch moved it ahead" then truthfully explains the file while
absolving a hunk that vanished inside it. That is precisely the failure mode this step
exists to catch, so check the hunks:

```
git checkout <integration>
# for each source branch, for each path it changed — must exit 0:
git diff --binary -M <base>...<source> -- <path> | git apply --reverse --check
```

Exit 0 means every hunk that source intended is present verbatim in the integration
tree. Non-zero is legitimate **only** when a merge-log row names that path *and that
hunk* (a semantic conflict you resolved the other way) or a prep-document row shows the path
was deliberately dropped. Anything else is a change that silently vanished — find it and
re-apply it before going further. A green test suite will never catch this.

**Then reconcile against the destination — it must be undisturbed.** The check above
proves the sources arrived; it proves nothing about base's own work, and a merge that
lands every feature while reverting base is the failure this whole skill is built to
prevent. Same pipe, other side:

```
git checkout <integration>
# for each path BASE changed since the merge base with each source — must exit 0:
git diff --binary -M $(git merge-base <base> <source>)...<base> -- <path>   | git apply --reverse --check
```

Non-zero is legitimate **only** where a merge-log row names that path *and that hunk*
as `take: source` — a deliberate, recorded overwrite of base. Anything else is base's
work silently reverted. This is the check that would have caught it; `git status`,
a name-only diff, and a green test suite will all report success.

Then detect the project's build/test command. **Ask whether to run verification**
(default **yes** if a test command is detected — a conflict-free merge is not a
correct one). If yes, run it (Sonnet agent or main session). A **failure is
Opus's**, not the runner's: a broken test after a merge is a real defect in the
merged code, and Opus fixes it. Escalate back to Fable only when the fix means
re-deciding a semantic resolution rather than repairing one — re-run, and update
the log.
Gate "done" on green.

## Phase 5 — End state (ask at run time)

Relay a summary: what merged, conflicts resolved (trivial vs escalated counts),
**reconcile result — both directions: every source hunk present, every destination
hunk present, each exception named in the log**,
verification result, integration branch name, merge-log path. Then **ask**:
- **Hand off locally** — leave the integration branch + log; the user pushes/PRs.
- **Swap-in (local only)** — rename the base aside and promote the merge into its
  name, so the working branch name keeps meaning what it meant:
  ```
  git branch -m <base> <base>_old_before_<source>   # e.g. dev -> dev_old_before_ksk_aewag2
  git branch -m <integration> <base>                # merged result becomes dev
  git branch --unset-upstream <base>_old_before_<source>
  git branch -u origin/<base> <base>
  ```
  Those last two lines are not optional: `git branch -m` carries `branch.<name>.*`
  config with the rename, so without them the **archive** tracks `origin/<base>` (and
  under `push.default=upstream` a habitual `git push` from it pushes the pre-merge state
  over origin's base) while the promoted branch tracks nothing. Note also that the
  promoted `<base>` has now diverged from `origin/<base>` — the next `pull` will merge
  origin's base back into the merged result, which is expected but worth saying out loud.
  Name the archived base `<base>_old_before_<source>`, not a bare `<base>_old`:
  months later the only question anyone asks of that branch is *"old before what?"*
  Strip any `-merge-ready`/`-prep` suffix from `<source>` first (older preps made such
  branches; current `merge-prep` preps in place, so usually there is nothing to strip).
  If the name is
  already taken, append `_2`, `_3` — never overwrite an existing archive.
  End state: sources unchanged (`f1` is still `f1`), `dev` = merged result,
  `dev_old_before_ksk_aewag2` = previous base. Only after verification is green, and
  only if `<base>` isn't checked out in **another worktree** (renaming the branch you
  are on is fine — HEAD follows it; a second worktree silently ends up on the archive).
  **Local refs only.** Never rename on the remote: that means deleting and
  re-pushing a branch, which breaks open PRs, branch protection, CI, and every
  other clone. To publish afterwards, push the renamed branch under a *new* remote
  name and PR it, or merge `<base>_old_before_<source>..<base>` normally — both need
  the explicit yes below.
- **Push + open a draft PR** — only on an explicit yes: push the integration branch
  and open a **draft** PR via `gh` (never merge it; never touch base; never
  force-push).

Pushing, opening a PR, or merging a PR are never done without that explicit approval.

---

## Rules

- **Base branch is sacred.** Only ever a merge *source*; never checked out for
  modification, never pushed to, never force-pushed. The one exception is the
  approved local **swap-in** rename in Phase 5 — which preserves the old base as
  `<base>_old_before_<source>` and still touches nothing on the remote.
- **Completeness is verified in both directions, not assumed.** Before calling a merge
  done: every hunk each source intended is present, **and** every hunk the destination
  gained since the merge base is present. Each exception is named — path and hunk — in
  the merge log or the branch's prep document. Unexplained difference = lost change.
- **Direction is asked, not inferred.** `<source> INTO <destination>` is confirmed
  before the first merge, and the overall direction never decides an individual hunk.
- **Conflicts resolve per hunk.** Whole-file `--ours`/`--theirs` is for lockfiles and
  generated files only; anywhere else it is a change discarded with exit 0.
- **Everything on the integration branch**, everything in the merge log — the run is
  auditable and 100% revertible by deleting the branch.
- **Route conflicts by class, not by vibe.** Trivial→Sonnet,
  semantic→Fable proposes + approval + Opus applies, analysis→Sonnet, broken
  verification→Opus. Unsure = semantic.
- **Agents read and route; git merges.** Don't hand-edit conflict markers when a
  clean `git` resolution (regenerate lockfile, `--theirs`/`--ours` on a lockfile) is right.
- **Two run-time gates: verification and push/PR.** Both ask; push/PR needs an
  explicit yes. Never claim a push/PR/merge that wasn't approved.
- If `gh` is unavailable, do the whole merge with pure git and tell the user PR
  context/opening isn't available.
- If a subagent dies / returns null, stop and report rather than merging blind.
- **Kept in sync with `merge-prep`** — same source/destination vocabulary, same
  `git diff --binary -M ... | git apply --reverse --check` reconcile in both
  directions, same per-hunk granularity, same treatment of a non-zero exit as
  evidence. A change to any of those in either skill belongs in both.

## Other hosts

Sonnet/Fable/Opus and the Agent tool above are the **Claude Code** defaults. On
Cursor, Codex, Antigravity, Pi, or Prime Agent, map through `PLATFORMS.md` (beside the
installed skills, or at the repo/plugin root): branch analysis → **cheap tier**,
trivial conflicts → **cheap tier**, semantic conflicts *decided* by **the host's
strongest reasoning tier** (cursor `gpt-5.6-sol-medium`, codex `gpt-5.6-sol` at
`reasoning_effort: high`, antigravity/pi the best reasoner), then *applied* —
with verification failures and rework — by its **build tier**. Where the host has
only one top tier, it does both. No delegation available → resolve semantic
conflicts in-session and say so; never hand them to a cheaper agent. Where
the host can't run analysis agents in parallel, analyse branches sequentially and
write each summary to the merge log as you go — slower, same result. The approval
gates (verification, push/PR) do not relax on any host.
