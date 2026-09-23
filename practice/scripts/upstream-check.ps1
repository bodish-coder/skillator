# Has an upstream that design-arwen absorbed changed since (F23c)? Windows twin
# of upstream-check.sh, which carries the full reasoning; keep the two in step.
#
#   upstream-check.ps1 [-Daily] [manifest]   default: skills/design-arwen/UPSTREAM.md
#   upstream-check.ps1 -Selftest             (--daily / --selftest also accepted)
#
# Per row of the "## Upstreams" table, one line:
#   unchanged <name> <sha7>
#   changed   <name> <old7>..<new7> <compare-url>
#   error     <name> <reason>
# Exit 0 all unchanged, 1 any changed, 2 any error. An error is never unchanged.
# A path is changed when the latest commit touching it is neither the absorbed
# commit nor an ancestor of it.
#
# Fetch: gh api when gh is installed and logged in, else a blob-less clone.
# $env:UPSTREAM_CHECK_BACKEND = gh|git forces one. $env:UPSTREAM_CHECK_FETCH =
# <path to a .ps1> replaces both, same contract as the .sh:
#   latest <owner/repo> <path>          print the sha, nonzero exit on failure
#   contains <owner/repo> <tip> <sha>   exit 0 if sha is tip or its ancestor,
#                                       1 if not, else 2
# -Daily: skip if a run already finished today; the stamp is
# <git-common-dir>/skillator/upstream-check.day, written only on exit 0 or 1.
$ErrorActionPreference = 'Continue'
$prog = 'upstream-check.ps1'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = (Resolve-Path (Join-Path $here '..\..')).Path

$Daily = $false; $Selftest = $false; $Manifest = $null
foreach ($a in $args) {
  switch -regex ($a) {
    '^--?daily$'    { $Daily = $true; continue }
    '^--?selftest$' { $Selftest = $true; continue }
    '^-'            { [Console]::Error.WriteLine("usage: $prog [-Daily] [manifest] | -Selftest"); exit 2 }
    default {
      if ($null -ne $Manifest) { [Console]::Error.WriteLine("usage: $prog [-Daily] [manifest] | -Selftest"); exit 2 }
      $Manifest = $a
    }
  }
}

function Get-Rows([string]$path) {
  $on = $false
  foreach ($l in (Get-Content -LiteralPath $path -Encoding UTF8)) {
    if ($l -match '^## ') { $on = ($l -match '^## Upstreams\s*$'); continue }
    if (-not $on -or $l -notmatch '^\|') { continue }
    $c = $l.Split('|')
    if ($c.Count -lt 6) { continue }
    $name = $c[1].Trim()
    if ($name -eq 'Name' -or $name -match '^-+$') { continue }
    $paths = @(($c[3] -replace '<br>', ' ' -replace '`', '').Split(' ', [StringSplitOptions]::RemoveEmptyEntries))
    [pscustomobject]@{
      Name = $name
      Repo = ($c[2] -replace '`', '').Trim()
      Paths = $paths
      Sha = ($c[4] -replace '`', '').Trim()
    }
  }
}

$script:backend = $null
$script:tmp = $null

# Every backend returns @{ Code = 0|1|2; Out = '<sha or empty>' }.
function Invoke-Gh([string]$op, [string]$repo, [string]$x, [string]$y) {
  if ($op -eq 'latest') {
    $o = & gh api "repos/$repo/commits?path=$x&per_page=1" --jq '.[0].sha' 2>$null
    if ($LASTEXITCODE -ne 0) { return @{ Code = 2; Out = '' } }
    $o = "$o".Trim()
    if ($o -eq '' -or $o -eq 'null') { return @{ Code = 2; Out = '' } }
    return @{ Code = 0; Out = $o }
  }
  $st = & gh api "repos/$repo/compare/$y...$x" --jq .status 2>$null
  if ($LASTEXITCODE -ne 0) { return @{ Code = 2; Out = '' } }
  switch ("$st".Trim()) {
    'identical' { return @{ Code = 0; Out = '' } }
    'ahead'     { return @{ Code = 0; Out = '' } }
    'behind'    { return @{ Code = 1; Out = '' } }
    'diverged'  { return @{ Code = 1; Out = '' } }
  }
  return @{ Code = 2; Out = '' }
}

function Invoke-Git([string]$op, [string]$repo, [string]$x, [string]$y) {
  $d = Join-Path $script:tmp ('clone-' + ($repo -replace '/', '_'))
  if (-not (Test-Path -LiteralPath $d)) {
    & git clone --quiet --filter=blob:none --no-checkout "https://github.com/$repo.git" $d 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { Remove-Item -Recurse -Force -LiteralPath $d -ErrorAction SilentlyContinue; return @{ Code = 2; Out = '' } }
  }
  if ($op -eq 'latest') {
    $o = & git -C $d log -1 --format=%H HEAD -- $x 2>$null
    if ($LASTEXITCODE -ne 0 -or "$o".Trim() -eq '') { return @{ Code = 2; Out = '' } }
    return @{ Code = 0; Out = "$o".Trim() }
  }
  foreach ($s in @($x, $y)) {
    & git -C $d cat-file -e "$s^{commit}" 2>$null
    if ($LASTEXITCODE -ne 0) { return @{ Code = 2; Out = '' } }
  }
  & git -C $d merge-base --is-ancestor $y $x 2>$null
  $rc = $LASTEXITCODE
  if ($rc -eq 0 -or $rc -eq 1) { return @{ Code = $rc; Out = '' } }
  return @{ Code = 2; Out = '' }
}

function Invoke-Fetch([string]$op, [string]$repo, [string]$x, [string]$y) {
  if ($script:backend -eq 'stub') {
    $global:LASTEXITCODE = 0
    $o = & $env:UPSTREAM_CHECK_FETCH $op $repo $x $y 2>$null
    return @{ Code = $LASTEXITCODE; Out = "$o".Trim() }
  }
  if ($script:backend -eq 'gh') { return Invoke-Gh $op $repo $x $y }
  return Invoke-Git $op $repo $x $y
}

function Select-Backend {
  if ($env:UPSTREAM_CHECK_FETCH) { $script:backend = 'stub'; return }
  if ($env:UPSTREAM_CHECK_BACKEND) {
    if ($env:UPSTREAM_CHECK_BACKEND -notin @('gh', 'git')) {
      [Console]::Error.WriteLine("${prog}: UPSTREAM_CHECK_BACKEND must be gh or git"); exit 2
    }
    $script:backend = $env:UPSTREAM_CHECK_BACKEND; return
  }
  $script:backend = 'git'
  if (Get-Command gh -ErrorAction SilentlyContinue) {
    & gh auth status 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $script:backend = 'gh' }
  }
}

function Test-Sha([string]$s) { return $s -cmatch '^[0-9a-f]{40}$' }

# Writes one line, returns 0/1/2.
function Test-Upstream($r) {
  $n = $r.Name
  if ($r.Repo -notmatch '/') { Write-Output "error     $n bad repo '$($r.Repo)'"; return 2 }
  if (-not (Test-Sha $r.Sha)) { Write-Output "error     $n absorbed commit is not a 40-hex sha: '$($r.Sha)'"; return 2 }
  if ($r.Paths.Count -eq 0) { Write-Output "error     $n no watched paths"; return 2 }
  $new = ''
  foreach ($p in $r.Paths) {
    $f = Invoke-Fetch 'latest' $r.Repo $p ''
    if ($f.Code -ne 0) { Write-Output "error     $n cannot read latest commit for $($r.Repo):$p"; return 2 }
    $latest = $f.Out
    if (-not (Test-Sha $latest)) { Write-Output "error     $n bad sha for $($r.Repo):${p}: '$latest'"; return 2 }
    if ($latest -eq $r.Sha) { continue }
    $c = (Invoke-Fetch 'contains' $r.Repo $r.Sha $latest).Code
    if ($c -eq 0) { continue }
    if ($c -ne 1) { Write-Output "error     $n cannot compare $($r.Sha)..$latest in $($r.Repo)"; return 2 }
    if ($new -eq '') { $new = $latest }
    elseif ($new -ne $latest) {
      $c = (Invoke-Fetch 'contains' $r.Repo $latest $new).Code
      if ($c -eq 0) { $new = $latest }
      elseif ($c -ne 1) { Write-Output "error     $n cannot order $new and $latest"; return 2 }
    }
  }
  if ($new -eq '') { Write-Output "unchanged $n $($r.Sha.Substring(0, 7))"; return 0 }
  Write-Output ("changed   $n $($r.Sha.Substring(0, 7))..$($new.Substring(0, 7)) " +
    "https://github.com/$($r.Repo)/compare/$($r.Sha)...$new")
  return 1
}

function Invoke-Check([string]$path) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    [Console]::Error.WriteLine("${prog}: manifest not found: $path"); return 2
  }
  $rows = @(Get-Rows $path)
  if ($rows.Count -eq 0) { [Console]::Error.WriteLine("${prog}: no rows under '## Upstreams' in $path"); return 2 }
  Select-Backend
  $worst = 0
  foreach ($r in $rows) {
    $res = @(Test-Upstream $r)
    $rc = $res[-1]
    if ($res.Count -gt 1) { $res[0..($res.Count - 2)] | ForEach-Object { Write-Output $_ } }
    if ($rc -gt $worst) { $worst = $rc }
  }
  return $worst
}

function Invoke-Selftest {
  $st = Join-Path ([IO.Path]::GetTempPath()) ('upcheck-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $st | Out-Null
  try {
    $A = 'a' * 40; $B = 'b' * 40; $C = 'c' * 40; $D = 'd' * 40
    # o/same stays at A; o/old's latest B is an ancestor of A; o/moved moved to
    # C (p1) and D (p2), D the newer; o/down is unreachable.
    $stub = @"
param([string]`$op, [string]`$repo, [string]`$x, [string]`$y)
switch ("`$op `$repo `$x") {
  'latest o/same a/b' { Write-Output '$A'; exit 0 }
  'latest o/old a'    { Write-Output '$B'; exit 0 }
  'latest o/moved p1' { Write-Output '$C'; exit 0 }
  'latest o/moved p2' { Write-Output '$D'; exit 0 }
  'contains o/old $A'   { if (`$y -eq '$B') { exit 0 }; exit 1 }
  'contains o/moved $A' { exit 1 }
  'contains o/moved $D' { if (`$y -eq '$C') { exit 0 }; exit 1 }
  'contains o/moved $C' { exit 1 }
}
exit 2
"@
    Set-Content -LiteralPath (Join-Path $st 'stub.ps1') -Value $stub -Encoding ascii
    $env:UPSTREAM_CHECK_FETCH = Join-Path $st 'stub.ps1'
    $me = $MyInvocation.PSCommandPath
    if (-not $me) { $me = Join-Path $here $prog }
    function Fail([string]$m) { throw "FAIL: $m" }
    function Mk([string]$f, [string[]]$rows) {
      $t = @('# x', '', '## Upstreams', '', '| Name | Repo | Watched paths | Absorbed commit | Absorbed | Sections |', '|---|---|---|---|---|---|')
      $t += $rows
      $t += @('', '## Other', "| not | a | row | $A | x | y |")
      Set-Content -LiteralPath (Join-Path $st $f) -Value $t -Encoding utf8
      return (Join-Path $st $f)
    }
    function Run([string[]]$a) {
      $o = & powershell -NoProfile -ExecutionPolicy Bypass -File $me @a 2>$null
      return @{ Rc = $LASTEXITCODE; Out = (@($o) -join "`n") }
    }
    $rSame = "| same | ``o/same`` | ``a/b`` | ``$A`` | d | s |"
    $rOld = "| old | ``o/old`` | ``a`` | ``$A`` | d | s |"
    $rMoved = "| moved | ``o/moved`` | ``p1``<br>``p2`` | ``$A`` | d | s |"
    $rDown = "| down | ``o/down`` | ``x`` | ``$A`` | d | s |"

    $r = Run @(Mk 'm0' @($rSame, $rOld))
    if ($r.Rc -ne 0) { Fail "unchanged: exit $($r.Rc), want 0: $($r.Out)" }
    if (([regex]::Matches($r.Out, '(?m)^unchanged ')).Count -ne 2) { Fail "unchanged: want 2 unchanged lines: $($r.Out)" }
    if ($r.Out -match 'not ') { Fail 'a table outside ## Upstreams was parsed' }

    $m1 = Mk 'm1' @($rSame, $rMoved)
    $r = Run @($m1)
    if ($r.Rc -ne 1) { Fail "changed: exit $($r.Rc), want 1: $($r.Out)" }
    if ($r.Out -notmatch "(?m)^changed   moved aaaaaaa\.\.ddddddd https://github\.com/o/moved/compare/$A\.\.\.$D$") {
      Fail "changed: want old..newest + compare url: $($r.Out)"
    }

    $m2 = Mk 'm2' @($rSame, $rMoved, $rDown)
    $r = Run @($m2)
    if ($r.Rc -ne 2) { Fail "network failure: exit $($r.Rc), want 2: $($r.Out)" }
    if ($r.Out -notmatch '(?m)^error     down ') { Fail "network failure: want an error line: $($r.Out)" }
    if ($r.Out -match '(?m)^unchanged down') { Fail 'network failure reported as unchanged' }
    if ($r.Out -notmatch '(?m)^changed   moved') { Fail "a failure hid another row's change: $($r.Out)" }

    $r = Run @(Mk 'm3' @("| bad | ``o/same`` | ``a`` | ``abc123`` | d | s |"))
    if ($r.Rc -ne 2) { Fail "short sha: exit $($r.Rc), want 2" }
    $r = Run @(Mk 'm4' @())
    if ($r.Rc -ne 2) { Fail "empty table: exit $($r.Rc), want 2" }
    $r = Run @((Join-Path $st 'nope'))
    if ($r.Rc -ne 2) { Fail "missing manifest: exit $($r.Rc), want 2" }

    $repo = Join-Path $st 'repo'
    & git init -q $repo 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail 'git init' }
    $stamp = Join-Path $repo '.git\skillator\upstream-check.day'
    Push-Location $repo
    try {
      $r = Run @('-Daily', $m2)
      if ($r.Rc -ne 2) { Fail "daily failed run: exit $($r.Rc)" }
      if (Test-Path -LiteralPath $stamp) { Fail 'daily: stamp written on exit 2' }
      $r = Run @('--daily', $m1)
      if ($r.Rc -ne 1) { Fail "daily first run: exit $($r.Rc), want 1" }
      if (-not (Test-Path -LiteralPath $stamp) -or (Get-Content -LiteralPath $stamp).Trim() -ne ((Get-Date).ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture))) { Fail 'daily: no stamp' }
      $r = Run @('-Daily', $m1)
      if ($r.Rc -ne 0 -or $r.Out -notmatch '^skipped:') { Fail "daily second run not skipped: $($r.Rc) $($r.Out)" }
    } finally { Pop-Location }
    Write-Output 'ok - upstream-check.ps1 selftest'
    return 0
  } catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    return 1
  } finally {
    Remove-Item Env:UPSTREAM_CHECK_FETCH -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force -LiteralPath $st -ErrorAction SilentlyContinue
  }
}

if ($Selftest) {
  $res = @(Invoke-Selftest)
  if ($res.Count -gt 1) { $res[0..($res.Count - 2)] | ForEach-Object { Write-Output $_ } }
  exit $res[-1]
}

if (-not $Manifest) { $Manifest = Join-Path $root 'skills\design-arwen\UPSTREAM.md' }
$today = (Get-Date).ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
$stamp = $null
if ($Daily) {
  $g = & git rev-parse --git-common-dir 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $g) { [Console]::Error.WriteLine("${prog}: -Daily needs a git repo for its stamp"); exit 2 }
  $g = "$g".Trim()
  if (-not [IO.Path]::IsPathRooted($g)) { $g = Join-Path (Get-Location).Path $g }
  $stamp = Join-Path $g 'skillator\upstream-check.day'
  if ((Test-Path -LiteralPath $stamp) -and ((Get-Content -LiteralPath $stamp -TotalCount 1) -eq $today)) {
    Write-Output "skipped: upstreams already checked today ($stamp)"
    exit 0
  }
}

$script:tmp = Join-Path ([IO.Path]::GetTempPath()) ('upcheck-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $script:tmp | Out-Null
try {
  $res = @(Invoke-Check $Manifest)
  $rc = [int]$res[-1]
  if ($res.Count -gt 1) { $res[0..($res.Count - 2)] | ForEach-Object { Write-Output $_ } }
} finally {
  Remove-Item -Recurse -Force -LiteralPath $script:tmp -ErrorAction SilentlyContinue
}
if ($stamp -and $rc -le 1) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $stamp) | Out-Null
  Set-Content -LiteralPath $stamp -Value $today -Encoding ascii
}
exit $rc
