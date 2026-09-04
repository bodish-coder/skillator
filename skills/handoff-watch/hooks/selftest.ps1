# Runnable check for usage-watch.ps1 (and its sh twin, when sh is on PATH).
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File selftest.ps1
$ErrorActionPreference = 'Stop'
$ps  = Join-Path $PSScriptRoot 'usage-watch.ps1'
$sh  = Join-Path $PSScriptRoot 'usage-watch.sh'
$sid = "selftest-$PID"
$flag = Join-Path $HOME ".claude\handoff-watch\$sid"
# check-mode fixtures live here, never in the user's real HOME: `check` writes a
# genuine one-shot .done when it fires, so running it against the live
# ~/.codex/sessions would burn a real session's handoff (and be non-deterministic).
$tmp = Join-Path ([IO.Path]::GetTempPath()) "handoff-watch-selftest-$PID"
$shExe = (Get-Command sh -ErrorAction SilentlyContinue)

# --- helpers ----------------------------------------------------------------
# A crashed script must fail the test: capture the output AND the exit code, so
# "produced no output" can never be mistaken for "correctly did not fire".
function Run($mode, $json) {
  $out = if ($null -eq $json) { (& powershell -NoProfile -ExecutionPolicy Bypass -File $ps -Mode $mode) -join "`n" }
         else { ($json | & powershell -NoProfile -ExecutionPolicy Bypass -File $ps -Mode $mode) -join "`n" }
  if ($LASTEXITCODE -ne 0) { throw "ps $mode`: exit $LASTEXITCODE, output '$out'" }
  $out
}
function Probe($json) { Run 'probe' $json | Out-Null }
function Gate($json)  { Run 'gate'  $json }

function RunSh($mode, $hm, $json) {
  $posix = ($hm -replace '\\', '/')
  $old = $env:HOME; $env:HOME = $posix
  try {
    $out = if ($null -eq $json) { (& $shExe.Source $sh $mode) -join "`n" }
           else { ($json | & $shExe.Source $sh $mode) -join "`n" }
  } finally { $env:HOME = $old }
  if ($LASTEXITCODE -ne 0) { throw "sh $mode`: exit $LASTEXITCODE, output '$out'" }
  $out
}
# $HOME in a child PowerShell follows USERPROFILE on Windows.
function RunCheck($hm) {
  $oldU = $env:USERPROFILE; $oldH = $env:HOME
  $env:USERPROFILE = $hm; $env:HOME = $hm
  try { $out = (& powershell -NoProfile -ExecutionPolicy Bypass -File $ps -Mode check) -join "`n" }
  finally { $env:USERPROFILE = $oldU; $env:HOME = $oldH }
  if ($LASTEXITCODE -ne 0) { throw "ps check: exit $LASTEXITCODE, output '$out'" }
  $out
}

function NewHome($name) {
  $h = Join-Path $tmp $name
  New-Item (Join-Path $h '.claude\handoff-watch') -ItemType Directory -Force | Out-Null
  $h
}
# $ageHours backdates the rollout's mtime (A32 freshness window); $sub varies the
# nesting depth (A32 recursion - the sh twin used to glob exactly */*/*/).
function AddCodex($hm, $usedPercent, $ctxTokens, $ctxWindow, $ageHours = 0, $sub = '.codex\sessions\2026\09\04') {
  $d = Join-Path $hm $sub
  New-Item $d -ItemType Directory -Force | Out-Null
  $line = '{"type":"event_msg","payload":{"type":"token_count","info":' +
          '{"total_token_usage":{"total_tokens":9999999},' +
          "`"last_token_usage`":{`"total_tokens`":$ctxTokens}," +
          "`"model_context_window`":$ctxWindow}," +
          "`"rate_limits`":{`"primary`":{`"used_percent`":$usedPercent},`"secondary`":{`"used_percent`":1.0}}}}"
  $p = [IO.Path]::Combine((Convert-Path $d), 'rollout-test.jsonl')
  [IO.File]::WriteAllText($p, "$line`n")
  if ($ageHours) { (Get-Item $p).LastWriteTime = (Get-Date).AddHours(-$ageHours) }
}
function AddFlag($hm, $name, $value, [switch]$Bom) {
  $p = Join-Path $hm ".claude\handoff-watch\$name"
  if ($Bom) { Set-Content $p $value -Encoding utf8 }          # the pre-fix writer: BOM + CRLF
  else      { [IO.File]::WriteAllText((Join-Path (Convert-Path (Split-Path $p -Parent)) $name), $value) }
  $p
}
function NoDoneFiles($hm) {
  -not (Get-ChildItem (Join-Path $hm '.claude\handoff-watch') -Filter '*.done' -ErrorAction SilentlyContinue)
}

Remove-Item "$flag", "$flag.done" -ErrorAction SilentlyContinue
try {
  # --- probe + gate against the real HOME (a scratch session id) -------------
  $sl = { param($a, $b, $c) "{`"session_id`":`"$sid`",`"rate_limits`":{`"five_hour`":{`"used_percentage`":$a},`"seven_day`":{`"used_percentage`":$b}},`"context_window`":{`"used_percentage`":$c}}" }
  $stop = "{`"session_id`":`"$sid`",`"stop_hook_active`":false}"

  Probe (& $sl 40 12 55)
  if ((Get-Content $flag -Raw).Trim() -ne '55') { throw 'probe: max not taken' }
  # A12: the flag is read by the sh twin - it must be bare bytes, no BOM, no CRLF.
  $bytes = [IO.File]::ReadAllBytes((Convert-Path $flag))
  if ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) { throw 'probe: flag has a UTF-8 BOM' }
  if ($bytes -contains 0x0D -or $bytes -contains 0x0A) { throw 'probe: flag has a line ending' }
  if (Gate $stop) { throw 'gate: fired below threshold' }

  Probe (& $sl 98.2 12 55)
  if ((Get-Content $flag -Raw).Trim() -ne '98.2') { throw 'probe: not updated' }
  $r = Gate $stop
  if ($r -notmatch '"decision":"block"' -or $r -notmatch '98.2') { throw "gate: no block, got '$r'" }
  if (Gate $stop) { throw 'gate: fired twice (done-marker ignored)' }
  if (Gate "{`"session_id`":`"$sid`",`"stop_hook_active`":true}") { throw 'gate: ignored stop_hook_active' }

  # A12 regression, gate side: a BOM'd flag below threshold must not fire.
  Remove-Item "$flag", "$flag.done" -ErrorAction SilentlyContinue
  Set-Content $flag '12.0' -Encoding utf8
  if (Gate $stop) { throw 'gate: BOM flag fired below threshold (A12)' }
  if (Test-Path "$flag.done") { throw 'gate: BOM flag burned the one-shot (A12)' }
  Remove-Item "$flag", "$flag.done" -ErrorAction SilentlyContinue

  # --- check mode, against fixture HOMEs only --------------------------------
  # codex rollout below threshold: report, do not fire, leave no .done behind.
  $h = NewHome 'codex-low'; AddCodex $h 12.0 12000 200000
  $c = RunCheck $h
  if ($c -notmatch '^handoff-watch: codex 12(\.0)?% of 92% - ok$') { throw "check codex-low: got '$c'" }
  if (-not (NoDoneFiles $h)) { throw 'check codex-low: wrote a .done below threshold' }

  # codex rollout over threshold: fire once, then be silent (one-shot .done).
  $h = NewHome 'codex-high'; AddCodex $h 98.4 12000 200000
  $c = RunCheck $h
  if ($c -notmatch '^HANDOFF NOW \(codex 98\.4%\)') { throw "check codex-high: got '$c'" }
  if ($c -notmatch 'skillator:handoff') { throw 'check codex-high: no handoff order' }
  if (NoDoneFiles $h) { throw 'check codex-high: no one-shot .done written' }
  $c = RunCheck $h
  if ($c -match 'HANDOFF NOW') { throw 'check codex-high: fired twice' }

  # context-window fallback: no used_percent worth reading, 170k/200k = 85%.
  $h = NewHome 'codex-ctx'; AddCodex $h 1.0 170000 200000
  $c = RunCheck $h
  if ($c -notmatch '85% of 92% - ok') { throw "check codex-ctx: got '$c'" }
  if ($c -match '([0-9.]+)% of' -and [double]$Matches[1] -gt 100) { throw 'check: percentage over 100 - wrong token field?' }

  # claude-code flag, plain bytes, below threshold.
  $h = NewHome 'cc-plain'; AddFlag $h 'sess-a' '12.0' | Out-Null
  $c = RunCheck $h
  if ($c -notmatch '^handoff-watch: claude-code 12(\.0)?% of 92% - ok$') { throw "check cc-plain: got '$c'" }
  if (-not (NoDoneFiles $h)) { throw 'check cc-plain: wrote a .done below threshold' }

  # A49: the 92-97 band. These two pin the threshold retune itself - at the old
  # default of 97 the first would print "ok" and the second would not fire, so
  # anyone raising the default back without meaning to breaks this test.
  $h = NewHome 'cc-band'; AddFlag $h 'sess-a' '95.0' | Out-Null
  $c = RunCheck $h
  if ($c -notmatch '^HANDOFF NOW \(claude-code 95(\.0)?%\)') { throw "check cc-band: got '$c'" }
  if (NoDoneFiles $h) { throw 'check cc-band: fired without writing the one-shot .done' }

  $h = NewHome 'cc-under'; AddFlag $h 'sess-a' '91.0' | Out-Null
  $c = RunCheck $h
  if ($c -notmatch '^handoff-watch: claude-code 91(\.0)?% of 92% - ok$') { throw "check cc-under: got '$c'" }
  if (-not (NoDoneFiles $h)) { throw 'check cc-under: wrote a .done just below threshold' }

  # A12 regression, check side: same number, written the old BOM+CRLF way.
  $h = NewHome 'cc-bom'; AddFlag $h 'sess-a' '12.0' -Bom | Out-Null
  $c = RunCheck $h
  if ($c -match 'HANDOFF NOW') { throw 'check cc-bom: BOM flag fired at 12% (A12)' }
  if (-not (NoDoneFiles $h)) { throw 'check cc-bom: BOM flag burned the one-shot (A12)' }

  # nothing on disk at all: say so, do not invent a number.
  $h = NewHome 'empty'
  $c = RunCheck $h
  if ($c -notmatch '^handoff-watch: no usage signal') { throw "check empty: got '$c'" }

  # --- A32: the freshness window and the recursion, on BOTH twins ------------
  # These are written as a loop over the two runners on purpose: if either side
  # ever drops the window (or the recursion) the loop fails on that side only,
  # which is precisely the drift this case exists to catch.
  $runners = @(@{ n = 'ps'; f = { param($hm) RunCheck $hm } })
  if ($shExe) { $runners += @{ n = 'sh'; f = { param($hm) RunSh 'check' $hm $null } } }
  foreach ($r in $runners) {
    # A week-old rollout at 98% is somebody else's session. Decline, and above
    # all do not burn the one-shot .done on it.
    $h = NewHome "a32-stale-$($r.n)"; AddCodex $h 98.4 12000 200000 168
    $c = & $r.f $h
    if ($c -match 'HANDOFF NOW') { throw "$($r.n) check: fired on a 7-day-old rollout at 98% (A32), got '$c'" }
    if ($c -notmatch '^handoff-watch: no usage signal') { throw "$($r.n) check a32-stale: got '$c'" }
    if (-not (NoDoneFiles $h)) { throw "$($r.n) check: stale rollout burned the one-shot (A32)" }

    # Just outside the 3h window - the boundary, not just the obvious week.
    $h = NewHome "a32-edge-$($r.n)"; AddCodex $h 98.4 12000 200000 4
    $c = & $r.f $h
    if ($c -match 'HANDOFF NOW') { throw "$($r.n) check: fired on a 4h-old rollout (A32), got '$c'" }

    # ...and inside it, so the window cannot be "fixed" by ignoring codex.
    $h = NewHome "a32-fresh-$($r.n)"; AddCodex $h 98.4 12000 200000 1
    $c = & $r.f $h
    if ($c -notmatch '^HANDOFF NOW \(codex 98\.4%\)') { throw "$($r.n) check: 1h-old rollout did not fire (A32), got '$c'" }

    # A stale rollout must not mask a live claude-code flag either.
    $h = NewHome "a32-fallback-$($r.n)"; AddCodex $h 98.4 12000 200000 168
    AddFlag $h 'sess-a' '12.0' | Out-Null
    $c = & $r.f $h
    if ($c -notmatch '^handoff-watch: claude-code 12(\.0)?% of 92% - ok$') { throw "$($r.n) check a32-fallback: got '$c'" }

    # Recursion: the rollout is one level deeper than the old */*/*/ glob.
    $h = NewHome "a32-deep-$($r.n)"
    AddCodex $h 98.4 12000 200000 0 '.codex\sessions\2026\09\04\rollouts'
    $c = & $r.f $h
    if ($c -notmatch '^HANDOFF NOW \(codex 98\.4%\)') { throw "$($r.n) check: missed a nested rollout (A32), got '$c'" }
  }

  # --- the sh twin must agree, where sh exists -------------------------------
  if ($shExe) {
    $h = NewHome 'sh-codex-low'; AddCodex $h 12.0 12000 200000
    $c = RunSh 'check' $h $null
    if ($c -notmatch '^handoff-watch: codex 12\.0% of 92% - ok$') { throw "sh check codex-low: got '$c'" }
    if (-not (NoDoneFiles $h)) { throw 'sh check codex-low: wrote a .done below threshold' }

    $h = NewHome 'sh-codex-high'; AddCodex $h 98.4 12000 200000
    $c = RunSh 'check' $h $null
    if ($c -notmatch '^HANDOFF NOW \(codex 98\.4%\)') { throw "sh check codex-high: got '$c'" }
    if (NoDoneFiles $h) { throw 'sh check codex-high: no one-shot .done written' }

    # A12 as originally reported: PS writes the flag, sh reads it.
    $h = NewHome 'sh-cc-bom'; AddFlag $h 'sess-a' '12.0' -Bom | Out-Null
    $c = RunSh 'check' $h $null
    if ($c -match 'HANDOFF NOW') { throw 'sh check: BOM flag fired at 12% (A12)' }
    if (-not (NoDoneFiles $h)) { throw 'sh check: BOM flag burned the one-shot (A12)' }

    $h = NewHome 'sh-gate-bom'; AddFlag $h 'sess-a' '12.0' -Bom | Out-Null
    $g = RunSh 'gate' $h '{"session_id":"sess-a","stop_hook_active":false}'
    if ($g) { throw "sh gate: BOM flag fired below threshold (A12), got '$g'" }
    if (-not (NoDoneFiles $h)) { throw 'sh gate: BOM flag burned the one-shot (A12)' }

    $h = NewHome 'sh-gate-high'; AddFlag $h 'sess-a' '98.2' | Out-Null
    $g = RunSh 'gate' $h '{"session_id":"sess-a","stop_hook_active":false}'
    if ($g -notmatch '"decision":"block"' -or $g -notmatch '98\.2') { throw "sh gate: no block, got '$g'" }
  }

  'ok'
}
finally {
  # try/finally, not a trailing line: a failing assertion must still clean up.
  Remove-Item "$flag", "$flag.done" -ErrorAction SilentlyContinue
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
