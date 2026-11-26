# RUN-0043 - F203 priority rules
plan: docs/sessions/session-2026-11-26-priority-rules.md
started: 2026-11-26T10:07Z   updated: 2026-11-26T10:56Z
owner: @sher

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 327 | T1 rules file + queue.mjs rules commands | x | @sher | 2026-11-26T10:13Z | uncommitted |
| 328 | T2 pane Rules editor | x | @sher | 2026-11-26T10:24Z | uncommitted |
| 329 | T3 standalone TUI parity | x | @sher | 2026-11-26T10:38Z | uncommitted |
| 330 | Verify: whole-diff review + VERIFICATION (deep, held) | x | @sher | 2026-11-26T10:56Z | uncommitted |

## In flight

## Rulings

Ruling: owner approved the F203 design as written (2026-11-26); the mock extras (Reads-as line, hand-set warning, rule chip) are out of scope - follow-up ticket later - cost if wrong: a second pass on T2/T3.
Ruling: run --here on main, not a worktree - T2 builds on uncommitted B33/F201/F202 edits in hooks/pane.tsx, assign.tsx, register.tsx - cost if wrong: one dirty tree holds two tickets until commit.
Ruling: tasks run serially, one fresh opus agent each (owner rule: one agent at a time).
Ruling: T1 accepted (orchestrator review 2026-11-26): queue.test.mjs 10/10 exit 0; scratch-repo smoke of add/list/preview/apply matched the design. Builder deviations accepted - design test regex fixed to /^- P1: type=bug/m (header contains the text), mkdir moved before the lock (fresh repo), lstat-based missing check (broken symlink refused) - cost if wrong: none, each is stricter than the design text.
Ruling: T2 accepted (orchestrator review 2026-11-26): rules.test.ts + rules.test.tsx 8/8; regression pane+assign+model 133/138 with exactly the 5 baseline failures; `plugin validate` intake/profiles errors are pre-existing (same 2 on a HEAD copy). Deviations accepted - Rule/RulesPreview declared in types/index.d.ts (validate refuses import() in the contract), lib/rules.ts re-exports them; rules() helper as a function declaration (hooks loader rule) - cost if wrong: none, shapes unchanged.
Ruling: T3 accepted (orchestrator review 2026-11-26): rules+draw+state 134/134; full ops suite 376 tests, same 6 pre-existing failures before/after (builder's diff of names); frames fit 40/80/120 (widest 40/80/114 chars). Design VERIFICATION step 5 command and byte-count width check are wrong as written - verify seat uses the working form. Open: `r` during the delete question reloads instead of "keep" (rule not deleted) - left to the verify review - cost if wrong: a small key-wording gap.
Ruling: verify PASS-with-nits (deep seat). Fix round before commit (build=opus, one agent): #1 refuse argv values containing whitespace+word= in queue.mjs (CONFIRMED, blocks apply / mis-reads rule); #2 pane rev-mismatch retry must not hit a shifted rule - close form or keep rev only if rule n still equals the opened rule (PLAUSIBLE, data-loss shape); #3 TUI edit failure reloads rules; #4 TUI delete question: r/a answer keep. Nits #5-#7 left (cosmetic, spec-verbatim) - cost if wrong: minor polish ticket later.
Ruling: fix round accepted (orchestrator rerun 2026-11-26): queue 11/11, ops rules+draw+state 136/136, pane rules+assign 56/56, all exit 0. Fixer kept the pane same-rule guard on every save/delete failure (not only the rev message) - matches the old reload-on-any-failure behaviour - cost if wrong: none, the guard only closes a form whose rule moved.
