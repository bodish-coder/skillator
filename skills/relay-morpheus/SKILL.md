---
name: relay-morpheus
description: >-
  Use when work runs in stages and the session may not survive to their end —
  a multi-stage plan, subagent fan-out, a sleeping laptop, a dropping link, a
  usage limit.
  Also on "staged workflow", "work all open tickets in stages", "keep going",
  "auto-start the next workflow", "next stage", "pause at 80% usage",
  "marathon", "ask me everything at the end", "resume the run", or "what was
  in flight". NOT for writing a session handoff (`handoff-cortana`) and NOT
  for the board (`tickets-zordon`).
---

# relay-morpheus — staged runs that outlive the session

A staged run has two records. The transcript, which dies with the session, and
the tree, which does not. Everything that matters has to be in the second one
**while the run is still going**, because there is no guarantee you reach the
end to write it down.

## The rule

```
WRITE THE STAGE DOWN BEFORE YOU DISPATCH IT, NOT AFTER IT COMES BACK
```

This is the one thing this skill exists for, and it is the one thing three
isolated baseline runs did not do (`practice/baselines/scenario-relay-morpheus.txt`).
All three executed a four-stage plan end to end and left no on-disk record of
progress until the very last write — one left none at all. A session ending
anywhere before that leaves a working tree full of unattributed diff and no way
to tell which stages produced it, which were finished, or what was still
running.

Reading a mid-run tree is **not** this skill's problem. The companion baseline
(`scenario-relay-morpheus-resume.txt`) shows a fresh session doing that correctly
unprompted, against pressure to trust stale checkboxes. Relay adds nothing
there and says nothing about it.

**Violating the letter of this is violating the spirit of it.** "I'll record it
when the stage returns" is the failure, not a variation on it — the stages that
need recording most are the ones that never return.

## Handing a run to another session

Every run gets a short number when it is created, and `init` prints the
sentence that resumes it:

```
hand this to any session:  continue RUN-3
```

That sentence is the whole interface. A fresh session — another machine,
another host, a colleague — needs nothing else: **"continue RUN-3"**. It has no
transcript, so the ledger is what it reads, and the ledger is on disk because
it was written before the work, not after.

```sh
relay-morpheus.sh list          # every run, what is open, and its resume sentence
relay-morpheus.sh resume 3      # everything a session that has never seen it needs
relay-morpheus.sh 3 status      # any command takes the id first
```

`RUN-3`, `run-3` and `3` all resolve to the same run, because whoever types it
next is working from memory of a conversation rather than from a path. With one
run open and no id given, that run is assumed; with two or more, the script
refuses rather than guessing.

## The run file

`.skillator/run-<id>-<slug>.md`, one per run, in the repo. Markdown because a human and any
host both have to read it with no tooling. Git-tracked by default; a repo that
objects can `.gitignore` it and lose only the shared view, not the resume.

```markdown
# RUN-7 — notekeep v2
plan: docs/plans/PLAN-notekeep.md
started: 2026-09-22T09:14Z   updated: 2026-09-22T10:02Z

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 41 | list --json     | x | build:sonnet | 2026-09-22T09:22Z | 3f1a2c9 |
| 42 | tags + --tag    | ~ | build:sonnet | 2026-09-22T10:02Z | - |
| 43 | export          |   | -            | -     | - |
| 44 | README          |   | -            | -     | - |

## In flight
### stage 42 — tags + --tag  (dispatched 09:51)
prompt: |
  Add a `tags` list to each note in notekeep/store.py and a `list --tag <t>`
  filter in notekeep/cli.py. Test both. Do not touch export or the README.
last seen: wrote store.py, tests not yet run.

## Rulings
- 09:38 — stage 41 emits `[]` not `null` for an empty store — the plan does not
  say, JSON consumers expect a list — costs a one-line change if wrong.
```

**States:** `` (pending) · `~` in flight · `x` landed · `!` failed · `?`
parked (chain only: every item waits on a decision) · `>` re-planned (`landed`
names the new stage).
**`landed`** is a commit sha or a path, never a claim. An empty `landed` on an
`x` row is a lie the next session will believe.
**One run, one worktree (F35).** In a git repo with a commit, `init` also
creates the run's own worktree, `<repo>/../<repo>.runs/RUN-<n>-<slug>`, on
branch `run/RUN-<n>-<slug>`, and writes both into the run file's header. Every
stage of the run works and commits **there** - say so in each dispatch prompt -
never in the main checkout, whose index another run may be using. The run
file itself stays in the main checkout's `.skillator/`, whichever worktree
calls the script. `resume` names the worktree and recreates it from its branch
if it is gone. `init --here` (`-Here`) keeps the old one-checkout behaviour.
The run reaches main through its final stage: merge `run/RUN-<n>-<slug>` from
the main checkout, then `git worktree remove <worktree>` and
`git branch -d run/RUN-<n>-<slug>` - nothing removes them for you.
**Leases across runs (F36).** `chain dispatch` leases the stage's `files:` in
one registry per clone (`<git-common-dir>/skillator/leases`); a file another
run's live stage holds refuses the dispatch (`LEASED <path> RUN-m stage s`,
exit 2) and `chain next` shows the stage `IDLE ... leased`. Landing, failing
or re-planning releases; a lease silent past 20 min is taken, with a ruling.
Board edits from a run worktree go through `relay-morpheus.sh board <ID>
<mark>` (`-Mode board -Ticket -Mark`), which writes the main checkout's
`TICKETS.md` under its lock.
**Numbers are serial across the project, not per run.** `init` takes the RUN
id and every stage number from the F21 allocator (`practice/scripts/next-id.sh`,
kinds `RUN` and `S`), which reads every run file in the tree and on every ref
and keeps a counter every worktree of the clone shares — so two worktrees never
both make RUN-4, and a new run's first stage continues after the highest stage
any run has used (RUN-7 above starts at 41). "Stage 42" names one stage in the
whole project. Existing run files are never renumbered.
**Rulings** are appended, never rewritten — see `tasks-sentinels`, which is
where they come from and which writes into this same file.

## The loop

1. **Before dispatch** — add or update the stage row to `~`, write the In-flight
   block with the *exact prompt you are about to send*, stamp the heartbeat.
   Prompt not written down → the agent is not recoverable → do not dispatch.
2. **While it runs** — re-stamp the heartbeat whenever the agent reports. A
   stale heartbeat is the only signal you get that a network drop took it;
   `hooks/relay-morpheus.* orphans` turns that into a list.
3. **When it lands** — commit the stage's work, then set `x` and put the sha in
   `landed`, and delete its In-flight block. In that order: the sha cannot be
   written before the commit exists.
4. **When it fails** — `!`, and leave the In-flight block where it is with the
   failure appended. A failed stage's prompt is the thing you need most.
5. **Never** delete a row. A run file only grows.

Stages that touch the same files do not run at once; independent ones do
(`PRACTICE.md` §4). Either way each gets its row before it gets its agent.

## Resuming

Open `.skillator/run.md`, then check it against the tree — the file is written
before the work, so the last `~` row is a stage that *started*, not one that
finished. `landed` shas are ground truth; anything else is a claim to verify.
Redispatch straight from the stored prompt; the rows are keyed by stage number,
so a redispatch that duplicates work overwrites rather than appends.

Then carry on. A resume does not need permission to continue — see
`grayskull-power` §3, **run to the end**.

## Chaining ticket workflows

When the stages are ticket workflows that start each other — "work every open
ticket in staged workflows, keep going" — the rule above gains a second half:

```
THE NEXT STAGE IS STARTED BY THE LAST ONE'S COMPLETION, AND BY NOTHING
ELSE UNTIL USAGE SAYS SO
```

Two isolated runs (`practice/baselines/scenario-relay-chain*.txt`) dispatched
with no plan on disk, read no usage between stages, named stages by their
content (two runs picked the same name), and started a stage at 84 % of the
5-hour window. So a chain is run **only** by the loop in
[references/chain.md](references/chain.md): every stage `chain plan`ned with
its code and exact prompt before the first dispatch; `chain decide` (on
`usage-watch level`) before every stage, the first included; `chain hold` at 80 % and a `chain wait` listener instead
of a new stage; `mode:` in the run file naming what was actually dispatched.
Read that file before the first `chain` command.

Every chain is a **marathon**: a question only the user can answer is parked
on disk (`park`), the chain goes on with every stage that does not wait on it
(`chain next`), and the queue is asked once, at the end. The six stops are
never parked:

```
A STOP IS ASKED THE MOMENT IT IS REACHED, AS THE ONLY QUESTION -
NEVER AS ONE ITEM OF THE END BATCH
```

Two baseline runs (`scenario-marathon-stop.txt`) left an untracked directory
alone, said its deletion could not be undone, and then asked it as item 2 of 3
beside a format question. Read [references/marathon.md](references/marathon.md)
when a verdict carries `parked`, a stop fires, or `chain next` prints `ASK` or
`UNBLOCK`.

## Scripts

`hooks/relay-morpheus.sh` · `hooks/relay-morpheus.ps1` — the same commands, mirrored per
`PLATFORMS.md`: `init`, `add`, `stage`, `heartbeat`, `status`, `orphans`, and
`chain plan|dispatch|hold|release|wait|status|decide|next|edge`, and the
marathon's `park`, `answer`, `queue`. They are
bookkeeping, not judgement; every one reads or edits `.skillator/run.md` and
nothing else. Run `selftest` on both after touching either.

```sh
sh  relay-morpheus.sh  init plan.md "notekeep v2" "list --json" "tags" "export" "README"
sh  relay-morpheus.sh  add "docs pass"                    # a stage found mid-run; prints 45
sh  relay-morpheus.sh  stage 42 '~' build:sonnet          # before you dispatch
sh  relay-morpheus.sh  stage 42 x  build:sonnet 3f1a2c9   # after you commit
sh  relay-morpheus.sh  orphans 20                         # who has gone quiet
```

```powershell
relay-morpheus.ps1 -Mode init  -Plan plan.md -Title "notekeep v2" -Stages "list --json,tags,export,README"
relay-morpheus.ps1 -Mode add   -Title "docs pass"
relay-morpheus.ps1 -Mode stage -N 42 -State '~' -Owner build:sonnet
relay-morpheus.ps1 -Mode stage -N 42 -State x   -Owner build:sonnet -Landed 3f1a2c9
# In a headless or nested run on Windows, call the .sh through the Bash tool:
# the PowerShell tool refuses `& <script>.ps1` and `powershell -File` under any
# allow rule (A91, claude 2.1.280).
```

Add rows with `add`, never by hand: a hand-typed number is the per-run
restart this numbering removed. The scripts find the allocator beside the
installed skills (`<skills>/practice/scripts/`, or `<root>/practice/scripts/`
in a clone or the plugin cache; `RELAY_NEXT_ID` overrides). Without it they
fall back to the old local rule and say so on stderr — numbers then repeat
across worktrees.

Three constraints the pair has to keep, each learned the hard way:

- **Pure ASCII, and the empty cell is `-`, not an em dash.** Windows PowerShell
  5.1 reads a BOM-less script as ANSI and corrupts anything above 126.
- **The run file is LF with no BOM, written to a temp and moved.** Both mirrors
  edit the same file, so one of them flipping encoding rewrites every line in
  the diff; and a kill between truncate and write would empty the only record
  of what was in flight.
- **`-Stages` takes `"a,b,c"` and pending is spelled `pending`.** PowerShell's
  `-File` passes each argument as one literal string and drops empty ones, and
  `-File` is how every hook here invokes it.

### Seeing a run without being told about one

`list` prints every run with its resume sentence, and prints nothing when there
are none, so it is safe as a `SessionStart` hook. With one wired, a session that inherits
a half-finished run sees it in its own context before the user has to remember
to mention it — which is the difference between resuming and starting over.

```json
{ "hooks": { "SessionStart": [ { "hooks": [ {
  "type": "command",
  "command": "powershell -NoProfile -ExecutionPolicy Bypass -File \"<SKILL>/hooks/relay-morpheus.ps1\" -Mode list",
  "timeout": 5
} ] } ] } }
```

macOS/Linux: `sh <SKILL>/hooks/relay-morpheus.sh list`. Forward slashes throughout —
PowerShell accepts them and it removes all backslash-escaping from the JSON.
Other hosts have no equivalent event; there, reading `.skillator/run.md` is the
first thing `resume-cortana` does. `watch-cortana` already drains in-flight
agents at the limit — relay is what it drains *into*, so the two do not overlap.
