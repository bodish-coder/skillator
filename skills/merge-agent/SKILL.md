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
  with a proposed resolution. Optionally verifies with the project's tests and
  optionally opens a PR — both asked at run time. Never touches the base branch
  directly and never pushes without explicit approval. NOT for a single trivial
  fast-forward, or non-git tasks.
---

# Merge Agent — analyse branches, merge by risk

Agents do the reading and the routing; **git does the merging on a throwaway
integration branch**, so nothing is risked. The base branch (main/develop) is
never modified directly and nothing leaves the machine without an explicit yes.

**Model tiers (cost by job):** branch **analysis → Haiku**, **trivial conflict
auto-resolve → Sonnet**, **semantic conflict proposal + verification + rework →
Opus**. Dispatch via the Agent tool with the matching `model` override.

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
- `git fetch --all` and confirm the branches exist and their base. Note anything
  already merged (skip it) or wildly stale.

Never start merging on an unconfirmed branch list or base.

> If a branch is stale or carries unrelated/no-op churn, run **`merge-prep`**
> on it first — it produces a `<branch>-merge-ready` carrying only its intended
> changes on top of current base, so this merge integrates nothing old or untouched.

## Phase 1 — Analyse the branches (Haiku, in parallel)

One analysis subagent per branch (`model: "haiku"`), each returns structured:

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
- **Semantic / logic → escalate (`model: "opus"` proposes, user approves):** the
  same function/body edited both sides, signature/API changes, one side deleted
  what the other modified, config/schema/migration conflicts, any overlapping logic.
  The agent explains **both sides + a proposed resolution + why**; the user
  approves or adjusts before it's applied.
- **Unsure → treat as semantic.** Escalation is the safe default.

Record each resolution in the merge log (file · trivial/semantic · what was chosen ·
why). If a merge goes sideways, `git merge --abort`, note it, and re-plan that step —
never leave the tree half-merged.

## Phase 4 — Verify (ask at run time)

**First, reconcile against every source branch.** Tests prove the merge *works*; this
proves it's *complete*. For each source branch merged:

```
git diff --name-only <integration> <source>
```

Every path listed must be explained by one of: a merge-log row (a semantic conflict
resolved the other way), a prep-log row (a NO-OP/SUSPICIOUS path merge-prep dropped),
or base/another branch having legitimately moved that file ahead of this source. **A path
in that output with no row in either log is a change that silently vanished** — find it
and re-apply it before going further. This is the only check that fails when a
conflict resolution quietly drops a hunk; a green test suite will not.

Then detect the project's build/test command. **Ask whether to run verification**
(default **yes** if a test command is detected — a conflict-free merge is not a
correct one). If yes, run it (Opus agent or main session); on failure, route the fix
like a conflict ([trivial]→Sonnet, [semantic]→Opus), re-run, and update the log.
Gate "done" on green.

## Phase 5 — End state (ask at run time)

Relay a summary: what merged, conflicts resolved (trivial vs escalated counts),
**reconcile result (paths differing from each source, all accounted for)**,
verification result, integration branch name, merge-log path. Then **ask**:
- **Hand off locally** — leave the integration branch + log; the user pushes/PRs.
- **Swap-in (local only)** — rename the base aside and promote the merge into its
  name, so the working branch name keeps meaning what it meant:
  ```
  git branch -m <base> <base>_old_before_<source>   # e.g. dev -> dev_old_before_ksk_aewag2
  git branch -m <integration> <base>                # merged result becomes dev
  ```
  Name the archived base `<base>_old_before_<source>`, not a bare `<base>_old`:
  months later the only question anyone asks of that branch is *"old before what?"*
  Strip any `-merge-ready`/`-prep` suffix from `<source>` first. If the name is
  already taken, append `_2`, `_3` — never overwrite an existing archive.
  End state: sources unchanged (`f1` is still `f1`), `dev` = merged result,
  `dev_old_before_ksk_aewag2` = previous base. Only after verification is green, and
  only if `<base>` isn't currently checked out elsewhere.
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
- **Completeness is verified, not assumed.** Before calling a merge done, every path
  where the integration branch differs from a source branch must be accounted for in
  the merge log or the prep log. Unexplained difference = lost change.
- **Everything on the integration branch**, everything in the merge log — the run is
  auditable and 100% revertible by deleting the branch.
- **Route conflicts by class, not by vibe.** Trivial→Sonnet, semantic→Opus+approval,
  analysis→Haiku. Unsure = semantic.
- **Agents read and route; git merges.** Don't hand-edit conflict markers when a
  clean `git` resolution (regenerate lockfile, `--theirs`/`--ours` on a lockfile) is right.
- **Two run-time gates: verification and push/PR.** Both ask; push/PR needs an
  explicit yes. Never claim a push/PR/merge that wasn't approved.
- If `gh` is unavailable, do the whole merge with pure git and tell the user PR
  context/opening isn't available.
- If a subagent dies / returns null, stop and report rather than merging blind.

## Other hosts

Haiku/Sonnet/Opus and the Agent tool above are the **Claude Code** defaults. On
Cursor, Codex, Antigravity, Pi, or Prime Agent, map through `PLATFORMS.md` (beside the
installed skills, or at the repo/plugin root): branch analysis → **cheap tier**,
trivial conflicts → **cheap
tier**, semantic conflicts + verification + rework → **build/deep tier**. Where
the host can't run analysis agents in parallel, analyse branches sequentially and
write each summary to the merge log as you go — slower, same result. The approval
gates (verification, push/PR) do not relax on any host.
