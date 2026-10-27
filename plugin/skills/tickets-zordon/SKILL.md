---
name: tickets-zordon
description: >-
  Use when the user reports a bug or asks for a feature, says "log this",
  "what's pending", "ticket", "B3", "F12", "A4", "next ticket number", "mark
  it done", "block it", "defer it", "cancel it", "list tickets", "list tickets
  status", "sync tickets", "assign F12 to @asha", "ultracode", "use a workflow",
  mentions TICKETS.md, or when starting work and you need the open set. Also
  at session end, to sync statuses. NOT an issue tracker or Jira/GitHub sync;
  NOT for harvesting `ponytail:` markers (`code-yoda`).
---

# tickets-zordon — serialised tickets, worked as a workflow

One file, `TICKETS.md`, at the repo root. It is the source of truth. Bugs are
`B<n>`, features are `F<n>`, agent-found issues are `A<n>`, sub-parts are the
parent ID plus a letter (`B7a`).
Numbers are **never reused** and **never renumbered** — an ID means one thing
forever, in commits, branch names, and chat.

## The file

Create it if missing, with exactly this shape:

```markdown
# TICKETS

Legend: `[ ]` pending · `[~]` in-progress · `[%]` testing · `[!]` blocked · `[?]` pending decision · `[>]` deferred · `[x]` done · `[-]` cancelled
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
trailing ` (@owner)` or ` (branch: x)` if the user wants it, and the
`[app: ..] [decide: ..] [owner: ..] [by: ..]` tags of **Apps and people** before it; nothing
else. Sub-parts are indented two spaces under their parent.

The title comes first and is short: at most 60 characters, a name the owner
recognises, ending at the first `. ` or ` (` — /pending cuts it there — and the
detail follows. Write the title before the spec.
Good: `- [ ] F12 — CSV export. The table view gets an Export button; ...`.
Bad: `- [ ] F12 — The table view gets an Export button that writes the filtered rows ...`
(the title is the whole spec, and /pending shows a cut sentence).
`check-tickets.sh` warns on every open line whose title is over 60 or empty.

## Who touched it

Several agent sessions edit one board, so every line says which one last moved
it, for whom, and how (F109): ` (@cc-k7q2:asha:direct)` - `(@<sid>:<owner>:<mode>)`.

- `<sid>` is `<agent>-<code>`, the code 4 characters from your session id -
  `ticket-meta session` prints it. Lowest available rung wins:
  1. **Session id** — Claude Code's (`CLAUDE_CODE_SESSION_ID`) → `cc-<code>`.
     Stable for the session, free, no state to keep.
  2. No session id in your harness → `SKILLATOR_SESSION=@<agent>-<4 chars>` for
     the session, or the branch: ` (branch: fix/upload)`.
  3. Both the same across your sessions → ask the user once for a name
     (`@cc-ui`, `@codex-api`) and use it for the rest of the session.
- `<owner>` is `whoami` without `@`, or `-` with no team / me unknown.
- `<mode>` is how the work ran: `direct` (you, at the prompt), `agent` (a
  subagent - say `SKILLATOR_MODE=agent` on its ticket-meta calls), `run`
  (relay-morpheus flipped it), `workflow` (a marathon / Workflow script's run).

Agent prefix: `cc` Claude Code, `cx` Codex, `ag` Antigravity, `pi` Pi, `cu` Cursor.

ticket-meta stamps it on every write when it knows your session; a line you
create or flip by hand gets the same tag — replace the previous one, don't
accumulate them; the line says who moved it last, not its whole history. Old
`(@cc-a4f1c9)` tags stay valid: the session alone. Leave a human `@owner` alone.

Two sessions want the same `[ ]` ticket: the one whose tag is already on a `[~]`
row owns it. If a row you are working flips under you, stop and tell the user —
that is two sessions on one ticket, not a merge to resolve.

## Apps and people

A ticket can say which apps it touches, who must decide it, who implements it
and who built it — trailing tags on its one line, in this order, before the
session tag:

```
- [ ] F12 — Bulk delete [app: web, api] [decide: @vidul] [owner: @asha] [by: @vidul, @asha] (@cc-k7q2:asha:direct)
```

Every tag is optional and lines without them stay valid; never add an empty one.

- **People** are `@handles` from `.skillator/team.md`, one per line:
  `- @vidul: vidul@ikran.in, other@x.com`. No team file = no people: no
  `decide`/`owner`/`by` tags, no assigning, nothing about people in a list.
- **Apps** are the workspace folders: `apps/*`, `packages/*`, `services/*`, and
  the package manager's workspaces (`package.json` `"workspaces"`,
  `pnpm-workspace.yaml`); each folder name is an app. No such folder = no apps.
- `decide` = the person who must make a decision on it. `owner` = the person
  who implements it. `by` = authors of commits whose subject
  names the ID as a word (`F1` never matches `F12`), mapped to handles; an email
  not in the team file shows as the email. `app` = apps those commits' files
  sit in; it may be hand-set or corrected on the line.

`scripts/ticket-meta.sh` beside this file does all of it (Windows:
`ticket-meta.ps1`, same arguments) and edits only the one line, every other byte
kept, in the main checkout's `TICKETS.md`:

```sh
sh <skills>/tickets-zordon/scripts/ticket-meta.sh apps            # app names
sh <skills>/tickets-zordon/scripts/ticket-meta.sh app-of <path>.. # app of a path
sh <skills>/tickets-zordon/scripts/ticket-meta.sh by F12          # who built it
sh <skills>/tickets-zordon/scripts/ticket-meta.sh apps-of F12     # apps it touched
sh <skills>/tickets-zordon/scripts/ticket-meta.sh assign F12 @asha   # implements it
sh <skills>/tickets-zordon/scripts/ticket-meta.sh decide F12 @asha   # must decide it
sh <skills>/tickets-zordon/scripts/ticket-meta.sh decided F12        # decision made
sh <skills>/tickets-zordon/scripts/ticket-meta.sh testing F12 owner live check  # [%], waits on that test
sh <skills>/tickets-zordon/scripts/ticket-meta.sh tested F12 pass    # [%] -> [x]; fail -> [~]
sh <skills>/tickets-zordon/scripts/ticket-meta.sh done F12 RED/GREEN 3/3, abc1234  # [x] + tag, ` **Done <date>: ..**`
sh <skills>/tickets-zordon/scripts/ticket-meta.sh block F12 S3 creds from ops     # [!] ` (blocked: ..)`
sh <skills>/tickets-zordon/scripts/ticket-meta.sh defer F12 after the parser rewrite  # [>] ` (deferred: ..)`
sh <skills>/tickets-zordon/scripts/ticket-meta.sh tag F12         # write app + by
sh <skills>/tickets-zordon/scripts/ticket-meta.sh whoami          # F80: my @handle; F109: + session: @<sid>  mode:
sh <skills>/tickets-zordon/scripts/ticket-meta.sh iam @asha       # F92: this session's owner
sh <skills>/tickets-zordon/scripts/ticket-meta.sh stamp F12       # F109: the (@sid:owner:mode) tag only
sh <skills>/tickets-zordon/scripts/ticket-meta.sh session         # F109: <sid> <mode>
sh <skills>/tickets-zordon/scripts/ticket-meta.sh pick F12 F14    # F80: pick / skip <ID> <owner>
sh <skills>/tickets-zordon/scripts/ticket-meta.sh claim F12       # F80: [owner: <me>], box kept
sh <skills>/tickets-zordon/scripts/ticket-meta.sh team lead @asha # F80: set / hand over the lead
sh <skills>/tickets-zordon/scripts/ticket-meta.sh reconcile       # F81: read-only, `ID [now] -> [proposed]  reason`
sh <skills>/tickets-zordon/scripts/ticket-meta.sh unblock F12     # F81: [!] -> [ ], the blocked note dropped
sh <skills>/tickets-zordon/scripts/ticket-meta.sh start F12       # F81: [ ] -> [~]; F106: claims an unowned ticket to me, says when another owns it
```

The team file is kept with `ticket-meta team add @h "Name" email[,email]`,
`team remove @h` and `team list`. A member line is `- @handle: a@x, b@y`, with an
optional indented `  name: Full Name` line directly under it. `team remove` warns,
and still removes, when open tickets still name the handle.

**Roles, me, claims (F80).** The format, in full:

```
# Team
lead: @vidul

- @vidul: vidul@ikran.in
  name: Vidul
- @asha: asha@x.com
```

- **One lead**: the one `lead: @handle` line under `# Team` (a team file without
  it is valid: no lead). Everyone else listed is a member. `team lead @h` sets it
  when there is none, or hands it over when *me* is the lead; `team lead -` clears
  it (the lead only). `team remove` of the lead is refused until it is handed over.
  `team list` marks ` [lead]` and ` (you)`.
- **Me**: `ticket-meta whoami` reads, in order, this session's owner (F92:
  `ticket-meta iam @handle`, asked at session start by grayskull-power's arm,
  kept in git-ignored `.skillator/sessions/<sid>.owner` - line 1 the handle,
  line 2 `session: <id>`, a file naming another session ignored; the sid from
  `SKILLATOR_SESSION`, else Claude Code's session id → `cc-<4-char code>`), then
  `SKILLATOR_ME=@handle`, then this repo's git `user.email` through the team
  emails. A handle not on the team is refused. No match → `not on the team: add
  <email> to .skillator/team.md`.
- **Claims**: planning or dispatching a ticket (relay-morpheus `chain plan` /
  `chain dispatch`, `/pending-subagent`, `/marathon-plan`) runs
  `ticket-meta claim <ID>...` — `[owner: <me>]`, the box kept. A ticket already
  owned by someone else is reassigned (`assign` or `claim`) only by that owner or
  the lead; anyone else is refused, the refusal naming both. Not on the team →
  claims are refused (`add <email> to team.md`).
- **Picking**: `ticket-meta pick [IDs]` prints `you: <me>` then `pick <ID>`
  (unassigned, or mine) or `skip <ID> <owner>` per ticket (no IDs: every `[ ]`
  `[~]` `[!]` ticket). Runs take only the picked; a skipped one is listed as
  skipped with its owner, never run. Not on the team → only unassigned tickets.
  No team file → every ticket is picked and nothing is claimed, as before.
- These checks are a **team convention, not security**: git's email is self-set
  and anyone can edit `team.md` or `TICKETS.md` by hand. They stop honest
  mistakes - two people running one ticket - not a determined teammate.

**An assignment reopens the ticket.** Whoever it moves to, it must not stay
closed, deferred or in someone else's progress:

- **"assign F12 to @asha"**, "assign it to asha" → `assign`: sets or replaces
  `[owner: ..]` and the box becomes `[ ]`, from any state.
- **"assign it for a decision to @asha"**, "Asha decides F12" → `decide`: sets or
  replaces `[decide: ..]` and the box becomes `[?]`, from any state.
- **"decided"**, "Asha decided F12" → `decided`: `[?]` back to `[ ]`; the
  `[decide: ..]` tag stays as the record. It refuses a ticket that is not `[?]`.
- The same handle again for the same kind, with the box already `[ ]` (assign)
  or `[?]` (decide), changes nothing and says `no change`; any other box still
  moves.
- Moving a `[~]` ticket keeps its trailing session tag `(@cc-…)` or `(@cc-…:…:…)` beside the new
  `[owner:]`/`[decide:]` — which session works it and who owns it are different
  facts — and warns which session was working it; tell that session its box
  moved. A relay lease is per stage and is released when that stage lands or fails.
- Both refuse a handle not in the team file — say so, and offer to add the
  person there; never invent one.
- `assign` of a ticket someone else owns is refused unless *me* is that owner
  or the lead (F80, above) — say who may, never edit the line by hand around it.
- **`tag <ID>`** when a ticket is closed (`[x]`), and when commits naming it land
  (a merge, a pull). It recomputes `app` and `by` from the commits; with none it
  leaves a hand-set `app` alone.
- **`done`, `block`, `defer`** (F64) set `[x]`, `[!]`, `[>]` from any box but a
  cancelled `[-]`; `block` and `defer` also refuse a done `[x]` (reopen with
  `assign`). `block`/`defer` replace an earlier `(blocked: ..)` or
  `(deferred: ..)` note — the line says only the current wait — and the same
  text again on the same box says `no change`. Tags, other notes and the session
  tag stay; leaving `[~]` warns like `assign`.
- Every edit prints the edited line — that is the read-back. All write under
  `TICKETS.md.lock`, the lock relay-morpheus's `board` flip takes, and refuse
  after 30 s rather than break someone else's.
- Tags go before the trailing `(..)` groups and before a bare `Plan: S<n>`, so
  `check-tickets.sh` still sees that pointer.

## Allocating an ID


Never take "highest on my board + 1" by hand: two worktrees or sessions that do
not share a `TICKETS.md` both get the same number. Run the allocator from the
repo root; it prints the number and reserves it before you write the line:

```sh
sh "$PRACTICE/scripts/next-id.sh" A       # --peek A: look without reserving
```

`$PRACTICE` is the `practice/` beside the installed skills — resolve it exactly as
`practice/task-loop.md` resolves `taskwork.sh` (Windows: `next-id.ps1 A`,
`-Peek`). It takes 1 + the max of the local board and its archive (done and
archived tickets count — closing never frees a number), both files on every local and remote-tracking ref, and a
counter in the clone's common git dir shared by every worktree, under a lock.
Cross-machine is best-effort: it sees only refs you have fetched, so `git fetch`
first on a shared branch. Sub-parts (`B2a`, `B2b`, …) are the next unused letter
under the parent, by hand — only for genuinely separate pieces.

**Collision rule:** if two teammates ever land the same number, the later commit
renames its ticket to a fresh number and leaves ` (was B7)` on the line. Never
renumber the earlier one. In a merge, "earlier" is the receiving branch: its IDs
never move; the incoming side's do.

**The board ships with the work.** `TICKETS.md` (and `TICKETS-archive.md`) is
committed in the same commit as the change it describes and pushed with it —
never held back, never gitignored. A board that stays local is a board the next
clone allocates against blind.

**Arm the merge guard — once per clone, when this skill arms.** Git hooks and
merge drivers live in `.git/`, not in the repo, so a `git pull` does not bring
them; run this the first time you touch the board in a clone (idempotent —
re-running only refreshes it, so run it every session that arms):

```sh
sh "$PRACTICE/scripts/renumber-tickets.sh" --install
```

It copies the script into the clone's common git dir and wires a `tickets` merge
driver for `TICKETS.md` and `TICKETS-archive.md` (two branches that both appended
merge as the union, not a conflict; two edits of one ticket stay a conflict) plus
`post-merge` and `pre-commit` hooks. From then on a plain `git pull` or `git merge`
that brings in an ID the receiving branch already has ends correct with no manual
step: the incoming ticket takes the next free number (archive included) with
` (was F2)`, its sub-parts move with it, references are rewritten only in files
the incoming side changed, and the change lands **in the merge commit**, its
`map:` lines appended to the message and to `.git/skillator/renumber.log`. If
`core.hooksPath` points outside the clone it installs the driver only and says so
— never write into a shared hooks dir. `git pull --rebase` and cherry-pick are
not covered; `merge-smith` runs the same script itself. On a diverged branch a
bare `git pull` stops before merging unless `pull.rebase` is set, so pull with
`--no-rebase` (or `git config pull.rebase false`) for the guard to run.

A teammate who never runs a skill has no driver and no hooks: their pull either
conflicts on the board or merges both `F2` lines silently. `check-tickets.sh`
below is what catches it, and `renumber-tickets.sh` (inside the merge, before its
commit) is the fix.

**Detect it at merge time.** Git merges the append-only board by keeping both
sides of an `A43` conflict — the obvious resolution and the wrong one. **After
any merge, rebase, or cherry-pick that touched `TICKETS.md`, and before
committing one:** `sh "$PRACTICE/scripts/check-tickets.sh" TICKETS.md` — name
the board to check another; bare, it checks the current git repo's top-level `TICKETS.md` (`./TICKETS.md` outside git). It fails on
duplicate IDs and committed conflict markers and prints the offending lines. A
clean board is a precondition for allocating, not a nicety.

## When to log

- User reports a bug → log a `B` ticket before fixing.
- User asks for a feature/change of any size → log an `F` ticket before building,
  then **invoke `skillator:build-jarvis`** with that ticket. The board logs;
  build-jarvis grades, designs and builds. Never build an `F` ticket inline here.
- **Anything Claude/an agent finds itself → an `A` ticket, if it passes the gate
  below.** A stack trace in a test run, a crash while driving the app, a bug
  spotted during review: log it as pending and keep going. `A` means "nobody
  asked for this, we found it" — it is what keeps discoveries from dying with
  the chat.

A non-feature one-line edit the user asked for inline (typo, comment, rename,
formatting) needs no ticket and goes direct. A feature of any size is an `F`.

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

- Starting → `ticket-meta start <ID>`: `[~]`, an unowned ticket claimed to you (F106), your session tag stamped (F109; a subagent prefixes `SKILLATOR_MODE=agent`), see **Who touched it**.
- Finished *and verified* (tests/build/manual check actually run) → `[x]`,
  via `ticket-meta done <ID> [evidence]`: the box `[x]`, the `tag` a close owes,
  and, when evidence is given, ` **Done <YYYY-MM-DD>: <evidence>**` before the
  session tag (it replaces an earlier Done note). The evidence is one line with
  **no parentheses and no `*`** — ticket-meta refuses them — so write a commit,
  a test result or a quote without them: `RUN-0017 stage 110, bd408c6`, not
  `(RUN-0017, bd408c6)`; `sweep PASS 8/8`, not `**PASS** (8/8)`. It refuses a
  cancelled `[-]` ticket - reopen it with `assign` first.
  Not verified, not done.
- Built, but the verifying test has not run yet and is not yours to run now —
  an owner's live check, a GREEN on another host, a CI run → `[%]` testing,
  via `ticket-meta testing <ID> <what test>`, which writes
  ` (testing: <what test>)` on the line (one line, no parentheses). Testing is
  **open**: report it at session end, and never build on it as if done. It
  leaves only on the result: `ticket-meta tested <ID> pass` → `[x]`,
  `tested <ID> fail` → back to `[~]` to fix; the `(testing: ..)` note stays as
  the record. Not for a test you can run yourself this turn — run it.
- Can't proceed — waiting on someone, a credential, an upstream fix, or another
  ticket → `[!]`, with ` (blocked: <what on>)` on the line, via
  `ticket-meta block <ID> <what on>`. Blocked is still
  **open**: report it at session end, and unblock back to `[ ]` or `[~]` the
  moment the dependency clears. Never leave an agent spinning on a blocked
  ticket — flip it and move to the next one.
- Waiting on a person's decision (which option, whether to do it at all) →
  `[?]` pending decision, via `ticket-meta decide <ID> @who` so the line names
  who decides. Pending decision is **open**, like blocked: report it at session
  end, never build it before the decision, and flip it to `[ ]` with
  `ticket-meta decided <ID>` once the answer is in.
- Postponed by choice — not now, waiting on a condition that isn't a hard
  dependency (a later milestone, a build that hasn't run, hardware not on the
  bench) → `[>]`, with ` (deferred: <until what>)` on the line, via
  `ticket-meta defer <ID> <until what>`. Deferred is
  **not open and not closed** — it is off the board until the condition
  arrives: not pending (nobody is picking it up next), not blocked (nobody owes
  you anything), not cancelled (it will be done). Report it at session end as
  its own line, and flip it back to `[ ]` when the condition arrives.
- Dropped — won't fix, obsolete, duplicate, or the user called it off → `[-]`,
  with a short ` — reason` on the line (`[-] B9 — Safari flicker (dup of B4)`).
  Cancelled is a closed state, not a deleted one: the line and its number stay.
- Reference the ID in commit messages: `B3: reject uploads over 5MB` — that
  subject is how `by` and `app` find the work. Closing it → `tag <ID>`
  (**Apps and people**).
- **A board edit is not done until you have read it back.** After every status
  flip, `grep -n '<ID>' TICKETS.md` and report from *that output*, never from the
  edit you believe you made. An edit whose hunk is missing from `git diff` is a
  failed flip, not a done one — silent no-ops are routine here, because
  `TICKETS.md` is UTF-8 and full of em dashes, so any tool that reads it as
  cp1252 (a bare Python `open()` on Windows) matches nothing and changes
  nothing while exiting 0. Read, write and compare it as UTF-8.
- Cycle end / session end: re-read the file and correct any status that drifted,
  then report the open set — every open box: `[ ]`, `[~]`, `[%]`, `[!]` and
  `[?]` — to the user.
- Once the turn's edits are read back, republish the artifact board — see
  **The artifact board**. Board changed, artifact stale, is a bug.

## Draining the board

Pending rows are not immortal, and a rising pending count is a symptom to
diagnose — not a backlog to admire. Run a drain **before any handover, release,
or mergeprep-oracle**, and whenever a single session has added more pending rows than
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
status flip — never by deletion; the archive below moves closed rows, it never
drops one.

Report the drain as a count: `pending 12 → 5 (3 already fixed, 3 not work, 1 dup)`.

### Archive what has stayed closed

A board that keeps every closed row grows until reading it costs more than the
work it tracks. **Archive every time this skill arms** — the first board read of
a session, before reporting the open set — and again at the end of a drain or
release. A step left to "the end of a drain" never runs; this board reached
110 KB that way.

```sh
sh "$PRACTICE/scripts/archive-tickets.sh" --dry-run   # list what would move
sh "$PRACTICE/scripts/archive-tickets.sh"             # move it
```

Moved anything → run `check-tickets.sh`, then commit `TICKETS.md` and
`TICKETS-archive.md` **together, in their own commit** (`tickets: archive N
closed`), and push them with the session's next push. One without the other is
a clone that loses tickets or reuses IDs. Moved nothing → say nothing.

`[x]` and `[-]` rows closed more than 14 days ago (`--days N`) move to
`TICKETS-archive.md` beside the board, under the same section heading. The
closing date is the commit that flipped the status, read from git — lines carry
no date. A parent stays until it and every sub-part are closed and old enough,
then they move together. The archive is committed with the board and never
edited by hand.

Sessions read only `TICKETS.md`. The allocator, `check-tickets.sh` and the
artifact board read both files, so an archived number is never reused and a
duplicate across the two still fails. For an old ID the board does not show,
`grep -n '<ID>' TICKETS-archive.md` before saying it does not exist.

### Sync what is in progress (`/sync-tickets`)

`[~]` collects rows that are really done, waiting on a test, stuck or parked,
because nothing flips them back; `[!]` and `[ ]` rows go stale the same way. On
`/sync-tickets` (or "sync tickets"), walk **every** `[!]`, `[ ]` and `[~]` row —
or only the IDs given as arguments — and propose the status it really has.
**Propose from evidence, never invent it.**

0. **Start from `ticket-meta reconcile [IDs]`** (F81, read-only - the ops
   board's `c` key runs the same rule). It prints `ID [now] -> [proposed]
   reason` per row with evidence: a `[!]` whose `(blocked: ..)` names tickets
   all `[x]` → `[ ]`; a check owed by the owner or a team (a `(testing: ..)`
   note, a live check, a release build, a device / rig / hardware, a team to
   confirm) with the code landed → `[%]`; a run stage on it failed, or silent
   a day → `[!]`; landed → `[%]`; a `[ ]` with commits on main led by its ID
   (`F81:`, not `board:` ones) → `[~]`. Landed is the ticket's last run stage
   `x`, or with no stage a commit; a `[!]` still blocked on an open ticket is
   never `[%]`. A row it keeps says "evidence unclear". It never proposes
   `[x]` and skips a `[~]` row with a session tag. Its rows go in the table as
   they are; steps 1-2 add what it cannot see (`[x]`, `[>]`, `[?]`, a `[~]`
   the line shows done).
1. For each `[~]` row read its line and its notes (`Done = ..`, `Progress ..`,
   `Owed ..`, `blocked`, `waiting on`), then `git log --oneline -F --grep=<ID>`
   (keep only subjects naming the ID as a word — `F1` is not `F12`) and any
   practice/baselines file or run file (`.skillator/run-*.md`) the line cites.
2. Propose exactly one:

   | Proposal | Only when |
   |---|---|
   | `[x]` done | the line's Done criterion is shown met by named evidence — a commit, a test result, an owner confirmation quoted on the line. Cite it, and write it without parentheses or `*` (see step 4). |
   | `[%]` testing | built, and a named test or check is still owed (an owner's live check, another host's GREEN, a CI run) — ` (testing: <what>)` |
   | `[!]` blocked | it cannot proceed until something outside it lands — ` (blocked: <on what>)` |
   | `[>]` deferred | postponed by choice until a condition — ` (deferred: <until what>)` |
   | `[?]` decision | it waits on a person's choice — name who decides |
   | stays `[~]` | still being worked: a session tag on the line (`(@cc-a4f1c9)` or `(@cc-k7q2:asha:run)`, any agent prefix, any shape — reason "worked by @cc-a4f1c9"), a commit naming it in the last 24 hours, or a run stage on it dispatched and not done |
   | stays `[~]`, "evidence unclear" | anything else. Unsure is not done. |

   A `[~]` row carrying a session tag is held by that session: it stays `[~]`
   ("worked by @cc-xxxx") and is **never** proposed for another status, whatever
   its notes or commits say — unless the user names that ID in the command's
   arguments or in the answer.

3. Show **one table** — `ID | now -> proposed | reason (the evidence, one line)`
   — then ask **once**: accept all / pick (which IDs) / none. No question tool
   on the host → print the choices as a numbered list and stop.
4. **Apply only the accepted rows, and only on the user's answer.** Headless
   (`claude -p`, a chained or relay stage), or the question comes back
   unanswered → propose only, apply nothing, and say `applied: none (headless)`.
   - `[%]` → `ticket-meta testing <ID> <what test>`.
   - `[?]` → `ticket-meta decide <ID> @who`. With no `.skillator/team.md`
     (decide refuses) do **not** flip the box by hand: leave the row `[~]` and
     say in the report who decides and that `decide` needs a team file. Only if
     the user then asks for it: `ticket-meta team add @who "Name" <email>`
     (it creates the team file), then `decide`.
   - `[x]` → `ticket-meta done <ID> <the evidence>` (it tags the ticket too),
     the evidence written without parentheses or `*`.
   - `[!]` → `ticket-meta block <ID> <on what>`.
   - `[!]` → `[ ]` → `ticket-meta unblock <ID>`; `[ ]` → `[~]` → `ticket-meta start <ID>`.
   - `[>]` → `ticket-meta defer <ID> <until what>`.
   - Never hand-edit a box ticket-meta has a subcommand for.
   - Stamp your session tag on every flipped row (**Who touched it**) - ticket-meta does it when it knows your session.
5. Read the board back — `grep -n '<ID>' TICKETS.md` for every applied ID —
   run `sh "$PRACTICE/scripts/check-tickets.sh"`, and report from that output: `in progress 14 -> 6
   (3 done, 2 testing, 1 blocked, 1 deferred, 1 decision)`.

### Verify what is in testing (`/verify-subagent`)

`[%]` says built, a check owed. On `/verify-subagent` (or "verify the testing
tickets"), re-check **every** `[%]` row - or only the IDs given; a named ID not
in `[%]` is reported `not [%]` and skipped - against evidence obtained **now**,
never against the line's own claim.

1. **One fresh agent per ticket**, no session history, its own prompt: the ID,
   the line verbatim, the repo root. A read-only agent type where the host has
   one; no subagents on the host → check each ticket yourself in turn, same
   rules. The prompt says:
   - Read the line's Done criterion (`Done = ..`, the `(testing: ..)` note) and
     check every part of it: `git log --oneline -F --grep=<ID>` (subjects naming
     the ID as a word), the files and baselines it cites, and **run** the tests
     or checks it names. Evidence is what you saw this run, never a quote of the line.
   - **Read and run tests only** - never edit code, write or delete files in the
     repo, commit, or touch `TICKETS.md`. A check that would need an edit to run
     is not run: FAIL, "needs an edit to check".
   - Answer exactly `VERDICT: PASS|FAIL|OWNER` and `EVIDENCE: <one line>` (no
     parentheses, no `*`). PASS only when every part is shown met. Anything
     failing, missing or not runnable is FAIL, the line naming what failed.
     **OWNER** when any part needs the owner's own eyes - `testing: owner ..`, a
     live look, a picker or UI check, an account or credentials, a device - even
     if the rest passed.
2. **Apply each verdict** in the main session (agents report, you flip), with
   ticket-meta only - the owner's standing ruling, so no question first, headless included:
   - PASS → `ticket-meta verify <ID> pass <evidence>`: `[%]` → `[x]`, tagged as a
     close is, ` **Verified <date>: <evidence>**` on the line.
   - FAIL → `ticket-meta verify <ID> fail <what failed>`: stays `[%]`,
     ` (verify failed <date>: <what>)` on the line (it replaces an earlier one).
   - OWNER → nothing. Never flipped, never marked.
   - An agent that returns no verdict line is FAIL, "no verdict"; never PASS.
3. Read the board back - `grep -n '<ID>' TICKETS.md` per ticket - run
   `sh "$PRACTICE/scripts/check-tickets.sh"`, and report one table
   `ID | verdict | evidence` and the count: `testing 3 -> 2 (1 verified, 1 failed, 1 owner)`.

## Work tickets in parallel, not in a line

**An `F` ticket is built by `skillator:build-jarvis`, never here.** Before any
edit for one — logged a minute ago, picked from the board, or named in a
headless "work these tickets" — invoke build-jarvis with its id and title. Its
grade line is that ticket's tiering, its phases are the dispatch. **Several
`F` tickets are ONE build-jarvis pass**, one task block per ticket — never one
build-jarvis per ticket. "One agent per ticket" below means, for an `F`, that
ticket's build seat is one dispatched agent inside that pass: it gets the pass's
grade and its own task block, and implements only that (no regrade, no verify of
its own, never build-jarvis loaded as an orchestrator). "It is only a few lines"
is the grade's call (a `—` design seat, a cheap build), not a reason to skip it.
`B` and `A` tickets stay on this page's dispatch below.

Flipping a ticket to `[~]` means **dispatch an agent for it**, one agent per
ticket, all in a single message so they run concurrently (for `F` tickets,
build-jarvis's Phase 2 does that dispatch). Never work a queue of tickets
serially in the main session — that is the linear development this skill exists
to break.

- Give each agent its ticket ID, the one-line title, and the repo context it
  needs; tell it to report back what it changed and whether it verified (an F
  build seat: which of its task's tests it ran - the verify seat is not its).
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

**Ask the mode once before a sweep.** When this cycle has 4+ open tickets to
work, or the tickets are a sweep, settle how they run before the first `[~]`
flip or dispatch:

| Mode | What runs | Fits |
|---|---|---|
| **single** | One dispatched agent works the cycle's tickets in order — never the main session | Tightly coupled tickets, tickets sharing files |
| **per-task** | Plain dispatch: one agent per ticket, all in one message (above); same-file tickets stay one item | Independent tickets — the usual pick when nothing else fits |
| **workflow** | The script in "The shape" below; no `Workflow` tool → the host's parallel delegate, never claimed as a `Workflow` call | 4+ independent tickets or a sweep — costs the most tokens |

A sweep reached through relay-morpheus also offers **marathon** (its
`references/marathon.md`): the staged form of workflow that keeps going across
sessions.

Ask once: all three modes, your recommendation first (`AskUserQuestion`; no
such tool → a numbered list). Then **end your turn** — no `[~]` flip, no
dispatch, until the user answers. No question when the user already named a
mode ("ultracode", "use a workflow", "fan out agents", "one agent per ticket",
"single agent") — use it. No question when the mode was already answered this
turn (by the user, or by relay-morpheus's `references/marathon.md` entry) —
don't re-ask. No question when the run is headless, chained or inside a relay —
take your recommendation, capped at per-task unless the user named workflow,
and log `Ruling: mode <m> - <why> - <cost if wrong>`. Unasked, the most you
pick is per-task.

**`F` tickets in the sweep still go to ONE build-jarvis pass**, handed the
sweep's answer as a named mode, so the user is asked once.

**Recommend workflow when any of these hold:**

- **4+ open tickets** to work in this cycle (real fan-out).
- The tickets are a sweep — the same change across N files, an audit, a codemod.
- You want each fix **adversarially verified** before flipping it to `[x]`.
- The user asked: **"ultracode"**, "use a workflow", "fan out
  agents", "orchestrate this with subagents".

**Stay with plain dispatch when:** 1-3 tickets (no question — per-task, as
today), tickets needing your judgement between them, or a host with no
`Workflow` tool. Off `claude-code`, workflow mode
is a *pattern* — emulate it with the host's parallel delegate mechanism and don't
claim a `Workflow` call happened. See `WORKFLOW.md` beside the installed skills
for the host table.

**Never start a workflow the user didn't opt into.** A workflow can spawn dozens
of agents; if the board is big and they didn't ask, say what it would cost first.

**Several workflows in a row, each starting the next with a usage hold** —
"work every open ticket in staged workflows, keep going" — is `relay-morpheus` →
`references/chain.md`; the board rules on this page do not change there.

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

**`F` tickets in a workflow:** run ONE `skillator:build-jarvis` pass for all of
them first (grade + design, one task block per ticket) and take its grade line
as each item's tiers. The item's fix prompt is that ticket's task block plus the
design file path: the item agent is the build seat only — it does not load
build-jarvis, regrade, or verify its own work. The verify seat is unchanged.

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
grep -nE '^\s*- \[[ ~%!?]\]' TICKETS.md
```

`[x]` and `[-]` are the closed states, so neither shows up there; `[%]`, `[!]`
and `[?]` do.

When the user says a bare ID ("do B3", "what's F12"), grep for it and act on
that line — in `TICKETS-archive.md` if the board does not have it.

## The artifact board

Every board change gets published as an artifact — a private page on claude.ai
holding the whole board, so the user can open it from any device instead of
scrolling back for the last list. The chat list is still the primary answer; the
artifact is the durable copy.

`skills/tickets-zordon/board/artifact.mjs` bakes `TICKETS.md` into an
Artifact-shaped HTML file (no `<!doctype>`/`<html>`/`<body>` — the wrapper adds
those). From the repo root:

```sh
node <skills>/tickets-zordon/board/artifact.mjs            # ./TICKETS.md -> ./.tickets-board.html
node <skills>/tickets-zordon/board/artifact.mjs --selftest # parser + count-line check
```

`<skills>` is wherever tickets-zordon is installed (`~/.claude/skills`,
`~/.agents/skills`, …); in the skillator repo itself it is `skills/`. Add
`.tickets-board.html` to `.gitignore` — it is generated, never committed.

### Publish and republish

1. Regenerate: `node <skills>/tickets-zordon/board/artifact.mjs`
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
never a markdown table, never a numbered list. A line's `[app: ..]`, `[owner: ..]`
and `[by: ..]` tags show as they appear on it; a repo with none shows none.

Filters narrow either view and print it the same way; the count line then counts
what the filter kept:

- `list tickets app:web` — tickets whose `[app: ..]` names `web`.
- `list tickets @asha` — tickets where `@asha` is the `owner` or in `by`.
- `list tickets status app:web` — filters combine with the status view.

Both views also republish the artifact board and give its link once per session
(**The artifact board**). The chat list is the answer; the link is the copy the
user can open elsewhere.

**What's pending beyond the board** - "what's pending everywhere", "what's still
running", "anything unpushed": run `scripts/pending.sh` (Windows:
`pending.ps1`, same output) and paste what it prints. One report, plain ASCII
within 80 columns: the repo and its branch against the upstream; open tickets
grouped by status with ID, title and owner/session tag (pending capped at 10),
deferred as IDs; open relay runs marked `live` or `stale` (no `updated:` or
heartbeat stamp in the last 24 h) and the run queue; this repo's live
sessions; disk, memory, stale locks and any watchdog hold with its release
command; open tickets whose line says a GREEN is `owed`; and NEXT - the
`(testing: ...)` checks the owner owes and what the live runs are on.
`--kv` prints the same facts as `KEY=value` lines for tools (the ops-board mod);
`--machine` only the machine facts. It reads; it never edits the board.

**The board as a terminal app** - "open the board", "ops", a host with no
board pane: `ops` (on PATH after `install.sh`: `~/.local/bin/ops`; after
`install.ps1`: a `function ops` in the PowerShell profile) runs the same views
beside any CLI, from the repo or with the repo as its first argument. An agent
starts it with `ops --open`: a new tab of the current Windows Terminal window
(`wt -w 0 new-tab`), never a bare console window; no `wt` → it runs in place.
Without the shim: `sh <skills>/ops-board/ops/ops.sh <repo> --open` (Windows:
`powershell -NoProfile -ExecutionPolicy Bypass -File
<skills>\ops-board\ops\ops.ps1 -Repo <repo> -Open`), where `<skills>` is the
dir holding this skill - install copies `ops-board/` beside it; in this repo it
is `mods/ops-board/ops/`. It needs node 22.18 or newer; `ops --help` and
`mods/ops-board/README.md` give the launch lines per host. Its assign, decide and team writes go through `ticket-meta`,
like every other board write.

### By type (default)

```
Bugs
  [~] B2 — CSV export drops the last row
    [ ] B2b — add regression test
  [!] B3 — Avatar upload 500s over 5MB (blocked: needs S3 creds from ops)

Features
  [ ] F1 — Dark mode
  [ ] F2 — Bulk delete in the table view
  [?] F3 — Pick the chart library [decide: @asha]

Agent-found
  [ ] A1 — Unhandled promise rejection in the upload worker
  [>] A2 — `parseDate` returns Invalid Date on empty string (deferred: after the parser rewrite)

7 open (4 pending · 1 in-progress · 0 testing · 1 blocked · 1 pending decision) · 1 deferred · 9 closed (8 done · 1 cancelled) · 17 total
```

### By status (`list tickets status`)

Same lines, regrouped. Sections in this order — **in-progress first**, because
that is what someone asking for a status view wants to see — In progress,
Testing, Blocked, Pending decision, Deferred, Pending (this board has nothing
under test, so no Testing section):

```
In progress
  [~] B2 — CSV export drops the last row

Blocked
  [!] B3 — Avatar upload 500s over 5MB (blocked: needs S3 creds from ops)

Pending decision
  [?] F3 — Pick the chart library [decide: @asha]

Deferred
  [>] A2 — `parseDate` returns Invalid Date on empty string (deferred: after the parser rewrite)

Pending
  [ ] B2b — add regression test (B2)
  [ ] F1 — Dark mode
  [ ] F2 — Bulk delete in the table view
  [ ] A1 — Unhandled promise rejection in the upload worker

7 open (4 pending · 1 in-progress · 0 testing · 1 blocked · 1 pending decision) · 1 deferred · 9 closed (8 done · 1 cancelled) · 17 total
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
- **Open and deferred, by default** (`[ ]`, `[~]`, `[%]`, `[!]`, `[?]`, `[>]`) — every
  deferred ticket is listed, just counted apart. Closed tickets on request
  ("show everything", "what did we finish") — then `[x]` and `[-]` too.
- **Drop empty sections.** No "Features: none", no empty `Blocked`.
- **Blocked and deferred show their reason**; that is the whole point of
  `[!]` and `[>]`. Pending decision shows who decides — its `[decide: ..]` tag;
  testing shows what test — its `(testing: ..)` note.
- **The counts must add up, and the line must show its work.** Eight mutually
  exclusive states, two buckets and a loner:
  `open = pending + in-progress + testing + blocked + pending decision`
  (testing, blocked and pending decision are open, just waiting) ·
  `closed = done + cancelled` · deferred is **neither** — it stands alone
  between them, so it never inflates the open count someone is judging the
  week by · `total = open + deferred + closed`. Each bucket prints its own
  subtotal with the breakdown in parentheses, so the arithmetic is checkable on
  sight and blocked is never mistaken for a bucket beside open.
- **Always print all eight states, zeros included.** Never drop a term because
  it is `0`. `0 blocked` is information — it says nothing is stuck, which is
  exactly what someone scanning the board wants to know — and a fixed-shape line
  can be compared against last session's at a glance. An empty board still
  prints the full line:

  ```
  0 open (0 pending · 0 in-progress · 0 testing · 0 blocked · 0 pending decision) · 0 deferred · 0 closed (0 done · 0 cancelled) · 0 total
  ```
- **One count line after the list**, and nothing else. No commentary on the
  board's health, no suggested next ticket unless asked:

  ```
  7 open (4 pending · 1 in-progress · 0 testing · 1 blocked · 1 pending decision) · 1 deferred · 9 closed (8 done · 1 cancelled) · 17 total
  ```
- Legend only if the user seems new to the board, and then one line.

### Big boards (30+ open)

Long boards are where the list is *most* needed and most often ruined. Do not
compress by dropping titles. Compress by **showing less of the board, in full**:

1. **In-progress, testing, blocked and pending decision print in full, always.** However big the board,
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
   (in-progress, testing, blocked, pending decision, deferred, pending) then by number.
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
  delete a ticket only if it was logged in error (say so to the user). The one
  move is a merge collision, done by `renumber-tickets.sh`, ` (was X)` kept.
- **Committed and pushed with the work.** The board travels in the same commit
  as the change, never left behind locally.
- **Every edit is signed.** Create or flip a row, stamp your session tag on it,
  replacing the old one. An unsigned flip on a shared board is unattributable.
- **Status reflects reality.** `[x]` means verified, not "should work". `[-]`
  means deliberately closed without doing it — never use it to hide a ticket
  that is still real, and `[!]` is not a parking space: it names what it waits on.
- **The board must drain.** A ticket is a named change, never a finding — see
  the gate. If pending only ever grows, the bookkeeping has become the work:
  stop logging and run the drain.
