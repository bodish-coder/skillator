#!/bin/sh
# board-fresh.sh - the stale-board guard (F82). Every board writer runs it
# before it writes TICKETS.md (ticket-meta, relay-morpheus `board`), next-id.sh
# runs its fetch before it allocates, and grayskull-power's arm runs it once.
# Windows twin: board-fresh.ps1, the same words byte for byte; keep the two in step.
#
#   board-fresh.sh [dir]                   the guard, on the checkout holding dir (default .)
#   board-fresh.sh --fetch [dir]           only step 1 (next-id.sh, before it counts)
#   board-fresh.sh --record <file> <who>   a skillator writer left <file> uncommitted
#   board-fresh.sh --selftest
#
# The guard acts on a checkout whose branch has an upstream; detached, no
# upstream or not git: nothing to compare, exit 0, silent.
#   1. Fetch the upstream's remote - at most once per 10 min per clone (stamp:
#      <git common dir>/skillator/board-fresh.stamp, written on every attempt),
#      killed after 5 s. A failed fetch says 'unchecked' and the write goes on:
#      never blocked on the network.
#   2. Behind, no local commits, and nothing dirty but TICKETS.md -> `git merge
#      --ff-only` onto the fetched upstream (the pull without a second fetch);
#      --autostash when TICKETS.md is dirty, and only after `git merge-file`
#      shows its edits apply clean on the upstream's. One line says so.
#   3. Behind any other way - local commits not on the upstream, another dirty
#      file, a TICKETS.md conflict, a fast-forward git refused - exit 2 and one
#      report: N behind, the local-only commits, each dirty file with its last
#      writer from <top>/.skillator/dirty.log, the commands to reconcile. Then
#      nothing is pulled, merged, reset or stashed: that work is not the guard's.
# Untracked files are not dirt here (git refuses a merge that would overwrite one).
# Every message goes to stderr. The outcome is kept for pending.sh (BOARD=) in
# <git common dir>/skillator/board-fresh, one line:
#   <epoch> TAB ok|ff|unchecked|refused TAB <behind> TAB <upstream> TAB <reason or ->
# dirty.log lines: <UTC time> TAB <path from the top> TAB <who>; the last per path counts.
set -u
LC_ALL=C
export LC_ALL
prog=board-fresh
B=TICKETS.md

say() { printf '%s\n' "$*" >&2; }
usage() {
  say "usage: $prog.sh [--fetch] [dir] | --record <file> <who> | --selftest"
  exit 2
}

# top br up remote sk <- the checkout holding $1; 1 when there is nothing to guard.
setup() {
  top=$(git -C "$1" rev-parse --show-toplevel 2>/dev/null) || return 1
  br=$(git -C "$top" symbolic-ref -q --short HEAD 2>/dev/null) || return 1
  up=$(git -C "$top" rev-parse -q --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null) || return 1
  remote=$(git -C "$top" config "branch.$br.remote" 2>/dev/null) || remote=''
  sk=$(git -C "$top" rev-parse --path-format=absolute --git-common-dir)/skillator
  mkdir -p "$sk"
}

# FETCH <- ok | unchecked | skip (fetched in the last 10 min, or a local upstream).
fetch() {
  FETCH=skip
  case $remote in ''|.) return 0 ;; esac
  t=$(date +%s) st=''
  [ -f "$sk/board-fresh.stamp" ] && st=$(tr -dc 0-9 < "$sk/board-fresh.stamp")
  if [ -n "$st" ] && [ "$st" -le "$t" ] && [ $((t - st)) -lt 600 ]; then return 0; fi
  echo "$t" > "$sk/board-fresh.stamp"
  GIT_TERMINAL_PROMPT=0 git -C "$top" fetch -q "$remote" > /dev/null 2>&1 &
  p=$! i=0
  while kill -0 "$p" 2> /dev/null; do
    if [ "$i" -ge 50 ]; then kill "$p" 2> /dev/null; wait "$p" 2> /dev/null; FETCH=unchecked; return 0; fi
    sleep 0.1
    i=$((i + 1))
  done
  if wait "$p"; then FETCH=ok; else FETCH=unchecked; fi
}

# state <ok|ff|unchecked|refused> <behind> <reason>
state() {
  printf '%s\t%s\t%s\t%s\t%s\n' "$(date +%s)" "$1" "$2" "$up" "$3" > "$sk/board-fresh.$$" &&
    mv -f "$sk/board-fresh.$$" "$sk/board-fresh"
}

guard() {
  setup "$1" || return 0
  fetch
  [ "$FETCH" = unchecked ] && say "$prog: $up unchecked (the fetch failed or took over 5 s) - the board is written as it is"
  set -- $(git -C "$top" rev-list --left-right --count "HEAD...$up" 2> /dev/null)
  ahead=${1:-0} behind=${2:-0}
  if [ "$behind" = 0 ]; then
    if [ "$FETCH" = unchecked ]; then state unchecked 0 -; else state ok 0 -; fi
    return 0
  fi
  dirty=$(git -C "$top" -c core.quotepath=off status --porcelain -uno 2> /dev/null)
  others=$(printf '%s\n' "$dirty" | B=$B awk 'length($0) > 3 && substr($0, 4) != ENVIRON["B"]')
  bd=$(printf '%s\n' "$dirty" | B=$B awk 'substr($0, 4) == ENVIRON["B"] { print 1 }')
  why=''
  if [ "$ahead" = 0 ] && [ -z "$others" ]; then
    if [ -n "$bd" ] && ! git -C "$top" diff --quiet HEAD "$up" -- "$B"; then
      git -C "$top" cat-file --filters "HEAD:$B" > "$sk/base.$$" 2> /dev/null
      git -C "$top" cat-file --filters "$up:$B" > "$sk/theirs.$$" 2> /dev/null
      git merge-file -q -p "$top/$B" "$sk/base.$$" "$sk/theirs.$$" > /dev/null 2>&1 ||
        why="$B is edited here and on $up, and the edits conflict"
      rm -f "$sk/base.$$" "$sk/theirs.$$"
    fi
    if [ -z "$why" ]; then
      set -- --ff-only
      [ -n "$bd" ] && set -- --ff-only --autostash
      if out=$(git -C "$top" merge -q "$@" "$up" 2>&1); then
        if [ -n "$bd" ]; then
          say "$prog: fast-forwarded $br to $up (was $behind behind), the $B edits kept"
        else
          say "$prog: fast-forwarded $br to $up (was $behind behind)"
        fi
        state ff "$behind" -
        return 0
      fi
      why="git refused the fast-forward: $(printf '%s\n' "$out" | awk 'NF { print; exit }')"
    fi
  fi
  r="$behind behind $up"
  [ "$ahead" != 0 ] && r="$r, $ahead local commit(s) not on it"
  n=$(printf '%s\n' "$others" | awk 'NF { c++ } END { print c + 0 }')
  [ "$n" != 0 ] && r="$r, $n other dirty file(s)"
  [ -n "$why" ] && r="$r, $why"
  say "$prog: REFUSED the board write - $top is $r"
  if [ "$ahead" != 0 ]; then
    say "  local commits not on $up:"
    git -C "$top" log --format='    %h %s' "$up..HEAD" >&2
  fi
  if [ -n "$dirty" ]; then
    say "  dirty files:"
    printf '%s\n' "$dirty" | while IFS= read -r l; do
      [ -n "$l" ] || continue
      p=${l#???}
      w=''
      [ -f "$top/.skillator/dirty.log" ] &&
        w=$(tr -d '\r' < "$top/.skillator/dirty.log" | P=$p awk -F'\t' '$2 == ENVIRON["P"] { w = $3 " at " $1 } END { print w }')
      if [ -n "$w" ]; then say "    $l  (left by $w)"; else say "    $l  (no skillator record)"; fi
    done
  fi
  say "  nothing was pulled, merged, reset or stashed. To reconcile, by hand:"
  say "    git -C \"$top\" status"
  [ -n "$dirty" ] && say "    git -C \"$top\" diff    (whose edits? commit them, or stash them yourself)"
  if [ "$ahead" != 0 ]; then say "    git -C \"$top\" pull --rebase"; else say "    git -C \"$top\" pull --ff-only"; fi
  say "  then retry the board write."
  state refused "$behind" "$r"
  return 2
}

record() {
  f=$1; shift
  d=$(dirname -- "$f")
  rt=$(git -C "$d" rev-parse --show-toplevel 2> /dev/null) || { say "$prog: $f is not in a git checkout - not recorded"; return 0; }
  rel=$(git -C "$d" rev-parse --show-prefix 2> /dev/null)$(basename -- "$f")
  mkdir -p "$rt/.skillator"
  printf '%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%MZ)" "$rel" "$(printf '%s' "$*" | tr '\t\r\n' '   ')" >> "$rt/.skillator/dirty.log"
}

selftest() {
  self=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/$(basename -- "$0")
  PS1F=${self%.sh}.ps1
  t=$(mktemp -d 2> /dev/null || mktemp -d -t boardfresh)
  trap 'rm -rf "$t"' EXIT
  printf '[user]\n\tname = t\n\temail = t@x.invalid\n[init]\n\tdefaultBranch = main\n[core]\n\tautocrlf = false\n' > "$t/gitconfig"
  GIT_CONFIG_GLOBAL=$t/gitconfig
  export GIT_CONFIG_GLOBAL
  fail=0
  bad() { echo "FAIL: $1"; fail=1; }
  bf() { sh "$self" "$@" 2> "$t/err"; rc=$?; tr -d '\r' < "$t/err" > "$t/e"; }
  pst() { powershell -NoProfile -ExecutionPolicy Bypass -File "$PS1F" "$@" 2>&1 | tr -d '\r'; }
  # the same words from the twin, when there is one to run
  twin() {
    command -v powershell > /dev/null 2>&1 && [ -f "$PS1F" ] || return 0
    age
    [ "$(pst "$A")" = "$(cat "$t/e")" ] || bad "$1: board-fresh.ps1 says [$(pst "$A")], the sh [$(cat "$t/e")]"
  }
  age() { echo 0 > "$A/.git/skillator/board-fresh.stamp"; }
  push() { (cd "$t/b" && git pull -q --ff-only && echo "$1" >> "${2:-app.txt}" && git add -A && git commit -qm "$1" && git push -q) > /dev/null 2>&1 || bad "fixture push $1"; }
  A=$t/a

  git init -q --bare "$t/up.git"
  git clone -q "$t/up.git" "$A" 2> /dev/null
  (cd "$A" && printf '# Board\n\n- [ ] F1 - one\n' > $B && echo x > app.txt && echo n > notes.txt &&
    git add -A && git commit -qm init && git push -q -u origin main) > /dev/null 2>&1 || { echo "FAIL: fixture"; exit 1; }
  git clone -q "$t/up.git" "$t/b" 2> /dev/null

  # up to date: silent, ok
  bf "$A"; [ "$rc" = 0 ] && [ ! -s "$t/e" ] || bad "up to date: rc $rc, said [$(cat "$t/e")]"
  # behind, clean -> fast-forward
  push one; age; bf "$A"
  [ "$rc" = 0 ] && [ "$(cat "$t/e")" = "board-fresh: fast-forwarded main to origin/main (was 1 behind)" ] || bad "ff: rc $rc [$(cat "$t/e")]"
  [ "$(git -C "$A" rev-parse HEAD)" = "$(git -C "$A" rev-parse origin/main)" ] || bad "ff: HEAD not at origin/main"
  # the 10-minute stamp: a fresh stamp skips the fetch, an old one fetches
  push two; bf "$A"
  [ "$rc" = 0 ] && [ "$(git -C "$A" rev-list --count HEAD..origin/main)" = 0 ] || bad "stamp: fetched again inside 10 min"
  age; bf "$A"; [ "$(cat "$t/e")" = "board-fresh: fast-forwarded main to origin/main (was 1 behind)" ] || bad "stamp: old stamp did not fetch [$(cat "$t/e")]"
  # a dirty TICKETS.md only -> fast-forward, its edits kept
  echo '- [ ] F2 - mine' >> "$A/$B"; push three; age; bf "$A"
  [ "$rc" = 0 ] && [ "$(cat "$t/e")" = "board-fresh: fast-forwarded main to origin/main (was 1 behind), the $B edits kept" ] || bad "ff dirty board: rc $rc [$(cat "$t/e")]"
  grep -q 'F2 - mine' "$A/$B" && grep -q three "$A/app.txt" || bad "ff dirty board: edits or upstream lost"
  # TICKETS.md edited on both sides, conflicting -> refused, nothing moved
  push '- [ ] F3 - theirs' $B; cp "$A/$B" "$t/mine"; h=$(git -C "$A" rev-parse HEAD); age; bf "$A"
  [ "$rc" = 2 ] && grep -q "REFUSED the board write - .* is 1 behind origin/main, $B is edited here and on origin/main, and the edits conflict" "$t/e" ||
    bad "board conflict: rc $rc [$(cat "$t/e")]"
  cmp -s "$A/$B" "$t/mine" && [ "$(git -C "$A" rev-parse HEAD)" = "$h" ] && [ -z "$(git -C "$A" stash list)" ] || bad "board conflict: something moved"
  twin "board conflict"
  git -C "$A" checkout -q -- $B; age; bf "$A"; [ "$rc" = 0 ] || bad "after the conflict: no ff ($rc)"
  # a local commit not on the upstream -> refused, listed
  (cd "$A" && echo local >> notes.txt && git commit -qam "local work") > /dev/null; push four; age; bf "$A"
  [ "$rc" = 2 ] && grep -q '1 behind origin/main, 1 local commit(s) not on it$' "$t/e" && grep -q '^    [0-9a-f]* local work$' "$t/e" &&
    grep -q 'pull --rebase$' "$t/e" || bad "local commit: rc $rc [$(cat "$t/e")]"
  grep -q "$(printf '\trefused\t1\torigin/main\t1 behind origin/main, 1 local commit(s) not on it')\$" "$A/.git/skillator/board-fresh" || bad "refusal not kept for pending: $(cat "$A/.git/skillator/board-fresh")"
  twin "local commit"
  git -C "$A" reset -q --hard origin/main
  # foreign dirty files -> refused, each with its last writer or none
  echo y >> "$A/app.txt"; echo z >> "$A/notes.txt"
  sh "$self" --record "$A/notes.txt" "relay-morpheus board F9 [x] run RUN-0003"
  push five other.txt; age; bf "$A"
  [ "$rc" = 2 ] && grep -q '2 other dirty file(s)$' "$t/e" && grep -q '^     M app.txt  (no skillator record)$' "$t/e" &&
    grep -q '^     M notes.txt  (left by relay-morpheus board F9 \[x\] run RUN-0003 at [0-9T:-]*Z)$' "$t/e" ||
    bad "foreign dirty: rc $rc [$(cat "$t/e")]"
  [ "$(git -C "$A" rev-list --count HEAD..origin/main)" = 1 ] && [ -z "$(git -C "$A" stash list)" ] || bad "foreign dirty: something moved"
  twin "foreign dirty"
  git -C "$A" checkout -q -- .; age; bf "$A"; [ "$rc" = 0 ] || bad "after the dirt: no ff ($rc)"
  # offline: unchecked, the write goes on
  git -C "$A" remote set-url origin "$t/gone.git"; age; bf "$A"
  [ "$rc" = 0 ] && [ "$(cat "$t/e")" = "board-fresh: origin/main unchecked (the fetch failed or took over 5 s) - the board is written as it is" ] ||
    bad "offline: rc $rc [$(cat "$t/e")]"
  twin offline
  # --fetch fetches, never merges; no upstream / not git: silent
  git -C "$A" remote set-url origin "$t/up.git"; push six; age; bf --fetch "$A"
  [ "$rc" = 0 ] && [ ! -s "$t/e" ] && [ "$(git -C "$A" rev-list --count HEAD..origin/main)" = 1 ] || bad "--fetch: rc $rc [$(cat "$t/e")]"
  git init -q "$t/plain"; bf "$t/plain"; [ "$rc" = 0 ] && [ ! -s "$t/e" ] || bad "no upstream: rc $rc [$(cat "$t/e")]"
  mkdir "$t/nogit"; bf "$t/nogit"; [ "$rc" = 0 ] && [ ! -s "$t/e" ] || bad "not git: rc $rc [$(cat "$t/e")]"
  [ "$fail" = 0 ] || exit 1
  echo "ok - board-fresh.sh selftest passed (silent when fresh, ff clean, 10-min stamp, ff dirty board kept, board conflict refused, local commit refused, foreign dirty refused with writers, offline unchecked, --fetch, no upstream, not git)"
}

case ${1:-} in
  --selftest) [ $# -eq 1 ] || usage; selftest ;;
  --fetch) [ $# -le 2 ] || usage; setup "${2:-.}" && fetch; exit 0 ;;
  --record) [ $# -ge 3 ] || usage; shift; record "$@" ;;
  -*) usage ;;
  *) [ $# -le 1 ] || usage; guard "${1:-.}"; exit $? ;;
esac
