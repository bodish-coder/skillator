---
description: "Plan a marathon over the open tickets, or the IDs given: a relay-morpheus run file plus the saved plan (one implementer and one verifier per ticket, phases serial where tickets share files), shown with its agent count; no agents run (relay-morpheus)"
---
Load the `relay-morpheus` skill ({{SKILLS}}/relay-morpheus/SKILL.md) and its references/marathon.md, "A saved Workflow marathon", Plan. Tickets: `$ARGUMENTS` (none = every open ticket on TICKETS.md; only the unassigned and yours, F80).

1. The run file is relay-morpheus's (`init`, `chain plan`) - never a hand-numbered row.
2. The plan is `templates/marathon-workflow.js` copied beside the run file as `run-<0000>-<slug>.workflow.js`, `meta` and `PLAN` filled, nothing below PLAN edited. On this host /marathon-run reads it as data ("Run without the Workflow tool"), never executes it.
3. With grayskull-power on (`.skillator/grayskull.md` present) every stage prompt opens with this line, and without it does not: `Load skillator:code-yoda first (restraint, full): the smallest diff that meets the ticket - no speculative abstraction, no new dependency, no refactor outside the ticket, no ceremony; run its review lens on your diff before /code-review and cut what it flags.`
4. Plan only: no `chain dispatch`, no agent. End with the stages, the phases, the agent count, the plan's path and `run it: /marathon-run RUN-<0000>` - on this host with the phases in order in this session (no delegate verified here).
