# F112 s184 independent review

Verdict: LAND after the builder records passing full shell and PowerShell installer selftests. No substantive staged-diff defect found; this review is not a claim that the pending full suites passed.

Scope: reviewed the actual 19-file staged diff in `.skillator/worktrees/RUN-0023-pending-f100-f104.s184`, against `docs/plans/design-2026-10-27-F112-marathon-one-command.md` and `s184-build.md`. Local code-review adaptation: specification pass followed by correctness/regression pass; no external posting, commits, implementation edits, or extra agents.

Verified in the staged text:
- `/marathon-run` plans, displays, and runs without a pause; explicit RUN IDs use a saved plan. `/marathon-plan` remains plan-only.
- Sequential default, bare counts, max, optional parallel cap, IDs, public `parallel 1` normalization, invalid-first-word refusal, and mode/count plus RUN-ID refusal agree across the twelve command texts and central reference.
- Sequential has one ticket per phase and previous-stage dependencies. Parallel uses file-disjoint phases; capped groups split at N, retain shared-file dependencies and previous-chunk edges. Dispatch caps match the selected normalized mode.
- Open-plan skip/reuse, empty invocation selection, missing-mode refusal, delegated versus in-session execution, host argument placeholders, ownership refusal, restraint prompt, six stops, and push boundary are retained. F109/F110 areas are additive; no engine/write-list/manifest changes.
- README, PLATFORMS and WORKFLOW describe the same one-command and phase-shape model.

Independent executable evidence: nine Node cases passed using the staged template, changing only the Workflow-only final top-level return to `export default` and fixture PLAN inputs. Sequential/1, parallel/3 and parallel 2/2 reached the expected missing Workflow `phase` global; sequential/2 and parallel 2/3 produced exact width refusals; fast, parallel 0, parallel 1 and absent mode produced invalid-mode refusals. Production return remains untouched. `git diff --cached --check` passed. Usage watch: codex 30.2% of 92%, OK.

Test review: both installer additions check actual source/installed command rows and required refusal/hint strings; both execute a two-ticket sequential fixture and demand the specific shape error, so syntax failure or a removed guard cannot produce a false pass. Shell expected-error capture and PowerShell local Continue are appropriate. Builder reports its focused blocks and row mutation passed; those are builder evidence, not independently rerun here. Full suites intentionally not duplicated.

Nonblocking limits: live owner execution of Workflow/Task/subagents and in-session commands remains unverified and must stay explicit. The intentional pre-F112 missing-mode refusal is a compatibility boundary: this review does not claim old scripts run unchanged. Full shell and PowerShell final results remain a landing prerequisite for the controller.
