# Marathon — park the user's questions, ask them all at the end

Every chain runs as a marathon unless the user said "ask me as you go"
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
   **Draw it** before asking (`holo-r2d2`): `node <skills>/holo-r2d2/scripts/holo.mjs
   RUN-<n>`, published with the Artifact tool where there is one (private,
   `capabilities: {db: {}}`), else `--html` and the path. Two or more
   questions: also the decision wizard (`holo.mjs RUN-<n> --wizard`), whose
   finalized JSON becomes `RM answer` lines (`holo.mjs --answers <file>`).
3. **AskUserQuestion in your tool list** (interactive Claude Code): pages of up to
   4 questions × 4 options, back to back, no dispatch between. Header = the chip
   as-is; question text `RUN-11 Q7 (2/3): <question>`; option 1 is the
   recommended one; description "does · hurts". The first page's first
   question text ends `- drawn: <link or path>`. After **each** page, before the
   next: `RM answer Qk "<label or the user's own words>"`; "you decide" →
   `--ruled`. Unanswered or dismissed → leave it; it is not asked again this
   marathon.
4. **No AskUserQuestion** (`-p`, Codex, Cursor, agents): `RM queue --mark-asked`,
   paste `holo.mjs RUN-<n> --ascii` above its list as the one message (with the
   wizard's path), run FINAL on what landed, end the turn.
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
RM queue-run next          # START RUN-12 | BUSY RUN-12 running | DONE
RM queue-run start 12      # then `continue RUN-12` - its chain runs as above
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
