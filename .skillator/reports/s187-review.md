# F114 stage187 independent review

Verdict: **LAND for staged Tasks 1-5**. **FIX-FIRST for controller baseline helpers before paid execution** (separate from the stage commit).

Reviewed actual `git -C .skillator/worktrees/RUN-0023-pending-f100-f104.s187 diff --cached`, durable design including Resume rulings, F114-preflight.md, s187-build.md and both controller helper sources. Local staged-diff review adaptation; no GitHub posting, source edits, auth access, paid calls or commits.

## Staged source

No blocking correctness findings. Exactly 18 scoped files: 13 clone-odo files, four scenarios and pending green record. Clean-room is absent from the diff. Runner edits are comments only. Description D is 80 whitespace-delimited words and preserves the review trigger. Capture/store/viewport routing, Android shell label, iOS fallback, Windows Snipping Tool, stack handoff and upstream attribution follow the amended design. Pending baseline text makes no invented outcome or exact historical host equivalence claim.

Conditional metadata preserves old imgdiff reports; legacy parity visuals retain their previous keys and formatting. Native orientation warnings are advisory, squares unchecked and web exempt. Two tagged platforms warn even without a report platform. Feature/must-have fail-under calculation is unchanged. Regression tests exercise behavior including real legacy visual JSON serialization/text and passing fail-under despite platform mismatch; these are meaningful compatibility checks.

Independent commands in stage worktree:
- `python -m unittest discover -s plugin/skills/clone-odo/scripts/tests -p test_imgdiff.py`: exit 0, 18 tests OK.
- `python -m unittest discover -s plugin/skills/clone-odo/scripts/tests -p test_parity.py`: exit 0, 16 tests OK.
- `git diff --cached --check`: exit 0.
- `git diff --exit-code`: exit 0.
- PowerShell normalized frontmatter description count: 80, exit 0.

No broad harness repeat. Build report correctly leaves the then-running harness unresolved and upstream network check failed rather than calling either passed. Controller must settle remaining required checks separately.

## Local helper findings (outside staged LAND)

1. **P1: validity is reported but never gated.** F114-baselines.ps1 collect silently drops malformed JSON, returns exit 0 for missing/multiple init, missing/error result, missing clone-odo inventory or >=100 skills, and does not expose inventory membership separately from invocation. run checks only its own output-file absence, not order or previous validity. Thus an rc0 infrastructure/discovery failure can be followed by another paid run contrary to the per-run protocol. Add a strict per-run validator used after each execution and before allowing the successor: real exit 0, one init, positive skill inventory <100 including clone-odo, one successful/non-error result, no timeout and valid JSON; preserve raw logs and stop on failure. A valid no-load result is different from invalid infrastructure and may authorize only the specified fresh retry.

2. **P2: Shell does not preserve argument boundaries on this Windows PowerShell host.** Its inline Bash `-c` bridge loses embedded double quotes during native argument marshalling. Reproduced with the exact bridge and harmless printf: supplying the single argument `space argument` emitted `[space]n[argument]n`, exit 0, rather than one argument. Defaults currently contain no spaces, but parameterized Worktree paths with spaces break. Prefer direct Bash script invocation with discrete arguments and set PATH in process environment, or a fixed script bridge; prove a space-bearing argument survives before execution.

3. **Required isolation evidence remains incomplete.** Helpers snapshot live junction/instruction only before; they never assert unchanged after or check hidden siblings. They do not save/compare historical inventory, fixture SHAs, prefix clone-odo byte identity or manifest hash. These may be separate controller checks, but must actually be performed before claiming the protocol or host-isolation evidence complete. Preserve prefix-build stderr as planned. Existing harness does verify prefix manifests before/after runs; local driver accurately records its exit and BASELINE_ISOLATE=off avoids live hide/restore operations.

Static safety positives: local ignored profile/settings/log roots, no live junction moves or live settings writes in helpers, token passed only through process environment and restored in finally, no token interpolation into argv/output/file writes, no deletion. Runtime CLI credential persistence/discovery isolation was not proved by this source review and must not be claimed from it. No execution of prepare/auth/run modes by reviewer.
## Helper rereview 2 (scoped, before execution)

Verdict: **FIX-FIRST, one remaining strict completion-record check**. Stage source LAND unchanged (8093d1c).

Verified the revised direct file bridge preserves `space argument` as exactly one argument: AST-loaded Shell with printf returned `[space argument]`, exit 0. PowerShell parser reported zero errors. No script modes were invoked.

AST-loaded RunEvidence/PriorRunsPass were exercised against disposable synthetic JSONL/exit files in ignored `.skillator/reports/f114-review-synthetic`. Command exit 0; 13 expected cases passed: valid loaded; valid no-load; missing retry blocks successor; passing retry allows successor; two no-loads block successor; nonzero exit; duplicate init; missing result; duplicate result; error result; absent clone-odo inventory membership; 100 skills; malformed JSON. Last eight invalid cases correctly throw.

Remaining P2: RunEvidence accepts `{"type":"result"}` as successful completion, because `-not $result[0].is_error` is true for a missing property. Reproduced with valid init and exit 0, no Skill call; gate accepted. Require the actual successful CLI result schema at minimum `subtype == success` and `is_error` explicitly Boolean false, rejecting missing/incorrect fields. This closes the promised strict result gate instead of interpreting absence as success.

Source review confirms initial/prior sequencing, platform-only single fresh retry, no transcript overwrite, fixture SHA recording, prefix manifest hash and source byte comparisons, captured prefix-build streams, live junction/instruction/hidden-marker checks before and after, and environment restoration. Existing harness supplies pre/post prefix verification and timeout exit propagation. No additional blocking setup/path issue found for the literal configured paths. Historical inventory comparison and route/viewport review remain controller evidence tasks, not claims made by these helpers.

No prepare/auth/run invocation, credential reads, model runs, or production source edits occurred in this rereview.

## Helper rereview 3 (final scoped correction)

Verdict: **LAND for local helpers**. AST-loaded RunEvidence now requires success subtype and explicit Boolean false is_error. Scoped synthetic regression exit 0: valid success accepted; missing fields, missing is_error, string false, error subtype, and true error flag all rejected (6/6). Earlier bridge, sequencing, retry and inventory checks remain applicable. No modes invoked, credentials accessed, model runs or source changes. Stage LAND unchanged.


## Task 6 measured evidence review

Verdict: **LAND** for the exact two staged baseline documents, green-clone-odo-platforms.txt and green-clone-odo-a157.txt. No runtime/source changes in this diff; whitespace check exit 0.

Independently parsed all five raw JSONL and exit files under ignored .skillator/baselines/F114/logs (command exit 0): each has exactly one init, 50 skills including clone-odo, exactly one successful non-error result, rc0, and first tool call Skill(skillator:clone-odo). Raw turns 15/13/14/14/10, model claude-sonnet-5-5, costs match the staged record and summary.json. Recomputed total is USD 0.7871746 at displayed precision. Each stderr explicitly says no time limit hit and exit 0. Fixture SHA receipts agree with the staged value. Source receipt is 8093d1c373621884c2b93009fcbb13930ca95598 / CLI 2.1.311.

Compared inventory-comparison.json: historical 62 versus current 50, 14 differences, historical extra plugins and seven MCP entries versus current no MCP, matching the documented caveat. Live before/after junction target and instruction hash snapshots are byte-identical. Fresh harness receipt is exit 0 and log final line `ok`. Assistant viewport mentions independently match False/False/False/True/False.

The docs correctly claim loading only, explicitly disclaim navigation/capture/native execution/parity proof, and avoid a controlled A-versus-D or exact historical-host equivalence claim. Historical setup correction is supported by saved plugin/MCP inventory. A157 closure now rests on observed description-D review loading plus all four platform loads, rather than the old A result. No blocking findings; no credential access, model calls, runtime tests or source edits during this review.
