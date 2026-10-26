#!/bin/sh
# build-jarvis grade gate (A119) - Claude Code `PreToolUse` on Agent|Task|Write|Edit|MultiEdit|NotebookEdit.
#
#   grade-gate.sh                    hook: the event JSON on stdin; denies the tool
#                                    call while build-jarvis is loaded and no
#                                    `grade:` line has been printed as reply text
#                                    since. Prints nothing otherwise. Exits 0.
#   grade-gate.sh check <transcript> prints `deny` or `-` for a transcript file
#   grade-gate.sh selftest           prints `ok`, or dies
#
# Why: the route hook and Step 0.7 say "grade line first"; direct prompts still
# narrated and spent first (A119: 0/6, then 1/2). A text instruction is read
# past; a denied tool call is not. The transcript (JSONL) is the record: the
# last assistant Skill call naming build-jarvis, then any assistant text block
# with a line starting `grade:` after it. Thinking blocks and the skill body
# (a user line) do not count. Any read problem allows - it never blocks on a
# fault of its own.
# Mirror: grade-gate.ps1 - same rule, same output bytes.
# Install: ../references/route-hook.md.

REASON='skillator grade gate (build-jarvis Step 0.7): print your one grade: line as reply text first - a line starting grade: that the user sees, not in thinking - then make this call again. If you already printed it in this message, just retry.'

# check <file>: `deny` when the last build-jarvis load has no grade text after it.
check() {
  [ -f "$1" ] || { echo -; return; }
  awk '
    /"type": ?"assistant"/ && /"name": ?"Skill"/ && /"skill": ?"[^"]*build-jarvis"/ { loaded = 1; graded = 0; next }
    loaded && /"type": ?"assistant"/ && /"type": ?"text", ?"text": ?"(([^"\\]|\\.)*\\n)?grade:/ { graded = 1 }
    END { print (loaded && !graded) ? "deny" : "-" }
  ' "$1" 2>/dev/null || echo -
}

# The top-level "transcript_path" string, no jq. JSON escapes in a Windows path
# are `\\`; `\/` is a slash.
path_of() {
  tr -d '\r\n' | grep -o '"transcript_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 \
    | sed 's/^"transcript_path"[[:space:]]*:[[:space:]]*"//; s/"$//; s#\\/#/#g; s#\\\\#/#g'
}

json_out() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}' "$REASON"
}

hook() {
  p=$(path_of)
  [ -n "$p" ] || exit 0
  [ "$(check "$p")" = deny ] && printf '%s\n' "$(json_out)"
  exit 0
}

die() { echo "FAIL: $1" >&2; exit 1; }

selftest() {
  d=$(mktemp -d) || die "mktemp"
  trap 'rm -rf "$d"' EXIT
  load='{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Skill","input":{"skill":"skillator:build-jarvis"}}]}}'
  body='{"type":"user","message":{"content":[{"type":"text","text":"grade: bounded - the skill body example"}]}}'
  think='{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"grade: bounded"}]}}'
  narr='{"type":"assistant","message":{"content":[{"type":"text","text":"Let me look at the code first."}]}}'
  first='{"type":"assistant","message":{"content":[{"type":"text","text":"grade: bounded \u00b7 critical no"}]}}'
  later='{"type":"assistant","message":{"content":[{"type":"text","text":"Loaded.\ngrade: small \u00b7 critical no"}]}}'
  quoted='{"type":"assistant","message":{"content":[{"type":"text","text":"say \"x\" grade: later"}]}}'
  decoy='{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Send","input":{"text":"grade: fake"}}]}}'
  other='{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Skill","input":{"skill":"skillator:tickets-zordon"}}]}}'
  t() { printf '%s\n' "$@" > "$d/t.jsonl"; check "$d/t.jsonl"; }
  [ "$(t "$other" "$narr")" = - ] || die "no build-jarvis load must allow"
  [ "$(t "$load" "$body")" = deny ] || die "the skill body's example grade line counted"
  [ "$(t "$load" "$body" "$think")" = deny ] || die "a grade in thinking counted"
  [ "$(t "$load" "$body" "$narr")" = deny ] || die "narration counted as the grade"
  [ "$(t "$load" "$body" "$quoted")" = deny ] || die "grade: mid-line counted"
  [ "$(t "$load" "$body" "$decoy")" = deny ] || die "a tool input text field counted"
  [ "$(t "$load" "$body" "$first")" = - ] || die "a first-line grade did not allow"
  [ "$(t "$load" "$body" "$later")" = - ] || die "a grade on a later line did not allow"
  [ "$(t "$load" "$first" "$load" "$narr")" = deny ] || die "a reload did not reset the grade"
  [ "$(check "$d/missing.jsonl")" = - ] || die "a missing transcript must allow"
  h="$0"
  t "$load" "$narr" > /dev/null
  wp=$(printf '%s' "$d/t.jsonl" | sed 's#/#\\\\#g')
  out=$(printf '{"session_id":"s","transcript_path":"%s","tool_name":"Write"}' "$wp" | sh "$h")
  [ "$out" = "$(json_out)" ] || die "hook: a backslash path did not deny"
  out=$(printf '{"transcript_path":"%s","tool_name":"Agent"}' "$d/t.jsonl" | sh "$h")
  [ "$out" = "$(json_out)" ] || die "hook: a slash path did not deny"
  t "$load" "$first" > /dev/null
  out=$(printf '{"transcript_path":"%s"}' "$d/t.jsonl" | sh "$h")
  [ -z "$out" ] || die "hook: a graded session printed something"
  out=$(printf 'not json' | sh "$h"); rc=$?
  [ "$rc" = 0 ] && [ -z "$out" ] || die "hook: bad stdin must print nothing and exit 0"
  case $REASON in *'"'*|*'\'*) die 'REASON holds a quote or backslash - it would break the JSON' ;; esac
  if LC_ALL=C grep -q "$(printf '[\200-\377]')" "$h"; then die "non-ASCII byte in $h"; fi
  if grep -q "$(printf '\r')" "$h"; then die "CR in $h"; fi
  echo ok
}

case "${1:-}" in
  '') hook ;;
  check) check "${2:-}" ;;
  selftest) selftest ;;
  *) echo "usage: grade-gate.sh [check <transcript> | selftest]" >&2; exit 2 ;;
esac
