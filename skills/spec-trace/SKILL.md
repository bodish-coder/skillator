---
name: spec-trace
description: >-
  Use when what a feature must do exists only in conversation — a spoken brief,
  a chat thread, a ticket body, a handover — and the work outlives the session:
  a contract ending, someone else picking it up, a spec a later pass must
  re-check against the code. Also on requests for spec-driven development,
  spec-kit, specify/plan/tasks artifacts, or a traceability matrix. NOT for
  requirements already carrying stable identifiers, and not for a one-off edit.
---

# Spec trace

The requirement list is an artifact with identifiers, or it is not an artifact.

A brief that survives as prose can be read. It cannot be *checked*. The gap this
skill closes is narrow and specific, and it is the only gap a baseline actually
demonstrated: a run that preserved its brief perfectly — verbatim, with judgment
calls and an out-of-scope section — still left no way for anyone to establish,
mechanically, whether requirement four still holds.

## The two required artifacts

Both, always, before the work is called done. Neither is optional and neither
substitutes for the other.

### 1. `specs/<slug>/spec.md` — the requirements, identified

Every requirement gets a stable id: `R1`, `R2`, … Ids are permanent. Never
renumber, never reuse a retired one — a trace table is worthless the moment an
id means something different than it did last week.

One requirement per id. If an id needs the word "and" to state it, and the two
halves can fail independently, it is two requirements.

Split a spoken or written brief into ids **without paraphrasing away the
source**: keep the original wording as a block quote in the same file, under a
heading naming who said it and when. The quote is what you check the ids
against when an id turns out ambiguous.

### 2. The trace table — id to evidence

In `specs/<slug>/spec.md`, one row per requirement id, and **the Evidence
column holds a path, not a claim**:

| Id | Requirement | Satisfied by | Evidence |
|----|-------------|--------------|----------|
| R4 | One redemption per customer | `redeem/limits.py:per_customer_ok` | `tests/test_limits.py:test_second_redemption_rejected` |
| R7 | Expired coupons purged nightly | `jobs/purge.py:purge` | `tests/test_purge.py:test_expired_removed` |

"28 tests, one per requirement" is not a trace table. It is a claim of coverage
with nothing behind it, and it is exactly what a real run produced instead of
this. A row whose Evidence column says `covered`, `yes`, `see tests`, or names
no file is an empty row — write `NONE` and leave the requirement unsatisfied
rather than dress it up.

Every id appears in the table. A requirement with no code yet gets a row with
`Satisfied by: NONE` — that is the point of the table, not a defect in it.

**A requirement satisfied by something *not* existing writes `ABSENT`, and still
names a test.** "No edit path exists", "the endpoint is not exposed", "the flag
defaults off" are real ways to satisfy a requirement, and they are the one place
the Satisfied-by column has no symbol to point at. That is not licence for prose
there: write `ABSENT`, cross-reference the assumption that explains it, and put a
test that fails if the thing ever appears in the Evidence column. An absence
nothing tests is an absence that a later commit silently ends.

## Re-checking against the code

When the code and the spec have drifted apart — a handover, a resumed session,
a release — walk the table top to bottom and open the file each Evidence cell
names. Three outcomes per row:

- **Holds.** The named file still does what the id says.
- **Drifted.** The file exists, the behaviour does not match. Fix or file it.
- **Gone.** The Evidence path no longer exists. The row is now `NONE`.

Anything not `Holds` becomes a task or a ticket (`skillator:ticket-master`),
never a note in a reply. The reply is the thing that does not survive.

**Do not add a re-check discipline section to this skill or to any skill that
uses it.** Three baselines across three fixtures — including one where the
missing requirements lived in a subsystem the assigned change had no import edge
to reach — all performed the sweep unprompted, under an EM instructing them not
to. No failure was demonstrated for such a section to prevent, and the table plus
the walk above is mechanism, not exhortation.

That is a statement about three runs, not about agents. All three were
contaminated (they inherited a project file carrying related discipline), which
makes a compliance unweighable rather than reassuring, so the honest reading is
"no failure demonstrated under those conditions" — not "this never fails". A
clean run that skips the walk is new information and the section becomes earned.
The runs, the fixtures and that caveat are in
`practice/baselines/scenario-spec-kit-v3.txt`.

## Where the ids go afterwards

Every task, ticket or commit that implements a requirement names its ids:
`SATISFIES: R2, R5`. That is what makes the trace table maintainable instead of
a document someone updates by hand and then stops updating.

## What this is not

`PRACTICE.md` already owns the parts a spec-driven workflow shares with every
other kind of work, and restating them here is how they drift:

| For | Read |
|---|---|
| Classifying the request, and the questioning that removes ambiguity | `PRACTICE.md` §1 |
| Turning a spec into buildable task blocks | `PRACTICE.md` §2 |
| Reviewing the plan before anyone builds it | `PRACTICE.md` §3 |
| Building, test-first, one agent per task | `PRACTICE.md` §4 |
| Claiming it works | `PRACTICE.md` §5 |
| Turning findings into tickets | `skillator:ticket-master` |

Templates and the worked example: [references/artifacts.md](references/artifacts.md).
