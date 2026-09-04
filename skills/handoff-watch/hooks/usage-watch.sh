#!/bin/sh
# handoff-watch: record usage % from the statusline, act on it at the Stop hook.
#   usage-watch.sh probe ["<original statusline command>"]   (statusLine command)
#   usage-watch.sh gate                                      (Stop hook)
#   usage-watch.sh check                                     (any host, no stdin)
# Threshold: $CLAUDE_USAGE_HANDOFF_PCT, default 97.
mode="${1:-probe}"; then_cmd="$2"
dir="$HOME/.claude/handoff-watch"
limit="${CLAUDE_USAGE_HANDOFF_PCT:-97}"

# check: any host, no stdin. Reads whatever usage the host leaves on disk.
# ponytail: only Claude Code has a hook that can see the % AND inject at turn
# end. Elsewhere this is called from the always-on project file grayskull-power
# writes. cursor/antigravity expose nothing - say so, don't invent a number.
if [ "$mode" = check ]; then
  pct=""; src=none; key=none
  roll=$(ls -t "$HOME"/.codex/sessions/*/*/*/rollout-*.jsonl 2>/dev/null | head -1)
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
    [ -n "$f" ] && { pct=$(cat "$dir/$f"); src=claude-code; key=$f; }
  fi
  if [ -z "$pct" ]; then
    echo "handoff-watch: no usage signal on this host - run skillator:handoff manually before you run out"; exit 0
  fi
  if [ "$(awk -v a="$pct" -v b="$limit" 'BEGIN{print (a>=b)}')" = 1 ] && [ ! -f "$dir/$key.done" ]; then
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
pct=$(cat "$flag"); [ -f "$flag.done" ] && exit 0
[ "$(awk -v a="$pct" -v b="$limit" 'BEGIN{print (a>=b)}')" = 1 ] || exit 0
: > "$flag.done"
printf '{"decision":"block","reason":"Usage has reached %s%% of the limit (threshold %s%%). Stop the current work and preserve the session now - it can be cut off at any moment. In order: (1) if any subagent, workflow or background task is still running, wait for it or stop it and record what it had done - never leave in-flight agent work undescribed; (2) invoke skillator:ticket-master to sync TICKETS.md - sync statuses only, do NOT start working open tickets, usage is nearly gone: close what actually landed, mark what is half-done as in-progress, and file a ticket for anything discovered this session that has no ticket; (3) invoke skillator:handoff and write the document, whose status table must match TICKETS.md ticket-for-ticket and must list the in-flight agent work from step 1 with the exact prompt needed to resume it. Then tell the user where the file is and stop."}' "$pct" "$limit"
