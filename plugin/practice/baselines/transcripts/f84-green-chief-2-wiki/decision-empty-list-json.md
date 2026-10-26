# Decision: `list --json` on an empty shelf (B6)

Sources: TICKETS.md B6; `shelf/cli.py` at `1c182c9`; README.md at `1c182c9`.

## History
- 2026-10-25 - As of `1c182c9`, `list --json` prints `""` + newline when the
  shelf is empty (`shelf/cli.py`, `json.dumps(rows) if rows else ""`). The
  ticket asks: print `[]`, or print nothing?
- 2026-10-25 - Score 2 (base 1, +1 changes what a consumer sees: the
  nightly sync job). Easy to reverse, one domain. Chief decides.
- 2026-10-25 - Ruling: print `[]`. Printing nothing still crashes the sync
  job, because `json.loads("")` raises just like `json.loads("\n")`. `[]` is
  the only option that keeps the README contract ("parses the output with
  `json.loads`"). A test on the empty case pins it. Status: decided.
  The owner can overturn it at a check-in. See [sync-job contract](problem-sync-contract.md).
