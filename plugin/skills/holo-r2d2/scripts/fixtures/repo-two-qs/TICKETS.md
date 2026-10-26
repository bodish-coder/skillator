# TICKETS

Legend: `[ ]` pending · `[~]` in-progress · `[!]` blocked · `[>]` deferred · `[x]` done · `[-]` cancelled
IDs are permanent — never reuse or renumber. Append new tickets at the end of
their section.

## Bugs

- [x] B1 — `report` crashed on an empty shelf; now prints `0 books`
- [x] B3 — `add("", "Herbert")` stores a book with a blank title; raise ValueError instead (`shelf/books.py`)
- [x] B4 — `find("dune")` misses "Dune": search is case-sensitive (`shelf/books.py`)

## Features

- [x] F1 — `add`, `find`, `list` and `report` subcommands
- [!] F2 — `dump()` in a new `shelf/export.py`: the whole catalogue as text, for the coming `python -m shelf export`. Format: CSV or JSON - owner's call (blocked: RUN-1 Q1 - export format CSV or JSON)
- [x] F3 — `report.by_author()` returns `{author: count}` (`shelf/report.py`)
- [!] F5 — `export.dump(author=None)`: when an author is given, only their books (`shelf/export.py`) (blocked: RUN-1 Q2 - author filter exact or substring)
- [ ] F6 — `python -m shelf export` writes `dump()` to stdout (`shelf/cli.py`, needs F2)
- [>] F7 — web UI for browsing the shelf (deferred: after v1 ships)

## Agent-found
