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
$tmp = Join-Path ([IO.Path]::GetTempPath()) "watch-cortana-selftest-$PID"
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

Remove-Item "$flag", "$flag.weekly", "$flag.done", "$flag.weekly.done" -ErrorAction SilentlyContinue
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

  # --- F18: the 7-day window is its own gate ---------------------------------
  # The 5-hour window refills in hours, so crossing it is a pause. The 7-day
  # window does not, so crossing it ends the week's work - which is why it
  # fires at a lower threshold and adds a fourth step the other windows have no
  # use for: ask the user where to go next, with recommendations.
  Remove-Item "$flag", "$flag.weekly", "$flag.done", "$flag.weekly.done" -ErrorAction SilentlyContinue

  # A 5-hour spike must NOT fire the weekly order, even though it is the max.
  Probe (& $sl 98.2 12 40)
  if ((Get-Content "$flag.weekly" -Raw).Trim() -ne '12') { throw 'probe: weekly value not recorded' }
  $r = Gate $stop
  if ($r -notmatch '"decision":"block"') { throw 'gate: 5-hour spike did not fire at all' }
  if ($r -match 'AskUserQuestion') { throw 'gate: 5-hour spike fired the weekly order' }
  Remove-Item "$flag", "$flag.weekly", "$flag.done", "$flag.weekly.done" -ErrorAction SilentlyContinue

  # The weekly window alone, over 90 but under the 92 the other windows use.
  Probe (& $sl 40 91 55)
  if ((Get-Content "$flag.weekly" -Raw).Trim() -ne '91') { throw 'probe: weekly value not recorded' }
  # Same bare-bytes contract as the main flag - the sh twin reads it too (A12).
  $wb = [IO.File]::ReadAllBytes((Convert-Path "$flag.weekly"))
  if ($wb[0] -eq 0xEF) { throw 'probe: weekly flag has a UTF-8 BOM' }
  if ($wb -contains 0x0D -or $wb -contains 0x0A) { throw 'probe: weekly flag has a line ending' }
  $r = Gate $stop
  if ($r -notmatch '"decision":"block"') { throw 'gate: weekly 91% did not fire' }
  if ($r -notmatch '91') { throw 'gate: weekly block does not name the percentage' }
  if ($r -notmatch 'AskUserQuestion') { throw 'gate: weekly block has no step 4' }
  if ($r -notmatch 'recommend') { throw 'gate: step 4 does not ask for a recommendation' }
  Remove-Item "$flag", "$flag.weekly", "$flag.done", "$flag.weekly.done" -ErrorAction SilentlyContinue

  # Weekly under its own threshold and nothing else over: silence.
  Probe (& $sl 40 89 55)
  if (Gate $stop) { throw 'gate: weekly fired below 90' }
  Remove-Item "$flag", "$flag.weekly", "$flag.done", "$flag.weekly.done" -ErrorAction SilentlyContinue

  # F18/finding 4: the two gates fire at different times in one session. A
  # 5-hour spike at 10:00 must not eat the weekly order when the 7-day window
  # crosses at 14:00 - that later crossing is the one the user has to answer.
  Probe (& $sl 98.2 40 55)
  $r = Gate $stop
  if ($r -notmatch '"decision":"block"') { throw 'gate sequence: the 5-hour spike did not fire' }
  Probe (& $sl 98.2 91 55)
  $r = Gate $stop
  if ($r -notmatch 'AskUserQuestion') { throw 'gate sequence: the weekly order was eaten by the earlier .done' }
  Remove-Item "$flag", "$flag.weekly", "$flag.done", "$flag.weekly.done" -ErrorAction SilentlyContinue

  # F18 review: step 4 must come BEFORE "Then tell the user ... and stop.".
  # Appending it after put the stop instruction ahead of the one step whose
  # point is that the session must NOT stop on a summary. Asserting only that
  # the string is present, as the first version did, misses the ordering.
  Probe (& $sl 40 91 55)
  $r = Gate $stop
  $iAsk = $r.IndexOf('AskUserQuestion'); $iStop = $r.IndexOf('Then tell the user')
  if ($iAsk -lt 0 -or $iStop -lt 0) { throw 'gate: weekly order is missing a piece' }
  if ($iAsk -gt $iStop) { throw 'gate: step 4 comes after the stop instruction' }
  Remove-Item "$flag", "$flag.weekly", "$flag.done", "$flag.weekly.done" -ErrorAction SilentlyContinue

  # F18 review: a weekly flag with NO main flag beside it is reachable - it is
  # exactly what a probe that failed halfway leaves behind - and the gate used
  # to return before ever reading it, making the 7-day hard stop unreachable in
  # the one case it mattered most.
  [IO.File]::WriteAllText((Join-Path (Convert-Path (Split-Path $flag -Parent)) "$sid.weekly"), '91')
  $r = Gate $stop
  if ($r -notmatch 'AskUserQuestion') { throw 'gate: weekly-only flag did not fire' }
  Remove-Item "$flag", "$flag.weekly", "$flag.done", "$flag.weekly.done" -ErrorAction SilentlyContinue

  # A45/F18: `sort` is a name Windows steals. The sh probe used to pipe the
  # percentages through `sort -g`, which from a PowerShell parent resolves to
  # sort.exe, prints "The system cannot find the file specified", exits 0, and
  # writes the weekly flag with NO main flag. This block is that regression:
  # it drives the sh probe from here, which is a PowerShell process.
  if ($shExe) {
    $h = NewHome 'sh-probe-path'
    RunSh 'probe' $h (& $sl 98.2 12 55) | Out-Null
    $mf = Join-Path $h ".claude\handoff-watch\$sid"
    if (-not (Test-Path $mf)) { throw 'sh probe: no main flag (a stolen Windows binary ate the pipeline)' }
    if ((Get-Content $mf -Raw).Trim() -ne '98.2') { throw "sh probe: main flag is '$((Get-Content $mf -Raw).Trim())', wanted 98.2" }
  }

  # The sh twin has to agree - PLATFORMS.md requires the pair to move together.
  if ($shExe) {
    $h = NewHome 'weekly-sh'
    RunSh 'probe' $h (& $sl 40 91 55) | Out-Null
    $wf = Join-Path $h ".claude\handoff-watch\$sid.weekly"
    if (-not (Test-Path $wf)) { throw 'sh probe: no weekly flag' }
    if ((Get-Content $wf -Raw).Trim() -ne '91') { throw 'sh probe: weekly value wrong' }
    $r = RunSh 'gate' $h $stop
    if ($r -notmatch 'AskUserQuestion') { throw 'sh gate: weekly block has no step 4' }
  }

  # A12 regression, gate side: a BOM'd flag below threshold must not fire.
  Remove-Item "$flag", "$flag.weekly", "$flag.done", "$flag.weekly.done" -ErrorAction SilentlyContinue
  Set-Content $flag '12.0' -Encoding utf8
  if (Gate $stop) { throw 'gate: BOM flag fired below threshold (A12)' }
  if (Test-Path "$flag.done") { throw 'gate: BOM flag burned the one-shot (A12)' }
  Remove-Item "$flag", "$flag.weekly", "$flag.done", "$flag.weekly.done" -ErrorAction SilentlyContinue

  # --- check mode, against fixture HOMEs only --------------------------------
  # codex rollout below threshold: report, do not fire, leave no .done behind.
  $h = NewHome 'codex-low'; AddCodex $h 12.0 12000 200000
  $c = RunCheck $h
  if ($c -notmatch '^watch-cortana: codex 12(\.0)?% of 92% - ok$') { throw "check codex-low: got '$c'" }
  if (-not (NoDoneFiles $h)) { throw 'check codex-low: wrote a .done below threshold' }

  # codex rollout over threshold: fire once, then be silent (one-shot .done).
  $h = NewHome 'codex-high'; AddCodex $h 98.4 12000 200000
  $c = RunCheck $h
  if ($c -notmatch '^HANDOFF NOW \(codex 98\.4%\)') { throw "check codex-high: got '$c'" }
  if ($c -notmatch 'skillator:handoff-cortana') { throw 'check codex-high: no handoff order' }
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
  if ($c -notmatch '^watch-cortana: claude-code 12(\.0)?% of 92% - ok$') { throw "check cc-plain: got '$c'" }
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
  if ($c -notmatch '^watch-cortana: claude-code 91(\.0)?% of 92% - ok$') { throw "check cc-under: got '$c'" }
  if (-not (NoDoneFiles $h)) { throw 'check cc-under: wrote a .done just below threshold' }

  # F18/finding 1: a `.weekly` file is written AFTER the main flag, so it is
  # always the newest in the directory. Picking by mtime reported the 7-day
  # number as the max and compared it against the wrong threshold - a session
  # at 98.2% read "ok", on the hosts where `check` is the ONLY signal.
  $h = NewHome 'cc-weekly-shadow'; AddFlag $h 'sess-a' '98.2' | Out-Null; AddFlag $h 'sess-a.weekly' '12' | Out-Null
  $c = RunCheck $h
  if ($c -notmatch '^HANDOFF NOW \(claude-code 98\.2%\)') { throw "check cc-weekly-shadow: the weekly flag shadowed the max, got '$c'" }

  # F18/finding 2: the weekly gate has to exist on hosts with no Stop hook too.
  $h = NewHome 'cc-weekly'; AddFlag $h 'sess-a' '40' | Out-Null; AddFlag $h 'sess-a.weekly' '91' | Out-Null
  $c = RunCheck $h
  if ($c -notmatch 'HANDOFF NOW \(claude-code 7-day 91%\)') { throw "check cc-weekly: no weekly order, got '$c'" }
  if ($c -notmatch 'AskUserQuestion') { throw 'check cc-weekly: weekly order has no step 4' }

  $h = NewHome 'cc-weekly-under'; AddFlag $h 'sess-a' '40' | Out-Null; AddFlag $h 'sess-a.weekly' '89' | Out-Null
  $c = RunCheck $h
  if ($c -match 'HANDOFF NOW') { throw "check cc-weekly-under: fired below 90, got '$c'" }

  # A12 regression, check side: same number, written the old BOM+CRLF way.
  $h = NewHome 'cc-bom'; AddFlag $h 'sess-a' '12.0' -Bom | Out-Null
  $c = RunCheck $h
  if ($c -match 'HANDOFF NOW') { throw 'check cc-bom: BOM flag fired at 12% (A12)' }
  if (-not (NoDoneFiles $h)) { throw 'check cc-bom: BOM flag burned the one-shot (A12)' }

  # nothing on disk at all: say so, do not invent a number.
  $h = NewHome 'empty'
  $c = RunCheck $h
  if ($c -notmatch '^watch-cortana: no usage signal') { throw "check empty: got '$c'" }

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
    if ($c -notmatch '^watch-cortana: no usage signal') { throw "$($r.n) check a32-stale: got '$c'" }
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
    if ($c -notmatch '^watch-cortana: claude-code 12(\.0)?% of 92% - ok$') { throw "$($r.n) check a32-fallback: got '$c'" }

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
    if ($c -notmatch '^watch-cortana: codex 12\.0% of 92% - ok$') { throw "sh check codex-low: got '$c'" }
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
  Remove-Item "$flag", "$flag.weekly", "$flag.done", "$flag.weekly.done" -ErrorAction SilentlyContinue
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
