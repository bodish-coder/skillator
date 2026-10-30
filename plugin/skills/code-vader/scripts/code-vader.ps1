# code-vader: unified pre-commit diff review helper replicating Claude Code
# /code-review (correctness & safety) and Ponytail / code-yoda (restraint,
# anti-bloat, and shortcut/ponytail debt ledger) across all hosts (F125).
# Windows twin of code-vader.sh; keep the two in step.
#
#   code-vader.ps1 [collect] [-Repo DIR] [-Staged|-Unstaged|-Auto]
#   code-vader.ps1 format [-Target LABEL] [FINDINGS_FILE]
#   code-vader.ps1 -SelfTest   (--selftest / -Selftest also accepted)
$ErrorActionPreference = 'Continue'
$prog = 'code-vader.ps1'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

function Show-Usage {
  [Console]::Error.WriteLine("usage: $prog [collect] [-Repo DIR] [-Staged|-Unstaged|-Auto]")
  [Console]::Error.WriteLine("       $prog format [-Target LABEL] [FINDINGS_FILE]")
  [Console]::Error.WriteLine("       $prog -SelfTest")
  exit 2
}

function Fail-Die([string]$msg, [int]$code = 2) {
  [Console]::Error.WriteLine("${prog}: $msg")
  exit $code
}

function Parse-MarkerBody([string]$rawBody) {
  $body = $rawBody.Trim()
  $body = $body -replace '\s*(-->|\*/)\s*$', ''
  $body = $body.Trim()
  if ($body -match '^(.*?)trigger:\s*(.*)$') {
    $before = ($Matches[1] -replace '[,;.\-\s]+$', '').Trim()
    $trig = ($Matches[2].Trim() -replace '\.\s*$', '').Trim('"')
    if (-not $before) { $before = $body }
    if (-not $trig) { $trig = 'no-trigger' }
    return @{ What = $before; Ceiling = $before; Trigger = $trig }
  }
  $idx = $body.IndexOf(',')
  if ($idx -ge 0) {
    $ceil = $body.Substring(0, $idx).Trim()
    $rest = ($body.Substring($idx + 1).Trim() -replace '\.\s*$', '')
    if ($rest -match '^(if |when |once |until |add |switch |move |replace |per-|at |after )') {
      return @{ What = $ceil; Ceiling = $ceil; Trigger = $rest }
    }
    return @{ What = $body; Ceiling = $body; Trigger = 'no-trigger' }
  }
  return @{ What = $body; Ceiling = $body; Trigger = 'no-trigger' }
}

function Invoke-Collect([string[]]$rest) {
  $repo = '.'
  $mode = 'auto'
  $i = 0
  while ($i -lt $rest.Count) {
    $a = $rest[$i]
    switch -regex ($a) {
      '^--?repo$' {
        if ($i + 1 -ge $rest.Count) { Show-Usage }
        $repo = $rest[$i + 1]; $i += 2; continue
      }
      '^--?staged$'   { $mode = 'staged'; $i++; continue }
      '^--?unstaged$' { $mode = 'unstaged'; $i++; continue }
      '^--?auto$'     { $mode = 'auto'; $i++; continue }
      default         { Show-Usage }
    }
  }

  if (-not (Test-Path -LiteralPath $repo -PathType Container)) {
    Fail-Die "repository directory not found: $repo" 2
  }
  & git -c "safe.directory=*" -C $repo rev-parse --is-inside-work-tree >$null 2>$null
  if ($LASTEXITCODE -ne 0) {
    Fail-Die "not a git repository: $repo" 2
  }

  $target = $mode
  if ($mode -eq 'auto') {
    & git -c "safe.directory=*" -C $repo diff --cached --quiet 2>$null
    if ($LASTEXITCODE -ne 0) {
      $target = 'staged'
    } else {
      & git -c "safe.directory=*" -C $repo diff --quiet 2>$null
      if ($LASTEXITCODE -ne 0) {
        $target = 'unstaged'
      } else {
        $target = 'empty'
      }
    }
  } elseif ($mode -eq 'staged') {
    & git -c "safe.directory=*" -C $repo diff --cached --quiet 2>$null
    if ($LASTEXITCODE -eq 0) { $target = 'empty' }
  } elseif ($mode -eq 'unstaged') {
    & git -c "safe.directory=*" -C $repo diff --quiet 2>$null
    if ($LASTEXITCODE -eq 0) { $target = 'empty' }
  }

  if ($target -eq 'empty') {
    Write-Output 'target: empty'
    Write-Output 'files: 0'
    Write-Output 'markers: 0 total, 0 no-trigger.'
    exit 0
  }

  if ($target -eq 'staged') {
    $filesRaw = @(& git -c "safe.directory=*" -C $repo diff --cached --name-only --diff-filter=ACMR 2>$null)
    $diffOut = (@(& git -c "safe.directory=*" -C $repo diff --cached --no-color -U3 2>$null) -join "`n")
  } else {
    $filesRaw = @(& git -c "safe.directory=*" -C $repo diff --name-only --diff-filter=ACMR 2>$null)
    $diffOut = (@(& git -c "safe.directory=*" -C $repo diff --no-color -U3 2>$null) -join "`n")
  }

  $files = @($filesRaw | Where-Object { $_ -and "$_".Trim() -ne '' } | ForEach-Object { "$_".Trim() })
  Write-Output "target: $target"
  Write-Output "files: $($files.Count)"
  Write-Output 'changed_files:'
  foreach ($f in $files) {
    Write-Output "  $f"
  }

  Write-Output 'debt_markers:'
  $mCnt = 0
  $ntCnt = 0
  foreach ($f in $files) {
    if ($f -match '\.(md|txt|rst|adoc|jsonl|log)$') { continue }
    $full = Join-Path $repo $f
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { continue }
    $lines = [IO.File]::ReadAllLines($full, [Text.Encoding]::UTF8)
    for ($ln = 0; $ln -lt $lines.Count; $ln++) {
      $lineText = $lines[$ln]
      if ($lineText -notmatch '(#|//|--|;|%|<!--|/\*|^\s*\*).*\b(shortcut|ponytail):') { continue }
      if ($lineText -match '(#shortcut:[a-zA-Z]|--shortcut:|Ctrl\+|Alt\+|Cmd\+)') { continue }
      $body = $lineText -replace '^.*\b(shortcut|ponytail):\s*', ''
      $p = Parse-MarkerBody $body
      $lno = $ln + 1
      $mCnt++
      if ($p.Trigger -eq 'no-trigger') {
        $ntCnt++
        Write-Output "  ${f}:${lno}  -  $($p.What). ceiling: `"$($p.Ceiling)`". trigger: no-trigger."
      } else {
        Write-Output "  ${f}:${lno}  -  $($p.What). ceiling: `"$($p.Ceiling)`". trigger: `"$($p.Trigger)`"."
      }
    }
  }
  if ($mCnt -eq 0) {
    Write-Output '  No shortcut debt. Clean ledger.'
  }
  Write-Output "markers: $mCnt total, $ntCnt no-trigger."
  Write-Output 'diff:'
  if ($diffOut) { Write-Output $diffOut }
  exit 0
}

function Invoke-Format([string[]]$rest, [string]$stdinText) {
  $targetLabel = 'staged'
  $infile = ''
  $i = 0
  while ($i -lt $rest.Count) {
    $a = $rest[$i]
    switch -regex ($a) {
      '^--?target$' {
        if ($i + 1 -ge $rest.Count) { Show-Usage }
        $targetLabel = $rest[$i + 1]; $i += 2; continue
      }
      '^-' { Show-Usage }
      default {
        if ($infile) { Show-Usage }
        $infile = $a; $i++
      }
    }
  }

  $rawLines = @()
  if ($infile) {
    if (-not (Test-Path -LiteralPath $infile -PathType Leaf)) {
      Fail-Die "findings file not found: $infile" 2
    }
    $rawLines = [IO.File]::ReadAllLines($infile, [Text.Encoding]::UTF8)
  } elseif ($stdinText) {
    $rawLines = $stdinText -split "`r?`n"
  }

  $findings = New-Object System.Collections.Generic.List[object]
  $markers = New-Object System.Collections.Generic.List[string]
  $mCnt = 0
  $ntCnt = 0
  $net = 0
  $blocking = 0

  foreach ($raw in $rawLines) {
    $line = "$raw".Trim()
    if (-not $line -or $line.StartsWith('#')) { continue }
    $parts = $line.Split('|')
    if ($parts[0].Trim() -ceq 'MARKER') {
      $loc  = if ($parts.Count -gt 1) { $parts[1].Trim() } else { '' }
      $what = if ($parts.Count -gt 2) { $parts[2].Trim() } else { '' }
      $ceil = if ($parts.Count -gt 3) { $parts[3].Trim() } else { '' }
      $trig = if ($parts.Count -gt 4) { $parts[4].Trim() } else { '' }
      if (-not $trig -or $trig -eq 'no-trigger') {
        $trigStr = 'no-trigger'
        $ntCnt++
        $blocking++
        $findings.Add([PSCustomObject]@{
          Rank = 3
          Loc = $loc
          Lens = 'debt:no-trigger'
          Sev = 'important'
          Claim = "shortcut marker `"$what`" has no revisit trigger"
          Fix = 'add a concrete revisit trigger to the comment'
          Lines = 0
        })
      } else {
        $trigStr = "`"$trig`""
      }
      $mCnt++
      $markers.Add("- $loc  -  $what. ceiling: `"$ceil`". trigger: $trigStr.")
      continue
    }

    $sev   = if ($parts.Count -gt 0) { $parts[0].Trim().ToLowerInvariant() } else { '' }
    $lens  = if ($parts.Count -gt 1) { $parts[1].Trim() } else { '' }
    $loc   = if ($parts.Count -gt 2) { $parts[2].Trim() } else { '' }
    $claim = if ($parts.Count -gt 3) { $parts[3].Trim() } else { '' }
    $fix   = if ($parts.Count -gt 4) { $parts[4].Trim() } else { '' }
    $lnStr = if ($parts.Count -gt 5) { $parts[5].Trim() } else { '0' }

    $rank = switch ($sev) {
      'critical'  { 1 }
      'high'      { 2 }
      'important' { 3 }
      'low'       { 4 }
      default     { Fail-Die "invalid severity: $sev" 2 }
    }
    if (-not $loc -or -not $claim) {
      Fail-Die "missing location or claim on line: $line" 2
    }
    if ($rank -le 3) { $blocking++ }
    $n = 0
    if ($lnStr -match '^-?\d+$') {
      $n = [Math]::Abs([int]$lnStr)
    }
    $net += $n
    $findings.Add([PSCustomObject]@{
      Rank = $rank
      Loc = $loc
      Lens = $lens
      Sev = $sev
      Claim = $claim
      Fix = $fix
      Lines = $n
    })
  }

  Write-Output '## Code-Vader Pre-Commit Review'
  Write-Output "target: $targetLabel"
  Write-Output ''
  Write-Output '### Ranked Findings'
  if ($findings.Count -eq 0) {
    Write-Output 'None.'
  } else {
    $sorted = @($findings | Sort-Object @{ Expression = { $_.Rank } }, @{ Expression = { $_.Loc } })
    for ($idx = 0; $idx -lt $sorted.Count; $idx++) {
      $item = $sorted[$idx]
      $num = $idx + 1
      $tail = if ($item.Lines -gt 0) { " (-$($item.Lines) lines)" } else { '' }
      if ($item.Fix) {
        Write-Output "$num. [$($item.Sev)] [$($item.Lens)] $($item.Loc)  -  $($item.Claim). Fix: $($item.Fix)$tail."
      } else {
        Write-Output "$num. [$($item.Sev)] [$($item.Lens)] $($item.Loc)  -  $($item.Claim)$tail."
      }
    }
  }

  Write-Output ''
  Write-Output '### Restraint & Debt Ledger'
  if ($mCnt -eq 0) {
    Write-Output 'No shortcut debt. Clean ledger.'
  } else {
    foreach ($m in $markers) { Write-Output $m }
  }
  Write-Output "markers: $mCnt total, $ntCnt no-trigger."
  if ($net -gt 0) {
    Write-Output "net: -$net lines possible."
  } else {
    Write-Output 'net: 0 lines (lean already).'
  }
  Write-Output ''
  if ($blocking -gt 0) {
    Write-Output 'CHANGES-REQUESTED'
    exit 1
  } else {
    Write-Output 'READY-TO-COMMIT: YES'
    exit 0
  }
}

function Invoke-Selftest {
  $st = Join-Path ([IO.Path]::GetTempPath()) ('code-vader-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $st | Out-Null
  $pass = 0; $failCnt = 0
  function Assert-Ok([bool]$cond, [string]$msg) {
    if ($cond) { $script:pass++ } else { [Console]::Error.WriteLine("FAIL: $msg"); $script:failCnt++ }
  }

  try {
    $me = $MyInvocation.PSCommandPath
    if (-not $me) { $me = Join-Path $here $prog }
    function Run-Vader([string[]]$a) {
      $pinfo = New-Object System.Diagnostics.ProcessStartInfo
      $pinfo.FileName = "powershell.exe"
      $argList = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', "`"$me`"") + $a
      $pinfo.Arguments = $argList -join ' '
      $pinfo.RedirectStandardOutput = $true
      $pinfo.RedirectStandardError = $true
      $pinfo.UseShellExecute = $false
      $pinfo.CreateNoWindow = $true
      $proc = [System.Diagnostics.Process]::Start($pinfo)
      $out = $proc.StandardOutput.ReadToEnd()
      $err = $proc.StandardError.ReadToEnd()
      $proc.WaitForExit()
      $full = if ($err) { "$out`n$err" } else { $out }
      return @{ Rc = $proc.ExitCode; Out = $full.Trim() }
    }

    $enc = New-Object Text.UTF8Encoding($false)

    # 1. Create a temp git repo and verify collect on staged and unstaged diffs + debt markers
    $repo = Join-Path $st 'repo'
    $srcDir = Join-Path $repo 'src'
    New-Item -ItemType Directory -Force -Path $srcDir | Out-Null
    & git -c "safe.directory=*" -c core.hooksPath=NUL -c commit.gpgsign=false -C $repo init -q -b main
    & git -c "safe.directory=*" -C $repo config user.name 'Test'
    & git -c "safe.directory=*" -C $repo config user.email 'test@example.invalid'
    $appPy = Join-Path $srcDir 'app.py'
    [IO.File]::WriteAllText($appPy, "def greet(name):`n    return `"hi `" + name`n", $enc)
    & git -c "safe.directory=*" -C $repo add src/app.py
    & git -c "safe.directory=*" -c commit.gpgsign=false -C $repo commit -qm 'init'

    # Empty diff check
    $r = Run-Vader @('collect', '-Repo', $repo)
    Assert-Ok ($r.Rc -eq 0) "empty diff exits 0, got $($r.Rc)"
    Assert-Ok ($r.Out -match '(?m)^target: empty$') "empty diff reports target: empty: $($r.Out)"

    # Stage changes with two shortcut/ponytail markers (one with trigger, one no-trigger)
    $updatedPy = @(
      '# shortcut: global lock, per-account locks when throughput exceeds 100 rps',
      '# ponytail: linear scan',
      'def greet(name):',
      '    return "hello " + name.strip()'
    ) -join "`n"
    [IO.File]::WriteAllText($appPy, "$updatedPy`n", $enc)
    & git -c "safe.directory=*" -C $repo add src/app.py

    $r = Run-Vader @('collect', '-Repo', $repo)
    Assert-Ok ($r.Rc -eq 0) "staged collect exits 0, got $($r.Rc)"
    Assert-Ok ($r.Out -match '(?m)^target: staged$') "staged collect reports target: staged: $($r.Out)"
    Assert-Ok ($r.Out -match '(?m)^files: 1$') "staged collect counts 1 changed file: $($r.Out)"
    Assert-Ok ($r.Out.Contains('src/app.py:1  -  global lock. ceiling: "global lock". trigger: "per-account locks when throughput exceeds 100 rps".')) "staged collect parses shortcut trigger: $($r.Out)"
    Assert-Ok ($r.Out.Contains('src/app.py:2  -  linear scan. ceiling: "linear scan". trigger: no-trigger.')) "staged collect flags no-trigger ponytail marker: $($r.Out)"
    Assert-Ok ($r.Out -match '(?m)^markers: 2 total, 1 no-trigger\.$') "staged collect totals markers: $($r.Out)"

    # 2. Format rankings: mixed severities & lenses -> sorted by severity then file:line, net lines summed, CHANGES-REQUESTED (exit 1)
    $f1 = Join-Path $st 'findings1.txt'
    $f1Body = @(
      'low|restraint:reuse|src/cli.ts:88|Duplicate padRight helper|reuse src/format.ts:padRight|-9',
      'important|restraint:yagni|src/cache.ts:10|AbstractCacheProvider has one implementation|inline into MemoryCache|-28',
      'critical|correctness|src/auth.ts:42|Unchecked verify return allows expired token|check err and return 401|0',
      'high|security|scripts/sync.sh:19|Unquoted variable in eval|pass positional args|0',
      'important|restraint:stdlib|src/util.py:55|Hand-rolled slug loop|use re.sub|-14',
      'MARKER|src/worker.ts:14|global lock|global lock|add sharded lock at 500 rps'
    ) -join "`n"
    [IO.File]::WriteAllText($f1, "$f1Body`n", $enc)

    $r = Run-Vader @('format', '-Target', 'staged (5 files)', $f1)
    Assert-Ok ($r.Rc -eq 1) "format with blocking findings exits 1, got $($r.Rc)"
    Assert-Ok ($r.Out -match '(?m)^1\. \[critical\] \[correctness\] src/auth\.ts:42  -  Unchecked verify return allows expired token\. Fix: check err and return 401\.$') "critical finding ranked #1: $($r.Out)"
    Assert-Ok ($r.Out -match '(?m)^2\. \[high\] \[security\] scripts/sync\.sh:19  -  Unquoted variable in eval\. Fix: pass positional args\.$') "high finding ranked #2: $($r.Out)"
    Assert-Ok ($r.Out -match '(?m)^3\. \[important\] \[restraint:yagni\] src/cache\.ts:10  -  AbstractCacheProvider has one implementation\. Fix: inline into MemoryCache \(-28 lines\)\.$') "important yagni finding ranked #3 with line count: $($r.Out)"
    Assert-Ok ($r.Out -match '(?m)^4\. \[important\] \[restraint:stdlib\] src/util\.py:55  -  Hand-rolled slug loop\. Fix: use re\.sub \(-14 lines\)\.$') "important stdlib finding ranked #4 with line count: $($r.Out)"
    Assert-Ok ($r.Out -match '(?m)^5\. \[low\] \[restraint:reuse\] src/cli\.ts:88  -  Duplicate padRight helper\. Fix: reuse src/format\.ts:padRight \(-9 lines\)\.$') "low reuse finding ranked #5: $($r.Out)"
    Assert-Ok ($r.Out -match '(?m)^net: -51 lines possible\.$') "net line estimate sums to -51: $($r.Out)"
    $lastLine = ($r.Out -split "`r?`n")[-1].Trim()
    Assert-Ok ($lastLine -ceq 'CHANGES-REQUESTED') "final line is CHANGES-REQUESTED, got '$lastLine'"

    # 3. Clean diff or low-only findings -> READY-TO-COMMIT: YES (exit 0)
    $fClean = Join-Path $st 'findings_clean.txt'
    $fCleanBody = @(
      'low|restraint:shrink|src/app.py:12|Comprehension over manual append|use list comprehension|-3',
      'MARKER|src/app.py:1|global lock|global lock|per-account locks at 100 rps'
    ) -join "`n"
    [IO.File]::WriteAllText($fClean, "$fCleanBody`n", $enc)

    $r = Run-Vader @('format', '-Target', 'staged (1 file)', $fClean)
    Assert-Ok ($r.Rc -eq 0) "low-only findings with triggered marker exits 0, got $($r.Rc): $($r.Out)"
    $lastLine = ($r.Out -split "`r?`n")[-1].Trim()
    Assert-Ok ($lastLine -ceq 'READY-TO-COMMIT: YES') "final line is READY-TO-COMMIT: YES, got '$lastLine'"

    # 4. A no-trigger debt marker blocks commit (CHANGES-REQUESTED, exit 1)
    $fDebt = Join-Path $st 'findings_debt.txt'
    [IO.File]::WriteAllText($fDebt, "MARKER|src/billing.py:7|global lock|global lock|no-trigger`n", $enc)
    $r = Run-Vader @('format', '-Target', 'staged (1 file)', $fDebt)
    Assert-Ok ($r.Rc -eq 1) "no-trigger marker blocks commit with exit 1, got $($r.Rc)"
    Assert-Ok ($r.Out.Contains('[important] [debt:no-trigger] src/billing.py:7')) "no-trigger marker surfaced in ranked findings: $($r.Out)"
    Assert-Ok ($r.Out -match '(?m)^markers: 1 total, 1 no-trigger\.$') "no-trigger count reported: $($r.Out)"

    # 5. Invalid severity rejected with exit 2
    $fBad = Join-Path $st 'findings_bad.txt'
    [IO.File]::WriteAllText($fBad, "blocker|correctness|a.py:1|bad|fix|0`n", $enc)
    $r = Run-Vader @('format', $fBad)
    Assert-Ok ($r.Rc -eq 2) "invalid severity rejected with exit 2, got $($r.Rc)"

    if ($failCnt -gt 0) { exit 1 }
    Write-Output "ok - code-vader.ps1 selftest ($pass/$pass passed)"
    exit 0
  } finally {
    Remove-Item -Recurse -Force -LiteralPath $st -ErrorAction SilentlyContinue
  }
}

$first = if ($args.Count -gt 0) { "$($args[0])" } else { 'collect' }
$tail  = if ($args.Count -gt 1) { @($args[1..($args.Count - 1)]) } else { @() }

switch -regex ($first) {
  '^--?selftest$' { if ($tail.Count -gt 0) { Show-Usage }; Invoke-Selftest }
  '^collect$'     { Invoke-Collect $tail }
  '^format$'      {
    $stdinContent = ''
    if (-not [Console]::IsInputRedirected) {
      # No piped input
    } else {
      $stdinContent = [Console]::In.ReadToEnd()
    }
    Invoke-Format $tail $stdinContent
  }
  '^-'            { Invoke-Collect @($args) }
  default         { Show-Usage }
}
