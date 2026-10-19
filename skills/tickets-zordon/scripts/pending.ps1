# pending.ps1 - what is pending, in one report (F50). Windows twin of
# pending.sh, which carries the key list and the reasoning; same output, keep
# the two in step.
#
#   pending.ps1              the human report
#   pending.ps1 --kv         the same facts as KEY=value lines (the ops-board mod parses these)
#   pending.ps1 --machine    DRIVE / DISK_* / MEM_FREE / LOCK / HOLD only (cheap; the band's poll)
#   pending.ps1 --selftest   fixture repo, every mode, prints ok
#
# Test-only overrides: PENDING_DF_CMD, PENDING_MEM_CMD (PowerShell commands
# here), PENDING_SESSIONS_DIR, PENDING_RELAY (the relay .ps1), PENDING_NOW.
# Windows PowerShell 5.1 safe: no ?:, ??, && or ||.
$ErrorActionPreference = 'Stop'
$Utf8 = New-Object System.Text.UTF8Encoding($false)

function Fail([string]$msg) { throw "pending: $msg" }

$script:Main = ''
$script:Now = [long]0
$script:Relay = ''
$GbBytes = [double]1073741824
# A ticket line, as ticket-meta reads it: `[indent]- [<box>] <ID> <dash> ...`.
$TicketRe = '^[ \t]*- \[(.)\][ \t]+([A-Z]{1,3}[0-9]+[a-z]?)[ \t]*(' + [char]0x2014 + '|' + [char]0x2013 + '|-)'

function Git-Out {
  # Native git, stdout lines only; $null on failure. A local 'Continue': under
  # 'Stop', PS 5.1 turns git stderr into a terminating error.
  $ErrorActionPreference = 'Continue'
  try { $out = & git @args 2>$null } catch { return $null }
  if ($LASTEXITCODE -ne 0) { return $null }
  return @($out)
}

function Get-Num([string]$s) { if ($s -cmatch '\A[0-9]+\z') { return $s } return '' }

function Sort-Ordinal([string[]]$xs) {
  if ($null -eq $xs -or $xs.Count -eq 0) { return @() }
  $a = [string[]]$xs.Clone()
  [Array]::Sort($a, [StringComparer]::Ordinal)
  return $a
}

# The main checkout's root (from any worktree of it); outside git, the cwd.
function Find-Main {
  $d = Git-Out rev-parse --path-format=absolute --git-common-dir
  if ($null -ne $d) {
    $d = [string](@($d)[0])
    if ($d.EndsWith('/.git')) { return $d.Substring(0, $d.Length - 5) }
  }
  $t = Git-Out rev-parse --show-toplevel
  if ($null -ne $t) { return [string](@($t)[0]) }
  return (Get-Location).Path
}

# Epoch seconds of a file's (or a dir's) last write; '' when unknown.
function Get-MTime([string]$p) {
  try {
    $i = Get-Item -LiteralPath $p -Force
    return [string]([DateTimeOffset]::new($i.LastWriteTimeUtc).ToUnixTimeSeconds())
  } catch { return '' }
}

function Read-Lines([string]$p) {
  return @(([System.IO.File]::ReadAllText($p, $Utf8) -split "`n") | ForEach-Object { $_.TrimEnd("`r") })
}

# relay-morpheus.ps1, stdout lines only; empty when it is missing or exits non-zero.
function Invoke-Relay([string[]]$a) {
  $r = $script:Relay
  if (-not $r -or -not (Test-Path -LiteralPath $r -PathType Leaf)) { return @() }
  $ErrorActionPreference = 'Continue'
  try { $out = & powershell -NoProfile -ExecutionPolicy Bypass -File $r @a 2>$null } catch { return @() }
  if ($LASTEXITCODE -ne 0) { return @() }
  return @(@($out) | ForEach-Object { ([string]$_).TrimEnd("`r") })
}

function Get-Board {
  $c = @{}
  $owed = New-Object System.Collections.ArrayList
  $f = "$script:Main/TICKETS.md"
  if (Test-Path -LiteralPath $f -PathType Leaf) {
    foreach ($l in (Read-Lines $f)) {
      $m = [regex]::Match($l, $TicketRe)
      if (-not $m.Success) { continue }
      $k = $m.Groups[1].Value
      if ($c.ContainsKey($k)) { $c[$k] = $c[$k] + 1 } else { $c[$k] = 1 }
      if ($l.ToLowerInvariant() -cmatch '(^|[^a-z0-9_])owed([^a-z0-9_]|$)') { [void]$owed.Add('OWED=' + $m.Groups[2].Value) }
    }
  }
  $n = @{}
  foreach ($k in @(' ', '~', '!', '?', '>')) { $n[$k] = 0; if ($c.ContainsKey($k)) { $n[$k] = [int]$c[$k] } }
  $counts = @(
    ('OPEN=' + ($n[' '] + $n['~'] + $n['!'] + $n['?'])),
    ('PENDING=' + $n[' ']), ('PROGRESS=' + $n['~']), ('BLOCKED=' + $n['!']),
    ('DECISION=' + $n['?']), ('DEFERRED=' + $n['>']))
  return @{ Counts = $counts; Owed = @($owed) }
}

# The first stage of a run whose box is neither x nor > (from its own run file).
function Get-StageOf([string]$id) {
  $n = $id.Substring(4)
  $p = $n.TrimStart('0')
  if ($p -eq '') { $p = '0' }
  $dir = "$script:Main/.skillator"
  if (-not (Test-Path -LiteralPath $dir -PathType Container)) { return '-' }
  $names = @(Get-ChildItem -LiteralPath $dir -File -Force | ForEach-Object { $_.Name })
  $cands = New-Object System.Collections.ArrayList
  foreach ($pat in @("run-$n-*.md", "run-$n.md", "run-$p-*.md", "run-$p.md")) {
    foreach ($x in (Sort-Ordinal @($names | Where-Object { $_ -clike $pat }))) { [void]$cands.Add($x) }
  }
  if ($cands.Count -eq 0) { return '-' }
  foreach ($l in (Read-Lines "$dir/$($cands[0])")) {
    if ($l -cnotmatch '^\| *[0-9]+ *\|') { continue }
    $cells = $l.Split('|')
    $st = $cells[3] -replace '[ \t]', ''
    if ($st -cne 'x' -and $st -cne '>') {
      $t = $cells[2].Trim(" `t".ToCharArray())
      if ($t -eq '') { return '-' }
      return $t
    }
  }
  return '-'
}

function Get-RunsKv {
  $runs = New-Object System.Collections.ArrayList
  $cur = $null
  foreach ($l in (Invoke-Relay @('-Mode', 'list'))) {
    if ($l -cmatch '^RUN-[0-9]+ ') {
      if ($null -ne $cur) { [void]$runs.Add($cur) }
      $cur = @{ Id = ($l -split '[ \t]+')[0]; Ow = ''; D = 0; T = 0 }
      $ms = [regex]::Matches($l, '([0-9]+)/([0-9]+) done')
      if ($ms.Count -gt 0) {
        $last = $ms[$ms.Count - 1]
        $cur.D = [long]$last.Groups[1].Value; $cur.T = [long]$last.Groups[2].Value
      }
      continue
    }
    if ($null -ne $cur -and $l.StartsWith('          owner: ', [StringComparison]::Ordinal)) {
      $cur.Ow = $l.Substring(17).Trim(" `t".ToCharArray())
    }
  }
  if ($null -ne $cur) { [void]$runs.Add($cur) }
  $out = New-Object System.Collections.ArrayList
  foreach ($r in $runs) {
    if ($r.T -gt 0 -and $r.D -lt $r.T) {
      $ow = $r.Ow
      if ($ow -eq '') { $ow = '-' }
      [void]$out.Add("RUN=$($r.Id)|$($r.D)/$($r.T)|$ow|$(Get-StageOf $r.Id)")
    }
  }
  return @($out)
}

function Get-QueuedKv {
  $out = New-Object System.Collections.ArrayList
  # queue-run list creates the queue file when absent: no file, no call.
  if (-not (Test-Path -LiteralPath "$script:Main/.skillator/queue.md" -PathType Leaf)) { return @() }
  foreach ($l in (Invoke-Relay @('-Mode', 'queue-run', '-Sub', 'list'))) {
    if ($l -cnotmatch '^\| *[0-9]+ *\|') { continue }
    $cells = $l.Split('|')
    if ($cells.Count -lt 4) { continue }
    if (($cells[3] -replace '[ \t]', '') -ceq 'queued') { [void]$out.Add('QUEUED=' + ($cells[2] -replace '[ \t]', '')) }
  }
  return @($out)
}

# A JSON string field, read as pending.sh's awk reads it (first "key", a colon,
# a quoted string, backslash escapes taken literally); '-' when absent.
function Get-JStr([string]$t, [string]$k) {
  $i = $t.IndexOf('"' + $k + '"', [StringComparison]::Ordinal)
  if ($i -lt 0) { return '-' }
  $s = $t.Substring($i + $k.Length + 2)
  $m = [regex]::Match($s, '\A[ \t\r\n]*:[ \t\r\n]*"')
  if (-not $m.Success) { return '-' }
  $s = $s.Substring($m.Length)
  $o = New-Object System.Text.StringBuilder
  $j = 0
  while ($j -lt $s.Length) {
    $ch = [string]$s[$j]
    if ($ch -ceq '"') { return $o.ToString() }
    if ($ch -ceq '\') {
      if ($j + 1 -lt $s.Length) { [void]$o.Append($s[$j + 1]) }
      $j += 2
      continue
    }
    [void]$o.Append($ch)
    $j++
  }
  return $o.ToString()
}

# Live sessions: <config dir>/sessions/*.json written in the last 30 minutes.
function Get-SessionsKv {
  $sd = $env:PENDING_SESSIONS_DIR
  if (-not $sd) {
    $cfg = $env:CLAUDE_CONFIG_DIR
    if (-not $cfg) {
      $h = $env:HOME
      if (-not $h) { $h = $env:USERPROFILE }
      $cfg = "$h/.claude"
    }
    $sd = "$cfg/sessions"
  }
  $out = New-Object System.Collections.ArrayList
  if (-not (Test-Path -LiteralPath $sd -PathType Container)) { return @() }
  $names = Sort-Ordinal @(Get-ChildItem -LiteralPath $sd -File -Force | ForEach-Object { $_.Name } | Where-Object { $_ -clike '*.json' -and $_ -cnotlike '.*' })
  foreach ($nm in $names) {
    $f = "$sd/$nm"
    $m = Get-Num (Get-MTime $f)
    if ($m -eq '') { continue }
    $a = $script:Now - [long]$m
    if ($a -ge 1800) { continue }
    if ($a -lt 0) { $a = 0 }
    $t = ''
    try { $t = [string]::Join("`n", (Read-Lines $f)) + "`n" } catch { continue }
    $idle = [long][Math]::Floor($a / 60)
    [void]$out.Add("SESSION=$(Get-JStr $t 'name')|$(Get-JStr $t 'status')|$(Get-JStr $t 'cwd')|$idle")
  }
  return @($out)
}

function Get-UnpushedKv {
  $u = Git-Out -C $script:Main rev-list --count '@{u}..HEAD'
  $v = ''
  if ($null -ne $u) { $v = Get-Num ([string](@($u)[0])) }
  if ($v -eq '') { $v = '-' }
  return "UNPUSHED=$v"
}

function Get-LocksKv {
  $main = $script:Main
  $rel = New-Object System.Collections.ArrayList
  if (Test-Path -LiteralPath "$main/TICKETS.md.lock") { [void]$rel.Add('TICKETS.md.lock') }
  $sk = "$main/.skillator"
  if (Test-Path -LiteralPath $sk -PathType Container) {
    $top = @(Get-ChildItem -LiteralPath $sk -Force | Where-Object { $_.Name -cnotlike '.*' })
    foreach ($x in (Sort-Ordinal @($top | Where-Object { $_.Name -clike '*.lock' } | ForEach-Object { $_.Name }))) {
      [void]$rel.Add(".skillator/$x")
    }
    $two = New-Object System.Collections.ArrayList
    foreach ($d in @($top | Where-Object { $_.PSIsContainer })) {
      foreach ($y in @(Get-ChildItem -LiteralPath $d.FullName -Force | Where-Object { $_.Name -clike '*.lock' -and $_.Name -cnotlike '.*' })) {
        [void]$two.Add("$($d.Name)/$($y.Name)")
      }
    }
    foreach ($x in (Sort-Ordinal @($two))) { [void]$rel.Add(".skillator/$x") }
  }
  $out = New-Object System.Collections.ArrayList
  foreach ($r in $rel) {
    $p = "$main/$r"
    $m = Get-Num (Get-MTime $p)
    if ($m -eq '') { continue }
    $a = $script:Now - [long]$m
    if ($a -le 600) { continue }
    $src = $p
    if (Test-Path -LiteralPath $p -PathType Container) { $src = "$p/pid" }
    $h = ''
    try { $h = (Read-Lines $src)[0] } catch { $h = '' }
    if ($null -eq $h) { $h = '' }
    if ($h.Length -gt 40) { $h = $h.Substring(0, 40) }
    if ($h -eq '') { $h = '-' }
    [void]$out.Add("LOCK=$r|$([long][Math]::Floor($a / 60))|$h")
  }
  return @($out)
}

function First-Line($xs) {
  foreach ($x in @($xs)) { return ([string]$x).TrimEnd("`r") }
  return ''
}

# R2: the watchdog hold, straight from the file relay-morpheus writes -
# <main checkout>/.skillator/watchdog.hold, RELAY_DIR overriding as there -
# never by spawning relay. The words -Action status gives: <since> <reason>,
# reason - when the line has none.
function Get-HoldKv {
  $hf = "$script:Main/.skillator/watchdog.hold"
  if ($env:RELAY_DIR) { $hf = Join-Path $env:RELAY_DIR 'watchdog.hold' }
  if (-not (Test-Path -LiteralPath $hf -PathType Leaf)) { return 'HOLD=-' }
  # R6: a file that exists is held whatever its content - an empty or blank
  # one (or one that cannot be read) is `? -`; HOLD=- is only "no file".
  try { $hl = [string](([System.IO.File]::ReadAllText($hf) -split "`n")[0]) } catch { return 'HOLD=? -' }
  $hl = $hl.Replace("`r", '').Trim(" `t".ToCharArray())
  $hi = $hl.IndexOf(' ')
  if ($hi -lt 0) { $hsince = $hl; $hwhy = '' } else { $hsince = $hl.Substring(0, $hi); $hwhy = $hl.Substring($hi + 1) }
  if ($hsince -eq '') { $hsince = '?' }
  if ($hwhy -eq '') { $hwhy = '-' }
  return "HOLD=$hsince $hwhy"
}

function Get-MachineKv {
  $dfl = ''
  if ($env:PENDING_DF_CMD) {
    try { $dfl = First-Line (Invoke-Expression $env:PENDING_DF_CMD) } catch { $dfl = '' }
  } else {
    try {
      $q = Split-Path -Qualifier $script:Main
      $di = New-Object System.IO.DriveInfo($q)
      $dfl = "$($di.AvailableFreeSpace) $($di.TotalSize) $q"
    } catch { $dfl = '' }
  }
  $tok = @($dfl.Trim() -split '[ \t]+')
  $free = Get-Num $tok[0]
  $total = ''
  if ($tok.Count -ge 2) { $total = Get-Num $tok[1] }
  $drive = ''
  if ($tok.Count -ge 3) { $drive = [regex]::Replace($dfl, '^[ \t]*[^ \t]+[ \t]+[^ \t]+[ \t]+', '') }
  $mem = ''
  if ($env:PENDING_MEM_CMD) {
    try { $mem = @((First-Line (Invoke-Expression $env:PENDING_MEM_CMD)).Trim() -split '[ \t]+')[0] } catch { $mem = '' }
  } else {
    try { $mem = [string]([long](Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory * 1024) } catch { $mem = '' }
  }
  $mem = Get-Num $mem
  $out = New-Object System.Collections.ArrayList
  [void]$out.Add("DRIVE=$drive"); [void]$out.Add("DISK_FREE=$free")
  [void]$out.Add("DISK_TOTAL=$total"); [void]$out.Add("MEM_FREE=$mem")
  foreach ($l in (Get-LocksKv)) { [void]$out.Add($l) }
  [void]$out.Add((Get-HoldKv))
  return @($out)
}

function Get-Facts {
  $b = Get-Board
  $out = New-Object System.Collections.ArrayList
  foreach ($set in @($b.Counts, (Get-RunsKv), (Get-QueuedKv), (Get-SessionsKv), @(Get-UnpushedKv), $b.Owed, (Get-MachineKv))) {
    foreach ($l in @($set)) { if ($null -ne $l) { [void]$out.Add([string]$l) } }
  }
  return @($out)
}

# GB figures: one decimal below 10, whole from 10; '?' when unknown.
function Get-Gb([string]$b) {
  if ($b -eq '') { return '?' }
  $x = [double]$b
  $t = [long][Math]::Floor($x * 10 / $GbBytes + 0.5)
  if ($t -lt 100) { return ('{0}.{1} GB' -f [long][Math]::Floor($t / 10), ($t % 10)) }
  return ('{0} GB' -f [long][Math]::Floor($x / $GbBytes + 0.5))
}

function Split-Kv([string]$l) {
  $i = $l.IndexOf('=')
  if ($i -lt 0) { return @($l, '') }
  return @($l.Substring(0, $i), $l.Substring($i + 1))
}

# The watchdog judgement over the KEY=value lines: red, amber or green, and why.
function Get-Judge($facts) {
  $df = ''; $mf = ''; $nlk = 0; $hd = ''
  foreach ($l in @($facts)) {
    $kv = Split-Kv $l
    if ($kv[0] -ceq 'DISK_FREE') { $df = $kv[1] }
    elseif ($kv[0] -ceq 'MEM_FREE') { $mf = $kv[1] }
    elseif ($kv[0] -ceq 'LOCK') { $nlk++ }
    elseif ($kv[0] -ceq 'HOLD') { $hd = $kv[1] }
  }
  $level = 'green'
  $why = New-Object System.Collections.ArrayList
  if ($df -ne '' -and [double]$df -lt $GbBytes) { $level = 'red'; [void]$why.Add("disk $(Get-Gb $df) free (below 1 GB)") }
  elseif ($df -ne '' -and [double]$df -lt 5 * $GbBytes) { [void]$why.Add("disk $(Get-Gb $df) free (below 5 GB)") }
  if ($mf -ne '' -and [double]$mf -lt $GbBytes) { $level = 'red'; [void]$why.Add("memory $(Get-Gb $mf) free (below 1 GB)") }
  elseif ($mf -ne '' -and [double]$mf -lt 2 * $GbBytes) { [void]$why.Add("memory $(Get-Gb $mf) free (below 2 GB)") }
  if ($nlk -gt 0) {
    $s = ''
    if ($nlk -gt 1) { $s = 's' }
    [void]$why.Add("$nlk stale lock$s")
  }
  if ($hd -ne '' -and $hd -cne '-') { [void]$why.Add("held ($hd)") }
  if ($level -cne 'red' -and $why.Count -gt 0) { $level = 'amber' }
  return @{ Level = $level; Reasons = [string]::Join('; ', [string[]]$why.ToArray()); Df = $df; Mf = $mf; Hd = $hd }
}

function Format-Human($facts) {
  $j = Get-Judge $facts
  $n = @{}
  $runs = New-Object System.Collections.ArrayList
  $q = New-Object System.Collections.ArrayList
  $ag = New-Object System.Collections.ArrayList
  $ow = New-Object System.Collections.ArrayList
  $lk = New-Object System.Collections.ArrayList
  $up = ''; $dr = ''; $dt = ''
  foreach ($l in @($facts)) {
    $kv = Split-Kv $l
    $k = $kv[0]; $v = $kv[1]
    if (@('OPEN', 'PENDING', 'PROGRESS', 'BLOCKED', 'DECISION', 'DEFERRED') -ccontains $k) { $n[$k] = $v }
    elseif ($k -ceq 'RUN') {
      $a = $v.Split('|')
      $pre = '          '
      if ($runs.Count -eq 0) { $pre = 'RUNS      ' }
      $title = ''
      if ($a.Count -ge 4) { $title = $a[3] }
      [void]$runs.Add("$pre$($a[0])  $($a[1])  $title")
      if ($a[2] -cne '-') { [void]$runs.Add("          owner $($a[2])") }
    }
    elseif ($k -ceq 'QUEUED') { [void]$q.Add($v) }
    elseif ($k -ceq 'SESSION') {
      $a = $v.Split('|')
      $pre = '          '
      if ($ag.Count -eq 0) { $pre = 'AGENTS    ' }
      [void]$ag.Add("$pre$($a[0]) $($a[1]) idle $($a[$a.Count - 1])m")
    }
    elseif ($k -ceq 'UNPUSHED') { $up = $v }
    elseif ($k -ceq 'OWED') { [void]$ow.Add($v) }
    elseif ($k -ceq 'DRIVE') { $dr = $v }
    elseif ($k -ceq 'DISK_TOTAL') { $dt = $v }
    elseif ($k -ceq 'LOCK') {
      $i = $v.IndexOf('|'); $lp = $v.Substring(0, $i); $s = $v.Substring($i + 1)
      $i = $s.IndexOf('|')
      $pre = '          '
      if ($lk.Count -eq 0) { $pre = 'LOCKS     ' }
      [void]$lk.Add("$pre$lp $($s.Substring(0, $i))m ($($s.Substring($i + 1)))")
    }
  }
  $out = New-Object System.Collections.ArrayList
  [void]$out.Add("TICKETS   $([long]$n['OPEN']) open   [~]$([long]$n['PROGRESS']) [!]$([long]$n['BLOCKED']) [?]$([long]$n['DECISION']) [ ]$([long]$n['PENDING'])   [>]$([long]$n['DEFERRED']) deferred")
  if ($runs.Count -eq 0) { [void]$out.Add('RUNS      none open') } else { foreach ($x in $runs) { [void]$out.Add($x) } }
  if ($q.Count -eq 0) { [void]$out.Add('QUEUED    none') } else { [void]$out.Add('QUEUED    ' + [string]::Join(' ', [string[]]$q.ToArray())) }
  if ($ag.Count -eq 0) { [void]$out.Add('AGENTS    none') } else { foreach ($x in $ag) { [void]$out.Add($x) } }
  if ($up -ceq '-') { [void]$out.Add('UNPUSHED  - (no upstream)') } else { [void]$out.Add("UNPUSHED  $up") }
  if ($ow.Count -eq 0) { [void]$out.Add('GREENS    none owed') } else { [void]$out.Add('GREENS    owed: ' + [string]::Join(' ', [string[]]$ow.ToArray())) }
  $d = $dr
  if ($d -eq '') { $d = '?' }
  [void]$out.Add("DISK      $d $(Get-Gb $j.Df) free of $(Get-Gb $dt)")
  [void]$out.Add("MEMORY    $(Get-Gb $j.Mf) free")
  if ($lk.Count -eq 0) { [void]$out.Add('LOCKS     none stale') } else { foreach ($x in $lk) { [void]$out.Add($x) } }
  if ($j.Hd -eq '' -or $j.Hd -ceq '-') { [void]$out.Add('HOLD      none') } else { [void]$out.Add("HOLD      $($j.Hd)") }
  if ($j.Level -ceq 'green') { [void]$out.Add('WATCHDOG  ok') } else { [void]$out.Add("WATCHDOG  $($j.Level) - $($j.Reasons)") }
  return @($out)
}

function Invoke-Selftest {
  # Native calls below (git, powershell) write stderr on purpose; under 'Stop'
  # PS 5.1 would turn that into a throw.
  $ErrorActionPreference = 'Continue'
  $self = $PSCommandPath
  $T = Join-Path ([System.IO.Path]::GetTempPath()) ("pending-" + [guid]::NewGuid().ToString('N'))
  $script:fail = 0
  $dash = [string][char]0x2014
  $here = Get-Location
  function Eq([string]$name, $got, [string]$want) {
    $g = [string]::Join("`n", @($got))
    if ($g -cne $want) { Write-Output "FAIL: ${name}:`n--- expected`n$want`n--- got`n$g"; $script:fail = 1 }
  }
  function Run {
    $o = & powershell -NoProfile -ExecutionPolicy Bypass -File $self @args 2>&1
    return @($o | ForEach-Object { ([string]$_).TrimEnd("`r") })
  }
  function W([string]$path, [string]$text) {
    $dir = Split-Path -Parent $path
    if ($dir -ne '' -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    [System.IO.File]::WriteAllText($path, $text, $Utf8)
  }
  function Age([string]$path, [long]$epoch) {
    (Get-Item -LiteralPath $path -Force).LastWriteTimeUtc = [DateTimeOffset]::FromUnixTimeSeconds($epoch).UtcDateTime
  }
  $saved = @{}
  foreach ($k in @('PENDING_RELAY', 'PENDING_DF_CMD', 'PENDING_MEM_CMD', 'PENDING_SESSIONS_DIR', 'PENDING_NOW', 'PENDING_T', 'RELAY_DIR')) {
    $saved[$k] = [Environment]::GetEnvironmentVariable($k)
  }
  try {
    $R = "$T/repo"
    New-Item -ItemType Directory -Force -Path "$R/.skillator/sub" | Out-Null
    New-Item -ItemType Directory -Force -Path "$T/sessions" | Out-Null
    Set-Location -LiteralPath $R
    & git init -q . 2>$null | Out-Null
    & git config core.autocrlf false
    W "$R/TICKETS.md" ([string]::Join("`n", @(
      '# Tickets', '', '## Bugs',
      "- [~] B1 $dash cart drawer keeps items (@cc-aaaaaa)",
      "- [!] B2 $dash orders 500 past page 3",
      "- [?] F1 $dash pick the chart library [decide: @asha]",
      "- [>] F2 $dash later thing",
      "- [ ] F3 $dash pending one",
      "  - [ ] F3a $dash a towed car, slowed down",
      "- [x] A1 $dash fixed, the GREEN re-run is OWED",
      '- [ ] no id on this line',
      'not a ticket, owed')) + "`n")
    W "$R/.skillator/run-12-demo-run.md" ([string]::Join("`n", @(
      '# RUN-12 - demo run', 'plan: none', 'owner: @vidul', '', '## Stages',
      '| # | stage | state | owner | heartbeat | landed |',
      '|---|-------|-------|-------|-----------|--------|',
      '| 1 | stage one | x | a | - | abc |',
      '| 2 | stage two | > | a | - | stage 3 |',
      '| 3 | stage three title |  | - | - | - |',
      '| 4 | stage four |  | - | - | - |')) + "`n")
    W "$R/.skillator/run.md.lock" "1234 sh MINGW`n"
    W "$R/.skillator/x.lock" "99 sh MINGW`n"
    W "$R/.skillator/sub/fresh.lock" "7 sh MINGW`n"
    W "$T/sessions/a.json" ('{"pid":1,"sessionId":"s1","cwd":"C:\\w\\r","name":"repo-c0","status":"busy","updatedAt":1}' + "`n")
    W "$T/sessions/b.json" ('{"pid":2,"sessionId":"s2","cwd":"/old","name":"old-one","status":"idle","updatedAt":1}' + "`n")
    $base = [long]1767268800
    Age "$R/.skillator/run.md.lock" $base
    Age "$R/.skillator/x.lock" ($base + 1920)
    Age "$R/.skillator/sub/fresh.lock" ($base + 1920)
    Age "$T/sessions/a.json" ($base + 1800)
    Age "$T/sessions/b.json" ($base - 7200)
    # A fake relay-morpheus.ps1: canned list / queue-run list. R2: the hold is
    # read from the file, never by spawning relay - a watchdog call leaves a mark.
    W "$T/relay.ps1" ([string]::Join("`n", @(
      'param([string]$Mode, [string]$Action, [string]$Sub)',
      'if ($Mode -ceq ''list'') {',
      '  ''RUN-0012  demo run                                    2/4 done  (stage 3 open)''',
      '  ''          plan: none''; ''          owner: @vidul''; ''          resume: continue RUN-0012''',
      '  ''RUN-0013  all landed                                  3/3 done''',
      '  ''          plan: none''; ''          resume: continue RUN-0013''; exit 0 }',
      'if ($Mode -ceq ''queue-run'' -and $Sub -ceq ''list'') {',
      '  Add-Content -LiteralPath ''.skillator/queue.md'' -Value ''# Run queue''',
      '  ''# Run queue''; ''away: -''; ''landing: -''; ''''; ''| # | run | state | since | owner |''',
      '  ''|---|-----|-------|-------|-------|''; ''| 1 | RUN-0012 | running | 2026-01-01T10:00Z | @vidul |''',
      '  ''| 2 | RUN-0013 | queued | 2026-01-01T10:00Z | - |''; ''| 3 | RUN-0014 | landed | 2026-01-01T10:00Z | - |''; exit 0 }',
      'if ($Mode -ceq ''watchdog'') { [IO.File]::WriteAllText((Join-Path $env:PENDING_T ''relay-watchdog-called''), ''''); ''HELD 2026-01-01T09:00Z from relay''; exit 0 }',
      '[Console]::Error.WriteLine(''FAIL: unknown mode''); exit 1')) + "`n")
    $env:PENDING_RELAY = "$T/relay.ps1"
    $env:PENDING_DF_CMD = "'858993459 1000000000000 X:'"
    $env:PENDING_MEM_CMD = "'3435973836'"
    $env:PENDING_SESSIONS_DIR = "$T/sessions"
    $env:PENDING_NOW = [string]($base + 2040)
    $env:PENDING_T = $T
    $env:RELAY_DIR = $null

    Eq 'kv' (Run --kv) ([string]::Join("`n", @('OPEN=5', 'PENDING=2', 'PROGRESS=1', 'BLOCKED=1', 'DECISION=1', 'DEFERRED=1',
      'RUN=RUN-0012|2/4|@vidul|stage three title', 'SESSION=repo-c0|busy|C:\w\r|4', 'UNPUSHED=-', 'OWED=A1',
      'DRIVE=X:', 'DISK_FREE=858993459', 'DISK_TOTAL=1000000000000', 'MEM_FREE=3435973836',
      'LOCK=.skillator/run.md.lock|34|1234 sh MINGW', 'HOLD=-', 'WATCHDOG=red')))
    # No queue.md: queue-run list is never called (it would create the file).
    if (Test-Path -LiteralPath "$R/.skillator/queue.md") { Write-Output 'FAIL: pending created .skillator/queue.md'; $script:fail = 1 }
    W "$R/.skillator/queue.md" "# Run queue`n"
    Eq 'human' (Run) ([string]::Join("`n", @('TICKETS   5 open   [~]1 [!]1 [?]1 [ ]2   [>]1 deferred',
      'RUNS      RUN-0012  2/4  stage three title', '          owner @vidul', 'QUEUED    RUN-0013',
      'AGENTS    repo-c0 busy idle 4m', 'UNPUSHED  - (no upstream)', 'GREENS    owed: A1',
      'DISK      X: 0.8 GB free of 931 GB', 'MEMORY    3.2 GB free',
      'LOCKS     .skillator/run.md.lock 34m (1234 sh MINGW)', 'HOLD      none',
      'WATCHDOG  red - disk 0.8 GB free (below 1 GB); 1 stale lock')))
    # R2: HOLD= comes from <main>/.skillator/watchdog.hold itself, the words
    # relay-morpheus -Mode watchdog -Action status gives (CRLF tolerated, first line only).
    W "$R/.skillator/watchdog.hold" "2026-01-01T11:00Z disk low`r`nsecond line`n"
    Eq 'machine, held' (Run --machine) ([string]::Join("`n", @('DRIVE=X:', 'DISK_FREE=858993459', 'DISK_TOTAL=1000000000000',
      'MEM_FREE=3435973836', 'LOCK=.skillator/run.md.lock|34|1234 sh MINGW', 'HOLD=2026-01-01T11:00Z disk low')))
    New-Item -ItemType Directory -Force -Path "$R/sub/deep" | Out-Null
    Set-Location -LiteralPath "$R/sub/deep"
    Eq 'held, from a subdir' (@(Run --machine) | Where-Object { $_ -cmatch '^HOLD=' }) 'HOLD=2026-01-01T11:00Z disk low'
    Set-Location -LiteralPath $R
    W "$R/.skillator/watchdog.hold" "2026-01-01T11:00Z`n"
    Eq 'held, no reason' (@(Run --machine) | Where-Object { $_ -cmatch '^HOLD=' }) 'HOLD=2026-01-01T11:00Z -'
    # R6: a hold file that exists is held, whatever is in it - empty or blank
    # reads HOLD=? - (HOLD=- means only "no file"), as relay's status says HELD ? -.
    W "$R/.skillator/watchdog.hold" ''
    Eq 'held, empty file' (@(Run --machine) | Where-Object { $_ -cmatch '^HOLD=' }) 'HOLD=? -'
    W "$R/.skillator/watchdog.hold" " `t `r`n"
    Eq 'held, blank file' (@(Run --machine) | Where-Object { $_ -cmatch '^HOLD=' }) 'HOLD=? -'
    Eq 'held, blank file, human' (@(Run) | Where-Object { $_ -cmatch '^(HOLD|WATCHDOG) ' }) ([string]::Join("`n", @(
      'HOLD      ? -', 'WATCHDOG  red - disk 0.8 GB free (below 1 GB); 1 stale lock; held (? -)')))
    Remove-Item -LiteralPath "$R/.skillator/watchdog.hold" -Force
    Eq 'not held' (@(Run --machine) | Where-Object { $_ -cmatch '^HOLD=' }) 'HOLD=-'
    # R2b: one rule for the hold's place - RELAY_DIR; else in git the main
    # checkout (common dir's parent, or the toplevel when the git dir lives
    # elsewhere); outside git ./.skillator of the location.
    $null = Git-Out init -q --separate-git-dir "$T/sep.git" "$T/sep"
    W "$T/sep/.skillator/watchdog.hold" "2026-01-01T12:00Z sep low`n"
    New-Item -ItemType Directory -Force -Path "$T/sep/sub" | Out-Null
    Set-Location -LiteralPath "$T/sep/sub"
    Eq 'held, separate git dir' (@(Run --machine) | Where-Object { $_ -cmatch '^HOLD=' }) 'HOLD=2026-01-01T12:00Z sep low'
    W "$T/rd/watchdog.hold" "2026-01-01T12:02Z rd low`n"
    $env:RELAY_DIR = "$T/rd"
    Eq 'held, RELAY_DIR' (@(Run --machine) | Where-Object { $_ -cmatch '^HOLD=' }) 'HOLD=2026-01-01T12:02Z rd low'
    $env:RELAY_DIR = $null
    W "$T/nogit/.skillator/watchdog.hold" "2026-01-01T12:01Z nogit low`n"
    Set-Location -LiteralPath "$T/nogit"
    Eq 'held, outside git' (@(Run --machine) | Where-Object { $_ -cmatch '^HOLD=' }) 'HOLD=2026-01-01T12:01Z nogit low'
    Set-Location -LiteralPath $R
    if (Test-Path -LiteralPath "$T/relay-watchdog-called") { Write-Output 'FAIL: pending spawned relay for the hold'; $script:fail = 1 }
    # No relay at all: no RUN / QUEUED lines, HOLD=-; amber on memory + the lock.
    $env:PENDING_RELAY = "$T/none.ps1"
    $env:PENDING_DF_CMD = "'10737418240 1000000000000 X:'"
    $env:PENDING_MEM_CMD = "'1610612736'"
    Eq 'amber' (@(Run) | Where-Object { $_ -cmatch '^(RUNS|QUEUED|DISK|WATCHDOG) ' }) ([string]::Join("`n", @(
      'RUNS      none open', 'QUEUED    none', 'DISK      X: 10 GB free of 931 GB',
      'WATCHDOG  amber - memory 1.5 GB free (below 2 GB); 1 stale lock')))
    Remove-Item -LiteralPath "$R/.skillator/run.md.lock" -Force
    $env:PENDING_MEM_CMD = "'3435973836'"
    Eq 'green' (@(Run --kv) | Where-Object { $_ -cmatch '^(RUN|QUEUED|LOCK|HOLD|WATCHDOG)=' }) "HOLD=-`nWATCHDOG=green"
    Eq 'bad arg' (Run --nope) 'pending: usage: pending.ps1 [--kv | --machine | --selftest]'
  } finally {
    Set-Location -LiteralPath $here
    foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k]) }
    Remove-Item -LiteralPath $T -Recurse -Force -ErrorAction SilentlyContinue
  }
  if ($script:fail -ne 0) { exit 1 }
  Write-Output 'ok'
}

$mode = ''
if ($args.Count -gt 0) { $mode = [string]$args[0] }
if ($mode -ceq '--selftest') { Invoke-Selftest; exit 0 }
if ((@('', '--kv', '--machine') -cnotcontains $mode) -or ($args.Count -gt 1)) {
  [Console]::Error.WriteLine('pending: usage: pending.ps1 [--kv | --machine | --selftest]')
  exit 1
}
$script:Relay = $env:PENDING_RELAY
if (-not $script:Relay) { $script:Relay = Join-Path $PSScriptRoot '../../relay-morpheus/hooks/relay-morpheus.ps1' }
$script:Now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
if ((Get-Num $env:PENDING_NOW) -ne '') { $script:Now = [long]$env:PENDING_NOW }
$script:Main = Find-Main
$lines = New-Object System.Collections.ArrayList
if ($mode -ceq '--machine') {
  foreach ($l in (Get-MachineKv)) { [void]$lines.Add($l) }
} else {
  $facts = Get-Facts
  if ($mode -ceq '--kv') {
    foreach ($l in $facts) { [void]$lines.Add($l) }
    [void]$lines.Add('WATCHDOG=' + (Get-Judge $facts).Level)
  } else {
    foreach ($l in (Format-Human $facts)) { [void]$lines.Add($l) }
  }
}
$stdout = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), $Utf8)
$stdout.NewLine = "`n"
foreach ($o in $lines) { $stdout.WriteLine([string]$o) }
$stdout.Flush()
exit 0
