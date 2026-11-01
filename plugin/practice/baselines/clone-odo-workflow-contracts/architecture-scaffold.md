# SmallSlot architecture planning scaffold

Status: planned, not implemented or verified. Based on `skills/clone-odo/references/architecture.md:3?33` and `templates/architecture.md`. Source requirements: fixture recon lines 2?6 and feature rows F1/F2. Fields/routes below are unresolved design proposals, not observed original behavior.

## Stack
| Layer | Existing/chosen tool | Reason | Owner decision or unresolved constraint |
|---|---|---|---|
| App/UI | Unselected | Web booking scope | Project constraints absent; pack web defaults are options |
| Database/access | Unselected single managed relational database | Transactional booking and owned views | Choose engine, migration system, RLS or shared authorization layer |
| Auth | Unselected | Host reads own bookings | Host session mechanism and lifecycle unresolved |
| Payments/email/jobs/files/hosting | Unselected; applicability unresolved | Duplicate payment webhook is a fixture risk, not a paid-booking requirement | Owner chooses accounts/providers; no provisioning |

## Schema and authorization
Schema/migration location: not created; implementation owner must supply actual schema.sql or named first migration before implemented acceptance.

| Entity | Keys/ownership | Relations/delete rule | Status/time/money | Constraints/index rationale | Access rule | Evidence/confidence |
|---|---|---|---|---|---|---|
| User | Proposed id; host owner | EventType owner FK; delete rule unresolved | Proposed timestamps | Owned lookup indexes require query review | Own host records only; guest gets no user data | Entity explicit, fields inferred |
| EventType | Proposed id, owner_id | User FK; Booking FK relation proposed | Availability/timezone model unresolved | Authoritative available-slot model required | Public safe availability; host-owned mutation if in scope | Entity explicit; schema guess |
| Booking | Proposed id, event_type_id, request identity | Ownership through EventType; deletion policy unresolved | Proposed UTC interval plus display timezone; status values unresolved; payment not scoped | Atomic no-overlap/capacity plus idempotency invariant; indexed host query | Guest create validated booking; host reads own only | Entity explicit; fields inferred |

Isolation/race acceptance: FL01-E1 concurrent clients reserve same slot -> one authoritative reservation; FL01-E2 repeated submission -> one stored booking; FL02-N1 second host cannot read other host bookings. Commands/results/date absent. Implement transaction/access constraints and test isolated DB, not just disabled UI.

## Per-flow API and jobs
| FL ID | Method/path/action | Caller permission | Validated input | Output/errors | Ownership/idempotency |
|---|---|---|---|---|---|
| FL01 S01/F1 | Read availability, route/method TBD | Public restricted fields | EventType/time range/zone, schema TBD | Available slots or explicit empty/error | No private host/guest data; authoritative recheck on create |
| FL01 S02?S03/F1 | Reserve slot, route/method TBD | Guest | Slot identity, guest details, request identity; exact fields TBD | Confirmation or invalid/conflict response | Atomic reservation, repeat request returns same stored outcome |
| FL02 S04/F2 | List own bookings, route/method TBD | Authenticated host | Filter/pagination TBD | Own records or unauthenticated/forbidden | Ownership derived server-side, never trusted caller owner ID |

Webhooks: payment applicability pending; if added, record official source/event/signature/stored event identity/retry and duplicate-delivery tests. No provider picked or endpoint created.
Jobs: not specified by approved requirements. Resolve applicability; if required, record schedule, UTC/user-zone, bounded retry, duplicate handling, dead-letter and recovery. No invented recurring jobs.

## Risks and build order
| Milestone | S/FL/F IDs | Tables/routes | Acceptance test | Risk/decision |
|---|---|---|---|---|
| Thin booking slice | S01?S03 / FL01 / F1 | EventType/Booking; availability/reserve actions TBD | FL01-H1 one available slot leads to persisted booking and confirmation | Slot uniqueness, repeated submit |
| Host must-have | S04 / FL02 / F2 | User/EventType/Booking; own-list action TBD | FL02-H1 own booking visible; FL02-N1 foreign bookings denied | Cross-user isolation |
| Harden supported states | Both flows / F1/F2 | Same authoritative schema/API | FL01-E3 DST/zone conversion; back/refresh/offline and expired-session cases | UTC storage, user-zone presentation |
| Should/could/improvements | None currently approved | None | Research-backed additions only after must acceptance | No scope expansion from sample template |

## Handback
3 known entities; 3 proposed action contracts; 0 chosen stack tools; 0 schema/migration artifacts or executed tests. Largest risks: race/double submit (FL01-E1/E2), timezone/DST (FL01-E3), isolation (FL02-N1). Duplicate payment webhook remains a conditional fourth risk. Route paths, SQL, auth lifecycle, delete rules and stack await implementation-owner review. Next: design measurement handoff and backend implementation contract after decisions. Planning is not a migrated database.
