# shelf v1 - wiki

Owner: the repo owner (handed over 2026-10-25). Goal set 2026-10-25: [goal](goal.md).
Board: `TICKETS.md` (cited, never copied here).

## Decisions
- [persistence](decision-persistence.md) - JSON file or SQLite (F8); open, board 2026-10-25 voted 3-1 for JSON in a per-user dir, owner Q1
- [export-format](decision-export-format.md) - CSV or JSON for export (F2, F5); open, board 2026-10-25 unanimous for CSV, owner Q2
- [empty-list-json](decision-empty-list-json.md) - `list --json` on empty prints `[]` (B6); decided 2026-10-25

## Subsystems
- [catalogue](subsystem-catalogue.md) - `shelf/` books, CLI, report; as of `5fb2970` on branch v1

## Runs
- RUN-0001 (`.skillator/run-0001-shelf-v1-unblocked-tickets.md`) - B3 B4 B6 F3 A1-empty A3; landed 2026-10-25

## Problems
- [sync-contract](problem-sync-contract.md) - parsed outputs have no contract tests (A1)

## Preferences
- [owner](pref-owner.md) - away, checks in every few days, forgets context; subagents one at a time
