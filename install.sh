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
# at all - it is its own row now, marked by $HOME so it is always written.
# antigravity has two: ~/.gemini/config/skills is Antigravity's own documented path,
# ~/.gemini/skills is what Gemini CLI 0.57 actually reports (probed 2026-09-06).
# pi has two: ~/.pi/agent/skills and the shared dir are pi's documented discovery
# list; ~/.pi/skills was never on it and is kept only so an existing install is
# not orphaned by this change.
# The shared row's marker is any host that actually READS ~/.agents/skills but has
# no dir of its own guaranteed to be filled - codex, pi, antigravity. Marking it
# $HOME instead would run it on every machine, including a Cursor-only one that
# already has ~/.cursor/skills, registering every skill twice there. Probe the same
# way row selection does (dir OR the CLI on PATH), or a host whose home dir does not
# exist yet installs while the shared dir it needs is skipped.
# Known residue: on a machine with Cursor AND one of these hosts, Cursor still reads
# both dirs and does double-register. Tracked as A73 - not fixable by skipping
# ~/.cursor/skills without betting on PLATFORMS.md's read-path claim being right.
# Row selection below re-tests [ -d "$marker" ] and falls back to `command -v shared`,
# which never resolves - so storing a host's DIRECTORY here defeated the probe: a host
# found only on PATH stored a dir that does not exist and the row was skipped, which is
# precisely the machine A65 exists for. Store a path that is known to exist instead, and
# let the boolean decide.
shared_marker=/nonexistent
for _c in codex pi gemini; do
  case $_c in codex) _d=$codex_home ;; *) _d=$HOME/.$_c ;; esac
  if [ -d "$_d" ] || command -v "$_c" >/dev/null 2>&1; then shared_marker=$HOME; break; fi
done

targets="
shared|$shared_marker|$HOME/.agents/skills
claude-code|$HOME/.claude|$HOME/.claude/skills
cursor|$HOME/.cursor|$HOME/.cursor/skills
codex|$codex_home|$codex_home/skills
antigravity|$HOME/.gemini|$HOME/.gemini/config/skills|$HOME/.gemini/skills
pi|$HOME/.pi|$HOME/.pi/agent/skills|$HOME/.pi/skills
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
    install_into "$cli" "$dest"
    IFS='|'
  done
  IFS=$oifs
done

echo
echo "Prime Agent: no markdown-skill loader - point its AGENTS.md at $src/<skill>/SKILL.md."
