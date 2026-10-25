# Decision: persistence (JSON file next to the package, or SQLite)

Sources: [goal](goal.md); TICKETS.md F8, F2; `shelf/books.py` at 03dbcc3;
[export-format](decision-export-format.md) (a linked decision).
Status: **open**. Waiting on the board, then on the owner.

## History
- 2026-10-25 - The owner made persistence part of v1 and left the "how" open
  (goal.md). Score 5: touches 2+ domains (storage, CLI, sync job, spreadsheet
  users) +1; hard to reverse (an on-disk format plus migrating existing data)
  +1; seats expected to disagree (ops/maintainer vs spreadsheet users) +1;
  changes what people do (the spreadsheet people may open the file directly)
  +1. That makes it a **board** decision.
- 2026-10-25 - The board was **not convened**: `.skillator/watchdog.hold`
  reported 0.2 GB free and memory could not be re-checked
  ([watchdog-hold](problem-watchdog-hold.md)). No position has been taken
  from a single seat. The briefs below are ready.
- 2026-10-25 - Questions sent to the owner, because the board needs the answers
  (it will name them as gaps otherwise):
  1. Does anything other than shelf read or write the catalogue file directly
     (the sync job, the spreadsheet people), or only through the CLI?
  2. Is "next to the package" a hard requirement? An installed package's folder
     is often not writable. The other choice is a per-user data directory or a
     `SHELF_DB` path.
  3. Will more than one process write at once (cron sync while a person runs
     `add`)?
  4. Is there catalogue data anywhere today that needs importing?

## Facts the board starts from (as of 03dbcc3)
- The catalogue is the module-level list `_BOOKS` in `shelf/books.py`, with
  books as `{"title", "author"}` dicts. Every CLI run starts empty.
- `list --json` is the sync job's interface, and since 03dbcc3 it always
  prints valid JSON. If the sync job only uses the CLI, the storage format is
  hidden from it.
- Both options use only Python's standard library (`json`, `sqlite3`); neither
  adds a dependency.

## Board plan (convene when the hold clears, one seat at a time)
Seats: architect, ops (sync job / 3am / backup), UX, with UX swapped for
**the library's spreadsheet users**, maintainer (swapped in for security;
there is no PII or secret in a title/author catalogue, so the security angle
was scored 0), product.
Brief to each seat: board.md template; Read: this page, goal.md,
decision-export-format.md, TICKETS.md F2 F5 F8, `shelf/books.py` and
`shelf/cli.py` at 03dbcc3. Question: "For shelf v1, should the catalogue
persist as a JSON file or a SQLite database, and where on disk?"
The synthesis goes below, under `## Board synthesis (<date>)`, in the four
board.md parts. The owner's answer is appended to History, dated.
