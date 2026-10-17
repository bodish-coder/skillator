# codegraph-check.ps1 - the arming step's codegraph line, read-only (A128).
# Mirror of codegraph-check.sh - same lines. Windows PowerShell 5.1 safe.
#   powershell -NoProfile -ExecutionPolicy Bypass -File codegraph-check.ps1
#   ... -File codegraph-check.ps1 -Mode selftest
param([string]$Mode = 'run')

function Get-Line([string]$st, [int]$tracked, [bool]$other) {
  $files = 0; $langs = @(); $pending = 0; $inl = $false
  foreach ($l in ($st -split "`r?`n")) {
    if ($l -match '^\s*Files:\s+([\d,]+)') { $files = [int]($Matches[1] -replace ',', '') }
    if ($l -match '^Files by Language:') { $inl = $true; continue }
    if ($inl) { if ($l -match '^\s*([a-z][\w#+-]*)\s+\d') { $langs += $Matches[1]; continue } else { $inl = $false } }
    if ($l -match '^\s*(Added|Modified|Removed|Deleted):\s+(\d+)') { $pending += [int]$Matches[2] }
  }
  if ($files -eq 0) { return 'codegraph: not indexed - run `codegraph init`, then `codegraph index`, once' }
  $map = @{ 'javascript' = 'js'; 'typescript' = 'ts'; 'python' = 'py' }
  $ls = @($langs | Sort-Object | ForEach-Object { if ($map.ContainsKey($_)) { $map[$_] } else { $_ } }) -join '/'
  $part = ''; if (($files * 2 -lt $tracked) -or $other) { $part = ' partial' }
  $out = "codegraph $files/$tracked$part"
  if ($ls) { $out += " ($ls only)" }
  if ($pending) { $out += " - $pending pending: codegraph sync" }
  $out
}

function Invoke-Check {
  if (-not (Get-Command codegraph -ErrorAction SilentlyContinue)) { return 'codegraph: missing - offer `npm i -g @colbymchenry/codegraph` (never install silently)' }
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try {
    $st = (& codegraph status 2>&1 | ForEach-Object { "$_" }) -join "`n"
    $tf = @(& git ls-files 2>$null)
  } finally { $ErrorActionPreference = $prev }
  $other = @($tf | Where-Object { $_ -match '\.(sh|ps1|md)$' }).Count -gt 0
  Get-Line $st $tf.Count $other
}

if ($Mode -eq 'selftest') {
  $s = "Index Statistics:`n  Files:     22`n  Nodes:     600`n`nFiles by Language:`n  javascript      13`n  python          8`n  typescript      1`n`nPending Changes:`n  Added:     1 files`n  Modified:  1 files"
  $want = 'codegraph 22/1102 partial (js/py/ts only) - 2 pending: codegraph sync'
  $got = Get-Line $s 1102 $true; if ($got -cne $want) { [Console]::Error.WriteLine("FAIL: got '$got' want '$want'"); exit 1 }
  $got = Get-Line "Index Statistics:`n  Files:     40`nFiles by Language:`n  python  40" 50 $false
  if ($got -cne 'codegraph 40/50 (py only)') { [Console]::Error.WriteLine("FAIL: got '$got'"); exit 1 }
  if ((Get-Line "Index Statistics:`n  Files:     0" 50 $false) -notlike 'codegraph: not indexed*') { [Console]::Error.WriteLine('FAIL: zero files'); exit 1 }
  if ((Get-Line '' 50 $false) -notlike 'codegraph: not indexed*') { [Console]::Error.WriteLine('FAIL: no status'); exit 1 }
  if (@([IO.File]::ReadAllBytes($PSCommandPath) | Where-Object { $_ -gt 127 }).Count) { [Console]::Error.WriteLine('FAIL: non-ASCII'); exit 1 }
  'ok'; exit 0
}
Invoke-Check
