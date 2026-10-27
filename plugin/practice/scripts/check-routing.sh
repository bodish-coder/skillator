#!/bin/sh
# check-routing.sh - every marathon command phrase (F40) and "Help me, Obi-Wan"
# (F41) routes to exactly one row of grayskull-power's routing table, and that
# row names the skill it belongs to; /skillator:marathon exists. Prints `ok`.
#
#   sh practice/scripts/check-routing.sh [repo root]
#
# A phrase in two rows is a coin toss for the router; in none, a miss.
root=${1:-$(cd "$(dirname "$0")/../.." && pwd)}
rt="$root/skills/grayskull-power/references/routing.md"
[ -f "$rt" ] || { echo "FAIL: no $rt" >&2; exit 1; }
fails=0
check() {   # <phrase> <skill>
  rows=$(grep '^| ' "$rt" | grep -iF -- "$1")
  n=$(printf '%s\n' "$rows" | grep -c . || :)
  if [ "$n" != 1 ]; then echo "FAIL: '$1' is in $n routing rows, not 1" >&2; fails=$((fails + 1)); return; fi
  printf '%s' "$rows" | grep -q "\`$2\`" || { echo "FAIL: '$1' routes to a row without \`$2\`" >&2; fails=$((fails + 1)); }
}
while IFS='|' read -r skill phrase; do
  [ -n "$phrase" ] && check "$phrase" "$skill"
done <<'EOF'
relay-morpheus|May the Force be with you
relay-morpheus|may the force be with u
relay-morpheus|MTFBWY
relay-morpheus|go marathon
relay-morpheus|run the marathon
relay-morpheus|/skillator:marathon
relay-morpheus|Use the Force on F35 F36
relay-morpheus|marathon F35 F36
relay-morpheus|go marathon F35 F36
relay-morpheus|I'll be back
relay-morpheus|I'm back
relay-morpheus|work the board
relay-morpheus|keep going
holo-r2d2|Help me, Obi-Wan
holo-r2d2|help me obiwan
holo-r2d2|help me obi wan kenobi
clone-odo|clone this app
clone-odo|how close is my clone
clone-odo|what do X's users hate
clone-odo|is anything of the original left
skill-prometheus|a skill isn't triggering
EOF
grep -q 'relay-morpheus' "$root/commands/marathon.md" 2>/dev/null || { echo "FAIL: commands/marathon.md missing or does not load relay-morpheus" >&2; fails=$((fails + 1)); }
[ "$fails" = 0 ] || exit 1
echo ok
