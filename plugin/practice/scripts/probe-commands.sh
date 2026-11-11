#!/bin/sh
# probe-commands.sh - which hosts have /skillator-pending and /list-ticket-zordon command files (F54).
# READ-ONLY: runs `<cli> --version` and tests paths. It never runs a slash command,
# never writes config, never installs. Prints `host | path | present|absent | version`
# per file, then the live picker-check lines the owner runs by hand. Exit 0 always.
codex_home=${CODEX_HOME:-$HOME/.codex}

has() { command -v "$1" >/dev/null 2>&1; }
ver() { "$@" 2>&1 | head -n 1 | tr -d '\015'; }

# row <host> <version> <path>...
row() {
  _h=$1; _v=$2; shift 2
  for _f in "$@"; do
    if [ -f "$_f" ]; then _p=present; else _p=absent; fi
    echo "$_h | $_f | $_p | ${_v:-unknown}"
  done
}

has codex && row codex "$(ver codex --version)" \
  "$codex_home/skills/skillator-pending/SKILL.md" "$codex_home/skills/list-ticket-zordon/SKILL.md"
has gemini && row gemini "$(ver gemini --version)" \
  "$HOME/.gemini/commands/skillator-pending.toml" "$HOME/.gemini/commands/list-ticket-zordon.toml"
# agy: the command is a skill; the installer writes both antigravity dests
has agy && row antigravity "$(ver agy --version)" \
  "$HOME/.gemini/config/skills/skillator-pending/SKILL.md" "$HOME/.gemini/config/skills/list-ticket-zordon/SKILL.md" \
  "$HOME/.gemini/skills/skillator-pending/SKILL.md" "$HOME/.gemini/skills/list-ticket-zordon/SKILL.md"
# cursor: ONLY `cursor-agent` is Cursor's CLI. A bare `agent` on PATH can be another
# tool (Grok's, on the author's machine), so it is never used or versioned here. On
# Windows the Git-Bash cursor-agent shim prints Node's version, so ask the .cmd first.
cv=""
if has cursor-agent; then
  cv=$(ver cursor-agent.cmd --version)
  case "$cv" in ""|*"not found"*|*"command"*) cv=$(ver cursor-agent --version) ;; esac
fi
has cursor-agent && row cursor "$cv" \
  "$HOME/.cursor/commands/skillator-pending.md" "$HOME/.cursor/commands/list-ticket-zordon.md"
has pi && row pi "$(ver pi --version)" \
  "$HOME/.pi/agent/prompts/skillator-pending.md" "$HOME/.pi/agent/prompts/list-ticket-zordon.md"

echo
echo "live picker check - the OWNER runs these by hand; this script runs none of them."
echo "headless (the host expands the slash command under -p):"
has agy && echo "  agy -p '/skillator-pending' --mode plan --sandbox"
has pi && echo "  pi -p '/skillator-pending' --no-tools"
has gemini && echo "  gemini -p '/skillator-pending' --approval-mode plan"
has cursor-agent && echo "  cursor-agent -p '/skillator-pending' --mode ask   (never bare 'agent')"
has codex && echo 'picker only: codex - type $ in the TUI (or /skills) and look for skillator-pending, list-ticket-zordon'
echo "every host: type / in its TUI and screenshot the list showing skillator-pending and list-ticket-zordon."
exit 0
