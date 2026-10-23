# Install skillator skills into the global skills dir of every agent CLI found.
# Skips any skill a CLI already has (including Claude Code's plugin install).
#   .\install.ps1            install what's missing
#   .\install.ps1 -DryRun    show what it would do
#   .\install.ps1 -Force     refresh skills that are already installed
#   .\install.ps1 -Link      install as symlinks into this repo (stay live on git pull)
#   .\install.ps1 -SelfTest  install into a temp HOME and profile, check what was written; prints ok
#   -Profile <path>          the profile that gets `function ops` (default: your
#                            CurrentUserAllHosts profile) - there so a test never
#                            touches the real one
# F54: /pending, /list-tickets, /engage, /archive-tickets and /sync-tickets are written as each host's own command file (codex
# prompts, Gemini CLI commands, cursor commands, pi prompt templates, Antigravity
# skill-commands) from host-commands\<host>\, rewritten every run - see Write-Commands.
# Claude Code is left to its plugin install whenever one exists, -Force included.
# Skills already symlinked to this repo are left alone - they are always current.
param([switch]$DryRun, [switch]$Force, [switch]$Link, [switch]$SelfTest,
      [string]$Profile = $PROFILE.CurrentUserAllHosts)

$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot 'skills'
$selfPath = $PSCommandPath

$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { "$HOME\.codex" }

# host -> marker dir proving the CLI is installed + the global skills dir(s) to fill.
# A73: no row for the shared ~/.agents/skills dir - every host that reads it also
# reads its own dir filled here, so it only registered each skill twice (codex does
# not dedupe; Gemini CLI lets the shared copy win). See install.sh for the measurements.
$targets = [ordered]@{
  # keep in sync with install.sh, which carries the reasoning for each path.
  'claude-code' = @{ Marker = "$HOME\.claude"; Dests = @("$HOME\.claude\skills") }
  'cursor'      = @{ Marker = "$HOME\.cursor"; Dests = @("$HOME\.cursor\skills") }
  'codex'       = @{ Marker = $codexHome;       Dests = @("$codexHome\skills") }
  'antigravity' = @{ Marker = "$HOME\.gemini"; Dests = @("$HOME\.gemini\config\skills", "$HOME\.gemini\skills", "$HOME\.gemini\antigravity-cli\skills") }
  'pi'          = @{ Marker = "$HOME\.pi";     Dests = @("$HOME\.pi\agent\skills", "$HOME\.pi\skills") }
}

# Claude Code can also have them via the plugin marketplace - that counts as installed.
$pluginDirs = @(Get-ChildItem "$HOME\.claude\plugins" -Recurse -Depth 3 -Directory `
                  -Filter 'skillator' -ErrorAction SilentlyContinue)

$skills = @(Get-ChildItem $src -Directory)
# Ordinal sort, the order install.sh uses under any locale - so the manifest is the
# same bytes and the output lines come in the same order.
[string[]]$shipped = @($skills | ForEach-Object { $_.Name })
[IO.DirectoryInfo[]]$skillArr = $skills
[Array]::Sort($shipped, $skillArr, [StringComparer]::Ordinal)
$skills = @($skillArr)

# A96: a skill dir this script copies gets an ownership marker (.skillator-owned), and
# each skills dir a manifest (.skillator-installed). The marker records the SKILL.md
# hash and every file placed; the next run removes a folder the manifest lists that the
# repo no longer ships only if it is still exactly that (or is a link into this repo). A dir with no manifest yet loses only a legacy name whose
# SKILL.md is byte-for-byte a version this repo once shipped. See install.sh.
$manifest = '.skillator-installed'
$owned = '.skillator-owned'
# Every name this repo shipped and has since dropped - keep in sync with install.sh.
$legacy = @('a11y-proof','brainstorm-build-lite','brainstorm-build-mid','brainstorm-build-prime',
  'deploy-wizard','func-ui','handoff','handoff-resume','handoff-watch','live-build','merge-prep',
  'merge-agent','r2d2-relay','replicator-agent','screenshot-loop','sherlock-codes','spec-trace',
  'ticket-master','tui-proof','relay','dev-alfred','ticket-checker','skillator-brainstorm-build',
  'skillator-brainstorm-build-lite','skillator-brainstorm-build-mid',
  'skillator-brainstorm-build-prime','skillator-deploy-wizard','skillator-design-arwen',
  'skillator-func-ui','skillator-handoff','skillator-handoff-resume','skillator-merge-agent',
  'skillator-merge-prep')
# first 16 hex of sha256 (CRs stripped) of every committed version of every legacy SKILL.md
$legacyHashes = @(
  '0009e598c9887d2e','0327c5edb2681ae4','08b432f4c65c6135','0bedc2fa45a45931','0cb23bc0b96941a1','0ea43dea3c62ec7d',
  '0ecac5c2a0a3e71f','1107311baf373879','112d37f54dd83705','12acc44be0dc0153','1319e84408b0646d','15f537bf3b456993',
  '161d9927d9d69785','1b18effb2fa1982a','1e1c6b7b884a65e2','1e5762879ac88933','222687335a01c6fb','2244a525c048db19',
  '230ceb1aef744128','264e7c4f9886f1b2','274a48ec314681c0','27f9be5222bd411e','2ceae32c8ea1b722','2fbf2ba065397b8d',
  '32d5f13dc1c55ec5','33a478f1c4f6b52d','36fd905f1b402683','39abb1cb448388af','3bc0624a4c57c0c8','3df7c34ff7b73bf8',
  '404be36ebda47aa9','425d42785f00a61c','450beb828bb84a77','476b7af1867c4e60','4b4b9ff6c1fc065f','4bf4cd2e965d2f04',
  '4bfb87bf5b86e219','4c61e0beea88dd0e','4e3daf97f2a6c330','5121015b65df6266','51360864d1495842','55d01195aaf1c6f1',
  '56c2917bdd05f9e9','5bbf46627d7308f6','5eb995c9e439d3ee','5f26973497a6c9fd','63fc7c050b438606','664e2a7b09e3b595',
  '6cb4e69b30283b4d','6db8a2259debd055','73d0d25bc0fdd108','74a90d9a297ec3f1','7546ec23a742f29a','758895cbba45ca83',
  '7659fd60c931526a','7cfdccc482c23ec9','7d0fbf4ae48dbf48','7d4b60230597a7a7','7d6078efea4dc7f8','7fc304fe9eeef0e3',
  '8038cf3385d716f3','816b4541c180a7f0','81de147e3087fe07','83823ed9bbce1099','85ced780dba9643c','8d791d2ccfbb9e11',
  '8ff21a3f735f5649','9156cbecb1032c26','936d877d3fe0d634','9422cc1dc8249f40','94ecf278cc72d236','95052b376e6a4460',
  '992291008c94f856','9ad39ab2ab2b7c37','9c4f6512a12d6185','a3f7413e192cb280','a4888c3f30af760c','a51219fd635ed267',
  'a52588b0eefe4872','a5e1ca39d7d55588','abab43aa09a7f598','acf32c583ee14a03','b179b693b7fb9128','b1cb6e4cff9eeba1',
  'b32cfd9dddc102d0','b5e53acb7bec50b7','b8d2f949f0b1cccf','bd412ea1773d074a','bfb6709d377023a1','c010dd2ad2163947',
  'c03665f75b0d0759','c067ed4b8faff5d6','c1876bd68c9106c9','c315c6e2a1de208c','c37ab0aa3810b954','c3b40352c0455072',
  'c43de748ae562b31','c6b510920de93736','c911cef1308a9c1f','c99e7246d734db0e','d33cb54725fe5c5e','d6e9403a0c244878',
  'd75dfe9daf8b0f37','d79da86d058b0304','d8e5dd8088aaa579','db48fe92027b7696','db9b91ab4d15c331','dbc42e117e0f9411',
  'dcce5d2f9e54faac','e0143e6c0d4ff150','e332be80f98615a7','e39445137df99708','e534ae6ad21c50c9','e67fd852f783d5ff',
  'e90178d77b6751bf','e9db28a7ede6168d','ef1dbe8fad5729a1','eff8d2ec867664a7','f020a67e985e48cb','f0332efbbdbec2b0',
  'f055093d2a0c6688','f2a45373d278c81e','f41b28f2e0ecaf81','f53099f72cf63b00','f5c8c7960b962b8d','f6e533ee576149bc',
  'f71241e6fc57e4a6','fe7d7760dfc144d0'
)

# first 16 hex of sha256 over the file with CRs stripped - same value as install.sh
function Get-SkillHash([string]$file) {
  $bytes = [IO.File]::ReadAllBytes($file)
  $ms = New-Object IO.MemoryStream
  foreach ($x in $bytes) { if ($x -ne 13) { $ms.WriteByte($x) } }
  $h = [Security.Cryptography.SHA256]::Create().ComputeHash($ms.ToArray())
  -join ($h[0..7] | ForEach-Object { $_.ToString('x2') })
}

# the name: value from SKILL.md frontmatter
function Get-FmName([string]$file) {
  foreach ($l in [IO.File]::ReadAllLines($file)) {
    if ($l -match '^name:\s*(.*?)\s*$') { return $Matches[1] }
  }
  return ''
}

# files under $dir, relative, '/'-separated, ordinal order - as install.sh's find
function Get-RelFiles([string]$dir) {
  $full = (Get-Item -LiteralPath $dir -Force).FullName.TrimEnd('\')
  [string[]]$r = @(Get-ChildItem -LiteralPath $dir -Recurse -Force |
    Where-Object { -not $_.PSIsContainer } |
    ForEach-Object { $_.FullName.Substring($full.Length + 1).Replace('\', '/') })
  [Array]::Sort($r, [StringComparer]::Ordinal)
  return ,$r
}

# the ownership marker - SKILL.md hash + files placed; LF, no BOM, same bytes as install.sh
function Write-Owned([string]$dir, [string]$srcDir) {
  $lines = @("sha256 $(Get-SkillHash (Join-Path $srcDir 'SKILL.md'))") +
           @(Get-RelFiles $srcDir | ForEach-Object { "file $_" })
  [IO.File]::WriteAllText((Join-Path $dir $owned), (($lines -join "`n") + "`n"))
}

# true only if SKILL.md still matches the marker's hash and no file exists that the
# installer did not place. A marker with no hash never passes.
function Test-OwnedIntact([string]$dir) {
  $o = Join-Path $dir $owned
  if (-not (Test-Path -LiteralPath $o -PathType Leaf)) { return $false }
  $lines = @([IO.File]::ReadAllLines($o) | ForEach-Object { $_.TrimEnd("`r") })
  if ($lines.Count -eq 0 -or $lines[0] -cne "sha256 $(Get-SkillHash (Join-Path $dir 'SKILL.md'))") { return $false }
  foreach ($f in (Get-RelFiles $dir)) {
    if ($f -ceq $owned) { continue }
    if ($lines -cnotcontains "file $f") { return $false }
  }
  return $true
}

function Remove-Unshipped([string]$dest) {
  if (-not (Test-Path -LiteralPath $dest -PathType Container)) { return }
  $mf = Join-Path $dest $manifest
  if (Test-Path -LiteralPath $mf -PathType Leaf) {
    # one name per line, read whole and trimmed
    $mode = 'manifest'; $why = 'not shipped any more'; $cands = @(Get-Content -LiteralPath $mf)
  } elseif (Test-Path -LiteralPath (Join-Path $dest 'PLATFORMS.md') -PathType Leaf) {
    $mode = 'legacy'; $why = 'renamed, pre-manifest install'; $cands = $legacy
  } else { return }
  foreach ($raw in $cands) {
    $nm = "$raw".Trim()
    if ($nm -eq '' -or $nm -eq '.' -or $nm -eq '..' -or $nm -match '[\\/*?\[]') { continue }
    if ($shipped -ccontains $nm) { continue }
    $p = Join-Path $dest $nm
    $item = Get-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue
    if (-not $item) { continue }
    $isLink = [bool]($item.Attributes -band [IO.FileAttributes]::ReparsePoint)
    $md = Join-Path $p 'SKILL.md'
    if ($isLink) {
      # only a link into this repo's skills\ - never a link the user made elsewhere
      if (-not ("$($item.Target)" -like "$src\*")) { continue }
    } elseif (-not (Test-Path -LiteralPath $md -PathType Leaf)) {
      continue
    } elseif ($mode -eq 'manifest') {
      if (-not (Test-Path -LiteralPath (Join-Path $p $owned) -PathType Leaf)) { continue }
      if (-not (Test-OwnedIntact $p)) {
        Write-Host "        kept $nm (modified since install) in $dest" -ForegroundColor Yellow
        continue
      }
    } else {
      if ((Get-FmName $md) -cne $nm) { continue }
      if ($legacyHashes -notcontains (Get-SkillHash $md)) { continue }
    }
    if ($DryRun) {
      Write-Host "        would remove $nm ($why) from $dest"
    } else {
      # a link is deleted as a link - never recurse through it into the repo
      if ($isLink) { $item.Delete() } else { Remove-Item -LiteralPath $p -Recurse -Force }
      Write-Host "        - removed $nm ($why) from $dest" -ForegroundColor Yellow
    }
  }
}

# the ops\ dir of the installed Claude Code plugin (its installPath in
# installed_plugins.json + \mods\ops-board\ops), or '' when that has no ops.ps1.
function Get-PluginOps {
  $ipj = Join-Path $HOME '.claude\plugins\installed_plugins.json'
  if ($pluginDirs.Count -eq 0 -or -not (Test-Path -LiteralPath $ipj -PathType Leaf)) { return '' }
  try { $j = [IO.File]::ReadAllText($ipj) | ConvertFrom-Json } catch { return '' }
  if (-not $j.plugins) { return '' }
  foreach ($p in $j.plugins.PSObject.Properties) {
    if ($p.Name -notlike 'skillator@*') { continue }
    foreach ($e in @($p.Value)) {
      if (-not $e.installPath) { continue }
      $ops = Join-Path $e.installPath 'mods\ops-board\ops'
      if (Test-Path -LiteralPath (Join-Path $ops 'ops.ps1') -PathType Leaf) { return $ops }
    }
    break
  }
  return ''
}

# Write-OpsFunction <shimSrc> <profile>: `function ops` between marker comments,
# idempotent - an existing block is replaced in place, none -> appended after one blank
# line, several (a damaged profile) -> the first replaced, the rest removed. Every other
# line is kept; the file's encoding (UTF-8 with or without BOM, UTF-16 LE/BE with BOM)
# and line endings are kept; a new profile is UTF-8 without BOM, LF. Returns the
# duplicates removed.
function Write-OpsFunction([string]$shimSrc, [string]$path) {
  $text = ''; $enc = New-Object Text.UTF8Encoding $false
  if (Test-Path -LiteralPath $path -PathType Leaf) {
    $bytes = [IO.File]::ReadAllBytes($path)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
      $enc = New-Object Text.UTF8Encoding $true
    } elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
      $enc = New-Object Text.UnicodeEncoding $false, $true
    } elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) {
      $enc = New-Object Text.UnicodeEncoding $true, $true
    }
    $text = [IO.File]::ReadAllText($path, $enc)
  } else {
    $dir = Split-Path -Parent $path
    if ($dir) { New-Item -ItemType Directory -Force $dir | Out-Null }
  }
  $nl = if ($text.Contains("`r`n")) { "`r`n" } else { "`n" }
  $q = $shimSrc.Replace("'", "''")
  $block = "# >>> skillator ops >>>" + $nl +
    "function ops { & powershell -NoProfile -ExecutionPolicy Bypass -File '$q\ops.ps1' @args }" + $nl +
    "# <<< skillator ops <<<" + $nl
  $re = [regex]'(?s)# >>> skillator ops >>>.*?# <<< skillator ops <<<(\r?\n)?'
  $n = $re.Matches($text).Count
  if ($n -eq 0) {
    if ($text.Length -gt 0) {
      if (-not $text.EndsWith("`n")) { $text += $nl }
      $text += $nl
    }
    $text += $block
  } else {
    $m = $re.Match($text)
    $rest = $re.Replace($text.Substring($m.Index + $m.Length), '')
    $text = $text.Substring(0, $m.Index) + $block + $rest
  }
  [IO.File]::WriteAllText($path, $text, $enc)
  return [Math]::Max($n - 1, 0)
}

# Write-Cmd <template> <skills-dir> <target>: one command file (or say it would). The
# template with {{SKILLS}} replaced by the skills dir as the host sees it (C:\...); no
# other templating, except that Gemini CLI's pending.toml runs pending.ps1 in place of
# pending.sh. UTF-8 without BOM, LF - the bytes install.sh writes but for the separators
# inside {{SKILLS}} and that shell line (pi's frontmatter and gemini's TOML reject a BOM).
function Write-Cmd([string]$tpl, [string]$skillsDir, [string]$target) {
  if ($DryRun) { Write-Host "        would write $target"; return }
  $text = [IO.File]::ReadAllText($tpl).Replace("`r", '')
  if ($tpl -like '*\gemini\pending.toml') {
    $re = [regex]'(?m)^!\{sh "\{\{SKILLS\}\}/tickets-zordon/scripts/pending\.sh"\}$'
    if (-not $re.IsMatch($text)) { throw "no pending.sh shell line in $tpl" }
    $text = $re.Replace($text,
      '!{powershell -NoProfile -ExecutionPolicy Bypass -File "{{SKILLS}}\tickets-zordon\scripts\pending.ps1"}')
  }
  $text = $text.Replace('{{SKILLS}}', $skillsDir)
  New-Item -ItemType Directory -Force (Split-Path -Parent $target) | Out-Null
  [IO.File]::WriteAllText($target, $text, (New-Object Text.UTF8Encoding $false))
  Write-Host "        * $target"
}

# Write-PiExt <skills-dir>: F56 - /ops in pi. pi 0.74 loads every ~\.pi\agent\extensions\*.ts
# (probed 2026-10-22); this one re-exports the board's extension from the dest's
# ops-board\pi\ (forward slashes), so the data layer has one copy. Rewritten every run,
# UTF-8 without BOM, LF - the bytes install.sh writes. Same as install.sh put_pi_ext.
function Write-PiExt([string]$skillsDir) {
  $ext = "$HOME\.pi\agent\extensions\skillator-ops.ts"
  if ($DryRun) { Write-Host "        would write $ext"; return }
  New-Item -ItemType Directory -Force (Split-Path -Parent $ext) | Out-Null
  $to = $skillsDir.Replace('\', '/').Replace('"', '\"')
  $text = "// skillator ops board in pi (/ops) - written by the skillator installer, rewritten every run.`nexport { default } from `"$to/ops-board/pi/index.ts`";`n"
  [IO.File]::WriteAllText($ext, $text, (New-Object Text.UTF8Encoding $false))
  Write-Host "        * $ext"
}

# Write-PiIgnore <dest>: A145 - pi (0.74) loads every top-level .md in its skills dir as a
# skill, so the canon docs beside the skills warned "description is required" at each
# start. Its skill loader honours .ignore / .gitignore / .fdignore in that dir (core\
# skills.js addIgnoreRules), so list the three docs there: pi skips them, the files stay
# at ..\ for every skill. Missing lines are appended (LF, no BOM - the bytes install.sh
# writes); a user's own lines are kept. Same as install.sh pi_ignore.
function Write-PiIgnore([string]$dest) {
  $ig = Join-Path $dest '.ignore'
  $enc = New-Object Text.UTF8Encoding $false
  if (-not (Test-Path -LiteralPath $ig -PathType Leaf)) {
    [IO.File]::WriteAllText($ig, "# written by the skillator installer: pi must not load these docs as skills`n", $enc)
  } else {
    $cur = [IO.File]::ReadAllText($ig)
    if ($cur.Length -gt 0 -and -not $cur.EndsWith("`n")) { [IO.File]::AppendAllText($ig, "`n", $enc) }
  }
  $have = @([IO.File]::ReadAllLines($ig) | ForEach-Object { $_.TrimEnd("`r") })
  foreach ($d in 'PLATFORMS.md', 'PRACTICE.md', 'WORKFLOW.md') {
    if ($have -cnotcontains "/$d") { [IO.File]::AppendAllText($ig, "/$d`n", $enc) }
  }
}

# Get-AgyIde: the Antigravity IDE's CLI (the VS Code fork, not agy) - $env:SKILLATOR_AGY_IDE
# when set (the selftest's fake), else antigravity-ide on PATH, else the default per-user
# install. '' when none is there. Same as install.sh agy_ide.
function Get-AgyIde {
  if ($env:SKILLATOR_AGY_IDE) { if (Test-Path -LiteralPath $env:SKILLATOR_AGY_IDE -PathType Leaf) { return $env:SKILLATOR_AGY_IDE } else { return '' } }
  $c = Get-Command antigravity-ide -CommandType Application, ExternalScript -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { return $c.Source }
  $d = "$env:LOCALAPPDATA\Programs\Antigravity IDE\bin\antigravity-ide.cmd"
  if ($env:LOCALAPPDATA -and (Test-Path -LiteralPath $d -PathType Leaf)) { return $d }
  return ''
}

# Write-AgyExt <skills-dir>: F57 - the ops board in the Antigravity IDE (command "skillator:
# Ops board"). The IDE (1.107.0, probed 2026-10-22) ignores a folder dropped beside its
# extensions.json, so ops-board\antigravity\pack.mjs writes a VSIX whose extension.cjs
# requires the dest's ops-board/antigravity/extension.cjs, and the IDE's own CLI installs
# it (--install-extension --force). Every run. A failed install is a warning, never the
# installer's exit code. Same as install.sh put_agy_ext.
function Write-AgyExt([string]$skillsDir) {
  $ErrorActionPreference = 'Continue'     # the IDE's CLI writes notes to stderr
  $ide = Get-AgyIde
  if (-not $ide) { Write-Host "        skip  the Antigravity IDE ops board (no antigravity-ide CLI found)"; return }
  $vsix = "$skillsDir\ops-board\antigravity\skillator-ops.vsix"
  if ($DryRun) { Write-Host "        would install the ops board extension $vsix with $ide"; return }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host "        skip  the Antigravity IDE ops board (needs node 22.18 or newer to pack it)"; return }
  $o = & node "$skillsDir\ops-board\antigravity\pack.mjs" $vsix 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { Write-Host "warn  the Antigravity IDE ops board was not packed: $o" -ForegroundColor Yellow; return }
  $o = & $ide --install-extension $vsix --force 2>&1 | Out-String
  if ($LASTEXITCODE -eq 0) { Write-Host "        * Antigravity IDE extension skillator.skillator-ops ($vsix)" }
  else { Write-Host "warn  the Antigravity IDE did not install the ops board: $o" -ForegroundColor Yellow }
}

# Write-Commands <cli> <dest>: F54 - /pending, /list-tickets, /engage, /archive-tickets and /sync-tickets as the host's own command
# file, user level, rewritten every run. Called per dest; per-CLI files are written for
# the dest the host reads its skills from. Antigravity's are skills (/<name> in agy),
# written into each antigravity dest with no .skillator-owned marker and kept out of
# .skillator-installed, so Remove-Unshipped never touches them. Claude Code: nothing (the
# ops-board mod has its own /pending, /list-tickets; /engage, /archive-tickets and /sync-tickets are the plugin's commands/*.md).
# Same as install.sh write_commands.
function Write-Commands([string]$cli, [string]$dest) {
  $c = Join-Path $PSScriptRoot 'host-commands'
  $names = 'pending', 'list-tickets', 'engage', 'archive-tickets', 'sync-tickets'
  switch ($cli) {
    'codex'  { foreach ($n in $names) { Write-Cmd "$c\codex\$n.md" $dest "$codexHome\prompts\$n.md" } }
    'cursor' { foreach ($n in $names) { Write-Cmd "$c\cursor\$n.md" $dest "$HOME\.cursor\commands\$n.md" } }
    'pi' {
      if ($dest -ne "$HOME\.pi\agent\skills") { return }
      foreach ($n in $names) { Write-Cmd "$c\pi\$n.md" $dest "$HOME\.pi\agent\prompts\$n.md" }
      Write-PiExt $dest
    }
    'antigravity' {
      foreach ($n in $names) {
        Write-Cmd "$c\antigravity\$n\SKILL.md" $dest "$dest\$n\SKILL.md"
        # an older run may have marked it owned - it is not a manifest skill
        if (-not $DryRun) { Remove-Item -LiteralPath "$dest\$n\$owned" -Force -ErrorAction SilentlyContinue }
      }
      # F57: the Antigravity IDE's extension, from Antigravity's own dest
      if ($dest -eq "$HOME\.gemini\config\skills") { Write-AgyExt $dest }
      # Gemini CLI shares the ~/.gemini marker and reads ~/.gemini/skills
      if ($dest -eq "$HOME\.gemini\skills") {
        foreach ($n in $names) { Write-Cmd "$c\gemini\$n.toml" $dest "$HOME\.gemini\commands\$n.toml" }
      }
    }
  }
}

# -SelfTest: install into a temp HOME / USERPROFILE / CODEX_HOME holding the four marker
# dirs and a temp -Profile, then check the command files (F54), the ops-board copy and
# the profile function (F55), pi's /ops extension (F56), the Antigravity IDE extension
# through a fake IDE CLI (F57). Never touches the real HOME, profile or IDE. Costs one full
# install per host dest on disk until it returns. Returns '' or the failure.
function Invoke-SelfTest([string]$T) {
  $prof = Join-Path $T 'profile.ps1'
  foreach ($m in '.codex','.cursor','.gemini','.pi') { New-Item -ItemType Directory -Force (Join-Path $T $m) | Out-Null }
  $env:HOME = $T; $env:USERPROFILE = $T; $env:CODEX_HOME = Join-Path $T '.codex'
  # F57: a fake Antigravity IDE CLI that logs its arguments - every run below inherits it,
  # so the selftest never installs into the real IDE
  $calls = Join-Path $T 'ide-calls'
  [IO.File]::WriteAllText((Join-Path $T 'fake-ide.ps1'), "Add-Content -LiteralPath '$calls' -Value (`$args -join ' ')`nexit 0`n")
  $env:SKILLATOR_AGY_IDE = Join-Path $T 'fake-ide.ps1'
  $ideCalls = { if (Test-Path -LiteralPath $calls) { @([IO.File]::ReadAllLines($calls)) } else { @() } }
  $run = { param([string[]]$more)
    $o = & powershell -NoProfile -ExecutionPolicy Bypass -File $selfPath -Profile $prof @more | Out-String
    $script:selfCode = $LASTEXITCODE
    $o
  }
  $read = { param([string]$rel) [IO.File]::ReadAllText((Join-Path $T $rel)) }
  $has = { param([string]$rel, [string]$s) (& $read $rel).Contains($s) }

  # dry run first: says what it would write, writes nothing (the profile included)
  $out = & $run @('-DryRun')
  if ($script:selfCode -ne 0) { return "dry run exited $script:selfCode" }
  if (-not $out.Contains("would write function ops in $prof")) { return 'dry-run ops line' }
  if (-not $out.Contains("would write $T\.pi\agent\prompts\list-tickets.md")) { return 'dry-run command line' }
  if (-not $out.Contains("would write $T\.pi\agent\extensions\skillator-ops.ts")) { return 'dry-run pi extension line' }
  if (-not $out.Contains("would install the ops board extension $T\.gemini\config\skills\ops-board\antigravity\skillator-ops.vsix with $env:SKILLATOR_AGY_IDE")) { return 'dry-run antigravity extension line' }
  if (@(& $ideCalls).Count -ne 0) { return 'dry run called the Antigravity IDE' }
  if (-not $out.Contains("would write $T\.gemini\config\skills\pending\SKILL.md")) { return 'dry-run skill-command line' }
  if (-not $out.Contains("would write $T\.gemini\antigravity-cli\skills\pending\SKILL.md")) { return 'dry-run agy-cli skill-command line' }
  if (Test-Path -LiteralPath $prof) { return 'dry run wrote the profile' }
  if (Test-Path -LiteralPath (Join-Path $T '.codex\prompts')) { return 'dry run wrote a command file' }

  $null = & $run @()
  if ($script:selfCode -ne 0) { return "install exited $script:selfCode" }
  # B6: every frontmatter in commands\ and host-commands\ must be valid YAML or pi never registers
  # the command. No YAML parser in the installer, so a narrow check: an unquoted plain value
  # holding ": " (the one slip that bit /archive-tickets). Quote such a value.
  foreach ($f in @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'commands'), (Join-Path $PSScriptRoot 'host-commands') -Recurse -Filter '*.md' -File)) {
    $ls = [IO.File]::ReadAllLines($f.FullName)
    if ($ls.Count -eq 0 -or $ls[0].TrimEnd() -ne '---') { continue }
    for ($i = 1; $i -lt $ls.Count -and $ls[$i].TrimEnd() -ne '---'; $i++) {
      if ($ls[$i] -match '^[A-Za-z_-]+:\s+([^"''\[{|>&*!#%\s].*)$' -and $Matches[1].Contains(': ')) { return "frontmatter has an unquoted ': ' (invalid YAML, pi will not register the command): $($f.FullName): $($ls[$i])" }
    }
  }
  $cmds = @('.codex\prompts\pending.md', '.codex\prompts\list-tickets.md',
            '.gemini\commands\pending.toml', '.gemini\commands\list-tickets.toml',
            '.cursor\commands\pending.md', '.cursor\commands\list-tickets.md',
            '.pi\agent\prompts\pending.md', '.pi\agent\prompts\list-tickets.md',
            '.gemini\config\skills\pending\SKILL.md', '.gemini\config\skills\list-tickets\SKILL.md',
            '.gemini\skills\pending\SKILL.md', '.gemini\skills\list-tickets\SKILL.md',
            '.codex\prompts\engage.md', '.gemini\commands\engage.toml', '.cursor\commands\engage.md',
            '.pi\agent\prompts\engage.md', '.gemini\config\skills\engage\SKILL.md', '.gemini\skills\engage\SKILL.md',
            '.codex\prompts\archive-tickets.md', '.gemini\commands\archive-tickets.toml', '.cursor\commands\archive-tickets.md',
            '.pi\agent\prompts\archive-tickets.md', '.gemini\config\skills\archive-tickets\SKILL.md', '.gemini\skills\archive-tickets\SKILL.md',
            '.codex\prompts\sync-tickets.md', '.gemini\commands\sync-tickets.toml', '.cursor\commands\sync-tickets.md',
            '.pi\agent\prompts\sync-tickets.md', '.gemini\config\skills\sync-tickets\SKILL.md', '.gemini\skills\sync-tickets\SKILL.md',
            '.gemini\antigravity-cli\skills\pending\SKILL.md', '.gemini\antigravity-cli\skills\list-tickets\SKILL.md',
            '.gemini\antigravity-cli\skills\engage\SKILL.md', '.gemini\antigravity-cli\skills\archive-tickets\SKILL.md',
            '.gemini\antigravity-cli\skills\sync-tickets\SKILL.md')
  foreach ($f in $cmds + @('.gemini\antigravity-cli\skills\tickets-zordon\SKILL.md', '.codex\skills\ops-board\ops\app.ts', '.pi\agent\skills\ops-board\hooks\lib\board.ts',
                           '.pi\agent\skills\ops-board\ops\package.json', '.pi\agent\skills\ops-board\hooks\lib\package.json',
                           '.pi\agent\skills\ops-board\pi\index.ts', '.pi\agent\skills\ops-board\pi\ops.ts', '.pi\agent\skills\ops-board\ops\engine.ts',
                           '.pi\agent\extensions\skillator-ops.ts')) {
    if (-not (Test-Path -LiteralPath (Join-Path $T $f) -PathType Leaf)) { return "missing $f" }
  }
  if (-not (& $has '.codex\prompts\pending.md' "sh $T\.codex\skills/tickets-zordon/scripts/pending.sh")) { return 'codex prompt not substituted' }
  if (-not (& $has '.gemini\config\skills\pending\SKILL.md' "$T\.gemini\config\skills/tickets-zordon/SKILL.md")) { return 'agy skill not substituted with its own dest' }
  if (-not (& $has '.gemini\skills\list-tickets\SKILL.md' "$T\.gemini\skills/tickets-zordon/SKILL.md")) { return 'agy skill not substituted with its own dest' }
  # B8: agy 1.4.5 reads ~/.gemini/antigravity-cli/skills - its commands point at that dest
  if (-not (& $has '.gemini\antigravity-cli\skills\pending\SKILL.md' "$T\.gemini\antigravity-cli\skills/tickets-zordon/SKILL.md")) { return 'agy-cli skill not substituted with its own dest' }
  if ((& $read '.gemini\commands\pending.toml') -notmatch '(?m)^!\{powershell ') { return 'gemini shell injection' }
  if (-not (& $has '.gemini\commands\pending.toml' "!{powershell -NoProfile -ExecutionPolicy Bypass -File `"$T\.gemini\skills\tickets-zordon\scripts\pending.ps1`"}")) { return 'gemini pending path' }
  if ((& $read '.gemini\commands\pending.toml') -match '(?m)^!\{sh ') { return 'gemini pending kept the sh line' }
  if (-not (& $has '.gemini\commands\list-tickets.toml' '{{args}}')) { return 'gemini args' }
  if (-not (& $has '.pi\agent\prompts\list-tickets.md' '$ARGUMENTS')) { return 'pi args' }
  if ((& $read '.pi\agent\prompts\list-tickets.md') -notmatch '(?m)^argument-hint: ') { return 'pi argument-hint' }
  if ((& $read '.cursor\commands\pending.md') -notmatch '(?m)^description: ') { return 'cursor description' }
  # F56: pi's extension re-exports the board from the pi dest's ops-board/pi (forward slashes, no BOM, no CR)
  $piExt = "export { default } from `"$($T.Replace('\', '/'))/.pi/agent/skills/ops-board/pi/index.ts`";"
  if (@((& $read '.pi\agent\extensions\skillator-ops.ts').Split("`n")) -cnotcontains $piExt) { return 'pi extension target' }
  $pb = [IO.File]::ReadAllBytes((Join-Path $T '.pi\agent\extensions\skillator-ops.ts'))
  if ($pb[0] -ne 0x2F -or $pb -contains 13) { return 'pi extension has a BOM or CR' }
  if (@(Get-ChildItem -LiteralPath (Join-Path $T '.pi\agent\extensions')).Count -ne 1) { return 'pi extensions dir holds more than skillator-ops.ts' }
  # A145: pi's skills dirs list the three docs in .ignore (pi skips them as skills); the
  # docs are still there at ..\ from every skill, and no other host gets a .ignore
  foreach ($d in '.pi\agent\skills', '.pi\skills') {
    $igl = @([IO.File]::ReadAllLines((Join-Path $T "$d\.ignore")))
    foreach ($f in 'PLATFORMS.md', 'PRACTICE.md', 'WORKFLOW.md') {
      if (-not (Test-Path -LiteralPath (Join-Path $T "$d\$f") -PathType Leaf)) { return "missing $d\$f" }
      if ($igl -cnotcontains "/$f") { return "$d\.ignore does not list /$f" }
    }
  }
  if (Test-Path -LiteralPath (Join-Path $T '.codex\skills\.ignore')) { return 'a non-pi dest got a .ignore' }
  # F57: the Antigravity IDE got one install of the VSIX packed in Antigravity's own dest,
  # and the VSIX's entry requires that dest's ops-board/antigravity/extension.cjs
  $agy = Join-Path $T '.gemini\config\skills\ops-board\antigravity'
  foreach ($f in 'ops.ts', 'extension.cjs', 'pack.mjs', 'package.json') { if (-not (Test-Path -LiteralPath (Join-Path $agy $f) -PathType Leaf)) { return "missing antigravity\$f" } }
  $ic = @(& $ideCalls)
  if ($ic.Count -ne 1 -or $ic[0] -cne "--install-extension $agy\skillator-ops.vsix --force") { return "antigravity ide install call: $($ic -join ' | ')" }
  $vb = [IO.File]::ReadAllBytes((Join-Path $agy 'skillator-ops.vsix'))
  if ($vb[0] -ne 0x50 -or $vb[1] -ne 0x4B) { return 'antigravity vsix is not a zip' }
  if (-not [Text.Encoding]::UTF8.GetString($vb).Contains("require(`"$($agy.Replace('\', '/'))/extension.cjs`")")) { return 'antigravity vsix entry target' }
  # B8: the VSIX is packed and installed from ~/.gemini/config/skills only
  foreach ($d in '.gemini\skills', '.gemini\antigravity-cli\skills') {
    if (Test-Path -LiteralPath (Join-Path $T "$d\ops-board\antigravity\skillator-ops.vsix")) { return "antigravity vsix packed in $d" }
  }
  if ((& $read '.codex\prompts\pending.md').StartsWith('---')) { return 'codex prompt has frontmatter' }
  if ((& $read '.gemini\config\skills\pending\SKILL.md') -cnotmatch '(?m)^name: pending$') { return 'agy skill name' }
  if ((& $read '.gemini\skills\list-tickets\SKILL.md') -cnotmatch '(?m)^name: list-tickets$') { return 'agy skill name' }
  if ([IO.File]::ReadAllBytes((Join-Path $T '.pi\agent\prompts\pending.md'))[0] -ne 0x2D) { return 'pi prompt does not start with - (BOM?)' }
  foreach ($f in $cmds) {
    $b = [IO.File]::ReadAllBytes((Join-Path $T $f))
    if ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF) { return "BOM in $f" }
    if ($b -contains 13) { return "CR in $f" }
    if ((& $read $f).Contains('{{SKILLS}}')) { return "placeholder left in $f" }
  }
  foreach ($d in '.gemini\config\skills', '.gemini\skills', '.gemini\antigravity-cli\skills') {
    $mf = @([IO.File]::ReadAllLines((Join-Path $T "$d\.skillator-installed")))
    if ($mf -ccontains 'pending' -or $mf -ccontains 'list-tickets' -or $mf -ccontains 'engage' -or $mf -ccontains 'archive-tickets' -or $mf -ccontains 'sync-tickets') { return "command skill in manifest $d" }
    if (Test-Path -LiteralPath (Join-Path $T "$d\pending\.skillator-owned")) { return "command skill carries an ownership marker in $d" }
  }
  $opsLine = "-File '$T\.cursor\skills\ops-board\ops\ops.ps1' @args"
  $count = { @(Select-String -LiteralPath $prof -SimpleMatch -Pattern '# >>> skillator ops >>>').Count }
  if ((& $count) -ne 1) { return 'profile does not hold one ops block' }
  if (-not ([IO.File]::ReadAllText($prof).Contains($opsLine))) { return 'ops function target (first dest: cursor, since claude-code has no plugin here)' }

  # second run: command files are rewritten, installed skills are not, the
  # skill-commands survive the prune and lose a stale marker an older run left
  [IO.File]::AppendAllText((Join-Path $T '.codex\prompts\pending.md'), "stale`n")
  [IO.File]::AppendAllText((Join-Path $T '.pi\agent\extensions\skillator-ops.ts'), "stale`n")
  [IO.File]::AppendAllText((Join-Path $T '.gemini\skills\pending\SKILL.md'), "stale`n")
  [IO.File]::WriteAllText((Join-Path $T '.gemini\skills\list-tickets\.skillator-owned'), '')
  [IO.File]::WriteAllText((Join-Path $T '.pi\agent\skills\tickets-zordon\.selftest-sentinel'), '')
  [IO.File]::AppendAllText((Join-Path $T '.pi\agent\skills\.ignore'), 'my-own-line')
  $null = & $run @()
  if ($script:selfCode -ne 0) { return "second install exited $script:selfCode" }
  $igl = @([IO.File]::ReadAllLines((Join-Path $T '.pi\agent\skills\.ignore')))
  if ($igl -cnotcontains 'my-own-line') { return 'pi .ignore lost a user line' }
  if (@($igl | Where-Object { $_ -ceq '/PLATFORMS.md' }).Count -ne 1) { return 'pi .ignore lines duplicated on the second run' }
  if (& $has '.codex\prompts\pending.md' 'stale') { return 'codex prompt not rewritten' }
  if (& $has '.pi\agent\extensions\skillator-ops.ts' 'stale') { return 'pi extension not rewritten' }
  if (@(& $ideCalls).Count -ne 2) { return 'antigravity extension not reinstalled on the second run' }
  if (-not (Test-Path -LiteralPath (Join-Path $T '.gemini\skills\pending\SKILL.md'))) { return 'agy skill-command pruned' }
  if (& $has '.gemini\skills\pending\SKILL.md' 'stale') { return 'agy skill-command not rewritten' }
  if (Test-Path -LiteralPath (Join-Path $T '.gemini\skills\list-tickets\.skillator-owned')) { return 'stale marker kept on a skill-command' }
  if (-not (Test-Path -LiteralPath (Join-Path $T '.pi\agent\skills\tickets-zordon\.selftest-sentinel'))) { return 'installed skill was rewritten' }
  if ((& $count) -ne 1) { return 'second run: profile does not hold one ops block' }

  # a damaged profile - two blocks around a user line - ends with one block, user line kept
  $blk = "# >>> skillator ops >>>`nfunction ops { 'old' }`n# <<< skillator ops <<<`n"
  [IO.File]::WriteAllText($prof, "Set-Alias ll ls`n$blk`n$blk")
  $out = & $run @()
  if ($script:selfCode -ne 0) { return "third install exited $script:selfCode" }
  if ((& $count) -ne 1) { return 'duplicate ops blocks not collapsed' }
  $pt = [IO.File]::ReadAllText($prof)
  if (-not $pt.Contains('Set-Alias ll ls')) { return 'user line lost from the profile' }
  if (-not $pt.Contains($opsLine)) { return 'ops function target after the repair' }
  if (-not $out.Contains('removed 1 duplicate')) { return 'duplicate removal not reported' }

  # a UTF-16 LE profile (BOM) with a non-ASCII line is written back as UTF-16 LE, line kept
  $uline = '# caf' + [char]0xE9 + ' ' + [char]0x00FC + 'ber'
  $u16 = New-Object Text.UnicodeEncoding $false, $true
  [IO.File]::WriteAllBytes($prof, [byte[]]($u16.GetPreamble() + $u16.GetBytes("$uline`r`n")))
  $null = & $run @()
  if ($script:selfCode -ne 0) { return "fourth install exited $script:selfCode" }
  $ub = [IO.File]::ReadAllBytes($prof)
  if ($ub.Length -lt 2 -or $ub[0] -ne 0xFF -or $ub[1] -ne 0xFE) { return 'UTF-16 LE profile lost its BOM' }
  $ut = $u16.GetString($ub, 2, $ub.Length - 2)
  if (-not $ut.Contains($uline)) { return 'non-ASCII line lost from a UTF-16 LE profile' }
  if (-not $ut.Contains($opsLine)) { return 'ops function target in a UTF-16 LE profile' }

  # the plugin installed: the function still runs the first dest written (refreshed every
  # run), never the versioned plugin cache a plugin update can remove
  $P = Join-Path $T 'p'
  foreach ($m in '.cursor', '.claude\plugins\cache\skillator', 'pc\mods\ops-board\ops') { New-Item -ItemType Directory -Force (Join-Path $P $m) | Out-Null }
  [IO.File]::WriteAllText((Join-Path $P 'pc\mods\ops-board\ops\ops.ps1'), '')
  [IO.File]::WriteAllText((Join-Path $P '.claude\plugins\installed_plugins.json'),
    ('{"plugins":{"skillator@skillator":[{"installPath":"' + (Join-Path $P 'pc').Replace('\', '\\') + '"}]}}'))
  $prof2 = Join-Path $P 'profile.ps1'
  $env:HOME = $P; $env:USERPROFILE = $P; $env:CODEX_HOME = Join-Path $P '.codex'
  $null = & powershell -NoProfile -ExecutionPolicy Bypass -File $selfPath -Profile $prof2 | Out-String
  if ($LASTEXITCODE -ne 0) { return "plugin install exited $LASTEXITCODE" }
  # no IDE CLI: the antigravity dest says so and installs nothing
  $env:HOME = $T; $env:USERPROFILE = $T; $env:CODEX_HOME = Join-Path $T '.codex'
  $env:SKILLATOR_AGY_IDE = Join-Path $T 'none.ps1'
  $out = & $run @('-DryRun')
  if (-not $out.Contains('skip  the Antigravity IDE ops board (no antigravity-ide CLI found)')) { return 'no-IDE skip line' }
  if (-not ([IO.File]::ReadAllText($prof2).Contains("-File '$P\.cursor\skills\ops-board\ops\ops.ps1' @args"))) { return 'ops function target with the plugin installed (first dest written, not the plugin cache)' }
  return ''
}

if ($SelfTest) {
  $saved = @{ HOME = $env:HOME; USERPROFILE = $env:USERPROFILE; CODEX_HOME = $env:CODEX_HOME; SKILLATOR_AGY_IDE = $env:SKILLATOR_AGY_IDE }
  $T = Join-Path ([IO.Path]::GetTempPath()) ("skillator-selftest-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
  New-Item -ItemType Directory -Force $T | Out-Null
  $T = (Get-Item -LiteralPath $T).FullName.TrimEnd('\')
  try { $why = Invoke-SelfTest $T }
  catch { $why = "selftest threw: $($_.Exception.Message)" }
  finally {
    foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k], 'Process') }
    Remove-Item -LiteralPath $T -Recurse -Force -ErrorAction SilentlyContinue
  }
  if ($why) { Write-Output "FAIL: $why"; exit 1 }
  Write-Output 'ok'; exit 0
}

$writtenDests = @()
foreach ($cli in $targets.Keys) {
  $marker = $targets[$cli].Marker
  if (-not (Test-Path $marker) -and -not (Get-Command $cli -ErrorAction SilentlyContinue)) {
    Write-Host "skip  $cli (not installed)" -ForegroundColor DarkGray
    continue
  }

  # Claude Code's plugin install already provides every skill - leave it alone.
  if ($cli -eq 'claude-code' -and $pluginDirs.Count -gt 0) {
    Write-Host "ok    claude-code (installed via plugin: $($pluginDirs[0].FullName))" -ForegroundColor DarkGray
    continue
  }

  foreach ($dest in $targets[$cli].Dests) {
    Remove-Unshipped $dest
    # a skill symlinked to this repo is live - never replace it with a stale copy
    $linked = @(Get-ChildItem $dest -Directory -ErrorAction SilentlyContinue |
                Where-Object { $_.LinkType -eq 'SymbolicLink' -and "$($_.Target)" -like "$src*" } |
                ForEach-Object { $_.Name })
    $missing = @($skills | Where-Object {
      $_.Name -notin $linked -and
      ($Force -or -not (Test-Path (Join-Path $dest "$($_.Name)\SKILL.md")))
    })
    # adopt an unmarked copy that is exactly this repo's current skill
    if (-not $DryRun) {
      foreach ($s in $skills) {
        $t = Join-Path $dest $s.Name
        if ($s.Name -in $linked -or $missing -contains $s) { continue }
        if (-not (Test-Path -LiteralPath (Join-Path $t 'SKILL.md') -PathType Leaf)) { continue }
        if (Test-Path -LiteralPath (Join-Path $t $owned)) { continue }
        if ((Get-SkillHash (Join-Path $t 'SKILL.md')) -eq (Get-SkillHash (Join-Path $s.FullName 'SKILL.md'))) {
          Write-Owned $t $s.FullName
        }
      }
    }

    if ($missing.Count -eq 0) {
      $how = if ($linked.Count -eq $skills.Count) { "symlinked to this repo" } else { "already installed" }
      Write-Host "ok    $cli (all $($skills.Count) skills $how) -> $dest" -ForegroundColor DarkGray
    } else {
      Write-Host "$cli -> $dest" -ForegroundColor Cyan
      foreach ($s in $missing) {
        if ($DryRun) { Write-Host "        would install $($s.Name)"; continue }
        New-Item -ItemType Directory -Force $dest | Out-Null
        $t = Join-Path $dest $s.Name
        if (Test-Path $t) { Remove-Item $t -Recurse -Force }   # handles reparse points
        if ($Link) {
          try {
            New-Item -ItemType SymbolicLink -Path $t -Target $s.FullName -ErrorAction Stop | Out-Null
            Write-Host "        > $($s.Name) (link)" -ForegroundColor Green
            continue
          } catch {
            Write-Host "        ! symlink denied, copying (enable Developer Mode or run elevated)" -ForegroundColor Yellow
          }
        }
        Copy-Item $s.FullName $t -Recurse -Force
        Write-Owned $t $s.FullName
        Write-Host "        + $($s.Name)" -ForegroundColor Green
      }
    }

    # skills reference PLATFORMS.md / PRACTICE.md / WORKFLOW.md, practice/ and references/ beside the
    # installed skills - refresh them every run, even when no skill needed installing,
    # so the plain `git pull; .\install.ps1` update path picks up doc changes.
    # F55: ops-board\ is the ops terminal app (hooks\lib, types, ops) - same refresh.
    $writtenDests += $dest
    if ($DryRun) {
      Write-Host "        would refresh PLATFORMS.md PRACTICE.md WORKFLOW.md practice\ references\ ops-board\ in $dest"
      if ($cli -eq 'pi') { Write-Host "        would list the three docs in $dest\.ignore (pi skips them as skills)" }
    } else {
      New-Item -ItemType Directory -Force $dest | Out-Null
      foreach ($doc in 'PLATFORMS.md','PRACTICE.md','WORKFLOW.md') {
        Copy-Item (Join-Path $PSScriptRoot $doc) $dest -Force
      }
      $practice = Join-Path $dest 'practice'
      if (Test-Path $practice) { Remove-Item $practice -Recurse -Force }
      Copy-Item (Join-Path $PSScriptRoot 'practice') $dest -Recurse -Force
      $references = Join-Path $dest 'references'
      if (Test-Path $references) { Remove-Item $references -Recurse -Force }
      Copy-Item (Join-Path $PSScriptRoot 'references') $dest -Recurse -Force
      $board = Join-Path $dest 'ops-board'
      if (Test-Path $board) { Remove-Item $board -Recurse -Force }
      New-Item -ItemType Directory -Force (Join-Path $board 'hooks') | Out-Null
      $mod = Join-Path $PSScriptRoot 'mods\ops-board'
      Copy-Item (Join-Path $mod 'hooks\lib') (Join-Path $board 'hooks') -Recurse -Force
      Copy-Item (Join-Path $mod 'types') $board -Recurse -Force
      Copy-Item (Join-Path $mod 'ops') $board -Recurse -Force
      # F56: pi\, the same board as a pi extension (Write-Commands points pi at it)
      Copy-Item (Join-Path $mod 'pi') $board -Recurse -Force
      # F57: antigravity\, the same board as an Antigravity IDE extension (Write-AgyExt)
      Copy-Item (Join-Path $mod 'antigravity') $board -Recurse -Force
      # LF, no BOM - the same bytes install.sh writes, so either twin reads the other's
      [IO.File]::WriteAllText((Join-Path $dest $manifest), (($shipped -join "`n") + "`n"))
      if ($cli -eq 'pi') { Write-PiIgnore $dest }
    }
    Write-Commands $cli $dest
  }
}

# A62a: codex builds before 0.155.0 read only ~\.agents\skills, not $codexHome\skills
# (this installer's codex row). On such a build a fresh install here is silently
# unreachable, so warn and give the one-line fix (or: upgrade codex).
if (Get-Command codex -ErrorAction SilentlyContinue) {
  $cxRaw = ""
  try { $cxRaw = (& codex --version 2>&1 | Out-String).Trim() } catch { $cxRaw = "" }
  $cxOld = $false
  $cxMatch = [regex]::Match($cxRaw, '[0-9]+\.[0-9]+\.[0-9]+')
  if (-not $cxMatch.Success) {
    $cxOld = $true
  } else {
    $cxParts = $cxMatch.Value.Split('.')
    if ([int]$cxParts[0] -eq 0 -and [int]$cxParts[1] -lt 155) { $cxOld = $true }
  }
  if ($cxOld) {
    Write-Host ""
    if (-not $cxMatch.Success) {
      Write-Host "warn  codex --version did not report a version this script can parse: `"$cxRaw`"" -ForegroundColor Yellow
    } else {
      Write-Host "warn  codex $($cxMatch.Value) is older than 0.155.0" -ForegroundColor Yellow
    }
    Write-Host "      that build reads only $HOME\.agents\skills for skills, not $codexHome\skills,"
    Write-Host "      so a fresh install here is invisible to it. Copy the installed skills there:"
    Write-Host "        Copy-Item '$codexHome\skills\*' '$HOME\.agents\skills\' -Recurse -Force"
    Write-Host "      or upgrade codex."
  }
}

# A73: skillator skills left in the shared dir by an older install. Reported, never
# removed - the dir is shared with other tools and deleting from it is the user's call.
$old = @($skills | Where-Object { Test-Path (Join-Path "$HOME\.agents\skills" "$($_.Name)\SKILL.md") } |
        ForEach-Object { $_.Name })
if ($old.Count -gt 0) {
  Write-Host "`nnote  $HOME\.agents\skills still holds skillator skills from an older install:" -ForegroundColor Yellow
  Write-Host "       $($old -join ' ')"
  Write-Host "      codex lists each of these twice, and Gemini CLI prefers them over the fresh"
  Write-Host "      copy in ~\.gemini\skills. This installer no longer writes that dir; remove"
  Write-Host "      those skill folders by hand (and PLATFORMS.md, PRACTICE.md, WORKFLOW.md,"
  Write-Host "      practice\, references\ beside them if nothing else uses them)."
}

Write-Host "`nPrime Agent: no markdown-skill loader - point its AGENTS.md at $src\<skill>\SKILL.md."

# F55: the ops board - one launch line per dest, and `function ops` in the PowerShell
# profile. It runs the first dest this run wrote (its ops-board\ is refreshed every
# run); the Claude Code plugin's copy only when no dest was written - its versioned
# cache dir goes away on a plugin update. Rewritten every run (the dest can change).
# Same as install.sh.
$shimSrc = ''
if ($writtenDests.Count -gt 0) { $shimSrc = Join-Path $writtenDests[0] 'ops-board\ops' }
if (-not $shimSrc) { $shimSrc = Get-PluginOps }
if ($shimSrc) { Write-Host "" }
foreach ($d in $writtenDests) {
  Write-Host "ops   sh $($d.Replace('\', '/'))/ops-board/ops/ops.sh <repo>   (Windows: powershell -NoProfile -ExecutionPolicy Bypass -File $d\ops-board\ops\ops.ps1 -Repo <repo>)"
}
if ($shimSrc) {
  if ($DryRun) {
    Write-Host "        would write function ops in $Profile -> $shimSrc\ops.ps1"
  } else {
    $dups = Write-OpsFunction $shimSrc $Profile
    Write-Host "ops   function ops in $Profile -> $shimSrc\ops.ps1 (new shells; or . `$PROFILE now)"
    if ($writtenDests.Count -eq 0) { Write-Host "      the plugin's copy (no skills dir written) - run this again after a plugin update" }
    Write-Host "      remove: delete the '# >>> skillator ops >>>' block from that file"
    if ($dups -gt 0) { Write-Host "      removed $dups duplicate ops block(s) from $Profile" -ForegroundColor Yellow }
  }
}
