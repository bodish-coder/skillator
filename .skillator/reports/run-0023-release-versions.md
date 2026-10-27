# RUN-0023 release version preparation

Verified: five files staged, six version-only replacements, no commit.

- .claude-plugin/marketplace.json: skillator 4.20.0 -> 4.21.0; ops-board 0.10.0 -> 0.11.0.
- plugin/.claude-plugin/plugin.json: 4.20.0 -> 4.21.0.
- plugin/.muse-plugin/plugin.json: 4.20.0 -> 4.21.0.
- plugin/.muse-plugin/marketplace.json: 4.20.0 -> 4.21.0.
- plugin/mods/ops-board/.claude-plugin/plugin.json: 0.10.0 -> 0.11.0.

Checks: all five JSON files parse; all six versions align; check-muse-manifest.sh returned ok using Git Bash with /usr/bin first; git diff --cached --check passed. Formatting preserved. CASEFILE.md remains unstaged and untouched by this agent. Installer suites and independent staged review belong to controller.

Receipts: run-0023-release-json.txt, run-0023-release-muse.txt.
