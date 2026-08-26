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

# cli | marker (proves the CLI is installed) | global skills dir
targets="
claude-code|$HOME/.claude|$HOME/.claude/skills
cursor|$HOME/.cursor|$HOME/.cursor/skills
codex|$HOME/.codex|$HOME/.agents/skills
antigravity|$HOME/.gemini|$HOME/.gemini/config/skills
pi|$HOME/.pi|$HOME/.pi/skills
"

# Claude Code can also have them via the plugin marketplace — that counts as installed.
plugin=$(find "$HOME/.claude/plugins" -maxdepth 4 -type d -name skillator 2>/dev/null | head -1 || true)

echo "$targets" | while IFS='|' read -r cli marker dest; do
  [ -n "$cli" ] || continue
  if [ ! -d "$marker" ] && ! command -v "$cli" >/dev/null 2>&1; then
    echo "skip  $cli (not installed)"
    continue
  fi
  if [ "$cli" = "claude-code" ] && [ -n "$plugin" ]; then
    echo "ok    claude-code (installed via plugin: $plugin)"
    continue
  fi

  n=0
  for s in "$src"/*/; do
    name=$(basename "$s")
    # a skill symlinked to this repo is live - never replace it with a stale copy
    if [ -L "$dest/$name" ]; then continue; fi
    if [ -f "$dest/$name/SKILL.md" ] && [ -z "$force" ]; then continue; fi
    if [ "$n" = 0 ]; then echo "$cli -> $dest"; fi
    n=$((n + 1))
    if [ -n "$dry" ]; then echo "        would install $name"; continue; fi
    mkdir -p "$dest"
    rm -rf "$dest/$name"
    if [ -n "$link" ]; then
      ln -s "${s%/}" "$dest/$name"
      echo "        > $name (link)"
    else
      cp -R "$s" "$dest/$name"
      echo "        + $name"
    fi
  done
  if [ "$n" = 0 ]; then
    echo "ok    $cli (all skills already installed)"
  elif [ -z "$dry" ]; then
    # skills reference PLATFORMS.md / WORKFLOW.md beside the installed skills
    cp "$root/PLATFORMS.md" "$root/WORKFLOW.md" "$dest/"
  fi
done

echo
echo "Prime Agent: no markdown-skill loader - point its AGENTS.md at $src/<skill>/SKILL.md."
