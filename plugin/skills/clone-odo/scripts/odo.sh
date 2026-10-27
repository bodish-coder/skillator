#!/bin/sh
# clone-odo tool runner. One entry point for the six stdlib-Python tools, so the
# python check lives once and a missing python is one line, never a traceback.
#
#   odo.sh parity   <features.csv> [--visual <diffs/*.json>] [--markdown] [--fail-under N] [--platform web|android|ios|windows]
#   odo.sh imgdiff  <original.png> <clone.png> [--out diff.png] [--json] [--mode layout|pixel] [--platform web|android|ios|windows]
#   odo.sh reviews  <reviews.csv> [--out feedback.md] [--json] [--themes <themes.json>]
#   odo.sh sweep    [<dir>] --avoid "Name,Co" [--domains d.com] [--colors "#hex"] | --config brand.json
#   odo.sh listing  <listing.json> [--avoid "Name"]
#   odo.sh contrast <tokens.json> | <#fg> <#bg>
#   odo.sh test                           -> the tools' unittest suite
#   odo.sh selftest                       -> prints ok (or skipped: no python3), or dies
#
# Each tool's own flags: odo.sh <tool> --help. Exit codes are the tool's (0 ok,
# 1 a finding / under threshold, 2 bad input); 127 = no python3 >= 3.8.
set -u
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
prog=odo.sh

usage() {
  sed -n '2,/^[^#]/{/^#/p;}' "$here/$prog" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

# find_python: the first of python3 / python on PATH that is CPython >= 3.8.
# `python` may be Python 2 (SyntaxError on the tools) or the Windows Store stub;
# both fail the version probe quietly, so neither can produce a traceback.
find_python() {
  for c in python3 python; do
    command -v "$c" >/dev/null 2>&1 || continue
    "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)' >/dev/null 2>&1 && { echo "$c"; return 0; }
  done
  return 1
}

no_python() {
  echo "clone-odo: python3 (3.8 or newer) was not found on PATH. Install it from python.org (Windows: winget install Python.Python.3.12; Debian/Ubuntu: apt install python3) and rerun." >&2
  exit 127
}

selftest() {
  t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
  fail() { echo "FAIL: $1" >&2; exit 1; }
  # 1. no usable python: a PATH holding only a `python3` that is "too old" (its -c
  #    probe exits 1) and a `python` that is a Store-style stub (exits 9009-ish).
  mkdir -p "$t/bin"
  printf '#!/bin/sh\nexit 1\n' > "$t/bin/python3"; chmod 755 "$t/bin/python3"
  printf '#!/bin/sh\nexit 9\n' > "$t/bin/python";  chmod 755 "$t/bin/python"
  out=$(PATH="$t/bin:/usr/bin:/bin" sh "$here/$prog" parity "$t/none.csv" 2>&1); rc=$?
  [ "$rc" = 127 ] || fail "no-python: exit $rc, want 127: $out"
  echo "$out" | grep -q 'python3 (3.8 or newer) was not found' || fail "no-python: message missing: $out"
  echo "$out" | grep -qi 'traceback' && fail "no-python: a traceback leaked: $out"
  # 2. a bad subcommand is usage, exit 2
  sh "$here/$prog" nosuch >/dev/null 2>&1; rc=$?
  [ "$rc" = 2 ] || fail "unknown tool: exit $rc, want 2"
  # 3. with a real python, the suite
  if py=$(find_python); then
    "$py" -m unittest discover -s "$here/tests" -t "$here/tests" >"$t/unit.log" 2>&1 ||
      { cat "$t/unit.log" >&2; fail "unittest suite failed"; }
    n=$(sed -n 's/^Ran \([0-9]*\) tests\{0,1\}.*/\1/p' "$t/unit.log")
    [ "${n:-0}" -ge 40 ] || fail "unittest ran $n tests, want 40+"
    echo "ok - clone-odo tools: $n tests"
  else
    echo "skipped: python3 (3.8 or newer) not found - clone-odo tool tests not run"
  fi
  exit 0
}

[ $# -ge 1 ] || usage
tool=$1; shift
case $tool in
  selftest) selftest ;;
  parity|imgdiff|reviews|sweep|listing|contrast)
    py=$(find_python) || no_python
    exec "$py" "$here/$tool.py" "$@" ;;
  test)
    py=$(find_python) || no_python
    exec "$py" -m unittest discover -s "$here/tests" -t "$here/tests" "$@" ;;
  -h|--help) usage ;;
  *) echo "$prog: unknown tool '$tool'" >&2; usage ;;
esac
