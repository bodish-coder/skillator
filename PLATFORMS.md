# Platform adapters — how skillator skills run on each host

Every skill in this repo is written against **role tiers** and **generic
mechanics**, not against one vendor's tools. This file is the single mapping
table. A skill that names Claude Code models or `/compact` is showing its
default; translate through the row for your host.

**If this file isn't reachable** (skill copied out on its own), assume the
`claude-code` row and say so once.

## Role tiers

These four names are the **only** tier vocabulary skillator uses. `PRACTICE.md`
§4 and [`practice/task-loop.md`](practice/task-loop.md) name seats with them and
nothing else; this table is where they become a slug you can actually type.

| Tier | Job | claude-code | cursor | codex | antigravity | pi | prime-agent |
|------|-----|---|---|---|---|---|---|
| **deep** | Creative design, hard reasoning, semantic judgement, the final whole-branch review | Fable / Opus | the strongest reasoning slug the Task tool offers (GPT-5.6-Sol, Claude Opus) | `reasoning_effort: high` or `xhigh` | `/model` → Gemini 3.1 Pro or Claude Opus | `/model` → the account's strongest reasoning model | the child-agent config's strongest provider |
| **build** | Implement the design; review a task's diff — strongest coder available | Opus | Claude Opus, or the strongest coding slug allowed | `reasoning_effort: medium` | `/model` → Claude Sonnet or Opus | `/model` → the account's strongest coding model | the login provider, default child config |
| **cheap** | Transcription, single-file mechanical edits, bulk summarizing, trivial conflicts | Sonnet / Haiku | the cheapest slug in the Task tool's list | `reasoning_effort: low` | `/model` → Gemini 3.5 Flash or GPT-OSS 120B | `/model` → the cheapest configured provider | a child agent on the cheapest configured provider |
| **orchestrator** | Main session: dispatch, rule, keep the ledger, write files, checkpoints | the running session | the running session | the running session | the running session | the running session | the running session |

Use a *different* model for deep vs build when the host allows it. Same model
for both is a valid fallback — say so in the run's record.

A host whose slug list doesn't contain an obvious match for a tier gets the
closest one **and a recorded substitution**. Never leave the model unnamed: an
omitted model inherits the session's, which is usually the most expensive one.

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
| **Turn-end hook that can inject** | `Stop` → `{"decision":"block"}` | `stop` in `~/.cursor/hooks.json` (`command`/`prompt`) | **no usable gate today** — `Stop` in `hooks.json` is compiled in and would inject via exit 2 + a continuation prompt on stderr, but the live test found no reachable config that fires it. See the codex note | `AfterAgent` / `PreCompress` in `~/.gemini/settings.json` | no | no |
| **Durable memory** | `CLAUDE.md` + files on disk | files on disk | `AGENTS.md` + files | `AGENTS.md` + files | `AGENTS.md` (`~/.pi/agent/`, parents, cwd) + files | Continual Harness + `AGENTS.md` + files |

**Frontmatter:** only `name` + `description` are portable. Everything else
(`user-invocable`, `argument-hint`, `license`) is ignored where unsupported —
harmless, never load-bearing.

## Auto-invocation — what is actually verified

The "Load another skill" row says how a skill *can* be loaded. Whether the host
loads one **unprompted**, from the description alone, is a separate question.
Two rows have now been tested; the rest are still the host's own claim.

| Host | Fires on description alone? |
|---|---|
| claude-code | **yes, verified** — 2026-09-06, `claude -p` 2.1.261 / Opus 5, 7/7 |
| codex | **yes, verified** — 2026-09-06, `codex exec` 0.153.2, 2/2 |
| cursor | **attempted, never completed** — `cursor-agent` 2026.09.02, 1/3: named the right skill and reached for its `SKILL.md` once, blocked by a local hook; the other two probes ignored skills entirely |
| antigravity | claimed by the host; **untestable here** — IDE only on this machine, no CLI |
| pi | **no, per the host's own docs** — descriptions are in the prompt but "models don't always do this"; force with `/skill:<name>`. Untestable here (no working provider credential) |
| prime-agent | **no** — no markdown-skill loader at all |

The claude-code runs were headless, from a throwaway fixture outside any repo,
with no `CLAUDE.md`/`AGENTS.md` in the cwd: `func-ui` loaded 5/5 from *"just a
mockup … make it real"* (once under `--plugin-dir` + `--add-dir`, the GREEN
harness shape), `handoff-resume` from *"pick up the pending tasks from the
handoffs"*, `grayskull-power` from *"set me up for coding"*. This supersedes the
earlier A55 observation that no skill fired; see `practice/baselines/README.md`.

**codex (verified).** Same probe shape, 2026-09-06: `codex exec --json -s
read-only --skip-git-repo-check` from a throwaway fixture in the system temp dir
holding only `index.html` + `app.js` (hardcoded data, dead button), no
`AGENTS.md` anywhere in the tree, and a `~/.codex/AGENTS.md` that never mentions
skills. From *"just a mockup … the buttons don't do anything … make it real"* its
first message was *"I'm using the func-ui skill for this conversion"*, followed by
a read of `~/.agents/skills/func-ui/SKILL.md`. From *"set me up for coding on this
project — activate the programming skills"* it opened with *"I'm using the
grayskull-power skill"* and read that `SKILL.md`, then `PLATFORMS.md`. A third run
of the same prompt in an **empty** directory loaded nothing and asked which
project to use — a reasonable miss, not a contradiction. Note codex prints
`Skill descriptions were shortened to fit the skills context budget` when many
skills are installed, and that it loaded from `~/.agents/skills`, not
`$CODEX_HOME/skills` (both are installed; see A11).

**cursor (not verified — and the reason is local).** `cursor-agent`
2026.09.02-c22c1a3, `-p --output-format stream-json --force`, same fixtures.
Two `func-ui`-triggering prompts produced a full plan without ever naming or
reading a skill. The *"activate the programming skills"* prompt did better: the
agent's **first tool call**, before any search, was a read of
`~/.codex/skills/grayskull-power/SKILL.md` — a name and path it was never given —
so the skill inventory clearly reaches the model. That read was refused by a
malformed user-level hook on this machine (`Hook blocked with message: --: eval:
line 1: syntax error`), which blocks *every* `read` call, and the agent closed
with *"a local skill-loading hook is malformed"*. So cursor stays unverified for a
local reason, not a product one; re-run on a machine with no `~/.cursor/hooks.json`
before believing either result. Cursor's docs do claim description-based
auto-loading from `.agents/skills` · `.cursor/skills` (project and `~`).

**antigravity (untestable here).** Only the IDE is installed
(`%LOCALAPPDATA%/Programs/Antigravity IDE`, whose `bin/` holds just the editor
launcher); there is no headless agent binary to drive. The docs claim skills are
auto-selected — *"You don't need to explicitly tell the agent to use a skill — it
decides based on context"* — and document a CLI with a headless mode elsewhere.
**That is Google's claim, not a result.** Closing this row needs the Antigravity
CLI installed and authenticated, then the same fixture probe.

**pi (untestable here, and the row already matches its docs).** `pi` 0.74.2 is
installed but the only configured provider is OpenAI and the key on this machine
is rejected (`401 Incorrect API key`), so no probe could run without adding
credentials. pi's own docs put skill descriptions in the system prompt and then
say the model *"doesn't always"* read the `SKILL.md` — which is why the row stays
**no** and `/skill:<name>` stays the instruction. Its discovery dirs are
`~/.pi/agent/skills` · `~/.agents/skills` · `.pi/skills` · `.agents/skills`; the
installers write `~/.pi/skills`, so on pi it is the shared `~/.agents/skills` copy
that is actually discoverable.

Transcripts for the 2026-09-06 codex and cursor runs are JSONL from each host's
own stream, committed at `practice/baselines/transcripts/`
(`a62-codex-funcui.jsonl`, `a62-codex-grayskull2.jsonl`,
`a62-cursor-funcui.jsonl`, `a62-cursor-funcui2.jsonl`,
`a62-cursor-grayskull.jsonl`). **Never promote a row here without one.**

**The deterministic route, for the hosts that are not verified and for anyone who
wants certainty:** the **Always-on project file** row above. `grayskull-power`
writes `.skillator/grayskull.md` on first invoke and appends a pointer to
`CLAUDE.md` / `AGENTS.md` / `GEMINI.md`, so the router is in context before the
first request. That path is verified on claude-code headless (the router loaded
first, then routed). On cursor/codex/antigravity/pi it rests on the same
always-on file each host already documents — **not** separately tested here.
Failing both, name the skill.

On **prime-agent** this is the *only* route: there is no markdown-skill loader, so
`.skillator/grayskull.md` plus an `AGENTS.md` pointing at it is the activation
mechanism, and `install.sh` cannot write it for you — it only prints the
reminder. Nobody has run that path end-to-end on prime-agent; treat it as
untested until someone does.

Nothing in `install.sh` / `install.ps1` writes a user-level always-on line; they
install skills and the shared docs only.

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

**codex hooks — what is actually verified.** Codex has a hook system configured
by `hooks.json`, and its event enum is wider than turn-start events. Read out of
the shipped binary (`codex.exe`, `codex-cli 0.147.0-alpha.6.5`) with `grep -a`,
the enum is `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`,
`PostCompact`, `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `SubagentStart`,
`SubagentStop`, **`Stop`**. Three handler types are in the config schema —
`command`, `prompt`, `agent` — but only `command` runs: the binary carries
`prompt hooks are not supported yet` and `agent hooks are not supported yet`
(and `async hooks are not supported yet`). There is an `additionalContext`
output field with a per-hook `additionalContextLimit`, and a warning string
`ignoring additionalContextLimit for <event> hook in <file>: this event cannot
emit additionalContext` — the binary does not spell out which events those are.

**What is verified.** Two Codex builds are installed on this machine and they
differ, so cite the one you actually run:

| | on `PATH` (npm shim, `codex-cli 0.153.2`) | `~/AppData/Local/OpenAI/Codex/bin/<hash>/codex.exe` |
|---|---|---|
| `Stop` event | yes | yes |
| exit 2 + stderr continuation prompt | yes | yes |
| `decision:block` JSON payload | **no** | yes |

Both carry `Stop hook exited with code 2 but did not write a continuation prompt
to stderr` and `Stop hook requested continuation without a prompt` — strings that
only exist because the code reads a continuation prompt off stderr after an exit
2. That is the same convention Claude Code's `Stop` hook uses, and it is present
in the build that actually runs. `Stop hook returned decision:block without a
non-empty reason` appears **only** in the Local build, so the JSON form is not
portable between them.

**What the live test found: the hook does not fire.** Tested 2026-09-04 against
`codex-cli 0.153.2` via `codex exec`. A `command` handler on `Stop` was tried at
`~/.codex/hooks.json` and at `~/.codex/hooks/hooks.json`, in both the bare
`{command}` shape and the `{enabled, matcher, hooks:[{type,command,timeoutMs}]}`
shape, with `--dangerously-bypass-hook-trust`. The turn completed normally every
time and the handler never ran — no stderr marker, and no filesystem side effect
from a handler that wrote one.

So: the `Stop` code path is compiled in, but no reachable configuration was found
that invokes it from `codex exec`. Untried, and where the answer probably lives:
an interactive `codex` session rather than `exec`, a per-repo `.codex/hooks.json`,
whatever persists hook trust properly, or a build newer than this one. Treat
Codex as having **no usable turn-end gate today** and keep the `check` fallback —
which stays for cursor and antigravity regardless.

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
