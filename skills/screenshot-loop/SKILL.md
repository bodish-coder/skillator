---
name: screenshot-loop
description: >-
  Use when the user says "screenshots", "check the screenshots", "I dropped
  new screenshots", "test screenshots", "look at the latest run", or gives a
  screenshot directory path — test screenshots dropped in a project's
  screenshot folder that need acting on and then clearing. NOT for taking
  screenshots (use a browser/app skill for that) and NOT for permanent design
  assets — everything in that folder is treated as disposable.
---

# screenshot-loop — read, act, delete

The user drops screenshots in one folder. You read them, act, then delete the
ones you read. The folder is a mailbox, not an archive.

## The directory

Read `.screenshot-dir` at the repo root — one line, an absolute path.

If it does not exist, ask the user for the path once, then write their answer
to `.screenshot-dir` — not a placeholder, the path they actually gave you:

```
<absolute path the user gave you>
```

If the user gives a path in their message, that wins for this cycle, and write
it to `.screenshot-dir` if the file is missing or points somewhere else (ask
before overwriting an existing different path).

## The cycle

1. **List** — glob the directory for `*.png *.jpg *.jpeg *.webp *.gif`, sorted
   oldest first. Empty? Say so in one line and stop. Do not go looking elsewhere.
2. **Read every one** with the Read tool. Every one, not a sample. Screenshot 4
   is usually the one that explains screenshots 1–3.
3. **Understand before acting.** State in 1–3 lines what the set shows: the
   screen, what is wrong or being asked for, and which files that maps to. If
   the screenshots are ambiguous — you cannot tell what the user wants changed —
   ask, and do not delete anything.
4. **Act.** Make the fix or the change. This is normal work: find the code,
   edit it, run the check. Screenshots are the bug report, not the task list —
   if two of them show the same defect, that is one fix.
5. **Verify** the way the project normally verifies (tests, build, run). If the
   change cannot be verified, say so plainly.
6. **Delete** — and only now — exactly the files listed in step 1, by name.
   Files that appeared mid-cycle are next cycle's input; leave them.
7. **Report**: what the screenshots showed, what changed, what was deleted.

## Deletion rules

- Delete files, never the directory itself.
- Delete only after the work is done and reported. Work blocked, question
  pending, or user interrupted → screenshots stay.
- Never delete anything outside the screenshot directory.
- If the user says "keep them" or "don't delete", skip step 6 and say so.

## Repeat rounds

The user will drop a new batch and say "again" / "recheck" / "still broken".
Run the cycle again from step 1. Carry what you learned last round — a second
round of the same screen means the first fix missed, so investigate rather than
re-applying the same edit.
