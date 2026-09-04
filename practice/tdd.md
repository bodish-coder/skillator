# Test-first, in full

`PRACTICE.md` §4 states the law. This is the cycle, what makes a test worth
having, and the counter to every excuse for skipping it.

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Wrote code before the test? **Delete it.** Not "keep it as reference", not
"adapt it while writing the test", not "look at it once". Implement fresh from
the test. The law binds behaviour, not one-liners — a config value, a doc line,
a rename carries no test (`ponytail` governs which is which).

---

## Red · Green · Refactor

**RED — write the failing test.** One behavior. The name says what the behavior
is. It should read like the API you wish existed.

**Verify RED — watch it fail.** Run it. Read the failure. It must fail *for the
expected reason* — "function not defined", not a typo in the test file. A test
you never watched fail has never proven it can catch anything.

**GREEN — minimal code to pass.** The smallest change. Not the elegant version,
not the general version. Just green.

**Verify GREEN — watch it pass.** Run it. Read the output. Pristine — no stray
warnings, no noise.

**REFACTOR — clean up.** Now, with the test holding you. Re-run after.

**Repeat.** Next behavior, next test.

---

## What makes a test worth having

Two rules govern everything else:

```
1. Every test names the break it catches
2. Every test exercises the real thing
```

**Name the break first.** Before writing the body: *what production change
should make this fail — and is that change a bug or a decision?* A test earns
its place by catching a wrong branch, a missing side effect, a wrong argument, a
boundary, a broken contract.

**Derive expectations independently.** Literals and hand-checked fixtures;
table-driven tests with literal `want` values are the best shape. An expectation
computed by the code under test passes no matter what that code does:

```ts
// ❌ mirror assertion — the same builder computes both sides, always true
const expected = buildSearchQuery({ tag: 'urgent' });
expect(buildSearchQuery({ tag: 'urgent' })).toBe(expected);

// ✅ hand-derived literal
expect(buildSearchQuery({ tag: 'urgent' })).toBe('tag:"urgent"');
```

**No change detectors.** If only an intentional decision can fail the test — a
constant's value, exact message wording, private structure — it fires on every
redesign and sleeps through every bug. Test the behavior that depends on the
decision: not `expect(MAX_RETRIES).toBe(5)` but "a failing call is retried five
times and the sixth attempt never happens".

**Behavior, not text.** Asserting a script or config *contains* a line proves
only that the source is the source. Run it against controlled inputs and assert
outputs, side effects, or exit codes.

**Your code, not the framework.** Test the contract your code makes at its
boundaries — the route you register, the query you emit, the payload you
produce. Upstream mechanics are their maintainers' tests. (The classic: asserting
your router invokes a registered handler. That is the router's test.) Where
upstream behavior genuinely surprised you, one narrow characterization test
naming the assumption is right.

**Assert on real behavior, never on mock behavior.** A test that verifies a mock
was called verifies your test setup. Mock only what is genuinely slow or
external, and understand a dependency's side effects before mocking it.

**Keep test-only code in test utilities.** A `reset()` that exists only so tests
can run does not belong on the production class.

| Quality | Good | Bad |
|---|---|---|
| Minimal | One thing. "and" in the name? Split it. | `test('validates email and domain and whitespace')` |
| Clear | The name describes the behavior | `test('test1')` |
| Shows intent | Demonstrates the API you want | Obscures what the code should do |

---

## Common rationalizations

| Excuse | Reality |
|---|---|
| "Too simple to test" | Simple code breaks. The test takes thirty seconds. |
| "I'll test after" | Tests written after pass immediately — which proves nothing. They may test the wrong thing, test the implementation instead of the behavior, or miss the edge case you forgot. You never watched it fail, so you never proved it can catch the bug. |
| "Tests after achieve the same goal — spirit, not ritual" | Tests-after answer "what does this do?"; tests-first answer "what should this do?" Tests written after are biased by the code already in front of you: you verify the cases you remembered, not the ones you would have discovered. |
| "I already tested it manually" | Ad-hoc: no record of what you covered, no way to re-run it when the code changes, easy to forget cases under pressure. "Worked when I tried it" is not comprehensive. |
| "Deleting X hours of work is wasteful" | Sunk cost. That time is spent either way. The real choice is rewrite with TDD (high confidence) versus bolt tests on after (low confidence, likely bugs). Keeping code you cannot trust is the waste. |
| "Keep it as reference, I'll write tests first" | You will adapt it. That is testing after. Delete means delete. |
| "I need to explore first" | Fine. Throw the exploration away, then start with TDD. |
| "This is hard to test" | Listen to the test. Hard to test is hard to use — it is telling you about the design. |
| "TDD will slow me down" | TDD *is* the pragmatic path: bugs caught before commit, regressions prevented, refactoring without fear. "Pragmatic" shortcuts mean debugging in production. |
| "Existing code here has no tests" | You are improving it. Add tests for what you touch. |
| "Just this once" | No. |

**Red flags — every one of these means delete the code and start over:** code
before test · test after implementation · a test that passes immediately · you
cannot explain why the test failed · "tests added later" · "I already manually
tested it" · "it's about spirit not ritual" · "keep as reference" · "already
spent X hours" · "TDD is dogmatic, I'm being pragmatic" · "this is different
because…"

---

## Checklist before calling it done

- [ ] Every new function has a test
- [ ] You watched each test fail before implementing
- [ ] Each failed for the *expected* reason, not a typo
- [ ] Minimal code written to pass each
- [ ] All tests pass
- [ ] Output pristine — no errors, no warnings
- [ ] Tests use real code; mocks only where unavoidable
- [ ] Edge cases and error paths covered

Can't tick them all? You skipped TDD. Start over.

---

## When stuck

| Problem | Do |
|---|---|
| Don't know what to test | Write the usage you wish existed. That is the test. |
| Test needs elaborate setup | The design is wrong, not the test. Split the unit. |
| Test passes immediately | You already wrote the code, or the test asserts nothing. Check which. |
| Can't make it fail | You are testing the framework, or the assertion is a mirror. |
| Fix breaks other tests | Root cause, not patch — PRACTICE.md §7. |
