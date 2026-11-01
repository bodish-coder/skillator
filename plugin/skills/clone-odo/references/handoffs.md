# Hand-offs — what clone-odo passes on, and what comes back

clone-odo owns the map, the matrix, the tickets for the must-haves, the
reviews, parity, the rebrand sweep, the listing lint and the preflight gate.
Implementation is another skill's job; clone-odo supplies complete stage contracts
through [the workflow index](workflow.md). Each block below says what clone-odo
passes, what the other skill owns, and what clone-odo checks when it comes
back. The guard (SKILL.md §0, `clean-room.md`) travels with every hand-off.

## Build — `skillator:build-jarvis`

**Passes**, one F ticket at a time (SKILL.md §3):

- the ticket line, with its `FL<nn>` and `S<nn>`;
- the feature's row from `.skillator/clone/features.csv`;
- the screens and flow from `.skillator/clone/recon.md`, the data model's
  entities with their confidence;
- the `FL<nn>` cases the work must pass (`templates/test-plan.md`);
- the guard, as one line in the task: build from the map and the project's
  tokens; nothing from the original's source, words or assets; run the sweep
  before calling a screen done.

- the platform's stack default, unless the user already has a stack - then theirs:

| platform | default | swap for |
|---|---|---|
| web | Next.js (App Router) + TypeScript, Tailwind on the clone's own tokens | Remix, SvelteKit, Rails |
| Android | Expo (React Native) — one codebase with iOS | Kotlin + Jetpack Compose |
| iOS | Expo (React Native) — one codebase with Android | SwiftUI |
| Windows | the web clone in a Tauri shell (Q-F114-1) | Electron, WinUI 3, a PWA |
| data, auth, payments, email (all platforms) | Postgres on Supabase or Neon with Drizzle or Prisma; Supabase Auth or Auth.js; Stripe; Resend or Postmark | PlanetScale or Turso; Clerk; Lemon Squeezy or Paddle; SES |

One database, no microservices; the clone needs the original's features, not
its architecture. Schema, API, migrations and build order are build-jarvis's execution work.
Require [architecture.md](architecture.md) and its template as the handback;
[backend.md](backend.md) supplies the backend acceptance contract.

**Owns**: the stack, the schema, migrations and access rules, the API, auth,
payments, email, integrations through official APIs with the user's own keys,
and every screen's code.

**Comes back**: the screen built, the row's `clone` flipped `no → partial →
yes`, the ticket closed. clone-odo checks that the row and the ticket agree
by reading TICKETS.md and the feature row together. `parity.py` ignores the
`ticket` column, so this reconciliation is explicit, not a claimed tool check.
[Design/build](design-build.md) defines the screen-state ledger and evidence.

## Design — `skillator:design-arwen`

**Passes**:

- the component list from the map (variants, states, screens that use them);
- the measured roles — colour roles, type scale, spacing, radius, shadow,
  layout widths — measured from `.skillator/clone/screens/`, never guessed and
  never lifted from the original's stylesheet;
- the never-take list from `clean-room.md`: logos, icons, illustrations,
  licensed fonts, the original's copy, its brand colour as a value;
- `templates/tokens.json` as the shape of the tokens file.

**Owns**: the design system, the tokens, the components and their states,
every screen's craft, the landing page.

**Comes back**: `.skillator/clone/design/tokens.json`, which
`odo.sh contrast` checks, token bindings and `design/components.md`, a primitive
gallery/captures, and components built on original assets only. See
[Design/build](design-build.md) for measured roles and state acceptance.

## Test — PRACTICE §4-5 and `skillator:screenshot-argus`

**Passes**: the flows, each with cases from `templates/test-plan.md` —
`FL<nn>-H<n>` happy path, `FL<nn>-E<n>` edge (empty and very long input,
emoji and accents, two tabs, double submit, back and refresh mid-flow, slow or
offline network, expired session, another user's data, time zones and
daylight saving, mobile width, keyboard only, screen-reader labels),
`FL<nn>-N<n>` negative (wrong password, card declined, permission denied,
deleted record).

**Owns**: PRACTICE §4 (the failing test first, the project's own runner,
selectors by role and label) and §5 (evidence before "it works");
screenshot-argus for screenshot drops.

**Comes back**: a passing suite. Every bug reproduced goes on the board
through `skillator:tickets-zordon` as one line in its format, from
`templates/bug-report.md`:
`- [ ] B<n> — <title, 60 chars or fewer>. [S<1-4>] FL<nn>-<case> on S<nn>: <actual>. Detail: .skillator/clone/bugs/B<n>.md`.
The severity token `[S1]`..`[S4]` opens the detail, so preflight's "no open S1
or S2" is one grep. The steps, expected, actual and evidence go in
`.skillator/clone/bugs/B<n>.md`, the template's second part — never a
`bugs.md`, never a multi-line block on the board. "Might be an issue" is a
separate to-check list. The clone is tested, never the original. [Testing](testing.md) supplies the
clone-specific automation/manual/evidence recipe and optional web example.

## Deploy — `skillator:deploy-merlin` or `skillator:deploy-niyoj`

**Passes**: `.skillator/clone/preflight.md`, filled from
`references/preflight.md`, every row passing, and the user's go.

**Owns**: the host, the production database, env vars, DNS and email records,
live payments, OAuth redirects, monitoring, store builds. The user buys and
signs in; no skill enters a card, a password or a live key.

**Comes back**: `.skillator/clone/deploy.md` with the actual checks, release
revision/URL or artifact, recovery/monitoring and remaining manual work, using
[Deploy](deploy.md). A prepared or blocked handoff is never called live.

## Launch proposals

clone-odo prepares the [launch contract](launch.md): landing brief, researched
pricing alternatives, listing and launch plan. design-arwen builds the page.
The owner approves prices, account settings, purchases and outbound posts;
research/proposals never authorize those actions. Return evidence and outstanding
decisions before preflight rather than stopping without the requested plan.
