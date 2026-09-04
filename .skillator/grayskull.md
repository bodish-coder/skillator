# grayskull-power is ON for this project

Load and follow `skillator:grayskull-power` for all work in this repo, before
anything else. Claude Code: the `Skill` tool. Antigravity: `/grayskull-power`.
Pi: `/skill:grayskull-power`. Codex / Cursor: read that skill's `SKILL.md` and
follow it yourself. Print its banner once per session, then route per its table.

Standing rules, no reminder needed:
- `TICKETS.md` at the repo root is the board — `skillator:ticket-master` owns it.
- Reproduce before fixing. Map with `codegraph` before proposing a remedy.
- Before every commit: regression sweep, then `/code-review`
  (`code-review:code-review`) over the staged diff. `skillator:sherlock-codes` is
  the whole-app sweep — pre-release, handover, or unknown-cause rot — never a
  per-commit gate, and never inside an implementer subagent.
- Usage watch — before each non-trivial step run
  `skills/grayskull-power/../handoff-watch/hooks/usage-watch.sh check`
  (Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File
  "skills/grayskull-power/../handoff-watch/hooks/usage-watch.ps1" -Mode check`).
  It prints `HANDOFF NOW` plus an order — stop and follow it exactly.
  On Claude Code the `Stop` hook already does this; skip the manual call there.
