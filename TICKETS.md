# TICKETS

Legend: `[ ]` pending · `[~]` in-progress · `[!]` blocked · `[x]` done · `[-]` cancelled
IDs are permanent — never reuse or renumber. Append new tickets at the end of
their section.

## Bugs

- [x] B1 — ticket-master collapses large boards to bare IDs (`A295 A297 A299…`) with no titles, making the list unreadable and un-actionable; the skill said "copy the line" but had no rule for 30+ open tickets

## Features

- [x] F1 — design-arwen: product-UI depth reference (forms, tables, settings, multi-step flows, permissions)
- [x] F2 — design-arwen: delegate motion craft to emil-design-eng / apple-design / animate instead of restating it thin
- [x] F3 — design-arwen: executable ship gate — a real render/screenshot/contrast procedure, not an assertion
- [x] F4 — design-arwen: cross-session design memory (read + write DESIGN.md, interoperable with impeccable's)
- [x] F5 — design-arwen: make the `improve` lanes real procedures, starting with `polish`
- [x] F6 — design-arwen: own accessibility explicitly as a first-class gate, not scattered bullets
- [x] F7 — design-arwen: i18n / RTL / long-string / pluralisation coverage
- [ ] F8 — Extract the shared anti-slop ban list into one referenced file across the skill library
- [ ] F9 — design-arwen: strengthen the canvas gate so the artboard→code round trip beats `/design` alone

## Agent-found

- [ ] A1 — `func-ui` (skillator) and `ui-to-functional` (.agents/skills) are duplicate skills: 167 lines each, identical description and phase structure. Delete one.
- [ ] A2 — `design-taste-frontend-v1` and `design-taste-frontend` (v2) are both installed; v1 is legacy
- [ ] A3 — gstack design skills (design-review 1935, design-consultation 1564, design-html 1452, design-shotgun 1314, ios-design-review 818) each front-load ~600 lines of identical harness boilerplate before any design content — ~3000 duplicated lines across the family
- [ ] A4 — Ban lists contradict across skills: `high-end-visual-design` recommends Plus Jakarta Sans while `design-arwen` bans it; whichever skill loads first silently wins
- [ ] A5 — design-arwen has never been exercised end-to-end on a real UI task; all quality judgements to date are from reading, not output
- [ ] A6 — design-arwen's description claims "ultimate" (implying a superset); it is the best entry point but impeccable still owns depth and gstack owns the feedback loop. Reword or earn it.
- [ ] A7 — No skill in the library owns accessibility as its subject; a11y appears only as contrast + reduced-motion bullets scattered across a dozen files
