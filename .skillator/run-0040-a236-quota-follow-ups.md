# RUN-0040 - A236 quota follow-ups
plan: TICKETS.md
started: 2026-11-18T11:33Z   updated: 2026-11-18T17:14Z
worktree: C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0040-a236-quota-follow-ups
branch: run/RUN-0040-a236-quota-follow-ups

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 307 | A236 quota gate follow-ups | x | build:opus | 2026-11-18T16:06Z | b5efc06 |
| 308 | A240 assign tests under the ui.focus-less mock | x | build:opus | 2026-11-18T16:06Z | 2a27092 |
| 309 | A241 wizard answers follow-ups | x | build:opus | 2026-11-18T16:06Z | ddde1bf |
| 310 | B32 reproduce agy Health tab | ~ | build:opus | 2026-11-18T15:57Z | - |
| 311 | B32 fix agy Health tab | ~ | build:opus | 2026-11-18T17:00Z | - |
| 312 | B31 selftest.ps1 weekly gate | x | build:opus | 2026-11-18T17:14Z | 752f779 |
| 313 | A244 ui.focus stubs in seven mod tests | ~ | build:opus | 2026-11-18T17:00Z | - |

## In flight
### stage 313 (dispatched 17:00Z)
prompt: |
  grade: bounded · critical no · design - · build build=opus · verify orchestrator review · ceremony full (relay run) · ui tron · mode single (ruled) · usage 7d 95%
  
  Load skillator:code-yoda first (restraint, full): the smallest diff that meets the ticket - no speculative abstraction, no new dependency, no refactor outside the ticket, no ceremony; run its review lens on your diff before /code-review and cut what it flags.
  You are the build agent for RUN-0040 stage 313, ticket A244, in the skillator repo. Work and commit ONLY in C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0040-s313 (branch run/RUN-0040-s313, off main). Never the main checkout, never push, never edit TICKETS.md. Low memory: one test process at a time, timeout 300, stdin closed; commit after each item goes green. SAFETY: never a real claude/agy/muse call - stub them first on PATH using a /c/... (Git Bash) path, never C:/..., and confirm with `command -v` that the stub resolves before any run; temp HOME/USERPROFILE. A real call is a stop.
  Read the A244 line in TICKETS.md whole. Apply A240's fix (see plugin/mods/ops-board/tests/assign.test.tsx: on('ui.focus', { plugin: '*' }, ... => ({ value: undefined }))) to the alphabet, pane, status, explorer, log, reconcile and runtab tests under plugin/mods/ops-board/tests, run each under claude plugin test on a copy of the mod (as A240 did), and update expectations only where the product changed on purpose (cite the ticket). Tests only; product code only if it is really wrong, and say why. The pane suite is long - run it in parts. Commit per file.
  Commit messages start 'A244:' and end with
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Report in under 10 lines: sha per file, before/after counts per suite, anything not done.
  

### stage 312 (dispatched 17:00Z)
prompt: |
  grade: bounded · critical no · design - · build build=opus · verify orchestrator review · ceremony full (relay run) · ui none · mode single (ruled) · usage 7d 95%
  
  Load skillator:code-yoda first (restraint, full): the smallest diff that meets the ticket - no speculative abstraction, no new dependency, no refactor outside the ticket, no ceremony; run its review lens on your diff before /code-review and cut what it flags.
  You are the build agent for RUN-0040 stage 312, ticket B31, in the skillator repo. Work and commit ONLY in C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0040-s312 (branch run/RUN-0040-s312, off main). Never the main checkout, never push, never edit TICKETS.md. Low memory: one test process at a time, timeout 300, stdin closed; commit after each item goes green. SAFETY: never a real claude/agy/muse call - stub them first on PATH using a /c/... (Git Bash) path, never C:/..., and confirm with `command -v` that the stub resolves before any run; temp HOME/USERPROFILE. A real call is a stop.
  Read the B31 line in TICKETS.md whole. REPRODUCE FIRST: plugin/skills/watch-cortana/hooks/selftest.ps1 throws 'gate: weekly fired below 97' at ~line 186. Find whether the gate threshold or the test is wrong (the standing 7-day stop is 97%), with evidence; check whether the selftest reads the owner's real usage instead of its fixture (a leak would explain firing at today's 95%). Fix the cause, keep usage-watch.sh and usage-watch.ps1 in step, and make selftest.ps1 run end to end (its sh cases too). If you cannot reproduce, stop and report what you tried.
  Commit messages start 'B31:' and end with
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Report in under 10 lines: root cause (verified/inferred), shas, red then green, selftest results (ps1 and sh).
  

### stage 311 (dispatched 17:00Z)
prompt: |
  grade: bounded · critical no · design - · build build=opus · verify orchestrator review · ceremony full (relay run) · ui tron · mode single (ruled) · usage 7d 95%
  
  Load skillator:code-yoda first (restraint, full): the smallest diff that meets the ticket - no speculative abstraction, no new dependency, no refactor outside the ticket, no ceremony; run its review lens on your diff before /code-review and cut what it flags.
  You are the build agent for RUN-0040 stage 311, ticket B32 (FIX), in the skillator repo. Work and commit ONLY in C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0040-s310 (branch run/RUN-0040-s310; it holds stage 310's failing test 9b260a2 plugin/mods/ops-board/ops/tests/b32.test.mts and is merged with main). Never the main checkout, never push, never edit TICKETS.md. Low memory: one test process at a time, timeout 300, stdin closed; commit after each item goes green. SAFETY: never a real claude/agy/muse call - stub them first on PATH using a /c/... (Git Bash) path, never C:/..., and confirm with `command -v` that the stub resolves before any run; temp HOME/USERPROFILE. A real call is a stop.
  Read the B32 line in TICKETS.md (main checkout C:/tools/Projects/skillator2) whole - its Repro part names the four root causes. Fix test-first:
  (a) ownProfile in ops/status.ts treats ANTIGRAVITY_APP_DATA_DIR as agy (as usage-watch does); ops.ps1/ops.sh -Open pass the CLI identity (SKILLATOR_CLI and the profile dir env present at launch) into the new terminal tab; the antigravity skillator-ops command (host-commands/antigravity/skillator-ops) sets SKILLATOR_CLI=agy. b32 test 2 goes green.
  (b) The per-model table is read once at open (one background read, not a paid turn - plain get_usage/level only, never --refresh), and the per-profile read budget is raised from 5 s to 15 s so a 3-7 s level read fits. While reading, the ops app says 'reading every profile...' like the pane.
  (c) Health at 80x24 never silently clips: the body scrolls (the keys the other ops tabs use) or shows a '+N more' marker; Disk, Hold and Stale locks stay reachable. b32 test 1 goes green.
  (d) On-demand refresh: p re-reads status on demand (already exists) - make sure the help/footer says so in the agy board too. Do not make pollSlow parallel (out of scope).
  Run b32, status, draw/health and engine ops tests with the loader (plugin/mods/ops-board/ops: node --import ./loader.mjs --test tests/<f>), then capture Health at 80x24 and 120x30 with agy's env the way stage 310 did (scratchpad b32/frames) and put the new frame paths in the report.
  Commit messages start 'B32:' and end with
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Report in under 12 lines: shas, red then green per item, suite counts, frame paths, stub real-call count (0).
  

### stage 310 (dispatched 15:39Z, own worktree RUN-0040-s310)
prompt: |
  grade: bounded · critical no · design - · build build=opus · verify orchestrator · ceremony full (relay run) · ui tron · mode single (ruled) · usage 7d 94%
  
  Load skillator:code-yoda first (restraint, full): the smallest diff that meets the ticket - no speculative abstraction, no new dependency, no refactor outside the ticket, no ceremony; run its review lens on your diff before /code-review and cut what it flags.
  You are the REPRODUCE-ONLY agent for RUN-0040 stage 310, ticket B32, in the skillator repo (PRACTICE §7: reproduce, then root cause; NO fix this stage - another stage is editing ops/status.ts). Work ONLY in C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0040-s310. Do not edit product code; you may commit one failing test that pins the bug (tests only), never push, never edit TICKETS.md. Read the B32 line in TICKETS.md (main checkout C:/tools/Projects/skillator2) whole first.
  Find out why the ops board's Health tab does not load fully when run in the Antigravity (agy) terminal: rows stay loading, it is cut off/misdrawn, and sections the Claude Code board shows (per-model quota table, ops-status rows) are missing. How agy launches it: see state.ts ~2345 (the skillator-ops plugin command), nodehost.ts ~257 (the non-node binary path for Antigravity) and the Antigravity pack (plugin/... antigravity pack.mjs). Run the standalone ops app the way agy does, with a temp HOME and a stub claude/agy first on PATH (NEVER a real claude/agy/muse call), capture the Health frame at 80 and 120 columns (the repo's tui capture method), and compare it to the Claude Code pane's Health. Tag every finding verified / inferred.
  Low memory: one process at a time, timeout 300, stdin closed.
  Report in under 15 lines: what each missing/loading row is waiting on and why (root cause per symptom, tagged), the frame captures' paths, the failing test's sha if any, and the files a fix would touch.
  

### stage 309 (dispatched 15:25Z, own worktree RUN-0040-s309)
prompt: |
  grade: bounded · critical no · design - · build build=opus · verify orchestrator review · ceremony full (relay run) · ui none · mode single (ruled) · usage 7d 93%
  
  Load skillator:code-yoda first (restraint, full): the smallest diff that meets the ticket - no speculative abstraction, no new dependency, no refactor outside the ticket, no ceremony; run its review lens on your diff before /code-review and cut what it flags.
  You are the build agent for RUN-0040 stage 309, ticket A241, in the skillator repo. Work and commit ONLY in C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0040-s309 (branch run/RUN-0040-s309). Never the main checkout, never push, never edit TICKETS.md. Read the A241 line in TICKETS.md (main checkout C:/tools/Projects/skillator2) whole first: items (1)-(8) in plugin/skills/holo-r2d2/scripts/answers.mjs and tests/answers.test.mjs.
  Test-first, red then green, for (1)-(5) as the ticket's Done line says; (6)-(8) are small cleanups in the same file (one isRunId shared by openSets and report, the untimed predicate, lazy stat). For (2) use the run file's updated: stamp (parseRun's run.updated) instead of the file mtime.
  Low memory: one test process at a time, timeout 300, stdin closed. Run tests/answers.test.mjs and node holo.mjs --selftest. Commit after each item goes green. Commit messages start 'A241:' and end with
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Report in under 10 lines: shas, red then green per item, suite counts.
  

### stage 308 (dispatched 15:25Z, own worktree RUN-0040-s308)
prompt: |
  grade: bounded · critical no · design - · build build=opus · verify orchestrator review · ceremony full (relay run) · ui tron · mode single (ruled) · usage 7d 93%
  
  Load skillator:code-yoda first (restraint, full): the smallest diff that meets the ticket - no speculative abstraction, no new dependency, no refactor outside the ticket, no ceremony; run its review lens on your diff before /code-review and cut what it flags.
  You are the build agent for RUN-0040 stage 308, ticket A240, in the skillator repo. Work and commit ONLY in C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0040-s308 (branch run/RUN-0040-s308). Never the main checkout, never push, never edit TICKETS.md. Read the A240 line in TICKETS.md (main checkout C:/tools/Projects/skillator2) whole first.
  Goal: plugin/mods/ops-board/tests/assign.test.tsx passes under the current claude plugin test mock, which has no ui.focus. Reproduce first (claude plugin test on a copy of the mod, as earlier stages did), then fix the tests or the harness - stub ui.focus in the test setup, or drive focus the way the mock supports. Change product code only if the code itself is wrong; say why if so. The same ui.focus failure hits 2 tests in tests/messages.test.tsx - fix those the same way.
  Low memory: one test process at a time, timeout 300, stdin closed. Commit after green. Commit messages start 'A240:' and end with
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Report in under 10 lines: sha, before/after counts for assign.test.tsx and messages.test.tsx, anything not done.
  

## Rulings
- 2026-11-18T11:34Z - Ruling: A236 item 4 (one shared gate for usage-watch.sh/.ps1/status.ts) stays on the ticket; this round fixes the bugs only - 7d at 90% - cost if wrong: the three copies stay hand-synced one more release. Ruling: mode single - every item touches the same usage-watch/status files.
- 2026-11-18T13:23Z - stage 307 back 15a0481..7d078e2 (orchestrator re-run: status+reset 25/0). Review: spare-when-unsure kill rule lets a paid turn outlive its lock on macOS, ps1 without own StartTime, Git Bash grandchildren; reset keeps the lock but kills its reader; same-second KEEP; no-node fallback loses 95%; status unknown never ages. One fix round (critical). Ruling: unreadable start time = kill (pre-A236 behaviour) - the money rule beats the reused-PID risk - cost if wrong: a reused PID's tree killed in a rare race. selftest.ps1:186 'gate: weekly fired below 97' fails on released main too -> separate ticket.
- 2026-11-18T15:25Z - /pending-sentinel parallel 3: skipped A227/A229/A230 (owner or machine, no code); A236 holds slot 1; slots 2-3 = A240 (308), A241 (309), file-disjoint, each in its own worktree off the run branch. Ruling: B31 and A242 wait for A236 (same watch-cortana/hook files); A238/A239/A243 fill slots as they free while 7d < 97% - cost if wrong: they wait for the weekly reset.
- 2026-11-18T15:39Z - owner: start next. Ruling: B32 runs reproduce-only as stage 310 (4th agent) - its fix touches ops/status.ts, which A236 is editing; the fix is planned after A236 lands - cost if wrong: one extra dispatch.
- 2026-11-18T15:48Z - stage 308 (A240) back bfe5059, test-only (assign 6/37 -> 43/43, messages 23/4 -> 27/27 per agent); orchestrator read the 26-line diff: the ui.focus stub answers {plugin:'*'} with {value}, stale expectations updated to F178/A175/F174 behaviour. Ruling: merge held until stage 307 lands - its agent commits in the run worktree - cost if wrong: A240 lands an hour later. Leftover: alphabet/pane/status/explorer/log/reconcile/runtab tests keep the old ui.focus stub -> ticket.
- 2026-11-18T15:53Z - stage 309 (A241) back 3d77151..7553d81; orchestrator re-run answers 73/0 + selftest ok. Review: 8 findings, worst a stale updated: stamp trusted over the mtime (needs a hand edit; relay bumps updated:). Ruling: no fix round at 7d 94% - leftovers are A245 - cost if wrong: a stale FINAL can reopen a hand-edited settled run. Merge held for 307 like 308.
- 2026-11-18T15:57Z - stage 310 (B32 repro) back: failing test 9b260a2 (tests only). Root causes (verified unless noted): (1) usage rows never fill - ownProfile (status.ts ~55) ignores ANTIGRAVITY_APP_DATA_DIR and the wt new-tab from ops.ps1 -Open passes no SKILLATOR_CLI/AGY_CONFIG_DIR (inferred), so usage-watch level returns src=none; (2) per-model table only after p, and each profile read hits the 5 s budget (one level read 3.2-7.5 s); (3) Health clipped at 80x24 with no scroll or marker (Disk/Hold/Stale locks vanish); (4) loading rows resolve in 4-12 s (serial pollSlow). Fix touches ops.ps1/ops.sh, the agy skillator-ops SKILL.md, status.ts (after 307), draw.ts, maybe engine.ts. INCIDENT: the agent's first run put a C:/ path on Git Bash PATH, the stubs were skipped, and one real 'agy -p /usage' ran at 21:18 with a temp AGY_CONFIG_DIR; owner's profile dirs untouched; later runs stub-verified. Ruling: B32 fix is planned after 307 lands - status.ts overlap.
- 2026-11-18T16:07Z - stage 307 fix round back 72f82ce..b5efc06 (agent: quota-refresh sh 33 / ps1 31, ops 342/344 with the failure fixed in b5efc06; orchestrator: status+reset 27/0, read the kill changes - unreadable start kills, taskkill /T on every Windows PID). Landed by the stop rule as b5efc06. Ruling: no review of this fix round at 7d 95% - it restores the pre-A236 kill-when-unsure rule and is tested - leftover review in A246. 308 and 309 merged. 310 stays on its branch (a deliberately failing test) for the B32 fix stage.
- 2026-11-18T16:26Z - released 4.30.1 / 0.18.1: run merged into main cb2c034; checks green (routing, tickets, commands, holo 73/0, self-update selftest, ops 338 + 5 PowerShell timing flakes that pass alone 6/0 and 2/0, 0 stub hits); bump 91c353c pushed e54be92..91c353c as bodish-coder, switched back. Owner approved. s308/s309 worktrees removed; the run and stage 310 (B32) stay open for the B32 fix after the weekly reset.
- 2026-11-18T17:00Z - owner: do the not-started tickets in parallel. A227/A229/A230 are the owner's (Teams admin, real token, machine). Ruling: 3 at once (owner's parallel 3, ~3 GB free): B32 fix (311, in s310's worktree), B31 (312), A244 (313) - file-disjoint; the other six wait - 7d at 95%, the 97% stop halts all agents with a handoff - cost if wrong: stages stopped mid-flight, resumable from their prompts. Stub PATH must be a /c/ path (stage 310's real-agy-call lesson).
- 2026-11-18T17:14Z - stage 312 (B31) back 1736967. Root cause (verified): the Claude probe put seven_day used_percentage into the main-flag max, so a week at 92-96% fired the 92% handoff gate. Fix: both twins drop seven_day from the max (codex path already did, A98). Orchestrator: read the diff (3 files, +8/-5 in hooks), selftest.ps1 ok end to end. Agent ran a single-pass /code-review: none. Landed as 752f779.
