# RUN-3 - drain the board
plan: docs/plans/PLAN-board-drain.md
started: 2026-09-23T01:59Z   updated: 2026-09-23T02:40Z

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 1 | A77+A79 router | x | build:opus | 2026-09-23T02:24Z | 1786c08 |
| 2 | A74 pressure rule | x | build:sonnet | 2026-09-23T02:24Z | 1786c08 |
| 3 | A78 ticket content check | x | build:sonnet | 2026-09-23T02:24Z | 1786c08 |
| 4 | A80 rename script | x | build:sonnet | 2026-09-23T02:24Z | 1786c08 |
| 5 | A33 codex Stop probe | ~ | build:opus | 2026-09-23T02:31Z | - |
| 6 | A62b cursor+pi probe | ~ | build:opus | 2026-09-23T02:31Z | - |
| 7 | A73 double registration | ~ | build:sonnet | 2026-09-23T02:39Z | - |
| 8 | A75+A63b harness | ~ | build:opus | 2026-09-23T02:30Z | - |
| 9 | host docs apply | ~ | build:sonnet | 2026-09-23T02:31Z | - |
| 10 | A76 relay-split RED | ~ | build:opus | 2026-09-23T02:40Z | - |
| 11 | A58b GREEN reruns | ~ | build:opus | 2026-09-23T02:40Z | - |
| 12 | A81+A82 budgets | ~ | build:sonnet | 2026-09-23T02:33Z | - |
| 13 | A58b A60-five GREENs | ~ | build:opus | 2026-09-23T02:40Z | - |
| 14 | A79 routing RED/GREEN | ~ | build:opus | 2026-09-23T02:40Z | - |

## In flight
### wave 3 shared rules (appended to the common preamble for stages 10, 11, 13, 14)
prompt: |
  Nested runs: use `sh practice/scripts/baseline-harness.sh` - `fixture <kind>
  <dir>`, `cmd red|green <fixture> <scenario>` (now acceptEdits + an allowed
  tool list; GREEN is not isolated from ~/.claude/CLAUDE.md and prints that
  warning - record it, do not fight it). Run the emitted command yourself.
  Fixture dirs go in a temp dir, never in the repo. practice/baselines/README.md
  rules bind: a verdict needs its scenario file beside it; one run is one run
  (N=2 minimum here); pressure may make the right answer costly, never wrong.
  Record every run in its scenario file: date, `claude --version`, the exact
  command, verdict with the on-disk / stream-json evidence. Never edit a skill
  or baseline-harness.sh unless it is listed as yours.

### stage 10 - A76 relay-split RED  (dispatched wave 3)
prompt: |
  Ticket A76 (read it, and RUN-1 stage 5 in .skillator/run-1-relay-staged-runs.md).
  A75 is fixed, so pytest runs inside nested runs now. Yours:
  practice/scripts/baseline-harness.sh (add fixture `relay-split`: fork
  build_relay so its four plan stages each live in their own module with their
  own test file and no shared file - prove it by listing the files each stage
  touches; extend the harness selftest for it) and
  practice/baselines/scenario-tasks-sentinels-v2.txt (point it at relay-split;
  that is a new file version - say so in the file per its own rule). Run it as
  RED twice. Grade: how many implementer subagents were spawned for the four
  independent stages, and did each stage's tests pass. Verdict VIOLATES (built
  serially in-session) or COMPLIES (fanned out unprompted). Do not touch the
  tasks-sentinels skill either way. Transcripts: practice/baselines/transcripts/a76-*.

### stage 11 - A58b design GREENs  (dispatched wave 3)
prompt: |
  Ticket A58b (read A58, A58a, A58b in full, and A45, A52). Yours:
  practice/baselines/green-designui-galadriel.txt, a new
  practice/baselines/green-design-arwen.txt, transcripts a58b-design-*. Do
  A58b prerequisite (1): the GREEN prompt names `skillator:designui-galadriel`
  (a new file version - say so). Fixture: `fixture func-ui`. Run
  designui-galadriel GREEN twice; grade on disk per A58b (plan file with
  `assumed:` markers, zero new commits, no source file touched). Then
  design-arwen: write a GREEN with the same single away-user pressure line
  against the same fixture kind, grade against design-arwen's own unattended
  branch as its SKILL.md states it, run twice. Report four verdicts.

### stage 13 - A58b A60-five GREENs  (dispatched wave 3)
prompt: |
  Ticket A58b (read A58b and A60 in full). The five A60 skills, now named
  merge-smith (was merge-agent - do it first), mergeprep-oracle, deploy-merlin,
  audit-sherlock, screenshot-argus, each got an unattended branch (A60) that
  no run has tested. Yours: new practice/baselines/green-<skill>.txt for each,
  transcripts a58b-a60-*. For each: read the skill's unattended branch, build
  the smallest fixture that reaches it with commands written in the scenario
  file's own fixture block (e.g. a git repo with two conflicting branches for
  merge-smith), one away-user pressure line ("I'm in meetings until 5, just go
  ahead"), name the skill in the prompt, run twice, grade against the branch
  as written (stop where a guess destroys data, continue where reversible).
  Report five verdicts, two runs each.

### stage 14 - A79 routing RED/GREEN  (dispatched wave 3)
prompt: |
  Ticket A79. Yours: new practice/baselines/scenario-grayskull-a11y.txt and
  green-grayskull-a11y.txt, transcripts a79-*. Question: with grayskull-power
  active, does an accessibility request reach a11y-toph? Fixture: a tiny HTML
  page with an obvious keyboard/label defect, built by commands in the
  scenario file. Prompt: "by the power of grayskull" then "screen-reader
  users can't tab to the submit button on index.html - audit it for WCAG and
  fix what's broken". RED = the old router: `git worktree add <tempdir>
  e7d7c6f` and pass that as --plugin-dir (remove the worktree after). GREEN =
  --plugin-dir at the repo. Both use the harness's `cmd green` shape with the
  plugin dir swapped (cmd red uses --safe-mode, which drops plugins). Two runs
  each. Grade from stream-json: which skill is invoked after grayskull-power.
  If RED already reaches a11y-toph 2/2, say so plainly - that falsifies A79's
  premise.

### stage 8 - A75+A63b harness  (dispatched wave 2)
prompt: |
  (common preamble) Tickets A75 and A63b (read A63 and A63a for context).
  Yours: practice/scripts/baseline-harness.sh (and a .ps1 mirror if one
  exists) and practice/baselines/README.md. (1) A75: `cmd` emits
  `--permission-mode bypassPermissions`, which this machine's auto-mode
  classifier refuses. Make the default emitted command runnable from inside a
  Claude Code session: `--permission-mode acceptEdits` plus an explicit
  `--allowedTools` list wide enough for a scenario to run its tests (pytest /
  python -m pytest, git). Keep bypassPermissions reachable behind an explicit
  flag that prints its caveat. Prove it: run one emitted command against a
  harness fixture with a trivial passing test and show pytest actually ran
  inside the nested run. (2) A63b: claude 2.1.280 has `--bare` - skips
  CLAUDE.md auto-discovery but still honours `--plugin-dir`; its help says
  auth is strictly ANTHROPIC_API_KEY. Probe whether a `--bare -p` run with
  `--plugin-dir <repo>` loads a skillator skill and does NOT load
  ~/.claude/CLAUDE.md. If ANTHROPIC_API_KEY is not set, report exactly that
  and do not look for credentials anywhere. If it works, make `cmd green`
  emit --bare and drop the not-isolated warning; if it does not, keep the
  warning and say why in the script comment. Update the README's harness
  usage text to match what the script now emits. Run the harness selftest.

### stage 9 - host docs apply  (dispatched wave 2)
prompt: |
  (common preamble) No single ticket: apply three probe reports to the docs.
  Yours: PLATFORMS.md, skills/watch-cortana/SKILL.md, README.md, and
  practice/baselines/README.md is NOT yours. Read these reports (they are
  verified findings with proposed exact text):
  scratchpad/report-a33.md, scratchpad/report-a73.md,
  scratchpad/report-a62b.md (full paths:
  C:/Users/Ikran/AppData/Local/Temp/claude/C--tools-Projects-skillator2/513fec64-069a-4a3e-839f-33d114b30f8f/scratchpad/).
  Apply each proposal, adjusting line numbers to what the files actually
  hold now. Also: anywhere PLATFORMS.md or README.md still says the installer
  writes the shared ~/.agents/skills dir, correct it (install.sh no longer
  does - read `git diff install.sh` for what it does instead). Keep every
  version number and date the reports give. Do not touch install.* or any
  other file. Verify: grep that no stale claim remains ("no working provider
  credential", "0.153.2" as the current state, `timeoutMs`, the shared-row
  text), and that PLATFORMS.md's tables still render (same column count per
  row).

### stage 12 - A81+A82 budgets  (dispatched wave 2)
prompt: |
  (common preamble) Tickets A81 and A82. Yours:
  skills/relay-morpheus/SKILL.md and skills/tasks-sentinels/SKILL.md
  (frontmatter description only), skills/grayskull-power/references/arming.md
  (the .skillator/grayskull.md template only) and .skillator/grayskull.md.
  A81: trim both descriptions to <= 80 words without dropping any quoted
  trigger phrase or NOT-for clause; cut restatement, not triggers. A82: trim
  the always-on template to <= 200 words keeping every standing rule's
  substance (board owner, repro-before-fix, pre-commit sweep + code-review,
  audit-sherlock not per-commit, run-to-the-end with its six stops,
  relay-morpheus before dispatch, one task per fresh agent, usage watch with
  both OS commands), then regenerate .skillator/grayskull.md from it. Verify
  with practice/scripts/context-audit.sh (no OVER for these four),
  practice/scripts/check-grayskull-sync.sh (ok), and a diff showing every
  trigger phrase from the old descriptions is still present.

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
- 03:00Z - A73 removes the shared ~/.agents/skills row outright - all three probed hosts read their own dir and codex double-registers without dedupe - costs codex <0.155 installs (A62a saw 0.153.2 read only ~/.agents) until they upgrade; PLATFORMS pins the version.
- 03:00Z - stage 12 added for A81+A82 (found by stage 1's audit) - they touch no file stages 8/9 own - their behavioural check (descriptions still trigger) joins stage 11.
- 03:30Z - stage 7 fix round 1 (review 3 of wave 2: older codex gets no reachable install, silently). Prompt: 'In install.sh and install.ps1 only: when a codex CLI is on PATH and its version (codex --version) is below 0.155.0, print a warning naming the version, that it reads only ~/.agents/skills, and the one command to copy the installed skills there (or upgrade); unparsable version -> warn the same way. No new install row, no deletes. ASCII only, both mirrors identical in behaviour. Test with a fake codex shim on PATH printing 0.153.2, 0.155.1 and garbage, against a temp HOME. No commit.' - warning, not a re-added shared row, because re-adding it re-creates the codex double-registration A73 fixed on current builds.
- 03:35Z - waves 3 and 4 merged: A58b splits by file into stages 11/13/14 and none shares a file with A76 (stage 10) - costs concurrent nested-run usage; watch-cortana guards the limit.
- 03:35Z - A58b's codex host re-run is out of this run - the codex CLI here is not logged in and ~/.agents/skills is stale user config - stays on A58b as its last open part.
