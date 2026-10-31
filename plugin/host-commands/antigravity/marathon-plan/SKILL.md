---
name: marathon-plan
description: "Plan a marathon from the saved Workflow data, using this host's delegate or session fallback"
---
Load `{{SKILLS}}/relay-morpheus/SKILL.md` (run file, chain, marathon), `{{SKILLS}}/tickets-zordon/SKILL.md` (the board)
 and write a Workflow marathon's plan as
relay-morpheus `references/marathon.md`, "A saved Workflow marathon", Plan, says. Arguments: the words typed after the command - an optional mode first (`sequential` or `parallel`), then an optional count (a whole number of at least 1 or `max`), then ticket IDs (none = every open ticket on TICKETS.md; only the unassigned and yours, F80). When invoked without arguments, instead of silently defaulting to `sequential` (adaptive marathon-plan, F121): analyze open eligible tickets (`ticket-meta pick`), compute file disjointness from ticket bodies/history, identify which tickets can run in parallel worktrees without file conflicts, and suggest a recommended parallel grouping (or sequential) with a confirmation choice before generating the plan (headless, chained or relay: proceed with the recommendation). Explicit arguments plan directly with the chosen mode. No mode and no count = `sequential`; `sequential` takes no count (`sequential 2`: say so and stop); `parallel 1` runs as `1`. A first word that is neither a mode, a count nor a ticket ID (`0`, `two`) - say it is not an option and stop.

**Legacy recovery (A162)** - before the duplicate-ticket guard, only an explicit
`/marathon-plan <mode> <IDs>` selecting all remaining ticket IDs of one own open
legacy plan (PLAN has no `mode` property) takes marathon.md's Legacy recovery
branch: back up and regenerate that script in place from existing pending stages.
Keep the run, worktree, branch, stage IDs, codes, dependencies and landed history;
no `init`, `add`, `chain plan`, dispatch or agent. Refuse active/in-flight, failed,
parked, ambiguous or mixed targets as that branch specifies. Modern `PLAN.mode`
plans keep the `planned in RUN-<id>` skip. No IDs is not recovery selection.

| Typed | Runs | A phase holds | `RELAY_CHAIN_PARALLEL` on `chain dispatch` |
|---|---|---|---|
| nothing, `sequential`, `1` | sequential | one ticket | unset |
| `parallel`, `max`, `parallel max` | parallel | every file-disjoint ticket that fits | the number of stages in the phase |
| `parallel 2`, `2` | parallel, capped | at most 2 file-disjoint tickets | 2 |

- `sequential` (the default): one ticket per phase, in board order, each stage planned `--after` the one before - one agent at a time (the implementer, then its verifier).
- `parallel`: file-disjoint tickets side by side in one phase, each stage in its own worktree, merged on landing; a count caps a phase. Tickets whose files overlap never share a phase, whatever the mode.

1. Pick first (F80): `ticket-meta pick [IDs]` (tickets-zordon) - only its `pick` tickets are
  planned (unassigned, or yours); each `skip <ID> <owner>` is shown as skipped with its owner.
  `chain plan` claims every planned ticket for you (`ticket-meta claim`); say a refused claim.
   Adaptive planning (F121): when invoked without arguments, analyze open eligible tickets, compute file disjointness from ticket bodies and history, identify tickets that can run in parallel worktrees without file conflicts, and suggest a recommended parallel grouping (or sequential) with a confirmation choice before generating the plan.
   For a new plan, the run file is relay-morpheus's (`init`, `add`, `chain plan`) - never a hand-numbered row.
2. Phases follow the mode (marathon.md, Mode): sequential - one ticket per phase in pick order, each stage `--after` the previous; parallel - file-disjoint tickets per phase, a count splitting a phase at N; `PLAN.mode` records the normalized mode (`1` and `parallel 1` become `sequential`). Outside Legacy recovery, a ticket already a stage of an open run with a `.workflow.js` is listed as `planned in RUN-<id>`, not planned again.
3. The plan is its `templates/marathon-workflow.js`, saved beside the run file as `run-<0000>-<slug>.workflow.js`, with `meta` and `PLAN` filled, nothing below PLAN edited. On this host /marathon-run reads it as data ("Run without the Workflow tool"), never executes it.
4. With grayskull-power on (`.skillator/grayskull.md` present) every stage prompt opens with this line, and without it does not: `Load skillator:code-yoda first (restraint, full): the smallest diff that meets the ticket - no speculative abstraction, no new dependency, no refactor outside the ticket, no ceremony; run its review lens on your diff before /code-review and cut what it flags.`
5. Plan only: no `chain dispatch`, no agent. End with the stages, the phases, the agent count, the plan's path and `run it: /marathon-run RUN-<0000>` - on this host with agy: background subagents; codex: subagents; Gemini CLI: in this session.
