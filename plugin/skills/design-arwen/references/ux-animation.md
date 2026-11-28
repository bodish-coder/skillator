# UX animation: design and verify the interaction

Use for a specific interaction or a motion-focused review. [Craft](craft.md) owns the register,
timing limits and accessibility floor. [Verify](verify.md) owns the ship gate.
This reference adds recipes and diagnostic evidence, not a second gate.

## Decide what should move

Start with a rendered interaction. Record **trigger → immediate feedback → settled state**,
plus what can interrupt it. Consider frequency: if someone repeats it all day, prefer an
instant state change unless movement clarifies what moved or what completed. Remove motion
with no communication job before tuning easing. Never delay the action just to finish a reveal.

Use the existing stack: CSS transitions for simple web state changes; platform-native
transitions for native navigation. For gesture-following, layout continuity or an unmount
transition, use an existing platform primitive or installed tool that can handle it.
No new dependency is implied by this guide.

## Recipes

| Interaction | Design for |
| --- | --- |
| Menu or popover | Anchor to the trigger. Give press feedback on the same frame where practical. Escape and re-toggle must work mid-flight; the latest intent wins, including focus return after a dismissal. |
| Modal or drawer | Keep the panel and backdrop in sync and reverse from the current visual position. For modal panels, move and contain focus while open; for non-modal drawers, do not trap it. Do not wait for motion to manage focus. On dismissal, return focus to the trigger or its surviving logical successor if focus moved into the panel. An interrupted close must not steal focus from a reopened panel. |
| Tooltip | Use the same content on keyboard focus and hover. Preserve discoverability, avoid replaying an entrance while moving across familiar adjacent controls, and never hide an essential instruction in a tooltip. |
| Async button | Separate press, pending, success and error. Acknowledge the input immediately; avoid a distracting spinner flash for short waits. Prevent duplicate submissions without hiding feedback; keep useful input and show a recoverable error. |
| Expand, list update or reorder | Make it clear what changed, keep the reader anchored, and settle to the newest order on rapid updates. Avoid animating every row merely because one changed. |
| Navigation or gesture | Use the platform's back and cancel conventions. Track input continuously; release or cancel from the current position. With reduced motion, remove travel and keep the destination and outcome visible. |

## Collect evidence, proportional to the failure

1. Drive the interaction in its real context: pointer or touch, keyboard, and normal speed.
   Reverse or re-trigger it mid-flight and check the final state, focus and hit targets.
2. For a reported flash, jump or unexplained delay, scrub a slow recording or capture a
   frame-by-frame sequence with the browser or simulator already available. Compare the
   first response, frames around the reversal or swap, and final frame. Record the trigger,
   platform, motion preference and timestamp or frame number. A slow-motion render helps
   diagnosis; it does not prove performance on the target device.
3. Recheck with reduced motion. For async feedback, also exercise a slow and a failed
   response. Report what you actually observed; a static image alone cannot verify motion.

Source of inspiration: Charles Liu's [UX Animation](https://github.com/LemonFace0309/charles-skills/tree/main/skills/design/charles-ux-animation)
and [Polish](https://github.com/LemonFace0309/charles-skills/tree/main/skills/design/charles-polish).
This guide uses original examples and does not ship or require upstream scripts.
