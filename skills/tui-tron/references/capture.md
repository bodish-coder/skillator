# Capture — getting frames out of a TUI

`SKILL.md` §2 states the order. This is the mechanics. Python is the worked
language; the shape is the same in any runtime that can rebind its stdout and
its key reader.

---

## 1. tmux — a real pty

```sh
tmux new-session -d -s proof -x 60 -y 24 'python portpick.py'
tmux send-keys -t proof Down Down Enter
tmux capture-pane -t proof -p        # one frame, plain text
tmux kill-session -t proof
```

`-x`/`-y` set the size, so the width matrix is a loop over `-x`. `capture-pane
-p` prints the visible pane; add `-e` to keep the escape sequences when you need
to check colour rather than layout.

Two traps. A `send-keys` that lands before the app has drawn is swallowed — send
after the first `capture-pane` returns a non-empty frame, not after a sleep. And
`capture-pane` returns the pane *padded to the pane width*, so strip trailing
spaces before asserting on line length or every line is exactly `-x` long.

## 2. winpty / ConPTY

Try it; expect it to be missing. When the harness has no terminal size to hand
it, it aborts at startup:

```
ASSERT_CONDITION("wp != nullptr && cols > 0 && rows > 0")
```

`cols` and `rows` are zero because nothing upstream has a size. Nothing you pass
in changes that, so there is no retry, no backoff, and no alternate wrapper that
helps. Record the line and drop to §3.

## 3. The tty-shaped capture

Four moving parts. All four are required — three of them and the app takes the
non-tty branch, which is the branch you are not trying to test.

```python
import io, os, re, sys, contextlib

class Tty(io.StringIO):
    def isatty(self):
        return True

def capture(draw, keys, cols=80, lines=24):
    """Drive `draw` with `keys`, return the raw text it emitted."""
    os.environ["COLUMNS"], os.environ["LINES"] = str(cols), str(lines)
    it = iter(keys)
    real_key, app._key = app._key, lambda: next(it, "q")   # 3. inject keys
    cap, real_out = Tty(), sys.stdout                      # 1. + 2.
    sys.stdout = cap
    try:
        draw()
    finally:
        sys.stdout = real_out
        app._key = real_key
        os.environ.pop("COLUMNS", None); os.environ.pop("LINES", None)
    return cap.getvalue()
```

1. **`isatty()` returning `True`** — the app's own `if sys.stdout.isatty()`
   branches take the terminal path: glyphs, colour, cursor hiding.
2. **`COLUMNS` / `LINES`** — `shutil.get_terminal_size()` reads them before it
   asks the OS, so this is the knob the width matrix turns. Pop them afterwards;
   leaving them set poisons every later check in the same process.
3. **The injected key reader** — replace the app's single "read one keystroke"
   function with `lambda: next(it, "q")`. The fallback matters: a screen that
   runs out of keys must quit rather than block or recurse. Restore the original
   in a `finally`, always.
4. **Restore `sys.stdout` in a `finally`** — an assertion that fires while
   stdout is still the capture object produces a silent, invisible failure.

### Splitting it into frames

A full-redraw TUI clears the screen before each paint, so the clear sequence is
the frame delimiter:

```python
frames = [f for f in capture(...).split("\033[2J\033[H") if f.strip()]
```

Use whatever sequence the app actually emits — `\033[2J\033[H`, `\033[H\033[J`,
`\033c`. Grep the source for it rather than guessing; a wrong delimiter yields
one enormous "frame" and every per-frame assertion passes vacuously.

Assert on the count too. `assert len(frames) >= 5, "screens did not redraw"`
catches an app that swallowed the injected keys and drew once.

### What it proves, and what it does not

Proves: the exact bytes emitted, which tty branch was taken, line lengths after
ANSI stripping, that the cursor was handed back (`assert
out.endswith("\033[?25h")`), that a destructive key is absent from a screen that
must not offer one.

Does not prove: what a font does with a codepoint, what a codepage does with a
byte, how an emulator handles a wide or combining character, or that any of it is
legible. Report it as `captured`, never as `ran` (`SKILL.md` §6).

---

## 4. Stripping ANSI

Two regexes, and the difference matters.

```python
LAYOUT = r"\033\[[0-9;?]*[A-Za-z]"   # everything: colour, cursor, clear, mode
COLOUR = r"\033\[[0-9;]*m"           # SGR only
```

Measuring a line's width → `LAYOUT`, so cursor moves and mode switches do not
count toward the length. Scanning the ASCII fallback for codepoints > 127 →
`COLOUR`, so a stray cursor escape is stripped but a leaked `…` is still there
to be caught. Using `COLOUR` for the width check silently inflates every line
that contains a cursor move.

---

## 5. Non-Python runtimes

The four parts map directly:

| Part | Node / Ink | Go |
|---|---|---|
| tty-shaped stdout | a `Writable` with `isTTY = true`, `columns`, `rows` | a `bytes.Buffer` behind the interface the app writes to |
| size | the same `columns`/`rows` properties | inject the size; do not call `term.GetSize` |
| keys | write to the app's input stream, or stub the key handler | feed the `tea.Msg` channel directly |
| frames | split on the clear sequence | split on the clear sequence |

Bubble Tea and Ink both expose the model's `View()` / render output directly,
which is cheaper than capturing a stream — use it, and keep the width matrix
identical.

**A framework with its own headless driver: use the driver, not the StringIO.**
Textual's `async with App().run_test(size=(cols, rows)) as pilot:` runs the real
mount, layout, compositor and key handling, then `pilot.press("down")` and
`app.screen` / an export give you the frame. That is the framework's own pty
equivalent, and it beats a hand-rolled stream because a framework app does not
read the terminal the way a hand-rolled ANSI app does. It still counts as
`captured`, and the width matrix does not change: `size=` is the loop variable.

**What a layout framework does and does not buy you.** It owns the frame, so
lines do not spill and a long footer cannot displace everything under it — the
§3 corruption mode is genuinely gone. It does **not** stop content from being
silently *clipped*: a stock footer that clips rather than wraps hides the last
key entirely, and a fixed-height `Static` drops the tail of a sentence with no
marker. So the assertion changes shape rather than disappearing — stop measuring
line length, start asserting that **each thing that must be visible is present in
the frame**, by name, at every width:

```python
for cols in (60, 80, 100, 120):
    frame = await capture(cols)
    for label in ("quit", "pause stream", "copy path"):
        assert label in frame, "%r not visible at %d cols" % (label, cols)
```

A framework migration retires the overflow check and inherits a clipping check.
It never retires the matrix.
