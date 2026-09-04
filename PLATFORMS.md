# Platform adapters — how skillator skills run on each host

Every skill in this repo is written against **role tiers** and **generic
mechanics**, not against one vendor's tools. This file is the single mapping
table. A skill that names Claude Code models or `/compact` is showing its
default; translate through the row for your host.

**If this file isn't reachable** (skill copied out on its own), assume the
`claude-code` row and say so once.

## Role tiers

| Tier | Job | Claude Code default |
|------|-----|---------------------|
| **deep** | Creative design, hard reasoning, semantic judgement calls | Fable / Opus |
| **build** | Implement the design — strongest coder available | Opus |
| **cheap** | Bulk summarizing, mechanical edits, trivial conflicts, analysis | Sonnet / Haiku |
| **orchestrator** | Main session: dispatch, write files, checkpoints | the running session |

Use a *different* model for deep vs build when the host allows it. Same model
for both is a valid fallback — say so in the run's record.

## Detect the host

| Signal | Host |
|--------|------|
| `Skill` tool; `/compact` and `/clear` | `claude-code` |
| `Task` tool with `subagent_type` + model slug list | `cursor` |
| `commentary`/`final` channels; auto context compaction | `codex` |
| `/skills`, `/agents`, `/model`; skills under `.agents/skills/` | `antigravity` |
| `/skill:<name>`; AGENTS.md from `~/.pi/agent/`; `/model` mid-session | `pi` |
| persistent IPython; `rlm(...)`; `prime-agent agents` | `prime-agent` |

Ambiguous → ask once. The user can override with `platform: <host>`.

## The table

| | claude-code | cursor | codex | antigravity | pi | prime-agent |
|---|---|---|---|---|---|---|
| **Skill install path** | `~/.claude/skills/<n>/` or plugin cache | `.cursor/skills/<n>/`, `.agents/skills/<n>/`, global `~/.cursor/skills/`, `~/.agents/skills/` (nested dirs too) | `~/.agents/skills/<n>/` | `<ws>/.agents/skills/<n>/`, global `~/.gemini/config/skills/<n>/` | `.pi/skills/<n>/SKILL.md` (+ `~/.pi/`) | no markdown-skill loader — see below |
| **Load another skill** | `Skill` tool | auto-discovered by description; else read its `SKILL.md` and follow it | auto-loaded when the task matches; else read its `SKILL.md` | auto-discovered; force with `/<skill-name>` | force with `/skill:<name>` | Read the `SKILL.md` and follow it |
| **Delegate work** | `Agent` tool + `model` override | `Task` tool + model slug | subagents (GA Mar 2026) — up to 8 parallel, own context + sandbox | background subagents (`/agents`), nestable | no native delegation — `subagent` extension or a `pi` subprocess; else sequential in-session passes | `rlm(...)` spawns real child agents |
| **Switch tier** | per-agent `model` | per-Task model slug | `reasoning_effort` low/medium/high/xhigh | `/model` mid-session (Gemini 3.5 Flash / 3.1 Pro / Claude Sonnet / Opus / GPT-OSS 120B, plan-dependent) | `/model` mid-session (15+ providers) | provider chosen at `/login`; tier by prompt + child-agent config |
| **Context checkpoint** | `/compact`, `/clear` | new composer/chat turn | auto-compacts; new thread for a clean slate | new session (`/agents` keeps background work) | new session | `/refine` + daemon sessions, `prime-agent --resume <id>` |
| **Always-on project file** | `CLAUDE.md` (`@path` imports) | `AGENTS.md` | `AGENTS.md` | `GEMINI.md` (`@path` imports) | `AGENTS.md` | `AGENTS.md` |
| **Usage % readable** | `statusLine` `rate_limits.*.used_percentage` | no | yes — `~/.codex/sessions/**/rollout-*.jsonl`, last `token_count` | no | no | no |
| **Turn-end hook that can inject** | `Stop` → `{"decision":"block"}` | `stop` in `~/.cursor/hooks.json` (`command`/`prompt`) | **no** — hooks are `PreToolUse`/`PostToolUse`/`PermissionRequest`/`SessionEnd`; `notify` can't inject | `AfterAgent` / `PreCompress` in `~/.gemini/settings.json` | no | no |
| **Durable memory** | `CLAUDE.md` + files on disk | files on disk | `AGENTS.md` + files | `AGENTS.md` + files | `AGENTS.md` (`~/.pi/agent/`, parents, cwd) + files | Continual Harness + `AGENTS.md` + files |

**Frontmatter:** only `name` + `description` are portable. Everything else
(`user-invocable`, `argument-hint`, `license`) is ignored where unsupported —
harmless, never load-bearing.

## Host notes

**cursor** — skills are auto-discovered from those four directories (nested repo
dirs included, scoped to that dir), matched on `description`, and `name` **must
match the folder name**. There's no `Skill` tool, so to chain a skill on purpose,
read its `SKILL.md` yourself — don't delegate skill *interpretation* to a
subagent. Model slug not in the Task tool's allowed list → closest tier, record
the substitution.

**codex** — skills live in `~/.agents/skills/` and load when the task matches;
`AGENTS.md` (`~/.codex/AGENTS.md`, repo root, or a subdir) is the always-on
layer. Subagents went GA in March 2026: up to 8 in parallel, each with its own
context window and sandbox — so tiered phases here are real delegation, not a
sequential fallback.

**antigravity** — skills become slash commands automatically; `/skills` lists
what it can see. Frontmatter beyond `name`/`description` is dropped, so any
model tiering must be stated in the body (it is). Background subagents cover the
delegate rows; `/model` covers the tier rows.

**pi** — skills are `.pi/skills/<name>/SKILL.md` and are read on demand, which
models don't always do: force it with `/skill:<name>`. Delegation isn't native;
without a subagent extension, run tiered phases **sequentially in one session**,
switching `/model` between phases, and write each phase's output to disk before
switching. That file-on-disk step is what makes the tiering safe here.

**prime-agent** — skills are importable *Python packages*, so these markdown
skills aren't auto-loaded. Run one by reading its `SKILL.md` (or pointing
`AGENTS.md` at it) and following it. `rlm(...)` is the delegate mechanism, and
child agents are where tiering happens. Note the project's own warning: it is
**not a security sandbox** — keep the "ask before push / never force-push" rails
in these skills exactly as written.

## Non-negotiables on every host

- **Write state to disk before any context checkpoint.** Every skill here that
  compacts, clears, or opens a new session runs its handoff/record step first.
  Files are the memory; chat history isn't.
- **Never fake a host's tool.** No tool for a step → do it in-session and say so.
- **Approval rails don't relax** because a host is more autonomous. Push, force,
  and destructive steps stay user-confirmed everywhere.
