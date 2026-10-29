---
description: "Team management and ticket assignment: add, remove, list members, set/change lead, and assign tickets to team members"
argument-hint: "[add @handle \"Name\" email | remove @handle | lead @handle|- | assign <ID> @handle | list]"
---

Load the `tickets-zordon` skill (skillator:tickets-zordon) and run the team or ticket assignment action for this repo.
Arguments: `$ARGUMENTS`

1. **Parse Arguments**:
   - `add @handle "Name" email[,email...]` -> Add teammate to `.skillator/team.md`:
     Run `ticket-meta team add @handle "Name" email`
   - `remove @handle` -> Remove teammate from `.skillator/team.md`:
     Run `ticket-meta team remove @handle` (refused if currently the lead).
   - `lead @handle` or `lead -` -> Set, hand over, or clear team lead:
     Run `ticket-meta team lead @handle` (or `ticket-meta team lead -`).
     Only the existing lead can hand over or clear the lead.
   - `assign <ID> @handle` or `<ID> @handle` -> Assign ticket to team member:
     Run `ticket-meta assign <ID> @handle` (reopens ticket to `[ ]`).
     **Lead Rule**: Once a lead is assigned, ONLY the lead may assign or reassign tickets. Non-lead assignments are refused.
   - `list` or no arguments -> List all team members, emails, active lead `[lead]`, and current session user `(you)`:
     Run `ticket-meta team list`

2. Print the read-back output from `ticket-meta` directly. If an operation was refused, explain the refusal message clearly.
