#!/bin/sh
# Local verification driver; never moves live profile or instruction files.
set -u
PATH=/usr/bin:$PATH
export PATH
work=$1
base=$2
id=$3
scenario=$4
harness="$work/plugin/practice/scripts/baseline-harness.sh"
cd "$base/fixtures/$id" || exit 1
prompt=$(sh "$harness" scenario "$scenario") || exit 1
case "$prompt" in *clone-odo*) echo 'scenario names skill explicitly' >&2; exit 1 ;; esac
BASELINE_ISOLATE=off sh "$harness" run 900 "$base/prefix" \
  claude -p "$prompt" --model sonnet \
  --plugin-dir "$base/prefix" --add-dir "$base/prefix" \
  --setting-sources '' --settings "$base/settings.json" \
  --strict-mcp-config --mcp-config "$base/empty-mcp.json" \
  --permission-mode acceptEdits --no-session-persistence \
  --output-format stream-json --verbose \
  > "$base/logs/$id.jsonl" 2> "$base/logs/$id.err"
rc=$?
printf '%s\n' "$rc" > "$base/logs/$id.exit"
exit "$rc"
