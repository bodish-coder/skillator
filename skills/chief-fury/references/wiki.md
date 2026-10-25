# The goal wiki - shapes, ingest, lint

Lives at `.skillator/wiki/<goal-slug>/` (or where the owner agreed). Plain
markdown, relative links, committed with the work it describes.

## index.md

```markdown
# <goal> - wiki

Owner: <name>. Goal set 2026-10-25: [goal](goal.md).

## Decisions
- [auth-scheme](decision-auth-scheme.md) - cookies or bearer tokens; open, board 2026-10-25
- [retry-policy](decision-retry-policy.md) - 3 retries, then dead-letter; decided 2026-10-26

## Problems
- [webhook-double-send](problem-webhook-double-send.md) - partners see some invoices twice

## Subsystems
- [billing-worker](subsystem-billing-worker.md) - the queue consumer, `billing/worker.py`

## Preferences
- [owner-checkins](pref-owner-checkins.md) - owner checks in every few days, forgets context
```

Every page appears here exactly once, one line, grouped. A page that is not in
the index does not exist for the next session.

## A decision page

```markdown
# Decision: auth scheme (session cookies or bearer tokens)

Sources: TICKETS.md F12; board agents <ids or transcript path>; commit a1b2c3d.

## History
- 2026-10-25 - The owner asked for partner auth in the beta, scheme
  undecided (goal.md). Score 5: domains (API, clients, security), hard to
  reverse, seats disagree, partners affected. Board convened.
- 2026-10-25 - Board synthesis below. Status: open, parked as Q1.
- 2026-10-27 - The owner decided cookies; no mobile client this year.
- 2026-12-02 - Superseded 2026-12-02 by [auth-tokens](decision-auth-tokens.md):
  the mobile client was pulled forward (goal.md, 2026-12-01 line).

## Board synthesis (2026-10-25)
Agree / The disagreement / Actions / The owner's decision - as board.md.
```

Problem, subsystem and preference pages take the same `Sources:` line and a
dated `History` list. A subsystem page describes code **as of a sha**, never
as it is.

## The three claim rules

| Write | Never |
|---|---|
| "On 2026-10-25 the owner decided cookies for the beta." | "Auth is cookies." |
| "As of `a1b2c3d`, the worker retries 3 times (F9)." | "The worker retries 3 times now." |
| A new dated line + `Superseded <date> by <link>` on the old one | Editing or deleting the old line |

## Ingest - in the same turn as the event

Event: an owner answer or correction, an agent's report, a commit landing, a
board synthesis, a strategic finding.

1. Which pages does it touch? Usually more than one - a decision, the
   subsystem it changes, a problem it closes.
2. Append a dated line to each; pin code claims to the commit.
3. Mark anything it overturns `Superseded <date> by <link>`.
4. New page → add its line to `index.md`. Changed status → update its index line.
5. A strategic finding → a ticket (`tickets-zordon`); cite the ticket id on
   the page and the page on the ticket.

## Query - before every decision

Read `index.md`, then the pages it points at for the question. A dated answer
older than the latest commit touching that code is a lead, not a fact - check
the code at HEAD. An answer worth keeping becomes a page.

## Lint - on a schedule (suggest `/schedule`)

- Two pages claiming opposite things with no supersede between them.
- Orphans: a page not in `index.md`; an index line with no page.
- A decision page with status `open` past its review date or the owner's
  last check-in.
- A code claim whose file changed after its sha: re-check, add a new dated
  claim.
- A claim with no date, or "currently / now / is" about code.

Report what lint found as a list; fixes are ingests, never silent rewrites.
