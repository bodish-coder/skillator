#!/bin/sh
# setup.sh - teams-uhura first-time setup on macOS / Linux (F86). Mirror: setup.ps1.
# Walks the first install. Every step checks first and is skipped when already done,
# so it is safe to re-run. The token and the Workflows URL never pass through this
# script: they go in the ops board form (Messages tab, s).
#   sh setup.sh              the walk
#   sh setup.sh --check      checks + table, changes nothing
#   sh setup.sh --selftest   offline, every command stubbed
#   sh setup.sh --status | --arm | --disarm | --ack [url]   the ops board's keys (F177): key=value lines, exit 0
TEAM="$(cd "$(dirname "$0")" && pwd)/team.mjs"
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
TUNNEL=skillator-teams
CHECK=

say() { printf '%s\n' "$*"; }
has() { command -v "$1" >/dev/null 2>&1; }
# this process's PATH, with the dirs the installers write to
refresh_path() { PATH="$HOME/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"; }
answer() { printf '%s ' "$1" >&2; read -r _a || _a=; printf '%s' "$_a"; }
ask() { [ -z "$CHECK" ] || return 1; case $(answer "$1 [y/N]") in y|Y|yes|Yes|YES) return 0 ;; esac; return 1; }
tunnel_hosted() {
  _t="${1:-$TUNNEL}"; _p="${2:-$PORT}"
  if [ -n "$_p" ] && pgrep -f "devtunnel.*host.*[ -]-p" >/dev/null 2>&1; then
    pgrep -f "devtunnel.*host.*(^|[[:space:]\"'])($_t)(['\"[:space:]]|$).*[ -]-p(ort)?[[:space:]=]*$_p([[:space:]]|$)" >/dev/null 2>&1 ||
    pgrep -f "devtunnel.*host.*[ -]-p(ort)?[[:space:]=]*$_p([[:space:]]|$).*(^|[[:space:]\"'])($_t)(['\"[:space:]]|$)" >/dev/null 2>&1
    return $?
  fi
  pgrep -f "devtunnel.*host.*(^|[[:space:]\"'])($_t)(['\"[:space:]]|$)" >/dev/null 2>&1
}
open_tunnel() {
  mkdir -p "$HOME/.skillator/teams"
  nohup devtunnel host "$TUNNEL" > "$HOME/.skillator/teams/devtunnel.log" 2>&1 &
  say "tunnel: hosting $TUNNEL in the background (pid $!, log ~/.skillator/teams/devtunnel.log) - kill $! to stop it"
}

step_node() {
  has node || { say 'node: missing - install Node.js 18 or later from https://nodejs.org/ , open a new terminal, run this again'; return 1; }
  NODEV=$(node --version 2>/dev/null); say "node: $NODEV"
}

# brew is setup.sh's package manager for devtunnel; without it, Microsoft's install script
step_brew() {
  has brew && { say "brew: $(brew --version 2>/dev/null | head -n 1)"; return 0; }
  say 'brew: not found - devtunnel comes from Microsoft'"'"'s install script instead (curl -sL https://aka.ms/DevTunnelCliInstall | bash)'
  return 1
}

find_devtunnel() { has devtunnel && return 0; refresh_path; has devtunnel; }

step_devtunnel() {
  if ! find_devtunnel; then
    [ -n "$CHECK" ] && { say 'devtunnel: missing - the walk installs it'; return 1; }
    if [ -n "$BREW" ]; then
      say 'devtunnel: installing (brew install --cask devtunnel)'; brew install --cask devtunnel
    elif ask "Install devtunnel with Microsoft's script (curl -sL https://aka.ms/DevTunnelCliInstall | bash)?"; then
      curl -sL https://aka.ms/DevTunnelCliInstall | bash
    else
      say 'devtunnel: not installed - see https://aka.ms/devtunnels/download'; return 1
    fi
    find_devtunnel || { say 'devtunnel: still not found - open a new terminal and run this again'; return 1; }
  fi
  _v=$(devtunnel --version 2>/dev/null | sed -n 's/.*CLI version:[[:space:]]*\([^[:space:]]*\).*/\1/p' | head -n 1)
  say "devtunnel: ${_v:-present}"
}

logged_in() { devtunnel user show 2>/dev/null | grep -q 'Logged in as'; }

step_login() {
  logged_in && { say 'login: signed in to Dev Tunnels'; return 0; }
  [ -n "$CHECK" ] && { say 'login: not signed in to Dev Tunnels'; return 1; }
  say 'login: sign in to Dev Tunnels - your act; a browser opens, this waits for it'
  devtunnel user login
  logged_in && { say 'login: signed in'; return 0; }
  say 'login: not signed in - run this again'; return 1
}

# the persistent tunnel and its port, each created only when missing
step_tunnel() {
  _t=$(devtunnel show "$TUNNEL" 2>&1)
  if [ $? -ne 0 ] || printf '%s' "$_t" | grep -q 'not found'; then
    [ -n "$CHECK" ] && { say "tunnel: $TUNNEL not created yet"; return 1; }
    devtunnel create "$TUNNEL" --allow-anonymous > /dev/null 2>&1 || { say "tunnel: could not create $TUNNEL"; return 1; }
    say "tunnel: created $TUNNEL"
  fi
  if ! devtunnel port list "$TUNNEL" 2>/dev/null | grep -qw "$PORT"; then
    [ -n "$CHECK" ] && { say "tunnel: $TUNNEL has no port $PORT yet"; return 1; }
    devtunnel port create "$TUNNEL" -p "$PORT" > /dev/null 2>&1 || { say "tunnel: could not add port $PORT"; return 1; }
    say "tunnel: port $PORT added"
  fi
  say "tunnel: $TUNNEL on port $PORT"
}

# B28: the port's own portUri from `devtunnel show -j` - a named tunnel's URL carries its
# generated id, never its name, so it cannot be built from the Tunnel ID line
url_of() {
  printf '%s' "$1" | tr -d ' \r\n' | tr ',{}' '\n\n\n' |
    sed -n 's/^"portUri":"\(https:[^"[:cntrl:]]*\)"$/\1/p' | sed 's:/*$::' | grep -e "-$PORT\." | head -n 1
}
tunnel_url() { url_of "$(devtunnel show "$TUNNEL" -j 2>/dev/null)"; }

read_config() {
  _c=$(node "$TEAM" config show 2>/dev/null)
  _p=$(printf '%s' "$_c" | sed -n 's/.*"port":\([0-9][0-9]*\).*/\1/p'); PORT=${_p:-3978}
  case $_c in *'"token":true'*'"workflowUrl":"'*) SAVED=1 ;; *) SAVED= ;; esac
  case $_c in *'"token":true'*) TOKEN=1 ;; *) TOKEN= ;; esac
  if [ -n "$SAVED" ]; then R_FORM=set; else R_FORM='not set'; fi
}
listener_up() { node "$TEAM" status --port "$PORT" 2>/dev/null | grep -q '^listener: up'; }
set_listener() { if [ -n "$UP" ]; then R_LISTEN="up on 127.0.0.1:$PORT"; else R_LISTEN='not running'; fi; }
table() {
  say ''
  printf '  %-11s %s\n' node "$R_NODE" brew "$R_BREW" devtunnel "$R_DT" login "$R_LOGIN" tunnel "$R_TUN" listener "$R_LISTEN" 'form saved' "$R_FORM"
}

# --- F177: the ops board's keys. --status reads; --arm, --disarm and --ack act, each only
# on the owner's key press on the Messages tab. Output: thirteen key=value lines.
state_dir() { printf '%s' "${SKILLATOR_TEAMS_STATE:-$HOME/.skillator/teams}"; }
seen_url() { [ -f "$(state_dir)/tunnel-url" ] && tr -d '\r\n' < "$(state_dir)/tunnel-url"; }
save_url() { mkdir -p "$(state_dir)" && (umask 077; printf '%s\n' "$1" > "$(state_dir)/tunnel-url"); }
mark_url() { _s=$(seen_url); if [ -n "$A_URL" ] && [ -n "$_s" ] && [ "$_s" != "$A_URL" ]; then A_CHANGED=1; else A_CHANGED=0; fi; }
# no control character, at most 40 characters, else none - as setup.ps1
expiry_of() { printf '%s' "$1" | tr -d '\r\n' | sed -n 's/.*"tunnelExpiration"[[:space:]]*:[[:space:]]*"\([^"[:cntrl:]]\{1,40\}\)".*/\1/p'; }
# the host process open_tunnel starts, on this port or none - the pattern pkill -f is given
host_re() { printf '%s' "^([^ ]*/)?devtunnel host $TUNNEL( .*(-p|--port)[ =]?$PORT( .*)?)?\$"; }
stop_tunnel() { pkill -f "$(host_re)" >/dev/null 2>&1; sleep 1; }
now() { date +%s; }
# the board's call has 30 s (host.ts): every step of --arm stops at 25; what is unknown stays as is
late() { [ "$(now)" -lt "$_dl" ] && return 1; A_RESULT=failed; A_WHY='took too long - try again'; }
# --ack [url]: one argument at most, an https:// URL; every other mode takes none
args_ok() { [ $# -le 1 ] || { [ $# = 2 ] && [ "$1" = --ack ] && case $2 in https://*) true ;; *) false ;; esac; }; }
# note= (A235): setup.ps1 notes a devtunnel it cannot inspect; pgrep -f reads every command line, so here it is empty
show_arm() {
  printf '%s\n' "result=$A_RESULT" "why=$A_WHY" "devtunnel=$A_DT" "login=$A_LOGIN" "form=$A_FORM" "tunnel=$A_TUN" \
    "hosted=$A_HOSTED" "listener=$A_LISTEN" "port=$PORT" "url=$A_URL" "url_changed=$A_CHANGED" "expires=$A_EXP" "note="
}

arm_view() {
  A_RESULT=status; A_WHY=; A_DT=missing; A_LOGIN=-; A_FORM=notset; A_TUN=-; A_HOSTED=0; A_LISTEN=down; A_URL=; A_CHANGED=0; A_EXP=
  PORT=3978; TOKEN=
  if has node; then
    read_config
    [ -n "$TOKEN" ] && A_FORM=set
    listener_up && A_LISTEN=up
  fi
  if find_devtunnel; then
    A_DT=ok
    if logged_in; then
      A_LOGIN=in
      if _j=$(devtunnel show "$TUNNEL" -j 2>/dev/null) && printf '%s' "$_j" | tr -d ' \r\n' | grep -q "\"portNumber\":$PORT[,}]"; then
        A_TUN=ready; A_URL=$(url_of "$_j"); A_EXP=$(expiry_of "$_j")
      else A_TUN=none; fi
    else A_LOGIN=out; fi
    tunnel_hosted "$TUNNEL" "$PORT" && A_HOSTED=1
  fi
  mark_url
}

arm() {
  _dl=$(($(now) + 25))
  arm_view
  late && return 0
  if [ "$A_DT" != ok ]; then _no='devtunnel is not installed - s, then First-time setup'
  elif [ "$A_LOGIN" != in ]; then _no='not signed in to Dev Tunnels - s, then Sign in to Dev Tunnels'
  elif ! has node; then _no='node is not installed - install Node.js 18 or later, then c again'
  elif [ "$A_FORM" != set ]; then _no='the form has no token - s, paste the security token, save'
  elif [ "$A_TUN" != ready ]; then _no="the tunnel $TUNNEL is not created yet - s, then First-time setup"
  elif ! has pgrep; then _no='cannot verify the tunnel host - pgrep is missing; nothing was started'
  else _no=; fi
  if [ -n "$_no" ]; then A_RESULT=refused; A_WHY=$_no; return 0; fi
  # the listener first: the tunnel opens only onto a listener that verifies signatures
  if [ "$A_LISTEN" != up ]; then node "$TEAM" start --port "$PORT" >/dev/null 2>&1; listener_up && A_LISTEN=up; fi
  late && return 0
  if [ "$A_LISTEN" != up ]; then
    A_RESULT=failed
    if [ "$A_HOSTED" = 1 ]; then A_WHY='the listener did not come up - the tunnel is hosted with nothing behind it; d stops it'
    else A_WHY='the listener did not come up - the tunnel was not hosted'; fi
    return 0
  fi
  if [ "$A_HOSTED" != 1 ]; then
    open_tunnel >/dev/null
    # by the clock for 8 s, as setup.ps1 - a probe can be slow; late() holds the 25 s
    _end=$(($(now) + 8)); _seen=
    while :; do tunnel_hosted "$TUNNEL" "$PORT" && { _seen=1; break; }; late && return 0; [ "$(now)" -lt "$_end" ] || break; sleep 1; done
    if [ -z "$_seen" ]; then A_RESULT=failed; A_WHY='the tunnel did not start - see ~/.skillator/teams/devtunnel.log'; return 0; fi
    # a host that exits at once (signed out, port taken) is not armed
    sleep 2; tunnel_hosted "$TUNNEL" "$PORT" && A_HOSTED=1
    late && return 0
    if [ "$A_HOSTED" != 1 ]; then A_RESULT=failed; A_WHY='the tunnel stopped right after it started - see ~/.skillator/teams/devtunnel.log'; return 0; fi
  fi
  [ -n "$A_URL" ] || A_URL=$(tunnel_url)
  late && return 0
  if [ -n "$A_URL" ] && [ -z "$(seen_url)" ]; then save_url "$A_URL"; fi
  mark_url; A_RESULT=armed
}

disarm() {
  PORT=3978; has node && read_config
  if ! has pgrep || ! has pkill; then
    arm_view; A_RESULT=failed; A_WHY='cannot verify the tunnel is closed - pgrep or pkill is missing; nothing was stopped'; return 0
  fi
  stop_tunnel   # the tunnel first: the public side closes before the listener goes
  arm_view
  # still hosted (root's, another user's): the listener stays, so the tunnel never points at a dead port
  if [ "$A_HOSTED" = 1 ]; then A_RESULT=failed; A_WHY='the tunnel is still hosted - stop its devtunnel process; the listener is left up'; return 0; fi
  has node && node "$TEAM" stop --port "$PORT" >/dev/null 2>&1
  arm_view
  if [ "$A_HOSTED" = 1 ]; then A_RESULT=failed; A_WHY='the tunnel is still hosted - stop its devtunnel process'
  elif [ "$A_LISTEN" = up ]; then A_RESULT=failed; A_WHY='the listener is still up - node team.mjs stop'
  else A_RESULT=disarmed; fi
}

# $1: the URL the board copied; the one shown now is remembered only when it is that one
ack() {
  arm_view
  if [ -n "$1" ] && [ -z "$A_URL" ]; then A_RESULT=failed; A_WHY='the tunnel URL cannot be read now - is the tunnel hosted?'
  elif [ -n "$1" ] && [ "$1" != "$A_URL" ]; then A_RESULT=failed; A_WHY='the tunnel URL changed again since it was copied - y copies the new one'
  elif [ -n "$A_URL" ]; then save_url "$A_URL"; mark_url; A_RESULT=acked; else A_RESULT=failed; A_WHY='no tunnel URL to remember'; fi
}

setup() {
  R_NODE=missing; R_BREW=missing; R_DT=missing; R_LOGIN=-; R_TUN=-; R_LISTEN=-; R_FORM=-
  NODE=; BREW=; DT=; TN=; UP=; SAVED=; PORT=3978
  if step_node; then NODE=1; R_NODE=$NODEV; elif [ -z "$CHECK" ]; then table; return 1; fi
  step_brew && { BREW=1; R_BREW=ok; }
  step_devtunnel && { DT=1; R_DT=ok; }
  if [ -n "$NODE" ]; then read_config; listener_up && UP=1; set_listener; fi
  if [ -n "$DT" ]; then
    if step_login; then
      R_LOGIN='signed in'
      if step_tunnel; then TN=1; R_TUN="$TUNNEL port $PORT"; else R_TUN='not ready'; fi
    else R_LOGIN='not signed in'; fi
  fi
  [ -n "$CHECK" ] && { table; return 0; }
  [ -n "$TN" ] || { table; return 1; }
  ask "Arm it now: host $TUNNEL in the background and run the listener on 127.0.0.1:$PORT?" ||
    { say 'not armed - run this again when you are ready'; table; return 1; }
  if tunnel_hosted "$TUNNEL" "$PORT"; then say 'tunnel: already hosted'; else open_tunnel; fi
  URL=$(tunnel_url)
  if [ -n "$URL" ]; then say "tunnel URL: $URL"; else URL='<the https URL in ~/.skillator/teams/devtunnel.log>'; say "tunnel URL: read it in ~/.skillator/teams/devtunnel.log"; fi
  if [ -z "$SAVED" ]; then
    say ''
    say 'In Teams - these two cannot be scripted:'
    say "  1. The team > ... > Manage team > Apps > Create an outgoing webhook. Name: skillator. Callback URL: $URL"
    say '     Create, then copy the security token it shows once.'
    say '  2. The channel > ... > Workflows > "Post to a channel when a webhook request is received" > team, channel > Add workflow;'
    say '     copy the HTTP POST URL.'
    say 'Paste both into the ops board form - Messages tab, s - and nowhere else: not a chat, a command line or a file.'
    answer 'Press Enter when both are saved in the form' > /dev/null
    read_config
  fi
  if [ -n "$UP" ]; then say "listener: already up on 127.0.0.1:$PORT"
  elif [ -n "$SAVED" ]; then node "$TEAM" start --port "$PORT"; listener_up && UP=1
  else say 'listener: not started - the form has no token yet; save it, then run this again'; fi
  set_listener
  table
  [ -n "$UP" ] && [ -n "$SAVED" ]
}

selftest() {
  T=$(mktemp -d) || exit 1
  trap 'rm -rf "$T"' EXIT
  BIN="$T/bin"; ST="$T/st"; export BIN ST
  cat > "$T/stub" <<'EOF'
#!/bin/sh
n=${0##*/}; a="$n $*"; echo "$a" >> "$ST/calls"
case $a in
  *' --version') echo 'Tunnel CLI version: 1.0.1' ;;
  'devtunnel user show') if [ -f "$ST/login" ]; then echo 'Logged in as owner using GitHub.'; else echo 'Not logged in.'; fi ;;
  'devtunnel user login') : > "$ST/login" ;;
  'devtunnel show skillator-teams') if [ -f "$ST/tunnel" ]; then echo 'Tunnel ID : skillator-teams.euw'; else echo 'Tunnel not found.'; exit 1; fi ;;
  'devtunnel show skillator-teams -j') [ -f "$ST/slow" ] && echo 30 > "$ST/clock"; if [ -f "$ST/tunnel" ]; then i=ab12cd34; [ -f "$ST/newid" ] && i=zz99yy88; echo '{"tunnel":{"tunnelId":"skillator-teams.euw","tunnelExpiration":"2026-12-17T00:00:00Z","ports":[{"portNumber":3978,"portUri":"https://'"$i"'-3978.euw.devtunnels.ms/"}]}}'; else echo 'Tunnel not found.'; exit 1; fi ;;
  'devtunnel create '*) : > "$ST/tunnel" ;;
  'devtunnel port list '*) if [ -f "$ST/port" ]; then echo 'Port 3978 auto'; else echo 'Found 0 ports'; fi ;;
  'devtunnel port create '*) : > "$ST/port" ;;
  'node '*' config show') if [ -f "$ST/saved" ]; then echo '{"token":true,"workflowUrl":"x.logic.azure.com","port":3978}'; else echo '{"token":false,"workflowUrl":null,"port":3978}'; fi ;;
  'node '*' status --port '*) if [ -f "$ST/up" ]; then echo 'listener: up on 127.0.0.1:3978 (pid 1)'; else echo 'listener: not running on port 3978'; fi ;;
  'node '*' start --port '*) [ -f "$ST/nostart" ] || : > "$ST/up" ;;
  'node '*' stop --port '*) rm -f "$ST/up" ;;
  'curl '*) echo 'echo installed' ;;
  'bash'*) cat > /dev/null; cp "$0" "$BIN/devtunnel" ;;
  'brew install --cask devtunnel') cp "$0" "$BIN/devtunnel" ;;
  *) echo "unstubbed: $a" >&2; exit 1 ;;
esac
EOF
  PATH="$BIN:$PATH"
  has() { [ -x "$BIN/$1" ]; }
  refresh_path() { :; }
  answer() { echo ask >> "$ST/calls"; case $1 in Press*) : > "$ST/saved" ;; esac; printf '%s' "$YES"; }
  open_tunnel() { echo host >> "$ST/calls"; [ -f "$ST/noopen" ] || : > "$ST/hosted"; }
  tunnel_hosted() { [ -z "$PROBE" ] || echo $(($(now) + PROBE)) > "$ST/clock"; [ -f "$ST/hosted" ] || return 1; [ -f "$ST/dies" ] && rm -f "$ST/hosted"; return 0; }
  stop_tunnel() { echo unhost >> "$ST/calls"; [ -f "$ST/stuck" ] || rm -f "$ST/hosted"; }
  sleep() { echo $(($(now) + $1)) > "$ST/clock"; }
  now() { cat "$ST/clock" 2>/dev/null || echo 0; }
  SKILLATOR_TEAMS_STATE="$T/state"; export SKILLATOR_TEAMS_STATE; PROBE=
  # scen <check> <yes> <commands present> <state files>
  scen() {
    rm -rf "$BIN" "$ST"; mkdir -p "$BIN" "$ST"; : > "$ST/calls"
    for c in $3; do cp "$T/stub" "$BIN/$c"; chmod 755 "$BIN/$c"; done
    for f in $4; do : > "$ST/$f"; done
    CHECK=$1; YES=$2
    setup > "$T/out" 2>&1; CODE=$?
  }
  fail() { echo "FAIL: $1" >&2; cat "$T/out" "$ST/calls" >&2; exit 1; }
  out() { grep -q "$1" "$T/out"; }
  called() { grep -q "$1" "$ST/calls"; }
  MUTATE='^\(ask\|host\|curl\|bash\|brew install\|devtunnel create\|devtunnel port create\|devtunnel user login\|node .* start\)'
  ALL='node brew devtunnel curl bash pgrep pkill'

  # brew missing: --check names Microsoft's script, asks nothing, changes nothing
  scen 1 '' 'node curl bash'
  out 'aka.ms/DevTunnelCliInstall' || fail 'brew missing: no install script named'
  called "$MUTATE" && fail '--check asked or changed something'
  # the script runs only on the user's yes
  scen '' '' 'node curl bash'
  called '^curl' && fail 'install script ran without a yes'
  scen '' y 'node curl bash'
  called '^bash' || fail 'install script did not run on a yes'
  # devtunnel missing with brew: brew installs it; the fresh walk logs in, creates, adds the port
  scen 1 '' 'node brew'
  called "$MUTATE" && fail 'devtunnel missing under --check'
  out 'devtunnel: missing' || fail 'devtunnel missing not reported'
  scen '' '' 'node brew'
  called '^brew install --cask devtunnel' || fail 'devtunnel missing: not installed'
  called '^devtunnel user login' || fail 'no login'
  called '^devtunnel create skillator-teams --allow-anonymous' || fail 'no create'
  called '^devtunnel port create skillator-teams -p 3978' || fail 'no port'
  called '^\(host\|node .* start\)' && fail 'armed without a yes'
  # tunnel existing: neither created nor given its port again
  scen '' y "$ALL" 'login tunnel port saved'
  called 'create' && fail 'tunnel existing: created again'
  # listener already up: not started again, URL printed, exit 0
  scen '' y "$ALL" 'login tunnel port saved up'
  [ "$CODE" = 0 ] || fail "listener up: exit $CODE"
  called 'start --port' && fail 'listener up: started again'
  out 'https://ab12cd34-3978.euw.devtunnels.ms' || fail 'listener up: no URL'
  # whole walk: the Teams steps carry the URL, the form is named, the listener starts after it
  scen '' y "$ALL"
  [ "$CODE" = 0 ] || fail "walk: exit $CODE"
  called '^host' || fail 'walk: tunnel not hosted'
  called 'start --port 3978' || fail 'walk: listener not started'
  out 'Callback URL: https://ab12cd34-3978.euw.devtunnels.ms' || fail 'walk: Teams steps without the URL'
  out 'Messages tab, s' || fail 'walk: form not named'
  out '^  listener *up' || fail 'walk: table listener'
  out '^  form saved *set' || fail 'walk: table form'
  # --- F177: the board's modes ---
  # kv <mode function> <commands present> <state files>
  kv() {
    rm -rf "$BIN" "$ST"; mkdir -p "$BIN" "$ST"; : > "$ST/calls"
    for c in $2; do cp "$T/stub" "$BIN/$c"; chmod 755 "$BIN/$c"; done
    for f in $3; do : > "$ST/$f"; done
    $1; show_arm > "$T/out" 2>&1
  }
  ACTS='^\(host\|unhost\)$\| \(start\|stop\) --port '
  RDY='login tunnel port saved'
  U1='https://ab12cd34-3978.euw.devtunnels.ms'; U2='https://zz99yy88-3978.euw.devtunnels.ms'
  # --status: thirteen lines, the facts, nothing changed
  kv arm_view "$ALL" "$RDY"
  [ "$(wc -l < "$T/out" | tr -d ' ')" = 13 ] || fail 'status: not thirteen lines'
  [ "$(cut -d= -f1 "$T/out" | tr '\n' ,)" = 'result,why,devtunnel,login,form,tunnel,hosted,listener,port,url,url_changed,expires,note,' ] || fail 'status: keys'
  out '^result=status$' && out '^form=set$' && out '^tunnel=ready$' && out '^hosted=0$' && out '^listener=down$' || fail 'status: facts'
  out '^note=$' || fail '5: status without an empty note= line'
  out "^url=$U1\$" && out '^expires=2026-12-17T00:00:00Z$' && out '^url_changed=0$' || fail 'status: url / expires'
  called "$ACTS" && fail 'status changed something'
  # --arm refuses, and starts nothing: devtunnel missing, signed out, no token, no tunnel
  kv arm 'node' "$RDY";              out '^result=refused$' && out '^why=devtunnel is not installed' || fail 'arm: devtunnel missing'
  called "$ACTS" && fail 'arm: devtunnel missing started something'
  kv arm "$ALL" 'tunnel port saved'; out '^result=refused$' && out '^why=not signed in' || fail 'arm: signed out'
  called "$ACTS" && fail 'arm: signed out started something'
  kv arm "$ALL" 'login tunnel port'; out '^result=refused$' && out '^why=the form has no token' || fail 'arm: no token'
  called "$ACTS" && fail 'arm: no token started something'
  kv arm "$ALL" 'login saved';       out '^result=refused$' && out '^why=the tunnel skillator-teams is not created yet' || fail 'arm: no tunnel'
  called "$ACTS" && fail 'arm: no tunnel started something'
  # --arm: the listener first, then the tunnel; the URL is remembered on the first arm
  rm -rf "$T/state"
  kv arm "$ALL" "$RDY"
  out '^result=armed$' && out '^hosted=1$' && out '^listener=up$' && out "^url=$U1\$" && out '^url_changed=0$' || fail 'arm'
  [ "$(grep -e ' start --port 3978' -e '^host$' "$ST/calls" | head -n 1 | grep -c start)" = 1 ] || fail 'arm: the tunnel was hosted before the listener'
  [ "$(seen_url)" = "$U1" ] || fail 'arm: the URL was not remembered'
  # already up and hosted: neither started again
  kv arm "$ALL" "$RDY up hosted"; out '^result=armed$' || fail 'arm when armed'
  called "$ACTS" && fail 'arm when armed started something'
  # the listener does not come up: failed, the tunnel is not hosted
  kv arm "$ALL" "$RDY nostart"; out '^result=failed$' && out '^why=the listener did not come up' || fail 'arm without a listener'
  called '^host$' && fail 'arm without a listener hosted the tunnel'
  # the tunnel does not start: failed
  kv arm "$ALL" "$RDY noopen"; out '^result=failed$' && out '^why=the tunnel did not start' || fail 'arm without a tunnel process'
  # URL guard: unchanged = no warning; changed = warning, kept through --arm, cleared only by --ack
  kv arm_view "$ALL" "$RDY";       out '^url_changed=0$' || fail 'guard: an unchanged URL was flagged'
  kv arm_view "$ALL" "$RDY newid"; out "^url=$U2\$" && out '^url_changed=1$' || fail 'guard: a changed URL was not flagged'
  kv arm "$ALL" "$RDY newid";      out '^url_changed=1$' || fail 'guard: --arm cleared the warning'
  [ "$(seen_url)" = "$U1" ] || fail 'guard: --arm overwrote the remembered URL'
  kv ack "$ALL" "$RDY newid";      out '^result=acked$' && out '^url_changed=0$' || fail 'guard: --ack'
  [ "$(seen_url)" = "$U2" ] || fail 'guard: --ack did not remember the new URL'
  # --disarm: the tunnel first, then the listener
  kv disarm "$ALL" "$RDY up hosted"
  out '^result=disarmed$' && out '^hosted=0$' && out '^listener=down$' || fail 'disarm'
  [ "$(grep -e '^unhost$' -e ' stop --port 3978' "$ST/calls" | head -n 1 | grep -c unhost)" = 1 ] || fail 'disarm: the listener was stopped before the tunnel'
  # the tunnel will not stop (another user's, root's): failed, and the listener stays up
  kv disarm "$ALL" "$RDY up hosted stuck"
  out '^result=failed$' && out '^why=the tunnel is still hosted' && out '^listener=up$' || fail 'disarm: tunnel still hosted'
  called ' stop --port' && fail 'disarm: the listener was stopped under a hosted tunnel'
  # pgrep or pkill missing: it cannot verify - failed, nothing stopped, never disarmed
  kv disarm 'node devtunnel pkill' "$RDY up hosted"; out '^result=failed$' && out '^why=cannot verify' && out '^listener=up$' || fail 'disarm without pgrep'
  called "$ACTS" && fail 'disarm without pgrep stopped something'
  kv disarm 'node devtunnel pgrep' "$RDY up hosted"; out '^result=failed$' && out '^why=cannot verify' || fail 'disarm without pkill'
  called "$ACTS" && fail 'disarm without pkill stopped something'
  # --arm without pgrep: refused, nothing started (unseen, every c would start another host)
  kv arm 'node devtunnel pkill' "$RDY"; out '^result=refused$' && out '^why=cannot verify' || fail 'arm without pgrep'
  called "$ACTS" && fail 'arm without pgrep started something'
  # the pkill pattern: devtunnel host skillator-teams, on this port or none, nothing else
  PORT=3978
  for l in 'devtunnel host skillator-teams' '/usr/local/bin/devtunnel host skillator-teams' 'devtunnel host skillator-teams -p 3978' 'devtunnel host skillator-teams --port 3978 --allow-anonymous'; do
    printf '%s\n' "$l" | grep -Eq "$(host_re)" || fail "host_re missed: $l"; done
  for l in 'devtunnel host skillator-teams-2' 'devtunnel host skillator-teams -p 4000' 'devtunnel host skillator-teams -p 39780' 'vi devtunnel host skillator-teams' 'devtunnel host other'; do
    printf '%s\n' "$l" | grep -Eq "$(host_re)" && fail "host_re matched: $l"; done
  # A226 c: no control character in a value the board reads
  E=$(printf '\033')
  [ -z "$(url_of '{"ports":[{"portNumber":3978,"portUri":"https://ab12cd34-3978.euw.devtunnels.ms'"$E"'[2J"}]}')" ] || fail 'c: a portUri with a control character was kept'
  [ -z "$(expiry_of '{"tunnelExpiration":"2026-12-17'"$E"'[2J"}')" ] || fail 'c: an expiry with a control character was kept'
  # A226 e: an expiry over 40 characters is dropped, as setup.ps1 drops it - never cut
  [ -z "$(expiry_of '{"tunnelExpiration":"2026-12-17T00:00:00.0000000000000000000000Z"}')" ] || fail 'e: a long expiry was cut, not dropped'
  # A226 a: hosted by hand, the listener does not come up - the why does not say it was not hosted
  kv arm "$ALL" "$RDY nostart hosted"; out '^why=the listener did not come up' || fail 'a: no listener why'
  out 'was not hosted' && fail 'a: a hosted tunnel was said not hosted'
  # A226 b: a host that exits right after it starts is not armed
  kv arm "$ALL" "$RDY dies"; out '^result=failed$' && out '^why=the tunnel stopped right after it started' || fail 'b: a dying host was armed'
  # A226 d: --ack takes the URL copied; a newer one is not remembered in its place
  kv "ack $U1" "$ALL" "$RDY newid"; out '^result=failed$' && out '^why=the tunnel URL changed again' || fail 'd: a stale copy was acked'
  [ "$(seen_url)" = "$U2" ] || fail 'd: a stale --ack changed the remembered URL'
  kv "ack $U2" "$ALL" "$RDY newid"; out '^result=acked$' || fail 'd: the copied URL was not acked'
  # A226 f: node missing - c says so, not that the form has no token
  kv arm 'devtunnel pgrep pkill' "$RDY"; out '^result=refused$' && out '^why=node is not installed' || fail 'f: node missing, wrong reason'
  # A226 review 1: --ack with a URL and none readable says it cannot be read, not that it changed
  kv "ack $U1" "$ALL" 'login saved'; out '^result=failed$' && out '^why=the tunnel URL cannot be read now - is the tunnel hosted?$' || fail 'ack: unreadable URL said changed'
  # A226 review 1: the whole --arm under 25 s - a slow devtunnel show fails it, nothing started after
  kv arm "$ALL" "$RDY slow"; out '^result=failed$' && out '^why=took too long - try again$' || fail 'deadline: a slow arm was not stopped'
  called "$ACTS" && fail 'deadline: started something after the deadline'
  # A226 review 1: --ack takes one https:// URL at most - an option there is refused before anything runs
  for a in '--selftest' '--check' 'http://x.devtunnels.ms'; do args_ok --ack "$a" && fail "--ack $a was not refused"; done
  args_ok --ack https://x.devtunnels.ms extra && fail '--ack with two arguments was not refused'
  args_ok --check extra && fail '--check with an argument was not refused'
  args_ok --ack "$U1" && args_ok --ack && args_ok --check && args_ok || fail 'a documented form was refused'
  # A235 2: the host confirmed as the deadline passes - hosted=1, what was seen, as setup.ps1
  PROBE=10; kv arm "$ALL" "$RDY"; PROBE=
  out '^why=took too long - try again$' && out '^hosted=1$' || fail '2: a confirmed host past the deadline was not reported hosted'
  # A235 4: the poll for the host is by the clock, as setup.ps1 - probes of 5 s give up within 20 s, before the 25 s deadline
  PROBE=5; kv arm "$ALL" "$RDY noopen"; PROBE=
  out '^why=the tunnel did not start' && [ "$(now)" -le 20 ] || fail "4: a failed arm with 5 s probes took $(now) s"
  LC_ALL=C grep -q "$(printf '[^\t -~]')" "$SELF" && fail 'not pure ASCII + LF'
  echo ok
}

usage() { echo 'usage: setup.sh [--check | --selftest] | --status | --arm | --disarm | --ack [url]' >&2; exit 2; }
args_ok "$@" || usage
case $1 in
  --selftest) selftest ;;
  --check) CHECK=1; setup ;;
  --status) arm_view; show_arm ;;
  --arm) arm; show_arm ;;
  --disarm) disarm; show_arm ;;
  --ack) ack "$2"; show_arm ;;
  '') setup ;;
  *) usage ;;
esac
