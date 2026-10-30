---
name: skillator-update
description: "Update skillator and the ops board to the latest pushed version: the Claude Code plugins, then every other host via the installer"
---
Update skillator and its ops board to the latest pushed version, on every host this machine has.
Arguments: the words typed after the command (optional: the path to a skillator git clone, used as the source in step 2).
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
   c. the source pointer the installer left here: the one line in
      `{{SKILLS}}/.skillator-source` - the dir it last installed from, used only if it still
      holds both installers;
   d. ask the user for a skillator clone's path. Headless or no answer → stop and say
      `source: none found`.
   Resolve the installer directory: use the selected source itself if it holds both `install.sh`
   and `install.ps1`, otherwise its `plugin/` child if that holds both; neither → report and stop.
   Retain this installer directory as `<src>` (also the `.skillator-source` value); do not replace
   it with the checkout root. Run `git -C <src> rev-parse --show-toplevel` to detect checkout
   membership, including a plugin subdirectory or linked worktree whose `.git` is a file.
   Success → use its output as `<checkout-root>` and run `git -C <checkout-root> pull --ff-only`.
   Pull fails (diverged, dirty, no upstream) → report it and stop before installation:
   never merge, reset, stash or force. A confirmed nongit cache proceeds without pulling;
   missing Git or any other lookup error → report and stop, not a cache fallback.
   Re-check both installers in the retained `<src>` after pulling; either missing → report and stop.
3. **Re-run the installer** from that source, for codex, cursor, gemini, agy, pi, opencode and the
   Antigravity IDE's ops board: on Windows
   `powershell -NoProfile -ExecutionPolicy Bypass -File "<src>/install.ps1" -Force`, elsewhere
   `sh "<src>/install.sh" --force`. A non-zero exit → show the last lines of its output and stop.
4. **Muse** - only when `muse` is on PATH.
   If `muse plugins list --json` does not list `skillator`:
   Install it via `muse plugins install <src>/plugin` (or `<src>` if `<src>` has `.muse-plugin/plugin.json`).
   If `muse plugins list --json` lists `skillator`:
   Its `source.provenance` is `marketplace-user-added` → `muse plugins marketplace update <name>`
   (`<name>`: the dir after `marketplaces\` in `source.path`), then `muse plugins remove skillator`
   and `muse plugins install skillator@<name>` - a plain `update` re-reads the old snapshot and
   changes nothing. Otherwise it refreshes from the dir it was installed from (`source.path` in
   that list, a `\\?\` prefix dropped), not from step 2's source - a git clone there that step 2 did not pull →
   `git -C <that dir> pull --ff-only` first, failing as in step 2. Then
   `muse plugins update skillator` - or, when that dir has no `.muse-plugin/plugin.json` but
   `<that dir>/plugin/.muse-plugin/plugin.json` exists (installed before F91 moved the plugin
   into `plugin/`), `muse plugins remove skillator` then `muse plugins install <that dir>/plugin`
   instead (install refuses a second source; remove keeps the plugin data). Either way note the
   old and new `version`. It reports a runtime
   capability awaiting approval → show `muse plugins approve skillator` to the user, never
   run it on your own.
5. **Report** one table: host, old -> new version (new: `version` in
   `<src>/.claude-plugin/plugin.json`, or `<src>/plugin/.claude-plugin/plugin.json` when `<src>` is a
   clone root; old: step 1's list for Claude Code, else that file in the
   dir `.skillator-source` named before step 3 rewrote it, else `unknown`), what was written.
   Claude Code updated → say "restart Claude Code to load it"; the other hosts read the new
   files on their next session.
