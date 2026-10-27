# Marathon — park the user's questions, ask them all at the end

## Entry — a marathon is picked, not assumed

**A bare "work the board" or "work the open tickets" is a sweep, not a marathon
request.** With the user present, ask tickets-zordon's sweep mode question first
(Workflow mode, "Ask the mode once before a sweep"), with **marathon** offered
beside single / per-task / workflow: the staged chain on this page, which keeps
going across sessions and parks questions to one end batch. Already answered
this turn - don't re-ask.

**Run a marathon without asking only when it was named** — `/marathon`,
"marathon", "keep going", "work them all, staged", "while I'm away" — or the run
is headless, chained or already inside a relay. Then log
`Ruling: mode marathon - <why> - <cost if wrong>`.

**Another mode picked → hand the tickets to tickets-zordon in that mode.** No
run is opened: no `init`, no `chain plan`.

Once picked, every chain runs as a marathon unless the user said "ask me as you go"
(`RM queue --asks live`, then a parked question is asked at the next
between-stage point). Design: `docs/plans/PLAN-marathon.md`. `RM` is the same
page shorthand as in [chain.md](chain.md): type the full `sh "<path>" …` every
time. PowerShell: `-Mode park|answer|queue`, `-Mode chain -Action next|edge`.

## Stops — never parked, asked now and alone

```
A STOP IS ASKED THE MOMENT IT IS REACHED, AS THE ONLY QUESTION.
IT IS NEVER AN ITEM IN THE END BATCH.
```

The six grayskull stops: a destructive or irreversible op, a security-sensitive
action, a side effect outside the worktree (push, merge, publish, message), the
7-day window at 90 %, a scope-contract breach, a failed repro. When one fires:
dispatch nothing new, end your message with that one question — what the act is,
that it cannot be undone, *Hold (recommended)* first — and nothing else in it.
The open queue is offered **after** the user has answered the stop, never beside
it. Two baseline runs saw that deleting untracked `data/legacy/` could not be
undone, said so, and still listed it as item 2 of 3 next to a format question:
a destructive op approved as one line of a batch is a rubber stamp. That is the
failure. "It's all questions for the same user" does not make a stop a decision;
`park` refuses `--stop` other than `none` (exit 2).

Stops 5 and 6 are item-level by default (F31: the ticket fails `passed:false`,
never parked). The whole chain stops only when that ticket has dependants
(`after:`, `blocks:`, held files) or two repros fail in a row. The chain's own
push stays last, asked on its own after the unblock rounds.

## Park — only what the user alone can decide

All four, or it is a `Ruling:` with the default, as today:
1. **reason** `taste` (preference nothing settles), `fact` (only the user knows —
   *where* a credential lives, never its value) or `conflict` (ticket, spec and
   the user's words disagree and none binds);
2. not a stop;
3. two to four real options;
4. a default a ruling would pick.

A park is the question written down **before** the next dispatch: park (disk) →
board flip (`[!] (blocked: RUN-n Qk - <8 words>)`, or split `F2a` done / `F2b`
blocked) → commit what passed → `RM stage <n> x|?` → ruling → `RM chain next`.

```sh
RM park --stage 66 --ticket F2 --reason taste \
  --question "Should export write CSV or JSON by default?" --header Format \
  --option "JSON | matches list --json | breaks the spreadsheet habit" \
  --option "CSV | opens in Excel | needs a quoting rule" \
  --default JSON --recommended JSON --blocks "F2b, F5" \
  --files "shelf/export.py, tests/test_export.py" --done "F2a landed in AAQ7" --stop none
```

It prints `Q<k>` (always quote it with the run: `RUN-11 Q2`). Planning-time
parks drop `--stage`. A repeat with the same stage and ticket prints the existing
Q and writes nothing, so replaying step 3 after a crash is safe. `park` refuses
(exit 2): no `## Chain`, fewer than 2 or more than 4 options, a missing
header/reason/default/files/stop, a header over 8 characters, a default that is
not an option, a line break, a `|` inside an option field, a field starting with
`#`, and key or token shapes (`sk-`, `ghp_`, 40+ hex — use the short sha).

A stage where no item passed and one parked: nothing to commit, `RM stage <n>
'?'`, In-flight block kept with `parked: Q2` appended. Failed items get F31's one
retry stage. A park the verify agent judged not genuine: ruling with the
default, ticket `[ ]`, one retry stage.

### Paste into every chain fix prompt

> Before you edit, decide whether the ticket needs a choice only the user can
> make (taste, a fact only they know, a conflict nothing settles). If you can
> decide it from the ticket, spec, repo conventions or the user's words, decide
> it and say `Ruling:` in your report. If not: do every part that does not
> depend on the answer, and touch nothing that does. Do not stub it, guess it or
> leave a placeholder. Then end your report with `PARKED:` plus the question, 2–4
> options with what each does and where it hurts, your recommendation and
> default, the part that waits, and every file or directory it will touch (err
> wide). If the choice is a destructive, security or outside-the-worktree act,
> say `STOP:` instead. Never ask the user and never wait.

With grayskull-power on (`.skillator/grayskull.md` present) the prompt opens
with this line, and without it does not (A155):

> Load skillator:code-yoda first (restraint, full): the smallest diff that meets the ticket - no speculative abstraction, no new dependency, no refactor outside the ticket, no ceremony; run its review lens on your diff before /code-review and cut what it flags.

Verify prompt addendum: *"If the report says PARKED: check that the independent
part works, check (git diff) that the gated files hold no partial guess, judge
whether the decision is genuinely the user's, and list every file the gated part
would touch; `parked.files` is the union of yours and the fixer's."* The VERDICT
schema gains one optional field:

```js
parked: { type: 'object', properties: { question: {type:'string'}, header: {type:'string', maxLength: 8},
  options: {type:'array', minItems: 2, maxItems: 4, items: {type:'object', properties: {label:{type:'string'}, does:{type:'string'}, hurts:{type:'string'}}}},
  recommended: {type:'string'}, default: {type:'string'}, reason: {enum: ['taste','fact','conflict']},
  genuine: {type:'boolean'}, gated: {type:'string'}, files: {type:'array', minItems: 1, items: {type:'string'}},
  done: {type:'string'}, stop: {enum: ['none','destructive','security','outside','scope','repro']} },
  required: ['question','header','options','default','reason','genuine','gated','files','stop'] }
```

`stop` other than `none` is not a park: handle it as that stop, now (above).

## The loop — `chain next`

Run it in place of "dispatch the next pending stage". It judges nothing:

| Prints | Do |
|---|---|
| `NEXT <n> <CODE>` | dispatch it (chain.md Step 2) |
| `HOLD …` | chain.md Step 4 |
| `ASK <k>` | the end batch, below |
| `UNBLOCK Q<k>` (one line per Q) | Unblock, below — no question |
| `WAIT <k>` | k stages in flight, nothing else can start — wait for a notification |
| `BLOCKED <k>` | k stages wait (`after:`) on a failed one — retry it as a new stage, close the failed row `> stage <new>`, or report it |
| `FINAL` | the main-session stage; `- unanswered: …` lists Qs to name in the summary |

`IDLE <n> Q<k> blocks|files|nofiles|after` lines say why a stage waits. A Q
holds while `open`, `asked`, `answered` or `ruled`; it stops only at `replanned`
or `moot`. A stage with no `files:` waits while any Q holds. `chain dispatch`
refuses a stage idle on a Q or on an `after:` stage not landed, a `?` stage, and
`chain next` never offers a `!` row (retry = a new stage via `RM add`). A `>` row
counts as landed once the stage it names has. An edge found late:
`RM chain edge <n> --after 66` or `--independent-of Q2 --why "<ruling>"`.

The hold gates dispatch, not questions: under a hold `ASK` and `UNBLOCK` still
print. A user who types mid-run while work can dispatch gets one line —
"2 decisions parked, asked at the end" — not the batch.

## The end batch

1. **Re-validate** each open Q: its ticket closed, or a landed stage settled it →
   `RM answer Qk --moot "<why>"`. **Deduplicate**: the later of two parks of one
   question → `RM answer Qk --same-as Qj` (its blocks and files join Qj).
2. `RM queue` prints the batch, most-blocked first, chips cut to 8.
   **Draw it** before asking - one command, `node <skills>/holo-r2d2/scripts/holo.mjs
   RUN-<n> --batch`: it writes the page, the standalone page and the decision
   wizard and prints the ASCII picture with every path. **Paste that whole
   output above the questions**, every time - the picture is part of the
   batch, not an extra. With the Artifact tool, also publish the
   `.artifact.html` it names (private, `capabilities: {db: {}}`). The
   wizard's finalized JSON becomes `RM answer` lines (`holo.mjs --answers <file>`).
3. **AskUserQuestion in your tool list** (interactive Claude Code): pages of up to
   4 questions × 4 options, back to back, no dispatch between. Header = the chip
   as-is; question text `RUN-11 Q7 (2/3): <question>`; option 1 is the
   recommended one; description "does · hurts". The first page's first
   question text ends `- drawn: <link or path>`. After **each** page, before the
   next: `RM answer Qk "<label or the user's own words>"`; "you decide" →
   `--ruled`. Unanswered or dismissed → leave it; it is not asked again this
   marathon.
4. **No AskUserQuestion** (`-p`, Codex, Cursor, agents): `RM queue --mark-asked`,
   the `--batch` output (picture and paths) above its list as the one message,
   run FINAL on what landed, end the turn.
   The reply (same session or `continue RUN-n`) becomes `RM answer` calls,
   written before any dispatch, then Unblock and a second FINAL.

Never prose asking "what do you want?" — the queue's list is the shape.

## Unblock — re-plan, never re-dispatch

For each `UNBLOCK Qk`, while it still holds:
1. Collect the `[!]` tickets and `b`-parts in its `blocks:` **and every stage
   `chain next` lists as `IDLE <n> Qk`** — a stage held only by a shared file
   still has a prompt written before the answer.
2. Tickets → `[ ]`. `RM add` a new stage, write a **new** prompt that quotes the
   answer verbatim and names landed partial work by sha, `RM chain plan` it
   (`--after` where needed).
3. Each collected old row → `RM stage <old> '>' - "stage <new>"`; or keep it
   under `RM chain edge <old> --independent-of Qk --why …`. Default: re-plan.
4. `RM answer Qk --replanned <new>`. Ruling:
   `Q2: CSV - replanned as stage 71 (AAQB); stage 70 (F5) replanned as 72`.
5. Back to `chain next`. New parks start the next round; at most **3 rounds**,
   then FINAL with the rest reported open and their tickets `[!]`.

## A marathon of runs (F38)

Several runs wait their turn in one queue, `<main>/.skillator/queue.md`:

```sh
RM queue-run add 12        # each run, in order (-Mode queue-run -Sub add -Id 12)
RM queue-run next          # START RUN-0012 | BUSY RUN-0012 running | DONE
RM queue-run start 12      # then `continue RUN-0012` - its chain runs as above
RM queue-run list          # the rows, ids padded, with each run's owner (F44)
```

One run runs at a time. A run reaching FINAL lands, then `queue-run next`
starts the next one. **A hard stop pauses only its own run** - `queue-run pause
<n>`, its stop asked alone as above - and the queue moves on; the 7-day stop
halts everything.

**Landing** - one run at a time, on main, never pushed:

1. `RM land <n> --start` - rebases the run branch onto main in the run's
   worktree (exit 3 on a conflict: nothing moved; a fix stage resolves it on
   the run branch, then `--start` again; exit 2: another run is landing).
2. Regression sweep, `code-review:code-review` on `main..run/RUN-<n>-...`, the
   version bump - all committed on the run branch.
3. `RM land <n> --finish` - fast-forwards main, removes the worktree and the
   branch, marks the run `landed`. Then commit the board on main: run branches
   never commit `TICKETS.md` (F36's `board` writes it in the main checkout).

**One push per marathon**: after the last run has landed, the push is asked
alone - one question, *Hold (recommended)* first. Never per run.

**One end batch for all runs**: `RM queue --all` lists every run's open
decisions, each under `## RUN-<n>`; ask them as one batch (The end batch),
answer each with `RM <n> answer Qk ...`.

**Away** - "I'll be back" → `RM away on`; "I'm back" → `RM away off`, then
`queue --all` and ask every parked question, then Unblock. While away, when a
batch is ready:

1. Draw it (`holo-r2d2`, the decision wizard for several questions) and send
   `PushNotification`: `RUN-<n>: <k> decisions waiting - <link or path>`.
2. Wait up to 30 minutes for answers (`Monitor`: AskUserQuestion pending in
   the terminal, or answers posted on the page).
3. No answer: the questions stay open, their tickets `[!]` with the question
   id, and `queue-run next` starts the next queued run. **Never a default** -
   an unanswered decision is not decided.
4. Queue drained and still unanswered: notify once more, end the turn cleanly.

## Usage and resume

80 % hold with work left: F31, Qs wait. `ASK` under a hold: ask anyway. 7-day
stop: watch-cortana's order first and alone, then the queue. A fresh
`continue RUN-n`: `resume`, then `chain next` — `UNBLOCK` re-plans first without
asking; `ASK` asks (that is the one question a resume may ask).

## A saved Workflow marathon - /marathon-plan, /marathon-run (F73)

The plan is written by `/marathon-plan [sequential|parallel] [N|max] [IDs]`, or
planned and run in one go by `/marathon-run` with the same words, on every host;
Claude Code runs it with the Workflow tool, the other hosts with their delegate
(below) or in-session. Typing `/marathon-run` is the explicit opt-in to run it.

### Mode - sequential or parallel (F112)

`/marathon-run [sequential|parallel] [N|max] [IDs]` **or** `/marathon-run [RUN id]`.

- Mode first (optional): `sequential` or `parallel`. Then an optional count: a whole number ≥ 1 or `max`. Then optional ticket IDs. No mode and no count = `sequential`. A bare count still works (`2 F12`); `sequential` takes no count (`sequential 2`: say so and stop); `parallel 1` runs as `1`. No IDs = every open ticket on TICKETS.md (`[ ]`, `[~]`, `[!]` re-checked), picked through `ticket-meta pick` (F80).
- A RUN id alone (`RUN-0019`) runs the plan `/marathon-plan` saved for it, as saved (today's behaviour). A mode or count beside a RUN id → say the saved plan fixes its shape (Legacy recovery below applies only to pre-F112 plans) and stop.
- Nothing typed: the one open run with a `.workflow.js` beside it and an unlanded stage → run it (today); two or more → list them and stop (today); none → plan over every open ticket, `sequential`, and run.
- A first word that is neither a mode, a count, a ticket ID nor a RUN id (`0`, `two`) → say it is not an option and stop.

| Typed | Runs | A phase holds | `RELAY_CHAIN_PARALLEL` on `chain dispatch` |
|---|---|---|---|
| nothing, `sequential`, `1` | sequential | one ticket | unset |
| `parallel`, `max`, `parallel max` | parallel | every file-disjoint ticket that fits | the number of stages in the phase |
| `parallel 2`, `2` | parallel, capped | at most 2 file-disjoint tickets | 2 |

- `sequential` (the default): one ticket per phase, in board order, each stage planned `--after` the one before - one agent at a time (the implementer, then its verifier).
- `parallel`: file-disjoint tickets side by side in one phase, each stage in its own worktree, merged on landing; a count caps a phase. Tickets whose files overlap never share a phase, whatever the mode.

| Mode | Phase shape (marathon.md Plan step 3) | `chain plan` edges | Agents at once |
|---|---|---|---|
| sequential | one ticket per phase, board order (pick order) | every stage `--after` the previous ticket stage | 1 (pipeline runs the implementer, then the verifier) |
| parallel / max | today's F96/F101 rule: a ticket goes in the first phase after every phase holding a ticket that shares one of its files | `--after` the stages it shares files with | the phase's ticket count |
| parallel N | the parallel grouping, then each group split into chunks of at most N in board order; chunk k+1 is a new phase after chunk k | `--after` the shared-file stages **and** the last stage of the previous chunk | at most N |

At dispatch: sequential leaves `RELAY_CHAIN_PARALLEL` unset; parallel/max uses
`RELAY_CHAIN_PARALLEL=<stages in the phase>`; parallel N uses `RELAY_CHAIN_PARALLEL=<N>`.
Record the normalized mode in `PLAN.mode` and `meta.description`: `sequential`, `parallel`,
or `parallel <N>` (N >= 2); `1` and `parallel 1` normalize to `sequential`.

Planning (no RUN id) checks Legacy recovery below first for an explicit
`/marathon-plan` selection; otherwise it runs `ticket-meta pick`, then:

1. A picked ticket that is already a stage of an open run with a `.workflow.js` beside it is **skipped**, listed as `planned in RUN-<id>` — never two open runs over one ticket.
2. For `/marathon-run` only: if every picked ticket sits in one such run and no mode or count was typed → run that run instead (`using RUN-<id>'s plan`); a mode or count typed → the RUN-id refusal above (the saved plan fixes its shape).
3. Nothing left to plan → say so and stop (the `planned in` lines name what to run).

On an in-session host a parallel plan runs serial; say so in the first line.

### Legacy recovery (A162)

Read the saved `PLAN` as data, never execute the old script. Legacy means its
`mode` property is absent, whether its keys are bare or quoted JSON keys.
Only `/marathon-plan <mode> <IDs>` with explicit IDs can select recovery; the
existing mode/count grammar and default apply, with no new flag or RUN argument.
Before ordinary duplicate filtering, locate the one own open legacy run whose
remaining ticket IDs exactly match the selection. All selected tickets must pass
`ticket-meta pick`; show refused ownership and stop, never silently shrink the
selection. Keep the ordinary `planned in RUN-<id>` guard for modern plans.

| Recovery case | Decision |
|---|---|
| Explicit own legacy; pending and landed only | regenerate in place |
| Modern PLAN.mode present | skip; keep saved plan |
| Any active worker or in-flight stage | refuse; wait for completion |
| Implicit, ambiguous or mixed target | refuse; print explicit target command |
| Failed stage needing retry | refuse; existing retry flow first |
| Parked or unresolved replacement stage | refuse; resolve existing hold first |

Check the run ledger, chain records and worker state before writing: any `~`
stage, live worker, or uncertain liveness refuses recovery even with a stale
heartbeat. No worker is cancelled or replaced. A `!` stage needs the existing
documented retry flow (`RM add`, `chain plan`, old row linked to its retry),
outside this planning-only recovery; then rerun the planner with the pending
retry ticket IDs. Do not reset a failed row or replay it here. Preserve `?`
holds and `>` replacement history; unresolved holds/replacements refuse, while
a resolved replacement is followed to its existing pending successor exactly
once. Completed `x` stages are never included in the regenerated phases.

For ambiguous/mixed selections, list candidate runs and print one concrete
`/marathon-plan sequential <IDs>` per candidate using that run's actual remaining
ticket IDs (including any pending successor), not literal placeholders. No IDs
never opts into recovery. A failed/held/active target also gets that command plus
the blocker that must be settled first; do not imply rerunning it clears a hold.
If nothing remains, say so and leave the saved script untouched.

After the guards pass, back up the exact old `.workflow.js` beside it under an
unused backup name before replacing it. Keep the existing run file, worktree,
branch, stage IDs, codes, prompts, files, dependencies and landed history.
No `init`, `add`, `chain plan`, state reset, agent or dispatch in recovery.
Build remaining phases only from the existing pending stages, using the current
argument mode and existing dependency order; sequential holds one ticket,
parallel phases hold only file-disjoint stages and honor the cap. Preserve all
existing edges even when they force a narrower phase; refuse inconsistent or
cyclic records rather than inventing edges or missing stage codes/prompts.
Use the current template, fill only `meta` and `PLAN` (including normalized
`PLAN.mode`) from those records, and keep its compiled driver unchanged.
Validate the regenerated plan against the ledger and recheck liveness before
replacing the script; a changed ledger/worker state aborts without replacement.
Show the retained stages, phases, backup/script paths and `run it: /marathon-run
RUN-<id>` with the actual run ID. Planning ends here, with no dispatch. A second
call now sees a modern plan and skips it; it cannot repeatedly replace it.

**Plan** (`/marathon-plan [sequential|parallel] [N|max] [IDs]`) - no agent runs, no `chain dispatch`, no Workflow call:

For an eligible legacy selection, use Legacy recovery above and stop; steps
1-6 below create a new plan only.

1. Pick the tickets as [chain.md](chain.md) Step 1 (ids given: only those) and
   name each one's files. No ticket left → say so, stop.
2. `RM init TICKETS.md "<title>" "<ID>: <what>" ... "verify review bump commit
   push"` - one stage per ticket, then the main session's final stage. Numbers
   come from `init` (and `RM add` for a ticket found later), never by hand.
3. Phases follow the mode: sequential - one ticket per phase in pick order,
   each stage `--after` the previous; parallel - a ticket goes in the first phase after every phase holding a ticket
   that shares one of its files; one phase = file-disjoint tickets. Its stage
   is planned `--after` those earlier stages. For parallel N, split each group
   into chunks of at most N in board order; the next chunk is a new phase,
   with `--after` the shared-file stages and the last stage of the previous chunk.
4. Per ticket stage: its prompt file `.skillator/prompts/run-<0000>-s<n>.txt`
   (chain.md Step 1: the worktree paragraph, the Park paste-in above, an F
   ticket opens with "Load skillator:build-jarvis"; it commits as
   `<ID>: <what>` - the code does not exist until `chain plan`), then
   `RM chain plan <n> --tickets <ID> --files "<files>" --prompt-file <it>
   [--after <m>]` (mode `workflow`).
5. The script: copy `templates/marathon-workflow.js` (this skill) to the run
   file's own name with `.workflow.js` for `.md`, beside it; fill `meta` (name
   `marathon-RUN-<0000>`, one `Phase <k>` entry per phase - a ticket's
   implementer and verifier both run under it, no separate Verify phase) and
   `PLAN` (mode normalized as above, `sequential` when none; `runWorktree` = what `init` printed; per ticket: stage, code from
   `chain plan`, ID, files, Done line, the prompt file's text verbatim as a
   JS string). Nothing below `PLAN` is edited.
6. Show it: the run file's stages, each phase with its tickets, codes and files,
   tickets left out and why, the agent count (2 per ticket - an implementer and
   a read-and-run-only verifier; the final stage is the main session's), the
   script's path, and the line `run it: /marathon-run RUN-<0000>` with what runs
   it on this host: Claude Code `(Workflow tool)`; cursor `(Task tool, one Task
   per agent)`; antigravity/agy `(background subagents)`; codex `(subagents)`;
   muse `(child agents)`; pi, opencode, gemini `(in-session, phases in order;
   pi with the subagent extension: that)`. The script is written on every host.

**Run** (`/marathon-run [RUN id] | [sequential|parallel] [N|max] [IDs]`):
a RUN id runs as saved; mode/count/IDs plan as Plan above, show it, then run
without a pause. A mode or count beside a RUN id: the saved plan fixes its
shape, stop. Nothing typed: one open planned run runs; two or more are listed
and stop; none plans every open ticket sequentially and runs.

1. `RM resume <id>`; the script is the run file's name with `.workflow.js`.
   A missing script → say `/marathon-plan` writes it, stop. Read PLAN as text
   first: a missing `mode` property means a pre-F112 plan; follow Legacy recovery
   (A162), printing a concrete `/marathon-plan <mode> <IDs>` command for its
   remaining tickets, and stop before any dispatch. Quoted keys count too.
2. Phase by phase, in order, skipping a phase whose stages are all `x`:
   `RM chain decide`; use no RELAY_CHAIN_PARALLEL for sequential,
   `RELAY_CHAIN_PARALLEL=<stages in the phase>` for parallel,
   `RELAY_CHAIN_PARALLEL=<N>` for parallel N; then for each of its stages
   `RM chain dispatch <n> --driver
   @<sid> --owner workflow` (`ticket-meta session`) - the row goes `~` and the prompt into the run
   file **before** the agent exists. Note the worktree each names (stderr
   `stage <n> works and commits in: <path>`; none = the run worktree), flip
   its ticket `[~]` (`RM board <ID> '~'` - it claims an unowned ticket to
   you, as `ticket-meta start` does (F106)), then one call:
   `Workflow({scriptPath, args: {phase: <k>, worktrees: {"<n>": "<path>"}}})`.
   Write the returned `runId` into each In-flight block's `run:` line.
3. Land each returned row as chain.md Step 3 (a `parked` verdict → Park first,
   a `stop` other than `none` → that stop, now): review, `RM chain merge <n>`
   for a stage worktree, `RM stage <n> x workflow <sha>`, `RM board <ID> x`;
   `passed:false` or `null` → `RM stage <n> '!'`, ticket `[ ]` with the why.
4. A failed stage that a later phase waits on (`BLOCKED`): its retry is a new
   stage (`RM add`, `chain plan`) run as one Agent call - the saved script is
   not edited mid-run.
5. All phases done → `RM chain next` until `FINAL`, then the end batch above
   (asked once, after the work), then the final stage: `RM stage <final> '~'`,
   Landing above (`RM land <n> --start`, sweep, `/code-review`, the bump,
   `--finish`), the push asked alone - headless: `push: waiting for the owner`.

### Run without the Workflow tool

Cursor, antigravity/agy, codex, muse, pi, opencode and gemini run the same
`.workflow.js` plan with their own delegate. Every host here is **inferred**
(PLATFORMS.md) until a recorded run.

| Host | Delegate (`--owner`) | Driver tag |
|---|---|---|
| cursor | the Task tool, one Task per agent (`task`) | `@cu-<6>` |
| antigravity/agy | background subagents (`subagent`) | `@agy-<6>` |
| codex | subagents (`subagent`) | `@cx-<6>` |
| muse | child agents (`subagent`) | `@mu-<6>` |
| pi | the subagent extension when installed (`subagent`), else in-session (`session`) | `@pi-<6>` |
| opencode | in-session (`session`) | `@oc-<6>` |
| gemini | in-session (`session`) | `@gm-<6>` |

`<6>` = the first six chars of the session id or, with none readable, of
`date +%s`.

1. `RM resume <id>`; read the `.workflow.js` beside the run file **as data**:
   `meta.phases` and `PLAN`. Never execute it (its tail throws without `args`).
   A missing script → say `/marathon-plan` writes it, stop. Read PLAN as text
   first: a missing `mode` property means a pre-F112 plan; follow Legacy recovery
   (A162), printing a concrete `/marathon-plan <mode> <IDs>` command for its
   remaining tickets, and stop before any dispatch. Quoted keys count too.
2. Phase by phase, in order, skipping a phase whose stages are all `x`:
   `RM chain decide`; use no RELAY_CHAIN_PARALLEL for sequential,
   `RELAY_CHAIN_PARALLEL=<stages in the phase>` for parallel,
   `RELAY_CHAIN_PARALLEL=<N>` for parallel N; then for each of its stages
   `RM chain dispatch <n> --driver
   <the Driver tag from the table> --owner <delegate>` - the row goes `~` and
   the prompt into the run file **before** any agent exists. Note the worktree each names, flip its
   ticket `[~]` (`RM board <ID> '~'`).
3. Per ticket, through the delegate: the implementer gets the stage prompt (the
   In-flight block's text, prefixed with the script's worktree line when a
   stage worktree was named - the same text `implement(it)` builds); on its
   return the verifier gets the `verify(it, report)` text plus one trailing
   line: ``End your report with one line `VERDICT: <json>` matching this
   schema: {ticket, passed, sha, evidence, why?, parked?}`` (the script's
   `VERDICT` object pasted). No `VERDICT:` line or bad JSON = `passed:false`,
   why `no VERDICT line`. A host with parallel delegates runs a phase's tickets
   at once (cursor: several Task calls in one turn; agy/codex/muse: one
   subagent per ticket); phases stay serial everywhere. Write the delegate's id
   (Task id, subagent name, child id) into each In-flight block's `run:` line;
   none → `run: <delegate>`. The mode is the phase shape: a delegate host runs
   a phase's tickets at once; an in-session host runs them one after another
   and says so in the first line when the plan is parallel.
4. **No delegate** (pi without its extension, opencode, gemini): the session is
   the implementer, then the verifier, ticket by ticket in phase order - the
   stored prompt read and done, then the verify text done as a second pass that
   edits nothing. `run: in-session`.
5. Landing: step 3 of the Run above, with the landing owner the host's
   delegate value from the table - `RM stage <n> x <delegate> <sha>` (`task`,
   `subagent` or `session`), never `workflow`.
6. A failed stage that a later phase waits on (`BLOCKED`): its retry is a new
   stage (`RM add`, `chain plan`) dispatched with the host's delegate from the
   table, or on a host with no delegate `RM chain dispatch <n> --driver <its
   tag> --owner session` (row `~`, prompt on disk) before its work starts
   in-session - the saved
   script is not edited mid-run.
7. The end batch, the final stage and the push: step 5 of the Run above,
   unchanged.
