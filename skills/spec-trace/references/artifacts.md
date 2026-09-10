# Templates

## `specs/<slug>/spec.md`

```markdown
# Spec — <feature>

## Source

<Who said it, when, and how. If the brief was spoken or is otherwise the only
record, say that here — it changes what a later reader is allowed to assume.>

> <The brief, verbatim. Do not tidy it. The wording you would have "cleaned up"
> is usually the wording that settles an ambiguity six weeks from now.>

## Requirements

- R1  <one requirement, one id>
- R2  <…>

## Out of scope

- <what was considered and deliberately excluded, so a later reader does not
  re-derive it as a gap>

## Assumptions

Judgment calls made where the source was ambiguous and nobody could confirm.
Each names the id it affects, so a wrong guess is findable:

1. **R4 — <the call>.** <Why, and what breaks if it is wrong.>

## Trace

| Id | Requirement | Satisfied by | Evidence |
|----|-------------|--------------|----------|
| R1 | <short form> | `path:symbol` | `path:test_name` |
| R2 | <short form> | NONE | NONE |
```

## Worked example — a spoken brief

The brief, as delivered in a corridor and recorded nowhere else:

> "Anyone can file one, but it needs the person's staff id on it and an amount
> in whole cents, no floats. Anything over fifty thousand cents needs Finance to
> approve it before it counts as filed — under that it goes straight through.
> Oh and if someone files the same amount twice on the same day we should at
> least flag it, not block it, just flag it."

Split into ids. Note that the third sentence is **two** requirements, because
the threshold behaviour and the under-threshold behaviour fail independently:

```markdown
- R1  Any staff member may file an expense.
- R2  Every entry carries the filer's staff id.
- R3  Amounts are whole cents, never a float.
- R4  An entry over 50000 cents is not filed until Finance approves it.
- R5  An entry at or under 50000 cents is filed with no approval step.
- R6  A second entry with the same amount, same staff, same day is flagged.
- R7  A flagged duplicate is still filed — flagging never blocks.
```

R6 and R7 come apart for the same reason: an implementation can flag and block,
which satisfies R6 and violates R7. One id could not have caught that.

The ambiguity the split exposes — "over fifty thousand" in *which* currency —
belongs in Assumptions against R4, not silently in the code.

## Anti-patterns

| Row | Why it is empty |
|---|---|
| `R3 \| whole cents \| yes \| covered` | Neither column names a file. Nothing can be opened. |
| `R3 \| whole cents \| service.py \| 28 tests, one per requirement` | A coverage claim with no mapping. This is the exact output a real baseline produced instead of a table. |
| `R3 \| whole cents \| src/ \| tests/` | A directory is not evidence. Name the symbol and the test. |
| `R3+R4 \| cents and approval \| … \| …` | Two requirements on one id. They fail independently; they cannot share a verdict. |

## Ids and `ticket-master`

Requirement ids (`R<n>`, per feature, in `specs/<slug>/spec.md`) and ticket ids
(`B<n>`/`F<n>`/`A<n>`, repo-wide, in `TICKETS.md`) are different namespaces and
neither renumbers. A ticket that exists to satisfy a requirement names it in the
ticket body — `… (R4)` — so the board and the trace table can be reconciled
without guessing.
