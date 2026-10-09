# code-yoda review — what a diff can lose

The over-engineering pass over a staged or proposed diff. It hunts complexity
only; the diff's best outcome is getting shorter.

This file is an **output-format recipe**. The baseline
(`practice/baselines/scenario-code-yoda-review.txt`) found that an unaided run
already names the cuts with concrete replacements; what the default does not
produce is this shape — one line per finding, a tag, the replacement, and the
net. The recipe fixes the shape.

## The target

What the user names: staged or uncommitted changes, a branch, a PR, files.
Nothing named → the uncommitted changes, else the last commit. Read the diff,
then the code it touches — the callers of every changed function — because
`yagni:` and `delete:` are claims about callers, not about the diff.

## The report

One line per finding, numbered, in diff order — so the user can say "cut 2
and 5":

```
<n>. L<line>: <tag> <what>. <replacement>.
<n>. <file>:L<line>: <tag> <what>. <replacement>.      (multi-file diffs)
```

Tags, and what the replacement slot holds for each:

| Tag | Finding | Replacement |
|---|---|---|
| `delete:` | dead code, unused flexibility, a speculative feature | nothing — say so |
| `reuse:` | a thing the repo already has — a helper, a component, a pattern | the existing one, by path |
| `stdlib:` | a hand-rolled thing the standard library ships | the function, by name |
| `native:` | a dependency or code doing what the platform already does — not a house component the codebase already uses (core rung 2) | the platform feature, by name |
| `yagni:` | an abstraction with one implementation, config nobody sets, a layer with one caller | the inlined form |
| `merge:` | near-copies that must change together | the one copy kept |
| `shrink:` | the same logic in fewer lines | the shorter form, shown |

Last line, always: `net: -<N> lines possible.` Nothing to cut: `Lean already.
Ship.` and stop.

## Before a line is written

- `delete:` and `reuse:` only after grepping the whole tree — tests, fixtures,
  config, string and dynamic references included. "Unused" is a grep result,
  not an impression.
- A `shortcut:` (or older `ponytail:`) marker that names its ceiling is a
  decision, not a finding — unless the load the repo already expects crosses
  that ceiling; then the line quotes the marker.

## Written like this

```
1. L12-38: stdlib: 27-line validator class. "@" in email, 1 line; real validation is the confirmation mail.
2. L4: native: moment.js imported for one format call. Intl.DateTimeFormat, 0 deps.
3. repo.py:L88: yagni: AbstractRepository with one implementation. Inline it until a second exists.
4. L52-71: delete: retry wrapper around an idempotent local call. Nothing replaces it.
5. L30-44: shrink: manual loop builds a dict. dict(zip(keys, values)), 1 line.
6. L90-104: reuse: a second slugify. utils/text.py:slugify, 0 new lines.
net: -75 lines possible.
```

Not like this: "This EmailValidator class might be more complex than necessary;
have you considered whether all these rules are needed at this stage?" A line
with no replacement is a hedge, not a finding.

## Scope

- Complexity only. A correctness bug, a security hole, a performance problem
  found on the way is **one line before the report**, routed to
  `code-review:code-review`, and does not appear among the findings. Mixing the
  two ranks a bug beside a style cut, and the reader fixes neither properly.
- The one runnable check SKILL.md §6 requires — a smoke test, an `assert`-based
  self-check — is the floor, not bloat. Never tagged.
- Lists; applies nothing. The user cuts.
- Yoda's voice is for the suggestion line only; the report is plain.
