#!/bin/sh
# The per-turn context ledger. Everything below is paid on EVERY prompt of every
# session, forever - unlike a skill body, which is paid once inside the task that
# needed it. Habits like /clear, fresh sessions and batching are user-side and
# unmeasurable from here; this measures only what a repo can actually fix.
#
#   sh practice/scripts/context-audit.sh [repo-root]
#
# Budgets are skill-smith section 7: always-on file 200 words, router skill 800,
# description ~80. Exit 1 if anything is over, so it works as a pre-commit gate.
#
# NOT yet wired in as one, deliberately: this repo is over on five counts today
# (A72), so adopting it as a gate now would block every commit. Run it by hand
# until A72 closes, then wire it.
set -e
mode=${1:-}; [ "$mode" = selftest ] && shift || true
root=${1:-$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)}
[ -d "$root" ] || { echo "FAIL: no such dir $root" >&2; exit 2; }
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
    elif [ -f "$root/$inc" ]; then
      expand "$root/$inc" $((depth + 1))
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

# The two non-obvious pieces here have each already been wrong once: the
# description parser read past the closing `---` and reported every skill 20x
# over, and expand() missed inline and nested includes - passing green on the
# one case the gate exists for. Both are asserted:  sh context-audit.sh selftest
if [ "$mode" = selftest ]; then
  t=$(mktemp -d); trap 'rm -rf "$t"' EXIT

  printf '%s\n' '---' 'name: x' 'description: one two three' \
    'allowed-tools: Bash' '---' 'body body body body body' > "$t/SKILL.md"
  got=$(description "$t/SKILL.md" | wc -w | tr -d ' ')
  [ "$got" = 3 ] || { echo "FAIL: description parser read $got words, expected 3" >&2; exit 1; }

  # Inline @ in prose, and a nested @ that resolves against its OWN directory.
  root=$t
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

  echo ok; exit 0
fi

echo "== always-on files (budget 200 words, @-includes resolved) =="
for f in CLAUDE.md AGENTS.md GEMINI.md .cursorrules .github/copilot-instructions.md; do
  [ -f "$root/$f" ] || continue
  n=$(expand "$root/$f" | wc -w | tr -d ' ')
  printf '  %-40s %5s\n' "$f" "$n"
  [ "$n" -gt 200 ] && note "$f is $n words, budget 200 - push depth into a skill body"
done

echo "== skill descriptions (budget 80 words each, in the system prompt every turn) =="
total=0
for s in "$root"/skills/*/SKILL.md; do
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
  [ -f "$root/skills/$s/SKILL.md" ] || continue
  n=$(wc -w < "$root/skills/$s/SKILL.md" | tr -d ' ')
  printf '  %-40s %5s\n' "$s" "$n"
  [ "$n" -gt 800 ] && note "$s is $n words, budget 800 - move depth to references/"
done

echo "== MCP servers (each preloads its tool schemas into every message) =="
# Parsed configs lie: what costs you is whatever the host actually connected,
# which lives in the user-level config, not the repo. Ask the host.
if command -v claude > /dev/null 2>&1; then
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
