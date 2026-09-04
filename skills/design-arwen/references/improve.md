# `improve` — a scoped pass on working UI

Prereq: SKILL.md Phase 0–2 (abbreviated — read the register and the existing tokens; you
don't need a fresh scene sentence if the identity is already committed) plus
[craft.md](craft.md). Read `DESIGN.md` if the repo has one — it is the identity you are
tuning, not replacing. Product-register surfaces (forms, tables, settings, flows) also
read [product-ui.md](product-ui.md). Every lane ends in [verify.md](verify.md), scoped to
what the lane touched.

`improve` is deliberately narrow. The UI works; one dimension of it doesn't. Do that
dimension well and leave the rest alone. **Scope creep is the failure mode here** — if
you find yourself rewriting the layout during a color pass, you wanted `redesign`.

---

## Route the intent

Name the lane in one line before you start, so the user can redirect you cheaply.

| The user said | Lane | What you actually do |
|---|---|---|
| "polish", "final pass", "ship-ready" | **polish** | The full procedure below — the most-used lane, so it is written out rather than described. |
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
   signature win over the shared floor's reflex-reject lists. You are tuning, not
   re-branding.
5. **Verify.** Re-render, re-screenshot, re-check contrast. The relevant subset of the
   SKILL.md ship gate, not the whole thing — but the parts your lane touched, in full.
6. **Report the before/after** in one or two lines per change. Evidence, not adjectives.

---

## The `polish` procedure (written out, because it's the one people actually run)

Polish is not "look at it again and improve things". It is a fixed sweep in a fixed order,
at low amplitude, changing **nothing structural**. If a fix requires moving a section or
re-picking a font, it belongs to `layout` or `typeset` — note it and move on.

Work top to bottom. Each pass gets a one-line verdict: fixed / already fine / out of scope.

**1. See it first.** Screenshot at 320/768/1280/1920 in both themes ([verify.md](verify.md)).
Read the console. Polish decided from source instead of pixels is guesswork.

**2. Contrast, measured.** Body, muted, placeholder, disabled, on-accent text, focus ring —
computed off the rendered elements, not the tokens. Numbers in the report. This finds a real
failure roughly every time; it is the highest-yield pass and it is first for that reason.

**3. The eight states.** default · hover · focus · active · disabled · loading · error ·
success, for every interactive element. **Hover ≠ focus** is the usual miss. A disabled
control with no reason is a bug ([product-ui.md](product-ui.md)).

**4. Focus, keyboard, order.** Tab the whole surface. Visible ring everywhere, sensible
order, nothing trapped, Escape closes what it opens, skip link present.

**5. Optical alignment.** Not "is it on the grid" — is it *on the grid to the eye*. Icon
baselines against text, numerals right-aligned and tabular, punctuation hung where it
matters, cap-height vs. line-box centring in buttons and chips, consistent inline gaps.
This is where "designed" and "assembled" separate.

**6. Spacing consistency.** Every value comes from the scale. Adjacent components that
should share a rhythm do. Nothing is a one-off `13px`.

**7. Empty, loading, error, success — as rendered, not as intended.** Force each one.
Skeletons match the real layout. Empty states carry an action. Errors say what and what next.

**8. Copy.** craft.md's UX-copy rules at close range: sentence case, active voice, one job
per element, consistent action naming across a flow, **no em-dashes**, no placeholder names
or fake metrics that survived from the mockup.

**9. Overflow and long strings.** The snippet in verify.md at each width — then again with
the longest real label, not the placeholder.

**10. Motion, if any.** Durations in band for the register, ease-out, reduced-motion path
present and *content still visible* under it.

**11. Assets.** Every font, image, and icon resolves. No guessed IDs. One icon set.

**12. Theme parity.** Every fix re-checked in the other theme. Polish that only holds in
light mode is half a pass.

**Then the signature check.** Cover the logo on two screens — is it still one product?
Polish is where signatures quietly get sanded off: someone normalises the one asymmetric
thing because it looked like a mistake. Confirm it survived.

**Report:** the numbers and the diffs, one line each, plus what you found and deliberately
left for another lane.
