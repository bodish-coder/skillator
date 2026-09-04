#!/bin/sh
# .skillator/grayskull.md must be a faithful instance of the template block in
# skills/grayskull-power/references/arming.md. The ONLY licensed difference is
# the <SKILL_DIR> substitution (twice: usage-watch.sh and usage-watch.ps1).
#   sh practice/scripts/check-grayskull-sync.sh
set -e
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
tpl="$root/skills/grayskull-power/references/arming.md"
live="$root/.skillator/grayskull.md"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

die() { echo "FAIL: $1" >&2; exit 1; }

[ -f "$tpl" ] || die "template missing: $tpl"
[ -f "$live" ] || die "live copy missing: $live"

# The template block = the first ```markdown fence in arming.md.
awk '/^```markdown$/{f=1;next} f&&/^```$/{exit} f' "$tpl" > "$tmp/tpl"
grep -q 'grayskull-power is ON' "$tmp/tpl" ||
  die "no \`\`\`markdown template block found in $tpl"

# Licensed substitution: whatever stands in for <SKILL_DIR> is folded back to the
# placeholder on both sides, so only real drift survives the diff.
sub='s|[^ `"]*/\.\./handoff-watch/hooks/usage-watch|<SKILL_DIR>/../handoff-watch/hooks/usage-watch|g'
sed "$sub" "$tmp/tpl"  > "$tmp/a"
sed "$sub" "$live"     > "$tmp/b"

if ! diff -u "$tmp/a" "$tmp/b" > "$tmp/d"; then
  echo "FAIL: .skillator/grayskull.md has drifted from the arming.md template." >&2
  echo "  template: $tpl (the authority)" >&2
  echo "  live:     $live" >&2
  echo "  --- expected (a) vs live (b), <SKILL_DIR> already normalised ---" >&2
  sed 1,2d "$tmp/d" >&2
  exit 1
fi

# The substitution must actually have been made, and must point at a real file.
grep -q '<SKILL_DIR>' "$live" && die "$live still contains the literal <SKILL_DIR>"
p=$(sed -n 's|.*`\(.*/\.\./handoff-watch/hooks/usage-watch\.sh\) check`.*|\1|p' "$live")
[ -n "$p" ] || die "no usage-watch.sh path found in $live"
case $p in /*|?:/*) ;; *) p="$root/$p" ;; esac
[ -f "$p" ] || die "usage-watch path does not resolve to a file: $p"

echo "ok — .skillator/grayskull.md matches the arming.md template"
