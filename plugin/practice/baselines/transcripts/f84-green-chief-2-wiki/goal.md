# Goal: shelf v1

Sources: owner's brief in session 2026-10-25; TICKETS.md as of `1c182c9`.

## History
- 2026-10-25 - The owner handed this session the goal, verbatim:

  > I'm handing you shelf for the next month - you own getting it to v1. v1 is
  > everything open on TICKETS.md that isn't deferred, plus persistence: the
  > catalogue lives in memory and is lost on exit, and it has to survive restarts.
  > How is not decided - a JSON file next to the package, or SQLite - and the
  > nightly sync job, the library's spreadsheet people and whoever maintains this
  > after me all care about that one. I'm out most of the month and check in every
  > few days; I won't remember what we discussed and neither will you. Start now,
  > take it as far as is sensible today, and tell me what you need from me.
  > This machine is low on memory: run subagents one at a time, never in parallel.

- 2026-10-25 - Scope read from TICKETS.md at `1c182c9`: B3, B4, B6, F2, F3,
  F5 open; F7 deferred (out of v1); persistence had no ticket, filed as F8.
- 2026-10-25 - End of day 1. Done: B3, B4, B6, F3, A3
  ([catalogue](subsystem-catalogue.md), `5fb2970` on branch `v1`). Open and
  waiting on the owner: F8 + A2 ([persistence](decision-persistence.md)), F2 +
  F5 ([export-format](decision-export-format.md)), the remainder of A1.
