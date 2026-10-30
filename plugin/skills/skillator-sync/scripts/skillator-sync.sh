#!/bin/sh
# skillator-sync: sweep tracked UPSTREAM.md manifests, detect upstream commits,
# and absorb commit hashes after rule mapping and local updates (F124).
#
#   skillator-sync.sh [check] [--daily] [--skills-dir DIR] [SKILL...]
#   skillator-sync.sh absorb <skill> <upstream-name> <40-hex-sha> [--date YYYY-MM-DD] [--skills-dir DIR]
#   skillator-sync.sh --selftest
#
# Sweeps every <skills-dir>/*/UPSTREAM.md (default: sibling skills under ../,
# sorted by skill name) or only the named SKILLs. Delegates per-manifest commit
# comparison to practice/scripts/upstream-check.sh (or ../<skill>/upstream-check.sh)
# and prefixes each output line with the skill name:
#   unchanged <skill> <name> <sha7>
#   changed   <skill> <name> <old7>..<new7> <compare-url>
#   error     <skill> <name> <reason>
#   skipped   <skill> <detail>
# Plus a final summary line:
#   summary: <u_cnt> unchanged, <c_cnt> changed, <e_cnt> error
# Exit 0 all unchanged (or skipped), 1 any changed (and no error), 2 any error.
#
# absorb updates the 'Absorbed commit' and 'Absorbed' date columns for
# <upstream-name> under '## Upstreams' in <skills-dir>/<skill>/UPSTREAM.md.
set -u

prog=skillator-sync.sh
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
default_skills_dir=$(CDPATH= cd -- "$here/../.." && pwd)
checker=$(CDPATH= cd -- "$here/../../../practice/scripts" 2>/dev/null && pwd)/upstream-check.sh

usage() {
  echo "usage: $prog [check] [--daily] [--skills-dir DIR] [SKILL...]" >&2
  echo "       $prog absorb <skill> <upstream-name> <40-hex-sha> [--date YYYY-MM-DD] [--skills-dir DIR]" >&2
  echo "       $prog --selftest" >&2
  exit 2
}

die() { echo "$prog: $1" >&2; exit "${2:-2}"; }

is_sha40() {
  printf '%s\n' "$1" | grep -Eq '^[0-9a-f]{40}$'
}

do_check() {
  daily=0
  skills_dir=$default_skills_dir
  filters=
  while [ $# -gt 0 ]; do
    case $1 in
      --daily) daily=1; shift ;;
      --skills-dir)
        [ $# -ge 2 ] || usage
        skills_dir=$2; shift 2 ;;
      -*) usage ;;
      *) filters="$filters $1"; shift ;;
    esac
  done

  chk=${SKILLATOR_SYNC_CHECKER:-$checker}
  [ -f "$chk" ] || die "upstream-check.sh not found at $chk" 2
  [ -d "$skills_dir" ] || die "skills directory not found: $skills_dir" 2

  manifests=
  if [ -n "$filters" ]; then
    for s in $filters; do
      m="$skills_dir/$s/UPSTREAM.md"
      [ -f "$m" ] || die "manifest not found for skill '$s': $m" 2
      manifests="$manifests $m"
    done
  else
    for m in "$skills_dir"/*/UPSTREAM.md; do
      [ -f "$m" ] || continue
      manifests="$manifests $m"
    done
  fi

  [ -n "$manifests" ] || die "no UPSTREAM.md manifests found in $skills_dir" 2

  u_cnt=0; c_cnt=0; e_cnt=0; s_cnt=0
  worst=0
  nl='
'
  for m in $manifests; do
    skill=$(basename -- "$(dirname -- "$m")")
    if [ $daily = 1 ]; then
      out=$(sh "$chk" --daily "$m" 2>&1)
      rc=$?
    else
      out=$(sh "$chk" "$m" 2>&1)
      rc=$?
    fi
    [ $rc -gt $worst ] && worst=$rc

    IFS=$nl
    for line in $out; do
      [ -n "$line" ] || continue
      case $line in
        "unchanged "*)
          rest=${line#unchanged }
          echo "unchanged $skill $rest"
          u_cnt=$((u_cnt + 1)) ;;
        "changed   "*)
          rest=${line#changed   }
          echo "changed   $skill $rest"
          c_cnt=$((c_cnt + 1)) ;;
        "error     "*)
          rest=${line#error     }
          echo "error     $skill $rest"
          e_cnt=$((e_cnt + 1)) ;;
        "skipped:"*)
          echo "skipped   $skill $line"
          s_cnt=$((s_cnt + 1)) ;;
        *)
          if [ $rc -ge 2 ]; then
            echo "error     $skill $line"
            e_cnt=$((e_cnt + 1))
          else
            echo "info      $skill $line"
          fi ;;
      esac
    done
    unset IFS
  done

  echo "summary: $u_cnt unchanged, $c_cnt changed, $e_cnt error"
  return $worst
}

do_absorb() {
  skills_dir=$default_skills_dir
  day=$(date +%Y-%m-%d)
  pos=
  while [ $# -gt 0 ]; do
    case $1 in
      --skills-dir)
        [ $# -ge 2 ] || usage
        skills_dir=$2; shift 2 ;;
      --date)
        [ $# -ge 2 ] || usage
        day=$2; shift 2 ;;
      -*) usage ;;
      *)
        pos="$pos
$1"
        shift ;;
    esac
  done

  set --
  nl='
'
  IFS=$nl
  for p in $pos; do
    [ -n "$p" ] && set -- "$@" "$p"
  done
  unset IFS

  [ $# -eq 3 ] || usage
  skill=$1; upname=$2; newsha=$3

  is_sha40 "$newsha" || die "absorb: commit must be a 40-hex sha, got '$newsha'" 2
  printf '%s\n' "$day" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' || die "absorb: date must be YYYY-MM-DD, got '$day'" 2

  manifest="$skills_dir/$skill/UPSTREAM.md"
  [ -f "$manifest" ] || die "absorb: manifest not found: $manifest" 2

  tmpf="$manifest.tmp.$$"
  awk -v target="$upname" -v sha="$newsha" -v dt="$day" '
    BEGIN { on = 0; found = 0 }
    /^## / { on = ($0 ~ /^## Upstreams[ \t]*$/); print; next }
    on && /^\|/ {
      n = split($0, c, "|")
      name = c[2]
      gsub(/^[ \t]+|[ \t]+$/, "", name)
      if (name == target) {
        c[5] = " `" sha "` "
        c[6] = " " dt " "
        line = "|"
        for (i = 2; i < n; i++) line = line c[i] "|"
        print line
        found = 1
        next
      }
    }
    { print }
    END { if (!found) exit 3 }
  ' "$manifest" > "$tmpf"
  rc=$?
  if [ $rc -ne 0 ]; then
    rm -f "$tmpf"
    [ $rc -eq 3 ] && die "absorb: upstream '$upname' not found under '## Upstreams' in $manifest" 2
    die "absorb: failed to update $manifest" 2
  fi
  mv "$tmpf" "$manifest" || { rm -f "$tmpf"; die "absorb: could not write $manifest" 2; }
  echo "absorbed $skill $upname $(echo "$newsha" | cut -c1-7) ($day)"
  return 0
}

selftest() {
  st=$(mktemp -d) || exit 1
  trap 'rm -rf "$st"' EXIT
  pass=0; fail_cnt=0
  assert_ok() {
    if [ "$1" = 0 ]; then
      pass=$((pass + 1))
    else
      echo "FAIL: $2" >&2
      fail_cnt=$((fail_cnt + 1))
    fi
  }

  A=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  B=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  C=cccccccccccccccccccccccccccccccccccccccc

  cat > "$st/stub.sh" <<STUB
#!/bin/sh
case "\$1 \$2 \${3:-}" in
  "latest org/alpha "*) echo $A ;;
  "latest org/beta "*)  echo $B ;;
  "latest org/gamma "*) echo $C ;;
  "contains org/beta $A") exit 1 ;;
  "contains org/gamma $A") exit 1 ;;
  *) exit 2 ;;
esac
STUB
  export UPSTREAM_CHECK_FETCH="sh $st/stub.sh"

  mkdir -p "$st/skills/skill-one" "$st/skills/skill-two"
  cat > "$st/skills/skill-one/UPSTREAM.md" <<EOF
# skill-one upstream

## Upstreams

| Name | Repo | Watched paths | Absorbed commit | Absorbed | Sections |
|---|---|---|---|---|---|
| alpha | \`org/alpha\` | \`SKILL.md\` | \`$A\` | 2026-10-01 | s1 |
EOF

  cat > "$st/skills/skill-two/UPSTREAM.md" <<EOF
# skill-two upstream

## Upstreams

| Name | Repo | Watched paths | Absorbed commit | Absorbed | Sections |
|---|---|---|---|---|---|
| beta | \`org/beta\` | \`SKILL.md\` | \`$A\` | 2026-10-01 | s2 |
EOF

  me="$here/$prog"

  # 1. Sweep detects 1 unchanged (alpha) and 1 behind/changed (beta) with compare URL
  out=$(sh "$me" check --skills-dir "$st/skills" 2>&1); rc=$?
  assert_ok "$([ $rc = 1 ] && echo 0 || echo 1)" "sweep exit code should be 1 when behind, got $rc: $out"
  echo "$out" | grep -q "^unchanged skill-one alpha aaaaaaa$"
  assert_ok $? "sweep should report skill-one alpha unchanged: $out"
  echo "$out" | grep -q "^changed   skill-two beta aaaaaaa..bbbbbbb https://github.com/org/beta/compare/$A...$B$"
  assert_ok $? "sweep should report skill-two beta changed with compare link: $out"
  echo "$out" | grep -q "^summary: 1 unchanged, 1 changed, 0 error$"
  assert_ok $? "sweep summary counts should match: $out"

  # 2. Single-skill filter on up-to-date skill exits 0
  out=$(sh "$me" check --skills-dir "$st/skills" skill-one 2>&1); rc=$?
  assert_ok "$([ $rc = 0 ] && echo 0 || echo 1)" "filtered check on skill-one should exit 0, got $rc"

  # 3. Absorb updates the SHA and date in UPSTREAM.md
  out=$(sh "$me" absorb skill-two beta "$B" --date 2026-10-30 --skills-dir "$st/skills" 2>&1); rc=$?
  assert_ok "$([ $rc = 0 ] && echo 0 || echo 1)" "absorb should exit 0, got $rc: $out"
  echo "$out" | grep -q "^absorbed skill-two beta bbbbbbb (2026-10-30)$"
  assert_ok $? "absorb output line format: $out"
  grep -q "| beta | \`org/beta\` | \`SKILL.md\` | \`$B\` | 2026-10-30 | s2 |" "$st/skills/skill-two/UPSTREAM.md"
  assert_ok $? "UPSTREAM.md row updated after absorb"

  # 4. Re-sweep after absorb exits 0 with all unchanged
  out=$(sh "$me" check --skills-dir "$st/skills" 2>&1); rc=$?
  assert_ok "$([ $rc = 0 ] && echo 0 || echo 1)" "post-absorb sweep should exit 0, got $rc: $out"
  echo "$out" | grep -q "^unchanged skill-two beta bbbbbbb$"
  assert_ok $? "post-absorb skill-two beta is unchanged: $out"
  echo "$out" | grep -q "^summary: 2 unchanged, 0 changed, 0 error$"
  assert_ok $? "post-absorb summary is 2 unchanged: $out"

  # 5. Error handling: bad sha and unknown upstream name
  sh "$me" absorb skill-two beta "not-a-sha" --skills-dir "$st/skills" >/dev/null 2>&1; rc=$?
  assert_ok "$([ $rc = 2 ] && echo 0 || echo 1)" "bad sha rejected with exit 2, got $rc"
  sh "$me" absorb skill-two unknown "$B" --skills-dir "$st/skills" >/dev/null 2>&1; rc=$?
  assert_ok "$([ $rc = 2 ] && echo 0 || echo 1)" "unknown upstream rejected with exit 2, got $rc"

  # 6. Real repo manifests parse cleanly under offline stub
  cat > "$st/real-stub.sh" <<RSTUB
#!/bin/sh
case "\$1 \$2" in
  "latest DietrichGebert/ponytail") echo 2a1fe842d078cf66ec7f3e6096a8ca4279c2cad7 ;;
  "latest anthropics/claude-code") echo dbdd79cebfae5891f5b0fab6f7773ea520d289a7 ;;
  "latest emilkowalski/skills") echo 85e8e2363b713506e1d5b6e07a0eb2da66be1bc3 ;;
  "latest pbakaus/impeccable") echo 71a3341289b86b7b628dd40d5d69c1e686a181b0 ;;
  "latest nextlevelbuilder/ui-ux-pro-max-skill") echo dcc40ff5133ef78276117db0cc34e7b83cc8aeba ;;
  "latest Jakeschincariol/replica-skill") echo 77c9436fb3d18c3d58169efb8caf4fe906b0dc51 ;;
  *) exit 2 ;;
esac
RSTUB
  export UPSTREAM_CHECK_FETCH="sh $st/real-stub.sh"
  out=$(sh "$me" check 2>&1); rc=$?
  assert_ok "$([ $rc = 0 ] && echo 0 || echo 1)" "real manifests sweep exits 0 under matching stub, got $rc: $out"
  echo "$out" | grep -q "^summary: 6 unchanged, 0 changed, 0 error$"
  assert_ok $? "real manifests sweep checks all 6 upstream rows across code-yoda, design-arwen, clone-odo: $out"

  [ $fail_cnt -eq 0 ] || exit 1
  echo "ok - skillator-sync.sh selftest ($pass/$pass passed)"
}

case "${1:-check}" in
  --selftest) [ $# -eq 1 ] || usage; selftest; exit $? ;;
  check)      shift; do_check "$@"; exit $? ;;
  absorb)     shift; do_absorb "$@"; exit $? ;;
  --daily|--skills-dir|-*) do_check "$@"; exit $? ;;
  *)          do_check "$@"; exit $? ;;
esac
