# Handoff — build-jarvis asks for the execution mode (2026-10-18)

<!-- skillator-execute
status: complete
last-run: 2026-10-18
runs: 1
remaining: 0
note: F51 GREEN and committed locally (Cursor, @cu-04f282); push awaits the owner; F52 logged for the tickets-zordon follow-up
-->

> **Status legend:** ✅ DONE (verified in repo) · 🟡 IN-PROGRESS (partial/uncommitted) · 📝 CLAIMED (asserted in chat, unverified) · ⬜ NOT STARTED
>
> **For the next agent (Antigravity `agy`, Cursor, or anyone):** the reader has
> not seen the chat this came from. Everything you need is below. This repo's
> always-on file is `AGENTS.md` → `.skillator/grayskull.md`: load
> `grayskull-power` first (Antigravity: `/grayskull-power`; Cursor: read
> `skills/grayskull-power/SKILL.md`), and `TICKETS.md` is the board.

## 1. TL;DR (read this first)

`skills/build-jarvis/SKILL.md` now has a **Step 0 item 8**. Right after the
`grade:` line, and before anything is spent, the agent asks the user once which
of three modes Phase 2 should use: **single** (one build subagent does every
task), **per-task** (one fresh subagent per task) or **workflow** (a scripted
multi-agent run). It leads with a recommendation. Phase 2 now follows that
choice instead of starting a workflow on its own at "4+ tasks". The edit is
**uncommitted, untested and has no ticket**. Next: log a ticket, run a RED/GREEN
behaviour test, then commit the file on its own (see §7).

## 2. Mission & scope

- **Goal (why):** the user wants a dynamic workflow to be something they
  choose, not something the agent picks silently. A workflow can spawn dozens
  of agents and burn tokens, and build-jarvis used to start one automatically
  at "4+ independent tasks".
- **Origin:** the user asked to improve the prompt *"when we make the workflows
  as the user if they want a dynamic workflow or subagent driven or single
  agent one"*. The improved prompt (verbatim, as accepted by the user):

  > When building a workflow, ask the user how it should run before you start:
  > 1. Single agent. One session does every step in order. It's cheapest and simplest, and fits small or tightly coupled work where the steps share files.
  > 2. Subagent-driven. One fresh implementer per task, each with its own prompt and no session history (tasks-sentinels). It fits a written plan with several independent tasks. Tasks that touch the same file don't fan out.
  > 3. Dynamic workflow. A scripted, multi-agent run (the Workflow tool) that fans out, verifies and pipelines on its own. It fits large or parallel work, but it costs the most tokens.
  >
  > Ask once, up front, with a recommendation based on the task's size and how coupled its steps are. Skip the question if the user has already said which mode they want. Never pick the dynamic workflow without the user's explicit opt-in.

- **In scope:** build-jarvis only (features and F tickets).
- **Out of scope / deferred:** `tickets-zordon` "Workflow mode"
  (`skills/tickets-zordon/SKILL.md:392`) and `tasks-sentinels` were not changed.
  tickets-zordon already requires opt-in for workflows. Whether board sweeps
  should also ask for a mode is an open question (§8).
- **Scope changes this session:** the prompt as written clashed with
  build-jarvis in two places. The user settled both (§4).

## 3. Current state — what's done vs. not

| Item | Status | Evidence | Notes |
|------|--------|----------|-------|
| Step 0.8 mode question + table added | ✅ | `skills/build-jarvis/SKILL.md` Step 0.8 — reworded in GREEN round 2 as the grade line's `mode` field | Round 1 wording was skipped on Claude Code (see §10) |
| Step 0.7 "No confirmation gate" carve-out | ✅ | `skills/build-jarvis/SKILL.md` Step 0.7 ("the one Step 0 ask"; example line carries `mode ask (single)`) | |
| Phase 2 follows the mode; automatic 4+ → workflow trigger removed | ✅ | `skills/build-jarvis/SKILL.md` Phase 2; `WORKFLOW.md` opt-in exception removed | `single` = one agent, blocks in order, highest tagged tier |
| Ticket on `TICKETS.md` | ✅ | `F51` `[x]`; `F52` logged for tickets-zordon | |
| RED/GREEN behaviour test (skill-smith) | ✅ | `practice/baselines/green-build-mode-f51.txt`, `scenario-build-mode-*.txt`, `transcripts/f51-*` | Final body: 3/3 Claude Code; round 2 4/4 + Cursor 1/1 |
| Regression sweep + `/code-review` on staged diff | ✅ | hook selftests ok (sh+ps1); review by a fresh Cursor subagent (no `code-review:code-review` on Cursor) — no blockers, should-fixes applied and re-run | |
| Commit | ✅ | local commit `F51: build-jarvis settles the execution mode before spending` (only F51's paths; unrelated staged set untouched) | Not pushed — needs the owner's OK |

Diff size: `skills/build-jarvis/SKILL.md | 34 ++++++++++++++++++++++++++--------` (26+, 8−).

## 4. Decisions & rationale (do not re-litigate)

- **Placement: build-jarvis Step 0 and Phase 2.** Phase 2 already chose the
  mode on its own (`Independent tasks fan out…` and `**4+ independent tasks, a
  sweep, or the user asked** → … workflow`). Replacing that automatic choice is
  the smallest change that does what the user asked.
- **"Single agent" = ONE BUILD SUBAGENT, not the main session.** The user chose
  this. The prompt's "one session does every step" conflicted with build-jarvis's
  rule that the orchestrator never builds (see "never folds the seats into this
  session… the orchestrator that builds has nobody to verify it" in § Rules).
  Rejected: letting the main session design, build and verify alone. It would
  have meant rewriting that rule and its rationalization table.
- **Ask WITH THE GRADE LINE (Step 0), not after design.** The user chose this.
  The standing rules forbid stops between stages ("Staged work runs to the end,
  no stop between stages"). Asking after the design file would know the task
  count but would be a mid-run stop. Rejected: ask after design.
  Trade-off accepted: the recommendation comes from the grade row and how
  coupled the work reads, not an exact task count.
- **Skip the ask when a mode is already known:** the user named it ("single
  agent", "one agent per task", "use a workflow", "ultracode"), or the run is
  headless, chained or inside a relay. The agent then logs
  `Ruling: mode <m> - <why> - <cost if wrong>`.
- **Workflow is opt-in only.** If the user wasn't asked, the most the agent
  picks is `per-task`. This matches `tickets-zordon` ("Never start a workflow
  the user didn't opt into") and the Workflow tool's own gate.

## 5. Constraints, gotchas & "do not re-fix" traps

- **The index has a large unrelated staged change set** (ops-board mod `mods/ops-board/**`,
  `commands/plan-runs.md`, relay-morpheus / tickets-zordon scripts, `TICKETS.md`,
  `marketplace.json`). This edit is **unstaged**. Commit it on its own:
  `git commit -- skills/build-jarvis/SKILL.md` or a dedicated branch. Never
  `git add -A`.
- **The `grade:` line order is guarded.** A119 added a PreToolUse gate
  (`skills/build-jarvis/hooks/grade-gate.{sh,ps1}`, Claude Code only) that
  denies Agent/Write until a reply line starts with `grade:`. Step 8 comes
  *after* the grade line, so the gate is unaffected. Keep it that way: the
  grade line stays the first reply text.
- **Off Claude Code there is no `AskUserQuestion` and no `Workflow` tool.**
  `skills/grayskull-power/references/hosts.md:11` maps the ask to "a numbered list
  of the same options". `WORKFLOW.md:37` says cursor / antigravity / pi have no
  Workflow tool, so they use the host's parallel delegate or plain dispatch. On
  those hosts, "workflow" mode should be offered as that pattern and never
  claimed as a Workflow call.
- **Agy and Cursor may load a stale installed copy, not this checkout.**
  `PLATFORMS.md:87-88`: cursor loaded every skill from user-level
  `~/.cursor/skills`. agy loaded project-local `.agents/skills` but also a stale
  `~/.gemini/config/skills/…`. Re-run `install.sh` (or check which copy loaded)
  before testing the change on those hosts.
- **Testing harness is Claude-Code-centric.** `practice/scripts/baseline-harness.sh`
  drives `claude` with `--safe-mode` / `--plugin-dir`. Method:
  `skills/skill-smith/references/testing.md`. Prior build-jarvis scenarios:
  `practice/baselines/scenario-build-route-*.txt`, `scenario-build-a119-direct-*.txt`.
- **Usage watch** before non-trivial steps (Windows):
  `powershell -NoProfile -ExecutionPolicy Bypass -File "skills/watch-cortana/hooks/usage-watch.ps1" -Mode check`.
  Note open ticket A130: it may report another session's stale figure when
  `CLAUDE_CONFIG_DIR` is set.

## 6. Key files & where to look

- `skills/build-jarvis/SKILL.md` — the edited skill. Step 0 (lines ~27-98),
  Phase 2 (~157-175), Rules.
- `skills/build-jarvis/references/grade.md` — grade detail. It may deserve a
  line on mode recommendation examples (not touched).
- `skills/build-jarvis/references/platforms.md` — per-host notes. A good place
  to state how the mode question works off Claude Code (not touched).
- `skills/tickets-zordon/SKILL.md:392-...` — "Workflow mode", the board-level
  equivalent. Its F-tickets-in-a-workflow paragraph hands F tickets to one
  build-jarvis pass.
- `skills/tasks-sentinels/SKILL.md` — what "per-task" mode runs.
- `WORKFLOW.md` — workflow scripts, host table.
- `skills/grayskull-power/references/hosts.md` — per-host translation of
  `AskUserQuestion`, subagents, hooks.
- `practice/baselines/green-build-jarvis-f39.txt`, `green-build-a119.txt` —
  how prior build-jarvis GREENs were recorded.

## 7. How to resume (first 5 minutes)

1. **Orient:**
   ```sh
   git status --short            # expect ' M skills/build-jarvis/SKILL.md' (unstaged) + the unrelated staged set
   git diff skills/build-jarvis/SKILL.md
   grep -n "^- \[ \]" TICKETS.md | tail
   ```
2. **Next action — log the ticket** via `tickets-zordon` (next free F id). Suggested text:
   `F<n> — build-jarvis asks the execution mode once, with the grade line: single (one build subagent) / per-task / workflow (opt-in only), skipped when named or headless/chained/relay with a Ruling; done = GREEN where a direct feature prompt asks once after grade: and before any spend, a prompt naming "use a workflow" skips the ask, and a headless run picks per-task with a Ruling and never workflow.`
   Mark it `[~]`.
3. **Then — test it (skill-smith RED/GREEN):** three scenarios: (a) direct
   feature prompt → expect the grade line, then one mode question with a
   recommendation, then nothing spent before the answer; (b) a prompt saying
   "single agent" → no question, one build subagent; (c) headless/board → no
   question, `Ruling: mode per-task …`, no workflow. Record the results in
   `practice/baselines/`.
4. **Then:** fix any wording the test exposes. Optionally add the off-Claude-Code
   note to `references/platforms.md`. Run the regression sweep (A119 grade-gate
   behaviour, the F39 route scenarios), then `/code-review` on the staged diff
   (this file only), then commit on its own. **Pushing needs the user's OK.**

## 8. Open questions & risks

- **Decided 2026-10-18 (owner):** `tickets-zordon` Workflow mode should also
  ask single / per-task / workflow — logged as **F52**, out of F51's scope.
- **Unknowns:** UNKNOWN whether agents will actually ask at step 8 or skip it.
  A119 showed that "first reply text" instructions were ignored 0/6 until a hook
  enforced them. A hook may be needed here too if GREEN fails.
- **Risks:** the extra ask could annoy users on small features. Mitigated by the
  skip rules, but a `—` design-seat one-file fix will still ask unless the user
  named a mode. Consider auto-picking `single` with a Ruling for a `—` design seat
  if testing shows friction (a decision for the user, not yet taken).

## 9. Provenance (verify before trusting this doc)

- **Repo / branch:** `skillator2` · `main`
- **Last commit:** `5bde960 4.8.1: F45 - assignment reopens a ticket, [?] pending decision`
- **Working tree:** dirty. This work = ` M skills/build-jarvis/SKILL.md` (unstaged).
  Unrelated staged set = `mods/ops-board/**`, `commands/plan-runs.md`,
  `TICKETS.md`, `.claude-plugin/marketplace.json`, relay-morpheus and
  tickets-zordon skill + scripts, `practice/scripts/baseline-harness.sh`.
- **PR / remote state:** local only, nothing pushed.
- **Tests at handoff time:** not run. No behaviour test exists for this change.
- **Handoff written by:** Claude Code (claude-opus-5-5) on 2026-10-18.

## 10. Execution log

- **2026-10-18 — Cursor (`@cu-04f282`), resume-cortana run 1.** Logged F51
  (`[~]` → `[x]`) and, on the owner's answer to §8, F52. Owner chose to test on
  both hosts. RED for the direct prompt = the A119 transcript on the pre-F51
  body (no question). GREEN via the Claude Code harness (HEAD snapshot of
  `baseline-harness.sh`, `BASELINE_ISOLATE=hide`, route hook + grade gate, no
  budget cap) plus a Cursor Task subagent:
  - Round 1 (handoff wording): direct **FAIL** — grade line, then straight to
    Write + Agent, no question, no Ruling (§8's predicted failure); single and
    headless pass; Cursor asked but dropped the workflow option.
  - Round 2: mode made a **field of the grade line** (`mode ask (<rec>)` → ask
    and end the turn; `(named)`; `(ruled)` + Ruling), workflow row names the
    no-Workflow-tool fallback. Claude Code 4/4 (direct, single, headless,
    "use a workflow"), Cursor 1/1.
  - Pre-commit review → reprint the line as `mode <m> (asked)` after the
    answer, Phase 2 opens with the mode, red flag covers `mode ask`
    unanswered; `references/platforms.md`, `WORKFLOW.md` (removed the
    "unless the criteria above are met" auto-start exception), `PRACTICE.md`
    §4 made consistent with `single`. Round 3 regression 3/3.
  - Spend: $6.25 of Claude Code across 10 runs. F51's done text corrected from
    "headless picks per-task" to "at most per-task" (the headless runs picked
    single with a Ruling, which the rule allows).
  - Not covered: one run per scenario; the ask is wording-enforced (the gate
    checks only for a `grade:` line); interactive Claude Code and antigravity
    not run. If a later run skips the ask, extend `grade-gate` to require the
    `mode` field.
