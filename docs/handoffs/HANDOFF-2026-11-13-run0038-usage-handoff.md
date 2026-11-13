# Handoff — RUN-0038 completion + F173/F174/F175 (2026-11-13)

> **Status legend:** ✅ DONE (verified in repo) · 🟡 IN-PROGRESS (partial/uncommitted) · 📝 CLAIMED (asserted in chat, unverified) · ⬜ NOT STARTED

> **Update 2026-11-13 22:28 (supersedes the A224 rows below):** the original A224 implementer was stopped by the orchestrator after ~6 h — its first full `install.sh --selftest` failed with `FAIL: dry run actions differ from the real run` and a second full run was still going. A first finisher died without reporting. A second finisher is now on the stage: it made its fix (worktree diff `plugin/install.sh` + `plugin/install.ps1`, +69/−4 — the antigravity marker-delete now prints the `kept …: a link or under one` line through the same `under_link` guard in both modes instead of silently skipping in dry mode, plus selftest-case adjustments) and started one full `sh` selftest at 21:28 (`.skillator/a224-scratch/selftest-sh2.log` in the worktree), still running at 22:28; the `ps1` selftest follows. **Next action unchanged:** when that finisher reports, review + land stage 292, then 293 (F174) → 294 (F175) → 287 (verify/merge/push). Do not dispatch a third A224 agent while the finisher (subagent "A224 finish retry") is running.

## 1. TL;DR (read this first)
Session handed off at the owner's "usage 5% left" order. `RUN-0038` (the /pending-sentinel sequential run over A217–A222, F77, F164, F172, A224) has stages 281–291 landed on its run branch and reviewed; stage 292 (A224) is mid-selftest with an uncommitted diff; stages 293 (F174), 294 (F175) and 287 (verify/merge/push) remain, with full prompts already written in the run file. **Next action:** `continue RUN-0038` — check the worktree log for an A224 commit first (see §7).

## 2. Mission & scope
- **Goal (why):** finish building everything the owner picked: the RUN-0038 ticket set, plus three owner requests that arrived mid-run (F173 engage-picard × be-ambitious, F174 Decide chooser, F175 decision-matrix), then merge, bump, board-flip and push as bodish-coder (owner's standing answers in the run file).
- **In scope:** RUN-0038 stages 287–294; F173 (already on main); board flips at merge.
- **Out of scope:** every other open ticket ([%] owner checks, B21, F57, F66–F175 beyond those named); no push of anything except the final RUN-0038 merge (owner ruled push at run end).
- **Scope changes this session:** "complete building" resumed RUN-0038 after a quota-stopped handoff; owner then added F173 (built immediately on main), F174, F175, and an F172 addition (Health shows this CLI's profile like `ops --status`). All four were ticketed before any code.

## 3. Current state — what's done vs. not
| Item | Status | Evidence | Notes |
|------|--------|----------|-------|
| F173 engage-picard × be-ambitious | ✅ | main `df42e6b`, version 4.27.0; baselines `plugin/practice/baselines/{red,green}-engage-picard-f173*.txt` | RED 2 scenarios, GREEN 4/4 fresh-agent; generator tests 12/12; staged review fixed a merged board line |
| Board rows F174, F175 | ✅ | `afd646a`, `c95a915`; check-tickets ok 457 IDs | prompts staged in run file as 293/294 |
| F172 amendment (CLI-profile Health row) | ✅ | `73b592f`; stage 291 prompt amended pre-dispatch | implemented inside stage 291 |
| RUN-0038 stages 281–286 (A217 A219 A220 A218 A221 A222) | ✅ | run branch commits `5c9df36`…`548c3ba`; board already [x] | from prior sessions |
| Stage 288 F77 assign typing | ✅ | worktree `a3d0653`+`21dcb9d`; re-review APPROVE | cause: Ticket Input lacked `autoFocus`; gated to no-ticket case. Flips to [%] at merge (owner live look owed) |
| Stage 289 F164 design | ✅ | worktree `3e784da` | `docs/sessions/session-2026-11-11-f164-holo-formats.md` in worktree |
| Stage 290 F164 build | ✅ | worktree `c33f3b2`…`b252dc5`; reviewer APPROVE | selftest ok; formats 10/10; anatomy 11/11; default byte-identical (SHA-256 pins). Flips [%] at merge |
| Stage 291 F172 Health (incl. CLI-profile row) | ✅ | worktree `8a53c3c`; reviewer APPROVE | first implementer died 429 mid-stage; finisher fixed pane env-compile break + standalone draw. draw 51/51; one pane timing-flake vs sandbox baseline. Flips [%] at merge |
| Stage 292 A224 installers refuse links | 🟡 | worktree diff `plugin/install.sh`, `plugin/install.ps1` +68/−4 uncommitted; scratch `.skillator/a224-scratch/` | implementer still running installer selftests at drain; two stop requests timed out unconfirmed — it may yet commit. Code+selftest cases written; verdict UNKNOWN |
| Stage 293 F174 Decide chooser | ⬜ | prompt in `.skillator/run-0038-agent-found-a217-a222.md` (AADA) | after 291 |
| Stage 294 F175 decision-matrix | ⬜ | prompt in run file (AADB) | after 293; reuses F174's questions helper |
| Stage 287 verify/merge/bump/board/push | ⬜ | run file stage 287 | version after 4.27.0 (F173 took it); bump once more for the run's release |
| A224 board row | 🟡 | `TICKETS.md` [~] via `9a86866` | matches 🟡 state |
| Watcher arming for this host | 📝 | `usage-watch.ps1 -Mode check` prints "no usage signal on this host" | Muse (muse-wonder) exposes no usage %; threshold env `CLAUDE_USAGE_HANDOFF_PCT=95` (5% left) only takes effect on Claude Code/Codex hosts where the probe/gate hooks are wired in that profile's settings |

## 4. Decisions & rationale (do not re-litigate)
- **Sequential, one fresh implementer per stage, main session reviews each:** same-file stages (pane.tsx across F172/F174/F175) never fan out. Every implementer prompt is stored in the run file before dispatch.
- **F173 built directly on main, not in RUN-0038:** owner's mid-run ask, disjoint files (commands), and the run's merge stays reviewable. Rejected: adding it as a run stage (delays a 20-minute job behind multi-hour stages).
- **F174 chooser keeps Assign as option (a):** owner asked for options, not replacement. Holo option reuses the existing `holo-ticket` call (`hooks/status.tsx:88`); questions option submits plain prompt text via `$.prompt.submit` — never a slash command (host refuses, `runstab.tsx:117`).
- **F175 one question builder:** board `[?]` tickets + parked run questions; answers only via ticket-meta/relay writers; F174's helper reused, no second copy.
- **F172 addition reads through `ops/status.ts` discovery:** never a second quota reader; unreadable profile shows its reason, never a guessed number.
- **F164 honesty rulings:** timeline draws observed dispatched→heartbeat windows only, critical path = longest `after:` chain by count (labelled); runbook prints "Verify command: not recorded in the run file." when absent. Do not "improve" these into invented data.

## 5. Constraints, gotchas & "do not re-fix" traps
- Memory is tight: one test suite at a time, foreground. The full standalone ops suite has hung before on spawn/quota tests — per-file runs are acceptable evidence when named.
- Sandbox TEMP EPERM: point `TEMP`/`TMP`/`TMPDIR` at `scratch/tmp-f173` (or a worktree scratch dir) for node tests and `check-tickets.sh`, else mkdtemp/mktemp fails and looks like test failures.
- `TICKETS.md` lines have repeatedly lost their trailing newline when edited — after any board edit, verify the edited ticket starts at a line start (`Select-String '^- \[.\] F1xx '`) and run `check-tickets.sh`. It bit F173, F174 and F175 in this session.
- Pane test baselines differ per environment: ~66–69 pre-existing failures expected in the owner's environment, 114 in this sandbox (mostly `ui.status`/`ui.focus` no-implementation). Compare failure *names*, not counts.
- Installer selftests are slow (sh ~40 min). A224's agent has been in them since ~14:00; its partial diff is real but its verdict is unknown.
- Untracked scratch (`.skillator/f77-*`, `.skillator/a224-scratch/`, `scratch/`) is not deliverable; never commit it.
- Usage on this host is unobservable (`no usage signal`); do not claim a percentage. The owner's "5% left" was taken on their word.

## 6. Key files & where to look
- `.skillator/run-0038-agent-found-a217-a222.md` — the run ledger: stage table, every remaining prompt (293 AADA, 294 AADB), all Rulings. Untracked but authoritative.
- Worktree: `.skillator/worktrees/RUN-0038-agent-found-a217-a222` (branch `run/RUN-0038-agent-found-a217-a222`) — all stage code lives here until merge.
- `TICKETS.md:176-179` — F172 [~], F173 [x], F174/F175 [ ]; `TICKETS.md:386` A224 [~].
- `plugin/commands/engage-picard.md` + 5 generated `plugin/host-commands/**/engage-picard*` — F173 (4.27.0).
- `plugin/skills/holo-r2d2/scripts/formats.mjs` — F164 formats (worktree only until merge).
- `docs/handoffs/HANDOFF-2026-11-12-pending-sentinel-quota98.md` — the previous handoff in this chain.

## 7. How to resume (first 5 minutes)
1. **Orient:** `git log --oneline -5`; `git -C .skillator/worktrees/RUN-0038-agent-found-a217-a222 log --oneline -5`; read `.skillator/run-0038-agent-found-a217-a222.md` stage table + last Rulings.
2. **Next action:** if the worktree log shows an A224 commit past `8a53c3c`, review it (fresh reviewer) and land stage 292 in the run file; if not, dispatch a fresh finisher for stage 292: judge the uncommitted install.sh/install.ps1 diff, run both installer selftests one at a time, commit `A224: ...`. Delete `.skillator/a224-scratch/` either way.
3. **Then:** dispatch stages 293 (F174) and 294 (F175) from their stored prompts, one at a time, review each; then stage 287: whole-run verify (holo selftest, ops suites per-file, generate-commands --check, check-tickets), merge the run branch to main, bump version, flip F77/F164/F172/A224/F174/F175 to [%] with their testing notes (A224 to [x] if its Done line is met without an owner check), commit board, remove worktree/branch, push as bodish-coder.

## 8. Open questions & risks
- **Awaiting user decision:** none blocking. Owner live checks owed after merge (do not flip past [%] without them): F77 typing, F164 generated pages, F172 Health row, F174 chooser, F175 live `/decision-matrix`.
- **Unknowns:** UNKNOWN — A224 selftest outcome (agent in flight at handoff). UNKNOWN — whether the A224 agent survived the stop requests and commits after this doc.
- **Risks:** the in-flight agent and a resume finisher could both edit the worktree installers — §7 step 2 exists to prevent that. Main is 120 commits ahead of origin; the longer the merge waits, the more board-sync drift to reconcile.

## 9. Provenance (verify before trusting this doc)
- **Repo / branch:** skillator2 · `main`, plus `run/RUN-0038-agent-found-a217-a222` in its worktree
- **Last commit:** `9a86866 board: handoff sync - F172/A224 in progress on RUN-0038`
- **Working tree:** main clean except pre-existing untracked `.skillator/*` run/scratch files and `docs/handoffs/*`; worktree has the uncommitted A224 diff + scratch dirs named in §3
- **PR / remote state:** local only; main ahead 120, nothing pushed this session
- **Tests at handoff time:** not re-run for this doc; per-stage results are in §3 with their sources
- **Handoff written by:** Muse Code (muse-wonder-1.0) session, owner @sabre, 2026-11-13; updated 2026-11-13 22:28 same session
