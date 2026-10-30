---
name: verify-shifu
description: "Verify testing tickets: one fresh agent per [%] row re-checks its Done line against evidence; PASS flips it to [x] Verified, FAIL leaves [%] with what failed, OWNER is never flipped (tickets-zordon)"
---
Load the `tickets-zordon` skill ({{SKILLS}}/tickets-zordon/SKILL.md) and run its "Verify what is in testing"
step for this repo's TICKETS.md. Arguments: the words typed after the command
(ticket IDs to limit it to; none = every `[%]` row).

1. One fresh agent per `[%]` ticket, its line given verbatim, re-checks the Done line against
   evidence it gets now - commits naming the ID, the tests and checks the line names run now,
   the files it cites - and answers PASS, FAIL or OWNER with that evidence. The agents read and
   run tests only: they never edit code, commit or touch TICKETS.md. No subagent on this host ->
   check each ticket yourself in turn, under the same read-and-run-only rule.
2. A Done line that needs the owner's own eyes (`testing: owner ...`, a live look, a picker check,
   an account) is OWNER - never flipped, whatever else passed.
3. The main session applies each verdict with ticket-meta, never a hand-edited box: PASS ->
   `verify <ID> pass <evidence>` (`[%]` -> `[x]`, a dated **Verified** note); FAIL ->
   `verify <ID> fail <what failed>` (stays `[%]`, the failure appended); OWNER -> nothing.
   Then read the board back and report one table (ID | verdict | evidence) and the count.
