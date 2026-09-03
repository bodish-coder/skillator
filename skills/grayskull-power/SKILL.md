---
name: grayskull-power
description: >-
  Single entry point that turns on the skillator programming workflow — arms the
  always-on skills (ticket board, usage watch) and routes each piece of work to
  the right skillator skill (sherlock-codes, ticket-master, brainstorm-build-*,
  design-arwen, live-build, merge-prep, deploy-niyoj, handoff…) instead of the
  user having
  to remember which one to call. Use when the user says "dev mode", "activate
  the programming skills", "turn on the skillator workflow", "use our skills",
  "by the power of grayskull", "grayskull", "check screenshot", "set up for
  coding", or starts real development work in a repo and no skillator skill is active yet. Routes across
  both the skillator skills and the wider installed toolkit (superpowers process
  skills, code-review, ponytail, run, mem-search, workflow-authoring). Also sets
  the ground rules for the session: reproduce before fixing, map the code with
  codegraph (init it if the repo is unindexed) before suggesting a remedy, name
  the blast radius, and run sherlock-codes over the staged diff before every
  commit. Routes; it does not do the work itself — the routed skill does. Runs on
  Claude Code, Codex, Cursor, Antigravity/Gemini and Pi — the host-specific
  mechanics (loading a skill, delegating, asking) come from PLATFORMS.md. NOT
  for enabling/disabling skills on disk.
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

Works on every host skillator supports. Detect it and read
**`PLATFORMS.md` at the plugin root** (`../../PLATFORMS.md`) — that file owns
skill paths, delegation, tier switching and context checkpoints. Only the
routing below is this skill's own.

What changes per host, and nothing else:

| This skill says | Claude Code | Everywhere else |
|---|---|---|
| "invoke `<skill>`" | `Skill` tool | `/skill:<name>` or `/<name>` where it exists; otherwise read that skill's `SKILL.md` and follow it yourself — never hand skill *interpretation* to a subagent |
| "Fable subagents" (§Agent work) | `Agent` + `model: "fable"` | the host's strongest **reasoning** tier: cursor `gpt-5.6-sol-medium` via `Task`, codex `gpt-5.6-sol` at `reasoning_effort: high`, antigravity/pi `/model` to the best reasoner. No delegation available → one analysis pass in-session, design-only prompt, and say so |
| `AskUserQuestion` | the tool | a numbered list of the same options — what it does · where it hurts · which is recommended |
| "keep artifacts local" | write the file, give the path | identical, and never publish |
| `ponytail` badge, `handoff-watch` hooks | statusline + `Stop` hook | no statusline or hooks → state the laziness level in text, and run `handoff` manually when context gets tight |

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
- **`handoff-watch`** — confirm it is wired (`statusLine` runs `usage-watch … -Mode
  probe` and a `Stop` hook runs `-Mode gate`). Not wired → say so in one line and
  offer to wire it. Never wire it silently.

Then state the active set in **one line** — not a feature tour:

```
grayskull-power: board 3 open (B2, F7, A1) · codegraph 412 files indexed · ponytail full · live-build armed (npm run dev) · handoff-watch armed at 97%
```

The banner was already printed at the top of the reply (see above). It fires
**once per session**, on invoke — not on every routed request.

## 2. Route

Match the request, invoke that skill, follow it. One skill at a time — chaining
every skill "to be safe" is the failure this is meant to prevent.

**Process before implementation.** A superpowers process skill sets the approach;
the skillator skill then carries it out. "Build X" → `brainstorming`, *then*
`brainstorm-build-*`. "Fix this bug" → `systematic-debugging`, *then* the code.
Getting that order backwards is how a session produces confident wrong work.

### Practice — always in play

| When | Skill |
|---|---|
| Anything creative: a feature, a component, new behaviour | `superpowers:brainstorming` **first** |
| A bug with an unknown cause | `superpowers:systematic-debugging` **first** |
| A multi-step task with a spec already agreed | `superpowers:writing-plans` → `executing-plans` |
| New logic worth trusting | `superpowers:test-driven-development` |
| About to say "done" | `superpowers:verification-before-completion` |
| A diff worth a second pair of eyes | `code-review:code-review` (`/simplify` for quality-only) |
| Auth, secrets, input handling, anything user-facing | `security-review` |
| Branch lifecycle | `superpowers:using-git-worktrees` → `finishing-a-development-branch` |

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
| Farming a task out to subagents | `superpowers:subagent-driven-development`, `dispatching-parallel-agents` |
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
