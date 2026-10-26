# Subsystem: the catalogue and CLI (`shelf/`)

Sources: `.skillator/run-0001-shelf-v1-unblocked-tickets.md`; commits below; TICKETS.md.

## History
- 2026-10-25 - As of `1c182c9`: in-memory list in `shelf/books.py`
  (`add`, `find`, `all_books`, `clear`); `shelf/cli.py` has `add`, `find`,
  `list [--json]` and `report`; 4 tests.
- 2026-10-25 - As of `5fb2970` (merge of RUN-0001 into branch `v1`), 13 tests pass:
  - `add` raises ValueError on a blank or whitespace title (B3, `06b6b17`).
    The CLI turns that into `shelf: title must not be blank` on stderr, exit 2
    (A3, `1096130`).
  - `find` matches case-insensitively by casefold (B4, `4680406`).
  - `list --json` on an empty shelf prints `[]` (B6, `8de4069`;
    [ruling](decision-empty-list-json.md)).
  - `report.by_author()` returns `{author: count}`, library only, with no CLI
    subcommand (F3, `2d93b26`).
  - `tests/test_contracts.py` runs the real CLI as a subprocess (A1 part,
    `9e45046`; returncode assert added in the final stage).
  - Storage is still in memory: persistence (F8) waits on
    [persistence](decision-persistence.md).
- 2026-10-25 - The work sits on branch `v1`, not `master`. The repo has no
  remote. Merging to `master` is the owner's call.
