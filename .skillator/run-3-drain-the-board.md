# RUN-3 - drain the board
plan: docs/plans/PLAN-board-drain.md
started: 2026-09-23T01:59Z   updated: 2026-09-23T02:21Z

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 1 | A77+A79 router | ~ | build:opus | 2026-09-23T02:01Z | - |
| 2 | A74 pressure rule | ~ | build:sonnet | 2026-09-23T02:05Z | - |
| 3 | A78 ticket content check | ~ | build:sonnet | 2026-09-23T02:06Z | - |
| 4 | A80 rename script | ~ | build:sonnet | 2026-09-23T02:12Z | - |
| 5 | A33 codex Stop probe | ~ | build:opus | 2026-09-23T02:18Z | - |
| 6 | A62b cursor+pi probe | ~ | build:opus | 2026-09-23T02:21Z | - |
| 7 | A73 double registration | ~ | build:opus | 2026-09-23T02:20Z | - |
| 8 | A75+A63b harness |   | - | - | - |
| 9 | host docs apply |   | - | - | - |
| 10 | A76 relay-split RED |   | - | - | - |
| 11 | A58b GREEN reruns |   | - | - | - |

## In flight
### common preamble (prefixed to every stage prompt below)
prompt: |
  You are working in the git repo C:\tools\Projects\skillator2 (skillator: a
  plugin of agent skills; 23 skills under skills/, process docs under
  practice/, host docs in PLATFORMS.md). Your ticket's full text:
  `grep -n '<ID>' TICKETS.md` - read the whole line first; it is the spec.
  Rules: (1) Edit ONLY the files listed as yours. Anything else you think needs
  changing goes in your report as a proposal with exact text. (2) Never edit
  TICKETS.md, never commit, never push, never write under the user's home
  (~/.codex, ~/.agents, ~/.cursor, ~/.gemini, ~/.pi, ~/.claude or elsewhere) -
  build fixtures in a temp dir, point HOME/CODEX_HOME-style overrides there if
  needed, and never copy credential files. (3) Read/write text as UTF-8 (the
  docs are full of em dashes; bare Python open() on Windows reads cp1252 and
  silently matches nothing). Shell/PowerShell scripts stay pure ASCII. (4)
  Verify by running things, not by reading them; tag claims verified /
  inferred. (5) If a nested agent CLI run or permission is refused, report the
  exact refusal instead of working around it. Report in under 400 words: files
  changed + one line each, verification run with trimmed output, proposals for
  files you don't own (exact text), unrelated defects that name a change (one
  line each).

### stage 1 - A77+A79 router  (dispatched wave 1)
prompt: |
  Tickets A77 and A79. Yours: skills/grayskull-power/SKILL.md and
  skills/grayskull-power/references/routing.md. Goal: SKILL.md at or under
  ~800 words (measure with `wc -w` and practice/scripts/context-audit.sh
  before and after) AND the always-on section 2 routing table names
  `a11y-toph` for accessibility requests. Cut section 2's table first; move
  depth to references/routing.md so nothing cut is lost. Keep the banner
  block, the six stop conditions, and every ground rule. Every skill dir name
  in skills/ must still be reachable by name from SKILL.md or routing.md -
  check each by grep. Run any selftest under practice/scripts that covers
  grayskull-power.

### stage 2 - A74 pressure rule  (dispatched wave 1)
prompt: |
  Ticket A74. Yours: practice/baselines/README.md and
  skills/skill-smith/references/testing.md. Add the distinction, briefly and
  in each file's existing style: scenario pressure may make the right answer
  costly, never wrong. A pressure that is a direct user prohibition of the
  behaviour under test voids a GREEN (obeying the user is then correct); a RED
  can survive it only if its claim is that the behaviour did not happen. Cite
  the evidence in practice/baselines/green-relay-morpheus.txt (section 2 vs 3)
  and name the void scenarios the ticket names. Check the two files do not
  now contradict anything else in them.

### stage 3 - A78 ticket content check  (dispatched wave 1)
prompt: |
  Ticket A78. Yours: practice/scripts/check-tickets.sh and its .ps1 mirror if
  one exists (keep them equivalent). Add a check that fails when a `[x]` row's
  text ends in a bare plan pointer (`Plan: S<n>`, optionally followed by a
  trailing `(...)` tag) with no outcome recorded. Extend the script's selftest
  if it has one (add a failing and a passing case). Run it against the real
  TICKETS.md: if existing rows fail, list them in your report - do not edit
  TICKETS.md.

### stage 4 - A80 rename script  (dispatched wave 1)
prompt: |
  Ticket A80. The script it names still exists:
  C:/Users/Ikran/AppData/Local/Temp/claude/C--tools-Projects-skillator2/5df3fb8e-f90e-4c77-895b-66bba4686f96/scratchpad/ren.py
  Yours: practice/scripts/rename-skill.py (new) and at most two lines in
  skills/skill-smith/SKILL.md's naming section pointing at it. Port ren.py as
  a parameterised tool (`rename-skill.py <old> <new> [--dry-run]`, not a
  hardcoded mapping) with the ticket's guards: (a) refuse a replacement whose
  output the old pattern matches again (the r2d2-r2d2-relay bug), (b) an
  exclusion list for storage paths that are not references
  (`~/.claude/handoff-watch/` is the known one), (c) after the mechanical
  pass, grep for the old name - bare cross-references and `# heading` lines -
  and print them as the manual pass, exiting non-zero if any remain. Include
  `--selftest` that builds a temp fixture and asserts all three guards. UTF-8
  I/O throughout. Run the selftest, and a --dry-run on the real repo for a
  skill that exists, showing it changes nothing on disk.

### stage 5 - A33 codex Stop probe  (dispatched wave 1)
prompt: |
  Ticket A33. codex-cli is now 0.155.1 (the ticket was deferred until a build
  newer than 0.153.2). Yours: scratch fixtures only. Read PLATFORMS.md's codex
  hook text and skills/watch-cortana/ hooks to learn what Stop is expected to
  do. In a throwaway git fixture, test whether a codex `Stop` hook handler
  runs under `codex exec` on 0.155.1, via a per-repo `.codex/hooks.json` and
  via a temp CODEX_HOME only if that works without copying credentials. If it
  runs, answer the exit-2-on-stderr question the ticket names. Do not edit
  PLATFORMS.md or watch-cortana: propose the exact replacement text for the
  caveats the ticket says to drop (or keep, with the new evidence). Put the
  probe transcript text in your report.

### stage 6 - A62b cursor+pi probe  (dispatched wave 1)
prompt: |
  Ticket A62b (read A62 and A62a too). cursor-agent and pi are now installed
  on this machine; antigravity is not (leave it deferred). Yours: scratch
  fixtures, and new transcript files under practice/baselines/transcripts/
  named like the existing codex ones. Repeat the A62a method (see those
  transcripts and PLATFORMS.md Auto-invocation) for cursor-agent and pi: does
  each load a skillator skill unprompted from a throwaway fixture with no
  project instruction file? Prefer project-local skill dirs inside the
  fixture; never write to the user's home skill dirs. For cursor, try the
  ticket's untried probe (CLAUDE_CONFIG_DIR pointed at an empty temp dir). If
  pi has no working provider credential, report exactly that. Two runs per
  host where a run is possible. Do not edit PLATFORMS.md; propose the exact
  new table rows.

### stage 7 - A73 double registration  (dispatched wave 1)
prompt: |
  Ticket A73. Yours: install.sh and its mirror (install.ps1 or similar) if
  one exists. First measure, read-only: on gemini 0.57 (`gemini skills list
  --all`) and pi, are skills in both the host's own dir and ~/.agents/skills
  loaded, and does the host dedupe by skill name? Use a temp HOME fixture with
  two copies of one dummy skill rather than reading real skill state where
  possible. Then fix install.sh per what you measured (the ticket prefers not
  writing the shared dir for hosts that have a working one of their own, and
  warns against betting an install on an unmeasured read path). Test the
  installer against a temp HOME only, never the real one. Do not edit
  PLATFORMS.md; propose exact text.


## Rulings
- 02:05Z - A80 ports ren.py rather than cancelling - the script survived and the ticket names its guards - costs one maintained script if renames stop.
- 02:05Z - host probes (5-7) propose PLATFORMS.md text instead of editing it - three stages share that file - costs one extra apply stage (9).
- 02:05Z - re-runs (10, 11) wait for stage 8 - they need the harness command stage 8 fixes - costs wall-clock only.
- 02:05Z - plain Agent dispatch, not a Workflow script - session guideline caps workflows under 5 agents and this run is 11 stages - costs nothing; same prompts, same ledger.
- 02:20Z - stage 4 review: ROOT hardcoded to C:\tools\Projects\skillator2 (line 51); sent back to the same agent: 'derive ROOT from __file__ (two dirs up from practice/scripts), make --selftest run the script from a copy inside its temp fixture so a hardcoded root would fail it, re-run selftest + dry-run' - guard (b) verified by hand on an in-file storage path, holds.
- 02:55Z - code review (5 reviewers) over stages 1-4: 1 real latent defect (guard (a) sampled 'hooks/<old>..sh'; fixed in-session with rstrip, now catches the original hooks/relay.sh pair), 1 false positive (/simplify qualifier 'lost' - it is at routing.md:37).
- 02:55Z - A79 reopened to [~], not reverted - skill-smith binds skill edits to a failing test first and A79 claims a behaviour a grep cannot prove; the repo's precedent (A60 -> A58b) lands edits and verifies them in one GREEN row, so A79's routing run joins stage 11 - costs a revert of the section 2 row if the RED shows agents already find a11y-toph.
