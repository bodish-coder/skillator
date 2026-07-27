# skillator — reusable Claude Code skills

A dedicated home for reusable [Claude Code](https://claude.com/claude-code)
skills, kept out of individual project repos and packaged as an installable
plugin.

Each directory under `skills/` is one skill (a `SKILL.md` plus any support
files).

## Install (plugin marketplace)

In Claude Code, add this repo as a marketplace and install the plugin:

```
/plugin marketplace add bodish-coder/skillator
/plugin install skillator
```

That's it — the skills below become available in every project. Update later
with `/plugin marketplace update skillator`.

## Skills in this repo

- **skillator-handoff** — generate an in-depth, *verified* session-handoff
  document so a different person or AI can continue the work with no loss of
  context, plan, or intent. Invoke with `/skillator-handoff [output-path|focus]`.
- **skillator-func-ui** — turn an existing UI-only mockup/prototype into a real,
  working system: scan the code, interview the user, emit workflow specs to
  confirm, then a dependency-ordered plan to wire the UI to a real backend
  (stops at the confirmed plan). Invoke with `/skillator-func-ui`.
- **skillator-brainstorm-build** — develop a feature with three models by
  strength: a Fable subagent does the design thinking, then implementation is
  routed by complexity (Sonnet for simple tasks, Opus for complex) with Opus
  verifying. Writes the design to a file, has a planned `/compact` checkpoint,
  records a session `.md` (what/why/tests), reworks, then prompts `/clear`. Invoke
  with `/skillator-brainstorm-build`.
- **skillator-brainstorm-build-lite** — the lightweight variant of the above: a
  Fable subagent designs, an Opus subagent implements, fully autonomous with no
  tiering, compact, record, or clear. A quick brainstorm→build pass. Invoke with
  `/skillator-brainstorm-build-lite`.
- **skillator-merge-agent** — analyse GitHub branches with agents and merge them
  by risk: Haiku summarizes each branch + builds an overlap/conflict map, then
  merges on a throwaway integration branch (trivial conflicts auto-resolve via
  Sonnet, semantic ones escalate to you with an Opus-proposed fix). Optional
  test-verify and PR, both asked at run time. Invoke with `/skillator-merge-agent`.
- **skillator-design-arwen** — ultimate UI/UX design skill for native *and* web:
  fuses production craft (contrast, type, layout, motion, a11y, iOS/Android/RN
  conventions) with a committed aesthetic and a systematic method for forging one
  unique, ownable *signature* element. Invoke with `/skillator-design-arwen`.

## Add a new skill

```bash
mkdir skills/<skill-name>        # a dir with a SKILL.md
# ...author SKILL.md...
git add skills/<skill-name>
git commit -m "add <skill-name>"
git push
```
