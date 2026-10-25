---
description: "Work the open tickets, or the IDs given, to the end with subagents: a relay-morpheus run, one fresh implementer per ticket (sequential by default, or parallel and file-disjoint), each diff reviewed and landed, the run merged, the push asked (relay-morpheus)"
argument-hint: "[sequential|parallel] [N|max] [ticket ids, e.g. parallel 2 F12 F14]"
---

Load `skillator:relay-morpheus` (run file, chain, worktrees), `skillator:tickets-zordon` (the board) and `skillator:tasks-sentinels` (one fresh implementer per task) and work the tickets to the end with subagents. Arguments: `$ARGUMENTS`

**Arguments.** An optional mode first - `sequential` or `parallel` - then an optional agent count,
then optional ticket IDs (`parallel F12 F14`, `parallel 2`, `2 F12`, `F12`). No mode and no count =
`sequential`. The count is a whole number of at least 1 or `max`; a bare count still works, and
`sequential` takes none (`sequential 2`: say so and stop) and `parallel 1` runs as `1`. No IDs = every open ticket on TICKETS.md (`[ ]`, `[~]`, `[!]` re-checked).
A first word that is neither a mode, a count nor a ticket ID (`0`, `two`) → say it is not an
option and stop.

| Typed | Runs | `RELAY_CHAIN_PARALLEL` |
|---|---|---|
| nothing, `sequential`, `1` | sequential | unset - `chain next`, one stage at a time |
| `parallel`, `max`, `parallel max` | parallel | the number of ticket stages (no fixed cap) |
| `parallel 2`, `2` | parallel, capped | 2 |

- `sequential` (the default): one agent at a time - the one-agent-at-a-time rule.
- `parallel`: file-disjoint stages at once, each in its own stage worktree off the run branch,
  merged back on landing, still held by the watchdog; a count caps it.
- Tickets whose files overlap never run together, whatever the mode.

1. **Pick.** First `ticket-meta pick [IDs]` (tickets-zordon, F80): only its `pick` lines run - unassigned
   tickets and yours; each `skip <ID> <owner>` is listed as skipped with its owner, never run.
   Then skip `[%]` (owner checks), `[>]` deferred, `[x]` and `[-]`; say which were skipped
   and why. Nothing left → say so and stop.
2. **Plan** (relay-morpheus, its chain reference): `init` one run over TICKETS.md - one stage per
   ticket, then the main session's final verify-review-bump-commit-push stage. `chain plan` each
   ticket stage with `--files` (what the ticket names or will touch) and its exact prompt file
   before the first dispatch; a ticket sharing files with an earlier one gets `--after` it. `chain
   plan` and `chain dispatch` claim each ticket for you (`ticket-meta claim`); a refused claim is
   said in the report. Every
   prompt says: work and commit in the run worktree (or the stage worktree dispatch names), never
   the main checkout, never push, never edit TICKETS.md.
   With grayskull-power on (`.skillator/grayskull.md` present) every prompt opens with this line, and without it does not: `Load skillator:code-yoda first (restraint, full): the smallest diff that meets the ticket - no speculative abstraction, no new dependency, no refactor outside the ticket, no ceremony; run its review lens on your diff before /code-review and cut what it flags.`
3. **Dispatch** - one fresh implementer per ticket (tasks-sentinels): the Agent tool, given only that
   stage's stored prompt, no session history. `chain decide`, then `chain dispatch <n>` before
   each agent: it writes the row and the exact prompt into the run file first. Sequential: `chain
   next`, one stage at a time. Parallel: `RELAY_CHAIN_PARALLEL` from the table above on `chain
   next --all`, one dispatch and one agent per `NEXT` line; refill the
   free slots after each landing.
4. **Land** each stage when its own agent returns: read the diff, regression sweep, `/code-review` (`code-review:code-review`) on the staged diff;
   fix findings through a new implementer. A stage in its own worktree: `chain merge <n>` first
   (exit 3 = conflict: the stage is `!`, a retry stage is planned on the merged branch). Then
   `stage <n> x <sha>` and flip its ticket with tickets-zordon's ticket-meta (`board <ID> <mark>`
   from a worktree). A failed stage: `!`, its In-flight block kept with the failure.
5. **Finish**: merge the run branch into main from the main checkout, remove the run worktree and
   branch, bump the version where the repo's rule says so, then ask before the push - never push
   unasked. Headless or no answer: stop there and say `push: waiting for the owner`.

Park the owner's questions for one end batch; the six stops are asked the moment they are reached.
