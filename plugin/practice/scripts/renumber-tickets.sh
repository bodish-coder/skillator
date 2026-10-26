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
# IDs in the archive beside the board (<board without .md>-archive.md, F27)
# count: an incoming ID the destination archived collides too, and next-id.sh
# reads the archive when it picks the free number. An ID only collides while
# the working board still holds it twice, so a second run (merge-smith ran it,
# then the commit hook runs it again) finds nothing and reserves nothing.
#
# Every git merge, not only merge-smith (F26) - tickets-zordon arms it once
# per clone, nothing committed:
#   sh renumber-tickets.sh --install      # idempotent; re-run to refresh
# It copies this script and next-id.sh to <git-common-dir>/skillator/bin and
# wires two things there:
#   - merge driver `tickets` for /TICKETS.md and /TICKETS-archive.md (via
#     .git/info/attributes + merge.tickets.driver): the plain three-way merge,
#     and when only both-sides-appended hunks conflict, their union. A ticket
#     both sides edited stays a real conflict.
#   - post-merge and pre-commit hooks running `--hook`: post-merge catches a
#     merge git committed on its own (`git pull`, clean `git merge`) and folds
#     the renumbering into that merge commit; pre-commit catches `git commit`
#     concluding a merge (hand-resolved conflicts, merge-smith's --no-commit).
#     pre-merge-commit is not used: git has not written MERGE_HEAD yet there.
# Not covered: `git pull --rebase` and cherry-pick (no MERGE_HEAD) and
# --no-verify; a clone that never ran --install - check-tickets.sh fails on
# the duplicate there, and renumber-tickets.sh is the fix.
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

# renumber <dry> <board> [made]: made=1 is the post-merge hook - the merge
# commit is HEAD already, so the destination is HEAD^1 and the source HEAD^2.
renumber() {
  dry=$1 board=$2 made=${3:-0}
  top=$(git rev-parse --show-toplevel 2>/dev/null) || die "not in a git repo"
  cd "$top"
  if [ "$made" = 1 ]; then D=$(git rev-parse HEAD^1) S=$(git rev-parse HEAD^2)
  else
    git rev-parse -q --verify MERGE_HEAD >/dev/null ||
      die "no merge in progress - run between 'git merge --no-commit <source>' and its commit"
    D=$(git rev-parse HEAD) S=$(git rev-parse MERGE_HEAD)
  fi
  [ -z "$(git diff --name-only --diff-filter=U)" ] ||
    die "unresolved conflicts - resolve every path first (TICKETS.md: take: both)"
  [ -n "$board" ] || board=TICKETS.md
  [ -f "$board" ] || die "no board at '$board'" 2
  if grep -qE '^(<<<<<<<|=======|>>>>>>>)' "$board"; then die "conflict markers in $board"; fi
  rel=$(git ls-files --full-name -- "$board" | head -n 1); [ -n "$rel" ] || rel=$board

  M=$(git merge-base "$D" "$S")
  t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
  for c in M D S; do eval "git show \"\$$c:$rel\"" > "$t/$c.board" 2>/dev/null || : > "$t/$c.board"; done
  # F27: the destination's archive owns its IDs too. Not the base's: M.ids means
  # "shared ticket", and an archived ID re-added on the source is a collision.
  arch=; case $rel in *.md) arch=${rel%.md}-archive.md ;; esac
  [ -n "$arch" ] && git show "$D:$arch" >> "$t/D.board" 2>/dev/null || :
  # ...and the source's: a ticket it added then archived still collides.
  [ -n "$arch" ] && git show "$S:$arch" >> "$t/S.board" 2>/dev/null || :
  ids < "$t/M.board" | sort -u > "$t/M.ids"
  ids < "$t/D.board" | sort -u > "$t/D.ids"
  # IDs the working board (and its archive) still holds twice: only these
  # still need moving, which makes a second run a no-op.
  warch=${board%.md}-archive.md
  { cat "$board"; [ "$warch" != "$board-archive.md" ] && [ -f "$warch" ] && cat "$warch"; } |
    ids | sort | uniq -d > "$t/W.dups" || :

  # Colliding IDs, in source-board order.
  : > "$t/coll"
  for id in $(ids < "$t/S.board" | awk '!seen[$0]++'); do
    grep -qx "$id" "$t/M.ids" && continue
    grep -qx "$id" "$t/D.ids" || continue
    [ "$(line_of "$id" < "$t/S.board")" = "$(line_of "$id" < "$t/D.board")" ] && continue
    grep -qx "$id" "$t/W.dups" || continue        # already moved
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
    : > "$t/rows"; isb=0; { [ "$p" = "$rel" ] || [ "$p" = "$arch" ]; } && isb=1
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

# git merge driver (%O %A %B): result into %A, exit 0 clean / 1 conflict.
# The plain three-way merge first; if it conflicts, the union of both sides -
# but only when every conflicting hunk is lines both sides ADDED (empty base
# section in diff3). A hunk that changes or deletes an existing line (edit vs
# edit, archive vs edit) is a real conflict and keeps its markers; so does a
# ticket the base already had that ends up on two lines.
merge_driver() {
  o=$1 a=$2 b=$3
  [ -f "$o" ] && [ -f "$a" ] && [ -f "$b" ] || die "--merge-driver wants %O %A %B" 2
  md=$(mktemp -d)
  cp "$a" "$md/ours"
  if git merge-file -q -L HEAD -L base -L incoming "$a" "$o" "$b"; then rm -rf "$md"; return 0; fi
  if ! git merge-file -p --diff3 "$md/ours" "$o" "$b" |
       awk '/^[|][|][|][|][|][|][|]( |$)/ { inb = 1; next }
            /^=======$/ { inb = 0; next } inb { bad = 1 } END { exit bad }'; then
    echo "$prog: a conflicting hunk changes existing lines (not just appends) - left conflicted" >&2
    rm -rf "$md"; return 1
  fi
  cp "$md/ours" "$md/u"
  git merge-file -q --union "$md/u" "$o" "$b" || :
  ids < "$o" | sort -u > "$md/base"
  ids < "$md/u" | sort | uniq -d > "$md/dups"
  if [ -n "$(comm -12 "$md/base" "$md/dups")" ]; then
    echo "$prog: both sides edited ticket(s) $(comm -12 "$md/base" "$md/dups" | paste -sd' ' -) - left conflicted" >&2
    rm -rf "$md"; return 1
  fi
  cat "$md/u" > "$a"; rm -rf "$md"; return 0
}

# Hooks. pre-commit: a merge being concluded by `git commit` (conflicts
# resolved by hand, or merge-smith's --no-commit) - MERGE_HEAD is set and the
# renumbering is staged into the commit about to be written. post-merge <squash>:
# a merge git committed on its own (`git pull`, `git merge` with no conflict) -
# renumber against HEAD^1/HEAD^2 and fold the result into that same merge
# commit (same parents, map appended to its message). pre-merge-commit is no
# use: git has not written MERGE_HEAD when it runs.
hook() {
  kind=$1 squash=${2:-0}
  top=$(git rev-parse --show-toplevel 2>/dev/null) || return 0
  cd "$top"
  [ -f TICKETS.md ] || return 0
  if [ "$kind" = post-merge ]; then
    [ "$squash" = 1 ] && return 0
    git rev-parse -q --verify HEAD^2 >/dev/null || return 0        # fast-forward
    git rev-parse -q --verify HEAD^3 >/dev/null && return 0        # octopus: by hand
    [ "$(git rev-parse HEAD^1)" = "$(git rev-parse -q --verify ORIG_HEAD)" ] || return 0
    d=HEAD^1 src=HEAD^2 made=1
  else
    git rev-parse -q --verify MERGE_HEAD >/dev/null || return 0
    [ -z "$(git diff --name-only --diff-filter=U)" ] || return 0   # git refuses the commit anyway
    d=HEAD src=MERGE_HEAD made=0
  fi
  base=$(git merge-base "$d" "$src") || return 0
  git diff --quiet "$base" "$src" -- TICKETS.md TICKETS-archive.md && return 0  # incoming left the board alone
  log=$(git rev-parse --path-format=absolute --git-common-dir)/skillator/renumber.log
  mkdir -p "$(dirname -- "$log")"
  set +e; out=$( (renumber 0 "" "$made") 2>&1 ); rc=$?; set -e
  [ "$out" = "no colliding ticket IDs" ] && return 0
  echo "$out" >&2
  { echo "== $(date '+%Y-%m-%d %H:%M:%S') $kind: $(git rev-parse --short "$src") into $(git rev-parse --short "$d")"
    echo "$out"; } >> "$log"
  if [ "$rc" != 0 ]; then
    if [ "$made" = 1 ]; then
      echo "$prog: merge committed with the renumbering staged but not folded in - fix the lines above, then git add them and git commit --amend --no-edit (log: $log)" >&2
    else
      echo "$prog: commit stopped - fix the lines above, git add them, commit again (log: $log)" >&2
    fi
    exit 1
  fi
  [ "$made" = 1 ] || return 0
  old=$(git rev-parse HEAD)
  new=$({ git cat-file commit HEAD | sed '1,/^$/d'
          printf '\nTicket IDs renumbered (renumber-tickets.sh):\n'
          echo "$out" | grep '^map: '; } |
        git commit-tree "$(git write-tree)" -p "$(git rev-parse HEAD^1)" -p "$(git rev-parse HEAD^2)")
  git update-ref -m "renumber-tickets: fold ticket renumbering into merge" HEAD "$new" "$old"
  echo "$prog: renumbering folded into merge commit $(git rev-parse --short HEAD)" >&2
}

# Arm this clone (idempotent): copy the scripts into the common git dir, set
# the merge driver, add the hooks. Nothing tracked is touched.
install() {
  top=$(git rev-parse --show-toplevel 2>/dev/null) || die "not in a git repo"
  cd "$top"
  common=$(git rev-parse --path-format=absolute --git-common-dir)
  bin=$common/skillator/bin
  mkdir -p "$bin"
  for f in "$prog" next-id.sh; do                  # re-run from bin/: nothing to copy
    if ! [ "$here/$f" -ef "$bin/$f" ]; then cp "$here/$f" "$bin/$f.tmp.$$"; mv -f "$bin/$f.tmp.$$" "$bin/$f"; fi
  done
  git config merge.tickets.name "TICKETS.md: union of appended tickets (skillator)"
  git config merge.tickets.driver "sh '$bin/$prog' --merge-driver %O %A %B"
  attrs=$(git rev-parse --path-format=absolute --git-path info/attributes)
  mkdir -p "$(dirname -- "$attrs")"; [ -f "$attrs" ] || : > "$attrs"
  for f in /TICKETS.md /TICKETS-archive.md; do
    grep -qxF "$f merge=tickets" "$attrs" || echo "$f merge=tickets" >> "$attrs"
  done
  hooks=$(git rev-parse --path-format=absolute --git-path hooks)
  case $hooks in
    "$common"/*) ;;
    *) echo "$prog: core.hooksPath is $hooks, outside this clone - hooks NOT installed; after a merge run renumber-tickets.sh by hand" >&2
       echo "armed: merge driver only"; return 0 ;;
  esac
  mkdir -p "$hooks"
  mark='# skillator: renumber-tickets (F26)'
  line="sh '$bin/$prog' --hook \"\$(basename -- \"\$0\")\" \"\$@\" || exit 1  $mark"
  for h in post-merge pre-commit; do
    f=$hooks/$h
    if [ -f "$f" ] && grep -qF "$mark" "$f"; then
      awk -v m="$mark" -v l="$line" 'index($0, m) { print l; next } { print }' "$f" > "$f.tmp.$$"
    elif [ -x "$f" ] && head -n 1 "$f" | grep -qE '^#!.*[/ ](sh|bash|dash|ksh|zsh)([[:space:]]|$)'; then
      # someone else's shell hook: our line runs first
      awk -v l="$line" 'NR == 1 && /^#!/ { print; print l; next } NR == 1 { print l } { print }' "$f" > "$f.tmp.$$"
    elif [ -f "$f" ]; then
      # not a shell hook (python, node, a binary), or one switched off with
      # chmod -x: chain to it, never edit it, and run it only if executable
      mv -f "$f" "$f.skillator-orig"
      printf '#!/bin/sh\n%s\n[ -x "$0.skillator-orig" ] || exit 0\nexec "$0.skillator-orig" "$@"\n' "$line" > "$f.tmp.$$"
    else
      printf '#!/bin/sh\n%s\n' "$line" > "$f.tmp.$$"
    fi
    mv -f "$f.tmp.$$" "$f"; chmod +x "$f"
  done
  echo "armed: merge driver 'tickets' + post-merge/pre-commit hooks in $hooks"
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
  ( selftest_pull ) || exit 1
}

# F26: real `git pull`s between clones of one remote, hooks and driver live.
selftest_pull() {
  w=$(mktemp -d); trap 'rm -rf "$w"' EXIT
  export HOME="$w" GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL="$w/gitconfig"
  git config --global user.name t; git config --global user.email t@example.invalid
  git config --global core.autocrlf false; git config --global init.defaultBranch main
  git config --global pull.rebase false
  fail() { echo "SELFTEST FAIL (pull): $1" >&2; exit 1; }
  ck() { sh "$here/check-tickets.sh" TICKETS.md >/dev/null 2>&1; }
  push() { git commit -qam "$1" && git push -q origin main 2>/dev/null; }
  pull() { git pull -q --no-edit >/dev/null 2>&1; }
  ed() { sed "$1" TICKETS.md > "$w/ed" && cat "$w/ed" > TICKETS.md; }
  cd "$w" && git init -q --bare remote.git && git clone -q remote.git alice 2>/dev/null && cd alice
  printf '# TICKETS\n\n## Bugs\n\n- [ ] B1 - one\n\n## Features\n\n- [ ] F1 - feat one\n' > TICKETS.md
  printf 'notes\n' > notes.md; printf 'x\n' > other.txt
  git add . && git commit -qm base && git push -q origin main 2>/dev/null
  for c in bob carol; do git clone -q "$w/remote.git" "$w/$c" 2>/dev/null; done
  cd "$w/bob"
  printf '#!/bin/sh\necho theirs > .git/theirs-ran\n' > .git/hooks/pre-commit
  sh "$here/$prog" --install >/dev/null && sh "$here/$prog" --install >/dev/null || fail "--install errored"
  for h in post-merge pre-commit; do
    [ "$(grep -c 'skillator: renumber-tickets' ".git/hooks/$h")" = 1 ] || fail "$h: install not idempotent"
  done
  sed -n 2p .git/hooks/pre-commit | grep -q 'renumber-tickets' || fail "our line not first in an existing hook"
  grep -q 'theirs-ran' .git/hooks/pre-commit || fail "existing hook body lost"
  [ "$(grep -c merge=tickets .git/info/attributes)" = 2 ] || fail "attributes not idempotent"

  # 1. Both append at the end of Features: a textual conflict without the
  # driver; with it, the pull ends renumbered with no manual step.
  cd "$w/alice"; printf -- '- [ ] F2 - alice two\n  - [ ] F2a - alice part\n' >> TICKETS.md
  printf 'alice: F2 then F2a\n' >> notes.md; push 'alice F2'
  cd "$w/bob"; printf -- '- [ ] F2 - bob two\n' >> TICKETS.md; git commit -qam 'bob F2'
  pull || fail "1: conflicting pull did not finish on its own"
  ck || fail "1: check-tickets fails after pull"
  grep -qx -- '- \[ \] F2 - bob two' TICKETS.md || fail "1: receiving side's F2 moved"
  grep -qx -- '- \[ \] F3 (was F2) - alice two' TICKETS.md || fail "1: incoming F2 not F3"
  grep -qx -- '  - \[ \] F3a (was F2a) - alice part' TICKETS.md || fail "1: sub-part not carried"
  grep -qx 'alice: F3 then F3a' notes.md || fail "1: reference not rewritten"
  [ -z "$(git status --porcelain)" ] || fail "1: tree left dirty"
  git rev-parse -q --verify HEAD^2 >/dev/null || fail "1: merge commit lost its second parent"
  git log -1 --format=%B | grep -qx 'map: F2 -> F3' || fail "1: map not in the merge commit"
  git show HEAD:TICKETS.md | grep -q 'F3 (was F2)' || fail "1: renumbering not in the merge commit"
  git push -q origin main 2>/dev/null

  # 2. A merge git resolves cleanly (different sections) that still leaves a
  # duplicate; the receiving side's archive holds B9, so an incoming B9
  # collides too and the free numbers start past it.
  cd "$w/alice"; pull
  printf -- '- [ ] B2 - alice bug\n- [ ] B9 - alice nine, after B2\n' > "$w/line"
  ed '/^- \[ \] B1 - one$/r '"$w/line"
  printf 'alice: B2 is the crash\n' >> notes.md; push 'alice B2, B9'
  cd "$w/bob"
  printf -- '# Archive\n\n## Bugs\n\n- [x] B9 - old, archived\n' > TICKETS-archive.md; git add TICKETS-archive.md
  printf -- '- [ ] F7 - bob seven, see B2\n- [ ] B2 - bob bug\n' >> TICKETS.md
  git commit -qam 'bob B2, archive B9'; git fetch -q
  git merge-tree --write-tree HEAD origin/main >/dev/null 2>&1 || fail "2: fixture conflicts textually"
  pull || fail "2: clean pull failed"
  ck || fail "2: check-tickets fails after clean pull"
  grep -qx -- '- \[ \] B2 - bob bug' TICKETS.md || fail "2: receiving side's B2 moved"
  grep -qx -- '- \[ \] B10 (was B2) - alice bug' TICKETS.md || fail "2: incoming B2 not B10 (archive's B9 ignored?)"
  grep -qx -- '- \[ \] B11 (was B9) - alice nine, after B10' TICKETS.md ||
    fail "2: incoming B9, archived on the receiving side, not moved to B11"
  grep -qx 'alice: B10 is the crash' notes.md || fail "2: reference not rewritten"
  grep -qx -- '- \[ \] F7 - bob seven, see B2' TICKETS.md || fail "2: receiving side's reference moved"
  git push -q origin main 2>/dev/null

  # 2b. An ID already archived at the merge base, re-added by a stale allocator
  # on the incoming side, still collides (the base's archive is not "shared").
  cd "$w/alice"; pull; printf -- '- [ ] B9 - alice stale nine\n' > "$w/line"
  ed '/^- \[ \] B1 - one$/r '"$w/line"; push 'alice stale B9'
  cd "$w/bob"; printf -- '- [ ] F8 - bob eight\n' >> TICKETS.md; git commit -qam 'bob F8'
  pull || fail "2b: pull failed"
  ck || fail "2b: archived-at-base B9 re-added and not renumbered"
  grep -qx -- '- \[ \] B12 (was B9) - alice stale nine' TICKETS.md || fail "2b: incoming B9 not B12"
  git push -q origin main 2>/dev/null

  # 3. A real conflict in another file: the user resolves it and commits;
  # pre-commit renumbers into that commit.
  cd "$w/alice"; pull
  printf -- '- [ ] F5 - alice five\n' >> TICKETS.md; printf 'alice\n' > other.txt; push 'alice F5'
  cd "$w/bob"; printf -- '- [ ] F5 - bob five\n' >> TICKETS.md; printf 'bob\n' > other.txt; git commit -qam 'bob F5'
  if pull; then fail "3: other.txt did not conflict"; fi
  printf 'both\n' > other.txt; git add other.txt
  git commit -q --no-edit >/dev/null 2>&1 || fail "3: commit after resolving failed"
  ck || fail "3: check-tickets fails after hand-resolved merge"
  git show HEAD:TICKETS.md | grep -q '(was F5) - alice five' || fail "3: not renumbered in the commit"
  [ -z "$(git status --porcelain)" ] || fail "3: tree left dirty"
  git push -q origin main 2>/dev/null

  # 4. merge-smith's way: --no-commit, renumber by hand, commit - the hook
  # then finds nothing and reserves no number.
  cd "$w/alice"; pull; printf -- '- [ ] F20 - alice twenty\n' >> TICKETS.md; push 'alice F20'
  cd "$w/bob"; printf -- '- [ ] F20 - bob twenty\n' >> TICKETS.md; git commit -qam 'bob F20'; git fetch -q
  git merge -q --no-commit origin/main >/dev/null 2>&1 || :
  sh "$here/$prog" | grep -q 'map: F20 -> ' || fail "4: manual run did not renumber"
  before=$(sh "$here/next-id.sh" --peek F)
  git commit -q --no-edit 2> "$w/c4" || fail "4: commit failed"
  if grep -q 'map:' "$w/c4"; then fail "4: hook renumbered twice"; fi
  [ "$(sh "$here/next-id.sh" --peek F)" = "$before" ] || fail "4: second run reserved a number"
  ck || fail "4: check-tickets"
  git push -q origin main 2>/dev/null

  # 5. Both sides edit the same ticket: the driver keeps the conflict.
  cd "$w/alice"; pull; ed 's/^- \[ \] B1 /- [x] B1 /'; push 'alice closes B1'
  cd "$w/bob"; ed 's/^- \[ \] B1 /- [~] B1 /'; git commit -qam 'bob takes B1'
  if pull; then fail "5: same-ticket edit merged silently"; fi
  grep -q '^<<<<<<<' TICKETS.md || fail "5: no conflict markers"
  git merge --abort

  # 5b. The driver unions only pure appends: archive-vs-edit and edit-vs-edit
  # of a line with no ID stay conflicted; append-vs-append still unions.
  drv() { printf %b "$2" > "$w/o"; printf %b "$3" > "$w/a"; printf %b "$4" > "$w/b"
          sh "$here/$prog" --merge-driver "$w/o" "$w/a" "$w/b" 2>/dev/null; }
  if drv x '- [ ] B1 - one\n- [x] B2 - two\n- [ ] B3 - three\n' '- [ ] B1 - one\n- [ ] B3 - three\n' \
       '- [ ] B1 - one\n- [x] B2 - two, edited\n- [ ] B3 - three\n'; then fail "5b: archive vs edit unioned"; fi
  if drv x '# T\nintro\n' '# T\nintro by alice\n' '# T\nintro by bob\n'; then fail "5b: line edit unioned"; fi
  drv x '- [ ] B1 - one\n' '- [ ] B1 - one\n- [ ] B2 - a\n' '- [ ] B1 - one\n- [ ] B3 - b\n' ||
    fail "5b: pure appends not unioned"
  grep -q 'B2 - a' "$w/a" && grep -q 'B3 - b' "$w/a" || fail "5b: union lost a side"

  # 5c. A non-shell hook is chained to, never edited.
  git init -q "$w/hk" && cd "$w/hk"
  printf '#!/usr/bin/env python3\nprint("theirs")\n' > .git/hooks/pre-commit
  sh "$here/$prog" --install >/dev/null && sh "$here/$prog" --install >/dev/null || fail "5c: install errored"
  [ "$(cat .git/hooks/pre-commit.skillator-orig)" = "$(printf '#!/usr/bin/env python3\nprint("theirs")')" ] ||
    fail "5c: python hook edited or lost"
  grep -qx 'exec "$0.skillator-orig" "$@"' .git/hooks/pre-commit || fail "5c: wrapper does not chain"
  [ "$(grep -c 'skillator: renumber-tickets' .git/hooks/pre-commit)" = 1 ] || fail "5c: not idempotent"

  # 5d. The incoming side added a ticket and archived it; the receiving side
  # took the same ID on its board: the archived line is the one renumbered.
  cd "$w/bob"; git fetch -q; git reset -q --hard '@{u}'
  cd "$w/alice"; pull; printf -- '- [x] F30 - alice thirty\n' >> TICKETS-archive.md; push 'alice F30, archived'
  cd "$w/bob"; printf -- '- [ ] F30 - bob thirty\n' >> TICKETS.md; git commit -qam 'bob F30'
  pull || fail "5d: pull failed"
  ck || fail "5d: source-archived F30 left duplicated"
  grep -q '(was F30) - alice thirty' TICKETS-archive.md || fail "5d: archived line not renumbered"
  grep -qx -- '- \[ \] F30 - bob thirty' TICKETS.md || fail "5d: receiving side's F30 moved"
  git push -q origin main 2>/dev/null

  # 6. A teammate who never armed: the duplicate merges, check-tickets catches it.
  cd "$w/carol"; pull
  cd "$w/alice"; pull; printf -- '- [ ] B50 - alice bug\n' > "$w/line"; ed '/^- \[.\] B1 /r '"$w/line"; push 'alice B50'
  cd "$w/carol"; printf -- '- [ ] B50 - carol bug\n' >> TICKETS.md; git commit -qam 'carol B50'
  pull || fail "6: unarmed clean pull failed"
  if ck; then fail "6: unarmed clone's duplicate not caught by check-tickets"; fi
  echo "ok - $prog pull selftest passed (install idempotent; conflicting pull F2->F3+F3a; clean pull B2->B10, archived B9->B11; archived-at-base B9->B12; hand-resolved commit; merge-smith rerun no-op; same-ticket edit stays conflicted; only pure appends unioned; non-shell hook chained; source-archived ID renumbered; unarmed clone caught)"
}

case ${1:-} in
  --selftest) selftest ;;
  --dry-run) renumber 1 "${2:-}" ;;
  --install) install ;;
  --hook) shift; hook "$@" ;;
  --merge-driver) shift; merge_driver "$@" ;;
  -*) die "usage: $prog [--dry-run] [board] | --install | --hook <hook-name> [args] | --merge-driver %O %A %B | --selftest" 2 ;;
  *) renumber 0 "${1:-}" ;;
esac
