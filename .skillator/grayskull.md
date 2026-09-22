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
- Staged work runs to the end. A plan with stages does not stop between them
  for approval. Six things stop it: a destructive op, a security-sensitive
  action, a side effect outside this worktree (merge, push, publish), the
  7-day limit at 90%, a scope-contract breach, a failed repro. Everything else
  is a `Ruling:` in the run file. `skillator:r2d2-relay` owns `.skillator/run.md` —
  the stage goes in it **before** the agent is dispatched, never after.
- Independent tasks go to a fresh implementer each, one task per agent, with a
  constructed prompt and never the session history — `skillator:replicator-agent`
  runs that loop. Tasks that touch the same files do not fan out.
- Usage watch — before each non-trivial step run
  `skills/grayskull-power/../handoff-watch/hooks/usage-watch.sh check`
  (Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File
  "skills/grayskull-power/../handoff-watch/hooks/usage-watch.ps1" -Mode check`).
  It prints `HANDOFF NOW` plus an order — stop and follow it exactly.
  On Claude Code the `Stop` hook already does this; skip the manual call there.
