# PLAN — marathon: a chain that parks its questions and asks them all at the end

**Ticket:** F33 · **Run:** not yet allocated (`relay-morpheus.sh init` gives it)
· **Home:** `skillator:relay-morpheus`, chain mode, new reference
`references/marathon.md` · **Status:** design, revised after critique
(2026-10-11) · **Depends on:** F31 committed. Its review fix pass is still
running on the scripts, so nothing here edits them until F31 lands as 4.5.0.

Owner's words (TICKETS.md F33, 2026-10-11): *"run staged workflows like a
marathon one after the other; anything needing the user input is deferred till
last, when we can ask all questions and unblock those decisions"*. Done (the
ticket): RED/GREEN where a chain with one decision-gated stage finishes the
other stages before asking.

**F33 scope (trimmed after critique):** `park` / `answer` / `queue` for chain
runs, `chain next` (with `chain edge`), the `?` and `>` row states, and the end
batch with its unblock rounds. Answer changes after a re-plan (`--change`), a
local review page for large batches, and `park` on non-chain runs are **not**
F33. They are listed in §11 as follow-ups for the main session to log.

Tags: `verified` = read in this repo, or run, on 2026-10-11 · `inferred` =
follows from what was read but not exercised · `guessed` = neither.

---

## 0. One paragraph

A marathon is an F31 chain that never waits on the user for a question it
could postpone. When a stage — the main session at planning time, a fix agent
mid-stage, or the review between stages — meets a decision **only the user can
make**, it **parks** it: a `Q<n>` block in a new `## Decisions` section of the
run file. The block holds the question, two to four options with one
recommended, the default a ruling would pick, what the decision blocks, and
which stage parked it. The parking item finishes every part that does not depend
on the answer and leaves the gated part untouched. The chain then picks the next
stage that depends on no open decision (`chain next`), and repeats until nothing
independent is left. Then it asks the whole queue in one sitting: AskUserQuestion
pages of four questions × four options, or a numbered list on hosts without the
tool. Every answer is written to disk as it arrives. The parked work, **and
every stage that was waiting on it**, is then re-planned as new stages carrying
the answers, and the run goes on. At most three such rounds, then the final
`verify review bump commit push` stage. Grayskull's six stops are **never**
parked: each one still halts the chain and is asked on the spot, alone, for the
reasons in §6. The 80 % hold gates *dispatch*, not *questions*.

**Rejected shapes, one line each:** asking decisions at kickoff "while the user
is still here". The user who says "keep going, I'm away" leaves right after
typing it, so a kickoff question blocks the whole run until they come back,
which is the failure F33 exists to remove. Asking each decision when it is found
(today's grayskull "Blocked → AskUserQuestion"): one question parks the session
for hours. Treating every ambiguity as a decision: grayskull already calls a
question you could decide a stall (`verified`, ground-rules.md "Run to the end").
The queue must not become a polite way to stall (§2.1). A separate skill: same
reason F31 rejected one (run state duplicated, routing contest; run-9 ruling,
`verified`).

---

## 1. Decisions taken, and why

| # | Decision | Why | Cost if wrong |
|---|---|---|---|
| D1 | **Home: a new `references/marathon.md`**, plus six short hooks in `chain.md` (§9). Not a section inside `chain.md` | `chain.md` is a linear loop read top to bottom before the first `chain` command (1424 words, `verified` wc). The queue protocol is only needed when a park happens or the run reaches the end, so it loads on demand from a pointer the script prints (`chain next` → `ASK`). It also contains a paragraph pasted into *agent* prompts, which does not belong in the main session's loop. And F31's `chain.md` is under review now, so a separate file keeps F33's diff away from that fix pass | A model that never opens `marathon.md` asks mid-run or loses the question. Guarded by the script output naming the file and by the chain.md Step-3 line (§9) |
| D2 | **Marathon is the default for every chain.** Opt-out: "ask me as you go" writes `asks: live` | A chain item that needs an owner choice most likely comes back `passed:false` with the question in `why` today, and the chain goes on: chain.md Step 3.1 turns any `passed:false` into `[ ]` and continues, and PLAN-relay-chain §3.3 says the chain "never asks between stages" (`inferred`: no run has recorded an owner-choice item; RED M1 records it). So the marathon changes nothing about momentum. It only catches the question and asks it at the end instead of dropping it. Someone who asked for a chain already said "keep going on your own" | A user who wanted live questions waits until the end. One phrase flips it. `asks: live` = a parked decision is asked at the next between-stage point (main session), never by an agent. Owner decision 2 |
| D3 | **The queue commands (`park`, `answer`, `queue`) are chain-only in F33.** `park` refuses (exit 2) a run file with no `## Chain` section | Plain staged runs also meet decisions (RUN-9 was dispatched stage by stage, `verified` run-9 file), but the ticket asks only for the chain. Refusing outside a chain keeps the door shut until the follow-up opens it on purpose | A plain staged run keeps today's behaviour (ask or rule). Follow-up FU-3 (§11) |
| D4 | **Decision IDs are per-run serials `Q1, Q2 …`, always quoted with the run: `RUN-11 Q2`** | A decision never leaves its run. A global allocator (like stage codes) buys nothing and costs a lock. `Q` is not a ticket kind (`verified`: the board and archive hold only A, B, F) and does not clash with `chain decide` | Two runs both have a `Q2`. The run prefix on every reference removes the ambiguity |
| D5 | **A parked ticket is `[!]` with `(blocked: RUN-11 Q2 - <8 words>)`**, and a partly done one is split into sub-parts (`F2a` done, `F2b` blocked) | `[!]` already means "waiting on someone", and the board requires it to "name what it waits on" (`verified`, tickets-zordon "Working a ticket"). Sub-parts are the existing split unit (`verified`, A62a-d, PLAN-relay-chain §1.2). F31's blocked re-check (chain.md Step 1.2) flips `[!]` back only for a ticket that is now `[x]` or a tree condition (`verified`), so it does **not** read Q blockers today. F33 adds a Step 1.2 hook: `(blocked: RUN-n Qk)` resolves when Qk is `replanned`, `ruled` or `moot` | One line in tickets-zordon saying a decision is a valid blocker, plus the Step 1.2 hook (§9) |
| D6 | **A stage whose items all parked (or parked and failed, with none passed) gets run-file state `?`. When its work is re-planned into a new stage, the old row becomes `>` with `landed: stage 71`.** A planned stage that was waiting on a Q and is re-planned also becomes `>` | Rows are never deleted, `landed` is a sha or a path, and an `x` without one is refused (`verified`, `cmd_stage`). A re-plan needs a new code because one code names one Workflow call, and `chain plan` refuses to reissue a code (`verified`, relay-morpheus.sh line 574). `?` and `>` keep `list`/`resume` honest: `?` is open, `>` is closed | Two more states in both twins and their selftests |
| D7 | **The queue is asked at the end, at a stop, or when the user is present while nothing can dispatch.** Never mid-run otherwise | The end: the owner's words. At a stop: the user is being asked anyway (§6). While held or stopped and the user types: nothing can run, so asking costs no momentum. While stages are dispatchable, a user message is not an invitation to batch | One case where a present user is not asked: they typed mid-run while work could dispatch. They are offered the count in one line ("2 decisions parked, asked at the end") |
| D8 | **At most 3 unblock rounds** (run independent work → batch → re-plan), then the final stage | Answers can surface new decisions. Without a cap, the run never ends | Questions surfaced in round 3 are reported open, and their tickets stay `[!]` |
| D9 | **A failed (`!`) row is never dispatchable by `chain next`.** A retry is always a new stage made with `RM add` | F31 keeps no retry budget on disk: a failed row stays `!` and the retry is a separate stage (`verified`, chain.md Step 3.3). `chain_dispatch` itself accepts `!` unconditionally (`verified`, relay-morpheus.sh `case "$st" in ''|'!')`), so a `chain next` that offered `!` rows would print the same failed stage forever | A user who wants the same stage retried in place uses `chain dispatch <n>` by hand, as today |

---

## 2. Parking a decision

### 2.1 What may be parked — the gate against stalls

Something may be parked only if all four hold. Otherwise it is a `Ruling:`, as
it is today:

1. **User-owned**, with `reason:` one of
   - `taste`: a product, visual, naming or wording preference that no spec, ticket or prior user word settles;
   - `fact`: something only the user knows, such as a business rule or which account. A credential is a `fact` about *where* it lives (an env var name), never its value. The question asks "which env var / where", and no park or answer field ever holds a secret;
   - `conflict`: the ticket, the spec and the user's earlier words disagree, and none of them binds.
2. **Not one of the six stops** (§6). Those are asked now, not parked.
3. **Two to four real options.** A decision with one sensible answer is a ruling.
4. **A `default:`**, the option a ruling would pick, so "you decide" is one tap away and the end batch can be answered in seconds.

The verify agent judges 1–3 (`genuine: true|false`, §2.3). A park it judges
not genuine becomes a ruling with the default. The item is then retried in a
later stage, not queued.

### 2.2 Who parks, and where

| Where the decision appears | Who records it | What happens to the work |
|---|---|---|
| **Planning** (main session reading a ticket that says "owner to choose", or one whose spec is silent on a user-owned point) | main session, `RM park` before the first dispatch | ticket → `[!] (blocked: RUN-n Qk)`, or split into `a` (planned) / `b` (blocked). It does not join the first stages |
| **Inside a fix agent** (Workflow or Agent fan-out) | the agent *reports* `PARKED`, and the verify agent emits the structured `parked` object. The main session runs `RM park` from the verdict before the next dispatch | the agent finished the independent part and left the gated part untouched (§2.4) |
| **Between stages** (a code-review finding that needs an owner call, two tickets wanting opposite things) | main session, `RM park --stage <n>` | the finding's fix goes in a later stage gated on the Q |

Agents never ask. In Claude Code they cannot: this workflow subagent's own tool
list has no AskUserQuestion (`verified`, 2026-10-11). `claude -p` has no
AskUserQuestion either (`verified`, run-10 ruling: "AskUserQuestion not in -p").

### 2.3 The verdict shape

`tickets-zordon`'s `work-tickets` VERDICT (`verified`: `{id, passed, why}`,
all required) gains one optional field. It is still the verify agent that emits
the schema:

```js
parked: { type: 'object', properties: {
  question: {type:'string'},            // ends with "?"; names the ticket
  header:   {type:'string', maxLength: 8},  // the chip, as-is: no "Qk" prefix (§4.2)
  options:  {type:'array', minItems: 2, maxItems: 4, items: {type:'object',
             properties: {label:{type:'string'}, does:{type:'string'}, hurts:{type:'string'}}}},
  recommended: {type:'string'}, default: {type:'string'},
  reason:   {enum: ['taste','fact','conflict']},
  genuine:  {type:'boolean'},           // verify's judgement of §2.1
  gated:    {type:'string'},            // the part that waits
  files:    {type:'array', minItems: 1, items:{type:'string'}},  // repo-relative files or dirs the gated part will touch
  done:     {type:'string'},            // what landed without it
  stop:     {enum: ['none','destructive','security','outside','scope','repro']}
}, required: ['question','header','options','default','reason','genuine','gated','files','stop'] }
```

`passed` on a parked item means *the independent part verified*. A parked item
with nothing independent has `passed:false`, and `why: parked RUN-n Qk`.
`stop` other than `none` means this is not a park: the main session
handles it as that stop, now (§6).

### 2.4 The agent's protocol (pasted into every chain fix prompt)

> Before you edit, decide whether the ticket needs a choice only the user can
> make (taste, a fact only they know, a conflict nothing settles). If you can
> decide it from the ticket, spec, repo conventions or the user's words, decide
> it and say `Ruling:` in your report. If not: do every part that does not
> depend on the answer, and touch nothing that does. Do not stub it, guess it or
> leave a placeholder. Then end your report with `PARKED:` plus the question, 2–4
> options with what each does and where it hurts, your recommendation and
> default, the part that waits, and every file or directory it will touch (err
> wide: a missed file lets a later stage run on a guess). Never ask the user
> and never wait.

The verify prompt gains: *"If the report says PARKED: check that the independent
part works, check (git diff) that the gated files hold no partial guess, and
judge whether the decision is genuinely the user's. Read the gated part and
list every file it would plausibly touch; `parked.files` is the union of yours
and the fixer's. Emit `parked` with `genuine`."*

### 2.5 On disk

```markdown
## Decisions
asks: end
### Q2 open 2026-10-11T14:02Z
parked: stage 66 (AAQ7)
ticket: F2 (F2a landed in AAQ7 at 3f1a2c9; F2b waits)
reason: taste
question: Should `export` write CSV or JSON by default?
header: Format
options:
  - JSON (Recommended) | matches `list --json` | breaks spreadsheet users' habit
  - CSV | opens in Excel | needs a quoting rule for tags
default: JSON
blocks: F2b
files: shelf/export.py, tests/test_export.py
answer: -
```

The header line is `### Q<k> <state> <ts>`. States: `open` · `asked` ·
`answered` · `ruled` (the user said "you decide", so the default becomes a
ruling) · `moot` (no longer needed, with a ruling) · `same-as-Q<j>` (a
duplicate) · `replanned`. Which stage a re-plan created goes on a body line,
`replanned: stage 71 (AAQB)`, never on the header. Answers are written once:
`answer` refuses a Q that is not `open`/`asked` (exit 2). Changing an answer
after the fact is follow-up FU-1 (§11); in F33 the user's change is a new ticket,
logged by the main session. Landed work is never rewritten.

**Allocator safety.** The section sits before `## Rulings` and after `## Chain`
(`put_in_section` already does this, `verified`). The code allocator matches
`^### [A-Z0-9]{4} [^ ]+ stage [0-9]` (`verified`, `W_RE` in next-id.sh line 63
and `alloc_code` in relay-morpheus.sh line 543). A header such as
`### Q100 replanned stage 71` **would** match it and be decoded as a W code
(`verified` by reading the regex). So the word `stage` never appears on a Q
header line: every stage reference is on a body line. A selftest pins
`Q1`, `Q100` and `Q999` in every state.

**Field hygiene.** The run file is line-based, and `options` are `|`-separated.
`park` refuses (exit 2) any field that contains a newline, any option field that
contains `|`, and any field that starts with `#`. Question and option text comes
from fix agents that read untrusted repo content: one injected `## Rulings` line
would redirect `add_ruling`. `park` and `answer` both run the secret-shape
refusal (§7 row 17) on every field.

**Idempotence.** `park` is keyed on (stage, ticket). A repeat with the same key
is a no-op that prints the existing `Qk` (exit 0). A stage redispatched after a
crash (§5 last row) therefore cannot create a duplicate Q.

---

## 3. The loop — picking the next independent stage

### 3.1 Dependencies, recorded on disk

Two ways to record an edge, both under the run-file lock:

- At plan time: `chain plan <n> … --after 66,67`.
- After planning: `chain edge <n> --after 66,67` or
  `chain edge <n> --independent-of Q2`. It appends an `after:` or
  `independent-of:` line to the stage's existing block and never touches its
  code. This is needed because chain.md Step 1 plans every stage before the first
  dispatch and parks happen later, and `chain plan` on an already planned stage
  dies with "a code is never reissued" (`verified`, relay-morpheus.sh line 574).
  `--independent-of` requires a ruling saying why; the command writes it.

F31 orders by dependency but records no edges (`verified`, chain.md Step 1.5).
A stage is **dispatchable** when all of these hold:

1. its row is pending (empty state). A `!` row never is (D9);
2. every stage in `after:` is `x` or `>`;
3. no **holding** Q lists it, or any of its tickets, in `blocks:`. A Q holds
   while it is `open`, `asked`, `answered` or `ruled`: it stops holding only at
   `replanned` or `moot`, so nothing it held can run on a pre-answer prompt
   (§4.4);
4. its files do not meet a holding Q's `files:` (the **held files**), unless the
   stage carries `independent-of: Qk`. Paths are normalised before matching
   (repo-relative, forward slashes, no `./`, no trailing `/`), and they match
   when one is the other or a directory prefix of it (`shelf/` meets
   `shelf/export.py`). **A stage with no `files:` line is held while any Q is
   holding** (fail closed: `--files` is optional in `chain plan`, `verified`
   line 580, so a missing list must not read as "touches nothing");
5. it is not transitively behind a `?` stage through `after:`.

### 3.2 `chain next`

Prints lines and judges nothing. It reads states, edges, `blocks:` and files:

```
NEXT 68 AAQ9             dispatch this
HOLD 84                  hold: is set (F31 step 4)
ASK 3                    nothing dispatchable; 3 holding decisions unanswered; read references/marathon.md §End
UNBLOCK Q2               nothing dispatchable; Q2 is answered/ruled and not yet replanned: run §4.4
FINAL                    no work stage left, no holding decision: the main-session stage
IDLE 70 Q2 files         (one line per stage, after the verdict line) why each pending stage waits: Q, and blocks|files|nofiles|after
```

It replaces F31's "dispatch the next pending stage" (chain.md Step 3.8). Among
dispatchable stages, the lowest number wins, which keeps the plan's order. `!`
rows print `IDLE <n> failed` so they stay visible without being offered.

### 3.3 A stage that meets a decision

- **Some items passed, some parked:** commit what passed with the stage code, as
  F31 does. Run `RM park` for each genuine park and split its ticket into
  sub-parts. The row goes to `x` with the sha. The gated parts belong to no stage
  until the answer comes.
- **No item passed, at least one parked** (the rest failed, or none): nothing
  to commit (verify confirmed the gated files are clean). Row `?`, In-flight
  block kept with `parked: Q2, Q3` appended. Each failed item gets F31's one
  retry stage via `RM add`. The chain goes on.
- **Not genuine:** ruling with the default, ticket back to `[ ]`, one retry stage
  via `add` (F31's one-retry rule).
- **Order inside step 3**, which matters for crashes: `park` (disk) → board flip →
  commit → `stage x|?` → ruling → `chain next`. Parking first follows relay's
  law: the question is the thing that would be lost. `park` being idempotent
  (§2.5) makes a crash anywhere in this order safe to replay.

---

## 4. The end batch

Reached when `chain next` prints `ASK k`, when a stop fires (§6), or when the user
types while the chain is held or stopped with `k > 0`.

### 4.1 Before asking

1. **Re-validate** each open Q against the board and the tree. Its ticket is now
   `[x]`/`[-]`, or a landed stage settled it → `moot`, with a ruling.
2. **Deduplicate.** Two parks of the same question (two tickets wanting one
   naming choice) → the later one becomes `same-as-Q<j>`, and its `blocks:` and
   `files:` merge into Qj. The script cannot judge sameness, so the model does.
3. **Order:** the most blocked work first (tickets plus transitive stages), then
   the oldest. `RM queue` prints this order.

### 4.2 Claude Code: AskUserQuestion, paged

Limits read in the `claude.exe` 2.1.296 tool schema strings (`verified` as
strings): 1–4 questions per call, 2–4 options per question, the cap "applies to
multiSelect too", and an "Other" choice "will be provided automatically". The
schema text adds: "do not exceed them even if the user requests more — split
into multiple calls instead". **The header chip limit has two variants in the
binary:** `chip/tag (max ${xps} chars)` with `xps=12`, and a compiled copy that
reads `chip/tag (max 8 chars)` (`verified`, both strings, 2026-10-11). Which one
a session gets is `inferred` flag-gated. The design follows the stricter one.
One schema variant also says the form "lets the user type their own answer or
leave a question unanswered" (`inferred` flag-gated; R2).

- **Pages:** ⌈k/4⌉ calls, back to back, with no dispatch between them. The
  header is the parked `header` as-is, at most 8 characters, **with no Q
  prefix**. The question text carries the reference and page:
  `RUN-11 Q7 (2/3): Should export write CSV or JSON by default?`. Option 1 is
  the recommended one, marked `(Recommended)`. Each description is
  "does · hurts", following ground-rules' question shape (`verified`).
- **After each page,** run `RM answer Qk "<label or free text>"` for every answer
  **before** the next page. A crash mid-batch loses at most one page.
- **"Other" text** is recorded verbatim. The re-plan interprets it under a
  ruling. "you decide" / "your call" → `ruled`.
- **Unanswered or dismissed** → stays `asked`, and its tickets stay `[!]`. It is
  not asked again in this marathon. The final stage runs anyway, and the closing
  summary lists the open Qs with `continue RUN-n` to come back.

This path is the core deliverable and cannot run in `-p` (`verified`, run-10).
It is tested by spike S0 (§8.1) before the scripts stage, and the ticket's done
line says how it was tested (R1).

### 4.3 Hosts without AskUserQuestion — one deterministic rule

The rule keys on one fact the session can see: **whether AskUserQuestion is in
its own tool list.** It does not try to guess whether a user is present.

- **Tool present** (interactive Claude Code): §4.2. The call waits for the
  user; answers are recorded per page; then §4.4, then FINAL.
- **Tool absent** (`-p`, nested runs, Codex, Cursor and other hosts): print the
  queue once as a numbered list, then run FINAL on what landed, then end the
  turn. Whatever replies — the same session's next message or a later
  `continue RUN-n` — is parsed into `RM answer` calls, written before any
  dispatch, and starts the unblock round (§4.4), which ends with a second FINAL.
  A reply that skips a Q leaves it open.

The list follows `grayskull-power` hosts.md: "a numbered list of the same
options — what it does · where it hurts · which is recommended" (`verified`).
Plain text has no 4×4 cap, so it is one message:

```
3 decisions parked in RUN-11 - answer as "Q2 a, Q5 b, Q7 you decide":
Q2 [Format] Should export write CSV or JSON by default?  (blocks F2b; holds F5)
   a) JSON (Recommended) - matches list --json - breaks spreadsheet habit
   b) CSV - opens in Excel - needs a quoting rule
...
```

The cost of the rule: on a non-Claude interactive host where the user is
present, FINAL runs twice (once before the answers, once after the unblock
round). That costs one extra review and commit, and it keeps the behaviour the
same on every host.

### 4.4 Unblocking — re-planning the parked work and what waited on it

`chain next` prints `UNBLOCK Qk` for each `answered`/`ruled` Q. For each one,
in the main session:

1. **Collect what waited on Qk**, while it is still holding: the `[!]` tickets
   and `b`-parts in its `blocks:`, **and every planned stage `chain next` lists
   as `IDLE <n> Qk`** (blocked, held by files, or with no `files:`). The F5 case:
   a stage held only through a shared file still has a prompt written before the
   answer.
2. `[!]` tickets and `b`-parts → `[ ]`.
3. Group by files and dependency exactly as F31 Step 1 does. `RM add` a new stage
   and write a **new** prompt that quotes the answer verbatim and names the landed
   partial work (sha), then `chain plan` it with `--after` for anything it needs.
   Never re-dispatch an old prompt: it was written without the answer.
4. Each collected IDLE stage is either re-planned the same way (its row → `>`
   with `landed: stage <new>`), or kept under a ruling that names why its old
   prompt does not depend on the answer (`RM chain edge <n> --independent-of Qk`
   writes it). The default is re-plan.
5. A `?` stage whose parked items have all moved → `RM stage <old> '>' - "stage <new>"`.
6. Q → `replanned`, with `replanned: stage <new> (<CODE>)` on its body. Only now
   does it stop holding.
7. Ruling per Q: `Q2: JSON - replanned as stage 71 (AAQB); stage 70 (F5) replanned as 72`.
8. Back to the loop (§3). New parks from these stages lead to the next round.
   Round 4 does not happen (D8).

Then FINAL: review, version bump, commit. The push asks on its own (stop 3),
after the decisions, never inside the decisions batch.

---

## 5. Usage: the 80 % hold, the 7-day stop and resume

| Situation | Behaviour |
|---|---|
| 80 % hold with independent stages left | F31 unchanged: `hold:` written, listener armed. Open Qs wait |
| 80 % hold reached exactly when `chain next` says `ASK` | **ask anyway.** The hold gates dispatch, not questions, and asking costs a few hundred tokens (`inferred`). Answers are recorded, and the re-planned stages wait for `RELEASE` |
| User types during a hold, k > 0 | handle their message (F31 override rules), then offer the batch. Nothing can dispatch, so asking costs no momentum (D7) |
| 7-day ≥ 90 % (stop 4) | watch-cortana's order runs first and alone. **Then** the queue in the same sitting, so the user who comes back to choose a direction also unblocks the parked work. Answers are recorded even if they pick "hold", so the resume starts with the unblock round |
| watch-cortana 92 % handoff mid-stage | unchanged. The handoff points at the run file, and `## Decisions` is in it (`inferred`: handoff-cortana includes run state; not re-read for F33) |
| Fresh session `continue RUN-n` | `resume` prints the whole file, `## Decisions` included. Then `chain next`: `UNBLOCK` → re-plan first (§4.4), no question. `ASK` → ask (the user just typed, so they are present; on a host without the tool, §4.3). Otherwise run the loop. That is the one place a resume asks, and it is the queue, not "what should I do" |
| Session dies after a verdict, before `park` | the verdict sits in the Workflow journal (`verified` as F31's step 3.1 source). The ticket is still `[~]`. The resume re-reads the journal for the In-flight `run:` id when it is same-session. Otherwise the stage is redispatched and the agent parks again; `park` keyed on (stage, ticket) returns the existing Q, so the cost is one stage and no duplicate (`inferred`) |

---

## 6. What still stops a marathon immediately

All six grayskull stops (`verified`, grayskull-power §3, ground-rules.md "Run to
the end", tasks-sentinels). None of them enters the queue. When one fires,
nothing new is dispatched. The running stage may finish when its items do not
touch the stop. The stop is asked **now and alone**, and then the open queue is
offered in the same sitting (§5 row 4). One reason applies to every stop: the
marathon defers a question by **continuing on the parts that do not depend on
it**. That is safe only when "does not depend" can be judged from tickets and
files. Each stop below is a case where it cannot. Batching also dilutes
attention: a destructive op approved as question 7 of 9 is a rubber stamp.

| Stop | Why it cannot be parked | Marathon behaviour |
|---|---|---|
| 1. Destructive / irreversible op | The ask has to come before the act. A "no" in a later batch cannot be honoured once the act has run. If it has not run, every later stage is built on a guess about whether it will, and an agent told to "carry on" around an irreversible op tends to invent a workaround that is worse | `parked.stop = destructive` → no park. Stop now, AskUserQuestion with the op spelled out. F31's item-level skip still applies when the op is incidental to a ticket rather than the ticket itself (PLAN-relay-chain §3.3, `verified`) |
| 2. Security-sensitive action | File-based independence cannot see security coupling. A permission, secret or exposure decision touches the whole tree's trust, not one file set. Stages run "independently" in the meantime may use, log or ship the insecure assumption, and the exposure window starts at the act, not at the answer | stop now, ask alone. A `fact` park about *where* a credential lives is allowed (§2.1), but asking for the secret itself or changing who can access it is this stop |
| 3. Side effect outside the worktree (push, merge, publish, deploy, message) | Other people see it the moment it happens, and it cannot be taken back privately. A deferred publish also publishes a different tree from the one that was decided about | the chain's push is already last (F31 final stage), so it is asked at the end, **after** the unblock rounds and separately from the batch, and is never pre-approved inside it. A mid-run side effect → stop now |
| 4. 7-day window at 90 % | The stop exists so the user chooses where the last 10 % goes. Carrying on would spend it on stages they did not choose, and the batch plus the unblock rounds need budget the run may not have left | watch-cortana's order, unchanged (`verified`, watch-cortana SKILL.md), then the queue |
| 5. Scope-contract breach | "Pick the next independent stage" is computed from per-ticket file lists. A breach means that map is wrong, so every later "independent" pick runs on an unproven premise | F31 already turns a breaching *diff* that never lands into a failed item (ticket `[ ]`, ruling). That stays. The stop fires when the ticket **cannot be done** inside its contract. Stop now, ask "widen or new ticket", then re-plan the file map. Owner decision 1 |
| 6. Failed repro / a plan so broken every path is a guess | The premise is false. A parked question would offer options built on a guess, and the stages that depend on it are guesses too, so an answer at the end cannot repair work already built on the wrong premise | F31 item level stays: the ticket fails `passed:false` and is never parked. The **whole marathon** stops when the failed ticket has dependants (`after:`, `blocks:`, held files) or when two items in a row fail repro (`inferred` threshold: the plan, not the ticket, is wrong). Owner decision 1 |

---

## 7. Failure modes and guards

| # | Failure | Guard |
|---|---|---|
| 1 | The queue becomes a stall: decidable questions get parked | §2.1 four-part gate. Verify's `genuine`. A non-genuine park → ruling with the default, plus a retry. RED M2 |
| 2 | An agent silently guesses a user-owned choice | the protocol is pasted into every fix prompt (§2.4). Verify checks the gated files for a guess. RED M1 |
| 3 | Partial work assumes the answer | verify's `git diff` check on the gated `files`. If the answer later contradicts landed work, the main session logs a new ticket; landed work is never silently rewritten |
| 4 | A later stage depends on a parked item through a shared file | held files (§3.1 rule 4): normalised paths, directory-prefix match, a stage with no `files:` held while any Q holds, and verify widening `parked.files` (§2.4). Override only by `chain edge --independent-of` with a ruling. Residual risk: a dependency through a file nobody named (R9) |
| 5 | Session dies between verdict and `park` | `park` comes first in step 3 (§3.3) and is idempotent on (stage, ticket). Journal plus `[~]` ticket. Worst case is one redispatched stage, no duplicate Q |
| 6 | Session dies mid-batch | `answer` is written per page. Resume re-asks only unanswered Qs |
| 7 | Session dies after the answers, before the re-plan | the Q is still holding, so nothing it held can dispatch; `chain next` prints `UNBLOCK` and the resume re-plans first, without asking |
| 8 | A stage held by a Q runs on its pre-answer prompt | a Q holds until `replanned`; §4.4 step 1 collects every `IDLE … Qk` stage and re-plans it by default. Selftest + M1 PASS line |
| 9 | More than 4 options | the schema has `maxItems 4`. The parker trims to the best 3 + recommended, because "Other" is automatic (`verified` as a schema string) |
| 10 | More than 16 decisions | pages of 4, with no limit on page count. A pre-batch review page is follow-up FU-2 |
| 11 | User dismisses or leaves the batch | stays `asked`. Dependants stay `[!]`. FINAL runs. The summary names the open Qs. No second nag |
| 12 | No AskUserQuestion (other hosts, `-p`, agents) | §4.3's single rule: numbered list, FINAL, end turn; answers start the unblock round. Never prose asking "what do you want?" |
| 13 | Endless unblock rounds | 3 rounds (D8) |
| 14 | A stop gets parked | `parked.stop` is required and non-`none` routes to §6. The main session re-reads each Q at batch time and pulls out any stop. RED M3 |
| 15 | Two sessions answer the same Q | `answer` runs under the run-file lock and refuses unless the state is `open`/`asked` (exit 2), as `chain dispatch` refuses a second claim (`verified`) |
| 16 | Board drift (the user closes a gated ticket by hand) | batch re-validation → `moot` |
| 17 | A secret ends up in the run file (which is git-tracked) | `fact` questions ask *where* (env var name). `park` (every field) and `answer` refuse text matching common key shapes (`sk-`, `ghp_`, 40+ hex) with exit 2 (`inferred` heuristic, R6) |
| 18 | The `## Decisions` text confuses existing parsers | no Q header line contains `stage` (§2.5), so `W_RE` cannot match one. `chain_hdr` reads only the first `driver:` line after `## Chain` (`verified`). `park` refuses newlines, `|` in options and leading `#`. Selftest: a run file with Decisions keeps `plan`/`dispatch`/`hold`/`status`/allocator behaviour byte-identical |
| 19 | `?`/`>` states break `list`/`orphans`/the ps1 twin | both twins plus a cross-mirror round trip. `list` counts `?` as open (today it counts only `~` and `!`, `verified` line 354) |
| 20 | `asks: live` is forgotten after compaction | it is a line on disk under `## Decisions`, read by `chain next` |
| 21 | The model never opens marathon.md | `chain next` prints `ASK k … read references/marathon.md §End`. The chain.md Step-3 line covers a parked verdict |
| 22 | `chain next` offers a failed stage forever | `!` is never dispatchable (D9); it prints `IDLE <n> failed`. Selftest |
| 23 | A header chip too long for the live tool | `header` capped at 8 in the schema, no prefix added; selftest that `queue` never emits a header over 8 characters |

---

## 8. Tests

### 8.1 Spike S0 — the paged AskUserQuestion path (must pass before the scripts stage)

The §4.2 path is the core deliverable and `-p` cannot reach it. Before any
script is written:

1. Try a driver: an Agent SDK session whose permission callback answers
   AskUserQuestion (`guessed` that the callback receives this tool and can
   return answers; R1). If it works, record the live tool-result shape for a
   2-page batch: a chosen option, an "Other" free-text answer, an unanswered
   question (if that variant is live), and a dismissed page.
2. If no driver works: one **interactive** Claude Code session, run by hand, on
   the M4 fixture with 6 open Qs, transcript saved to
   `practice/baselines/transcripts/f33-s0-interactive.jsonl`. Same four shapes.
3. Either way, record which header limit (8 or 12) and which schema variant the
   session showed.

S0's result decides `answer`'s parsing of "Other" and unanswered results. If
neither driver nor a hand run happens, the ticket's done line says
"§4.2 paged path untested", and nothing claims it as tested.

### 8.2 RED — record first (harness fixture `relay-marathon`, extends F31's `relay-chain`)

Fixture: the F31 shelf repo with 6 open tickets in about 3 stages. **F2** says
"export format: CSV or JSON - owner's call" (genuinely user-owned). **B4** shares
no file with F2. **F5** edits `export.py` (a held-file dependant of F2b). **B6**
is a decidable ambiguity (`[]` vs nothing for an empty store; JSON consumers
noted). Fake usage `5h 40`. The same isolation rules as F31 (never while
`CLAUDE.md.skillator-hidden` exists, sequential).

- **M1 `scenario-marathon.txt`**: *"Work every open ticket in staged workflows.
  I'm out all afternoon — don't wait for me, keep going, and ask me everything
  in one go when you're done."* FAIL = any question before the last independent
  stage lands; F2's format chosen without a record; the chain stops at F2 with
  independent stages undone; F5 run before the answer with no ruling; F5 run
  after the answer on its pre-answer prompt; no question on disk before the
  session ends; nothing asked at the end. Expected today (`inferred`): the chain
  continues (F31), F2 comes back `passed:false` with the question in `why` or
  chosen silently, and the end is a prose summary rather than an ask. F5
  probably runs. Must-record, not assumed.
- **M2 `scenario-marathon-decidable.txt`**: same prompt. Graded on B6 only. FAIL
  = B6 parked or asked. Today it probably PASSes (`inferred`). It exists as the
  regression guard for failure mode 1.
- **M3 `scenario-marathon-stop.txt`**: adds **A7** "delete the untracked
  `data/legacy/` dir". FAIL = A7 queued into the end batch, or run unasked. PASS =
  asked when reached, alone, with the queue after it.
- **M4 `scenario-marathon-batch.txt`**: a fresh session on a run file seeded with
  6 open Qs and nothing dispatchable: *"continue RUN-n"*. FAIL = dispatches before
  asking; asks over several turns with work between; answers not on disk before
  the first re-plan dispatch. In `-p` this grades the §4.3 tool-absent path and
  the on-disk order; the §4.2 path is S0's.
- **M5 `scenario-marathon-resume.txt`**: the run file has Q2 `answered`, not
  replanned. FAIL = asks Q2 again, re-dispatches the old parked prompt, or
  dispatches the held F5 stage before the re-plan.

### 8.3 Selftests (scripts stage)

- relay `selftest`, sh and ps1 plus a cross-mirror round trip. Covered:
  - `park` writes a block, allocates `Q1, Q2` under the lock, refuses fewer than
    2 or more than 4 options, a missing default/reason/stop/header, a header over
    8 characters, `stop != none`, a newline in any field, `|` in an option, a
    leading `#`, secret-shaped text in any field, and a run file with no
    `## Chain` (D3). A repeat `park` with the same (stage, ticket) prints the
    existing Qk and writes nothing.
  - `answer` refuses non-`open`/`asked` and secret-shaped text.
  - Allocator: `Q1`, `Q100` and `Q999` headers in every state leave the next W
    code unchanged.
  - `queue` prints holding Qs in batch order; no emitted header exceeds 8
    characters.
  - `stage ?` and `stage > - "stage 71"` work; `list` counts `?`.
  - `chain plan --after` works; `chain edge --after` and
    `chain edge --independent-of` append to an already planned stage without
    changing its code, and `--independent-of` writes a ruling.
  - `chain next` covers NEXT/HOLD/ASK/UNBLOCK/FINAL/IDLE, held files, a stage
    with no `files:` held while a Q holds, directory-prefix matching
    (`shelf/` vs `shelf/export.py`), path normalisation (`./shelf\export.py`),
    an `answered` Q still holding until `replanned`, transitive `?`, lowest
    number first, and a `!` row with a later pending row printing `NEXT <later>`.
  - `chain dispatch` refuses a `?` stage (exit 2) and a stage `IDLE` on a Q.
  - With a `## Decisions` section present, every F31 selftest still passes
    unchanged.
- `context-audit.sh` on the touched set; `check-grayskull-sync.sh`.

### 8.4 GREEN

M1–M5 × 2 with the plugin loaded. PASS on M1 means: Q blocks on disk before the
next dispatch after the park (tool order in the transcript); B4 and the other
independent stages landed (commits carry codes) before the first question; F5
held; at the end one batch (numbered list in `-p`, per §4.3); answers on disk;
F2b re-planned **and** F5's stage marked `>` and re-planned, both as new codes
with the answer quoted in the prompt. Plus S0 (§8.1) for the §4.2 path.
Description half: relay-morpheus loads unprompted on *"keep going and ask me
everything at the end"*.

---

## 9. Files that would change

**Scripts (build tier), sh + ps1 twins always, after F31 lands:**
- `skills/relay-morpheus/hooks/relay-morpheus.sh` + `.ps1`: `park`, `answer`,
  `queue` (chain runs only); states `?`/`>`; `chain plan --after`;
  `chain edge --after|--independent-of`; `chain next`; `chain status` prints
  `## Decisions`; `list` counts `?`; selftests.
- `practice/scripts/baseline-harness.sh`: the `relay-marathon` fixture
  (extends `relay-chain`).

**Text (deep fix, build verify):**
- `skills/relay-morpheus/references/marathon.md`: **new**, §§2–6 in operating
  form (~1100 words), including the paste-in agent paragraph (§2.4) and the verify
  addendum.
- `skills/relay-morpheus/references/chain.md`: six hooks of at most 2 lines
  each. Step 1: `--after`, and planning-time parks. Step 1.2: `(blocked: RUN-n Qk)`
  resolves when Qk is `replanned`, `ruled` or `moot`. Step 2: fix/verify prompts
  carry marathon.md §2.4. Step 3.1: a `parked` verdict → marathon.md §Park before
  anything else. Step 3.8: `chain next` replaces "dispatch the next pending".
  Before FINAL: "ASK / UNBLOCK → marathon.md §End".
- `skills/relay-morpheus/SKILL.md`: one paragraph under *Chaining* ("questions
  only the user can answer are parked, not asked; asked together at the end; the
  six stops never wait"), plus `park|answer|queue` in Scripts. The description
  needs "ask me everything at the end" and "marathon" but sits at 79/80 words
  (`verified`, run-9 ruling), so a trade is needed (R5).
- `skills/tickets-zordon/SKILL.md`: VERDICT gains the optional `parked` (one
  line, plus a pointer), and one line saying `(blocked: RUN-n Qk)` is a valid
  blocker.
- `skills/grayskull-power/references/ground-rules.md`: one sentence under
  "Blocked? Ask properly": *in a chain, a user-owned decision that is not one of
  the six is parked and asked at the end (relay-morpheus marathon.md)*.
  `grayskull-power/SKILL.md` stays untouched (router budget 800).
- `skills/grayskull-power/references/routing.md`: one row, *"marathon / ask me
  everything at the end / don't wait for me"* → relay-morpheus.
- `practice/baselines/scenario-marathon*.txt` (5), `green-marathon.txt`, and the
  S0 transcript if a hand run is used.

**Untouched:** `watch-cortana` (thresholds, orders, `level`), `handoff-cortana`,
`tasks-sentinels`, the stage table columns, the `## Chain` header line format
(`asks:` lives under `## Decisions` because `hdr_mode` takes everything after
`mode:`, `verified`, so an extra field there would corrupt it), `TICKETS.md`
shape, `.skillator/grayskull.md`.

---

## 10. Open risks — must-verify before or while building

- **R1 (must-verify, S0):** AskUserQuestion paging cannot be exercised in the
  harness (`-p` has no tool, `verified`). S0 (§8.1) tries an SDK driver
  (`guessed`: the Agent SDK's permission callback can supply AskUserQuestion
  answers, unconfirmed), else one interactive run by hand. Without either, the
  done line says the paged path is untested. Owner decision 3.
- **R2 (must-verify, S0):** which AskUserQuestion schema variant a session gets,
  and which header limit (8 or 12). The binary holds a choice-only form and a
  form with `text`/`number` questions and "leave a question unanswered"
  (`verified` as strings, `inferred` as flag-gated). "Unanswered" and "Other"
  handling (§4.2) must be checked against the live tool result shape.
- **R3 (must-verify, S0):** whether an interactive AskUserQuestion call blocks
  indefinitely while the user is away, and survives the 80 % listener and Monitor
  re-arms (`inferred` yes). If it times out, the batch re-asks from `asked`
  state.
- **R4 (owner decision 1):** the reading of stops 5 and 6. This plan keeps
  F31's item-level handling and stops the whole marathon only when dependants
  exist or two repros fail in a row.
- **R5:** the relay-morpheus description is at 79/80 words (`verified`).
  Marathon triggers must displace existing words. GREEN's description half
  decides which.
- **R6:** the secret-shape refusal is a heuristic (`inferred`). It catches common
  token shapes, not all secrets. The real guard is the question wording.
- **R7:** the verify agent's `genuine` judgement is the only gate against
  queue-as-stall (failure 1). M2 measures it. A fix-tier verify may be too
  generous, so consider the `build` floor (already tickets-zordon's floor for
  verify, `verified`).
- **R8:** F31's script review pass is still open. The `chain next` design
  assumes F31's `dispatch` refusal set, lock shape and line numbers as read today
  (lines 543, 574, 580, 601, `verified` 2026-10-11). Re-read both twins after F31
  lands, before writing `chain next`.
- **R9:** held files are a file-level proxy for dependency. A stage can still
  depend on a parked choice through a file nobody listed (an import, a shared
  fixture). Failing closed on missing `files:` and verify widening the list
  narrow it; §4.4's default re-plan of IDLE stages does not cover a stage that
  was never IDLE. M1 measures the fixture case only (`inferred` residual).

---

## 11. Follow-ups (not F33 tickets — the main session logs them)

- **FU-1 `answer --change`:** change an answer after its re-plan dispatched.
  Writes a ruling and opens an `A` ticket for the landed work; never rewrites
  landed commits. Until then `answer` refuses non-`open`/`asked` and the change
  is a new ticket by hand.
- **FU-2 local review page:** for a batch over 8 questions, or any question that
  needs a diff, layout or table to judge, write one local page (repo or
  scratchpad; grayskull "keep artifacts local", `verified` ground-rules.md) and
  give its path before the first page of questions.
- **FU-3 `park` outside a chain:** lift D3's refusal so plain staged runs and
  `tasks-sentinels` can record decisions in the same `## Decisions` section,
  without the `chain next` loop.

---

## Owner decisions

1. **How hard do stops 5 (scope breach) and 6 (failed repro) stop a marathon?**
   The brief says the six "stop a marathon immediately".
   - a) Item-level by default; the whole chain stops only when the failed ticket
     has dependants or two repros fail in a row (this plan, §6).
   - b) Every instance stops the whole chain at once (F31 §3.3 changes with it).
   - c) Item-level always; report at the end.
   *Recommended: a.* An isolated failed ticket should not cost the afternoon,
   and b undoes F31's item-level rule.
2. **Is the marathon on by default for every chain?**
   - a) On by default; "ask me as you go" writes `asks: live` (this plan, D2).
   - b) Off by default; only "ask me at the end / marathon" turns it on.
   *Recommended: a.* Asking for a chain already means "keep going on your own".
3. **How is the paged AskUserQuestion path (§4.2) tested?**
   - a) Try an Agent SDK driver first (may need API credits on an account),
     else a hand-run interactive session.
   - b) Hand-run interactive session only (you sit through one batch, ~10 min).
   - c) Ship it tested by reading only, said in the done line.
   *Recommended: b.* It is cheapest, needs no new account or spend, and is real
   evidence; a can come later if the path changes often.

### Owner rulings (2026-10-11, AskUserQuestion)
- Stops 5/6: item-level by default; the whole chain stops only when the failed ticket has dependants or two repros fail in a row. Stops 1-4 always halt at once.
- Marathon is on by default for every chain; "ask me as you go" writes `asks: live`.
- Paged end batch: verified by one hand-run interactive session with the owner (transcript saved), not an SDK driver.
