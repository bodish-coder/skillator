#!/bin/sh
# pending.sh - what is pending, in one report (F50, F69): the board's open
# tickets, relay runs, the run queue, live sessions, the branch against its
# upstream, owed GREENs and the machine facts (F48). Windows twin: pending.ps1,
# same output byte for byte (the selftest compares them); keep the two in step.
#
#   pending.sh              the human report: plain ASCII, every line within 80 columns
#   pending.sh --kv         the same facts as KEY=value lines (the ops-board mod parses these)
#   pending.sh --machine    DRIVE / DISK_* / MEM_FREE / LOCK / HOLD only (cheap; the band's poll)
#   pending.sh --selftest   fixture repo, every mode, prints ok
#
# --kv keys, in this order:
#   REPO=<main checkout dir name>
#   BRANCH=<branch>|<upstream>|<ahead>|<behind>   the main checkout's branch against its
#                                     upstream, local refs only (no fetch); no upstream:
#                                     <branch>|-|-|-, upstream gone: <branch>|<up>|-|-,
#                                     detached or no commit: -|-|-|-
#   UNPUSHED=<n> | UNPUSHED=-         commits ahead of the upstream (none: -)
#   OPEN= PENDING= PROGRESS= BLOCKED= DECISION= TESTING= DEFERRED=   counts on the main checkout's TICKETS.md
#   TICKET=<box>|<ID>|<tag>|<title>   per open or deferred ticket line, board order. tag:
#                                     [owner: @x] -> @x, a [?] row's [decide: @y] -> decide @y,
#                                     the session tag (@cc-...) -> @cc-..., space-joined.
#                                     title: tags and (testing: ...) dropped, cut at the
#                                     first " (" or ". ", plain ASCII
#   TEST=<ID>|<note or ->             per [%] line: its (testing: ...) note
#   OWED=<ID>                         per open ticket line with the word "owed" in it
#   RUN=<id>|<done>/<total>|<owner or ->|<first open stage or ->|<age min or ->
#                                     per run file (<main>/.skillator/run-*.md, RELAY_DIR
#                                     overrides) not all done, in run-number order, read
#                                     directly (no relay spawn). age: minutes since the
#                                     newest of the header's `updated:` stamp and the
#                                     stage rows' heartbeat stamps; - when there is none.
#                                     STALE = age over 24 h (1440 min) or no stamp at all.
#   QUEUED=<id>                       per row of `relay-morpheus queue-run list` in state queued
#                                     (none while .skillator/queue.md does not exist)
#   SESSION=<name>|<status>|<cwd>|<min>   per <config dir>/sessions/*.json: a busy one
#                                     written in the last 12 h, any other in the last 30
#                                     min; min = minutes since that write
#   DRIVE= DISK_FREE= DISK_TOTAL= MEM_FREE=   bytes; empty = unknown, never judged
#   LOCK=<path>|<age min>|<holder>    *.lock older than 10 min: TICKETS.md.lock, .skillator/*.lock,
#                                     .skillator/*/*.lock - listed, never deleted
#   HOLD=<since> <reason> | HOLD=-    <main>/.skillator/watchdog.hold (RELAY_DIR overrides), read
#                                     directly - the words relay-morpheus watchdog status gives;
#                                     an empty or blank file is held: HOLD=? -
#   WATCHDOG=red|amber|green          red: disk or memory free < 1 GB; amber: disk < 5 GB,
#                                     memory < 2 GB, a stale lock or a hold; else green
# OPEN = [ ] [~] [!] [?] [%], as tickets-zordon's count line has it; deferred [>]
# is not open and has its own key.
#
# Creates nothing: `queue-run list` (which creates the queue file when absent)
# is only called while <main>/.skillator/queue.md exists; run files and the
# hold file are read directly. F69: speed - every process costs ~50 ms under
# Git Bash (seconds under memory pressure), so the work is a fixed handful of
# awk / git calls whatever the board or the number of runs. Test-only
# overrides: PENDING_DF_CMD (prints "<free> <total> <drive>"), PENDING_MEM_CMD
# (prints "<free bytes>"), PENDING_SESSIONS_DIR, PENDING_RELAY (the relay
# script), PENDING_NOW (epoch seconds, for ages and the header time).
# No `find` or `sort`: on Windows sh can get System32's (usage-watch.sh says why).
set -u
LC_ALL=C
export LC_ALL

die() { echo "pending: $*" >&2; exit 1; }

MAIN=''
NOW=''
RELAY=''

# The main checkout's root (from any worktree of it); outside git, the cwd.
find_main() {
  d=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || d=''
  case $d in
    */.git) MAIN=${d%/.git} ;;
    *) MAIN=$(git rev-parse --show-toplevel 2>/dev/null) || MAIN=''
       [ -n "$MAIN" ] || MAIN=$(pwd) ;;
  esac
}

num() { case $1 in ''|*[!0-9]*) echo '' ;; *) echo "$1" ;; esac; }

# Epoch seconds of a file's (or a dir's) last write; empty when unknown.
mtime() { date -r "$1" +%s 2>/dev/null || stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null || :; }

# relay-morpheus, stdout only; fails when the script is missing or exits non-zero.
relay() {
  [ -f "$RELAY" ] || return 1
  _ro=$(sh "$RELAY" "$@" 2>/dev/null) || return 1
  printf '%s\n' "$_ro" | tr -d '\r'
}

# Shared awk text helpers (C locale: bytes). ascii(): the report is plain
# ASCII - dashes, curly quotes, the ellipsis, the arrow and the middle dot get
# their ASCII spelling, any other UTF-8 character is one "?", control
# characters a space. stamp(): epoch seconds of the first YYYY-MM-DDTHH:MM in
# a string (UTC, as relay writes them), -1 when none. Same as pending.ps1's
# ConvertTo-Ascii / Get-Stamp.
AWK_TXT='
BEGIN {
  EMD = sprintf("%c%c%c", 226, 128, 148); ENDASH = sprintf("%c%c%c", 226, 128, 147)
  LSQ = sprintf("%c%c%c", 226, 128, 152); RSQ = sprintf("%c%c%c", 226, 128, 153)
  LDQ = sprintf("%c%c%c", 226, 128, 156); RDQ = sprintf("%c%c%c", 226, 128, 157)
  ELL = sprintf("%c%c%c", 226, 128, 166); RARR = sprintf("%c%c%c", 226, 134, 146)
  MDOT = sprintf("%c%c", 194, 183)
  # A ticket line, as ticket-meta reads it: `[indent]- [<box>] <ID> <dash> ...`.
  TRE = "^[ \t]*- \\[.\\][ \t]+[A-Z][A-Z]?[A-Z]?[0-9]+[a-z]?[ \t]*(" EMD "|" ENDASH "|-)"
}
function ascii(s) {
  gsub(/[\001-\037\177]/, " ", s)
  gsub(EMD, "-", s); gsub(ENDASH, "-", s); gsub(LSQ, "\047", s); gsub(RSQ, "\047", s)
  gsub(LDQ, "\"", s); gsub(RDQ, "\"", s); gsub(ELL, "...", s); gsub(RARR, "->", s); gsub(MDOT, ".", s)
  gsub(/[\300-\367][\200-\277]*/, "?", s)
  gsub(/[\200-\377]/, "?", s)
  return s
}
function days(y, m, d,   era, yoe, doy) {
  y -= (m <= 2); era = int((y >= 0 ? y : y - 399) / 400); yoe = y - era * 400
  doy = int((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  return era * 146097 + yoe * 365 + int(yoe / 4) - int(yoe / 100) + doy - 719468
}
function stamp(s,   y, mo, d, h, mi) {
  if (!match(s, /[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]/)) return -1
  s = substr(s, RSTART, RLENGTH)
  y = substr(s, 1, 4) + 0; mo = substr(s, 6, 2) + 0; d = substr(s, 9, 2) + 0; h = substr(s, 12, 2) + 0; mi = substr(s, 15, 2) + 0
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return -1
  return days(y, mo, d) * 86400 + h * 3600 + mi * 60
}
'

# The board, one pass: counts, then TICKET / TEST / OWED lines.
board() {
  f="$MAIN/TICKETS.md"
  [ -f "$f" ] || f=/dev/null
  awk "$AWK_TXT"'
    function trim(s) { gsub(/^ +| +$/, "", s); return s }
    { sub(/\r$/, "") }
    $0 ~ TRE {
      i = index($0, "- ["); m = substr($0, i + 3, 1)
      r = substr($0, i + 5); sub(/^[ \t]+/, "", r); match(r, /^[A-Z]+[0-9]+[a-z]?/); id = substr(r, 1, RLENGTH)
      c[m]++
      if (m != " " && m != "~" && m != "!" && m != "?" && m != "%" && m != ">") next
      if (m != ">" && tolower($0) ~ /(^|[^a-z0-9_])owed([^a-z0-9_]|$)/) ow = ow "OWED=" id "\n"
      r = ascii(substr(r, RLENGTH + 1)); sub(/^ *- */, "", r)
      tag = ""
      if (match(r, /\[owner:[^]]*\]/)) tag = trim(substr(r, RSTART + 7, RLENGTH - 8))
      if (m == "?" && match(r, /\[decide:[^]]*\]/)) { v = trim(substr(r, RSTART + 8, RLENGTH - 9)); if (v != "") tag = tag (tag == "" ? "" : " ") "decide " v }
      s = r; v = ""
      while (match(s, /\(@[^() ]+\)/)) { v = substr(s, RSTART + 1, RLENGTH - 2); s = substr(s, RSTART + RLENGTH) }
      if (v != "") tag = tag (tag == "" ? "" : " ") v
      note = ""
      if (match(r, /\(testing:[^)]*\)/)) note = trim(substr(r, RSTART + 9, RLENGTH - 10))
      gsub(/\[(app|owner|decide|by):[^]]*\]/, "", r); gsub(/\(@[^() ]+\)/, "", r); gsub(/\(testing:[^)]*\)/, "", r)
      a = index(r, " ("); b = index(r, ". "); if (b && (!a || b < a)) a = b
      if (a) r = substr(r, 1, a - 1)
      gsub(/  +/, " ", r); r = trim(r)
      tk = tk "TICKET=" m "|" id "|" tag "|" r "\n"
      if (m == "%") te = te "TEST=" id "|" (note == "" ? "-" : note) "\n"
    }
    END {
      p = c[" "] + 0; g = c["~"] + 0; b = c["!"] + 0; q = c["?"] + 0; t = c["%"] + 0; d = c[">"] + 0
      printf "OPEN=%d\nPENDING=%d\nPROGRESS=%d\nBLOCKED=%d\nDECISION=%d\nTESTING=%d\nDEFERRED=%d\n", p + g + b + q + t, p, g, b, q, t, d
      printf "%s%s%s", tk, te, ow
    }' "$f"
}

# Runs not all done, straight from the run files - one awk over all of them.
# F69: was `relay-morpheus list` (~9 processes per run file: 7.6 s of the
# 8.5 s report on an 18-run repo) plus a stage lookup per run.
runs_kv() {
  if [ -n "${RELAY_DIR:-}" ]; then _rd=$RELAY_DIR; else _rd=$MAIN/.skillator; fi
  set -- "$_rd"/run-*.md
  [ -f "$1" ] || return 0
  awk -v now="$NOW" "$AWK_TXT"'
    function fin(   a) {
      if (id != "" && t > 0 && d < t) {
        a = (new < 0) ? "-" : int((now - new) / 60); if (a != "-" && a < 0) a = 0
        n++; NUM[n] = num; LINE[n] = "RUN=" id "|" d "/" t "|" (ow == "" ? "-" : ow) "|" (st == "" ? "-" : st) "|" a
      }
      id = ""
    }
    FNR == 1 {
      fin()
      b = FILENAME; sub(/.*\//, "", b); sub(/^run-/, "", b); sub(/[-.].*/, "", b)
      if (b ~ /^[0-9]+$/) { num = b + 0; id = sprintf("RUN-%04d", num) }
      hdr = 1; ow = ""; d = 0; t = 0; st = ""; new = -1
    }
    { sub(/\r$/, "") }
    id == "" { next }
    hdr && /^## / { hdr = 0 }
    hdr && ow == "" && index($0, "owner: ") == 1 { ow = ascii(substr($0, 8)); gsub(/^[ \t]+|[ \t]+$/, "", ow) }
    hdr && index($0, "updated: ") { x = stamp(substr($0, index($0, "updated: ") + 9)); if (x > new) new = x }
    /^\| *[0-9]+ *\|/ {
      split($0, c, "|"); t++
      s = c[4]; gsub(/[ \t]/, "", s)
      if (s == "x" || s == ">") d++
      else if (st == "") { st = ascii(c[3]); gsub(/^[ \t]+|[ \t]+$/, "", st); if (st == "") st = "-" }
      x = stamp(c[6]); if (x > new) new = x
    }
    END {
      fin()
      for (i = 2; i <= n; i++) for (j = i; j > 1 && NUM[j - 1] > NUM[j]; j--) {
        k = NUM[j]; NUM[j] = NUM[j - 1]; NUM[j - 1] = k; k = LINE[j]; LINE[j] = LINE[j - 1]; LINE[j - 1] = k
      }
      for (i = 1; i <= n; i++) print LINE[i]
    }' "$@"
}

queued_kv() {
  # queue-run list creates the queue file (and its dir) when absent: no file,
  # no call - pending never creates anything.
  [ -f "$MAIN/.skillator/queue.md" ] || return 0
  out=$(relay queue-run list) || return 0
  printf '%s\n' "$out" | awk -F'|' '/^\| *[0-9]+ *\|/ { s = $4; gsub(/[ \t]/, "", s); if (s == "queued") { r = $3; gsub(/[ \t]/, "", r); print "QUEUED=" r } }'
}

# Live sessions: <config dir>/sessions/*.json (an undocumented Claude Code
# file: pid, sessionId, cwd, name, status, updatedAt). A busy session does not
# rewrite its file while it works, so busy ones count for 12 h, others 30 min.
# One stat and one awk for all the files.
sessions_kv() {
  sd=${PENDING_SESSIONS_DIR:-${CLAUDE_CONFIG_DIR:-${HOME:-}/.claude}/sessions}
  set -- "$sd"/*.json
  [ -f "$1" ] || return 0
  _mt=$(stat -c %Y "$@" 2>/dev/null) || _mt=$(stat -f %m "$@" 2>/dev/null) || _mt=''
  [ "$(printf '%s\n' "$_mt" | awk 'END { print NR }')" = $# ] || _mt=$(for _f; do m=$(mtime "$_f"); echo "${m:--}"; done)
  awk -v now="$NOW" -v MT="$_mt" '
    function js(k,   i, s, c, o) {
      i = index(T, "\"" k "\""); if (!i) return "-"
      s = substr(T, i + length(k) + 2)
      if (!match(s, /^[ \t\r\n]*:[ \t\r\n]*"/)) return "-"
      s = substr(s, RLENGTH + 1); o = ""
      while (s != "") {
        c = substr(s, 1, 1)
        if (c == "\"") return o
        if (c == "\\") { o = o substr(s, 2, 1); s = substr(s, 3); continue }
        o = o c; s = substr(s, 2)
      }
      return o
    }
    BEGIN { split(MT, M, "\n"); for (i = 1; i < ARGC; i++) IX[ARGV[i]] = i }
    { B[IX[FILENAME]] = B[IX[FILENAME]] $0 "\n" }
    END {
      for (i = 1; i < ARGC; i++) {
        if (M[i] !~ /^[0-9]+$/) continue
        a = now - M[i]; if (a < 0) a = 0
        if (a >= 43200) continue
        T = B[i]; st = js("status")
        if (st != "busy" && a >= 1800) continue
        print "SESSION=" js("name") "|" st "|" js("cwd") "|" int(a / 60)
      }
    }' "$@"
}

# The main checkout's branch against its upstream - one git call, local refs.
branch_kv() {
  git -C "$MAIN" for-each-ref --format='%(HEAD)|%(refname:short)|%(upstream:short)|%(upstream:track,nobracket)' refs/heads 2>/dev/null | awk -F'|' '
    { sub(/\r$/, "") }
    $1 == "*" { b = $2; u = $3; tr = $4 }
    END {
      if (b == "") { print "BRANCH=-|-|-|-"; print "UNPUSHED=-"; exit }
      if (u == "" || tr == "gone") { print "BRANCH=" b "|" (u == "" ? "-" : u) "|-|-"; print "UNPUSHED=-"; exit }
      ah = 0; be = 0
      if (match(tr, /ahead [0-9]+/)) ah = substr(tr, RSTART + 6, RLENGTH - 6) + 0
      if (match(tr, /behind [0-9]+/)) be = substr(tr, RSTART + 7, RLENGTH - 7) + 0
      print "BRANCH=" b "|" u "|" ah "|" be; print "UNPUSHED=" ah
    }'
}

locks_kv() {
  for p in "$MAIN/TICKETS.md.lock" "$MAIN/.skillator"/*.lock "$MAIN/.skillator"/*/*.lock; do
    [ -e "$p" ] || continue
    m=$(num "$(mtime "$p")"); [ -n "$m" ] || continue
    a=$((NOW - m)); [ "$a" -gt 600 ] || continue
    if [ -d "$p" ]; then h=$(cat "$p/pid" 2>/dev/null) || h=''; else h=$(cat "$p" 2>/dev/null) || h=''; fi
    h=$(printf '%s\n' "$h" | awk 'NR == 1 { sub(/\r$/, ""); print substr($0, 1, 40) }')
    [ -n "$h" ] || h=-
    echo "LOCK=${p#"$MAIN"/}|$((a / 60))|$h"
  done
}

machine_kv() {
  if [ -n "${PENDING_DF_CMD:-}" ]; then
    dfl=$(sh -c "$PENDING_DF_CMD" 2>/dev/null | tr -d '\r' | awk 'NR == 1')
  else
    # Columns found from Capacity (n%): a filesystem or mount with spaces keeps
    # its sizes. A147: under Git Bash the filesystem is the Windows path (C:,
    # C:/Users/.../Temp for /tmp) - its drive letter names the disk, not the mount.
    dfl=$(df -Pk "$MAIN" 2>/dev/null | tr -d '\r' | awk 'NR == 2 {
      for (c = 5; c <= NF && $c !~ /^[0-9]+%$/; c++) ;
      if (c > NF) exit
      d = $(c + 1); for (i = c + 2; i <= NF; i++) d = d " " $i
      if ($1 ~ /^[A-Za-z]:([\\\/]|$)/) d = substr($1, 1, 2)
      printf "%.0f %.0f %s\n", $(c - 1) * 1024, $(c - 3) * 1024, d }')
  fi
  free=$(num "$(printf '%s\n' "$dfl" | awk '{ print $1 }')")
  total=$(num "$(printf '%s\n' "$dfl" | awk '{ print $2 }')")
  drive=$(printf '%s\n' "$dfl" | awk 'NF >= 3 { sub(/^[ \t]*[^ \t]+[ \t]+[^ \t]+[ \t]+/, ""); print }')
  if [ -n "${PENDING_MEM_CMD:-}" ]; then
    mem=$(sh -c "$PENDING_MEM_CMD" 2>/dev/null | tr -d '\r' | awk 'NR == 1 { print $1 }')
  elif [ -r /proc/meminfo ]; then
    mem=$(awk '/^MemAvailable:/ { a = $2 } /^MemFree:/ { f = $2 } END { v = (a != "") ? a : f; if (v != "") printf "%.0f\n", v * 1024 }' /proc/meminfo)
  elif command -v vm_stat >/dev/null 2>&1; then
    mem=$(vm_stat 2>/dev/null | awk '/page size of/ { for (i = 1; i <= NF; i++) if ($i ~ /^[0-9]+$/) ps = $i }
      /^Pages free:/ { f = $3 + 0 } /^Pages inactive:/ { n = $3 + 0 }
      END { if (ps != "" && f != "") printf "%.0f\n", (f + n) * ps }')
  else
    mem=''
  fi
  mem=$(num "$mem")
  printf 'DRIVE=%s\nDISK_FREE=%s\nDISK_TOTAL=%s\nMEM_FREE=%s\n' "$drive" "$free" "$total" "$mem"
  locks_kv
  hold_kv
}

# R2: the watchdog hold, straight from the file relay-morpheus writes -
# <main checkout>/.skillator/watchdog.hold, RELAY_DIR overriding as there -
# never by spawning relay. The words `watchdog status` gives: <since> <reason>,
# reason - when the line has none. R6: a file that exists is held whatever
# its content - an empty or blank one reads `? -` (HOLD=- is only "no file").
hold_kv() {
  if [ -n "${RELAY_DIR:-}" ]; then _hf="$RELAY_DIR/watchdog.hold"; else _hf="$MAIN/.skillator/watchdog.hold"; fi
  if [ -f "$_hf" ]; then
    _hl=$(awk 'NR == 1 { gsub(/\r/, ""); gsub(/^[ \t]+|[ \t]+$/, ""); i = index($0, " ")
                 a = (i ? substr($0, 1, i - 1) : $0); b = (i ? substr($0, i + 1) : "")
                 print (a == "" ? "?" : a) " " (b == "" ? "-" : b); done = 1; exit }
               END { if (!done) print "? -" }' "$_hf" 2>/dev/null) || _hl='? -'
    echo "HOLD=${_hl:-? -}"
  else
    echo "HOLD=-"
  fi
}

facts() {
  echo "REPO=${MAIN##*/}"; branch_kv; board; runs_kv; queued_kv; sessions_kv; machine_kv
}

# Shared by --kv and the human report: GB figures (one decimal below 10, whole
# from 10) and the watchdog judgement, over KEY=value lines on stdin. Given the
# threshold a figure is below (lim, bytes), its text never reads as that threshold:
# where rounding would reach it (0.97 GB -> "1.0") it is floored ("0.9"), to two
# decimals should one still reach it. Same as figure() in mods/ops-board facts.ts.
AWK_LIB='
function gb(b, lim,  v, t, txt, f) {
  if (b == "") return "?"
  v = b / 1073741824
  t = int(v * 10 + 0.5)
  txt = (t < 100) ? int(t / 10) "." (t % 10) : int(v + 0.5) ""
  if (lim == "" || b + 0 >= lim || (txt + 0) * 1073741824 < lim) return txt " GB"
  f = int(v * 10) / 10
  if (f * 1073741824 < lim) return sprintf("%.1f", f) " GB"
  return sprintf("%.2f", int(v * 100) / 100) " GB"
}
function fig(b, red, amber) {
  if (b != "" && b + 0 < red) return gb(b, red)
  if (b != "" && b + 0 < amber) return gb(b, amber)
  return gb(b)
}
function add(s) { REASONS = REASONS (REASONS == "" ? "" : "; ") s }
function judge(  G) {
  G = 1073741824; LEVEL = "green"; REASONS = ""
  if (DF != "" && DF + 0 < G) { LEVEL = "red"; add("disk " gb(DF, G) " free (below 1 GB)") }
  else if (DF != "" && DF + 0 < 5 * G) add("disk " gb(DF, 5 * G) " free (below 5 GB)")
  if (MF != "" && MF + 0 < G) { LEVEL = "red"; add("memory " gb(MF, G) " free (below 1 GB)") }
  else if (MF != "" && MF + 0 < 2 * G) add("memory " gb(MF, 2 * G) " free (below 2 GB)")
  if (NLK > 0) add(NLK " stale lock" (NLK > 1 ? "s" : ""))
  if (HD != "" && HD != "-") add("held (" HD ")")
  if (LEVEL != "red" && REASONS != "") LEVEL = "amber"
}
{ sub(/\r$/, ""); i = index($0, "="); K = substr($0, 1, i - 1); V = substr($0, i + 1) }
K == "DISK_FREE" { DF = V }
K == "MEM_FREE" { MF = V }
K == "LOCK" { NLK++ }
K == "HOLD" { HD = V }
'

# F69: the human report. Plain ASCII, no line over 80 columns, the same bytes
# as pending.ps1's Format-Human. Sections: REPO (branch vs upstream, the time),
# TICKETS (open, grouped by status, then deferred as IDs), RUNS (live or stale),
# AGENTS, MACHINE (two lines: the figures; locks and the hold with its release),
# GREENS (owed on open tickets), NEXT (what to test, what runs are doing).
human() {
  awk -v now="$NOW" -v main="$MAIN" "$AWK_TXT$AWK_LIB"'
    function trunc(s, w) { if (length(s) <= w) return s; if (w < 4) return substr(s, 1, w); s = substr(s, 1, w - 3); sub(/ +$/, "", s); return s "..." }
    function out(s) { sub(/ +$/, "", s); print s }
    function pad(s, w) { while (length(s) < w) s = s " "; return s }
    function wrap(pre, text, cont,   n, a, i, line, has, w) {
      n = split(text, a, / +/); line = pre; has = 0
      for (i = 1; i <= n; i++) {
        w = a[i]; if (w == "") continue
        if (has && length(line) + 1 + length(w) > 80) { out(line); line = cont; has = 0 }
        if (!has && length(line) + length(w) > 80) w = trunc(w, 80 - length(line))
        line = line (has ? " " : "") w; has = 1
      }
      out(line)
    }
    function right(lead, text, tag,   room) {
      if (tag == "") { out(lead trunc(text, 80 - length(lead))); return }
      tag = trunc(tag, 24); room = 80 - length(lead) - 2 - length(tag)
      out(lead pad(trunc(text, room), room) "  " tag)
    }
    function age(n) { return n < 60 ? n "m" : (n < 2880 ? int(n / 60) "h" : int(n / 1440) "d") }
    function norm(p) { p = tolower(p); gsub(/\\/, "/", p); sub(/\/+$/, "", p); return p }
    function civil(t,   z, s, era, doe, yoe, y, doy, mp, d, m) {
      z = int(t / 86400); s = t - z * 86400; z += 719468
      era = int(z / 146097); doe = z - era * 146097
      yoe = int((doe - int(doe / 1460) + int(doe / 36524) - int(doe / 146096)) / 365)
      y = yoe + era * 400; doy = doe - (365 * yoe + int(yoe / 4) - int(yoe / 100))
      mp = int((5 * doy + 2) / 153); d = doy - int((153 * mp + 2) / 5) + 1
      m = mp + (mp < 10 ? 3 : -9); y += (m <= 2)
      return sprintf("%04d-%02d-%02d %02d:%02dZ", y, m, d, int(s / 3600), int((s % 3600) / 60))
    }
    K == "REPO" { repo = ascii(V) }
    K == "BRANCH" { split(V, bb, "|"); br = ascii(bb[1]); up = ascii(bb[2]); ah = bb[3]; be = bb[4]; hasbr = 1 }
    K == "OPEN" { no = V } K == "DEFERRED" { nd = V }
    K == "TICKET" { m = substr(V, 1, 1); s = substr(V, 3); j = index(s, "|"); id = substr(s, 1, j - 1); s = substr(s, j + 1)
                    j = index(s, "|"); N[m]++; TID[m, N[m]] = id; TTG[m, N[m]] = substr(s, 1, j - 1); TTI[m, N[m]] = substr(s, j + 1) }
    K == "TEST" { j = index(V, "|"); nt++; XID[nt] = substr(V, 1, j - 1); XN[nt] = substr(V, j + 1) }
    K == "RUN" { split(V, a, "|"); nr++; RI[nr] = a[1]; RD[nr] = a[2]; RO[nr] = a[3]; RG[nr] = a[4]; RA[nr] = a[5] }
    K == "QUEUED" { q = q (q == "" ? "" : " ") V }
    K == "SESSION" { n = split(V, a, "|"); cw = a[3]; for (j = 4; j < n; j++) cw = cw "|" a[j]
                     ns++; SN[ns] = ascii(a[1]); SS[ns] = a[2]; SA[ns] = a[n] + 0
                     c = norm(cw); mn = norm(main); SIN[ns] = (c == mn || index(c, mn "/") == 1) }
    K == "OWED" { ow = ow (ow == "" ? "" : " ") V }
    K == "DRIVE" { dr = ascii(V) } K == "DISK_TOTAL" { dt = V }
    K == "LOCK" { s = V; j = index(s, "|"); lp = substr(s, 1, j - 1); s = substr(s, j + 1); j = index(s, "|")
                  lk = lk (lk == "" ? "" : ", ") ascii(lp " " substr(s, 1, j - 1) "m (" substr(s, j + 1) ")") }
    END {
      judge()
      if (!hasbr || br == "-") bt = "detached HEAD"
      else if (up == "-") bt = br ": no upstream"
      else if (ah == "-") bt = br ": upstream " up " gone"
      else if (ah + 0 == 0 && be + 0 == 0) bt = br ": up to date with " up
      else if (be + 0 == 0) bt = br ": " ah " ahead of " up
      else if (ah + 0 == 0) bt = br ": " be " behind " up
      else bt = br ": " ah " ahead, " be " behind " up
      h = "REPO      " repo "  " bt "  " civil(now)
      if (length(h) <= 80) out(h); else wrap("REPO      ", repo " " bt " " civil(now), "          ")

      out("TICKETS   " (no + 0) " open, " (nd + 0) " deferred")
      LB["~"] = "in progress"; LB["%"] = "testing"; LB["!"] = "blocked"; LB["?"] = "decision"; LB[" "] = "pending"
      G = "~%!? "
      for (gi = 1; gi <= 5; gi++) {
        m = substr(G, gi, 1); if (!N[m]) continue
        out("  " LB[m] " (" N[m] ")")
        lim = (m == " " && N[m] > 10) ? 10 : N[m]
        for (j = 1; j <= lim; j++) right("    " pad(TID[m, j], 5) " ", TTI[m, j], TTG[m, j])
        if (lim < N[m]) out("    ... " (N[m] - lim) " more pending: list tickets")
      }
      if (N[">"]) { s = ""; for (j = 1; j <= N[">"]; j++) s = s " " TID[">", j]; wrap("  deferred (" N[">"] "): ", s, "    ") }

      if (!nr) out("RUNS      none open")
      for (j = 1; j <= nr; j++) {
        st = (RA[j] == "-" || RA[j] + 0 > 1440) ? "stale " (RA[j] == "-" ? "?" : age(RA[j] + 0)) : "live " age(RA[j] + 0)
        right((j == 1 ? "RUNS      " : "          ") RI[j] "  " pad(st, 9) "  " pad(RD[j], 5) "  ", (RG[j] == "-" ? "(no open stage)" : RG[j]), (RO[j] == "-" ? "" : RO[j]))
        if (st ~ /^live/) live = live (live == "" ? "" : ", ") RI[j] " at " (RG[j] == "-" ? "(no open stage)" : RG[j])
      }
      if (q != "") wrap("          queued: ", q, "                  ")

      ag = 0; other = 0
      for (j = 1; j <= ns; j++) {
        if (!SIN[j]) { other++; continue }
        w = (SS[j] == "busy") ? "working" : (SS[j] == "-" ? "unknown" : ascii(SS[j]))
        out(trunc((ag++ ? "          " : "AGENTS    ") SN[j] " " w " " age(SA[j]), 80))
      }
      if (!ag) out("AGENTS    " (other ? "none here (+" other " in other repos)" : "none"))
      else if (other) out("          +" other " in other repos")

      G1 = 1073741824
      lv = (LEVEL == "green") ? "ok" : toupper(LEVEL)
      d1 = "disk " (dr == "" ? "?" : dr) " " fig(DF, G1, 5 * G1) " free of " gb(dt)
      if (DF != "" && DF + 0 < G1) d1 = d1 " (below 1 GB)"; else if (DF != "" && DF + 0 < 5 * G1) d1 = d1 " (below 5 GB)"
      m1 = "memory " fig(MF, G1, 2 * G1) " free"
      if (MF != "" && MF + 0 < G1) m1 = m1 " (below 1 GB)"; else if (MF != "" && MF + 0 < 2 * G1) m1 = m1 " (below 2 GB)"
      wrap("MACHINE   " lv "  ", d1 ", " m1, "          ")
      l2 = (NLK + 0 == 0) ? "no stale locks" : NLK " stale lock" (NLK > 1 ? "s" : "") ": " lk
      if (HD == "" || HD == "-") h2 = "no hold"
      else {
        hh = ascii(HD); j = index(hh, " "); hs = (j ? substr(hh, 1, j - 1) : hh); hw = (j ? substr(hh, j + 1) : "-")
        h2 = (hs == "?" ? "held (no date)" : "held since " hs) (hw == "-" ? "" : ": " hw) " - release: relay-morpheus watchdog release"
      }
      wrap("          ", l2 "; " h2, "          ")

      if (ow == "") out("GREENS    none owed"); else wrap("GREENS    owed: ", ow, "          ")

      if (!nt) out("NEXT      nothing to test")
      for (j = 1; j <= nt; j++) out(trunc((j == 1 ? "NEXT      " : "          ") "test " XID[j] ": " (XN[j] == "-" ? "(no test named)" : XN[j]), 80))
      wrap("          agents: ", (live == "" ? "no run working" : live), "                  ")
    }'
}

selftest() {
  self=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/$(basename -- "$0")
  T=$(mktemp -d 2>/dev/null || mktemp -d -t pending)
  trap 'rm -rf "$T"' EXIT
  fail=0
  D=$(printf '\342\200\224')
  ND=$(printf '\342\200\223')
  LQ=$(printf '\342\200\234'); RQ=$(printf '\342\200\235'); AR=$(printf '\342\206\222')
  NL='
'
  # Fixture times are UTC: touch -t and the run files' stamps agree on any machine.
  TZ=UTC0; export TZ
  eq() { [ "$2" = "$3" ] || { printf 'FAIL: %s:\n--- expected\n%s\n--- got\n%s\n' "$1" "$3" "$2"; fail=1; }; }
  run() { sh "$self" "$@" 2>&1 | tr -d '\r'; }
  # F69: every report line fits 80 columns and is plain printable ASCII.
  fits() {
    _bad=$(printf '%s\n' "$2" | LC_ALL=C awk 'length($0) > 80 || /[^ -~]/ { print NR ": " $0 }')
    [ -z "$_bad" ] || { printf 'FAIL: %s: lines over 80 columns or not ASCII:\n%s\n' "$1" "$_bad"; fail=1; }
  }
  g() { git -c user.name=t -c user.email=t@example.invalid -c core.autocrlf=false -c core.hooksPath=/dev/null "$@"; }

  R="$T/repo"
  mkdir -p "$R/.skillator/sub" "$T/sessions" && cd "$R" && g init -q . && git config core.autocrlf false || die "cannot init fixture"
  # main is 2 commits ahead of its upstream (a local branch: no remote, no fetch).
  git symbolic-ref HEAD refs/heads/main && g commit -q --allow-empty -m one && git branch base \
    && g commit -q --allow-empty -m two && g commit -q --allow-empty -m three \
    && git branch -q --set-upstream-to=base main || die "cannot build the fixture history"
  M=$(git rev-parse --show-toplevel)
  board() {
    printf '%s\n' "# Tickets" "" "## Bugs" \
    "- [~] B1 $D cart drawer keeps items (@cc-aaaaaa)" \
    "- [!] B2 $D orders 500 past page 3 [owner: @vidul]. The GREEN is owed" \
    "- [?] F1 $D pick the chart library [decide: @asha]" \
    "- [>] F2 $D later thing" \
    "- [%] F4 $D built, under test (testing: live check)" \
    "- [ ] F3 $D pending one" \
    "  - [ ] F3a $D a towed car, slowed down" \
    "- [x] A1 $D fixed, the GREEN re-run is OWED" \
    "- [ ] no id on this line" \
    "not a ticket, owed" \
    "- [~] F5 $D a very long title that goes on and on well past the eighty column limit of any terminal (@cc-bbbbbb)" \
    "- [>] F6 $D deferred too" \
    "- [%] F7 $ND en dash title ${LQ}quoted${RQ} $AR arrow (testing: owner looks at it)"
  }
  board > TICKETS.md
  printf '%s\n' "# RUN-12 - demo run" "plan: none" "started: 2026-01-01T11:00Z   updated: 2026-01-01T12:00Z" "owner: @vidul" "" "## Stages" \
    "| # | stage | state | owner | heartbeat | landed |" \
    "|---|-------|-------|-------|-----------|--------|" \
    "| 1 | stage one | x | a | 2026-01-01T11:30Z | abc |" \
    "| 2 | stage two | > | a | 2026-01-01T12:20Z | stage 3 |" \
    "| 3 | stage three title |  | - | - | - |" \
    "| 4 | stage four |  | - | - | - |" > .skillator/run-12-demo-run.md
  printf '%s\n' "# RUN-13 - all landed" "plan: none" "started: 2026-01-01T09:00Z   updated: 2026-01-01T09:30Z" "" "## Stages" \
    "| # | stage | state | owner | heartbeat | landed |" "|---|-------|-------|-------|-----------|--------|" \
    "| 1 | one | x | a | - | abc |" "| 2 | two | x | a | - | def |" "| 3 | three | > | a | - | stage 2 |" > .skillator/run-13-all-landed.md
  # A run quiet for a month: open, but stale (no stamp in the last 24 h). CRLF.
  printf '%s\r\n' "# RUN-14 - old run" "plan: none" "started: 2025-12-01T10:00Z   updated: 2025-12-01T10:00Z" "" "## Stages" \
    "| # | stage | state | owner | heartbeat | landed |" "|---|-------|-------|-------|-----------|--------|" \
    "| 1 | first | x | a | 2025-12-01T10:00Z | abc |" "| 2 | later stage | ~ | a | 2025-11-30T10:00Z | - |" > .skillator/run-14-old-run.md
  printf '1234 sh MINGW\n' > .skillator/run.md.lock
  printf '99 sh MINGW\n' > .skillator/x.lock
  printf '7 sh MINGW\n' > .skillator/sub/fresh.lock
  touch -t 202601011200.00 .skillator/run.md.lock
  touch -t 202601011232.00 .skillator/x.lock .skillator/sub/fresh.lock
  MJ=$(printf '%s' "$M" | sed 's/\\/\\\\/g')
  printf '{"pid":1,"sessionId":"s1","cwd":"%s","name":"repo-c0","status":"busy","updatedAt":1}\n' "$MJ" > "$T/sessions/a.json"
  printf '{"pid":2,"sessionId":"s2","cwd":"/old","name":"old-one","status":"idle","updatedAt":1}\n' > "$T/sessions/b.json"
  printf '{"pid":3,"sessionId":"s3","cwd":"C:\\\\elsewhere","name":"other-1","status":"busy","updatedAt":1}\n' > "$T/sessions/c.json"
  printf '{"pid":4,"sessionId":"s4","cwd":"/gone","name":"dead-busy","status":"busy","updatedAt":1}\n' > "$T/sessions/d.json"
  touch -t 202601011230.00 "$T/sessions/a.json"
  touch -t 202601011000.00 "$T/sessions/b.json"
  touch -t 202601011100.00 "$T/sessions/c.json"
  touch -t 202512312300.00 "$T/sessions/d.json"
  base=$(date -r .skillator/run.md.lock +%s) || die "date -r failed"
  [ "$base" = 1767268800 ] || die "fixture clock: run.md.lock reads $base, not 1767268800"
  # A fake relay-morpheus: canned queue-run list. F69: runs come from the run
  # files, never from `relay list` (a list call leaves a mark). R2: the hold is
  # read from the file, never by spawning relay - a watchdog call leaves a mark.
  cat > "$T/relay.sh" <<'EOF'
case $1 in
  list) : > "$PENDING_T/relay-list-called"; exit 1 ;;
  queue-run) echo '# Run queue' >> .skillator/queue.md   # the real one creates it
          printf '%s\n' '# Run queue' 'away: -' 'landing: -' '' '| # | run | state | since | owner |' \
          '|---|-----|-------|-------|-------|' '| 1 | RUN-0012 | running | 2026-01-01T10:00Z | @vidul |' \
          '| 2 | RUN-0013 | queued | 2026-01-01T10:00Z | - |' '| 3 | RUN-0014 | landed | 2026-01-01T10:00Z | - |' ;;
  watchdog) : > "$PENDING_T/relay-watchdog-called"; echo "HELD 2026-01-01T09:00Z from relay" ;;
  *) exit 1 ;;
esac
EOF
  PENDING_RELAY="$T/relay.sh"
  # echo runs the same under sh -c and PowerShell's Invoke-Expression: the
  # cross-script check below hands these to pending.ps1 unchanged.
  PENDING_DF_CMD="echo '858993459 1000000000000 X:'"
  PENDING_MEM_CMD="echo 3435973836"
  PENDING_SESSIONS_DIR="$T/sessions"
  PENDING_NOW=$((base + 2040))
  PENDING_T="$T"
  export PENDING_RELAY PENDING_DF_CMD PENDING_MEM_CMD PENDING_SESSIONS_DIR PENDING_NOW PENDING_T
  unset RELAY_DIR 2>/dev/null || :

  eq "kv" "$(run --kv)" "REPO=repo${NL}BRANCH=main|base|2|0${NL}UNPUSHED=2${NL}OPEN=8${NL}PENDING=2${NL}PROGRESS=2${NL}BLOCKED=1${NL}DECISION=1${NL}TESTING=2${NL}DEFERRED=2${NL}TICKET=~|B1|@cc-aaaaaa|cart drawer keeps items${NL}TICKET=!|B2|@vidul|orders 500 past page 3${NL}TICKET=?|F1|decide @asha|pick the chart library${NL}TICKET=>|F2||later thing${NL}TICKET=%|F4||built, under test${NL}TICKET= |F3||pending one${NL}TICKET= |F3a||a towed car, slowed down${NL}TICKET=~|F5|@cc-bbbbbb|a very long title that goes on and on well past the eighty column limit of any terminal${NL}TICKET=>|F6||deferred too${NL}TICKET=%|F7||en dash title \"quoted\" -> arrow${NL}TEST=F4|live check${NL}TEST=F7|owner looks at it${NL}OWED=B2${NL}RUN=RUN-0012|2/4|@vidul|stage three title|14${NL}RUN=RUN-0014|1/2|-|later stage|44794${NL}SESSION=repo-c0|busy|$M|4${NL}SESSION=other-1|busy|C:\\elsewhere|94${NL}DRIVE=X:${NL}DISK_FREE=858993459${NL}DISK_TOTAL=1000000000000${NL}MEM_FREE=3435973836${NL}LOCK=.skillator/run.md.lock|34|1234 sh MINGW${NL}HOLD=-${NL}WATCHDOG=red"
  # No queue.md: queue-run list is never called (it would create the file).
  [ ! -e .skillator/queue.md ] || { echo "FAIL: pending created .skillator/queue.md"; fail=1; }
  echo '# Run queue' > .skillator/queue.md
  HUMAN="REPO      repo  main: 2 ahead of base  2026-01-01 12:34Z
TICKETS   8 open, 2 deferred
  in progress (2)
    B1    cart drawer keeps items                                     @cc-aaaaaa
    F5    a very long title that goes on and on well past the eig...  @cc-bbbbbb
  testing (2)
    F4    built, under test
    F7    en dash title \"quoted\" -> arrow
  blocked (1)
    B2    orders 500 past page 3                                          @vidul
  decision (1)
    F1    pick the chart library                                    decide @asha
  pending (2)
    F3    pending one
    F3a   a towed car, slowed down
  deferred (2): F2 F6
RUNS      RUN-0012  live 14m   2/4    stage three title                   @vidul
          RUN-0014  stale 31d  1/2    later stage
          queued: RUN-0013
AGENTS    repo-c0 working 4m
          +1 in other repos
MACHINE   RED  disk X: 0.8 GB free of 931 GB (below 1 GB), memory 3.2 GB free
          1 stale lock: .skillator/run.md.lock 34m (1234 sh MINGW); no hold
GREENS    owed: B2
NEXT      test F4: live check
          test F7: owner looks at it
          agents: RUN-0012 at stage three title"
  H=$(run)
  eq "human" "$H" "$HUMAN"
  fits "human" "$H"
  [ ! -e "$T/relay-list-called" ] || { echo "FAIL: pending spawned relay list for the runs"; fail=1; }
  # A CRLF board reads the same.
  board | sed 's/$/\r/' > TICKETS.md
  eq "human, CRLF board" "$(run)" "$HUMAN"
  # F69 cross-check: pending.ps1 prints the same report, byte for byte, on the
  # same board (CRLF here, LF after) - when PowerShell is on this machine.
  PS1=${self%.sh}.ps1
  if command -v powershell >/dev/null 2>&1 && [ -f "$PS1" ]; then
    # The twin's fake relay: the same queued row.
    printf '%s\n' 'param([string]$Mode, [string]$Action, [string]$Sub)' \
      "if (\$Mode -ceq 'queue-run' -and \$Sub -ceq 'list') { '| 2 | RUN-0013 | queued | 2026-01-01T10:00Z | - |'; exit 0 }" 'exit 1' > "$T/relay.ps1"
    psrun() { PENDING_RELAY="$T/relay.ps1" powershell -NoProfile -ExecutionPolicy Bypass -File "$PS1" "$@" 2>&1 | tr -d '\r'; }
    eq "pending.ps1 = pending.sh, CRLF board" "$(psrun)" "$(run)"
    eq "pending.ps1 = pending.sh, --kv, CRLF board" "$(psrun --kv)" "$(run --kv)"
    board > TICKETS.md
    eq "pending.ps1 = pending.sh, LF board" "$(psrun)" "$(run)"
  else
    echo "note: no powershell here - the pending.ps1 cross-check is skipped"
  fi
  board > TICKETS.md
  # R2: HOLD= comes from <main>/.skillator/watchdog.hold itself, the words
  # `relay-morpheus watchdog status` gives (CRLF tolerated, first line only).
  printf '2026-01-01T11:00Z disk low\r\nsecond line\n' > .skillator/watchdog.hold
  eq "machine, held" "$(run --machine)" "DRIVE=X:${NL}DISK_FREE=858993459${NL}DISK_TOTAL=1000000000000${NL}MEM_FREE=3435973836${NL}LOCK=.skillator/run.md.lock|34|1234 sh MINGW${NL}HOLD=2026-01-01T11:00Z disk low"
  # F69: the hold is said once, on the MACHINE lines, with how to release it.
  H=$(run)
  eq "held, human" "$(printf '%s\n' "$H" | awk '/^MACHINE /, /^GREENS /' | awk '!/^GREENS /')" "MACHINE   RED  disk X: 0.8 GB free of 931 GB (below 1 GB), memory 3.2 GB free
          1 stale lock: .skillator/run.md.lock 34m (1234 sh MINGW); held since
          2026-01-01T11:00Z: disk low - release: relay-morpheus watchdog release"
  fits "held, human" "$H"
  eq "hold said once" "$(printf '%s\n' "$H" | grep -c 'disk low')" "1"
  mkdir -p sub/deep
  eq "held, from a subdir" "$(cd sub/deep && run --machine | awk '/^HOLD=/')" "HOLD=2026-01-01T11:00Z disk low"
  printf '2026-01-01T11:00Z\n' > .skillator/watchdog.hold
  eq "held, no reason" "$(run --machine | awk '/^HOLD=/')" "HOLD=2026-01-01T11:00Z -"
  # R6: a hold file that exists is held, whatever is in it - empty or blank
  # reads HOLD=? - (HOLD=- means only "no file"), as relay's status says HELD ? -.
  : > .skillator/watchdog.hold
  eq "held, empty file" "$(run --machine | awk '/^HOLD=/')" "HOLD=? -"
  printf ' \t \r\n' > .skillator/watchdog.hold
  eq "held, blank file" "$(run --machine | awk '/^HOLD=/')" "HOLD=? -"
  eq "held, blank file, human" "$(run | awk '/^          1 stale lock/')" "          1 stale lock: .skillator/run.md.lock 34m (1234 sh MINGW); held (no"
  eq "held, blank file, kv" "$(run --kv | awk '/^WATCHDOG=/')" "WATCHDOG=red"
  rm -f .skillator/watchdog.hold
  eq "not held" "$(run --machine | awk '/^HOLD=/')" "HOLD=-"
  # R2b: one rule for the hold's place - RELAY_DIR; else in git the main
  # checkout (common dir's parent, or the toplevel when the git dir lives
  # elsewhere); outside git ./.skillator of the cwd.
  git init -q --separate-git-dir "$T/sep.git" "$T/sep" || die "cannot init a separate-git-dir fixture"
  mkdir -p "$T/sep/.skillator" "$T/sep/sub" "$T/nogit/.skillator" "$T/rd"
  printf '2026-01-01T12:00Z sep low\n' > "$T/sep/.skillator/watchdog.hold"
  eq "held, separate git dir" "$(cd "$T/sep/sub" && run --machine | awk '/^HOLD=/')" "HOLD=2026-01-01T12:00Z sep low"
  printf '2026-01-01T12:01Z nogit low\n' > "$T/nogit/.skillator/watchdog.hold"
  eq "held, outside git" "$(cd "$T/nogit" && run --machine | awk '/^HOLD=/')" "HOLD=2026-01-01T12:01Z nogit low"
  printf '2026-01-01T12:02Z rd low\n' > "$T/rd/watchdog.hold"
  eq "held, RELAY_DIR" "$(cd "$T/sep/sub" && RELAY_DIR="$T/rd" run --machine | awk '/^HOLD=/')" "HOLD=2026-01-01T12:02Z rd low"
  [ ! -e "$T/relay-watchdog-called" ] || { echo "FAIL: pending spawned relay for the hold"; fail=1; }
  # No relay at all: no queued line, HOLD=-; amber on memory + the lock.
  PENDING_RELAY="$T/none.sh"
  PENDING_DF_CMD="echo '10737418240 1000000000000 X:'"
  PENDING_MEM_CMD="echo 1610612736"
  eq "amber" "$(run | awk '/^(RUNS|MACHINE) /, /^(AGENTS|GREENS) /' | awk '!/^(AGENTS|GREENS)/')" "RUNS      RUN-0012  live 14m   2/4    stage three title                   @vidul
          RUN-0014  stale 31d  1/2    later stage
MACHINE   AMBER  disk X: 10 GB free of 931 GB, memory 1.5 GB free (below 2 GB)
          1 stale lock: .skillator/run.md.lock 34m (1234 sh MINGW); no hold"
  # A figure below its threshold never reads as the threshold: 0.97 GB is "0.9", not "1.0".
  PENDING_DF_CMD="echo '1041529569 1000000000000 X:'"
  PENDING_MEM_CMD="echo 2115271393"
  eq "below threshold floors" "$(run | awk '/^MACHINE /')" "MACHINE   RED  disk X: 0.9 GB free of 931 GB (below 1 GB), memory 1.9 GB free"
  eq "below threshold floors, wrapped" "$(run | awk 'p { print; exit } /^MACHINE /{ p = 1 }')" "          (below 2 GB)"
  PENDING_DF_CMD="echo '3500398346 1000000000000 X:'"
  PENDING_MEM_CMD="echo 3435973836"
  eq "normal rounding stays" "$(run | awk '/^MACHINE /')" "MACHINE   AMBER  disk X: 3.3 GB free of 931 GB (below 5 GB), memory 3.2 GB free"
  PENDING_DF_CMD="echo '10737418240 1000000000000 X:'"
  rm -f .skillator/run.md.lock .skillator/run-1[24]-*.md
  PENDING_MEM_CMD="echo 3435973836"
  eq "green" "$(run --kv | awk '/^(RUN|QUEUED|LOCK|HOLD|WATCHDOG)=/')" "HOLD=-${NL}WATCHDOG=green"
  eq "green, human" "$(run | awk '/^(RUNS|MACHINE) /, /^(AGENTS|GREENS) /' | awk '!/^(AGENTS|GREENS)/')" "RUNS      none open
MACHINE   ok  disk X: 10 GB free of 931 GB, memory 3.2 GB free
          no stale locks; no hold"
  eq "no run working" "$(run | awk '/^          agents: /')" "          agents: no run working"
  # Pending past 10 rows: the rest is a count, not a screenful.
  { board; i=10; while [ $i -le 22 ]; do printf -- '- [ ] F%s %s row %s\n' "$i" "$D" "$i"; i=$((i + 1)); done; } > TICKETS.md
  eq "pending capped" "$(run | awk '/^  pending /, /^  deferred /' | awk 'NR == 1 || NR == 11 || NR == 12')" "  pending (15)
    F17   row 17
    ... 5 more pending: list tickets"
  # No upstream, and detached.
  git branch -q --unset-upstream
  eq "no upstream" "$(run | awk 'NR == 1')" "REPO      repo  main: no upstream  2026-01-01 12:34Z"
  eq "no upstream, kv" "$(run --kv | awk '/^(BRANCH|UNPUSHED)=/')" "BRANCH=main|-|-|-${NL}UNPUSHED=-"
  git checkout -q --detach
  eq "detached" "$(run | awk 'NR == 1')" "REPO      repo  detached HEAD  2026-01-01 12:34Z"
  eq "bad arg" "$(run --nope)" "pending: usage: pending.sh [--kv | --machine | --selftest]"
  # A147: the real df -Pk parse, through a fake df. Git Bash reports a mounted
  # Windows dir (/tmp, /) with its Windows path as the filesystem - the drive is
  # its letter, not the MSYS mount; a filesystem or mount with spaces still
  # reads its sizes from the columns before Capacity.
  mkdir -p "$T/bin"
  dfk() { printf '%s\n' '#!/bin/sh' "printf '%s\\n' 'Filesystem 1024-blocks Used Available Capacity Mounted on' '$1'" > "$T/bin/df"; chmod +x "$T/bin/df"
    PATH="$T/bin:$PATH" PENDING_DF_CMD='' run --machine | awk '/^(DRIVE|DISK_FREE|DISK_TOTAL)=/'; }
  eq "df, msys temp mount" "$(dfk 'C:/Users/someone/AppData/Local/Temp   998831100 890389084 108442016      90% /tmp')" "DRIVE=C:${NL}DISK_FREE=111044624384${NL}DISK_TOTAL=1022803046400"
  eq "df, msys root, spaces" "$(dfk 'C:/Program Files/Git   998831100 890389100 108442000      90% /')" "DRIVE=C:${NL}DISK_FREE=111044608000${NL}DISK_TOTAL=1022803046400"
  eq "df, msys drive mount" "$(dfk 'C:               998831100 890389084 108442016      90% /c')" "DRIVE=C:${NL}DISK_FREE=111044624384${NL}DISK_TOTAL=1022803046400"
  eq "df, unix mount, spaces" "$(dfk '/dev/sda1 1000 600 400 60% /mnt/my disk')" "DRIVE=/mnt/my disk${NL}DISK_FREE=409600${NL}DISK_TOTAL=1024000"

  cd "$T/.." || true
  [ "$fail" = 0 ] || exit 1
  echo ok
}

case ${1:-} in
  --selftest) selftest; exit 0 ;;
  ''|--kv|--machine) : ;;
  *) die "usage: pending.sh [--kv | --machine | --selftest]" ;;
esac
[ $# -le 1 ] || die "usage: pending.sh [--kv | --machine | --selftest]"
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
RELAY=${PENDING_RELAY:-$HERE/../../relay-morpheus/hooks/relay-morpheus.sh}
NOW=$(num "${PENDING_NOW:-}"); [ -n "$NOW" ] || NOW=$(date +%s)
find_main
case ${1:-} in
  --machine) machine_kv ;;
  --kv) K=$(facts); printf '%s\n' "$K"; printf '%s\n' "$K" | awk "$AWK_LIB"'END { judge(); print "WATCHDOG=" LEVEL }' ;;
  *) facts | human ;;
esac
