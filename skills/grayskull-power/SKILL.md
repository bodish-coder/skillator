---
name: grayskull-power
description: >-
  Single entry point that turns on the skillator programming workflow — arms the
  always-on skills (ticket board, usage watch) and routes each piece of work to
  the right skillator skill (sherlock-codes, ticket-master, brainstorm-build-*,
  design-arwen, live-build, merge-prep, deploy-niyoj, skill-smith, handoff…) instead of the
  user having
  to remember which one to call. Use when the user says "dev mode", "activate
  the programming skills", "turn on the skillator workflow", "use our skills",
  "by the power of grayskull", "grayskull", "check screenshot", "set up for
  coding", or starts real development work in a repo and no skillator skill is active yet. Routes across
  both the skillator skills and the wider installed toolkit (code-review,
  security-review, ponytail, run, mem-search, workflow-authoring), with the
  superpowers process skills merged into PRACTICE.md rather than chained. Also sets
  the ground rules for the session: reproduce before fixing, map the code with
  codegraph (init it if the repo is unindexed) before suggesting a remedy, name
  the blast radius, and run sherlock-codes over the staged diff before every
  commit. Routes; it does not do the work itself — the routed skill does. Runs on
  Claude Code, Codex, Cursor, Antigravity/Gemini and Pi — the host-specific
  mechanics (loading a skill, delegating, asking) come from PLATFORMS.md. NOT
  for enabling/disabling skills on disk. On first activation in a repo it writes
  .skillator/grayskull.md plus pointers in CLAUDE.md / AGENTS.md / GEMINI.md so
  the workflow re-arms itself in every one of those CLIs for that project.
---

# Grayskull Power (activate the skillator workflow)

**First line of your reply on invoke, before any tool call, verbatim and alone:**

```markdown
## ⚔️ I HAVE THE POWER!!
```

Unconditional. It is the receipt that the skill loaded, not a reward for a
clean arming — print it, then arm.

One call: **arm** the standing skills, **announce** the state, **route** each
request to the right skillator skill — under ground rules (§3, §4) that keep a
remedy from becoming three new tickets. You still do the work — this
just stops good skills sitting unused because nobody remembered them.

## 0. Host

Works on every host skillator supports. Detect it and read **two files at the
plugin root**:

- **`PLATFORMS.md`** (`../../PLATFORMS.md`) — skill paths, delegation, tier
  switching, context checkpoints. Host mechanics.
- **`PRACTICE.md`** (`../../PRACTICE.md`) — skillator's process canon: the
  superpowers process skills merged in, in skillator's own words. Classification,
  questioning, plan-grade tasks, design self-review, test-first, fresh-evidence
  verification, requesting and receiving review, debugging, branch lifecycle.
  The routing table below points at its sections by number; **§7 and §5 are the
  ground rules in §3-§4 of this skill, written out**. Its `practice/` directory
  holds the mechanics — subagent prompt templates, the controller task loop, TDD
  in full, debugging techniques — loaded on demand, not up front.

Only the routing itself is this skill's own.

What changes per host, and nothing else:

| This skill says | Claude Code | Everywhere else |
|---|---|---|
| "invoke `<skill>`" | `Skill` tool | `/skill:<name>` or `/<name>` where it exists; otherwise read that skill's `SKILL.md` and follow it yourself — never hand skill *interpretation* to a subagent |
| "Fable subagents" (§Agent work) | `Agent` + `model: "fable"` | the host's strongest **reasoning** tier: cursor `gpt-5.6-sol-medium` via `Task`, codex `gpt-5.6-sol` at `reasoning_effort: high`, antigravity/pi `/model` to the best reasoner. No delegation available → one analysis pass in-session, design-only prompt, and say so |
| `AskUserQuestion` | the tool | a numbered list of the same options — what it does · where it hurts · which is recommended |
| "keep artifacts local" | write the file, give the path | identical, and never publish |
| `ponytail` badge, `handoff-watch` hooks | statusline + `Stop` hook | no statusline → state the laziness level in text. No injecting turn-end hook either → run `usage-watch … check` (§1) yourself before each non-trivial step; on cursor/antigravity it has no percentage to read, so run `handoff` manually when context gets tight |

`codegraph`, `TICKETS.md`, git and the ground rules in §3–§4 are plain files and
commands — they work the same everywhere, no adapter needed.

## 1. Arm (do this once, on invoke)

- **`ticket-master`** — read `TICKETS.md` at the repo root. Missing? Say so and
  create it on the first ticket, not before. Report the open set: `B` bugs,
  `F` features, `A` agent-found.
- **`ponytail`** — confirm the laziness level is active (the badge in the
  statusline). It governs *what* gets built for the rest of the session.
- **`codegraph`** — the code map the rest of this skill leans on. Check in order:
  `command -v codegraph` → missing? say so and offer
  `npm i -g @colbymchenry/codegraph` (never install silently). Present but
  `codegraph status` shows **0 files / 0 nodes** → `codegraph init` (then
  `codegraph index` if it was already initialized), **once**. Still 0 after that
  means the repo has no indexable source — a docs/skills/config repo — so say
  `codegraph: no code to index` and never retry it this session. Already indexed
  → `codegraph sync` and move on.
- **`live-build`** — if the repo has a runnable surface (a dev script, `Cargo.toml`,
  `CMakeLists.txt`, a `Makefile`, `go.mod`, a Python entry point), it is armed:
  the *first* change to that project starts the app or build in the background
  and hands over the URL/command **before** the edits, so the user watches it run
  instead of waiting on a reply. Nothing runnable → say `live-build: nothing to
  launch` once and drop it. Never auto-launch simulators, migrations or deploys.
- **`handoff-watch`** — on **Claude Code**, confirm the hooks are wired
  (`statusLine` runs `usage-watch … -Mode probe`, a `Stop` hook runs `-Mode
  gate`). Not wired → say so in one line and offer to wire it; never wire it
  silently. On **every other host** there is no such hook: run
  `usage-watch.ps1 -Mode check` / `usage-watch.sh check` once here and report
  exactly what it says. It reads a real percentage on codex and reports "no
  usage signal on this host" on cursor and antigravity — repeat that verbatim
  rather than calling it armed. See that skill's **Other hosts** table.

Then state the active set in **one line** — not a feature tour:

```
grayskull-power: board 3 open (B2, F7, A1) · codegraph 412 files indexed · ponytail full · live-build armed (npm run dev) · handoff-watch armed at 97%
```

The banner was already printed at the top of the reply (see above). It fires
**once per session**, on invoke — not on every routed request.

## 1b. Persist it for this project (once, then never again)

Activation should survive the session and the host. Every one of these CLIs
already reads an always-on instruction file from the repo root — that is the
carrier, no hook required.

On the **first** invoke in a repo, write these four small files and say so in
one line. If `.skillator/grayskull.md` already exists, activation is already
persisted: skip this whole step silently.

**`.skillator/grayskull.md`** — the single source of truth:

```markdown
# grayskull-power is ON for this project

Load and follow `skillator:grayskull-power` for all work in this repo, before
anything else. Claude Code: the `Skill` tool. Antigravity: `/grayskull-power`.
Pi: `/skill:grayskull-power`. Codex / Cursor: read that skill's `SKILL.md` and
follow it yourself. Print its banner once per session, then route per its table.

Standing rules, no reminder needed:
- `TICKETS.md` at the repo root is the board — `skillator:ticket-master` owns it.
- Reproduce before fixing. Map with `codegraph` before proposing a remedy.
- `skillator:sherlock-codes` over the staged diff before every commit.
- Usage watch — before each non-trivial step run
  `<SKILL_DIR>/../handoff-watch/hooks/usage-watch.sh check`
  (Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File
  "<SKILL_DIR>/../handoff-watch/hooks/usage-watch.ps1" -Mode check`).
  It prints `HANDOFF NOW` plus an order — stop and follow it exactly.
  On Claude Code the `Stop` hook already does this; skip the manual call there.
```

Substitute the real absolute path for `<SKILL_DIR>` when you write it.

Then the three host pointers, **appended** (never overwriting what is there):

| File | Read by | Line to append |
|---|---|---|
| `CLAUDE.md` | Claude Code | `@.skillator/grayskull.md` |
| `AGENTS.md` | Codex, Cursor | `Read and follow ./.skillator/grayskull.md before any work in this repo.` |
| `GEMINI.md` | Antigravity | `@.skillator/grayskull.md` |

Create a file only if it is missing; if it exists, append the line only when it
isn't already present. Three near-identical pointers is deliberate — each host
reads its own name, and a symlink is not portable to Windows.

Deactivating is deleting `.skillator/grayskull.md`; the pointers then resolve to
nothing and are harmless. Say that once, don't repeat it.

## 2. Route

Match the request, invoke that skill, follow it. One skill at a time — chaining
every skill "to be safe" is the failure this is meant to prevent.

**Process before implementation** — but only where the process skill adds
something the skillator skill doesn't already own.

`brainstorm-build-*` **is** the process for a build: it runs `PRACTICE.md` §§1-6
and adds tier routing, a session record and a rework loop on top. Chaining any of
the merged process skills in front of it re-runs the same work and burns the
budget the build needs.
**"Build X" → `brainstorm-build-*` directly.** When the answer is a decision and
no code will be written, run PRACTICE §1 here in the session instead — classify,
ask one question at a time, present, stop.

The order still holds for the process that isn't inside a build: **"fix this
bug" → PRACTICE §7 first, then the code.** Root cause before any fix. Getting
that backwards is how a session produces confident wrong work.

### Practice — always in play

| When | Skill |
|---|---|
| Anything creative that ends in code | `brainstorm-build-*` — it runs PRACTICE §§1-6 for you |
| A design/decision question with no build behind it | PRACTICE §1 — classify, question one at a time, present, stop |
| A bug with an unknown cause | **PRACTICE §7 first** — root cause before any fix, and the three-fix rule |
| A multi-step task with a spec already agreed, outside a build run | PRACTICE §2 — write the tasks in plan shape, then §3 self-review them |
| New logic worth trusting | PRACTICE §4 — test first |
| About to say "done" | PRACTICE §5 — fresh evidence or no claim |
| A diff worth a second pair of eyes | PRACTICE §6, via `code-review:code-review` (`/simplify` for quality-only) |
| Review findings landing on you | PRACTICE §6 — verify against this codebase before implementing |
| Auth, secrets, input handling, anything user-facing | `security-review` |
| The deliverable is itself a skill, or a skill isn't triggering | `skill-smith` |
| Branch lifecycle | PRACTICE §8 — isolation, then the finish menu |

### The loop — see it actually work

| When | Skill |
|---|---|
| About to change anything runnable — start it first so the user can watch | `live-build` (armed by default, §1) |
| "Does this run?" — launch the app and look | `run` |
| Drive a real browser: click, fill, read console | `webapp-testing`, `browse` |
| Any chart, graph, dashboard — before the first line | `dataviz` |
| Anything Claude/Anthropic/LLM-shaped — models, pricing, tools, agents | `claude-api` **before** opening the file |

### Agent work

| When | Skill |
|---|---|
| Farming a task out to subagents | PRACTICE §4 — one task per agent, fresh context, review before the next dispatch |
| Writing a `Workflow` script (user opted in) | `workflow-authoring` **before** the script |
| "Have we hit this before?" — recall past sessions | `claude-mem:mem-search` |
| A codebase nobody here knows yet | `understand-anything:understand`, `claude-mem:learn-codebase` |
| Who calls this / what breaks if I change it | `codegraph` (`callers`, `impact`, `explore`) |
| A whole-repo knowledge graph, docs and code together | `graphify` |

**Tricky analysis and review go to Fable.** Anything where the answer is a
judgement rather than a lookup — root-cause analysis, a code or design review, an
architecture critique, a subtle-correctness or concurrency read, "why is this
actually happening" — is farmed to subagents on Fable:
`Agent({subagent_type: "claude", model: "fable", prompt: ...})`, one per angle,
in a single message so they run in parallel — on another host, its reasoning
tier per §0. Tricky means: cause unknown, the
reasoning spans files, or being wrong is expensive. A grep, a file read, a
one-file diff, a mechanical sweep is not tricky — do it yourself; spawning an
agent for it costs more than the answer. You keep the verdict: read the reports,
reconcile them, and re-check anything an agent asserts without evidence.

### Skillator — our own

| The request is… | Skill |
|---|---|
| A bug, a feature, "log this", "what's pending", "mark done" | `ticket-master` |
| 4+ open tickets, a sweep, "ultracode", "work the board" | `ticket-master` (workflow mode) |
| "why is this broken", audit a whole app, unknown-cause rot | `sherlock-codes` |
| Build a real feature, design-then-implement | `brainstorm-build-prime` (ceremony, Fable design) · `-mid` (all-Opus, no ceremony) · `-lite` (Sonnet offload) |
| Any UI/UX or front-end craft — build, redesign, improve, critique, native or web | `design-arwen` (never `frontend-design`) |
| A static/mock UI that needs to actually work | `func-ui` |
| "check screenshot", or verify a change in a running app visually | `screenshot-loop` |
| Ready to merge a branch | `merge-prep`, then `merge-agent` |
| Ship to a VPS / set up deployment | `deploy-wizard`, then `deploy-niyoj` |
| Session ending, context or usage running out | `handoff` |
| Starting from someone else's handoff doc | `handoff-resume` |

**Nothing matches?** Do the work directly. A one-line edit needs no skill, and
routing it through one is the opposite of the point.

## 3. Ground it before you remedy

**No presumption.** A fix for code you have not read is a guess, and a guess that
half-lands is how one bug becomes three `A` tickets.

1. **Reproduce first.** No failing test, failing command, or copied error text →
   no remedy. A fix for a bug you cannot trigger is untestable by definition.
   Cannot reproduce (needs hardware, a device, a build)? Say so and ticket it —
   do not fix blind.
2. **Read the source of truth** — the actual file, the actual error, the actual
   upstream docs. Not memory of how the library "usually" behaves. The map is
   second-hand; a stale index lies confidently, so code beats graph on conflict.
3. **Map before you cut.** `codegraph explore "<area>"` for the lay of the land,
   `codegraph callers <symbol>` and `codegraph impact <symbol>` for who breaks.
   `understand-anything:understand` for architecture, `graphify` for a repo-wide
   graph, `claude-mem:mem-search` for "have we hit this before".
4. **Tag every claim** — `verified` (you ran it or read it), `inferred` (follows
   from what you read), `guessed` (neither). One word, in the diagnosis. A
   `guessed` root cause never justifies an edit; go back to step 1.

State the blast radius in one line before editing — **no line, no edit**:

```
foo() → impact: 3 callers (a.ts:40, b.ts:12, worker.ts:88) · no schema change · affected tests: 2 of 3 · verified
```

### Scope contract

Every ticket names the files it may touch, before work starts. Then:

- **Two-file rule** — a fix spanning more than 2 unrelated files stops and asks
  via `AskUserQuestion`. Needing a second unrelated file to stay correct is a
  design problem, not a bigger diff.
- **Out-of-contract file** → new ticket, not a wider commit. That is the whole
  point of the board.
- **Smallest change that fixes the cause** and breaks nothing downstream.
  Refactoring while fixing hides the fix inside the noise.

## 4. Before a commit — sweep, then sherlock

**Regression sweep first.** The blast-radius line is worthless if nobody checks
it afterwards. Run the callers you named, plus `codegraph affected <changed
files>` for the tests that cover them. Green, or the fix is not done.

Then `sherlock-codes` over the staged diff — **scoped to the files in this
commit**, not the whole repo. Give it `git diff --cached --name-only` as the
scene: the changed files plus what they touch, so a finding is about this change
and not the file's whole history. Loop:

1. Findings? Fix them, re-stage, run it again.
2. Real but out of scope → `A` ticket via `ticket-master`, then commit.
3. Clean → commit, then `codegraph sync` so the map matches the tree.

Cap at 3 passes. Still surfacing new findings on the third → stop and
`AskUserQuestion`. Never commit past a finding by declaring it unrelated.

**Revert first.** A fix that caused a regression gets reverted before it gets
re-fixed. Never stack a fix on a broken fix — that is how a one-line bug becomes
an afternoon.

## 5. Blocked? Ask properly

Anything that stops for the user — a decision, a missing fact, an approval —
uses `AskUserQuestion`, never a plain paragraph of prose. Every option carries:

- **what it does** — the concrete change, in one line
- **where it hurts** — the cost, risk, or thing it rules out
- **(Recommended)** on the first option, which is the one you'd pick

If the choice needs more than a chip's worth of context to judge — a layout, a
diff, a table of trade-offs, a plan, competing designs — build it as an
**artifact** first (load `artifact-design`), hand it over, then ask. Terminal
scrollback is not where a decision gets made.

**Keep artifacts local.** Write the HTML to a file in the repo or scratchpad and
give the user the path — do not call the `Artifact` tool. Publishing puts the
page on claude.ai; only do that when the user asks for a link or says to share
it.

## 6. Keep it honest

- Ticket first, code second: anything worth more than one edit gets an ID before
  work starts, so a lost session loses nothing.
- Flip statuses when reality changes, not at the end — `[~]` on start, `[x]` only
  once verified against the repo.
- Process skill first, implementation skill second — never the reverse.
- Tricky analysis or review → Fable subagents in parallel; you reconcile.
- Reproduce → read → map → tag → fix. Skipping a step is how confident wrong work ships.
- Blast radius named before the edit, swept after it, sherlock before the commit.
- Runnable project? The `live:` line goes in the *first* reply, not after the work.
- Scope contract holds: >2 unrelated files, or an out-of-contract file, stops and asks.
- Re-announce the one-line state only when it changes (board moved, watch fired),
  never every turn.

## Related

- `handoff-watch` — fires the end-of-session sequence automatically at 97% usage;
  that sequence is the same route this table's last two rows describe.
