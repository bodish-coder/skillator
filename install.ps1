# Install skillator skills into the global skills dir of every agent CLI found.
# Skips any skill a CLI already has (including Claude Code's plugin install).
#   .\install.ps1            install what's missing
#   .\install.ps1 -DryRun    show what it would do
#   .\install.ps1 -Force     refresh skills that are already installed
#   .\install.ps1 -Link      install as symlinks into this repo (stay live on git pull)
# Claude Code is left to its plugin install whenever one exists, -Force included.
# Skills already symlinked to this repo are left alone - they are always current.
param([switch]$DryRun, [switch]$Force, [switch]$Link)

$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot 'skills'

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
  'antigravity' = @{ Marker = "$HOME\.gemini"; Dests = @("$HOME\.gemini\config\skills", "$HOME\.gemini\skills") }
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
    if ($DryRun) {
      Write-Host "        would refresh PLATFORMS.md PRACTICE.md WORKFLOW.md practice\ references\ in $dest"
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
      # LF, no BOM - the same bytes install.sh writes, so either twin reads the other's
      [IO.File]::WriteAllText((Join-Path $dest $manifest), (($shipped -join "`n") + "`n"))
    }
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
