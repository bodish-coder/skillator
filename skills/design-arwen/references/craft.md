# Craft rules — production-grade, non-negotiable

Read by `build`, `redesign`, and `improve`. `critique` reads it as the checklist.
These are the floor. The direction and signature (SKILL.md Phase 1–2) are what
you spend creativity on; none of this is where you get inventive.

---

## Color & type

- **Contrast is law:** body ≥4.5:1, placeholders 4.5:1 (not the muted-gray default),
  large text ≥3:1 — and **large means ≥24px, or ≥18.67px bold**. WCAG defines it as 18pt
  / 14pt bold and a CSS px is 3/4 of a pt; "18px / 14px" is a unit slip that lets a 20px
  muted subline pass at 3:1 when it needs 4.5:1. The #1 AI failure is muted gray body
  text on a tinted near-white — if it's even close, push toward the ink end of the ramp.
  Light gray "for elegance" is the single biggest reason AI designs are hard to read.
- Gray on a colored bg looks washed out → use a darker shade of the bg's own hue.
  **Explicit colours over chains of translucent overlays**: an alpha-stacked token has no
  contrast until it knows what is under it, so the static check in verify.md cannot pass
  it. OKLCH ramps drop chroma near white and near black.
- **Light text on dark compensates on three axes:** +0.05–0.1 line-height, a touch more
  tracking, one step more weight. Over a blurred or translucent surface, no flat gray
  text: higher contrast, slightly heavier weight, measured against the worst content that
  scrolls beneath it (verify.md).
- **Dark mode is designed, not inverted.** Lighter, desaturated tonal variants; surface
  elevation stated explicitly; contrast re-checked in that theme on its own.
- Body line length 65–75ch; serif body can run to 75ch and wants ~+0.05 more line-height
  than a sans. Brand heroes: `clamp()` max ≤6rem (~96px) — above that the page is
  shouting, not designing.
- **Tracking and leading track size.** Line-height per scale step, tight on display and
  loose on body — never one global value. Display letter-spacing floor ≥ -0.04em (tighter
  and letters touch); small text and all-caps get slightly *positive* tracking.
- `text-wrap: balance` on h1–h3, `pretty` on long prose. Respect Dynamic Type on native.
- Don't pair two near-identical faces (two geometric sans, two humanist sans). Pair on a
  contrast axis, or one family across weights. **Two families is the ceiling**; a mono
  face earns a place only for literal code, IDs or machine strings, and is recorded under
  `Deliberate:` in DESIGN.md. Numeric columns align with `tabular-nums`, not with mono.
- Theme the small surfaces from the palette: `::selection`, `caret-color`,
  `text-underline-offset`, the focus ring. Custom scrollbars: brand register only —
  product UI keeps the platform's.

## Layout & space

- Vary spacing for rhythm — uniform spacing reads as a wireframe. **More space above a
  heading than below it** — the heading belongs to what follows; read the computed margins.
- Spacing in `rem`/`em`, not fixed px, so layout scales with the text (the cause behind
  most 200%-zoom failures in gate item 7).
- **Cards are the lazy answer.** Use them only when genuinely the best affordance;
  nested cards are always wrong; identical icon+heading+text grids are slop.
- **Radius and elevation are tiered by hierarchy.** One radius on everything and one soft
  grey shadow on every raised thing is the SaaS kit, not a system. A shadow has an offset
  and a soft blur; a zero-offset coloured halo is decoration.
- **Every rule, border and divider separates something the reader needs separated.**
  Removal test: take it away — if nothing merges that should not, it goes.
- Flex for 1D, Grid for 2D — don't default to Grid when `flex-wrap` is simpler.
  Responsive grid without breakpoints: `repeat(auto-fit, minmax(280px, 1fr))`.
- Semantic z-index scale (dropdown → sticky → modal-backdrop → modal → toast → tooltip).
  Never 999 or 9999.
- **Give boards / grids / toolbars / tiles fixed dimensions** so they don't shift when
  labels or hover states appear (design-time CLS).
- Test heading copy at every width — overflow is a bug, not a rendering quirk. The
  viewport is part of the design. The fix for a long token (URL, ID, filename) is
  `overflow-wrap: anywhere` plus `min-width: 0` on the flex/grid child that holds it —
  never `word-break: break-all` on prose.
- Full-height heroes and sheets use `100dvh` / `min-height: 100dvh`, not `100vh` — on a
  phone `100vh` puts the CTA under the URL bar.
- **Vary the section rhythm.** A page where every section is centered-heading +
  three-column-grid is one layout repeated, not a design. Alternate: asymmetric split,
  full-bleed, offset image, list, editorial column.

## Interaction (the a11y-critical part most AI code skips)

- **Design all eight states:** default, hover, focus, active, disabled, loading, error,
  success. **Hover ≠ focus** — keyboard users never see hover. Gate hover styles behind
  `@media (hover: hover)`; `(hover: none)` gets the active state instead, `(pointer:
  coarse)` gets more padding. Sticky hover on a phone is a bug.
- **Press feedback paints within 100ms, on pointer-down** (`:active`), not on release —
  it sits outside the 150–250ms state band. `touch-action: manipulation` removes the
  tap delay; only pay the double-tap delay where a double-tap action exists.
- **Never `outline: none` without a replacement.** Use `:focus-visible`; ring ≥3:1
  contrast, 2–3px, offset *outside*, consistent everywhere.
- **Sticky chrome never hides focus** (WCAG 2.4.11). Every sticky header, toolbar, banner
  or table `thead` you add owes a `scroll-padding-top` (on the page, or on the scroll
  container the sticky element lives in) at least its own height, so a tabbed-to row
  never lands underneath it. Sticky bottom bars owe `scroll-padding-bottom`.
- **Target size, by input:** touch ≥44×44pt (iOS) / 48×48dp (Android) with 8dp between;
  web pointer ≥24×24 CSS px (WCAG 2.5.8, AA) — the floor a dense table's sort buttons,
  row actions and inline links must meet. 44 is the AAA target, right for touch and for
  primary actions; applying it to every web control makes DENSITY 9 impossible, so do not.
- Forms: **placeholders are not labels** (ship a visible `<label>`); **validate on blur**,
  not per-keystroke; errors *below* the field, wired via `aria-describedby`.
- **Undo beats confirmation** — remove immediately + undo toast; reserve confirm dialogs
  for truly irreversible or batch actions. Optimistic updates only for low-stakes state,
  never payments.
- Menus / tooltips / modals → **Popover API or native `<dialog>`** (light-dismiss, correct
  stacking, focus trap, Escape for free; `inert` the background). Fixes the #1 generated
  bug: a `position: absolute` dropdown clipped by an `overflow: hidden/auto` ancestor.
- **Roving tabindex** for tabs / menus / radio groups, plus skip links.
- **Gestures are invisible** — never gesture-only; hint via partial reveal or coach mark,
  and always ship a visible fallback. **Pointer drag counts** (WCAG 2.5.7): every
  sortable list, kanban card, slider or resizable column has a single-pointer and a
  keyboard route (buttons, a menu, arrow keys).
- **Feedback is continuous during a gesture** — a drag, slider or sheet tracks the finger
  1:1 and never animates only on completion. Interrupted gestures clear their state on
  `pointercancel`, `lostpointercapture`, release outside the control and window `blur`; a
  second pointer never hijacks the drag; the drag surface sets `touch-action`. How it
  *feels* is `apple-design`'s; that it cannot get stuck is yours.
- **Every screen answers:** where am I, where can I go, what is here, how do I get out.
  Put a control near what it affects — if it needs a label to explain the mapping, the
  mapping is weak.

## Motion

- Intentional, designed in from the start — not a layer added at the end.
- One orchestrated entrance (staggered) beats scattered micro-interactions. **Brand
  register only** — product motion is state-only, 150–250ms, no page-load show.
- **Durations** (the band `improve` step 10 checks against): press ≤100ms · state
  change 150–250ms · brand routine 150–300ms · overlay or view change 300–500ms ·
  authored brand entrance 500–800ms. **Exit faster than entrance.** A gesture-driven
  spring has no duration — judge it by response (~0.3–0.4s), not by this band.
- Ease-out exponential (quart / quint / expo). **No bounce, no elastic — one exception:**
  a spring released from a momentum gesture (flick, throw, drag release) may overshoot,
  damping ≥0.8, and never under reduced motion. Gesture-driven motion runs on springs,
  not CSS transitions or `@keyframes`; the spring itself is `apple-design`'s.
- **Interruptible, always.** Never lock out input during a transition; a reversed or
  re-triggered animation starts from the current (presentation) value, not the target;
  never make state correct only when `transitionend` / `animationend` fires.
- **Enter and exit along the same path**; a popover or dialog grows from its trigger
  (`transform-origin` at the trigger).
- Hover motion only on things that are actually clickable — a hover lift on every card is
  the kit, not a design.
- Don't animate layout properties unless truly needed. Premium motion is not only
  transform/opacity: blur, `backdrop-filter`, `clip-path`, mask, and shadow/glow are part
  of the palette when they materially improve the effect and stay smooth.
- **Reduced motion is mandatory, and it means fewer and gentler, not none.** Under
  `prefers-reduced-motion: reduce` / Reduce Motion, drop movement (translate, scale,
  parallax, overshoot, loops) and keep what confirms state — a checkmark, a colour change,
  a panel's open/closed — as a short crossfade (≤150ms) or an instant state swap that is
  still visible. A global kill (`*, *::before, *::after { transition-duration: 0.01ms
  !important }` or `transition: none` on everything) fails the gate: it trades a
  vestibular fix for a comprehension bug. Scope the override to the moving properties.
- **Reveals enhance an already-visible default.** Never gate content visibility on a
  class-triggered transition: transitions pause on hidden tabs and headless renderers, so
  the reveal never fires and the section ships blank.
- Staggering items *within one list* is legitimate. The tell is the uniform reflex — one
  identical entrance applied to every section. Suppressing the reflex is never a reason to
  ship a page with zero motion.
- Nonessential loops stop when offscreen or the tab is hidden. Autoplay and auto-advance
  (carousels, tickers) get a pause control and stop on focus and under reduced motion
  (WCAG 2.2.2).
- **Forbidden:** parallax on body text · scroll-jacking · anything that delays first
  meaningful paint · a spinner where a skeleton or optimistic state belongs ·
  **vestibular triggers** — full-viewport moving backgrounds, slow loops near 0.2 Hz (one
  cycle per ~5s), abrupt brightness jumps (ease a dark↔light theme switch).
- Reach for a library when the need is real (motion, GSAP, anime.js, Lenis) rather than
  hand-rolling a timeline.

## Delight — earn it

- **Budget:** each moment <1s, skippable, subtle, never delays core function. **Vary the
  response** (not the identical animation every time); it must still please on the 100th view.
- Confetti only for real milestones. Default success = checkmark-draw or gentle scale+fade.
- **Loading-message ban** (instant AI tell): "Herding pixels", "Teaching robots to dance".
  Write messages specific to what the product does ("Syncing your team's changes…").
- Match copy personality to brand (a bank can be warm, not wacky). **Never playful during
  a critical error.** Reward non-visual users too (alt-text wit, a console message).

## Backgrounds & imagery

- Depth over flat fills: grain/noise, geometric pattern, layered
  transparency, dramatic shadow — matched to the lane, never decorative-by-reflex.
- **Translucent materials** (`backdrop-filter`, vibrancy) are a committed direction on any
  platform, never a default. When they ship: a `prefers-reduced-transparency: reduce`
  fallback that goes frostier or solid, and `prefers-contrast: more` near-solid with a
  defined border; never a light translucent surface on another; contrast measured against
  the worst content beneath (verify.md).
- **Imagery is mandatory when the brief implies it** (restaurant, hotel, travel, fashion,
  product). Zero images is a bug; colored `<div>` placeholders are worse than stock.
  Unsplash `https://images.unsplash.com/photo-{id}?auto=format&fit=crop&w=1600&q=80` —
  **verify each ID resolves** (guessed IDs 404). Search the physical object, not the
  category. Alt text in brand voice.
- Icons: one set, consistently (Lucide, Phosphor, Heroicons, SF Symbols, Material
  Symbols). Never mix sets, never emoji as iconography. A decorative icon beside visible
  text is `aria-hidden="true"`; an icon-only control has an accessible name and, for a
  toggle, its state (`aria-pressed` / `aria-expanded`).

## Performance is design (perceived quality)

- **LCP < 2.5s:** preload the hero image and critical font; the largest paint must not
  hang off a JS-loaded chain. Fonts pulled via JS or `@import` are late-discovered —
  preload them and avoid swap reflow.
- **CLS < 0.1:** explicit `width`/`height` or `aspect-ratio` on all media; reserve space
  for injected content.
- **INP < 200ms.** Ship right-sized modern formats (WebP/AVIF), not oversized PNGs.
  `async` / `defer` on head scripts.
- Animate on the compositor (`transform`, `opacity`); `will-change` only on elements
  actually about to animate, removed after.
- Keep DOM cost sane — a 5000-node landing page is a bug regardless of how it looks.

## UX copy — words are design material

Copy makes a design feel as templated as the layout does. Bring the same intentionality
to it as to spacing and color.

- **Write from the user's side of the screen.** Name things by what people control and
  recognize, never by how the system is built. A person manages notifications, not
  webhook config.
- **Active voice, sentence case, plain verbs.** A control says exactly what happens:
  "Save changes", not "Submit". An action keeps the same name through the whole flow —
  the button that says "Publish" produces a toast that says "Published".
- **Specific beats clever.** Describe what something does; don't sell it.
- **Errors don't apologize and are never vague.** Say what went wrong and how to fix it,
  in the interface's voice. An empty screen is an invitation to act, not a shrug.
- **Name navigation for its contents** ("Invoices", "Library"), not an umbrella ("Home",
  "Hub").
- **Each element does exactly one job.** A label labels, an example demonstrates, nothing
  quietly does double duty.
- **Never ship placeholder content as if it were real** — no "Jane Doe", no lorem, no
  `example.com`, no fake logos, no invented metrics. **No em-dashes in UI copy**; use a
  period, a comma, or a colon.

## Native & framework conventions (first-class)

Obey the platform's grammar; break it only with intent, only where the signature demands,
never breaking accessibility. Touch targets ≥44×44pt (iOS) / 48×48dp (Android) with 8dp
between them (web pointer: 24 CSS px, see Interaction); respect safe areas, notches,
keyboard insets. A tab bar or bottom nav holds at most 5 sections (sections, never
actions), each with a label beside its icon.

- **iOS (HIG):** nav/tab bars, sheets with grabber, SF Symbols, Dynamic Type, large-title
  → inline, haptics for meaningful moments on the same frame as the visual change, native
  back-swipe. Blur/vibrancy is the platform default here; elsewhere it is a direction
  choice (Backgrounds & imagery).
- **Android (Material 3):** top app bar + FAB, nav bar/rail, Material You dynamic color,
  tonal elevation, ripple, predictive back, edge-to-edge with insets, type in `sp`, never
  fixed px. Don't ship an iOS layout on Android.
- **React Native:** `expo-image`, `Pressable` over `TouchableOpacity`, native stack/tabs,
  native modals/menus, `StyleSheet.create` or Nativewind, custom fonts via Expo config
  plugin. **60fps:** animate only `transform`/`opacity` via Reanimated (`useDerivedValue`
  for computed), `Gesture.Tap` for animated presses. **Lists are the #1 jank source:**
  FlashList + memoized items + hoisted styles + item types. Footguns: never falsy `&&`
  render (stray `0`), wrap all text in `<Text>`, `onLayout` not `measure()`.
- **Web:** semantic HTML, headings in sequence (h1→h2→h3, no skipped level — pick the
  level by structure, the size by CSS), keyboard nav + visible focus, responsive from
  320px and in landscape. **Viewport meta is `width=device-width, initial-scale=1` and
  never blocks zoom** — no `user-scalable=no`, no `maximum-scale=1`. `prefers-*` queries
  honored by name: `reduced-motion`, `reduced-transparency`, `contrast`, `color-scheme`.
  Form controls render at ≥16px or iOS Safari zooms the page on focus.
- **View Transitions (web/React):** declare *what* with `<ViewTransition>`, trigger *when*
  via `startTransition`/`Suspense` (never call `startViewTransition` yourself); set
  `default="none"` and enable only intended triggers. Directional slide only for
  hierarchical (list→detail) or ordered nav; **tab-to-tab fades, not slides**.
  Shared-element morph = same unique `name` (`photo-${id}`). After a client-side route
  change, move focus to the new page's `<main>` (or its h1) — otherwise it stays on a link
  that no longer exists.

## Push past limits (only when the brief earns it)

**Propose 2–3 directions and get an explicit pick before building** — ambition misfires
most. No user to pick (subagent, batch run)? Do not propose into the void and do not take
the boldest by default: take the one the register argues for, name the two you rejected
and why in one line each, and carry on.  Context defines "extraordinary": a particle system dazzles on a portfolio and
embarrasses on a settings page. For functional UI the wow is how it *feels* — a dialog
morphing from its trigger, a 100k-row table at 60fps.

Tools: **View Transitions** (shared-element morph) · **`@starting-style`** (animate
`display:none` → visible in CSS) · **scroll-driven** `animation-timeline: scroll()` with a
static fallback · **`@property`** (makes gradients and colors animatable) · **virtual
scrolling** for huge lists.

**Progressive enhancement is non-negotiable** — gate with `@supports`, fall back
WebGPU → WebGL2 → CSS; the un-enhanced experience is still good. **Removal test:** take
the effect away — if nobody notices, it wasn't earning its place. Never layer competing
wow moments; focus makes impact, excess makes noise.
