# RUN-0024 - pending F108 A157
plan: TICKETS.md
started: 2026-10-26T19:54Z   updated: 2026-10-26T20:31Z
worktree: C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0024-pending-f108-a157
branch: run/RUN-0024-pending-f108-a157

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 175 | AAB5 F108 holo output picker | x | session | 2026-10-26T20:23Z | 94931ff |
| 176 | AAB6 A157 clone-odo description loads | x | session | 2026-10-26T20:23Z | c6d96d5 |
| 177 | verify review bump commit |   | - | - | - |
| 182 | AACB A158 harness usage fixture | x | subagent | 2026-10-26T20:31Z | bdce915 |

## In flight
## Chain
driver: @sher 2026-10-26T20:24Z     hold: -     mode: agents
### AAB5 - stage 175 - F108 holo output picker
tickets: F108 build/deep
files: plugin/skills/holo-r2d2/scripts/holo.mjs,plugin/skills/holo-r2d2/scripts/fixtures/fixture-design.md,plugin/skills/holo-r2d2/SKILL.md,plugin/.claude-plugin/plugin.json,.claude-plugin/marketplace.json,plugin/.muse-plugin/plugin.json,plugin/.muse-plugin/marketplace.json,plugin/skills/grayskull-power/references/routing.md,plugin/practice/baselines/scenario-holo-f108-outputs.txt,plugin/practice/baselines/green-holo-f108.txt
prompt: |
  Load skillator:code-yoda first (restraint, full): the smallest diff that meets the ticket - no speculative abstraction, no new dependency, no refactor outside the ticket, no ceremony; run its review lens on your diff before /code-review and cut what it flags.

  grade: architectural · critical yes (F109 changes the TICKETS.md line format, a contract check-tickets, ticket-meta and the ops board all parse) · design deep=fable · build build=opus · verify deep=fable, held · ceremony full (relay run, 5 tickets) · mode per-task (ruled: inside a relay run, /pending-subagent parallel) · usage unobservable · tiers: defaults

  Ticket F108 (feature) - you are its BUILD seat only. The design is written: C:/Users/Ikran/AppData/Local/Temp/claude/C--tools-Projects-skillator2/147ee797-591f-4b4f-98fa-687ea69de7d9/scratchpad/design-2026-10-26-F108-holo-output-picker.md - read it in full and implement its TASKS in order exactly, test-first as written. Its paths are repo-relative; use them under the worktree C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0024-pending-f108-a157. Do not load build-jarvis, do not regrade, do not redesign; if the design is wrong somewhere, do the smallest correct thing and report it as a deviation with why. Its Q-F108-1 and Q-F108-2 are parked for the owner: build on the design's defaults (--batch writes no .md/.svg; when claude -p is unavailable to you, record the four script runs and mark the agent pass owed).

  The ticket line, verbatim:
  - [ ] F108 — holo-r2d2 output picker. Owner 2026-10-26: 'holo-r2d2 should have artifact|html|other files(u suggest) as option'. Today holo-r2d2 draws to one surface. Done when: holo-r2d2 takes an output choice - Artifact (published page), local HTML file, Markdown with Mermaid, standalone SVG - named in the request or asked once with Artifact first when the host has the Artifact tool and HTML first when it has not; each output carries the same diagram content; --design renders a section's markdown tables (today it keeps only headings, lead and sub-headings, so a skills table cannot be drawn); SKILL.md, its description and the host command texts say so; a baseline shows each choice producing its file. (@cc-9de7d9)

  Files you may touch: exactly the FILES list in the design file. In the four manifests change only the description text the design names - never a version line. Verify with the design's VERIFICATION, run against the worktree. Commit messages start with "F108: ".

  Work and commit in C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0024-pending-f108-a157 (branch run/RUN-0024-pending-f108-a157), never in the main checkout C:/tools/Projects/skillator2. Never push. Never edit TICKETS.md or any .skillator/run-*.md file.

  In the worktree, run one plain command per call, by absolute path - never `cd` (or `Set-Location`) into it first. Git: `git -C "<worktree>" status`, `git -C "<worktree>" add <paths>`, `git -C "<worktree>" commit -m "..."`. Tests: the project's runner with the worktree path as its argument. No `&&` chains, no `$(...)`, no heredocs; read and edit files with the file tools, not shell redirection.

  Report back: the commit sha(s), files changed, the red then green test output (command and pass/fail counts), deviations from the design with why, anything you could not verify, any unrelated problem (one line each).
### AAB6 - stage 176 - A157 clone-odo description loads
tickets: A157 build/build
files: plugin/skills/clone-odo/SKILL.md,plugin/practice/baselines/green-clone-odo-a157.txt
prompt: |
  Load skillator:code-yoda first (restraint, full): the smallest diff that meets the ticket - no speculative abstraction, no new dependency, no refactor outside the ticket, no ceremony; run its review lens on your diff before /code-review and cut what it flags.

  Ticket A157 (agent-found) - fix seat, tier build. No design file: the ticket line is the spec.

  The ticket line, verbatim:
  - [ ] A157 — clone-odo's description never auto-loads it. Description-only GREEN loaded clone-odo 0/6 on sonnet across three descriptions (F107; practice/baselines/scenario-clone-odo-reviews.txt), so without grayskull-power's route the review-mining rule is broken 2/2. Done = a description (<= 80 words) that loads clone-odo on the reviews scenario unprompted >= 1/2, or a ruling that this host never auto-loads on that prompt shape (check another skill's description-only rate on the same harness first). (@cc-xhvvy2)

  Context: clone-odo is plugin/skills/clone-odo (merged into main 2026-10-26 as F107, was F97). Its RED/GREEN baselines are plugin/practice/baselines/scenario-clone-odo-reviews.txt, green-clone-odo-reviews.txt, scenario-clone-odo-cleanroom.txt, green-clone-odo-cleanroom.txt; the harness is plugin/practice/scripts/baseline-harness.sh (its odo fixture and scenarios; read its header and selftest for how to run a scenario description-only, i.e. without naming the skill or routing through grayskull-power). Read plugin/skills/skill-smith/SKILL.md for how a description is written to trigger (the "Use when" shape, concrete trigger phrases, NOT clauses) and compare with descriptions that do auto-load here.

  Do, in order: (1) the control the ticket asks for first - one other skill's description-only load rate on the same harness and model (sonnet), so a 0 rate can be told apart from a host that never auto-loads on this prompt shape; (2) a rewritten clone-odo description (<= 80 words) in plugin/skills/clone-odo/SKILL.md frontmatter, keeping its NOT clauses; (3) the reviews scenario description-only, at least 2 runs; (4) record every run (command, model, loaded yes/no, cost) in a new plugin/practice/baselines/green-clone-odo-a157.txt. Done = loaded >= 1/2, or the control shows the host does not auto-load on this prompt shape - then write that as the ruling in the baseline file and leave the description change only if it does not regress. Cap: at most 8 claude -p runs in total; stop and report if the harness cannot run headless here.

  Files you may touch: plugin/skills/clone-odo/SKILL.md (frontmatter description only), plugin/practice/baselines/green-clone-odo-a157.txt (new). Verify: sh plugin/skills/clone-odo/scripts/odo.sh selftest (ok), sh plugin/practice/scripts/check-routing.sh (ok), and the run log. Commit messages start with "A157: ".

  Work and commit in C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0024-pending-f108-a157 (branch run/RUN-0024-pending-f108-a157), never in the main checkout C:/tools/Projects/skillator2. Never push. Never edit TICKETS.md or any .skillator/run-*.md file.

  In the worktree, run one plain command per call, by absolute path - never `cd` (or `Set-Location`) into it first. Git: `git -C "<worktree>" status`, `git -C "<worktree>" add <paths>`, `git -C "<worktree>" commit -m "..."`. Tests: the project's runner with the worktree path as its argument. No `&&` chains, no `$(...)`, no heredocs; read and edit files with the file tools, not shell redirection.

  Report back: the commit sha(s), files changed, the red then green test output (command and pass/fail counts), deviations from the design with why, anything you could not verify, any unrelated problem (one line each).
### AACB - stage 182 - A158 harness usage fixture
tickets: A158 deep/deep
files: plugin/practice/scripts/baseline-harness.sh,plugin/skills/watch-cortana/hooks/usage-watch.sh,plugin/skills/watch-cortana/hooks/usage-watch.ps1
after: 175
prompt: |
  Load skillator:code-yoda first (restraint, full): the smallest diff that meets the ticket - no speculative abstraction, no new dependency, no refactor outside the ticket, no ceremony; run its review lens on your diff before /code-review and cut what it flags.

  Ticket A158 (agent-found) - fix seat, tier deep: the cause is unknown. No design file: the ticket line is the spec. Follow root-cause-first (plugin/PRACTICE.md §7): reproduce, then find and name the cause with evidence (git log -p on both sides - plugin/practice/scripts/baseline-harness.sh around its F31 usage check at ~3136-3145 and its BASELINE_USAGE fixture writer, and plugin/skills/watch-cortana/hooks/usage-watch.sh and .ps1, which dir/env/file its level mode reads), and only then fix the side that drifted. If the watcher changed on purpose, fix the fixture to match; if the fixture is right and the watcher regressed, fix the watcher in both .sh and .ps1, mirrored. State the cause in the commit message.

  The ticket line, verbatim:
  - [ ] A158 — baseline-harness selftest fails on the usage fixture. Reproduced 2026-10-26 on main: `sh plugin/practice/scripts/baseline-harness.sh selftest` exits 1 with FAIL: relay-chain usage: level read 'src=none 5h=- 7d=- ctx=- max=-' (baseline-harness.sh:3141). The F31 check writes a fake watch-cortana dir via BASELINE_USAGE='84 40' and reads it back with CLAUDE_USAGE_WATCH_DIR=<dir> usage-watch.sh level, expecting src=claude-code 5h=84 7d=40; the watcher no longer reads that dir. Cause unknown: the fixture's file shape or the watcher's env/path drifted. Done when: the root cause is named, the fixture and usage-watch.sh agree again, and the harness selftest prints ok. Found by RUN-0024 stage 176 (A157). [owner: @sher] (@cc-9de7d9)

  Files you may touch: plugin/practice/scripts/baseline-harness.sh, plugin/skills/watch-cortana/hooks/usage-watch.sh, plugin/skills/watch-cortana/hooks/usage-watch.ps1. Anything else -> stop and report. Verify: the red -  exits 1 with that FAIL line (it is slow: run it with a long timeout and read the exit code directly, not through a pipe); then green - it prints ok, exit 0; plus usage-watch's own selftest if it has one (both .sh and .ps1). Commit messages start with "A158: ".

  Work and commit in C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0024-pending-f108-a157 (branch run/RUN-0024-pending-f108-a157), never in the main checkout C:/tools/Projects/skillator2. Never push. Never edit TICKETS.md or any .skillator/run-*.md file.

  In the worktree, run one plain command per call, by absolute path - never `cd` (or `Set-Location`) into it first. Git: `git -C "<worktree>" status`, `git -C "<worktree>" add <paths>`, `git -C "<worktree>" commit -m "..."`. Tests: the project's runner with the worktree path as its argument. No `&&` chains, no `$(...)`, no heredocs; read and edit files with the file tools, not shell redirection.

  Report back: the root cause (with the commit or line that introduced it), the commit sha(s), files changed, the red then green test output, anything you could not verify, any unrelated problem (one line each).

## Rulings
- 19:58Z - /pending-subagent parallel (owner, @sher): F106 F109 F111 F110 join RUN-0023 as later stages (they share marathon.md/marathon-workflow.js, register.tsx, types/index.d.ts, pane.tsx, install.* with its F101-F105 and must build on them); F108 and A157 share no RUN-0023 file and run here off main. RELAY_CHAIN_PARALLEL=2, 3 agents session-wide with RUN-0023's fix round, 3 GB free, watchdog gates below 1 GB - cost if wrong: a stage waits on a hold. Q-F108-1 (--batch writes no .md/.svg) and Q-F108-2 (no claude -p -> four script runs, agent pass owed) built on their defaults, parked for the end batch.
- 19:59Z - 176 runs beside 175, so dispatch gave it the stage worktree .s176; its agent gets the stored prompt with that worktree substituted (.skillator/prompts/run-0024-s176-wt.txt) - cost if wrong: none.
- Ruling: stage 182 prompt rebuilt - an unquoted heredoc ran the backticks in the A158 ticket line while writing it; restored from TICKETS.md by python; every other stored RUN-0023/0024 prompt compared against the board, only claim tags differ - cost if wrong: an implementer works from a corrupted ticket line.
- Ruling: A157 not landed as done - the review of b583ee1 found the ruling overclaims: F107 0/6 ran on a 65-skill Linux host the listing-truncation explanation does not cover, NO DESCRIPTION is a model self-report, cost subtotals are sums of rounded figures, description B not recorded verbatim. A fix seat narrows the baseline file to what was measured; the description change stays only if it does not regress; A157 goes [!] blocked on a description-only run on a host with under 100 skills - cost if wrong: one more run file stage.
- Ruling: F108 review findings 1-2 (renderMarkdown escaping, escaped-pipe cell split) fixed before landing; 3-6 low and in the same file, fixed in the same seat since it is one file and they are each a few lines - cost if wrong: a slightly larger fix diff.
- Ruling: fix seats dispatched - 175 fix1 (prompt .skillator/prompts/run-0024-s175-fix1.txt, opus) and 176 fix1 (run-0024-s176-fix1.txt, sonnet: one baseline file, no runs) beside RUN-0023 F101 fix2 - 3 agents, as the 19:58Z ruling allows - cost if wrong: a watchdog hold.
