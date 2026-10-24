---
description: "Run a planned Workflow marathon: the script /marathon-plan saved for the run, one phase per Workflow call, each stage written to the run file before its dispatch, landing and the end batch as in a marathon (relay-morpheus)"
argument-hint: "[RUN id, e.g. RUN-0019]"
---

Load `skillator:relay-morpheus` (run file, chain, marathon, landing) and `skillator:tickets-zordon`
(the board) and run the saved Workflow marathon as relay-morpheus `references/marathon.md`,
"A saved Workflow marathon", Run, says. Run: `$ARGUMENTS` (none = the one open run with a script).

Typing this command is the opt-in to run that script with the Workflow tool - do not ask again.
Every stage is `chain dispatch`ed (row `~`, prompt on disk) before the Workflow call that runs it.
Park the owner's questions for one end batch; the six stops are asked the moment they are
reached. Never push unasked: headless or no answer, end with `push: waiting for the owner`.
