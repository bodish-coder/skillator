---
name: queue-jarvis
description: Rank the work queue or prioritize matching tickets in bulk by app, source, owner, type, status, severity, release, or dependency.
argument-hint: "[list filters | preview P1–P5 filters]"
---

# Queue Jarvis

Run `node "<this skill directory>/scripts/queue.mjs"` from the user's repository. Use the script to resolve and update the main checkout's `TICKETS.md`.

- `list [filters...]` shows what to work on next. P1 is highest, then P2 through P5, then tickets without a priority. Ties follow board order. With no arguments, use `list`.
- `preview <P1|P2|P3|P4|P5> <filter>...` shows all matching IDs and their current and proposed priorities. Do this first for any assignment, including for plain-language requests.
- After the user explicitly approves that preview, run `apply <preview-token> <priority> <same filters...>`. If the board has changed, show a fresh preview and ask again. Report the changes and keep them local unless the user separately requests a commit.
- `auto-preview [filters...]` proposes priorities for matching open tickets without a priority tag. Explicit severity maps critical, high, medium, low, and trivial to P1 through P5 respectively. With no recognized severity, verified tickets get P5, bugs get P2, features and other in-progress tickets get P3, and remaining tickets get P4. After approval, run `auto-apply <preview-token> <same filters...>`.

Combine exact, case-insensitive `field=value` filters with AND. Quote a filter if its value contains spaces. The default is open tickets. Use `status=` to select a different status explicitly.

| Filter | Example |
|---|---|
| `id` | `id=F42` targets one ticket in any status |
| `app`, `src`, `owner` | `app=installer src=tester owner=@sher` |
| `type` | `type=bug`, `type=feature`, `type=agent-found` |
| `status` | `status=pending`, `status=in-progress`, `status=testing`, `status=verified`, `status=blocked`, `status=decide`, `status=deferred`, `status=done`, `status=cancelled` |
| `severity`, `release` | `severity=critical release=next` read explicit `[severity:]` and `[release:]` tags |
| `depends-on` | `depends-on=F42` matches tickets with F42 in their `[depends-on:]` tag |

Example: `preview P1 app=installer src=tester type=bug`. The dependency filter matches tickets explicitly tagged as depending on the supplied ticket.
