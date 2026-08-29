---
name: ticket-master
description: >-
  Serialised, Jira-style ticket IDs for AI coding chats — every user-reported bug
  is B1, B2, B3…, every feature F1, F2, F3…, and every issue the agent itself
  finds (runtime errors, analysis, review) A1, A2, A3…, with sub-parts as B7a/B7b,
  all recorded in a
  single shared TICKETS.md at the repo root so nothing is forgotten across chats,
  sessions, or teammates on the same branch. Use when the user reports a bug or
  asks for a feature, says "log this", "what's pending", "ticket", "B3", "F12",
  "next ticket number", "mark it done", "A4", "list tickets", "list tickets
  status", or when starting work and you need to know what's already open. Also use before closing a session to sync statuses. It
  allocates IDs by scanning the file (never reusing a number), keeps status as
  pending/in-progress/done, and appends rather than renumbering so parallel
  teammates don't conflict. NOT an issue tracker replacement and NOT for
  syncing to real Jira/GitHub Issues. Same board as ticket-checker, but the open
  set is worked as a single deterministic Workflow script — one agent per ticket,
  fanned out and verified in one call. Prefer this one when several tickets are
  open at once or the user says "ultracode", "work the board", "use a workflow",
  "fan out agents".
---

# ticket-master — serialised tickets, worked as a workflow

One file, `TICKETS.md`, at the repo root. It is the source of truth. Bugs are
`B<n>`, features are `F<n>`, agent-found issues are `A<n>`, sub-parts are the
parent ID plus a letter (`B7a`).
Numbers are **never reused** and **never renumbered** — an ID means one thing
forever, in commits, branch names, and chat.

## The file

Create it if missing, with exactly this shape:

```markdown
# TICKETS

Legend: `[ ]` pending · `[~]` in-progress · `[!]` blocked · `[x]` done · `[-]` cancelled
IDs are permanent — never reuse or renumber. Append new tickets at the end of
their section.

## Bugs

- [x] B1 — Login redirect loops on expired session
- [~] B2 — CSV export drops the last row
  - [x] B2a — off-by-one in the writer
  - [ ] B2b — add regression test
- [!] B3 — Avatar upload 500s over 5MB (blocked: needs S3 creds from ops)

## Features

- [ ] F1 — Dark mode
- [ ] F2 — Bulk delete in the table view

## Agent-found

- [ ] A1 — Unhandled promise rejection in the upload worker (runtime)
- [ ] A2 — `parseDate` silently returns Invalid Date on empty string (review)
```

Line format, kept greppable: `- [<status>] <ID> — <one-line title>`. Optional
trailing ` (@owner)` or ` (branch: x)` if the user wants it; nothing else.
Sub-parts are indented two spaces under their parent.

## Allocating an ID

1. Read `TICKETS.md` (create it from the template above if absent).
2. Next ID = highest existing number in that section + 1. Scan the *whole* file,
   including done tickets — done never frees a number.
3. On a shared branch, also check for uncommitted/incoming edits before
   allocating: `git fetch && git diff HEAD origin/<branch> -- TICKETS.md`. If the
   remote has higher numbers, take the next one above those.
4. Sub-parts: next unused letter under that parent (`B2a`, `B2b`, …). Use them
   only when a ticket genuinely splits into separately-completable pieces.

**Collision rule:** if two teammates ever land the same number, the later commit
renames its ticket to a fresh number and leaves ` (was B7)` on the line. Never
renumber the earlier one.

## When to log

- User reports a bug → log a `B` ticket before fixing.
- User asks for a feature/change of any size → log an `F` ticket before building.
- **Anything Claude/an agent finds itself → an `A` ticket.** A stack trace in a
  test run, a crash while driving the app, a bug spotted during review or
  analysis, an unrelated problem hit mid-task: log it as pending and keep going.
  `A` means "nobody asked for this, we found it" — it is what keeps discoveries
  from dying with the chat.

Trivial one-line edits the user asked for inline don't need a ticket. If in
doubt, log it — a pending line is cheap.

## Working a ticket

- Starting → flip to `[~]`.
- Finished *and verified* (tests/build/manual check actually run) → `[x]`.
  Not verified, not done.
- Can't proceed — waiting on someone, a credential, an upstream fix, or another
  ticket → `[!]`, with ` (blocked: <what on>)` on the line. Blocked is still
  **open**: report it at session end, and unblock back to `[ ]` or `[~]` the
  moment the dependency clears. Never leave an agent spinning on a blocked
  ticket — flip it and move to the next one.
- Dropped — won't fix, obsolete, duplicate, or the user called it off → `[-]`,
  with a short ` — reason` on the line (`[-] B9 — Safari flicker (dup of B4)`).
  Cancelled is a closed state, not a deleted one: the line and its number stay.
- Reference the ID in commit messages: `B3: reject uploads over 5MB`.
- Cycle end / session end: re-read the file and correct any status that drifted,
  then report the open set (`[ ]` and `[~]`) to the user.

## Work tickets in parallel, not in a line

Flipping a ticket to `[~]` means **dispatch an agent for it**, one agent per
ticket, all in a single message so they run concurrently. Never work a queue of
tickets serially in the main session — that is the linear development this skill
exists to break.

- Give each agent its ticket ID, the one-line title, and the repo context it
  needs; tell it to report back what it changed and whether it verified.
- Only the main session edits `TICKETS.md` — agents report, you flip statuses.
  Two agents writing the same file is how you lose tickets.
- Tickets touching the same files are the one exception: run those sequentially,
  or hand the whole cluster to one agent, and say so.
- Sub-parts (`B2a`, `B2b`) are the unit to parallelise when a ticket is big.

## Workflow mode — working the board in one call

Dynamic workflows let you write a script that orchestrates many agents
deterministically: real control flow, structured results, a resumable run. That
is the difference between `ticket-master` and `ticket-checker` — same board,
scripted dispatch.

**Switch to workflow mode when any of these hold:**

- **4+ open tickets** to work in this cycle (real fan-out).
- The tickets are a sweep — the same change across N files, an audit, a codemod.
- You want each fix **adversarially verified** before flipping it to `[x]`.
- The user asked: **"ultracode"**, "use a workflow", "work the board", "fan out
  agents", "orchestrate this with subagents".

**Stay with plain dispatch when:** 1-3 tickets, tickets needing your judgement
between them, or a host with no `Workflow` tool. Off `claude-code`, workflow mode
is a *pattern* — emulate it with the host's parallel delegate mechanism and don't
claim a `Workflow` call happened. See `WORKFLOW.md` beside the installed skills
for the host table.

**Never start a workflow the user didn't opt into.** A workflow can spawn dozens
of agents; if the board is big and they didn't ask, say what it would cost first.

### The shape

Scout inline first — read `TICKETS.md`, pick the tickets for this cycle, group
same-file tickets into one item — then pass that list as `args` and let the
script fan out. `pipeline()` is the default: ticket B is being verified while
ticket C is still being fixed.

```js
export const meta = {
  name: 'work-tickets',
  description: 'Fix and verify each open ticket, one agent per ticket',
  phases: [{ title: 'Fix' }, { title: 'Verify' }],
}
const VERDICT = { type: 'object', properties: {
  id: {type: 'string'}, passed: {type: 'boolean'}, why: {type: 'string'} },
  required: ['id', 'passed', 'why'] }

const results = await pipeline(
  args,                                    // [{id: 'B3', title: '…'}, …]
  t => agent(`Fix ticket ${t.id}: ${t.title}. Report what you changed and how ` +
             `you verified it. Note any unrelated problems you hit.`,
             { label: `fix:${t.id}`, phase: 'Fix' }),
  (fix, t) => agent(`Ticket ${t.id} — "${t.title}". An agent reports: ${fix}
` +
                    `Verify against the repo. Default to passed=false if unproven.`,
             { label: `verify:${t.id}`, phase: 'Verify', schema: VERDICT })
)
return results.filter(Boolean)
```

### Rules that don't bend

- **The workflow never edits `TICKETS.md`.** Agents report; the main session
  flips statuses after the call returns. Concurrent writes to the board is
  exactly how tickets get lost.
- **Flip to `[~]` before the call, to `[x]`/`[!]` after** — from the returned
  verdicts, not from optimism. `passed: false` → the ticket stays open, and its
  `why` goes on the line or becomes a new `A` ticket.
- **Same-file tickets are one item**, not two — group them when you build `args`,
  or give them `isolation: 'worktree'` if they must run apart.
- **Anything an agent finds along the way is an `A` ticket.** Ask for it in the
  fix prompt, log the ones that come back.
- **A `null` result means the agent died or was skipped.** `.filter(Boolean)`,
  then leave that ticket `[~]` and say so — never silently drop it to done.
- **Say what you dropped.** Capping the cycle at N tickets is fine; reporting it
  as "worked the board" when 12 were open is not.

## Fetching state

Whole board: read `TICKETS.md`. Just the open ones:

```
grep -nE '^\s*- \[[ ~!]\]' TICKETS.md
```

`[x]` and `[-]` are the closed states, so neither shows up there; `[!]` does.

When the user says a bare ID ("do B3", "what's F12"), grep for it and act on
that line.

## Showing the board

Two views. **By type is the default** — `list tickets`, "what's pending", "show
the board", "what's open". **By status** when the user says so — `list tickets
status`, "status wise", "group by status", "what's in progress".

Either way: checkbox lines, the same shape the file uses. Never a prose summary,
never a markdown table, never a numbered list.

### By type (default)

```
Bugs
  [~] B2 — CSV export drops the last row
    [ ] B2b — add regression test
  [!] B3 — Avatar upload 500s over 5MB (blocked: needs S3 creds from ops)

Features
  [ ] F1 — Dark mode
  [ ] F2 — Bulk delete in the table view

Agent-found
  [ ] A1 — Unhandled promise rejection in the upload worker

3 open · 1 blocked · 8 done
```

### By status (`list tickets status`)

Same lines, regrouped. Sections in this order — **in-progress first**, because
that is what someone asking for a status view wants to see:

```
In progress
  [~] B2 — CSV export drops the last row

Blocked
  [!] B3 — Avatar upload 500s over 5MB (blocked: needs S3 creds from ops)

Pending
  [ ] B2b — add regression test (B2)
  [ ] F1 — Dark mode
  [ ] F2 — Bulk delete in the table view
  [ ] A1 — Unhandled promise rejection in the upload worker

3 open · 1 blocked · 8 done
```

A sub-part shown away from its parent carries the parent ID in trailing
parentheses — `(B2)` — since the indentation that explained it is gone. Include
`Done` and `Cancelled` sections only when closed tickets were asked for.

### Rules for both views

- **Copy the line, don't rewrite it.** ID and title exactly as they appear in
  `TICKETS.md`, so the user can grep for what they just read.
- **Open only, by default** (`[ ]`, `[~]`, `[!]`). Closed tickets on request
  ("show everything", "what did we finish") — then `[x]` and `[-]` too.
- **Drop empty sections.** No "Features: none", no empty `Blocked`.
- **Blocked shows its reason**; that is the whole point of `[!]`.
- **One count line after the list** — `3 open · 1 blocked · 8 done` — and nothing
  else. No commentary on the board's health, no suggested next ticket unless
  asked.
- Legend only if the user seems new to the board, and then one line.

## Rules

- **One file, repo root, committed.** It travels with the branch; that is how
  teammates and future chats see it.
- **Append, never rewrite.** New tickets go at the end of their section; edits
  touch only the one line being changed. Keeps merge conflicts to single lines.
- **IDs are permanent.** No reuse, no renumbering, no deleting done tickets —
  delete a ticket only if it was logged in error (say so to the user).
- **Status reflects reality.** `[x]` means verified, not "should work". `[-]`
  means deliberately closed without doing it — never use it to hide a ticket
  that is still real, and `[!]` is not a parking space: it names what it waits on.
