---
name: grayskull-power
description: >-
  Use when the user says "dev mode", "activate the programming skills", "turn
  on the skillator workflow", "use our skills", "by the power of grayskull",
  "grayskull", "check screenshot", "set up for coding", or starts real
  development work in a repo with no skillator skill active. The single entry
  point that routes each request to the right skillator skill; it does not do
  the work itself. NOT for enabling/disabling skills on disk.
---

# Grayskull Power (activate the skillator workflow)

**First line of your reply on invoke, before any tool call, verbatim:**

```markdown
## ⚔️ I HAVE THE POWER!!
```

Unconditional — the receipt that the skill loaded, not a reward for a clean
arming. Print it, then arm. Once per session, on invoke; not per routed request.

One call: **arm** the standing skills, **announce** the state, **route** each
request, under the §3 ground rules.

## 0. Host and canon

Read `PLATFORMS.md` (host mechanics) and `PRACTICE.md` (process canon, cited by
section below). Both sit **beside the installed skills**; two layouts exist, so
try `../` first (the `install.sh` layout — Cursor, Codex, Antigravity, Pi), then
`../../` (git checkout, Claude Code plugin cache). Neither resolves → say so and
continue; assume the `claude-code` row only if you really are on Claude Code,
else detect the host from its own tools.

**Load [`references/hosts.md`](references/hosts.md)** — the per-host translation
of "invoke a skill", "Fable subagents", `AskUserQuestion` and the watch hooks.
Nothing else changes per host.

## 1. Arm (once, on invoke)

`ticket-master` (read `TICKETS.md`, report the open set) · `ponytail` (laziness
level active) · `codegraph` (indexed, else init once) · `live-build` (if the
repo has a runnable surface) · `handoff-watch` (hooks on Claude Code, a manual
`usage-watch … check` elsewhere).

Then one line, not a feature tour:

```
grayskull-power: board 3 open (B2, F7, A1) · codegraph 412 files · ponytail full · live-build armed (npm run dev) · handoff-watch 92%
```

**Load [`references/arming.md`](references/arming.md)** — what each check does,
and the first-invoke persistence step writing `.skillator/grayskull.md` plus the
CLAUDE.md / AGENTS.md / GEMINI.md pointers. Already exists → skip it silently.

## 2. Route

One skill at a time; chaining "to be safe" is the failure this prevents.

| The request is… | Go to |
|---|---|
| Build a feature, design-then-implement | `brainstorm-build-prime` / `-mid` / `-lite` — it *is* PRACTICE §§1-6; chain nothing in front |
| A bug with an unknown cause | PRACTICE §7 **first** — root cause before any fix |
| A decision, no code behind it | PRACTICE §1 in-session — classify, one question at a time, stop |
| A bug/feature/"log this"/"what's pending" | `ticket-master` (workflow mode at 4+ open) |
| Audit a whole app, unknown-cause rot, pre-release sweep | `sherlock-codes` |
| A working or staged diff | `code-review:code-review` (`/simplify` for quality-only) |
| Any UI/UX or front-end craft | `design-arwen` (never `frontend-design`) |
| A static/mock UI that must actually work | `func-ui` |
| "check screenshot" / verify visually | `screenshot-loop` |
| Merge · deploy · ending · resuming | `merge-prep`→`merge-agent` · `deploy-wizard`→`deploy-niyoj` · `handoff` · `handoff-resume` |
| Auth, secrets, input handling | `security-review` |
| The deliverable is a skill | `skill-smith` |
| Tricky analysis (cause unknown, spans files, wrong is expensive) | Fable subagents in parallel; you reconcile |

**Nothing matches?** Do it directly — a one-line edit needs no skill. It does
not escape §3: "one line" describes the diff, never the thinking. The blast
radius line is still written before the edit, and a fix you cannot reproduce is
still a guess at any size.

**Load [`references/routing.md`](references/routing.md)** — the full tables:
practice, the run/browser/dataviz/claude-api loop, agent work, codegraph
queries, and why the order holds.

## 3. Ground rules

- **Reproduce → read → map → tag → fix.** No repro, no remedy. Read the actual
  file, not memory of the library. Tag every claim `verified` / `inferred` /
  `guessed`; a `guessed` root cause never justifies an edit.
- **Blast radius named in one line before the edit — no line, no edit.** Not in
  your head: in your visible output. No line at the edit → write it now, or name
  the field you cannot fill without guessing and go back a step.
- **Scope contract:** >2 unrelated files, or one outside the ticket's contract,
  stops and asks. Smallest change that fixes the cause; no refactoring inside it.
- **Before a commit:** regression sweep the callers you named, then
  `code-review:code-review` over the staged diff. `sherlock-codes` is the
  whole-app / pre-release sweep, **not** a per-commit gate — a Fable fan-out an
  implementer subagent cannot run.
- **Revert first.** Never stack a fix on a broken fix.
- **Ticket first, code second.** `[~]` on start, `[x]` only once verified.
- **Blocked → `AskUserQuestion`**, never prose. Too big for a chip → build a
  local artifact, then ask.
- Re-announce the state line only when it changes.

**Load [`references/ground-rules.md`](references/ground-rules.md)** — the full
procedure behind each: grounding steps, the scope contract, the pre-commit loop
and its 3-pass cap, the shape of a good question.
