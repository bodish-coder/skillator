---
description: "Update Skillator and Ops Board for the current CLI profile only"
---

Update Skillator for the CLI and profile running this command.<!-- host-section:arguments --><!-- /host-section:arguments --> Never update a different host or profile. Never push or edit a ticket board.

<!-- host-section:profile -->
This entry point runs in Claude Code. Use its effective `CLAUDE_CONFIG_DIR` (default `~/.claude` only for the default profile). Run its own `claude plugin list --json` with that profile selected. Verify the Skillator and Ops Board entries belong to this profile before writing. If a listed user installation points at another profile, stop and report the shared installation. Use the listed marketplace and the applicable installation scope. Refresh that marketplace, then run `claude plugin update <id> --scope <scope>` for installed Skillator and, if installed, Ops Board. Stop for any marketplace command confirmation. Verify the new versions with the same profile and report that a restart is required. This completes the Claude Code update.
<!-- /host-section:profile -->

<!-- host-section:records -->
Stop here: Claude Code updates only through its plugin manager. Do not clone, pull or run an installer.
<!-- /host-section:records -->
