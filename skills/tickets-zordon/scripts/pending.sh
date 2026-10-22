#!/bin/sh
# pending.sh - what is pending, in one report (F50): the board, relay runs, the
# run queue, live sessions, unpushed commits, owed GREENs and the machine facts
# (F48). Windows twin: pending.ps1, same output; keep the two in step.
#
#   pending.sh              the human report
#   pending.sh --kv         the same facts as KEY=value lines (the ops-board mod parses these)
#   pending.sh --machine    DRIVE / DISK_* / MEM_FREE / LOCK / HOLD only (cheap; the band's poll)
#   pending.sh --selftest   fixture repo, every mode, prints ok
#
# --kv keys, in this order:
#   OPEN= PENDING= PROGRESS= BLOCKED= DECISION= DEFERRED=   counts on the main checkout's TICKETS.md
#   RUN=<id>|<done>/<total>|<owner or ->|<first open stage or ->   per run not all done (relay list)
#   QUEUED=<id>                       per row of `relay-morpheus queue-run list` in state queued
#                                     (none while .skillator/queue.md does not exist)
#   SESSION=<name>|<status>|<cwd>|<idle min>   per <config dir>/sessions/*.json written in the last 30 min
#   UNPUSHED=<n> | UNPUSHED=-         git rev-list --count @{u}..HEAD (local refs only; no upstream: -)
#   OWED=<ID>                         per ticket line (any box) with the word "owed" in it
#   DRIVE= DISK_FREE= DISK_TOTAL= MEM_FREE=   bytes; empty = unknown, never judged
#   LOCK=<path>|<age min>|<holder>    *.lock older than 10 min: TICKETS.md.lock, .skillator/*.lock,
#                                     .skillator/*/*.lock - listed, never deleted
#   HOLD=<since> <reason> | HOLD=-    <main>/.skillator/watchdog.hold (RELAY_DIR overrides), read
#                                     directly - the words relay-morpheus watchdog status gives;
#                                     an empty or blank file is held: HOLD=? -
#   WATCHDOG=red|amber|green          red: disk or memory free < 1 GB; amber: disk < 5 GB,
#                                     memory < 2 GB, a stale lock or a hold; else green
# OPEN = [ ] [~] [!] [?], as tickets-zordon's count line has it; deferred [>]
# is not open and has its own key.
#
# Creates nothing: `queue-run list` (which creates the queue file when absent)
# is only called while <main>/.skillator/queue.md exists; `list` only reads,
# and the hold file is read directly (no relay spawn per poll). Test-only overrides: PENDING_DF_CMD (prints "<free> <total>
# <drive>"), PENDING_MEM_CMD (prints "<free bytes>"), PENDING_SESSIONS_DIR,
# PENDING_RELAY (the relay script), PENDING_NOW (epoch seconds, for ages).
# No `find` or `sort`: on Windows sh can get System32's (usage-watch.sh says why).
set -u
LC_ALL=C
export LC_ALL

die() { echo "pending: $*" >&2; exit 1; }

EMD=$(printf '\342\200\224')
ENDASH=$(printf '\342\200\223')
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

# A ticket line, as ticket-meta reads it: `[indent]- [<box>] <ID> <dash> ...`.
TRE="^[ \t]*- \\[.\\][ \t]+[A-Z][A-Z]?[A-Z]?[0-9]+[a-z]?[ \t]*($EMD|$ENDASH|-)"
board() {   # counts | owed
  f="$MAIN/TICKETS.md"
  [ -f "$f" ] || f=/dev/null
  RE=$TRE awk -v what="$1" '
    { sub(/\r$/, "") }
    $0 ~ ENVIRON["RE"] {
      i = index($0, "- ["); m = substr($0, i + 3, 1)
      r = substr($0, i + 5); sub(/^[ \t]+/, "", r); match(r, /^[A-Z]+[0-9]+[a-z]?/); id = substr(r, 1, RLENGTH)
      c[m]++
      if (tolower($0) ~ /(^|[^a-z0-9_])owed([^a-z0-9_]|$)/) ow = ow "OWED=" id "\n"
    }
    END {
      p = c[" "] + 0; g = c["~"] + 0; b = c["!"] + 0; q = c["?"] + 0; d = c[">"] + 0
      if (what == "counts") printf "OPEN=%d\nPENDING=%d\nPROGRESS=%d\nBLOCKED=%d\nDECISION=%d\nDEFERRED=%d\n", p + g + b + q, p, g, b, q, d
      else printf "%s", ow
    }' "$f"
}

# The first stage of a run whose box is neither x nor > (from its own run file).
stage_of() {
  n=${1#RUN-}; p=$n
  while :; do case $p in 0?*) p=${p#0} ;; *) break ;; esac; done
  for f in "$MAIN/.skillator/run-$n-"*.md "$MAIN/.skillator/run-$n.md" "$MAIN/.skillator/run-$p-"*.md "$MAIN/.skillator/run-$p.md"; do
    [ -f "$f" ] || continue
    s=$(awk 'BEGIN { FS = "|" } { sub(/\r$/, "") }
      /^\| *[0-9]+ *\|/ { st = $4; gsub(/[ \t]/, "", st); if (st != "x" && st != ">") { t = $3; gsub(/^[ \t]+|[ \t]+$/, "", t); print t; exit } }' "$f")
    [ -n "$s" ] || s=-
    echo "$s"; return 0
  done
  echo -
}

runs_kv() {
  out=$(relay list) || return 0
  printf '%s\n' "$out" | awk '
    function flush() { if (id != "" && t > 0 && d < t) print id "\t" d "/" t "\t" (ow == "" ? "-" : ow); id = "" }
    /^RUN-[0-9]+ / { flush(); id = $1; ow = ""; d = 0; t = 0; x = ""; s = $0
      while (match(s, /[0-9]+\/[0-9]+ done/)) { x = substr(s, RSTART, RLENGTH); s = substr(s, RSTART + RLENGTH) }
      if (x != "") { split(x, a, /[\/ ]/); d = a[1] + 0; t = a[2] + 0 }
      next }
    /^          owner: / { ow = substr($0, 18); gsub(/^[ \t]+|[ \t]+$/, "", ow) }
    END { flush() }' | while IFS='	' read -r id dt ow; do
      echo "RUN=$id|$dt|$ow|$(stage_of "$id")"
    done
}

queued_kv() {
  # queue-run list creates the queue file (and its dir) when absent: no file,
  # no call - pending never creates anything.
  [ -f "$MAIN/.skillator/queue.md" ] || return 0
  out=$(relay queue-run list) || return 0
  printf '%s\n' "$out" | awk -F'|' '/^\| *[0-9]+ *\|/ { s = $4; gsub(/[ \t]/, "", s); if (s == "queued") { r = $3; gsub(/[ \t]/, "", r); print "QUEUED=" r } }'
}

# Live sessions: <config dir>/sessions/*.json written in the last 30 minutes
# (an undocumented Claude Code file: pid, sessionId, cwd, name, status, updatedAt).
sessions_kv() {
  sd=${PENDING_SESSIONS_DIR:-${CLAUDE_CONFIG_DIR:-${HOME:-}/.claude}/sessions}
  for f in "$sd"/*.json; do
    [ -f "$f" ] || continue
    m=$(num "$(mtime "$f")"); [ -n "$m" ] || continue
    a=$((NOW - m))
    [ "$a" -lt 1800 ] || continue
    [ "$a" -ge 0 ] || a=0
    awk -v idle=$((a / 60)) '
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
      { T = T $0 "\n" }
      END { print "SESSION=" js("name") "|" js("status") "|" js("cwd") "|" idle }' "$f"
  done
}

unpushed_kv() {
  u=$(git -C "$MAIN" rev-list --count '@{u}..HEAD' 2>/dev/null) || u=''
  u=$(num "$u"); [ -n "$u" ] || u=-
  echo "UNPUSHED=$u"
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
  board counts; runs_kv; queued_kv; sessions_kv; unpushed_kv; board owed; machine_kv
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

human() {
  awk "$AWK_LIB"'
    K == "OPEN" { o = V } K == "PENDING" { np = V } K == "PROGRESS" { ng = V }
    K == "BLOCKED" { nb = V } K == "DECISION" { nq = V } K == "DEFERRED" { nd = V }
    K == "RUN" { split(V, a, "|"); runs = runs (runs == "" ? "RUNS      " : "          ") a[1] "  " a[2] "  " a[4] "\n"
                 if (a[3] != "-") runs = runs "          owner " a[3] "\n" }
    K == "QUEUED" { q = q (q == "" ? "" : " ") V }
    K == "SESSION" { n = split(V, a, "|"); ag = ag (ag == "" ? "AGENTS    " : "          ") a[1] " " a[2] " idle " a[n] "m\n" }
    K == "UNPUSHED" { up = V }
    K == "OWED" { ow = ow (ow == "" ? "" : " ") V }
    K == "DRIVE" { dr = V } K == "DISK_TOTAL" { dt = V }
    K == "LOCK" { s = V; j = index(s, "|"); lp = substr(s, 1, j - 1); s = substr(s, j + 1); j = index(s, "|")
                  lk = lk (lk == "" ? "LOCKS     " : "          ") lp " " substr(s, 1, j - 1) "m (" substr(s, j + 1) ")\n" }
    END {
      judge()
      printf "TICKETS   %d open   [~]%d [!]%d [?]%d [ ]%d   [>]%d deferred\n", o, ng, nb, nq, np, nd
      printf "%s", (runs == "" ? "RUNS      none open\n" : runs)
      printf "QUEUED    %s\n", (q == "" ? "none" : q)
      printf "%s", (ag == "" ? "AGENTS    none\n" : ag)
      printf "UNPUSHED  %s\n", (up == "-" ? "- (no upstream)" : up)
      printf "GREENS    %s\n", (ow == "" ? "none owed" : "owed: " ow)
      printf "DISK      %s %s free of %s\n", (dr == "" ? "?" : dr), fig(DF, 1073741824, 5368709120), gb(dt)
      printf "MEMORY    %s free\n", fig(MF, 1073741824, 2147483648)
      printf "%s", (lk == "" ? "LOCKS     none stale\n" : lk)
      printf "HOLD      %s\n", ((HD == "" || HD == "-") ? "none" : HD)
      printf "WATCHDOG  %s\n", (LEVEL == "green" ? "ok" : LEVEL " - " REASONS)
    }'
}

selftest() {
  self=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/$(basename -- "$0")
  T=$(mktemp -d 2>/dev/null || mktemp -d -t pending)
  trap 'rm -rf "$T"' EXIT
  fail=0
  D=$(printf '\342\200\224')
  NL='
'
  eq() { [ "$2" = "$3" ] || { printf 'FAIL: %s:\n--- expected\n%s\n--- got\n%s\n' "$1" "$3" "$2"; fail=1; }; }
  run() { sh "$self" "$@" 2>&1 | tr -d '\r'; }

  R="$T/repo"
  mkdir -p "$R/.skillator/sub" "$T/sessions" && cd "$R" && git init -q . && git config core.autocrlf false || die "cannot init fixture"
  printf '%s\n' "# Tickets" "" "## Bugs" \
    "- [~] B1 $D cart drawer keeps items (@cc-aaaaaa)" \
    "- [!] B2 $D orders 500 past page 3" \
    "- [?] F1 $D pick the chart library [decide: @asha]" \
    "- [>] F2 $D later thing" \
    "- [ ] F3 $D pending one" \
    "  - [ ] F3a $D a towed car, slowed down" \
    "- [x] A1 $D fixed, the GREEN re-run is OWED" \
    "- [ ] no id on this line" \
    "not a ticket, owed" > TICKETS.md
  printf '%s\n' "# RUN-12 - demo run" "plan: none" "owner: @vidul" "" "## Stages" \
    "| # | stage | state | owner | heartbeat | landed |" \
    "|---|-------|-------|-------|-----------|--------|" \
    "| 1 | stage one | x | a | - | abc |" \
    "| 2 | stage two | > | a | - | stage 3 |" \
    "| 3 | stage three title |  | - | - | - |" \
    "| 4 | stage four |  | - | - | - |" > .skillator/run-12-demo-run.md
  printf '1234 sh MINGW\n' > .skillator/run.md.lock
  printf '99 sh MINGW\n' > .skillator/x.lock
  printf '7 sh MINGW\n' > .skillator/sub/fresh.lock
  touch -t 202601011200.00 .skillator/run.md.lock
  touch -t 202601011232.00 .skillator/x.lock .skillator/sub/fresh.lock
  printf '{"pid":1,"sessionId":"s1","cwd":"C:\\\\w\\\\r","name":"repo-c0","status":"busy","updatedAt":1}\n' > "$T/sessions/a.json"
  printf '{"pid":2,"sessionId":"s2","cwd":"/old","name":"old-one","status":"idle","updatedAt":1}\n' > "$T/sessions/b.json"
  touch -t 202601011230.00 "$T/sessions/a.json"
  touch -t 202601011000.00 "$T/sessions/b.json"
  base=$(date -r .skillator/run.md.lock +%s) || die "date -r failed"
  # A fake relay-morpheus: canned list / queue-run list. R2: the hold is read
  # from the file, never by spawning relay - a watchdog call leaves a mark.
  cat > "$T/relay.sh" <<'EOF'
case $1 in
  list) printf '%s\n' 'RUN-0012  demo run                                    2/4 done  (stage 3 open)' \
          '          plan: none' '          owner: @vidul' '          resume: continue RUN-0012' \
          'RUN-0013  all landed                                  3/3 done' \
          '          plan: none' '          resume: continue RUN-0013' ;;
  queue-run) echo '# Run queue' >> .skillator/queue.md   # the real one creates it
          printf '%s\n' '# Run queue' 'away: -' 'landing: -' '' '| # | run | state | since | owner |' \
          '|---|-----|-------|-------|-------|' '| 1 | RUN-0012 | running | 2026-01-01T10:00Z | @vidul |' \
          '| 2 | RUN-0013 | queued | 2026-01-01T10:00Z | - |' '| 3 | RUN-0014 | landed | 2026-01-01T10:00Z | - |' ;;
  watchdog) : > "$PENDING_T/relay-watchdog-called"; echo "HELD 2026-01-01T09:00Z from relay" ;;
  *) exit 1 ;;
esac
EOF
  PENDING_RELAY="$T/relay.sh"
  PENDING_DF_CMD="echo '858993459 1000000000000 X:'"
  PENDING_MEM_CMD="echo 3435973836"
  PENDING_SESSIONS_DIR="$T/sessions"
  PENDING_NOW=$((base + 2040))
  PENDING_T="$T"
  export PENDING_RELAY PENDING_DF_CMD PENDING_MEM_CMD PENDING_SESSIONS_DIR PENDING_NOW PENDING_T
  unset RELAY_DIR 2>/dev/null || :

  eq "kv" "$(run --kv)" "OPEN=5${NL}PENDING=2${NL}PROGRESS=1${NL}BLOCKED=1${NL}DECISION=1${NL}DEFERRED=1${NL}RUN=RUN-0012|2/4|@vidul|stage three title${NL}SESSION=repo-c0|busy|C:\\w\\r|4${NL}UNPUSHED=-${NL}OWED=A1${NL}DRIVE=X:${NL}DISK_FREE=858993459${NL}DISK_TOTAL=1000000000000${NL}MEM_FREE=3435973836${NL}LOCK=.skillator/run.md.lock|34|1234 sh MINGW${NL}HOLD=-${NL}WATCHDOG=red"
  # No queue.md: queue-run list is never called (it would create the file).
  [ ! -e .skillator/queue.md ] || { echo "FAIL: pending created .skillator/queue.md"; fail=1; }
  echo '# Run queue' > .skillator/queue.md
  eq "human" "$(run)" "TICKETS   5 open   [~]1 [!]1 [?]1 [ ]2   [>]1 deferred${NL}RUNS      RUN-0012  2/4  stage three title${NL}          owner @vidul${NL}QUEUED    RUN-0013${NL}AGENTS    repo-c0 busy idle 4m${NL}UNPUSHED  - (no upstream)${NL}GREENS    owed: A1${NL}DISK      X: 0.8 GB free of 931 GB${NL}MEMORY    3.2 GB free${NL}LOCKS     .skillator/run.md.lock 34m (1234 sh MINGW)${NL}HOLD      none${NL}WATCHDOG  red - disk 0.8 GB free (below 1 GB); 1 stale lock"
  # R2: HOLD= comes from <main>/.skillator/watchdog.hold itself, the words
  # `relay-morpheus watchdog status` gives (CRLF tolerated, first line only).
  printf '2026-01-01T11:00Z disk low\r\nsecond line\n' > .skillator/watchdog.hold
  eq "machine, held" "$(run --machine)" "DRIVE=X:${NL}DISK_FREE=858993459${NL}DISK_TOTAL=1000000000000${NL}MEM_FREE=3435973836${NL}LOCK=.skillator/run.md.lock|34|1234 sh MINGW${NL}HOLD=2026-01-01T11:00Z disk low"
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
  eq "held, blank file, human" "$(run | awk '/^(HOLD|WATCHDOG) /')" "HOLD      ? -${NL}WATCHDOG  red - disk 0.8 GB free (below 1 GB); 1 stale lock; held (? -)"
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
  # No relay at all: no RUN / QUEUED lines, HOLD=-; amber on memory + the lock.
  PENDING_RELAY="$T/none.sh"
  PENDING_DF_CMD="echo '10737418240 1000000000000 X:'"
  PENDING_MEM_CMD="echo 1610612736"
  eq "amber" "$(run | awk '/^(RUNS|QUEUED|DISK|WATCHDOG) /')" "RUNS      none open${NL}QUEUED    none${NL}DISK      X: 10 GB free of 931 GB${NL}WATCHDOG  amber - memory 1.5 GB free (below 2 GB); 1 stale lock"
  # A figure below its threshold never reads as the threshold: 0.97 GB is "0.9", not "1.0".
  PENDING_DF_CMD="echo '1041529569 1000000000000 X:'"
  PENDING_MEM_CMD="echo 2115271393"
  eq "below threshold floors" "$(run | awk '/^(DISK|MEMORY|WATCHDOG) /')" "DISK      X: 0.9 GB free of 931 GB${NL}MEMORY    1.9 GB free${NL}WATCHDOG  red - disk 0.9 GB free (below 1 GB); memory 1.9 GB free (below 2 GB); 1 stale lock"
  PENDING_DF_CMD="echo '3500398346 1000000000000 X:'"
  PENDING_MEM_CMD="echo 3435973836"
  eq "normal rounding stays" "$(run | awk '/^(DISK|MEMORY|WATCHDOG) /')" "DISK      X: 3.3 GB free of 931 GB${NL}MEMORY    3.2 GB free${NL}WATCHDOG  amber - disk 3.3 GB free (below 5 GB); 1 stale lock"
  PENDING_DF_CMD="echo '10737418240 1000000000000 X:'"
  rm -f .skillator/run.md.lock
  PENDING_MEM_CMD="echo 3435973836"
  eq "green" "$(run --kv | awk '/^(RUN|QUEUED|LOCK|HOLD|WATCHDOG)=/')" "HOLD=-${NL}WATCHDOG=green"
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
