# A163 fix ready for independent review

Worktree: `C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0023-final-a163`
Branch: `fix/RUN-0023-A163`. No commit created; two-file diff staged.

Verified root cause: shell validation accepted leading-zero decimal strings and wrote them verbatim as JSON numbers. The original `ops --font-size 06` returned success but actual `JSON.parse` failed (`Unexpected number`, red harness exit 1).

Changed only `plugin/mods/ops-board/ops/ops.sh` and `plugin/install.sh` (including embedded selftests). Strip leading zeros as text and accept canonical 6..72 through shell patterns, avoiding octal interpretation and numeric overflow. Installer preservation canonicalizes earlier leading-zero sizes and falls back to shipped 11 for invalid ranges. PowerShell mirrors already use integer conversion and were unchanged.

Evidence directory: `.skillator/worktrees/RUN-0023-final-a163/.skillator/a163-evidence/` (relative to main checkout).
- `red.log`, `red.exit`: actual JSON parse repro, exit 1.
- `focused.sh`, `green.log`, `green.exit`: real ops and isolated installer runs; 06/09/072, long leading zeros, 0/000/05/073/huge invalid values, canonical preservation and malformed-size repair; exit 0.
- `installer-sh.log`, `installer-sh.exit`: full `sh plugin/install.sh --selftest` with `/usr/bin` first on PATH; `ok`, exit 0.
- `installer-ps.log`, `installer-ps.exit`: full `powershell -NoProfile -ExecutionPolicy Bypass -File plugin/install.ps1 -SelfTest`; `ok`, exit 0, run after shell completion.
- `git diff --cached --check`: passed. Staged diff: 27 insertions, 5 deletions across two files.

The focused fixture initially lacked a host marker, so its installer did not write a fragment; adding an isolated `.cursor` marker corrected the fixture. `diagnostic.log` retains that fixture diagnosis. No production rework followed, and the final focused and both full suites passed against the staged source.

STOPPED BEFORE COMMIT as requested. Independent staged-diff review remains the parent task.

## Landing receipt
Parent reported independent scoped automation review LAND and authorized commit.
Committed exact reviewed two-file staged diff as `62673a16c8b70676b857eabef5ff34cdb78b1710` (`A163: canonicalize decimal font sizes before writing terminal JSON`).
Verified `git diff HEAD --exit-code` = 0; index and tracked worktree clean. Only untracked `.skillator/a163-evidence/` remains intentionally preserved.
Main checkout `codegraph sync` completed exit 0: synced 79 changed files, added 2,494 nodes. No other source changes made.
