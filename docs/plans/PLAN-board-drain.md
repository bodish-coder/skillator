# PLAN — drain the board (RUN-3)

Owner asked 2026-09-23: "fix all tickets using staged workflow". Scope is every
open or deferred row on `TICKETS.md` at e7d7c6f.

## Condition sweep (done inline, before any stage)

- A33 `[>]` — condition was "newer codex-cli than 0.153.2". Now 0.155.1 → arrived.
- A63b `[>]` — condition was "a flag that isolates memory without suppressing
  `--plugin-dir`". claude 2.1.280 has `--bare` (skips CLAUDE.md auto-discovery,
  keeps `--plugin-dir`; needs `ANTHROPIC_API_KEY` auth) → arrived, unverified.
- A62b `[>]` — cursor-agent and pi are now installed; antigravity still is not.
  Partly arrived.
- A80 — `ren.py` still exists in an old session scratchpad → port it.

## Stages

Same-file tickets never run at once. Files per stage are the scope contract.

| # | tickets | files | tier |
|---|---|---|---|
| 1 | A77+A79 | `skills/grayskull-power/SKILL.md`, `references/routing.md` | build |
| 2 | A74 | `practice/baselines/README.md`, `skills/skill-smith/references/testing.md` | cheap |
| 3 | A78 | `practice/scripts/check-tickets.*` | cheap |
| 4 | A80 | `practice/scripts/rename-skill.py`, one line in `skills/skill-smith/SKILL.md` | cheap |
| 5 | A33 probe | scratch fixtures only; proposes PLATFORMS.md / watch-cortana text | build |
| 6 | A62b probe | scratch fixtures, `practice/baselines/transcripts/`; proposes PLATFORMS.md text | build |
| 7 | A73 probe+fix | `install.sh` (+ mirror); proposes PLATFORMS.md text | build |
| 8 | A75+A63b | `practice/scripts/baseline-harness.sh`, `practice/baselines/README.md` | build |
| 9 | host docs | `PLATFORMS.md`, `skills/watch-cortana/**` from 5-7's reports | cheap |
| 10 | A76 | harness `relay-split` fixture + two v2 re-runs | build |
| 11 | A58b | GREEN re-runs of the unattended-branch skills | build |

Waves: {1-7} → {8, 9} → {10} → {11}. Commit per wave after `code-review`.
Deferred tickets whose condition has not arrived stay `[>]`.
