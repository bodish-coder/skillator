Load the `relay-morpheus` skill ({{SKILLS}}/relay-morpheus/SKILL.md). `/marathon-run` runs the Workflow
script `/marathon-plan` saved beside a run file, and that needs Claude Code's Workflow tool: this host
has no Workflow tool. Run: `$ARGUMENTS`.

1. Say so in one line: the saved script cannot run here, and nothing is dispatched by this command.
2. Point at `/pending-subagent [N|max] [IDs]` (`/prompts:pending-subagent` here) to work the tickets here with one fresh
   implementer each, or at `continue RUN-<id>` - relay-morpheus resumes that run's own stages one at a
   time from its run file (the `.workflow.js` beside it is not run). Start either only when asked.
