# Platform adapters — brainstorm-build-prime

Generic mechanics (host detection, skill paths, delegation, tier switching,
frontmatter portability) live in **`PLATFORMS.md` at the repo/plugin root**
(`../../../PLATFORMS.md` from this file). Read that first. This file adds only
what's specific to *this* skill: which model plays which tier, and what the two
context checkpoints mean on each host.

## Role tiers

| Tier | Job | Must not |
|------|-----|----------|
| **design** | Creative design thinking — approaches, tradeoffs, contracts, task breakdown | Write production code or edit the repo |
| **build** | Implement exactly the design — strongest coder available | Redesign or expand scope beyond the design file |
| **orchestrator** | Main session — dispatch, write the session file, run handoff and checkpoints | Design or code directly (bar tiny edits to the session record) |

Different models for design vs build wherever the host allows it. Same model for
both is a fallback — record it in the session file.

## Model picks per host

| Host | design | build |
|------|--------|-------|
| **claude-code** | Agent tool, `model: "fable"` | Agent tool, `model: "opus"` |
| **cursor** | Task tool, `gpt-5.6-sol-medium` | Task tool, `claude-opus-5-thinking-high` |
| **codex** | subagent with a design-only prompt (no `apply_patch`), `gpt-5.6-sol` at `reasoning_effort: high` — `xhigh` for hard problems | subagent(s), `gpt-5.6-sol`; up to 8 in parallel |
| **antigravity** | `/model` → Gemini 3.1 Pro (or Claude Opus if on plan), design-only prompt; background subagent if delegating | `/model` → strongest coder on plan (Claude Opus / Gemini 3.1 Pro) |
| **pi** | `/model` → strongest reasoning provider configured, design-only prompt | `/model` → strongest coding provider configured |
| **prime-agent** | `rlm(...)` child agent with a design-only prompt | `rlm(...)` child agent, or the main session after the design file exists |

Slug unavailable → nearest tier from the host's allowed list, substitution noted
in the session file. Never invent slugs.

**Where there's no delegation mechanism** (pi without a subagent extension, or
antigravity if `/agents` is unavailable): run the design
pass **in the main session with a design-only prompt and no repo edits**, write
the design file, switch model, then build from that file. The file — not chat
history — is what carries the design across the switch. Same discipline, one
session.

## Checkpoint A — shedding context

Runs **after** `handoff` has written a verified handoff to disk. Never shed
context without it.

A skill cannot invoke a slash command, so Checkpoint A is never `/compact`. It is
always the same move: **carry the design forward as a file path, not as chat
history**, and let each subagent hold its own context. The host table below only
says what else is available if the orchestrator's context is genuinely tight.

| Host | If context is tight |
|------|---------------------|
| **claude-code** | auto-compaction handles it; tell the user once they may type `/compact`, continue from the session file |
| **cursor** | offer a fresh composer turn seeded with session file + handoff (or in-thread summarization if the user prefers) |
| **codex** | nothing to do — auto-compaction handles it; continue from the session file, not chat history |
| **antigravity** | continue from the session file; suggest a new session if context is heavy |
| **pi** | offer a new session seeded with the session file + handoff |
| **prime-agent** | `/refine`, then continue from the session file; daemon session can be resumed with `prime-agent --resume <id>` |

**There is no Checkpoint B.** Do not clear, reset, or start a new session at the
end of a run — a skill can't, and the session `.md` + handoff already make a
fresh start lossless whenever the *user* wants one.

## Parallel builds

Delegate in parallel where the host supports it (Agent/Task tools, antigravity
background subagents, `rlm(...)`). Use a **git worktree** whenever parallel tasks
would touch the same tree — on every host, including `prime-agent`, which is
explicitly *not* a sandbox.

## User overrides

User-named platform or models win. Record in the session file header:

```
PLATFORM: pi
DESIGN_MODEL: <slug>
BUILD_MODEL: <slug>
```
