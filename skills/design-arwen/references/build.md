# `build` — new UI, from nothing

Prereq: SKILL.md Phase 0–2 done (platform, register, dials, scene sentence, Design Read,
direction, signature). Also read [craft.md](craft.md); product register also reads
[product-ui.md](product-ui.md). Finish through [verify.md](verify.md) and leave a
`DESIGN.md` behind. Nothing exists to preserve — if
something does, you want [redesign.md](redesign.md) instead.

---

## 1. Pick the substrate before the pixels

**Reach for a real design system when the brief implies one.** Rebuilding Carbon by hand
is not craft, it's waste — and the result is always subtly wrong.

| Brief signal | System | Install |
|---|---|---|
| Google / Android-flavored web | Material Web (M3) | `npm i @material/web` |
| Microsoft / enterprise | Fluent UI React v9 | `npm i @fluentui/react-components` |
| IBM / data-heavy enterprise | Carbon | `npm i @carbon/react` |
| GitHub-adjacent devtool | Primer (product) / Primer Brand (marketing) | `npm i @primer/react` |
| UK public sector | GOV.UK Frontend | `npm i govuk-frontend` |
| US federal | USWDS | `npm i @uswds/uswds` |
| Atlassian app | Atlaskit | per-component `@atlaskit/*` |
| Shopify app | Polaris web components | CDN + `shopify-api-key` meta |
| Accessible unstyled primitives | Radix | `npm i @radix-ui/themes` |
| Own-the-code components | shadcn/ui | `npx shadcn@latest init` |

**When the brief is an aesthetic, not a system** ("Linear-style", "brutalist", "premium
consumer", "Awwwards"), don't install a system — build tokens + primitives yourself from
the Phase 1 direction. A design system would flatten exactly the thing you're being paid
for.

**Verify every dependency before you write an import.** Check it exists at the version you
name, check the API you're calling is in that version, check the component you reference
actually ships. Inventing a package or a prop is a shipped bug, not a typo.

---

## 2. Two passes — plan, critique the plan, *then* code

The single highest-leverage habit in this skill. Do the first pass in your head or a
scratch note; only show the user something you're confident about.

### Pass 1 — write the plan

Four blocks, compact:

- **Color** — 4–6 named values in OKLCH, each with its role (`bg`, `surface`, `ink`,
  `muted`, `accent`, and at most one more). Name the color strategy from Phase 1.
- **Type** — 2–3 roles: a characterful display face used with restraint, a body face, and
  a utility/mono face for captions or data if the content needs one. Name the scale ratio.
- **Layout** — one-sentence prose per section, plus an **ASCII wireframe** for anything
  non-obvious. Wireframes are cheap; they expose a repetitive rhythm before you've written
  400 lines of CSS.
- **Signature** — the one sentence from Phase 2, and where in the layout it lands.

### Pass 2 — critique the plan against the brief

Before any code: work through a *similar* prompt in your head and see where you land. If
any block of your plan is where you'd land anyway — that's the training-data default, not
a choice for this brief. **Revise that block and say what you changed and why.**

Run the SKILL.md category-reflex check (both altitudes) and the three-saturated-looks
check here, not after the code exists.

Only once the plan survives its own critique do you write code — and then you follow it
exactly, deriving every color and type value from it.

**Optional visual gate:** if the user would rather move boxes than read prose, publish the
plan as artboards first — see [canvas.md](canvas.md).

---

## 3. Walking skeleton before breadth

Build **one surface fully to spec** — real content, all eight states, signature present,
responsive, verified in the browser or on the device. It proves the route for a tenth of
the cost of proving it across six screens. Then widen.

---

## 4. Build out with subagents

For anything multi-surface, implement via subagents rather than one linear pass.

- **Slice by surface or workflow.** One subagent owns one screen / flow / component
  end to end.
- **Brief every agent identically on the shared system** — the resolved direction, the
  signature and its rules, the token values, and the craft.md bar. Independently built
  surfaces drifting apart is *the* failure mode; the shared written brief is what keeps
  them one product.
- **Isolate parallel file edits.** Agents touching the same tree concurrently → give each
  a git worktree (`isolation`) so they don't collide; otherwise sequence them. This holds
  on every host, including ones that run agents in the working tree with no sandbox.
- **No delegation on this host?** Build the surfaces sequentially in one session off the
  same written brief. Slower, identical output — the brief on disk is what matters, not
  the parallelism.
- **Each agent runs its own ship gate and returns evidence** (a real render or
  screenshot), not a claim. You reconcile, check cross-surface consistency, and relay.

---

## 5. Stack defaults (when the user hasn't picked one)

Only defaults — an existing project's stack always wins.

- React + TypeScript + Vite; Tailwind for utility, CSS custom properties for tokens.
- Local state first. Reach for a store only when two distant components genuinely share
  state; never install one for a landing page.
- No CSS-in-JS runtime for a static page.
- Dark mode via a `data-theme` attribute or `prefers-color-scheme`, with tokens redefined —
  never a second hand-maintained stylesheet.

---

## 6. Finish

Run the SKILL.md **ship gate** in full. Do not report done on an unrendered page.
