---
name: func-ui
description: >-
  Turn an EXISTING UI-only / mockup / prototype frontend into a real, working
  system — when the screens are built but nothing behind them is. Use this
  whenever the user says their app is "just a UI", "only a mockup / shell",
  "not functional", "fake / hardcoded data", "no backend", "the buttons don't
  do anything / just clear", or asks to "make it real / functional", "wire it
  up", "connect the frontend to a backend / API / database", "make the buttons
  actually save", or "turn this prototype into a working app" — even if they
  don't name a stack. It scans the codebase and interviews the user to pin down
  actors and workflows, emits use-case / workflow specs to confirm, then a
  dependency-ordered plan to wire the UI to real backend functionality (it stops
  at the confirmed plan; it does not build). NOT for: turning a Figma / design
  into UI components, design / UX / accessibility review, fixing visual or
  styling bugs (wrong colors, layout, a dropdown rendering oddly), debugging a
  feature that already works, building a brand-new app from scratch with no
  existing mockup, or backend-only bug fixes.
---

# UI → Functional

A mockup lies. Every hardcoded list, every button with no handler, every screen
that reads from a fixture instead of a database — they all *imply* a working
system that isn't there. This skill's job is to find exactly where the illusion
ends, agree with the user on what "functional" actually means for each workflow,
and produce a plan to make it true. It does **not** write the implementation —
it stops at a plan the user has confirmed, so the build phase starts from
agreement, not guesswork.

Work the three phases in order. Don't skip to the plan: a plan written before
the workflows are confirmed is a plan for the wrong system.

## Phase 1 — Map the illusion, then interview

Goal: a shared, honest picture of what's real, what's faked, and what the user
actually intends. The code answers *what exists*; only the user can answer *what
it's supposed to do*. Gather the code half first so your questions are concrete.

### 1a. Scan the codebase (do this before asking anything)

Detect the stack and the frontend↔backend seam first: framework, language, and
how the UI talks to a server if at all (REST/fetch, RPC/IPC, GraphQL, none yet).
Then find the four tells of a UI-only system:

- **Hardcoded / mock data** — literal arrays and objects rendered as if real;
  fixture or `mock*/fake*/sample*` files; in-memory "fallback" datasets a
  provider falls back to when no backend is present.
- **Dead controls** — buttons, forms, and menu items whose handlers are missing,
  empty, or `console.log`; forms whose values are never submitted anywhere.
- **Calls into the void** — UI code that calls an endpoint/command/path the
  server doesn't actually serve (diff the frontend's call sites against the
  backend's registered routes/handlers).
- **Faked state** — "Running / Connected / Saved" indicators, charts, counters,
  and timers driven by constants, `setInterval`, or random data rather than a
  real source.

Produce an **inventory** as you go — for each screen/feature: what it displays,
where that data comes from (real vs mock), what actions it offers, and whether
each action does anything. This inventory is the spine of everything downstream.

### 1b. Interview the user

The code can't tell you the *intent*. Ask in small, grounded batches — reference
what you found, so questions are concrete ("Your `StudentsPage` renders a
hardcoded roster of 4 names; should students live in a database, and who's
allowed to add them?") rather than abstract ("what are your data requirements?").

Cover, roughly in this order, stopping to let the user answer:

1. **Actors & roles** — who uses this, and what is each role allowed to do?
2. **Per workflow, the real effect** — for each meaningful action you found,
   what should actually happen? (A "Start" button — does it spawn a process,
   call an API, write a row, send a message?) What's the success result, and
   what can go wrong?
3. **Source of truth** — where does real data live or come from? (database,
   external/3rd-party API, a device or process, files, the user's own input)
4. **Persistence & identity** — does state survive a refresh/restart? Are there
   accounts, auth, permissions?
5. **Real-time / external systems** — anything that streams, polls, or talks to
   hardware/another service?
6. **Scope of "functional"** — which surfaces must become real, and which are
   intentionally demo/decorative and should stay as-is (flagged, not faked)?

Ask the high-leverage questions, not an exhaustive survey. Prefer multiple-choice
when the options are knowable. If the user is non-technical, drop the jargon and
ask in terms of what they want to *happen*.

## Phase 2 — Workflow artifacts (the confirmation gate)

Before any plan, write down what you now understand and get the user to confirm
it. Cheap to fix on paper, expensive to fix in code. Produce:

**Actor catalog** — each role and its capabilities, in one short table.

**Workflow specs** — one per real workflow. Keep them concrete and verifiable:

```
## <Workflow name>
Actor:        <who initiates>
Trigger:      <the UI action / event>
Preconditions:<what must be true first>
Steps:
  1. <UI action> → <system response> → <data change>
  2. ...
Data in:      <what the user/system provides>
Data out:     <what is stored / returned / shown>
Backend need: <the real capability this requires — endpoint, job, query, device>
Done when:    <observable acceptance check — how you'd prove it works for real>
```

**System map** — UI surfaces ↔ data sources ↔ backend services, showing
*current* (mock) vs *target* (real) for each, so the gap is explicit.

**Reality inventory** — the Phase-1 inventory, now labelled: REAL / MOCK /
TO-BUILD / KEEP-AS-DEMO.

Present these and ask the user to correct them. Do not proceed to the plan until
they sign off — their corrections here are the most valuable input you'll get.

## Phase 3 — Implementation plan (then stop)

Turn the confirmed workflows into a dependency-ordered plan to wire UI → real
backend. The plan is the deliverable; you hand it off (to the user, to
`writing-plans`/`/do`, or a build agent) rather than executing it.

Structure the plan so it builds a **walking skeleton first** — one workflow made
fully real end to end (UI action → backend → real data → UI reflects it) — then
widens. A thin slice that genuinely works de-risks the architecture before you
pour breadth into it; ten half-wired features prove nothing.

Cover:

- **Data model** — entities, fields, and where they're stored (DB/schema, files,
  external system). The source of truth from Phase 1.
- **Backend capabilities** — one unit of work per workflow need: the
  endpoint/command/job/query to build, with its contract (inputs → outputs,
  errors). Name what's new vs what already exists.
- **Frontend rewiring** — for each screen: which mock/hardcoded source to replace
  with the real call, and which dead control to connect to its action. Include
  the unglamorous states the mock skipped: loading, empty, and error.
- **Cross-cutting** — auth/permissions, persistence, validation, and any
  real-time/external integration, called out once rather than scattered.
- **Phasing** — ordered phases, each with its dependencies and a **verification
  step**: the concrete check that the slice works against the *real* backend, not
  the mock fallback. (A feature isn't "wired" until something proves it end to
  end — start the thing, watch the real data move.)
- **Honest cut list** — what stays mock/demo for now and why, so nothing fake is
  left masquerading as real.

End by stating the plan stops here and offering the handoff: "Confirmed? I can
hand this to `/do` / writing-plans, or start the walking-skeleton phase."

## Principles that carry the whole skill

- **Honesty over polish.** The deliverable's value is telling real from fake.
  Never let the UI's *implied* capability pass as a real one — that's the exact
  bug being fixed.
- **Intent before code.** Scanning shows what's there; the interview and the
  confirmation gate are what make the plan correct. Don't shortcut them.
- **Skeleton before breadth.** One workflow fully real beats every workflow
  half-real.
- **Verify against the real thing.** Many UI-only apps have a "fallback" that
  fakes success when the backend is absent; a wiring is only done when checked
  against the real backend, with the fallback out of the picture.
- **Don't boil the ocean.** Wire what's actually used. Decorative UI can stay,
  but label it so it's a choice, not an accident.
