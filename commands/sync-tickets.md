---
description: "Sync in-progress tickets: propose the real status of every [~] row from its line, commits and baselines, ask once, apply the accepted (tickets-zordon)"
argument-hint: "[IDs]"
---

Load the `tickets-zordon` skill (skillator:tickets-zordon) and run its "Sync what is in progress"
step for this repo's TICKETS.md (`$PRACTICE` resolved as that skill says). Arguments: `$ARGUMENTS`
(ticket IDs to limit it to; none = every `[~]` row).

1. Walk every `[~]` row: its line and notes, `git log --grep` for its ID, any baselines or run
   file it cites. Propose `[x]`, `[%]`, `[!]`, `[>]`, `[?]` or stays `[~]`, each with a one-line
   reason naming the evidence. Never invent evidence; unsure → stays `[~]`, "evidence unclear".
2. Show the proposals as one table (ID, now -> proposed, reason) and ask once: accept all /
   pick / none.
3. Apply only what the user accepts, with ticket-meta as the skill says, then read the board
   back. Headless, chained or relay, or no answer → apply nothing and say `applied: none (headless)`.
