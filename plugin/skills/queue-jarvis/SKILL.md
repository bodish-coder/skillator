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

## Priority rules

Standing rules live in `<root>/.skillator/priority-rules.md`, one per line: `- P1: type=bug app=a,b,c`. Conditions in a rule are AND-ed, a comma means any of, rules are OR-ed, and a ticket matching several levels gets the highest. Rules match open tickets unless the rule names a `status`. Lines starting with `#` are comments. A ticket tag holding commas (`[release: 1.0, 1.1]`) matches a rule value equal to any of its parts.

The root is the main checkout by default, or the current worktree when `--current-worktree` is the first argument (`queue.mjs --current-worktree rules list`). The ops board Priorities tab always passes `--current-worktree`, so it edits the file of the checkout it displays; in a linked worktree, pass `--current-worktree` on every `rules` command too, to edit the same file the board shows.

- `rules list` shows the numbered rules, any invalid line, and the revision. Always pass that revision as `--rev <revision>` to `rules edit` and `rules remove`, so a change made meanwhile (by the board or by hand) is refused instead of overwritten.
- `rules add <P1–P5> <field=value[,value...]>...`, `rules edit <n> <P1–P5> <conditions...> --rev <revision>` and `rules remove <n> --rev <revision>` change one rule. For a plain-language request ("make bugs in apps a, b and c P1", "drop the severity rule"), run `rules list`, then the matching command, and report the rule as written. Editing the file by hand is equally valid; run `rules list` afterwards to check for invalid lines.
- `rules preview` shows every ticket the rules would change as `from -> to` with the rule number; it overrides an existing priority on a matching ticket. After the user explicitly approves that preview, run `rules apply <preview-token>`. If the board or the rules changed, show a fresh preview and ask again.
- The rule-set marker: `rules apply` writes `[priority-rule: N]` right after each `[priority: Pn]` it sets, N the winning rule's number at apply time. A priority with no marker counts as hand-set: `apply` (by hand) removes the marker, and `auto-apply` writes none. When the rules would lower a hand-set priority, `rules preview` adds one line, `Warning: 1 ticket goes down from a priority set by hand: F150 P1 -> P4 (rule 6).` - show it to the user before asking to apply. The ops board shows the marker as a `rule:N` chip on the ticket's row.
