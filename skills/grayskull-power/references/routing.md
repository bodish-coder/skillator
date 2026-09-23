# Routing — the full tables

SKILL.md §2 carries the routing decisions needed on turn one, one short row
each. This file carries every row in full, the long tail, and the reasoning
behind the order. A skill added to the plugin gets its full row here first; §2
gains a name only if turn one needs it, and §2 stays under the ~800-word router
budget (`practice/scripts/context-audit.sh`).

Match the request, invoke that skill, follow it. One skill at a time — chaining
every skill "to be safe" is the failure this is meant to prevent.

## Process before implementation — but only where it adds something

`build-vision` / `build-ultron` / `build-jarvis` **are** the process for a build: it runs `PRACTICE.md` §§1-6
and adds tier routing, a session record and a rework loop on top. Chaining any of
the merged process skills in front of it re-runs the same work and burns the
budget the build needs.

**"Build X" → a `build-*` skill directly.** When the answer is a decision and
no code will be written, run PRACTICE §1 here in the session instead — classify,
ask one question at a time, present, stop.

The order still holds for the process that isn't inside a build: **"fix this
bug" → PRACTICE §7 first, then the code.** Root cause before any fix. Getting
that backwards is how a session produces confident wrong work.

## Practice — always in play

| When | Skill |
|---|---|
| Anything creative that ends in code | `build-vision` · `build-ultron` · `build-jarvis` — they run PRACTICE §§1-6 for you |
| A design/decision question with no build behind it | PRACTICE §1 — classify, question one at a time, present, stop |
| A bug with an unknown cause | **PRACTICE §7 first** — root cause before any fix, and the three-fix rule |
| A multi-step task with a spec already agreed, outside a build run | PRACTICE §2 — write the tasks in plan shape, then §3 self-review them |
| New logic worth trusting | PRACTICE §4 — test first |
| About to say "done" | PRACTICE §5 — fresh evidence or no claim |
| A diff worth a second pair of eyes | PRACTICE §6, via `code-review:code-review` (`/simplify` for quality-only) |
| Review findings landing on you | PRACTICE §6 — verify against this codebase before implementing |
| Auth, secrets, input handling, anything user-facing | `security-review` |
| Accessibility as the subject — an a11y/WCAG audit, "can't tab to it", "screen reader reads nothing", contrast failures, AT or CI wiring | `a11y-toph` (inside a design task it stays arwen's gate) |
| A terminal UI's rendering as the subject — a TUI/curses/Textual/Rich screen that must be proven to draw, "wrong in a narrow terminal", "the footer wraps", mojibake box characters, or no pty to drive it | `tui-tron` |
| The deliverable is itself a skill, or a skill isn't triggering | `skill-smith` |
| Branch lifecycle | PRACTICE §8 — isolation, then the finish menu |

## The loop — see it actually work

| When | Skill |
|---|---|
| About to change anything runnable — start it first so the user can watch | `live-friday` (armed by default) |
| "Does this run?" — launch the app and look | `run` |
| It launched and it is a TUI — now prove the frame fits the terminal | `tui-tron` (launch proves it starts, never that it draws) |
| Drive a real browser: click, fill, read console | `webapp-testing`, `browse` |
| Any chart, graph, dashboard — before the first line | `dataviz` |
| Anything Claude/Anthropic/LLM-shaped — models, pricing, tools, agents | `claude-api` **before** opening the file |

## Agent work

| When | Skill |
|---|---|
| Farming a task out to subagents | PRACTICE §4 — one task per agent, fresh context, review before the next dispatch |
| Writing a `Workflow` script (user opted in) | `workflow-authoring` **before** the script |
| "Have we hit this before?" — recall past sessions | `claude-mem:mem-search` |
| A codebase nobody here knows yet | `understand-anything:understand`, `claude-mem:learn-codebase` |
| Who calls this / what breaks if I change it | `codegraph` (`callers`, `impact`, `explore`) |
| A whole-repo knowledge graph, docs and code together | `graphify` |

**Tricky analysis and review go to Fable.** Anything where the answer is a
judgement rather than a lookup — root-cause analysis, a code or design review, an
architecture critique, a subtle-correctness or concurrency read, "why is this
actually happening" — is farmed to subagents on Fable:
`Agent({subagent_type: "claude", model: "fable", prompt: ...})`, one per angle,
in a single message so they run in parallel — on another host, its reasoning
tier per `references/hosts.md`. Tricky means: cause unknown, the reasoning spans
files, or being wrong is expensive. A grep, a file read, a one-file diff, a
mechanical sweep is not tricky — do it yourself; spawning an agent for it costs
more than the answer. You keep the verdict: read the reports, reconcile them, and
re-check anything an agent asserts without evidence.

## Skillator — our own

| The request is… | Skill |
|---|---|
| A bug, a feature, "log this", "what's pending", "mark done" | `tickets-zordon` |
| 4+ open tickets, a sweep, "ultracode", "work the board" | `tickets-zordon` (workflow mode) |
| "why is this broken", audit a whole app, unknown-cause rot, pre-release sweep | `audit-sherlock` |
| Build a real feature, design-then-implement | `build-vision` (ceremony, Fable design) · `build-ultron` (all-Opus, no ceremony) · `build-jarvis` (Sonnet offload) |
| Any UI/UX or front-end craft — build, redesign, improve, critique, native or web | `design-arwen` (never `frontend-design`); accessibility or a TUI's rendering as the subject → `a11y-toph` / `tui-tron` (Practice table) |
| A static/mock UI that needs to actually work | `designui-galadriel` |
| What a feature must do exists only in a conversation — a spoken brief, a chat thread, a ticket body, a handover — and the work outlives the session | `spec-watson` |
| "check screenshot", or verify a change in a running app visually | `screenshot-argus` |
| Ready to merge a branch | `mergeprep-oracle`, then `merge-smith` |
| Ship to a VPS / set up deployment | `deploy-merlin`, then `deploy-niyoj` |
| A staged run the session may not outlive — fan-out, long build, flaky link | `relay-morpheus` (the ledger; the build skill still does the building) |
| A plan whose tasks are written and now have to be built | `tasks-sentinels` — one task, one fresh agent, reviewed before the next |
| Session ending, context or usage running out | `handoff-cortana` |
| Starting from someone else's handoff doc | `resume-cortana` |

**Nothing matches?** Do the work directly. A one-line edit needs no skill, and
routing it through one is the opposite of the point. Skipping the *skill* is not
skipping the *ground rules* — "one line" describes the diff, never the thinking,
and `ground-rules.md` binds a one-line edit exactly as hard as a refactor. The
tempting one-liner someone senior already diagnosed for you is the specific case
those rules exist for.

## Related

`watch-cortana` fires the end-of-session sequence automatically at 92% usage;
that sequence is the same route this table's last two rows describe.
