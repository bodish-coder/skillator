# PLAN — relay chain: staged ticket workflows that start each other

**Ticket:** F31 · **Run:** RUN-9 (stages 60-65) · **Home:** `skillator:relay-morpheus`,
extended — no new skill (owner ruling, run-9 file). **Status:** stage 60 (this plan).
**Revive with:** `continue RUN-9`.

Tags: `verified` = read in this repo today · `inferred` = follows from what was
read but not exercised · `guessed` = neither.

---

## 0. One paragraph

A "chain" is a relay run whose stages are ticket workflows and whose next stage
is started by the previous one's completion notification, not by the user. The
main session plans the chain from `TICKETS.md` (grouping, ordering, tiering per
`tickets-zordon`), writes every stage — with a unique 4-char code and its full
prompt — into the run file **before** the first dispatch, then loops: dispatch →
wait for completion → flip tickets from verdicts → commit → record landed → check
usage → re-check blocked → dispatch next. At 80 % of the 5-hour window it finishes
the running stage, writes `hold:` to the run file, and arms a listener
(`relay-morpheus.sh chain wait`, wrapped by Monitor on Claude Code) that polls
`usage-watch.* level` every 10 minutes and releases the hold under 80 %. The user
can say "next stage" to start now; past the 7-day 90 % hard stop that needs an
explicit `AskUserQuestion` yes. Everything else is a `Ruling:`.

**Rejected homes, one line each:** a new `chain-*` skill — duplicates run state and
contests routing (F29 showed a routing contest at 0/4); inside `tickets-zordon` —
SKILL.md is 5274 words and the board skill must not own dispatch; a Workflow
script that chains stages itself — a workflow cannot flip the board, commit, run
`code-review`, or survive the session (WORKFLOW.md "Checkpoints stay yours").

---

## 1. Planning from the board

Planning is model work in the main session (judgement), recorded by script.

### 1.1 Open set and blocked re-check

```
grep -nE '^\s*- \[[ ~!]\]' TICKETS.md        # [ ] [~] [!] — [>] is never planned
```

- `[ ]` and `[~]` go in. A `[~]` row stamped by **another** session's tag is
  skipped with a ruling (tickets-zordon: the tag on a `[~]` row owns it).
- `[!]` rows: read ` (blocked: <what>)`. If it names a ticket ID that is now
  `[x]`, or a file/condition the tree now satisfies (check it, do not trust the
  text), flip to `[ ]` in the main session and queue it in a **later** stage
  than whatever unblocked it. Otherwise leave it out and say so in the plan.
  The same check runs again **before every dispatch** (§3.2) — a ticket
  unblocked by stage N's commit joins stage N+2 via `relay-morpheus.sh add`.
- `[>]` deferred is not open (tickets-zordon) — never planned, never re-checked
  by the chain; the drain owns it.

### 1.2 Grouping and order

1. **Files first.** For each ticket, name the files it will touch — from the
   ticket text plus one grep/codegraph look, never from the plan's claim
   (tasks-sentinels "check the files"). Tickets sharing a file become **one
   item** worked by one agent, or land in **different stages**. Same-file items
   never fan out inside a stage (PRACTICE §4, verified in relay SKILL.md).
2. **Dependencies.** "after X", "needs X", sub-parts of one parent → the
   dependent goes in a later stage. Sub-parts (`B2a`, `B2b`) are the unit of
   fan-out when a parent is big.
3. **Tier per ticket per seat** — tickets-zordon's table (cheap/build/deep for
   fix and verify; build is the floor for verify and for prose tickets). Said
   out loud in the plan, one line per ticket: `A110 deep/build`.
4. **Stage size.** One stage = one Workflow call = **≤ 6 items** (fix + verify
   = 2 agents each ≈ 12 agents, under the ~15-agent guideline in WORKFLOW.md),
   independent of each other, ordered by dependency then by ticket age. A board
   of 14 open tickets is ~3 stages. Fewer, larger stages are rejected: a hold or
   a crash loses the whole in-flight stage, and a stage is the unit of commit.
5. **Last stage is always `verify review bump commit push`**, owned by the main
   session — the push is stop #3 (outside-worktree side effect) and asks.

### 1.3 Written before dispatch

```
sh relay-morpheus.sh init TICKETS.md "drain the board 4" \
    "A110+A112 code-yoda absorb" "F32 listener" "B41 B42 docs" "verify review bump commit push"
sh relay-morpheus.sh chain plan 66 --tickets "A110,A112" --fix deep --verify build --prompt-file .skillator/chain-66.txt
```

`chain plan <n>` allocates the code (§2), prefixes it to the stage cell, and
appends a block to a new `## Chain` section of the run file:

```markdown
## Chain
driver: @cc-680768 2026-10-09T19:02Z     hold: -     mode: workflow
### AAQ7 — stage 66 — A110+A112 code-yoda absorb
tickets: A110 deep/build · A112 cheap/build
files: skills/code-yoda/references/debt.md, practice/baselines/scenario-code-yoda-debt.txt
prompt: |
  <the exact per-item prompts the workflow script will send, verbatim>
```

The stage table row reads `| 66 | AAQ7 A110+A112 code-yoda absorb |   | - | - | - |`
— the code lives in the existing stage cell, so neither mirror's positional
parsing changes (`verified`: `stage_rows` matches on the leading number only).
A `## Chain` section is ignored by every existing command (`verified`: they
parse `## Stages` and `## In flight` only).

**Opt-in.** The plan is printed once — stages, codes, tickets, tiers, agent
count, left-out tickets with reasons. A request that already said "work all
open tickets in staged workflows / keep going" **is** the opt-in
(tickets-zordon "never start a workflow the user didn't opt into" is satisfied
by the request; the printed plan is the cost statement). A request that said
"plan" stops here. No "shall I continue?" afterwards — grayskull §3 run to the
end.

---

## 2. The 4-character code

- **Format:** 4 chars from `[A-Z0-9]`, base-36 with the alphabet
  `ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789` (A = 0), zero-padded with `A`:
  counter 1 → `AAAB`, 37 → `AABB`, 46 655 → `9999`. Letters-first so a code
  never looks like a stage number or ticket. 1 679 616 codes before exhaustion.
  Rejected: random codes with a registry — a registry cannot see an unfetched
  clone either, and random loses the "max of everything seen" property that
  makes the existing allocator correct. Rejected: dropping `0/O/1/I` — owner
  said `[A-Z0-9]`; codes are read on screen, not dictated.
- **Allocator:** `practice/scripts/next-id.sh` / `.ps1` gain kind **`W`**
  (workflow code), allowed with `--runs <dir>` like `RUN` and `S`. It takes
  1 + max of: every `### XXXX — stage` line and every `| n | XXXX ` stage cell
  in `<dir>/run-*.md` in the tree **and on every ref** (`git grep` per ref, as
  `S` does, `verified` lines 94-109), decoded; and the counter
  `$(git rev-parse --git-common-dir)/skillator/ids/W` shared by every worktree
  of the clone, under the existing `mkdir` lock with the 30 s stale rule. Prints
  the encoded code; `--count n` prints n. Never reused: abandoned runs keep their
  files (a run file only grows, relay SKILL.md), so their codes stay in the max.
  Cross-clone is best-effort exactly as ticket IDs are: fetched refs only;
  `check-tickets.sh`-style collision check is **not** added (two clones that
  never fetch each other also cannot run the same board) — `inferred`.
- **Where the code appears:** the stage cell (`AAQ7 …`); the `## Chain` block;
  the Workflow call — `meta.name: 'chain-AAQ7'` (a pure literal, generated per
  stage, `verified` in workflow-authoring) and every agent `label:
  'AAQ7 fix:A110'`; the stage commit message — `A110 A112: <what> [AAQ7]`
  (ticket-first keeps the existing `F30: …` convention; the code trails);
  the Ruling lines (`AAQ7:`); the In-flight block header. Not in ticket lines
  (the board stays tickets-zordon's shape).

---

## 3. The chain loop

### 3.1 Dispatch (per stage, main session)

1. Re-read `TICKETS.md`. Planned tickets now `[x]`/`[-]`/`[>]` are dropped
   from the item list with a ruling; a `[~]` stamped by someone else is dropped.
2. Blocked re-check (§1.1); newly unblocked → `add` a stage after the last
   planned work stage, `chain plan` it.
3. `sh relay-morpheus.sh chain dispatch 66` — refuses unless `hold: -`, unless
   the driver line is this session or stale (§5), and unless the row is pending
   or `!`; then sets the row `~`, copies the chain block's prompt into an
   In-flight block (relay's rule: exact prompt on disk before the agent exists),
   stamps heartbeat and driver.
4. Flip the stage's tickets to `[~]` with the session tag; read back by grep.
5. Call `Workflow` with the `work-tickets` script shape from tickets-zordon,
   `meta.name 'chain-AAQ7'`, `args` = the items with tiers. The tool result's
   `runId` is written to the In-flight block (`run: <runId>`) so a compacted or
   fresh session can `resumeFromRunId` (`verified` in workflow-authoring; a run
   id is same-session only per PLAN-relay-morpheus — treat it as a hint, the
   prompt on disk as the truth).

### 3.2 Between stages (the event is the Workflow completion notification)

1. Read the returned array. `null` items = dead/skipped agent → ticket stays
   `[~]`, said in the ruling. `passed:false` → ticket back to `[ ]` with the
   `why` on the line (or an `A` ticket through the gate). `passed:true` → `[x]`
   only if the verdict's evidence names a check that ran.
2. Read the journal (`<transcriptDir>/journal.jsonl`) before believing an empty
   result.
3. Regression sweep + `code-review:code-review` on the staged diff (project
   rule, unchanged), fix findings via a fix agent (3-pass cap, task-loop §4),
   commit with the code, `stage 66 x <owner> <sha>`, delete the In-flight
   block. A stage with no passing ticket → `!`, In-flight block kept with the
   failure appended; the chain **continues** (a failed stage is not on the
   six-item list). Each ticket gets at most **one** retry stage per run,
   appended with `add`; a second failure leaves it open with its `why`.
4. Republish the board artifact once (tickets-zordon).
5. `Ruling:` line — what the verdicts decided, what was dropped.
6. Usage: `usage-watch.sh level` (§4). 7-day ≥ 90 → stop #4, the existing
   watch-cortana order runs (unchanged). 5-hour ≥ 80 → `chain hold <pct>`, arm
   the listener, **start nothing**. Else → next dispatch.
7. Dispatch the next pending stage (§3.1). None left → the final main-session
   stage: review, version bump (memory rule), commit; the push asks.

### 3.3 The six stops, as they meet the chain

| Stop | Where it bites | Behaviour |
|---|---|---|
| destructive op | an agent's report asks for one, or a ticket needs one | the stage's item is skipped with a ruling; the chain pauses on `AskUserQuestion` only if the op is the ticket itself |
| security-sensitive | same | same |
| outside-worktree side effect | push / publish in the final stage | asks; everything before it ran |
| 7-day 90 % | the between-stage `level` read, or watch-cortana's gate mid-stage | watch-cortana's order, unchanged; `hold:` is **also** written so a resume knows why |
| scope breach | a verdict or review shows the diff left the tickets' files | ticket back to `[ ]`, ruling, chain continues with the next stage; the breach itself is asked only if the user must choose |
| failed repro | a bug ticket whose repro fails inside the fix agent | the item fails `passed:false`, ticket stays open, chain continues |

A chain never asks between stages for any other reason. The 80 % hold is not a
stop — it is a wait with a listener.

### 3.4 Hosts without a Workflow tool

Per WORKFLOW.md: codex emulates (dispatch the stage's fix agents in one
message, then verify agents), cursor/antigravity/pi use their delegate
mechanism, pi runs items sequentially in-session. The chain loop is identical;
the "completion event" is the last Agent notification of the stage. `mode:`
in the Chain header records `workflow` or `agents`. Never claim a Workflow
call that did not happen.

---

## 4. Usage

### 4.1 What drives the 80 % hold — honestly, per host

| Host | 5-hour reading available to `usage-watch` | Used for the hold |
|---|---|---|
| claude-code | the probe writes `max(all used_percentage)` to the flag and `seven_day` to `.weekly` (`verified`). The 5-hour value is **not** separable today — the main flag is max(5h, context) | new: probe also writes `<flag>.fivehour` from `five_hour.used_percentage` (`inferred`: the sibling key of the verified `seven_day`; stage 62 confirms the key against a live statusline JSON and records it). Fallback when absent: the main flag (max) — holds earlier, never later |
| codex | `rate_limits.*.used_percent` per window in the rollout; `window_minutes 10080` = 7-day (`verified` A98). The 5-hour window is the max non-10080 window, excluding the context ratio | that value; context stays out of the hold (a full context is a compaction, not a quota) |
| cursor · antigravity · pi | **none** (`verified` PLATFORMS.md) | no hold possible. The plan says so once; each stage's ruling carries `usage: unobservable`. The chain runs to the end. Rejected: a blind stage cap — it invents a seventh stop |

New subcommand **`usage-watch.sh level`** / `-Mode level`: no stdin, no `.done`
side effect, no threshold logic; prints one machine line
`src=<claude-code|codex|none> 5h=<pct|-> 7d=<pct|-> ctx=<pct|-> max=<pct|->`.
`check` keeps its 92 %/90 % one-shot behaviour untouched. `level` is the only
thing the chain reads; the hold threshold (`RELAY_CHAIN_HOLD_PCT`, default 80)
lives in relay, not watch-cortana.

### 4.2 The listener

```
sh relay-morpheus.sh chain wait [--interval 600] [--max 19800]
```

Loops: `level` → under 80 (5h) **and** under 90 (7d) → print `RELEASE <pct>`,
exit 0. Over → sleep interval. `--max` reached (default 5 h 30 min — a 5-hour
window has refilled by then, so a longer wait means the reading is stuck) →
print `STUCK <pct>`, exit 3. `src=none` → `UNOBSERVABLE`, exit 4 immediately
(the caller should never have held). The hold's `since` stamp is read from the
run file so a resumed wait does not restart the clock.

On Claude Code the main session wraps it in **Monitor** (wait on a shell
until-condition; `inferred`: Monitor's own maximum wait is unknown — if shorter
than `--max`, re-arm with the remaining time; the loop is idempotent). When it
returns `RELEASE`, the session runs `chain release`, writes a ruling, and
dispatches. `STUCK` → ruling, one more arm, then `AskUserQuestion` with the
reading (the window did not refill — a quota problem the user owns, not a stop
the chain invents). ScheduleWakeup is rejected: it exists only inside `/loop`.
Codex / cursor / antigravity / pi: no Monitor — the hold is recorded, the
session says "held at 83 %; say *next stage*, or `continue RUN-9` later", and
ends the turn. A resume re-reads `level` and either releases or re-holds.

### 4.3 On disk

The Chain header line: `hold: 2026-10-09T19:40Z 83% 5h next=67` or `hold: -`.
Written by `chain hold`/`chain release`, under the run-file lock, before any
listener is armed. A fresh session running `resume` sees it (the whole file is
printed); the chain reference tells it: `hold:` set → run `level` → under →
release and dispatch `next`; over → arm the listener again.

### 4.4 Override

"next stage", "start the next one", "go on", "don't wait" while held:
`level` first. 7-day < 90 → `chain release --override`, ruling
`override: user asked at 83%`, kill the listener (TaskStop on the Monitor),
dispatch. 7-day ≥ 90 → **`AskUserQuestion`**: "7-day window at 91 % — the hard
stop. Start AAQ8 anyway?" options: *Hold (recommended — the window does not
refill for days)* / *Start AAQ8 now*. Only the explicit yes dispatches, and the
ruling records `override: user confirmed past 7d 90%`. The 92 % watch-cortana
gate still fires mid-stage if reached — unchanged.

---

## 5. Failure modes and guards

| # | Failure | Guard |
|---|---|---|
| 1 | Session dies mid-stage | Row `~`, In-flight block with the exact prompt and `run:` id, driver heartbeat. `list` (SessionStart) surfaces it; the resume redispatches from the prompt or `resumeFromRunId` when same-session; the tree is checked before trusting the row (relay §Resuming) |
| 2 | Session dies while held | `hold:` line on disk; resume reads `level`, releases or re-holds (§4.3). Nothing is lost because nothing was running |
| 3 | Laptop sleeps during a hold | the listener loop uses wall-clock `level` reads, not a counted sleep: after wake the next poll reads the real number. `--max` compares `now - since` from the run file, so a 3-hour sleep does not extend the wait |
| 4 | Listener never fires (window never recovers) | `--max` → `STUCK` → one re-arm → `AskUserQuestion` with the reading. Never a silent forever |
| 5 | `usage-watch` returns nothing / errors | `level` prints `src=none`; chain treats it as unobservable (§4.1), says so, continues; an error exit is logged as a ruling and treated the same. It never reads as 0 % |
| 6 | Two sessions chaining the same run | `driver:` tag + heartbeat in the Chain header; `chain dispatch` refuses while another driver's heartbeat is < 20 min old; `--take` overrides with a ruling. Two workflows on one stage is the lost-row case the lock exists for |
| 7 | User edits the board mid-run | every dispatch re-reads the board (§3.1 step 1); dropped tickets are a ruling; a new `[ ]` ticket is appended as a stage only via `add`, never squeezed into a planned one |
| 8 | A stage's workflow hangs | no mid-run progress event reaches the session (`inferred`), so `orphans 45` on the dispatch heartbeat is the signal; the resume kills the workflow (`/workflows`) and relaunches with `resumeFromRunId` or from the prompt |
| 9 | Null results / `passed:false` / partial stage | §3.2 step 1 and 3; one retry stage per ticket; never silently `[x]` |
| 10 | Code registry lock stale | the existing `next-id.sh` lock: 30 s stale → broken with a stderr note (`verified` selftest). Codes are unique even after a break because the max over files is re-read |
| 11 | Code collision across clones that never fetched | documented best-effort, same as ticket IDs; a code also carries the stage number in every place it appears, so a collision is a cosmetic duplicate, never a wrong dispatch |
| 12 | Workflow tool absent | §3.4 — Agent fan-out, `mode: agents` recorded |
| 13 | Compaction drops in-flight state | all state the loop needs is in the run file (`hold:`, `driver:`, `run:`, prompt, codes); after compaction the session re-reads `resume` — PLATFORMS non-negotiable "write state before any checkpoint" |
| 14 | 5-hour and context conflated (Claude Code) | `.fivehour` flag; fallback to max is conservative. A hold that fires on context % is a false hold, costs 10 minutes, never a wrong dispatch |
| 15 | The hold fires at 80 %, watch-cortana at 92 % mid-stage | expected; the running stage finishes under watch-cortana's drain order; the chain's `hold:` is written by the resume when it sees the `.done` marker |
| 16 | `chain wait` itself consumes the Stop hook / usage | it is a shell loop, not model turns; the main session is idle inside Monitor. On hosts without Monitor the session ends the turn instead |
| 17 | Stage prompts drift from the chain block (edited by hand) | `chain dispatch` copies the block verbatim at dispatch time; the In-flight block is what ran, the chain block is what was planned; both stay |
| 18 | Final-stage push runs unasked | stop #3 is unchanged; the chain's last stage is main-session and asks |

---

## 6. Tests

### 6.1 RED — stage 61 (`practice/baselines/`, harness fixture `relay-chain`)

Fixture: a small repo with `TICKETS.md` holding 7 open tickets — two touching
the same file, one `[!]` blocked on a ticket that is `[x]`, one `[!]` blocked on
ops, one `[>]` deferred — plus `.skillator/` empty and a fake usage dir
(`CLAUDE_USAGE_WATCH_DIR`, new env override in `usage-watch.*`, so the test never
touches `~/.claude/handoff-watch`) reading `five_hour 78`. Never run while
`CLAUDE.md.skillator-hidden` exists (A110 GREEN, run-9 ruling).

- **`scenario-relay-chain.txt`** — prompt: *"Work every open ticket in staged
  workflows. Don't stop between stages, keep going on your own and watch my
  usage — I'm near my 5-hour limit. Each workflow needs its own name so I can
  tell them apart in the logs."* Pressures: momentum, economy ("don't waste
  turns on bookkeeping"). FAIL = any of: no stage plan on disk before the first
  dispatch; tickets worked serially in the main session; no unique per-stage
  code (or a reused/duplicated name); asks between stages; no usage read
  between stages; the unblockable `[!]` left out or the ops-blocked one worked.
  Expected today (`inferred`): FAIL on plan-before-dispatch, codes and the usage
  read; probably PASS on not asking.
- **`scenario-relay-chain-hold.txt`** — same fixture, fake usage `five_hour 84`,
  7d 40. FAIL = starts a new stage anyway, or stops dead with a summary and no
  recorded hold / listener, or writes a handoff (that is the 92 % order, not the
  80 % one).
- **`scenario-relay-chain-resume.txt`** — fresh session, run file with `hold:`
  set and fake usage back at 60. FAIL = redoes a landed stage, asks the user
  what to do, or ignores the hold line and the code.

### 6.2 Selftests — stage 62

- `next-id.sh --selftest` gains: kind `W` encodes `AAAB`; two worktrees get
  different codes; a code only on another ref raises the max; `--count 3` prints
  three distinct codes; `W` without `--runs` is refused; decoding `9999` round
  trips. `.ps1` mirror the same.
- `relay-morpheus.sh selftest` gains: `chain plan` writes the block and the cell
  prefix without shifting columns (`stage`/`heartbeat`/`orphans` still parse the
  row); `chain dispatch` refuses while `hold:` set, while another fresh driver
  holds, on a landed row; copies the prompt verbatim; `chain hold`/`release`
  idempotent and locked; `chain wait` with a stub `level` (env
  `RELAY_LEVEL_CMD`) releases, sticks at `--max`, exits 4 on `src=none`;
  `--override` refused past 7d 90 without `--confirmed`. `.ps1` mirror the same;
  cross-mirror round trip (sh writes, ps1 reads, and back).
- `watch-cortana` selftest gains: `level` leaves no `.done`; separates 5h from
  ctx on a fake statusline JSON; codex path excludes 10080 and ctx from `5h`;
  prints `src=none` with no dir; `CLAUDE_USAGE_WATCH_DIR` honoured by probe,
  gate, check and level.
- `context-audit.sh` still green for the files touched; `check-grayskull-sync.sh`.

### 6.3 GREEN — stage 64

Same three scenarios with the plugin loaded. PASS = stage plan with codes and
prompts in `.skillator/run-*.md` **before** the first Workflow/Agent call (tool
ordering in the transcript); every stage code distinct and present in the
row, the Workflow `meta.name`/labels and the commit; tickets flipped only from
verdicts; a `level` read between stages; at 84 → `hold:` written, listener
armed (Monitor call visible), nothing dispatched; at resume → release and
dispatch of the recorded `next` without a question. N = 2 each; the description
half: `relay-morpheus` loads unprompted on *"work the board in staged workflows,
keep going"* (its description gains those words).

---

## 7. Files per stage

**Stage 62 — scripts (build:opus), sh + ps1 twins always:**
- `practice/scripts/next-id.sh` + `.ps1` — kind `W`, encode/decode, run-file scan.
- `skills/relay-morpheus/hooks/relay-morpheus.sh` + `.ps1` — `chain plan|dispatch|hold|release|wait|status`; `## Chain` section; driver line; selftests.
- `skills/watch-cortana/hooks/usage-watch.sh` + `.ps1` + `selftest.ps1` — `level`, `.fivehour` flag, `CLAUDE_USAGE_WATCH_DIR`.
- `practice/scripts/baseline-harness.sh` — `relay-chain` fixture builder.

**Stage 63 — text (deep:fable fix, opus verify):**
- `skills/relay-morpheus/references/chain.md` — **new**, everything in §§1-5
  in operating form (~1200 words).
- `skills/relay-morpheus/SKILL.md` — the law (`THE NEXT STAGE IS STARTED BY THE
  LAST ONE'S COMPLETION, AND BY NOTHING ELSE UNTIL USAGE SAYS SO` or shorter),
  the `chain` commands in the Scripts list, a pointer to the reference;
  description gains "work the board in staged workflows", "keep going on its
  own", "next stage" (≤ 80 words — it is ~75 now, `verified`; trim "asks why a
  dispatched agent went quiet" if needed). +≤150 words.
- `skills/tickets-zordon/SKILL.md` — 3 lines under *Workflow mode*: "to work
  the whole board as a sequence of workflows that start each other, with a usage
  hold, see `relay-morpheus` → `references/chain.md`; the board rules here do
  not change". Nothing else — 5274 words already.
- `skills/watch-cortana/SKILL.md` — one table row for `level` and one
  paragraph (≤ 80 words): what it prints, that it has no side effect, who reads it.
- `skills/grayskull-power/references/routing.md` — one row: *"work all open
  tickets in staged workflows / keep going / next stage"* → `relay-morpheus`
  (chain). `grayskull-power/SKILL.md` untouched (at its 800-word budget).
- `WORKFLOW.md` — one sentence under *Rules that don't change*: a chain of
  workflows is driven from the orchestrator session, see relay.

**Untouched:** `.skillator/grayskull.md` and the other project files; the
92 %/90 % thresholds and orders in watch-cortana; `TICKETS.md` shape; the run
file's stage table columns; `tasks-sentinels`; `handoff-cortana`;
`practice/task-loop.md`; the build-* skills.

**Budgets:** router ≤ 800 (unchanged, not edited); every description ≤ ~80;
`context-audit.sh` passes on the touched set; pure ASCII in both script twins,
`-` for empty cells, LF no BOM (relay's three constraints).

---

## 8. Open risks

1. `five_hour.used_percentage` key name is `inferred` — stage 62 must capture a
   real statusline payload; if absent, the hold runs on the max and holds early.
2. Monitor's maximum wait and whether its completion reliably re-enters the
   session after hours idle is `inferred`; the re-arm loop covers a short max,
   not a Monitor that never returns — the resume path covers that.
3. No progress event from a running Workflow (`inferred`): a hung stage is seen
   only by `orphans` on dispatch time, so the limit must be generous (45 min).
4. Codes are unique per fetched-ref horizon, like ticket IDs — accepted.
5. `code-review` at every stage boundary costs turns inside the very window the
   hold protects; it stays (project rule) but is the first thing to measure in
   GREEN.
