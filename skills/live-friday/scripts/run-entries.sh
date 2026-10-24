#!/bin/sh
# run-entries.sh - the one writer of .skillator/run.json (F79): the repo's build, run and
# installer entry points, as the ops board's Run tab lists them. Windows twin:
# run-entries.ps1, same bytes out; keep the two in step.
#
#   run-entries.sh scan                 find the entry points and merge them into
#                                       .skillator/run.json (created by the first scan);
#                                       prints one summary line
#   run-entries.sh rename <id> <name>   that entry's name, saved (one line, 1-80 bytes)
#   run-entries.sh selftest             fixture repo, every subcommand, prints ok
#
# Run in the repo root (the ops board runs it there, by absolute shell - A150). Found,
# in this order, and nothing else:
#   package.json "scripts" (the root one)       npm   npm run <script>
#   GNUmakefile | makefile | Makefile targets   make  make <target>
#   files at the root, then in scripts/, named
#   (install|build|run|setup|start|dev)[[._-]..].(sh|ps1)   sh  sh <path> / ps1  powershell -File <path>
# Merge: an entry found again keeps its name (a rename) and args; a new one is added at
# the end; one no longer found stays, "missing": true; an entry added by hand (any id,
# a kind of npm|make|sh|ps1 and a target, optional args and cwd) stays as written. Each
# entry: id, name, kind, target, args, command, cwd, source, missing. A run.json that is
# not JSON is never overwritten. Strings are kept as their JSON text, escapes and all.
set -u
LC_ALL=C
export LC_ALL

FILE=.skillator/run.json

die() { echo "run-entries: $*" >&2; exit 1; }

# JSON -> one line per value: <path> TAB <obj|arr|str|lit> TAB <raw text>, path segments
# each led by \034 (array items by index from 0). Strings stay as written (escapes kept;
# a raw tab becomes \t). Printed only when the whole input parsed; else exit 3.
JFLAT='
function ws(  c) { while (i <= n) { c = substr(buf, i, 1); if (c == " " || c == "\t" || c == "\n" || c == "\r") i++; else break } }
function str(  s, c) {
  i++; s = ""
  while (i <= n) {
    c = substr(buf, i, 1)
    if (c == "\\") { s = s c substr(buf, i + 1, 1); i += 2; continue }
    if (c == "\"") { i++; return s }
    if (c == "\t") c = "\\t"
    s = s c; i++
  }
  bad = 1; return s
}
function emit(p, t, r) { out[++no] = p "\t" t "\t" r }
function val(p,  c, k, ix, s) {
  if (bad) return
  ws(); c = substr(buf, i, 1)
  if (c == "{") {
    emit(p, "obj", ""); i++; ws()
    if (substr(buf, i, 1) == "}") { i++; return }
    while (!bad) {
      ws(); if (substr(buf, i, 1) != "\"") { bad = 1; return }
      k = str(); ws()
      if (substr(buf, i, 1) != ":") { bad = 1; return }
      i++; val(p S k); ws()
      c = substr(buf, i, 1); i++
      if (c == "}") return
      if (c != ",") { bad = 1; return }
    }
    return
  }
  if (c == "[") {
    emit(p, "arr", ""); i++; ws()
    if (substr(buf, i, 1) == "]") { i++; return }
    ix = 0
    while (!bad) {
      val(p S ix); ix++; ws()
      c = substr(buf, i, 1); i++
      if (c == "]") return
      if (c != ",") { bad = 1; return }
    }
    return
  }
  if (c == "\"") { s = str(); emit(p, "str", s); return }
  s = ""
  while (i <= n) { c = substr(buf, i, 1); if (index(",}] \t\r\n", c)) break; s = s c; i++ }
  if (s !~ /^(true|false|null|-?[0-9][0-9.eE+-]*)$/) { bad = 1; return }
  emit(p, "lit", s)
}
{ buf = buf $0 "\n" }
END {
  S = "\034"; n = length(buf); i = 1
  if (substr(buf, 1, 3) == "\357\273\277") i = 4
  val(""); ws()
  if (bad || i <= n) exit 3
  for (k = 1; k <= no; k++) print out[k]
}'

# The merge and the writer. In: "E" TAB <a JFLAT line of run.json>, "D" TAB kind TAB
# target TAB source (found now). RE_MODE scan | rename (RE_ID, RE_NAME: JSON text).
# Out: run.json; RE_SUM gets "<entries> <new> <missing> <renamed>".
MERGE='
function safe(t) { return t != "" && t !~ /^\// && t !~ /^[A-Za-z]:/ && t !~ /(^|\/)\.\.(\/|$)/ && t !~ /\\/ }
function okkind(k) { return k == "npm" || k == "make" || k == "sh" || k == "ps1" }
function present(k, t,  r, x) {
  if ((k ":" t) in dsrc) return 1
  if ((k == "sh" || k == "ps1") && safe(t)) { r = (getline x < t); close(t); return r >= 0 }
  return 0
}
function defname(k, t) { return k == "npm" ? "npm run " t : k == "make" ? "make " t : t }
function command(k, t, as) {
  if (k == "npm") return "npm run " t (as == "" ? "" : " --" as)
  if (k == "make") return "make " t as
  if (k == "sh") return "sh " t as
  if (k == "ps1") return "powershell -File " t as
  return ""
}
function row(id, name, k, t, aj, as, cwd, src, miss) {
  rows[++nr] = "    { \"id\": \"" id "\", \"name\": \"" name "\", \"kind\": \"" k "\", \"target\": \"" t "\", \"args\": " aj \
    ", \"command\": \"" command(k, t, as) "\", \"cwd\": \"" cwd "\", \"source\": \"" src "\", \"missing\": " (miss ? "true" : "false") " }"
  if (miss) nmiss++
}
BEGIN { FS = "\t"; S = "\034"; mode = ENVIRON["RE_MODE"]; ne = -1 }
$1 == "D" { k = $2 ":" $3; if (!(k in dsrc)) { dk[++nd] = k; dkind[nd] = $2; dtgt[nd] = $3; dsrc[k] = $4 }; next }
$1 == "E" {
  np = split($2, p, S)
  if (np < 3 || p[2] != "entries") next
  ix = p[3] + 0
  if (np == 3) { if ($3 == "obj") { isent[ix] = 1; if (ix > ne) ne = ix }; next }
  f = p[4]
  if (np == 4) { if ($3 == "str") v[ix, f] = $4; else if ($3 == "lit") l[ix, f] = $4; next }
  if (np == 5 && f == "args" && $3 == "str") { na[ix]++; av[ix, na[ix]] = $4 }
}
END {
  for (ix = 0; ix <= ne; ix++) {
    if (!(ix in isent)) continue
    id = v[ix, "id"]; if (id == "") id = "hand-" (ix + 1)
    if (id in used) { c = 2; while ((id "-" c) in used) c++; id = id "-" c }
    used[id] = 1
    k = v[ix, "kind"]; t = v[ix, "target"]
    cwd = v[ix, "cwd"]; if (cwd == "") cwd = "."
    aj = "["; as = ""
    for (j = 1; j <= na[ix]; j++) { aj = aj (j > 1 ? ", " : "") "\"" av[ix, j] "\""; as = as " " av[ix, j] }
    aj = aj "]"
    name = v[ix, "name"]; if (name == "") name = defname(k, t)
    if (mode == "rename" && id == ENVIRON["RE_ID"]) { name = ENVIRON["RE_NAME"]; renamed = 1 }
    if (mode == "scan") {
      miss = !okkind(k) || t == "" || !present(k, t) || !(cwd == "." || safe(cwd)) || ((k == "sh" || k == "ps1") && !safe(t))
      src = id == k ":" t && (id in dsrc) ? dsrc[id] : v[ix, "source"]
    } else { miss = l[ix, "missing"] == "true"; src = v[ix, "source"] }
    if (src == "") src = "hand"
    row(id, name, k, t, aj, as, cwd, src, miss)
  }
  if (mode == "scan") for (d = 1; d <= nd; d++) {
    if (dk[d] in used) continue
    used[dk[d]] = 1; nnew++
    row(dk[d], defname(dkind[d], dtgt[d]), dkind[d], dtgt[d], "[]", "", ".", dsrc[dk[d]], 0)
  }
  print "{"
  print "  \"version\": 1,"
  if (!nr) print "  \"entries\": []"
  else {
    print "  \"entries\": ["
    for (r = 1; r <= nr; r++) print rows[r] (r < nr ? "," : "")
    print "  ]"
  }
  print "}"
  print nr + 0, nnew + 0, nmiss + 0, renamed + 0 > ENVIRON["RE_SUM"]
}'

SCRIPT_RE='^(install|build|run|setup|start|dev)([._-][A-Za-z0-9._-]*)?\.(sh|ps1)$'

# The files of a dir, one per line, byte order (LC_ALL=C globs sort so).
files_in() {
  for f in "$1"/*; do [ -f "$f" ] && printf '%s\n' "${f##*/}"; done
}

# kind TAB target TAB source, in the order the header names.
discover() {
  if [ -f package.json ]; then
    awk "$JFLAT" package.json 2>/dev/null | awk 'BEGIN { FS = "\t"; S = "\034" }
      { n = split($1, p, S); if (n == 3 && p[2] == "scripts" && $2 == "str") print "npm\t" p[3] "\tpackage.json" }'
  fi
  root=$(files_in .)
  mf=''
  for m in GNUmakefile makefile Makefile; do
    printf '%s\n' "$root" | grep -qx "$m" && { mf=$m; break; }
  done
  if [ -n "$mf" ]; then
    awk -v src="$mf" '{
      sub(/\r$/, ""); p = index($0, ":"); if (!p) next
      head = substr($0, 1, p - 1); nx = substr($0, p + 1, 2)
      if (nx ~ /^=/ || nx == ":=") next
      if (head !~ /^[A-Za-z0-9_][A-Za-z0-9_.-]*([ \t]+[A-Za-z0-9_][A-Za-z0-9_.-]*)*[ \t]*$/) next
      n = split(head, ts, /[ \t]+/)
      for (j = 1; j <= n; j++) if (ts[j] != "" && !(ts[j] in seen)) { seen[ts[j]] = 1; print "make\t" ts[j] "\t" src }
    }' "$mf"
  fi
  printf '%s\n' "$root" | grep -E "$SCRIPT_RE" | while IFS= read -r f; do
    printf '%s\t%s\t%s\n' "${f##*.}" "$f" "$f"
  done
  if [ -d scripts ]; then
    files_in scripts | grep -E "$SCRIPT_RE" | while IFS= read -r f; do
      printf '%s\t%s\t%s\n' "${f##*.}" "scripts/$f" "scripts/$f"
    done
  fi
}

# The entries of run.json as JFLAT lines (nothing when absent). A file that is not JSON
# stops here: it is never overwritten.
existing() {
  [ -f "$FILE" ] || return 0
  awk "$JFLAT" "$FILE" || die "$FILE is not valid JSON - fix it or delete it, then scan again"
}

# JSON text of an argument: backslash and quote escaped (control characters are refused first).
jtext() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

# Merges into a temp file beside run.json, then moves it in when it differs; $1 = mode.
# Sets SUM (entries new missing renamed) and CHANGED.
merge() {
  mkdir -p .skillator || die "cannot create .skillator/"
  tmp=.skillator/.run.json.$$
  sumf=.skillator/.run.sum.$$
  old=$(existing) || exit 1
  {
    [ -n "$old" ] && printf '%s\n' "$old" | awk '{ print "E\t" $0 }'
    [ "$1" = scan ] && discover | awk '{ print "D\t" $0 }'
  } | RE_MODE=$1 RE_SUM=$sumf awk "$MERGE" > "$tmp" || { rm -f "$tmp" "$sumf"; die "could not write $FILE"; }
  SUM=$(cat "$sumf"); rm -f "$sumf"
  if [ -f "$FILE" ] && cmp -s "$tmp" "$FILE"; then rm -f "$tmp"; CHANGED=''
  else mv -f "$tmp" "$FILE" || { rm -f "$tmp"; die "could not write $FILE"; }; CHANGED=1
  fi
}

scan() {
  had=''; [ -f "$FILE" ] && had=1
  merge scan
  set -- $SUM
  if [ -z "$had" ]; then echo "$FILE created - $1 entries"
  elif [ -n "$CHANGED" ]; then echo "$FILE updated - $1 entries, $2 new, $3 missing"
  else echo "$FILE unchanged - $1 entries, $3 missing"
  fi
}

rename() {
  [ $# -eq 2 ] || die "usage: run-entries.sh rename <id> <name>"
  [ -f "$FILE" ] || die "no $FILE here - scan first"
  case $1$2 in *[[:cntrl:]]*) die "an id and a name are one line of text" ;; esac
  name=$(printf '%s' "$2" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
  [ -n "$name" ] || die "a name cannot be empty"
  [ ${#name} -le 80 ] || die "a name is at most 80 bytes"
  RE_ID=$(jtext "$1") RE_NAME=$(jtext "$name")
  export RE_ID RE_NAME
  merge rename
  set -- "$1" $SUM
  [ "$5" = 1 ] || die "no entry with id $1 in $FILE"
  echo "renamed $1 to $name in $FILE"
}

# --- selftest: a fixture repo, every subcommand, exact bytes ---

row() {  # id name kind target args command source missing
  printf '    { "id": "%s", "name": "%s", "kind": "%s", "target": "%s", "args": %s, "command": "%s", "cwd": ".", "source": "%s", "missing": %s }' "$@"
}

selftest() {
  self=$(cd "$(dirname "$0")" && pwd)/$(basename "$0")
  T=$(mktemp -d) || die "selftest: no temp dir"
  trap 'rm -rf "$T"' EXIT
  cd "$T" || die "selftest: cd"
  fail() { echo "FAIL: $*" >&2; exit 1; }
  re() { sh "$self" "$@"; }

  # empty repo: an empty list
  out=$(re scan) || fail "scan on an empty repo"
  [ "$out" = '.skillator/run.json created - 0 entries' ] || fail "empty scan said: $out"
  [ "$(cat .skillator/run.json)" = '{
  "version": 1,
  "entries": []
}' ] || fail "empty run.json: $(cat .skillator/run.json)"
  rm -rf .skillator

  printf '%s\n' '{' '  "name": "x",' '  "scripts": {' '    "build": "tsc -p .",' \
    '    "test":"node --test", "dev:web": "vite"' '  },' '  "devDependencies": { "scripts": "1" }' '}' > package.json
  printf '%s\n' '.PHONY: all test' 'CC := gcc' 'VAR = a:b' 'all: build' 'build test: deps' \
    '	echo hi: there' '%.o: %.c' 'deps::' > Makefile
  mkdir scripts
  for f in install.sh install.ps1 run-dev.sh notes.sh Build.sh scripts/build.ps1 scripts/helper.sh scripts/setup_db.sh; do
    printf 'echo %s\n' "$f" > "$f"
  done

  out=$(re scan) || fail "first scan"
  [ "$out" = '.skillator/run.json created - 12 entries' ] || fail "first scan said: $out"
  want=$(printf '%s\n' '{' '  "version": 1,' '  "entries": ['
    row npm:build 'npm run build' npm build '[]' 'npm run build' package.json false; echo ,
    row npm:test 'npm run test' npm test '[]' 'npm run test' package.json false; echo ,
    row npm:dev:web 'npm run dev:web' npm dev:web '[]' 'npm run dev:web' package.json false; echo ,
    row make:all 'make all' make all '[]' 'make all' Makefile false; echo ,
    row make:build 'make build' make build '[]' 'make build' Makefile false; echo ,
    row make:test 'make test' make test '[]' 'make test' Makefile false; echo ,
    row make:deps 'make deps' make deps '[]' 'make deps' Makefile false; echo ,
    row ps1:install.ps1 install.ps1 ps1 install.ps1 '[]' 'powershell -File install.ps1' install.ps1 false; echo ,
    row sh:install.sh install.sh sh install.sh '[]' 'sh install.sh' install.sh false; echo ,
    row sh:run-dev.sh run-dev.sh sh run-dev.sh '[]' 'sh run-dev.sh' run-dev.sh false; echo ,
    row ps1:scripts/build.ps1 scripts/build.ps1 ps1 scripts/build.ps1 '[]' 'powershell -File scripts/build.ps1' scripts/build.ps1 false; echo ,
    row sh:scripts/setup_db.sh scripts/setup_db.sh sh scripts/setup_db.sh '[]' 'sh scripts/setup_db.sh' scripts/setup_db.sh false; echo
    printf '%s\n' '  ]' '}')
  want=$(printf '%s\n' "$want" | awk '/^,$/ { prev = prev ","; next } { if (NR > 1 && have) print prev; prev = $0; have = 1 } END { print prev }')
  got=$(cat .skillator/run.json)
  [ "$got" = "$want" ] || fail "first scan wrote:
$got
wanted:
$want"
  [ "$(tail -c 1 .skillator/run.json | od -An -c | tr -d ' ')" = '\n' ] || fail "run.json does not end in a newline"

  out=$(re rename npm:build 'Build it') || fail "rename"
  [ "$out" = 'renamed npm:build to Build it in .skillator/run.json' ] || fail "rename said: $out"
  grep -qF '{ "id": "npm:build", "name": "Build it", "kind": "npm"' .skillator/run.json || fail "rename not saved"
  re rename npm:nope x 2>/dev/null && fail "rename of an unknown id passed"
  re rename npm:test '' 2>/dev/null && fail "an empty name passed"
  re rename npm:test 'a
b' 2>/dev/null && fail "a two-line name passed"
  re rename npm:test 'say "hi" \ there' > /dev/null || fail "a name with a quote"
  grep -qF '"name": "say \"hi\" \\ there"' .skillator/run.json || fail "quote not escaped: $(grep npm:test .skillator/run.json)"

  # hand-added entries (one runnable, one whose file is gone), a file gone, a file new
  awk '{ print } /"entries": \[/ { print "    {\"name\":\"install selftest\",\"kind\":\"sh\",\"target\":\"install.sh\",\"args\":[\"--selftest\"]},"
    print "    { \"id\": \"tool\", \"kind\": \"sh\", \"target\": \"tools/x.sh\", \"cwd\": \"tools\" },"; }' .skillator/run.json > rj && mv rj .skillator/run.json
  rm install.ps1
  printf 'echo start\n' > scripts/start.sh
  out=$(re scan) || fail "rescan"
  [ "$out" = '.skillator/run.json updated - 15 entries, 1 new, 2 missing' ] || fail "rescan said: $out"
  got=$(cat .skillator/run.json)
  for line in \
    "$(row hand-1 'install selftest' sh install.sh '["--selftest"]' 'sh install.sh --selftest' hand false)," \
    "$(row npm:build 'Build it' npm build '[]' 'npm run build' package.json false)," \
    "$(row ps1:install.ps1 install.ps1 ps1 install.ps1 '[]' 'powershell -File install.ps1' install.ps1 true)," \
    "$(row sh:scripts/start.sh scripts/start.sh sh scripts/start.sh '[]' 'sh scripts/start.sh' scripts/start.sh false)" \
    '    { "id": "tool", "name": "tools/x.sh", "kind": "sh", "target": "tools/x.sh", "args": [], "command": "sh tools/x.sh", "cwd": "tools", "source": "hand", "missing": true },'; do
    printf '%s\n' "$got" | grep -qxF -- "$line" || fail "rescan lacks: $line
in:
$got"
  done
  [ "$(printf '%s\n' "$got" | sed -n 4p)" = "$(row hand-1 'install selftest' sh install.sh '["--selftest"]' 'sh install.sh --selftest' hand false)," ] || fail "hand entry moved"
  [ "$(printf '%s\n' "$got" | tail -3 | head -1)" = "$(row sh:scripts/start.sh scripts/start.sh sh scripts/start.sh '[]' 'sh scripts/start.sh' scripts/start.sh false)" ] || fail "new entry not last"
  out=$(re scan) || fail "third scan"
  [ "$out" = '.skillator/run.json unchanged - 15 entries, 2 missing' ] || fail "third scan said: $out"
  out=$(re rename hand-1 'Selftest') || fail "rename a hand entry"
  grep -qF '{ "id": "hand-1", "name": "Selftest", "kind": "sh", "target": "install.sh", "args": ["--selftest"]' .skillator/run.json || fail "hand rename"

  # a file that is not JSON is refused, never overwritten
  printf '{ "entries": [ oops\n' > .skillator/run.json
  re scan 2>/dev/null && fail "a broken run.json was scanned"
  [ "$(cat .skillator/run.json)" = '{ "entries": [ oops' ] || fail "a broken run.json was overwritten"
  ls .skillator | grep -q '^\.' && fail "temp files left in .skillator"
  cd / && echo ok
}

[ $# -ge 1 ] || die "usage: run-entries.sh scan|rename <id> <name>|selftest"
c=$1; shift
case $c in
  scan) [ $# -eq 0 ] || die "usage: run-entries.sh scan"; scan ;;
  rename) rename "$@" ;;
  selftest) selftest ;;
  *) die "usage: run-entries.sh scan|rename <id> <name>|selftest" ;;
esac
