#!/bin/sh
# TICKETS.md integrity. The board is append-only and merged by git, so the two
# ways it goes wrong are both merge artefacts, plus one content check:
#   1. Duplicate IDs - two branches allocated the same number, the conflict was
#      resolved by keeping both sides, and nothing noticed. An ID that means two
#      things is worse than a missing ticket: "do A43" is now ambiguous forever.
#   2. Conflict markers committed into the file.
#   3. A closed ([x]) row whose line still ends in a bare "Plan: S<n>" pointer
#      with no outcome ever recorded - the ticket says a plan ran, but never
#      says what happened when it did (A78).
# Run before a merge commit and before pushing a board change:
#   sh practice/scripts/check-tickets.sh [path/to/TICKETS.md]
#   sh practice/scripts/check-tickets.sh --selftest
set -e

die() { echo "FAIL: $1" >&2; exit 1; }

run_selftest() {
  stmp=$(mktemp -d)
  trap 'rm -rf "$stmp"' EXIT

  # Failing case: [x] ticket ends in a bare Plan: S<n> pointer, no outcome.
  cat > "$stmp/bad.md" <<'EOF'
# Board

- [x] A1 - some ticket that got closed. Plan: S3
EOF
  if sh "$0" "$stmp/bad.md" >"$stmp/bad.out" 2>&1; then
    echo "SELFTEST FAIL: bare Plan pointer on a [x] row did not fail" >&2
    cat "$stmp/bad.out" >&2
    exit 1
  fi
  grep -q 'bare Plan pointer' "$stmp/bad.out" || {
    echo "SELFTEST FAIL: wrong failure reason for bare Plan pointer" >&2
    cat "$stmp/bad.out" >&2
    exit 1
  }

  # Passing case: same shape, but an outcome is recorded after the pointer.
  cat > "$stmp/good.md" <<'EOF'
# Board

- [x] A1 - some ticket that got closed. Plan: S3. Shipped as designed, GREEN.
EOF
  if ! sh "$0" "$stmp/good.md" >"$stmp/good.out" 2>&1; then
    echo "SELFTEST FAIL: [x] row with a recorded outcome after Plan: S<n> failed" >&2
    cat "$stmp/good.out" >&2
    exit 1
  fi

  # Passing case: a bare Plan pointer on a still-open ([~]) ticket is fine -
  # the check only cares once the ticket claims to be done.
  cat > "$stmp/open.md" <<'EOF'
# Board

- [~] A2 - in progress. Plan: S4
EOF
  if ! sh "$0" "$stmp/open.md" >"$stmp/open.out" 2>&1; then
    echo "SELFTEST FAIL: open ([~]) ticket with a bare Plan pointer was wrongly failed" >&2
    cat "$stmp/open.out" >&2
    exit 1
  fi

  # Failing case: only a trailing attribution tag after the pointer still
  # counts as no outcome recorded.
  cat > "$stmp/tag.md" <<'EOF'
# Board

- [x] A3 - closed with only an attribution tag. Plan: S5 (claude-opus-5 2026-09-22)
EOF
  if sh "$0" "$stmp/tag.md" >"$stmp/tag.out" 2>&1; then
    echo "SELFTEST FAIL: bare Plan pointer followed only by a tag did not fail" >&2
    cat "$stmp/tag.out" >&2
    exit 1
  fi

  echo "ok - check-tickets.sh selftest passed"
}

if [ "${1:-}" = "--selftest" ]; then
  run_selftest
  exit 0
fi

root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
board=${1:-$root/TICKETS.md}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

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
  echo "  number and the merge kept both. Per tickets-zordon's collision rule, the" >&2
  echo "  LATER line takes a fresh number and keeps ' (was <ID>)' on it; the" >&2
  echo "  earlier one is never renumbered." >&2
  while read -r id; do
    echo "  --- $id ---" >&2
    grep -nE "^[[:space:]]*- \[.\][[:space:]]*$id[[:space:]]" "$board" | sed 's/^/    /' >&2
  done < "$tmp/dups"
  exit 1
fi

# A78: a closed ([x]) row whose line still ends in a bare "Plan: S<n>" pointer
# with nothing said about what happened when that stage ran. A trailing
# " (...)" attribution/session tag is allowed after the pointer, but real
# outcome text (RED/GREEN, what shipped, what changed) is not - that's what
# makes it "bare".
if grep -nE '^[[:space:]]*- \[x\][[:space:]].*Plan: S[0-9][0-9]*\.?([[:space:]]*\([^()]*\))*[[:space:]]*$' \
  "$board" > "$tmp/bareplan"; then
  echo "FAIL: [x] ticket(s) with a bare Plan pointer and no outcome recorded in $board" >&2
  echo "  Status is [x] (closed) but the line still ends in 'Plan: S<n>' with no" >&2
  echo "  outcome after it - only trailing attribution tags, if any. Record what" >&2
  echo "  happened when that stage ran (RED/GREEN, what shipped, what changed), or" >&2
  echo "  the ticket isn't really closed yet." >&2
  sed 's/^/  /' "$tmp/bareplan" >&2
  exit 1
fi

n=$(wc -l < "$tmp/ids" | tr -d ' ')
echo "ok — $n ticket IDs in $(basename "$board"), no duplicates, no conflict markers"
