# code-yoda review — what a diff can lose

The over-engineering pass over a staged or proposed diff. It hunts complexity
only; the diff's best outcome is getting shorter.

This file is an **output-format recipe**. The baseline
(`practice/baselines/scenario-code-yoda-review.txt`) found that an unaided run
already names the cuts with concrete replacements; what the default does not
produce is this shape — one line per finding, a tag, the replacement, and the
net. The recipe fixes the shape.

## The report

One line per finding, in diff order:

```
L<line>: <tag> <what>. <replacement>.
<file>:L<line>: <tag> <what>. <replacement>.      (multi-file diffs)
```

Tags, and what the replacement slot holds for each:

| Tag | Finding | Replacement |
|---|---|---|
| `delete:` | dead code, unused flexibility, a speculative feature | nothing — say so |
| `stdlib:` | a hand-rolled thing the standard library ships | the function, by name |
| `native:` | a dependency or code doing what the platform already does | the platform feature, by name |
| `yagni:` | an abstraction with one implementation, config nobody sets, a layer with one caller | the inlined form |
| `shrink:` | the same logic in fewer lines | the shorter form, shown |

Last line, always: `net: -<N> lines possible.` Nothing to cut: `Lean already.
Ship.` and stop.

## Written like this

```
L12-38: stdlib: 27-line validator class. "@" in email, 1 line; real validation is the confirmation mail.
L4: native: moment.js imported for one format call. Intl.DateTimeFormat, 0 deps.
repo.py:L88: yagni: AbstractRepository with one implementation. Inline it until a second exists.
L52-71: delete: retry wrapper around an idempotent local call. Nothing replaces it.
L30-44: shrink: manual loop builds a dict. dict(zip(keys, values)), 1 line.
net: -61 lines possible.
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
