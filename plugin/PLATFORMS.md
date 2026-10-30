# Platform adapters — how skillator skills run on each host

Every skill in this repo is written against **role tiers** and **generic
mechanics**, not against one vendor's tools. This file is the single mapping
table. A skill that names Claude Code models or `/compact` is showing its
default; translate through the row for your host.

**If this file isn't reachable** (skill copied out on its own), assume the
`claude-code` row and say so once.

## Capability evidence

This is the canonical support ledger, reviewed **2026-10-31**. The mechanics
below describe intended routes, not a blanket support guarantee. A level applies
only to its row, version and observation:

- **implemented**: committed adapter/template exists; host execution is unverified.
- **tested with stubs**: offline fixtures exercise that implementation; no real
  host, phone pairing, model loading or hook trust is implied.
- **verified live**: a recorded real-host observation, including headless or
  scripted PTY runs, limited to the capability named. It is historical evidence,
  not a claim about today's installed version.
- **unverified gap / not implemented**: no qualifying evidence or no adapter.

Dates on implemented/stub rows are this source review date, not a new test run.
`unknown` means the host CLI version was not recorded for that evidence. Local
tests, schema/help inspection and model self-reports cannot establish live support.
Windows Git sh evidence is not native Linux/macOS evidence. F137 inventory,
F138 parity fixtures and F141's validation runner test repository behavior;
they do not upgrade any host row. F140's shared-source generator is still pending
Q1 and is not implemented. The RUN-0027 full registry on detached `c4dd648` was
still running at this review; no full-suite pass is claimed here.

### Skill discovery and loading

Implementation: [skills](skills/), [shell installer](install.sh),
[PowerShell installer](install.ps1). Discovery means inventory/path visibility;
loading means an observed read/use of a skill body. Neither proves commands,
delegation, remote pairing, or hooks.

| Host / capability | Level | CLI version; evidence date | Evidence and limitation |
|---|---|---|---|
| Claude Code / description-triggered loading | verified live | 2.1.261; 2026-09-06 | [A57 record](practice/baselines/README.md): seven headless loads; not every skill or newer version. |
| Codex / description-triggered loading | verified live | 0.153.2; 2026-09-06 | [actual skill read](practice/baselines/transcripts/a62-codex-grayskull2.jsonl), from `~/.agents/skills`; does not prove today's installer destination. |
| Cursor / description-triggered loading | verified live | 2026.09.18; 2026-09-23 | [actual skill read](practice/baselines/transcripts/a62b-cursor-grayskull.jsonl), user-level skills; project discovery remained unconfirmed. |
| agy / description-triggered loading | verified live | 1.2.9; 2026-09-24 | [actual skill read](practice/baselines/transcripts/a62c-agy-grayskull.jsonl), project `.agents/skills`; stale user copies affected other probes. |
| Pi / description-triggered loading | verified live | 0.74.2; 2026-09-23 | [actual skill read](practice/baselines/transcripts/a62b-pi-grayskull.jsonl), isolated project `.pi/skills`; other discovery paths not exercised. |
| Gemini CLI / discovery and loading | implemented | unknown; 2026-10-31 | Installers write Gemini paths; no committed model-loading observation identified. agy evidence does not apply. |
| Muse / plugin discovery | implemented; unverified live evidence gap | 1.4.12 / 1.4.13 reported; 2026-10-24 / 26 | [manifest](.muse-plugin/plugin.json); historical scratch-install observations below have no linked raw run record. Auto-loading unverified. |
| OpenCode / skill discovery | implemented; unverified live evidence gap | 1.19.4 reported; 2026-10-24 | Installers and historical `debug skill` observation below; no linked raw run record or model-loading evidence. |
| Prime Agent / manual skill reading | unverified gap | unknown; 2026-10-31 | [router instructions](skills/grayskull-power/SKILL.md); no markdown loader adapter or recorded host run. |
| Claude Code / always-on router | verified live | 2.1.261; 2026-09-06 | [A57 record](practice/baselines/README.md), fixture pointer loaded router first. |
| Cursor / always-on router | implemented | unknown; 2026-10-31 | [router](skills/grayskull-power/SKILL.md); no separate startup-loading probe. |
| Codex / always-on router | implemented | unknown; 2026-10-31 | [router](skills/grayskull-power/SKILL.md); no separate startup-loading probe. |
| agy / always-on router | implemented | unknown; 2026-10-31 | [router](skills/grayskull-power/SKILL.md); no separate startup-loading probe. |
| Gemini CLI / always-on router | implemented | unknown; 2026-10-31 | [router](skills/grayskull-power/SKILL.md); no separate startup-loading probe. |
| Pi / always-on router | implemented | unknown; 2026-10-31 | [router](skills/grayskull-power/SKILL.md); no separate startup-loading probe. |
| Muse / always-on router | unverified gap | unknown; 2026-10-31 | No startup-loading evidence identified. |
| OpenCode / always-on router | unverified gap | unknown; 2026-10-31 | No startup-loading evidence identified. |
| Prime Agent / always-on router | unverified gap | unknown; 2026-10-31 | Manual `AGENTS.md` route only; never exercised here. |

### Generated commands and execution

Implementation is [commands](commands/), [host templates](host-commands/) and
the two installers above. Offline generation/substitution does not prove host
expansion or correct model output. The command list below remains the interface;
unlisted commands in a tested host are **implemented, live unverified**.

| Host / capability | Level | CLI version; evidence date | Evidence and limitation |
|---|---|---|---|
| Claude Code / namespaced command expansion | verified live | 2.1.308; 2026-10-22 | [host-command record](practice/baselines/green-host-commands-f54-f58-f59.txt): engage/archive expand; bare engage did not in headless mode, and expansion did not guarantee the expected engage output. |
| Cursor / pending, engage, archive expansion | verified live | 2026.10.19-6bbf2c4; 2026-10-22 | [host-command record](practice/baselines/green-host-commands-f54-f58-f59.txt): pending used user-level command; engage/archive used project commands. Picker still unverified. |
| Pi / pending and engage expansion | verified live | 0.74.2; 2026-10-22 | [host-command record](practice/baselines/green-host-commands-f54-f58-f59.txt): prompt-template expansion; archive failed that run, so no blanket command pass. |
| agy / engage, bare engage and routing | verified live | 1.4.7; 2026-10-26 | [A149 r6-r10](practice/baselines/green-agy-engage-skills.txt); pending required sandbox bypass, later local fix not re-run inside agy; polluted r12/r13 excluded. A149 remains testing. |
| Codex / project-local engage and pending skills | verified live | 0.164.0; 2026-10-26 | [A149 c2/c3/c5](practice/baselines/green-agy-engage-skills.txt), `.agents/skills` only; not installed `$CODEX_HOME/skills`. Historical sandbox writes occurred despite read-only mode. |
| Codex / installed command discovery and loading protocol | tested with stubs | unknown (stub executable); 2026-10-31 | [F139 harness](practice/scripts/codex-isolation.mjs), [tests](practice/scripts/codex-isolation.test.mjs): isolated install/native-protocol checks, not actual Codex. F90 and A149 live owner checks remain. |
| Gemini CLI / generated TOML expansion | implemented | 0.57.0 attempted; 2026-10-22 | [host-command record](practice/baselines/green-host-commands-f54-f58-f59.txt): authentication blocked execution; syntax/help inspection is not live expansion. |
| OpenCode / generated Markdown commands | implemented | 1.19.4 reported; 2026-10-24 | [templates](host-commands/opencode/); debug-config inventory described below, no model execution or picker evidence. |
| Muse / commands | not implemented | unknown; 2026-10-31 | [manifest](.muse-plugin/plugin.json) has no commands; use skills, with loading gap above. |
| Prime Agent / commands | not implemented | unknown; 2026-10-31 | No command adapter; manual skill route only. |

### Usage hooks and trust

Implementation: [watch-cortana hooks](skills/watch-cortana/hooks/). Installing a
hook, discovering its config, trusting it, executing it and seeing a continuation
are separate observations. No remote-pairing result proves any of these.

| Host / capability | Level | CLI version; evidence date | Evidence and limitation |
|---|---|---|---|
| Claude Code / usage reader and Stop gate | implemented | unknown; 2026-10-31 | [PowerShell selftest](skills/watch-cortana/hooks/selftest.ps1); local fixtures do not establish current host hook execution/trust. |
| Codex / usage reader and Stop continuation | verified live | 0.156.1; 2026-09-24 | [A83](practice/baselines/green-codex-stop-gate.txt): real rollout, silent default, forced block and loop guard. Historical run bypassed hook trust; it does **not** verify normal trust onboarding. |
| Codex / installed hook inventory and trust reporting | tested with stubs | unknown (stub executable); 2026-10-31 | [F139 tests](practice/scripts/codex-isolation.test.mjs), [native probe](practice/scripts/codex-native-probe.mjs); actual trusted discovery/execution remains unverified. |
| Cursor / turn-end injection and quota | unverified gap | unknown; 2026-10-31 | Manual watch `check` fallback; no readable quota source or live injection evidence identified. |
| agy / turn-end injection and quota | unverified gap | unknown; 2026-10-31 | Manual watch `check` fallback; Gemini hook documentation is not agy evidence. |
| Gemini CLI / AfterAgent injection and quota | unverified gap | unknown; 2026-10-31 | Remote attach hook below is separate from usage monitoring; no live usage/trust evidence. |
| Pi / usage injection and quota | not implemented | unknown; 2026-10-31 | No usage adapter; manual checks cannot manufacture quota data. |
| Muse / usage injection and quota | not implemented | unknown; 2026-10-31 | Claude ops-board hook format is not a Muse hook adapter. |
| OpenCode / usage injection and quota | unverified gap | unknown; 2026-10-31 | No tested usage/trust adapter identified. |
| Prime Agent / usage injection and quota | not implemented | unknown; 2026-10-31 | No usage adapter or host run. |

### Board rendering and launching

| Host / capability | Level | CLI/runtime version; evidence date | Implementation, evidence and limitation |
|---|---|---|---|
| Claude Code / pane, band and actions | tested with stubs | unknown; 2026-10-31 | [mod hooks](mods/ops-board/hooks/), [mounted tests](mods/ops-board/tests/); mocked host/event chains, not physical keyboard/mouse. B15/B17 owner checks remain. |
| Pi / ops overlay | verified live | 0.74.2; 2026-10-22 | [extension](mods/ops-board/pi/index.ts), [scripted ConPTY record](practice/baselines/green-pi-ops-f56.txt); real Pi UI, no model call or human visual inspection. |
| Antigravity IDE / webview and one-frame command | tested with stubs | IDE 1.107.0 reported; run date unknown | [extension](mods/ops-board/antigravity/extension.cjs), [tests](mods/ops-board/antigravity/tests/ops.test.mts); historical headless activation below has no linked run record. Live owner panel check remains. |
| Codex / `$ops` launch | implemented | unknown; 2026-10-31 | [ops skill template](host-commands/antigravity/ops/SKILL.md), F139 installer fixture; F105 real-session board opening remains unverified. |
| agy / `/ops` launch | implemented | unknown; 2026-10-31 | [ops skill template](host-commands/antigravity/ops/SKILL.md); no recorded real-session launch. |
| Standalone Windows terminal / rendering and launcher | verified live | Node 22.23.2, PowerShell 5.1, Git sh version unknown; 2026-10-22 | [app](mods/ops-board/ops/), [scripted ConPTY record](practice/baselines/green-ops-standalone-f55.txt); no human window inspection, native POSIX or `--open` tab verification implied. |
| Cursor / external board | implemented | unknown; 2026-10-31 | [launchers](mods/ops-board/ops/); standalone evidence above, no Cursor pane or host-triggered launch proof. |
| Gemini CLI / external board | implemented | unknown; 2026-10-31 | [launchers](mods/ops-board/ops/); no host-integrated rendering proof. |
| OpenCode / external board | implemented | unknown; 2026-10-31 | [launchers](mods/ops-board/ops/); no native pane. |
| Muse / external board | implemented | unknown; 2026-10-31 | [launchers](mods/ops-board/ops/); Claude mod skipped, no native pane. |
| Prime Agent / external board | unverified gap | unknown; 2026-10-31 | Standalone app exists; no Prime Agent install/launch run. |
| Standalone / profile quota status | implemented | unknown; 2026-10-31 | [status reader](mods/ops-board/ops/status.ts), [fixtures](mods/ops-board/ops/tests/quota-profile.test.mts); Claude/Codex sources only, unavailable values stay unavailable. |

### Remote routes

Implementation: [bridge/supervisor](skills/remote-cerebro/hooks/cerebro-bridge.mjs),
[core](skills/remote-cerebro/hooks/cerebro-core.mjs). Evidence:
[offline selftests](skills/remote-cerebro/hooks/cerebro-selftest.mjs) and
[stub executables](skills/remote-cerebro/hooks/stubs/). All stub rows below are
reviewed 2026-10-31 with real CLI version **unknown**. The older surface versions
in the [route notes](skills/remote-cerebro/references/hosts.md) are help/schema
observations, not versions verified by these tests. [F34](practice/baselines/green-cerebro.txt)
tests the skill's decisions with restrictions/stubs, not real phone pairing.

| Host / capability | Level | Evidence and limitation |
|---|---|---|
| Codex / native remote supervisor | tested with stubs | Native lifecycle fixtures; Windows QR/pairing and enforcement on phone-created threads remain unverified. |
| Codex / app-server bridge | tested with stubs | Protocol/approval fixtures; no real host round trip or phone pairing. |
| Cursor / native worker supervisor | tested with stubs | Native lifecycle fixtures; Windows worker, plan entitlement and mobile selection unverified. |
| Cursor / ACP bridge | tested with stubs | ACP fixtures; real permission/read-gating proof required before arm. |
| Cursor / attach followup hook | unverified gap | v2 route note only; no live CLI hook support established. |
| Pi / RPC bridge | tested with stubs | RPC fixtures; real session/phone integration unverified. |
| Pi / launched-session attach | tested with stubs | [extension](skills/remote-cerebro/hooks/pi-cerebro.ts), mock Pi API; cannot adopt an arbitrary existing session. |
| Gemini CLI / ACP bridge | tested with stubs | ACP fixtures; real permission/read-gating proof required before arm. |
| Gemini CLI / AfterAgent attach | implemented | [hook](skills/remote-cerebro/hooks/gemini-afteragent.mjs); disabled v2 route, real feed unverified; cannot answer approvals from phone. |
| Gemini CLI / native remote | not implemented | No native route in this adapter; no claim about later vendor releases. |
| agy / native remote supervisor | tested with stubs | Native lifecycle fixtures. Route notes report arm/teardown on 1.4.2, 2026-10-19, but no linked durable live record; pairing and phone-side mode enforcement remain gaps. |
| Claude Code / remote | not implemented here | Vendor Remote Control is outside remote-cerebro; no support claim from this repo. |
| Muse / remote | not implemented | No adapter or recorded run. |
| OpenCode / remote | not implemented | No adapter or recorded run. |
| Prime Agent / remote | not implemented | No adapter or recorded run. |

Tier selection, delegation, context checkpoint and memory rows below are
translation guidance. For **each host**, these additional mechanics have an
**unverified gap** (CLI version unknown, reviewed 2026-10-31) unless a specific
run is cited: there is no general compatibility test behind that table. A skill
read does not prove that its later delegation/workflow ran. Keep F90, F105 and
A149 in testing until their remaining owner checks pass; historical A149
project-local success and F139 stubs do not close installed-profile gaps.

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

**Defaults for `build-jarvis`.** The first slug in a cell is that tier's
default model on that host. `grayskull-power`'s `tiers` arm step writes them
to `.skillator/tiers.local.md` (gitignored) once per session, and
`build-jarvis` reads that file; with no file it takes these first slugs
directly. A model that fails at dispatch as unavailable is marked `down:` in the
file and the seat retries one tier lower.

## Detect the host

| Signal | Host |
|--------|------|
| `Skill` tool; `/compact` and `/clear` | `claude-code` |
| `Task` tool with `subagent_type` + model slug list | `cursor` |
| `commentary`/`final` channels; auto context compaction | `codex` |
| `/skills`, `/agents`, `/model`; skills under `.agents/skills/` | `antigravity` |
| `/skill:<name>`; AGENTS.md from `~/.pi/agent/`; `/model` mid-session | `pi` |
| `skill` tool; `opencode.json`; config under `~/.config/opencode/`; Tab switches the build / plan agents | `opencode` |
| persistent IPython; `rlm(...)`; `prime-agent agents` | `prime-agent` |

Ambiguous → ask once. The user can override with `platform: <host>`.

## The table

Mechanics reference only: consult the [capability evidence](#capability-evidence)
above for support. Historical `verified` tags below may mean path/schema
inspection or an old headless probe; they are not the `verified live` level.
Where a historical summary differs, the capability ledger takes precedence.

| | claude-code | cursor | codex | antigravity | pi | prime-agent |
|---|---|---|---|---|---|---|
| **Skill install path** | `~/.claude/skills/<n>/` or plugin cache | `.cursor/skills/<n>/`, `.agents/skills/<n>/`, global `~/.cursor/skills/`, `~/.agents/skills/` (nested dirs too) | `$CODEX_HOME/skills/<n>/`, `~/.agents/skills/<n>/` (both load with no dedupe on 0.155.1, probed 2026-09-23; 0.153.2 read only `~/.agents/skills` (A62a); the installer writes only `$CODEX_HOME/skills`) | `<ws>/.agents/skills/<n>/`, global `~/.gemini/skills/<n>/` (read by Gemini CLI 0.57; also reads `~/.agents/skills/`, where a same-named copy wins; `~/.gemini/config/skills/` is not read by the CLI, probed 2026-09-23); the installer also writes `~/.gemini/config/skills/<n>/` for Antigravity's own docs, and `~/.gemini/antigravity-cli/skills/<n>/`, the global dir `agy` 1.4.5 reads (B8, 2026-10-23) | `~/.pi/agent/skills/<n>/`, `~/.agents/skills/<n>/`, `.pi/skills/<n>/` (project-level only; the global `~/.pi/skills/` is not read, probed on pi 0.74) | no markdown-skill loader — see below |
| **Load another skill** | `Skill` tool | auto-discovered by description; else read its `SKILL.md` and follow it | auto-loaded when the task matches; else read its `SKILL.md` | auto-discovered; force with `/<skill-name>` | force with `/skill:<name>` | Read the `SKILL.md` and follow it |
| **Delegate work** | `Agent` tool + `model` override | `Task` tool + model slug | subagents (GA Mar 2026) — up to 8 parallel, own context + sandbox | background subagents (`/agents`), nestable | no native delegation — `subagent` extension or a `pi` subprocess; else sequential in-session passes | `rlm(...)` spawns real child agents |
| **Switch tier** | per-agent `model` | per-Task model slug | `reasoning_effort` low/medium/high/xhigh | `/model` mid-session (Gemini 3.5 Flash / 3.1 Pro / Claude Sonnet / Opus / GPT-OSS 120B, plan-dependent) | `/model` mid-session (15+ providers) | provider chosen at `/login`; tier by prompt + child-agent config |
| **Context checkpoint** | `/compact`, `/clear` | new composer/chat turn | auto-compacts; new thread for a clean slate | new session (`/agents` keeps background work) | new session | `/refine` + daemon sessions, `prime-agent --resume <id>` |
| **Always-on project file** | `CLAUDE.md` (`@path` imports) | `AGENTS.md` | `AGENTS.md` | `GEMINI.md` (`@path` imports) | `AGENTS.md` | `AGENTS.md` |
| **Usage % readable** | `statusLine` `rate_limits.*.used_percentage` | no | yes — `$CODEX_HOME/sessions/**/rollout-*.jsonl` (default `~/.codex`), last `token_count`; the `Stop` stdin's `transcript_path` names the session's own | no | no | no |
| **Turn-end hook that can inject** | `Stop` → `{"decision":"block"}` | `stop` in `~/.cursor/hooks.json` (`command`/`prompt`) | `Stop` in `hooks.json` → `{"decision":"block","reason":…}` on stdout (0.155.1, verified under `codex exec`; needs hook trust). Exit 2 + stderr does not inject. `watch-cortana` `usage-watch.* gate` wired and verified here, 0.156.1 (A83). See the codex note | `AfterAgent` / `PreCompress` in `~/.gemini/settings.json` | no | no |
| **Durable memory** | `CLAUDE.md` + files on disk | files on disk | `AGENTS.md` + files | `AGENTS.md` + files | `AGENTS.md` (`~/.pi/agent/`, parents, cwd) + files | Continual Harness + `AGENTS.md` + files |
| **Slash command file** (`/pending`, `/list-tickets`, `/engage`, `/archive-tickets`, `/sync-tickets`, `/skillator-update`, `/team-messages`, `/pending-subagent`, `/verify-subagent`, `/marathon-plan`, `/marathon-run`; F54, F58, F59, F63, F65, F66, F71, F72, F73, texts in `host-commands/<host>/`, tags in "Commands - what is verified") | the ops-board mod's own commands / `commands/*.md`; the installer writes none | `~/.cursor/commands/<n>.md`, `.cursor/commands/<n>.md` | a skill (F90): `$CODEX_HOME/skills/<n>/SKILL.md`, from `host-commands/antigravity/` → `$<n>` (or pick it in `/skills`) | none of its own: a skill is the command, `<ws>/.agents/skills/<n>/SKILL.md` → `/<n>` (workflows deprecated); Gemini CLI: `~/.gemini/commands/<n>.toml` | `~/.pi/agent/prompts/<n>.md`, `.pi/prompts/<n>.md` → `/<n>` | **none — the skill route** (no command mechanism) |
| **Remote drive** (from a phone, `remote-cerebro`; matrix and evidence tags in [`skills/remote-cerebro/references/hosts.md`](skills/remote-cerebro/references/hosts.md)) | not this skill — Claude Code's own Remote Control | native: cloud agent via `agent worker start` (runs here, not the local TUI); bridge via `agent acp` arms only after an ACP proof | native: `codex remote-control` + ChatGPT app (Windows pairing unproven); bridge: `codex app-server` | gemini: **no native remote** — bridge via `--acp` (after an ACP proof); attach hook v2, approvals not answerable from the phone. agy: native `--remote-control` | bridge: `--mode rpc` (own) or `--mode attach` on a pi cerebro launched; no native remote | not possible (not installed, not probed) |

**Frontmatter:** only `name` + `description` are portable. Everything else
(`user-invocable`, `argument-hint`, `license`) is ignored where unsupported —
harmless, never load-bearing.

## Auto-invocation — what is actually verified

The "Load another skill" row says how a skill *can* be loaded. Whether the host
loads one **unprompted**, from the description alone, is a separate question.
Five hosts have historical loading probes; use the ledger for each path/version
and the explicit gaps for other hosts.

| Host | Fires on description alone? |
|---|---|
| claude-code | **yes, verified** — 2026-09-06, `claude -p` 2.1.261 / Opus 5, 7/7 |
| codex | **yes, verified** — 2026-09-06, `codex exec` 0.153.2, 2/2 |
| cursor | **yes, verified** — 2026-09-23, `cursor-agent` 2026.09.18, 4/4 — but every load came from the user-level `~/.cursor/skills`; a fixture-local `.cursor/skills`/`.agents/skills` never appeared in its inventory (self-reported, unconfirmed) |
| antigravity | **yes, verified** — 2026-09-24, `agy` 1.2.9, 4/4 — `grayskull-power` 2/2 from the fixture's project-local `.agents/skills`; the `func-ui`-triggering prompt 2/2 loaded the stale user-level `~/.gemini/config/skills/func-ui` instead of the fixture's `designui-galadriel` |
| pi | **yes, verified** — 2026-09-23, `pi` 0.74.2 / openai gpt-5.5, 4/4, from project-local `.pi/skills` with `PI_CODING_AGENT_DIR` and `HOME` isolated |
| muse | **unverified** — F68 (2026-10-24, Muse Code 1.4.12): `muse plugins validate` - 28 skills `supported` (summary `full`); `muse plugins install` into a scratch profile - `active=true skills=28`; B11 (Muse Code 1.4.13): `marketplace add <name> <git URL>` + `install skillator@<name>` - `active=true skills=29` (a scratch bare clone over `file://`; the GitHub URL once 4.17.x is pushed), the clone route stays (see the muse section); an unprompted load from a description not run |
| opencode | **unverified** — F67 (2026-10-24, opencode 1.19.4) checked discovery only: `opencode debug skill` lists the skills in `~/.config/opencode/skills`; an unprompted load from the description has not been run |
| prime-agent | **no** — no markdown-skill loader at all; not installed on this machine (2026-09-24), so its always-on-file route is still unrun |

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

**antigravity (verified).** Earlier only the IDE was installed, with no headless
agent binary. The Antigravity CLI is now installed (`agy` 1.2.9, signed in) and
was probed 2026-09-24 with `agy -p … --new-project --sandbox --output-format
stream-json` from throwaway fixtures in the system temp dir, each holding
`index.html` + `app.js` + `package.json` and the repo's skills copied into
`.agents/skills/` (the project-local dir `agy` reads — a probe skill placed only
there was listed from that path), with no `AGENTS.md`/`CLAUDE.md`/`GEMINI.md` in
the tree and a `~/.gemini/GEMINI.md` that never mentions skills. 4/4 runs loaded a
skill as their **first tool call**: *"set me up for coding … activate the
programming skills"* read the fixture's `.agents/skills/grayskull-power/SKILL.md`
2/2, although same-named copies sit in `~/.gemini/config/skills` and
`~/.agents/skills`; *"just a mockup … make it real"* read
`~/.gemini/config/skills/func-ui/SKILL.md` 2/2 — a stale old-name user-level
install — and never the fixture's `designui-galadriel`. So `agy` reads
`~/.gemini/config/skills/` (which Gemini CLI does not), and a leftover old-name
install there can win over the project copy. The committed transcripts each end
in a `SUCCESS` result after 9-22 s, having loaded the skill; they do not show the
skill's later work, so only the load is evidenced. Do **not** probe without
`--sandbox`/`--new-project`: an earlier unsandboxed round (`--mode plan` does not
stop edits) resolved to other workspaces, searched the home directory, copied a
fixture into `~/.gemini/antigravity-cli/scratch/` and built a backend there;
those runs are discarded.

**pi (verified).** Earlier probe found `pi` 0.74.2 installed but the only
configured provider, OpenAI, rejected the key on that machine (`401 Incorrect
API key`), so no probe could run. pi now has a working credential
(`OPENAI_API_KEY`); re-run 2026-09-23, `pi` 0.74.2 / openai `gpt-5.5`, with
`PI_CODING_AGENT_DIR` and `HOME` isolated to empty temp dirs: 4/4 fixture
prompts loaded a skill unprompted from project-local `.pi/skills` (both
`func-ui`-triggering runs stopped at the plan, matching that skill's contract).
Its discovery dirs are `~/.pi/agent/skills` · `~/.agents/skills` · `.pi/skills` ·
`.agents/skills`; only the project-level `.pi/skills` was exercised here.
pi also reads every top-level `.md` in `~/.pi/agent/skills` / `.pi/skills` as a
skill, so the installer lists PLATFORMS.md, PRACTICE.md and WORKFLOW.md in that
dir's `.ignore` (pi's skill loader honours it) - without it pi warns
"description is required" for each at every start (A145).

Transcripts for the 2026-09-06 codex/cursor runs and the 2026-09-23 cursor/pi
re-runs are JSONL from each host's own stream, committed at
`practice/baselines/transcripts/` (`a62-codex-funcui.jsonl`,
`a62-codex-grayskull2.jsonl`, `a62-cursor-funcui.jsonl`,
`a62-cursor-funcui2.jsonl`, `a62-cursor-grayskull.jsonl`,
`a62b-cursor-funcui.jsonl`, `a62b-cursor-funcui2.jsonl`,
`a62b-cursor-grayskull.jsonl`, `a62b-cursor-grayskull2.jsonl`,
`a62b-pi-funcui.jsonl`, `a62b-pi-funcui2.jsonl`, `a62b-pi-grayskull.jsonl`,
`a62b-pi-grayskull2.jsonl`) and the 2026-09-24 antigravity runs
(`a62c-agy-funcui.jsonl`, `a62c-agy-funcui2.jsonl`,
`a62c-agy-grayskull.jsonl`, `a62c-agy-grayskull2.jsonl`). **Never promote a row
here without one.**

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
untested until someone does. prime-agent is not installed on this machine
(checked 2026-09-24: no `prime-agent` on `PATH`, no pip package), so it stays
deferred.

Nothing in `install.sh` / `install.ps1` writes a user-level always-on line; they
install skills and the shared docs only.

## Commands - what is verified

`/pending`, `/list-tickets` (F54), `/engage` (F58), `/archive-tickets` (F59), `/sync-tickets` (F63), `/skillator-update` (F65), `/team-messages` (F66), `/pending-subagent` (F71), `/verify-subagent` (F72), `/marathon-plan` and `/marathon-run` (F73) are written by the installers at user level
only, rewritten every run; per-host shapes are in the session design's D7 table.
Evidence tags: **verified** = read from the host's docs/binary or exercised here;
**inferred** = from docs only, until the owner's picker check
(`practice/baselines/green-commands-f54.txt`, probed by
`practice/scripts/probe-commands.sh`).

`/team-messages` (F66, `teams-uhura`) lists the Teams inbox's unread messages, framed as
data, marks them read and offers a reply on the owner's word (`team.mjs say`). Claude
Code also gets them at the next turn from the plugin's own `hooks/hooks.json`
(`UserPromptSubmit`, `node .../team-hook.mjs`: silent with no inbox); the other hosts
have no plugin hook here, so they read them on the ops board's 4 Messages tab and with
`/team-messages`.

`/pending-subagent [N|max] [IDs]` (F71, `relay-morpheus` with `tickets-zordon` and
`tasks-sentinels`) works the open tickets, or the IDs given, as one relay run: a stage
and its exact prompt in the run file before each dispatch, one fresh implementer per
ticket, each diff reviewed and landed by the main session, then the run merged, the
version bumped and the push asked. The count defaults to 1 (serial); N or `max` runs
file-disjoint tickets at once in their own stage worktrees (`chain next --all`,
`chain merge`). A host with no subagent tool runs the stored prompts itself, one at a time.

`/verify-subagent` (F72, `tickets-zordon`) re-checks every `[%]` ticket (or the IDs
given) with one fresh read-and-run-only agent each: PASS flips it to `[x]` with a
dated **Verified** note (`ticket-meta verify <ID> pass`), FAIL leaves it `[%]` with what
failed appended (`verify <ID> fail`), OWNER (the Done line needs the owner's own eyes)
is never flipped. A host with no subagents runs the checks itself, one at a time.

`/marathon-run [sequential|parallel] [N|max] [IDs]` (F112) plans and runs a marathon in one go,
`/marathon-plan` with the same words saves the plan and `/marathon-run [RUN id]` runs a saved one
(F73, `relay-morpheus`): the plan is a run file plus a Workflow script beside it
(`run-<0000>-<slug>.workflow.js`, from relay-morpheus `templates/marathon-workflow.js`:
one implementer and one verifier per ticket, phases serial where tickets share files,
one ticket per phase under sequential (the default), at most N under parallel N - PLAN.mode),
shown with its agent count and no agent run; `/marathon-run` runs it one phase per
Workflow call, every stage `chain dispatch`ed first, then landing and the end batch.
Every other host writes the same plan and `/marathon-run` reads it as data, running each
stage with that host's delegate or in-session (relay-morpheus marathon.md § Run without
the Workflow tool). Each tag below turns **verified** only with a recorded run
(`practice/baselines/README.md`):

| Host | `/marathon-run` runs the agents with | Tag |
|---|---|---|
| cursor | marathon: the Task tool, one Task per agent (command text written, Task-tool run not exercised) | inferred |
| antigravity | marathon: background subagents | inferred |
| codex | marathon: subagents (the antigravity text, installed as a skill) | inferred |
| muse | marathon: child agents; no command (`commands: []`) - "plan a marathon" loads relay-morpheus | inferred |
| pi | marathon: the subagent extension when installed, else in-session | inferred |
| opencode | marathon: in-session, phases in order (no delegate verified) | inferred |
| gemini | marathon: in-session, phases in order (no delegate verified) | inferred |

`/skillator-update` (F65) finds its source in this order: a clone path given as its
argument; Claude Code's updated plugin (`installPath` of `skillator@<mkt>` in
`claude plugin list --json` - the package ships `install.sh` / `install.ps1`); the
**source pointer** every install run writes into each skills dest,
`<dest>/.skillator-source` (one line, LF, no BOM: the plugin folder the installer ran
from - `<clone>/plugin` since F91; an older pointer names the clone root, whose
forwarding `install.sh` / `install.ps1` still run it); else it asks, and headless it stops with `source: none found`. A git source is
updated with `git pull --ff-only` only.

| Host | Path | Tag |
|---|---|---|
| claude-code | the ops-board mod's `/pending`, `/list-tickets`; the plugin's `commands/engage.md`, `commands/archive-tickets.md`, `commands/sync-tickets.md`, `commands/skillator-update.md`, `commands/team-messages.md`, `commands/pending-subagent.md`, `commands/verify-subagent.md`, `commands/marathon-plan.md`, `commands/marathon-run.md` (installer writes none) | verified |
| gemini CLI | `~/.gemini/commands/<n>.toml`, `!{...}` shell injection, `{{args}}` | verified (dir, `!{`, `{{args}}`) |
| antigravity | skills, `/<n>` in `agy`; all three dests `~/.gemini/config/skills/`, `~/.gemini/skills/` and `~/.gemini/antigravity-cli/skills/` (agy 1.4.5's global dir, B8) | verified (a skill is a slash command) |
| pi | `~/.pi/agent/prompts/<n>.md`, `$ARGUMENTS` | verified |
| pi `/ops` (F56) | the ops board as a pi extension: `~/.pi/agent/extensions/skillator-ops.ts` re-exports `~/.pi/agent/skills/ops-board/pi/index.ts`; full-screen overlay, Tickets / Runs / Health, assign / decide, the standalone app's keys; `/ops --once` notifies one frame | historical RPC discovery/one-frame probe; later scripted ConPTY overlay evidence and remaining visual limits are in the capability ledger |
| Antigravity IDE ops board (F57) | the ops board as an extension of the Antigravity IDE (the VS Code fork, `antigravity-ide`; not `agy`): `ops-board/antigravity/pack.mjs` writes a VSIX whose entry requires `~/.gemini/config/skills/ops-board/antigravity/extension.cjs`, installed with `antigravity-ide --install-extension <vsix> --force` (a folder dropped beside `~/.antigravity-ide/extensions/extensions.json` is ignored); command "skillator: Ops board" opens a webview panel - Tickets / Runs / Health, assign / decide, the standalone app's keys; "skillator: Ops board - one frame" writes one frame to the "skillator ops" output channel | verified headless (Antigravity IDE 1.107.0, Electron 39 / node 22.21: `--extensionTestsPath` run activates `skillator.skillator-ops`, both commands listed, the one-frame command draws, the panel opens); the live panel is the owner's check |
| codex | a skill (F90): `$CODEX_HOME/skills/<n>/SKILL.md`, written from `host-commands/antigravity/<n>/SKILL.md` (name + description frontmatter, `{{SKILLS}}` filled with that dest) → `$<n>` in the prompt, or pick it in `/skills`; the installer removes the `$CODEX_HOME/prompts/<n>.md` an older run wrote (those names only) | inferred (docs) until the owner runs one as a skill |
| codex `$ops` (F105) | the ops board from Codex (and `/ops` in agy, same template): `host-commands/antigravity/ops/SKILL.md`, written to the codex and antigravity dests only (pi and Claude Code have their own `/ops`; none for cursor, gemini CLI, opencode); runs `ops --open`, else that dest's `ops-board/ops/ops.ps1 -Repo <repo root> -Open` / `ops.sh <repo root> --open`, never a bare console window | inferred until a real Codex run opens the board |
| cursor | user `~/.cursor/commands/<n>.md` | historical project/user expansion recorded in the capability ledger; picker unverified |
| muse (F68) | none: `.muse-plugin/plugin.json` lists `commands: []` (the command schema is unprobed - superpowers ships none either); the skill route stays | inferred |
| opencode (F67) | `~/.config/opencode/commands/<n>.md` (`$XDG_CONFIG_HOME/opencode/commands/` when that is set) → `/<n>`; markdown, frontmatter `description` (also `agent`, `model`, `subtask`), body = the template, `$ARGUMENTS` / `$1`… for arguments | verified (opencode 1.19.4: `opencode debug config` lists a command from `<config>/commands/` and from `.opencode/command/` + `.opencode/commands/`, `$ARGUMENTS` kept in the template; the binary globs `{command,commands}/**/*.md` in every config dir); the TUI picker is the owner's check |
| prime-agent | none; the skill route stays | verified (no loader) |

**cursor** — Cursor's CLI is `cursor-agent` (`agent.exe` beside it). A bare `agent`
on `PATH` can be a different tool (on the author's machine it is Grok's), so the
probe and every headless check use `cursor-agent`, never `agent`:
`cursor-agent -p "/pending" --mode ask`.

## Host notes

**cursor** — skills are auto-discovered from those four directories (nested repo
dirs included, scoped to that dir), matched on `description`, and `name` **must
match the folder name**. There's no `Skill` tool, so to chain a skill on purpose,
read its `SKILL.md` yourself — don't delegate skill *interpretation* to a
subagent. Model slug not in the Task tool's allowed list → closest tier, record
the substitution. On Windows the Git-Bash `cursor-agent` shim prints Node's
version and help instead of running the agent; call `cursor-agent.cmd` /
`agent.exe` (`remote-cerebro`'s `doctor` flags the shim).

**codex** — skills live in `$CODEX_HOME/skills/` (the installer's target; 0.155.1
also reads `~/.agents/skills/`, with no dedupe) and load when the task matches;
`AGENTS.md` (`~/.codex/AGENTS.md`, repo root, or a subdir) is the always-on
layer. Subagents went GA in March 2026: up to 8 in parallel, each with its own
context window and sandbox — so tiered phases here are real delegation, not a
sequential fallback.

**F139 isolation harness (offline evidence).**
[`practice/scripts/codex-isolation.mjs`](practice/scripts/codex-isolation.mjs)
runs the copied PowerShell installer in a disposable Codex profile and checks
generated commands and installed quota hooks. `--live` queries the selected
executable's help/version/schema before a bounded read-only app-server session;
it has not been run in RUN-0027. Native inventory validates source paths, explicit
skill injection plus fixture-only tokens/text verifies loading, and native hook
inventory reports discovery/trust separately from execution. These protocol
paths are tested with offline stubs; no authentication or trust settings are
changed. F90/F105/A149 owner checks
remain outstanding. See [fixture provenance and limits](practice/baselines/README.md#isolated-codex-integration-f139).

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

**Historical binary inspection, not live execution or current installation
inventory.** These builds differed; cite the one actually exercised:

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
per-repo file needs a trusted project. Both need hook trust. The historical probe bypassed that gate; it did not
verify the normal interactive trust onboarding path.
Untrusted hooks are skipped silently. Stdin carries `stop_hook_active` and
`last_assistant_message`. **Exit 2 + stderr does not continue the turn**
(reported `Stop Failed`). **stdout `{"decision":"block","reason":…}` does:** the
reason re-enters as a `<hook_prompt>` and the model runs again with
`stop_hook_active:true`. The 0.153.2 failure is superseded. Keep `check` for
cursor and antigravity.

**A83, 2026-09-24, `codex-cli 0.156.1`, `codex exec`: the usage gate works.**
`watch-cortana`'s `usage-watch.ps1 -Mode gate` as the `Stop` handler read the
real rollout named by stdin `transcript_path` (19% = weekly `used_percent`;
context 18907/258400 = 7.3%), stayed silent at 92%, and at a forced 5% emitted
`decision:block`; codex ran a second turn on the reason and its `Stop` came
with `stop_hook_active:true`, where the gate exits clean. Record:
`practice/baselines/green-codex-stop-gate.txt`.

**antigravity** — skills become slash commands automatically; `/skills` lists
what it can see. Frontmatter beyond `name`/`description` is dropped, so any
model tiering must be stated in the body (it is). Background subagents cover the
delegate rows; `/model` covers the tier rows.

**pi** — skills are `.pi/skills/<name>/SKILL.md` and are read on demand, which
models don't always do: force it with `/skill:<name>`. Delegation isn't native;
without a subagent extension, run tiered phases **sequentially in one session**,
switching `/model` between phases, and write each phase's output to disk before
switching. That file-on-disk step is what makes the tiering safe here.

**muse** (F68) — a native plugin, not an installer dest: `.muse-plugin/plugin.json` (schemaVersion 1)
lists every `skills/*/SKILL.md` by its frontmatter `name`, and `.muse-plugin/marketplace.json`
lists the plugin; both carry the `.claude-plugin/plugin.json` version.
`practice/scripts/check-muse-manifest.sh` fails on a skill left out, a path gone, an id that is
not the skill's `name` or a version out of step, and `install.sh --selftest` runs it - so a
new skill or a release bump touches `.muse-plugin/` too. Install from the marketplace (B11, from
4.17.x): `muse plugins marketplace add skillator https://github.com/bodish-coder/skillator`, then
`muse plugins install skillator@skillator`. Muse probes `.claude-plugin/marketplace.json` but
never `.muse-plugin/marketplace.json`, so it reads the Claude catalog; since F91 its entry is
`./plugin`, so no second clone (before F91 the entry was a github source, which Muse cloned into a
`\\?\` path git refuses on Windows - B10). Update: `muse plugins marketplace update skillator`
(a fresh snapshot in a new `generations/<n>` dir), then `muse plugins remove skillator` +
`muse plugins install skillator@skillator` - the installed record keeps the old snapshot's path,
so a plain `muse plugins update skillator` reports `updated` and changes nothing, and `install`
alone refuses ("already installed from a different source"). Verified (Muse Code 1.4.13,
2026-10-26, scratch profile, a bare clone of this branch added as `file:///C:/t/b11.git`): add
`plugins=1`, install 4.17.0 `active=true` with 29 skills, a new commit reached the cache only by
marketplace update + remove + install. Or install from a clone:
`git clone https://github.com/bodish-coder/skillator <dir>`, then `muse plugins install <dir>/plugin`
(F91: the plugin is the `plugin/` folder; it copies that folder into Muse's cache; skills are
enabled by default, so `muse plugins approve` has no runtime capability to act on); update:
`git -C <dir> pull`, then `muse plugins update skillator` (refreshes from that local source;
`/skillator-update` step 4 does both, and moves an install of `<dir>` made before F91 to
`<dir>/plugin` with `muse plugins remove skillator` + `muse plugins install` - a plain
`update` fails there with `missing-manifest`, and `install` alone with "already installed from a
different source"). Muse also warns that it skips ops-board - expected: its
`hooks/hooks.json` is a Claude Code mod, which Muse cannot run.
Verified (Muse Code 1.4.12, 2026-10-24): `muse plugins validate <repo>` - valid, summary
`full`; `muse plugins install` with a scratch USERPROFILE/XDG_DATA_HOME - `skills=28
active=true`, `approve` returns no runtime capabilities; both print one warning that `.claude-plugin/plugin.json` is ignored. Tiers, delegation, usage %
and the ops board are unprobed: run the printed `ops` launch line beside it.
Delegate work: child agents: muse --help 1.4.13 lists --subagent-worktree-isolation; the
in-session name of the tool is unprobed (the ticket's "rlm" child agents are prime-agent's, not muse's).

**opencode** (F67) — not a column of the table above yet: its tiers, delegation,
hooks and usage % are unprobed. What is verified (opencode 1.19.4, 2026-10-24,
`opencode debug paths` / `debug skill` / `debug config`, no model call): the config
dir is `$XDG_CONFIG_HOME/opencode` when that is set, else `<home>/.config/opencode`,
and on Windows `<home>` is `%USERPROFILE%` (a changed `HOME` is ignored). Global
skills load from `<config>/skills/<n>/SKILL.md` (also `skill/`), and from
`~/.claude/skills/` and `~/.agents/skills/` (those two stayed on the real profile
when `USERPROFILE` was moved to a scratch dir, while `<config>` followed it); project skills from `.opencode/skills/`,
`.claude/skills/` and `.agents/skills/`, walking up to the git worktree root. A
skill's `name` must match its folder. The installers write the skills to
`<config>/skills/` and the seven commands to `<config>/commands/<n>.md`
(`host-commands/opencode/`, the pi texts without `argument-hint`). opencode also
reads `~/.claude/skills`, so where `install.sh` / `install.ps1` fill that dir
(Claude Code with no plugin) opencode finds each skill twice (how it settles a
duplicate name is unprobed). No ops board inside
opencode: run the printed `ops` launch line.

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
