# anti-slop.md — the shared design floor

The bans every skillator design skill enforces, stated **once**. Typefaces a model
reaches for by reflex, visual clichés that mark generated UI, and the rule for what
happens when another loaded skill recommends one of them.

This is a *floor*, not a style. It says what not to reach for; it never says what to
pick — that is each skill's own aesthetic, and it stays in that skill.

**It sits beside the installed skills**, like `PRACTICE.md` and `PLATFORMS.md`. Two
layouts exist, so from a `SKILL.md` try `../references/anti-slop.md` first (the
`install.sh` layout — skills at `<dest>/<name>/`, docs at `<dest>/`), then
`../../references/anti-slop.md` (git checkout, Claude Code plugin cache). From a
skill's own `references/*.md`, add one level to each. Neither resolves → say so in
one line and fall back to the summary the citing skill carries.

**Adopting it.** A design skill points at this file, names itself as the owner of
the task, and adds nothing but its own exemptions. Do not restate a ban in the citing
skill — a ban restated is a ban that drifts. When a ban changes, it changes here.

---

## 1. Reflex-reject typefaces (new brand/display choices)

Inter† · Roboto · Arial · DM Sans · DM Serif · Outfit · Plus Jakarta† ·
Instrument Sans/Serif · Space Grotesk† · Space Mono · Syne · IBM Plex · Fraunces ·
Newsreader · Lora · Crimson · Playfair Display · Cormorant.

**What this ban is and isn't.** It is a *reflex* ban: these are the faces a model
reaches for first, so reaching for one is evidence you didn't run a font procedure at
all. It applies to **new brand/display choices inside a task the citing skill owns** —
not to an existing committed brand, not to a decision already on disk in a `DESIGN.md`,
not to body text where the citing skill's register explicitly permits a system sans,
and not to a font the user or the brief names. None of those are violations; say in one
line which exemption you took.

---

## 2. Reflex-reject visual clichés (match and refuse — restructure instead)

- **Glassmorphism as a default†** — a material you chose, not the one that arrived.
- **Gradient text** (`background-clip:text`).
- **Side-stripe accent borders** — `border-left`/`border-right` >1px on cards and alerts.
- **The tiny uppercase tracked eyebrow†** above every section or heading.
- **Purple-gradient-on-white†**, and its radial mesh-gradient cousins.
- **The hero-metric template** — big number + small label + supporting stats + gradient
  accent, applied as scaffolding rather than because the number is the point.
- **01/02/03 section numbering** as default scaffolding. One deliberate numbered
  sequence, where the content *is* a sequence, is voice; numbers above every section
  is AI grammar.

---

## 3. Scope and authority

**These bans govern the work the citing skill runs** — what it produces or signs off.
They are not a global style law and not a verdict on code someone else already shipped:
on a scoped-improvement or diagnosis pass, an existing committed brand still wins.

**† Contested — another commonly-installed skill recommends this.** Marked entries
collide with skills that may be loaded at the same time. `high-end-visual-design`
prescribes heavy `backdrop-blur` glass surfaces, a pill-shaped microscopic
uppercase-tracked eyebrow above every H1/H2, and radial purple/emerald mesh gradients;
it recommends **Plus Jakarta Sans** with **Geist**/**Clash Display**/**PP Editorial New**
as its premium set while banning Inter outright; and its "Editorial Luxury" archetype
(cream `#FDFBF7` body + high-contrast display serif) is a saturated default rather than
a choice. Several agency-style skills reach for **Space Grotesk** as their default
"non-generic" sans. A design skill's product register may also *permit* Inter where
those skills forbid it.

**Conflict rule — the owning skill wins inside, advises outside.** Inside a task the
citing skill owns, this list is **authoritative**: if another loaded skill recommends
something on it, don't silently pick whichever skill loaded last — pick per this floor,
and say in one line which skill's recommendation you overrode and why. Outside such a
task — the citing skill loaded only as background context while another skill owns the
work — this list is **advice**: name the conflict once so the user can arbitrate, then
follow the skill that owns the task. If the user resolves it, their call ends the matter
and goes on disk under **Deliberate** in the project's `DESIGN.md`.

**Never resolve a conflict by load order.**
