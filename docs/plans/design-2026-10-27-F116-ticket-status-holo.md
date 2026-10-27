grade: bounded · critical yes (shared ticket-status writer contract) · design deep=gpt-6-astra/high · build build=gpt-6-astra/medium · verify deep=gpt-6-astra/high, held · ui tron · ceremony full · mode single (ruled: RUN-0023) · usage 5h unobservable

# F116 — individual ticket status and source-backed decision help

GOAL: From Tickets, change one selected or typed ticket between Pending, Blocked and Deferred, or generate its read-only holo decision-support page.

CHOSEN: Extend ticket-meta's existing locked single-row writer and reuse native pane forms, Button hotkeys and runCall. Add one narrowly scoped guarded status command; keep legacy block/defer/unblock unchanged. Holo remains the only HTML/diagram renderer. Return a usable local HTML path from the pane; no unverified browser-opening API.

Owner request, verbatim: “can u add option of modifying status for individual tickets like blocked or deffered to take them to pending or user holo-r2d2 for decison support using diagram and html.”

Design seat only: no production implementation, board/run changes, commits or additional agents. Implementation follows F115's committed alphabet bindings and the already merged A161/A164 changes in `.skillator/worktrees/RUN-0023-pending-f100-f104`. Re-read those files after F115 lands. This document also serves as the full-ceremony session record.

## Requirements

R1: A selected-ticket or typed-ID native form exposes Pending, Blocked and Deferred with clear current state and change preview. R2: Returning Blocked or Deferred to Pending clears resolved managed wait notes while preserving ownership, provenance, session claims and unrelated text. R3: Wait states require a valid reason. R4: Every write uses the shared writer's lock, freshness and role/session logic, applies once, reports refusal inline and refreshes the board. R5: Ticket-specific holo uses actual board/run evidence, renders every relevant node and source, and never applies status or answers a decision. R6: Native letters, typing protection and 40/60/80/120-column plugin frames remain correct. R7: sh/PowerShell parity, byte preservation and backward compatibility are verified. R8: B15/B17 remain owner-reported live issues; this feature does not close them.

## Verified source and blast radius

Source read from the RUN worktree before F115 implementation; it has no `.codegraph/`. The main repository has an index and was queried first, but its hits include frozen B17 fixtures; those are not the implementation source. `rg` was unavailable in this Windows session, so PowerShell searches/reads were used for the unindexed worktree.

| Source | Verified behavior and implication |
|---|---|
| `plugin/skills/tickets-zordon/scripts/ticket-meta.sh:265` `edit_line`; `.ps1:337` `Edit-Line` | Locks `TICKETS.md.lock`, invokes board-fresh, rereads the unique row and writes preserving line endings. Validation belongs inside this critical section. Existing automatic board commit/dirty-log behavior stays. |
| `ticket-meta.sh:709-730`; PowerShell `Do-Unblock` | block/defer already share the note writer and refuse closed rows; unblock accepts only `[!]` and drops the blocked note. No pending/undefer exists. |
| `edit_line` OWN_CHECK, `may_take`, `tag_text`; PowerShell equivalents | Existing block/defer/unblock do not request OWN_CHECK. F109 can replace the trailing session tag outside the special move-from-active case. New status controls must explicitly opt into ownership and session preservation; do not describe these as existing guarantees. |
| `hooks/assign.tsx` `openAssign`, `renderForm`, `closeForm` | One pane body, selected ticket or typed case-insensitive ID, inline refusal, Esc cancellation; no second pane. |
| `hooks/register.tsx:631-640` | Reconcile consumes `ui.press`, applies once then forces `poll($, true)`. Use the same event-chain pattern, without a second applying callback. |
| `hooks/lib/calls.ts` / `host.ts:89` | A closed Call union builds argv; runCall chooses trusted script root and absolute interpreter, runs in main repo root, has timeout/error handling. NODE currently hardcodes team.mjs, so holo needs an explicit Node script entry. |
| `holo-r2d2/scripts/holo.mjs` `parseDesign`, `render`, `main`, `writeGenerated` | Existing design sections become components; run stages/decisions are rendered from source. `--html`, `--design`, `--decisions` work; no `--ticket` exists. Generated directory is ignored. |
| SDK declarations `plugin/mods/ops-board/.claude-plugin/types/claude-code/index.d.ts:1089`, `:1185`, `:16379` in main checkout | Click/hotkey/Enter raises ui.press, callback is its bottom; `Mounted.key` is explicitly Client-only. Do not claim native Button keyboard delivery from mounted `.press()`. |

Blast radius: ticket-meta's shared writer and selftests; the shared host call table and its standalone consumer; Tickets pane/forms/focus/refresh/chrome accounting; holo CLI parser/render inputs/selftests. No new framework, board parser replacement, automatic reconcile application, run answers or completion override.

## Transition contract

The new form is intentionally confined to the three requested workflow states. Other states display their current value plus guidance to the existing workflow; they do not gain a new override. Existing CLI block/defer behavior without new guarded arguments stays compatible.

| Current | Pending | Blocked | Deferred |
|---|---|---|---|
| Pending `[ ]` | Already Pending; no command | `status ID blocked`, reason required | `status ID deferred`, reason required |
| Blocked `[!]` | `status ID pending`, clear managed wait notes | Existing reason shown; same reason is no-op, edited reason allowed | `status ID deferred`, reason required; replace managed wait note |
| Deferred `[>]` | `status ID pending`, clear managed wait notes | `status ID blocked`, reason required; replace managed wait note | Existing reason shown; same reason is no-op, edited reason allowed |
| In progress `[~]` | Unavailable: active worker workflow | Unavailable here | Unavailable here |
| Testing `[%]` | Unavailable: verification workflow | Unavailable here | Unavailable here |
| Decision `[?]` | Unavailable: existing Decided action | Unavailable here | Unavailable here |
| Done `[x]`, Cancelled `[-]` | Unavailable: existing reopen/assignment workflow | Unavailable here | Unavailable here |

Invalid/duplicate IDs never resolve to a writable row. The UI may explain ownership, but only the under-lock writer authorizes. An owned row requires the current person to be its owner or team lead. An unowned row can change without claiming it; no team is required for unowned local boards. A historical other-session tag on a waiting row remains byte-for-byte intact. Active-session work is excluded by the source-state restriction, not silently stolen.

## Writer contract and stale-edit protection

Add ONE new command to both twins, leaving legacy block/defer/unblock parsing and behavior untouched:

```text
ticket-meta status <ID> <pending|blocked|deferred> <expected-row> [reason]
ticket-meta status F12 pending "[!] F12 — title (blocked: waiting)"
ticket-meta status F12 blocked "[ ] F12 — title" "waiting for owner"
ticket-meta status F12 deferred "[!] F12 — title (blocked: waiting)" "after release"
```

ID, lowercase target and expected-row are mandatory positional arguments. Pending accepts exactly three arguments after status and only source `[!]`/`[>]`. Blocked/Deferred accept exactly four arguments, with the reason as one argv value; their source set is space/!/>. No target Done/cancel/active/testing/decision exists. Same-state blocked/deferred with identical reason is a validated no-op. Already-pending is a UI no-op and a writer state refusal. Unknown/missing/extra values fail. The expected-row is mandatory, never a force override. This one command sets the existing writer's mark/note/drop/owner options under its normal lock; do not create a second writer.

`unblock <ID>` remains exactly its old strict `[!]` command for reconcile and older callers. The new status command runs owner/lead checks, preserves an existing trailing session tag, and for pending removes managed `(blocked: ...)` and `(deferred: ...)` groups. Existing session stamping is retained when no trailing claim exists; a status operation must never overwrite an existing claim.

The expected-row token is exactly `[` + `Ticket.box` + `] ` + `Ticket.line`. Verified parseBoard uses `raw.slice(indent + 5).replace(/^[ \t]+/, '')` for Ticket.line: remove indentation and the checkbox prefix, then separator spaces/tabs only. Under the writer lock derive exactly that same token from the current raw row and compare ordinally. Preserve original dash, metadata and trailing spaces. Do not normalize title, internal whitespace, case, Unicode, tags or note text. Indentation/separator spacing alone is not a semantic stale edit; preserve its current bytes. A same-state metadata/reason/session edit must fail the comparison. Other-row changes do not fail it. Compare after board-fresh, before same-note no-op detection or any mutation/commit/notification. Test loose-spacing parity explicitly.

Under-lock sequence: acquire existing lock -> freshness check -> locate exactly one row -> expected-row check -> allowed-source check -> owner/lead check -> no-op detection -> minimum edit -> existing write/commit path -> unlock. Refresh identity/lead used for this guarded check through existing functions, preserving role conventions. No forced unlock, override, fallback direct write or automatic retry. Environment/options added to edit_line/Edit-Line are explicitly scoped/initialized so ordinary commands cannot inherit guarded state accidentally.

Managed notes use the existing reserved parenthesized grammar: whitespace plus `(blocked: [^()]*)` or `(deferred: [^()]*)`. Returning pending removes all such groups, including duplicate legacy groups; block/defer guarded mode leaves exactly one current wait note. Testing/verification/Done notes, plan pointers, `[app:]`, `[owner:]`, `[decide:]`, `[by:]`, prose and nested/unrecognized parentheses remain intact. Parenthesized reserved wait notes cannot be distinguished from prose deliberately written in that exact syntax; this is the existing file-format convention, not a claim of arbitrary natural-language parsing. New reasons follow `note_text`: trim ends, nonempty, one line, reject parentheses. UI explains the actual refusal instead of silently rewriting reason text.

No-op/refusal must leave board bytes, HEAD, unrelated staged entries and notification calls unchanged, apart from the existing board-fresh diagnostic status when freshness itself refuses. Lock ownership is released correctly; another holder's lock is never removed. The new status command adds no Teams post. Legacy block/defer retain their existing notifications; notification behavior is not expanded through this new UI. Existing automatic board-only commit and dirty-log fallback are preserved, not bypassed by the pane.

## Native form and event flow

Tickets reserves `s: status` and `h: help`. Add both to actual KEY_LABELS/chromeRows accounting; native plain hotkeys add their visible prefix and must fit A161's scroll budget. Reuse F115's focus guard after its commit. These keys exist only in the relevant Tickets view, not hidden behind forms or Team. Selection comes from the current visible model's `m.ticket`; a group/header gives an empty ID form, never an arbitrary hidden child.

Create `hooks/status.tsx` and `StatusDraft` in `types/index.d.ts`. Draft fields: `id: string`, `target: 'pending'|'blocked'|'deferred'|null`, `reason: string`, `expectedRow: string|null`, `result: string|null`, `busy: boolean`, `helpPath: string|null`, `mode: 'status'|'help'`. Use one registered `status` atom, following existing form atoms. `openStatus($, shown, canType, mode)`, `renderStatus($, e)`, `applyStatus($): Promise<boolean>`, `generateStatusHelp($): Promise<void>`, `clearStatus($)` are the new local module interfaces. applyStatus returns true only when a successful writer call occurred; register owns immediate forced refresh afterward. Naming may follow merged local style, but these responsibilities must not be duplicated.

Form content order: Ticket Input; exact resolved ID/title/current state; three target choices; reason when Blocked/Deferred; Current -> Target preview; brief effect explanation; inline result; Apply and Cancel. Show current reason as source text. An eligible current state starts with no new target selected, so opening never implies a decision. `p`, `b`, `d` choose targets only; `c` cancels. Apply uses focus+Enter or click, not another ambiguous alphabet key. `h` generates help for the resolved ID. Target choice never applies. Changing ID clears target, reason, expectedRow, result and old helpPath, then captures the newly resolved row as the displayed snapshot. Reason edits do not refresh the expected row silently.

While a text Input is focused, form letters are absent/disarmed using F115's real focus state; typed `pbdcsh` stays text. On eligible non-text action focus, arm the choices. Esc and Cancel close without mutation. Without Input support, a selected ticket can still return to Pending; a new wait reason requires a keyboard surface and is explained. Empty selection without Input is a clear refusal, matching assignment behavior.

Register consumes the single `status:apply` ui.press just as reconcile does: await applyStatus, force `poll($, true)` after a successful call and after refusal when stale state needs displaying, then return `{element:e.element}`. The Button bottom callback does not repeat the writer. busy is set atomically before awaiting process execution; repeated presses while busy return. Keep only one command in flight. Disable editing/action controls during it; closing/unmounting cannot cancel a started writer. An old completion must not update a newly opened draft (retain the captured draft identity or generation counter).

After success, toast actual result/warnings, close the form and refresh counts/selection. Writer refusal leaves ID, selected target and reason visible with its exact useful stderr and a clear retry instruction. For stale row, show that the board changed, refresh source display but require explicit reselect/reopen to capture a new expectedRow; do not silently apply the old intent to a new row. Unknown script root/Node/shell, lock timeout, writer timeout, permission refusal and invalid reason all remain visible. A timeout is ambiguous: refresh/read status and tell the user to check before retrying; never automatically issue the write twice.

`isFormUp`, `clearForm`, Esc handling and tab changes include the status atom. Only one form renders at a time. Starting assignment/reconcile clears status; starting status clears other Tickets forms through the existing lifecycle. Avoid mutual module imports by letting status depend on host/board/types only and having assign's common lifecycle call status's clear function, or use equivalent non-cyclic registration in the merged source.

## Holo data and host launch

The current `--design` path is sufficient for this design review and is used below. It is not sufficient for arbitrary selected tickets: a page must show that ticket's current reason, owner and source, even when it has no plan/run. Add the minimal `--ticket <ID>` option to holo.mjs, accepted with `--html` (and optionally existing ASCII mode), without an arbitrary HTML template in the pane.

`node <trusted-skills>/holo-r2d2/scripts/holo.mjs --ticket F12 --html` reads root/TICKETS.md fresh, resolves exactly one canonical ID, and renders a ticket-specific component set through the existing render/standalonePage/writeGenerated functions. Output defaults to `.skillator/holo/ticket-F12.html`; stdout retains `holo: ... -> <absolute path>`. No browser-opening command is necessary for a working first version. Return that absolute path persistently in the help form and a toast; provide the exact generation command as a fallback. Long paths wrap and remain readable/selectable. No fictional `$.ui.openUrl` or generic shell-string launch.

Ticket components: source path and line; exact current status, title, owner and wait/testing notes; Pending/Blocked/Deferred meanings and the current transition eligibility; known linked ticket states from explicit IDs in managed wait notes; matching run stage/decision evidence with source path and stage/Q IDs; no-run/no-plan/evidence-missing messages. Existing `parseRun`/renderer handles matching runs and all their stages. Match ticket IDs as full tokens in stage/decision fields, not `F1` inside `F12`. If several runs match, list all and their source links; do not silently choose the latest as authoritative. A bounded implementation can render each matching run with the existing renderer in the same standalone body. A ticket with no matching run still gets its ticket components and status guidance. `--ticket` plus explicit `--design` may include that supplied document; do not heuristically claim a plan that merely mentions the ID is authoritative.

This page is evidence and advice, not a status editor or a wizard question fabricated from an engineering choice. Display: “Pending: the blocker or deferral is resolved”; “Blocked: work cannot continue; record what is needed”; “Deferred: intentionally postponed; record when to revisit.” Unknown wait resolution stays unknown. Never recommend Pending simply because a note names a done ticket when additional human conditions remain. Existing true run decisions may be drawn, but standalone pages do not apply answers. No automatic `--answers` import or relay writes.

Host plumbing: add only `meta-status` and `holo-ticket` to the closed Call union/table. Map meta-status to ticket-meta status on sh/ps, with argv arrays containing canonical ID, lowercase target, exact snapshot and optional single reason argument. Existing meta-block/meta-unblock stay unchanged. Extend Node entries to carry their own script path (existing team entries still point to team.mjs; holo-ticket points to holo-r2d2/scripts/holo.mjs) so argvFor does not route holo to TEAM_JS. isNodeCall/findNode/runCall remain the actual supported APIs. Preserve absolute executable lookup and trusted skillatorRoot; cwd stays repo.root. Shared standalone imports must retain all current team argv exactly. Missing Node/scripts produce existing runCall errors; do not add a browser dependency or network fetch.

The page may only write its generated ignored output. All board/run bytes and HEAD stay unchanged during generation. Escape every ticket/run/decision value via existing esc/render machinery, including quotes, ampersands, backticks, `</script>` and HTML tags. Treat source text as data, not commands. Do not interpolate ticket titles or reasons into a shell string, executable path, output basename or raw HTML. Canonical validated ID alone determines ticket output name.

## FILES and constraints

Implementation contract, relative to the RUN worktree:

- Modify `plugin/skills/tickets-zordon/scripts/ticket-meta.sh` and `ticket-meta.ps1`, including their embedded selftests; `plugin/skills/tickets-zordon/SKILL.md` for guarded status syntax.
- Create `plugin/mods/ops-board/hooks/status.tsx` and `tests/status.test.tsx`.
- Modify `plugin/mods/ops-board/types/index.d.ts`, `hooks/assign.tsx`, `hooks/pane.tsx`, `hooks/register.tsx`, `hooks/lib/calls.ts`, `hooks/lib/ticketsmodel.ts`; `hooks/lib/host.ts` only if the Node error description needs correction for multiple Node scripts.
- Modify `plugin/mods/ops-board/tests/host.test.ts`, `tests/model.test.ts`, F115's `tests/alphabet.test.tsx`, `tests/pane.test.tsx`, and `README.md` for new keys/lifecycle/width coverage. Existing reconcile/assignment tests remain regression callers.
- Modify `plugin/skills/holo-r2d2/scripts/holo.mjs` with embedded selftests and `plugin/skills/holo-r2d2/SKILL.md` for --ticket. No manual HTML source file and no wizard.mjs changes are needed.
- Evidence under `.skillator/reports/F116-*`; this durable plan remains in main docs/plans. Any additional production file needs a controller scope ruling before edit.

CONSTRAINTS:
- F116 implementation follows F115's commit and rereads merged A161/A164/F115 source. No parallel shared-file builders.
- The new status command target pending is only `[!]`/`[>]` -> `[ ]`; legacy block/defer/unblock are unchanged, including unblock `[!]` only. New form only edits Pending/Blocked/Deferred; no Done/cancel/reopen/decision/testing overrides.
- Every new form write includes exact displayed expected-row token, checked under the existing lock after freshness; writer enforces owner/lead and source-state rules. No renderer or HTML board writes.
- Existing owner/metadata/provenance/unrelated text and any existing session claim survive. Only checkbox and reserved wait-note fields change, plus existing session stamping when no claim exists. Preserve sh/PS byte behavior.
- Wait reasons use existing nonempty, one-line, no-parentheses grammar; no silent normalization beyond its trim.
- Native lowercase s/h on Tickets; p/b/d/c within form; typing suppresses alphabet actions via F115. Apply once through one consuming event handler; force refresh and show refusals.
- Holo pages are generated solely by holo.mjs from real source. They decide nothing, write no board/run and return an actual local HTML path; no invented SDK/browser API.
- Capture plugin frames at 40/60/80/120 with real prefixes and chrome budgets. Mounted.key is Client-only; distinguish mounted press, rendered frames and physical keyboard evidence.
- B15/B17 stay open/unreproduced live issues. No completion claim for them from these tests.

## TASKS

### Task 1: guarded status writer parity — build=build

Files: ticket-meta.sh/.ps1 selftests and command implementations; tickets-zordon/SKILL.md. Consumes current edit_line/Edit-Line, role/freshness/lock functions. Produces the single mandatory-snapshot status contract above. This task is independently testable before pane code.

1. Add failing embedded tests in each existing isolated selftest fixture. Concrete vectors (construct rows using each harness's existing dash and run helpers):

```text
input:  - [>] F91 — Later [app: ops] [owner: @asha] [by: @neo] (testing: owner check) (deferred: after release) (@cc-old:asha:run)
call:   as @asha, status F91 pending "[>] F91 — Later [app: ops] [owner: @asha] [by: @neo] (testing: owner check) (deferred: after release) (@cc-old:asha:run)"
output: - [ ] F91 — Later [app: ops] [owner: @asha] [by: @neo] (testing: owner check) (@cc-old:asha:run)
input:  - [!] F92 — Wait (user note) (blocked: F3) (deferred: old) Plan: S12
call:   status F92 pending "[!] F92 — Wait (user note) (blocked: F3) (deferred: old) Plan: S12"
output: - [ ] F92 — Wait (user note) Plan: S12
```

Use the real harness assertion forms, e.g. shell `eq "pending preserves claim" "$(run status F91 pending "$snapshot")" "$expected"`; PowerShell `Eq 'pending preserves claim' (Run status F91 pending $snapshot) $expected`. Run as the owner using existing AsMe/session helpers. Test old `unblock F91` while deferred still refuses. Run both selftests now and record RED unknown status / wrong state behavior, not a setup failure.

2. Add the under-lock guarded branch before no-op detection. In shell use explicit `EXPECT_ROW`/`GUARDED_STATUS`/`DROP_WAIT`/`KEEP_SESSION` scoped variables and in PS corresponding options; compare canonical row strings ordinally, enable existing owner logic, then perform minimum edit. The new command sets guarded mode with blocked/deferred targets allowing only space/!/>, replacing reserved wait groups with one note; pending target accepts only !/> and drops both note types. Do not apply new checks to legacy calls accidentally.

3. Add rejection tests: each excluded source state; unknown/duplicate ID; expected checkbox mismatch and same-checkbox title/owner/reason/session change; wrong owner, owner and lead success; unknown current person on owned row; unowned/no-team success; whitespace-only/newline/parentheses reason; absent/malformed expected argument or unknown target; another-session tag preserved. Same-note is a byte/HEAD no-op. Explicitly mutate row after form-style snapshot but before invoking writer; exact expected-row refusal must occur even though board freshness itself passes.

4. Exercise real lock contention with a foreign sentinel and zero wait; assert sentinel unchanged and board/HEAD unchanged. Use existing stale-upstream fixture for board-fresh refusal. Successful and failing paths preserve an unrelated staged file. Test CRLF/LF, UTF-8 BOM if existing reader supports it, Unicode, mixed dash/loose spacing, Windows backslash prose, and final newline absent/present using byte-array comparison against expected one-row edits (not trimmed text). Unrelated lines must be byte-identical. Do not introduce new encoding support beyond the existing format silently.

5. Run exact selftest commands in VERIFICATION, inspect failure count and exit code. Keep established F64/F80/F81/F109 selftests green. Regression sweep shared writer callers before staged code review. Commit only approved files after review; if this builder combines tasks into one reviewed commit, record each task's evidence rather than making an empty intermediate commit.

### Task 2: native status form and host integration — build=build

Files: status module/types; assign/pane/register; calls/host; model accounting; named plugin tests/README. Consumes Task 1 and final F115 focus contract. Produces selected/ID form with one writer call and forced board refresh.

1. Start tests/status.test.tsx from the actual assign/reconcile mounted fixture pattern. Mount terminal and desktop using `$.ui.mount`, mocked filesystem and real ui.press chain. RED assertions include:

```tsx
expect((await pane.find({key:'key:status'}))?.props.hotkey).toBe('s')
await pane.press({key:'key:status'})
await pane.press({key:'status:pending'})
await pane.press({key:'status:apply'})
expect(w.runs).toHaveLength(1)
expect(w.runs[0]!.argv).toEqual(['/bin/sh', META + '.sh', 'status', 'F91', 'pending', '[>] F91 — Later (deferred: after release)'])
expect(await pane.find({key:'status:apply'})).toBeUndefined()
```

Seed selected F91 and expected board change in the fixture; assert reloaded row/count after success, not only command arguments. Add a no-selection flow which fills native Ticket Input with `f91`, resolves canonical F91, and applies the same guarded command. Use the existing mounted Input target signature, not a made-up keyboard dispatcher. Test block/defer argv includes one literal reason argument with quotes/backslashes/flag-like words; no command-string expansion.

2. Implement the form/lifecycle/event interfaces above. Add one consuming status:apply hook beside reconcile and preserve its existing return convention. Protect busy before await and draft identity afterward. Make source snapshot explicit; stale failure keeps unsent input and does not auto-retry. Test delayed process plus duplicate presses produces exactly one invocation, cancellation/tab exit races, same-state no-op, invalid/closed/active IDs, owner rejection and process timeout/error. Ensure no plugin fs.write targets TICKETS.md.

3. Add real focus-event tests using F115 helpers: type `pbdcsh` while Ticket/Reason Input focused, all text retained and no writer/help process started; action focus restores distinct p/b/d/c; no hidden Tickets s/h exists behind form. Test selection of collapsed/header/filtered rows cannot target hidden tickets. `status:help` opens/generates for resolved ID; missing Input surfaces explicitly explain reason entry requirements.

4. Host argv tests exercise sh, System32 PowerShell and Node absolute paths with spaces, missing Node/scripts and refused executable lookup. The new Node map retains all old team calls byte-for-byte, tested through argvFor/runCall. Include the single meta-status call with each target in exact table expectations and standalone consumer regression suite.

5. Persist plugin frame assertions at 40/60/80/120 for Tickets and every new form state: no selected row, long selected title/owner, long reason/error/help path, choices, Apply busy, return after Cancel. Include actual native hotkey prefixes, entire existing screen sweep and changed KEY_LABELS/chromeRows budget; no idealized flattened strings. Run plugin tests/validate and existing ops tests. Document mounted event-chain evidence separately from physical key/mouse delivery. Review staged diff after regression sweep before commit.

### Task 3: source-backed holo ticket projection — build=build

Files: holo.mjs embedded selftests/SKILL.md and Task 2's help handler/host/test integration. Consumes current holo renderer and trusted runCall Node entry. Produces actual ticket-specific HTML and local path from the pane.

1. RED selftests: parseArgs accepts `['--ticket','F91','--html']`; reject invalid ID and incompatible answer/wizard modes; fixture board unique F91 deferred, F9 active and F910 separate. Generate F91 page and assert its exact state/reason/owner/source, only full-ID matching run evidence, all stages of each included run, no-run case, duplicate ID refusal. Include `</script><img src=x onerror=1>`, ampersands and quotes in title/reason; output must escape them and never embed executable source text. Assert every ticket component has a rendered node, not just one title occurrence.

2. Implement ticket input as explicit data for the existing render path. Discover run files within root/.skillator using existing file resolution helpers; parse and filter only declared ticket references. Do not read or execute instructions embedded in board text. Existing --design/--decisions behavior remains. Default ticket output name derives from canonical ID, no user path traversal.

3. In a temporary git fixture capture hashes of board/run files, HEAD and index before and after `node holo.mjs --root <fixture> --ticket F91 --html`. Assert output file exists and contains every expected source/node; hashes unchanged and only ignored generated outputs added. Run existing holo selftest suite as well. Add mounted help success/error tests asserting one trusted Node argv call and the generated absolute path retained in the form, plus no status writer invocation. No mocked output alone can establish actual generation; retain the CLI fixture proof.

4. Generate this design review page using the command below. Before code commit, run the entire verification set, sweep callers and obtain staged code review. The held deep verifier independently checks the writer contract and source-backed page, including no claims that B15/B17 were fixed.

## VERIFICATION

Run from the implementation worktree with its own scripts, after all tasks and after F115 is committed:

```powershell
& 'C:/Program Files/Git/bin/sh.exe' plugin/skills/tickets-zordon/scripts/ticket-meta.sh selftest
powershell -NoProfile -ExecutionPolicy Bypass -File plugin/skills/tickets-zordon/scripts/ticket-meta.ps1 selftest
node plugin/skills/holo-r2d2/scripts/holo.mjs --selftest
claude plugin test plugin/mods/ops-board
claude plugin validate plugin/mods/ops-board
npm --prefix plugin/mods/ops-board/ops test
```

Resolve the actual installed sh.exe if that documented Git location is absent; record the executable. Expected: zero new failures and successful exits. Record actual counts, inherited failures and RED/GREEN evidence rather than predicting totals. SDK typecheck uses actual installed declarations/path mapping, no handwritten shim. Existing writer selftests must remain isolated; no real board fixture mutation.

Evidence report names width, capture mode, source revision, actual command and limitation. Plugin frames are `rendered`/mounted-tree evidence, not `ran` in a terminal. Installed Mounted.key does not test primitive physical keys; real terminal mouse/letters remain an owner live check if unavailable. Mandatory not-checked line names emulator/font/raw key limits and live B15/B17. No B15/B17 ticket closure is authorized by this design.

Design artifact command, from the main root after writing this file:

```powershell
node plugin/skills/holo-r2d2/scripts/holo.mjs RUN-0023 --design docs/plans/design-2026-10-27-F116-ticket-status-holo.md --html
```

Expected generated path: `C:/tools/Projects/skillator2/.skillator/holo/RUN-0023.html`. Verify it exists, contains all parsed run stages/design components and is ignored. It is review evidence only, not the future --ticket implementation.

## TRACE

| Requirement | Production task | Verification | Implementation |
|---|---|---|---|
| R1 selected/ID status | Task 2 | terminal/desktop mounted forms, exact argv/current-state preview | NONE |
| R2 pending/note/claim preservation | Task 1 | blocked/deferred fixtures and byte comparisons | NONE |
| R3 reason | Tasks 1/2 | empty/newline/parentheses rejection, literal reason argv | NONE |
| R4 lock/role/stale/apply once | Tasks 1/2 | lock/upstream/stale/wrong-owner/double-press and immediate refresh | NONE |
| R5 actual-source holo | Task 3 | real CLI generated page, every node/source, escaping, unchanged board/run hashes | NONE |
| R6 letters/width | Task 2 | F115 focus guard, native prefixes, 40/60/80/120 frame assertions | NONE |
| R7 parity/compatibility | Tasks 1/2/3 | both writer selftests, old host calls/ops suite, existing holo modes | NONE |
| R8 honest live status | all | report retains B15/B17 and missing physical-event evidence | NONE |

## Decisions

- Ruling: bounded additive flow, single builder inside RUN-0023, shared writer contract makes it critical; deep verification stays held. No owner preference question is needed.
- Ruling: a single new guarded status subcommand and one meta-status host call are smaller than a pending command plus three optional argument parsers. It reuses the existing locked writer and has mandatory optimistic concurrency/ownership/session guarantees. Legacy block/defer/unblock APIs and notification behavior remain unchanged; no ambiguous flag parsing is added.
- Ruling: source-state set is Pending/Blocked/Deferred only. Moving active/testing/decision/closed work is outside this request's minimal status recovery flow.
- Ruling: a generated local HTML path is the smallest supported host delivery; automatic browser opening is unnecessary and no unsupported API is invented.
- Ruling: --ticket is needed for actual selected-ticket facts, not simply the run that happens to mention it; it reuses holo renderers and is covered by selftests.
- Ruling: no arbitrary inferred plan is attached to a selected ticket; explicit design path is supported, actual run/board evidence remains sufficient.
- Ruling: preserving an existing session tag wins over new-operation stamping for this new guarded workflow. Other writer commands retain their existing stamping rules.
- Ruling: B15/B17 are not remedies in this ticket. Reconcile's documented consuming hook remains; 8/8 existing mounted results do not establish owner live behavior.

## Self-review and design-seat outcome

Coverage checked against R1-R8; each has a task and concrete verification. Interfaces agree on expectedRow, positional argv and bool success/refresh ownership. All states, source freshness, same-state no-op, reason parsing and unknown evidence have explicit behavior. Scope remains three tightly coupled tasks; no unrelated status subsystem, browser bridge or bespoke diagram generator. F115 source ordering and physical-key limitations are explicit. No production tests are claimed run by this design seat. The generated page is produced separately from this document by the existing holo script.

## Controller critical transport check

The mandatory expected-row travels through the actual host argv builder and native sh/PowerShell process, not merely an in-process helper. Add a temporary fixture/real-process round-trip with double/single quotes, Unicode, Windows backslashes, backticks and literal $(...) in ticket text. Assert exact expected-row equality and no marker/side-effect file. Use discrete argv, never shell-string interpolation; if native PowerShell quoting cannot preserve this safely, choose a tested opaque encoding for the snapshot boundary consistently across both writers/callers rather than silently normalizing user text. No credential data in evidence. This is within the existing critical contract and prevents stale-edit refusals on ordinary quoted titles.
## Controller apply-once check

Protect each status/help action against rapid repeated activation while in flight. Claim the form busy state atomically in its update callback before spawning; an old rendered Apply button event must also observe/refuse the busy state, not rely solely on a later disabled render. Add a delayedexec mounted regression pressing Apply twice before the first completion, asserting one writer call and one refresh; error completion keeps the form usable with clear refusal. Existingwriter lock/stale guard remains the final data protection. Preserve keyboardfocus guard fromF115.
