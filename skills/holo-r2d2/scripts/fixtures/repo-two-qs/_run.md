# RUN-1 - shelf export
plan: TICKETS.md
started: 2026-09-01T09:00Z   updated: 2026-09-01T11:20Z

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 1 | AAAB B3+B4 books.py, F3 report | x | build:sonnet | 2026-09-01T09:40Z | @LANDED@ |
| 2 | AAAC F2+F5 export | ? | build:sonnet | 2026-09-01T10:30Z | - |
| 3 | AAAD F6 export command |   | - | - | - |
| 4 | verify review bump commit push |   | main | - | - |

## Chain
driver: @cc-a1b2c3 2026-09-01T11:20Z     hold: -     mode: workflow
### AAAB - stage 1 - B3+B4 books.py, F3 report
tickets: B3+B4 build/build . F3 cheap/build
files: shelf/books.py, shelf/report.py, tests/test_books.py
prompt: |
  item B3+B4: fix both in shelf/books.py - find() ignores case; add() raises
  ValueError on a blank title. Test each in tests/test_books.py. No commit.
  item F3: shelf/report.py by_author() -> {author: count}. Test it. No commit.
### AAAC - stage 2 - F2+F5 export
tickets: F2+F5 build/build
files: shelf/export.py, tests/test_export.py
after: 1
prompt: |
  item F2: new shelf/export.py with dump() -> the whole catalogue as text.
  item F5: export.dump(author=None) -> only that author's books when given.
  Test each in tests/test_export.py. No commit.
### AAAD - stage 3 - F6 export command
tickets: F6 cheap/build
files: shelf/cli.py, tests/test_books.py
after: 2
prompt: |
  item F6: python -m shelf export prints export.dump() to stdout. Test it.
  No commit.

## Decisions
asks: end
### Q1 open 2026-09-01T10:30Z
parked: stage 2 (AAAC)
ticket: F2
reason: taste
question: Should `export.dump()` write CSV or JSON?
header: Format
options:
  - JSON (Recommended) | matches `list --json` | spreadsheet users must convert it
  - CSV | opens in the library spreadsheet | needs quoting for commas in titles
default: JSON
blocks: F2, F6
files: shelf/export.py, tests/test_export.py
answer: -
### Q2 open 2026-09-01T10:30Z
parked: stage 2 (AAAC)
ticket: F5
reason: taste
question: Should `dump(author=...)` match the author exactly or as a substring?
header: Match
options:
  - exact (Recommended) | predictable | "Herbert" finds nothing
  - substring, any case | forgiving | "Frank" matches two authors
default: exact
blocks: F5
files: shelf/export.py, tests/test_export.py
answer: -

## In flight
### stage 2 - AAAC F2+F5 export  (dispatched 2026-09-01T09:50Z, @cc-a1b2c3)
run: -
prompt: |
  item F2: new shelf/export.py with dump() -> the whole catalogue as text.
  item F5: export.dump(author=None) -> only that author's books when given.
  Test each in tests/test_export.py. No commit.
parked: Q1, Q2

## Rulings
- 2026-09-01 - AAAB returned 3/3 passed (pytest 8 passed); committed @LANDED@.
- 2026-09-01 - AAAC: both items parked (Q1, Q2; verify judged both genuine); nothing landed; row ?.
- 2026-09-01 - stage 3 waits on stage 2 (after: 2) and on Q1 (F6 in its blocks). Nothing dispatchable: two decisions open. Session ended before the end batch.
