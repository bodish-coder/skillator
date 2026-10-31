grade: bounded integration; critical yes - installer ownership and shared state; design deep=gpt-6-astra/high; build gpt-6-astra/medium; verify deep=gpt-6-astra/high; ceremony full; ui none; mode per-task sequential named

Historical implementation plan for RUN-0027. Owner selected Option A for F140; execution results are in `.skillator/run-0027-reliability-backlog-sequential.md`. Later additions F144-F150 are pending tickets outside this implementation plan.
# Reliability backlog execution - 2026-10-30

PLATFORM: codex
DESIGN_MODEL: gpt-6-astra/high
BUILD_MODEL: gpt-6-astra/medium
GOAL: Complete the 19 eligible reliability tickets with fresh sequential implementers and independent verification.
CHOSEN: One isolated relay run; one recorded stage per ticket; review and commit each ticket before starting the next.

CONSTRAINTS:
- Work and commit only in the run worktree; main checkout source and existing reports are preserved.
- No agent edits TICKETS.md or publishes, pushes, installs into live profiles, reads credentials, or bypasses safety guards.
- Reproduce bugs before fixing; use temporary fixtures for installation, Git, quota and permission behavior.
- Preserve shell/PowerShell parity, Windows PowerShell 5.1 support, BOMless UTF-8, CRLF handling and documented host differences.
- Make the smallest ticket-scoped change; add no dependencies and refactor no unrelated files.
- A ticket closes only after its acceptance checks and independent review pass; unavailable live checks remain explicit.
- Every source change receives independent pre-commit review. No main merge or push without the workflow final gate.

REQUIREMENTS:
- R1: Satisfy A166 exactly as recorded in TICKETS.md.
- R2: Satisfy A167 exactly as recorded in TICKETS.md.
- R3: Satisfy A168 exactly as recorded in TICKETS.md.
- R4: Satisfy A169 exactly as recorded in TICKETS.md.
- R5: Satisfy A170 exactly as recorded in TICKETS.md.
- R6: Satisfy A171 exactly as recorded in TICKETS.md.
- R7: Satisfy A172 exactly as recorded in TICKETS.md.
- R8: Satisfy A173 exactly as recorded in TICKETS.md.
- R9: Satisfy A174 exactly as recorded in TICKETS.md.
- R10: Satisfy A175 exactly as recorded in TICKETS.md.
- R11: Satisfy A176 exactly as recorded in TICKETS.md.
- R12: Satisfy A177 exactly as recorded in TICKETS.md.
- R13: Satisfy F137 exactly as recorded in TICKETS.md.
- R14: Satisfy F138 exactly as recorded in TICKETS.md.
- R15: Satisfy F139 exactly as recorded in TICKETS.md.
- R16: Satisfy F140 exactly as recorded in TICKETS.md.
- R17: Satisfy F141 exactly as recorded in TICKETS.md.
- R18: Satisfy F142 exactly as recorded in TICKETS.md.
- R19: Satisfy F143 exactly as recorded in TICKETS.md.

TASKS:
### Task 1: A166
SATISFIES: R1
Files: plugin/install.sh, plugin/install.ps1 (ownership helpers, adoption/pruning branches, embedded selftests only)
Ticket: - [ ] A166 — Preserve modified helpers during installer cleanup. P1; first reliability batch. Audit 2026-10-30: plugin/install.sh owned_intact at line 159 checks only SKILL.md content plus filenames; an edited existing helper still passes and dry-run schedules its retired directory for deletion. Hash every installed file in both installer ports and retain modified or unverifiable legacy copies. Done = unchanged retired copies can be pruned, but modified helpers, added user files and unverifiable markers survive with an explanation; temporary-fixture tests cover both ports. (@cx-4f2a:-:direct)
Dependencies: none; first implementation priority.
Existing symbols (verified by current source): shell skill_hash, write_owned, owned_intact, prune_dest, install_into; PowerShell Get-RelFiles, Write-Owned, Test-OwnedIntact, Remove-Unshipped, Invoke-SelfTest and the install loop. The legacy branch currently trusts only SKILL.md; adoption also compares only that file.
Approach: keep the marker local to each installed skill. Write a versioned marker containing one full SHA-256 digest and relative filename per regular installed file, in deterministic ordinal order, excluding the marker itself. Hash bytes, not CR-stripped text, for the new format; keep the old skill_hash only where old compatibility needs it. A concrete proposed format is header "skillator-owned 2", then "file <64 lowercase hex> <relative/path>" with LF and no BOM; split the fixed hash prefix once so spaces in paths survive. Validate exact file-set equality and every digest. Reject duplicate, malformed, absolute, traversing or newline-containing paths, unreadable entries and unsupported symlink/reparse contents conservatively. Do not traverse a user link to establish ownership.
Migration: old markers cannot prove helper contents. Retain old retired copies with a modified-or-unverifiable explanation. Do not prune a pre-manifest legacy directory on its SKILL.md hash alone. Adopt an unmarked currently shipped copy only after its complete regular-file set and bytes match the shipped source, or leave it unowned; never bless local edits by hashing the destination indiscriminately. Preserve the existing separately verified whole-skill symlink policy.
RED fixture: embedded selftests create a two-file skill, install it into their existing isolated HOME/profile fixture, then retire its source. Assert helper edit, extra user file, missing helper, old marker, malformed marker and unverifiable legacy directory each survive both dry-run and actual cleanup; an untouched new-format copy is removed. A166 currently falsely schedules/removes the helper-edited copy. Assert the fixture root is the parent of every deletion target.
GREEN commands: sh plugin/install.sh --selftest ; powershell -NoProfile -ExecutionPolicy Bypass -File plugin/install.ps1 -SelfTest. These are installer regression commands for implementation, not suites run during design. Capture exit codes independently.
Interfaces: new marker writer and reader must land together in both ports. A167 consumes this format. Correct per-file enumeration is necessary here; do not preserve a known writer defect merely to keep a second ticket artificial.


### Task 2: A167
SATISFIES: R2
Files: plugin/install.sh, plugin/install.ps1 (marker writer/reader and embedded parity cases only)
Ticket: - [ ] A167 — Write valid PowerShell ownership file entries. P1; first reliability batch, same installer file cluster as A166. Audit 2026-10-30: plugin/install.ps1 Write-Owned at line 135 pipes Get-RelFiles unary-array output as one object, producing file SKILL.md helper.ps1; Test-OwnedIntact rejects an unchanged multifile installation. Enumerate one entry per file and handle malformed existing markers conservatively. Done = a multifile install is recognized unchanged, marker bytes agree with the shell port, and migration never discards user changes. (@cx-4f2a:-:direct)
Dependencies: A166 reviewed commit; re-read its marker format before changing anything.
Existing symbols: Get-RelFiles returns a unary array; Write-Owned currently pipelines that array as one object. Test-OwnedIntact expects one file per entry. Shell write_owned is the byte comparator.
RED fixture: use SKILL.md, helper.ps1, and "nested dir/café.txt" with identical bytes in both source fixtures; assert separate entries, deterministic ordering, LF, no BOM and byte-identical markers. Include an old malformed "file SKILL.md helper.ps1" line and ensure it cannot authorize deletion or migration over edits. Assert unchanged multifile ownership succeeds.
Approach: enumerate the returned array explicitly with foreach rather than interpolate the array object. Retain Get-RelFiles callers' expected collection shape. Consume A166's conservative migration rules. If A166 already fixes the whole defect, record it as integrated there and add only missing meaningful parity coverage; a failed reproduction after A166 goes to the controller, not an invented production change.
GREEN commands: sh plugin/install.sh --selftest ; powershell -NoProfile -ExecutionPolicy Bypass -File plugin/install.ps1 -SelfTest. Compare marker files as bytes, not rendered console lines.
Interfaces: A166's versioned marker is unchanged. No second marker schema.


### Task 3: A168
SATISFIES: R3
Files: plugin/commands/skillator-update.md; plugin/host-commands/{antigravity/skillator-update/SKILL.md,cursor/skillator-update.md,gemini/skillator-update.toml,opencode/skillator-update.md,pi/skillator-update.md}; plugin/install.sh and plugin/install.ps1 embedded command fixtures only
Ticket: - [ ] A168 — Refresh checkouts when update source is plugin. P1; first reliability batch. Audit 2026-10-30: installers record the plugin directory in .skillator-source, while skillator-update command and host templates pull only when source/.git exists; clone/plugin therefore reinstalls stale files. Detect checkout membership and root through Git while retaining the plugin installer path; preserve ff-only and failure guards. Done = temporary-clone fixtures cover clone root, plugin subdirectory, worktree, nongit plugin cache and failed pull, with no forced merge or reset. (@cx-4f2a:-:direct)
Dependencies: A166-A167 for shared installer edits; F140 later consumes the corrected instruction body.
Existing flow: step 2 in skillator-update selects .skillator-source, then tests src/.git; installers' write_commands/Write-Commands substitute host skill paths. The source pointer intentionally names plugin/.
Approach: resolve the installer directory independently: source itself when it holds both installers, otherwise source/plugin when it holds both. Ask Git about membership with git -C <installer-dir> rev-parse --show-toplevel. On success pull that checkout with git -C <checkout-root> pull --ff-only, then re-check both installers still exist and invoke them from the retained installer directory. Nongit cache proceeds without pull. A Git checkout whose pull fails stops before installation. Never merge/reset/stash/force; preserve existing marketplace and trust gates.
RED fixtures: a local bare origin plus two temporary clones provide a newer committed helper. Exercise clone root, clone/plugin, linked worktree with .git file, nongit cache, and a diverged/no-upstream checkout. Old instructions skip clone/plugin refresh. Assert source selection, pull argv, refreshed helper bytes, and zero installer calls after a failed pull. Use local remotes, not the user's remote.
Verification: extend embedded installer command checks to inspect every generated host command for the same membership/root/failure instructions, and execute the documented Git sequence against those fixtures. Commands: sh plugin/install.sh --selftest ; powershell -NoProfile -ExecutionPolicy Bypass -File plugin/install.ps1 -SelfTest. A prose assertion alone is insufficient to prove Git behavior.
Interfaces: preserve .skillator-source as the installer directory and existing command arguments.


### Task 4: A169
SATISFIES: R4
Files: plugin/skills/watch-cortana/hooks/{usage-watch.ps1,usage-watch.sh,selftest.ps1,quota-source-selftest.ps1}
Ticket: - [ ] A169 — Codex: scope quota readings to the active session. P1; first reliability batch. Audit 2026-10-30: usage-watch.ps1 level at line 306 and check at line 350 select a fresh Codex rollout before explicit Claude session flags; a 95 percent session and 91 percent week report another host as 10 percent and safe. Resolve explicit host, profile and session before selecting a reading in both ports; unrelated profiles must never silently substitute. Done = mixed-host and multi-profile fixtures retain the selected source, respect zero readings and report unavailable data honestly. (@cx-4f2a:-:direct)
Dependencies: none beyond sequential order; A171 consumes the selected-source rules.
Existing symbols: Get-CodexRollout/Get-CodexLastTc, Get-FlagKey, Get-CachedQuota, level/check; shell codex_newest_fresh, flag_key, read_cache. Verified: both level and check currently try a Codex rollout before explicit Claude session flags.
Approach: resolve source once before choosing readings, using existing SKILLATOR_CLI and SKILLATOR_PROFILE_DIR first, then explicit session identity (CLAUDE_CODE_SESSION_ID or available Codex session identity), then host-specific profile hints. Conflicting explicit identities produce unavailable with an explanation, not another host's quota. Selected Claude uses only its session's flags/profile cache. Selected Codex uses only its CODEX_HOME/profile and, when supplied, the matching session metadata/rollout; a missing selected session is unavailable. Without any selector retain documented legacy discovery inside one selected profile; do not search unrelated profiles. Share this decision within each port's level/check paths instead of introducing a provider framework. Preserve explicit numeric zero with null/presence checks.
RED fixture in quota-source-selftest.ps1: fresh Codex 10% plus selected Claude 95%/91% must report Claude and weekly HANDOFF NOW; inverse selection reports Codex. Add two Codex profiles, missing selected profile/session, fresh empty child rollout, stale readings, and 0% windows. Override every relevant environment path in children and restore parent environment; no live quota refresh process may start in these tests.
GREEN commands: powershell -NoProfile -ExecutionPolicy Bypass -File plugin/skills/watch-cortana/hooks/quota-source-selftest.ps1 ; powershell -NoProfile -ExecutionPolicy Bypass -File plugin/skills/watch-cortana/hooks/selftest.ps1. The first drives both ports; detect unavailable shell explicitly rather than assume its hard-coded Windows path exists.
Interfaces: keep level's src/5h/7d/ctx/max keys and check's handoff wording. Unknown values remain "-", never zero. Cache-schema validation belongs to A171.


### Task 5: A170
SATISFIES: R5
Files: plugin/skills/remote-cerebro/hooks/{cerebro-bridge.mjs,cerebro-selftest.mjs,stubs/stub-codex-app.mjs}
Ticket: - [ ] A170 — Codex: make thread changes atomic during turns. P1; first reliability batch. Audit 2026-10-30: cerebro-bridge.mjs CodexAppAdapter.newSession at line 495 changes threadId while keeping the old turnId and busy state; subsequent steer and abort use mismatched IDs and steering errors are swallowed. Refuse a busy switch or interrupt and await completion before switching; bind pending responses and notifications to their originating thread and surface RPC failures. Done = active-turn, awaiting-start, delayed-completion and rejected-steer fixtures show no lost prompt or invalid interrupt pair. (@cx-4f2a:-:direct)
Dependencies: none; F137 reuses the failure channel established here.
Existing symbols: CodexAppAdapter.#thread, prompt, abort, newSession, onMsg; inherited ProcAdapter.request/settle and Bridge event listeners. Verified newSession assigns threadId while old turn state survives; steer/interrupt catches discard errors.
Approach: refuse newSession while busy, including awaiting turn/start acknowledgement, with an actionable status/error; do not auto-interrupt or queue a hidden switch. Guard an in-flight thread/start transition as well, so concurrent new requests or prompts cannot target an indeterminate thread. Publish the new thread ID only after thread/start succeeds. Capture thread and turn identity in each asynchronous request and accept notifications only for their originating thread/active turn. Handle completion-before-start-response explicitly so a stale response cannot resurrect a completed turn. Reset only the state owned by the completed request. Keep held prompts attached to their originating turn; failures must return their text/context visibly rather than silently drop them.
RED fixture: make stub thread/start produce distinct IDs and reject mismatched thread/turn pairs. Add delayed start acknowledgement, delayed old-thread completion, concurrent newSession, rejected steer and rejected interrupt. Assert no second thread/start while busy, no mismatched RPC, no false "steered" success before acknowledgement, and no held prompt lost without visible failure.
GREEN command: node plugin/skills/remote-cerebro/hooks/cerebro-bridge.mjs selftest. Extend existing offline selftest, using stub protocol only; do not start a real Codex server. Expected RED is a busy switch sending thread/start or a stale completion clearing the new turn.
Interfaces: preserve adapter methods and Bridge's existing status/reply channels. Emit operation/thread context and safe error text for rejected RPC; approval handling and sandbox policy stay intact.


### Task 6: A171
SATISFIES: R6
Files: plugin/skills/watch-cortana/hooks/{usage-watch.ps1,usage-watch.sh,selftest.ps1,quota-source-selftest.ps1}
Ticket: - [ ] A171 — Validate quota caches separately from session flags. P2. Audit 2026-10-30: usage-watch.ps1 Get-FlagKey at line 156 accepts quota-cache.json; numeric flag parsing reads the 5h key as 5 percent and suppresses the real cache reader. Positively identify and validate session flags, exclude cache and refresh artifacts, and parse cached quotas through their schema in both ports. Done = cache-only input with 95 percent five-hour and 91 percent weekly usage reports those values from the correct host; malformed caches and zero-valued windows behave explicitly. (@cx-4f2a:-:direct)
Dependencies: A169; its source/profile selection is binding.
Existing symbols: Get-FlagKey, Read-Flag, Read-Token, Get-CachedQuota; shell main_flag, flag_key, read_pct, read_cache.
Approach: flag candidates must have a valid session-key shape and a complete numeric payload after permitted BOM/whitespace trimming; exclude quota-cache.json, refresh locks and artifacts before selection. Preserve weekly-only flags. Parse caches as actual JSON using existing available parsing facilities, validate recognized source and numeric finite 0..100 window values, distinguish absent/null/zero, and reject malformed/mismatched-source records. Do not use a regex's first digit as schema validation. Retain freshness rules and honest note-only unavailable data.
RED fixture: cache-only {"src":"claude-code","5h":95,"7d":91} in the watched directory currently becomes a 5% flag. Assert correct level and weekly check; test empty/truncated JSON, numeric-looking source names, string/negative/overrange quotas, zero windows, refresh-only files, stale and wrong-host caches.
GREEN commands: powershell -NoProfile -ExecutionPolicy Bypass -File plugin/skills/watch-cortana/hooks/quota-source-selftest.ps1 ; powershell -NoProfile -ExecutionPolicy Bypass -File plugin/skills/watch-cortana/hooks/selftest.ps1.
Interfaces: same level keys and flag byte format. If POSIX has no installed JSON-capable runtime, report unavailable instead of accepting malformed JSON; do not add a dependency silently.


### Task 7: A172
SATISFIES: R7
Files: plugin/skills/skillator-sync/scripts/{skillator-sync.ps1,skillator-sync.sh} (absorb and embedded selftests)
Ticket: - [ ] A172 — Fail absorption when the manifest write fails. P2. Audit 2026-10-30: plugin/skills/skillator-sync/scripts/skillator-sync.ps1 at line 167 continues after a denied WriteAllText, prints absorbed and exits zero with the old SHA still present. Make persistence errors terminating or explicitly handled, preserve the prior manifest and emit success only after the write succeeds. Done = read-only, locked and unwritable temporary manifests return nonzero without success output or damaged contents; a writable manifest updates correctly. (@cx-4f2a:-:direct)
Dependencies: none; F137 consumes the corrected failure behavior.
Existing symbols: PowerShell absorb branch, Fail-Die, Invoke-Selftest; shell do_absorb already uses a temporary file and guarded mv.
Approach: make persistence failures terminating locally. Serialize to a sibling temporary file, then atomically replace the existing manifest using an operation supported by Windows PowerShell 5.1; clean the temp in finally, keep original bytes on any failure, and emit absorbed only after successful replacement. Do not delete the destination first. Respect read-only attributes/permission denial, including where rename could otherwise bypass a read-only-file expectation. Mirror explicit failure semantics in shell without rewriting its already guarded path.
RED fixtures: hold a Windows FileStream without write/delete sharing, mark a temporary manifest read-only, and deny its directory writes where supported; assert nonzero, no absorbed line, original SHA/bytes unchanged, no leaked temp. Writable fixture changes exactly SHA/date. Permission cases unsupported by the runtime are skipped with reason, not simulated as passed.
GREEN commands: powershell -NoProfile -ExecutionPolicy Bypass -File plugin/skills/skillator-sync/scripts/skillator-sync.ps1 --selftest ; sh plugin/skills/skillator-sync/scripts/skillator-sync.sh --selftest.
Interfaces: retain absorb arguments, success text and existing error exit convention (2).


### Task 8: A173
SATISFIES: R8
Files: plugin/practice/scripts/taskwork.ps1; plugin/practice/scripts/selftest.sh
Ticket: - [ ] A173 — Preserve Unicode in PowerShell task briefs. P2. Audit 2026-10-30: plugin/practice/scripts/taskwork.ps1 line 37 uses Get-Content without UTF-8 encoding; Windows PowerShell 5.1 changes BOMless UTF-8 cafe-with-accent text before emitting the brief. Read explicitly as UTF-8 while preserving BOMless UTF-8 output. Done = shell and PowerShell briefs agree byte-for-byte for accented text, non-Latin requirements and Unicode paths, alongside existing nested-fence and task-boundary fixtures. (@cx-4f2a:-:direct)
Dependencies: none; run before later plans rely on Unicode task extraction.
Existing flow: taskwork.ps1 brief uses Get-Content without encoding and already writes UTF8Encoding(false); shell taskwork.sh extracts the same task.
Approach: specify UTF-8 on the design read; keep current fence/boundary logic and output encoding. Add one fixture containing café, हिन्दी, 中文 and a Unicode directory path with spaces; invoke both ports against isolated design copies and compare brief bytes.
RED: Windows PowerShell 5.1 yields mojibake from BOMless UTF-8. Compare expected UTF-8 bytes, no BOM, trailing LF, and exclude adjacent task content. Existing nested-fence tests remain.
GREEN: sh plugin/practice/scripts/selftest.sh. Extend this existing entry point to invoke powershell when available and report a reasoned skip otherwise; separately record the PowerShell 5.1 version. No parser refactor.


### Task 9: A174
SATISFIES: R9
Files: plugin/mods/ops-board/pi/{ops.ts,tests/ops.test.mts}; plugin/mods/ops-board/antigravity/{ops.ts,tests/ops.test.mts}
Ticket: - [ ] A174 — Normalize Space actions across ops adapters. P2. Audit 2026-10-30: pi/ops.ts line 51 and antigravity/ops.ts line 66 emit a literal-space key name while the shared reducer expects space; team selection, reconcile picks and other toggles do nothing. Normalize Space to the shared key name while preserving its printable sequence. Done = standalone, Pi and DOM adapters drive identical selection and toggle state transitions, and typing spaces in text fields still works. (@cx-4f2a:-:direct)
Dependencies: none.
Existing symbols: keyFromPi and keyFromDom emit name " "; standalone app.keyOf and state.reduce use name "space". Pi has separate Kitty and unnamed-printable paths that must also normalize it.
Approach: map the space character to name "space" at each adapter boundary while retaining sequence " ". Preserve modifiers, Unicode printable characters and ignored alt/meta chords.
RED: pass standalone, Pi named space, Pi Kitty space, Pi unnamed literal space and DOM key space into the same reducer fixture. Assert identical team/reconcile toggle state and insertion of an actual space in editable text. Assert ctrl/alt behavior unchanged.
GREEN from plugin/mods/ops-board/ops: node --import ./loader.mjs --test ../pi/tests/ops.test.mts ../antigravity/tests/ops.test.mts tests/teams.test.mts tests/state.test.mts.
Interfaces: shared Key shape unchanged; no reducer workaround.


### Task 10: A175
SATISFIES: R10
Files: plugin/mods/ops-board/hooks/lib/inbox.ts; plugin/mods/ops-board/hooks/messagestab.tsx; plugin/mods/ops-board/ops/{engine.ts,nodehost.ts,tests/messages.test.mts,tests/nodehost.test.mts}; plugin/mods/ops-board/tests/ message fixtures; plugin/skills/teams-uhura/scripts/inbox.mjs read-only reference
Ticket: - [ ] A175 — Read worktree messages from the common Git dir. P2. Audit 2026-10-30: hooks/lib/inbox.ts line 14 derives repoRoot/.git/skillator, but ops/nodehost.ts prefers the board worktree root whose .git is a file; teams-uhura writes the common Git directory instead and the board shows zero messages. Resolve inbox and read-marker paths from the common Git directory independently of board location. Done = main checkout and linked worktree display the same valid messages and read state while retaining their intended board roots. (@cx-4f2a:-:direct)
Dependencies: none; A176 follows the shared engine edit.
Existing symbols: inboxDirOf(repoRoot), engine.pollInbox, mod pollInbox, nodehost.findRepoRoot/makeHost, teams-uhura.mainRoot. Verified board root prefers the worktree with TICKETS.md, while producer storage is common Git dir.
Approach: keep board root unchanged and resolve inbox location separately. Use Git's absolute --git-common-dir in the Node host. For the mod use its existing host execution/filesystem boundary to resolve the same location; do not import Node fs into the host-independent inbox parser. A small optional host inbox-directory field/resolver is acceptable if every consumer/fixture is updated. Change inboxDirOf semantics explicitly or add a clearly named common-dir helper; never pass a board root to a function expecting a Git directory. Read-marker and inbox paths share the same resolved directory. Failed resolution is unavailable, not an accidental worktree/.git directory.
RED fixtures: real temporary repo and linked worktree both have different TICKETS.md; write one valid inbox/read marker to common Git dir. Assert both engines show the same messages/read state and retain their respective boards. Cover Git-directory paths with spaces, relative .git/commondir references and nongit input. Producer behavior is the oracle; change it only if a reproduced defect demands the contracted file.
GREEN from plugin/mods/ops-board/ops: node --import ./loader.mjs --test tests/messages.test.mts tests/nodehost.test.mts. Also run the repository's existing mod message fixture entry point discovered in its tests; record exact command before editing, not an invented package script.
Interfaces: only the inbox location crosses the host boundary; no board-root override or alternate inbox copy.


### Task 11: A176
SATISFIES: R11
Files: plugin/mods/ops-board/ops/engine.ts; plugin/mods/ops-board/ops/tests/{status.test.mts,messages.test.mts,runtab.test.mts,app.test.mts}
Ticket: - [ ] A176 — Stop pending ops effects after board shutdown. P2. Audit 2026-10-30: ops/engine.ts pollSlow at line 228 resumes after stop and apply/runEffect do not guard stopped; delayed low-disk data dispatches relay-hold after the board closes. Guard continuations and effect execution after stop and cancel owned child operations where supported. Done = deferred machine, usage and action responses cannot launch new commands or writes after stop, timers and jobs are cleaned up, and normal running-state behavior remains covered. (@cx-4f2a:-:direct)
Dependencies: A175 for engine edits.
Existing symbols: makeEngine apply/runEffect/guarded, pollSlow/pollRuns/pollBoard/readRunFile, startJob, stop. Host.run returns a promise; host.spawn returns a stoppable job.
Approach: stopped is a terminal state. Guard public actions and apply/runEffect, and check after each awaited boundary before mutating state, scheduling further reads/effects or launching writes. Guard asynchronous job callbacks too. Own the job ticker outside its callback and clear it on stop, even when a stub never calls onEnd. Stop the existing owned job through its handle. Do not introduce cancellation support for host.run under this ticket's engine-only contract; already running noncancellable calls may settle, but their results have no effects.
RED fixture: deferred pending-machine resolves low-disk after stop and currently launches relay-hold. Repeat with usage, action completion, run-file scan, board/inbox reads and job callbacks. Assert no additional command/write/draw/state transition; repeated stop is harmless, timers removed, owned job stopped once. Running controls still perform effects.
GREEN from plugin/mods/ops-board/ops: node --import ./loader.mjs --test tests/status.test.mts tests/messages.test.mts tests/runtab.test.mts tests/app.test.mts.
Interfaces: Engine.stop remains synchronous and idempotent; host interfaces unchanged.


### Task 12: A177
SATISFIES: R12
Files: only over-budget plugin/skills/*/SKILL.md descriptions identified by context-audit.sh; plugin/skills/grayskull-power/SKILL.md and its existing references/{routing.md,ground-rules.md,arming.md}
Ticket: - [ ] A177 — Restore skill and router context budgets. P2. Audit 2026-10-30: context-audit.sh reports nine descriptions over the 80-word limit and grayskull-power at 869 words against 800; related earlier budget work A72 and A82 is closed. Shorten current descriptions and move router depth to references while preserving triggers and routing. Done = the context-budget audit passes, routing and grayskull-template checks pass, and required trigger phrases remain discoverable. (@cx-4f2a:-:direct)
Dependencies: none; preserve router semantics and the arming template.
Existing checks: context-audit.sh, check-routing.sh, check-grayskull-sync.sh. Budget facts in ticket are historical until remeasured.
Approach: run the context audit first, freeze the exact failing skill filenames as this task's narrower contract, shorten those descriptions below 80 words while retaining every trigger phrase/negative boundary, and move router detail into its existing relevant reference until body is <=800 words. Do not weaken budgets or edit the auditor. No new routing table.
RED/GREEN commands: sh plugin/practice/scripts/context-audit.sh plugin ; sh plugin/practice/scripts/check-routing.sh plugin ; sh plugin/practice/scripts/check-grayskull-sync.sh. Compare before/after trigger inventory with exact phrases; failures outside this task's contract go to controller.
Interfaces: unchanged skill names, route targets and grayskull template bytes. This is documentation work; no production logic test is needed beyond these checks.


### Task 13: F137
SATISFIES: R13
Files: plugin/mods/ops-board/ops/{nodehost.ts,engine.ts,tests/nodehost.test.mts,tests/status.test.mts,runtab.ts,tests/runtab.test.mts}; plugin/skills/remote-cerebro/hooks/{cerebro-bridge.mjs,cerebro-selftest.mjs}; plugin/skills/skillator-sync/scripts/{skillator-sync.ps1,skillator-sync.sh}
Ticket: - [ ] F137 — Visible failures for background operations. User reliability request 2026-10-30. Standardize failure results and user-visible error reporting for background commands, asynchronous steering and writes; retain actionable command/context and return nonzero on failure, never announce success before completion. Integrate A170 and A172 rather than duplicate their fixes. Done = injected spawn, rejected RPC and denied-write failures produce a visible error and failure result, while successful operations still report success. (@cx-4f2a:-:direct)
Dependencies: A170, A172, A176. The listed runtab.ts is a related result-display surface; confirm before dispatch if controller requires the original contract to remain exact.
Existing interfaces: RunResult {code,out,err,argv}, spawnArgv, Host.spawn callbacks, engine notes, onJobEnd; Cerebro status/reply; absorb exit code.
Approach: reuse each existing result shape and make its failure visible at the existing UI/status boundary. Do not create a repository-wide error framework. Ensure spawn throws/error events, nonzero exits, timeouts and rejected host promises become nonzero RunResult or failed job status with command/context. Surface detached poll failures through notes while running; suppress post-stop effects under A176. A170 owns rejected RPC handling, A172 owns denied write handling; integrate their checks, do not duplicate implementations. Success is emitted only after completion.
RED fixtures: missing executable, process exits nonzero with stderr, host promise rejects, denied write and rejected steer. Assert visible operation/error and non-success result, not just a log call. Success controls retain current display.
GREEN: from ops directory node --import ./loader.mjs --test tests/nodehost.test.mts tests/status.test.mts tests/runtab.test.mts; node plugin/skills/remote-cerebro/hooks/cerebro-bridge.mjs selftest; both skillator-sync --selftest commands from A172.
Interfaces: result fields and existing exit conventions retained; safe bounded stderr, never credential contents.


### Task 14: F138
SATISFIES: R14
Files: plugin/practice/scripts/reliability-parity.mjs (new); plugin/practice/scripts/reliability-parity.test.mjs (new); README.md; existing fixture functions in plugin/skills/watch-cortana/hooks/quota-source-selftest.ps1 and plugin/practice/scripts/selftest.sh only if needed
Ticket: - [ ] F138 — Shared shell and PowerShell regression fixtures. User reliability request 2026-10-30. Run the same input/output fixtures against both script implementations, including Unicode, paths with spaces, permission failures, modified installations and Git worktrees; include the A166-A176 regressions and the UTF-8 brief case from A173. Done = one documented parity entry point compares outputs, exit status and filesystem effects, fails on deliberately introduced divergence and reports unavailable runtimes as skipped. (@cx-4f2a:-:direct)
Dependencies: A166-A176; their behavior fixtures are the source of truth.
Approach: a small Node stdlib driver executes the same case data in two isolated child environments through sh and Windows PowerShell 5.1/pwsh. Reuse existing selftests; do not duplicate their product algorithms. Cases compare exit status, defined stdout/stderr, and relative filesystem snapshots/file hashes. Normalize only documented host transport differences (temporary root and newline rendering); marker/brief file bytes compare exactly. Include Unicode, spaces, protected manifest, edited helper, source plugin directory, Git worktree inbox, quota selection/cache cases. A170/A174/A176 are JS/TS regressions and run once as shared application checks, explicitly not fake shell-port comparisons.
RED driver selftest: inject one different output, status and file byte independently; each must fail. Missing runtime is skipped with executable name; unavailable permission semantics skipped with reason. All skipped is not a pass. No global installs.
Planned commands (new, not currently implemented): node plugin/practice/scripts/reliability-parity.mjs --selftest ; node plugin/practice/scripts/reliability-parity.mjs --report <temporary-report.json>. Output JSON entries contain id,status,reason,command,code and evidence paths; status is passed/failed/skipped/blocked. Exit 1 for failed, 2 for blocked/incomplete required checks, 0 only when all required available checks pass and skips are disclosed.
Interfaces: consume existing commands; F141 consumes this report contract. The new driver is a test entry point, not a general workflow engine.


### Task 15: F139
SATISFIES: R15
Files: plugin/practice/scripts/codex-isolation.mjs (new); plugin/practice/scripts/codex-isolation.test.mjs (new); plugin/practice/baselines/README.md; plugin/PLATFORMS.md; README.md
Ticket: - [ ] F139 — Codex: isolated installation and loading checks. User Codex reliability request 2026-10-30. Add isolated temporary-profile checks for installation, skill discovery, generated command loading and usage-hook behavior; isolate project/global instruction and skill sources, with no credential-file reads. Reference F90, F105 and A149; this adds reproducible integration infrastructure rather than duplicating their outstanding live checks. Done = deterministic offline fixtures pass, an opt-in live discovery/loading check records CLI version and evidence, and missing login or hook trust is reported as blocked rather than passed. (@cx-4f2a:-:direct)
Dependencies: A166-A169, A173 and F138 report vocabulary. Do not close F90/F105/A149 from offline evidence.
Existing reference flows: installer Codex skill generation, probe-commands.sh's presence/version checks, baseline-harness.sh's fixture/evidence records, Cerebro's stub Codex protocol. None proves live skill loading.
Approach: create a disposable project outside the actual repo and disposable child HOME/USERPROFILE/CODEX_HOME/XDG roots. Seed only known fixture instructions/skills, install a copied source into that fixture, inspect generated skill names/content and run usage hooks with synthetic rollouts. Set the child working directory to the isolated project; parent repo instructions and shared ~/.agents sources must not leak. Capture CLI version and exact evidence provenance. Do not read/copy auth files or inherited secret values into reports.
Planned commands: node plugin/practice/scripts/codex-isolation.mjs --selftest ; node plugin/practice/scripts/codex-isolation.mjs --offline --report <temporary-report.json>. Optional --live is implemented but not run in this relay: it performs actual discovery/loading with timeout, records effective isolated paths and loaded skill evidence, and reports missing login or hook trust as blocked. Never auto-login or alter trust. Query the installed CLI's help/schema before choosing live arguments; do not assume remote pairing proves loading.
RED fixtures: external instruction sentinel appears in loaded sources, missing generated command, hook reads outside quota fixture, stub authentication/trust errors, and missing CLI. Each yields failed/blocked as appropriate; no file-presence check can label live verified.
Interfaces: same per-check report vocabulary as F138. Runtime live credentials/trust remain an owner-controlled prerequisite, not an architectural approval request.


### Task 16: F140
SATISFIES: R16
Files: plugin/commands/ (canonical bodies plus proposed source metadata); plugin/host-commands/ (generated artifacts); plugin/practice/scripts/generate-commands.mjs (new); plugin/practice/scripts/generate-commands.test.mjs (new); plugin/install.sh; plugin/install.ps1; README.md
Ticket: - [ ] F140 — Generate host commands from shared instructions. User maintainability request 2026-10-30. Replace manually repeated command instructions in plugin/commands and plugin/host-commands with one canonical body plus host-specific wrappers and explicit substitutions; preserve host invocation differences. Done = deterministic generation reproduces every supported command, a check detects stale generated copies, and installer command checks pass across host targets. (@cx-4f2a:-:direct)
Dependencies: A168; use its corrected update instructions.
Classification: architectural authoring-interface change. APPROVAL NEEDED before this task's implementation under PRACTICE §1; earlier bounded fixes can continue.
Option A (recommended): retain plugin/commands/*.md as canonical command content, with minimal explicit metadata/wrapper fragments for host variants, and generate committed host-commands artifacts offline. Installers continue consuming files and substituting their existing {{SKILLS}} placeholder; no Node requirement at install time. Small Node stdlib generator only at development/check time.
Option B: move all bodies into a new templates directory and generate both commands and host-commands. Cleaner symmetry but larger churn and a new authoring root. Do not implement Option B without selection.
Concrete recommended contract: inventory every existing output and alias; one canonical body per semantic command, explicit host sections only where invocation differs (Gemini !{...}, Codex skill wrappers, Claude skill namespace, Pi prompt conventions). Never mechanically erase those differences. Deterministic --write and nonmutating --check modes; LF/no BOM. Unknown substitutions or duplicate output paths fail before writes. Do not delete user/unrecognized files.
RED: --check on a temporary stale generated copy fails and names the path; regenerate twice yields identical bytes; every existing supported command/alias remains covered. Compare semantic output to the pre-generation fixtures and installer-generated Codex wrappers.
Planned commands: node plugin/practice/scripts/generate-commands.mjs --check ; node --test plugin/practice/scripts/generate-commands.test.mjs ; both installer selftests. These new symbols/tests are not built.
Interfaces: owner selects authoring root; published host filenames and installer substitutions remain unchanged.


### Task 17: F141
SATISFIES: R17
Files: plugin/practice/scripts/validate.mjs (new); plugin/practice/scripts/validate.test.mjs (new); README.md
Ticket: - [ ] F141 — One validation command with explicit outcomes. User maintainability request 2026-10-30. Provide one documented validation entry point over the existing routing, manifests, board, context, script parity and relevant application checks, including F138 and F139 when available. Report passed, failed, skipped or blocked per check with reasons; bound child runtimes, clean up children and propagate failure status without silently treating partial or interrupted suites as green. Done = fixtures exercise all four outcomes and timeout cleanup; the command produces a concise summary and an inspectable report. (@cx-4f2a:-:direct)
Dependencies: A177, F138, F139; F140 check registered only when that approved task exists.
Existing checks: check-routing.sh, check-muse-manifest.sh, check-tickets.sh, context-audit.sh, check-grayskull-sync.sh, installer/script selftests and ops loader-based tests. Extend these entry points rather than replace their assertions.
Approach: a fixed explicit table of check IDs/argv/cwd/budgets using Node child_process; no shell-built command strings, dynamic plugins or discovery framework. Invoke F138 and F139 offline by default. Bound each child and captured output; terminate its owned process tree on timeout/cancel (Windows hidden windows), await cleanup, write a report even on interruption. Per-check passed/failed/skipped/blocked with a reason. A launched check timing out is failed; missing required runtime is blocked, optional unavailable check is skipped; never label an incomplete suite passed.
Planned commands: node --test plugin/practice/scripts/validate.test.mjs ; node plugin/practice/scripts/validate.mjs --report <report.json>. Tests inject a fixed temporary manifest of tiny child programs: exit 0, exit 3, unavailable optional executable, missing prerequisite, sleeping child with grandchild. Assert exact statuses, bounded duration, child death and report persistence. Mutate one passing child to fail to prove propagation.
Interfaces: stable report entries from F138/F139 plus summary counts; exit 1 on any failed, 2 on blocked required/interrupted, 0 only when required checks passed. A concise console summary links the report; it never implies stub/live equivalence.


### Task 18: F142
SATISFIES: R18
Files: plugin/PLATFORMS.md; README.md; plugin/mods/ops-board/README.md; plugin/skills/remote-cerebro/references/hosts.md
Ticket: - [ ] F142 — Document evidence-based support per host. User maintainability request 2026-10-30. Consolidate capability support in plugin/PLATFORMS.md and relevant README references using implemented, tested with stubs and verified live levels, with CLI version, date, evidence and limitations per capability. Keep remote pairing, skill loading and hook trust distinct. Done = each advertised host capability has a support level and evidence or an explicit unverified gap, with no stub result presented as live verification. (@cx-4f2a:-:direct)
Dependencies: F137-F141 evidence available, but absent/blocked evidence remains an explicit gap.
Approach: make PLATFORMS the canonical capability table and link other READMEs to it. One row per host/capability with implementation path, support level (implemented / tested with stubs / verified live), CLI version or unknown, date, evidence path and limitation. Separate remote pairing, skill discovery/loading, generated command expansion, usage hooks/trust and board rendering. Live evidence must identify the real host/version and observed capability; an offline installer or stub result never upgrades it.
Verification: manually trace every advertised host capability in the four files to a row and evidence or explicit unverified gap; run git diff --check and check relative evidence links exist. Cross-check F90/F105/A149 remain open/testing where their live evidence is missing. Do not invent new live runs or copy credentials to substantiate a row.
Interfaces: documentation only, same advertised command names and existing host distinctions.


### Task 19: F143
SATISFIES: R19
Files: .codegraph/ supported configuration only; AGENTS.md; plugin/skills/grayskull-power/scripts/{codegraph-check.sh,codegraph-check.ps1}; plugin/skills/grayskull-power/references/arming.md; README.md
Ticket: - [ ] F143 — Exclude generated copies from CodeGraph indexing. User maintainability request 2026-10-30. Configure supported CodeGraph exclusions for generated reports, frozen implementation copies and scratch artifacts so source queries prioritize tracked plugin code; preserve real source, tests and intentional fixtures. Done = reindexing excludes representative .skillator/reports copies, targeted inboxDirOf and engine queries resolve current plugin source, and exclusion configuration plus rebuild instructions are documented. (@cx-4f2a:-:direct)
Dependencies: none functionally; perform last so the chosen exclusions cover this run's artifacts.
Evidence: CodeGraph 1.4.1 explore returned .skillator/reports/B17-runtime and F116-frozen-suite before current inbox/engine sources. index --help exposes rebuild options but no exclusion flag. Supported config syntax has NOT been verified; do not invent a config file/key.
Approach: inspect the installed CodeGraph package documentation/config loader read-only to identify its supported ignore mechanism and precedence. In an isolated temporary source copy, configure narrow exclusions for .skillator/reports/**, .skillator/worktrees/** and known scratch/generated duplicate trees. Preserve plugin/**, tests and intentional fixtures. If configuration lives outside this file contract, or the installed version lacks exclusions, record the exact unsupported capability and ask controller for a concrete scope/upgrade decision; no ad-hoc database deletion or ignored source assumptions.
RED/GREEN: create one real plugin symbol and frozen duplicate in the temporary copy, index it with the existing tool, then verify configured rebuild removes only duplicate paths and retains source/tests. Commands after the mechanism is confirmed: codegraph index <isolated-copy>; codegraph explore "inboxDirOf makeEngine" from that copy. Record paths returned, not just symbol counts. Run both codegraph-check selftests if those scripts change.
Interfaces: document exact installed version, verified config path/syntax and rebuild command. Rebuilding the main shared index is an external/shared-state action reserved for the controller's final gate; this seat does not index anything.


VERIFICATION: Per-ticket acceptance and regression checks, then routing, manifest, board integrity, context budgets, relevant shell/PowerShell and ops-board suites; final independent whole-branch review.

TRACE:
| Requirement | Ticket/task | Existing implementation surface | Built symbols | Built regression evidence |
|---|---|---|---|---|
| R1 | A166 / 1 | plugin/install.sh, plugin/install.ps1 (ownership helpers, adoption/pruning branches, embedded selftests only) | NONE | NONE |
| R2 | A167 / 2 | plugin/install.sh, plugin/install.ps1 (marker writer/reader and embedded parity cases only) | NONE | NONE |
| R3 | A168 / 3 | plugin/commands/skillator-update.md | NONE | NONE |
| R4 | A169 / 4 | plugin/skills/watch-cortana/hooks/{usage-watch.ps1,usage-watch.sh,selftest.ps1,quota-source-selftest.ps1} | NONE | NONE |
| R5 | A170 / 5 | plugin/skills/remote-cerebro/hooks/{cerebro-bridge.mjs,cerebro-selftest.mjs,stubs/stub-codex-app.mjs} | NONE | NONE |
| R6 | A171 / 6 | plugin/skills/watch-cortana/hooks/{usage-watch.ps1,usage-watch.sh,selftest.ps1,quota-source-selftest.ps1} | NONE | NONE |
| R7 | A172 / 7 | plugin/skills/skillator-sync/scripts/{skillator-sync.ps1,skillator-sync.sh} (absorb and embedded selftests) | NONE | NONE |
| R8 | A173 / 8 | plugin/practice/scripts/taskwork.ps1 | NONE | NONE |
| R9 | A174 / 9 | plugin/mods/ops-board/pi/{ops.ts,tests/ops.test.mts} | NONE | NONE |
| R10 | A175 / 10 | plugin/mods/ops-board/hooks/lib/inbox.ts | NONE | NONE |
| R11 | A176 / 11 | plugin/mods/ops-board/ops/engine.ts | NONE | NONE |
| R12 | A177 / 12 | only over-budget plugin/skills/*/SKILL.md descriptions identified by context-audit.sh | NONE | NONE |
| R13 | F137 / 13 | plugin/mods/ops-board/ops/{nodehost.ts,engine.ts,tests/nodehost.test.mts,tests/status.test.mts,runtab.ts,tests/runtab.test.mts} | NONE | NONE |
| R14 | F138 / 14 | plugin/practice/scripts/reliability-parity.mjs (new) | NONE | NONE |
| R15 | F139 / 15 | plugin/practice/scripts/codex-isolation.mjs (new) | NONE | NONE |
| R16 | F140 / 16 | plugin/commands/ (canonical bodies plus proposed source metadata) | NONE | NONE |
| R17 | F141 / 17 | plugin/practice/scripts/validate.mjs (new) | NONE | NONE |
| R18 | F142 / 18 | plugin/PLATFORMS.md | NONE | NONE |
| R19 | F143 / 19 | .codegraph/ supported configuration only | NONE | NONE |

All Built columns are NONE at design time. Existing symbols above are source anchors, not claims that the requirement is implemented. Each implementer must replace NONE only with actual landed symbols and observed red/green evidence through the controller; no ticket closes on this design alone.

## Design review record
- Coverage: all 19 original requirements map to one task; first five fixes remain first and sequential.
- Contracts: listed files are the proposed per-task boundaries. Related new test drivers are named explicitly; controller confirms any expansion from the original coarse contract before dispatch. No blanket edits across a directory.
- Consistency: A166 owns the marker format; A167 consumes it. A169 selects quota source; A171 validates its data. A170/A172 feed F137. F138/F139 expose explicit outcomes consumed by F141. F140 cannot silently introduce an installer runtime dependency.
- Ambiguities resolved: busy thread switch is refused; no automatic interrupt. Legacy ownership is conservative. Missing quota is not zero. Board root and common Git inbox root are independent. Stop means no subsequent effects, not cancellation of unsupported host calls.
- Approval: F140 authoring-interface choice requires owner selection. F143 requires a supported exclusion mechanism and possibly a specific scope decision after local package inspection; no guessed configuration is authorized. Optional live Codex checks remain unrun until expressly authorized and login/trust prerequisites exist.
- Verification limits: source review and CodeGraph query only; no product regression suites run and no bug declared fixed. Implementers must reproduce their task against the immediately preceding reviewed commit.

## Decisions
- Ruling: sequential mode - pending-subagent defaults to one implementer at a time; no parallel file conflicts.
- Ruling: A166 and A167 remain separate stages sharing installer files and run serially; later fixes consume earlier reviewed commits.
- Ruling: prior B15 and B17 failed reproductions remain blocked; 39 testing tickets stay outside this implementation run.
- Ruling: existing low-memory hold was based on 0.9 GB; fresh machine reading is 3706232832 bytes free and 20503232512 disk bytes free; release the stale hold before dispatch.
- Session owner: @sher confirmed by controller during design preparation; only controller claims/dispatches implementation.

## Outcome
- Design preparation complete; no implementation, ticket claim, test-suite run or commit performed by the design seat.
- Global CONSTRAINTS preserved verbatim. Read-only source review corroborates the first five failure paths; actual RED/GREEN remains implementation work.
