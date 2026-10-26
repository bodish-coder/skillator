#!/bin/sh
# check-muse-manifest.sh - .muse-plugin/ (F68, Meta Muse) must not drift from the repo:
# every skills/*/SKILL.md listed in .muse-plugin/plugin.json, every listed path present,
# each id equal to its SKILL.md frontmatter `name:`, and both Muse versions (plugin.json,
# marketplace.json) equal to .claude-plugin/plugin.json's. Prints `ok` or dies with FAIL.
#   sh practice/scripts/check-muse-manifest.sh [repo root]
#   sh practice/scripts/check-muse-manifest.sh --selftest   (stale copies must fail)
# Reads the manifests line by line (one key per line, as written); a reformatted file
# fails loudly ("no skills listed") rather than passing.
set -e
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

die() { echo "FAIL: $1" >&2; exit 1; }

# One awk pass over the three manifests and every skills/*/SKILL.md: process spawns
# are ~1 s each on a loaded Windows box, so no per-skill grep/sed.
check() {
  root=$1
  mp="$root/.muse-plugin/plugin.json"
  mm="$root/.muse-plugin/marketplace.json"
  cp="$root/.claude-plugin/plugin.json"
  for f in "$mp" "$mm" "$cp"; do [ -f "$f" ] || die "missing: $f"; done
  out=$(awk -v root="$root/" -v mp="$mp" -v mm="$mm" -v cp="$cp" -v q="'" '
    function val(s) { sub(/^[^:]*: *"/, "", s); sub(/".*/, "", s); return s }
    FNR == 1 { f = FILENAME; rel = substr(f, length(root) + 1); gotname = 0 }
    { sub(/\r$/, "") }
    /"version"/ && !(f in ver) { ver[f] = val($0) }
    f == mp && /"skills": *\[/ { s = 1; next }
    f == mp && s && /^ *\]/ { s = 0 }
    f == mp && s && /"id":/ { id = val($0) }
    f == mp && s && /"path":/ {
      p = val($0); n++; lid[n] = id; lpath[n] = p
      if (id in seen) bad = bad "duplicate id: " id "\n"; seen[id] = 1
    }
    f != mp && f != mm && f != cp && !gotname && /^name:/ {
      v = $0; sub(/^name: */, "", v); name[rel] = v; gotname = 1; have[rel] = 1
    }
    f != mp && f != mm && f != cp && FNR == 1 { have[rel] = 1 }
    END {
      if (ver[cp] == "") { print "no version in " cp; exit }
      if (ver[mp] != ver[cp]) print ".muse-plugin/plugin.json version " ver[mp] " != .claude-plugin/plugin.json " ver[cp]
      if (ver[mm] != ver[cp]) print ".muse-plugin/marketplace.json version " ver[mm] " != .claude-plugin/plugin.json " ver[cp]
      if (n == 0) print "no skills listed in " mp
      printf "%s", bad
      for (i = 1; i <= n; i++) {
        listed[lpath[i]] = 1
        if (!(lpath[i] in have)) print "listed path missing: " lpath[i] " (id " lid[i] ")"
        else if (name[lpath[i]] != lid[i]) print "id " lid[i] " != frontmatter name " q name[lpath[i]] q " in " lpath[i]
      }
      for (r in have) if (!(r in listed)) print "not listed in .muse-plugin/plugin.json: " r
    }
  ' "$cp" "$mp" "$mm" "$root"/skills/*/SKILL.md)
  [ -z "$out" ] || die "$out"
}

if [ "${1:-}" = "--selftest" ]; then
  root=$(CDPATH= cd -- "$here/../.." && pwd)
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  mk() {  # a scratch copy of the parts the check reads
    rm -rf "$tmp/r"; mkdir -p "$tmp/r"
    cp -R "$root/.muse-plugin" "$root/.claude-plugin" "$root/skills" "$tmp/r/"
  }
  expect_fail() {  # $1 label, $2 wanted text in the FAIL line
    if out=$(sh "$here/check-muse-manifest.sh" "$tmp/r" 2>&1); then
      die "selftest: $1 passed, should fail"
    fi
    printf '%s\n' "$out" | grep -qF "$2" || die "selftest: $1 failed for the wrong reason: $out"
  }
  mk; sh "$here/check-muse-manifest.sh" "$tmp/r" > /dev/null || die "selftest: clean copy fails"
  mk; mkdir -p "$tmp/r/skills/zz-new"; printf -- '---\nname: zz-new\n---\n' > "$tmp/r/skills/zz-new/SKILL.md"
  expect_fail 'an unlisted skill' 'not listed'
  mk; sed 's/"version": "[^"]*"/"version": "0.0.1"/' "$root/.claude-plugin/plugin.json" > "$tmp/r/.claude-plugin/plugin.json"
  expect_fail 'a stale plugin.json version' 'plugin.json version'
  mk; sed 's/"version": "[^"]*"/"version": "0.0.1"/' "$root/.muse-plugin/marketplace.json" > "$tmp/r/.muse-plugin/marketplace.json"
  expect_fail 'a stale marketplace.json version' 'marketplace.json version'
  mk; rm -rf "$tmp/r/skills/tui-tron"
  expect_fail 'a listed path removed' 'listed path missing'
  mk; sed 's/^name: tui-tron/name: tui-tron2/' "$root/skills/tui-tron/SKILL.md" > "$tmp/r/skills/tui-tron/SKILL.md"
  expect_fail 'a renamed frontmatter name' 'frontmatter name'
  echo ok
  exit 0
fi

check "${1:-$(CDPATH= cd -- "$here/../.." && pwd)}"
echo ok
