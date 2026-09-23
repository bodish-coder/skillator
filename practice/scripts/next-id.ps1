# One allocator for every serial ID (F21). Windows twin of next-id.sh, which
# carries the full reasoning; keep the two in step. Same lock directory and
# counter file, so both can run against one clone.
#
#   next-id.ps1 <KIND> [board-path]      reserve and print the next number
#   next-id.ps1 -Peek <KIND> [board]     print it without reserving
#   next-id.ps1 -Runs <dir> RUN|S        also count staged-run files (F22)
#   next-id.ps1 -Count <n> <KIND>        reserve n in a row, one per line
#   next-id.ps1 -Selftest
#
# next = 1 + max(KIND ids on ticket lines of the local board; the same board
# path on every ref in refs/heads and refs/remotes; the counter
# <git-common-dir>/skillator/ids/<KIND>). Counter written back before printing,
# under a directory lock; a lock older than $env:NEXT_ID_STALE seconds
# (default 30) is broken. Sub-parts (A58c) count as their parent.
# -Runs <dir> adds relay-morpheus run files to the max, in the working tree and
# on every ref: RUN from the filename `run-<n>-`, S from stage rows `| <n> |`.
param(
  [string]$Kind,
  [string]$Board,
  [switch]$Peek,
  [string]$Runs = '',
  [string]$Count = '1',
  [switch]$Selftest
)
$ErrorActionPreference = 'Stop'
$prog = 'next-id.ps1'

function Usage {
  [Console]::Error.WriteLine("usage: $prog [-Peek] [-Count <n>] [-Runs <dir>] <KIND> [board-path]")
  [Console]::Error.WriteLine("       $prog -Selftest")
  exit 2
}

function Get-MaxId([string]$k, [string[]]$lines) {
  $m = 0
  $re = '^\s*- \[.\]\s*' + $k + '-?(\d+)[a-z]*([^A-Za-z0-9].*)?$'
  foreach ($l in $lines) {
    if ($l -cmatch $re) { $n = [int64]$Matches[1]; if ($n -gt $m) { $m = $n } }
  }
  return $m
}

function Now { [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() }

# Run ids from run-file names (run-3-slug.md, run-3.md); stage numbers from
# stage-table rows (| 12 | name | ...). Both return the max, 0 for none.
function Get-RunMax([string[]]$names) {
  $m = 0
  foreach ($x in $names) {
    if ("$x" -match '(^|[\\/])run-(\d+)(-[^\\/]*)?\.md$') { $n = [int64]$Matches[2]; if ($n -gt $m) { $m = $n } }
  }
  return $m
}
function Get-StageMax([string[]]$lines) {
  $m = 0
  foreach ($l in $lines) { if ("$l" -match '^\| *(\d+) *\|') { $n = [int64]$Matches[1]; if ($n -gt $m) { $m = $n } } }
  return $m
}

# Run git with args; return @(exitcode, stdout-lines). Never throws.
function Invoke-GitQuiet([string[]]$a) {
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { $out = & git @a 2>$null; $code = $LASTEXITCODE } finally { $ErrorActionPreference = $prev }
  return @($code, @($out))
}

function Read-Counter([string]$f) {
  if (-not (Test-Path -LiteralPath $f)) { return 0 }
  $d = ([IO.File]::ReadAllText($f) -replace '[^0-9]', '')
  if ($d) { return [int64]$d } else { return 0 }
}

function Allocate([string]$k, [string]$b, [bool]$peekOnly, [string]$runs, [string]$cnt) {
  if ($k -cnotmatch '^[A-Z]+$') {
    [Console]::Error.WriteLine("${prog}: KIND must be capital letters (A, B, F, RUN, S), got '$k'"); exit 2
  }
  if ($cnt -notmatch '^\d+$' -or [int64]$cnt -lt 1) {
    [Console]::Error.WriteLine("${prog}: -Count wants a positive number, got '$cnt'"); exit 2
  }
  $cnt = [int64]$cnt
  if ($runs -and $k -cnotin @('RUN', 'S')) {
    [Console]::Error.WriteLine("${prog}: -Runs counts only RUN or S, not '$k'"); exit 2
  }
  $gdir = '.'
  if ($b) { $gdir = Split-Path -Parent $b; if (-not $gdir) { $gdir = '.' } }
  elseif ($runs) { $gdir = $runs }
  $r = Invoke-GitQuiet @('-C', $gdir, 'rev-parse', '--show-toplevel')
  $inGit = ($r[0] -eq 0)
  if ($inGit) {
    $top = [string]$r[1][0]
    if (-not $b) { $b = Join-Path $top 'TICKETS.md' }
    $bdir = Split-Path -Parent $b; if (-not $bdir) { $bdir = '.' }
    $prefix = (Invoke-GitQuiet @('-C', $bdir, 'rev-parse', '--show-prefix'))[1]
    $rel = ([string]($prefix | Select-Object -First 1)) + (Split-Path -Leaf $b)
    $common = [string](Invoke-GitQuiet @('-C', $gdir, 'rev-parse', '--path-format=absolute', '--git-common-dir'))[1][0]
  } else {
    if (-not $b) { $b = '.\TICKETS.md' }
    [Console]::Error.WriteLine("${prog}: not in a git repo - using the local board only, nothing reserved across sessions")
  }

  $m = 0
  if (Test-Path -LiteralPath $b -PathType Leaf) {
    $m = Get-MaxId $k ([IO.File]::ReadAllLines((Resolve-Path -LiteralPath $b).Path, [Text.Encoding]::UTF8))
  }
  if ($runs) {
    foreach ($f in @(Get-ChildItem -LiteralPath $runs -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'run-*.md' -or $_.Name -eq 'run.md' })) {
      if ($k -ceq 'RUN') { $x = Get-RunMax @($f.Name) }
      else { $x = Get-StageMax ([IO.File]::ReadAllLines($f.FullName, [Text.Encoding]::UTF8)) }
      if ($x -gt $m) { $m = $x }
    }
    if ($inGit) { $rrel = [string]((Invoke-GitQuiet @('-C', $runs, 'rev-parse', '--show-prefix'))[1] | Select-Object -First 1) }
  }
  if ($inGit) {
    $refs = (Invoke-GitQuiet @('-C', $gdir, 'for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes'))[1]
    foreach ($ref in $refs) {
      if (-not $ref) { continue }
      $s = Invoke-GitQuiet @('-C', $gdir, 'show', "${ref}:$rel")
      if ($s[0] -eq 0) { $x = Get-MaxId $k $s[1]; if ($x -gt $m) { $m = $x } }
      # Pathspecs resolve against -C, so these run from the top, not $gdir.
      if ($runs) {
        if ($k -ceq 'RUN') {
          $spec = $rrel; if (-not $spec) { $spec = '.' }
          $s = Invoke-GitQuiet @('-C', $top, 'ls-tree', '-r', '--name-only', $ref, '--', $spec)
          $x = Get-RunMax $s[1]
        } else {
          $s = Invoke-GitQuiet @('-C', $top, 'grep', '-h', '-E', '^\| *[0-9]+ *\|', $ref, '--', "${rrel}run-*.md", "${rrel}run.md")
          $x = Get-StageMax $s[1]
        }
        if ($x -gt $m) { $m = $x }
      }
    }
    $ids = Join-Path $common 'skillator/ids'
    $counter = Join-Path $ids $k
  }

  if (-not $inGit -or $peekOnly) {
    if ($inGit) { $c = Read-Counter $counter; if ($c -gt $m) { $m = $c } }
    return @(($m + 1)..($m + $cnt))
  }

  New-Item -ItemType Directory -Force -Path $ids | Out-Null
  $lock = Join-Path $ids "$k.lock"
  $stale = 30; if ($env:NEXT_ID_STALE) { $stale = [int]$env:NEXT_ID_STALE }
  $waited = 0
  # Atomic take: build the lock (stamp inside) under a private name, then
  # rename it into place; the rename fails if the lock exists.
  while ($true) {
    $tmp = Join-Path $ids "$k.lock.tmp.$PID"
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    [IO.File]::WriteAllText((Join-Path $tmp 'stamp'), "$(Now)`n")
    try { [IO.Directory]::Move($tmp, $lock); break } catch { Remove-Item -Recurse -Force -LiteralPath $tmp }
    $st = ''
    $sf = Join-Path $lock 'stamp'
    if (Test-Path -LiteralPath $sf) { try { $st = ([IO.File]::ReadAllText($sf) -replace '[^0-9]', '') } catch { } }
    if (($st -and ((Now) - [int64]$st) -gt $stale) -or (-not $st -and $waited -gt $stale)) {
      [Console]::Error.WriteLine("${prog}: breaking stale lock $lock")
      Remove-Item -Recurse -Force -LiteralPath $lock -ErrorAction SilentlyContinue
      continue
    }
    if ($waited -gt (2 * $stale)) { [Console]::Error.WriteLine("${prog}: lock $lock still held after ${waited}s"); exit 1 }
    Start-Sleep -Seconds 1
    $waited++
  }
  try {
    $c = Read-Counter $counter; if ($c -gt $m) { $m = $c }
    $n = $m + $cnt
    $t = "$counter.tmp.$PID"
    [IO.File]::WriteAllText($t, "$n`n")
    Move-Item -Force -LiteralPath $t -Destination $counter
  } finally {
    Remove-Item -Recurse -Force -LiteralPath $lock -ErrorAction SilentlyContinue
  }
  return @(($m + 1)..$n)
}

function Run-Selftest {
  $me = $PSCommandPath
  $t = Join-Path ([IO.Path]::GetTempPath()) ("next-id-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $t | Out-Null
  $gc = @('-c', 'user.name=selftest', '-c', 'user.email=selftest@example.invalid', '-c', 'core.hooksPath=NUL', '-c', 'core.autocrlf=false')
  function G([string]$dir, [string[]]$a) {
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    & git -C $dir @gc @a 2>&1 | Out-Null
    $ErrorActionPreference = $prev
    if ($LASTEXITCODE -ne 0) { throw "git $a failed in $dir" }
  }
  function Alloc([string]$dir, [string[]]$a) {
    # stdout is the answer; stderr lines land in $script:lastErr.
    Push-Location $dir
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try {
      $all = & powershell -NoProfile -ExecutionPolicy Bypass -File $me @a 2>&1
      $script:lastCode = $LASTEXITCODE
      $script:lastErr = ($all | Where-Object { $_ -is [Management.Automation.ErrorRecord] } | ForEach-Object { "$_" }) -join "`n"
      $o = $all | Where-Object { $_ -isnot [Management.Automation.ErrorRecord] }
      return "$($o | Select-Object -Last 1)".Trim()
    } finally { $ErrorActionPreference = $prev; Pop-Location }
  }
  function Fail([string]$msg) { [Console]::Error.WriteLine("SELFTEST FAIL: $msg"); exit 1 }
  try {
    $main = Join-Path $t 'main'; New-Item -ItemType Directory -Path $main | Out-Null
    G $main @('init', '-q', '-b', 'main', '.')
    [IO.File]::WriteAllText((Join-Path $main 'TICKETS.md'), "# Board`n`n- [x] A1 - one`n- [ ] A3 - three`n  - [ ] A3a - part`n- [ ] B2 - bug`n")
    G $main @('add', 'TICKETS.md'); G $main @('commit', '-q', '-m', 'board')
    G $main @('worktree', 'add', '-q', '-b', 'second', (Join-Path $t 'second'))

    $a = Alloc $main @('A'); if ($a -ne '4') { Fail "first allocation: want 4, got $a" }
    $b = Alloc (Join-Path $t 'second') @('A')
    if ($b -eq $a) { Fail "two worktrees both got A$a" }
    if ($b -ne '5') { Fail "second allocation: want 5, got $b" }

    $far = Join-Path $t 'far'
    G $main @('worktree', 'add', '-q', '-b', 'far', $far)
    [IO.File]::AppendAllText((Join-Path $far 'TICKETS.md'), "- [ ] A20 - elsewhere`n")
    G $far @('commit', '-q', '-am', 'far')
    $c = Alloc $main @('A'); if ($c -ne '21') { Fail "higher id on another branch ignored: want 21, got $c" }

    $p1 = Alloc $main @('-Peek', 'A'); $p2 = Alloc $main @('-Peek', 'A')
    if ($p1 -ne '22' -or $p2 -ne '22') { Fail "-Peek reserved or miscounted: $p1 $p2" }

    Push-Location $main
    try { $common = (& git rev-parse --path-format=absolute --git-common-dir) } finally { Pop-Location }
    $lock = Join-Path $common 'skillator/ids/A.lock'
    New-Item -ItemType Directory -Force -Path $lock | Out-Null
    [IO.File]::WriteAllText((Join-Path $lock 'stamp'), "0`n")
    $env:NEXT_ID_STALE = '2'
    try { $d = Alloc $main @('A') } finally { Remove-Item Env:NEXT_ID_STALE }
    if ($d -ne '22') { Fail "after stale lock: want 22, got $d" }
    if ($script:lastErr -notmatch 'stale lock') { Fail 'stale lock broken silently' }
    if (Test-Path -LiteralPath $lock) { Fail 'lock left behind' }

    $q = Alloc $main @('A', '-Peek'); if ($q -ne '23') { Fail "-Peek after KIND: want 23, got $q" }
    $q = Alloc $main @('A', '--peek'); if ($q -ne '23') { Fail "--peek after KIND: want 23, got $q" }
    $q = Alloc $main @('A', '--peek'); if ($q -ne '23') { Fail "--peek after KIND reserved: got $q" }
    $null = Alloc $main @('A', '--bogus'); if ($script:lastCode -ne 2) { Fail "unknown flag: want exit 2, got $script:lastCode" }
    $null = Alloc $main @('A', 'no-such-board.md')
    if ($script:lastCode -ne 2) { Fail "missing board path: want exit 2, got $script:lastCode" }
    if ($script:lastErr -notmatch 'no board') { Fail 'missing board path: no message' }
    $q = Alloc $main @('-Peek', 'A'); if ($q -ne '23') { Fail "missing board path reserved: got $q" }

    $e = Alloc $main @('B'); if ($e -ne '3') { Fail "kind B: want 3, got $e" }
    $f = Alloc $main @('RUN'); if ($f -ne '1') { Fail "generic kind RUN: want 1, got $f" }

    # -Runs (F22): run files in the tree and on other refs raise RUN and S.
    $sk = Join-Path $main '.skillator'; New-Item -ItemType Directory -Path $sk | Out-Null
    [IO.File]::WriteAllText((Join-Path $sk 'run-3-here.md'), "| # | stage |`n|---|---|`n| 1 | a |`n| 7 | b |`n")
    $fsk = Join-Path $far '.skillator'; New-Item -ItemType Directory -Path $fsk | Out-Null
    [IO.File]::WriteAllText((Join-Path $fsk 'run-5-there.md'), "| 12 | c |`n")
    G $far @('add', '.skillator'); G $far @('commit', '-q', '-m', 'run')
    $r = Alloc $main @('-Runs', '.skillator', 'RUN'); if ($r -ne '6') { Fail "-Runs RUN: want 6 (ref run-5), got $r" }
    $r = Alloc $main @('-Runs', '.skillator', '-Count', '2', 'S'); if ($r -ne '14') { Fail "-Runs -Count 2 S: want last 14 (ref row 12), got $r" }
    $sec = Join-Path $t 'second'; New-Item -ItemType Directory -Path (Join-Path $sec '.skillator') | Out-Null
    $r = Alloc $sec @('--runs', '.skillator', 'S'); if ($r -ne '15') { Fail "--runs S from another worktree: want 15, got $r" }
    $null = Alloc $main @('-Runs', '.skillator', 'A'); if ($script:lastCode -ne 2) { Fail "-Runs accepted kind A" }
    $null = Alloc $main @('-Count', '0', 'S'); if ($script:lastCode -ne 2) { Fail "-Count 0 accepted" }

    $plain = Join-Path $t 'plain'; New-Item -ItemType Directory -Path $plain | Out-Null
    [IO.File]::WriteAllText((Join-Path $plain 'TICKETS.md'), "- [ ] A7 - x`n")
    $env:GIT_CEILING_DIRECTORIES = $t
    try { $h = Alloc $plain @('A') } finally { Remove-Item Env:GIT_CEILING_DIRECTORIES }
    if ($h -ne '8') { Fail "outside git: want 8, got $h" }
    if ($script:lastErr -notmatch 'not in a git repo') { Fail 'outside git: no stderr note' }

    Write-Output 'ok - next-id.ps1 selftest passed (4, 5, 21, peek 22, stale lock -> 22, flag order, bad flag, missing board, B 3, RUN 1, runs RUN 6, runs S 13-15, no-git 8)'
  } finally {
    Remove-Item -Recurse -Force -LiteralPath $t -ErrorAction SilentlyContinue
  }
}

if ($Selftest) { Run-Selftest; exit 0 }
# --peek in any position; any other flag is an error, never a board path.
$pos = @(); $want = ''
foreach ($a in @($Kind, $Board) + @($args)) {
  if (-not $a) { continue }
  if ($want -eq 'runs') { $Runs = $a; $want = ''; continue }
  if ($want -eq 'count') { $Count = $a; $want = ''; continue }
  if ($a -eq '--peek') { $Peek = $true }
  elseif ($a -eq '--runs') { $want = 'runs' }
  elseif ($a -eq '--count') { $want = 'count' }
  elseif ($a.StartsWith('-')) { [Console]::Error.WriteLine("${prog}: unknown flag '$a'"); Usage }
  else { $pos += $a }
}
if ($want) { [Console]::Error.WriteLine("${prog}: --$want needs a value"); Usage }
if ($pos.Count -lt 1 -or $pos.Count -gt 2) { Usage }
if ($Runs -and -not (Test-Path -LiteralPath $Runs -PathType Container)) {
  [Console]::Error.WriteLine("${prog}: no run dir at '$Runs'"); exit 2
}
$Kind = $pos[0]; $Board = ''; if ($pos.Count -eq 2) { $Board = $pos[1] }
# A named board that is not there must never count as empty: that would hand
# out a low id and reserve it.
if ($Board -and -not (Test-Path -LiteralPath $Board -PathType Leaf)) {
  [Console]::Error.WriteLine("${prog}: no board at '$Board'"); exit 2
}
Allocate $Kind $Board ([bool]$Peek) $Runs $Count | ForEach-Object { Write-Output $_ }
