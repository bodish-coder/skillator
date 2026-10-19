# ticket-meta.ps1 - apps and people on TICKETS.md lines (F43). Windows twin of
# ticket-meta.sh, which carries the full reasoning; same output, keep in step.
#
#   ticket-meta.ps1 apps | app-of <path>... | by <ID> | apps-of <ID>
#   ticket-meta.ps1 assign <ID> @handle | decide <ID> @handle | decided <ID>
#   ticket-meta.ps1 tag <ID> | selftest
#   ticket-meta.ps1 team add @handle "Name" email[,email...] | team remove @handle | team list
#
# Windows PowerShell 5.1 safe: no ?:, ??, && or ||.
$ErrorActionPreference = 'Stop'
$Utf8 = New-Object System.Text.UTF8Encoding($false)

function Fail([string]$msg) { throw "ticket-meta: $msg" }

$script:GitCalls = New-Object System.Collections.ArrayList

function Git-Out {
  # Native git, stdout lines only; $null on failure.
  # A local 'Continue': under 'Stop', PS 5.1 turns any git stderr (a repo with
  # no commits, not a repo) into a terminating error before $LASTEXITCODE is read.
  [void]$script:GitCalls.Add([string]::Join(' ', @($args)))
  $ErrorActionPreference = 'Continue'
  try { $out = & git @args 2>$null } catch { return $null }
  if ($LASTEXITCODE -ne 0) { return $null }
  return @($out)
}

# Git writes paths as UTF-8; read them as that, not the OEM code page.
try { [Console]::OutputEncoding = $Utf8 } catch { }

function Test-OneLine([string]$s) { return -not ($s.Contains("`n") -or $s.Contains("`r")) }

# The argument, letters upper-cased, sub-part letter kept; refused unless the
# WHOLE argument is one id.
function Get-NormId([string]$s) {
  if (-not (Test-OneLine $s)) { Fail 'not a ticket id (line break in it)' }
  $m = [regex]::Match($s, '^[A-Za-z]*')
  $id = $m.Value.ToUpperInvariant() + $s.Substring($m.Length)
  if ($id -cnotmatch '\A[A-Z]{1,3}[0-9]+[a-z]?\z') { Fail "not a ticket id: $s" }
  return $id
}

function Get-Top {
  $t = Git-Out rev-parse --show-toplevel
  if ($null -eq $t) { Fail 'not inside a git repo' }
  return [string](@($t)[0])
}

function Get-MainRoot {
  $d = Git-Out rev-parse --path-format=absolute --git-common-dir
  if ($null -eq $d) { Fail 'not inside a git repo' }
  $d = [string](@($d)[0])
  if ($d.EndsWith('/.git')) { return $d.Substring(0, $d.Length - 5) }
  return (Get-Top)
}

function Get-TeamFile {
  foreach ($r in @((Get-Top), (Get-MainRoot))) {
    $f = "$r/.skillator/team.md"
    if (Test-Path -LiteralPath $f -PathType Leaf) { return $f }
  }
  return $null
}

# Ordered list of @{ h = '@handle'; e = 'email' or '' }.
function Get-TeamRows {
  $rows = New-Object System.Collections.ArrayList
  $f = Get-TeamFile
  if ($null -eq $f) { return ,$rows }
  $text = [System.IO.File]::ReadAllText($f, $Utf8)
  foreach ($line in ($text -split "`r?`n")) {
    $m = [regex]::Match($line, '^[ \t]*[-*][ \t]*(@[A-Za-z0-9_.-]+)[ \t]*:(.*)$')
    if (-not $m.Success) { continue }
    $k = 0
    foreach ($e in ($m.Groups[2].Value -split ',')) {
      $x = $e.Trim()
      if ($x -ne '') { [void]$rows.Add(@{ h = $m.Groups[1].Value; e = $x.ToLowerInvariant() }); $k++ }
    }
    if ($k -eq 0) { [void]$rows.Add(@{ h = $m.Groups[1].Value; e = '' }) }
  }
  return ,$rows
}

function Get-Patterns([string]$r) {
  $p = New-Object System.Collections.ArrayList
  [void]$p.AddRange(@('apps/*', 'packages/*', 'services/*'))
  $pj = "$r/package.json"
  if (Test-Path -LiteralPath $pj -PathType Leaf) {
    $t = ([System.IO.File]::ReadAllText($pj, $Utf8) -replace "`r", '') -replace "[`n`t]", ' '
    # "workspaces": [..] is the list; "workspaces": {"packages": [..], "nohoist":
    # [..]} - only its "packages" list.
    $m = [regex]::Match($t, '.*"workspaces"\s*:\s*(.*)$')
    if ($m.Success) {
      $rest = [regex]::Replace($m.Groups[1].Value, '^\{[^}]*"packages"\s*:\s*\[', '[')
      $m2 = [regex]::Match($rest, '^\[([^\]]*)\]')
      if ($m2.Success) {
        foreach ($q in [regex]::Matches($m2.Groups[1].Value, '"([^"]*)"')) { [void]$p.Add($q.Groups[1].Value) }
      }
    }
  }
  $py = "$r/pnpm-workspace.yaml"
  if (Test-Path -LiteralPath $py -PathType Leaf) {
    $in = $false
    foreach ($line in ([System.IO.File]::ReadAllText($py, $Utf8) -split "`r?`n")) {
      if ($line -match '^packages:') { $in = $true; continue }
      if ($in -and $line -match '^[^ \t#-]') { $in = $false }
      if ($in -and $line -match '^[ \t]*-') {
        $x = $line -replace '^[ \t]*-[ \t]*', ''
        $x = $x -replace '[ \t]+#.*$', ''
        $x = ($x -replace "[`"']", '') -replace '[ \t]+$', ''
        [void]$p.Add($x)
      }
    }
  }
  return ,$p
}

# Sorted unique list of @{ n = name; p = relpath }.
function Get-AppRows {
  $r = Get-Top
  $seen = @{}
  $rows = New-Object System.Collections.ArrayList
  foreach ($pat in (Get-Patterns $r)) {
    if ($pat -eq '' -or $pat.StartsWith('!')) { continue }
    $pat = $pat -replace '^(\./)+', ''
    $pat = $pat.TrimEnd('/') -replace '\*\*', '*'
    $parts = $pat -split '/'
    # Expand segment by segment, like a shell glob: * never matches a dot name.
    $cands = @($r)
    foreach ($seg in $parts) {
      $next = @()
      foreach ($c in $cands) {
        if ($seg.Contains('*') -or $seg.Contains('?')) {
          if (Test-Path -LiteralPath $c -PathType Container) {
            foreach ($d in [System.IO.Directory]::GetDirectories($c)) {
              $leaf = [System.IO.Path]::GetFileName($d)
              if (-not $leaf.StartsWith('.') -and ($leaf -like $seg)) { $next += "$c/$leaf" }
            }
          }
        } else {
          $next += "$c/$seg"
        }
      }
      $cands = $next
    }
    foreach ($c in $cands) {
      if (-not (Test-Path -LiteralPath $c -PathType Container)) { continue }
      $rel = $c.Substring($r.Length + 1)
      if ($seen.ContainsKey($rel)) { continue }
      $seen[$rel] = 1
      [void]$rows.Add(@{ n = [System.IO.Path]::GetFileName($c); p = $rel })
    }
  }
  $sorted = @($rows | Sort-Object -Property @{ Expression = { $_.n + "`t" + $_.p } } -CaseSensitive)
  return ,$sorted
}

function Sort-C([string[]]$xs) {
  # Byte-order (ordinal) unique sort, like `LC_ALL=C sort -u`.
  $l = New-Object System.Collections.Generic.List[string]
  foreach ($x in $xs) { if (-not $l.Contains($x)) { $l.Add($x) } }
  $l.Sort([System.StringComparer]::Ordinal)
  return $l.ToArray()
}

function Get-Apps {
  $names = @()
  foreach ($a in (Get-AppRows)) { $names += $a.n }
  return (Sort-C $names)
}

function Map-Paths([string[]]$paths) {
  $rows = Get-AppRows
  $t = Get-Top
  $out = New-Object System.Collections.ArrayList
  foreach ($p0 in $paths) {
    $p = $p0 -replace '\\', '/'
    if ($p.StartsWith("$t/")) { $p = $p.Substring($t.Length + 1) }
    $p = $p -replace '^(\./)+', ''
    $best = ''; $bl = 0
    foreach ($a in $rows) {
      $q = $a.p
      if ($q -ne '' -and ($p -ceq $q -or $p.StartsWith("$q/", [System.StringComparison]::Ordinal)) -and $q.Length -gt $bl) {
        $best = $a.n; $bl = $q.Length
      }
    }
    if ($best -ne '' -and -not $out.Contains($best)) { [void]$out.Add($best) }
  }
  return $out.ToArray()
}

# One pass over HEAD's history: the emails and changed paths of every commit
# whose subject names the id as a word.
function Get-Info([string]$id) {
  $info = @{ e = (New-Object System.Collections.ArrayList); p = (New-Object System.Collections.ArrayList) }
  $lines = Git-Out -c core.quotepath=off -c log.showSignature=false log --reverse -F "--grep=$id" '--format=%x01%ae%x09%s' --name-only
  if ($null -eq $lines) { return $info }
  $re = '(^|[^A-Za-z0-9])' + $id + '([^A-Za-z0-9]|$)'
  $hit = $false
  foreach ($l0 in $lines) {
    $l = [string]$l0
    if ($l.StartsWith([string][char]1)) {
      $f = $l.Substring(1).Split([char]9, 2)
      $hit = ($f.Count -eq 2 -and $f[1] -cmatch $re)
      if ($hit) { [void]$info.e.Add($f[0].ToLowerInvariant()) }
      continue
    }
    if ($hit -and $l -ne '') { [void]$info.p.Add($l) }
  }
  return $info
}

function Get-ByFrom($info) {
  $team = Get-TeamRows
  if ($team.Count -eq 0) { return @() }
  $map = @{}
  foreach ($t in $team) { if ($t.e -ne '' -and -not $map.ContainsKey($t.e)) { $map[$t.e] = $t.h } }
  $out = New-Object System.Collections.ArrayList
  foreach ($x0 in $info.e) {
    $x = $x0
    if ($map.ContainsKey($x)) { $x = $map[$x] }
    if (-not $out.Contains($x)) { [void]$out.Add($x) }
  }
  return $out.ToArray()
}

function Get-AppsFrom($info) {
  if ($info.p.Count -eq 0) { return @() }
  return (Sort-C (Map-Paths ([string[]]$info.p.ToArray())))
}

function Find-Tag([string]$line, [string]$key) {
  return [regex]::Match($line, '[ \t]*\[' + $key + ':[ \t]*[^\]]*\]')
}

# A tag goes where it is, else before the next tag in app/decide/owner/by order, else
# before the trailing (..) groups and a bare "Plan: S<n>" before them
# (check-tickets must still see that pointer as bare).
function Set-Tag([string]$line, [string]$key, [string]$val) {
  $tag = " [$key" + ": $val]"
  $m = Find-Tag $line $key
  if ($m.Success) { return $line.Substring(0, $m.Index) + $tag + $line.Substring($m.Index + $m.Length) }
  $ord = @('app', 'decide', 'owner', 'by')
  $pos = -1
  for ($i = [array]::IndexOf($ord, $key) + 1; $i -lt 4; $i++) {
    $m = Find-Tag $line $ord[$i]
    if ($m.Success -and ($pos -lt 0 -or $m.Index -lt $pos)) { $pos = $m.Index }
  }
  if ($pos -lt 0) {
    $pos = $line.Length
    $m = [regex]::Match($line, '([ \t]*\([^()]*\))+[ \t]*$')
    if ($m.Success) { $pos = $m.Index }
    $m = [regex]::Match($line.Substring(0, $pos), '[ \t]*Plan: S[0-9]+\.?$')
    if ($m.Success) { $pos = $m.Index }
  }
  return $line.Substring(0, $pos) + $tag + $line.Substring($pos)
}

# The board lock relay-morpheus's `board` takes: TICKETS.md.lock, made by an
# exclusive create holding "<pid> ps1". Waited on, never broken - after
# TICKET_META_LOCK_WAIT seconds (30) it refuses; only ours is released.
$script:LockF = $null
function Lock-Board([string]$p) {
  $w = 30
  if ("$env:TICKET_META_LOCK_WAIT" -match '^[0-9]+$') { $w = [int]$env:TICKET_META_LOCK_WAIT }
  $deadline = (Get-Date).AddSeconds($w)
  $s = $null
  while ($null -eq $s) {
    try { $s = [System.IO.File]::Open($p, 'CreateNew', 'Write', 'None') } catch { $s = $null }
    if ($null -ne $s) { break }
    if ((Get-Date) -ge $deadline) {
      $h = '?'
      try { $h = ([System.IO.File]::ReadAllText($p)).Trim() } catch { }
      Fail "$p is locked by '$h' (a relay-morpheus board flip or another ticket-meta); waited ${w}s - retry, or delete it if that holder is gone"
    }
    Start-Sleep -Milliseconds 100
  }
  try { $b = [System.Text.Encoding]::ASCII.GetBytes("$PID ps1`n"); $s.Write($b, 0, $b.Length) } finally { $s.Dispose() }
  $script:LockF = $p
}
function Unlock-Board {
  if ($script:LockF) {
    try {
      if (([System.IO.File]::ReadAllText($script:LockF)).Trim() -ceq "$PID ps1") { [System.IO.File]::Delete($script:LockF) }
    } catch { }
  }
  $script:LockF = $null
}

# Rewrite the one line of $id under the board lock. $o: app / decide / owner /
# by (an empty or missing value leaves that tag as it is), mark (sets the box),
# need (refuses a line whose box is not that), samekey + sameval (a line
# already carrying [samekey: sameval] is left exactly as it is, box included,
# and that is said). The line is `[indent]- [<mark>] <ID> <dash> ...`, loose
# spacing allowed, the dash an em dash, an en dash or a hyphen.
function Edit-Line([string]$id, [hashtable]$o) {
  $f = (Get-MainRoot) + '/TICKETS.md'
  if (-not (Test-Path -LiteralPath $f -PathType Leaf)) { Fail "no TICKETS.md at $f" }
  Lock-Board "$f.lock"
  try {
    $text = $Utf8.GetString([System.IO.File]::ReadAllBytes($f))
    $lines = $text.Split([char]10)
    $re = '^[ \t]*- \[.\][ \t]+' + $id + '[ \t]*(' + [char]0x2014 + '|' + [char]0x2013 + '|-)'
    $hits = @()
    for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i] -cmatch $re) { $hits += $i } }
    if ($hits.Count -ne 1) { Fail "${id}: $($hits.Count) matching lines in $f, need exactly 1" }
    $i = $hits[0]
    $line = $lines[$i]; $cr = ''
    if ($line.EndsWith("`r")) { $cr = "`r"; $line = $line.Substring(0, $line.Length - 1) }
    $b = $line.IndexOf('- [') + 3
    $mk = $line.Substring($b, 1)
    if ($o.need -and $mk -cne $o.need) { Fail "$id is [$mk], not [$($o.need)] - nothing to change" }
    if ($o.samekey) {
      $m = [regex]::Match($line, '\[' + $o.samekey + ':[ \t]*([^\]]*?)[ \t]*\]')
      # a no-op only when the box is already where this assignment puts it
      if ($m.Success -and $m.Groups[1].Value -ceq $o.sameval -and $mk -ceq $o.mark) {
        return @($line, "no change: $id already has [$($o.samekey): $($o.sameval)]")
      }
    }
    # Moving a line out of [~] drops the working session's trailing (@agent-id)
    # tag - only that exact shape - and names that session afterwards.
    $warn = $null
    if ($mk -ceq '~' -and $o.mark -and $o.mark -cne '~') {
      $sm = [regex]::Match($line, '[ \t]*\((@[A-Za-z]+-[A-Za-z0-9]+)\)[ \t]*$')
      if ($sm.Success) {
        $line = $line.Substring(0, $sm.Index)
        $warn = "warning: $id was in progress under $($sm.Groups[1].Value) - that session is no longer the owner; tell it"
      } else {
        $warn = "warning: $id was in progress - whoever was working it is no longer the owner; tell them"
      }
    }
    if ($o.mark) { $line = $line.Substring(0, $b) + $o.mark + $line.Substring($b + 1) }
    foreach ($k in @('app', 'decide', 'owner', 'by')) {
      if ($o[$k]) { $line = Set-Tag $line $k $o[$k] }
    }
    $lines[$i] = $line + $cr
    $tmp = "$f.ticket-meta.$PID"
    [System.IO.File]::WriteAllBytes($tmp, $Utf8.GetBytes([string]::Join([string][char]10, $lines)))
    try {
      [System.IO.File]::Replace($tmp, $f, [NullString]::Value)
    } catch {
      Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
      Fail "cannot replace $f ($($_.Exception.Message))"
    }
  } finally {
    Unlock-Board
  }
  if ($warn) { return @($line, $warn) }
  return $line
}

# <ID> @handle -> @(id, handle); the handle must be in the team file.
function Get-IdAndHandle([string]$cmd, [string[]]$a) {
  if ($a.Count -ne 2) { Fail "usage: $cmd <ID> @handle" }
  $id = Get-NormId $a[0]
  $h = $a[1]
  if (-not $h.StartsWith('@')) { $h = '@' + $h }
  if (-not (Test-OneLine $h) -or $h -cnotmatch '\A@[A-Za-z0-9_.-]+\z') { Fail "not a handle (@name): $($a[1])" }
  if ($null -eq (Get-TeamFile)) { Fail 'no .skillator/team.md - this repo has no people; add one to assign' }
  $known = $false
  foreach ($t in (Get-TeamRows)) { if ($t.h -ceq $h) { $known = $true } }
  if (-not $known) { Fail "$h is not in .skillator/team.md" }
  return @($id, $h)
}

# F45: an assignment reopens. Implementation -> [owner:] and the box [ ];
# decision -> [decide:] and the box [?]; the same handle again changes nothing.
function Do-Assign([string[]]$a) {
  $x = Get-IdAndHandle 'assign' $a
  return (Edit-Line $x[0] @{ mark = ' '; owner = $x[1]; samekey = 'owner'; sameval = $x[1] })
}

function Do-Decide([string[]]$a) {
  $x = Get-IdAndHandle 'decide' $a
  return (Edit-Line $x[0] @{ mark = '?'; decide = $x[1]; samekey = 'decide'; sameval = $x[1] })
}

# The decision is made: [?] -> [ ]; the [decide:] tag stays as the record.
function Do-Decided([string[]]$a) {
  if ($a.Count -ne 1) { Fail 'usage: decided <ID>' }
  $id = Get-NormId $a[0]
  return (Edit-Line $id @{ mark = ' '; need = '?' })
}

function Do-Tag([string[]]$a) {
  if ($a.Count -ne 1) { Fail 'usage: tag <ID>' }
  $id = Get-NormId $a[0]
  $info = Get-Info $id
  $apps = [string]::Join(', ', @(Get-AppsFrom $info))
  $by = [string]::Join(', ', @(Get-ByFrom $info))
  return (Edit-Line $id @{ app = $apps; by = $by })
}

# Members of team file $f, file order: @{ h = '@handle'; e = emails as written,
# trimmed, ', '-joined; n = name from an indented `name: ..` line straight under
# the member line (Get-TeamRows never sees that line).
function Get-TeamMembers([string]$f) {
  $rows = New-Object System.Collections.ArrayList
  $cur = $null
  $text = [System.IO.File]::ReadAllText($f, $Utf8).Replace("`r", '')
  foreach ($line in $text.Split([char]10)) {
    $m = [regex]::Match($line, '^[ \t]*[-*][ \t]*(@[A-Za-z0-9_.-]+)[ \t]*:(.*)$')
    if ($m.Success) {
      $em = New-Object System.Collections.ArrayList
      foreach ($e in ($m.Groups[2].Value -split ',')) {
        $x = $e.Trim(" `t")
        if ($x -ne '') { [void]$em.Add($x) }
      }
      $cur = @{ h = $m.Groups[1].Value; e = [string]::Join(', ', $em.ToArray()); n = '' }
      [void]$rows.Add($cur)
      continue
    }
    if ($null -ne $cur) {
      $nm = [regex]::Match($line, '^[ \t]+name:[ \t]*(.*?)[ \t]*$')
      if ($nm.Success) { $cur.n = $nm.Groups[1].Value; continue }
    }
    $cur = $null
  }
  return ,$rows
}

# The argument as an @handle (the @ may be left off), refused unless the whole
# argument is one handle matching $re.
function Get-TeamHandle([string]$s, [string]$re, [string]$what) {
  $h = $s
  if (-not $h.StartsWith('@')) { $h = '@' + $h }
  if (-not (Test-OneLine $h) -or $h -cnotmatch $re) { Fail "not a handle (@name, $what): $s" }
  return $h
}

$script:TeamUsage = 'usage: team add @handle "Name" email[,email...] | team remove @handle | team list'

function Write-TeamFile([string]$f, [byte[]]$bytes) {
  $tmp = "$f.ticket-meta.$PID"
  [System.IO.File]::WriteAllBytes($tmp, $bytes)
  try {
    if (Test-Path -LiteralPath $f -PathType Leaf) { [System.IO.File]::Replace($tmp, $f, [NullString]::Value) }
    else { [System.IO.File]::Move($tmp, $f) }
  } catch {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    Fail "cannot replace $f ($($_.Exception.Message))"
  }
}

# add: `- @handle: a@x, b@y` and `  name: Name` under it, appended to the team
# file (created with a `# Team` header when there is none). The new handle is
# a-z 0-9 _ -; one already there, in any case, is refused.
function Do-TeamAdd([string[]]$a) {
  if ($a.Count -lt 3) { Fail $script:TeamUsage }
  $h = Get-TeamHandle $a[0] '\A@[a-z0-9_-]+\z' 'lower-case a-z 0-9 _ -'
  if (-not (Test-OneLine $a[1]) -or $a[1] -cnotmatch '\A[ -~]+\z') { Fail "not a name (one line of printable ASCII): $($a[1])" }
  $name = $a[1].Trim(' ')
  if ($name -eq '') { Fail "not a name (empty): $($a[1])" }
  for ($i = 2; $i -lt $a.Count; $i++) { if (-not (Test-OneLine $a[$i])) { Fail 'not an email (line break in it)' } }
  $ems = New-Object System.Collections.ArrayList
  for ($i = 2; $i -lt $a.Count; $i++) {
    foreach ($e in ($a[$i] -split ',')) {
      $x = $e.Trim(' ')
      if ($x -ne '') { [void]$ems.Add($x) }
    }
  }
  if ($ems.Count -eq 0) { Fail "no email given - $($script:TeamUsage)" }
  foreach ($e in $ems) {
    if ($e -cnotmatch '\A[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+\z') { Fail "not an email: $e" }
  }
  $emsText = [string]::Join(', ', $ems.ToArray())
  $mainRoot = Get-MainRoot
  $f = Get-TeamFile
  if ($null -eq $f) { $f = "$mainRoot/.skillator/team.md" }
  Lock-Board "$mainRoot/TICKETS.md.lock"
  try {
    if (Test-Path -LiteralPath $f -PathType Leaf) {
      foreach ($r in (Get-TeamMembers $f)) { if ($r.h.ToLowerInvariant() -ceq $h) { Fail "$h is already in $f" } }
      $prev = [System.IO.File]::ReadAllBytes($f)
      if ($prev.Length -gt 0 -and $prev[$prev.Length - 1] -ne 10) { $prev = [byte[]]($prev + [byte]10) }
    } else {
      [void][System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($f))
      $prev = $Utf8.GetBytes("# Team`n`n")
    }
    $new = $Utf8.GetBytes("- ${h}: $emsText`n  name: $name`n")
    Write-TeamFile $f ([byte[]]($prev + $new))
  } finally {
    Unlock-Board
  }
  return @("- ${h}: $emsText", "  name: $name")
}

# remove: that member's line and its `name:` line go, every other byte stays.
# Open tickets (not [x], not [-]) still naming the handle in [owner:],
# [decide:] or [by:] are listed in a warning; the removal goes ahead.
function Do-TeamRemove([string[]]$a) {
  if ($a.Count -ne 1) { Fail $script:TeamUsage }
  $h = Get-TeamHandle $a[0] '\A@[A-Za-z0-9_.-]+\z' 'letters, digits, _ . -'
  $f = Get-TeamFile
  if ($null -eq $f) { Fail 'no .skillator/team.md - this repo has no people' }
  $mainRoot = Get-MainRoot
  Lock-Board "$mainRoot/TICKETS.md.lock"
  try {
    $known = $false
    foreach ($r in (Get-TeamMembers $f)) { if ($r.h -ceq $h) { $known = $true } }
    if (-not $known) { Fail "$h is not in $f" }
    $text = $Utf8.GetString([System.IO.File]::ReadAllBytes($f))
    $lines = $text.Split([char]10)
    $eol = $text.EndsWith("`n")
    $n = $lines.Count
    if ($eol) { $n-- }
    $kept = New-Object System.Collections.ArrayList
    $skip = $false
    for ($i = 0; $i -lt $n; $i++) {
      $raw = $lines[$i]
      $line = $raw
      if ($line.EndsWith("`r")) { $line = $line.Substring(0, $line.Length - 1) }
      $m = [regex]::Match($line, '^[ \t]*[-*][ \t]*(@[A-Za-z0-9_.-]+)[ \t]*:')
      if ($m.Success) {
        $skip = ($m.Groups[1].Value -ceq $h)
        if ($skip) { continue }
      } elseif ($skip -and $line -cmatch '^[ \t]+name:') {
        continue
      } else {
        $skip = $false
      }
      [void]$kept.Add($raw)
    }
    $body = [string]::Join("`n", $kept.ToArray())
    if ($eol -and $kept.Count -gt 0) { $body += "`n" }
    Write-TeamFile $f ($Utf8.GetBytes($body))
  } finally {
    Unlock-Board
  }
  $res = @("removed: $h")
  $b = "$mainRoot/TICKETS.md"
  if (-not (Test-Path -LiteralPath $b -PathType Leaf)) { return $res }
  $ids = New-Object System.Collections.ArrayList
  foreach ($bl in ([System.IO.File]::ReadAllText($b, $Utf8).Replace("`r", '').Split([char]10))) {
    $m = [regex]::Match($bl, '^[ \t]*- \[(.)\][ \t]+([A-Z]+[0-9]+[a-z]?)')
    if (-not $m.Success) { continue }
    if (@(' ', '~', '!', '?') -cnotcontains $m.Groups[1].Value) { continue }   # open: [ ] [~] [!] [?]
    $hit = $false
    foreach ($tg in [regex]::Matches($bl, '\[(owner|decide|by):([^\]]*)\]')) {
      foreach ($x in ($tg.Groups[2].Value -split ',')) { if ($x.Trim(" `t") -ceq $h) { $hit = $true } }
    }
    if ($hit) { [void]$ids.Add($m.Groups[2].Value) }
  }
  if ($ids.Count -gt 0) { $res += "warning: $h is still named on open tickets: $([string]::Join(', ', $ids.ToArray())) - reassign them" }
  return $res
}

# list: "@handle: a@x, b@y (Name)" per member, file order; no team file = nothing.
function Do-TeamList([string[]]$a) {
  if ($a.Count -ne 0) { Fail $script:TeamUsage }
  $f = Get-TeamFile
  if ($null -eq $f) { return @() }
  $acc = New-Object System.Collections.ArrayList
  foreach ($r in (Get-TeamMembers $f)) {
    $s = $r.h + ':'
    if ($r.e -ne '') { $s += ' ' + $r.e }
    if ($r.n -ne '') { $s += ' (' + $r.n + ')' }
    [void]$acc.Add($s)
  }
  return $acc.ToArray()
}

function Do-Team([string[]]$a) {
  if ($a.Count -lt 1) { Fail $script:TeamUsage }
  $sub = @()
  if ($a.Count -gt 1) { $sub = @($a[1..($a.Count - 1)]) }
  switch -CaseSensitive ($a[0]) {
    'add' { return (Do-TeamAdd $sub) }
    'remove' { return (Do-TeamRemove $sub) }
    'list' { return (Do-TeamList $sub) }
    default { Fail $script:TeamUsage }
  }
}

function Invoke-Cmd([string]$c, [string[]]$a) {
  # Resolved first: outside a repo every subcommand stops here.
  $null = Get-Top
  switch -CaseSensitive ($c) {
    'apps' { return (Get-Apps) }
    'app-of' { return (Map-Paths $a) }
    'by' { if ($a.Count -ne 1) { Fail 'usage: by <ID>' }; return (Get-ByFrom (Get-Info (Get-NormId $a[0]))) }
    'apps-of' { if ($a.Count -ne 1) { Fail 'usage: apps-of <ID>' }; return (Get-AppsFrom (Get-Info (Get-NormId $a[0]))) }
    'assign' { return (Do-Assign $a) }
    'decide' { return (Do-Decide $a) }
    'decided' { return (Do-Decided $a) }
    'tag' { return (Do-Tag $a) }
    'team' { return (Do-Team $a) }
    default { Fail "unknown subcommand: $c" }
  }
}

function Invoke-Selftest {
  # Native calls below (git, sh) write stderr on purpose; under 'Stop' PS 5.1
  # would turn that into a throw. A Fail is a throw either way.
  $ErrorActionPreference = 'Continue'
  $T = Join-Path ([System.IO.Path]::GetTempPath()) ("ticketmeta-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path "$T/hooks" | Out-Null
  $script:fail = 0
  $dash = [string][char]0x2014
  $here = Get-Location
  function Eq([string]$name, $got, [string]$want) {
    $g = [string]::Join(' ', @($got))
    if ($g -cne $want) { Write-Output "FAIL: ${name}: expected [$want] got [$g]"; $script:fail = 1 }
  }
  function Run([string]$c) {
    try { return (Invoke-Cmd $c @($args)) } catch { Write-Host "ERR ${c}: $($_.Exception.Message)"; return @() }
  }
  function ErrOf([string]$c) {
    try { Invoke-Cmd $c @($args) | Out-Null; return '' } catch { return $_.Exception.Message }
  }
  function Refused([string]$c) {
    try { Invoke-Cmd $c @($args) | Out-Null; return $false } catch { return $true }
  }
  function W([string]$path, [string]$text) {
    $dir = Split-Path -Parent $path
    if ($dir -ne '' -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    [System.IO.File]::WriteAllText($path, $text, $Utf8)
  }
  function Commit([string]$em, [string]$msg) {
    foreach ($p in $args) {
      $full = Join-Path (Get-Location).Path $p
      $old = ''
      if (Test-Path -LiteralPath $full) { $old = [System.IO.File]::ReadAllText($full, $Utf8) }
      W $full ($old + $msg + "`n")
    }
    & git add -A 2>$null | Out-Null
    & git -c user.name=t -c "user.email=$em" -c commit.gpgsign=false -c "core.hooksPath=$T/hooks" commit -q -m $msg 2>$null | Out-Null
  }
  function Init-Repo([string]$dir) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Set-Location -LiteralPath $dir
    & git init -q . 2>$null | Out-Null
    & git config core.autocrlf false
  }
  try {
    # --- monorepo fixture
    $M = "$T/mono"
    Init-Repo $M
    W "$M/package.json" "{`n  `"name`": `"mono`",`n  `"workspaces`": [`"apps/*`", `"packages/*`", `"tools/cli`"]`n}`n"
    W "$M/pnpm-workspace.yaml" "packages:`n  - 'libs/*'`n  - '!libs/skip'`n"
    W "$M/.skillator/team.md" "# Team`n`n- @vidul: vidul@ikran.in, V2@X.com`n- @asha: asha@x.com`n"
    W "$M/TICKETS.md" ("# TICKETS`n`n## Bugs`n`n- [ ] B2 $dash Button misaligned (@cc-aaaaaa)`n`n## Features`n`n" +
      "- [~] F1 $dash Dark mode (@cc-bbbbbb)`n- [ ] F12 $dash Bulk delete`n- [ ] F3 $dash Hand tagged [app: web] (@cc-cccccc)`n")
    foreach ($dd in @('apps/web', 'apps/api', 'packages/ui', 'tools/cli', 'libs/core', 'src')) { W "$M/$dd/f.txt" "x`n" }
    Commit 'vidul@ikran.in' 'init' 'README.md'
    Commit 'vidul@ikran.in' 'F1: dark mode in web' 'apps/web/index.js'
    Commit 'asha@x.com' 'F12: bulk delete in api' 'apps/api/server.js'
    Commit 'ghost@x.com' 'B2 fix button' 'packages/ui/button.js'
    Commit 'v2@x.com' 'fix F1 theme tokens' 'packages/ui/theme.js'
    Commit 'asha@x.com' 'F12a: core helper' 'libs/core/h.js'
    $before = [System.IO.File]::ReadAllBytes("$M/TICKETS.md")
    $top = Get-Top

    Eq 'apps' (Run apps) 'api cli core ui web'
    Eq 'app-of' (Run app-of 'apps/web/index.js' './packages/ui/x.js' 'README.md' "$top/libs/core/h.js" 'apps\web') 'web ui core'
    Eq 'by F1' (Run by F1) '@vidul'
    Eq 'by F12 (not F12a)' (Run by F12) '@asha'
    Eq 'by B2 unknown email' (Run by B2) 'ghost@x.com'
    Eq 'apps-of F1' (Run apps-of F1) 'ui web'
    Eq 'apps-of F12' (Run apps-of F12) 'api'
    Eq 'apps-of F3 none' (Run apps-of F3) ''

    if (-not (Refused assign F1 '@nobody')) { Write-Output 'FAIL: assign accepted an unknown handle'; $script:fail = 1 }
    $now = [System.IO.File]::ReadAllBytes("$M/TICKETS.md")
    if ([Convert]::ToBase64String($now) -ne [Convert]::ToBase64String($before)) { Write-Output 'FAIL: refused assign changed the board'; $script:fail = 1 }
    Eq 'assign F12' (Run assign F12 '@asha') "- [ ] F12 $dash Bulk delete [owner: @asha]"
    Eq 'assign F1' (Run assign F1 'asha') "- [ ] F1 $dash Dark mode [owner: @asha] warning: F1 was in progress under @cc-bbbbbb - that session is no longer the owner; tell it"
    Eq 'reassign F1' (Run assign F1 '@vidul') "- [ ] F1 $dash Dark mode [owner: @vidul]"
    Eq 'tag F1' (Run tag F1) "- [ ] F1 $dash Dark mode [app: ui, web] [owner: @vidul] [by: @vidul]"
    Eq 'tag B2' (Run tag B2) "- [ ] B2 $dash Button misaligned [app: ui] [by: ghost@x.com] (@cc-aaaaaa)"
    Eq 'tag F3 keeps hand app' (Run tag F3) "- [ ] F3 $dash Hand tagged [app: web] (@cc-cccccc)"
    if (-not (Refused tag F9)) { Write-Output 'FAIL: tag accepted a missing ticket'; $script:fail = 1 }
    $want = "# TICKETS`n`n## Bugs`n`n- [ ] B2 $dash Button misaligned [app: ui] [by: ghost@x.com] (@cc-aaaaaa)`n`n## Features`n`n" +
      "- [ ] F1 $dash Dark mode [app: ui, web] [owner: @vidul] [by: @vidul]`n- [ ] F12 $dash Bulk delete [owner: @asha]`n" +
      "- [ ] F3 $dash Hand tagged [app: web] (@cc-cccccc)`n"
    $got = [System.IO.File]::ReadAllBytes("$M/TICKETS.md")
    if ([Convert]::ToBase64String($got) -ne [Convert]::ToBase64String($Utf8.GetBytes($want))) {
      Write-Output 'FAIL: board bytes differ beyond the edited tags'; $script:fail = 1
    }

    # --- edge fixture (review of F43): object-shaped workspaces, hand-written
    # tags, loose line shapes, Plan pointers, the board lock, hostile arguments
    $E = "$T/edge"
    Init-Repo $E
    foreach ($dd in @('apps/web', 'tools/cli', 'tools/other')) { W "$E/$dd/f.txt" "x`n" }
    W "$E/package.json" "{`n  `"name`": `"edge`",`n  `"workspaces`": {`n    `"nohoist`": [`"tools/*`"],`n    `"packages`": [`"apps/*`", `"tools/cli`"]`n  }`n}`n"
    W "$E/.skillator/team.md" "- @vidul: vidul@ikran.in`n- @asha: asha@x.com`n"
    $edge0 = "# TICKETS`n`n- [ ] F4 $dash Hand owner [owner:@vidul] (@cc-111111)`n- [ ]  F7$dash Spacing`n- [ ] F8 - Hyphen`n" +
      "  - [ ] F8a $dash Sub part`n- [x] F5 $dash Shipped Plan: S3 (@cc-222222)`n- [x] F6 $dash Done right, RED/GREEN 3/3 (@cc-333333)`n"
    W "$E/TICKETS.md" $edge0
    Commit 'vidul@ikran.in' 'init' 'README.md'
    Commit 'vidul@ikran.in' 'F5: web' 'apps/web/a.js'
    Commit 'vidul@ikran.in' 'F6: web' 'apps/web/b.js'
    $board = "$E/TICKETS.md"
    $same = { param($want) [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($board)) -ceq [Convert]::ToBase64String($Utf8.GetBytes($want)) }
    # 10: an object "workspaces" takes its "packages", never "nohoist"
    Eq 'object workspaces' (Run apps) 'cli web'
    # 1: a board lock held by someone else is waited on, then refused; never broken
    W "$board.lock" "99999 sh MINGW`n"
    $env:TICKET_META_LOCK_WAIT = '1'
    $msg = ErrOf assign F4 '@vidul'
    Remove-Item Env:\TICKET_META_LOCK_WAIT
    if ($msg -notmatch 'locked') { Write-Output "FAIL: lock refusal does not say locked: [$msg]"; $script:fail = 1 }
    if (-not (& $same $edge0)) { Write-Output 'FAIL: board changed under a held lock'; $script:fail = 1 }
    Eq 'foreign lock kept' ([System.IO.File]::ReadAllText("$board.lock")) "99999 sh MINGW`n"
    Remove-Item -LiteralPath "$board.lock" -Force
    # 2: a line break in an argument is refused whole, never half-used
    if (-not (Refused assign F4 "@vidul`n@evil")) { Write-Output 'FAIL: assign took a multi-line handle'; $script:fail = 1 }
    if (-not (Refused by "F5`nzz")) { Write-Output 'FAIL: by took a multi-line id'; $script:fail = 1 }
    if (-not (Refused assign "F4`nF5" '@vidul')) { Write-Output 'FAIL: assign took a multi-line id'; $script:fail = 1 }
    if (-not (Refused by "F5`n")) { Write-Output 'FAIL: by took an id ending in a line break'; $script:fail = 1 }
    if (-not (Refused assign F4 "@vidul`n")) { Write-Output 'FAIL: assign took a handle ending in a line break'; $script:fail = 1 }
    if (-not (& $same $edge0)) { Write-Output 'FAIL: a refused argument changed the board'; $script:fail = 1 }
    # 3: a hand-written [owner:@x] is replaced, not duplicated
    Eq 'hand tag replaced' (Run assign F4 '@asha') "- [ ] F4 $dash Hand owner [owner: @asha] (@cc-111111)"
    if (Test-Path -LiteralPath "$board.lock") { Write-Output 'FAIL: our board lock was left behind'; $script:fail = 1 }
    # 9: loose spacing, a hyphen, a sub-part, a lower-case id
    Eq 'loose line' (Run assign f7 '@vidul') "- [ ]  F7$dash Spacing [owner: @vidul]"
    Eq 'hyphen line' (Run assign F8 '@vidul') '- [ ] F8 - Hyphen [owner: @vidul]'
    Eq 'sub-part line' (Run assign F8a '@vidul') "  - [ ] F8a $dash Sub part [owner: @vidul]"
    # 5: tags go before a bare Plan pointer, so check-tickets still catches it
    Eq 'tag before Plan' (Run tag F5) "- [x] F5 $dash Shipped [app: web] [by: @vidul] Plan: S3 (@cc-222222)"
    # 8: tag reads history once - one git log, no per-commit diff-tree
    $script:GitCalls.Clear()
    Eq 'tag F6' (Run tag F6) "- [x] F6 $dash Done right, RED/GREEN 3/3 [app: web] [by: @vidul] (@cc-333333)"
    Eq 'git log calls in tag' @($script:GitCalls | Where-Object { $_ -match '(^| )log( |$)' }).Count '1'
    Eq 'diff-tree calls in tag' @($script:GitCalls | Where-Object { $_ -match 'diff-tree' }).Count '0'
    $ct = Join-Path $PSScriptRoot '../../../practice/scripts/check-tickets.sh'
    $sh = Get-Command sh -ErrorAction SilentlyContinue
    if ((Test-Path -LiteralPath $ct) -and $null -ne $sh) {
      & sh $ct $board 2>$null | Out-Null
      if ($LASTEXITCODE -eq 0) { Write-Output 'FAIL: check-tickets passed a tagged bare Plan line'; $script:fail = 1 }
      $noplan = "$T/noplan.md"
      W $noplan ((([System.IO.File]::ReadAllText($board, $Utf8) -split "`n") | Where-Object { $_ -notmatch ' F5 ' }) -join "`n")
      & sh $ct $noplan 2>$null | Out-Null
      if ($LASTEXITCODE -ne 0) { Write-Output 'FAIL: check-tickets failed a tagged board'; $script:fail = 1 }
    } else {
      [Console]::Error.WriteLine('skip: check-tickets.sh or sh not available')
    }
    # 7: outside any repo every subcommand stops, it never scans /apps
    New-Item -ItemType Directory -Force -Path "$T/nogit" | Out-Null
    Set-Location -LiteralPath "$T/nogit"
    $env:GIT_CEILING_DIRECTORIES = $T
    $msg = ErrOf apps
    Remove-Item Env:\GIT_CEILING_DIRECTORIES
    if ($msg -notmatch 'not inside a git repo') { Write-Output "FAIL: no 'not inside a git repo' outside one: [$msg]"; $script:fail = 1 }
    # 4: a repo with no commits answers empty, without throwing
    Init-Repo "$T/empty"
    W "$T/empty/.skillator/team.md" "- @vidul: vidul@ikran.in`n"
    W "$T/empty/TICKETS.md" "- [ ] F1 $dash New`n"
    $msg = ErrOf by F1
    if ($msg -ne '') { Write-Output "FAIL: by threw in a repo with no commits: [$msg]"; $script:fail = 1 }
    Eq 'empty repo tag' (Run tag F1) "- [ ] F1 $dash New"

    # --- F45: assigning reopens; a decision assignment is the [?] state
    $A = "$T/f45"
    Init-Repo $A
    W "$A/.skillator/team.md" "- @vidul: vidul@ikran.in`n- @asha: asha@x.com`n"
    W "$A/TICKETS.md" ("# TICKETS`n`n- [x] F20 $dash Done thing (@cc-1)`n- [>] F21 $dash Later thing (deferred: q4) (@cc-2)`n" +
      "- [ ] F22 $dash Open thing`n- [-] F23 $dash Dropped thing`n- [?] F24 $dash Waiting [decide: @asha]`n" +
      "- [ ] F25 $dash Both [app: web] [by: @vidul]`n- [x] F26 $dash Shipped (@cc-3)`n- [x] F27 $dash Kept [owner: @asha]`n" +
      "- [ ] F28 $dash Decided before [decide: @asha]`n- [?] F29 $dash Owner waiting [owner: @vidul]`n" +
      "- [~] F31 $dash Working (@cc-bbbbbb)`n- [~] F32 $dash Busy (a note) (@cc-cccccc)`n")
    Commit 'vidul@ikran.in' 'init' 'README.md'
    $board = "$A/TICKETS.md"
    Eq 'decide from [x]' (Run decide F20 '@asha') "- [?] F20 $dash Done thing [decide: @asha] (@cc-1)"
    Eq 'decide from [>]' (Run decide F21 'asha') "- [?] F21 $dash Later thing [decide: @asha] (deferred: q4) (@cc-2)"
    Eq 'decide from [ ]' (Run decide F22 '@vidul') "- [?] F22 $dash Open thing [decide: @vidul]"
    Eq 'assign from [?]' (Run assign F20 '@vidul') "- [ ] F20 $dash Done thing [decide: @asha] [owner: @vidul] (@cc-1)"
    Eq 'assign from [-]' (Run assign F23 '@vidul') "- [ ] F23 $dash Dropped thing [owner: @vidul]"
    Eq 'assign from [x]' (Run assign F26 '@asha') "- [ ] F26 $dash Shipped [owner: @asha] (@cc-3)"
    Eq 'decided' (Run decided F24) "- [ ] F24 $dash Waiting [decide: @asha]"
    # the same handle with the box not yet the target still moves the box
    Eq 'same owner from [x]' (Run assign F27 '@asha') "- [ ] F27 $dash Kept [owner: @asha]"
    Eq 'same decider from [ ]' (Run decide F28 '@asha') "- [?] F28 $dash Decided before [decide: @asha]"
    Eq 'same owner from [?]' (Run assign F29 '@vidul') "- [ ] F29 $dash Owner waiting [owner: @vidul]"
    $f45a = $Utf8.GetString([System.IO.File]::ReadAllBytes($board))
    if (-not (Refused decided F23)) { Write-Output 'FAIL: decided flipped a ticket that is not [?]'; $script:fail = 1 }
    if (-not (Refused decided "F22`nF23")) { Write-Output 'FAIL: decided took a multi-line id'; $script:fail = 1 }
    if (-not (Refused decide F23 "@asha`n")) { Write-Output 'FAIL: decide took a handle ending in a line break'; $script:fail = 1 }
    if (-not (Refused decide F23 '@nobody')) { Write-Output 'FAIL: decide took an unknown handle'; $script:fail = 1 }
    if (-not (& $same $f45a)) { Write-Output 'FAIL: a refused decide/decided changed the board'; $script:fail = 1 }
    # same handle, same kind, box already the target: nothing changes - and it says so
    $o = [string]::Join(' ', @(Run assign F27 '@asha'))
    if ($o -notmatch 'no change') { Write-Output "FAIL: same-handle assign did not say no change: [$o]"; $script:fail = 1 }
    $o = [string]::Join(' ', @(Run decide F28 '@asha'))
    if ($o -notmatch 'no change') { Write-Output "FAIL: same-handle decide did not say no change: [$o]"; $script:fail = 1 }
    if (-not (& $same $f45a)) { Write-Output 'FAIL: a same-handle assignment changed the board'; $script:fail = 1 }
    # tag order: app, decide, owner, by
    Eq 'decide between tags' (Run decide F25 '@asha') "- [?] F25 $dash Both [app: web] [decide: @asha] [by: @vidul]"
    Eq 'owner after decide' (Run assign F25 '@vidul') "- [ ] F25 $dash Both [app: web] [decide: @asha] [owner: @vidul] [by: @vidul]"
    # leaving [~] drops that session's tag and says whose it was; other (..) stay
    $o = @(Run assign F31 '@asha')
    Eq 'assign from [~]' $o[0] "- [ ] F31 $dash Working [owner: @asha]"
    if (([string]::Join(' ', $o)) -notmatch 'F31 was in progress under @cc-bbbbbb') { Write-Output "FAIL: no warning naming the [~] session: [$o]"; $script:fail = 1 }
    $o = @(Run decide F32 '@vidul')
    Eq 'decide from [~]' $o[0] "- [?] F32 $dash Busy [decide: @vidul] (a note)"
    if (([string]::Join(' ', $o)) -notmatch 'F32 was in progress under @cc-cccccc') { Write-Output "FAIL: no warning naming the [~] session: [$o]"; $script:fail = 1 }
    $want45 = "# TICKETS`n`n- [ ] F20 $dash Done thing [decide: @asha] [owner: @vidul] (@cc-1)`n- [?] F21 $dash Later thing [decide: @asha] (deferred: q4) (@cc-2)`n" +
      "- [?] F22 $dash Open thing [decide: @vidul]`n- [ ] F23 $dash Dropped thing [owner: @vidul]`n- [ ] F24 $dash Waiting [decide: @asha]`n" +
      "- [ ] F25 $dash Both [app: web] [decide: @asha] [owner: @vidul] [by: @vidul]`n- [ ] F26 $dash Shipped [owner: @asha] (@cc-3)`n- [ ] F27 $dash Kept [owner: @asha]`n" +
      "- [?] F28 $dash Decided before [decide: @asha]`n- [ ] F29 $dash Owner waiting [owner: @vidul]`n" +
      "- [ ] F31 $dash Working [owner: @asha]`n- [?] F32 $dash Busy [decide: @vidul] (a note)`n"
    if (-not (& $same $want45)) { Write-Output 'FAIL: F45 board bytes'; $script:fail = 1 }

    # --- team add / remove / list: .skillator/team.md written under the board lock
    $G = "$T/team"
    Init-Repo $G
    W "$G/TICKETS.md" ("# TICKETS`n`n- [ ] F1 $dash One [owner: @asha]`n- [x] F2 $dash Two [owner: @asha]`n" +
      "- [?] F3 $dash Three [decide: @asha]`n- [-] F4 $dash Four [by: @asha]`n- [>] F5 $dash Five [by: @vidul, @asha]`n" +
      "- [ ] F6 $dash Six`n- [ ] F7 $dash Seven [owner: @ashab]`n- [~] F8 $dash Eight [owner: @asha]`n- [!] F9 $dash Nine [by: @asha]`n")
    $tf = "$G/.skillator/team.md"
    $teamIs = { param($want) (Test-Path -LiteralPath $tf) -and ([Convert]::ToBase64String([System.IO.File]::ReadAllBytes($tf)) -ceq [Convert]::ToBase64String($Utf8.GetBytes($want))) }
    Eq 'team list, no file' (Run team list) ''
    Eq 'team add, no file' (Run team add '@asha' 'Asha Rao' 'asha@x.com') '- @asha: asha@x.com   name: Asha Rao'
    $team1 = "# Team`n`n- @asha: asha@x.com`n  name: Asha Rao`n"
    if (-not (& $teamIs $team1)) { Write-Output 'FAIL: team add to a missing file'; $script:fail = 1 }
    Eq 'team add second' (Run team add 'vidul' ' Vidul Ikran ' 'vidul@ikran.in, V2@X.com' 'x@y.org') '- @vidul: vidul@ikran.in, V2@X.com, x@y.org   name: Vidul Ikran'
    $team2 = $team1 + "- @vidul: vidul@ikran.in, V2@X.com, x@y.org`n  name: Vidul Ikran`n"
    if (-not (& $teamIs $team2)) { Write-Output 'FAIL: team add second'; $script:fail = 1 }
    if (Test-Path -LiteralPath "$G/TICKETS.md.lock") { Write-Output 'FAIL: team add left the board lock behind'; $script:fail = 1 }
    # the existing readers see the new member and every email, the last one included
    Eq 'assign to an added member' (Run assign F6 '@vidul') "- [ ] F6 $dash Six [owner: @vidul]"
    Commit 'X@Y.org' 'F6: six' 'six.txt'
    Eq 'by maps an added email' (Run by F6) '@vidul'
    $msg = ErrOf team add '@asha' 'Other Asha' 'o@x.com'
    if ($msg -notmatch 'already') { Write-Output "FAIL: duplicate refusal does not say already: [$msg]"; $script:fail = 1 }
    if (-not (Refused team add '@Bad.Name' 'Bad' 'b@x.com')) { Write-Output 'FAIL: team add took a bad handle'; $script:fail = 1 }
    if (-not (Refused team add "@neo`n@evil" 'Neo' 'n@x.com')) { Write-Output 'FAIL: team add took a multi-line handle'; $script:fail = 1 }
    if (-not (Refused team add '@neo' 'Neo' 'neo@x.com, not-an-email')) { Write-Output 'FAIL: team add took a bad email'; $script:fail = 1 }
    if (-not (Refused team add '@neo' 'Neo' "neo@x.com`n")) { Write-Output 'FAIL: team add took an email ending in a line break'; $script:fail = 1 }
    if (-not (Refused team add '@neo' "Ne`no" 'neo@x.com')) { Write-Output 'FAIL: team add took a multi-line name'; $script:fail = 1 }
    if (-not (Refused team add '@neo' 'Neo')) { Write-Output 'FAIL: team add took no email'; $script:fail = 1 }
    W "$G/TICKETS.md.lock" "99999 sh MINGW`n"
    $env:TICKET_META_LOCK_WAIT = '1'
    $held = Refused team add '@neo' 'Neo' 'neo@x.com'
    Remove-Item Env:\TICKET_META_LOCK_WAIT
    Remove-Item -LiteralPath "$G/TICKETS.md.lock" -Force
    if (-not $held) { Write-Output 'FAIL: team add wrote through a held board lock'; $script:fail = 1 }
    if (-not (& $teamIs $team2)) { Write-Output 'FAIL: a refused team add changed team.md'; $script:fail = 1 }
    Eq 'team list' (Run team list) '@asha: asha@x.com (Asha Rao) @vidul: vidul@ikran.in, V2@X.com, x@y.org (Vidul Ikran)'
    $msg = ErrOf team remove '@nobody'
    if ($msg -notmatch 'not in') { Write-Output "FAIL: unknown-handle refusal does not say not in: [$msg]"; $script:fail = 1 }
    if (-not (& $teamIs $team2)) { Write-Output 'FAIL: a refused team remove changed team.md'; $script:fail = 1 }
    $boardBefore = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes("$G/TICKETS.md"))
    Eq 'team remove, open tickets' (Run team remove '@asha') 'removed: @asha warning: @asha is still named on open tickets: F1, F3, F8, F9 - reassign them'
    if (-not (& $teamIs "# Team`n`n- @vidul: vidul@ikran.in, V2@X.com, x@y.org`n  name: Vidul Ikran`n")) { Write-Output 'FAIL: team remove'; $script:fail = 1 }
    if ([Convert]::ToBase64String([System.IO.File]::ReadAllBytes("$G/TICKETS.md")) -cne $boardBefore) { Write-Output 'FAIL: team remove changed the board'; $script:fail = 1 }
    if (Test-Path -LiteralPath "$G/TICKETS.md.lock") { Write-Output 'FAIL: team remove left the board lock behind'; $script:fail = 1 }
    Eq 'team list after remove' (Run team list) '@vidul: vidul@ikran.in, V2@X.com, x@y.org (Vidul Ikran)'

    # --- solo, non-monorepo: no workspace folders, no team.md
    $S = "$T/solo"
    Init-Repo $S
    W "$S/package.json" "{ `"name`": `"solo`" }`n"
    W "$S/TICKETS.md" "# TICKETS`n`n- [ ] F1 $dash Thing (@cc-dddddd)`n"
    Commit 'vidul@ikran.in' 'F1: thing' 'src/a.js'
    Eq 'solo apps' (Run apps) ''
    Eq 'solo apps-of' (Run apps-of F1) ''
    Eq 'solo by' (Run by F1) ''
    if (-not (Refused assign F1 '@vidul')) { Write-Output 'FAIL: assign worked with no team.md'; $script:fail = 1 }
    Eq 'solo tag' (Run tag F1) "- [ ] F1 $dash Thing (@cc-dddddd)"
  } finally {
    Set-Location -LiteralPath $here
    Remove-Item -LiteralPath $T -Recurse -Force -ErrorAction SilentlyContinue
  }
  if ($script:fail -ne 0) { exit 1 }
  Write-Output 'ok'
}

if ($args.Count -lt 1) {
  [Console]::Error.WriteLine('usage: ticket-meta.ps1 apps|app-of|by|apps-of|assign|decide|decided|tag|team|selftest')
  exit 1
}
$cmd = [string]$args[0]
$rest = @()
if ($args.Count -gt 1) { $rest = @($args[1..($args.Count - 1)] | ForEach-Object { [string]$_ }) }
if ($cmd -ceq 'selftest') { Invoke-Selftest; exit 0 }
try {
  $out = Invoke-Cmd $cmd $rest
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
# UTF-8 out so the em dash on an edited line survives the console.
$stdout = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), $Utf8)
$stdout.NewLine = "`n"
foreach ($o in @($out)) { if ($null -ne $o) { $stdout.WriteLine([string]$o) } }
$stdout.Flush()
exit 0
