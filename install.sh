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
# antigravity has two: ~/.gemini/config/skills is Antigravity's own documented path,
# ~/.gemini/skills is what Gemini CLI 0.57 actually reads (probed 2026-09-06, again
# for A73 2026-09-23: it does NOT read ~/.gemini/config/skills).
# pi has two: ~/.pi/agent/skills is what pi 0.74 reads; ~/.pi/skills is not on its
# discovery list (probed for A73) and is kept only so an existing install is not
# orphaned.
# A73: there is no row for the shared ~/.agents/skills dir any more. Every host that
# reads it also reads a dir of its own that this script fills, so writing it only
# ever registered each skill a second time. Measured 2026-09-23 against a synthetic
# HOME holding the same dummy skill in both dirs:
#   codex 0.155 (app-server skills/list): loads both, NO dedupe - listed twice.
#   gemini 0.57 (skills list --all):      loads both, dedupes by name, and the
#                                         ~/.agents copy WINS over ~/.gemini/skills.
#   pi 0.74 (rpc get_commands):           loads both, dedupes by name, own dir wins.
#   cursor: reads both per PLATFORMS.md - not probed.
# A copy left in ~/.agents/skills by an older install still doubles codex and
# shadows Gemini's fresh copy with a stale one, so it is reported below, not deleted.

targets="
claude-code|$HOME/.claude|$HOME/.claude/skills
cursor|$HOME/.cursor|$HOME/.cursor/skills
codex|$codex_home|$codex_home/skills
antigravity|$HOME/.gemini|$HOME/.gemini/config/skills|$HOME/.gemini/skills
pi|$HOME/.pi|$HOME/.pi/agent/skills|$HOME/.pi/skills
"

# Claude Code can also have them via the plugin marketplace - that counts as installed.
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

# A62a: codex builds before 0.155.0 read only ~/.agents/skills, not $codex_home/skills
# (this installer's codex row). On such a build a fresh install here is silently
# unreachable, so warn and give the one-line fix (or: upgrade codex).
if command -v codex >/dev/null 2>&1; then
  _cx_raw=$(codex --version 2>/dev/null || true)
  _cx_ver=$(printf '%s' "$_cx_raw" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
  _cx_old=""
  if [ -z "$_cx_ver" ]; then
    _cx_old=1
  else
    _cx_major=${_cx_ver%%.*}
    _cx_rest=${_cx_ver#*.}
    _cx_minor=${_cx_rest%%.*}
    if [ "$_cx_major" = 0 ] && [ "$_cx_minor" -lt 155 ] 2>/dev/null; then _cx_old=1; fi
  fi
  if [ -n "$_cx_old" ]; then
    echo
    if [ -z "$_cx_ver" ]; then
      echo "warn  codex --version did not report a version this script can parse: \"$_cx_raw\""
    else
      echo "warn  codex $_cx_ver is older than 0.155.0"
    fi
    echo "      that build reads only $HOME/.agents/skills for skills, not $codex_home/skills,"
    echo "      so a fresh install here is invisible to it. Copy the installed skills there:"
    echo "        mkdir -p $HOME/.agents/skills && cp -R $codex_home/skills/. $HOME/.agents/skills/"
    echo "      or upgrade codex."
  fi
fi

# A73: skillator skills left in the shared dir by an older install of this script.
# Reported, never removed - the dir is shared with other tools and deleting from it
# is the user's call.
_old=""
for _s in "$src"/*/; do
  _name=$(basename "$_s")
  if [ -e "$HOME/.agents/skills/$_name/SKILL.md" ]; then _old="$_old $_name"; fi
done
if [ -n "$_old" ]; then
  echo
  echo "note  $HOME/.agents/skills still holds skillator skills from an older install:"
  echo "       $_old"
  echo "      codex lists each of these twice, and Gemini CLI prefers them over the fresh"
  echo "      copy in ~/.gemini/skills. This installer no longer writes that dir; remove"
  echo "      those skill folders by hand (and PLATFORMS.md, PRACTICE.md, WORKFLOW.md,"
  echo "      practice/, references/ beside them if nothing else uses them)."
fi

echo
echo "Prime Agent: no markdown-skill loader - point its AGENTS.md at $src/<skill>/SKILL.md."
