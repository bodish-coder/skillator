# grayskull-power is ON for this project

Load and follow `skillator:grayskull-power` for all work in this repo, before
anything else. Claude Code: the `Skill` tool. Antigravity: `/grayskull-power`.
Pi: `/skill:grayskull-power`. Codex / Cursor: read that skill's `SKILL.md` and
follow it yourself. Print its banner once per session, then route per its table.

Standing rules, no reminder needed:
- `TICKETS.md` at the repo root is the board — `skillator:ticket-master` owns it.
- Reproduce before fixing. Map with `codegraph` before proposing a remedy.
- `skillator:sherlock-codes` over the staged diff before every commit.
- Usage watch — before each non-trivial step run
  `skills/handoff-watch/hooks/usage-watch.sh check`
  (Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File
  "skills/handoff-watch/hooks/usage-watch.ps1" -Mode check`).
  It prints `HANDOFF NOW` plus an order — stop and follow it exactly.
  On Claude Code the `Stop` hook already does this; skip the manual call there.
