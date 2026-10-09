# RUN-8 - drain the board 3
plan: TICKETS.md
started: 2026-10-09T17:48Z   updated: 2026-10-09T20:54Z

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 57 | A111 harness allow-list | x | main:opus | 2026-10-09T17:51Z | pending |
| 58 | A110 absorb ponytail 5.x into code-yoda | x | deep:fable | 2026-10-09T18:13Z | pending |
| 59 | verify review bump commit push | ~ | main:opus | 2026-10-09T20:54Z | - |

## In flight
### A110 absorb ponytail 5.x into code-yoda  (dispatched, deep:fable)
prompt: |
  RUN-8, ticket A110. Upstream ponytail moved ff5d093..2a1fe84 (5.x rebuilt
  rules/review/audit; marker `ponytail:` renamed `shortcut:`). Follow
  design-arwen's UPSTREAM procedure via skills/code-yoda/UPSTREAM.md: diff the
  watched paths, adopt what fits code-yoda's wisdom framing, reject the rest
  with a reason, debt scan + fixture accept both marker spellings, RED/GREEN
  any behaviour change per skill-smith, bump the absorbed commit. No commit.

## Rulings
- 2026-10-09 - scope: A110 + A111. A62/A62d stay [>]: prime-agent still not installed (condition not arrived).
- 2026-10-09 - A111 and A110 both may edit baseline-harness.sh, so sequential; A111 done in the main session (3-line allow-list), verified by a real nested probe: old list denied next-id.sh (1 denial), new list ran it (0).
- 2026-10-09 - A110 tier: fix deep:fable (what to absorb is judgement), verify in main session + code-review.
- 2026-10-09 - stage 58 returned: A110 absorbed (adopt/adapt/reject table in code-yoda/UPSTREAM.md; 5.x review/audit widening into bugs/security rejected - that is code-review/audit-sherlock). Regression GREEN debt 1/1 + review 1/1, upstream-check unchanged. Accepted: code-yoda SKILL.md 1396 words (was 1170) though armed every session - the growth is upstream scope/reuse rules. Description spelling gap logged as A112 (needs its own RED/GREEN).
- 2026-10-09 - review pass 1 (medium): 10 findings. Fixed: description edit reverted (A112 owns it, UPSTREAM reject row now true), rung 2/3 contradiction (a house helper hand-rolling the stdlib stays a stdlib: finding), "bug fix lands once" dropped from core (correctness, not restraint), debt scan excludes css/scss/less, user marker words (TODO/HACK) rejected as ledger rows, two reflows, harness notes the .ps1 twins sit behind the nested-PowerShell wall. A110 debt GREEN reclassified from PASS to RULE HELD / FORMAT DRIFT; re-running x2. RUN-8 commit also carries docs/plans/PLAN-relay-chain.md and the RUN-9 file so the [~] F31 row is backed.
- 2026-10-10 - debt re-GREEN x2: RULE HELD 2/2 (no invented trigger), FORMAT DRIFT 2/2 (labels renamed, ceiling "not stated", totals reworded). Cause: § The ledger said "slots REQUIRED" but never "print the labels literally", and had no ceiling fallback. Fix per skill-smith §3 (shaping failure -> positive recipe): literal shape statement, two filled example rows, whole-comment-as-ceiling rule, literal totals example. Re-running x2.
- 2026-10-10 - session limit (429) killed the ledger-recipe re-GREEN mid-run; ~/.claude/CLAUDE.md verified intact, no hidden file left; no partial section was appended. Re-dispatched.
- 2026-10-10 - ledger-recipe re-GREEN x2: RULE 2/2, FORMAT 2/2 (literal labels, comment-as-ceiling, literal totals, shortcut: harvested). Caveat taken: the recipe examples were this fixture's own rows, so they were replaced with off-fixture rows (worker.js / billing.py); the four non-example rows per run are the evidence and matched. Harness: only the RUN-8 hunk staged (RUN-9 stage 61 is editing the same file).
- 2026-10-10 - review pass 2 (medium): 10 findings, all fixed: totals example changed off the fixture answer (4 markers, 1 no-trigger), stylesheet exclusion reverted in favour of the read-the-line drop (keeps real /* shortcut: */ markers in CSS), UPSTREAM rows made true (bug-fix rule rejected, wrapper rule adapt, user marker word removed from the manifest), "comment only the why" excepts markers, §4 example carries the unchecked slot, harness selftest covers all six A111 rules (index copy edited directly - the worktree file also holds RUN-9 stage 61 edits), two rewraps.
- 2026-10-10 - caught before commit: the staged baseline-harness.sh carried ~330 lines of RUN-9 stage 61's in-progress relay-chain fixture (the first `git add -A` ran after stage 61 started; a later check grepped `relay-chain` while the code spells `relay_chain`). Rebuilt the index copy from HEAD + RUN-8 hunks only (A110 marker + selftest, A111 rules + comment + six-rule selftest); staged copy selftest ok, mode 100755. Pass-3 findings on relay-chain code are out of RUN-8 scope.
- 2026-10-10 - review pass 3 (final, cap reached): 9 findings. #1 (RUN-9 code in the index) already fixed by the index rebuild; plan doc + RUN-9 file stay in on purpose (back the [~] F31 row). Fixed: mid-line markers (`.*` in the scan), review native: excepts house components, ledger template split into two literal forms with what-in-comment-words examples, totals example matches its own two rows, audit example moved off the fixture (was the fixture answer), stale fixture comment (six markers), README line. #5 (description spelling) is A112. No fourth pass.
