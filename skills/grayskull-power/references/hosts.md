# Host adapters — what changes per host, and nothing else

`grayskull-power` is written against generic mechanics. This table is the only
translation layer it needs; the canonical, fuller mapping is `PLATFORMS.md`
(see SKILL.md §0 for where that file lives in each layout).

| SKILL.md says | Claude Code | Everywhere else |
|---|---|---|
| "invoke `<skill>`" | `Skill` tool | `/skill:<name>` or `/<name>` where it exists; otherwise read that skill's `SKILL.md` and follow it yourself — never hand skill *interpretation* to a subagent |
| "Fable subagents" | `Agent` + `model: "fable"` | the host's strongest **reasoning** tier: cursor `gpt-5.6-sol-medium` via `Task`, codex `gpt-5.6-sol` at `reasoning_effort: high`, antigravity/pi `/model` to the best reasoner. No delegation available → one analysis pass in-session, design-only prompt, and say so |
| `AskUserQuestion` | the tool | a numbered list of the same options — what it does · where it hurts · which is recommended |
| "keep artifacts local" | write the file, give the path | identical, and never publish |
| `ponytail` badge, `handoff-watch` hooks | statusline + `Stop` hook | no statusline → state the laziness level in text. No turn-end hook that can inject a usage number → run `usage-watch … check` yourself before each non-trivial step (cursor and antigravity do have turn-end hooks, per `PLATFORMS.md`; what they lack is a readable usage %). On cursor/antigravity `check` has no percentage to read: antigravity wires `handoff` to `PreCompress` in `~/.gemini/settings.json` — that is the real trigger, context is about to be lost (`handoff-watch` §Other hosts); cursor has nothing to wire, so run `handoff` manually when context gets tight |

`codegraph`, `TICKETS.md`, git and the ground rules are plain files and commands
— they work the same everywhere, no adapter needed.

## Why PRACTICE.md matters here

`PRACTICE.md` is skillator's process canon: the superpowers process skills
merged in, in skillator's own words. Classification, questioning, plan-grade
tasks, design self-review, test-first, fresh-evidence verification, requesting
and receiving review, debugging, branch lifecycle. The routing table in SKILL.md
points at its sections by number; **§7 and §5 are the ground rules in
`references/ground-rules.md`, written out**. Its `practice/` directory holds the
mechanics — subagent prompt templates, the controller task loop, TDD in full,
debugging techniques — loaded on demand, not up front.

Only the routing itself is grayskull-power's own.
