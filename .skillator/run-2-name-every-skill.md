# RUN-2 - name every skill for a character
plan: docs/plans/PLAN-rename.md
started: 2026-09-22T06:21Z   updated: 2026-09-22T17:23Z

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 1 | S1 sign-off | x | model:opus-5 | 2026-09-22T08:29Z | 2f5ca11 |
| 2 | S2 mechanical rename | x | model:opus-5 | 2026-09-22T17:15Z | pending |
| 3 | S3 the references nothing greps | x | model:opus-5 | 2026-09-22T17:18Z | pending |
| 4 | S4 prove nothing dangles | x | model:opus-5 | 2026-09-22T17:23Z | pending |

## In flight
### stage 2 - the mechanical rename
19 of 23 skills move. Full mapping in docs/plans/PLAN-rename.md, "Settled".
prompt: |
  Rename the 19 skills listed under "Settled" in docs/plans/PLAN-rename.md.
  Per skill: git mv the directory, the name: frontmatter, the # heading, hook
  script filenames, every skillator:<old> and skills/<old> reference, the
  /slash name, and the scenario-<skill>.txt / green-<skill>.txt baselines.
  Do NOT touch harness fixture names in practice/scripts/baseline-harness.sh,
  historical prose in TICKETS.md closed entries, docs/handoffs/*, or the
  recorded verdict text inside baseline files.

## Rulings
- 07:1xZ - grouping S2 into five commits by family instead of the planned one
  per skill - the names are signed off so the revert risk the plan was pricing
  is gone, and 19 commits of identical mechanical churn buries the four that
  matter - costs a wider revert if one family's names turn out wrong.
- 07:1xZ - the Cortana family reuses one character across 10/11/12, against
  "one character, one skill" - the purpose half distinguishes them, which is
  exactly what purpose-first is for, and handoff/resume/watch are one job in
  three parts - costs nothing unless a fourth continuity skill appears.

