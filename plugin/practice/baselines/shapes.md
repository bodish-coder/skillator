# A52 — shape classification of the thirteen untested skills

`testing.md` prescribes a different test per shape. A pressure RED is only the
right test for a **Discipline** skill; running one against a Technique skill
measures nothing. This table was produced before any test was run, so the test
type was chosen from the skill's shape rather than from what was convenient.

Line numbers are as of `b56f01a`.

| Skill | Shape | Most falsifiable rule | Test |
|---|---|---|---|
| `design-arwen` | Discipline | `SKILL.md:337` — "Never write 'done' or 'verified' over an unrendered page, and never narrate a render you did not perform" | RED |
| `live-build` | Discipline | `SKILL.md:24` — hand over the `live:` line "in the opening reply, before any edit" | RED |
| `merge-prep` | Discipline | `SKILL.md:123` — on a non-zero `git apply --reverse`, "never route around it with `git rm` or `git checkout <base> -- <path>`" | RED |
| `merge-agent` | Discipline | `SKILL.md:276` — "Conflicts resolve per hunk. Whole-file `--ours`/`--theirs` is for lockfiles and generated files only" | RED |
| `deploy-wizard` | Discipline | `SKILL.md:25` — "Never collect secret *values*" | RED |
| `deploy-niyoj` | Discipline | `SKILL.md:239` — "**Do NOT** `git push` unasked, even mid-incident" | RED |
| `skill-smith` | Discipline | `SKILL.md:23` — "NO SKILL WITHOUT A FAILING TEST FIRST" | RED |
| `func-ui` | Technique | `SKILL.md:113` — "Do not proceed to the plan until they sign off" | GREEN-task |
| `handoff-resume` | Technique | `SKILL.md:45` — a doc marked `status: complete` → "ignore it" | GREEN-task |
| `brainstorm-build-prime` | Technique | `SKILL.md:211` — "Don't design or code in the orchestrator session" | GREEN-task |
| `brainstorm-build-mid` | Technique | `SKILL.md:108` — "Pass the design by path, never by paste" | GREEN-task |
| `brainstorm-build-lite` | Technique | `SKILL.md:99` — "Route by tag, not vibe. [SIMPLE]→Sonnet, [COMPLEX]→Opus" | GREEN-task |
| `handoff-watch` | **not LLM-testable** | mechanism lives in the hooks | `hooks/selftest.ps1` |

## Three findings from the classification itself

**1. `handoff-watch` should never get a pressure scenario.** The skill says so
itself at `SKILL.md:14` — *"A skill cannot monitor anything - it is only text
loaded into a turn. The watching has to be done by the harness."* Everything
that matters (max-percentage wins, fire-once, `stop_hook_active`, the 3-hour
Codex staleness window, BOM-safe reads, the `.done` one-shot) is in
`usage-watch.ps1`/`.sh` and is already covered deterministically by
`hooks/selftest.ps1`. Writing an LLM scenario for it would test the model, not
the skill. Its only LLM-facing surface is Reference — the install/troubleshoot
sections — with one falsifiable claim at `SKILL.md:127`: never report Cursor as
armed. **Recorded as: correct test already exists, and it is not this one.**

**2. Six of the thirteen are Technique, where RED is close to meaningless.**
The brainstorm-build trio, `func-ui` and `handoff-resume` are procedures — the
test is "give an agent a real task and see whether the artifacts appear",
GREEN-only. Their detectors are structural rather than prose-based (which
`model` each Agent call used, whether a prompt carried a path or a pasted body,
which files exist afterwards), so they can largely be graded by script.

**3. `design-arwen`'s falsifiable rules are a minority of its text.** Its gates
are checkable, but Phase 1 lane choice, signature forging and dial placement are
judgement no transcript test can adjudicate without a human rater — which is
exactly why A5 ended up a usability review rather than a test. A RED-GREEN run
answers the one thing A5 could not: whether an agent denied a browser and pushed
to say "done" still refuses to claim verification.

## Caveat on the Technique tests, not yet run

All three brainstorm-build skills delegate their process canon to `PRACTICE.md`
(prime:25, mid:36, lite:23). A GREEN-task run on them is therefore partly a test
of `PRACTICE.md`, and it must run from a cwd where that file resolves — which
collides with the A47 rule that tests run outside the repo that ships the skill.
That tension needs resolving before those five GREEN tasks are meaningful; it is
not a reason to record them as passed.
