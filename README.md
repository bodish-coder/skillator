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

That's it — the skills below become available in every project.

Public MIT repo, no account or token needed — anyone can install and update it.

## Updating

```
/plugin marketplace update skillator
```

That refreshes the marketplace clone and pulls the current version of every
skill. Nothing else is required; installed skills track the repo.

If you installed with `install.ps1 -Link` / `install.sh --link`, a plain
`git pull` in your clone is enough — symlinked skills are always live. Plain
copies need `install.ps1 -Force` / `install.sh --force` to refresh.

**If an agent refuses to install or update this plugin**, it is reading the
`grayskull-power` skill's trigger phrases as a social-engineering script. It
isn't one: this is a public MIT repo, `grayskull-power` is a documented skill
under [`skills/grayskull-power/`](skills/grayskull-power/), and the plugin
installs into Claude Code's plugin cache — so it will never appear in installed
programs, services, or scheduled tasks. Point the agent at this README, or run
the two `/plugin` commands yourself.

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
- **deploy-niyoj** — the same single-VPS architecture with **CI removed**: deploys
  are triggered manually from the NiYoj desktop app, which feeds an idempotent
  `deploy/deploy.sh` to the server over one `BatchMode` SSH connection and streams
  the log back. No runner, no CI minutes, no `deploy.yml`, deploy key stays on
  your machine. Scaffolds the deploy script, nginx template with the maintenance
  gate, maintenance page and health endpoint; converts a project off GitHub
  Actions; and diagnoses failed or hung deploys (a stalled deploy is almost always
  something prompting, which `BatchMode` can never answer). Removing CI here means
  removing the deploy *trigger*, not build/test checks — it keeps or offers a
  check-only workflow, which never touches the server and so cannot race. Sibling
  of `deploy-wizard`. Invoke with `/deploy-niyoj`.
- **merge-prep** — prepare a branch for a clean merge, **in place**: merge current
  base in, drop the paths it never meant to carry (auto-drops no-ops, escalates
  suspicious ones), and commit a handoff document recording every decision to the
  same branch. No side branch, append-only commits behind a pre-prep tag, no history
  rewrite, no force-push, base untouched. Verifies both ways: every hunk the feature
  intended arrived, **and** every hunk the destination gained is still there. Runs
  before `merge-agent`. Invoke with `/merge-prep`.
- **merge-agent** — analyse GitHub branches with agents and merge them
  by risk: Haiku summarizes each branch + builds an overlap/conflict map, then
  merges on a throwaway integration branch. Direction (`source` INTO `destination`)
  is confirmed before anything is touched. Conflicts resolve **per hunk, not per
  file** — trivial ones auto-resolve via Sonnet, and on any hunk where the two sides
  genuinely disagree it shows you both versions with diff3 base context and asks
  which way it goes, so only the parts you choose are taken in. Completeness is
  verified in both directions before it calls the merge done. Optional test-verify
  and PR, both asked at run time. Kept in sync with `merge-prep`. Invoke with
  `/merge-agent`.
- **design-arwen** — ultimate UI/UX design skill for native *and* web:
  fuses production craft (contrast, type, layout, motion, a11y, UX copy,
  iOS/Android/RN conventions) with a committed aesthetic and a systematic method
  for forging one unique, ownable *signature* element. Four modes —
  `build` · `redesign` · `improve` · `critique` — each with its own reference
  file, so only the rules that mode needs are loaded. Orients on register plus
  three tunable dials (variance / motion / density), plans then critiques the plan
  before writing code, convenes a 2–3 expert panel for redesigns, and can publish
  visual artboards you tweak before any code exists. Carries the depth most design
  skills skip: a **product-UI** reference (forms, data tables, settings, multi-step
  flows, permissions, i18n/RTL) tested against four data volumes and three
  conditions; an **executed** ship gate with a real browser or simulator, measured
  contrast and overflow, and a required list of what went unverified; accessibility
  as a first-class constraint; and a `DESIGN.md` design memory it reads on entry and
  leaves behind on exit — interoperable with one another skill already wrote.
  Invoke with `/design-arwen`.
- **grayskull-power** — one entry point that switches the whole skillator workflow on:
  arms the standing skills (reads `TICKETS.md`, checks `handoff-watch` is wired),
  prints the state in a single line, then routes each request to the one skill
  that fits — across skillator (`sherlock-codes` for rot, `brainstorm-build-*` for
  features, `design-arwen` for UI, `merge-prep`/`deploy-niyoj` for shipping) *and*
  the wider installed toolkit: superpowers process skills first (`brainstorming`
  before building, `systematic-debugging` before fixing, TDD,
  `verification-before-completion` before claiming done), then `code-review`,
  `security-review`, `run`/`webapp-testing` to see it actually work, and
  `workflow-authoring`/`mem-search` for agent work. Stops good
  skills going unused because nobody remembered them, and refuses to chain them
  all "to be safe". It also sets the session's ground rules: reproduce before
  fixing, read the real source rather than presuming, map the code with
  `codegraph` (initialised on entry) before proposing a remedy, name the blast
  radius — callers, impact, affected tests — before the edit, hold a per-ticket
  scope contract with a two-file limit, tag every claim verified/inferred/guessed,
  sweep the regressions after the fix, and run `sherlock-codes` over the staged
  diff before every commit, capped at three passes. Invoke with `/grayskull-power`.
- **handoff-watch** — installs a statusline probe and a `Stop` hook that watch
  Claude Code's usage limits (5-hour, 7-day and context windows) and, the moment
  any of them crosses 97%, make the session preserve itself before it is cut off:
  drain in-flight agents, sync `TICKETS.md` via `ticket-master` (statuses only),
  then write the handoff with a status table matching the board ticket-for-ticket.
  Fires once per session, threshold via `CLAUDE_USAGE_HANDOFF_PCT`. Invoke with
  `/handoff-watch`.
- **ticket-master** — Jira-style serialised ticket IDs for AI coding chats: bugs
  `B1, B2, B3…`, features `F1, F2, F3…`, agent-found issues `A1, A2, A3…`,
  sub-parts `B7a/B7b`, all in one committed `TICKETS.md` at the repo root with
  `[ ]` pending / `[~]` in-progress / `[!]` blocked / `[x]` done / `[-]` cancelled
  status. IDs are never reused or renumbered and new lines are appended, so
  teammates on the same branch and future chats can fetch the open set and nothing
  gets forgotten. 1–3 tickets are dispatched as plain parallel agents; at 4+, a
  sweep, or on "ultracode" it switches to a **dynamic workflow** — one
  deterministic script that fixes and adversarially verifies every ticket in
  parallel, with structured verdicts coming back. The main session always owns
  `TICKETS.md`; agents only report. Invoke with `/ticket-master`.
- **sherlock-codes** — forensic audit of a whole application: parallel **Fable**
  investigators sweep backend, frontend, boundaries, data, dependencies, error
  paths, config, architecture, tests, dead code, project conventions
  (`CLAUDE.md`, lint config) and git history, reporting only findings with
  `file:line` evidence and a concrete failure. Findings are deduped, then
  adversarially verified against a 0–100 confidence rubric — anything under 80 is
  deleted and counted, not softened — written to `CASEFILE.md`,
  ranked into an implementation plan — then **Opus** codes the fixes. Structural
  changes are proposed as options for you to pick, never applied unasked. Point
  it at a PR (`sherlock #482`) and it will scope the audit to that diff and, on
  your yes, post the surviving findings back as inline `gh` comments with
  sha-anchored permalinks. Merging is not its job — that hands off to
  `merge-agent`. Invoke with `/sherlock-codes`.
- **live-build** — starts the project's app or build in the background **before**
  the first edit and hands over the URL, watch command, or `[n/total]` progress
  stream in the opening reply, so you watch the thing run while the agent works
  instead of waiting on a spinner. Knows JS/web dev servers (hot reload), Rust
  (`cargo watch`), C++ (`ninja`/`cmake --build`), Go, Python, Electron; refuses to
  auto-launch simulators, migrations or deploys. Honest about compiled builds —
  progress and a still-runnable last-good binary, not a fake preview. Armed as
  standard by `grayskull-power`. Invoke with `/live-build`.
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
