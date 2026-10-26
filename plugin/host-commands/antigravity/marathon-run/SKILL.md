---
name: marathon-run
description: "Run a planned marathon: the plan /marathon-plan saved beside the run file, phase by phase, each stage written to the run file before its dispatch, its agents run as subagents (agy: background subagents; codex: subagents) or, on Gemini CLI, in-session; landing and the end batch as in a marathon (relay-morpheus)"
---
Load the `relay-morpheus` skill ({{SKILLS}}/relay-morpheus/SKILL.md) and its references/marathon.md, "A saved Workflow marathon", "Run without the Workflow tool". Run: the words typed after the command (none = the one open run with a `.workflow.js` beside it). Typing this command is the opt-in to run the plan.

1. The `.workflow.js` is read as data (`meta.phases`, `PLAN`), never executed.
2. Every stage is `RELAY_CHAIN_PARALLEL=<stages in the phase>` `chain dispatch`ed (row `~`, prompt on disk; agy: driver `@agy-<6>`, `--owner subagent`; codex: driver `@cx-<6>`, `--owner subagent`; Gemini CLI: driver `@gm-<6>`, `--owner session`) before its work starts; a ticket's implementer and verifier run under its phase - agy: background subagents; codex: subagents (one subagent per ticket of the phase); Gemini CLI: in this session (no delegate verified there), the stored prompt done, then the verify text done as a second pass that edits nothing; the verifier ends with one `VERDICT: <json>` line.
3. A stage whose ticket someone else owns is refused (F80) - skip it, list it with its owner. Park the owner's questions for one end batch; the six stops are asked the moment reached. Never push unasked: end with `push: waiting for the owner`.
   With grayskull-power on (`.skillator/grayskull.md` present) every implementer prompt opens with this line, and without it does not: `Load skillator:code-yoda first (restraint, full): the smallest diff that meets the ticket - no speculative abstraction, no new dependency, no refactor outside the ticket, no ceremony; run its review lens on your diff before /code-review and cut what it flags.`
