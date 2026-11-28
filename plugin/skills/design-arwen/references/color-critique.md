# Measured color critique
Use this for a disputed palette, confusing emphasis, color-role drift, or a specific
contrast problem. Keep critique read-only; in improve mode make only the agreed color
changes. Inherit the register and committed brand decisions from Arwen.

1. **Pin the evidence.** Record surface, theme, viewport, state and capture. For live
   UI, inspect resolved colors and token origins, then capture the render. Check the
   actual foreground and its adjacent/composited background; a translucent overlay
   over a gradient is not its CSS token on white. For screenshots, sample flat interior
   pixels and surrounding regions, not antialiased glyph edges. With no reliable sample
   or a varying background, label the estimate or unknown; don't infer token names,
   hidden states or accessibility compliance from a screenshot.
2. **Measure the hierarchy.** Report dominant surface, supporting tones, action/selected
   accents and semantic colors. When size is part of the finding, estimate the share of
   visible pixels occupied by each role in a named crop, with method and exclusions.
   Swatch count is not area. Note where contrast, OKLCH lightness/chroma or placement
   makes decoration compete with the action. Approximate or achromatic hues should
   not be used for hue-gap judgments. A portfolio hero and a dashboard have different
   jobs; no arbitrary ratio overrides the register or existing design contract.
3. **Check the relevant pairs.** Include normal text on actual surfaces, important
   states, and meaning-bearing non-text against its adjacent color. For an image or
   gradient, check the lowest-contrast relevant area or state what remains unknown.
   Use Arwen's [ship-gate thresholds and measurement method](verify.md); don't round
   a borderline failure up to a pass. Color must not be the sole signal for status.
4. **Recommend the smallest change.** Put legibility and mistaken actions before
   aesthetics. For each finding, give location/state, sampled pair or region, why it
   matters, and one replacement role or token with OKLCH and an sRGB hex fallback if
   representable. Recheck the proposed rendered pair and nearby roles in both shipped
   themes and affected states. Mark numbers as measured, modeled, or not verifiable.
   If you can't render a proposed change, don't present a modeled ratio as verified.

Report one row per meaningful issue: `location/state | evidence | effect | change |
before → after / not verified`. A small before/after crop is useful for a subtle change,
not required when the measurements explain it. Don't change code in critique mode.

Inspired by [Charles Color Analysis](https://github.com/LemonFace0309/charles-skills/tree/main/skills/design/charles-color-analysis).
Contrast criteria: [WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
and [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
