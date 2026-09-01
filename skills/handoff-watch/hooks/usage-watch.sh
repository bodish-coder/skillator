#!/bin/sh
# handoff-watch: record usage % from the statusline, act on it at the Stop hook.
#   usage-watch.sh probe ["<original statusline command>"]   (statusLine command)
#   usage-watch.sh gate                                      (Stop hook)
# Threshold: $CLAUDE_USAGE_HANDOFF_PCT, default 97.
mode="${1:-probe}"; then_cmd="$2"
raw=$(cat)
sid=$(printf '%s' "$raw" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
[ -n "$sid" ] || sid=unknown
dir="$HOME/.claude/handoff-watch"; flag="$dir/$sid"
limit="${CLAUDE_USAGE_HANDOFF_PCT:-97}"

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
