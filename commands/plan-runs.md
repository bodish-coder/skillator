---
description: Plan staged relay-morpheus runs over the named tickets (or the open board) for the ops board's Runs tab
argument-hint: "[ticket ids, e.g. F46 F47 F48]"
---

Load `skillator:relay-morpheus` and plan staged runs (its `references/chain.md`).

Tickets: $ARGUMENTS

No tickets named: plan over every open ticket on `TICKETS.md`. For the plan run
`relay-morpheus init --owner <your team handle>` once, then one `chain plan` per
stage with its `--tickets`, `--files` and `--after` (stages that share a file are
ordered, never parallel). Park decisions for the owner instead of guessing them.
Dispatch nothing: this command plans, it does not start the run. End with the run
id and: "open the Runs tab (/ops runs) to start it".
