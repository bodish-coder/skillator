# Patterns — the contract each widget owes, and how generated code breaks it

Use this when a sweep finding needs a fix and you are about to invent the
markup. Each row is: **prefer the native thing** · the keyboard contract a user
expects · the name/role/value the accessibility tree must show · the failure
that actually ships.

**First rule of ARIA: don't.** A native element beats a `div` with a role every
time — it brings focusability, activation, form participation, disabled
semantics, and platform AT quirks already solved. ARIA adds *semantics only*: it
never adds behaviour. `role="button"` on a div does not make Space activate it,
does not put it in the tab order, and `aria-disabled` does not stop the click.

**Second rule: no ARIA is better than bad ARIA.** A wrong role hides the real
one. `aria-hidden` on something focusable creates a stop that announces nothing.

---

## The state attributes, once

| Attribute | On | Must flip when | Common bug |
|---|---|---|---|
| `aria-expanded` | the **trigger**, never the panel | the panel opens/closes | set on the panel; or never updated |
| `aria-controls` | the trigger | — | points at an id that only exists while open |
| `aria-selected` | tab / option | selection moves | used on buttons that aren't in a tablist |
| `aria-checked` | checkbox / radio / switch (custom only) | toggled | on a native `<input>`, which manages its own |
| `aria-pressed` | a genuine toggle button | pressed state | used where `aria-expanded` was meant |
| `aria-current` | the active nav item / page | navigation | replaced by a colour-only "active" class |
| `aria-invalid` | the field | validation fails | set on the wrapper `div` |
| `aria-describedby` | the field | — | points at an error node that is removed when valid, leaving a dangling id |
| `aria-busy` | the region being replaced | fetch starts/ends | omitted, so the region announces partial content |

---

## Disclosure / accordion

Native: `<details><summary>` — free keyboard, free state, free AT. Reach for a
button only when you need animation or controlled state.

- **Keys:** Enter and Space toggle. No arrow keys (that's a menu).
- **Tree:** `button` · name from its text · `aria-expanded` true/false.
- **Ships broken as:** a `div` with `onClick`; `aria-expanded` on the panel;
  the panel unmounted while `aria-controls` still references it; the chevron
  `<img>` carrying `alt="chevron-down.svg"`.

## Modal / dialog / drawer

Native: `<dialog>` with `showModal()` — focus trap, Escape, backdrop, and
top-layer stacking for free.

- **Keys:** focus moves in on open (to the dialog or its first control), Tab
  cycles inside, Escape closes, focus returns to the trigger.
- **Tree:** `dialog` · `aria-modal="true"` · a name via `aria-labelledby` on the
  title.
- **Ships broken as:** a `div` overlay with the page behind it still tabbable —
  use `inert` on the background (`aria-hidden` alone leaves it mouse-clickable);
  focus dumped on `<body>` when it closes; Escape unhandled; nested overlays that
  restore focus to the wrong trigger.

## Tabs

- **Keys:** Tab enters the tablist **once** (roving `tabindex`: the active tab is
  `0`, the rest `-1`); ←/→ move between tabs, Home/End to the ends; Tab from the
  tab goes to the panel.
- **Tree:** `tablist` > `tab` (`aria-selected`, `aria-controls`) and
  `tabpanel` (`aria-labelledby`, `tabindex="0"` if it scrolls).
- **Ships broken as:** every tab a separate tab stop with no arrow support;
  `aria-selected` never set; the panel not associated, so its content reads as
  unrelated page text.

## Select / combobox

Native `<select>` unless the design genuinely needs typeahead or rich options.
A custom combobox is the single most-failed widget in generated UI — read
[WAI-ARIA APG combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
before writing one.

- **Keys:** ↓ opens and moves, ↑ moves, Enter selects, Escape closes without
  selecting, typing filters, Home/End, and focus stays on the input while
  `aria-activedescendant` points at the highlighted option.
- **Tree:** `combobox` (`aria-expanded`, `aria-controls`, `aria-activedescendant`)
  + `listbox` > `option` (`aria-selected`).
- **Ships broken as:** a **button that cycles values on click** — no way to know
  the options exist, no way to jump to one, and the change is never announced;
  a div list where options are unreachable by keyboard; the open list rendered in
  a portal so the focus order jumps to the end of the document.

## Toggle switch / checkbox / radio

Native `<input type="checkbox">` styled with `appearance: none` beats
`role="switch"` on a div.

- **Keys:** Space toggles. Radios: arrows move *and* select within the group.
- **Tree:** `switch`/`checkbox` · a name that is not just the word "Toggle" ·
  `aria-checked` tracking state.
- **Ships broken as:** the label not associated (`<label for>` or wrapping), so
  the hit area is the 20px control instead of the whole row; state carried only
  by a CSS class; a disabled switch with a 1.4:1 label.

## Menu (application menu, not navigation)

`role="menu"` is for application commands. A list of links is a `<nav>` with
`<ul>`, and using `menu` roles there breaks link semantics.

- **Keys:** Enter/Space/↓ opens and focuses the first item; ↑↓ move; Escape
  closes and restores focus; typing jumps to a matching item.
- **Ships broken as:** hover-only opening (fails keyboard *and* SC 1.4.13);
  items as `div`s; no roving `tabindex`.

## Tooltip vs popover

- **Tooltip:** short text, no interactive content, tied to the trigger with
  `aria-describedby`, shown on **hover *and* focus**, dismissible with Escape
  while the pointer stays put (SC 1.4.13). Never the only carrier of information.
- **Popover:** anything with a control inside. That is a dialog or a disclosure —
  give it real focus management, not `:hover`.
- **Ships broken as:** `.host:hover .tip` with no `:focus-within` and no Escape;
  a `?` trigger shrunk to 18px (a target-size failure introduced *by* the a11y
  fix); `title=""` as the whole mechanism.

## Toast / status / async results

- **Structure:** the live region exists **empty in the DOM at load**; the message
  is written into it. A region created together with its message announces
  nothing (see [checks.md §5](checks.md#5-live-regions)).
- **Urgency:** `role="status"` (polite) for results, saves, counts; `role="alert"`
  (assertive) for errors and destructive outcomes only.
- **Timing:** a toast that auto-dismisses must last long enough to be read and be
  dismissible (SC 2.2.1); its close button is a real focusable button.
- **Ships broken as:** `aria-live` on the results container, so every re-render
  and every spinner frame re-announces; a toast rendered in a portal with no live
  region at all; a loading spinner with no `aria-busy` and no text.

## Form validation

- Error text sits **below the field**, is tied by `aria-describedby`, and the
  field carries `aria-invalid="true"`.
- The message says what to do, not just what is wrong, and never relies on colour
  or an icon alone — include the word.
- Validate on blur and on submit, not per keystroke (per-keystroke `aria-live`
  chatter is its own failure).
- On a failed submit, move focus to the first invalid field, or to an error
  summary (`role="alert"`, focusable, links to each field).
- Required fields marked in text or `required`, not by a red asterisk alone.

## Data table

- Real `<table>` with `<th scope="col|row">` and a `<caption>`. A grid of divs
  loses every navigation shortcut AT users rely on.
- Sortable header: a `<button>` inside the `<th>`, with `aria-sort` on the `th`.
- Row actions revealed on hover fail keyboard — keep them present, or reveal on
  `:focus-within` too, and keep the target size (checks.md §11).
- Selection count and filter results go in a `role="status"`, not just the header.

## Drag and drop / reorder / slider

Every pointer path needs a keyboard path (SC 2.1.1) and a single-pointer
alternative (SC 2.5.1): move-up/move-down buttons or a "move to position"
control beside the drag handle; a native `<input type="range">` instead of a
custom slider; arrow-key nudging on a canvas. Announce the outcome in a
`role="status"` — "Moved *Item* to position 3 of 8".

## Skip link and page structure

One `<a href="#main" class="skip">` as the first focusable element, visible on
focus, landing on `<main tabindex="-1">`. One `<h1>`, no skipped levels, `<nav>`
labelled where there is more than one, and a `<title>` (and focus target) that
changes on client-side route changes — SPA route changes announce nothing by
default, which is invisible in every screenshot.

---

## Sources worth opening

- WAI-ARIA Authoring Practices (APG) — the reference implementation per widget
- MDN ARIA docs — attribute-level detail
- WebAIM's articles on links vs buttons, alt text, and form validation

Neither replaces the sweep: a copied APG pattern still fails in situ, and
[checks.md](checks.md) is how you find out.
