# `critique` — diagnosis only, no code

Prereq: SKILL.md Phase 0 (platform + register, so you judge against the right bar) and
[craft.md](craft.md) as the checklist — plus [product-ui.md](product-ui.md)'s twelve-cell
scale test and slop test when the target is product UI. See it rendered first
([verify.md](verify.md)); a critique written from source is a guess.

**Write no code in this mode.** Not "here's a quick fix", not a patch at the end. The
deliverable is a ranked, evidenced list the user can act on or hand to `improve` /
`redesign`. Offering to implement afterwards is fine; doing it unasked is not.

---

## 1. See the real thing

Screenshot every in-scope surface (drive the browser, run the screen) and read the actual
code for the ones you'll cite. A critique of a described interface is worthless. If you
cannot render it, say so and critique the code only — labelled as such.

Capture both themes if both ship, and at least 320px / tablet / desktop widths.

---

## 2. Judge against the register, not your taste

- **Product register:** the bar is trust and fluency. "Would someone fluent in
  Linear/Figma/Notion/Stripe trust this, or pause at every subtly-off component?"
  Familiarity is a feature here — do not mark a conventional dashboard down for being
  conventional.
- **Brand register:** the bar is memorability and craft. "Could someone say *AI made
  that* without doubt?" Here, conventional *is* the finding.

Say which bar you're using in the first line.

---

## 3. Run the checklist

In this order — the top of the list is where the real damage lives:

1. **Accessibility & correctness** — contrast on real pairs, focus visibility, hover-only
   affordances, labels vs placeholders, keyboard traps, gesture-only actions, touch target
   sizes, reduced-motion.
2. **Broken states** — overflow at any width, missing loading/empty/error/success,
   clipped dropdowns, mixed light/dark sections, CLS on hover.
3. **Hierarchy & information architecture** — can a first-time user find the primary
   action in two seconds? Is anything competing for the same rank?
4. **Craft** — type scale, line length, spacing rhythm, alignment, component consistency,
   palette discipline.
5. **Distinctiveness** — the absolute bans, the content/copy tells, the two-altitude
   category-reflex check, and the signature test (cover the logo: is it still this product?).
6. **Performance as perceived quality** — obvious LCP/CLS offenders. Measured numbers only
   if you actually measured.

---

## 4. Report

One finding per line. Ranked by severity, most damaging first. Each finding carries:

- **Severity** — P0 blocks shipping (a11y failure, broken state, unreadable text) ·
  P1 costs real quality · P2 is polish.
- **Where** — the surface and, when you read it, `file:line`.
- **What's wrong** — one sentence, factual. Not "the spacing feels a bit tight".
- **The fix** — one sentence, concrete enough to act on without a second conversation.

Close with **one line** naming the single highest-leverage change, and the `improve` lane
or the `redesign` depth that would deliver it. Nothing else — no score-out-of-ten unless
asked, no encouragement paragraph, no "overall this is a solid foundation".

**Panel option.** For a whole app rather than one screen, run the 2–3 expert lenses from
[redesign.md](redesign.md) §3 and reconcile their findings into one ranked list before
reporting. Same rule holds: reconcile, don't average, and still write no code.
