# RUN-5 - merge-smith audit fixes
plan: TICKETS.md
started: 2026-10-01T18:14Z   updated: 2026-10-01T19:02Z

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 42 | A102 A105 A108 merge-smith git procedure | ~ | build:opus | 2026-10-01T18:15Z | - |
| 43 | A103 A106 A107 merge-smith routing | ~ | build:opus | 2026-10-01T18:15Z | - |
| 44 | A104 F24 clean-merge sweep resume renumber | ~ | build:opus | 2026-10-01T18:15Z | - |
| 45 | A101 usage-watch ps1 weekly fallback | ~ | build:sonnet | 2026-10-01T18:16Z | - |
| 46 | A100 codex design-arwen choices list | ~ | deep:fable | 2026-10-01T18:16Z | - |
| 47 | verify review commit |   | - | - | - |
| 48 | A103 GREEN re-run merge-smith N=2 | ~ | build:opus | 2026-10-01T19:02Z | - |

## In flight
preamble: |
  (RUN-5 preamble) Repo C:\tools\Projects\skillator2, a plugin of agent
  skills. You implement ONE stage. Read your tickets' full lines in TICKETS.md
  (grep the IDs); they carry the evidence and the closing condition. Rules: do
  NOT commit, push, or edit TICKETS.md or anything under .skillator/. Touch
  only the files your stage names (plus a new references/ file or script where
  it says so). Never run git commands that move refs or change the worktree of
  this repo; prove behaviour in a throwaway git repo under your temp dir.
  skills/merge-smith/SKILL.md is ~2850 words and loads whole: keep it tight,
  move long command blocks and procedures into skills/merge-
  smith/references/<topic>.md behind a one-line pointer, net SKILL.md growth
  at most ~250 words for your stage. Match the file's existing voice. merge-
  smith's Rules say it is kept in sync with skills/mergeprep-oracle/SKILL.md
  (vocabulary, reconcile commands, per-hunk granularity): change a shared
  reconcile command in both. Return plain text: files changed; per ticket ID
  what changed and the evidence (repro command + output before and after);
  anything not done and why.

### stage 42 - A102 A105 A108  (dispatched, fix:opus)
prompt: |
  (RUN-5 preamble) Stage 42. Tickets A102a, A102b, A102c, A102d, A102e, A102f,
  A105, A108a, A108b, A108c, A108d - all in skills/merge-smith/SKILL.md (git
  procedure: Phase 0 pre-flight and base fetch, Phase 3 whole-side take, Phase
  4 reconcile in both directions, Phase 2 branch naming, Phase 5 worktree
  detection, merge drivers/rerere/LFS, lockfile regeneration). Also
  skills/mergeprep-oracle/SKILL.md where the reconcile is shared. For every
  HIGH item (A102a-d) and A105, build a scratch repo that reproduces the
  failure with the current command first, then show the new command passes;
  for A105 if the repro shows the current check is NOT vacuous, say so and
  change nothing for it. Give exact commands, not prose (A102f): one
  enumerate-and-check loop per direction, usable from sh.

### stage 43 - A103 A106 A107  (dispatched, fix:opus)
prompt: |
  (RUN-5 preamble) Stage 43. Tickets A103a, A103b, A103c, A103d, A103e, A103f,
  A106, A107. Files: skills/merge-smith/SKILL.md (model routing: who
  classifies conflicts, per-hunk classification, second deep-tier review for
  unattended runs and migrations/schema/auth/payments hunks, owner of
  reconcile failures, RISK cross-check, dispatch payloads + return formats +
  same-file-hunks-serialize + null/timeout rule, approved text applied in the
  main session not a fresh Opus agent) and skills/grayskull-
  power/references/hosts.md line 10 (stale codex/cursor slugs; point at
  PLATFORMS.md's deep row instead of hardcoding). Ruling already made: A107
  and A103d agree - approved resolutions are applied in the main session; the
  build tier (Opus) owns verification failures and rework, the deep tier
  diagnoses unexplained reconcile failures. If grayskull-power has a sync
  check (practice/scripts/check-grayskull-sync.sh), run it after editing
  hosts.md. Another stage edited merge-smith before you: build on the current
  file, do not undo its changes.

### stage 44 - A104 F24  (dispatched, fix:opus)
prompt: |
  (RUN-5 preamble) Stage 44. Tickets A104a, A104b, F24. Files: skills/merge-
  smith/SKILL.md (+ a references/ file), and for F24 a renumber helper under
  practice/scripts/ if a script is the smallest correct way (check whether
  peers like check-tickets.sh / next-id.sh have a .ps1 mirror; mirror only if
  they do). A104a: a clean-merge hazard check after each merge (duplicate
  migration prefixes, check-tickets.sh when TICKETS.md changed, build before
  next merge). A104b: resume via relay-morpheus (skills/relay-morpheus) -
  record merge order and merged-through-step before each merge, detect
  MERGE_HEAD on entry; state whether the merge log is committed and when the
  integration branch is cleaned up. F24: when a source branch's TICKETS.md
  uses IDs the destination already has or allocated since the merge base,
  renumber the source's tickets to the next free IDs via
  practice/scripts/next-id.sh, keep ` (was <old>)`, move sub-parts with the
  parent, update references to old IDs in files the source added or changed,
  never move destination IDs, never rewrite commit messages, log the old->new
  map in the merge log, and make Phase 4 reconcile treat renumbered lines as
  logged exceptions. Ruling already made: F24 lives in merge-smith (it may run
  without mergeprep-oracle); mergeprep-oracle only gets a one-line pointer if
  needed. Prove F24 with a fixture: two branches with colliding IDs, a sub-
  part, and a cross-reference; after the procedure check-tickets.sh passes and
  every reference resolves. Other stages edited merge-smith before you: build
  on the current file.

### stage 45 - A101  (dispatched, fix:sonnet)
prompt: |
  (RUN-5 preamble) Stage 45. Ticket A101. Files: skills/watch-
  cortana/hooks/usage-watch.ps1 and its selftest (skills/watch-
  cortana/hooks/selftest.ps1). Mirror usage-watch.sh's `check` branch for
  'only a .weekly flag exists, no main flag' into the ps1, add a selftest case
  that fails before your change and passes after, run the selftest (powershell
  -NoProfile -ExecutionPolicy Bypass -File ... ; if the PowerShell tool
  refuses, run it through bash with powershell.exe). The selftest must not
  touch the user's real ~/.claude/handoff-watch state.

### stage 46 - A100  (dispatched, fix:fable)
prompt: |
  (RUN-5 preamble) Stage 46. Ticket A100. On codex, design-arwen's unattended
  final report omits the list of choices made on the user's behalf (0/2),
  while Claude Code meets it. Read practice/baselines/green-design-arwen.txt
  (CODEX HOST section), skills/design-arwen/SKILL.md (no-user branch and
  report template), PLATFORMS.md and skills/grayskull-
  power/references/hosts.md. Find the cause (tag verified/inferred), make the
  smallest fix in design-arwen (or the host translation), then re-run the
  codex scenario N=2 the way A58d did (codex-cli, profile codex-bodish,
  --ephemeral, skills from the fixture's .agents/skills; see the CODEX HOST
  section and practice/baselines/baseline-harness.sh). Append the result as a
  new file version in green-design-arwen.txt. If codex is not logged in or the
  run cannot be launched, do not fake it: make the fix, record that the re-run
  is pending and why, and say so in your return.

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
