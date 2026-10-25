---
description: "Run a planned Workflow marathon: Claude Code only (its Workflow tool). This host has none - it says so and points at /pending-subagent, or continue RUN-<id> to resume the run stage by stage (relay-morpheus)"
---
Load the `relay-morpheus` skill ({{SKILLS}}/relay-morpheus/SKILL.md). `/marathon-run` runs the Workflow
script `/marathon-plan` saved beside a run file, and that needs Claude Code's Workflow tool: this host
has no Workflow tool. Run: the words typed after the command.

1. Say so in one line: the saved script cannot run here, and nothing is dispatched by this command.
2. Point at `/pending-subagent [N|max] [IDs]` to work the tickets here (only the unassigned and yours, F80) with one fresh
   implementer each, or at `continue RUN-<id>` - relay-morpheus resumes that run's own stages one at a
   time from its run file (the `.workflow.js` beside it is not run). Start either only when asked.
   With grayskull-power on (`.skillator/grayskull.md` present) every implementer prompt opens with this line, and without it does not: `Load skillator:code-yoda first (restraint, full): the smallest diff that meets the ticket - no speculative abstraction, no new dependency, no refactor outside the ticket, no ceremony; run its review lens on your diff before /code-review and cut what it flags.`
