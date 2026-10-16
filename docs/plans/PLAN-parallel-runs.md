# PLAN — parallel runs, marathon of runs, one build skill, diagrams

**Tickets:** F33 (finish) · A115 · A113 · F35 · F36 · F37 · F38 · F39 · F40 · F41
**Run:** allocated by `relay-morpheus.sh init` (see `.skillator/run-<n>-*.md`)
**Source:** owner conversation 2026-10-15 (session @cc-fa7ff0). Every decision
below was the owner's, in their words, unless tagged `Ruling:`.

Tags: `verified` = read in this repo or run · `inferred` = follows from what was
read · `guessed` = neither.

---

## 0. What the owner asked for

1. Staged workflows that run **in parallel** where they can.
2. Staged workflows that run **like a marathon**, one after the other, so user
   input is needed as little as possible.
3. Planned so **several users or sessions can run them without interfering**.
4. **One build skill** that always runs for a feature and picks its own models.
5. **Diagrams** when the system asks for a decision or shows a plan/design.
6. Themed start/away/back commands.

## 1. Owner decisions (2026-10-15)

| # | Decision |
|---|---|
| D1 | `TICKETS.md` lives in the **main checkout only**; every run writes it there under the shared lock, never on its run branch. |
| D2 | **One push per marathon**: all runs land locally, then one stop asks to push everything. |
| D3 | Merge build-vision / build-ultron / build-jarvis into **one `build-jarvis`**. |
| D4 | build-jarvis **never asks which model**: it grades each seat by complexity x criticality, uses the top tier the host has, and steps down only when a tier is unavailable. |
| D5 | **grayskull** resolves tier -> model for the host/CLI once per session, so the map is always there. |
| D6 | Design questions inside a build are **ruled or parked** the marathon way, never asked mid-build (the six stops excepted). |
| D7 | Away flow: **batch ready -> push notification to the phone -> wait 30 min -> next run in the queue starts.** |
| D8 | **No defaults, by design.** An unanswered question is never auto-ruled; its tickets stay `[!]` until answered. |
| D9 | Commands: "May the Force be with you" (also "may the force be with u", "MTFBWY", "marathon", "go marathon", "run the marathon") = whole board; "Use the Force on F35 F36" (also "marathon F35 F36", "go marathon F35 F36") = named tickets; "I'll be back" = away; "I'm back" = return. |
| D10 | Diagram skill named **`holo-r2d2`**, called on demand with **"Help me, Obi-Wan"**. |

## 2. Where we start (verified 2026-10-15)

- F31 chain mode is committed (4.5.0). F34 committed (4.6.0).
- F33 marathon (`park`/`answer`/`queue`/`chain next`/`chain edge`,
  `references/marathon.md`) is written in the working tree, **uncommitted**,
  RED recorded (`practice/baselines/transcripts/f33-red-*`), **GREEN not run**,
  S0 (hand-run paged AskUserQuestion with the owner) not run.
- `chain next` returns one `NEXT` (`relay-morpheus.sh` ~1178): stages are serial.
- All runs share one working tree and one index: RUN-10 stages 67/68 had to be
  committed through a temp index to keep F31's staged hunks out (`verified`,
  `.skillator/run-10-*.md` rulings).
- Cross-worktree ids (F21 allocator), session tags on tickets, the 20-min driver
  lease and the dispatch lock already exist. A115 (stale lock hang) is open.
- The three build skills are picked only when the model chooses them; the
  ticket path (`tickets-zordon` work-tickets, chain `--fix build`) never invokes
  them; `superpowers:brainstorming` competes (`verified`, descriptions + routing.md:84,92).

## 3. The tickets

### F33 — finish marathon (step 0)
GREEN M1-M5 x2 per PLAN-marathon.md §8.4, selftests sh+ps1, review, commit.
S0 (paged AskUserQuestion hand run) needs the owner at the keyboard; if not run,
the done line says "§4.2 paged path untested" (PLAN-marathon §8.1).

### A115 / A113 (step 0)
A115: stale-lock break re-reads the pid every spin; a pid file older than N s
with a dead pid is stale; selftest with a holder that dies before writing its
pid. A113: the stage-landing step requires the review result (or names the
allowed lighter level).

### F35 — one run, one worktree
- `init` (opt-out `--here` for the old behaviour) creates
  `<repo>/../<repo>.runs/RUN-<n>-<slug>` as a git worktree on branch
  `run/RUN-<n>-<slug>` from the current HEAD, and writes `worktree:` and
  `branch:` into the run file header.
- The run file lives in the **main checkout's** `.skillator/` (one ledger view
  for every session, D1), never only on the run branch.
- Stage commits happen in the run worktree. Landing is F38's.
- `resume` / `list` print the worktree path; a missing worktree is recreated
  from the branch.
- Done: two runs from one clone each commit their stages, neither diff appears
  in the other's commit, no temp index.

### F36 — file leases
- Registry `<git-common-dir>/skillator/leases` (one line per lease:
  `path run stage driver heartbeat`), edited under the existing lock.
- `chain dispatch` leases the stage's `files:` (directory-prefix and path
  normalisation as in F33 `chain next`); a file leased by a **live** other run
  (heartbeat < 20 min) refuses with `LEASED <path> RUN-n stage m` (exit 2).
  Landing (`stage x`) and failure (`stage !`) release. Stale leases are taken
  with a ruling.
- `chain next` prints `IDLE <n> leased <path> RUN-m` for such stages.
- Board writes: a `board` helper that edits `TICKETS.md` in the main checkout
  under the lock (D1).
- Done: selftest, two runs planning one file, one dispatches, the other idles
  until the first lands.

### F37 — parallel stages
- `chain next --all` prints every dispatchable stage (after: landed, files
  disjoint from in-flight stages and from each other, not held by a Q, not leased).
- Concurrency cap from usage: 2 below 50 % of the 5-hour window, 1 at or above;
  `RELAY_CHAIN_PARALLEL` overrides. UNOBSERVABLE -> 1.
- chain.md Step 2/3 rewritten for N in flight: each landing is processed when
  its notification arrives; the next `chain next --all` fills free slots.
- Each parallel stage gets its own worktree off the run branch (F35) and is
  merged back to the run branch on landing (fast-forward or merge commit;
  conflict = the stage fails, a ruling, retry stage).
- Done: selftest + GREEN where two file-disjoint stages are in flight at once.

### F38 — run queue, landing queue, away flow
- Queue file `<main>/.skillator/queue.md`: ordered runs; `relay-morpheus.sh
  queue-run add|list|next`. A run reaching FINAL starts the next queued run.
- Landing queue: a run whose work stages are done lands on main **one at a time
  under the lock**: rebase onto main, regression sweep, `/code-review`, version
  bump, merge to main in the main checkout. Push is not part of landing.
- End batch spans every run in the marathon: one `queue --all` across runs.
- Away flow (D7/D8): when the batch is ready and the owner is away
  ("I'll be back" sets `away: <since>` in the queue file):
  PushNotification with the holo-r2d2 page link (F41) -> Monitor wait 30 min
  for answers (AskUserQuestion pending in the terminal, or answers posted on
  the page) -> no answer: start the next queued run; questions stay open,
  their tickets `[!]`. Queue drained and still unanswered: notify again, end the
  turn cleanly. **Never a default** (D8).
- Stops: a hard stop pauses **only its own run** (the run's `hold: stop`), other
  runs continue; the 7-day stop halts everything.
- One push per marathon (D2): after every run has landed, the push is asked
  alone.
- The chain's F-ticket stages dispatch `build-jarvis` (F39) instead of a bare
  fix agent: chain.md Step 2 text.
- Done: GREEN of two queued runs with one parked question, both land, one ask.

### F39 — one build skill
- `skills/build-jarvis/SKILL.md` rewritten: Step 0 GRADE then PRACTICE §§1-6.
  Grade = tier per seat (design/build/verify) from the PRACTICE §4 table;
  ceremony full (design on disk, handoff checkpoints, session record) only for
  multi-stage or session-outliving work, else lean; user words override;
  one-line grade printed; downgrades are Rulings.
- Tier -> model comes from grayskull's `.skillator/tiers.local.md` (gitignored),
  else `PLATFORMS.md` role-tier defaults. Unavailable at dispatch -> mark down,
  step one tier down, retry, ruling. Usage >= 70 % 5h: non-critical seats step
  down one tier. Critical (auth, money, concurrency, shared contract) verify
  keeps the highest available tier.
- Design questions: decidable -> `Ruling:` into the design file's Decisions
  section; user-only -> `park` (a standalone build gets a one-stage relay run so
  parks have a home); six stops ask now, alone. "ask me as you go" /
  "brainstorm with me" switches to live questions.
- `build-vision` and `build-ultron` become redirect stubs for one release
  (their unique content moves to `build-jarvis/references/`).
- Routing: build-jarvis description matches any feature request; tickets-zordon
  logs then hands F tickets to build-jarvis; routing.md lines 84/92 agree;
  routing states build-jarvis includes design so `superpowers:brainstorming`
  does not also run; a `UserPromptSubmit` hook (Claude Code) injects the route
  for feature-shaped prompts.
- grayskull arm step `tiers` writes `.skillator/tiers.local.md` and adds
  `tiers deep=… build=… cheap=…` to the state line.
- Done: RED/GREEN ~6 feature prompts (direct, via the board, in a chain) invoke
  build-jarvis every time.

### F40 — commands
All D9 phrases routed by grayskull (routing.md + SKILL.md table) and listed in
relay-morpheus's description; "work the board" / "keep going" also route to the
marathon; `/skillator:marathon` slash command (`commands/marathon.md`) if the
plugin layout supports commands. Done: routing selftest of every phrase.

### F41 — holo-r2d2
New skill `skills/holo-r2d2/`: renders (a) end-batch question cards with each
option drawn, (b) the run's stage graph in parallel lanes, generated by a
script from the run file, (c) design components from the design file, (d) live
run status. Claude Code: a private artifact page (the page can take answers
back via its data capability; the link goes into the AskUserQuestion text and
the away-flow push). Other hosts: `.skillator/holo/<run>.html` (Mermaid) + ASCII.
Trigger "Help me, Obi-Wan" (also "help me obiwan", "help me obi wan kenobi").
It decides nothing and asks nothing. Done: RED/GREEN where an end batch of 2
questions ships a diagram page and the stage graph matches the run file.

## 4. Order (same-file work never runs at once)

```
lane A (relay-morpheus scripts, chain.md, marathon.md):
   F33 finish -> A115+A113 -> F35 -> F36 -> F37 -> F38
lane B (build-*, grayskull, tickets-zordon, routing.md, PLATFORMS.md):
   F39  (in parallel with lane A)
lane C (new skills/holo-r2d2/):
   F41 core (in parallel with A and B)
then:  F40 (routing.md + relay SKILL.md description: after F39 and F38)
       F41 hook-in (marathon.md end batch + F38 away push: after F38)
last:  regression sweep, /code-review, version bump, commit; push asked alone
```

`Ruling:` F39's chain hand-off text lands in F38's stage (chain.md is lane A's
file). Baseline runs hide `~/.claude/CLAUDE.md`, so baseline runs from all lanes
are sequential (the harness refuses while `CLAUDE.md.skillator-hidden` exists).

## 5. Commits
Stages commit only their own paths (`git add <paths>`, never `-A`) until F35
gives each run its own worktree. Each ticket: regression sweep, `/code-review`
on the staged diff, commit `<IDs>: <what> [<code>]`. Version bump per landed
feature batch (memory: plugin.json + marketplace.json). Push: once, at the end,
asked alone (D2).
