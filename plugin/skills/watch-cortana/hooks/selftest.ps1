# Runnable check for usage-watch.ps1 (and its sh twin, when sh is on PATH).
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File selftest.ps1
$ErrorActionPreference = 'Stop'
$ps  = Join-Path $PSScriptRoot 'usage-watch.ps1'
$sh  = Join-Path $PSScriptRoot 'usage-watch.sh'
$sid = "selftest-$PID"
# check-mode fixtures live here, never in the user's real HOME: `check` writes a
# genuine one-shot .done when it fires, so running it against the live
# ~/.codex/sessions would burn a real session's handoff (and be non-deterministic).
$tmp = Join-Path $PSScriptRoot ".watch-cortana-selftest-$PID"
# The probe/gate session's state dir is a temp one too (CLAUDE_USAGE_WATCH_DIR),
# never the live ~/.claude/handoff-watch: a probe writes up to four flags
# (.weekly, .fivehour, .ctx beside the main one), and a 98.2% flag there is
# what a concurrent chain's `level` would read as the newest session and hold.
$liveW = Join-Path $tmp 'watch'
$flag = Join-Path $liveW $sid
$noCodexHome = Join-Path $tmp 'no-codex-home'
$shExe = (Get-Command sh -ErrorAction SilentlyContinue)
# Every inherited selector/path is isolated and restored, including Codex's session id.
$envNames = @('HOME','USERPROFILE','CODEX_HOME','CODEX_THREAD_ID','CODEX_SESSION_ID','CLAUDE_CODE_SESSION_ID','CLAUDE_CONFIG_DIR','CLAUDE_USAGE_WATCH_DIR','SKILLATOR_CLI','SKILLATOR_PROFILE_DIR','AGY_CONFIG_DIR','MUSE_CONFIG_DIR','ANTIGRAVITY_APP_DATA_DIR','CURSOR_LEDGER_PATH','SKILLATOR_CONFIG_DIR','CLAUDE_USAGE_HANDOFF_PCT','CLAUDE_USAGE_HANDOFF_WEEKLY_PCT')
$savedEnv = @{}
foreach ($n in $envNames) { $savedEnv[$n] = [Environment]::GetEnvironmentVariable($n); [Environment]::SetEnvironmentVariable($n, $null) }
$env:HOME = $tmp; $env:USERPROFILE = $tmp
# A130: the state dir follows CLAUDE_CONFIG_DIR, and check/level read only the
# flag named by CLAUDE_CODE_SESSION_ID. Run inside Claude Code, both are
# inherited from the live session - every case below would then read (and
# `check` write a .done into) the real profile's handoff-watch. Cases that
# want them set them explicitly.
Remove-Item Env:CLAUDE_CONFIG_DIR, Env:CLAUDE_CODE_SESSION_ID -ErrorAction SilentlyContinue

# --- helpers ----------------------------------------------------------------
# A crashed script must fail the test: capture the output AND the exit code, so
# "produced no output" can never be mistaken for "correctly did not fire".
function Run($mode, $json) {
  $oW = $env:CLAUDE_USAGE_WATCH_DIR; $oC = $env:CODEX_HOME
  $env:CLAUDE_USAGE_WATCH_DIR = $liveW; $env:CODEX_HOME = $noCodexHome
  try {
    $out = if ($null -eq $json) { (& powershell -NoProfile -ExecutionPolicy Bypass -File $ps -Mode $mode) -join "`n" }
           else { ($json | & powershell -NoProfile -ExecutionPolicy Bypass -File $ps -Mode $mode) -join "`n" }
  } finally { $env:CLAUDE_USAGE_WATCH_DIR = $oW; $env:CODEX_HOME = $oC }
  if ($LASTEXITCODE -ne 0) { throw "ps $mode`: exit $LASTEXITCODE, output '$out'" }
  $out
}
function Probe($json) { Run 'probe' $json | Out-Null }
function Gate($json)  { Run 'gate'  $json }

function RunSh($mode, $hm, $json) {
  $posix = ($hm -replace '\\', '/')
  $old = $env:HOME; $env:HOME = $posix
  $oW = $env:CLAUDE_USAGE_WATCH_DIR; $oC = $env:CODEX_HOME
  Remove-Item Env:CLAUDE_USAGE_WATCH_DIR, Env:CODEX_HOME -ErrorAction SilentlyContinue
  try {
    $out = if ($null -eq $json) { (& $shExe.Source $sh $mode) -join "`n" }
           else { ($json | & $shExe.Source $sh $mode) -join "`n" }
  } finally { $env:HOME = $old; $env:CLAUDE_USAGE_WATCH_DIR = $oW; $env:CODEX_HOME = $oC }
  if ($LASTEXITCODE -ne 0) { throw "sh $mode`: exit $LASTEXITCODE, output '$out'" }
  $out
}
# $HOME in a child PowerShell follows USERPROFILE on Windows.
function RunCheck($hm) {
  $oldU = $env:USERPROFILE; $oldH = $env:HOME
  $oW = $env:CLAUDE_USAGE_WATCH_DIR; $oC = $env:CODEX_HOME
  $env:USERPROFILE = $hm; $env:HOME = $hm
  Remove-Item Env:CLAUDE_USAGE_WATCH_DIR, Env:CODEX_HOME -ErrorAction SilentlyContinue
  try { $out = (& powershell -NoProfile -ExecutionPolicy Bypass -File $ps -Mode check) -join "`n" }
  finally { $env:USERPROFILE = $oldU; $env:HOME = $oldH; $env:CLAUDE_USAGE_WATCH_DIR = $oW; $env:CODEX_HOME = $oC }
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
# A99: $windowMinutes tags the primary window (10080 = weekly); -NoSecondary
# drops the secondary window entirely, leaving a single used_percent (the ps1
# scalar `+=` bug, A83).
function AddCodex($hm, $usedPercent, $ctxTokens, $ctxWindow, $ageHours = 0, $sub = '.codex\sessions\2026\09\04', $windowMinutes = $null, [switch]$NoSecondary) {
  $d = Join-Path $hm $sub
  New-Item $d -ItemType Directory -Force | Out-Null
  $primary = if ($windowMinutes) { "`"primary`":{`"used_percent`":$usedPercent,`"window_minutes`":$windowMinutes}" }
             else { "`"primary`":{`"used_percent`":$usedPercent}" }
  $secondary = if ($NoSecondary) { '' } else { ',"secondary":{"used_percent":1.0}' }
  $line = '{"type":"event_msg","payload":{"type":"token_count","info":' +
          '{"total_token_usage":{"total_tokens":9999999},' +
          "`"last_token_usage`":{`"total_tokens`":$ctxTokens}," +
          "`"model_context_window`":$ctxWindow}," +
          "`"rate_limits`":{$primary$secondary}}}"
  $p = [IO.Path]::Combine((Convert-Path $d), 'rollout-test.jsonl')
  [IO.File]::WriteAllText($p, "$line`n")
  if ($ageHours) { (Get-Item $p).LastWriteTime = (Get-Date).AddHours(-$ageHours) }
  $p
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

Remove-Item "$flag", "$flag.*" -ErrorAction SilentlyContinue

# The runtime state dir is storage, not a skill reference, and must survive a
# skill rename: a session that already fired wrote its .done under the old path
# and would fire a SECOND time if the dir moved. A rename sweep has already
# moved it once, taking these selftest paths with it, so the test agreed with
# the regression instead of catching it. Assert the literal path.
foreach ($f in @($ps, $sh)) {
  if (-not (Select-String -Path $f -Pattern 'handoff-watch' -Quiet)) {
    throw "state dir moved in $(Split-Path $f -Leaf) - it must stay ~/.claude/handoff-watch"
  }
}

try {
  # Fixture copies stub only refresh; no test may launch a live quota CLI.
  New-Item $tmp -ItemType Directory -Force | Out-Null
  $psSource = [IO.File]::ReadAllText($ps); $shSource = [IO.File]::ReadAllText($sh)
  $ps = Join-Path $tmp 'usage-watch.ps1'; $sh = Join-Path $tmp 'usage-watch.sh'
  [IO.File]::WriteAllText($ps, $psSource.Replace('# level (F31)', "function Start-QuotaRefresh { }`n# level (F31)"), (New-Object Text.UTF8Encoding $false))
  [IO.File]::WriteAllText($sh, $shSource.Replace('# level (F31)', "start_quota_refresh() { :; }`n# level (F31)"), (New-Object Text.UTF8Encoding $false))
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
  Remove-Item "$flag", "$flag.*" -ErrorAction SilentlyContinue
  # F31 review 3: a clear takes every flag the probe wrote (.fivehour and .ctx
  # too), and the flags were never in the live ~/.claude/handoff-watch.
  $left = @(Get-ChildItem (Split-Path $flag -Parent) -File -Filter "$sid*" -ErrorAction SilentlyContinue)
  if ($left) { throw "selftest: a clear left $($left.Name -join ', ') behind" }
  if ((Split-Path $flag -Parent) -eq (Join-Path $HOME '.claude\handoff-watch')) { throw 'selftest: probe/gate run against the live ~/.claude/handoff-watch' }

  # A 5-hour spike must NOT fire the weekly order, even though it is the max.
  Probe (& $sl 98.2 12 40)
  if ((Get-Content "$flag.weekly" -Raw).Trim() -ne '12') { throw 'probe: weekly value not recorded' }
  $r = Gate $stop
  if ($r -notmatch '"decision":"block"') { throw 'gate: 5-hour spike did not fire at all' }
  if ($r -match 'AskUserQuestion') { throw 'gate: 5-hour spike fired the weekly order' }
  Remove-Item "$flag", "$flag.*" -ErrorAction SilentlyContinue

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
  Remove-Item "$flag", "$flag.*" -ErrorAction SilentlyContinue

  # Weekly under its own threshold and nothing else over: silence.
  Probe (& $sl 40 89 55)
  if (Gate $stop) { throw 'gate: weekly fired below 90' }
  Remove-Item "$flag", "$flag.*" -ErrorAction SilentlyContinue

  # F18/finding 4: the two gates fire at different times in one session. A
  # 5-hour spike at 10:00 must not eat the weekly order when the 7-day window
  # crosses at 14:00 - that later crossing is the one the user has to answer.
  Probe (& $sl 98.2 40 55)
  $r = Gate $stop
  if ($r -notmatch '"decision":"block"') { throw 'gate sequence: the 5-hour spike did not fire' }
  Probe (& $sl 98.2 91 55)
  $r = Gate $stop
  if ($r -notmatch 'AskUserQuestion') { throw 'gate sequence: the weekly order was eaten by the earlier .done' }
  Remove-Item "$flag", "$flag.*" -ErrorAction SilentlyContinue

  # F18 review: step 4 must come BEFORE "Then tell the user ... and stop.".
  # Appending it after put the stop instruction ahead of the one step whose
  # point is that the session must NOT stop on a summary. Asserting only that
  # the string is present, as the first version did, misses the ordering.
  Probe (& $sl 40 91 55)
  $r = Gate $stop
  $iAsk = $r.IndexOf('AskUserQuestion'); $iStop = $r.IndexOf('Then tell the user')
  if ($iAsk -lt 0 -or $iStop -lt 0) { throw 'gate: weekly order is missing a piece' }
  if ($iAsk -gt $iStop) { throw 'gate: step 4 comes after the stop instruction' }
  Remove-Item "$flag", "$flag.*" -ErrorAction SilentlyContinue

  # F18 review: a weekly flag with NO main flag beside it is reachable - it is
  # exactly what a probe that failed halfway leaves behind - and the gate used
  # to return before ever reading it, making the 7-day hard stop unreachable in
  # the one case it mattered most.
  [IO.File]::WriteAllText((Join-Path (Convert-Path (Split-Path $flag -Parent)) "$sid.weekly"), '91')
  $r = Gate $stop
  if ($r -notmatch 'AskUserQuestion') { throw 'gate: weekly-only flag did not fire' }
  Remove-Item "$flag", "$flag.*" -ErrorAction SilentlyContinue

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
  Remove-Item "$flag", "$flag.*" -ErrorAction SilentlyContinue
  Set-Content $flag '12.0' -Encoding utf8
  if (Gate $stop) { throw 'gate: BOM flag fired below threshold (A12)' }
  if (Test-Path "$flag.done") { throw 'gate: BOM flag burned the one-shot (A12)' }
  Remove-Item "$flag", "$flag.*" -ErrorAction SilentlyContinue

  # --- check mode, against fixture HOMEs only --------------------------------
  # codex rollout below threshold: report, do not fire, leave no .done behind.
  $h = NewHome 'codex-low'; AddCodex $h 12.0 12000 200000 | Out-Null
  $c = RunCheck $h
  if ($c -notmatch '^watch-cortana: codex 12(\.0)?% of 92% - ok$') { throw "check codex-low: got '$c'" }
  if (-not (NoDoneFiles $h)) { throw 'check codex-low: wrote a .done below threshold' }

  # codex rollout over threshold: fire once, then be silent (one-shot .done).
  $h = NewHome 'codex-high'; AddCodex $h 98.4 12000 200000 | Out-Null
  $c = RunCheck $h
  if ($c -notmatch '^HANDOFF NOW \(codex 98\.4%\)') { throw "check codex-high: got '$c'" }
  if ($c -notmatch 'skillator:handoff-cortana') { throw 'check codex-high: no handoff order' }
  if (NoDoneFiles $h) { throw 'check codex-high: no one-shot .done written' }
  $c = RunCheck $h
  if ($c -match 'HANDOFF NOW') { throw 'check codex-high: fired twice' }

  # context-window fallback: no used_percent worth reading, 170k/200k = 85%.
  $h = NewHome 'codex-ctx'; AddCodex $h 1.0 170000 200000 | Out-Null
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

  # A101: a `.weekly` flag with NO main flag beside it (the state a broken
  # probe leaves, and the one the gate already handles) used to read "no usage
  # signal" here, so the 7-day order never fired on the check-only hosts.
  $h = NewHome 'cc-weekly-only'; AddFlag $h 'sess-a.weekly' '91' | Out-Null
  $c = RunCheck $h
  if ($c -notmatch 'HANDOFF NOW \(claude-code 7-day 91%\)') { throw "check cc-weekly-only: no weekly order, got '$c'" }
  if ($c -notmatch 'AskUserQuestion') { throw 'check cc-weekly-only: weekly order has no step 4' }
  if (-not (Test-Path (Join-Path $h '.claude\handoff-watch\sess-a.weekly.done'))) { throw 'check cc-weekly-only: one-shot is not keyed sess-a.weekly.done' }
  $c = RunCheck $h
  if ($c -match 'HANDOFF NOW') { throw 'check cc-weekly-only: fired twice' }

  $h = NewHome 'cc-weekly-only-under'; AddFlag $h 'sess-a.weekly' '50' | Out-Null
  $c = RunCheck $h
  if ($c -notmatch '^watch-cortana: claude-code 50(\.0)?% of 92% - ok$') { throw "check cc-weekly-only-under: got '$c'" }
  if (-not (NoDoneFiles $h)) { throw 'check cc-weekly-only-under: wrote a .done below threshold' }

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
    $h = NewHome "a32-stale-$($r.n)"; AddCodex $h 98.4 12000 200000 168 | Out-Null
    $c = & $r.f $h
    if ($c -match 'HANDOFF NOW') { throw "$($r.n) check: fired on a 7-day-old rollout at 98% (A32), got '$c'" }
    if ($c -notmatch '^watch-cortana: no usage signal') { throw "$($r.n) check a32-stale: got '$c'" }
    if (-not (NoDoneFiles $h)) { throw "$($r.n) check: stale rollout burned the one-shot (A32)" }

    # Just outside the 3h window - the boundary, not just the obvious week.
    $h = NewHome "a32-edge-$($r.n)"; AddCodex $h 98.4 12000 200000 4 | Out-Null
    $c = & $r.f $h
    if ($c -match 'HANDOFF NOW') { throw "$($r.n) check: fired on a 4h-old rollout (A32), got '$c'" }

    # ...and inside it, so the window cannot be "fixed" by ignoring codex.
    $h = NewHome "a32-fresh-$($r.n)"; AddCodex $h 98.4 12000 200000 1 | Out-Null
    $c = & $r.f $h
    if ($c -notmatch '^HANDOFF NOW \(codex 98\.4%\)') { throw "$($r.n) check: 1h-old rollout did not fire (A32), got '$c'" }

    # A stale rollout must not mask a live claude-code flag either.
    $h = NewHome "a32-fallback-$($r.n)"; AddCodex $h 98.4 12000 200000 168 | Out-Null
    AddFlag $h 'sess-a' '12.0' | Out-Null
    $c = & $r.f $h
    if ($c -notmatch '^watch-cortana: claude-code 12(\.0)?% of 92% - ok$') { throw "$($r.n) check a32-fallback: got '$c'" }

    # Recursion: the rollout is one level deeper than the old */*/*/ glob.
    $h = NewHome "a32-deep-$($r.n)"
    AddCodex $h 98.4 12000 200000 0 '.codex\sessions\2026\09\04\rollouts' | Out-Null
    $c = & $r.f $h
    if ($c -notmatch '^HANDOFF NOW \(codex 98\.4%\)') { throw "$($r.n) check: missed a nested rollout (A32), got '$c'" }
  }

  # --- the sh twin must agree, where sh exists -------------------------------
  if ($shExe) {
    $h = NewHome 'sh-codex-low'; AddCodex $h 12.0 12000 200000 | Out-Null
    $c = RunSh 'check' $h $null
    if ($c -notmatch '^watch-cortana: codex 12\.0% of 92% - ok$') { throw "sh check codex-low: got '$c'" }
    if (-not (NoDoneFiles $h)) { throw 'sh check codex-low: wrote a .done below threshold' }

    $h = NewHome 'sh-codex-high'; AddCodex $h 98.4 12000 200000 | Out-Null
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

  # --- A98/A99: codex Stop stdin, gate reads the rollout named by transcript_path
  New-Item $tmp -ItemType Directory -Force | Out-Null
  $sidCx  = "selftest-a99-$PID"
  $flagCx = Join-Path $liveW $sidCx
  function CxStop($tp) {
    if (-not $tp) { return "{`"session_id`":`"$sidCx`",`"stop_hook_active`":false}" }
    $tpEsc = $tp.Replace('\', '\\')   # raw JSON bytes: one path separator -> two backslash chars
    "{`"session_id`":`"$sidCx`",`"transcript_path`":`"$tpEsc`",`"stop_hook_active`":false}"
  }
  function ClearCx { Remove-Item "$flagCx*" -ErrorAction SilentlyContinue }

  # 1. transcript_path is a rollout -> gate reads it (no window_minutes: the
  #    ordinary 92% gate applies).
  ClearCx
  $rp1 = AddCodex $tmp 95.0 12000 200000 0 'a99-read'
  $r = Gate (CxStop $rp1)
  if ($r -notmatch '"decision":"block"' -or $r -notmatch '95') { throw "gate: did not read codex rollout via transcript_path, got '$r'" }
  ClearCx

  # 2. transcript_path NOT named rollout-*.jsonl -> ignored, even though the
  #    file content alone would fire.
  $notRollDir = Join-Path $tmp 'a99-notroll'
  New-Item $notRollDir -ItemType Directory -Force | Out-Null
  $notRoll = Join-Path $notRollDir 'session-notroll.jsonl'
  Copy-Item $rp1 $notRoll -Force
  $r = Gate (CxStop $notRoll)
  if ($r) { throw "gate: fired on a transcript_path that is not rollout-*.jsonl, got '$r'" }
  ClearCx

  # 3. single used_percent value (the ps1 scalar `+=` bug, A83): only a primary
  #    window, no secondary. max(50, 45) = 50, under 92 - the buggy scalar sum
  #    (50+45=95) would fire.
  $rp3 = AddCodex $tmp 50.0 90000 200000 0 'a99-scalar' $null -NoSecondary
  $r = Gate (CxStop $rp3)
  if ($r) { throw "gate: single used_percent scalar bug regressed (50+45 would fire), got '$r'" }
  ClearCx

  # 4. 10080-minute window at 91% -> the weekly gate fires (A98).
  $rp4 = AddCodex $tmp 91.0 12000 200000 0 'a99-weekly' 10080
  $r = Gate (CxStop $rp4)
  if ($r -notmatch '"decision":"block"' -or $r -notmatch 'AskUserQuestion') { throw "gate: codex 10080-minute window at 91% did not fire the weekly order, got '$r'" }
  ClearCx

  # 5. 300-minute window at 91% -> silent (below the 92% ordinary threshold).
  $rp5 = AddCodex $tmp 91.0 12000 200000 0 'a99-session' 300
  $r = Gate (CxStop $rp5)
  if ($r) { throw "gate: codex 300-minute window at 91% fired (should need 92%), got '$r'" }
  ClearCx

  # The sh twin must agree on all five.
  if ($shExe) {
    $hSh = NewHome 'a99-sh'
    $flagCxSh = Join-Path $hSh ".claude\handoff-watch\$sidCx"
    function ClearCxSh { Remove-Item "$flagCxSh*" -ErrorAction SilentlyContinue }

    $g = RunSh 'gate' $hSh (CxStop $rp1)
    if ($g -notmatch '"decision":"block"' -or $g -notmatch '95') { throw "sh gate: did not read codex rollout via transcript_path, got '$g'" }
    ClearCxSh

    $g = RunSh 'gate' $hSh (CxStop $notRoll)
    if ($g) { throw "sh gate: fired on a transcript_path that is not rollout-*.jsonl, got '$g'" }
    ClearCxSh

    $g = RunSh 'gate' $hSh (CxStop $rp3)
    if ($g) { throw "sh gate: single used_percent scalar bug regressed, got '$g'" }
    ClearCxSh

    $g = RunSh 'gate' $hSh (CxStop $rp4)
    if ($g -notmatch '"decision":"block"' -or $g -notmatch 'AskUserQuestion') { throw "sh gate: codex 10080-minute window at 91% did not fire the weekly order, got '$g'" }
    ClearCxSh

    $g = RunSh 'gate' $hSh (CxStop $rp5)
    if ($g) { throw "sh gate: codex 300-minute window at 91% fired (should need 92%), got '$g'" }
    ClearCxSh
  }

  # --- F31: `level` and CLAUDE_USAGE_WATCH_DIR, on BOTH twins ----------------
  # `level` is what relay-morpheus's chain hold reads, so it must separate the
  # 5-hour window from the context (a full context is not a quota), say `none`
  # rather than 0 when there is nothing, and never write a thing. The override
  # dir is how every test here, and the chain fixtures, stay off the live
  # ~/.claude/handoff-watch.
  function RunW($tw, $mode, $wdir, $codexHome, $json) {
    $oW = $env:CLAUDE_USAGE_WATCH_DIR; $oC = $env:CODEX_HOME
    $oCli = $env:SKILLATOR_CLI
    $env:SKILLATOR_CLI = if (Test-Path $codexHome) { 'codex' } else { 'claude' }
    $env:CLAUDE_USAGE_WATCH_DIR = $wdir.Replace('\', '/'); $env:CODEX_HOME = $codexHome.Replace('\', '/')
    try {
      if ($tw -eq 'sh') {
        $out = if ($null -eq $json) { (& $shExe.Source $sh $mode) -join "`n" } else { ($json | & $shExe.Source $sh $mode) -join "`n" }
      } else {
        $out = if ($null -eq $json) { (& powershell -NoProfile -ExecutionPolicy Bypass -File $ps -Mode $mode) -join "`n" }
               else { ($json | & powershell -NoProfile -ExecutionPolicy Bypass -File $ps -Mode $mode) -join "`n" }
      }
    } finally { $env:CLAUDE_USAGE_WATCH_DIR = $oW; $env:CODEX_HOME = $oC; $env:SKILLATOR_CLI = $oCli }
    if ($LASTEXITCODE -ne 0) { throw "$tw $mode`: exit $LASTEXITCODE, output '$out'" }
    $out
  }
  # The real statusline shape (code.claude.com/docs/en/statusline, 2026-10-10):
  # rate_limits.five_hour / seven_day, context_window with a nested object.
  $slw = { param($s, $a, $b, $c) "{`"session_id`":`"$s`",`"rate_limits`":{`"five_hour`":{`"used_percentage`":$a,`"resets_at`":1738425600},`"seven_day`":{`"used_percentage`":$b,`"resets_at`":1738857600}},`"context_window`":{`"context_window_size`":200000,`"used_percentage`":$c,`"current_usage`":{`"input_tokens`":8500}}}" }
  $noCodex = Join-Path $tmp 'f31-no-codex'
  $twins = @('ps'); if ($shExe) { $twins += 'sh' }
  foreach ($tw in $twins) {
    # Nothing anywhere: src=none, and the dir is NOT created.
    $w = Join-Path $tmp "f31-none-$tw"
    $l = RunW $tw 'level' $w $noCodex $null
    if ($l -ne 'src=none 5h=- 7d=- ctx=- max=-') { throw "$tw level none: got '$l'" }
    if (Test-Path $w) { throw "$tw level: created the state dir" }

    # Probe through the override dir, then level separates 5h (78) from ctx (88).
    $w = Join-Path $tmp "f31-cc-$tw"
    RunW $tw 'probe' $w $noCodex (& $slw 'sess-f31' 78 40.5 88) | Out-Null
    if (-not (Test-Path (Join-Path $w 'sess-f31'))) { throw "$tw probe: CLAUDE_USAGE_WATCH_DIR not honoured" }
    if ((Get-Content (Join-Path $w 'sess-f31.fivehour') -Raw).Trim() -ne '78') { throw "$tw probe: .fivehour not the five_hour value" }
    $l = RunW $tw 'level' $w $noCodex $null
    if ($l -ne 'src=claude-code 5h=78 7d=40.5 ctx=88 max=88') { throw "$tw level cc: got '$l'" }
    # F31 review 3: the statusline rewrites .fivehour on every render; one
    # older than the codex freshness window (3h) is a dead or idle session's,
    # and holding on it never releases. 5h goes '-', the rest stays.
    (Get-Item (Join-Path $w 'sess-f31.fivehour')).LastWriteTime = (Get-Date).AddHours(-4)
    $l = RunW $tw 'level' $w $noCodex $null
    if ($l -ne 'src=claude-code 5h=- 7d=40.5 ctx=88 max=88') { throw "$tw level: a 4h-old .fivehour was read as live, got '$l'" }
    (Get-Item (Join-Path $w 'sess-f31.fivehour')).LastWriteTime = (Get-Date).AddHours(-2)
    $l = RunW $tw 'level' $w $noCodex $null
    if ($l -ne 'src=claude-code 5h=78 7d=40.5 ctx=88 max=88') { throw "$tw level: a 2h-old .fivehour was dropped, got '$l'" }
    if (Get-ChildItem $w -Filter '*.done') { throw "$tw level: wrote a .done" }

    # check must still pick the MAIN flag: .ctx is written last, so a pick by
    # mtime alone would read the context (10) instead of the max (98).
    $w = Join-Path $tmp "f31-shadow-$tw"
    RunW $tw 'probe' $w $noCodex (& $slw 'sess-f31' 98 40 10) | Out-Null
    $c = RunW $tw 'check' $w $noCodex $null
    if ($c -notmatch '^HANDOFF NOW \(claude-code 98%\)') { throw "$tw check: a .fivehour/.ctx flag shadowed the max, got '$c'" }
    if (-not (Test-Path (Join-Path $w 'sess-f31.done'))) { throw "$tw check: CLAUDE_USAGE_WATCH_DIR not honoured for .done" }
    $l = RunW $tw 'level' $w $noCodex $null
    if ($l -ne 'src=claude-code 5h=98 7d=40 ctx=10 max=98') { throw "$tw level after check: got '$l'" }

    # gate reads the override dir too.
    $w = Join-Path $tmp "f31-gate-$tw"
    RunW $tw 'probe' $w $noCodex (& $slw 'sess-g' 97 40 10) | Out-Null
    $g = RunW $tw 'gate' $w $noCodex '{"session_id":"sess-g","stop_hook_active":false}'
    if ($g -notmatch '"decision":"block"') { throw "$tw gate: CLAUDE_USAGE_WATCH_DIR not honoured, got '$g'" }

    # A payload with no rate_limits (API-key user): no .fivehour, and a stale
    # one from the previous payload is removed - 5h=- , the caller uses max.
    RunW $tw 'probe' $w $noCodex '{"session_id":"sess-g","context_window":{"used_percentage":30}}' | Out-Null
    if (Test-Path (Join-Path $w 'sess-g.fivehour')) { throw "$tw probe: stale .fivehour outlived its payload" }
    $l = RunW $tw 'level' $w $noCodex $null
    if ($l -ne 'src=claude-code 5h=- 7d=- ctx=30 max=30') { throw "$tw level no-rate-limits: got '$l'" }

    # codex: 5h is the max non-10080 window WITHOUT the context ratio (90%).
    $hc = NewHome "f31-codex-$tw"
    $line = '{"type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"total_tokens":180000},"model_context_window":200000},"rate_limits":{"primary":{"used_percent":12.0,"window_minutes":300},"secondary":{"used_percent":45,"window_minutes":10080}}}}'
    $cd = Join-Path $hc '.codex\sessions\2026\10\10'; New-Item $cd -ItemType Directory -Force | Out-Null
    [IO.File]::WriteAllText([IO.Path]::Combine((Convert-Path $cd), 'rollout-f31.jsonl'), "$line`n")
    $l = RunW $tw 'level' (Join-Path $tmp "f31-cx-$tw") (Join-Path $hc '.codex') $null
    if ($l -ne 'src=codex 5h=12.0 7d=45.0 ctx=90.0 max=90.0') { throw "$tw level codex: got '$l'" }
    if (Test-Path (Join-Path $tmp "f31-cx-$tw")) { throw "$tw level codex: created the state dir" }
  }

  # --- A130: CLAUDE_CONFIG_DIR, this session's flag only, nothing stale ------
  # Found 2026-10-18: a session run with CLAUDE_CONFIG_DIR=~/.claude-vidul had
  # `check` report ANOTHER session's 3-day-old 55% from ~/.claude/handoff-watch
  # as current, and relay's chain hold decided on the same `level` line.
  # Resolution order (same as the probe): CLAUDE_USAGE_WATCH_DIR, else
  # $CLAUDE_CONFIG_DIR/handoff-watch, else ~/.claude/handoff-watch. A reading
  # is this session's when its flag is named CLAUDE_CODE_SESSION_ID (when
  # set), and current only inside the 3h freshness window.
  function RunA130($tw, $mode, $hm, $cfg, $sessId, $wdir, $json) {
    $keep = @{}; foreach ($n in 'HOME', 'USERPROFILE', 'CLAUDE_USAGE_WATCH_DIR', 'CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_SESSION_ID', 'CODEX_HOME') { $keep[$n] = [Environment]::GetEnvironmentVariable($n) }
    try {
      $env:USERPROFILE = $hm; $env:HOME = if ($tw -eq 'sh') { $hm -replace '\\', '/' } else { $hm }
      $env:CODEX_HOME = Join-Path $tmp 'a130-no-codex'
      foreach ($p in @(@('CLAUDE_CONFIG_DIR', $cfg), @('CLAUDE_CODE_SESSION_ID', $sessId), @('CLAUDE_USAGE_WATCH_DIR', $wdir))) {
        [Environment]::SetEnvironmentVariable($p[0], $(if ($p[1]) { $p[1] } else { $null }))
      }
      if ($tw -eq 'sh') {
        $out = if ($null -eq $json) { (& $shExe.Source $sh $mode) -join "`n" } else { ($json | & $shExe.Source $sh $mode) -join "`n" }
      } else {
        $out = if ($null -eq $json) { (& powershell -NoProfile -ExecutionPolicy Bypass -File $ps -Mode $mode) -join "`n" }
               else { ($json | & powershell -NoProfile -ExecutionPolicy Bypass -File $ps -Mode $mode) -join "`n" }
      }
    } finally { foreach ($n in $keep.Keys) { [Environment]::SetEnvironmentVariable($n, $keep[$n]) } }
    if ($LASTEXITCODE -ne 0) { throw "$tw $mode`: exit $LASTEXITCODE, output '$out'" }
    $out
  }
  # A flag file in $d, written $ageHours ago.
  function PutFlag($d, $name, $value, $ageHours = 0) {
    New-Item $d -ItemType Directory -Force | Out-Null
    $p = [IO.Path]::Combine((Convert-Path $d), $name)
    [IO.File]::WriteAllText($p, $value)
    if ($ageHours) { (Get-Item -LiteralPath $p).LastWriteTime = (Get-Date).AddHours(-$ageHours) }
  }
  foreach ($tw in $twins) {
    # 1. The ticket's case: HOME's dir holds another session's 3-day-old 55%,
    #    the profile has nothing for the live session. Neither is current.
    $hm = NewHome "a130-repro-$tw"; $cfg = Join-Path $tmp "a130-repro-cfg-$tw"
    New-Item $cfg -ItemType Directory -Force | Out-Null
    $hw = Join-Path $hm '.claude\handoff-watch'
    PutFlag $hw 'old-sess' '55' 72; PutFlag $hw 'old-sess.weekly' '95' 72; PutFlag $hw 'old-sess.fivehour' '40' 72
    $c = RunA130 $tw 'check' $hm $cfg 'live-sess' $null $null
    if ($c -notmatch '^watch-cortana: no usage signal') { throw "$tw check a130: another session's 3-day-old reading reported as current, got '$c'" }
    if (-not (NoDoneFiles $hm)) { throw "$tw check a130: burned a one-shot on another session's reading" }
    $l = RunA130 $tw 'level' $hm $cfg 'live-sess' $null $null
    if ($l -ne 'src=none 5h=- 7d=- ctx=- max=-') { throw "$tw level a130: another session's 3-day-old reading reported as current, got '$l'" }

    # 2. The profile's dir is the one read, for this session's own flags.
    PutFlag (Join-Path $cfg 'handoff-watch') 'live-sess' '30'; PutFlag (Join-Path $cfg 'handoff-watch') 'live-sess.weekly' '20'
    PutFlag (Join-Path $cfg 'handoff-watch') 'live-sess.fivehour' '30'
    $c = RunA130 $tw 'check' $hm $cfg 'live-sess' $null $null
    if ($c -notmatch '^watch-cortana: claude-code 30(\.0)?% of 92% - ok$') { throw "$tw check a130: CLAUDE_CONFIG_DIR not honoured, got '$c'" }
    $l = RunA130 $tw 'level' $hm $cfg 'live-sess' $null $null
    if ($l -ne 'src=claude-code 5h=30 7d=20 ctx=- max=30') { throw "$tw level a130: CLAUDE_CONFIG_DIR not honoured, got '$l'" }

    # 3. The probe writes where the readers read.
    $cfgP = Join-Path $tmp "a130-probe-cfg-$tw"
    RunA130 $tw 'probe' $hm $cfgP $null $null (& $slw 'sess-p' 61 20 10) | Out-Null
    if (-not (Test-Path (Join-Path $cfgP 'handoff-watch\sess-p'))) { throw "$tw probe a130: did not write under CLAUDE_CONFIG_DIR" }
    if (Test-Path (Join-Path $hw 'sess-p')) { throw "$tw probe a130: wrote under HOME despite CLAUDE_CONFIG_DIR" }

    # 4. A fresh flag from ANOTHER session in the same dir is not this one's.
    $cfg4 = Join-Path $tmp "a130-other-cfg-$tw"
    PutFlag (Join-Path $cfg4 'handoff-watch') 'other-sess' '97'; PutFlag (Join-Path $cfg4 'handoff-watch') 'other-sess.fivehour' '97'
    $c = RunA130 $tw 'check' $hm $cfg4 'live-sess' $null $null
    if ($c -match 'HANDOFF NOW' -or $c -notmatch '^watch-cortana: no usage signal') { throw "$tw check a130: read another session's flag, got '$c'" }
    if (Get-ChildItem (Join-Path $cfg4 'handoff-watch') -Filter '*.done') { throw "$tw check a130: burned another session's one-shot" }
    $l = RunA130 $tw 'level' $hm $cfg4 'live-sess' $null $null
    if ($l -ne 'src=none 5h=- 7d=- ctx=- max=-') { throw "$tw level a130: read another session's flag, got '$l'" }

    # 5. No session id (a non-Claude host): the newest flag, but only if fresh.
    $cfg5 = Join-Path $tmp "a130-stale-cfg-$tw"
    PutFlag (Join-Path $cfg5 'handoff-watch') 'any-sess' '97' 4; PutFlag (Join-Path $cfg5 'handoff-watch') 'any-sess.weekly' '95' 4
    $c = RunA130 $tw 'check' $hm $cfg5 $null $null $null
    if ($c -notmatch '^watch-cortana: no usage signal') { throw "$tw check a130: a 4h-old flag reported as current, got '$c'" }
    $l = RunA130 $tw 'level' $hm $cfg5 $null $null $null
    if ($l -ne 'src=none 5h=- 7d=- ctx=- max=-') { throw "$tw level a130: a 4h-old flag reported as current, got '$l'" }
    # ...and the same flags 2h old are inside the window.
    PutFlag (Join-Path $cfg5 'handoff-watch') 'any-sess' '50' 2; PutFlag (Join-Path $cfg5 'handoff-watch') 'any-sess.weekly' '40' 2
    $c = RunA130 $tw 'check' $hm $cfg5 $null $null $null
    if ($c -notmatch '^watch-cortana: claude-code 50(\.0)?% of 92% - ok$') { throw "$tw check a130: a 2h-old flag was dropped, got '$c'" }
    $l = RunA130 $tw 'level' $hm $cfg5 $null $null $null
    if ($l -ne 'src=claude-code 5h=- 7d=40 ctx=- max=50') { throw "$tw level a130: a 2h-old flag was dropped, got '$l'" }

    # 6. This session's own flags gone stale are not current either.
    $cfg6 = Join-Path $tmp "a130-ownstale-cfg-$tw"
    PutFlag (Join-Path $cfg6 'handoff-watch') 'live-sess' '97' 4; PutFlag (Join-Path $cfg6 'handoff-watch') 'live-sess.weekly' '95' 4
    $l = RunA130 $tw 'level' $hm $cfg6 'live-sess' $null $null
    if ($l -ne 'src=none 5h=- 7d=- ctx=- max=-') { throw "$tw level a130: this session's 4h-old flag reported as current, got '$l'" }

    # 7. CLAUDE_USAGE_WATCH_DIR still beats CLAUDE_CONFIG_DIR.
    $w7 = Join-Path $tmp "a130-override-$tw"
    PutFlag $w7 'live-sess' '44'
    $l = RunA130 $tw 'level' $hm $cfg 'live-sess' $w7 $null
    if ($l -ne 'src=claude-code 5h=- 7d=- ctx=- max=44') { throw "$tw level a130: CLAUDE_USAGE_WATCH_DIR did not win, got '$l'" }
  }

  'ok'
}
finally {
  foreach ($n in $envNames) { [Environment]::SetEnvironmentVariable($n, $savedEnv[$n]) }
  # try/finally, not a trailing line: a failing assertion must still clean up.
  Remove-Item "$flag", "$flag.*" -ErrorAction SilentlyContinue
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
