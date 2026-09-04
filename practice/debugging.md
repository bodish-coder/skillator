# Debugging techniques

`PRACTICE.md` §7 is the process — four phases, the three-fix rule, the red flags.
This file is the four techniques it names, for when the process says *trace it*
and you need to know how.

| Technique | Reach for it when |
|---|---|
| [Backward tracing](#backward-tracing) | The error surfaces deep in a call chain |
| [Defense in depth](#defense-in-depth) | You just fixed a bad-data bug and one check feels thin |
| [Condition-based waiting](#condition-based-waiting) | A test is flaky, or sleeps |
| [Finding the polluter](#finding-the-polluter) | A test passes alone and fails in the suite |

---

## Backward tracing

A bug surfaces where the bad value is *used*, not where it was *made*. Git init
in the wrong directory, a file written to the wrong path, a database opened
against the wrong DSN — the stack trace points at the last function to touch it.
Fixing there is treating a symptom.

**Trace backward through the call chain to the original trigger, and fix at the
source.**

1. **Observe the symptom** — `git init failed in ~/project/packages/core`.
2. **Find the immediate cause** — the line that did it:
   `execFileAsync('git', ['init'], { cwd: projectDir })`.
3. **Ask what called this**, and with what. Where did `projectDir` come from?
4. **Repeat** up the chain. At each level: is this value already wrong here, or
   still right? The first level where it is wrong is the level below the bug.
5. **Fix at the trigger** — the place that produced the wrong value, not the
   place that consumed it.

Dead end — you genuinely cannot trace further (a callback boundary, a framework
entry point, dynamic dispatch)? Then fix at the symptom point, say in the commit
that you did, and add defense in depth below so the next occurrence is loud.

**Signals you should be doing this:** the error is nowhere near the entry point ·
the stack trace is long · it is unclear where the invalid data originated · you
need to know which test triggers it.

---

## Defense in depth

You fixed a bug caused by invalid data by adding a check. One check feels
sufficient. It isn't — a single check gets bypassed by a different code path, by
a refactor, or by a mock.

**Validate at every layer the data passes through. Make the bug structurally
impossible rather than currently absent.**

Single validation says "we fixed the bug". Layered validation says "we made the
bug impossible", and each layer catches a different class:

1. **Entry point** — reject obviously invalid input at the API boundary. Empty,
   missing, wrong type, does-not-exist, not-a-directory. Catches most bugs.
2. **Business logic** — the invariants only this domain knows. Catches the edge
   cases the boundary can't see.
3. **Environment guards** — refuse the dangerous thing in the dangerous context.
   "Never do this when `NODE_ENV=test`", "never against the production DSN".
4. **Debug logging** — when the other three fail, this is what tells you where.

```ts
function createProject(name: string, workingDirectory: string) {
  if (!workingDirectory?.trim()) throw new Error('workingDirectory cannot be empty');
  if (!existsSync(workingDirectory)) throw new Error(`does not exist: ${workingDirectory}`);
  if (!statSync(workingDirectory).isDirectory()) throw new Error(`not a directory: ${workingDirectory}`);
  // …
}
```

`ponytail` and this are not in conflict: four one-line guards on a path that has
already produced one real bug is the lazy option. Four layers of abstraction
around a hypothetical one is not.

---

## Condition-based waiting

A flaky test that guesses at timing is a race condition you wrote yourself. It
passes on your machine and fails in CI, or passes alone and fails under parallel
load.

**Wait for the condition you actually care about, not for a guess at how long it
takes.**

```ts
// ❌ guessing
await new Promise(r => setTimeout(r, 50));
expect(getResult()).toBeDefined();

// ✅ waiting for the thing
await waitFor(() => getResult() !== undefined, { timeout: 5000 });
expect(getResult()).toBeDefined();
```

The shape is always the same: poll the condition on a short interval, up to a
generous timeout, and fail with a message that says *what never became true* —
not "timed out after 5000ms". Most test frameworks ship one (`waitFor`,
`Eventually`, `Assert.eventually`); use theirs before writing yours.

**Reach for it when** a test contains `setTimeout` / `sleep` / `time.sleep` · a
test is flaky · a test times out only in parallel · you are waiting on anything
async.

**Don't when** the timing *is* the behavior under test — debounce intervals,
throttle windows, retry backoff. There, an arbitrary delay is correct: document
in a comment why that exact number, so the next person doesn't "fix" it.

---

## Finding the polluter

One test passes alone and fails in the suite. Some other test left state behind:
a file, a directory, a global, a database row, an env var.

**Bisect over the test files, checking for the pollution after each.**

```sh
# after each test file, does the artifact exist?
for f in $(find . -path './src/**/*.test.ts' | sort); do
  rm -rf "$ARTIFACT"
  <your test runner> "$f" >/dev/null 2>&1 || true
  [ -e "$ARTIFACT" ] && { echo "POLLUTER: $f"; break; }
done
```

Where `$ARTIFACT` is the thing that should not be there — `.git`, a stray
`tmp/`, a leaked lockfile. Run the files one at a time, not the suite; the whole
point is isolating which one does it.

Not a filesystem artifact? Same bisect, different probe: dump the global, query
the row, print the env var after each file.

Found it → the fix is in the polluting test's teardown, not in the victim.
A victim hardened against pollution hides the next one.
