<!--
Handoff template. Fill every section. Delete a section only if you can write
"N/A — <reason>" honestly; never delete to hide an unknown. Replace all
<angle-bracket> placeholders. Keep the status legend and evidence discipline.
-->

# Handoff — <topic> (<YYYY-MM-DD>)

> **Status legend:** ✅ DONE (verified in repo) · 🟡 IN-PROGRESS (partial/uncommitted) · 📝 CLAIMED (asserted in chat, unverified) · ⬜ NOT STARTED

## 1. TL;DR (read this first)
<2–4 sentences: where things stand right now and the single most important next
action. Someone should be able to stop after this paragraph and know what to do.>

## 2. Mission & scope
- **Goal (why):** <the objective in the user's terms>
- **In scope:** <what this work covers>
- **Out of scope / deferred:** <explicitly excluded, so nobody expands silently>
- **Scope changes this session:** <anything that shifted, and the final decision>

## 3. Current state — what's done vs. not
> One row per work item. Evidence = commit hash, `path:line`, test name, or
> "asserted in chat, unverified". No item may be ✅ without repo evidence.

| Item | Status | Evidence | Notes |
|------|--------|----------|-------|
| <item> | ✅/🟡/📝/⬜ | <commit / path / test> | <caveats> |

## 4. Decisions & rationale (do not re-litigate)
> The most perishable, highest-value content. For each: what was chosen, what was
> rejected, and WHY. This is what keeps the next worker on the same thread.

- **<Decision>:** chose <X> over <Y> because <reason>. <Implication.>
- **Rejected / dead ends:** <approaches tried and abandoned, so they aren't retried.>

## 5. Constraints, gotchas & "do not re-fix" traps
> Environment quirks, offline/air-gap limits, credentials, flaky steps, and things
> that LOOK broken but are intentional. Check CLAUDE.md and repo docs.

- <constraint / gotcha and how to work with it>

## 6. Key files & where to look
> A map so the next worker doesn't have to rediscover the layout.

- `<path>` — <what it is / why it matters>
- Relevant docs/specs/plans: `<path>`

## 7. How to resume (first 5 minutes)
1. **Orient:** `<commands to run — branch, status, tests>`
2. **Next action:** <the concrete first task>
3. **Then:** <2nd / 3rd steps>

## 8. Open questions & risks
- **Awaiting user decision:** <question — why it blocks / what it affects>
- **Unknowns:** <UNKNOWN — needs checking: ...>
- **Risks:** <what could go wrong, known fragility>

## 9. Provenance (verify before trusting this doc)
- **Repo / branch:** <repo> · `<branch>`
- **Last commit:** `<hash> <subject>`
- **Working tree:** <clean | dirty — list uncommitted paths>
- **PR / remote state:** <open PR #, or "pushed, no PR", or "local only">
- **Tests at handoff time:** <passing / failing / not run — with the command>
- **Handoff written by:** <session/model> on <date>
