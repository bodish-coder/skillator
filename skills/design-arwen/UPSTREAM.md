# design-arwen upstreams

Arwen absorbs rules from four outside skills (F23). This file records what it took
and from which commit, so a later change upstream can be found and absorbed on
purpose. It is also the manifest that `practice/scripts/upstream-check.sh` (and
`.ps1`) reads. Keep the table below in its current shape: the script parses the
rows under `## Upstreams`, and a row it cannot parse is an error, not a skip.

Version numbers are not a signal. `frontend-design` stayed at 1.1.0 across a
content rewrite, and `ui-ux-pro-max`'s manifests say 2.13.0 while its tags reach
v2.15.0. The check compares commits: the latest commit that touches each watched
path, against the absorbed commit. A watched commit that is already an ancestor
of the absorbed one counts as unchanged.

## Upstreams

| Name | Repo | Watched paths | Absorbed commit | Absorbed | Arwen files / sections |
|---|---|---|---|---|---|
| frontend-design | `anthropics/claude-code` | `plugins/frontend-design/skills/frontend-design` | `dbdd79cebfae5891f5b0fab6f7773ea520d289a7` | 2026-09-23 | SKILL.md Design memory (DESIGN.md example: no default mono), Phase 0.6 Read (`job`), Phase 1 Color strategy and the three looks (#D97757, #0B0B0B anchors); `craft.md` Color & type (two-family ceiling, mono only as Deliberate, serif line length), Layout & space (tiered radius/shadow, divider removal test), Motion (hover only on clickables); `build.md` section 2 Pass 1 Type, Layout (alignment, hero subject). Tell-list bans went to ticket A93 (`references/anti-slop.md`), not arwen |
| apple-design | `emilkowalski/skills` | `skills/apple-design` | `85e8e2363b713506e1d5b6e07a0eb2da66be1bc3` | 2026-09-23 | `craft.md` Color & type (three-axis dark compensation, translucency contrast, tracking and leading by size), Layout & space (rem spacing), Interaction (press feedback within 100ms, continuous gesture feedback, wayfinding and mapping), Motion (durations, momentum-only bounce, springs for gestures, interruptible, same enter/exit path, vestibular triggers in Forbidden), Backgrounds & imagery (translucent materials), Native (iOS blur no longer iOS-only, same-frame haptics), UX copy (nav names); `verify.md` Contrast (worst case under translucency), Motion at 10% speed; `critique.md` section 3 item 3; SKILL.md ship gate row 9 |
| impeccable | `pbakaus/impeccable` | `skill` | `71a3341289b86b7b628dd40d5d69c1e686a181b0` | 2026-09-23 | `craft.md` Color & type (large text is 24px / 18.67px bold, explicit colours over alpha stacks, dark mode not inverted, ::selection/caret, three-axis dark compensation), Layout & space (more space above headings, halo shadow), Interaction (hover media queries, interrupted pointer), Motion (duration bands, reduced motion means fewer not none, loops stop offscreen), Native (8dp spacing, `sp`); `product-ui.md` Inputs (16px), slop test Q6 (count rule); `verify.md` The run (screenshot validity, bounded rounds), Contrast, Colour-blind check, Reduced motion, Mechanical scan; `critique.md` sections 3-4 (counts, support tiebreak, `impeccable critique` pointer); `redesign.md` section 2; `canvas.md` floors; SKILL.md Design memory (PRODUCT.md), ship gate rows 1, 9, 16 |
| ui-ux-pro-max | `nextlevelbuilder/ui-ux-pro-max-skill` | `.claude/skills/ui-ux-pro-max/SKILL.md`<br>`.claude/skills/ui-ux-pro-max/references/quick-reference.md`<br>`.claude/skills/ui-ux-pro-max/references/pro-rules.md`<br>`.claude/skills/ui-ux-pro-max/data/ux-guidelines.csv`<br>`.claude/skills/ui-ux-pro-max/data/app-interface.csv` | `dcc40ff5133ef78276117db0cc34e7b83cc8aeba` | 2026-09-23 | `product-ui.md` Validation (error summary), Data tables (sticky header scroll-padding, 24px sort controls, chip overflow), Multi-step flows (redundant entry, consistent help); `craft.md` Interaction (sticky chrome never hides focus, 24 CSS px web target, drag alternative, press ≤100ms), Motion (interruptible, no transitionend-gated state, autoplay pause), Layout & space (dvh, long-token wrapping), Backgrounds & imagery (icon aria), Native (tab bar ≤5 labelled, web viewport never blocks zoom, heading sequence, route-change focus); `verify.md` The run (landscape), Targets and obscured focus; SKILL.md Design memory (MASTER.md), accessibility floor, ship gate rows 4, 8, 10 |

Notes on the rows:

- **Sections column.** Where each upstream's rules landed in F23b (2026-09-24).
  The ruling on each contradiction, and why each row was or was not absorbed, is in
  `docs/plans/F23-upstream/<name>.md`.
- **impeccable** watches the source tree `skill/` (SKILL.src.md plus
  `reference/`). The built copy under `.claude/skills/impeccable/` is generated
  from it. It was read at tag `skill-v4.3.1`.
- **ui-ux-pro-max** was read at `dcc40ff`. The five watched files last changed at
  `a38d04c` (v2.15.0), an ancestor, so they check as unchanged. Watch only the
  `.claude/skills/` copy: the plugin ships that one, and `src/` differs from it.
  The other datasets (`styles.csv`, `typography.csv`, ...) are deliberately not
  watched; the report explains why arwen skips them.
- **A94 reverts (2026-09-24).** Five F23b rulings were taken back out because a
  run gave them no failing test (the RED already passed 2/2) or the GREEN did not
  pass 2/2: sign-in paste + autocomplete, scrim only
  when blocking, flat fill default, motion answers a person (ambient sparingly),
  and the fresh render reviewer. Record: `practice/baselines/scenario-arwen-f23b-*.txt`.
- **Absorbed** is the date arwen took the content in, not the upstream commit date.

## When the check reports a change

`upstream-check.sh` only detects. It prints `changed <name> <old>..<new>` with a
compare URL and exits 1; grayskull-power's arming turns that into one A ticket,
`absorb <name> <old>..<new> into design-arwen`. Nothing edits arwen
automatically. Whoever takes that ticket:

1. **Read the diff.** Open the compare URL and read every change to a watched path,
   not only the commit messages. A version bump with no rule change still counts
   as absorbed; skip to step 5.
2. **Map it.** For each changed rule, name the arwen file and section it lands in,
   or say why it does not land (another skill owns it, it is a category default
   arwen refuses, it is a polish number). Use the F23a report's table as the
   template, and append the new rows to that report.
3. **RED, then GREEN, with `skill-smith`.** Write a scenario that today's arwen
   fails because the new rule is missing. Run it and keep the failing transcript.
   Then edit arwen in its own voice (depth in `references/`, SKILL.md within its
   budget) and rerun until it passes. The existing arwen GREENs are the
   regression set; they must still pass.
4. **Nothing changed in arwen?** That is allowed when step 2 found nothing that
   lands. Say so in the ticket.
5. **Bump this file.** Set the row's absorbed commit to `<new>` (the full SHA),
   set Absorbed to today, and update the sections column. Rerun
   `upstream-check.sh`. That upstream must now print `unchanged`. Close the ticket.

A watched path that moves or disappears upstream shows up as an `error` row and
exit 2. Find the new path, update the Watched paths cell, and treat whatever
changed in the move as a normal absorb.
