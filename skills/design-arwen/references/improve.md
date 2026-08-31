# `improve` — a scoped pass on working UI

Prereq: SKILL.md Phase 0–2 (abbreviated — read the register and the existing tokens; you
don't need a fresh scene sentence if the identity is already committed) plus
[craft.md](craft.md).

`improve` is deliberately narrow. The UI works; one dimension of it doesn't. Do that
dimension well and leave the rest alone. **Scope creep is the failure mode here** — if
you find yourself rewriting the layout during a color pass, you wanted `redesign`.

---

## Route the intent

Name the lane in one line before you start, so the user can redirect you cheaply.

| The user said | Lane | What you actually do |
|---|---|---|
| "polish", "final pass", "ship-ready" | **polish** | The whole craft.md checklist at low amplitude: contrast, alignment, the eight states, focus rings, empty/error, copy. Change nothing structural. |
| "bolder", "it's bland", "make it pop" | **bolder** | Raise VARIANCE by 2–3. Commit the color strategy one step up the axis, raise the type scale ratio, strengthen the signature. One bold move, not five. |
| "quieter", "too much", "calm it down" | **quieter** | Lower VARIANCE and MOTION. Cut decoration, reduce the palette, cut competing wow moments, keep the single signature. |
| "spacing", "hierarchy", "alignment", "it feels off" | **layout** | Spacing scale, rhythm variation, optical alignment, section-rhythm repetition, overflow at every width. |
| "fonts", "typography", "hard to read" | **typeset** | Pairing on a contrast axis, scale ratio, line length, line height, weights, `text-wrap`, tracking floor. |
| "colors are flat", "add color", "washed out" | **colorize** | Color strategy first, then OKLCH values, tinted neutrals, accent discipline, contrast re-verified. |
| "add motion", "it feels static" | **animate** | State transitions first. Reveals only if MOTION ≥4. Reduced-motion path in the same commit, always. |
| "mobile", "tablet", "responsive", "it breaks on…" | **adapt** | Every breakpoint from 320px, touch targets, safe areas, keyboard insets, and on native the platform-idiomatic layout, not a shrunk web one. |
| "production-ready", "edge cases", "i18n" | **harden** | Error and empty states, loading, long strings, RTL, zero/one/many, offline, permission-denied, slow network. |
| "it's slow", "janky", "laggy" | **optimize** | LCP/CLS/INP against craft.md budgets. Measure first — delegate a real audit to `web-perf` rather than guessing. |
| "this copy is bad", "reword the error" | **clarify** | The UX copy rules in craft.md. Rewrite from the user's side of the screen. |
| "it's boring", "add personality" | **delight** | The earn-it budget in craft.md. One moment, varied, skippable. |
| "too complex", "strip it back" | **distill** | Remove, don't add. Cut every element that isn't doing a job. Chanel's rule, applied hard. |
| "first-run", "empty state", "onboarding" | **onboard** | Activation path, empty states as invitations, progressive disclosure over a wall of setup. |

Two lanes clearly apply → do both, say so. Five apply → the user wanted `redesign`; say
that and ask.

---

## How every lane runs

1. **Look at the real thing first.** Screenshot it, or read the exact file. Never improve
   from a description.
2. **Say what's wrong and what you'll change** — a short ranked list, not an essay.
3. **Change only what the lane owns.** An adjacent bug you spot goes in the report, not
   in the diff, unless it's a contrast or a11y failure — those you fix on sight.
4. **Preserve the identity.** Existing committed brand colors, fonts, and the existing
   signature win over arwen's reflex-reject lists. You are tuning, not re-branding.
5. **Verify.** Re-render, re-screenshot, re-check contrast. The relevant subset of the
   SKILL.md ship gate, not the whole thing — but the parts your lane touched, in full.
6. **Report the before/after** in one or two lines per change. Evidence, not adjectives.
