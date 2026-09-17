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
# See install.sh for the reasoning and the A73 residue. Probe dir OR CLI on PATH,
# matching how row selection below decides a host is installed.
# See install.sh: row selection re-validates the marker, so this must be a path that
# EXISTS when a host was found (and an absolute one - a relative name would resolve
# against the current location and could match something by accident).
$sharedMarker = [System.IO.Path]::GetFullPath((Join-Path $HOME 'no-such-shared-host'))
foreach ($c in @('codex','pi','gemini','antigravity')) {
  $d = if ($c -eq 'codex') { $codexHome }
       elseif ($c -eq 'antigravity') { Join-Path $HOME '.gemini' }
       else { Join-Path $HOME ".$c" }
  if ((Test-Path $d) -or (Get-Command $c -ErrorAction SilentlyContinue)) { $sharedMarker = $HOME; break }
}

$targets = [ordered]@{
  # A65 - keep in sync with install.sh, which carries the reasoning for each path.
  # See install.sh: marked by a host that reads the shared dir and has no
  # guaranteed dir of its own, NOT by $HOME - Cursor reads it too and would
  # otherwise register every skill twice.
  'shared'      = @{ Marker = $sharedMarker;    Dests = @("$HOME\.agents\skills") }
  'claude-code' = @{ Marker = "$HOME\.claude"; Dests = @("$HOME\.claude\skills") }
  'cursor'      = @{ Marker = "$HOME\.cursor"; Dests = @("$HOME\.cursor\skills") }
  'codex'       = @{ Marker = $codexHome;       Dests = @("$codexHome\skills") }
  'antigravity' = @{ Marker = "$HOME\.gemini"; Dests = @("$HOME\.gemini\config\skills") }
  'pi'          = @{ Marker = "$HOME\.pi";     Dests = @("$HOME\.pi\agent\skills", "legacy:$HOME\.pi\skills") }
}

# Claude Code can also have them via the plugin marketplace — that counts as installed.
$pluginDirs = @(Get-ChildItem "$HOME\.claude\plugins" -Recurse -Depth 3 -Directory `
                  -Filter 'skillator' -ErrorAction SilentlyContinue)

$skills = Get-ChildItem $src -Directory

# Destinations this installer used to fill and no longer does - see install.sh.
# Removes only a <dest>\<name>\ matching a skill in this repo that also has a
# SKILL.md, so a hand-made skill sharing a name survives.
function Prune-DroppedDest($dead) {
  if (-not (Test-Path $dead)) { return }
  # never delete through a symlink - Remove-Item would take the target, not the link
  if ((Get-Item $dead -Force).LinkType) { return }
  $found = 0
  foreach ($s in Get-ChildItem $src -Directory) {
    if (-not (Test-Path (Join-Path $dead "$($s.Name)\SKILL.md"))) { continue }
    $found++
    if ($found -eq 1) { Write-Host "prune $dead (no longer written)" }
    if ($DryRun) { Write-Host "        would remove $($s.Name)" }
    else { Remove-Item -Recurse -Force (Join-Path $dead $s.Name); Write-Host "        - $($s.Name)" }
  }
  if ($found -eq 0 -or $DryRun) { return }
  # Same ownership test as the skills: a doc goes only if byte-identical to the one
  # this repo ships, a dir only if a file we ship is inside it. A blanket delete here
  # destroyed a user's own practice/ directory in review.
  foreach ($f in 'PLATFORMS.md','PRACTICE.md','WORKFLOW.md') {
    $theirs = Join-Path $dead $f; $ours = Join-Path $PSScriptRoot $f
    if ((Test-Path $theirs) -and (Test-Path $ours) -and
        ((Get-Content $ours -Raw) -eq (Get-Content $theirs -Raw))) {
      Remove-Item -Force $theirs
    }
  }
  if (Test-Path (Join-Path $dead 'practice\scripts\taskwork.sh')) {
    Remove-Item -Recurse -Force (Join-Path $dead 'practice')
  }
  if (Test-Path (Join-Path $dead 'references\anti-slop.md')) {
    Remove-Item -Recurse -Force (Join-Path $dead 'references')
  }
  if (-not (Get-ChildItem $dead -Force)) { Remove-Item -Force $dead -ErrorAction SilentlyContinue }
}

# A73: Gemini CLI reads ~/.agents/skills and dedupes ~/.gemini/skills against it.
Prune-DroppedDest (Join-Path $HOME '.gemini\skills')

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
    # legacy: refreshed when it already exists, never created - see install.sh
    if ($dest.StartsWith('legacy:')) {
      $dest = $dest.Substring(7)
      if (-not (Test-Path $dest)) { continue }
    }
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
