# Grade — the detail behind SKILL.md Step 0

## The tiers file

`grayskull-power` writes `.skillator/tiers.local.md` once per session (its
`tiers` arm step, `skills/grayskull-power/references/arming.md`). It is local to
the machine and gitignored (`.skillator/*.local.md`): which models a host can
reach is a fact about this account, not about the repo.

```
# skillator tiers - written by grayskull-power (arm step `tiers`); local, never committed
host: claude-code
deep: fable
build: opus
cheap: sonnet
written: 2026-10-15
down: fable 2026-10-15T14:02Z dispatch said: model not available
```

- One model per tier, the first slug in the host's column of `PLATFORMS.md`
  § Role tiers unless the user named another.
- `down:` lines are appended by build-jarvis (below) and dropped by grayskull's
  next arm when they are not from today.
- File missing or unreadable → use the `PLATFORMS.md` defaults and say
  `tiers: defaults` in the grade line. Never stop the build over it.

On Claude Code the slugs are the Agent tool's `model` values: `fable`, `opus`,
`sonnet`, `haiku`. On codex a tier is a `reasoning_effort`, so the file reads
`build: gpt-6-astra/medium`. Elsewhere, whatever the host's column says.

## Unavailable at dispatch

A dispatch that fails because the model is unavailable — "model not
available", "not enabled for this account", "unknown model", a 404 on the
model — is not a failed task:

1. Append `down: <model> <UTC time> <the error, one line>` to the tiers file.
2. Re-dispatch the **same prompt** one tier lower (deep → build → cheap; a
   down cheap model goes to the next slug in the host's cheap column).
3. Write `Ruling: <seat> <from>-><to> - <model> unavailable - <cost if wrong>`.
4. A held (critical verify) seat takes the highest tier still up, never lower
   than build; nothing left at build → that is a stop, ask.

Any other failure — a timeout, a crash, an agent that returned nothing — is the
task failing and goes through Phase 2's fix loop, not down a tier.

## Usage step-down

Read the 5-hour window once at Step 0 and again before each new phase:
`sh <watch-cortana>/hooks/usage-watch.sh level` (Windows: the `.ps1` with
`-Mode level`), field `5h=`. At **70 %** or more, every non-critical seat steps
down one tier for the phases not yet dispatched. The floors still hold: verify
never below build, a held seat never stepped down. A reading that crosses 70 %
mid-build changes the seats not yet dispatched, never one in flight. `5h=-` or
`src=none` → no step-down, and the grade line says `usage unobservable`.

This is the build's own economy, separate from `relay-morpheus`'s 80 % chain
hold and `watch-cortana`'s 92 % handoff, which still fire as they always do.

## User words

| They said | Seats |
|---|---|
| "use fable", "fable designs", "creative design" | design + every deep seat → fable |
| "opus only", "all opus", "straight opus" | every seat → opus |
| "cheap", "on a budget", "save tokens", "offload to sonnet" | every non-critical seat one tier lower |
| "top tier", "best models", "no expense spared" | every seat → deep |
| "full ceremony", "keep a record", "so it survives" | ceremony full |
| "ask me as you go", "brainstorm with me", "design it with me" | live questions (SKILL.md, design questions) |
| a named model ("design on opus") | that seat → that model |

User words apply after the table and before the usage step-down. They never
lift a held seat's floor down: "cheap" leaves a critical verify on deep.

## The ui field

The grade line's `ui` field sits between `ceremony` and `mode`:
`… · ceremony lean · ui arwen · mode ask (single) · …`

- `ui arwen` - the work adds or changes a web or native surface (page, screen,
  dashboard, form, a GUI).
- `ui tron` - the surface is a terminal UI (TUI, curses, Textual, Rich, Ink,
  bare ANSI, the ops board's pane or app).
- `ui none` - no user-facing surface changes.

Decided in Step 0 from the request or ticket and the files it names. Doubt
between arwen and tron → the file's framework decides. A feature touching both
→ `ui arwen+tron`, two UI passes, arwen first. Not `none` → Phase 1 runs the UI
design pass after the core design (SKILL.md Phase 1).

## Worked grades

| Request | Reads like | Grade line |
|---|---|---|
| `report.by_author()` returns `{author: count}` (one file, named) | row 1 | `design - · build cheap · verify build · critical no` |
| `--version` prints `shelf 0.1.0` (one file, named) | row 1 | `design - · build cheap · verify build · critical no` |
| `export` subcommand + new `export.py`, CSV with a header (2 files, full spec) | row 2 | `design - · build cheap · verify build · critical no` |
| Lending: check out / return, never two holders, races | rows 3 + critical (concurrency) | `design deep · build build · verify deep held · critical yes (concurrency)` |
| Same lending feature at 5h 74 % | critical: no seat steps down | `design deep · build build · verify deep held · usage 5h 74%` — the step-down is for non-critical seats only |
| `import` command across `cli.py`, `store.py`, `models.py`, merge rule left open, at 5h 74 % | row 3, non-critical | `design build · build cheap · verify build · usage 5h 74%` + two Rulings (design deep->build, build build->cheap; verify stays on its build floor) |
| Settings screen: sort order remembered (`cli.py`, `settings.py`, new screen) | row 3 + a web/native surface | `design deep · build build · verify build · ui arwen` |
| ops pane: a Close button in Diagnose | a terminal surface | `… · ui tron` — the pane's `claude plugin test` frames are the render proof |

## Parking from a standalone build

`relay-morpheus park` needs a run with a `## Chain` section. A build that is
not already a relay stage opens a one-stage run before its first park
(`<relay>` is `skills/relay-morpheus/hooks/relay-morpheus.sh`, `.ps1` on
Windows):

```sh
sh <relay> init <design-file> "<feature title>" "build <slug>"   # prints the stage number n
sh <relay> chain plan <n> --prompt-file <design-file> --mode agents --files "<files>"
sh <relay> park --stage <n> --ticket <F-id or slug> ...          # flags: relay-morpheus references/marathon.md
```

Parked questions are asked together at the end (`relay-morpheus queue`), never
one by one mid-build. Work that depends on a parked answer is not built; work
that does not is.
