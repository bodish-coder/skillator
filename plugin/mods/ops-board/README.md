# ops-board

The skillator ops board: the `TICKETS.md` board, workflows, health, messages, explorer
and build tabs (in the Claude Code pane, Workflows also lists the session's agents;
`build` is the Build tab's word, `run` an alias). One data layer, drawn four ways.
Needs node 22.18 or newer.

The Claude Code Tickets pane uses layout B: whole tabs, counts and action labels
wrap, while the list yields rows and reports rows hidden above or below. Status
rails colour each group and the selected row is a full-width bar. `/ops ascii`
switches to Mono ASCII and saves that preference; `SKILLATOR_ASCII=1` (also `true`
or `yes`, case-insensitive) forces ASCII at session start. Ticket titles remain
the author's text, including any Unicode they contain. Other tabs and the
standalone terminal app keep their own layouts.

## Launch it, per host

| Host | How |
|---|---|
| Claude Code | The plugin: its pane, the band above the prompt, and `/ops`. |
| pi | `/ops` (the installer's extension); `/ops --once` for one frame. |
| Antigravity IDE | Command palette: `skillator: Ops board`. |
| Codex | `$ops` (a skill the installer writes; `/ops` in agy too); or the terminal app, below. |
| Cursor, Gemini CLI, opencode, any shell | The terminal app, below. |

The terminal app, after `install.sh` / `install.ps1` put `ops` on PATH (a
`~/.local/bin/ops` shim, or `function ops` in the PowerShell profile):

```
ops [repo-dir] --open          # a new tab of the current Windows Terminal window
ops [repo-dir]                 # here, in this terminal
ops [repo-dir] --once          # one frame to stdout, then exit
ops --help
```

Without the shim, from the installed copy (`<skills>` is the host's skills dir; in this
repo it is `mods/ops-board/ops/`):

```
sh <skills>/ops-board/ops/ops.sh <repo> --open
powershell -NoProfile -ExecutionPolicy Bypass -File <skills>\ops-board\ops\ops.ps1 -Repo <repo> -Open
```

An agent starts the board with `--open` (`-Open`), never as a bare process: that spawns
a separate console window. `--open` uses `wt -w 0 new-tab` when Windows Terminal's
`wt` is on PATH (on Git Bash too), else runs the board in place, as without the flag.
macOS and Linux terminals get no new tab: run `ops` in a tab of your own.

## Colour, highlights, font

- The selected row, the focused field and the active tab are bold, bright white on
  blue, with the `›` marker at the selected row.
- `NO_COLOR` (any value) or `--no-color` drops the colours only; bold, inverse and the
  `›` marker stay. `--ascii` swaps the glyphs a raster console font lacks.
- A terminal app cannot pick its font; the terminal does. On Windows the installer
  writes a Windows Terminal profile, `skillator ops`, as a fragment:
  `%LOCALAPPDATA%\Microsoft\Windows Terminal\Fragments\skillator\ops.json` (source:
  `ops/wt-fragment.json`). Font: Cascadia Mono, size 11 unless `install.ps1 -OpsFontSize <n>`
  or `ops --font-size <n>` set another - an update keeps the size you set. Cascadia Mono
  ships with Windows Terminal and draws every glyph the board uses. Ctrl+minus /
  Ctrl+plus / Ctrl+scroll zooms any Windows Terminal or herdr tab live; the in-session
  pane draws in the host terminal's font, which the pane cannot change. A dark scheme of the same name keeps the highlight
  blue readable. `--open` opens its tab in that profile once installed (Windows Terminal
  reads fragments when it starts). Remove it by deleting that `skillator` folder.

## Alphabet actions in the plugin pane

Page and form buttons show their alphabet shortcut (for example `a: Accept all`,
`p: Apply picked`, `n: None`). `o` acts on one current row. Team uses the selected
member (press a member to select them); elsewhere, moving focus to another eligible
row moves the shortcut. Where no row is selected, the first eligible row is current
(Messages starts with the newest). Workflows uses `e` and `d` for
one current run. Existing Tickets and page keys, Tab, Enter and Esc stay available.

Forms with text fields say `Tab to actions; letters there`: their shortcuts are
absent while typing and become available on a current non-text form control.
Returning to an Input disables them. Filters keep native Select arrows/Enter.
Confirmations still require their own action; a branch choice never runs Git.
