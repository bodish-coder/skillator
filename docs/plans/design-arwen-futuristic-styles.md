# Draft: futuristic styles for design-arwen

Status: **applied**, 2026-11-26. Source: the 19 reference images in `Futristic_UI.zip`.
Owner ruling: option 2, a flat menu of sixteen (four questions of four). The rows below are
in `plugin/skills/design-arwen/references/styles.md`; this file is the record of the draft.

The zip does not show one "futuristic" look. It shows eight distinct styles that share a
dark field and glowing lines, but differ in shape language, colour and density. Each one
below commits to a look a mock can show. The rows use the same columns as the
`styles.md` table, so they can be pasted in once approved.

## How they join the menu (decision needed)

The current menu is eight styles in two `AskUserQuestion` calls of four options each.
Adding eight more breaks that shape. There are three ways to fit them:

1. **One "Futuristic" entry, then a family pick (recommended).** Replace nothing. Add a
   ninth menu entry, *Futuristic (sci-fi HUD family)*. If the user picks it, a second
   pair of questions offers the eight looks below. The base menu grows by one, and the
   family is only shown to people who want it.
2. **A flat menu of 16.** Four questions of four. Everything is visible, but it is long,
   and in the product register most of the new rows are risky.
3. **A separate family file** (`styles-futuristic.md`) that is offered only when the brief
   says sci-fi, HUD, cockpit, game, command centre or futuristic.

## The eight looks

| Style | What it is | Fits | Watch for (a11y and register) |
|---|---|---|---|
| **Tactical HUD** | Mission-control readout: near-black slate, hairline grid with lettered and numbered axes, tiny tracked-out mono caps, coordinate and timecode figures, cyan lines with one alarm accent (red diagonal hatching, orange tags) for danger zones. Panels are thin outlined boxes with corner ticks. | Ops and monitoring dashboards, maps and geo tools, drone and fleet tracking, security consoles. | Tiny caps fail contrast and size fast. Keep body text ≥ 12px and 4.5:1, and treat micro-labels as decoration. Hatching must not be the only danger signal: add a word or icon. |
| **Radial reactor HUD** | A big concentric-ring gauge as the focal point: segmented arcs, tick rings, a reticle at centre. Smaller radial dials and bar stacks orbit it. Glowing cyan on black, white figures, one warm accent at the core. | Hero dashboards, system-health and status pages, game menus, a "control centre" landing section. | Radial gauges are slow to read exactly. Pair every arc with its number. Rotating rings must stop under reduced motion. Glow blur lowers edge contrast, so keep a solid stroke under any glow. |
| **Neon alert** | Red-alert cyber terminal: black field, saturated red and magenta neon strokes, cyan as the only "ok" colour, hex tiles, scanline and dot-grid texture, angular clipped corners. | Security, incident and threat views, games, launch-countdown or alarm states. | Red as the base colour makes real errors invisible: give errors a distinct shape and word. Red on black fails contrast below about 18px. Check that red and cyan are distinguishable for colour-blind users (add a shape cue). |
| **Holo-table console** | Retro-future control desk: chunky rounded panels in deep teal with bright cyan borders, orange and pink for active state, pill buttons and tabs, coded labels (`TRK_PD.DC3`), circular jog wheels, numbered tile grids. Busy but friendly. | Creative and media tools (colour grading, audio, video), simulators, kiosk and touch tables. | Density is the risk: group controls and keep 44px touch targets. Coded labels need plain-language tooltips or aria-labels. Orange-on-teal pairs need a contrast check. |
| **Cockpit line-art** | Vector holo overlay: one warm outline colour (amber or pale gold) drawn in sweeping curves, swooshes and ellipses on a flat saturated field (royal blue) or over a photo. Small flat fills of colour for meters (green, red, violet). Rounded display type. | Vehicle and travel UIs, kids' and playful products, brand pages, illustration-led onboarding. | Thin single-colour lines over a photo fail non-text contrast. Use a solid backdrop or a scrim. Swoosh shapes make poor hit targets: hit areas must be real rectangles. |
| **Bio-holographic** | Organic alien interface: violet and magenta translucent shapes with curved, grown-not-built outlines, crystalline hexes and cubes, soft bloom, faint web textures. | Brand and entertainment, music, wellness-tech, game worlds, marketing heroes. | Low-contrast violet on violet is the default failure, so text sits on a solid dark plate. Bloom and translucency need a `prefers-reduced-transparency` fallback. Avoid it for any data a user must read exactly. |
| **Hard-sci-fi ops panel** | The legible one: matte dark panels, large confident numerals, a restrained palette (cyan, white, one amber), plain sans labels with occasional micro-script, deck and grid status matrices, real charts. It looks like a ship's working screen, not a movie prop. | Product dashboards, admin, monitoring, finance and analytics that want a sci-fi edge without losing readability. **The product-register-safe pick of the family.** | Keep the glow off text. Status matrices need labels, not colour alone. It drifts into generic dark dashboard: hold a signature device (deck matrix, big numerals, corner brackets). |
| **Neural network** | Holo network graph: glowing nodes joined by circuit traces, hex or round icon badges on spokes around a central core, a deep blue field with light streaks. | Marketing heroes for AI, cloud, security and platform products. Explainers and about pages. | It is decoration, not a working UI: never put the main task in it. Glowing node clusters are noise to screen readers (mark them `aria-hidden`). Parallax and pulsing need a reduced-motion stop. |

## Mock kit per look

What a mock of each look needs, so the build does not have to rediscover it.

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

## Register guard (proposed addition)

In the product register, recommend **Hard-sci-fi ops panel** first, then **Tactical HUD**
with the contrast fixes above. List the other six with one line on why they are risky for a
working surface. In the brand register, all eight are open.

## Reference map (zip file → style)

- Tactical HUD: `6b469c8c…1035x582.jpeg`, `6f0d8648….jpeg`, `aa1e9617…1035x582.jpeg`, `Screenshot 2026-11-24 224815.png`
- Radial reactor HUD: `jarvis_and_iron_man_rainmeter…jpg`, `futuristic-hud-digital-data-world-map…jpg`, `Screenshot 2026-11-24 224951.png`, `Screenshot 2026-11-24 225228.png`
- Neon alert: `Screenshot 2026-11-24 224554.png`
- Holo-table console: `Screenshot 2026-11-24 224536.png`
- Cockpit line-art: `gtxg57kw8hhx.jpg`, `Screenshot 2026-11-21 220429.png`, `Screenshot 2026-11-21 220518.png`
- Bio-holographic: `hqdefault.jpg`, `Screenshot 2026-11-24 225011.png`
- Hard-sci-fi ops panel: `Screenshot 2026-11-24 224602.png`, `Screenshot 2026-11-24 224611.png`
- Neural network: `Screenshot 2026-11-24 224827.png`, `Screenshot 2026-11-24 224844.png`, `Screenshot 2026-11-24 224951.png` (nodes)

Several images are watermarked stock (Dreamstime, Shutterstock, Pngtree) or film and show
stills. They are mood references only. Mocks must be drawn fresh, never traced or copied.
