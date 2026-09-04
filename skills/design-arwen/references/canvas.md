# The artboard gate — tweak the layout before any code exists

Optional. Used by [build.md](build.md) §2 and [redesign.md](redesign.md) §7 in place of the
prose route gate, when the user would rather move boxes than read a plan.

It is also skillator's **visual companion** generally: `PRACTICE.md` §1 routes any design
conversation here the moment a question would be clearer shown than described, including
conversations that never entered this skill through `build` or `redesign`. Coming in that
way, you may not have run Phase 1 and 2 — draft the artboards in whatever palette, type
scale and signature the conversation has settled so far, and say in the handover line which
of those are still open.

The premise: a written design plan is cheap to correct but hard to *see*. Artboards are
cheap to correct **and** visible. The most expensive mistake in this skill is building six
surfaces off a route the user would have redirected in ten seconds had they seen it.

---

## When to open the gate

**Offer it (one line, don't insist) when:**
- The work is multi-surface — a flow, an app, a redesign of more than two screens.
- The user is non-technical, or has been correcting you in visual terms ("no, wider",
  "move that up").
- Layout is the contested axis. Boxes on a canvas settle it; paragraphs don't.

**Skip it when:**
- **There is no user, or the repo is read-only.** A subagent, a batch run, a CI pass: the
  gate needs someone to tweak the boxes and an `Artifact` publish to put them there, and
  neither exists. Say `canvas: skipped (no user)` in one line and go straight to code.
  This is the first check, before the offer conditions above — offering a canvas to
  nobody costs a turn and returns nothing.
- One component or one scoped `improve` pass. Building it is faster than drawing it.
- The question isn't visual. A requirements, tradeoff or scope question belongs in the
  terminal; a single architecture diagram belongs in a mermaid block, not a canvas.
- The user said "just do it", or is clearly in a hurry.
- The direction is already pinned by an existing design system or a Figma file.

Never make it mandatory and never make it a second full design cycle. It replaces the
route-confirmation screen; it doesn't add a phase.

---

## How to run it

1. **Delegate to the `design` skill** — it owns the canvas format. Don't hand-roll
   artboards or reimplement the editor.
2. **Draft one artboard per surface**, laid out on the single pan/zoom canvas in the order
   a user would meet them (entry → main → detail → empty/error). Include the unglamorous
   states: an empty list and an error are where routes usually turn out wrong.
3. **Carry the real design into them.** The artboards use the Phase 1 palette (actual OKLCH
   values), the chosen typefaces, the real type scale, and the Phase 2 signature visibly
   present on at least two artboards. An artboard in generic greybox proves nothing — the
   whole point is that the user is reacting to *this* direction.
4. **Use real content**, not lorem. Placeholder copy makes a layout look fine that isn't.
5. **Publish and hand over the link**, with one line on what you want feedback on
   ("the nav model and where the signature lands — the rest is settled").

---

## The round trip — turning their saved artboard into code that matches

This is the part that makes the gate worth more than a mockup. The user edits artboards in
the published canvas and saves; that save is a republish of the same artifact. Everything
below happens **once**, between their save and the first line of code. It is a gate, not a
second design cycle — one pass, one clarification round at most.

### 1. Re-read, then diff mechanically

- `Artifact` with `action: "read"` and the canvas URL. **Never build from the version you
  drafted** — build from the version they saved.
- You still have the local `.dc.html` you published. Write the returned version beside it
  in the scratch dir and run an actual `diff` of the two. Eyeballing two canvases misses
  the 12px nudges, and those are exactly the ones that make the build "not quite it".
- Turn the diff into a **change ledger**: one line per edit, bucketed as *geometry*
  (moved / resized / reordered), *content* (copy, data, labels), *style* (color, weight,
  size, radius), or *cut/added*. Anything absent from the diff is **approved as drafted** —
  say so, and stop re-litigating it.

### 2. Translate each edit into a concrete code decision

A moved box is not a vibe. Each geometry edit resolves to one named change:

| What they did on the canvas | What it means in code |
|---|---|
| Widened / narrowed a column | Re-derive the **ratio**, not a pixel width: 62/38 → `grid-template-columns: 1.6fr 1fr`. Change the track, never a hard px on one child. |
| Moved a block above another | **Reading order changed.** Move it in the DOM. Never fake it with `order:` or absolute positioning — keyboard and screen-reader order must match what they see. |
| Grew or shrank a gap | Snap to the nearest step on the spacing scale (4/8/12/16/24/40). Ship the token, not `27px`. |
| Bumped a text size | Snap to the nearest step of the Phase 1 type scale. If nothing fits, add exactly one step to the scale and say you did. |
| Rewrote copy | Their words are **final copy, verbatim** — capitalization and punctuation included. Don't "tidy" it. |
| Deleted an element | It is cut, not hidden. Remove it *and* the data fetch that fed it; ask once whether it needs to live somewhere else. |
| Moved or resized the signature | Re-run the Phase 2 systematic test in the new position. If the move breaks its rhyme across artboards, that is a conflict — §3. |

**The canvas has no responsive model.** Every geometry edit is a decision about *one* width
— the artboard's. Deriving the other breakpoints is yours: state in one line what each
edited block does at ≤640px before you build it, and don't let a widened desktop column
become a 320px overflow.

### 3. When an edit collides with a craft floor

Don't silently obey and don't silently fix. Both produce a build the user didn't approve.

- **Name the floor, give the number, offer the nearest compliant version** — one message,
  one round: *"the lighter label you set reads 3.1:1 on that surface; craft.md's floor is
  4.5:1 — nearest version is the same grey one step darker, or the same value on a
  half-tone panel. Which?"*
- The floors that edits actually hit: body contrast 4.5:1 / large text & UI 3:1 · touch
  target 44pt / 48dp · overflow at 320px · a focus ring that survives the new background ·
  reduced-motion · a colour-only signal.
- **Accessibility floors are not overridable**, by the user or by you. If no variant they
  like clears one, restructure the surface until one does — that is the design work, not a
  concession.
- Everything else *is* overridable. When they override, it stops being a rule violation and
  becomes a decision: one line in `DESIGN.md` under **Deliberate**, with the reason.
- **If the edits add up to a different direction** — new palette, new nav model, the
  signature abandoned — that is not gate feedback. Say so and go back to Phase 1 for one
  question. Do not iterate the canvas a third time.

### 4. Restate the contract, then carry it into the build

Before any code, restate in ≤5 lines: the route as approved, the ledger's geometry
decisions as numbers, the floors you flagged and how each resolved. That paragraph *is* the
brief now.

What travels into the build so the implementation cannot quietly drift:

- **The canvas URL and version** in every subagent's task brief, plus the name of the one
  artboard that task implements. A subagent that can't see the artboard will invent one.
- **The derived numbers as tokens, defined once** — grid ratios, spacing steps, type steps,
  the OKLCH values as they ended up on the canvas. Per-component pixel guesses are how six
  surfaces stop matching each other.
- **The copy verbatim**, in the brief, not paraphrased.
- **A drift check at the ship gate:** screenshot each built surface at the artboard's width
  and put it beside that artboard. Walk the ledger; every line is either visible in the
  build or is a departure you name in the report with its reason. Silent departures are the
  failure this whole gate exists to prevent.
- **One line in `DESIGN.md`:** `Artboard: <url> v<n> — approved <date>`, plus any floor
  that was overridden.

Then continue at [build.md](build.md) §3 — walking skeleton, subagent build-out, ship gate.
The artboards are the brief now; the code must match them, and the ship gate still applies
in full. **A canvas the user approved is not evidence the interface works** — it still has
to be rendered, measured, and seen.
