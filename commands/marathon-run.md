---
description: "Run a planned Workflow marathon: the script /marathon-plan saved for the run, one phase per Workflow call, each stage written to the run file before its dispatch, landing and the end batch as in a marathon (relay-morpheus)"
argument-hint: "[RUN id, e.g. RUN-0019]"
---

Load `skillator:relay-morpheus` (run file, chain, marathon, landing) and `skillator:tickets-zordon`
(the board) and run the saved Workflow marathon as relay-morpheus `references/marathon.md`,
"A saved Workflow marathon", Run, says. Run: `$ARGUMENTS` (none = the one open run with a script).

Typing this command is the opt-in to run that script with the Workflow tool - do not ask again.
Every stage is `chain dispatch`ed (row `~`, prompt on disk) before the Workflow call that runs it.
With grayskull-power on (`.skillator/grayskull.md` present) every stage prompt opens with this line, and without it does not: `Load skillator:code-yoda first (restraint, full): the smallest diff that meets the ticket - no speculative abstraction, no new dependency, no refactor outside the ticket, no ceremony; run its review lens on your diff before /code-review and cut what it flags.`
A stage whose ticket someone else owns is refused there (F80, `IDLE <n> owned <ID> <owner>`):
leave it out of the phase and list it as skipped with its owner; dispatch claims the rest.
Park the owner's questions for one end batch; the six stops are asked the moment they are
reached. Never push unasked: headless or no answer, end with `push: waiting for the owner`.
