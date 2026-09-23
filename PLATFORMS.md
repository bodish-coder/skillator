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
| **deep** | Creative design, hard reasoning, semantic judgement, the final whole-branch review | Fable / Opus | the strongest reasoning slug the Task tool offers (GPT-5.6-Sol, Claude Opus) | `model = "gpt-6-astra"`, then GPT-5.6-Sol — **never Luna** — with `reasoning_effort: high` or `xhigh` | `/model` → Gemini 3.1 Pro or Claude Opus | `/model` → the account's strongest reasoning model | the child-agent config's strongest provider |
| **build** | Implement the design; review a task's diff — strongest coder available | Opus | Claude Opus, or the strongest coding slug allowed | `reasoning_effort: medium` | `/model` → Claude Sonnet or Opus | `/model` → the account's strongest coding model | the login provider, default child config |
| **cheap** | Transcription, single-file mechanical edits, bulk summarizing, trivial conflicts | Sonnet / Haiku | the cheapest slug in the Task tool's list | `reasoning_effort: low` | `/model` → Gemini 3.5 Flash or GPT-OSS 120B | `/model` → the cheapest configured provider | a child agent on the cheapest configured provider |
| **orchestrator** | Main session: dispatch, rule, keep the ledger, write files, checkpoints | the running session | the running session | the running session | the running session | the running session | the running session |

**codex, complex work:** GPT-6-Astra is the prime model and the first choice for
anything in the **deep** tier; GPT-5.6-Sol is the fallback when Astra is
unavailable. **Luna is not used for complex work** — it is fine at the `cheap`
tier, but never for design, hard reasoning, semantic judgement or a whole-branch
review. Astra is already the default in `~/.codex/config.toml`; the tier is set
with `reasoning_effort`, not by switching model per task.

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
| **Skill install path** | `~/.claude/skills/<n>/` or plugin cache | `.cursor/skills/<n>/`, `.agents/skills/<n>/`, global `~/.cursor/skills/`, `~/.agents/skills/` (nested dirs too) | `$CODEX_HOME/skills/<n>/`, `~/.agents/skills/<n>/` (both load with no dedupe on 0.155.1, probed 2026-09-23; 0.153.2 read only `~/.agents/skills` (A62a); the installer writes only `$CODEX_HOME/skills`) | `<ws>/.agents/skills/<n>/`, global `~/.gemini/skills/<n>/` (read by Gemini CLI 0.57; also reads `~/.agents/skills/`, where a same-named copy wins; `~/.gemini/config/skills/` is not read by the CLI, probed 2026-09-23); the installer also writes `~/.gemini/config/skills/<n>/` for Antigravity's own docs | `~/.pi/agent/skills/<n>/`, `~/.agents/skills/<n>/`, `.pi/skills/<n>/` (project-level only; the global `~/.pi/skills/` is not read, probed on pi 0.74) | no markdown-skill loader — see below |
| **Load another skill** | `Skill` tool | auto-discovered by description; else read its `SKILL.md` and follow it | auto-loaded when the task matches; else read its `SKILL.md` | auto-discovered; force with `/<skill-name>` | force with `/skill:<name>` | Read the `SKILL.md` and follow it |
| **Delegate work** | `Agent` tool + `model` override | `Task` tool + model slug | subagents (GA Mar 2026) — up to 8 parallel, own context + sandbox | background subagents (`/agents`), nestable | no native delegation — `subagent` extension or a `pi` subprocess; else sequential in-session passes | `rlm(...)` spawns real child agents |
| **Switch tier** | per-agent `model` | per-Task model slug | `reasoning_effort` low/medium/high/xhigh | `/model` mid-session (Gemini 3.5 Flash / 3.1 Pro / Claude Sonnet / Opus / GPT-OSS 120B, plan-dependent) | `/model` mid-session (15+ providers) | provider chosen at `/login`; tier by prompt + child-agent config |
| **Context checkpoint** | `/compact`, `/clear` | new composer/chat turn | auto-compacts; new thread for a clean slate | new session (`/agents` keeps background work) | new session | `/refine` + daemon sessions, `prime-agent --resume <id>` |
| **Always-on project file** | `CLAUDE.md` (`@path` imports) | `AGENTS.md` | `AGENTS.md` | `GEMINI.md` (`@path` imports) | `AGENTS.md` | `AGENTS.md` |
| **Usage % readable** | `statusLine` `rate_limits.*.used_percentage` | no | yes — `~/.codex/sessions/**/rollout-*.jsonl`, last `token_count` | no | no | no |
| **Turn-end hook that can inject** | `Stop` → `{"decision":"block"}` | `stop` in `~/.cursor/hooks.json` (`command`/`prompt`) | `Stop` in `hooks.json` → `{"decision":"block","reason":…}` on stdout (0.155.1, verified under `codex exec`; needs hook trust). Exit 2 + stderr does not inject. See the codex note | `AfterAgent` / `PreCompress` in `~/.gemini/settings.json` | no | no |
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
| cursor | **yes, verified** — 2026-09-23, `cursor-agent` 2026.09.18, 4/4 — but every load came from the user-level `~/.cursor/skills`; a fixture-local `.cursor/skills`/`.agents/skills` never appeared in its inventory (self-reported, unconfirmed) |
| antigravity | claimed by the host; **untestable here** — IDE only on this machine, no CLI |
| pi | **yes, verified** — 2026-09-23, `pi` 0.74.2 / openai gpt-5.5, 4/4, from project-local `.pi/skills` with `PI_CODING_AGENT_DIR` and `HOME` isolated |
| prime-agent | **no** — no markdown-skill loader at all |

The claude-code runs were headless, from a throwaway fixture outside any repo,
with no `CLAUDE.md`/`AGENTS.md` in the cwd: `designui-galadriel` loaded 5/5 from *"just a
mockup … make it real"* (once under `--plugin-dir` + `--add-dir`, the GREEN
harness shape), `resume-cortana` from *"pick up the pending tasks from the
handoffs"*, `grayskull-power` from *"set me up for coding"*. This supersedes the
earlier A55 observation that no skill fired; see `practice/baselines/README.md`.

**codex (verified).** Same probe shape, 2026-09-06: `codex exec --json -s
read-only --skip-git-repo-check` from a throwaway fixture in the system temp dir
holding only `index.html` + `app.js` (hardcoded data, dead button), no
`AGENTS.md` anywhere in the tree, and a `~/.codex/AGENTS.md` that never mentions
skills. From *"just a mockup … the buttons don't do anything … make it real"* its
first message was *"I'm using the func-ui skill for this conversion"*, followed by
a read of `~/.agents/skills/func-ui/SKILL.md` (the name and path at the time;
the skill is now `designui-galadriel`). From *"set me up for coding on this
project — activate the programming skills"* it opened with *"I'm using the
grayskull-power skill"* and read that `SKILL.md`, then `PLATFORMS.md`. A third run
of the same prompt in an **empty** directory loaded nothing and asked which
project to use — a reasonable miss, not a contradiction. Note codex prints
`Skill descriptions were shortened to fit the skills context budget` when many
skills are installed, and that it loaded from `~/.agents/skills`, not
`$CODEX_HOME/skills` (both are installed; see A11).

**cursor (verified).** Earlier probe, `cursor-agent` 2026.09.02-c22c1a3,
`-p --output-format stream-json --force`: two `designui-galadriel`-triggering prompts
produced a full plan without ever naming or reading a skill, and the *"activate
the programming skills"* prompt's first tool call — before any search — was a
read of `~/.codex/skills/grayskull-power/SKILL.md`, a name and path it was never
given, but that read was refused by a malformed user-level hook on that machine
(`Hook blocked with message: --: eval: line 1: syntax error`), blocking *every*
`read` call. Re-run 2026-09-23, `cursor-agent` 2026.09.18, 4/4 fixture prompts
loaded a skill unprompted — pointing `CLAUDE_CONFIG_DIR` at an empty temp dir
avoided that claude-mem Read-hook block (0 "Hook blocked" this run). But every
load came from the user-level `~/.cursor/skills` (a stale old-name install:
`func-ui`, `grayskull-power`); a fixture-local `.cursor/skills` / `.agents/skills`
never appeared in its inventory (self-reported, unconfirmed). Cursor's docs do
claim description-based auto-loading from `.agents/skills` · `.cursor/skills`
(project and `~`).

**antigravity (untestable here).** Only the IDE is installed
(`%LOCALAPPDATA%/Programs/Antigravity IDE`, whose `bin/` holds just the editor
launcher); there is no headless agent binary to drive. The docs claim skills are
auto-selected — *"You don't need to explicitly tell the agent to use a skill — it
decides based on context"* — and document a CLI with a headless mode elsewhere.
**That is Google's claim, not a result.** Closing this row needs the Antigravity
CLI installed and authenticated, then the same fixture probe.

**pi (verified).** Earlier probe found `pi` 0.74.2 installed but the only
configured provider, OpenAI, rejected the key on that machine (`401 Incorrect
API key`), so no probe could run. pi now has a working credential
(`OPENAI_API_KEY`); re-run 2026-09-23, `pi` 0.74.2 / openai `gpt-5.5`, with
`PI_CODING_AGENT_DIR` and `HOME` isolated to empty temp dirs: 4/4 fixture
prompts loaded a skill unprompted from project-local `.pi/skills` (both
`func-ui`-triggering runs stopped at the plan, matching that skill's contract).
Its discovery dirs are `~/.pi/agent/skills` · `~/.agents/skills` · `.pi/skills` ·
`.agents/skills`; only the project-level `.pi/skills` was exercised here.

Transcripts for the 2026-09-06 codex/cursor runs and the 2026-09-23 cursor/pi
re-runs are JSONL from each host's own stream, committed at
`practice/baselines/transcripts/` (`a62-codex-funcui.jsonl`,
`a62-codex-grayskull2.jsonl`, `a62-cursor-funcui.jsonl`,
`a62-cursor-funcui2.jsonl`, `a62-cursor-grayskull.jsonl`,
`a62b-cursor-funcui.jsonl`, `a62b-cursor-funcui2.jsonl`,
`a62b-cursor-grayskull.jsonl`, `a62b-cursor-grayskull2.jsonl`,
`a62b-pi-funcui.jsonl`, `a62b-pi-funcui2.jsonl`, `a62b-pi-grayskull.jsonl`,
`a62b-pi-grayskull2.jsonl`). **Never promote a row here without one.**

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

**codex** — skills live in `$CODEX_HOME/skills/` (the installer's target; 0.155.1
also reads `~/.agents/skills/`, with no dedupe) and load when the task matches;
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

| | on `PATH` (npm shim, `codex-cli 0.153.2`) | `~/AppData/Local/OpenAI/Codex/bin/<hash>/codex.exe` | `codex-cli 0.155.1` (`codex exec`) |
|---|---|---|---|
| `Stop` event | yes | yes | yes |
| exit 2 + stderr continuation prompt | yes | yes | compiled in, does not inject (0.155.1) |
| `decision:block` JSON payload | **no** | yes | yes (0.155.1) |

Both carry `Stop hook exited with code 2 but did not write a continuation prompt
to stderr` and `Stop hook requested continuation without a prompt` — strings that
only exist because the code reads a continuation prompt off stderr after an exit
2. That is the same convention Claude Code's `Stop` hook uses, and it is present
in the build that actually runs. `Stop hook returned decision:block without a
non-empty reason` appears **only** in the Local build, so the JSON form is not
portable between them.

**Live test, 2026-09-23, `codex-cli 0.155.1`, `codex exec`: the hook fires.** A
`command` handler in
`{"hooks":{"Stop":[{"matcher":"","hooks":[{"type":"command","command":…,"timeout":30}]}]}}`
ran from both `$CODEX_HOME/hooks.json` and a per-repo `.codex/hooks.json`. The
per-repo file needs a trusted project. Both need hook trust:
`--dangerously-bypass-hook-trust`, or trust persisted by the interactive review.
Untrusted hooks are skipped silently. Stdin carries `stop_hook_active` and
`last_assistant_message`. **Exit 2 + stderr does not continue the turn**
(reported `Stop Failed`). **stdout `{"decision":"block","reason":…}` does:** the
reason re-enters as a `<hook_prompt>` and the model runs again with
`stop_hook_active:true`. The 0.153.2 failure is superseded. Keep `check` for
cursor and antigravity.

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
