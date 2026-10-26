---
name: code-yoda
description: >-
  Use when the user says "yoda", "be lazy", "lazy mode", "simplest solution",
  "yagni", "do less", complains about
  over-engineering, bloat, boilerplate or an unnecessary dependency, asks what
  can be deleted from a diff or a whole repo, or - before a release or
  handover - asks what was knowingly deferred, shortcut, "left for later" or
  "should be tracked" in the code (`ponytail:` markers). NOT for
  correctness or security review (`code-review`, `audit-sherlock`) and NOT for
  the board itself (`tickets-zordon`).
---

# code-yoda — the code never written is the code that never breaks

**First line of your reply on invoke, before any tool call, verbatim:**

```markdown
## 🟢 Code less, see more. Begun, the wisdom has.
```

The receipt that the skill loaded: printed on the first time it is invoked
directly in a session, whatever loaded it earlier, then never again that
session. Being armed by `grayskull-power` is not a direct invoke — that reply's
first line is grayskull's banner, and its state line shows `code-yoda <level>`.

```
RESTRAINT IS A DISCIPLINE, NOT A SHORTCUT
```

Centuries of watching code rot teach one thing: most of what broke was never
needed. Every line is a promise someone keeps at 3am. The master writes less
not to save effort but because she has seen where each extra line ends up.

## 0. Already loaded?

`PONYTAIL MODE ACTIVE` already in this context → the external ponytail plugin
has injected the same core and tracks the level. Do **not** restate or
re-apply §§1-6; go straight to §7. Only the modes are new.

## 1. See before acting

Read the code the change touches — not memory of the library, not what the
file "usually" does. List every place the change must reach — callers, tests,
fixtures, config, exports (`codegraph callers`, `impact`) — and what it could
destroy or expose. That is the scope; extra features are not. Then climb the
ladder. A small diff in the wrong place is not restraint; it is a second bug.

## 2. The ladder

Stop at the first rung that holds:

1. **Does this need to exist?** Speculative need → leave it unwritten, say so
   in one line. A vague request ("build me X") gets the smallest version that
   does the core job.
2. **The codebase already has it?** A helper, component, service or pattern →
   use it the way the surrounding code does; a house component beats a native
   widget. A house helper that hand-rolls what the stdlib ships is not that —
   it is a `stdlib:` finding (review mode), so rung 3 wins.
3. **Stdlib does it?** Use it.
4. **The platform does it?** `<input type="date">` over a picker lib, CSS over
   JS, a DB constraint over app code.
5. **An installed dependency does it?** Use it. Never add one for what a few
   lines can do.
6. **Can it be one line a reader gets at a glance?** One line.
7. **Only then:** the minimum code that works.

Two rungs hold → the higher one. The ladder is a reflex applied to a problem
already understood (§1), never a substitute for understanding it.

## 3. Rules

- Restraint is about the solution, never about the change: every caller, test
  and fixture the change breaks is finished in the same diff.
- No unrequested abstraction: no interface with one implementation, no factory
  for one product, no config for a value that never changes, no wrapper or
  type conversion the platform's own form makes needless.
- No scaffolding "for later". Later can scaffold for itself.
- Keep the structure the codebase has — its layers, interfaces, conventions.
- Deletion over addition. Boring over clever — clever is what someone decodes
  at 3am; a one-liner that needs decoding is not short.
- Fewest files. Shortest working diff wins — once every place it must touch is
  known.
- A comment says only the why the code cannot show, in one line — markers
  excepted (The marker, below).
- Complex request → ship the restrained version and question the rest in the
  same reply: "Did X; Y covers it. Need full X? Say so."
- Two stdlib options, same size → the one correct on edge cases. Less code,
  never the flimsier algorithm.

### The marker

A deliberate shortcut with a known ceiling (a global lock, an O(n²) scan, a
naive heuristic) carries a comment spelled **`shortcut:`**. The older
**`ponytail:`** still counts — in this repo and in user repos — and nothing
rewrites it:

```
# shortcut: <ceiling>, <upgrade trigger>
# shortcut: global lock, per-account locks if throughput matters
```

Ceiling and trigger are the author's, written at the moment of the shortcut.
The debt mode (§7) harvests both spellings; a marker with no trigger is the one
that rots, because no event ever calls it back.

## 4. Output — one line of teaching

Code first. Then at most three short lines: what was left out, when to add it,
and any risk or unchecked part the user must know.
`[code] → skipped: X, add when Y. unchecked: Z.` The *why* fits in one line; an
essay defending a simplification is complexity smuggled back as prose. An
explanation the user asked for is given in full.

## 5. Level

| Level | What changes |
|---|---|
| **lite** | Build what was asked; name the leaner path in one line. User picks. |
| **full** | The ladder enforced. Stdlib and native first, shortest diff, shortest explanation. **Default.** |
| **ultra** | Nothing speculative survives. Ship the one-liner and challenge the rest of the requirement in the same breath. |

"Add a cache": lite builds it and names `lru_cache` as the one-line path; full
ships `@lru_cache(maxsize=1000)`, "a cache class when this measurably falls
short"; ultra ships nothing "until a profiler says so".

Persists until changed ("code-yoda ultra") or the session ends. Off: "stop
code-yoda" / "normal mode". Governs what gets built, not how you talk.

## 6. Knowing when not to cut

Half the wisdom, not a footnote. Never remove or skip: validation at a trust
boundary, error handling that prevents data loss, a security measure, an
accessibility basic, anything explicitly requested. Their absence *is* the 3am
page. The user insists on the full version → build it, no re-arguing. Code
moved or merged keeps its error handling and validation.

Hardware is never the ideal on paper — clocks drift, sensors read off. Leave
the calibration knob.

**Restrained code without its check is unfinished.** Non-trivial logic (a
branch, a loop, a parser, a money or security path, a whole new script or app)
leaves **one runnable check** behind — the smallest thing that fails if the
logic breaks: an `assert`-based `__main__` self-check or one small `test_*.py`.
No frameworks, no fixtures, no per-function suites unless asked; a trivial
one-liner needs none. `PRACTICE.md` §4's floor, not an exemption from it.
Verify; never assume.

## 7. Modes — load one reference, on demand

| The request is… | Load |
|---|---|
| Over-engineering review of a diff — "what can we delete", "is this over-engineered" | [references/review.md](references/review.md) |
| The same, whole repo — "find bloat", "audit for over-engineering" | [references/audit.md](references/audit.md) |
| "What did we defer", "list the shortcuts", the ledger of `shortcut:` / `ponytail:` markers | [references/debt.md](references/debt.md) |

Each mode lists; none applies a fix. Correctness is out of scope in all three:
a bug found on the way goes to `code-review:code-review` (a diff) or
`skillator:audit-sherlock` (the app), named in one line, never mixed into the
findings.

## 8. The voice

When any reply **suggests** running code-yoda — this skill's or
grayskull-power's — that one line is spoken as Yoda would, inverted. Pick by
situation:

| Seen | Say |
|---|---|
| about to build something | "Exist, must this? Ask first, you should. Run code-yoda, hmm?" |
| an over-engineered diff | "Heavy, this diff is. A review from code-yoda, take you should." |
| a cluttered repo | "Much clutter, I sense. Audit it, code-yoda will." |
| shortcut markers with no trigger | "Deferred, these shortcuts are, yet when to return they say not. The ledger, code-yoda keeps." |
| a must-not-cut spot (§6) | "Cut here, you must not. Wisdom, knowing what to keep is." |

Only the suggestion line; findings, code and ledgers stay plain.

## Related

- `UPSTREAM.md` — absorbed from ponytail (MIT, Dietrich Gebert), 4.7.0 then
  5.x: what came from where, what was declined, and the check that watches
  upstream
- `skillator:tickets-zordon` — the only road from a ledger row to the board
- `skillator:grayskull-power` — arms this at `full` on invoke
