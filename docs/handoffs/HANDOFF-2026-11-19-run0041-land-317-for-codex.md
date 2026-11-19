# Handoff — RUN-0041: landing stage 317 (A249) on main, for Codex (2026-11-19)

<!-- skillator-execute
status: complete
last-run: 2026-11-20
runs: 1
remaining: 0
note: Stage 317 landed in 47d2de8 and A249 closed in 13ef09b. Stages 314–316 also landed. Release and push were outside this handoff scope.
-->

Resume verification (2026-11-20): Local main contains 47d2de8 and 13ef09b for stage 317, 61cdf97 for stages 315–316, and 38010c0 for stage 314. The run file records all four stages complete and TICKETS.md marks A242, A243, A245, and A249 closed. No merge is in progress. The sections below record the original handoff state.

> **Status legend:** ✅ DONE (verified in repo) · 🟡 IN-PROGRESS (partial/uncommitted) · 📝 CLAIMED (asserted in chat, unverified) · ⬜ NOT STARTED

> **Reader: Codex.** This repo's `AGENTS.md` says: read and follow `./.skillator/grayskull.md`
> before any work. On Codex, "invoke skill X" means *read that skill's `SKILL.md`* (installed
> skillator skills, e.g. under `~/.codex/skills/` or the plugin checkout `plugin/skills/<name>/SKILL.md`).
> Claude-only tools mentioned in older docs (`AskUserQuestion`, `/code-review`) map to: ask the
> owner in plain chat; do a careful self-review of the staged diff.

## 1. TL;DR (read this first)
`main` is **mid-merge**: `git merge --no-ff --no-commit run/RUN-0041-pending-parallel-4` was run
and stopped before committing (MERGE_HEAD = `fe17cc3`). The only staged change is the A249
test fix in `plugin/mods/ops-board/tests/model.test.ts`; `model.test.ts` passes. **Next action:**
review the 8-line staged diff, commit the merge, mark A249 `[x]`. Do **not** resume stages
314/315/316 or push — Claude Code's 7-day usage was at 97% (that limit is Claude's, not
Codex's, but the owner chose "land 317 only" for this session).

## 2. Mission & scope
- **Goal (why):** finish RUN-0041 (four parallel ticket stages: A242, A243, A245, A249), which
  stopped on 2026-11-18 at the 97% weekly limit. See
  `docs/handoffs/HANDOFF-2026-11-18-run0041-weekly-97.md`.
- **In scope this session (owner @sher's choice):** land stage 317 (A249) into `main` locally only.
- **Out of scope / deferred:** redispatching stages 314 (A242), 315 (A243), 316 (A245);
  version bump; push. The 15 unrelated test failures listed in §8.
- **Scope changes this session:** owner was offered wait / owner-to-dos / resume-anyway /
  land-317-only and picked **land 317 only**. Then asked for this handoff for Codex.

## 3. Current state — what's done vs. not

| Item | Status | Evidence | Notes |
|------|--------|----------|-------|
| Session driver recorded | ✅ | `ticket-meta.sh iam @sher` → "@sher owns session @cc-211i" | |
| A249 fix on run branch | ✅ | `c31564b` "A249: model.test A199 decide group checks F3 for @asha, not F1 for @vidul"; merged to run branch `fe17cc3` | test-only; fixture `tests/fixtures.ts` has `[?] F3 — Pick the chart library [decide: @asha]`, so the old test (`@vidul` / `F1`) was wrong, not the model |
| Run branch merged into main | 🟡 | `git status`: `M  plugin/mods/ops-board/tests/model.test.ts` staged; MERGE_HEAD `fe17cc3` | **uncommitted** — merge in progress |
| model.test.ts passes on merged tree | ✅ | `claude plugin test` on a scratch copy of the mod: model.test not among failures; total 485 pass / 15 fail / 500 | failures are in other suites, see §8 |
| Review of staged diff | ⬜ | — | 8 lines, `@vidul`→`@asha`, `F1`→`F3` in test A199 (`model.test.ts:174-191`) |
| A249 ticket closed | ⬜ | `TICKETS.md:424` still `[%]` (testing) | set `[x]` after the merge commit |
| Stage 314 (A242 self-update follow-ups) | ⬜ | worktree `.skillator/worktrees/RUN-0041-s314`, clean, no commits; `TICKETS.md:415` `[~]` | prompt in run file In-flight block |
| Stage 315 (A243 Teams follow-ups) | 🟡 | worktree `RUN-0041-s315`, WIP commit `226e542` (setup-hosting.test.ps1, **unverified**) | start from 226e542, verify or drop |
| Stage 316 (A245 wizard-answers follow-ups) | ⬜ | worktree `RUN-0041-s316`, clean; `TICKETS.md:420` `[~]` | |
| Release 4.30.3 / 0.18.3 + push | ⬜ | — | owner approval required |

## 4. Decisions & rationale (do not re-litigate)
- **Land 317 alone, now:** owner choice; 317 is test-only and already reviewed/landed on the run
  branch, so it costs one review and no build agents while usage was at 97%.
- **Merge the whole run branch (not cherry-pick):** the run branch holds only 317 so far
  (`git log main..run/...` = `fe17cc3`, `c31564b`); later stages merge into the same run branch,
  and merging it again later is a normal no-conflict follow-up.
- **The test was wrong, not the model:** the fixture's only decide ticket is F3 for @asha.
- **No new handoff/board sync was needed earlier in this session** because nothing had changed
  since the 2026-11-18 handoff; this doc supersedes it only for the "land 317" part.

## 5. Constraints, gotchas & "do not re-fix" traps
- Never open, print or repeat the exposed Teams secrets or `~/.skillator/teams.json` (A227).
- Tests must stub `claude`/`agy`/`muse`/installer; in Git Bash put stub dirs on PATH as `/c/...`
  (not `C:/...`) and confirm with `command -v` — a `C:/...` PATH caused one real `agy -p /usage` call.
- Run ops-board mod tests with `claude plugin test <dir>` on a **copy** of
  `plugin/mods/ops-board` (the full suite takes ~3 min; `pane.test.tsx` alone can exceed 300 s).
  It needs the Claude Code binary; if Codex can't run it, say "not run", never "passing".
- Never push unasked. Every push: bump `plugin.json` + `marketplace.json` versions first, push as
  `bodish-coder` (`gh auth switch -u bodish-coder`, push, `gh auth switch -u IkranActual`).
- Owner's machine is low on memory: run one agent / heavy test at a time.
- Before every commit: regression sweep + review of the staged diff (`.skillator/grayskull.md`).
- `TICKETS.md` is the board; `[%]` = testing, `[~]` = in progress, `[x]` only once verified.

## 6. Key files & where to look
- `plugin/mods/ops-board/tests/model.test.ts:174` — the A199 test fixed by A249.
- `plugin/mods/ops-board/tests/fixtures.ts:18` — `F3 … [decide: @asha]`.
- `.skillator/run-0041-pending-parallel-4.md` — run file; stage table + exact redispatch prompts.
- `docs/handoffs/HANDOFF-2026-11-18-run0041-weekly-97.md` — previous handoff (still valid for 314–316).
- `TICKETS.md:405-424` — open tickets.

## 7. How to resume (first 5 minutes)
1. **Orient:** `git status` (expect the staged `model.test.ts` and an in-progress merge),
   `git diff --cached`, `git log --oneline -5`.
2. **Next action:** review the staged diff, then
   `git commit -m "RUN-0041: merge run branch (stage 317, A249) into main"` and set A249 to `[x]`
   in `TICKETS.md:424` (separate `board:` commit is the house style). To back out instead:
   `git merge --abort`.
3. **Then (only when the owner says go):** redispatch 314, 315 (from `226e542`), 316 from the run
   file's prompts, one fresh implementer each, each in its own worktree; land, merge run branch,
   bump 4.30.3 / 0.18.3, ask before pushing.

## 8. Open questions & risks
- **Awaiting owner decision:** when to resume 314–316 and whether to push.
- **Unknowns / untriaged failures:** the full mod run showed 15 failures in suites the merge does
  not touch (main differs from the merge only in `model.test.ts`, so they exist on main too):
  - `agents.test.tsx` (1), `band.test.tsx` (4), `health.test.tsx` (2, incl. "file ran to its end"),
    `runs.test.tsx` (4: F104, A160(3), A196, A197) — **UNKNOWN cause, no ticket checked for them**;
  - `log.test.tsx` (4) — probably A248 (Log tab never wired) and/or A244 (ui.focus stubs);
  - `pane.test.tsx` "the file did not load" — A244 territory.
  File a ticket for the unticketed ones after reproducing.
- **Risks:** leaving `main` mid-merge blocks other git operations until committed or aborted.

## 9. Provenance (verify before trusting this doc)
- **Repo / branch:** skillator2 · `main` (merge in progress, MERGE_HEAD `fe17cc3`)
- **Last commit:** `0d606e1 RUN-0041: stopped at the 97% weekly limit, handoff written`
- **Working tree:** dirty — staged `plugin/mods/ops-board/tests/model.test.ts`; untracked
  `.skillator/baselines/`, `.skillator/sync-2026-11-18-verdicts.md`, this handoff.
- **PR / remote state:** local commits since released 4.30.2 not pushed; no PR.
- **Tests at handoff time:** `claude plugin test` on a scratch copy of the merged mod: 485 pass,
  15 fail (none in model.test.ts).
- **Handoff written by:** Claude Code (Opus 5.5), driver @sher, on 2026-11-19.
