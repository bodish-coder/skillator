# code-yoda audit — what a repo can lose

`review.md`, repo-wide: the whole tree instead of a diff, ranked biggest cut
first. One-shot; it applies nothing. Like the review, this is an output-format
recipe — the shape of the report, not a behaviour the baseline found missing.

## Where to look

Dependencies the stdlib or the platform already covers · single-implementation
interfaces · factories with one product · wrappers that only delegate · files
exporting one thing · dead flags and config · hand-rolled stdlib. Read the code,
not the README's account of it (`codegraph` for callers and dead exports).

## The report

Same five tags as `review.md` (`delete:` `stdlib:` `native:` `yagni:`
`shrink:`), one line per finding, **ranked by lines removed**, path last:

```
<tag> <what to cut>. <replacement>. [path]
```

Last line: `net: -<N> lines, -<M> deps possible.` Nothing to cut: `Lean
already. Ship.`

```
native: python-dateutil for one isoparse call. datetime.fromisoformat, 0 deps. [requirements.txt, urlshort/export.py]
yagni: Exporter ABC with one subclass. One export_csv function. [urlshort/export.py]
stdlib: _csv_field/_csv_row hand-roll quoting. csv.writer over io.StringIO. [urlshort/export.py]
net: -48 lines, -1 dep possible.
```

## Scope

- Complexity only. A correctness defect found while scanning is **one line
  before the report**, routed to `skillator:audit-sherlock`, and does not
  appear among the findings.
- The one runnable check per non-trivial unit (SKILL.md §6) is the floor.
  Never tagged.
- Lists; applies nothing. Cuts the user takes are ordinary edits under the
  ground rules — blast radius named, callers checked.
