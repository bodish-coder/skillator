---
name: skill-smith
description: >-
  Use when writing a new agent skill, editing an existing one, or diagnosing a
  skill agents don't load or don't follow — a SKILL.md, a slash command, a
  reference file, or an always-on file (CLAUDE.md, AGENTS.md, GEMINI.md). Also
  when the user says "write a skill", "make this a skill", "skillify this", "my
  skill isn't triggering", "the agent ignored the skill", "improve this skill",
  or asks why a rule keeps getting rationalized away. NOT for using a skill
  (just invoke it) or installing/enabling skills on disk.
---

# Skill Smith

A skill is a **reference guide for a proven technique, pattern, or rule** —
something a future agent finds and applies. It is not a narrative about how you
solved something once.

Read `PRACTICE.md` §4 and §5 at the plugin root first: the test-first law and the
evidence gate apply here unchanged. A skill is code that runs on an agent.

```
NO SKILL WITHOUT A FAILING TEST FIRST
```

That binds **new skills and edits to existing ones**. Wrote it before testing?
Delete it and start over. No exceptions for "simple additions", "just adding a
section", or "documentation updates". Don't keep the untested draft as
reference, don't adapt it while running the tests. Delete means delete.

**Violating the letter of this is violating the spirit of it.**

---

## 1. Does it deserve to exist?

**Write one when:** the technique wasn't intuitively obvious to you · you would
reach for it again across projects · it applies broadly · someone else would
benefit.

**Don't when:** it's a one-off · it's a standard practice already documented
elsewhere · it's project-specific (that belongs in `CLAUDE.md` / `AGENTS.md`) ·
it's a mechanical constraint you could enforce with a lint rule or a regex —
automate that and save the document for judgement calls.

Four shapes, and they are tested differently (§5):

| Shape | Is | Example |
|---|---|---|
| **Technique** | A concrete method with steps | `condition-based-waiting` |
| **Pattern** | A way of thinking about a problem | `flatten-with-flags` |
| **Discipline** | A rule that must survive pressure | test-first, verification-before-claiming |
| **Reference** | API docs, syntax, tool surface | a vendor's option table |

---

## 2. The description decides everything

The description is the only part of your skill most agents ever read. It is
matched against the task to decide whether the body gets loaded at all. A body
nobody loads is a file, not a skill.

**Describe *when to use it*. Never summarize what it does.**

This is the counter-intuitive one and it is load-bearing. A description that
summarizes the workflow creates a shortcut the agent takes *instead of* reading
the body. A real case: a description saying "code review between tasks" produced
exactly one review, though the skill's body specified two. Cutting the summary
down to the trigger alone made the agent read the body and do both.

```yaml
# ❌ summarizes the workflow — the body becomes optional
description: Use when executing plans - dispatches a subagent per task with review between tasks

# ❌ process detail
description: Use for TDD - write test first, watch it fail, write minimal code, refactor

# ✅ triggering conditions only
description: Use when executing implementation plans with independent tasks in the current session
```

**Violating the letter of this is violating the spirit of it.** Enumerate the
procedure in any register and the agent has a plan before it has the body.
Three disguises, each produced by a real agent that had this section open:

- **Steps in trigger costume.** "Use when you need to freeze the changelog, when
  you need to tag a build, when you need to canary…" — six `Use when` clauses
  that are the six steps. A trigger is a situation someone is *in*, never a step
  they are *on*.
- **The step list recast as nouns.** "— changelog freeze, migration dry-run,
  tag, canary, error-budget watch, promote or roll back." Nouns instead of verbs
  is the same ordered summary. So is a `Covers:` or `Steps:` tail.
- **The summary plus a disclaimer.** "Thresholds and gates are in the body —
  follow it, never this line." A summary you have to warn the reader about is
  still a summary. Delete it; don't patch it.

| Rationalization | Reality |
|---|---|
| "That is exactly what a description is for: match on the situation, disclose the contents." | Half of that is the job. The field is a retrieval key injected into every turn's system prompt, not a table of contents. |
| "It never says what the skill *does* — a reader has no idea they are getting a freeze, a dry-run and a tag." | Correct, and intended. The reader who needs that opens the body. The description's only failure mode is not firing when it should. |
| "My skill is a Reference, not a procedure. There is no workflow to short-circuit, so §2's mechanism can't apply to my shape." | Then list the parameter names as *keywords* and stop there. "Reference for X, Y and Z with units, defaults and safe ranges" is a contents summary, and an agent that reads it decides it already knows the shape of the answer. No shape is exempt. |
| "Our harness loads the body eagerly, so 'the body becomes optional' cannot happen here." | The description sits in the system prompt; the body sits hundreds of lines down. The compressed ordered version wins on salience whether or not the long one is loaded. |
| "I named the phases as nouns rather than as an ordered how-to — that is the most of the instruction I can honour." | A partial summary is a summary. There is no compliant fraction of this. |
| "The three neighbouring skills all summarize their workflow; mine would be the odd one out." | Three bugs is not a convention. |
| "The exclusions belong in the body under a scope heading, not crammed into a frontmatter line." | The `NOT for` clause is the cheapest thing in the field and the only part that stops the skill stealing its neighbours' traffic. It stays. |
| "The description is also our catalog page / runbook widget, so it has to say what's inside." | Two readers, one field, and only one of them fails silently. Fix the generator or add a second field. Don't spend the retrieval key on the human. |

**Red flags — rewrite the description if you catch yourself thinking:** "they
should know what they're getting without opening the file" · "this shape doesn't
have the failure §2 describes" · "just the phases, not the steps" · "I'll name
them as nouns" · "our setup is different" · "one short `Covers:` tail is fine" ·
"it's only a summary if it's ordered".

Then make it *findable*:

- **Concrete triggers** — the symptoms and situations that signal it applies.
- **The words someone would actually type.** Error strings ("ENOTEMPTY", "hook
  timed out"), symptoms ("flaky", "hanging", "zombie"), synonyms
  ("timeout/hang/freeze", "cleanup/teardown/afterEach"), real command and
  library names.
- **The problem, not one language's symptom of it.** "Race conditions, timing
  dependencies, inconsistent pass/fail" — not "uses setTimeout". Unless the
  skill really is technology-specific, in which case say the technology in the
  trigger.
- **Third person**, always. It is injected into a system prompt.
- **A `NOT for…` clause.** The nearest neighbours it keeps getting confused with.

**Name it by what you do, or by the core insight.** Verb-first, active,
gerunds work well for processes: `condition-based-waiting` not
`async-test-helpers`, `root-cause-tracing` not `debugging-techniques`,
`creating-skills` not `skill-creation`. In skillator, `name:` must match the
folder name — several hosts require it.

---

## 3. Match the form to the failure

**Classify the baseline failure before writing a word of guidance.** The form
that fixes one failure type measurably backfires on another.

| The agent… | Right form | Wrong form |
|---|---|---|
| Knows the rule and skips it under pressure | Prohibition + rationalization table + red flags (§4) | Soft guidance: "prefer…", "consider…" |
| Complies, but the output is the wrong shape — bloated, buried verdict, restated spec | A **positive recipe**: state what the output *is*, its parts, in order | A prohibition list: "don't restate", "never narrate" |
| Omits a required element from something it already produces | **Structural**: a REQUIRED field or slot in the template it fills in | Prose reminders near the template |
| Should behave differently in one case | A **conditional on an observable predicate**: "if the brief exists, reference it" | An unconditional rule plus exemption clauses |

**Why prohibitions backfire on shaping problems:** given a competing incentive,
agents negotiate with "don't X". In head-to-head wording tests, the prohibition
arm produced clearly more of the unwanted content than the recipe arm, and
trended worse than no guidance at all. A recipe leaves nothing to negotiate —
the output either matches the stated shape or it doesn't.

Two rules whichever form you pick:

- **No nuance clauses.** "Don't X unless it matters" reopens the negotiation.
  Appending one nuance clause to a winning recipe degraded it from consistent to
  noisy. A real exception is its own conditional on an observable predicate.
- **Exemption clauses don't scope.** "This limit doesn't apply to code blocks"
  still suppresses code blocks. If part of the output must be exempt,
  restructure so the rule cannot reach it.

---

## 4. Bulletproofing a discipline rule

Only for discipline failures — an agent that knows the rule and skips it anyway.
On wrong-shaped output this backfires; use §3 instead.

1. **Close every loophole by name.** Not "write code before the test? delete
   it", but that plus: don't keep it as reference · don't adapt it while writing
   the test · don't look at it · delete means delete.
2. **Pre-empt spirit-versus-letter** with one line up top: *violating the letter
   of the rules is violating the spirit of the rules*. It cuts off the whole
   class at once.
3. **Build the rationalization table from the baseline run**, not from
   imagination. Every excuse a real agent produced in §5's RED phase goes in it,
   in its own words, with the counter beside it.
4. **Add a red-flags list** so an agent can catch itself mid-rationalization —
   the actual sentences it will be thinking, ending in one instruction.
5. **Feed the violation symptoms back into the description**, so the skill is
   found by an agent that is currently rationalizing.

---

## 5. Test it before it ships

```
If you didn't watch an agent fail without the skill,
you don't know whether the skill prevents the right failure.
```

RED-GREEN-REFACTOR, on subagents with fresh context. The full procedure and the
scenario templates are in [references/testing.md](references/testing.md).

- **RED** — run the scenario on a subagent **without** the skill. Record the
  exact rationalizations, verbatim. They are your test case and your table rows.
- **GREEN** — write the minimum that addresses *those* failures. Run it again
  with the skill loaded.
- **REFACTOR** — find the new loophole, close it, re-verify the old ones still
  hold.

By shape: discipline skills need pressure scenarios (three pressures stacked);
techniques need an agent to actually execute the steps; patterns need an agent
to apply the mental model to a fresh problem; references need retrieval —
can an agent find the answer in it?

| Excuse for not testing | Reality |
|---|---|
| "It's obviously clear" | Clear to you is not clear to another agent. Test it. |
| "It's just a reference" | References have gaps and dead ends. Test retrieval. |
| "Testing is overkill" | Untested skills have issues. Always. Fifteen minutes saves hours. |
| "I'll test if problems emerge" | A problem is an agent that can't use the skill. That is after deployment. |
| "I'm confident it's good" | Overconfidence guarantees issues. |
| "Reading it through is enough" | Reading is not using. |
| "No time" | Deploying an untested skill costs more time than testing it. |
| "There isn't time before the freeze — the retrieval test is a follow-up ticket" | A follow-up ticket is "I'll test if problems emerge" with a due date nobody enforces. The skill is deployed by then, which is the thing the law forbids. Ship nothing rather than ship untested. |
| "It's a documentation fix, not a code change — don't put a 40-minute harness in front of a paragraph" | For a skill the paragraph *is* the code: it is the thing the agent executes. A README gets that exemption; a SKILL.md does not. |
| "I'll keep the draft open as a reference and run one quick check that it reads clearly" | Legibility was never the question — the wording that failed also read clearly. A draft you keep becomes the answer you look to confirm. |

**Red flags — you are skipping the test if you think:** "this one is small
enough" · "I'll baseline it after it lands" · "the deadline is the constraint,
not the process" · "a quick sanity read is enough this time".

**Stop after each skill.** Do not batch — write one, test it, deploy it, then
start the next. "Batching is more efficient" is how three untested skills ship
together.

---

## 6. Anti-patterns

- **Narrative.** "In session 2025-10-03 we found that…" — too specific, not
  reusable. Extract the technique; drop the story.
- **Multi-language dilution.** `example-js.js`, `example-py.py`, `example-go.go`
  — mediocre in each, and three files to maintain. One good example.
- **Code inside a flowchart.** Can't copy-paste, hard to read. Flowcharts carry
  decisions; code goes in a code block.
- **Generic labels.** `helper1`, `step3`, `pattern4`. Names carry meaning or
  they cost tokens for nothing.
- **`@`-links to other skills.** `@skills/foo/SKILL.md` force-loads immediately
  and burns context before you need it. Reference by name:
  `**REQUIRED:** use skillator:merge-prep`.
- **The body repeating the description.** Different jobs. The description is
  found; the body is followed.

---

## 7. Structure and token cost

```
skills/<name>/
  SKILL.md            frontmatter (name, description) + the body
  references/*.md     depth loaded on demand, not up front
  scripts/*           anything better executed than described
```

Only `name` and `description` are portable frontmatter — see `PLATFORMS.md`.
Anything else is dropped where unsupported, so it can never be load-bearing.

**Token budget — by what loads unconditionally, not by a flat cap.**

| What | Budget | Why |
|---|---|---|
| `description:` | ~80 words | Injected into the system prompt for *every* skill on disk, every turn. This is the expensive one. |
| Always-on files (`CLAUDE.md`, `AGENTS.md`, an activation block) | under 200 | Re-read every turn, forever |
| A router or session-opening skill | under 800 | Loaded once per session, but every session |
| An on-demand skill body | no hard cap — but depth belongs in `references/` | Paid once, inside the task that needed it |

A flat "under 500 words" figure travels around skill-writing advice and does not
survive contact with a real repo: every skill in skillator is over it, and
trimming a `sherlock-codes` down to 500 would delete the thing that makes it
work. The real question is *how often does this get loaded when it isn't
needed* — a description is read constantly, a body only when the router already
decided it was relevant.

Over the budget that applies to you → move depth into `references/`, point at
`--help` instead of documenting flags, cross-reference instead of restating, cut
the second example of the same pattern. `wc -w skills/*/SKILL.md | sort -rn`
shows where you sit against the rest of the repo, which is a better signal than
an absolute number.

The split is: **SKILL.md is the laws, `references/` is the mechanics.**
`PRACTICE.md` and its `practice/` directory are that pattern at repo scale.

**A rule several skills enforce lives once**, at the repo-root `references/` beside
`PRACTICE.md` and `PLATFORMS.md` — `references/anti-slop.md`, the shared design floor,
is the model. A skill that produces or signs off UI *cites* it, with both install
paths (`../references/anti-slop.md` first, the `install.sh` layout; then
`../../references/anti-slop.md`, git checkout or plugin cache; one level deeper from
the skill's own `references/*.md`; neither resolves → say so in one line) and adds only
its own exemptions. A ban restated in a second skill is a ban that drifts.

---

## Checklist

- [ ] It earns existence (§1) — not a one-off, not a lint rule in prose
- [ ] Baseline run done **without** the skill; rationalizations recorded verbatim
- [ ] Description is triggers only, third person, keyword-rich, with a `NOT for` clause
- [ ] No step list in the description in any register — no trigger costume, no
      noun list, no `Covers:`/`Steps:` tail, no summary-plus-disclaimer
- [ ] `name:` matches the folder name
- [ ] Form matches the failure type (§3)
- [ ] Discipline rules: loopholes named, spirit-vs-letter pre-empted, table built from the real run, red flags listed
- [ ] Re-run with the skill: the baseline failure is gone
- [ ] Loophole round done; the earlier fixes still hold
- [ ] Description under ~80 words; body's depth pushed to `references/` (§7)
- [ ] No `@`-links, no narrative, no code in flowcharts
- [ ] One skill finished and verified before the next one starts

## Related

- `PRACTICE.md` §4-5 — the test-first law and the evidence gate this inherits
- [references/testing.md](references/testing.md) — the subagent test procedure
- `skillator:grayskull-power` — routes here when the deliverable is a skill
