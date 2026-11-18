# Handoff 2026-11-18 - RUN-0041 stopped at the 97% weekly limit

Resume with: **continue RUN-0041** (after the weekly usage window resets).

## Why it stopped
The 7-day usage reached 97% (`usage-watch.sh level`: `7d=97`). Standing rule: at 97% stop
all agents and hand off. Three running build agents were stopped at that moment.

## State on disk
- `main` = released **4.30.2 / 0.18.2** (pushed `91c353c..4397c8c`), plus local commits since
  (run records, RUN-0041 setup) - not pushed.
- Run file: `.skillator/run-0041-pending-parallel-4.md`. Run branch
  `run/RUN-0041-pending-parallel-4`, worktree `.skillator/worktrees/RUN-0041-pending-parallel-4`.

| Stage | Ticket | State | Where |
|---|---|---|---|
| 317 | A249 model test | **landed** on the run branch (test-only, 19/19) | merged |
| 314 | A242 self-update follow-ups | stopped, **no commits** | worktree RUN-0041-s314 (clean) |
| 315 | A243 Teams follow-ups | stopped, one **WIP commit 226e542** (setup-hosting.test.ps1, unverified) | worktree RUN-0041-s315 |
| 316 | A245 wizard-answers follow-ups | stopped, **no commits** | worktree RUN-0041-s316 (clean) |

Each stage's exact prompt is in the run file's In-flight blocks; redispatch from it. For 315,
tell the agent to start from 226e542 and verify or drop it.

## Next steps
1. Redispatch 314, 315, 316 from their stored prompts (each in its own worktree).
2. Land each (re-run its tests, `/code-review`, one fix round max).
3. Merge the run branch into main, bump 4.30.3 / 0.18.3, ask the owner before the push
   (push as bodish-coder, then `gh auth switch -u IkranActual`).

## Open tickets not in this run
A238, A239, A246 (incl. a review of A236's fix round), A247 (review of B32 + a live agy check),
A248 (Log tab never wired). Owner-only: A227 (rotate Teams secrets), A229 (Teams onboarding),
A230 (low memory).

## Owner to-dos
- Restart Claude Code to load 4.30.2.
- In the agy terminal: open the ops board - Health should show profile `agy`, the per-model
  table fills on its own, nothing cut off at 80x24. If it still says unobservable, tell the
  next session (A247: add an agy-only `--env SKILLATOR_CLI=agy` section).
- Remove the leftover folder: `rmdir /s /q .skillator\worktrees\RUN-0040-s312` (cmd).

## Standing constraints (carry over)
Never repeat or open the exposed Teams secrets or `~/.skillator/teams.json`; stubs only for
claude/agy/muse/installer in tests (stub PATH as `/c/...` in Git Bash, confirmed with
`command -v` - a `C:/...` PATH made one real `agy -p /usage` call on 2026-11-18); never push
unasked; bump the version on every push.
