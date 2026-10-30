---
description: "Sweep tracked UPSTREAM.md manifests (code-yoda, design-arwen, clone-odo), report upstream compare diffs and rule changes, and absorb new upstream commit hashes (skillator-sync)"
---

Load the `skillator-sync` skill ({{SKILLS}}/skillator-sync/SKILL.md) and run its upstream sweep and absorption workflow. Arguments: $ARGUMENTS

1. **Sweep (check)** - Run `sh {{SKILLS}}/skillator-sync/scripts/skillator-sync.sh $ARGUMENTS` (Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File {{SKILLS}}/skillator-sync/scripts/skillator-sync.ps1 $ARGUMENTS`). Show unchanged, changed, and error rows.
2. **Inspect & summarize** - For changed rows, present comparison link and rule mapping table.
3. **Revise & absorb** - Apply accepted revisions to local skill files, run checks, and run `skillator-sync absorb <skill> <name> <sha40>`.