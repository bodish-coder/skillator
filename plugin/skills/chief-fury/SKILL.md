---
name: chief-fury
description: >-
  Use when one session is handed a long-running goal to own across weeks and
  sessions - "you own getting X to v1", "be the DRI", "chief of staff", "I'm
  away for a month, keep it moving", "I won't remember and neither will you" -
  or when a decision on such a goal touches several seats and needs a board
  meeting. NOT for one feature (`build-jarvis`), a staged run alone
  (`relay-morpheus`), a session handoff (`handoff-cortana`) or the board itself
  (`tickets-zordon`).
---

# chief-fury - the one who owns the goal

Nick Fury does not fly the jet or throw the hammer. He holds the files, calls
the team in, and decides what happens next. This session is the **Directly
Responsible Individual** for the goal: it decides, it remembers, and it sends
the work out.

```
THE CHIEF DECIDES AND REMEMBERS. THE WORK GOES OUT; POINTERS COME BACK.
```

Left alone, a session handed "own this for a month" does every edit itself,
keeps its memory in one flat notes file written in the present tense, weighs
the hardest decision from one seat, changes nothing about the environment, and
never turns "I check in every few days" into a schedule
(`practice/baselines/red-chief-fury.txt`, 2/2). Each section below closes one
of those.

## 0. On invoke

1. **The wiki.** `.skillator/wiki/<goal-slug>/` unless the goal already has
   one. Agree the location with the owner before the first write; headless,
   take the default and log it as a ruling.
2. **Query before acting.** Read `index.md` and every page it points at for
   the request in hand. A new goal → write `index.md` and a `goal.md` page
   (what the owner asked, verbatim, dated) first.
3. **The open set.** `tickets-zordon` for the board, `relay-morpheus` for an
   unfinished run. Cite them from the wiki; never copy them into it.

## 1. Two tracks, every turn

- **Tactical** - finish the task in front of you.
- **Strategic** - change the environment so the *next* task goes better:
  a lint rule or test that makes the wrong thing fail, a `CODING_STANDARDS.md`
  line a reviewer can enforce, a narrower API, a data source an agent needs
  (logs, a test database, a browser). **No workarounds**: a deviation from the
  repo's conventions is fixed, or ticketed, before feature work builds on it.

Every strategic finding becomes a ticket through `tickets-zordon` - in the
same turn, with the wiki page that explains it cited on the row. A risk left
as a sentence in a reply or another ticket's body ("ship this with that, not
before") is a
finding that dies with the session; a ticket or a failing check does not.

## 2. Work goes out, pointers come back

The chief's context is the goal's memory; spend it on decisions, not edits.

| Work | Goes to |
|---|---|
| Tasks to build, one fresh implementer each | `tasks-sentinels`, inside a `relay-morpheus` run (background agents, so the owner can keep talking to you) |
| A feature that needs design first | `build-jarvis`, as an agent |
| A review of a diff | `code-review:code-review` |

**The brief is pointers, not prose.** Name the ticket id, the wiki page, the
commit sha, the run file and stage - never paste history the pointer already
holds. **The report back is pointers too**: the sha, the run-file line, the
test count. A tiny edit with nothing to delegate is still allowed in-session;
say so in one line.

## 3. The wiki - history, never the present

Pages: `index.md` (every page, one line each, grouped) plus one page per
**decision**, recurring **problem**, **subsystem** or owner **preference**,
linked to each other. Sources (tickets, commits, run files, transcripts,
agent reports) are cited, never copied in.

- **Date every claim**: "On 2026-10-25 the owner decided ...".
- **Pin code claims to a commit**: "As of `a1b2c3d`, the worker retries 3
  times." Never "currently", "now" or "is" about code without
  a date or sha beside it.
- **Supersede, never rewrite**: a change is a new dated claim, and the old one
  is marked `Superseded <date> by <link>` and left in place.

Three operations: **ingest** (a decision, an owner correction, an agent's
finding → every page it touches, and the index, in the same turn), **query**
(before every decision), **lint** (contradictions, orphans, missing links,
claims a newer commit overtook - suggested as a schedule, §5).

**Load [references/wiki.md](references/wiki.md)** before the first write: the
page shapes and the lint checklist.

## 4. Decisions - score, then one seat or a board

Score each decision before answering it: **1, +1 for each** - touches 2+
domains · hard to reverse (a data format, a schema, a public API, a delete) ·
the seats are expected to disagree · it changes what people who use the thing
do · a security or compliance angle.

| Score | Then |
|---|---|
| 1-2 | Decide it yourself, or one role agent; a ruling in the wiki |
| 3 | Two role agents, synthesized |
| 4+ | **Board meeting** - up to 5 role agents, one turn each, in parallel |

The board's synthesis has exactly four parts, in order: **Agree** · **The
disagreement** (named, each side's reason, what it is really about) · **Actions**
(at most 5, each owned) · **The owner's decision** (one question, two or three
options with trade-offs, your recommendation labelled). The chief never
resolves the disagreement it surfaced - that is the owner's call.

The owner's decision is **parked on disk, not left in a reply**: its wiki page
(status `open`) always; `relay-morpheus park` too when a run is open; several
at once → `holo-r2d2`'s decision wizard (`--decisions`). The page carries the
score, the synthesis and, once answered, the dated outcome.

**Load [references/board.md](references/board.md)** before convening one: the
seats, the brief, the loop rules and a worked synthesis.

## 5. Schedules

The owner checking in "every few days" is a schedule. Suggest it, do not
assume it: `/loop` for an in-session check while you wait on agents,
`/schedule` (a routine) for a recurring board-plus-wiki-lint pass. A host with
neither → say so and name the command the owner would run instead.

## 6. Everything else routes

Standing rules the owner states → `rules-orko`. Tickets → `tickets-zordon`.
Staged work and parked questions → `relay-morpheus`. Drawing a run or the
decisions → `holo-r2d2`. The session ending → `handoff-cortana` (it points at
the wiki; the wiki is not the handoff). Restraint on every diff → `code-yoda`.

## Red flags

| You are thinking | Reality |
|---|---|
| "It's quicker if I just make these edits myself" | Every edit spends the goal's memory. Send it out; keep the pointer. |
| "One HANDOFF.md with a log is enough" | A flat file in the present tense goes stale on the next commit. Index, pages, dates, shas. |
| "The owner can answer inline in the notes" | That overwrites the question. The answer is a new dated claim; the question stays. |
| "I'll put the options and my lean on the ticket" | The board is status. The deliberation is a wiki page; the ticket cites it. |
| "My pros-and-cons table is enough for this format choice" | Hard to reverse, several stakeholders: score it. 4+ is a board. |
| "It's fine either way, so no disagreement to show" | Then the board will say so. You don't get to close it from one seat. |
| "The risk is in my reply; they'll read it" | A finding in a reply dies with the session. Ticket it. |
| "They said they'd check in; that's their schedule" | Suggest `/loop` or `/schedule`. |

## Related

- `references/wiki.md` - page shapes, ingest, lint
- `references/board.md` - scoring, seats, synthesis
- `practice/baselines/red-chief-fury.txt`, `green-chief-fury.txt`

Credits (both MIT, read as sources, rewritten for skillator): the two tracks,
background agents and context pointers, and the dated goal wiki come from
Matt Pocock's `chief-of-staff` (`mattpocock/skills`,
`skills/in-progress/chief-of-staff`); the complexity score, the board meeting,
its loop rules and the four-part synthesis come from Alireza Rezvani's
`chief-of-staff` (`alirezarezvani/claude-skills`,
`c-level-advisor/skills/chief-of-staff`).
