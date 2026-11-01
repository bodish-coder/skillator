# Architecture handback

Read recon.md and features.csv first. Without a map, collect recon rather than
inventing the original's behavior. Pass this contract to build-jarvis before
screen implementation; use [the architecture template](../templates/architecture.md).
Write `.skillator/clone/architecture.md` and reference the actual schema/migration.

1. Record the chosen stack by layer and why, respecting an existing project.
   Include app/UI, database, auth, payments, email, jobs, files and hosting where
   relevant. The defaults in handoffs.md are options, not a requirement to migrate.
   One managed database is enough unless a demonstrated requirement says otherwise.
2. Turn inferred entities into a real schema or ORM migration. Record IDs and
   timestamps, user/org ownership, foreign-key deletion rules, supported status
   values, query-backed indexes, UTC/timezone handling, and integer minor-unit
   money with currency where needed. Mark inferred fields and unresolved decisions.
   Choose RLS or a shared data-layer authorization check, and specify isolation tests.
3. Enforce hard invariants in the authoritative layer: booking overlap/uniqueness,
   atomic capacity changes, idempotency and tenant boundaries. A disabled button
   does not protect a race. Link each constraint to its FL case.
4. List each route/server action by flow: method/path, caller permission, validated
   input, output, errors, ownership rule. Include inbound/outbound webhooks, event
   identity, retries, background-job schedule and failed-job recovery.
5. Record applicable risks: timezone/DST, concurrent edits, provider limits,
   uploads, search, realtime/offline behavior, email deliverability and deletion.
   Use official public APIs with the owner's own projects, never private endpoints.
6. Order milestones: a thin end-to-end core slice, must-haves, should/could work,
   then research-backed improvements. Each names S IDs, FL cases, tables/routes
   and F tickets. Design and backend work consume this same contract.

Hand back stack/table/route counts, the three largest risks and their tests,
schema location and approval/unknowns. Planning is not a migrated database.
The implementation owner runs migrations and access/race tests in an isolated
test database and returns evidence before the architecture is treated as implemented.
