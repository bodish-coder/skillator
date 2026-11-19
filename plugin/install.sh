#!/usr/bin/env sh
# Install skillator skills into the global skills dir of every agent CLI found.
# Skips any skill a CLI already has (including Claude Code's plugin install).
#   ./install.sh            install what's missing
#   ./install.sh --dry-run  show what it would do
#   ./install.sh --force    refresh skills that are already installed
#   ./install.sh --link     install as symlinks into this repo (stay live on git pull)
#   ./install.sh --selftest install into a temp HOME and check what was written; prints ok
# F54: /skillator-pending, /list-ticket-zordon, /engage-picard, /archive-zordon, /sync-zordon, /skillator-update, /team-messages and /pending-sentinel are written as each host's own command file (codex
# skills (F90), Gemini CLI commands, cursor commands, pi prompt templates, opencode commands,
# Antigravity skill-commands) from host-commands/<host>/, rewritten every run - see write_commands.
# A96: a skill dir this script copies gets an ownership marker (.skillator-owned),
# and each skills dir a manifest (.skillator-installed) of the skillator skills in it.
# The v2 marker records byte hashes for every installed file. The next
# run removes a folder the manifest lists that the repo no longer ships - the fix for
# renamed skills whose stale copies outrank the new ones - but only if it is still
# exactly what was installed (or is a link into this repo); an edited one is kept. A dir with no manifest yet
# (installed before A96) is retained: a SKILL.md hash cannot prove helper contents.
# Claude Code is left to its plugin install whenever one exists, --force included.
# Skills already symlinked to this repo are left alone - they are always current.
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
src="$root/skills"
dry=""; force=""; link=""; selftest=""; font=""; _want_font=""
usage='usage: install.sh [--dry-run] [--force] [--link] [--selftest] [--ops-font-size <6-72>]'
for a in "$@"; do
  if [ -n "$_want_font" ]; then font=$a; _want_font=""; continue; fi
  case "$a" in
    --dry-run) dry=1 ;;
    --force)   force=1 ;;
    --link)    link=1 ;;
    --selftest) selftest=1 ;;
    --ops-font-size) _want_font=1 ;;
    *) printf 'unknown option: %s\n%s\n' "$a" "$usage" >&2; exit 2 ;;
  esac
done
# F102: the ops tab's Windows Terminal font size, 6..72
font_number() {
  _number=$(printf '%s' "$1" | sed 's/^0*//')
  case $_number in [6-9]|[1-6][0-9]|7[0-2]) printf '%s' "$_number" ;; *) return 1 ;; esac
}
write_font_fragment() {
  _fragment=$1 _requested=$2
  if [ -z "$_requested" ] && [ -f "$_fragment" ]; then
    _requested=$(sed -n 's/.*"size": \([0-9]*\).*/\1/p' "$_fragment")
  fi
  _size=$(font_number "$_requested") || _size=11
  sed "s/\"size\": [0-9]*/\"size\": $_size/" "$root/mods/ops-board/ops/wt-fragment.json" > "$_fragment"
}
[ -n "$_want_font" ] && font=none
case "$font" in
  '') ;;
  *) if _number=$(font_number "$font"); then font=$_number; else font_bad=1; fi ;;
esac
[ -n "${font_bad:-}" ] && { printf 'ops font size must be 6..72, got %s\n%s\n' "$font" "$usage" >&2; exit 2; }

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

# Canonical byte hashes; reject links and names the line-based marker cannot represent.
ownership_manifest() (
  [ ! -L "$1" ] && [ -d "$1" ] || exit 1
  cd "$1" || exit 1
  _bad=$(find . -exec sh -c '
    cr=$(printf "\r")
    for f do
      case "$f" in *"
"*|*"$cr"*|*\\*|*:*) echo invalid ;; esac
      if [ -L "$f" ] || { [ ! -f "$f" ] && [ ! -d "$f" ]; }; then echo invalid; fi
    done
  ' sh {} +) || exit 1
  [ -z "$_bad" ] || exit 1
  _files=$(find . -type f ! -path "./$owned" | LC_ALL=C sort) || exit 1
  printf 'skillator-owned 2\n'
  [ -n "$_files" ] || exit 0
  # Filenames cannot contain CR, LF or backslashes. Hash them in sorted order
  # with one child process instead of one process per file.
  IFS='
'
  set -f
  set -- $_files
  if command -v sha256sum >/dev/null 2>&1; then
    _hashes=$(sha256sum -b -- "$@") || exit 1
  else
    _hashes=$(shasum -a 256 -b -- "$@") || exit 1
  fi
  printf '%s\n' "$_hashes" | sed 's/^\([0-9a-f]*\) [ *]\.\//file \1 /'
)

write_owned() {
  if _marker=$(ownership_manifest "$2"); then
    printf '%s\n' "$_marker" > "$1/$owned"
  else
    echo "        left $1 unowned (unverifiable contents)"
  fi
}

# Comparing to a regenerated manifest rejects missing/extra files and malformed,
# duplicate or unsafe records without ever opening a path supplied by the marker.
owned_intact() {
  [ -f "$1/$owned" ] && [ ! -L "$1/$owned" ] || return 1
  _actual=$(ownership_manifest "$1" && printf '.') || return 1
  # Shell variables cannot preserve NUL bytes; reject them before capture.
  tr -d '\000' < "$1/$owned" | cmp -s "$1/$owned" - || return 1
  _recorded=$(sed 's/\r$//' "$1/$owned" && printf '.') || return 1
  [ "$_actual" = "$_recorded" ]
}

same_contents() {
  _left=$(ownership_manifest "$1") || return 1
  _right=$(ownership_manifest "$2") || return 1
  [ "$_left" = "$_right" ]
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
    case "
$shipped
" in *"
$_nm
"*) continue ;; esac
    _p="$_pd/$_nm"
    if [ -L "$_p" ]; then
      # only a link into this repo's skills/ - never a link the user made elsewhere
      case "$(readlink "$_p")" in "$src"/*) ;; *) continue ;; esac
    elif [ ! -f "$_p/SKILL.md" ]; then
      continue
    elif [ "$_mode" = manifest ]; then
      if ! owned_intact "$_p"; then
        echo "        kept $_nm (modified or unverifiable since install) in $_pd"
        continue
      fi
    else
      echo "        kept $_nm (modified or unverifiable legacy install) in $_pd"
      continue
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
    # a skill symlinked to this repo is live - never replace it with a stale copy;
    # a dangling one (F91: a pre-subfolder link into <clone>/skills) is reinstalled
    if [ -L "$_dest/$_name" ] && [ -e "$_dest/$_name" ]; then continue; fi
    if [ -f "$_dest/$_name/SKILL.md" ] && [ -z "$force" ]; then
      # adopt an unmarked copy that is exactly this repo's current skill
      if [ -z "$dry" ] && [ ! -f "$_dest/$_name/$owned" ] &&
         same_contents "$_dest/$_name" "${_s%/}"; then
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
  # A222: and commands/, the plugin's own command docs (*.md, *.txt), which the Help tab reads beside ops/.
  if [ -n "$dry" ]; then
    echo "        would refresh PLATFORMS.md PRACTICE.md WORKFLOW.md practice/ references/ ops-board/ .skillator-source in $_dest"
    if [ "$_cli" = pi ]; then echo "        would list the three docs in $_dest/.ignore (pi skips them as skills)"; fi
  else
    mkdir -p "$_dest"
    cp "$root/PLATFORMS.md" "$root/PRACTICE.md" "$root/WORKFLOW.md" "$_dest/"
    rm -rf "$_dest/practice" && cp -R "$root/practice" "$_dest/"
    rm -rf "$_dest/references" && cp -R "$root/references" "$_dest/"
    rm -rf "$_dest/ops-board" && mkdir -p "$_dest/ops-board/hooks" "$_dest/ops-board/commands" &&
      cp -R "$root/mods/ops-board/hooks/lib" "$_dest/ops-board/hooks/" &&
      cp -R "$root/mods/ops-board/types" "$root/mods/ops-board/ops" "$root/mods/ops-board/pi" "$root/mods/ops-board/antigravity" "$_dest/ops-board/" &&
      for _f in "$root"/commands/*.md "$root"/commands/*.txt; do
        if [ -f "$_f" ]; then cp "$_f" "$_dest/ops-board/commands/"; fi
      done
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

# subst_gemini_pending <template> <skills-dir> <target>: Gemini CLI's skillator-pending.toml. On
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
  if under_link "$3"; then echo "        kept $3: a link or under one"; return 0; fi
  if [ -n "$dry" ]; then echo "        would write $3"; return 0; fi
  mkdir -p "$(dirname -- "$3")"
  case "$1" in
    */gemini/skillator-pending.toml) subst_gemini_pending "$1" "$2" "$3" || exit 1 ;;
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
            "${LOCALAPPDATA:-}/Programs/Antigravity IDE/bin/antigravity-ide.cmd" \
            "${LOCALAPPDATA:-}/Programs/antigravity/bin/antigravity-ide" \
            "${LOCALAPPDATA:-}/Programs/antigravity/bin/antigravity-ide.cmd" \
            "${ProgramFiles:-}/Antigravity IDE/bin/antigravity-ide.cmd" \
            "${ProgramFiles:-}/Antigravity IDE/bin/antigravity-ide" \
            "/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide" \
            "/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity"; do
    case $_i in /*|[A-Za-z]:*) [ -x "$_i" ] && { echo "$_i"; return 0; } ;; esac
  done
  return 0
}

# muse_json: strict JSON checks for put_muse (Node), one mode per call
muse_json() {
  node -e '
    const fs = require("fs"), path = require("path"), [mode, arg, expected] = process.argv.slice(1);
    // A231: the same string as install.ps1 Normalize-MusePath: links resolved by the OS, then one spelling
    // a subst or mapped drive resolves by its mapping at run time, as realpath does - accepted
    const norm = p => { const win = process.platform === "win32"; if (win) p = path.resolve(p.replace(/\//g, "\\").replace(/^\\\\\?\\UNC\\/i, "\\\\").replace(/^\\\\\?\\/, "")); try { p = fs.realpathSync.native(p); } catch {} p = p.replace(/\\/g, "/"); if (win) p = p.toLowerCase(); p = p.replace(/\/+$/, ""); return win && /^[a-z]:$/.test(p) ? p + "/" : p || "/"; };
    try {
      const data = JSON.parse(fs.readFileSync(0, "utf8").replace(/^\uFEFF/, ""));
      if (mode === "manifest") {
        if (data.name !== "skillator" || typeof data.version !== "string" || !data.version.trim()) throw Error("invalid selected Skillator manifest");
        console.log(data.version);
      } else if (mode === "record") {
        if (!data || !Array.isArray(data.plugins)) throw Error("invalid plugins list JSON");
        const entries = data.plugins.filter(p => p?.record?.id === "skillator");
        if (entries.length > 1) throw Error("ambiguous Skillator records; inspect manually");
        if (!entries.length) { console.log("null"); process.exit(0); }
        const {record, active_scope} = entries[0];
        if (!record.scope && active_scope === "installed-plugin") record.scope = "user";
        console.log(JSON.stringify(record));
      } else if (mode === "policy") {
        if (data === null) console.log("install");
        else {
          if (data.enabled !== true || data.scope !== "user") throw Error("disabled or unsupported scope; preserve installation manually (CLI remove/update has no scope selector)");
          if (data.source?.provenance === "marketplace-user-added") console.log("update");
          else if (data.source?.provenance !== "native-local") throw Error("unsupported provenance; inspect installation manually");
          else if (typeof data.source.path !== "string" || !data.source.path) throw Error("missing native-local source path");
          else console.log(norm(data.source.path) === norm(arg) ? "update" : "migrate");
        }
      } else if (mode === "scope") console.log(data?.scope || "user");
      else if (mode === "path") console.log(data.source.path);
      else if (mode === "verify") {
        const before = JSON.parse(expected), local = !before || before.source.provenance === "native-local";
        const [path, version] = JSON.parse(arg);
        if (!data || data.version !== version || data.enabled !== true || data.scope !== (before?.scope || "user")) throw Error("verification failed: expected version " + version + ", enabled and original scope; got version " + data?.version + "; inspect muse plugins list --json manually");
        if (local ? data.source?.provenance !== "native-local" || typeof data.source.path !== "string" || norm(data.source.path) !== norm(path) : data.source?.provenance !== before.source.provenance || data.source?.path !== before.source.path) throw Error("source verification failed; inspect muse plugins list --json manually");
      }
    } catch (e) { console.error("Muse: " + e.message); process.exit(1); }
  ' "$@"
}

# put_muse: F134 - install or update the skillator plugin for Muse Code CLI when muse is available
put_muse() {
  _muse=""
  if [ "${SKILLATOR_MUSE+set}" = set ]; then
    [ -n "$SKILLATOR_MUSE" ] && [ -x "$SKILLATOR_MUSE" ] || return 0
    _muse="$SKILLATOR_MUSE"
  elif command -v muse >/dev/null 2>&1; then
    _muse=$(command -v muse)
  fi
  [ -z "$_muse" ] && return 0

  _plug_dir="$root"
  if [ ! -f "$_plug_dir/.muse-plugin/plugin.json" ]; then
    if [ -f "$_plug_dir/plugin/.muse-plugin/plugin.json" ]; then
      _plug_dir="$_plug_dir/plugin"
    else
      echo 'Muse: selected source has no .muse-plugin/plugin.json' >&2
      return 1
    fi
  fi

  echo "Muse ($_muse):"
  if [ -n "$dry" ]; then
    echo "        would install or update Muse plugin skillator from $_plug_dir"
    return 0
  fi

  # Only the Muse integration needs Node for strict JSON parsing; skill copying does not.
  command -v node >/dev/null 2>&1 || { echo 'Muse: Node is required to validate plugin JSON; no Muse changes made' >&2; return 1; }
  _version=$(muse_json manifest < "$_plug_dir/.muse-plugin/plugin.json") || return 1
  _list=$(MUSE_NO_AUTO_UPDATE=1 "$_muse" plugins list --json) || { echo 'Muse: plugins list failed' >&2; return 1; }
  _before=$(printf '%s' "$_list" | muse_json record) || return 1
  _action=$(printf '%s' "$_before" | muse_json policy "$_plug_dir") || return 1
  _scope=$(printf '%s' "$_before" | muse_json scope) || return 1
  case $_action in
    migrate)
      _old_path=$(printf '%s' "$_before" | muse_json path) || return 1
      MUSE_NO_AUTO_UPDATE=1 "$_muse" plugins remove skillator --json || { echo 'Muse: remove failed (data retained)' >&2; return 1; }
      if ! MUSE_NO_AUTO_UPDATE=1 "$_muse" plugins install "$_plug_dir" --scope "$_scope" --json; then
        echo 'Muse: selected-source install failed; attempting old-source rollback' >&2
        MUSE_NO_AUTO_UPDATE=1 "$_muse" plugins install "$_old_path" --scope "$_scope" --json || echo 'Muse: rollback also failed; restore old source manually' >&2
        return 1
      fi ;;
    update) MUSE_NO_AUTO_UPDATE=1 "$_muse" plugins update skillator --json || { echo 'Muse: update failed' >&2; return 1; } ;;
    install) MUSE_NO_AUTO_UPDATE=1 "$_muse" plugins install "$_plug_dir" --scope "$_scope" --json || { echo 'Muse: install failed' >&2; return 1; } ;;
  esac
  _list=$(MUSE_NO_AUTO_UPDATE=1 "$_muse" plugins list --json) || { echo 'Muse: post-update list failed' >&2; return 1; }
  _after=$(printf '%s' "$_list" | muse_json record) || return 1
  _expected=$(node -e 'console.log(JSON.stringify(process.argv.slice(1)))' "$_plug_dir" "$_version") || return 1
  printf '%s' "$_after" | muse_json verify "$_expected" "$_before" || return 1
  _verified_path=$(printf '%s' "$_after" | muse_json path) || return 1
  echo "        * Muse plugin skillator verified $_version ($_verified_path)"
  echo '        If runtime capabilities await approval, review: muse plugins approve skillator'
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

# write_commands <cli> <dest>: F54 - /skillator-pending, /list-ticket-zordon, /engage-picard, /archive-zordon, /sync-zordon, /skillator-update, /team-messages and /pending-sentinel as the host's own command
# file, user level, rewritten every run. Called per dest; per-CLI files are written for
# the dest the host reads its skills from. Antigravity's are skills (/<name> in agy),
# written into each antigravity dest with no .skillator-owned marker and kept out of
# .skillator-installed, so prune_dest never touches them. Claude Code: nothing (the
# ops-board mod has its own /pending, /list-tickets; /engage-picard, /archive-zordon, /sync-zordon, /skillator-update, /team-messages and /pending-sentinel are the plugin's commands/*.md).
#
# A218: F171 retired the plain names (the unique ones are the only names) and F90 the
# Codex prompts. retired_cmds is what older runs wrote everywhere; upstream-sync (pre-F166
# alias) and ops were also written, skillator-update and team-messages as Codex prompts.
# Ownership is the body: it names a skillator skill, script or phrase (every committed
# version of every retired template matches retired_body). Nothing goes through a link.
retired_cmds="pending list-tickets engage archive-tickets sync-tickets pending-subagent verify-subagent marathon-plan marathon-run"
retired_body='tickets-zordon|relay-morpheus|code-vader|skillator-sync|tasks-sentinels|teams-uhura|skillator:|\.skillator-source|ops-board/ops/ops|Engaged prompt'
# under_link <path>: the path, or a dir between it and $HOME, is a symlink or junction
under_link() {
  _q=$1
  while [ "$_q" != "${HOME%/}" ]; do
    [ -L "$_q" ] && return 0
    _up=$(dirname -- "$_q"); [ "$_up" = "$_q" ] && return 1; _q=$_up
  done
  return 1
}
# retire_file <file>: rename a loose command file skillator wrote to <file>.skillator-retired
# - the hosts list only .md / .toml, so it leaves the picker and stays recoverable
retire_file() {
  _f=$1
  [ -e "$_f" ] || [ -L "$_f" ] || return 0
  if under_link "$_f"; then echo "        kept $_f: a link or under one"; return 0; fi
  if [ ! -f "$_f" ] || ! grep -qE "$retired_body" "$_f"; then
    echo "        kept $_f: not written by skillator"; return 0
  fi
  if [ -e "$_f.skillator-retired" ] || [ -L "$_f.skillator-retired" ]; then
    echo "        kept $_f: $_f.skillator-retired exists"; return 0
  fi
  if [ -n "$dry" ]; then echo "        would retire $_f -> $_f.skillator-retired"; return 0; fi
  # never overwrite: mv -n, then the source must be gone and the target hold its bytes
  _sum=$(cksum < "$_f" 2>/dev/null) || _sum=
  if [ -z "$_sum" ]; then echo "warn  $_f not retired (kept)"; return 0; fi
  mv -n -- "$_f" "$_f.skillator-retired" || :
  if [ -e "$_f" ] || [ -L "$_f" ]; then
    echo "warn  $_f not retired (kept)"; return 0
  fi
  if [ ! -f "$_f.skillator-retired" ] || [ "$(cksum < "$_f.skillator-retired" 2>/dev/null)" != "$_sum" ]; then
    echo "warn  $_f.skillator-retired mismatched"; return 0
  fi
  echo "        retired $_f -> $_f.skillator-retired (delete it if unused)"
}
# retire_dir <dir>: a skill-command dir holding only SKILL.md (and its marker). Decided
# before anything is touched: an intact .skillator-owned marker (owned_intact) removes the
# dir; without one - what pre-F171 runs left, they stripped the marker - SKILL.md is
# retired by rename as a loose file is; any other file, or a link, keeps it all.
retire_dir() {
  _d=$1
  [ -e "$_d/SKILL.md" ] || [ -L "$_d/SKILL.md" ] || [ -L "$_d" ] || return 0
  if under_link "$_d/SKILL.md"; then echo "        kept $_d: a link or under one"; return 0; fi
  if [ ! -f "$_d/SKILL.md" ] || ! grep -qE "$retired_body" "$_d/SKILL.md"; then
    echo "        kept $_d: not written by skillator"; return 0
  fi
  if [ -n "$(ls -A "$_d" | grep -vxF -e SKILL.md -e "$owned")" ]; then
    echo "        kept $_d: holds files skillator did not write"; return 0
  fi
  if [ -f "$_d/$owned" ] && owned_intact "$_d"; then
    if [ -n "$dry" ]; then echo "        would remove dir $_d"; return 0; fi
    rm -rf "$_d" || { echo "warn  $_d not removed"; return 0; }
    echo "        removed dir $_d"
  else
    retire_file "$_d/SKILL.md"
  fi
}
write_commands() {
  _c="$root/host-commands"
  _cmds="skillator-pending list-ticket-zordon engage-picard archive-zordon sync-zordon skillator-update team-messages pending-sentinel verify-shifu gauntlet-plan gauntlet-run team code-vader skillator-sync message-uhura decision-matrix"
  _ops_cmds="skillator-ops"
  case "$1" in
    codex)
      # F90: skills (Codex runs them now), from Antigravity's skill-commands; the custom
      # prompts pre-F90 runs wrote are retired (A218), nothing else in prompts/. F105: $skillator-ops -
      # skill hosts only; pi and Claude Code have their own /ops
      for _n in $_cmds $_ops_cmds; do put_cmd "$_c/antigravity/$_n/SKILL.md" "$2" "$2/$_n/SKILL.md"; done
      for _n in $retired_cmds upstream-sync ops; do retire_dir "$2/$_n"; done
      for _n in $retired_cmds skillator-update team-messages; do retire_file "$codex_home/prompts/$_n.md"; done ;;
    cursor)
      for _n in $_cmds; do put_cmd "$_c/cursor/$_n.md" "$2" "$HOME/.cursor/commands/$_n.md"; done
      for _n in $retired_cmds upstream-sync; do retire_file "$HOME/.cursor/commands/$_n.md"; done ;;
    pi)
      [ "$2" = "$HOME/.pi/agent/skills" ] || return 0
      for _n in $_cmds; do put_cmd "$_c/pi/$_n.md" "$2" "$HOME/.pi/agent/prompts/$_n.md"; done
      for _n in $retired_cmds upstream-sync; do retire_file "$HOME/.pi/agent/prompts/$_n.md"; done
      put_pi_ext "$2" ;;
    opencode)
      # F67: markdown, frontmatter description, $ARGUMENTS - /<n> in opencode; F159: /skillator-ops
      for _n in $_cmds $_ops_cmds; do put_cmd "$_c/opencode/$_n.md" "$2" "$oc_config/commands/$_n.md"; done
      for _n in $retired_cmds upstream-sync ops; do retire_file "$oc_config/commands/$_n.md"; done ;;
    antigravity)
      for _n in $_cmds $_ops_cmds; do
        put_cmd "$_c/antigravity/$_n/SKILL.md" "$2" "$2/$_n/SKILL.md"
        # an older run may have marked it owned - it is not a manifest skill
        if under_link "$2/$_n/$owned"; then echo "        kept $2/$_n/$owned: a link or under one"; elif [ -z "$dry" ]; then rm -f "$2/$_n/$owned"; fi
      done
      for _n in $retired_cmds upstream-sync ops; do retire_dir "$2/$_n"; done
      # F57: the Antigravity IDE's extension, from Antigravity's own dest
      if [ "$2" = "$HOME/.gemini/config/skills" ]; then put_agy_ext "$2"; fi
      # Gemini CLI shares the ~/.gemini marker and reads ~/.gemini/skills
      if [ "$2" = "$HOME/.gemini/skills" ]; then
        for _n in $_cmds; do put_cmd "$_c/gemini/$_n.toml" "$2" "$HOME/.gemini/commands/$_n.toml"; done
        for _n in $retired_cmds upstream-sync; do retire_file "$HOME/.gemini/commands/$_n.toml"; done
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
# gnu_timeout: the GNU timeout command (coreutils), or nothing - never Windows' timeout.exe
gnu_timeout() {
  for _t in timeout gtimeout; do
    if command -v "$_t" >/dev/null 2>&1 && "$_t" --version </dev/null 2>/dev/null | grep -q coreutils; then echo "$_t"; return 0; fi
  done
}

if [ -n "$selftest" ] && [ -z "${SKILLATOR_SELFTEST_GUARDED:-}" ]; then
  # A232: a hung or runaway selftest fails fast with a reason; nothing below reads stdin
  _limit=${SKILLATOR_SELFTEST_TIMEOUT:-1800}
  case $_limit in ''|*[!0-9]*) _limit=0 ;; esac
  [ "$_limit" -gt 0 ] 2>/dev/null || { echo "FAIL: SKILLATOR_SELFTEST_TIMEOUT must be a positive integer of seconds, not '${SKILLATOR_SELFTEST_TIMEOUT:-}'"; exit 2; }
  _to=$(gnu_timeout)
  if [ -n "$_to" ]; then
    _rc=0; SKILLATOR_SELFTEST_GUARDED=1 "$_to" "$_limit" sh "$0" "$@" </dev/null || _rc=$?
    case $_rc in
      124) echo "FAIL: selftest still running after ${_limit}s (SKILLATOR_SELFTEST_TIMEOUT)" ;;
      125|126|127) echo "FAIL: selftest time limit could not run (rc $_rc)" ;;
    esac
    exit "$_rc"
  fi
  echo 'selftest: no time limit (no GNU timeout)'
  exec </dev/null
fi
if [ -n "$selftest" ]; then
  # A232: a signal (the time limit's TERM) exits through the EXIT trap, so the fixture goes too
  T=$(mktemp -d); trap 'rm -rf "$T"' EXIT; trap 'exit 1' HUP INT TERM
  # A166: exercise cleanup only below this fixture, never a live profile.
  (
    fixture="$T/ownership"; src="$fixture/source"; dest="$fixture/dest"
    mkdir -p "$src/two-file" "$dest"
    printf 'skill\r\n' > "$src/two-file/SKILL.md"
    printf 'helper\n' > "$src/two-file/helper file"
    for name in edited extra missing old malformed nul-marker duplicate traversal untouched; do
      target="$dest/$name"
      case "$target" in "$T/ownership/"*) ;; *) exit 1 ;; esac
      cp -R "$src/two-file" "$target"
      write_owned "$target" "$src/two-file"
      same_contents "$target" "$src/two-file" || exit 1
      case "$name" in
        edited) printf 'edited\n' > "$target/helper file" ;;
        extra) touch "$target/user file" ;;
        missing) rm "$target/helper file" ;;
        old) printf 'sha256 %s\nfile SKILL.md\nfile helper file\n' "$(skill_hash "$target/SKILL.md")" > "$target/$owned" ;;
        malformed) printf 'skillator-owned 2\ninvalid\n' > "$target/$owned" ;;
        nul-marker) { printf 'skillator-owned\000 2\n'; tail -n +2 "$target/$owned"; } > "$fixture/nul-marker"; mv "$fixture/nul-marker" "$target/$owned" ;;
        untouched) sed "s/$/$(printf '\r')/" "$target/$owned" > "$fixture/crlf-marker"; mv "$fixture/crlf-marker" "$target/$owned" ;;
        duplicate) last=$(tail -1 "$target/$owned"); printf '%s\n' "$last" >> "$target/$owned" ;;
        traversal) printf 'file %064d ../outside\n' 0 >> "$target/$owned" ;;
      esac
      printf '%s\n' "$name" >> "$dest/$manifest"
    done
    same_contents "$dest/edited" "$src/two-file" && exit 1
    same_contents "$dest/extra" "$src/two-file" && exit 1
    shipped=''
    dry=1; output=$(prune_dest "$dest")
    printf '%s\n' "$output" | grep -q 'would remove untouched ' || exit 1
    [ "$(printf '%s\n' "$output" | grep -c 'would remove')" = 1 ] || exit 1
    for name in edited extra missing old malformed nul-marker duplicate traversal; do
      [ -d "$dest/$name" ] || exit 1
      printf '%s\n' "$output" | grep -q "kept $name (modified or unverifiable" || exit 1
    done
    dry=''; prune_dest "$dest" > "$fixture/cleanup"
    [ ! -e "$dest/untouched" ] || exit 1
    for name in edited extra missing old malformed nul-marker duplicate traversal; do
      [ -d "$dest/$name" ] || exit 1
      grep -q "kept $name (modified or unverifiable" "$fixture/cleanup" || exit 1
    done
    legacy=legacy; mkdir -p "$fixture/legacy/legacy"
    cp "$src/two-file/SKILL.md" "$fixture/legacy/legacy/SKILL.md"
    touch "$fixture/legacy/PLATFORMS.md"
    dry=1; prune_dest "$fixture/legacy" | grep -q 'kept legacy' || exit 1
    dry=''; prune_dest "$fixture/legacy" | grep -q 'kept legacy' || exit 1
    [ -d "$fixture/legacy/legacy" ] || exit 1
  ) || { echo 'FAIL: A166 ownership cleanup'; exit 1; }
  rm -rf "$T/ownership"
  # A231: Muse may record the link-resolved spelling of the installer's source
  mkdir -p "$T/a231/real/src"
  ln -s "$T/a231/real" "$T/a231/lnk" 2>/dev/null
  [ -L "$T/a231/lnk" ] || { rm -rf "$T/a231/lnk"; ! command -v cygpath >/dev/null 2>&1 || MSYS2_ARG_CONV_EXCL="*" cmd /c mklink /J "$(cygpath -w "$T/a231/lnk")" "$(cygpath -w "$T/a231/real")" >/dev/null 2>&1 || true; }
  if ! command -v node >/dev/null 2>&1 || [ ! -d "$T/a231/lnk/src" ]; then
    echo 'skip  A231 link case (no node, or no symlink or junction)'
  else
    printf '{"version":"1","enabled":true,"scope":"user","source":{"provenance":"native-local","path":"%s/src"}}' "$(native "$T/a231/real")" |
      muse_json verify "[\"$(native "$T/a231/lnk")/src\",\"1\"]" null || { echo 'FAIL: A231 Muse source through a link compared unequal'; exit 1; }
  fi
  rm -rf "$T/a231"
  mkdir -p "$T/.codex" "$T/.cursor" "$T/.gemini" "$T/.pi" "$T/.config/opencode"
  # F67: opencode's config dir is $XDG_CONFIG_HOME/opencode when that is set - never let
  # the selftest follow it out of the temp HOME
  unset XDG_CONFIG_HOME
  # F57: a fake Antigravity IDE CLI that logs its arguments - every run below inherits
  # it, so the selftest never installs into the real IDE
  printf '#!/bin/sh\nprintf "%%s\\n" "$*" >> "%s/ide-calls"\n' "$T" > "$T/fake-ide"; chmod 755 "$T/fake-ide"
  export SKILLATOR_AGY_IDE="$T/fake-ide"
  export SKILLATOR_MUSE="$T/none"
  # F89: the Windows Terminal fragment goes under a temp LOCALAPPDATA, never the real one
  export LOCALAPPDATA="$T/lad"
  # B12: an unknown flag is an error - exit 2, the usage line, nothing written
  _c=0; _o=$(HOME=$T CODEX_HOME=$T/.codex sh "$0" --nope 2>&1) || _c=$?
  [ "$_c" = 2 ] || { echo "FAIL: unknown flag exited $_c"; exit 1; }
  printf '%s\n' "$_o" | grep -q '^usage: install.sh' || { echo "FAIL: unknown flag usage line"; exit 1; }
  [ -z "$(find "$T" -type f ! -name fake-ide)" ] || { echo "FAIL: unknown flag wrote files"; exit 1; }
  HOME=$T CODEX_HOME=$T/.codex sh "$0" >/dev/null ||{ echo "FAIL: install exited $?"; exit 1; }
  # B6: every frontmatter in commands/ and host-commands/ must be valid YAML or pi never registers
  # the command. No YAML parser in the installer, so a narrow check: an unquoted plain value
  # holding ": " (the one slip that bit /archive-zordon). Quote such a value.
  _bad=$(find "$root/commands" "$root/host-commands" -type f -name '*.md' | while read -r f; do
    awk -v f="$f" 'NR==1 { if ($0 != "---") exit } NR>1 && /^---[ \t\r]*$/ { exit }
      NR>1 && /^[A-Za-z_-]+:[ \t]+[^"\x27\[{|>&*!#% \t]/ { v=$0; sub(/^[A-Za-z_-]+:[ \t]+/, "", v); if (v ~ /: /) print f ": " $0 }' "$f"
  done)
  # F67: the scan reaches opencode's command files too
  find "$root/host-commands" -type f -name '*.md' | grep -q '/host-commands/opencode/team-messages\.md$' || { echo "FAIL: B6 scan misses host-commands/opencode"; exit 1; }
  # F71: /pending-sentinel ships on Claude Code (commands/) and every host, and the scan reaches it
  for f in commands/pending-sentinel.md host-commands/cursor/pending-sentinel.md \
           host-commands/pi/pending-sentinel.md host-commands/opencode/pending-sentinel.md \
           host-commands/antigravity/pending-sentinel/SKILL.md host-commands/gemini/pending-sentinel.toml; do
    [ -f "$root/$f" ] || { echo "FAIL: missing source $f"; exit 1; }
  done
  find "$root/commands" "$root/host-commands" -type f -name '*.md' | grep -c 'pending-sentinel' | grep -qx 5 || { echo "FAIL: B6 scan misses a pending-sentinel file"; exit 1; }
  find "$root/commands" -type f -name '*.md' | grep -q '/commands/verify-shifu\.md$' || { echo "FAIL: B6 scan misses commands/verify-shifu.md"; exit 1; }
  # F73: /gauntlet-plan and /gauntlet-run - Claude Code runs them with the Workflow tool, every
  # other host with its delegate (F101); descriptions quoted (B6)
  for _n in gauntlet-plan gauntlet-run; do
    for f in commands/$_n.md host-commands/cursor/$_n.md host-commands/pi/$_n.md \
             host-commands/opencode/$_n.md host-commands/antigravity/$_n/SKILL.md host-commands/gemini/$_n.toml; do
      [ -f "$root/$f" ] || { echo "FAIL: missing source $f"; exit 1; }
    done
    find "$root/commands" "$root/host-commands" -type f -name '*.md' | grep -c "$_n" | grep -qx 5 || { echo "FAIL: B6 scan misses a $_n file"; exit 1; }
    grep -q '^description: "' "$root/commands/$_n.md" || { echo "FAIL: commands/$_n.md description not quoted"; exit 1; }
    grep -qF 'Workflow' "$root/commands/$_n.md" || { echo "FAIL: commands/$_n.md does not name the Workflow tool"; exit 1; }
    grep -qF 'skillator:relay-morpheus' "$root/commands/$_n.md" || { echo "FAIL: commands/$_n.md does not load relay-morpheus"; exit 1; }
  done
  grep -qF 'workflow-authoring' "$root/commands/gauntlet-plan.md" || { echo "FAIL: commands/gauntlet-plan.md does not load workflow-authoring"; exit 1; }
  # A155: with grayskull-power on, every implementer prompt opens with the code-yoda line - the
  # line carried verbatim, in the commands only beside the grayskull.md gate
  _yoda='Load skillator:code-yoda first (restraint, full): the smallest diff that meets the ticket - no speculative abstraction, no new dependency, no refactor outside the ticket, no ceremony; run its review lens on your diff before /code-review and cut what it flags.'
  for f in skills/relay-morpheus/references/chain.md skills/relay-morpheus/references/marathon.md \
           skills/tasks-sentinels/SKILL.md skills/relay-morpheus/templates/marathon-workflow.js; do
    grep -qF -- "$_yoda" "$root/$f" || { echo "FAIL: $f does not carry the code-yoda line (A155)"; exit 1; }
  done
  grep -qF 'skillator:code-yoda first' "$root/skills/grayskull-power/references/arming.md" || { echo "FAIL: arming.md does not say code-yoda carries to implementers (A155)"; exit 1; }
  for _n in pending-sentinel gauntlet-plan gauntlet-run; do
    for f in commands/$_n.md host-commands/cursor/$_n.md host-commands/pi/$_n.md \
             host-commands/opencode/$_n.md host-commands/antigravity/$_n/SKILL.md host-commands/gemini/$_n.toml; do
      grep -F -- "$_yoda" "$root/$f" | grep -qF '.skillator/grayskull.md' || { echo "FAIL: $f has no grayskull-gated code-yoda line (A155)"; exit 1; }
    done
  done
  # F88: every /pending-sentinel copy maps no argument / sequential / parallel / a count to RELAY_CHAIN_PARALLEL
  for f in commands/pending-sentinel.md host-commands/cursor/pending-sentinel.md \
           host-commands/pi/pending-sentinel.md host-commands/opencode/pending-sentinel.md \
           host-commands/antigravity/pending-sentinel/SKILL.md host-commands/gemini/pending-sentinel.toml; do
    for _r in '| nothing, `sequential`, `1` | sequential | unset' '| `parallel`, `max`, `parallel max` | parallel | the number of ticket stages' '| `parallel 2`, `2` | parallel, capped | 2 |'; do
      grep -qF -- "$_r" "$root/$f" || { echo "FAIL: $f has no mode row '$_r' (F88)"; exit 1; }
    done
  done
  # F112: one marathon command - the mode is a plan shape: the template carries PLAN.mode and refuses a
  # phase wider than the mode allows; marathon.md carries the mode table
  _mw="$root/skills/relay-morpheus/templates/marathon-workflow.js"
  grep -qF "mode: 'sequential'," "$_mw" || { echo "FAIL: marathon-workflow.js PLAN has no mode line (F112)"; exit 1; }
  grep -qF "PLAN.mode must be 'sequential', 'parallel' or 'parallel <N>'" "$_mw" || { echo "FAIL: marathon-workflow.js does not check PLAN.mode (F112)"; exit 1; }
  if command -v node >/dev/null 2>&1; then
    awk '{sub(/^return /, "export default "); print} /code: .XXXX., ticket: .F0./ {print "      { stage: 1, code: \047YYYY\047, ticket: \047F1\047, files: [\047b\047], done: \047d\047, prompt: \047p\047 },"}' "$_mw" > "$T/mw.mjs"
    _o=$(node --input-type=module -e "import {pathToFileURL} from 'node:url'; globalThis.args={phase:1}; await import(pathToFileURL(process.argv[1]).href)" -- "$T/mw.mjs" 2>&1) || :
    printf '%s' "$_o" | grep -qF 'PLAN.mode sequential needs one ticket per phase - phase 1 holds 2' || { echo "FAIL: marathon-workflow.js runs a two-ticket phase under mode sequential (F112): $_o"; exit 1; }
  fi
  for _r in '| nothing, `sequential`, `1` | sequential | one ticket | unset |' '| `parallel`, `max`, `parallel max` | parallel | every file-disjoint ticket that fits | the number of stages in the phase |' '| `parallel 2`, `2` | parallel, capped | at most 2 file-disjoint tickets | 2 |'; do
    grep -qF -- "$_r" "$root/skills/relay-morpheus/references/marathon.md" || { echo "FAIL: marathon.md has no mode row '$_r' (F112)"; exit 1; }
  done
  grep -qF '### Mode - sequential or parallel (F112)' "$root/skills/relay-morpheus/references/marathon.md" || { echo "FAIL: marathon.md has no Mode section (F112)"; exit 1; }
  for _r in '| Explicit own legacy; pending and landed only | regenerate in place |' '| Modern PLAN.mode present | skip; keep saved plan |' '| Any active worker or in-flight stage | refuse; wait for completion |' '| Implicit, ambiguous or mixed target | refuse; print explicit target command |' '| Failed stage needing retry | refuse; existing retry flow first |' '| Parked or unresolved replacement stage | refuse; resolve existing hold first |'; do
    grep -qF -- "$_r" "$root/skills/relay-morpheus/references/marathon.md" || { echo "FAIL: marathon.md has no recovery decision '$_r' (A162)"; exit 1; }
  done
  for _n in gauntlet-plan gauntlet-run; do
    for f in commands/$_n.md host-commands/cursor/$_n.md host-commands/pi/$_n.md host-commands/opencode/$_n.md host-commands/antigravity/$_n/SKILL.md host-commands/gemini/$_n.toml; do
      for _r in '| nothing, `sequential`, `1` | sequential | one ticket | unset |' '| `parallel`, `max`, `parallel max` | parallel | every file-disjoint ticket that fits | the number of stages in the phase |' '| `parallel 2`, `2` | parallel, capped | at most 2 file-disjoint tickets | 2 |'; do
        grep -qF -- "$_r" "$root/$f" || { echo "FAIL: $f has no mode row '$_r' (F112)"; exit 1; }
      done
      # A162: every host routes a legacy refusal to the guarded in-place recovery.
      for _r in 'Legacy recovery (A162)' '/gauntlet-plan <mode> <IDs>' 'PLAN.mode' 'planned in RUN-<id>'; do
        grep -qF -- "$_r" "$root/$f" || { echo "FAIL: $f has no legacy recovery pin '$_r' (A162)"; exit 1; }
      done
      grep -qF 'say it is not an option and stop' "$root/$f" || { echo "FAIL: $f has no bad-first-word refusal (F112)"; exit 1; }
      case "$f" in commands/*|host-commands/pi/*)
      grep -q '^argument-hint: "\[sequential|parallel\] \[N|max\]' "$root/$f" || { echo "FAIL: $f argument-hint has no mode (F112)"; exit 1; }
        ;; esac
    done
  done
  grep -qF 'plans the marathon' "$root/commands/gauntlet-run.md" || { echo "FAIL: commands/gauntlet-run.md does not plan and run in one go (F112)"; exit 1; }
  grep -qF 'the saved plan fixes its shape' "$root/commands/gauntlet-run.md" || { echo "FAIL: commands/gauntlet-run.md has no RUN-id mode refusal (F112)"; exit 1; }
  [ -z "$_bad" ] || { echo "FAIL: frontmatter has an unquoted \": \" (invalid YAML, pi will not register the command): $_bad"; exit 1; }
  # F68: the Muse manifest lists every skill and carries the release version
  sh "$root/practice/scripts/check-muse-manifest.sh" "$root" > /dev/null || { echo "FAIL: .muse-plugin out of step (sh practice/scripts/check-muse-manifest.sh)"; exit 1; }
  sh "$root/skills/clone-odo/scripts/odo.sh" selftest > /dev/null || { echo "FAIL: clone-odo tools (sh skills/clone-odo/scripts/odo.sh selftest)"; exit 1; }
  for f in .codex/skills/skillator-pending/SKILL.md .codex/skills/list-ticket-zordon/SKILL.md .gemini/commands/skillator-pending.toml .gemini/commands/list-ticket-zordon.toml \
           .cursor/commands/skillator-pending.md .cursor/commands/list-ticket-zordon.md .pi/agent/prompts/skillator-pending.md .pi/agent/prompts/list-ticket-zordon.md \
           .gemini/config/skills/skillator-pending/SKILL.md .gemini/config/skills/list-ticket-zordon/SKILL.md \
           .gemini/skills/skillator-pending/SKILL.md .gemini/skills/list-ticket-zordon/SKILL.md \
           .codex/skills/engage-picard/SKILL.md .gemini/commands/engage-picard.toml .cursor/commands/engage-picard.md .pi/agent/prompts/engage-picard.md \
           .gemini/config/skills/engage-picard/SKILL.md .gemini/skills/engage-picard/SKILL.md \
           .codex/skills/archive-zordon/SKILL.md .gemini/commands/archive-zordon.toml .cursor/commands/archive-zordon.md \
           .pi/agent/prompts/archive-zordon.md .gemini/config/skills/archive-zordon/SKILL.md .gemini/skills/archive-zordon/SKILL.md \
           .codex/skills/sync-zordon/SKILL.md .gemini/commands/sync-zordon.toml .cursor/commands/sync-zordon.md \
           .pi/agent/prompts/sync-zordon.md .gemini/config/skills/sync-zordon/SKILL.md .gemini/skills/sync-zordon/SKILL.md \
           .gemini/antigravity-cli/skills/tickets-zordon/SKILL.md .gemini/antigravity-cli/skills/skillator-pending/SKILL.md \
           .gemini/antigravity-cli/skills/list-ticket-zordon/SKILL.md .gemini/antigravity-cli/skills/engage-picard/SKILL.md \
           .gemini/antigravity-cli/skills/archive-zordon/SKILL.md .gemini/antigravity-cli/skills/sync-zordon/SKILL.md \
           .codex/skills/skillator-update/SKILL.md .gemini/commands/skillator-update.toml .cursor/commands/skillator-update.md \
           .pi/agent/prompts/skillator-update.md .gemini/config/skills/skillator-update/SKILL.md .gemini/skills/skillator-update/SKILL.md \
           .gemini/antigravity-cli/skills/skillator-update/SKILL.md \
           .codex/skills/team-messages/SKILL.md .gemini/commands/team-messages.toml .cursor/commands/team-messages.md \
           .pi/agent/prompts/team-messages.md .gemini/config/skills/team-messages/SKILL.md .gemini/skills/team-messages/SKILL.md \
           .gemini/antigravity-cli/skills/team-messages/SKILL.md .codex/skills/teams-uhura/scripts/team.mjs \
           .codex/skills/pending-sentinel/SKILL.md .gemini/commands/pending-sentinel.toml .cursor/commands/pending-sentinel.md \
           .pi/agent/prompts/pending-sentinel.md .gemini/config/skills/pending-sentinel/SKILL.md .gemini/skills/pending-sentinel/SKILL.md \
           .gemini/antigravity-cli/skills/pending-sentinel/SKILL.md .config/opencode/commands/pending-sentinel.md \
           .codex/skills/verify-shifu/SKILL.md .gemini/commands/verify-shifu.toml .cursor/commands/verify-shifu.md .pi/agent/prompts/verify-shifu.md \
           .gemini/config/skills/verify-shifu/SKILL.md .gemini/skills/verify-shifu/SKILL.md .gemini/antigravity-cli/skills/verify-shifu/SKILL.md \
           .codex/skills/gauntlet-plan/SKILL.md .gemini/commands/gauntlet-plan.toml .cursor/commands/gauntlet-plan.md .pi/agent/prompts/gauntlet-plan.md \
           .gemini/config/skills/gauntlet-plan/SKILL.md .gemini/skills/gauntlet-plan/SKILL.md .gemini/antigravity-cli/skills/gauntlet-plan/SKILL.md \
           .codex/skills/gauntlet-run/SKILL.md .gemini/commands/gauntlet-run.toml .cursor/commands/gauntlet-run.md .pi/agent/prompts/gauntlet-run.md \
           .gemini/config/skills/gauntlet-run/SKILL.md .gemini/skills/gauntlet-run/SKILL.md .gemini/antigravity-cli/skills/gauntlet-run/SKILL.md \
           .codex/skills/ops-board/ops/app.ts .codex/skills/ops-board/commands/skillator-ops.txt .pi/agent/skills/ops-board/hooks/lib/board.ts \
           .pi/agent/skills/ops-board/ops/package.json .pi/agent/skills/ops-board/hooks/lib/package.json \
           .pi/agent/skills/ops-board/pi/index.ts .pi/agent/skills/ops-board/pi/ops.ts .pi/agent/skills/ops-board/ops/engine.ts \
           .pi/agent/extensions/skillator-ops.ts .config/opencode/skills/tickets-zordon/SKILL.md \
           .config/opencode/skills/teams-uhura/scripts/team.mjs .config/opencode/skills/ops-board/ops/ops.sh \
           .codex/skills/clone-odo/scripts/odo.sh .codex/skills/clone-odo/scripts/parity.py .config/opencode/skills/clone-odo/templates/features.csv \
           .codex/skills/skill-prometheus/SKILL.md .codex/skills/skill-prometheus/references/testing.md .codex/skills/skill-smith/SKILL.md; do
    [ -f "$T/$f" ] || { echo "FAIL: missing $f"; exit 1; }
  done
  N=$(native "$T")
  # F67: opencode - the skills in its global skills dir, the seven commands in its commands/
  # dir, each substituted with that dest, no placeholder left, arguments by $ARGUMENTS
  _oc=.config/opencode
  for _n in skillator-pending list-ticket-zordon engage-picard archive-zordon sync-zordon skillator-update team-messages pending-sentinel verify-shifu gauntlet-plan gauntlet-run; do
    _f=$T/$_oc/commands/$_n.md
    [ -f "$_f" ] || { echo "FAIL: missing $_oc/commands/$_n.md"; exit 1; }
    head -1 "$_f" | grep -qx -- '---' || { echo "FAIL: opencode $_n has no frontmatter"; exit 1; }
    grep -q '^description: ' "$_f" || { echo "FAIL: opencode $_n description"; exit 1; }
    grep -qF '{{SKILLS}}' "$_f" && { echo "FAIL: placeholder left in $_oc/commands/$_n.md"; exit 1; }
    case $_n in engage-picard) ;; *) grep -qF "$N/$_oc/skills/" "$_f" || { echo "FAIL: opencode $_n not substituted with its own dest"; exit 1; } ;; esac
    case $_n in skillator-pending) ;; *) grep -qF '$ARGUMENTS' "$_f" || { echo "FAIL: opencode $_n args"; exit 1; } ;; esac
  done
  grep -qF "sh $N/$_oc/skills/tickets-zordon/scripts/pending.sh" "$T/$_oc/commands/skillator-pending.md" || { echo "FAIL: opencode pending not substituted"; exit 1; }
  grep -qF "$N/$_oc/skills/.skillator-source" "$T/$_oc/commands/skillator-update.md" || { echo "FAIL: opencode skillator-update not substituted"; exit 1; }
  grep -qF "$N/$_oc/skills/teams-uhura/scripts/team.mjs inbox --unread --mark-read" "$T/$_oc/commands/team-messages.md" || { echo "FAIL: opencode team-messages not substituted"; exit 1; }
  grep -qF "$N/$_oc/skills/teams-uhura/scripts/team.mjs say --file <that path>" "$T/$_oc/commands/team-messages.md" || { echo "FAIL: opencode team-messages reply not by say --file"; exit 1; }
  grep -qF -e "<<'EOF'" -e "@'" -e 'say "' "$T/$_oc/commands/team-messages.md" && { echo "FAIL: opencode team-messages puts reply text in shell source"; exit 1; }
  [ "$(cat "$T/$_oc/skills/.skillator-source" 2>/dev/null)" = "$(native "$root")" ] || { echo "FAIL: source pointer in $_oc/skills"; exit 1; }
  [ -f "$T/$_oc/skills/tickets-zordon/.skillator-owned" ] || { echo "FAIL: opencode skill has no ownership marker"; exit 1; }
  grep -qxE 'skillator-pending|list-ticket-zordon|engage-picard|archive-zordon|sync-zordon|skillator-update|team-messages|pending-sentinel|verify-shifu|gauntlet-plan|gauntlet-run|skillator-ops' "$T/$_oc/skills/.skillator-installed" && { echo "FAIL: command in opencode manifest"; exit 1; }
  # /skillator-update names opencode among the hosts it refreshes, on every host
  for f in .codex/skills/skillator-update/SKILL.md .cursor/commands/skillator-update.md .pi/agent/prompts/skillator-update.md \
           .gemini/commands/skillator-update.toml .gemini/skills/skillator-update/SKILL.md \
           .gemini/config/skills/skillator-update/SKILL.md .gemini/antigravity-cli/skills/skillator-update/SKILL.md $_oc/commands/skillator-update.md; do
    grep -q 'opencode' "$T/$f" || { echo "FAIL: skillator-update does not name opencode in $f"; exit 1; }
    for _guard in 'rev-parse --show-toplevel' 'git -C <checkout-root> pull --ff-only' 'Re-check both installers' 'never merge, reset, stash or force' 'nongit cache'; do
      grep -qF "$_guard" "$T/$f" || { echo "FAIL: skillator-update missing $_guard in $f"; exit 1; }
    done
  done
  grep -qF "sh $N/.codex/skills/tickets-zordon/scripts/pending.sh" "$T/.codex/skills/skillator-pending/SKILL.md" || { echo "FAIL: codex skill not substituted"; exit 1; }
  grep -qF "$N/.gemini/config/skills/tickets-zordon/SKILL.md" "$T/.gemini/config/skills/skillator-pending/SKILL.md" || { echo "FAIL: agy skill not substituted with its own dest"; exit 1; }
  grep -qF "$N/.gemini/skills/tickets-zordon/SKILL.md" "$T/.gemini/skills/list-ticket-zordon/SKILL.md" || { echo "FAIL: agy skill not substituted with its own dest"; exit 1; }
  # B8: agy 1.4.5 reads ~/.gemini/antigravity-cli/skills - its commands point at that dest
  grep -qF "$N/.gemini/antigravity-cli/skills/tickets-zordon/SKILL.md" "$T/.gemini/antigravity-cli/skills/skillator-pending/SKILL.md" || { echo "FAIL: agy-cli skill not substituted with its own dest"; exit 1; }
  # the path is quoted (a HOME with a space); under Git Bash (cygpath) it is install.ps1's
  # powershell form with the Windows path - Gemini CLI on Windows runs !{} without sh
  if command -v cygpath >/dev/null 2>&1; then
    grep -q '^!{sh ' "$T/.gemini/commands/skillator-pending.toml" && { echo "FAIL: gemini pending kept the sh line on Windows"; exit 1; }
    _want='!{powershell -NoProfile -ExecutionPolicy Bypass -File "'"$(cygpath -w "$T")"'\.gemini\skills\tickets-zordon\scripts\pending.ps1"}'
  else
    grep -q '^!{sh ' "$T/.gemini/commands/skillator-pending.toml" || { echo "FAIL: gemini shell injection"; exit 1; }
    _want='!{sh "'"$N"'/.gemini/skills/tickets-zordon/scripts/pending.sh"}'
  fi
  grep -qxF -- "$_want" "$T/.gemini/commands/skillator-pending.toml" || { echo "FAIL: gemini pending path"; exit 1; }
  # F65: /skillator-update reads each dest's source pointer (.skillator-source, one line:
  # the repo root this installer ran from, native form) - the command finds its source by it
  _src=$(native "$root")
  for d in .codex/skills .cursor/skills .pi/agent/skills .gemini/config/skills .gemini/skills .gemini/antigravity-cli/skills; do
    [ "$(cat "$T/$d/.skillator-source" 2>/dev/null)" = "$_src" ] || { echo "FAIL: source pointer in $d"; exit 1; }
  done
  for f in .codex/skills/skillator-update/SKILL.md:.codex/skills .cursor/commands/skillator-update.md:.cursor/skills \
           .pi/agent/prompts/skillator-update.md:.pi/agent/skills .gemini/commands/skillator-update.toml:.gemini/skills \
           .gemini/config/skills/skillator-update/SKILL.md:.gemini/config/skills .gemini/skills/skillator-update/SKILL.md:.gemini/skills \
           .gemini/antigravity-cli/skills/skillator-update/SKILL.md:.gemini/antigravity-cli/skills; do
    grep -qF "$N/${f#*:}/.skillator-source" "$T/${f%%:*}" || { echo "FAIL: skillator-update not substituted in ${f%%:*}"; exit 1; }
    grep -qF '{{SKILLS}}' "$T/${f%%:*}" && { echo "FAIL: placeholder left in ${f%%:*}"; exit 1; }
  done
  grep -q '^name: skillator-update$' "$T/.gemini/antigravity-cli/skills/skillator-update/SKILL.md" || { echo "FAIL: agy skill name skillator-update"; exit 1; }
  # F66: /team-messages points at the installed teams-uhura script, substituted per dest
  for f in .codex/skills/team-messages/SKILL.md:.codex/skills .cursor/commands/team-messages.md:.cursor/skills \
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
  # F71: /pending-sentinel loads relay-morpheus from the host's own dest and takes the agent count
  for f in .codex/skills/pending-sentinel/SKILL.md:.codex/skills .cursor/commands/pending-sentinel.md:.cursor/skills \
           .pi/agent/prompts/pending-sentinel.md:.pi/agent/skills .gemini/commands/pending-sentinel.toml:.gemini/skills \
           .gemini/config/skills/pending-sentinel/SKILL.md:.gemini/config/skills .gemini/skills/pending-sentinel/SKILL.md:.gemini/skills \
           .gemini/antigravity-cli/skills/pending-sentinel/SKILL.md:.gemini/antigravity-cli/skills \
           .config/opencode/commands/pending-sentinel.md:.config/opencode/skills; do
    grep -qF "$N/${f#*:}/relay-morpheus/SKILL.md" "$T/${f%%:*}" || { echo "FAIL: pending-sentinel not substituted in ${f%%:*}"; exit 1; }
    { grep -qF 'chain merge' "$T/${f%%:*}" && grep -qF 'max' "$T/${f%%:*}"; } || { echo "FAIL: pending-sentinel has no agent count in ${f%%:*}"; exit 1; }
    grep -F -- "$_yoda" "$T/${f%%:*}" | grep -qF '.skillator/grayskull.md' || { echo "FAIL: pending-sentinel has no grayskull-gated code-yoda line in ${f%%:*}"; exit 1; }
    grep -qF '{{SKILLS}}' "$T/${f%%:*}" && { echo "FAIL: placeholder left in ${f%%:*}"; exit 1; }
  done
  grep -q '^name: pending-sentinel$' "$T/.gemini/antigravity-cli/skills/pending-sentinel/SKILL.md" || { echo "FAIL: agy skill name pending-sentinel"; exit 1; }
  grep -q '^argument-hint: .*max' "$root/commands/pending-sentinel.md" || { echo "FAIL: commands/pending-sentinel.md argument-hint has no count"; exit 1; }
  # F73/F101: off Claude Code /gauntlet-plan and /gauntlet-run load relay-morpheus from the
  # host's own dest and run the saved plan with the host's delegate or in-session
  for _n in gauntlet-plan gauntlet-run; do
    for f in .codex/skills/$_n/SKILL.md:.codex/skills .cursor/commands/$_n.md:.cursor/skills \
             .pi/agent/prompts/$_n.md:.pi/agent/skills .gemini/commands/$_n.toml:.gemini/skills \
             .gemini/config/skills/$_n/SKILL.md:.gemini/config/skills .gemini/skills/$_n/SKILL.md:.gemini/skills \
             .gemini/antigravity-cli/skills/$_n/SKILL.md:.gemini/antigravity-cli/skills \
             .config/opencode/commands/$_n.md:.config/opencode/skills; do
      grep -qF -- '| `parallel 2`, `2` | parallel, capped | at most 2 file-disjoint tickets | 2 |' "$T/${f%%:*}" || { echo "FAIL: $_n has no mode table in ${f%%:*} (F112)"; exit 1; }
      grep -qF "$N/${f#*:}/relay-morpheus/SKILL.md" "$T/${f%%:*}" || { echo "FAIL: $_n not substituted in ${f%%:*}"; exit 1; }
      { grep -qF 'chain dispatch' "$T/${f%%:*}" && grep -qF '.workflow.js' "$T/${f%%:*}" && grep -qF 'Run without the Workflow tool' "$T/${f%%:*}"; } || { echo "FAIL: $_n does not run the plan with this host's delegate in ${f%%:*}"; exit 1; }
      grep -qF 'pending-sentinel' "$T/${f%%:*}" && { echo "FAIL: $_n still points at /pending-sentinel in ${f%%:*}"; exit 1; }
      case "${f%%:*}" in .cursor/*) _o='task' ;; .pi/*|.gemini/skills/*) _o='subagent session' ;; .gemini/commands/*|.config/*) _o='session' ;; *) _o='subagent' ;; esac
      [ "$_n" = gauntlet-run ] && for _w in $_o; do grep -qF -- "--owner $_w" "$T/${f%%:*}" || { echo "FAIL: $_n has no --owner $_w in ${f%%:*}"; exit 1; }; done
      [ "$_n" = gauntlet-run ] && { grep -qF 'RELAY_CHAIN_PARALLEL=' "$T/${f%%:*}" || { echo "FAIL: $_n has no RELAY_CHAIN_PARALLEL= in ${f%%:*}"; exit 1; }; }
      grep -F -- "$_yoda" "$T/${f%%:*}" | grep -qF '.skillator/grayskull.md' || { echo "FAIL: $_n has no grayskull-gated code-yoda line in ${f%%:*}"; exit 1; }
    done
    grep -q "^name: $_n\$" "$T/.gemini/antigravity-cli/skills/$_n/SKILL.md" || { echo "FAIL: agy skill name $_n"; exit 1; }
  done
  grep -qF '{{args}}' "$T/.gemini/commands/list-ticket-zordon.toml" || { echo "FAIL: gemini args"; exit 1; }
  grep -qF '$ARGUMENTS' "$T/.pi/agent/prompts/list-ticket-zordon.md" || { echo "FAIL: pi args"; exit 1; }
  grep -q '^argument-hint: ' "$T/.pi/agent/prompts/list-ticket-zordon.md" || { echo "FAIL: pi argument-hint"; exit 1; }
  grep -q '^description: ' "$T/.cursor/commands/skillator-pending.md" || { echo "FAIL: cursor description"; exit 1; }
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
  # F90: codex runs the commands as skills - <codex home>/skills/<n>/SKILL.md with name and
  # description, no placeholder, and no custom prompt written
  for _n in skillator-pending list-ticket-zordon engage-picard archive-zordon sync-zordon skillator-update team-messages pending-sentinel verify-shifu gauntlet-plan gauntlet-run; do
    _f=$T/.codex/skills/$_n/SKILL.md
    { head -1 "$_f" | grep -qx -- '---' && grep -qx "name: $_n" "$_f" && grep -q '^description: ' "$_f"; } || { echo "FAIL: codex skill $_n frontmatter"; exit 1; }
    grep -qF '{{SKILLS}}' "$_f" && { echo "FAIL: placeholder left in .codex/skills/$_n"; exit 1; }
    [ -e "$T/.codex/prompts/$_n.md" ] && { echo "FAIL: codex prompt $_n.md written"; exit 1; }
  done
  # F105/F171: $skillator-ops - a skill on the skill-command hosts only (codex, agy), the board by its own
  # dest's script, always -Open / --open; no ops command where pi and Claude Code have /ops
  for d in .codex/skills .gemini/config/skills .gemini/skills .gemini/antigravity-cli/skills; do
    _f=$T/$d/skillator-ops/SKILL.md
    [ -f "$_f" ] || { echo "FAIL: missing $d/skillator-ops/SKILL.md"; exit 1; }
    { grep -qx 'name: skillator-ops' "$_f" && grep -q '^description: ' "$_f"; } || { echo "FAIL: skillator-ops skill frontmatter in $d"; exit 1; }
    { grep -qF "\"$N/$d/ops-board/ops/ops.ps1\" -Repo <repo root> -Open" "$_f" && grep -qF "\"$N/$d/ops-board/ops/ops.sh\" <repo root> --open" "$_f" && grep -qF 'ops --open' "$_f"; } || { echo "FAIL: skillator-ops skill not substituted or not --open in $d"; exit 1; }
    grep -qF '{{SKILLS}}' "$_f" && { echo "FAIL: placeholder left in $d/skillator-ops"; exit 1; }
  done
  for f in .cursor/commands/ops.md .gemini/commands/ops.toml .pi/agent/prompts/ops.md .cursor/commands/skillator-ops.md .gemini/commands/skillator-ops.toml .pi/agent/prompts/skillator-ops.md; do
    [ -e "$T/$f" ] && { echo "FAIL: ops command written to $f"; exit 1; }
  done
  # F171: the unique names are the only names - no plain twin is written to any host
  for _n in verify-subagent marathon-plan marathon-run engage archive-tickets list-tickets sync-tickets pending-subagent pending upstream-sync ops; do
    for f in .codex/skills/$_n .gemini/config/skills/$_n .gemini/skills/$_n .gemini/antigravity-cli/skills/$_n \
             .cursor/commands/$_n.md .pi/agent/prompts/$_n.md .gemini/commands/$_n.toml $_oc/commands/$_n.md; do
      [ -e "$T/$f" ] && { echo "FAIL: plain command $_n written to $f"; exit 1; }
    done
  done
  # F159/F171: opencode /skillator-ops command written with --once and --open
  _oc_ops="$T/.config/opencode/commands/skillator-ops.md"
  [ -f "$_oc_ops" ] || { echo "FAIL: missing opencode skillator-ops.md"; exit 1; }
  grep -qF "$N/.config/opencode/skills/ops-board/ops/ops.sh" "$_oc_ops" || { echo "FAIL: opencode ops not substituted"; exit 1; }
  grep -qF -- '--once' "$_oc_ops" || { echo "FAIL: opencode ops has no --once"; exit 1; }
  grep -qF -- '--open' "$_oc_ops" || { echo "FAIL: opencode ops has no --open"; exit 1; }
  grep -q '^name: skillator-pending$' "$T/.gemini/config/skills/skillator-pending/SKILL.md" || { echo "FAIL: agy skill name"; exit 1; }
  grep -q '^name: list-ticket-zordon$' "$T/.gemini/skills/list-ticket-zordon/SKILL.md" || { echo "FAIL: agy skill name"; exit 1; }
  for f in .gemini/commands .cursor/commands .pi/agent/prompts \
           .gemini/config/skills/skillator-pending .gemini/config/skills/list-ticket-zordon .gemini/skills/skillator-pending .gemini/skills/list-ticket-zordon \
           .gemini/antigravity-cli/skills/skillator-pending .gemini/antigravity-cli/skills/engage-picard; do
    grep -rqF '{{SKILLS}}' "$T/$f" && { echo "FAIL: placeholder left in $f"; exit 1; }
  done
  for d in .codex/skills .gemini/config/skills .gemini/skills .gemini/antigravity-cli/skills; do
    grep -qxE 'skillator-pending|list-ticket-zordon|engage-picard|archive-zordon|sync-zordon|skillator-update|team-messages|pending-sentinel|verify-shifu|gauntlet-plan|gauntlet-run|skillator-ops' "$T/$d/.skillator-installed" && { echo "FAIL: command skill in manifest $d"; exit 1; }
    [ -e "$T/$d/skillator-pending/.skillator-owned" ] && { echo "FAIL: command skill carries an ownership marker in $d"; exit 1; }
  done
  [ -x "$T/.local/bin/ops" ] || { echo "FAIL: missing .local/bin/ops"; exit 1; }
  grep -q "exec sh \"$T/.cursor/skills/ops-board/ops/ops.sh\"" "$T/.local/bin/ops" || { echo "FAIL: shim target (first dest: cursor, since claude-code has no plugin here)"; exit 1; }
  # F89: Windows - the ops tab's Windows Terminal profile, a fragment under LOCALAPPDATA; elsewhere none
  _frag="$T/lad/Microsoft/Windows Terminal/Fragments/skillator/ops.json"
  if command -v cygpath >/dev/null 2>&1; then
    cmp -s "$root/mods/ops-board/ops/wt-fragment.json" "$_frag" || { echo "FAIL: Windows Terminal fragment"; exit 1; }
    grep -qF '"name": "skillator ops"' "$_frag" || { echo "FAIL: fragment profile name"; exit 1; }
    # F102: the font size the user picks, written and kept across runs; 11 = the shipped bytes
    # (no IDE for these runs, so the ide-calls count below still sees two installs)
    check_font_json() {
      node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); if(j.profiles[0].font.size!==Number(process.argv[2])) process.exit(1)' "$(cygpath -w "$_frag")" "$1" || { echo "FAIL: font JSON $1"; exit 1; }
    }
    for _font in 06 09 072 00000000000000000000000000009; do
      sh "$root/mods/ops-board/ops/ops.sh" --font-size "$_font" >/dev/null
      check_font_json "$_font"
      write_font_fragment "$_frag" "$_font"
      check_font_json "$_font"
    done
    for _font in 000 05 073 9999999999999999999999999999; do
      _rc=0; sh "$root/mods/ops-board/ops/ops.sh" --font-size "$_font" >/dev/null 2>&1 || _rc=$?
      [ "$_rc" = 2 ] || { echo "FAIL: ops accepted font $_font"; exit 1; }
      _rc=0; HOME=$T CODEX_HOME=$T/.codex SKILLATOR_AGY_IDE=$T/none sh "$0" --ops-font-size "$_font" >/dev/null 2>&1 || _rc=$?
      [ "$_rc" = 2 ] || { echo "FAIL: installer accepted font $_font"; exit 1; }
      check_font_json 9
    done
    for _font in 09 72 073; do
      sed "s/\"size\": [0-9]*/\"size\": $_font/" "$root/mods/ops-board/ops/wt-fragment.json" > "$_frag"
      write_font_fragment "$_frag" ''
      case $_font in 073) check_font_json 11 ;; *) check_font_json "$_font" ;; esac
    done
    write_font_fragment "$_frag" 9
    grep -qF '"size": 9' "$_frag" || { echo "FAIL: font size 9 not written"; exit 1; }
    write_font_fragment "$_frag" ''
    grep -qF '"size": 9' "$_frag" || { echo "FAIL: font size reset by a plain run"; exit 1; }
    _rc=0; HOME=$T CODEX_HOME=$T/.codex SKILLATOR_AGY_IDE=$T/none sh "$0" --ops-font-size 3 >/dev/null 2>&1 || _rc=$?
    { [ "$_rc" = 2 ] && grep -qF '"size": 9' "$_frag"; } || { echo "FAIL: font size 3 accepted"; exit 1; }
    write_font_fragment "$_frag" 11
    cmp -s "$root/mods/ops-board/ops/wt-fragment.json" "$_frag" || { echo "FAIL: font size 11 is not the shipped fragment"; exit 1; }
  else
    [ -e "$T/lad" ] && { echo "FAIL: Windows Terminal fragment written off Windows"; exit 1; }
  fi
  # second run: command files are rewritten, installed skills are not, the
  # skill-commands survive the prune and lose a stale marker an older run left
  echo stale >> "$T/.codex/skills/skillator-pending/SKILL.md"
  echo stale >> "$T/.pi/agent/extensions/skillator-ops.ts"
  echo stale >> "$T/.gemini/skills/skillator-pending/SKILL.md"
  : > "$T/.gemini/skills/list-ticket-zordon/.skillator-owned"
  : > "$T/.pi/agent/skills/tickets-zordon/.selftest-sentinel"
  printf 'my-own-line' >> "$T/.pi/agent/skills/.ignore"
  # F91: a --link install from before plugin/ - its link into <clone>/skills now dangles
  rm -rf "$T/.codex/skills/tui-tron"; ln -s "$T/pre-f91/skills/tui-tron" "$T/.codex/skills/tui-tron" 2>/dev/null || :
  # A218/F90: what older runs wrote under a retired name is retired - a loose file renamed
  # to .skillator-retired (recoverable), a skill dir removed only with an intact marker and
  # nothing else in it - only when the body is skillator's, never through a link, and the
  # dry run names exactly the actions the real run takes
  _body() {
    case $1 in
      engage) echo 'Show it once, under `**Engaged prompt:**`' ;;
      ops) echo 'sh "/x/ops-board/ops/ops.sh" <repo root> --open' ;;
      skillator-update) echo 'cat /x/.skillator-source' ;;
      team-messages) echo 'node /x/teams-uhura/scripts/team.mjs inbox' ;;
      *) echo 'Load /x/tickets-zordon/SKILL.md' ;;
    esac
  }
  _seed() { mkdir -p "$T/${1%/*}"; _body "$2" > "$T/$1"; }
  _wants=
  _want() { _wants="$_wants$1
"; }
  _ret() { _want "        retired $T/$1 -> $T/$1.skillator-retired (delete it if unused)"; }
  # pi's prompts dir behind a link: nothing in it is touched
  mv "$T/.pi/agent/prompts" "$T/pi-prompts"
  if command -v cygpath >/dev/null 2>&1; then
    powershell -NoProfile -Command "New-Item -ItemType Junction -Path '$(cygpath -w "$T/.pi/agent/prompts")' -Target '$(cygpath -w "$T/pi-prompts")' | Out-Null"
  else
    ln -s "$T/pi-prompts" "$T/.pi/agent/prompts"
  fi
  [ -L "$T/.pi/agent/prompts" ] || { echo "FAIL: selftest could not link the pi prompts dir"; exit 1; }
  mkdir -p "$T/.codex/prompts"; echo mine > "$T/.codex/prompts/my-own.md"; echo mine > "$T/.cursor/commands/my-cmd.md"
  for _n in $retired_cmds skillator-update team-messages; do _seed ".codex/prompts/$_n.md" $_n; _ret ".codex/prompts/$_n.md"; done
  for _n in $retired_cmds upstream-sync ops; do
    for d in .codex/skills .gemini/config/skills .gemini/skills .gemini/antigravity-cli/skills; do
      _seed "$d/$_n/SKILL.md" $_n
      case $d/$_n in
        .gemini/config/skills/sync-tickets) write_owned "$T/$d/$_n" "$T/$d/$_n"; _want "        removed dir $T/$d/$_n" ;;
        .codex/skills/engage) echo mine > "$T/$d/$_n/notes.txt"; _want "        kept $T/$d/$_n: holds files skillator did not write" ;;
        *) _ret "$d/$_n/SKILL.md" ;;
      esac
    done
    _seed "$_oc/commands/$_n.md" $_n
    if [ $_n = marathon-plan ]; then
      echo older > "$T/$_oc/commands/$_n.md.skillator-retired"
      _want "        kept $T/$_oc/commands/$_n.md: $T/$_oc/commands/$_n.md.skillator-retired exists"
    else
      _ret "$_oc/commands/$_n.md"
    fi
    [ $_n = ops ] && continue
    _seed ".cursor/commands/$_n.md" $_n; _ret ".cursor/commands/$_n.md"
    if [ $_n = list-tickets ]; then
      echo 'my own list' > "$T/.gemini/commands/$_n.toml"; _want "        kept $T/.gemini/commands/$_n.toml: not written by skillator"
    else
      _seed ".gemini/commands/$_n.toml" $_n; _ret ".gemini/commands/$_n.toml"
    fi
    _seed ".pi/agent/prompts/$_n.md" $_n; _want "        kept $T/.pi/agent/prompts/$_n.md: a link or under one"
  done
  # a user's own file under a retired name: with a skillator mention it is renamed, not lost
  echo 'my notes: run skillator:tickets-zordon, then deploy' > "$T/.cursor/commands/pending.md"
  _acts() {
    grep -E '^        (would retire|retired|would remove dir|removed dir|kept /)' |
      sed -e 's/^        would retire /        retired /' -e 's/^        would remove dir /        removed dir /' -e 's/ (delete it if unused)$//'
  }
  out=$(HOME=$T CODEX_HOME=$T/.codex sh "$0" --dry-run) || { echo "FAIL: retired dry run exited $?"; exit 1; }
  _dry=$(printf '%s\n' "$out" | _acts)
  { [ -f "$T/.cursor/commands/engage.md" ] && [ ! -e "$T/.cursor/commands/engage.md.skillator-retired" ] && [ -d "$T/.gemini/config/skills/sync-tickets" ]; } || { echo "FAIL: dry run touched a retired command"; exit 1; }
  out=$(HOME=$T CODEX_HOME=$T/.codex sh "$0") || { echo "FAIL: second install exited $?"; exit 1; }
  [ -n "$_dry" ] && [ "$(printf '%s\n' "$out" | _acts)" = "$_dry" ] || { echo "FAIL: dry run actions differ from the real run"; exit 1; }
  printf '%s\n' "$_wants" | while IFS= read -r _w; do
    [ -n "$_w" ] || continue
    printf '%s\n' "$out" | grep -qxF -- "$_w" || { echo "FAIL: not done: $_w"; exit 1; }
    case $_w in "        retired "*)
      _a=${_w#        retired }; _a=${_a%% -> *}
      { [ ! -e "$_a" ] && [ -f "$_a.skillator-retired" ]; } || { echo "FAIL: $_a not retired"; exit 1; } ;;
    esac
  done || exit 1
  grep -qx 'my notes: run skillator:tickets-zordon, then deploy' "$T/.cursor/commands/pending.md.skillator-retired" || { echo "FAIL: a user's renamed pending.md not recoverable"; exit 1; }
  grep -qx 'my own list' "$T/.gemini/commands/list-tickets.toml" || { echo "FAIL: a user's own list-tickets.toml touched"; exit 1; }
  { [ -f "$T/.codex/skills/engage/SKILL.md" ] && [ -f "$T/.codex/skills/engage/notes.txt" ]; } || { echo "FAIL: a skill dir with a user file touched"; exit 1; }
  [ -e "$T/.gemini/config/skills/sync-tickets" ] && { echo "FAIL: an intact owned skill dir kept"; exit 1; }
  { [ -f "$T/$_oc/commands/marathon-plan.md" ] && grep -qx older "$T/$_oc/commands/marathon-plan.md.skillator-retired"; } || { echo "FAIL: an existing .skillator-retired overwritten"; exit 1; }
  for _n in $retired_cmds upstream-sync; do [ -f "$T/pi-prompts/$_n.md" ] || { echo "FAIL: $_n.md under a linked dir touched"; exit 1; }; done
  { [ -f "$T/.cursor/commands/my-cmd.md" ] && [ -f "$T/.codex/prompts/my-own.md" ]; } || { echo "FAIL: a user command of another name touched"; exit 1; }
  # A225: retire never overwrites: refused mv, moved-but-mismatched target, dropped -n, and failing cksum
  echo 'Load /x/tickets-zordon/SKILL.md' > "$T/mv-refused.md"
  _o=$(HOME=$T; dry=; mv() { :; }; retire_file "$T/mv-refused.md")
  { [ "$_o" = "warn  $T/mv-refused.md not retired (kept)" ] && [ -f "$T/mv-refused.md" ]; } || { echo "FAIL: a refused rename not kept: $_o"; exit 1; }
  echo 'Load /x/tickets-zordon/SKILL.md' > "$T/mv-mismatch.md"
  _o=$(HOME=$T; dry=; mv() { rm -f "$3"; echo 'corrupted' > "$4"; }; retire_file "$T/mv-mismatch.md")
  { [ "$_o" = "warn  $T/mv-mismatch.md.skillator-retired mismatched" ] && [ ! -f "$T/mv-mismatch.md" ] && [ -f "$T/mv-mismatch.md.skillator-retired" ]; } || { echo "FAIL: a moved-but-mismatched target not warned: $_o"; exit 1; }
  echo 'Load /x/tickets-zordon/SKILL.md' > "$T/mv-dropped-n.md"
  _o=$(HOME=$T; dry=; mv() { case " $* " in *" -n "*) :;; *) echo "dropped -n";; esac; }; retire_file "$T/mv-dropped-n.md")
  [ "$_o" != "dropped -n" ] || { echo "FAIL: retire_file dropped -n on mv"; exit 1; }
  echo 'Load /x/tickets-zordon/SKILL.md' > "$T/cksum-fail.md"
  _o=$(HOME=$T; dry=; cksum() { return 1; }; retire_file "$T/cksum-fail.md")
  _ec=$?
  { [ "$_ec" = 0 ] && [ "$_o" = "warn  $T/cksum-fail.md not retired (kept)" ] && [ -f "$T/cksum-fail.md" ]; } || { echo "FAIL: failing cksum did not keep file or aborted install: $_o (exit $_ec)"; exit 1; }
  [ -f "$T/.codex/skills/tui-tron/SKILL.md" ] || { echo "FAIL: dangling pre-F91 link not reinstalled"; exit 1; }
  grep -qx 'my-own-line' "$T/.pi/agent/skills/.ignore" || { echo "FAIL: pi .ignore lost a user line"; exit 1; }
  [ "$(grep -cxF /PLATFORMS.md "$T/.pi/agent/skills/.ignore")" = 1 ] || { echo "FAIL: pi .ignore lines duplicated on the second run"; exit 1; }
  printf '%s\n' "$out" | grep -q "not on your PATH" || { echo "FAIL: PATH note"; exit 1; }
  printf '%s\n' "$out" | grep -qF 'Codex: $skillator-ops opens the board' || { echo "FAIL: install summary has no Codex \$skillator-ops line (F105)"; exit 1; }
  if command -v cygpath >/dev/null 2>&1; then
    printf '%s\n' "$out" | grep -qF "remove: rm -r \"$(cygpath -u "$T/lad")/Microsoft/Windows Terminal/Fragments/skillator\"" || { echo "FAIL: fragment remove line"; exit 1; }
  fi
  grep -q stale "$T/.codex/skills/skillator-pending/SKILL.md" && { echo "FAIL: codex skill-command not rewritten"; exit 1; }
  grep -q stale "$T/.pi/agent/extensions/skillator-ops.ts" && { echo "FAIL: pi extension not rewritten"; exit 1; }
  [ "$(wc -l < "$T/ide-calls" | tr -d ' ')" = 2 ] || { echo "FAIL: antigravity extension not reinstalled on the second run"; exit 1; }
  [ -f "$T/.gemini/skills/skillator-pending/SKILL.md" ] || { echo "FAIL: agy skill-command pruned"; exit 1; }
  grep -q stale "$T/.gemini/skills/skillator-pending/SKILL.md" && { echo "FAIL: agy skill-command not rewritten"; exit 1; }
  [ -e "$T/.gemini/skills/list-ticket-zordon/.skillator-owned" ] && { echo "FAIL: stale marker kept on a skill-command"; exit 1; }
  [ -f "$T/.pi/agent/skills/tickets-zordon/.selftest-sentinel" ] || { echo "FAIL: installed skill was rewritten"; exit 1; }
  # A224: a current command file behind a link, and an antigravity skill dir behind a
  # link holding its marker: the run writes neither file and deletes no marker through
  # the link, and says kept for each (no IDE call - the count above stays two)
  mkdir -p "$T/link-outside/skill"
  printf 'user command bytes\n' > "$T/link-outside/cmd.md"
  rm -f "$T/.cursor/commands/skillator-update.md"
  if command -v cygpath >/dev/null 2>&1; then
    MSYS=winsymlinks:nativestrict ln -s "$T/link-outside/cmd.md" "$T/.cursor/commands/skillator-update.md"
  else
    ln -s "$T/link-outside/cmd.md" "$T/.cursor/commands/skillator-update.md"
  fi
  [ -L "$T/.cursor/commands/skillator-update.md" ] || { echo "FAIL: selftest could not link a command file"; exit 1; }
  printf 'user skill bytes\n' > "$T/link-outside/skill/SKILL.md"
  printf 'skillator-owned 2\n' > "$T/link-outside/skill/.skillator-owned"
  rm -rf "$T/.gemini/skills/skillator-update"
  if command -v cygpath >/dev/null 2>&1; then
    powershell -NoProfile -Command "New-Item -ItemType Junction -Path '$(cygpath -w "$T/.gemini/skills/skillator-update")' -Target '$(cygpath -w "$T/link-outside/skill")' | Out-Null"
  else
    ln -s "$T/link-outside/skill" "$T/.gemini/skills/skillator-update"
  fi
  [ -L "$T/.gemini/skills/skillator-update" ] || { echo "FAIL: selftest could not link a skill dir"; exit 1; }
  out=$(HOME=$T CODEX_HOME=$T/.codex SKILLATOR_AGY_IDE=$T/none sh "$0") || { echo "FAIL: linked install exited $?"; exit 1; }
  grep -qx 'user command bytes' "$T/link-outside/cmd.md" || { echo "FAIL: a linked command file was overwritten"; exit 1; }
  grep -qx 'user skill bytes' "$T/link-outside/skill/SKILL.md" || { echo "FAIL: a linked skill was overwritten"; exit 1; }
  [ -f "$T/link-outside/skill/.skillator-owned" ] || { echo "FAIL: a marker was deleted through a linked skill dir"; exit 1; }
  for _k in ".cursor/commands/skillator-update.md" ".gemini/skills/skillator-update/SKILL.md" ".gemini/skills/skillator-update/.skillator-owned"; do
    printf '%s\n' "$out" | grep -qxF "        kept $T/$_k: a link or under one" || { echo "FAIL: no kept line for $_k"; exit 1; }
  done
  out=$(HOME=$T CODEX_HOME=$T/.codex sh "$0" --dry-run) || { echo "FAIL: dry run exited $?"; exit 1; }
  printf '%s\n' "$out" | grep -q "would write $T/.local/bin/ops" || { echo "FAIL: dry-run shim line"; exit 1; }
  if command -v cygpath >/dev/null 2>&1; then
    printf '%s\n' "$out" | grep -qF "would write $(cygpath -u "$T/lad")/Microsoft/Windows Terminal/Fragments/skillator/ops.json" || { echo "FAIL: dry-run fragment line"; exit 1; }
  fi
  printf '%s\n' "$out" | grep -qF "kept $T/.pi/agent/prompts/list-ticket-zordon.md: a link or under one" || { echo "FAIL: dry-run command line"; exit 1; }
  printf '%s\n' "$out" | grep -qF "would write $T/.pi/agent/extensions/skillator-ops.ts" || { echo "FAIL: dry-run pi extension line"; exit 1; }
  printf '%s\n' "$out" | grep -qF "would install the ops board extension $T/.gemini/config/skills/ops-board/antigravity/skillator-ops.vsix with $T/fake-ide" || { echo "FAIL: dry-run antigravity extension line"; exit 1; }
  [ "$(wc -l < "$T/ide-calls" | tr -d ' ')" = 2 ] || { echo "FAIL: dry run called the Antigravity IDE"; exit 1; }
  out=$(HOME=$T CODEX_HOME=$T/.codex SKILLATOR_AGY_IDE=$T/none sh "$0" --dry-run) || { echo "FAIL: no-IDE dry run exited $?"; exit 1; }
  printf '%s\n' "$out" | grep -qF "skip  the Antigravity IDE ops board (no antigravity-ide CLI found)" || { echo "FAIL: no-IDE skip line"; exit 1; }
  printf '%s\n' "$out" | grep -qF "would write $T/.gemini/config/skills/skillator-pending/SKILL.md" || { echo "FAIL: dry-run skill-command line"; exit 1; }
  printf '%s\n' "$out" | grep -qF "would write $T/.gemini/antigravity-cli/skills/skillator-pending/SKILL.md" || { echo "FAIL: dry-run agy-cli skill-command line"; exit 1; }
  printf '%s\n' "$out" | grep -qF "would write $T/.config/opencode/commands/team-messages.md" || { echo "FAIL: dry-run opencode command line"; exit 1; }
  printf '%s\n' "$out" | grep -qF "ops   sh $T/.config/opencode/skills/ops-board/ops/ops.sh <repo>" || { echo "FAIL: opencode ops launch line"; exit 1; }
  # F67: XDG_CONFIG_HOME moves opencode's dir, as it does for opencode itself
  mkdir -p "$T/xdg/opencode"
  out=$(HOME=$T CODEX_HOME=$T/.codex XDG_CONFIG_HOME=$T/xdg sh "$0" --dry-run) || { echo "FAIL: XDG dry run exited $?"; exit 1; }
  printf '%s\n' "$out" | grep -qF "would write $T/xdg/opencode/commands/skillator-pending.md" || { echo "FAIL: opencode under XDG_CONFIG_HOME"; exit 1; }
  # B13: the ops shim path cannot be written (a directory where the file goes): one
  # warning, the rest still runs, exit 0
  rm -f "$T/.local/bin/ops"; mkdir -p "$T/.local/bin/ops"; rm -rf "$T/lad"
  out=$(HOME=$T CODEX_HOME=$T/.codex sh "$0" 2>&1) || { echo "FAIL: unwritable shim install exited $?"; exit 1; }
  printf '%s\n' "$out" | grep -qF "warn  ops shim not written: cannot write $T/.local/bin/ops" || { echo "FAIL: unwritable shim warning line"; exit 1; }
  if command -v cygpath >/dev/null 2>&1; then
    [ -f "$_frag" ] || { echo "FAIL: Windows Terminal fragment not written after an unwritable shim"; exit 1; }
  fi
  rmdir "$T/.local/bin/ops"
  # the plugin installed: the shim still runs the first dest written (refreshed every
  # run), never the versioned plugin cache a plugin update can remove
  P=$T/p
  mkdir -p "$P/.cursor" "$P/.claude/plugins/cache/skillator" "$P/pc/mods/ops-board/ops"
  : > "$P/pc/mods/ops-board/ops/ops.sh"
  printf '{\n  "plugins": {\n    "skillator@skillator": [\n      {\n        "installPath": "%s"\n      }\n    ]\n  }\n}\n' "$P/pc" > "$P/.claude/plugins/installed_plugins.json"
  HOME=$P CODEX_HOME=$P/.codex sh "$0" --ops-font-size 09 >/dev/null || { echo "FAIL: plugin install exited $?"; exit 1; }
  grep -q "exec sh \"$P/.cursor/skills/ops-board/ops/ops.sh\"" "$P/.local/bin/ops" || { echo "FAIL: shim target with the plugin installed (first dest written, not the plugin cache)"; exit 1; }
  if command -v cygpath >/dev/null 2>&1; then check_font_json 9; fi
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

# F134: Muse Code CLI plugin install/update
put_muse

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
if grep -qxF "$codex_home/skills" "$tmpdests"; then echo 'ops   Codex: $skillator-ops opens the board'; fi
if [ -n "$shim_src" ]; then
  if [ -n "$dry" ]; then
    echo "        would write $HOME/.local/bin/ops -> $shim_src/ops.sh"
  # B13: a shim path that cannot be written skips this step only - the rest still runs
  elif ! { mkdir -p "$HOME/.local/bin" && printf '#!/usr/bin/env sh\nexec sh "%s/ops.sh" "$@"\n' "$shim_src" > "$HOME/.local/bin/ops" && chmod 755 "$HOME/.local/bin/ops"; } 2>/dev/null; then
    echo "warn  ops shim not written: cannot write $HOME/.local/bin/ops; run the launch line above instead"
  else
    echo "ops   $HOME/.local/bin/ops -> $shim_src/ops.sh"
    [ -s "$tmpdests" ] || echo "      the plugin's copy (no skills dir written) - run this again after a plugin update"
    echo "      remove: rm $HOME/.local/bin/ops"
    case ":$PATH:" in
      *":$HOME/.local/bin:"*) ;;
      *) echo "      $HOME/.local/bin is not on your PATH - add it, or run the launch line above" ;;
    esac
  fi
fi
# F89: Windows (Git Bash) - the Windows Terminal profile the ops tab opens in (`ops --open`):
# a fragment, read when Windows Terminal starts. Rewritten every run.
if [ -n "$shim_src" ] && [ -n "${LOCALAPPDATA:-}" ] && command -v cygpath >/dev/null 2>&1; then
  _wt="$(cygpath -u "$LOCALAPPDATA")/Microsoft/Windows Terminal/Fragments/skillator"
  if [ -n "$dry" ]; then
    echo "        would write $_wt/ops.json"
  else
    mkdir -p "$_wt"
    # F102: --ops-font-size, else the size an earlier run wrote, else the shipped 11
    write_font_fragment "$_wt/ops.json" "$font"
    _note=""; [ "$_size" = 11 ] || _note=" (font $_size)"
    echo "ops   Windows Terminal profile 'skillator ops' -> $_wt/ops.json$_note"
    echo "      remove: rm -r \"$_wt\""
  fi
fi
