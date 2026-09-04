#!/bin/sh
# handoff-watch: record usage % from the statusline, act on it at the Stop hook.
#   usage-watch.sh probe ["<original statusline command>"]   (statusLine command)
#   usage-watch.sh gate                                      (Stop hook)
#   usage-watch.sh check                                     (any host, no stdin)
# Threshold: $CLAUDE_USAGE_HANDOFF_PCT, default 92.
mode="${1:-probe}"; then_cmd="$2"
dir="$HOME/.claude/handoff-watch"
limit="${CLAUDE_USAGE_HANDOFF_PCT:-92}"

# The flag file is shared with the PowerShell twin, which used to write it with
# a UTF-8 BOM and CRLF. A BOM makes awk string-compare (0xEF > '9'), so "12.0"
# read as ">= 92" and the one-shot handoff was burned at 12%. Take the first
# numeric token in the file and nothing else: no BOM, CR or stray space survives.
read_pct() {
  [ -f "$1" ] || return 0
  awk '{ if (match($0, /[0-9]+([.][0-9]+)?/)) { print substr($0, RSTART, RLENGTH); exit } }' "$1"
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
# other name Windows steals - `probe` does use it, but Windows wires the .ps1
# probe, never this one, so that path is never taken there.)
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

# Newest rollout under $1, but ONLY if it was written inside the freshness
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
      if (t > m) { m = t; p = $0 } }
    END { if (p != "" && now - m < w) print p }'
}

# check: any host, no stdin. Reads whatever usage the host leaves on disk.
# ponytail: only Claude Code has a hook that can see the % AND inject at turn
# end. Elsewhere this is called from the always-on project file grayskull-power
# writes. cursor/antigravity expose nothing - say so, don't invent a number.
if [ "$mode" = check ]; then
  pct=""; src=none; key=none
  # A32: recurse at any depth, and ignore a rollout older than the freshness
  # window - a week-old Codex session sitting at 98% must not make this fire on
  # a machine that is now running something else.
  # CODEX_HOME, same as install.sh - a relocated codex home must still be watched.
  roll=$(codex_newest_fresh "${CODEX_HOME:-$HOME/.codex}/sessions")
  if [ -n "$roll" ]; then
    line=$(tail -400 "$roll" | grep '"token_count"' | tail -1)
    if [ -n "$line" ]; then
      # last_token_usage is the live context; total_token_usage is cumulative
      # for the session and would read well over 100%.
      pct=$(printf '%s' "$line" | awk '
        match($0,/"last_token_usage":\{[^}]*"total_tokens":[0-9]+/){
          t=substr($0,RSTART,RLENGTH); sub(/.*"total_tokens":/,"",t) }
        match($0,/"model_context_window":[0-9]+/){
          w=substr($0,RSTART,RLENGTH); sub(/.*:/,"",w) }
        { m=0; s=$0
          while (match(s,/"used_percent":[0-9.]+/)) {
            v=substr(s,RSTART,RLENGTH); sub(/.*:/,"",v); if (v+0>m) m=v+0
            s=substr(s,RSTART+RLENGTH) } }
        END { if (w+0>0 && t+0>0) { c=100*t/w; if (c>m) m=c }
              if (m>0) printf "%.1f", m }')
      [ -n "$pct" ] && { src=codex; key=$(basename "$roll" .jsonl); }
    fi
  fi
  if [ -z "$pct" ]; then
    f=$(ls -t "$dir" 2>/dev/null | grep -v '\.done$' | head -1)
    [ -n "$f" ] && pct=$(read_pct "$dir/$f")
    [ -n "$pct" ] && { src=claude-code; key=$f; }
  fi
  if [ -z "$pct" ]; then
    echo "handoff-watch: no usage signal on this host - run skillator:handoff manually before you run out"; exit 0
  fi
  if over_limit "$pct" "$limit" && [ ! -f "$dir/$key.done" ]; then
    mkdir -p "$dir"; : > "$dir/$key.done"
    echo "HANDOFF NOW ($src $pct%)"
    printf 'Usage has reached %s%% of the limit (threshold %s%%). Stop the current work and preserve the session now - it can be cut off at any moment. In order: (1) if any subagent, workflow or background task is still running, wait for it or stop it and record what it had done - never leave in-flight agent work undescribed; (2) invoke skillator:ticket-master to sync TICKETS.md - sync statuses only, do NOT start working open tickets, usage is nearly gone: close what actually landed, mark what is half-done as in-progress, and file a ticket for anything discovered this session that has no ticket; (3) invoke skillator:handoff and write the document, whose status table must match TICKETS.md ticket-for-ticket and must list the in-flight agent work from step 1 with the exact prompt needed to resume it. Then tell the user where the file is and stop.
' "$pct" "$limit"
  else
    echo "handoff-watch: $src $pct% of $limit% - ok"
  fi
  exit 0
fi

raw=$(cat)
sid=$(printf '%s' "$raw" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
[ -n "$sid" ] || sid=unknown
flag="$dir/$sid"

if [ "$mode" = probe ]; then
  # ponytail: regex over the raw JSON instead of walking it - catches every
  # used_percentage (5h window, 7d window, context window) whatever the shape.
  max=$(printf '%s' "$raw" | grep -o '"used_percentage"[[:space:]]*:[[:space:]]*[0-9.]*' \
        | grep -o '[0-9.]*$' | sort -g | tail -1)
  [ -n "$max" ] && { mkdir -p "$dir"; printf '%s' "$max" > "$flag"; }
  [ -n "$then_cmd" ] && printf '%s' "$raw" | sh -c "$then_cmd"
  exit 0
fi

case "$raw" in *'"stop_hook_active":true'*|*'"stop_hook_active": true'*) exit 0 ;; esac
[ -f "$flag" ] || exit 0
pct=$(read_pct "$flag"); [ -n "$pct" ] || exit 0
[ -f "$flag.done" ] && exit 0
over_limit "$pct" "$limit" || exit 0
: > "$flag.done"
printf '{"decision":"block","reason":"Usage has reached %s%% of the limit (threshold %s%%). Stop the current work and preserve the session now - it can be cut off at any moment. In order: (1) if any subagent, workflow or background task is still running, wait for it or stop it and record what it had done - never leave in-flight agent work undescribed; (2) invoke skillator:ticket-master to sync TICKETS.md - sync statuses only, do NOT start working open tickets, usage is nearly gone: close what actually landed, mark what is half-done as in-progress, and file a ticket for anything discovered this session that has no ticket; (3) invoke skillator:handoff and write the document, whose status table must match TICKETS.md ticket-for-ticket and must list the in-flight agent work from step 1 with the exact prompt needed to resume it. Then tell the user where the file is and stop."}' "$pct" "$limit"
