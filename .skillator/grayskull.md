# grayskull-power is ON for this project

Load and follow `skillator:grayskull-power` for all work here, before
anything else. Claude Code: `Skill` tool; Antigravity: `/grayskull-power`;
Pi: `/skill:grayskull-power`; Codex/Cursor: read that skill's `SKILL.md`.
Print its banner once per session, then route per table.

Standing rules:
- `TICKETS.md` is the board — `skillator:tickets-zordon` owns it.
- Reproduce before fixing; map with `codegraph` first.
- Before every commit: regression sweep, then `/code-review`
  (`code-review:code-review`) on the staged diff. `skillator:audit-sherlock`
  is the whole-app sweep — pre-release, handover, rot — never per-commit,
  never inside an implementer.
- Staged work runs to the end, no stop between stages. Six stops: a
  destructive op, a security-sensitive action, a side effect outside this
  worktree (merge, push, publish), the 7-day limit at 90%, a scope-contract
  breach, a failed repro. Else log a `Ruling:` in the run file.
  `skillator:relay-morpheus` owns `.skillator/run.md`, updated before
  dispatch, never after.
- One task per fresh implementer, own prompt, no session history —
  `skillator:tasks-sentinels` runs that loop. Same-file tasks do not fan out.
- Usage watch — before each non-trivial step run
  `skills/grayskull-power/../watch-cortana/hooks/usage-watch.sh check`
  (Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File
  "skills/grayskull-power/../watch-cortana/hooks/usage-watch.ps1" -Mode check`).
  It prints `HANDOFF NOW` plus an order — follow it. Claude Code's `Stop`
  hook does this already; skip it.
