# RUN-5 - merge-smith audit fixes
plan: TICKETS.md
started: 2026-10-01T18:14Z   updated: 2026-10-01T19:15Z

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 42 | A102 A105 A108 merge-smith git procedure | x | build:opus | 2026-10-01T19:15Z | edf05be |
| 43 | A103 A106 A107 merge-smith routing | x | build:opus | 2026-10-01T19:15Z | edf05be |
| 44 | A104 F24 clean-merge sweep resume renumber | x | build:opus | 2026-10-01T19:15Z | edf05be |
| 45 | A101 usage-watch ps1 weekly fallback | x | build:sonnet | 2026-10-01T19:15Z | edf05be |
| 46 | A100 codex design-arwen choices list | x | deep:fable | 2026-10-01T19:15Z | edf05be |
| 47 | verify review commit | x | main:opus | 2026-10-01T19:15Z | edf05be |
| 48 | A103 GREEN re-run merge-smith N=2 | x | build:opus | 2026-10-01T19:15Z | edf05be |

## In flight

## Rulings
- 18:15 - F24 placement: merge-smith, not mergeprep-oracle - merge-smith can run without a prep, and the destination's free IDs are only known at merge time; costs a one-line pointer in mergeprep-oracle if wrong.
- 18:15 - A107 vs A103d: approved semantic text is applied in the main session; Opus owns verification failures/rework; Fable diagnoses unexplained reconcile failures - one rule serves both tickets.
- 18:15 - A62 not dispatched: its only open child A62d is deferred (prime-agent not installed); nothing to do this run.
- 18:15 - Stages 42-44 all edit skills/merge-smith/SKILL.md, so they run in sequence; 45 and 46 touch other files and run alongside. Implementers do not commit; the main session runs code-review and commits once (stage 47).
- 18:15 - Tiers: 42-44 fix opus / verify fable (a bad merge rule is the costly failure); 45 fix sonnet / verify opus (mechanical mirror); 46 fix fable / verify opus (cause unknown).
- 18:17 - stages 42-46 dispatched as one workflow, run wf_9d9466f7-d03; resume with Workflow resumeFromRunId and the script under the session workflows/scripts dir. Stage 47 (code-review + commit) stays in the main session.
- 2026-10-02 - workflow wf_9d9466f7-d03 returned: A101, A100 verified pass; merge-smith all pass except A103a-f (GREEN not re-run) and A105 (fix differs from ticket text - ticket line amended, fix kept: the ticket's own suggestion is also empty). Main session fixed: take:both reconcile exception, run-file dirty-path note in reconcile.sh, mergeprep-oracle fetch prose, A100 record accuracy. SKILL.md now ~3430 words (over the ~2850 start; accepted, noted for skill-smith budget).

### stage 48 - A103 GREEN re-run  (dispatched, build:opus)
prompt: |
  RUN-5 stage 48. Re-run practice/baselines/green-merge-smith.txt against the
  CURRENT working-tree merge-smith (uncommitted RUN-5 edits: per-hunk Opus
  classifier, mandatory unattended second Fable review, reconcile.sh, etc).
  Follow the file's own recorded procedure (latest FILE VERSION section: prefix
  via baseline-harness.sh prefix built from the working tree so the edited
  skill is what loads, fresh fixtures from the fixture block, claude -p as
  'cmd green' emits). Run v2 (direction unstated -> must stop and ask, 0
  merges) N=2 and v1 (direction stated -> integration merge with assumed: rows,
  main/origin untouched) N=2, in parallel. Grade on disk. Append a new dated
  section recording the skill version, commands, and per-run verdicts, in the
  file's existing style. Do not edit any skill, TICKETS.md or .skillator/.
  Do not commit. If nested claude -p is refused, record that and stop.
  Return: per-run PASS/FAIL with on-disk evidence, and any skill defect seen.
- 2026-10-02 - all stages landed at edf05be. Code review: 2 findings at 75 (<80 cutoff), both fixed anyway (ASCII header in reconcile.sh, mergeprep-oracle sync rule names reconcile.sh). A103 GREEN 4/4; its run surfaced the merge-log direction-2 FAIL (fixed: listed exception) and the in-session classifier ambiguity (A109). Not pushed.
