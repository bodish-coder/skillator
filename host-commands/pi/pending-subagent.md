---
description: "Work the open tickets, or the IDs given, to the end with subagents: a relay-morpheus run, one fresh implementer per ticket (N or max at once, file-disjoint), each diff reviewed and landed, the run merged, the push asked (relay-morpheus)"
argument-hint: "[N|max] [ticket ids, e.g. 2 F12 F14]"
---
Load the `relay-morpheus` skill ({{SKILLS}}/relay-morpheus/SKILL.md), the `tickets-zordon` skill ({{SKILLS}}/tickets-zordon/SKILL.md) and the `tasks-sentinels` skill ({{SKILLS}}/tasks-sentinels/SKILL.md) and work the tickets to the end with subagents. Arguments: `$ARGUMENTS`

**Arguments.** An optional agent count first, then optional ticket IDs (`2 F12 F14`, `max`, `F12`).
The count is a whole number of at least 1 or `max`; no count = 1. No IDs = every open ticket on
TICKETS.md (`[ ]`, `[~]`, `[!]` re-checked). A first word that is neither a count nor a ticket ID
(`0`, `two`) → say it is not a count and stop.
- 1 (the default): serial, one agent at a time - the one-agent-at-a-time rule.
- N > 1: up to N stages at once, each in its own stage worktree off the run branch, merged back
  on landing. `max`: as many as are file-disjoint, no fixed cap.
- Tickets whose files overlap never run together, whatever the count.

1. **Pick.** Skip `[%]` (owner checks), `[>]` deferred, `[x]` and `[-]`; say which were skipped
   and why. Nothing left → say so and stop.
2. **Plan** (relay-morpheus, its chain reference): `init` one run over TICKETS.md - one stage per
   ticket, then the main session's final verify-review-bump-commit-push stage. `chain plan` each
   ticket stage with `--files` (what the ticket names or will touch) and its exact prompt file
   before the first dispatch; a ticket sharing files with an earlier one gets `--after` it. Every
   prompt says: work and commit in the run worktree (or the stage worktree dispatch names), never
   the main checkout, never push, never edit TICKETS.md.
3. **Dispatch** - one fresh implementer per ticket (tasks-sentinels): the host's subagent tool (none: run each stored prompt yourself, one at a time, in a fresh context, and say so), given only that
   stage's stored prompt, no session history. `chain decide`, then `chain dispatch <n>` before
   each agent: it writes the row and the exact prompt into the run file first. Count 1: `chain
   next`, one stage at a time. N or `max`: `RELAY_CHAIN_PARALLEL=<N>` (`max` = the number of
   ticket stages) on `chain next --all`, one dispatch and one agent per `NEXT` line; refill the
   free slots after each landing.
4. **Land** each stage when its own agent returns: read the diff, regression sweep, a code review of the staged diff (`/code-review` where the host has it);
   fix findings through a new implementer. A stage in its own worktree: `chain merge <n>` first
   (exit 3 = conflict: the stage is `!`, a retry stage is planned on the merged branch). Then
   `stage <n> x <sha>` and flip its ticket with tickets-zordon's ticket-meta (`board <ID> <mark>`
   from a worktree). A failed stage: `!`, its In-flight block kept with the failure.
5. **Finish**: merge the run branch into main from the main checkout, remove the run worktree and
   branch, bump the version where the repo's rule says so, then ask before the push - never push
   unasked. Headless or no answer: stop there and say `push: waiting for the owner`.

Park the owner's questions for one end batch; the six stops are asked the moment they are reached.
