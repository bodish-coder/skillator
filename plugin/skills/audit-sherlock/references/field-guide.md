# Full-system audit field guide

## Bound the evidence

Record the revision, working-tree changes relevant to the audit and the scope
the requester named. Inventory product journeys and system components, including
clients, services, shared libraries, workers, storage, integrations, installers
and release tooling where present. For each critical journey, trace an entry
point, the decision or transformation, the persisted or visible result and a
failure or recovery branch. Include a path with no ticket history.

Give each area a row in `coverage`. Record concrete paths, test names or observed
commands in its evidence. Use the following statuses consistently.

| Status | What to record |
|---|---|
| `reviewed` | Which flow and evidence justify this assessment, including its bounds. |
| `partial` | Which paths, environments or branches were sampled and what remains unchecked. |
| `unavailable` | The evidence or access that was missing and which conclusion this prevents. |
| `out-of-scope` | The boundary in the request and the component or operation it excludes. |

Summarize material omissions in `notRead`. A reviewed repository adapter and
an untested production provider can appear on separate rows. Use existing local
sources and ordinary fixture checks. Keep secret values, private customer data
and credentials out of every report artifact.

## Follow the ticket through the system

Read `TICKETS.md` and `TICKETS-archive.md` if present. On a large board, scan
the index of all rows, select by affected domain, promised behavior and touched
paths, and disclose the selection and any omissions. Search by ID and behavior
across both files, including child tickets. Treat `active` and `archive` as
source file names. An active-file row may already be done or cancelled.

1. For each in-scope promise, record its real ID, source, file/line reference,
   status and precise acceptance criterion. Follow spec, PR, test and commit
   references already in the repository. If a row lacks explicit criteria,
   identify the narrower expectation supported by its text or related spec,
   or mark it indeterminate.
2. Read the fix or decision at the cited revision. For an uncited change, use
   the ticket ID in the local Git log, then inspect the patch and callers. A
   commit mentioning an ID establishes history. Its diff and the current
   checkout establish which behavior changed and whether the path is still used.
   Record missing commits, shallow history and stale test results explicitly.
3. Read the implementation and tests at the audited revision. Trace expected
   input/state to actual output and look for an alternate caller, guard, flag,
   version or configuration that changes the conclusion. Distinguish reading
   an assertion from running it. State what a passing test actually exercises.
4. Record expectation, references, historical and current evidence, and verdict
   in `ticketReviews`. Mark a promise supported, incomplete, regressed,
   superseded by a documented decision, or unverified, as the evidence allows.
   Preserve the board status. `[%]` testing, `[v]` verified and `[x]` done all
   describe the row's workflow state. None independently verifies current behavior.

| What the trace establishes | Casefile and board outcome |
|---|---|
| A promised feature remains unfinished in an open ticket. | Describe exactly which criterion works and which is outstanding. Link the ticket. A pending future feature alone creates no defect. |
| An existing open B, F or A ticket already describes a proven current failure. | Report the defect once, link that ID and keep the existing owner and status. |
| A closed fix worked and the same failure is back. | Show the historical proof of the fix and the current failure. Link the original and any active successor. Apply the main skill's recurrence rule. |
| A closed ticket conflicts with current behavior, but the old fix cannot be established. | Report the current failure if independently proven. State that the historical claim is unresolved. |
| Different tickets or dimensions expose the same underlying failure. | Merge the evidence, give one affected behavior and one proposed repair, and preserve the useful references with their relationships. |
| The independent pass finds a verified defect never tracked. | Include its current location, user impact and repair in the casefile. Apply the main skill's board gate. |

For a cancelled or deferred ticket, inspect the owner's reason and any later
decision before judging the promise. Do not infer a new requirement from a stale
plan. A missing board, inaccessible tracker or unverified ticket is a coverage
limitation. Continue tracing the system from its entry points.

## Ask lifecycle questions that can change a conclusion

Use the applicable rows when assigning and reconciling investigations. Tie
each observation to an actual behavior, decision, check or gap.

| Stage | Question and local evidence |
|---|---|
| Requirements | Which user or operator relies on this outcome? Trace the acceptance criterion, contract, accessibility requirement or documented invariant to a real entry point. |
| Design | Where is state owned and which interfaces or trust boundaries protect it? Read the decision record and compare actual callers, permissions, defaults and recovery responsibilities. |
| Implementation | What happens under repeated execution, partial failure, concurrent updates or old data? Follow the actual writes, error returns, cleanup and rollback on a supported path. |
| Verification | Which test would fail if the promise broke? Check the assertion, fixture realism and boundary coverage. Use a focused local functional check where it can settle a disputed result. |
| Delivery and change | Does the built package, migration, installer or upgrade invoke the same implementation? Trace CI, manifests, configuration and compatibility with previously supported data or clients. |
| Operation and maintenance | How would an operator notice and recover from the particular failure? Read log and metric emission, retry bounds, backup/restore and rollback procedures where relevant. |

For a strength, identify the mechanism, its current evidence and the concrete
benefit. For example, an interrupted write that leaves the previous snapshot
readable, confirmed by the relevant fixture, is a strength worth preserving.
For a proposed improvement, identify its user impact, the smallest correction
and a check that would distinguish success from failure. Put uncertain
trade-offs into owner decisions with evidence, alternatives and consequences.
