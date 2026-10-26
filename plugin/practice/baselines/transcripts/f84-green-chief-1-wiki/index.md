# shelf v1 - wiki

Owner: the repo owner (git user `fixture`). Goal set 2026-10-25: [goal](goal.md).
Chief: whichever agent session holds this goal; start every session here.
Board: `TICKETS.md` (never copied here). Work branch: `v1` (not pushed).

## Decisions
- [persistence](decision-persistence.md) - JSON file or SQLite for the catalogue (F8); open, score 5, board not yet convened (2026-10-25)
- [export-format](decision-export-format.md) - CSV or JSON for `export.dump()` (F2, F5); open, score 4, board not yet convened (2026-10-25)
- [b6-empty-json](decision-b6-empty-json.md) - `list --json` on an empty shelf prints `[]`; ruled 2026-10-25, landed 03dbcc3
- [wiki-location](decision-wiki-location.md) - wiki lives at `.skillator/wiki/shelf-v1/`; ruled 2026-10-25

## Problems
- [watchdog-hold](problem-watchdog-hold.md) - low-memory hold blocks subagents; blocked both boards on 2026-10-25

## Subsystems
- [catalogue](subsystem-catalogue.md) - `shelf/books.py`, `cli.py`, `report.py`, as of 3e022c9

## Preferences
- [owner-checkins](pref-owner-checkins.md) - owner is out most of the month, checks in every few days, keeps no context between check-ins
- [serial-subagents](pref-serial-subagents.md) - one subagent at a time, never in parallel (low-memory machine)
