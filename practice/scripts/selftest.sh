#!/bin/sh
# Runnable check for taskwork.sh. Prints `ok`, or dies on the first failure.
#   sh practice/scripts/selftest.sh
set -e
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
tw="$here/taskwork.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

die() { echo "FAIL: $1" >&2; exit 1; }

cat > "$tmp/design.md" <<'DESIGNEOF'
GOAL: something

### Task 1: first
body one
- [ ] step

### Task 2: second
An em-dash — an ellipsis … and café: the brief must carry these through.
### task 2b: a lowercase heading is prose, not a task boundary
- [ ] Step: create SKILL.md with:
```md
# Skill
```sh
echo hi
```
```
IMPORTANT: a body line that is NOT a design field - it must survive
The repo lives at C:\tools\Projects\app, which also is not a field.
DESIGN
body two

### Task 10: tenth
SATISFIES: R3
Files: ten.py
````md
```sh
NOTE: nested fence, and a design-field word below must not terminate here
TASKS: this is example content, not the real field
```
````
body ten

VERIFICATION:no-space-after-colon-still-terminates
TRACE:
| R3 | x | ten.py:f | t.py:t |
DESIGNEOF

# brief: extracts exactly one block, boundaries respected
b=$("$tw" brief "$tmp/design.md" 1)
grep -q 'body one' "$b" || die 'brief 1 missing its body'
grep -q 'body two' "$b" && die 'brief 1 leaked into task 2'
head -1 "$b" | grep -q '^### Task 1: first$' || die 'brief 1 lost its heading'

# "Task 1" must not match "Task 10" — the classic prefix bug
b10=$("$tw" brief "$tmp/design.md" 10)
grep -q 'body ten' "$b10" || die 'brief 10 missing its body'
grep -q 'body one' "$b10" && die 'brief 10 matched task 1'

# A71: the last block stops at the next top-level field, not at EOF, so what
# follows TASKS: does not leak into the final build agent's brief
grep -q 'body ten'      "$b10" || die 'last block truncated early'
grep -q '^VERIFICATION' "$b10" && die 'A71: VERIFICATION leaked into the last brief'
# no space after the colon: awk's $1 tokenizer missed this and ran the block to EOF
grep -q 'no-space'      "$b10" && die 'A71: a field with no space after the colon did not terminate'
grep -q '^TRACE'        "$b10" && die 'A71: TRACE leaked into the last brief'
grep -q 'SATISFIES'     "$b10" || die 'A71: SATISFIES (per-task field) treated as a terminator'
grep -q 'Files: ten'    "$b10" || die 'A71: mixed-case in-block field treated as a terminator'
grep -q 'NOTE:'         "$b10" || die 'A71: field-shaped line inside a code fence terminated the block'
grep -q 'TASKS: this'   "$b10" || die 'A71: real field name inside a NESTED fence terminated the block'

# the terminator is a closed set of design fields, not the SHAPE /^[A-Z][A-Z ]*:/ -
# matching the shape silently truncated any body opening IMPORTANT: or a drive letter
b2=$("$tw" brief "$tmp/design.md" 2)
grep -q 'IMPORTANT'   "$b2" || die 'A71: IMPORTANT: body line was treated as a design field'
grep -q 'Projects'    "$b2" || die 'A71: a Windows drive letter was treated as a design field'
grep -q 'body two'    "$b2" || die 'brief 2 truncated'
# PS 5.1 Get-Content defaults to the ANSI codepage; the twin diff only sees that
# if the fixture has non-ASCII in it
grep -q 'café'         "$b2" || die 'non-ASCII mangled in the brief'
grep -q '—'            "$b2" || die 'em-dash mangled in the brief'
# awk is case-sensitive; PowerShell -match is not
grep -q 'lowercase heading' "$b2" || die 'a lowercase ### task heading terminated the block'
# same-length nested fences leave the backtick run unbalanced; a fence-guarded
# '### Task ' terminator then ran the block to EOF and handed the agent two tasks
grep -q 'Task 10'     "$b2" && die 'A71: unbalanced same-length fences leaked the next task'
grep -q 'echo hi'     "$b2" || die 'A71: fenced body dropped'
# a bare field WORD with no colon is prose, not a field - the ps1 twin split on
# ':' and terminated here, which the byte-for-byte twin diff now catches
grep -q '^DESIGN$'    "$b2" || die 'A71: a bare field word with no colon terminated the block'

# a block that terminates on its first body line is a task with no steps - loud, not silent
mkdir -p "$tmp/headonly"   # own dir: .taskwork/ is derived from the design file's
cat > "$tmp/headonly/design.md" <<'EOF'
### Task 1: only a heading
VERIFICATION: immediately
EOF
if "$tw" brief "$tmp/headonly/design.md" 1 >/dev/null 2>&1; then
  die 'A71: a heading-only brief was emitted instead of erroring'
fi

# missing task is an error, not an empty file
if "$tw" brief "$tmp/design.md" 7 >/dev/null 2>&1; then die 'missing task 7 did not error'; fi
[ -e "$tmp/.taskwork/task-7-brief.md" ] && die 'errored brief left a file behind'

# missing design file is an error
if "$tw" brief "$tmp/nope.md" 1 >/dev/null 2>&1; then die 'missing design did not error'; fi

# review: real two-commit repo, package carries commits, stat and diff
r="$tmp/repo"; mkdir -p "$r"
git -C "$r" init -q
git -C "$r" config user.email t@t; git -C "$r" config user.name t
echo one > "$r/f.txt"; git -C "$r" add -A; git -C "$r" commit -qm first
base=$(git -C "$r" rev-parse HEAD)
echo two >> "$r/f.txt"; git -C "$r" add -A; git -C "$r" commit -qm second
head=$(git -C "$r" rev-parse HEAD)
cp "$tmp/design.md" "$r/design.md"

p=$(cd "$r" && sh "$tw" review design.md "$base" "$head")
grep -q '^## Commits'  "$p" || die 'review: no commits section'
grep -q 'second'       "$p" || die 'review: commit subject missing'
grep -q '^## Stat'     "$p" || die 'review: no stat section'
grep -q '^## Diff'     "$p" || die 'review: no diff section'
grep -q '^+two'        "$p" || die 'review: diff body missing'
grep -q "Base: $base"  "$p" || die 'review: base sha missing'

# bad ref is an error
if (cd "$r" && sh "$tw" review design.md nosuchref "$head" >/dev/null 2>&1); then
  die 'bad base ref did not error'
fi

# A32/A71: the PowerShell twin must agree byte for byte, not merely exist.
# Nothing else in the repo runs taskwork.ps1, so its divergences (the -match
# case-sensitivity bug, a BOM, a missing trailing newline) stayed green in every
# check until this one. Both twins derive .taskwork/ from the design file's own
# directory, so the ps1 runs against a separate copy and the sh output is
# snapshotted BEFORE it - a diff of two live paths can pass by comparing a file
# to itself, which is the same false confidence this check exists to catch.
ps=$(command -v pwsh || command -v powershell || true)
if [ -n "$ps" ]; then
  mkdir -p "$tmp/pstwin"
  cp "$tmp/design.md" "$tmp/pstwin/design.md"
  for t in 1 2 10; do
    sf=$("$tw" brief "$tmp/design.md" "$t")
    cp "$sf" "$tmp/expected-$t"
    pf=$("$ps" -NoProfile -ExecutionPolicy Bypass -File "$here/taskwork.ps1" brief "$tmp/pstwin/design.md" "$t" | tr -d '\r')
    [ -f "$pf" ] || die "taskwork.ps1 produced no brief for task $t"
    if ! diff -u "$tmp/expected-$t" "$pf" >/dev/null 2>&1; then
      echo "FAIL: taskwork.ps1 and taskwork.sh disagree on task $t" >&2
      diff -u "$tmp/expected-$t" "$pf" >&2 || true
      exit 1
    fi
  done
  echo "  twin: taskwork.ps1 matches taskwork.sh on tasks 1, 2, 10"
else
  echo "  twin: no pwsh/powershell on PATH - taskwork.ps1 NOT checked"
fi

echo ok
