# CASEFILE — 2026-09-04

Scene: skillator at `6bea753` (v3.6.0), 31 changed files, 2,489 insertions.
Read: `PRACTICE.md`, `practice/**`, `PLATFORMS.md`, `WORKFLOW.md`, `README.md`,
`install.sh`, `install.ps1`, `.skillator/grayskull.md`, all 18 `skills/*/SKILL.md`,
`skills/handoff-watch/hooks/**`, `skills/skill-smith/**`, and the installed
`codex.exe` (0.153.2) on this machine.

Not read: most `skills/*/references/**` (design-arwen's seven, deploy-niyoj's
templates, handoff's template); `.claude-plugin/*`; prime-agent and Antigravity
behaviour, which could not be exercised offline.

Five investigators returned **66 raw findings. 19 survived verification; 47 were
discarded or merged.** Judge the rest by how readily those went.

Every finding below was re-opened at its cited line by the detective, not taken
on an investigator's word.

---

## Critical

- **C1** `PLATFORMS.md:47`, `skills/handoff-watch/SKILL.md:100` — **Codex has a
  `Stop` hook. This release is built on the claim that it does not.**
  The installed `codex.exe` 0.153.2 carries the packed hook enum
  `…UserPromptSubmit · SubagentStart · SubagentStop · Stop`, handler types
  `command` / `prompt` / `agent`, an `additionalContext` output field, and
  `hooks.json`. Both documents state Codex's hooks are only
  `PreToolUse`/`PostToolUse`/`PermissionRequest`/`SessionEnd` and that it has no
  turn-end hook that can inject — which is the entire justification for giving
  Codex the agent-driven `check` fallback instead of the automatic gate Claude
  Code gets.
  *Cause, stated plainly:* this was sourced from a blog post while the binary sat
  on disk. It is a capital mistake to theorise before one has data.
  *Fix:* verify whether Codex's `Stop` can return a blocking/`additionalContext`
  payload, then wire the gate properly and correct both tables. Until then, both
  documents must say the claim is unverified rather than assert the negative.

## High

- **H1** `install.sh:28`, `install.ps1:18` — **Codex skills are installed to a
  directory this Codex does not read.** The binary references
  `${CODEX_HOME:-$HOME/.codex}/skills` and `.codex/skills`; it contains no
  `.agents/skills` string at all. `~/.codex/skills/` exists and already holds
  skillator skills. The installers write to `~/.agents/skills/`.
  *Fix:* target `${CODEX_HOME:-$HOME/.codex}/skills`, keeping `~/.agents/skills`
  only if an older Codex is still supported — and say which.

- **H2** `skills/handoff-watch/hooks/usage-watch.ps1:67` ↔ `usage-watch.sh:44` —
  **A BOM makes the threshold comparison fire at any usage, and burns the
  one-shot marker.** PowerShell 5.1 `Set-Content -Encoding utf8` writes
  `EF BB BF 31 32 2E 30` (verified by byte dump). The sh reader does
  `awk -v a="$pct" -v b=97 'BEGIN{print (a>=b)}'`; with the BOM, `a` is
  non-numeric, awk string-compares, and `0xEF > '9'`. Verified: BOM'd `12.0`
  against `97` returns `1`; plain `12.0` returns `0`. On any machine where the
  `.ps1` probe writes and Git Bash reads the shared `~/.claude/handoff-watch`,
  the handoff fires at 12% and writes `.done` — so the real handoff at 97%
  never comes. The skill exists to prevent exactly that loss.
  *Fix:* write the flag with `[IO.File]::WriteAllText` (no BOM), and strip a
  leading BOM defensively in the sh reader. ~4 lines, one selftest case.

- **H3** `install.sh:66-72`, `install.ps1:76-81` — **The normal update path never
  refreshes the shared documents.** `if [ "$n" = 0 ]` prints "all skills already
  installed" and skips the doc copy. A plain `./install.sh` after a `git pull`
  therefore leaves `PRACTICE.md`, `WORKFLOW.md` and `practice/` stale forever;
  only `--force` (which reinstalls every skill) refreshes them. Confirmed on
  disk: `~/.agents/skills/` has `PLATFORMS.md` and `WORKFLOW.md` but **no
  `PRACTICE.md`**, while every build skill now says "read `PRACTICE.md` at the
  plugin root".
  *Fix:* copy the docs unconditionally, outside the `n = 0` branch.

- **H4** `skills/grayskull-power/SKILL.md:48,50` — **`../../PRACTICE.md` and
  `../../PLATFORMS.md` point outside the install root on every non-Claude host.**
  Skills land at `<dest>/<name>/SKILL.md`, the docs at `<dest>/PRACTICE.md`, so
  the correct depth is `../`. `../../` resolves to `~/.cursor/`, `~/.agents/`,
  `~/.gemini/config/`, `~/.pi/`. `PLATFORMS.md:8` then instructs the agent to
  "assume the claude-code row" — on Codex. This is the router's very first step.
  Same defect at `skills/brainstorm-build-prime/references/platforms.md:5`
  (`../../../`, should be `../../`).
  *Fix:* correct the depths, or name the file without a path and let the agent
  search. One line each.

- **H5** `install.sh:1`, `practice/scripts/*.sh`, `usage-watch.sh` — **Every
  shipped `.sh` is committed mode `100644`.** `git ls-files -s` confirms. On any
  Linux/macOS clone the documented `./install.sh` fails with "Permission denied"
  before doing anything.
  *Fix:* `git update-index --chmod=+x` on all four.

- **H6** `skills/handoff-watch/hooks/selftest.ps1:27` — **The selftest runs
  against the user's live state and can consume a real session's handoff.**
  The `check` assertion invokes `usage-watch.ps1 -Mode check` for real, against
  `~/.codex/sessions` and `~/.claude/handoff-watch`; `check` writes a genuine
  `<key>.done` when it fires. Run the selftest while a live session is over
  threshold and that session's one-shot handoff is spent on a test. The test is
  also non-deterministic — its result depends on whatever is on disk.
  *Fix:* point `check` at a temp `HOME` (or a fixture directory) for the test.

- **H7** `practice/prompts.md:44` vs `:85-87` — **The implementer is told to obey
  a design it is never given.** The template supplies `[BRIEF_FILE]` only, and
  `taskwork.sh brief` cuts that to the single `### Task N` block — then the same
  prompt says "Follow the file structure the design defines" and "a file growing
  past the design's intent → stop". `PRACTICE.md:202` promises the agent gets
  "the design file path". `[DESIGN_FILE]` appears only in templates 4 and 5.
  *Fix:* add a `[DESIGN_FILE]` slot to template 1.

- **H8** `practice/prompts.md:176`, `practice/task-loop.md:130` —
  **`[GLOBAL_CONSTRAINTS]` has no source.** The string appears exactly twice in
  the repo, in the two places that consume it. No design contract defines a
  constraints field. The controller must invent it or leave it blank.
  *Fix:* add `CONSTRAINTS:` to the design contract in all three
  `brainstorm-build-*`, or delete the slot.

- **H9** `practice/task-loop.md:64` — **"PLATFORMS.md maps these tiers to each
  host's actual slugs" is false.** task-loop uses `cheapest`, `cheap`,
  `standard`, `most capable`, `cheap-to-mid`, `mid-tier`; PLATFORMS.md defines
  `deep`, `build`, `cheap`, `orchestrator`. Three of seven seats map to nothing,
  while `:43` demands the model always be named explicitly.
  `practice/prompts.md:38` compounds it by citing "PRACTICE.md §4 Model
  selection", a heading that lives in task-loop.md.
  *Fix:* one vocabulary. Add the missing rows to PLATFORMS.md, or restate
  task-loop's table in PLATFORMS' four tiers.

- **H10** `skills/brainstorm-build-mid/SKILL.md:65,91` — **`-mid` orders the
  design pasted verbatim; the canon it declares it follows forbids exactly
  that.** "given the design **verbatim**" and "**Pass the design verbatim** from
  plan to build" against `PRACTICE.md:202` ("the design file path — never the
  session history"), `practice/task-loop.md:85` and `practice/prompts.md:24`.
  `-mid` also writes no design file, so the task loop and every prompt template
  — all of which need a `<DESIGN_FILE>` — cannot run under it, while
  `grayskull-power:170` claims `brainstorm-build-*` "runs PRACTICE §§1-6".
  *Fix:* `-mid`/`-lite` write a design file and pass its path, or drop the claim
  that they run the canon.

- **H11** `.skillator/grayskull.md:11` vs `practice/prompts.md:63,75` —
  **The always-on layer orders every commit through a subagent fan-out that the
  committing agent is forbidden to spawn.** `CLAUDE.md` imports the activation
  file, so every subagent in an activated repo reads "run `sherlock-codes` over
  the staged diff before every commit". `sherlock-codes` is a Fable fan-out. The
  implementer template says "4. Commit." and "Never spawn a subagent for part of
  it". Compounding: `sherlock-codes:21` itself says `/code-review` is the cheaper
  tool for a working diff, and `grayskull-power:192` routes diffs there.
  *Fix:* the standing rule should name `/code-review` for a staged diff and
  reserve sherlock for the pre-release sweep.

## Medium

- **M1** `skills/ticket-master/SKILL.md:173-180` — dispatches carry
  `label`/`phase`/`schema` and no `model`, against `PRACTICE.md:209` ("always
  name it explicitly — an omitted model inherits the session's, usually the most
  expensive"). "Work the board" runs every fix and verify agent on Opus.
- **M2** `PRACTICE.md:353` vs `practice/task-loop.md:150` — the three-fix rule
  says stop and question the architecture before a fourth attempt; the task loop
  runs five rounds and asks only if every path is a guess. Both are labelled the
  law for the same moment.
- **M3** `PRACTICE.md:224-234` (9 rows) vs `practice/tdd.md:99-111` (11 rows) —
  the TDD rationalization tables have already drifted, and the wording differs on
  shared rows. `PRACTICE.md:33` routes the reader to tdd.md for "the excuse
  table" while carrying a shorter one itself.
- **M4** `practice/prompts.md:447` — the design-reviewer template is an orphan
  (referenced only by its own index line) and contradicts `PRACTICE.md:168`,
  which says the design self-review is run inline, "not a subagent".
- **M5** `skills/deploy-niyoj/SKILL.md:217` — "**Merge and push to `main`.**" as
  an imperative step, against `PRACTICE.md:401` and `PLATFORMS.md:93` ("push and
  merge stay user-confirmed on every host"). Sibling `deploy-wizard:98` gets this
  right with an explicit "**Do NOT** `git push`".
- **M6** `skills/screenshot-loop/SKILL.md:24-28` — "ask the user for the path
  once, then write it:" is followed by a fenced block containing one real foreign
  absolute path, `C:\tools\Aewa-Airbender-aewag2\test_screenshots`. Read
  literally, that is the value to write.
- **M7** all 18 `skills/*/SKILL.md` — every description exceeds the ~80-word
  budget `skills/skill-smith/SKILL.md:231` sets (grayskull-power 233,
  ticket-master 198, sherlock-codes 197 … handoff 93, the smallest), and most
  summarize their workflow, which `:68` forbids as the shortcut agents take
  instead of reading the body. `ticket-master:13` is the sharpest case: its
  summary says "pending/in-progress/done" while the body defines six states, so
  an agent taking the shortcut runs a three-state board.

---

## Architectural proposals — your call, not tickets

- **X1 — Workflow mode sheds most of PRACTICE.** `WORKFLOW.md:143-178` has
  phases Design/Build/Verify/Rework and a task schema of
  `{id, summary, files, complexity}`. There is no task-reviewer seat, no final
  whole-branch reviewer, and no `PRACTICE.md` handed to the design agent — so the
  §2 task contract, §4 per-task review and §6 whole-branch review all vanish.
  Workflow mode is mandated at 4+ tasks, which means **the larger the build, the
  less of the canon applies.** Options: (a) leave it, and say so in WORKFLOW.md;
  (b) add reviewer phases to the script template; (c) make workflow mode a
  fan-out *inside* the task loop rather than a replacement for it.

- **X2 — The description law and the corpus cannot both be right.**
  `skill-smith` says descriptions carry triggers only, under ~80 words. All 18
  skills here summarize their workflow at 93–233 words, and the router is
  explicitly pointed at skill-smith when "a skill isn't triggering". Options:
  (a) rewrite all 18 descriptions to the law; (b) soften the law to "no workflow
  summary, length as needed for keyword coverage" and keep the corpus; (c) hold
  the law only for new skills and record the corpus as legacy debt.
  Note this is the second time this release a rule inherited from superpowers
  failed against the actual repo — the word-budget table was already rewritten
  for the same reason.
