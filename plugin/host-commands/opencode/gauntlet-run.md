---
description: "Plan and run a marathon in one go (sequential by default, or parallel with an optional cap), or run a plan /marathon-plan saved beside the run file, phase by phase, each stage written to the run file before its dispatch, run in this session; landing and the end batch as in a marathon (relay-morpheus)"
---
Load the `relay-morpheus` skill ({{SKILLS}}/relay-morpheus/SKILL.md) and its references/marathon.md, "A saved Workflow marathon", "Run without the Workflow tool". Arguments: `$ARGUMENTS` - an optional mode first (`sequential` or `parallel`), then an optional count (a whole number of at least 1 or `max`), then ticket IDs (none = every open ticket on TICKETS.md; only the unassigned and yours, F80). No mode and no count = `sequential`; `sequential` takes no count (`sequential 2`: say so and stop); `parallel 1` runs as `1`. The command plans the marathon as /marathon-plan does (relay-morpheus marathon.md, Plan, with the mode), shows it and runs it, in one go. A RUN id alone runs the plan saved for it, as saved; a mode or count beside a RUN id: say the saved plan fixes its shape and stop. Nothing typed = the one open run with a `.workflow.js` beside it and an unlanded stage (two or more: list them and stop; none: plan every open ticket, sequential, and run). A first word that is neither a mode, a count, a ticket ID nor a RUN id (`0`, `two`) - say it is not an option and stop. Typing this command is the opt-in to run the plan.

**Legacy recovery (A162)** - read PLAN as data before any execution. A missing
`mode` property (including quoted JSON keys) is legacy: stop before dispatch and
print `/marathon-plan <mode> <IDs>` with the actual remaining ticket IDs of that
run and a supported mode (default `sequential`). That separate planning-only
command regenerates the legacy script in place under marathon.md's Legacy
recovery guards; it never replaces a modern `PLAN.mode` plan. Keep the
`planned in RUN-<id>` guard for ordinary planning. A RUN id never changes mode.

| Typed | Runs | A phase holds | `RELAY_CHAIN_PARALLEL` on `chain dispatch` |
|---|---|---|---|
| nothing, `sequential`, `1` | sequential | one ticket | unset |
| `parallel`, `max`, `parallel max` | parallel | every file-disjoint ticket that fits | the number of stages in the phase |
| `parallel 2`, `2` | parallel, capped | at most 2 file-disjoint tickets | 2 |

- `sequential` (the default): one ticket per phase, in board order, each stage planned `--after` the one before - one agent at a time (the implementer, then its verifier).
- `parallel`: file-disjoint tickets side by side in one phase, each stage in its own worktree, merged on landing; a count caps a phase. Tickets whose files overlap never share a phase, whatever the mode.

Planning follows marathon.md Plan, including `ticket-meta pick`, `init`, `chain plan`, and `PLAN.mode`. Skip tickets already in an open planned run as `planned in RUN-<id>`; if every picked ticket is in one such run and no mode or count was typed, run that plan instead and say so. If every picked ticket is in one such run but a mode or count was typed, the saved plan fixes its shape: stop. Nothing left to plan: say so and stop. Show stages, phases, agent count and script path, then run without a pause.

1. The `.workflow.js` is read as data (`meta.phases`, `PLAN`), never executed. A legacy script takes the Legacy recovery (A162) refusal above: print the concrete planning command and stop before any dispatch.
2. Every stage is `chain dispatch`ed (sequential: no RELAY_CHAIN_PARALLEL; parallel: `RELAY_CHAIN_PARALLEL=<stages in the phase>`; `parallel N`: `RELAY_CHAIN_PARALLEL=<N>`) (row `~`, prompt on disk, driver `@oc-<6>`, `--owner session`) before its work starts; a ticket's implementer and verifier run under its phase, in this session (no delegate verified here) - the stored prompt done, then the verify text done as a second pass that edits nothing; the verifier ends with one `VERDICT: <json>` line.
   In this session a phase's tickets run one after another - a parallel plan runs serial here, say so in the first line.

3. A stage whose ticket someone else owns is refused (F80) - skip it, list it with its owner. Park the owner's questions for one end batch; the six stops are asked the moment reached. Never push unasked: end with `push: waiting for the owner`.
   With grayskull-power on (`.skillator/grayskull.md` present) every implementer prompt opens with this line, and without it does not: `Load skillator:code-yoda first (restraint, full): the smallest diff that meets the ticket - no speculative abstraction, no new dependency, no refactor outside the ticket, no ceremony; run its review lens on your diff before /code-review and cut what it flags.`
