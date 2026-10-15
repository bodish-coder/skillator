# Full ceremony — when the work outlives the session

SKILL.md sets ceremony `full` when the work is architectural, has 4+ tasks, runs
inside a relay run, or is said to outlive this session. Lean builds skip this
file. Full adds four things on top of the phases: a session record instead of a
scratch design file, requirement ids traced to code, a handoff checkpoint, and an
Outcome section kept true through rework. (Formerly `build-vision`.)

## The session record

The design file is `docs/sessions/session-<YYYY-MM-DD>-<slug>.md`, with a header:

```
PLATFORM:     <detected host>
GRADE:        <the Step 0 grade line, verbatim>
DESIGN_MODEL: <slug>
BUILD_MODEL:  <slug(s), per task tier>
```

On top of SKILL.md's template, the design agent fills:

```
REQUIREMENTS: <R1, R2, ... one line each, one requirement per id, stable and
              never renumbered. If an id needs "and" to state it and the two
              halves can fail independently, it is two ids.>
APPROACHES:   <2-3 candidates, one line each + the tradeoff; CHOSEN says which>
TRACE:        <one row per id: | R<n> | short form | path:symbol |
              path:test_name |. The last two columns hold PATHS, never a
              claim - `covered`, `yes`, `see tests` are empty rows. Nothing
              built yet writes NONE; satisfied-by-absence writes ABSENT and
              still names the test that fails if the thing ever appears.>
```

Each TASKS block opens with `SATISFIES: R2, R5`. `REQUIREMENTS` and `TRACE` are
the two slots `skillator:spec-watson` exists for, inlined because the session
record already is the design file; read that skill when the requirements arrive
as conversation rather than a written brief.

## Checkpoint A — hand off, then shed context

After the design is on disk and self-reviewed (and, on the architectural path,
approved or parked):

1. Run `handoff-cortana` — never shed context without a verified handoff.
2. Shed context **by delegation, not by command**. A skill cannot invoke
   `/compact`. Pass build agents the design file path and let each carry its own
   context; that is the compaction. Hosts that auto-compact do the rest.
3. Only if context is genuinely tight, say so once and let the user type
   `/compact`. Continue from the design file, not chat memory.

There is no Checkpoint B: never clear or reset the session at the end.

## Outcome — Phase 4

Append to the same file once Phase 3 is green:

```
## Outcome
- Built:      <files changed>
- Why:        <key decisions, from the design and any build deviation>
- Tests:      <the verification command + actual result>
- Trace:      <the TRACE table updated to what is now true; an id still NONE is
              unbuilt work and goes to tickets-zordon before the session closes>
- Deviations: <where the build differed from the design, and why>
- Parked:     <Q-ids still open, and what each blocks>
```

## Rework — Phase 5

Address what Phase 3 surfaced, re-run verification, and update the Outcome so
the record stays true. Then run `handoff-cortana` again and relay: approach,
what shipped, test result, record and handoff paths.

## Workflow mode with ceremony

The ceremony does not move into a workflow script: write the session record
before the call and pass its path in `args`; run `handoff-cortana` and
Checkpoint A in this session, around the call.
