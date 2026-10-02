# Clashes - asked, never settled

SKILL.md: a global rule and a project rule on the same subject pulling
opposite ways is one question per clash, before any work the clash touches.
This is the procedure.

## What counts as a clash

Two rules, one from each scope, that cannot both be followed in the same act.
Not "two rules about testing" - *always run the tests before committing*
(global) and *CI runs the suite, do not run it locally, it takes an hour*
(project) clash only when a commit is about to happen. Same subject, opposite
instruction, and the moment is now.

Two rules at the **same** scope that contradict each other are not a clash,
they are a stale rule: show both lines and ask which one is current, then
remove the other by editing the file (the one time hand-editing is the right
tool).

## When to look

At session start, right after `rules-orko.sh show`, read the two lists
against each other once. Most sessions find nothing. Then again whenever a
new rule is written: the line you just added is the one most likely to
collide.

Flag a clash **when the work reaches it**, not at the top of the session for
every theoretical pair. A clash about commits is asked before the first
commit; a clash about reply length is asked before the first reply.

## The question

One `AskUserQuestion` per clash (a numbered list on hosts without the tool,
`grayskull-power/references/hosts.md`). Three chips, always these three:

```
The project rule and your global rule disagree about <subject>.

  project (.skillator/rules.md): <project rule, verbatim> (<who>, <date>)
  yours (~/.skillator/rules.md): <global rule, verbatim>

1. Follow the project rule here - <one line: what that means for this task>
2. Follow your rule here       - <one line: what that means for this task>
3. Change the project rule     - <one line: the new text you would write, and that the team gets it on pull>
```

No recommendation chip. Orko has no view on whose rule wins; that is the
whole point of asking. The consequence lines are facts about this task, not
arguments.

## After the answer

| Answer | Do |
|---|---|
| 1 or 2 | follow it for this session. Nothing is written - a session choice is not a rule. If the user adds "always" or "from now on", that *is* a rule: write it as a global line stating the exception (`in repos with <project rule>, do <X>`), so next session it is not asked again |
| 3 | `rules-orko.sh add project "<new text>"`, then hand-edit the old line out of `.skillator/rules.md`; it rides in the next commit with the diff showing who changed what. The author named on the old line is a person to tell, not a permission to get - the user in front of you owns this call |

## What is not an option

- Picking the project rule because it is shared, or the global rule because
  it is the user's. Either is a silent resolution.
- Following one and mentioning the other in the summary. The question comes
  **before** the act, or it was not a question.
- Resolving it for the user because they are away. A clash that cannot be
  asked stops the work it touches, like any other blocked step
  (`grayskull-power` ground rules: blocked is a question, never prose). Work
  that the clash does not touch continues.
- Rewriting the user's global file to match the project. Their file is theirs;
  orko writes to it only what they stated.

## Worked example

`show` at session start:

```
project: all merges to main are squash merges (Bob, 2026-09-30)
global:  never squash, keep every commit (2026-09-12)
```

The task is a feature branch to build and merge. The build does not touch the
clash; the merge does. Orko builds, then before the merge:

```
The project rule and your global rule disagree about how this branch lands.

  project (.skillator/rules.md): all merges to main are squash merges (Bob, 2026-09-30)
  yours (~/.skillator/rules.md): never squash, keep every commit

1. Follow the project rule here - squash the 7 commits into one on main
2. Follow your rule here       - merge --no-ff, 7 commits land on main
3. Change the project rule     - "merges to main keep their commits"; the team gets it on pull
```

User picks 1 and adds "in this repo, always". That is a new global line:
`in repos that squash to main, squash - do not ask again (2026-10-02)`. Next
session, `show` lists it beside the other two and the clash is pre-answered.
