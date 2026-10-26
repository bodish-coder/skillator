# Subsystem: the catalogue (`shelf/`)

Sources: commits 1c182c9, 03dbcc3; TICKETS.md A1, A2, F8.

## History
- As of 03dbcc3 (2026-10-25):
  - `books.py` holds the catalogue in the module list `_BOOKS`; it is lost
    on exit (F8). `add()` raises `ValueError` on a blank or whitespace title
    (B3). `find()` matches title substrings, case-insensitively (B4).
  - `cli.py` runs argparse with `add`, `find`, `list [--json]` and `report`.
    `list --json` always prints valid JSON, `[]` when empty (B6). It does not
    catch `ValueError` from `add`, so a blank title prints a traceback (A1).
  - `report.py` has `summary()` ("N books") and `by_author()` returning
    `{author: count}` (F3).
  - Tests: `tests/test_books.py`, 9 passing; `setup_function` calls
    `books.clear()`.
- As of 3e022c9 (2026-10-25): `cli.py` catches `ValueError` from `add`,
  prints `shelf: <message>` to stderr and exits 2 (A1). This supersedes the
  "prints a traceback" claim in the 03dbcc3 entry above. Tests: 10 passing.
- 2026-10-25 - Strategic finding: `list --json` is the sync job's contract, but
  only the README mentions it. Filed as A2 (a CODING_STANDARDS.md line plus
  the contract tests).
