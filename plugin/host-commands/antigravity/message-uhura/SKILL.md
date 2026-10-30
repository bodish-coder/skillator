---
name: message-uhura
description: "Hand an issue to a teammate: write a detailed, self-contained 6-section analysis message and deliver it via teams-uhura channel/inbox"
---
Load the `teams-uhura` skill ({{SKILLS}}/teams-uhura/SKILL.md) and hand an issue to a teammate. Arguments: whatever followed the command (`@handle <issue>`).

1. **Parse & Validate** - The first argument must be `@handle` on `.skillator/team.md`. If missing or not found, refuse: `@handle is not on .skillator/team.md - add <email> to .skillator/team.md (ticket-meta team add @handle "Name" email)` and stop.
2. **Compose 6-Section Message** - Write 1 Issue, 2 Symptoms/output, 3 Evidence (file:line, commits), 4 Repro steps, 5 Suspected cause (unverified), 6 Ask. No secrets or tokens.
3. **Preview & Deliver** - Preview clearly to user. Write drafted text to a temporary file using your file writing tool (never pass message text on the command line). Run `node {{SKILLS}}/teams-uhura/scripts/team.mjs message @handle --file <that path>` (and reply via `node {{SKILLS}}/teams-uhura/scripts/team.mjs say --file <that path>` when replying) and delete the temporary file after `team.mjs` completes.