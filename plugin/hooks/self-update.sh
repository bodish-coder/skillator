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
# {"lastCheck":<epoch s>,"lastResult":"..","lastVersion":"..","notice":".."}
# The update follows /skillator-update (commands/skillator-update.md): the Claude
# Code plugins, then the installer from the updated plugin (source c.). Never -y.
# Off: SKILLATOR_AUTO_UPDATE=0. Mirror: self-update.ps1, same rules and output.

S="$HOME/.skillator/self-update.json"
H=${SKILLATOR_UPDATE_HOURS:-24}

# get <key>: a value from the state line, empty when absent.
get() {
  [ -f "$S" ] || return 0
  IFS= read -r j < "$S" || [ -n "$j" ] || return 0
  case $j in *"\"$1\":"*) ;; *) return 0 ;; esac
  v=${j#*\"$1\":}
  case $v in \"*) v=${v#\"}; v=${v%%\"*} ;; *) v=${v%%[,\}]*} ;; esac
  printf '%s' "$v"
}

# put <lastCheck> <lastResult> <lastVersion> <notice>
put() {
  c() { printf '%s' "$1" | tr -d '"\\\r\n'; }
  mkdir -p "${S%/*}" 2>/dev/null || return 0
  printf '{"lastCheck":%s,"lastResult":"%s","lastVersion":"%s","notice":"%s"}\n' \
    "${1:-0}" "$(c "$2")" "$(c "$3")" "$(c "$4")" > "$S.tmp" && mv -f "$S.tmp" "$S"
}

due() {
  lc=$(get lastCheck)
  case $lc in ''|*[!0-9]*) return 0 ;; esac
  [ $(( $(date +%s) - lc )) -ge $(( H * 3600 )) ]
}

# kv <names>: JSON string fields as `name value` lines, in document order (no jq).
kv() {
  tr -d '\r\n' | grep -oE "\"($1)\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" \
    | sed -E 's/^"([^"]*)"[[:space:]]*:[[:space:]]*"(.*)"$/\1 \2/; s#\\\\#/#g'
}

# pf <id> <field>: a field of plugin <id> from the kv'd `claude plugin list --json`.
pf() {
  printf '%s\n' "$L" | awk -v id="$1" -v f="$2" '
    $1 == "id" { cur = $2; next }
    $1 == f && cur == id { sub(/^[^ ]* /, ""); print; exit }'
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

# why_skip: a reason not to touch the install, or nothing.
why_skip() {
  r=$PWD
  until [ -e "$r/.git" ]; do
    n=${r%/*}
    { [ -n "$n" ] && [ "$n" != "$r" ]; } || return 0
    r=$n
  done
  for f in "$r"/.skillator/run-*.md; do
    [ -f "$f" ] && grep -qE '^\|[^|]*\|[^|]*\|[[:space:]]*~[[:space:]]*\|' "$f" \
      && { echo "a relay run is in flight (${f##*/})"; return 0; }
  done
  grep -qs '"name"[[:space:]]*:[[:space:]]*"skillator"' "$r/plugin/.claude-plugin/plugin.json" \
    && [ -n "$(git -C "$r" status --porcelain -- plugin 2>/dev/null)" ] \
    && echo 'uncommitted plugin edits'
  return 0
}

# check: sets RES (the printed line) and, for Claude Code, m / old / new / L.
check() {
  m='' old='' new='' L=''
  [ "${SKILLATOR_AUTO_UPDATE:-1}" = 0 ] && { RES='skipped: SKILLATOR_AUTO_UPDATE=0'; return; }
  w=$(why_skip)
  [ -n "$w" ] && { RES="skipped: $w"; return; }
  command -v claude >/dev/null 2>&1 || { RES='skipped: no claude on PATH - Claude Code not checked'; return; }
  L=$(claude plugin list --json </dev/null 2>/dev/null | kv 'id|version|installPath')
  m=$(printf '%s\n' "$L" | awk '$1 == "id" && $2 ~ /^skillator@/ { print substr($2, 11); exit }')
  [ -n "$m" ] || { RES='skipped: skillator is not a Claude Code plugin here'; return; }
  old=$(pf "skillator@$m" version)
  plain "$old" || { old=''; RES='skipped: unexpected version'; return; }
  claude plugin marketplace update "$m" </dev/null >/dev/null 2>&1 || { RES=offline; return; }
  loc=$(claude plugin marketplace list --json </dev/null 2>/dev/null | kv 'name|installLocation' \
    | awk -v m="$m" '$1 == "name" { n = $2; next } $1 == "installLocation" && n == m { sub(/^[^ ]* /, ""); print; exit }')
  new=$(cat "$loc/.claude-plugin/marketplace.json" 2>/dev/null | kv 'name|version' \
    | awk '$1 == "name" { n = $2; next } $1 == "version" && n == "skillator" { print $2; exit }')
  [ -n "$new" ] || { RES="failed: no skillator version in marketplace $m"; return; }
  plain "$new" || { new=''; RES='skipped: unexpected version'; return; }
  if newer "$old" "$new"; then RES="newer $old -> $new"; else RES="up to date $old"; fi
}

# cc <plugin>: claude plugin update, stdin closed so a confirmation prompt fails.
cc() {
  o=$(claude plugin update "$1" </dev/null 2>&1) && return 0
  if printf '%s' "$o" | grep -qiE 'confirm|shownCommand|--yes'; then
    RES='skipped: needs confirmation'; NOTE="skillator $new is out but its update needs confirmation - run /skillator-update"
  else
    RES="failed: claude plugin update $1"
  fi
  return 1
}

update() {
  cc "skillator@$m" || return
  printf '%s\n' "$L" | grep -q "^id ops-board@$m\$" && { cc "ops-board@$m" || return; }
  L=$(claude plugin list --json </dev/null 2>/dev/null | kv 'id|version|installPath')
  nv=$(pf "skillator@$m" version)
  ip=$(pf "skillator@$m" installPath)
  sv=$(cat "$ip/.claude-plugin/plugin.json" 2>/dev/null | kv version | awk '{ print $2; exit }')
  plain "$nv" && { [ -z "$sv" ] || plain "$sv"; } || { nv=''; RES='skipped: unexpected version'; return; }
  for v in "$nv" $sv; do
    newer "$v" "$old" && { RES="skipped: would downgrade $old -> $v"; return; }
  done
  ih=''
  if [ -f "$ip/install.sh" ] && [ -f "$ip/install.ps1" ]; then
    case $(uname -s 2>/dev/null) in
      MINGW*|MSYS*|CYGWIN*) powershell -NoProfile -ExecutionPolicy Bypass -File "$ip/install.ps1" -Force ;;
      *) sh "$ip/install.sh" --force ;;
    esac </dev/null >/dev/null 2>&1 || ih=' (other hosts: installer failed - run /skillator-update)'
  else
    ih=' (other hosts: no installer in the plugin - run /skillator-update)'
  fi
  RES="updated $old -> $nv"
  NOTE="skillator updated $old -> $nv - restart Claude Code to load it$ih"
}

run() {
  NOTE='' nv=''
  check
  case $RES in newer*) update ;; esac
  case $RES in
    offline|failed*) NOTE="skillator update check: $RES - next try in $H h" ;;
  esac
  [ -n "$NOTE" ] || NOTE=$(get notice)
  put "$(date +%s)" "$RES" "${nv:-$old}" "$NOTE"
  echo "$RES"
}

due_run() {
  n=$(get notice)
  if [ -n "$n" ]; then
    printf '%s\n' "$n"
    put "$(get lastCheck)" "$(get lastResult)" "$(get lastVersion)" ''
  fi
  [ "${SKILLATOR_AUTO_UPDATE:-1}" = 0 ] && return 0
  due || return 0
  # stamped first, so the prompts while `run` works do not start another
  put "$(date +%s)" "$(get lastResult)" "$(get lastVersion)" ''
  ( sh "$0" run </dev/null >/dev/null 2>&1 & )
}

selftest() {
  d=$(mktemp -d) || { echo 'FAIL: mktemp'; exit 1; }
  trap 'cd / && rm -rf "$d"' EXIT
  me=$(cd "$(dirname -- "$0")" && pwd)/self-update.sh
  mkdir -p "$d/bin" "$d/home" "$d/repo/.git" "$d/inst" "$d/mkt/.claude-plugin"
  lw=$(cd "$d" && { pwd -W 2>/dev/null || pwd; })
  export SU_D="$d" HOME="$d/home" USERPROFILE="$d/home" PATH="$d/bin:$PATH"
  unset SKILLATOR_AUTO_UPDATE SKILLATOR_UPDATE_HOURS SU_OFFLINE SU_CONFIRM SU_SLEEP SU_DIRTY SU_OLDV SU_NEWV
  cat_v() { printf '{"name":"skillator","plugins":[{"name":"skillator","version":"%s"}]}\n' "$1" > "$d/mkt/.claude-plugin/marketplace.json"; }
  cat > "$d/bin/claude" <<'EOF'
#!/bin/sh
echo "claude $*" >> "$SU_D/log"
case "$*" in
  'plugin list --json') v=${SU_OLDV:-4.29.0}; [ -f "$SU_D/updated" ] && v=${SU_NEWV:-4.30.0}
    printf '[{"id":"skillator@skillator","version":"%s","installPath":"%s"},{"id":"ops-board@skillator","version":"0.17.0","installPath":"x"}]\n' "$v" "$SU_D/inst" ;;
  'plugin marketplace update skillator') [ -n "$SU_SLEEP" ] && sleep "$SU_SLEEP"; [ -z "$SU_OFFLINE" ] ;;
  'plugin marketplace list --json') printf '[{"name":"skillator","installLocation":"%s"}]\n' "$SU_D/mkt" ;;
  'plugin update skillator@skillator') [ -n "$SU_CONFIRM" ] && { echo 'Run again with -y to confirm'; exit 1; }; : > "$SU_D/updated" ;;
  'plugin update ops-board@skillator') ;;
  *) exit 1 ;;
esac
EOF
  cat > "$d/bin/git" <<'EOF'
#!/bin/sh
echo "git $*" >> "$SU_D/log"
case "$*" in *status*) printf '%s' "$SU_DIRTY" ;; esac
EOF
  printf '#!/bin/sh\necho "installer sh $*" >> "$SU_D/log"\n' > "$d/inst/install.sh"
  printf 'Add-Content -LiteralPath "%s/log" -Value ("installer ps1 " + ($args -join " "))\n' "$lw" > "$d/inst/install.ps1"
  chmod +x "$d/bin/claude" "$d/bin/git"
  F=0
  t() { if eval "$2"; then :; else echo "FAIL: $1"; F=1; fi; }
  st() { cat "$HOME/.skillator/self-update.json" 2>/dev/null; }
  lg() { [ -f "$d/log" ] && tr -d '\r' < "$d/log"; }
  reset() { rm -rf "$d/log" "$d/updated" "$HOME/.skillator" "$d/repo/.skillator" "$d/repo/plugin"; cat_v 4.30.0; }
  cd "$d/repo" || exit 1
  now=$(date +%s)

  reset; mkdir -p "$HOME/.skillator"
  printf '{"lastCheck":%s,"lastResult":"up to date 4.29.0","lastVersion":"4.29.0","notice":""}\n' "$now" > "$HOME/.skillator/self-update.json"
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
  t 'due + newer: calls in order' '[ "$(lg | grep -v "^installer")" = "$exp" ] && lg | tail -1 | grep -qi "^installer .*-force"'
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

  reset; mkdir -p "$d/repo/.skillator"
  printf '| # | stage | state |\n|---|---|---|\n| 1 | x | ~ |\n' > "$d/repo/.skillator/run-0001-x.md"
  t 'run in flight: skipped' '[ "$(sh "$me" check)" = "skipped: a relay run is in flight (run-0001-x.md)" ] && ! lg | grep -q ^claude'

  reset; mkdir -p "$d/repo/plugin/.claude-plugin"
  printf '{"name": "skillator"}\n' > "$d/repo/plugin/.claude-plugin/plugin.json"
  t 'dirty plugin: skipped' '[ "$(SU_DIRTY=" M plugin/x" sh "$me" check)" = "skipped: uncommitted plugin edits" ] && ! lg | grep -q ^claude'

  reset
  t 'opt-out: check skipped' '[ "$(SKILLATOR_AUTO_UPDATE=0 sh "$me" check)" = "skipped: SKILLATOR_AUTO_UPDATE=0" ]'
  o=$(SKILLATOR_AUTO_UPDATE=0 sh "$me" due-run)
  t 'opt-out: due-run does nothing' '[ -z "$o" ] && [ ! -s "$d/log" ] && [ -z "$(st)" ]'

  reset
  o=$(SU_CONFIRM=1 sh "$me" run)
  t 'confirmation prompt: skipped, never -y' '[ "$o" = "skipped: needs confirmation" ] && ! lg | grep -qE -- "(^| )(-y|--yes)( |$)"'

  reset
  o=$(SU_NEWV=4.28.0 sh "$me" run)
  t 'downgrade: refused, no installer' '[ "$o" = "skipped: would downgrade 4.29.0 -> 4.28.0" ] && ! lg | grep -q "^installer"'

  reset
  o=$(SU_OLDV='4.29.0-evil$(x)' sh "$me" run)
  t 'unexpected version: skipped, kept out of notice and commands' '[ "$o" = "skipped: unexpected version" ] && ! st | grep -q evil && ! lg | grep -q -e evil -e "plugin update"'

  reset
  s=$(date +%s)
  SU_SLEEP=3 sh "$me" due-run > /dev/null
  e=$(date +%s)
  t 'due-run returns in under 1 s, run detached' '[ $((e - s)) -le 1 ] && st | grep -q "\"lastCheck\":[1-9]"'
  i=0
  until st | grep -q '"lastResult":"updated' || [ $i -ge 30 ]; do sleep 1; i=$((i + 1)); done
  t 'due-run: the detached run finished the update' 'lg | grep -q "^installer"'

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
