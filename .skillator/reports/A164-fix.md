# A164 fix — ready for independent staged review

Worktree: `C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0023-final-a164`, branch `fix/RUN-0023-A164`, base `b7b2451`. No commit or push.

Verified root cause: the pane's `readHere` requires a successful `rev-parse --abbrev-ref HEAD`, which returns 128 on an unborn branch and blocks Fetch confirmation. Shared `BRANCH_ARGS` now uses `branch --show-current`; the pane labels failures as `git branch`. Unborn branches return their name; detached HEAD returns empty and the existing `HEAD` fallback retains pull/push/merge/revert refusals. Arbitrary branch-read failures still block actions. Stale HEAD/branch checks, action arguments, remote constraints and keymaps are unchanged.

Scope: two production lines in hooks/lib/explorer.ts and hooks/explorertab.tsx, plus tests/explorer.test.tsx and ops/tests/explorer.test.mts. Standalone Explorer at this base is read-only and does not consume BRANCH_ARGS; its new real-Git regression exercises the shared query and detached-push planner safety without adding actions.

Reproduced before correction: full plugin suite exit 1, 387 pass / 2 fail (new unborn confirmation regression and new branch-error case); standalone explorer suite exit 1, 10 pass / 1 fail, real unborn branch query status 128. Green: full plugin 389/389 exit 0; full standalone including pi/antigravity 165/165 exit 0; TypeScript exit 0; staged diff check exit 0. Existing pane detached refusals run against the new empty-output mock. Added checks cover successful unborn Fetch, a first commit invalidating an open confirm, and genuine branch query failures refusing Fetch.

Receipts (logs plus actual exit files): worktree `.skillator/receipts/`: `pane-red`, `standalone-red`, `pane-green`, `standalone-green`, `tsc-green`; `staged-check.exit`. `tsc.log`/`tsc.exit` preserve the initial sandbox cache-access failure; rerunning with authorized elevation succeeded. TypeScript config in receipts extends the worktree config and includes the main installed SDK types. Full commands: `claude plugin test <worktree>/plugin/mods/ops-board`; `npm.cmd test --prefix plugin/mods/ops-board/ops`; cached `typescript/bin/tsc -p .skillator/receipts/tsconfig.json`.

Four scoped files staged. Receipt files remain untracked and unstaged. Stop-before-commit gate remains: independent review required. No board/run edits, external-profile writes, or subagents.

## Commit receipt
Independent scoped boundary review returned LAND with no findings; parent authorized commit. Committed exactly the four reviewed files as `0557ec83b3095ec544aec0aec77801a74fb68168` (`A164: allow fetch before the first commit without weakening branch guards`). Worktree `git status --short` is clean; retained receipts now have their own ignored `.gitignore`. Main existing CodeGraph synced successfully (exit 0, 79 changed files); no index initialized. Sync output and actual exit persisted as `codegraph-sync.log` / `codegraph-sync.exit` alongside test receipts. No merge or push.
