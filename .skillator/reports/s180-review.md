# RUN-0023 s180 / F111 independent review

Verdict: **FIX-FIRST**.

Reviewed the staged 12-file diff in `.skillator/worktrees/RUN-0023-pending-f100-f104` against `docs/plans/design-2026-10-26-F111-ops-pane-layout-b-rails.md`, including the Resume regression caller ruling, then reviewed correctness. Local code-review adaptation; no source edits, commits, or external posting. CodeGraph was attempted first; it returned the main worktree's index, so worktree source was read directly.

## Blocking finding

**P2 — Unselected owner rendering reintroduces text beyond the pane width.** `plugin/mods/ops-board/hooks/pane.tsx:134-135` reconstructs an unselected owned row as `body.slice(0, -row.owner.length)` followed by the original `row.owner`. `hooks/lib/ticketsmodel.ts:56-66` truncates the combined `text`, but returns the original unbounded owner separately. When that owner is longer than the available body, the reconstruction discards the bounded text and emits the complete owner.

Verified minimal reproduction: parse a board line `- [ ] F1 — title [owner: @` followed by 80 ASCII `a` characters and `]`. At 60 columns, `rowText(ticket, 60, UNI, false, false)` returns text length 58 and owner length 81. Applying the pane's exact unselected-row construction produces **83 cells** including the rail; Mono produces **81 cells**. Both exceed 60, violating the F111 width/no-cutoff contract. This is accepted board input and uses ASCII only, so display-width ambiguity is irrelevant. An opened group with its header selected renders the ticket unselected and exposes the defect.

Keep the owner segment consistent with the bounded text: truncate/budget the displayed owner, or split only the actual suffix retained in `row.text`. Add a mounted-pane regression with an overlong owner in both styles at 60 columns, keeping the group header selected, asserting the row and all rendered text stay within the pane width. Include an ordinary owner regression to retain its right alignment and dim styling.

## Evidence and remaining assessment

- Independent direct model sweep: 280 combinations, 35 selected and expanded tickets across both styles and 40/60/80/120 columns; selected item remained in the window and computed frame height stayed <=14 in every case.
- Weighted raw heights, chip grouping, unread-tab width, showDone count widths, ASCII startup/toggle persistence, and form routing reviewed. No additional blocker identified in the scoped review.
- Extra regression callers are label/helper adaptations only; reconcile/B16 behavior assertions remain intact.
- Builder report records 381 plugin tests, 164 standalone/pi/Antigravity tests, and TypeScript checks passing. Heavy suites were not duplicated. The mounted frame helper measures composition from the mounted tree, not terminal cell geometry; this is the owner-approved plugin proof path. Current fixtures do not exercise oversized owners and therefore miss the verified failure above.
- The formerly missing durable mock templates are now present in main `.skillator/references/f111/` (`template.html`, `styles-template.html`), alongside both Python sources. No template-copy follow-up remains based on current file presence.

Re-review the owner fix and its focused regression before LAND.

## Scoped correction re-review

Final verdict: **LAND**. This supersedes the initial FIX-FIRST verdict above; the verified owner-overflow finding is resolved.

The staged correction guards the owner split with `body.endsWith(row.owner)`. When truncation removed part of the owner, the pane retains the already bounded body. When the owner is an intact suffix, splitting and rejoining it leaves the text unchanged and preserves the nested dim owner Text. The selected inverse branch remains unchanged.

Independent verification reran the exact row construction for 24 combinations: original 81-character owner and ordinary `@vidul`, 60/80/120 columns, Rails/ASCII, selected/unselected. All stayed within width, retained `F1`, and selected rows filled the width. Ordinary unselected owners remained intact, right-aligned, and eligible for the unchanged dim suffix rendering. No failures.

The new mounted regressions exercise unselected-selected-unselected transitions at all three widths in both styles, check every Text/Button width, retain the ticket ID, and require selected rows to fill the width. The ordinary-owner assertion additionally checks the dim Text and suffix alignment. These assert visible behavior and would catch the original reconstruction bug; existing behavior assertions were not weakened. The builder records the new tests failing before the fix (383 pass/4 fail), passing afterward (387 pass/0 fail), and TypeScript passing. Heavy suites were not repeated for this one-condition correction. No remaining finding within this scoped re-review.
