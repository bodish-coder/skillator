---
name: grayskull-power
description: >-
  Single entry point that turns on the skillator programming workflow — arms the
  always-on skills (ticket board, usage watch) and routes each piece of work to
  the right skillator skill (sherlock-codes, ticket-master, brainstorm-build-*,
  design-arwen, merge-prep, deploy-niyoj, handoff…) instead of the user having
  to remember which one to call. Use when the user says "dev mode", "activate
  the programming skills", "turn on the skillator workflow", "use our skills",
  "by the power of grayskull", "grayskull", "check screenshot", "set up for
  coding", or starts real development work in a repo and no skillator skill is active yet. Routes across
  both the skillator skills and the wider installed toolkit (superpowers process
  skills, code-review, ponytail, run, mem-search, workflow-authoring). Routes;
  it does not do the work itself — the routed skill does. NOT for
  enabling/disabling skills on disk.
---

# Grayskull Power (activate the skillator workflow)

One call, three jobs: **arm** the standing skills, **announce** the state,
**route** each request to the right skillator skill. You still do the work — this
just stops good skills sitting unused because nobody remembered them.

## 1. Arm (do this once, on invoke)

- **`ticket-master`** — read `TICKETS.md` at the repo root. Missing? Say so and
  create it on the first ticket, not before. Report the open set: `B` bugs,
  `F` features, `A` agent-found.
- **`ponytail`** — confirm the laziness level is active (the badge in the
  statusline). It governs *what* gets built for the rest of the session.
- **`handoff-watch`** — confirm it is wired (`statusLine` runs `usage-watch … -Mode
  probe` and a `Stop` hook runs `-Mode gate`). Not wired → say so in one line and
  offer to wire it. Never wire it silently.

Then state the active set in **one line** — not a feature tour:

```
grayskull-power: board 3 open (B2, F7, A1) · ponytail full · handoff-watch armed at 97%
```

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

## 3. Blocked? Ask properly

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

## 4. Keep it honest

- Ticket first, code second: anything worth more than one edit gets an ID before
  work starts, so a lost session loses nothing.
- Flip statuses when reality changes, not at the end — `[~]` on start, `[x]` only
  once verified against the repo.
- Process skill first, implementation skill second — never the reverse.
- Re-announce the one-line state only when it changes (board moved, watch fired),
  never every turn.

## Related

- `handoff-watch` — fires the end-of-session sequence automatically at 97% usage;
  that sequence is the same route this table's last two rows describe.
