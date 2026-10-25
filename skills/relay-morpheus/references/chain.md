# Chaining ticket workflows — the procedure

A chain is a relay run whose stages are ticket workflows, each started by the
previous one's completion notification. Design: `docs/plans/PLAN-relay-chain.md`.
The commands below are `hooks/relay-morpheus.sh chain …` (PowerShell:
`relay-morpheus.ps1 -Mode chain -Action … -N …`); `RM` stands for
`sh <SKILL>/hooks/relay-morpheus.sh`, `UW` for
`sh <skills>/watch-cortana/hooks/usage-watch.sh`. They are page shorthand only:
type the full `sh "<path>" …` every time, never `RM=…; $RM …` — Claude Code's
permission check refuses a command whose variable it cannot read (seen in the
F31 GREEN run).

## When it applies

The user asks to work the open tickets as a sequence of workflows — "work every
open ticket in staged workflows", "keep going on your own", "auto-start the next
workflow", "next stage" — or a resume lands on a run file with a `## Chain`
section. A board of 1-3 tickets is `tickets-zordon` plain dispatch, not a chain.

## Step 1 — plan from the board (main session, before anything is dispatched)

```sh
grep -nE '^\s*- \[[ ~%!?]\]' TICKETS.md
```

1. `[ ]` and `[~]` go in. A `[~]` stamped by another session's tag is skipped
   with a ruling. `[%]` (waiting on a test result) and `[?]` (waiting on a
   person's decision) are open but not planned — list them in the run file as
   owed, and plan one only once its result or decision is in. `[>]` is never
   planned and never re-checked.
2. `[!]` rows: read `(blocked: …)`. Names a ticket that is now `[x]`, or a
   file/condition the tree satisfies (check the tree, not the text) → flip it
   to `[ ]` and put it in a **later** stage than what unblocked it. Otherwise
   leave it out and say so. `(blocked: RUN-n Qk)` resolves only when Qk is
   `replanned` or `moot` (`RM chain status` shows `## Decisions`).
3. Name the files per ticket (ticket text plus one grep). Same-file tickets are
   one item or different stages — never two agents in one stage.
4. Tier each ticket per seat (`tickets-zordon` table): `A110 deep/build`.
5. One stage = one Workflow call, at most six items, ordered by dependency
   then age. The last stage is always `verify review bump commit push`, owned
   by the main session. A stage that needs another's output gets `--after <n>`.
6. A ticket whose spec leaves a user-owned choice open → `RM park` it now
   ([marathon.md](marathon.md), Park); it joins no stage until answered.

Write every stage to the run file, then plan every work stage with its exact
prompt, **before the first dispatch**:

```sh
RM init TICKETS.md "drain the board" "B2+B3 books" "F2+F5 report, F3 cli" "verify review bump commit push"
printf '%s\n' "<the exact per-item prompts the script will send>" > .skillator/chain-66.txt
RM chain plan 66 --tickets "B2,B3" --fix build --verify build --files shelf/books.py --prompt-file .skillator/chain-66.txt
```

`init` printed the run's worktree (`stages work and commit in: ...`): every
prompt file says "work and commit in <worktree> (branch run/RUN-<n>-...),
never in the main checkout", and pastes this paragraph verbatim (A126 - a
background agent cannot ask for approval, so a command shape the host gates
is simply lost):

> In the worktree, run one plain command per call, by absolute path - never
> `cd` (or `Set-Location`) into it first. Git: `git -C "<worktree>" status`,
> `git -C "<worktree>" add <paths>`, `git -C "<worktree>" commit -m "..."`.
> Tests: `python -m pytest "<worktree>/tests"` (or the project's runner with
> the worktree path as its argument). No `&&` chains, no `$(...)`, no heredocs;
> read and edit files with the file tools, not shell redirection. The final stage merges that branch into main
from the main checkout, then removes the worktree and the branch. A `LEASED`
refusal (exit 2) means another run's stage holds one of this stage's files:
`chain next` lists it `IDLE <n> leased ...`; dispatch something else and come
back after that run lands. Ticket boxes are flipped with `RM board <ID> <mark>`
- the main checkout's board, under its lock.

`chain plan` allocates the 4-character code (`next-id.sh --runs .skillator W`),
prefixes it to the stage cell, and appends a block under `## Chain`. It refuses
without a prompt file and never reissues a code. Repeat for each work stage;
the final main-session stage needs no block. Without a Workflow tool, add
`--mode agents`.

Print the plan once — stages, codes, tickets, tiers, agent count, tickets left
out and why. A request that said "work the board in stages / keep going" is
the opt-in; "plan" stops here. No "shall I continue?" afterwards.

## Step 2 — dispatch a stage

Read usage first — before **every** dispatch, the first one included. A
reading the user gave in the prompt counts too; the higher of the two wins:

```sh
RM chain decide   # HOLD <pct> → step 4 now, dispatch nothing; RELEASE → go on
RM chain dispatch 66 --driver @cc-<6 chars of this session id> --owner build:opus
```

`dispatch` reads usage itself too. It refuses (exit 2) while `hold:` is set,
at or over the 5-hour hold without `--override` (the user asked; a ruling),
past the 7-day stop without `--confirmed`, while another driver's stamp is
under 20 minutes old (`--take` overrides, with a ruling), and on a stage that
is not pending or failed. `UNOBSERVABLE` dispatches, with a one-line note on
stderr. The checks and the claim are one lock hold: two sessions dispatching
one stage get one winner and one exit 2. On success it sets the row `~`,
copies the planned prompt verbatim into an In-flight block, and prints the code
and the prompt. Then:

1. Flip the stage's tickets to `[~]` with the session tag; grep them back.
2. Call `Workflow` with the `work-tickets` script shape from `tickets-zordon`;
   every fix and verify prompt carries the marathon.md paste-in paragraph,
   and the VERDICT schema its `parked` field.
   `meta.name: 'chain-<CODE>'`, every agent `label: '<CODE> fix:B2'` /
   `'<CODE> verify:B2'`, `args` = the items with tiers. **An F ticket's item is
   a `build-jarvis` pass** (F39), not a bare fix agent: its prompt opens with
   "Load skillator:build-jarvis" and the ticket, and build-jarvis grades,
   designs and builds it - B and A tickets keep the fix/verify shape.
3. Edit the In-flight block's `run: -` to the `runId` the tool returned — no
   command fills it. The prompt on disk is the truth; the id is a same-session
   hint for `resumeFromRunId`.

**Several in flight (F37).** `RM chain next --all` prints one `NEXT` line per
stage that can start now - its after: stages landed, its files disjoint from
every stage in flight and from the others it names, held by no decision and no
other run's lease - capped by usage: 2 below 50 % of the 5-hour window, 1 at or
above it or unobservable (`RELAY_CHAIN_PARALLEL` overrides). Dispatch each
(one dispatch and one Workflow/Agent call per stage). A stage left out says
why: `IDLE <n> slots`, `IDLE <n> parallel-files <m>`, `IDLE <n> inflight-files
<m>`; dispatch refuses a stage that shares files with one in flight, and one
with no `files:` never runs beside anything. A stage dispatched while another
is in flight gets its own worktree off the run branch - dispatch says so on
stderr and writes `worktree:`/`branch:` into its In-flight block; its prompt
must say to work and commit there. Each stage is landed by Step 3 when **its
own** notification arrives - the others keep running - and before its `stage x`
run `RM chain merge <n>`: it merges the stage branch into the run branch and
removes the stage worktree. Exit 3 is a conflict: the merge is aborted, the
stage is `!`, and a retry stage is planned on the merged branch. Then
`chain next --all` again fills the free slots.
`chain next --holds` (A118) prints only the `IDLE <n> Qk <why>` lines and
writes nothing - no lease beat, no lock - for readers such as holo-r2d2.

`mode:` in the Chain header names what actually ran: `workflow` for a Workflow
call, `agents` for Agent fan-out. A run file that says `workflow` while Agents
were used is a lie the next session believes — fix it with
`RM chain plan … --mode agents` at planning time, or by editing the header.

## Step 3 — between stages (the completion notification is the event)

Run every line, in order, before the next dispatch:

1. Read the returned array; read `<transcriptDir>/journal.jsonl` before
   believing an empty one. `null` → ticket stays `[~]`, said in the ruling.
   `passed:false` → `[ ]` with the `why` on the line. `passed:true` → `[x]`
   only when the evidence names a check that ran. The main session flips the
   board; no agent does. A verdict with `parked` → marathon.md (Park) first:
   `RM park` before anything else; `parked.stop` not `none` is a stop, now.
2. Regression sweep, then `code-review:code-review` on the staged diff; fix
   findings via a fix agent (3-pass cap). Usage pressure lowers the level,
   never the call: `/code-review low` is the floor. Reading the diff yourself
   is not a review - "to save usage I reviewed it myself" lands nothing.
3. Commit with the ticket-first message and the code trailing:
   `B2 B3: <what> [<CODE>]`. No review result from step 2, no `x`: the stage
   stays `~`. Then `RM stage 66 x build:opus <sha>`, which drops
   the stage's In-flight block (`>` does too). No passing ticket →
   `RM stage 66 '!'`, block kept with the failure appended, chain continues;
   one retry stage per ticket via `RM add`.
4. Republish the board artifact once (`tickets-zordon`).
5. `Ruling:` line — `<CODE>: <what the verdicts decided, what was dropped>;
   review <level>: <n> findings, <fixed|none>`.
6. Usage read, every stage, no exception:

   ```sh
   UW level        # src=<claude-code|codex|none> 5h=<pct|-> 7d=<pct|-> ctx=<pct|-> max=<pct|->
   RM chain decide # RELEASE <pct> | HOLD <pct> | HOLD <pct> 7d | UNOBSERVABLE
   ```

   `HOLD … 7d` → stop #4: `watch-cortana`'s 7-day order runs, and the hold is
   also written (step 4 below) so a resume knows why. `HOLD <pct>` → step 4.
   `UNOBSERVABLE` → say "usage: unobservable on this host" once in the plan,
   `usage: unobservable` in each ruling, and continue — no hold is possible.
7. Blocked re-check (step 1.2); a newly unblocked ticket → `RM add "<stage>"`,
   then `chain plan` it with its own prompt file.
8. Re-read the board; dropped or someone-else's `[~]` tickets leave the item
   list with a ruling. Then `RM chain next`: `NEXT` → step 2; `HOLD` → step 4;
   `ASK` / `UNBLOCK` → [marathon.md](marathon.md) (The end batch, Unblock)
   before anything final; `WAIT` → a stage is in flight, wait for its
   notification; `BLOCKED` → stages wait on a failed one: retry it (step 3.3)
   and close the failed row `>` naming the retry, or report it; `FINAL` → the
   main-session stage: review, version bump, commit; the push asks on its own,
   after the batch.

## Step 4 — the 80 % hold

```sh
RM chain hold 84 --window 5h --next 67       # writes `hold: <since> 84% 5h next=67`
```

Write it before arming anything; it is idempotent and keeps the first `since`.
Start nothing. On Claude Code arm the listener under the **Monitor** tool:

```sh
RM chain wait --for 1500                      # --for 540 in a -p / headless run
```

Exit 0 `RELEASE <pct>` → `RM chain release`, ruling, dispatch `next`.
Exit 5 `WAITING` → the arm's cap is spent; re-arm the same command.
Exit 3 `STUCK` → ruling, one more arm, then `AskUserQuestion` with the reading.
Exit 4 `UNOBSERVABLE` → release; the hold should never have been written.
Exit 2 `STOP <pct> 7d` → the 7-day window, not the 5-hour one: it will not refill
while you wait. Stop #4 — TaskStop the Monitor and hand off; a dispatch past it
needs `--confirmed`, never `--override`.
Hosts without Monitor record the hold, say "held at 84 %; say *next stage*, or
`continue RUN-<n>` later", and end the turn.

The hold is a wait, not a stop: no session handoff is written for it (that is
`watch-cortana`'s 92 % order). The threshold is `RELAY_CHAIN_HOLD_PCT` (80).

## Override — "next stage", "go on", "don't wait" while held

```sh
UW level
RM chain release --override                   # refused with exit 2 past 7d 90 %
```

Under the 7-day stop: TaskStop the Monitor, ruling `override: user asked at
<pct>%` (the command writes it), then `RM chain dispatch <n> … --override` —
dispatch re-reads usage, and the reading is still over 80 %. At or over 7-day 90 %:
`AskUserQuestion` — "7-day window at 91 % — the hard stop. Start <CODE>
anyway?" with *Hold (recommended — the window does not refill for days)* first.
Only the explicit yes runs `RM chain release --override --confirmed` and
`RM chain dispatch <n> … --confirmed`.

## Crash and resume

`RM list` (the SessionStart hook) names the run; `RM resume <id>` prints the
whole file, `## Chain` included. A `~` row is a stage that *started*: check the
tree, then redispatch from the In-flight prompt (or `resumeFromRunId` when the
id is this session's). `hold:` set → `UW level`; under → `RM chain release` and
dispatch `next`; over → `RM chain hold` again (same `since`) and arm the
listener. The driver's stamp is refreshed by its own `dispatch`, `heartbeat`,
`hold`, `release` and every `wait` poll, so a tag older than 20 minutes is a
driver that stopped, and may be taken.
Nothing is asked but the parked queue (`chain next` → `ASK`); the file is the plan.
