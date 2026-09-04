---
name: a11y-proof
description: >-
  Use when accessibility is the subject: an a11y or WCAG audit of existing
  code, a VPAT or compliance question, or a reported bug — "can't tab to it",
  "focus ring invisible", "screen reader reads nothing", "the toast never
  announces", "fails contrast", "no reduced-motion", "tap target too small",
  "the error is only red". Also for wiring axe, pa11y or Lighthouse into tests
  or CI. NOT for designing or building an interface — a11y inside a design
  task is design-arwen's ship gate.
---

# a11y-proof — accessibility as the subject, proven by running it

```
NO ACCESSIBILITY CLAIM WITHOUT A RUN CHECK
```

An accessibility finding is a **reproduction**, not an opinion about source code.
An accessibility fix is **the same reproduction, re-run, now passing**. Reading
the JSX and concluding "this is now keyboard-accessible" is the failure this
skill exists to delete — it is exactly what a capable agent does when nobody
stops it, and it is wrong often enough to be worthless.

Everything here binds `PRACTICE.md` §4 (the reproduction *is* the failing test —
record it before you touch a line) and §5 (the evidence gate, unchanged).

---

## 1. Scope — and the line against `design-arwen`

Both skills care about the same floor. They are invoked at different moments and
they own different halves, and neither restates the other's mechanics.

| | `design-arwen` | `a11y-proof` |
|---|---|---|
| **Owns a11y as** | a **gate inside a design task** — a constraint on what it is currently building | a **subject in its own right** — invoked against code nobody is redesigning |
| **Trigger** | build / redesign / improve / critique an interface | audit, compliance question, filed a11y bug, screen-reader report, CI wiring |
| **Surface** | the design it just produced, on the design's terms (states, both themes, the signature) | the whole existing surface, whoever wrote it and however long ago |
| **Output** | a shipped design that passed its gate | ranked findings with reproductions, the minimum fixes, re-run evidence |
| **Changes** | layout, palette, type, component structure — freely | only what accessibility requires — never a redesign |

**Route to arwen, not here:** the work is "build/redesign/improve this UI". Its
ship gate covers a11y for what it writes. Do not run this skill in front of it.

**Route here, not arwen:** the ask names accessibility, a standard, an assistive
technology, or a user who can't operate something. Also when arwen's gate finds
damage wider than the change it made — hand over the failing pairs and stop.

**Hand back to arwen** the moment a fix needs a design decision: the palette
fails contrast at the token level, a state is distinguished by colour alone with
no room for a second signal, the fix costs a layout. Report the failing pairs
and the constraint; do not repaint a product's brand inside an audit.

Adjacent: `sherlock-codes` carries a11y as one lane of a whole-codebase sweep —
it routes here for depth. `web-perf` owns measured vitals.

---

## 2. The evidence gate

Automated tools are the **floor, not the claim**. axe/pa11y/Lighthouse catch the
machine-checkable minority — roughly a third of real defects, and none of the
classes in §3 marked *manual*. "axe: 0 violations" is one line of a report, never
a verdict.

Every finding: **`file:line` + the reproduction** (the exact keystroke sequence,
the measured number, or the tool output). Every fix: **the same reproduction,
re-run**. Every report ends with what you did **not** check.

| Claim | Requires | Not sufficient |
|---|---|---|
| Keyboard accessible | A recorded Tab transcript: every stop, in order, focus visible, nothing trapped, Escape works | The elements are `<button>`s now |
| Contrast passes | Computed colours pulled off the rendered element, ratio printed, per state | Token names, a palette, "roughly 3.3:1", eyeballing |
| Screen reader announces it | The accessibility tree node (role + name + value) or an SR transcript | `aria-label` is present in the source |
| Live region announces | Watched it fire once, with the container in the DOM *before* the message | `aria-live="polite"` is on the div |
| Reduced motion honoured | Emulated `prefers-reduced-motion: reduce`, reloaded, content still visible | A `@media` block exists |
| Touch targets pass | Measured `getBoundingClientRect()` on every interactive element | The component library "handles it" |
| Fix complete | The whole §3 sweep re-run, not just the class you touched | The reported symptom looks addressed |

**Fixes break neighbours — re-sweep, always.** In this skill's own baseline run,
an agent fixing a keyboard bug shrank a help trigger to 18×18px and introduced a
touch-target and a dismissible-content failure while reporting the bug resolved.

### Rationalizations, from the baseline runs

| It said | Reality |
|---|---|
| "Both files look correct." | Correct-looking source has never operated a keyboard. Drive it. |
| "Every control is now reachable via Tab and activates with Enter/Space" — with no browser open | That is a prediction. Tab through it and paste the transcript. |
| "Quick and cheap given the deadline, I'll skip anything not keyboard-specific" | The scope is the sweep in §3. Deadlines shorten the *fix list*, never the *check list*. |
| "It's a disabled control, so contrast isn't strictly required by WCAG" | Exempt from the standard, not from the product. Unreadable disabled text is why users retry a dead button. Measure it and report it. |
| "~3.3:1, borderline, likely fails" | Estimating a ratio you could have computed. Print the number. |
| "Irrelevant once a real `<label>` is added" | You fixed one class by assuming another. Verify both. |
| "There's no dev server, so I can't check" | Then the deliverable is findings marked **unverified**, not a completion claim. Or start the server. |
| "The library is accessible" | Libraries ship a11y bugs, and integration is where they surface. Measure the rendered DOM. |

**Red flags — stop and go run something:** writing "now accessible", "resolved",
"WCAG AA compliant" · a verdict with no numbers in it · a fix report shorter than
its reproduction · "should announce" / "should be focusable" · reporting on
classes you only read for · skipping the re-sweep because the change was small.

---

## 3. The sweep

Run every row. Order matters: static first (cheap, narrows the surface), then
the browser passes, then assistive technology. Depth, exact commands, snippets
and keystrokes: **[references/checks.md](references/checks.md)**. Correct
implementations for the widgets that fail: **[references/patterns.md](references/patterns.md)**.

| # | Class | What actually goes wrong in generated UI | Check |
|---|---|---|---|
| 1 | **Reachability** | `onClick` on a `div`/`span`; a control behind hover; a custom widget with no tab stop | Static grep, then Tab from the top and count stops against the interactive elements |
| 2 | **Traps & order** | Modal without `inert`, focus that escapes behind the overlay, `tabindex` > 0, DOM order ≠ visual order | Tab and Shift+Tab the whole page; dump the focus order; Escape from every overlay *(manual)* |
| 3 | **Visible focus** | `outline: none` with no replacement; a ring that vanishes on a coloured surface; hover styled, focus not | Grep `outline`; then focus each element and diff computed styles; measure ring contrast ≥3:1 |
| 4 | **Name / role / value** | A `<div role="button">` with no name; `aria-expanded` that never updates; a cycling button pretending to be a select | Accessibility-tree dump: every interactive node has role + non-empty name, and value tracks state |
| 5 | **Live regions** | Container injected *with* the message (announces never); a region wrapping a whole list (announces constantly); `alert` used for routine status | Region present at load, `aria-live` correct, watched firing once *(manual)* |
| 6 | **Contrast in unscreenshotted states** | placeholder, disabled, hover, visited, error text, text on the accent button, the ring against both surfaces | Force each state, pull computed colours, compute ratios with alpha resolved. Numbers or it didn't happen |
| 7 | **Motion** | No reduced-motion path; content gated behind a reveal transition ships blank; JS/spring animation ignoring the media query; infinite spinners | Emulate reduce, reload, screenshot; grep for `matchMedia`/`useReducedMotion` in JS animation |
| 8 | **Forms** | Placeholder as label; error not tied by `aria-describedby`; `aria-invalid` missing; colour-only error; focus never moved to the failure; no `autocomplete` | Submit an invalid form for real: name, description, invalidity, announcement, focus |
| 9 | **Headings & landmarks** | A styled `div` acting as a heading; levels skipped; no `<main>`; several `<h1>` | Dump the heading outline and landmark list; compare against what *looks* like a heading |
| 10 | **Images & icons** | `alt` restating the filename; decorative image with alt text; icon-only button with no name; SVG with neither `title` nor `aria-hidden` | Alt audit: flag `alt` matching the `src` basename, empty names on interactive elements |
| 11 | **Target size** | 18–32px icon buttons, table row actions, close buttons, adjacent chips with no spacing | Measure every interactive rect: <44×44 CSS px (or 24 with spacing, WCAG 2.2 AA) is a finding |
| 12 | **Mouse-only** | Hover-only tooltips and menus, drag-only reordering, `title` as the only carrier, custom scroll, gestures with no button | Unplug the mouse. Complete every task by keyboard *(manual)* |
| 13 | **Zoom & reflow** | Fixed heights that clip, `overflow: hidden` on text, two-dimensional scrolling at 400% | 320 CSS px wide (400% zoom) and 200% text-only: no loss, no horizontal scroll |

Then **one assistive-technology pass** on the primary flow — NVDA + Firefox
(Windows) or VoiceOver + Safari (macOS/iOS). The tree dump proves the semantics;
only the AT proves it is usable.

---

## 4. Fixing

1. **Reproduce first, and write it down.** The recorded reproduction is this
   task's failing test (`PRACTICE.md` §4). No reproduction, no fix.
2. **Native element before role before ARIA.** `<button>` beats
   `<div role="button" tabindex="0" onKeyDown>`. ARIA adds semantics, never
   behaviour: it will not make a div focusable, clickable by Space, or
   disableable. Bad ARIA is worse than none.
3. **One class at a time**, then re-run its reproduction. A batch of eight
   simultaneous fixes has no evidence attached to any of them.
4. **Fix the source, not the symptom.** Ten components with no focus ring is one
   token or one base style, not ten patches.
5. **Never fix by removing.** `aria-hidden` on a focusable element, `tabindex="-1"`
   to silence a warning, and deleting the failing control all clear the scanner
   and break the user.
6. **Re-sweep §3 after the fix**, not just the class you touched.
7. **Leave a regression guard** where the project has tests — `jest-axe` /
   `@axe-core/playwright` on the component, plus an explicit keyboard test for
   the behaviour that broke. Verify red-green: revert the fix, watch it fail.

---

## 5. Report

Ranked by user impact, not by rule number. Severity: **blocker** (a task cannot
be completed by some user) · **serious** (completable but degraded) · **minor**
(friction). A scanner's own severity is an input, not the answer.

```
Scope: /reports, /reports/:id · Chrome 141 + axe 4.10 · NVDA 2024.4 not run
Automated: axe 7 violations (3 serious) · pa11y clean · Lighthouse a11y 84

BLOCKER  Filters.jsx:32 — panel toggle is a div, no tab stop.
         Repro: Tab from the search field; focus jumps to Apply, panel unreachable.
BLOCKER  Filters.jsx:61 — validation error never announced; no aria-describedby.
         Repro: submit "ab" with NVDA; silence, focus stays on the button.
SERIOUS  filters.css:9 — .btn:focus{outline:none}, no replacement. All buttons.
         Repro: focused Apply, computed outline "none", box-shadow "none".
SERIOUS  filters.css:11 — disabled label #e8f0f8 on #a8c8e8 = 1.4:1 (measured).
MINOR    Filters.jsx:37 — alt="chevron-down.svg" restates the filename.

Not checked: iOS VoiceOver, Windows High Contrast, the /admin routes (no seed data).
```

**The "not checked" line is mandatory.** An audit that hides its gaps is how a
green report and a broken product coexist.

## Related

- `PRACTICE.md` §4-5 — the reproduction-as-test law and the evidence gate
- [references/checks.md](references/checks.md) — commands, snippets, keystrokes
- [references/patterns.md](references/patterns.md) — the widget contracts
- `skillator:design-arwen` — a11y as a gate inside a design task (§1)
- `skillator:sherlock-codes` — whole-codebase audit; routes here for a11y depth
