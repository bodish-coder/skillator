#!/usr/bin/env sh
# Install skillator skills into the global skills dir of every agent CLI found.
# Skips any skill a CLI already has (including Claude Code's plugin install).
#   ./install.sh            install what's missing
#   ./install.sh --dry-run  show what it would do
#   ./install.sh --force    refresh skills that are already installed
#   ./install.sh --link     install as symlinks into this repo (stay live on git pull)
# Claude Code is left to its plugin install whenever one exists, --force included.
# Skills already symlinked to this repo are left alone - they are always current.
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
src="$root/skills"
dry=""; force=""; link=""
for a in "$@"; do
  case "$a" in
    --dry-run) dry=1 ;;
    --force)   force=1 ;;
    --link)    link=1 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done

codex_home=${CODEX_HOME:-$HOME/.codex}

# cli | marker (proves the CLI is installed) | global skills dir(s), '|'-separated
# A65: ~/.agents/skills is the shared cross-agent dir pi and Gemini CLI also read.
# It used to hang off the codex row, so a machine without codex got no shared copy
# at all - it is its own row now, marked by the host probe below (NOT by $HOME: that
# would run it on a Cursor-only machine and register every skill twice there).
# antigravity writes only ~/.gemini/config/skills, Antigravity's own documented path.
# A dir we STOP writing is not a dir that goes away: install_into only adds and
# overwrites, so every machine that ran the previous installer would keep a frozen
# ~/.gemini/skills forever, still printing the conflicts this change exists to remove
# and drifting from the repo on every pull. prune_dropped_dest below removes it, and
# only it - by name, and only where a SKILL.md proves the dir is one we wrote.
# Gemini CLI 0.57 also reads ~/.gemini/skills, but A73 probed what happens when both
# are filled: it dedupes by skill name and reports 20 lines of
#   Skill conflict detected: "X" from ~/.agents/skills is overriding ... ~/.gemini/skills
# The shared dir wins and is always written whenever this row fires, so the second
# copy is dead weight plus a wall of warnings. One copy, in the dir that wins.
# pi has two: ~/.pi/agent/skills and the shared dir are pi's documented discovery
# list; ~/.pi/skills was never on it and is marked `legacy:` - refreshed when it
# already exists so an old install does not go stale, never created. Without that
# a brand-new pi machine got a third full copy in a dir nothing reads.
# The shared row's marker is any host that actually READS ~/.agents/skills but has
# no dir of its own guaranteed to be filled - codex, pi, antigravity. Marking it
# $HOME instead would run it on every machine, including a Cursor-only one that
# already has ~/.cursor/skills, registering every skill twice there. Probe the same
# way row selection does (dir OR the CLI on PATH), or a host whose home dir does not
# exist yet installs while the shared dir it needs is skipped.
# Known residue: Cursor and pi both read the shared dir AND one of their own, so they
# see each skill twice on disk. Measured and benign: Gemini CLI dedupes by name (A73)
# and so does pi (A74) - one entry, no per-turn cost, and pi does not even warn. Cursor
# is unmeasured (no Cursor CLI to probe), but with two loaders deduping this is a
# duplicate on disk, not a context cost. Do not "fix" it by dropping a host's own dir
# without measuring that host: the wrong guess costs it the whole install.
# Row selection below re-tests [ -d "$marker" ] and falls back to `command -v shared`,
# which never resolves - so storing a host's DIRECTORY here defeated the probe: a host
# found only on PATH stored a dir that does not exist and the row was skipped, which is
# precisely the machine A65 exists for. Store a path that is known to exist instead, and
# let the boolean decide.
shared_marker=/nonexistent
for _c in codex pi gemini antigravity; do
  case $_c in
    codex)       _d=$codex_home ;;
    antigravity) _d=$HOME/.gemini ;;
    *)           _d=$HOME/.$_c ;;
  esac
  if [ -d "$_d" ] || command -v "$_c" >/dev/null 2>&1; then shared_marker=$HOME; break; fi
done

targets="
shared|$shared_marker|$HOME/.agents/skills
claude-code|$HOME/.claude|$HOME/.claude/skills
cursor|$HOME/.cursor|$HOME/.cursor/skills
codex|$codex_home|$codex_home/skills
antigravity|$HOME/.gemini|$HOME/.gemini/config/skills
pi|$HOME/.pi|$HOME/.pi/agent/skills|legacy:$HOME/.pi/skills
"

# Claude Code can also have them via the plugin marketplace — that counts as installed.
plugin=$(find "$HOME/.claude/plugins" -maxdepth 4 -type d -name skillator 2>/dev/null | head -1 || true)

# install_into <cli> <dest>: sync the skills, then always refresh the shared docs.
install_into() {
  _cli=$1; _dest=$2
  _n=0
  for _s in "$src"/*/; do
    _name=$(basename "$_s")
    # a skill symlinked to this repo is live - never replace it with a stale copy
    if [ -L "$_dest/$_name" ]; then continue; fi
    if [ -f "$_dest/$_name/SKILL.md" ] && [ -z "$force" ]; then continue; fi
    if [ "$_n" = 0 ]; then echo "$_cli -> $_dest"; fi
    _n=$((_n + 1))
    if [ -n "$dry" ]; then echo "        would install $_name"; continue; fi
    mkdir -p "$_dest"
    rm -rf "$_dest/$_name"
    if [ -n "$link" ]; then
      ln -s "${_s%/}" "$_dest/$_name"
      echo "        > $_name (link)"
    else
      cp -R "$_s" "$_dest/$_name"
      echo "        + $_name"
    fi
  done
  if [ "$_n" = 0 ]; then
    echo "ok    $_cli (all skills already installed) -> $_dest"
  fi
  # skills reference PLATFORMS.md / PRACTICE.md / WORKFLOW.md, practice/ and references/ beside the
  # installed skills - refresh them every run, even when no skill needed installing,
  # so the plain `git pull && ./install.sh` update path picks up doc changes.
  if [ -n "$dry" ]; then
    echo "        would refresh PLATFORMS.md PRACTICE.md WORKFLOW.md practice/ references/ in $_dest"
  else
    mkdir -p "$_dest"
    cp "$root/PLATFORMS.md" "$root/PRACTICE.md" "$root/WORKFLOW.md" "$_dest/"
    rm -rf "$_dest/practice" && cp -R "$root/practice" "$_dest/"
    rm -rf "$_dest/references" && cp -R "$root/references" "$_dest/"
  fi
}

# Destinations this installer used to fill and no longer does. Only ever removes a
# <dest>/<name>/ that matches a skill in this repo AND contains a SKILL.md, so a
# hand-made skill sharing a name is left alone and a typo'd path deletes nothing.
prune_dropped_dest() {
  _dead=$1
  # a symlinked dest resolves through -d and -f, and rm -rf would delete the TARGET.
  # Someone who hit the 20 conflict lines may well have symlinked this at another
  # host's skills dir by hand; never delete through it.
  [ -L "$_dead" ] && return 0
  [ -d "$_dead" ] || return 0
  _found=0
  for _s in "$src"/*/; do
    _name=$(basename "$_s")
    [ -f "$_dead/$_name/SKILL.md" ] || continue
    _found=$((_found + 1))
    if [ -n "$dry" ]; then
      [ "$_found" = 1 ] && echo "prune $_dead (no longer written)"
      echo "        would remove $_name"
    else
      [ "$_found" = 1 ] && echo "prune $_dead (no longer written)"
      rm -rf "$_dead/$_name"
      echo "        - $_name"
    fi
  done
  [ "$_found" = 0 ] && return 0
  if [ -z "$dry" ]; then
    # Same ownership test as the skills above - a blanket rm here deleted a user's
    # own practice/ directory in review. A doc goes only if it is byte-identical to
    # the one this repo ships; a dir goes only if a file we ship is inside it.
    for _f in PLATFORMS.md PRACTICE.md WORKFLOW.md; do
      cmp -s "$root/$_f" "$_dead/$_f" && rm -f "$_dead/$_f"
    done
    [ -f "$_dead/practice/scripts/taskwork.sh" ]   && rm -rf "$_dead/practice"
    [ -f "$_dead/references/anti-slop.md" ]        && rm -rf "$_dead/references"
    rmdir "$_dead" 2>/dev/null || true
  fi
}

# A73: Gemini CLI reads ~/.agents/skills (which the shared row fills) and dedupes
# against ~/.gemini/skills by name, so filling both only produced warnings.
prune_dropped_dest "$HOME/.gemini/skills"

echo "$targets" | while IFS='|' read -r cli marker dests; do
  [ -n "$cli" ] || continue
  if [ ! -d "$marker" ] && ! command -v "$cli" >/dev/null 2>&1; then
    echo "skip  $cli (not installed)"
    continue
  fi
  if [ "$cli" = "claude-code" ] && [ -n "$plugin" ]; then
    echo "ok    claude-code (installed via plugin: $plugin)"
    continue
  fi

  oifs=$IFS
  IFS='|'
  for dest in $dests; do
    IFS=$oifs
    case $dest in
      legacy:*)
        dest=${dest#legacy:}
        # only ever refreshed, never brought into existence
        [ -d "$dest" ] || { IFS='|'; continue; }
        ;;
    esac
    install_into "$cli" "$dest"
    IFS='|'
  done
  IFS=$oifs
done

echo
echo "Prime Agent: no markdown-skill loader - point its AGENTS.md at $src/<skill>/SKILL.md."
