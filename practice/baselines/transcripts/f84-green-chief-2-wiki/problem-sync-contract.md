# Problem: the outputs other people parse have no contract tests

Sources: README.md at `1c182c9`; tests/test_books.py at `1c182c9`; TICKETS.md B6, A1.

## History
- 2026-10-25 - As of `1c182c9`, the nightly sync job `json.loads()` the stdout
  of `python -m shelf list --json` (README). The only test covers a non-empty
  shelf, which is how B6 shipped unnoticed. The spreadsheet people are a second
  consumer once export (F2) lands. Neither consumer's output has a test that
  fails when its shape changes.
- 2026-10-25 - Strategic finding, filed as A1: a `tests/test_contracts.py`
  that runs the real CLI (`python -m shelf ...` subprocess, so stdout is exactly
  what the sync job sees). It covers empty and non-empty `list --json`, and the
  export format once [export-format](decision-export-format.md) is decided.
  Persistence (F8) has to keep these tests passing across restarts.
- 2026-10-25 - The empty case landed: `9e45046`, plus a returncode assert, in
  the `v1` merge `5fb2970`. A1 stays `[!]` until F8 lands (non-empty and restart
  cases) and F2 lands (export bytes, per [export-format](decision-export-format.md)).
  The persistence board added A2: a missing or corrupt store must not read as `[]`.
