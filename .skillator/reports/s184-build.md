# F112 BUILD — s184
Status: complete after independent LAND and both full installer suites passed. Commit a357ecc6ff7b3826fbd427e102e820e68249d5a0; stage worktree clean.
Worktree: C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0023-pending-f100-f104.s184
Branch: run/RUN-0023-pending-f100-f104-s184

## Scope
19 files, exactly the design's FILES list: README.md; plugin/PLATFORMS.md; plugin/WORKFLOW.md; both plugin/commands/marathon-{plan,run}.md; ten marathon host texts (cursor, pi, opencode, gemini, antigravity); plugin/install.sh and plugin/install.ps1; relay-morpheus references/marathon.md and templates/marathon-workflow.js. F109/F110 preserved; no engine, manifest, installer write-list, board, run-state, or unrelated changes.

## Evidence
- RED: `sh -c 'PATH=/usr/bin:$PATH exec sh "C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0023-pending-f100-f104.s184/plugin/install.sh" --selftest'`: exit 1, `FAIL: marathon-workflow.js PLAN has no mode line (F112)` before implementation.
- Full shell GREEN: original session 96213 became unavailable across the handoff without a recorded exit. Required rerun via reports/s184-installer-checks.ps1 passed: stdout `ok`, exact exit 0 saved in reports/s184-sh-full.exit.txt (stdout/stderr logs alongside).
- Full PowerShell GREEN: `powershell -NoProfile -ExecutionPolicy Bypass -File C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0023-pending-f100-f104.s184/plugin/install.ps1 -SelfTest` ran after shell completed: stdout `ok`, exact exit 0 saved in reports/s184-ps-full.exit.txt; stdout/stderr logs alongside. Persistent runner exited 0.
- Independent source review: reports/s184-review.md, LAND contingent on full suites; both conditions satisfied with no source changes after review. Committed exactly 19 files as `F112: plan and run marathons with sequential or capped parallel phases [AACD]`.
- Post-commit stage `git status --short`: empty, exit 0 (only existing global-ignore access warning). Main `codegraph sync`: exit 0, synced 79 changed files / 2,494 nodes. Usage watch before commit: 51.6% of 92%, OK.
- Executed the actual F112 shell selftest block against temporary copies: baseline exit 0 / ok; mutated Gemini marathon-run first table row exit 1 / `FAIL: host-commands/gemini/marathon-run.toml has no mode row '| nothing, \`sequential\`, \`1\` | sequential | one ticket | unset |' (F112)`; restored exit 0 / ok. Source files were not mutated during the long installer run.
- Executed actual PowerShell F112 block in a temporary fixture: exit 0 / `ok: PowerShell F112 block`.
- Node executable template fixtures (only final Workflow return adapted to export default): nine cases passed, exit 0. Sequential 1 and parallel 3 / parallel 2 with 2 reach expected missing Workflow global `phase is not defined`; sequential 2 and parallel 2 with 3 throw exact phase-width errors; fast, parallel 0, parallel 1, and absent mode throw exact invalid-mode errors.
- Source checks: twelve command mode tables and contiguous refusals, no old command reference; B6 counts 5/5; README/PLATFORMS one-command syntax; WORKFLOW phase shape; ASCII template; shell syntax; PowerShell parsing; git diff --check all pass.
- `sh plugin/practice/scripts/check-muse-manifest.sh plugin` with absolute paths and Unix PATH: exit 0, ok.
- Code-yoda review: duplicate host description wording removed; no new abstractions or dependencies; lean final diff.

## Minimal design corrections
1. Design step wording names pending-subagent inside host commands, contradicting CONSTRAINTS and existing installer rejection. Retained the full grammar but omitted that command name from marathon command texts.
2. Template has a Workflow-only top-level return. Direct .mjs import cannot reach the shape assertion; test fixtures replace only the final return with export default. Production Workflow return remains unchanged.
3. The supplied Node-error capture would abort under shell set -eu and PowerShell Stop: captured the expected failing call with shell `|| :` and local PowerShell Continue. An intermediate full shell green attempt exited 1 silently before this fix; final full shell rerun passed.
4. Contract requires counted PLAN.mode N >= 2; reject 0/1 and unsafe integers in the shape check. Public parallel 1 still normalizes to sequential.
5. Saved-plan reuse explicitly belongs to marathon-run only; marathon-plan stays plan-only.
6. Design's exact refusal grep expects 18 but existing six pending-subagent texts split the phrase across lines. Actual exact matches are the 12 required marathon texts; no unrelated files changed.
7. Controller superseded intermediate task commits and repeated full suites: one coherent staged diff, initial full red, scoped assertions/mutation, final full suites.
8. Mutation ran the actual added installer block against temporary copies, avoiding repeat expensive installer setup and protecting the concurrently tested source.

## Limits
Owner live command/delegate exercise (Workflow, Task, subagents, in-session hosts) not available here and remains owner testing. No push, merge, or ticket state change performed. No unrelated source problem found.
