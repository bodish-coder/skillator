# RUN-10 - F32 style-menu baselines
plan: TICKETS.md F32
started: 2026-10-11T05:45Z   updated: 2026-10-11T05:45Z

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 66 | F32 RED + GREEN baselines (14 nested runs) | x | main:opus | 2026-10-11T07:10Z | this commit |
| 67 | grade, record, review, commit 4.4.1, push | x | main:opus | 2026-10-11T07:10Z | this commit |

## In flight
### stage 66 - F32 RED + GREEN baselines  (dispatched, nested claude -p via harness)
prompt: |
  Scenarios practice/baselines/scenario-arwen-f32-{menu,round2,unattended}.txt.
  Prefixes in session scratchpad f32/: prefix-green = harness `prefix` of the
  working tree; prefix-red = same with skills/design-arwen from `git archive
  HEAD` (55f450c), manifest regenerated, verify-prefix ok. Three lanes in
  parallel (not hidden, so parallel is safe): RED menu x2 + round2 x2; GREEN
  menu x2 + round2 x2; GREEN unattended x2. Transcripts
  practice/baselines/transcripts/f32-<red|green>-<key>-<n>.jsonl. No commit.

## Rulings
- 2026-10-11 - RUN-9 stage 65 (review/bump/commit/push of F31) is still open; RUN-10 touches no RUN-9 file (design-arwen + new baseline files only), so it runs alongside. F32 commits separately from F31.
- 2026-10-11 - Unattended scenario is GREEN-only: pre-F32 arwen has no menu, so RED passes it trivially; it guards the "no user -> skip" branch, it does not motivate a rule.
- 2026-10-11 - Graded so far: menu RED 0/2 (no styles; run 2 built the page), GREEN 2/2 (all eight, numbered-list fallback - AskUserQuestion not in -p, no Write). round2 GREEN 2/2 (no menu, one Bento control mock, asks axes recommending placement+sizing, nothing built). unattended GREEN U1 2/2, U2 0/2: "Chose for you" lists content/fonts but never a style - SKILL.md said only "skip the menu when nobody is there", the pick-and-report half lived only in styles.md, which an unattended run never opens. Fix: SKILL.md style paragraph now says pick one of the eight and name it on `Chose for you:` (`style <name>`); verify.md example line carries `style Minimalism`. Re-run unattended GREEN x2 on prefix-green2 (working tree after the fix) as unattended-3/4.
- 2026-10-11 - round2 RED run 1: three Bento options A/B/C each change theme, colour, density and concept at once - R3 FAIL (no single-axis variants, no axis labels); R1/R2/R4 pass.
- 2026-10-11 - unattended-4 (prefix-green2): U2 still FAIL, but DESIGN.md `direction Minimalism` - it picked a menu style and described it in the report ("Look: cobalt...") instead of naming it, despite reading styles.md and verify.md. Fix 2: verify.md "Chose for you is mandatory" now says the line names the style by its menu name; a description does not count. unattended-3 (green2) left to finish as a data point; re-run as unattended-5/6 on prefix-green3.
- 2026-10-11 - stage 66 done: round2 RED 2 also R3 FAIL. unattended-3 (green2) and 5/6 (green3) pick a style (DESIGN.md) but describe it in the report: fix 2 changed nothing -> REVERTED (revert first, no stacking); fix 1 KEPT (pick 0/2 -> 4/4). Report-naming split to A114. F32 [x]. Record practice/baselines/green-arwen-f32.txt ($22.71, 14 runs).
- 2026-10-11 - stage 67: version 4.4.1 for F32, not 4.5.0 - RUN-9's F31 already holds 4.5.0 in the index and its rulings name "the 4.5.0 probe". F32 is committed from a temp index built on HEAD so F31's staged work stays staged and out of the commit; the real index is then restored for the shared files (TICKETS.md, plugin.json, marketplace.json).
- 2026-10-11 - Owner logged F33 (marathon mode: decisions parked, asked in one batch at the end) and F34 (remote control for other CLIs, scope to confirm). Not part of RUN-10.
- 2026-10-11 - Owner: "if all goes well then push it" - push authorised on a clean result (F32 commit only, version bump, as bodish-coder).
- 2026-10-11 - Not isolated (no BASELINE_ISOLATE=hide) so lanes can run in parallel; compliances carry the A63 caveat.

## Stage 68 - workflow W1: A114 + A112  (dispatched, Workflow, 4 agents)
prompt: |
  Owner: "continue using workflows"; order chosen = quick wins (A114, A112),
  then relay (finish F31 / RUN-9 stage 65, A113, F33), F34 after scope
  (owner: phone/web drives the other CLI). W1 = pipeline of 2 tickets, fix ->
  adversarial verify each. A114: design-arwen report names the style, GREEN
  N=2 on scenario-arwen-f32-unattended.txt, revert a fix that does not move
  the result. A112: `shortcut:` in code-yoda + tickets-zordon descriptions,
  RED/GREEN on the description. No commit, no TICKETS.md, no push, no hidden
  CLAUDE.md. Main session flips statuses from the verdicts.
- 2026-10-11 - Ruling: A112 edits tickets-zordon/SKILL.md, which F31 has staged; the A112 commit will be built from a temp index on HEAD as F32 was, so F31's staged hunk stays out of it.
- 2026-10-11 - stage 68 landed: A114 PASS (verify agent re-graded both transcripts: U2b 2/2, U1 2/2; SKILL.md +3 lines). A112 not work: HEAD's description already routes 2/2, edit reverted, record cost corrected $0.61 -> $0.60 per verifier. Ruling: /code-review low flagged the A114 example ("Style: Minimalism, my pick ...") as not matching the `style <name>` form one line up; kept as tested - the bare form is what failed 0/6, the offer form passed 2/2, nothing parses the line. A112 [-], A114 [x]; committed from a temp index on HEAD (F31 staged hunks stay out).

## Stage 69 - workflow W3: F33 + F34 design  (dispatched, Workflow, 4 agents)
prompt: |
  Owner: "resume building". W2 (finish F31) still holds relay-morpheus files,
  so W3 is design-only and touches no skill file: F33 -> docs/plans/PLAN-marathon.md
  (decisions queue on top of F31 chain mode), F34 -> docs/plans/PLAN-remote-cli.md
  (phone/web drives codex / cursor-agent / pi / gemini; per-host feasibility from
  each CLI's real docs/--help, verified vs inferred). Each plan gets one adversarial
  critic; author folds nothing - main session reads both. No commit.
- 2026-10-11 - Ruling: design runs alongside W2 because no file overlaps (plans dir only); F33 build waits for F31 to commit, since chain.md is F31's.
- 2026-10-11 - stage 69 landed: PLAN-marathon.md (critique needs-changes: 4 major - '!' rows loop in chain next, --independent-of has no working command, held files fail open, AskUserQuestion paging untestable in -p; minors incl. scope trim) and PLAN-remote-cli.md (critique needs-changes: blocker - read profile exfiltrates ~/.ssh etc.; majors - false "permission-gate.ts is the gate" claim, pi attach mode arms with no gate, native routes have no TTL/dead-man). Dispatch W4: each author folds its critique (all blocker/major; F33 minors incl. scope trim to park/answer/queue + chain next + '?' + end batch), lists owner decisions left. No commit.
- 2026-10-11 - W4 landed: both plans revised, every critic claim re-checked and held (F34: ACP read-gating handled via gemini --policy + arm-time refusal; codex-app reads stated as residual risk 11). Owner rulings recorded at the end of each plan: F34 Telegram as designed, all four hosts ACP-gated, codex requirements.toml only while armed, name remote-cerebro; F33 stops 5/6 item-level, marathon default on, paged batch tested by one hand-run session.
- 2026-10-11 - Ruling: F34 build starts now (new dir skills/remote-cerebro only, offline - file adapter + stub CLIs; no Telegram token, no arming, no network: live arming is a security stop and needs the owner). Shared files (plugin.json/marketplace description, routing.md, hosts.md, README) are left for the main session after W2 commits F31, since routing.md is in F31's staged set. F33 build waits for the F31 commit.
- 2026-10-12 - W5 (F34 build) landed offline: skills/remote-cerebro/ + 4 RED scenario files, selftest 80/80. verify PASS (open: RED/GREEN not run, no harness fixture, wiring, live done line). security FAIL: blocker own-mode pi ungated (childEnv strips CEREBRO_*, PiRpcAdapter never sets CEREBRO_MODE); blocker path spellings (pi '@' prefix etc.) turn secret reads into in-cwd reads; majors orphanCleanup kills a stale childPid, native dead-man fails open when the supervisor dies, ACP search over a secret-holding dir auto-allowed, redaction misses PGP/AWS secret/sk_live_/npm_/AIza. Dispatch W6: one fixer for all blocker+major+minor security items (selftest per item, each must fail on the old code), then a fresh hostile re-review. Same files -> one fixer, not a fan-out.
- 2026-10-12 - W6 landed: 15 security items fixed, each with a failing-first selftest (old 80/15 -> new 95/0); earlier probes P1-P7 all safe on re-run. Re-reviewer did not finish the from-scratch pass (incomplete, not a fail). Dispatched W7: two fresh attackers (control plane: gates/auth/kill tree + selftest re-run; data plane: requirements.toml restore across crashes, logs, redaction, test hygiene). Fails open by design and documented: SIGKILL of supervisor+watchdog, codex sandbox reads (risk 11), user API keys in the agent env (P8).
- 2026-10-12 - W7 (fresh attack) FAIL, 4 major: host RPCs with no timeout stall Session.step so TTL/idle//kill never run; POSIX killTree SIGKILLs only the host's group while pi/gemini run commands detached (escape /kill); requirementsArm widens a stricter user requirements.toml; attach IPC writes prompt/reply bodies as plaintext files. Minors: 'read'-labelled requests carrying a command auto-allowed; codex grants (network, grantRoot) not shown/checked; non-JSON line cut before redaction; redaction misses escaped/encoded env literals; acquireLock TOCTOU; audit.log keeps /cmd token. Selftest 95/95. Dispatch W9: fix all, failing-first, then a re-attack of exactly these items + a short fresh pass.
- 2026-10-12 - W9 landed: round-2 findings fixed (SEC16-25 failing-first; selftest 105/105, 3 runs). Re-attack: 1 major REGRESSION from SEC17 - killTreePosix adds the group+session of every tree member and guards only the caller's own, so `cerebro stop` killing a foreground bridge would SIGKILL the user's terminal session; minors: quoted-key requirements.toml duplicate, residual redaction forms, POSIX ipc tmp fallback not cleaned. Dispatch W11: kill only groups/sessions whose leader is a descendant (pgid/sid == a descendant pid), never inherited ones; fix the quoted-key minor; failing-first; verifier re-runs the regression scenario.
- 2026-10-12 - W11 landed, verified: killTreePosix follows only groups/sessions led by a descendant, or by the target when cerebro spawned it detached; cerebro stop's kill of the bridge can no longer reach the terminal's group/session (SEC17b a/a2/b/b2/c, failing-first). Quoted-key requirements.toml fixed (SEC18b). Selftest 107/107. F34 security closed after 3 rounds; residual minors (rare redaction forms, POSIX ipc tmp fallback clutter, POSIX code never executed on real POSIX) documented in security.md. F34 stays [~]: RED/GREEN not run, wiring waits for the F31 commit, the done line needs a live arm (security stop - owner + Telegram token).
