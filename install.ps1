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
# codex has two: the codex binary reads $CODEX_HOME\skills, while ~\.agents\skills is
# the shared cross-agent dir other tools still read - so both are kept in sync.
$targets = [ordered]@{
  'claude-code' = @{ Marker = "$HOME\.claude"; Dests = @("$HOME\.claude\skills") }
  'cursor'      = @{ Marker = "$HOME\.cursor"; Dests = @("$HOME\.cursor\skills") }
  'codex'       = @{ Marker = $codexHome;      Dests = @("$codexHome\skills", "$HOME\.agents\skills") }
  'antigravity' = @{ Marker = "$HOME\.gemini"; Dests = @("$HOME\.gemini\config\skills") }
  'pi'          = @{ Marker = "$HOME\.pi";     Dests = @("$HOME\.pi\skills") }
}

# Claude Code can also have them via the plugin marketplace — that counts as installed.
$pluginDirs = @(Get-ChildItem "$HOME\.claude\plugins" -Recurse -Depth 3 -Directory `
                  -Filter 'skillator' -ErrorAction SilentlyContinue)

$skills = Get-ChildItem $src -Directory

foreach ($cli in $targets.Keys) {
  $marker = $targets[$cli].Marker
  if (-not (Test-Path $marker) -and -not (Get-Command $cli -ErrorAction SilentlyContinue)) {
    Write-Host "skip  $cli (not installed)" -ForegroundColor DarkGray
    continue
  }

  # Claude Code's plugin install already provides every skill — leave it alone.
  if ($cli -eq 'claude-code' -and $pluginDirs.Count -gt 0) {
    Write-Host "ok    claude-code (installed via plugin: $($pluginDirs[0].FullName))" -ForegroundColor DarkGray
    continue
  }

  foreach ($dest in $targets[$cli].Dests) {
    # a skill symlinked to this repo is live - never replace it with a stale copy
    $linked = @(Get-ChildItem $dest -Directory -ErrorAction SilentlyContinue |
                Where-Object { $_.LinkType -eq 'SymbolicLink' -and "$($_.Target)" -like "$src*" } |
                ForEach-Object { $_.Name })
    $missing = @($skills | Where-Object {
      $_.Name -notin $linked -and
      ($Force -or -not (Test-Path (Join-Path $dest "$($_.Name)\SKILL.md")))
    })

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
    }
  }
}

Write-Host "`nPrime Agent: no markdown-skill loader - point its AGENTS.md at $src\<skill>\SKILL.md."
