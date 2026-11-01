# Clone architecture

## Stack
| Layer | Existing/chosen tool | Reason | Owner decision or unresolved constraint |
|---|---|---|---|

## Schema and authorization
Schema/migration location:
| Entity | Keys/ownership | Relations/delete rule | Status/time/money | Constraints/index rationale | Access rule | Evidence/confidence |
|---|---|---|---|---|---|---|
Isolation and race tests:

## Per-flow API and jobs
| FL ID | Method/path/action | Caller permission | Validated input | Output/errors | Ownership/idempotency |
|---|---|---|---|---|---|
Webhooks: source/event/signature/event identity/retry.
Jobs: schedule/timezone/retry/dead-letter/recovery.

## Risks and build order
| Milestone | S/FL/F IDs | Tables/routes | Acceptance test | Risk/decision |
|---|---|---|---|---|
Core vertical slice before remaining must/should/could features.

## Handback
Stack/table/route counts, three largest risks, schema/test commands and results,
remaining approvals, next design/backend handoff. Planning versus executed:
