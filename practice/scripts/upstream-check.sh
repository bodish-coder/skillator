#!/bin/sh
# Has an upstream that design-arwen absorbed changed since (F23c)?
#
#   upstream-check.sh [--daily] [manifest]   default: skills/design-arwen/UPSTREAM.md
#   upstream-check.sh --selftest
#
# The manifest is the table under "## Upstreams": Name | Repo | Watched paths |
# Absorbed commit | ... . Per row, one line on stdout:
#   unchanged <name> <sha7>
#   changed   <name> <old7>..<new7> <compare-url>
#   error     <name> <reason>
# Exit 0 all unchanged, 1 any changed, 2 any error (network, parse, a watched
# path gone). An error is never reported as unchanged. Detection only: this
# script edits nothing but its --daily stamp.
#
# A path is changed when the latest commit touching it is not the absorbed
# commit and not an ancestor of it. Versions are not used: upstream manifests
# lag their content.
#
# Fetch: `gh api` when gh is installed and logged in, else a blob-less clone
# per repo into a temp dir. UPSTREAM_CHECK_BACKEND=gh|git forces one.
# UPSTREAM_CHECK_FETCH=<cmd> replaces both (the selftest's stub). Its contract:
#   <cmd> latest   <owner/repo> <path>      print the sha, nonzero on failure
#   <cmd> contains <owner/repo> <tip> <sha> exit 0 if <sha> is <tip> or an
#                                           ancestor of it, 1 if not, else 2
#
# --daily: skip (exit 0, says so) if a run already finished today; the stamp is
# $(git rev-parse --git-common-dir)/skillator/upstream-check.day. The stamp is
# written only on exit 0 or 1, so a failed run is retried next time.
set -u
prog=upstream-check.sh
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
root=$(CDPATH= cd -- "$here/../.." && pwd)

usage() {
  echo "usage: $prog [--daily] [manifest]" >&2
  echo "       $prog --selftest" >&2
  exit 2
}

# Manifest rows as name<TAB>repo<TAB>paths(space separated)<TAB>sha.
parse_manifest() {
  awk '
    /^## / { on = ($0 ~ /^## Upstreams[ \t]*$/); next }
    !on || !/^\|/ { next }
    {
      n = split($0, c, "|")
      for (i = 2; i <= 5; i++) { gsub(/^[ \t]+|[ \t]+$/, "", c[i]) }
      if (c[2] == "Name" || c[2] ~ /^-+$/) next
      p = c[4]; gsub(/<br>/, " ", p); gsub(/`/, "", p); gsub(/[ \t]+/, " ", p)
      r = c[3]; gsub(/`/, "", r)
      s = c[5]; gsub(/`/, "", s)
      print c[2] "\t" r "\t" p "\t" s
    }' "$1"
}

# ---- fetch backends ---------------------------------------------------------
backend=
tmp=

gh_fetch() {
  case $1 in
    latest)
      out=$(gh api "repos/$2/commits?path=$3&per_page=1" --jq '.[0].sha // ""' 2>/dev/null) || return 2
      [ -n "$out" ] && [ "$out" != null ] || return 2
      echo "$out" ;;
    contains)
      st=$(gh api "repos/$2/compare/$4...$3" --jq .status 2>/dev/null) || return 2
      case $st in identical|ahead) return 0 ;; behind|diverged) return 1 ;; *) return 2 ;; esac ;;
    *) return 2 ;;
  esac
}

git_fetch() {
  d="$tmp/clone-$(echo "$2" | tr '/' '_')"
  if [ ! -d "$d" ]; then
    git clone --quiet --filter=blob:none --no-checkout "https://github.com/$2.git" "$d" >/dev/null 2>&1 ||
      { rm -rf "$d"; return 2; }
  fi
  case $1 in
    latest)
      out=$(git -C "$d" log -1 --format=%H HEAD -- "$3" 2>/dev/null) || return 2
      [ -n "$out" ] || return 2
      echo "$out" ;;
    contains)
      git -C "$d" cat-file -e "$3^{commit}" 2>/dev/null || return 2
      git -C "$d" cat-file -e "$4^{commit}" 2>/dev/null || return 2
      git -C "$d" merge-base --is-ancestor "$4" "$3"; rc=$?
      case $rc in 0|1) return $rc ;; *) return 2 ;; esac ;;
    *) return 2 ;;
  esac
}

fetch() {
  if [ -n "${UPSTREAM_CHECK_FETCH:-}" ]; then
    $UPSTREAM_CHECK_FETCH "$@"
  elif [ "$backend" = gh ]; then gh_fetch "$@"
  else git_fetch "$@"
  fi
}

pick_backend() {
  [ -n "${UPSTREAM_CHECK_FETCH:-}" ] && { backend=stub; return; }
  case ${UPSTREAM_CHECK_BACKEND:-} in
    gh|git) backend=$UPSTREAM_CHECK_BACKEND; return ;;
    '') ;;
    *) echo "$prog: UPSTREAM_CHECK_BACKEND must be gh or git" >&2; exit 2 ;;
  esac
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then backend=gh; else backend=git; fi
}

# ---- one upstream -------------------------------------------------------------
# check_one name repo paths sha -> prints one line, returns 0/1/2
check_one() {
  name=$1 repo=$2 paths=$3 sha=$4
  case $repo in */*) ;; *) echo "error     $name bad repo '$repo'"; return 2 ;; esac
  if ! printf '%s\n' "$sha" | grep -Eq '^[0-9a-f]{40}$'; then
    echo "error     $name absorbed commit is not a 40-hex sha: '$sha'"; return 2
  fi
  [ -n "$paths" ] || { echo "error     $name no watched paths"; return 2; }
  new=
  for p in $paths; do
    latest=$(fetch latest "$repo" "$p") || { echo "error     $name cannot read latest commit for $repo:$p"; return 2; }
    printf '%s\n' "$latest" | grep -Eq '^[0-9a-f]{40}$' ||
      { echo "error     $name bad sha for $repo:$p: '$latest'"; return 2; }
    [ "$latest" = "$sha" ] && continue
    fetch contains "$repo" "$sha" "$latest"; rc=$?
    case $rc in
      0) continue ;;
      1) ;;
      *) echo "error     $name cannot compare $sha..$latest in $repo"; return 2 ;;
    esac
    if [ -z "$new" ]; then new=$latest
    elif [ "$new" != "$latest" ]; then
      # keep the newer of the two: if new is an ancestor of latest, latest wins
      fetch contains "$repo" "$latest" "$new"; rc=$?
      case $rc in 0) new=$latest ;; 1) ;; *) echo "error     $name cannot order $new and $latest"; return 2 ;; esac
    fi
  done
  if [ -z "$new" ]; then
    echo "unchanged $name $(echo "$sha" | cut -c1-7)"; return 0
  fi
  echo "changed   $name $(echo "$sha" | cut -c1-7)..$(echo "$new" | cut -c1-7) https://github.com/$repo/compare/$sha...$new"
  return 1
}

run() {
  manifest=$1
  [ -f "$manifest" ] || { echo "$prog: manifest not found: $manifest" >&2; return 2; }
  rows=$(parse_manifest "$manifest") || { echo "$prog: cannot parse $manifest" >&2; return 2; }
  [ -n "$rows" ] || { echo "$prog: no rows under '## Upstreams' in $manifest" >&2; return 2; }
  pick_backend
  worst=0
  tab=$(printf '\t')
  # read from a here-doc, not a pipe, so $worst survives the loop
  while IFS=$tab read -r name repo paths sha; do
    [ -n "$name" ] || continue
    check_one "$name" "$repo" "$paths" "$sha"; rc=$?
    [ "$rc" -gt "$worst" ] && worst=$rc
  done <<EOF
$rows
EOF
  return $worst
}

main() {
  daily=0
  manifest=
  for a in "$@"; do
    case $a in
      --daily) daily=1 ;;
      --selftest) selftest; exit $? ;;
      -*) usage ;;
      *) [ -z "$manifest" ] || usage; manifest=$a ;;
    esac
  done
  manifest=${manifest:-$root/skills/design-arwen/UPSTREAM.md}

  stamp=
  today=$(date +%Y-%m-%d)
  if [ $daily = 1 ]; then
    gdir=$(git rev-parse --git-common-dir 2>/dev/null) ||
      { echo "$prog: --daily needs a git repo for its stamp" >&2; exit 2; }
    stamp="$gdir/skillator/upstream-check.day"
    if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$today" ]; then
      echo "skipped: upstreams already checked today ($stamp)"
      exit 0
    fi
  fi

  tmp=$(mktemp -d) || exit 2
  trap 'rm -rf "$tmp"' EXIT
  run "$manifest"; rc=$?
  if [ -n "$stamp" ] && [ $rc -le 1 ]; then
    mkdir -p "$(dirname "$stamp")" && echo "$today" > "$stamp"
  fi
  exit $rc
}

# ---- selftest ---------------------------------------------------------------
selftest() {
  st=$(mktemp -d) || return 1
  trap 'rm -rf "$st"' EXIT
  fail() { echo "FAIL: $1" >&2; exit 1; }
  A=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  B=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  C=cccccccccccccccccccccccccccccccccccccccc
  D=dddddddddddddddddddddddddddddddddddddddd
  # Stub: o/same stays at A; o/old's latest B is an ancestor of the absorbed A;
  # o/moved has moved to C (p1) and D (p2), D the newer; o/down is unreachable.
  cat > "$st/stub.sh" <<STUB
#!/bin/sh
case "\$1 \$2 \${3:-}" in
  "latest o/same "*)  echo $A ;;
  "latest o/old "*)   echo $B ;;
  "latest o/moved p1") echo $C ;;
  "latest o/moved p2") echo $D ;;
  "latest o/down "*)  exit 2 ;;
  "contains o/old $A") [ "\$4" = $B ] && exit 0; exit 1 ;;
  "contains o/moved $A") exit 1 ;;
  "contains o/moved $D") [ "\$4" = $C ] && exit 0; exit 1 ;;
  "contains o/moved $C") exit 1 ;;
  *) exit 2 ;;
esac
STUB
  export UPSTREAM_CHECK_FETCH="sh $st/stub.sh"
  me="$here/$prog"
  mk() { # mk file row...
    f=$1; shift
    { echo "# x"; echo; echo "## Upstreams"; echo
      echo "| Name | Repo | Watched paths | Absorbed commit | Absorbed | Sections |"
      echo "|---|---|---|---|---|---|"
      for r in "$@"; do echo "$r"; done
      echo; echo "## Other"; echo "| not | a | row | $A | x | y |"; } > "$f"
  }
  r_same="| same | \`o/same\` | \`a/b\` | \`$A\` | d | s |"
  r_old="| old | \`o/old\` | \`a\` | \`$A\` | d | s |"
  r_moved="| moved | \`o/moved\` | \`p1\`<br>\`p2\` | \`$A\` | d | s |"
  r_down="| down | \`o/down\` | \`x\` | \`$A\` | d | s |"

  mk "$st/m0" "$r_same" "$r_old"
  out=$(sh "$me" "$st/m0"); rc=$?
  [ $rc = 0 ] || fail "unchanged: exit $rc, want 0: $out"
  [ "$(echo "$out" | grep -c '^unchanged ')" = 2 ] || fail "unchanged: want 2 unchanged lines: $out"
  echo "$out" | grep -q 'not ' && fail "a table outside ## Upstreams was parsed"

  mk "$st/m1" "$r_same" "$r_moved"
  out=$(sh "$me" "$st/m1"); rc=$?
  [ $rc = 1 ] || fail "changed: exit $rc, want 1: $out"
  echo "$out" | grep -q "^changed   moved aaaaaaa..ddddddd https://github.com/o/moved/compare/$A...$D\$" ||
    fail "changed: want old..newest + compare url: $out"

  mk "$st/m2" "$r_same" "$r_moved" "$r_down"
  out=$(sh "$me" "$st/m2"); rc=$?
  [ $rc = 2 ] || fail "network failure: exit $rc, want 2: $out"
  echo "$out" | grep -q '^error     down ' || fail "network failure: want an error line: $out"
  echo "$out" | grep -q '^unchanged down' && fail "network failure reported as unchanged"
  echo "$out" | grep -q '^changed   moved' || fail "a failure hid another row's change: $out"

  mk "$st/m3" "| bad | \`o/same\` | \`a\` | \`abc123\` | d | s |"
  out=$(sh "$me" "$st/m3"); rc=$?
  [ $rc = 2 ] || fail "short sha: exit $rc, want 2: $out"
  mk "$st/m4"
  sh "$me" "$st/m4" >/dev/null 2>&1; rc=$?
  [ $rc = 2 ] || fail "empty table: exit $rc, want 2"
  sh "$me" "$st/nope" >/dev/null 2>&1; rc=$?
  [ $rc = 2 ] || fail "missing manifest: exit $rc, want 2"

  # --daily: stamp in a scratch repo; a failed run leaves no stamp
  git init -q "$st/repo" || fail "git init"
  (cd "$st/repo" && sh "$me" --daily "$st/m2" >/dev/null); rc=$?
  [ $rc = 2 ] || fail "daily failed run: exit $rc"
  [ -f "$st/repo/.git/skillator/upstream-check.day" ] && fail "daily: stamp written on exit 2"
  (cd "$st/repo" && sh "$me" --daily "$st/m1" >/dev/null); rc=$?
  [ $rc = 1 ] || fail "daily first run: exit $rc, want 1"
  [ "$(cat "$st/repo/.git/skillator/upstream-check.day")" = "$(date +%Y-%m-%d)" ] || fail "daily: no stamp"
  out=$(cd "$st/repo" && sh "$me" --daily "$st/m1"); rc=$?
  [ $rc = 0 ] && echo "$out" | grep -q '^skipped:' || fail "daily second run not skipped: $rc $out"

  echo "ok - upstream-check.sh selftest"
}

main "$@"
