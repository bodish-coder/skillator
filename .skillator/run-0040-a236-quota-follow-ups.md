# RUN-0040 - A236 quota follow-ups
plan: TICKETS.md
started: 2026-11-18T11:33Z   updated: 2026-11-18T13:23Z
worktree: C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0040-a236-quota-follow-ups
branch: run/RUN-0040-a236-quota-follow-ups

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 307 | A236 quota gate follow-ups | ~ | build:opus | 2026-11-18T13:23Z | - |

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
  


last seen: build 7d078e2; review found money regressions.
fix round (dispatched 13:23Z) prompt: |
  grade: bounded · critical yes (money: paid quota turns) · design - · build build=opus · verify orchestrator review · ceremony full (relay run) · ui none · mode single (ruled) · usage 5h 81% 7d 92%
  
  Load skillator:code-yoda first (restraint, full). The ONE fix round for RUN-0040 stage 307 (A236); fix exactly these, anything else is a ticket. Work and commit ONLY in C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0040-a236-quota-follow-ups (head 7d078e2). Never push, never edit TICKETS.md. Stub claude only, temp HOME/USERPROFILE; a real call is a stop. One test process at a time, timeout 300, stdin closed. Commit after each item.
  The principle: a capped paid turn must never outlive its lock. Spare a PID only when it is PROVABLY not ours (readable start time earlier than the parent's); when start times cannot be read, fall back to killing the process group / the parent-linked tree as before A236.
  Test-first:
  1. usage-watch.sh kill_tree: no /proc (macOS) or an unreadable start tick -> the child IS killed (as before A236); only a readable start strictly earlier than the parent's spares it. Test with the start-tick reader stubbed to print nothing.
  2. usage-watch.ps1 timeout path: if its own StartTime cannot be read, still kill the capped call's children by parent PID (taskkill /T on them), never kill nothing. Restore the removed F176 test's case.
  3. usage-watch.sh on Git Bash: a listed child that passes the check is killed with taskkill /T on its Windows PID (not plain kill -9), so native node.exe under claude.cmd dies.
  4. reset.ts: if it keeps a lock younger than 90 s, it must not kill that lock's reader; or (preferred, simpler) when it kills the refresh processes, it removes their locks too. Pick one consistent rule and test it on the Windows path.
  5. KEEP check (both ports): a reading counts as written during this refresh only when its mtime is strictly after the refresh start (sub-second where available; else strictly greater whole second).
  6. sh no-node fallback: a current reading is kept the same way the node branch keeps it, or the no-node branch keeps the prior reading under last - level/check still see a 95% weekly. Test without node.
  7. status.ts: a non-number 7d/at older than the 7-day age is aged out like a numeric one (the read runs); re-read the cache after row() when the read is held, so via/models are current. Hoist isNum beside num; drop the empty branch.
  Out of scope (ticket): the 90 s constant shared between reset.ts and usage-watch.
  Run quota-refresh-a216 (sh + ps1, chunked as before), ops status/reset/quota tests, then the full ops suite once. selftest.ps1 line 186 fails on main too - ignore it.
  Commit messages start 'A236:' and end with
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Report in under 12 lines: shas, red then green per item, suite counts, stub real-call count (0).
  

## Rulings
- 2026-11-18T11:34Z - Ruling: A236 item 4 (one shared gate for usage-watch.sh/.ps1/status.ts) stays on the ticket; this round fixes the bugs only - 7d at 90% - cost if wrong: the three copies stay hand-synced one more release. Ruling: mode single - every item touches the same usage-watch/status files.
- 2026-11-18T13:23Z - stage 307 back 15a0481..7d078e2 (orchestrator re-run: status+reset 25/0). Review: spare-when-unsure kill rule lets a paid turn outlive its lock on macOS, ps1 without own StartTime, Git Bash grandchildren; reset keeps the lock but kills its reader; same-second KEEP; no-node fallback loses 95%; status unknown never ages. One fix round (critical). Ruling: unreadable start time = kill (pre-A236 behaviour) - the money rule beats the reused-PID risk - cost if wrong: a reused PID's tree killed in a rare race. selftest.ps1:186 'gate: weekly fired below 97' fails on released main too -> separate ticket.
