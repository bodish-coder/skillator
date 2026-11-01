---
description: "Update skillator and the ops board to the latest pushed version: the Claude Code plugins, then every other host via the installer"
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
4. **Muse** - handled by the installer in step 3; do not repeat installation afterward.
   The installer verifies the installed version against `<src>/.muse-plugin/plugin.json`.
   For enabled user-level native-local installs it also verifies the selected source path,
   migrating from an older cache when needed without deleting plugin data. Marketplace
   installs retain their provenance; a stale version is an error requiring manual attention,
   never permission to convert to a local install. Disabled or unsupported scopes stop safely.
   The shell installer's Muse integration requires Node for JSON validation; other host skill
   copying does not. Missing Muse is skipped: report `Muse: not installed/skipped`, not updated.
   Report the installer's verified Muse version/source, or its failure; do not infer success
   from step 2's source version. If old version was not captured, report `unknown`.
   Runtime capabilities awaiting approval → show `muse plugins approve skillator` to the user,
   never execute approval automatically. A verified version does not imply runtime approval.
5. **Report** one table: host, old -> new version (Muse: verified result from step 4;
   other hosts' new: `version` in
   `<src>/.claude-plugin/plugin.json`, or `<src>/plugin/.claude-plugin/plugin.json` when `<src>` is a
   clone root; old: step 1's list for Claude Code, else that file in the
   dir `.skillator-source` named before step 3 rewrote it, else `unknown`), what was written.
   Claude Code updated → say "restart Claude Code to load it"; the other hosts read the new
   files on their next session.
