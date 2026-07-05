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

## Add a new skill

```bash
mkdir skills/<skill-name>        # a dir with a SKILL.md
# ...author SKILL.md...
git add skills/<skill-name>
git commit -m "add <skill-name>"
git push
```
