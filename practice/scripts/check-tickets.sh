#!/bin/sh
# TICKETS.md integrity. The board is append-only and merged by git, so the two
# ways it goes wrong are both merge artefacts:
#   1. Duplicate IDs - two branches allocated the same number, the conflict was
#      resolved by keeping both sides, and nothing noticed. An ID that means two
#      things is worse than a missing ticket: "do A43" is now ambiguous forever.
#   2. Conflict markers committed into the file.
# Run before a merge commit and before pushing a board change:
#   sh practice/scripts/check-tickets.sh [path/to/TICKETS.md]
set -e
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
board=${1:-$root/TICKETS.md}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

die() { echo "FAIL: $1" >&2; exit 1; }

[ -f "$board" ] || die "no board at $board"

# Conflict markers first - every other check is meaningless in a half-merged file.
if grep -nE '^(<<<<<<<|=======|>>>>>>>) ?' "$board" > "$tmp/c"; then
  echo "FAIL: unresolved merge conflict markers in $board" >&2
  sed 's/^/  /' "$tmp/c" >&2
  exit 1
fi

# One ID per ticket line: "- [x] A43 — title", sub-parts "B7a" included.
# Sub-parts are indented under a parent, so leading space is allowed.
sed -n 's/^[[:space:]]*- \[.\][[:space:]]*\([A-Z][A-Z]*[0-9][0-9]*[a-z]*\)[[:space:]].*/\1/p' \
  "$board" > "$tmp/ids"

[ -s "$tmp/ids" ] || die "no ticket lines found in $board - is this a board?"

sort "$tmp/ids" | uniq -d > "$tmp/dups"
if [ -s "$tmp/dups" ]; then
  echo "FAIL: duplicate ticket IDs in $board" >&2
  echo "  An ID is permanent and means one thing. Two branches allocated the same" >&2
  echo "  number and the merge kept both. Per ticket-master's collision rule, the" >&2
  echo "  LATER line takes a fresh number and keeps ' (was <ID>)' on it; the" >&2
  echo "  earlier one is never renumbered." >&2
  while read -r id; do
    echo "  --- $id ---" >&2
    grep -nE "^[[:space:]]*- \[.\][[:space:]]*$id[[:space:]]" "$board" | sed 's/^/    /' >&2
  done < "$tmp/dups"
  exit 1
fi

n=$(wc -l < "$tmp/ids" | tr -d ' ')
echo "ok — $n ticket IDs in $(basename "$board"), no duplicates, no conflict markers"
