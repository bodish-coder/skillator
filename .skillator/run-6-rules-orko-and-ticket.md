# RUN-6 - rules-orko and ticket scale
plan: TICKETS.md
started: 2026-10-02T13:23Z   updated: 2026-10-02T14:54Z

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 49 | F25 rules-orko skill | x | deep:fable | 2026-10-02T14:54Z | a509400 |
| 50 | F27 ticket archive | x | build:opus | 2026-10-02T14:54Z | a509400 |
| 51 | F26 renumber on every merge | x | build:opus | 2026-10-02T14:54Z | a509400 |
| 52 | verify review bump commit | x | main:opus | 2026-10-02T14:54Z | a509400 |

## In flight

## Rulings
- 2026-10-02 - F25 owner decisions taken 2026-10-02 via AskUserQuestion: global rules at ~/.skillator/rules.md; a personal-vs-project clash is asked every time; F27 archive = closed >30 days, parent moves only with all sub-parts.
- 2026-10-02 - Order: F27 before F26 (both edit tickets-zordon SKILL.md, and F26's renumber must count archived IDs); F25 runs alongside (owns grayskull-power, F26/F27 must not touch it).
- 2026-10-02 - Tiers: F25 fix fable (skill design judgement) / verify opus; F27 and F26 fix opus / verify fable (the allocator and renumbering are contracts every session depends on).
- 2026-10-02 - Version: bump to 4.2.0 (new skill = minor) in the stage-4 commit, per the owner's bump-on-push rule; the push itself is the owner's (classifier blocks it as a public surface).
- 2026-10-02 - stages 49-51 dispatched as workflow wf_02229e47-af5 (resume via Workflow resumeFromRunId). Stage 52 (verify review bump commit) stays in the main session.
- 2026-10-02 - stages 49-52 landed at a509400 (4.2.0). Review: pass 1 (medium) 4 findings, pass 2 partial clean, pass 3 targeted 2 findings - all 6 fixed with a failing-then-passing selftest each (the disabled-hook -x guard is logic-only on Windows, reproduced by the reviewer on WSL). Not pushed: the owner pushes (classifier blocks it).
