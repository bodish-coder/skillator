# `redesign` — an app that already exists

Prereq: SKILL.md Phase 0–2, plus [craft.md](craft.md). The difference from `build` is
that something is already working and someone already recognizes it. **Identity
preservation beats novelty.** A redesign that erases what users recognize is a rewrite
sold as an improvement.

---

## 1. Audit before touching anything

One opinion on a described app is a guess. Critique reality:

- **Capture the real thing** — screenshots of every in-scope surface (drive the browser,
  run the screen). A picture is worth a thousand tokens.
- **Read the code** — tokens/theme file, the two or three key screens, the component
  primitives, the existing breakpoints.
- **Inventory what exists**: palette (actual values, not vibes), typefaces and scale,
  spacing system, component library or lack of one, motion, dark mode support, and the
  framework you're constrained to.
- **List what's actually broken** vs what's merely dated. These get different treatments.

Write the inventory down. Every subagent downstream reads it.

---

## 2. Decide the depth — targeted evolution or full redesign

| Signal | Verdict |
|---|---|
| Layout works, palette/type are dated, components inconsistent | **Targeted evolution** |
| Brand is committed and recognizable, only craft is failing | **Targeted evolution** |
| Information architecture itself is wrong; users can't find things | **Full redesign** |
| No system at all — every screen invented separately | **Full redesign** (build the system first) |
| User explicitly said "overhaul / start over" | **Full redesign** |

Say which one you picked and why, in one line. Defaulting to full redesign because it's
more fun to build is the most expensive mistake in this file.

---

## 3. Convene the expert panel (2–3 lenses, not clones)

Dispatch each as a **subagent** (Agent tool on Claude Code; the host's delegate mechanism
per `PLATFORMS.md` — beside the installed skills or at the repo root — elsewhere;
sequential in-session passes where there is none). Brief each with the audit evidence,
arwen's doctrine, and **its lens only**:

- **Visual / brand director** — aesthetic direction, signature, type and color, hierarchy.
- **UX & interaction / a11y lead** — flows, the eight states, focus and forms, cognitive
  load, empty and error states.
- **Native platform specialist** — HIG / Material 3 / RN idioms. Include when native.
- **Product / growth strategist** — conversion, activation, information scent. Brand
  register only.

Require each to return, structured: **top 3–5 problems** (ranked, naming the offending
surface), a **proposed design route** (direction + the one signature it would forge), and
its **non-negotiables vs nice-to-haves**.

Run them concurrently — they're independent. Diverse lenses beat N identical reviewers;
optionally give the visual seat a more creative model and the a11y seat a more rigorous one.

---

## 4. Resolve to ONE route — reconcile, don't average

Where the panel agrees = strong signal, act on it. Where it conflicts, **decide** with a
one-line rationale (in *product* register usability outranks flourish; in *brand* register
identity outranks safety). Never ship a committee.

Output three things:
1. the chosen **direction** (Phase 1 lane + named reference),
2. the single **signature** (Phase 2),
3. a **ranked change list** — what · why · which surface.

---

## 5. Preservation rules — what never changes silently

These require an explicit user decision, never a designer's initiative:

- **The logo, the brand name, and the committed brand color.** You may re-tune a palette
  *around* them; you may not replace them because a trendier hue scores better.
- **Product terminology and menu labels** users have learned.
- **URL structure, page inventory, and nav order** — content disappearing in a "redesign"
  is a bug report waiting to happen.
- **Working flows.** If checkout, onboarding, or search works, restyle it; don't rebuild
  it because a new pattern is fashionable.
- **Anything the user explicitly named as fixed.**

If the route requires breaking one of these, say so out loud and get a yes first.

---

## 6. Modernisation levers — in priority order

Apply top-down and stop when the app is good. Most tired interfaces are fixed by the
first three, and the first three are also the cheapest and safest.

1. **Contrast and type scale.** Fix unreadable muted text and a flat ~1.1 scale. Biggest
   perceived-quality jump per line changed.
2. **Spacing rhythm and alignment.** Consistent scale, varied section rhythm, real
   optical alignment.
3. **Component consistency.** One button, one input, one card — not five near-copies.
4. **Palette re-tune.** Tinted neutrals in OKLCH around the existing brand hue; commit to
   a color strategy.
5. **Typeface change.** High-impact and high-risk; only when the current face actively
   fights the brand.
6. **Motion.** State transitions first, reveals second, orchestration last and only in
   brand register.
7. **Layout restructure.** Highest cost, highest risk. Justify it with a real UX problem
   from the audit, never with "it felt dated".

---

## 7. Confirm the route (one screen), then build

Present the resolution — direction, signature, ranked change list, depth verdict, anything
hitting a preservation rule — and let the user correct it **before any code**. This gate
is cheap; a wrong route is expensive; their correction is the highest-value input you'll
get. Skip only if they said "just do it".

**Optional visual gate:** publish the route as before/after artboards instead of prose —
see [canvas.md](canvas.md).

Then hand off to [build.md](build.md) §3–6: walking skeleton on the highest-traffic
surface, subagent build-out off the shared brief, ship gate on every surface.
