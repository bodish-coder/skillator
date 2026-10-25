# board-fresh.ps1 - the stale-board guard (F82). Windows twin of board-fresh.sh,
# which carries the full reasoning; the same words byte for byte (its selftest
# compares them); keep the two in step.
#
#   board-fresh.ps1 [dir]                       the guard, on the checkout holding dir
#   board-fresh.ps1 -Fetch [dir]                only the stamped, time-boxed fetch
#   board-fresh.ps1 -Record <file> -Who <who>   a skillator writer left <file> uncommitted
#   board-fresh.ps1 -Selftest
#
# Fetch at most once per 10 min per clone, killed after 5 s ('unchecked' on a
# failure, never blocking); behind with no local commits and only TICKETS.md
# dirty -> git merge --ff-only (--autostash after a clean git merge-file check);
# behind any other way -> exit 2 and the report, nothing pulled, merged, reset
# or stashed. State for pending: <git common dir>/skillator/board-fresh.
param(
  [Parameter(Position = 0)][string]$Dir = '.',
  [switch]$Fetch,
  [string]$Record = '',
  [string]$Who = '',
  [switch]$Selftest
)
$ErrorActionPreference = 'Continue'
$prog = 'board-fresh'
$B = 'TICKETS.md'

function Say([string]$s) { [Console]::Error.WriteLine($s) }
function Now { [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() }

# git with args: @(exit code, stdout lines); stderr dropped. -Both keeps stderr in the lines.
function G([string[]]$a, [switch]$Both) {
  if ($Both) { $out = & git @a 2>&1 | ForEach-Object { "$_" } } else { $out = & git @a 2>$null }
  return @($LASTEXITCODE, @($out | Where-Object { $null -ne $_ }))
}

# git with args, stdout bytes into $to (or dropped), waited on for $ms: the exit code, -1 timed out.
function Start-Git([string[]]$a, [string]$to = '', [int]$ms = -1) {
  $psi = New-Object Diagnostics.ProcessStartInfo 'git'
  $psi.Arguments = ($a | ForEach-Object { '"' + ($_ -replace '"', '\"') + '"' }) -join ' '
  $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  $psi.EnvironmentVariables['GIT_TERMINAL_PROMPT'] = '0'
  $p = [Diagnostics.Process]::Start($psi)
  $err = $p.StandardError.ReadToEndAsync()
  if ($to) { $fs = [IO.File]::Create($to); try { $p.StandardOutput.BaseStream.CopyTo($fs) } finally { $fs.Close() } }
  else { $null = $p.StandardOutput.ReadToEndAsync() }
  if (-not $p.WaitForExit($ms)) { try { $p.Kill() } catch {}; return -1 }
  $p.WaitForExit(); $null = $err.Result
  return $p.ExitCode
}

# $script: top br up remote sk <- the checkout holding $d; $false when there is nothing to guard.
function Setup([string]$d) {
  if (-not (Test-Path -LiteralPath $d -PathType Container)) { return $false }
  $r = G @('-C', $d, 'rev-parse', '--show-toplevel'); if ($r[0] -ne 0) { return $false }; $script:top = $r[1][0]
  $r = G @('-C', $script:top, 'symbolic-ref', '-q', '--short', 'HEAD'); if ($r[0] -ne 0) { return $false }; $script:br = $r[1][0]
  $r = G @('-C', $script:top, 'rev-parse', '-q', '--abbrev-ref', '--symbolic-full-name', '@{u}'); if ($r[0] -ne 0) { return $false }; $script:up = $r[1][0]
  $r = G @('-C', $script:top, 'config', "branch.$($script:br).remote"); $script:remote = if ($r[0] -eq 0) { $r[1][0] } else { '' }
  $r = G @('-C', $script:top, 'rev-parse', '--path-format=absolute', '--git-common-dir'); $script:sk = "$($r[1][0])/skillator"
  $null = New-Item -ItemType Directory -Force -Path $script:sk
  return $true
}

# 'ok' | 'unchecked' | 'skip' (fetched in the last 10 min, or a local upstream).
function Fetch-Up {
  if (-not $script:remote -or $script:remote -eq '.') { return 'skip' }
  $t = Now; $sf = "$($script:sk)/board-fresh.stamp"; $st = ''
  if (Test-Path -LiteralPath $sf) { $st = ([IO.File]::ReadAllText($sf)) -replace '[^0-9]', '' }
  if ($st -and [int64]$st -le $t -and ($t - [int64]$st) -lt 600) { return 'skip' }
  [IO.File]::WriteAllText($sf, "$t`n")
  $c = Start-Git @('-C', $script:top, 'fetch', '-q', $script:remote) '' 5000
  if ($c -eq 0) { 'ok' } else { 'unchecked' }
}

function State([string]$s, [string]$behind, [string]$reason) {
  $f = "$($script:sk)/board-fresh"
  [IO.File]::WriteAllText("$f.$PID", "$(Now)`t$s`t$behind`t$($script:up)`t$reason`n")
  Move-Item -Force -LiteralPath "$f.$PID" -Destination $f
}

function Guard([string]$d) {
  if (-not (Setup $d)) { return 0 }
  $top = $script:top; $up = $script:up; $br = $script:br; $sk = $script:sk
  $fetched = Fetch-Up
  if ($fetched -eq 'unchecked') { Say "${prog}: $up unchecked (the fetch failed or took over 5 s) - the board is written as it is" }
  $r = G @('-C', $top, 'rev-list', '--left-right', '--count', "HEAD...$up")
  $ab = @("$($r[1][0])" -split '\s+'); $ahead = '0'; $behind = '0'
  if ($r[0] -eq 0 -and $ab.Count -ge 2) { $ahead = $ab[0]; $behind = $ab[1] }
  if ($behind -eq '0') {
    if ($fetched -eq 'unchecked') { State 'unchecked' '0' '-' } else { State 'ok' '0' '-' }
    return 0
  }
  $dirty = @((G @('-C', $top, '-c', 'core.quotepath=off', 'status', '--porcelain', '-uno'))[1] | Where-Object { $_.Length -gt 3 })
  $others = @($dirty | Where-Object { $_.Substring(3) -cne $B })
  $bd = @($dirty | Where-Object { $_.Substring(3) -ceq $B }).Count -gt 0
  $why = ''
  if ($ahead -eq '0' -and $others.Count -eq 0) {
    if ($bd -and (G @('-C', $top, 'diff', '--quiet', 'HEAD', $up, '--', $B))[0] -ne 0) {
      $base = "$sk/base.$PID"; $theirs = "$sk/theirs.$PID"
      $null = Start-Git @('-C', $top, 'cat-file', '--filters', "HEAD:$B") $base
      $null = Start-Git @('-C', $top, 'cat-file', '--filters', "${up}:$B") $theirs
      if ((Start-Git @('merge-file', '-q', '-p', "$top/$B", $base, $theirs)) -ne 0) { $why = "$B is edited here and on $up, and the edits conflict" }
      Remove-Item -Force -LiteralPath $base, $theirs -ErrorAction SilentlyContinue
    }
    if (-not $why) {
      $ma = @('-C', $top, 'merge', '-q', '--ff-only'); if ($bd) { $ma += '--autostash' }
      $m = G ($ma + $up) -Both
      if ($m[0] -eq 0) {
        if ($bd) { Say "${prog}: fast-forwarded $br to $up (was $behind behind), the $B edits kept" }
        else { Say "${prog}: fast-forwarded $br to $up (was $behind behind)" }
        State 'ff' $behind '-'
        return 0
      }
      $why = "git refused the fast-forward: $(@($m[1] | Where-Object { $_ -match '\S' })[0])"
    }
  }
  $rs = "$behind behind $up"
  if ($ahead -ne '0') { $rs += ", $ahead local commit(s) not on it" }
  if ($others.Count -ne 0) { $rs += ", $($others.Count) other dirty file(s)" }
  if ($why) { $rs += ", $why" }
  Say "${prog}: REFUSED the board write - $top is $rs"
  if ($ahead -ne '0') {
    Say "  local commits not on ${up}:"
    foreach ($l in (G @('-C', $top, 'log', '--format=    %h %s', "$up..HEAD"))[1]) { Say $l }
  }
  if ($dirty.Count) {
    Say '  dirty files:'
    $log = "$top/.skillator/dirty.log"
    $rec = if (Test-Path -LiteralPath $log) { [IO.File]::ReadAllLines($log) } else { @() }
    foreach ($l in $dirty) {
      $p = $l.Substring(3); $w = ''
      foreach ($x in $rec) { $f = $x.TrimEnd("`r").Split("`t"); if ($f.Count -ge 3 -and $f[1] -ceq $p) { $w = "$($f[2]) at $($f[0])" } }
      if ($w) { Say "    $l  (left by $w)" } else { Say "    $l  (no skillator record)" }
    }
  }
  Say '  nothing was pulled, merged, reset or stashed. To reconcile, by hand:'
  Say "    git -C `"$top`" status"
  if ($dirty.Count) { Say "    git -C `"$top`" diff    (whose edits? commit them, or stash them yourself)" }
  if ($ahead -ne '0') { Say "    git -C `"$top`" pull --rebase" } else { Say "    git -C `"$top`" pull --ff-only" }
  Say '  then retry the board write.'
  State 'refused' $behind $rs
  return 2
}

function Record-Dirty([string]$f, [string]$w) {
  $d = Split-Path -Parent $f; if (-not $d) { $d = '.' }
  $r = G @('-C', $d, 'rev-parse', '--show-toplevel')
  if ($r[0] -ne 0) { Say "${prog}: $f is not in a git checkout - not recorded"; return }
  $rt = $r[1][0]
  $rel = "$((G @('-C', $d, 'rev-parse', '--show-prefix'))[1] | Select-Object -First 1)" + (Split-Path -Leaf $f)
  $null = New-Item -ItemType Directory -Force -Path "$rt/.skillator"
  $iso = [DateTime]::UtcNow.ToString("yyyy-MM-dd'T'HH:mm'Z'")
  [IO.File]::AppendAllText("$rt/.skillator/dirty.log", "$iso`t$rel`t$($w -replace "[`t`r`n]", ' ')`n")
}

function Run-Selftest {
  $t = Join-Path ([IO.Path]::GetTempPath()) ("boardfresh-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
  $null = New-Item -ItemType Directory -Path $t
  $savedGlobal = $env:GIT_CONFIG_GLOBAL
  [IO.File]::WriteAllText("$t/gitconfig", "[user]`n`tname = t`n`temail = t@x.invalid`n[init]`n`tdefaultBranch = main`n[core]`n`tautocrlf = false`n")
  $env:GIT_CONFIG_GLOBAL = "$t/gitconfig"
  $script:fail = 0
  function Bad([string]$m) { Write-Output "FAIL: $m"; $script:fail = 1 }
  # the guard in this process, its stderr caught: $script:rc, $script:e (LF-joined)
  function Bf([scriptblock]$s) {
    $orig = [Console]::Error; $sw = New-Object IO.StringWriter
    [Console]::SetError($sw)
    try { $script:rc = & $s } finally { [Console]::SetError($orig) }
    $script:e = ($sw.ToString() -replace "`r", '').TrimEnd("`n")
  }
  function Q([string]$dir, [string[]]$a) { $null = & git -C $dir @a 2>&1; if ($LASTEXITCODE -ne 0) { Bad "fixture: git $a" } }
  $A = "$t/a"; $Bc = "$t/b"
  function Age { [IO.File]::WriteAllText("$A/.git/skillator/board-fresh.stamp", "0`n") }
  function Push([string]$m, [string]$file = 'app.txt') {
    Q $Bc @('pull', '-q', '--ff-only'); [IO.File]::AppendAllText("$Bc/$file", "$m`n")
    Q $Bc @('add', '-A'); Q $Bc @('commit', '-qm', $m); Q $Bc @('push', '-q')
  }
  function Behind { "$((G @('-C', $A, 'rev-list', '--count', 'HEAD..origin/main'))[1][0])" }
  try {
    Q $t @('init', '-q', '--bare', "$t/up.git")
    $null = & git clone -q "$t/up.git" $A 2>&1
    [IO.File]::WriteAllText("$A/$B", "# Board`n`n- [ ] F1 - one`n"); [IO.File]::WriteAllText("$A/app.txt", "x`n"); [IO.File]::WriteAllText("$A/notes.txt", "n`n")
    Q $A @('add', '-A'); Q $A @('commit', '-qm', 'init'); Q $A @('push', '-q', '-u', 'origin', 'main')
    $null = & git clone -q "$t/up.git" $Bc 2>&1

    Bf { Guard $A }; if ($rc -ne 0 -or $e) { Bad "up to date: rc $rc, said [$e]" }
    Push 'one'; Age; Bf { Guard $A }
    if ($rc -ne 0 -or $e -cne 'board-fresh: fast-forwarded main to origin/main (was 1 behind)') { Bad "ff: rc $rc [$e]" }
    Push 'two'; Bf { Guard $A }; if ($rc -ne 0 -or (Behind) -ne '0') { Bad 'stamp: fetched again inside 10 min' }
    Age; Bf { Guard $A }; if ($e -cne 'board-fresh: fast-forwarded main to origin/main (was 1 behind)') { Bad "stamp: old stamp did not fetch [$e]" }
    [IO.File]::AppendAllText("$A/$B", "- [ ] F2 - mine`n"); Push 'three'; Age; Bf { Guard $A }
    if ($rc -ne 0 -or $e -cne "board-fresh: fast-forwarded main to origin/main (was 1 behind), the $B edits kept") { Bad "ff dirty board: rc $rc [$e]" }
    if (-not ([IO.File]::ReadAllText("$A/$B")).Contains('F2 - mine') -or -not ([IO.File]::ReadAllText("$A/app.txt")).Contains('three')) { Bad 'ff dirty board: edits or upstream lost' }
    Push '- [ ] F3 - theirs' $B; $mine = [IO.File]::ReadAllText("$A/$B"); $h = (G @('-C', $A, 'rev-parse', 'HEAD'))[1][0]; Age; Bf { Guard $A }
    if ($rc -ne 2 -or $e -notmatch "REFUSED the board write - .* is 1 behind origin/main, $B is edited here and on origin/main, and the edits conflict") { Bad "board conflict: rc $rc [$e]" }
    if ([IO.File]::ReadAllText("$A/$B") -cne $mine -or (G @('-C', $A, 'rev-parse', 'HEAD'))[1][0] -ne $h -or (G @('-C', $A, 'stash', 'list'))[1].Count) { Bad 'board conflict: something moved' }
    Q $A @('checkout', '-q', '--', $B); Age; Bf { Guard $A }; if ($rc -ne 0) { Bad "after the conflict: no ff ($rc)" }
    [IO.File]::AppendAllText("$A/notes.txt", "local`n"); Q $A @('commit', '-qam', 'local work'); Push 'four'; Age; Bf { Guard $A }
    if ($rc -ne 2 -or $e -notmatch '1 behind origin/main, 1 local commit\(s\) not on it\n' -or $e -notmatch '\n    [0-9a-f]+ local work\n' -or $e -notmatch 'pull --rebase\n') { Bad "local commit: rc $rc [$e]" }
    if (([IO.File]::ReadAllText("$A/.git/skillator/board-fresh")) -notmatch "`trefused`t1`torigin/main`t1 behind origin/main, 1 local commit\(s\) not on it`n$") { Bad 'refusal not kept for pending' }
    Q $A @('reset', '-q', '--hard', 'origin/main')
    [IO.File]::AppendAllText("$A/app.txt", "y`n"); [IO.File]::AppendAllText("$A/notes.txt", "z`n")
    Record-Dirty "$A/notes.txt" 'relay-morpheus board F9 [x] run RUN-0003'
    Push 'five' 'other.txt'; Age; Bf { Guard $A }
    if ($rc -ne 2 -or $e -notmatch '2 other dirty file\(s\)\n' -or $e -notmatch '\n     M app.txt  \(no skillator record\)\n' -or
        $e -notmatch '\n     M notes.txt  \(left by relay-morpheus board F9 \[x\] run RUN-0003 at [0-9T:-]+Z\)\n') { Bad "foreign dirty: rc $rc [$e]" }
    if ((Behind) -ne '1' -or (G @('-C', $A, 'stash', 'list'))[1].Count) { Bad 'foreign dirty: something moved' }
    Q $A @('checkout', '-q', '--', '.'); Age; Bf { Guard $A }; if ($rc -ne 0) { Bad "after the dirt: no ff ($rc)" }
    Q $A @('remote', 'set-url', 'origin', "$t/gone.git"); Age; Bf { Guard $A }
    if ($rc -ne 0 -or $e -cne 'board-fresh: origin/main unchecked (the fetch failed or took over 5 s) - the board is written as it is') { Bad "offline: rc $rc [$e]" }
    Q $A @('remote', 'set-url', 'origin', "$t/up.git"); Push 'six'; Age; Bf { if (Setup $A) { $null = Fetch-Up }; 0 }
    if ($rc -ne 0 -or $e -or (Behind) -ne '1') { Bad "-Fetch: rc $rc [$e]" }
    Q $t @('init', '-q', "$t/plain"); Bf { Guard "$t/plain" }; if ($rc -ne 0 -or $e) { Bad "no upstream: rc $rc [$e]" }
    $null = New-Item -ItemType Directory -Path "$t/nogit"; Bf { Guard "$t/nogit" }; if ($rc -ne 0 -or $e) { Bad "not git: rc $rc [$e]" }
  } finally {
    $env:GIT_CONFIG_GLOBAL = $savedGlobal
    Remove-Item -Recurse -Force -LiteralPath $t -ErrorAction SilentlyContinue
  }
  if ($script:fail) { exit 1 }
  Write-Output 'ok - board-fresh.ps1 selftest passed (silent when fresh, ff clean, 10-min stamp, ff dirty board kept, board conflict refused, local commit refused, foreign dirty refused with writers, offline unchecked, -Fetch, no upstream, not git)'
}

if ($Selftest) { Run-Selftest; exit 0 }
if ($Record) { if (-not $Who) { Say "usage: $prog.ps1 -Record <file> -Who <who>"; exit 2 }; Record-Dirty $Record $Who; exit 0 }
if ($Fetch) { if (Setup $Dir) { $null = Fetch-Up }; exit 0 }
exit (Guard $Dir)
