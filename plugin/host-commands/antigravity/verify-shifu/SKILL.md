---
name: verify-shifu
description: "Verify testing tickets: one fresh agent per [%] row re-checks its Done line against evidence and records a verdict note - verified PASS, or verified FAIL with what failed and why; the box never moves, OWNER gets no note (tickets-zordon)"
---
Load the `tickets-zordon` skill ({{SKILLS}}/tickets-zordon/SKILL.md) and run its "Verify what is in testing"
step for this repo's TICKETS.md. Arguments: the words typed after the command
(ticket IDs to limit it to; none = every `[%]` row; `--deep` adds the code review below, off by default).

1. One fresh agent per `[%]` ticket, its line given verbatim, re-checks the Done line against
   evidence it gets now - commits naming the ID, the tests and checks the line names run now,
   the files it cites - and answers PASS, FAIL or OWNER with that evidence, and on FAIL a WHY
   line (why it failed, when it can tell). The agents read and
   run tests only: they never edit code, commit or touch TICKETS.md. No subagent on this host ->
   check each ticket yourself in turn, under the same read-and-run-only rule.
   With `--deep`, the agent then reviews the ticket's code: code-vader (`collect --range
   <oldest>^..<newest>` over the commits naming the ID, `board:` commits left out; only lines
   those commits wrote count) with its two lenses plus a design-principles lens - single
   responsibility, coupling and cohesion, naming, error handling at boundaries,
   behaviour-focused tests, `.sh`/`.ps1` twins in step. PASS only when the Done line is met and
   no critical or high finding; else FAIL, its evidence the top findings as `<file:line> - <why>`
   joined by `; `, without parentheses or `*`.
2. A Done line that needs the owner's own eyes (`testing: owner ...`, a live look, a picker check,
   an account) is OWNER, whatever else passed.
3. The main session records each verdict with ticket-meta, never a hand edit; the box stays
   `[%]` on every verdict and the note replaces an earlier one: PASS ->
   `verify <ID> pass <evidence>` (` (verified PASS <date>: <evidence>)`); FAIL ->
   `verify <ID> fail <what failed> - <why>` (` (verified FAIL <date>: <what> - <why>)`, the
   ` - <why>` only when the agent gave one); OWNER -> nothing, no note.
   Then read the board back and report one table (ID | verdict | evidence) and the count.
