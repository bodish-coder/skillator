# RUN-1 - relay-morpheus: staged runs that survive sessions
plan: docs/plans/PLAN-relay-morpheus.md
started: 2026-09-22T03:15Z   updated: 2026-09-22T04:37Z

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 1 | S0 plan+tickets | x | model:opus-5 | 2026-09-22T03:15Z | 00c4854 |
| 2 | S1 RED baselines | x | model:opus-5 | 2026-09-22T03:15Z | 00c4854 |
| 3 | S2 relay-morpheus skill + run file | x | model:opus-5 | 2026-09-22T03:15Z | 0ef3e0f |
| 4 | S3 relay-morpheus scripts + orphans | x | model:opus-5 | 2026-09-22T03:15Z | 0ef3e0f |
| 5 | S4 tasks-sentinels (RED debt A76) | x | model:opus-5 | 2026-09-22T04:37Z | pending-commit |
| 6 | S5 watch-cortana weekly gate | x | model:opus-5 | 2026-09-22T03:39Z | edbd432 |
| 7 | S6 grayskull rules | x | model:opus-5 | 2026-09-22T03:39Z | edbd432 |
| 8 | S7 GREEN + ship | x | model:opus-5 | 2026-09-22T03:40Z | 538b975 |

## In flight
### stage 5 - S4 tasks-sentinels  (SHIPPED; the RED debt is A76)
Left `!` on purpose. No valid RED exists, so no skill was written; both
scenarios are void and the reason is in each file. To finish it, the next
session needs a fixture whose stages live in genuinely separate modules -
`practice/scripts/baseline-harness.sh` `build_relay` is the one to fork.
prompt: |
  Add a `relay-split` fixture to practice/scripts/baseline-harness.sh whose
  four plan stages touch four different modules with no shared file, then
  re-run practice/baselines/scenario-tasks-sentinels-v2.txt against it, twice.
  Record the verdict in that scenario file. Do not write a skill unless it
  VIOLATES.

### stage 8 - S7 GREEN + ship
GREEN done (`practice/baselines/green-relay-morpheus.txt`); this row closes when the
final commit lands.

## Rulings
- 03:05Z - the resume half of relay is not written - the baseline COMPLIED,
  and skill-smith calls writing it anyway reason 3 - costs a rewrite if a
  later run does lose a mid-run tree.
- 03:06Z - no `tasks-sentinels` skill - the RED fixture's stages share a file,
  so both runs correctly declined to fan out - costs the port if a clean
  fixture later shows real under-dispatch.
- 03:08Z - weekly gate is a separate flag file, not a second line in the
  existing one - A12 fixed that file to bare bytes with no line endings -
  costs one extra file per session.
- 03:45Z - relay's description is NOT edited despite failing to invoke 2/2 on
  the RED scenario - deleting one counter-pressure sentence makes the same
  description fire, so the cause is a competing instruction, which testing.md
  says to rule out before rewording - costs a reword if a clean prompt ever
  fails to invoke too. Filed as A74.

