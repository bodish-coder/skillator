---
name: skillator-design-arwen
description: >-
  Ultimate UI/UX design skill for native AND web apps — design, redesign, shape,
  critique, polish, or elevate an interface so it ships production-grade AND
  carries a unique, ownable signature nobody would call "AI-made". Use whenever
  the user wants to build or improve a UI/UX: a web page/app/component, an iOS or
  Android screen, a React Native app, a dashboard, landing page, form, onboarding,
  empty state, or design system; or asks to make something "more unique / bolder /
  more polished / less generic / more memorable", pick fonts/colors/layout/motion,
  fix visual hierarchy or spacing, add a signature element, or make one design
  language work across native and web. Fuses production craft (contrast, type,
  layout, motion, interaction, a11y, native platform conventions), a committed
  distinctive aesthetic, and a method for forging one ownable signature element.
  For an existing app it can convene a 2–3 expert (SME) design panel to diagnose it,
  reconcile their opinions into one design route, then implement that route via subagents.
  NOT for backend-only or non-UI tasks.
user-invocable: true
argument-hint: "[design|redesign|polish|critique|signature|adapt] [target]"
license: MIT
---

# Arwen — signature design for native & web

Two failure modes kill interfaces. **Generic**: technically fine, instantly
forgettable, unmistakably AI-made. **Broken**: distinctive but unshippable —
fails contrast, ignores platform conventions, breaks on a real device. Arwen
refuses both. Every surface it touches ships **production-grade** *and* carries
**one unmistakable signature** — an ownable device someone remembers and could
not have guessed from the category alone.

It treats **web, iOS, Android, and React Native as equal citizens** — one design
identity, expressed idiomatically per platform, never lowest-common-denominator.
No setup, no scripts.

---

## Phase 0 — Orient (30 seconds, no ceremony)

1. **Platform(s).** Web / iOS / Android / React Native / cross-platform. Decides
   which conventions in §5 are law. Ask once if unclear.
2. **Register — this changes the rules below, so decide it first:**
   - **Brand** (marketing, landing, campaign, portfolio → design *is* the product):
     identity leads, be bolder, distinctive fonts mandatory, orchestrated motion allowed.
   - **Product** (app UI, dashboard, tool → design *serves* the product): usability
     leads. Its slop test isn't "looks AI-made" (familiarity is a *feature* here) —
     it's "would a user fluent in Linear/Figma/Notion/Stripe *trust* this, or pause
     at every subtly-off component?" **Register deltas for product:** familiar system
     sans (Inter, SF Pro, `system-ui`) is *permitted and often right* — this is the
     one explicit exception to the distinctive-font rule; use a **fixed rem type
     scale** (ratio 1.125–1.2), not fluid `clamp()`; motion is **150–250ms, state-only,
     no page-load show**; accent color reserved for primary action / current selection
     / state — never decoration; "modal as first thought" is a ban (exhaust inline &
     progressive disclosure first).
3. **What already exists.** Read current tokens/theme/one screen. Reuse a working
   system; branch out only where UX wins. **Identity-preservation beats novelty** —
   all the reflex-reject/ban lists below apply to *new* choices only; an existing
   committed brand wins.

Write **one physical-scene sentence**: *who* uses this, *where*, under *what light*,
in *what mood* ("a line cook glancing at a splattered tablet mid-rush"). If it
doesn't force your theme/density/contrast, add detail until it does. Prevents 80% of generic output.

---

## Phase R — Expert panel & design resolution (redesigning an existing app)

Use this when the task is to critique / redesign / elevate an app that **already
exists**. One opinion is a guess; a small panel of SME lenses, reconciled into a
single route, is a decision.

1. **Gather evidence first.** Identify the in-scope surfaces and capture what's
   *really* there — screenshots (drive the browser / run the screen), the key
   screens' code, tokens, plus the Phase 0 register/platform read. The panel
   critiques reality, not a description.
2. **Convene 2–3 experts — distinct lenses, not clones.** Pick the ones the app
   needs and dispatch each as a **subagent** (Agent tool) briefed with the evidence,
   arwen's doctrine, and *its lens only*:
   - **Visual / brand director** — aesthetic direction, signature, type & color, hierarchy.
   - **UX & interaction / a11y lead** — flows, the 8 states, focus/forms, cognitive load, empty/error.
   - **Native platform specialist** — HIG / Material 3 / RN idioms (include when native).
   - **Product / growth strategist** — conversion, activation, information scent (brand/marketing).
   Require each to return, structured: **top 3–5 problems** (ranked, naming the offending
   surface), a **proposed design route** (direction + the one signature it would forge), and
   its **non-negotiables vs nice-to-haves**. Run them concurrently — they're independent. Diverse
   lenses beat N identical reviewers; optionally give the visual seat a more creative model, the
   a11y seat a more rigorous one.
3. **Resolve to ONE route — reconcile, don't average.** Where the panel agrees =
   strong signal, act on it. Where it conflicts, decide with a one-line rationale
   (in *product* register usability outranks flourish; in *brand* register identity
   outranks safety). Output: the chosen **direction**, the single **signature**, and a
   **ranked change list** (what · why · which surface).
4. **Confirm the route (one screen), then build.** Present the resolution and let the
   user correct it before any code — this gate is cheap, a wrong route is expensive, and
   their correction is the highest-value input. (Skip only if they said "just do it".)

The resolved route now **IS** your Phase 1–2 direction + signature — carry it into the craft rules below.

---

## Phase 1 — Commit to a direction (no timid middles)

Pick **one** aesthetic lane and execute with precision. Bold maximalism and refined
minimalism both win — the enemy is the evenly-hedged middle. Match the lane to the
domain: daily-use tools default dense-quiet-scannable; portfolios/campaigns/games can
be expressive. Never force a landing-page hero onto a tool.

**Name a real reference before committing** — "Klim-style specimen", "Vercel pure-black
monochrome", "1970s terminal manual". Unnamed ambition collapses into beige.

**Color strategy** (choose *before* colors), on the commitment axis:
Restrained (tinted neutrals + one accent ≤10%) · Committed (one saturated color 30–60%) ·
Full palette (3–4 named roles) · Drenched (the surface *is* the color).
Use **OKLCH**. Tint neutrals 0.005–0.015 toward the brand hue — never default-warm.
Keep the palette multi-dimensional — a UI drowned in one hue family reads uncommitted.
Modular type scale **≥1.25 ratio** (flat ~1.1 reads timid) — except product UI (above).

**Font selection is where generic dies.** Procedure: (1) write three *physical-object*
voice words ("warm and mechanical and opinionated", not "modern"); (2) list the fonts you'd
reach for by reflex and **reject any on the ban list**; (3) pick the font-as-object from a
real catalog (museum caption, diner receipt); (4) if the final pick matches your reflex,
start over. Pair on a *contrast* axis (serif+sans, geometric+humanist) or one family across
weights — never two near-identical sans.
**Reflex-reject font ban (new/brand choices):** Inter, Roboto, Arial, DM Sans, DM Serif,
Outfit, Plus Jakarta, Instrument Sans/Serif, Space Grotesk, Space Mono, Syne, IBM Plex,
Fraunces, Newsreader, Lora, Crimson, Playfair Display, Cormorant.

**Category-reflex check (two altitudes):** *First-order* — could someone guess your
theme+palette from the **category alone**? Rework. *Second-order* — could they guess it
from **category + the obvious anti-reference** ("AI tool that's *not* SaaS-cream →
editorial-typographic"; "fintech that's *not* navy-gold → terminal-dark")? Rework until
neither is guessable. **Named reflex-reject lane to avoid unless the brief literally
requires it: "editorial-typographic"** — italic display serif + small mono labels + ruled
rules + monochrome, no imagery. It's now its own cliché.

**Avoid the 2026 AI body-bg default:** cream/sand/beige (OKLCH L 0.84–0.97, C<0.06, hue
40–100) — regardless of the token name. Carry warmth via accent + type + imagery.

---

## Phase 2 — Forge the signature (the heart of this skill)

The **one ownable device** that makes the interface unmistakable — what someone
describes recounting your product from memory. One idea, applied with discipline; not
decoration everywhere. Method:

1. **Source it from the domain's truth, not its clichés.** A real property of what the
   product *is/does*, made visible. Transit app → line-and-node route vocabulary. Writing
   tool → the caret, margin, manuscript. Mine the *thing*, not competitors.
2. **Pick ONE carrier:** a type move · a spatial move (asymmetry/overlap/grid-break) · a
   motion move (one transition the whole app rhymes with) · a material (recurring
   texture/edge/shadow language) · or a reimagined component archetype. Two signatures = none.
3. **Make it systematic.** Same logic on hero, empty state, error, loading — so it reads as
   *language*, not accident. It flexes to fit what it marks; appears once = gimmick, appears
   everywhere identically = wallpaper.
4. **Test:** cover the logo — can someone still tell two screens are the same product? Would
   a competitor's screenshot pass for yours? Iterate until the first is yes and the second no.

State the signature in one sentence before building. Everything downstream serves it.

---

## Phase 3 — Cross-platform identity (when it ships more than once)

One identity, **idiomatic per platform** — never a web layout stuffed into a phone.
- **Shared (travels everywhere):** palette, type *personality*, the signature, motion
  character, spacing rhythm, voice/copy.
- **Divergent (obeys the platform):** navigation model, control shapes, gestures,
  transitions, density, safe-area/status handling. An iOS tab bar and a web top-nav are
  *the same identity making different correct choices*.
- **Tokens are the bridge.** Name the theme + pin the font pairing, then define
  color/space/type/radius/motion as platform-agnostic tokens mapped to: CSS variables (web),
  Asset colors + Dynamic Type (iOS), theme resources (Android), a JS theme object (RN).

---

## Phase 4 — Craft rules (production-grade, non-negotiable)

### Color & type
- **Contrast is law:** body ≥4.5:1, large text (≥18px / bold ≥14px) ≥3:1, placeholders
  4.5:1. #1 AI failure = muted gray body on tinted near-white — push toward ink if close.
- Gray on colored bg looks washed out → use a darker shade of the bg's own hue, or a
  transparency of the text color. Light text on dark: **add 0.05–0.1 line-height**.
- Body line length 65–75ch. Brand heroes: clamp() max ≤6rem, letter-spacing floor ≥ -0.04em,
  `text-wrap: balance` on h1–h3 / `pretty` on prose. Respect Dynamic Type on native.

### Layout & space
- Vary spacing for rhythm — uniform spacing reads as a wireframe.
- **Cards are the lazy answer** — nested cards always wrong; identical icon+heading+text grids
  are slop. Flex for 1D, Grid for 2D; responsive grid `repeat(auto-fit, minmax(280px,1fr))`.
  Semantic z-index scale, never 999/9999.
- **Give boards/grids/toolbars/tiles fixed dimensions** so they don't shift when labels or
  hover states appear (design-time CLS). Test heading copy at every width — overflow is a bug.

### Interaction (the a11y-critical part most AI code skips)
- **Design all eight states:** default, hover, focus, active, disabled, loading, error,
  success. **Hover ≠ focus** — keyboard users never see hover.
- **Never `outline:none` without a replacement.** Use `:focus-visible`; ring ≥3:1 contrast,
  2–3px, offset *outside*, consistent everywhere.
- Forms: **placeholders are not labels** (ship a visible `<label>`); **validate on blur**,
  not per-keystroke; errors *below* the field wired via `aria-describedby`.
- **Undo beats confirmation** — remove immediately + undo toast; reserve confirm dialogs for
  truly irreversible/batch actions. Optimistic updates only for low-stakes (never payments).
- Menus/tooltips/modals → **Popover API / native `<dialog>`** (light-dismiss, correct
  stacking, focus trap, Escape for free; `inert` the background). Fixes the #1 generated bug:
  a `position:absolute` dropdown clipped by an `overflow:hidden/auto` ancestor.
- **Roving tabindex** for tabs/menus/radio groups + skip links. **Gestures are invisible** —
  never gesture-only; hint via partial reveal / coach mark and always a visible fallback.

### Motion
- Intentional, designed in from the start. One orchestrated entrance (staggered) beats
  scattered micro-interactions (brand only — product motion is state-only, §0).
- Ease-out exponential (quart/quint/expo); no bounce/elastic. **Reduced motion mandatory** —
  every animation needs a `prefers-reduced-motion` / Reduce Motion fallback (crossfade/instant).
- Reveals **enhance an already-visible default** — never gate content visibility on a
  transition (never fires on hidden tabs / headless renders → ships blank).

### Delight — earn it
- **Budget:** each moment <1s, skippable, subtle, never delays core function. **Vary
  responses** (not the same animation every time); it must still please on the 100th view.
- Confetti only for real milestones; default success = checkmark-draw or gentle scale+fade.
- **Loading-message ban** (instant AI tell): "Herding pixels", "Teaching robots to dance".
  Write messages specific to what the product does ("Syncing your team's changes…").
- Match copy personality to brand (a bank can be warm, not wacky); **never playful during a
  critical error.** Reward non-visual users too (alt-text wit, a console message).

### Backgrounds & imagery
- Depth over flat fills: gradient mesh, grain/noise, geometric pattern, layered transparency,
  dramatic shadow — matched to the lane, never decorative-by-reflex.
- **Imagery is mandatory when the brief implies it** (restaurant/hotel/travel/fashion): zero
  images is a bug, colored `<div>` placeholders are worse than stock. Unsplash
  `https://images.unsplash.com/photo-{id}?auto=format&fit=crop&w=1600&q=80` — **verify each
  ID resolves** (guessed IDs 404), search the physical object not the category, alt = brand voice.

### Performance is design (perceived quality)
- **LCP < 2.5s:** preload the hero image + critical font; the largest paint must not hang off a
  JS-loaded chain. **CLS < 0.1:** explicit width/height or `aspect-ratio` on all media, reserve
  space for injected content. Ship right-sized modern formats (WebP/AVIF), not oversized PNGs.
  `async`/`defer` head scripts. Fonts pulled via JS/CSS-import are late-discovered — preload,
  avoid swap reflow.

---

## Phase 5 — Native & framework conventions (first-class)

Obey the platform's grammar; break it only with intent, only where the signature demands, never
breaking accessibility. Touch targets ≥44×44pt (iOS) / 48×48dp (Android); respect safe areas,
notches, keyboard insets.

- **iOS (HIG):** nav/tab bars, sheets + grabber, SF Symbols, Dynamic Type, large-title→inline,
  haptics for meaningful moments, native back-swipe. Blur/vibrancy is idiomatic here.
- **Android (Material 3):** top app bar + FAB, nav bar/rail, Material You dynamic color, tonal
  elevation, ripple, predictive back, edge-to-edge with insets. Don't ship an iOS layout on Android.
- **React Native:** `expo-image`, `Pressable` over `TouchableOpacity`, native stack/tabs, native
  modals/menus, `StyleSheet.create`/Nativewind, custom fonts via Expo config plugin. **60fps:**
  animate only `transform`/`opacity` via Reanimated (`useDerivedValue` for computed), `Gesture.Tap`
  for animated presses. **Lists = #1 jank source:** FlashList + memoized items + hoisted styles +
  item-types. Footguns: never falsy `&&` render (stray `0`), wrap all text in `<Text>`, `onLayout` not `measure()`.
- **Web:** semantic HTML, keyboard nav + visible focus, responsive from 320px, `prefers-*` media.
- **View Transitions (web/React):** declare *what* with `<ViewTransition>`, trigger *when* via
  `startTransition`/`Suspense` (never call `startViewTransition` yourself); set `default="none"` and
  enable only intended triggers. Directional slide only for hierarchical (list→detail) or ordered
  nav; **tab-to-tab fades, not slides**. Shared-element morph = same unique `name` (`photo-${id}`).

---

## Phase 6 — Push past limits (when the brief earns it)

**Propose 2–3 directions and get an explicit pick before building** — ambition misfires most.
Context defines "extraordinary": a particle system dazzles on a portfolio and embarrasses on a
settings page; for functional UI the wow is how it *feels* (a dialog morphing from its trigger, a
100k-row table at 60fps). Tools: **View Transitions** (shared-element morph), **`@starting-style`**
(animate `display:none`→visible in CSS), **scroll-driven** `animation-timeline: scroll()` (+ static
fallback), **`@property`** (make gradients/colors animatable), **virtual scrolling** for huge lists.
**Progressive enhancement is non-negotiable** — gate with `@supports`, fall back WebGPU→WebGL2→CSS,
the un-enhanced experience still good. **Removal test:** take the effect away — if nobody notices, it
wasn't earning its place. Never layer competing wow moments; focus makes impact, excess makes noise.

---

## Phase B — Build it out with subagents

Once the route is resolved and the craft rules (§4–6) are set, implement via
subagents rather than one linear pass — especially for a multi-surface redesign.

- **Slice by surface/workflow.** One subagent owns one screen/flow/component end to end.
- **Brief every agent identically on the shared system** — the resolved direction, the
  signature and its rules, the tokens, and the arwen craft + ship-gate bar. Independently
  built surfaces drifting apart is *the* failure mode; the shared brief is what keeps them one product.
- **Isolate parallel file edits.** Agents touching the same tree concurrently → give each a
  git worktree (`isolation`) so they don't collide; otherwise sequence them.
- **Walking skeleton first.** One surface fully to spec (built, verified, signature present)
  proves the route before you pour breadth into it. Then widen.
- **Each agent runs its own ship gate (§7) and returns evidence** (a real render / screenshot),
  not a claim. You reconcile, check cross-surface consistency, and relay.

---

## Phase 7 — Slop test & ship gate

**Absolute bans (match-and-refuse — restructure instead):** side-stripe accent borders
(`border-left/right` >1px on cards/alerts) · gradient text (`background-clip:text`) · glassmorphism
as a default · the hero-metric template · identical card grids · tiny uppercase tracked eyebrow on
every section · numbered section markers (01/02/03) as default scaffolding · purple-gradient-on-white ·
the same font every generation. If someone could say "AI made that" without doubt (brand register), it failed.

**Ship gate — verify, don't assume:**
1. Contrast checked on real text/bg pairs. 2. No overflow at every width/device. 3. Reduced-motion
path works. 4. Loading/empty/error/success all designed. 5. Native: conventions honored, safe areas +
targets correct. 6. LCP/CLS within budget. 7. **Drive it for real** — screenshot the browser / run the
screen; not done until *seen* rendering. 8. Signature present and systematic (Phase 2 test passes).

---

## Compose with these skills (delegate, don't duplicate)

- **Charts / graphs / KPI tiles / dashboards / series colors → `dataviz`.** It owns the validated
  light+dark chart palette and mark/axis/legend rules. Don't restate them here.
- **Poster / cover / print / static art object (90% visual) → `canvas-design`.**
- **"Audit / profile my page's performance" → `web-perf`** (Chrome-DevTools workflow). Arwen carries
  the design-time perf rules above; web-perf runs the measured audit.
- **Quick named theme for a static deck/report → `theme-factory`.** (Not for app design systems —
  arwen's token guidance is stronger.)
- **Deep React/RN implementation → the Vercel skills:** `vercel-react-view-transitions`,
  `vercel-react-native-skills`, `vercel-composition-patterns` (compound components + variant
  components over boolean-prop sprawl).

---

## Principles that carry the whole skill

- **Signature over decoration.** One ownable idea with discipline > effects everywhere.
- **Production-grade AND distinctive — never trade one for the other.**
- **Register rules everything.** Brand rewards boldness; product rewards trust. Same craft, different dial.
- **Native and web are peers.** One identity, idiomatic expression.
- **Diverse critique, single route.** A 2–3 expert panel sees what one lens misses; reconcile to one route, then build it — never ship a committee.
- **Commit, then prove it.** Timid middles read as AI; evidence (contrast, breakpoints, reduced-motion, a real render) beats claims.
