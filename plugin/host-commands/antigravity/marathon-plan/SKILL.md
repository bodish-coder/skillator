---
name: marathon-plan
description: "Plan a Workflow marathon: Claude Code only (its Workflow tool). This host has none - it says so and points at /pending-subagent, which works the same tickets with one fresh implementer each (relay-morpheus)"
---
Load the `relay-morpheus` skill ({{SKILLS}}/relay-morpheus/SKILL.md). `/marathon-plan` writes a
Workflow marathon - a relay-morpheus run file plus a saved Workflow script - and that script runs
only on Claude Code: this host has no Workflow tool. Tickets: the words typed after the command.

1. Say so in one line: no Workflow tool on this host, so no script is written and no run is opened.
2. Point at `/pending-subagent [N|max] [IDs]`: the same tickets (only the unassigned and yours, F80), worked to the end with
   one fresh implementer each - relay-morpheus's run file, landing and end batch. Run it only when
   the user asks for it; this command itself starts nothing.
   With grayskull-power on (`.skillator/grayskull.md` present) every implementer prompt opens with this line, and without it does not: `Load skillator:code-yoda first (restraint, full): the smallest diff that meets the ticket - no speculative abstraction, no new dependency, no refactor outside the ticket, no ceremony; run its review lens on your diff before /code-review and cut what it flags.`
