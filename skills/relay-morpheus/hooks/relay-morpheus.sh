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
#   relay-morpheus.sh stage <n> <state> [owner] [landed]
#   relay-morpheus.sh heartbeat <n>
#   relay-morpheus.sh status
#   relay-morpheus.sh orphans [minutes]                default 20
#   relay-morpheus.sh selftest
#
# Any command takes an optional run id first: `relay-morpheus.sh 3 status`.
#
# States:  (pending) | ~ in flight | x landed | ! failed
set -e

RUN="${RELAY_RUN:-}"
DIR="${RELAY_DIR:-.skillator}"
die() { echo "FAIL: $*" >&2; exit 1; }
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
  if [ -z "$RUN" ]; then
    id=$(next_id); RUN="$DIR/run-$id-$(slug "$title").md"
  else
    id=$(id_of "$RUN")
    [ -n "$id" ] || id=1
  fi
  [ -f "$RUN" ] && die "run file already exists: $RUN (a run file is never overwritten)"
  # A `|` in a stage name adds a column, and every later read is positional -
  # the state would be written into the name cell and the sha into heartbeat,
  # silently, with no error anywhere.
  for s in "$@"; do
    case "$s" in *'|'*) die "stage name contains '|', which would shift every column: $s" ;; esac
  done
  mkdir -p "$(dirname "$RUN")"
  t=$(now)
  {
    echo "# RUN-$id - $title"
    echo "plan: $plan"
    echo "started: $t   updated: $t"
    echo
    echo "## Stages"
    echo "| # | stage | state | owner | heartbeat | landed |"
    echo "|---|-------|-------|-------|-----------|--------|"
    n=0
    for s in "$@"; do
      n=$((n+1))
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
  t=$(now)
  awk -v n="$n" -v st="$state" -v ow="$owner" -v la="$landed" -v t="$t" -v F=0 '
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
    || { rm -f "$RUN.tmp.$$"; unlock; die "no stage $n in $RUN"; }
  mv "$RUN.tmp.$$" "$RUN"
  stamp_updated
  unlock
}

cmd_heartbeat() {
  n="$1"; [ -n "$n" ] || die "usage: relay-morpheus.sh heartbeat <n>"
  need_run
  # A heartbeat carries the row's existing `landed` back in. Without it the
  # "x with no sha" guard fires on a stage that already landed, turning a
  # no-op bookkeeping call from a late-reporting agent into a hard error.
  cur=$(awk -v n="$n" 'BEGIN{FS="|"} /^\| *[0-9]+ *\|/{num=$2;gsub(/ /,"",num); if(num==n){s=$4;gsub(/ /,"",s); l=$7;gsub(/^ +| +$/,"",l); print s "\t" l}}' "$RUN")
  st=$(printf %s "$cur" | cut -f1); la=$(printf %s "$cur" | cut -f2)
  [ "$la" = "-" ] && la=""
  cmd_stage "$n" "$st" "" "$la"
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

cmd_selftest() {
  d=$(mktemp -d); trap 'rm -rf "$d"' EXIT
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
  d2=$(mktemp -d); DIR="$d2"; RUN=""
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

  echo ok
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
  stage)     cmd_stage "$@" ;;
  heartbeat) cmd_heartbeat "$@" ;;
  status)    cmd_status "$@" ;;
  orphans)   cmd_orphans "$@" ;;
  selftest)  cmd_selftest ;;
  *) sed -n '2,22p' "$0" >&2; exit 1 ;;
esac
