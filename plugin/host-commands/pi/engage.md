---
description: Improve the prompt written before (or after) this command with AI, then carry it out
argument-hint: "[rough prompt - empty uses your previous message]"
---
Engage: rewrite a rough prompt into a strong one, then carry it out.

The prompt: `$ARGUMENTS`
Empty → the prompt is the user's message just before this command (what they wrote
before typing it). Nothing there either → ask for the prompt in one line and stop.

1. **Rewrite it.** Keep every requirement, name, path, number and constraint exactly,
   and the user's intent. Make the goal explicit; add what "done" means, the scope
   (what not to touch), the context the repo already gives (read the files and
   conventions it names - never guess them) and the output expected. Settle an
   ambiguity by its most likely reading; never invent a requirement. A gap that would
   change the result and that the repo cannot settle → ask that one question first.
2. **Show it** once, under `**Engaged prompt:**`, as a quote block. No commentary on
   what changed.
3. **Do it.** Treat the engaged prompt as the user's request, in this same turn, with
   every rule of this session still in force (skills, CLAUDE.md / AGENTS.md /
   GEMINI.md, permissions). No stop for approval between the rewrite and the work.
