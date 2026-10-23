---
description: "Update skillator and the ops board to the latest pushed version: the Claude Code plugins, then every other host via the installer"
argument-hint: "[clone path]"
---

Update skillator and its ops board to the latest pushed version, on every host this machine has.
Arguments: `$ARGUMENTS` (optional: the path to a skillator git clone, used as the source in step 2).
Never push, never edit any repo's TICKETS.md, never guess or search the disk for a path.

1. **Claude Code** - only when `claude` is on PATH and `claude plugin list --json` lists
   `skillator@<mkt>` (`<mkt>` is the part after `@`; this repo's marketplace is `skillator`).
   Note the `version` of `skillator@<mkt>` and `ops-board@<mkt>` from that list, then run:
   - `claude plugin marketplace update <mkt>`
   - `claude plugin update skillator@<mkt>`
   - `claude plugin update ops-board@<mkt>` (only if it was listed; not installed → say so, do
     not install it)
   A command that asks to confirm a marketplace-declared command → stop and show it to the user;
   never pass `-y` on your own. List again and note the new versions.
2. **Source for the other hosts** - the first of these that exists, and say which:
   a. the path in the arguments, if given;
   b. Claude Code's plugin after step 1: the `installPath` of `skillator@<mkt>` in
      `claude plugin list --json`, when it holds `install.sh` and `install.ps1`;
   c. a source pointer the installer left: the one line in `.skillator-source` beside the skills
      in `~/.codex/skills`, `~/.cursor/skills`, `~/.pi/agent/skills`, `~/.gemini/config/skills`,
      `~/.gemini/skills` or `~/.gemini/antigravity-cli/skills` - the dir it last installed from,
      used only if it still holds both installers;
   d. ask the user for a skillator clone's path. Headless or no answer → stop and say
      `source: none found`.
   A source that is a git clone (it has `.git`) → `git -C <src> pull --ff-only` first. It fails
   (diverged, dirty, no upstream) → report it and stop: never merge, reset, stash or force.
3. **Re-run the installer** from that source, for codex, cursor, gemini, agy, pi and the
   Antigravity IDE's ops board: on Windows
   `powershell -NoProfile -ExecutionPolicy Bypass -File "<src>/install.ps1" -Force`, elsewhere
   `sh "<src>/install.sh" --force`. A non-zero exit → show the last lines of its output and stop.
4. **Report** one table: host, old -> new version (new: `version` in
   `<src>/.claude-plugin/plugin.json`; old: step 1's list for Claude Code, else that file in the
   dir `.skillator-source` named before step 3 rewrote it, else `unknown`), what was written.
   Claude Code updated → say "restart Claude Code to load it"; the other hosts read the new
   files on their next session.
