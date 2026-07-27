---
name: skillator-brainstorm-build-mid
description: >-
  Mid-tier two-model feature build — Fable (claude-fable-5) brainstorms and
  designs, then Opus (claude-opus-4-8) implements, fully autonomously with no stop
  in between. No complexity-tiered routing, no /compact, no session record, no
  /clear — just design → build. Use when the user wants a "brainstorm with Fable,
  build with Opus" pass on a small/medium feature. For the full flow (adds Sonnet
  for simple tasks, a planned /compact, a session .md record, rework, then /clear)
  use skillator-brainstorm-build-prime; for a Fable-free pass (Opus designs + Sonnet
  does simple tasks) use skillator-brainstorm-build-lite. NOT for tiny one-line
  edits, or pure design/no-build work.
---

# Brainstorm (Fable) → Build (Opus)

Two models, each on its strength: **Fable** is the creative/ideation model, so it
does the brainstorming and design; **Opus** is the strongest coding model, so it
does the implementation. A skill can't change the *main* session's model, so this
works by dispatching **subagents** with explicit model overrides — that guarantees
the split no matter what model the user's session is on.

You (the main session) are the **orchestrator only**: you spawn the two agents,
pass the design between them, and relay the result. You do not brainstorm or write
the implementation yourself.

## Flow (autonomous — no stop between phases)

### Phase 1 — Fable brainstorms & designs

Dispatch one subagent with `model: "fable"`. Give it the user's task verbatim plus
enough repo context to be concrete (paths, stack, relevant files you've seen). Ask
it to **diverge then commit**: explore a few approaches, weigh tradeoffs, pick one,
and return an *implementation-ready* design — not prose musing.

Require it to return, as structured text:

```
APPROACHES:   <2-3 candidate approaches, one line each, with the tradeoff>
CHOSEN:       <which one, and why it wins>
DESIGN:
  - Files to create/edit: <path → what changes>
  - Data model / contracts: <entities, function/endpoint signatures, inputs→outputs>
  - Edge cases & error handling: <the ones that matter>
  - Out of scope: <what NOT to build>
VERIFICATION: <the concrete check that proves it works end to end>
```

Use the `Agent` tool with `subagent_type: "general-purpose"`, `model: "fable"`.

### Phase 2 — Opus implements

Dispatch one subagent with `model: "opus"`. Feed it **the original task + Fable's
full design verbatim**. Tell it to build exactly that design, run the verification
step Fable named, and return a summary of what changed (files, and the verification
result — pass/fail with evidence, not a claim).

Use the `Agent` tool with `subagent_type: "general-purpose"`, `model: "opus"`.

If Fable's design has a genuine blocker (contradiction, missing decision only the
user can make), the Opus agent should stop and report it rather than guess — pass
that instruction through.

### Phase 3 — Relay

Subagent output is not shown to the user. Report back concisely:
1. The approach Fable chose (one or two lines).
2. What Opus built (files changed).
3. The verification result — did it actually work, with evidence.

## Rules

- **Both phases are subagents.** Do not do the design or the code in the main
  session — that would silently drop the model split the user asked for.
- **Pass the design verbatim** from Fable to Opus. Don't summarize it away; the
  contracts and edge cases are the point.
- **Autonomous means no confirmation gate**, but it does not mean no honesty: if a
  phase fails or a subagent returns nothing, say so plainly and stop — don't paper
  over it.
- **Scale to the task.** A small feature = one Fable agent, one Opus agent. Don't
  fan out unless the task genuinely has independent parts.
- If a subagent dies / returns null, report the failure rather than continuing on a
  missing design.
