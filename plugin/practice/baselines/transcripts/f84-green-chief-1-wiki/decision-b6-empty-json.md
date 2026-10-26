# Decision: `list --json` on an empty shelf

Sources: TICKETS.md B6; commit 03dbcc3; `tests/test_books.py::test_list_json_on_empty_shelf`.
Status: **decided** (chief's ruling).

## History
- 2026-10-25 - B6 asked "print `[]`, or print nothing?". Score 2 (the sync
  job is affected +1; easy to reverse), so the chief rules on it. Ruling: print `[]`.
  Reason: the sync job calls `json.loads()` on the output, and
  `json.loads("")` raises, so "nothing" would keep the crash. `[]` is the
  same shape as a non-empty result.
- 2026-10-25 - Landed in 03dbcc3, with a regression test.
