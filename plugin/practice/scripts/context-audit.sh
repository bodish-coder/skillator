#!/bin/sh
# The per-turn context ledger. Everything below is paid on EVERY prompt of every
# session, forever - unlike a skill body, which is paid once inside the task that
# needed it. Habits like /clear, fresh sessions and batching are user-side and
# unmeasurable from here; this measures only what a repo can actually fix.
#
#   sh practice/scripts/context-audit.sh [repo-root] [payload-root]
#
# Budgets are skill-prometheus section 7: always-on file 200 words, router skill 800,
# description ~80. Exit 1 if anything is over, so it works as a pre-commit gate.
#
# NOT yet wired in as one, deliberately: this repo is over on five counts today
# (A72), so adopting it as a gate now would block every commit. Run it by hand
# until A72 closes, then wire it.
set -e
mode=${1:-}
case "$mode" in
  selftest|--selftest) mode=selftest; shift ;;
  *) mode="" ;;
esac

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if [ -d "$here/../../skills" ]; then
  default_payload=$(CDPATH= cd -- "$here/../.." && pwd)
elif [ -d "$here/../skills" ]; then
  default_payload=$(CDPATH= cd -- "$here/.." && pwd)
else
  default_payload=$(CDPATH= cd -- "$here/../.." && pwd)
fi

if [ -f "$default_payload/../CLAUDE.md" ] || [ -f "$default_payload/../AGENTS.md" ] || [ -f "$default_payload/../GEMINI.md" ] || [ -d "$default_payload/../.git" ]; then
  default_repo=$(CDPATH= cd -- "$default_payload/.." && pwd)
elif [ -f "$PWD/CLAUDE.md" ] || [ -f "$PWD/AGENTS.md" ] || [ -f "$PWD/GEMINI.md" ] || [ -d "$PWD/.git" ]; then
  default_repo=$PWD
else
  default_repo=$default_payload
fi

if [ $# -ge 2 ]; then
  repo_root=$1
  payload_root=$2
elif [ $# -eq 1 ]; then
  arg1=$1
  if [ -d "$arg1/plugin/skills" ]; then
    repo_root=$arg1
    payload_root="$arg1/plugin"
  elif [ -d "$arg1/skills" ] && { [ -f "$arg1/../CLAUDE.md" ] || [ -f "$arg1/../AGENTS.md" ] || [ -f "$arg1/../GEMINI.md" ] || [ -d "$arg1/../.git" ]; }; then
    repo_root=$(CDPATH= cd -- "$arg1/.." && pwd)
    payload_root=$arg1
  elif [ -d "$arg1/skills" ]; then
    repo_root=$arg1
    payload_root=$arg1
  else
    repo_root=$arg1
    payload_root=$default_payload
  fi
else
  repo_root=$default_repo
  payload_root=$default_payload
fi

[ -d "$repo_root" ] || { echo "FAIL: no such dir $repo_root" >&2; exit 2; }
[ -d "$payload_root" ] || { echo "FAIL: no such dir $payload_root" >&2; exit 2; }
repo_root=$(CDPATH= cd -- "$repo_root" && pwd)
payload_root=$(CDPATH= cd -- "$payload_root" && pwd)

fail=0
note() { echo "  OVER  $1"; fail=1; }

# An always-on file's real cost is itself PLUS everything its @-includes pull in.
# A 1-word CLAUDE.md that reads `@.skillator/grayskull.md` is not a 1-word file.
#
# Two things this gets wrong if written the obvious way, both found by review:
#   - `@path` is resolved inline in prose, not only on a line of its own. A
#     CLAUDE.md reading "See @sub/big.md for the rules." pulls in the whole file.
#   - A nested `@` resolves against the file that CONTAINS it, not the repo root.
# Getting either wrong makes the gate pass green on the exact case it exists for.
expand() {
  f=$1; depth=${2:-0}
  [ -f "$f" ] || return 0
  [ "$depth" -gt 4 ] && return 0
  cat "$f"
  base=$(dirname -- "$f")
  grep -o '@[^ 	]*' "$f" 2>/dev/null | sed 's/^@//; s/[.,;:)]*$//' | while read -r inc; do
    [ -n "$inc" ] || continue
    case $inc in */*|*.md) ;; *) continue ;; esac   # skip @mentions, keep paths
    if [ -f "$base/$inc" ]; then
      expand "$base/$inc" $((depth + 1))
    elif [ -f "$repo_root/$inc" ]; then
      expand "$repo_root/$inc" $((depth + 1))
    elif [ -f "$payload_root/$inc" ]; then
      expand "$payload_root/$inc" $((depth + 1))
    else
      # Silence here is how an uncounted include hides. Say it on stderr.
      echo "  WARN  $f references @$inc - not found, counted as 0" >&2
    fi
  done
}

# The description lives in the frontmatter only. Reading past the closing `---`
# swallows the body and reports every skill as 20x over - the first version of
# this script did exactly that.
description() {
  awk '/^---[[:space:]]*$/ { n++; next } n == 1' "$1" | awk '
    /^description:/ { f = 1; sub(/^description:[ \t]*/, ""); print; next }
    f && /^[A-Za-z_-]+:/ { exit }
    f { print }'
}

# The non-obvious pieces here are asserted:  sh context-audit.sh selftest
if [ "$mode" = selftest ]; then
  t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
  this_script=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/$(basename -- "$0")
  export CONTEXT_AUDIT_SKIP_MCP=1

  printf '%s\n' '---' 'name: x' 'description: one two three' \
    'allowed-tools: Bash' '---' 'body body body body body' > "$t/SKILL.md"
  got=$(description "$t/SKILL.md" | wc -w | tr -d ' ')
  [ "$got" = 3 ] || { echo "FAIL: description parser read $got words, expected 3" >&2; exit 1; }

  # Inline @ in prose, and a nested @ that resolves against its OWN directory.
  repo_root=$t
  payload_root=$t
  mkdir -p "$t/sub"
  echo 'See @sub/big.md for the rules.' > "$t/CLAUDE.md"          # 6 words
  echo 'aa bb cc and @nested.md' > "$t/sub/big.md"                # 4 + include
  echo 'dd ee' > "$t/sub/nested.md"                               # 2 words
  got=$(expand "$t/CLAUDE.md" 2>/dev/null | wc -w | tr -d ' ')
  [ "$got" = 12 ] || { echo "FAIL: expand counted $got words, expected 12 (inline + nested-relative)" >&2; exit 1; }

  # A missing include must warn, never count as a silent zero.
  echo 'text @sub/gone.md' > "$t/CLAUDE.md"
  expand "$t/CLAUDE.md" 2>&1 >/dev/null | grep -q 'WARN' \
    || { echo 'FAIL: missing include did not warn' >&2; exit 1; }

  w10="one two three four five six seven eight nine ten"
  w50="$w10 $w10 $w10 $w10 $w10"
  w90="$w50 $w10 $w10 $w10 $w10"
  w250="$w50 $w50 $w50 $w50 $w50"

  # Split checkout layout tests
  s_clone="$t/split_clone"
  mkdir -p "$s_clone/plugin/skills/test-skill"
  mkdir -p "$s_clone/plugin/skills/grayskull-power"
  mkdir -p "$s_clone/plugin/practice/scripts"
  cp "$this_script" "$s_clone/plugin/practice/scripts/context-audit.sh"

  echo "clean root instructions @inc.md" > "$s_clone/CLAUDE.md"
  echo "included instructions text" > "$s_clone/inc.md"
  printf '%s\n' '---' 'name: test-skill' 'description: a short concise test description here' '---' 'body text' > "$s_clone/plugin/skills/test-skill/SKILL.md"
  printf '%s\n' '---' 'name: grayskull-power' 'description: router' '---' 'router body' > "$s_clone/plugin/skills/grayskull-power/SKILL.md"

  # Clean split clone passes default (no args) and explicit repo root
  out=$(sh "$s_clone/plugin/practice/scripts/context-audit.sh" 2>&1) || { echo "FAIL: clean split clone default failed: $out" >&2; exit 1; }
  printf '%s\n' "$out" | grep -q 'CLAUDE.md' || { echo "FAIL: split clone default omitted CLAUDE.md: $out" >&2; exit 1; }
  printf '%s\n' "$out" | grep -q 'total across all skills: 7 words' || { echo "FAIL: split clone default omitted skills: $out" >&2; exit 1; }

  out=$(sh "$this_script" "$s_clone" 2>&1) || { echo "FAIL: clean split clone explicit root failed: $out" >&2; exit 1; }
  printf '%s\n' "$out" | grep -q 'CLAUDE.md' || { echo "FAIL: split clone explicit root omitted CLAUDE.md: $out" >&2; exit 1; }
  printf '%s\n' "$out" | grep -q 'total across all skills: 7 words' || { echo "FAIL: split clone explicit root omitted skills: $out" >&2; exit 1; }

  # Oversized root include in split clone layout fails rather than disappearing
  echo "$w250" > "$s_clone/inc.md"
  if out=$(sh "$s_clone/plugin/practice/scripts/context-audit.sh" 2>&1); then
    echo "FAIL: split clone default passed with oversized root include" >&2; exit 1
  fi
  printf '%s\n' "$out" | grep -q 'OVER.*CLAUDE.md' || { echo "FAIL: split clone missing OVER for CLAUDE.md: $out" >&2; exit 1; }
  printf '%s\n' "$out" | grep -q 'total across all skills: 7 words' || { echo "FAIL: split clone dropped skills under root error: $out" >&2; exit 1; }

  if out=$(sh "$this_script" "$s_clone" 2>&1); then
    echo "FAIL: split clone explicit root passed with oversized root include" >&2; exit 1
  fi
  printf '%s\n' "$out" | grep -q 'OVER.*CLAUDE.md' || { echo "FAIL: split clone explicit missing OVER for CLAUDE.md: $out" >&2; exit 1; }

  # Oversized skill description in split clone layout fails rather than disappearing
  echo "included instructions text" > "$s_clone/inc.md"
  printf '%s\n' '---' 'name: test-skill' "description: $w90" '---' 'body text' > "$s_clone/plugin/skills/test-skill/SKILL.md"
  if out=$(sh "$s_clone/plugin/practice/scripts/context-audit.sh" 2>&1); then
    echo "FAIL: split clone default passed with oversized skill description" >&2; exit 1
  fi
  printf '%s\n' "$out" | grep -q 'OVER.*test-skill description is' || { echo "FAIL: split clone missing OVER for skill description: $out" >&2; exit 1; }
  printf '%s\n' "$out" | grep -q 'CLAUDE.md' || { echo "FAIL: split clone dropped instructions under skill error: $out" >&2; exit 1; }

  if out=$(sh "$this_script" "$s_clone" 2>&1); then
    echo "FAIL: split clone explicit root passed with oversized skill description" >&2; exit 1
  fi
  printf '%s\n' "$out" | grep -q 'OVER.*test-skill description is' || { echo "FAIL: split clone explicit missing OVER for skill description: $out" >&2; exit 1; }

  # Installed layout tests
  inst_dir="$t/installed"
  target_dir="$t/target_repo"
  mkdir -p "$inst_dir/skills/inst-skill"
  mkdir -p "$inst_dir/skills/grayskull-power"
  mkdir -p "$inst_dir/practice/scripts"
  cp "$this_script" "$inst_dir/practice/scripts/context-audit.sh"
  mkdir -p "$target_dir"

  echo "clean target instructions @target_inc.md" > "$target_dir/CLAUDE.md"
  echo "target include text" > "$target_dir/target_inc.md"
  printf '%s\n' '---' 'name: inst-skill' 'description: a short installed description' '---' 'body text' > "$inst_dir/skills/inst-skill/SKILL.md"
  printf '%s\n' '---' 'name: grayskull-power' 'description: router' '---' 'router body' > "$inst_dir/skills/grayskull-power/SKILL.md"

  # Clean installed layout passes
  out=$(sh "$inst_dir/practice/scripts/context-audit.sh" "$target_dir" 2>&1) || { echo "FAIL: clean installed layout failed: $out" >&2; exit 1; }
  printf '%s\n' "$out" | grep -q 'CLAUDE.md' || { echo "FAIL: installed layout omitted CLAUDE.md: $out" >&2; exit 1; }
  printf '%s\n' "$out" | grep -q 'total across all skills: 5 words' || { echo "FAIL: installed layout omitted skills: $out" >&2; exit 1; }

  out=$(sh "$this_script" "$target_dir" "$inst_dir" 2>&1) || { echo "FAIL: clean explicit two-arg layout failed: $out" >&2; exit 1; }
  printf '%s\n' "$out" | grep -q 'CLAUDE.md' || { echo "FAIL: explicit two-arg layout omitted CLAUDE.md: $out" >&2; exit 1; }
  printf '%s\n' "$out" | grep -q 'total across all skills: 5 words' || { echo "FAIL: explicit two-arg layout omitted skills: $out" >&2; exit 1; }

  # Oversized root include in installed layout fails rather than disappearing
  echo "$w250" > "$target_dir/target_inc.md"
  if out=$(sh "$inst_dir/practice/scripts/context-audit.sh" "$target_dir" 2>&1); then
    echo "FAIL: installed layout passed with oversized root include" >&2; exit 1
  fi
  printf '%s\n' "$out" | grep -q 'OVER.*CLAUDE.md' || { echo "FAIL: installed layout missing OVER for CLAUDE.md: $out" >&2; exit 1; }
  printf '%s\n' "$out" | grep -q 'total across all skills: 5 words' || { echo "FAIL: installed layout dropped skills under root error: $out" >&2; exit 1; }

  if out=$(sh "$this_script" "$target_dir" "$inst_dir" 2>&1); then
    echo "FAIL: explicit two-arg layout passed with oversized root include" >&2; exit 1
  fi
  printf '%s\n' "$out" | grep -q 'OVER.*CLAUDE.md' || { echo "FAIL: explicit two-arg layout missing OVER for CLAUDE.md: $out" >&2; exit 1; }

  # Oversized skill description in installed layout fails rather than disappearing
  echo "target include text" > "$target_dir/target_inc.md"
  printf '%s\n' '---' 'name: inst-skill' "description: $w90" '---' 'body text' > "$inst_dir/skills/inst-skill/SKILL.md"
  if out=$(sh "$inst_dir/practice/scripts/context-audit.sh" "$target_dir" 2>&1); then
    echo "FAIL: installed layout passed with oversized skill description" >&2; exit 1
  fi
  printf '%s\n' "$out" | grep -q 'OVER.*inst-skill description is' || { echo "FAIL: installed layout missing OVER for skill description: $out" >&2; exit 1; }
  printf '%s\n' "$out" | grep -q 'CLAUDE.md' || { echo "FAIL: installed layout dropped instructions under skill error: $out" >&2; exit 1; }

  if out=$(sh "$this_script" "$target_dir" "$inst_dir" 2>&1); then
    echo "FAIL: explicit two-arg layout passed with oversized skill description" >&2; exit 1
  fi
  printf '%s\n' "$out" | grep -q 'OVER.*inst-skill description is' || { echo "FAIL: explicit two-arg layout missing OVER for skill description: $out" >&2; exit 1; }

  echo ok; exit 0
fi

echo "== always-on files (budget 200 words, @-includes resolved) =="
for f in CLAUDE.md AGENTS.md GEMINI.md .cursorrules .github/copilot-instructions.md; do
  [ -f "$repo_root/$f" ] || continue
  n=$(expand "$repo_root/$f" | wc -w | tr -d ' ')
  printf '  %-40s %5s\n' "$f" "$n"
  [ "$n" -gt 200 ] && note "$f is $n words, budget 200 - push depth into a skill body"
done

echo "== skill descriptions (budget 80 words each, in the system prompt every turn) =="
total=0
for s in "$payload_root"/skills/*/SKILL.md; do
  [ -f "$s" ] || continue
  name=$(basename "$(dirname "$s")")
  n=$(description "$s" | wc -w | tr -d ' ')
  total=$((total + n))
  if [ "$n" -gt 80 ]; then
    printf '  %-40s %5s\n' "$name" "$n"
    note "$name description is $n words, budget 80"
  fi
done
echo "  total across all skills: $total words, every turn"

echo "== router skills (budget 800 words - loaded once per session, but every session) =="
for s in grayskull-power; do
  [ -f "$payload_root/skills/$s/SKILL.md" ] || continue
  n=$(wc -w < "$payload_root/skills/$s/SKILL.md" | tr -d ' ')
  printf '  %-40s %5s\n' "$s" "$n"
  [ "$n" -gt 800 ] && note "$s is $n words, budget 800 - move depth to references/"
done

echo "== MCP servers (each preloads its tool schemas into every message) =="
# Parsed configs lie: what costs you is whatever the host actually connected,
# which lives in the user-level config, not the repo. Ask the host.
if [ "${CONTEXT_AUDIT_SKIP_MCP:-0}" != 1 ] && command -v claude > /dev/null 2>&1; then
  # Plugin server names contain colons (plugin:claude-mem:mcp-search); a parse
  # that stops at the first one prints `plugin`, which `claude mcp remove`
  # cannot take - making the section's only actionable output useless.
  #
  # The timeout is not caution: `claude mcp list` dials every server, so an
  # unreachable one hangs it for minutes - and an unreachable server is the
  # single most likely thing this section is about to tell you to remove.
  if command -v timeout > /dev/null 2>&1; then
    mcp=$(timeout 20 claude mcp list 2>/dev/null || true)
  else
    mcp=$(claude mcp list 2>/dev/null || true)
  fi
  if [ -n "$mcp" ]; then
    echo "$mcp" | sed -n 's/^\([A-Za-z0-9_:.-]*\): .*/  \1/p'
    echo "  disconnect the ones you are not using this session - the cheapest win here"
  else
    echo "  (claude mcp list timed out or returned nothing - a server that will not"
    echo "   answer is still costing you its schema on every message; check it)"
  fi
else
  echo "  run: claude mcp list   (then remove the ones you are not using)"
fi

[ "$fail" -eq 0 ] && echo "OK: context ledger within budget"
exit $fail
