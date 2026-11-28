---
name: launch-hermes
description: >-
  Plan, design, export or review App Store and Google Play listing screenshots.
  Use for screenshot sets, store gallery variants, or checking listing images
  before upload. Not for product UI redesign, website hero mockups, or publishing.
user-invocable: true
argument-hint: "[store(s)] [app or screenshot source]"
license: MIT
---

# Launch Hermes: store screenshots
Produce listing-ready artwork from real app screens. A storyboard or a render is
not a submission, and the task does not authorize an upload.

1. **Resolve the target matrix.** Identify store, supported device classes, locales,
   orientation and release build. Use Apple's [screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
   and Google's [preview asset requirements](https://support.google.com/googleplay/android-developer/answer/9866151)
   for the actual target, not memorized sizes. Record source and date checked. Separate
   mandatory listing criteria from optional promotion/device recommendations. If rules
   or target classes are unknown, deliver a labeled concept, not an approved export.
2. **Capture first.** Use authorized screenshots or the actual build with representative
   demo data. Record capture provenance by frame. Exclude private data, account info,
   dev menus and unsupported capabilities. If a needed capture is missing, list it.
   Never substitute generated or recreated UI and call it a real capture.
3. **Tell a short story.** Start with a promise and a recognizable real screen that
   make sense in frame 1 alone. Frame 2 can extend that promise; later frames each show
   one new benefit and a corresponding real state. Keep one visual system. Optional
   continuity across frames belongs in the background or decorative art, not essential
   text or controls; each frame must work on its own.
4. **Render and verify.** Use the existing design/export stack. Keep the UI crisp and
   uncropped where it conveys the claim. Inspect each frame alone, the first two
   together, and a store-sized thumbnail. For every target, check exported file count,
   exact pixel dimensions, format/color/alpha requirements, proposed ordering, wording,
   legibility, privacy and localization without truncation. Review mode reports
   findings without overwriting source files.
5. **Hand off the set.** Return files or a concept with explicit limits, plus a manifest:
   store/device/locale, sequence, filename, dimensions, source capture and pass/fail.
   Name missing captures and unverified targets. Do not sign in, upload or publish as
   part of this workflow.

Inspired by [Charles Store Screenshots](https://github.com/LemonFace0309/charles-skills/tree/main/skills/design/charles-store-screenshots).
