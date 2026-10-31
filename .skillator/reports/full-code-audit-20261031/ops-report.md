# Ops full source and ticket audit

Snapshot `8b92f76657a67c2e580e27098a02585e868bc3fa`. **100/100 assigned canonical files fully examined; 78/78 assigned requirements individually assessed.** Source, direct callers, schemas/configuration, error/security/concurrency paths and complete test bodies were read. CodeGraph preceded source discovery. Oversized output was reread in bounded chunks; no substring-only coverage is claimed.

Verdicts: {'present': 59, 'cancelled': 2, 'partial': 17}. These are implementation assessments, not changes to board status or claims that owner acceptance passed. Nine concrete Ops findings are recorded in `ops-findings.json`; automation/integration findings remain owned by those investigators to avoid duplication.

## Findings

- **OPS-01 (high) — AI Git workbench does not call AI or resolve conflicts**: User asks Explorer to draft a commit, digest incoming changes, guard push or merge conflicts. The helpers use filename/subject heuristics only; conflictAi is a boolean with no executor. Native actionGo runs buffered Git and tells the user to resolve conflicts manually; shared standalone has no these action dispatchers.
- **OPS-02 (high) — Working-tree filenames with spaces cannot be staged**: Actual git status --porcelain=v1 -uall returns ?? "space name.txt". parseStatus retains the quotes and stageArgs passes them as literal filename bytes. git add exits 128 pathspec failure. Native and shared staging refresh without surfacing the result.
- **OPS-03 (high) — Start Run is missing from the Claude Workflows pane**: Open native Claude Workflows to start pending-subagent or marathon-run. The view offers only existing-run Engage/Diagnose. The new form exists in standalone state and confirmation emits a Paste command with zero effects, so the requested Claude prompt dispatch never occurs.
- **OPS-04 (high) — Push Pending reports a follow-up run without creating one**: With unfinished stages, Push Pending counts them, queues the same run ID and toasts that stages were pushed to a follow-up run. queue-run add only appends the existing run to queue; no stage migration/new run occurs. Rerun uses the same mechanism, and Mode is only local form default.
- **OPS-05 (medium) — Help Copy reports success without copying and guide omits installed content**: Choose a skill and press c: reducer returns a copied toast and no effect, so clipboard is unchanged. Help content is a compiled static catalog rather than loading that installation SKILL.md; native pane has no guide route.
- **OPS-06 (medium) — Personalized Assigned and Decide sections absent from native Tickets**: Native Claude user expects personalized Assigned/Decide sections after selecting a team member. Native Tickets renders only status groups; helper/shared reducer implementation is never integrated into this surface.
- **OPS-07 (high) — Real pending handoff recipient is discarded before band rendering**: Inbox JSONL contains valid pending handoff with to:@vidul. record reconstructs Msg without to. Shared pendingHandoffOf reads a field no record retains, while native band/status callers pass no handoff argument. Neither real path produces requested recipient suffix.
- **OPS-08 (high) — Messages still auto-opens setup and cannot launch interactive login wizard**: Enter Messages without saved token: setup opens automatically, contrary current user request. Choose first-time setup: only --check executes, leaving signed-out users unable to launch login/full wizard from Claude.
- **OPS-09 (medium) — Native assignment form cannot assign a tester**: Claude pane user attempts tester assignment. Native form offers only implementation and decision; executor maps every non-decision kind to ordinary assign, despite AssignDraft accepting tester and backend exposing assign-tester.

## Architecture and boundaries

Two user interfaces share parsing/model helpers but have different interaction implementations: native Claude hooks/pane/register and shared standalone state/draw/engine with Pi/Antigravity adapters. This split explains repeated completion gaps: newer Start Run, Help, personalized groups and tester flows were added to the shared reducer without equivalent native callers. The Git AI and handoff failures are deeper than surface parity: helpers or test-injected state exist without the necessary real producer/executor path.

Backend mutations remain delegated through the script call table. Trusted installation-root and absolute executable resolution, same-stat forced refresh, commonGit inbox resolution, bounded histories/output, and late-completion shutdown protection are substantive strengths. Restore tests cover ownership uncertainty and readback-before-removal. Git action planning guards dirty/in-progress state and pins push refspecs, but newly added working-tree status parsing does not preserve raw filename identity.

Read-only state, config/package metadata and all test harnesses were checked. Native tsconfig excludes shared ops files; native type-check success alone cannot establish full-runtime correctness. The Cursor ledger recorder has no production caller (CodeGraph and tracked-code search), passed to the automation owner of F119. A165 viewport assertions check bounds but do not prove every action remains visible/clickable at every width.

## Validation and limits

This investigator executed one narrow canonical Node parser probe: a valid inbox message with recipient `@vidul` returns only ts/from/email/text/id. No service or account was contacted. The controller independently reproduced quoted-space filename staging failure using actual Git and saved `parent-explorer-path-probe.json`; that result is cited rather than duplicated.

All covering test files were read completely. Test references identify specific assertions and whether they call real local tools, replace backend processes, inject state or merely assert text. Existing tests frequently protect the incomplete behavior: Start Run asserts no effects, Copy asserts a success toast, Push Pending asserts queue-add, handoff tests inject recipient outside the decoder, and Messages expects auto-open/check-only. No broad installer, native paid-host suite, live Teams login, remote Git operation, production write, board edit or global installation was run. Controller owns separate dynamic suite results.

Open owner/live requirements are retained, especially B15 missing live agents, B17 dead native reconcile actions, Antigravity native input and actual Teams tunnel roundtrip. Cancelled B7 and dummy F74 carry no repair obligation. F87 Ruling persistence is an explicitly unresolved backend boundary unless automation later supplies evidence; no unverified absence is elevated to a finding. A160 has all three requested mock topology assertions but is not claimed to prove arbitrary Git histories.

The active installed Codex-bodish state differs from canonical source; canonical implementation verdicts do not claim currently installed behavior. Current user direction that Messages must not auto-open and needs explicit full setup/login is applied independently of older tests.

## Artifacts

- `ops-ticket-evidence.json`: every snapshot key, full original requirement, concise acceptance, implementation, exact source/test references, verdict and limits.
- `ops-file-coverage.json`: all 100 paths, SHA-256, line count and individualized implementation/test review notes.
- `ops-findings.json`: nine proven defects with trigger, affected behavior, references, severity and concrete recommendation.
- `build-ops-evidence.py`: reproducible serialization of the individually authored audit assessments.
