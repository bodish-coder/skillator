# code-yoda debt — the ledger of deliberate shortcuts

Every deliberate shortcut carries a `shortcut:` comment — or the older
`ponytail:` spelling, still honoured — naming its ceiling and the trigger that
calls it back (SKILL.md §3). This mode collects them into one
ledger so a deferral cannot quietly become permanent — and so the ones with no
trigger are named as such, because nothing else will ever call them back.

## Scan

Comment markers in code only, both spellings in one pass:

```
git grep --untracked -nE '(#|//|--|;|%|<!--|/\*|^\s*\*).*\b(shortcut|ponytail):' -- ':(icase,exclude)*.md' ':(icase,exclude)*.txt' ':(icase,exclude)*.rst' ':(icase,exclude)*.adoc' ':(icase,exclude)*.jsonl' ':(icase,exclude)*.log'
```

`git grep --untracked` searches tracked and new files but honours `.gitignore`,
so `node_modules`, `.git` and build output stay out; outside a git repo use
`grep -rnE` with `--exclude-dir` for each. Add the comment prefix of any other
language in the tree. In stylesheets and `<style>` blocks, `#shortcut:hover`
and `--shortcut: 4px` are a selector and a property, not markers — drop them at
the read-the-line step below; `/* shortcut: … */` there is a real marker. A plain `TODO` or
`HACK` names no ceiling, so it is not this ledger's — list those on request,
never as ledger rows or board tickets. Docs are excluded by path (docs,
transcripts, logs), not by prefix — a Markdown bullet `* shortcut:` is prose
about the convention, never a marker, while ` * shortcut:` inside a `/* */`
block is code. Every hit is one ledger row unless reading the line shows it is
not a deferral in code — a string literal, a test fixture's text, a comment
describing the convention itself, or `shortcut:` meaning a keyboard shortcut
(`// shortcut: Ctrl+K opens the palette`); drop those and name them in one line
under the ledger. A real marker skipped is a shortcut that just became
permanent.

## The ledger

One row per marker, grouped by file, printed in exactly this shape — the
labels `ceiling:` and `trigger:` and the separators are literal, never
renamed ("Limit:", "When to revisit:") or reworded:

```
<file>:<line> — <what, in the comment's words>. ceiling: "<quoted>". trigger: "<quoted>".
<file>:<line> — <what, in the comment's words>. ceiling: "<quoted>". trigger: no-trigger.
```

The first form when the comment names a trigger, the second when it does not.

Two filled rows, one of each kind:

```
worker.js:42 — fixed 3 retries, no backoff. ceiling: "fixed 3 retries, no backoff". trigger: "add jittered backoff if the API starts rate-limiting".
billing.py:7 — global lock. ceiling: "global lock". trigger: no-trigger.
```

- **what** — the shortcut, in the comment's own words.
- **ceiling** — the limit the comment names, quoted from it. A comment that
  names only the shortcut (`shortcut: global lock`) is its own ceiling:
  quote the whole comment; never write "not stated".
- **trigger** — the revisit condition **quoted from the comment**, or the
  literal tag `no-trigger` when the comment names none. The slot holds the
  author's words or the tag; nothing else can fill it. A trigger composed by the
  run ("I suggested switching to a multi-threaded server as the trigger") is the
  run's opinion wearing the author's comment, and it hides the exact rot this
  mode exists to expose. The comment did not say when to come back; the ledger
  says so too.

An owner per row, when asked: `git blame -L<line>,<line> <file>`.

Last line, literal: `<N> markers, <M> no-trigger.` (for the two rows above:
`2 markers, 1 no-trigger.`). Nothing found: `No shortcut debt. Clean ledger.`

## From ledger to board

The ledger is a report; the board is `TICKETS.md`, and only
`skillator:tickets-zordon` writes it. Each row goes through that skill's gate —
"someone should edit X so that Y" — and the gate shapes the row by its trigger:

| Row | Ticket it becomes |
|---|---|
| trigger quoted | `[>] A<n> — <what>: <ceiling> (deferred: <trigger>)` — deferred, off the board until the trigger arrives |
| `no-trigger` | `[ ] A<n> — set a revisit trigger for <what> (<file>:<line>)` — **pending**: the missing trigger is the change someone makes; the shortcut itself is not ticketed until one exists |

A `no-trigger` row never becomes a `[>]` with a trigger the run supplied. If
the user wants a trigger decided now, that is a question to the user
(`AskUserQuestion`, the candidates as options), and the answer lands in the
comment first, then on the board.

## Scope

Reads and reports. Changes nothing in the code. To persist the ledger outside
the board, write it to the file the user names (`CODE-YODA-DEBT.md` if they do not).
One-shot.
