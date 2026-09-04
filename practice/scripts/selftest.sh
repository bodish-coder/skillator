#!/bin/sh
# Runnable check for taskwork.sh. Prints `ok`, or dies on the first failure.
#   sh practice/scripts/selftest.sh
set -e
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
tw="$here/taskwork.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

die() { echo "FAIL: $1" >&2; exit 1; }

cat > "$tmp/design.md" <<'EOF'
GOAL: something

### Task 1: first
body one
- [ ] step

### Task 2: second
body two

### Task 10: tenth
body ten
EOF

# brief: extracts exactly one block, boundaries respected
b=$("$tw" brief "$tmp/design.md" 1)
grep -q 'body one' "$b" || die 'brief 1 missing its body'
grep -q 'body two' "$b" && die 'brief 1 leaked into task 2'
head -1 "$b" | grep -q '^### Task 1: first$' || die 'brief 1 lost its heading'

# "Task 1" must not match "Task 10" — the classic prefix bug
b10=$("$tw" brief "$tmp/design.md" 10)
grep -q 'body ten' "$b10" || die 'brief 10 missing its body'
grep -q 'body one' "$b10" && die 'brief 10 matched task 1'

# last block runs to EOF
grep -q 'body ten' "$b10" || die 'last block truncated'

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

echo ok
