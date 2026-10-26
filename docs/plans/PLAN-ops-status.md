grade: bounded · critical no · design - · build build=opus · verify build=opus · ceremony lean · mode single (ruled)

# PLAN - ops --status (F94)

GOAL: `ops --status` prints one aligned row per CLI profile - name, 5-hour % used,
7-day % used, or why it cannot be read - from any folder, then exits 0.

## Where each CLI's 5h / 7d usage is readable (probed 2026-10-26, read-only)

| CLI | Source | Status |
|---|---|---|
| Claude Code 2.1.310 | watch-cortana's statusline probe writes `<CLAUDE_CONFIG_DIR>/handoff-watch/<session>` (+ `.fivehour`, `.weekly`); `usage-watch.sh level` / `usage-watch.ps1 -Mode level` reads the newest fresh one (3 h) and prints `src=claude-code 5h=<pct\|-> 7d=<pct\|-> ctx=.. max=..`. It already honours `CLAUDE_CONFIG_DIR` - no change needed. | **verified** (reader) |
| Claude Code | `claude --help` has no usage/status/quota subcommand; `/usage` is interactive only. `claude auth status` (with `CLAUDE_CONFIG_DIR=~/.claude-bodish`) prints JSON `{"loggedIn":true,"authMethod":"claude.ai",...,"subscriptionType":"max"}` - login only, no quota. A profile with no `.credentials.json` answered `"loggedIn": false`. | no live quota command |
| Codex 0.164.0 | Every session rollout `<CODEX_HOME>/sessions/**/rollout-*.jsonl` carries `"rate_limits":{"primary":{"used_percent":39.0,"window_minutes":10080,"resets_at":<epoch>},"secondary":null,...}` on its `token_count` lines. The same `level` reader reads it from `CODEX_HOME` (newest rollout under 3 h): 10080-minute window = 7d, any other = 5h. | **verified** (reader) |
| Codex | `codex --help`: no usage subcommand. `codex login status` prints `Logged in using ChatGPT` (exit 0) / `Not logged in` (exit 1) - but it also tries to create helper binaries under `CODEX_HOME` (it warned so on a scratch home), so it is not read-only. | not used |
| Cursor agent 2026.10.22 | `cursor-agent status` = `Logged in as <email>`; `cursor-agent about` = version, model, subscription tier, email. No usage subcommand; nothing in `~/.cursor` (`agent-cli-state.json`, `cli-config.json`) carries a quota. | **not available** |
| agy (Antigravity) 1.4.7 | `agy --help`: no usage subcommand. `~/.gemini/antigravity-cli/cli.log` only records a 429 `Individual quota reached ... Resets in 76h23m13s` after the fact - no percentage. Profiles live in `~/.agy-<name>` (launchers set `USERPROFILE` there). | **not available** |

## Decisions

- Ruling: the only process `--status` starts is watch-cortana's own `level` reader, once per Claude/Codex profile - no CLI is run (codex writes into its home on every start; claude may touch `.claude.json`) - cost if wrong: none, the reader is the verified source.
- Ruling: "not logged in" = the CLI's credential file is absent (`.credentials.json` for Claude, `auth.json` for Codex), checked by existence only, never read; on macOS (Claude keeps the login in the Keychain) Claude never says "not logged in" - cost if wrong: a Codex profile on keyring storage shows "not logged in" when it has no reading.
- Ruling: one meaning, **% used**, in every row (that is what both readers report); reset time is not shown - the reader does not give one - cost if wrong: a later column.
- Ruling: a reading older than 3 h is not shown (the reader's freshness rule): the row says "no reading in the last 3 h" - a stale 5-hour number would be a guess.
- Ruling: the reader runs with `CLAUDE_USAGE_WATCH_DIR` and `CLAUDE_CODE_SESSION_ID` removed and the other CLI's home pointed at a path that does not exist, so a Claude row never shows Codex usage and the reverse.
- Ruling: discovery = the default dir (`~/.claude`, `~/.codex`, `~/.cursor`, `~/.gemini/antigravity-cli`) plus every `~/.claude-*`, `~/.codex-*`, `~/.cursor-*`, `~/.agy-*` directory; a row's name is the dir name without its dot (`claude-bodish`), the agy default is `agy`.
- Ruling: `~/.skillator/profiles`, one `<name> <cli> <config-dir>` per line (`#` comments; the dir may hold spaces, `~` = home): a dir already found is renamed, a new one added, name `-` hides it; an unknown cli is a row saying so.
- Ruling: lives in the app (`ops/status.ts`, `--status` in `app.ts`); the launchers already pass it through - they get a usage line only.

## Out of scope

Live (network) quota reads, reset times, Cursor/agy numbers.

## VERIFICATION

`npm --prefix plugin/mods/ops-board/ops test` green (status tests: reading, not logged in,
no quota source, timed out, profiles file); `ops --status` from `C:/` prints the table, exit 0.
