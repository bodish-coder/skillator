# code-yoda audit — what a repo can lose

`review.md`, repo-wide: the whole tree instead of a diff, ranked biggest cut
first. One-shot; it applies nothing. Like the review, this is an output-format
recipe — the shape of the report, not a behaviour the baseline found missing.

## Where to look

Dependencies the stdlib or the platform already covers · single-implementation
interfaces · factories with one product · wrappers that only pass calls through
· two helpers doing the same thing · files exporting one thing · dead flags and
config · hand-rolled stdlib. Read the code, not the README's account of it
(`codegraph` for callers and dead exports). A big repo: go deep where a cut is
worth most, not file by file, and say which parts went unread.

## The report

Same seven tags as `review.md` (`delete:` `reuse:` `stdlib:` `native:` `yagni:`
`merge:` `shrink:`), one line per finding, numbered, **ranked by lines
removed**, path last. At most 20 findings; smaller ones left out → say how many.

```
<n>. <tag> <what to cut>. <replacement>. [path]
```

Last line: `net: -<N> lines, -<M> deps possible.` Nothing to cut: `Lean
already. Ship.`

```
1. native: moment.js for two format calls. Intl.DateTimeFormat, 0 deps. [package.json, src/dates.js]
2. yagni: NotifierFactory with one product. Call EmailNotifier directly. [src/notify/]
3. stdlib: hand-rolled deepClone. structuredClone. [src/util/clone.js]
net: -48 lines, -1 dep possible.
```

`review.md` § Before a line is written holds here too: `delete:` and `reuse:`
only after a grep of the whole tree, tests and fixtures included; a
`shortcut:` / `ponytail:` marker naming its ceiling is a decision, not a
finding, until the expected load crosses it.

## Scope

- Complexity only. A correctness defect found while scanning is **one line
  before the report**, routed to `skillator:audit-sherlock`, and does not
  appear among the findings.
- The one runnable check per non-trivial unit (SKILL.md §6) is the floor.
  Never tagged.
- Lists; applies nothing. Cuts the user takes are ordinary edits under the
  ground rules — blast radius named, callers checked.
