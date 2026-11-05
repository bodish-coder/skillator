# Design-to-Build Handoff Contract

The interface specification contract between `design-arwen` (design pass) and `build-jarvis` (implementer).

Derived in part from `anthropics/knowledge-work-plugins` (`design/skills/design-handoff/SKILL.md`) under the Apache-2.0 License.

---

## 1. Artifact & Workflow Boundaries

To keep responsibility clear and avoid drift across agents:

- **`DESIGN.md` retains design decisions** — architecture, visual direction, aesthetic register (product vs. brand), signature device, and fundamental token rationale. It answers *why* the design looks and behaves this way.
- **`handoff-cortana` retains session status** — session checkpoints, WIP tasks, branch state, and context handoff between agents or human sessions. It answers *where we are right now*.
- **The Design-to-Build Handoff contract (`handoff.md`) retains UI implementation specifications** — concrete component APIs, tokens, responsive rules, interaction states, content limits, motion, assets, and accessibility expectations for a given UI surface. It answers *what the implementer must build*.

When `build-jarvis` executes Phase 1 (`ui` pass), `design-arwen` produces this specification (either directly in `## UI design` or as a referenced handoff doc). A fresh `build-jarvis` Phase 2 implementer consumes it directly.

---

## 2. Core Ground Rules

1. **Figma remains optional.**
   Figma URLs and token exports may be linked when available, but the handoff must be fully consumable without Figma. Terminal TUIs, code-first components, static screenshots, and text-based mockups are first-class targets.
2. **Screenshot estimates are labeled.**
   When handoffs derive from visual captures or screenshots rather than vector inspect tools, any measured dimensions, paddings, or font sizes must be explicitly labeled:
   `[estimated from screenshot]`. Never disguise a visual guess as an exact spec.
3. **Unknown measurements remain unspecified.**
   If a measurement, curve, or spacing value is unknown or unconstrained, leave it explicitly as `[unspecified]`. An implementer will resolve unspecified values using design system defaults and [craft.md](craft.md) rules. Never fabricate exact pixel values.
4. **Specified accessibility is distinct from verified behavior.**
   The handoff states accessibility **expectations** (target roles, ARIA attributes, keyboard flow, minimum contrast floors). It must **never** claim runtime verification (such as "verified in live DOM" or "screen reader verified"). Runtime verification belongs strictly to `build-jarvis` Phase 3 verification and accessibility audits.

---

## 3. The Nine Specification Sections

Every design handoff contract must address these nine sections:

### 1. Components, Variants & Props
- Hierarchy of UI components (containers, cards, buttons, badges).
- Variant definitions (e.g. `variant: 'primary' | 'secondary' | 'ghost'`).
- Property names, types, optionality, and defaults.

### 2. Token References
- Explicit token names rather than raw magic numbers:
  - Color tokens (background, border, text, semantic status).
  - Typography tokens (font family, size, weight, line-height).
  - Spacing tokens (padding, gap, margins).
  - Shape & Elevation tokens (border-radius, box-shadow).
- If tokens are missing from the project, link to closest standard scale in [craft.md](craft.md).

### 3. Interaction States
Address the full state matrix across interactive elements:
- `default` / `resting`
- `hover` (desktop pointer only, gated via `@media (hover: hover)`)
- `focus` (`:focus-visible` with high-contrast ring, never hidden)
- `active` / `pressed` (instant visual feedback within 100ms)
- `disabled` (`aria-disabled="true"`, readable contrast, pointer-events handled)
- `loading` (skeleton shimmer or inline spinner, aria-busy="true")
- `empty` (meaningful zero-data state, helpful CTA)
- `error` (clear inline error message, high-contrast indicator, form link)

### 4. Responsive Behavior
- Layout adaptation across viewport widths:
  - Mobile floor: 320px width minimum, no horizontal scrolling.
  - Tablet / intermediate reflow points.
  - Desktop maximum width and alignment.
- Container queries or media query breakpoints.
- Navigation transformations (e.g. desktop header row to mobile sheet/drawer).

### 5. Content Limits
- Text overflow handling: truncation with ellipsis vs. multi-line wrapping.
- Maximum and minimum character thresholds for inputs, headers, and descriptions.
- Edge case data handling: extremely long usernames, missing avatars, null fields.

### 6. Motion
- Transition properties, durations, and easing curves (keep durations within 150ms–300ms bands; interruptible).
- Enter and exit coordination (same trajectory for enter and exit).
- Accessibility requirement: respect `prefers-reduced-motion` by reducing or disabling non-essential motion.

### 7. Assets
- Icon names, sizes (e.g. 16px, 20px, 24px), and SVG rendering method.
- Image aspect ratios, responsive resolution (`srcset` for 1x/2x), and alt strategy.
- Fallback placeholders for broken or missing images.

### 8. Accessibility Expectations
- Expected semantic elements (`<article>`, `<nav>`, `<button>`, `<dialog>`).
- Expected ARIA roles, attributes, and states (`aria-expanded`, `aria-controls`, `aria-haspopup`).
- Expected keyboard navigation patterns (Tab navigation order, Escape to close, Arrow keys for listbox/menus).
- Target contrast ratios (minimum 4.5:1 for body text, 3:1 for large text and interactive components).

### 9. Open Questions
- Unresolved design decisions, backend dependency questions, or edge cases flagged for product/engineering review.

---

## 4. Reusable Handoff Template

```markdown
# Design-to-Build Handoff: [Component or Surface Name]

Source: [Figma URL / Screenshot / Code-first mockup] (Figma is optional)
Target implementer: build-jarvis Phase 2

## 1. Components, Variants & Props
- \`[ComponentName]\`
  - Props:
    - \`propName\`: \`type\` ([required|optional], default: \`value\`)
  - Variants:
    - \`variantName\`: \`'optionA' | 'optionB'\`

## 2. Token References
- Colors: [token names or closest system scale]
- Typography: [token names]
- Spacing: [token names]
- Radius / Shadow: [token names]
- Notes: [labeled screenshot estimates if applicable, e.g. padding [estimated from screenshot] 16px]

## 3. Interaction States
- \`default\`: ...
- \`hover\`: ...
- \`focus\`: ...
- \`active\`: ...
- \`disabled\`: ...
- \`loading\`: ...
- \`empty\`: ...
- \`error\`: ...

## 4. Responsive Behavior
- Mobile (320px+): ...
- Tablet (768px+): ...
- Desktop (1024px+): ...

## 5. Content Limits
- Max lengths, truncation rules, wrapping rules.

## 6. Motion
- Duration, easing, reduced motion alternative.

## 7. Assets
- Icons, images, SVGs, aspect ratios.

## 8. Accessibility Expectations
- Expected elements & roles: ...
- Expected ARIA states: ...
- Expected keyboard interaction: ...
- Expected contrast targets: >= 4.5:1 text, >= 3:1 controls.
*(Note: Expected specifications only; verified runtime behavior is validated during build/verification).*

## 9. Open Questions
- [Unresolved questions or [unspecified] properties to resolve during build].
```
