grade: architectural · critical no · design deep=fable · build build=opus · verify deep=fable · ceremony full · usage unobservable · tiers: defaults

PLATFORM:     claude-code (design seat; the build runs here, the result runs beside codex / cursor / pi / gemini / agy / claude)
GRADE:        grade: architectural · critical no · design deep=fable · build build=opus · verify deep=fable · ceremony full · usage unobservable · tiers: defaults
DESIGN_MODEL: fable
BUILD_MODEL:  opus (build=build), sonnet (build=cheap)
TICKETS:      F55 (standalone `ops` TUI), F54 (/pending and /list-tickets on every host). F56/F57 out of scope; their data layer is fixed here.

# GOAL

Give every CLI the ops board. Two deliverables, F55 first:

1. **F55 — `ops`**: a standalone terminal app, launched by `ops.sh` / `ops.ps1`, run in a second terminal beside any CLI. Tickets, Runs and Health tabs, the assign / decide dialog and the watchdog line, driven by the same four script families the ops-board mod calls (`tickets-zordon/scripts/pending.*`, `tickets-zordon/scripts/ticket-meta.*`, `relay-morpheus/hooks/relay-morpheus.*`, `watch-cortana/hooks/usage-watch.*`), no host API, no Agents / Workflows tabs. 80 columns, keys as in the mod. Its data layer (the mod's `hooks/lib/*.ts` plus a node host) is what F56 (pi extension) and F57 (Antigravity webview) build on.
2. **F54 — slash commands**: `install.sh` / `install.ps1` write `/pending` and `/list-tickets` as each host's own command file - Codex prompts, Gemini CLI custom commands, Cursor commands, Pi prompt templates, Antigravity skill-commands - each loading `tickets-zordon` and running `pending.sh` / `pending.ps1` or the list views. prime-agent has no mechanism and is named in `PLATFORMS.md`.

Verified facts this design stands on (probed 2026-10-20 on this machine, read-only; `verified` = seen in a binary, source file or a command's output; `inferred` = from the vendor's docs or a related string, not run):

| Fact | Tag | Evidence |
|---|---|---|
| node 22.23.2 runs a `.ts` file directly, no flag (type stripping unflagged since 22.18) | verified | `node strip.ts` → `ts-ok 1` |
| node ESM does not resolve an extensionless relative import (`'./facts'`) | verified | node docs; `hooks/lib/host.ts:3` is the one runtime import of that shape in `lib/` - every other `lib/` import is `import type` (erased) |
| python 3.13, deno 2.9.5 also present here; no bun | verified | `--version` |
| The mod's test runner is `claude-code/testing` (`claude plugin test`), 182 tests across 14 files | verified | `grep -c "^test(" mods/ops-board/tests/*` |
| `install.sh` ships `skills/*` to `<dest>/<skill>/` (flat: no `skills/` segment) plus PLATFORMS/PRACTICE/WORKFLOW.md, `practice/`, `references/`; nothing under `mods/` ships | verified | `install.sh` `install_into` |
| Claude Code's plugin cache holds the whole repo (`.../cache/skillator/skillator/4.9.1/` with `skills/` and `mods/`); `host.ts` `up($.plugin.root, 2)` lands there | verified | `installed_plugins.json` installPath; `host.ts` |
| `pending.sh --kv` / `--machine` keys, `usage-watch.sh level` → `src=<claude-code|codex|none> 5h=<pct|-> 7d=<pct|-> ctx=.. max=..`, `relay-morpheus.sh chain decide --level "<line>"` → `RELEASE ..` / `HOLD <pct>[ 7d]` / `UNOBSERVABLE` | verified | script headers; `facts.ts` `levelLine`, `register.tsx` `decide` |
| `usage-watch.ps1 -Mode level` exists | verified | `usage-watch.ps1:5,15` |
| Gemini CLI 0.57: custom commands are `<~/.gemini>/commands/<name>.toml` (user) and `<project>/.gemini/commands/<name>.toml`; TOML `prompt` with `{{args}}` and shell injection `!{...}` | verified | bundle: `getUserCommandsDir()`, `getProjectCommandsDir()`, `SHELL_INJECTION_TRIGGER = "!{"`, `{{args}}` ×3 |
| pi 0.74.2: prompt templates are `~/.pi/agent/prompts/<name>.md` and `<cwd>/.pi/prompts/<name>.md`; frontmatter `description`, `argument-hint`; `$ARGUMENTS`, `$1`, `$@`; invoked as `/<name>` | verified | `dist/core/prompt-templates.js` |
| cursor-agent 2026.10.16: commands are `.cursor/commands/<name>.md` with `---\ndescription: ...\n---` frontmatter; the CLI's own writer produces that shape | verified | `index.js` (`join(e,"commands")`, `.cursor/commands/**`) |
| cursor-agent reads the user-level `~/.cursor/commands/` too | inferred | Cursor docs; not in the probed strings. The probe task checks it live |
| Antigravity `agy` 1.4.2: workflows (`.agents/workflows/*.md`) are deprecated; a skill `.agents/skills/<name>/SKILL.md` IS the slash command `/<name>`; `--disable-slash-commands` exists for print mode, so `/name` expands headless too | verified | `agy.exe` strings; `agy --help` |
| Codex 0.163.0: custom prompts live in `$CODEX_HOME/prompts/<name>.md`, shown as `/prompts:<name>` | inferred | Codex docs; the binary carries `custom_prompt_view` and no path string. The live picker check in T12 closes it |
| Codex has no headless way to list its slash commands (`codex --help`, no app-server method string found) | verified (absence) | binary grep for `customPrompts`/`listCustomPrompts`: none |
| Windows Terminal is not the current terminal (`WT_SESSION` unset, mintty `TERM=xterm-256color`); PowerShell 5.1.26100 ConsoleHost; tsc 5.8.3 global | verified | env, `$PSVersionTable` |
| A watchdog hold is set right now: `.skillator/watchdog.hold` = `2026-10-20T03:29Z mem 0.5 GB free (below 1 GB)` | verified | file. The live run (T9) will show "held" until released |

# APPROACHES

**A. node ≥ 22.18 running the mod's `.ts` lib as-is (chosen).** `ops/app.ts` imports `mods/ops-board/hooks/lib/*.ts` directly; node strips types. A 14-line resolve hook (`ops/loader.mjs`, `node --import`) adds the `.ts` fallback for the lib's extensionless relative imports so no mod file changes its import style. Tests: `node --test` over `ops/tests/*.test.mts`, same loader. Guaranteed on a fresh machine? codex, gemini, pi and cursor-agent are all node programs installed through npm, so node is there (cursor-agent bundles its own node but npm is how it is normally installed; agy is a Go binary - an Antigravity-only user may lack node). Windows: node's console writer handles VT sequences and UTF-16 on Windows 10+, so PS 5.1, Windows Terminal and mintty all draw. Reuse: total - one parser set, one call table, one view model for the mod, the TUI, F56 and F57. Cost: node < 22.18 → "install node 22.18+" and nothing else.

**B. python 3 stdlib, ANSI by hand.** Available on most dev machines, not more than node on a codex/pi/gemini user's; `curses` is absent on Windows, so a hand-written ANSI loop either way. Every parser (`parseBoard`, `parseMachine`, `parseRuns`, `parseTeam`, `listView`) re-written and kept in step with the TS by hand - the divergence F56/F57 are supposed to avoid. Rejected.

**C. pure sh + ps1.** Guaranteed everywhere by definition. Two TUIs (sh and PS 5.1) with raw key handling, redraw and dialogs, each the size of `pending.sh` ×4, no shared code with the mod, and `Read-Host`-free key reading in PS 5.1 is `$Host.UI.RawUI.ReadKey` with its known mintty breakage. Fine for a one-shot report (that is `pending.sh`), wrong for an interactive board. Rejected.

**Sharing the lib (sub-decision).** Three options: (i) a published package - a build step and a version to pin, for five files; (ii) copy the lib into the TUI - divergence; (iii) use the files where they are and ship the folder. (iii) chosen: `install.sh` copies `mods/ops-board/{hooks/lib,types,ops}` to `<dest>/ops-board/` beside the skills, refreshed every run exactly like `practice/` and `references/`; the plugin cache already holds the same tree, so Claude Code needs nothing.

**`HostApi` reuse.** `host.ts` binds to Claude Code's `$` (`$.session.repo()`, `$.session.usage()`, `$.session.id()`, `$.process.run`, `$.fs`). A node shim could satisfy it, but `session.usage/id` would be fakes and `skillatorRoot` would still not know the installed flat layout. So: the pure part of `host.ts` (the call table, `argvFor`, `Call`, `NO_SCRIPTS`) moves to `lib/calls.ts`, the `$`-bound part stays, and the TUI's `ops/nodehost.ts` is the node binding - a 60-line file F56's pi extension reuses as is.

# CHOSEN

Approach A. Node ≥ 22.18 runs the mod's TypeScript directly; `ops/loader.mjs` supplies the `.ts` resolve fallback; the mod's pure code moves into `hooks/lib/*.ts` files (call table, usage-level parser, tickets model, band / health / run line builders) which the mod's `.tsx` files re-export so its 182 tests stay as they are; the TUI adds `ops/{nodehost,state,draw,app}.ts`, two launchers and `node --test` tests; `install.sh` / `install.ps1` ship `ops-board/` beside the skills and write each host's command files for F54.

# DESIGN

## D1. Layout on disk

```
mods/ops-board/
  hooks/lib/                 the shared data layer (pure .ts, only `import type` from outside lib/)
    calls.ts                 NEW  Call, TABLE, argvFor, NO_SCRIPTS, scriptsDir marker   (from host.ts)
    host.ts                  CHANGED  keeps HostApi, isWindows, skillatorRoot → skills dir, runCall, readUsage
    facts.ts                 CHANGED  + usageFromLevel(line, now)
    board.ts                 CHANGED  + isOpen (from assign.tsx)
    team.ts                  CHANGED  + ticketsOf(member, board, me) (from teamview.tsx)
    ticketsmodel.ts          NEW  View, Model, buildModel, offsetFor               (from pane.tsx)
    bandlines.ts             NEW  Seg, Counts, BandInput, NARROW_COLUMNS, countsOf, statusText, bandSegs, bandLines (from band.tsx)
    healthlines.ts           NEW  HealthView, Line, resetsText, healthLines         (from health.tsx)
    runlines.ts              NEW  RunLine, waves, wavesText, runLines, continuePrompt (from runstab.tsx)
    runs.ts, restore.ts, agents.ts   unchanged
  hooks/*.tsx                import from lib and re-export the moved names (tests unchanged)
  ops/                       NEW  the standalone app (F55)
    ops.sh  ops.ps1          launchers
    loader.mjs               node resolve hook: relative specifier without extension → try `.ts`
    app.ts                   entry: args, terminal, polls, actions, main loop
    nodehost.ts              NodeHost: env, fs, process.run, repoRoot, findSkillsDir, isWindows, runCall
    state.ts                 State + pure reducers (keys → state)
    draw.ts                  Seg → ANSI, frame(state, cols, rows) → string[]
    tests/*.test.ts          node:test
host-commands/              NEW  F54 command texts, one folder per host (see D7)
practice/scripts/probe-commands.sh   NEW  F54 probe
```

Installed by `install.sh` / `install.ps1` to `<dest>/ops-board/{hooks/lib,types,ops}` for every CLI dest (`~/.codex/skills`, `~/.cursor/skills`, `~/.gemini/config/skills`, `~/.gemini/skills`, `~/.pi/agent/skills`, `~/.pi/skills`), refreshed on every run; never to `~/.claude/skills` when the plugin is installed (the cache has it). `types/index.d.ts` ships because `lib/` imports its types (erased at run time, needed by `tsc`).

## D2. The skills dir - one root concept

Today `skillatorRoot($)` returns the folder that holds `skills/tickets-zordon/...`, and `argvFor` joins `root + '/skills/...'`. The installed layout has no `skills/` segment. From now on the root is **the directory that contains `tickets-zordon/`** - the *skills dir*:

| Where | skills dir |
|---|---|
| repo checkout / plugin cache `<R>` | `<R>/skills` |
| `install.sh` dest `<dest>` | `<dest>` |
| `$SKILLATOR_ROOT` | `$SKILLATOR_ROOT/skills` when that exists, else `$SKILLATOR_ROOT` |

`calls.ts`:
```ts
export const MARKER = 'tickets-zordon/scripts/ticket-meta.sh'    // exists under a skills dir
const PENDING = 'tickets-zordon/scripts/pending'
const META = 'tickets-zordon/scripts/ticket-meta'
const RELAY = 'relay-morpheus/hooks/relay-morpheus'
const WATCH = 'watch-cortana/hooks/usage-watch'
export function argvFor(call: Call, win: boolean, skillsDir: string, args: string[]): string[]
```
`host.ts` `skillatorRoot($)` tries, in order: `$SKILLATOR_ROOT` (both spellings), `up($.plugin.root, 2) + '/skills'`, each `installPath + '/skills'` from `installed_plugins.json`; returns the first whose `<dir>/<MARKER>` exists. `nodehost.ts` `findSkillsDir(appDir)` tries: `$SKILLATOR_ROOT` (both spellings), `up(appDir, 3) + '/skills'` (repo: `mods/ops-board/ops` → `<R>`), `up(appDir, 2)` (installed: `<dest>/ops-board/ops` → `<dest>`), then `installed_plugins.json` under `$CLAUDE_CONFIG_DIR` else `~/.claude`, each `+ '/skills'`. Same marker.

## D3. Calls - the one table (contract for the mod, the TUI, F56, F57)

```ts
export type Call = 'pending' | 'pending-kv' | 'pending-machine'
  | 'meta-assign' | 'meta-decide' | 'meta-decided' | 'meta-team-add' | 'meta-team-remove'
  | 'relay-list' | 'relay-chain-status' | 'relay-queue-add' | 'relay-hold' | 'relay-release' | 'relay-hold-status' | 'relay-decide'
  | 'usage-level'                                   // NEW: usage-watch level (sh: ['level']; ps: ['-Mode','level'])
```
argv shapes as `host.ts` has them today, plus `usage-level`: sh `['sh', '<skills>/watch-cortana/hooks/usage-watch.sh', 'level']`, ps `['powershell','-NoProfile','-ExecutionPolicy','Bypass','-File','<skills>/watch-cortana/hooks/usage-watch.ps1','-Mode','level']`. Windows (`OS=Windows_NT`) always takes the ps1 spelling, in Git Bash too - as the mod does. Timeouts: 30 s, `pending-machine` 15 s. A call never rejects: `{ code, out, err, argv }`, `code 127 / NO_SCRIPTS` when no skills dir, `-1` when the process could not start or timed out.

## D4. Usage without a host (`facts.ts`)

```ts
// `usage-watch level`: "src=<claude-code|codex|none> 5h=<pct|-> 7d=<pct|-> ctx=<pct|-> max=<pct|->".
// A window is a watch-cortana reading taken `now`; '-' or src=none is null. Never rejects.
export function usageFromLevel(line: string, now: number): Usage
```
`src=none` → `{ five: null, seven: null, spendLimitPct: null, costUsd: null, decision: null }`. Otherwise each pct → `{ pct, resetsAt: null, source: 'watch-cortana', at: now }`. The hold decision is then relay's: `relay-decide [levelLine(u, now)]` exactly as the mod does (`levelLine` emits `src=watch-cortana ...`; relay's decide reads only the numbers - F49 verified with `src=host`, and `usage-watch` itself prints `src=codex`, so the token is informational). Credit: `not available` (no host source), as the Health tab says today.

## D5. The app (`ops/`)

**Model.** `State = { tab: 'tickets'|'runs'|'health'; board: Board|null; team: Member[]; me: string|null; filter: Filter; filterField: 'app'|'who'|'mine'|null; selected: string|null; expanded: string|null; showTeam: boolean; machine: Machine|null; usage: Usage|null; watch: Watch; relay: string|null; runs: RunView[]; runsSelected: string|null; dialog: AssignDraft|null; dialogIndex: number; toast: string|null; notes: string[]; cols: number; rows: number; now: number; quit: boolean }`. `reduce(state, key): State` is pure and sync; actions that run a script are returned as an `Effect` list: `type Effect = { kind: 'run'; call: Call; args: string[]; then: (r: RunResult) => (s: State) => State } | { kind: 'poll'; what: 'board'|'slow'|'runs' } | { kind: 'quit' }`. `app.ts` executes effects; tests drive `reduce` and inspect effects without any process.

**Keys** (the mod's, plus what a terminal needs):

| Key | Tickets | Runs | Health | Dialog |
|---|---|---|---|---|
| `↑` `↓` (`k` `j`) | move row | move run | - | move person |
| `Enter` | toggle raw line | expand stages | - | confirm |
| `a` / `d` | open assign / decide dialog on the row | - | - | switch kind (implementation / decision) |
| `D` | `meta-decided` on a `[?]` row that has `[decide:]` | - | - | - |
| `f` | filter mode: `←` `→` field app/who/mine, `↑` `↓` value, `Esc`/`Enter` leave | - | - | - |
| `x` | toggle done/cancelled | - | - | - |
| `t` | team view (handle, name, emails, open tickets) / back | - | - | - |
| `n` / `delete` | (team view) add person form / remove the selected member after an in-frame `y/n` | - | - | `n` on `+ add person` opens the form too |
| printable, `backspace`, `tab` | (add-person form) edit the field, next field | - | - | - |
| `s` | - | Start run on a planned run (`relay-queue-add`, then the continue prompt shown to copy into the CLI) | - | - |
| `1` `2` `3`, `Tab`, `Shift-Tab` | tab | tab | tab | - |
| `r` | re-read now (board + slow facts) | - | - | - |
| `R` | resume: fresh `pending-machine`; not red → `relay-release` | same | same | - |
| `Esc` | close team / filter mode | - | - | cancel |
| `q`, `Ctrl-C` | quit, terminal restored | | | |

**Polls** (as the mod): TICKETS.md and team.md stat every 2 s, re-parsed when mtime or size moved; machine facts + `relay-list` + `usage-level` every 60 s; `relay-list` + `chain status` per open run every 30 s while on Runs. A failed poll keeps the last facts; the band shows their age.

**Watchdog.** `classify(machine)`; while red and `HOLD=-`, run `relay-hold [reasons]` and toast the outcome, once per outcome change - the mod's `applyMachine` rule, restated in `app.ts` (14 lines; it reads `$` in the mod and cannot move). Stale locks listed in notes, never deleted. `R` resumes as `/ops resume` does: only a fresh non-red reading releases.

**Drawing.** `draw.ts`: `frame(s: State): string[]` - exactly `s.rows` lines, each ≤ `s.cols` cells: line 1 tab bar, line 2 blank, body (tickets: filter row, groups via `buildModel`, chips, raw line; runs: `runLines`; health: `healthLines`; team), then the count line, the keys line, and the band as the last 1 or 2 lines (`bandSegs` with `narrow = cols < NARROW_COLUMNS` → the two-line fold under 110). Scrolling uses `offsetFor`. `ansi(seg: Seg): string` maps theme names: `warning` 33, `error` 31, `permission` 35, `success` 32, `suggestion` 36, `text` default, `inactive`/dim `2`, inverse `7`, bold `1`; `NO_COLOR` set or `--no-color` → no SGR at all. `--ascii`: `● ▲ ■ █ ░ … ▾` → `* ^ # = - ... v`. Width counts code points (every glyph used is single-cell). Output = `\x1b[?1049h` alt screen, `\x1b[H` + the lines joined with `\x1b[K\r\n`, cursor hidden; restored on quit and on `uncaughtException`.

**Assign dialog** (the mod's F47 shape, text only):
```
Assign F55                               ← or "Assign F55 for a decision"
  (•) implementation   ( ) decision          a / d
  › @asha     Asha Rao
    @vidul    Vidul K
  Change  [ ] pending → [ ] pending, owner @asha
  Runs    ticket-meta assign F55 @asha
  Enter confirm · Esc cancel
```
Confirm → `meta-assign` / `meta-decide [id, @handle]`; success closes the dialog and toasts `✓ F55 now pending, owned by @asha: <title>` + ticket-meta's notes + `ran: <argv>`; a non-zero exit stays open with stderr in red. Person pick starts on the ticket's own handle, else me, else the first member (`startHandle`, moved verbatim). The person list ends with a `+ add person` row (the mod's F47 shape); `Enter` on it opens the Add person form; a board with no `.skillator/team.md` shows only that row.

**Team view and Add person** (owner answer Q2, 2026-10-20 - in F55):
```
Team                                         ← `t` from the Tickets tab
  › @asha     Asha Rao      a@x, asha@y      2 open (F1, F3)
    @vidul    Vidul K       v@x              1 open
  n add · del remove · Esc back
```
`n` (or `+ add person` in the assign dialog) opens the form, a three-field line editor drawn in the body:
```
Add person
  Handle  @_
  Name
  Emails
  Writes  .skillator/team.md (committed later)
  Runs    ticket-meta team add @h "Name" a@x,b@y
  Tab next field · Enter add · Esc cancel
```
Editing: printable keys append, `backspace` deletes, `tab`/`shift-tab` move between fields, `Enter` on the last field (or anywhere once Handle and Emails are non-empty) confirms. Validation before any run, as the mod: handle `^@[a-z0-9_-]+$` after lower-casing and a `@` prefix (`handle: lower-case a-z 0-9 _ - after the @`), at least one email (`emails: at least one (a@x, b@y)`), name defaults to the handle without `@`. Confirm → `meta-team-add [@h, name, emails-comma-joined]` (the first add creates team.md: `ticket-meta team add` does); success toasts `✓ @h added to .skillator/team.md` + `ran: …`, and when the form was opened from the assign dialog the dialog returns with the new person selected; a refusal keeps the form open with stderr in red. `del` on a member in the Team view asks in-frame: `remove @vidul from .skillator/team.md? (y/n)` - ticket-meta warns on open tickets, the warning is shown in the toast; `y` → `meta-team-remove [@h]`; the 2 s team.md poll redraws the list. The TUI never writes team.md itself: ticket-meta is the only writer (F47 rule).

**Launchers.**
`ops.sh [repo-dir]`: `cd` to the repo (default `.`), find node, require ≥ 22.18 (`node -p "process.versions.node"`), else print `ops needs node 22.18 or newer (found <v>): https://nodejs.org` and exit 2; `exec node --import "$here/loader.mjs" "$here/app.ts" "$@"`.
`ops.ps1 [-Repo <dir>] [args]`: the same in PS 5.1 (`& node --import ...`; exit code passed through).
Flags of `app.ts`: `--cols N --rows N` (test override), `--once` (draw one frame to stdout, no raw mode, exit 0 - the smoke test and the screenshot helper), `--no-color`, `--ascii`, `--skills <dir>`.

## D6. install.sh / install.ps1 - shipping `ops-board/`

In `install_into` (sh) and its PS twin, after the docs refresh: `rm -rf "$_dest/ops-board"`, then `mkdir -p "$_dest/ops-board/hooks"`, `cp -R "$root/mods/ops-board/hooks/lib" "$_dest/ops-board/hooks/"`, `cp -R "$root/mods/ops-board/types" "$root/mods/ops-board/ops" "$_dest/ops-board/"`; `--dry-run` says `would refresh ... ops-board/`. The final summary prints one launch line per installed CLI: `ops:  sh <dest>/ops-board/ops/ops.sh   (Windows: powershell -File <dest>\ops-board\ops\ops.ps1)`.

**The `ops` shim** (owner answer Q3 "1+2", 2026-10-20 - the launch line AND a shim on PATH):
- `install.sh` writes `~/.local/bin/ops` (dir created, mode 755), a two-line script `#!/usr/bin/env sh` + `exec sh "<shim-src>/ops.sh" "$@"` where `<shim-src>` is the **first** installed dest's `ops-board/ops` in the targets order (claude-code's plugin cache `<installPath>/mods/ops-board/ops` when the plugin is installed, else the first dest written). Written every run (the dest can change). The summary ends with `ops   ~/.local/bin/ops -> <shim-src>/ops.sh` and, when `~/.local/bin` is not in `$PATH` (`case ":$PATH:" in *":$HOME/.local/bin:"*)`), adds `      ~/.local/bin is not on your PATH - add it, or run the launch line above`. `--dry-run` prints `would write ~/.local/bin/ops`.
- `install.ps1` writes a function into the PowerShell profile (`$PROFILE.CurrentUserAllHosts`, i.e. `~\Documents\WindowsPowerShell\profile.ps1` on 5.1; the file and its folder are created when absent) between marker comments, idempotently:
  ```powershell
  # >>> skillator ops >>>
  function ops { & powershell -NoProfile -ExecutionPolicy Bypass -File '<shim-src>\ops.ps1' @args }
  # <<< skillator ops <<<
  ```
  An existing block (both markers) is replaced in place; no markers → the block is appended after one blank line; two or more blocks (a damaged profile) → the first is replaced and the rest removed, said in the summary. The summary prints `ops   function ops in <profile> (new shells; or `. $PROFILE` now)`; `-DryRun` prints `would write function ops in <profile>`. Removal = delete the block; `install.ps1 -RemoveOpsAlias` is **not** added (Q6: removable by hand, said in the summary line).
- Both selftests cover the shim with a temp `HOME` and, on PowerShell, a temp `$PROFILE` path passed as `-Profile <path>` (a parameter that exists only so the selftest never touches the real profile; default `$PROFILE.CurrentUserAllHosts`): run twice, assert one block, the right path, the dry-run lines.

## D7. F54 - command files per host

One text, five shapes. The body every file carries (the **pending** text):

> Load the `tickets-zordon` skill (`<skills>/tickets-zordon/SKILL.md`). Then run `sh <skills>/tickets-zordon/scripts/pending.sh` (on Windows `powershell -NoProfile -ExecutionPolicy Bypass -File <skills>\tickets-zordon\scripts\pending.ps1`) from the repo root and paste what it prints, unchanged. It reads; it never edits the board.

and the **list-tickets** text:

> Load the `tickets-zordon` skill (`<skills>/tickets-zordon/SKILL.md`) and print its "Showing the board" view for this repo's TICKETS.md with these arguments: `<ARGS>` (`status`, `all`, `app:<app>`, `@person`, a prefix like `A`, or an ID). By type unless `status` is given; one count line after the list; nothing else.

`<skills>` is the host's dest, written absolute at install time; `<ARGS>` is the host's argument token. Where each host puts it (install writes only where the host is installed - the same marker test as the skills):

| Host | File (user level) | Shape | Args token | Tag |
|---|---|---|---|---|
| codex | `$CODEX_HOME/prompts/pending.md`, `list-tickets.md` | plain markdown, body only | `$ARGUMENTS` | inferred (docs) - T12 live check |
| gemini CLI | `~/.gemini/commands/pending.toml`, `list-tickets.toml` | `description = "..."` + `prompt = """..."""`; pending's prompt starts with the shell injection `!{sh <skills>/tickets-zordon/scripts/pending.sh}` (ps1 form from install.ps1) then "paste the output above unchanged" | `{{args}}` | verified (dir, `!{`, `{{args}}`) |
| cursor | `~/.cursor/commands/pending.md`, `list-tickets.md` | `---\ndescription: ...\n---` + body | none (Cursor appends what the user typed after the command; the body says "arguments follow this line") | project dir verified; user dir inferred - T12 |
| pi | `~/.pi/agent/prompts/pending.md`, `list-tickets.md` | `---\ndescription: ...\nargument-hint: ...\n---` + body | `$ARGUMENTS` | verified |
| antigravity | `~/.gemini/config/skills/pending/SKILL.md` and `.../list-tickets/SKILL.md` (and `~/.gemini/skills/` - the two antigravity dests) | `---\nname: pending\ndescription: ...\n---` + body; a skill is `/pending` in agy | `$ARGUMENTS` is not substituted by agy - the body says "the words after the command are the arguments" | verified (skills are slash commands) |
| claude-code | none written (the ops-board mod's own `/pending`, `/list-tickets`) | | | verified |
| prime-agent | none - no command mechanism; `PLATFORMS.md` gets the row, the skill route stays | | | verified (no loader) |

These skill-commands are written only to the antigravity dests, carry no `.skillator-owned` marker and are not in `.skillator-installed` (so `prune_dest` never touches them and `--force` is not needed to refresh them: they are rewritten every run). Source texts live in `host-commands/<host>/<name>.<ext>` with `{{SKILLS}}` replaced at install; the install scripts do no other templating.

`install.sh --selftest` / `install.ps1 -SelfTest`: `HOME`, `CODEX_HOME` pointed at a temp dir holding the five marker dirs; run install; assert every path in the table exists with the dest path substituted; assert `ops-board/ops/app.ts` and `ops-board/hooks/lib/board.ts` exist in each dest; run again and assert the command files are rewritten (mtime moves) and skills are not; print `ok`.

`practice/scripts/probe-commands.sh` (and the same from PowerShell): for each installed CLI prints `host | path | present | version` and, where a headless slash expansion exists, the one-line command the owner runs for the live picker check (`agy -p "/pending" --mode plan --sandbox`, `pi -p "/pending" --no-tools`, `gemini -p "/pending" --approval-mode plan`, `agent -p "/pending" --mode ask`; codex: type `/` in the TUI). The baseline `practice/baselines/green-commands-f54.txt` records the probe output and the owner's picker screenshots per host.

## D8. Edge cases

- No skills dir found → every tab shows `skillator scripts not found - set SKILLATOR_ROOT` (NO_SCRIPTS) and the band shows `?` figures; `q` still works.
- Not in a git repo → `pending.sh` uses the cwd, as does the TUI (`repoRoot()` = `git rev-parse --path-format=absolute --git-common-dir` → its parent; else `--show-toplevel`; else cwd) - the main checkout, from any worktree, matching `find_main`.
- TICKETS.md absent / over 4 MiB → the Tickets tab says so (`failed()` texts of `register.tsx`, repeated in `app.ts`).
- Terminal under 80 columns → the frame still draws; lines cut with `…`; the band folds (narrow); no wrap ever (every line ≤ cols).
- Terminal resize (`SIGWINCH` / `stdout.on('resize')`) → redraw.
- Script timeout → the toast says `ticket-meta did not finish in 30 s`, the dialog stays open.
- Two watchers (the mod in Claude Code and `ops` beside it) → the hold file is idempotent; both show the same `HOLD=`.
- `NO_COLOR` honoured; `--ascii` for a console font without the glyphs (PS 5.1 raster font).
- Windows: every script call is the ps1 spelling, even from Git Bash (OS=Windows_NT), as the mod does; powershell start-up ~1 s per call is why polls are 60 s.

## D9. Out of scope

Agents / Workflows tabs (host-only data); a Pi extension or Antigravity webview (F56, F57 - they take `lib/` + `nodehost.ts`); a project-level command file (user level only; Q4); mouse; prime-agent commands; an uninstall flag for the shim (Q6); editing a member in place (remove + add).

# CONSTRAINTS

- The skills dir is the directory that contains `tickets-zordon/`: `<repo>/skills`, `<plugin cache>/skills`, or an `install.sh` dest. `calls.ts` `MARKER = 'tickets-zordon/scripts/ticket-meta.sh'`; script paths in the table carry no `skills/` segment: `tickets-zordon/scripts/pending`, `tickets-zordon/scripts/ticket-meta`, `relay-morpheus/hooks/relay-morpheus`, `watch-cortana/hooks/usage-watch`.
- `argvFor(call, win, skillsDir, args)`: win → `['powershell','-NoProfile','-ExecutionPolicy','Bypass','-File', <skillsDir>/<script>.ps1, ...ps]`, else `['sh', <skillsDir>/<script>.sh, ...sh]`. The ps words for every existing call stay byte-identical to today's `host.ts` TABLE. `usage-level`: sh `['level']`, ps `['-Mode','level']`.
- `NO_SCRIPTS = 'skillator scripts not found - set SKILLATOR_ROOT'`; a call result is `{ code, out, err, argv }`, code 127 + NO_SCRIPTS when no skills dir, -1 when it could not run; timeouts 30 s, `pending-machine` 15 s.
- `usageFromLevel(line, now)` returns a `Usage` whose windows have `source: 'watch-cortana'`, `resetsAt: null`, `at: now`; `src=none` or a `-` figure is `null`. The hold decision is always `relay-decide [levelLine(u, now)]`, never computed locally.
- Every file under `mods/ops-board/hooks/lib/` and `mods/ops-board/ops/` imports from outside itself with `import type` only (`claude-code`, `../../types`); runtime imports are relative, extensionless, and resolvable by `ops/loader.mjs` (`'./facts'` → `./facts.ts`). No JSX in `lib/` or `ops/`.
- Moved names keep their exact spelling and signature and are re-exported from the `.tsx` they came from: `buildModel`, `offsetFor`, `View`, `Model` (pane.tsx); `countsOf`, `statusText`, `bandSegs`, `bandLines`, `Seg`, `Counts`, `BandInput`, `NARROW_COLUMNS` (band.tsx); `healthLines`, `resetsText`, `HealthView` (health.tsx); `waves`, `continuePrompt` (runstab.tsx), plus `runLines` newly exported; `isOpen` (assign.tsx → board.ts); `ticketsOf` (teamview.tsx → team.ts). `claude plugin test mods/ops-board` stays 182/182 (plus the tests added here), `tsc -p mods/ops-board` clean, `claude plugin validate mods/ops-board` ok after every task that touches the mod.
- The TUI's state changes go through `reduce(state, key): { state, effects }` (pure); every script run is an `Effect` of kind `run` with a `Call`; `app.ts` is the only file that touches the terminal or spawns.
- `frame(state)` returns exactly `state.rows` strings, each ≤ `state.cols` code points; the band is the last line(s), narrow when `cols < NARROW_COLUMNS` (110); the tab bar is line 1.
- Colour names → SGR: warning 33, error 31, permission 35, success 32, suggestion 36, text none, inactive/dim 2, inverse 7, bold 1; `NO_COLOR` or `--no-color` → no escape sequences in the frame; `--ascii` → `●▲■█░…▾` become `*^#=-...v`.
- Launchers: `mods/ops-board/ops/ops.sh` and `ops.ps1`; node < 22.18 or absent → the message `ops needs node 22.18 or newer` + exit 2; they `exec node --import <ops>/loader.mjs <ops>/app.ts`.
- `install.sh` / `install.ps1` copy `mods/ops-board/hooks/lib`, `mods/ops-board/types`, `mods/ops-board/ops` to `<dest>/ops-board/` (same relative shape) on every run, for every dest but a plugin-installed claude-code; `--dry-run` prints `would refresh ... ops-board/`.
- F54 file paths and shapes are the D7 table; the body texts are `host-commands/<host>/pending.*` and `list-tickets.*` with `{{SKILLS}}` the only placeholder; the sh and ps1 installers write byte-identical files except the shell line in gemini's `pending.toml` (`sh .../pending.sh` vs `powershell ... pending.ps1`) and path separators.
- Antigravity skill-commands are written only to the two antigravity dests, without `.skillator-owned`, not in `.skillator-installed`, rewritten every run.
- Team writes: only `meta-team-add [@h, name, emails]` (emails comma-joined, no spaces) and `meta-team-remove [@h]`; the TUI never opens `.skillator/team.md` for writing. Handle validation `^@[a-z0-9_-]+$` after lower-casing, message `handle: lower-case a-z 0-9 _ - after the @`; empty emails message `emails: at least one (a@x, b@y)`; remove always asks `remove @h from .skillator/team.md? (y/n)` in-frame first.
- The `ops` shim: sh `~/.local/bin/ops` = `#!/usr/bin/env sh\nexec sh "<shim-src>/ops.sh" "$@"\n`; PowerShell profile block between `# >>> skillator ops >>>` and `# <<< skillator ops <<<` holding exactly one `function ops { & powershell -NoProfile -ExecutionPolicy Bypass -File '<shim-src>\ops.ps1' @args }`; `<shim-src>` = the first installed `ops-board/ops` (plugin cache `mods/ops-board/ops` first); written every run, never duplicated; `install.ps1 -Profile <path>` overrides the profile path (selftest only).
- Selftests print exactly `ok` on success and `FAIL: <what>` + exit 1 otherwise, like `pending.sh --selftest`.
- Baselines: `practice/baselines/green-ops-f55.txt`, `practice/baselines/green-commands-f54.txt`.

# TASKS

Order: F55 T1-T9 (T7a between T7 and T8), then F54 T10-T12. Fan-out rule: T1 → T3 (both edit `calls.ts`, `host.test.ts`); T2 is independent of T1/T3 (different files) and may run in parallel with T1; T4-T6 after T1-T3 (they import the moved names), independent of each other; T7 after T4-T6; T7a after T7 (it edits `state.ts`, `draw.ts`, `app.ts` and their tests - never beside T5/T6/T7); T8 after T7a; T9 after T8 (owner present); T10 after T8 and T11 after T10 (T8, T10, T11 all edit `install.sh` / `install.ps1`); T12 after T11. Each task ends `claude plugin test mods/ops-board && tsc -p mods/ops-board --noEmit && claude plugin validate mods/ops-board` when it touched the mod.

### Task 1: `lib/calls.ts` and the skills-dir root — build=build
SATISFIES: R6, R11

**Files:**
- Create: `mods/ops-board/hooks/lib/calls.ts`
- Modify: `mods/ops-board/hooks/lib/host.ts` (whole file: the table and `argvFor` leave; `skillatorRoot` returns the skills dir)
- Modify: `mods/ops-board/tests/host.test.ts` (paths in expectations; new cases)
- Test: `mods/ops-board/tests/host.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `calls.ts`: `export type Call = ...` (D3, without `usage-level` - T3 adds it); `export const MARKER = 'tickets-zordon/scripts/ticket-meta.sh'`; `export const NO_SCRIPTS`; `export const norm = (p: string) => string`; `export const up = (p: string, n: number) => string`; `export function argvFor(call: Call, win: boolean, skillsDir: string, args: string[]): string[]`. `host.ts`: `export async function skillatorRoot($: HostApi): Promise<string | null>` now returns the skills dir; `runCall` unchanged in signature; `host.ts` re-exports `Call`, `argvFor`, `NO_SCRIPTS` from `./calls` so `assign.tsx`, `register.tsx`, `runstab.tsx` need no edit.

- [ ] Step 1: write the failing tests - in `host.test.ts` replace the three path consts and add:
```ts
const TM = 'tickets-zordon/scripts/ticket-meta'
const PE = 'tickets-zordon/scripts/pending'
const RM = 'relay-morpheus/hooks/relay-morpheus'
const META = '/tickets-zordon/scripts/ticket-meta.sh'

test('argvFor joins the skills dir, no skills/ segment', () => {
  expect(argvFor('pending', false, '/s/skills', [])).toEqual(['sh', '/s/skills/' + PE + '.sh'])
  expect(argvFor('meta-assign', true, 'C:/u/.codex/skills', ['F1', '@a'])).toEqual([...PS, 'C:/u/.codex/skills/' + TM + '.ps1', 'assign', 'F1', '@a'])
})
test('skillatorRoot: plugin tree -> its skills dir', async () => {
  const [$] = fake({ root: '/s/mods/ops-board', exists: ['/s/skills' + META] })
  expect(await skillatorRoot($)).toBe('/s/skills')
})
test('skillatorRoot: SKILLATOR_ROOT as a repo or as a flat install dest', async () => {
  const [a] = fake({ env: { SKILLATOR_ROOT: '/r' }, exists: ['/r/skills' + META] })
  expect(await skillatorRoot(a)).toBe('/r/skills')
  const [b] = fake({ env: { SKILLATOR_ROOT: '/u/.codex/skills' }, exists: ['/u/.codex/skills' + META] })
  expect(await skillatorRoot(b)).toBe('/u/.codex/skills')
})
test('skillatorRoot: installPath + /skills', async () => {
  const [$] = fake({ env: { HOME: '/h' }, exists: ['/c/skills' + META],
    files: { '/h/.claude/plugins/installed_plugins.json': JSON.stringify({ plugins: { 'skillator@skillator': [{ installPath: 'C:\\c' }] } }) } })
  expect(await skillatorRoot($)).toBe('C:/c/skills')
})
```
  and update every existing expectation that spelled `/skills/...` after the root (the `argvFor: both spellings` table, `runCall` argv checks) to the new shape.
- [ ] Step 2: `claude plugin test mods/ops-board` → the host tests fail (`/s/skills/tickets-zordon/...` expected, `/s/skills/skills/...` or `/s/mods/...` received; `calls` module missing).
- [ ] Step 3: create `calls.ts` with `Call`, `MARKER`, `NO_SCRIPTS`, `norm`, `up`, the TABLE (same `sh`/`ps` lambdas as today, paths without `skills/`), `argvFor(call, win, skillsDir, args)` = `win ? ['powershell',...,'-File', norm(skillsDir)+'/'+t.script+'.ps1', ...t.ps(args)] : ['sh', norm(skillsDir)+'/'+t.script+'.sh', ...t.sh(args)]`. In `host.ts`: `import { argvFor, MARKER, NO_SCRIPTS, norm, up } from './calls'`, `export { argvFor, NO_SCRIPTS } from './calls'`, `export type { Call } from './calls'`; `has($, dir)` checks `dir + '/' + MARKER`; `skillatorRoot`: `const env = await $.env.get('SKILLATOR_ROOT'); const tries = env ? [norm(env) + '/skills', norm(env)] : []; tries.push(up($.plugin.root, 2) + '/skills'); for (t of tries) if (await has($, t)) return t;` then the installed_plugins loop with `norm(p) + '/skills'`.
- [ ] Step 4: `claude plugin test mods/ops-board` → all pass (count = 182 + 4 new); `tsc -p mods/ops-board --noEmit`; `claude plugin validate mods/ops-board`.
- [ ] Step 5: `git add mods/ops-board/hooks/lib/calls.ts mods/ops-board/hooks/lib/host.ts mods/ops-board/tests/host.test.ts && git commit -m "F55 T1: lib/calls.ts, skills-dir root (no skills/ segment in the call table)"`

### Task 2: move the view models into `lib/` — build=build
SATISFIES: R11, R1, R2, R3, R5

**Files:**
- Create: `mods/ops-board/hooks/lib/ticketsmodel.ts`, `mods/ops-board/hooks/lib/bandlines.ts`, `mods/ops-board/hooks/lib/healthlines.ts`, `mods/ops-board/hooks/lib/runlines.ts`
- Modify: `mods/ops-board/hooks/pane.tsx` (remove `buildModel`, `offsetFor`, `View`, `Model`; import + re-export), `mods/ops-board/hooks/band.tsx` (remove lines 18-125: types, `countsOf`, `statusText`, helpers, `bandSegs`, `bandLines`; import + re-export), `mods/ops-board/hooks/health.tsx` (remove `HealthView`, `Line`/`Seg`, `when`, `resetsText`, `windowLines`, `relayLines`, `factLine`, `machineLines`, `healthLines`; keep `readHealth`, `HealthTab`), `mods/ops-board/hooks/runstab.tsx` (remove `Seg`, `STATE_WORD`, `cut`, `ticketsOf`, `afterOf`, `dot`, `ticketSegs`, `width`, `waves`, `wavesText`, `workOf`, `runLines`, `continuePrompt`; import + re-export), `mods/ops-board/hooks/assign.tsx` (`isOpen` → `lib/board.ts`, re-export), `mods/ops-board/hooks/teamview.tsx` (`ticketsOf` → `lib/team.ts`, re-export), `mods/ops-board/hooks/lib/board.ts` (+ `isOpen`), `mods/ops-board/hooks/lib/team.ts` (+ `ticketsOf`)
- Test: `mods/ops-board/tests/model.test.ts` (new: the moved functions imported from their `lib/` homes)

**Interfaces:**
- Consumes: `paint` from `../paint` (a `.ts`, stays), `STATE_COLOR`, `GROUPS`, `visible` from `./board`, `facts.ts` helpers.
- Produces (exact, from `lib/`): `ticketsmodel.ts`: `export type View`, `export type Model`, `export function buildModel(v: View): Model`, `export function offsetFor(m: Model, id: string, top: number, bodyRows: number): number | null`. `bandlines.ts`: `export const NARROW_COLUMNS = 110`, `export type Counts`, `export type BandInput`, `export type Seg = { text: string; color?: Color; dim?: boolean; inverse?: boolean; bold?: boolean; drop?: 1 | 2 }` (one `Seg` for band, health and runs - `bold` added so health's segments fit), `countsOf`, `statusText`, `bandSegs(v: BandInput): Seg[][]`, `bandLines`. `healthlines.ts`: `export type HealthView`, `export type Line = { key: string; segs: Seg[] }`, `resetsText`, `healthLines(v: HealthView): Line[]`. `runlines.ts`: `export type RunLine = Line`, `waves`, `wavesText`, `runLines(run: RunView, board: Board | null): Line[]`, `continuePrompt`. `board.ts`: `export const isOpen = (t: Ticket) => boolean`. `team.ts`: `export function ticketsOf(m: Member, board: Board | null, me: string | null): string`.

- [ ] Step 1: write the failing test `tests/model.test.ts`:
```ts
import { test, expect } from 'claude-code/testing'
import { buildModel, offsetFor } from '../hooks/lib/ticketsmodel'
import { bandLines, countsOf, NARROW_COLUMNS } from '../hooks/lib/bandlines'
import { healthLines } from '../hooks/lib/healthlines'
import { runLines, waves } from '../hooks/lib/runlines'
import { isOpen, parseBoard } from '../hooks/lib/board'
import { ticketsOf } from '../hooks/lib/team'
import { BOARD } from './fixtures'

const board = parseBoard(BOARD, 'T', 0, 0)
test('tickets model lives in lib', () => {
  const m = buildModel({ board, team: [], me: null, filter: { app: null, who: null, mine: false, showDone: false }, filterOpen: false, selected: null, expanded: null, cols: 80 })
  expect(m.rows.map(t => t.id)).toEqual(['B2', 'B3', 'F3', 'B2b', 'F1', 'F2', 'A1', 'A2'])
  expect(offsetFor(m, 'A2', 0, 5)).not.toBeNull()
})
test('band, health, runs line builders live in lib', () => {
  expect(NARROW_COLUMNS).toBe(110)
  expect(countsOf(board)).toEqual({ open: 7, progress: 1, blocked: 1, decision: 1 })
  const band = bandLines({ watch: { level: 'green', reasons: [] }, machine: null, usage: null, relay: null, counts: countsOf(board), narrow: true, cols: 80, now: 0 })
  expect(band).toHaveLength(2)
  expect(healthLines({ usage: null, machine: null, relay: null, now: 0 }).map(l => l.key)).toContain('h:machine')
  expect(waves([{ n: 1, code: 'a', ticket: 'F1', title: 'x', after: '-', files: '-', state: '' }])).toEqual([[1]])
  expect(runLines({ id: 'RUN-0001', title: 't', done: 0, total: 1, owner: null, stages: [], planned: false, decisions: [] }, board)[0]!.key).toBe('run:RUN-0001')
  expect(isOpen(board.tickets[0]!)).toBe(true)
  expect(ticketsOf({ handle: '@asha', emails: [] }, board, null)).toContain('F3')
})
```
- [ ] Step 2: `claude plugin test mods/ops-board` → fails: modules `../hooks/lib/ticketsmodel` (etc.) not found.
- [ ] Step 3: move the code verbatim (cut from the `.tsx`, paste into the `.ts`; the only edits: the `Seg` type unified with `bold?`, `import type { Color } from 'claude-code'` at the top of each new file, `import { paint } from '../paint'`). In each `.tsx`: `import { buildModel, offsetFor } from './lib/ticketsmodel'` + `export { buildModel, offsetFor } from './lib/ticketsmodel'` + `export type { View, Model } from './lib/ticketsmodel'`, and the same pattern in band/health/runstab/assign/teamview. `runstab.tsx` `RunsTab` keeps calling `runLines` (now imported). No atom moves - the moved functions read none.
- [ ] Step 4: `claude plugin test mods/ops-board` → 182 + T1's 4 + 2 pass; `tsc -p mods/ops-board --noEmit`; `claude plugin validate mods/ops-board`. Also `grep -L "import type" mods/ops-board/hooks/lib/*.ts` lists only files with no outside import, and `grep -n "from 'claude-code'" mods/ops-board/hooks/lib/*.ts | grep -v "import type"` prints nothing.
- [ ] Step 5: `git add mods/ops-board && git commit -m "F55 T2: tickets/band/health/run line models move to hooks/lib (pure .ts), the .tsx re-export"`

### Task 3: `usage-level` call and `usageFromLevel` — build=cheap
SATISFIES: R3, R5, R6

**Files:**
- Modify: `mods/ops-board/hooks/lib/calls.ts` (+ `'usage-level'` in `Call` and TABLE; `const WATCH = 'watch-cortana/hooks/usage-watch'`)
- Modify: `mods/ops-board/hooks/lib/facts.ts` (+ `usageFromLevel`)
- Test: `mods/ops-board/tests/host.test.ts` (the `both spellings of every call` table gains the row), `mods/ops-board/tests/facts.test.ts`

**Interfaces:**
- Consumes: `Usage`, `Window` types; `mkWindow` in facts.ts.
- Produces: `Call` includes `'usage-level'`; `export function usageFromLevel(line: string, now: number): Usage`.

- [ ] Step 1: failing tests:
```ts
// facts.test.ts
test('usageFromLevel: codex line, dashes, none', () => {
  const u = usageFromLevel('src=codex 5h=41 7d=55.5 ctx=7 max=-', 1000)
  expect(u.five).toEqual({ pct: 41, resetsAt: null, source: 'watch-cortana', at: 1000 })
  expect(u.seven?.pct).toBe(55.5)
  expect(usageFromLevel('src=claude-code 5h=- 7d=12 ctx=- max=-', 0).five).toBeNull()
  expect(usageFromLevel('src=none 5h=- 7d=- ctx=- max=-', 0)).toEqual({ five: null, seven: null, spendLimitPct: null, costUsd: null, decision: null })
  expect(usageFromLevel('garbage\r\n', 0).seven).toBeNull()
  expect(levelLine(usageFromLevel('src=codex 5h=41 7d=55 ctx=- max=-', 0), 0)).toBe('src=watch-cortana 5h=41 7d=55 ctx=- max=-')
})
// host.test.ts, in the spellings table:
['usage-level', [], ['level'], ['-Mode', 'level'], 'watch-cortana/hooks/usage-watch'],
```
- [ ] Step 2: `claude plugin test mods/ops-board` → fails (`usageFromLevel` not exported; TS error on `'usage-level'`).
- [ ] Step 3: implement:
```ts
export function usageFromLevel(line: string, now: number): Usage {
  const kv = new Map<string, string>()
  for (const w of line.replace(/\r/g, '').trim().split(/\s+/)) { const i = w.indexOf('='); if (i > 0) kv.set(w.slice(0, i), w.slice(i + 1)) }
  const pct = (k: string) => { const v = kv.get(k); return v !== undefined && /^\d+(\.\d+)?$/.test(v) ? Number(v) : null }
  const w = (p: number | null) => (p === null || kv.get('src') === 'none' ? null : mkWindow(p, null, 'watch-cortana', now))
  return { five: w(pct('5h')), seven: w(pct('7d')), spendLimitPct: null, costUsd: null, decision: null }
}
```
  and the TABLE row `'usage-level': { script: WATCH, sh: () => ['level'], ps: () => ['-Mode', 'level'] }`.
- [ ] Step 4: `claude plugin test mods/ops-board` → pass; tsc; validate.
- [ ] Step 5: `git add mods/ops-board && git commit -m "F55 T3: usage-level call (usage-watch level) and usageFromLevel"`

### Task 4: `ops/loader.mjs` and `ops/nodehost.ts` — build=build
SATISFIES: R6, R8, R11

**Files:**
- Create: `mods/ops-board/ops/loader.mjs`, `mods/ops-board/ops/nodehost.ts`, `mods/ops-board/ops/tests/nodehost.test.mts`, `mods/ops-board/ops/tests/fixtures.ts` (a temp skills dir with fake `ticket-meta.sh`/`.ps1`, `pending.sh`/`.ps1` that echo their argv)
- Test: `mods/ops-board/ops/tests/nodehost.test.mts`

**Interfaces:**
- Consumes: `argvFor`, `MARKER`, `NO_SCRIPTS`, `norm`, `up` from `../hooks/lib/calls`; `Call`.
- Produces:
```ts
export type RunResult = { code: number; out: string; err: string; argv: string[] }
export type Host = {
  win: boolean
  skillsDir: string | null
  repoRoot: string                                   // main checkout (git-common-dir's parent), else toplevel, else cwd
  run(call: Call, args: string[]): Promise<RunResult> // never rejects; 30 s / 15 s budgets; cwd = repoRoot
  stat(path: string): Promise<{ mtimeMs: number; size: number } | null>
  read(path: string): Promise<string>
  gitEmail(): Promise<string | null>
}
export function findSkillsDir(appDir: string, env: NodeJS.ProcessEnv, exists: (p: string) => boolean, readJson: (p: string) => unknown): string | null
export async function makeHost(opts: { appDir: string; cwd: string; skills?: string }): Promise<Host>
```
- `loader.mjs`:
```js
// node --import ./loader.mjs: a relative import with no extension resolves to its .ts twin
// (the mod's lib files import './facts' and the plugin engine resolves that; node does not).
import { register } from 'node:module'
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx) }
  catch (e) {
    if (e?.code === 'ERR_MODULE_NOT_FOUND' && /^\\.\\.?\\//.test(spec) && !/\\.[cm]?[jt]sx?$/.test(spec)) return next(spec + '.ts', ctx)
    throw e
  }
}`))
```

- [ ] Step 1: failing test `ops/tests/nodehost.test.mts` (`node:test`, `node:assert/strict`):
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { findSkillsDir, makeHost } from '../nodehost'
import { parseBoard } from '../../hooks/lib/board'      // proves the loader resolves the lib's own imports

const skills = (dir: string) => { mkdirSync(join(dir, 'tickets-zordon/scripts'), { recursive: true }); writeFileSync(join(dir, 'tickets-zordon/scripts/ticket-meta.sh'), ''); return dir.replace(/\\/g, '/') }
test('findSkillsDir: repo tree, installed dest, SKILLATOR_ROOT, installPath', () => {
  const t = mkdtempSync(join(tmpdir(), 'ops-'))
  const repo = skills(join(t, 'r/skills'))
  assert.equal(findSkillsDir(join(t, 'r/mods/ops-board/ops'), {}, existsSync, () => null), repo)
  const dest = skills(join(t, 'd'))
  assert.equal(findSkillsDir(join(t, 'd/ops-board/ops'), {}, existsSync, () => null), dest)
  assert.equal(findSkillsDir('/nowhere', { SKILLATOR_ROOT: join(t, 'r') }, existsSync, () => null), repo)
  assert.equal(findSkillsDir('/nowhere', { HOME: t }, existsSync, () => ({ plugins: { 'skillator@skillator': [{ installPath: join(t, 'r') }] } })), repo)
  assert.equal(findSkillsDir('/nowhere', {}, existsSync, () => null), null)
})
test('run: argv from the call table, cwd = repo root, never rejects', async () => {
  const t = mkdtempSync(join(tmpdir(), 'ops-'))
  const dir = skills(join(t, 's'))
  writeFileSync(join(dir, 'tickets-zordon/scripts/pending.sh'), 'printf "%s\\n" "$@"; pwd')
  writeFileSync(join(dir, 'tickets-zordon/scripts/pending.ps1'), 'param([string[]]$a) $args | ForEach-Object { $_ }; (Get-Location).Path')
  const h = await makeHost({ appDir: '/x', cwd: t, skills: dir })
  const r = await h.run('pending-kv', [])
  assert.equal(r.code, 0)
  assert.match(r.out, /--kv/)
  const none = await makeHost({ appDir: '/x', cwd: t })
  assert.equal((await none.run('pending', [])).code, 127)
  assert.equal(parseBoard('- [ ] F1 — a\n', 'T', 0, 0).tickets.length, 1)
})
```
- [ ] Step 2: `cd mods/ops-board && node --import ./ops/loader.mjs --test ops/tests/nodehost.test.mts` → fails (`nodehost` missing). If `--test` does not pass `--import` to its workers (shows as `ERR_MODULE_NOT_FOUND './facts'`), run the file directly: `node --import ./ops/loader.mjs ops/tests/nodehost.test.mts` - that form is then the test command for every `ops/tests` task and VERIFICATION.
- [ ] Step 3: implement `loader.mjs` (above) and `nodehost.ts`: `findSkillsDir` = the D2 candidate list with `existsSync(join(dir, MARKER))`; `makeHost`: `win = process.env.OS === 'Windows_NT'`; `repoRoot` via `child_process.execFile('git', ['rev-parse','--path-format=absolute','--git-common-dir'], { cwd })` → `norm(out)` minus trailing `/.git`, else `--show-toplevel`, else `cwd`; `run` builds `argvFor(call, win, skillsDir, args)` and `spawn(argv[0], argv.slice(1), { cwd: repoRoot, windowsHide: true })` with a `setTimeout` kill at the budget, resolving `{ code: -1, err: 'timed out after 30 s' }` or `{ code: 127, err: NO_SCRIPTS, argv: [] }` when `skillsDir` is null; `gitEmail` = `git config user.email`.
- [ ] Step 4: the test command → pass.
- [ ] Step 5: `git add mods/ops-board/ops && git commit -m "F55 T4: ops/loader.mjs and ops/nodehost.ts - the node host for the shared lib"`

### Task 5: `ops/state.ts` — the reducer and effects — build=build
SATISFIES: R1, R4, R5

**Files:**
- Create: `mods/ops-board/ops/state.ts`, `mods/ops-board/ops/tests/state.test.mts`
- Test: `mods/ops-board/ops/tests/state.test.mts`

**Interfaces:**
- Consumes: `buildModel`, `View` (`../hooks/lib/ticketsmodel`), `visible`, `isOpen`, `STATE_NAME` (`board`), `sameHandle` (`team`), `classify`, `parseMachine`, `usageFromLevel`, `levelLine`, `HOLD_UNKNOWN` (`facts`), `parseRuns` (`runs`), `continuePrompt` (`runlines`), `Call`, `RunResult` (T4).
- Produces:
```ts
export type Key = { name: string; shift?: boolean; ctrl?: boolean }     // node readline keypress names: 'up','down','return','escape','tab','a','d','D',...
export type Effect = { kind: 'run'; call: Call; args: string[]; then: (r: RunResult) => (s: State) => State }
  | { kind: 'poll'; what: 'board' | 'slow' | 'runs' } | { kind: 'quit' }
export type State = { ...D5 }
export const initial = (cols: number, rows: number, now: number): State
export function reduce(s: State, k: Key): { state: State; effects: Effect[] }
export function viewOf(s: State): View                         // for buildModel
export function onBoard(s: State, board: Board, team: Member[], me: string | null): State
export function onMachine(s: State, kv: string, now: number): { state: State; effects: Effect[] }   // classify + the red→hold rule
export function onUsage(s: State, levelOut: string, now: number): { state: State; effects: Effect[] } // usageFromLevel + relay-decide when the line changed
export function onRuns(s: State, list: string, chains: Record<string, string>): State
export function startHandle(t: Ticket, kind: 'owner' | 'decide', team: Member[], me: string | null): string | null   // moved verbatim from assign.tsx (assign.tsx keeps its own copy: it is $-bound there)
export function dialogLines(s: State): string[]               // the D5 dialog text, for draw.ts and the tests
```

- [ ] Step 1: failing tests (excerpt - the file covers every key row of D5):
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initial, reduce, onBoard, onMachine, onUsage, dialogLines } from '../state'
import { parseBoard } from '../../hooks/lib/board'
const BOARD = '- [ ] F1 — Dark mode [owner: @asha]\n- [?] F3 — Pick chart [decide: @asha]\n- [x] F4 — Done one\n'
const team = [{ handle: '@asha', emails: ['a@x'], name: 'Asha' }, { handle: '@vidul', emails: ['v@x'] }]
const s0 = onBoard(initial(80, 24, 0), parseBoard(BOARD, 'T', 1, 1), team, '@vidul')
const key = (name: string, extra = {}) => ({ name, ...extra })

test('down/up move the selection over visible rows; x shows done', () => {
  let { state } = reduce(s0, key('down'))
  assert.equal(state.selected, 'F1')
  ;({ state } = reduce(state, key('down')))
  assert.equal(state.selected, 'F3')
  assert.equal(reduce(state, key('x')).state.filter.showDone, true)
})
test('a opens the assign dialog on the selected row, starts on the owner, Enter runs meta-assign', () => {
  const { state } = reduce(s0, key('a'))
  assert.equal(state.dialog?.id, 'F1'); assert.equal(state.dialog?.handle, '@asha')
  assert.deepEqual(dialogLines(state).slice(0, 2), ['Assign F1', '  (•) implementation   ( ) decision          a / d'])
  const r = reduce(reduce(state, key('down')).state, key('return'))
  assert.equal(r.effects[0]?.kind, 'run')
  assert.deepEqual([r.effects[0]!.call, r.effects[0]!.args], ['meta-assign', ['F1', '@vidul']])
  const after = r.effects[0]!.then({ code: 0, out: '- [ ] F1 — Dark mode [owner: @vidul]\n', err: '', argv: ['sh', 'x'] })(r.state)
  assert.equal(after.dialog, null); assert.match(after.toast ?? '', /✓ F1 now pending, owned by @vidul/)
  const refused = r.effects[0]!.then({ code: 1, out: '', err: 'not on the team', argv: [] })(r.state)
  assert.equal(refused.dialog?.result, 'not on the team')
})
test('d on a row, then d in the dialog keeps decision; D on a [?] row runs decided', () => {
  const { state } = reduce(reduce(s0, key('down')).state, key('down'))
  const r = reduce(reduce(state, key('d')).state, key('return'))
  assert.deepEqual([r.effects[0]!.call, r.effects[0]!.args], ['meta-decide', ['F3', '@asha']])
  const dd = reduce(state, key('D'))
  assert.deepEqual([dd.effects[0]!.call, dd.effects[0]!.args], ['meta-decided', ['F3']])
})
test('red machine facts hold through relay once; R resumes only on a fresh green reading', () => {
  const red = onMachine(s0, 'DRIVE=C:\nDISK_FREE=500000000\nDISK_TOTAL=1\nMEM_FREE=9000000000\nHOLD=-\n', 0)
  assert.equal(red.state.watch.level, 'red')
  assert.equal(red.effects[0]?.call, 'relay-hold')
  const again = onMachine(red.state, 'DRIVE=C:\nDISK_FREE=500000000\nDISK_TOTAL=1\nMEM_FREE=9000000000\nHOLD=2026-10-20T03:29Z disk\n', 0)
  assert.equal(again.effects.length, 0)
  const rr = reduce(again.state, key('R'))
  assert.equal(rr.effects[0]?.call, 'pending-machine')
})
test('usage: a changed level line asks relay to decide; same line asks nothing', () => {
  const a = onUsage(s0, 'src=codex 5h=41 7d=55 ctx=- max=-\n', 0)
  assert.deepEqual([a.effects[0]?.call, a.effects[0]?.args], ['relay-decide', ['src=watch-cortana 5h=41 7d=55 ctx=- max=-']])
  assert.equal(onUsage(a.state, 'src=codex 5h=41 7d=55 ctx=- max=-\n', 1).effects.length, 0)
})
test('tabs, filter mode, team view, quit', () => {
  assert.equal(reduce(s0, key('2')).state.tab, 'runs')
  assert.equal(reduce(s0, key('tab')).state.tab, 'runs')
  assert.equal(reduce(reduce(s0, key('f')).state, key('right')).state.filterField, 'who')
  assert.equal(reduce(s0, key('t')).state.showTeam, true)
  assert.equal(reduce(s0, key('q')).effects[0]?.kind, 'quit')
  assert.equal(reduce(s0, key('c', { ctrl: true })).effects[0]?.kind, 'quit')
})
```
- [ ] Step 2: `node --import ./ops/loader.mjs --test ops/tests/state.test.mts` → fails (module missing).
- [ ] Step 3: implement `state.ts` per D5: `reduce` switches on `s.dialog` → dialog keys; `s.filterField` → filter keys; else tab keys. The assign confirm effect's `then` mirrors `assign.tsx` `confirm` (head line, `notes(r.out)`, `ran(argv)` with the same `quote`). `onMachine` mirrors `register.tsx` `applyMachine` (hold when red and `HOLD=-`, toast text `■ HOLD - <reasons>. New relay stages and GREEN runs are held. <fix>, then R to resume.`; the lock note from `lockNote`). `onUsage` keeps `decidedLine` in state (`s.decidedLine`) and emits `relay-decide` only when it changes; the effect's `then` sets `usage.decision` to the `RELEASE|HOLD|UNOBSERVABLE` word. `R` = `pending-machine` effect whose `then` re-classifies and, when not red, emits a follow-up `relay-release` (effects may return effects: `then` returns `(s) => State` and sets `s.pendingEffects`, drained by `app.ts`; keep it simple: `then` may return `{ state, effects }` - type `Then = (r: RunResult) => (s: State) => State | { state: State; effects: Effect[] }`).
- [ ] Step 4: test → pass.
- [ ] Step 5: `git add mods/ops-board/ops && git commit -m "F55 T5: ops/state.ts - pure reducer, effects, dialog"`

### Task 6: `ops/draw.ts` — frames at 80 columns — build=build
SATISFIES: R1, R2, R3, R5, R7

**Files:**
- Create: `mods/ops-board/ops/draw.ts`, `mods/ops-board/ops/tests/draw.test.mts`
- Test: `mods/ops-board/ops/tests/draw.test.mts`

**Interfaces:**
- Consumes: `State`, `viewOf`, `dialogLines` (T5); `buildModel`, `offsetFor`; `bandSegs`, `Seg`, `NARROW_COLUMNS`; `healthLines`; `runLines`; `paint`, `STATE_COLOR`, `GROUPS`; `ticketsOf`.
- Produces:
```ts
export type Paint = { color: boolean; ascii: boolean }
export function ansi(segs: Seg[], p: Paint): string          // one line, SGR per seg, reset at end; no escapes when !p.color
export function plain(segs: Seg[]): string                    // text only
export function glyph(s: string, ascii: boolean): string      // ●→* ▲→^ ■→# █→= ░→- …→... ▾→v
export function cells(s: string): number                      // code points
export function fit(s: string, cols: number): string          // ≤ cols, '…' when cut
export function frameSegs(s: State): Seg[][]                   // exactly s.rows lines of segs
export function frame(s: State, p: Paint): string[]            // ansi(frameSegs) - exactly s.rows strings, each ≤ s.cols cells of text
export function paintScreen(lines: string[]): string          // '\x1b[H' + lines.join('\x1b[K\r\n') + '\x1b[K'
```
Tickets rows draw as the mod: `● F55  title…` with the dot in the state colour, the selected row inverse, chips on the next line (`app:web  owner:@asha  decide:@x  by:@a @b  (@cc-…)`), the raw `- [ ] …` line when expanded; group heads `IN PROGRESS 1` in colour; count line `7 open ●1 ●1 ●1 ●4 · 9 done hidden`; keys line `↑↓ move  a assign  d decide  D decided  f filter  x done  t team  r refresh  q quit`; the band last.

- [ ] Step 1: failing test:
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ansi, frame, frameSegs, fit, cells, glyph } from '../draw'
import { initial, onBoard, onMachine, reduce } from '../state'
import { parseBoard } from '../../hooks/lib/board'
import { BOARD } from '../../tests/fixtures'
const s = onBoard(initial(80, 24, 0), parseBoard(BOARD, 'T', 1, 1), [{ handle: '@asha', emails: [] }], null)
const P = { color: false, ascii: false }

test('a frame is rows × ≤cols, tab bar first, band last, no escapes without colour', () => {
  const f = frame(s, P)
  assert.equal(f.length, 24)
  for (const l of f) { assert.ok(cells(l) <= 80, l); assert.doesNotMatch(l, /\x1b/) }
  assert.match(f[0]!, /^ Tickets  Runs  Health/)
  assert.match(f[23]!, /\/pending/)            // the narrow band's second line at 80 cols
  assert.match(f.join('\n'), /IN PROGRESS 1\n● B2  CSV export drops the last row/)
})
test('colour on: dot carries the state colour, selected row inverse', () => {
  const f = frame(s, { color: true, ascii: false })
  assert.match(f.find(l => l.includes('B2  CSV'))!, /\x1b\[33m●\x1b\[0m\x1b\[7m/)
})
test('ascii swaps the glyphs; fit cuts with an ellipsis; a long title never wraps', () => {
  assert.equal(glyph('● ▲ ■ █ ░ … ▾', true), '* ^ # = - ... v')
  assert.equal(fit('abcdef', 4), 'abc…')
  const long = onBoard(initial(80, 24, 0), parseBoard('- [ ] F1 — ' + 'x'.repeat(200) + '\n', 'T', 1, 1), [], null)
  assert.ok(frame(long, P).every(l => cells(l) <= 80))
})
test('runs and health tabs draw their line models; the dialog overlays the body', () => {
  assert.match(frame(reduce(s, { name: '3' }).state, P).join('\n'), /USAGE\n5-hour  not available/)
  assert.match(frame(reduce(s, { name: '2' }).state, P).join('\n'), /no runs read yet/)
  assert.match(frame(reduce(s, { name: 'a' }).state, P).join('\n'), /Assign B2\n  \(•\) implementation/)
  const red = onMachine(s, 'DRIVE=C:\nDISK_FREE=1\nDISK_TOTAL=1\nMEM_FREE=1\nHOLD=-\n', 0).state
  assert.match(frame(red, P).at(-1)!, /■ HOLD/)
})
test('120 columns: the band is one line', () => {
  assert.doesNotMatch(frame({ ...s, cols: 120 }, P).at(-1)!, /\/pending/)
})
```
- [ ] Step 2: `node --import ./ops/loader.mjs --test ops/tests/draw.test.mts` → fails (module missing).
- [ ] Step 3: implement: `frameSegs` builds `[tabs, blank, ...body, blank, count, keys, ...band]`, pads or cuts `body` to `rows - fixed` using `offsetFor(model, selected, top, bodyRows)` to keep the row in view; every line through `fit(plain, cols)` applied per segment (cut the segment that crosses the limit, drop the rest). SGR table from CONSTRAINTS. `glyph` applied to seg text when `ascii`.
- [ ] Step 4: test → pass.
- [ ] Step 5: `git add mods/ops-board/ops && git commit -m "F55 T6: ops/draw.ts - frames at any width, ANSI, ascii fallback"`

### Task 7: `ops/app.ts`, the launchers, the smoke test — build=build
SATISFIES: R1-R8, R12 (launchers)

**Files:**
- Create: `mods/ops-board/ops/app.ts`, `mods/ops-board/ops/ops.sh`, `mods/ops-board/ops/ops.ps1`, `mods/ops-board/ops/tests/app.test.mts`
- Test: `mods/ops-board/ops/tests/app.test.mts`

**Interfaces:**
- Consumes: `makeHost` (T4), `initial/reduce/onBoard/onMachine/onUsage/onRuns/viewOf` (T5), `frame/paintScreen` (T6), `parseBoard`, `parseTeam`, `meOf`, `parseRuns`.
- Produces: `app.ts` CLI: `node --import loader.mjs app.ts [--once] [--cols N] [--rows N] [--no-color] [--ascii] [--skills <dir>] [--tab tickets|runs|health]`; exit 0; `--once` prints one frame (plain `\n`-joined) and exits without raw mode. `ops.sh`, `ops.ps1` as D5.

- [ ] Step 1: failing test `ops/tests/app.test.mts`:
```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
const ops = resolve(import.meta.dirname, '..')
const repoSkills = resolve(ops, '../../../skills')          // the real scripts: pending.sh --machine etc.

test('--once draws the real board of a fixture repo at 80 columns', () => {
  const t = mkdtempSync(join(tmpdir(), 'ops-app-'))
  execFileSync('git', ['init', '-q'], { cwd: t })
  writeFileSync(join(t, 'TICKETS.md'), '# Tickets\n\n## Features\n\n- [ ] F1 — Dark mode [owner: @asha]\n- [~] F2 — Bulk delete\n')
  mkdirSync(join(t, '.skillator')); writeFileSync(join(t, '.skillator/team.md'), '- @asha: a@x\n')
  const out = execFileSync(process.execPath, ['--import', join(ops, 'loader.mjs'), join(ops, 'app.ts'), '--once', '--cols', '80', '--rows', '20', '--no-color', '--skills', repoSkills], { cwd: t, encoding: 'utf8' })
  const lines = out.split('\n').filter(Boolean)
  assert.equal(lines.length, 20)
  assert.match(out, /IN PROGRESS 1\n● F2  Bulk delete/)
  assert.match(out, /PENDING 1\n● F1  Dark mode\n    owner:@asha/)
  assert.match(lines.at(-1)!, /ops|\/pending/)
})
test('launcher refuses an old node with exit 2', () => {
  const t = mkdtempSync(join(tmpdir(), 'ops-node-'))
  mkdirSync(join(t, 'bin'))
  writeFileSync(join(t, 'bin/node'), '#!/bin/sh\n[ "$1" = "-p" ] && echo 20.0.0\n'); execFileSync('chmod', ['+x', join(t, 'bin/node')])
  const r = spawnSync('sh', [join(ops, 'ops.sh')], { env: { ...process.env, PATH: join(t, 'bin') + ':' + process.env.PATH }, encoding: 'utf8' })
  assert.equal(r.status, 2); assert.match(r.stdout + r.stderr, /ops needs node 22\.18 or newer \(found 20\.0\.0\)/)
})
```
  (the second test is skipped on Windows with `{ skip: process.platform === 'win32' }`; `ops.ps1` gets the same check by hand in T9.)
- [ ] Step 2: run → fails (`app.ts` missing).
- [ ] Step 3: implement `app.ts`: parse flags; `host = await makeHost({ appDir: import.meta.dirname, cwd: process.cwd(), skills })`; `state = initial(cols, rows, Date.now())`; `pollBoard()` (stat `<repoRoot>/TICKETS.md` and `.skillator/team.md`, re-read on change, `onBoard`); `pollSlow()` (`pending-machine` → `onMachine`; `relay-list` → relay text; `usage-level` → `onUsage`); `pollRuns()` (list + `chain status` per open run, 2 at a time, `onRuns`); `runEffects(effects)` executes `run` effects via `host.run` and applies `then`, loops on returned effects; `--once`: one `pollBoard` + `pollSlow`, print `frame(state, paint).join('\n')`, exit. Otherwise: `process.stdout.write('\x1b[?1049h\x1b[?25l')`, `readline.emitKeypressEvents(stdin)`, `stdin.setRawMode(true)`, on `keypress` → `reduce` → effects → redraw; timers 2 s / 60 s / 30 s (runs tab only); `stdout.on('resize')` → cols/rows → redraw; quit and `process.on('exit'|'uncaughtException'|'SIGINT')` restore `\x1b[?25h\x1b[?1049l` and raw mode off. `ops.sh`:
```sh
#!/usr/bin/env sh
# ops - the skillator ops board beside any CLI.  sh ops.sh [repo-dir] [--ascii] [--no-color]
set -eu
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
case ${1:-} in ''|-*) ;; *) cd -- "$1"; shift ;; esac
v=$(node -p 'process.versions.node' 2>/dev/null || true)
maj=${v%%.*}; rest=${v#*.}; min=${rest%%.*}
if [ -z "$v" ] || [ "$maj" -lt 22 ] || { [ "$maj" -eq 22 ] && [ "$min" -lt 18 ]; }; then
  echo "ops needs node 22.18 or newer (found ${v:-none}): https://nodejs.org" >&2; exit 2
fi
exec node --import "$here/loader.mjs" "$here/app.ts" "$@"
```
  `ops.ps1`: `param([string]$Repo = '.', [Parameter(ValueFromRemainingArguments)][string[]]$Rest)`; `Set-Location $Repo`; `$v = & node -p 'process.versions.node'`; version compare with `[version]`; `Write-Error`-free `Write-Host` + `exit 2`; `& node --import "$PSScriptRoot\loader.mjs" "$PSScriptRoot\app.ts" @Rest; exit $LASTEXITCODE`.
- [ ] Step 4: `node --import ./ops/loader.mjs --test "ops/tests/*.test.mts"` → all `ops/tests` pass; then by hand from this repo: `sh mods/ops-board/ops/ops.sh --once --no-color --cols 80 --rows 30` prints the real board (F54/F55 visible, the live `held` line in the band).
- [ ] Step 5: `git add mods/ops-board/ops && git commit -m "F55 T7: ops app, sh and ps1 launchers, --once smoke test"`

### Task 7a: team add / remove — the form, the Team view, the calls — build=build
SATISFIES: R22

**Files:**
- Modify: `mods/ops-board/ops/state.ts` (`State` + `person: PersonDraft | null`, `teamConfirm: string | null`, `teamSelected: string | null`; form keys; `+ add person` row in the dialog; `n` / `delete` / `y` / `n` in the Team view), `mods/ops-board/ops/draw.ts` (the form and the Team view bodies, the `y/n` line), `mods/ops-board/ops/app.ts` (no new effects kind: `meta-team-add` / `meta-team-remove` are `run` effects already executed generically; only the keypress → `Key` mapping gains `sequence` for printable keys and `backspace`/`delete` names)
- Modify: `mods/ops-board/ops/tests/state.test.mts`, `mods/ops-board/ops/tests/draw.test.mts`
- Same files as T5, T6, T7 → runs after T7, alone.

**Interfaces:**
- Consumes: `PersonDraft` type (`types/index.d.ts`: `{ handle, name, emails, result, back: 'assign' | 'team' }` - exists), `Effect`, `RunResult`, `reduce`, `frameSegs`.
- Produces: `Key` gains `sequence?: string` (the typed character); `export function personArgs(p: PersonDraft): [string, string, string]` (handle lower-cased with `@`, name or the bare handle, emails comma-joined) and `export function personError(p: PersonDraft): string | null` - both moved verbatim from `assign.tsx` (`addArgs`, the `bad` check); `export function teamLines(s: State): string[]`; `export function formLines(s: State): string[]`.

- [ ] Step 1: failing tests appended to `state.test.ts`:
```ts
test('+ add person from the dialog: validation, then meta-team-add, back on the dialog with the new handle', () => {
  let { state } = reduce(s0, key('a'))
  state = reduce(reduce(state, key('down')).state, key('down')).state          // past @asha, @vidul to "+ add person"
  state = reduce(state, key('return')).state
  assert.equal(state.person?.back, 'assign')
  for (const ch of 'Zed') state = reduce(state, { name: ch.toLowerCase(), sequence: ch }).state
  assert.equal(state.person?.handle, 'Zed')
  let r = reduce(state, key('return'))
  assert.equal(r.effects.length, 0); assert.equal(r.state.person?.result, 'emails: at least one (a@x, b@y)')
  state = reduce(reduce(r.state, key('tab')).state, key('tab')).state       // to Emails
  for (const ch of 'z@x') state = reduce(state, { name: ch, sequence: ch }).state
  r = reduce(state, key('return'))
  assert.deepEqual([r.effects[0]!.call, r.effects[0]!.args], ['meta-team-add', ['@zed', 'zed', 'z@x']])
  const after = r.effects[0]!.then({ code: 0, out: '', err: '', argv: ['sh', 'x'] })(r.state) as State
  assert.equal(after.person, null); assert.equal(after.dialog?.handle, '@zed'); assert.match(after.toast ?? '', /✓ @zed added to \.skillator\/team\.md/)
})
test('team view: n opens the form (back=team); del asks, y removes, n keeps', () => {
  let { state } = reduce(s0, key('t'))
  assert.equal(reduce(state, key('n')).state.person?.back, 'team')
  state = reduce(state, key('delete')).state
  assert.equal(state.teamConfirm, '@asha')
  assert.equal(reduce(state, key('n')).state.teamConfirm, null)
  const r = reduce(state, key('y'))
  assert.deepEqual([r.effects[0]!.call, r.effects[0]!.args], ['meta-team-remove', ['@asha']])
})
test('a bad handle never runs', () => {
  let { state } = reduce(reduce(s0, key('t')).state, key('n'))
  for (const ch of 'A B') state = reduce(state, { name: ch, sequence: ch }).state
  const r = reduce(reduce(reduce(state, key('tab')).state, key('tab')).state, { name: 'x', sequence: 'x' })
  const c = reduce(r.state, key('return'))
  assert.equal(c.effects.length, 0); assert.equal(c.state.person?.result, 'handle: lower-case a-z 0-9 _ - after the @')
})
```
  and to `draw.test.ts`:
```ts
test('team view and add-person form draw in the body at 80 columns', () => {
  const tv = reduce(s, { name: 't' }).state
  assert.match(frame(tv, P).join('\n'), /Team\n  › @asha\s+.*\n  n add · del remove · Esc back/)
  const f = reduce(tv, { name: 'n' }).state
  assert.match(frame(f, P).join('\n'), /Add person\n  Handle  @_\n  Name\s*\n  Emails\s*\n  Writes  \.skillator\/team\.md/)
  const ask = reduce(tv, { name: 'delete' }).state
  assert.match(frame(ask, P).join('\n'), /remove @asha from \.skillator\/team\.md\? \(y\/n\)/)
})
```
- [ ] Step 2: `node --import ./ops/loader.mjs --test "ops/tests/*.test.mts"` → the new tests fail (`person` undefined, no `+ add person` row, `teamConfirm` undefined).
- [ ] Step 3: implement in `state.ts` (the dialog's person list gets a trailing `+ add person` entry; `reduce` branches: `s.person` → form keys first; `s.teamConfirm` → `y`/`n`/`escape`; Team view keys `n`, `delete`, `up`/`down` over members), `draw.ts` (`teamLines`, `formLines`, the confirm line replaces the Team view's key line while asking), `app.ts` (keypress → `{ name, sequence, shift, ctrl }`; `delete` and `backspace` names as readline emits them).
- [ ] Step 4: all `ops/tests` pass; `sh mods/ops-board/ops/ops.sh . --once --tab team` is not needed - the `t` path is covered by the frame test.
- [ ] Step 5: `git add mods/ops-board/ops && git commit -m "F55 T7a: team add/remove in the dialog and the Team view (ticket-meta team add|remove)"`

### Task 8: install.sh / install.ps1 ship `ops-board/`, the `ops` shim; the skill names it — build=build
SATISFIES: R12, R23, R24

**Files:**
- Modify: `install.sh` (`install_into`: after the `references` refresh; `--dry-run` line; `write_shim`; the final summary), `install.ps1` (same, plus `-Profile <path>` parameter and `Write-OpsFunction`)
- Modify: `skills/tickets-zordon/SKILL.md` ("Showing the board": one paragraph "The board as a terminal app" naming `ops` on PATH, `ops.sh` / `ops.ps1` and where install puts them), `README.md` (one line under the install section)
- Test: the `--selftest` / `-SelfTest` blocks land in T10/T11 (same files, later); here the check is the dry run and a real install into an isolated HOME and profile (Step 1/4). Same files as T10, T11 → sequential.

- [ ] Step 1: the failing checks, in Git Bash with `HOME=$(mktemp -d); mkdir -p "$HOME/.pi"`: (a) `sh install.sh --dry-run` lacks `would refresh ... ops-board/` and `would write ~/.local/bin/ops`; (b) `sh install.sh && test -f "$HOME/.pi/agent/skills/ops-board/ops/app.ts"` → exit 1; (c) `test -x "$HOME/.local/bin/ops"` → exit 1. PowerShell, with `$env:HOME`/`$env:USERPROFILE` at a temp dir and `-Profile "$tmp\profile.ps1"`: (d) `install.ps1 -DryRun` lacks `would write function ops in`; (e) after `install.ps1`, `Select-String '# >>> skillator ops >>>' $tmp\profile.ps1` finds nothing.
- [ ] Step 2: confirm all five fail as stated.
- [ ] Step 3: `install.sh`: in `install_into`, dry branch `echo "        would refresh PLATFORMS.md PRACTICE.md WORKFLOW.md practice/ references/ ops-board/ in $_dest"`; real branch `rm -rf "$_dest/ops-board" && mkdir -p "$_dest/ops-board/hooks" && cp -R "$root/mods/ops-board/hooks/lib" "$_dest/ops-board/hooks/" && cp -R "$root/mods/ops-board/types" "$root/mods/ops-board/ops" "$_dest/ops-board/"`; the loop records each written dest in `$tmpdests` (a temp file - the loop is a subshell). After the loop:
```sh
shim_src=""
if [ -n "$plugin" ] && [ -f "$plugin/mods/ops-board/ops/ops.sh" ]; then shim_src="$plugin/mods/ops-board/ops"
elif [ -s "$tmpdests" ]; then shim_src="$(sed -n 1p "$tmpdests")/ops-board/ops"; fi
while read -r d; do echo "ops   sh $d/ops-board/ops/ops.sh <repo>   (Windows: powershell -NoProfile -ExecutionPolicy Bypass -File $d/ops-board/ops/ops.ps1 -Repo <repo>)"; done < "$tmpdests"
if [ -n "$shim_src" ]; then
  if [ -n "$dry" ]; then echo "        would write $HOME/.local/bin/ops -> $shim_src/ops.sh"
  else
    mkdir -p "$HOME/.local/bin"
    printf '#!/usr/bin/env sh\nexec sh "%s/ops.sh" "$@"\n' "$shim_src" > "$HOME/.local/bin/ops"
    chmod 755 "$HOME/.local/bin/ops"
    echo "ops   $HOME/.local/bin/ops -> $shim_src/ops.sh"
    case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) echo "      $HOME/.local/bin is not on your PATH - add it, or run the launch line above" ;; esac
  fi
fi
```
  `install.ps1`: `param(... [string]$Profile = $PROFILE.CurrentUserAllHosts)`; `Write-OpsFunction $shimSrc $Profile`: read the file (empty when absent), `$block = "# >>> skillator ops >>>`nfunction ops { & powershell -NoProfile -ExecutionPolicy Bypass -File '$shimSrc\ops.ps1' @args }`n# <<< skillator ops <<<"`; regex `(?s)# >>> skillator ops >>>.*?# <<< skillator ops <<<\r?\n?` → count matches; 0 → append `"`n$block`n"`; 1 → replace; ≥2 → replace the first, remove the rest, `Write-Host "      removed $($n-1) duplicate ops block(s) from $Profile"`; write UTF-8 no BOM; `-DryRun` prints `would write function ops in $Profile`; summary `ops   function ops in $Profile (new shells; or . `$PROFILE now)` + the per-dest launch lines. SKILL.md and README lines.
- [ ] Step 4: all five checks pass; `sh "$HOME/.pi/agent/skills/ops-board/ops/ops.sh" "$PWD" --once --no-color --cols 80 --rows 20` draws this repo's board from the installed copy (D2's flat layout); `"$HOME/.local/bin/ops" "$PWD" --once --no-color --cols 80 --rows 20` draws the same; running `install.ps1` twice leaves exactly one block (`(Select-String '# >>> skillator ops >>>' $tmp\profile.ps1).Count -eq 1`); a profile seeded with two blocks ends with one and the summary says `removed 1 duplicate`.
- [ ] Step 5: `git add install.sh install.ps1 skills/tickets-zordon/SKILL.md README.md && git commit -m "F55 T8: install ships ops-board/, prints the launch line per host, writes the ops shim (~/.local/bin/ops, PowerShell profile function)"`

### Task 9: live run — Windows Terminal and Git Bash, assign round trip — verify (owner + controller, no implementer)
SATISFIES: R10

**Files:**
- Create: `practice/baselines/green-ops-f55.txt`
- Modify: `TICKETS.md` F55 line (the controller, via tickets-zordon, at close)

- [ ] Step 1: in **Windows Terminal (PowerShell 5.1)**, from this repo: `powershell -NoProfile -ExecutionPolicy Bypass -File mods\ops-board\ops\ops.ps1 -Repo C:\tools\Projects\skillator2`. Expect: Tickets tab with the real board (F54 `[ ]`, F55 `[~]` once started, F52 `[~]`), the band's second line, `held` shown while `.skillator/watchdog.hold` exists. Press `2`, `3`: Runs (RUN-0012 rows if any open), Health (usage `not available` or codex figures; MACHINE lines). Screenshot each.
- [ ] Step 2: assign round trip there: `↓` to F55, `a`, pick a team handle (add one first by hand if `.skillator/team.md` is absent: `sh skills/tickets-zordon/scripts/ticket-meta.sh team add @ikran "Ikran" bodish.ed@gmail.com`), `Enter`. Expect the toast `✓ F55 now pending, owned by @ikran…` + `ran: powershell … ticket-meta.ps1 assign F55 @ikran`, and within 2 s the row's chips show `owner:@ikran`; `git diff TICKETS.md` shows that one line. Then `d` on the same row → `[?]` with `decide:` chip; `D` → back to `[ ]`. Screenshot.
- [ ] Step 3: in **Git Bash (mintty)**: `sh mods/ops-board/ops/ops.sh .` → the same screens; resize the window to 80 columns: no wrapped line, the band folds. `--ascii` once to see the fallback. Screenshot.
- [ ] Step 4: `practice/baselines/green-ops-f55.txt`: date, node version, the two terminals, the key sequence, the toast text, the `git diff` of the round trip, the screenshot paths under `.screenshot-dir/`, and `node --import ./ops/loader.mjs --test "ops/tests/*.test.mts"` + `claude plugin test mods/ops-board` counts. Any fail → a `B` ticket, F55 stays `[~]`.
- [ ] Step 5: `git add practice/baselines/green-ops-f55.txt && git commit -m "F55: live run in Windows Terminal and Git Bash, assign round trip (green-ops-f55)"`

### Task 10: F54 — command texts and `install.sh` writes them; `--selftest` — build=build
SATISFIES: R13, R14, R15, R16, R17, R19

**Files:**
- Create: `host-commands/codex/pending.md`, `host-commands/codex/list-tickets.md`, `host-commands/gemini/pending.toml`, `host-commands/gemini/list-tickets.toml`, `host-commands/cursor/pending.md`, `host-commands/cursor/list-tickets.md`, `host-commands/pi/pending.md`, `host-commands/pi/list-tickets.md`, `host-commands/antigravity/pending/SKILL.md`, `host-commands/antigravity/list-tickets/SKILL.md`
- Modify: `install.sh` (new `write_commands <cli> <dest>` called from the targets loop; `--selftest` option; the `--dry-run` lines)
- Test: `sh install.sh --selftest`

**Interfaces:**
- Consumes: the D7 table; the `{{SKILLS}}` placeholder.
- Produces: `write_commands cli dest`: codex → `$codex_home/prompts/{pending,list-tickets}.md`; antigravity → `<dest>/{pending,list-tickets}/SKILL.md` for each antigravity dest, plus `$HOME/.gemini/commands/{pending,list-tickets}.toml` once (Gemini CLI's dir, under the same `~/.gemini` marker); cursor → `$HOME/.cursor/commands/*.md`; pi → `$HOME/.pi/agent/prompts/*.md`; claude-code → nothing. A `subst file dest-skills-dir` helper: `sed "s#{{SKILLS}}#$skills#g"` (the dest path, forward slashes). `--selftest`: isolated `HOME`/`CODEX_HOME` with marker dirs, install, assert, print `ok`.

The texts (the body is the D7 pending / list-tickets text; placeholders in capitals):
```md
<!-- host-commands/pi/pending.md -->
---
description: What is pending - board counts, runs, sessions, unpushed commits, machine (tickets-zordon pending script)
---
Load the `tickets-zordon` skill ({{SKILLS}}/tickets-zordon/SKILL.md). Then run
`sh {{SKILLS}}/tickets-zordon/scripts/pending.sh` (on Windows:
`powershell -NoProfile -ExecutionPolicy Bypass -File {{SKILLS}}/tickets-zordon/scripts/pending.ps1`)
from the repo root and paste what it prints, unchanged. It reads; it never edits the board.
```
```md
<!-- host-commands/pi/list-tickets.md -->
---
description: List the TICKETS.md board the tickets-zordon way (by type; `status` groups by state)
argument-hint: "[status] [all] [app:<app>] [@person] [prefix|ID]"
---
Load the `tickets-zordon` skill ({{SKILLS}}/tickets-zordon/SKILL.md) and print its
"Showing the board" view for this repo's TICKETS.md with these arguments: `$ARGUMENTS`
(`status`, `all`, `app:<app>`, `@person`, a prefix like `A`, or an ID). By type unless
`status` is given; one count line after the list; nothing else.
```
codex: the same bodies without frontmatter (`$ARGUMENTS` kept). cursor: `---\ndescription: ...\n---` + body, the argument sentence reads "the words typed after the command are the arguments". antigravity `SKILL.md`: `---\nname: pending\ndescription: ...\n---` + body (same for `list-tickets`, "the words typed after the command are the arguments"). gemini:
```toml
# host-commands/gemini/pending.toml
description = "What is pending - board counts, runs, sessions, unpushed commits, machine (tickets-zordon pending script)"
prompt = """
!{sh {{SKILLS}}/tickets-zordon/scripts/pending.sh}

Above is the output of tickets-zordon's pending script for this repo. Paste it to me unchanged; it reads, it never edits the board.
"""
```
(`install.ps1` writes `!{powershell -NoProfile -ExecutionPolicy Bypass -File {{SKILLS}}/tickets-zordon/scripts/pending.ps1}` instead - T11.) `list-tickets.toml`: `prompt = """Load the tickets-zordon skill ({{SKILLS}}/tickets-zordon/SKILL.md) and print its "Showing the board" view ... arguments: `{{args}}` ..."""`.

- [ ] Step 1: write the selftest first - at the end of `install.sh` before the targets loop, `--selftest` handling:
```sh
if [ -n "$selftest" ]; then
  T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
  mkdir -p "$T/.codex" "$T/.cursor" "$T/.gemini" "$T/.pi"
  HOME=$T CODEX_HOME=$T/.codex sh "$0" >/dev/null || { echo "FAIL: install exited $?"; exit 1; }
  for f in .codex/prompts/pending.md .codex/prompts/list-tickets.md .gemini/commands/pending.toml .gemini/commands/list-tickets.toml \
           .cursor/commands/pending.md .cursor/commands/list-tickets.md .pi/agent/prompts/pending.md .pi/agent/prompts/list-tickets.md \
           .gemini/config/skills/pending/SKILL.md .gemini/skills/list-tickets/SKILL.md \
           .codex/skills/ops-board/ops/app.ts .pi/agent/skills/ops-board/hooks/lib/board.ts; do
    [ -f "$T/$f" ] || { echo "FAIL: missing $f"; exit 1; }
  done
  grep -q "$T/.codex/skills/tickets-zordon/scripts/pending.sh" "$T/.codex/prompts/pending.md" || { echo "FAIL: codex prompt not substituted"; exit 1; }
  grep -q '^!{sh ' "$T/.gemini/commands/pending.toml" || { echo "FAIL: gemini shell injection"; exit 1; }
  grep -q '{{args}}' "$T/.gemini/commands/list-tickets.toml" || { echo "FAIL: gemini args"; exit 1; }
  grep -q '^name: pending$' "$T/.gemini/config/skills/pending/SKILL.md" || { echo "FAIL: agy skill name"; exit 1; }
  grep -q '{{SKILLS}}' "$T/.pi/agent/prompts/pending.md" && { echo "FAIL: placeholder left"; exit 1; }
  grep -qx 'pending' "$T/.gemini/skills/.skillator-installed" && { echo "FAIL: command skill in manifest"; exit 1; }
  [ -x "$T/.local/bin/ops" ] || { echo "FAIL: missing .local/bin/ops"; exit 1; }
  grep -q "exec sh \"$T/.cursor/skills/ops-board/ops/ops.sh\"" "$T/.local/bin/ops" || { echo "FAIL: shim target (first dest: cursor, since claude-code has no plugin here)"; exit 1; }
  HOME=$T CODEX_HOME=$T/.codex sh "$0" | grep -q "not on your PATH" || { echo "FAIL: PATH note"; exit 1; }
  HOME=$T CODEX_HOME=$T/.codex sh "$0" --dry-run | grep -q "would write $T/.local/bin/ops" || { echo "FAIL: dry-run shim line"; exit 1; }
  echo ok; exit 0
fi
```
- [ ] Step 2: `sh install.sh --selftest` → `FAIL: missing .codex/prompts/pending.md`.
- [ ] Step 3: write the ten text files; add `write_commands` (per cli: `mkdir -p` the dir, `subst` each template to its target; antigravity also removes a stale `.skillator-owned` in those two skill dirs if an older run left one); call it after `install_into` per dest for antigravity, once per CLI for the others; `--dry-run` prints `would write <path>` per file. Skip for `claude-code`.
- [ ] Step 4: `sh install.sh --selftest` → `ok`; `sh install.sh --dry-run` (real HOME) lists the files for the installed CLIs only.
- [ ] Step 5: `git add host-commands install.sh && git commit -m "F54 T10: /pending and /list-tickets command files per host, install.sh writes them, --selftest"`

### Task 11: `install.ps1` mirror and `-SelfTest` — build=build
SATISFIES: R20

**Files:**
- Modify: `install.ps1` (`Write-Commands`, `-SelfTest` switch, dry-run lines; the gemini `pending.toml` shell line in its ps1 form)
- Test: `powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 -SelfTest`

**Interfaces:**
- Consumes: `host-commands/*` (T10), the T8 copy block.
- Produces: byte-identical files to `install.sh`'s except the gemini shell line and `\` path separators inside `{{SKILLS}}` (PowerShell writes the dest path as the host sees it: `C:\Users\…`; forward slashes are kept in the sh-run form only). Files written UTF-8 without BOM, LF (`[IO.File]::WriteAllText($p, $text, (New-Object Text.UTF8Encoding $false))`) - pi's frontmatter parser and gemini's TOML reader choke on a BOM.

- [ ] Step 1: the selftest block in `install.ps1` mirroring T10's list (`$env:HOME`, `$env:USERPROFILE`, `$env:CODEX_HOME` pointed at a temp dir; `& powershell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -Profile "$T\profile.ps1"`); extra assertions: `(Get-Content -Raw ...pending.toml) -match '(?m)^!{powershell '`, first byte of `.pi\agent\prompts\pending.md` is `-` (no BOM), no `\r`; the shim: after two runs `(Select-String -Path "$T\profile.ps1" -Pattern '# >>> skillator ops >>>').Count -eq 1` and the block names `$T\.cursor\skills\ops-board\ops\ops.ps1`; a profile pre-seeded with two blocks and a user line `Set-Alias ll ls` ends with one block and the user line intact; `-DryRun` output contains `would write function ops in $T\profile.ps1` and `$T\profile.ps1` does not exist afterwards.
- [ ] Step 2: run → `FAIL: missing .codex\prompts\pending.md`.
- [ ] Step 3: implement `Write-Commands`; the subst replaces `{{SKILLS}}` with the dest path; gemini's pending prompt uses the ps1 form.
- [ ] Step 4: `-SelfTest` → `ok`; `sh install.sh --selftest` still `ok`; `-DryRun` on the real profile lists the same files `install.sh --dry-run` lists.
- [ ] Step 5: `git add install.ps1 && git commit -m "F54 T11: install.ps1 writes the command files, -SelfTest"`

### Task 12: PLATFORMS.md row, the probe, the baseline — build=cheap
SATISFIES: R18, R21

**Files:**
- Modify: `PLATFORMS.md` (The table: a new row **Slash command file** per host: codex `$CODEX_HOME/prompts/<n>.md` → `/prompts:<n>` (inferred until the picker check); cursor `~/.cursor/commands/<n>.md`, `.cursor/commands/<n>.md`; antigravity: a skill is the command, `.agents/skills/<n>/SKILL.md` → `/<n>` (workflows deprecated); Gemini CLI `~/.gemini/commands/<n>.toml`; pi `~/.pi/agent/prompts/<n>.md`, `.pi/prompts/<n>.md` → `/<n>`; prime-agent **none - the skill route**; claude-code: the mod's commands / `commands/*.md`); a short "Commands - what is verified" paragraph with the evidence tags from this file's fact table and the transcript names.
- Create: `practice/scripts/probe-commands.sh`, `practice/baselines/green-commands-f54.txt`

**Interfaces:**
- Produces: `probe-commands.sh` prints, per host, `host | version | path | present` for each of the two files, then the live-check line for the owner (D7). Read-only. Exit 0 always.

- [ ] Step 1: the check is the probe's own output: write the script so that a missing file prints `absent`; run it before T10's install on a fresh profile → every row `absent` (the failing state); after `sh install.sh` → every installed host `present`.
- [ ] Step 2: run it now (before install) and keep the output in the baseline as the RED half.
- [ ] Step 3: write the script:
```sh
#!/bin/sh
# probe-commands.sh - which hosts have /pending and /list-tickets command files, read-only.
codex_home=${CODEX_HOME:-$HOME/.codex}
row() { for f in "$3" "$4"; do if [ -f "$f" ]; then p=present; else p=absent; fi; echo "$1 | $2 | $f | $p"; done; }
has() { command -v "$1" >/dev/null 2>&1; }
has codex   && row codex "$(codex --version 2>/dev/null)"           "$codex_home/prompts/pending.md" "$codex_home/prompts/list-tickets.md"
has gemini  && row gemini "$(gemini --version 2>/dev/null)"         "$HOME/.gemini/commands/pending.toml" "$HOME/.gemini/commands/list-tickets.toml"
has agy     && row antigravity "$(agy --version 2>/dev/null)"       "$HOME/.gemini/config/skills/pending/SKILL.md" "$HOME/.gemini/config/skills/list-tickets/SKILL.md"
{ has cursor-agent || has agent; } && row cursor "$(cursor-agent --version 2>/dev/null || agent --version 2>/dev/null)" "$HOME/.cursor/commands/pending.md" "$HOME/.cursor/commands/list-tickets.md"
has pi      && row pi "$(pi --version 2>/dev/null)"                 "$HOME/.pi/agent/prompts/pending.md" "$HOME/.pi/agent/prompts/list-tickets.md"
echo
echo "live picker check (type / in each TUI; headless where the host expands commands in -p):"
echo "  agy -p '/pending' --mode plan --sandbox   |  pi -p '/pending' --no-tools   |  gemini -p '/pending' --approval-mode plan   |  agent -p '/pending' --mode ask   |  codex: type /pro in the TUI"
```
- [ ] Step 4: after `sh install.sh` on the real profile: the probe shows `present` for codex, gemini, antigravity, cursor, pi (all five are installed here); the owner runs the picker checks and the headless ones; the baseline records RED (absent) → GREEN (present) output, each picker screenshot path, and which hosts expanded `/pending` headless with the first lines of their answer. A host whose picker does not show the command → the PLATFORMS.md row says so and an `A` ticket is logged; the Done line is met only when every installed host lists it.
- [ ] Step 5: `git add PLATFORMS.md practice/scripts/probe-commands.sh practice/baselines/green-commands-f54.txt && git commit -m "F54 T12: PLATFORMS.md command row, probe-commands.sh, green-commands-f54"`

# VERIFICATION

Run from `C:\tools\Projects\skillator2` (Git Bash unless marked PS):

1. `claude plugin test mods/ops-board` → `… 188 passed, 0 failed` (182 + 4 T1 + 2 T2; T3 adds inside existing files, counts stay per `test(`), `tsc -p mods/ops-board --noEmit` → no output, exit 0; `claude plugin validate mods/ops-board` → ok.
2. `cd mods/ops-board && node --import ./ops/loader.mjs --test "ops/tests/*.test.mts"` → `# pass 12` `# fail 0` (nodehost 2, state 6, draw 5 → 13 with app's 2 = 15 on POSIX, 14 on Windows where the launcher test is skipped; the exact number is what the Outcome records).
3. `sh mods/ops-board/ops/ops.sh . --once --no-color --cols 80 --rows 30` → 30 lines, first ` Tickets  Runs  Health`, a `PENDING n` group with `● F54  ops for every host, part 1…`, last line contains `/pending  /list-tickets` (the narrow band), no line over 80 cells (`awk '{ if (length($0) > 80) exit 1 }'`).
4. PS: `powershell -NoProfile -ExecutionPolicy Bypass -File mods\ops-board\ops\ops.ps1 -Repo . --once --no-color --cols 80 --rows 30` → the same frame.
5. `HOME=$(mktemp -d) sh -c 'mkdir -p $HOME/.pi; sh install.sh >/dev/null; sh $HOME/.pi/agent/skills/ops-board/ops/ops.sh '"$PWD"' --once --no-color --cols 80 --rows 20'` → the board drawn from the installed flat copy.
6. `sh install.sh --selftest` → `ok`; PS: `powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 -SelfTest` → `ok` (both cover the command files and the shim; the PS one with a temp `-Profile`).
6a. After a real `sh install.sh` on this machine: `~/.local/bin/ops . --once --no-color --cols 80 --rows 20` draws the board (the shim points at the plugin cache's `mods/ops-board/ops/ops.sh` since the plugin is installed here); PS, new shell: `ops -Repo . --once --no-color --cols 80 --rows 20` draws it; `Select-String '# >>> skillator ops >>>' $PROFILE.CurrentUserAllHosts` → exactly 1 hit after a second `install.ps1` run.
6b. Team round trip in `--once`-less live mode (T9 step 2 extended): `t`, `n`, type `@zed` / `Zed` / `z@x`, Enter → toast `✓ @zed added`, the row appears within 2 s; `del` on it, `y` → gone; `git diff .skillator/team.md` empty at the end.
7. `sh practice/scripts/probe-commands.sh` → `present` for every installed host after a real `sh install.sh`.
8. Live (T9, T12 Step 4): screenshots and the two baseline files exist and say GREEN; `git diff --stat` after the assign round trip touches only `TICKETS.md` (one line) and `.skillator/team.md` if a member was added.
9. Regression: `sh skills/tickets-zordon/scripts/pending.sh --selftest`, `sh skills/tickets-zordon/scripts/ticket-meta.sh selftest`, `sh skills/relay-morpheus/hooks/relay-morpheus.sh selftest` → `ok` (unchanged scripts, called by new code).

## Decisions

- Ruling: runtime = node ≥ 22.18 running the mod's `.ts` directly (approach A), no bundle, no second implementation - every host but agy is itself a node program so node is present; one lib for mod, TUI, F56, F57; tests under `node --test` - cost if wrong: an Antigravity-only or old-node user gets `ops needs node 22.18 or newer` and must install node; mitigated by the message, not by a fallback (Q1).
- Ruling: the lib is shared in place, not extracted to a package - five files, one repo, the plugin cache already carries them and `install.sh` copies `ops-board/` beside the skills like `practice/` - cost if wrong: a later package split means moving imports, not rewriting code.
- Ruling: `host.ts` is split, not shimmed - its pure call table moves to `lib/calls.ts`; the `$`-bound `runCall`/`skillatorRoot`/`readUsage` stay; `ops/nodehost.ts` is the node binding of the same table - cost if wrong: a `$` shim would have saved ~40 lines of nodehost but faked `session.usage/id` and still not known the flat layout.
- Ruling: the root concept becomes the *skills dir* (the dir containing `tickets-zordon/`), table paths drop `skills/` - the only way one `argvFor` serves `<repo>/skills`, the plugin cache and an `install.sh` dest - cost if wrong: `host.test.ts` churn (done in T1) and any external caller of `argvFor` (none: `git grep argvFor` → host.ts, tests).
- Ruling: `.ts` resolution via `ops/loader.mjs` (`node --import`) rather than editing the lib's imports to `./facts.ts` - the plugin engine's resolver is not probed for `.ts`-suffixed imports and the mod must keep loading - cost if wrong: 14 lines of hook to delete once node resolves extensionless TS or the engine is known to accept `.ts`.
- Ruling: the pure view models move from the `.tsx` files into `lib/*.ts` with re-exports (T2) rather than being re-implemented in the TUI - the ticket forbids divergence and F56/F57 want the same line builders; JSX cannot load in node - cost if wrong: one mechanical refactor covered by 182 existing tests; no atom moves.
- Ruling: the TUI runs the ps1 spelling on Windows even from Git Bash (`OS=Windows_NT`), as the mod - one rule, the scripts are twins by contract - cost if wrong: ~1 s per call from mintty; polls are 60 s.
- Ruling: usage comes from `usage-watch level` (a new `usage-level` call) and the hold decision from `relay-morpheus chain decide --level`, never computed in the TUI - F49's rule: relay decides - cost if wrong: on hosts with no usage source the Health tab says `not available` and relay says `UNOBSERVABLE`, which is the truth.
- Ruling: the TUI's state is a pure reducer with effects; `app.ts` alone touches the terminal and spawns - the views are testable without a pty (tui-tron's constraint), F56 reuses the reducer - cost if wrong: a little indirection in `app.ts`.
- Ruling: the watchdog in the TUI sets the relay hold on red exactly as the mod does (warns, never silent) - two watchers are idempotent on one hold file - cost if wrong: an extra `relay-hold` call per red reading change.
- Ruling: board root = the main checkout (git-common-dir), as `pending.sh`'s `find_main` - the scripts and the TUI must read the same `TICKETS.md` - cost if wrong: from a worktree the TUI shows main's board, not the worktree's copy (the scripts already edit main's).
- Ruling (superseded 2026-10-20 by the owner's Q2 answer): team add/remove IS in F55 - T7a adds the add-person form and the Team view's `n`/`del` on the same reducer, through `meta-team-add` / `meta-team-remove` only - cost if wrong: one more task on the same three files, after T7.
- Ruling: the add-person form is a three-field line editor in the body (printable keys, backspace, tab), not a readline prompt - raw mode is already on and a prompt would break the frame - cost if wrong: ~40 lines of key handling in `state.ts`, tested without a pty.
- Ruling: remove asks in-frame (`y/n`) before `meta-team-remove` - the mod's Team view confirms too and ticket-meta's open-ticket warning is shown after, never swallowed - cost if wrong: one extra keypress.
- Ruling (superseded 2026-10-20 by the owner's Q3 answer "1+2"): install writes an `ops` shim as well as printing the launch line - sh `~/.local/bin/ops` (a two-line exec, rewritten every run, PATH membership reported not edited), Windows a `function ops` block in `$PROFILE.CurrentUserAllHosts` between marker comments, idempotent, duplicates collapsed - cost if wrong: one file and one profile block, both named in the summary and removable by hand; `-Profile` exists so the selftest never touches the real profile.
- Ruling: the shim targets the plugin cache's `mods/ops-board/ops` when the Claude Code plugin is installed, else the first dest written - the cache is refreshed by the plugin update path, the dests by `install.sh`; both carry the same files - cost if wrong: the shim points at a dest that a later `install.sh` run rewrites anyway.
- Ruling: on Antigravity the command file IS a skill (`pending/SKILL.md`, `list-tickets/SKILL.md`), written only to the two antigravity dests, outside the manifest - `agy` deprecates workflows and makes skills slash commands; writing them as repo skills would push two near-empty skills into every host's catalog - cost if wrong: two files per antigravity dest to delete.
- Ruling: user-level command files only, no project-level `.gemini/commands` / `.cursor/commands` / `.pi/prompts` writes - `install.sh` never touches a project (its rule today); the shim and the profile block are the one user-level side effect the owner asked for (Q3) - cost if wrong: Q4.
- Ruling: gemini's `pending.toml` keeps the `!{...}` shell injection (owner's Q5 answer) - the one host whose `/pending` costs no model turn - cost if wrong: a one-line prompt swap.
- Ruling: Codex's prompts path and Cursor's user-level commands dir are taken from the vendors' docs (inferred) and closed by T12's live picker check, not assumed verified - cost if wrong: one path constant per host in `write_commands`.
- Ruling: `install.sh --selftest` / `-SelfTest` are new flags on the installers rather than a separate script - the installer's own `HOME` isolation is the test harness; `practice/scripts/selftest.sh` tests taskwork, not install - cost if wrong: a 30-line block in each installer.
- Ruling: the F54 "probe listing the commands" is the file probe plus the owner's picker check per host, recorded in a baseline - no host offers a headless command listing (verified for codex; pi/gemini/agy/cursor expand `/name` in `-p` mode, which is the headless half) - cost if wrong: the baseline says which hosts were only file-probed.
- Ruling: T9 (live run) is run by the controller with the owner, not an implementer - it needs two real terminals and screenshots - cost if wrong: none; it is verification.
- Ruling: the mod's `claude plugin test` command is taken from the F46-F53 ticket lines ("plugin test 182/182, tsc, validate") - cost if wrong: the controller substitutes the harness's actual test invocation once; the counts are the contract.

## Parked

- Q1 — A machine with no node ≥ 22.18 (an Antigravity-only user, an old LTS): should `ops` carry a fallback (deno, a prebuilt `.mjs` bundle committed per release, or a python read-only viewer)? Default: none - the launcher prints `ops needs node 22.18 or newer` and the skill route (`/pending`, `list tickets`) remains.
- Q2 — ANSWERED 2026-10-20: yes, team add / remove is in F55 (T7a).
- Q3 — ANSWERED 2026-10-20: "1+2" - the launch line per host AND an `ops` shim on PATH (`~/.local/bin/ops`; a PowerShell profile function between markers) (T8).
- Q4 — Project-level command files (`<repo>/.gemini/commands`, `.cursor/commands`, `.pi/prompts`) written by `grayskull-power`'s first-invoke persistence, so a teammate who did not run `install.sh` gets `/pending` too? Default: user level only (install never touches a project today).
- Q5 — ANSWERED 2026-10-20: keep gemini's `!{...}` shell injection in `pending.toml`.
- Q6 — An uninstall path for the shim (`install.sh --remove-ops`, `install.ps1 -RemoveOpsAlias`) that deletes `~/.local/bin/ops` and the profile block? Default: none - the summary names both so they can be removed by hand; the block's markers make the profile edit a one-cut removal.

### Owner answers (2026-10-20)
- Q2 answered: team add/remove IS in F55 - the dialog's `+ add person` and the Team view's `n` / `del` run `ticket-meta team add|remove` (the only writer of team.md; the first add creates it). Needs a task (D5 and D9 change; Q2 default dropped).
- Q3 answered "1+2": install.sh/install.ps1 BOTH print the launch line per host AND put an `ops` shim on PATH (sh: `~/.local/bin/ops`; Windows: a PowerShell profile alias). The D6 "no PATH edit" and D9 "any PATH edit" exclusion are reversed.
- Q5 answered: keep gemini's `!{...}` shell injection in pending.toml.
- Q1, Q4: no answer - defaults stand (no fallback runtime; user-level command files only).
- Design approval: owner asked for a mock first - https://claude.ai/artifact/E7v5BF2U6hWVXGcZcqWqzv. No build until approved.

# REQUIREMENTS

- R1 — `ops` Tickets tab: the main checkout's TICKETS.md grouped `[~] [!] [?] [ ] [>]`, done/cancelled behind `x`, state by colour (dot + heading), tags as chips, filters app / who / mine, raw line on Enter.
- R2 — `ops` Runs tab: `relay-morpheus list` + `chain status` per open run, stage table, waves, parked decisions; `s` queues a planned run and shows the continue prompt.
- R3 — `ops` Health tab: 5-hour / 7-day from `usage-watch level`, relay's hold decision, credit `not available`, disk / memory / locks / hold.
- R4 — Assign / decide dialog: `a` / `d` open it on the selected row, handle picked from team.md, the state change and the exact ticket-meta command shown before confirm, `meta-assign` / `meta-decide` run on Enter, `D` runs `meta-decided`; no write to TICKETS.md by any other path.
- R5 — Watchdog line: the band (green / amber / red) with machine facts, usage, relay run, locks, hold; red sets the relay hold and says how to clear it; `R` resumes on a fresh non-red reading.
- R6 — Every script call goes through the one call table (`lib/calls.ts`), sh and ps1 spellings, no host API.
- R7 — Works from 80 columns: every drawn line ≤ cols, the band folds under 110, no wrap.
- R8 — `ops.sh` and `ops.ps1` launchers; node < 22.18 or absent is refused with a message, exit 2.
- R9 — Tests for the views (`node --test` over `ops/tests`), and the mod's suite still green with the moves.
- R10 — A live run in Windows Terminal and in Git Bash showing real tickets and an assign round trip, recorded.
- R11 — The data layer (lib `.ts` files + `ops/nodehost.ts` + `ops/state.ts`) is importable by F56 / F57 without the mod's `$` or JSX.
- R12 — `install.sh` / `install.ps1` ship `ops-board/{hooks/lib,types,ops}` to every host dest and print the launch line.
- R13 — Codex: `$CODEX_HOME/prompts/pending.md`, `list-tickets.md` written.
- R14 — Gemini CLI: `~/.gemini/commands/pending.toml` (shell injection runs `pending.sh`/`.ps1`), `list-tickets.toml` (`{{args}}`).
- R15 — Cursor: `~/.cursor/commands/pending.md`, `list-tickets.md` with the description frontmatter.
- R16 — Pi: `~/.pi/agent/prompts/pending.md`, `list-tickets.md` with `description`, `argument-hint`, `$ARGUMENTS`.
- R17 — Antigravity: `pending/SKILL.md`, `list-tickets/SKILL.md` in both antigravity skill dests, outside the manifest, rewritten every run.
- R18 — prime-agent named in `PLATFORMS.md` as having no command mechanism (skill route); the new table row for every host.
- R19 — `install.sh --selftest` prints `ok` (files present, substituted, no placeholder, no manifest entry).
- R20 — `install.ps1 -SelfTest` prints `ok`; its files match `install.sh`'s but for the gemini shell line and separators; UTF-8 no BOM, LF.
- R21 — A probe on each installed CLI listing the commands: `probe-commands.sh` file rows + the owner's picker check per host, in `green-commands-f54.txt`.
- R22 — Team add / remove: the dialog's `+ add person` and the Team view's `n` open a validated three-field form that runs `meta-team-add` (the first add creates team.md); `del` asks in-frame then runs `meta-team-remove`; the TUI never writes team.md itself.
- R23 — `install.sh` writes the `ops` shim `~/.local/bin/ops` (dir created, exec of the first installed `ops.sh`), rewritten every run, and says when `~/.local/bin` is not on PATH.
- R24 — `install.ps1` writes `function ops` into the PowerShell profile between `# >>> skillator ops >>>` / `# <<< skillator ops <<<`, idempotently (one block after any number of runs, duplicates collapsed, user lines kept), with `-Profile` for the selftest.

# TRACE

| R-id | task | test | evidence |
|---|---|---|---|
| R1 | T2, T5, T6, T7 | | NONE |
| R2 | T2, T6, T7 | | NONE |
| R3 | T3, T2, T6, T7 | | NONE |
| R4 | T5, T6, T7 | | NONE |
| R5 | T2, T5, T6, T7 | | NONE |
| R6 | T1, T3, T4 | | NONE |
| R7 | T6, T7 | | NONE |
| R8 | T7 | | NONE |
| R9 | T4, T5, T6, T7 | | NONE |
| R10 | T9 | | NONE |
| R11 | T1, T2, T4, T5 | | NONE |
| R12 | T8 | | NONE |
| R13 | T10 | | NONE |
| R14 | T10 | | NONE |
| R15 | T10 | | NONE |
| R16 | T10 | | NONE |
| R17 | T10 | | NONE |
| R18 | T12 | | NONE |
| R19 | T10 | | NONE |
| R20 | T11 | | NONE |
| R21 | T12 | | NONE |
| R22 | T7a | | NONE |
| R23 | T8, T10 | | NONE |
| R24 | T8, T11 | | NONE |

# Self-review (PRACTICE §3), fixed inline

1. Coverage - every R has a task (table above); F55's Done line maps to R9 (tests for the views) and R10 (the live run); F54's to R19/R20 (selftests) and R21 (probe). The ticket's "reading the same scripts" is R6; "no Agents/Workflows" is D9. The owner's answers (Q2 → R22/T7a; Q3 → R23/R24/T8 with the selftests in T10/T11; Q5 → unchanged D7) each have a row.
2. Placeholders - none: every task carries its test code, its commands and its implementation shape; the one deliberately open fact (codex's prompts dir, cursor's user dir) is tagged inferred and closed by T12, not assumed.
3. Type consistency - `Seg` is defined once (`bandlines.ts`) and used by `healthlines.ts`, `runlines.ts`, `draw.ts`; `Line = { key, segs }` in `healthlines.ts`, `RunLine = Line`; `argvFor(call, win, skillsDir, args)` everywhere; `RunResult` named in T4 and used by T5's `Effect`; `Then` may return either `State` or `{ state, effects }` - stated in T5 Step 3 and the type is what `app.ts` drains. `findSkillsDir` takes injected `exists`/`readJson` so T4's test needs no real plugin file. `startHandle` exists twice on purpose (assign.tsx `$`-bound copy, state.ts copy) - noted in T5's interfaces; a reviewer may fold the assign.tsx one onto `state.ts`'s if the engine loads it, not required. T7a: `PersonDraft` is the existing type in `types/index.d.ts` (`back: 'assign' | 'team'`); `personArgs` / `personError` are `assign.tsx`'s `addArgs` and its `bad` check moved verbatim; `Key.sequence` is what node's readline `keypress` event carries; `teamConfirm` holds the handle being removed; T7a's `delete` key name is readline's (`name: 'delete'`), `backspace` likewise. T8: `$tmpdests` is the one shared variable between the targets loop (a subshell) and the summary, written as a temp file like the loop's other outputs; `-Profile` defaults to `$PROFILE.CurrentUserAllHosts` and is used only by the selftest.
4. Ambiguity - "keys as in the mod": the mod's key set is kept and the extra terminal keys are listed in one table (D5); "80 columns" means every line ≤ cols and the band folds, tested at 80 and 120; "selftest" means the installer's own flag, printing `ok`.
5. Scope - one implementation: a data-layer split (T1-T3), the app (T4-T7, T7a), shipping with the shim (T8), the live proof (T9), then F54 (T10-T12). 13 tasks ≥ 6 and an interface others depend on (`calls.ts`, `lib/*` models): the controller may dispatch the §3 design reviewer on the deep tier before T1; findings go inline here. Same-file groups, never fanned out: {T1, T3}; {T5, T6, T7, T7a}; {T8, T10, T11}.

### Build notes (controller, 2026-10-20)
- T4: node tests under `ops/tests/` are `*.test.mts` - `claude plugin test` picks up every `*.test.ts` in the mod (ops/ included) and refuses `node:` imports. Command: `node --import ./ops/loader.mjs --test "ops/tests/*.test.mts"` (a quoted glob - node 22 takes a bare dir as one file). Renamed throughout this file. A141: the one invocation that works on Windows and POSIX from any directory, covering ops, pi and antigravity tests, is `npm --prefix <repo>/mods/ops-board/ops test` (script in `ops/package.json`). Never pass `--import` an absolute Windows path (`C:/...` fails ERR_UNSUPPORTED_ESM_URL_SCHEME; it needs a `file://` URL or a relative `./` path).
- T4: the mod's tsconfig does not include `ops/` (no @types/node); `ops/` is checked by its node tests.
- Bash heredocs collapse `\` - write regex-bearing files with the Write tool.
- Review fixes (supersede D6/D7 where they differ): the `ops` shim targets the first dest the run wrote; the plugin installPath only when no dest was written (a plugin update drops versioned cache dirs). Gemini's `pending.toml` shell line quotes the path; on Windows (cygpath present, and always from install.ps1) it is `!{powershell -NoProfile -ExecutionPolicy Bypass -File "<skills>\tickets-zordon\scripts\pending.ps1"}`, else `!{sh "<skills>/tickets-zordon/scripts/pending.sh"}`. install.ps1 keeps a profile's UTF-8/UTF-16 BOM encoding.
