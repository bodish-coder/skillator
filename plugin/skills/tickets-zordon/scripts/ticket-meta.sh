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
#   ticket-meta.sh testing <ID> <test>  box -> [%] testing, the line says ` (testing: <test>)`
#   ticket-meta.sh tested <ID> pass|fail  [%] -> [x] (pass) or [~] (fail); the note stays
#   ticket-meta.sh verify <ID> pass|fail <evidence>  F72: [%] -> [x] ` **Verified <date>: ..**`, or stays [%] ` (verify failed <date>: ..)`
#   ticket-meta.sh done <ID> [evidence] box -> [x], tagged, ` **Done <date>: <evidence>**`
#   ticket-meta.sh block <ID> <on what> box -> [!], the line says ` (blocked: <on what>)`
#   ticket-meta.sh defer <ID> <until>   box -> [>], the line says ` (deferred: <until>)`
#   ticket-meta.sh tag <ID>             recompute [app: ..] and [by: ..] on it
#   ticket-meta.sh team add @handle "Name" email[,email...]
#                                       a member into .skillator/team.md
#   ticket-meta.sh team remove @handle  that member out (warns on open tickets)
#   ticket-meta.sh team list            "@handle: emails (Name)" per member, [lead] and (you) marked
#   ticket-meta.sh team lead @handle|-  F80: set / hand over the one lead (no lead, or me is it); - clears
#   ticket-meta.sh whoami               F80: my @handle (F92 session owner, SKILLATOR_ME, else git user.email via the team);
#                                       F109: + `session: @<sid>  mode: <mode>` when there is a session
#   ticket-meta.sh iam @handle          F92: this session's owner (.skillator/sessions/<tag>.owner)
#   ticket-meta.sh stamp <ID>           F109: the trailing (@sid:owner:mode) tag only
#   ticket-meta.sh session              F109: `<sid> <mode>` (`- <mode>` with no session)
#   ticket-meta.sh claim <ID>...        F80: [owner: <me>], the box kept (plan / dispatch)
#   ticket-meta.sh pick [ID...]         F80: `you: ..`, then `pick <ID>` / `skip <ID> <owner>`
#   ticket-meta.sh reconcile [ID...]    F81: read-only, `ID [now] -> [proposed]  reason` per open row
#   ticket-meta.sh unblock <ID>         F81: [!] -> [ ], the (blocked: ..) note dropped
#   ticket-meta.sh start <ID>           F81: [ ] -> [~]
#   ticket-meta.sh selftest             fixture repo, every subcommand, prints ok
#
# F80 claims: a ticket owned by someone else is reassigned (assign, claim) only by
# that owner or the lead. A team convention, not security - git's email is self-set.
#
# F82: every board write runs practice/scripts/board-fresh.sh first, under the
# board lock (a stale board it cannot fast-forward safely: its report, exit 2,
# nothing written), and is committed at once - `board: <subcommand> <ID>`, that
# file only (team writes too: `board: team ..`); `board:` commits are not a ticket's work.
#
# Apps: folders under apps/*, packages/*, services/*, plus package.json
# "workspaces" and pnpm-workspace.yaml globs; the folder name is the app. No such
# folder = no apps. People: .skillator/team.md, lines `- @handle: a@x, b@y`,
# each optionally followed by an indented `  name: Full Name` line, and at most one
# `lead: @handle` line under the `# Team` heading (F80; none = no lead). No team
# file = no people (by prints nothing, assign refuses). `team add` creates it.
# A ticket's commits are the commits on HEAD whose subject names its ID as a
# word (F1 never matches F12 or F1a). The board edited is the main checkout's
# TICKETS.md; only the one ticket line changes, every other byte is kept.
#
# F109: with a session (SKILLATOR_SESSION, else CLAUDE_CODE_SESSION_ID -> cc-<4-char
# code>) every write stamps the line's trailing tag `(@<sid>:<owner or ->:<mode>)`, mode
# from SKILLATOR_MODE (direct|agent|run|workflow, default direct); the old one-field
# `(@cc-xxxxxx)` stays valid and is replaced. A move out of [~] keeps the tag (A143).
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

# F82: the stale-board guard, beside the skills (a clone or plugin:
# <root>/practice/, installed: <skills>/practice/). Run under the board lock,
# before the board is read; its refusal (the report on stderr) is ours, exit 2.
BFRESH=''
for _c in "$(dirname -- "$0")/../../../practice/scripts/board-fresh.sh" "$(dirname -- "$0")/../../practice/scripts/board-fresh.sh"; do
  [ -f "$_c" ] && { BFRESH=$_c; break; }
done
board_fresh() {
  [ -n "$BFRESH" ] || return 0
  sh "$BFRESH" "$MAIN" && return 0
  board_unlock
  echo "ticket-meta: the board was not written - see board-fresh's report above" >&2
  exit 2
}
# F82: a written board (or team file) is committed at once, `board: ..`, that
# path only, so it never sits dirty and unowned. git refusing (no identity, a
# hook, a merge in progress) leaves it written, said, and recorded in dirty.log.
board_commit() {
  _d=$(dirname -- "$1")
  git -C "$_d" ls-files --error-unmatch -- "$1" > /dev/null 2>&1 || return 0
  git -C "$_d" diff --quiet HEAD -- "$1" 2> /dev/null && return 0
  git -C "$_d" commit -q -m "$2" -- "$1" > /dev/null 2>&1 && return 0
  echo "ticket-meta: $1 written but not committed (git refused) - recorded in .skillator/dirty.log" >&2
  [ -z "$BFRESH" ] || sh "$BFRESH" --record "$1" "ticket-meta $SUB"
}

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
      hit = s !~ /^board:/ && match(s, "(^|[^A-Za-z0-9])" ENVIRON["ID"] "([^A-Za-z0-9]|$)")   # F82: board: commits log tickets
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
  board_fresh
  re="^[ \t]*- \\[.\\][ \t]+$ID[ \t]*($EMD|$ENDASH|-)"
  n=$(RE=$re awk '$0 ~ ENVIRON["RE"] { c++ } END { print c + 0 }' "$f")
  [ "$n" = 1 ] || die "$ID: $n matching lines in $f, need exactly 1"
  cur=$(RE=$re awk '$0 ~ ENVIRON["RE"]' "$f" | tr -d '\r')
  mk=$(printf '%s\n' "$cur" | awk '{ match($0, /- \[/); print substr($0, RSTART + 3, 1) }')
  if [ -n "${NEED_MARK:-}" ] && [ "$mk" != "$NEED_MARK" ]; then
    die "$ID is [$mk], not [$NEED_MARK] - nothing to change"
  fi
  # F64: REFUSE_MARKS lists the boxes this change may not start from.
  case ${REFUSE_MARKS:-} in *"$mk"*)
    die "$ID is [$mk] (closed) - reopen it first (assign), then $CMD" ;;
  esac
  # F62/F64: the same note on a line already in that box is a no-op, like a
  # same-handle assignment. NOTE_KEY + NOTE_VAL is ` (<key>: <val>)`.
  if [ -n "${NOTE_VAL:-}" ] && [ "$mk" = "${SET_MARK:-}" ]; then
    v=$(printf '%s\n' "$cur" | K=$NOTE_KEY awk '{ k = ENVIRON["K"]; if (match($0, "\\(" k ":[^()]*\\)")) {
          v = substr($0, RSTART + length(k) + 2, RLENGTH - length(k) - 3); gsub(/^[ \t]+|[ \t]+$/, "", v); print v } }')
    if [ "$v" = "$NOTE_VAL" ]; then
      board_unlock
      printf '%s\n' "$cur"
      echo "no change: $ID is already [$mk] ($NOTE_KEY: $v)"
      return 0
    fi
  fi
  if [ -n "${SAME_KEY:-}" ]; then
    v=$(printf '%s\n' "$cur" | K=$SAME_KEY awk '{ if (match($0, "\\[" ENVIRON["K"] ":[ \t]*[^]]*\\]")) {
          v = substr($0, RSTART, RLENGTH); sub(/^\[[^:]*:[ \t]*/, "", v); sub(/[ \t]*\]$/, "", v); print v } }')
    # a no-op only when the box is already where this assignment puts it (a claim keeps the box)
    if [ "$v" = "$SAME_VAL" ] && { [ "$mk" = "${SET_MARK:-}" ] || [ -z "${SET_MARK:-}" ]; }; then
      board_unlock
      printf '%s\n' "$cur"
      echo "no change: $ID already has [$SAME_KEY: $SAME_VAL]"
      return 0
    fi
  fi
  # F80: a ticket owned by someone else moves only by its owner's or the lead's
  # hand (ME, LEAD from the caller). A team convention, not security.
  if [ -n "${OWN_CHECK:-}" ]; then
    ow=$(printf '%s\n' "$cur" | awk '{ if (match($0, /\[owner:[ \t]*[^]]*\]/)) { v = substr($0, RSTART + 7, RLENGTH - 8); gsub(/^[ \t]+|[ \t]+$/, "", v); print v } }')
    if [ -n "$ow" ] && ! may_take "$ow"; then
      if [ -n "$LEAD" ]; then who="only $ow or the lead $LEAD may reassign it"; else who="only $ow may reassign it (no lead set)"; fi
      die "$ID is owned by $ow - $who (you: ${ME:-$ME_WHY})"
    fi
  fi
  # F106: a start claims an unowned ticket to me; another's is left alone and said.
  CLAIM_NOTE=''
  if [ -n "${CLAIM_FREE:-}" ]; then
    ow=$(printf '%s\n' "$cur" | awk '{ if (match($0, /\[owner:[ \t]*[^]]*\]/)) { v = substr($0, RSTART + 7, RLENGTH - 8); gsub(/^[ \t]+|[ \t]+$/, "", v); print v } }')
    if [ -z "$ow" ] && [ -n "$ME" ]; then SET_OWNER=$ME
    elif [ -z "$ow" ]; then CLAIM_NOTE="note: $ID not claimed - $ME_WHY"
    elif [ "$(lc "$ow")" != "$(lc "$ME")" ]; then CLAIM_NOTE="note: $ID is owned by $ow - not claimed (you: ${ME:-$ME_WHY})"
    fi
    export SET_OWNER
  fi
  # Moving a line out of [~] keeps the working session's trailing (@agent-id)
  # tag (A143: the session tag and [owner:] are different facts) and names
  # that session afterwards, so it can be told its ticket moved.
  moved=0 sess=''
  # F62: [~] -> [%] is the working session's own next step, not a move away from it.
  if [ "$mk" = '~' ] && [ -n "${SET_MARK:-}" ] && [ "$SET_MARK" != '~' ] && [ "$SET_MARK" != '%' ]; then
    moved=1
    sess=$(printf '%s\n' "$cur" | awk '{ if (match($0, /\(@[A-Za-z0-9_.:-]+\)[ \t]*$/)) {
          s = substr($0, RSTART + 1); sub(/\).*/, "", s); print s } }')
  fi
  tag_text
  [ "$moved" = 0 ] || SET_TAG=''
  export SET_TAG
  eol=0
  [ "$(tail -c 1 "$f" | od -An -tx1 | tr -d ' \n')" = 0a ] && eol=1
  tmp="$f.ticket-meta.$$"
  # BINMODE=3: Windows gawk would otherwise drop each line's \r on the way in
  # (B3); elsewhere it is ignored and the \r arrives in $0 as is.
  RE=$re EOL=$eol awk -v BINMODE=3 '
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
    # F62/F64: a note replaces the one matching pat, else goes before a trailing
    # (@agent-id) session tag, else at the end of the line.
    function setnote(line, note, pat) {
      if (match(line, pat))
        return substr(line, 1, RSTART - 1) note substr(line, RSTART + RLENGTH)
      if (match(line, /[ \t]*\(@[A-Za-z0-9_.:-]+\)[ \t]*$/))
        return substr(line, 1, RSTART - 1) note substr(line, RSTART)
      sub(/[ \t]+$/, "", line)
      return line note
    }
    BEGIN { ORD[1] = "app"; ORD[2] = "decide"; ORD[3] = "owner"; ORD[4] = "by"; re = ENVIRON["RE"] }
    { line = $0; cr = ""
      if (sub(/\r$/, "", line)) cr = "\r"
      if (line ~ re) {
        if (ENVIRON["SET_MARK"] != "") {
          match(line, /- \[/); line = substr(line, 1, RSTART + 2) ENVIRON["SET_MARK"] substr(line, RSTART + 4)
        }
        if (ENVIRON["SET_APP"] != "") line = settag(line, "app", ENVIRON["SET_APP"])
        if (ENVIRON["SET_DECIDE"] != "") line = settag(line, "decide", ENVIRON["SET_DECIDE"])
        if (ENVIRON["SET_OWNER"] != "") line = settag(line, "owner", ENVIRON["SET_OWNER"])
        if (ENVIRON["SET_BY"] != "") line = settag(line, "by", ENVIRON["SET_BY"])
        # (testing: ..) replaces only itself; (blocked: ..) and (deferred: ..)
        # replace either - the line says only the current wait (F64).
        if (ENVIRON["NOTE_VAL"] != "") {
          k = ENVIRON["NOTE_KEY"]; p = (k == "testing") ? "testing" : "(blocked|deferred)"
          line = setnote(line, " (" k ": " ENVIRON["NOTE_VAL"] ")", "[ \t]*\\(" p ":[^()]*\\)")
        }
        if (ENVIRON["DROP_BLOCKED"] != "") sub(/[ \t]*\(blocked:[^()]*\)/, "", line)   # F81 unblock
        if (ENVIRON["DONE_NOTE"] != "")
          line = setnote(line, " **Done " ENVIRON["DONE_NOTE"] "**", "[ \t]*\\*\\*Done [^*]*\\*\\*")
        # F72: verify notes - a pass, a fail; each replaces its own earlier one,
        # and a pass drops an earlier (verify failed ..) note
        if (ENVIRON["VERIFIED_NOTE"] != "") {
          # every dated one (the date keeps words in the title safe)
          while (match(line, /[ \t]*\(verify failed [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]: [^()]*\)/))
            line = substr(line, 1, RSTART - 1) substr(line, RSTART + RLENGTH)
          line = setnote(line, " **Verified " ENVIRON["VERIFIED_NOTE"] "**", "[ \t]*\\*\\*Verified [^*]*\\*\\*")
        }
        if (ENVIRON["VFAIL_NOTE"] != "")
          line = setnote(line, " (verify failed " ENVIRON["VFAIL_NOTE"] ")", "[ \t]*\\(verify failed [^()]*\\)")
        # F109: the trailing session tag - replaced (old or new shape) or appended
        if (ENVIRON["SET_TAG"] != "") {
          if (match(line, /[ \t]*\(@[A-Za-z0-9_.:-]+\)[ \t]*$/)) line = substr(line, 1, RSTART - 1) " (" ENVIRON["SET_TAG"] ")"
          else { sub(/[ \t]+$/, "", line); line = line " (" ENVIRON["SET_TAG"] ")" }
        }
      }
      if (NR > 1) printf "\n"
      printf "%s%s", line, cr }
    END { if (NR && ENVIRON["EOL"] == "1") printf "\n" }' "$f" > "$tmp" || { rm -f "$tmp"; die "write failed"; }
  mv -f "$tmp" "$f" || { rm -f "$tmp"; die "cannot replace $f"; }
  board_commit "$f" "board: $SUB $ID"
  board_unlock
  RE=$re awk '$0 ~ ENVIRON["RE"]' "$f"
  [ -z "$CLAIM_NOTE" ] || echo "$CLAIM_NOTE"
  if [ "$moved" = 1 ]; then
    if [ -n "$sess" ]; then
      echo "warning: $ID was in progress under $sess - its box left [~], the session tag stays; tell that session"
    else
      echo "warning: $ID was in progress - its box left [~]; tell whoever was working it"
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

lc() { printf '%s' "$1" | tr 'A-Z' 'a-z'; }

# F109: the 4-character session code - h = (h*33 + byte) mod 36^4 over the raw id's
# bytes, base36. The same fold in ticket-meta.ps1 and ops-board's team.ts; vectors in the selftest.
session_code() {
  printf '%s' "$1" | od -An -tu1 | awk '{ for (i = 1; i <= NF; i++) h = (h * 33 + $i) % 1679616 }
    END { d = "0123456789abcdefghijklmnopqrstuvwxyz"; s = ""
      for (i = 0; i < 4; i++) { s = substr(d, h % 36 + 1, 1) s; h = int(h / 36) }
      print s }'
}

# F92: STAG <- this session's tag as tickets-zordon "Who touched it" names it, no @:
# SKILLATOR_SESSION (any host), else Claude Code's session id -> cc-<code> (F109); else ''.
session_tag() {
  STAG=${SKILLATOR_SESSION:-}
  STAG=$(printf '%s' "${STAG#@}" | tr 'A-Z' 'a-z')
  if [ -z "$STAG" ] && [ -n "${CLAUDE_CODE_SESSION_ID:-}" ]; then STAG=cc-$(session_code "$CLAUDE_CODE_SESSION_ID"); fi
  printf '%s' "$STAG" | grep -Eqx '[a-z0-9_-]+' || STAG=''   # a file name: no / or ..
}

# F109: MODE <- SKILLATOR_MODE, one of direct|agent|run|workflow (default direct).
mode_of() {
  MODE=${SKILLATOR_MODE:-direct}
  case $MODE in direct|agent|run|workflow) ;; *) die "SKILLATOR_MODE must be direct|agent|run|workflow, not '$MODE'" ;; esac
}

# F109: SET_TAG <- "@sid:owner:mode", or '' when this session has no tag.
tag_text() {
  SET_TAG=''
  session_tag; mode_of
  [ -n "$STAG" ] || return 0
  [ -n "${ME:-}" ] || me_of || :
  o=${ME#@}; SET_TAG="@$STAG:${o:--}:$MODE"
}

# F92: iam @handle - this session's owner, asked at session start (grayskull-power's
# arm), kept in <main>/.skillator/sessions/<tag>.owner - git-ignored by the folder's
# own .gitignore, never team.md or git config.
cmd_iam() {
  [ $# -eq 1 ] || die "usage: iam @handle"
  h=$1; case $h in @*) ;; *) h="@$h" ;; esac
  one_line "$h" && printf '%s' "$h" | grep -Eqx '@[A-Za-z0-9_.-]+' || die "not a handle (@name): $1"
  team_file > /dev/null || die "no .skillator/team.md - this repo has no people"
  team_rows | awk '{ print $1 }' | grep -qxF -- "$h" || die "$h is not in .skillator/team.md"
  session_tag
  [ -n "$STAG" ] || die "no session tag - set SKILLATOR_SESSION=@<agent>-<id> (tickets-zordon: Who touched it)"
  sd="$MAIN/.skillator/sessions"
  mkdir -p "$sd" || die "cannot create $sd"
  [ -f "$sd/.gitignore" ] || printf '*\n' > "$sd/.gitignore" || die "cannot write $sd/.gitignore"
  # F109: line 2 names the session, so a colliding code's file is not taken for this one's
  printf '%s\nsession: %s\n' "$h" "${CLAUDE_CODE_SESSION_ID:-$STAG}" > "$sd/$STAG.owner" || die "cannot write $sd/$STAG.owner"
  echo "$h owns session @$STAG"
}

# F80: ME <- the session's person: F92's session owner file
# first, then SKILLATOR_ME=@handle (on the team), else this repo's git user.email
# through the team emails.
# Fails with ME empty and ME_WHY saying why. git's email is self-set: who "me" is
# is a team convention, not security.
me_of() {
  ME='' ME_WHY=''
  team_file > /dev/null || { ME_WHY='no .skillator/team.md'; return 1; }
  session_tag
  sf="$MAIN/.skillator/sessions/$STAG.owner"
  mh='' l2=''
  if [ -n "$STAG" ] && [ -f "$sf" ]; then { IFS= read -r mh; IFS= read -r l2; } < "$sf" || :; mh=${mh%"$CR"} l2=${l2%"$CR"}; fi
  # F109: a file whose line 2 names another session is not this one's (a one-line file is)
  if [ -n "$STAG" ] && [ -f "$sf" ] && { [ -z "$l2" ] || [ "$l2" = "session: ${CLAUDE_CODE_SESSION_ID:-$STAG}" ]; }; then
    if one_line "$mh" && team_rows | awk '{ print $1 }' | grep -qxF -- "$mh"; then ME=$mh; return 0; fi
    ME_WHY="session owner $mh ($sf) is not in .skillator/team.md - iam @handle"; return 1
  fi
  if [ -n "${SKILLATOR_ME:-}" ]; then
    mh=$SKILLATOR_ME; case $mh in @*) ;; *) mh="@$mh" ;; esac
    if one_line "$mh" && team_rows | awk '{ print $1 }' | grep -qxF -- "$mh"; then ME=$mh; return 0; fi
    ME_WHY="SKILLATOR_ME=$SKILLATOR_ME is not in .skillator/team.md"; return 1
  fi
  em=$(git config user.email 2>/dev/null | tr 'A-Z' 'a-z')
  [ -n "$em" ] || { ME_WHY='git user.email is not set - set it, or SKILLATOR_ME=@handle'; return 1; }
  ME=$(team_rows | E=$em awk '$2 == ENVIRON["E"] { print $1; exit }')
  [ -n "$ME" ] && return 0
  ME_WHY="not on the team: add $em to .skillator/team.md"; return 1
}

# LEAD <- the team's one lead: the first `lead: @handle` line of the team file.
lead_of() {
  LEAD=''
  lf=$(team_file) || return 0
  LEAD=$(tr -d '\r' < "$lf" | awk '/^lead:[ \t]*@[A-Za-z0-9_.-]+[ \t]*$/ { sub(/^lead:[ \t]*/, ""); sub(/[ \t]+$/, ""); print; exit }')
  # a lead line naming no member (hand-edited) is no lead, so anyone may set one
  if [ -n "$LEAD" ] && ! team_rows | awk '{ print tolower($1) }' | grep -qxF -- "$(lc "$LEAD")"; then
    echo "note: lead: $LEAD is not on the team - no lead until one is set (team lead @handle)" >&2; LEAD=''
  fi
}

# 0 when ME may move a ticket the handle $1 owns: ME is that owner, or the lead.
may_take() {
  [ -n "$ME" ] || return 1
  [ "$(lc "$1")" = "$(lc "$ME")" ] && return 0
  [ -n "$LEAD" ] && [ "$(lc "$LEAD")" = "$(lc "$ME")" ]
}

# F45: an assignment reopens. Implementation -> [owner:] and the box [ ];
# decision -> [decide:] and the box [?]; the same handle again changes nothing.
# F80: a ticket owned by someone else is reassigned only by that owner or the lead.
cmd_assign() {
  CMD=assign; id_and_handle "$@"
  me_of || :; lead_of
  SET_MARK=' ' SET_APP='' SET_DECIDE='' SET_OWNER=$HANDLE SET_BY='' SAME_KEY=owner SAME_VAL=$HANDLE NEED_MARK='' OWN_CHECK=1 edit_line
}

cmd_whoami() {
  [ $# -eq 0 ] || die "usage: whoami"
  me_of || die "$ME_WHY"
  echo "$ME"
  session_tag; mode_of
  [ -z "$STAG" ] || echo "session: @$STAG  mode: $MODE"
}

# F109: the trailing tag only - relay-morpheus's board flip stamps through this.
cmd_stamp() {
  [ $# -eq 1 ] || die "usage: stamp <ID>"
  norm_id "$1"
  session_tag
  [ -n "$STAG" ] || { echo "no change: no session tag"; return 0; }
  SET_MARK='' SET_APP='' SET_DECIDE='' SET_OWNER='' SET_BY='' NOTE_VAL='' SAME_KEY='' NEED_MARK='' edit_line
}

cmd_session() { [ $# -eq 0 ] || die "usage: session"; session_tag; mode_of; echo "${STAG:--} $MODE"; }

# F80: planning or dispatching a ticket claims it: [owner: <me>], the box kept.
# Mine already: no change. Another's: refused as a reassign is. No team file:
# nothing to claim (as before). Each id on its own; any refusal exits 1.
cmd_claim() {
  CMD=claim
  [ $# -ge 1 ] || die "usage: claim <ID>..."
  team_file > /dev/null || { echo "no change: no .skillator/team.md - nothing to claim"; return 0; }
  me_of || die "$ME_WHY - claim refused"
  lead_of
  crc=0
  for ci in "$@"; do
    ( norm_id "$ci"
      SET_MARK='' SET_APP='' SET_DECIDE='' SET_OWNER=$ME SET_BY='' SAME_KEY=owner SAME_VAL=$ME NEED_MARK='' REFUSE_MARKS='x-' OWN_CHECK=1 edit_line ) || crc=1
  done
  return $crc
}

# F80: which tickets a run may take. `you: <me>` (or `you: - (<why>)`), then per
# ticket `pick <ID>` (unassigned, or mine) or `skip <ID> <owner>`. No ids: every
# open ticket on the board ([ ] [~] [!]). No team file: every ticket is picked;
# not on the team: only unassigned ones. An id not on the board is unassigned.
cmd_pick() {
  bf="$MAIN/TICKETS.md"
  ids=''
  for pi in "$@"; do norm_id "$pi"; ids="$ids $ID"; done
  [ -n "$ids" ] || [ -f "$bf" ] || die "no TICKETS.md at $bf"
  team=''
  if team_file > /dev/null; then
    team=1
    if me_of; then you=$ME; else you="- ($ME_WHY)"; fi
  else
    ME=''; you='- (no .skillator/team.md: every ticket)'
  fi
  rows=''
  [ ! -f "$bf" ] || rows=$(tr -d '\r' < "$bf" | awk '
    match($0, /^[ \t]*- \[.\][ \t]+[A-Z]+[0-9]+[a-z]?/) {
      id = substr($0, RSTART, RLENGTH); sub(/^[ \t]*- \[.\][ \t]+/, "", id)
      mk = substr($0, index($0, "- [") + 3, 1); o = ""
      if (match($0, /\[owner:[ \t]*[^]]*\]/)) { o = substr($0, RSTART + 7, RLENGTH - 8); gsub(/^[ \t]+|[ \t]+$/, "", o) }
      print id "\t" mk "\t" o }')
  echo "you: $you"
  ROWS=$rows IDS=$ids ME=$ME TEAM=$team awk 'BEGIN {
    n = split(ENVIRON["ROWS"], R, "\n")
    for (i = 1; i <= n; i++) { split(R[i], c, "\t"); if (c[1] != "" && !(c[1] in mk)) { mk[c[1]] = c[2]; ow[c[1]] = c[3]; ord[++no] = c[1] } }
    me = tolower(ENVIRON["ME"]); m = split(ENVIRON["IDS"], L, " ")
    if (m == 0) for (i = 1; i <= no; i++) if (mk[ord[i]] ~ /^[ ~!]$/) L[++m] = ord[i]
    for (i = 1; i <= m; i++) { o = ow[L[i]]; b = L[i]; sub(/[a-z]$/, "", b)
      if (!(L[i] in mk) && b != L[i]) o = ow[b]   # a sub-part with no row takes its parent owner
      if (ENVIRON["TEAM"] == "" || o == "" || tolower(o) == me) print "pick " L[i]; else print "skip " L[i] " " o } }'
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

# F62: built, waiting on a test: the box [%] and ` (testing: <test>)` on the
# line. The test is one line, trimmed, not blank, no parentheses (it sits in one).
cmd_testing() {
  [ $# -ge 2 ] || die "usage: testing <ID> <what test>"
  norm_id "$1"; shift
  t=$*
  one_line "$t" || die "the test is one line"
  t=$(printf '%s' "$t" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
  [ -n "$t" ] || die "usage: testing <ID> <what test> - the test is blank"
  case $t in *'('*|*')'*) die "the test cannot hold ( or ) - it sits in (testing: ..)" ;; esac
  SET_MARK='%' SET_APP='' SET_DECIDE='' SET_OWNER='' SET_BY='' NOTE_KEY=testing NOTE_VAL=$t SAME_KEY='' NEED_MARK='' edit_line
}

# The test's result: [%] -> [x] on pass, [~] on fail; the (testing: ..) note stays as the record.
cmd_tested() {
  [ $# -eq 2 ] || die "usage: tested <ID> pass|fail"
  norm_id "$1"
  # any case, as ticket-meta.ps1 takes it
  case $(printf '%s' "$2" | tr '[:upper:]' '[:lower:]') in
    pass) mk='x' ;;
    fail) mk='~' ;;
    *) die "usage: tested <ID> pass|fail - not '$2'" ;;
  esac
  SET_MARK=$mk SET_APP='' SET_DECIDE='' SET_OWNER='' SET_BY='' NOTE_VAL='' SAME_KEY='' NEED_MARK='%' edit_line
}

# F64: NOTE <- the words after the id: one line, trimmed, no parentheses (it
# sits on the line as a note). $1 = what it is, $2 = 1 when it may be blank.
note_text() {
  what=$1 blank=$2; shift 2
  NOTE=$*
  one_line "$NOTE" || die "the $what is one line"
  NOTE=$(printf '%s' "$NOTE" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
  [ -n "$NOTE" ] || [ "$blank" = 1 ] || die "usage: $CMD <ID> <$what> - it is blank"
  case $NOTE in *'('*|*')'*) die "the $what cannot hold ( or ) - it sits on the line as a note" ;; esac
}

# F64: finished and verified: the box [x], the tag a close owes (app + by from
# the commits), and with evidence ` **Done <YYYY-MM-DD>: <evidence>**` - the
# form the board's closed lines use; it replaces an earlier Done note. Refuses
# a cancelled [-] (reopen it with assign first).
cmd_done() {
  CMD=done
  [ $# -ge 1 ] || die "usage: done <ID> [evidence]"
  norm_id "$1"; shift
  note_text evidence 1 "$@"
  case $NOTE in *'*'*) die "the evidence cannot hold * - it sits in **Done ..**" ;; esac
  dn=''
  [ -z "$NOTE" ] || dn="$(date -u +%Y-%m-%d): $NOTE"
  info=$(commits_info "$ID")
  a=$(printf '%s\n' "$info" | apps_from | join_list)
  b=$(printf '%s\n' "$info" | by_from | join_list)
  SET_MARK='x' SET_APP=$a SET_DECIDE='' SET_OWNER='' SET_BY=$b NOTE_VAL='' DONE_NOTE=$dn REFUSE_MARKS='-' SAME_KEY='' NEED_MARK='' edit_line
}

# F72: /verify-subagent's verdict on a [%] ticket, with the evidence (one line,
# no parentheses, no *). pass: [x], tagged as a close is, ` **Verified <date>:
# <evidence>**`. fail: the box stays [%], ` (verify failed <date>: <what failed>)`.
cmd_verify() {
  CMD=verify
  [ $# -ge 3 ] || die "usage: verify <ID> pass|fail <evidence>"
  norm_id "$1"; shift
  vd=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')
  case $vd in pass|fail) ;; *) die "usage: verify <ID> pass|fail <evidence> - not '$1'" ;; esac
  shift
  note_text evidence 0 "$@"
  case $NOTE in *'*'*) die "the evidence cannot hold * - it sits on the line as a note" ;; esac
  dn="$(date -u +%Y-%m-%d): $NOTE"
  if [ "$vd" = fail ]; then
    SET_MARK='' SET_APP='' SET_DECIDE='' SET_OWNER='' SET_BY='' NOTE_VAL='' VFAIL_NOTE=$dn SAME_KEY='' NEED_MARK='%' edit_line
    return
  fi
  info=$(commits_info "$ID")
  a=$(printf '%s\n' "$info" | apps_from | join_list)
  b=$(printf '%s\n' "$info" | by_from | join_list)
  SET_MARK='x' SET_APP=$a SET_DECIDE='' SET_OWNER='' SET_BY=$b NOTE_VAL='' VERIFIED_NOTE=$dn SAME_KEY='' NEED_MARK='%' edit_line
}

# F64: can't proceed until something outside it lands: [!], ` (blocked: <on what>)`.
cmd_block() {
  CMD=block
  [ $# -ge 2 ] || die "usage: block <ID> <on what>"
  norm_id "$1"; shift
  note_text 'on what' 0 "$@"
  SET_MARK='!' SET_APP='' SET_DECIDE='' SET_OWNER='' SET_BY='' NOTE_KEY=blocked NOTE_VAL=$NOTE REFUSE_MARKS='x-' SAME_KEY='' NEED_MARK='' edit_line
}

# F64: postponed by choice until a condition: [>], ` (deferred: <until what>)`.
cmd_defer() {
  CMD=defer
  [ $# -ge 2 ] || die "usage: defer <ID> <until what>"
  norm_id "$1"; shift
  note_text 'until what' 0 "$@"
  SET_MARK='>' SET_APP='' SET_DECIDE='' SET_OWNER='' SET_BY='' NOTE_KEY=deferred NOTE_VAL=$NOTE REFUSE_MARKS='x-' SAME_KEY='' NEED_MARK='' edit_line
}

# F81: the wait is over: [!] -> [ ], its (blocked: ..) note dropped. Only from [!].
cmd_unblock() {
  [ $# -eq 1 ] || die "usage: unblock <ID>"
  norm_id "$1"
  SET_MARK=' ' SET_APP='' SET_DECIDE='' SET_OWNER='' SET_BY='' NOTE_VAL='' DROP_BLOCKED=1 SAME_KEY='' NEED_MARK='!' edit_line
}

# F81: work on it has begun: [ ] -> [~]. Only from [ ]. F106: an unowned ticket is claimed
# to me on the way (a team file and a known me); another's is left alone and said.
cmd_start() {
  [ $# -eq 1 ] || die "usage: start <ID>"
  norm_id "$1"
  cf=''
  if team_file > /dev/null; then cf=1; me_of || :; fi
  SET_MARK='~' SET_APP='' SET_DECIDE='' SET_OWNER='' SET_BY='' NOTE_VAL='' SAME_KEY='' NEED_MARK=' ' CLAIM_FREE=$cf edit_line
}

# F81: read-only - the status each open row really has, from evidence. One line per
# row with something to say: `<ID> [<now>] -> [<proposed>]  <reason>`; a row its
# evidence does not settle keeps its box, the reason opening 'evidence unclear'.
# Rules, first that holds: a check owed by the owner or a team (a (testing: ..)
# note, a live check, a release build, a device / rig / hardware, a team to
# confirm) with the code landed -> [%]; [!] whose (blocked: ..) names tickets, all
# [x] -> [ ]; a run stage on it failed, or in flight with no heartbeat for a day ->
# [!]; landed -> [%]; [ ] with commits naming it -> [~]. Never [x] (verify's job).
# Landed: the ticket's last run stage is x, or (no stage) a commit names it; a [!]
# still blocked on an open ticket is never owed. Commits: the main checkout's,
# the subject's leading ids, `board:` subjects left out (they log tickets, not
# work). Stages: .skillator/run-*.md rows led by the id (after a stage code); the
# last by run and stage number counts, whatever its state. A [~] row with a session tag is that
# session's - nothing proposed (/sync-tickets' rule). IDs given: only those rows.
cmd_reconcile() {
  bf="$MAIN/TICKETS.md"
  [ -f "$bf" ] || die "no TICKETS.md at $bf"
  ids=''
  for ri in "$@"; do norm_id "$ri"; ids="$ids $ID"; done
  set --
  for ri in $ids; do set -- "$@" --grep="$ri"; done
  {
    echo "${SOH}C"
    git -C "$MAIN" -c log.showSignature=false log -F "$@" --format='%h%x09%s' 2>/dev/null
    echo "${SOH}S"
    for rf in "$MAIN"/.skillator/run-*.md; do
      [ -f "$rf" ] || continue
      rn=${rf##*/}; rn=${rn#run-}; rn=${rn%%-*}; rn=${rn%.md}
      case $rn in ''|*[!0-9]*) continue ;; esac
      tr -d '\r' < "$rf" | RN=$rn awk -F'|' '/^\| *[0-9]+ *\|/ {
        for (i = 2; i <= 7; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i)
        print (ENVIRON["RN"] + 0) "\t" $2 "\t" $4 "\t" $3 "\t" $6 "\t" $7 }'
    done | sort -t "$(printf '\t')" -k1,1n -k2,2n
    echo "${SOH}B"
    tr -d '\r' < "$bf"
  } | IDS=$ids NOW=$(date -u +%Y-%m-%dT%H:%MZ) awk -F'\t' '
    function days(y, m, d,    era, yoe, doy, doe) {
      y -= (m <= 2); era = int((y >= 0 ? y : y - 399) / 400); yoe = y - era * 400
      doy = int((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
      doe = yoe * 365 + int(yoe / 4) - int(yoe / 100) + doy
      return era * 146097 + doe - 719468 }
    function mins(s,    P) {
      if (s !~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]Z$/) return -1
      split(s, P, /[-TZ:]/); return days(P[1] + 0, P[2] + 0, P[3] + 0) * 1440 + P[4] * 60 + P[5] }
    # the ticket ids in s, as words (F1 is never F12 or F1a), into out[1..n]
    function words(s, out,    n, i, w, k) {
      gsub(/[^A-Za-z0-9]+/, " ", s); n = split(s, w, " "); k = 0
      for (i = 1; i <= n; i++) if (w[i] ~ /^[A-Z][A-Z]?[A-Z]?[0-9]+[a-z]?$/) out[++k] = w[i]
      return k }
    # the tickets a commit subject or stage name is about: its leading ids, a stage code before them skipped
    function lead(s, out,    n, i, w, k) {
      gsub(/[^A-Za-z0-9]+/, " ", s); n = split(s, w, " "); k = 0
      for (i = 1; i <= n; i++) {
        if (w[i] ~ /^[A-Z][A-Z]?[A-Z]?[0-9]+[a-z]?$/) out[++k] = w[i]
        else if (i > 1 || w[i] !~ /^[A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9]$/) break }
      return k }
    function owed(s,    x, t) {
      if (match(s, /\(testing:[^()]*\)/)) {
        x = substr(s, RSTART + 9, RLENGTH - 10); gsub(/^[ \t]+|[ \t]+$/, "", x)
        if (x != "") return "owed: " x }
      t = tolower(s)
      if (t ~ /owner live|live look|live check|live test/) return "the owner must confirm: a live check"
      if (t ~ /release build/) return "the software team must confirm: a release build"
      if (t ~ /hardware|device|(^|[^a-z])rig([^a-z]|$)/) return "the hardware team must confirm: on the device or rig"
      if (t ~ /team to confirm|team must confirm/) return "the team must confirm"
      return "" }
    function join(a, b) { return a == "" ? b : a ", " b }
    function say(id, from, to, why) { gsub(/[()]/, "", why); printf "%s [%s] -> [%s]  %s\n", id, from, to, why; said = 1 }
    function stage(id) { return srun[id] " stage " snum[id] }
    BEGIN { m = split(ENVIRON["IDS"], L, " "); for (i = 1; i <= m; i++) want[L[i]] = 1; now = mins(ENVIRON["NOW"]) }
    index($0, ENVIRON["SOH"]) == 1 { sec = substr($0, 2, 1); next }
    sec == "C" {
      s = substr($0, length($1) + 2)
      if (s ~ /^board:/) next
      n = lead(s, W); split("", seen)
      for (j = 1; j <= n; j++) if (!(W[j] in seen)) { seen[W[j]] = 1; if (!(W[j] in cn)) cs[W[j]] = $1; cn[W[j]]++ }
      next }
    sec == "S" {
      n = lead($4, W)
      for (j = 1; j <= n; j++) { w = W[j]; st[w] = $3; srun[w] = sprintf("RUN-%04d", $1); snum[w] = $2; shb[w] = $5; sland[w] = $6 }
      next }
    sec == "B" && match($0, /^[ \t]*- \[.\][ \t]+[A-Z]+[0-9]+[a-z]?/) {
      id = substr($0, RSTART, RLENGTH); sub(/^[ \t]*- \[.\][ \t]+/, "", id)
      if (id in mk) next
      mk[id] = substr($0, index($0, "- [") + 3, 1); ord[++nb] = id; text[id] = $0 }
    END {
      for (i = 1; i <= nb; i++) {
        id = ord[i]; k = mk[id]; line = text[id]
        if (m > 0 && !(id in want)) continue
        if (k != " " && k != "~" && k != "!") continue
        if (k == "~" && line ~ /\(@[A-Za-z0-9_.:-]+\)[ \t]*$/) continue
        # landed: a run stage on it decides (only x is), else a commit on main
        ev = (id in st) ? (st[id] == "x" ? stage(id) " " sland[id] : "") : (id in cn) ? cs[id] : ""
        o = owed(line); open = ""
        hb = k == "!" && match(line, /\(blocked:[^()]*\)/)
        if (hb) {
          b = substr(line, RSTART + 9, RLENGTH - 10); gsub(/^[ \t]+|[ \t]+$/, "", b)
          n = words(b, W); gone = ""; done = ""
          for (j = 1; j <= n; j++) {
            if (!(W[j] in mk)) gone = join(gone, W[j])
            else if (mk[W[j]] != "x") open = join(open, W[j])
            else done = join(done, W[j]) } }
        if (ev != "" && o != "" && open == "") { say(id, k, "%", "code landed in " ev "; " o); continue }
        if (k == "!") {
          if (!hb) { say(id, k, k, "evidence unclear: no blocked note on the line"); continue }
          if (n == 0) say(id, k, k, "evidence unclear: blocked on \047" b "\047, no ticket to check")
          else if (gone != "") say(id, k, k, "evidence unclear: blocked on " gone ", not on the board")
          else if (open == "") say(id, k, " ", "blocked on " done ", now done")
        } else if (k == "~") {
          if (st[id] == "!") say(id, k, "!", stage(id) " failed")
          else if (st[id] == "~") {
            a = mins(shb[id])
            if (a < 0) say(id, k, k, "evidence unclear: " stage(id) " in flight, no heartbeat")
            else if (now - a >= 1440) say(id, k, "!", stage(id) " stale, last heartbeat " shb[id])
          } else if (st[id] == "x") say(id, k, "%", stage(id) " landed " sland[id] " - verify its Done line")
        } else if (st[id] == "x") say(id, k, "%", stage(id) " landed " sland[id] " - verify its Done line")
        else if (id in cn) say(id, k, "~", cn[id] (cn[id] == 1 ? " commit names it" : " commits name it") ", newest " cs[id])
      }
      if (!said) print "no change: nothing to reconcile" }'
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

TEAM_USAGE='usage: team add @handle "Name" email[,email...] | team remove @handle | team list | team lead @handle|-'

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
  cr=''
  tmp="$f.ticket-meta.$$"
  if [ -f "$f" ]; then
    lh=$(printf '%s' "$TH" | tr 'A-Z' 'a-z')
    team_members "$f" | cut -f1 | tr 'A-Z' 'a-z' | grep -qxF -- "$lh" && die "$TH is already in $f"
    cat "$f" > "$tmp" || { rm -f "$tmp"; die "write failed"; }
    # the file's own line ending (its first line's) is kept; LF or a new file stays LF (A137)
    [ "$(head -n 1 "$f" | tail -c 2 | od -An -tx1 | tr -d ' \n')" = 0d0a ] && cr=$(printf '\r')
    if [ -s "$f" ] && [ "$(tail -c 1 "$f" | od -An -tx1 | tr -d ' \n')" != 0a ]; then printf '%s\n' "$cr" >> "$tmp"; fi
  else
    mkdir -p "${f%/*}" || die "cannot create ${f%/*}"
    printf '# Team\n\n' > "$tmp" || { rm -f "$tmp"; die "write failed"; }
  fi
  printf -- '- %s: %s%s\n  name: %s%s\n' "$TH" "$EMS" "$cr" "$NAME" "$cr" >> "$tmp" || { rm -f "$tmp"; die "write failed"; }
  mv -f "$tmp" "$f" || { rm -f "$tmp"; die "cannot replace $f"; }
  board_commit "$f" "board: team add $TH"
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
  lead_of
  [ "$(lc "$TH")" != "$(lc "$LEAD")" ] || die "$TH is the lead - hand the lead over first (team lead @other), then remove"
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
  board_commit "$f" "board: team remove $TH"
  board_unlock
  echo "removed: $TH"
  b="$MAIN/TICKETS.md"
  [ -f "$b" ] || return 0
  ids=$(tr -d '\r' < "$b" | H=$TH awk '
    match($0, /^[ \t]*- \[.\][ \t]+[A-Z]+[0-9]+[a-z]?/) {
      id = substr($0, RSTART, RLENGTH); sub(/^[ \t]*- \[.\][ \t]+/, "", id)
      mk = substr($0, index($0, "- [") + 3, 1)
      if (mk != " " && mk != "~" && mk != "!" && mk != "?" && mk != "%") next   # open: [ ] [~] [!] [?] [%]
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

# list: "@handle: a@x, b@y (Name)" per member, file order, the lead marked
# ` [lead]` and me ` (you)`; no team file = nothing.
team_list() {
  [ $# -eq 0 ] || die "$TEAM_USAGE"
  me_of || :; lead_of
  f=$(team_file) || return 0
  team_members "$f" | ME=$ME LEAD=$LEAD awk -F'\t' '{ s = $1 ":"; if ($2 != "") s = s " " $2; if ($3 != "") s = s " (" $3 ")"
    if ($1 == ENVIRON["LEAD"]) s = s " [lead]"; if ($1 == ENVIRON["ME"]) s = s " (you)"; print s }'
}

# F80: lead @handle sets the one `lead:` line under `# Team` (a member only;
# allowed when there is no lead, or me is the lead - a hand-over); lead - clears
# it (the lead only). Every other byte and the line endings stay.
team_lead() {
  [ $# -eq 1 ] || die "$TEAM_USAGE"
  if [ "$1" = - ]; then TH=-; else team_handle "$1" '@[A-Za-z0-9_.-]+' 'letters, digits, _ . -'; fi
  me_of || :
  tl=$(team_file) || die "no .skillator/team.md - this repo has no people"
  board_lock "$MAIN/TICKETS.md.lock"
  [ "$TH" = - ] || team_members "$tl" | cut -f1 | grep -qxF -- "$TH" || die "$TH is not in $tl"
  lead_of
  if [ -n "$LEAD" ]; then
    if [ "$TH" = "$LEAD" ]; then board_unlock; echo "no change: $TH is already the lead"; return 0; fi
    [ -n "$ME" ] && [ "$(lc "$ME")" = "$(lc "$LEAD")" ] || die "only the lead $LEAD may hand the lead over or clear it (you: ${ME:-$ME_WHY})"
  elif [ "$TH" = - ]; then
    board_unlock; echo "no change: no lead set"; return 0
  fi
  cr=''
  [ "$(head -n 1 "$tl" | tail -c 2 | od -An -tx1 | tr -d ' \n')" = 0d0a ] && cr=$(printf '\r')
  eol=0
  [ "$(tail -c 1 "$tl" | od -An -tx1 | tr -d ' \n')" = 0a ] && eol=1
  tmp="$tl.ticket-meta.$$"
  if [ "$TH" != - ] && ! tr -d '\r' < "$tl" | grep -Eq '^(lead:|# Team[[:blank:]]*$)'; then
    printf '# Team%s\n%s\nlead: %s%s\n%s\n' "$cr" "$cr" "$TH" "$cr" "$cr" > "$tmp" && cat "$tl" >> "$tmp" || { rm -f "$tmp"; die "write failed"; }
  else
    # every lead: line goes and the first is replaced; none -> in under the # Team heading
    V=$TH CR=$cr EOL=$eol awk -v BINMODE=3 '
      function out(s) { if (k++) printf "\n"; printf "%s", s }
      BEGIN { v = ENVIRON["V"]; nl = (v != "-") ? "lead: " v ENVIRON["CR"] : ""; had = 0 }
      FNR == NR { l = $0; sub(/\r$/, "", l); if (l ~ /^lead:/) had = 1; next }
      { l = $0; sub(/\r$/, "", l)
        if (l ~ /^lead:/) { if (!done && nl != "") out(nl); done = 1; next }
        out($0)
        if (!had && !done && l ~ /^# Team[ \t]*$/) { if (nl != "") out(nl); done = 1 } }
      END { if (k && ENVIRON["EOL"] == "1") printf "\n" }' "$tl" "$tl" > "$tmp" || { rm -f "$tmp"; die "write failed"; }
  fi
  mv -f "$tmp" "$tl" || { rm -f "$tmp"; die "cannot replace $tl"; }
  board_commit "$tl" "board: team lead $TH"
  board_unlock
  if [ "$TH" = - ]; then echo "lead cleared"; else echo "lead: $TH"; fi
}

cmd_team() {
  [ $# -ge 1 ] || die "$TEAM_USAGE"
  sub=$1; shift
  case $sub in
    add) team_add "$@" ;;
    remove) team_remove "$@" ;;
    list) team_list "$@" ;;
    lead) team_lead "$@" ;;
    *) die "$TEAM_USAGE" ;;
  esac
}

selftest() {
  self=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/$(basename -- "$0")
  T=$(mktemp -d 2>/dev/null || mktemp -d -t ticketmeta)
  trap 'rm -rf "$T"' EXIT
  # F80: who "me" is comes from git's user.email - never this machine's global one
  : > "$T/gitconfig"; GIT_CONFIG_GLOBAL="$T/gitconfig"; export GIT_CONFIG_GLOBAL; unset SKILLATOR_ME SKILLATOR_SESSION CLAUDE_CODE_SESSION_ID SKILLATOR_MODE
  # F82: board writes commit; EMAIL is git's last fallback, so user.email (whoami) stays unset
  printf '[user]\n\tname = t\n' > "$T/gitconfig"; EMAIL=board@selftest.invalid; export EMAIL
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
  eq "F82: board write committed" "$(git log -1 --format=%s)" "board: assign F12"
  eq "F82: board left clean" "$(git status --porcelain -- TICKETS.md)" ""
  eq "assign F1" "$(run assign F1 asha)" "- [ ] F1 $D Dark mode [owner: @asha] (@cc-bbbbbb) warning: F1 was in progress under @cc-bbbbbb - its box left [~], the session tag stays; tell that session"
  git config user.email asha@x.com   # F80: only the owner (or the lead) reassigns
  eq "reassign F1" "$(run assign F1 @vidul)" "- [ ] F1 $D Dark mode [owner: @vidul] (@cc-bbbbbb)"
  eq "tag F1" "$(run tag F1)" "- [ ] F1 $D Dark mode [app: ui, web] [owner: @vidul] [by: @vidul] (@cc-bbbbbb)"
  eq "tag B2" "$(run tag B2)" "- [ ] B2 $D Button misaligned [app: ui] [by: ghost@x.com] (@cc-aaaaaa)"
  eq "tag F3 keeps hand app" "$(run tag F3)" "- [ ] F3 $D Hand tagged [app: web] (@cc-cccccc)"
  sh "$self" tag F9 > /dev/null 2>&1 && { echo "FAIL: tag accepted a missing ticket"; fail=1; }
  printf '# TICKETS\n\n## Bugs\n\n- [ ] B2 %s Button misaligned [app: ui] [by: ghost@x.com] (@cc-aaaaaa)\n\n## Features\n\n- [ ] F1 %s Dark mode [app: ui, web] [owner: @vidul] [by: @vidul] (@cc-bbbbbb)\n- [ ] F12 %s Bulk delete [owner: @asha]\n- [ ] F3 %s Hand tagged [app: web] (@cc-cccccc)\n' \
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
  # 3: a hand-written [owner:@x] is replaced, not duplicated (by its owner, F80)
  git config user.email vidul@ikran.in
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
  # the same handle with the box not yet the target still moves the box (by its owner, F80 review)
  eq "same owner from [x]" "$(SKILLATOR_ME=@asha sh "$self" assign F27 @asha 2>&1)" "- [ ] F27 $D Kept [owner: @asha]"
  eq "same decider from [ ]" "$(run decide F28 @asha)" "- [?] F28 $D Decided before [decide: @asha]"
  eq "same owner from [?]" "$(SKILLATOR_ME=@vidul sh "$self" assign F29 @vidul 2>&1)" "- [ ] F29 $D Owner waiting [owner: @vidul]"
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
  eq "assign from [~]" "$(head -n 1 "$T/out" | tr -d '\r')" "- [ ] F31 $D Working [owner: @asha] (@cc-bbbbbb)"
  grep -q 'F31 was in progress under @cc-bbbbbb' "$T/out" || { echo "FAIL: no warning naming the [~] session: $(cat "$T/out")"; fail=1; }
  sh "$self" decide F32 @vidul > "$T/out" 2>&1 || { echo "FAIL: decide of a [~] ticket failed: $(cat "$T/out")"; fail=1; }
  eq "decide from [~]" "$(head -n 1 "$T/out" | tr -d '\r')" "- [?] F32 $D Busy [decide: @vidul] (a note) (@cc-cccccc)"
  grep -q 'F32 was in progress under @cc-cccccc' "$T/out" || { echo "FAIL: no warning naming the [~] session: $(cat "$T/out")"; fail=1; }
  # A143: the session tag and the owner are different facts - both stay on the board
  grep -q "^- \[ \] F31 $D Working \[owner: @asha\] (@cc-bbbbbb)\$" TICKETS.md || { echo "FAIL: assign dropped the [~] session tag"; fail=1; }
  grep -q 'no longer the owner' "$T/out" && { echo "FAIL: warning still says the session lost the ticket: $(cat "$T/out")"; fail=1; }
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
    printf -- '- [ ] F31 %s Working [owner: @asha] (@cc-bbbbbb)\n' "$D"
    printf -- '- [?] F32 %s Busy [decide: @vidul] (a note) (@cc-cccccc)\n' "$D"
  } > "$T/want45.md"
  cmp -s TICKETS.md "$T/want45.md" || { echo "FAIL: F45 board bytes"; diff "$T/want45.md" TICKETS.md; fail=1; }

  # --- F62: [%] testing - built, waiting on a test; pass -> [x], fail -> [~]
  P="$T/f62"
  mkdir -p "$P" && cd "$P" && git init -q . && git config core.autocrlf false || die "cannot init fixture"
  {
    printf -- '# TICKETS\n\n'
    printf -- '- [~] F40 %s Built (@cc-dddddd)\n' "$D"
    printf -- '- [ ] F41 %s Plain\n' "$D"
    printf -- '- [%%] F42 %s Under test (testing: old check)\n' "$D"
    printf -- '- [%%] F43 %s Passing (testing: unit run)\n' "$D"
    printf -- '- [%%] F44 %s Failing (testing: live check)\n' "$D"
    printf -- '- [ ] F46 %s Not testing\n' "$D"
  } > TICKETS.md
  commit vidul@ikran.in "init" README.md
  sh "$self" testing F40 owner live check in Antigravity > "$T/out" 2>&1 || { echo "FAIL: testing a [~] ticket failed: $(cat "$T/out")"; fail=1; }
  eq "testing from [~]" "$(head -n 1 "$T/out" | tr -d '\r')" "- [%] F40 $D Built (testing: owner live check in Antigravity) (@cc-dddddd)"
  grep -q 'was in progress' "$T/out" && { echo "FAIL: testing warned like a reassignment: $(cat "$T/out")"; fail=1; }
  eq "testing from [ ]" "$(run testing F41 'unit tests')" "- [%] F41 $D Plain (testing: unit tests)"
  eq "testing replaces the note" "$(run testing F42 '  new check ')" "- [%] F42 $D Under test (testing: new check)"
  sh "$self" testing F42 new check > "$T/out" 2>&1 || { echo "FAIL: same testing failed: $(cat "$T/out")"; fail=1; }
  grep -q 'no change' "$T/out" || { echo "FAIL: same testing did not say no change: $(cat "$T/out")"; fail=1; }
  eq "tested pass, any case" "$(run tested F43 PaSs)" "- [x] F43 $D Passing (testing: unit run)"
  eq "tested fail, any case" "$(run tested F44 fAiL)" "- [~] F44 $D Failing (testing: live check)"
  cp TICKETS.md "$T/f62a.md"
  sh "$self" tested F46 pass > /dev/null 2>&1 && { echo "FAIL: tested flipped a ticket that is not [%]"; fail=1; }
  sh "$self" tested F42 maybe > /dev/null 2>&1 && { echo "FAIL: tested took a verdict that is not pass/fail"; fail=1; }
  sh "$self" tested F42 > /dev/null 2>&1 && { echo "FAIL: tested took no verdict"; fail=1; }
  sh "$self" testing F46 > /dev/null 2>&1 && { echo "FAIL: testing took no test"; fail=1; }
  sh "$self" testing F46 '  ' > /dev/null 2>&1 && { echo "FAIL: testing took a blank test"; fail=1; }
  sh "$self" testing F46 'run (it)' > /dev/null 2>&1 && { echo "FAIL: testing took a test with parentheses"; fail=1; }
  sh "$self" testing F46 "a${NL}b" > /dev/null 2>&1 && { echo "FAIL: testing took a test with a line break"; fail=1; }
  cmp -s TICKETS.md "$T/f62a.md" || { echo "FAIL: a refused testing/tested changed the board"; fail=1; }
  {
    printf -- '# TICKETS\n\n'
    printf -- '- [%%] F40 %s Built (testing: owner live check in Antigravity) (@cc-dddddd)\n' "$D"
    printf -- '- [%%] F41 %s Plain (testing: unit tests)\n' "$D"
    printf -- '- [%%] F42 %s Under test (testing: new check)\n' "$D"
    printf -- '- [x] F43 %s Passing (testing: unit run)\n' "$D"
    printf -- '- [~] F44 %s Failing (testing: live check)\n' "$D"
    printf -- '- [ ] F46 %s Not testing\n' "$D"
  } > "$T/want62.md"
  cmp -s TICKETS.md "$T/want62.md" || { echo "FAIL: F62 board bytes"; diff "$T/want62.md" TICKETS.md; fail=1; }

  # --- F64: done / block / defer - the boxes /sync-tickets used to hand-edit
  Q="$T/f64"
  mkdir -p "$Q/apps/web" && cd "$Q" && git init -q . && git config core.autocrlf false || die "cannot init fixture"
  {
    printf -- '# TICKETS\n\n'
    printf -- '- [~] F50 %s Built (@cc-eeeeee)\n' "$D"
    printf -- '- [%%] F51 %s Tested (testing: unit run)\n' "$D"
    printf -- '- [ ] F52 %s Plain\n' "$D"
    printf -- '- [!] F53 %s Stuck (blocked: old dep)\n' "$D"
    printf -- '- [~] F54 %s Busy (@cc-ffffff)\n' "$D"
    printf -- '- [?] F55 %s Choice [decide: @asha]\n' "$D"
    printf -- '- [-] F56 %s Dropped\n' "$D"
    printf -- '- [x] F57 %s Shipped\n' "$D"
    printf -- '- [>] F58 %s Later (deferred: q4)\n' "$D"
  } > TICKETS.md
  commit vidul@ikran.in "init" README.md
  commit vidul@ikran.in "F50: built" apps/web/a.js
  TODAY=$(date -u +%Y-%m-%d)
  sh "$self" done F50 RED/GREEN 3/3, abc1234 > "$T/out" 2>&1 || { echo "FAIL: done of a [~] ticket failed: $(cat "$T/out")"; fail=1; }
  eq "done from [~], tagged, evidence" "$(head -n 1 "$T/out" | tr -d '\r')" "- [x] F50 $D Built [app: web] **Done $TODAY: RED/GREEN 3/3, abc1234** (@cc-eeeeee)"
  grep -q 'F50 was in progress under @cc-eeeeee' "$T/out" || { echo "FAIL: done from [~] did not warn: $(cat "$T/out")"; fail=1; }
  eq "done from [%], no evidence" "$(run done F51)" "- [x] F51 $D Tested (testing: unit run)"
  eq "block from [ ]" "$(run block F52 needs S3 creds from ops)" "- [!] F52 $D Plain (blocked: needs S3 creds from ops)"
  eq "block replaces the note" "$(run block F53 '  new dep ')" "- [!] F53 $D Stuck (blocked: new dep)"
  sh "$self" block F53 new dep > "$T/out" 2>&1 || { echo "FAIL: same block failed: $(cat "$T/out")"; fail=1; }
  grep -q 'no change' "$T/out" || { echo "FAIL: same block did not say no change: $(cat "$T/out")"; fail=1; }
  sh "$self" defer F54 after the parser rewrite > "$T/out" 2>&1 || { echo "FAIL: defer of a [~] ticket failed: $(cat "$T/out")"; fail=1; }
  eq "defer from [~]" "$(head -n 1 "$T/out" | tr -d '\r')" "- [>] F54 $D Busy (deferred: after the parser rewrite) (@cc-ffffff)"
  grep -q 'F54 was in progress under @cc-ffffff' "$T/out" || { echo "FAIL: defer from [~] did not warn: $(cat "$T/out")"; fail=1; }
  eq "defer from [?] keeps tags" "$(run defer F55 q1)" "- [>] F55 $D Choice [decide: @asha] (deferred: q1)"
  sh "$self" defer F58 q4 > "$T/out" 2>&1 || { echo "FAIL: same defer failed: $(cat "$T/out")"; fail=1; }
  grep -q 'no change' "$T/out" || { echo "FAIL: same defer did not say no change: $(cat "$T/out")"; fail=1; }
  eq "block from [>] replaces deferred" "$(run block F58 the vendor fix)" "- [!] F58 $D Later (blocked: the vendor fix)"
  cp TICKETS.md "$T/f64a.md"
  sh "$self" done F56 > /dev/null 2>&1 && { echo "FAIL: done closed a cancelled ticket"; fail=1; }
  sh "$self" block F57 dep > /dev/null 2>&1 && { echo "FAIL: block took a closed [x] ticket"; fail=1; }
  sh "$self" defer F56 later > /dev/null 2>&1 && { echo "FAIL: defer took a cancelled ticket"; fail=1; }
  sh "$self" block F99 dep > /dev/null 2> "$T/err" && { echo "FAIL: block took an unknown id"; fail=1; }
  grep -q '0 matching lines' "$T/err" || { echo "FAIL: unknown-id refusal: $(cat "$T/err")"; fail=1; }
  sh "$self" block F52 > /dev/null 2>&1 && { echo "FAIL: block took no reason"; fail=1; }
  sh "$self" defer F52 '  ' > /dev/null 2>&1 && { echo "FAIL: defer took a blank condition"; fail=1; }
  sh "$self" block F52 'a (b)' > /dev/null 2>&1 && { echo "FAIL: block took parentheses"; fail=1; }
  sh "$self" defer F52 "a${NL}b" > /dev/null 2>&1 && { echo "FAIL: defer took a line break"; fail=1; }
  sh "$self" done F52 'run (it)' > /dev/null 2>&1 && { echo "FAIL: done took parentheses"; fail=1; }
  sh "$self" done F52 "a${NL}b" > /dev/null 2>&1 && { echo "FAIL: done took a line break"; fail=1; }
  sh "$self" done F52 'a ** b' > /dev/null 2>&1 && { echo "FAIL: done took an asterisk"; fail=1; }
  sh "$self" done "$(printf 'F52\nF53')" > /dev/null 2>&1 && { echo "FAIL: done took a multi-line id"; fail=1; }
  cmp -s TICKETS.md "$T/f64a.md" || { echo "FAIL: a refused done/block/defer changed the board"; diff "$T/f64a.md" TICKETS.md; fail=1; }
  {
    printf -- '# TICKETS\n\n'
    printf -- '- [x] F50 %s Built [app: web] **Done %s: RED/GREEN 3/3, abc1234** (@cc-eeeeee)\n' "$D" "$TODAY"
    printf -- '- [x] F51 %s Tested (testing: unit run)\n' "$D"
    printf -- '- [!] F52 %s Plain (blocked: needs S3 creds from ops)\n' "$D"
    printf -- '- [!] F53 %s Stuck (blocked: new dep)\n' "$D"
    printf -- '- [>] F54 %s Busy (deferred: after the parser rewrite) (@cc-ffffff)\n' "$D"
    printf -- '- [>] F55 %s Choice [decide: @asha] (deferred: q1)\n' "$D"
    printf -- '- [-] F56 %s Dropped\n' "$D"
    printf -- '- [x] F57 %s Shipped\n' "$D"
    printf -- '- [!] F58 %s Later (blocked: the vendor fix)\n' "$D"
  } > "$T/want64.md"
  cmp -s TICKETS.md "$T/want64.md" || { echo "FAIL: F64 board bytes"; diff "$T/want64.md" TICKETS.md; fail=1; }
  # A137 / B3: a CRLF board stays CRLF through done, block and defer; LF stays LF
  for nl in crlf lf; do
    r=''; [ "$nl" = crlf ] && r=$(printf '\r')
    printf -- "# TICKETS$r\n$r\n- [~] F50 %s One (@cc-eeeeee)$r\n- [ ] F52 %s Two$r\n- [ ] F53 %s Three$r\n" "$D" "$D" "$D" > TICKETS.md
    sh "$self" done F50 unit run > /dev/null 2>&1 || { echo "FAIL: $nl done failed"; fail=1; }
    sh "$self" block F52 ops > /dev/null 2>&1 || { echo "FAIL: $nl block failed"; fail=1; }
    sh "$self" defer F53 q2 > /dev/null 2>&1 || { echo "FAIL: $nl defer failed"; fail=1; }
    printf -- "# TICKETS$r\n$r\n- [x] F50 %s One [app: web] **Done %s: unit run** (@cc-eeeeee)$r\n- [!] F52 %s Two (blocked: ops)$r\n- [>] F53 %s Three (deferred: q2)$r\n" \
      "$D" "$TODAY" "$D" "$D" > "$T/want64-$nl.md"
    cmp -s TICKETS.md "$T/want64-$nl.md" || { echo "FAIL: $nl done/block/defer line endings or bytes"; od -c TICKETS.md | head -n 6; fail=1; }
  done

  # --- F72: verify - /verify-subagent's verdict on a [%] ticket; pass -> [x] Verified, fail stays [%]
  V="$T/f72"
  mkdir -p "$V/apps/web" && cd "$V" && git init -q . && git config core.autocrlf false || die "cannot init fixture"
  {
    printf -- '# TICKETS\n\n'
    printf -- '- [%%] F60 %s Built (testing: unit run) (@cc-gggggg)\n' "$D"
    printf -- '- [%%] F61 %s Failing (testing: live check)\n' "$D"
    printf -- '- [ ] F62 %s Not testing\n' "$D"
  } > TICKETS.md
  commit vidul@ikran.in "init" README.md
  commit vidul@ikran.in "F60: built" apps/web/a.js
  eq "verify pass, any case" "$(run verify F60 PaSs RED/GREEN 3/3, abc1234)" "- [x] F60 $D Built [app: web] (testing: unit run) **Verified $TODAY: RED/GREEN 3/3, abc1234** (@cc-gggggg)"
  eq "verify fail stays [%]" "$(run verify F61 fail unit run red, 2 of 5)" "- [%] F61 $D Failing (testing: live check) (verify failed $TODAY: unit run red, 2 of 5)"
  eq "verify fail replaces the note" "$(run verify F61 FAIL '  still red ')" "- [%] F61 $D Failing (testing: live check) (verify failed $TODAY: still red)"
  cp TICKETS.md "$T/f72a.md"
  sh "$self" verify F60 pass again > /dev/null 2>&1 && { echo "FAIL: verify took a ticket that is not [%]"; fail=1; }
  sh "$self" verify F62 fail red > /dev/null 2>&1 && { echo "FAIL: verify fail took a ticket that is not [%]"; fail=1; }
  sh "$self" verify F61 maybe red > /dev/null 2>&1 && { echo "FAIL: verify took a verdict that is not pass/fail"; fail=1; }
  sh "$self" verify F61 pass > /dev/null 2>&1 && { echo "FAIL: verify took no evidence"; fail=1; }
  sh "$self" verify F61 fail '  ' > /dev/null 2>&1 && { echo "FAIL: verify took blank evidence"; fail=1; }
  sh "$self" verify F61 pass 'ran (it)' > /dev/null 2>&1 && { echo "FAIL: verify took parentheses"; fail=1; }
  sh "$self" verify F61 pass 'a ** b' > /dev/null 2>&1 && { echo "FAIL: verify took an asterisk"; fail=1; }
  sh "$self" verify F61 fail "a${NL}b" > /dev/null 2>&1 && { echo "FAIL: verify took a line break"; fail=1; }
  cmp -s TICKETS.md "$T/f72a.md" || { echo "FAIL: a refused verify changed the board"; diff "$T/f72a.md" TICKETS.md; fail=1; }
  eq "verify pass after a fail drops the fail note" "$(run verify F61 pass green now)" "- [x] F61 $D Failing (testing: live check) **Verified $TODAY: green now**"

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
    printf -- '- [%%] F10 %s Ten [owner: @asha] (testing: a live check)\n' "$D"
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
  eq "team remove, open tickets" "$(run team remove @asha)" "removed: @asha warning: @asha is still named on open tickets: F1, F3, F8, F9, F10 - reassign them"
  printf -- '# Team\n\n- @vidul: vidul@ikran.in, V2@X.com, x@y.org\n  name: Vidul Ikran\n' > "$T/team3.md"
  cmp -s "$tf" "$T/team3.md" || { echo "FAIL: team remove"; diff "$T/team3.md" "$tf"; fail=1; }
  cmp -s TICKETS.md "$T/board-before.md" || { echo "FAIL: team remove changed the board"; fail=1; }
  [ ! -e TICKETS.md.lock ] || { echo "FAIL: team remove left the board lock behind"; fail=1; }
  eq "team list after remove" "$(run team list)" "@vidul: vidul@ikran.in, V2@X.com, x@y.org (Vidul Ikran)"

  # --- A137: team add / remove keep team.md's line endings - CRLF stays CRLF
  # (name: line included), LF stays LF
  for nl in crlf lf; do
    r=''; [ "$nl" = crlf ] && r=$(printf '\r')
    printf -- "# Team$r\n$r\n- @asha: asha@x.com$r\n  name: Asha Rao$r\n" > "$tf"
    sh "$self" team add @neo "Neo Q" neo@x.com > /dev/null 2>&1 || { echo "FAIL: $nl team add failed"; fail=1; }
    printf -- "# Team$r\n$r\n- @asha: asha@x.com$r\n  name: Asha Rao$r\n- @neo: neo@x.com$r\n  name: Neo Q$r\n" > "$T/want-team-$nl.md"
    cmp -s "$tf" "$T/want-team-$nl.md" || { echo "FAIL: $nl team add line endings or bytes"; od -c "$tf" | head -n 6; fail=1; }
    sh "$self" team remove @asha > /dev/null 2>&1 || { echo "FAIL: $nl team remove failed"; fail=1; }
    printf -- "# Team$r\n$r\n- @neo: neo@x.com$r\n  name: Neo Q$r\n" > "$T/want-team-$nl.md"
    cmp -s "$tf" "$T/want-team-$nl.md" || { echo "FAIL: $nl team remove line endings or bytes"; od -c "$tf" | head -n 6; fail=1; }
  done
  rm -f TICKETS.md.lock

  # --- F80: whoami, picking, claims, one lead
  R="$T/f80"
  mkdir -p "$R/.skillator" && cd "$R" && git init -q . && git config core.autocrlf false || die "cannot init fixture"
  printf -- '# Team\n\n- @vidul: vidul@ikran.in\n  name: Vidul\n- @asha: Asha@X.com\n- @neo: neo@x.com\n' > .skillator/team.md
  {
    printf -- '# TICKETS\n\n'
    printf -- '- [ ] F1 %s Free\n' "$D"
    printf -- '- [ ] F2 %s Mine [owner: @asha]\n' "$D"
    printf -- '- [~] F3 %s Theirs [owner: @vidul] (@cc-aaaaaa)\n' "$D"
    printf -- '- [!] F4 %s Stuck (blocked: x)\n' "$D"
    printf -- '- [x] F5 %s Shipped [owner: @vidul]\n' "$D"
    printf -- '- [ ] F6 %s Neos [owner: @neo]\n' "$D"
    printf -- '- [~] F7 %s Working (@cc-bbbbbb)\n' "$D"
    printf -- '- [-] F8 %s Dropped\n' "$D"
  } > TICKETS.md
  commit vidul@ikran.in "init" README.md
  # whoami: git user.email (any case) mapped through the team; SKILLATOR_ME overrides
  sh "$self" whoami > /dev/null 2> "$T/err" && { echo "FAIL: whoami answered with no user.email"; fail=1; }
  grep -q 'user.email is not set' "$T/err" || { echo "FAIL: whoami with no email: $(cat "$T/err")"; fail=1; }
  git config user.email ASHA@x.com
  eq "whoami by email" "$(run whoami)" "@asha"
  eq "whoami by SKILLATOR_ME" "$(SKILLATOR_ME=neo sh "$self" whoami 2>&1)" "@neo"
  SKILLATOR_ME=@nobody sh "$self" whoami > /dev/null 2> "$T/err" && { echo "FAIL: whoami took a SKILLATOR_ME not on the team"; fail=1; }
  grep -q 'not in .skillator/team.md' "$T/err" || { echo "FAIL: SKILLATOR_ME refusal: $(cat "$T/err")"; fail=1; }
  git config user.email ghost@x.com
  sh "$self" whoami > /dev/null 2> "$T/err" && { echo "FAIL: whoami answered for an email not on the team"; fail=1; }
  grep -q 'not on the team: add ghost@x.com to .skillator/team.md' "$T/err" || { echo "FAIL: whoami not on the team: $(cat "$T/err")"; fail=1; }
  # F92: the session owner file (iam) wins over SKILLATOR_ME and git's email; not on the team: refused
  sh "$self" iam @vidul > /dev/null 2> "$T/err" && { echo "FAIL: iam with no session tag"; fail=1; }
  grep -q 'no session tag' "$T/err" || { echo "FAIL: iam with no session tag: $(cat "$T/err")"; fail=1; }
  # F109: the sid is cc-<4-char code of the raw session id>; iam records the id on line 2
  j() { tr -d '\r' | tr '\n' ' ' | sed 's/ $//'; }
  eq "iam" "$(CLAUDE_CODE_SESSION_ID=0a1b-4c5d-AB12CD sh "$self" iam vidul 2>&1)" "@vidul owns session @cc-o0kb"
  [ -f .skillator/sessions/cc-o0kb.owner ] || { echo "FAIL: iam wrote no .skillator/sessions/cc-o0kb.owner"; fail=1; }
  eq "owner file names the session" "$(sed -n 2p .skillator/sessions/cc-o0kb.owner)" "session: 0a1b-4c5d-AB12CD"
  [ -z "$(git status --porcelain -- .skillator)" ] || { echo "FAIL: the session file is not git-ignored"; fail=1; }
  eq "whoami by session file" "$(CLAUDE_CODE_SESSION_ID=0a1b-4c5d-AB12CD SKILLATOR_ME=neo sh "$self" whoami 2>&1 | j)" "@vidul session: @cc-o0kb  mode: direct"
  eq "iam by SKILLATOR_SESSION" "$(SKILLATOR_SESSION=@pi-ab12 sh "$self" iam asha 2>&1)" "@asha owns session @pi-ab12"
  eq "whoami by SKILLATOR_SESSION" "$(SKILLATOR_SESSION=@pi-ab12 sh "$self" whoami 2>&1 | j)" "@asha session: @pi-ab12  mode: direct"
  eq "another session falls back" "$(CLAUDE_CODE_SESSION_ID=x-ffffff SKILLATOR_ME=neo sh "$self" whoami 2>&1 | j)" "@neo session: @cc-5qtl  mode: direct"
  # a colliding code (same file name, another id on line 2) is nobody's: falls back, never the other's owner
  printf '@vidul\nsession: some-other-id\n' > .skillator/sessions/cc-o0kb.owner
  eq "collision falls back" "$(CLAUDE_CODE_SESSION_ID=0a1b-4c5d-AB12CD SKILLATOR_ME=neo sh "$self" whoami 2>&1 | j)" "@neo session: @cc-o0kb  mode: direct"
  printf '@vidul\n' > .skillator/sessions/cc-o0kb.owner   # a pre-F109 one-line file is honoured
  eq "one-line owner file" "$(CLAUDE_CODE_SESSION_ID=0a1b-4c5d-AB12CD sh "$self" whoami 2>&1 | j)" "@vidul session: @cc-o0kb  mode: direct"
  eq "session" "$(CLAUDE_CODE_SESSION_ID=0a1b-4c5d-AB12CD SKILLATOR_MODE=run sh "$self" session 2>&1)" "cc-o0kb run"
  eq "session, none" "$(run session)" "- direct"
  SKILLATOR_MODE=bogus sh "$self" session > /dev/null 2> "$T/err" && { echo "FAIL: a bad mode was accepted"; fail=1; }
  grep -q "SKILLATOR_MODE must be direct|agent|run|workflow, not 'bogus'" "$T/err" || { echo "FAIL: bad mode message: $(cat "$T/err")"; fail=1; }
  # the code vectors (sh must match ps1 and team.ts)
  for v in '0a1b-4c5d-AB12CD o0kb' 'x-ab12cd nzua' 'x-ffffff 5qtl' '982c2a-ab12-cd34-EF56 baru' 'sid-1 icym' 'ab 02jn' '147ee797-591f-4b4f-98fa-687ea69de7d9 im79'; do
    set -- $v; eq "code $1" "$(CLAUDE_CODE_SESSION_ID=$1 sh "$self" session)" "cc-$2 direct"
  done
  CLAUDE_CODE_SESSION_ID=x-ab12cd sh "$self" iam @nobody > /dev/null 2>&1 && { echo "FAIL: iam took a handle not on the team"; fail=1; }
  printf '@nobody\n' > .skillator/sessions/cc-o0kb.owner
  CLAUDE_CODE_SESSION_ID=0a1b-4c5d-AB12CD sh "$self" whoami > /dev/null 2> "$T/err" && { echo "FAIL: whoami took a session owner not on the team"; fail=1; }
  grep -q 'session owner @nobody' "$T/err" || { echo "FAIL: session owner refusal: $(cat "$T/err")"; fail=1; }
  rm -rf .skillator/sessions
  # pick: unassigned and mine picked, another's skipped with its owner; not on the team -> only unassigned
  eq "pick, not on the team" "$(run pick)" "you: - (not on the team: add ghost@x.com to .skillator/team.md) pick F1 skip F2 @asha skip F3 @vidul pick F4 skip F6 @neo pick F7"
  cp TICKETS.md "$T/f80a.md"
  sh "$self" claim F1 > /dev/null 2> "$T/err" && { echo "FAIL: claim by someone not on the team"; fail=1; }
  grep -q 'add ghost@x.com to .skillator/team.md' "$T/err" || { echo "FAIL: claim refusal does not say add the email: $(cat "$T/err")"; fail=1; }
  git config user.email asha@x.com
  eq "pick as asha" "$(run pick)" "you: @asha pick F1 pick F2 skip F3 @vidul pick F4 skip F6 @neo pick F7"
  eq "pick given ids" "$(run pick f3 F2 F9)" "you: @asha skip F3 @vidul pick F2 pick F9"
  # review: a sub-part with no row of its own is its parent's (the chain's rule: F3 holds F3a)
  eq "pick a sub-part" "$(run pick F3a F2a F1a)" "you: @asha skip F3a @vidul pick F2a pick F1a"
  # claim (plan / dispatch): [owner: me], the box kept; mine again is no change; another's refused
  eq "claim F1" "$(run claim F1)" "- [ ] F1 $D Free [owner: @asha]"
  eq "claim keeps [~]" "$(run claim F7)" "- [~] F7 $D Working [owner: @asha] (@cc-bbbbbb)"
  # F106: start claims an unowned ticket to me; another's is left alone and said; mine is quiet
  printf -- '- [ ] F9 %s Fresh\n- [ ] F10 %s Theirs too [owner: @vidul]\n- [ ] F11 %s Mine too [owner: @asha]\n- [ ] F13 %s Nobody\n' "$D" "$D" "$D" "$D" >> TICKETS.md
  commit asha@x.com "board: f106 rows"
  eq "F106 start claims" "$(run start F9)" "- [~] F9 $D Fresh [owner: @asha]"
  eq "F106 start, another's" "$(run start F10)" "- [~] F10 $D Theirs too [owner: @vidul] note: F10 is owned by @vidul - not claimed (you: @asha)"
  eq "F106 start, mine" "$(run start F11)" "- [~] F11 $D Mine too [owner: @asha]"
  eq "F106 one commit per start" "$(git log -1 --format=%s)" "board: start F11"
  git config user.email ghost@x.com
  eq "F106 start, not on the team" "$(run start F13)" "- [~] F13 $D Nobody note: F13 not claimed - not on the team: add ghost@x.com to .skillator/team.md"
  git config user.email asha@x.com
  # F109: with a session id every write stamps (@sid:owner:mode); a move out of [~] keeps the worker's tag (A143)
  printf -- '- [ ] F14 %s Fresh two\n' "$D" >> TICKETS.md
  commit asha@x.com "board: f109 row"
  eq "stamp on start" "$(CLAUDE_CODE_SESSION_ID=0a1b-4c5d-AB12CD sh "$self" start F14 2>/dev/null | head -n 1 | tr -d '\r')" "- [~] F14 $D Fresh two [owner: @asha] (@cc-o0kb:asha:direct)"
  eq "stamp replaces, mode run" "$(CLAUDE_CODE_SESSION_ID=0a1b-4c5d-AB12CD SKILLATOR_MODE=run sh "$self" testing F14 live look 2>/dev/null | head -n 1 | tr -d '\r')" "- [%] F14 $D Fresh two [owner: @asha] (testing: live look) (@cc-o0kb:asha:run)"
  eq "stamp replaces an old-shape tag" "$(CLAUDE_CODE_SESSION_ID=0a1b-4c5d-AB12CD SKILLATOR_MODE=agent sh "$self" tag F7 2>/dev/null | head -n 1 | tr -d '\r')" "- [~] F7 $D Working [owner: @asha] (@cc-o0kb:asha:agent)"
  CLAUDE_CODE_SESSION_ID=x-ffffff SKILLATOR_ME=asha sh "$self" assign F7 @neo > "$T/out" 2>&1
  eq "A143: a move out of [~] keeps the worker's tag" "$(head -n 1 "$T/out" | tr -d '\r')" "- [ ] F7 $D Working [owner: @neo] (@cc-o0kb:asha:agent)"
  grep -q 'F7 was in progress under @cc-o0kb:asha:agent' "$T/out" || { echo "FAIL: the warning names the new-shape tag: $(cat "$T/out")"; fail=1; }
  eq "stamp" "$(CLAUDE_CODE_SESSION_ID=x-ffffff SKILLATOR_ME=neo SKILLATOR_MODE=workflow sh "$self" stamp F7 2>/dev/null | tr -d '\r')" "- [ ] F7 $D Working [owner: @neo] (@cc-5qtl:neo:workflow)"
  eq "stamp, no session" "$(run stamp F7)" "no change: no session tag"
  # review: a closed ticket is not claimed
  sh "$self" claim F8 > /dev/null 2>&1 && { echo "FAIL: claim of a closed ticket succeeded"; fail=1; }
  grep -q "^- \[-\] F8 $D Dropped\$" TICKETS.md || { echo "FAIL: claim wrote onto a closed ticket: $(grep F8 TICKETS.md)"; fail=1; }
  sh "$self" claim F2 > "$T/out" 2>&1 || { echo "FAIL: claim of my own ticket failed: $(cat "$T/out")"; fail=1; }
  grep -q 'no change' "$T/out" || { echo "FAIL: claim of my own ticket is not no change: $(cat "$T/out")"; fail=1; }
  cp TICKETS.md "$T/f80b.md"
  sh "$self" claim F3 > /dev/null 2> "$T/err" && { echo "FAIL: claim took another's ticket"; fail=1; }
  grep -q 'F3 is owned by @vidul - only @vidul may reassign it' "$T/err" || { echo "FAIL: claim refusal: $(cat "$T/err")"; fail=1; }
  # assign: a member's reassign of another's ticket refused; the owner's and the lead's accepted
  sh "$self" assign F3 @asha > /dev/null 2> "$T/err" && { echo "FAIL: a member reassigned another's ticket"; fail=1; }
  grep -q 'F3 is owned by @vidul' "$T/err" || { echo "FAIL: reassign refusal: $(cat "$T/err")"; fail=1; }
  # review: "assigning" another's ticket to its own owner would reset its box - refused too
  sh "$self" assign F3 @vidul > /dev/null 2>&1 && { echo "FAIL: a member reset another's ticket by assigning it to its owner"; fail=1; }
  cmp -s TICKETS.md "$T/f80b.md" || { echo "FAIL: a refused claim or reassign changed the board"; diff "$T/f80b.md" TICKETS.md; fail=1; }
  eq "owner reassigns" "$(SKILLATOR_ME=@vidul sh "$self" assign F3 @neo 2>&1 | head -n 1)" "- [ ] F3 $D Theirs [owner: @neo] (@cc-aaaaaa)"
  eq "assign unowned" "$(run assign F4 @vidul)" "- [ ] F4 $D Stuck [owner: @vidul] (blocked: x)"
  # one lead: set when there is none; only the lead hands it over or clears it; never removed
  eq "team list, no lead" "$(run team list)" "@vidul: vidul@ikran.in (Vidul) @asha: Asha@X.com (you) @neo: neo@x.com"
  sh "$self" team lead @nobody > /dev/null 2>&1 && { echo "FAIL: team lead took someone not on the team"; fail=1; }
  eq "team lead -, none" "$(run team lead -)" "no change: no lead set"
  eq "team lead, none yet" "$(run team lead @vidul)" "lead: @vidul"
  printf -- '# Team\nlead: @vidul\n\n- @vidul: vidul@ikran.in\n  name: Vidul\n- @asha: Asha@X.com\n- @neo: neo@x.com\n' > "$T/lead1.md"
  cmp -s .skillator/team.md "$T/lead1.md" || { echo "FAIL: team lead bytes"; diff "$T/lead1.md" .skillator/team.md; fail=1; }
  eq "team list, lead" "$(run team list)" "@vidul: vidul@ikran.in (Vidul) [lead] @asha: Asha@X.com (you) @neo: neo@x.com"
  sh "$self" team lead @asha > /dev/null 2> "$T/err" && { echo "FAIL: a member took the lead from the lead"; fail=1; }
  grep -q 'only the lead @vidul' "$T/err" || { echo "FAIL: hand-over refusal: $(cat "$T/err")"; fail=1; }
  sh "$self" team lead - > /dev/null 2>&1 && { echo "FAIL: a member cleared the lead"; fail=1; }
  SKILLATOR_ME=@vidul sh "$self" team remove @vidul > /dev/null 2> "$T/err" && { echo "FAIL: the lead was removed"; fail=1; }
  grep -q 'is the lead - hand the lead over first' "$T/err" || { echo "FAIL: lead removal refusal: $(cat "$T/err")"; fail=1; }
  cmp -s .skillator/team.md "$T/lead1.md" || { echo "FAIL: a refused lead change changed team.md"; diff "$T/lead1.md" .skillator/team.md; fail=1; }
  sh "$self" claim F6 > /dev/null 2> "$T/err" && { echo "FAIL: claim took another's ticket"; fail=1; }
  grep -q 'F6 is owned by @neo - only @neo or the lead @vidul may reassign it (you: @asha)' "$T/err" || { echo "FAIL: refusal does not name both: $(cat "$T/err")"; fail=1; }
  eq "the lead reassigns" "$(SKILLATOR_ME=@vidul sh "$self" assign F6 @asha 2>&1)" "- [ ] F6 $D Neos [owner: @asha]"
  eq "hand-over" "$(SKILLATOR_ME=@vidul sh "$self" team lead asha 2>&1)" "lead: @asha"
  eq "one lead line" "$(grep -c '^lead:' .skillator/team.md)" "1"
  eq "team lead same" "$(run team lead @asha)" "no change: @asha is already the lead"
  eq "team lead - by the lead" "$(run team lead -)" "lead cleared"
  grep -q '^lead:' .skillator/team.md && { echo "FAIL: team lead - left a lead line"; fail=1; }
  # review: the lead matched without case; a lead line naming no member is no lead
  printf -- '# Team\nlead: @Vidul\n\n- @vidul: vidul@ikran.in\n- @asha: Asha@X.com\n' > .skillator/team.md
  SKILLATOR_ME=@vidul sh "$self" team remove @vidul > /dev/null 2>&1 && { echo "FAIL: the lead was removed (its lead line in another case)"; fail=1; }
  printf -- '# Team\nlead: @ghost\n\n- @vidul: vidul@ikran.in\n- @asha: Asha@X.com\n' > .skillator/team.md
  eq "a lead not on the team is no lead" "$(run team lead @asha)" "lead: @asha"
  eq "one lead line, replaced" "$(grep '^lead:' .skillator/team.md)" "lead: @asha"
  # no heading, CRLF: the lead line comes in under a new # Team heading, CRLF kept
  printf -- '- @asha: asha@x.com\r\n' > .skillator/team.md
  eq "team lead, no heading" "$(run team lead @asha)" "lead: @asha"
  printf -- '# Team\r\n\r\nlead: @asha\r\n\r\n- @asha: asha@x.com\r\n' > "$T/lead2.md"
  cmp -s .skillator/team.md "$T/lead2.md" || { echo "FAIL: team lead with no heading, CRLF"; od -c .skillator/team.md | head -n 4; fail=1; }

  # --- F81: reconcile - read-only proposals from the board, its commits and run stages
  K="$T/f81"
  mkdir -p "$K/.skillator" && cd "$K" && git init -q . && git config core.autocrlf false || die "cannot init fixture"
  {
    printf -- '# TICKETS\n\n'
    printf -- '- [!] F1 %s Waits on F2 (blocked: F2 lands first)\n' "$D"
    printf -- '- [x] F2 %s Shipped\n' "$D"
    printf -- '- [!] F3 %s Waits on F4 (blocked: F4)\n' "$D"
    printf -- '- [ ] F4 %s Open, no evidence\n' "$D"
    printf -- '- [!] F5 %s Waits on a vendor (blocked: the vendor fix)\n' "$D"
    printf -- '- [ ] F6 %s Committed\n' "$D"
    printf -- '- [~] F7 %s Stage failed\n' "$D"
    printf -- '- [~] F8 %s Stage stale\n' "$D"
    printf -- '- [~] F9 %s Stage landed\n' "$D"
    printf -- '- [ ] F10 %s Pairing screen, needs an owner live look on the phone\n' "$D"
    printf -- '- [~] F11 %s Held (@cc-aaaaaa)\n' "$D"
    printf -- '- [ ] F12 %s Logged only\n' "$D"
    printf -- '- [!] F13 %s Waits on F4, then a release build (blocked: F4)\n' "$D"
    printf -- '- [~] F14 %s Stage in flight, then a release build\n' "$D"
    printf -- '- [~] F15 %s Stage failed, retry queued\n' "$D"
    printf -- '- [ ] F16 %s Named in passing only\n' "$D"
  } > TICKETS.md
  printf -- '# RUN-0001 - x\n\n## Stages\n| # | stage | state | owner | heartbeat | landed |\n|---|-------|-------|-------|-----------|--------|\n| 1 | F7 thing | ! | build:opus | 2026-10-25T10:00Z | - |\n| 2 | F8 thing | ~ | build:opus | 2020-01-01T00:00Z | - |\n| 3 | F9 thing | x | build:opus | 2026-10-25T10:00Z | abc1234 |\n| 4 | F14 thing | ~ | build:opus | 2099-01-01T00:00Z | - |\n| 5 | F15 thing | ! | build:opus | 2026-10-25T10:00Z | - |\n| 6 | F15 retry |   | - | - | - |\n' > .skillator/run-0001-x.md
  commit vidul@ikran.in "init" README.md
  commit vidul@ikran.in "F6: half of it" a.txt
  commit vidul@ikran.in "board: F12 logged" b.txt
  commit vidul@ikran.in "F10: built" c.txt
  commit vidul@ikran.in "F11: working" d.txt
  s6=$(git rev-parse --short HEAD~3); s10=$(git rev-parse --short HEAD~1)
  # review: an open blocker, a stage in flight, a queued retry and a passing mention propose nothing
  commit vidul@ikran.in "F13: built" e.txt
  commit vidul@ikran.in "F14: half of it" f.txt
  commit vidul@ikran.in "Merge the run branch, F16 in passing" g.txt
  cp TICKETS.md "$T/f81a.md"
  sh "$self" reconcile > "$T/out" 2>&1 || { echo "FAIL: reconcile failed: $(cat "$T/out")"; fail=1; }
  {
    echo "F1 [!] -> [ ]  blocked on F2, now done"
    echo "F5 [!] -> [!]  evidence unclear: blocked on 'the vendor fix', no ticket to check"
    echo "F6 [ ] -> [~]  1 commit names it, newest $s6"
    echo "F7 [~] -> [!]  RUN-0001 stage 1 failed"
    echo "F8 [~] -> [!]  RUN-0001 stage 2 stale, last heartbeat 2020-01-01T00:00Z"
    echo "F9 [~] -> [%]  RUN-0001 stage 3 landed abc1234 - verify its Done line"
    echo "F10 [ ] -> [%]  code landed in $s10; the owner must confirm: a live check"
  } > "$T/want81"
  cmp -s "$T/out" "$T/want81" || { echo "FAIL: reconcile proposals"; diff "$T/want81" "$T/out"; fail=1; }
  cmp -s TICKETS.md "$T/f81a.md" || { echo "FAIL: reconcile wrote the board"; fail=1; }
  [ ! -e TICKETS.md.lock ] || { echo "FAIL: reconcile left a board lock"; fail=1; }
  eq "reconcile given ids" "$(run reconcile f6 F4)" "F6 [ ] -> [~]  1 commit names it, newest $s6"
  eq "reconcile, nothing" "$(run reconcile F4 F11 F12)" "no change: nothing to reconcile"
  # review: from a run worktree, a commit on its branch is not main's
  git worktree add -q -b side "$T/f81w" > /dev/null 2>&1 && cd "$T/f81w" || die "cannot add the fixture worktree"
  commit vidul@ikran.in "F4: on a branch" h.txt
  eq "reconcile from a worktree" "$(run reconcile F4)" "no change: nothing to reconcile"
  cd "$K" || die "cannot return to the fixture"
  # the writers the pane applies [ ] and [~] with: unblock ([!] -> [ ], note dropped), start ([ ] -> [~])
  eq "unblock" "$(run unblock F1)" "- [ ] F1 $D Waits on F2"
  sh "$self" unblock F4 > /dev/null 2>&1 && { echo "FAIL: unblock took a ticket that is not [!]"; fail=1; }
  eq "start" "$(run start F6)" "- [~] F6 $D Committed"
  sh "$self" start F7 > /dev/null 2>&1 && { echo "FAIL: start took a ticket that is not [ ]"; fail=1; }

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
  # F80: no team.md behaves as before - every ticket picked, a claim changes nothing
  git config user.email vidul@ikran.in
  eq "solo pick" "$(run pick)" "you: - (no .skillator/team.md: every ticket) pick F1"
  eq "solo claim" "$(run claim F1)" "no change: no .skillator/team.md - nothing to claim"
  sh "$self" whoami > /dev/null 2>&1 && { echo "FAIL: whoami answered with no team.md"; fail=1; }
  eq "F106 solo start, no owner" "$(run start F1)" "- [~] F1 $D Thing (@cc-dddddd)"
  eq "stamp with no team" "$(CLAUDE_CODE_SESSION_ID=0a1b-4c5d-AB12CD sh "$self" stamp F1 2>/dev/null | tr -d '\r')" "- [~] F1 $D Thing (@cc-o0kb:-:direct)"
  eq "solo tag" "$(run tag F1)" "- [~] F1 $D Thing (@cc-o0kb:-:direct)"

  # --- F66: the opt-in Teams status post runs after a successful edit and never
  # fails it; off (the default) it never runs. The Workflows URL is loopback port 1:
  # the post fails at once, offline - nothing reaches Teams.
  if command -v node > /dev/null 2>&1 && [ -f "$(dirname -- "$self")/../../teams-uhura/scripts/team.mjs" ]; then
    printf '{ "token": "dG9rZW4=", "workflowUrl": "https://127.0.0.1:1/x", "port": 3978, "statusPosts": true }\n' > "$T/teams.json"
    printf -- "# TICKETS\n\n- [ ] F7 %s Seven\n- [ ] F8 %s Eight\n- [%%] F10 %s Ten\n" "$D" "$D" "$D" > TICKETS.md
    SKILLATOR_TEAMS_CONFIG="$T/teams.json" TEAMS_STATUS_POSTS='' sh "$self" done F7 shipped > "$T/out" 2> "$T/err"
    eq "F66 done with a failing post exits 0" "$?" 0
    grep -q "^- \[x\] F7 $D Seven" TICKETS.md || { echo "FAIL: F66 done with a failing post did not edit"; fail=1; }
    grep -q 'teams status post failed (the edit stands)' "$T/err" || { echo "FAIL: F66 failing post not said: $(cat "$T/err")"; fail=1; }
    SKILLATOR_TEAMS_CONFIG="$T/teams.json" TEAMS_STATUS_POSTS=on sh "$self" verify F10 pass green > "$T/out" 2> "$T/err"
    grep -q 'teams status post failed (the edit stands)' "$T/err" || { echo "FAIL: verify did not post its status: $(cat "$T/err")"; fail=1; }
    SKILLATOR_TEAMS_CONFIG="$T/teams.json" TEAMS_STATUS_POSTS=off sh "$self" block F8 creds > "$T/out" 2> "$T/err"
    eq "F66 posts off exits 0" "$?" 0
    grep -q teams "$T/err" && { echo "FAIL: F66 posts off still posted: $(cat "$T/err")"; fail=1; }
    printf '{ "token": "dG9rZW4=", "workflowUrl": "https://127.0.0.1:1/x", "port": 3978, "statusPosts": false }\n' > "$T/teams.json"
    SKILLATOR_TEAMS_CONFIG="$T/teams.json" TEAMS_STATUS_POSTS='' sh "$self" defer F8 later > "$T/out" 2> "$T/err"
    grep -q teams "$T/err" && { echo "FAIL: F66 statusPosts false still posted: $(cat "$T/err")"; fail=1; }
    # A151: the post never starts a node the repo supplies - not through '.' on PATH
    # nor an absolute PATH entry inside the repo; the real node still posts (and fails,
    # offline). NoDefaultCurrentDirectoryInExePath cleared: Windows' cwd search on.
    mkdir -p bin
    for p in . bin; do
      printf '#!/bin/sh\necho PLANTED > "%s/planted"\n' "$PWD" > "$p/node"
      printf '@echo PLANTED>"%%~dp0planted"\r\n' > "$p/node.cmd"
      chmod +x "$p/node"
    done
    for p in . "$PWD/bin"; do
      printf -- "# TICKETS\n\n- [ ] F9 %s Nine\n" "$D" > TICKETS.md
      rm -f planted bin/planted
      (unset NoDefaultCurrentDirectoryInExePath; PATH="$p:$PATH" SKILLATOR_TEAMS_CONFIG="$T/teams.json" TEAMS_STATUS_POSTS=on sh "$self" done F9 x > "$T/out" 2> "$T/err")
      [ -f planted ] || [ -f bin/planted ] && { echo "FAIL: A151 PATH $p: a node planted in the repo ran"; fail=1; }
      grep -q 'teams status post failed (the edit stands)' "$T/err" || { echo "FAIL: A151 PATH $p: the real node did not post: $(cat "$T/err")"; fail=1; }
    done
    rm -rf bin node node.cmd planted
  fi

  # --- B3: every edit keeps the board's line endings byte for byte - a CRLF
  # board stays CRLF (Windows gawk drops \r on read), an LF board stays LF
  C="$T/crlf"
  mkdir -p "$C/.skillator" && cd "$C" && git init -q . && git config core.autocrlf false || die "cannot init fixture"
  printf -- '- @vidul: vidul@ikran.in\r\n- @asha: asha@x.com\r\n' > .skillator/team.md
  commit vidul@ikran.in "F4: four" src/a.js
  for nl in crlf lf; do
    r=''; [ "$nl" = crlf ] && r=$(printf '\r')
    printf -- "# TICKETS$r\n$r\n- [ ] F1 %s One$r\n- [ ] F2 %s Two$r\n- [?] F3 %s Three [decide: @asha]$r\n- [ ] F4 %s Four$r\n" \
      "$D" "$D" "$D" "$D" > TICKETS.md
    sh "$self" assign F1 @vidul > /dev/null 2>&1 || { echo "FAIL: $nl assign failed"; fail=1; }
    sh "$self" decide F2 @asha > /dev/null 2>&1 || { echo "FAIL: $nl decide failed"; fail=1; }
    sh "$self" decided F3 > /dev/null 2>&1 || { echo "FAIL: $nl decided failed"; fail=1; }
    sh "$self" tag F4 > /dev/null 2>&1 || { echo "FAIL: $nl tag failed"; fail=1; }
    printf -- "# TICKETS$r\n$r\n- [ ] F1 %s One [owner: @vidul]$r\n- [?] F2 %s Two [decide: @asha]$r\n- [ ] F3 %s Three [decide: @asha]$r\n- [ ] F4 %s Four [by: @vidul]$r\n" \
      "$D" "$D" "$D" "$D" > "$T/want-$nl.md"
    cmp -s TICKETS.md "$T/want-$nl.md" || { echo "FAIL: $nl board line endings or bytes"; od -c TICKETS.md | head -n 4; fail=1; }
  done

  # F82: a stale board is never written. Behind the upstream with a local commit:
  # refused (exit 2), the board as it was; behind and clean: fast-forwarded, then written.
  git init -q --bare "$T/f82up.git"
  git clone -q "$T/f82up.git" "$T/f82" 2> /dev/null && cd "$T/f82" || die "cannot clone the F82 fixture"
  printf -- '- [ ] F1 %s One\n' "$D" > TICKETS.md
  { git add -A && git commit -qm init && git push -q -u origin HEAD; } > /dev/null 2>&1
  git clone -q "$T/f82up.git" "$T/f82b" 2> /dev/null
  (cd "$T/f82b" && echo o > o.txt && git add -A && git commit -qm other && git push -q) > /dev/null 2>&1
  { echo l > l.txt && git add -A && git commit -qm local; } > /dev/null 2>&1
  cp TICKETS.md "$T/f82.md"
  sh "$self" start F1 > "$T/out" 2> "$T/err"; rc=$?
  [ "$rc" = 2 ] && grep -q 'REFUSED the board write' "$T/err" && cmp -s TICKETS.md "$T/f82.md" ||
    { echo "FAIL: F82 stale board written or not refused (rc $rc): $(cat "$T/err")"; fail=1; }
  git reset -q --hard HEAD~1
  eq "F82: behind and clean - fast-forwarded, then written" "$(run start F1)" "- [~] F1 $D One"
  eq "F82: written on the upstream's tip, committed" "$(git log -2 --format=%s | tr '\n' ' ')" "board: start F1 other "

  cd "$T/.." || true
  [ "$fail" = 0 ] || exit 1
  echo ok
}

# F66: the opt-in Teams status post (teams-uhura), after an edit that worked. On when
# TEAMS_STATUS_POSTS=on, or - that unset - "statusPosts": true in the per-user config
# (~/.skillator/teams.json, SKILLATOR_TEAMS_CONFIG overrides). Off by default. A post
# that fails is one line on stderr; the edit stands and the exit stays 0.
teams_post() {
  case ${TEAMS_STATUS_POSTS:-} in
    on) ;;
    '') grep -Eq '"statusPosts"[[:space:]]*:[[:space:]]*true' "${SKILLATOR_TEAMS_CONFIG:-$HOME/.skillator/teams.json}" 2>/dev/null || return 0 ;;
    *) return 0 ;;
  esac
  _js="$(dirname -- "$0")/../../teams-uhura/scripts/team.mjs"
  [ -f "$_js" ] || return 0
  # A151: the first node in an absolute PATH entry outside the repo - a '.' or relative
  # entry, or one inside the repo (a node_modules/.bin), could start a node the repo supplies.
  _top=$(cd "$TOP" 2>/dev/null && pwd) || _top=$TOP
  _n=''
  set -f; _o=$IFS; IFS=:
  for _p in $PATH; do
    case $_p in /*) ;; *) continue ;; esac
    case $_p/ in "$_top"/*|"$TOP"/*) continue ;; esac
    if [ -f "$_p/node" ] && [ -x "$_p/node" ]; then _n=$_p/node; break; fi
  done
  IFS=$_o; set +f
  [ -n "$_n" ] || return 0
  _e=$(TEAMS_STATUS_POSTS=on "$_n" "$_js" post-status "$@" 2>&1 > /dev/null) ||
    echo "ticket-meta: teams status post failed (the edit stands): $(printf '%s' "$_e" | tr '\r\n' '  ' | sed 's/^team: //')" >&2
  return 0
}

[ $# -ge 1 ] || die "usage: ticket-meta.sh apps|app-of|by|apps-of|assign|decide|decided|testing|tested|verify|done|block|defer|tag|team|whoami|iam|stamp|session|claim|pick|reconcile|unblock|start|selftest"
c=$1; shift
SUB=$c
[ "$c" = selftest ] && { selftest; exit 0; }
need_git
export TOP SOH
case $c in
  apps) app_rows | cut -f1 | sort -u ;;
  app-of) for p in "$@"; do printf '%s
' "$p"; done | map_paths ;;
  by) [ $# -eq 1 ] || die "usage: by <ID>"; norm_id "$1"; commits_info "$ID" | by_from ;;
  apps-of) [ $# -eq 1 ] || die "usage: apps-of <ID>"; norm_id "$1"; commits_info "$ID" | apps_from ;;
  assign) cmd_assign "$@" && teams_post assign "$@" ;;
  decide) cmd_decide "$@" ;;
  decided) cmd_decided "$@" ;;
  testing) cmd_testing "$@" && teams_post testing "$@" ;;
  tested) cmd_tested "$@" && teams_post tested "$@" ;;
  verify) cmd_verify "$@" && teams_post verify "$@" ;;
  done) cmd_done "$@" && teams_post done "$@" ;;
  block) cmd_block "$@" && teams_post block "$@" ;;
  defer) cmd_defer "$@" && teams_post defer "$@" ;;
  tag) cmd_tag "$@" ;;
  team) cmd_team "$@" ;;
  whoami) cmd_whoami "$@" ;;
  iam) cmd_iam "$@" ;;
  stamp) cmd_stamp "$@" ;;
  session) cmd_session "$@" ;;
  claim) cmd_claim "$@" ;;
  pick) cmd_pick "$@" ;;
  reconcile) cmd_reconcile "$@" ;;
  unblock) cmd_unblock "$@" ;;
  start) cmd_start "$@" ;;
  *) die "unknown subcommand: $c" ;;
esac
