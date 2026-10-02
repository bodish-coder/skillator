#!/bin/sh
# rules-orko: the two rule files, read and written from one place (F25).
#
#   rules-orko.sh show                      every rule in force here, scope-tagged
#   rules-orko.sh add global|project TEXT   append one rule at that scope
#   rules-orko.sh paths                     the two files this clone resolves to
#   rules-orko.sh --selftest
#
# GLOBAL rules follow the user: $SKILLATOR_HOME/rules.md, default
# $HOME/.skillator/rules.md. One plain file outside every repo, never
# committed. A second user on the same clone has a different HOME, so they get
# their own file and never this one's.
# PROJECT rules follow the repo: <git toplevel>/.skillator/rules.md, committed,
# so a teammate's `git pull` brings them. Outside git: ./.skillator/rules.md.
#
# `show` prints the project file first, then the global one, each line
# prefixed with its scope, and a one-line header counting both. It never
# merges or ranks them: a global rule that contradicts a project rule is for
# the user to settle (SKILL.md, clashes), not for a script.
#
# The script is the only writer. An agent that edits ~/.skillator/rules.md by
# hand in a test writes into a real home; SKILLATOR_HOME exists so a run can
# point it anywhere.
set -e

prog=rules-orko.sh
die() { echo "$prog: $1" >&2; exit "${2:-1}"; }
usage() {
  echo "usage: $prog show | paths | add global|project TEXT" >&2
  echo "       $prog --selftest" >&2
  exit 2
}

global_path() {
  if [ -n "${SKILLATOR_HOME:-}" ]; then printf '%s\n' "$SKILLATOR_HOME/rules.md"
  else printf '%s\n' "${HOME:?HOME is not set}/.skillator/rules.md"; fi
}

project_path() {
  if top=$(git rev-parse --show-toplevel 2>/dev/null); then printf '%s\n' "$top/.skillator/rules.md"
  else printf '%s\n' "./.skillator/rules.md"; fi
}

# Who is working: the git identity, so the project file can say who added a rule.
who() {
  n=$(git config user.name 2>/dev/null || true)
  e=$(git config user.email 2>/dev/null || true)
  if [ -n "$n" ]; then printf '%s\n' "$n"
  elif [ -n "$e" ]; then printf '%s\n' "$e"
  else printf '%s\n' "unknown"; fi
}

# Rule lines only: "- text". Headers and blanks are skipped.
rules_in() { [ -f "$1" ] && sed -n 's/^- //p' "$1" || true; }
count_in() { rules_in "$1" | grep -c . || true; }

header_global() {
  printf '%s\n' '# Rules - global' \
    '' \
    'How this user works, in every project, on every host. Personal: this file' \
    'lives outside every repo and is never committed. rules-orko reads it at' \
    'session start; rules-orko.sh add global "<rule>" appends to it.' \
    ''
}

header_project() {
  printf '%s\n' '# Rules - project' \
    '' \
    'How this codebase is worked on, for everyone who pulls it. Committed with' \
    'the repo. rules-orko reads it at session start; rules-orko.sh add project' \
    '"<rule>" appends to it. A personal habit does not belong here - it goes to' \
    '~/.skillator/rules.md, which follows its owner and nobody else.' \
    ''
}

show() {
  g=$(global_path); p=$(project_path)
  gc=$(count_in "$g"); pc=$(count_in "$p")
  gs="$g"; [ -f "$g" ] || gs="$g, absent"
  ps="$p"; [ -f "$p" ] || ps="$p, absent"
  printf 'rules-orko: project %s (%s) . global %s (%s) . user %s\n' "$pc" "$ps" "$gc" "$gs" "$(who)"
  rules_in "$p" | sed 's/^/project: /'
  rules_in "$g" | sed 's/^/global:  /'
  if [ "$gc" -gt 0 ] && [ "$pc" -gt 0 ]; then
    echo "clash check: read both lists above; a global rule that contradicts a project rule is asked, never settled here" >&2
  fi
}

add() {
  scope=$1; text=$2
  [ -n "$text" ] || die "add: the rule text is empty" 2
  case $text in *"
"*) die "add: one rule, one line" 2 ;; esac
  day=$(date +%Y-%m-%d)
  case $scope in
    global)  f=$(global_path);  line="- $text ($day)" ;;
    project) f=$(project_path); line="- $text ($(who), $day)" ;;
    *) die "add: scope is global or project, got '$scope'" 2 ;;
  esac
  if [ -f "$f" ] && rules_in "$f" | sed 's/ ([^()]*)$//' | grep -Fqx -- "$text"; then
    echo "$prog: already a $scope rule, nothing added: $text" >&2
    return 0
  fi
  mkdir -p "$(dirname -- "$f")"
  if [ ! -f "$f" ]; then
    if [ "$scope" = global ]; then header_global > "$f"; else header_project > "$f"; fi
  fi
  printf '%s\n' "$line" >> "$f"
  echo "$prog: $scope rule added to $f"
  if [ "$scope" = project ]; then
    echo "$prog: commit .skillator/rules.md so a teammate's git pull brings it" >&2
  fi
}

paths() {
  printf 'global:  %s\n' "$(global_path)"
  printf 'project: %s\n' "$(project_path)"
}

selftest() {
  t=$(mktemp -d)
  trap 'rm -rf "$t"' EXIT
  fail() { echo "SELFTEST FAIL: $1" >&2; exit 1; }
  g() { git -c core.hooksPath=/dev/null -c core.autocrlf=false -c commit.gpgsign=false "$@"; }
  export HOME="$t/home-nobody"; unset SKILLATOR_HOME
  export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

  # 1. Two projects, one user: a global rule stated in P1 is in force in P2.
  mkdir -p "$t/homeA" "$t/p1" "$t/p2"
  (cd "$t/p1" && g init -q -b main . && g config user.name Ada && g config user.email ada@example.invalid)
  (cd "$t/p2" && g init -q -b main . && g config user.name Ada && g config user.email ada@example.invalid)
  out=$(cd "$t/p1" && SKILLATOR_HOME="$t/homeA" sh "$me" add global "always run the tests before committing") ||
    fail "add global errored"
  [ -f "$t/homeA/rules.md" ] || fail "global rule not written to SKILLATOR_HOME: $out"
  [ ! -e "$t/p1/.skillator" ] || fail "global rule leaked into the project tree"
  out=$(cd "$t/p2" && SKILLATOR_HOME="$t/homeA" sh "$me" show)
  echo "$out" | grep -q '^global:  always run the tests before committing (' ||
    fail "global rule from p1 not shown in fresh p2: $out"
  echo "$out" | grep -q '^rules-orko: project 0 (.*absent) . global 1 (' || fail "show header wrong: $out"

  # 2. A project rule reaches a second clone after git pull.
  g init -q --bare -b main "$t/origin.git"
  (cd "$t/p1" && printf 'x\n' > README && g add README && g commit -qm init && g remote add origin "$t/origin.git" && g push -q origin main)
  g clone -q "$t/origin.git" "$t/clone2"
  (cd "$t/clone2" && g config user.name Bob && g config user.email bob@example.invalid)
  out=$(cd "$t/p1" && SKILLATOR_HOME="$t/homeA" sh "$me" add project "never edit notekeep/store.py without asking" 2>"$t/err")
  grep -q 'commit .skillator/rules.md' "$t/err" || fail "project add did not say to commit"
  grep -q '^- never edit notekeep/store.py without asking (Ada, 20' "$t/p1/.skillator/rules.md" ||
    fail "project rule line wrong: $(cat "$t/p1/.skillator/rules.md")"
  (cd "$t/p1" && g add .skillator && g commit -qm rules && g push -q origin main)
  out=$(cd "$t/clone2" && SKILLATOR_HOME="$t/homeB" sh "$me" show)
  echo "$out" | grep -q 'never edit' && fail "clone2 saw the project rule before pulling"
  (cd "$t/clone2" && g pull -q origin main)
  out=$(cd "$t/clone2/.skillator" && SKILLATOR_HOME="$t/homeB" sh "$me" show)
  echo "$out" | grep -q '^project: never edit notekeep/store.py without asking (Ada, ' ||
    fail "project rule not in clone2 after pull (run from a subdir): $out"

  # 3. A second git user gets the project rules plus THEIR OWN global ones.
  mkdir -p "$t/homeB"
  (cd "$t/clone2" && SKILLATOR_HOME="$t/homeB" sh "$me" add global "prefer tabs" >/dev/null)
  out=$(cd "$t/clone2" && SKILLATOR_HOME="$t/homeB" sh "$me" show 2>"$t/err")
  echo "$out" | grep -q '^project: never edit' || fail "user B lost the project rule: $out"
  echo "$out" | grep -q '^global:  prefer tabs (' || fail "user B lost their own global rule: $out"
  echo "$out" | grep -q 'always run the tests' && fail "user B got user A's global rule: $out"
  echo "$out" | grep -q 'user Bob$' || fail "show does not name the user: $out"
  grep -q 'clash check' "$t/err" || fail "both scopes present but no clash-check line"
  out=$(cd "$t/p1" && SKILLATOR_HOME="$t/homeA" sh "$me" show 2>/dev/null)
  echo "$out" | grep -q 'prefer tabs' && fail "user A got user B's global rule: $out"

  # 4. Default path, dedupe, bad input, headers, outside git.
  mkdir -p "$t/home-nobody"
  # git prints the toplevel in its own spelling (C:/... on Windows), so compare
  # against that rather than against mktemp's.
  top1=$(cd "$t/p1" && git rev-parse --show-toplevel)
  out=$(cd "$t/p1" && sh "$me" paths)
  echo "$out" | grep -Fqx -- "global:  $t/home-nobody/.skillator/rules.md" || fail "default global path wrong: $out"
  echo "$out" | grep -Fqx -- "project: $top1/.skillator/rules.md" || fail "project path wrong: $out"
  (cd "$t/p1" && SKILLATOR_HOME="$t/homeA" sh "$me" add global "always run the tests before committing" 2>"$t/err")
  grep -q 'already a global rule' "$t/err" || fail "duplicate rule not reported"
  [ "$(grep -c '^- ' "$t/homeA/rules.md")" = 1 ] || fail "duplicate rule appended"
  head -1 "$t/homeA/rules.md" | grep -q '^# Rules - global$' || fail "global header missing"
  head -1 "$t/p1/.skillator/rules.md" | grep -q '^# Rules - project$' || fail "project header missing"
  if (cd "$t/p1" && sh "$me" add elsewhere "x" 2>/dev/null); then fail "bad scope accepted"; fi
  if (cd "$t/p1" && sh "$me" add global "" 2>/dev/null); then fail "empty rule accepted"; fi
  if (cd "$t/p1" && sh "$me" bogus 2>/dev/null); then fail "unknown command accepted"; fi
  mkdir -p "$t/plain"
  out=$(cd "$t/plain" && GIT_CEILING_DIRECTORIES=$t sh "$me" add project "plain rule" 2>/dev/null)
  [ -f "$t/plain/.skillator/rules.md" ] || fail "outside git: project file not created in cwd"
  out=$(cd "$t/plain" && GIT_CEILING_DIRECTORIES=$t sh "$me" show)
  echo "$out" | grep -q '^project: plain rule (unknown, ' || fail "outside git: who should be unknown: $out"
  LC_ALL=C grep -q '[^ -~]' "$me" && fail "script is not pure ASCII"
  if grep -q "$(printf '\r')" "$me"; then fail "script has CRLF line endings"; fi

  echo "ok - rules-orko.sh selftest passed (global follows the user into p2, project reaches clone2 on pull, user B gets project + own global and not A's, default path, dedupe, bad input, no-git)"
}

if [ "${1:-}" = --selftest ]; then
  [ $# -eq 1 ] || usage
  me=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/$(basename -- "$0")
  selftest; exit 0
fi
case "${1:-}" in
  show)  [ $# -eq 1 ] || usage; show ;;
  paths) [ $# -eq 1 ] || usage; paths ;;
  add)   [ $# -eq 3 ] || usage; add "$2" "$3" ;;
  *) usage ;;
esac
