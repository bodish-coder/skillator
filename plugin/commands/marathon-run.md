---
description: "Plan and run a marathon in one go over the open tickets, or the IDs given - sequential by default (one ticket per phase, one agent at a time) or parallel (file-disjoint tickets side by side in a phase, a count caps them) - or run a plan /marathon-plan saved (a RUN id): each stage written to the run file before its dispatch, one phase per Workflow call, landing and the end batch as in a marathon (relay-morpheus)"
argument-hint: "[sequential|parallel] [N|max] [ticket ids, e.g. parallel 2 F12 F14] | [RUN id, e.g. RUN-0019]"
---

Load `skillator:relay-morpheus` (run file, chain, marathon, landing), `skillator:tickets-zordon`
(the board) and `workflow-authoring` (the Workflow script API) and run a Workflow marathon as
relay-morpheus `references/marathon.md`, "A saved Workflow marathon", says. Arguments: `$ARGUMENTS`

**Arguments** - an optional mode/count followed by tickets, or a RUN id. An optional mode first - `sequential` or
`parallel` - then an optional agent count, then optional ticket IDs (`parallel F12 F14`, `parallel 2`,
`2 F12`, `F12`): the command plans the marathon as `/marathon-plan` does, shows the plan, and runs it, in
one go. No mode and no count = `sequential`. The count is a whole number of at least 1 or `max`; a bare
count still works, `sequential` takes none (`sequential 2`: say so and stop) and `parallel 1` runs as `1`.
No IDs = every open ticket on TICKETS.md (`[ ]`, `[~]`, `[!]` re-checked). A RUN id alone (`RUN-0019`)
runs the plan `/marathon-plan` saved for it, as saved; a mode or count beside a RUN id → say the saved plan fixes its shape (`/marathon-plan <mode> <IDs>` plans again) and stop. Nothing typed = the one open
run with a `.workflow.js` beside it (two or more → list them and stop; none → plan every open ticket,
`sequential`, and run). A first word that is neither a mode, a count, a ticket ID nor a RUN id (`0`,
`two`) → say it is not an option and stop.

| Typed | Runs | A phase holds | `RELAY_CHAIN_PARALLEL` on `chain dispatch` |
|---|---|---|---|
| nothing, `sequential`, `1` | sequential | one ticket | unset |
| `parallel`, `max`, `parallel max` | parallel | every file-disjoint ticket that fits | the number of stages in the phase |
| `parallel 2`, `2` | parallel, capped | at most 2 file-disjoint tickets | 2 |

- `sequential` (the default): one ticket per phase, in board order, each stage planned `--after` the one
  before - one agent at a time (the implementer, then its verifier).
- `parallel`: file-disjoint tickets side by side in one phase, each stage in its own worktree, merged on
  landing; a count caps a phase. Tickets whose files overlap never share a phase, whatever the mode.

1. **Plan** (no RUN id given): marathon.md Plan with the mode - `ticket-meta pick [IDs]` (F80; a ticket
   already a stage of an open run with a `.workflow.js` is skipped as `planned in RUN-<id>`; every picked
   ticket in one such run and no mode or count typed → run that run instead and say so; nothing left → say so and
   stop), `init`, `chain plan` (it claims the tickets; a refused claim is said), the script beside the run
   file with `PLAN.mode`. Show the stages, the phases, the agent count and the script's path, then run -
   no pause: typing this command is the opt-in to run the script with the Workflow tool.
2. **Run** (marathon.md Run): a script with no `mode:` line was written before this release - say
   `/marathon-plan` writes it and stop before any dispatch. Phase by phase: `chain decide`, then every
   stage `chain dispatch`ed (row `~`, prompt on disk) before the Workflow call that runs it - sequential:
   plain; parallel: `RELAY_CHAIN_PARALLEL=<stages in the phase>`; `parallel N`: `RELAY_CHAIN_PARALLEL=<N>`.
   With grayskull-power on (`.skillator/grayskull.md` present) every stage prompt opens with this line, and without it does not: `Load skillator:code-yoda first (restraint, full): the smallest diff that meets the ticket - no speculative abstraction, no new dependency, no refactor outside the ticket, no ceremony; run its review lens on your diff before /code-review and cut what it flags.`
   A stage whose ticket someone else owns is refused there (F80, `IDLE <n> owned <ID> <owner>`): leave it
   out of the phase and list it as skipped with its owner; dispatch claims the rest.
3. Land each phase as marathon.md says; park the owner's questions for one end batch; the six stops are
   asked the moment they are reached. Never push unasked: headless or no answer, end with
   `push: waiting for the owner`.
