grade: architectural · critical yes (install contract other hosts depend on) · design - (spec in prompt, written by me) · build here · verify claude plugin validate/selftests · ceremony lean · mode single (ruled: headless stage implementer) · usage unobservable

# PLAN - the plugin in a subfolder (F91)

GOAL: move the plugin payload into `plugin/` so a Muse catalog at the repo root can
hash the plugin folder without hashing itself (B11), with every host's install and
every existing install still working, no manual step.

## What moves into `plugin/`

Everything a host receives - the payload is what the Claude Code plugin cache holds
today and what the installers copy:

- `.claude-plugin/plugin.json`, `.muse-plugin/` (plugin.json and the unprobed
  marketplace.json - see Rulings)
- `skills/`, `commands/`, `hooks/`, `mods/`, `host-commands/`, `references/`, `practice/`
- `PLATFORMS.md`, `PRACTICE.md`, `WORKFLOW.md`
- `install.sh`, `install.ps1` (the real installers)

All of these reference each other by relative path (`../../practice`,
`../../references`, `$root/skills`, `up(plugin.root, 2) + '/skills'`, ...). Moving them
together keeps every one of those paths true, so no code inside the payload changes.

## What stays at the repo root

`TICKETS.md`, `TICKETS-archive.md`, `.skillator/`, `docs/`, `README.md`, `LICENSE`,
`AGENTS.md` / `CLAUDE.md` / `GEMINI.md` / `CASEFILE.md` (this repo's own working
instructions), `.gitattributes`, `.gitignore`, `.screenshot-dir`, the Claude catalog
`.claude-plugin/marketplace.json`, and two one-line shims `install.sh` / `install.ps1`
that forward to `plugin/install.*` with the same arguments.

## How each host installs, and how an existing install migrates

| Host | New install | Existing install, on `/skillator-update` |
|---|---|---|
| Claude Code | `/plugin marketplace add bodish-coder/skillator` + `/plugin install skillator` - unchanged; the catalog's skillator entry is now `"source": "./plugin"` (like ops-board's, now `./plugin/mods/ops-board`) | `claude plugin marketplace update` pulls the new catalog, `claude plugin update` installs from `./plugin`. The cache path is unchanged (`plugins/cache/<marketplace>/<plugin>/<version>/`, named by plugin and version, not by source); its content is the subfolder, laid out as before (`skills/`, `mods/`, `install.sh`, ...), so ops-board's `installPath + /skills` lookup still holds |
| Codex, Cursor, Gemini, Antigravity, pi, opencode | `sh install.sh` / `.\install.ps1` from a clone (root shim) or from the plugin cache | The command re-runs the installer from its source: the Claude Code `installPath` (holds `install.sh` again) or the `.skillator-source` pointer. An old pointer names the clone root, where the shims still answer; the run rewrites the pointer to `<clone>/plugin`. Copies refresh as before |
| `--link` installs | links point into `<clone>/plugin/skills` | Old links into `<clone>/skills/<name>` dangle after the pull. `install.ps1` already treats them as missing and reinstalls; `install.sh` skipped every link - it now skips only a live one, so a dangling link is reinstalled too |
| Muse | `muse plugins install <clone>/plugin` | `source.path` is the clone root, which no longer holds `.muse-plugin/plugin.json`: step 4 of `/skillator-update` pulls it and, when `<dir>/plugin/.muse-plugin/plugin.json` is there instead, runs `muse plugins install <dir>/plugin` in place of `update` |

`/skillator-update` step 5 reads the new version from `<src>/.claude-plugin/plugin.json`,
or `<src>/plugin/.claude-plugin/plugin.json` when `<src>` is a clone root.

## Path updates outside the payload's own relative paths

- `.claude-plugin/marketplace.json`: skillator `./plugin`, ops-board `./plugin/mods/ops-board`.
- `practice/scripts/check-grayskull-sync.sh`: the live copy is `../.skillator/grayskull.md`
  from the plugin root (the one payload script that reads this repo's own files).
- `.gitignore` - no payload paths in it; unchanged.
- Docs that name paths: README (install rows, Muse row), PLATFORMS.md (Muse section),
  `commands/skillator-update.md` and its five `host-commands/*` copies (steps 4, 5).
- Developers who set `SKILLATOR_ROOT=<clone>` for the ops board now set
  `SKILLATOR_ROOT=<clone>/plugin`.

## Rulings

- Ruling: subfolder name `plugin/` - plain, says what it is - cost if wrong: one more
  `git mv` and the same path edits.
- Ruling: `practice/` moves, though the stage prompt lists it among what stays - the
  skills run `practice/scripts/{next-id,board-fresh,check-tickets,upstream-check}` and
  PRACTICE.md links `practice/*.md` at runtime from the plugin cache, and the installers
  copy `practice/` to every host; at the root it would be missing from every install.
  The ticket's own text also moves "what they reference". Baselines go with it so no
  relative path changes (the cache carries them today too) - cost if wrong: a split
  later, baselines back to the root.
- Ruling: `install.sh` / `install.ps1` move and the root keeps forwarding shims -
  `/skillator-update` step 2b runs the installer from the Claude Code `installPath`, so it
  must be in the payload; the shims keep `./install.sh` (README) and every pre-F91
  `.skillator-source` pointer working - cost if wrong: two tiny files to delete later.
- Ruling: `.muse-plugin/marketplace.json` moves with `.muse-plugin/` - Muse never probes
  it (B10), `check-muse-manifest.sh` reads it beside `plugin.json`, and B11 replaces it
  with a probed catalog at the root (`marketplace.json` or `.agents/plugins/`) - cost if
  wrong: B11 deletes one file.
- Ruling: `LICENSE` stays at the root, where GitHub detects it - cost if wrong: the
  plugin cache has no LICENSE copy (it is named in plugin.json).
- Ruling: no version bump here - the push bumps it (standing rule), and the scratch
  update test bumps its own clone.

## VERIFICATION

`claude plugin validate <wt>` and `<wt>/plugin`; `sh <wt>/install.sh --selftest`;
`install.ps1 -SelfTest`; `sh <wt>/plugin/practice/scripts/check-muse-manifest.sh`;
`claude plugin test <wt>/plugin/mods/ops-board`; a scratch `CLAUDE_CONFIG_DIR` install
from a clone (marketplace add + install, then an update from the pre-F91 layout) showing
the skills; a scratch Muse profile install from `<clone>/plugin`, and the migration
reinstall from a pre-F91 install.
