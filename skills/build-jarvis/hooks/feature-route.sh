#!/bin/sh
# build-jarvis route hook (F39) - Claude Code `UserPromptSubmit`.
#
#   feature-route.sh             hook: the event JSON on stdin; prints the route as
#                                UserPromptSubmit additionalContext JSON when the
#                                prompt reads as a feature, else nothing. Always
#                                exits 0 - it never blocks a prompt.
#   feature-route.sh classify T  prints `feature` or `-` for the text T
#   feature-route.sh selftest    prints `ok`, or dies
#
# Claude Code adds hookSpecificOutput.additionalContext to the turn as its own
# context block. Plain stdout also lands, but prefixed "UserPromptSubmit hook
# success:", which a probe model read past (2026-10-15). ROUTE holds no quote
# or backslash, so it needs no JSON escaping (selftest checks). It is a nudge, not a gate:
# the description of skillator:build-jarvis does the routing; this covers the
# turns where a neighbour (superpowers:brainstorming, no skill at all) would win.
# Mirror: feature-route.ps1 - same patterns, same output bytes.
# Install: ../references/route-hook.md.

ROUTE='skillator route (build-jarvis hook): this prompt is a feature request. Your first action is the Skill tool with skill skillator:build-jarvis - before reading code, designing or editing anything, whatever the size - except when TICKETS.md has no F ticket for it yet: then log one with skillator:tickets-zordon first, and load build-jarvis right after. It includes the design step, so do not also run superpowers:brainstorming or another build-* skill. Once build-jarvis has loaded, your first reply text - before the design-file Write and before any Agent call - is its one grade: line (Step 0.7), printed as text the user sees - the same line then opens the design file and every Agent prompt, a design agent included - not kept in thinking or saved for the final report. Not a feature after all (a bug, a question, a typo, comment, rename or formatting edit)? Ignore this.'

# Feature-shaped: a feature being logged, a build verb opening a sentence or a
# request, or an F ticket being worked (verb opening the sentence, then an id of
# the board's shape: F12, F2a). Vetoed first - unless the prompt logs a feature -
# by a git chore in imperative position, failure phrasing, or adding tests. A
# bare noun (error handling, push notifications, a deploy button) never vetoes.
# A newline is a sentence break.
S='(^|[.!?:;] )'
P_LOG='((log|file|open|raise|add) (a |an |the )?(new )?feature|feature request)'
P_TICKET="$S"'(please |(can|could|would|will) you (please )?|let.?s )?(work|do|build|implement|ship|start|finish|pick up|take|continue|resume)[^a-z0-9.?!]([^.?!]*[^a-z0-9])?f[0-9]+[a-z]?([^a-z0-9]|$)'
P_VERB="$S"'(please )?(add|build|implement|create|introduce|support|extend|develop|wire up|allow) '
P_ASK='((can|could|would|will) you (please )?(add|build|implement|create|introduce|support|extend|develop) |(i|we)[^ ]* (would )?(like|want|need) (you )?(to )?(add|build|implement|create|support) )'
P_VETO="$S"'(please )?((commit|push|merge|rebase|deploy|release|revert|cherry-pick|squash|tag)([^a-z]|$)|(create|open|make|cut|delete|rename|check out|checkout|switch to) (a |an |the |new |this |that |my )*(branch|pull request|pr|tag|release)([^a-z ]|$| (for|from|to|on|off)([^a-z]|$)))'
P_FAIL='(^|[^a-z])(broken|fails|failed|failing|crashes|crashed|crashing|regressed|erroring|errors out|throws|not working|stopped working|doesn.?t work|does not work|bug (in|with|where|when))([^a-z]|$)'
P_TEST='(add|write|create) (a |an |some |more |the )?(unit |integration |regression )?tests?([^a-z]|$)'

classify() {
  t=$(printf '%s' "$1" | tr 'A-Z\t\r' 'a-z  ' \
    | awk '{ printf "%s%s", (NR > 1 ? ". " : ""), $0 }' | tr -s ' ')
  if printf '%s' "$t" | grep -Eq "$P_LOG"; then echo feature; return; fi
  if printf '%s' "$t" | grep -Eq "$P_VETO|$P_FAIL|$P_TEST"; then echo -; return; fi
  if printf '%s' "$t" | grep -Eq "$P_TICKET|$P_VERB|$P_ASK"; then echo feature; return; fi
  echo -
}

# The TOP-LEVEL "prompt" string out of the event JSON with no jq - the same
# value as the ps1 twin's ConvertFrom-Json .prompt. A string at depth 1 after
# `{` or `,` is a key; one after `:` is that key's value. Escapes: \n is a
# newline, \/ a slash, \u000a a newline, every other escape a space (the ps1
# twin blanks quotes and backslashes too).
prompt_of() {
  awk '{ s = s $0 "\n" }
  END {
    n = length(s); i = 1; d = 0; prev = ""; key = ""
    while (i <= n) {
      c = substr(s, i, 1)
      if (c != "\"") {
        if (c == "{" || c == "[") d++
        else if (c == "}" || c == "]") d--
        if (c !~ /[ \t\r\n]/) prev = c
        i++; continue
      }
      v = ""; i++
      while (i <= n) {
        c = substr(s, i, 1)
        if (c == "\"") break
        if (c == "\\") {
          e = substr(s, i + 1, 1); i += 2
          if (e == "n") v = v "\n"
          else if (e == "/") v = v "/"
          else if (e == "u") { h = tolower(substr(s, i, 4)); i += 4; v = v (h == "000a" ? "\n" : " ") }
          else v = v " "
          continue
        }
        v = v c; i++
      }
      i++
      if (d == 1 && (prev == "{" || prev == ",")) key = v
      else if (d == 1 && prev == ":" && key == "prompt") { printf "%s", v; exit }
      prev = "s"
    }
  }'
}

hook() {
  p=$(prompt_of)
  [ -n "$p" ] || exit 0
  [ "$(classify "$p")" = feature ] && printf '%s\n' "$(json_out)"
  exit 0
}

json_out() {
  printf '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"%s"}}' "$ROUTE"
}

die() { echo "FAIL: $1" >&2; exit 1; }

selftest() {
  while IFS='|' read -r want text; do
    [ -n "$text" ] || continue
    got=$(classify "$text")
    [ "$got" = "$want" ] || die "classify '$text': want $want, got $got"
  done <<'EOF'
feature|add CSV export to the shelf app
feature|Add lending to shelf: a member can check a book out and return it.
feature|Log a feature: `python -m shelf list` should print every book sorted by author. Then work it.
feature|Log a feature for a `--json` flag on find, and work it.
feature|Work these tickets: F2 and F3. Run it through to the end.
feature|Work ticket F4 to done.
feature|Please implement dark mode for the dashboard
feature|can you build an import flow for the CSV files?
feature|I'd like to add a --json flag on find
feature|We need to support webhooks. Start with the signing secret.
feature|add error handling to the upload API
feature|support push notifications
feature|build a deploy button
feature|add release notes page
-|fix the failing login test
-|commit this and open a pull request
-|what does report.py do?
-|the build is broken on main
-|add tests for the crash in B3
-|Add a regression test for B2
-|create a branch for the release
-|why is find case-sensitive?
-|F2 looks done to me, is it?
-|push it
-|merge the branch
-|the build is failing
-|commit this
-|deploy to prod
-|why does the F3 export crash?
-|undo the F2 change
-|how do I refresh, F5?
-|Work F3: the export crashes on empty input
EOF
  [ "$(classify "$(printf 'fix it\nadd a flag')")" = feature ] || die "classify: a newline is not a sentence break"
  h="$0"
  out=$(printf '%s' '{"session_id":"s1","cwd":"C:/work/build-tools","prompt":"Please add a \"--json\" flag\nto find","hook_event_name":"UserPromptSubmit"}' | sh "$h")
  [ "$out" = "$(json_out)" ] || die "hook: feature prompt did not print the route JSON"
  case $ROUTE in *'"'*|*'\'*) die 'ROUTE holds a quote or backslash - it would break the JSON' ;; esac
  case $ROUTE in *'first reply text - before the design-file Write and before any Agent call - is its one grade: line'*) ;;
    *) die 'ROUTE lost the grade-line-first order (A119)' ;; esac
  case $ROUTE in *'opens the design file and every Agent prompt, a design agent included'*) ;;
    *) die 'ROUTE lost the grade line as the first line of every spend (A119)' ;; esac
  out=$(printf '%s' '{"session_id":"s1","cwd":"C:/add/build","prompt":"what does report.py do?","hook_event_name":"UserPromptSubmit"}' | sh "$h")
  [ -z "$out" ] || die "hook: a question printed something (cwd words leaked into the match?)"
  out=$(printf '%s' '{"prompt":"say \"add a button\" back to me \\ please"}' | sh "$h")
  [ -z "$out" ] || die "hook: a quoted verb mid-sentence matched"
  out=$(printf '%s' '{"prompt":"say hi","extra":{"prompt":"add a flag"}}' | sh "$h")
  [ -z "$out" ] || die "hook: a nested prompt key was read instead of the top-level one"
  out=$(printf '%s' '{"prompt":"fix it\nadd a flag"}' | sh "$h")
  [ "$out" = "$(json_out)" ] || die "hook: an escaped newline is not a sentence break"
  out=$(printf '%s' 'not json at all' | sh "$h"); rc=$?
  [ "$rc" = 0 ] && [ -z "$out" ] || die "hook: bad stdin must print nothing and exit 0"
  out=$(printf '' | sh "$h"); rc=$?
  [ "$rc" = 0 ] && [ -z "$out" ] || die "hook: empty stdin must print nothing and exit 0"
  if LC_ALL=C grep -q "$(printf '[\200-\377]')" "$h"; then die "non-ASCII byte in $h"; fi
  if grep -q "$(printf '\r')" "$h"; then die "CR in $h"; fi
  echo ok
}

case "${1:-}" in
  '') hook ;;
  classify) shift; classify "$*" ;;
  selftest) selftest ;;
  *) echo "usage: feature-route.sh [classify <text> | selftest]" >&2; exit 2 ;;
esac
