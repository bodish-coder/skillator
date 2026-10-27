<!-- Two parts. The board line goes on TICKETS.md under ## Bugs through
skillator:tickets-zordon (id from next-id.sh, title 60 chars or fewer, ending at
the first ". "); the severity is the first token of the detail, [S1]..[S4], so
`grep -E '^ *- \[[^x-]\] B[0-9]+[a-z]? — .*\[S[12]\]' TICKETS.md` finds every
open S1/S2. The block below the line is written to .skillator/clone/bugs/B{{n}}.md,
which the board line points at. Status lives on the board only. -->

- [ ] B{{n}} — {{short title, what is wrong}}. [{{S1 | S2 | S3 | S4}}] {{FL01-E1}} on {{S08}}: {{actual, one clause}}. Detail: .skillator/clone/bugs/B{{n}}.md

# B{{n}}: {{short title, what is wrong}}

- Severity: {{S1 | S2 | S3 | S4}}
- Flow / case: {{FL01 / FL01-E1}}
- Screen: {{S08}}
- Build: {{commit}}  Browser / device: {{Chrome 140, 1440px}}

Steps
1. {{exact step}}
2. {{exact step}}

Expected: {{what should happen}}
Actual: {{what happened}}
Evidence: .skillator/clone/bugs/B{{n}}.png, {{console error text, failing test name}}
Suspected cause: {{optional}}
