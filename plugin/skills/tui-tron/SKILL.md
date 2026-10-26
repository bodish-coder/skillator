---
name: tui-tron
description: >-
  Use when a terminal UI's rendering is the subject: a TUI, curses, Textual,
  Rich, Ink or bare-ANSI screen that must be proven to draw — "wrong in a
  narrow terminal", "the footer wraps", "columns stop lining up at 80", "it
  redraws garbage", "the box characters are mojibake", "ΓöÇ" — or there is no
  pty to drive it: no tmux, stdin closed, winpty ASSERT_CONDITION. NOT for a
  web or native GUI — that is `a11y-toph` and `design-arwen`.
---

# tui-tron — a terminal UI is proven by capturing frames, at every width

```
NO RENDERING CLAIM WITHOUT A CAPTURED FRAME AT EVERY WIDTH IN THE MATRIX
```

A TUI defect is a **frame**, not an opinion about source code. A TUI fix is
**the same frame, re-captured, now inside the window**. Reading the render
function and concluding "the columns line up" is the failure this skill exists
to delete — an agent builds a TUI at whatever width its own harness reports,
never sees another one, and ships a screen that is corrupt in every narrower
terminal on earth.

Everything here binds `PRACTICE.md` §4 (the captured frame *is* the failing
test — record it before you touch a line) and §5 (the evidence gate,
unchanged). The shared design floor is `../references/anti-slop.md`, then
`../../references/anti-slop.md`; neither resolves → say so in one line. It
governs web surfaces, so the part that reaches a TUI is its colour and
decoration bans — do not restate them here.

---

## 1. Scope — and the lines against `run`, `design-arwen`, `a11y-toph`

| | Owns | Hands here |
|---|---|---|
| `run` | launching the app so a human can see it | the moment a TUI is on screen — launch proves it starts, never that it draws |
| `design-arwen` | what the screen should look like — hierarchy, colour, wayfinding | a layout that must survive a width it was not designed at |
| `a11y-toph` | the same evidence law, for a browser | nothing. Different surface, no overlap |
| **`tui-tron`** | **that the frame fits the terminal, in every terminal** | a fix needing a design decision → back to arwen |

**Route here, not to `run`:** the ask is whether the screen is *correct*, not
whether the process starts. `run` ends at "it launched"; this begins there.

**Hand back to arwen** the moment the fix is a design call — the screen genuinely
needs four columns and 60 has room for two, the wayfinding dies when the path is
elided. Report the failing width and the constraint; do not redesign a screen
inside a rendering audit.

---

## 2. Driving it when there is no pty

A TUI reads keys from a terminal. Three ways to give it one, in order. The
mechanics — commands, the capture class, key injection, frame splitting — are in
**[references/capture.md](references/capture.md)**.

**1. tmux — the happy path.** A real pty at a size you choose, keys sent in,
frames read out. `tmux new-session -d -x 80 -y 24`, `send-keys`, `capture-pane
-p`. Use it whenever it exists; nothing below is as good.

**2. winpty / ConPTY on Windows.** Often absent, and when the harness has no
terminal size to hand it, it dies at startup with

```
ASSERT_CONDITION("wp != nullptr && cols > 0 && rows > 0")
```

**That is a terminal state, not a flake.** There is no size to retry with. Do
not loop on it, do not add a sleep, do not try a different wrapper. Record it
and drop to 3.

**3. The tty-shaped capture.** No pty at all: shape one. Subclass `io.StringIO`
with `isatty()` returning `True`, bind it to `sys.stdout`, set `COLUMNS` and
`LINES`, monkeypatch the app's key reader to an iterator of the keystrokes you
want, and split the captured text on the clear-screen sequence to get one frame
per redraw.

This is worth doing because it drives **the real tty code paths** — the glyph
branch, carriage-return progress lines, width padding, every function that asks
`isatty()` — none of which a plain redirect reaches.

**All four parts, or it is a different word.** Monkeypatching
`get_terminal_size` and calling `screen()` yourself is *not* this. With no
`isatty()` the app takes the non-tty branch; with no injected key reader its loop
never runs, so every screen reachable only by a keystroke goes unrendered and
every frame you measured came from the branch you were not testing. That is
`rendered`, not `captured` (§6).

**It is not a human looking at a console, and it never becomes one.** It proves
the bytes the app emits; it proves nothing about what a font, a codepage or a
terminal emulator does with them. §6 fixes the wording so this can never be
reported as "ran it".

---

## 3. The width matrix — this is the point

Render **every screen** at **60, 80, 100 and 120 columns**. Strip ANSI with
`r"\033\[[0-9;?]*[A-Za-z]"`, then assert no line exceeds the width:

```python
for ln in re.sub(r"\033\[[0-9;?]*[A-Za-z]", "", captured).splitlines():
    assert len(ln) <= cols, "overflow at %d cols: %r" % (cols, ln[:70])
```

Every screen, and every state of every screen a keystroke can reach — a
cursor position that selects a longer row is a different frame. 60 is not
pedantry; it is a split pane, and a split pane is where half your users are.

**A known deployment width adds a column to the matrix. It never subtracts
one.** A fleet fixed at 120×40 by its image means 120 joins 60/80/100/120 as a
fifth check, not that the first two stop mattering: fleets get re-imaged,
tablets get replaced by laptops, and somebody opens it over ssh in a tmux pane
the week after you ship. The loop iteration you save by trusting the guarantee
costs less than the guarantee is worth.

**A wrapped line is not cosmetic.** In a full-redraw TUI every line after the
wrap is displaced, so one long footer corrupts the rest of the frame and the
next redraw paints over the wreckage. "It will just wrap" is the rationalization,
not the finding.

### The four causes, and their fixes

| Cause | Looks like | Fix |
|---|---|---|
| A right-aligned path padded to "at least one space" | `pad = w - len(title) - len(right)` then `" " * max(pad, 1)` — the guard stops a crash and lets the line overflow instead | **Elide the path from the LEFT.** The tail identifies the thing; the drive letter does not. `…` + the last *n*−1 characters |
| Hardcoded column widths | `"%-6s  %-34s  %s"` — fine at the author's terminal, 63 characters at 60 | **Derive the columns from the width.** Budget from `w`, give the flexible column the remainder, truncate to it |
| The footer key row | six key/label pairs concatenated, ~86 visible characters | **Drop the low-priority note before wrapping the keys**; still too narrow → split the keys across two rows. Never let them spill |
| A fixed prose sentence | one hand-written line, 89 characters, wider than the window at 60 *and* 80 | **`textwrap` it** to `w - indent`, and render the list it returns |

**All four fixes are mechanical — none of them is a design call.** Eliding from
the left, deriving the columns from the width, dropping the note before wrapping
the keys, and `textwrap`ing the prose each preserve the content and the
hierarchy exactly as written. They belong in your fix list whoever wrote the
line and however long ago. Hand back to arwen only on a real conflict: the
screen needs more columns than the width has, or eliding costs the wayfinding.
"That one would be a design call" about any of these four is the rationalization
in §5, not a routing decision.

`_w()`, `_head`, `_foot`, `_fit`, `_tail` and `_wrap` in `harpix.py` are a
working implementation of all four; the width block in its `selftest()` is the
assertion.

---

## 4. Glyph fallback

**Every non-ASCII glyph needs an ASCII twin, chosen once at startup.** Detect
whether the stream can encode it — on Windows, whether
`sys.stdout.reconfigure(encoding="utf-8")` succeeds — and rebind the whole glyph
set if it cannot. `│ ─ · › ⏎ …` become `| - * > enter ...`.

**Never fix mojibake by deleting the glyph.** Replacing `─` with `-` everywhere
does clear the Toughbook's garbage, and it also downgrades every modern terminal
permanently, forever, for a codepage nobody will be running in two years. Two
paths, chosen at startup. One path is a downgrade, not a fallback.

**The check is an assertion that the fallback path emits no codepoint above
127** — force the ASCII glyph set, capture a frame, strip the colour escapes,
and fail on anything over 127:

```python
bad = [c for c in re.sub(r"\033\[[0-9;]*m", "", captured) if ord(c) > 127]
assert not bad, "ascii fallback leaked %r" % bad[:5]
```

The assertion is the point, not the glyph table. A separator `·` or an ellipsis
`…` gets hardcoded into a new screen three weeks later — inline, not through the
glyph set — and silently breaks a cp1252 console again. A table of glyphs does
not catch that. Capturing the fallback frame and scanning every character does.

---

## 5. The evidence gate

| Claim | Requires | Not sufficient |
|---|---|---|
| The screen renders correctly | A captured frame at all four widths, ANSI stripped, longest line printed | It looked right at the default width |
| The columns line up | The frames, at 60 | The format string has the right field widths |
| Narrow terminals are fine | The 60-column frame | "It will wrap", "it degrades gracefully" |
| The ASCII fallback works | The fallback frame, scanned, no codepoint > 127 | The glyph constants are all ASCII now |
| A keystroke path is correct | That path's frame, reached by injected keys | The handler looks right |
| The fix is complete | The whole matrix re-captured — every screen, every width | The reported symptom is gone |

### Rationalizations, from the baseline runs

| It said | Reality |
|---|---|
| "In a narrow split pane the footer will simply wrap to a second line — not a crash, just a cosmetic wrap" | A wrap displaces every line under it and corrupts the frame on redraw. Capture it at 60 and look. |
| "That overflow is pre-existing; this ticket does not make it worse" | The unit is the screen, not the diff. You are the last person who will render it before it ships. |
| "The tech lead said don't build a test harness for a three-line data change" | Deadlines and leads shorten the **fix list**. They never shorten the **check list**. Capture first, then bring them the frame. |
| "The terminal I/O loop is unchanged by this ticket, so risk there is unchanged" | Data changed; the loop renders data. The bug reachable only by arrow-keying to the new row is exactly the one you skipped. |
| "I exercised the string-building functions and stripped ANSI to inspect the rows" | At one width. One width is the width you already knew worked. |
| "No locale detection, no dual-codepath rendering — just swap the fancy characters for ASCII" | That is a downgrade for every user, to fix a minority's console. Two paths, chosen at startup. |
| "A reviewer can run `python -c 'import portpick; ...'` to confirm it stays fixed" | A check that lives in a review comment runs zero times. §7. |
| "There's no tty here, so `tui()` can't be exercised end to end" | §2.3. A `StringIO` with `isatty()` true and an injected key iterator drives it. |
| "Verified with the selftest and by inspecting the rendered rows" | "Verified" with no width named is the word doing the work. §6. |
| "I monkeypatched `get_terminal_size` and called `screen()`/`foot()` directly — that's a tty-shaped capture" | It is `rendered` (§6). No `isatty()`, no injected keys: the non-tty branch is what you measured, and no screen behind a keystroke was drawn at all. Four parts or a different word. |
| "Fixing it means a design call — elide-from-left on the path, textwrap on the prose — out of scope for this ticket" | Those are two of the four mechanical fixes in §3. Naming the fix and then calling it a design call is how a corrupt frame ships with a paper trail. |
| "I confirmed it via a throwaway width-matrix capture, not committed" | Then it protects nothing past this hour. The sweep you ran is the assertion you leave. §7. |
| "I added the assertion for the footer and the row I touched" | Narrower than the sweep you just ran, for no reason but the diff. Quarantine the failures by name and keep every screen in. §7. |
| "The console is hardware-fixed at 120×40 with no resize path — that's a real environmental guarantee, not a rationalization from your table" | Then 120 joins the matrix; it does not replace it. Every fixed fleet is fixed until the refresh, and 60 costs one loop iteration. §3. |
| "I quarantined the new footer overflow, attributed to this ticket" | You put your own regression in the waiver list. Inherited failures go in it; the one you just caused gets fixed. §7. |
| "The screen needs more columns than 60 has, so per your own routing this is a design call for arwen" | Not when the fix is one of §3's four. Dropping a low-priority key or splitting the row costs no design decision, and arwen is not a queue for work you would rather not do tonight. |
| "We moved to Textual so the framework owns reflow — that was the point of the migration; we don't hand-check layout any more" | It owns the *frame*, so nothing spills or cascades. It does not stop a stock footer clipping your last key out of existence at 60. The matrix survives the migration; the assertion changes from line length to "is this still visible". |

**Red flags — stop and capture something:** writing "renders correctly",
"looks right", "the columns align" · a rendering verdict with no width in it ·
"it will just wrap" / "degrades gracefully" / "cosmetic" · "pre-existing, not my
change" · dropping the check because someone senior called the change small ·
deciding the loop is unreachable instead of shaping a tty · re-capturing only
the screen you touched · calling the render functions and writing `captured` ·
naming one of §3's four fixes and then calling it a design call · "throwaway,
not committed" · leaving behind an assertion narrower than the sweep you ran ·
"that width cannot happen in the field" · writing your own new overflow into
the quarantine list · routing a mechanical fix to arwen at 30 minutes to ship.

---

## 6. Saying what you actually did

Every rendering claim carries its capture mode, in one of these four words:

```
ran        a human watched it in a real terminal emulator
tmux       driven in a real pty under tmux; frames from capture-pane
captured   tty-shaped capture, all four parts — the app's own loop, driven
           by injected keys, through a stdout that reports isatty() true
rendered   the render functions called directly; the loop never ran, the
           non-tty branch is what you measured
read       source only. Not a rendering claim. Report it as unverified.
```

`captured` is never written as `ran`, never as "verified in a terminal", never
as "I ran the TUI". It is a strong proof of emitted bytes and no proof at all of
a font, a codepage or an emulator. `rendered` is never written as `captured` —
the gap between them is every screen behind a keystroke. State which one you did,
then the widths, then the finding:

```
Scope: list, detail, clean · captured (no tmux on this host) · 60/80/100/120

60   detail.py:41 — header path overflows by 4. Right-align pads to max(pad,1).
     Frame: "  portpick   …\telemetry\imu-highrate-capture.log" = 64 cols.
60   detail.py:29 — footer key row 86 visible cols, all six keys on one line.
60   list.py:18   — "%-34s" description column; COM11 row = 63 cols.
80   list.py:22   — fixed prose line, 89 cols. Also overflows at 60.
ok   100, 120 — all screens, all cursor positions, within the window.

Not checked: a real terminal emulator, any Windows codepage other than the
ASCII-fallback path, terminals narrower than 60.
```

**The "not checked" line is mandatory.** A capture that hides what it could not
reach is how a green report and a corrupt screen coexist.

---

## 7. The deliverable is an assertion, not a script

The width sweep and the ASCII-fallback scan go **into the project's own test
suite or `selftest()`** — the thing CI already runs — as assertions that fail
loudly with the offending line in the message.

A width check in a scratch file is a check that runs once. It catches today's
overflow and none of the ones added next week, which is the entire population of
overflows you are trying to prevent. The same is true of a `python -c` one-liner
in a review comment, a snippet in the PR description, and a file in `/tmp`.

**The assertion sweeps the whole screen set, not the part your ticket touched.**
Persisting a check over just the two elements you edited — while the sweep you
actually ran covered every screen — throws away the coverage at the moment it
would start earning its keep, and the next overflow lands on the line next to it.

Screens still failing that you are not fixing stay **inside** the assertion,
quarantined by name:

```python
KNOWN_OVERFLOW = {            # each one a filed ticket, never a silent waiver
    (60, "prose"): 89,        # S-24: fixed sentence, needs textwrap
    (60, "row:COM11"): 61,    # S-25: "%-34s" hardcoded column
}
```

Assert against the recorded number: a line that is longer than its entry fails,
and a line with no entry fails at all. Then the quarantine shrinks as tickets
land, and a new overflow cannot hide behind an old one. A screen dropped from the
sweep is a screen nobody will ever check again; a screen in the list is one
somebody has to delete a line to ignore.

**The quarantine holds failures you inherited, never one you just caused.** An
overflow your own change introduced is a regression, and it gets fixed before
you ship — at any width, under any deadline, whatever the deployment is
supposed to be. Writing your own new entry into the list turns the mechanism
into the waiver it exists to prevent, and it does it with an audit trail that
reads like diligence.

Then verify red-green (`PRACTICE.md` §5): revert one fix, watch that width fail,
restore it. An assertion nobody has watched fail has never proven it can catch
anything.

## Related

- `PRACTICE.md` §4-5 — the captured-frame-as-test law and the evidence gate
- [references/capture.md](references/capture.md) — tmux, winpty, and the tty-shaped capture
- `run` — launches the app; hands here the moment a TUI is drawing
- `skillator:design-arwen` — owns what the screen should look like (§1)
- `skillator:a11y-toph` — the same law for a browser surface
