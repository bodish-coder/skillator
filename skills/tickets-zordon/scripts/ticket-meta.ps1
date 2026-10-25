# ticket-meta.ps1 - apps and people on TICKETS.md lines (F43). Windows twin of
# ticket-meta.sh, which carries the full reasoning; same output, keep in step.
#
#   ticket-meta.ps1 apps | app-of <path>... | by <ID> | apps-of <ID>
#   ticket-meta.ps1 assign <ID> @handle | decide <ID> @handle | decided <ID>
#   ticket-meta.ps1 testing <ID> <what test> | tested <ID> pass|fail | verify <ID> pass|fail <evidence>
#   ticket-meta.ps1 done <ID> [evidence] | block <ID> <on what> | defer <ID> <until what>
#   ticket-meta.ps1 tag <ID> | selftest
#   ticket-meta.ps1 team add @handle "Name" email[,email...] | team remove @handle | team list
#   ticket-meta.ps1 team lead @handle|- | whoami | claim <ID>... | pick [ID...]   (F80)
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

function Set-Note([string]$line, [string]$note, [string]$pat) {
  $m = [regex]::Match($line, $pat)
  if ($m.Success) { return $line.Substring(0, $m.Index) + $note + $line.Substring($m.Index + $m.Length) }
  $sm = [regex]::Match($line, '[ \t]*\(@[A-Za-z]+-[A-Za-z0-9]+\)[ \t]*$')
  if ($sm.Success) { return $line.Substring(0, $sm.Index) + $note + $line.Substring($sm.Index) }
  return $line.TrimEnd(' ', "`t") + $note
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
    # F64: refuse lists the boxes this change may not start from.
    if ($o.refuse -and $o.refuse.Contains($mk)) { Fail "$id is [$mk] (closed) - reopen it first (assign), then $($o.cmd)" }
    # F62/F64: the same note on a line already in that box is a no-op, like a
    # same-handle assignment. notekey + noteval is ` (<key>: <val>)`.
    if ($o.noteval -and $mk -ceq $o.mark) {
      $m = [regex]::Match($line, '\(' + $o.notekey + ':([^()]*)\)')
      if ($m.Success -and $m.Groups[1].Value.Trim() -ceq $o.noteval) {
        return @($line, "no change: $id is already [$mk] ($($o.notekey): $($o.noteval))")
      }
    }
    if ($o.samekey) {
      $m = [regex]::Match($line, '\[' + $o.samekey + ':[ \t]*([^\]]*?)[ \t]*\]')
      # a no-op only when the box is already where this assignment puts it (a claim keeps the box)
      if ($m.Success -and $m.Groups[1].Value -ceq $o.sameval -and ($mk -ceq $o.mark -or -not $o.mark)) {
        return @($line, "no change: $id already has [$($o.samekey): $($o.sameval)]")
      }
    }
    # F80: a ticket owned by someone else moves only by its owner's or the lead's
    # hand ($o.me, $o.lead from the caller). A team convention, not security.
    if ($o.owncheck) {
      $om = [regex]::Match($line, '\[owner:[ \t]*([^\]]*?)[ \t]*\]')
      if ($om.Success) {
        $ow = $om.Groups[1].Value
        if ($ow -ne '' -and $ow -ine $o.owner -and -not (Test-MayTake $ow $o.me $o.lead)) {
          $who = "only $ow may reassign it (no lead set)"
          if ($o.lead) { $who = "only $ow or the lead $($o.lead) may reassign it" }
          $you = $o.me
          if (-not $you) { $you = $o.mewhy }
          Fail "$id is owned by $ow - $who (you: $you)"
        }
      }
    }
    # Moving a line out of [~] keeps the working session's trailing (@agent-id)
    # tag (A143: the session tag and [owner:] are different facts) and names
    # that session afterwards, so it can be told its ticket moved.
    $warn = $null
    # F62: [~] -> [%] is the working session's own next step, not a move away from it.
    if ($mk -ceq '~' -and $o.mark -and $o.mark -cne '~' -and $o.mark -cne '%') {
      $sm = [regex]::Match($line, '[ \t]*\((@[A-Za-z]+-[A-Za-z0-9]+)\)[ \t]*$')
      if ($sm.Success) {
        $warn = "warning: $id was in progress under $($sm.Groups[1].Value) - its box left [~], the session tag stays; tell that session"
      } else {
        $warn = "warning: $id was in progress - its box left [~]; tell whoever was working it"
      }
    }
    if ($o.mark) { $line = $line.Substring(0, $b) + $o.mark + $line.Substring($b + 1) }
    foreach ($k in @('app', 'decide', 'owner', 'by')) {
      if ($o[$k]) { $line = Set-Tag $line $k $o[$k] }
    }
    # F62/F64: a note replaces the one matching its pattern, else goes before a
    # trailing (@agent-id) session tag, else at the end of the line. (testing: ..)
    # replaces only itself; (blocked: ..) and (deferred: ..) replace either - the
    # line says only the current wait.
    if ($o.noteval) {
      $p = 'testing'
      if ($o.notekey -cne 'testing') { $p = '(blocked|deferred)' }
      $line = Set-Note $line (' (' + $o.notekey + ': ' + $o.noteval + ')') ('[ \t]*\(' + $p + ':[^()]*\)')
    }
    if ($o.done) { $line = Set-Note $line (' **Done ' + $o.done + '**') '[ \t]*\*\*Done [^*]*\*\*' }
    # F72: verify's notes - a pass's **Verified ..**, a fail's (verify failed ..); each replaces its own earlier one,
    # and a pass drops an earlier fail's note.
    if ($o.verified) { $line = ([regex]'[ \t]*\(verify failed \d{4}-\d{2}-\d{2}: [^()]*\)').Replace($line, '') }   # every dated one
    if ($o.verified) { $line = Set-Note $line (' **Verified ' + $o.verified + '**') '[ \t]*\*\*Verified [^*]*\*\*' }
    if ($o.vfail) { $line = Set-Note $line (' (verify failed ' + $o.vfail + ')') '[ \t]*\(verify failed [^()]*\)' }
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

# F80: the session's person, found, never stored: SKILLATOR_ME=@handle (on the
# team) overrides; else this repo's git user.email through the team emails.
# @{ me = '@handle' or ''; why = the reason when '' }. git's email is self-set:
# who "me" is is a team convention, not security.
function Get-Me {
  if ($null -eq (Get-TeamFile)) { return @{ me = ''; why = 'no .skillator/team.md' } }
  $rows = Get-TeamRows
  $s = "$env:SKILLATOR_ME"
  if ($s -ne '') {
    $h = $s
    if (-not $h.StartsWith('@')) { $h = '@' + $h }
    if (Test-OneLine $h) { foreach ($t in $rows) { if ($t.h -ceq $h) { return @{ me = $h; why = '' } } } }
    return @{ me = ''; why = "SKILLATOR_ME=$s is not in .skillator/team.md" }
  }
  $em = Git-Out config user.email
  $e = ''
  if ($null -ne $em) { $e = ([string](@($em)[0])).Trim().ToLowerInvariant() }
  if ($e -eq '') { return @{ me = ''; why = 'git user.email is not set - set it, or SKILLATOR_ME=@handle' } }
  foreach ($t in $rows) { if ($t.e -ceq $e) { return @{ me = $t.h; why = '' } } }
  return @{ me = ''; why = "not on the team: add $e to .skillator/team.md" }
}

# The team's one lead: the first `lead: @handle` line of the team file, or ''.
function Get-Lead {
  $f = Get-TeamFile
  if ($null -eq $f) { return '' }
  foreach ($line in ([System.IO.File]::ReadAllText($f, $Utf8).Replace("`r", '').Split([char]10))) {
    $m = [regex]::Match($line, '^lead:[ \t]*(@[A-Za-z0-9_.-]+)[ \t]*$')
    if ($m.Success) { return $m.Groups[1].Value }
  }
  return ''
}

# True when $me may move a ticket $owner owns: $me is that owner, or the lead.
function Test-MayTake([string]$owner, [string]$me, [string]$lead) {
  if (-not $me) { return $false }
  if ($owner -ieq $me) { return $true }
  return ($lead -ne '' -and $lead -ieq $me)
}

# F45: an assignment reopens. Implementation -> [owner:] and the box [ ];
# decision -> [decide:] and the box [?]; the same handle again changes nothing.
# F80: a ticket owned by someone else is reassigned only by that owner or the lead.
function Do-Assign([string[]]$a) {
  $x = Get-IdAndHandle 'assign' $a
  $me = Get-Me
  return (Edit-Line $x[0] @{ mark = ' '; owner = $x[1]; samekey = 'owner'; sameval = $x[1]; owncheck = $true; me = $me.me; mewhy = $me.why; lead = (Get-Lead) })
}

function Do-Whoami([string[]]$a) {
  if ($a.Count -ne 0) { Fail 'usage: whoami' }
  $me = Get-Me
  if (-not $me.me) { Fail $me.why }
  return $me.me
}

# F80: planning or dispatching a ticket claims it: [owner: <me>], the box kept.
# Mine already: no change. Another's: refused as a reassign is. No team file:
# nothing to claim (as before). Each id on its own; any refusal fails the call.
function Do-Claim([string[]]$a) {
  if ($a.Count -lt 1) { Fail 'usage: claim <ID>...' }
  if ($null -eq (Get-TeamFile)) { return 'no change: no .skillator/team.md - nothing to claim' }
  $me = Get-Me
  if (-not $me.me) { Fail "$($me.why) - claim refused" }
  $lead = Get-Lead
  $out = New-Object System.Collections.ArrayList
  $errs = New-Object System.Collections.ArrayList
  foreach ($ci in $a) {
    try {
      $id = Get-NormId $ci
      foreach ($l in @(Edit-Line $id @{ owner = $me.me; samekey = 'owner'; sameval = $me.me; owncheck = $true; me = $me.me; mewhy = ''; lead = $lead })) { [void]$out.Add($l) }
    } catch { [void]$errs.Add($_.Exception.Message) }
  }
  if ($errs.Count -gt 0) {
    foreach ($l in $out) { [Console]::Out.WriteLine($l) }
    Fail ([string]::Join("`n", $errs.ToArray()).Replace('ticket-meta: ', ''))
  }
  return $out.ToArray()
}

# F80: which tickets a run may take. `you: <me>` (or `you: - (<why>)`), then per
# ticket `pick <ID>` (unassigned, or mine) or `skip <ID> <owner>`. No ids: every
# open ticket on the board ([ ] [~] [!]). No team file: every ticket is picked;
# not on the team: only unassigned ones. An id not on the board is unassigned.
function Do-Pick([string[]]$a) {
  $bf = (Get-MainRoot) + '/TICKETS.md'
  $ids = @($a | ForEach-Object { Get-NormId $_ })
  $hasBoard = Test-Path -LiteralPath $bf -PathType Leaf
  if ($ids.Count -eq 0 -and -not $hasBoard) { Fail "no TICKETS.md at $bf" }
  $team = $null -ne (Get-TeamFile)
  $me = ''
  if ($team) {
    $m = Get-Me
    $me = $m.me
    $you = $me
    if (-not $me) { $you = "- ($($m.why))" }
  } else { $you = '- (no .skillator/team.md: every ticket)' }
  $mk = @{}; $ow = @{}; $ord = New-Object System.Collections.ArrayList
  if ($hasBoard) {
    foreach ($bl in ([System.IO.File]::ReadAllText($bf, $Utf8).Replace("`r", '').Split([char]10))) {
      $m = [regex]::Match($bl, '^[ \t]*- \[(.)\][ \t]+([A-Z]+[0-9]+[a-z]?)')
      if (-not $m.Success) { continue }
      $id = $m.Groups[2].Value
      if ($mk.ContainsKey($id)) { continue }
      $mk[$id] = $m.Groups[1].Value
      $om = [regex]::Match($bl, '\[owner:[ \t]*([^\]]*?)[ \t]*\]')
      $ow[$id] = ''
      if ($om.Success) { $ow[$id] = $om.Groups[1].Value }
      [void]$ord.Add($id)
    }
  }
  if ($ids.Count -eq 0) { $ids = @($ord | Where-Object { @(' ', '~', '!') -ccontains $mk[$_] }) }
  $res = New-Object System.Collections.ArrayList
  [void]$res.Add("you: $you")
  foreach ($id in $ids) {
    $o = ''
    if ($ow.ContainsKey($id)) { $o = $ow[$id] }
    if (-not $team -or $o -eq '' -or ($me -ne '' -and $o -ieq $me)) { [void]$res.Add("pick $id") } else { [void]$res.Add("skip $id $o") }
  }
  return $res.ToArray()
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

# F62: built, waiting on a test: the box [%] and ` (testing: <test>)` on the
# line. The test is one line, trimmed, not blank, no parentheses (it sits in one).
function Do-Testing([string[]]$a) {
  if ($a.Count -lt 2) { Fail 'usage: testing <ID> <what test>' }
  $id = Get-NormId $a[0]
  $t = [string]::Join(' ', @($a[1..($a.Count - 1)]))
  if (-not (Test-OneLine $t)) { Fail 'the test is one line' }
  $t = $t.Trim()
  if ($t -eq '') { Fail 'usage: testing <ID> <what test> - the test is blank' }
  if ($t.Contains('(') -or $t.Contains(')')) { Fail 'the test cannot hold ( or ) - it sits in (testing: ..)' }
  return (Edit-Line $id @{ mark = '%'; notekey = 'testing'; noteval = $t })
}

# F64: the words after the id: one line, trimmed, no parentheses (it sits on
# the line as a note); blank only when $blank.
function Get-NoteText([string]$cmd, [string]$what, [bool]$blank, [string[]]$a) {
  $t = ''
  if ($a.Count -gt 1) { $t = [string]::Join(' ', @($a[1..($a.Count - 1)])) }
  if (-not (Test-OneLine $t)) { Fail "the $what is one line" }
  $t = $t.Trim()
  if ($t -eq '' -and -not $blank) { Fail "usage: $cmd <ID> <$what> - it is blank" }
  if ($t.Contains('(') -or $t.Contains(')')) { Fail "the $what cannot hold ( or ) - it sits on the line as a note" }
  return $t
}

# F64: finished and verified: the box [x], the tag a close owes (app + by from
# the commits), and with evidence ` **Done <YYYY-MM-DD>: <evidence>**` - the
# form the board's closed lines use; it replaces an earlier Done note. Refuses
# a cancelled [-] (reopen it with assign first).
function Do-Done([string[]]$a) {
  if ($a.Count -lt 1) { Fail 'usage: done <ID> [evidence]' }
  $id = Get-NormId $a[0]
  $t = Get-NoteText 'done' 'evidence' $true $a
  if ($t.Contains('*')) { Fail 'the evidence cannot hold * - it sits in **Done ..**' }
  $dn = ''
  if ($t -ne '') { $dn = [DateTime]::UtcNow.ToString('yyyy-MM-dd') + ': ' + $t }
  $info = Get-Info $id
  $apps = [string]::Join(', ', @(Get-AppsFrom $info))
  $by = [string]::Join(', ', @(Get-ByFrom $info))
  return (Edit-Line $id @{ mark = 'x'; app = $apps; by = $by; done = $dn; refuse = '-'; cmd = 'done' })
}

# F64: can't proceed until something outside it lands: [!], ` (blocked: <on what>)`.
function Do-Block([string[]]$a) {
  if ($a.Count -lt 2) { Fail 'usage: block <ID> <on what>' }
  $id = Get-NormId $a[0]
  $t = Get-NoteText 'block' 'on what' $false $a
  return (Edit-Line $id @{ mark = '!'; notekey = 'blocked'; noteval = $t; refuse = 'x-'; cmd = 'block' })
}

# F64: postponed by choice until a condition: [>], ` (deferred: <until what>)`.
function Do-Defer([string[]]$a) {
  if ($a.Count -lt 2) { Fail 'usage: defer <ID> <until what>' }
  $id = Get-NormId $a[0]
  $t = Get-NoteText 'defer' 'until what' $false $a
  return (Edit-Line $id @{ mark = '>'; notekey = 'deferred'; noteval = $t; refuse = 'x-'; cmd = 'defer' })
}

# The test's result: [%] -> [x] on pass, [~] on fail; the (testing: ..) note stays as the record.
function Do-Tested([string[]]$a) {
  if ($a.Count -ne 2) { Fail 'usage: tested <ID> pass|fail' }
  $id = Get-NormId $a[0]
  $v = $a[1].ToLowerInvariant()
  if ($v -ceq 'pass') { $mk = 'x' } elseif ($v -ceq 'fail') { $mk = '~' } else { Fail "usage: tested <ID> pass|fail - not '$($a[1])'" }
  return (Edit-Line $id @{ mark = $mk; need = '%' })
}

# F72: /verify-subagent's verdict on a [%] ticket, with the evidence (one line,
# no parentheses, no *). pass: [x], tagged as a close is, ` **Verified <date>:
# <evidence>**`. fail: the box stays [%], ` (verify failed <date>: <what failed>)`.
function Do-Verify([string[]]$a) {
  if ($a.Count -lt 3) { Fail 'usage: verify <ID> pass|fail <evidence>' }
  $id = Get-NormId $a[0]
  $v = $a[1].ToLowerInvariant()
  if ($v -cne 'pass' -and $v -cne 'fail') { Fail "usage: verify <ID> pass|fail <evidence> - not '$($a[1])'" }
  $t = Get-NoteText 'verify' 'evidence' $false @($a[1..($a.Count - 1)])
  if ($t.Contains('*')) { Fail 'the evidence cannot hold * - it sits on the line as a note' }
  $dn = [DateTime]::UtcNow.ToString('yyyy-MM-dd') + ': ' + $t
  if ($v -ceq 'fail') { return (Edit-Line $id @{ need = '%'; vfail = $dn; cmd = 'verify' }) }
  $info = Get-Info $id
  $apps = [string]::Join(', ', @(Get-AppsFrom $info))
  $by = [string]::Join(', ', @(Get-ByFrom $info))
  return (Edit-Line $id @{ mark = 'x'; need = '%'; app = $apps; by = $by; verified = $dn; cmd = 'verify' })
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

$script:TeamUsage = 'usage: team add @handle "Name" email[,email...] | team remove @handle | team list | team lead @handle|-'

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
      # the file's own line ending (its first line's) is kept; LF or a new file stays LF (A137)
      $nl = "`n"
      $p10 = [Array]::IndexOf($prev, [byte]10)
      if ($p10 -gt 0 -and $prev[$p10 - 1] -eq 13) { $nl = "`r`n" }
      if ($prev.Length -gt 0 -and $prev[$prev.Length - 1] -ne 10) { $prev = [byte[]]($prev + $Utf8.GetBytes($nl)) }
    } else {
      [void][System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($f))
      $nl = "`n"
      $prev = $Utf8.GetBytes("# Team`n`n")
    }
    $new = $Utf8.GetBytes("- ${h}: $emsText$nl  name: $name$nl")
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
    if ($h -ceq (Get-Lead)) { Fail "$h is the lead - hand the lead over first (team lead @other), then remove" }
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
    if (@(' ', '~', '!', '?', '%') -cnotcontains $m.Groups[1].Value) { continue }   # open: [ ] [~] [!] [?] [%]
    $hit = $false
    foreach ($tg in [regex]::Matches($bl, '\[(owner|decide|by):([^\]]*)\]')) {
      foreach ($x in ($tg.Groups[2].Value -split ',')) { if ($x.Trim(" `t") -ceq $h) { $hit = $true } }
    }
    if ($hit) { [void]$ids.Add($m.Groups[2].Value) }
  }
  if ($ids.Count -gt 0) { $res += "warning: $h is still named on open tickets: $([string]::Join(', ', $ids.ToArray())) - reassign them" }
  return $res
}

# list: "@handle: a@x, b@y (Name)" per member, file order, the lead marked
# ` [lead]` and me ` (you)`; no team file = nothing.
function Do-TeamList([string[]]$a) {
  if ($a.Count -ne 0) { Fail $script:TeamUsage }
  $f = Get-TeamFile
  if ($null -eq $f) { return @() }
  $me = (Get-Me).me
  $lead = Get-Lead
  $acc = New-Object System.Collections.ArrayList
  foreach ($r in (Get-TeamMembers $f)) {
    $s = $r.h + ':'
    if ($r.e -ne '') { $s += ' ' + $r.e }
    if ($r.n -ne '') { $s += ' (' + $r.n + ')' }
    if ($r.h -ceq $lead) { $s += ' [lead]' }
    if ($r.h -ceq $me) { $s += ' (you)' }
    [void]$acc.Add($s)
  }
  return $acc.ToArray()
}

# F80: lead @handle sets the one `lead:` line under `# Team` (a member only;
# allowed when there is no lead, or me is the lead - a hand-over); lead - clears
# it (the lead only). Every other byte and the line endings stay.
function Do-TeamLead([string[]]$a) {
  if ($a.Count -ne 1) { Fail $script:TeamUsage }
  $h = '-'
  if ($a[0] -cne '-') { $h = Get-TeamHandle $a[0] '\A@[A-Za-z0-9_.-]+\z' 'letters, digits, _ . -' }
  $me = Get-Me
  $f = Get-TeamFile
  if ($null -eq $f) { Fail 'no .skillator/team.md - this repo has no people' }
  Lock-Board ((Get-MainRoot) + '/TICKETS.md.lock')
  try {
    if ($h -cne '-') {
      $known = $false
      foreach ($r in (Get-TeamMembers $f)) { if ($r.h -ceq $h) { $known = $true } }
      if (-not $known) { Fail "$h is not in $f" }
    }
    $lead = Get-Lead
    if ($lead -ne '') {
      if ($h -ceq $lead) { return "no change: $h is already the lead" }
      if (-not ($me.me -and $me.me -ieq $lead)) {
        $you = $me.me
        if (-not $you) { $you = $me.why }
        Fail "only the lead $lead may hand the lead over or clear it (you: $you)"
      }
    } elseif ($h -ceq '-') { return 'no change: no lead set' }
    $text = $Utf8.GetString([System.IO.File]::ReadAllBytes($f))
    $nl = "`n"
    $p10 = $text.IndexOf("`n")
    if ($p10 -gt 0 -and $text[$p10 - 1] -eq "`r") { $nl = "`r`n" }
    $cr = $nl.Substring(0, $nl.Length - 1)
    $lines = $text.Split([char]10)
    $eol = $text.EndsWith("`n")
    $n = $lines.Count
    if ($eol) { $n-- }
    $had = $false; $head = $false
    for ($i = 0; $i -lt $n; $i++) {
      $l = $lines[$i].TrimEnd("`r")
      if ($l -cmatch '^lead:') { $had = $true }
      if ($l -cmatch '^# Team[ \t]*$') { $head = $true }
    }
    $new = ''
    if ($h -cne '-') { $new = "lead: $h$cr" }
    if ($h -cne '-' -and -not $had -and -not $head) {
      $body = "# Team$nl${nl}lead: $h$nl$nl" + $text
    } else {
      # every lead: line goes and the first is replaced; none -> in under the # Team heading
      $kept = New-Object System.Collections.ArrayList
      $done = $false
      for ($i = 0; $i -lt $n; $i++) {
        $raw = $lines[$i]
        $l = $raw.TrimEnd("`r")
        if ($l -cmatch '^lead:') {
          if (-not $done -and $new -ne '') { [void]$kept.Add($new) }
          $done = $true
          continue
        }
        [void]$kept.Add($raw)
        if (-not $had -and -not $done -and $l -cmatch '^# Team[ \t]*$') {
          if ($new -ne '') { [void]$kept.Add($new) }
          $done = $true
        }
      }
      $body = [string]::Join("`n", $kept.ToArray())
      if ($eol -and $kept.Count -gt 0) { $body += "`n" }
    }
    Write-TeamFile $f ($Utf8.GetBytes($body))
  } finally {
    Unlock-Board
  }
  if ($h -ceq '-') { return 'lead cleared' }
  return "lead: $h"
}

function Do-Team([string[]]$a) {
  if ($a.Count -lt 1) { Fail $script:TeamUsage }
  $sub = @()
  if ($a.Count -gt 1) { $sub = @($a[1..($a.Count - 1)]) }
  switch -CaseSensitive ($a[0]) {
    'add' { return (Do-TeamAdd $sub) }
    'remove' { return (Do-TeamRemove $sub) }
    'list' { return (Do-TeamList $sub) }
    'lead' { return (Do-TeamLead $sub) }
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
    'testing' { return (Do-Testing $a) }
    'tested' { return (Do-Tested $a) }
    'verify' { return (Do-Verify $a) }
    'done' { return (Do-Done $a) }
    'block' { return (Do-Block $a) }
    'defer' { return (Do-Defer $a) }
    'tag' { return (Do-Tag $a) }
    'team' { return (Do-Team $a) }
    'whoami' { return (Do-Whoami $a) }
    'claim' { return (Do-Claim $a) }
    'pick' { return (Do-Pick $a) }
    default { Fail "unknown subcommand: $c" }
  }
}

# F66: the opt-in Teams status post (teams-uhura), after an edit that worked. On when
# TEAMS_STATUS_POSTS=on, or - that unset - "statusPosts": true in the per-user config
# (~/.skillator/teams.json, SKILLATOR_TEAMS_CONFIG overrides). Off by default. A post
# that fails is one line on stderr; the edit stands and the exit stays 0. Same as
# ticket-meta.sh teams_post.
function Invoke-TeamsPost([string]$c, [string[]]$a) {
  try {
    $on = $env:TEAMS_STATUS_POSTS
    if ([string]::IsNullOrEmpty($on)) {
      $cfg = $env:SKILLATOR_TEAMS_CONFIG
      if ([string]::IsNullOrEmpty($cfg)) { $cfg = Join-Path $HOME '.skillator/teams.json' }
      if (-not (Test-Path -LiteralPath $cfg -PathType Leaf)) { return }
      if ([System.IO.File]::ReadAllText($cfg) -notmatch '"statusPosts"\s*:\s*true') { return }
    } elseif ($on -cne 'on') { return }
    $js = Join-Path $PSScriptRoot '../../teams-uhura/scripts/team.mjs'
    if (-not (Test-Path -LiteralPath $js -PathType Leaf)) { return }
    # A151: the first node on PATH outside the repo - a '.' entry, or one inside the repo
    # (a node_modules/.bin), could start a node the repo supplies.
    $top = [System.IO.Path]::GetFullPath((Get-Top)).TrimEnd('\') + '\'
    $node = Get-Command node -CommandType Application -All -ErrorAction SilentlyContinue | ForEach-Object { $_.Source } |
      Where-Object { [System.IO.Path]::IsPathRooted($_) -and -not ([System.IO.Path]::GetFullPath($_).StartsWith($top, [StringComparison]::OrdinalIgnoreCase)) } |
      Select-Object -First 1
    if (-not $node) { return }
    $prev = $env:TEAMS_STATUS_POSTS
    $env:TEAMS_STATUS_POSTS = 'on'
    $ErrorActionPreference = 'Continue'
    $e = & $node $js post-status $c @a 2>&1 | Where-Object { $_ -is [System.Management.Automation.ErrorRecord] } | ForEach-Object { [string]$_ }
    $code = $LASTEXITCODE
    $env:TEAMS_STATUS_POSTS = $prev
    if ($code -ne 0) {
      $why = (($e -join ' ') -replace '[\r\n]+', ' ') -replace '^team: ', ''
      [Console]::Error.WriteLine("ticket-meta: teams status post failed (the edit stands): $why")
    }
  } catch {
    [Console]::Error.WriteLine("ticket-meta: teams status post failed (the edit stands): $($_.Exception.Message)")
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
  # F80: who "me" is comes from git's user.email - never this machine's global one
  $savedMe = @($env:GIT_CONFIG_GLOBAL, $env:SKILLATOR_ME)
  [System.IO.File]::WriteAllText("$T/gitconfig", '')
  $env:GIT_CONFIG_GLOBAL = "$T/gitconfig"
  Remove-Item Env:\SKILLATOR_ME -ErrorAction SilentlyContinue
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
    Eq 'assign F1' (Run assign F1 'asha') "- [ ] F1 $dash Dark mode [owner: @asha] (@cc-bbbbbb) warning: F1 was in progress under @cc-bbbbbb - its box left [~], the session tag stays; tell that session"
    & git config user.email asha@x.com   # F80: only the owner (or the lead) reassigns
    Eq 'reassign F1' (Run assign F1 '@vidul') "- [ ] F1 $dash Dark mode [owner: @vidul] (@cc-bbbbbb)"
    Eq 'tag F1' (Run tag F1) "- [ ] F1 $dash Dark mode [app: ui, web] [owner: @vidul] [by: @vidul] (@cc-bbbbbb)"
    Eq 'tag B2' (Run tag B2) "- [ ] B2 $dash Button misaligned [app: ui] [by: ghost@x.com] (@cc-aaaaaa)"
    Eq 'tag F3 keeps hand app' (Run tag F3) "- [ ] F3 $dash Hand tagged [app: web] (@cc-cccccc)"
    if (-not (Refused tag F9)) { Write-Output 'FAIL: tag accepted a missing ticket'; $script:fail = 1 }
    $want = "# TICKETS`n`n## Bugs`n`n- [ ] B2 $dash Button misaligned [app: ui] [by: ghost@x.com] (@cc-aaaaaa)`n`n## Features`n`n" +
      "- [ ] F1 $dash Dark mode [app: ui, web] [owner: @vidul] [by: @vidul] (@cc-bbbbbb)`n- [ ] F12 $dash Bulk delete [owner: @asha]`n" +
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
    # 3: a hand-written [owner:@x] is replaced, not duplicated (by its owner, F80)
    & git config user.email vidul@ikran.in
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
    Eq 'assign from [~]' $o[0] "- [ ] F31 $dash Working [owner: @asha] (@cc-bbbbbb)"
    if (([string]::Join(' ', $o)) -notmatch 'F31 was in progress under @cc-bbbbbb') { Write-Output "FAIL: no warning naming the [~] session: [$o]"; $script:fail = 1 }
    $o = @(Run decide F32 '@vidul')
    Eq 'decide from [~]' $o[0] "- [?] F32 $dash Busy [decide: @vidul] (a note) (@cc-cccccc)"
    if (([string]::Join(' ', $o)) -notmatch 'F32 was in progress under @cc-cccccc') { Write-Output "FAIL: no warning naming the [~] session: [$o]"; $script:fail = 1 }
    # A143: the session tag and the owner are different facts - both stay
    if (([string]::Join(' ', $o)) -match 'no longer the owner') { Write-Output "FAIL: warning still says the session lost the ticket: [$o]"; $script:fail = 1 }
    if (-not ($o[0].EndsWith('(@cc-cccccc)'))) { Write-Output "FAIL: decide dropped the [~] session tag: [$($o[0])]"; $script:fail = 1 }
    $want45 = "# TICKETS`n`n- [ ] F20 $dash Done thing [decide: @asha] [owner: @vidul] (@cc-1)`n- [?] F21 $dash Later thing [decide: @asha] (deferred: q4) (@cc-2)`n" +
      "- [?] F22 $dash Open thing [decide: @vidul]`n- [ ] F23 $dash Dropped thing [owner: @vidul]`n- [ ] F24 $dash Waiting [decide: @asha]`n" +
      "- [ ] F25 $dash Both [app: web] [decide: @asha] [owner: @vidul] [by: @vidul]`n- [ ] F26 $dash Shipped [owner: @asha] (@cc-3)`n- [ ] F27 $dash Kept [owner: @asha]`n" +
      "- [?] F28 $dash Decided before [decide: @asha]`n- [ ] F29 $dash Owner waiting [owner: @vidul]`n" +
      "- [ ] F31 $dash Working [owner: @asha] (@cc-bbbbbb)`n- [?] F32 $dash Busy [decide: @vidul] (a note) (@cc-cccccc)`n"
    if (-not (& $same $want45)) { Write-Output 'FAIL: F45 board bytes'; $script:fail = 1 }

    # --- F62: [%] testing - built, waiting on a test; pass -> [x], fail -> [~]
    $P = "$T/f62"
    Init-Repo $P
    W "$P/TICKETS.md" ("# TICKETS`n`n- [~] F40 $dash Built (@cc-dddddd)`n- [ ] F41 $dash Plain`n" +
      "- [%] F42 $dash Under test (testing: old check)`n- [%] F43 $dash Passing (testing: unit run)`n" +
      "- [%] F44 $dash Failing (testing: live check)`n- [ ] F46 $dash Not testing`n")
    Commit 'vidul@ikran.in' 'init' 'README.md'
    $board = "$P/TICKETS.md"
    $o = @(Run testing F40 owner live check in Antigravity)
    Eq 'testing from [~]' $o[0] "- [%] F40 $dash Built (testing: owner live check in Antigravity) (@cc-dddddd)"
    if (([string]::Join(' ', $o)) -match 'was in progress') { Write-Output "FAIL: testing warned like a reassignment: [$o]"; $script:fail = 1 }
    Eq 'testing from [ ]' (Run testing F41 'unit tests') "- [%] F41 $dash Plain (testing: unit tests)"
    Eq 'testing replaces the note' (Run testing F42 '  new check ') "- [%] F42 $dash Under test (testing: new check)"
    $o = [string]::Join(' ', @(Run testing F42 new check))
    if ($o -notmatch 'no change') { Write-Output "FAIL: same testing did not say no change: [$o]"; $script:fail = 1 }
    Eq 'tested pass, any case' (Run tested F43 PaSs) "- [x] F43 $dash Passing (testing: unit run)"
    Eq 'tested fail, any case' (Run tested F44 fAiL) "- [~] F44 $dash Failing (testing: live check)"
    $f62a = $Utf8.GetString([System.IO.File]::ReadAllBytes($board))
    if (-not (Refused tested F46 pass)) { Write-Output 'FAIL: tested flipped a ticket that is not [%]'; $script:fail = 1 }
    if (-not (Refused tested F42 maybe)) { Write-Output 'FAIL: tested took a verdict that is not pass/fail'; $script:fail = 1 }
    if (-not (Refused tested F42)) { Write-Output 'FAIL: tested took no verdict'; $script:fail = 1 }
    if (-not (Refused testing F46)) { Write-Output 'FAIL: testing took no test'; $script:fail = 1 }
    if (-not (Refused testing F46 '  ')) { Write-Output 'FAIL: testing took a blank test'; $script:fail = 1 }
    if (-not (Refused testing F46 'run (it)')) { Write-Output 'FAIL: testing took a test with parentheses'; $script:fail = 1 }
    if (-not (Refused testing F46 "a`nb")) { Write-Output 'FAIL: testing took a test with a line break'; $script:fail = 1 }
    if (-not (& $same $f62a)) { Write-Output 'FAIL: a refused testing/tested changed the board'; $script:fail = 1 }
    $want62 = "# TICKETS`n`n- [%] F40 $dash Built (testing: owner live check in Antigravity) (@cc-dddddd)`n- [%] F41 $dash Plain (testing: unit tests)`n" +
      "- [%] F42 $dash Under test (testing: new check)`n- [x] F43 $dash Passing (testing: unit run)`n" +
      "- [~] F44 $dash Failing (testing: live check)`n- [ ] F46 $dash Not testing`n"
    if (-not (& $same $want62)) { Write-Output 'FAIL: F62 board bytes'; $script:fail = 1 }

    # --- F64: done / block / defer - the boxes /sync-tickets used to hand-edit
    $Q = "$T/f64"
    Init-Repo $Q
    W "$Q/apps/web/f.txt" "x`n"
    W "$Q/TICKETS.md" ("# TICKETS`n`n- [~] F50 $dash Built (@cc-eeeeee)`n- [%] F51 $dash Tested (testing: unit run)`n" +
      "- [ ] F52 $dash Plain`n- [!] F53 $dash Stuck (blocked: old dep)`n- [~] F54 $dash Busy (@cc-ffffff)`n" +
      "- [?] F55 $dash Choice [decide: @asha]`n- [-] F56 $dash Dropped`n- [x] F57 $dash Shipped`n- [>] F58 $dash Later (deferred: q4)`n")
    Commit 'vidul@ikran.in' 'init' 'README.md'
    Commit 'vidul@ikran.in' 'F50: built' 'apps/web/a.js'
    $board = "$Q/TICKETS.md"
    $today = [DateTime]::UtcNow.ToString('yyyy-MM-dd')
    $o = @(Run done F50 'RED/GREEN' '3/3,' 'abc1234')
    Eq 'done from [~], tagged, evidence' $o[0] "- [x] F50 $dash Built [app: web] **Done ${today}: RED/GREEN 3/3, abc1234** (@cc-eeeeee)"
    if (([string]::Join(' ', $o)) -notmatch 'F50 was in progress under @cc-eeeeee') { Write-Output "FAIL: done from [~] did not warn: [$o]"; $script:fail = 1 }
    Eq 'done from [%], no evidence' (Run done F51) "- [x] F51 $dash Tested (testing: unit run)"
    Eq 'block from [ ]' (Run block F52 needs S3 creds from ops) "- [!] F52 $dash Plain (blocked: needs S3 creds from ops)"
    Eq 'block replaces the note' (Run block F53 '  new dep ') "- [!] F53 $dash Stuck (blocked: new dep)"
    $o = [string]::Join(' ', @(Run block F53 new dep))
    if ($o -notmatch 'no change') { Write-Output "FAIL: same block did not say no change: [$o]"; $script:fail = 1 }
    $o = @(Run defer F54 after the parser rewrite)
    Eq 'defer from [~]' $o[0] "- [>] F54 $dash Busy (deferred: after the parser rewrite) (@cc-ffffff)"
    if (([string]::Join(' ', $o)) -notmatch 'F54 was in progress under @cc-ffffff') { Write-Output "FAIL: defer from [~] did not warn: [$o]"; $script:fail = 1 }
    Eq 'defer from [?] keeps tags' (Run defer F55 q1) "- [>] F55 $dash Choice [decide: @asha] (deferred: q1)"
    $o = [string]::Join(' ', @(Run defer F58 q4))
    if ($o -notmatch 'no change') { Write-Output "FAIL: same defer did not say no change: [$o]"; $script:fail = 1 }
    Eq 'block from [>] replaces deferred' (Run block F58 the vendor fix) "- [!] F58 $dash Later (blocked: the vendor fix)"
    $f64a = $Utf8.GetString([System.IO.File]::ReadAllBytes($board))
    if (-not (Refused done F56)) { Write-Output 'FAIL: done closed a cancelled ticket'; $script:fail = 1 }
    if (-not (Refused block F57 dep)) { Write-Output 'FAIL: block took a closed [x] ticket'; $script:fail = 1 }
    if (-not (Refused defer F56 later)) { Write-Output 'FAIL: defer took a cancelled ticket'; $script:fail = 1 }
    $msg = ErrOf block F99 dep
    if ($msg -notmatch '0 matching lines') { Write-Output "FAIL: unknown-id refusal: [$msg]"; $script:fail = 1 }
    if (-not (Refused block F52)) { Write-Output 'FAIL: block took no reason'; $script:fail = 1 }
    if (-not (Refused defer F52 '  ')) { Write-Output 'FAIL: defer took a blank condition'; $script:fail = 1 }
    if (-not (Refused block F52 'a (b)')) { Write-Output 'FAIL: block took parentheses'; $script:fail = 1 }
    if (-not (Refused defer F52 "a`nb")) { Write-Output 'FAIL: defer took a line break'; $script:fail = 1 }
    if (-not (Refused done F52 'run (it)')) { Write-Output 'FAIL: done took parentheses'; $script:fail = 1 }
    if (-not (Refused done F52 "a`nb")) { Write-Output 'FAIL: done took a line break'; $script:fail = 1 }
    if (-not (Refused done F52 'a ** b')) { Write-Output 'FAIL: done took an asterisk'; $script:fail = 1 }
    if (-not (Refused done "F52`nF53")) { Write-Output 'FAIL: done took a multi-line id'; $script:fail = 1 }
    if (-not (& $same $f64a)) { Write-Output 'FAIL: a refused done/block/defer changed the board'; $script:fail = 1 }
    $want64 = "# TICKETS`n`n- [x] F50 $dash Built [app: web] **Done ${today}: RED/GREEN 3/3, abc1234** (@cc-eeeeee)`n" +
      "- [x] F51 $dash Tested (testing: unit run)`n- [!] F52 $dash Plain (blocked: needs S3 creds from ops)`n" +
      "- [!] F53 $dash Stuck (blocked: new dep)`n- [>] F54 $dash Busy (deferred: after the parser rewrite) (@cc-ffffff)`n" +
      "- [>] F55 $dash Choice [decide: @asha] (deferred: q1)`n- [-] F56 $dash Dropped`n- [x] F57 $dash Shipped`n" +
      "- [!] F58 $dash Later (blocked: the vendor fix)`n"
    if (-not (& $same $want64)) { Write-Output 'FAIL: F64 board bytes'; $script:fail = 1 }
    # A137 / B3: a CRLF board stays CRLF through done, block and defer; LF stays LF
    foreach ($nl in @("`r`n", "`n")) {
      $name = 'lf'; if ($nl -ceq "`r`n") { $name = 'crlf' }
      W $board ("# TICKETS$nl$nl- [~] F50 $dash One (@cc-eeeeee)$nl- [ ] F52 $dash Two$nl- [ ] F53 $dash Three$nl")
      Run done F50 unit run | Out-Null
      Run block F52 ops | Out-Null
      Run defer F53 q2 | Out-Null
      $want = ("# TICKETS$nl$nl- [x] F50 $dash One [app: web] **Done ${today}: unit run** (@cc-eeeeee)$nl" +
        "- [!] F52 $dash Two (blocked: ops)$nl- [>] F53 $dash Three (deferred: q2)$nl")
      if (-not (& $same $want)) { Write-Output "FAIL: $name done/block/defer line endings or bytes"; $script:fail = 1 }
    }

    # --- F72: verify - /verify-subagent's verdict on a [%] ticket; pass -> [x] Verified, fail stays [%]
    $V = "$T/f72"
    Init-Repo $V
    W "$V/apps/web/f.txt" "x`n"
    W "$V/TICKETS.md" ("# TICKETS`n`n- [%] F60 $dash Built (testing: unit run) (@cc-gggggg)`n- [%] F61 $dash Failing (testing: live check)`n- [ ] F62 $dash Not testing`n")
    Commit 'vidul@ikran.in' 'init' 'README.md'
    Commit 'vidul@ikran.in' 'F60: built' 'apps/web/a.js'
    $board = "$V/TICKETS.md"
    Eq 'verify pass, any case' (Run verify F60 PaSs 'RED/GREEN' '3/3,' 'abc1234') "- [x] F60 $dash Built [app: web] (testing: unit run) **Verified ${today}: RED/GREEN 3/3, abc1234** (@cc-gggggg)"
    Eq 'verify fail stays [%]' (Run verify F61 fail unit run 'red,' 2 of 5) "- [%] F61 $dash Failing (testing: live check) (verify failed ${today}: unit run red, 2 of 5)"
    Eq 'verify fail replaces the note' (Run verify F61 FAIL '  still red ') "- [%] F61 $dash Failing (testing: live check) (verify failed ${today}: still red)"
    $f72a = $Utf8.GetString([System.IO.File]::ReadAllBytes($board))
    if (-not (Refused verify F60 pass again)) { Write-Output 'FAIL: verify took a ticket that is not [%]'; $script:fail = 1 }
    if (-not (Refused verify F62 fail red)) { Write-Output 'FAIL: verify fail took a ticket that is not [%]'; $script:fail = 1 }
    if (-not (Refused verify F61 maybe red)) { Write-Output 'FAIL: verify took a verdict that is not pass/fail'; $script:fail = 1 }
    if (-not (Refused verify F61 pass)) { Write-Output 'FAIL: verify took no evidence'; $script:fail = 1 }
    if (-not (Refused verify F61 fail '  ')) { Write-Output 'FAIL: verify took blank evidence'; $script:fail = 1 }
    if (-not (Refused verify F61 pass 'ran (it)')) { Write-Output 'FAIL: verify took parentheses'; $script:fail = 1 }
    if (-not (Refused verify F61 pass 'a ** b')) { Write-Output 'FAIL: verify took an asterisk'; $script:fail = 1 }
    if (-not (Refused verify F61 fail "a`nb")) { Write-Output 'FAIL: verify took a line break'; $script:fail = 1 }
    if (-not (& $same $f72a)) { Write-Output 'FAIL: a refused verify changed the board'; $script:fail = 1 }
    Eq 'verify pass after a fail drops the fail note' (Run verify F61 pass green now) "- [x] F61 $dash Failing (testing: live check) **Verified ${today}: green now**"

    # --- team add / remove / list: .skillator/team.md written under the board lock
    $G = "$T/team"
    Init-Repo $G
    W "$G/TICKETS.md" ("# TICKETS`n`n- [ ] F1 $dash One [owner: @asha]`n- [x] F2 $dash Two [owner: @asha]`n" +
      "- [?] F3 $dash Three [decide: @asha]`n- [-] F4 $dash Four [by: @asha]`n- [>] F5 $dash Five [by: @vidul, @asha]`n" +
      "- [ ] F6 $dash Six`n- [ ] F7 $dash Seven [owner: @ashab]`n- [~] F8 $dash Eight [owner: @asha]`n- [!] F9 $dash Nine [by: @asha]`n- [%] F10 $dash Ten [owner: @asha] (testing: a live check)`n")
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
    Eq 'team remove, open tickets' (Run team remove '@asha') 'removed: @asha warning: @asha is still named on open tickets: F1, F3, F8, F9, F10 - reassign them'
    if (-not (& $teamIs "# Team`n`n- @vidul: vidul@ikran.in, V2@X.com, x@y.org`n  name: Vidul Ikran`n")) { Write-Output 'FAIL: team remove'; $script:fail = 1 }
    if ([Convert]::ToBase64String([System.IO.File]::ReadAllBytes("$G/TICKETS.md")) -cne $boardBefore) { Write-Output 'FAIL: team remove changed the board'; $script:fail = 1 }
    if (Test-Path -LiteralPath "$G/TICKETS.md.lock") { Write-Output 'FAIL: team remove left the board lock behind'; $script:fail = 1 }
    Eq 'team list after remove' (Run team list) '@vidul: vidul@ikran.in, V2@X.com, x@y.org (Vidul Ikran)'

    # --- A137: team add / remove keep team.md's line endings - CRLF stays CRLF
    # (name: line included), LF stays LF
    foreach ($nl in @("`r`n", "`n")) {
      $tag = if ($nl -eq "`n") { 'lf' } else { 'crlf' }
      W $tf "# Team$nl$nl- @asha: asha@x.com$nl  name: Asha Rao$nl"
      [void](Run team add '@neo' 'Neo Q' 'neo@x.com')
      if (-not (& $teamIs "# Team$nl$nl- @asha: asha@x.com$nl  name: Asha Rao$nl- @neo: neo@x.com$nl  name: Neo Q$nl")) { Write-Output "FAIL: $tag team add line endings or bytes"; $script:fail = 1 }
      [void](Run team remove '@asha')
      if (-not (& $teamIs "# Team$nl$nl- @neo: neo@x.com$nl  name: Neo Q$nl")) { Write-Output "FAIL: $tag team remove line endings or bytes"; $script:fail = 1 }
    }

    # --- F80: whoami, picking, claims, one lead
    $R = "$T/f80"
    Init-Repo $R
    W "$R/.skillator/team.md" "# Team`n`n- @vidul: vidul@ikran.in`n  name: Vidul`n- @asha: Asha@X.com`n- @neo: neo@x.com`n"
    W "$R/TICKETS.md" ("# TICKETS`n`n- [ ] F1 $dash Free`n- [ ] F2 $dash Mine [owner: @asha]`n- [~] F3 $dash Theirs [owner: @vidul] (@cc-aaaaaa)`n" +
      "- [!] F4 $dash Stuck (blocked: x)`n- [x] F5 $dash Shipped [owner: @vidul]`n- [ ] F6 $dash Neos [owner: @neo]`n- [~] F7 $dash Working (@cc-bbbbbb)`n")
    Commit 'vidul@ikran.in' 'init' 'README.md'
    $board = "$R/TICKETS.md"
    $tf = "$R/.skillator/team.md"
    function AsMe([string]$h, [scriptblock]$b) { $p = $env:SKILLATOR_ME; $env:SKILLATOR_ME = $h; try { return (& $b) } finally { $env:SKILLATOR_ME = $p } }
    # whoami: git user.email (any case) mapped through the team; SKILLATOR_ME overrides
    $msg = ErrOf whoami
    if ($msg -notmatch 'user\.email is not set') { Write-Output "FAIL: whoami with no email: [$msg]"; $script:fail = 1 }
    & git config user.email ASHA@x.com
    Eq 'whoami by email' (Run whoami) '@asha'
    Eq 'whoami by SKILLATOR_ME' (AsMe 'neo' { Run whoami }) '@neo'
    $msg = AsMe '@nobody' { ErrOf whoami }
    if ($msg -notmatch 'not in \.skillator/team\.md') { Write-Output "FAIL: SKILLATOR_ME refusal: [$msg]"; $script:fail = 1 }
    & git config user.email ghost@x.com
    $msg = ErrOf whoami
    if ($msg -notmatch 'not on the team: add ghost@x\.com to \.skillator/team\.md') { Write-Output "FAIL: whoami not on the team: [$msg]"; $script:fail = 1 }
    # pick: unassigned and mine picked, another's skipped with its owner; not on the team -> only unassigned
    Eq 'pick, not on the team' (Run pick) 'you: - (not on the team: add ghost@x.com to .skillator/team.md) pick F1 skip F2 @asha skip F3 @vidul pick F4 skip F6 @neo pick F7'
    $msg = ErrOf claim F1
    if ($msg -notmatch 'add ghost@x\.com to \.skillator/team\.md') { Write-Output "FAIL: claim refusal does not say add the email: [$msg]"; $script:fail = 1 }
    & git config user.email asha@x.com
    Eq 'pick as asha' (Run pick) 'you: @asha pick F1 pick F2 skip F3 @vidul pick F4 skip F6 @neo pick F7'
    Eq 'pick given ids' (Run pick f3 F2 F9) 'you: @asha skip F3 @vidul pick F2 pick F9'
    # claim (plan / dispatch): [owner: me], the box kept; mine again is no change; another's refused
    Eq 'claim F1' (Run claim F1) "- [ ] F1 $dash Free [owner: @asha]"
    Eq 'claim keeps [~]' (Run claim F7) "- [~] F7 $dash Working [owner: @asha] (@cc-bbbbbb)"
    $o = [string]::Join(' ', @(Run claim F2))
    if ($o -notmatch 'no change') { Write-Output "FAIL: claim of my own ticket is not no change: [$o]"; $script:fail = 1 }
    $f80b = $Utf8.GetString([System.IO.File]::ReadAllBytes($board))
    $msg = ErrOf claim F3
    if ($msg -notmatch 'F3 is owned by @vidul - only @vidul may reassign it') { Write-Output "FAIL: claim refusal: [$msg]"; $script:fail = 1 }
    # assign: a member's reassign of another's ticket refused; the owner's and the lead's accepted
    $msg = ErrOf assign F3 '@asha'
    if ($msg -notmatch 'F3 is owned by @vidul') { Write-Output "FAIL: reassign refusal: [$msg]"; $script:fail = 1 }
    $same = { param($want) [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($board)) -ceq [Convert]::ToBase64String($Utf8.GetBytes($want)) }
    if (-not (& $same $f80b)) { Write-Output 'FAIL: a refused claim or reassign changed the board'; $script:fail = 1 }
    Eq 'owner reassigns' @(AsMe '@vidul' { Run assign F3 '@neo' })[0] "- [ ] F3 $dash Theirs [owner: @neo] (@cc-aaaaaa)"
    Eq 'assign unowned' (Run assign F4 '@vidul') "- [ ] F4 $dash Stuck [owner: @vidul] (blocked: x)"
    # one lead: set when there is none; only the lead hands it over or clears it; never removed
    $teamIs = { param($want) [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($tf)) -ceq [Convert]::ToBase64String($Utf8.GetBytes($want)) }
    Eq 'team list, no lead' (Run team list) '@vidul: vidul@ikran.in (Vidul) @asha: Asha@X.com (you) @neo: neo@x.com'
    if (-not (Refused team lead '@nobody')) { Write-Output 'FAIL: team lead took someone not on the team'; $script:fail = 1 }
    Eq 'team lead -, none' (Run team lead '-') 'no change: no lead set'
    Eq 'team lead, none yet' (Run team lead '@vidul') 'lead: @vidul'
    $lead1 = "# Team`nlead: @vidul`n`n- @vidul: vidul@ikran.in`n  name: Vidul`n- @asha: Asha@X.com`n- @neo: neo@x.com`n"
    if (-not (& $teamIs $lead1)) { Write-Output 'FAIL: team lead bytes'; $script:fail = 1 }
    Eq 'team list, lead' (Run team list) '@vidul: vidul@ikran.in (Vidul) [lead] @asha: Asha@X.com (you) @neo: neo@x.com'
    $msg = ErrOf team lead '@asha'
    if ($msg -notmatch 'only the lead @vidul') { Write-Output "FAIL: hand-over refusal: [$msg]"; $script:fail = 1 }
    if (-not (Refused team lead '-')) { Write-Output 'FAIL: a member cleared the lead'; $script:fail = 1 }
    $msg = AsMe '@vidul' { ErrOf team remove '@vidul' }
    if ($msg -notmatch 'is the lead - hand the lead over first') { Write-Output "FAIL: lead removal refusal: [$msg]"; $script:fail = 1 }
    if (-not (& $teamIs $lead1)) { Write-Output 'FAIL: a refused lead change changed team.md'; $script:fail = 1 }
    $msg = ErrOf claim F6
    if ($msg -notmatch 'F6 is owned by @neo - only @neo or the lead @vidul may reassign it \(you: @asha\)') { Write-Output "FAIL: refusal does not name both: [$msg]"; $script:fail = 1 }
    Eq 'the lead reassigns' (AsMe '@vidul' { Run assign F6 '@asha' }) "- [ ] F6 $dash Neos [owner: @asha]"
    Eq 'hand-over' (AsMe '@vidul' { Run team lead 'asha' }) 'lead: @asha'
    Eq 'one lead line' @(([System.IO.File]::ReadAllText($tf)) -split "`n" | Where-Object { $_ -match '^lead:' }).Count '1'
    Eq 'team lead same' (Run team lead '@asha') 'no change: @asha is already the lead'
    Eq 'team lead - by the lead' (Run team lead '-') 'lead cleared'
    if ([System.IO.File]::ReadAllText($tf) -match '(?m)^lead:') { Write-Output 'FAIL: team lead - left a lead line'; $script:fail = 1 }
    # no heading, CRLF: the lead line comes in under a new # Team heading, CRLF kept
    W $tf "- @asha: asha@x.com`r`n"
    Eq 'team lead, no heading' (Run team lead '@asha') 'lead: @asha'
    if (-not (& $teamIs "# Team`r`n`r`nlead: @asha`r`n`r`n- @asha: asha@x.com`r`n")) { Write-Output 'FAIL: team lead with no heading, CRLF'; $script:fail = 1 }

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
    # F80: no team.md behaves as before - every ticket picked, a claim changes nothing
    & git config user.email vidul@ikran.in
    Eq 'solo pick' (Run pick) 'you: - (no .skillator/team.md: every ticket) pick F1'
    Eq 'solo claim' (Run claim F1) 'no change: no .skillator/team.md - nothing to claim'
    if (-not (Refused whoami)) { Write-Output 'FAIL: whoami answered with no team.md'; $script:fail = 1 }
    Eq 'solo tag' (Run tag F1) "- [ ] F1 $dash Thing (@cc-dddddd)"

    # --- F66: the opt-in Teams status post runs after a successful edit and never
    # fails it; off (the default) it never runs. The Workflows URL is loopback port 1:
    # the post fails at once, offline - nothing reaches Teams. A child process: the
    # post is the script's own last step, after the edit is printed.
    if ((Get-Command node -ErrorAction SilentlyContinue) -and (Test-Path -LiteralPath (Join-Path $PSScriptRoot '../../teams-uhura/scripts/team.mjs'))) {
      W "$T/teams.json" "{ `"token`": `"dG9rZW4=`", `"workflowUrl`": `"https://127.0.0.1:1/x`", `"port`": 3978, `"statusPosts`": true }`n"
      W "$S/TICKETS.md" "# TICKETS`n`n- [ ] F7 $dash Seven`n- [ ] F8 $dash Eight`n- [%] F10 $dash Ten`n"
      $saved = @($env:SKILLATOR_TEAMS_CONFIG, $env:TEAMS_STATUS_POSTS)
      $env:SKILLATOR_TEAMS_CONFIG = "$T/teams.json"
      $child = { param($c) $env:TEAMS_STATUS_POSTS = $c[0]; & powershell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath @($c[1..($c.Count - 1)]) 2> "$T/err" > "$T/out"; return $LASTEXITCODE }
      $code = & $child @('', 'done', 'F7', 'shipped')
      Eq 'F66 done with a failing post exits 0' $code '0'
      if ([System.IO.File]::ReadAllText("$S/TICKETS.md") -notmatch "(?m)^- \[x\] F7 $dash Seven") { Write-Output 'FAIL: F66 done with a failing post did not edit'; $script:fail = 1 }
      $err = [System.IO.File]::ReadAllText("$T/err")
      if ($err -notmatch 'teams status post failed \(the edit stands\)') { Write-Output "FAIL: F66 failing post not said: $err"; $script:fail = 1 }
      [void](& $child @('on', 'verify', 'F10', 'pass', 'green'))
      if ([System.IO.File]::ReadAllText("$T/err") -notmatch 'teams status post failed \(the edit stands\)') { Write-Output 'FAIL: verify did not post its status'; $script:fail = 1 }
      $code = & $child @('off', 'block', 'F8', 'creds')
      Eq 'F66 posts off exits 0' $code '0'
      if ([System.IO.File]::ReadAllText("$T/err") -match 'teams') { Write-Output 'FAIL: F66 posts off still posted'; $script:fail = 1 }
      W "$T/teams.json" "{ `"token`": `"dG9rZW4=`", `"workflowUrl`": `"https://127.0.0.1:1/x`", `"port`": 3978, `"statusPosts`": false }`n"
      [void](& $child @('', 'defer', 'F8', 'later'))
      if ([System.IO.File]::ReadAllText("$T/err") -match 'teams') { Write-Output 'FAIL: F66 statusPosts false still posted'; $script:fail = 1 }
      # A151: the post never starts a node the repo supplies - not through '.' on PATH
      # nor an absolute PATH entry inside the repo; the real node still posts (and fails,
      # offline). NoDefaultCurrentDirectoryInExePath cleared: Windows' cwd search on.
      $sp = @($env:Path, $env:NoDefaultCurrentDirectoryInExePath)
      Remove-Item Env:NoDefaultCurrentDirectoryInExePath -ErrorAction SilentlyContinue
      [void](New-Item -ItemType Directory -Force "$S/bin")
      foreach ($d in @($S, "$S/bin")) {
        foreach ($f in @('node.cmd', 'node.bat')) { W "$d/$f" "@echo PLANTED>`"$S\planted`"`r`n" }
        W "$d/node" "#!/bin/sh`necho PLANTED > planted`n"
      }
      foreach ($p in @('.', (Resolve-Path -LiteralPath "$S/bin").Path)) {
        W "$S/TICKETS.md" "# TICKETS`n`n- [ ] F9 $dash Nine`n"
        Remove-Item -LiteralPath "$S/planted" -ErrorAction SilentlyContinue
        $env:Path = "$p;$($sp[0])"
        [void](& $child @('on', 'done', 'F9', 'x'))
        $env:Path = $sp[0]
        if (Test-Path -LiteralPath "$S/planted") { Write-Output "FAIL: A151 PATH ${p}: a node planted in the repo ran"; $script:fail = 1 }
        $err = [System.IO.File]::ReadAllText("$T/err")
        if ($err -notmatch 'teams status post failed \(the edit stands\)') { Write-Output "FAIL: A151 PATH ${p}: the real node did not post: $err"; $script:fail = 1 }
      }
      if ($null -ne $sp[1]) { $env:NoDefaultCurrentDirectoryInExePath = $sp[1] }
      Remove-Item -LiteralPath "$S/bin", "$S/node.cmd", "$S/node.bat", "$S/node", "$S/planted" -Recurse -Force -ErrorAction SilentlyContinue
      $env:SKILLATOR_TEAMS_CONFIG = $saved[0]; $env:TEAMS_STATUS_POSTS = $saved[1]
    }

    # --- B3: every edit keeps the board's line endings byte for byte - a CRLF
    # board stays CRLF, an LF board stays LF
    $C = "$T/crlf"
    Init-Repo $C
    W "$C/.skillator/team.md" "- @vidul: vidul@ikran.in`r`n- @asha: asha@x.com`r`n"
    Commit 'vidul@ikran.in' 'F4: four' 'src/a.js'
    foreach ($nl in @("`r`n", "`n")) {
      $name = 'lf'; if ($nl -ceq "`r`n") { $name = 'crlf' }
      W "$C/TICKETS.md" ("# TICKETS$nl$nl- [ ] F1 $dash One$nl- [ ] F2 $dash Two$nl" +
        "- [?] F3 $dash Three [decide: @asha]$nl- [ ] F4 $dash Four$nl")
      Run assign F1 '@vidul' | Out-Null
      Run decide F2 '@asha' | Out-Null
      Run decided F3 | Out-Null
      Run tag F4 | Out-Null
      $want = ("# TICKETS$nl$nl- [ ] F1 $dash One [owner: @vidul]$nl- [?] F2 $dash Two [decide: @asha]$nl" +
        "- [ ] F3 $dash Three [decide: @asha]$nl- [ ] F4 $dash Four [by: @vidul]$nl")
      if ([Convert]::ToBase64String([System.IO.File]::ReadAllBytes("$C/TICKETS.md")) -cne [Convert]::ToBase64String($Utf8.GetBytes($want))) {
        Write-Output "FAIL: $name board line endings or bytes"; $script:fail = 1
      }
    }
  } finally {
    Set-Location -LiteralPath $here
    $env:GIT_CONFIG_GLOBAL = $savedMe[0]; $env:SKILLATOR_ME = $savedMe[1]
    Remove-Item -LiteralPath $T -Recurse -Force -ErrorAction SilentlyContinue
  }
  if ($script:fail -ne 0) { exit 1 }
  Write-Output 'ok'
}

if ($args.Count -lt 1) {
  [Console]::Error.WriteLine('usage: ticket-meta.ps1 apps|app-of|by|apps-of|assign|decide|decided|testing|tested|verify|done|block|defer|tag|team|whoami|claim|pick|selftest')
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
if (@('assign', 'testing', 'tested', 'verify', 'done', 'block', 'defer') -ccontains $cmd) { Invoke-TeamsPost $cmd $rest }
exit 0
