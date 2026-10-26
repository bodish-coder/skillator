# ops-board

The skillator ops board: the `TICKETS.md` board, workflows, health, messages, explorer
and build tabs (in the Claude Code pane, Workflows also lists the session's agents;
`build` is the Build tab's word, `run` an alias). One data layer, drawn four ways.
Needs node 22.18 or newer.

## Launch it, per host

| Host | How |
|---|---|
| Claude Code | The plugin: its pane, the band above the prompt, and `/ops`. |
| pi | `/ops` (the installer's extension); `/ops --once` for one frame. |
| Antigravity IDE | Command palette: `skillator: Ops board`. |
| Codex, Cursor, Gemini CLI, opencode, any shell | The terminal app, below. |

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
  `ops/wt-fragment.json`). Font: Cascadia Mono 11 - it ships with Windows Terminal and
  draws every glyph the board uses. A dark scheme of the same name keeps the highlight
  blue readable. `--open` opens its tab in that profile once installed (Windows Terminal
  reads fragments when it starts). Remove it by deleting that `skillator` folder.
