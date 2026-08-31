# Craft rules — production-grade, non-negotiable

Read by `build`, `redesign`, and `improve`. `critique` reads it as the checklist.
These are the floor. The direction and signature (SKILL.md Phase 1–2) are what
you spend creativity on; none of this is where you get inventive.

---

## Color & type

- **Contrast is law:** body ≥4.5:1, large text (≥18px / bold ≥14px) ≥3:1, placeholders
  4.5:1 (not the muted-gray default). The #1 AI failure is muted gray body text on a
  tinted near-white — if it's even close, push toward the ink end of the ramp. Light
  gray "for elegance" is the single biggest reason AI designs are hard to read.
- Gray on a colored bg looks washed out → use a darker shade of the bg's own hue, or a
  transparency of the text color. Light text on dark: **add 0.05–0.1 line-height**.
- Body line length 65–75ch. Brand heroes: `clamp()` max ≤6rem (~96px) — above that the
  page is shouting, not designing. Display letter-spacing floor ≥ -0.04em (tighter and
  letters touch: cramped, not "designed").
- `text-wrap: balance` on h1–h3, `pretty` on long prose. Respect Dynamic Type on native.
- Don't pair two near-identical faces (two geometric sans, two humanist sans). Pair on a
  contrast axis, or one family across weights.

## Layout & space

- Vary spacing for rhythm — uniform spacing reads as a wireframe.
- **Cards are the lazy answer.** Use them only when genuinely the best affordance;
  nested cards are always wrong; identical icon+heading+text grids are slop.
- Flex for 1D, Grid for 2D — don't default to Grid when `flex-wrap` is simpler.
  Responsive grid without breakpoints: `repeat(auto-fit, minmax(280px, 1fr))`.
- Semantic z-index scale (dropdown → sticky → modal-backdrop → modal → toast → tooltip).
  Never 999 or 9999.
- **Give boards / grids / toolbars / tiles fixed dimensions** so they don't shift when
  labels or hover states appear (design-time CLS).
- Test heading copy at every width — overflow is a bug, not a rendering quirk. The
  viewport is part of the design.
- **Vary the section rhythm.** A page where every section is centered-heading +
  three-column-grid is one layout repeated, not a design. Alternate: asymmetric split,
  full-bleed, offset image, list, editorial column.

## Interaction (the a11y-critical part most AI code skips)

- **Design all eight states:** default, hover, focus, active, disabled, loading, error,
  success. **Hover ≠ focus** — keyboard users never see hover.
- **Never `outline: none` without a replacement.** Use `:focus-visible`; ring ≥3:1
  contrast, 2–3px, offset *outside*, consistent everywhere.
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
  and always ship a visible fallback.

## Motion

- Intentional, designed in from the start — not a layer added at the end.
- One orchestrated entrance (staggered) beats scattered micro-interactions. **Brand
  register only** — product motion is state-only, 150–250ms, no page-load show.
- Ease-out exponential (quart / quint / expo). No bounce, no elastic.
- Don't animate layout properties unless truly needed. Premium motion is not only
  transform/opacity: blur, `backdrop-filter`, `clip-path`, mask, and shadow/glow are part
  of the palette when they materially improve the effect and stay smooth.
- **Reduced motion is mandatory** — every animation needs a `prefers-reduced-motion` /
  Reduce Motion fallback (crossfade or instant).
- **Reveals enhance an already-visible default.** Never gate content visibility on a
  class-triggered transition: transitions pause on hidden tabs and headless renderers, so
  the reveal never fires and the section ships blank.
- Staggering items *within one list* is legitimate. The tell is the uniform reflex — one
  identical entrance applied to every section. Suppressing the reflex is never a reason to
  ship a page with zero motion.
- **Forbidden:** parallax on body text · scroll-jacking · anything that delays first
  meaningful paint · a spinner where a skeleton or optimistic state belongs.
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

- Depth over flat fills: gradient mesh, grain/noise, geometric pattern, layered
  transparency, dramatic shadow — matched to the lane, never decorative-by-reflex.
- **Imagery is mandatory when the brief implies it** (restaurant, hotel, travel, fashion,
  product). Zero images is a bug; colored `<div>` placeholders are worse than stock.
  Unsplash `https://images.unsplash.com/photo-{id}?auto=format&fit=crop&w=1600&q=80` —
  **verify each ID resolves** (guessed IDs 404). Search the physical object, not the
  category. Alt text in brand voice.
- Icons: one set, consistently (Lucide, Phosphor, Heroicons, SF Symbols, Material
  Symbols). Never mix sets, never emoji as iconography.

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
- **Each element does exactly one job.** A label labels, an example demonstrates, nothing
  quietly does double duty.
- **Never ship placeholder content as if it were real** — no "Jane Doe", no lorem, no
  `example.com`, no fake logos, no invented metrics. **No em-dashes in UI copy**; use a
  period, a comma, or a colon.

## Native & framework conventions (first-class)

Obey the platform's grammar; break it only with intent, only where the signature demands,
never breaking accessibility. Touch targets ≥44×44pt (iOS) / 48×48dp (Android); respect
safe areas, notches, keyboard insets.

- **iOS (HIG):** nav/tab bars, sheets with grabber, SF Symbols, Dynamic Type, large-title
  → inline, haptics for meaningful moments, native back-swipe. Blur/vibrancy is idiomatic
  here (and only here).
- **Android (Material 3):** top app bar + FAB, nav bar/rail, Material You dynamic color,
  tonal elevation, ripple, predictive back, edge-to-edge with insets. Don't ship an iOS
  layout on Android.
- **React Native:** `expo-image`, `Pressable` over `TouchableOpacity`, native stack/tabs,
  native modals/menus, `StyleSheet.create` or Nativewind, custom fonts via Expo config
  plugin. **60fps:** animate only `transform`/`opacity` via Reanimated (`useDerivedValue`
  for computed), `Gesture.Tap` for animated presses. **Lists are the #1 jank source:**
  FlashList + memoized items + hoisted styles + item types. Footguns: never falsy `&&`
  render (stray `0`), wrap all text in `<Text>`, `onLayout` not `measure()`.
- **Web:** semantic HTML, keyboard nav + visible focus, responsive from 320px,
  `prefers-*` media queries honored.
- **View Transitions (web/React):** declare *what* with `<ViewTransition>`, trigger *when*
  via `startTransition`/`Suspense` (never call `startViewTransition` yourself); set
  `default="none"` and enable only intended triggers. Directional slide only for
  hierarchical (list→detail) or ordered nav; **tab-to-tab fades, not slides**.
  Shared-element morph = same unique `name` (`photo-${id}`).

## Push past limits (only when the brief earns it)

**Propose 2–3 directions and get an explicit pick before building** — ambition misfires
most. Context defines "extraordinary": a particle system dazzles on a portfolio and
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
