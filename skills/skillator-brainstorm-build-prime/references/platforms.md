# Platform adapters — brainstorm-build-prime

This file maps the skill's **role tiers** to each host's tools and models.
The main session reads this once at start (Step 0) and follows the row for
the detected platform.

## Role tiers (platform-agnostic)

| Tier | Job | Must not |
|------|-----|----------|
| **design** | Creative design thinking — approaches, tradeoffs, contracts, task breakdown | Write production code or edit the repo |
| **build** | Implement exactly the design — strongest coder available | Redesign or expand scope beyond the design file |
| **orchestrator** | Main session — spawn agents, write session file, run handoff, run context checkpoints | Design or code directly (except tiny orchestration edits to the session record) |

Use **different models** for design vs build when the platform allows it. Same
model for both only as fallback (say so in the session record).

---

## Detect platform

| Signal | Platform |
|--------|----------|
| `Skill` tool available; `/compact` and `/clear` invocable by the orchestrator | **claude-code** |
| `Task` tool with `subagent_type` + `model` slug list in tool description | **cursor** |
| `commentary` / `final` channels; skills read via filesystem or `skills.read`; auto context compaction | **codex** |

If ambiguous, ask once. User may override with `platform: cursor` etc.

---

## claude-code

| Role | Dispatch | Model override |
|------|----------|----------------|
| design | Agent tool, `subagent_type: "general-purpose"` | `"fable"` |
| build | Agent tool, `subagent_type: "general-purpose"` | `"opus"` |

**Load another skill:** Skill tool (e.g. `skillator-handoff`).

**Context checkpoints (automatic — orchestrator runs after handoff):**

| Checkpoint | Action |
|------------|--------|
| A (after design on disk) | Invoke `/compact`, then continue from the session file |
| B (after green build + record) | Invoke `/clear` |

Run handoff **before** each checkpoint. If `/compact` or `/clear` is blocked or
unavailable, say so and ask the user once — do not skip the handoff.

**Parallel builds:** git worktree when tasks would touch the same tree.

---

## cursor

| Role | Dispatch | Model slug |
|------|----------|------------|
| design | Task tool, `subagent_type: "generalPurpose"` | `gpt-5.6-sol-medium` — creative divergence, separate from build model |
| build | Task tool, `subagent_type: "generalPurpose"` | `claude-opus-5-thinking-high` — strongest coder in the allowed list |

**Model fallback:** If a slug is unavailable, use the closest tier from the Task
tool's allowed list and note the substitution in the session file. Do not guess
slugs outside that list.

**Load another skill:** Read the skill's `SKILL.md` from disk (personal:
`~/.cursor/skills/<name>/SKILL.md`, project: `.cursor/skills/<name>/SKILL.md`,
or installed skillator path) and follow it. Do not use a Skill tool — it does
not exist here.

**Context checkpoints (manual — no `/compact` or `/clear`):**

| Checkpoint | User action |
|------------|-------------|
| A (after design on disk) | Start a **fresh composer/agent turn** with only the session file + handoff as context, *or* use Cursor's context summarization if the user prefers staying in-thread. Prompt explicitly: "Design is in `<path>`. Please compact/summarize context or open a new chat, then say continue." |
| B (after green build + record) | **New chat** (or new agent session). Session `.md` + handoff are the durable memory. |

**Parallel builds:** Task tool in parallel; git worktree when tasks would touch the same tree.

---

## codex

| Role | Dispatch | Model + notes |
|------|----------|---------------|
| design | Subagent the platform provides for delegated work (when available); otherwise a focused design pass in the main session **before** any repo edits, then write the session file immediately | `gpt-5.6-sol` with `reasoning_effort: high` (or `xhigh` for hard design problems). Prompt: design thinking only — no `apply_patch`, no implementation. |
| build | Same subagent/delegation mechanism when available | `gpt-5.6-sol` — frontier coding model |

**Design/build split on Codex:** There is no Fable equivalent. Prefer **reasoning
effort + prompt discipline** for design (explore approaches, write the session
file), then **implementation** for build. If multi-agent spawn is available, still
use separate agents with the design-only vs build-only prompts above.

**Load another skill:** Read `SKILL.md` from the skill path listed in the session's
Available skills catalog (expand short aliases per catalog rules). Main agent reads
skill instructions itself — do not delegate skill interpretation to a subagent.

**Context checkpoints:**

| Checkpoint | Behavior |
|------------|----------|
| A (after design on disk) | **Optional pause.** Codex auto-compacts; still run `skillator-handoff` and tell the user the design path. Continue from the session file — do not rely on chat history after compaction. |
| B (after green build + record) | Prompt user to start a **new thread** when they want a clean slate. Session `.md` + handoff remain on disk. |

**Parallel builds:** parallel tool use / subagents when the platform supports it.

---

## User overrides

If the user names models or a platform in the request, those win over the
defaults above. Record overrides in the session file header:

```
PLATFORM: cursor
DESIGN_MODEL: gpt-5.6-sol-medium
BUILD_MODEL: claude-opus-5-thinking-high
```

---

## Quick reference — equivalent models (approximate)

| Role | claude-code | cursor | codex |
|------|-------------|--------|-------|
| Creative design | Fable | GPT-5.6-Sol (medium reasoning) | GPT-5.6-Sol (high reasoning, design-only prompt) |
| Strong build | Opus | Claude Opus 5 (thinking-high) | GPT-5.6-Sol |
| Handoff skill | Skill tool → skillator-handoff | Read skillator-handoff SKILL.md | Read skillator-handoff SKILL.md |
| Session survives context loss | auto `/compact` + file | New turn + file | Auto-compact + file |
