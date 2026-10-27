grade: bounded · critical no · design deep=gpt-6-astra/high · build build=gpt-6-astra/medium · verify build=gpt-6-astra/medium · ui tron · ceremony full · mode single (ruled: RUN-0023) · usage 5h unobservable

# F115 - alphabet actions throughout ops-board


PLATFORM: codex
DESIGN_MODEL: gpt-6-astra/high
BUILD_MODEL: gpt-6-astra/medium
STATUS: design only; production implementation not started by this seat.

GOAL: Every existing pane action has a visible alphabet option like Tickets, especially reconcile Accept all and Apply picked, without stealing text input or bypassing confirmations.

CHOSEN: Add contextual `Button.hotkey` values and compact ASCII hints to existing controls. Existing callbacks and registered `ui.press` hooks remain the execution path. Keep data-row selection local to the current context; assign a repeated action letter to exactly one current target. No global tab-letter shortcuts and no new action framework.

APPROACHES: Existing primitive hotkeys (chosen: same engine chain and minimal change); a global letter dispatcher (rejected: duplicates routing and steals form input); replacing the pane with a Client (rejected: unrelated rewrite and scrolling risk).

## Evidence and source

Read source base: `.skillator/worktrees/RUN-0023-pending-f100-f104/plugin/mods/ops-board`, supplied b7b2451. Main CodeGraph exploration did not locate these modules; this worktree has no index. Actual source was read directly. Re-read final merged source before building: A161 owns scroll changes in pane/model/register, and A164 owns the Explorer branch guard. Build after those merges, never parallel on the same files.

`B17-repro.md` records actual SDK semantics and the 8/8 mounted reconcile result. Empty `onPress` callbacks on reconcile, refresh and force resume are deliberate: matching `ui.press` hooks consume those events. F115 adds hotkeys to these same buttons; it does not add another call to `applyReconcile`.

SDK hotkeys accept one lowercase ASCII letter or digit. Shift+w is w, so **never use uppercase/lowercase as different plugin actions**. Duplicate active hotkeys are later-wins and therefore forbidden. `plain` buttons visibly render `a: label`; decorated buttons need a short visible ASCII key hint if the host does not show one. Tests must establish this, not assume it.

## REQUIREMENTS

- R1: Expose every enabled action in all six pages and subordinate forms through a visible alphabet option.
- R2: Each letter reaches the same existing action logic as its button exactly once.
- R3: Preserve current Tickets a/d/f/x/t/c/r keys and all existing page keys.
- R4: Typing into ticket/person/setup/rename fields never executes page or form actions.
- R5: Repeated rows have an unambiguous current target; a hidden or disabled action has no live binding.
- R6: Keep confirmations, refusal/status feedback, cancellation and refresh behavior.
- R7: Key hints remain visible at 40/60/80/120 columns using ASCII and whole-token wrapping.
- R8: Preserve B16, F111 and prior owner fixes, merged A161 scrolling and A164 branch validation.
- R9: Distinguish actual keyboard evidence from mounted press/input and rendered frame evidence.

## DESIGN

### Context and input precedence

Use native `Button.hotkey`, not a new `ui.key` event (none is evidenced). Tickets already uses this mechanism; register handles only selected press exceptions, focus and scrolling.

For forms containing Input, alphabet actions are active **only while the focus is on a non-text control in that form**. Initially and on any input focus, their hotkey props are absent. Show a compact hint `Tab to actions; letters there`. Track the current element through the existing `ui.focus` hook with one scoped state atom if needed; initialize/reset conservatively for form entry/exit. Only treat a focus key as actionable if it belongs to the currently rendered form. Unknown, stale, null or another view's focus must not arm text-form letters. Do not record input values. Declare the atom locally in every hooks file that reads it, respecting the existing static scanner contract.

Text-form buttons remain clickable and Enter under their focus keeps working. On a button/non-text selection receiving focus, the form's letters may be armed. Moving back into an Input disarms them before accepting typing. If actual runtime evidence proves the SDK already guarantees this precedence, prefer that simpler mechanism, but record the evidence and retain the text-input regression cases. Do not infer protection from mounted `input()` alone: it bypasses terminal key routing.

For repeated list controls, bind `o` only on the focused/current row (or the established selected row), with a documented first eligible row default where there is no selected row. Never put the same hotkey on every row. Navigation and Enter remain available on all rows. For run actions, e/d belong to one selected run: focus on either existing run action selects that run, and the hint sits beside that run. Finished runs have d only. For close-stage choices, o opens confirmation for the selected eligible stage. This is targeting existing controls, not a new action registry.

Keep tab buttons on the existing Tab/click navigation. The alphabet requirement applies to page actions, not new global tab accelerators.

### Exact page/action/key matrix

Paths below are under `plugin/mods/ops-board`. `existing` means the plugin already has the key. Repeated `o` rows are exclusive current-target bindings, not one binding per row. All optional bindings exist only when the corresponding control is enabled and rendered.

| Context | Existing control / action | Alphabet option | Existing standalone equivalent |
|---|---|---|---|
| Tickets | `key:assign` / owner form | a existing | a |
| Tickets | `key:decide` / decision form | d existing | d |
| Tickets | `key:filter` / filters | f existing | f |
| Tickets | `key:done` / show done | x existing | x |
| Tickets | `key:team` / Team | t existing | t |
| Tickets | `key:reconcile` | c existing | c |
| Tickets | `key:refresh` | r existing | r |
| Tickets | selected `head:*` or `row:*` open/close | o | Enter |
| Tickets | selected `decided:<id>` | v | D (preserve) |
| Filters | `sel:app`, `sel:who` | f exposes the filter controls; native arrows/Enter choose values (no new selector binding) | left/right field, up/down value |
| Filters | `key:mine` | m | mine field up/down toggles |
| Filters | close filter row | f existing | f / Esc / Enter |
| Team | `member:<handle>` select | o current row | arrows |
| Team | `team:add` and duplicate `team:add-row` | a on footer control only; row remains Enter/click | n |
| Team | `team:remove` | r existing | Delete / Backspace |
| Team | `team:lead` | l existing | l |
| Team | `team:back` | t existing | t / Esc |
| Team remove confirmation | `team:remove-yes`, `team:remove-no` | y remove, n keep; suppress ordinary Team letters during confirm | y / n / Esc |
| Assignment | `kind:implementation`, `kind:decision` | a implementation, d decision | a / d outside Ticket input |
| Assignment | `who:<handle>` select | o current person | arrows |
| Assignment | `who:+add` | n add person | n on add row |
| Assignment | `go`, `cancel` | s assign, c cancel | Enter / Esc |
| Add person | `add`, `cancel` | a add, c cancel in action focus | Enter / Esc; all letters are text in fields |
| Reconcile | `rec:<id>` toggle | o current eligible row | Space |
| Reconcile | `reconcile:all` | a accept all | a |
| Reconcile | `reconcile:picked` | p apply picked; absent with no picks | Enter |
| Reconcile | `reconcile:none` | n none | n / Esc |
| Workflows | `sect:runs`, `sect:workflows`, `sect:agents` | r runs, w workflows, g agents | Enter selected section; no separate Agents section in standalone |
| Workflows | `engage:<id>` | e selected active run | e selected run |
| Workflows | `diagnose:<id>` | d selected run, active or finished | no existing standalone Diagnose action |
| Engage confirmation | `engage:go`, `engage:cancel` | e engage, c cancel | Enter / Esc |
| Diagnose | `diag:close:<stage>` | o selected eligible stage opens confirmation | no standalone equivalent |
| Diagnose | `diag:back` | b back | no standalone equivalent |
| Diagnose close confirmation | `diag:close:go`, `diag:close:cancel`, `diag:back` | y close, n cancel confirm, b back | no standalone equivalent |
| Health | `key:force` | f existing; short label `force resume`, retain explanation on wrapped text | F force; R normal resume, r refresh |
| Messages | message row expand/collapse | o current row | Enter |
| Messages | `key:markread`, `key:setup` | m, s existing | m / s |
| Teams setup | `setup:posts` | p toggle posts in action focus | Space/left/right on posts |
| Teams setup | `setup:save`, `setup:clear`, `setup:run`, `setup:cancel` | s save, d clear saved, r setup check, c cancel | Enter save/clear selected; no setup-check equivalent |
| Teams clear confirmation | `setup:clear-yes`, `setup:clear-no` | y clear, n no in action focus; ordinary action letters suppressed | y / n / Esc |
| Teams check confirmation | `setup:run-yes`, `setup:run-no` | y run, n no in action focus; ordinary action letters suppressed | no equivalent |
| Explorer | focused tree/diff/commit `x*` row toggle | o current row | Enter |
| Explorer | `key:fetch`, `key:pull`, `key:push`, `key:revert`, `key:merge`, `key:reload` | f / p / u / v / m / r existing | only r reload and Enter rows exist in standalone |
| Git branch picker | `xb:<name>` | o current branch; chooses it, does not run | no standalone git actions |
| Git confirmation | `xa:go`, `xa:cancel` | y run, n cancel; no y when args empty | no standalone equivalent |
| Build (internal tab `run`) | `entry:<id>` | o current entry opens confirmation | Enter |
| Build | `key:rescan`, `key:stop` | r / s existing; s only while running | r / s |
| Build confirmation | `run:go`, `run:rename`, `run:cancel` | y run, n rename, c cancel | y / Enter, n, Esc |
| Build rename | `run:save`, `run:cancel` | s save, c cancel in action focus | Enter / Esc; letters remain text |

Filter Selects are value controls, not separate execution actions. Preserve native Select navigation; add short `app: arrows/Enter`, `who: arrows/Enter` instructions only as needed. Do not hijack a/d from Tickets to focus filters. Read-only Health details, workflow/agent rows and explanatory run commands get no fabricated action. The notification band's `ok:*` controls are outside page/form scope.

### Hints and width behavior

Use `plain` action buttons with `hotkey` wherever that preserves their role; otherwise provide nearby `[a] Accept all` style hints without changing element keys or accessible labels relied on by tests. Keep primary emphasis for confirm buttons. Action rows get `flexWrap="wrap"`; keep each short key/label token intact. Long descriptions move into wrapping Text beside/below the same action row. Do not depend on clipping to satisfy width checks.

40-column reconcile example (ASCII):

```text
Reconcile tickets   Esc cancels
2 to change
[ ] B2 blocked -> pending
[x] B1 pending -> in progress
o: pick current
a: Accept all  p: Apply picked (1)
n: None
```

For an Input form, the action hint explicitly says letters require action focus. Never display an apparently active accelerator while typing if its binding is withheld. No layout redesign; changes are wrapping/hints and small current-target indicators only.

## CONSTRAINTS

- Use the merged RUN-0023 source after A161 and A164, retaining their behavior and all F111/owner fixes.
- Preserve Tickets a/d/f/x/t/c/r, existing page hotkeys, Tab/Enter/Esc and existing standalone keys including uppercase D/F/R.
- Use one lowercase ASCII plugin hotkey per active semantic action; never rely on Shift to distinguish it.
- Execute each action through its existing button/consuming ui.press chain once; never double-apply reconcile or bypass confirmations.
- No text input, unknown focus or stale form focus may trigger alphabet actions.
- No hidden, disabled, stays-only or empty-picked apply action may retain a live binding.
- Every repeated letter names exactly one visible current target; no duplicate-hotkey later-wins behavior.
- Preserve B16 stays-only toast, command/refusal status and immediate reconcile board refresh.
- No global tab-letter shortcut, new Client surface or generic action framework.
- New hints are ASCII and visible/wrapped at 40/60/80/120 columns. Keep 100 in existing standalone sweeps.
- B17 stays unresolved until its owner-observed failure is reproduced or retested live; passing F115 tests do not close it.

## FILES

Modify existing plugin renderers: `hooks/pane.tsx`, `hooks/reconcile.tsx`, `hooks/assign.tsx`, `hooks/teamview.tsx`, `hooks/runstab.tsx`, `hooks/messagestab.tsx`, `hooks/explorertab.tsx`, `hooks/runtab.tsx`. Modify `hooks/register.tsx` only for conservative focus/target tracking integrated with existing focus handling. Modify `types/index.d.ts` only if the new atom contract requires it. This is one coherent cross-page ticket, with the file scope explicitly enumerated.

Tests: extend `tests/reconcile.test.tsx`, `tests/assign.test.tsx`, `tests/pane.test.tsx`, `tests/workflows.test.tsx`, `tests/runs.test.tsx`, `tests/health.test.tsx`, `tests/messages.test.tsx`, `tests/explorer.test.tsx`, `tests/runtab.test.tsx`; create `tests/alphabet.test.tsx` for cross-context uniqueness/visibility and focused-input cases. Reuse existing worlds and process mocks. Put reusable new fixture support in `tests/fixtures.ts` only when two test files actually consume it.

Standalone `ops/*`, pi and Antigravity production adapters are outside the chosen change: inventory their existing equivalents above and run their regression suite. Do not add missing standalone Git/Diagnose/Teams-check features under this ticket. If implementation truly changes standalone code, extend the file contract with controller ruling before editing and supply actual-loop tty capture evidence.

## TASKS

### Task 1: contextual alphabet controls - build=build

SATISFIES: R1-R8.

Files: all renderer/registration/test files explicitly named in FILES. No other production files.

Interfaces consumed: `ButtonProps.hotkey`, existing `onPress`, `ui.press`, `ui.focus`, existing form-state atoms and action functions. Interfaces produced: the matrix above; at most one literal scoped focus atom holding an element key or null (never input content), declared in local hook modules that access it. No action registry API.

1. Re-read merged renderers and register focus/scroll behavior. Confirm source contains A161/A164 and B16. Run `claude plugin test plugin/mods/ops-board` to establish the actual baseline before edits.
2. Add failing behavior tests using current fixture helpers. In `reconcile.test.tsx`, extend the existing Accept-all test before its press:

```ts
expect((await pane.find({ key: 'reconcile:all' }))?.props.hotkey).toBe('a')
expect((await pane.find({ key: 'reconcile:none' }))?.props.hotkey).toBe('n')
expect(await pane.find({ key: 'reconcile:picked' })).toBeUndefined()
await pane.press({ key: 'rec:B1' })
expect((await pane.find({ key: 'reconcile:picked' }))?.props.hotkey).toBe('p')
```

Retain the existing exact argv, one-call-per-row, toast, form-close and changed-board assertions. Add a picked-success case as well as the existing refusal. Run `claude plugin test plugin/mods/ops-board`; observe missing hotkeys fail for the expected reason before production edits.
3. Add a failing input test in the assignment fixture: open the existing form, focus/type Ticket `aD12` via mounted Input, assert the field value is retained and no assignment/reconcile/team command ran; then select an eligible person and use the real button press to assert exactly one existing command. Repeat text values containing all proposed action letters for handle/name/emails, setup token/URL/port and Build rename; never print secret input values. Assert alphabet props are absent while Input focus is held and restored only after valid action focus. Exercise state through actual focus events, not a test-only setter for the focus atom.
4. Add cross-context cases for every matrix row, including two runs, two eligible close stages, two branches, no selected item, no picks, stays-only, empty team, finished run, failed run plan and text-form return after cancel. Assert exactly one current target per repeated letter and the actual changed state/process effect after press. Existing press/arrow tests are retained.
5. Implement the matrix by adding hotkeys/hints to existing controls and the minimum focus guard. For static reconcile this is simply `hotkey="a"` / `"p"` / `"n"` on the existing keyed Buttons, retaining their callbacks. For repeated controls calculate eligibility from current focus/selection before setting `hotkey`; never distribute the same letter blindly through `.map`. Await focus-state updates in the existing focus hook and preserve its current selected-ticket/Explorer logic and `next(e)` behavior. Guard input forms conservatively at entry as described above.
6. Run the full plugin suite and `claude plugin validate plugin/mods/ops-board`; fix only regressions attributable to this task. Capture page/form trees at 40/60/80/120 with long names and active confirmation states, check hint completeness and duplicate active letters. See Task 2 for actual keyboard evidence and final width proof.
7. After regression sweep and staged code review, commit only this ticket's approved production/tests: `git add -- plugin/mods/ops-board/hooks plugin/mods/ops-board/types plugin/mods/ops-board/tests` then `git commit -m "feat(ops-board): add contextual alphabet actions (F115)"`. Inspect staging first; preserve unrelated changes.

### Task 2: keyboard and frame evidence - build=build

SATISFIES: R2, R4-R9.

Files: `tests/alphabet.test.tsx` and existing page tests above; durable reports under `.skillator/reports/F115-*`. No new production dispatch abstraction.

Interfaces consumed: final merged plugin, SDK mounted primitive `press/input/select`, existing fixture mocks and pane layout renderer. Produces: matrix evidence report with capture mode, width, key, target, effect and test command.

1. Write failing tests for every new missing hint at 40 columns, duplicate hotkeys with two rows, stale form focus, and current-target switching. Assertions must fail when a required key is missing/clipped or a second control shares its active key. Assert only action hints as ASCII, not unrelated ticket prose/glyphs.
2. Test the real primitive keyboard route. **The installed SDK's `Mounted.key` is Client-only**; do not call it against primitive trees and claim keyboard success, and do not relabel a helper that finds `props.hotkey` then calls `press` as native input. If a newer local SDK/runtime exposes primitive keyboard testing, read and demonstrate it first with a failing key assertion. Otherwise drive an actual terminal host with an isolated fixture plugin and mocked effects; deliver c to open reconcile, a to accept, reopen and pick a row, p to apply, n to cancel. Verify the same exact commands, single invocation and immediate refresh as mounted tests. Include raw a/d typing in a focused Input and then the valid action-focus shortcut. Runtime refusal/unavailable terminal means explicitly missing native-key evidence, not a fabricated pass. Do not block this bounded implementation on unavailable raw-host testing: documented hotkey semantics plus mounted binding/hint and press-effect tests are valid automated evidence; retain physical keyboard/mouse checks for owner live testing.
3. Produce plugin pane proof at 40/60/80/120: Tickets/filters/team, assignment/add person, reconcile, Workflows/engage/diagnose/close, Health, Messages/setup/both setup confirmations, Explorer/branch picker/git confirm, Build/confirm/rename. Use the actual rendering tree through the existing fixture/frame mechanism accepted by the owner; preserve actual button-key text and layout rather than flattening the tree into idealized lines. Verify every hint remains visible and each row fits or wraps whole tokens. State `rendered` or the precise plugin frame mechanism, never `ran` without an emulator observed by a person.
4. Run final CLI/plugin commands in VERIFICATION. If standalone implementation changed under an explicit controller ruling, use its actual app loop with injected keys, isatty stdout, fixed terminal dimensions and raw-mode stubs at 40/60/80/100/120; direct draw-function calls alone are only `rendered`.
5. Stage tests only after a regression sweep, obtain staged review, then commit tests with `git commit -m "test(ops-board): verify alphabet actions and narrow hints (F115)"` if Task 1 did not already include all evidence assertions. Do not create an empty ceremony commit.

## VERIFICATION

From the merged implementation worktree:

```powershell
claude plugin test plugin/mods/ops-board
claude plugin validate plugin/mods/ops-board
npm --prefix plugin/mods/ops-board/ops test
```

Expected: all plugin tests pass, validation has no new errors, all existing Node/CLI/adapters tests pass. Record actual counts and inherited failures separately; do not predict totals. Typecheck using the repo's established SDK path mapping if available; do not check against a handwritten shim.

When available, native-key evidence must show letter -> correct rendered target -> existing action once -> resulting state/toast/refresh, including text-input negatives. The documented native Button.hotkey contract plus mounted binding/hint tests and mounted press-effect assertions are sufficient automated F115 evidence; unavailable physical-host input does not block this bounded build. Leave that exact check in owner live testing. Mounted `.press()` tests alone establish event-chain correctness, not terminal hotkey delivery. All frame records carry mode, widths and a mandatory not-checked line. No completion claim that B17 is fixed.

## TRACE (planned; implementation status NONE)

| Requirement | Production target | Test target | Status |
|---|---|---|---|
| R1 | hooks/pane.tsx and all form/page renderers in FILES | tests/alphabet.test.tsx: every matrix context | NONE |
| R2 | hooks/register.tsx: existing ui.press; render callbacks | tests/reconcile.test.tsx: exact application and refresh; native-key report | NONE |
| R3 | hooks/pane.tsx: TicketsTab | tests/pane.test.tsx: preserved Tickets keys | NONE |
| R4 | hooks/register.tsx: ui.focus; hooks/assign.tsx, messagestab.tsx, runtab.tsx | tests/alphabet.test.tsx: Input-focus suppression and typed letters | NONE |
| R5 | hooks/runstab.tsx and repeated controls in page renderers | tests/alphabet.test.tsx: unique current target, hidden binding absence | NONE |
| R6 | existing action handlers in assign/reconcile/runstab/messagestab/explorertab/runtab | corresponding existing mounted page tests | NONE |
| R7 | action rows in all page/form renderers | tests/alphabet.test.tsx: 40/60/80/120 visible ASCII hints | NONE |
| R8 | merged hooks/register.tsx, pane.tsx, explorertab.tsx | tests/pane.test.tsx, explorer.test.tsx, reconcile.test.tsx | NONE |
| R9 | ABSENT: no test-only dispatcher promoted to production | .skillator/reports/F115-keyboard.md | NONE |

## Decisions

- Ruling: bounded scope, single builder, full ceremony from RUN-0023; this file doubles as the full session record and durable handoff rather than duplicating it under docs/sessions.
- Ruling: native Button hotkeys are the selected mechanism; preserve consuming ui.press hooks. No-op callbacks are not a verified B17 cause.
- Ruling: proceed with F115 despite the non-reproduced owner B17 report; leave B17 open with explicit missing evidence.
- Ruling: keyboard options are page/form actions, not new tab letters. Existing standalone equivalents are inventoried; no unrelated standalone feature parity work.
- Ruling: text inputs win; alphabet form actions require non-text action focus unless actual SDK evidence proves native protection. Esc/Tab/Enter remain.
- Ruling: repeated actions target one current visible row. Prefer existing selection; use focus tracking only where no existing selection exists.
- Ruling: owner-approved plugin frame proof at 40/60/80/120 is sufficient pane evidence; do not describe it as an emulator run. Existing standalone width sweep retains 100.
- Ruling: actual source must be re-read after A161/A164 merge; no old scroll implementation is prescribed here.
- No parked preference questions. Missing live B17/native primitive keyboard evidence is recorded as evidence limits, not assumed answers.

## Self-review and outcome

Coverage: every rendered Button family in page/form source is in the matrix; native Select/input values and read-only rows are explicitly distinguished. No uppercase plugin collision. Input and confirmation precedence are explicit. No speculative framework or unrelated standalone feature work. Build tasks name files, concrete test-first assertions, behavior checks and commands. Source concurrency is a hard precondition.

Outcome: design and B17 investigation only. Mounted reconcile baseline 8 pass / 0 fail. No F115 production changes, commit, staged review, native keyboard proof or final frame proof performed by this design seat.



## Controller width ruling before build

Native plain Button.hotkey renders a visible letter prefix (SDK: a: label). Include that prefix in every physical width/chrome calculation: selected rowText already fills its budget and must not simply gain a3cell prefix. Either reserve actualprefixwidth in row rendering or use a compact contextual action control targeting the same existing selected-row action. Do not mask overflow by idealized testflattening. Include longowner and selected/unselected cases in bothstyles. Any added Tickets keybar control must enter chromeRows/KEY_LABELS accounting and preserve A161 scroll budgets. Exact existing action callback and uniqueness constraints remain.

FILESruling: hooks/lib/ticketsmodel.ts andtests/model.test.ts areincludedforactualhotkeyprefix/chromeRows widthaccounting ifneeded; plugin/mods/ops-board/README.md maydocumentnewkeys. SamecoherentUIfeature,no newexternalcontract. F116willreserveTickets s(status)/h(decisionhelp); do notuse theseforothernewTicketspageactions.
