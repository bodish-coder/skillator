# The style menu — eight looks to mock before you commit

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

All eight styles always appear. Never cut the menu down to your favourites. Ask with
`AskUserQuestion`, using **two multi-select questions of four options each**, since the
tool takes at most four options per question. Put the styles that fit the brief first and
mark them `(Recommended)`. Each option's description is the one-line read from the table
below, applied to this brief.

```
Q1 "Which styles should I mock? (1/2)"  Spatial UI · Bento grid · Maximalism · Liquid glass
Q2 "Which styles should I mock? (2/2)"  Glassmorphism · Brutalism · Minimalism · Skeuomorphism
```

On a host without `AskUserQuestion`, print the eight as a numbered list and ask for
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

## The eight

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

Register guard: in the product register, recommend only the styles that keep the product
readable at a glance (Bento grid, Minimalism, Glassmorphism or Liquid glass on chrome only).
Still list all eight, and say in one line why the others are risky for this surface. If the
user picks one of them anyway, the user's pick wins.
