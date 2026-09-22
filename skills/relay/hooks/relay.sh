#!/bin/sh
# relay - bookkeeping for `.skillator/run.md`, the staged-run ledger.
#
# Every command here reads or edits that one file and nothing else. There is no
# judgement in this script: deciding a stage is done is the model's job, saying
# so on disk is this script's. See ../SKILL.md for the rule it serves.
#
#   relay.sh init <plan> <title> <stage>...   create the run file
#   relay.sh stage <n> <state> [owner] [landed]
#   relay.sh heartbeat <n>
#   relay.sh status
#   relay.sh orphans [minutes]                default 20
#   relay.sh selftest
#
# States:  (pending) | ~ in flight | x landed | ! failed
set -e

RUN="${RELAY_RUN:-.skillator/run.md}"
die() { echo "FAIL: $*" >&2; exit 1; }
now() { date -u +%Y-%m-%dT%H:%MZ; }

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

need_run() { [ -f "$RUN" ] || die "no run file at $RUN (relay.sh init ...)"; }

# Touch `updated:` on every mutation. A run file whose header is older than its
# rows has been edited by hand, which is allowed but worth being able to see.
stamp_updated() {
  t=$(now)
  awk -v t="$t" '/^started: /{sub(/updated: .*/, "updated: " t)} {print}' "$RUN" > "$RUN.tmp"
  mv "$RUN.tmp" "$RUN"
}

cmd_init() {
  plan="$1"; title="$2"; shift 2
  [ -n "$plan" ] && [ -n "$title" ] && [ "$#" -gt 0 ] \
    || die "usage: relay.sh init <plan> <title> <stage>..."
  [ -f "$RUN" ] && die "run file already exists: $RUN (a run file is never overwritten)"
  mkdir -p "$(dirname "$RUN")"
  t=$(now)
  id="r$(date -u +%y%m%d%H%M)"
  {
    echo "# RUN $id - $title"
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
}

# Rows are keyed by stage number, so a redispatch rewrites its row instead of
# appending a second one - that is what makes a resume idempotent.
cmd_stage() {
  n="$1"; state="$2"; owner="$3"; landed="$4"
  [ -n "$n" ] || die "usage: relay.sh stage <n> <state> [owner] [landed]"
  case "$state" in ''|'~'|x|'!') ;; *) die "unknown state: $state (one of '' ~ x !)" ;; esac
  [ "$state" = x ] && [ -z "$landed" ] \
    && die "stage $n marked landed with no sha or path - that is the lie the next session believes"
  need_run
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
    END{ if(!found) exit 3 }' "$RUN" > "$RUN.tmp" \
    || { rm -f "$RUN.tmp"; die "no stage $n in $RUN"; }
  mv "$RUN.tmp" "$RUN"
  stamp_updated
}

cmd_heartbeat() {
  n="$1"; [ -n "$n" ] || die "usage: relay.sh heartbeat <n>"
  need_run
  # A heartbeat carries the row's existing `landed` back in. Without it the
  # "x with no sha" guard fires on a stage that already landed, turning a
  # no-op bookkeeping call from a late-reporting agent into a hard error.
  cur=$(awk -v n="$n" 'BEGIN{FS="|"} /^\| *[0-9]+ *\|/{num=$2;gsub(/ /,"",num); if(num==n){s=$4;gsub(/ /,"",s); l=$7;gsub(/^ +| +$/,"",l); print s "\t" l}}' "$RUN")
  st=$(printf %s "$cur" | cut -f1); la=$(printf %s "$cur" | cut -f2)
  [ "$la" = "-" ] && la=""
  cmd_stage "$n" "$st" "" "$la"
}

cmd_status() { [ -f "$RUN" ] || return 0; sed -n '/^## Stages/,/^## In flight/p' "$RUN" | sed '$d'; }

# The network-loss list: in-flight rows nobody has heard from. This is the only
# signal there is - a dropped agent sends no error, it just stops reporting.
cmd_orphans() {
  limit="${1:-20}"; [ -f "$RUN" ] || return 0; t=$(now)
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

  echo ok
}

c="${1:-}"; [ "$#" -gt 0 ] && shift || true
case "$c" in
  init)      cmd_init "$@" ;;
  stage)     cmd_stage "$@" ;;
  heartbeat) cmd_heartbeat "$@" ;;
  status)    cmd_status "$@" ;;
  orphans)   cmd_orphans "$@" ;;
  selftest)  cmd_selftest ;;
  *) sed -n '2,18p' "$0" >&2; exit 1 ;;
esac
