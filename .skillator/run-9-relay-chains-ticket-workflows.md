# RUN-9 - relay chains ticket workflows
plan: TICKETS.md
started: 2026-10-09T18:04Z   updated: 2026-10-09T20:54Z

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 60 | F31 design + plan | x | deep:fable | 2026-10-09T18:14Z | pending |
| 61 | F31 RED baselines | ~ | build:opus | 2026-10-09T20:54Z | - |
| 62 | F31 scripts: codes, usage careful level, listener |   | - | - | - |
| 63 | F31 skill text: relay chain mode + zordon/cortana pointers |   | - | - | - |
| 64 | F31 GREEN |   | - | - | - |
| 65 | verify review bump commit push |   | - | - | - |

## In flight
### stage 60 - F31 design + plan  (dispatched, deep:fable)
prompt: |
  RUN-9 stage 60, F31. Design how relay-morpheus chains ticket workflows and
  write docs/plans/PLAN-relay-chain.md: plan-from-board, 4-char [A-Z0-9]
  code registry, auto-next on Workflow completion, 80% hold + Monitor
  listener on usage-watch, 7-day 90% hard stop, "next stage" override,
  blocked re-check, crash/resume, per-host fallbacks. Name every failure
  mode and its guard. RED scenarios to record in stage 61. No code, no commit.

### stage 61 - F31 RED baselines  (dispatched, build:opus)
prompt: |
  RUN-9 stage 61, F31. Per docs/plans/PLAN-relay-chain.md §Tests: add the
  relay-chain fixture and CLAUDE_USAGE_WATCH_DIR override only as far as RED
  needs, write the 3 RED scenarios (chain, hold at 84%, resume with hold),
  run each RED twice via baseline-harness, record verbatim verdicts.
  Never two hidden runs; stop if CLAUDE.md.skillator-hidden exists. No commit.

## Rulings
- 2026-10-09 - stage 60 landed: design in docs/plans/PLAN-relay-chain.md (relay chain commands, next-id kind W base-36 codes, usage-watch `level`, `chain wait` listener under Monitor, 18 failure modes). Open risks carried to stage 62 as must-verify: five_hour statusline key, Monitor max wait.
- 2026-10-09 - owner decisions (AskUserQuestion): at 80% finish the running workflow, hold, listener resumes (7-day window stays the 90% hard stop); blocked tickets re-checked before each stage; codes are 4 chars from A-Z0-9, never reused. Home: owner asked for the most reliable option; chosen = extend relay-morpheus (it already owns run files, stage numbers, resume, orphans and the SessionStart listing; a second skill would duplicate run state and contest routing - F29 showed a routing contest failing 0/4). Chain mechanics go in relay-morpheus/references, not the SKILL.md body.
- 2026-10-09 - RUN-9 runs alongside RUN-8 stage 58 (A110): no shared files (A110 = code-yoda + harness fixture; F31 = relay-morpheus, watch-cortana, tickets-zordon pointer). F31 RED/GREEN must not run while A110's GREEN holds ~/.claude/CLAUDE.md hidden (never two hidden runs at once) - stage 61/64 check for CLAUDE.md.skillator-hidden first.
- 2026-10-09 - Tiers: 60 deep:fable (design), 61 build:opus, 62 build:opus (scripts, sh+ps1 twins), 63 deep:fable fix / opus verify (skill text), 64 build:opus, 65 main session.
- 2026-10-10 - session limit (429) killed stage 61 mid-run: 3 scenario files and 10 transcripts (chain 1-4, hold 1-4, resume 1-2) exist, verdicts not recorded. Re-dispatched to finish from what is on disk, not to re-run what exists. usage-watch.sh check hung >100s twice (stage-53 agent; first command after the reset), not reproduced since (5/5 clean, scan 0.1s): no ticket; next hang, capture `sh -x` to a log.
