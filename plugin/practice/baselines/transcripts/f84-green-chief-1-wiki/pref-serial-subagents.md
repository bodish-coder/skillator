# Preference: one subagent at a time

Sources: [goal](goal.md); [watchdog-hold](problem-watchdog-hold.md).

## History
- 2026-10-25 - The owner: "This machine is low on memory: run subagents one at
  a time, never in parallel." This overrides any skill default that runs work
  in parallel (board seats, `tasks-sentinels` fan-out): board seats run
  serially, and the board.md rules (one turn, no cross-talk) still apply.
