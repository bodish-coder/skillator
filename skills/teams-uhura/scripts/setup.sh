#!/bin/sh
# setup.sh - teams-uhura first-time setup on macOS / Linux (F86). Mirror: setup.ps1.
# Walks the first install. Every step checks first and is skipped when already done,
# so it is safe to re-run. The token and the Workflows URL never pass through this
# script: they go in the ops board form (Messages tab, s).
#   sh setup.sh              the walk
#   sh setup.sh --check      checks + table, changes nothing
#   sh setup.sh --selftest   offline, every command stubbed
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
tunnel_hosted() { pgrep -f "devtunnel host" >/dev/null 2>&1; }
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

# https://<tunnel id>-<port>.<region>.devtunnels.ms, from the tunnel id devtunnel show prints
tunnel_url() {
  devtunnel show "$TUNNEL" 2>/dev/null |
    sed -n "s/.*Tunnel ID[[:space:]]*:[[:space:]]*\([A-Za-z0-9_-]*\)\.\([A-Za-z0-9]*\).*/https:\/\/\1-$PORT.\2.devtunnels.ms/p" | head -n 1
}

read_config() {
  _c=$(node "$TEAM" config show 2>/dev/null)
  _p=$(printf '%s' "$_c" | sed -n 's/.*"port":\([0-9][0-9]*\).*/\1/p'); PORT=${_p:-3978}
  case $_c in *'"token":true'*'"workflowUrl":"'*) SAVED=1 ;; *) SAVED= ;; esac
  if [ -n "$SAVED" ]; then R_FORM=set; else R_FORM='not set'; fi
}
listener_up() { node "$TEAM" status --port "$PORT" 2>/dev/null | grep -q '^listener: up'; }
set_listener() { if [ -n "$UP" ]; then R_LISTEN="up on 127.0.0.1:$PORT"; else R_LISTEN='not running'; fi; }
table() {
  say ''
  printf '  %-11s %s\n' node "$R_NODE" brew "$R_BREW" devtunnel "$R_DT" login "$R_LOGIN" tunnel "$R_TUN" listener "$R_LISTEN" 'form saved' "$R_FORM"
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
  if tunnel_hosted; then say 'tunnel: already hosted'; else open_tunnel; fi
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
  'devtunnel create '*) : > "$ST/tunnel" ;;
  'devtunnel port list '*) if [ -f "$ST/port" ]; then echo 'Port 3978 auto'; else echo 'Found 0 ports'; fi ;;
  'devtunnel port create '*) : > "$ST/port" ;;
  'node '*' config show') if [ -f "$ST/saved" ]; then echo '{"token":true,"workflowUrl":"x.logic.azure.com","port":3978}'; else echo '{"token":false,"workflowUrl":null,"port":3978}'; fi ;;
  'node '*' status --port '*) if [ -f "$ST/up" ]; then echo 'listener: up on 127.0.0.1:3978 (pid 1)'; else echo 'listener: not running on port 3978'; fi ;;
  'node '*' start --port '*) : > "$ST/up" ;;
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
  open_tunnel() { echo host >> "$ST/calls"; }
  tunnel_hosted() { return 1; }
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
  ALL='node brew devtunnel curl bash'

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
  out 'https://skillator-teams-3978.euw.devtunnels.ms' || fail 'listener up: no URL'
  # whole walk: the Teams steps carry the URL, the form is named, the listener starts after it
  scen '' y "$ALL"
  [ "$CODE" = 0 ] || fail "walk: exit $CODE"
  called '^host' || fail 'walk: tunnel not hosted'
  called 'start --port 3978' || fail 'walk: listener not started'
  out 'Callback URL: https://skillator-teams-3978.euw.devtunnels.ms' || fail 'walk: Teams steps without the URL'
  out 'Messages tab, s' || fail 'walk: form not named'
  out '^  listener *up' || fail 'walk: table listener'
  out '^  form saved *set' || fail 'walk: table form'
  LC_ALL=C grep -q "$(printf '[^\t -~]')" "$SELF" && fail 'not pure ASCII + LF'
  echo ok
}

case $1 in
  --selftest) selftest ;;
  --check) CHECK=1; setup ;;
  '') setup ;;
  *) echo 'usage: setup.sh [--check | --selftest]' >&2; exit 2 ;;
esac
