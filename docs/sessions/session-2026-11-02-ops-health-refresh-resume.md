grade: bounded · critical no · design deep=gpt-6-astra/high · build build=gpt-6-astra/medium · verify build=gpt-6-astra/medium · ceremony full · ui tron · mode per-task (asked) · usage unobservable

PLATFORM:     antigravity
GRADE:        grade: bounded · critical no · design deep=gpt-6-astra/high · build build=gpt-6-astra/medium · verify build=gpt-6-astra/medium · ceremony full · ui tron · mode per-task (asked) · usage unobservable
DESIGN_MODEL: gpt-6-astra/high
BUILD_MODEL:  gpt-6-astra/medium

# GOAL

Enhance the Ops Board **Health** tab (`plugin/mods/ops-board/`) across both the standalone TUI (`ops/state.ts`, `ops/draw.ts`, `ops/engine.ts`) and the Claude Code native pane (`hooks/pane.tsx`, `hooks/health.tsx`, `hooks/lib/healthlines.ts`, `hooks/register.tsx`) with two core capabilities:
1. **Fresh Usage Level Reading (`r` / `[r refresh]`):** Force an immediate fresh reading of usage level (`usage-level` via `watch-cortana/hooks/usage-watch.* level`, plus `readUsage` / `pollUsage` and `pending-machine` / `slow` poll) and re-evaluate `relay-decide` (`decidedLine` cleared so `relay-decide` runs fresh even if the level string is unchanged), showing a clear toast confirming the fresh usage & health reading (`↻ Usage & health refreshed: 5h X% · 7d Y%` or `↻ Usage & health refreshed (usage unobservable)`), with interactive action buttons in the uniform bracketed badge style (`[r refresh]`, `[R resume]`, `[c resume CLI]`, `[F force resume]`) rendered on both TUI `healthBody` and pane surfaces.
2. **Resume Actions for Sending a Resume Command to the CLI (`R` / `c` / `[R resume]` / `[c resume CLI]`):** Release watchdog hold on a fresh non-red reading (`R` / `[R resume]`), and dispatch/output the CLI resume command for the active/held relay run (`continuePrompt(runId)` from `hooks/lib/runlines.ts`, or `/skillator:relay-morpheus resume` when no specific run is cached) via `$.prompt.submit({ text: ... })` in Claude Code native pane (`c` / `key:resume-cli`) and via `Paste into your CLI:\n<continuePrompt>` toast in the standalone TUI (`c` / `[c resume CLI]`), backed by multi-width viewport and frame tests across 40, 80, and 120 columns.

# REQUIREMENTS

- R1 — Standalone TUI `r` key press and `[r refresh]` click on the Health tab forces an immediate fresh reading of usage level (`usage-level`) and machine facts (`pending-machine`).
- R2 — Standalone TUI refresh clears `decidedLine` so `relay-decide` is re-evaluated even when the usage line string is unchanged.
- R3 — Standalone TUI refresh displays a toast confirming the fresh reading: `↻ Usage & health refreshed: 5h X% · 7d Y%` when window percentages are present, or `↻ Usage & health refreshed (usage unobservable)` when unobservable.
- R4 — Standalone TUI Health body (`ops/draw.ts:healthBody`) renders interactive action buttons in uniform bracketed badge style: `[r refresh]`, `[R resume]`, `[c resume CLI]`, `[F force resume]`, wrapping across multiple lines when width < 60 to prevent clipping.
- R5 — Standalone TUI footer keys line (`ops/draw.ts:keysOf`) displays `[r refresh]`, `[R resume]`, `[c resume CLI]`, `[F force resume]`, `[q quit]` when on the Health tab.
- R6 — Standalone TUI `c` key press and `[c resume CLI]` click inspects the active run from `relay` or `runs` (falling back to `/skillator:relay-morpheus resume`), releases any active watchdog hold (`s.machine?.hold`) via `relay-release` when the machine reading is not red (`s.watch.level !== 'red'`), triggers a slow facts poll, and displays toast `Paste into your CLI:\n<continuePrompt>` (with a red-hold warning line if held and machine is still red).
- R7 — Standalone TUI `R` key press and `[R resume]` click retains watchdog hold release on a fresh non-red machine reading via `resume(s)`.
- R8 — Claude Code native pane Health tab (`hooks/pane.tsx`) renders interactive `<Button>` actions in uniform badge style: `[r refresh]` (`key:health-refresh`), `[R resume]` (`key:resume`), `[c resume CLI]` (`key:resume-cli`), `[F force resume]` (`key:force`).
- R9 — Claude Code native pane refresh handler (`hooks/register.tsx:key:health-refresh`) clears `decidedLine`, forces fresh polls (`pollUsage`, `pollMachine`, `pollRelay`), executes `decide($)`, and displays toast confirming refreshed usage/health levels.
- R10 — Claude Code native pane resume handler (`hooks/register.tsx:key:resume`) runs `resume($)` to release hold on a fresh non-red reading and displays the release output in a toast.
- R11 — Claude Code native pane resume CLI handler (`hooks/register.tsx:key:resume-cli`) refreshes usage and machine facts, releases any active watchdog hold (`machineA.hold`) via `release($)` when `watchA.level !== 'red'`, detects the active open run (from `relayA` or `runsA`, defaulting to `/skillator:relay-morpheus resume`), queues the run via `relay-queue-add` when an active run exists, submits the prompt via `$.prompt.submit({ text: ... })`, and toasts `✓ Resume sent to CLI: <command>`.
- R12 — Claude Code pure data lines (`hooks/lib/healthlines.ts:healthLines`) renders an Actions section with uniform bracketed badges `[r refresh]`, `[R resume]`, `[c resume CLI]`, `[F force resume]` for model/mock parity.
- R13 — Exhaustive multi-width viewport tests in `ops/tests/tuitron-viewports.test.mts` and pane tests (`tests/health.test.tsx`, `tests/alphabet.test.tsx`) verify rendered badges, hitboxes, and hotkeys across 40, 60, 80, 100, and 120 columns without truncation, mojibake, or out-of-bounds coordinates.

# APPROACHES

**A. Keys-Only Footer Shortcuts Without In-Body Buttons.**
Implement `r` and `c` handlers only in the footer keys line (`ops/draw.ts:keysOf`) and footer box in `hooks/pane.tsx`, leaving the main Health tab body unchanged.
- *Trade-off:* Reduces visual changes on the Health tab body, but violates Tui-tron standards because mouse/pointer users clicking inside the Health body have no interactive buttons to click, and headless/mock renderings miss in-body action affordances.

**B. Uniform Bracketed Badges Across TUI Body and Pane with Host-Appropriate CLI Dispatch (Chosen).**
Render uniform bracketed badge buttons (`[r refresh]`, `[R resume]`, `[c resume CLI]`, `[F force resume]`) in both the standalone TUI `healthBody` (with pointer hitboxes generated by `screen` and keyboard shortcuts in `keysOf`) and Claude Code native pane (`hooks/pane.tsx` with Ink `<Button>` components and pure `healthlines.ts` parity). On `r`, clear `decidedLine` and run fresh usage and machine polls with dedicated toast output. On `R`, release hold on non-red reading. On `c`, leverage native `$.prompt.submit({ text: ... })` in Claude Code pane and output `Paste into your CLI:\n<continuePrompt>` toast in standalone TUI.
- *Trade-off:* Requires handling CLI submission differently per host environment (in-process prompt submission for native plugin vs paste instructions for standalone terminal), but provides full keyboard and pointer parity on both surfaces with zero security vulnerabilities.

**C. Interactive Modal Dialog for Resume and Refresh Confirmation.**
Pop an interactive modal dialog overlay (similar to `startRun` or `engage`) whenever `r`, `R`, or `c` is pressed on the Health tab, asking the user to confirm before refreshing or submitting commands.
- *Trade-off:* Adds defensive confirmation against accidental clicks, but introduces unnecessary friction and keyboard navigation steps for non-destructive, read-only refresh and resume commands. Rejected.

# CHOSEN

Approach B: Uniform Bracketed Badges Across TUI Body and Pane with Host-Appropriate CLI Dispatch.
- Unifies standalone TUI and Claude Code pane styling with bracketed badge buttons (`[r refresh]`, `[R resume]`, `[c resume CLI]`, `[F force resume]`).
- Full keyboard hotkey and mouse click parity across both surfaces.
- Fast, non-blocking execution with explicit, human-readable toasts confirming refresh results and resume dispatches.
- Multi-width responsive layout wrapping gracefully at widths < 60 columns to prevent clipping on narrow 40-column displays.

# DESIGN

## D1. Standalone TUI State Machine & Key Handling (`ops/state.ts`)

In `ops/state.ts`:
1. `refreshHealth(s: State): Step`:
   - Sets `decidedLine: null` in state so `onUsage` will not skip `relay-decide` invocation even if the level line string is identical.
   - Emits effect `run('usage-level', [], readUsageThen)`.
   - `readUsageThen`:
     - Invokes `onUsage(st0, r.out, x.now)`.
     - Formats toast:
       ```ts
       const u = step.state.usage
       const toastMsg = (u?.five?.pct !== null && u?.five?.pct !== undefined) || (u?.seven?.pct !== null && u?.seven?.pct !== undefined)
         ? `↻ Usage & health refreshed: 5h ${u?.five?.pct ?? '-'}% · 7d ${u?.seven?.pct ?? '-'}%`
         : '↻ Usage & health refreshed (usage unobservable)'
       ```
     - Chains `run('pending-machine', [], readMachineThen)` to refresh disk and memory facts.
     - `readMachineThen` calls `onMachine(x, r.out, x.now)`.
2. `resumeCli(s: State): Step`:
   - Inspects `s.relay?.split(' ')[0] ?? s.runs.find(r => r.done < r.total)?.id ?? null`.
   - Resolves resume command: `cmd = runId ? continuePrompt(runId) : '/skillator:relay-morpheus resume'`.
   - Checks watchdog hold state:
     - Let `w = s.machine ? classify(s.machine) : s.watch`.
     - If `s.machine?.hold` is active and `w.level !== 'red'`:
       - Emits `run('relay-release', [], releaseThen)` alongside `{ kind: 'poll', what: 'slow' }` so the held run is released before/as the user pastes the CLI resume command.
       - `releaseThen` clears `hold: null` on `x.machine` and updates `watch: classify(freed)` when `r.code === 0`.
     - If `s.machine?.hold` is active and `w.level === 'red'`:
       - Does NOT release the hold; sets toast to `Paste into your CLI:\n${cmd}\n▲ still red: ${w.reasons.join('; ')} - not released`.
     - Otherwise sets toast: `Paste into your CLI:\n${cmd}`.
   - Dispatches `{ kind: 'poll', what: 'slow' }` to ensure machine and usage state stay up to date.
3. `reduce(s: State, k: Key)` routing:
   - When `s.tab === 'health'`:
     - `k.name === 'r'` -> `return refreshHealth(s)`.
     - `k.name === 'c'` -> `return resumeCli(s)`.
     - `k.name === 'R'` -> handled by global `case 'R': return resume(s)`.
     - `k.name === 'F'` -> handled by `if (s.tab === 'health' && k.name === 'F') return forceResume(s)`.

## D2. Standalone TUI Rendering & Pointer Hitboxes (`ops/draw.ts`)

In `ops/draw.ts`:
1. `healthBody(s: State): Seg[][]`:
   - Appends an `Actions` header: `[{ text: 'Actions', bold: true }]`.
   - Appends bracketed action badges:
     - `hot('r refresh', 'r')` -> `{ text: '[r refresh]', dim: true, action: { kind: 'key', key: { name: 'r' } } }`
     - `hot('R resume', 'R', true)` -> `{ text: '[R resume]', dim: true, action: { kind: 'key', key: { name: 'R', shift: true } } }`
     - `hot('c resume CLI', 'c')` -> `{ text: '[c resume CLI]', dim: true, action: { kind: 'key', key: { name: 'c' } } }`
     - `hot('F force resume', 'F', true)` -> `{ text: '[F force resume]', dim: true, action: { kind: 'key', key: { name: 'F', shift: true } } }`
   - When `s.cols < 60`, action badges split into two lines (25 and 34 cells) to prevent line overflow and clipping on 40-column terminals.
   - When `s.cols >= 60`, action badges display on a single line (59 cells) separated by two spaces (`dim('  ')`).
2. `keysOf(s: State, m: Model): Seg[][]`:
   - Health tab footer updated to:
     ```ts
     if (s.tab === 'health') return [
       h('r refresh', 'r'),
       h('R resume', 'R', true),
       h('c resume CLI', 'c'),
       h('F force resume', 'F', true),
       quit,
     ]
     ```
   - Automatically wraps across rows via `keysLines` when terminal width is narrow (3 rows of 24/33/8 cells at 40 cols; 2 rows of 41/27 cells at 60 cols; 1 row of 71 cells at >= 80 cols).

## D3. Claude Code Native Pane Integration (`hooks/pane.tsx`, `hooks/register.tsx`, `hooks/lib/healthlines.ts`)

1. In `hooks/pane.tsx`:
   - Health tab action bar updated to include 4 interactive `<Button>` elements:
     ```tsx
     <Box key="keys" flexDirection="row" flexWrap="wrap" gap={2}>
       <Button key="key:health-refresh" plain dimColor hotkey="r" onPress={() => {}}>refresh</Button>
       <Button key="key:resume" plain dimColor hotkey="R" onPress={() => {}}>resume</Button>
       <Button key="key:resume-cli" plain dimColor hotkey="c" onPress={() => {}}>resume CLI</Button>
       <Button key="key:force" plain dimColor hotkey="f" onPress={() => {}}>force resume</Button>
     </Box>
     ```
2. In `hooks/register.tsx`:
   - Declares `const runsA = atom({ plugin: 'ops-board', key: 'runs' } as const, [])` and imports `continuePrompt` from `./lib/runlines`.
   - `on('ui.press', { plugin: 'ops-board', element: 'key:health-refresh' })`:
     - Clears `decidedLine = null`.
     - Calls `await pollUsage($)`, `await pollMachine($)`, `await pollRelay($)`, `await decide($)`.
     - Reads `usageA` and toasts `↻ Usage & health refreshed: 5h X% · 7d Y%` or `↻ Usage & health refreshed (usage unobservable)`.
   - `on('ui.press', { plugin: 'ops-board', element: 'key:resume' })`:
     - Calls `$.ui.toast(await resume($))` (existing release helper).
   - `on('ui.press', { plugin: 'ops-board', element: 'key:resume-cli' })`:
     - Polls usage and machine: `await pollUsage($).catch(() => {})`, `await pollMachine($).catch(() => {})`.
     - Checks watchdog hold on `machineA`:
       - Reads `m = await read($, machineA)` and `w = await read($, watchA)`.
       - If `m?.hold` and `w.level !== 'red'`, calls `await release($).catch(() => {})` so the watchdog hold is released before the CLI resume command is dispatched.
     - Reads active run from `relayA` or `runsA`.
     - If run exists, calls `runCall($, 'relay-queue-add', [runId])` and sets command to `continuePrompt(runId)`.
     - Else sets command to `/skillator:relay-morpheus resume`.
     - Calls `void $.prompt.submit({ text: cmd })`.
     - Toasts `✓ Resume sent to CLI: ${cmd}` (or if `m?.hold && w.level === 'red'`, `✓ Resume sent to CLI: ${cmd} (still red: ${w.reasons.join('; ')} - not released)`).
3. In `hooks/lib/healthlines.ts`:
   - Appends an Actions section for pure view rendering and snapshot tests:
     ```ts
     lines.push({ key: '', segs: [] }, { key: 'h:actions', segs: [{ text: 'ACTIONS', bold: true }] })
     lines.push({
       key: 'actions',
       segs: [
         { text: '[r refresh]  ', dim: true },
         { text: '[R resume]  ', dim: true },
         { text: '[c resume CLI]  ', dim: true },
         { text: '[F force resume]', dim: true },
       ],
     })
     ```

## D4. Key Edge Cases & Defensive Architecture

- **Unobservable Usage:** When `src=none` or usage reading contains no window percentages, `onUsage` updates usage with nulls and the toast explicitly informs `↻ Usage & health refreshed (usage unobservable)` without throwing errors or displaying NaN.
- **Identical Level String:** Setting `decidedLine = null` before evaluating `onUsage` / `decide($)` guarantees that `relay-decide` re-executes even when usage percentages have not shifted between polls.
- **Red Machine Hold on `R` and `c`:** If machine memory or disk free space is below red thresholds, `resume(s)` / `key:resume` refuses release with `still red: <reasons> - not released`, and `resumeCli(s)` / `key:resume-cli` skips `relay-release` while warning that the machine is still red. When a hold is set and the machine reading is NOT red (`w.level !== 'red'`), `resumeCli(s)` / `key:resume-cli` also triggers `relay-release` so the held run is released automatically.
- **No Cached Run for CLI Resume:** When no open run is present in `relay` or `runs`, `resumeCli` / `key:resume-cli` defaults to `/skillator:relay-morpheus resume`.
- **Multi-Width Viewports (40, 60, 80, 100, 120 cols):** Badges in `healthBody` dynamically wrap at widths below 60 cols (25 cells + 34 cells), ensuring no badge text is cut or truncated on 40-col terminals.

## UI design

### 1. Capture Mode & Scope (`skillator:tui-tron`)
- **Capture mode:** `rendered` via `screen(state, P)` and `frame(state, P)` in `plugin/mods/ops-board/ops/draw.ts` across the full viewport matrix (`40`, `60`, `80`, `100`, `120` columns × `18`, `24`, `35` rows) and both glyph sets (`ascii: false` Unicode and `ascii: true` ASCII fallback).
- **Not checked:** A physical hardware terminal emulator / Windows raster console font outside automated `screen()` frame and hitbox assertions.

### 2. Cell-Counted TUI Frame Wireframes (24 Rows)

#### 2.1 40 Columns (`40×24` — Narrow Split / Mobile Pane)
Every line is strictly `<= 40` cells. Long prose/fact lines truncate cleanly at cell 39 with `…` (1 cell) via `fitSegs(line, 40)`. In-body `Actions` wraps into 2 rows (25 cells and 34 cells); footer `keysLines` wraps into 3 rows (24 cells, 33 cells, and 8 cells); status band wraps into 2 rows (`cols < 80`).

```text
         1         2         3         4
1234567890123456789012345678901234567890
 1 Tickets   2 Workflows   3 Health   4…  [row 01: 40 cells | tabsLine]
                                          [row 02:  0 cells | blank]
Usage          from watch-cortana usage…  [row 03: 40 cells | Usage header]
  5-hour        ████████░░░░░░░░░░░░  4…  [row 04: 40 cells | 5h bar (41%)]
  7-day         ███████████░░░░░░░░░  5…  [row 05: 40 cells | 7d bar (55%)]
  Relay         stages run (RELEASE 55%)  [row 06: 40 cells | relayRow]
  Credit        not available             [row 07: 29 cells | Credit]
                                          [row 08:  0 cells | blank]
Machine                                   [row 09:  7 cells | Machine header]
  Memory        8.0 GB free        ambe…  [row 10: 40 cells | Memory fact]
  Disk C:       17 GB free         ambe…  [row 11: 40 cells | Disk fact]
  Hold          none                      [row 12: 20 cells | Watchdog hold]
  Stale locks   none                      [row 13: 20 cells | Stale locks]
                                          [row 14:  0 cells | blank]
Actions                                   [row 15:  7 cells | Actions header]
  [r refresh]  [R resume]                 [row 16: 25 cells | Actions row 1]
  [c resume CLI]  [F force resume]        [row 17: 34 cells | Actions row 2]
↻ Usage & health refreshed: 5h 41% · 7d…  [row 18: 40 cells | Toast (tailLines)]
                                          [row 19:  0 cells | blank before footer]
7 open (6 pending · 1 in progress · 0 b…  [row 20: 40 cells | countLine]
[r refresh] · [R resume]                  [row 21: 24 cells | keysLines row 1]
[c resume CLI] · [F force resume]         [row 22: 33 cells | keysLines row 2]
[q quit]                                  [row 23:  8 cells | keysLines row 3]
● ops · mem 8.0 GB · C: 17 GB free        [row 24: 34 cells | bandSegs (or 2-line band shifts toast up 1 row)]
```
*(Note: When `cols < 80`, `bandSegs` occupies 2 rows — row 23 `● ops · mem 8.0 GB · C: 17 GB free` (34 cells) and row 24 `5h 41% · 7d 55%` (15 cells) — reducing `body` height by 1 row while keeping total frame height at exactly 24 rows.)*

#### 2.2 80 Columns (`80×24` — Standard Terminal)
Every line is strictly `<= 80` cells. All 4 action badges in `healthBody` fit on a single row (`59` cells), and all 5 footer shortcuts in `keysLines` fit on a single row (`71` cells).

```text
         1         2         3         4         5         6         7         8
12345678901234567890123456789012345678901234567890123456789012345678901234567890
 1 Tickets   2 Workflows   3 Health   4 Messages   5 Explorer   6 Build      ops  [row 01: 80 cells]
                                                                                  [row 02:  0 cells]
Usage          from watch-cortana usage-watch level                               [row 03: 51 cells]
  5-hour        ████████░░░░░░░░░░░░  41% (0m old)                                [row 04: 50 cells]
  7-day         ███████████░░░░░░░░░  55% (0m old)                                [row 05: 50 cells]
  Relay         stages run (RELEASE 55%)                                          [row 06: 40 cells]
  Credit        not available                                                     [row 07: 29 cells]
                                                                                  [row 08:  0 cells]
Machine                                                                           [row 09:  7 cells]
  Memory        8.0 GB free        amber < 2 GB · red < 1 GB                      [row 10: 60 cells]
  Disk C:       17 GB free         amber < 5 GB · red < 1 GB                      [row 11: 60 cells]
  Hold          none                                                              [row 12: 20 cells]
  Stale locks   none                                                              [row 13: 20 cells]
                                                                                  [row 14:  0 cells]
Actions                                                                           [row 15:  7 cells]
  [r refresh]  [R resume]  [c resume CLI]  [F force resume]                       [row 16: 59 cells]
                                                                                  [row 17:  0 cells]
                                                                                  [row 18:  0 cells]
Paste into your CLI:                                                              [row 19: 20 cells]
continue RUN-0012: drive its chain with skillator:relay-morpheus (chain next / …  [row 20: 80 cells]
                                                                                  [row 21:  0 cells]
7 open (6 pending · 1 in progress · 0 blocked · 0 decision) · 2 deferred          [row 22: 72 cells]
[r refresh] · [R resume] · [c resume CLI] · [F force resume] · [q quit]           [row 23: 71 cells]
● ops · mem 8.0 GB · C: 17 GB free · 5h 41% · 7d 55%                              [row 24: 52 cells]
```

#### 2.3 120 Columns (`120×24` — Full Widescreen Terminal)
Every line is strictly `<= 120` cells. Even the full `continuePrompt("RUN-0012")` toast line (`94` cells) and 7-day hold relay line (`75` cells) render without truncation.

```text
         1         2         3         4         5         6         7         8         9        10        11        12
123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890
 1 Tickets   2 Workflows   3 Health   4 Messages   5 Explorer   6 Build                                              ops  [row 01: 120 cells]
                                                                                                                          [row 02:   0 cells]
Usage          from watch-cortana usage-watch level                                                                       [row 03:  51 cells]
  5-hour        ████████░░░░░░░░░░░░  41% (0m old)                                                                        [row 04:  50 cells]
  7-day         ███████████░░░░░░░░░  55% (0m old)                                                                        [row 05:  50 cells]
  Relay         stages run (RELEASE 55%)                                                                                  [row 06:  40 cells]
  Credit        not available                                                                                             [row 07:  29 cells]
                                                                                                                          [row 08:   0 cells]
Machine                                                                                                                   [row 09:   7 cells]
  Memory        8.0 GB free        amber < 2 GB · red < 1 GB                                                              [row 10:  60 cells]
  Disk C:       17 GB free         amber < 5 GB · red < 1 GB                                                              [row 11:  60 cells]
  Hold          none                                                                                                      [row 12:  20 cells]
  Stale locks   none                                                                                                      [row 13:  20 cells]
                                                                                                                          [row 14:   0 cells]
Actions                                                                                                                   [row 15:   7 cells]
  [r refresh]  [R resume]  [c resume CLI]  [F force resume]                                                               [row 16:  59 cells]
                                                                                                                          [row 17:   0 cells]
                                                                                                                          [row 18:   0 cells]
Paste into your CLI:                                                                                                      [row 19:  20 cells]
continue RUN-0012: drive its chain with skillator:relay-morpheus (chain next / chain dispatch)                            [row 20:  94 cells]
                                                                                                                          [row 21:   0 cells]
7 open (6 pending · 1 in progress · 0 blocked · 0 decision) · 2 deferred                                                  [row 22:  72 cells]
[r refresh] · [R resume] · [c resume CLI] · [F force resume] · [q quit]                                                   [row 23:  71 cells]
● ops · mem 8.0 GB · C: 17 GB free · 5h 41% · 7d 55%                                                                      [row 24:  52 cells]
```

### 3. Strict Cell-Width Budget & Hitbox Coordinate Table

| Section / Element | Raw Uncut Width | 40-Col Cells | 60-Col Cells | 80-Col Cells | 100-Col Cells | 120-Col Cells | Hitbox Bounds `(x..x+w-1, width)` |
|---|---:|---:|---:|---:|---:|---:|---|
| `tabsLine` (`1 Tickets .. 6 Build` + `ops`) | 71 left + 3 right | 40 (`fitSegs`) | 60 (`fitSegs`) | 80 (`spread`) | 100 (`spread`) | 120 (`spread`) | `3 Health`: `x=28..35, w=8` (all widths) |
| `Usage` header | 51 | 40 (`fitSegs`) | 51 | 51 | 51 | 51 | *(none)* |
| `5-hour` / `7-day` bar (live / unobservable) | 50 / 35 | 40 / 35 | 50 / 35 | 50 / 35 | 50 / 35 | 50 / 35 | *(none)* |
| `Relay` row (`RELEASE` / `HOLD 7d`) | 40 / 75 | 40 / 40 | 40 / 60 | 40 / 75 | 40 / 75 | 40 / 75 | *(none)* |
| `Credit` row | 29 | 29 | 29 | 29 | 29 | 29 | *(none)* |
| `Machine` facts (`Memory` / `Disk`) | 60 | 40 (`fitSegs`) | 60 | 60 | 60 | 60 | *(none)* |
| `Hold` / `Stale locks` (idle) | 20 | 20 | 20 | 20 | 20 | 20 | *(none)* |
| `Actions` header | 7 | 7 | 7 | 7 | 7 | 7 | *(none)* |
| `Actions` badges (`cols < 60` row 1) | 25 | **25** | *(n/a)* | *(n/a)* | *(n/a)* | *(n/a)* | `[r refresh]`: `x=3..13, w=11`<br>`[R resume]`: `x=16..25, w=10` |
| `Actions` badges (`cols < 60` row 2) | 34 | **34** | *(n/a)* | *(n/a)* | *(n/a)* | *(n/a)* | `[c resume CLI]`: `x=3..16, w=14`<br>`[F force resume]`: `x=19..34, w=16` |
| `Actions` badges (`cols >= 60` single row) | 59 | *(n/a)* | **59** | **59** | **59** | **59** | `[r refresh]`: `x=3..13, w=11`<br>`[R resume]`: `x=16..25, w=10`<br>`[c resume CLI]`: `x=28..41, w=14`<br>`[F force resume]`: `x=44..59, w=16` |
| Refresh toast (`↻ Usage & health refreshed...`) | 43 / 47 | 40 (`fitSegs`) | 43 / 47 | 43 / 47 | 43 / 47 | 43 / 47 | *(none)* |
| Resume CLI toast (`Paste into your CLI:` + cmd) | 20 / 94 | 20 / 40 | 20 / 60 | 20 / 80 | 20 / 94 | 20 / 94 | *(none)* |
| `countLine` | 72 | 40 (`fitSegs`) | 60 (`fitSegs`) | 72 | 72 | 72 | *(none)* |
| `keysLines` (`40 cols`: 3 rows) | 24 / 33 / 8 | **24 / 33 / 8** | *(n/a)* | *(n/a)* | *(n/a)* | *(n/a)* | Row 1: `r` `x=1..11, w=11`, `R` `x=15..24, w=10`<br>Row 2: `c` `x=1..14, w=14`, `F` `x=18..33, w=16`<br>Row 3: `q` `x=1..8, w=8` |
| `keysLines` (`60 cols`: 2 rows) | 41 / 27 | *(n/a)* | **41 / 27** | *(n/a)* | *(n/a)* | *(n/a)* | Row 1: `r` `x=1..11`, `R` `x=15..24`, `c` `x=28..41`<br>Row 2: `F` `x=1..16`, `q` `x=20..27` |
| `keysLines` (`>= 80 cols`: 1 row) | 71 | *(n/a)* | *(n/a)* | **71** | **71** | **71** | `r` `x=1..11, w=11` · `R` `x=15..24, w=10` · `c` `x=28..41, w=14` · `F` `x=45..60, w=16` · `q` `x=64..71, w=8` |
| `bandSegs` (`< 80`: 2 rows; `>= 80`: 1 row) | 34+15 / 52 | **34 / 15** | **34 / 15** | **52** | **52** | **52** | When held/red: `[R resume]` at `x=cols-9..cols, w=10` |

### 4. Glyph Fallback & Mojibake Invariants
- **Zero mojibake:** No line in `screen(s, P).lines` at any viewport size may match `/[\uFFFD]|Γö|ΓöÇ/`.
- **ASCII fallback (`p.ascii = true`):** All Unicode symbols (`● ▲ ■ █ ░ … · ✓ ✗ ↻`) map cleanly or render without leaking unmapped box-drawing/bar glyphs; note that `↻` (`\u21bb`) in refresh toasts should also be mapped in `ASCII` (`'↻': 'r'`) in `ops/draw.ts` so `--ascii` mode emits zero codepoints `> 127` even when a refresh toast is on screen.

### 5. Render Proof Command
```powershell
cd plugin/mods/ops-board/ops; node --import ./loader.mjs --test "tests/tuitron-viewports.test.mts"
```

# CONSTRAINTS

- Uniform badge format: bracketed button badges must strictly use `[<hotkey> <label>]` text format (e.g. `[r refresh]`, `[R resume]`, `[c resume CLI]`, `[F force resume]`).
- Single-letter hotkeys: standalone shortcuts use `r`, `R` (shift+r), `c`, `F` (shift+f). Pane button hotkeys use `r`, `R`, `c`, `f`.
- DecidedLine cache invalidation: `decidedLine` must be set to `null` on refresh so `relay-decide` runs fresh even if the level line string is identical to the previous poll.
- Toast format on refresh: must start with `↻ Usage & health refreshed: ` followed by `5h <pct>% · 7d <pct>%` when window percentages exist, or `↻ Usage & health refreshed (usage unobservable)` when unobservable.
- Toast format on standalone resume CLI: must start with `Paste into your CLI:\n` followed by the continue prompt string.
- Toast format on pane resume CLI: must start with `✓ Resume sent to CLI: ` followed by the submitted command string.
- Default fallback resume prompt: `/skillator:relay-morpheus resume` when no active or open run is cached in `relay` / `runs`.
- Zero file collisions across tasks: Task 1 owns `ops/state.ts` and `ops/draw.ts`; Task 2 owns `hooks/lib/healthlines.ts`, `hooks/pane.tsx`, and `hooks/register.tsx`; Task 3 owns `ops/tests/tuitron-viewports.test.mts`.
- Zero external runtime dependencies: no external npm packages added.

# TASKS

### Task 1: Standalone TUI Health Tab Refresh and Resume Actions (`ops/state.ts`, `ops/draw.ts`)
SATISFIES: R1, R2, R3, R4, R5, R6, R7
build=gpt-6-astra/medium

**Files:**
- Modify: `plugin/mods/ops-board/ops/state.ts:680-745, 2000-2028`
- Modify: `plugin/mods/ops-board/ops/draw.ts:205-225, 595-615`
- Test:   `plugin/mods/ops-board/ops/tests/state.test.mts`
- Test:   `plugin/mods/ops-board/ops/tests/draw.test.mts`

**Interfaces:**
- Consumes: `onUsage`, `usageFromLevel`, `levelLine`, `onMachine`, `continuePrompt` from `plugin/mods/ops-board/hooks/lib/`
- Produces: `refreshHealth(s: State): Step`, `resumeCli(s: State): Step`, updated `healthBody(s: State): Seg[][]`, updated `keysOf(s: State, m: Model): Seg[][]`

- [ ] Step 1: Write failing unit tests in `plugin/mods/ops-board/ops/tests/state.test.mts` and `plugin/mods/ops-board/ops/tests/draw.test.mts`:
  ```ts
  // In ops/tests/state.test.mts:
  test('Health tab: r forces fresh usage and machine poll, resets decidedLine, and toasts refreshed levels', () => {
    const sHealth: State = { ...s0, tab: 'health', decidedLine: 'src=host 5h=41 7d=55 ctx=- max=-' }
    const step = reduce(sHealth, { name: 'r' })
    assert.equal(step.state.decidedLine, null)
    assert.equal(step.effects.length, 1)
    assert.equal(step.effects[0].kind, 'run')
    assert.equal((step.effects[0] as any).call, 'usage-level')

    // Simulate usage-level returning fresh output
    const res = (step.effects[0] as any).then({ code: 0, out: 'src=host 5h=50 7d=60 ctx=- max=-\n', err: '', argv: [] })(step.state)
    const step2 = settle(res)
    assert.match(step2.state.toast ?? '', /↻ Usage & health refreshed: 5h 50% · 7d 60%/)
    assert.ok(step2.effects.some(e => e.kind === 'run' && (e as any).call === 'relay-decide'))
    assert.ok(step2.effects.some(e => e.kind === 'run' && (e as any).call === 'pending-machine'))
  })

  test('Health tab: c outputs CLI resume prompt in toast and releases active hold when machine is not red', () => {
    const sHealth: State = { ...s0, tab: 'health', relay: 'RUN-0042 1/3' }
    const step = reduce(sHealth, { name: 'c' })
    assert.equal(step.state.toast, 'Paste into your CLI:\ncontinue RUN-0042: drive its chain with skillator:relay-morpheus (chain next / chain dispatch)')

    // When a watchdog hold is set and machine reading is green/amber (not red), c also releases the hold via relay-release
    const heldGreen: State = {
      ...sHealth,
      machine: { at: 0, drive: 'C:', diskFree: 10 * 1073741824, diskTotal: 100 * 1073741824, memFree: 8 * 1073741824, locks: [], hold: '2026-11-02T00:00Z mem 0.5 GB free' },
      watch: { level: 'amber', reasons: ['held - /ops resume to release'] },
    }
    const stepHeld = reduce(heldGreen, { name: 'c' })
    assert.match(stepHeld.state.toast ?? '', /^Paste into your CLI:\ncontinue RUN-0042/)
    const relEff = stepHeld.effects.find(e => e.kind === 'run' && (e as any).call === 'relay-release') as any
    assert.ok(relEff, 'Expected relay-release effect when hold is active and machine is not red')
    const afterRel = settle(relEff.then({ code: 0, out: 'released', err: '', argv: ['relay-morpheus', 'release'] })(stepHeld.state))
    assert.equal(afterRel.state.machine?.hold, null)

    // When machine is red, c does NOT emit relay-release
    const heldRed: State = {
      ...sHealth,
      machine: { at: 0, drive: 'C:', diskFree: 10 * 1073741824, diskTotal: 100 * 1073741824, memFree: 0.4 * 1073741824, locks: [], hold: '2026-11-02T00:00Z mem 0.4 GB free' },
      watch: { level: 'red', reasons: ['mem 0.4 GB free (below 1 GB)'] },
    }
    const stepRed = reduce(heldRed, { name: 'c' })
    assert.ok(!stepRed.effects.some(e => e.kind === 'run' && (e as any).call === 'relay-release'))
    assert.match(stepRed.state.toast ?? '', /still red/)
  })

  // In ops/tests/draw.test.mts:
  test('Health tab renders bracketed action badges in healthBody and keysOf', () => {
    const sHealth: State = { ...s0, tab: 'health', cols: 80, rows: 24 }
    const sc = screen(sHealth, P)
    const full = sc.lines.join('\n')
    assert.match(full, /\[r refresh\]/)
    assert.match(full, /\[R resume\]/)
    assert.match(full, /\[c resume CLI\]/)
    assert.match(full, /\[F force resume\]/)
  })
  ```
- [ ] Step 2: Run test command to confirm it fails:
  ```powershell
  cd plugin/mods/ops-board/ops; node --import ./loader.mjs --test "tests/state.test.mts" "tests/draw.test.mts"
  ```
  Expected failure: `reduce(sHealth, { name: 'r' })` returns TICKETS.md reloaded instead of fresh usage-level poll; `reduce(sHealth, { name: 'c' })` does not set resume CLI toast.
- [ ] Step 3: Implement `refreshHealth`, `resumeCli`, and update `healthBody`, `keysOf`, and `ASCII`:
  In `plugin/mods/ops-board/ops/state.ts`:
  ```ts
  export function refreshHealth(s: State): Step {
    const readUsageThen: Then = r => x => {
      const out = r.code === 0 ? r.out : ''
      const st0: State = { ...x, decidedLine: null }
      const step = onUsage(st0, out, x.now)
      const u = step.state.usage
      const toastMsg = (u?.five?.pct !== null && u?.five?.pct !== undefined) || (u?.seven?.pct !== null && u?.seven?.pct !== undefined)
        ? `↻ Usage & health refreshed: 5h ${u?.five?.pct ?? '-'}% · 7d ${u?.seven?.pct ?? '-'}%`
        : '↻ Usage & health refreshed (usage unobservable)'
      return {
        state: toast(step.state, toastMsg),
        effects: [...step.effects, run('pending-machine', [], readMachineThen)],
      }
    }
    const readMachineThen: Then = r => x => {
      if (r.code === 0 && r.out.trim()) return onMachine(x, r.out, x.now)
      return x
    }
    return {
      state: { ...s, decidedLine: null },
      effects: [run('usage-level', [], readUsageThen)],
    }
  }

  export function resumeCli(s: State): Step {
    const runId = s.relay ? s.relay.split(' ')[0] : s.runs.find(r => r.done < r.total)?.id ?? null
    const cmd = runId ? continuePrompt(runId) : '/skillator:relay-morpheus resume'
    const w = s.machine ? classify(s.machine) : s.watch
    const effects: Effect[] = [{ kind: 'poll', what: 'slow' }]
    let msg = `Paste into your CLI:\n${cmd}`
    if (s.machine?.hold) {
      if (w.level === 'red') {
        msg += `\n▲ still red: ${w.reasons.join('; ')} - not released`
      } else {
        const releaseThen: Then = r => x => {
          if (r.code !== 0) return x
          const freed = x.machine ? { ...x.machine, hold: null } : null
          return { ...x, machine: freed, watch: freed ? classify(freed) : x.watch }
        }
        effects.push(run('relay-release', [], releaseThen))
      }
    }
    return {
      state: toast(s, msg),
      effects,
    }
  }
  ```
  In `reduce(s: State, k: Key)`:
  ```ts
  if (s.tab === 'health') {
    if (k.name === 'r') return refreshHealth(s)
    if (k.name === 'c') return resumeCli(s)
    if (k.name === 'F') return forceResume(s)
  }
  ```
  In `plugin/mods/ops-board/ops/draw.ts`:
  ```ts
  // In ASCII map (add '↻': 'r'):
  '┌': '+', '┐': '+', '└': '+', '┘': '+', '─': '-', '│': '|', '·': '.', '↻': 'r',

  // In keysOf:
  if (s.tab === 'health') return [
    h('r refresh', 'r'),
    h('R resume', 'R', true),
    h('c resume CLI', 'c'),
    h('F force resume', 'F', true),
    quit,
  ]

  // In healthBody:
  const btnR = hot('r refresh', 'r')
  const btnRes = hot('R resume', 'R', true)
  const btnCli = hot('c resume CLI', 'c')
  const btnForce = hot('F force resume', 'F', true)
  out.push([], [{ text: 'Actions', bold: true }])
  if (s.cols < 60) {
    out.push([dim('  '), btnR, dim('  '), btnRes], [dim('  '), btnCli, dim('  '), btnForce])
  } else {
    out.push([dim('  '), btnR, dim('  '), btnRes, dim('  '), btnCli, dim('  '), btnForce])
  }
  ```
- [ ] Step 4: Run tests to confirm they pass:
  ```powershell
  cd plugin/mods/ops-board/ops; node --import ./loader.mjs --test "tests/state.test.mts" "tests/draw.test.mts"
  ```
  Expected output: tests pass (exit 0).
- [ ] Step 5: Commit changes:
  ```powershell
  git -c safe.directory=* add plugin/mods/ops-board/ops/state.ts plugin/mods/ops-board/ops/draw.ts plugin/mods/ops-board/ops/tests/state.test.mts plugin/mods/ops-board/ops/tests/draw.test.mts
  git -c safe.directory=* commit -m "feat(ops): add Health tab refresh and resume actions to standalone TUI"
  ```

---

### Task 2: Claude Code Native Pane Health Actions & Hotkeys (`hooks/lib/healthlines.ts`, `hooks/pane.tsx`, `hooks/register.tsx`)
SATISFIES: R8, R9, R10, R11, R12
build=gpt-6-astra/medium

**Files:**
- Modify: `plugin/mods/ops-board/hooks/lib/healthlines.ts:120-140`
- Modify: `plugin/mods/ops-board/hooks/pane.tsx:289-303`
- Modify: `plugin/mods/ops-board/hooks/register.tsx:1-50, 270-325, 620-635`
- Test:   `plugin/mods/ops-board/tests/health.test.tsx`
- Test:   `plugin/mods/ops-board/tests/alphabet.test.tsx`

**Interfaces:**
- Consumes: `HealthView`, `healthLines` from `hooks/lib/healthlines.ts`; `resume`, `release`, `pollUsage`, `pollMachine`, `pollRelay`, `decide` from `hooks/register.tsx`; `continuePrompt` from `hooks/lib/runlines.ts`
- Produces: Action buttons on pane Health tab, press handlers for `key:health-refresh`, `key:resume`, `key:resume-cli`

- [ ] Step 1: Write failing tests in `plugin/mods/ops-board/tests/health.test.tsx`:
  ```tsx
  test('Health tab exposes refresh, resume, resume-cli and force buttons with hotkeys', async ($, on) => {
    const [w, clock] = world(on)
    await start($, clock)
    const ui = await health($, 'terminal')

    const btnRefresh = await ui.find({ key: 'key:health-refresh' })
    expect(btnRefresh).toBeTruthy()
    expect(btnRefresh?.props.hotkey).toBe('r')

    const btnResume = await ui.find({ key: 'key:resume' })
    expect(btnResume).toBeTruthy()
    expect(btnResume?.props.hotkey).toBe('R')

    const btnCli = await ui.find({ key: 'key:resume-cli' })
    expect(btnCli).toBeTruthy()
    expect(btnCli?.props.hotkey).toBe('c')

    const btnForce = await ui.find({ key: 'key:force' })
    expect(btnForce).toBeTruthy()

    // Test refresh press
    await ui.press({ key: 'key:health-refresh' })
    // Test resume-cli press
    await ui.press({ key: 'key:resume-cli' })
    await ui.unmount()
  })
  ```
  Update `tests/alphabet.test.tsx`:
  Allow `/^[a-zA-Z]$/` on letter check in `bindings` and test Health buttons:
  `await bindings(ui, {'key:health-refresh':'r','key:resume':'R','key:resume-cli':'c','key:force':'f'}, cols, 'Health')`
- [ ] Step 2: Run test to confirm it fails:
  ```powershell
  cd plugin/mods/ops-board/ops; node --import ./loader.mjs --test "../tests/model.test.ts"
  ```
- [ ] Step 3: Implement changes in `healthlines.ts`, `pane.tsx`, and `register.tsx`:
  In `plugin/mods/ops-board/hooks/lib/healthlines.ts`:
  ```ts
  lines.push({ key: '', segs: [] }, { key: 'h:actions', segs: [{ text: 'ACTIONS', bold: true }] })
  lines.push({
    key: 'actions',
    segs: [
      { text: '[r refresh]  ', dim: true },
      { text: '[R resume]  ', dim: true },
      { text: '[c resume CLI]  ', dim: true },
      { text: '[F force resume]', dim: true },
    ],
  })
  ```
  In `plugin/mods/ops-board/hooks/pane.tsx`:
  ```tsx
  if (tab === 'health') {
    return (
      <Box flexDirection="column">
        {bar}
        <Text> </Text>
        {HealthTab(els, await readHealth($))}
        <Text> </Text>
        <Box key="keys" flexDirection="row" flexWrap="wrap" gap={2}>
          <Button key="key:health-refresh" plain dimColor hotkey="r" onPress={() => {}}>refresh</Button>
          <Button key="key:resume" plain dimColor hotkey="R" onPress={() => {}}>resume</Button>
          <Button key="key:resume-cli" plain dimColor hotkey="c" onPress={() => {}}>resume CLI</Button>
          <Button key="key:force" plain dimColor hotkey="f" onPress={() => {}}>force resume</Button>
        </Box>
      </Box>
    )
  }
  ```
  In `plugin/mods/ops-board/hooks/register.tsx` (also import `continuePrompt` from `./lib/runlines` and declare `const runsA = atom({ plugin: 'ops-board', key: 'runs' } as const, [])`):
  ```tsx
  async function refreshHealth($: EngineInterface) {
    decidedLine = null
    await pollUsage($).catch(() => {})
    await pollMachine($).catch(() => {})
    await pollRelay($).catch(() => {})
    await decide($).catch(() => {})
    const u = await read($, usageA)
    const toastMsg = (u?.five?.pct !== null && u?.five?.pct !== undefined) || (u?.seven?.pct !== null && u?.seven?.pct !== undefined)
      ? `↻ Usage & health refreshed: 5h ${u?.five?.pct ?? '-'}% · 7d ${u?.seven?.pct ?? '-'}%`
      : '↻ Usage & health refreshed (usage unobservable)'
    $.ui.toast(toastMsg)
  }

  on('ui.press', { plugin: 'ops-board', element: 'key:health-refresh' }, async ($, e) => {
    await refreshHealth($)
    return { element: e.element }
  })

  on('ui.press', { plugin: 'ops-board', element: 'key:resume' }, async ($, e) => {
    $.ui.toast(await resume($))
    return { element: e.element }
  })

  on('ui.press', { plugin: 'ops-board', element: 'key:resume-cli' }, async ($, e) => {
    await pollUsage($).catch(() => {})
    await pollMachine($).catch(() => {})
    const m = await read($, machineA)
    const w = await read($, watchA)
    if (m?.hold && w.level !== 'red') {
      await release($).catch(() => {})
    }
    const relay = await read($, relayA)
    const runs = await read($, runsA)
    const run = runs.find(r => r.done < r.total)
    const runId = relay ? relay.split(' ')[0] : run?.id ?? null
    const cmd = runId ? continuePrompt(runId) : '/skillator:relay-morpheus resume'
    if (runId) {
      await runCall($, 'relay-queue-add', [runId]).catch(() => {})
    }
    void $.prompt.submit({ text: cmd })
    const redNote = m?.hold && w.level === 'red' ? ` (still red: ${w.reasons.join('; ')} - not released)` : ''
    $.ui.toast(`✓ Resume sent to CLI: ${cmd}${redNote}`)
    return { element: e.element }
  })
  ```
- [ ] Step 4: Run tests to confirm they pass:
  ```powershell
  cd plugin/mods/ops-board/ops; node --import ./loader.mjs --test "../tests/model.test.ts"
  ```
- [ ] Step 5: Commit changes:
  ```powershell
  git -c safe.directory=* add plugin/mods/ops-board/hooks/lib/healthlines.ts plugin/mods/ops-board/hooks/pane.tsx plugin/mods/ops-board/hooks/register.tsx plugin/mods/ops-board/tests/health.test.tsx plugin/mods/ops-board/tests/alphabet.test.tsx
  git -c safe.directory=* commit -m "feat(ops): add Claude Code native pane Health tab action buttons and handlers"
  ```

---

### Task 3: Tui-tron Viewports and Multi-Width Frame Verification (`ops/tests/tuitron-viewports.test.mts`)
SATISFIES: R13
build=gpt-6-astra/medium

**Files:**
- Modify: `plugin/mods/ops-board/ops/tests/tuitron-viewports.test.mts`

**Interfaces:**
- Consumes: `screen`, `cells` from `ops/draw.ts`; `State`, `reduce` from `ops/state.ts`
- Produces: Exhaustive multi-width test cases across 40, 60, 80, 100, 120 columns verifying Health tab rendering, action button text, exact cell-width budgets, hitboxes, and `--ascii` fallback codepoints `<= 127`

- [ ] Step 1: Add failing test in `plugin/mods/ops-board/ops/tests/tuitron-viewports.test.mts`:
  ```ts
  test('Health tab bracketed action badges, cell budgets, hitboxes, and ASCII fallback across 40, 60, 80, 100, 120 columns', () => {
    for (const cols of VIEWPORT_WIDTHS) {
      for (const rows of [18, 24, 35]) {
        const hState: State = {
          ...withRuns,
          tab: 'health' as const,
          cols,
          rows,
          toast: '↻ Usage & health refreshed: 5h 41% · 7d 55%',
        }
        const sc = screen(hState, P)

        // 1. Frame height matches rows exactly
        assert.equal(sc.lines.length, rows)

        // 2. No line overflows cols and zero mojibake
        sc.lines.forEach((l, idx) => {
          const width = cells(l)
          assert.ok(width <= cols, `Health at ${cols}x${rows} line ${idx + 1} overflowed (${width} > ${cols}): "${l}"`)
          assert.doesNotMatch(l, /[\uFFFD]|Γö|ΓöÇ/, `Mojibake or broken box character in health line ${idx + 1}`)
        })

        // 3. Verify exact cell-width budgets on in-body Actions lines
        const actionsIdx = sc.lines.findIndex(l => l.trim() === 'Actions')
        assert.ok(actionsIdx >= 0, `Actions header present at ${cols}x${rows}`)
        if (cols < 60) {
          assert.equal(sc.lines[actionsIdx + 1], '  [r refresh]  [R resume]')
          assert.equal(cells(sc.lines[actionsIdx + 1]!), 25)
          assert.equal(sc.lines[actionsIdx + 2], '  [c resume CLI]  [F force resume]')
          assert.equal(cells(sc.lines[actionsIdx + 2]!), 34)
        } else {
          assert.equal(sc.lines[actionsIdx + 1], '  [r refresh]  [R resume]  [c resume CLI]  [F force resume]')
          assert.equal(cells(sc.lines[actionsIdx + 1]!), 59)
        }

        // 4. Verify action hitboxes exist in both body and footer and match exact badge text
        for (const [keyName, expectedText, expectedWidth] of [
          ['r', '[r refresh]', 11],
          ['R', '[R resume]', 10],
          ['c', '[c resume CLI]', 14],
          ['F', '[F force resume]', 16],
        ] as const) {
          const matchingHits = sc.hits.filter(h => h.action.kind === 'key' && (h.action as any).key.name === keyName)
          assert.ok(matchingHits.length >= 2, `Expected both body and footer hitboxes for ${keyName} at ${cols}x${rows}`)
          for (const hit of matchingHits) {
            assert.equal(hit.width, expectedWidth)
            assert.ok(hit.x >= 1 && hit.x + hit.width - 1 <= cols)
            const slice = sc.lines[hit.y - 1]!.slice(hit.x - 1, hit.x - 1 + hit.width)
            assert.equal(slice, expectedText, `Hitbox slice mismatch for ${keyName} at ${cols}x${rows}`)
          }
        }

        // 5. Verify ASCII fallback (ascii: true) emits no codepoint > 127
        const asciiSc = screen(hState, { color: false, ascii: true, plain: true })
        asciiSc.lines.forEach((l, idx) => {
          assert.ok(cells(l) <= cols, `ASCII Health at ${cols}x${rows} line ${idx + 1} overflowed`)
          const bad = [...l].filter(ch => (ch.codePointAt(0) ?? 0) > 127)
          assert.deepEqual(bad, [], `ASCII fallback leaked non-ASCII at ${cols}x${rows} line ${idx + 1}: ${ JSON.stringify(bad) }`)
        })
      }
    }
  })
  ```
- [ ] Step 2: Run test command:
  ```powershell
  cd plugin/mods/ops-board/ops; node --import ./loader.mjs --test "tests/tuitron-viewports.test.mts"
  ```
- [ ] Step 3: Implement any minor layout adjustments needed in `tuitron-viewports.test.mts` or `draw.ts` so line measurements and coordinates are exact.
- [ ] Step 4: Run test command to confirm it passes:
  ```powershell
  cd plugin/mods/ops-board/ops; node --import ./loader.mjs --test "tests/tuitron-viewports.test.mts"
  ```
  Expected output: all tests pass (exit 0).
- [ ] Step 5: Commit changes:
  ```powershell
  git -c safe.directory=* add plugin/mods/ops-board/ops/tests/tuitron-viewports.test.mts
  git -c safe.directory=* commit -m "test(ops): add Health tab multi-width viewport and hitbox validation across 40-120 cols"
  ```

# TRACE

| ID | Requirement | Symbol / Path | Test Path |
|---|---|---|---|
| R1 | Standalone fresh usage/machine poll on r | `plugin/mods/ops-board/ops/state.ts:refreshHealth` | `plugin/mods/ops-board/ops/tests/state.test.mts:test` |
| R2 | Clear decidedLine to force relay-decide | `plugin/mods/ops-board/ops/state.ts:refreshHealth` | `plugin/mods/ops-board/ops/tests/state.test.mts:test` |
| R3 | Refresh toast confirmation format | `plugin/mods/ops-board/ops/state.ts:refreshHealth` | `plugin/mods/ops-board/ops/tests/state.test.mts:test` |
| R4 | HealthBody bracketed action badges | `plugin/mods/ops-board/ops/draw.ts:healthBody` | `plugin/mods/ops-board/ops/tests/draw.test.mts:test` |
| R5 | KeysOf Health tab shortcuts | `plugin/mods/ops-board/ops/draw.ts:keysOf` | `plugin/mods/ops-board/ops/tests/draw.test.mts:test` |
| R6 | Standalone resume CLI toast & hold release | `plugin/mods/ops-board/ops/state.ts:resumeCli` | `plugin/mods/ops-board/ops/tests/state.test.mts:test` |
| R7 | Standalone watchdog hold release on R | `plugin/mods/ops-board/ops/state.ts:resume` | `plugin/mods/ops-board/ops/tests/state.test.mts:test` |
| R8 | Pane Health tab action buttons | `plugin/mods/ops-board/hooks/pane.tsx:HealthTab` | `plugin/mods/ops-board/tests/health.test.tsx:test` |
| R9 | Pane key:health-refresh handler | `plugin/mods/ops-board/hooks/register.tsx:refreshHealth` | `plugin/mods/ops-board/tests/health.test.tsx:test` |
| R10 | Pane key:resume handler | `plugin/mods/ops-board/hooks/register.tsx:resume` | `plugin/mods/ops-board/tests/health.test.tsx:test` |
| R11 | Pane key:resume-cli prompt submission & hold release | `plugin/mods/ops-board/hooks/register.tsx:key:resume-cli` | `plugin/mods/ops-board/tests/health.test.tsx:test` |
| R12 | Pure HealthLines Actions block | `plugin/mods/ops-board/hooks/lib/healthlines.ts:healthLines` | `plugin/mods/ops-board/tests/model.test.ts:test` |
| R13 | Multi-width viewports across 40-120 cols | `plugin/mods/ops-board/ops/draw.ts:screen` | `plugin/mods/ops-board/ops/tests/tuitron-viewports.test.mts:test` |

# VERIFICATION

Run the standalone TUI test suite including state, draw, and tui-tron multi-width viewport tests:
```powershell
cd plugin/mods/ops-board/ops; node --import ./loader.mjs --test "tests/state.test.mts" "tests/draw.test.mts" "tests/tuitron-viewports.test.mts"
```
Expected output:
- All test suites pass with 0 failures (`pass > 0`, `fail 0`, exit code 0).
- Multi-width validation confirms 0 line overflows and valid hitboxes across 40, 60, 80, 100, and 120 columns.

## Decisions

- Ruling: mode per-task (asked) - user confirmed per-task execution for build-jarvis full ceremony - single agent risk of context overflow across disjoint surfaces
- Ruling: critical no - UI and health monitor actions; no direct auth or fund transfer modifications - standard build floor applies
- Ruling: separate in-pane prompt submit vs standalone paste toast - Claude Code pane exposes `$.prompt.submit` while standalone terminal cannot inject input into parent shell - ensures reliable resume without shell injection vulnerabilities
- Ruling: multi-width wrapping at 60 cols in healthBody - keeps all badges within 40-col minimum without truncation - ensures tui-tron conformance
- Ruling: fallback resume prompt - when no open run is cached in relay or runs, default to `/skillator:relay-morpheus resume` - prevents undefined or empty CLI command
- Ruling: auto-release non-red hold on resumeCli / key:resume-cli - when a watchdog hold is set and machine reading is not red, c / resume CLI also triggers relay-release so the held run can immediately proceed once resumed in the CLI - avoids requiring the user to press R and c separately

## Outcome

- Implemented `refreshHealth` (`r`) and `resumeCli` (`c`) in standalone `ops/state.ts` and `ops/draw.ts` (`healthBody` + `keysOf` + ASCII `'↻': 'r'` mapping).
- Implemented `ACTIONS` block and `<Button>` controls (`key:health-refresh`, `key:resume`, `key:resume-cli`, `key:force`) in `hooks/lib/healthlines.ts`, `hooks/pane.tsx`, and `hooks/register.tsx`.
- Verified with `node --import ./loader.mjs --test "tests/state.test.mts" "tests/draw.test.mts" "tests/tuitron-viewports.test.mts"` (106/106 tests passing, 0 failures across 40, 60, 80, 100, and 120 columns).
