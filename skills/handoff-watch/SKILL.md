---
name: handoff-watch
description: >-
  Watch usage limits and automatically write a session handoff the
  moment usage crosses a threshold (97% by default), so a session that is about
  to be cut off never loses its context. Use when the user asks to "monitor usage
  limits", "auto handoff before I run out", "warn me at 97%", "save the session
  before the limit", "hand off automatically", or wants to install/configure/debug
  the usage watcher. This skill INSTALLS a statusline probe plus a Stop hook - the
  monitoring itself is done by those hooks, not by the model. The handoff document
  is written by the handoff skill, which the hook invokes. NOT for reporting
  current usage (use /usage) and NOT for context-compaction tuning. Runs on
  Claude Code (fully automatic), Codex (real usage %, agent-driven) and, with no
  usage signal to read, degrades honestly on Cursor and Antigravity.
---

# Handoff Watch (auto-handoff at the usage limit)

A skill cannot monitor anything - it is only text loaded into a turn. The watching
has to be done by the harness. This skill installs two small entry points into the
same script, then gets out of the way. Both are Claude Code hooks; for
codex/cursor/antigravity see **Other hosts** below.

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

## Other hosts (codex, cursor, antigravity)

Claude Code is the only host with a hook that can **both** read the usage
percentage **and** inject an instruction at turn end. The others get `-Mode
check` / `check`: no stdin, reads whatever the host leaves on disk, prints
either `handoff-watch: <host> <pct>% of <limit>% - ok` or `HANDOFF NOW` followed
by the same three-step preserve order.

```
powershell -NoProfile -ExecutionPolicy Bypass -File <SKILL>/hooks/usage-watch.ps1 -Mode check
<SKILL>/hooks/usage-watch.sh check
```

Nothing calls it on a timer. It is wired by the always-on project file that
`skillator:grayskull-power` writes on activation (`.skillator/grayskull.md`,
pointed at from `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`), which tells the agent
to run it before each non-trivial step. Fires once per session (`.done` marker),
same as the Claude Code gate.

**The honest state per host** — this is what "armed" actually means:

| Host | Usage signal | Turn-end hook that can inject | Active fallback |
|---|---|---|---|
| claude-code | `statusLine` `rate_limits.*.used_percentage` | `Stop` → `{"decision":"block"}` | none needed — full auto |
| codex | **yes** — `~/.codex/sessions/**/rollout-*.jsonl`, last `token_count`: `rate_limits.*.used_percent` and `last_token_usage.total_tokens / model_context_window` | **no** — hooks are `PreToolUse`/`PostToolUse`/`PermissionRequest`/`SessionEnd`; `notify` fires on `agent-turn-complete` but cannot inject | real percentage, agent-driven `check` |
| cursor | **no** — chats are SQLite `store.db`, no usage anywhere on disk | `stop` hook exists (`~/.cursor/hooks.json`, `command`/`prompt` handlers) | **none** — `check` prints "no usage signal on this host"; handoff is manual |
| antigravity | **no** | `AfterAgent` and `PreCompress` in `~/.gemini/settings.json` | `PreCompress` is the real trigger — context is about to be lost; wire `handoff` there |

Codex uses `last_token_usage.total_tokens`, not `total_token_usage` — the latter
is cumulative for the whole session and reads several hundred percent.

Don't claim cursor is armed. It isn't, and no amount of scripting makes it so
until Cursor writes a usage number somewhere readable.

## Configure

- **Threshold** — `CLAUDE_USAGE_HANDOFF_PCT` env var (default `97`). Set it in
  `settings.json` under `env` to make it stick.
- **Where the handoff lands** — decided by the `handoff` skill (`docs/handoffs/`
  by default), not here.

## Verify

```
powershell -NoProfile -ExecutionPolicy Bypass -File <SKILL>/hooks/selftest.ps1
```
Prints `ok`. It feeds fake statusline JSON through `probe`/`gate` and asserts:
the max percentage wins, no fire below threshold, a block with the percentage
above it, no second fire, and no fire when `stop_hook_active`. It then runs
`check` for real and asserts it exits 0, says one of its three allowed lines,
and never reports over 100% (the guard against reading Codex's cumulative
`total_token_usage` instead of `last_token_usage`).

To check it live, temporarily set `CLAUDE_USAGE_HANDOFF_PCT=1` and end a turn -
the handoff should be written immediately.

## Troubleshooting

- **Never fires in one profile but works in another** — the wiring lives in
  *that config dir's* `settings.json`. A `CLAUDE_CONFIG_DIR` profile
  (`~/.claude-work`, `~/.claude-bodish`, …) is a separate install: arming
  `~/.claude` arms nothing else. Wire every profile you actually code in, and
  point `-Then` at that profile's own statusline command — the flag files are
  shared (`~/.claude/handoff-watch/`) but the hooks are not.
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
