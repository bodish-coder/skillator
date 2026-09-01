---
name: handoff-watch
description: >-
  Watch Claude Code usage limits and automatically write a session handoff the
  moment usage crosses a threshold (97% by default), so a session that is about
  to be cut off never loses its context. Use when the user asks to "monitor usage
  limits", "auto handoff before I run out", "warn me at 97%", "save the session
  before the limit", "hand off automatically", or wants to install/configure/debug
  the usage watcher. This skill INSTALLS a statusline probe plus a Stop hook - the
  monitoring itself is done by those hooks, not by the model. The handoff document
  is written by the handoff skill, which the hook invokes. NOT for reporting
  current usage (use /usage) and NOT for context-compaction tuning.
---

# Handoff Watch (auto-handoff at the usage limit)

A skill cannot monitor anything - it is only text loaded into a turn. The watching
has to be done by the harness. This skill installs two small entry points into the
same script, then gets out of the way:

| Piece | Event | Job |
|---|---|---|
| `hooks/usage-watch.* probe` | `statusLine` | The **only** place Claude Code exposes `rate_limits.*.used_percentage`. Records the highest percentage seen to `~/.claude/handoff-watch/<session_id>`, then delegates to whatever statusline was already configured. |
| `hooks/usage-watch.* gate` | `Stop` | At the end of a turn, if the recorded percentage ≥ threshold, returns `{"decision":"block"}` with the three-step preserve order below. |

When it fires, Claude is told to do three things in order, so the saved state is
whole rather than just a narrative:

1. **Drain the agents** — wait for or stop any running subagent, workflow or
   background task, and record what it had accomplished. In-flight agent work is
   never left undescribed.
2. **Sync the board** — `skillator:ticket-master` over `TICKETS.md`, statuses only
   (it is told *not* to start working open tickets — there is no budget left): close what
   actually landed, downgrade half-done work to in-progress, file tickets for
   anything found this session that has none.
3. **Write the doc** — `skillator:handoff`, with a status table that matches
   `TICKETS.md` ticket-for-ticket and a section listing the in-flight agent work
   from step 1 plus the exact prompt to resume it.

Both `rate_limits` (5-hour and 7-day windows) and `context_window.used_percentage`
are picked up; whichever is highest wins.

Fires **once per session** (a `.done` marker next to the flag file), and never
loops (`stop_hook_active` is honoured).

## Install

Use **forward slashes** in every path — PowerShell accepts them and it removes
all backslash-escaping from the JSON. Windows shown; on macOS/Linux use `usage-watch.sh` with `probe`/`gate` as
the first argument.

Add to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "powershell -NoProfile -ExecutionPolicy Bypass -File \"<SKILL>/hooks/usage-watch.ps1\" -Mode probe -Then \"<YOUR EXISTING STATUSLINE COMMAND>\""
  },
  "hooks": {
    "Stop": [
      { "hooks": [ { "type": "command", "command": "powershell -NoProfile -ExecutionPolicy Bypass -File \"<SKILL>/hooks/usage-watch.ps1\" -Mode gate", "timeout": 5 } ] }
    ]
  }
}
```

- `<SKILL>` is this skill's directory.
- `-Then` is optional. Drop it if there is no existing statusline; the probe then
  prints nothing and the statusline is empty.
- POSIX: `"command": "<SKILL>/hooks/usage-watch.sh probe '<YOUR EXISTING STATUSLINE COMMAND>'"`.

## Configure

- **Threshold** — `CLAUDE_USAGE_HANDOFF_PCT` env var (default `97`). Set it in
  `settings.json` under `env` to make it stick.
- **Where the handoff lands** — decided by the `handoff` skill (`docs/handoffs/`
  by default), not here.

## Verify

```
powershell -NoProfile -ExecutionPolicy Bypass -File <SKILL>/hooks/selftest.ps1
```
Prints `ok`. It feeds fake statusline JSON through both modes and asserts: the
max percentage wins, no fire below threshold, a block with the percentage above
it, no second fire, and no fire when `stop_hook_active`.

To check it live, temporarily set `CLAUDE_USAGE_HANDOFF_PCT=1` and end a turn -
the handoff should be written immediately.

## Troubleshooting

- **Never fires** — the statusline is where the percentage comes from. If
  `~/.claude/handoff-watch/<session_id>` does not exist, the probe is not wired in
  as `statusLine`, or this Claude Code build predates the `rate_limits` statusline
  field (2.0.44+).
- **Statusline went blank** — the `-Then` command is wrong or missing.
- **Fired once, want it again** — delete `~/.claude/handoff-watch/<session_id>.done`.
- **Stale flag files** — plain text, a few bytes each; delete
  `~/.claude/handoff-watch/` whenever.

## Related

- `skillator:handoff` — writes the document this skill triggers.
- `skillator:ticket-master` — the `TICKETS.md` board the handoff is reconciled against.
- `skillator:handoff-resume` — executes it in the next session.
