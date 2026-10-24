---
description: "Plan a Workflow marathon over the open tickets, or the IDs given: a relay-morpheus run file plus a saved Workflow script (one agent per ticket, phases, serial where tickets share files, a verify phase), shown with its agent count; no agents run (relay-morpheus)"
argument-hint: "[ticket ids, e.g. F12 F14]"
---

Load `skillator:relay-morpheus` (run file, chain, marathon), `skillator:tickets-zordon` (the board)
and `workflow-authoring` (the Workflow script API), and write a Workflow marathon's plan as
relay-morpheus `references/marathon.md`, "A saved Workflow marathon", Plan, says. Tickets: `$ARGUMENTS`
(none = every open ticket on TICKETS.md).

- The run file is relay-morpheus's (`init`, `add`, `chain plan`) - never a hand-numbered row.
- The Workflow script is its `templates/marathon-workflow.js`, filled and saved beside the run file.
- This command only plans: no Workflow call, no `chain dispatch`, no agent. End by showing the
  stages, the phases, the agent count, the script's path and `run it: /marathon-run RUN-<id>`.
