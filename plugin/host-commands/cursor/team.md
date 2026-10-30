---
description: "Team management and ticket assignment: add, remove, list members, set/change lead, and assign tickets to team members"
---

Load `tickets-zordon` and run the team action. Arguments: `$ARGUMENTS`

1. Parse argument:
   - `add @handle "Name" email` -> `ticket-meta team add @handle "Name" email`
   - `remove @handle` -> `ticket-meta team remove @handle`
   - `lead @handle|-` -> `ticket-meta team lead @handle`
   - `assign <ID> @handle` or `<ID> @handle` -> `ticket-meta assign <ID> @handle`
   - `assign-app <ID> <app,...>` or `<ID> app <app>` -> `ticket-meta assign-app <ID> <app>`
   - `assign-tester <ID> @handle` or `<ID> tester @handle` -> `ticket-meta assign-tester <ID> @handle` (open to all teammates)
   - `list` or empty -> `ticket-meta team list`
2. Once a lead is assigned, only the lead may assign or reassign tickets (tester assignment remains open to all).
