LAND — independent spec and staged-source review; no blocking finding.
Reviewed the full F115 design including prefix/FILES rulings, build/evidence reports, and all 16 staged files in RUN-0023-pending-f100-f104; excluded unstaged CASEFILE.md.
Verified: all six pages/forms use native Button.hotkey; repeated bindings are exclusive to the current selection/focus; confirmation handlers and consuming reconcile/refresh ui.press paths remain intact.
Verified: reconcile a/p/n, absent empty-picked binding, exact-once picked application and immediate refresh assertions; Tickets a/d/f/x/t/c/r retained, s/h unused.
Verified: text forms reset focus at entry and whitelist current controls; Input, absent, unknown and other-form focus disarm letters. No raw-key claim inferred from mounted input.
Verified: native three-cell prefixes enter selected-row/header/chip widths and keybar chrome; 40/60/80/120 long-owner tests cover both styles and selected/unselected rows; A161 manual-scroll tests remain passing.
Evidence inspected: 116 mounted-tree records; plugin 403/0, standalone 165/0, tsc/validate exit 0. Independently reran cached diff check successfully; did not repeat broad suites.
Evidence limit: these are mounted trees/props and event effects, not physical paint or native keyboard/mouse delivery. SDK Mounted.key is Client-only; owner-live checks and unresolved B17 remain explicit.
Nonblocking documentation precision: README says moving focus always moves o; Team intentionally uses established selected member (member press changes selection), as permitted by the design.
Method: direct staged-diff code-review adaptation, no implementation edits, subagents, commits or external posting.
