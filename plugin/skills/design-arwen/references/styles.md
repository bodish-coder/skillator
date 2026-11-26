# The style menu — sixteen looks to mock before you commit

Used by SKILL.md Phase 1, [build.md](build.md) §2, [redesign.md](redesign.md) §7 and the
`mock` lane of [improve.md](improve.md). It does not replace Phase 1. It gives the user the
lane choice as something they can see. Each mock commits fully to one style, and the build
uses only the style the user picks.

---

## When to offer it

**Offer it whenever arwen designs a UI that has a mock step**: every `build` and every
`redesign` before the route is confirmed, and `improve` when the user asks for a mock,
mockup, options or "show me some looks". Skip it when:

- **There is no user.** You are a subagent or in a batch run. Pick the best-fit style and
  list it on the `Chose for you:` line.
- **The direction is already pinned.** `DESIGN.md`, an existing design system, a Figma
  file, or a brief that names a style ("make it brutalist"). Say in one line that the style
  was inherited, and do not show the menu.
- **The task is a scoped `improve` pass that did not ask for a mock**, such as polish,
  contrast or copy. A style menu there is scope creep.

## How to ask

All sixteen styles always appear. Never cut the menu down to your favourites. Ask with
`AskUserQuestion`, using **four multi-select questions of four options each**, since the
tool takes at most four options per question. The four groups may be reordered, and styles moved between them, so the styles that fit
the brief come first; mark those `(Recommended)`. Each option's description is the one-line read from the table
below, applied to this brief.

```
Q1 "Which styles should I mock? (1/4)"  Spatial UI · Bento grid · Maximalism · Liquid glass
Q2 "Which styles should I mock? (2/4)"  Glassmorphism · Brutalism · Minimalism · Skeuomorphism
Q3 "Which styles should I mock? (3/4)"  Tactical HUD · Radial reactor HUD · Neon alert · Holo-table console
Q4 "Which styles should I mock? (4/4)"  Cockpit line-art · Bio-holographic · Hard-sci-fi ops panel · Neural network
```

On a host without `AskUserQuestion`, print the sixteen as a numbered list and ask for
numbers. The user picks one or more styles. If they pick nothing, mock your top two
recommendations.

## How to mock them

- **One mock per picked style, on the same surface with the same real content.** The only
  thing that changes between mocks is the style, so the user compares looks and not copy.
  Use the [canvas.md](canvas.md) gate when it is available and put one artboard per style
  side by side, labelled with the style name. With no canvas, publish one HTML page with a
  style switcher, or one page per style.
- **Each mock commits fully.** No mock is a blend of two styles. The style is the Phase 1
  lane, so Phase 1's colour strategy, type and signature are worked out inside each style.
- **Every mock clears ship-gate items 1 and 2**, text contrast and non-text contrast. A
  pretty mock that fails contrast misrepresents what can actually ship.
- **The user picks one style.** If they want to combine two, name which one leads and which
  device comes from the other, then confirm. Record the pick on `DESIGN.md`'s `Read:` line
  as `direction <style>`. Then run round 2 below before building.

## Round 2 — variations inside the chosen style

The style is now fixed, but within it there are many possible layouts. Mock those next,
still before any code. **Every variant stays in the chosen style.** Only one axis changes
at a time, so the user can see what each choice does.

Ask which axes to explore with one multi-select `AskUserQuestion`. Recommend the two axes
this surface depends on most:

| Axis | Variants to mock (2–3 each) |
|---|---|
| **Placement** | Where the main elements sit: nav top, side or bottom; hero or content left, centred or split; primary action inline or floating; the order of sections. |
| **Sizing** | Scale and hierarchy: a large display with compact body, or an even scale; tile or card sizes; spacing that is tight, balanced or airy (the DENSITY dial). |
| **Iconography** | The icon set and its treatment: outline, filled or duotone; stroke weight; icon with label, icon only, or label only; icon size against text. One set per variant, never mixed. |
| **Other** | Colour strategy within the style (Restrained, Committed or Drenched), type pairing, corner radius and shape language, where the signature lands, and light or dark theme. |

- Lay the variants out as a grid on the canvas: one row per axis, each artboard labelled
  with the style, the axis and the variant ("Bento · Placement · nav left").
- The base mock from round 1 is the control in each row, so every variant is compared
  against it.
- The user picks one variant per axis, or says "keep" for the base. Combine the picks into
  one final mock, show it once, and then build it. Log each pick on `DESIGN.md`.
- Skip round 2 when there is no user (pick the base and report it), when the user said "just
  build it", or when the axes are already pinned by `DESIGN.md` or a design system.

## The sixteen

The first eight are the general looks. The last eight are the futuristic (sci-fi HUD) family: dark fields and glowing lines, each with its own shape language, colour and density.

| Style | What it is | Fits | Watch for (a11y and register) |
|---|---|---|---|
| **Spatial UI** | Depth as the layout: layered planes, parallax, z-ordered panels, the visionOS feel. | Immersive consumer, media, product showcases, AR/XR. | Motion sickness, so the reduced-motion path must flatten the planes. Depth cues need a non-motion fallback. Product register clamps MOTION. |
| **Bento grid** | A modular grid of mixed-size tiles, each holding one idea. | Feature overviews, dashboards, portfolios, landing sections. | Every tile carries the same weight, which is arwen's identical-card-grid ban. Size the tiles by importance. Reading order must survive the collapse to one column at 320px. |
| **Maximalism** | Dense, loud and layered: clashing type, bold colour, pattern, collage. | Brand register only: campaigns, fashion, music, events. | Contrast on busy backgrounds. Keep a calm reading path for body text. Never use it in the product register. |
| **Liquid glass** | Apple's 2025 material: refractive, lensing translucent controls that react to what sits under them. | Native-feeling iOS/macOS or web chrome such as toolbars, tab bars and floating controls. | Contrast changes with the content under the glass, so measure against the worst background. Provide a reduced-transparency fallback. Glass on chrome only, not on content. |
| **Glassmorphism** | Frosted `backdrop-filter` blur panels over colourful backgrounds, with a hairline border. | Overlays, cards on rich imagery, consumer dashboards. | It is on the anti-slop floor as a *default*. Here it is a chosen style, which is allowed. Contrast on blur, a solid fallback when `backdrop-filter` is unsupported, and the cost of blur on low-end devices. |
| **Brutalism** | Raw structure: system or mono type, hard borders, visible grid, no polish, sometimes clashing. | Brand register: agencies, editorial, dev tools with attitude. | Raw must still be usable: focus rings, targets and hierarchy all stay. Read `industrial-brutalist-ui` if it is installed. |
| **Minimalism** | Radical reduction: a few elements, generous space, one accent, type-led. | Both registers. Tools, premium products, portfolios. | Turns generic fastest. The signature has to carry everything. Low-contrast grey text is the usual failure. Read `minimalist-ui` if it is installed. |
| **Skeuomorphism** | Real-world materials and affordances: textures, bevels, physical controls. | Audio and creative tools, games, nostalgic or tactile brands. | Contrast on textures. Controls must still look interactive in forced-colors and high-contrast modes. Image weight hurts LCP. |
| **Tactical HUD** | Mission-control readout: near-black slate, hairline grid with lettered and numbered axes, tiny tracked-out mono caps, coordinate and timecode figures, cyan lines with one alarm accent (red diagonal hatching, orange tags) for danger zones. Panels are thin outlined boxes with corner ticks. | Ops and monitoring dashboards, maps and geo tools, drone and fleet tracking, security consoles. | Tiny caps fail contrast and size fast. Keep body text ≥ 12px and 4.5:1, and treat micro-labels as decoration. Hatching must not be the only danger signal: add a word or icon. |
| **Radial reactor HUD** | A big concentric-ring gauge as the focal point: segmented arcs, tick rings, a reticle at centre. Smaller radial dials and bar stacks orbit it. Glowing cyan on black, white figures, one warm accent at the core. | Hero dashboards, system-health and status pages, game menus, a "control centre" landing section. | Radial gauges are slow to read exactly. Pair every arc with its number. Rotating rings must stop under reduced motion. Glow blur lowers edge contrast, so keep a solid stroke under any glow. |
| **Neon alert** | Red-alert cyber terminal: black field, saturated red and magenta neon strokes, cyan as the only "ok" colour, hex tiles, scanline and dot-grid texture, angular clipped corners. | Security, incident and threat views, games, launch-countdown or alarm states. | Red as the base colour makes real errors invisible: give errors a distinct shape and word. Red on black fails contrast below about 18px. Check that red and cyan are distinguishable for colour-blind users (add a shape cue). |
| **Holo-table console** | Retro-future control desk: chunky rounded panels in deep teal with bright cyan borders, orange and pink for active state, pill buttons and tabs, coded labels (`TRK_PD.DC3`), circular jog wheels, numbered tile grids. Busy but friendly. | Creative and media tools (colour grading, audio, video), simulators, kiosk and touch tables. | Density is the risk: group controls and keep 44px touch targets. Coded labels need plain-language tooltips or aria-labels. Orange-on-teal pairs need a contrast check. |
| **Cockpit line-art** | Vector holo overlay: one warm outline colour (amber or pale gold) drawn in sweeping curves, swooshes and ellipses on a flat saturated field (royal blue) or over a photo. Small flat fills of colour for meters (green, red, violet). Rounded display type. | Vehicle and travel UIs, kids' and playful products, brand pages, illustration-led onboarding. | Thin single-colour lines over a photo fail non-text contrast. Use a solid backdrop or a scrim. Swoosh shapes make poor hit targets: hit areas must be real rectangles. |
| **Bio-holographic** | Organic alien interface: violet and magenta translucent shapes with curved, grown-not-built outlines, crystalline hexes and cubes, soft bloom, faint web textures. | Brand and entertainment, music, wellness-tech, game worlds, marketing heroes. | Low-contrast violet on violet is the default failure, so text sits on a solid dark plate. Bloom and translucency need a `prefers-reduced-transparency` fallback. Avoid it for any data a user must read exactly. |
| **Hard-sci-fi ops panel** | The legible one: matte dark panels, large confident numerals, a restrained palette (cyan, white, one amber), plain sans labels with occasional micro-script, deck and grid status matrices, real charts. It looks like a ship's working screen, not a movie prop. | Product dashboards, admin, monitoring, finance and analytics that want a sci-fi edge without losing readability. **The product-register-safe pick of the family.** | Keep the glow off text. Status matrices need labels, not colour alone. It drifts into generic dark dashboard: hold a signature device (deck matrix, big numerals, corner brackets). |
| **Neural network** | Holo network graph: glowing nodes joined by circuit traces, hex or round icon badges on spokes around a central core, a deep blue field with light streaks. | Marketing heroes for AI, cloud, security and platform products. Explainers and about pages. | It is decoration, not a working UI: never put the main task in it. When the user picks it for a working screen, mock it on the hero, header or empty state only and draw the working UI in Hard-sci-fi ops panel, saying so in one line. Glowing node clusters are noise to screen readers (mark them `aria-hidden`). Parallax and pulsing need a reduced-motion stop. |

Register guard: in the product register, recommend only the styles that keep the product
readable at a glance (Bento grid, Minimalism, Glassmorphism or Liquid glass on chrome only;
from the futuristic family, Hard-sci-fi ops panel only; Tactical HUD only with its contrast fixes stated as conditions: labels at least 12px and 4.5:1).
Still list all sixteen, and say in one line why the others are risky for this surface. If the
user picks one of them anyway, the user's pick wins.

### Futuristic family: mock kit

What a mock of each futuristic look needs, so the build does not rediscover it. Mocks are
drawn fresh from these notes; reference images are mood only, never traced or copied.

| Style | Palette (field / line / accent) | Type | Signature devices | Motion |
|---|---|---|---|---|
| Tactical HUD | `#0d1114` / `#7fd4e0` / `#e5483a` | Condensed sans display, mono micro caps | Corner-tick panels, lettered grid, hatched zones, timecode | Blinking status dot, ticker numbers |
| Radial reactor HUD | `#05080c` / `#2fc6f6` / `#ff8a3d` | Wide sans display, mono figures | Concentric segmented rings, reticle, orbiting dials | Slow ring rotation, arc sweep on load |
| Neon alert | `#0a0507` / `#ff2d55` / `#22e3d3` | Squared techno display, mono | Hex tiles, clipped corners, scanlines, dot grid | Scan sweep, flicker on alert only |
| Holo-table console | `#0f3a44` / `#33d1e6` / `#ff7a3d` + `#ff4fa0` | Rounded techno caps | Pill tabs, jog wheels, numbered tile grid, coded labels | Wheel spin, tile press glow |
| Cockpit line-art | `#1046a0` / `#ffc77a` / `#e23b3b` | Rounded wide display | Swoosh frames, ellipse globes, flat meter fills | Line-draw on load |
| Bio-holographic | `#140a24` / `#c77dff` / `#ff5fd2` | Thin humanist sans | Grown curved frames, crystal hexes, bloom | Breathing glow, slow drift |
| Hard-sci-fi ops panel | `#0b0f14` / `#4fd8e8` / `#f2a33a` | Neutral grotesk, tabular numerals | Big numerals, deck status matrix, corner brackets | Number count-up only |
| Neural network | `#04122b` / `#3da9ff` / `#ffffff` | Geometric sans | Node graph, hex badges on spokes, light streaks | Pulse along traces |
