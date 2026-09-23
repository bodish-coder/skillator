# Arming the standing skills — the detail behind SKILL.md §1

Run once, on invoke. SKILL.md carries the one-line summary of each; this is what
each one actually means.

- **`tickets-zordon`** — read `TICKETS.md` at the repo root. Missing? Say so and
  create it on the first ticket, not before. Report the open set: `B` bugs,
  `F` features, `A` agent-found.
- **`ponytail`** — confirm the laziness level is active (the badge in the
  statusline). It governs *what* gets built for the rest of the session.
- **`codegraph`** — the code map the rest of the skill leans on. Check in order:
  `command -v codegraph` → missing? say so and offer
  `npm i -g @colbymchenry/codegraph` (never install silently). Present but
  `codegraph status` shows **0 files / 0 nodes** → `codegraph init` (then
  `codegraph index` if it was already initialized), **once**. Still 0 after that
  means the repo has no indexable source — a docs/skills/config repo — so say
  `codegraph: no code to index` and never retry it this session. Already indexed
  → `codegraph sync` and move on.
- **`live-friday`** — if the repo has a runnable surface (a dev script,
  `Cargo.toml`, `CMakeLists.txt`, a `Makefile`, `go.mod`, a Python entry point),
  it is armed: the *first* change to that project starts the app or build in the
  background and hands over the URL/command **before** the edits, so the user
  watches it run instead of waiting on a reply. Nothing runnable → say
  `live-friday: nothing to launch` once and drop it. Never auto-launch
  simulators, migrations or deploys.
- **`watch-cortana`** — on **Claude Code**, confirm the hooks are wired
  (`statusLine` runs `usage-watch … -Mode probe`, a `Stop` hook runs
  `-Mode gate`). Not wired → say so in one line and offer to wire it; never wire
  it silently. On **every other host** there is no hook that can read the usage %
and inject at turn end (cursor and antigravity have turn-end hooks; they have no
percentage to give them — see `PLATFORMS.md`), so run
  `usage-watch.ps1 -Mode check` / `usage-watch.sh check` once here and report
  exactly what it says. It reads a real percentage on codex and reports "no
  usage signal on this host" on cursor and antigravity — repeat that verbatim
  rather than calling it armed. See that skill's **Other hosts** table.
- **Upstream watch** (F23c) — only in a repo that has
  `skills/design-arwen/UPSTREAM.md` (skillator itself); anywhere else skip it
  silently, because those tickets belong on skillator's board, not the user's.
  Run `sh practice/scripts/upstream-check.sh --daily` (Windows:
  `powershell -NoProfile -ExecutionPolicy Bypass -File
  practice/scripts/upstream-check.ps1 -Daily`). `--daily` makes it a no-op after
  the first finished run of the day; the stamp is
  `$(git rev-parse --git-common-dir)/skillator/upstream-check.day`, shared by
  every worktree. Act on the output:
  - `skipped:` or exit 0: nothing to do.
  - each `changed <name> <old>..<new> <url>` line (exit 1, and also exit 2,
    because one failed row does not hide another's change): look for an open
    (`[ ]` or `[~]`) ticket line in `TICKETS.md` that names both `<name>` and
    `<new>`. If there is one, it is already logged. If not, take a number with
    `sh practice/scripts/next-id.sh A` and add
    `- [ ] A<n> — absorb <name> <old>..<new> into design-arwen (<url>)`. The
    procedure is in `skills/design-arwen/UPSTREAM.md`.
  - each `error` line (exit 2): report it in the active-set line as
    `upstreams: check failed (<name>)`. Never call a failed check unchanged. No
    stamp is written, so the next session retries it.

  This is detection and a ticket, never an edit to arwen. Absorbing is a normal
  ticket that someone takes on purpose.

Then state the active set in **one line** — not a feature tour:

```
grayskull-power: board 3 open (B2, F7, A1) · codegraph 412 files indexed · ponytail full · live-friday armed (npm run dev) · watch-cortana armed at 92%
```

The banner is printed at the top of the reply, before any of this. It fires
**once per session**, on invoke — not on every routed request.

---

# Persist it for this project (once, then never again)

Activation should survive the session and the host. Every one of these CLIs
already reads an always-on instruction file from the repo root — that is the
carrier, no hook required.

On the **first** invoke in a repo, write these four small files and say so in
one line. If `.skillator/grayskull.md` already exists, activation is already
persisted: skip this whole step silently.

**`.skillator/grayskull.md`** — the single source of truth:

```markdown
# grayskull-power is ON for this project

Load and follow `skillator:grayskull-power` for all work here, before
anything else. Claude Code: `Skill` tool; Antigravity: `/grayskull-power`;
Pi: `/skill:grayskull-power`; Codex/Cursor: read that skill's `SKILL.md`.
Print its banner once per session, then route per table.

Standing rules:
- `TICKETS.md` is the board — `skillator:tickets-zordon` owns it.
- Reproduce before fixing; map with `codegraph` first.
- Before every commit: regression sweep, then `/code-review`
  (`code-review:code-review`) on the staged diff. `skillator:audit-sherlock`
  is the whole-app sweep — pre-release, handover, rot — never per-commit,
  never inside an implementer.
- Staged work runs to the end, no stop between stages. Six stops: a
  destructive op, a security-sensitive action, a side effect outside this
  worktree (merge, push, publish), the 7-day limit at 90%, a scope-contract
  breach, a failed repro. Else log a `Ruling:` in the run file.
  `skillator:relay-morpheus` owns `.skillator/run.md`, updated before
  dispatch, never after.
- One task per fresh implementer, own prompt, no session history —
  `skillator:tasks-sentinels` runs that loop. Same-file tasks do not fan out.
- Usage watch — before each non-trivial step run
  `<SKILL_DIR>/../watch-cortana/hooks/usage-watch.sh check`
  (Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File
  "<SKILL_DIR>/../watch-cortana/hooks/usage-watch.ps1" -Mode check`).
  It prints `HANDOFF NOW` plus an order — follow it. Claude Code's `Stop`
  hook does this already; skip it.
```

Write that block **verbatim**, with exactly one substitution — `<SKILL_DIR>`,
which occurs twice (once for `.sh`, once for `.ps1`). Nothing else in the block
varies per repo.

`<SKILL_DIR>` is the directory that contains grayskull-power's own `SKILL.md`:

- **Normally** — the skill is installed outside the repo — write its **absolute**
  path, forward slashes, no trailing slash. e.g.
  `C:/Users/me/.claude/plugins/skillator/skills/grayskull-power`.
- **If that directory is inside the repo being activated** (skillator itself,
  dogfooding), write it **relative to the repo root** instead —
  `skills/grayskull-power` — so the file stays correct for every clone.

Leave the `/../watch-cortana/…` tail exactly as written; do **not** pre-normalise
the `/../` away. The check at `practice/scripts/check-grayskull-sync.sh` compares
the live `.skillator/grayskull.md` against this block on precisely that rule, so
a hand-tidied path reads as drift.

The path must resolve to a real `usage-watch.sh`. In any repo that is *not*
skillator, a repo-relative `skills/watch-cortana/…` does not exist — that is why
the absolute form is the default.

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
