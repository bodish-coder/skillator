---
description: "Sync open tickets: propose the real status of every [!], [ ] and [~] row from ticket-meta reconcile, its line, commits and baselines, ask once, apply the accepted (tickets-zordon)"
---
Load the `tickets-zordon` skill ({{SKILLS}}/tickets-zordon/SKILL.md) and run its "Sync what is in progress"
step for this repo's TICKETS.md. Arguments: `$ARGUMENTS`
(ticket IDs to limit it to; none = every `[!]`, `[ ]` and `[~]` row).

1. Run `ticket-meta reconcile [IDs]` (read-only; the ops board's `c` key runs the same rule) for
   its `ID [now] -> [proposed]  reason` rows, then walk every `[!]`, `[ ]` and `[~]` row: its line
   and notes, `git log --grep` for its ID, any baselines or run file it cites. Propose `[x]`, `[%]`,
   `[!]`, `[>]`, `[?]`, `[ ]`, `[~]` or stays, each with a one-line reason naming the evidence.
   Never invent evidence; unsure → stays, "evidence unclear".
2. Show the proposals as one table (ID, now -> proposed, reason) and ask once: accept all /
   pick / none.
3. Apply only what the user accepts, each with its ticket-meta subcommand as the skill says (`done`,
   `testing`, `block`, `unblock`, `start`, `defer`, `decide`) - never a hand-edited box - then read the board
   back. Headless, chained or relay, or no answer → apply nothing and say `applied: none (headless)`.
