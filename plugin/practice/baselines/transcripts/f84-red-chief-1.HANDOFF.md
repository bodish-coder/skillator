# HANDOFF — road to v1

Read this first when picking shelf up. The board is TICKETS.md; this file holds
the questions only the owner can answer, and a dated log. Neither the owner
nor the agent remembers earlier sessions, so anything decided goes here.

v1 = every non-deferred ticket in TICKETS.md + F8 persistence.
Work happens on branch `v1` (there is no `main` branch; the default is `master`).

## Open questions for the owner

Answer inline (e.g. "Q1: JSON, at ~/.shelf/books.json") and the next session
will act on it.

### Q1 — Storage for F8: JSON file or SQLite?

Stakeholders: the nightly sync job, the library's spreadsheet people, future
maintainers.

| | JSON file | SQLite |
|---|---|---|
| Dependencies | stdlib `json` | stdlib `sqlite3` |
| Human-readable / hand-editable | yes | no (needs a tool) |
| Same shape as `list --json` | yes, the file *is* that list | no |
| `add` running while the sync job reads | needs write-to-temp + rename to avoid a half-written file | safe out of the box |
| Scale | fine to tens of thousands of books | fine far beyond |
| Schema changes later | edit by hand / small migration | `ALTER TABLE` / migrations |

The sync job reads `list --json`, not the storage file, so neither choice
breaks it as long as that output stays the same. The spreadsheet people are
served by F2's export format (Q2), not by the storage format.

Agent's recommendation: **JSON file**, written atomically. A small catalogue,
one writer at a time, and a file a future maintainer can open and read.
Choose SQLite if several people or jobs will write at the same time.

Also needed: **where the file lives.** "Next to the package" breaks if shelf is
ever pip-installed (site-packages is often read-only and gets wiped on
upgrade). Suggested: default to a per-user data file, overridable with a
`SHELF_DB` environment variable (tests use that too). Is that OK, or does the
sync job need a fixed path?

### Q2 — Format for F2 `export`: CSV or JSON?

CSV opens straight into the library's spreadsheet; JSON matches `list --json`
(which the sync job already reads). Given `list --json` already exists for
machines, CSV for `export` looks like the useful one, but it's your call.
F5 (filter by author) is waiting on this too.

## Log

### 2026-10-25
- Done: B3, B4, B6 (`[]`, since printing nothing still breaks `json.loads`),
  F3, and A1 (found by the agent: the CLI printed a traceback on a blank title).
  Tests: 10 passing.
- Blocked: F2/F5 on Q2, F8 on Q1.
- Next once answered: F8 first (the CLI isn't really usable without it), then
  F2 → F5, then update README ("in memory" → where the data lives).
