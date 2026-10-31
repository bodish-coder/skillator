---
description: "Sweep tracked UPSTREAM.md manifests (code-yoda, design-arwen, clone-odo), report upstream compare diffs and rule changes, and absorb new upstream commit hashes (skillator-sync)"
argument-hint: "[check [SKILL...] | absorb <skill> <upstream> <sha40>]"
---

Load the `skillator-sync` skill (`skillator:skillator-sync`) and run its upstream sweep and absorption workflow. Arguments: `$ARGUMENTS` (optional: `[check] [--daily] [SKILL...]` to sweep all or named skills, or `absorb <skill> <upstream-name> <40-hex-sha> [--date YYYY-MM-DD]` to record an absorbed commit).

<!-- host-section:execute -->
1. **Sweep (`check`)** — Run `skills/skillator-sync/scripts/skillator-sync.sh` (Windows: `skillator-sync.ps1`) with `$ARGUMENTS` (default `check`). Show every `unchanged`, `changed`, and `error` row plus the `summary:` line. All `unchanged` → stop.
<!-- /host-section:execute -->
2. **Inspect & summarize (`changed` rows)** — For each `changed <skill> <name> <old7>..<new7> <compare-url>` row, fetch the watched-path diff across `<old40>...<new40>`, present the clickable GitHub compare URL and a rule-by-rule mapping table (`Upstream change | Verdict (adopt/adapt/reject/already held) | Target section or reason`), and confirm with the user before editing local skill files (headless/relay: log an `A` ticket if judgement is needed).
3. **Revise & absorb (`absorb`)** — Apply accepted rule revisions to `<skill>/SKILL.md`, `references/`, or `scripts/` and record the verdict table in `<skill>/UPSTREAM.md`, run the skill's checks, then run `skillator-sync absorb <skill> <name> <new-40-hex-sha>` and re-run `skillator-sync check <skill>` to verify it reports `unchanged`.
