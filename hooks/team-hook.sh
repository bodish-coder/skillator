#!/bin/sh
# skillator plugin, UserPromptSubmit (F66, teams-uhura). Every prompt of every plugin
# user runs this, so it is shell builtins only until there is something to deliver:
# find the repo's common git dir from the cwd (no git, no node), and start node only
# when <common git dir>/skillator/team-inbox.jsonl exists. No inbox, no repo or no node
# on PATH: silent, exit 0. Then team-hook.mjs reads the event on stdin (exec keeps it).
cr=$(printf '\r')
d=$PWD
c=''
while [ -n "$d" ]; do
  if [ -d "$d/.git" ]; then c="$d/.git"; break; fi
  if [ -f "$d/.git" ]; then
    IFS= read -r l < "$d/.git" || exit 0
    l=${l%"$cr"}
    g=${l#gitdir: }
    case $g in /*|[A-Za-z]:*) ;; *) g="$d/$g" ;; esac
    if [ -f "$g/commondir" ]; then
      IFS= read -r cd < "$g/commondir" || exit 0
      cd=${cd%"$cr"}
      case $cd in /*|[A-Za-z]:*) c=$cd ;; *) c="$g/$cd" ;; esac
    else
      c=$g
    fi
    break
  fi
  n=${d%/*}
  [ "$n" = "$d" ] && exit 0
  d=$n
done
[ -n "$c" ] && [ -f "$c/skillator/team-inbox.jsonl" ] || exit 0
command -v node > /dev/null 2>&1 || exit 0
exec node "$(dirname -- "$0")/../skills/teams-uhura/scripts/team-hook.mjs"
