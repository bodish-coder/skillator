# skillator-sync: sweep tracked UPSTREAM.md manifests, detect upstream commits,
# and absorb commit hashes after rule mapping and local updates (F124).
# Windows twin of skillator-sync.sh; keep the two in step.
#
#   skillator-sync.ps1 [check] [-Daily] [-SkillsDir DIR] [SKILL...]
#   skillator-sync.ps1 absorb <skill> <upstream-name> <40-hex-sha> [-Date YYYY-MM-DD] [-SkillsDir DIR]
#   skillator-sync.ps1 -Selftest   (--daily / --selftest / --skills-dir / --date also accepted)
$ErrorActionPreference = 'Continue'
$prog = 'skillator-sync.ps1'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$defaultSkillsDir = (Resolve-Path (Join-Path $here '..\..')).Path
$defaultChecker = (Resolve-Path (Join-Path $here '..\..\..\practice\scripts\upstream-check.ps1') -ErrorAction SilentlyContinue)
if ($defaultChecker) { $defaultChecker = $defaultChecker.Path } else { $defaultChecker = Join-Path $here '..\..\..\practice\scripts\upstream-check.ps1' }

function Show-Usage {
  [Console]::Error.WriteLine("usage: $prog [check] [-Daily] [-SkillsDir DIR] [SKILL...]")
  [Console]::Error.WriteLine("       $prog absorb <skill> <upstream-name> <40-hex-sha> [-Date YYYY-MM-DD] [-SkillsDir DIR]")
  [Console]::Error.WriteLine("       $prog -Selftest")
  exit 2
}

function Fail-Die([string]$msg, [int]$code = 2) {
  [Console]::Error.WriteLine("${prog}: $msg")
  exit $code
}

function Test-Sha40([string]$s) { return $s -cmatch '^[0-9a-f]{40}$' }

function Invoke-Sweep([string[]]$rest) {
  $daily = $false
  $skillsDir = $defaultSkillsDir
  $filters = @()
  $i = 0
  while ($i -lt $rest.Count) {
    $a = $rest[$i]
    switch -regex ($a) {
      '^--?daily$' { $daily = $true; $i++; continue }
      '^--?skills-?dir$' {
        if ($i + 1 -ge $rest.Count) { Show-Usage }
        $skillsDir = $rest[$i + 1]; $i += 2; continue
      }
      '^-' { Show-Usage }
      default { $filters += $a; $i++ }
    }
  }

  $chk = if ($env:SKILLATOR_SYNC_CHECKER) { $env:SKILLATOR_SYNC_CHECKER } else { $defaultChecker }
  if (-not (Test-Path -LiteralPath $chk -PathType Leaf)) { Fail-Die "upstream-check.ps1 not found at $chk" 2 }
  if (-not (Test-Path -LiteralPath $skillsDir -PathType Container)) { Fail-Die "skills directory not found: $skillsDir" 2 }

  $manifests = @()
  if ($filters.Count -gt 0) {
    foreach ($s in $filters) {
      $m = Join-Path (Join-Path $skillsDir $s) 'UPSTREAM.md'
      if (-not (Test-Path -LiteralPath $m -PathType Leaf)) { Fail-Die "manifest not found for skill '$s': $m" 2 }
      $manifests += $m
    }
  } else {
    $dirs = @(Get-ChildItem -LiteralPath $skillsDir -Directory | Sort-Object Name)
    foreach ($d in $dirs) {
      $m = Join-Path $d.FullName 'UPSTREAM.md'
      if (Test-Path -LiteralPath $m -PathType Leaf) { $manifests += $m }
    }
  }

  if ($manifests.Count -eq 0) { Fail-Die "no UPSTREAM.md manifests found in $skillsDir" 2 }

  $uCnt = 0; $cCnt = 0; $eCnt = 0
  $worst = 0
  foreach ($m in $manifests) {
    $skill = Split-Path -Leaf (Split-Path -Parent $m)
    $cArgs = @()
    if ($daily) { $cArgs += '-Daily' }
    $cArgs += $m
    $out = & powershell -NoProfile -ExecutionPolicy Bypass -File $chk @cArgs 2>&1
    $rc = $LASTEXITCODE
    if ($rc -gt $worst) { $worst = $rc }

    foreach ($raw in @($out)) {
      $line = "$raw".TrimEnd("`r", "`n")
      if ($line -eq '') { continue }
      if ($line.StartsWith('unchanged ')) {
        $r = $line.Substring(10)
        Write-Output "unchanged $skill $r"
        $uCnt++
      } elseif ($line.StartsWith('changed   ')) {
        $r = $line.Substring(10)
        Write-Output "changed   $skill $r"
        $cCnt++
      } elseif ($line.StartsWith('error     ')) {
        $r = $line.Substring(10)
        Write-Output "error     $skill $r"
        $eCnt++
      } elseif ($line.StartsWith('skipped:')) {
        Write-Output "skipped   $skill $line"
      } else {
        if ($rc -ge 2) {
          Write-Output "error     $skill $line"
          $eCnt++
        } else {
          Write-Output "info      $skill $line"
        }
      }
    }
  }

  Write-Output "summary: $uCnt unchanged, $cCnt changed, $eCnt error"
  exit $worst
}

function Invoke-Absorb([string[]]$rest) {
  $skillsDir = $defaultSkillsDir
  $day = (Get-Date).ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
  $pos = @()
  $i = 0
  while ($i -lt $rest.Count) {
    $a = $rest[$i]
    switch -regex ($a) {
      '^--?skills-?dir$' {
        if ($i + 1 -ge $rest.Count) { Show-Usage }
        $skillsDir = $rest[$i + 1]; $i += 2; continue
      }
      '^--?date$' {
        if ($i + 1 -ge $rest.Count) { Show-Usage }
        $day = $rest[$i + 1]; $i += 2; continue
      }
      '^-' { Show-Usage }
      default { $pos += $a; $i++ }
    }
  }

  if ($pos.Count -ne 3) { Show-Usage }
  $skill = $pos[0]; $upname = $pos[1]; $newsha = $pos[2]
  if (-not (Test-Sha40 $newsha)) { Fail-Die "absorb: commit must be a 40-hex sha, got '$newsha'" 2 }
  if ($day -notmatch '^\d{4}-\d{2}-\d{2}$') { Fail-Die "absorb: date must be YYYY-MM-DD, got '$day'" 2 }

  $manifest = Join-Path (Join-Path $skillsDir $skill) 'UPSTREAM.md'
  if (-not (Test-Path -LiteralPath $manifest -PathType Leaf)) { Fail-Die "absorb: manifest not found: $manifest" 2 }

  $lines = [IO.File]::ReadAllLines($manifest, [Text.Encoding]::UTF8)
  $on = $false; $found = $false
  $outLines = New-Object System.Collections.Generic.List[string]
  foreach ($l in $lines) {
    if ($l -match '^## ') {
      $on = ($l -match '^## Upstreams\s*$')
      $outLines.Add($l)
      continue
    }
    if ($on -and $l.StartsWith('|')) {
      $c = $l.Split('|')
      if ($c.Count -ge 7) {
        $n = $c[1].Trim()
        if ($n -ceq $upname) {
          $c[4] = " ``$newsha`` "
          $c[5] = " $day "
          $outLines.Add(($c -join '|'))
          $found = $true
          continue
        }
      }
    }
    $outLines.Add($l)
  }

  if (-not $found) { Fail-Die "absorb: upstream '$upname' not found under '## Upstreams' in $manifest" 2 }
  $enc = New-Object Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($manifest, (($outLines -join "`n") + "`n"), $enc)
  Write-Output "absorbed $skill $upname $($newsha.Substring(0, 7)) ($day)"
  exit 0
}

function Invoke-Selftest {
  $st = Join-Path ([IO.Path]::GetTempPath()) ('skillsync-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $st | Out-Null
  $script:pass = 0; $script:failCnt = 0
  function Assert-Ok([bool]$cond, [string]$msg) {
    if ($cond) { $script:pass++ } else { [Console]::Error.WriteLine("FAIL: $msg"); $script:failCnt++ }
  }
  try {
    $A = 'a' * 40; $B = 'b' * 40; $C = 'c' * 40
    $stub = @"
param([string]`$op, [string]`$repo, [string]`$x, [string]`$y)
switch -regex ("`$op `$repo") {
  '^latest org/alpha$' { Write-Output '$A'; exit 0 }
  '^latest org/beta$'  { Write-Output '$B'; exit 0 }
  '^latest org/gamma$' { Write-Output '$C'; exit 0 }
  '^contains org/beta$'  { exit 1 }
  '^contains org/gamma$' { exit 1 }
}
exit 2
"@
    $stubPath = Join-Path $st 'stub.ps1'
    [IO.File]::WriteAllText($stubPath, $stub, (New-Object Text.UTF8Encoding($false)))
    $env:UPSTREAM_CHECK_FETCH = $stubPath

    $sk1 = Join-Path $st 'skills\skill-one'
    $sk2 = Join-Path $st 'skills\skill-two'
    New-Item -ItemType Directory -Force -Path $sk1, $sk2 | Out-Null
    $enc = New-Object Text.UTF8Encoding($false)
    $m1Body = @(
      '# skill-one upstream', '', '## Upstreams', '',
      '| Name | Repo | Watched paths | Absorbed commit | Absorbed | Sections |',
      '|---|---|---|---|---|---|',
      "| alpha | ``org/alpha`` | ``SKILL.md`` | ``$A`` | 2026-10-01 | s1 |"
    ) -join "`n"
    [IO.File]::WriteAllText((Join-Path $sk1 'UPSTREAM.md'), "$m1Body`n", $enc)

    $m2Body = @(
      '# skill-two upstream', '', '## Upstreams', '',
      '| Name | Repo | Watched paths | Absorbed commit | Absorbed | Sections |',
      '|---|---|---|---|---|---|',
      "| beta | ``org/beta`` | ``SKILL.md`` | ``$A`` | 2026-10-01 | s2 |"
    ) -join "`n"
    [IO.File]::WriteAllText((Join-Path $sk2 'UPSTREAM.md'), "$m2Body`n", $enc)

    $me = $MyInvocation.PSCommandPath
    if (-not $me) { $me = Join-Path $here $prog }
    function Run-Sync([string[]]$a) {
      $o = & powershell -NoProfile -ExecutionPolicy Bypass -File $me @a 2>&1
      return @{ Rc = $LASTEXITCODE; Out = (@($o) -join "`n") }
    }

    $skillsRoot = Join-Path $st 'skills'

    # 1. Sweep detects 1 unchanged and 1 behind with compare link
    $r = Run-Sync @('check', '-SkillsDir', $skillsRoot)
    Assert-Ok ($r.Rc -eq 1) "sweep exit code should be 1 when behind, got $($r.Rc): $($r.Out)"
    Assert-Ok ($r.Out -match '(?m)^unchanged skill-one alpha aaaaaaa$') "sweep should report skill-one alpha unchanged: $($r.Out)"
    Assert-Ok ($r.Out -match "(?m)^changed   skill-two beta aaaaaaa\.\.bbbbbbb https://github\.com/org/beta/compare/$A\.\.\.$B$") "sweep should report skill-two beta changed with compare link: $($r.Out)"
    Assert-Ok ($r.Out -match '(?m)^summary: 1 unchanged, 1 changed, 0 error$') "sweep summary counts should match: $($r.Out)"

    # 2. Single-skill filter on up-to-date skill exits 0
    $r = Run-Sync @('check', '-SkillsDir', $skillsRoot, 'skill-one')
    Assert-Ok ($r.Rc -eq 0) "filtered check on skill-one should exit 0, got $($r.Rc)"

    # 3. Absorb updates SHA and date in UPSTREAM.md
    $r = Run-Sync @('absorb', 'skill-two', 'beta', $B, '-Date', '2026-10-30', '-SkillsDir', $skillsRoot)
    Assert-Ok ($r.Rc -eq 0) "absorb should exit 0, got $($r.Rc): $($r.Out)"
    Assert-Ok ($r.Out -match '(?m)^absorbed skill-two beta bbbbbbb \(2026-10-30\)$') "absorb output line format: $($r.Out)"
    $updated = [IO.File]::ReadAllText((Join-Path $sk2 'UPSTREAM.md'))
    Assert-Ok ($updated.Contains("| beta | ``org/beta`` | ``SKILL.md`` | ``$B`` | 2026-10-30 | s2 |")) "UPSTREAM.md row updated after absorb"

    # 4. Re-sweep after absorb exits 0 with all unchanged
    $r = Run-Sync @('check', '-SkillsDir', $skillsRoot)
    Assert-Ok ($r.Rc -eq 0) "post-absorb sweep should exit 0, got $($r.Rc): $($r.Out)"
    Assert-Ok ($r.Out -match '(?m)^unchanged skill-two beta bbbbbbb$') "post-absorb skill-two beta is unchanged: $($r.Out)"
    Assert-Ok ($r.Out -match '(?m)^summary: 2 unchanged, 0 changed, 0 error$') "post-absorb summary is 2 unchanged: $($r.Out)"

    # 5. Error handling: bad sha and unknown upstream
    $r = Run-Sync @('absorb', 'skill-two', 'beta', 'not-a-sha', '-SkillsDir', $skillsRoot)
    Assert-Ok ($r.Rc -eq 2) "bad sha rejected with exit 2, got $($r.Rc)"
    $r = Run-Sync @('absorb', 'skill-two', 'unknown', $B, '-SkillsDir', $skillsRoot)
    Assert-Ok ($r.Rc -eq 2) "unknown upstream rejected with exit 2, got $($r.Rc)"

    # 6. Real repo manifests parse cleanly under offline stub
    $realStub = @"
param([string]`$op, [string]`$repo, [string]`$x, [string]`$y)
switch ("`$op `$repo") {
  'latest DietrichGebert/ponytail'              { Write-Output '2a1fe842d078cf66ec7f3e6096a8ca4279c2cad7'; exit 0 }
  'latest anthropics/claude-code'               { Write-Output 'dbdd79cebfae5891f5b0fab6f7773ea520d289a7'; exit 0 }
  'latest emilkowalski/skills'                  { Write-Output '85e8e2363b713506e1d5b6e07a0eb2da66be1bc3'; exit 0 }
  'latest pbakaus/impeccable'                   { Write-Output '71a3341289b86b7b628dd40d5d69c1e686a181b0'; exit 0 }
  'latest nextlevelbuilder/ui-ux-pro-max-skill' { Write-Output 'dcc40ff5133ef78276117db0cc34e7b83cc8aeba'; exit 0 }
  'latest Jakeschincariol/replica-skill'        { Write-Output '77c9436fb3d18c3d58169efb8caf4fe906b0dc51'; exit 0 }
}
exit 2
"@
    $realStubPath = Join-Path $st 'real-stub.ps1'
    [IO.File]::WriteAllText($realStubPath, $realStub, $enc)
    $env:UPSTREAM_CHECK_FETCH = $realStubPath
    $r = Run-Sync @('check')
    Assert-Ok ($r.Rc -eq 0) "real manifests sweep exits 0 under matching stub, got $($r.Rc): $($r.Out)"
    Assert-Ok ($r.Out -match '(?m)^summary: 6 unchanged, 0 changed, 0 error$') "real manifests sweep checks all 6 upstream rows across code-yoda, design-arwen, clone-odo: $($r.Out)"

    if ($script:failCnt -gt 0) { exit 1 }
    Write-Output "ok - skillator-sync.ps1 selftest ($($script:pass)/$($script:pass) passed)"
    exit 0
  } finally {
    Remove-Item Env:UPSTREAM_CHECK_FETCH -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force -LiteralPath $st -ErrorAction SilentlyContinue
  }
}

$first = if ($args.Count -gt 0) { "$($args[0])" } else { 'check' }
$tail = if ($args.Count -gt 1) { @($args[1..($args.Count - 1)]) } else { @() }

switch -regex ($first) {
  '^--?selftest$' { if ($tail.Count -gt 0) { Show-Usage }; Invoke-Selftest }
  '^check$'       { Invoke-Sweep $tail }
  '^absorb$'      { Invoke-Absorb $tail }
  default         { Invoke-Sweep @($args) }
}
