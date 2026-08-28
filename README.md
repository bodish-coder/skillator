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

## Install (other agents)

The skills are plain `SKILL.md` folders, so any host that reads the Agent Skills
format can run them. Clone the repo and run the installer — it detects which
agent CLIs are present and copies every skill (plus `PLATFORMS.md`) into each
one's **global** skills dir:

```powershell
.\install.ps1 -DryRun    # see what it would do
.\install.ps1 -Link      # install as symlinks (recommended - stay live on git pull)
.\install.ps1            # or plain copies
```

```sh
./install.sh --dry-run
./install.sh --link
./install.sh
```

It installs only what's missing, so re-running is safe; `-Force` / `--force`
refreshes copies that are already there. Anything already **symlinked** to this
repo is left alone (it's always current), and **Claude Code is left to its plugin
install** whenever one exists — no duplicate shadowing the plugin cache. Prime
Agent has no markdown-skill loader, so point its `AGENTS.md` at the `SKILL.md`
you want.

Manual install paths, if you'd rather not run the script:

| Host | Path |
|------|------|
| Cursor | `.cursor/skills/` or `.agents/skills/` (global: `~/.cursor/skills/`, `~/.agents/skills/`) — auto-discovered |
| Codex | `~/.agents/skills/` — auto-loaded when the task matches |
| Antigravity CLI | `.agents/skills/` (workspace) or `~/.gemini/config/skills/` |
| Pi | `.pi/skills/` (force with `/skill:<name>`) |
| Prime Agent | anywhere — skills there are Python packages, so read the `SKILL.md` or reference it from `AGENTS.md` |

Model names and tool names inside the skills are **Claude Code defaults**;
[`PLATFORMS.md`](PLATFORMS.md) maps them to each host's tiers, delegation
mechanism, and context checkpoints. [`WORKFLOW.md`](WORKFLOW.md) is the
brainstorm-build skills' deterministic-orchestration path — one workflow script
instead of hand-dispatched subagents, for builds wide enough to earn it. Keep
both alongside `skills/` — the skills refer to them.

## Skills in this repo

- **handoff** — generate an in-depth, *verified* session-handoff
  document so a different person or AI can continue the work with no loss of
  context, plan, or intent. Invoke with `/handoff [output-path|focus]`.
- **handoff-resume** — the execution counterpart: read handoff docs
  (from `handoff`) and *do* the pending work, stamping a marker in each
  so finished handoffs are skipped. Marker-aware and idempotent (safe to re-run /
  `/loop`). Invoke with `/handoff-resume`.
- **func-ui** — turn an existing UI-only mockup/prototype into a real,
  working system: scan the code, interview the user, emit workflow specs to
  confirm, then a dependency-ordered plan to wire the UI to a real backend
  (stops at the confirmed plan). Invoke with `/func-ui`.
- **brainstorm-build family** — three tiers of the "brainstorm then build" flow;
  pick by how much model firepower and ceremony you want:
  - **brainstorm-build-prime** — **design tier** plans · **build tier**
    implements · full ceremony: session `.md` on disk · handoff before context
    checkpoint · rework. Cross-platform via `references/platforms.md`:
    Claude Code (Fable → Opus), Cursor (GPT-5.6-Sol → Claude
    Opus), Codex (Sol high-reasoning design → Sol build,
    auto-compaction aware).
  - **brainstorm-build-mid** — **Opus** plans · **Opus** builds. All-Opus,
    autonomous, no ceremony.
  - **brainstorm-build-lite** — **Opus** plans · **Opus + Sonnet** builds
    (Opus core, Sonnet the simple tasks). Autonomous, no ceremony.
- **deploy-wizard** — step-by-step wizard that preps a project for the
  standard single-VPS deployment (Docker Compose + nginx + GitHub Actions): it
  interviews you for the specifics (domain, IP, SSH user, app slug, repo, ports),
  scaffolds the filled-in artifacts, and prints an ordered manual checklist for the
  human-only steps (deploy keys, GitHub secrets, DNS, TLS). Never collects secret
  values, never touches servers/DNS. Invoke with `/deploy-wizard`.
- **merge-prep** — prepare a branch for a clean merge, **in place**: merge current
  base in, drop the paths it never meant to carry (auto-drops no-ops, escalates
  suspicious ones), and commit a handoff document recording every decision to the
  same branch. No side branch, append-only commits behind a pre-prep tag, no history
  rewrite, no force-push, base untouched. Runs before `merge-agent`. Invoke with
  `/merge-prep`.
- **merge-agent** — analyse GitHub branches with agents and merge them
  by risk: Haiku summarizes each branch + builds an overlap/conflict map, then
  merges on a throwaway integration branch (trivial conflicts auto-resolve via
  Sonnet, semantic ones escalate to you with an Opus-proposed fix). Optional
  test-verify and PR, both asked at run time. Invoke with `/merge-agent`.
- **design-arwen** — ultimate UI/UX design skill for native *and* web:
  fuses production craft (contrast, type, layout, motion, a11y, iOS/Android/RN
  conventions) with a committed aesthetic and a systematic method for forging one
  unique, ownable *signature* element. Invoke with `/design-arwen`.
- **ticket-checker** — Jira-style serialised ticket IDs for AI coding chats: bugs
  `B1, B2, B3…`, features `F1, F2, F3…`, agent-found issues `A1, A2, A3…`,
  sub-parts `B7a/B7b`, all in one committed `TICKETS.md` at the repo root with
  `[ ]` pending / `[~]` in-progress / `[!]` blocked / `[x]` done / `[-]` cancelled
  status. IDs are never reused or renumbered and new lines are appended, so
  teammates on the same branch and future chats can fetch the open set and nothing
  gets forgotten. Starting a ticket dispatches its own agent — tickets are worked
  in parallel, not in a line. Invoke with `/ticket-checker`.
- **screenshot-loop** — the user drops test screenshots in one folder; the agent
  reads every one, acts on what they show, verifies, then deletes exactly the
  files it consumed so the folder is clean for the next round. The directory is
  asked once and remembered in `.screenshot-dir` at the repo root. Invoke with
  `/screenshot-loop`.

## Add a new skill

```bash
mkdir skills/<skill-name>        # a dir with a SKILL.md
# ...author SKILL.md...
git add skills/<skill-name>
git commit -m "add <skill-name>"
git push
```
