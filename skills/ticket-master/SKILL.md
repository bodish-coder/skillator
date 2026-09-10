---
name: ticket-master
description: >-
  Use when the user reports a bug or asks for a feature, says "log this",
  "what's pending", "ticket", "B3", "F12", "A4", "next ticket number", "mark it
  done", "block it", "defer it", "cancel it", "list tickets", "list tickets
  status", "ultracode", "work the board", "use a workflow", "fan out agents",
  mentions TICKETS.md, or when starting work and you need to know what's
  already open. Also before closing a session to sync statuses. NOT an issue
  tracker replacement and NOT for syncing to real Jira/GitHub Issues.
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

Legend: `[ ]` pending · `[~]` in-progress · `[!]` blocked · `[>]` deferred · `[x]` done · `[-]` cancelled
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
- [>] A2 — `parseDate` silently returns Invalid Date on empty string (deferred: after the parser rewrite)
```

Line format, kept greppable: `- [<status>] <ID> — <one-line title>`. Optional
trailing ` (@owner)` or ` (branch: x)` if the user wants it; nothing else.
Sub-parts are indented two spaces under their parent.

## Who touched it

Several agent sessions edit one board, so every line says which one last moved
it. Reuse the `@owner` slot — no new syntax: ` (@cc-a4f1c9)`.

Your tag is `@<agent>-<id>`, lowest available rung wins:

1. **Session id** — last 6 hex chars of your own session id, the one in your
   session URL / transcript filename (`…/session_01NBCBMW9fDHDn7WJtAALBGT` →
   `@cc-aalbgt`). Unique per session, free, no state to keep.
2. No session id in your harness → the branch: ` (branch: fix/upload)`.
3. Both the same across your sessions → ask the user once for a name
   (`@cc-ui`, `@codex-api`) and use it for the rest of the session.

Agent prefix: `cc` Claude Code, `cx` Codex, `ag` Antigravity, `pi` Pi, `cu` Cursor.

Stamp it when you **create** a ticket and when you **flip its status** — replace
the previous tag, don't accumulate them; the line says who moved it last, not
its whole history. Leave a human `@owner` the user set alone.

Two sessions want the same `[ ]` ticket: the one whose tag is already on a `[~]`
row owns it. If a row you are working flips under you, stop and tell the user —
that is two sessions on one ticket, not a merge to resolve.

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

**Detect the collision; do not hope someone spots it.** The board is append-only
precisely so git can merge it, and the cost of that is the one failure this file
cannot tolerate: two branches allocate `A43`, the merge conflicts at the same
append point, and whoever resolves it keeps both sides — which is the obvious
resolution and the wrong one. Now `A43` means two things and "do A43" is
ambiguous forever. **After any merge, rebase, or cherry-pick that touched
`TICKETS.md`, and before committing one:**

```sh
sh practice/scripts/check-tickets.sh          # or a path to the board
```

It fails on duplicate IDs and on committed conflict markers, and prints the
offending lines with their numbers. A clean board is a precondition for
allocating the next ID, not a nicety: allocating from a board with a duplicate
`A43` in it will hand out `A44` while two `A43`s remain.

## When to log

- User reports a bug → log a `B` ticket before fixing.
- User asks for a feature/change of any size → log an `F` ticket before building.
- **Anything Claude/an agent finds itself → an `A` ticket, if it passes the gate
  below.** A stack trace in a test run, a crash while driving the app, a bug
  spotted during review: log it as pending and keep going. `A` means "nobody
  asked for this, we found it" — it is what keeps discoveries from dying with
  the chat.

Trivial one-line edits the user asked for inline don't need a ticket.

### The gate — a ticket names a change, not a finding

A pending line is not cheap. It is a promise to whoever reads the board next,
and a board that grows faster than it drains stops being read at all — at which
point every row on it is worth nothing, including the real ones.

Before logging, say the change out loud in one sentence: **"someone should edit
X so that Y."** If you can't finish that sentence, it isn't a ticket:

| What you have | Where it goes |
|---|---|
| A change you can name, that nobody has made | Ticket. |
| Something true about the code that implies no edit | Say it in chat. Nothing to log. |
| A risk with no reproduction and no fix to try | Say it in chat, with what would settle it. Not a ticket. |
| Already fixed in the tree — you just found the fix | Nothing. |
| The same defect as an open row, seen from elsewhere | Nothing; that row already covers it. |
| Work you are about to do in this same turn | Do it. A ticket you close a minute later is noise. |

An agent's report is **input, not a row.** Reports arrive one per agent, so
converting each into a ticket inflates the board at exactly the rate you spawn
agents. Read the report, apply the gate to every item in it, and log the ones
that pass — normally fewer than were reported. Say in chat what you dropped and
why; that is the audit trail, not a row.

Two failure modes, both worse than a missing ticket: the same defect logged
three times because three agents saw it, and a row so vague nobody can tell
what "done" would mean. **If you can't write the closing condition, you can't
write the ticket.**

## Working a ticket

- Starting → flip to `[~]` and stamp your session tag — see **Who touched it**.
- Finished *and verified* (tests/build/manual check actually run) → `[x]`.
  Not verified, not done.
- Can't proceed — waiting on someone, a credential, an upstream fix, or another
  ticket → `[!]`, with ` (blocked: <what on>)` on the line. Blocked is still
  **open**: report it at session end, and unblock back to `[ ]` or `[~]` the
  moment the dependency clears. Never leave an agent spinning on a blocked
  ticket — flip it and move to the next one.
- Postponed by choice — not now, waiting on a condition that isn't a hard
  dependency (a later milestone, a build that hasn't run, hardware not on the
  bench) → `[>]`, with ` (deferred: <until what>)` on the line. Deferred is
  **not open and not closed** — it is off the board until the condition
  arrives: not pending (nobody is picking it up next), not blocked (nobody owes
  you anything), not cancelled (it will be done). Report it at session end as
  its own line, and flip it back to `[ ]` when the condition arrives.
- Dropped — won't fix, obsolete, duplicate, or the user called it off → `[-]`,
  with a short ` — reason` on the line (`[-] B9 — Safari flicker (dup of B4)`).
  Cancelled is a closed state, not a deleted one: the line and its number stay.
- Reference the ID in commit messages: `B3: reject uploads over 5MB`.
- **A board edit is not done until you have read it back.** After every status
  flip, `grep -n '<ID>' TICKETS.md` and report from *that output*, never from the
  edit you believe you made. An edit whose hunk is missing from `git diff` is a
  failed flip, not a done one — silent no-ops are routine here, because
  `TICKETS.md` is UTF-8 and full of em dashes, so any tool that reads it as
  cp1252 (a bare Python `open()` on Windows) matches nothing and changes
  nothing while exiting 0. Read, write and compare it as UTF-8.
- Cycle end / session end: re-read the file and correct any status that drifted,
  then report the open set (`[ ]` and `[~]`) to the user.
- Once the turn's edits are read back, republish the artifact board — see
  **The artifact board**. Board changed, artifact stale, is a bug.

## Draining the board

Pending rows are not immortal, and a rising pending count is a symptom to
diagnose — not a backlog to admire. Run a drain **before any handover, release,
or merge-prep**, and whenever a single session has added more pending rows than
it closed. (Both are checkable on the spot; "has it grown since last time" is
not — no prior count is stored anywhere.) A drain **re-verifies the pending rows
against the tree, not against their own text**:

- Fix is already in the tree → `[x]`, citing where. Reading the fix is not
  verifying it: `[x]` still means what it means above — run the check. If you
  can only see the code, leave it pending and say the fix looks present.
- No change can be named for it (it was an observation) → `[-] — (not work: <why>)`.
- Same defect as another row → `[-] — (dup of <ID>)`.
- Still real → leave it, and make the line name the change.

Sweep `[>]` rows in the same pass — that is where stale rows collect, since a
deferred row is off the board until a condition arrives and nothing checks
whether it already has. For each, ask only "has the condition arrived?": yes →
`[ ]`, no → leave it, never going to → `[-]`.

A row that states its defect confidently is still wrong if a later commit fixed
it, so check the code, never the wording. Rows leave the board only through a
status flip — never by deletion.

Report the drain as a count: `pending 12 → 5 (3 already fixed, 3 not work, 1 dup)`.

## Work tickets in parallel, not in a line

Flipping a ticket to `[~]` means **dispatch an agent for it**, one agent per
ticket, all in a single message so they run concurrently. Never work a queue of
tickets serially in the main session — that is the linear development this skill
exists to break.

- Give each agent its ticket ID, the one-line title, and the repo context it
  needs; tell it to report back what it changed and whether it verified.
- **Name a model for every dispatch — never let it inherit the session's, and
  grade the tier per ticket, not once for the batch.** Same table as workflow
  mode's scout (below); a mechanical fix and the agent judging it warrant
  different tiers, and so do two tickets in the same message.
- Only the main session edits `TICKETS.md` — agents report, you flip statuses.
  Two agents writing the same file is how you lose tickets.
- Tickets touching the same files are the one exception: run those sequentially,
  or hand the whole cluster to one agent, and say so.
- Sub-parts (`B2a`, `B2b`) are the unit to parallelise when a ticket is big.

## Workflow mode — working the board in one call

Dynamic workflows let you write a script that orchestrates many agents
deterministically: real control flow, structured results, a resumable run. Same
board as plain dispatch, scripted.

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
same-file tickets into one item, **and tier each one** — then pass that list as
`args` and let the script fan out. `pipeline()` is the default: ticket B is being
verified while ticket C is still being fixed.

#### Tier every ticket during the scout

A flat `model:` across the fan-out is the expensive mistake this section exists
to prevent: it pays deep-tier price for one-line fixes, or hands a contract
change to a cheap model that burns 3× the turns and fails anyway. **The scout
assigns a tier per ticket per seat** — you have already read the ticket, so
grading it costs nothing extra — and the script reads that off the item.

Grade the *fix* seat from the ticket's own text, using `PRACTICE.md` §4 and
`practice/task-loop.md` — the same table, applied per ticket:

| The ticket reads like | fix | verify |
|---|---|---|
| One file, mechanical, the change is named in the ticket | cheap | build |
| 1-2 files, complete spec, nothing to decide | cheap | build |
| Several files, integration or a shared contract | build | build |
| Cause unknown, design judgement, or "sweep every X" | deep | deep |
| Concurrency, auth, money, or a contract others depend on | build | **deep** |
| Re-run + grade a result against a written contract | — | **deep** |

Two rules that override the table:

- **build is the floor for any verify seat**, and for any fix seat whose ticket
  is prose rather than a named change. Turn count beats token price — a cheap
  model on under-specified work costs more, not less.
- **A `[!]`/`[>]` ticket is not tiered, it is not dispatched.** Tiering a ticket
  nobody can work is the cheapest agent of all to skip.

Say the tiering out loud before the call — one line per ticket, `id fix/verify` —
so the user can overrule a grade before it costs anything. Slugs below are Claude
Code's; on another host substitute that host's column from `PLATFORMS.md`
§ Role tiers, and record the substitution.

```js
export const meta = {
  name: 'work-tickets',
  description: 'Fix and verify each open ticket, one agent per ticket',
  phases: [{ title: 'Fix' }, { title: 'Verify' }],
}
const VERDICT = { type: 'object', properties: {
  id: {type: 'string'}, passed: {type: 'boolean'}, why: {type: 'string'} },
  required: ['id', 'passed', 'why'] }

// Tier -> slug for this host. One place to change when the host changes.
const M = { cheap: 'sonnet', build: 'opus', deep: 'opus' }

// Never a literal model: the scout put a tier on every item, and an item
// missing one is a scouting bug, not a reason to guess a default.
const tier = (t, seat) => M[t[seat]] || (() => { throw Error(`${t.id}: no ${seat} tier`) })()

const results = await pipeline(
  args,          // [{id: 'B3', title: '…', fix: 'cheap', verify: 'build'}, …]
  t => agent(`Fix ticket ${t.id}: ${t.title}. Report what you changed and how ` +
             `you verified it. Note any unrelated problems you hit.`,
             { label: `fix:${t.id}`, phase: 'Fix', model: tier(t, 'fix') }),
  (fix, t) => agent(`Ticket ${t.id} — "${t.title}". An agent reports: ${fix}
` +
                    `Verify against the repo. Default to passed=false if unproven.`,
             { label: `verify:${t.id}`, phase: 'Verify', schema: VERDICT,
               model: tier(t, 'verify') })
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
- **Anything an agent finds along the way goes through the gate**, same as
  anywhere else. Ask for findings in the fix prompt, then log the ones that name
  a change — not one row per report. Fan-out is where boards inflate: N agents
  reporting the same neighbourhood produce N rows for one defect unless someone
  reads them together.
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

## The artifact board

Every board change gets published as an artifact — a private page on claude.ai
holding the whole board, so the user can open it from any device instead of
scrolling back for the last list. The chat list is still the primary answer; the
artifact is the durable copy.

`skills/ticket-master/board/artifact.mjs` bakes `TICKETS.md` into an
Artifact-shaped HTML file (no `<!doctype>`/`<html>`/`<body>` — the wrapper adds
those). From the repo root:

```sh
node <skills>/ticket-master/board/artifact.mjs            # ./TICKETS.md -> ./.tickets-board.html
node <skills>/ticket-master/board/artifact.mjs --selftest # parser + count-line check
```

`<skills>` is wherever ticket-master is installed (`~/.claude/skills`,
`~/.agents/skills`, …); in the skillator repo itself it is `skills/`. Add
`.tickets-board.html` to `.gitignore` — it is generated, never committed.

### Publish and republish

1. Regenerate: `node <skills>/ticket-master/board/artifact.mjs`
2. Find the existing board — `Artifact` with `action: "list"`, look for the title
   `TICKETS · <repo>`. **The first publish of a session must look**, because
   publishing without a `url` from a conversation that did not publish it creates
   a *second* board and the user's link goes stale.
3. If `list` found one, `action: "read"` it at that `url` **before publishing**.
   A publish to an artifact this conversation has neither read nor published is
   refused, so skipping the read fails the first republish of every new session —
   which is exactly the session where step 2 found something.
4. Publish `.tickets-board.html` with that `url`. If `list` found nothing this is
   the board's first publish, so it needs a `favicon` (one or two emoji) and no
   `url` — that is the only publish that takes a favicon.
5. Later publishes in the same session just reuse the same file path: no `url`,
   no `favicon`, no re-read.
6. Give the user the link the first time it is published or found in a session,
   then stop repeating it — one line, after the ticket list.

Off `claude-code`, or with no `Artifact` tool: generate the file, say where it
is, and skip the publish. Never claim a publish that did not happen.

### When to republish

**After every board edit** — a new ticket, a status flip, a title correction, a
workflow's batch of verdicts. The board and the artifact are never allowed to
disagree.

One publish per turn, not per line: make all the `TICKETS.md` edits for this
turn, read them back, *then* regenerate and publish once. A workflow closing
eight tickets is eight edits and one publish. Also republish on `list tickets`
even when nothing changed, since that is when the user wants the link.

If the publish fails, say so and carry on — a failed publish never blocks the
ticket work, and the next edit will retry it.

## Showing the board

Two views. **By type is the default** — `list tickets`, "what's pending", "show
the board", "what's open". **By status** when the user says so — `list tickets
status`, "status wise", "group by status", "what's in progress".

Either way: checkbox lines, the same shape the file uses. Never a prose summary,
never a markdown table, never a numbered list.

Both views also republish the artifact board and give its link once per session
(**The artifact board**). The chat list is the answer; the link is the copy the
user can open elsewhere.

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
  [>] A2 — `parseDate` returns Invalid Date on empty string (deferred: after the parser rewrite)

6 open (4 pending · 1 in-progress · 1 blocked) · 1 deferred · 9 closed (8 done · 1 cancelled) · 16 total
```

### By status (`list tickets status`)

Same lines, regrouped. Sections in this order — **in-progress first**, because
that is what someone asking for a status view wants to see:

```
In progress
  [~] B2 — CSV export drops the last row

Blocked
  [!] B3 — Avatar upload 500s over 5MB (blocked: needs S3 creds from ops)

Deferred
  [>] A2 — `parseDate` returns Invalid Date on empty string (deferred: after the parser rewrite)

Pending
  [ ] B2b — add regression test (B2)
  [ ] F1 — Dark mode
  [ ] F2 — Bulk delete in the table view
  [ ] A1 — Unhandled promise rejection in the upload worker

6 open (4 pending · 1 in-progress · 1 blocked) · 1 deferred · 9 closed (8 done · 1 cancelled) · 16 total
```

A sub-part shown away from its parent carries the parent ID in trailing
parentheses — `(B2)` — since the indentation that explained it is gone. Include
`Done` and `Cancelled` sections only when closed tickets were asked for.

### Rules for both views

- **Copy the line, don't rewrite it.** ID and title exactly as they appear in
  `TICKETS.md`, so the user can grep for what they just read.
- **Never collapse a ticket to its ID.** `A295 A297 A299 A301` is not a board,
  it is a receipt — the reader has to grep every number to learn anything, which
  is the exact work the list was supposed to save. A ticket line is **ID + title,
  always**, no matter how many there are. A long title truncates at ~80 chars
  with `…`; it never disappears. If the board is too long to print, **page it —
  never abbreviate it** (below).
- **Open and deferred, by default** (`[ ]`, `[~]`, `[!]`, `[>]`) — every
  deferred ticket is listed, just counted apart. Closed tickets on request
  ("show everything", "what did we finish") — then `[x]` and `[-]` too.
- **Drop empty sections.** No "Features: none", no empty `Blocked`.
- **Blocked and deferred show their reason**; that is the whole point of
  `[!]` and `[>]`.
- **The counts must add up, and the line must show its work.** Six mutually
  exclusive states, two buckets and a loner:
  `open = pending + in-progress + blocked` (blocked is open, just stuck) ·
  `closed = done + cancelled` · deferred is **neither** — it stands alone
  between them, so it never inflates the open count someone is judging the
  week by · `total = open + deferred + closed`. Each bucket prints its own
  subtotal with the breakdown in parentheses, so the arithmetic is checkable on
  sight and blocked is never mistaken for a bucket beside open.
- **Always print all six states, zeros included.** Never drop a term because
  it is `0`. `0 blocked` is information — it says nothing is stuck, which is
  exactly what someone scanning the board wants to know — and a fixed-shape line
  can be compared against last session's at a glance. An empty board still
  prints the full line:

  ```
  0 open (0 pending · 0 in-progress · 0 blocked) · 0 deferred · 0 closed (0 done · 0 cancelled) · 0 total
  ```
- **One count line after the list**, and nothing else. No commentary on the
  board's health, no suggested next ticket unless asked:

  ```
  6 open (4 pending · 1 in-progress · 1 blocked) · 1 deferred · 9 closed (8 done · 1 cancelled) · 16 total
  ```
- Legend only if the user seems new to the board, and then one line.

### Big boards (30+ open)

Long boards are where the list is *most* needed and most often ruined. Do not
compress by dropping titles. Compress by **showing less of the board, in full**:

1. **In-progress and blocked print in full, always.** However big the board,
   that is what the person asking is actually working on and stuck behind.
2. **Pending prints in full up to 20 lines per section**, oldest first. Over
   that, print 20 and add one line naming the rest and how to see it:

   ```
   … 24 more pending in Agent-found — `list tickets A` for all of them
   ```
3. **Group by ID prefix, not by the heading the line sits under.** Append-only
   files drift: a `B68` logged during a burst of agent findings ends up under
   `## Agent-found` and stays there forever. The ID is the classification; the
   heading is just where the line happened to land. Sort within a group by status
   (in-progress, blocked, deferred, pending) then by number.
4. **`list tickets <prefix>`** (`list tickets A`, `list tickets B`) scopes to one
   type and prints it whole, no cap. That is the escape hatch the truncation line
   points at, so it must actually work.

The count line stays exactly the same — it already covers the whole board, which
is what makes truncating the list safe.

## Rules

- **One file, repo root, committed.** It travels with the branch; that is how
  teammates and future chats see it.
- **Append, never rewrite.** New tickets go at the end of their section; edits
  touch only the one line being changed. Keeps merge conflicts to single lines.
- **IDs are permanent.** No reuse, no renumbering, no deleting done tickets —
  delete a ticket only if it was logged in error (say so to the user).
- **Every edit is signed.** Create or flip a row, stamp your session tag on it,
  replacing the old one. An unsigned flip on a shared board is unattributable.
- **Status reflects reality.** `[x]` means verified, not "should work". `[-]`
  means deliberately closed without doing it — never use it to hide a ticket
  that is still real, and `[!]` is not a parking space: it names what it waits on.
- **The board must drain.** A ticket is a named change, never a finding — see
  the gate. If pending only ever grows, the bookkeeping has become the work:
  stop logging and run the drain.
