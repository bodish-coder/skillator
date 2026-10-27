#!/usr/bin/env sh
# ops - the skillator ops board beside any CLI.  sh ops.sh [repo-dir] [--ascii] [--no-color] [--once] ...
# Needs node 22.18 or newer (it runs the board's .ts directly). Exit code: the app's.
# Git Bash (mintty): node sees pipes there, not a console, so it cannot read raw keys;
# when that is so and winpty is on PATH, the board runs through winpty. --once never
# needs it.
# F89: --open starts the board in a new tab of the current Windows Terminal window when
# wt is on PATH under Git Bash (the 'skillator ops' profile when its fragment is
# installed), else runs it here as without it.
# F94: --status prints one quota row per CLI profile and exits 0, from any folder.
set -eu
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
case ${1:-} in ''|-*) ;; *) cd -- "$1" || exit 2; shift ;; esac
open=
for a in "$@"; do shift; if [ "$a" = --open ]; then open=1; else set -- "$@" "$a"; fi; done
# F102: --font-size N rewrites the installed 'skillator ops' Windows Terminal profile's font size, then exits
fs=; want=
for a in "$@"; do if [ -n "$want" ]; then fs=$a; want=; elif [ "$a" = --font-size ]; then fs=none; want=1; fi; done
if [ -n "$fs" ]; then
  case $(uname -s 2>/dev/null) in MINGW*|MSYS*|CYGWIN*) ;; *) echo "ops: --font-size sets the Windows Terminal profile only - zoom this terminal with its own keys" >&2; exit 2 ;; esac
  fs=$(printf '%s' "$fs" | sed 's/^0*//')
  case $fs in [6-9]|[1-6][0-9]|7[0-2]) ;; *) echo "ops: font size must be 6..72" >&2; exit 2 ;; esac
  frag=
  [ -n "${LOCALAPPDATA:-}" ] && frag="$(cygpath -u "$LOCALAPPDATA")/Microsoft/Windows Terminal/Fragments/skillator/ops.json"
  if [ -z "$frag" ] || [ ! -f "$frag" ]; then echo "ops: no 'skillator ops' profile installed - run install.ps1 first" >&2; exit 2; fi
  sed "s/\"size\": [0-9]*/\"size\": $fs/" "$frag" > "$frag.tmp" && mv "$frag.tmp" "$frag"
  echo "skillator ops font size $fs - tabs opened after Windows Terminal restarts use it (Ctrl+minus / Ctrl+plus zooms the current tab now)"
  exit 0
fi
v=$(node -p 'process.versions.node' 2>/dev/null || true)
maj=${v%%.*}; rest=${v#*.}; min=${rest%%.*}
case $maj$min in ''|*[!0-9]*) maj=0; min=0 ;; esac
if [ -z "$v" ] || [ "$maj" -lt 22 ] || { [ "$maj" -eq 22 ] && [ "$min" -lt 18 ]; }; then
  echo "ops needs node 22.18 or newer (found ${v:-none}): https://nodejs.org" >&2; exit 2
fi
# node --import takes a URL: file:///C:/... on Windows (Git Bash), file:///... elsewhere.
msys=
case $(uname -s 2>/dev/null) in MINGW*|MSYS*|CYGWIN*) msys=1 ;; esac
dir=$here
if [ -n "$msys" ]; then dir=$(cd -- "$here" && pwd -W); fi
if [ -n "$open" ] && [ -n "$msys" ] && wt=$(command -v wt 2>/dev/null); then
  shw=$(cd -- "$(dirname -- "$(command -v sh)")" && pwd -W)/sh.exe
  set -- -d "$(pwd -W)" "$shw" "$dir/ops.sh" "$@"
  if [ -n "${LOCALAPPDATA:-}" ] && [ -f "$(cygpath -u "$LOCALAPPDATA")/Microsoft/Windows Terminal/Fragments/skillator/ops.json" ]; then
    set -- -p 'skillator ops' "$@"
  fi
  exec "$wt" -w 0 new-tab --title ops "$@"
fi
case $dir in /*) path=$dir ;; *) path=/$dir ;; esac
url=file://$(printf '%s' "$path" | sed 's/%/%25/g; s/ /%20/g; s/#/%23/g; s/?/%3F/g')
# A142: the board runs skillator's .sh scripts from here, on Windows too (nodehost.ts).
SKILLATOR_OPS_SHELL=sh; export SKILLATOR_OPS_SHELL
loader=$url/loader.mjs
app=$dir/app.ts
if [ -n "$msys" ] && [ -t 0 ] && [ -t 1 ]; then
  once=
  for a in "$@"; do case $a in --once|--status) once=1 ;; esac; done
  # A150: winpty starts its program through CreateProcess, which looks in the current
  # directory (the repo, cd'd into above) before PATH - so node goes to it by absolute
  # Windows path, the one this shell resolves; no absolute node: no winpty.
  nodep=$(command -v node 2>/dev/null || true)
  case $nodep in /*) nodew=$(cd -- "$(dirname -- "$nodep")" && pwd -W)/node.exe ;; *) nodew= ;; esac
  if [ -z "$once" ] && [ -n "$nodew" ] && ! node -e 'process.exit(process.stdin.isTTY && process.stdout.isTTY ? 0 : 1)' && command -v winpty >/dev/null 2>&1; then
    exec winpty "$nodew" --import "$loader" "$app" "$@"
  fi
fi
exec node --import "$loader" "$app" "$@"
