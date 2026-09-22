# RUN r2609220315 - relay: staged runs that survive sessions
plan: docs/plans/PLAN-relay.md
started: 2026-09-22T03:15Z   updated: 2026-09-22T03:15Z

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 1 | S0 plan+tickets | x | model:opus-5 | 2026-09-22T03:15Z | 00c4854 |
| 2 | S1 RED baselines | x | model:opus-5 | 2026-09-22T03:15Z | 00c4854 |
| 3 | S2 relay skill + run file | x | model:opus-5 | 2026-09-22T03:15Z | 0ef3e0f |
| 4 | S3 relay.sh/.ps1 + orphans | x | model:opus-5 | 2026-09-22T03:15Z | 0ef3e0f |
| 5 | S4 subagent-drive (void RED) | ! | model:opus-5 | 2026-09-22T03:15Z | - |
| 6 | S5 handoff-watch weekly gate | ~ | model:opus-5 | 2026-09-22T03:15Z | - |
| 7 | S6 grayskull rules | ~ | model:opus-5 | 2026-09-22T03:15Z | - |
| 8 | S7 GREEN + ship |   | - | - | - |

## In flight
### stage 5 - S4 subagent-drive  (FAILED, not in flight)
Left `!` on purpose. No valid RED exists, so no skill was written; both
scenarios are void and the reason is in each file. To finish it, the next
session needs a fixture whose stages live in genuinely separate modules -
`practice/scripts/baseline-harness.sh` `build_relay` is the one to fork.
prompt: |
  Add a `relay-split` fixture to practice/scripts/baseline-harness.sh whose
  four plan stages touch four different modules with no shared file, then
  re-run practice/baselines/scenario-subagent-drive-v2.txt against it, twice.
  Record the verdict in that scenario file. Do not write a skill unless it
  VIOLATES.

### stages 6-7 - S5 handoff-watch, S6 grayskull rules
Staged, not committed, pending `/code-review medium` on the staged diff.
prompt: |
  The staged diff adds a 7-day usage gate to handoff-watch (weekly flag,
  90% default, step 4 = AskUserQuestion with a recommendation) and wires
  relay into grayskull-power's arming, routing and ground rules. Address the
  review findings, then commit.
last seen: both selftests green, both mutation-checked.

## Rulings
- 03:05Z - the resume half of relay is not written - the baseline COMPLIED,
  and skill-smith calls writing it anyway reason 3 - costs a rewrite if a
  later run does lose a mid-run tree.
- 03:06Z - no `subagent-drive` skill - the RED fixture's stages share a file,
  so both runs correctly declined to fan out - costs the port if a clean
  fixture later shows real under-dispatch.
- 03:08Z - weekly gate is a separate flag file, not a second line in the
  existing one - A12 fixed that file to bare bytes with no line endings -
  costs one extra file per session.

