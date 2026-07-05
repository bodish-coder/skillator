# skillator — global Claude Code skills

A dedicated home for reusable [Claude Code](https://claude.com/claude-code)
skills, kept out of individual project repos.

Each top-level directory is one skill (a `SKILL.md` plus any support files).

## Use it as your global skills directory

Claude Code auto-discovers skills in `~/.claude/skills/`. Point that at this repo:

```bash
# If you have no global skills yet (fresh machine):
git clone https://github.com/bodish-coder/skillator ~/.claude/skills

# If ~/.claude/skills already exists, keep this repo alongside and symlink each skill:
git clone https://github.com/bodish-coder/skillator ~/src/skillator
ln -s ~/src/skillator/session-handoff ~/.claude/skills/session-handoff
```

Skills placed here are available in **every** project, globally.

## Add a new skill

```bash
mkdir ~/.claude/skills/<skill-name>        # a dir with a SKILL.md
# ...author SKILL.md...
cd ~/.claude/skills && git add <skill-name> && git commit -m "add <skill-name>" && git push
```

## Skills in this repo

- **session-handoff** — generate an in-depth, *verified* session-handoff
  document so a different person or AI can continue the work with no loss of
  context, plan, or intent. Invoke with `/session-handoff [output-path|focus]`.
- **ui-to-functional** — turn an existing UI-only mockup/prototype into a real,
  working system: scan the code, interview the user, emit workflow specs to
  confirm, then a dependency-ordered plan to wire the UI to a real backend
  (stops at the confirmed plan). Invoke with `/ui-to-functional`.
