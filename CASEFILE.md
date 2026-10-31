# CASEFILE - 2026-10-31: complete code and ticket audit

Source snapshot: `8b92f76657a67c2e580e27098a02585e868bc3fa` (Skillator 4.22.0). Run: RUN-0028. Driver: @sher.

**37 independently accepted findings**: 18 high and 19 medium. No critical finding is claimed. One candidate is separated as requested Messages completion work, two duplicate parent records collapse, and zero candidates remain pending. Previously rejected process-cleanup/cwd hypotheses remain excluded.

**Coverage:** all 593 current source/test/configuration/instruction targets and all 377 pre-audit ticket rows have explicit review records. Generated host projections were checked against the canonical generator;79 current scenario specifications were read as tests. Historical execution logs, frozen proof copies and generated reports are evidence, not shipped implementation. Source/caller/test examination is not a fresh live execution of every contract.

**Source assessment of377 rows:** 287 present,52 partial,7 pending/unimplemented,11 superseded,6 historical-evidence records,14 cancelled. Present means the implementation path exists in reviewed source; it does not mean all host/runtime acceptance passed. Partial includes unmet clauses or acceptance boundaries; it is not a count of independent bugs.

**No production fixes were made.** 47 pending tickets were added: B21; F151-F156; F90a/F98a; A178-A215. Existing statuses/IDs were preserved. Parent/subpart placement is retained. Source snapshot excludes the subsequently added proposal/fix rows.

## Evidence and validation

- Full per-ticket trace: `.skillator/reports/full-code-audit-20261031/ticket-evidence.csv` and `.json`; each row has acceptance, actual source/caller/test refs and remaining uncertainty.
- Published final evidence includes the ticket CSV/JSON, file-coverage ledgers, source scope, verification decisions and selected probe results. Raw execution logs, probe scripts, original snapshots and intermediate investigator ledgers remain local in the audit directory; references to those files identify retained local evidence, not published attachments.
- File coverage and snapshot hashes: `expanded-source-scope.json`, domain `*-file-coverage.json`, `scenario-file-coverage.json`, and final `coverage-reconciliation.json` under the same directory.
- A syntax-only credential-pattern scan covered all 1,835 tracked text files, including historical logs: 20 candidate lines traced to synthetic fixture literals. No credential liveness test was attempted; this does not prove every possible secret format is absent.
- Untracked scratch/test-f136.ps1 and empty scratch/update_handoff.py were additionally inspected as unshipped local helpers, not executed or used as passing evidence. Generated reports, handoffs and frozen proof copies were retained.
- Three Astra/high domain investigators, a fresh Astra/high helper investigator, parent source review and a fresh Astra/high adversarial verifier supplied the evidence; all investigator artifacts are under that audit directory.
- Existing safe offline Node checks: parity driver 11/11, validator 9/9, selected Codex protocol 6/6; standalone Messages 12/12. Messages tests intentionally preserve the old auto-open contract.
- Helper selftests: artifact/archive/checker/PowerShell allocator/PowerShell freshness passed; parent reran shell allocator/freshness with appropriate temporary-fixture access and both passed.
- Routing, grayskull-template sync and context commands passed. The context command has a separately reproduced split-layout blind spot (A194), so its green result does not certify root instruction budgets. Generator --check matched 137 outputs.
- The isolated Git-path probe inherited a denied global-ignore lookup warning in both its passing control and failing quoted-path case. This fixture-environment noise is retained in the evidence; the quoted-path case separately exits 128 with a pathspec error. Future probes should isolate global excludes as well as repository configuration.
- Isolated negative probes and exact-function checks establish quoted Git path failure, decoder corruption, stalled disarm teardown, wrong-set wizard settling, unseen-message read markers, deploy rendering/contrast failures, alias projection, archival grouping and false-green check paths. A reproduced defect is not a passing feature test.
- No live auth, tunnel arming, Teams message/reply, production deployment/DB backup/cert issuance, real AI Git workbench, native trusted Codex loading, new native Claude-pane acceptance, or race stress run was performed. Relay concurrency findings are source-proven conditional interleavings, not live stress claims.
- Prior RUN-0027 release evidence remains retained separately: 18 composed top-level passes with two nested platform skips; it is not a new full audit-suite run.

## Requested completion work

- **B21 / F98a:** Messages must remain on inbox/empty state until explicit Setup; expose Sign in and Run first-time setup separately from read-only Check setup. Existing auto-open/check-only code is deliberate, while the user now explicitly requests a different interaction and F98 still lacks its full interactive launch. This is not counted as an accidental regression.
- **F151-F156 / F133:** implement actual active-host AI review/drafting, incoming/outgoing analysis and conflict handoff; then bring confirmed Git actions, branch switching and streamed outcomes to the requested supported surfaces. Standalone read-only/paste-only policies are acknowledged as prior scope, not silently called defects.
- **F90a:** verify/update only the selected active Codex profile when authorized. Its installed state.ts differs from the release checkout; a refresh of another profile does not establish this profile's parity. Exact installed version was not inferred from timestamps.
- **A180 / A181:** preserve historical aliases in board readers and separate inbox-reading from handoff-sending command semantics; these already logged gaps remain pending alongside the new findings.

## Codex-specific review

- **Installation and discovery (F90):** native skill projection, command frontmatter and installer ownership paths are present in source. **F90a** records the selected active profile's installed-file mismatch and the remaining install/discovery/command/hook acceptance. Another profile's refresh does not establish parity.
- **Quota selection and cache handling (A169/A171):** explicit host/profile/session selection and separate cache/flag readers are present in both ports. Source/caller/test traces are recorded per ticket; this audit did not rerun every native profile or certify live quota freshness.
- **Thread switching (A170):** the Codex app adapter now guards busy switches and keeps thread/turn identifiers aligned. This audit found no additional proven thread-switch defect; selected offline protocol tests passed, with no live Codex turn executed.
- **Isolation tooling (F139):** temporary-profile installation/loading and native-probe helpers exist. The six selected Codex tests exercised offline protocol behavior; they do not establish trusted native skill discovery or hook invocation in this session.
- **Host boundaries:** generated wrappers share canonical instructions, while installation and hook behavior remain host-specific. Claude hook behavior is not evidence that Codex invokes an equivalent hook. A149 retains unproven live routing acceptance; no dependency on another host's successful run is used as a Codex pass.

## High findings

### A182: Tear down remote sessions before channel notifications

**Failure/impact:** Session sets disarmed before awaiting remote approval-button cleanup and notification, and only later invokes local teardown. Independent probes separately stall send and editButtons; teardown never starts. Timer skips disarmed sessions. Production Telegram timeout bounds one request to35s by default, so prove delayed safety teardown on channel outage, not necessarily permanent production hang.
**Source:** plugin/skills/remote-cerebro/hooks/cerebro-bridge.mjs:284; plugin/skills/remote-cerebro/hooks/cerebro-bridge.mjs:318; plugin/skills/remote-cerebro/hooks/cerebro-bridge.mjs:971; plugin/skills/remote-cerebro/hooks/cerebro-bridge.mjs:1048; plugin/skills/remote-cerebro/hooks/cerebro-bridge.mjs:134.
**Recommendation:** Start guaranteed local child/route teardown before awaiting remote notification or approval-button cleanup; bound best-effort remote work separately. Assert teardown occurs with send/editButtons permanently pending.
**Evidence and limits:** score 95/100. Never-resolving in-memory channels,10ms observation plus static await dependency; no spawned process, real kill or network outage test. Proof: verification-pure-probes.json; automation-cerebro-probe-results.json.

### A179: cmdMessage writes the sender-local inbox then sends only message text through say; recipient metadata is not transported. A failed channel post still returns success with a delivered-to-recipient-inbox claim. A recipient on another machine has no delivered inbox record.

**Failure/impact:** cmdMessage appends only sender-local Git inbox and optionally sends plain text; recipient envelope never enters transport. Channel failure still returns0/delivered. Distinct from OPS-07 receiving/rendering metadata loss.
**Source:** plugin/skills/teams-uhura/scripts/team.mjs:649; plugin/skills/teams-uhura/scripts/team.mjs:661; plugin/skills/teams-uhura/scripts/team.mjs:664; plugin/skills/teams-uhura/scripts/team.mjs:668.
**Recommendation:** Transmit and validate sender/recipient envelopes through the inbound workflow, and report local queue versus confirmed transport separately.
**Evidence and limits:** score 100/100. Complete local write/say/return path; no live channel or remote recipient used. Proof: automation-ticket-evidence.json.

### A191: Make Code-vader selftest failures fail the process

**Failure/impact:** Assertions mutate script-scoped counters; final status reads zero-valued function locals. An intentionally false extracted assertion reports FAIL and scriptFailures1 while local failures0 and exit0. Every assertion can fail without failing this selftest.
**Source:** plugin/skills/code-vader/scripts/code-vader.ps1:297; plugin/skills/code-vader/scripts/code-vader.ps1:299; plugin/skills/code-vader/scripts/code-vader.ps1:409.
**Recommendation:** Use one consistent counter scope and add a harness regression that deliberately fails one assertion and requires nonzero exit.
**Evidence and limits:** score 100/100. Exact counter/function reproduction, not full selftest execution. Proof: automation-boundary-probes.py; automation-report.md.

### A211: Fix shell app-assignment ticket normalization

**Failure/impact:** norm_id writes global ID but emits no stdout. Command substitution runs it in a subshell and assigns empty output to ID; normal assign-app cannot match its requested ticket. Other writers call norm_id directly.
**Source:** plugin/skills/tickets-zordon/scripts/ticket-meta.sh:122; plugin/skills/tickets-zordon/scripts/ticket-meta.sh:683; plugin/skills/tickets-zordon/scripts/ticket-meta.sh:696.
**Recommendation:** Call norm_id directly as other shell writers do, and test shell assign-app through the real CLI.
**Evidence and limits:** score 100/100. Literal shell dataflow; no production board mutation. Proof: automation-report.md.

### A195: Stage exact Git paths and surface failures

**Failure/impact:** Actual porcelain retains Git quotes around a space-containing filename; parseStatus passes them through and stageArgs sends those quotes as literal argv bytes. Isolated real Git rejects the resulting pathspec. Both callers use the same parser.
**Source:** plugin/mods/ops-board/hooks/lib/explorer.ts:97; plugin/mods/ops-board/hooks/lib/explorer.ts:57; plugin/mods/ops-board/hooks/explorertab.tsx:96; plugin/mods/ops-board/ops/explorer.ts:66.
**Recommendation:** Use NUL-delimited porcelain and retain exact raw paths separately from display-safe text; handle rename records without string splitting and display failed staging results.
**Evidence and limits:** score 100/100. Real isolated Git reproduction reviewed; no production index mutation. Proof: parent-explorer-path-probe.json.

### A197: Create real follow-up runs for Push Pending

**Failure/impact:** Push Pending success text claims stages moved into a follow-up run; the only effect queues the existing ID. Backend qr_add_ only resolves and appends that same run. No follow-up or stage migration can result.
**Source:** plugin/mods/ops-board/ops/state.ts:811; plugin/mods/ops-board/hooks/lib/calls.ts:61; plugin/skills/relay-morpheus/hooks/relay-morpheus.sh:944.
**Recommendation:** Implement explicit follow-up creation/migration and mode persistence through a backend contract; derive success text from returned run/stage results and test actual destination state.
**Evidence and limits:** score 100/100. Literal end-to-end call path; no real run/queue mutation. Proof: ops-findings.json.

### A178: Real pending handoff recipient is discarded before band rendering

**Failure/impact:** Producer cleanRecord preserves to, but Ops record reconstructs only ts/from/email/text/id. Shared pendingHandoffOf therefore cannot see a real recipient; native band supplies no recipient either. This is distinct from AUTO-05 outbound delivery.
**Source:** plugin/mods/ops-board/hooks/lib/inbox.ts:39; plugin/mods/ops-board/ops/draw.ts:339; plugin/mods/ops-board/hooks/band.tsx:26; plugin/skills/teams-uhura/scripts/inbox.mjs:82.
**Recommendation:** Define validated recipient/pending handoff schema end-to-end, preserve it through producer/parser/state, pass it into both band/status callers and test actual decoded JSONL plus marker state.
**Evidence and limits:** score 100/100. Actual production parse reproduction recorded by investigator; static producer-to-renderer boundary independently read. Proof: ops-report.md.

### A187: Preserve nginx variables in deploy rendering

**Failure/impact:** Unrestricted envsubst consumes nginx runtime variables, which are not deployment placeholders. Exact rendered template has empty set/if/Host expressions. This is deterministic scaffold breakage independent of real deployment values.
**Source:** plugin/skills/deploy-niyoj/references/templates.md:153; plugin/skills/deploy-niyoj/references/templates.md:175; plugin/skills/deploy-niyoj/references/templates.md:189.
**Recommendation:** Render only named deployment placeholders; preserve nginx variables with an explicit substitution allowlist and validate rendered nginx fixture.
**Evidence and limits:** score 100/100. Actual envsubst output reviewed; nginx service/config was not changed or executed. Proof: integration-nginx-probe.json.

### A210: Validate wizard answer identity before settling

**Failure/impact:** nextWizardSet validates schema only and matches question/option IDs across answer sets. Production CLI passes exported JSON directly; fresh RUN999 unreviewed draft settles RUN1 Q1. Scope impact to generated wizard settled state, not automatic relay application (answersToCommands has separate finalization checks).
**Source:** plugin/skills/holo-r2d2/scripts/wizard.mjs:118; plugin/skills/holo-r2d2/scripts/wizard.mjs:130; plugin/skills/holo-r2d2/scripts/wizard.mjs:193; plugin/skills/holo-r2d2/scripts/holo.mjs:1083.
**Recommendation:** Validate answer set identity, round, finalization, owner approval and question/options against the active set before changing settled state.
**Evidence and limits:** score 95/100. Pure imported production function; no relay answer mutation. Proof: verification-pure-probes.json.

### A185: Keep dispatch timestamps separate from ticket IDs

**Failure/impact:** Permitted benign claim-refusal path reuses $t for ticket iteration after timestamp assignment. PowerShell foreach variables survive in function scope; headers receive final ticket ID rather than date. Only this branch is claimed, not successful claims.
**Source:** plugin/skills/relay-morpheus/hooks/relay-morpheus.ps1:1176; plugin/skills/relay-morpheus/hooks/relay-morpheus.ps1:1190; plugin/skills/relay-morpheus/hooks/relay-morpheus.ps1:1205; plugin/skills/relay-morpheus/hooks/relay-morpheus.ps1:1210.
**Recommendation:** Use a distinct loop variable and immutable dispatch timestamp; exercise successful dispatch with refused claim and no foreign owner, then read status/heartbeat.
**Evidence and limits:** score 95/100. Independent complete branch source review; no real dispatch. Proof: parent-relay-verification.json.

### F151, F152, F153, F154, F155, F156: AI Git workbench does not call AI or resolve conflicts

**Failure/impact:** Native UI explicitly promises AI change digest and autonomous conflict resolution, but drafting/digest/audit are deterministic heuristics and actionGo only runs Git and asks for manual conflict resolution. Accept native promised-AI gap; do not treat standalone read-only action policy as a defect.
**Source:** plugin/mods/ops-board/hooks/lib/explorer.ts:113; plugin/mods/ops-board/hooks/lib/explorer.ts:138; plugin/mods/ops-board/hooks/lib/explorer.ts:153; plugin/mods/ops-board/hooks/explorertab.tsx:201; plugin/mods/ops-board/hooks/explorertab.tsx:252; plugin/mods/ops-board/hooks/explorertab.tsx:255.
**Recommendation:** Connect actual supported AI CLI operations to explicit workbench plans, implement merge-smith conflict flow and streamed process events, and provide the promised actions on supported surfaces. Until then label heuristics truthfully.
**Evidence and limits:** score 95/100. Direct source/caller verification; no live host execution. Proof: ops-ticket-evidence.json.

### A196: Connect Start Run to the Claude session

**Failure/impact:** F113 explicitly requires confirmed prompt submission on the session surface. Native RunsTab only renders existing-run Engage/Diagnose; no start form is in its state/routing. Standalone paste-only behavior is intentional and is not itself a defect.
**Source:** plugin/mods/ops-board/hooks/runstab.tsx:385; plugin/mods/ops-board/types/index.d.ts:149; plugin/mods/ops-board/ops/state.ts:839; plugin/mods/ops-board/ops/tests/state.test.mts:1160.
**Recommendation:** Implement native Start Run runner/mode/ticket form and guarded prompt submission using the canonical command builder; retain the terminal paste-only path as required.
**Evidence and limits:** score 95/100. Direct source/caller verification; no live host execution. Proof: ops-ticket-evidence.json.

### A186: Stop deployment when a required backup fails

**Failure/impact:** Backup failure is explicitly converted to warn, after which build/up --build proceeds. This contradicts the required pre-deploy snapshot guarantee for an existing database. First install without a database may legitimately need a separate branch.
**Source:** plugin/skills/deploy-niyoj/references/templates.md:120; plugin/skills/deploy-niyoj/references/templates.md:135; plugin/skills/deploy-niyoj/SKILL.md:72; plugin/skills/deploy-niyoj/SKILL.md:139.
**Recommendation:** Distinguish first install with no database from an existing database backup failure; fail closed before rebuild when the required backup fails, and test the exact shell template with stub commands.
**Evidence and limits:** score 95/100. Source-proven failure path; no DB loss, migration or remote deployment reproduced. Proof: integration-ticket-evidence.json.

### A190: Keep installer selftests away from real Muse

**Failure/impact:** An explicitly nonexistent override does not inhibit PATH lookup. Selftest exports that nonexistent override, yet the exact extracted function invoked the report-owned Muse stub for list/install. Real profile damage is conditional on inherited Muse environment; it was not executed.
**Source:** plugin/install.sh:380; plugin/install.sh:562.
**Recommendation:** If SKILLATOR_MUSE is set, honor it exclusively and return when unavailable; stub a PATH muse and assert no calls when the override is nonexistent.
**Evidence and limits:** score 95/100. Extracted-function stub reproduction; never run full installer selftest or real Muse. Proof: integration-installer-probes.json.

### A192: Fail reconcile when Git diff enumeration fails

**Failure/impact:** git diff is the left pipeline command; the right group returns success when it reads no rows. Invalid refs therefore yield fatal Git diagnostics plus 0 paths/0 failed and status0, defeating a completeness gate.
**Source:** plugin/skills/merge-smith/references/reconcile.sh:15; plugin/skills/merge-smith/references/reconcile.sh:28.
**Recommendation:** Resolve both refs first, capture and check git diff enumeration status before the loop, propagate all enumeration failures; add missing-ref fixture.
**Evidence and limits:** score 95/100. Read-only invalid-ref reproduction recorded; not a merge operation. Proof: integration-report.md.

### A184: Update heartbeat state under the writer lock

**Failure/impact:** Heartbeat reads state before writer lock; another writer can land x before heartbeat later writes stale~. Shell set_row only replaces landed when nonempty, so the common blank old value preserves new SHA: reject the stronger erased-SHA claim. In-flight/terminal state becomes inconsistent. PowerShell same read-before-DoStage ordering.
**Source:** plugin/skills/relay-morpheus/hooks/relay-morpheus.sh:654; plugin/skills/relay-morpheus/hooks/relay-morpheus.sh:609; plugin/skills/relay-morpheus/hooks/relay-morpheus.sh:630; plugin/skills/relay-morpheus/hooks/relay-morpheus.sh:633; plugin/skills/relay-morpheus/hooks/relay-morpheus.ps1:674.
**Recommendation:** Read and refresh heartbeat under the same mutation lock; update only heartbeat/owner fields without overwriting current state or landed SHA. Add deterministic interleaving fixture.
**Evidence and limits:** score 90/100. Source-proven conditional interleaving; no live/stress scheduling reproduction. Completion SHA loss is not established. Proof: parent-relay-verification.json.

### A183: Keep the winner's lease on duplicate dispatch

**Failure/impact:** Both same-stage dispatches may read pending and take/replace stage lease before run lock. Winner marks in-flight; loser refuses and releases all rows keyed only by run/stage, deleting winner protection. Actual state recheck does not undo the lease cleanup bug. Both ports independently checked.
**Source:** plugin/skills/relay-morpheus/hooks/relay-morpheus.sh:1417; plugin/skills/relay-morpheus/hooks/relay-morpheus.sh:818; plugin/skills/relay-morpheus/hooks/relay-morpheus.sh:1436; plugin/skills/relay-morpheus/hooks/relay-morpheus.sh:112; plugin/skills/relay-morpheus/hooks/relay-morpheus.sh:835; plugin/skills/relay-morpheus/hooks/relay-morpheus.ps1:1115; plugin/skills/relay-morpheus/hooks/relay-morpheus.ps1:1215; plugin/skills/relay-morpheus/hooks/relay-morpheus.ps1:1267.
**Recommendation:** Track unique dispatch-attempt ownership and conditional cleanup, or atomically coordinate lease commit with run transition; race same stage with declared files and assert winner lease remains until landing.
**Evidence and limits:** score 90/100. Source-proven conditional interleaving, no live/stress race. Existing no-files concurrency test does not exercise lease ownership. Proof: parent-relay-verification.json.

### A214: Reject unknown PowerShell setup arguments

**Failure/impact:** PowerShell only checks whether args contains --check and otherwise invokes full setup, with no unknown-argument rejection. Exact extracted mode expression makes --chek choose full walk. Depending on machine state that walk installs devtunnel, opens login and creates tunnel/port before its later Arm confirmation. Shell rejects unknown option with2. Narrow to fail-open mode selection, not unconfirmed live mutation.
**Source:** plugin/skills/teams-uhura/scripts/setup.ps1:11; plugin/skills/teams-uhura/scripts/setup.ps1:77; plugin/skills/teams-uhura/scripts/setup.ps1:90; plugin/skills/teams-uhura/scripts/setup.ps1:100; plugin/skills/teams-uhura/scripts/setup.ps1:143; plugin/skills/teams-uhura/scripts/setup.ps1:250; plugin/skills/teams-uhura/scripts/setup.sh:226.
**Recommendation:** Reject unknown arguments before any setup action.
**Evidence and limits:** score 90/100. Only exact argument expression executed; actual setup/install/login entrypoint never run. Proof: verification-setup-probe.json.


## Medium findings

### A213: Preserve UTF-8 across remote stream chunks

**Failure/impact:** lineSplitter decodes Buffer chunks independently, corrupting a split multibyte UTF8 codepoint. Independent production import yields three replacement characters for euro. ProcAdapter stdout uses this exact decoder, so transport fragmentation changes actual JSON string contents.
**Source:** plugin/skills/remote-cerebro/hooks/cerebro-core.mjs:691; plugin/skills/remote-cerebro/hooks/cerebro-bridge.mjs:339.
**Recommendation:** Keep a streaming UTF-8 StringDecoder/TextDecoder per connection; test every byte split through non-ASCII JSONL, including split delimiter and flush.
**Evidence and limits:** score 100/100. Pure framing probe, no native host; requires split within multibyte sequence, normal transport-permitted condition. Proof: verification-pure-probes.json; automation-cerebro-probe-results.json.

### A204: Preserve lowercase sub-ticket IDs in the viewer

**Failure/impact:** Uppercasing a whole canonical B2a ID yields B2A, then the lowercase-suffix regex fails. Grouping goes to Unrecognised IDs and copied identity is wrong. Canonical subparts are valid inputs, not malformed tickets.
**Source:** plugin/skills/tickets-zordon/board/index.html:561; plugin/skills/tickets-zordon/board/index.html:577; plugin/skills/tickets-zordon/board/index.html:688; plugin/skills/tickets-zordon/SKILL.md:243.
**Recommendation:** Preserve the canonical lowercase sub-ticket suffix; normalize only the alphabetic prefix if normalization is required. Test parse, both grouping modes, and copied IDs with B2a.
**Evidence and limits:** score 100/100. Investigator executed exact extracted parser; browser rendering not required for this data defect. Proof: helpers-findings.json.

### A198: Finish Help document loading and Copy actions

**Failure/impact:** Copy shortcut returns a success toast with effects:[]; reducer has no clipboard mutation. Its test only asserts the toast. The guide is a compiled catalog rather than installed SKILL.md content, additionally missing F127 source-viewer behavior.
**Source:** plugin/mods/ops-board/ops/state.ts:1908; plugin/mods/ops-board/ops/state.ts:1156; plugin/mods/ops-board/ops/tests/state.test.mts:973.
**Recommendation:** Add an explicit clipboard host effect with honest unsupported/failure state; discover installed skills and render selected SKILL.md safely, keeping synopsis separate from source content.
**Evidence and limits:** score 100/100. Direct source/caller verification; no live host execution. Proof: ops-ticket-evidence.json.

### A194: Audit repo instructions and plugin context together

**Failure/impact:** Default root derives plugin from plugin/practice/scripts, omitting root instructions; explicit repo root then misses plugin/skills descriptions. Synthetic oversized root CLAUDE passes default audit and fails explicit-root audit, confirming split-root coverage loss.
**Source:** plugin/practice/scripts/context-audit.sh:17; plugin/practice/scripts/context-audit.sh:32.
**Recommendation:** Resolve repository instruction root separately from plugin/installed payload root; test split clone and installed layouts with oversize root include and oversize skill description.
**Evidence and limits:** score 100/100. Synthetic split layout, not a claim that current instruction length itself violates a limit. Proof: parent-context-layout-probe.json.

### A207: Compare the entire image at nondivisible widths

**Failure/impact:** Floor cell width times cols leaves a rightmost remainder unvisited. Fresh101px fixture differing at98..100 gives layout100 and no regions. Pixel score itself counts all pixels; narrow claim to layout score and region-grid omissions.
**Source:** plugin/skills/clone-odo/scripts/imgdiff.py:344; plugin/skills/clone-odo/scripts/imgdiff.py:360; plugin/skills/clone-odo/scripts/imgdiff.py:367.
**Recommendation:** Derive every grid boundary from proportional column positions or cover the remainder in the last column; test nondivisible widths.
**Evidence and limits:** score 95/100. Fresh in-memory image arrays; no image editing tool or visual screenshot claim. Proof: automation-probes.py; verification-extra-probes.json.

### A208: Fail brand sweeps for uninspected target roots

**Failure/impact:** Nonexistent root produces empty os.walk, render says Clean, and CLI returns0. Fresh production main invocation reproduced it. Missing targets must not certify a preflight scan.
**Source:** plugin/skills/clone-odo/scripts/sweep.py:81; plugin/skills/clone-odo/scripts/sweep.py:128; plugin/skills/clone-odo/scripts/sweep.py:171.
**Recommendation:** Validate root exists/is directory; report walk permission errors as incomplete and nonzero.
**Evidence and limits:** score 95/100. Fresh absent report-local target; no files written by sweep. Proof: automation-probes.py; verification-extra-probes.json.

### A209: Mark only displayed inbox messages as read

**Failure/impact:** frameMessages takes the oldest200 while cmdInbox marks the last of all records. Independent201-record frame verifies body200 absent but marker m200 selected; that unread message becomes consumed without display.
**Source:** plugin/skills/teams-uhura/scripts/team.mjs:557; plugin/skills/teams-uhura/scripts/team.mjs:558; plugin/skills/teams-uhura/scripts/inbox.mjs:163.
**Recommendation:** Advance the marker only to the last displayed record; add a 201-message regression.
**Evidence and limits:** score 95/100. Pure production formatter plus literal caller marker selection; no real inbox mutation. Proof: verification-pure-probes.json.

### A212: Keep app tags in ticket-meta selftest expectations

**Failure/impact:** Both selftests save before-app-assignment bytes, perform successful app assignment, then compare against old bytes and expect later rows without app metadata. PowerShell functioning assign-app therefore necessarily fails these assertions; shell runtime bug currently masks part of the stale-fixture problem.
**Source:** plugin/skills/tickets-zordon/scripts/ticket-meta.ps1:1527; plugin/skills/tickets-zordon/scripts/ticket-meta.ps1:1540; plugin/skills/tickets-zordon/scripts/ticket-meta.ps1:1546; plugin/skills/tickets-zordon/scripts/ticket-meta.sh:1279; plugin/skills/tickets-zordon/scripts/ticket-meta.sh:1291; plugin/skills/tickets-zordon/scripts/ticket-meta.sh:1297.
**Recommendation:** Refresh the expected snapshot after assign-app and retain app tags in all later expected rows, preferably isolate the F136 fixture.
**Evidence and limits:** score 95/100. Source-sequenced expected-value contradiction; no broad selftest rerun. Proof: automation-report.md.

### A199: Show personalized ticket groups in Claude

**Failure/impact:** Native Tickets receives buildModel status-only groups; personalized helper functions are not called by native rendering. Shared implementation does not satisfy the native pane contract.
**Source:** plugin/mods/ops-board/hooks/pane.tsx:68; plugin/mods/ops-board/hooks/register.tsx:593; plugin/mods/ops-board/hooks/lib/ticketsmodel.ts:145; plugin/mods/ops-board/hooks/lib/ticketsmodel.ts:10.
**Recommendation:** Reuse personalized group model in native pane and connect active-member selection, collapse state and reassignment refresh; test through native routing rather than only helper state.
**Evidence and limits:** score 95/100. Direct source/caller verification; no live host execution. Proof: ops-ticket-evidence.json.

### A200: Wire tester assignment in the Claude pane

**Failure/impact:** Native form offers implementation and decision only; confirm maps every non-decision draft to meta-assign. Tester schema/backend support cannot make tester assignment available in this native UI.
**Source:** plugin/mods/ops-board/hooks/assign.tsx:117; plugin/mods/ops-board/hooks/assign.tsx:314; plugin/mods/ops-board/types/index.d.ts:45.
**Recommendation:** Add tester selection and explicit meta-assign-tester routing in native form, preserve owner/decision/state and verify unprivileged tester change through real backend fixture.
**Evidence and limits:** score 95/100. Direct source/caller verification; no live host execution. Proof: ops-ticket-evidence.json.

### A203: Compose backgrounds in accessibility contrast checks

**Failure/impact:** bgOf skips translucent background layers rather than compositing them. For gray100 text over half-black on white it computes5.92 instead of1.488, a pass/fail reversal against its own required alpha-resolution procedure.
**Source:** plugin/skills/a11y-toph/references/checks.md:199; plugin/skills/a11y-toph/references/checks.md:210; plugin/skills/a11y-toph/references/checks.md:216.
**Recommendation:** Composite each translucent layer over its ancestor or mark result unknown for manual/browser verification; add transparent and translucent nested-background fixtures.
**Evidence and limits:** score 95/100. Exact helper with synthetic computed styles; no browser-rendering claim. Proof: integration-contrast-probe.json.

### A188: Verify nginx and TLS before reporting Live

**Failure/impact:** Live is emitted before nginx/TLS, and certbot errors become warn/status0. On first issuance failure this contradicts explicit nonzero-on-failure and HTTPS verification contracts. Existing fresh certs are not the failing input.
**Source:** plugin/skills/deploy-niyoj/references/templates.md:149; plugin/skills/deploy-niyoj/references/templates.md:157; plugin/skills/deploy-niyoj/SKILL.md:139; plugin/skills/deploy-niyoj/SKILL.md:205.
**Recommendation:** Make required TLS success a gate, put final Live after all verification, and test command failure statuses and final-message ordering.
**Evidence and limits:** score 95/100. Literal control-flow verification, no real certificate attempt. Proof: integration-ticket-evidence.json.

### A215: Match setup hosting to the requested tunnel

**Failure/impact:** PowerShell considers any devtunnel process hosted; shell considers any devtunnel host command. Neither checks requested named tunnel. Exact PS function with unrelated process fixture returns true; caller consequently suppresses hosting skillator-teams while presenting that tunnel URL. An existing configured tunnel/port is not evidence of an active host for that tunnel.
**Source:** plugin/skills/teams-uhura/scripts/setup.ps1:38; plugin/skills/teams-uhura/scripts/setup.ps1:144; plugin/skills/teams-uhura/scripts/setup.sh:20; plugin/skills/teams-uhura/scripts/setup.sh:120.
**Recommendation:** Verify exact requested tunnel/port identity before reusing a running host.
**Evidence and limits:** score 95/100. Exact PS function with stub Get-Process; no live process enumeration, tunnel hosting or network test. Shell counterpart source-verified. Proof: verification-setup-probe.json.

### A206: Return exact review excerpts without inserted text

**Failure/impact:** Normal editorial ellipses are not inherently fabricated speech. Here reviews.md explicitly requires every quote be a copied substring and says never shorten; snippet appends dots within the quote value. Fresh production-function probe confirms membership false and test strips dots before checking. Accept only exact-quote contract violation, not fabricated review content.
**Source:** plugin/skills/clone-odo/scripts/reviews.py:138; plugin/skills/clone-odo/scripts/reviews.py:147; plugin/skills/clone-odo/references/reviews.md:28; plugin/skills/clone-odo/scripts/tests/test_reviews.py:76.
**Recommendation:** Return an exact substring with separate truncation metadata, and assert raw quote membership for long reviews.
**Evidence and limits:** score 90/100. Fresh pure function execution; long synthetic review, no external review sourcing. Proof: automation-probes.py; verification-extra-probes.json.

### A205: Keep open children with their archived parent

**Failure/impact:** A blank line clears cur before the indented open child. Group eligibility considers only the old closed parent and archive moves it alone, violating the explicit parent/every-subpart-together rule.
**Source:** plugin/practice/scripts/archive-tickets.sh:100; plugin/practice/scripts/archive-tickets.sh:106; plugin/skills/tickets-zordon/SKILL.md:444.
**Recommendation:** Retain group identity across blank lines when a following indented sub-part or continuation belongs to the parent, or group subparts by their canonical parent ID. Add blank-separated open-child and continuation fixtures.
**Evidence and limits:** score 90/100. Actual isolated old-commit dry-run reproduced; production board/archive untouched. Proof: helpers-findings.json.

### A201: Convert every Gemini pending alias on Windows

**Failure/impact:** Conversion is conditional on the literal pending.toml basename; alias receives the original sh injection. Extracted PowerShell Write-Cmd produces powershell for canonical command and sh for alias. Failure is conditional on Windows setups needing the documented conversion.
**Source:** plugin/install.ps1:287; plugin/install.ps1:293.
**Recommendation:** Apply the conversion by shared pending payload or include every pending alias, and assert installed canonical/alias execution parity.
**Evidence and limits:** score 90/100. Generated contents reproduced; no native Gemini invocation. Proof: integration-installer-probes.json.

### A202: Resolve upstream-watch paths after plugin move

**Failure/impact:** Arming applies the old skills/design-arwen/UPSTREAM.md guard and practice/... commands to the current checkout whose payload is plugin/. The guard skips the watch before its commands can run.
**Source:** plugin/skills/grayskull-power/references/arming.md:129; plugin/skills/grayskull-power/references/arming.md:132; plugin/skills/design-arwen/UPSTREAM.md:1.
**Recommendation:** Resolve the plugin payload root once from the loaded skill, use it for manifest detection and commands, and add moved-checkout/installed-layout fixtures.
**Evidence and limits:** score 90/100. Current checkout layout verified; no upstream network watch run. Proof: integration-report.md.

### A189: Parse Antigravity quota windows independently

**Failure/impact:** The line-oriented parser picks the first remaining_fraction and applies it to each window label found anywhere on that line. Compact JSON containing both buckets produces identical20/20 rather than20/90. Accept parser corruption for such valid structured input, not a claim about verified current live Antigravity payload shape.
**Source:** plugin/skills/watch-cortana/hooks/usage-watch.sh:330; plugin/skills/watch-cortana/hooks/usage-watch.sh:332; plugin/skills/watch-cortana/hooks/usage-watch.sh:338.
**Recommendation:** Parse the keyed JSON buckets independently and preserve absent/unknown windows; test actual producer responses in both ports.
**Evidence and limits:** score 85/100. Exact awk synthetic producer-format probe; native quota source not invoked. Proof: automation-boundary-probes.py; automation-report.md.

### A193: Reject failed PowerShell review packages

**Failure/impact:** Existing noncommit object passes rev-parse --verify; diff/log native exit statuses are not checked. Actual blob fixture emitted Git usage errors but created a review packet and returned0. Narrow to failed review evidence generation; do not imply ordinary valid commit diffs fail.
**Source:** plugin/practice/scripts/taskwork.ps1:79; plugin/practice/scripts/taskwork.ps1:89; plugin/practice/scripts/taskwork.ps1:96; plugin/practice/scripts/taskwork.ps1:99.
**Recommendation:** Resolve and validate commit refs once (^{commit}), check every Git exit, write packet atomically only on complete success, remove partial output on error; test badrefs/noncommit refs and injected git failure in both ports.
**Evidence and limits:** score 85/100. Actual isolated packet output and status reviewed; unusual noncommit input, practical impact is fail-open review handoff. Proof: parent-taskwork-ref-probe.json.

## Priority and remaining decisions

Start with cancellation/lease integrity, deployment backup/render/success gates, quota-window accuracy and honest validation outcomes (A182-A194). Address user-facing Messages launch and Explorer wiring next (B21/F98a and F151-F156), or reprioritize those first if the owner chooses. Same-file fixes should be sequenced together; no broad repair is authorized by this audit alone.

AI host/delegate integration and merge-resolution execution need a concrete design before implementation. Interactive login should launch a user-controlled terminal/browser after an explicit action, not collect credentials in the board or silently arm a tunnel. These are implementation decisions, not claimed completed capabilities.

B15/B17 retain their existing live-reproduction blockers. Existing testing rows remain testing; no mock success or code-presence judgment was used to flip them to verified. Seven prior additions F144-F150 remain pending improvements rather than a substitute for completing existing user-facing contracts.

## Preserved historical casefile

The following is the previous casefile, retained verbatim as history. Its dates, source snapshot and old verdicts are not the current audit result.

---
# CASEFILE — 2026-09-04

> **Skill names updated 2026-09-22.** Every skill in this repo was renamed
> purpose-first (`docs/plans/PLAN-rename.md`). The findings below are unchanged
> in substance; only the skill names and paths in them were rewritten, so their
> `file:line` citations still resolve. Where a finding quotes a run verbatim,
> the quote is left exactly as it was said. The old names are in the mapping
> table in that plan.

Scene: skillator at `6bea753` (v3.6.0), 31 changed files, 2,489 insertions.
Read: `PRACTICE.md`, `practice/**`, `PLATFORMS.md`, `WORKFLOW.md`, `README.md`,
`install.sh`, `install.ps1`, `.skillator/grayskull.md`, all 18 `skills/*/SKILL.md`,
`skills/watch-cortana/hooks/**`, `skills/skill-smith/**`, and the installed
`codex.exe` (0.153.2) on this machine.

Not read: most `skills/*/references/**` (design-arwen's seven, deploy-niyoj's
templates, handoff's template); `.claude-plugin/*`; prime-agent and Antigravity
behaviour, which could not be exercised offline.

Five investigators returned **66 raw findings. 19 survived verification; 47 were
discarded or merged.** Judge the rest by how readily those went.

Every finding below was re-opened at its cited line by the detective, not taken
on an investigator's word.

---

## Critical

- **C1** `PLATFORMS.md:47`, `skills/watch-cortana/SKILL.md:100` — **Codex has a
  `Stop` hook. This release is built on the claim that it does not.**
  The installed `codex.exe` 0.153.2 carries the packed hook enum
  `…UserPromptSubmit · SubagentStart · SubagentStop · Stop`, handler types
  `command` / `prompt` / `agent`, an `additionalContext` output field, and
  `hooks.json`. Both documents state Codex's hooks are only
  `PreToolUse`/`PostToolUse`/`PermissionRequest`/`SessionEnd` and that it has no
  turn-end hook that can inject — which is the entire justification for giving
  Codex the agent-driven `check` fallback instead of the automatic gate Claude
  Code gets.
  *Cause, stated plainly:* this was sourced from a blog post while the binary sat
  on disk. It is a capital mistake to theorise before one has data.
  *Fix:* verify whether Codex's `Stop` can return a blocking/`additionalContext`
  payload, then wire the gate properly and correct both tables. Until then, both
  documents must say the claim is unverified rather than assert the negative.

## High

- **H1** `install.sh:28`, `install.ps1:18` — **Codex skills are installed to a
  directory this Codex does not read.** The binary references
  `${CODEX_HOME:-$HOME/.codex}/skills` and `.codex/skills`; it contains no
  `.agents/skills` string at all. `~/.codex/skills/` exists and already holds
  skillator skills. The installers write to `~/.agents/skills/`.
  *Fix:* target `${CODEX_HOME:-$HOME/.codex}/skills`, keeping `~/.agents/skills`
  only if an older Codex is still supported — and say which.

- **H2** `skills/watch-cortana/hooks/usage-watch.ps1:67` ↔ `usage-watch.sh:44` —
  **A BOM makes the threshold comparison fire at any usage, and burns the
  one-shot marker.** PowerShell 5.1 `Set-Content -Encoding utf8` writes
  `EF BB BF 31 32 2E 30` (verified by byte dump). The sh reader does
  `awk -v a="$pct" -v b=97 'BEGIN{print (a>=b)}'`; with the BOM, `a` is
  non-numeric, awk string-compares, and `0xEF > '9'`. Verified: BOM'd `12.0`
  against `97` returns `1`; plain `12.0` returns `0`. On any machine where the
  `.ps1` probe writes and Git Bash reads the shared `~/.claude/watch-cortana`,
  the handoff fires at 12% and writes `.done` — so the real handoff at 97%
  never comes. The skill exists to prevent exactly that loss.
  *Fix:* write the flag with `[IO.File]::WriteAllText` (no BOM), and strip a
  leading BOM defensively in the sh reader. ~4 lines, one selftest case.

- **H3** `install.sh:66-72`, `install.ps1:76-81` — **The normal update path never
  refreshes the shared documents.** `if [ "$n" = 0 ]` prints "all skills already
  installed" and skips the doc copy. A plain `./install.sh` after a `git pull`
  therefore leaves `PRACTICE.md`, `WORKFLOW.md` and `practice/` stale forever;
  only `--force` (which reinstalls every skill) refreshes them. Confirmed on
  disk: `~/.agents/skills/` has `PLATFORMS.md` and `WORKFLOW.md` but **no
  `PRACTICE.md`**, while every build skill now says "read `PRACTICE.md` at the
  plugin root".
  *Fix:* copy the docs unconditionally, outside the `n = 0` branch.

- **H4** `skills/grayskull-power/SKILL.md:48,50` — **`../../PRACTICE.md` and
  `../../PLATFORMS.md` point outside the install root on every non-Claude host.**
  Skills land at `<dest>/<name>/SKILL.md`, the docs at `<dest>/PRACTICE.md`, so
  the correct depth is `../`. `../../` resolves to `~/.cursor/`, `~/.agents/`,
  `~/.gemini/config/`, `~/.pi/`. `PLATFORMS.md:8` then instructs the agent to
  "assume the claude-code row" — on Codex. This is the router's very first step.
  Same defect at `skills/build-vision/references/platforms.md:5`
  (`../../../`, should be `../../`).
  *Fix:* correct the depths, or name the file without a path and let the agent
  search. One line each.

- **H5** `install.sh:1`, `practice/scripts/*.sh`, `usage-watch.sh` — **Every
  shipped `.sh` is committed mode `100644`.** `git ls-files -s` confirms. On any
  Linux/macOS clone the documented `./install.sh` fails with "Permission denied"
  before doing anything.
  *Fix:* `git update-index --chmod=+x` on all four.

- **H6** `skills/watch-cortana/hooks/selftest.ps1:27` — **The selftest runs
  against the user's live state and can consume a real session's handoff.**
  The `check` assertion invokes `usage-watch.ps1 -Mode check` for real, against
  `~/.codex/sessions` and `~/.claude/watch-cortana`; `check` writes a genuine
  `<key>.done` when it fires. Run the selftest while a live session is over
  threshold and that session's one-shot handoff is spent on a test. The test is
  also non-deterministic — its result depends on whatever is on disk.
  *Fix:* point `check` at a temp `HOME` (or a fixture directory) for the test.

- **H7** `practice/prompts.md:44` vs `:85-87` — **The implementer is told to obey
  a design it is never given.** The template supplies `[BRIEF_FILE]` only, and
  `taskwork.sh brief` cuts that to the single `### Task N` block — then the same
  prompt says "Follow the file structure the design defines" and "a file growing
  past the design's intent → stop". `PRACTICE.md:202` promises the agent gets
  "the design file path". `[DESIGN_FILE]` appears only in templates 4 and 5.
  *Fix:* add a `[DESIGN_FILE]` slot to template 1.

- **H8** `practice/prompts.md:176`, `practice/task-loop.md:130` —
  **`[GLOBAL_CONSTRAINTS]` has no source.** The string appears exactly twice in
  the repo, in the two places that consume it. No design contract defines a
  constraints field. The controller must invent it or leave it blank.
  *Fix:* add `CONSTRAINTS:` to the design contract in all three
  `the build-* skills`, or delete the slot.

- **H9** `practice/task-loop.md:64` — **"PLATFORMS.md maps these tiers to each
  host's actual slugs" is false.** task-loop uses `cheapest`, `cheap`,
  `standard`, `most capable`, `cheap-to-mid`, `mid-tier`; PLATFORMS.md defines
  `deep`, `build`, `cheap`, `orchestrator`. Three of seven seats map to nothing,
  while `:43` demands the model always be named explicitly.
  `practice/prompts.md:38` compounds it by citing "PRACTICE.md §4 Model
  selection", a heading that lives in task-loop.md.
  *Fix:* one vocabulary. Add the missing rows to PLATFORMS.md, or restate
  task-loop's table in PLATFORMS' four tiers.

- **H10** `skills/build-ultron/SKILL.md:65,91` — **`build-ultron` orders the
  design pasted verbatim; the canon it declares it follows forbids exactly
  that.** "given the design **verbatim**" and "**Pass the design verbatim** from
  plan to build" against `PRACTICE.md:202` ("the design file path — never the
  session history"), `practice/task-loop.md:85` and `practice/prompts.md:24`.
  `build-ultron` also writes no design file, so the task loop and every prompt template
  — all of which need a `<DESIGN_FILE>` — cannot run under it, while
  `grayskull-power:170` claims `the build-* skills` "runs PRACTICE §§1-6".
  *Fix:* `build-ultron`/`build-jarvis` write a design file and pass its path, or drop the claim
  that they run the canon.

- **H11** `.skillator/grayskull.md:11` vs `practice/prompts.md:63,75` —
  **The always-on layer orders every commit through a subagent fan-out that the
  committing agent is forbidden to spawn.** `CLAUDE.md` imports the activation
  file, so every subagent in an activated repo reads "run `audit-sherlock` over
  the staged diff before every commit". `audit-sherlock` is a Fable fan-out. The
  implementer template says "4. Commit." and "Never spawn a subagent for part of
  it". Compounding: `audit-sherlock:21` itself says `/code-review` is the cheaper
  tool for a working diff, and `grayskull-power:192` routes diffs there.
  *Fix:* the standing rule should name `/code-review` for a staged diff and
  reserve sherlock for the pre-release sweep.

## Medium

- **M1** `skills/tickets-zordon/SKILL.md:173-180` — dispatches carry
  `label`/`phase`/`schema` and no `model`, against `PRACTICE.md:209` ("always
  name it explicitly — an omitted model inherits the session's, usually the most
  expensive"). "Work the board" runs every fix and verify agent on Opus.
- **M2** `PRACTICE.md:353` vs `practice/task-loop.md:150` — the three-fix rule
  says stop and question the architecture before a fourth attempt; the task loop
  runs five rounds and asks only if every path is a guess. Both are labelled the
  law for the same moment.
- **M3** `PRACTICE.md:224-234` (9 rows) vs `practice/tdd.md:99-111` (11 rows) —
  the TDD rationalization tables have already drifted, and the wording differs on
  shared rows. `PRACTICE.md:33` routes the reader to tdd.md for "the excuse
  table" while carrying a shorter one itself.
- **M4** `practice/prompts.md:447` — the design-reviewer template is an orphan
  (referenced only by its own index line) and contradicts `PRACTICE.md:168`,
  which says the design self-review is run inline, "not a subagent".
- **M5** `skills/deploy-niyoj/SKILL.md:217` — "**Merge and push to `main`.**" as
  an imperative step, against `PRACTICE.md:401` and `PLATFORMS.md:93` ("push and
  merge stay user-confirmed on every host"). Sibling `deploy-merlin:98` gets this
  right with an explicit "**Do NOT** `git push`".
- **M6** `skills/screenshot-argus/SKILL.md:24-28` — "ask the user for the path
  once, then write it:" is followed by a fenced block containing one real foreign
  absolute path, `C:\tools\Aewa-Airbender-aewag2\test_screenshots`. Read
  literally, that is the value to write.
- **M7** all 18 `skills/*/SKILL.md` — every description exceeds the ~80-word
  budget `skills/skill-smith/SKILL.md:231` sets (grayskull-power 233,
  tickets-zordon 198, audit-sherlock 197 … handoff 93, the smallest), and most
  summarize their workflow, which `:68` forbids as the shortcut agents take
  instead of reading the body. `tickets-zordon:13` is the sharpest case: its
  summary says "pending/in-progress/done" while the body defines six states, so
  an agent taking the shortcut runs a three-state board.

---

## Architectural proposals — your call, not tickets

- **X1 — Workflow mode sheds most of PRACTICE.** `WORKFLOW.md:143-178` has
  phases Design/Build/Verify/Rework and a task schema of
  `{id, summary, files, complexity}`. There is no task-reviewer seat, no final
  whole-branch reviewer, and no `PRACTICE.md` handed to the design agent — so the
  §2 task contract, §4 per-task review and §6 whole-branch review all vanish.
  Workflow mode is mandated at 4+ tasks, which means **the larger the build, the
  less of the canon applies.** Options: (a) leave it, and say so in WORKFLOW.md;
  (b) add reviewer phases to the script template; (c) make workflow mode a
  fan-out *inside* the task loop rather than a replacement for it.

- **X2 — The description law and the corpus cannot both be right.**
  `skill-smith` says descriptions carry triggers only, under ~80 words. All 18
  skills here summarize their workflow at 93–233 words, and the router is
  explicitly pointed at skill-smith when "a skill isn't triggering". Options:
  (a) rewrite all 18 descriptions to the law; (b) soften the law to "no workflow
  summary, length as needed for keyword coverage" and keep the corpus; (c) hold
  the law only for new skills and record the corpus as legacy debt.
  Note this is the second time this release a rule inherited from superpowers
  failed against the actual repo — the word-budget table was already rewritten
  for the same reason.

## 2026-10-27 — RUN-0023 final diff review

Scope: source diff5a3c637..b7b2451 and affected callers; three read-only deep investigators covering UI/errors/tests/history, automation/config/contracts/conventions/architecture, and Git/Python boundaries/data/dependencies. Not a claim to have audited unchanged whole-app internals. No live native UI, old2.1.310 host or new paid baselines exercised. B15 and A160 remain known separately.

Five symptoms deduplicated into four verified tickets (confidence90–100); two tentative suspicions discarded (unconditional child ticket-start prompt precedence, push followTags behavior) for insufficient supported failure evidence. No critical/high finding.

- **A161 — P2,100:** `plugin/mods/ops-board/hooks/lib/ticketsmodel.ts:90`, `hooks/pane.tsx:164`, `hooks/register.tsx:584`: expanded raw text taller than list budget is omitted wholesale; host wheel/PageDown does not advance selection-based virtualization because scroll.offset is discarded. Executed actual model yields16raw rows excluded at40cols/14rows; thirtyticketsleave26unreachable bywheel. Preserve fixed chrome and keyboard selection while allowing all detail/rows to be reached. One UI defect cluster, not two tickets. — fixed 024351a
- **A162 — P2,97:** `plugin/skills/relay-morpheus/references/marathon.md:284,333,381`: old plan without mode is refused and sent to planner, which skips its tickets as already planned and cannot recover. Provide explicit legacy replacement without weakening valid-plan duplicate guards across hosts. — fixed ba58785
- **A163 — P3,100:** `plugin/mods/ops-board/ops/ops.sh:26`, `plugin/install.sh:928`: accepted09 remains raw in JSON, yielding invalid size09; PS mirrors cast toint. Exact shell validation/substitution plus JSON.parse reproduced failure. Canonicalize decimal validated/preserved values and test both paths. — fixed 62673a1
- **A164 — P2,100:** `plugin/mods/ops-board/hooks/explorertab.tsx:130` via sharedBRANCH_ARGS: fresh Git repository branch query exits128 and blocks Fetch although Gitfetch succeeds. Root scratch `.skillator/reports/final-unborn-proof`: rev-parse --abbrev-ref HEAD128; local fetch--prune0; branch--show-current0. Preserve detached and destructive-action guards. — fixed 0557ec8

No architectural rewrite proposed. Final-stage corrections remain inside requested run behavior. Each fix is test-first in an isolated worktree, then independently reviewed; final172 still in progress, B15 visibly blocked, no push/profile writes.
Final-review corrections A161–A164 are independently reviewed and integrated in RUN-0023 at4139f6a. F115 alphabet actions committedf02ad36 with403plugin/165standalone tests and116mounted-tree frames. Additional requested F116 guarded status/holo feature committed f3c71d9 after held deep LAND, both full writer suites, 420 plugin tests and 165 standalone tests. B15/B17 physical-session reports remain unverified and visibly blocked; this audit does not claim those bugs fixed. Final shared installer validation and release metadata remain pending.
