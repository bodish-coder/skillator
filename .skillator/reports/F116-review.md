# F116 held independent staged review

**Latest verdict (scoped fix round 1): LAND, conditional on remaining full writer/controller checks. Both findings below are resolved; see appended evidence.**

Verdict: **FIX-FIRST**. Two reproduced correctness defects below. Review covers the 18-file cached diff in `.skillator/worktrees/RUN-0023-pending-f100-f104`, HEAD `4139f6a`, against the complete main design `docs/plans/design-2026-10-27-F116-ticket-status-holo.md` (including native transport and atomic Apply addenda) and `run-0023-s189-build.txt`. Production files were not edited; no commit or real board/run mutations.

## Findings

1. **P2 — PowerShell snapshot comparison is linguistic, not ordinal** — `plugin/skills/tickets-zordon/scripts/ticket-meta.ps1:371`. `"[$mk] $body" -cne $o.expected` accepts Unicode strings with different code points when PowerShell's case-sensitive linguistic comparison considers them equivalent. Reproduced through the actual native script: expected `[!] F91 - caf\u00e9 (blocked: wait)` versus current `[!] F91 - cafe\u0301 (blocked: wait)` returns exit 0 and writes Pending, although the row changed after the snapshot. The design explicitly requires ordinal equality and no Unicode normalization; shell parity is also broken. Use explicit `[string]::Equals(..., [StringComparison]::Ordinal)` for this guard and retain a native regression proving refusal plus unchanged board/HEAD/index. Same-note comparison should also use ordinal equality where byte-preserving exact reason equality is intended.

2. **P2 — success cancellation can erase a newer draft during an update retry** — `plugin/mods/ops-board/hooks/status.tsx:82-84`, `:23`, `:36-40`. The successful path checks generation using `read`, then calls `cancel`, whose `clearStatus` callback unconditionally returns null. A close/reopen after the read or during `update`'s optimistic version retry causes the old completion to clear the newer draft and its unsent reason. Reproduced using the actual unchanged status module transpiled with the installed TypeScript compiler and a state adapter implementing the documented callback retry: generation 100 succeeds; before its clear commits, generation 200 opens with a new unsent reason; retry returns null and erases generation 200. Clear only inside an atomic generation-conditional updater, and condition subsequent focus/pane effects on actual ownership of that close. Add a retry/interleaving test; the existing detached-completion test reopens before process completion and misses this interval.

## Reproduction and evidence

`node .skillator/reports/F116-review-probe.cjs` completed with exit 0 under the existing-cache permission grant. Its first half invokes real System32 PowerShell against a fresh temporary git fixture; its second half loads the actual TSX production module with only SDK state/process adapters mocked. Output:

```text
REPRO P1: actual PowerShell writer accepted stale Unicode snapshot and mutated board; exit 0; fixture C:\Users\Ikran\AppData\Local\Temp\f116-review-unicode-oyaz0j
REPRO P2: actual transpiled status module erased generation 200 unsent draft when successful generation 100 clear retried after a version conflict. State APIs/process are mocked; production module unchanged.
```

The probe printed a preliminary P1 label; final severity for the Unicode edge case is P2 as classified above. Initial sandbox execution reproduced the native bug but could not load the existing TypeScript cache; the permitted rerun completed both probes. This is deterministic module concurrency evidence, not a physical native-key event claim.

Reviewed writer guard order: existing lock, board freshness, unique row, snapshot, allowed source, refreshed owner/lead, then no-op or edit. New status does not enter legacy notification paths; existing session claims and managed-note handling are scoped. Reviewed actual argv table/host: allowlisted script-specific Node entry, discrete argument arrays, existing team calls retained. Reviewed holo model/render path and native fixture script: full-ID run matches, complete matching runs, escaped data, and generation through existing renderer; no board-writing HTML.

Read the builder's `F116-writer-checks.mjs` and successful 78-check native receipt, and `F116-holo-checks.mjs`/receipt for actual HTML, full run coverage, escaping, ignored output, unchanged board/run/HEAD/index. Those checks do not contain the Unicode or completion-retry counterexamples. Reviewed mounted status tests, F115 focus integration, key-label/chrome accounting, and frame evidence limitations. Did not duplicate broad suites.

Final read-only receipt check: isolated alphabet 4/0, isolated band 33/0, and tsc exit 0; cached diff whitespace check clean. The two probed production files match the cached versions. Full writer suites and final controller checks were pending at dispatch; they remain separate landing prerequisites. Any changed production source needs focused regression and re-review of the fix before LAND. B15/B17 remain open/unreproduced; emulator, font, raw keyboard and physical mouse behavior were not checked.

## Scoped fix round 1 — LAND subject to final checks

Reviewed only the original findings and their corrections in `ticket-meta.ps1`, `hooks/status.tsx`, and `tests/status.test.tsx`; no new broad audit. The PowerShell snapshot and new guarded same-note comparisons now explicitly use `StringComparison.Ordinal`, as does the new target dispatch. Legacy comparison behavior remains outside the guarded path. The success completion now clears status inside the generation-conditional update callback itself, so retries recheck ownership; it does not call asynchronous cancellation/focus/pane cleanup afterward.

Independently reran the original native Unicode input and exact completion-update retry schedule against current actual production source, changing only assertions to demand the corrected outcomes: `node .skillator/reports/F116-review-round1-probe.cjs`, exit **0**. This wrapper retains the original probe for comparison. Output:

```text
PASS original native Unicode counterexample: stale snapshot refused, board unchanged; fixture C:\Users\Ikran\AppData\Local\Temp\f116-review-unicode-PetILB
PASS original completion-retry counterexample: generation 200 unsent draft retained; no pane reopen. Actual production module, mocked SDK state/process.
```

Read the new mounted SDK regression, which inserts the replacement draft through `state.set` before the old clear reaches storage, forcing the real optimistic retry. Its assertions retain the full replacement generation/unsent reason, one process call, and zero additional pane opens. The isolated status receipt reports **15 pass / 0 fail**. Also read the native ordinal-check receipt proving Unicode refusal preserves board/HEAD/index and a normalization-only reason change is not treated as a no-op. Current probed files match the staged versions; `git diff --cached --check` is clean.

No remaining blocker in these two fixes. Full shell/PowerShell writer suites and final controller checks remain landing prerequisites; this scoped verdict does not claim those pending results. Production files remain untouched by the reviewer. B15/B17 and physical-event evidence limitations remain unchanged.
