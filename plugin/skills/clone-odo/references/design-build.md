# Design and screen-build handbacks

## Design system: design-arwen

Read recon, the architecture and allowed screenshots. Measure roles and hierarchy,
not the target's source. Record type sizes/line heights/weights, spacing scale,
semantic color roles, radius/shadow/motion, content widths and breakpoints with
observed versus inferred values. Fonts, words, logos and other assets are original
or appropriately licensed; keep the original's identity only as sweep exclusions.

Hand back `.skillator/clone/design/tokens.json`, the stack's token bindings
(tokens.css and a theme mapping for web where applicable), and
`design/components.md` using [the component template](../templates/design-components.md).
Each component records variants, states, tokens, keyboard/screen-reader behavior
and S IDs. Include focus, disabled, loading, error and empty states when applicable.
Build primitives once in an isolated gallery/story before screens. Return gallery
captures and contrast evidence; run odo contrast on the actual token pairs. For
native platforms use their token binding and accessibility mechanisms rather than
pretending CSS/Tailwind is universal. This specifies a handback, not a second design skill.

## Build: build-jarvis

Read the map, architecture and design before each F ticket. Build the shell/routes,
then the core loop end to end before the remaining screens. A temporary fake data
layer must share the planned real interface, be labeled in build-log.md and leave
affected feature rows partial; a mock is not working backend acceptance.

For each screen, record its purpose, FL cases, components and observed states;
implement empty/loading/filled/error/no-permission/long-content states that apply.
Use the design tokens and original copy/assets. Check semantics, labels, focus,
keyboard completion and platform accessibility. Capture the clone at the same
platform viewport/state as the reference (recon.md Capture), including compact and
wide layouts for web, rather than applying web pixel widths to native apps.

Maintain [build-log.md](../templates/build-log.md) at `.skillator/clone/build-log.md`:
S ID, F ticket, tested states, real/mock data, evidence capture/command, date,
revision, done/partial and what remains. Update features.csv from demonstrated
behavior; return completed/missing counts. Follow PRACTICE's test and independent
review gates for commits rather than blindly committing once per screenshot.

Reconcile each must row's ticket against TICKETS.md explicitly. parity.py ignores
the ticket column: it cannot discover a closed ticket paired with a no/partial
feature row. Resolve that drift with evidence, without automatically closing tickets.
When behavior is unclear, revisit allowed help/walkthroughs or the owner's account;
do not inspect bundles or network calls. Next is backend if data is still mocked,
otherwise flow-based testing.
