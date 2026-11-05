# Consuming the Design-to-Build Handoff

How `build-jarvis` implementers consume the design handoff contract produced by `design-arwen`.

Connected to `plugin/skills/design-arwen/references/handoff.md`.

---

## 1. Role in the Build-Jarvis Workflow

In `build-jarvis`, UI surfaces are specified and built under a clear division of concerns:

- **`DESIGN.md` retains design decisions** — architecture, visual concepts, palette/typography choices, and high-level design rationale.
- **`handoff-cortana` retains session status** — agent handoffs, session checkpoints, and active task progress.
- **The Design-to-Build Handoff contract (`handoff.md`) retains UI implementation specifications** — concrete component APIs, tokens, responsive rules, interaction states, content limits, motion, assets, and accessibility expectations.

### Workflow Integration

1. **Phase 1 (UI Design Pass):** When `ui` mode is active (not `none`), `design-arwen` writes the `## UI design` section or a handoff specification conforming to the 9 handoff sections defined in `design-arwen/references/handoff.md`.
2. **Phase 2 (Build):** Fresh implementer agents receive the handoff specification as part of their task context.
3. **Phase 3 (Verify):** Verification validates that the built surface satisfies all handoff expectations, including accessibility and responsive behavior.

---

## 2. Implementer Rules for Consuming Handoffs

A fresh implementer consuming a design handoff must apply the following rules:

### 1. Figma is Optional
Never halt or stall implementation because a Figma link is missing or inaccessible. If no Figma link is present, proceed using the component specs, token references, screenshot captures, or text mockups provided in the handoff.

### 2. Handling Screenshot Estimates
When measurements are labeled `[estimated from screenshot]`:
- Do not treat them as rigid raw pixel absolutes.
- Map the estimate to the closest existing design system token or standard scale (e.g. 4px / 8px spacing scale, standard type scale).
- If no token exists, use the nearest clean standard value.

### 3. Resolving Unspecified Measurements
When a dimension, padding, or curve is marked `[unspecified]`:
- Do not invent arbitrary values.
- Resolve it using project design tokens, existing adjacent components, or standard guidelines from `design-arwen/references/craft.md`.
- Document the resolution in the task notes.

### 4. Turning Accessibility Expectations into Verified Behavior
The handoff lists design **expectations** (e.g. expected ARIA roles, focus targets, keyboard interaction, contrast floors):
- The implementer is responsible for implementing these semantic structures in code.
- In Phase 3, the implementer verifies them through automated tests (DOM checks, keyboard navigation assertions, axe/WCAG scans) or live browser verification.
- Only after verification passes does the status become "verified".

### 5. Implementing the Eight Interaction States
Implementers must ensure all specified states are handled in code or styles:
- `default`, `hover`, `focus`, `active`, `disabled`, `loading`, `empty`, `error`.
- For states with no custom styling required (e.g. standard empty state inheriting card layout), ensure the rendering logic handles null/empty data gracefully without throwing or displaying broken layout.

### 6. Resolving Open Questions
Check the `Open Questions` section before implementing:
- If a question defines a recommended default (e.g. "Defaulting to optimistic UI with rollback"), follow the default.
- If a question is blocking and has no default, flag it immediately before writing conflicting code.
