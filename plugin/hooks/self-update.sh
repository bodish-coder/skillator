#!/bin/sh
# skillator plugin, self-update (F181). Wired in hooks.json on SessionStart and
# UserPromptSubmit as `due-run`.
#
#   self-update.sh check     prints `up to date <v>` | `newer <old> -> <new>` |
#                            `skipped: <why>` | `offline` | `failed: <what>`
#   self-update.sh run       check, then update when newer; records the result
#   self-update.sh due-run   hook: prints a pending notice (once), then - only when
#                            the last check is older than SKILLATOR_UPDATE_HOURS
#                            (default 24) - starts `run` detached and returns
#   self-update.sh selftest  prints `ok`, or the failures and exits 1
#
# State: ~/.skillator/self-update.json, one line we write ourselves:
# {"lastCheck":<epoch s>,"startedAt":..,"skipAt":..,"lastResult":"..","lastVersion":"..","notice":".."}
# lastCheck is written when a run finishes, startedAt when due-run starts one.
# The update follows /skillator-update-all (commands/skillator-update-all.md): the Claude
# Code plugins, then the installer from the updated plugin (source c.) - only when
# no source pointer names a git clone. Never -y. Needs node to read the plugin list.
# Off: SKILLATOR_AUTO_UPDATE=0. Mirror: self-update.ps1, same rules and output.

S="$HOME/.skillator/self-update.json"
K="$HOME/.skillator/self-update.lock"
# a positive integer (up to 6 digits), else the default
H=${SKILLATOR_UPDATE_HOURS:-}
case $H in ''|*[!0-9]*|0*|???????*) H=24 ;; esac

# load: the state line into J, read once per process.
load() { J=''; [ -f "$S" ] && { IFS= read -r J < "$S" || :; }; }

# g <var> <key>: sets <var> to a value from J, empty when absent (no fork: the hook is timed).
g() {
  v=''
  case $J in *"\"$2\":"*)
    v=${J#*\"$2\":}
    case $v in \"*) v=${v#\"}; v=${v%%\"*} ;; *) v=${v%%[,\}]*} ;; esac ;;
  esac
  eval "$1=\$v"
}
get() { g v "$1"; printf '%s' "$v"; }

# put <lastCheck> <startedAt> <skipAt> <lastResult> <lastVersion> <notice>
put() {
  p1=$1 p2=$2 p3=$3
  case $p1 in ''|*[!0-9]*) p1=0 ;; esac
  case $p2 in ''|*[!0-9]*) p2=0 ;; esac
  case $p3 in ''|*[!0-9]*) p3=0 ;; esac
  # strings: tr only when one holds a quote, backslash or newline (forks cost on Windows)
  c() { printf '%s' "$1" | tr -d '"\\\r\n'; }
  cr=$(printf "\r")
  q4=$4 q5=$5 q6=$6
  case $4$5$6 in *[\"\\]*|*"$cr"*|*"
"*) q4=$(c "$4") q5=$(c "$5") q6=$(c "$6") ;; esac
  [ -d "${S%/*}" ] || mkdir -p "${S%/*}" 2>/dev/null || return 0
  printf '{"lastCheck":%s,"startedAt":%s,"skipAt":%s,"lastResult":"%s","lastVersion":"%s","notice":"%s"}\n' \
    "$p1" "$p2" "$p3" "$q4" "$q5" "$q6" > "$S.$$.tmp" && mv -f "$S.$$.tmp" "$S"
}

# due: from J (with now, sa, lc set) - the last check is H hours old and no run started
# in the last 30 min (an older startedAt is a run that was killed).
due() {
  case $sa in ''|*[!0-9]*) sa=0 ;; esac
  [ $((now - sa)) -ge 1800 ] || return 1
  case $lc in ''|*[!0-9]*) return 0 ;; esac
  [ $((now - lc)) -ge $((H * 3600)) ]
}

# Serialize state transactions and updates. Live subprocesses are bounded below.
lock() {
  mkdir -p "${S%/*}" 2>/dev/null || return 1
  if ! mkdir "$K" 2>/dev/null; then
    a=$(cat "$K/at" 2>/dev/null)
    case $a in
      ''|*[!0-9]*) stale=$(find "$K" -maxdepth 0 -mmin +45 2>/dev/null) ;;
      *) stale=''; [ $(($(date +%s) - a)) -lt 2700 ] || stale=1 ;;
    esac
    [ -n "$stale" ] || return 1
    mkdir "$K/takeover" 2>/dev/null || return 1
    if [ "$(cat "$K/at" 2>/dev/null)" != "$a" ]; then rmdir "$K/takeover"; return 1; fi
    rm -f "$K/at" "$K/owner"
    rmdir "$K/takeover" "$K" 2>/dev/null && mkdir "$K" 2>/dev/null || return 1
  fi
  at=$(date +%s)
  owner="$$-$at"
  printf '%s\n' "$at" > "$K/at"
  printf '%s\n' "$owner" > "$K/owner"
}

unlock() {
  mkdir "$K/takeover" 2>/dev/null || return 0
  if [ "$(cat "$K/owner" 2>/dev/null)" = "$owner" ]; then
    rm -f "$K/at" "$K/owner"
    rmdir "$K/takeover" "$K" 2>/dev/null || :
  else
    rmdir "$K/takeover" 2>/dev/null || :
  fi
}

# Cap the CLI and installer even when one never returns. GNU timeout is present
# in Git Bash; macOS uses the already-required Node runtime.
call_limit=120
bounded() {
  if command -v timeout >/dev/null 2>&1 && timeout --version >/dev/null 2>&1; then
    timeout -k 1 "$call_limit" "$@"
  else
    node -e '
const {spawn} = require("node:child_process");
const [seconds, cmd, ...args] = process.argv.slice(1);
const p = spawn(cmd, args, {detached: true, stdio: "inherit"});
const timer = setTimeout(() => {
  try { process.kill(-p.pid, "SIGKILL") } catch {}
  process.exit(124);
}, Number(seconds) * 1000);
p.on("error", () => { clearTimeout(timer); process.exitCode = 127 });
p.on("exit", code => { clearTimeout(timer); process.exitCode = code ?? 1 });
' -- "$call_limit" "$@"
  fi
}

# Read one of the three Claude metadata shapes with the same JSON parser.
json() {
  node -e '
let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
  let a; try { a = JSON.parse(s) } catch { return }
  const [field, name] = process.argv.slice(1);
  const clean = x => String(x ?? "").replace(/[\t\r\n]/g, " ").replace(/\\/g, "/");
  if (field === "plugins") {
    if (Array.isArray(a)) for (const p of a) if (p && typeof p.id === "string")
      console.log([p.id, p.version, p.installPath].map(clean).join("\t"));
  } else {
    const value = field === "location" ? (Array.isArray(a) ? a.find(p => p?.name === name)?.installLocation : "")
      : field === "marketVersion" ? (Array.isArray(a?.plugins) ? a.plugins.find(p => p?.name === "skillator")?.version : "")
      : a?.version;
    if (typeof value === "string") console.log(clean(value));
  }
})' -- "$@" 2>/dev/null
}

plist() {
  bounded claude plugin list --json </dev/null 2>/dev/null | json plugins
}

# pf <id> <column>: 1 id, 2 version, 3 installPath of plugin <id> in L.
pf() {
  printf '%s\n' "$L" | awk -F'\t' -v id="$1" -v c="$2" '$1 == id { print $c; exit }'
}

# newer <a> <b>: b is a higher x.y.z than a.
newer() {
  awk -v a="$1" -v b="$2" 'BEGIN { split(a, x, "."); split(b, y, ".")
    for (i = 1; i <= 3; i++) { if (y[i] + 0 > x[i] + 0) exit 0; if (y[i] + 0 < x[i] + 0) exit 1 }
    exit 1 }'
}

# plain <v>: a bare x.y.z - anything else never reaches a notice or a command line.
plain() {
  case $1 in *[!0-9.]*|.*|*.|*..*|*.*.*.*) return 1 ;; *.*.*) return 0 ;; esac
  return 1
}

low() { case $(uname -s 2>/dev/null) in MINGW*|MSYS*|CYGWIN*) tr 'A-Z' 'a-z' ;; *) cat ;; esac; }
# real <dir>: its physical path (native form on Windows), case-folded where the OS ignores case.
real() { (cd -P "$1" 2>/dev/null && { pwd -W 2>/dev/null || pwd -P; }) | low; }

# clones: the git checkouts the installer's source pointers name - read, never git-run.
clones() {
  for p in "$HOME/.claude/skills" "${CODEX_HOME:-$HOME/.codex}/skills" "$HOME/.cursor/skills" \
    "$HOME/.pi/agent/skills" "$HOME/.gemini/config/skills" "$HOME/.gemini/skills" \
    "$HOME/.gemini/antigravity-cli/skills" "${XDG_CONFIG_HOME:-$HOME/.config}/opencode/skills"; do
    [ -f "$p/.skillator-source" ] || continue
    IFS= read -r s < "$p/.skillator-source" || [ -n "$s" ] || continue
    s=$(printf '%s' "$s" | tr '\\' '/' | tr -d '\r'); s=${s%/}
    # F204: a scoped /skillator-update's private checkout is not the user's clone
    case $s in */.skillator-update-source|*/.skillator-update-source/*) continue ;; esac
    for c in "$s" "${s%/*}"; do
      [ -n "$c" ] && [ -e "$c/.git" ] && { real "$c"; break; }
    done
  done
}

# inflight <run file> <now>: 1 when a ~ row's heartbeat is under 60 min old, 2 when a
# ~ row has no readable heartbeat (the caller falls back to the file mtime).
inflight() {
  awk -F'|' -v now="$2" '
  function tr(s) { gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
  function ep(s,  y, mo) {
    if (s !~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]/) return -1
    y = substr(s, 1, 4) + 0; mo = substr(s, 6, 2) + 0; if (mo <= 2) { y--; mo += 12 }
    return (365 * y + int(y / 4) - int(y / 100) + int(y / 400) + int((153 * (mo - 3) + 2) / 5) + substr(s, 9, 2) - 719469) * 86400 + substr(s, 12, 2) * 3600 + substr(s, 15, 2) * 60
  }
  /^\|/ { for (i = 2; i < NF; i++) if (tr($i) == "heartbeat") hb = i }
  /^\|[^|]*\|[^|]*\|[ \t]*~[ \t]*\|/ { e = hb ? ep(tr($hb)) : -1; if (e < 0) u = 1; else if (now - e < 3600) { f = 1; exit } }
  END { if (f) print 1; else if (u) print 2 }' "$1"
}

# Only checkout pointers and registered worktrees are trusted Git targets.
dirty_checkout() {
  checkout=$1
  set -- -c core.fsmonitor=false -c "core.hooksPath=$hp" -c core.untrackedCache=false -c diff.external=
  filters=$(git -C "$checkout" config --name-only --get-regexp '^filter\..*\.(clean|smudge|process|required)$' 2>/dev/null)
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    case $f in *.required) set -- "$@" -c "$f=false" ;; *) set -- "$@" -c "$f=" ;; esac
  done <<EOF
$filters
EOF
  # Porcelain status can flag a CRLF-only stat change before checking filters.
  git --no-optional-locks "$@" -C "$checkout" diff --quiet --no-ext-diff --no-textconv --ignore-submodules=all -- plugin 2>/dev/null
  [ "$?" -ne 1 ] || return 0
  git --no-optional-locks "$@" -C "$checkout" diff --cached --quiet --no-ext-diff --no-textconv --ignore-submodules=all -- plugin 2>/dev/null
  [ "$?" -ne 1 ] || return 0
  [ -n "$(git "$@" -C "$checkout" ls-files --others --exclude-standard -- plugin 2>/dev/null)" ]
}

# why_skip: a reason not to touch the install, or nothing.
why_skip() {
  r=$PWD
  until [ -e "$r/.git" ]; do
    n=${r%/*}
    { [ -n "$n" ] && [ "$n" != "$r" ]; } || break
    r=$n
  done
  now=$(date +%s)
  for f in "$r"/.skillator/run-*.md; do
    [ -f "$f" ] || continue
    case $(inflight "$f" "$now") in
      1) ;;
      2) [ -n "$(find "$f" -mmin -60 2>/dev/null)" ] || continue ;;
      *) continue ;;
    esac
    echo "a relay run is in flight (${f##*/})"; return 0
  done
  case $(uname -s 2>/dev/null) in MINGW*|MSYS*) hp=NUL ;; *) hp=/dev/null ;; esac
  while IFS= read -r checkout; do
    [ -n "$checkout" ] || continue
    if dirty_checkout "$checkout"; then echo 'uncommitted plugin edits'; return 0; fi
    worktrees=$(git -C "$checkout" -c core.quotePath=false worktree list --porcelain 2>/dev/null)
    while IFS= read -r row; do
      case $row in
        'worktree '*) tree=${row#worktree } ;;
        *) continue ;;
      esac
      if [ "$tree" != "$checkout" ] && dirty_checkout "$tree"; then
        echo 'uncommitted plugin edits'; return 0
      fi
    done <<EOF
$worktrees
EOF
  done <<EOF
$C
EOF
  return 0
}

# check: sets RES (the printed line) and, for Claude Code, m / old / new / L.
check() {
  m='' old='' new='' L=''
  [ "${SKILLATOR_AUTO_UPDATE:-1}" = 0 ] && { RES='skipped: SKILLATOR_AUTO_UPDATE=0'; return; }
  C=$(clones)
  w=$(why_skip)
  [ -n "$w" ] && { RES="skipped: $w"; return; }
  command -v claude >/dev/null 2>&1 || { RES='skipped: no claude on PATH - Claude Code not checked'; return; }
  command -v node >/dev/null 2>&1 || { RES='skipped: no node to read plugin list'; return; }
  L=$(plist)
  m=$(printf '%s\n' "$L" | awk -F'\t' '$1 ~ /^skillator@/ { print substr($1, 11); exit }')
  [ -n "$m" ] || { RES='skipped: skillator is not a Claude Code plugin here'; return; }
  old=$(pf "skillator@$m" 2)
  plain "$old" || { old=''; RES='skipped: unexpected version'; return; }
  bounded claude plugin marketplace update "$m" </dev/null >/dev/null 2>&1 || { RES=offline; return; }
  loc=$(bounded claude plugin marketplace list --json </dev/null 2>/dev/null | json location "$m")
  new=$(json marketVersion 2>/dev/null < "$loc/.claude-plugin/marketplace.json")
  [ -n "$new" ] || { RES="failed: no skillator version in marketplace $m"; return; }
  plain "$new" || { new=''; RES='skipped: unexpected version'; return; }
  if newer "$old" "$new"; then RES="newer $old -> $new"
  elif newer "$new" "$old"; then RES="skipped: would downgrade $old -> $new"
  else RES="up to date $old"; fi
}

# cc <plugin>: claude plugin update, stdin closed so a confirmation prompt fails.
cc() {
  o=$(bounded claude plugin update "$1" </dev/null 2>&1) && return 0
  if printf '%s' "$o" | grep -qiE 'confirm|shownCommand|--yes'; then
    RES='skipped: needs confirmation'
  else
    RES="failed: claude plugin update $1"
  fi
  return 1
}

update() {
  cc "skillator@$m" || return
  [ -n "$(pf "ops-board@$m" 1)" ] && { cc "ops-board@$m" || return; }
  L=$(plist)
  nv=$(pf "skillator@$m" 2)
  ip=$(pf "skillator@$m" 3)
  sv=$(json version 2>/dev/null < "$ip/.claude-plugin/plugin.json")
  plain "$nv" && { [ -z "$sv" ] || plain "$sv"; } || { nv=''; RES='skipped: unexpected version'; return; }
  for v in "$nv" $sv; do
    newer "$old" "$v" || {
      nv=$v RES="failed: update did not apply ($old -> $v)"
      NOTE="skillator update did not apply ($old -> $v) - run /skillator-update-all"; return
    }
  done
  RES="updated $old -> $nv"
  # a pointer to a clone: the plugins are updated here; /skillator-update-all pulls the clone and installs the other hosts from it
  [ -n "$C" ] && { NOTE="skillator $old -> $nv for Claude Code - run /skillator-update-all to update the other hosts"; return; }
  ih=''
  if [ -f "$ip/install.sh" ] && [ -f "$ip/install.ps1" ]; then
    case $(uname -s 2>/dev/null) in
      MINGW*|MSYS*|CYGWIN*) bounded powershell -NoProfile -ExecutionPolicy Bypass -File "$ip/install.ps1" -Force ;;
      *) bounded sh "$ip/install.sh" --force ;;
    esac </dev/null >/dev/null 2>&1 || ih=' (other hosts: installer failed - run /skillator-update-all)'
  else
    ih=' (other hosts: no installer in the plugin - run /skillator-update-all)'
  fi
  NOTE="skillator updated $old -> $nv - restart Claude Code to load it$ih"
}

run() {
  lock || { echo 'skipped: another update run is in progress'; return; }
  trap unlock EXIT
  NOTE='' nv=''
  check
  case $RES in newer*) update ;; esac
  load; now=$(date +%s); sk=$(get skipAt)
  case $sk in ''|*[!0-9]*) sk=0 ;; esac
  [ "$RES" = "$(get lastResult)" ] || sk=0
  case $RES in
    offline|failed*) [ -n "$NOTE" ] || NOTE="skillator update check: $RES - next try in $H h" ;;
    # skips that repeat every check: one notice a day, not one per check
    'skipped: a relay run is in flight'*|'skipped: needs confirmation'|'skipped: would downgrade'*|'skipped: unexpected version'|'skipped: no node to read plugin list')
      if [ $((now - sk)) -ge 86400 ]; then
        NOTE="skillator update $RES"
        [ "$RES" != 'skipped: needs confirmation' ] || NOTE="$NOTE ($old -> $new) - run /skillator-update-all"
        sk=$now
      fi ;;
  esac
  [ -n "$NOTE" ] || NOTE=$(get notice)
  put "$now" "$(get startedAt)" "$sk" "$RES" "${nv:-$old}" "$NOTE"
  echo "$RES"
}

due_run() {
  lock || return 0
  trap unlock EXIT
  load; g n notice; g sa startedAt; g lc lastCheck; go=''
  [ -n "$n" ] && printf '%s\n' "$n"
  if [ "${SKILLATOR_AUTO_UPDATE:-1}" != 0 ]; then now=${EPOCHSECONDS:-$(date +%s)}; due && go=1 sa=$now; fi
  # startedAt first, so the prompts while `run` works do not start another
  if [ -n "$n$go" ]; then
    g sk skipAt; g lr lastResult; g lv lastVersion
    put "$lc" "$sa" "$sk" "$lr" "$lv" ''
  fi
  unlock
  trap - EXIT
  [ -n "$go" ] && ( sh "$0" run </dev/null >/dev/null 2>&1 & )
  return 0
}

selftest() {
  d=$(mktemp -d) || { echo 'FAIL: mktemp'; exit 1; }
  trap 'cd / && rm -rf "$d"' EXIT
  me=$(cd "$(dirname -- "$0")" && pwd)/self-update.sh
  mkdir -p "$d/bin" "$d/home" "$d/repo/.git" "$d/inst" "$d/mkt/.claude-plugin"
  lw=$(cd "$d" && { pwd -W 2>/dev/null || pwd; })
  rg=$(command -v git)
  export SU_D="$d" HOME="$d/home" USERPROFILE="$d/home" PATH="$d/bin:$PATH"
  unset SKILLATOR_AUTO_UPDATE SKILLATOR_UPDATE_HOURS SU_OFFLINE SU_CONFIRM SU_SLEEP SU_DIRTY SU_OLDV SU_NEWV SU_REALGIT CODEX_HOME XDG_CONFIG_HOME GIT_CONFIG_NOSYSTEM
  cat_v() { printf '{"name":"skillator","plugins":[{"name":"skillator","version":"%s"}]}\n' "$1" > "$d/mkt/.claude-plugin/marketplace.json"; }
  # the plugin list's keys out of order on purpose: matched by id, not by position
  cat > "$d/bin/claude" <<'EOS'
#!/bin/sh
echo "claude $*" >> "$SU_D/log"
case "$*" in
  'plugin list --json') v=${SU_OLDV:-4.29.0}; [ -f "$SU_D/updated" ] && v=${SU_NEWV:-4.30.0}
    printf '[{"version":"0.17.0","installPath":"x","id":"ops-board@skillator"},{"version":"%s","installPath":"%s","id":"skillator@skillator"}]\n' "$v" "$SU_D/inst" ;;
  'plugin marketplace update skillator') [ -n "$SU_SLEEP" ] && sleep "$SU_SLEEP"; [ -z "$SU_OFFLINE" ] ;;
  'plugin marketplace list --json') printf '[{"name":"skillator","installLocation":"%s"}]\n' "$SU_D/mkt" ;;
  'plugin update skillator@skillator') [ -n "$SU_CONFIRM" ] && { echo 'Run again with -y to confirm'; exit 1; }; : > "$SU_D/updated" ;;
  'plugin update ops-board@skillator') ;;
  *) exit 1 ;;
esac
EOS
  cat > "$d/bin/git" <<'EOS'
#!/bin/sh
echo "git $* nosys=${GIT_CONFIG_NOSYSTEM:-}" >> "$SU_D/log"
[ -n "$SU_REALGIT" ] && exec "$SU_REALGIT" "$@"
case "$*" in *"diff --quiet"*) [ -z "$SU_DIRTY" ] || exit 1 ;; esac
exit 0
EOS
  printf '#!/bin/sh\necho "installer sh $*" >> "$SU_D/log"\n' > "$d/inst/install.sh"
  printf 'Add-Content -LiteralPath "%s/log" -Value ("installer ps1 " + ($args -join " "))\n' "$lw" > "$d/inst/install.ps1"
  chmod +x "$d/bin/claude" "$d/bin/git"
  F=0
  t() { if eval "$2"; then :; else echo "FAIL: $1"; F=1; fi; }
  st() { cat "$HOME/.skillator/self-update.json" 2>/dev/null; }
  lg() { [ -f "$d/log" ] && tr -d '\r' < "$d/log"; }
  reset() { rm -rf "$d/log" "$d/updated" "$HOME/.skillator" "$HOME/.codex" "$d/repo/.skillator" "$d/repo/plugin" "$d/clone" "$d/plain"; cat_v 4.30.0; }
  # ws <lastCheck> <startedAt> [skipAt]: a state line
  ws() { mkdir -p "$HOME/.skillator"; printf '{"lastCheck":%s,"startedAt":%s,"skipAt":%s,"lastResult":"","lastVersion":"4.29.0","notice":""}\n' "$1" "$2" "${3:-0}" > "$HOME/.skillator/self-update.json"; }
  # ptr <dir>: the installer's source pointer in a host skills dir
  ptr() { mkdir -p "$HOME/.codex/skills"; printf '%s\n' "$1" > "$HOME/.codex/skills/.skillator-source"; }
  iso() { date -u -d "@$1" +%Y-%m-%dT%H:%MZ 2>/dev/null || date -u -r "$1" +%Y-%m-%dT%H:%MZ; }
  stamp() { date -d "@$1" +%Y%m%d%H%M 2>/dev/null || date -r "$1" +%Y%m%d%H%M; }
  # ms: milliseconds where date has %N, else whole seconds
  ms() { x=$(date +%s%N); case $x in *N) echo $(($(date +%s) * 1000)) ;; *) echo $((x / 1000000)) ;; esac; }
  # wait_run: until the detached run has written lastCheck
  wait_run() { i=0; until st | grep -q '"lastCheck":[1-9]' || [ $i -ge 30 ]; do sleep 1; i=$((i + 1)); done; }
  cd "$d/repo" || exit 1
  now=$(date +%s)

  reset; ws "$now" 0
  o=$(sh "$me" due-run)
  t 'not due: no work' '[ -z "$o" ] && [ ! -s "$d/log" ]'

  reset; cat_v 4.29.0
  t 'due + up to date: check' '[ "$(sh "$me" check)" = "up to date 4.29.0" ]'
  o=$(sh "$me" run)
  t 'due + up to date: no update call' '[ "$o" = "up to date 4.29.0" ] && ! lg | grep -q "plugin update" && st | grep -q "\"lastResult\":\"up to date 4.29.0\""'

  reset
  o=$(sh "$me" run)
  exp='claude plugin list --json
claude plugin marketplace update skillator
claude plugin marketplace list --json
claude plugin update skillator@skillator
claude plugin update ops-board@skillator
claude plugin list --json'
  t 'due + newer: result' '[ "$o" = "updated 4.29.0 -> 4.30.0" ]'
  t 'due + newer: calls in order (plugin list keys in any order)' '[ "$(lg | grep -v "^installer")" = "$exp" ] && lg | tail -1 | grep -qi "^installer .*-force"'
  o=$(SKILLATOR_UPDATE_HOURS=24 sh "$me" due-run)
  t 'due + newer: the one-line notice' '[ "$o" = "skillator updated 4.29.0 -> 4.30.0 - restart Claude Code to load it" ]'
  o=$(sh "$me" due-run)
  t 'due + newer: notice shown once' '[ -z "$o" ]'

  reset
  t 'offline: check' '[ "$(SU_OFFLINE=1 sh "$me" check)" = offline ]'
  reset
  SU_OFFLINE=1 sh "$me" run > /dev/null
  rm -f "$d/log"
  o=$(SU_OFFLINE=1 sh "$me" due-run)
  t 'offline: one quiet note, stamped, not retried' '[ "$o" = "skillator update check: offline - next try in 24 h" ] && [ ! -s "$d/log" ] && ! st | grep -q "\"lastCheck\":0"'

  # 3: a ~ row blocks only while its heartbeat (else the file mtime) is under 60 min old
  reset; mkdir -p "$d/repo/.skillator"; rf="$d/repo/.skillator/run-0001-x.md"
  printf '| # | stage | state |\n|---|---|---|\n| 1 | x | ~ |\n' > "$rf"
  t 'run in flight (fresh mtime): skipped' '[ "$(sh "$me" check)" = "skipped: a relay run is in flight (run-0001-x.md)" ] && ! lg | grep -q ^claude'
  touch -t "$(stamp $((now - 7200)))" "$rf"
  t 'stale ~ row (old mtime, no heartbeat column): not blocking' '[ "$(sh "$me" check)" = "newer 4.29.0 -> 4.30.0" ]'
  printf '| # | stage | state | owner | heartbeat |\n|---|---|---|---|---|\n| 1 | x | ~ | b | %s |\n' "$(iso $((now - 7200)))" > "$rf"
  t 'stale ~ row (old heartbeat, fresh mtime): not blocking' '[ "$(sh "$me" check)" = "newer 4.29.0 -> 4.30.0" ]'
  printf '| # | stage | state | owner | heartbeat |\n|---|---|---|---|---|\n| 1 | x | ~ | b | %s |\n' "$(iso $((now - 300)))" > "$rf"
  touch -t "$(stamp $((now - 7200)))" "$rf"
  t 'live ~ row (fresh heartbeat, old mtime): skipped' '[ "$(sh "$me" check)" = "skipped: a relay run is in flight (run-0001-x.md)" ]'
  rm -f "$d/log"; sh "$me" run > /dev/null
  t 'repeated skip: a notice' '[ "$(sh "$me" due-run)" = "skillator update skipped: a relay run is in flight (run-0001-x.md)" ]'
  sh "$me" run > /dev/null
  t 'repeated skip: the notice once per 24 h' '[ -z "$(sh "$me" due-run)" ]'
  rm -f "$rf"
  SU_CONFIRM=1 sh "$me" run > /dev/null
  t 'different skip: notify within the same day' '[ "$(sh "$me" due-run)" = "skillator update skipped: needs confirmation (4.29.0 -> 4.30.0) - run /skillator-update-all" ]'
  put 1 0 0 result version "$(printf "before\rafter")"
  load
  t 'bare carriage return: valid JSON notice' '[ "$(get notice)" = beforeafter ]'

  # 1: never git in a repo that only looks like skillator; only in the pointer's own clone
  reset; r3="$d/fake"; rm -rf "$r3"; mkdir -p "$r3/plugin/.claude-plugin"
  "$rg" init -q "$r3"
  printf '{"name": "skillator"}\n' > "$r3/plugin/.claude-plugin/plugin.json"
  : > "$r3/plugin/install.sh"; : > "$r3/plugin/install.ps1"; printf 'aaaa\n' > "$r3/plugin/f"
  printf '* filter=x\n' > "$r3/.gitattributes"
  "$rg" -C "$r3" -c core.autocrlf=false add -A && "$rg" -C "$r3" -c core.autocrlf=false -c user.name=t -c user.email=t@t commit -qm x
  "$rg" -C "$r3" config filter.x.clean 'touch filter-marker; cat'
  sleep 1; printf 'bbbb\n' > "$r3/plugin/f"
  o=$(cd "$r3" && SU_REALGIT="$rg" sh "$me" check)
  t 'lookalike repo with a hostile filter: no git call, no marker' '[ ! -e "$r3/filter-marker" ] && ! lg | grep -q ^git && [ "$o" = "newer 4.29.0 -> 4.30.0" ]'
  reset; mkdir -p "$d/repo/plugin"; ptr "$lw/repo/plugin"
  t 'owner clone (pointer) dirty: skipped' '[ "$(SU_DIRTY=" M plugin/x" sh "$me" check)" = "skipped: uncommitted plugin edits" ] && ! lg | grep -q ^claude && lg | grep -q "^git .*diff .*nosys=$"'

  reset; r2="$d/repo2"; rm -rf "$r2"; mkdir -p "$r2/plugin/.claude-plugin"
  "$rg" init -q "$r2" && "$rg" -C "$r2" config core.fsmonitor 'touch fsmon-marker; false'
  : > "$r2/plugin/x"
  r2w=$(cd "$r2" && { pwd -W 2>/dev/null || pwd; }); ptr "$r2w/plugin"
  o=$(cd "$r2" && SU_REALGIT="$rg" sh "$me" check)
  t 'hostile core.fsmonitor in the owner clone: never runs' '[ ! -e "$r2/fsmon-marker" ] && [ "$o" = "skipped: uncommitted plugin edits" ]'

  # A242: use Git's checkout normalization and inspect a registered linked tree.
  reset; r4="$d/normal"; wt4="$d/linked tree"; gc="$d/system.gitconfig"
  mkdir -p "$r4/plugin"
  "$rg" init -q "$r4"
  printf 'alpha\n' > "$r4/plugin/x"
  "$rg" -C "$r4" -c core.autocrlf=false add -- plugin
  "$rg" -C "$r4" -c user.name=t -c user.email=t@t commit -qm x
  ptr "$lw/normal/plugin"
  printf '[core]\n\tautocrlf = true\n' > "$gc"
  printf 'alpha\r\n' > "$r4/plugin/x"
  o=$(GIT_CONFIG_SYSTEM="$gc" SU_REALGIT="$rg" sh "$me" check)
  t 'system line endings: CRLF copy is clean' '[ "$o" = "newer 4.29.0 -> 4.30.0" ]'
  printf 'alpha\n' > "$r4/plugin/x"
  "$rg" -C "$r4" worktree add --detach --quiet "$wt4"
  printf 'dirty\n' > "$wt4/plugin/x"
  o=$(SU_REALGIT="$rg" sh "$me" check)
  t 'linked worktree: dirty plugin blocks update from elsewhere' '[ "$o" = "skipped: uncommitted plugin edits" ]'

  reset
  t 'opt-out: check skipped' '[ "$(SKILLATOR_AUTO_UPDATE=0 sh "$me" check)" = "skipped: SKILLATOR_AUTO_UPDATE=0" ]'
  o=$(SKILLATOR_AUTO_UPDATE=0 sh "$me" due-run)
  t 'opt-out: due-run does nothing' '[ -z "$o" ] && [ ! -s "$d/log" ] && [ -z "$(st)" ]'

  reset
  o=$(SU_CONFIRM=1 sh "$me" run)
  t 'confirmation prompt: skipped, never -y' '[ "$o" = "skipped: needs confirmation" ] && ! lg | grep -qE -- "(^| )(-y|--yes)( |$)"'
  t 'confirmation prompt: the skip notice' '[ "$(sh "$me" due-run)" = "skillator update skipped: needs confirmation (4.29.0 -> 4.30.0) - run /skillator-update-all" ]'

  # 2: decide before installing; an update that did not land is never "updated"
  reset; cat_v 4.28.0
  o=$(sh "$me" run)
  t 'marketplace older: refused before any update' '[ "$o" = "skipped: would downgrade 4.29.0 -> 4.28.0" ] && ! lg | grep -q "plugin update"'
  reset
  o=$(SU_NEWV=4.29.0 sh "$me" run)
  t 'update did not apply (same version): recorded, no installer' '[ "$o" = "failed: update did not apply (4.29.0 -> 4.29.0)" ] && ! lg | grep -q "^installer"'
  t 'update did not apply: the notice' '[ "$(sh "$me" due-run)" = "skillator update did not apply (4.29.0 -> 4.29.0) - run /skillator-update-all" ]'
  reset
  o=$(SU_NEWV=4.28.0 sh "$me" run)
  t 'update went down: did not apply, no installer' '[ "$o" = "failed: update did not apply (4.29.0 -> 4.28.0)" ] && ! lg | grep -q "^installer"'

  reset
  o=$(SU_OLDV='4.29.0-evil$(x)' sh "$me" run)
  t 'unexpected version: skipped, kept out of notice and commands' '[ "$o" = "skipped: unexpected version" ] && ! st | grep -q evil && ! lg | grep -q -e evil -e "plugin update"'

  # 4: a pointer to a git clone - the other hosts are /skillator-update-all's job
  reset; mkdir -p "$d/clone/.git" "$d/clone/plugin"; ptr "$lw/clone/plugin"
  o=$(sh "$me" run)
  t 'pointer to a clone: no installer from the cache' '[ "$o" = "updated 4.29.0 -> 4.30.0" ] && ! lg | grep -q "^installer"'
  t 'pointer to a clone: the notice' '[ "$(sh "$me" due-run)" = "skillator 4.29.0 -> 4.30.0 for Claude Code - run /skillator-update-all to update the other hosts" ]'
  reset; mkdir -p "$d/plain/plugin"; ptr "$lw/plain/plugin"
  sh "$me" run > /dev/null
  t 'pointer not a git checkout: installer from installPath' 'lg | grep -q "^installer"'
  # F204: a scoped update's private checkout (<profile>/.skillator-update-source) is never the user's clone
  reset; mkdir -p "$d/clone/.skillator-update-source/.git" "$d/clone/.skillator-update-source/plugin"; ptr "$lw/clone/.skillator-update-source/plugin"
  sh "$me" run > /dev/null
  t 'pointer into .skillator-update-source: not a clone, installer from installPath' 'lg | grep -q "^installer"'

  # A242: the bounded process and run/state lock are independent of one another.
  reset; call_limit=1
  bounded sh -c 'sleep 4' </dev/null >/dev/null 2>&1; rc=$?
  call_limit=120
  t 'hung process: bounded call times out' '[ "$rc" -eq 124 ]'
  lock
  printf '%s\n' next-owner > "$K/owner"
  unlock
  t 'lock takeover: old process preserves successor' '[ "$(cat "$K/owner")" = next-owner ]'
  reset
  printf '{"plugins":[{"version":"4.30.0","name":"skillator"}]}\n' > "$d/mkt/.claude-plugin/marketplace.json"
  t 'JSON metadata: field order does not affect version lookup' '[ "$(sh "$me" check)" = "newer 4.29.0 -> 4.30.0" ]'

  # 6: one run at a time
  reset; mkdir -p "$HOME/.skillator/self-update.lock"; echo "$now" > "$HOME/.skillator/self-update.lock/at"
  o=$(sh "$me" run)
  t 'lock held: run skipped, no claude call' '[ "$o" = "skipped: another update run is in progress" ] && ! lg | grep -q ^claude'
  echo $((now - 2000)) > "$HOME/.skillator/self-update.lock/at"
  o=$(sh "$me" run)
  t 'lock lasts beyond the due grace period' '[ "$o" = "skipped: another update run is in progress" ]'
  ws 1 0
  o=$(sh "$me" due-run)
  t 'due-run does not rewrite state held by run' '[ -z "$o" ] && st | grep -q startedAt.:0'
  echo $((now - 3600)) > "$HOME/.skillator/self-update.lock/at"
  o=$(sh "$me" run)
  t 'stale lock: taken, released' '[ "$o" = "updated 4.29.0 -> 4.30.0" ] && [ ! -e "$HOME/.skillator/self-update.lock" ]'

  # 7: no node, no plugin list
  np=$(command -v node 2>/dev/null) && np=${np%/*}
  if [ -n "$np" ]; then
    p2=$(printf '%s' "$PATH" | tr ':' '\n' | grep -vxF "$np" | paste -sd: -)
    if PATH=$p2 command -v sh > /dev/null && ! PATH=$p2 command -v node > /dev/null; then
      reset
      o=$(PATH=$p2 sh "$me" check)
      t 'no node: skipped' '[ "$o" = "skipped: no node to read plugin list" ]'
      PATH=$p2 sh "$me" run > /dev/null
      t 'no node: report once per day' '[ "$(PATH=$p2 sh "$me" due-run)" = "skillator update skipped: no node to read plugin list" ]'
      PATH=$p2 sh "$me" run > /dev/null
      t 'no node: repeat is quiet' '[ -z "$(PATH=$p2 sh "$me" due-run)" ]'
    fi
  fi

  # 8: SKILLATOR_UPDATE_HOURS must be a positive integer
  reset; ws "$now" 0
  o=$(SKILLATOR_UPDATE_HOURS=abc sh "$me" due-run 2>&1)
  t 'bad SKILLATOR_UPDATE_HOURS: default 24, not due, no error' '[ -z "$o" ] && st | grep -q "\"startedAt\":0"'
  reset
  o=$(SKILLATOR_UPDATE_HOURS=0 SU_OFFLINE=1 sh "$me" run 2>&1)
  t 'zero SKILLATOR_UPDATE_HOURS: default 24' '[ "$o" = offline ] && st | grep -q "next try in 24 h"'

  # 5: due-run stamps only startedAt; a fresh startedAt stops another spawn
  reset; ws 0 $((now - 60))
  sh "$me" due-run > /dev/null
  t 'run started 1 min ago: no second spawn' 'st | grep -q "\"startedAt\":$((now - 60))," && [ ! -s "$d/log" ]'
  reset; ws 0 $((now - 3600))
  s=$(ms)
  SU_SLEEP=3 sh "$me" due-run > /dev/null
  e=$(ms)
  t 'due-run returns in under 1 s, only startedAt written' '[ $((e - s)) -lt 1000 ] && st | grep -q "\"lastCheck\":0," && ! st | grep -q "\"startedAt\":$((now - 3600)),"'
  wait_run
  t 'due-run: the detached run finished the update and wrote lastCheck' 'lg | grep -q "^installer" && st | grep -q "\"lastResult\":\"updated"'

  cd / || :
  [ $F = 0 ] && echo ok
  exit $F
}

case ${1:-} in
  check) check; echo "$RES" ;;
  run) run ;;
  due-run) due_run ;;
  selftest) selftest ;;
  *) echo 'usage: self-update.sh check|run|due-run|selftest' >&2; exit 2 ;;
esac
exit 0
