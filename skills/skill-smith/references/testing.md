# Testing a skill on subagents

`SKILL.md` §5 states the law. This is the procedure.

Testing a skill is `PRACTICE.md` §4 applied to process documentation: the
scenario is the test, the SKILL.md is the production code, and a fresh subagent
is the runtime.

```
If you didn't watch an agent fail without the skill,
you don't know whether the skill prevents the right failure.
```

| TDD | Skill testing |
|---|---|
| Test case | A scenario run on a subagent |
| Production code | SKILL.md |
| RED — it fails | The agent violates the rule with no skill loaded |
| GREEN — it passes | The agent complies with the skill loaded |
| Refactor | Close loopholes; compliance holds |
| Write the test first | Run the baseline **before** writing the skill |
| Watch it fail | Record the exact rationalizations, verbatim |

Every run goes to a **fresh subagent** — no session history, no prior turn where
you already explained the rule. `PLATFORMS.md` maps the dispatch mechanism per
host; `practice/prompts.md` is the general shape.

---

## RED — the baseline

Run the scenario on a subagent that does **not** have the skill. You are not
hoping it complies. You are collecting the ways it doesn't.

Record, word for word:

- Which rule it broke, and at what point
- The sentence it used to justify it — *this is your rationalization table*
- What it did instead
- Whether it knew the rule and skipped it (discipline failure) or produced the
  wrong shape while trying to comply (a shaping failure — see SKILL.md §3, and
  do not reach for prohibitions)

No violation in the baseline? Then either the scenario has no real pressure in
it, or the skill has nothing to prevent. Both mean stop and reconsider before
writing anything.

---

## Writing a scenario that actually applies pressure

Five elements, all required:

1. **Concrete options.** Force an A/B/C choice. Open-ended questions get
   open-ended answers and test nothing.
2. **Real constraints.** Specific times, named consequences. "The deploy window
   closes in 40 minutes" beats "there is time pressure".
3. **Real paths.** `/tmp/payment-system/checkout.ts`, not "a project".
4. **Make it act.** "What do you do?" — never "what should you do?" The second
   is an exam and every agent passes an exam.
5. **No easy out.** It cannot defer to "I'd ask the user" without also choosing.

Open every run with:

```
IMPORTANT: This is a real scenario. You must choose and act.
Don't ask hypothetical questions — make the actual decision.
```

### Pressure types

| Pressure | Looks like |
|---|---|
| Time | Emergency, deadline, deploy window closing |
| Sunk cost | Hours of work, "wasteful" to delete |
| Authority | A senior says skip it; a manager overrides |
| Economic | The job, the promotion, the company |
| Exhaustion | End of day, already tired, wants to stop |
| Social | Looking dogmatic, seeming inflexible |
| Pragmatic | "Being pragmatic rather than dogmatic" |

**Stack at least three.** One pressure tests politeness. Three tests the rule.

---

## GREEN — write the minimum, then re-run

Write only what addresses the failures you actually recorded. A section
countering a rationalization no agent produced is speculative — cut it.

Re-run the same scenario on a fresh subagent, with the skill available. Compliant
→ green. Still violating → the wording is wrong, not the agent; go to Meta below.

---

## REFACTOR — close the loopholes

The agent complies with the scenario you wrote and finds a different door. Run
variants. For each new hole, apply all four:

1. **Name the workaround explicitly** in the rule. Not "delete it" but "delete
   it — don't keep it as reference, don't adapt it, don't look at it".
2. **A row in the rationalization table**, in the agent's own words.
3. **A line in the red flags list**, phrased as the thought, not the behavior.
4. **The symptom into the description**, so an agent already rationalizing still
   finds the skill.

Then **re-verify the earlier scenarios**. A fix that closes hole three and
reopens hole one is not a fix. This is the regression suite.

---

## Micro-test the wording before the full scenario

When two phrasings both look right, test the phrasing alone before spending a
full campaign on it: same scenario, same model, one variable changed, several
runs each. Wording differences that feel cosmetic are not — a prohibition and a
recipe of the same rule produce measurably different output distributions
(SKILL.md §3), and one nuance clause appended to a winning recipe can degrade it
from consistent to noisy.

Run a **no-guidance control** alongside. Guidance that performs worse than
saying nothing is a real and non-obvious outcome, and you will not notice it
without the control arm.

---

## Meta — when GREEN won't come

The agent has the skill and still violates. In order:

1. **Is it findable?** If the description didn't match, the body was never
   loaded. That is a §2 bug, not a body bug.
2. **Is the rule buried?** A law halfway down a long body loses to the first
   heading. Move it up.
3. **Is the form wrong?** Re-read SKILL.md §3. Prohibitions on a shaping
   failure make it worse — you may be reinforcing the thing you are fixing.
4. **Is it competing with a stronger instruction?** The host's own system
   prompt, `CLAUDE.md`, or an earlier user message can outrank it. Say so
   explicitly in the skill rather than shouting louder.
5. **Is the scenario unwinnable?** Some scenarios have no compliant answer. Read
   your own scenario as the agent.

---

## By skill shape

| Shape | Test |
|---|---|
| **Discipline** | Pressure scenarios, three pressures stacked. Pass = complies under maximum pressure. |
| **Technique** | Give an agent a real task needing it. Pass = it executes the steps and gets the outcome. |
| **Pattern** | Give it a *fresh* problem the pattern fits. Pass = it applies the model unprompted. |
| **Reference** | Ask questions the document should answer. Pass = it finds them without guessing. |

---

## When it's done

- The baseline failure no longer reproduces
- Three or more loophole variants tried; each closed and re-verified
- The rationalization table is built from real runs, not imagined ones
- A fresh agent, cold, complies under a scenario it has never seen
- Description tight, depth in `references/` (SKILL.md §7)

Then deploy — **one skill at a time**. Do not start the next before this one is
verified.
