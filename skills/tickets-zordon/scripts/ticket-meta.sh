#!/bin/sh
# ticket-meta.sh - apps and people on TICKETS.md lines (F43). Windows twin:
# ticket-meta.ps1, same output; keep the two in step.
#
#   ticket-meta.sh apps                 detected app names, one per line
#   ticket-meta.sh app-of <path>...     the app(s) those paths belong to
#   ticket-meta.sh by <ID>              @handles (or emails) of the ticket's committers
#   ticket-meta.sh apps-of <ID>         apps the ticket's commits touched
#   ticket-meta.sh assign <ID> @handle  [owner: @handle] (implements it), box -> [ ]
#   ticket-meta.sh decide <ID> @handle  [decide: @handle] (must decide), box -> [?]
#   ticket-meta.sh decided <ID>         [?] -> [ ]; the [decide:] tag stays
#   ticket-meta.sh tag <ID>             recompute [app: ..] and [by: ..] on it
#   ticket-meta.sh team add @handle "Name" email[,email...]
#                                       a member into .skillator/team.md
#   ticket-meta.sh team remove @handle  that member out (warns on open tickets)
#   ticket-meta.sh team list            "@handle: emails (Name)" per member
#   ticket-meta.sh selftest             fixture repo, every subcommand, prints ok
#
# Apps: folders under apps/*, packages/*, services/*, plus package.json
# "workspaces" and pnpm-workspace.yaml globs; the folder name is the app. No such
# folder = no apps. People: .skillator/team.md, lines `- @handle: a@x, b@y`,
# each optionally followed by an indented `  name: Full Name` line. No team
# file = no people (by prints nothing, assign refuses). `team add` creates it.
# A ticket's commits are the commits on HEAD whose subject names its ID as a
# word (F1 never matches F12 or F1a). The board edited is the main checkout's
# TICKETS.md; only the one ticket line changes, every other byte is kept.
set -u
LC_ALL=C
export LC_ALL

NL='
'
CR=$(printf '\r')
EMD=$(printf '\342\200\224')
ENDASH=$(printf '\342\200\223')
SOH=$(printf '\001')
TOP=''
MAIN=''
LOCKF=''
LOCK_ME=''

die() { board_unlock; echo "ticket-meta: $*" >&2; exit 1; }

# Resolved once, in the main shell: a die inside $(...) only ends the subshell,
# and an empty top would turn `apps/*` into a scan of /apps.
need_git() {
  TOP=$(git rev-parse --show-toplevel 2>/dev/null) || TOP=''
  [ -n "$TOP" ] || die "not inside a git repo"
  d=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || d=''
  case $d in
    */.git) MAIN=${d%/.git} ;;
    *) MAIN=$TOP ;;
  esac
}

# 0 when the whole argument is one line.
one_line() { case $1 in *"$NL"*|*"$CR"*) return 1 ;; esac; return 0; }

# ID <- the argument, letters upper-cased, sub-part letter lower; refused unless
# the WHOLE argument is one id.
norm_id() {
  one_line "$1" || die "not a ticket id (line break in it)"
  ID=$(printf '%s' "$1" | awk '{ match($0, /^[A-Za-z]*/); print toupper(substr($0, 1, RLENGTH)) substr($0, RLENGTH + 1) }')
  printf '%s' "$ID" | grep -Eqx '[A-Z]{1,3}[0-9]+[a-z]?' || die "not a ticket id: $1"
}

team_file() {
  for r in "$TOP" "$MAIN"; do
    if [ -f "$r/.skillator/team.md" ]; then printf '%s\n' "$r/.skillator/team.md"; return 0; fi
  done
  return 1
}

# One row per known email: "@handle email" (email lowercased); a handle with no
# email gets one row "@handle".
team_rows() {
  f=$(team_file) || return 0
  tr -d '\r' < "$f" | awk '
    /^[ \t]*[-*][ \t]*@[A-Za-z0-9_.-]+[ \t]*:/ {
      line = $0; sub(/^[ \t]*[-*][ \t]*/, "", line)
      h = line; sub(/[ \t]*:.*/, "", h)
      rest = line; sub(/^[^:]*:/, "", rest)
      n = split(rest, e, ","); k = 0
      for (i = 1; i <= n; i++) {
        x = e[i]; gsub(/^[ \t]+|[ \t]+$/, "", x)
        if (x != "") { print h, tolower(x); k++ }
      }
      if (k == 0) print h
    }'
}

# Workspace patterns, one per line, relative to the repo top.
patterns() {
  r=$1
  printf '%s\n' 'apps/*' 'packages/*' 'services/*'
  if [ -f "$r/package.json" ]; then
    # "workspaces": [..] is the list; "workspaces": {"packages": [..], "nohoist":
    # [..]} - only its "packages" list.
    tr -d '\r' < "$r/package.json" | tr '\n\t' '  ' |
      sed -n 's/.*"workspaces"[[:space:]]*:[[:space:]]*//p' |
      sed 's/^{[^}]*"packages"[[:space:]]*:[[:space:]]*\[/[/' |
      sed -n 's/^\[\([^]]*\)\].*/\1/p' |
      grep -o '"[^"]*"' | tr -d '"'
  fi
  if [ -f "$r/pnpm-workspace.yaml" ]; then
    tr -d '\r' < "$r/pnpm-workspace.yaml" | awk '
      /^packages:/ { f = 1; next }
      f && /^[^ \t#-]/ { f = 0 }
      f && /^[ \t]*-/ { x = $0; sub(/^[ \t]*-[ \t]*/, "", x); sub(/[ \t]+#.*/, "", x)
                        gsub(/["\047]/, "", x); sub(/[ \t]+$/, "", x); print x }'
  fi
}

# "name<TAB>relpath" per app folder, unique by path.
app_rows() {
  r=$TOP
  patterns "$r" | while IFS= read -r p; do
    case $p in ''|'!'*) continue ;; esac
    p=${p#./}; p=${p%/}
    p=$(printf '%s' "$p" | sed 's#\*\*#*#g')
    for d in "$r"/$p; do
      [ -d "$d" ] || continue
      printf '%s\t%s\n' "${d##*/}" "${d#"$r"/}"
    done
  done | sort -u
}

# Paths on stdin -> app names, first-seen order, one per path (longest folder wins).
map_paths() {
  ROWS=$(app_rows) awk '
    BEGIN { n = split(ENVIRON["ROWS"], R, "\n")
            for (i = 1; i <= n; i++) { split(R[i], f, "\t"); nm[i] = f[1]; pa[i] = f[2] }
            t = ENVIRON["TOP"] }
    { p = $0; gsub(/\\/, "/", p)
      if (index(p, t "/") == 1) p = substr(p, length(t) + 2)
      sub(/^(\.\/)+/, "", p)
      best = ""; bl = 0
      for (i = 1; i <= n; i++) {
        q = pa[i]
        if (q != "" && (p == q || index(p, q "/") == 1) && length(q) > bl) { best = nm[i]; bl = length(q) }
      }
      if (best != "" && !(best in seen)) { seen[best] = 1; print best } }'
}

# One pass over HEAD's history: for every commit whose subject names the id as
# a word, "E<TAB>email" then "P<TAB>path" per file it changed.
commits_info() {
  # --grep (fixed string, whole message) only narrows git's side; the subject
  # word match below is the rule.
  git -c core.quotepath=off -c log.showSignature=false log --reverse -F --grep="$1" \
      --format="${SOH}%ae%x09%s" --name-only 2>/dev/null | ID=$1 awk '
    index($0, ENVIRON["SOH"]) == 1 {
      s = substr($0, 2); e = s; sub(/\t.*/, "", e); sub(/^[^\t]*\t/, "", s)
      hit = match(s, "(^|[^A-Za-z0-9])" ENVIRON["ID"] "([^A-Za-z0-9]|$)")
      if (hit) print "E\t" tolower(e)
      next }
    hit && $0 != "" { print "P\t" $0 }'
}

# commits_info on stdin -> handles (emails when unknown), first-seen order.
by_from() {
  team=$(team_rows)
  [ -n "$team" ] || { cat > /dev/null; return 0; }
  TEAM=$team awk -F'\t' '
    BEGIN { n = split(ENVIRON["TEAM"], T, "\n")
            for (i = 1; i <= n; i++) { split(T[i], f, " "); if (f[2] != "") h[f[2]] = f[1] } }
    $1 == "E" { x = ($2 in h) ? h[$2] : $2; if (!(x in seen)) { seen[x] = 1; print x } }'
}

# commits_info on stdin -> apps those files sit in, sorted.
apps_from() { awk -F'\t' '$1 == "P" { print substr($0, 3) }' | map_paths | sort -u; }

join_list() { awk 'NR > 1 { printf ", " } { printf "%s", $0 } END { if (NR) printf "\n" }'; }

# The board lock relay-morpheus's `board` takes: TICKETS.md.lock, made by an
# exclusive create holding "<pid> sh <uname tag>". Waited on, never broken -
# after TICKET_META_LOCK_WAIT seconds (30) it refuses; only ours is released.
board_lock() {
  LOCK_ME="$$ sh $(uname -s 2>/dev/null | cut -c1-5)"
  w=${TICKET_META_LOCK_WAIT:-30}
  case $w in ''|*[!0-9]*) w=30 ;; esac
  deadline=$(( $(date +%s) + w ))
  until ( set -C; echo "$LOCK_ME" > "$1" ) 2>/dev/null; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      h=$(cat "$1" 2>/dev/null) || h=''
      die "$1 is locked by '${h:-?}' (a relay-morpheus board flip or another ticket-meta); waited ${w}s - retry, or delete it if that holder is gone"
    fi
    sleep 0.1 2>/dev/null || sleep 1
  done
  LOCKF=$1
  trap 'board_unlock; exit 1' HUP INT TERM
}
board_unlock() {
  [ -n "$LOCKF" ] || return 0
  [ "$(cat "$LOCKF" 2>/dev/null)" = "$LOCK_ME" ] && rm -f "$LOCKF"
  LOCKF=''
  trap - HUP INT TERM
}

# Rewrite the one line of $ID in the board, under the board lock. SET_APP /
# SET_DECIDE / SET_OWNER / SET_BY from the environment; an empty one leaves that
# tag as is. SET_MARK sets the box; NEED_MARK refuses a line whose box is not
# that; SAME_KEY + SAME_VAL: a line already carrying [SAME_KEY: SAME_VAL] is
# left exactly as it is (box included), and that is said.
# The line is `[indent]- [<mark>] <ID> <dash> ...`, loose spacing allowed, the
# dash an em dash, an en dash or a hyphen - the shapes the viewers accept.
edit_line() {
  f="$MAIN/TICKETS.md"
  [ -f "$f" ] || die "no TICKETS.md at $f"
  board_lock "$f.lock"
  re="^[ \t]*- \\[.\\][ \t]+$ID[ \t]*($EMD|$ENDASH|-)"
  n=$(RE=$re awk '$0 ~ ENVIRON["RE"] { c++ } END { print c + 0 }' "$f")
  [ "$n" = 1 ] || die "$ID: $n matching lines in $f, need exactly 1"
  cur=$(RE=$re awk '$0 ~ ENVIRON["RE"]' "$f" | tr -d '\r')
  mk=$(printf '%s\n' "$cur" | awk '{ match($0, /- \[/); print substr($0, RSTART + 3, 1) }')
  if [ -n "${NEED_MARK:-}" ] && [ "$mk" != "$NEED_MARK" ]; then
    die "$ID is [$mk], not [$NEED_MARK] - nothing to change"
  fi
  if [ -n "${SAME_KEY:-}" ]; then
    v=$(printf '%s\n' "$cur" | K=$SAME_KEY awk '{ if (match($0, "\\[" ENVIRON["K"] ":[ \t]*[^]]*\\]")) {
          v = substr($0, RSTART, RLENGTH); sub(/^\[[^:]*:[ \t]*/, "", v); sub(/[ \t]*\]$/, "", v); print v } }')
    # a no-op only when the box is already where this assignment puts it
    if [ "$v" = "$SAME_VAL" ] && [ "$mk" = "${SET_MARK:-}" ]; then
      board_unlock
      printf '%s\n' "$cur"
      echo "no change: $ID already has [$SAME_KEY: $SAME_VAL]"
      return 0
    fi
  fi
  # Moving a line out of [~] drops the working session's trailing (@agent-id)
  # tag - only that exact shape - and names that session afterwards.
  drop=0 sess=''
  if [ "$mk" = '~' ] && [ -n "${SET_MARK:-}" ] && [ "$SET_MARK" != '~' ]; then
    drop=1
    sess=$(printf '%s\n' "$cur" | awk '{ if (match($0, /\(@[A-Za-z]+-[A-Za-z0-9]+\)[ \t]*$/)) {
          s = substr($0, RSTART + 1); sub(/\).*/, "", s); print s } }')
  fi
  eol=0
  [ "$(tail -c 1 "$f" | od -An -tx1 | tr -d ' \n')" = 0a ] && eol=1
  tmp="$f.ticket-meta.$$"
  RE=$re EOL=$eol DROP=$drop awk '
    function find(line, key) { return match(line, "[ \t]*\\[" key ":[ \t]*[^]]*\\]") }
    # A tag goes where it is, else before the next tag in app/decide/owner/by order,
    # else before the trailing (..) groups and a bare "Plan: S<n>" before them
    # (check-tickets must still see that pointer as bare).
    function settag(line, key, val,    i, pos, head) {
      if (find(line, key))
        return substr(line, 1, RSTART - 1) " [" key ": " val "]" substr(line, RSTART + RLENGTH)
      pos = 0
      for (i = 1; i <= 4; i++) if (ORD[i] == key) break
      for (i = i + 1; i <= 4; i++)
        if (find(line, ORD[i]) && (pos == 0 || RSTART < pos)) pos = RSTART
      if (pos == 0) {
        pos = length(line) + 1
        if (match(line, /([ \t]*\([^()]*\))+[ \t]*$/)) pos = RSTART
        head = substr(line, 1, pos - 1)
        if (match(head, /[ \t]*Plan: S[0-9]+\.?$/)) pos = RSTART
      }
      return substr(line, 1, pos - 1) " [" key ": " val "]" substr(line, pos)
    }
    BEGIN { ORD[1] = "app"; ORD[2] = "decide"; ORD[3] = "owner"; ORD[4] = "by"; re = ENVIRON["RE"] }
    { line = $0; cr = ""
      if (sub(/\r$/, "", line)) cr = "\r"
      if (line ~ re) {
        if (ENVIRON["SET_MARK"] != "") {
          match(line, /- \[/); line = substr(line, 1, RSTART + 2) ENVIRON["SET_MARK"] substr(line, RSTART + 4)
        }
        if (ENVIRON["DROP"] == "1") sub(/[ \t]*\(@[A-Za-z]+-[A-Za-z0-9]+\)[ \t]*$/, "", line)
        if (ENVIRON["SET_APP"] != "") line = settag(line, "app", ENVIRON["SET_APP"])
        if (ENVIRON["SET_DECIDE"] != "") line = settag(line, "decide", ENVIRON["SET_DECIDE"])
        if (ENVIRON["SET_OWNER"] != "") line = settag(line, "owner", ENVIRON["SET_OWNER"])
        if (ENVIRON["SET_BY"] != "") line = settag(line, "by", ENVIRON["SET_BY"])
      }
      if (NR > 1) printf "\n"
      printf "%s%s", line, cr }
    END { if (NR && ENVIRON["EOL"] == "1") printf "\n" }' "$f" > "$tmp" || { rm -f "$tmp"; die "write failed"; }
  mv -f "$tmp" "$f" || { rm -f "$tmp"; die "cannot replace $f"; }
  board_unlock
  RE=$re awk '$0 ~ ENVIRON["RE"]' "$f"
  if [ "$drop" = 1 ]; then
    if [ -n "$sess" ]; then
      echo "warning: $ID was in progress under $sess - that session is no longer the owner; tell it"
    else
      echo "warning: $ID was in progress - whoever was working it is no longer the owner; tell them"
    fi
  fi
}

# <ID> @handle -> ID, HANDLE; the handle must be in the team file.
id_and_handle() {
  [ $# -eq 2 ] || die "usage: $CMD <ID> @handle"
  norm_id "$1"
  HANDLE=$2
  case $HANDLE in @*) ;; *) HANDLE="@$HANDLE" ;; esac
  one_line "$HANDLE" && printf '%s' "$HANDLE" | grep -Eqx '@[A-Za-z0-9_.-]+' || die "not a handle (@name): $2"
  team_file > /dev/null || die "no .skillator/team.md - this repo has no people; add one to assign"
  team_rows | awk '{ print $1 }' | grep -qxF -- "$HANDLE" || die "$HANDLE is not in .skillator/team.md"
}

# F45: an assignment reopens. Implementation -> [owner:] and the box [ ];
# decision -> [decide:] and the box [?]; the same handle again changes nothing.
cmd_assign() {
  CMD=assign; id_and_handle "$@"
  SET_MARK=' ' SET_APP='' SET_DECIDE='' SET_OWNER=$HANDLE SET_BY='' SAME_KEY=owner SAME_VAL=$HANDLE NEED_MARK='' edit_line
}

cmd_decide() {
  CMD=decide; id_and_handle "$@"
  SET_MARK='?' SET_APP='' SET_DECIDE=$HANDLE SET_OWNER='' SET_BY='' SAME_KEY=decide SAME_VAL=$HANDLE NEED_MARK='' edit_line
}

# The decision is made: [?] -> [ ]; the [decide:] tag stays as the record.
cmd_decided() {
  [ $# -eq 1 ] || die "usage: decided <ID>"
  norm_id "$1"
  SET_MARK=' ' SET_APP='' SET_DECIDE='' SET_OWNER='' SET_BY='' SAME_KEY='' NEED_MARK='?' edit_line
}

cmd_tag() {
  [ $# -eq 1 ] || die "usage: tag <ID>"
  norm_id "$1"
  info=$(commits_info "$ID")
  a=$(printf '%s\n' "$info" | apps_from | join_list)
  b=$(printf '%s\n' "$info" | by_from | join_list)
  SET_MARK='' SET_APP=$a SET_DECIDE='' SET_OWNER='' SET_BY=$b SAME_KEY='' NEED_MARK='' edit_line
}

# Members of team file $1, one row each: "@handle<TAB>emails<TAB>name" - the
# emails as written, trimmed, ", "-joined; the name from an indented `name: ..`
# line straight under the member line (the readers above never see that line).
team_members() {
  tr -d '\r' < "$1" | awk '
    function flush() { if (h != "") print h "\t" em "\t" nm; h = "" }
    /^[ \t]*[-*][ \t]*@[A-Za-z0-9_.-]+[ \t]*:/ {
      flush()
      line = $0; sub(/^[ \t]*[-*][ \t]*/, "", line)
      h = line; sub(/[ \t]*:.*/, "", h)
      rest = line; sub(/^[^:]*:/, "", rest)
      n = split(rest, e, ","); em = ""; nm = ""
      for (i = 1; i <= n; i++) {
        x = e[i]; gsub(/^[ \t]+|[ \t]+$/, "", x)
        if (x != "") em = (em == "") ? x : em ", " x
      }
      next }
    h != "" && /^[ \t]+name:/ { x = $0; sub(/^[ \t]+name:[ \t]*/, "", x); sub(/[ \t]+$/, "", x); nm = x; next }
    { flush() }
    END { flush() }'
}

# TH <- the argument as an @handle (the @ may be left off), refused unless the
# whole argument is one handle matching $2.
team_handle() {
  TH=$1
  case $TH in @*) ;; *) TH="@$TH" ;; esac
  one_line "$TH" && printf '%s' "$TH" | grep -Eqx -- "$2" || die "not a handle (@name, $3): $1"
}

TEAM_USAGE='usage: team add @handle "Name" email[,email...] | team remove @handle | team list'

# add: `- @handle: a@x, b@y` and `  name: Name` under it, appended to the team
# file (created with a `# Team` header when there is none). The new handle is
# a-z 0-9 _ -; one already there, in any case, is refused.
team_add() {
  [ $# -ge 3 ] || die "$TEAM_USAGE"
  team_handle "$1" '@[a-z0-9_-]+' 'lower-case a-z 0-9 _ -'
  one_line "$2" && printf '%s' "$2" | grep -Eqx '[ -~]+' || die "not a name (one line of printable ASCII): $2"
  NAME=$(printf '%s' "$2" | sed 's/^ *//; s/ *$//')
  [ -n "$NAME" ] || die "not a name (empty): $2"
  shift 2
  for a in "$@"; do one_line "$a" || die "not an email (line break in it)"; done
  ems=$(printf '%s\n' "$@" | tr ',' '\n' | sed 's/^ *//; s/ *$//' | grep -v '^$')
  [ -n "$ems" ] || die "no email given - $TEAM_USAGE"
  bad=$(printf '%s\n' "$ems" | grep -Evx '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+' | head -n 1)
  [ -z "$bad" ] || die "not an email: $bad"
  EMS=$(printf '%s\n' "$ems" | join_list)
  f=$(team_file) || f="$MAIN/.skillator/team.md"
  board_lock "$MAIN/TICKETS.md.lock"
  tmp="$f.ticket-meta.$$"
  if [ -f "$f" ]; then
    lh=$(printf '%s' "$TH" | tr 'A-Z' 'a-z')
    team_members "$f" | cut -f1 | tr 'A-Z' 'a-z' | grep -qxF -- "$lh" && die "$TH is already in $f"
    cat "$f" > "$tmp" || { rm -f "$tmp"; die "write failed"; }
    if [ -s "$f" ] && [ "$(tail -c 1 "$f" | od -An -tx1 | tr -d ' \n')" != 0a ]; then printf '\n' >> "$tmp"; fi
  else
    mkdir -p "${f%/*}" || die "cannot create ${f%/*}"
    printf '# Team\n\n' > "$tmp" || { rm -f "$tmp"; die "write failed"; }
  fi
  printf -- '- %s: %s\n  name: %s\n' "$TH" "$EMS" "$NAME" >> "$tmp" || { rm -f "$tmp"; die "write failed"; }
  mv -f "$tmp" "$f" || { rm -f "$tmp"; die "cannot replace $f"; }
  board_unlock
  printf -- '- %s: %s\n  name: %s\n' "$TH" "$EMS" "$NAME"
}

# remove: that member's line and its `name:` line go, every other byte stays.
# Open tickets (not [x], not [-]) still naming the handle in [owner:],
# [decide:] or [by:] are listed in a warning; the removal goes ahead.
team_remove() {
  [ $# -eq 1 ] || die "$TEAM_USAGE"
  team_handle "$1" '@[A-Za-z0-9_.-]+' 'letters, digits, _ . -'
  f=$(team_file) || die "no .skillator/team.md - this repo has no people"
  board_lock "$MAIN/TICKETS.md.lock"
  team_members "$f" | cut -f1 | grep -qxF -- "$TH" || die "$TH is not in $f"
  eol=0
  [ "$(tail -c 1 "$f" | od -An -tx1 | tr -d ' \n')" = 0a ] && eol=1
  tmp="$f.ticket-meta.$$"
  # BINMODE=3: Windows gawk would otherwise drop each line's \r on the way in.
  H=$TH EOL=$eol awk -v BINMODE=3 '
    { line = $0; sub(/\r$/, "", line)
      if (line ~ /^[ \t]*[-*][ \t]*@[A-Za-z0-9_.-]+[ \t]*:/) {
        h = line; sub(/^[ \t]*[-*][ \t]*/, "", h); sub(/[ \t]*:.*/, "", h)
        skip = (h == ENVIRON["H"]); if (skip) next
      } else if (skip && line ~ /^[ \t]+name:/) next
      else skip = 0
      if (k++) printf "\n"
      printf "%s", $0 }
    END { if (k && ENVIRON["EOL"] == "1") printf "\n" }' "$f" > "$tmp" || { rm -f "$tmp"; die "write failed"; }
  mv -f "$tmp" "$f" || { rm -f "$tmp"; die "cannot replace $f"; }
  board_unlock
  echo "removed: $TH"
  b="$MAIN/TICKETS.md"
  [ -f "$b" ] || return 0
  ids=$(tr -d '\r' < "$b" | H=$TH awk '
    match($0, /^[ \t]*- \[.\][ \t]+[A-Z]+[0-9]+[a-z]?/) {
      id = substr($0, RSTART, RLENGTH); sub(/^[ \t]*- \[.\][ \t]+/, "", id)
      mk = substr($0, index($0, "- [") + 3, 1)
      if (mk != " " && mk != "~" && mk != "!" && mk != "?") next   # open: [ ] [~] [!] [?]
      s = $0; hit = 0
      while (match(s, /\[(owner|decide|by):[^]]*\]/)) {
        t = substr(s, RSTART, RLENGTH); s = substr(s, RSTART + RLENGTH)
        sub(/^\[[a-z]+:/, "", t); sub(/\]$/, "", t)
        n = split(t, p, ",")
        for (i = 1; i <= n; i++) { x = p[i]; gsub(/^[ \t]+|[ \t]+$/, "", x); if (x == ENVIRON["H"]) hit = 1 }
      }
      if (hit) print id }' | join_list)
  [ -z "$ids" ] || echo "warning: $TH is still named on open tickets: $ids - reassign them"
}

# list: "@handle: a@x, b@y (Name)" per member, file order; no team file = nothing.
team_list() {
  [ $# -eq 0 ] || die "$TEAM_USAGE"
  f=$(team_file) || return 0
  team_members "$f" | awk -F'\t' '{ s = $1 ":"; if ($2 != "") s = s " " $2; if ($3 != "") s = s " (" $3 ")"; print s }'
}

cmd_team() {
  [ $# -ge 1 ] || die "$TEAM_USAGE"
  sub=$1; shift
  case $sub in
    add) team_add "$@" ;;
    remove) team_remove "$@" ;;
    list) team_list "$@" ;;
    *) die "$TEAM_USAGE" ;;
  esac
}

selftest() {
  self=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/$(basename -- "$0")
  T=$(mktemp -d 2>/dev/null || mktemp -d -t ticketmeta)
  trap 'rm -rf "$T"' EXIT
  fail=0
  D=$(printf '\342\200\224')
  eq() { [ "$2" = "$3" ] || { echo "FAIL: $1: expected [$3] got [$2]"; fail=1; }; }
  run() { sh "$self" "$@" 2>/dev/null | tr -d '\r' | tr '\n' ' ' | sed 's/ $//'; }
  mkdir -p "$T/hooks"
  commit() {
    em=$1; msg=$2; shift 2
    for p in "$@"; do mkdir -p "$(dirname -- "$p")"; echo "$msg" >> "$p"; done
    git add -A && git -c user.name=t -c user.email="$em" -c commit.gpgsign=false \
      -c core.hooksPath="$T/hooks" commit -q -m "$msg" > /dev/null
  }

  # --- monorepo fixture: three app roots, a package.json workspace, a pnpm one
  M="$T/mono"
  mkdir -p "$M" && cd "$M" && git init -q . && git config core.autocrlf false || die "cannot init fixture"
  mkdir -p apps/web apps/api packages/ui tools/cli libs/core .skillator src
  printf '{\n  "name": "mono",\n  "workspaces": ["apps/*", "packages/*", "tools/cli"]\n}\n' > package.json
  printf "packages:\n  - 'libs/*'\n  - '!libs/skip'\n" > pnpm-workspace.yaml
  printf '# Team\n\n- @vidul: vidul@ikran.in, V2@X.com\n- @asha: asha@x.com\n' > .skillator/team.md
  printf '# TICKETS\n\n## Bugs\n\n- [ ] B2 %s Button misaligned (@cc-aaaaaa)\n\n## Features\n\n- [~] F1 %s Dark mode (@cc-bbbbbb)\n- [ ] F12 %s Bulk delete\n- [ ] F3 %s Hand tagged [app: web] (@cc-cccccc)\n' \
    "$D" "$D" "$D" "$D" > TICKETS.md
  for d in apps/web apps/api packages/ui tools/cli libs/core src; do echo x > "$d/f.txt"; done
  commit vidul@ikran.in "init" README.md
  commit vidul@ikran.in "F1: dark mode in web" apps/web/index.js
  commit asha@x.com "F12: bulk delete in api" apps/api/server.js
  commit ghost@x.com "B2 fix button" packages/ui/button.js
  commit v2@x.com "fix F1 theme tokens" packages/ui/theme.js
  commit asha@x.com "F12a: core helper" libs/core/h.js
  cp TICKETS.md "$T/before.md"

  eq apps "$(run apps)" "api cli core ui web"
  eq app-of "$(run app-of apps/web/index.js ./packages/ui/x.js README.md "$(git rev-parse --show-toplevel)/libs/core/h.js" apps/web)" "web ui core"
  eq "by F1" "$(run by F1)" "@vidul"
  eq "by F12 (not F12a)" "$(run by F12)" "@asha"
  eq "by B2 unknown email" "$(run by B2)" "ghost@x.com"
  eq "apps-of F1" "$(run apps-of F1)" "ui web"
  eq "apps-of F12" "$(run apps-of F12)" "api"
  eq "apps-of F3 none" "$(run apps-of F3)" ""

  sh "$self" assign F1 @nobody > /dev/null 2>&1 && { echo "FAIL: assign accepted an unknown handle"; fail=1; }
  cmp -s TICKETS.md "$T/before.md" || { echo "FAIL: refused assign changed the board"; fail=1; }
  eq "assign F12" "$(run assign F12 @asha)" "- [ ] F12 $D Bulk delete [owner: @asha]"
  eq "assign F1" "$(run assign F1 asha)" "- [ ] F1 $D Dark mode [owner: @asha] warning: F1 was in progress under @cc-bbbbbb - that session is no longer the owner; tell it"
  eq "reassign F1" "$(run assign F1 @vidul)" "- [ ] F1 $D Dark mode [owner: @vidul]"
  eq "tag F1" "$(run tag F1)" "- [ ] F1 $D Dark mode [app: ui, web] [owner: @vidul] [by: @vidul]"
  eq "tag B2" "$(run tag B2)" "- [ ] B2 $D Button misaligned [app: ui] [by: ghost@x.com] (@cc-aaaaaa)"
  eq "tag F3 keeps hand app" "$(run tag F3)" "- [ ] F3 $D Hand tagged [app: web] (@cc-cccccc)"
  sh "$self" tag F9 > /dev/null 2>&1 && { echo "FAIL: tag accepted a missing ticket"; fail=1; }
  printf '# TICKETS\n\n## Bugs\n\n- [ ] B2 %s Button misaligned [app: ui] [by: ghost@x.com] (@cc-aaaaaa)\n\n## Features\n\n- [ ] F1 %s Dark mode [app: ui, web] [owner: @vidul] [by: @vidul]\n- [ ] F12 %s Bulk delete [owner: @asha]\n- [ ] F3 %s Hand tagged [app: web] (@cc-cccccc)\n' \
    "$D" "$D" "$D" "$D" > "$T/want.md"
  cmp -s TICKETS.md "$T/want.md" || { echo "FAIL: board bytes differ beyond the edited tags"; diff "$T/want.md" TICKETS.md; fail=1; }

  # --- edge fixture (review of F43): object-shaped workspaces, hand-written
  # tags, loose line shapes, Plan pointers, the board lock, hostile arguments
  E="$T/edge"
  mkdir -p "$E" && cd "$E" && git init -q . && git config core.autocrlf false || die "cannot init fixture"
  mkdir -p apps/web tools/cli tools/other .skillator
  for d in apps/web tools/cli tools/other; do echo x > "$d/f.txt"; done
  printf '{\n  "name": "edge",\n  "workspaces": {\n    "nohoist": ["tools/*"],\n    "packages": ["apps/*", "tools/cli"]\n  }\n}\n' > package.json
  printf -- '- @vidul: vidul@ikran.in\n- @asha: asha@x.com\n' > .skillator/team.md
  printf -- '# TICKETS\n\n- [ ] F4 %s Hand owner [owner:@vidul] (@cc-111111)\n- [ ]  F7%s Spacing\n- [ ] F8 - Hyphen\n  - [ ] F8a %s Sub part\n- [x] F5 %s Shipped Plan: S3 (@cc-222222)\n- [x] F6 %s Done right, RED/GREEN 3/3 (@cc-333333)\n' \
    "$D" "$D" "$D" "$D" "$D" > TICKETS.md
  commit vidul@ikran.in "init" README.md
  commit vidul@ikran.in "F5: web" apps/web/a.js
  commit vidul@ikran.in "F6: web" apps/web/b.js
  # 10: an object "workspaces" takes its "packages", never "nohoist"
  eq "object workspaces" "$(run apps)" "cli web"
  # 1: a board lock held by someone else is waited on, then refused; never broken
  printf '99999 ps1\n' > TICKETS.md.lock
  cp TICKETS.md "$T/edge0.md"
  TICKET_META_LOCK_WAIT=1 sh "$self" assign F4 @vidul > /dev/null 2> "$T/err" && { echo "FAIL: wrote through a held board lock"; fail=1; }
  grep -q 'locked' "$T/err" || { echo "FAIL: lock refusal does not say locked: $(cat "$T/err")"; fail=1; }
  cmp -s TICKETS.md "$T/edge0.md" || { echo "FAIL: board changed under a held lock"; fail=1; }
  eq "foreign lock kept" "$(cat TICKETS.md.lock)" "99999 ps1"
  rm -f TICKETS.md.lock
  # 2: a line break in an argument is refused whole, never half-used
  sh "$self" assign F4 "$(printf '@vidul\n@evil')" > /dev/null 2>&1 && { echo "FAIL: assign took a multi-line handle"; fail=1; }
  sh "$self" by "$(printf 'F5\nzz')" > /dev/null 2>&1 && { echo "FAIL: by took a multi-line id"; fail=1; }
  sh "$self" assign "$(printf 'F4\nF5')" @vidul > /dev/null 2>&1 && { echo "FAIL: assign took a multi-line id"; fail=1; }
  sh "$self" by "F5$NL" > /dev/null 2>&1 && { echo "FAIL: by took an id ending in a line break"; fail=1; }
  sh "$self" assign F4 "@vidul$NL" > /dev/null 2>&1 && { echo "FAIL: assign took a handle ending in a line break"; fail=1; }
  cmp -s TICKETS.md "$T/edge0.md" || { echo "FAIL: a refused argument changed the board"; fail=1; }
  # 3: a hand-written [owner:@x] is replaced, not duplicated
  eq "hand tag replaced" "$(run assign F4 @asha)" "- [ ] F4 $D Hand owner [owner: @asha] (@cc-111111)"
  [ ! -e TICKETS.md.lock ] || { echo "FAIL: our board lock was left behind"; fail=1; }
  # 9: loose spacing, a hyphen, a sub-part, a lower-case id
  eq "loose line" "$(run assign f7 @vidul)" "- [ ]  F7$D Spacing [owner: @vidul]"
  eq "hyphen line" "$(run assign F8 @vidul)" "- [ ] F8 - Hyphen [owner: @vidul]"
  eq "sub-part line" "$(run assign F8a @vidul)" "  - [ ] F8a $D Sub part [owner: @vidul]"
  # 5: tags go before a bare Plan pointer, so check-tickets still catches it
  eq "tag before Plan" "$(run tag F5)" "- [x] F5 $D Shipped [app: web] [by: @vidul] Plan: S3 (@cc-222222)"
  eq "tag F6" "$(run tag F6)" "- [x] F6 $D Done right, RED/GREEN 3/3 [app: web] [by: @vidul] (@cc-333333)"
  ct="$(dirname -- "$self")/../../../practice/scripts/check-tickets.sh"
  if [ -f "$ct" ]; then
    sh "$ct" "$E/TICKETS.md" > /dev/null 2>&1 && { echo "FAIL: check-tickets passed a tagged bare Plan line"; fail=1; }
    grep -v ' F5 ' TICKETS.md > "$T/noplan.md"
    sh "$ct" "$T/noplan.md" > /dev/null 2>&1 || { echo "FAIL: check-tickets failed a tagged board: $(sh "$ct" "$T/noplan.md" 2>&1)"; fail=1; }
  else
    echo "skip: check-tickets.sh not beside this install" >&2
  fi
  # 8: tag reads history once - one git log, no per-commit diff-tree
  mkdir -p "$T/shim"
  realgit=$(command -v git)
  printf '#!/bin/sh\necho "$*" >> "%s"\nexec "%s" "$@"\n' "$T/gitcalls" "$realgit" > "$T/shim/git"
  chmod +x "$T/shim/git"
  : > "$T/gitcalls"
  PATH="$T/shim:$PATH" sh "$self" tag F6 > /dev/null 2>&1
  eq "git log calls in tag" "$(grep -cE '(^| )log( |$)' "$T/gitcalls")" "1"
  eq "diff-tree calls in tag" "$(grep -c 'diff-tree' "$T/gitcalls")" "0"
  # 7: outside any repo every subcommand stops, it never scans /apps
  mkdir -p "$T/nogit" && cd "$T/nogit"
  GIT_CEILING_DIRECTORIES=$T sh "$self" apps > "$T/out" 2> "$T/err" && { echo "FAIL: apps ran outside a git repo: $(cat "$T/out")"; fail=1; }
  grep -q 'not inside a git repo' "$T/err" || { echo "FAIL: no 'not inside a git repo' outside one: $(cat "$T/err")"; fail=1; }
  # 4: a repo with no commits answers empty, exit 0
  mkdir -p "$T/empty" && cd "$T/empty" && git init -q . && git config core.autocrlf false || die "cannot init fixture"
  mkdir -p .skillator && printf -- '- @vidul: vidul@ikran.in\n' > .skillator/team.md
  printf -- '- [ ] F1 %s New\n' "$D" > TICKETS.md
  sh "$self" by F1 > "$T/out" 2>&1 || { echo "FAIL: by failed in a repo with no commits: $(cat "$T/out")"; fail=1; }
  eq "empty repo tag" "$(run tag F1)" "- [ ] F1 $D New"

  # --- F45: assigning reopens; a decision assignment is the [?] state
  A="$T/f45"
  mkdir -p "$A/.skillator" && cd "$A" && git init -q . && git config core.autocrlf false || die "cannot init fixture"
  printf -- '- @vidul: vidul@ikran.in\n- @asha: asha@x.com\n' > .skillator/team.md
  {
    printf -- '# TICKETS\n\n'
    printf -- '- [x] F20 %s Done thing (@cc-1)\n' "$D"
    printf -- '- [>] F21 %s Later thing (deferred: q4) (@cc-2)\n' "$D"
    printf -- '- [ ] F22 %s Open thing\n' "$D"
    printf -- '- [-] F23 %s Dropped thing\n' "$D"
    printf -- '- [?] F24 %s Waiting [decide: @asha]\n' "$D"
    printf -- '- [ ] F25 %s Both [app: web] [by: @vidul]\n' "$D"
    printf -- '- [x] F26 %s Shipped (@cc-3)\n' "$D"
    printf -- '- [x] F27 %s Kept [owner: @asha]\n' "$D"
    printf -- '- [ ] F28 %s Decided before [decide: @asha]\n' "$D"
    printf -- '- [?] F29 %s Owner waiting [owner: @vidul]\n' "$D"
    printf -- '- [~] F31 %s Working (@cc-bbbbbb)\n' "$D"
    printf -- '- [~] F32 %s Busy (a note) (@cc-cccccc)\n' "$D"
  } > TICKETS.md
  commit vidul@ikran.in "init" README.md
  eq "decide from [x]" "$(run decide F20 @asha)" "- [?] F20 $D Done thing [decide: @asha] (@cc-1)"
  eq "decide from [>]" "$(run decide F21 asha)" "- [?] F21 $D Later thing [decide: @asha] (deferred: q4) (@cc-2)"
  eq "decide from [ ]" "$(run decide F22 @vidul)" "- [?] F22 $D Open thing [decide: @vidul]"
  eq "assign from [?]" "$(run assign F20 @vidul)" "- [ ] F20 $D Done thing [decide: @asha] [owner: @vidul] (@cc-1)"
  eq "assign from [-]" "$(run assign F23 @vidul)" "- [ ] F23 $D Dropped thing [owner: @vidul]"
  eq "assign from [x]" "$(run assign F26 @asha)" "- [ ] F26 $D Shipped [owner: @asha] (@cc-3)"
  eq "decided" "$(run decided F24)" "- [ ] F24 $D Waiting [decide: @asha]"
  # the same handle with the box not yet the target still moves the box
  eq "same owner from [x]" "$(run assign F27 @asha)" "- [ ] F27 $D Kept [owner: @asha]"
  eq "same decider from [ ]" "$(run decide F28 @asha)" "- [?] F28 $D Decided before [decide: @asha]"
  eq "same owner from [?]" "$(run assign F29 @vidul)" "- [ ] F29 $D Owner waiting [owner: @vidul]"
  cp TICKETS.md "$T/f45a.md"
  sh "$self" decided F23 > /dev/null 2>&1 && { echo "FAIL: decided flipped a ticket that is not [?]"; fail=1; }
  sh "$self" decided "$(printf 'F22\nF23')" > /dev/null 2>&1 && { echo "FAIL: decided took a multi-line id"; fail=1; }
  sh "$self" decide F23 "@asha$NL" > /dev/null 2>&1 && { echo "FAIL: decide took a handle ending in a line break"; fail=1; }
  sh "$self" decide F23 @nobody > /dev/null 2>&1 && { echo "FAIL: decide took an unknown handle"; fail=1; }
  cmp -s TICKETS.md "$T/f45a.md" || { echo "FAIL: a refused decide/decided changed the board"; fail=1; }
  # same handle, same kind, box already the target: nothing changes - and it says so
  sh "$self" assign F27 @asha > "$T/out" 2>&1 || { echo "FAIL: same-handle assign failed: $(cat "$T/out")"; fail=1; }
  grep -q 'no change' "$T/out" || { echo "FAIL: same-handle assign did not say no change: $(cat "$T/out")"; fail=1; }
  sh "$self" decide F28 @asha > "$T/out" 2>&1 || { echo "FAIL: same-handle decide failed: $(cat "$T/out")"; fail=1; }
  grep -q 'no change' "$T/out" || { echo "FAIL: same-handle decide did not say no change: $(cat "$T/out")"; fail=1; }
  cmp -s TICKETS.md "$T/f45a.md" || { echo "FAIL: a same-handle assignment changed the board"; fail=1; }
  # tag order: app, decide, owner, by
  eq "decide between tags" "$(run decide F25 @asha)" "- [?] F25 $D Both [app: web] [decide: @asha] [by: @vidul]"
  eq "owner after decide" "$(run assign F25 @vidul)" "- [ ] F25 $D Both [app: web] [decide: @asha] [owner: @vidul] [by: @vidul]"
  # leaving [~] drops that session's tag and says whose it was; other (..) stay
  sh "$self" assign F31 @asha > "$T/out" 2>&1 || { echo "FAIL: assign of a [~] ticket failed: $(cat "$T/out")"; fail=1; }
  eq "assign from [~]" "$(head -n 1 "$T/out" | tr -d '\r')" "- [ ] F31 $D Working [owner: @asha]"
  grep -q 'F31 was in progress under @cc-bbbbbb' "$T/out" || { echo "FAIL: no warning naming the [~] session: $(cat "$T/out")"; fail=1; }
  sh "$self" decide F32 @vidul > "$T/out" 2>&1 || { echo "FAIL: decide of a [~] ticket failed: $(cat "$T/out")"; fail=1; }
  eq "decide from [~]" "$(head -n 1 "$T/out" | tr -d '\r')" "- [?] F32 $D Busy [decide: @vidul] (a note)"
  grep -q 'F32 was in progress under @cc-cccccc' "$T/out" || { echo "FAIL: no warning naming the [~] session: $(cat "$T/out")"; fail=1; }
  {
    printf -- '# TICKETS\n\n'
    printf -- '- [ ] F20 %s Done thing [decide: @asha] [owner: @vidul] (@cc-1)\n' "$D"
    printf -- '- [?] F21 %s Later thing [decide: @asha] (deferred: q4) (@cc-2)\n' "$D"
    printf -- '- [?] F22 %s Open thing [decide: @vidul]\n' "$D"
    printf -- '- [ ] F23 %s Dropped thing [owner: @vidul]\n' "$D"
    printf -- '- [ ] F24 %s Waiting [decide: @asha]\n' "$D"
    printf -- '- [ ] F25 %s Both [app: web] [decide: @asha] [owner: @vidul] [by: @vidul]\n' "$D"
    printf -- '- [ ] F26 %s Shipped [owner: @asha] (@cc-3)\n' "$D"
    printf -- '- [ ] F27 %s Kept [owner: @asha]\n' "$D"
    printf -- '- [?] F28 %s Decided before [decide: @asha]\n' "$D"
    printf -- '- [ ] F29 %s Owner waiting [owner: @vidul]\n' "$D"
    printf -- '- [ ] F31 %s Working [owner: @asha]\n' "$D"
    printf -- '- [?] F32 %s Busy [decide: @vidul] (a note)\n' "$D"
  } > "$T/want45.md"
  cmp -s TICKETS.md "$T/want45.md" || { echo "FAIL: F45 board bytes"; diff "$T/want45.md" TICKETS.md; fail=1; }

  # --- team add / remove / list: .skillator/team.md written under the board lock
  G="$T/team"
  mkdir -p "$G" && cd "$G" && git init -q . && git config core.autocrlf false || die "cannot init fixture"
  {
    printf -- '# TICKETS\n\n'
    printf -- '- [ ] F1 %s One [owner: @asha]\n' "$D"
    printf -- '- [x] F2 %s Two [owner: @asha]\n' "$D"
    printf -- '- [?] F3 %s Three [decide: @asha]\n' "$D"
    printf -- '- [-] F4 %s Four [by: @asha]\n' "$D"
    printf -- '- [>] F5 %s Five [by: @vidul, @asha]\n' "$D"
    printf -- '- [ ] F6 %s Six\n' "$D"
    printf -- '- [ ] F7 %s Seven [owner: @ashab]\n' "$D"
    printf -- '- [~] F8 %s Eight [owner: @asha]\n' "$D"
    printf -- '- [!] F9 %s Nine [by: @asha]\n' "$D"
  } > TICKETS.md
  tf="$G/.skillator/team.md"
  eq "team list, no file" "$(run team list)" ""
  eq "team add, no file" "$(run team add @asha "Asha Rao" asha@x.com)" "- @asha: asha@x.com   name: Asha Rao"
  printf -- '# Team\n\n- @asha: asha@x.com\n  name: Asha Rao\n' > "$T/team1.md"
  cmp -s "$tf" "$T/team1.md" || { echo "FAIL: team add to a missing file"; diff "$T/team1.md" "$tf"; fail=1; }
  eq "team add second" "$(run team add vidul " Vidul Ikran " "vidul@ikran.in, V2@X.com" x@y.org)" "- @vidul: vidul@ikran.in, V2@X.com, x@y.org   name: Vidul Ikran"
  printf -- '# Team\n\n- @asha: asha@x.com\n  name: Asha Rao\n- @vidul: vidul@ikran.in, V2@X.com, x@y.org\n  name: Vidul Ikran\n' > "$T/team2.md"
  cmp -s "$tf" "$T/team2.md" || { echo "FAIL: team add second"; diff "$T/team2.md" "$tf"; fail=1; }
  [ ! -e TICKETS.md.lock ] || { echo "FAIL: team add left the board lock behind"; fail=1; }
  # the existing readers see the new member and every email, the last one included
  eq "assign to an added member" "$(run assign F6 @vidul)" "- [ ] F6 $D Six [owner: @vidul]"
  commit X@Y.org "F6: six" six.txt
  eq "by maps an added email" "$(run by F6)" "@vidul"
  sh "$self" team add @asha "Other Asha" o@x.com > /dev/null 2> "$T/err" && { echo "FAIL: team add took a duplicate handle"; fail=1; }
  grep -q 'already' "$T/err" || { echo "FAIL: duplicate refusal does not say already: $(cat "$T/err")"; fail=1; }
  sh "$self" team add @Bad.Name "Bad" b@x.com > /dev/null 2>&1 && { echo "FAIL: team add took a bad handle"; fail=1; }
  sh "$self" team add "@neo$NL@evil" "Neo" n@x.com > /dev/null 2>&1 && { echo "FAIL: team add took a multi-line handle"; fail=1; }
  sh "$self" team add @neo "Neo" "neo@x.com, not-an-email" > /dev/null 2>&1 && { echo "FAIL: team add took a bad email"; fail=1; }
  sh "$self" team add @neo "Neo" "neo@x.com$NL" > /dev/null 2>&1 && { echo "FAIL: team add took an email ending in a line break"; fail=1; }
  sh "$self" team add @neo "Ne${NL}o" neo@x.com > /dev/null 2>&1 && { echo "FAIL: team add took a multi-line name"; fail=1; }
  sh "$self" team add @neo "Neo" > /dev/null 2>&1 && { echo "FAIL: team add took no email"; fail=1; }
  printf '99999 ps1\n' > TICKETS.md.lock
  TICKET_META_LOCK_WAIT=1 sh "$self" team add @neo "Neo" neo@x.com > /dev/null 2>&1 && { echo "FAIL: team add wrote through a held board lock"; fail=1; }
  rm -f TICKETS.md.lock
  cmp -s "$tf" "$T/team2.md" || { echo "FAIL: a refused team add changed team.md"; diff "$T/team2.md" "$tf"; fail=1; }
  sh "$self" team list > "$T/out" 2>&1 || { echo "FAIL: team list failed: $(cat "$T/out")"; fail=1; }
  printf -- '@asha: asha@x.com (Asha Rao)\n@vidul: vidul@ikran.in, V2@X.com, x@y.org (Vidul Ikran)\n' > "$T/want"
  cmp -s "$T/out" "$T/want" || { echo "FAIL: team list output"; diff "$T/want" "$T/out"; fail=1; }
  sh "$self" team remove @nobody > /dev/null 2> "$T/err" && { echo "FAIL: team remove took an unknown handle"; fail=1; }
  grep -q 'not in' "$T/err" || { echo "FAIL: unknown-handle refusal does not say not in: $(cat "$T/err")"; fail=1; }
  cmp -s "$tf" "$T/team2.md" || { echo "FAIL: a refused team remove changed team.md"; fail=1; }
  cp TICKETS.md "$T/board-before.md"
  eq "team remove, open tickets" "$(run team remove @asha)" "removed: @asha warning: @asha is still named on open tickets: F1, F3, F8, F9 - reassign them"
  printf -- '# Team\n\n- @vidul: vidul@ikran.in, V2@X.com, x@y.org\n  name: Vidul Ikran\n' > "$T/team3.md"
  cmp -s "$tf" "$T/team3.md" || { echo "FAIL: team remove"; diff "$T/team3.md" "$tf"; fail=1; }
  cmp -s TICKETS.md "$T/board-before.md" || { echo "FAIL: team remove changed the board"; fail=1; }
  [ ! -e TICKETS.md.lock ] || { echo "FAIL: team remove left the board lock behind"; fail=1; }
  eq "team list after remove" "$(run team list)" "@vidul: vidul@ikran.in, V2@X.com, x@y.org (Vidul Ikran)"

  # --- solo, non-monorepo: no workspace folders, no team.md
  S="$T/solo"
  mkdir -p "$S/src" && cd "$S" && git init -q . && git config core.autocrlf false || die "cannot init fixture"
  printf '{ "name": "solo" }\n' > package.json
  printf '# TICKETS\n\n- [ ] F1 %s Thing (@cc-dddddd)\n' "$D" > TICKETS.md
  commit vidul@ikran.in "F1: thing" src/a.js
  eq "solo apps" "$(run apps)" ""
  eq "solo apps-of" "$(run apps-of F1)" ""
  eq "solo by" "$(run by F1)" ""
  sh "$self" assign F1 @vidul > /dev/null 2>&1 && { echo "FAIL: assign worked with no team.md"; fail=1; }
  eq "solo tag" "$(run tag F1)" "- [ ] F1 $D Thing (@cc-dddddd)"

  cd "$T/.." || true
  [ "$fail" = 0 ] || exit 1
  echo ok
}

[ $# -ge 1 ] || die "usage: ticket-meta.sh apps|app-of|by|apps-of|assign|decide|decided|tag|team|selftest"
c=$1; shift
[ "$c" = selftest ] && { selftest; exit 0; }
need_git
export TOP SOH
case $c in
  apps) app_rows | cut -f1 | sort -u ;;
  app-of) for p in "$@"; do printf '%s
' "$p"; done | map_paths ;;
  by) [ $# -eq 1 ] || die "usage: by <ID>"; norm_id "$1"; commits_info "$ID" | by_from ;;
  apps-of) [ $# -eq 1 ] || die "usage: apps-of <ID>"; norm_id "$1"; commits_info "$ID" | apps_from ;;
  assign) cmd_assign "$@" ;;
  decide) cmd_decide "$@" ;;
  decided) cmd_decided "$@" ;;
  tag) cmd_tag "$@" ;;
  team) cmd_team "$@" ;;
  *) die "unknown subcommand: $c" ;;
esac
