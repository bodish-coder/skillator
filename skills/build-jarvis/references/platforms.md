# Platform adapters — build-jarvis

**Read the root `PLATFORMS.md` first — it is the authority and this file does not
repeat it.** It owns host detection, skill paths, delegation and tier switching
per host, the tier vocabulary (`deep` / `build` / `cheap` / `orchestrator`), the
slug for each tier, context checkpoints and hooks. Anything about *a host* is
there; anything about *this skill's seats* is here.

Where it is: the plugin root, `../../PLATFORMS.md` from this file once installed
(skills land at `<dest>/<name>/`, the docs at `<dest>/`), or
`../../../PLATFORMS.md` inside the skillator repo, where skills sit under
`skills/`.

## The seats, in root tier terms

| Seat | Tier from Step 0 | Job | Must not |
|---|---|---|---|
| **Design** | `deep`, or `—` | Approaches, contracts, the task breakdown, written to the design file | Write production code |
| **Build** | per task, `cheap` or `build` | Implement exactly one task block | Redesign, or expand scope beyond the block |
| **Verify** | `build`, or `deep` (held when critical) | Run VERIFICATION, review the diff | Fix what it reviews |
| **You** | `orchestrator` | Grade, dispatch, rule, park, keep the record and the tiers file | Design or code, bar a `—`-seat design file and the record |

Use different models for deep and build where the host has them; the same model
for both is a valid fallback — say so in the grade line.

## Opus versions (formerly `build-ultron`)

The Agent tool's `model` field on Claude Code takes tiers (`fable`, `opus`,
`sonnet`, `haiku`), not version slugs, so "Opus 5 designs, Opus 4.8 builds" is
not expressible there: `opus` is whatever Opus the run is on, for both seats.
Say so once if the user asks for a version split. Hosts whose model list names
versions (Cursor, and any host whose `PLATFORMS.md` column does) can take the
split; record both slugs in the grade line.

## No delegation

Pi without its subagent extension, or any host with no delegate mechanism: run
the seats **sequentially in one session**, switching model between them with the
host's own switch, and write each phase's output to disk before the switch — the
file is the handover, not chat history. Say so in the grade line
(`dispatch: sequential`).

## Parallel builds

Fan the build seat out wherever the host delegates in parallel. Two tasks that
would touch the same tree get a git worktree first (`PRACTICE.md` §8), on every
host.

## User overrides

A platform or model the user names wins over the tiers file and the defaults
(SKILL.md Step 0.6). In full ceremony it goes in the session record header.
