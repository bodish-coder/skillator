# PRACTICE.md — skillator's process canon

The craft every skillator skill works to. It is **merged in, not borrowed**: the
substance of the superpowers process skills lives here, in skillator's own words,
so no skillator skill has to defer to an external plugin at runtime or chain one
in front of itself.

| Section | Merged from |
|---|---|
| §1 Classify · question · scope · show it | `superpowers:brainstorming` (its visual companion routed to `design-arwen`'s artboard gate) |
| §2 Tasks are a plan | `superpowers:writing-plans`, `executing-plans` |
| §3 Self-review the design | `writing-plans` + `brainstorming` spec review |
| §4 Building | `test-driven-development`, `subagent-driven-development`, `dispatching-parallel-agents` |
| §5 Claiming it works | `verification-before-completion` |
| §6 Reviewing, and taking review | `requesting-code-review`, `receiving-code-review` |
| §7 Debugging | `systematic-debugging` |
| §8 Branch lifecycle | `using-git-worktrees`, `finishing-a-development-branch` |

The thirteenth, `writing-skills`, is merged into `skillator:skill-smith` rather
than here — it is a surface with its own workflow, not a rule the other skills
obey.

This file is the **laws** — read in full by `grayskull-power` (§0) and
`brainstorm-build-prime` / `-mid` / `-lite` (Step 0), once per session. The
mechanics sit in `practice/`, read on demand when a section sends you there:

| File | Load when |
|---|---|
| [`practice/prompts.md`](practice/prompts.md) | Dispatching any subagent — the five templates, verbatim |
| [`practice/task-loop.md`](practice/task-loop.md) | Driving a design's tasks to done — setup, model tiers, fix rounds, final review |
| [`practice/scripts/taskwork.sh`](practice/scripts/taskwork.sh) (`.ps1`) | Generating a task brief or a review package as a file, so a diff never lands in the controller's context |
| [`practice/tdd.md`](practice/tdd.md) | Writing or changing tests — the cycle, what makes a test honest, the excuse table |
| [`practice/debugging.md`](practice/debugging.md) | §7 says *trace it* — backward tracing, defense in depth, flaky tests, test pollution |

`PLATFORMS.md` owns host mechanics and `WORKFLOW.md` owns fan-out scripts; this
file owns *how the work is done*. It is craft, not a phase list — the phases live
in each SKILL.md.

---

## 1. Classify before you design (`superpowers:brainstorming`)

Say the classification out loud in the first reply so the user can override it.
It sets how much of everything below applies.

| Path | What it is | Ceremony |
|---|---|---|
| **Spike** | A feasibility question. Output is an answer, not code you keep. | 2-3 sentences of intent, a nod, then find out as cheaply as correctness allows. No design file. Anything built is labelled throwaway. |
| **Bounded** | A scoped change to a flow that **already exists in this repo** to read. | Clarifying questions, a short design in chat, then build. Design file optional — write it if the build will span a context checkpoint. |
| **Architectural** | New project, new subsystem, or a change that restructures how components fit or alters an interface others depend on. | The full phase list: 2-3 approaches, sectioned design, design file, self-review, **one approval gate**, then build. |

**Bounded measures the repo, not your familiarity.** Knowing the kind of app is
not enough — if there is no existing flow to change, it is architectural.

In doubt between two, take the heavier one. The ratchet is one-way: hidden
complexity found mid-build upgrades the path — stop, say so, step up. Nothing
downgrades mid-task.

**Oversized requests:** if the ask spans several independent subsystems, say so
before spending questions on details. Decompose into sub-projects, name the
order, and run the first one through the full cycle. Each sub-project gets its
own design file.

### The one approval gate

`superpowers:brainstorming` gates *every* path on explicit user approval before
implementation. This skill keeps autonomy for **spike** and **bounded** — that is
the deliberate difference, and it is why the classification is announced out
loud. **Architectural work stops once**, after the design file is written and
self-reviewed, and waits for a yes. Restructuring a system on an unexamined
assumption is the failure that gate exists to prevent, and one pause is cheaper
than the rebuild.

### Asking questions

- One question per message. Prefer multiple choice; open-ended is fine.
- Aim at purpose, constraints, success criteria — not implementation trivia.
- Explore the repo first: files, docs, recent commits. Follow existing patterns.
- **YAGNI ruthlessly.** Strip speculative features out of every approach before
  presenting it (see `ponytail`).
- **Design for isolation.** Units with one clear purpose and a well-defined
  interface, understandable and testable without reading their internals. A file
  growing large is a signal it does too much.
- Fix problems in existing code only where they block the work. No unrelated
  refactoring.

### Showing instead of telling

Some design questions are settled in ten seconds by a picture and never by three
paragraphs. **skillator has no separate mockup tool for this — the artboard gate
in `skillator:design-arwen` (`references/canvas.md`) is it**, and it delegates
the canvas itself to the `design` skill. One implementation, already carrying the
real palette, the real type scale and the chosen signature.

**Offer it just-in-time, never upfront.** Wait until a question would genuinely
be clearer shown than described — a real layout, flow or comparison question, not
merely a *topic* that happens to be visual. The first time that happens, offer it
**as its own message**, nothing else in it, and wait:

> "This next part might be easier if I show you — I can lay the screens out on a
> canvas you can move things around in. Want me to?"

Declined → continue in text and don't offer again unless they raise it.

**Then decide per question, not once.** Accepting makes the canvas *available*;
it does not route every question through it. The test is: would they understand
this better by seeing it than by reading it?

- **Canvas** — mockups, wireframes, layout comparisons, screen flows, where a
  signature element lands.
- **Terminal** — requirements, conceptual choices, tradeoff lists, A/B/C text
  options, scope decisions. "What does *personality* mean here?" is a
  conceptual question even though the subject is UI.

**Their edits are decisions, not suggestions.** They save a new version of the
canvas; re-read the artifact before building and build from *their* version, not
the one you drafted. Ask only where an edit breaks a floor — a contrast failure,
a touch target under 44px.

**Not a UI question?** One architecture or data-flow diagram does not want a
canvas: draw it inline (a mermaid block, or `artifact-diagramming` if the page
warrants one) and keep going.

---

## 2. The TASKS block is an implementation plan (`superpowers:writing-plans`)

`TASKS:` in the design contract is not a bullet list of intentions. A build agent
sees **only its own task** — never the design conversation — so each task must
stand alone. Bounded and architectural paths both use this shape; a spike has no
tasks.

```markdown
### Task N: <component>

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test:   `tests/exact/path/test_file.py`

**Interfaces:**
- Consumes: <exact signatures this task uses from earlier tasks>
- Produces: <exact names, parameter and return types later tasks rely on>

- [ ] Step 1: write the failing test   <actual test code>
- [ ] Step 2: run it, confirm it fails <exact command + expected failure>
- [ ] Step 3: minimal implementation   <actual code>
- [ ] Step 4: run it, confirm it passes<exact command>
- [ ] Step 5: commit                   <exact git command>
```

**Task right-sizing:** a task is the smallest unit that carries its own test
cycle and is worth a fresh reviewer's gate. Fold setup, config, scaffolding and
docs into the task whose deliverable needs them. Split only where a reviewer
could reject one task while approving its neighbour. Each task ends with an
independently testable deliverable.

**No placeholders.** These are design failures, never write them: "TBD",
"implement later", "add appropriate error handling", "add validation", "write
tests for the above" without the test code, "similar to Task N" instead of
repeating the code, a step that says what without showing how, a reference to a
type or function no task defines.

---

## 3. Self-review the design before anyone builds it

Run this yourself, inline, on the design file. Not a subagent, not a second pass.

1. **Coverage** — walk each requirement in the request; point at the task that
   implements it. A requirement with no task means a missing task.
2. **Placeholders** — scan for every pattern in the list above. Fix them.
3. **Type consistency** — do the signatures, names and property spellings used in
   later tasks match what earlier tasks define? `clearLayers()` in Task 3 and
   `clearFullLayers()` in Task 7 is a bug shipped in the plan.
4. **Contradictions and ambiguity** — could a requirement be read two ways? Pick
   one and make it explicit.
5. **Scope** — still one coherent implementation, or does it want decomposing?

Fix inline and move on. No re-review loop.

---

## 4. Building (`test-driven-development`, `subagent-driven-development`)

**The iron law:** no production code without a failing test first. Wrote code
before the test? Delete it — don't keep it as reference, don't adapt it while
writing the test. Implement fresh from the test.

The law binds behaviour, not one-liners: a config value, a doc line or a rename
carries no test. `ponytail` governs which is which — non-trivial logic (a branch,
a loop, a parser, a money or security path) leaves one runnable check behind.

The cycle is RED (write the failing test) → verify RED (watch it fail, for the
*expected* reason) → GREEN (minimal code) → verify GREEN (watch it pass, output
pristine) → REFACTOR. A test you never watched fail has never proven it can catch
anything. **[`practice/tdd.md`](practice/tdd.md)** has the cycle in full, the
rules that keep a test honest (name the break it catches; no mirror assertions;
no change detectors; assert real behavior, never mock behavior), and the
checklist.

**Per task, not per build:** each build agent gets one task, fresh context and
the design file path — never the session history. When a task comes back,
review it against its own spec before dispatching the next: spec compliance
first, then code quality. A failed review goes back to a fix agent with the
finding, not to the next task. Independent tasks fan out in parallel; tasks that
touch the same files do not.

Use the least powerful model that can fill each seat, and **always name it
explicitly** — an omitted model inherits the session's, usually the most
expensive. Cheapest for transcription and single-file mechanical work; standard
for multi-file integration; the most capable available for design judgement and
for the final whole-branch review. Fix rounds four and five go a tier above the
implementer that got stuck.

**The controller runs a bounded loop, not an open one:** dispatch → review → at
most five fix rounds → adjudicate whatever is still open → one whole-branch
review at the end. **[`practice/task-loop.md`](practice/task-loop.md)** is the
procedure; **[`practice/prompts.md`](practice/prompts.md)** is the text you
dispatch.

### Rationalizations

| Excuse | Reality |
|---|---|
| "Too simple to test" | Simple code breaks. The test takes thirty seconds. |
| "I'll test after" | Tests written after pass immediately, which proves nothing. You never watched it fail, so you never proved it can catch the bug. |
| "Spirit not ritual — tests after are the same" | Tests-after answer "what does this do?". Tests-first answer "what should this do?" The first is biased by the code already in front of you. |
| "I already tested it manually" | No record of what you covered, no way to re-run it, easy to forget cases under pressure. |
| "Deleting hours of work is wasteful" | Sunk cost. Keeping code you cannot trust is the waste. |
| "Keep it as reference, tests first from now" | You will adapt it. That is testing after. Delete means delete. |
| "This is hard to test" | Listen to the test. Hard to test is hard to use — it is telling you about the design. |
| "TDD will slow me down" | Shortcuts here mean debugging in production. |
| "Just this once" | No. |

**Red flags — each means delete the code and start over:** code before test ·
test passes immediately · you cannot explain why the test failed · "tests added
later" · "TDD is dogmatic, I'm being pragmatic" · "this is different because…"

---

## 5. Claiming it works (`verification-before-completion`)

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

Before writing "done", "fixed", "passing", or the Outcome section:

1. **Identify** the command that proves the claim.
2. **Run** it, in full, now — not from memory of an earlier run.
3. **Read** the whole output: exit code, failure count.
4. **Verify** the output actually confirms the claim.
5. **Then** claim it, with the evidence attached.

Skipping a step is not verifying. A test suite that was green three edits ago is
not evidence. If it fails, say so with the output and feed it to rework.

| Claim | Requires | Not sufficient |
|---|---|---|
| Tests pass | Test output, 0 failures | A previous run, "should pass" |
| Linter clean | Linter output, 0 errors | A partial check, extrapolation |
| Build succeeds | Build command, exit 0 | Linter passing, logs looking fine |
| Bug fixed | The original symptom retested, passing | Code changed, assumed fixed |
| Regression test works | Red-green verified: revert the fix, watch it fail, restore | It passed once |
| Agent completed | The diff shows the changes | The agent reported success |
| Requirements met | Line-by-line against the design | Tests passing |

**Red flags — stop:** "should", "probably", "seems to" · "Great!" / "Perfect!" /
"Done!" before running anything · about to commit or push without verifying ·
trusting an agent's success report · partial verification · "just this once" ·
being tired and wanting it over · **any wording implying success you have not
run**.

| Excuse | Reality |
|---|---|
| "Should work now" | Run it. |
| "I'm confident" | Confidence is not evidence. |
| "The linter passed" | The linter is not the compiler. |
| "The agent said success" | Verify independently — check the diff. |
| "A partial check is enough" | Partial proves nothing. |
| "I'm tired" | Exhaustion is not an exemption. |
| "Different words, so the rule doesn't apply" | Spirit over letter. |

---

## 6. Reviewing, and taking review

**Requesting it.** At the end of a build, before wrap-up: dispatch one reviewer
over the whole diff with crafted context — the design file and the diff by path,
never the session history — on the most capable model available.
[`practice/prompts.md` §4](practice/prompts.md#4-final-reviewer) is the template.
`code-review:code-review` and `skillator:sherlock-codes` are the packaged
alternatives on a large surface. Findings feed rework and the Outcome section
gets updated, so the record stays true.

**Receiving it** — from a human, a reviewer agent, or a PR comment. Review is a
technical claim to evaluate, not a social event:

1. **Read** the whole thing before reacting.
2. **Understand** — restate the requirement in your own words, or ask.
3. **Verify** it against this codebase. Correct-in-general can be wrong here.
4. **Evaluate** — is it technically sound *for this code*?
5. **Respond** — a technical acknowledgement, or reasoned pushback.
6. **Implement** one item at a time, testing each.

Never "You're absolutely right!", "Great point!", or "Let me implement that now"
before step 3. Restate, ask, push back with reasoning, or just start working.

**Unclear on any item? Stop and ask before implementing any of them.** Items are
usually related; partial understanding produces the wrong change to the ones you
did understand.

---

## 7. Debugging

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

Symptom fixes are failure. When the task is a bug this runs **before** the design
— what it finds is the input the design needs. It applies to any technical issue:
test failure, production bug, wrong output, performance, build, integration.
Especially under time pressure, and especially when a fix seems obvious.

**Phase 1 — root cause.** Read the error and the whole stack trace; they often
contain the answer. Reproduce consistently — if you can't, gather more data
rather than guess. Check what changed: `git diff`, recent commits, new deps,
config, environment. In a multi-component system, instrument each boundary — log
what enters and what leaves — run it once, and let the evidence say *which*
component fails before you look inside one. Trace a bad value backwards to where
it originates and fix it there, not where it surfaced —
[`practice/debugging.md`](practice/debugging.md) has the tracing procedure, plus
defense-in-depth for after the fix, condition-based waiting for flaky tests, and
the bisect for a test that only fails inside the suite.

**Phase 2 — pattern.** Find working code that is similar, in this same codebase.
Read the reference implementation completely, not skimmed. List every difference
between working and broken, however small — "that can't matter" is where the bug
lives. Check dependencies, config, and the assumptions the working one makes.

**Phase 3 — hypothesis.** State one: "I think X is the root cause because Y."
Test it with the smallest possible change, one variable at a time. It worked →
Phase 4. It didn't → form a *new* hypothesis; never stack another fix on top.
Don't understand something? Say so.

**Phase 4 — fix.** Write the failing test case first (§4's law applies). Make one
change addressing the root cause — no "while I'm here" improvements, no bundled
refactor. Verify through §5's gate: the test passes, nothing else broke, the
issue is actually gone.

**The three-fix rule.** Fix didn't work? Count the attempts. Under three: back to
Phase 1 with the new information. **Three or more: stop and question the
architecture** — each fix revealing a new problem somewhere else, or demanding
"massive refactoring", is not a failed hypothesis, it is a wrong design. Raise it
with the user before attempting a fourth.

**Red flags — every one of these means return to Phase 1:** "quick fix now,
investigate later" · "just try X and see" · several changes at once, then run
tests · "skip the test, I'll check by hand" · "it's probably X" · listing fixes
before tracing data flow · "one more attempt" at attempt three.

---

## 8. Branch lifecycle

**Isolation, before parallel work.** Check whether you are *already* isolated
first: `git rev-parse --git-dir` differing from `--git-common-dir` means a linked
worktree — don't create a second one. That test is also true inside a submodule,
so rule that out with `git rev-parse --show-superproject-working-tree`. In a
normal checkout, ask consent before creating a worktree unless the user has
already stated a preference; honor a stated preference without asking.

Prefer the **host's native worktree tool** (`EnterWorktree`, a `/worktree`
command, a `--worktree` flag) over `git worktree add` — a manual worktree creates
state the harness can neither see nor clean up. Fall back to git only where there
is no native tool. Parallel build agents that would touch the same files need
this; agents on disjoint files do not.

Falling back to git, pick the directory in this order — an explicit user
preference always beats observed state: (1) a worktree directory the user has
already named; (2) an existing project-local worktree directory, if the repo
already has one — follow the convention that is there; (3) a sibling of the repo
root, `../<repo>-worktrees/<branch>`, never nested inside the repo where it will
be picked up by globs, watchers and test runners. Then run the project's setup —
install, env file, build — because a fresh worktree has none of it.

**Finishing.** Run the project's full suite first — a failing suite means report
the failures and stop, not offer a menu. Then detect the environment (normal repo
/ named-branch worktree / detached HEAD), confirm which base branch this work
forked from before merging anywhere, and present the choice rather than picking:

```
1. Merge back to <base-branch> locally
2. Push and create a Pull Request
3. Keep the branch as-is
```

Detached HEAD drops option 1 and the workspace stays put — it is externally
managed. Clean up a worktree only if this session created it. Push and merge stay
user-confirmed on every host; `skillator:merge-prep` and `skillator:merge-agent`
own the conflict work.

---

---

## What is not here

This file owns process. It does not duplicate the skills that own a *surface*,
and `grayskull-power` still routes to those:

| Skill | Owns |
|---|---|
| `skillator:design-arwen` | The UI/UX design itself — run it **as** the design phase when the deliverable is an interface, and its `references/canvas.md` is §1's visual companion |
| `skillator:live-build` | The app running before the first edit |
| `skillator:sherlock-codes` | A whole-codebase forensic audit |
| `skillator:ticket-master` | `TICKETS.md`, the board |
| `skillator:merge-prep` / `merge-agent` | Conflicts and merge execution |
| `skillator:handoff` / `handoff-watch` | Continuity across context loss |
| `skillator:skill-smith` | Authoring or fixing a skill — `writing-skills` merged in: the description rules, form-to-failure, bulletproofing, and subagent testing |

`dataviz` and `claude-api` are read-before-you-write references, not processes:
load them inside the design phase, never in front of it.

**Provenance.** §§1-8 plus `practice/` are merged from the superpowers process
skills named in the table at the top, rewritten in skillator's own words so these
skills stand alone on hosts where superpowers isn't installed. This is a merge,
not a live link — if superpowers evolves, this is what needs updating.

Three deliberate divergences from the originals:

1. **The approval gate** in §1 — spike and bounded stay autonomous.
2. **The subagent prompts** in `practice/prompts.md` are host-neutral rather than
   written against one harness's dispatch syntax; `PLATFORMS.md` maps the
   dispatch mechanism and the model tiers per host.
3. **The visual companion** is not reimplemented. brainstorming ships its own
   browser mockup server; skillator routes that role to `design-arwen`'s artboard
   gate, which already draws in the run's real palette and type scale and reads
   the user's edits back as decisions.
