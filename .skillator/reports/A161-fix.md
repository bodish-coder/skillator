# A161 fix — ready for independent review, no commit

Worktree: `C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0023-final-a161`; branch `fix/RUN-0023-A161`; base `b7b2451`.

Verified cause: `windowOf` selected whole weighted entries, so an expanded raw block taller than the list was omitted. The pane rendered only that selection window; wheel/page events passed to the host, which could only scroll the already-sized tree. Installed Claude Code 2.1.311 SDK `UiScrollInput` explicitly says `offset` is already clamped, `by` retains signed input distance, and `contentRows` is pinned to the drawn tree. Merely feeding `scroll.offset` into the model cannot repair this.

Correction: retain the existing window model and select physical rows, including partial raw blocks. One nullable `ticketOffset` atom holds manual list scrolling; `by` advances it and page steps use available list height so no intervening rows are skipped. Outer host scrolling stays at zero; arrows/focus/row or group presses/filter changes return the list to selection following. Forms, setup, Team and other tabs retain host scrolling. Pure `offsetFor`, model lines and standalone callers remain unchanged; optional View offset is pane-only. The long-owner fix is untouched.

Scoped staged files: `plugin/mods/ops-board/hooks/lib/ticketsmodel.ts`, `hooks/pane.tsx`, `hooks/register.tsx`, `types/index.d.ts`, `tests/model.test.ts`, `tests/pane.test.tsx`.

Evidence (all receipts under main `.skillator/reports/`):

- RED: `C:/Users/Ikran/.local/bin/claude.exe plugin test <worktree>/plugin/mods/ops-board` — 387 pass / 4 fail, exit 1. Both styles fail expanded raw presence and PageDown reaching F30. `A161-red.log`, `A161-red.exit`.
- GREEN: same command — 392 pass / 0 fail across 19 files, exit 0. `A161-green2.log`, `A161-green2.exit`. New checks send host-clamped offset 0 with wheel/page distances; collect every raw chunk at 40 columns/14 body rows; PageDown visits every ticket, then arrows recover selected F2; Assign scroll passes through and cancellation restores the ticket. Existing 40/60/80/120 frames, both styles and long owners remain green.
- GREEN: `C:/Program Files/nodejs/npm.cmd test --prefix <worktree>/plugin/mods/ops-board/ops` — 164 pass / 0 fail, exit 0. `A161-standalone.log`, `A161-standalone.exit`. Includes standalone, pi and Antigravity regressions.
- GREEN: `C:/Program Files/nodejs/node.exe C:/Users/Ikran/AppData/Local/npm-cache/_npx/6bc7bae5c2059953/node_modules/typescript/bin/tsc -p C:/tools/Projects/skillator2/.skillator/reports/A161-tsconfig.json` — exit 0. `A161-tsc.log`, `A161-tsc.exit`; config targets this worktree plus main installed SDK types. Elevated compiler access was required because the sandbox cannot read npm-cache.
- `git diff --check` clean. Intermediate `A161-green1` found the bottom clamp could start a selection window on chips; corrected by clamping only explicit manual offsets. Its other two failures were the test assuming a full-body PageUp instead of a list-height page; tests now page until top. Final green receipts supersede them.

Code-yoda pass: no new helper layer, dependency, or generic abstraction; existing window calculation, pane rendering and input hooks extended directly. No board/run ledgers, reconcile handlers, external profiles, commits or pushes changed. Limits: mounted host-SDK render tests are the approved frame evidence; no live native Claude pane exercised. Stop here for independent review.

Independent final UI review: LAND; 248 actual-model cases verified raw reachability, wheel/page clamped-offset semantics, frame bounds, selection/stale-offset/long-owner behavior and form guards. On parent authorization, committed the exact six staged files as `024351a0f114f63cb02ebcd4ce9594e8993e66e9` (`A161: scroll ticket rows and expanded detail inside fixed pane chrome`). Worktree status clean after commit; no push.
Main existing CodeGraph sync completed successfully (exit 0); no worktree index initialized.
