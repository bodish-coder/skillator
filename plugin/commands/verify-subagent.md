---
description: "Verify testing tickets: one fresh agent per [%] row re-checks its Done line against evidence; PASS flips it to [x] Verified, FAIL leaves [%] with what failed, OWNER is never flipped (tickets-zordon)"
argument-hint: "[IDs]"
---

Load the `tickets-zordon` skill (skillator:tickets-zordon) and run its "Verify what is in testing"
step for this repo's TICKETS.md (`$PRACTICE` resolved as that skill says). Arguments: `$ARGUMENTS`
(ticket IDs to limit it to; none = every `[%]` row).

1. One fresh agent per `[%]` ticket, its line given verbatim, re-checks the Done line against
   evidence it gets now - commits naming the ID, the tests and checks the line names run now,
   the files it cites - and answers PASS, FAIL or OWNER with that evidence. The agents read and
   <!-- host-section:fallback -->run tests only: they never edit code, commit or touch TICKETS.md.<!-- /host-section:fallback -->
2. A Done line that needs the owner's own eyes (`testing: owner ...`, a live look, a picker check,
   an account) is OWNER - never flipped, whatever else passed.
3. The main session applies each verdict with ticket-meta, never a hand-edited box: PASS ->
   `verify <ID> pass <evidence>` (`[%]` -> `[x]`, a dated **Verified** note); FAIL ->
   `verify <ID> fail <what failed>` (stays `[%]`, the failure appended); OWNER -> nothing.
   Then read the board back and report one table (ID | verdict | evidence) and the count.
