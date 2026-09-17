# terminal.md — designing for the terminal (CLI · TUI · tmux)

The terminal is a platform like iOS or the web, and Phase 3 treats it as one: the
identity is shared, the material is not. Read this when the surface is a
command-line tool, a full-screen terminal app, or a line in someone's status bar.

**Phases 0–2 transfer unchanged.** The Read line, the dials, committing to a
direction, and forging a signature all work here exactly as written — a terminal
tool has a register, an audience and a scene like anything else. Do not re-derive
them and do not soften them because the medium is text. What changes is only what
the material can carry.

---

## 1. The material

**A cell grid, not a canvas.** Position is integer columns and rows. There is no
sub-pixel, no fractional spacing, no arbitrary radius. The spacing rhythm from
Phase 2 survives as *cell counts* — a 2/4/8 rhythm becomes 1/2/4 cells — and
anything that relied on fine spacing has to be re-expressed as alignment,
grouping, or blank lines.

**You do not own the font.** The reader's terminal picks it, and they may have
chosen it for reasons you cannot see. So type *personality* — arwen's usual
carrier of identity — is unavailable. There is no scale, no pairing, no weight
axis beyond what SGR gives you: bold, dim, italic (often unsupported), underline,
reverse. Identity has to move somewhere else.

**Where identity actually lives here**, in rough order of strength:

1. **Glyph vocabulary** — the small set of marks the tool reuses everywhere.
2. **Density and rhythm** — how much breathes, what groups, where the rules fall.
3. **Colour** — as accent and state, never as the sole carrier (§2).
4. **Alignment grammar** — what is right-aligned, what is elided, what is fixed.
5. **Copy voice** — terse, active, lowercase or not; a terminal reads copy closely.

## 2. Three capability axes, all read from the stream

Colour, glyphs and width are **independent**. A stream can be a 24-bit-colour
terminal that cannot encode `─`, or a 200-column pipe that must not receive a
single escape byte. Design for each separately and let each degrade on its own.

**Decide every one from the stream, never from the environment.** Environment
variables describe a terminal that may not be on the other end of your output. On
a real machine this session, `TERM=xterm-256color` and `COLORTERM=truecolor` while
`sys.stdout.isatty()` was `False` and `stdout.encoding` was `cp1252` — all three
signals disagreeing at once. A tool that picks its tier from `TERM` writes
truecolor escapes into a pipe.

| Axis | Tiers | Decide from |
|---|---|---|
| **Colour** | none · 16 ANSI · 256 · truecolor | `isatty()` first; then `NO_COLOR` (set, any value, wins), `TERM=dumb`, then `COLORTERM`/`TERM`. Offer an explicit `--color=always/never/auto` |
| **Glyph** | unicode · ASCII twin | whether the stream's encoding can actually encode the glyph set — try it, don't infer it |
| **Width** | the number of columns you were given | the stream's reported size, with a sane default; never a constant |

**The signature must survive tier collapse.** Whatever carries identity has to
still read at the bottom of all three ladders: no colour, ASCII glyphs, 60
columns. If the design dies there, it was decoration. State in particular is
**glyph + colour + word, always all three** — that is one rule serving both the
colour-blind reader and the monochrome pipe, and it is why it is not optional.

**Every non-ASCII glyph is chosen with its ASCII twin at startup.** `skillator:tui-proof`
§4 owns this rule and the assertion that proves it; do not restate it here. Two
points belong to *design*: pick the twin when you pick the glyph, so the fallback
is a considered mark rather than a substitution someone makes later in a hurry —
and never "fix" an encoding problem by deleting the glyph for everyone.

## 3. The three surfaces have different contracts

They are as different from each other as a web page is from a watch face. One
identity, three correct expressions.

**Declare the narrowest width you support, and lay out to it.** 60 columns is the
usual floor — a split pane. That number is a *design* decision and it is made here,
not later: every column budget is derived from it, every fixed-width field is checked
against it, and prose is wrapped to it. A layout that reads the terminal width and
then draws a constant-width table has not used the number it fetched. When there is
no terminal — a pipe — you are choosing a fixed default instead, and that default is
still bounded by the floor.

**The floor binds the longest line, on every surface.** Not the rule, not the
border — the longest *rendered* line. A divider is the one element whose width you
can see at a glance, so it is the element that gets clamped, and the data row that
overruns it by two cells is the one that ships. A format string like
`"%s  %-16s %-6s %-12s %s %s"` has a width: add it up and check it against the floor,
because nothing else will.

Measure each surface separately and list them so none is skipped — the one-shot
report, the full-screen frame, the status line, `--help`, and the error paths. The
surface you are thinking about while you fix the floor is the one that ends up
correct; the others are where the overflow lives.

**CLI — one-shot, line-oriented, someone else's input.** Its output is data:
greppable, pipeable, pasteable. Stable column order, one record per line where
that is plausible. **stdout is the data, stderr is the narration** — progress,
warnings and spinners go to stderr so a pipe stays clean. Not a tty means no
colour, no cursor control, no spinner, no clear. Exit codes are part of the
design. `--help` is a designed surface, not a dump: the common path first, the
full list behind `--help --all`.

**TUI — full-screen, redraw, yours until you exit.** Use the alternate screen
buffer (`\033[?1049h` / `\033[?1049l`) so the user's scrollback is returned to
them intact; hide the cursor and restore it in a `finally`, always. Every screen
needs visible focus, a key hint row, and an answer for the narrowest width you
support. Motion is state-change only: a redraw tick, a progress line rewritten
with `\r`. No continuous animation — it burns a CPU core and wrecks a shared
tmux pane.

**tmux status — one line in a bar you do not own.** It is never a tty, so colour
comes from tmux's own `#[fg=...]` format, not raw SGR, and plain text is the
correct fallback. You get a tight, shared, unpredictable budget: design the
*compressed* form first — counts and marks, not sentences — and make it
truncate from the least important end. It is refreshed on tmux's interval, so it
must be cheap and must never block.

## 4. What you own, and what `tui-proof` owns

Arwen designs it; **`skillator:tui-proof` proves it renders** — the width matrix
across every surface, the ASCII-fallback scan, and the capture rig for hosts with
no pty. Hand over at the ship gate rather than eyeballing one terminal.

**Delegating the proof does not delegate the constraint.** Naming tui-proof is not a
substitute for choosing a width behaviour: a layout with no answer at its own declared
floor is unfinished before tui-proof is ever invoked, and shipping it because the
matrix "belongs to the other skill" is how an overflowing design passes a ship gate.
Fitting the floor is yours. Proving it across the matrix, on every surface and at
every cursor position, is theirs.

Three failures from this skill's own test runs, each from designing a terminal
tool without these rules, each worth recognising on sight:

- A single hardcoded glyph set with the encoding "fixed" by reconfiguring stdout.
  It works until the stream is a pipe or a legacy console, and then the tool's
  state grammar is mojibake. One glyph tier is a bug, not a choice.
- Width discipline applied to the full-screen surface only, while the one-shot
  CLI overflowed at 60 columns. **Every surface gets the matrix**, including the
  one that looks like plain text.
- The floor applied to the dividers and not the rows: `min(width, 60)` on every
  rule, while the row format summed to 62 and overran each one by two cells at
  every width. The report surface was clean and the dashboard was not, because
  only the report had been measured.

## Related

- `references/craft.md` — the production rules the terminal inherits (colour
  meaning, copy, motion policy); this file overrides only where the material differs
- `skillator:tui-proof` — proves the frame fits, at every width, with no pty
