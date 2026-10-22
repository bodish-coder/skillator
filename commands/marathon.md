---
description: "Run a relay-morpheus marathon over the open board, or over the tickets named after the command. Only for a marathon the user typed (/marathon) or asked for by name: not a bare \"work the board\""
argument-hint: "[ticket ids, e.g. F35 F36]"
---

**Typed by the user as `/marathon`, a marathon named in their words** —
"marathon", "keep going", "work them all, staged", "while I'm away" — **or a
headless / chained run:** load `skillator:relay-morpheus` and run a marathon
(its `references/marathon.md` and `references/chain.md`).

**Reached any other way, it is a sweep, not a marathon.** You picked this
command for a bare "work the board" / "work the open tickets" with the user
present: do not `init` or `chain plan`. Follow relay-morpheus
`references/marathon.md`, "Entry — a marathon is picked, not assumed": ask the
mode once, with marathon one of the options (already answered this turn -
don't re-ask).

Tickets: $ARGUMENTS

No tickets named: plan the chain over every open ticket on `TICKETS.md`
(`[ ]` and `[~]`, `[!]` re-checked). Tickets named: plan the chain over those
only. Park the user's questions and ask them in one end batch; the six stops
are asked the moment they are reached.
