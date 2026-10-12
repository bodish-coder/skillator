#!/bin/sh
# relay - bookkeeping for `.skillator/run.md`, the staged-run ledger.
#
# Every command here reads or edits that one file and nothing else. There is no
# judgement in this script: deciding a stage is done is the model's job, saying
# so on disk is this script's. See ../SKILL.md for the rule it serves.
#
#   relay-morpheus.sh list                             every run + how to resume it
#   relay-morpheus.sh resume <id>                      what a fresh session needs
#   relay-morpheus.sh init <plan> <title> <stage>...   create the run file
#   relay-morpheus.sh add <stage>                      append a row, print its number
#   relay-morpheus.sh stage <n> <state> [owner] [landed]
#   relay-morpheus.sh heartbeat <n>
#   relay-morpheus.sh status
#   relay-morpheus.sh orphans [minutes]                default 20
#   relay-morpheus.sh selftest
#
# Chain (F31) - stages that are ticket workflows, each started by the last:
#   relay-morpheus.sh chain plan <n> --prompt-file F [--tickets T] [--fix t --verify t] [--files F] [--mode workflow|agents]
#   relay-morpheus.sh chain dispatch <n> --driver @tag [--owner O] [--take] [--override] [--confirmed]
#   relay-morpheus.sh chain hold <pct> [--window 5h|7d] [--next n]
#   relay-morpheus.sh chain release [--override [--confirmed]]
#   relay-morpheus.sh chain wait [--interval 600] [--max 19800] [--for 1500]
#   relay-morpheus.sh chain status | decide
# Exit 2 = refused by a usage/driver/state guard; wait: 0 RELEASE, 2 STOP (the
# 7-day stop - nothing to wait for), 3 STUCK, 4 UNOBSERVABLE, 5 WAITING
# (re-arm). RELAY_CHAIN_HOLD_PCT (80), RELAY_CHAIN_WEEKLY_PCT (90),
# RELAY_CHAIN_DRIVER_STALE (20 min), RELAY_LEVEL_CMD (replaces `usage-watch.sh level`, for tests).
#
# Any command takes an optional run id first: `relay-morpheus.sh 3 status`.
#
# States:  (pending) | ~ in flight | x landed | ! failed
#
# RUN ids and stage numbers are serial across the whole project, not per run
# (F22): they come from practice/scripts/next-id.sh (kinds RUN and S), which
# also reads every run file in the tree and on every ref. RELAY_NEXT_ID
# overrides where that script is looked for.
set -e

RUN="${RELAY_RUN:-}"
DIR="${RELAY_DIR:-.skillator}"
# A failure while holding the run lock releases it on the way out; otherwise
# the next call spins 30s on a lock nobody holds.
die() { [ -z "${LOCK:-}" ] || unlock; echo "FAIL: $*" >&2; exit 1; }
now() { date -u +%Y-%m-%dT%H:%MZ; }

# A run id is a short number a human can say out loud to another session -
# "continue RUN-3". The timestamp ids this replaces were unsayable, which made
# handing a run over a copy-paste of a path instead of a sentence.
# The id out of a run filename, with no regex to get wrong: basename, drop the
# `run-` prefix, keep the leading digits.
id_of() {
  b=${1##*/}; b=${b#run-}; b=${b%%-*}; b=${b%.md}
  case $b in ''|*[!0-9]*) return 0 ;; esac
  echo "$b"
}

next_id() {
  n=0
  for f in "$DIR"/run-*.md; do
    [ -f "$f" ] || continue
    b=${f##*/run-}; b=${b%%-*}
    case $b in ''|*[!0-9]*) continue ;; esac
    [ "$b" -gt "$n" ] && n=$b
  done
  echo $((n + 1))
}

# Numbers used to be local: RUN = 1 + the highest run file here, stages 1..n
# per run. Two worktrees both made RUN-4, and every run had a stage 1, so
# "stage 3" named a different thing in each. The F21 allocator fixes both - it
# ships beside the skills (installed: <skills>/practice/, a clone or plugin:
# <root>/practice/), and without it the local rule still works, said on stderr.
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd)
find_next_id() {
  if [ -n "${RELAY_NEXT_ID+x}" ]; then
    [ -f "$RELAY_NEXT_ID" ] && echo "$RELAY_NEXT_ID"
    return 0
  fi
  for c in "$HERE/../../practice/scripts/next-id.sh" "$HERE/../../../practice/scripts/next-id.sh"; do
    [ -f "$c" ] && { echo "$c"; return 0; }
  done
  return 0
}

# alloc <RUN|S> <count> <run-dir>: print <count> fresh numbers, one per line.
alloc() {
  nid=$(find_next_id)
  if [ -n "$nid" ]; then
    out=$(sh "$nid" --runs "$3" --count "$2" "$1") || die "next-id.sh could not allocate $1 (see above)"
    # same check as the .ps1 Alloc: exactly <count> lines, each a number
    [ "$(printf '%s\n' "$out" | grep -c '^[0-9][0-9]*$')" -eq "$2" ] &&
      [ "$(printf '%s\n' "$out" | wc -l | tr -d ' ')" -eq "$2" ] ||
      die "next-id.sh returned unexpected output for $1: $out"
    printf '%s\n' "$out"
    return 0
  fi
  echo "relay-morpheus.sh: next-id.sh not found - numbering $1 from this directory only, which another worktree can repeat" >&2
  if [ "$1" = RUN ]; then m=$(($(DIR="$3" next_id) - 1)); else
    m=0
    for f in "$3"/run-*.md "$3"/run.md; do
      [ -f "$f" ] || continue
      r=$(sed -n 's/^| *\([0-9][0-9]*\) *|.*/\1/p' "$f" | awk 'BEGIN{m=0} {if ($1+0 > m) m=$1+0} END{print m}')
      [ "$r" -gt "$m" ] && m=$r
    done
  fi
  seq $((m + 1)) $((m + $2))
}

# `RUN-3`, `run-3`, `3` and a path all resolve to the same file, because
# whoever types it next is working from memory of a conversation.
resolve() {
  case "$1" in */*) [ -f "$1" ] && { echo "$1"; return 0; } ;; esac
  n=$(printf %s "$1" | tr -cd '0-9')
  [ -n "$n" ] || return 1
  for f in "$DIR"/run-"$n"-*.md "$DIR"/run-"$n".md; do
    [ -f "$f" ] && { echo "$f"; return 0; }
  done
  return 1
}

# With no id given, fall back to the one open run if there is exactly one.
# Two or more and the script refuses rather than guessing which.
pick_run() {
  [ -n "$RUN" ] && return 0
  c=0
  for f in "$DIR"/run-*.md "$DIR"/run.md; do
    [ -f "$f" ] || continue
    c=$((c + 1)); RUN="$f"
  done
  [ "$c" -gt 1 ] && die "$c runs here - name one (relay-morpheus.sh <id> <cmd>), or see: relay-morpheus.sh list"
  [ "$c" = 0 ] && RUN="$DIR/run.md"
  return 0
}

slug() { printf %s "$1" | tr 'A-Z' 'a-z' | tr -cs 'a-z0-9' '
' | grep . | head -4 | paste -sd- -; }

# Minutes between two YYYY-MM-DDTHH:MMZ stamps, done in awk so the script does
# not depend on GNU `date -d` (absent on macOS) or on python being installed.
# Days-since-civil is the standard Howard Hinnant algorithm; the format is
# fixed and always UTC, so there is no timezone case to get wrong.
age_min() {
  awk -v a="$1" -v b="$2" 'BEGIN{
    split(a,A,/[-TZ:]/); split(b,B,/[-TZ:]/);
    print int((mins(B)-mins(A)));
  }
  function days(y,m,d,  era,yoe,doy,doe){
    y -= (m <= 2); era = int((y>=0?y:y-399)/400); yoe = y - era*400;
    doy = int((153*(m + (m>2 ? -3 : 9)) + 2)/5) + d-1;
    doe = yoe*365 + int(yoe/4) - int(yoe/100) + doy;
    return era*146097 + doe - 719468;
  }
  function mins(P){ return days(P[1]+0,P[2]+0,P[3]+0)*1440 + P[4]*60 + P[5]; }'
}

need_run() { pick_run; [ -f "$RUN" ] || die "no run file at $RUN (relay-morpheus.sh init ...)"; }

# Every mutation is a read-modify-write of the whole file, and SKILL.md
# sanctions concurrent in-flight stages - two `stage` calls landing at once
# would lose one row, which is the loss this whole skill exists to prevent.
# `mkdir` is the portable atomic test-and-set. ponytail: a spin with a stale
# timeout, not a lock manager; if a run ever needs more than one writer per
# second, the ledger is the wrong shape, not the lock.
LOCK=""
# The lock dir carries its holder's pid. Breaking a stale lock without checking
# it let B delete a slow-but-alive A's lock, and A's release then deleted B's -
# admitting C mid-write, which is the lost update the lock exists to prevent.
lock() {
  LOCK="$RUN.lock"
  mkdir "$LOCK" 2>/dev/null && { echo $$ > "$LOCK/pid"; return; }   # the common case
  held=$(cat "$LOCK/pid" 2>/dev/null)                               # who had it when we arrived
  i=0
  while ! mkdir "$LOCK" 2>/dev/null; do
    i=$((i+1))
    # 30s of one holder's turn means that process died holding it. Break it
    # only if the pid has not changed since we arrived - otherwise the lock has
    # already turned over and we would be stealing it from someone alive.
    if [ "$i" -gt 300 ] && [ "$(cat "$LOCK/pid" 2>/dev/null)" = "$held" ]; then
      rm -rf "$LOCK"
    fi
    sleep 0.1 2>/dev/null || sleep 1
  done
  echo $$ > "$LOCK/pid"
}
# No EXIT trap: this file is sourced by cmd_selftest, whose own cleanup trap a
# lock() installed here would silently replace - which leaked one mktemp dir
# per selftest run. Release is explicit, on both the success and failure paths.
unlock() {
  if [ -n "$LOCK" ] && [ "$(cat "$LOCK/pid" 2>/dev/null)" = "$$" ]; then rm -rf "$LOCK"; fi
  LOCK=""
}

# Touch `updated:` on every mutation. A run file whose header is older than its
# rows has been edited by hand, which is allowed but worth being able to see.
stamp_updated() {
  t=$(now)
  awk -v t="$t" '/^started: /{sub(/updated: .*/, "updated: " t)} {print}' "$RUN" > "$RUN.tmp.$$"
  mv "$RUN.tmp.$$" "$RUN"
}

cmd_init() {
  plan="$1"; title="$2"; shift 2
  [ -n "$RUN" ] || RUN=""
  [ -n "$plan" ] && [ -n "$title" ] && [ "$#" -gt 0 ] \
    || die "usage: relay-morpheus.sh init <plan> <title> <stage>..."
  # A `|` in a stage name adds a column, and every later read is positional -
  # the state would be written into the name cell and the sha into heartbeat,
  # silently, with no error anywhere. Checked before any number is reserved.
  for s in "$@"; do
    case "$s" in *'|'*) die "stage name contains '|', which would shift every column: $s" ;; esac
  done
  if [ -z "$RUN" ]; then
    mkdir -p "$DIR"
    id=$(alloc RUN 1 "$DIR") || exit 1
    RUN="$DIR/run-$id-$(slug "$title").md"
  else
    id=$(id_of "$RUN")
    [ -n "$id" ] || id=1
  fi
  [ -f "$RUN" ] && die "run file already exists: $RUN (a run file is never overwritten)"
  mkdir -p "$(dirname "$RUN")"
  # Stage numbers continue after the highest any run has used, so "stage 24"
  # names one stage in the whole project, not one per run.
  nums=$(alloc S "$#" "$(dirname "$RUN")") || exit 1
  t=$(now)
  {
    echo "# RUN-$id - $title"
    echo "plan: $plan"
    echo "started: $t   updated: $t"
    echo
    echo "## Stages"
    echo "| # | stage | state | owner | heartbeat | landed |"
    echo "|---|-------|-------|-------|-----------|--------|"
    for s in "$@"; do
      n=$(printf '%s\n' "$nums" | head -1); nums=$(printf '%s\n' "$nums" | sed 1d)
      echo "| $n | $s |   | - | - | - |"
    done
    echo
    echo "## In flight"
    echo
    echo "## Rulings"
  } > "$RUN"
  echo "$RUN"
  # The whole point of the id: this line is what gets pasted into another
  # session, or said out loud. A path is not a sentence.
  echo "hand this to any session:  continue RUN-$id"
}

# A stage found mid-run gets its row the same way init's did: the next serial
# number, appended after the last row. Printed so the caller can say `stage <n>`.
cmd_add() {
  name="$1"
  [ -n "$name" ] && [ "$#" = 1 ] || die "usage: relay-morpheus.sh add <stage>"
  case "$name" in *'|'*) die "stage name contains '|', which would shift every column: $name" ;; esac
  need_run
  n=$(alloc S 1 "$(dirname "$RUN")") || exit 1
  lock
  # After the last table row of `## Stages`; the separator row counts, so an
  # empty table still takes its first row in the right place.
  awk -v row="| $n | $name |   | - | - | - |" '
    { line[NR]=$0 }
    /^## Stages/ { on=1; next }
    on && /^## / { on=0 }
    on && /^\|/ { last=NR }
    END {
      if (!last) exit 3
      for (i=1; i<=NR; i++) { print line[i]; if (i==last) print row }
    }' "$RUN" > "$RUN.tmp.$$" \
    || { rm -f "$RUN.tmp.$$"; unlock; die "no stage table in $RUN"; }
  mv "$RUN.tmp.$$" "$RUN"
  stamp_updated
  unlock
  echo "$n"
}

# Rows are keyed by stage number, so a redispatch rewrites its row instead of
# appending a second one - that is what makes a resume idempotent.
cmd_stage() {
  n="$1"; state="$2"; owner="$3"; landed="$4"
  [ -n "$n" ] || die "usage: relay-morpheus.sh stage <n> <state> [owner] [landed]"
  case "$state" in ''|'~'|x|'!') ;; *) die "unknown state: $state (one of '' ~ x !)" ;; esac
  # Same reason `init` refuses it in a stage name: a `|` adds a column, and the
  # next positional read writes state into the wrong cell. `landed` takes a
  # path, so this is reachable without an exotic owner string.
  for v in "$owner" "$landed"; do
    case "$v" in *'|'*) die "'|' in owner/landed would shift every column: $v" ;; esac
  done
  [ "$state" = x ] && [ -z "$landed" ] \
    && die "stage $n marked landed with no sha or path - that is the lie the next session believes"
  need_run
  lock
  set_row "$n" "$state" "$owner" "$landed" || die "no stage $n in $RUN"
  stamp_updated
  unlock
}

# Rewrite row <n>'s state/owner/heartbeat/landed. The caller holds the lock;
# returns non-zero when there is no such row.
set_row() {
  t=$(now)
  awk -v n="$1" -v st="$2" -v ow="$3" -v la="$4" -v t="$t" -v F=0 '
    BEGIN{FS="|"; OFS="|"}
    /^\| *[0-9]+ *\|/ {
      num=$2; gsub(/ /,"",num);
      if (num==n) {
        found=1;
        $4=" " (st=="" ? " " : st) " ";
        if (ow!="") $5=" " ow " ";
        $6=" " t " ";
        if (la!="") $7=" " la " ";
        print; next;
      }
    }
    {print}
    END{ if(!found) exit 3 }' "$RUN" > "$RUN.tmp.$$" \
    || { rm -f "$RUN.tmp.$$"; return 3; }
  mv "$RUN.tmp.$$" "$RUN"
}

cmd_heartbeat() {
  n="${1:-}"; [ -n "$n" ] || die "usage: relay-morpheus.sh heartbeat <n> [--driver TAG]"
  shift; ME="${RELAY_CHAIN_DRIVER:-}"
  while [ "$#" -gt 0 ]; do
    case $1 in --driver) [ "$#" -ge 2 ] || die "heartbeat: --driver needs a value"; ME=$2; shift ;; *) die "heartbeat: unknown flag $1" ;; esac
    shift
  done
  need_run
  # A heartbeat carries the row's existing `landed` back in. Without it the
  # "x with no sha" guard fires on a stage that already landed, turning a
  # no-op bookkeeping call from a late-reporting agent into a hard error.
  cur=$(awk -v n="$n" 'BEGIN{FS="|"} /^\| *[0-9]+ *\|/{num=$2;gsub(/ /,"",num); if(num==n){s=$4;gsub(/ /,"",s); l=$7;gsub(/^ +| +$/,"",l); print s "\t" l}}' "$RUN")
  st=$(printf %s "$cur" | cut -f1); la=$(printf %s "$cur" | cut -f2)
  [ "$la" = "-" ] && la=""
  cmd_stage "$n" "$st" "" "$la"
  # F31: the driver's own heartbeat keeps its stamp fresh - a live driver in a
  # 40-minute stage is not stale. Anyone else's leaves the stamp alone.
  if is_me; then lock; touch_driver; stamp_updated; unlock; fi
}

# One line per run, newest last, with the sentence that resumes it.
cmd_list() {
  any=0
  for f in "$DIR"/run-*.md "$DIR"/run.md; do
    [ -f "$f" ] || continue
    any=1
    id=$(id_of "$f"); [ -n "$id" ] || id="?"
    title=$(sed -n '1s/^# RUN[-a-zA-Z0-9]* *- *//p' "$f")
    plan=$(sed -n '2s/^plan: *//p' "$f")
    # One awk pass, not `grep -c`: grep prints 0 and ALSO exits 1 when it
    # finds nothing, so `$(grep -c ... || echo 0)` returns 0 twice.
    set -- $(awk 'BEGIN{FS="|"} /^\| *[0-9]+ *\|/{t++; s=$4; gsub(/ /,"",s); if(s=="x")d++} END{print t+0, d+0}' "$f")
    tot=$1; done_n=$2
    open=$(awk 'BEGIN{FS="|"} /^\| *[0-9]+ *\|/{s=$4;gsub(/ /,"",s); if(s=="~"||s=="!"){n=$2;gsub(/ /,"",n); printf "%s%s", (c++?",":""), n}}' "$f")
    printf 'RUN-%s  %-42s  %s/%s done' "$id" "$title" "$done_n" "$tot"
    [ -n "$open" ] && printf '  (stage %s open)' "$open"
    printf '
          plan: %s
          resume: continue RUN-%s
' "$plan" "$id"
  done
  [ "$any" = 1 ] || echo "no runs in $DIR"
}

# Everything a session that has never seen this work needs, in one paste.
cmd_resume() {
  [ -n "${1:-}" ] || die "usage: relay-morpheus.sh resume <id>"
  f=$(resolve "$1") || die "no run matching '$1' - see: relay-morpheus.sh list"
  echo "# Resuming $f"
  echo "# Read the plan named below, then the ledger, then start at the first"
  echo "# stage that is not x. The In-flight block holds the exact prompt to"
  echo "# redispatch anything that was running."
  echo
  cat "$f"
}

cmd_status() { pick_run; [ -f "$RUN" ] || return 0; sed -n '/^## Stages/,/^## In flight/p' "$RUN" | sed '$d'; }

# The network-loss list: in-flight rows nobody has heard from. This is the only
# signal there is - a dropped agent sends no error, it just stops reporting.
cmd_orphans() {
  limit="${1:-20}"; pick_run; [ -f "$RUN" ] || return 0; t=$(now)
  rows=$(awk 'BEGIN{FS="|"} /^\| *[0-9]+ *\|/{s=$4;gsub(/ /,"",s); if(s=="~"){num=$2;gsub(/ /,"",num); hb=$6;gsub(/ /,"",hb); name=$3;gsub(/^ +| +$/,"",name); print num "\t" hb "\t" name}}' "$RUN")
  [ -n "$rows" ] || { echo "no stages in flight"; return 0; }
  echo "$rows" | while IFS="$(printf '\t')" read -r num hb name; do
    [ "$hb" = "-" ] && { echo "stage $num ($name): in flight, never reported"; continue; }
    a=$(age_min "$hb" "$t")
    if [ "$a" -ge "$limit" ]; then
      echo "stage $num ($name): silent ${a}m (limit ${limit}m) - redispatch from its In-flight block"
    fi
  done
}

# ------------------------------------------------------------------ chain ----
# F31: a chain is a run whose stages are ticket workflows, each started by the
# last one's completion. Everything the loop needs lives in a `## Chain`
# section of the run file, so a compacted or fresh session loses nothing:
#
#   ## Chain
#   driver: @cc-680768 2026-10-09T19:02Z     hold: -     mode: workflow
#   ### AAQ7 - stage 66 - AAQ7 A110+A112 code-yoda absorb
#   tickets: A110 deep/build . A112 deep/build
#   files: skills/code-yoda/references/debt.md
#   prompt: |
#     <the exact prompt, verbatim>
#
# `hold:` is `-` or `<since> <pct>% <5h|7d> next=<stage>`. No command here
# judges the work; the one decision is chain_decide (hold or release on a
# `level` reading), and it is what the selftest mutation-checks.
HOLD_PCT="${RELAY_CHAIN_HOLD_PCT:-80}"
WEEKLY_PCT="${RELAY_CHAIN_WEEKLY_PCT:-90}"
DRIVER_STALE="${RELAY_CHAIN_DRIVER_STALE:-20}"
SEP='     '

refuse() { [ -z "${LOCK:-}" ] || unlock; echo "REFUSED: $*" >&2; exit 2; }
is_num() { case "$1" in ''|*[!0-9.]*|.*|*.*.*) return 1 ;; esac; }

# One `level` line from watch-cortana (RELAY_LEVEL_CMD overrides, for tests).
# Anything that is not a level line - an error, nothing, a missing script -
# reads as unobservable, never as 0%.
level_line() {
  out=
  if [ -n "${RELAY_LEVEL_CMD:-}" ]; then out=$(sh -c "$RELAY_LEVEL_CMD" 2>/dev/null) || out=
  else
    for c in "$HERE/../../watch-cortana/hooks/usage-watch.sh" "$HERE/../../../skills/watch-cortana/hooks/usage-watch.sh"; do
      if [ -f "$c" ]; then out=$(sh "$c" level 2>/dev/null) || out=; break; fi
    done
  fi
  out=$(printf '%s\n' "$out" | grep '^src=' | head -1)
  [ -n "$out" ] || out="src=none 5h=- 7d=- ctx=- max=-"
  echo "$out"
}

# The hold/release decision. In: a level line. Out: RELEASE <pct>,
# HOLD <pct> [7d], or UNOBSERVABLE. The 7-day hard stop comes first (it holds
# whatever the 5-hour window says); then the 5-hour reading. With no 5-hour
# reading the 7-day one stands in, at the 5-hour threshold - and a hold on it
# is a 7-day hold (`HOLD <pct> 7d`): the window it measures does not refill in
# hours, so a 5-hour wait on it only ends STUCK. Never `max` and never ctx: a
# full context is a compaction, not a quota, and a hold on it waits for a
# window that is not filling. Neither window -> UNOBSERVABLE.
# A token that is not a number (`n/a`, empty) is that window unobservable; a
# trailing % is dropped.
chain_decide() {
  printf '%s\n' "$1" | awk -v hp="$HOLD_PCT" -v wp="$WEEKLY_PCT" '
    function pct(x) { sub(/%$/, "", x); return (x ~ /^[0-9]+(\.[0-9]+)?$/) ? x : "-" }
    { for (i=1; i<=NF; i++) { split($i, kv, "="); v[kv[1]] = kv[2] } }
    END {
      if (v["src"] == "" || v["src"] == "none") { print "UNOBSERVABLE"; exit }
      w = pct(v["7d"]); h = pct(v["5h"])
      if (w != "-" && w+0 >= wp+0) { print "HOLD " w " 7d"; exit }
      if (h == "-") {
        if (w == "-") { print "UNOBSERVABLE"; exit }
        if (w+0 >= hp+0) print "HOLD " w " 7d"; else print "RELEASE " w
        exit
      }
      if (h+0 >= hp+0) print "HOLD " h; else print "RELEASE " h
    }'
}

chain_hdr() { sed -n '/^## Chain$/,$p' "$RUN" | grep '^driver: ' | head -1; }
hdr_driver() { l=$(chain_hdr); l=${l#driver: }; echo "${l%%"$SEP"hold: *}"; }
hdr_hold()   { l=$(chain_hdr); l=${l#*"$SEP"hold: }; echo "${l%%"$SEP"mode: *}"; }
hdr_mode()   { l=$(chain_hdr); echo "${l##*"$SEP"mode: }"; }
# The header must split into driver, hold and mode on $SEP before anything is
# read out of it for a rewrite - the hdr_* splitters above return the whole
# line on a hand-mangled one, and set_hdr would nest it into the new header.
# The driver cell is `-` or `<tag> <YYYY-MM-DDTHH:MMZ>`: a tag with no stamp
# has no age, and reading one out of it made a live driver look years stale -
# taken over with no --take and no ruling.
hdr_ok() {
  case "$1" in "driver: "*"${SEP}hold: "*"${SEP}mode: "*) ;; *) return 1 ;; esac
  _dc=${1#driver: }; _dc=${_dc%%"$SEP"hold: *}
  [ "$_dc" = - ] || printf '%s\n' "$_dc" | grep -Eqx '[^ ]+ [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}Z'
}
# Dies as the ps1 twin's HdrParts does: exit 1, same message. No chain: fine.
hdr_check() {
  _hl=$(chain_hdr); [ -n "$_hl" ] || return 0
  hdr_ok "$_hl" && return 0
  die "unreadable Chain header in $RUN: $_hl"
}

# The caller's tag is ME: --driver on heartbeat, hold, release and wait, else
# RELAY_CHAIN_DRIVER. Only the driver's own call refreshes its stamp, so a live
# driver in a long stage or a long hold never reads as stale at 20 minutes,
# while a dead driver's stamp still ages when another session resumes the run.
# A header that is not readable (hdr_ok) is never "me": left alone.
ME="${RELAY_CHAIN_DRIVER:-}"
is_me() {
  hdr_ok "$(chain_hdr)" || return 1
  _fd=$(hdr_driver); [ -n "$ME" ] && [ "$_fd" != - ] && [ "${_fd%% *}" = "$ME" ]
}
# The driver cell to write back: refreshed for the driver, unchanged otherwise.
own_driver() { if is_me; then echo "$ME $(now)"; else hdr_driver; fi; }
# The caller holds the lock.
touch_driver() { if is_me; then set_hdr "$ME $(now)" "$(hdr_hold)" "$(hdr_mode)"; fi; }

# Rewrite the header line in place. The caller holds the lock, and has run
# hdr_check before reading the parts it passes; checked again here so no
# caller can rewrite an unreadable header.
set_hdr() {
  hdr_check
  awk -v nl="driver: $1${SEP}hold: $2${SEP}mode: $3" '
    /^## Chain$/ { on=1 } on && !done && /^driver: / { print nl; done=1; next } { print }' "$RUN" > "$RUN.tmp.$$"
  mv "$RUN.tmp.$$" "$RUN"
}

row_cell() { awk -v n="$1" -v i="$2" 'BEGIN{FS="|"} /^\| *[0-9]+ *\|/{num=$2;gsub(/ /,"",num); if(num==n){c=$i; gsub(/^ +| +$/,"",c); print c; exit}}' "$RUN"; }
code_of() { sed -n "s/^### \([A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9]\) - stage $1 - .*/\1/p" "$RUN" | head -1; }
# The prompt of stage <n>'s chain block, verbatim: the lines under `prompt: |`
# up to the next heading, two-space indent removed, trailing blanks dropped.
block_prompt() {
  awk -v n="$1" '
    !inb && index($0, "### ") == 1 && $0 ~ ("^### [A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9] - stage " n " - ") { inb=1; next }
    inb && /^#/ { exit }
    inb && !inp && /^prompt: \|$/ { inp=1; next }
    inp { sub(/^  /, ""); buf[++k]=$0 }
    END { while (k > 0 && buf[k] == "") k--; for (i=1; i<=k; i++) print buf[i] }' "$RUN"
}
first_open_row() { awk 'BEGIN{FS="|"} /^\| *[0-9]+ *\|/{s=$4;gsub(/ /,"",s); if(s==""||s=="!"){n=$2;gsub(/ /,"",n); print n; exit}}' "$RUN"; }

# Remove stage <n>'s block from `## In flight`: its `### stage <n> - ` line up
# to the next heading. A redispatch of a failed stage replaces its block - a
# second block beside the first left two prompts and a dead `run:` id, and a
# resume read the first one.
drop_inflight() {
  awk -v n="$1" '
    /^## / { sec = ($0 == "## In flight") }
    skip && /^#/ { skip=0 }
    sec && index($0, "### stage " n " - ") == 1 { skip=1; next }
    !skip { print }' "$RUN" > "$RUN.tmp.$$"
  mv "$RUN.tmp.$$" "$RUN"
}

# Append a line at the end of `## Rulings` (made at the end if missing).
add_ruling() {
  awk -v r="- $(date -u +%Y-%m-%d) - $1" '
    { line[NR]=$0 }
    /^## Rulings/ { on=1; last=NR; next }
    on && /^## / { on=0 }
    on && $0 != "" { last=NR }
    END { for (i=1; i<=NR; i++) { print line[i]; if (i==last) print r }
          if (!last) { print ""; print "## Rulings"; print r } }' "$RUN" > "$RUN.tmp.$$"
  mv "$RUN.tmp.$$" "$RUN"
}

# Put the lines of file $2 at the end of section `## $1` (before its trailing
# blank lines). A missing section is made before `## Rulings`, or at the end,
# starting with line $3.
put_in_section() {
  awk -v sec="## $1" -v blk="$2" -v first="${3:-}" '
    function dump() { if (first != "" && !had) print first; while ((getline l < blk) > 0) print l; close(blk) }
    { line[NR]=$0 }
    END {
      for (i=1; i<=NR; i++) if (line[i] == sec) { s=i; break }
      if (s) { had=1; e=NR+1; for (i=s+1; i<=NR; i++) if (line[i] ~ /^## /) { e=i; break }
               k=e-1; while (k > s && line[k] == "") k--
               for (i=1; i<=k; i++) print line[i]; dump(); if (e <= NR) print ""
               for (i=e; i<=NR; i++) print line[i]; exit }
      for (i=1; i<=NR; i++) if (line[i] ~ /^## Rulings/) { r=i; break }
      if (r) { for (i=1; i<r; i++) print line[i]; print sec; dump(); print ""; for (i=r; i<=NR; i++) print line[i]; exit }
      for (i=1; i<=NR; i++) print line[i]; print ""; print sec; dump()
    }' "$RUN" > "$RUN.tmp.$$"
  mv "$RUN.tmp.$$" "$RUN"
}

# W codes come from the F21 allocator, like RUN and S. Without it: the highest
# header in this directory + 1, said on stderr - another worktree can repeat it.
# Called in $(...) under the plan's lock, so it returns instead of dying: 1 on
# an allocator failure, 2 (a refusal) when W is exhausted - on both paths.
# next-id.sh says "exhausted" with exit 1, the code it gives any failure, so
# its stderr is what tells the refusal apart.
alloc_code() {
  nid=$(find_next_id)
  if [ -n "$nid" ]; then
    _ae=$(mktemp)
    out=$(sh "$nid" --runs "$1" W 2>"$_ae") || {
      cat "$_ae" >&2
      if grep -q 'kind W exhausted' "$_ae"; then rm -f "$_ae"; echo "REFUSED: kind W exhausted (next-id.sh) - no workflow code is left to issue" >&2; return 2; fi
      rm -f "$_ae"; echo "FAIL: next-id.sh could not allocate a W code (see above)" >&2; return 1; }
    cat "$_ae" >&2; rm -f "$_ae"
    printf '%s\n' "$out" | grep -qx '[A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9]' || { echo "FAIL: next-id.sh returned unexpected output for W: $out" >&2; return 1; }
    echo "$out"; return 0
  fi
  echo "relay-morpheus.sh: next-id.sh not found - coding from this directory only, which another worktree can repeat" >&2
  # Past 9999 is refused, as next-id refuses it - wrapping to AAAA would
  # reissue the oldest code in the tree.
  cat "$1"/run-*.md "$1"/run.md 2>/dev/null | grep -E '^### [A-Z0-9]{4} [^ ]+ stage [0-9]' | cut -c5-8 |
    awk -v abc=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '
      { n=0; for (i=1; i<=4; i++) n = n*36 + index(abc, substr($0,i,1)) - 1; if (n > m) m = n }
      END { n=m+1; if (n > 1679615) { print "REFUSED: kind W exhausted: " n " > 1679615 (9999)" > "/dev/stderr"; exit 2 }
            c=""; for (i=0; i<4; i++) { c = substr(abc, n%36+1, 1) c; n = int(n/36) } print c }'
}

# chain plan <n> --prompt-file F [--tickets T] [--fix tier [--verify tier]]
#            [--files F] [--mode workflow|agents]
chain_plan() {
  n=${1:-}; [ -n "$n" ] && shift || die "usage: chain plan <n> --prompt-file F [--tickets T] [--fix t --verify t] [--files F] [--mode m]"
  pf= tk= fx= vf= fl= md=workflow
  while [ "$#" -gt 0 ]; do
    [ "$#" -ge 2 ] || die "chain plan: $1 needs a value"
    case $1 in
      --prompt-file) pf=$2 ;; --tickets) tk=$2 ;; --fix) fx=$2 ;; --verify) vf=$2 ;;
      --files) fl=$2 ;; --mode) md=$2 ;; *) die "chain plan: unknown flag $1" ;;
    esac
    shift 2
  done
  [ -n "$pf" ] && [ -s "$pf" ] || die "chain plan: --prompt-file with the stage's exact prompt is required - the prompt is on disk before the agent exists"
  case $md in workflow|agents) ;; *) die "chain plan: --mode is workflow or agents, not $md" ;; esac
  need_run
  if [ -n "$fx" ]; then
    tk=$(printf '%s\n' "$tk" | tr ',' '\n' | sed 's/^ *//; s/ *$//' | grep . |
         awk -v t="$fx/${vf:-build}" '{ printf "%s%s %s", (NR > 1 ? " . " : ""), $0, t }')
  fi
  # The already-planned check, the allocation and the write are one lock hold:
  # two sessions planning one stage at once get one code, not two in a cell.
  lock
  name=$(row_cell "$n" 3); [ -n "$name" ] || die "no stage $n in $RUN"
  c=$(code_of "$n"); [ -z "$c" ] || die "stage $n is already planned as $c - a code is never reissued"
  if [ "$(row_cell "$n" 4)" = x ]; then die "stage $n already landed"; fi
  code=$(alloc_code "$(dirname "$RUN")") || { rc=$?; unlock; exit "$rc"; }
  blk="$RUN.blk.$$"
  { echo "### $code - stage $n - $name"
    [ -n "$tk" ] && echo "tickets: $tk"
    [ -n "$fl" ] && echo "files: $fl"
    echo "prompt: |"
    tr -d '\r' < "$pf" | awk '{ print ($0 == "" ? "" : "  " $0) }'
  } > "$blk"
  # The code goes in front of the stage cell: the column count does not
  # change, so every positional reader (stage, heartbeat, orphans) still works.
  awk -v n="$n" -v c="$code" 'BEGIN{FS="|"; OFS="|"}
    /^\| *[0-9]+ *\|/ { num=$2; gsub(/ /,"",num); if (num==n) { nm=$3; sub(/^ +/,"",nm); $3=" " c " " nm } } {print}' "$RUN" > "$RUN.tmp.$$"
  mv "$RUN.tmp.$$" "$RUN"
  put_in_section Chain "$blk" "driver: -${SEP}hold: -${SEP}mode: $md"
  rm -f "$blk"
  stamp_updated
  unlock
  echo "$code"
}

# chain dispatch <n> --driver TAG [--owner O] [--take] [--override] [--confirmed]
# The usage reading is taken first (it runs another script); then every check
# on the file AND the claim - row `~`, In-flight block, driver stamp - happen
# in one lock hold, so two sessions dispatching one stage at once get exactly
# one winner and one exit 2.
chain_dispatch() {
  n=${1:-}; [ -n "$n" ] && shift || die "usage: chain dispatch <n> --driver TAG [--owner O] [--take] [--override] [--confirmed]"
  drv="${RELAY_CHAIN_DRIVER:-}" ow= take=0 conf=0 ov=0
  while [ "$#" -gt 0 ]; do
    case $1 in
      --driver) [ "$#" -ge 2 ] || die "chain dispatch: --driver needs a value"; drv=$2; shift ;;
      --owner)  [ "$#" -ge 2 ] || die "chain dispatch: --owner needs a value"; ow=$2; shift ;;
      --take) take=1 ;; --override) ov=1 ;; --confirmed) conf=1 ;; *) die "chain dispatch: unknown flag $1" ;;
    esac
    shift
  done
  [ -n "$drv" ] || die "chain dispatch: name this session (--driver @cc-xxxx or RELAY_CHAIN_DRIVER) - two sessions must not drive one chain"
  case "$drv" in *' '*|*'|'*) die "chain dispatch: driver tag has a space or a pipe: $drv" ;; esac
  need_run
  d=$(chain_decide "$(level_line)"); pct=$(echo "$d" | cut -d' ' -f2)
  lock
  hdr_check
  c=$(code_of "$n")
  [ -n "$(chain_hdr)" ] && [ -n "$c" ] || die "stage $n has no chain block - chain plan $n first"
  h=$(hdr_hold); [ "$h" = - ] || refuse "chain is held ($h) - chain release first, or chain wait"
  st=$(row_cell "$n" 4)
  case "$st" in ''|'!') ;; *) refuse "stage $n is '$st', not pending or failed - a stage is never dispatched twice" ;; esac
  od=$(hdr_driver); otag=${od%% *}; note=
  if [ "$od" != - ] && [ "$otag" != "$drv" ]; then
    a=$(age_min "${od#* }" "$(now)")
    if [ "$a" -lt "$DRIVER_STALE" ]; then
      [ "$take" = 1 ] || refuse "chain is driven by $otag (heartbeat ${a}m ago, stale at ${DRIVER_STALE}m) - --take overrides, with a ruling"
      note="$c: driver taken over from $otag (heartbeat ${a}m ago) by $drv"
    fi
  fi
  # The reading gates the dispatch itself, not only the caller's discipline:
  # never past the 7-day hard stop without the user's explicit yes, never at
  # or over the 5-hour hold without the user's override.
  case "$d" in
    *' 7d') [ "$conf" = 1 ] || refuse "7-day window at $pct% - the hard stop; dispatch only on the user's explicit yes (--confirmed)"
            note="${note:+$note; }$c: override: user confirmed past 7d ${WEEKLY_PCT}% ($pct%)" ;;
    HOLD*)  [ "$ov" = 1 ] || refuse "5-hour reading $pct% is at or over the ${HOLD_PCT}% hold - chain hold and chain wait, or --override if the user asked"
            note="${note:+$note; }$c: override: user asked at $pct%" ;;
    UNOBSERVABLE) echo "note: usage unobservable on this host - dispatched with no usage check" >&2 ;;
  esac
  name=$(row_cell "$n" 3)
  blk="$RUN.blk.$$"; t=$(now)
  { echo "### stage $n - $name  (dispatched $t, $drv)"
    echo "run: -"
    echo "prompt: |"
    block_prompt "$n" | awk '{ print ($0 == "" ? "" : "  " $0) }'
  } > "$blk"
  drop_inflight "$n"
  put_in_section "In flight" "$blk"
  rm -f "$blk"
  set_hdr "$drv $t" - "$(hdr_mode)"
  if [ -n "$note" ]; then add_ruling "$note"; fi
  set_row "$n" '~' "$ow" "" || die "no stage $n in $RUN"
  stamp_updated
  unlock
  echo "$c"
  block_prompt "$n"
}

# chain hold <pct> [--window 5h|7d] [--next n] [--driver TAG]. Idempotent: a second hold
# keeps the first one's `since`, so a resumed wait never restarts the clock.
chain_hold() {
  p=${1:-}; [ -n "$p" ] && shift || die "usage: chain hold <pct> [--window 5h|7d] [--next n] [--driver TAG]"
  p=${p%\%}; is_num "$p" || die "chain hold: '$p' is not a percentage"
  w=5h nx= ME="${RELAY_CHAIN_DRIVER:-}"
  while [ "$#" -gt 0 ]; do
    [ "$#" -ge 2 ] || die "chain hold: $1 needs a value"
    case $1 in --window) w=$2 ;; --next) nx=$2 ;; --driver) ME=$2 ;; *) die "chain hold: unknown flag $1" ;; esac
    shift 2
  done
  case $w in 5h|7d) ;; *) die "chain hold: --window is 5h or 7d, not $w" ;; esac
  need_run
  [ -n "$(chain_hdr)" ] || die "no ## Chain section in $RUN - chain plan a stage first"
  hdr_check
  [ -n "$nx" ] || nx=$(first_open_row); [ -n "$nx" ] || nx=-
  lock
  hdr_check
  old=$(hdr_hold); since=$(now)
  [ "$old" != - ] && since=${old%% *}
  set_hdr "$(own_driver)" "$since $p% $w next=$nx" "$(hdr_mode)"
  stamp_updated
  unlock
  echo "hold: $since $p% $w next=$nx"
}

# chain release [--override [--confirmed]] [--driver TAG]
chain_release() {
  ov=0 conf=0 ME="${RELAY_CHAIN_DRIVER:-}"
  while [ "$#" -gt 0 ]; do
    case $1 in
      --override) ov=1 ;; --confirmed) conf=1 ;;
      --driver) [ "$#" -ge 2 ] || die "chain release: --driver needs a value"; ME=$2; shift ;;
      *) die "chain release: unknown flag $1" ;;
    esac
    shift
  done
  [ "$conf" = 1 ] && [ "$ov" = 0 ] && die "chain release: --confirmed only goes with --override"
  need_run
  [ -n "$(chain_hdr)" ] || die "no ## Chain section in $RUN"
  hdr_check
  h=$(hdr_hold)
  [ "$h" = - ] && { echo "not held"; return 0; }
  nx=${h##*next=}; c=$(code_of "$nx"); note=
  d=$(chain_decide "$(level_line)"); pct=$(echo "$d" | cut -d' ' -f2)
  case "$d" in
    *' 7d') [ "$ov" = 1 ] && [ "$conf" = 1 ] || refuse "7-day window at $pct% - the hard stop. Ask the user (AskUserQuestion); only their explicit yes releases: --override --confirmed"
            note="override: user confirmed past 7d ${WEEKLY_PCT}% ($pct%)" ;;
    HOLD*)  [ "$ov" = 1 ] || refuse "5-hour reading $pct% is at or over the ${HOLD_PCT}% hold - keep waiting (chain wait), or --override if the user asked"
            note="override: user asked at $pct%" ;;
    UNOBSERVABLE) [ "$ov" = 1 ] && note="override: user asked, usage unobservable" ;;
    *) [ "$ov" = 1 ] && note="override: user asked at $pct% (already under ${HOLD_PCT}%)" ;;
  esac
  lock
  hdr_check
  set_hdr "$(own_driver)" - "$(hdr_mode)"
  [ -n "$note" ] && add_ruling "${c:-stage $nx}: $note"
  stamp_updated
  unlock
  echo "released - next=$nx${c:+ ($c)}${note:+ - $note}"
}

# chain wait [--interval 600] [--max 19800] [--for 1500] [--driver TAG]
# The listener. It polls `level` on the WALL CLOCK, so after a laptop sleeps
# the next poll reads the real number, and --max is measured from the hold's
# own `since` in the run file, so a resumed wait does not restart the clock.
#   exit 0  RELEASE <pct>       under the hold (and the 7-day stop): go
#   exit 2  STOP <pct> 7d       the 7-day stop: that window refills in days,
#                               so there is nothing to wait for - ask the user
#   exit 3  STUCK <pct>         held longer than --max: the window should have
#                               refilled, so the reading is the problem
#   exit 4  UNOBSERVABLE        nothing to wait on: the caller should not hold
#   exit 5  WAITING <pct>       this arm's --for is spent; re-arm, nothing lost
# --for exists because a Monitor watch is capped at 30 minutes (10 under -p,
# Claude Code 2.1.295): each arm ends inside the cap and says so.
chain_wait() {
  iv=600 mx=19800 fr=1500 ME="${RELAY_CHAIN_DRIVER:-}"
  while [ "$#" -gt 0 ]; do
    [ "$#" -ge 2 ] || die "chain wait: $1 needs a value"
    case $1 in --interval) iv=$2 ;; --max) mx=$2 ;; --for) fr=$2 ;; --driver) ME=$2 ;; *) die "chain wait: unknown flag $1" ;; esac
    shift 2
  done
  for v in "$iv" "$mx" "$fr"; do case $v in ''|*[!0-9]*) die "chain wait: '$v' is not a number of seconds" ;; esac; done
  [ "$iv" -ge 1 ] || iv=1
  need_run
  hdr_check
  h=$(hdr_hold); since=$(now); [ -n "$h" ] && [ "$h" != - ] && since=${h%% *}
  start=$(date +%s)
  while :; do
    # Every poll by the driver is its activity: the stamp stays fresh through
    # a long hold, so no second session reads the waiting driver as dead.
    if is_me; then lock; touch_driver; stamp_updated; unlock; fi
    d=$(chain_decide "$(level_line)"); pct=$(echo "$d" | cut -d' ' -f2)
    case "$d" in
      RELEASE*) echo "RELEASE $pct"; return 0 ;;
      *' 7d') echo "STOP $pct 7d"; exit 2 ;;
      UNOBSERVABLE) echo "UNOBSERVABLE"; exit 4 ;;
    esac
    held=$(( $(age_min "$since" "$(now)") * 60 ))
    [ "$held" -ge "$mx" ] && { echo "STUCK $pct (held since $since)"; exit 3; }
    armed=$(( $(date +%s) - start ))
    [ "$armed" -ge "$fr" ] && { echo "WAITING $pct ($(( (mx - held) / 60 ))m left of --max)"; exit 5; }
    s=$iv; [ $((fr - armed)) -lt "$s" ] && s=$((fr - armed)); [ "$s" -ge 1 ] || s=1
    sleep "$s"
  done
}

chain_status() {
  pick_run; [ -f "$RUN" ] || return 0
  awk '/^## Chain$/ { on=1; print; next } on && /^## / { exit } on { print }' "$RUN"
}

cmd_chain() {
  sub="${1:-}"; [ "$#" -gt 0 ] && shift || true
  case "$sub" in
    plan)     chain_plan "$@" ;;
    dispatch) chain_dispatch "$@" ;;
    hold)     chain_hold "$@" ;;
    release)  chain_release "$@" ;;
    wait)     chain_wait "$@" ;;
    status)   chain_status ;;
    decide)   chain_decide "$(level_line)" ;;
    *) die "usage: relay-morpheus.sh chain plan|dispatch|hold|release|wait|status|decide ..." ;;
  esac
}

cmd_selftest() {
  d=$(mktemp -d); trap 'rm -rf "$d"' EXIT
  # Each scratch dir is its own git repo, so the allocator keeps its counter
  # there and not in whatever repo the selftest was started from.
  git init -q "$d"
  RUN="$d/run.md"
  DIR="$d"

  # age_min is the only arithmetic in the script, so it is the only thing that
  # can be silently wrong. Month and year rollover are where a naive
  # day-of-month subtraction breaks.
  [ "$(age_min 2026-09-22T09:00Z 2026-09-22T09:25Z)" = 25 ] || die "age_min: same day"
  [ "$(age_min 2026-09-22T23:50Z 2026-09-23T00:10Z)" = 20 ] || die "age_min: midnight"
  [ "$(age_min 2026-02-28T23:50Z 2026-03-01T00:10Z)" = 20 ] || die "age_min: month rollover"
  [ "$(age_min 2024-02-28T23:50Z 2024-02-29T00:10Z)" = 20 ] || die "age_min: leap day"
  [ "$(age_min 2025-12-31T23:50Z 2026-01-01T00:10Z)" = 20 ] || die "age_min: year rollover"

  cmd_init plan.md "selftest" "alpha" "beta" >/dev/null
  grep -q '^| 2 | beta |' "$RUN" || die "init: no row for stage 2"

  # A second init must refuse: overwriting a run file destroys the only record
  # of what was in flight, which is the exact loss this skill exists to stop.
  if (cmd_init plan.md "again" "x" >/dev/null 2>&1); then die "init: overwrote an existing run file"; fi

  cmd_stage 1 '~' build:sonnet
  grep -qE '^\| 1 \| alpha \| ~ \| build:sonnet \|' "$RUN" || die "stage: row 1 not in flight"

  # Landed without a sha must be refused, not written.
  if (cmd_stage 1 x 2>/dev/null); then die "stage: accepted x with no landed"; fi
  cmd_stage 1 x build:sonnet 3f1a2c9
  grep -q '3f1a2c9' "$RUN" || die "stage: sha not recorded"

  # Idempotence: re-running a stage rewrites its row, never adds a second.
  cmd_stage 1 x build:sonnet 3f1a2c9
  [ "$(grep -c '^| 1 |' "$RUN")" = 1 ] || die "stage: duplicated row 1"

  if (cmd_stage 9 '~' 2>/dev/null); then die "stage: accepted a stage that does not exist"; fi

  # A pipe in a stage name must be refused at init, not corrupt the ledger.
  RUN_SAVE="$RUN"; RUN="$d/piped.md"
  if (cmd_init plan.md "piped" 'list | pretty' >/dev/null 2>&1); then
    die "init: accepted a stage name containing a pipe"
  fi
  RUN="$RUN_SAVE"

  # The lock must be released on the way out, or the next call spins for 30s.
  if [ -e "$RUN.lock" ]; then die "stage: left the lock behind"; fi

  # A `|` in owner or landed shifts every column, exactly as one in a stage
  # name does - and `landed` takes a path, so it is reachable by accident.
  if (cmd_stage 2 '~' 'model:opus|5' 2>/dev/null); then die "stage: accepted a pipe in owner"; fi
  if (cmd_stage 2 x build:sonnet 'a|b' 2>/dev/null); then die "stage: accepted a pipe in landed"; fi

  # A heartbeat on a stage that already landed must not trip the sha guard.
  cmd_heartbeat 1
  grep -q '3f1a2c9' "$RUN" || die "heartbeat: dropped the landed sha"

  cmd_stage 2 '~' build:sonnet
  # Exit status, not just output. `orphans` is documented as safe in a
  # SessionStart hook, and a healthy run with nothing silent is its normal
  # case; piping it into grep discards the status, which is how that escaped.
  cmd_orphans 9999 >/dev/null || die "orphans: non-zero exit with nothing silent"
  cmd_orphans 20 >/dev/null   || die "orphans: non-zero exit on the healthy path"
  cmd_status >/dev/null       || die "status: non-zero exit"
  cmd_orphans 20 | grep -q 'no stages in flight' && die "orphans: missed an in-flight row"
  cmd_orphans 0 | grep -q 'stage 2' || die "orphans: did not flag a silent stage at limit 0"
  cmd_orphans 9999 | grep -q 'stage 2' && die "orphans: flagged a fresh heartbeat"

  # --- run ids: the whole point is a sentence a human can say to another
  # session. These pin the three ways it breaks silently.
  d2=$(mktemp -d); git init -q "$d2"; DIR="$d2"; RUN=""
  cmd_init plan-a.md "first thing" alpha beta >/dev/null
  RUN=""
  cmd_init plan-b.md "second thing" one two three >/dev/null
  RUN=""

  [ "$(id_of "$d2/run-2-second-thing.md")" = 2 ] || die "id_of: wrong id"
  [ "$(id_of "$d2/run.md")" = "" ]               || die "id_of: invented an id for a bare run.md"
  [ "$(next_id)" = 3 ]                           || die "next_id: did not follow the highest existing id"

  # RUN-2, run-2 and 2 must all land on the same file - whoever types it next
  # is working from memory of a conversation, not from a path.
  for spell in RUN-2 run-2 2; do
    [ "$(resolve "$spell")" = "$d2/run-2-second-thing.md" ] || die "resolve: '$spell' did not resolve"
  done
  resolve nope-9 >/dev/null 2>&1 && die "resolve: matched a run that does not exist"

  # The counts come from one awk pass because `grep -c` prints 0 AND exits 1,
  # which silently produced "0" twice in the same field.
  RUN="$d2/run-1-first-thing.md"; cmd_stage 1 x owner sha111
  RUN=""
  cmd_list | grep -q 'RUN-1  first thing *1/2 done' || die "list: wrong counts for run 1"
  # The ZERO case is the one that regresses: `grep -c` prints 0 and also exits
  # 1, so `$(grep -c ... || echo 0)` put two zeros in one field. A run with
  # something already done hides it, which is how the first version passed.
  cmd_list | grep -q 'RUN-2  second thing *0/3 done' || die "list: wrong counts for a run with nothing done"
  cmd_list | grep -q 'resume: continue RUN-2'       || die "list: no resume sentence"
  RUN="$d2/run-2-second-thing.md"; cmd_stage 3 '~' owner
  RUN=""
  cmd_list | grep -q '(stage 3 open)' || die "list: did not surface the open stage"

  # Two runs and no id named must refuse rather than guess which one.
  RUN=""
  if (pick_run 2>/dev/null); then die "pick_run: guessed between two runs"; fi

  cmd_resume 1 | grep -q '# RUN-1 - first thing' || die "resume: did not print the ledger"
  rm -rf "$d2"

  # --- F22: RUN ids and stage numbers are serial across the project. Before
  # the allocator, two worktrees both made RUN-4 and every run had a stage 1.
  if [ -n "$(find_next_id)" ]; then
    d3=$(mktemp -d); g() { git -c user.name=t -c user.email=t@example.invalid -c core.autocrlf=false -c core.hooksPath=/dev/null "$@"; }
    g init -q -b main "$d3/main"; mkdir "$d3/main/.skillator"
    old="$d3/main/.skillator/run-3-old.md"
    { echo "# RUN-3 - old"; echo "## Stages"; echo "| # | stage | state | owner | heartbeat | landed |"
      echo "|---|-------|-------|-------|-----------|--------|"
      i=1; while [ $i -le 23 ]; do echo "| $i | s$i |   | - | - | - |"; i=$((i+1)); done; } > "$old"
    g -C "$d3/main" add -A; g -C "$d3/main" commit -q -m old
    g -C "$d3/main" worktree add -q -b wt2 "$d3/wt2"
    before=$(cksum < "$old")
    DIR="$d3/main/.skillator"; RUN=""
    cmd_init p.md "four" a b >/dev/null 2>&1 || die "F22: init failed"
    f4=$(resolve 4) || die "F22: first new run is not RUN-4"
    grep -q '^| 24 | a |' "$f4" && grep -q '^| 25 | b |' "$f4" || die "F22: stages did not continue after 23"
    DIR="$d3/wt2/.skillator"; RUN=""
    cmd_init p.md "other tree" c >/dev/null 2>&1 || die "F22: second-worktree init failed"
    f5=$(resolve 5) || die "F22: second worktree repeated RUN-4"
    grep -q '^| 26 | c |' "$f5" || die "F22: second worktree reused a stage number"
    DIR="$d3/main/.skillator"; RUN="$f4"
    [ "$(cmd_add "late one" 2>/dev/null)" = 27 ] || die "add: did not take the next serial number"
    awk '/^\| 25 \|/{p=NR} /^\| 27 \| late one \|/{q=NR} END{exit !(p && q==p+1)}' "$f4" || die "add: row not after the last stage"
    if (cmd_add 'a | b' >/dev/null 2>&1); then die "add: accepted a pipe"; fi
    cmd_stage 27 '~' build:opus || die "stage: global number 27 not found"
    [ "$(cksum < "$old")" = "$before" ] || die "F22: an existing run file was renumbered"
    # No allocator: the old local rule, said on stderr, never silent.
    RELAY_NEXT_ID="$d3/nope.sh"; DIR="$d3/main/.skillator"; RUN=""
    cmd_init p.md "fallback" z >/dev/null 2>"$d3/err" || die "fallback: init failed"
    grep -q 'next-id.sh not found' "$d3/err" || die "fallback: no stderr warning"
    grep -q '^| 28 | z |' "$DIR"/run-*-fallback.md || die "fallback: stage not local max + 1"
    unset RELAY_NEXT_ID
    rm -rf "$d3"
  else
    echo "note: next-id.sh not found beside the skills - F22 allocator checks skipped" >&2
  fi

  chain_selftest
  echo ok
}

# F31. The chain's whole value is that its state survives on disk and that
# its one decision - hold or go - is right, so both are pinned here.
chain_selftest() {
  unset RELAY_CHAIN_DRIVER; ME=
  # --- the decision table. Each row is a reading the listener will see.
  for row in \
    'RELEASE 79|src=claude-code 5h=79 7d=10 ctx=95 max=95' \
    'HOLD 80|src=claude-code 5h=80 7d=10 ctx=5 max=80' \
    'RELEASE 10|src=claude-code 5h=- 7d=10 ctx=- max=85' \
    'HOLD 85 7d|src=claude-code 5h=- 7d=85 ctx=- max=85' \
    'UNOBSERVABLE|src=claude-code 5h=- 7d=- ctx=85 max=85' \
    'UNOBSERVABLE|src=codex 5h=- 7d=- ctx=90.0 max=90.0' \
    'HOLD 84|src=claude-code 5h=84% 7d=n/a ctx=- max=84' \
    'HOLD 91 7d|src=codex 5h=n/a 7d=91% ctx=- max=91' \
    'UNOBSERVABLE|src=claude-code 5h=n/a 7d= ctx=99 max=99' \
    'RELEASE 12.0|src=codex 5h=12.0 7d=45.0 ctx=90.0 max=90.0' \
    'HOLD 90 7d|src=codex 5h=10 7d=90 ctx=- max=90' \
    'RELEASE 10|src=codex 5h=10 7d=89.9 ctx=- max=89.9' \
    'UNOBSERVABLE|src=claude-code 5h=- 7d=- ctx=- max=-' \
    'UNOBSERVABLE|src=none 5h=- 7d=- ctx=- max=-' \
    'UNOBSERVABLE|'; do
    want=${row%%|*}; got=$(chain_decide "${row#*|}")
    [ "$got" = "$want" ] || die "chain_decide '${row#*|}': want '$want', got '$got'"
  done
  [ "$(HOLD_PCT=70 chain_decide 'src=codex 5h=75 7d=1 ctx=- max=75')" = "HOLD 75" ] || die "chain_decide: RELAY_CHAIN_HOLD_PCT ignored"
  # Garbage from the level command reads as unobservable, never as 0%.
  [ "$(RELAY_LEVEL_CMD='echo oops; exit 1' level_line)" = "src=none 5h=- 7d=- ctx=- max=-" ] || die "level_line: an error did not read as src=none"

  cd_save=$(pwd)
  d4="$d/chain"; mkdir -p "$d4"; git init -q "$d4"
  DIR="$d4/.skillator"; RUN=""
  cmd_init TICKETS.md "chain test" "B2+B3 books" "F2 report" "F3 cli" "verify review bump commit push" >/dev/null
  set -- "$DIR"/run-*.md; RUN=$1
  s1=$(sed -n 's/^| \([0-9]*\) | B2+B3 books |.*/\1/p' "$RUN"); s2=$((s1 + 1)); s3=$((s1 + 2))
  printf 'item B2+B3: fix both in shelf/books.py.\n\n  keep this indent | and this pipe\nlast line\n' > "$d4/p1"
  printf 'item F2: by_author\n' > "$d4/p2"; printf 'item F3: --version\n' > "$d4/p3"

  # plan: a code per stage, never twice, and the row keeps its six cells.
  c1=$(chain_plan "$s1" --prompt-file "$d4/p1" --tickets "B2, B3" --fix build --verify build --files shelf/books.py) || die "chain plan failed"
  c2=$(chain_plan "$s2" --prompt-file "$d4/p2") || die "chain plan 2 failed"
  c3=$(chain_plan "$s3" --prompt-file "$d4/p3") || die "chain plan 3 failed"
  printf '%s\n' "$c1" | grep -qx '[A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9]' || die "chain plan: '$c1' is not a 4-char code"
  [ "$c1" != "$c2" ] && [ "$c2" != "$c3" ] && [ "$c1" != "$c3" ] || die "chain plan: codes repeat: $c1 $c2 $c3"
  if (chain_plan "$s2" --prompt-file "$d4/p2" >/dev/null 2>&1); then die "chain plan: reissued a code for a planned stage"; fi
  grep -q "^| $s2 | $c2 F2 report |" "$RUN" || die "chain plan: a refused second plan touched the cell"
  if (chain_plan "$s1" >/dev/null 2>&1); then die "chain plan: accepted no prompt"; fi
  grep -q "^| $s1 | $c1 B2+B3 books |   | - | - | - |\$" "$RUN" || die "chain plan: cell not prefixed with the code"
  [ "$(awk -F'|' -v n="$s1" '$2+0==n && /^\|/{print NF}' "$RUN")" = 8 ] || die "chain plan: the row's column count changed"
  grep -q "^### $c1 - stage $s1 - B2+B3 books\$" "$RUN" || die "chain plan: no block header"
  grep -q '^tickets: B2 build/build . B3 build/build$' "$RUN" || die "chain plan: tickets line wrong"
  grep -q '^driver: -     hold: -     mode: workflow$' "$RUN" || die "chain plan: no Chain header"
  [ "$(grep -c '^## Chain$' "$RUN")" = 1 ] || die "chain plan: more than one ## Chain section"
  awk '/^## Chain$/{c=NR} /^## Rulings/{r=NR} END{exit !(c && r && c < r)}' "$RUN" || die "chain plan: ## Chain not before ## Rulings"
  [ "$(block_prompt "$s1")" = "$(cat "$d4/p1")" ] || die "chain plan: the stored prompt is not verbatim"
  [ ! -e "$RUN.lock" ] || die "chain plan: left the lock behind"

  # dispatch: never without a driver, a block, or past a hold; prompt copied verbatim.
  export RELAY_LEVEL_CMD='echo src=claude-code 5h=40 7d=10 ctx=5 max=40'
  if (chain_dispatch "$s1" >/dev/null 2>&1); then die "chain dispatch: ran with no driver named"; fi
  out=$(chain_dispatch "$s1" --driver @cc-a --owner build:opus) || die "chain dispatch failed"
  [ "$(printf '%s\n' "$out" | head -1)" = "$c1" ] || die "chain dispatch: did not print the code first"
  [ "$(printf '%s\n' "$out" | sed 1d)" = "$(cat "$d4/p1")" ] || die "chain dispatch: printed prompt not verbatim"
  inflight=$(awk -v n="$s1" 'index($0, "### stage " n " - ") == 1 { on=1; next } on && /^## / { exit } on && /^prompt: \|$/ { p=1; next } on && p { sub(/^  /, ""); b[++k]=$0 } END { while (k && b[k]=="") k--; for (i=1;i<=k;i++) print b[i] }' "$RUN")
  [ "$inflight" = "$(cat "$d4/p1")" ] || die "chain dispatch: In-flight prompt is not the planned prompt verbatim"
  grep -q "^| $s1 | $c1 B2+B3 books | ~ | build:opus |" "$RUN" || die "chain dispatch: row not in flight"
  grep -q '^driver: @cc-a 20[0-9-]*T[0-9:]*Z     hold: -     mode: workflow$' "$RUN" || die "chain dispatch: driver not stamped"
  cmd_heartbeat "$s1"; cmd_orphans 0 | grep -q "stage $s1 ($c1 B2+B3 books)" || die "orphans: lost the coded row"
  set +e
  (chain_dispatch "$s1" --driver @cc-a >/dev/null 2>&1); [ $? = 2 ] || die "chain dispatch: redispatched a stage in flight"
  (chain_dispatch "$s2" --driver @cc-b >/dev/null 2>&1); [ $? = 2 ] || die "chain dispatch: a second fresh driver was let in"
  set -e
  cmd_stage "$s1" x build:opus abc1234
  out=$(chain_dispatch "$s2" --driver @cc-b --take) || die "chain dispatch --take failed"
  grep -q "$c2: driver taken over from @cc-a" "$RUN" || die "chain dispatch --take: no ruling"
  cmd_stage "$s2" '!' build:opus
  set +e
  (chain_dispatch "$s1" --driver @cc-b >/dev/null 2>&1); [ $? = 2 ] || die "chain dispatch: redispatched a landed stage"
  set -e

  # F31 review: the driver's own activity keeps its stamp fresh. Age it past
  # stale; a heartbeat brings it back, and a second driver is refused again.
  age_drv() { sed 's/^driver: \(@[^ ]*\) [^ ]* /driver: \1 2026-01-01T00:00Z /' "$RUN" > "$RUN.x" && mv "$RUN.x" "$RUN"; }
  drv_fresh() { ! grep -q '^driver: @[^ ]* 2026-01-01T00:00Z ' "$RUN" && grep -q '^driver: @' "$RUN"; }
  age_drv; drv_fresh && die "selftest: age_drv did not age the stamp"
  cmd_heartbeat "$s1"; drv_fresh && die "chain: a heartbeat with no driver tag refreshed the driver stamp"
  cmd_heartbeat "$s1" --driver @cc-b; drv_fresh || die "chain: a heartbeat did not refresh the driver stamp"
  set +e
  (chain_dispatch "$s2" --driver @cc-z >/dev/null 2>&1); [ $? = 2 ] || die "chain dispatch: a second driver got in past a heartbeat-fresh driver"
  set -e
  age_drv

  # hold: idempotent, keeps its since, names the next open stage; locked.
  h1=$(chain_hold 84 --driver @cc-b) || die "chain hold failed"
  drv_fresh || die "chain hold: did not refresh the driver stamp"
  [ "$h1" = "hold: ${h1#hold: }" ] && case "$h1" in *" 84% 5h next=$s2") ;; *) die "chain hold: next is not the first open stage ($s2): $h1" ;; esac
  sed "s/hold: [^ ]* /hold: 2026-01-01T00:00Z /" "$RUN" > "$RUN.x" && mv "$RUN.x" "$RUN"
  h2=$(chain_hold 86) || die "chain hold (again) failed"
  [ "$h2" = "hold: 2026-01-01T00:00Z 86% 5h next=$s2" ] || die "chain hold: a second hold restarted the clock: $h2"
  [ ! -e "$RUN.lock" ] || die "chain hold: left the lock behind"
  set +e
  (chain_dispatch "$s2" --driver @cc-b >/dev/null 2>&1); [ $? = 2 ] || die "chain dispatch: started a stage while held"

  # wait: wall-clock, measured from the hold's own since.
  out=$(chain_wait --interval 1 --for 5); rc=$?
  [ "$rc" = 0 ] && [ "$out" = "RELEASE 40" ] || die "chain wait: want RELEASE 40 / 0, got '$out' / $rc"
  out=$(RELAY_LEVEL_CMD='echo src=claude-code 5h=84 7d=10 ctx=5 max=84' chain_wait --interval 1 --max 19800); rc=$?
  [ "$rc" = 3 ] || die "chain wait: a hold since 2026-01-01 is past --max, want STUCK/3, got '$out' / $rc"
  case "$out" in "STUCK 84 "*) ;; *) die "chain wait: STUCK line wrong: $out" ;; esac
  out=$(RELAY_LEVEL_CMD='echo src=none 5h=- 7d=- ctx=- max=-' chain_wait --interval 1); rc=$?
  [ "$rc" = 4 ] && [ "$out" = UNOBSERVABLE ] || die "chain wait: want UNOBSERVABLE/4, got '$out' / $rc"
  # F31 review 3: a 7-day hold - and a 7-day-only reading is one - is the
  # 7-day stop. That window refills in days: the listener stops (exit 2) instead
  # of polling 5.5h into STUCK.
  out=$(RELAY_LEVEL_CMD='echo src=claude-code 5h=- 7d=85 ctx=- max=85' chain_wait --interval 1); rc=$?
  [ "$rc" = 2 ] && [ "$out" = "STOP 85 7d" ] || die "chain wait: a 7-day-only 85% wants STOP 85 7d / 2, got '$out' / $rc"
  out=$(RELAY_LEVEL_CMD='echo src=codex 5h=10 7d=91 ctx=- max=91' chain_wait --interval 1); rc=$?
  [ "$rc" = 2 ] && [ "$out" = "STOP 91 7d" ] || die "chain wait: 7d 91% wants STOP 91 7d / 2, got '$out' / $rc"
  set -e
  sed "s/hold: 2026-01-01T00:00Z /hold: $(now) /" "$RUN" > "$RUN.x" && mv "$RUN.x" "$RUN"
  age_drv
  set +e
  out=$(RELAY_LEVEL_CMD='echo src=claude-code 5h=84 7d=10 ctx=5 max=84' chain_wait --interval 1 --for 1 --driver @cc-b); rc=$?
  drv_fresh || die "chain wait: a poll did not refresh the driver stamp"
  [ "$rc" = 5 ] || die "chain wait: --for spent, want WAITING/5, got '$out' / $rc"
  case "$out" in "WAITING 84 "*) ;; *) die "chain wait: WAITING line wrong: $out" ;; esac
  echo 0 > "$d4/polls"
  out=$(RELAY_LEVEL_CMD="n=\$(cat '$d4/polls'); echo \$((n+1)) > '$d4/polls'; if [ \$n -ge 1 ]; then echo src=claude-code 5h=60 7d=10 ctx=5 max=60; else echo src=claude-code 5h=84 7d=10 ctx=5 max=84; fi" chain_wait --interval 1 --for 30); rc=$?
  [ "$rc" = 0 ] && [ "$out" = "RELEASE 60" ] && [ "$(cat "$d4/polls")" = 2 ] || die "chain wait: did not release on the poll after usage fell: '$out' / $rc"

  # release: the reading decides; an override is a ruling; 7d needs --confirmed.
  (RELAY_LEVEL_CMD='echo src=claude-code 5h=83 7d=10 ctx=5 max=83' chain_release >/dev/null 2>&1); [ $? = 2 ] || die "chain release: released at 83%"
  (RELAY_LEVEL_CMD='echo src=claude-code 5h=10 7d=91 ctx=5 max=91' chain_release --override >/dev/null 2>&1); [ $? = 2 ] || die "chain release --override: passed the 7-day stop without --confirmed"
  set -e
  grep -q '^driver: .*     hold: 20' "$RUN" || die "chain release: a refused release cleared the hold"
  out=$(RELAY_LEVEL_CMD='echo src=claude-code 5h=10 7d=91 ctx=5 max=91' chain_release --override --confirmed) || die "chain release --override --confirmed failed"
  grep -q "$c2: override: user confirmed past 7d 90% (91%)" "$RUN" || die "chain release: no ruling for the 7-day override"
  grep -q '^driver: @cc-b [^ ]*     hold: -     mode: workflow$' "$RUN" || die "chain release: hold not cleared"
  [ "$(chain_release)" = "not held" ] || die "chain release: not idempotent"
  chain_hold 83 >/dev/null
  age_drv
  out=$(RELAY_LEVEL_CMD='echo src=claude-code 5h=83 7d=10 ctx=5 max=83' chain_release --override --driver @cc-b) || die "chain release --override failed"
  grep -q "$c2: override: user asked at 83%" "$RUN" || die "chain release --override: no ruling"
  drv_fresh || die "chain release: did not refresh the driver stamp"
  # F31 review 2: another session's hold, wait, release and heartbeat leave a
  # dead driver's stamp as it was, so the resumer can take the chain over.
  age_drv
  RELAY_CHAIN_DRIVER=@cc-r chain_hold 83 >/dev/null; drv_fresh && die "chain hold: refreshed another session's driver stamp"
  set +e
  (RELAY_LEVEL_CMD='echo src=claude-code 5h=83 7d=10 ctx=5 max=83' chain_wait --interval 1 --for 1 --driver @cc-r >/dev/null)
  set -e
  drv_fresh && die "chain wait: refreshed another session's driver stamp"
  cmd_heartbeat "$s1" --driver @cc-r; drv_fresh && die "heartbeat: refreshed another session's driver stamp"
  RELAY_LEVEL_CMD='echo src=claude-code 5h=10 7d=10 ctx=5 max=10' chain_release --driver @cc-r >/dev/null
  drv_fresh && die "chain release: refreshed another session's driver stamp"
  grep -q '^driver: @cc-b 2026-01-01T00:00Z     hold: -     mode: workflow$' "$RUN" || die "chain release by another session: header wrong"
  # F31 review: dispatch reads usage itself. 5h at the hold -> refused unless
  # --override (a ruling); unobservable -> dispatches, with a note.
  set +e
  (RELAY_LEVEL_CMD='echo src=claude-code 5h=85 7d=10 ctx=5 max=85' chain_dispatch "$s2" --driver @cc-b >/dev/null 2>&1); [ $? = 2 ] || die "chain dispatch: started at a 5-hour 85% with no --override"
  (RELAY_LEVEL_CMD='echo src=claude-code 5h=- 7d=85 ctx=- max=85' chain_dispatch "$s2" --driver @cc-b --override >/dev/null 2>"$d4/err"); rc=$?
  [ "$rc" = 2 ] && grep -q '^REFUSED: 7-day window at 85%' "$d4/err" || die "chain dispatch: a 7-day-only 85% was not the 7-day stop (needs --confirmed): $rc $(cat "$d4/err")"
  (RELAY_LEVEL_CMD='echo src=claude-code 5h=- 7d=- ctx=85 max=85' chain_dispatch "$s2" --driver @cc-b >/dev/null 2>"$d4/err") || die "chain dispatch: refused an unobservable reading"
  set -e
  grep -q '^note: usage unobservable' "$d4/err" || die "chain dispatch: no note for an unobservable reading"
  grep -q "^| $s2 | $c2 F2 report | ~ |" "$RUN" || die "chain dispatch: unobservable dispatch did not claim the row"
  cmd_stage "$s2" '!' build:opus
  out=$(RELAY_LEVEL_CMD='echo src=claude-code 5h=85 7d=10 ctx=5 max=85' chain_dispatch "$s2" --driver @cc-b --override) || die "chain dispatch --override failed"
  grep -q "$c2: override: user asked at 85%" "$RUN" || die "chain dispatch --override: no ruling"
  cmd_stage "$s2" '!' build:opus
  set +e
  (RELAY_LEVEL_CMD='echo src=claude-code 5h=10 7d=92 ctx=5 max=92' chain_dispatch "$s2" --driver @cc-b >/dev/null 2>&1); [ $? = 2 ] || die "chain dispatch: started past the 7-day stop without --confirmed"
  set -e
  # F31 review 3: a redispatch of a failed stage replaces its In-flight block -
  # one block per stage, the new one, not the old block with its dead run id.
  sed "/^### stage $s2 - /,/^#/ s/^run: .*/run: dead-run-1/" "$RUN" > "$RUN.x" && mv "$RUN.x" "$RUN"
  grep -q '^run: dead-run-1$' "$RUN" || die "selftest: did not mark the old In-flight block"
  RELAY_LEVEL_CMD='echo src=claude-code 5h=10 7d=92 ctx=5 max=92' chain_dispatch "$s2" --driver @cc-b --confirmed >/dev/null || die "chain dispatch --confirmed failed"
  [ "$(grep -c "^### stage $s2 - " "$RUN")" = 1 ] || die "chain dispatch: redispatching a failed stage left $(grep -c "^### stage $s2 - " "$RUN") In-flight blocks for it"
  ! grep -q '^run: dead-run-1$' "$RUN" || die "chain dispatch: redispatching a failed stage kept the old In-flight block"
  [ "$(grep -c "^### stage $s1 - " "$RUN")" = 1 ] || die "chain dispatch: replacing stage $s2's block touched stage $s1's"
  awk '/^## In flight$/{f=NR} /^## Rulings/{r=NR} END{exit !(f && r && f < r)}' "$RUN" || die "chain dispatch: the In-flight section lost its place"
  grep -q "$c2: override: user confirmed past 7d 90% (92%)" "$RUN" || die "chain dispatch --confirmed: no ruling"
  chain_status | grep -q "^### $c3 - stage $s3 - F3 cli\$" || die "chain status: did not print the chain"
  [ ! -e "$RUN.lock" ] || die "chain: left the lock behind"

  # F31 review: the checks and the claim are one lock hold. Two processes
  # dispatching one stage at once -> exactly one 0 and one 2, one block.
  me="$HERE/${0##*/}"   # this file, or the mutant copy a mutation check runs
  set +e
  RELAY_RUN="$RUN" sh "$me" chain dispatch "$s3" --driver @cc-b >/dev/null 2>&1 & p1=$!
  RELAY_RUN="$RUN" sh "$me" chain dispatch "$s3" --driver @cc-b >/dev/null 2>&1 & p2=$!
  wait $p1; r1=$?; wait $p2; r2=$?
  set -e
  { [ "$r1" = 0 ] && [ "$r2" = 2 ]; } || { [ "$r1" = 2 ] && [ "$r2" = 0 ]; } || die "chain dispatch: two parallel dispatches of one stage exited $r1 and $r2, not 0 and 2"
  [ "$(grep -c "^### stage $s3 - " "$RUN")" = 1 ] || die "chain dispatch: two parallel dispatches wrote two In-flight blocks"
  # Same for plan: two processes planning one stage -> one code in the cell.
  s5=$(cmd_add "F9 race") || die "add failed"
  set +e
  RELAY_RUN="$RUN" sh "$me" chain plan "$s5" --prompt-file "$d4/p3" >/dev/null 2>&1 & p1=$!
  RELAY_RUN="$RUN" sh "$me" chain plan "$s5" --prompt-file "$d4/p3" >/dev/null 2>&1 & p2=$!
  wait $p1; r1=$?; wait $p2; r2=$?
  set -e
  { [ "$r1" = 0 ] && [ "$r2" != 0 ]; } || { [ "$r1" != 0 ] && [ "$r2" = 0 ]; } || die "chain plan: two parallel plans of one stage exited $r1 and $r2"
  grep -q "^| $s5 | [A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9] F9 race |" "$RUN" || die "chain plan: two parallel plans put two codes in the cell"
  [ "$(grep -c " - stage $s5 - " "$RUN")" = 1 ] || die "chain plan: two parallel plans wrote two blocks"
  [ ! -e "$RUN.lock" ] || die "chain: parallel calls left the lock behind"
  # F31 review 2: a hand-mangled Chain header (4-space separators) is left
  # alone by the driver's heartbeat - row stamped, exit 0, header unchanged.
  cp "$RUN" "$d4/good"
  sed 's/^\(driver: @[^ ]* [^ ]*\)     hold: \(.*\)     mode: /\1    hold: \2    mode: /' "$RUN" > "$RUN.x" && mv "$RUN.x" "$RUN"
  bad=$(chain_hdr); case "$bad" in *"$SEP"*|'') die "selftest: did not mangle the Chain header: $bad" ;; esac
  tag=${bad#driver: }; tag=${tag%% *}
  ( cmd_heartbeat "$s1" --driver "$tag" ) || die "heartbeat: failed on a hand-mangled Chain header"
  [ "$(chain_hdr)" = "$bad" ] || die "heartbeat: rewrote a hand-mangled Chain header: $(chain_hdr)"
  [ ! -e "$RUN.lock" ] || die "heartbeat: left the lock behind on a mangled header"
  # Every other command that reads the header for a rewrite refuses it as the
  # ps1 twin's HdrParts does - exit 1, "unreadable Chain header" - and leaves
  # the file byte-identical, instead of nesting the old line into a new one.
  # F31 review 3: a driver cell with no stamp is unreadable the same way - it
  # has no age, and reading one made a live driver look stale, so another
  # session took the chain over with no --take and no ruling.
  for mangle in seps nostamp; do
    if [ "$mangle" = nostamp ]; then
      cp "$d4/good" "$RUN"
      sed 's/^driver: \(@[^ ]*\) [^ ]*     hold: /driver: \1     hold: /' "$RUN" > "$RUN.x" && mv "$RUN.x" "$RUN"
      bad=$(chain_hdr); case "$bad" in "driver: $tag${SEP}hold: "*) ;; *) die "selftest: did not strip the driver stamp: $bad" ;; esac
      ( cmd_heartbeat "$s1" --driver "$tag" ) || die "heartbeat: failed on a stampless driver cell"
      [ "$(chain_hdr)" = "$bad" ] || die "heartbeat: rewrote a stampless driver cell: $(chain_hdr)"
    fi
    cp "$RUN" "$d4/mangled"
    for cmd in "chain_hold 84 --driver $tag" "chain_release --driver $tag" \
               "chain_wait --interval 1 --for 1 --driver $tag" "chain_dispatch $s5 --driver $tag" \
               "chain_dispatch $s5 --driver @cc-other"; do
      set +e
      ( $cmd ) >/dev/null 2>"$d4/err"; rc=$?
      set -e
      [ "$rc" = 1 ] && grep -qF "FAIL: unreadable Chain header in $RUN: $bad" "$d4/err" ||
        die "${cmd%% *} ($mangle): an unreadable Chain header gave exit $rc, not the unreadable-header refusal: $(cat "$d4/err")"
      cmp -s "$d4/mangled" "$RUN" || die "${cmd%% *} ($mangle): rewrote an unreadable Chain header: $(chain_hdr)"
      [ ! -e "$RUN.lock" ] || die "${cmd%% *} ($mangle): left the lock behind on an unreadable header"
    done
  done

  # The fallback coder (no next-id) refuses past 9999 instead of wrapping.
  d5="$d4/nonid"; mkdir -p "$d5"
  printf '### AAAB - stage 1 - x\n' > "$d5/run-1-a.md"
  [ "$(RELAY_NEXT_ID="$d5/nope.sh" alloc_code "$d5" 2>/dev/null)" = AAAC ] || die "alloc_code fallback: AAAB + 1 is not AAAC"
  printf '### 9999 - stage 2 - y\n' >> "$d5/run-1-a.md"
  set +e
  (RELAY_NEXT_ID="$d5/nope.sh" alloc_code "$d5" >"$d5/out" 2>"$d5/err"); rc=$?
  set -e
  [ "$rc" = 2 ] && [ ! -s "$d5/out" ] && grep -q exhausted "$d5/err" || die "alloc_code fallback: past 9999 gave '$(cat "$d5/out")' / $rc, want a refusal (2)"
  # F31 review 3: the same refusal through next-id.sh - exit 2 on both paths,
  # though next-id itself exits 1 for it.
  if [ -n "$(find_next_id)" ]; then
    set +e
    (alloc_code "$d5" >"$d5/out" 2>"$d5/err"); rc=$?
    set -e
    [ "$rc" = 2 ] && [ ! -s "$d5/out" ] && grep -q '^REFUSED: kind W exhausted' "$d5/err" || die "alloc_code via next-id.sh: past 9999 gave '$(cat "$d5/out")' / $rc, want a refusal (2): $(cat "$d5/err")"
  fi

  # The run file the relay-chain-resume fixture ships (stage 61) parses.
  RUN="$d4/fixture.md"
  printf '## Chain\ndriver: @cc-a1b2c3 2026-09-01T09:45Z     hold: 2026-09-01T09:45Z 84%% 5h next=2     mode: workflow\n### AAAC - stage 2 - F2+F5 report.py, F3 cli\nprompt: |\n  item F2+F5\n' > "$RUN"
  [ "$(hdr_hold)" = "2026-09-01T09:45Z 84% 5h next=2" ] && [ "$(hdr_driver)" = "@cc-a1b2c3 2026-09-01T09:45Z" ] &&
    [ "$(hdr_mode)" = workflow ] && [ "$(code_of 2)" = AAAC ] && [ "$(block_prompt 2)" = "item F2+F5" ] ||
    die "chain: the stage-61 fixture's run file does not parse"
  unset RELAY_LEVEL_CMD
  cd "$cd_save"
}

c="${1:-}"; [ "$#" -gt 0 ] && shift || true

# An id may lead: `relay-morpheus.sh 3 status`. Checked before the command names so
# a run can never be shadowed by one.
case "$c" in
  RUN-*|run-*|[0-9]*)
    if f=$(resolve "$c"); then RUN="$f"; c="${1:-status}"; [ "$#" -gt 0 ] && shift || true; fi
    ;;
esac

case "$c" in
  list)      cmd_list ;;
  resume)    cmd_resume "$@" ;;
  init)      cmd_init "$@" ;;
  add)       cmd_add "$@" ;;
  stage)     cmd_stage "$@" ;;
  heartbeat) cmd_heartbeat "$@" ;;
  status)    cmd_status "$@" ;;
  orphans)   cmd_orphans "$@" ;;
  chain)     cmd_chain "$@" ;;
  selftest)  cmd_selftest ;;
  *) sed -n '2,40p' "$0" >&2; exit 1 ;;
esac
