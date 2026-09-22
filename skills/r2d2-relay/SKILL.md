---
name: r2d2-relay
description: >-
  Use when work is being executed in stages and the session may not survive to
  the end of them — a multi-stage plan, a fan-out of subagents, a long build on
  a laptop that sleeps, a dropping connection, a usage limit closing in. Also
  when the user says "staged workflow", "keep going across sessions", "resume
  the run", "what was in flight", or asks why a dispatched agent went quiet.
  NOT for writing a session handoff (`handoff-cortana`) and NOT for the board
  (`ticket-master`).
---

# R2-D2 Relay (staged runs that outlive the session)

A staged run has two records. The transcript, which dies with the session, and
the tree, which does not. Everything that matters has to be in the second one
**while the run is still going**, because there is no guarantee you reach the
end to write it down.

## The rule

```
WRITE THE STAGE DOWN BEFORE YOU DISPATCH IT, NOT AFTER IT COMES BACK
```

This is the one thing this skill exists for, and it is the one thing three
isolated baseline runs did not do (`practice/baselines/scenario-r2d2-relay.txt`).
All three executed a four-stage plan end to end and left no on-disk record of
progress until the very last write — one left none at all. A session ending
anywhere before that leaves a working tree full of unattributed diff and no way
to tell which stages produced it, which were finished, or what was still
running.

Reading a mid-run tree is **not** this skill's problem. The companion baseline
(`scenario-r2d2-relay-resume.txt`) shows a fresh session doing that correctly
unprompted, against pressure to trust stale checkboxes. Relay adds nothing
there and says nothing about it.

**Violating the letter of this is violating the spirit of it.** "I'll record it
when the stage returns" is the failure, not a variation on it — the stages that
need recording most are the ones that never return.

## The run file

`.skillator/run.md`, one per run, in the repo. Markdown because a human and any
host both have to read it with no tooling. Git-tracked by default; a repo that
objects can `.gitignore` it and lose only the shared view, not the resume.

```markdown
# RUN r7 — notekeep v2
plan: docs/plans/PLAN-notekeep.md
started: 2026-09-22T09:14Z   updated: 2026-09-22T10:02Z

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 1 | list --json      | x | build:sonnet | 2026-09-22T09:22Z | 3f1a2c9 |
| 2 | tags + --tag     | ~ | build:sonnet | 2026-09-22T10:02Z | - |
| 3 | export           |   | -            | -     | - |
| 4 | README           |   | -            | -     | - |

## In flight
### stage 2 — tags + --tag  (dispatched 09:51)
prompt: |
  Add a `tags` list to each note in notekeep/store.py and a `list --tag <t>`
  filter in notekeep/cli.py. Test both. Do not touch export or the README.
last seen: wrote store.py, tests not yet run.

## Rulings
- 09:38 — stage 1 emits `[]` not `null` for an empty store — the plan does not
  say, JSON consumers expect a list — costs a one-line change if wrong.
```

**States:** `` (pending) · `~` in flight · `x` landed · `!` failed.
**`landed`** is a commit sha or a path, never a claim. An empty `landed` on an
`x` row is a lie the next session will believe.
**Rulings** are appended, never rewritten — see `replicator-agent`, which is
where they come from and which writes into this same file.

## The loop

1. **Before dispatch** — add or update the stage row to `~`, write the In-flight
   block with the *exact prompt you are about to send*, stamp the heartbeat.
   Prompt not written down → the agent is not recoverable → do not dispatch.
2. **While it runs** — re-stamp the heartbeat whenever the agent reports. A
   stale heartbeat is the only signal you get that a network drop took it;
   `hooks/r2d2-relay.* orphans` turns that into a list.
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

## Scripts

`hooks/r2d2-r2d2-relay.sh` · `hooks/r2d2-r2d2-relay.ps1` — the same commands, mirrored per
`PLATFORMS.md`: `init`, `stage`, `heartbeat`, `status`, `orphans`. They are
bookkeeping, not judgement; every one reads or edits `.skillator/run.md` and
nothing else. Run `selftest` on both after touching either.

```sh
sh  r2d2-relay.sh  init plan.md "notekeep v2" "list --json" "tags" "export" "README"
sh  r2d2-relay.sh  stage 2 '~' build:sonnet          # before you dispatch
sh  r2d2-relay.sh  stage 2 x  build:sonnet 3f1a2c9   # after you commit
sh  r2d2-relay.sh  orphans 20                        # who has gone quiet
```

```powershell
r2d2-relay.ps1 -Mode init  -Plan plan.md -Title "notekeep v2" -Stages "list --json,tags,export,README"
r2d2-relay.ps1 -Mode stage -N 2 -State '~' -Owner build:sonnet
r2d2-relay.ps1 -Mode stage -N 2 -State x   -Owner build:sonnet -Landed 3f1a2c9
```

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

`status` and `orphans` print nothing and exit 0 when there is no run file, so
they are safe as a `SessionStart` hook. With one wired, a session that inherits
a half-finished run sees it in its own context before the user has to remember
to mention it — which is the difference between resuming and starting over.

```json
{ "hooks": { "SessionStart": [ { "hooks": [ {
  "type": "command",
  "command": "powershell -NoProfile -ExecutionPolicy Bypass -File \"<SKILL>/hooks/r2d2-r2d2-relay.ps1\" -Mode status",
  "timeout": 5
} ] } ] } }
```

macOS/Linux: `sh <SKILL>/hooks/r2d2-r2d2-relay.sh status`. Forward slashes throughout —
PowerShell accepts them and it removes all backslash-escaping from the JSON.
Other hosts have no equivalent event; there, reading `.skillator/run.md` is the
first thing `resume-cortana` does. `watch-cortana` already drains in-flight
agents at the limit — relay is what it drains *into*, so the two do not overlap.
