#!/bin/sh
# Keep TICKETS.md small (F27): closed tickets ([x] done, [-] cancelled) that
# have stayed closed for more than N days (default 14) move to
# TICKETS-archive.md beside the board, which is committed like the board.
# Sessions read only TICKETS.md; next-id.sh/.ps1 and check-tickets.sh read
# both, so an archived number is never reused and old IDs still grep.
#
#   archive-tickets.sh [--dry-run] [--days N] [board]
#   archive-tickets.sh --selftest
#
# board defaults to the current git repo's top-level TICKETS.md; the archive
# is always <board without .md>-archive.md.
#
# What moves: a top-level ticket line, with its continuation lines and every
# indented sub-part. A parent stays until it AND all its sub-parts are closed
# and old enough, then they move together; a sub-part never moves alone.
#
# Closing date: lines carry no date, so it comes from git. The history of the
# board is walked newest first and a ticket's date is the oldest commit in the
# unbroken run of commits, ending at HEAD, in which its status is [x] or [-]:
# the commit that flipped it. Later text edits do not reset it. A ticket closed
# only in the working tree, or with no history at all, counts as closed now.
#
# Nothing is deleted: every moved line is written to the archive, appended to
# the archive's section of the same name. Runs check-tickets.sh before and
# after. Write it during a drain (tickets-zordon), then commit both files.
set -e

prog=archive-tickets.sh
die() { echo "$prog: $1" >&2; exit "${2:-1}"; }
usage() {
  echo "usage: $prog [--dry-run] [--days N] [board]" >&2
  echo "       $prog --selftest" >&2
  exit 2
}
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# Print "<id> <closed-since epoch>" for every ticket closed on the board.
closed_since() {
  _board=$1 _top=$2 _rel=$3 _now=$4
  {
    echo "@@WORK $_now"
    cat "$_board"
    git -C "$_top" log --format='%H %ct' -- "$_rel" | while read -r h ct; do
      echo "@@COMMIT $ct"
      git -C "$_top" show "$h:$_rel" 2>/dev/null || true
    done
  } | awk '
    function tid(l,   m) {
      if (match(l, /^[ \t]*- \[.\][ \t]*[A-Z]+[0-9]+[a-z]*/)) {
        m = substr(l, 1, RLENGTH); sub(/^[ \t]*- \[.\][ \t]*/, "", m); return m
      }
      return ""
    }
    function flush(   id) {
      if (stage == "") return
      if (stage == "work") {
        for (id in st) if (st[id] == "x" || st[id] == "-") { alive[id] = 1; since[id] = ct }
      } else {
        for (id in alive) {
          if (st[id] == "x" || st[id] == "-") since[id] = ct
          else delete alive[id]
        }
      }
      for (id in st) delete st[id]
    }
    /^@@WORK / { flush(); stage = "work"; ct = $2; next }
    /^@@COMMIT / { flush(); stage = "commit"; ct = $2; next }
    { id = tid($0); if (id != "") { s = $0; sub(/^[ \t]*- \[/, "", s); st[id] = substr(s, 1, 1) } }
    END { flush(); for (id in since) print id, since[id] }
  '
}

# Split the board. Reads the since-table (file $1) and cutoff (epoch $2) and
# the board on stdin; writes $3.keep (new board), $3.move (moved lines, each
# prefixed "<section>\t"), and prints "moved <ids...>" lines on stdout.
split_board() {
  awk -v sincef="$1" -v cutoff="$2" -v out="$3" '
    BEGIN {
      while ((getline l < sincef) > 0) { split(l, p, " "); since[p[1]] = p[2] }
      sect = ""; n = 0
    }
    function tid(l,   m) {
      if (match(l, /^[ \t]*- \[.\][ \t]*[A-Z]+[0-9]+[a-z]*/)) {
        m = substr(l, 1, RLENGTH); sub(/^[ \t]*- \[.\][ \t]*/, "", m); return m
      }
      return ""
    }
    { line[++n] = $0 }
    END {
      g = 0
      for (i = 1; i <= n; i++) {
        l = line[i]; id = tid(l)
        if (id != "" && l ~ /^- /) {            # top-level ticket: new group
          g++; gstart[g] = i; gsect[g] = sect; gids[g] = id; gok[g] = 1
          grp[i] = g; cur = g
        } else if (l ~ /^#/) {
          if (l ~ /^## /) { sect = substr(l, 4) }
          cur = 0
        } else if (l ~ /^[ \t]*$/) {
          cur = 0
        } else if (cur) {                        # sub-part or continuation
          grp[i] = cur
          if (id != "") gids[cur] = gids[cur] " " id
        }
        if (grp[i] && id != "") {
          s = l; sub(/^[ \t]*- \[/, "", s); s = substr(s, 1, 1)
          if (!((s == "x" || s == "-") && (id in since) && since[id] + 0 <= cutoff + 0)) gok[grp[i]] = 0
        }
      }
      for (k = 1; k <= g; k++) if (gok[k]) print "moved " gids[k]
      dropped = 0; lastblank = 1
      for (i = 1; i <= n; i++) {
        if (grp[i] && gok[grp[i]]) {
          printf "%s\t%s\n", gsect[grp[i]], line[i] > (out ".move")
          dropped = 1; continue
        }
        blank = (line[i] ~ /^[ \t]*$/)
        if (blank && lastblank && dropped) { squeezed++; continue }
        print line[i] > (out ".keep")
        lastblank = blank; if (!blank) dropped = 0
      }
      printf "%d\n", squeezed + 0 > (out ".squeezed")
    }
  '
}

# Merge moved lines ($1, "<section>\t<line>") into the archive ($2, may be
# missing) and print the new archive.
merge_archive() {
  awk -v movef="$1" -v hasarch="$3" '
    BEGIN {
      ns = 0
      if (hasarch == 1) {
        while ((getline l < ARGV[1]) > 0) {
          if (l ~ /^## /) { cur = substr(l, 4); if (!(cur in idx)) { idx[cur] = ++ns; name[ns] = cur }; continue }
          if (ns == 0) { head[++nh] = l; continue }
          k = idx[cur]; body[k, ++nb[k]] = l
        }
      } else {
        head[++nh] = "# TICKETS archive"
        head[++nh] = ""
        head[++nh] = "Closed tickets moved out of TICKETS.md by practice/scripts/archive-tickets.sh"
        head[++nh] = "once they had stayed closed ([x] or [-]) for 14+ days. Sessions read only"
        head[++nh] = "TICKETS.md; grep here for an old ID. IDs are permanent: next-id and"
        head[++nh] = "check-tickets read this file too, so a number here is never reused."
        head[++nh] = ""
      }
      while ((getline l < movef) > 0) {
        t = index(l, "\t"); s = substr(l, 1, t - 1); v = substr(l, t + 1)
        if (s == "") s = "Other"
        if (!(s in idx)) { idx[s] = ++ns; name[ns] = s }
        k = idx[s]
        while (nb[k] > 0 && body[k, nb[k]] ~ /^[ \t]*$/) nb[k]--
        if (nb[k] == 0) body[k, ++nb[k]] = ""
        body[k, ++nb[k]] = v
      }
      while (nh > 0 && head[nh] ~ /^[ \t]*$/) nh--
      for (i = 1; i <= nh; i++) print head[i]
      for (k = 1; k <= ns; k++) {
        while (nb[k] > 0 && body[k, nb[k]] ~ /^[ \t]*$/) nb[k]--
        print ""; print "## " name[k]
        for (i = 1; i <= nb[k]; i++) print body[k, i]
      }
      exit
    }
  ' "$2"
}

run() {
  dry=$1 days=$2 board=$3
  case $days in ''|*[!0-9]*) die "--days wants a whole number, got '$days'" 2 ;; esac
  if [ -z "$board" ]; then
    top=$(git rev-parse --show-toplevel 2>/dev/null) || die "not in a git repo - closing dates come from git; name a board inside one" 2
    board=$top/TICKETS.md
  fi
  [ -f "$board" ] || die "no board at '$board'" 2
  bdir=$(CDPATH= cd -- "$(dirname -- "$board")" && pwd)
  board=$bdir/$(basename -- "$board")
  top=$(git -C "$bdir" rev-parse --show-toplevel 2>/dev/null) || die "board is not in a git repo - closing dates come from git" 2
  rel=$(git -C "$bdir" rev-parse --show-prefix)$(basename -- "$board")
  archive=${board%.md}-archive.md

  sh "$here/check-tickets.sh" "$board" >/dev/null || die "check-tickets.sh fails on the board - fix that first"

  w=$(mktemp -d)
  trap 'rm -rf "$w"' EXIT INT TERM
  now=$(date +%s)
  cutoff=$((now - days * 86400))
  closed_since "$board" "$top" "$rel" "$now" > "$w/since"
  : > "$w/out.move"; : > "$w/out.keep"
  split_board "$w/since" "$cutoff" "$w/out" < "$board" > "$w/moved"

  nmoved=$(awk '{n += NF - 1} END {print n + 0}' "$w/moved")
  if [ "$nmoved" = 0 ]; then
    echo "$prog: nothing closed for more than $days days - board unchanged"
    return 0
  fi
  if [ "$dry" = 1 ]; then
    echo "$prog: --dry-run - would move $nmoved ticket(s) to $(basename -- "$archive"):"
    while read -r _ ids; do
      for id in $ids; do
        s=$(awk -v id="$id" '$1 == id {print $2}' "$w/since")
        d=$(date -d "@$s" +%Y-%m-%d 2>/dev/null || echo "@$s")
        echo "  $id  closed $d"
      done
    done < "$w/moved"
    return 0
  fi

  has=0; [ -f "$archive" ] && has=1
  merge_archive "$w/out.move" "${archive}" "$has" > "$w/archive.new"
  b0=$(wc -l < "$board" | tr -d ' ')
  a0=0; [ "$has" = 1 ] && a0=$(wc -l < "$archive" | tr -d ' ')
  mv=$(wc -l < "$w/out.move" | tr -d ' ')
  sq=$(cat "$w/out.squeezed")
  # Archive first: a crash between the two writes leaves an ID in both files,
  # which check-tickets.sh reports as a duplicate - never a lost ticket.
  cp "$w/archive.new" "$archive"
  cp "$w/out.keep" "$board"
  b1=$(wc -l < "$board" | tr -d ' ')
  a1=$(wc -l < "$archive" | tr -d ' ')
  sh "$here/check-tickets.sh" "$board" >/dev/null || die "check-tickets.sh fails after archiving - inspect $board and $archive"
  echo "$prog: moved $nmoved ticket(s), $mv line(s) to $(basename -- "$archive")"
  echo "  board   $b0 -> $b1 lines ($b0 = $b1 kept + $mv moved + $sq blank squeezed)"
  echo "  archive $a0 -> $a1 lines"
}

selftest() {
  t=$(mktemp -d)
  trap 'rm -rf "$t"' EXIT
  me=$here/$prog
  g() { git -c user.name=selftest -c user.email=selftest@example.invalid -c core.hooksPath=/dev/null -c core.autocrlf=false "$@"; }
  fail() { echo "SELFTEST FAIL: $1" >&2; exit 1; }
  old=$(( $(date +%s) - 40 * 86400 ))

  mkdir "$t/r" && cd "$t/r"
  g init -q -b main .
  cat > TICKETS.md <<'EOF'
# TICKETS

## Bugs

- [x] B1 - old done
- [ ] B2 - open
- [-] B3 - old cancelled

## Features

- [x] F1 - old parent, all parts old
  - [x] F1a - part
  - [-] F1b - part
- [x] F2 - old parent, one part closed recently
  - [x] F2a - part
  - [ ] F2b - part
- [x] F3 - old, with a continuation line
   continuation of F3
- [>] F4 - deferred, old
EOF
  GIT_COMMITTER_DATE="@$old" GIT_AUTHOR_DATE="@$old" g add TICKETS.md
  GIT_COMMITTER_DATE="@$old" GIT_AUTHOR_DATE="@$old" g commit -q -m old
  # B1 text edited recently: still old (flip date, not last touch). F2b closed
  # recently: F2 group stays. B3 reopened then re-closed recently: stays.
  sed -e 's/old done/old done, text edited later/' -e 's/\[ \] F2b/[x] F2b/' \
      -e 's/\[-\] B3/[ ] B3/' TICKETS.md > x && mv x TICKETS.md
  g commit -q -am recent
  sed -e 's/\[ \] B3/[-] B3/' TICKETS.md > x && mv x TICKETS.md
  g commit -q -am reclose
  # Closed only in the working tree: stays.
  printf -- '- [x] B9 - closed, uncommitted\n' >> TICKETS.md
  before=$(cat TICKETS.md)

  out=$(sh "$me" --dry-run) || fail "dry run errored"
  [ "$(cat TICKETS.md)" = "$before" ] || fail "--dry-run wrote the board"
  [ ! -f TICKETS-archive.md ] || fail "--dry-run wrote the archive"
  for id in B1 F1 F1a F1b F3; do echo "$out" | grep -q "  $id " || fail "dry run omits $id: $out"; done
  for id in B2 B3 B9 F2 F2a F4; do echo "$out" | grep -q "  $id " && fail "dry run would move $id: $out"; done

  b0=$(wc -l < TICKETS.md | tr -d ' ')
  sh "$me" > "$t/out" || fail "real run errored: $(cat "$t/out")"
  for id in B1 F1 F1a F1b F3; do
    grep -q "\] $id " TICKETS.md && fail "$id still on the board"
    grep -q "\] $id " TICKETS-archive.md || fail "$id missing from the archive"
  done
  grep -q '^   continuation of F3$' TICKETS-archive.md || fail "continuation line lost"
  for id in B2 B3 B9 F2 F2a F2b F4; do grep -q "\] $id " TICKETS.md || fail "$id left the board"; done
  ka=$(grep -c '^ *- \[' TICKETS.md); kb=$(grep -c '^ *- \[' TICKETS-archive.md)
  [ "$ka" = 7 ] && [ "$kb" = 5 ] || fail "ticket lines: want 7 + 5, got $ka + $kb"
  b1=$(wc -l < TICKETS.md | tr -d ' ')
  sq=$(sed -n 's/.*+ \([0-9]*\) blank squeezed.*/\1/p' "$t/out")
  [ $((b1 + 6 + sq)) = "$b0" ] || fail "line count: $b0 != $b1 + 6 moved + $sq squeezed ($(cat "$t/out"))"
  grep -q '^## Bugs$' TICKETS-archive.md && grep -q '^## Features$' TICKETS-archive.md || fail "archive sections missing"
  grep -q '^## Bugs$' TICKETS.md || fail "board section heading lost"
  grep -n '' TICKETS.md | awk -F: 'p == "" && $2 == "" {exit 1} {p = $2}' || fail "double blank line left on the board"

  # Second run appends into the existing archive sections, never duplicates.
  g add -A && g commit -q -m archived
  printf -- '- [x] A1 - closed long ago, appended late\n' > x && cat TICKETS.md x > y && mv y TICKETS.md
  GIT_COMMITTER_DATE="@$old" GIT_AUTHOR_DATE="@$old" g commit -q -am a1
  sh "$me" >/dev/null || fail "second run errored"
  [ "$(grep -c '^## Bugs$' TICKETS-archive.md)" = 1 ] || fail "second run duplicated a section"
  grep -q '\] A1 ' TICKETS-archive.md || fail "second run did not move A1"
  out=$(sh "$me" --days 100000) || fail "big --days errored"
  echo "$out" | grep -q 'nothing closed' || fail "--days not honoured: $out"
  sh "$here/check-tickets.sh" TICKETS.md >/dev/null || fail "check-tickets fails after archiving"

  # A board check-tickets rejects is never archived.
  printf -- '- [ ] B2 - duplicate\n' >> TICKETS.md
  if sh "$me" >/dev/null 2>&1; then fail "archived a board with a duplicate ID"; fi
  if sh "$me" --days x >/dev/null 2>&1; then fail "--days x accepted"; fi
  echo "ok - archive-tickets.sh selftest passed (dry run writes nothing, flip date not last edit, parent waits for parts, continuation moves, uncommitted close stays, second run appends, --days, refuses a bad board)"
}

dry=0 days=14 board= want=
for a in "$@"; do
  if [ -n "$want" ]; then days=$a; want=; continue; fi
  case $a in
    --selftest) [ $# -eq 1 ] || usage; selftest; exit 0 ;;
    --dry-run) dry=1 ;;
    --days) want=days ;;
    -*) echo "$prog: unknown flag '$a'" >&2; usage ;;
    *) [ -z "$board" ] || usage; board=$a ;;
  esac
done
[ -n "$want" ] && { echo "$prog: --days needs a value" >&2; usage; }
run "$dry" "$days" "$board"
