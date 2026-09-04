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

## Reading their edits back

The user edits artboards in the published canvas and saves a new version. That save is a
republish of the same artifact.

- **Re-read the artifact before building** — `Artifact` with `action: "read"` and its URL.
  Never build from the version you drafted; build from the version they saved.
- **Treat their moves as decisions, not suggestions.** If they widened a column, the
  column is wide. Ask only when an edit contradicts a craft.md floor (a contrast failure,
  a touch target under 44pt) — then say which floor and offer the nearest version that
  clears it.
- **Diff their canvas against your plan and restate the route in two lines** before
  writing code, so the written brief the build subagents receive matches what the user
  actually approved.

Then continue at [build.md](build.md) §3 — walking skeleton, subagent build-out, ship gate.
The artboards are the brief now; the code must match them, and the ship gate still applies
in full. **A canvas the user approved is not evidence the interface works** — it still has
to be rendered, measured, and seen.
