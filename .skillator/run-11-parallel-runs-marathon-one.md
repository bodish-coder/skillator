# RUN-11 - parallel runs, marathon, one build, holo
plan: docs/plans/PLAN-parallel-runs.md
started: 2026-10-15T02:38Z   updated: 2026-10-15T08:40Z

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 68 | F33 finish marathon | x | build:opus | 2026-10-15T16:30Z | 2a73fae |
| 79 | A122 ps1 run-file encoding (before 69) | x | build:opus | 2026-10-15T18:50Z | d890073 |
| 80 | A119 build-jarvis grade before spend (lane B, workflow) | x | workflow | 2026-10-16T03:05Z | 739a7bb (PARTIAL, A119 open) |
| 82 | A119 gate hook (lane B, main session) | x | main | 2026-10-16 | a7b6a24 (A119 open: GREEN owed) |
| 83 | F40+F41 grayskull/README half of 76 (lane G, main session) | x | main | 2026-10-16 | 724a342 |
| 81 | A120 A121 harness limits + isolation (lane H, workflow) | x | workflow | 2026-10-16T03:05Z | de24b85 |
| 69 | A115 A113 lock + review | x | main | 2026-10-16 | abf5b12 |
| 70 | F35 run worktree | x | main | 2026-10-16 | 82ea89f |
| 71 | F36 file leases | x | main | 2026-10-16 | 82ea89f |
| 72 | F37 parallel stages | x | main | 2026-10-16 | aa2dbfa (GREEN owed) |
| 73 | F38 run+landing queue, away | x | main | 2026-10-16 | e54abd5 (GREEN owed) |
| 74 | F39 one build-jarvis | x | build:opus | 2026-10-15T15:00Z | 852b032 |
| 75 | F41 holo-r2d2 core | x | build:opus | 2026-10-15T09:30Z | 95d84c3 |
| 76 | F40 commands + F41 hook-in | x | main | 2026-10-16 | 724a342 + e54abd5 |
| 77 | verify review bump commit push | x | main | 2026-10-16 | 4.7.0 |
| 78 | A117 grayskull codegraph honesty (after 74) | x | build:opus | 2026-10-15T16:00Z | d57346c |

## In flight
### stage 68 - F33 finish marathon  (dispatched 02:40)
prompt: .skillator/prompts/common.txt + .skillator/prompts/s68-f33.txt (sent verbatim, common rules first)
resume dispatch 08:45Z: common.txt + s68-r2.txt (GREEN run 2 + clean M2/M5), fresh opus implementer
run 2 returned: 7/7 PASS. /code-review: 10 findings (relay-morpheus sh+ps1)
fix dispatch 13:40Z: common.txt + s68-fix.txt, fresh opus implementer
fixes returned: 10/10 reproduced+fixed (7,8 sh-only), selftests ok (ps1 3/4 - flake A123); committed 2a73fae
agent: Agent general-purpose, model opus, fresh context
last seen (run 1): returned - STOPPED on 7d. Selftests sh+ps1 ok; harness: BASELINE_USAGE for relay-marathon fixtures (+selftest). RED record red-relay-f33.txt written. GREEN run 1 of M1-M5: M1 PASS, M3 PASS, M4 PASS (-p half), M2 B6 PASS rest VOID, M5 re-plan PASS dispatch VOID (both VOIDs from claude-mem's 93% notice leaking into nested runs). NOT run: run 2 of M1-M5 + clean re-runs of M2/M5 (recipe at end of practice/baselines/green-relay-f33.txt). S0 untested (needs owner). No skill-file fix needed. Not reviewed, not committed.

### stage 74 - F39 one build-jarvis  (dispatched 02:40)
prompt: .skillator/prompts/common.txt + .skillator/prompts/s74-f39.txt (sent verbatim, common rules first)
resume dispatch 08:45Z: common.txt + s74-r3.txt (GREEN round 3, JSON hook), fresh opus implementer
round 3 returned ~10:20Z: route 2/2 (3a, 3b), grade-before-spend 0/4; SKILL.md body fixed once
round 4 dispatch 10:25Z: common.txt + s74-r4.txt (grade line first, budget never reaches critical), fresh opus implementer
round 4 returned: seats 2/2 (critical keeps deep design + held verify), grade-before-spend 0/2 (0/6 overall); unisolated (CLAUDE.md loaded) - PARTIAL. Selftests + context-audit ok; staged; /code-review: 10 findings
fix dispatch 14:25Z: common.txt + s74-fix.txt (rulings R1-R4), fresh opus implementer
fixes returned: 10/10, selftests ok, twins byte-identical; committed 852b032
agent: Agent general-purpose, model opus, fresh context
last seen (rounds 1-2): returned ~03:40 - implementer STOPPED on the 7-day limit (claude-mem reported 93-95% weekly; usage-watch shows 7d=- so unconfirmed). Work in tree, uncommitted: build-jarvis rewritten + references/ + hooks/feature-route.{sh,ps1}, build-vision/ultron stubs, tickets-zordon, grayskull-power (SKILL, arming, hosts, routing), PLATFORMS, PRACTICE, README, WORKFLOW, audit-sherlock, .gitignore, plugin/marketplace descriptions. Selftests ok. RED 0/6; GREEN board+headless 4/4, grade 4/4; direct 0/2 - round 3 (direct with the JSON hook) NOT run (recipe at end of practice/baselines/green-build-jarvis-f39.txt). Not reviewed, not committed.

### stage 75 - F41 holo-r2d2 core  (dispatched 02:40)
prompt: .skillator/prompts/common.txt + .skillator/prompts/s75-f41.txt (sent verbatim, common rules first)
agent: Agent general-purpose, model opus, fresh context
last seen: returned. skills/holo-r2d2 (SKILL.md, scripts/holo.mjs, fixtures) - selftest ok, mutants 6/7 killed, RUN-11 and 2-Q fixture render pass structural checks. RED 2/2 violated; GREEN by name 2/2 PASS; bare phrase 0/4 (relay-morpheus wins it) - needs stage 76 routing lines (in the implementer's report, copied to .skillator/prompts/s76-lines-from-f41.txt). Description 84 words (budget 80) - trim. Not reviewed, not committed.


### stage 78 - A117 grayskull codegraph honesty  (dispatched 15:05Z)
prompt: .skillator/prompts/common.txt + .skillator/prompts/s78-a117.txt
agent: Agent general-purpose, model opus, fresh context
returned: GREEN 2/2 armed line; /code-review 3 consistency gaps fixed in main session; committed d57346c

### stage 79 - A122 ps1 run-file encoding  (dispatched 16:35Z)
prompt: .skillator/prompts/common.txt + .skillator/prompts/s79-a122.txt
agent: Agent general-purpose, model opus, fresh context
returned (after a usage-limit pause, resumed 18:30Z): A122 repro'd + fixed, A123 b/c fixed, (a) not reproduced 10/10; review clean; committed d890073

### stage 69 - A115 A113 lock + review  (dispatched 18:55Z)
prompt: .skillator/prompts/common.txt + .skillator/prompts/s69-a115-a113.txt
agent: Agent general-purpose, model opus, fresh context
returned 02:40Z: A115 repro'd both ports + fixed, A113 GREEN 2/2; /code-review: lock races (double holder via pidless re-check and check-then-rm) - fix round
fix dispatch 02:55Z: common.txt + s69-fix.txt (atomic file lock + rename-to-break), fresh opus implementer

## Rulings
- 2026-10-15 - Ruling: F33 was [~] under @cc-aa4f8b, untouched since 2026-10-12 (3 days, its files last written 10-12 09:24); taken over by @cc-fa7ff0 to finish - the owner asked to solve the RUN-11 tickets, which start with F33 - costs a duplicate effort if that session is alive.
- 2026-10-15 - Ruling: lanes per PLAN-parallel-runs section 4: stages 68 (relay files), 74 (build-*/grayskull/tickets-zordon) and 75 (new skills/holo-r2d2) dispatched together - their file sets are disjoint (checked against each prompt's file list); F39's chain hand-off line moves to stage 73 (chain.md is lane A's) - costs one extra edit in 73.
- 2026-10-15 - Ruling: baseline runs hide ~/.claude/CLAUDE.md, so implementers serialise on the harness's own refusal (poll and retry) rather than the main session scheduling them - costs wall-clock, not correctness.
- 2026-10-15 - Ruling: no Workflow tool - the owner said "solve these tickets", not "use a workflow"; Agent fan-out per tasks-sentinels instead.
- 2026-10-15 - STOP #4 (7-day window at 90%+): reported by the stage-74 implementer from claude-mem's weekly reading (93-95%); usage-watch cannot read 7d here. No new stage is dispatched; stages 68 and 75 were already in flight. Asked the owner alone, before anything else.
- 2026-10-15 - Owner ruling on STOP #4: "let the two finish, then hold". Stages 68 and 75 returned; RUN-11 is HELD. Nothing new is dispatched until the 7-day window resets. All work is in the tree, uncommitted (no commit/review spend under the hold).
- 2026-10-15 - Ruling: nested baseline runs load the owner's claude-mem plugin, whose weekly-usage notice leaked into GREEN runs (M2, M5 VOID; F39 builds stopped mid-run) - the harness should disable claude-mem in nested runs before the next GREEN round - costs re-runs if left.
- 2026-10-15 08:40Z - Owner lifted STOP #4 ("resumed - run full plan"); usage-watch still reads 7d=-, so the owner's /usage is the source. RUN-11 resumes per the Resume list below.
- 2026-10-15 - Ruling: claude-mem leak needs no harness edit - a nested `claude -p` (stream-json init) no longer lists it; it is not enabled in user settings - costs VOID runs again if it is re-enabled, which the s68/s74 resume prompts tell implementers to record.
- 2026-10-15 - Ruling: stages 74 (round 3) and 68 (run 2) dispatched together - disjoint files, the harness hide-lock serialises their nested runs; stage 75's description trim is done in the main session (one paragraph, one file) - costs nothing if wrong but a re-trim.

- 2026-10-15 - Ruling: stage 75 review findings fixed in the main session (7 of 10, each repro'd old vs new); derive() duplicating chain next's holds logged as A118 (cross-lane, after F33), the serial-read perf note dropped - costs a stale page if relay holds change before A118.

- 2026-10-15 - Ruling: F33 GREEN run 2 - 7/7 PASS (12 runs, 0 FAIL across both); S0 paged path stays untested (needs the owner's interactive run); staged F33 paths and sent to /code-review - costs nothing.
- 2026-10-15 - Ruling: F39 budget step-down never reaches critical work (deep design seat + opus verify kept) - build-jarvis's critical carve-out is for exactly this - costs more on critical builds under a tight budget.
- 2026-10-15 - Ruling: F39 round 4 is one fix + one re-run; if grade-before-spend still fails, F39 commits as PARTIAL with the gap ticketed, not a fifth round - three passes is the cap - costs a known gap in direct routing.

- 2026-10-15 - Ruling: F33's 10 review findings go to ONE implementer (all in relay-morpheus.sh/.ps1 - same-file tasks do not fan out), repro-first, selftest case per fix, no baseline re-run - script-logic fixes are proven by selftests; the GREEN surface does not exercise them - costs a GREEN re-run if a fix changes skill behaviour.
- 2026-10-15 - session limit hit ~10:30Z, reset; resumed 13:31Z.

- 2026-10-15 - Ruling: F39 commits PARTIAL per the 3-pass cap - routing and seats GREEN, grade-before-spend gap ticketed A119; harness time-limit failure A120, isolation footguns A121 - costs a known direct-route gap until A119.
- 2026-10-15 - Note: fable returned HTTP 429 out-of-credits in F39 round 4; deep seats fall back to opus until the owner tops up.

- 2026-10-15 - Ruling: F39 review fixes to one implementer with R1-R4 (one build-jarvis pass per batch, workflow items take the parent's grade; any-size FEATURE, non-feature one-liners direct; board ticket first; third-round step-up only with a Ruling) - disjoint from the F33 fixer (relay files) so both run - costs a re-plan of tickets-zordon if the owner wants per-ticket passes.

- 2026-10-15 - Ruling: the F39 fix changed the route text (board-first clause, not-a-feature tail) - no GREEN re-run now; A119's owed isolated direct-1/2 re-run covers it (noted on A119) - costs a routing regression unseen until A119.
- 2026-10-15 - Ruling: F39 stays [~] after 852b032 - its done line includes "inside a chain", which stage 73 hooks in - costs nothing.

- 2026-10-15 - Ruling: stage 78 dispatched now, alongside the F33 fixer - its after-74 dependency landed and its files (grayskull-power) are disjoint from relay-morpheus - costs nothing; 69-73 stay serial behind 68.

- 2026-10-15 - Ruling: new stage 79 (A122, ps1 corrupts non-ASCII run files, shipped since 4.5.0) runs before 69 - it is shipped data corruption and 69-73 all rewrite relay-morpheus.ps1, so fixing it first saves rebasing it through five stages - costs ~1 stage of wall-clock before 69. A123 (port drift) folds into the same stage: same file, same implementer.

- 2026-10-15 - Owner: "can we complete some things using workflows for faster work" - Ruling: one Workflow runs lanes B (A119: build-jarvis + baselines) and H (A120/A121: baseline-harness.sh) in parallel, implementer then reviewer per lane (4 agents); lane A (relay files: 79, 69-73, 76) stays serial via Agent - same-file work never fans out; A119 runs its baselines from a snapshot copy of the harness so lane H's edits cannot change it mid-run - costs a re-run if the snapshot hides a harness fix A119 needed.

- 2026-10-16 02:00Z - weekly limit hit ~19:00Z 10-15 (stage 69 + the workflow paused), reset at 02:00Z; CLAUDE.md verified in place; stage 69 resumed via SendMessage; the workflow restarts its implementers itself (3rd start per lane - they continue on the partial edits in the tree).

- 2026-10-16 - Ruling: stage 69's lock rewrite is not committed - review found double-holder races; a fix round replaces mkdir+pid with an atomic exclusive-create file lock broken by rename (one waiter wins), race harness first - costs one more lane-A round before 70; not reverted since the rewrite's repro'd fixes (sh silent exit, ps1 hang) are kept as the baseline the fix round starts from.
- 2026-10-16 - Workflow wf_f4a43b4c-e41 done: lane B A119 PARTIAL (1/2: direct-1 passes, direct-2 not), review ship; lane H A120/A121 fixed, review ship (2 stale-doc notes fixed in main session).

- 2026-10-16 07:05Z - Owner: "lets run what we can in parallel" - Ruling: workflow 2 runs lane B (A119 PreToolUse gate, build-jarvis files) and lane G (stage 76's non-relay half: grayskull SKILL/routing.md rows for holo-r2d2 + F40 phrases, commands/marathon.md, README skill list) beside lane A; stage 76 keeps only its relay-morpheus half (description NOT clause, marathon.md draw steps, F40 phrase list) - stages 70-73 stay serial (all rewrite relay-morpheus.sh/.ps1) - costs a split stage 76.
- 2026-10-16 07:00Z - session limit paused the stage-69 fix round ~05:30Z; resumed.
- 2026-10-16 - Owner: "complete what started without agents one by one to conserve tokens" - Ruling: stages 69, 82, 83 finish in the main session, serially, no Agent/Workflow; workflow 2 (82/83) left no edits in the tree, so both start fresh here - costs wall-clock, saves the per-agent context load.
- 2026-10-16 - Ruling: stage 69 commits after review pass 2 (sh selftest ok, ps1 ok 3/3) - the file lock beats HEAD's dir lock (142 double holds / 400 before) and meets A115's done line; pass 2's 9 findings (give-back race on the force path, crashed cross-port .break hang, ...) go to A124 as an OS-released lock redesign, not a third rename patch - costs a narrow double-hold window until A124, before 70 rewrites the same files.
- 2026-10-16 - Ruling: stage 83 - "work the board" moves from the tickets-zordon row to the marathon row in routing.md (F40); tickets-zordon's own description still lists it, left for stage 76's relay description pass; grayskull SKILL.md row folded to fit its 800-word budget (800) - costs a description tie on "work the board" until 76.
- 2026-10-16 - Ruling: stages 82+83 reviewed in one /code-review pass (10 findings): fixed ps1 UTF-8 stdin, tool-input text decoy, portable sed, case-sensitive filter, matcher +MultiEdit|NotebookEdit, "keep going" dup, tickets-zordon trigger, arming offer, marketplace desc; accepted (documented) Bash/PowerShell ungated and the same-message flush race (deny says retry) - costs one retried call per same-message grade.
- 2026-10-16 - Owner: "lets do the pending items" - Ruling: order A124 -> F42 -> 70 -> 71 -> 72 -> 73 -> 76 relay half -> A119 GREEN -> 77 (push asked alone); main session, no implementer agents (owner's earlier token rule); the build stages run build-jarvis's grade + design inline instead of dispatching - costs wall-clock and this session's context.
- 2026-10-16 - Owner (mid-turn): holo-r2d2 should also handle the decision-wizard brief (AewaAirbender/docs/reviews/decision-wizard-prompt.txt) - Ruling: logged F42, slotted right after A124 (disjoint files: skills/holo-r2d2/) - costs one stage of delay to 70-73.
- 2026-10-16 - A124 landed da47af2 (review 10 findings: 6 fixed, the paused-past-60s double holds kept as a documented ponytail; race harness 60x6 not 400 - MSYS cost); F42 landed eafc770 (review 10/10 fixed after the review, not re-reviewed - each fix has a selftest case and the browser pass re-ran 43/43) - Ruling: no second review pass on F42 - costs a missed regression in the fixes, bounded by those tests.
- 2026-10-16 - Ruling: F35+F36 one commit (same files, one review) - F36 review fixes not re-reviewed, covered by the F36 selftest only (no case for give-back / no-files refusal) - costs an unseen regression there. ps1 lock race flaked 1 in 3 full selftests (a caller exited 1, no lost row); 10 isolated race runs clean - left as noted.
- 2026-10-16 - F38 + A125 written, reviewed (10 findings, all fixed), NOT yet committed: the post-fix sh+ps1 selftest run was killed by Claude Code for low system memory. Pending: rerun both selftests, commit F38 (stays [~], GREEN owed) + A125. Stage 76 relay half written (relay description with F40 phrases + holo NOT clause, marathon.md draw steps, practice/scripts/check-routing.sh ok + mutation-checked), not yet reviewed/committed. Then: GREENs owed (F37, F38, A119), stage 77 (push asked alone).
- 2026-10-16 - Owner (AskUserQuestion): GREENs "Run all GREENs" (A119 x2, F37, F38, F41), one at a time, then stage 77; push: "Push after 77" - the push is authorised for after the sweep, bump and commit pass.
- 2026-10-16 - GREENs: A119 2/2 (ee87ece, closed), F41 2/2 + end batch 2/2 after holo.mjs --batch (fde1237, closed). F37 GREEN (scenario-relay-parallel-f37.txt, relay-chain + BASELINE_USAGE="20 10") was KILLED by Claude Code for low system memory (fork failures in the harness) - no verdict; ~/.claude/CLAUDE.md had stayed hidden and was restored by hand, orphan harness processes stopped. Not restarted (memory). Pending: F37 GREEN, F38 GREEN (relay-marathon fixture, two queued runs), then stage 77 (sweep, bump, commit, push - push authorised).
- 2026-10-16 - GREENs done: A119 2/2 (ee87ece), F41 2/2 + batch 2/2 (fde1237), F37 1/1 (1d213e2, be39767), F38 two turns PASS (a58bd38; A127 found and fixed). Two F38 turn-2 attempts were killed under low system memory and their nested sessions survived the launcher; ~/.claude/CLAUDE.md restored by hand each time.
- 2026-10-16 - Stage 77: sweep (grade-gate, feature-route, holo, next-id, taskwork, check-tickets/grayskull-sync/routing, context-audit, relay sh+ps1 selftests) all ok; version 4.6.0 -> 4.7.0; push authorised by the owner ("Push after 77"). Open after RUN-11: F34 (other session), A116, A118, A126.
- 2026-10-17 - After 4.7.0 landed: A128 (60fed6f, codegraph check script per shell), A126 (70e71f0, run worktrees under .skillator/worktrees/; ticket stays [ ] - its GREEN was NOT run: the launcher hides ~/.claude/CLAUDE.md, which a subagent will not do on a coordinator's word, so it waits for the owner), A116 (0d48e6f, cerebro pi gate never waits forever), A118 (5b28c4a, chain next --holds; holo draws relay's holds). Sweep 2026-10-17: grade-gate ok, feature-route ok, holo selftest ok, codegraph-check ok, check-tickets ok, grayskull-sync ok, check-routing ok, context-audit OK (0 OVER), cerebro 121/121, relay-morpheus sh+ps1 selftest ok.

## Resume (continue RUN-11, after the 7-day window resets)
1. Check usage first (/usage). Then per stage, in order:
2. Stage 74 (F39): run GREEN round 3 (direct-1/2 with the JSON hook; recipe at end of practice/baselines/green-build-jarvis-f39.txt) -> regression sweep -> /code-review on F39's files -> commit "F39: ..." -> stage 74 x.
3. Stage 68 (F33): GREEN run 2 of M1-M5 + clean M2/M5 (recipe at end of practice/baselines/green-relay-f33.txt; fix claude-mem leak first) -> review -> commit -> stage 68 x.
4. Stage 75 (F41): trim description to <=80 words -> review -> commit -> stage 75 x (bare-phrase GREEN re-run waits for stage 76).
5. Then stages 69 -> 70 -> 71 -> 72 -> 73 (one at a time, relay files), 78 (A117, after 74), 76 (F40 + the F41 routing lines), 77 (final; push asked alone).
Commit with explicit paths only (several tickets' work shares this tree).
