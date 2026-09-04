---
name: design-arwen
description: >-
  Use whenever the user wants to build, redesign, improve or critique a UI/UX,
  native or web: a web page/app/component, an iOS or Android screen, a React
  Native app, a dashboard, landing page, form, data table, settings screen,
  multi-step flow, onboarding, empty state, or design system; or asks to make
  something "more unique / bolder / quieter / more polished / less generic /
  more memorable / less AI-made", pick fonts/colors/layout/motion, fix visual
  hierarchy, spacing, contrast, a11y or UI performance, write UX copy and
  error states, or share one design language across native and web. NOT for
  backend-only or non-UI tasks; `impeccable` covers craft with no aesthetic
  direction to forge, gstack the headless-browser review of a finished page.
user-invocable: true
argument-hint: "[build|redesign|improve|critique] [target]"
license: MIT
---

# Arwen — signature design for native & web

Two failure modes kill interfaces. **Generic**: technically fine, instantly
forgettable, unmistakably AI-made. **Broken**: distinctive but unshippable —
fails contrast, ignores platform conventions, breaks on a real device. Arwen
refuses both. Every surface it touches ships **production-grade** *and* carries
**one unmistakable signature** — an ownable device someone remembers and could
not have guessed from the category alone.

It treats **web, iOS, Android, and React Native as equal citizens** — one design
identity, expressed idiomatically per platform, never lowest-common-denominator.
No setup, no scripts.

---

## Modes — pick one, then read its reference

| Mode | When | Read |
|---|---|---|
| `build` | New UI, or a new surface in an existing app. Nothing to preserve. | [references/build.md](references/build.md) |
| `redesign` | An app that already exists and must get better. Audit-first, preservation rules, expert panel. | [references/redesign.md](references/redesign.md) |
| `improve` | Scoped pass on working UI: polish, bolder, quieter, adapt, typeset, colorize, animate, harden, optimize, clarify. | [references/improve.md](references/improve.md) |
| `critique` | Diagnosis only. Ranked findings, no code written. | [references/critique.md](references/critique.md) |

**Routing.** First word matches a mode → that mode, everything after is the target.
No mode given → infer from intent and *say which you picked in one line*:
"make it bolder / fix the spacing / the colors feel flat / add motion" → `improve` ·
"review this / what's wrong with it" → `critique` · existing app + "modernise, overhaul,
elevate" → `redesign` · otherwise `build`. Two modes could fit → ask once.

**Every mode reads Phase 0–2 below.** `build`, `redesign`, and `improve` also read
[references/craft.md](references/craft.md) — the non-negotiable production rules
(color, type, layout, interaction, motion, native conventions, perf, UX copy).
`critique` reads craft.md as its checklist.

**Product register also reads [references/product-ui.md](references/product-ui.md)** —
forms, data tables, settings, multi-step flows, permissions, notifications, dashboards,
i18n/RTL. These are the surfaces real apps are made of and the ones generated UI most
reliably gets subtly wrong. Non-optional when the work touches any of them.

**Every mode that writes code ends in [references/verify.md](references/verify.md)** —
the ship gate, executed with a real browser or simulator. Not a checklist you assert.

**Signature is not a mode.** Forging one (Phase 2) is doctrine on every build and
redesign. **Adapting across platforms is not a mode either** — Phase 3 applies whenever
the thing ships more than once.

---

## Design memory — read it, then leave one behind

**On entry, look for `DESIGN.md` at the repo root** (also `docs/DESIGN.md`, `.design/DESIGN.md`).
If one exists — whoever wrote it, impeccable's included — **read it and obey it**. It
records decisions already made: the theme, the type pairing, the token names, the
signature. Those beat every reflex-reject list arwen applies. Say in one line that you
found it and what you're inheriting.

**On exit, after a `build` or `redesign`, write or update it.** Ten lines, no ceremony,
no separate init flow — the Design Read, the dials, the direction, the signature
sentence, the font pairing, the token names, and anything you deliberately broke a rule
for and why. That last one is what stops the next session (or the next model) undoing
your decision because it looked like slop.

```markdown
# DESIGN
Read: dashboard · product · ops teams · dials 3/2/9 · direction terminal-dense · scene <…>
Signature: the run-status ribbon — same shape in the table row, the detail header, the empty state
Type: Söhne Kräftig / Söhne Mono. Color: OKLCH neutrals tinted +0.008 to hue 250, one accent.
Tokens: --bg --surface --ink --muted --accent --ring, spacing 4/8/12/16/24/40
Deliberate: mono for numeric columns everywhere (tabular alignment beats the pairing rule)
```

`improve` and `critique` read it and do not rewrite it. **Identity-preservation beats
novelty** — a committed decision on disk outranks anything this skill would pick fresh.

---

## Phase 0 — Orient (30 seconds, no ceremony)

1. **Platform(s).** Web / iOS / Android / React Native / cross-platform. Decides
   which conventions in craft.md are law. Ask once if unclear.
2. **Register — this changes the rules below, so decide it first:**
   - **Brand** (marketing, landing, campaign, portfolio → design *is* the product):
     identity leads, be bolder, distinctive fonts mandatory, orchestrated motion allowed.
   - **Product** (app UI, dashboard, tool → design *serves* the product): usability
     leads. Its slop test isn't "looks AI-made" (familiarity is a *feature* here) —
     it's "would a user fluent in Linear/Figma/Notion/Stripe *trust* this, or pause
     at every subtly-off component?" **Register deltas for product:** familiar system
     sans (Inter, SF Pro, `system-ui`) is *permitted and often right* — this is the
     one explicit exception to the distinctive-font rule; use a **fixed rem type
     scale** (ratio 1.125–1.2), not fluid `clamp()`; motion is **150–250ms, state-only,
     no page-load show**; accent color reserved for primary action / current selection
     / state — never decoration; "modal as first thought" is a ban (exhaust inline &
     progressive disclosure first).
3. **What already exists.** Read current tokens/theme/one screen. Reuse a working
   system; branch out only where UX wins. **Identity-preservation beats novelty** —
   every reflex-reject/ban list — this file's and the shared floor's — applies to *new*
   choices only; an existing committed brand wins.
4. **Set the three dials** — the tunable part of every rule downstream, and the user can
   override any of them by asking ("make it calmer", "denser"):

   | Dial | 1–3 | 4–7 | 8–10 |
   |---|---|---|---|
   | **VARIANCE** (distance from convention) | conventional, trust-first | one clear point of view | experimental, award-bait |
   | **MOTION** (how much movement) | state-change only | purposeful reveals + micro-interactions | orchestrated, scroll-driven, ambient |
   | **DENSITY** (information per screen) | airy, one idea per view | balanced | dense, dashboard-grade |

   Presets: B2B SaaS product `3/3/7` · consumer landing `6/6/4` · agency or portfolio
   `8/7/3` · dashboard or tool `3/2/9` · public-sector or regulated `2/1/6` · campaign or
   event `9/8/4`. **Read the brief's vibe words and audience to place the dials, then
   state them.** Quiet constraints (accessibility-first audience, regulated industry,
   kids, trust-first commerce) **override aesthetic preference** — clamp VARIANCE and
   MOTION down regardless of what the vibe words say.

5. **Write one physical-scene sentence:** *who* uses this, *where*, under *what light*,
   in *what mood* ("a line cook glancing at a splattered tablet mid-rush"). If it
   doesn't force your theme/density/contrast, add detail until it does. Prevents 80% of
   generic output.

6. **Emit the Design Read — one line, before generating anything:**
   `Read: <page kind> · <register> · <audience> · dials <V/M/D> · direction <lane> · scene <…>`
   It is a contract the user can correct in one word. **If the brief is genuinely
   ambiguous on an axis that changes the whole design, ask ONE question — never guess
   silently, and never ask three.**

   **No user to ask?** You are a subagent, or a batch run, or nobody is at the keyboard —
   `build.md` §4 dispatches this work to subagents, so this is a normal case, not an edge
   one. Then: **decide, declare, continue.** Take the register default, put the choice in
   the Design Read with a `assumed:` prefix on every field you picked rather than read,
   and list those assumptions once at the top of your final report so whoever reads it can
   overturn them cheaply. That is what "never guess silently" asks for — the ban is on the
   *silence*, not on the deciding. Blocking a subagent on a question nobody will answer is
   the one wrong move. The same rule applies to every "ask once" in this skill and its
   references: no user → default, declare, proceed.

---

## Phase 1 — Commit to a direction (no timid middles)

Pick **one** aesthetic lane and execute with precision. Bold maximalism and refined
minimalism both win — the enemy is the evenly-hedged middle. Match the lane to the
domain: daily-use tools default dense-quiet-scannable; portfolios/campaigns/games can
be expressive. Never force a landing-page hero onto a tool.

**Name a real reference before committing** — "Klim-style specimen", "Vercel pure-black
monochrome", "1970s terminal manual". Unnamed ambition collapses into beige.

**Color strategy** (choose *before* colors), on the commitment axis:
Restrained (tinted neutrals + one accent ≤10%) · Committed (one saturated color 30–60%) ·
Full palette (3–4 named roles) · Drenched (the surface *is* the color).
Use **OKLCH**. Tint neutrals 0.005–0.015 toward the brand hue — never default-warm.
Keep the palette multi-dimensional — a UI drowned in one hue family reads uncommitted.
Modular type scale **≥1.25 ratio** (flat ~1.1 reads timid) — except product UI (above).

**Font selection is where generic dies.** Procedure: (1) write three *physical-object*
voice words ("warm and mechanical and opinionated", not "modern"); (2) list the fonts you'd
reach for by reflex and **reject any on the ban list**; (3) pick the font-as-object from a
real catalog (museum caption, diner receipt); (4) if the final pick matches your reflex,
start over. Pair on a *contrast* axis (serif+sans, geometric+humanist) or one family across
weights — never two near-identical sans.

**The product register's system-sans exemption waives this whole procedure** — it does not
send you round it again. Steps 1–4 have exactly one legal answer once the exemption
applies, so step 4 would loop forever: take `system-ui` / Inter / SF Pro, say in one line
that the product register chose it, and move on. Run the procedure only when you are
picking a display or brand face on top.

**The reflex-reject list is not in this file — read `references/anti-slop.md`**, the shared
design floor beside the installed skills (`../references/anti-slop.md`, else
`../../references/anti-slop.md`; see the *Shared floor* note below). §1 is the banned
typefaces and the four exemptions, §3 the `†` contested markers and the conflict rule.
One arwen-specific exemption to hold in mind: the **product register permits a familiar
system sans** for body text (Phase 0.2) where the floor's list would otherwise bite.

**Category-reflex check (two altitudes) — brand register only.** *First-order* — could
someone guess your theme+palette from the **category alone**? Rework. *Second-order* —
could they guess it from **category + the obvious anti-reference** ("AI tool that's *not*
SaaS-cream → editorial-typographic"; "fintech that's *not* navy-gold → terminal-dark")?
Rework until neither is guessable.

**In the product register this check is off, and that is not a concession.** Phase 0.2
says familiarity is a feature and `critique.md` forbids marking a conventional dashboard
down for being conventional; "unguessable from the category" pulls the opposite way, and
on a settings screen or a data table the two cancel and you ship generic-with-a-motif
while believing you failed. You did not. **A settings screen that a Linear user would
recognise instantly is a correct outcome** — the guessability test is measuring the wrong
thing there. What replaces it: the signature must be **one systematic UX device**, not an
aesthetic — a status grammar, a reimagined component, a consistent way of showing
pending-vs-saved — applied everywhere that state occurs and defensible in a sentence. If
you cannot name that one device, you have no signature; a new hue is not one. Judge it by
"does this make the product easier to read at a glance", never by "would a competitor's
screenshot pass for mine" (in this register it usually would, and should).

**The three saturated AI looks — defaults, not choices.** Each is legitimate *when the
brief asks for it*, and a tell when it appears anyway: (1) cream/sand body (OKLCH
L 0.84–0.97, C<0.06, hue 40–100, regardless of the token name — `--paper`, `--linen`,
`--bone` are tells in themselves) + high-contrast serif display + terracotta accent;
(2) near-black + one acid-green or vermilion accent; (3) broadsheet — hairline rules,
zero radius, dense newspaper columns. **The named reflex-reject lane is
"editorial-typographic"** — italic display serif + small mono labels + ruled rules +
monochrome, no imagery. Carry warmth via accent + type + imagery, not body bg.
Where the brief *pins* a direction, the brief always wins, including when it asks for one
of these.

---

## Phase 2 — Forge the signature (the heart of this skill)

The **one ownable device** that makes the interface unmistakable — what someone
describes recounting your product from memory. One idea, applied with discipline; not
decoration everywhere. Method:

1. **Source it from the domain's truth, not its clichés.** A real property of what the
   product *is/does*, made visible. Transit app → line-and-node route vocabulary. Writing
   tool → the caret, margin, manuscript. Mine the *thing*, not competitors.
2. **Pick ONE carrier:** a type move · a spatial move (asymmetry/overlap/grid-break) · a
   motion move (one transition the whole app rhymes with) · a material (recurring
   texture/edge/shadow language) · or a reimagined component archetype. Two signatures = none.
3. **Make it systematic.** Same logic on hero, empty state, error, loading — so it reads as
   *language*, not accident. It flexes to fit what it marks; appears once = gimmick, appears
   everywhere identically = wallpaper.
4. **Test, by register.** Both: cover the logo — can someone still tell two screens are the
   same product? Iterate until yes. **Brand only:** would a competitor's screenshot pass for
   yours? Iterate until no. **Product:** skip that second question — there the answer usually
   is yes and *should* be (Phase 1). Ask instead: is the one systematic device present on
   every surface where its state occurs, and can you defend it in a sentence?

**Spend your boldness in one place.** The signature is the memorable thing; everything
around it stays quiet and disciplined. Before shipping, Chanel's rule: look again and
remove one accessory.

State the signature in one sentence before building. Everything downstream serves it.

---

## Phase 3 — Cross-platform identity (when it ships more than once)

One identity, **idiomatic per platform** — never a web layout stuffed into a phone.
- **Shared (travels everywhere):** palette, type *personality*, the signature, motion
  character, spacing rhythm, voice/copy.
- **Divergent (obeys the platform):** navigation model, control shapes, gestures,
  transitions, density, safe-area/status handling. An iOS tab bar and a web top-nav are
  *the same identity making different correct choices*.
- **Tokens are the bridge.** Name the theme + pin the font pairing, then define
  color/space/type/radius/motion as platform-agnostic tokens mapped to: CSS variables (web),
  Asset colors + Dynamic Type (iOS), theme resources (Android), a JS theme object (RN).

---

## Ship gate & slop test

**Shared floor — `references/anti-slop.md` is law here, and it is the only copy.** The
banned typefaces (§1), the banned visual clichés (§2), and the scope-and-authority rule with
its `†` contested markers (§3) all live there, shared with every skillator design skill —
so they are not restated here and nothing on that list is enforced from memory. **Read the
file before you run the gate.** It sits beside the installed skills: try
`../references/anti-slop.md` first (the `install.sh` layout), then
`../../references/anti-slop.md` (git checkout, plugin cache). Neither resolves → say so in
one line and enforce what this file names.

Arwen adopts that floor whole and adds three of its own, on the same match-and-refuse terms:
**identical card grids** · **text that overflows its container at any width** · **the same
font every generation**. Inside an arwen-run task — any of the four modes, Phase 0 to this
gate — arwen owns the work, so the floor's conflict rule resolves in arwen's favour and you
say in one line which skill you overrode. Never resolve it by load order.

**Content & copy tells:** the "Jane Doe" effect — placeholder names, lorem, `example.com`,
fake logos, `$XX/mo`, invented metrics shipped as real. **Em-dashes in generated UI copy**
(the single most-violated tell) — use a period, a comma, or a colon. Loading messages like
"Herding pixels" or "Teaching robots to dance". Emoji as iconography.

**Theme lock:** one page never mixes light-mode and dark-mode sections by accident. Pick
the mode deliberately (dark is not "because tools look cool dark", light is not "to be
safe") and if both ship, **verify every surface in both** before calling it done.

**Accessibility is arwen's inside a design task.** Not a post-hoc audit and not a
contrast number — a design constraint that changes the layout, on this design's terms.
`skillator:a11y-proof` owns it as a *subject*: audits of code nobody is redesigning,
filed a11y bugs, AT and CI wiring. Hand it the failing pairs when the damage is wider
than the change you made; take its hand-backs when a fix needs a design decision. The floor, enforced in craft.md and verified in
verify.md: all eight states designed with **hover ≠ focus** · a visible `:focus-visible`
ring ≥3:1 everywhere · every surface fully keyboard-drivable in a sensible order · real
`<label>`s and `aria-describedby` errors · never colour as the only signal · reduced-motion
paths · touch targets ≥44pt/48dp · text resizable to 200% without loss · `aria-live` for
async results · gestures never the only route. A distinctive interface that a keyboard user
cannot operate has failed *both* of this skill's tests, not one.

**Ship gate — this list is the only one.** `verify.md` is *how* to run it and
`product-ui.md` is *what to build*; neither carries a competing gate. Each item is tagged
by what it takes to prove: `static` (readable from the source, no browser),
`browser` (needs a real render), `delegated` (another skill owns it).

| # | Item | Kind |
|---|---|---|
| 1 | Text contrast on real pairs — 4.5:1 body, 3:1 large | `static` |
| 2 | **Non-text contrast ≥3:1** — input borders, focus ring, icons, chart strokes, any control edge carrying meaning (WCAG 1.4.11) | `static` |
| 3 | Every dependency and asset URL resolves — no invented packages, no guessed image IDs | `static` |
| 4 | Labels, `aria-describedby` errors, `aria-live` regions, focus order in source order | `static` |
| 5 | Loading / empty / error / success / no-permission all designed | `static` |
| 6 | Signature present and systematic (Phase 2 test for the register) | `static` |
| 7 | No overflow at 320 / 768 / 1280 / 1920 and at 200% text zoom | `browser` |
| 8 | Keyboard: every surface drivable, visible ring, no traps | `browser` |
| 9 | Reduced-motion path works | `browser` |
| 10 | Touch targets ≥44pt/48dp — **measured, not assumed** | `browser` |
| 11 | Both themes, if both ship | `browser` |
| 12 | **Drive it for real** — screenshot the browser / run the screen | `browser` |
| 13 | LCP < 2.5s, CLS < 0.1 | `delegated` → `web-perf` |
| 14 | Native conventions, safe areas | `delegated` → `ios-design-review` / platform |
| 15 | Wider a11y damage than your own change | `delegated` → `a11y-proof` |

**No browser available? That is a terminal state, not a failure.** `static` items are
still mandatory — they need no render and there is no excuse for skipping them. Report in
exactly this shape:

```
built · verified: 1-6 (static) · not verified: 7-12 (no browser available) · delegated: 13-15 not run
```

Never write "done" or "verified" over an unrendered page, and never narrate a render you
did not perform. `build.md` §6 and `verify.md`'s driver list defer to this paragraph.

**Run this gate, don't recite it** — [references/verify.md](references/verify.md) has the
driver, the OKLCH contrast script, the overflow and state-forcing procedures, and the
report format.

---

## Compose with these skills (delegate, don't duplicate)

- **Visual artboards before code** → [references/canvas.md](references/canvas.md) (the
  optional `/design` canvas gate — the user tweaks the layout visually, then arwen builds it).
  It is also skillator's visual companion for *any* design conversation: `PRACTICE.md` §1
  routes here whenever a question is clearer shown than described, even from outside this skill.
- **Charts / graphs / KPI tiles / series colors → `dataviz`.** It owns the validated
  light+dark chart palette and mark/axis/legend rules. Don't restate them here.
- **Poster / cover / print / static art object (90% visual) → `canvas-design`.**
- **"Audit / profile my page's performance" → `web-perf`** (Chrome-DevTools workflow). Arwen
  carries the design-time perf rules; web-perf runs the measured audit.
- **Quick named theme for a static deck/report → `theme-factory`.** (Not for app design
  systems — arwen's token guidance is stronger.)
- **Motion craft → `emil-design-eng` (interruptibility, springs, `@starting-style`,
  clip-path, blur-masked transitions) and `apple-design` (gesture physics, velocity
  handoff, momentum projection, rubber-banding).** craft.md carries arwen's motion *policy*
  — when motion is allowed, how long, reduced-motion, the forbidden patterns. Those two own
  the *execution*. Building anything gesture-driven or spring-based without reading them is
  how motion ends up technically correct and lifeless. `animate` builds a single animation
  end-to-end; `find-animation-opportunities` finds where motion is missing.
- **Deep React/RN implementation → the Vercel skills:** `vercel-react-view-transitions`,
  `vercel-react-native-skills`, `vercel-composition-patterns`.

---

## Principles that carry the whole skill

- **Signature over decoration.** One ownable idea with discipline > effects everywhere.
- **Production-grade AND distinctive — never trade one for the other.**
- **Register rules everything.** Brand rewards boldness; product rewards trust. Same craft, different dial.
- **Read the room before you reach for a dial.** The audience picks the aesthetic, not your taste.
- **Native and web are peers.** One identity, idiomatic expression.
- **Diverse critique, single route.** A 2–3 expert panel sees what one lens misses; reconcile to one route, then build it — never ship a committee.
- **Accessible or it isn't production-grade.** Not a gate at the end — a constraint that shapes the layout.
- **Leave the decisions on disk.** A `DESIGN.md` is what makes the next session continue your design instead of restarting it.
- **Commit, then prove it.** Timid middles read as AI; evidence (contrast, breakpoints, reduced-motion, a real render) beats claims.
