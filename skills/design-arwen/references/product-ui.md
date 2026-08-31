# Product UI — the surfaces where real apps actually live

Read this whenever the register is **product** (SKILL.md Phase 0) and the work touches a
form, a table, settings, a multi-step flow, permissions, search, or bulk actions.
[craft.md](craft.md) is the floor for every surface; this file is the grammar for the
specific ones — the patterns that carry an app after the landing page has done its job.

**Why this file exists.** Landing-page craft is well covered everywhere. The surfaces
below are where most product work happens and where generated UI most reliably falls
apart: it renders beautifully with three rows of fake data and collapses at four hundred
real ones, with a German label, on a slow connection, for a user without permission.

**The register still rules.** Everything here assumes product register — usability leads,
familiarity is a feature, the signature (Phase 2) shows up in the *chrome and the moments*
(empty states, transitions, the one component you reimagined), never in the data path.

---

## The scale test — run it before designing any of these

Every surface below gets designed against **four data volumes**, not one:

| Volume | What it proves |
|---|---|
| **Zero** | The empty state is an invitation with an action, not a shrug. |
| **One** | Nothing assumes plurality — no "1 items", no grid that needs three cards to look right. |
| **Typical** | The design you're actually pitching. |
| **Thousands** | Pagination or virtualisation, a real scroll story, no 5,000-node DOM. |

And **three conditions**: loading (skeleton matching the real layout, never a spinner
where content shape is known), error (what broke + what to do, in-place not a toast that
vanishes), and no-permission (the surface explains, it doesn't 404 or show a dead button).

A product surface designed for one volume and one condition is a mockup. **Twelve cells,
every time** — if you only designed the happy typical one, you are not done.

---

## Forms

Forms are where product UI is won or lost, and they are the most-skipped surface in
generated code.

**Structure**
- **One column.** Multi-column forms cause misreads and break on mobile. The only
  legitimate side-by-side pairs are genuinely atomic: city/state, expiry/CVC, first/last.
- **Group by the user's mental model, not the database schema.** If two fields are always
  filled together, they sit together; a fieldset legend beats a floating heading.
- **Ask less.** Every field is a cost. Optional fields that nobody needs are the cheapest
  thing to delete and the most common thing to keep.
- Mark **optional** fields, not required ones, when most are required (and the reverse).
  A form of fifteen asterisks communicates nothing.

**Labels & help**
- A visible `<label>` always. Placeholders are not labels — they vanish on focus, fail
  contrast, and break autofill and screen readers. This is in craft.md and it is still
  the most-violated rule in generated forms.
- Help text sits **above** the input when it changes how you fill it, **below** when it
  clarifies after. Never inside the placeholder.
- Formatting requirements are stated **before** the error, not discovered through it.

**Validation**
- **Validate on blur, never per-keystroke.** Telling someone their email is invalid while
  they type the third character is hostile.
- Re-validate on submit, and **move focus to the first error** with the count announced
  (`aria-live`): "3 fields need attention".
- Errors sit **below the field**, wired with `aria-describedby`, in text — never colour
  alone, never a red border as the only signal.
- **Never clear the form on error.** Never clear a password field on an unrelated error.
  Losing typed input is a data-loss bug, not a styling choice.
- Server errors land on the field that caused them when the server can say which.

**Submission**
- The submit button is **disabled only while in flight**, never as a validation gate — a
  permanently-disabled button with no explanation is the single most frustrating form
  pattern. Let people submit and show them what's wrong.
- Show in-flight state on the button itself (label swap + spinner), keep the width fixed
  so the layout doesn't jump.
- **Double-submit protection** is design, not just engineering: the second click must be
  inert.
- Long forms: save draft state. A tab close that loses twenty minutes of typing is the
  bug people remember.

**Inputs**
- Correct `type`, `inputmode`, `autocomplete` — this is free mobile UX and free autofill.
  `autocomplete="one-time-code"` for OTP, `inputmode="decimal"` for money.
- Native `<select>` beats a custom dropdown until it genuinely can't do the job (search,
  multi-select, rich rows). A custom one owes you: keyboard nav, typeahead, `aria-expanded`,
  Escape, click-outside, and a portal so it isn't clipped.
- Destructive and primary actions are **never adjacent** at the same visual weight.

---

## Data tables

The single most under-designed component in generated product UI.

**Before styling anything, decide:** is this a table, or a list? Tables are for comparing
values across a shared set of columns. If people scan one record at a time, a list or a
card layout reads better and survives mobile.

**Columns**
- Right-align numbers, use **tabular figures** (`font-variant-numeric: tabular-nums`), and
  align decimal points. Left-align text. Never centre either.
- Column widths are **stable across pages** — a table that reflows when page 2 has a longer
  name is broken. Set widths or `table-layout: fixed`.
- Truncate with a tooltip *and* a title attribute, never mid-word wrap in a numeric column.
- The first column identifies the row and stays visible (sticky) when scrolling
  horizontally.
- More than ~7 columns needs a column-visibility control, not a horizontal scrollbar as the
  whole answer.

**Rows**
- Row height stays constant. Content that varies gets truncated or a detail view, not a
  jagged table.
- **Zebra striping is usually the lazy answer** — a 1px row separator and generous cell
  padding reads cleaner. Stripe only when rows are dense and wide.
- Hover highlights the row; the whole row is clickable **only if there is exactly one
  obvious action**, and then a keyboard user needs the same affordance.
- Sticky header, always, past one screen of rows.

**Sorting, filtering, search**
- Sort state is visible on the column (direction arrow + `aria-sort`), and **survives a
  reload** — put it in the URL. Same for filters and page. A shareable table URL is a
  feature people notice.
- Filters show what's applied as removable chips, with a "clear all". A filtered table that
  looks empty must say *why* it's empty: "No results for these filters. Clear filters."
  This is a different empty state from "you have no data yet" — design both.
- Search debounced ~300ms, with a visible in-flight indicator that doesn't move the layout.

**Scale**
- Under ~100 rows: render them. Over: paginate or virtualise. **Say which one you chose and
  why.** Infinite scroll is wrong for tables people need to compare or return to — it
  breaks the back button and makes footers unreachable.
- Show total count. "1–50 of 1,284" tells people where they are; "Page 1" doesn't.

**Bulk actions**
- Checkbox column, a header checkbox with an **indeterminate** state, shift-click for a
  range.
- The action bar appears without shifting the table (reserve its space or overlay it) and
  states the count: "3 selected".
- **Select-all means the page, not the query** — unless you explicitly offer "Select all
  1,284" as a second, separate step. Silently deleting a whole filtered set because someone
  clicked a header checkbox is a catastrophe.
- Bulk destructive actions are the one place a confirm dialog beats undo, and it must name
  the count and the thing: "Delete 47 invoices?"

---

## Settings

- **Organise by what people are trying to change**, not by which service owns the value.
  A settings page mirroring your backend modules is a schema on screen.
- **Save model: pick one and be consistent.** Either auto-save each control with a quiet
  confirmation, or an explicit Save with a dirty-state bar. Mixing them within one page is
  how people lose changes.
- Auto-save needs a visible result — a brief "Saved" near the control, not a toast in the
  far corner. And it needs a failure path: what happens when the save fails and the toggle
  is now lying?
- **Dangerous settings live apart** — a separate section, different treatment, typed
  confirmation for the truly irreversible ones (delete account, rotate keys, transfer
  ownership).
- Show the **effective** value when it's inherited or overridden: "Using the workspace
  default (Weekly)". A toggle that doesn't say where its value came from is a support ticket.
- Search across settings once there is more than one screen of them.
- Every toggle states what happens when it's on, in a label a person would say out loud.

---

## Multi-step flows (onboarding, checkout, wizards)

- **Show where they are and how much is left.** A stepper with real names beats "Step 2 of
  5", which beats nothing.
- **Back must work** — the browser's back button included. A flow that breaks on back is
  broken.
- **Persist between steps.** Going back and forward loses nothing, ever.
- Validate per step, not all at the end. But never block forward motion on something that
  can be fixed later — let people skip and come back where the data genuinely allows it.
- **Ask for the minimum that unblocks the next step.** Everything else belongs in settings
  after activation. The most common onboarding failure is a wall of setup before any value.
- The final step states exactly what happens on confirm, and it is the only step with an
  irreversible action.
- **Exit is always available**, and says what will be kept: "Your progress is saved."
- One step per screen beats a scroll of accordions.

---

## Permissions, roles, and the disabled state

- **A disabled control must say why.** A greyed-out button with no tooltip, no adjacent
  text, and no path forward is the least helpful state in software. Either explain it, or
  don't render it.
- Prefer **explaining over hiding** for capability gaps ("Upgrade to invite teammates") and
  **hiding over explaining** for things a role should never see.
- Design the **read-only** variant of every editable surface. Viewers get a legible page,
  not an editor full of dead inputs.
- Never rely on hidden UI for security — but never show an action that will fail either.
- Permission errors after the fact ("You don't have access to do that") name who can grant
  it.

---

## Notifications, toasts, and feedback

- **Match the message to the surface.** Inline for anything tied to a specific element;
  toast only for background or navigational results; a banner for account-wide state.
- Toasts: bottom-corner, ~4–6s, stack to a max of 3, pause on hover, dismissible, never
  carrying the only copy of important information, and **never the only report of an
  error** the user must act on.
- A toast that says "Something went wrong" is not a design. Say what, and offer the retry
  in the toast.
- **Undo in the toast** beats a confirm dialog for anything reversible — this is craft.md
  policy and it applies hardest here.
- Announce async results to screen readers (`role="status"` / `aria-live="polite"`; assertive
  only for genuine interruptions).

---

## Modals, drawers, and inline editing

- **"Modal as first thought" is banned in product register** (SKILL.md Phase 0). Exhaust
  inline editing, then progressive disclosure, then a drawer, before a modal.
- Reach for each one deliberately: **inline** for a single value · **popover** for a small
  focused choice · **drawer** for a related side-task that keeps context visible · **modal**
  for a genuine interruption that must be resolved · **full page** for anything with more
  than ~7 fields or its own sub-navigation.
- **Never nest modals.** A modal that opens a modal means the flow needed a page.
- Native `<dialog>` or the Popover API — focus trap, Escape, light-dismiss, and correct
  stacking for free (craft.md).
- A modal with unsaved changes confirms before closing — including on Escape and on the
  backdrop click. Otherwise Escape is a data-loss key.

---

## Dashboards

- **Lead with the answer, not the chart.** The number people came for is the largest thing
  on screen; the visualisation supports it.
- Every metric states its **time range and its comparison** ("Last 30 days, vs previous
  30"). A number with no period is decoration.
- **Charts and series colours belong to `dataviz`** — it owns the validated light+dark
  palette and the mark/axis/legend rules. Don't re-derive them here.
- The hero-metric template is banned as a *reflex* (SKILL.md), not as a concept — a big
  number is often right. What's banned is the four-tile gradient-accent scaffold applied
  because dashboards look like that.
- Density is the point (DENSITY 8–10). Airy dashboards waste the screen people chose a
  dashboard to fill.
- Loading: skeletons shaped like the real tiles, and each tile resolves independently — one
  slow query must not block the page.

---

## Internationalisation, RTL, and long strings

Generated UI is designed in English at typical length and breaks everywhere else.

- **Design at +40% string length.** German and Finnish routinely run 30–50% longer than
  English; a nav or button that fits exactly in English is already broken. Test the longest
  real label, not the placeholder.
- **Never concatenate sentences from fragments.** Word order differs; `"Delete " + n + " items"`
  is untranslatable. One string with a parameter.
- **Pluralisation is not `n === 1`.** Use `Intl.PluralRules`; several languages have more
  than two forms and some have none.
- **Dates, numbers, currency, and names go through `Intl`.** Never hand-format. Never assume
  a first-name/last-name split, a fixed name order, or that a name fits in one line.
- **RTL:** use logical properties (`margin-inline-start`, `padding-block`, `inset-inline`)
  rather than left/right throughout — it costs nothing to write and makes RTL a flag rather
  than a rewrite. Mirror directional icons (back, next, indent); **do not** mirror media
  controls, clocks, or logos.
- Line-height and font stacks must handle CJK and Arabic without clipping ascenders or
  diacritics. `lang` attributes set correctly so the right font and hyphenation apply.
- Time zones: display in the user's zone with the zone named where it matters. "Today" and
  "Yesterday" are computed in their zone, not the server's.

---

## The product-UI slop test

Product register's failure mode is not "looks AI-made" — familiarity is a feature here.
It is **"subtly wrong in a way that erodes trust."** Ask:

1. Would a user fluent in Linear / Stripe / Notion / Figma pause at any component here,
   sensing something is off — a focus ring that doesn't match, a dropdown that closes
   wrong, a table that reflows between pages?
2. Does every surface survive the **twelve cells** (four volumes × three conditions)?
3. Does any control lie — a toggle that shows on before the save confirms, a disabled
   button with no reason, a count that doesn't match the filter?
4. Can someone drive the entire surface with a keyboard, and see where they are the whole
   time?
5. Is there exactly **one** save model, one selection model, one empty-state voice across
   the app?

Failing any of these ships a product that *works* and still feels untrustworthy. That is
the specific way product UI fails, and no amount of aesthetic polish repairs it.
