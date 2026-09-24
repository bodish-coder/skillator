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
arming. Print it, then arm. Once per session, on invoke, not per request.

One call: **arm** the standing skills, **announce** the state, **route** each
request, under the §3 ground rules.

## 0. Host and canon

Read `PLATFORMS.md` (host mechanics) and `PRACTICE.md` (process canon, cited by
section below). Both sit **beside the installed skills**: try `../` first (the
`install.sh` layout — Cursor, Codex, Antigravity, Pi), then `../../` (git
checkout, Claude Code plugin cache). Neither resolves → say so and continue, and
detect the host from its own tools rather than assuming `claude-code`.

**Load [`references/hosts.md`](references/hosts.md)** — the per-host translation
of "invoke a skill", "Fable subagents", `AskUserQuestion` and the watch hooks.
Nothing else changes per host.

## 1. Arm (once, on invoke)

`tickets-zordon` (read `TICKETS.md`, report the open set) · `ponytail` (laziness
level active) · `codegraph` (indexed, else init once) · `live-friday` (if the
repo has a runnable surface) · `watch-cortana` (hooks on Claude Code, a manual
`usage-watch … check` elsewhere) · `relay-morpheus` (an unfinished `.skillator/run.md`
is the first thing you say).

Then one line, not a feature tour:

```
grayskull-power: board 3 open (B2, F7, A1) · codegraph 412 files · ponytail full · live-friday armed (npm run dev) · watch-cortana 92%/90wk · relay r7 stage 2 of 4
```

**Load [`references/arming.md`](references/arming.md)** — what each check does,
and the first-invoke persistence step writing `.skillator/grayskull.md` plus the
CLAUDE.md / AGENTS.md / GEMINI.md pointers. Already exists → skip it silently.

## 2. Route

One skill at a time; chaining "to be safe" is the failure this prevents.

| The request is… | Go to |
|---|---|
| Build a feature | `build-vision` · `build-ultron` · `build-jarvis` — they *are* PRACTICE §§1-6; nothing in front |
| A bug, cause unknown | PRACTICE §7 **first** — root cause before any fix |
| A decision, no code behind it | PRACTICE §1 in-session, then stop |
| Log, list or close a ticket | `tickets-zordon` |
| Whole-app audit · a staged diff | `audit-sherlock` · `code-review:code-review` |
| UI/UX craft · a TUI's rendering · watch it live | `design-arwen` (never `frontend-design`) · `tui-tron` · `live-friday` |
| A mock UI to make real · a spec only in chat | `designui-galadriel` · `spec-watson` |
| Screenshots · auth/secrets · a skill | `screenshot-argus` · `security-review` · `skill-smith` |
| Merge · deploy · ending · resuming | `mergeprep-oracle`→`merge-smith` · `deploy-merlin`→`deploy-niyoj` · `handoff-cortana` · `resume-cortana` |
| A staged run · written tasks to build | `relay-morpheus` · `tasks-sentinels` |
| Tricky analysis | Parallel Fable subagents; you reconcile |

**Nothing matches?** Do it directly — a one-line edit needs no skill, and still
does not escape §3: "one line" describes the diff, never the thinking.

**Load [`references/routing.md`](references/routing.md)** — every row,
the long tail, why the order holds.

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
  `code-review:code-review` over the staged diff. `audit-sherlock` is the
  whole-app / pre-release sweep, **not** a per-commit gate — a Fable fan-out an
  implementer subagent cannot run.
- **Revert first.** Never stack a fix on a broken fix.
- **Run to the end.** Six things stop a staged plan — destructive op ·
  security-sensitive action · side effect outside this worktree · 7-day limit
  at 90% · scope breach · failed repro. Never approval between stages.
  Everything else is a `Ruling:` in `.skillator/run.md`, written **before**
  dispatch (`relay-morpheus`, `tasks-sentinels`).
- **Ticket first, code second.** `[~]` on start, `[x]` only once verified.
- **Blocked → `AskUserQuestion`**, never prose. Too big for a chip → build a
  local artifact, then ask.
- Re-announce the state line only when it changes.

**Load [`references/ground-rules.md`](references/ground-rules.md)** — the full
procedure behind each: grounding steps, the scope contract, the pre-commit loop
and its 3-pass cap, the shape of a good question.
