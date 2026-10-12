#!/bin/sh
# One allocator for every serial ID (F21): ticket kinds A, B, F and generic
# kinds such as RUN and S. Two sessions that do not share a TICKETS.md - two
# worktrees, two branches - used to both take "local max + 1" and collide.
#
#   next-id.sh <KIND> [board-path]      reserve and print the next number
#   next-id.sh --peek <KIND> [board]    print it without reserving
#   next-id.sh --runs <dir> RUN|S|W     also count staged-run files (F22)
#   next-id.sh --count <n> <KIND>       reserve n in a row, one per line
#   next-id.sh --selftest
#
# next = 1 + max of
#   - KIND ids on ticket lines of the local board (default: <repo>/TICKETS.md)
#     and of its archive beside it, <board without .md>-archive.md (F27:
#     archive-tickets.sh moves old closed tickets there; they keep their number)
#   - the same two paths on every ref in refs/heads and refs/remotes
#   - the counter $(git rev-parse --git-common-dir)/skillator/ids/<KIND>,
#     shared by every worktree and session of the clone
# The counter is written back before the number is printed, under a mkdir
# lock; a lock older than NEXT_ID_STALE seconds (default 30) is broken.
# Sub-parts (A58c) count as their parent number. Cross-machine is best-effort:
# only fetched refs are seen, so check-tickets.sh stays the merge-time catch.
# Outside a git repo: local board only, said on stderr.
# --runs <dir> adds relay-morpheus run files (<dir>/run-*.md, and a legacy
# run.md) to the max, in the working tree and on every ref: RUN from the
# filename `run-<n>-`, S from the stage-table rows `| <n> |`. Without it a
# RUN-4 restarted at stage 1 and two worktrees both made RUN-4.
# Kind W (F31) is a relay-chain workflow code and exists only with --runs:
# 4 chars of base 36 over ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 (A = 0),
# padded with A - counter 1 = AAAB, 37 = AABB, 1679615 = 9999, then refused.
# The max is taken over the chain block headers `### <CODE> - stage <n>` in
# run files (tree and every ref), decoded, and the shared counter W. Stage
# cells are NOT scanned: a ticket-led stage name ("A110 code-yoda") reads as a
# code, and `chain plan` writes every cell together with its header anyway.
set -e

prog=next-id.sh
die() { echo "$prog: $1" >&2; exit "${2:-1}"; }
usage() {
  echo "usage: $prog [--peek] [--count <n>] [--runs <dir>] <KIND> [board-path]" >&2
  echo "       $prog --selftest" >&2
  exit 2
}

# Max KIND number on ticket lines ("- [ ] A43 - ...", "  - [x] A43b ...").
# Reads stdin; prints 0 when there are none.
max_ids() {
  sed -n "s/^[[:space:]]*- \[.\][[:space:]]*$1-\{0,1\}\([0-9][0-9]*\)[a-z]*\([^A-Za-z0-9].*\)\{0,1\}\$/\1/p" |
    awk 'BEGIN{m=0} {if ($1+0 > m) m=$1+0} END{print m}'
}

now() { date +%s; }

# Max of the numbers on stdin (0 when there are none).
max_num() { awk 'BEGIN{m=0} {if ($1+0 > m) m=$1+0} END{print m}'; }
# Run ids from run-file names ("run-3-slug.md", "run-3.md"), one per line.
run_names() { sed -n 's#^\(.*/\)\{0,1\}run-\([0-9][0-9]*\)\(-.*\)\{0,1\}\.md$#\2#p'; }
# Stage numbers from stage-table rows ("| 12 | name | ...").
stage_rows() { sed -n 's/^| *\([0-9][0-9]*\) *|.*/\1/p'; }

# W (F31): chain block headers "### AAQ7 - stage 66 - ..." -> decoded numbers.
# The separator is any one token, so a hand-typed em dash still counts.
W_RE='^### [A-Z0-9]{4} [^ ]+ stage [0-9]'
W_ABC=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789
W_MAX=1679615
code_rows() {
  grep -E "$W_RE" | cut -c5-8 | awk -v abc="$W_ABC" '
    { n=0; for (i=1; i<=4; i++) n = n*36 + index(abc, substr($0,i,1)) - 1; print n }'
}
# Print the numbers $1..$2, encoded as 4-char codes when the kind is W.
emit() {
  if [ "$kind" != W ]; then seq "$1" "$2"; return 0; fi
  [ "$2" -le "$W_MAX" ] || die "kind W exhausted: $2 > $W_MAX (9999)"
  seq "$1" "$2" | awk -v abc="$W_ABC" '{ n=$1+0; c="";
    for (i=0; i<4; i++) { c = substr(abc, n%36+1, 1) c; n = int(n/36) } print c }'
}

allocate() {
  peek=$1 kind=$2 board=$3 runs=$4 count=$5
  case $kind in ''|*[!A-Z]*) die "KIND must be capital letters (A, B, F, RUN, S), got '$kind'" 2 ;; esac
  case $count in ''|*[!0-9]*|0) die "--count wants a positive number, got '$count'" 2 ;; esac
  if [ -n "$runs" ]; then
    case $kind in RUN|S|W) ;; *) die "--runs counts only RUN, S or W, not '$kind'" 2 ;; esac
  elif [ "$kind" = W ]; then
    die "kind W (workflow code) needs --runs <dir>: codes live in run files" 2
  fi

  gdir=.
  [ -n "$board" ] && gdir=$(dirname -- "$board")
  [ -z "$board" ] && [ -n "$runs" ] && gdir=$runs
  if top=$(git -C "$gdir" rev-parse --show-toplevel 2>/dev/null); then
    ingit=1
    [ -n "$board" ] || board=$top/TICKETS.md
    bdir=$(dirname -- "$board")
    rel=$(git -C "$bdir" rev-parse --show-prefix 2>/dev/null || true)$(basename -- "$board")
    common=$(git -C "$gdir" rev-parse --path-format=absolute --git-common-dir)
  else
    ingit=0
    [ -n "$board" ] || board=./TICKETS.md
    echo "$prog: not in a git repo - using the local board only, nothing reserved across sessions" >&2
  fi

  m=0
  if [ -f "$board" ]; then m=$(max_ids "$kind" < "$board"); fi
  archive=${board%.md}-archive.md
  if [ "$archive" != "$board-archive.md" ] && [ -f "$archive" ]; then
    r=$(max_ids "$kind" < "$archive")
    if [ "$r" -gt "$m" ]; then m=$r; fi
  fi
  if [ -n "$runs" ]; then
    for f in "$runs"/run-*.md "$runs"/run.md; do
      [ -f "$f" ] || continue
      case $kind in
        RUN) r=$(echo "$f" | run_names | max_num) ;;
        W) r=$(code_rows < "$f" | max_num) ;;
        *) r=$(stage_rows < "$f" | max_num) ;;
      esac
      if [ "$r" -gt "$m" ]; then m=$r; fi
    done
    [ "$ingit" = 1 ] && rrel=$(git -C "$runs" rev-parse --show-prefix 2>/dev/null || true)
  fi

  if [ "$ingit" = 1 ]; then
    for ref in $(git -C "$gdir" for-each-ref --format='%(refname)' refs/heads refs/remotes); do
      r=$(git -C "$gdir" show "$ref:$rel" 2>/dev/null | max_ids "$kind")
      if [ "$r" -gt "$m" ]; then m=$r; fi
      case $rel in *.md)
        r=$(git -C "$gdir" show "$ref:${rel%.md}-archive.md" 2>/dev/null | max_ids "$kind")
        if [ "$r" -gt "$m" ]; then m=$r; fi ;;
      esac
      if [ -n "$runs" ]; then
        if [ "$kind" = RUN ]; then
          r=$(git -C "$top" ls-tree -r --name-only "$ref" -- "${rrel:-.}" 2>/dev/null | run_names | max_num)
        elif [ "$kind" = W ]; then
          r=$(git -C "$top" grep -h -E "$W_RE" "$ref" -- "${rrel}run-*.md" "${rrel}run.md" 2>/dev/null | code_rows | max_num)
        else
          r=$(git -C "$top" grep -h -E '^\| *[0-9]+ *\|' "$ref" -- "${rrel}run-*.md" "${rrel}run.md" 2>/dev/null | stage_rows | max_num)
        fi
        if [ "$r" -gt "$m" ]; then m=$r; fi
      fi
    done
    ids=$common/skillator/ids
    counter=$ids/$kind
  fi

  if [ "$ingit" = 0 ] || [ "$peek" = 1 ]; then
    if [ "$ingit" = 1 ] && [ -f "$counter" ]; then
      c=$(tr -dc 0-9 < "$counter")
      if [ -n "$c" ] && [ "$c" -gt "$m" ]; then m=$c; fi
    fi
    emit $((m + 1)) $((m + count))
    return 0
  fi

  mkdir -p "$ids"
  lock=$ids/$kind.lock
  stale=${NEXT_ID_STALE:-30}
  waited=0
  until mkdir "$lock" 2>/dev/null; do
    st=$(cat "$lock/stamp" 2>/dev/null | tr -dc 0-9)
    if { [ -n "$st" ] && [ $(($(now) - st)) -gt "$stale" ]; } ||
       { [ -z "$st" ] && [ "$waited" -gt "$stale" ]; }; then
      echo "$prog: breaking stale lock $lock" >&2
      rm -rf "$lock"
      continue
    fi
    [ "$waited" -gt $((stale * 2)) ] && die "lock $lock still held after ${waited}s"
    sleep 1
    waited=$((waited + 1))
  done
  now > "$lock/stamp"
  trap 'rm -rf "$lock"' EXIT INT TERM

  if [ -f "$counter" ]; then
    c=$(tr -dc 0-9 < "$counter")
    if [ -n "$c" ] && [ "$c" -gt "$m" ]; then m=$c; fi
  fi
  n=$((m + count))
  # Refused before the counter moves: an exhausted W must not burn numbers.
  if [ "$kind" = W ] && [ "$n" -gt "$W_MAX" ]; then
    rm -rf "$lock"; trap - EXIT INT TERM
    die "kind W exhausted: $n > $W_MAX (9999)"
  fi
  echo "$n" > "$counter.tmp.$$"
  mv -f "$counter.tmp.$$" "$counter"
  rm -rf "$lock"
  trap - EXIT INT TERM
  emit $((m + 1)) "$n"
}

selftest() {
  t=$(mktemp -d)
  trap 'rm -rf "$t"' EXIT
  g() { git -c user.name=selftest -c user.email=selftest@example.invalid -c core.hooksPath=/dev/null -c core.autocrlf=false "$@"; }
  fail() { echo "SELFTEST FAIL: $1" >&2; exit 1; }

  mkdir "$t/main" && cd "$t/main"
  g init -q -b main .
  printf '# Board\n\n- [x] A1 - one\n- [ ] A3 - three\n  - [ ] A3a - part\n- [ ] B2 - bug\n' > TICKETS.md
  g add TICKETS.md && g commit -q -m board
  g worktree add -q -b second "$t/second"

  a=$(sh "$me" A) || fail "first allocation errored"
  [ "$a" = 4 ] || fail "first allocation: want 4, got $a"
  b=$(cd "$t/second" && sh "$me" A) || fail "second allocation errored"
  [ "$b" != "$a" ] || fail "two worktrees both got A$a"
  [ "$b" = 5 ] || fail "second allocation: want 5, got $b"

  g worktree add -q -b far "$t/far"
  (cd "$t/far" && printf -- '- [ ] A20 - elsewhere\n' >> TICKETS.md && g commit -q -am far)
  c=$(sh "$me" A) || fail "allocation after far branch errored"
  [ "$c" = 21 ] || fail "higher id on another branch ignored: want 21, got $c"

  p1=$(sh "$me" --peek A); p2=$(sh "$me" --peek A)
  [ "$p1" = 22 ] && [ "$p2" = 22 ] || fail "--peek reserved or miscounted: $p1 $p2"

  common=$(git rev-parse --path-format=absolute --git-common-dir)
  mkdir -p "$common/skillator/ids/A.lock" && echo 0 > "$common/skillator/ids/A.lock/stamp"
  d=$(NEXT_ID_STALE=2 sh "$me" A 2>"$t/err") || fail "stale lock not recovered"
  [ "$d" = 22 ] || fail "after stale lock: want 22, got $d"
  grep -q 'stale lock' "$t/err" || fail "stale lock broken silently"
  [ ! -d "$common/skillator/ids/A.lock" ] || fail "lock left behind"

  q=$(sh "$me" A --peek) && [ "$q" = 23 ] || fail "--peek after KIND: want 23, got $q"
  q=$(sh "$me" A --peek) && [ "$q" = 23 ] || fail "--peek after KIND reserved: got $q"
  if sh "$me" A --bogus >/dev/null 2>&1; then fail "unknown flag accepted"; fi
  set +e; sh "$me" A ./no-such-board.md >/dev/null 2>"$t/err3"; rc=$?; set -e
  [ "$rc" = 2 ] || fail "missing board path: want exit 2, got $rc"
  grep -q 'no board' "$t/err3" || fail "missing board path: no message"
  q=$(sh "$me" --peek A) && [ "$q" = 23 ] || fail "missing board path reserved: got $q"

  e=$(sh "$me" B) && [ "$e" = 3 ] || fail "kind B: want 3, got $e"

  # F27: ids archived beside the board are never reused - in the working
  # tree, and on a ref where only the archive holds them.
  printf -- '## Bugs

- [x] B40 - archived
' > TICKETS-archive.md
  e=$(sh "$me" --peek B) && [ "$e" = 41 ] || fail "archive in tree ignored: want B41, got $e"
  rm TICKETS-archive.md
  (cd "$t/far" && printf -- '- [x] B60 - archived
' > TICKETS-archive.md && g add TICKETS-archive.md && g commit -q -m arch)
  e=$(sh "$me" --peek B) && [ "$e" = 61 ] || fail "archive on another ref ignored: want B61, got $e"
  f=$(sh "$me" RUN) && [ "$f" = 1 ] || fail "generic kind RUN: want 1, got $f"

  # --runs (F22): run files in the tree and on other refs raise RUN and S.
  mkdir .skillator
  printf '| # | stage |\n|---|---|\n| 1 | a |\n| 7 | b |\n' > .skillator/run-3-here.md
  (cd "$t/far" && mkdir -p .skillator && printf '| 12 | c |\n' > .skillator/run-5-there.md &&
    g add .skillator && g commit -q -m run)
  r=$(sh "$me" --runs .skillator RUN) && [ "$r" = 6 ] || fail "--runs RUN: want 6 (ref run-5), got $r"
  r=$(sh "$me" --runs .skillator --count 2 S | paste -sd, -) && [ "$r" = 13,14 ] ||
    fail "--runs --count 2 S: want 13,14 (ref row 12), got $r"
  r=$(cd "$t/second" && mkdir -p .skillator && sh "$me" --runs .skillator S) && [ "$r" = 15 ] ||
    fail "--runs S from another worktree: want 15, got $r"
  if sh "$me" --runs .skillator A >/dev/null 2>&1; then fail "--runs accepted kind A"; fi
  if sh "$me" --count 0 S >/dev/null 2>&1; then fail "--count 0 accepted"; fi

  # Kind W (F31): 4-char base-36 workflow codes, A = 0, never reused.
  set +e; sh "$me" W >/dev/null 2>"$t/errw"; rc=$?; set -e
  [ "$rc" = 2 ] && grep -q 'needs --runs' "$t/errw" || fail "W without --runs: want exit 2 + message, got $rc"
  # A cell that merely starts with 4 capitals is a stage name, not a code.
  printf '| 40 | ZZZZ cell only |   | - | - | - |\n' >> .skillator/run-3-here.md
  w=$(sh "$me" --runs .skillator W) && [ "$w" = AAAB ] || fail "W first code: want AAAB, got $w"
  w=$(cd "$t/second" && sh "$me" --runs .skillator W) && [ "$w" = AAAC ] ||
    fail "W from another worktree: want AAAC, got $w"
  (cd "$t/far" && printf '## Chain\n### AABA - stage 12 - c\nprompt: |\n  x\n' >> .skillator/run-5-there.md &&
    g commit -q -am chain)
  w=$(sh "$me" --runs .skillator W) && [ "$w" = AABB ] || fail "W code on another ref (AABA=36) ignored: want AABB, got $w"
  w1=$(sh "$me" --peek --runs .skillator W); w2=$(sh "$me" --peek --runs .skillator W)
  [ "$w1" = AABC ] && [ "$w2" = AABC ] || fail "W --peek reserved or miscounted: $w1 $w2"
  w=$(sh "$me" --runs .skillator --count 3 W | paste -sd, -) && [ "$w" = AABC,AABD,AABE ] ||
    fail "W --count 3: want AABC,AABD,AABE, got $w"
  # Decode carries: BAA9 = 36^3 + 35 = 46691, so next is BABA (46692).
  printf '## Chain\n### BAA9 - stage 7 - b\n' >> .skillator/run-3-here.md
  w=$(sh "$me" --runs .skillator W) && [ "$w" = BABA ] || fail "W decode/encode carry: want BABA after BAA9, got $w"
  # The top of the range: 9998 -> 9999, then refused without moving the counter.
  printf '### 9998 - stage 7 - top\n' >> .skillator/run-3-here.md
  w=$(sh "$me" --runs .skillator W) && [ "$w" = 9999 ] || fail "W round trip at the top: want 9999, got $w"
  set +e; sh "$me" --runs .skillator W >/dev/null 2>"$t/errw"; rc=$?; set -e
  [ "$rc" != 0 ] && grep -q exhausted "$t/errw" || fail "W past 9999 not refused (rc $rc)"
  [ "$(tr -dc 0-9 < "$common/skillator/ids/W")" = 1679615 ] || fail "W exhaustion moved the counter"

  mkdir "$t/plain" && printf -- '- [ ] A7 - x\n' > "$t/plain/TICKETS.md"
  h=$(cd "$t/plain" && GIT_CEILING_DIRECTORIES=$t sh "$me" A 2>"$t/err2")
  [ "$h" = 8 ] || fail "outside git: want 8, got $h"
  grep -q 'not in a git repo' "$t/err2" || fail "outside git: no stderr note"

  echo "ok - next-id.sh selftest passed (4, 5, 21, peek 22, stale lock -> 22, flag order, bad flag, missing board, B 3, archive B41/B61, RUN 1, runs RUN 6, runs S 13-15, W AAAB/AAAC/AABB/peek/count 3/BABA/9999/exhausted, no-git 8)"
}

if [ "${1:-}" = --selftest ]; then
  [ $# -eq 1 ] || usage
  me=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/$(basename -- "$0")
  selftest; exit 0
fi
# --peek in any position; any other flag is an error, never a board path.
peek=0 kind= board= npos=0 runs= count=1 want=
for a in "$@"; do
  if [ -n "$want" ]; then
    case $want in runs) runs=$a ;; count) count=$a ;; esac
    want=; continue
  fi
  case $a in
    --peek) peek=1 ;;
    --runs) want=runs ;;
    --count) want=count ;;
    -*) echo "$prog: unknown flag '$a'" >&2; usage ;;
    *) npos=$((npos + 1))
       case $npos in 1) kind=$a ;; 2) board=$a ;; *) usage ;; esac ;;
  esac
done
[ -n "$want" ] && { echo "$prog: --$want needs a value" >&2; usage; }
[ -n "$kind" ] || usage
if [ -n "$runs" ] && [ ! -d "$runs" ]; then die "no run dir at '$runs'" 2; fi
# A named board that is not there must never count as empty: that would hand
# out a low id and reserve it.
if [ -n "$board" ] && [ ! -f "$board" ]; then
  die "no board at '$board'" 2
fi
allocate "$peek" "$kind" "$board" "$runs" "$count"
