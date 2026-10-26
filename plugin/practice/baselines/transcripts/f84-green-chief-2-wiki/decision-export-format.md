# Decision: export format, CSV or JSON (F2, F5)

Sources: TICKETS.md F2, F5, A1 at `1c182c9`; board seat agents 2026-10-25:
library staff `ab5a7adb8d4cf9662`, architect `ae40976c74f5f8fc5`, ops
`a06a437e2de5607c0` (one at a time, [pref](pref-owner.md)).

## History
- 2026-10-25 - F2 marks the format as the owner's call, not decided yet. CSV
  opens in the library's spreadsheet. JSON matches `list --json`. F5 builds
  on F2, so both wait for this decision.
- 2026-10-25 - Score 5 (base 1, +1 domains: spreadsheet and sync-job
  consumers; +1 hard to reverse once people build on the file; +1 seats
  expected to disagree; +1 changes what the spreadsheet people do). Board
  convened after [persistence](decision-persistence.md), which it overlaps.
  Status: open.
- 2026-10-25 - Board synthesis below. The three seats agreed. Status: open,
  waiting on the owner (Q2 in the session report). F2 says this is the owner's call.

## Board synthesis (2026-10-25)

### Agree
- **CSV** (all three seats). The sync job already has its machine contract,
  `list --json`. A JSON export would add a second contract that has to stay in
  step with the first, and it would give nothing to the only other consumer,
  the spreadsheet people, who double-click files.
- **Write a file, not stdout** (all three). `python -m shelf export > x.csv`
  breaks on Windows: PowerShell 5.1's `>` writes UTF-16, and csv rows through
  `print` come out as `\r\r\n` (blank rows in Excel). So `export` writes
  `-o PATH` itself, as `utf-8-sig` (a BOM, so "García Márquez" survives in
  Excel), with `newline=""`.
- **The bytes are the contract** (all three). Every export has a `title,author`
  header row, so an empty shelf gives the header alone (the B6 lesson). Quoting
  is `QUOTE_MINIMAL`. Cells starting with `=`, `+`, `-` or `@` get a leading
  `'`, against formula injection (library staff, architect). A1 tests the bytes
  on disk.

### The disagreement
None surfaced on the format. All three made it conditional on one fact: who
reads the export. If a program will parse it, or it is the backup and restore
format (a future `import`), every seat would want JSON, or `--format csv|json`
(ops).
What it is really about: **is export for people or for programs?**

### Actions
1. Once the owner confirms: build F2 to the byte rules above (`dump()`
   returns the text; `export -o PATH` writes it). Owner: implementer agent. Ticket: F2.
2. F5 (`author=` filter) on top of it. Owner: implementer agent. Ticket: F5.
3. Add the export bytes to the contract tests. Owner: implementer agent. Ticket: A1.
4. Ask the spreadsheet people whether their Excel uses a semicolon locale. If
   it does, the delimiter becomes `;` or a flag. Owner: **the owner**.

### The owner's decision
Is the export for people (the spreadsheet staff) or also for programs or restore?
- **A** - People only: **CSV**, with the byte rules above. Opens on
  double-click. Costs: not a lossless restore format; backups copy the store
  instead (ops).
- **B** - Both: **CSV by default, `--format json`** as well. Covers a future
  import. Costs: a second JSON contract to test and keep in step with `list --json`.
- **C** - Programs: **JSON**. Matches `list --json`. Costs: the spreadsheet
  people can't open it.

Recommendation (the chief's): **A**. All three seats chose it, and B can be
added later without breaking anyone.
