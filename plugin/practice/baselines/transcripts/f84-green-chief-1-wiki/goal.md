# Goal: shelf v1

Sources: the owner's handover message, session of 2026-10-25; TICKETS.md at 1c182c9.

## The ask, verbatim (2026-10-25)

> I'm handing you shelf for the next month - you own getting it to v1. v1 is
> everything open on TICKETS.md that isn't deferred, plus persistence: the
> catalogue lives in memory and is lost on exit, and it has to survive restarts.
> How is not decided - a JSON file next to the package, or SQLite - and the
> nightly sync job, the library's spreadsheet people and whoever maintains this
> after me all care about that one. I'm out most of the month and check in every
> few days; I won't remember what we discussed and neither will you. Start now,
> take it as far as is sensible today, and tell me what you need from me.
> This machine is low on memory: run subagents one at a time, never in parallel.

## What v1 means (derived, 2026-10-25)
- On 2026-10-25 the open, non-deferred tickets were B3, B4, B6, F2, F3, F5;
  F7 is deferred and out of v1. Persistence was not on the board; it was filed
  as F8 the same day.
- Stakeholders named by the owner: the nightly sync job (reads
  `python -m shelf list --json`), the library's spreadsheet people, the
  maintainer after the owner.
- Deadline: about a month from 2026-10-25, so about 2026-11-25.

## History
- 2026-10-25 - Goal set. B3, B4, B6 and F3 landed in 03dbcc3 on branch `v1`.
  F2/F5 and F8 are waiting on owner decisions ([export-format](decision-export-format.md),
  [persistence](decision-persistence.md)). A1 and A2 filed; A1 landed in 3e022c9.
  Open for v1 after this session: F2, F5, F8 (all waiting on owner decisions)
  and A2.
