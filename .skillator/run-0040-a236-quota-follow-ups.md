# RUN-0040 - A236 quota follow-ups
plan: TICKETS.md
started: 2026-11-18T11:33Z   updated: 2026-11-18T11:34Z
worktree: C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0040-a236-quota-follow-ups
branch: run/RUN-0040-a236-quota-follow-ups

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 307 | A236 quota gate follow-ups | ~ | build:opus | 2026-11-18T11:34Z | - |

## In flight
### stage 307 - A236 quota gate follow-ups (dispatched 11:34Z)
prompt: |
  grade: bounded · critical yes (money: paid quota turns) · design - · build build=opus · verify orchestrator review · ceremony full (relay run) · ui none · mode single (ruled) · usage 5h 60% 7d 90%
  
  Load skillator:code-yoda first (restraint, full). You are the build agent for RUN-0040 stage 307, ticket A236, in the skillator repo. Work and commit ONLY in C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0040-a236-quota-follow-ups (branch run/RUN-0040-a236-quota-follow-ups). Never push, never edit TICKETS.md. Read the A236 line in TICKETS.md (main checkout C:/tools/Projects/skillator2) whole first.
  SAFETY: never make a real claude call - stub claude first on PATH, temp HOME/USERPROFILE; a real call is a stop. The machine is low on memory: one test process at a time, timeout 300, stdin closed. Ops tests: in plugin/mods/ops-board/ops run node --import ./loader.mjs --test tests/<file>. Commit after each item goes green.
  Scope: items 1, 2, 3, 5, 7, 8, 9, and from item 6 only status.ts validating numbers (a non-number at or 7d is unknown and never skips the hold). NOT item 4 (the shared gate across the three files) - leave it.
  Test-first, red then green per item, both ports where the item names both (usage-watch.sh and usage-watch.ps1 under plugin/skills/watch-cortana/hooks, plus ops reset.ts/status.ts):
  1. reset.ts keeps refresh locks younger than the stale age; a reset then p inside 50 s spends no second turn.
  2. no-node sh failure counter: a record carrying last does not reset the counter (the grep must not match 7d inside last); backoff grows.
  3+8. kill-tree: never kill a child whose start time cannot be read or is later than the parent's; ps1 kills only children with a readable StartTime after the parent's; Windows taskkill /T is not used on an unverified PID.
  5. a good reading written during a turn is kept as the current reading, not moved into last and replaced by the failure record (both ports); level/check still see a 95% weekly.
  6 (part). status.ts treats a non-number at or 7d as unknown.
  7. status.ts turned_at hold blocks only the paid turn; the free get_usage still runs inside the 24 h.
  9. status.ts reads quota-cache.json once per row.
  Run the usage-watch selftests (sh and ps1) and the ops quota/status/reset tests, then the full ops suite once (quota timing tests may flake under load - rerun those alone).
  Commit messages start 'A236:' and end with
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Report in under 15 lines: the shas, red then green per item, suite counts, stub real-call count (0), anything not done.
  


## Rulings
- 2026-11-18T11:34Z - Ruling: A236 item 4 (one shared gate for usage-watch.sh/.ps1/status.ts) stays on the ticket; this round fixes the bugs only - 7d at 90% - cost if wrong: the three copies stay hand-synced one more release. Ruling: mode single - every item touches the same usage-watch/status files.
