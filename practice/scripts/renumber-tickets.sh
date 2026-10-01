#!/bin/sh
# Renumber a merge source's colliding ticket IDs (F24). Two branches that each
# took "next free" from their own board both made A43; git keeps both lines and
# check-tickets.sh fails. Per tickets-zordon's collision rule the destination's
# A43 stays and the source's moves - this does the moving, inside the merge:
#
#   git merge --no-ff --no-commit <source>    # resolve every conflict first;
#                                             # TICKETS.md is take: both
#   sh renumber-tickets.sh [--dry-run] [board]   # default: <top>/TICKETS.md
#   git commit                                # the merge commit carries it
#   sh renumber-tickets.sh --selftest
#
# Collision: an ID on a source ticket line that the merge base does not have
# and the destination (HEAD) does, on a different line. A colliding parent
# takes the next free number from next-id.sh (beside this script) and its
# sub-parts move with it (A43a -> A110a); a colliding sub-part under a shared
# parent takes the next unused letter. The renamed line keeps " (was A43)".
# References are rewritten only on lines the SOURCE added (in S, not in the
# merge base, not in HEAD), in every file the source added or changed - the
# board, docs, run files, code comments. Destination lines are never touched,
# and commit messages are not rewritten. Prints `map: OLD -> NEW` and
# `renumbered: <path>:<line>` rows for the merge log; then every old ID still
# standing on a non-destination line as `unresolved:` and exits 1 if any.
set -e
prog=renumber-tickets.sh
die() { echo "$prog: $1" >&2; exit "${2:-1}"; }
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# Ticket IDs on ticket lines (same pattern as check-tickets.sh).
ids() { sed -n 's/^[[:space:]]*- \[.\][[:space:]]*\([A-Z][A-Z]*[0-9][0-9]*[a-z]*\)[[:space:]].*/\1/p'; }
# The ticket line carrying ID $1.
line_of() { grep -E "^[[:space:]]*- \[.\][[:space:]]*$1[[:space:]]" || true; }

# awk program: rewrite ID tokens on lines in the "added" set via map file.
# map rows: "OLD NEW" (full token, e.g. A43a A110a or A43 A110 for parents).
REWRITE='
function subst(s,   out, pre, tok, old, par, suf, nw) {
  out = ""
  while (match(s, /[A-Z]+[0-9]+[a-z]*/)) {
    pre = substr(s, 1, RSTART - 1); tok = substr(s, RSTART, RLENGTH)
    s = substr(s, RSTART + RLENGTH)
    nw = tok
    if (!(pre ~ /[A-Za-z0-9_]$/) && !(s ~ /^[A-Za-z0-9_]/)) {
      par = tok; sub(/[a-z]+$/, "", par); suf = substr(tok, length(par) + 1)
      if (tok in M) nw = M[tok]; else if (par in M) nw = M[par] suf
    }
    out = out pre nw
    if (nw != tok) changed = 1
  }
  return out s
}
FILENAME == mapf { M[$1] = $2; next }
FILENAME == addf { A[$0] = 1; next }
{
  changed = 0
  if ($0 in A) {
    line = $0; lead = ""
    if (board && match(line, /^[ \t]*- \[.\][ \t]*[A-Z]+[0-9]+[a-z]*/)) {
      lead = substr(line, 1, RLENGTH); line = substr(line, RLENGTH + 1)
      id = lead; sub(/^[ \t]*- \[.\][ \t]*/, "", id); hd = substr(lead, 1, length(lead) - length(id))
      par = id; sub(/[a-z]+$/, "", par)
      if ((id in M) || (par in M)) {
        nid = (id in M) ? M[id] : M[par] substr(id, length(par) + 1)
        lead = hd nid " (was " id ")"; changed = 1
      }
    }
    $0 = lead subst(line)
    if (changed) print FNR > rowsf
  }
  print
}'

renumber() {
  dry=$1 board=$2
  top=$(git rev-parse --show-toplevel 2>/dev/null) || die "not in a git repo"
  cd "$top"
  git rev-parse -q --verify MERGE_HEAD >/dev/null ||
    die "no merge in progress - run between 'git merge --no-commit <source>' and its commit"
  [ -z "$(git diff --name-only --diff-filter=U)" ] ||
    die "unresolved conflicts - resolve every path first (TICKETS.md: take: both)"
  [ -n "$board" ] || board=TICKETS.md
  [ -f "$board" ] || die "no board at '$board'" 2
  if grep -qE '^(<<<<<<<|=======|>>>>>>>)' "$board"; then die "conflict markers in $board"; fi
  rel=$(git ls-files --full-name -- "$board" | head -n 1); [ -n "$rel" ] || rel=$board

  M=$(git merge-base HEAD MERGE_HEAD) D=$(git rev-parse HEAD) S=$(git rev-parse MERGE_HEAD)
  t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
  for c in M D S; do eval "git show \"\$$c:$rel\"" > "$t/$c.board" 2>/dev/null || : > "$t/$c.board"; done
  ids < "$t/M.board" | sort -u > "$t/M.ids"
  ids < "$t/D.board" | sort -u > "$t/D.ids"

  # Colliding IDs, in source-board order.
  : > "$t/coll"
  for id in $(ids < "$t/S.board"); do
    grep -qx "$id" "$t/M.ids" && continue
    grep -qx "$id" "$t/D.ids" || continue
    [ "$(line_of "$id" < "$t/S.board")" = "$(line_of "$id" < "$t/D.board")" ] && continue
    echo "$id" >> "$t/coll"
  done
  if [ ! -s "$t/coll" ]; then echo "no colliding ticket IDs"; return 0; fi

  # Parents (no letter suffix) get new numbers per kind; sub-parts of a shared
  # parent get a new letter; sub-parts of a moved parent move with it.
  : > "$t/map"
  grep -vE '[a-z]$' "$t/coll" > "$t/par" || true
  for kind in $(sed 's/[0-9].*//' "$t/par" | sort -u); do
    n=$(grep -c "^$kind[0-9]" "$t/par")
    flag=; [ "$dry" = 1 ] && flag=--peek
    sh "$here/next-id.sh" $flag --count "$n" "$kind" "$board" > "$t/nums" || die "next-id.sh failed"
    grep "^$kind[0-9]" "$t/par" | paste -d' ' - "$t/nums" |
      while read -r old num; do echo "$old $kind$num"; done >> "$t/map"
  done
  for id in $(grep -E '[a-z]$' "$t/coll" || true); do
    par=${id%%[a-z]*}
    grep -q "^$par " "$t/map" && continue
    for l in a b c d e f g h i j k l m n o p q r s t u v w x y z; do
      cand=$par$l
      cat "$t/D.board" "$t/S.board" | ids | grep -qx "$cand" && continue
      cut -d' ' -f2 "$t/map" | grep -qx "$cand" && continue
      echo "$id $cand" >> "$t/map"; break
    done
  done
  while read -r old new; do echo "map: $old -> $new"; done < "$t/map"
  # Sub-parts that ride along with a moved parent, for the log.
  while read -r old new; do
    for sp in $(ids < "$t/S.board" | grep -E "^$old[a-z]+\$" || true); do
      grep -q "^$sp " "$t/map" || echo "map: $sp -> $new${sp#$old} (moves with $old)"
    done
  done < "$t/map"
  [ "$dry" = 1 ] && return 0

  # Rewrite source-added lines in every text file the source added or changed.
  git diff --numstat --no-renames "$M" "$S" | while IFS=$(printf '\t') read -r a b p; do
    [ "$a" = - ] && continue                        # binary
    [ -f "$p" ] || continue                         # deleted in the merge
    git show "$S:$p" > "$t/s" 2>/dev/null || continue
    { git show "$M:$p" 2>/dev/null; git show "$D:$p" 2>/dev/null; } > "$t/old" || true
    awk 'FILENAME==ARGV[1]{o[$0]=1;next} !($0 in o)' "$t/old" "$t/s" > "$t/add"
    : > "$t/rows"; isb=0; [ "$p" = "$rel" ] && isb=1
    awk -v mapf="$t/map" -v addf="$t/add" -v rowsf="$t/rows" -v board="$isb" \
      "$REWRITE" "$t/map" "$t/add" "$p" > "$t/out"
    if [ -s "$t/rows" ]; then
      cat "$t/out" > "$p"                           # keeps mode and line endings
      git add -- "$p"
      sed "s#^#renumbered: $p:#" "$t/rows"
    fi
  done

  # Every old ID still standing on a line HEAD does not have is a miss.
  cut -d' ' -f1 "$t/map" > "$t/old.ids"
  bad=0
  git diff --name-only --no-renames "$M" "$S" > "$t/paths"
  while IFS= read -r p; do
    [ -f "$p" ] || continue
    git show "$D:$p" > "$t/d" 2>/dev/null || : > "$t/d"
    awk -v idf="$t/old.ids" -v p="$p" '
      FILENAME==idf {O[$1]=1; next}
      FILENAME==ARGV[2] {d[$0]=1; next}
      !($0 in d) { s=$0; gsub(/\(was [A-Z]+[0-9]+[a-z]*\)/, "", s)
        while (match(s, /[A-Z]+[0-9]+[a-z]*/)) {
          pre=substr(s,1,RSTART-1); tok=substr(s,RSTART,RLENGTH); s=substr(s,RSTART+RLENGTH)
          par=tok; sub(/[a-z]+$/,"",par)
          if (pre ~ /[A-Za-z0-9_]$/ || s ~ /^[A-Za-z0-9_]/) continue
          if ((tok in O) || (par in O)) { print "unresolved: " p ":" FNR ": " $0; break } } }
    ' "$t/old.ids" "$t/d" "$p" > "$t/un" 2>/dev/null || true
    if [ -s "$t/un" ]; then cat "$t/un"; bad=1; fi
  done < "$t/paths"
  [ "$bad" = 0 ] || die "old IDs left on lines the destination does not have - fix by hand, log each"
}

selftest() {
  st=$(mktemp -d); trap 'rm -rf "$st"' EXIT
  g() { git -c user.name=t -c user.email=t@example.invalid -c core.hooksPath=/dev/null -c core.autocrlf=false "$@"; }
  fail() { echo "SELFTEST FAIL: $1" >&2; exit 1; }
  cd "$st" && g init -q -b main . && g config core.autocrlf false && mkdir docs src
  printf '# Board\n\n- [x] A1 - one\n- [ ] A2 - two\n' > TICKETS.md
  printf 'shared notes\n' > docs/notes.md
  g add . && g commit -q -m base
  g switch -q -c feat
  printf -- '- [ ] A3 - src three, after A2\n  - [ ] A3a - src part\n- [ ] A4 - src four, blocked by A3a\n  - [ ] A2a - src part of two\n' >> TICKETS.md
  printf 'src: A3 lands the parser, A3a its tests; A4 waits.\n' >> docs/notes.md
  printf '# see A4 for the follow-up\nx = 1\n' > src/mod.py
  g add . && g commit -q -m 'feat: A3 parser (A3a tests)'
  g switch -q main
  printf -- '- [ ] A3 - dest three\n- [ ] A4 - dest four, see A3\n  - [ ] A2a - dest part of two\n' >> TICKETS.md
  { printf 'dest: A3 is the exporter\n'; cat docs/notes.md; } > docs/n && mv docs/n docs/notes.md
  g commit -q -am 'main: A3 exporter'
  D=$(g rev-parse HEAD)
  g merge --no-ff --no-commit feat >/dev/null 2>&1 || true
  for n in 1 2 3; do g show ":$n:TICKETS.md" > "$st/b.$n"; done
  g merge-file -p --union "$st/b.2" "$st/b.1" "$st/b.3" > TICKETS.md && g add TICKETS.md
  if sh "$here/check-tickets.sh" TICKETS.md >/dev/null 2>&1; then fail "fixture has no duplicate"; fi
  out=$(sh "$here/$prog") || fail "renumber exited non-zero: $out"
  echo "$out" | grep -qx 'map: A3 -> A5' || fail "A3 not mapped to A5: $out"
  echo "$out" | grep -qx 'map: A4 -> A6' || fail "A4 not mapped to A6: $out"
  echo "$out" | grep -qx 'map: A2a -> A2b' || fail "shared-parent sub-part A2a not -> A2b: $out"
  echo "$out" | grep -qx 'map: A3a -> A5a (moves with A3)' || fail "sub-part not logged: $out"
  sh "$here/check-tickets.sh" TICKETS.md >/dev/null || fail "check-tickets still fails"
  grep -qx -- '- \[ \] A5 (was A3) - src three, after A2' TICKETS.md || fail "A5 line"
  grep -qx -- '  - \[ \] A5a (was A3a) - src part' TICKETS.md || fail "A5a line"
  grep -qx -- '- \[ \] A6 (was A4) - src four, blocked by A5a' TICKETS.md || fail "A6 cross-ref"
  grep -qx -- '  - \[ \] A2b (was A2a) - src part of two' TICKETS.md || fail "A2b line"
  grep -qx 'src: A5 lands the parser, A5a its tests; A6 waits.' docs/notes.md || fail "doc ref"
  grep -qx '# see A6 for the follow-up' src/mod.py || fail "code comment ref"
  for f in TICKETS.md docs/notes.md; do              # destination lines untouched
    g show "$D:$f" | while IFS= read -r l; do grep -qxF -- "$l" "$f" || { echo "lost: $l"; exit 1; }; done ||
      fail "destination line moved in $f"
  done
  g commit -q --no-edit
  [ "$(g log -1 --format=%s feat)" = 'feat: A3 parser (A3a tests)' ] || fail "commit message rewritten"
  echo "ok - $prog selftest passed (A3->A5, A3a->A5a, A4->A6, A2a->A2b, refs in board/doc/code, dest lines kept, check-tickets clean)"
}

case ${1:-} in
  --selftest) selftest ;;
  --dry-run) renumber 1 "${2:-}" ;;
  -*) die "usage: $prog [--dry-run] [board] | --selftest" 2 ;;
  *) renumber 0 "${1:-}" ;;
esac
