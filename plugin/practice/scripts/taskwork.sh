#!/bin/sh
# The artifacts practice/task-loop.md hands to subagents, as files so they
# never enter the controller's context.
#
#   taskwork.sh brief  <DESIGN_FILE> <N>            -> path to task N's brief
#   taskwork.sh report <DESIGN_FILE> <N>            -> path for task N's report
#   taskwork.sh review <DESIGN_FILE> <BASE> <HEAD>  -> path to the review package
#
# All print the path and nothing else, so a caller can do:
#   BRIEF=$(taskwork.sh brief design.md 3)
# `report` only names the file — the implementer writes it, fix rounds append
# to it — so implementer and reviewer get the same path by construction.
# ponytail: one script, three subcommands, no config. Output lands in
# .taskwork/ beside the design file; delete the directory when the plan is done.
set -e

usage() {
  echo "usage: taskwork.sh brief  <DESIGN_FILE> <N>" >&2
  echo "       taskwork.sh report <DESIGN_FILE> <N>" >&2
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
  # A task block runs from '### Task <n>:' to the next '### Task ', the next
  # top-level design field, or EOF. TASKS is not the last field - VERIFICATION and
  # TRACE follow it, and everything below TASKS used to land in the last task's
  # brief (A71). The fields are a closed set, listed in the brainstorm-build-*
  # templates; matching their SHAPE instead (/^[A-Z][A-Z ]*:/) silently ate any
  # task body opening with 'IMPORTANT:' or a bare Windows path. SATISFIES: is a
  # per-task field and deliberately absent. Fenced code is skipped, since task
  # blocks carry actual code: fence tracking follows CommonMark, closing only on a
  # run of backticks at least as long as the one that opened it, so a ```sh block
  # nested inside a ````md block does not re-open the terminators.
  awk -v n="$n" '
    BEGIN { split("GOAL REQUIREMENTS APPROACHES CHOSEN DESIGN CONSTRAINTS TRACE " \
                  "TASKS VERIFICATION PLATFORM DESIGN_MODEL BUILD_MODEL", a, " ")
            for (i in a) field[a[i]] = 1 }
    $0 ~ "^### Task " n "([:.[:space:]]|$)" { inblock=1; print; next }
    !inblock { next }
    match($0, /^`+/) && RLENGTH >= 3 {
      if (!fence)                  fence = RLENGTH
      else if (RLENGTH >= fence && substr($0, RLENGTH + 1) ~ /^[ \t\r]*$/) fence = 0
      print; next
    }
    # A task heading terminates even inside a fence. Same-length nested fences (a task
    # step dictating SKILL.md content wraps ```sh in ```md) leave the run unbalanced,
    # and a fence-guarded heading then ran the block to EOF - A71 a third time. A
    # heading at column 0 inside a code block is far rarer than that leak.
    /^### Task /                   { exit }
    fence                          { print; next }
    # $1 is whitespace-tokenised, so "VERIFICATION:run it" (no space after the
    # colon) was not $1 and the block ran to EOF - A71 again. Match up to the colon.
    match($0, /^[A-Z][A-Z_]*:/) && substr($0, 1, RLENGTH - 1) in field { exit }
    { print }
    END { if (!inblock) exit 3 }
  ' "$design" > "$f" || {
    rm -f "$f"
    echo "no '### Task $n:' block in $design" >&2
    exit 1
  }
  [ -s "$f" ] || { rm -f "$f"; echo "task $n block is empty in $design" >&2; exit 1; }
  # heading and nothing else: the block ended on its first body line, so the brief
  # would hand a build agent a task with no steps. Fail loudly instead.
  [ "$(awk 'END{print NR}' "$f")" -gt 1 ] || {
    rm -f "$f"
    echo "task $n block in $design has a heading but no body" >&2
    exit 1
  }
  echo "$f"
  ;;
report)
  n="${3:-}"
  [ -n "$n" ] || usage
  echo "$out/task-$n-report.md"
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
