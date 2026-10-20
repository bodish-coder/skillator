#!/usr/bin/env sh
# ops - the skillator ops board beside any CLI.  sh ops.sh [repo-dir] [--ascii] [--no-color] [--once] ...
# Needs node 22.18 or newer (it runs the board's .ts directly). Exit code: the app's.
# Git Bash (mintty): node sees pipes there, not a console, so it cannot read raw keys;
# when that is so and winpty is on PATH, the board runs through winpty. --once never
# needs it.
set -eu
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
case ${1:-} in ''|-*) ;; *) cd -- "$1" || exit 2; shift ;; esac
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
case $dir in /*) path=$dir ;; *) path=/$dir ;; esac
url=file://$(printf '%s' "$path" | sed 's/%/%25/g; s/ /%20/g; s/#/%23/g; s/?/%3F/g')
loader=$url/loader.mjs
app=$dir/app.ts
if [ -n "$msys" ] && [ -t 0 ] && [ -t 1 ]; then
  once=
  for a in "$@"; do [ "$a" = --once ] && once=1; done
  if [ -z "$once" ] && ! node -e 'process.exit(process.stdin.isTTY && process.stdout.isTTY ? 0 : 1)' && command -v winpty >/dev/null 2>&1; then
    exec winpty node.exe --import "$loader" "$app" "$@"
  fi
fi
exec node --import "$loader" "$app" "$@"
