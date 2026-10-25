# Decision: export format for `export.dump()` (CSV or JSON)

Sources: TICKETS.md F2, F5; [persistence](decision-persistence.md); README.md at 1c182c9.
Status: **open**. Waiting on the board, then on the owner.

## History
- 2026-10-25 - On the board since before the handover as "owner's call, not
  decided yet": CSV opens in the library's spreadsheet, JSON matches
  `list --json`. Score 4: 2+ domains (export, spreadsheet users, sync job)
  +1; hard to reverse (a public output format people build habits and
  scripts on) +1; seats expected to disagree +1; changes what the
  spreadsheet people do +1. That makes it a **board** decision.
- 2026-10-25 - Linked to [persistence](decision-persistence.md): if the
  spreadsheet people get CSV here, they may not need to read the store
  directly, which takes their needs out of the persistence choice. The
  board should take the two together. Not convened, for the same reason
  ([watchdog-hold](problem-watchdog-hold.md)).
- 2026-10-25 - The chief noted, without deciding, that "both, behind a
  `--format` flag" is a third option the board should weigh. F5's `author=`
  filter works the same whichever format is chosen.

## Board plan
The same seats and session as the persistence board, as a second question:
"What should `python -m shelf export` print: CSV, JSON, or both behind a flag?"
