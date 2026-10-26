#!/bin/sh
# codegraph-check.sh - the arming step's codegraph line, read-only (A128).
#
#   sh codegraph-check.sh            -> one line for the state banner
#   sh codegraph-check.sh selftest   -> `ok`, or dies
#
# Hosts that run PowerShell use codegraph-check.ps1 - same output. Shipped as a
# script because a host translating arming.md's POSIX commands into PowerShell
# by hand produced a ParserError (MissingTypename) in Codex.
#
# Lines:
#   codegraph: missing - offer `npm i -g @colbymchenry/codegraph` (never install silently)
#   codegraph: not indexed - run `codegraph init`, then `codegraph index`, once
#   codegraph <indexed>/<tracked> [partial] (<langs> only)[ - N pending: codegraph sync]
# Partial: indexed under half of tracked, or the repo tracks .sh/.ps1/.md
# (codegraph indexes none of them) - then shell, PowerShell, Markdown and
# file-name references are grep's, not codegraph's.

line_of() {   # <status text> <tracked> <tracks sh/ps1/md: 1|0>
  printf '%s\n' "$1" | awk -v tr="$2" -v other="$3" '
    /^ *Files: / { f = $2; gsub(/,/, "", f) }
    /^Files by Language:/ { inl = 1; next }
    inl && /^ *[a-z]/ { langs[++n] = $1; next }
    inl && !/^ *[a-z]/ { inl = 0 }
    /^ *(Added|Modified|Removed|Deleted): / { p += $2 }
    END {
      if (f == "" || f + 0 == 0) { print "codegraph: not indexed - run `codegraph init`, then `codegraph index`, once"; exit }
      for (i = 1; i <= n; i++) for (j = i + 1; j <= n; j++) if (langs[j] < langs[i]) { t = langs[i]; langs[i] = langs[j]; langs[j] = t }
      ls = ""; for (i = 1; i <= n; i++) { l = langs[i]; if (l == "javascript") l = "js"; else if (l == "typescript") l = "ts"; else if (l == "python") l = "py"; ls = ls (ls == "" ? "" : "/") l }
      part = (f * 2 < tr || other) ? " partial" : ""
      out = "codegraph " f "/" tr part (ls == "" ? "" : " (" ls " only)")
      if (p) out = out " - " p " pending: codegraph sync"
      print out
    }'
}

run() {
  command -v codegraph >/dev/null 2>&1 || { echo 'codegraph: missing - offer `npm i -g @colbymchenry/codegraph` (never install silently)'; return 0; }
  st=$(codegraph status 2>&1) || st=
  tr=$(git ls-files 2>/dev/null | wc -l | tr -d ' ')
  if git ls-files 2>/dev/null | grep -Eq '\.(sh|ps1|md)$'; then other=1; else other=0; fi
  line_of "$st" "${tr:-0}" "$other"
}

selftest() {
  s='Index Statistics:
  Files:     22
  Nodes:     600

Files by Language:
  javascript      13
  python          8
  typescript      1

Pending Changes:
  Added:     1 files
  Modified:  1 files'
  got=$(line_of "$s" 1102 1); want="codegraph 22/1102 partial (js/py/ts only) - 2 pending: codegraph sync"
  [ "$got" = "$want" ] || { echo "FAIL: got '$got' want '$want'" >&2; exit 1; }
  got=$(line_of "$(printf 'Index Statistics:\n  Files:     40\nFiles by Language:\n  python  40\n')" 50 0); want="codegraph 40/50 (py only)"
  [ "$got" = "$want" ] || { echo "FAIL: got '$got' want '$want'" >&2; exit 1; }
  got=$(line_of "$(printf 'Index Statistics:\n  Files:     0\n')" 50 0)
  case $got in 'codegraph: not indexed'*) ;; *) echo "FAIL: zero files: $got" >&2; exit 1 ;; esac
  got=$(line_of "" 50 0)
  case $got in 'codegraph: not indexed'*) ;; *) echo "FAIL: no status: $got" >&2; exit 1 ;; esac
  if LC_ALL=C grep -q "$(printf '[\200-\377]')" "$0"; then echo "FAIL: non-ASCII in $0" >&2; exit 1; fi
  echo ok
}

case "${1:-}" in
  '') run ;;
  selftest) selftest ;;
  *) echo "usage: codegraph-check.sh [selftest]" >&2; exit 2 ;;
esac
