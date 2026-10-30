---
name: team
description: "Team management and ticket assignment: add, remove, list members, set/change lead, and assign tickets to team members"
---

Load the `tickets-zordon` skill ({{SKILLS}}/tickets-zordon/SKILL.md) and run the team or ticket assignment action for this repo.
Arguments: whatever followed the command (`add @handle "Name" email`, `remove @handle`, `lead @handle|-`, `assign <ID> @handle`, `assign-tester <ID> @handle`, or `list`).

1. **Action Routing**:
   - `add @handle "Name" email[,email...]` -> Add teammate:
     Run `sh {{SKILLS}}/tickets-zordon/scripts/ticket-meta.sh team add @handle "Name" email` (Windows: `ticket-meta.ps1`)
   - `remove @handle` -> Remove teammate:
     Run `sh {{SKILLS}}/tickets-zordon/scripts/ticket-meta.sh team remove @handle`
   - `lead @handle` or `lead -` -> Set, hand over, or clear team lead:
     Run `sh {{SKILLS}}/tickets-zordon/scripts/ticket-meta.sh team lead @handle` (or `-` to clear)
   - `assign <ID> @handle` or `<ID> @handle` -> Assign ticket:
     Run `sh {{SKILLS}}/tickets-zordon/scripts/ticket-meta.sh assign <ID> @handle`
     **Lead Rule**: Once a lead is assigned, only the lead can assign or reassign tickets.
   - `assign-tester <ID> @handle` or `<ID> tester @handle` -> Assign tester:
     Run `sh {{SKILLS}}/tickets-zordon/scripts/ticket-meta.sh assign-tester <ID> @handle`
     Open to all teammates at any time (leaves ticket mark as-is).
   - `list` or empty -> List team:
     Run `sh {{SKILLS}}/tickets-zordon/scripts/ticket-meta.sh team list`

2. Output the result line directly to the user.
