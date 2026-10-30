#!/bin/sh
# code-vader: unified pre-commit diff review helper replicating Claude Code
# /code-review (correctness & safety) and Ponytail / code-yoda (restraint,
# anti-bloat, and shortcut/ponytail debt ledger) across all hosts (F125).
#
#   code-vader.sh [collect] [--repo DIR] [--staged|--unstaged|--auto]
#   code-vader.sh format [--target LABEL] [FINDINGS_FILE]
#   code-vader.sh --selftest
#
# Findings input format (one pipe-delimited record per line; # and blanks ignored):
#   SEVERITY|LENS|FILE:LINE|CLAIM|FIX|NET_LINES
#   - SEVERITY: critical | high | important | low
#   - LENS: correctness | security | race | null | error-return | types |
#           regression | restraint:reuse | restraint:stdlib | restraint:native |
#           restraint:yagni | restraint:delete | restraint:merge |
#           restraint:shrink | debt:no-trigger
#   - NET_LINES: integer lines removable (e.g. -18 or 18 or 0; optional)
#   Or debt marker lines prefixed with:
#   MARKER|FILE:LINE|WHAT|CEILING|TRIGGER
#
# Outputs ranked findings by severity (critical -> high -> important -> low) and
# file:line, debt marker ledger, net line reduction estimate, and ends with a
# definitive binary verdict:
#   READY-TO-COMMIT: YES       (exit 0)
#   CHANGES-REQUESTED          (exit 1)
set -u

prog=code-vader.sh

usage() {
  echo "usage: $prog [collect] [--repo DIR] [--staged|--unstaged|--auto]" >&2
  echo "       $prog format [--target LABEL] [FINDINGS_FILE]" >&2
  echo "       $prog --selftest" >&2
  exit 2
}

die() { echo "$prog: $1" >&2; exit "${2:-2}"; }

parse_marker_body() {
  # Given comment body after shortcut:/ponytail:, emit WHAT|CEILING|TRIGGER
  body=$1
  body=$(printf '%s' "$body" | sed 's/^[ 	]*//; s/[ 	]*\(-->|\*\/\)[ 	]*$//; s/[ 	]*$//')
  case $body in
    *"trigger:"*)
      before=${body%%trigger:*}
      trig=${body#*trigger:}
      before=$(printf '%s' "$before" | sed 's/[ 	]*[,;.-][ 	]*$//; s/[ 	]*$//')
      trig=$(printf '%s' "$trig" | sed 's/^[ 	]*//; s/[ 	]*[.][ 	]*$//; s/^"//; s/"$//')
      [ -n "$before" ] || before=$body
      [ -n "$trig" ] || trig="no-trigger"
      printf '%s|%s|%s\n' "$before" "$before" "$trig"
      ;;
    *,*)
      ceil=${body%%,*}
      rest=${body#*,}
      ceil=$(printf '%s' "$ceil" | sed 's/^[ 	]*//; s/[ 	]*$//')
      rest=$(printf '%s' "$rest" | sed 's/^[ 	]*//; s/[ 	]*[.][ 	]*$//')
      if printf '%s' "$rest" | grep -Eq '^(if |when |once |until |add |switch |move |replace |per-|at |after )'; then
        printf '%s|%s|%s\n' "$ceil" "$ceil" "$rest"
      else
        printf '%s|%s|no-trigger\n' "$body" "$body"
      fi
      ;;
    *)
      printf '%s|%s|no-trigger\n' "$body" "$body"
      ;;
  esac
}

do_collect() {
  repo=.
  mode=auto
  while [ $# -gt 0 ]; do
    case $1 in
      --repo|-Repo)
        [ $# -ge 2 ] || usage
        repo=$2; shift 2 ;;
      --staged|-Staged) mode=staged; shift ;;
      --unstaged|-Unstaged) mode=unstaged; shift ;;
      --auto|-Auto) mode=auto; shift ;;
      *) usage ;;
    esac
  done

  [ -d "$repo" ] || die "repository directory not found: $repo" 2
  git -c "safe.directory=*" -C "$repo" rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
    die "not a git repository: $repo" 2

  target=$mode
  if [ "$mode" = auto ]; then
    if ! git -c "safe.directory=*" -C "$repo" diff --cached --quiet 2>/dev/null; then
      target=staged
    elif ! git -c "safe.directory=*" -C "$repo" diff --quiet 2>/dev/null; then
      target=unstaged
    else
      target=empty
    fi
  elif [ "$mode" = staged ]; then
    if git -c "safe.directory=*" -C "$repo" diff --cached --quiet 2>/dev/null; then
      target=empty
    fi
  elif [ "$mode" = unstaged ]; then
    if git -c "safe.directory=*" -C "$repo" diff --quiet 2>/dev/null; then
      target=empty
    fi
  fi

  if [ "$target" = empty ]; then
    echo "target: empty"
    echo "files: 0"
    echo "markers: 0 total, 0 no-trigger."
    return 0
  fi

  if [ "$target" = staged ]; then
    files=$(git -c "safe.directory=*" -C "$repo" diff --cached --name-only --diff-filter=ACMR)
    diff_out=$(git -c "safe.directory=*" -C "$repo" diff --cached --no-color -U3)
  else
    files=$(git -c "safe.directory=*" -C "$repo" diff --name-only --diff-filter=ACMR)
    diff_out=$(git -c "safe.directory=*" -C "$repo" diff --no-color -U3)
  fi

  f_cnt=0
  nl='
'
  IFS=$nl
  for f in $files; do
    [ -n "$f" ] && f_cnt=$((f_cnt + 1))
  done
  unset IFS

  echo "target: $target"
  echo "files: $f_cnt"
  echo "changed_files:"
  IFS=$nl
  for f in $files; do
    [ -n "$f" ] && echo "  $f"
  done
  unset IFS

  echo "debt_markers:"
  m_cnt=0
  nt_cnt=0
  IFS=$nl
  for f in $files; do
    [ -n "$f" ] || continue
    case $f in
      *.md|*.txt|*.rst|*.adoc|*.jsonl|*.log) continue ;;
    esac
    full="$repo/$f"
    [ -f "$full" ] || continue
    hits=$(grep -nE '(#|//|--|;|%|<!--|/\*|^\s*\*).*\b(shortcut|ponytail):' "$full" 2>/dev/null || true)
    for h in $hits; do
      [ -n "$h" ] || continue
      lno=${h%%:*}
      rest=${h#*:}
      # Skip CSS selectors/custom properties and keyboard shortcuts
      if printf '%s' "$rest" | grep -Eq '(#shortcut:[a-zA-Z]|--shortcut:|Ctrl\+|Alt\+|Cmd\+)'; then
        continue
      fi
      body=$(printf '%s' "$rest" | sed -E 's/^.*\b(shortcut|ponytail):[ 	]*//')
      parsed=$(parse_marker_body "$body")
      what=${parsed%%|*}
      rem=${parsed#*|}
      ceil=${rem%%|*}
      trig=${rem#*|}
      m_cnt=$((m_cnt + 1))
      if [ "$trig" = "no-trigger" ]; then
        nt_cnt=$((nt_cnt + 1))
        echo "  $f:$lno — $what. ceiling: \"$ceil\". trigger: no-trigger."
      else
        echo "  $f:$lno — $what. ceiling: \"$ceil\". trigger: \"$trig\"."
      fi
    done
  done
  unset IFS
  if [ "$m_cnt" -eq 0 ]; then
    echo "  No shortcut debt. Clean ledger."
  fi
  echo "markers: $m_cnt total, $nt_cnt no-trigger."
  echo "diff:"
  printf '%s\n' "$diff_out"
  return 0
}

do_format() {
  target_label="staged"
  infile=
  while [ $# -gt 0 ]; do
    case $1 in
      --target|-Target)
        [ $# -ge 2 ] || usage
        target_label=$2; shift 2 ;;
      -*) usage ;;
      *)
        [ -z "$infile" ] || usage
        infile=$1; shift ;;
    esac
  done

  if [ -n "$infile" ]; then
    [ -f "$infile" ] || die "findings file not found: $infile" 2
    input=$(cat "$infile")
  else
    input=$(cat)
  fi

  tmp=$(mktemp -d) || exit 2
  trap 'rm -rf "$tmp"' EXIT

  printf '%s\n' "$input" > "$tmp/raw.txt"

  awk -F'|' -v tmp="$tmp" '
    BEGIN {
      f_cnt = 0; m_cnt = 0; nt_cnt = 0; net = 0; blocking = 0; bad = 0
    }
    /^[ \t]*$/ || /^[ \t]*#/ { next }
    $1 == "MARKER" {
      loc = $2; what = $3; ceil = $4; trig = $5
      gsub(/^[ \t]+|[ \t]+$/, "", loc)
      gsub(/^[ \t]+|[ \t]+$/, "", what)
      gsub(/^[ \t]+|[ \t]+$/, "", ceil)
      gsub(/^[ \t]+|[ \t]+$/, "", trig)
      if (trig == "" || trig == "no-trigger") {
        trig_str = "no-trigger"
        nt_cnt++
        blocking++
        # Also register as an important finding so it ranks in the findings list
        f_cnt++
        printf "3|%s|debt:no-trigger|important|shortcut marker \"%s\" has no revisit trigger|add a concrete revisit trigger to the comment|0\n", loc, what >> (tmp "/findings.txt")
      } else {
        trig_str = "\"" trig "\""
      }
      m_cnt++
      printf "- %s — %s. ceiling: \"%s\". trigger: %s.\n", loc, what, ceil, trig_str >> (tmp "/markers.txt")
      next
    }
    {
      sev = tolower($1); lens = $2; loc = $3; claim = $4; fix = $5; lines = $6
      gsub(/^[ \t]+|[ \t]+$/, "", sev)
      gsub(/^[ \t]+|[ \t]+$/, "", lens)
      gsub(/^[ \t]+|[ \t]+$/, "", loc)
      gsub(/^[ \t]+|[ \t]+$/, "", claim)
      gsub(/^[ \t]+|[ \t]+$/, "", fix)
      gsub(/^[ \t]+|[ \t]+$/, "", lines)
      if (sev == "critical") rank = 1
      else if (sev == "high") rank = 2
      else if (sev == "important") rank = 3
      else if (sev == "low") rank = 4
      else {
        printf "invalid severity: %s\n", sev > (tmp "/err.txt")
        bad = 1
        exit 2
      }
      if (loc == "" || claim == "") {
        printf "missing location or claim on line: %s\n", $0 > (tmp "/err.txt")
        bad = 1
        exit 2
      }
      if (rank <= 3) blocking++
      n = lines + 0
      if (n < 0) n = -n
      net += n
      f_cnt++
      printf "%d|%s|%s|%s|%s|%s|%d\n", rank, loc, lens, sev, claim, fix, n >> (tmp "/findings.txt")
    }
    END {
      if (bad) exit 2
      printf "%d|%d|%d|%d|%d\n", f_cnt, m_cnt, nt_cnt, net, blocking > (tmp "/meta.txt")
    }
  ' "$tmp/raw.txt" || {
    [ -f "$tmp/err.txt" ] && die "$(cat "$tmp/err.txt")" 2
    die "failed to parse findings" 2
  }

  IFS='|' read -r f_cnt m_cnt nt_cnt net blocking < "$tmp/meta.txt"

  echo "## Code-Vader Pre-Commit Review"
  echo "target: $target_label"
  echo ""
  echo "### Ranked Findings"
  if [ "$f_cnt" -eq 0 ]; then
    echo "None."
  else
    sort_bin="sort"
    if [ -x "/usr/bin/sort" ]; then
      sort_bin="/usr/bin/sort"
    fi
    LC_ALL=C "$sort_bin" -t'|' -k1,1n -k2,2 "$tmp/findings.txt" | awk -F'|' '
      {
        idx++
        rank = $1; loc = $2; lens = $3; sev = $4; claim = $5; fix = $6; n = $7 + 0
        if (sev == "") sev = "important"
        tail = ""
        if (n > 0) tail = sprintf(" (-%d lines)", n)
        if (fix != "") {
          printf "%d. [%s] [%s] %s — %s. Fix: %s%s.\n", idx, sev, lens, loc, claim, fix, tail
        } else {
          printf "%d. [%s] [%s] %s — %s%s.\n", idx, sev, lens, loc, claim, tail
        }
      }
    '
  fi

  echo ""
  echo "### Restraint & Debt Ledger"
  if [ "$m_cnt" -eq 0 ]; then
    echo "No shortcut debt. Clean ledger."
  else
    cat "$tmp/markers.txt"
  fi
  echo "markers: $m_cnt total, $nt_cnt no-trigger."
  if [ "$net" -gt 0 ]; then
    echo "net: -$net lines possible."
  else
    echo "net: 0 lines (lean already)."
  fi
  echo ""
  if [ "$blocking" -gt 0 ]; then
    echo "CHANGES-REQUESTED"
    return 1
  else
    echo "READY-TO-COMMIT: YES"
    return 0
  fi
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

  here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
  me="$here/$prog"

  # 1. Create a temp git repo and verify collect on staged and unstaged diffs + debt markers
  repo="$st/repo"
  mkdir -p "$repo/src"
  git -c "safe.directory=*" -c core.hooksPath=/dev/null -c commit.gpgsign=false -C "$repo" init -q -b main
  git -c "safe.directory=*" -C "$repo" config user.name "Test"
  git -c "safe.directory=*" -C "$repo" config user.email "test@example.invalid"
  cat > "$repo/src/app.py" <<'EOF'
def greet(name):
    return "hi " + name
EOF
  git -c "safe.directory=*" -C "$repo" add src/app.py
  git -c "safe.directory=*" -c commit.gpgsign=false -C "$repo" commit -qm "init"

  # Empty diff check
  out=$(sh "$me" collect --repo "$repo" 2>&1); rc=$?
  assert_ok "$([ $rc = 0 ] && echo 0 || echo 1)" "empty diff exits 0"
  echo "$out" | grep -q "^target: empty$"
  assert_ok $? "empty diff reports target: empty: $out"

  # Stage changes with two shortcut/ponytail markers (one with trigger, one no-trigger)
  cat > "$repo/src/app.py" <<'EOF'
# shortcut: global lock, per-account locks when throughput exceeds 100 rps
# ponytail: linear scan
def greet(name):
    return "hello " + name.strip()
EOF
  git -c "safe.directory=*" -C "$repo" add src/app.py
  out=$(sh "$me" collect --repo "$repo" 2>&1); rc=$?
  assert_ok "$([ $rc = 0 ] && echo 0 || echo 1)" "staged collect exits 0"
  echo "$out" | grep -q "^target: staged$"
  assert_ok $? "staged collect reports target: staged: $out"
  echo "$out" | grep -q "^files: 1$"
  assert_ok $? "staged collect counts 1 changed file: $out"
  echo "$out" | grep -q 'src/app.py:1 — global lock. ceiling: "global lock". trigger: "per-account locks when throughput exceeds 100 rps".'
  assert_ok $? "staged collect parses shortcut trigger: $out"
  echo "$out" | grep -q 'src/app.py:2 — linear scan. ceiling: "linear scan". trigger: no-trigger.'
  assert_ok $? "staged collect flags no-trigger ponytail marker: $out"
  echo "$out" | grep -q "^markers: 2 total, 1 no-trigger.$"
  assert_ok $? "staged collect totals markers: $out"

  # 2. Format rankings: mixed severities & lenses -> sorted by severity then file:line, net lines summed, CHANGES-REQUESTED (exit 1)
  cat > "$st/findings1.txt" <<'EOF'
low|restraint:reuse|src/cli.ts:88|Duplicate padRight helper|reuse src/format.ts:padRight|-9
important|restraint:yagni|src/cache.ts:10|AbstractCacheProvider has one implementation|inline into MemoryCache|-28
critical|correctness|src/auth.ts:42|Unchecked verify return allows expired token|check err and return 401|0
high|security|scripts/sync.sh:19|Unquoted variable in eval|pass positional args|0
important|restraint:stdlib|src/util.py:55|Hand-rolled slug loop|use re.sub|-14
MARKER|src/worker.ts:14|global lock|global lock|add sharded lock at 500 rps
EOF
  out=$(sh "$me" format --target "staged (5 files)" "$st/findings1.txt" 2>&1); rc=$?
  assert_ok "$([ $rc = 1 ] && echo 0 || echo 1)" "format with blocking findings exits 1, got $rc"
  echo "$out" | grep -q "^1\. \[critical\] \[correctness\] src/auth.ts:42 — Unchecked verify return allows expired token\. Fix: check err and return 401\.$"
  assert_ok $? "critical finding ranked #1: $out"
  echo "$out" | grep -q "^2\. \[high\] \[security\] scripts/sync.sh:19 — Unquoted variable in eval\. Fix: pass positional args\.$"
  assert_ok $? "high finding ranked #2: $out"
  echo "$out" | grep -q "^3\. \[important\] \[restraint:yagni\] src/cache.ts:10 — AbstractCacheProvider has one implementation\. Fix: inline into MemoryCache (-28 lines)\.$"
  assert_ok $? "important yagni finding ranked #3 with line count: $out"
  echo "$out" | grep -q "^4\. \[important\] \[restraint:stdlib\] src/util.py:55 — Hand-rolled slug loop\. Fix: use re.sub (-14 lines)\.$"
  assert_ok $? "important stdlib finding ranked #4 with line count: $out"
  echo "$out" | grep -q "^5\. \[low\] \[restraint:reuse\] src/cli.ts:88 — Duplicate padRight helper\. Fix: reuse src/format.ts:padRight (-9 lines)\.$"
  assert_ok $? "low reuse finding ranked #5: $out"
  echo "$out" | grep -q "^net: -51 lines possible\.$"
  assert_ok $? "net line estimate sums to -51: $out"
  last_line=$(printf '%s\n' "$out" | tail -n 1)
  assert_ok "$([ "$last_line" = "CHANGES-REQUESTED" ] && echo 0 || echo 1)" "final line is CHANGES-REQUESTED, got '$last_line'"

  # 3. Clean diff or low-only findings -> READY-TO-COMMIT: YES (exit 0)
  cat > "$st/findings_clean.txt" <<'EOF'
low|restraint:shrink|src/app.py:12|Comprehension over manual append|use list comprehension|-3
MARKER|src/app.py:1|global lock|global lock|per-account locks at 100 rps
EOF
  out=$(sh "$me" format --target "staged (1 file)" "$st/findings_clean.txt" 2>&1); rc=$?
  assert_ok "$([ $rc = 0 ] && echo 0 || echo 1)" "low-only findings with triggered marker exits 0, got $rc: $out"
  last_line=$(printf '%s\n' "$out" | tail -n 1)
  assert_ok "$([ "$last_line" = "READY-TO-COMMIT: YES" ] && echo 0 || echo 1)" "final line is READY-TO-COMMIT: YES, got '$last_line'"

  # 4. A no-trigger debt marker blocks commit (CHANGES-REQUESTED, exit 1)
  cat > "$st/findings_debt.txt" <<'EOF'
MARKER|src/billing.py:7|global lock|global lock|no-trigger
EOF
  out=$(sh "$me" format --target "staged (1 file)" "$st/findings_debt.txt" 2>&1); rc=$?
  assert_ok "$([ $rc = 1 ] && echo 0 || echo 1)" "no-trigger marker blocks commit with exit 1, got $rc"
  echo "$out" | grep -q "\[important\] \[debt:no-trigger\] src/billing.py:7"
  assert_ok $? "no-trigger marker surfaced in ranked findings: $out"
  echo "$out" | grep -q "^markers: 1 total, 1 no-trigger\.$"
  assert_ok $? "no-trigger count reported: $out"

  # 5. Invalid severity rejected with exit 2
  printf 'blocker|correctness|a.py:1|bad|fix|0\n' | sh "$me" format >/dev/null 2>&1; rc=$?
  assert_ok "$([ $rc = 2 ] && echo 0 || echo 1)" "invalid severity rejected with exit 2, got $rc"

  [ $fail_cnt -eq 0 ] || exit 1
  echo "ok - code-vader.sh selftest ($pass/$pass passed)"
}

case "${1:-collect}" in
  --selftest|-SelfTest|-Selftest) [ $# -eq 1 ] || usage; selftest; exit $? ;;
  collect) shift; do_collect "$@"; exit $? ;;
  format)  shift; do_format "$@"; exit $? ;;
  --repo|--staged|--unstaged|--auto|-*) do_collect "$@"; exit $? ;;
  *) usage ;;
esac
