#!/bin/sh
# The two artifacts practice/task-loop.md hands to subagents, as files so they
# never enter the controller's context.
#
#   taskwork.sh brief  <DESIGN_FILE> <N>            -> path to task N's brief
#   taskwork.sh review <DESIGN_FILE> <BASE> <HEAD>  -> path to the review package
#
# Both print the path and nothing else, so a caller can do:
#   BRIEF=$(taskwork.sh brief design.md 3)
# ponytail: one script, two subcommands, no config. Output lands in
# .taskwork/ beside the design file; delete the directory when the plan is done.
set -e

usage() {
  echo "usage: taskwork.sh brief  <DESIGN_FILE> <N>" >&2
  echo "       taskwork.sh review <DESIGN_FILE> <BASE> <HEAD>" >&2
  exit 2
}

cmd="${1:-}"; design="${2:-}"
[ -n "$cmd" ] && [ -n "$design" ] || usage
[ -f "$design" ] || { echo "no such design file: $design" >&2; exit 1; }

# absolute, so a caller that captured the path can use it from any directory
out="$(CDPATH= cd -- "$(dirname -- "$design")" && pwd)/.taskwork"
mkdir -p "$out"

case "$cmd" in
brief)
  n="${3:-}"
  [ -n "$n" ] || usage
  f="$out/task-$n-brief.md"
  # A task block runs from '### Task <n>:' to the next '### Task ' or EOF.
  awk -v n="$n" '
    $0 ~ "^### Task " n "([:.[:space:]]|$)" { inblock=1; print; next }
    inblock && /^### Task /                 { exit }
    inblock                                  { print }
    END { if (!inblock) exit 3 }
  ' "$design" > "$f" || {
    rm -f "$f"
    echo "no '### Task $n:' block in $design" >&2
    exit 1
  }
  [ -s "$f" ] || { rm -f "$f"; echo "task $n block is empty in $design" >&2; exit 1; }
  echo "$f"
  ;;
review)
  base="${3:-}"; head="${4:-}"
  [ -n "$base" ] && [ -n "$head" ] || usage
  git rev-parse --verify --quiet "$base" >/dev/null || { echo "bad base: $base" >&2; exit 1; }
  git rev-parse --verify --quiet "$head" >/dev/null || { echo "bad head: $head" >&2; exit 1; }
  f="$out/review-$(git rev-parse --short "$base")-$(git rev-parse --short "$head").md"
  {
    echo "# Review package"
    echo
    echo "Base: $(git rev-parse "$base")"
    echo "Head: $(git rev-parse "$head")"
    echo
    echo "## Commits"
    echo '```'
    git log --oneline "$base..$head"
    echo '```'
    echo
    echo "## Stat"
    echo '```'
    git diff --stat "$base" "$head"
    echo '```'
    echo
    echo "## Diff"
    echo '```diff'
    # -U8: reviewers judge hunks in context; 3 lines is not enough context.
    git diff -U8 "$base" "$head"
    echo '```'
  } > "$f"
  echo "$f"
  ;;
*) usage ;;
esac
