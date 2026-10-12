# RUN-9 - relay chains ticket workflows
plan: TICKETS.md
started: 2026-10-09T18:04Z   updated: 2026-10-09T23:10Z

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 60 | F31 design + plan | x | deep:fable | 2026-10-09T18:14Z | pending |
| 61 | F31 RED baselines | x | build:opus | 2026-10-09T21:14Z | pending |
| 62 | F31 scripts: codes, usage careful level, listener | x | build:opus | 2026-10-09T22:00Z | pending |
| 63 | F31 skill text: relay chain mode + zordon/cortana pointers | x | deep:fable | 2026-10-09T22:05Z | pending |
| 64 | F31 GREEN | x | build:opus | 2026-10-09T23:02Z | pending |
| 65 | verify review bump commit push | x | main:opus | 2026-10-12T05:00Z | this commit |

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

### stage 62 - F31 scripts  (dispatched, build:opus)
prompt: |
  RUN-9 stage 62, F31. Per docs/plans/PLAN-relay-chain.md: next-id kind W
  (4-char base-36 codes, registry, --runs), relay-morpheus chain commands
  (plan/dispatch/hold/release/wait/take), usage-watch `level` +
  CLAUDE_USAGE_WATCH_DIR override, all as sh+ps1 twins with selftests.
  MUST VERIFY first: the five_hour statusline key, Monitor max wait. No commit.

### stage 63 - F31 skill text  (dispatched, deep:fable; verify opus)
prompt: |
  RUN-9 stage 63, F31. Write skills/relay-morpheus/references/chain.md and
  the law+pointer in relay-morpheus SKILL.md, tickets-zordon 3 lines,
  watch-cortana pointer + level, routing row, per the plan and the stage-61
  RED verdicts (plan on disk before dispatch, usage read between stages,
  codes, hold at 80%). Note: hand-edit the `run:` line; `mode:` must match
  what is dispatched; fix watch-cortana SKILL.md flag-dir path. No commit.

### stage 64 - F31 GREEN + verify 63  (dispatched, build:opus)
prompt: |
  RUN-9 stage 64, F31. Verify stage-63 text adversarially against the plan,
  the RED verdicts and the scripts. Wire CLAUDE_USAGE_WATCH_DIR /
  BASELINE_USAGE into harness `cmd green`. GREEN the 3 relay-chain scenarios
  x2 with the plugin loaded (BASELINE_ISOLATE=hide, sequential). No commit.

## Rulings
- 2026-10-09 - stage 60 landed: design in docs/plans/PLAN-relay-chain.md (relay chain commands, next-id kind W base-36 codes, usage-watch `level`, `chain wait` listener under Monitor, 18 failure modes). Open risks carried to stage 62 as must-verify: five_hour statusline key, Monitor max wait.
- 2026-10-09 - owner decisions (AskUserQuestion): at 80% finish the running workflow, hold, listener resumes (7-day window stays the 90% hard stop); blocked tickets re-checked before each stage; codes are 4 chars from A-Z0-9, never reused. Home: owner asked for the most reliable option; chosen = extend relay-morpheus (it already owns run files, stage numbers, resume, orphans and the SessionStart listing; a second skill would duplicate run state and contest routing - F29 showed a routing contest failing 0/4). Chain mechanics go in relay-morpheus/references, not the SKILL.md body.
- 2026-10-09 - RUN-9 runs alongside RUN-8 stage 58 (A110): no shared files (A110 = code-yoda + harness fixture; F31 = relay-morpheus, watch-cortana, tickets-zordon pointer). F31 RED/GREEN must not run while A110's GREEN holds ~/.claude/CLAUDE.md hidden (never two hidden runs at once) - stage 61/64 check for CLAUDE.md.skillator-hidden first.
- 2026-10-09 - Tiers: 60 deep:fable (design), 61 build:opus, 62 build:opus (scripts, sh+ps1 twins), 63 deep:fable fix / opus verify (skill text), 64 build:opus, 65 main session.
- 2026-10-10 - session limit (429) killed stage 61 mid-run: 3 scenario files and 10 transcripts (chain 1-4, hold 1-4, resume 1-2) exist, verdicts not recorded. Re-dispatched to finish from what is on disk, not to re-run what exists. usage-watch.sh check hung >100s twice (stage-53 agent; first command after the reset), not reproduced since (5/5 clean, scan 0.1s): no ticket; next hang, capture `sh -x` to a log.
- 2026-10-10 - stage 61 landed (uncommitted): chain VIOLATED 2/2 (no plan on disk before dispatch, no usage read between stages, descriptive non-unique names - run 5 and void run 3 both chose `shelf-stage1-bugs`); hold VIOLATED 2/2 (started a stage at 84%, nothing on disk); resume COMPLIED 2/2 -> no new rule for resume, only the `mode:` drift (run file said workflow, runs used Agent) noted for stage 63. Round 1 superseded (Workflow not on the allow-list), round 2 void (session limit). Harness gained `Workflow` in EXTRA_RULES.
- 2026-10-10 - stage 62 landed (uncommitted), re-verified in the main session: next-id/relay(sh+ps1)/watch-cortana selftests ok. Verified, not inferred: statusline key rate_limits.five_hour.used_percentage (official statusline docs + changelog 2.1.80); Monitor cap 30 min (10 in -p) per changelog 2.1.295, so `chain wait --for` re-arms inside it. Departures accepted: codes counted from `### CODE - stage n` headers only; `level` prints 5h=- with the max fallback in relay's decide; probe writes .fivehour/.ctx (check excludes them); extra guards (dispatch refuses past 7d 90% without --confirmed, release refuses at >=80%, --driver required). Gaps for 63/64: no command fills `run:` (hand edit, say so); harness cmd must pass CLAUDE_USAGE_WATCH_DIR for GREEN. Live level shows 5h=- until the 4.5.0 probe is installed (fallback = max, holds early).
- 2026-10-10 - stage 63 landed (uncommitted): references/chain.md (1262 words, structural loop), relay SKILL.md law+pointer (1731 words, description 79), zordon +3 lines, watch-cortana level row + flag-dir path fixed, routing row; context-audit OK. Main session added the plan's one WORKFLOW.md sentence (stage 63 skipped it).
- 2026-10-10 - stage 64 partial: verify done (gap fixed: usage now read before EVERY dispatch incl. the first - chain dispatch only checked hold/7d, and the hold RED was "started stage 1 at 84%"); harness wires CLAUDE_USAGE_WATCH_DIR via BASELINE_USAGE (selftest ok). GREEN 0/6 finished: the agent's wrapper was killed for low system memory while hold-1 ran; the nested run lives on with ~/.claude/CLAUDE.md hidden until its trap (<= 03:57) - main session watching for the restore, no new hidden run until it is back. hold-1 partial: relay-morpheus loaded from its description unprompted. Main session fixed chain.md: RM/UW are page shorthand, never `RM=...; $RM` (denied as an unreadable variable).
- 2026-10-10 - stage 64 GREEN (main session ran hold-2..resume-2 sequentially after the restore): hold PASS 2/2, chain PASS 2/2, resume COMPLIED 2/2; relay-morpheus loaded from its description 6/6. Per-stage code-review skipped in 3/4 dispatching runs -> A113, not folded into F31. Record: practice/baselines/green-relay-chain.txt ($9.55).
- 2026-10-10 - stage 65 review pass 1 (medium): 9 findings in the scripts. Fixing 1-7 + the ps fallback exhaustion check via a build:opus implementer (twins + selftests + mutation checks): decide fallback must exclude ctx; driver stamp refreshed by heartbeat/hold/release/wait; dispatch itself refuses a 5h HOLD/UNOBSERVABLE without --override; dispatch and plan check-and-claim under the lock; harness validates BASELINE_USAGE before mkdir; ps decide parses defensively. Accepted: #8 (.NET vs awk half-rounding on x.x5 codex values - display only, decisions compare integers) and #9 dedupe (one fallback per twin, kept beside next-id; exhaustion check added).
- 2026-10-11 - stage 65 resumed by session @cc-aa4f8b (owner: "continue using workflows", order quick wins -> relay). The stage-65 implementer's fixes for findings 1-7 sit unstaged (relay-morpheus.sh/.ps1, usage-watch.sh/.ps1, chain.md, baseline-harness.sh) with 22 untracked mut-*.sh/.ps1 beside the hook; no verdict was recorded. Dispatch W2 (Workflow, <=4 agents): verify each finding's fix in both twins + all selftests + the mutation checks, in parallel with a review pass 2 on the unstaged diff; then one implementer fixes what survives and one verifier re-checks. Main session then commits F31 as 4.5.0 (temp index not needed - F31 owns the staged set). mut-* files are scratch unless a selftest references them; they are not committed.
- 2026-10-12 - W2 landed: findings 1-7 + exhaustion check verified in both twins, each proven by a mutant that fails its selftest; all selftests ok. Review pass 2: driver-stamp ownership (is_me/IsMe) and the vacuous UNOBSERVABLE selftest fixed and re-verified. Open: sh chain hold/release corrupt a hand-edited (4-space) header with exit 0 where ps1 refuses -> W8 (one fixer + verifier). Latent Lock stale-break hang ($held='') seen once under mutant ps4: logged as a risk, not fixed here. mut-* scratch (24 + mut-bh6) is moved to the session scratchpad, not committed. PLAN-relay-chain.md :221/:294/:408 still describe the max fallback - fixed in the same pass.
- 2026-10-12 - W8 landed (sh hdr_check refuses a mangled header like ps1, both selftests ok, verified). F31 staged (41 files, 4.5.0). Pre-commit /code-review medium = pass 3 of 3 (cap): 7 unverified findings (duplicate In-flight block on '!' redispatch; Claude Code flags have no freshness window in `level`; harness does not isolate CODEX_HOME; watch-cortana selftest leaks .fivehour/.ctx into the live dir; 7d fallback compared against the 5h HOLD_PCT; driver cell without a stamp counts as stale; W exhaustion exit 1 vs 2). Dispatch W10: one fixer reproduces each first (reject with evidence if it does not), fixes the confirmed ones in both twins with a failing-first selftest, then one verifier. After W10 the commit goes ahead - no fourth review pass.
- 2026-10-12 - W10 landed, verified: all 7 pass-3 findings reproduced and fixed in both twins, failing-first (redispatch replaces the In-flight block; Claude Code flags get the 3h freshness window; harness redirects CODEX_HOME under BASELINE_USAGE; watch-cortana selftest runs in a temp dir and clears flag.*; 7d-only reading -> HOLD <pct> 7d / chain wait STOP exit 2 / dispatch needs --confirmed; stampless driver cell is an unreadable header; W exhaustion exit 2 on both paths). All 6 selftests ok. chain.md gains the exit-2 STOP line. Accepted: ruling text says "past 7d 90%" for an 80-89% 7d-only confirm (wording only). Lock stale-break flake -> A115. Live ~/.claude/handoff-watch holds ~12 old selftest-<pid>.ctx/.fivehour pairs from pre-fix runs: left for the owner. F31 committed as 4.5.0; push waits for the owner.
