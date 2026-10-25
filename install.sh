#!/usr/bin/env sh
# Install skillator skills into the global skills dir of every agent CLI found.
# Skips any skill a CLI already has (including Claude Code's plugin install).
#   ./install.sh            install what's missing
#   ./install.sh --dry-run  show what it would do
#   ./install.sh --force    refresh skills that are already installed
#   ./install.sh --link     install as symlinks into this repo (stay live on git pull)
#   ./install.sh --selftest install into a temp HOME and check what was written; prints ok
# F54: /pending, /list-tickets, /engage, /archive-tickets, /sync-tickets, /skillator-update, /team-messages and /pending-subagent are written as each host's own command file (codex
# prompts, Gemini CLI commands, cursor commands, pi prompt templates, opencode commands,
# Antigravity skill-commands) from host-commands/<host>/, rewritten every run - see write_commands.
# A96: a skill dir this script copies gets an ownership marker (.skillator-owned),
# and each skills dir a manifest (.skillator-installed) of the skillator skills in it.
# The marker records the SKILL.md hash and every file the installer placed. The next
# run removes a folder the manifest lists that the repo no longer ships - the fix for
# renamed skills whose stale copies outrank the new ones - but only if it is still
# exactly what was installed (or is a link into this repo); an edited one is kept. A dir with no manifest yet
# (installed before A96) loses only an old skillator name (legacy below) whose
# SKILL.md is byte-for-byte a version this repo once shipped. Nothing else is removed.
# Claude Code is left to its plugin install whenever one exists, --force included.
# Skills already symlinked to this repo are left alone - they are always current.
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
src="$root/skills"
dry=""; force=""; link=""; selftest=""
for a in "$@"; do
  case "$a" in
    --dry-run) dry=1 ;;
    --force)   force=1 ;;
    --link)    link=1 ;;
    --selftest) selftest=1 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done

codex_home=${CODEX_HOME:-$HOME/.codex}
# F67: opencode's config dir - $XDG_CONFIG_HOME/opencode when that is set, else
# ~/.config/opencode (opencode 1.19.4 `debug paths`); skills in <config>/skills, commands
# in <config>/commands/<n>.md
oc_config=${XDG_CONFIG_HOME:-$HOME/.config}/opencode

# cli | marker (proves the CLI is installed) | global skills dir(s), '|'-separated
# antigravity has three: ~/.gemini/config/skills is Antigravity's own documented path,
# ~/.gemini/skills is what Gemini CLI 0.57 actually reads (probed 2026-09-06, again
# for A73 2026-09-23: it does NOT read ~/.gemini/config/skills), and B8:
# ~/.gemini/antigravity-cli/skills is what agy (Antigravity CLI 1.4.5) reads as its
# global skills dir (2026-10-23). The IDE extension goes from config/skills only.
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
antigravity|$HOME/.gemini|$HOME/.gemini/config/skills|$HOME/.gemini/skills|$HOME/.gemini/antigravity-cli/skills
pi|$HOME/.pi|$HOME/.pi/agent/skills|$HOME/.pi/skills
opencode|$oc_config|$oc_config/skills
"

# Claude Code can also have them via the plugin marketplace - that counts as installed.
plugin=$(find "$HOME/.claude/plugins" -maxdepth 4 -type d -name skillator 2>/dev/null | head -1 || true)

manifest=.skillator-installed
owned=.skillator-owned
# LC_ALL=C: an ordinal sort, so the manifest is the same bytes under any locale
shipped=$(for _s in "$src"/*/; do basename "$_s"; done | LC_ALL=C sort)
# Every name this repo shipped and has since dropped: the From column of the rename
# table in docs/plans/PLAN-rename.md (From != To), plus the pre-F20 names from git
# history (relay, dev-alfred, ticket-checker, skillator-*).
legacy="a11y-proof brainstorm-build-lite brainstorm-build-mid brainstorm-build-prime
deploy-wizard func-ui handoff handoff-resume handoff-watch live-build merge-prep
merge-agent r2d2-relay replicator-agent screenshot-loop sherlock-codes spec-trace
ticket-master tui-proof relay dev-alfred ticket-checker skillator-brainstorm-build
skillator-brainstorm-build-lite skillator-brainstorm-build-mid
skillator-brainstorm-build-prime skillator-deploy-wizard skillator-design-arwen
skillator-func-ui skillator-handoff skillator-handoff-resume skillator-merge-agent
skillator-merge-prep"
# A pre-manifest folder has no marker, so ownership is proved by content: the first
# 16 hex of sha256 (CRs stripped) of every committed version of every legacy
# SKILL.md - 128 versions, `git log --all -- skills/<legacy>/SKILL.md`. The old
# files share no marker text (func-ui and ticket-checker never say "skillator"),
# and a user's own skill that merely shares a name cannot match these.
legacy_hashes="
  0009e598c9887d2e 0327c5edb2681ae4 08b432f4c65c6135 0bedc2fa45a45931 0cb23bc0b96941a1 0ea43dea3c62ec7d
  0ecac5c2a0a3e71f 1107311baf373879 112d37f54dd83705 12acc44be0dc0153 1319e84408b0646d 15f537bf3b456993
  161d9927d9d69785 1b18effb2fa1982a 1e1c6b7b884a65e2 1e5762879ac88933 222687335a01c6fb 2244a525c048db19
  230ceb1aef744128 264e7c4f9886f1b2 274a48ec314681c0 27f9be5222bd411e 2ceae32c8ea1b722 2fbf2ba065397b8d
  32d5f13dc1c55ec5 33a478f1c4f6b52d 36fd905f1b402683 39abb1cb448388af 3bc0624a4c57c0c8 3df7c34ff7b73bf8
  404be36ebda47aa9 425d42785f00a61c 450beb828bb84a77 476b7af1867c4e60 4b4b9ff6c1fc065f 4bf4cd2e965d2f04
  4bfb87bf5b86e219 4c61e0beea88dd0e 4e3daf97f2a6c330 5121015b65df6266 51360864d1495842 55d01195aaf1c6f1
  56c2917bdd05f9e9 5bbf46627d7308f6 5eb995c9e439d3ee 5f26973497a6c9fd 63fc7c050b438606 664e2a7b09e3b595
  6cb4e69b30283b4d 6db8a2259debd055 73d0d25bc0fdd108 74a90d9a297ec3f1 7546ec23a742f29a 758895cbba45ca83
  7659fd60c931526a 7cfdccc482c23ec9 7d0fbf4ae48dbf48 7d4b60230597a7a7 7d6078efea4dc7f8 7fc304fe9eeef0e3
  8038cf3385d716f3 816b4541c180a7f0 81de147e3087fe07 83823ed9bbce1099 85ced780dba9643c 8d791d2ccfbb9e11
  8ff21a3f735f5649 9156cbecb1032c26 936d877d3fe0d634 9422cc1dc8249f40 94ecf278cc72d236 95052b376e6a4460
  992291008c94f856 9ad39ab2ab2b7c37 9c4f6512a12d6185 a3f7413e192cb280 a4888c3f30af760c a51219fd635ed267
  a52588b0eefe4872 a5e1ca39d7d55588 abab43aa09a7f598 acf32c583ee14a03 b179b693b7fb9128 b1cb6e4cff9eeba1
  b32cfd9dddc102d0 b5e53acb7bec50b7 b8d2f949f0b1cccf bd412ea1773d074a bfb6709d377023a1 c010dd2ad2163947
  c03665f75b0d0759 c067ed4b8faff5d6 c1876bd68c9106c9 c315c6e2a1de208c c37ab0aa3810b954 c3b40352c0455072
  c43de748ae562b31 c6b510920de93736 c911cef1308a9c1f c99e7246d734db0e d33cb54725fe5c5e d6e9403a0c244878
  d75dfe9daf8b0f37 d79da86d058b0304 d8e5dd8088aaa579 db48fe92027b7696 db9b91ab4d15c331 dbc42e117e0f9411
  dcce5d2f9e54faac e0143e6c0d4ff150 e332be80f98615a7 e39445137df99708 e534ae6ad21c50c9 e67fd852f783d5ff
  e90178d77b6751bf e9db28a7ede6168d ef1dbe8fad5729a1 eff8d2ec867664a7 f020a67e985e48cb f0332efbbdbec2b0
  f055093d2a0c6688 f2a45373d278c81e f41b28f2e0ecaf81 f53099f72cf63b00 f5c8c7960b962b8d f6e533ee576149bc
  f71241e6fc57e4a6 fe7d7760dfc144d0
"

# skill_hash <file>: first 16 hex of sha256 over the file with CRs stripped
skill_hash() {
  if command -v sha256sum >/dev/null 2>&1; then
    tr -d '\r' < "$1" | sha256sum | cut -c1-16
  else
    tr -d '\r' < "$1" | shasum -a 256 | cut -c1-16
  fi
}

# fm_name <file>: the name: value from SKILL.md frontmatter
fm_name() {
  tr -d '\r' < "$1" | sed -n '/^name:/{s/^name:[[:space:]]*//;s/[[:space:]]*$//;p;q;}'
}

# write_owned <dir> <srcdir>: the ownership marker - SKILL.md hash + files placed
write_owned() {
  {
    echo "sha256 $(skill_hash "$2/SKILL.md")"
    (cd "$2" && find . ! -type d | sed 's#^\./##' | LC_ALL=C sort | sed 's#^#file #')
  } > "$1/$owned"
}

# owned_intact <dir>: true only if SKILL.md still matches the marker's hash and no
# file exists that the installer did not place. A marker with no hash never passes.
owned_intact() {
  _o="$1/$owned"
  [ -f "$_o" ] || return 1
  [ "$(sed -n 1p "$_o" | tr -d '\r')" = "sha256 $(skill_hash "$1/SKILL.md")" ] || return 1
  _extra=$(cd "$1" && find . ! -type d | sed 's#^\./##' | while IFS= read -r _f; do
    [ "$_f" = "$owned" ] && continue
    tr -d '\r' < "$_o" | grep -qxF -- "file $_f" || echo "$_f"
  done)
  [ -z "$_extra" ]
}

# prune_dest <dest>: remove skillator skills this repo no longer ships (A96).
prune_dest() {
  _pd=$1
  [ -d "$_pd" ] || return 0
  if [ -f "$_pd/$manifest" ]; then
    # one name per line, read whole and trimmed (CR and edge blanks)
    _mode=manifest; _why="not shipped any more"; _cands=$(tr -d '\r' < "$_pd/$manifest")
  elif [ -f "$_pd/PLATFORMS.md" ]; then
    _mode=legacy; _why="renamed, pre-manifest install"; _cands=$(printf '%s\n' $legacy)
  else
    return 0
  fi
  printf '%s\n' "$_cands" | while read -r _nm; do
    case "$_nm" in ''|.|..|*/*|*\\*|*[*?[]*) continue ;; esac
    if printf '%s\n' "$shipped" | grep -qxF -- "$_nm"; then continue; fi
    _p="$_pd/$_nm"
    if [ -L "$_p" ]; then
      # only a link into this repo's skills/ - never a link the user made elsewhere
      case "$(readlink "$_p")" in "$src"/*) ;; *) continue ;; esac
    elif [ ! -f "$_p/SKILL.md" ]; then
      continue
    elif [ "$_mode" = manifest ]; then
      [ -f "$_p/$owned" ] || continue
      if ! owned_intact "$_p"; then
        echo "        kept $_nm (modified since install) in $_pd"
        continue
      fi
    else
      [ "$(fm_name "$_p/SKILL.md")" = "$_nm" ] || continue
      printf '%s\n' $legacy_hashes | grep -qxF -- "$(skill_hash "$_p/SKILL.md")" || continue
    fi
    if [ -n "$dry" ]; then
      echo "        would remove $_nm ($_why) from $_pd"
    else
      rm -rf "$_p"
      echo "        - removed $_nm ($_why) from $_pd"
    fi
  done
}

# pi_ignore <dest>: A145 - pi (0.74) loads every top-level .md in its skills dir as a
# skill, so the canon docs beside the skills warned "description is required" at each
# start. Its skill loader honours .ignore / .gitignore / .fdignore in that dir (core/
# skills.js addIgnoreRules), so list the three docs there: pi skips them, the files stay
# at ../ for every skill. Missing lines are appended; a user's own lines are kept.
pi_ignore() {
  _ig="$1/.ignore"
  if [ ! -f "$_ig" ]; then
    echo "# written by the skillator installer: pi must not load these docs as skills" > "$_ig"
  elif [ -n "$(tail -c 1 "$_ig")" ]; then
    echo >> "$_ig"
  fi
  for _d in PLATFORMS.md PRACTICE.md WORKFLOW.md; do
    tr -d '\r' < "$_ig" | grep -qxF "/$_d" || echo "/$_d" >> "$_ig"
  done
}

# install_into <cli> <dest>: sync the skills, then always refresh the shared docs.
install_into() {
  _cli=$1; _dest=$2
  _n=0
  # $shipped order (ordinal), not the glob's locale order - same as install.ps1
  for _name in $shipped; do
    _s="$src/$_name/"
    # a skill symlinked to this repo is live - never replace it with a stale copy
    if [ -L "$_dest/$_name" ]; then continue; fi
    if [ -f "$_dest/$_name/SKILL.md" ] && [ -z "$force" ]; then
      # adopt an unmarked copy that is exactly this repo's current skill
      if [ -z "$dry" ] && [ ! -f "$_dest/$_name/$owned" ] &&
         [ "$(skill_hash "$_dest/$_name/SKILL.md")" = "$(skill_hash "$_s/SKILL.md")" ]; then
        write_owned "$_dest/$_name" "${_s%/}"
      fi
      continue
    fi
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
      write_owned "$_dest/$_name" "${_s%/}"
      echo "        + $_name"
    fi
  done
  if [ "$_n" = 0 ]; then
    echo "ok    $_cli (all skills already installed) -> $_dest"
  fi
  # skills reference PLATFORMS.md / PRACTICE.md / WORKFLOW.md, practice/ and references/ beside the
  # installed skills - refresh them every run, even when no skill needed installing,
  # so the plain `git pull && ./install.sh` update path picks up doc changes.
  # F55: ops-board/ is the ops terminal app (hooks/lib, types, ops) - same refresh.
  # F56: and pi/, the same board as a pi extension (write_commands points pi at it).
  # F57: and antigravity/, the same board as an Antigravity IDE extension (put_agy_ext).
  if [ -n "$dry" ]; then
    echo "        would refresh PLATFORMS.md PRACTICE.md WORKFLOW.md practice/ references/ ops-board/ .skillator-source in $_dest"
    if [ "$_cli" = pi ]; then echo "        would list the three docs in $_dest/.ignore (pi skips them as skills)"; fi
  else
    mkdir -p "$_dest"
    cp "$root/PLATFORMS.md" "$root/PRACTICE.md" "$root/WORKFLOW.md" "$_dest/"
    rm -rf "$_dest/practice" && cp -R "$root/practice" "$_dest/"
    rm -rf "$_dest/references" && cp -R "$root/references" "$_dest/"
    rm -rf "$_dest/ops-board" && mkdir -p "$_dest/ops-board/hooks" &&
      cp -R "$root/mods/ops-board/hooks/lib" "$_dest/ops-board/hooks/" &&
      cp -R "$root/mods/ops-board/types" "$root/mods/ops-board/ops" "$root/mods/ops-board/pi" "$root/mods/ops-board/antigravity" "$_dest/ops-board/"
    printf '%s\n' "$shipped" > "$_dest/$manifest"
    # F65: the source pointer - one line, the repo root this ran from (native form), so
    # /skillator-update can find a source on a host with no plugin cache
    native "$root" > "$_dest/.skillator-source"
    if [ "$_cli" = pi ]; then pi_ignore "$_dest"; fi
  fi
  # the targets loop is a subshell - the summary reads the dests from this file
  echo "$_dest" >> "$tmpdests"
}

# subst <template> <skills-dir> <target>: the template with {{SKILLS}} replaced by the
# skills dir as the host sees it (native, forward slashes). No other templating.
subst() {
  _sk=$(native "$2" | sed 's/[#&\\]/\\&/g')
  sed "s#{{SKILLS}}#$_sk#g" "$1" > "$3"
}

# subst_gemini_pending <template> <skills-dir> <target>: Gemini CLI's pending.toml. On
# Windows (cygpath: Git Bash / Cygwin) Gemini CLI runs !{} without Git's sh on PATH, so
# the shell line is install.ps1's powershell form with the Windows path - the same bytes
# install.ps1 writes. Elsewhere the template as is.
subst_gemini_pending() {
  if ! command -v cygpath >/dev/null 2>&1; then subst "$@"; return; fi
  _line='^!{sh "{{SKILLS}}/tickets-zordon/scripts/pending\.sh"}$'
  grep -q "$_line" "$1" || { echo "no pending.sh shell line in $1" >&2; return 1; }
  _sk=$(cygpath -w "$2" | sed 's/[#&\\]/\\&/g')
  sed "s#$_line#!{powershell -NoProfile -ExecutionPolicy Bypass -File \"{{SKILLS}}\\\\tickets-zordon\\\\scripts\\\\pending.ps1\"}#" "$1" |
    sed "s#{{SKILLS}}#$_sk#g" > "$3"
}

# put_cmd <template> <skills-dir> <target>: write one command file (or say it would).
put_cmd() {
  if [ -n "$dry" ]; then echo "        would write $3"; return 0; fi
  mkdir -p "$(dirname -- "$3")"
  case "$1" in
    */gemini/pending.toml) subst_gemini_pending "$1" "$2" "$3" || exit 1 ;;
    *) subst "$1" "$2" "$3" ;;
  esac
  echo "        * $3"
}

# put_pi_ext <skills-dir>: F56 - /ops in pi. pi 0.74 loads every ~/.pi/agent/extensions/*.ts
# (probed 2026-10-22 with PI_CODING_AGENT_DIR on a temp dir: get_commands lists it,
# source "auto"); this one re-exports the board's extension from the dest's
# ops-board/pi/, so the data layer has one copy. Rewritten every run, like the prompts.
put_pi_ext() {
  _ext="$HOME/.pi/agent/extensions/skillator-ops.ts"
  if [ -n "$dry" ]; then echo "        would write $_ext"; return 0; fi
  mkdir -p "$(dirname -- "$_ext")"
  _to=$(native "$1" | sed 's/[\\"]/\\&/g')
  printf '// skillator ops board in pi (/ops) - written by the skillator installer, rewritten every run.\nexport { default } from "%s/ops-board/pi/index.ts";\n' "$_to" > "$_ext"
  echo "        * $_ext"
}

# agy_ide: the Antigravity IDE's CLI (the VS Code fork, not agy) - $SKILLATOR_AGY_IDE when
# set (the selftest's fake), else antigravity-ide on PATH, else the default install
# (Windows per-user, macOS). Nothing when none is there.
agy_ide() {
  if [ -n "${SKILLATOR_AGY_IDE:-}" ]; then [ -x "$SKILLATOR_AGY_IDE" ] && echo "$SKILLATOR_AGY_IDE"; return 0; fi
  if command -v antigravity-ide >/dev/null 2>&1; then command -v antigravity-ide; return 0; fi
  for _i in "${LOCALAPPDATA:-}/Programs/Antigravity IDE/bin/antigravity-ide" \
            "/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide"; do
    case $_i in /*|[A-Za-z]:*) [ -x "$_i" ] && { echo "$_i"; return 0; } ;; esac
  done
  return 0
}

# put_agy_ext <skills-dir>: F57 - the ops board in the Antigravity IDE (command "skillator:
# Ops board"). The IDE (1.107.0, probed 2026-10-22) ignores a folder dropped beside its
# extensions.json, so ops-board/antigravity/pack.mjs writes a VSIX whose extension.cjs
# requires the dest's ops-board/antigravity/extension.cjs, and the IDE's own CLI installs
# it (--install-extension --force) - the data layer keeps one copy. Every run. A failed
# install is a warning, never the installer's exit code.
put_agy_ext() {
  _ide=$(agy_ide)
  if [ -z "$_ide" ]; then echo "        skip  the Antigravity IDE ops board (no antigravity-ide CLI found)"; return 0; fi
  _vsix="$1/ops-board/antigravity/skillator-ops.vsix"
  if [ -n "$dry" ]; then echo "        would install the ops board extension $_vsix with $_ide"; return 0; fi
  if ! command -v node >/dev/null 2>&1; then echo "        skip  the Antigravity IDE ops board (needs node 22.18 or newer to pack it)"; return 0; fi
  if ! _o=$(node "$(native "$1")/ops-board/antigravity/pack.mjs" "$(native "$_vsix")" 2>&1); then
    echo "warn  the Antigravity IDE ops board was not packed: $_o"; return 0
  fi
  if _o=$("$_ide" --install-extension "$(native "$_vsix")" --force 2>&1); then
    echo "        * Antigravity IDE extension skillator.skillator-ops ($_vsix)"
  else
    echo "warn  the Antigravity IDE did not install the ops board: $_o"
  fi
}

# write_commands <cli> <dest>: F54 - /pending, /list-tickets, /engage, /archive-tickets, /sync-tickets, /skillator-update, /team-messages and /pending-subagent as the host's own command
# file, user level, rewritten every run. Called per dest; per-CLI files are written for
# the dest the host reads its skills from. Antigravity's are skills (/<name> in agy),
# written into each antigravity dest with no .skillator-owned marker and kept out of
# .skillator-installed, so prune_dest never touches them. Claude Code: nothing (the
# ops-board mod has its own /pending, /list-tickets; /engage, /archive-tickets, /sync-tickets, /skillator-update, /team-messages and /pending-subagent are the plugin's commands/*.md).
write_commands() {
  _c="$root/host-commands"
  case "$1" in
    codex)
      for _n in pending list-tickets engage archive-tickets sync-tickets skillator-update team-messages pending-subagent verify-subagent marathon-plan marathon-run; do put_cmd "$_c/codex/$_n.md" "$2" "$codex_home/prompts/$_n.md"; done ;;
    cursor)
      for _n in pending list-tickets engage archive-tickets sync-tickets skillator-update team-messages pending-subagent verify-subagent marathon-plan marathon-run; do put_cmd "$_c/cursor/$_n.md" "$2" "$HOME/.cursor/commands/$_n.md"; done ;;
    pi)
      [ "$2" = "$HOME/.pi/agent/skills" ] || return 0
      for _n in pending list-tickets engage archive-tickets sync-tickets skillator-update team-messages pending-subagent verify-subagent marathon-plan marathon-run; do put_cmd "$_c/pi/$_n.md" "$2" "$HOME/.pi/agent/prompts/$_n.md"; done
      put_pi_ext "$2" ;;
    opencode)
      # F67: markdown, frontmatter description, $ARGUMENTS - /<n> in opencode
      for _n in pending list-tickets engage archive-tickets sync-tickets skillator-update team-messages pending-subagent verify-subagent marathon-plan marathon-run; do put_cmd "$_c/opencode/$_n.md" "$2" "$oc_config/commands/$_n.md"; done ;;
    antigravity)
      for _n in pending list-tickets engage archive-tickets sync-tickets skillator-update team-messages pending-subagent verify-subagent marathon-plan marathon-run; do
        put_cmd "$_c/antigravity/$_n/SKILL.md" "$2" "$2/$_n/SKILL.md"
        # an older run may have marked it owned - it is not a manifest skill
        [ -n "$dry" ] || rm -f "$2/$_n/$owned"
      done
      # F57: the Antigravity IDE's extension, from Antigravity's own dest
      if [ "$2" = "$HOME/.gemini/config/skills" ]; then put_agy_ext "$2"; fi
      # Gemini CLI shares the ~/.gemini marker and reads ~/.gemini/skills
      if [ "$2" = "$HOME/.gemini/skills" ]; then
        for _n in pending list-tickets engage archive-tickets sync-tickets skillator-update team-messages pending-subagent verify-subagent marathon-plan marathon-run; do put_cmd "$_c/gemini/$_n.toml" "$2" "$HOME/.gemini/commands/$_n.toml"; done
      fi ;;
  esac
}

# plugin_ops: the ops/ dir of the installed Claude Code plugin (its installPath in
# installed_plugins.json + /mods/ops-board/ops), or nothing when that has no ops.sh.
plugin_ops() {
  _ipj="$HOME/.claude/plugins/installed_plugins.json"
  [ -n "$plugin" ] && [ -f "$_ipj" ] || return 0
  _ip=$(tr -d '\r' < "$_ipj" | grep -A12 '"skillator@' |
        sed -n 's/.*"installPath"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/p' | head -1 | sed 's#\\\\#/#g')
  if [ -n "$_ip" ] && [ -f "$_ip/mods/ops-board/ops/ops.sh" ]; then echo "$_ip/mods/ops-board/ops"; fi
}

# native <path>: the path as the host programs see it - on Git Bash / Cygwin the mixed
# form (C:/Users/...: forward slashes, readable by sh and by native node / powershell),
# elsewhere unchanged.
native() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s\n' "$1"; fi
}

# --selftest: install into a temp HOME / CODEX_HOME holding the four marker dirs, then
# check the command files (F54), the ops-board copy and the shim (F55), pi's /ops extension (F56),
# the Antigravity IDE extension through a fake IDE CLI (F57), opencode (F67). Never touches the real HOME or IDE. Costs one full install per host dest on disk until it exits.
if [ -n "$selftest" ]; then
  T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
  mkdir -p "$T/.codex" "$T/.cursor" "$T/.gemini" "$T/.pi" "$T/.config/opencode"
  # F67: opencode's config dir is $XDG_CONFIG_HOME/opencode when that is set - never let
  # the selftest follow it out of the temp HOME
  unset XDG_CONFIG_HOME
  # F57: a fake Antigravity IDE CLI that logs its arguments - every run below inherits
  # it, so the selftest never installs into the real IDE
  printf '#!/bin/sh\nprintf "%%s\\n" "$*" >> "%s/ide-calls"\n' "$T" > "$T/fake-ide"; chmod 755 "$T/fake-ide"
  export SKILLATOR_AGY_IDE="$T/fake-ide"
  HOME=$T CODEX_HOME=$T/.codex sh "$0" >/dev/null || { echo "FAIL: install exited $?"; exit 1; }
  # B6: every frontmatter in commands/ and host-commands/ must be valid YAML or pi never registers
  # the command. No YAML parser in the installer, so a narrow check: an unquoted plain value
  # holding ": " (the one slip that bit /archive-tickets). Quote such a value.
  _bad=$(find "$root/commands" "$root/host-commands" -type f -name '*.md' | while read -r f; do
    awk -v f="$f" 'NR==1 { if ($0 != "---") exit } NR>1 && /^---[ \t\r]*$/ { exit }
      NR>1 && /^[A-Za-z_-]+:[ \t]+[^"\x27\[{|>&*!#% \t]/ { v=$0; sub(/^[A-Za-z_-]+:[ \t]+/, "", v); if (v ~ /: /) print f ": " $0 }' "$f"
  done)
  # F67: the scan reaches opencode's command files too
  find "$root/host-commands" -type f -name '*.md' | grep -q '/host-commands/opencode/team-messages\.md$' || { echo "FAIL: B6 scan misses host-commands/opencode"; exit 1; }
  # F71: /pending-subagent ships on Claude Code (commands/) and every host, and the scan reaches it
  for f in commands/pending-subagent.md host-commands/codex/pending-subagent.md host-commands/cursor/pending-subagent.md \
           host-commands/pi/pending-subagent.md host-commands/opencode/pending-subagent.md \
           host-commands/antigravity/pending-subagent/SKILL.md host-commands/gemini/pending-subagent.toml; do
    [ -f "$root/$f" ] || { echo "FAIL: missing source $f"; exit 1; }
  done
  find "$root/commands" "$root/host-commands" -type f -name '*.md' | grep -c 'pending-subagent' | grep -qx 6 || { echo "FAIL: B6 scan misses a pending-subagent file"; exit 1; }
  find "$root/commands" -type f -name '*.md' | grep -q '/commands/verify-subagent\.md$' || { echo "FAIL: B6 scan misses commands/verify-subagent.md"; exit 1; }
  # F73: /marathon-plan and /marathon-run - Claude Code runs them with the Workflow tool; every
  # other host's command says it has none and points at /pending-subagent; descriptions quoted (B6)
  for _n in marathon-plan marathon-run; do
    for f in commands/$_n.md host-commands/codex/$_n.md host-commands/cursor/$_n.md host-commands/pi/$_n.md \
             host-commands/opencode/$_n.md host-commands/antigravity/$_n/SKILL.md host-commands/gemini/$_n.toml; do
      [ -f "$root/$f" ] || { echo "FAIL: missing source $f"; exit 1; }
    done
    find "$root/commands" "$root/host-commands" -type f -name '*.md' | grep -c "$_n" | grep -qx 6 || { echo "FAIL: B6 scan misses a $_n file"; exit 1; }
    grep -q '^description: "' "$root/commands/$_n.md" || { echo "FAIL: commands/$_n.md description not quoted"; exit 1; }
    grep -qF 'Workflow' "$root/commands/$_n.md" || { echo "FAIL: commands/$_n.md does not name the Workflow tool"; exit 1; }
    grep -qF 'skillator:relay-morpheus' "$root/commands/$_n.md" || { echo "FAIL: commands/$_n.md does not load relay-morpheus"; exit 1; }
  done
  grep -qF 'workflow-authoring' "$root/commands/marathon-plan.md" || { echo "FAIL: commands/marathon-plan.md does not load workflow-authoring"; exit 1; }
  # A155: with grayskull-power on, every implementer prompt opens with the code-yoda line - the
  # line carried verbatim, in the commands only beside the grayskull.md gate
  _yoda='Load skillator:code-yoda first (restraint, full): the smallest diff that meets the ticket - no speculative abstraction, no new dependency, no refactor outside the ticket, no ceremony; run its review lens on your diff before /code-review and cut what it flags.'
  for f in skills/relay-morpheus/references/chain.md skills/relay-morpheus/references/marathon.md \
           skills/tasks-sentinels/SKILL.md skills/relay-morpheus/templates/marathon-workflow.js; do
    grep -qF -- "$_yoda" "$root/$f" || { echo "FAIL: $f does not carry the code-yoda line (A155)"; exit 1; }
  done
  grep -qF 'skillator:code-yoda first' "$root/skills/grayskull-power/references/arming.md" || { echo "FAIL: arming.md does not say code-yoda carries to implementers (A155)"; exit 1; }
  for _n in pending-subagent marathon-plan marathon-run; do
    for f in commands/$_n.md host-commands/codex/$_n.md host-commands/cursor/$_n.md host-commands/pi/$_n.md \
             host-commands/opencode/$_n.md host-commands/antigravity/$_n/SKILL.md host-commands/gemini/$_n.toml; do
      grep -F -- "$_yoda" "$root/$f" | grep -qF '.skillator/grayskull.md' || { echo "FAIL: $f has no grayskull-gated code-yoda line (A155)"; exit 1; }
    done
  done
  # F88: every /pending-subagent copy maps no argument / sequential / parallel / a count to RELAY_CHAIN_PARALLEL
  for f in commands/pending-subagent.md host-commands/codex/pending-subagent.md host-commands/cursor/pending-subagent.md \
           host-commands/pi/pending-subagent.md host-commands/opencode/pending-subagent.md \
           host-commands/antigravity/pending-subagent/SKILL.md host-commands/gemini/pending-subagent.toml; do
    for _r in '| nothing, `sequential`, `1` | sequential | unset' '| `parallel`, `max`, `parallel max` | parallel | the number of ticket stages' '| `parallel 2`, `2` | parallel, capped | 2 |'; do
      grep -qF -- "$_r" "$root/$f" || { echo "FAIL: $f has no mode row '$_r' (F88)"; exit 1; }
    done
  done
  [ -z "$_bad" ] || { echo "FAIL: frontmatter has an unquoted \": \" (invalid YAML, pi will not register the command): $_bad"; exit 1; }
  # F68: the Muse manifest lists every skill and carries the release version
  sh "$root/practice/scripts/check-muse-manifest.sh" "$root" > /dev/null || { echo "FAIL: .muse-plugin out of step (sh practice/scripts/check-muse-manifest.sh)"; exit 1; }
  for f in .codex/prompts/pending.md .codex/prompts/list-tickets.md .gemini/commands/pending.toml .gemini/commands/list-tickets.toml \
           .cursor/commands/pending.md .cursor/commands/list-tickets.md .pi/agent/prompts/pending.md .pi/agent/prompts/list-tickets.md \
           .gemini/config/skills/pending/SKILL.md .gemini/config/skills/list-tickets/SKILL.md \
           .gemini/skills/pending/SKILL.md .gemini/skills/list-tickets/SKILL.md \
           .codex/prompts/engage.md .gemini/commands/engage.toml .cursor/commands/engage.md .pi/agent/prompts/engage.md \
           .gemini/config/skills/engage/SKILL.md .gemini/skills/engage/SKILL.md \
           .codex/prompts/archive-tickets.md .gemini/commands/archive-tickets.toml .cursor/commands/archive-tickets.md \
           .pi/agent/prompts/archive-tickets.md .gemini/config/skills/archive-tickets/SKILL.md .gemini/skills/archive-tickets/SKILL.md \
           .codex/prompts/sync-tickets.md .gemini/commands/sync-tickets.toml .cursor/commands/sync-tickets.md \
           .pi/agent/prompts/sync-tickets.md .gemini/config/skills/sync-tickets/SKILL.md .gemini/skills/sync-tickets/SKILL.md \
           .gemini/antigravity-cli/skills/tickets-zordon/SKILL.md .gemini/antigravity-cli/skills/pending/SKILL.md \
           .gemini/antigravity-cli/skills/list-tickets/SKILL.md .gemini/antigravity-cli/skills/engage/SKILL.md \
           .gemini/antigravity-cli/skills/archive-tickets/SKILL.md .gemini/antigravity-cli/skills/sync-tickets/SKILL.md \
           .codex/prompts/skillator-update.md .gemini/commands/skillator-update.toml .cursor/commands/skillator-update.md \
           .pi/agent/prompts/skillator-update.md .gemini/config/skills/skillator-update/SKILL.md .gemini/skills/skillator-update/SKILL.md \
           .gemini/antigravity-cli/skills/skillator-update/SKILL.md \
           .codex/prompts/team-messages.md .gemini/commands/team-messages.toml .cursor/commands/team-messages.md \
           .pi/agent/prompts/team-messages.md .gemini/config/skills/team-messages/SKILL.md .gemini/skills/team-messages/SKILL.md \
           .gemini/antigravity-cli/skills/team-messages/SKILL.md .codex/skills/teams-uhura/scripts/team.mjs \
           .codex/prompts/pending-subagent.md .gemini/commands/pending-subagent.toml .cursor/commands/pending-subagent.md \
           .pi/agent/prompts/pending-subagent.md .gemini/config/skills/pending-subagent/SKILL.md .gemini/skills/pending-subagent/SKILL.md \
           .gemini/antigravity-cli/skills/pending-subagent/SKILL.md .config/opencode/commands/pending-subagent.md \
           .codex/prompts/verify-subagent.md .gemini/commands/verify-subagent.toml .cursor/commands/verify-subagent.md .pi/agent/prompts/verify-subagent.md \
           .gemini/config/skills/verify-subagent/SKILL.md .gemini/skills/verify-subagent/SKILL.md .gemini/antigravity-cli/skills/verify-subagent/SKILL.md \
           .codex/prompts/marathon-plan.md .gemini/commands/marathon-plan.toml .cursor/commands/marathon-plan.md .pi/agent/prompts/marathon-plan.md \
           .gemini/config/skills/marathon-plan/SKILL.md .gemini/skills/marathon-plan/SKILL.md .gemini/antigravity-cli/skills/marathon-plan/SKILL.md \
           .codex/prompts/marathon-run.md .gemini/commands/marathon-run.toml .cursor/commands/marathon-run.md .pi/agent/prompts/marathon-run.md \
           .gemini/config/skills/marathon-run/SKILL.md .gemini/skills/marathon-run/SKILL.md .gemini/antigravity-cli/skills/marathon-run/SKILL.md \
           .codex/skills/ops-board/ops/app.ts .pi/agent/skills/ops-board/hooks/lib/board.ts \
           .pi/agent/skills/ops-board/ops/package.json .pi/agent/skills/ops-board/hooks/lib/package.json \
           .pi/agent/skills/ops-board/pi/index.ts .pi/agent/skills/ops-board/pi/ops.ts .pi/agent/skills/ops-board/ops/engine.ts \
           .pi/agent/extensions/skillator-ops.ts .config/opencode/skills/tickets-zordon/SKILL.md \
           .config/opencode/skills/teams-uhura/scripts/team.mjs .config/opencode/skills/ops-board/ops/ops.sh; do
    [ -f "$T/$f" ] || { echo "FAIL: missing $f"; exit 1; }
  done
  N=$(native "$T")
  # F67: opencode - the skills in its global skills dir, the seven commands in its commands/
  # dir, each substituted with that dest, no placeholder left, arguments by $ARGUMENTS
  _oc=.config/opencode
  for _n in pending list-tickets engage archive-tickets sync-tickets skillator-update team-messages pending-subagent verify-subagent marathon-plan marathon-run; do
    _f=$T/$_oc/commands/$_n.md
    [ -f "$_f" ] || { echo "FAIL: missing $_oc/commands/$_n.md"; exit 1; }
    head -1 "$_f" | grep -qx -- '---' || { echo "FAIL: opencode $_n has no frontmatter"; exit 1; }
    grep -q '^description: ' "$_f" || { echo "FAIL: opencode $_n description"; exit 1; }
    grep -qF '{{SKILLS}}' "$_f" && { echo "FAIL: placeholder left in $_oc/commands/$_n.md"; exit 1; }
    case $_n in engage) ;; *) grep -qF "$N/$_oc/skills/" "$_f" || { echo "FAIL: opencode $_n not substituted with its own dest"; exit 1; } ;; esac
    case $_n in pending) ;; *) grep -qF '$ARGUMENTS' "$_f" || { echo "FAIL: opencode $_n args"; exit 1; } ;; esac
  done
  grep -qF "sh $N/$_oc/skills/tickets-zordon/scripts/pending.sh" "$T/$_oc/commands/pending.md" || { echo "FAIL: opencode pending not substituted"; exit 1; }
  grep -qF "$N/$_oc/skills/.skillator-source" "$T/$_oc/commands/skillator-update.md" || { echo "FAIL: opencode skillator-update not substituted"; exit 1; }
  grep -qF "$N/$_oc/skills/teams-uhura/scripts/team.mjs inbox --unread --mark-read" "$T/$_oc/commands/team-messages.md" || { echo "FAIL: opencode team-messages not substituted"; exit 1; }
  grep -qF "$N/$_oc/skills/teams-uhura/scripts/team.mjs say --file <that path>" "$T/$_oc/commands/team-messages.md" || { echo "FAIL: opencode team-messages reply not by say --file"; exit 1; }
  grep -qF -e "<<'EOF'" -e "@'" -e 'say "' "$T/$_oc/commands/team-messages.md" && { echo "FAIL: opencode team-messages puts reply text in shell source"; exit 1; }
  [ "$(cat "$T/$_oc/skills/.skillator-source" 2>/dev/null)" = "$(native "$root")" ] || { echo "FAIL: source pointer in $_oc/skills"; exit 1; }
  [ -f "$T/$_oc/skills/tickets-zordon/.skillator-owned" ] || { echo "FAIL: opencode skill has no ownership marker"; exit 1; }
  grep -qxE 'pending|list-tickets|engage|archive-tickets|sync-tickets|skillator-update|team-messages|pending-subagent|verify-subagent|marathon-plan|marathon-run' "$T/$_oc/skills/.skillator-installed" && { echo "FAIL: command in opencode manifest"; exit 1; }
  # /skillator-update names opencode among the hosts it refreshes, on every host
  for f in .codex/prompts/skillator-update.md .cursor/commands/skillator-update.md .pi/agent/prompts/skillator-update.md \
           .gemini/commands/skillator-update.toml .gemini/skills/skillator-update/SKILL.md $_oc/commands/skillator-update.md; do
    grep -q 'opencode' "$T/$f" || { echo "FAIL: skillator-update does not name opencode in $f"; exit 1; }
  done
  grep -qF "sh $N/.codex/skills/tickets-zordon/scripts/pending.sh" "$T/.codex/prompts/pending.md" || { echo "FAIL: codex prompt not substituted"; exit 1; }
  grep -qF "$N/.gemini/config/skills/tickets-zordon/SKILL.md" "$T/.gemini/config/skills/pending/SKILL.md" || { echo "FAIL: agy skill not substituted with its own dest"; exit 1; }
  grep -qF "$N/.gemini/skills/tickets-zordon/SKILL.md" "$T/.gemini/skills/list-tickets/SKILL.md" || { echo "FAIL: agy skill not substituted with its own dest"; exit 1; }
  # B8: agy 1.4.5 reads ~/.gemini/antigravity-cli/skills - its commands point at that dest
  grep -qF "$N/.gemini/antigravity-cli/skills/tickets-zordon/SKILL.md" "$T/.gemini/antigravity-cli/skills/pending/SKILL.md" || { echo "FAIL: agy-cli skill not substituted with its own dest"; exit 1; }
  # the path is quoted (a HOME with a space); under Git Bash (cygpath) it is install.ps1's
  # powershell form with the Windows path - Gemini CLI on Windows runs !{} without sh
  if command -v cygpath >/dev/null 2>&1; then
    grep -q '^!{sh ' "$T/.gemini/commands/pending.toml" && { echo "FAIL: gemini pending kept the sh line on Windows"; exit 1; }
    _want='!{powershell -NoProfile -ExecutionPolicy Bypass -File "'"$(cygpath -w "$T")"'\.gemini\skills\tickets-zordon\scripts\pending.ps1"}'
  else
    grep -q '^!{sh ' "$T/.gemini/commands/pending.toml" || { echo "FAIL: gemini shell injection"; exit 1; }
    _want='!{sh "'"$N"'/.gemini/skills/tickets-zordon/scripts/pending.sh"}'
  fi
  grep -qxF -- "$_want" "$T/.gemini/commands/pending.toml" || { echo "FAIL: gemini pending path"; exit 1; }
  # F65: /skillator-update reads each dest's source pointer (.skillator-source, one line:
  # the repo root this installer ran from, native form) - the command finds its source by it
  _src=$(native "$root")
  for d in .codex/skills .cursor/skills .pi/agent/skills .gemini/config/skills .gemini/skills .gemini/antigravity-cli/skills; do
    [ "$(cat "$T/$d/.skillator-source" 2>/dev/null)" = "$_src" ] || { echo "FAIL: source pointer in $d"; exit 1; }
  done
  for f in .codex/prompts/skillator-update.md:.codex/skills .cursor/commands/skillator-update.md:.cursor/skills \
           .pi/agent/prompts/skillator-update.md:.pi/agent/skills .gemini/commands/skillator-update.toml:.gemini/skills \
           .gemini/config/skills/skillator-update/SKILL.md:.gemini/config/skills .gemini/skills/skillator-update/SKILL.md:.gemini/skills \
           .gemini/antigravity-cli/skills/skillator-update/SKILL.md:.gemini/antigravity-cli/skills; do
    grep -qF "$N/${f#*:}/.skillator-source" "$T/${f%%:*}" || { echo "FAIL: skillator-update not substituted in ${f%%:*}"; exit 1; }
    grep -qF '{{SKILLS}}' "$T/${f%%:*}" && { echo "FAIL: placeholder left in ${f%%:*}"; exit 1; }
  done
  grep -q '^name: skillator-update$' "$T/.gemini/antigravity-cli/skills/skillator-update/SKILL.md" || { echo "FAIL: agy skill name skillator-update"; exit 1; }
  # F66: /team-messages points at the installed teams-uhura script, substituted per dest
  for f in .codex/prompts/team-messages.md:.codex/skills .cursor/commands/team-messages.md:.cursor/skills \
           .pi/agent/prompts/team-messages.md:.pi/agent/skills .gemini/commands/team-messages.toml:.gemini/skills \
           .gemini/config/skills/team-messages/SKILL.md:.gemini/config/skills .gemini/skills/team-messages/SKILL.md:.gemini/skills \
           .gemini/antigravity-cli/skills/team-messages/SKILL.md:.gemini/antigravity-cli/skills; do
    grep -qF "$N/${f#*:}/teams-uhura/scripts/team.mjs inbox --unread --mark-read" "$T/${f%%:*}" || { echo "FAIL: team-messages not substituted in ${f%%:*}"; exit 1; }
    # the reply goes in a file the agent writes with its own tool - never into shell source
    grep -qF "$N/${f#*:}/teams-uhura/scripts/team.mjs say --file <that path>" "$T/${f%%:*}" || { echo "FAIL: team-messages reply not by say --file in ${f%%:*}"; exit 1; }
    grep -qF -e "<<'EOF'" -e "@'" -e 'say "' "$T/${f%%:*}" && { echo "FAIL: team-messages puts reply text in shell source in ${f%%:*}"; exit 1; }
    grep -qF '{{SKILLS}}' "$T/${f%%:*}" && { echo "FAIL: placeholder left in ${f%%:*}"; exit 1; }
  done
  grep -q '^name: team-messages$' "$T/.gemini/antigravity-cli/skills/team-messages/SKILL.md" || { echo "FAIL: agy skill name team-messages"; exit 1; }
  # F71: /pending-subagent loads relay-morpheus from the host's own dest and takes the agent count
  for f in .codex/prompts/pending-subagent.md:.codex/skills .cursor/commands/pending-subagent.md:.cursor/skills \
           .pi/agent/prompts/pending-subagent.md:.pi/agent/skills .gemini/commands/pending-subagent.toml:.gemini/skills \
           .gemini/config/skills/pending-subagent/SKILL.md:.gemini/config/skills .gemini/skills/pending-subagent/SKILL.md:.gemini/skills \
           .gemini/antigravity-cli/skills/pending-subagent/SKILL.md:.gemini/antigravity-cli/skills \
           .config/opencode/commands/pending-subagent.md:.config/opencode/skills; do
    grep -qF "$N/${f#*:}/relay-morpheus/SKILL.md" "$T/${f%%:*}" || { echo "FAIL: pending-subagent not substituted in ${f%%:*}"; exit 1; }
    { grep -qF 'chain merge' "$T/${f%%:*}" && grep -qF 'max' "$T/${f%%:*}"; } || { echo "FAIL: pending-subagent has no agent count in ${f%%:*}"; exit 1; }
    grep -F -- "$_yoda" "$T/${f%%:*}" | grep -qF '.skillator/grayskull.md' || { echo "FAIL: pending-subagent has no grayskull-gated code-yoda line in ${f%%:*}"; exit 1; }
    grep -qF '{{SKILLS}}' "$T/${f%%:*}" && { echo "FAIL: placeholder left in ${f%%:*}"; exit 1; }
  done
  grep -q '^name: pending-subagent$' "$T/.gemini/antigravity-cli/skills/pending-subagent/SKILL.md" || { echo "FAIL: agy skill name pending-subagent"; exit 1; }
  grep -q '^argument-hint: .*max' "$root/commands/pending-subagent.md" || { echo "FAIL: commands/pending-subagent.md argument-hint has no count"; exit 1; }
  # F73: no Workflow tool off Claude Code - /marathon-plan and /marathon-run say so, load
  # relay-morpheus from the host's own dest and point at /pending-subagent
  for _n in marathon-plan marathon-run; do
    for f in .codex/prompts/$_n.md:.codex/skills .cursor/commands/$_n.md:.cursor/skills \
             .pi/agent/prompts/$_n.md:.pi/agent/skills .gemini/commands/$_n.toml:.gemini/skills \
             .gemini/config/skills/$_n/SKILL.md:.gemini/config/skills .gemini/skills/$_n/SKILL.md:.gemini/skills \
             .gemini/antigravity-cli/skills/$_n/SKILL.md:.gemini/antigravity-cli/skills \
             .config/opencode/commands/$_n.md:.config/opencode/skills; do
      grep -qF "$N/${f#*:}/relay-morpheus/SKILL.md" "$T/${f%%:*}" || { echo "FAIL: $_n not substituted in ${f%%:*}"; exit 1; }
      { grep -qF 'no Workflow tool' "$T/${f%%:*}" && grep -qF '/pending-subagent' "$T/${f%%:*}"; } || { echo "FAIL: $_n does not point at /pending-subagent in ${f%%:*}"; exit 1; }
      grep -F -- "$_yoda" "$T/${f%%:*}" | grep -qF '.skillator/grayskull.md' || { echo "FAIL: $_n has no grayskull-gated code-yoda line in ${f%%:*}"; exit 1; }
    done
    grep -q "^name: $_n\$" "$T/.gemini/antigravity-cli/skills/$_n/SKILL.md" || { echo "FAIL: agy skill name $_n"; exit 1; }
  done
  grep -qF '{{args}}' "$T/.gemini/commands/list-tickets.toml" || { echo "FAIL: gemini args"; exit 1; }
  grep -qF '$ARGUMENTS' "$T/.pi/agent/prompts/list-tickets.md" || { echo "FAIL: pi args"; exit 1; }
  grep -q '^argument-hint: ' "$T/.pi/agent/prompts/list-tickets.md" || { echo "FAIL: pi argument-hint"; exit 1; }
  grep -q '^description: ' "$T/.cursor/commands/pending.md" || { echo "FAIL: cursor description"; exit 1; }
  # F56: pi's extension re-exports the board from the pi dest's ops-board/pi (native path)
  grep -qxF "export { default } from \"$N/.pi/agent/skills/ops-board/pi/index.ts\";" "$T/.pi/agent/extensions/skillator-ops.ts" || { echo "FAIL: pi extension target"; exit 1; }
  [ "$(ls "$T/.pi/agent/extensions")" = skillator-ops.ts ] || { echo "FAIL: pi extensions dir holds more than skillator-ops.ts"; exit 1; }
  # A145: pi's skills dirs list the three docs in .ignore (pi skips them as skills); the
  # docs are still there at ../ from every skill, and no other host gets a .ignore
  for d in .pi/agent/skills .pi/skills; do
    for f in PLATFORMS.md PRACTICE.md WORKFLOW.md; do
      [ -f "$T/$d/$f" ] || { echo "FAIL: missing $d/$f"; exit 1; }
      grep -qxF "/$f" "$T/$d/.ignore" || { echo "FAIL: $d/.ignore does not list /$f"; exit 1; }
    done
  done
  [ -e "$T/.codex/skills/.ignore" ] && { echo "FAIL: a non-pi dest got a .ignore"; exit 1; }
  # F57: the Antigravity IDE got one install of the VSIX packed in Antigravity's own dest,
  # and the VSIX's entry requires that dest's ops-board/antigravity/extension.cjs
  _agy=$T/.gemini/config/skills/ops-board/antigravity
  for f in ops.ts extension.cjs pack.mjs package.json; do [ -f "$_agy/$f" ] || { echo "FAIL: missing antigravity/$f"; exit 1; }; done
  [ "$(cat "$T/ide-calls")" = "--install-extension $N/.gemini/config/skills/ops-board/antigravity/skillator-ops.vsix --force" ] || { echo "FAIL: antigravity ide install call: $(cat "$T/ide-calls")"; exit 1; }
  [ "$(head -c 2 "$_agy/skillator-ops.vsix")" = PK ] || { echo "FAIL: antigravity vsix is not a zip"; exit 1; }
  grep -aqF "require(\"$N/.gemini/config/skills/ops-board/antigravity/extension.cjs\")" "$_agy/skillator-ops.vsix" || { echo "FAIL: antigravity vsix entry target"; exit 1; }
  # B8: the VSIX is packed and installed from ~/.gemini/config/skills only
  for d in .gemini/skills .gemini/antigravity-cli/skills; do
    [ -e "$T/$d/ops-board/antigravity/skillator-ops.vsix" ] && { echo "FAIL: antigravity vsix packed in $d"; exit 1; }
  done
  head -1 "$T/.codex/prompts/pending.md" | grep -q '^---' && { echo "FAIL: codex prompt has frontmatter"; exit 1; }
  grep -q '^name: pending$' "$T/.gemini/config/skills/pending/SKILL.md" || { echo "FAIL: agy skill name"; exit 1; }
  grep -q '^name: list-tickets$' "$T/.gemini/skills/list-tickets/SKILL.md" || { echo "FAIL: agy skill name"; exit 1; }
  for f in .codex/prompts .gemini/commands .cursor/commands .pi/agent/prompts \
           .gemini/config/skills/pending .gemini/config/skills/list-tickets .gemini/skills/pending .gemini/skills/list-tickets \
           .gemini/antigravity-cli/skills/pending .gemini/antigravity-cli/skills/engage; do
    grep -rqF '{{SKILLS}}' "$T/$f" && { echo "FAIL: placeholder left in $f"; exit 1; }
  done
  for d in .gemini/config/skills .gemini/skills .gemini/antigravity-cli/skills; do
    grep -qxE 'pending|list-tickets|engage|archive-tickets|sync-tickets|skillator-update|team-messages|pending-subagent|verify-subagent|marathon-plan|marathon-run' "$T/$d/.skillator-installed" && { echo "FAIL: command skill in manifest $d"; exit 1; }
    [ -e "$T/$d/pending/.skillator-owned" ] && { echo "FAIL: command skill carries an ownership marker in $d"; exit 1; }
  done
  [ -x "$T/.local/bin/ops" ] || { echo "FAIL: missing .local/bin/ops"; exit 1; }
  grep -q "exec sh \"$T/.cursor/skills/ops-board/ops/ops.sh\"" "$T/.local/bin/ops" || { echo "FAIL: shim target (first dest: cursor, since claude-code has no plugin here)"; exit 1; }
  # second run: command files are rewritten, installed skills are not, the
  # skill-commands survive the prune and lose a stale marker an older run left
  echo stale >> "$T/.codex/prompts/pending.md"
  echo stale >> "$T/.pi/agent/extensions/skillator-ops.ts"
  echo stale >> "$T/.gemini/skills/pending/SKILL.md"
  : > "$T/.gemini/skills/list-tickets/.skillator-owned"
  : > "$T/.pi/agent/skills/tickets-zordon/.selftest-sentinel"
  printf 'my-own-line' >> "$T/.pi/agent/skills/.ignore"
  out=$(HOME=$T CODEX_HOME=$T/.codex sh "$0") || { echo "FAIL: second install exited $?"; exit 1; }
  grep -qx 'my-own-line' "$T/.pi/agent/skills/.ignore" || { echo "FAIL: pi .ignore lost a user line"; exit 1; }
  [ "$(grep -cxF /PLATFORMS.md "$T/.pi/agent/skills/.ignore")" = 1 ] || { echo "FAIL: pi .ignore lines duplicated on the second run"; exit 1; }
  printf '%s\n' "$out" | grep -q "not on your PATH" || { echo "FAIL: PATH note"; exit 1; }
  grep -q stale "$T/.codex/prompts/pending.md" && { echo "FAIL: codex prompt not rewritten"; exit 1; }
  grep -q stale "$T/.pi/agent/extensions/skillator-ops.ts" && { echo "FAIL: pi extension not rewritten"; exit 1; }
  [ "$(wc -l < "$T/ide-calls" | tr -d ' ')" = 2 ] || { echo "FAIL: antigravity extension not reinstalled on the second run"; exit 1; }
  [ -f "$T/.gemini/skills/pending/SKILL.md" ] || { echo "FAIL: agy skill-command pruned"; exit 1; }
  grep -q stale "$T/.gemini/skills/pending/SKILL.md" && { echo "FAIL: agy skill-command not rewritten"; exit 1; }
  [ -e "$T/.gemini/skills/list-tickets/.skillator-owned" ] && { echo "FAIL: stale marker kept on a skill-command"; exit 1; }
  [ -f "$T/.pi/agent/skills/tickets-zordon/.selftest-sentinel" ] || { echo "FAIL: installed skill was rewritten"; exit 1; }
  out=$(HOME=$T CODEX_HOME=$T/.codex sh "$0" --dry-run) || { echo "FAIL: dry run exited $?"; exit 1; }
  printf '%s\n' "$out" | grep -q "would write $T/.local/bin/ops" || { echo "FAIL: dry-run shim line"; exit 1; }
  printf '%s\n' "$out" | grep -qF "would write $T/.pi/agent/prompts/list-tickets.md" || { echo "FAIL: dry-run command line"; exit 1; }
  printf '%s\n' "$out" | grep -qF "would write $T/.pi/agent/extensions/skillator-ops.ts" || { echo "FAIL: dry-run pi extension line"; exit 1; }
  printf '%s\n' "$out" | grep -qF "would install the ops board extension $T/.gemini/config/skills/ops-board/antigravity/skillator-ops.vsix with $T/fake-ide" || { echo "FAIL: dry-run antigravity extension line"; exit 1; }
  [ "$(wc -l < "$T/ide-calls" | tr -d ' ')" = 2 ] || { echo "FAIL: dry run called the Antigravity IDE"; exit 1; }
  out=$(HOME=$T CODEX_HOME=$T/.codex SKILLATOR_AGY_IDE=$T/none sh "$0" --dry-run) || { echo "FAIL: no-IDE dry run exited $?"; exit 1; }
  printf '%s\n' "$out" | grep -qF "skip  the Antigravity IDE ops board (no antigravity-ide CLI found)" || { echo "FAIL: no-IDE skip line"; exit 1; }
  printf '%s\n' "$out" | grep -qF "would write $T/.gemini/config/skills/pending/SKILL.md" || { echo "FAIL: dry-run skill-command line"; exit 1; }
  printf '%s\n' "$out" | grep -qF "would write $T/.gemini/antigravity-cli/skills/pending/SKILL.md" || { echo "FAIL: dry-run agy-cli skill-command line"; exit 1; }
  printf '%s\n' "$out" | grep -qF "would write $T/.config/opencode/commands/team-messages.md" || { echo "FAIL: dry-run opencode command line"; exit 1; }
  printf '%s\n' "$out" | grep -qF "ops   sh $T/.config/opencode/skills/ops-board/ops/ops.sh <repo>" || { echo "FAIL: opencode ops launch line"; exit 1; }
  # F67: XDG_CONFIG_HOME moves opencode's dir, as it does for opencode itself
  mkdir -p "$T/xdg/opencode"
  out=$(HOME=$T CODEX_HOME=$T/.codex XDG_CONFIG_HOME=$T/xdg sh "$0" --dry-run) || { echo "FAIL: XDG dry run exited $?"; exit 1; }
  printf '%s\n' "$out" | grep -qF "would write $T/xdg/opencode/commands/pending.md" || { echo "FAIL: opencode under XDG_CONFIG_HOME"; exit 1; }
  # the plugin installed: the shim still runs the first dest written (refreshed every
  # run), never the versioned plugin cache a plugin update can remove
  P=$T/p
  mkdir -p "$P/.cursor" "$P/.claude/plugins/cache/skillator" "$P/pc/mods/ops-board/ops"
  : > "$P/pc/mods/ops-board/ops/ops.sh"
  printf '{\n  "plugins": {\n    "skillator@skillator": [\n      {\n        "installPath": "%s"\n      }\n    ]\n  }\n}\n' "$P/pc" > "$P/.claude/plugins/installed_plugins.json"
  HOME=$P CODEX_HOME=$P/.codex sh "$0" >/dev/null || { echo "FAIL: plugin install exited $?"; exit 1; }
  grep -q "exec sh \"$P/.cursor/skills/ops-board/ops/ops.sh\"" "$P/.local/bin/ops" || { echo "FAIL: shim target with the plugin installed (first dest written, not the plugin cache)"; exit 1; }
  echo ok; exit 0
fi

tmpdests=$(mktemp)
trap 'rm -f "$tmpdests"' EXIT

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
    prune_dest "$dest"
    install_into "$cli" "$dest"
    write_commands "$cli" "$dest"
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
for _name in $shipped; do
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

# F55: the ops board - one launch line per dest, and the `ops` shim on PATH. The shim
# runs the first dest this run wrote (its ops-board/ is refreshed every run); the
# Claude Code plugin's copy only when no dest was written - its versioned cache dir
# goes away on a plugin update. Rewritten every run (the dest can change). PATH is
# reported, never edited.
shim_src=""
if [ -s "$tmpdests" ]; then shim_src="$(sed -n 1p "$tmpdests")/ops-board/ops"; fi
if [ -z "$shim_src" ]; then shim_src=$(plugin_ops); fi
if [ -n "$shim_src" ]; then echo; fi
while IFS= read -r d; do
  # PowerShell can't open an MSYS /c/... path: give it the Windows form under Git Bash
  if command -v cygpath >/dev/null 2>&1; then _ps1="\"$(cygpath -w "$d")\\ops-board\\ops\\ops.ps1\""; else _ps1="$d/ops-board/ops/ops.ps1"; fi
  echo "ops   sh $d/ops-board/ops/ops.sh <repo>   (Windows: powershell -NoProfile -ExecutionPolicy Bypass -File $_ps1 -Repo <repo>)"
done < "$tmpdests"
if [ -n "$shim_src" ]; then
  if [ -n "$dry" ]; then
    echo "        would write $HOME/.local/bin/ops -> $shim_src/ops.sh"
  else
    mkdir -p "$HOME/.local/bin"
    printf '#!/usr/bin/env sh\nexec sh "%s/ops.sh" "$@"\n' "$shim_src" > "$HOME/.local/bin/ops"
    chmod 755 "$HOME/.local/bin/ops"
    echo "ops   $HOME/.local/bin/ops -> $shim_src/ops.sh"
    [ -s "$tmpdests" ] || echo "      the plugin's copy (no skills dir written) - run this again after a plugin update"
    echo "      remove: rm $HOME/.local/bin/ops"
    case ":$PATH:" in
      *":$HOME/.local/bin:"*) ;;
      *) echo "      $HOME/.local/bin is not on your PATH - add it, or run the launch line above" ;;
    esac
  fi
fi
