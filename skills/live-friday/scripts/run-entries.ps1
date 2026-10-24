# run-entries.ps1 - the one writer of .skillator/run.json (F79). Windows twin of
# run-entries.sh, which carries the full reasoning; same bytes out, keep in step.
#
#   run-entries.ps1 scan | rename <id> <name> | selftest
#
# Windows PowerShell 5.1 safe: no ?:, ??, && or ||.
$ErrorActionPreference = 'Stop'
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$FILE = '.skillator/run.json'
$S = [string][char]0x1c
# Case-sensitive tables, as the sh twin's awk arrays are (@{} is case-blind).
function New-Table { return ,(New-Object System.Collections.Hashtable ([StringComparer]::Ordinal)) }
$SCRIPT_RE = '^(install|build|run|setup|start|dev)([._-][A-Za-z0-9._-]*)?\.(sh|ps1)$'

function Fail([string]$msg) { throw "run-entries: $msg" }

# JSON -> a list of @{ P; T; R }: path (segments each led by \x1c), obj|arr|str|lit, the
# raw text (string escapes kept; a raw tab becomes \t). $null when the text is not JSON.
function Get-Flat([string]$text) {
  $st = @{ b = $text; i = 0; n = $text.Length; bad = $false; out = (New-Object System.Collections.ArrayList) }
  if ($st.n -gt 0 -and $st.b[0] -eq [char]0xFEFF) { $st.i = 1 }
  function ws { while ($st.i -lt $st.n) { $c = $st.b[$st.i]; if ($c -eq ' ' -or $c -eq "`t" -or $c -eq "`n" -or $c -eq "`r") { $st.i++ } else { break } } }
  function str {
    $st.i++; $sb = New-Object System.Text.StringBuilder
    while ($st.i -lt $st.n) {
      $c = $st.b[$st.i]
      if ($c -eq '\') {
        [void]$sb.Append($c); if ($st.i + 1 -lt $st.n) { [void]$sb.Append($st.b[$st.i + 1]) }
        $st.i += 2; continue
      }
      if ($c -eq '"') { $st.i++; return $sb.ToString() }
      if ($c -eq "`t") { [void]$sb.Append('\t') } else { [void]$sb.Append($c) }
      $st.i++
    }
    $st.bad = $true; return $sb.ToString()
  }
  function emit($p, $t, $r) { [void]$st.out.Add(@{ P = $p; T = $t; R = $r }) }
  function val([string]$p) {
    if ($st.bad) { return }
    ws
    if ($st.i -ge $st.n) { $st.bad = $true; return }
    $c = $st.b[$st.i]
    if ($c -eq '{') {
      emit $p 'obj' ''; $st.i++; ws
      if ($st.i -lt $st.n -and $st.b[$st.i] -eq '}') { $st.i++; return }
      while (-not $st.bad) {
        ws; if ($st.i -ge $st.n -or $st.b[$st.i] -ne '"') { $st.bad = $true; return }
        $k = str; ws
        if ($st.i -ge $st.n -or $st.b[$st.i] -ne ':') { $st.bad = $true; return }
        $st.i++; val ($p + $S + $k); ws
        if ($st.i -ge $st.n) { $st.bad = $true; return }
        $c = $st.b[$st.i]; $st.i++
        if ($c -eq '}') { return }
        if ($c -ne ',') { $st.bad = $true; return }
      }
      return
    }
    if ($c -eq '[') {
      emit $p 'arr' ''; $st.i++; ws
      if ($st.i -lt $st.n -and $st.b[$st.i] -eq ']') { $st.i++; return }
      $ix = 0
      while (-not $st.bad) {
        val ($p + $S + $ix); $ix++; ws
        if ($st.i -ge $st.n) { $st.bad = $true; return }
        $c = $st.b[$st.i]; $st.i++
        if ($c -eq ']') { return }
        if ($c -ne ',') { $st.bad = $true; return }
      }
      return
    }
    if ($c -eq '"') { $s = str; emit $p 'str' $s; return }
    $sb = New-Object System.Text.StringBuilder
    while ($st.i -lt $st.n) { $c = $st.b[$st.i]; if (",}] `t`r`n".IndexOf($c) -ge 0) { break }; [void]$sb.Append($c); $st.i++ }
    $s = $sb.ToString()
    if ($s -cnotmatch '^(true|false|null|-?[0-9][0-9.eE+-]*)$') { $st.bad = $true; return }
    emit $p 'lit' $s
  }
  val ''
  ws
  if ($st.bad -or $st.i -lt $st.n) { return $null }
  return ,$st.out
}

function Read-Text([string]$path) { return [IO.File]::ReadAllText((Join-Path (Get-Location).Path $path), $Utf8) }
function Test-File([string]$path) { return [IO.File]::Exists((Join-Path (Get-Location).Path $path)) }

# The files of a dir, ordinal order.
function Get-FilesIn([string]$dir) {
  $full = Join-Path (Get-Location).Path $dir
  if (-not [IO.Directory]::Exists($full)) { return @() }
  $names = @([IO.Directory]::GetFiles($full) | ForEach-Object { [IO.Path]::GetFileName($_) })
  [Array]::Sort($names, [StringComparer]::Ordinal)
  return $names
}

# @{ K; T; Src } in the order the header names.
function Get-Found {
  $found = New-Object System.Collections.ArrayList
  if (Test-File 'package.json') {
    $fl = $null
    try { $fl = Get-Flat (Read-Text 'package.json') } catch { $fl = $null }
    if ($null -ne $fl) {
      foreach ($e in $fl) {
        $p = $e.P.Split([char]0x1c)
        if ($p.Length -eq 3 -and $p[1] -ceq 'scripts' -and $e.T -eq 'str') { [void]$found.Add(@{ K = 'npm'; T = $p[2]; Src = 'package.json' }) }
      }
    }
  }
  $root = @(Get-FilesIn '.')
  $mf = $null
  foreach ($m in 'GNUmakefile', 'makefile', 'Makefile') { if ($root -ccontains $m) { $mf = $m; break } }
  if ($mf) {
    $seen = New-Table
    foreach ($line in ((Read-Text $mf) -split "`n")) {
      $line = $line -replace "`r$", ''
      $p = $line.IndexOf(':'); if ($p -lt 0) { continue }
      $head = $line.Substring(0, $p); $nx = $line.Substring($p + 1)
      if ($nx.StartsWith('=') -or $nx.StartsWith(':=')) { continue }
      if ($head -cnotmatch '^[A-Za-z0-9_][A-Za-z0-9_.-]*([ \t]+[A-Za-z0-9_][A-Za-z0-9_.-]*)*[ \t]*$') { continue }
      foreach ($t in ($head -split '[ \t]+')) {
        if ($t -ne '' -and -not $seen.ContainsKey($t)) { $seen[$t] = 1; [void]$found.Add(@{ K = 'make'; T = $t; Src = $mf }) }
      }
    }
  }
  foreach ($f in $root) { if ($f -cmatch $SCRIPT_RE) { [void]$found.Add(@{ K = $f.Substring($f.LastIndexOf('.') + 1); T = $f; Src = $f }) } }
  foreach ($f in @(Get-FilesIn 'scripts')) { if ($f -cmatch $SCRIPT_RE) { [void]$found.Add(@{ K = $f.Substring($f.LastIndexOf('.') + 1); T = "scripts/$f"; Src = "scripts/$f" }) } }
  return ,$found
}

function Test-Safe([string]$t) {
  return ($t -ne '' -and $t -notmatch '^/' -and $t -notmatch '^[A-Za-z]:' -and $t -notmatch '(^|/)\.\.(/|$)' -and -not $t.Contains('\'))
}
function Test-Kind([string]$k) { return ($k -ceq 'npm' -or $k -ceq 'make' -or $k -ceq 'sh' -or $k -ceq 'ps1') }
function Get-DefName([string]$k, [string]$t) {
  if ($k -ceq 'npm') { return "npm run $t" }
  if ($k -ceq 'make') { return "make $t" }
  return $t
}
function Get-Command1([string]$k, [string]$t, [string]$as) {
  if ($k -ceq 'npm') { if ($as -eq '') { return "npm run $t" } else { return "npm run $t --$as" } }
  if ($k -ceq 'make') { return "make $t$as" }
  if ($k -ceq 'sh') { return "sh $t$as" }
  if ($k -ceq 'ps1') { return "powershell -File $t$as" }
  return ''
}

# The merge and the writer: run.json's new text, plus the counts. $mode scan | rename.
function Invoke-Merge([string]$mode, [string]$rid, [string]$rname) {
  [IO.Directory]::CreateDirectory((Join-Path (Get-Location).Path '.skillator')) | Out-Null
  $old = $null
  if (Test-File $FILE) {
    $old = Get-Flat (Read-Text $FILE)
    if ($null -eq $old) { Fail "$FILE is not valid JSON - fix it or delete it, then scan again" }
  }
  $dsrc = New-Table; $dlist = New-Object System.Collections.ArrayList
  if ($mode -eq 'scan') {
    foreach ($d in (Get-Found)) { $k = $d.K + ':' + $d.T; if (-not $dsrc.ContainsKey($k)) { $dsrc[$k] = $d.Src; [void]$dlist.Add($d) } }
  }
  # entries by index: fields (str), lits, args
  $ents = @{}; $ne = -1
  if ($null -ne $old) {
    foreach ($e in $old) {
      $p = $e.P.Split([char]0x1c)
      if ($p.Length -lt 3 -or $p[1] -cne 'entries') { continue }
      $ix = 0; if (-not [int]::TryParse($p[2], [ref]$ix)) { continue }
      if ($p.Length -eq 3) { if ($e.T -eq 'obj') { $ents[$ix] = @{ v = (New-Table); l = (New-Table); a = (New-Object System.Collections.ArrayList) }; if ($ix -gt $ne) { $ne = $ix } }; continue }
      if (-not $ents.ContainsKey($ix)) { continue }
      $f = $p[3]
      if ($p.Length -eq 4) { if ($e.T -eq 'str') { $ents[$ix].v[$f] = $e.R } elseif ($e.T -eq 'lit') { $ents[$ix].l[$f] = $e.R }; continue }
      if ($p.Length -eq 5 -and $f -ceq 'args' -and $e.T -eq 'str') { [void]$ents[$ix].a.Add($e.R) }
    }
  }
  $rows = New-Object System.Collections.ArrayList
  $used = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
  $st = @{ miss = 0; new = 0; renamed = 0 }
  $row = {
    param($id, $name, $k, $t, $aj, $as, $cwd, $src, $miss)
    $mt = 'false'; if ($miss) { $mt = 'true'; $st.miss++ }
    [void]$rows.Add('    { "id": "' + $id + '", "name": "' + $name + '", "kind": "' + $k + '", "target": "' + $t + '", "args": ' + $aj +
      ', "command": "' + (Get-Command1 $k $t $as) + '", "cwd": "' + $cwd + '", "source": "' + $src + '", "missing": ' + $mt + ' }')
  }
  $get = { param($h, $key) if ($h.ContainsKey($key)) { return $h[$key] } return '' }
  for ($ix = 0; $ix -le $ne; $ix++) {
    if (-not $ents.ContainsKey($ix)) { continue }
    $en = $ents[$ix]
    $id = & $get $en.v 'id'; if ($id -eq '') { $id = 'hand-' + ($ix + 1) }
    if ($used.Contains($id)) { $c = 2; while ($used.Contains($id + '-' + $c)) { $c++ }; $id = $id + '-' + $c }
    [void]$used.Add($id)
    $k = & $get $en.v 'kind'; $t = & $get $en.v 'target'
    $cwd = & $get $en.v 'cwd'; if ($cwd -eq '') { $cwd = '.' }
    $aj = '['; $as = ''; $j = 0
    foreach ($a in $en.a) { if ($j -gt 0) { $aj += ', ' }; $aj += '"' + $a + '"'; $as += ' ' + $a; $j++ }
    $aj += ']'
    $name = & $get $en.v 'name'; if ($name -eq '') { $name = Get-DefName $k $t }
    if ($mode -eq 'rename' -and $id -ceq $rid) { $name = $rname; $st.renamed = 1 }
    if ($mode -eq 'scan') {
      $key = $k + ':' + $t
      $present = $dsrc.ContainsKey($key)
      if (-not $present -and ($k -ceq 'sh' -or $k -ceq 'ps1') -and (Test-Safe $t)) { $present = Test-File $t }
      $miss = (-not (Test-Kind $k)) -or $t -eq '' -or (-not $present) -or (-not ($cwd -eq '.' -or (Test-Safe $cwd))) -or (($k -ceq 'sh' -or $k -ceq 'ps1') -and -not (Test-Safe $t))
      if ($id -ceq $key -and $dsrc.ContainsKey($id)) { $src = $dsrc[$id] } else { $src = & $get $en.v 'source' }
    } else {
      $miss = ((& $get $en.l 'missing') -eq 'true'); $src = & $get $en.v 'source'
    }
    if ($src -eq '') { $src = 'hand' }
    & $row $id $name $k $t $aj $as $cwd $src $miss
  }
  foreach ($d in $dlist) {
    $key = $d.K + ':' + $d.T
    if ($used.Contains($key)) { continue }
    [void]$used.Add($key); $st.new++
    & $row $key (Get-DefName $d.K $d.T) $d.K $d.T '[]' '' '.' $d.Src $false
  }
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append("{`n  `"version`": 1,`n")
  if ($rows.Count -eq 0) { [void]$sb.Append("  `"entries`": []`n") }
  else {
    [void]$sb.Append("  `"entries`": [`n")
    for ($r = 0; $r -lt $rows.Count; $r++) { [void]$sb.Append($rows[$r]); if ($r -lt $rows.Count - 1) { [void]$sb.Append(',') }; [void]$sb.Append("`n") }
    [void]$sb.Append("  ]`n")
  }
  [void]$sb.Append("}`n")
  $text = $sb.ToString()
  $full = Join-Path (Get-Location).Path $FILE
  $changed = $true
  if ([IO.File]::Exists($full)) { $changed = ([IO.File]::ReadAllText($full, $Utf8) -cne $text) }
  if ($changed -and -not ($mode -eq 'rename' -and $st.renamed -eq 0)) {
    $tmp = $full + '.tmp' + $PID
    [IO.File]::WriteAllText($tmp, $text, $Utf8)
    Move-Item -LiteralPath $tmp -Destination $full -Force
  }
  return @{ n = $rows.Count; new = $st.new; miss = $st.miss; renamed = $st.renamed; changed = $changed }
}

function JText([string]$s) { return $s.Replace('\', '\\').Replace('"', '\"') }

function Invoke-Scan {
  $had = Test-File $FILE
  $r = Invoke-Merge 'scan' '' ''
  if (-not $had) { Write-Output "$FILE created - $($r.n) entries" }
  elseif ($r.changed) { Write-Output "$FILE updated - $($r.n) entries, $($r.new) new, $($r.miss) missing" }
  else { Write-Output "$FILE unchanged - $($r.n) entries, $($r.miss) missing" }
}

function Invoke-Rename([string[]]$a) {
  if ($a.Count -ne 2) { Fail 'usage: run-entries.ps1 rename <id> <name>' }
  if (-not (Test-File $FILE)) { Fail "no $FILE here - scan first" }
  if (($a[0] + $a[1]) -match '[\x00-\x1f\x7f]') { Fail 'an id and a name are one line of text' }
  $name = $a[1].Trim()
  if ($name -eq '') { Fail 'a name cannot be empty' }
  if ($Utf8.GetByteCount($name) -gt 80) { Fail 'a name is at most 80 bytes' }
  $r = Invoke-Merge 'rename' (JText $a[0]) (JText $name)
  if ($r.renamed -ne 1) { Fail "no entry with id $($a[0]) in $FILE" }
  Write-Output "renamed $($a[0]) to $name in $FILE"
}

# --- selftest: a fixture repo, every subcommand, exact bytes (the same as the sh one) ---

function Row($id, $name, $k, $t, $aj, $cmd, $src, $miss) {
  return '    { "id": "' + $id + '", "name": "' + $name + '", "kind": "' + $k + '", "target": "' + $t + '", "args": ' + $aj + ', "command": "' + $cmd + '", "cwd": ".", "source": "' + $src + '", "missing": ' + $miss + ' }'
}

function Invoke-Selftest {
  $self = $PSCommandPath
  $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $T = Join-Path ([IO.Path]::GetTempPath()) ('run-entries-' + [guid]::NewGuid().ToString('N'))
  [void][IO.Directory]::CreateDirectory($T)
  $here = Get-Location
  $script:fails = 0
  function Bad([string]$m) { throw "FAIL: $m" }
  # one child per call, as the board runs it; output lines and the exit code
  function Re {
    $ErrorActionPreference = 'Continue'
    $o = & $ps -NoProfile -ExecutionPolicy Bypass -File $self @args 2>$null
    return @{ out = (@($o) -join "`n"); code = $LASTEXITCODE }
  }
  function W([string]$p, [string]$text) { [IO.File]::WriteAllText((Join-Path $T $p), $text, $Utf8) }
  function RJ { return ([IO.File]::ReadAllText((Join-Path $T '.skillator/run.json'), $Utf8)) }
  try {
    Set-Location -LiteralPath $T
    $r = Re scan
    if ($r.code -ne 0 -or $r.out -cne '.skillator/run.json created - 0 entries') { Bad "empty scan said: $($r.out)" }
    if ((RJ) -cne "{`n  `"version`": 1,`n  `"entries`": []`n}`n") { Bad "empty run.json: $(RJ)" }
    Remove-Item -LiteralPath (Join-Path $T '.skillator') -Recurse -Force

    W 'package.json' ("{`n  `"name`": `"x`",`n  `"scripts`": {`n    `"build`": `"tsc -p .`",`n    `"test`":`"node --test`", `"dev:web`": `"vite`"`n  },`n  `"devDependencies`": { `"scripts`": `"1`" }`n}`n")
    W 'Makefile' (".PHONY: all test`nCC := gcc`nVAR = a:b`nall: build`nbuild test: deps`n`techo hi: there`n%.o: %.c`ndeps::`n")
    [void][IO.Directory]::CreateDirectory((Join-Path $T 'scripts'))
    foreach ($f in 'install.sh', 'install.ps1', 'run-dev.sh', 'notes.sh', 'scripts/build.ps1', 'scripts/helper.sh', 'scripts/setup_db.sh') { W $f "echo $f`n" }
    # Build.sh (a capital) is not an entry point; on a case-blind disk it can sit beside build.sh only by name
    W 'Build.sh' "echo Build.sh`n"

    $r = Re scan
    if ($r.out -cne '.skillator/run.json created - 12 entries') { Bad "first scan said: $($r.out)" }
    $want = @(
      (Row 'npm:build' 'npm run build' 'npm' 'build' '[]' 'npm run build' 'package.json' 'false'),
      (Row 'npm:test' 'npm run test' 'npm' 'test' '[]' 'npm run test' 'package.json' 'false'),
      (Row 'npm:dev:web' 'npm run dev:web' 'npm' 'dev:web' '[]' 'npm run dev:web' 'package.json' 'false'),
      (Row 'make:all' 'make all' 'make' 'all' '[]' 'make all' 'Makefile' 'false'),
      (Row 'make:build' 'make build' 'make' 'build' '[]' 'make build' 'Makefile' 'false'),
      (Row 'make:test' 'make test' 'make' 'test' '[]' 'make test' 'Makefile' 'false'),
      (Row 'make:deps' 'make deps' 'make' 'deps' '[]' 'make deps' 'Makefile' 'false'),
      (Row 'ps1:install.ps1' 'install.ps1' 'ps1' 'install.ps1' '[]' 'powershell -File install.ps1' 'install.ps1' 'false'),
      (Row 'sh:install.sh' 'install.sh' 'sh' 'install.sh' '[]' 'sh install.sh' 'install.sh' 'false'),
      (Row 'sh:run-dev.sh' 'run-dev.sh' 'sh' 'run-dev.sh' '[]' 'sh run-dev.sh' 'run-dev.sh' 'false'),
      (Row 'ps1:scripts/build.ps1' 'scripts/build.ps1' 'ps1' 'scripts/build.ps1' '[]' 'powershell -File scripts/build.ps1' 'scripts/build.ps1' 'false'),
      (Row 'sh:scripts/setup_db.sh' 'scripts/setup_db.sh' 'sh' 'scripts/setup_db.sh' '[]' 'sh scripts/setup_db.sh' 'scripts/setup_db.sh' 'false'))
    $wantText = "{`n  `"version`": 1,`n  `"entries`": [`n" + ($want -join ",`n") + "`n  ]`n}`n"
    if ((RJ) -cne $wantText) { Bad "first scan wrote:`n$(RJ)`nwanted:`n$wantText" }

    $r = Re rename 'npm:build' 'Build it'
    if ($r.out -cne 'renamed npm:build to Build it in .skillator/run.json') { Bad "rename said: $($r.out)" }
    if (-not (RJ).Contains('{ "id": "npm:build", "name": "Build it", "kind": "npm"')) { Bad 'rename not saved' }
    if ((Re rename 'npm:nope' 'x').code -eq 0) { Bad 'rename of an unknown id passed' }
    if ((Re rename 'npm:test' '').code -eq 0) { Bad 'an empty name passed' }
    if ((Re rename 'npm:test' "a`nb").code -eq 0) { Bad 'a two-line name passed' }
    # (a quote in a name: PowerShell 5.1 drops embedded quotes on a native call's argv - the sh selftest proves the escaping; here the function itself)
    if ((JText 'say "hi" \ there') -cne 'say \"hi\" \\ there') { Bad 'JText' }

    $lines = (RJ) -split "`n"
    $out = New-Object System.Collections.ArrayList
    foreach ($l in $lines) {
      [void]$out.Add($l)
      if ($l -match '"entries": \[') {
        [void]$out.Add('    {"name":"install selftest","kind":"sh","target":"install.sh","args":["--selftest"]},')
        [void]$out.Add('    { "id": "tool", "kind": "sh", "target": "tools/x.sh", "cwd": "tools" },')
      }
    }
    W '.skillator/run.json' ($out -join "`n")
    Remove-Item -LiteralPath (Join-Path $T 'install.ps1') -Force
    W 'scripts/start.sh' "echo start`n"
    $r = Re scan
    if ($r.out -cne '.skillator/run.json updated - 15 entries, 1 new, 2 missing') { Bad "rescan said: $($r.out)" }
    $got = (RJ) -split "`n"
    $hand = (Row 'hand-1' 'install selftest' 'sh' 'install.sh' '["--selftest"]' 'sh install.sh --selftest' 'hand' 'false') + ','
    $start = (Row 'sh:scripts/start.sh' 'scripts/start.sh' 'sh' 'scripts/start.sh' '[]' 'sh scripts/start.sh' 'scripts/start.sh' 'false')
    foreach ($line in @($hand,
        ((Row 'npm:build' 'Build it' 'npm' 'build' '[]' 'npm run build' 'package.json' 'false') + ','),
        ((Row 'ps1:install.ps1' 'install.ps1' 'ps1' 'install.ps1' '[]' 'powershell -File install.ps1' 'install.ps1' 'true') + ','),
        $start,
        '    { "id": "tool", "name": "tools/x.sh", "kind": "sh", "target": "tools/x.sh", "args": [], "command": "sh tools/x.sh", "cwd": "tools", "source": "hand", "missing": true },')) {
      if ($got -cnotcontains $line) { Bad "rescan lacks: $line`nin:`n$(RJ)" }
    }
    if ($got[3] -cne $hand) { Bad 'hand entry moved' }
    if ($got[$got.Count - 4] -cne $start) { Bad 'new entry not last' }
    $r = Re scan
    if ($r.out -cne '.skillator/run.json unchanged - 15 entries, 2 missing') { Bad "third scan said: $($r.out)" }
    $r = Re rename 'hand-1' 'Selftest'
    if (-not (RJ).Contains('{ "id": "hand-1", "name": "Selftest", "kind": "sh", "target": "install.sh", "args": ["--selftest"]')) { Bad 'hand rename' }

    # a rename that matches no id leaves a hand-edited file byte for byte
    W '.skillator/run.json' "{`"entries`":[{`"id`":`"a`",`"kind`":`"sh`",`"target`":`"a.sh`"}]}`n"
    if ((Re rename 'nope' 'X').code -eq 0) { Bad 'rename of an unknown id passed' }
    if ((RJ) -cne "{`"entries`":[{`"id`":`"a`",`"kind`":`"sh`",`"target`":`"a.sh`"}]}`n") { Bad "a rename of an unknown id rewrote run.json: $(RJ)" }

    W '.skillator/run.json' "{ `"entries`": [ oops`n"
    if ((Re scan).code -eq 0) { Bad 'a broken run.json was scanned' }
    if ((RJ) -cne "{ `"entries`": [ oops`n") { Bad 'a broken run.json was overwritten' }
    $left = @([IO.Directory]::GetFiles((Join-Path $T '.skillator')) | Where-Object { [IO.Path]::GetFileName($_) -ne 'run.json' })
    if ($left.Count) { Bad "temp files left in .skillator: $($left -join ', ')" }

    # names are case-sensitive: scripts build and Build, targets build and Build are four
    # entries; a hand key "Target" is not "target" (the same bytes as the sh selftest)
    [void][IO.Directory]::CreateDirectory((Join-Path $T 'c/.skillator'))
    W 'c/package.json' "{`"scripts`":{`"build`":`"a`",`"Build`":`"b`"}}`n"
    W 'c/Makefile' "build:`nBuild:`n"
    W 'c/.skillator/run.json' "{`"entries`":[{`"id`":`"h`",`"kind`":`"sh`",`"target`":`"x.sh`",`"Target`":`"y.sh`"}]}`n"
    Set-Location -LiteralPath (Join-Path $T 'c')
    $r = Re scan
    if ($r.out -cne '.skillator/run.json updated - 5 entries, 4 new, 1 missing') { Bad "case scan said: $($r.out)" }
    $want = @(
      (Row 'h' 'x.sh' 'sh' 'x.sh' '[]' 'sh x.sh' 'hand' 'true'),
      (Row 'npm:build' 'npm run build' 'npm' 'build' '[]' 'npm run build' 'package.json' 'false'),
      (Row 'npm:Build' 'npm run Build' 'npm' 'Build' '[]' 'npm run Build' 'package.json' 'false'),
      (Row 'make:build' 'make build' 'make' 'build' '[]' 'make build' 'Makefile' 'false'),
      (Row 'make:Build' 'make Build' 'make' 'Build' '[]' 'make Build' 'Makefile' 'false'))
    $wantText = "{`n  `"version`": 1,`n  `"entries`": [`n" + ($want -join ",`n") + "`n  ]`n}`n"
    $gotText = [IO.File]::ReadAllText((Join-Path $T 'c/.skillator/run.json'), $Utf8)
    if ($gotText -cne $wantText) { Bad "case scan wrote:`n$gotText`nwanted:`n$wantText" }
  } finally {
    Set-Location -LiteralPath $here
    Remove-Item -LiteralPath $T -Recurse -Force -ErrorAction SilentlyContinue
  }
  Write-Output 'ok'
}

try {
  if ($args.Count -lt 1) { Fail 'usage: run-entries.ps1 scan|rename <id> <name>|selftest' }
  $cmd = [string]$args[0]
  $rest = @($args | Select-Object -Skip 1 | ForEach-Object { [string]$_ })
  if ($cmd -ceq 'scan') { if ($rest.Count) { Fail 'usage: run-entries.ps1 scan' }; Invoke-Scan }
  elseif ($cmd -ceq 'rename') { Invoke-Rename $rest }
  elseif ($cmd -ceq 'selftest') { Invoke-Selftest }
  else { Fail 'usage: run-entries.ps1 scan|rename <id> <name>|selftest' }
  exit 0
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
