---
name: tutorial-merlin
description: >-
  Design or build a short interactive product tutorial or onboarding practice
  lesson for one real workflow. Use when learners should try a task and get
  feedback. Not for static help articles, a general course, or routine UI review.
user-invocable: true
argument-hint: "[audience] [workflow to practice]"
license: MIT
---

# Tutorial Merlin: one product task
Give the learner a small win they can repeat without the lesson. Prefer a safe
practice example over a tour that only asks them to click Next.

1. **Define the outcome.** Name the learner, starting point, prerequisites and one
   observable result. Anchor on a verified product workflow. If you cannot inspect
   it, label the lesson a prototype and list the steps that still need checking.
2. **Design a short loop.** Show the goal on one realistic example. Ask the learner
   to predict a choice or result, then let them try it. Give immediate feedback that
   explains why, including what to do after a wrong attempt. End with a similar
   uncoached check whose success depends on the learner's action, not page completion.
3. **Keep the practice safe.** Default to fixture data or an isolated demo. Never
   submit, delete, invite, purchase or change live state by running a tutorial.
   Use the existing stack or a small offline prototype with no telemetry, accounts
   or paid services by default. Use normal Build Jarvis review when adding behavior
   to an actual app; this lesson skill does not own application architecture.
4. **Make it usable.** Use semantic controls, readable inline instructions, keyboard
   access, visible focus and perceivable feedback. Support retry and reset; embedded
   lessons should also be skippable without blocking the app. Narration is optional
   and must not carry any instruction missing from the text.
5. **Verify the experience.** Walk the intended flow, wrong attempt, reset and final
   check in a browser or actual host. Try it keyboard-only and confirm that the lesson
   can be completed without audio or a network call. Report the observed success
   condition and mark anything not tested.

Inspired by [Charles Learn Anything](https://github.com/LemonFace0309/charles-skills/tree/main/skills/qol/charles-learn-anything).
