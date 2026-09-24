#!/usr/bin/env sh
# Install skillator skills into the global skills dir of every agent CLI found.
# Skips any skill a CLI already has (including Claude Code's plugin install).
#   ./install.sh            install what's missing
#   ./install.sh --dry-run  show what it would do
#   ./install.sh --force    refresh skills that are already installed
#   ./install.sh --link     install as symlinks into this repo (stay live on git pull)
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
  if [ -n "$dry" ]; then
    echo "        would refresh PLATFORMS.md PRACTICE.md WORKFLOW.md practice/ references/ in $_dest"
  else
    mkdir -p "$_dest"
    cp "$root/PLATFORMS.md" "$root/PRACTICE.md" "$root/WORKFLOW.md" "$_dest/"
    rm -rf "$_dest/practice" && cp -R "$root/practice" "$_dest/"
    rm -rf "$_dest/references" && cp -R "$root/references" "$_dest/"
    printf '%s\n' "$shipped" > "$_dest/$manifest"
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
    prune_dest "$dest"
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
