// SKILL.md "Showing the board" example, as a TICKETS.md plus its two printed views.
export const BOARD = `# Tickets

## Bugs

- [~] B2 — CSV export drops the last row
  - [ ] B2b — add regression test
- [!] B3 — Avatar upload 500s over 5MB (blocked: needs S3 creds from ops)
- [x] B1 — Login redirect loop
- [x] B4 — Typo on the pricing page
- [x] B5 — Footer overlaps on mobile
- [-] B6 — Old report layout

## Features

- [ ] F1 — Dark mode
- [ ] F2 — Bulk delete in the table view
- [?] F3 — Pick the chart library [decide: @asha]
- [x] F4 — Export button
- [x] F5 — Search box
- [x] F6 — Saved filters

## Agent-found

- [ ] A1 — Unhandled promise rejection in the upload worker
- [>] A2 — \`parseDate\` returns Invalid Date on empty string (deferred: after the parser rewrite)
- [x] A3 — Dead import in utils
- [x] A4 — Flaky timer test
`

const COUNT = '7 open (4 pending · 1 in-progress · 1 blocked · 1 pending decision) · 1 deferred · 9 closed (8 done · 1 cancelled) · 17 total'

export const BY_TYPE = `Bugs
  [~] B2 — CSV export drops the last row
    [ ] B2b — add regression test
  [!] B3 — Avatar upload 500s over 5MB (blocked: needs S3 creds from ops)

Features
  [ ] F1 — Dark mode
  [ ] F2 — Bulk delete in the table view
  [?] F3 — Pick the chart library [decide: @asha]

Agent-found
  [ ] A1 — Unhandled promise rejection in the upload worker
  [>] A2 — \`parseDate\` returns Invalid Date on empty string (deferred: after the parser rewrite)

${COUNT}`

export const BY_STATUS = `In progress
  [~] B2 — CSV export drops the last row

Blocked
  [!] B3 — Avatar upload 500s over 5MB (blocked: needs S3 creds from ops)

Pending decision
  [?] F3 — Pick the chart library [decide: @asha]

Deferred
  [>] A2 — \`parseDate\` returns Invalid Date on empty string (deferred: after the parser rewrite)

Pending
  [ ] B2b — add regression test (B2)
  [ ] F1 — Dark mode
  [ ] F2 — Bulk delete in the table view
  [ ] A1 — Unhandled promise rejection in the upload worker

${COUNT}`
