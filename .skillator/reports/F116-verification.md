# F116 verification receipts

Source: RUN-0023 worktree, HEAD 4139f6a plus 18 explicitly staged F116 files. CASEFILE is unrelated and excluded. No commit by builder.

- `F116-check.py` records the exact argv/cwd in each `F116-<name>.command`, stdout/stderr separately, and the child exit in `.exit`. Full writer twins run sequentially in their existing isolated selftest fixtures.
- Guarded native checks: `node .skillator/reports/F116-writer-checks.mjs` ran 78 checks, sh and PowerShell, exit 0. Covers source exclusions, malformed args/reasons, stale metadata, duplicate/missing IDs, owner/lead/unknown identity, unowned, existing session preservation, duplicate managed-note removal, unchanged HEAD/index/bytes on refusal/no-op, foreign lock preservation, stale change while waiting on the lock, LF/CRLF, BOM on the heading, missing final newline, Unicode and loose separator spacing. It does not add support for a BOM immediately before the first ticket.
- Exact host boundary: `node .skillator/reports/F116-native-host.mjs` transpiles the staged calls.ts with cached TypeScript, imports its actual argvFor, then launches native sh and System32 PowerShell. Snapshot and single reason preserve double/single quotes, backticks, literal $(), Unicode and C:\new\test. No side-effect marker. Exit 0; no opaque transport was needed.
- Real holo CLI: `node .skillator/reports/F116-holo-checks.mjs`, exit 0. Every ticket component, both complete matching runs, F91/F910 boundary, no-run case, duplicate refusal, hostile HTML escaping, unchanged board/run bytes + HEAD + staged sentinel, and ignored generated output.
- Latest complete plugin run: 419 tests, 413 passed and 6 timed out at the existing 5000ms deadline. All 14 F116 mounted tests passed, including two Apply presses before completion => one writer and one forced board read; error unlocks form; Esc/reopen survives an old completion; help also claims once.
- Those 6 inherited timing failures were isolated without editing source, assertions or deadlines: exact report-only copies of alphabet.test.tsx (4/4, 1.85-2.75s per screen sweep) and band.test.tsx (33/33). Receipts: F116-isolated-alphabet.*, F116-isolated-band.*. The full run remains recorded as exit 1; isolation does not relabel that run.
- Development failures retained: initial missing status RED in both twins; shell stopped after new failure, PowerShell full RED exit 1. Initial plugin hook scan rejected an arrow helper taking $, changed to a function declaration. Rapid Apply initially exposed SDK update callback retry flags, corrected by resetting the claim inside every retry. The PowerShell note helper needs ID plus reason, now passed correctly.
- SDK has no disabled Button prop. Busy controls render non-action text and the shared in-flight atom remains the final event guard. Expected snapshots never refresh silently after refusal.
- F116-frames.jsonl: 141 mounted primitive trees, including all 40/60/80/120 alphabet contexts plus status input/actions/refusal/help/cancel/busy. These are rendered/mounted evidence, not physical terminal paint or keyboard delivery.
- Design page: current full plan generated into ignored .skillator/holo/RUN-0023.html, 19 run stages and 14 design sections; F116-design-page exit 0.

Not checked: physical emulator/font/codepage/raw keyboard/mouse delivery. B15/B17 remain owner-live unresolved issues and are not closed by this feature.

## Held-review correction evidence

- P1: PowerShell case-sensitive linguistic equality admitted composed/decomposed Unicode changes. New guarded snapshot and no-op comparisons now use StringComparison.Ordinal; new target dispatch also uses ordinal comparisons. Native F116-ordinal-check.mjs exit 0 proves stale refusal with unchanged bytes/HEAD/index and distinguishes changed reason normalization from no-op. An embedded PS selftest retains the stale Unicode regression.
- P2: Success previously checked a generation then called unconditional cancel. Success now performs only a generation-conditional atom clear; the callback remains safe when SDK ifVersion causes retry. It does not reset focus or reopen the pane from an old async completion. Actual SDK interception writes a replacement at the clear boundary, then retries the old version: the replacement and unsent reason survive, with no ui.open. F116-isolated-status: 15/0, including earlier one-writer/one-refresh and double-help tests.
- The shell full suite continued on unchanged shell source during these fixes. Queued PS had not started before its corrected source and embedded regression were staged.

## Final builder checks

Full sh selftest exit 0 (`ok`); corrected full PowerShell selftest exit 0 (`ok`, expected legacy unknown-lead diagnostic only); holo selftest exit 0; actual SDK TypeScript exit 0; plugin validation child exit 0; standalone ops 165 passed / 0 failed, exit 0. All named exact command/raw output/exit receipts are persisted. The validation receipt wrapper encountered CP1252 only while printing the already-saved successful output; no child failure and no rerun. Its console output encoding is now explicit UTF-8.

Held review accepted the two focused corrections conditional on final checks. Controller owns the separate complete sequential plugin-file verification. No builder processes remain active and no commit was made.

## Complete plugin proof

Controller ran all 21 original plugin test files sequentially against a frozen identical-source copy, without assertion or timeout changes: 420 passed / 0 failed, process exit 0. F116-sequential-results.json and F116-sequential-source.json record identical source hashes before/after and frozen-copy equality. Each F116-sequential-N command/stdout/stderr/exit receipt is retained. This replaces the need for another concurrent full-run attempt; the earlier 6 contention timeouts remain recorded honestly. Controller authorized the reviewed 18-file scoped commit after all checks settled.

## Commit and index handoff

Controller-authorized reviewed commit: f3c71d987fc696509b1a660a02be689654ead499, exactly 18 scoped files. CASEFILE remains the only unstaged tracked change at feature handoff. Main CodeGraph sync refused the existing live PID 15216 lock; no unlock/removal attempted. F116-codegraph.log/.exit preserve the refusal, and the controller explicitly owns retry after release prep.
