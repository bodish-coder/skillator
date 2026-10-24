# pending.ps1 - what is pending, in one report (F50, F69). Windows twin of
# pending.sh, which carries the key list and the reasoning; same output byte
# for byte (pending.sh --selftest compares the two), keep the two in step.
#
#   pending.ps1              the human report: plain ASCII, every line within 80 columns
#   pending.ps1 --kv         the same facts as KEY=value lines (the ops-board mod parses these)
#   pending.ps1 --machine    DRIVE / DISK_* / MEM_FREE / LOCK / HOLD only (cheap; the band's poll)
#   pending.ps1 --selftest   fixture repo, every mode, prints ok
#
# Test-only overrides: PENDING_DF_CMD, PENDING_MEM_CMD (PowerShell commands
# here), PENDING_SESSIONS_DIR, PENDING_RELAY (the relay .ps1), PENDING_NOW.
# F69: run files are read directly (no relay child powershell: 1.2 s), and
# memory comes from ComputerInfo (Get-CimInstance only as the fallback: 0.4 s).
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

# Integer division of non-negative numbers, as awk's int(a / b).
function Div([double]$a, [double]$b) { return [long][Math]::Floor($a / $b) }

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

# Plain ASCII, as pending.sh's ascii(): dashes, curly quotes, the ellipsis,
# the arrow and the middle dot get their ASCII spelling, any other non-ASCII
# character is one '?', control characters a space.
function ConvertTo-Ascii([string]$s) {
  $s = [regex]::Replace($s, '[\x01-\x1F\x7F]', ' ')
  $s = $s.Replace([string][char]0x2014, '-').Replace([string][char]0x2013, '-')
  $s = $s.Replace([string][char]0x2018, "'").Replace([string][char]0x2019, "'")
  $s = $s.Replace([string][char]0x201C, '"').Replace([string][char]0x201D, '"')
  $s = $s.Replace([string][char]0x2026, '...').Replace([string][char]0x2192, '->').Replace([string][char]0x00B7, '.')
  $s = [regex]::Replace($s, '[\uD800-\uDBFF][\uDC00-\uDFFF]', '?')
  return [regex]::Replace($s, '[^\x00-\x7F]', '?')
}

function Get-Days([long]$y, [long]$m, [long]$d) {
  if ($m -le 2) { $y = $y - 1 }
  $era = Div $y 400
  $yoe = $y - $era * 400
  $mm = $m + 9
  if ($m -gt 2) { $mm = $m - 3 }
  $doy = (Div (153 * $mm + 2) 5) + $d - 1
  return $era * 146097 + $yoe * 365 + (Div $yoe 4) - (Div $yoe 100) + $doy - 719468
}

# Epoch seconds of the first YYYY-MM-DDTHH:MM in a string (UTC); -1 when none.
function Get-Stamp([string]$s) {
  $m = [regex]::Match($s, '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}')
  if (-not $m.Success) { return [long]-1 }
  $v = $m.Value
  $y = [long]$v.Substring(0, 4); $mo = [long]$v.Substring(5, 2); $d = [long]$v.Substring(8, 2)
  $h = [long]$v.Substring(11, 2); $mi = [long]$v.Substring(14, 2)
  if ($mo -lt 1 -or $mo -gt 12 -or $d -lt 1 -or $d -gt 31 -or $h -gt 23 -or $mi -gt 59) { return [long]-1 }
  return (Get-Days $y $mo $d) * 86400 + $h * 3600 + $mi * 60
}

# The board, one pass: counts, then TICKET / TEST / OWED lines.
function Get-Board {
  $c = @{}
  $tk = New-Object System.Collections.ArrayList
  $te = New-Object System.Collections.ArrayList
  $owed = New-Object System.Collections.ArrayList
  $f = "$script:Main/TICKETS.md"
  if (Test-Path -LiteralPath $f -PathType Leaf) {
    foreach ($l in (Read-Lines $f)) {
      $m = [regex]::Match($l, $TicketRe)
      if (-not $m.Success) { continue }
      $k = $m.Groups[1].Value
      $id = $m.Groups[2].Value
      if ($c.ContainsKey($k)) { $c[$k] = $c[$k] + 1 } else { $c[$k] = 1 }
      if (@(' ', '~', '!', '?', '%', '>') -cnotcontains $k) { continue }
      if ($k -cne '>' -and $l.ToLowerInvariant() -cmatch '(^|[^a-z0-9_])owed([^a-z0-9_]|$)') { [void]$owed.Add('OWED=' + $id) }
      $g = $m.Groups[2]
      $r = ConvertTo-Ascii $l.Substring($g.Index + $g.Length)
      $r = [regex]::Replace($r, '^ *- *', '')
      $tag = ''
      $x = [regex]::Match($r, '\[owner:[^\]]*\]')
      if ($x.Success) { $tag = $x.Value.Substring(7, $x.Length - 8).Trim(' ') }
      if ($k -ceq '?') {
        $x = [regex]::Match($r, '\[decide:[^\]]*\]')
        if ($x.Success) {
          $v = $x.Value.Substring(8, $x.Length - 9).Trim(' ')
          if ($v -ne '') { if ($tag -ne '') { $tag += ' ' }; $tag += "decide $v" }
        }
      }
      $xs = [regex]::Matches($r, '\(@[^() ]+\)')
      if ($xs.Count -gt 0) {
        $v = $xs[$xs.Count - 1].Value
        if ($tag -ne '') { $tag += ' ' }
        $tag += $v.Substring(1, $v.Length - 2)
      }
      $note = ''
      $x = [regex]::Match($r, '\(testing:[^)]*\)')
      if ($x.Success) { $note = $x.Value.Substring(9, $x.Length - 10).Trim(' ') }
      $r = [regex]::Replace($r, '\[(app|owner|decide|by):[^\]]*\]', '')
      $r = [regex]::Replace($r, '\(@[^() ]+\)', '')
      $r = [regex]::Replace($r, '\(testing:[^)]*\)', '')
      $a = $r.IndexOf(' (', [StringComparison]::Ordinal)
      $b = $r.IndexOf('. ', [StringComparison]::Ordinal)
      if ($b -ge 0 -and ($a -lt 0 -or $b -lt $a)) { $a = $b }
      if ($a -ge 0) { $r = $r.Substring(0, $a) }
      $r = [regex]::Replace($r, '  +', ' ').Trim(' ')
      [void]$tk.Add("TICKET=$k|$id|$tag|$r")
      if ($k -ceq '%') {
        if ($note -eq '') { $note = '-' }
        [void]$te.Add("TEST=$id|$note")
      }
    }
  }
  $n = @{}
  foreach ($k in @(' ', '~', '!', '?', '%', '>')) { $n[$k] = 0; if ($c.ContainsKey($k)) { $n[$k] = [int]$c[$k] } }
  $out = New-Object System.Collections.ArrayList
  foreach ($l in @(
    ('OPEN=' + ($n[' '] + $n['~'] + $n['!'] + $n['?'] + $n['%'])),
    ('PENDING=' + $n[' ']), ('PROGRESS=' + $n['~']), ('BLOCKED=' + $n['!']),
    ('DECISION=' + $n['?']), ('TESTING=' + $n['%']), ('DEFERRED=' + $n['>']))) { [void]$out.Add($l) }
  foreach ($set in @($tk, $te, $owed)) { foreach ($l in $set) { [void]$out.Add($l) } }
  return @($out)
}

# Runs not all done, straight from the run files (RELAY_DIR overrides
# <main>/.skillator), in run-number order. age: minutes since the newest of the
# header's `updated:` stamp and the rows' heartbeat stamps; '-' when none.
function Get-RunsKv {
  $dir = "$script:Main/.skillator"
  if ($env:RELAY_DIR) { $dir = $env:RELAY_DIR }
  if (-not (Test-Path -LiteralPath $dir -PathType Container)) { return @() }
  $names = Sort-Ordinal @(Get-ChildItem -LiteralPath $dir -File -Force | ForEach-Object { $_.Name } | Where-Object { $_ -clike 'run-*.md' })
  $nums = New-Object System.Collections.ArrayList
  $lines = New-Object System.Collections.ArrayList
  foreach ($nm in $names) {
    $b = [regex]::Replace($nm.Substring(4), '[-.].*$', '')
    if ($b -cnotmatch '\A[0-9]+\z') { continue }
    $num = [long]$b
    $id = 'RUN-' + $num.ToString('0000')
    $hdr = $true; $ow = ''; $d = 0; $t = 0; $st = ''; $new = [long]-1
    $act = New-Object System.Collections.ArrayList
    foreach ($l in (Read-Lines "$dir/$nm")) {
      if ($hdr -and $l.StartsWith('## ', [StringComparison]::Ordinal)) { $hdr = $false }
      if ($hdr -and $ow -eq '' -and $l.StartsWith('owner: ', [StringComparison]::Ordinal)) { $ow = (ConvertTo-Ascii $l.Substring(7)).Trim(" `t".ToCharArray()) }
      if ($hdr) {
        $i = $l.IndexOf('updated: ', [StringComparison]::Ordinal)
        if ($i -ge 0) { $x = Get-Stamp $l.Substring($i + 9); if ($x -gt $new) { $new = $x } }
      }
      if ($l -cmatch '^\| *[0-9]+ *\|') {
        $cells = $l.Split('|')
        $t++
        $s = ([string]$cells[3]) -replace '[ \t]', ''
        if ($s -ceq 'x' -or $s -ceq '>') { $d++ }
        else {
          $y = (ConvertTo-Ascii ([string]$cells[2])).Trim(" `t".ToCharArray())
          if ($y -eq '') { $y = '-' }
          if ($st -eq '') { $st = $y }
          # A152: every in-flight stage, right after the run's RUN line.
          if ($s -ceq '~') { [void]$act.Add("ACTIVE=$id|$y") }
        }
        $x = Get-Stamp ([string]$cells[5]); if ($x -gt $new) { $new = $x }
      }
    }
    if ($t -gt 0 -and $d -lt $t) {
      $a = '-'
      if ($new -ge 0) { $av = Div ([Math]::Max(0, $script:Now - $new)) 60; $a = [string]$av }
      if ($ow -eq '') { $ow = '-' }
      if ($st -eq '') { $st = '-' }
      [void]$nums.Add($num); [void]$lines.Add([string[]](@("RUN=$id|$d/$t|$ow|$st|$a") + @($act)))
    }
  }
  # Insertion sort on the number: stable, as pending.sh's.
  for ($i = 1; $i -lt $nums.Count; $i++) {
    for ($j = $i; $j -gt 0 -and $nums[$j - 1] -gt $nums[$j]; $j--) {
      $k = $nums[$j]; $nums[$j] = $nums[$j - 1]; $nums[$j - 1] = $k
      $k = $lines[$j]; $lines[$j] = $lines[$j - 1]; $lines[$j - 1] = $k
    }
  }
  $out = New-Object System.Collections.ArrayList
  foreach ($g in $lines) { foreach ($x in $g) { [void]$out.Add($x) } }
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

# Live sessions: <config dir>/sessions/*.json - a busy one written in the last
# 12 h (it does not rewrite its file while it works), any other in the last 30 min.
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
    if ($a -lt 0) { $a = 0 }
    if ($a -ge 43200) { continue }
    $t = ''
    try { $t = [string]::Join("`n", (Read-Lines $f)) + "`n" } catch { continue }
    $st = Get-JStr $t 'status'
    if ($st -cne 'busy' -and $a -ge 1800) { continue }
    [void]$out.Add("SESSION=$(Get-JStr $t 'name')|$st|$(Get-JStr $t 'cwd')|$(Div $a 60)")
  }
  return @($out)
}

# The main checkout's branch against its upstream - one git call, local refs.
function Get-BranchKv {
  $b = ''; $u = ''; $tr = ''
  foreach ($l in @(Git-Out -C $script:Main for-each-ref '--format=%(HEAD)|%(refname:short)|%(upstream:short)|%(upstream:track,nobracket)' refs/heads)) {
    if ($null -eq $l) { continue }
    $p = ([string]$l).TrimEnd("`r").Split('|')
    if ($p[0] -ceq '*') { $b = $p[1]; $u = [string]$p[2]; $tr = [string]$p[3] }
  }
  if ($b -eq '') { return @('BRANCH=-|-|-|-', 'UNPUSHED=-') }
  if ($u -eq '' -or $tr -ceq 'gone') {
    if ($u -eq '') { $u = '-' }
    return @("BRANCH=$b|$u|-|-", 'UNPUSHED=-')
  }
  $ah = 0; $be = 0
  $x = [regex]::Match($tr, 'ahead ([0-9]+)'); if ($x.Success) { $ah = [long]$x.Groups[1].Value }
  $x = [regex]::Match($tr, 'behind ([0-9]+)'); if ($x.Success) { $be = [long]$x.Groups[1].Value }
  return @("BRANCH=$b|$u|$ah|$be", "UNPUSHED=$ah")
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
    try {
      Add-Type -AssemblyName Microsoft.VisualBasic
      $mem = [string](New-Object Microsoft.VisualBasic.Devices.ComputerInfo).AvailablePhysicalMemory
    } catch {
      try { $mem = [string]([long](Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory * 1024) } catch { $mem = '' }
    }
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
  $repo = $script:Main.Substring($script:Main.LastIndexOfAny([char[]]@('/', '\')) + 1)
  $out = New-Object System.Collections.ArrayList
  [void]$out.Add("REPO=$repo")
  foreach ($set in @((Get-BranchKv), (Get-Board), (Get-RunsKv), (Get-QueuedKv), (Get-SessionsKv), (Get-MachineKv))) {
    foreach ($l in @($set)) { if ($null -ne $l) { [void]$out.Add([string]$l) } }
  }
  return @($out)
}

# GB figures: one decimal below 10, whole from 10; '?' when unknown. Given the
# threshold a figure is below ($lim, bytes), its text never reads as that
# threshold: where rounding would reach it (0.97 GB -> '1.0') it is floored
# ('0.9'), to two decimals should one still reach it. Same as figure() in
# mods/ops-board facts.ts.
function Get-Gb([string]$b, [double]$lim = 0) {
  if ($b -eq '') { return '?' }
  $x = [double]$b
  $t = [long][Math]::Floor($x * 10 / $GbBytes + 0.5)
  if ($t -lt 100) { $txt = '{0}.{1}' -f [long][Math]::Floor($t / 10), ($t % 10) }
  else { $txt = [string][long][Math]::Floor($x / $GbBytes + 0.5) }
  if ($lim -le 0 -or $x -ge $lim -or [double]$txt * $GbBytes -lt $lim) { return "$txt GB" }
  $inv = [Globalization.CultureInfo]::InvariantCulture
  $f1 = [Math]::Floor($x / $GbBytes * 10) / 10
  if ($f1 * $GbBytes -lt $lim) { return ($f1.ToString('0.0', $inv) + ' GB') }
  return (([Math]::Floor($x / $GbBytes * 100) / 100).ToString('0.00', $inv) + ' GB')
}

# One figure as the report shows it: floored against the threshold it is below.
function Get-Fig([string]$b, [double]$red, [double]$amber) {
  if ($b -ne '' -and [double]$b -lt $red) { return (Get-Gb $b $red) }
  if ($b -ne '' -and [double]$b -lt $amber) { return (Get-Gb $b $amber) }
  return (Get-Gb $b)
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
  if ($df -ne '' -and [double]$df -lt $GbBytes) { $level = 'red'; [void]$why.Add("disk $(Get-Gb $df $GbBytes) free (below 1 GB)") }
  elseif ($df -ne '' -and [double]$df -lt 5 * $GbBytes) { [void]$why.Add("disk $(Get-Gb $df (5 * $GbBytes)) free (below 5 GB)") }
  if ($mf -ne '' -and [double]$mf -lt $GbBytes) { $level = 'red'; [void]$why.Add("memory $(Get-Gb $mf $GbBytes) free (below 1 GB)") }
  elseif ($mf -ne '' -and [double]$mf -lt 2 * $GbBytes) { [void]$why.Add("memory $(Get-Gb $mf (2 * $GbBytes)) free (below 2 GB)") }
  if ($nlk -gt 0) {
    $s = ''
    if ($nlk -gt 1) { $s = 's' }
    [void]$why.Add("$nlk stale lock$s")
  }
  if ($hd -ne '' -and $hd -cne '-') { [void]$why.Add("held ($hd)") }
  if ($level -cne 'red' -and $why.Count -gt 0) { $level = 'amber' }
  return @{ Level = $level; Reasons = [string]::Join('; ', [string[]]$why.ToArray()); Df = $df; Mf = $mf; Hd = $hd; Nlk = $nlk }
}

# --- the human report (F69): the same bytes as pending.sh's human() ---------
function Get-Trunc([string]$s, [int]$w) {
  if ($s.Length -le $w) { return $s }
  if ($w -lt 4) { if ($w -le 0) { return '' }; return $s.Substring(0, $w) }
  # A152: cut at a word boundary - back to the last space when the cut falls
  # inside a word; one word longer than the room is still cut.
  $c = $s.Substring(0, $w - 3)
  if ($s[$w - 3] -cne ' ') {
    $k = $c.LastIndexOf(' ')
    if ($k -gt 0 -and $c.Substring(0, $k).Trim(' ') -ne '') { $c = $c.Substring(0, $k) }
  }
  return ($c.TrimEnd(' ') + '...')
}
function Get-Pad([string]$s, [int]$w) { if ($s.Length -ge $w) { return $s } return $s + (' ' * ($w - $s.Length)) }
function Get-Age([long]$n) {
  if ($n -lt 60) { return "${n}m" }
  if ($n -lt 2880) { return "$(Div $n 60)h" }
  return "$(Div $n 1440)d"
}
function Get-NormPath([string]$p) { return [regex]::Replace($p.ToLowerInvariant().Replace('\', '/'), '/+$', '') }

function Format-Human($facts) {
  $o = New-Object System.Collections.ArrayList
  $add = { param([string]$s) [void]$o.Add($s.TrimEnd(' ')) }
  $wrap = {
    param([string]$pre, [string]$text, [string]$cont)
    $line = $pre; $has = $false
    foreach ($w in ($text -split ' +')) {
      if ($w -eq '') { continue }
      if ($has -and $line.Length + 1 + $w.Length -gt 80) { & $add $line; $line = $cont; $has = $false }
      if (-not $has -and $line.Length + $w.Length -gt 80) { $w = Get-Trunc $w (80 - $line.Length) }
      if ($has) { $line += ' ' + $w } else { $line += $w }
      $has = $true
    }
    & $add $line
  }
  $right = {
    param([string]$lead, [string]$text, [string]$tag)
    if ($tag -eq '') { & $add ($lead + (Get-Trunc $text (80 - $lead.Length))); return }
    $tag = Get-Trunc $tag 24
    $room = 80 - $lead.Length - 2 - $tag.Length
    & $add ($lead + (Get-Pad (Get-Trunc $text $room) $room) + '  ' + $tag)
  }

  $j = Get-Judge $facts
  $repo = ''; $br = ''; $up = ''; $ah = ''; $be = ''; $hasbr = $false; $no = 0; $nd = 0
  $tix = @{}; foreach ($k in @('~', '%', '!', '?', ' ', '>')) { $tix[$k] = New-Object System.Collections.ArrayList }
  $tests = New-Object System.Collections.ArrayList
  $runs = New-Object System.Collections.ArrayList
  $q = New-Object System.Collections.ArrayList
  $ses = New-Object System.Collections.ArrayList
  $ow = New-Object System.Collections.ArrayList
  $lk = New-Object System.Collections.ArrayList
  $dr = ''; $dt = ''
  $act = @{}
  $mn = Get-NormPath $script:Main
  foreach ($l in @($facts)) {
    $kv = Split-Kv $l
    $k = $kv[0]; $v = $kv[1]
    if ($k -ceq 'REPO') { $repo = ConvertTo-Ascii $v }
    elseif ($k -ceq 'BRANCH') { $p = $v.Split('|'); $br = ConvertTo-Ascii $p[0]; $up = ConvertTo-Ascii $p[1]; $ah = $p[2]; $be = $p[3]; $hasbr = $true }
    elseif ($k -ceq 'OPEN') { $no = [long]$v }
    elseif ($k -ceq 'DEFERRED') { $nd = [long]$v }
    elseif ($k -ceq 'TICKET') {
      $m = $v.Substring(0, 1); $s = $v.Substring(2)
      $i = $s.IndexOf('|'); $id = $s.Substring(0, $i); $s = $s.Substring($i + 1)
      $i = $s.IndexOf('|')
      if ($tix.ContainsKey($m)) { [void]$tix[$m].Add(@($id, $s.Substring(0, $i), $s.Substring($i + 1))) }
    }
    elseif ($k -ceq 'TEST') { $i = $v.IndexOf('|'); [void]$tests.Add(@($v.Substring(0, $i), $v.Substring($i + 1))) }
    elseif ($k -ceq 'RUN') { [void]$runs.Add($v.Split('|')) }
    elseif ($k -ceq 'ACTIVE') {
      $i = $v.IndexOf('|'); $ri = $v.Substring(0, $i)
      if ($act.ContainsKey($ri)) { $act[$ri] += ', ' + $v.Substring($i + 1) } else { $act[$ri] = $v.Substring($i + 1) }
    }
    elseif ($k -ceq 'QUEUED') { [void]$q.Add($v) }
    elseif ($k -ceq 'SESSION') {
      $a = $v.Split('|')
      $cw = [string]::Join('|', $a[2..($a.Count - 2)])
      $c = Get-NormPath $cw
      $isin = ($c -ceq $mn) -or $c.StartsWith($mn + '/', [StringComparison]::Ordinal)
      [void]$ses.Add(@((ConvertTo-Ascii $a[0]), $a[1], [long]$a[$a.Count - 1], $isin))
    }
    elseif ($k -ceq 'OWED') { [void]$ow.Add($v) }
    elseif ($k -ceq 'DRIVE') { $dr = ConvertTo-Ascii $v }
    elseif ($k -ceq 'DISK_TOTAL') { $dt = $v }
    elseif ($k -ceq 'LOCK') {
      $i = $v.IndexOf('|'); $lp = $v.Substring(0, $i); $s = $v.Substring($i + 1)
      $i = $s.IndexOf('|')
      [void]$lk.Add((ConvertTo-Ascii "$lp $($s.Substring(0, $i))m ($($s.Substring($i + 1)))"))
    }
  }

  if (-not $hasbr -or $br -ceq '-') { $bt = 'detached HEAD' }
  elseif ($up -ceq '-') { $bt = "${br}: no upstream" }
  elseif ($ah -ceq '-') { $bt = "${br}: upstream $up gone" }
  elseif ([long]$ah -eq 0 -and [long]$be -eq 0) { $bt = "${br}: up to date with $up" }
  elseif ([long]$be -eq 0) { $bt = "${br}: $ah ahead of $up" }
  elseif ([long]$ah -eq 0) { $bt = "${br}: $be behind $up" }
  else { $bt = "${br}: $ah ahead, $be behind $up" }
  $when = [DateTimeOffset]::FromUnixTimeSeconds($script:Now).UtcDateTime.ToString('yyyy-MM-dd HH:mm', [Globalization.CultureInfo]::InvariantCulture) + 'Z'
  $h = "REPO      $repo  $bt  $when"
  if ($h.Length -le 80) { & $add $h } else { & $wrap 'REPO      ' "$repo $bt $when" '          ' }

  & $add "TICKETS   $no open, $nd deferred"
  $labels = @{ '~' = 'in progress'; '%' = 'testing'; '!' = 'blocked'; '?' = 'decision'; ' ' = 'pending' }
  foreach ($m in @('~', '%', '!', '?', ' ')) {
    $rows = $tix[$m]
    if ($rows.Count -eq 0) { continue }
    & $add "  $($labels[$m]) ($($rows.Count))"
    $lim = $rows.Count
    if ($m -ceq ' ' -and $lim -gt 10) { $lim = 10 }
    for ($i = 0; $i -lt $lim; $i++) { & $right ('    ' + (Get-Pad $rows[$i][0] 5) + ' ') $rows[$i][2] $rows[$i][1] }
    if ($lim -lt $rows.Count) { & $add "    ... $($rows.Count - $lim) more pending: list tickets" }
  }
  if ($tix['>'].Count -gt 0) {
    $ids = [string]::Join(' ', [string[]]@($tix['>'] | ForEach-Object { $_[0] }))
    & $wrap "  deferred ($($tix['>'].Count)): " $ids '    '
  }

  $live = New-Object System.Collections.ArrayList
  if ($runs.Count -eq 0) { & $add 'RUNS      none open' }
  for ($i = 0; $i -lt $runs.Count; $i++) {
    $r = $runs[$i]
    if ($r[4] -ceq '-') { $st = 'stale ?' }
    elseif ([long]$r[4] -gt 1440) { $st = 'stale ' + (Get-Age ([long]$r[4])) }
    else { $st = 'live ' + (Get-Age ([long]$r[4])) }
    $pre = '          '
    if ($i -eq 0) { $pre = 'RUNS      ' }
    $stage = $r[3]
    if ($stage -ceq '-') { $stage = '(no open stage)' }
    $tag = $r[2]
    if ($tag -ceq '-') { $tag = '' }
    & $right ($pre + $r[0] + '  ' + (Get-Pad $st 9) + '  ' + (Get-Pad $r[1] 5) + '  ') $stage $tag
    # A152: every in-flight stage; with none, the first open one.
    if ($act.ContainsKey($r[0])) { $stage = $act[$r[0]] }
    if ($st.StartsWith('live')) { [void]$live.Add("$($r[0]) at $stage") }
  }
  if ($q.Count -gt 0) { & $wrap '          queued: ' ([string]::Join(' ', [string[]]$q.ToArray())) '                  ' }

  $ag = 0; $other = 0
  foreach ($s in $ses) {
    if (-not $s[3]) { $other++; continue }
    if ($s[1] -ceq 'busy') { $w = 'working' } elseif ($s[1] -ceq '-') { $w = 'unknown' } else { $w = ConvertTo-Ascii $s[1] }
    $pre = '          '
    if ($ag -eq 0) { $pre = 'AGENTS    ' }
    $ag++
    & $add (Get-Trunc "$pre$($s[0]) $w $(Get-Age $s[2])" 80)
  }
  if ($ag -eq 0) {
    if ($other -gt 0) { & $add "AGENTS    none here (+$other in other repos)" } else { & $add 'AGENTS    none' }
  } elseif ($other -gt 0) { & $add "          +$other in other repos" }

  $lv = 'ok'
  if ($j.Level -cne 'green') { $lv = $j.Level.ToUpperInvariant() }
  $d = $dr
  if ($d -eq '') { $d = '?' }
  $d1 = "disk $d $(Get-Fig $j.Df $GbBytes (5 * $GbBytes)) free of $(Get-Gb $dt)"
  if ($j.Df -ne '' -and [double]$j.Df -lt $GbBytes) { $d1 += ' (below 1 GB)' } elseif ($j.Df -ne '' -and [double]$j.Df -lt 5 * $GbBytes) { $d1 += ' (below 5 GB)' }
  $m1 = "memory $(Get-Fig $j.Mf $GbBytes (2 * $GbBytes)) free"
  if ($j.Mf -ne '' -and [double]$j.Mf -lt $GbBytes) { $m1 += ' (below 1 GB)' } elseif ($j.Mf -ne '' -and [double]$j.Mf -lt 2 * $GbBytes) { $m1 += ' (below 2 GB)' }
  & $wrap "MACHINE   $lv  " "$d1, $m1" '          '
  if ($j.Nlk -eq 0) { $l2 = 'no stale locks' }
  else {
    $s = ''
    if ($j.Nlk -gt 1) { $s = 's' }
    $l2 = "$($j.Nlk) stale lock${s}: " + [string]::Join(', ', [string[]]$lk.ToArray())
  }
  if ($j.Hd -eq '' -or $j.Hd -ceq '-') { $h2 = 'no hold' }
  else {
    $hh = ConvertTo-Ascii $j.Hd
    $i = $hh.IndexOf(' ')
    if ($i -ge 0) { $hs = $hh.Substring(0, $i); $hw = $hh.Substring($i + 1) } else { $hs = $hh; $hw = '-' }
    if ($hs -ceq '?') { $h2 = 'held (no date)' } else { $h2 = "held since $hs" }
    if ($hw -cne '-') { $h2 += ": $hw" }
    $h2 += ' - release: relay-morpheus watchdog release'
  }
  & $wrap '          ' "$l2; $h2" '          '

  if ($ow.Count -eq 0) { & $add 'GREENS    none owed' } else { & $wrap 'GREENS    owed: ' ([string]::Join(' ', [string[]]$ow.ToArray())) '          ' }

  if ($tests.Count -eq 0) { & $add 'NEXT      nothing to test' }
  for ($i = 0; $i -lt $tests.Count; $i++) {
    $pre = '          '
    if ($i -eq 0) { $pre = 'NEXT      ' }
    $note = $tests[$i][1]
    if ($note -ceq '-') { $note = '(no test named)' }
    & $add (Get-Trunc "${pre}test $($tests[$i][0]): $note" 80)
  }
  $lt = 'no run working'
  if ($live.Count -gt 0) { $lt = [string]::Join('; ', [string[]]$live.ToArray()) }
  & $wrap '          agents: ' $lt '                  '
  return @($o)
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
  # F69: every report line fits 80 columns and is plain printable ASCII.
  function Fits([string]$name, $got) {
    $bad = @(@($got) | Where-Object { $_.Length -gt 80 -or $_ -cmatch '[^\x20-\x7E]' })
    if ($bad.Count -gt 0) { Write-Output "FAIL: ${name}: lines over 80 columns or not ASCII:`n$([string]::Join("`n", $bad))"; $script:fail = 1 }
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
  function G { & git -c user.name=t -c user.email=t@example.invalid -c core.autocrlf=false @args 2>$null | Out-Null }
  function Range($lines, [string]$from, [string]$to) {
    $on = $false
    foreach ($x in @($lines)) {
      if (-not $on -and $x -cmatch $from) { $on = $true }
      if ($on) { $x; if ($x -cmatch $to -and -not ($x -cmatch $from)) { $on = $false } }
    }
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
    G init -q .
    & git config core.autocrlf false
    # main is 2 commits ahead of its upstream (a local branch: no remote, no fetch).
    G symbolic-ref HEAD refs/heads/main
    G commit -q --allow-empty -m one
    G branch base
    G commit -q --allow-empty -m two
    G commit -q --allow-empty -m three
    G branch -q --set-upstream-to=base main
    $M = [string](@(Git-Out rev-parse --show-toplevel)[0])
    $boardLines = @('# Tickets', '', '## Bugs',
      "- [~] B1 $dash cart drawer keeps items (@cc-aaaaaa)",
      "- [!] B2 $dash orders 500 past page 3 [owner: @vidul]. The GREEN is owed",
      "- [?] F1 $dash pick the chart library [decide: @asha]",
      "- [>] F2 $dash later thing",
      "- [%] F4 $dash built, under test (testing: live check)",
      "- [ ] F3 $dash pending one",
      "  - [ ] F3a $dash a towed car, slowed down",
      "- [x] A1 $dash fixed, the GREEN re-run is OWED",
      '- [ ] no id on this line',
      'not a ticket, owed',
      "- [~] F5 $dash a very long title that goes on and on well past the eighty column limit of any terminal (@cc-bbbbbb)",
      "- [>] F6 $dash deferred too",
      ("- [%] F7 " + [char]0x2013 + " en dash title " + [char]0x201C + "quoted" + [char]0x201D + " " + [char]0x2192 + " arrow (testing: owner looks at it)"))
    W "$R/TICKETS.md" ([string]::Join("`n", $boardLines) + "`n")
    W "$R/.skillator/run-12-demo-run.md" ([string]::Join("`n", @(
      '# RUN-12 - demo run', 'plan: none', 'started: 2026-01-01T11:00Z   updated: 2026-01-01T12:00Z', 'owner: @vidul', '', '## Stages',
      '| # | stage | state | owner | heartbeat | landed |',
      '|---|-------|-------|-------|-----------|--------|',
      '| 1 | stage one | x | a | 2026-01-01T11:30Z | abc |',
      '| 2 | stage two | > | a | 2026-01-01T12:20Z | stage 3 |',
      '| 3 | stage three title | ~ | - | - | - |',
      '| 4 | stage four | ~ | - | - | - |')) + "`n")
    W "$R/.skillator/run-13-all-landed.md" ([string]::Join("`n", @(
      '# RUN-13 - all landed', 'plan: none', 'started: 2026-01-01T09:00Z   updated: 2026-01-01T09:30Z', '', '## Stages',
      '| # | stage | state | owner | heartbeat | landed |', '|---|-------|-------|-------|-----------|--------|',
      '| 1 | one | x | a | - | abc |', '| 2 | two | x | a | - | def |', '| 3 | three | > | a | - | stage 2 |')) + "`n")
    # A run quiet for a month: open, but stale (no stamp in the last 24 h). CRLF.
    W "$R/.skillator/run-14-old-run.md" ([string]::Join("`r`n", @(
      '# RUN-14 - old run', 'plan: none', 'started: 2025-12-01T10:00Z   updated: 2025-12-01T10:00Z', '', '## Stages',
      '| # | stage | state | owner | heartbeat | landed |', '|---|-------|-------|-------|-----------|--------|',
      '| 1 | first | x | a | 2025-12-01T10:00Z | abc |', '| 2 | later stage | ~ | a | 2025-11-30T10:00Z | - |')) + "`r`n")
    W "$R/.skillator/run.md.lock" "1234 sh MINGW`n"
    W "$R/.skillator/x.lock" "99 sh MINGW`n"
    W "$R/.skillator/sub/fresh.lock" "7 sh MINGW`n"
    $MJ = $M.Replace('\', '\\')
    W "$T/sessions/a.json" ('{"pid":1,"sessionId":"s1","cwd":"' + $MJ + '","name":"repo-c0","status":"busy","updatedAt":1}' + "`n")
    W "$T/sessions/b.json" ('{"pid":2,"sessionId":"s2","cwd":"/old","name":"old-one","status":"idle","updatedAt":1}' + "`n")
    W "$T/sessions/c.json" ('{"pid":3,"sessionId":"s3","cwd":"C:\\elsewhere","name":"other-1","status":"busy","updatedAt":1}' + "`n")
    W "$T/sessions/d.json" ('{"pid":4,"sessionId":"s4","cwd":"/gone","name":"dead-busy","status":"busy","updatedAt":1}' + "`n")
    $base = [long]1767268800
    Age "$R/.skillator/run.md.lock" $base
    Age "$R/.skillator/x.lock" ($base + 1920)
    Age "$R/.skillator/sub/fresh.lock" ($base + 1920)
    Age "$T/sessions/a.json" ($base + 1800)
    Age "$T/sessions/b.json" ($base - 7200)
    Age "$T/sessions/c.json" ($base - 3600)
    Age "$T/sessions/d.json" ($base - 46800)
    # A fake relay-morpheus.ps1: canned queue-run list. F69: runs come from the
    # run files, never from relay list; R2: the hold from its file, never from
    # relay watchdog - either call leaves a mark.
    W "$T/relay.ps1" ([string]::Join("`n", @(
      'param([string]$Mode, [string]$Action, [string]$Sub)',
      'if ($Mode -ceq ''list'') { [IO.File]::WriteAllText((Join-Path $env:PENDING_T ''relay-list-called''), ''''); exit 1 }',
      'if ($Mode -ceq ''queue-run'' -and $Sub -ceq ''list'') {',
      '  Add-Content -LiteralPath ''.skillator/queue.md'' -Value ''# Run queue''',
      '  ''# Run queue''; ''away: -''; ''landing: -''; ''''; ''| # | run | state | since | owner |''',
      '  ''|---|-----|-------|-------|-------|''; ''| 1 | RUN-0012 | running | 2026-01-01T10:00Z | @vidul |''',
      '  ''| 2 | RUN-0013 | queued | 2026-01-01T10:00Z | - |''; ''| 3 | RUN-0014 | landed | 2026-01-01T10:00Z | - |''; exit 0 }',
      'if ($Mode -ceq ''watchdog'') { [IO.File]::WriteAllText((Join-Path $env:PENDING_T ''relay-watchdog-called''), ''''); ''HELD 2026-01-01T09:00Z from relay''; exit 0 }',
      '[Console]::Error.WriteLine(''FAIL: unknown mode''); exit 1')) + "`n")
    $env:PENDING_RELAY = "$T/relay.ps1"
    $env:PENDING_DF_CMD = "echo '858993459 1000000000000 X:'"
    $env:PENDING_MEM_CMD = 'echo 3435973836'
    $env:PENDING_SESSIONS_DIR = "$T/sessions"
    $env:PENDING_NOW = [string]($base + 2040)
    $env:PENDING_T = $T
    $env:RELAY_DIR = $null

    Eq 'kv' (Run --kv) ([string]::Join("`n", @('REPO=repo', 'BRANCH=main|base|2|0', 'UNPUSHED=2',
      'OPEN=8', 'PENDING=2', 'PROGRESS=2', 'BLOCKED=1', 'DECISION=1', 'TESTING=2', 'DEFERRED=2',
      'TICKET=~|B1|@cc-aaaaaa|cart drawer keeps items', 'TICKET=!|B2|@vidul|orders 500 past page 3',
      'TICKET=?|F1|decide @asha|pick the chart library', 'TICKET=>|F2||later thing', 'TICKET=%|F4||built, under test',
      'TICKET= |F3||pending one', 'TICKET= |F3a||a towed car, slowed down',
      'TICKET=~|F5|@cc-bbbbbb|a very long title that goes on and on well past the eighty column limit of any terminal',
      'TICKET=>|F6||deferred too', 'TICKET=%|F7||en dash title "quoted" -> arrow',
      'TEST=F4|live check', 'TEST=F7|owner looks at it', 'OWED=B2',
      'RUN=RUN-0012|2/4|@vidul|stage three title|14', 'ACTIVE=RUN-0012|stage three title', 'ACTIVE=RUN-0012|stage four',
      'RUN=RUN-0014|1/2|-|later stage|44794', 'ACTIVE=RUN-0014|later stage',
      "SESSION=repo-c0|busy|$M|4", 'SESSION=other-1|busy|C:\elsewhere|94',
      'DRIVE=X:', 'DISK_FREE=858993459', 'DISK_TOTAL=1000000000000', 'MEM_FREE=3435973836',
      'LOCK=.skillator/run.md.lock|34|1234 sh MINGW', 'HOLD=-', 'WATCHDOG=red')))
    # No queue.md: queue-run list is never called (it would create the file).
    if (Test-Path -LiteralPath "$R/.skillator/queue.md") { Write-Output 'FAIL: pending created .skillator/queue.md'; $script:fail = 1 }
    W "$R/.skillator/queue.md" "# Run queue`n"
    $human = [string]::Join("`n", @(
      'REPO      repo  main: 2 ahead of base  2026-01-01 12:34Z',
      'TICKETS   8 open, 2 deferred',
      '  in progress (2)',
      '    B1    cart drawer keeps items                                     @cc-aaaaaa',
      '    F5    a very long title that goes on and on well past the...      @cc-bbbbbb',
      '  testing (2)',
      '    F4    built, under test',
      '    F7    en dash title "quoted" -> arrow',
      '  blocked (1)',
      '    B2    orders 500 past page 3                                          @vidul',
      '  decision (1)',
      '    F1    pick the chart library                                    decide @asha',
      '  pending (2)',
      '    F3    pending one',
      '    F3a   a towed car, slowed down',
      '  deferred (2): F2 F6',
      'RUNS      RUN-0012  live 14m   2/4    stage three title                   @vidul',
      '          RUN-0014  stale 31d  1/2    later stage',
      '          queued: RUN-0013',
      'AGENTS    repo-c0 working 4m',
      '          +1 in other repos',
      'MACHINE   RED  disk X: 0.8 GB free of 931 GB (below 1 GB), memory 3.2 GB free',
      '          1 stale lock: .skillator/run.md.lock 34m (1234 sh MINGW); no hold',
      'GREENS    owed: B2',
      'NEXT      test F4: live check',
      '          test F7: owner looks at it',
      '          agents: RUN-0012 at stage three title, stage four'))
    $H = Run
    Eq 'human' $H $human
    Fits 'human' $H
    if (Test-Path -LiteralPath "$T/relay-list-called") { Write-Output 'FAIL: pending spawned relay list for the runs'; $script:fail = 1 }
    W "$R/TICKETS.md" ([string]::Join("`r`n", $boardLines) + "`r`n")
    Eq 'human, CRLF board' (Run) $human
    W "$R/TICKETS.md" ([string]::Join("`n", $boardLines) + "`n")
    # R2: HOLD= comes from <main>/.skillator/watchdog.hold itself, the words
    # relay-morpheus -Mode watchdog -Action status gives (CRLF tolerated, first line only).
    W "$R/.skillator/watchdog.hold" "2026-01-01T11:00Z disk low`r`nsecond line`n"
    Eq 'machine, held' (Run --machine) ([string]::Join("`n", @('DRIVE=X:', 'DISK_FREE=858993459', 'DISK_TOTAL=1000000000000',
      'MEM_FREE=3435973836', 'LOCK=.skillator/run.md.lock|34|1234 sh MINGW', 'HOLD=2026-01-01T11:00Z disk low')))
    # F69: the hold is said once, on the MACHINE lines, with how to release it.
    $H = Run
    Eq 'held, human' (@(Range $H '^MACHINE ' '^GREENS ') | Where-Object { $_ -cnotmatch '^GREENS ' }) ([string]::Join("`n", @(
      'MACHINE   RED  disk X: 0.8 GB free of 931 GB (below 1 GB), memory 3.2 GB free',
      '          1 stale lock: .skillator/run.md.lock 34m (1234 sh MINGW); held since',
      '          2026-01-01T11:00Z: disk low - release: relay-morpheus watchdog release')))
    Fits 'held, human' $H
    Eq 'hold said once' ([string]@($H | Where-Object { $_ -clike '*disk low*' }).Count) '1'
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
    Eq 'held, blank file, human' (@(Run) | Where-Object { $_ -cmatch '^          1 stale lock' }) '          1 stale lock: .skillator/run.md.lock 34m (1234 sh MINGW); held (no'
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
    # No relay at all: no queued line; amber on memory + the lock.
    $env:PENDING_RELAY = "$T/none.ps1"
    $env:PENDING_DF_CMD = "echo '10737418240 1000000000000 X:'"
    $env:PENDING_MEM_CMD = 'echo 1610612736'
    Eq 'amber' (@(Run) | Where-Object { $_ -cmatch '^(RUNS|MACHINE) |^          (RUN-|1 stale)' }) ([string]::Join("`n", @(
      'RUNS      RUN-0012  live 14m   2/4    stage three title                   @vidul',
      '          RUN-0014  stale 31d  1/2    later stage',
      'MACHINE   AMBER  disk X: 10 GB free of 931 GB, memory 1.5 GB free (below 2 GB)',
      '          1 stale lock: .skillator/run.md.lock 34m (1234 sh MINGW); no hold')))
    # A figure below its threshold never reads as the threshold: 0.97 GB is "0.9", not "1.0".
    $env:PENDING_DF_CMD = "echo '1041529569 1000000000000 X:'"
    $env:PENDING_MEM_CMD = 'echo 2115271393'
    Eq 'below threshold floors' (@(Run) | Where-Object { $_ -cmatch '^MACHINE |^          \(below' }) ([string]::Join("`n", @(
      'MACHINE   RED  disk X: 0.9 GB free of 931 GB (below 1 GB), memory 1.9 GB free', '          (below 2 GB)')))
    $env:PENDING_DF_CMD = "echo '3500398346 1000000000000 X:'"
    $env:PENDING_MEM_CMD = 'echo 3435973836'
    Eq 'normal rounding stays' (@(Run) | Where-Object { $_ -cmatch '^MACHINE ' }) 'MACHINE   AMBER  disk X: 3.3 GB free of 931 GB (below 5 GB), memory 3.2 GB free'
    $env:PENDING_DF_CMD = "echo '10737418240 1000000000000 X:'"
    Remove-Item -LiteralPath "$R/.skillator/run.md.lock", "$R/.skillator/run-12-demo-run.md", "$R/.skillator/run-14-old-run.md" -Force
    $env:PENDING_MEM_CMD = 'echo 3435973836'
    Eq 'green' (@(Run --kv) | Where-Object { $_ -cmatch '^(RUN|QUEUED|LOCK|HOLD|WATCHDOG)=' }) "HOLD=-`nWATCHDOG=green"
    Eq 'green, human' (@(Run) | Where-Object { $_ -cmatch '^(RUNS|MACHINE) |^          no stale' }) ([string]::Join("`n", @(
      'RUNS      none open', 'MACHINE   ok  disk X: 10 GB free of 931 GB, memory 3.2 GB free', '          no stale locks; no hold')))
    Eq 'no run working' (@(Run) | Where-Object { $_ -cmatch '^          agents: ' }) '          agents: no run working'
    # Pending past 10 rows: the rest is a count, not a screenful.
    $more = @($boardLines) + @(10..22 | ForEach-Object { "- [ ] F$_ $dash row $_" })
    W "$R/TICKETS.md" ([string]::Join("`n", $more) + "`n")
    $P = @(Range (Run) '^  pending ' '^  deferred ')
    Eq 'pending capped' @($P[0], $P[10], $P[11]) ([string]::Join("`n", @('  pending (15)', '    F17   row 17', '    ... 5 more pending: list tickets')))
    # A152: a title is cut at a word boundary (F5 above); one word longer than
    # the room is still cut, mid-word.
    W "$R/TICKETS.md" ("- [ ] F9 $dash " + ('x' * 90) + "`n")
    Eq 'one long word is cut' (@(Run) | Where-Object { $_ -cmatch '^    F9 ' }) ('    F9    ' + ('x' * 67) + '...')
    # No upstream, and detached.
    G branch -q --unset-upstream
    Eq 'no upstream' (@(Run)[0]) 'REPO      repo  main: no upstream  2026-01-01 12:34Z'
    Eq 'no upstream, kv' (@(Run --kv) | Where-Object { $_ -cmatch '^(BRANCH|UNPUSHED)=' }) "BRANCH=main|-|-|-`nUNPUSHED=-"
    G checkout -q --detach
    Eq 'detached' (@(Run)[0]) 'REPO      repo  detached HEAD  2026-01-01 12:34Z'
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
