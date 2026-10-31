# Allocation, archive, freshness and board helper audit

Snapshot: HEAD 8b92f76657a67c2e580e27098a02585e868bc3fa. Production, board, Git configuration, installations and accounts were not changed by this investigator. Only the four requested helpers audit artifacts were written in the repository. Focused test fixtures used temporary directories and local bare Git remotes; no real upstream push, coding host, authorization flow, or message send occurred.

## Coverage

Read every line of the ten transferred files plus `plugin/practice/baselines/fixture-tickets-monorepo.sh`: 11 files, including inline selftests, CSS, frozen sample payload and executable browser logic. `helpers-file-coverage.json` records actual byte hashes, line counts and per-file observations. Canonical tickets-zordon skill text was reviewed as executable-agent instructions, not treated as evidence that a native host obeyed them.

CodeGraph was tried first because the repository is indexed. Its broad filename query returned mostly unrelated symbol references and omitted the shell helpers; the audit therefore used direct line-numbered source reads and Git searches (rg is unavailable). Direct caller slices inspected: relay allocator wrappers and stale-board guard/commit calls in both ports; ticket-meta freshness/commit wrappers in both ports; renumber archive/allocator boundary; validate checker registration and Windows POSIX environment normalization; grayskull arming and archive command instructions; F43/F45 scenario consumers of the monorepo fixture. Those caller slices are boundary coverage, not a claim to have read those large callers entirely.

Nineteen per-ticket support entries are in `helpers-ticket-support.json`, transferred to integration and automation investigators. Each distinguishes present code, partial clauses, freshly executed checks and remaining uncertainty. Primary ticket verdict ownership stays with those investigators.

## Verified findings

**HELP-01, P2: rich viewer corrupts sub-ticket IDs.** `index.html:561` uppercases the complete ID, turning the canonical `B2a` into `B2A`; `:577` then fails its lowercase-suffix regexp. Exact current-source parser execution in Node vm returned `id=B2A,prefix=?,num=0,parent=null` for a normal two-space sub-ticket. The grouping at `:688-701` therefore files it under Unrecognised IDs, the status view cannot label its parent, and copy-out at `:796-805` emits the wrong immutable ID. Preserve the lowercase suffix and test both views plus copied IDs. This is separate from A180 historical alias omission.

**HELP-02, P2: blank line separates an open child from the archival guard.** `archive-tickets.sh:100-101` clears `cur` on blank lines. A closed parent followed by a blank and an indented open child therefore passes the group closure gate at `:106-108`; the child never participates. In a fresh temporary Git repository with a 2026-01-01 commit containing closed F1 / blank / open F1a, the actual `--dry-run` exited 0 and proposed moving F1 alone. This contradicts tickets-zordon `:441-446`, which requires the parent and every sub-part to remain together until all are closed and old enough. Preserve group identity across blank-separated nested content or associate children by canonical ID, with regression cases for open children and continuation text.

No source fix or ticket addition was performed by this investigator. Findings are recorded with exact inputs, outputs, source refs, confidence, related contracts and narrow recommendations in `helpers-findings.json`.

## Fresh checks

| Check | Result | Scope |
|---|---|---|
| artifact.mjs --selftest | PASS | Parser, eight-state counts, escaping, all parsed rows rendered, archive marks, tags and session forms |
| archive-tickets.sh --selftest | PASS | Flip date, reopened/reclosed, parent parts without blank separation, continuation, uncommitted close, open ?/% retention, append/no duplicate sections, invalid board refusal |
| check-tickets.sh --selftest | PASS with POSIX PATH | Board/archive duplicates and conflicts, bare plans, Git-root cwd resolution, title warnings and session forms |
| next-id.ps1 -Selftest | PASS | Shared worktree counters, refs/archive maxima, peek/flags/missing board, RUN/S/W, range exhaustion, local-bare upstream tip fetch, held-open lock release |
| board-fresh.ps1 -Selftest | PASS | Local-bare upstream, fresh silence, clean and board-only ff, stamp interval, conflict/local commit/foreign dirt refusals, writer reports, offline, fetch-only, no upstream/no Git |
| Exact index parser subpart fixture | FAIL reproduced | HELP-01, no browser needed for parser/data failure |
| Actual archive blank-child fixture | FAIL reproduced | HELP-02, isolated old Git commit, dry-run only |
| next-id.sh and board-fresh.sh selftests | Environment blocked | Both tried creating common-dir state beneath C:/Users/Ikran temp path; mkdir reported permission denied. Shell parity is not certified by this run. |

The first checker invocation found Windows `sort` on PATH, causing a CR in the duplicate-report assertion. Re-running with Git POSIX utilities first passed. The repository validation runner already normalizes that environment (`validate.mjs:13-30`), so this is not filed as a product defect. The shell allocator/freshness permission denial remained after POSIX PATH normalization and is explicitly unverified, not reported as a successful test or source defect.

The installed Playwright default Chromium binary was unavailable. An installed Edge experiment did not produce a reliable end-to-end viewer result; no browser rendering or activation pass is claimed. The parser reproduction uses the exact extracted function and remains valid independently. Historical CPU-pressure allocation stress, native skill RED/GREEN runs, live Artifact publishing and live UI acceptance were not rerun.

## Contract conclusions

The shared allocator reads local/archive/ref maxima and the common-dir counter, reserves before output, and supports RUN/S/W namespaces. PowerShell owner-checked lock renaming/retry is present and its held-open-stamp test passes. This does not establish arbitrary scheduler race freedom or distributed atomicity; the contract explicitly makes cross-machine numbering best-effort through fetched refs.

Archive dates walk Git status history rather than text-edit time; only x/- are eligible. Archive-first paired writes retain moved ticket data across a mid-write crash, and duplicate checks expose an interrupted pair. This is not a global board-write transaction, and HELP-02 demonstrates incomplete parent grouping. Fourteen-day default, header and skill instructions agree. Archive-on-arm and pair-commit behavior remains instruction-mediated.

Freshness guards perform bounded/stamped fetch, conservative fast-forward checks and refusal reports; ticket-meta and relay invoke them while holding their board locks. Their actual native mutation/authorization logic and pending/ops display remain other investigators' ownership. Fetch attempt stamping intentionally limits retries for ten minutes, including an attempted fetch failure.

Artifact generation escapes uncontrolled text and uses controlled class vocabularies, counts the archive and labels archived rows. Publication is a skill procedure with a no-Artifact local-file fallback; the code itself does not publish. The rich viewer has distinct parsing/grouping/copy behavior and the confirmed sub-ID defect. F107 historical aliases are already covered by A180 and were not duplicated.
