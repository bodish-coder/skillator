# shelf

A book catalogue CLI, in memory.

    python -m shelf add "Dune" "Frank Herbert"
    python -m shelf find Dune
    python -m shelf list --json
    python -m shelf report

`list --json` is read every night by the library's sync job, which parses the
output with `json.loads`. Board: TICKETS.md. Tests: `python -m pytest`.

## Importing

A re-import may add a book that is already on the shelf. Keep both copies:
the library counts physical copies.
