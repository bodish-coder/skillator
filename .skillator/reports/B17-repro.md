# B17 reconcile action investigation - 2026-10-27

Status: owner-observed no-op; NOT reproduced in the mounted runtime fixture. No production remedy justified by this evidence.

Source: `.skillator/worktrees/RUN-0023-pending-f100-f104/plugin/mods/ops-board`, supplied base b7b2451. The isolated fixture is `.skillator/reports/B17-runtime`; its hooks, types, manifest and existing reconcile tests were copied without edits. No source, board or real ticket was mutated by the tests.

## Verified

- `hooks/reconcile.tsx:79-80` renders `reconcile:all` and `reconcile:picked` with empty callbacks. `hooks/register.tsx:616-624` registers matching `ui.press` hooks which await `applyReconcile`, then `poll($, true)`, and consume the event with `{ element: e.element }`.
- Installed SDK declarations at `plugin/mods/ops-board/.claude-plugin/types/claude-code/index.d.ts` were written by Claude Code 2.1.301. Lines 1089-1091 state that clicks, hotkeys and Enter raise `ui.press`; lines 1185-1194 place `onPress` at its bottom. Lines 4092-4098 explicitly allow `{ element }` to consume the press instead of `next(e)` reaching the callback. Empty callbacks do not bypass registered press hooks.
- The tested binary is `C:/Users/Ikran/.local/bin/claude.exe`, version 2.1.311.0. Command: `claude plugin test .skillator/reports/B17-runtime`. Exit 0, **8 pass / 0 fail**, 9.68 seconds of reported test runtime.
- Terminal and desktop mounts each passed: Accept all executes exactly four expected ticket-meta calls and refreshes the changed board; Apply picked executes only the chosen row and reports a refusal; None and Esc leave all proposals unapplied. B16 stays-only and reconcile refusal/empty-result tests also passed.
- This is the engine's mounted primitive tree and real event chain with mocked filesystem/process effects, not a recreated event dispatcher. Both apply handlers, their command arguments, form closure, refusal feedback and refresh are asserted.

## Inferred

The no-op callbacks are intentional event-chain endpoints. Replacing them with another application callback while retaining consuming hooks would not address a demonstrated defect; changing hook continuation could introduce duplicate application. Preserve this wiring for F115.

The owner failure could be outside the exercised chain (surface input delivery/focus, loaded plugin revision, a stalled/refused live command, or another hook). None of these possibilities is established; do not select one as root cause.

## Missing evidence / honest limits

The owner-observed mouse/Enter failure on their running session was not reproduced. No real terminal emulator was driven; no mouse event was delivered to Ink; process execution was mocked. Existing tests press rendered element keys, not raw letters. SDK `Mounted.key` at lines 16379-16388 drives a **Client**'s onKey, not primitive Button hotkeys. A custom letter-to-press lookup is useful contract coverage but must never be reported as native keyboard evidence.

F115 may proceed as the requested keyboard affordance without claiming B17 fixed. Keep B16. The owner session needs a minimal trace of whether `ui.press` was received for the exact two element keys and whether ticket-meta returned; compare loaded plugin revision and focus state without exposing input/secret values. Record live outcome separately. Do not rewire the event chain based solely on an empty callback.

## Re-run

Run `claude plugin test .skillator/reports/B17-runtime` from the main repo. The fixture is frozen investigation evidence, not the final merged-source regression suite. Build must run the real suite against its merged worktree too.
