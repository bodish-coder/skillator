# Platform adapters — brainstorm-build-prime

**Read the root `PLATFORMS.md` first — it is the authority and this file does not
repeat it.** It owns host detection, skill paths, how you delegate and switch
tier on each host, the tier vocabulary (`deep` / `build` / `cheap` /
`orchestrator`), the per-host model slug for each tier, context-checkpoint
mechanics, hooks, frontmatter portability, and the non-negotiables. Anything you
need about *a host* is there; anything you need about *this skill's run* is here.

Where it is: **the repo/plugin root**, two levels above this skill's directory
once installed (`../../PLATFORMS.md` from this file — skills land at
`<dest>/<name>/`, the docs at `<dest>/`), or `../../../PLATFORMS.md` inside the
skillator repo, where skills live under `skills/`.

## This skill's three seats, in root tier terms

| Seat in this skill | Root tier | Job in this run | Must not |
|---|---|---|---|
| **Design pass** | `deep` | Approaches, tradeoffs, contracts, the task breakdown, written to the design file | Write production code or edit the repo |
| **Build pass** | `build` | Implement exactly what the design file says | Redesign, or expand scope beyond the design file |
| **You, the session** | `orchestrator` | Dispatch, write the session `.md`, run handoff and Checkpoint A | Design or code directly, bar tiny edits to the session record |

Take the slug for `deep` and for `build` off the root Role tiers table, on your
host's column. Use two *different* models where the host has them; where the
design pass and the build pass end up on the same model, record that in the
session file.

## Checkpoint A — shedding context

The one checkpoint this skill has, and it is not a host feature — it is a rule
about ordering:

1. It runs **only after `handoff` has written a verified handoff to disk.** Never
   shed context without one.
2. It is **never `/compact`** — a skill cannot invoke a slash command. The move is
   always the same: carry the design forward **as a file path**, not as chat
   history, and let each subagent hold its own context.
3. Only if the orchestrator's context is still genuinely tight do you reach for
   the host's own context checkpoint (root `PLATFORMS.md`, *Context checkpoint*
   row) — and on hosts where that is something the *user* must type, say so once
   and continue from the session file rather than waiting.

**There is no Checkpoint B.** Do not clear, reset or start a new session at the
end of a run — a skill can't, and the session `.md` plus the handoff already make
a fresh start lossless whenever the *user* wants one.

## Parallel builds

Fan the build pass out wherever the host delegates in parallel. Two tasks of
*this* design that would touch the same tree get a git worktree first
(`PRACTICE.md` §8) — on every host, including the ones with no sandbox of their
own.

## User overrides

A platform or model the user names wins over everything above. Record it in the
session file header:

```
PLATFORM: <host>
DESIGN_MODEL: <slug>
BUILD_MODEL: <slug>
```
