# RUN-12 — board sweep, one agent at a time (2026-10-20)

Owner: @cc-0211b2 (Claude Code). Owner request: "can u do pending and in progress tickets using one agent at a time".

## Stages (serial, one agent each)
1. F46-F50 ops-board: one review agent on the staged diff -> fix findings -> commit. [x]
2. B3 ticket-meta.sh CRLF. [x]
3. A132 pending rounding. [x]
4. A135 harness overlays commands/. [x]
5. A130 usage-watch CLAUDE_CONFIG_DIR. [ ]
6. A131 next-id.ps1 lock under load. [ ]
7. Bump, push as bodish-coder, update skillator + install ops-board@skillator in the six profiles with skillator (owner chose 2026-10-20). [ ]

## Log
- 2026-10-20 - Ruling: mode per-task serial - the owner named it - costs wall-clock.
- 2026-10-20 - Ruling: F46-F50 are past build (validate ok, tsc clean, 159/159 tests, ticket-meta/pending sh+ps1 selftests ok, pending ports same facts); no build-jarvis re-pass, only verify + commit - costs a missed design gap the earlier passes did not catch.
- 2026-10-20 - Ruling: /code-review recipe's 5 parallel reviewers replaced by ONE review agent (owner: one agent at a time) - costs findings a narrower pass misses.
- 2026-10-20 - Ruling: relay-morpheus sh selftest was reaped at 0.45 GB free memory; F46-F50 commit without it, GREEN-style note "relay selftest owed" on the board - costs an unseen relay regression until it runs.
- 2026-10-20 - Ruling: F46-F50 live checks are the owner's to see (pane, band, assign round trip); they stay [~] after the commit until the owner reports - costs open rows for built work.
- 2026-10-20 - Ruling: B3/A132/A135 wait for the F46-F50 commit - same files (ticket-meta, pending, baseline-harness) - costs nothing.
- 2026-10-20 - Ruling: A126 and F52 not dispatched - A126 needs the owner's interactive GREEN, F52 is @cu-04f282's and its GREEN waits for 2026-10-23 - costs nothing.
- 2026-10-20 - Ruling: TICKETS.md is committed whole with F46-F50 (F52/A135 board lines from @cu-04f282 included) - the board ships with the work - costs nothing.
- 2026-10-20 - Owner (mid-run): "in pane can we also have agent and workflow tabs" - logged F53. Ruling: F53 is stage 1b, built right after the F46-F50 commit through build-jarvis (one pass, mode single - owner's one-agent rule), before B3 - same mod files as F46-F50, so not before their commit - costs B3..A131 one stage later.
- 2026-10-20 - F46-F50 review (one agent, 5 angles): no issues >= 80, 6 dropped (<=35: restore BOM/invalid-UTF-8 round trip, orphan owner file blocks hides, pre-R1b harness, relative RELAY_DIR sh/ps1, team.md BOM, tasklist pid reuse) - committed.
- 2026-10-20 - A136 (security review of e124610): ops-board ran scripts from the session repo - fixed in the main session (one-line resolver change, RED->GREEN test), not a dispatched agent - costs nothing; the dev-mods live copy keeps the old resolver until the profile update (re-synced then, so its band finds the installed scripts).
- 2026-10-20 - F53 built (one build agent, 2 departures: type column 15, AgentStatus declared locally - both judged sound by verify), verify PASS (validate, tsc, 180/180; 0 issues >= 80, 4 dropped <= 60: closed pane on Agents keeps the 5 s list poll, fast-ending workflow agent may stay running, listing flag on a hung list, run with no runId doubled) - committed, stays [~] for the live check.
- 2026-10-20 - Ruling: B3 fix seat cheap->build (opus): one file pair, but CRLF/awk BINMODE across gawk builds is judgement - costs opus tokens on a small fix.
- 2026-10-20 - B3 fixed (one agent; repro 6->0 CRs before, 6->6 after on assign/decide/decided/tag); my own check: sh selftest ok (2m02s), 5 scratch repros keep CRs; ONE earlier scratch run showed 0 CR lines after assign and never recurred - unexplained, not ticketed (no repro). Ruling: B3 reviewed in the main session (43-line diff), not a review agent - owner's one-agent rule and the size - costs a missed edge. Side finding logged A137 (team add LF on CRLF team.md).
- 2026-10-20 - A132 fixed (one agent, sonnet; failing-first in both ports), my re-run: both selftests ok, ps1 ASCII; agent stopped after its stray background probe - nothing left in the tree.
- 2026-10-20 - Ruling: released the stale watchdog hold (2026-10-19T21:57Z mem 0.9 GB) - memory 4.15 GB free now, green; the live mod copy cannot release it (A136 sync points it at installed 4.8.1, which has no watchdog command) - costs a dispatch under low memory if it drops again before the profile update.
- 2026-10-20 - relay selftest re-run killed by the low-memory reaper again (sh never finished; 4.15 -> 3.62 GB and falling); orphan selftest bash stopped; not restarted - owed, owner to decide (reaper flag or free memory).
- 2026-10-20 - A135 fixed (one agent, sonnet; failing-first; harness selftest ok in the FOREGROUND - the reaper only kills background commands). Reviewed in the main session (17-line diff).
