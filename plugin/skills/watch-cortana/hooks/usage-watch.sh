#!/bin/sh
# watch-cortana: record usage % from the statusline, act on it at the Stop hook.
#   usage-watch.sh probe ["<original statusline command>"]   (statusLine command)
#   usage-watch.sh gate                                      (Stop hook)
#   usage-watch.sh check                                     (any host, no stdin)
#   usage-watch.sh level                                     (any host, no stdin, no side effect)
# Threshold: $CLAUDE_USAGE_HANDOFF_PCT, default 92.
# State dir: $CLAUDE_USAGE_WATCH_DIR, else $CLAUDE_CONFIG_DIR/handoff-watch,
# else ~/.claude/handoff-watch (the first override exists so tests never touch
# a live session's flags; A130: the second keeps a profile's flags its own).
mode="${1:-probe}"; then_cmd="$2"
# The state dir keeps its original name on purpose: it is storage, not a
# skill reference. Renaming it with the skill would strand every live
# session's flag and .done marker at the old path - a session that had
# already fired would fire a second time. Skill renames must not migrate
# a user's machine.
# A130: a CLAUDE_CONFIG_DIR profile keeps its flags in its own config dir - the
# probe writes there and check/level read there, so one profile never reads
# another's sessions. Same order as the ops-board mod's usage read. Claude Code
# on Windows hands over a backslashed path; `tr` it so every join below is '/'.
if [ -n "${CLAUDE_USAGE_WATCH_DIR:-}" ]; then dir=$CLAUDE_USAGE_WATCH_DIR
elif [ -n "${CLAUDE_CONFIG_DIR:-}" ]; then dir="$(printf '%s' "$CLAUDE_CONFIG_DIR" | tr '\\' '/')/handoff-watch"
else dir="$HOME/.claude/handoff-watch"; fi
limit="${CLAUDE_USAGE_HANDOFF_PCT:-92}"
# The 7-day window is watched separately and lower. The 5-hour window refills in
# hours, so crossing it is a pause; the weekly one does not, so crossing it ends
# the week's work - which is why it gets its own threshold and its own fourth
# step: ask where to go next rather than leave the user to guess.
wk_limit="${CLAUDE_USAGE_HANDOFF_WEEKLY_PCT:-97}"
wk_step4=' (4) This is the 7-DAY window, which does not refill for days - the work is over for now, not paused. So after the handoff, do not stop on a summary: use AskUserQuestion to put the next direction to the user as concrete options drawn from the open board and the handoff'"'"'s own next-steps, say which one you recommend and why in one line, and make the recommendation the first option.'

# The flag file is shared with the PowerShell twin, which used to write it with
# a UTF-8 BOM and CRLF. A BOM makes awk string-compare (0xEF > '9'), so "12.0"
# read as ">= 92" and the one-shot handoff was burned at 12%. Accept only a
# complete numeric payload after trimming legacy BOM/whitespace.
read_pct() {
  [ -f "$1" ] || return 0
  awk -v bom="$(printf '\357\273\277')" '
    { t=t $0 "\n" }
    END { sub(/^[[:space:]]*/, "", t); if (index(t,bom)==1) t=substr(t,length(bom)+1)
      sub(/^[[:space:]]*/, "", t); sub(/[[:space:]]*$/, "", t)
      if (t ~ /^[0-9]+([.][0-9]+)?$/ && t+0<=100) print t }' "$1"
}
# Numeric compare, forced numeric on both sides.
over_limit() { [ "$(awk -v a="$1" -v b="$2" 'BEGIN{print (a+0 >= b+0)}')" = 1 ]; }

# A32: a rollout nobody has written to in this long is not this session's usage.
# Must match $staleHours in the PowerShell twin.
stale_secs=10800   # 3 hours

# Every rollout under $1, at ANY depth, one path per line.
# Deliberately NOT `find`: on Windows, sh launched from a non-MSYS parent
# (PowerShell, the Claude Code host) inherits a PATH with System32 first, so
# `find` is Windows' find.exe and answers "File not found - rollout-*.jsonl"
# while exiting 0 - a silent empty result, which is exactly the failure this
# ticket is about. Plain shell recursion has no PATH to lose. (`sort` is the
# other name Windows steals, and `probe` used to pipe through it. That was
# wrong: the watch-cortana selftest drives this script from PowerShell, where
# `sort.exe` eats `-g` and prints "The system cannot find the file specified"
# while exiting 0 - so `probe` wrote the weekly flag and no main flag at all.
# Every numeric compare in this file now goes through awk.)
codex_walk() {
  for p in "$1"/*; do
    [ -e "$p" ] || continue          # unmatched glob comes back literal
    if [ -d "$p" ]; then codex_walk "$p"
    else case ${p##*/} in rollout-*.jsonl) printf '%s
' "$p" ;; esac
    fi
  done
}

# "<epoch> <path>" per argument. POSIX defines no mtime primitive: `stat -c` is
# GNU/busybox, `stat -f` is BSD/macOS, `date -r` means "this file" on GNU but
# "this many seconds" on BSD. Try them in an order where the wrong one fails
# rather than lies (GNU answers `stat -f` with '?', so -c must come first), and
# take whole batches at once so this is one fork, not one per rollout.
mtime_list() {
  stat -c '%Y %n' "$@" 2>/dev/null && return 0
  stat -f '%m %N' "$@" 2>/dev/null && return 0
  for f in "$@"; do
    e=$(date -r "$f" +%s 2>/dev/null)
    case $e in ''|*[!0-9]*) continue ;; esac
    printf '%s %s
' "$e" "$f"
  done
}

# `date +%s` is not POSIX either; awk's srand() returns the PREVIOUS seed, which
# is the current epoch, and awk is required to exist.
now_epoch() {
  n=$(date +%s 2>/dev/null)
  case $n in ''|*[!0-9]*) n=$(awk 'BEGIN{srand();print srand()}') ;; esac
  printf '%s' "$n"
}

# Newest rollout with a usage event under $1, ONLY inside the freshness
# window - same rule, same window, as the PowerShell twin. Prints nothing when
# there is none, when the newest is stale, or when this host offers no way to
# read an mtime at all. That last case is a deliberate decline: a rollout we
# cannot date is a rollout we must not fire on. Declining costs a printed
# reminder; firing wrongly burns the one-shot .done and derails a live session.
codex_newest_fresh() {
  [ -d "$1" ] || return 0
  # Collect first, split second: `set -f` must not be in force while codex_walk
  # runs, or the globbing it is built on is switched off under it.
  list=$(codex_walk "$1")
  [ -n "$list" ] || return 0
  oIFS=$IFS
  IFS='
'
  set -f                              # newline-split the list, but do not glob it
  set -- $list
  set +f
  IFS=$oIFS
  [ "$#" -gt 0 ] || return 0
  mtime_list "$@" | awk -v now="$(now_epoch)" -v w="$stale_secs" '
    { t = $1 + 0; sub(/^[^ ]* /, "")
      if (now - t < w) { times[++n] = t; paths[n] = $0 } }
    END { for (j=1; j<=n; j++) {
      k=0; for (i=1; i<=n; i++) if (paths[i]!="" && (!k || times[i]>times[k])) k=i
      print paths[k]; paths[k]="" } }' |
    while IFS= read -r candidate; do
      if [ -n "$codex_session" ]; then
        meta=$(head -1 "$candidate" | tr -d '\r')
        meta_id=$(printf '%s' "$meta" | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
        case $meta in *'"session_meta"'*) ;; *) continue ;; esac
        [ "$meta_id" = "$codex_session" ] || continue
      fi
      # A starting child must not hide an older, still-fresh usage event.
      # Same test as codex_last_tc, two forks fewer per candidate (5s budget).
      if tail -400 "$candidate" | grep -q '"token_count"'; then printf '%s\n' "$candidate"; break; fi
    done
}

# True when file $1 exists and was written inside the freshness window ($2, default $stale_secs).
# A file whose mtime this host cannot read is not fresh - same decline as above.
fresh_file() {
  [ -f "$1" ] || return 1
  mtime_list "$1" | awk -v now="$(now_epoch)" -v w="${2:-$stale_secs}" '{ if (now - $1 < w) ok=1 } END { exit !ok }'
}

# Last token_count line of a codex rollout, or nothing.
codex_last_tc() { tail -400 "$1" | grep '"token_count"' | tail -1; }

# Usage % from one codex rollout: the max of every rate_limits used_percent
# whose window is NOT the 7-day one (A98: window_minutes 10080), plus the
# live context (last_token_usage.total_tokens / model_context_window), on its
# last token_count line. Prints nothing when there is no such line.
codex_pct() {
  line=$(codex_last_tc "$1")
  [ -n "$line" ] || return 0
  # last_token_usage is the live context; total_token_usage is cumulative
  # for the session and would read well over 100%.
  printf '%s' "$line" | awk '
    match($0,/"last_token_usage":\{[^}]*"total_tokens":[0-9]+/){
      t=substr($0,RSTART,RLENGTH); sub(/.*"total_tokens":/,"",t) }
    match($0,/"model_context_window":[0-9]+/){
      w=substr($0,RSTART,RLENGTH); sub(/.*:/,"",w) }
    { m=0; s=$0
      while (match(s,/\{[^{}]*"used_percent":[0-9.]+[^{}]*\}/)) {
        block=substr(s,RSTART,RLENGTH)
        if (block !~ /"window_minutes":10080/) {
          v=block; sub(/.*"used_percent":/,"",v); sub(/[^0-9.].*/,"",v)
          if (v+0>m) m=v+0 }
        s=substr(s,RSTART+RLENGTH) } }
    END { if (w+0>0 && t+0>0) { c=100*t/w; if (c>m) m=c }
          if (m>0) printf "%.1f", m }'
}

# A98: the 10080-minute rate_limits window is codex's 7-day window, the
# counterpart of the Claude path's seven_day.used_percentage - it gets the
# weekly gate (90% hard stop, step-4 question) instead of the 92% one.
# Prints nothing when the last token_count line has no such window.
codex_wk_pct() {
  line=$(codex_last_tc "$1")
  [ -n "$line" ] || return 0
  printf '%s' "$line" | awk '
    { wk=""; s=$0
      while (match(s,/\{[^{}]*"used_percent":[0-9.]+[^{}]*\}/)) {
        block=substr(s,RSTART,RLENGTH)
        if (block ~ /"window_minutes":10080/) {
          v=block; sub(/.*"used_percent":/,"",v); sub(/[^0-9.].*/,"",v)
          if (wk=="" || v+0>wk+0) wk=v }
        s=substr(s,RSTART+RLENGTH) } }
    END { if (wk!="") printf "%.1f", wk+0 }'
}

# Newest main flag in the state dir. Its siblings (.weekly, .fivehour, .ctx,
# .done) are written after it, so picking by mtime alone would read one of
# them as the max and compare it against the wrong threshold.
main_flag() {
  ls -t "$dir" 2>/dev/null | grep -E '^[a-zA-Z0-9_-]+$' |
    while IFS= read -r k; do
      if [ -n "$(read_pct "$dir/$k")" ]; then printf '%s' "$k"; break; fi
    done
}

# A130: the flag key check/level may read, or nothing. Inside Claude Code
# (CLAUDE_CODE_SESSION_ID set) only this session's own flags count - never the
# newest file in the dir, which may be another session's. Elsewhere the newest
# main flag (else the newest .weekly - A101), and only while fresh. Must match
# Get-FlagKey in the PowerShell twin.
flag_key() {
  if [ -n "${CLAUDE_CODE_SESSION_ID:-}" ]; then
    k=$CLAUDE_CODE_SESSION_ID
    case $k in *[!a-zA-Z0-9_-]*) return 0 ;; esac
    if [ -n "$(read_fresh "$dir/$k")$(read_fresh "$dir/$k.weekly")" ]; then printf '%s' "$k"; fi
    return 0
  fi
  k=$(main_flag)
  if [ -n "$k" ]; then fresh_file "$dir/$k" && printf '%s' "$k"; return 0; fi
  k=$(ls -t "$dir" 2>/dev/null | grep -E '^[a-zA-Z0-9_-]+\.weekly$' |
    while IFS= read -r f; do
      if [ -n "$(read_pct "$dir/$f")" ]; then printf '%s' "$f"; break; fi
    done)
  [ -n "$k" ] && fresh_file "$dir/$k" && printf '%s' "${k%.weekly}"
  return 0
}
# A fresh flag's first number, else nothing.
read_fresh() { fresh_file "$1" && read_pct "$1"; return 0; }

# F31: "<5h> <7d> <ctx>" from one codex rollout, '-' for each one absent.
# 5h = max of the rate_limits windows that are NOT the 10080-minute one,
# WITHOUT the context ratio - a full context is a compaction, not a quota.
codex_level() {
  line=$(codex_last_tc "$1")
  [ -n "$line" ] || return 0
  printf '%s' "$line" | awk '
    match($0,/"last_token_usage":\{[^}]*"total_tokens":[0-9]+/){
      t=substr($0,RSTART,RLENGTH); sub(/.*"total_tokens":/,"",t) }
    match($0,/"model_context_window":[0-9]+/){
      w=substr($0,RSTART,RLENGTH); sub(/.*:/,"",w) }
    { h=""; wk=""; s=$0
      while (match(s,/\{[^{}]*"used_percent":[0-9.]+[^{}]*\}/)) {
        block=substr(s,RSTART,RLENGTH)
        v=block; sub(/.*"used_percent":/,"",v); sub(/[^0-9.].*/,"",v)
        if (block ~ /"window_minutes":10080/) { if (wk=="" || v+0>wk+0) wk=v }
        else { if (h=="" || v+0>h+0) h=v }
        s=substr(s,RSTART+RLENGTH) } }
    END { c=""; if (w+0>0 && t+0>0) c=sprintf("%.1f", 100*t/w)
          printf "%s %s %s", (h==""?"-":sprintf("%.1f",h+0)), (wk==""?"-":sprintf("%.1f",wk+0)), (c==""?"-":c) }'
}

read_cache() {
  [ -z "$source_error$codex_session${CLAUDE_CODE_SESSION_ID:-}" ] || return 0
  [ "$selected_host" != codex ] || return 0
  cp=""
  if fresh_file "$selected_profile/quota-cache.json"; then cp="$selected_profile/quota-cache.json"
  elif [ "$selected_host" = claude-code ] && fresh_file "$dir/quota-cache.json"; then cp="$dir/quota-cache.json"; fi
  [ -n "$cp" ] || return 0
  fresh_file "$cp" || return 0
  # Node is optional: without a JSON parser, this cache is unavailable.
  command -v node >/dev/null 2>&1 || return 0
  node -e '
    const fs = require("fs");
    try {
      const r = JSON.parse(fs.readFileSync(process.argv[1], "utf8").replace(/^\uFEFF/, ""));
      const selected = process.argv[2];
      if (!r || typeof r !== "object" || Array.isArray(r) ||
          !["claude-code","codex","agy","muse","cursor"].includes(r.src) ||
          (selected !== "profile" && r.src !== selected)) process.exit(0);
      for (const key of ["5h","five","7d","weekly","max"]) {
        const v = r[key];
        if (v != null && (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100)) process.exit(0);
      }
      if (r.note != null && typeof r.note !== "string") process.exit(0);
      if (r.failures != null && (typeof r.failures !== "number" || !Number.isInteger(r.failures) || r.failures < 1)) process.exit(0);
      if (r.backoff_secs != null) {
        if (typeof r.backoff_secs !== "number" || !Number.isFinite(r.backoff_secs) || r.backoff_secs <= 0) process.exit(0);
        const ageSecs = (Date.now() - fs.statSync(process.argv[1]).mtimeMs) / 1000;
        if (ageSecs >= r.backoff_secs) process.exit(0);
      }
      const h = Object.hasOwn(r,"5h") ? r["5h"] : r.five;
      const w = Object.hasOwn(r,"7d") ? r["7d"] : r.weekly;
      const values = [h,w].filter(v => v != null);
      const fmt = v => v == null ? "-" : v.toFixed(1);
      process.stdout.write([r.src,fmt(h),fmt(w),fmt(values.length ? Math.max(...values) : null),
        (r.note || "").replace(/\s+/g,"_")].join(" "));
    } catch (_) { /* Malformed caches are unavailable. */ }
  ' "$cp" "$selected_host"
}

# Resolve once for level/check; an explicit identity cannot fall through.
case $mode in level|check)
  source_error=""; selected_host=${SKILLATOR_CLI:-}
  [ "$selected_host" != claude ] || selected_host=claude-code
  codex_session=${CODEX_THREAD_ID:-${CODEX_SESSION_ID:-}}
  if { [ -n "${CODEX_THREAD_ID:-}" ] && [ -n "${CODEX_SESSION_ID:-}" ] && [ "$CODEX_THREAD_ID" != "$CODEX_SESSION_ID" ]; } ||
     { [ -n "$codex_session" ] && [ -n "${CLAUDE_CODE_SESSION_ID:-}" ]; } ||
     { [ -n "$selected_host" ] && [ -n "$codex_session" ] && [ "$selected_host" != codex ]; } ||
     { [ -n "$selected_host" ] && [ -n "${CLAUDE_CODE_SESSION_ID:-}" ] && [ "$selected_host" != claude-code ]; }; then
    source_error=conflicting_source_identities
  fi
  if [ -z "$selected_host" ]; then
    if [ -n "${CLAUDE_CODE_SESSION_ID:-}" ]; then selected_host=claude-code
    elif [ -n "$codex_session" ]; then selected_host=codex
    elif [ -n "${SKILLATOR_PROFILE_DIR:-}" ]; then
      if [ -d "$(printf '%s' "$SKILLATOR_PROFILE_DIR" | tr '\\' '/')/sessions" ]; then selected_host=codex; else selected_host=profile; fi
    elif [ -n "${CLAUDE_CONFIG_DIR:-}" ]; then selected_host=claude-code
    elif [ -n "${CODEX_HOME:-}" ]; then selected_host=codex
    elif [ -n "${AGY_CONFIG_DIR:-}${ANTIGRAVITY_APP_DATA_DIR:-}" ]; then selected_host=agy
    elif [ -n "${MUSE_CONFIG_DIR:-}" ]; then selected_host=muse
    elif [ -n "${CURSOR_LEDGER_PATH:-}" ]; then selected_host=cursor
    elif [ -n "$(codex_newest_fresh "$HOME/.codex/sessions")" ]; then selected_host=codex
    else selected_host=claude-code; fi
  fi
  if [ -n "${SKILLATOR_PROFILE_DIR:-}" ]; then selected_profile=$SKILLATOR_PROFILE_DIR
  else
    case $selected_host in
      codex) selected_profile=${CODEX_HOME:-$HOME/.codex} ;;
      claude-code) selected_profile=${CLAUDE_CONFIG_DIR:-$HOME/.claude} ;;
      agy) selected_profile=${AGY_CONFIG_DIR:-${ANTIGRAVITY_APP_DATA_DIR:-$HOME/.gemini/antigravity-cli}} ;;
      muse) selected_profile=${MUSE_CONFIG_DIR:-$HOME/.muse} ;;
      *) selected_profile=$HOME/.$selected_host ;;
    esac
  fi
  selected_profile=$(printf '%s' "$selected_profile" | tr '\\' '/')
  if [ "$selected_host" = claude-code ] && { [ -n "${SKILLATOR_PROFILE_DIR:-}" ] || [ -z "${CLAUDE_USAGE_WATCH_DIR:-}" ]; }; then
    dir=$selected_profile/handoff-watch
  fi
  selected_roll=""
  if [ -z "$source_error" ] && [ "$selected_host" = codex ]; then selected_roll=$(codex_newest_fresh "$selected_profile/sessions"); fi
;; esac

spawn_quota_refresh() {
  sh "$0" refresh "$1" "$2" >/dev/null 2>&1 </dev/null &
}

start_quota_refresh() {
  [ -n "$1" ] && [ -n "$2" ] || return 0
  lock="$2/quota-cache.json.refreshing"
  # F176: stale at 90 s - over the refresh's capped CLI calls (20 s + 30 s), so a read
  # still alive always holds it and a second reader can never start a turn beside it.
  if fresh_file "$lock" 90; then
    note_tag=" note=refresh_pending"
    return 0
  fi
  rm -f "$lock"
  mkdir -p "$2"
  if ! ( set -C; printf '%s' "$(now_epoch)" > "$lock" ) 2>/dev/null; then
    note_tag=" note=refresh_pending"
    return 0
  fi
  note_tag=" note=refresh_pending"
  # F176: `ops --status --refresh` waits for the read, under the same lock.
  if [ "${SKILLATOR_QUOTA_REFRESH_WAIT:-}" = 1 ]; then sh "$0" refresh "$1" "$2" >/dev/null 2>&1 </dev/null
  else spawn_quota_refresh "$1" "$2"; fi
}

if [ "$mode" = refresh ]; then
  cli="$2"; target_dir="$3"
  case $cli in agy|claude|muse) ;; *) exit 0 ;; esac
  [ -n "$target_dir" ] || exit 0
  lock="$target_dir/quota-cache.json.refreshing"
  cache="$target_dir/quota-cache.json"
  mkdir -p "$target_dir"
  # A236: the refresh start, sub-second where date has %N (GNU), else whole seconds.
  parsed=""; turned=""; started_at=$(date +%s.%N 2>/dev/null)
  case $started_at in *[!0-9.]*|.*|*.|'') started_at=$(now_epoch) ;; esac
  raw=""
  # F176: each claude call is capped (secs, function); on expiry its whole process
  # tree is killed, so no read outlives the lock.
  # Parent first (its children listed beforehand), so nothing it runs gets to finish.
  # A listed child is spared only when provably not ours: its start tick (from /proc) and
  # its parent's are readable and its start is strictly earlier - an orphan whose dead
  # parent's PID was reused. No /proc (macOS) or an unreadable start kills it: a capped paid
  # turn must never outlive its lock. Each killed process with a Windows PID gets taskkill /T,
  # so a native node.exe under claude.cmd dies with it.
  started() { sed 's/.*) //' "/proc/$1/stat" 2>/dev/null | awk '{ print $20 }'; }
  kill_tree() {
    t=$(started "$1")
    set -- "$1" $(ps -ef 2>/dev/null | awk -v p="$1" '$3 == p { print $2 }' |
      while read -r c; do s=$(started "$c"); [ -n "$t" ] && [ -n "$s" ] && [ "$s" -lt "$t" ] 2>/dev/null || echo "$c"; done)
    [ -r "/proc/$1/winpid" ] && MSYS_NO_PATHCONV=1 taskkill /T /F /PID "$(cat "/proc/$1/winpid")" >/dev/null 2>&1
    kill -9 "$1" 2>/dev/null
    shift
    for c in "$@"; do kill_tree "$c"; done
  }
  capped() {
    out="$target_dir/quota-cache.json.out"
    "$2" > "$out" 2>/dev/null &
    cp_pid=$!
    # The watchdog ends itself within 1 s of the call; never kill it - it may be mid-tree.
    ( n=0; while [ "$n" -lt "$1" ]; do sleep 1; kill -0 "$cp_pid" 2>/dev/null || exit 0; n=$((n + 1)); done
      kill_tree "$cp_pid" ) >/dev/null 2>&1 </dev/null &
    wait "$cp_pid" 2>/dev/null
    cat "$out" 2>/dev/null; rm -f "$out"
  }
  # The CLI's own hooks must never see a forced read (WAIT) and start one themselves.
  claude_get_usage() {
    printf '%s\n' '{"type":"control_request","request_id":"u1","request":{"subtype":"get_usage","skip_behaviors":true}}' |
      MSYS_NO_PATHCONV=1 SKILLATOR_QUOTA_REFRESH_WAIT= CLAUDE_CONFIG_DIR="$target_dir" claude -p --input-format stream-json --output-format stream-json --verbose
  }
  # The smallest turn: no tools, no MCP, no saved session (flags from `claude --help`;
  # --max-turns is unlisted but parsed). --tools last: it takes a list.
  claude_turn() {
    MSYS_NO_PATHCONV=1 SKILLATOR_QUOTA_REFRESH_WAIT= CLAUDE_CONFIG_DIR="$target_dir" claude -p 1 --model haiku --max-turns 1 \
      --no-session-persistence --strict-mcp-config --output-format stream-json --verbose --tools '' </dev/null
  }
  case $cli in
    agy)
      src_name=agy
      # B27: MSYS_NO_PATHCONV - Git Bash rewrites "/usage" to a path, a paid prompt.
      raw=$(MSYS_NO_PATHCONV=1 AGY_CONFIG_DIR="$target_dir" ANTIGRAVITY_APP_DATA_DIR="$target_dir" agy -p "/usage" --output-format json 2>/dev/null)
      if [ -n "$raw" ]; then
        if command -v node >/dev/null 2>&1; then
          parsed=$(node -e '
            try {
              const raw = JSON.parse(process.argv[1]);
              let h = null, w = null;
              const models = [];
              const groups = raw?.command?.data?.groups || [];
              for (const g of groups) {
                let gh = null, gw = null;
                for (const b of (g.buckets || [])) {
                  if (b && b.remaining_fraction != null) {
                    const f = Number(b.remaining_fraction);
                    if (Number.isFinite(f)) {
                      const used = Math.round((1.0 - f) * 1000) / 10;
                      const win = String(b.window || "");
                      if (/5h|hour/.test(win)) {
                        if (gh === null || used > gh) gh = used;
                      } else if (/week|7d/.test(win)) {
                        if (gw === null || used > gw) gw = used;
                      }
                    }
                  }
                }
                if (gh !== null && (h === null || gh > h)) h = gh;
                if (gw !== null && (w === null || gw > w)) w = gw;
                if (typeof g.name === "string" && (gh !== null || gw !== null)) {
                  const m = { name: g.name };
                  if (gh !== null) m["5h"] = gh;
                  if (gw !== null) m["7d"] = gw;
                  models.push(m);
                }
              }
              if (h !== null || w !== null) {
                const res = { src: "agy" };
                if (h !== null) res["5h"] = h;
                if (w !== null) res["7d"] = w;
                if (models.length) res.models = models;
                process.stdout.write(JSON.stringify(res));
              }
            } catch (_) {}
          ' "$raw" 2>/dev/null)
        elif command -v python3 >/dev/null 2>&1 || command -v python >/dev/null 2>&1; then
          py=$(command -v python3 || command -v python)
          parsed=$("$py" -c '
import sys, json
try:
    raw = json.loads(sys.argv[1])
    h = None; w = None; models = []
    for g in raw.get("command", {}).get("data", {}).get("groups", []):
        gh = None; gw = None
        for b in g.get("buckets", []):
            rf = b.get("remaining_fraction")
            if rf is not None:
                try:
                    f = float(rf)
                    used = round((1.0 - f) * 100, 1)
                    win = str(b.get("window", ""))
                    if "5h" in win or "hour" in win:
                        if gh is None or used > gh: gh = used
                    elif "week" in win or "7d" in win:
                        if gw is None or used > gw: gw = used
                except Exception:
                    pass
        if gh is not None and (h is None or gh > h): h = gh
        if gw is not None and (w is None or gw > w): w = gw
        if isinstance(g.get("name"), str) and (gh is not None or gw is not None):
            m = {"name": g["name"]}
            if gh is not None: m["5h"] = gh
            if gw is not None: m["7d"] = gw
            models.append(m)
    if h is not None or w is not None:
        res = {"src": "agy"}
        if h is not None: res["5h"] = h
        if w is not None: res["7d"] = w
        if models: res["models"] = models
        sys.stdout.write(json.dumps(res))
except Exception:
    pass
' "$raw" 2>/dev/null)
        fi
      fi
      ;;
    claude)
      src_name=claude-code
      # F176/B27: the get_usage control request on stdin, no prompt - no model turn.
      raw=$(capped 20 claude_get_usage)
      if [ -n "$raw" ] && command -v node >/dev/null 2>&1; then
        parsed=$(printf '%s' "$raw" | node -e '
          try {
            let r = null;
            for (const l of require("fs").readFileSync(0, "utf8").split(/\r?\n/)) {
              try { const m = JSON.parse(l); if (m?.type === "control_response" && m.response?.request_id === "u1") r = m.response.response; } catch (_) {}
            }
            if (!r) process.exit(0);
            // The installed CLI (2.1.x) answers false for API key / Bedrock / Vertex (or a
            // login without profile scope), and null limits when its usage fetch failed -
            // an expired login prints nothing else (the error goes to its debug log).
            if (r.rate_limits_available === false) { process.stdout.write("APIKEY"); process.exit(0); }
            if (!r.rate_limits) { process.stdout.write("NOAUTH"); process.exit(0); }
            const L = r.rate_limits;
            const n = v => typeof v?.utilization === "number" && Number.isFinite(v.utilization) ? Math.round(v.utilization * 10) / 10 : null;
            const res = { src: "claude-code" };
            if (n(L.five_hour) !== null) res["5h"] = n(L.five_hour);
            if (n(L.seven_day) !== null) res["7d"] = n(L.seven_day);
            const models = [];
            for (const [k, name] of [["seven_day_opus", "Opus"], ["seven_day_sonnet", "Sonnet"]]) if (n(L[k]) !== null) models.push({ name, "7d": n(L[k]) });
            for (const m of (Array.isArray(L.model_scoped) ? L.model_scoped : [])) if (typeof m?.display_name === "string" && n(m) !== null) models.push({ name: m.display_name, "7d": n(m) });
            if (models.length) res.models = models;
            if (res["5h"] != null || res["7d"] != null) process.stdout.write(JSON.stringify(res));
            else process.stdout.write("NOWINDOWS");
          } catch (_) {}
        ' 2>/dev/null)
      fi
      # F176 owner ruling: limits but no windows yet from get_usage -> a forced read (WAIT=1,
      # never the background spawn) of a logged-in profile spends ONE tiny turn and reads
      # its rate_limit_event - only while the last 7d known is under 90%. In doubt, no turn:
      # a corrupt or legacy cache is unknown; only no cache file at all, or a failure
      # record that carries `"last":null` (never a reading), counts as blank. A carried
      # reading counts for 7 days from its `at` (a reset is plausible after: unknown), and
      # a turn that gave no limits (`turned_at`) holds turns 24 h.
      if [ "$parsed" = NOWINDOWS ] && [ "${SKILLATOR_QUOTA_REFRESH_WAIT:-}" = 1 ] &&
         { [ -f "$target_dir/.credentials.json" ] || [ "$(uname -s)" = Darwin ]; } &&
         ! printf '%s' "$raw" | grep -qi 'session expired\|Failed to authenticate' &&
         node -e '
           const fs = require("fs"); let s;
           try { s = fs.readFileSync(process.argv[1], "utf8") } catch (e) { process.exit(e.code === "ENOENT" ? 0 : 1) }
           let r; try { r = JSON.parse(s.replace(/^﻿/, "")) } catch (_) { process.exit(1) }
           if (!r || typeof r !== "object" || Array.isArray(r)) process.exit(1);
           const now = Date.now() / 1000;
           if (Object.hasOwn(r, "turned_at") && !(typeof r.turned_at === "number" && now - r.turned_at >= 86400)) process.exit(1);
           const has = o => o && (Object.hasOwn(o, "7d") || Object.hasOwn(o, "weekly"));
           let o = r;
           if (!has(r)) {
             if (!Object.hasOwn(r, "last")) process.exit(1); if (r.last === null) process.exit(0); o = r.last; if (!has(o)) process.exit(1);
             if (!(typeof o.at === "number" && now - o.at < 7 * 86400)) process.exit(1)
           }
           const v = Object.hasOwn(o, "7d") ? o["7d"] : o.weekly;
           process.exit(typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 90 ? 0 : 1);
         ' "$cache" 2>/dev/null; then
        turn=$(capped 30 claude_turn)
        via=$(printf '%s' "$turn" | node -e '
            try {
              let u = null;
              for (const l of require("fs").readFileSync(0, "utf8").split(/\r?\n/)) {
                try { const m = JSON.parse(l); if (m?.type === "rate_limit_event" && m.rate_limit_info?.unifiedWindows) u = m.rate_limit_info.unifiedWindows; } catch (_) {}
              }
              const n = v => typeof v?.utilization === "number" && Number.isFinite(v.utilization) ? Math.round(v.utilization * 1000) / 10 : null;
              const res = { src: "claude-code" };
              if (u && n(u.five_hour) !== null) res["5h"] = n(u.five_hour);
              if (u && n(u.seven_day) !== null) res["7d"] = n(u.seven_day);
              res.via = "turn";
              if (res["5h"] != null || res["7d"] != null) process.stdout.write(JSON.stringify(res));
            } catch (_) {}
          ' 2>/dev/null)
        if [ -n "$via" ]; then parsed=$via; else turned=$(now_epoch); fi
      fi
      ;;
    muse)
      src_name=muse
      raw=$(MUSE_CONFIG_DIR="$target_dir" muse usage --json 2>&1)
      if [ -n "$raw" ] && ! case $raw in *[Nn]"ot logged in"*) true ;; *) false ;; esac; then
        if command -v node >/dev/null 2>&1; then
          parsed=$(node -e '
            try {
              const p = JSON.parse(process.argv[1]);
              const h = p && typeof p.five_hour === "number" && Number.isFinite(p.five_hour) ? p.five_hour : null;
              const w = p && typeof p.weekly === "number" && Number.isFinite(p.weekly) ? p.weekly : null;
              if (h !== null || w !== null) {
                const res = { src: "muse" };
                if (h !== null) res["5h"] = h;
                if (w !== null) res["7d"] = w;
                process.stdout.write(JSON.stringify(res));
              }
            } catch (_) {}
          ' "$raw" 2>/dev/null)
        fi
      fi
      ;;
  esac
  verdict=""
  case $parsed in APIKEY|NOAUTH|NOWINDOWS) verdict=$parsed; parsed="" ;; esac
  if [ -n "$parsed" ]; then
    printf '%s' "$parsed" > "$cache"
  else
    if case $raw in *[Nn]"ot logged in"*) true ;; *) false ;; esac; then
      fail_note="not logged in"
    elif [ "$cli" = claude ] && printf '%s' "$raw" | grep -qi 'session expired\|Failed to authenticate'; then
      fail_note="login expired - run claude /login"
    elif [ "$verdict" = NOAUTH ]; then
      fail_note="no usage reading - login may have expired, run claude /login"
    elif [ "$verdict" = APIKEY ]; then
      fail_note="no plan rate limits (API key or limited-scope login)"
    elif [ -n "$turned" ]; then
      fail_note="one turn gave no limits"
    elif [ "$verdict" = NOWINDOWS ]; then
      fail_note="no plan rate limits"
    elif [ -n "$(printf '%s' "$raw" | tr -d '[:space:]')" ]; then
      fail_note="unparseable"
    else
      fail_note="refresh failed"
    fi
    # F176: a failure record carries the last good readings (`last`: 5h, 7d and when),
    # so the turn gate never loses a high 7d; `"last":null` = no reading ever, while a
    # corrupt or legacy cache leaves `last` out (unknown). No node: unknown too. A turn that
    # gave no limits stamps `turned_at` (carried until a reading replaces the record).
    # A236: a reading written since this refresh started is current - kept (a turn's
    # `turned_at` stamped on it), never moved into last under a failure record.
    prev_failures=0; last_tag=""
    if command -v node >/dev/null 2>&1; then
      carry=$(node -e '
        const fs = require("fs"); let s, r; const T = process.argv[2], S = Number(process.argv[3]);
        // "<failures> <tail>": the tail carries "last" (undefined: left out) and "turned_at".
        const out = (f, last) => {
          const t = T ? T : r && Object.hasOwn(r, "turned_at") ? JSON.stringify(r.turned_at) : "";
          process.stdout.write(f + " " + (last === undefined ? "" : ",\"last\":" + JSON.stringify(last)) + (t ? ",\"turned_at\":" + t : "")); process.exit(0)
        };
        try { s = fs.readFileSync(process.argv[1], "utf8") } catch (e) { out(0, e.code === "ENOENT" ? null : undefined) }
        try { r = JSON.parse(s.replace(/^﻿/, "")) } catch (_) { out(0) }
        if (!r || typeof r !== "object" || Array.isArray(r)) { r = null; out(0) }
        const ok = v => typeof v === "number" && Number.isFinite(v);
        const h = ok(r["5h"]) ? r["5h"] : r.five, w = ok(r["7d"]) ? r["7d"] : r.weekly;
        // Strictly after the start: sub-second when S has a fraction, else a later whole second.
        const m = fs.statSync(process.argv[1]).mtimeMs / 1000;
        if ((ok(h) || ok(w)) && (process.argv[3].includes(".") ? m : Math.floor(m)) > S) {
          if (T) fs.writeFileSync(process.argv[1], JSON.stringify({ ...r, turned_at: Number(T) }));
          process.stdout.write("KEEP"); process.exit(0)
        }
        if (ok(h) || ok(w)) {
          const last = {};
          if (ok(h)) last["5h"] = h;
          if (ok(w)) last["7d"] = w;
          last.at = Math.floor(fs.statSync(process.argv[1]).mtimeMs / 1000);
          out(0, last)
        }
        const f = Number.isInteger(r.failures) && r.failures >= 1 ? r.failures : 0;
        out(f, Object.hasOwn(r, "last") ? r.last : undefined);
      ' "$cache" "$turned" "$started_at" 2>/dev/null)
      [ "$carry" != KEEP ] || { rm -f "$lock"; exit 0; }
      prev_failures=${carry%% *}
      case $carry in *" "*) last_tag=${carry#* } ;; esac
      case $prev_failures in ''|*[!0-9]*) prev_failures=0 ;; esac
    # A236: no node - a reading written strictly after the start is kept, as the node branch
    # keeps it (no turn runs without node, so no turned_at to stamp).
    elif [ -f "$cache" ] && sed 's/"last":{[^}]*}//' "$cache" 2>/dev/null | grep -q '"5h"\|"7d"' &&
         case $started_at in *.*) mt=$(date -r "$cache" +%s.%N 2>/dev/null) ;; *) mt=$(date -r "$cache" +%s 2>/dev/null) ;; esac &&
         awk -v m="$mt" -v s="$started_at" 'BEGIN { exit !(m ~ /^[0-9.]+$/ && m + 0 > s + 0) }'; then
      rm -f "$lock"; exit 0
    # A carried last is not a reading: its "7d" must not reset the counter.
    elif [ -f "$cache" ] && ! sed 's/"last":{[^}]*}//' "$cache" 2>/dev/null | grep -q '"5h"\|"7d"'; then
      pf=$(sed -n 's/.*"failures"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$cache" | head -1)
      case $pf in ''|*[!0-9]*) ;; *) prev_failures=$pf ;; esac
    fi
    failures=$((prev_failures + 1))
    backoff=60
    i=1
    while [ "$i" -lt "$failures" ] && [ "$backoff" -lt 900 ]; do
      backoff=$((backoff * 2))
      [ "$backoff" -gt 900 ] && backoff=900
      i=$((i + 1))
    done
    printf '{"src":"%s","note":"%s","failures":%d,"backoff_secs":%d%s}' "$src_name" "$fail_note" "$failures" "$backoff" "$last_tag" > "$cache"
  fi
  rm -f "$lock"
  exit 0
fi

# level (F31): one machine line for relay-morpheus's chain hold, and nothing
# else - no stdin, no .done, no threshold. Missing profile caches refresh asynchronously.
#   src=<claude-code|codex|none> 5h=<pct|-> 7d=<pct|-> ctx=<pct|-> max=<pct|->
# Same selected source as `check`. On Claude Code 5h is the probe's .fivehour flag (the
# statusline's rate_limits.five_hour.used_percentage); when that is absent, or
# older than the codex freshness window (3h), it prints '-'. max is the max of every window, context included, and is for
# reading only: relay's chain decide never holds on it (a full context is a
# compaction, not a quota) - with no 5h it falls back to 7d, else unobservable.
if [ "$mode" = level ]; then
  src=none; h=-; wk=-; cx=-; mx=-; note_tag=""
  roll=$selected_roll
  if [ -n "$roll" ]; then
    set -- $(codex_level "$roll")
    if [ "$#" = 3 ] && { [ "$1" != - ] || [ "$2" != - ] || [ "$3" != - ]; }; then
      src=codex; h=$1; wk=$2; cx=$3
      mx=$(printf '%s %s %s\n' "$h" "$wk" "$cx" | awk '{m=""; for(i=1;i<=NF;i++) if ($i!="-" && (m=="" || $i+0>m+0)) m=$i; print (m==""?"-":m)}')
    fi
  fi
  if [ "$src" = none ] && [ "$selected_host" = claude-code ] && [ -z "$source_error" ]; then
    # A130: this session's flags only, and every one inside the same freshness
    # window as a codex rollout: the statusline rewrites them on every render,
    # so an older one is a dead or idle session's - unobservable, not a
    # reading to hold on.
    key=$(flag_key)
    if [ -n "$key" ]; then
      src=claude-code
      v=$(read_fresh "$dir/$key");          [ -n "$v" ] && mx=$v
      v=$(read_fresh "$dir/$key.fivehour"); [ -n "$v" ] && h=$v
      v=$(read_fresh "$dir/$key.weekly");   [ -n "$v" ] && wk=$v
      v=$(read_fresh "$dir/$key.ctx");      [ -n "$v" ] && cx=$v
    fi
  fi
  if [ "$src" = none ]; then
    cache_data=$(read_cache)
    if [ -n "$cache_data" ]; then
      set -- $cache_data
      src=$1
      [ "$2" != "-" ] && h=$2
      [ "$3" != "-" ] && wk=$3
      [ "$4" != "-" ] && mx=$4
      [ -n "$5" ] && note_tag=" note=$5"
    elif [ -n "${SKILLATOR_CLI:-}" ] && [ -n "${SKILLATOR_PROFILE_DIR:-}" ] && [ -z "$source_error$codex_session${CLAUDE_CODE_SESSION_ID:-}" ]; then
      case $selected_host in
        claude-code) start_quota_refresh claude "$selected_profile" ;;
        agy|muse) start_quota_refresh "$selected_host" "$selected_profile" ;;
      esac
    fi
  fi
  [ -z "$source_error" ] || note_tag=" note=$source_error"
  echo "src=$src 5h=$h 7d=$wk ctx=$cx max=$mx$note_tag"
  exit 0
fi

# check: any host, no stdin. Reads whatever usage the host leaves on disk.
# ponytail: only Claude Code has a hook that can see the % AND inject at turn
# end. Elsewhere this is called from the always-on project file grayskull-power
# writes. cursor/antigravity expose nothing - say so, don't invent a number.
if [ "$mode" = check ]; then
  pct=""; wk=""; src=none; key=none
  # A32: recurse at any depth, and ignore a rollout older than the freshness
  # window - a week-old Codex session sitting at 98% must not make this fire on
  # a machine that is now running something else.
  # CODEX_HOME, same as install.sh - a relocated codex home must still be watched.
  roll=$selected_roll
  if [ -n "$roll" ]; then
    pct=$(codex_pct "$roll")
    wk=$(codex_wk_pct "$roll")
    if [ -n "$pct" ] || [ -n "$wk" ]; then src=codex; key=$(basename "$roll" .jsonl); fi
  fi
  if [ -z "$pct" ] && [ -z "$wk" ] && [ "$selected_host" = claude-code ] && [ -z "$source_error" ]; then
    # A130: this session's flags only (flag_key), each one read only while
    # fresh. `.weekly` is read by name, never picked by mtime (it is always
    # the newest, and would be compared against the wrong threshold); a
    # weekly flag with no main flag beside it still counts (A101).
    k=$(flag_key)
    if [ -n "$k" ]; then
      pct=$(read_fresh "$dir/$k"); wk=$(read_fresh "$dir/$k.weekly")
      if [ -n "$pct" ] || [ -n "$wk" ]; then src=claude-code; key=$k; fi
    fi
  fi
  if [ -z "$pct" ] && [ -z "$wk" ]; then
    cache_data=$(read_cache)
    if [ -n "$cache_data" ]; then
      set -- $cache_data
      src=$1
      [ "$2" != "-" ] && pct=$2
      [ "$3" != "-" ] && wk=$3
      if [ -n "$pct" ] || [ -n "$wk" ]; then key="$src-cache"; fi
    fi
  fi
  if [ -z "$pct" ] && [ -z "$wk" ] && [ "$selected_host" = cursor ] && [ -z "$source_error" ]; then
    if [ -n "${SKILLATOR_PROFILE_DIR:-}" ]; then clp=$selected_profile/cursor-ledger.json
    else clp=${CURSOR_LEDGER_PATH:-$selected_profile/cursor-ledger.json}; fi
    if [ -n "$clp" ]; then
      est=$(node -e '
        const fs = require("fs");
        try {
          const json = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
          const budget = json.budget_tokens ?? json.budget_cost ?? json.budget;
          if (!budget || budget <= 0) process.exit(1);
          const bDay = json.billing_day || 1;
          const now = process.env.SKILLATOR_NOW ? new Date(process.env.SKILLATOR_NOW) : new Date();
          let cYear = now.getUTCFullYear();
          let cMonth = now.getUTCMonth();
          if (now.getUTCDate() < bDay) { cMonth--; if (cMonth < 0) { cMonth = 11; cYear--; } }
          const maxDays = new Date(Date.UTC(cYear, cMonth + 1, 0)).getUTCDate();
          const cStart = new Date(Date.UTC(cYear, cMonth, Math.min(bDay, maxDays), 0, 0, 0));
          let tot = 0;
          for (const r of json.runs || []) {
            if (r.timestamp && new Date(r.timestamp) < cStart) continue;
            if (json.budget_cost) {
              tot += Number(r.cost ?? r.cost_usd ?? r.usage?.cost ?? r.usage?.cost_usd ?? 0);
            } else {
              tot += Number(r.tokens ?? r.usage?.total_tokens ?? (
                (r.usage?.inputTokens ?? r.usage?.prompt_tokens ?? 0) +
                (r.usage?.outputTokens ?? r.usage?.completion_tokens ?? 0) +
                (r.usage?.cacheReadTokens ?? 0) +
                (r.usage?.cacheWriteTokens ?? 0)
              ));
            }
          }
          console.log(Math.round((tot / budget) * 100));
        } catch { process.exit(1); }
      ' "$clp" 2>/dev/null)
      if [ -n "$est" ]; then
        echo "watch-cortana: cursor est $est% of budget (skillator runs only) - check cursor.com/settings"
        exit 0
      fi
    fi
  fi
  if [ -z "$pct" ] && [ -z "$wk" ]; then
    echo "watch-cortana: no usage signal on this host ($selected_host $source_error) - run skillator:handoff-cortana manually before you run out"; exit 0
  fi
  # The weekly gate applies on every host, not just the one with a Stop hook.
  # It has its own .done, so a 5-hour fire earlier in the session cannot eat
  # the weekly order when the 7-day window crosses hours later.
  if [ -n "$wk" ] && over_limit "$wk" "$wk_limit" && [ ! -f "$dir/$key.weekly.done" ]; then
    mkdir -p "$dir"; : > "$dir/$key.weekly.done"
    echo "HANDOFF NOW ($src 7-day $wk%)"
    printf 'Usage has reached %s%% of the limit (threshold %s%%). Stop the current work and preserve the session now - it can be cut off at any moment. In order: (1) if any subagent, workflow or background task is still running, wait for it or stop it and record what it had done - never leave in-flight agent work undescribed; (2) invoke skillator:tickets-zordon to sync TICKETS.md - sync statuses only, do NOT start working open tickets, usage is nearly gone: close what actually landed, mark what is half-done as in-progress, and file a ticket for anything discovered this session that has no ticket; (3) invoke skillator:handoff-cortana and write the document, whose status table must match TICKETS.md ticket-for-ticket and must list the in-flight agent work from step 1 with the exact prompt needed to resume it.%s Then tell the user where the file is and stop.
' "$wk" "$wk_limit" "$wk_step4"
  elif [ -n "$pct" ] && over_limit "$pct" "$limit" && [ ! -f "$dir/$key.done" ]; then
    mkdir -p "$dir"; : > "$dir/$key.done"
    echo "HANDOFF NOW ($src $pct%)"
    printf 'Usage has reached %s%% of the limit (threshold %s%%). Stop the current work and preserve the session now - it can be cut off at any moment. In order: (1) if any subagent, workflow or background task is still running, wait for it or stop it and record what it had done - never leave in-flight agent work undescribed; (2) invoke skillator:tickets-zordon to sync TICKETS.md - sync statuses only, do NOT start working open tickets, usage is nearly gone: close what actually landed, mark what is half-done as in-progress, and file a ticket for anything discovered this session that has no ticket; (3) invoke skillator:handoff-cortana and write the document, whose status table must match TICKETS.md ticket-for-ticket and must list the in-flight agent work from step 1 with the exact prompt needed to resume it.%s Then tell the user where the file is and stop.
' "$pct" "$limit" ""
  else
    echo "watch-cortana: $src ${pct:-$wk}% of $limit% - ok"
  fi
  exit 0
fi

raw=$(cat)
sid=$(printf '%s' "$raw" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
[ -n "$sid" ] || sid=unknown
flag="$dir/$sid"

if [ "$mode" = probe ]; then
  # ponytail: regex over the raw JSON instead of walking it - catches every
  # used_percentage (5h window, context window) whatever the shape. B31: not
  # the 7-day one, as on the codex path (A98) - it has its own 97% gate.
  max=$(printf '%s' "$raw" | sed 's/"seven_day"[[:space:]]*:[[:space:]]*{[^}]*}//g' | grep -o '"used_percentage"[[:space:]]*:[[:space:]]*[0-9.]*' \
        | grep -o '[0-9.]*$' | awk 'BEGIN{m=""} {if(m==""||$1+0>m+0)m=$1} END{if(m!="")print m}')
  [ -n "$max" ] && { mkdir -p "$dir"; printf '%s' "$max" > "$flag"; }
  # The weekly number needs its own file: the main flag is read as bare bytes
  # with no line endings (A12), so a second value cannot share it.
  wk=$(printf '%s' "$raw" | tr -d ' 	' | grep -o '"seven_day":{[^}]*"used_percentage":[0-9.]*' | grep -o '[0-9.]*$' | head -1)
  if [ -n "$wk" ]; then mkdir -p "$dir"; printf '%s' "$wk" > "$flag.weekly"
  else rm -f "$flag.weekly"; fi   # never let a stale weekly number outlive its payload
  # F31: the 5-hour window and the context on their own, for `level`. The key
  # is rate_limits.five_hour.used_percentage (verified against the statusline
  # docs, 2026-10-10); the main flag stays the max of every non-7-day window.
  for pair in five_hour:fivehour context_window:ctx; do
    v=$(printf '%s' "$raw" | tr -d ' 	' | grep -o "\"${pair%%:*}\":{[^}]*\"used_percentage\":[0-9.]*" | grep -o '[0-9.]*$' | head -1)
    if [ -n "$v" ]; then mkdir -p "$dir"; printf '%s' "$v" > "$flag.${pair#*:}"
    else rm -f "$flag.${pair#*:}"; fi
  done
  [ -n "$then_cmd" ] && printf '%s' "$raw" | sh -c "$then_cmd"
  exit 0
fi

case "$raw" in *'"stop_hook_active":true'*|*'"stop_hook_active": true'*) exit 0 ;; esac
# No early return on a missing main flag: the two flags are written
# independently, so "weekly recorded, max not" is a reachable state - and it is
# the one a broken probe leaves behind. Returning here made the 7-day hard stop
# unreachable in exactly the case it mattered most.
pct=$(read_pct "$flag")
wk=""
# A83: codex has no statusline, so no probe ever wrote a flag. Its Stop stdin
# carries transcript_path, which is this session's own rollout - read the usage
# from there. Only a rollout-*.jsonl counts: Claude Code's Stop also sends a
# transcript_path, and its flag is the probe's job, not this one's.
# A98: window_minutes 10080 is the 7-day window - codex_wk_pct reads it
# separately so it gets the same weekly gate as the Claude path below.
if [ -z "$pct" ] && [ ! -f "$flag.weekly" ]; then
  tp=$(printf '%s' "$raw" | grep -o '"transcript_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 \
       | sed 's/.*"\([^"]*\)"$/\1/; s#\\\\#/#g')
  case ${tp##*/} in
    rollout-*.jsonl)
      if [ -f "$tp" ]; then pct=$(codex_pct "$tp"); wk=$(codex_wk_pct "$tp"); fi ;;
  esac
fi
# Weekly first, and with its OWN one-shot marker. Sharing `$flag.done` meant a
# 5-hour fire at 10:00 silently ate the weekly order when the 7-day window
# crossed at 14:00 - the one window whose crossing the user has to answer.
[ -n "$wk" ] || wk=$(read_pct "$flag.weekly")
if [ -n "$wk" ] && over_limit "$wk" "$wk_limit" && [ ! -f "$flag.weekly.done" ]; then
  mkdir -p "$dir"; : > "$flag.weekly.done"
  printf '{"decision":"block","reason":"Usage has reached %s%% of the limit (threshold %s%%). Stop the current work and preserve the session now - it can be cut off at any moment. In order: (1) if any subagent, workflow or background task is still running, wait for it or stop it and record what it had done - never leave in-flight agent work undescribed; (2) invoke skillator:tickets-zordon to sync TICKETS.md - sync statuses only, do NOT start working open tickets, usage is nearly gone: close what actually landed, mark what is half-done as in-progress, and file a ticket for anything discovered this session that has no ticket; (3) invoke skillator:handoff-cortana and write the document, whose status table must match TICKETS.md ticket-for-ticket and must list the in-flight agent work from step 1 with the exact prompt needed to resume it.%s Then tell the user where the file is and stop."}' "$wk" "$wk_limit" "$wk_step4"
  exit 0
fi
[ -f "$flag.done" ] && exit 0
[ -n "$pct" ] || exit 0
over_limit "$pct" "$limit" || exit 0
mkdir -p "$dir"; : > "$flag.done"
printf '{"decision":"block","reason":"Usage has reached %s%% of the limit (threshold %s%%). Stop the current work and preserve the session now - it can be cut off at any moment. In order: (1) if any subagent, workflow or background task is still running, wait for it or stop it and record what it had done - never leave in-flight agent work undescribed; (2) invoke skillator:tickets-zordon to sync TICKETS.md - sync statuses only, do NOT start working open tickets, usage is nearly gone: close what actually landed, mark what is half-done as in-progress, and file a ticket for anything discovered this session that has no ticket; (3) invoke skillator:handoff-cortana and write the document, whose status table must match TICKETS.md ticket-for-ticket and must list the in-flight agent work from step 1 with the exact prompt needed to resume it. Then tell the user where the file is and stop."}' "$pct" "$limit"
