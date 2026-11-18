# skillator plugin, self-update (F181). Mirror of self-update.sh - same rules,
# same state file, same output lines. hooks.json runs the sh twin.
#   -Mode check      prints `up to date <v>` | `newer <old> -> <new>` |
#                    `skipped: <why>` | `offline` | `failed: <what>`
#   -Mode run        check, then update when newer; records the result
#   -Mode due-run    prints a pending notice (once), then - only when the last check is
#                    older than SKILLATOR_UPDATE_HOURS (default 24) - starts `run`
#                    detached and returns
#   -Mode selftest   prints `ok`, or the failures and exits 1
# State: ~/.skillator/self-update.json {lastCheck, lastResult, lastVersion, notice}.
# Off: SKILLATOR_AUTO_UPDATE=0. Never passes -y.
param([ValidateSet('check','run','due-run','selftest')][string]$Mode = 'check')

$S = Join-Path $env:USERPROFILE '.skillator/self-update.json'
$H = if ($env:SKILLATOR_UPDATE_HOURS) { [int]$env:SKILLATOR_UPDATE_HOURS } else { 24 }
function Write-Lf([string]$s) { [Console]::Out.Write($s + "`n") }
function Get-Now { [int64]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) }

function Get-State {
  try { $j = Get-Content -LiteralPath $S -Raw -ErrorAction Stop | ConvertFrom-Json } catch { $j = $null }
  if (-not $j) { $j = [pscustomobject]@{ lastCheck = $null; lastResult = ''; lastVersion = ''; notice = '' } }
  $j
}
function Set-State($lc, $res, $ver, $note) {
  $c = { param($x) ([string]$x) -replace '["\\\r\n]', '' }
  try {
    New-Item -ItemType Directory -Force (Split-Path $S) | Out-Null
    $line = '{"lastCheck":' + $(if ($lc) { $lc } else { 0 }) + ',"lastResult":"' + (& $c $res) + '","lastVersion":"' + (& $c $ver) + '","notice":"' + (& $c $note) + '"}' + "`n"
    [IO.File]::WriteAllText("$S.tmp", $line); Move-Item -Force "$S.tmp" $S
  } catch { }
}
function Test-Due {
  $lc = "$((Get-State).lastCheck)"
  if ($lc -notmatch '^\d+$') { return $true }
  ((Get-Now) - [int64]$lc) -ge ($H * 3600)
}
# A bare x.y.z - anything else never reaches a notice or a command line.
function Test-Plain([string]$v) { $v -cmatch '^[0-9]+\.[0-9]+\.[0-9]+\z' }
function Test-Newer([string]$a, [string]$b) { try { [version]$b -gt [version]$a } catch { $false } }

function Get-WhySkip {
  $r = (Get-Location).Path
  while (-not (Test-Path -LiteralPath (Join-Path $r '.git'))) {
    $n = Split-Path $r -Parent
    if (-not $n -or $n -eq $r) { return '' }
    $r = $n
  }
  foreach ($f in @(Get-ChildItem -LiteralPath (Join-Path $r '.skillator') -Filter 'run-*.md' -File -ErrorAction SilentlyContinue)) {
    if (Select-String -LiteralPath $f.FullName -Pattern '^\|[^|]*\|[^|]*\|\s*~\s*\|' -Quiet) { return "a relay run is in flight ($($f.Name))" }
  }
  $pj = Join-Path $r 'plugin/.claude-plugin/plugin.json'
  # Only a real skillator source; and a repo's own config (fsmonitor, hooks) must not run.
  $real = (Test-Path -LiteralPath (Join-Path $r 'plugin/install.sh')) -and (Test-Path -LiteralPath (Join-Path $r 'plugin/install.ps1')) -and
    (Test-Path -LiteralPath $pj) -and (Select-String -LiteralPath $pj -Pattern '"name"\s*:\s*"skillator"' -Quiet)
  if ($real) {
    $hp = if ($env:OS -eq 'Windows_NT') { 'NUL' } else { '/dev/null' }
    if ("$(& git -c core.fsmonitor= -c core.hooksPath=$hp -c core.untrackedCache=false -C $r status --porcelain -- plugin 2>$null)") { return 'uncommitted plugin edits' }
  }
  ''
}

function Get-List { try { @($null | & claude plugin list --json 2>$null | Out-String | ConvertFrom-Json) } catch { @() } }
function Get-Plugin($list, [string]$id) { $list | Where-Object { $_.id -eq $id } | Select-Object -First 1 }

$script:m = ''; $script:old = ''; $script:new = ''; $script:L = @(); $script:nv = ''; $script:NOTE = ''
function Invoke-Check {
  if ($env:SKILLATOR_AUTO_UPDATE -eq '0') { return 'skipped: SKILLATOR_AUTO_UPDATE=0' }
  $w = Get-WhySkip
  if ($w) { return "skipped: $w" }
  if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { return 'skipped: no claude on PATH - Claude Code not checked' }
  $script:L = Get-List
  $sk = $script:L | Where-Object { "$($_.id)" -like 'skillator@*' } | Select-Object -First 1
  if (-not $sk) { return 'skipped: skillator is not a Claude Code plugin here' }
  $script:m = $sk.id.Substring(10); $script:old = "$($sk.version)"
  if (-not (Test-Plain $script:old)) { $script:old = ''; return 'skipped: unexpected version' }
  $null | & claude plugin marketplace update $script:m *> $null
  if ($LASTEXITCODE -ne 0) { return 'offline' }
  try {
    $loc = (@($null | & claude plugin marketplace list --json 2>$null | Out-String | ConvertFrom-Json) | Where-Object { $_.name -eq $script:m } | Select-Object -First 1).installLocation
    $cat = Get-Content -LiteralPath (Join-Path $loc '.claude-plugin/marketplace.json') -Raw | ConvertFrom-Json
    $script:new = "$(($cat.plugins | Where-Object { $_.name -eq 'skillator' } | Select-Object -First 1).version)"
  } catch { $script:new = '' }
  if (-not $script:new) { return "failed: no skillator version in marketplace $($script:m)" }
  if (-not (Test-Plain $script:new)) { $script:new = ''; return 'skipped: unexpected version' }
  if (Test-Newer $script:old $script:new) { "newer $($script:old) -> $($script:new)" } else { "up to date $($script:old)" }
}

# Returns '' on success, else the result line (and sets NOTE for a confirmation).
function Update-Plugin([string]$id) {
  $o = "$($null | & claude plugin update $id 2>&1 | Out-String)"
  if ($LASTEXITCODE -eq 0) { return '' }
  if ($o -match '(?i)confirm|shownCommand|--yes') {
    $script:NOTE = "skillator $($script:new) is out but its update needs confirmation - run /skillator-update"
    return 'skipped: needs confirmation'
  }
  "failed: claude plugin update $id"
}

function Invoke-Update {
  $r = Update-Plugin "skillator@$($script:m)"; if ($r) { return $r }
  if (Get-Plugin $script:L "ops-board@$($script:m)") { $r = Update-Plugin "ops-board@$($script:m)"; if ($r) { return $r } }
  $script:L = Get-List
  $sk = Get-Plugin $script:L "skillator@$($script:m)"
  $script:nv = "$($sk.version)"; $ip = "$($sk.installPath)"
  $sv = ''
  try { $sv = "$((Get-Content -LiteralPath (Join-Path $ip '.claude-plugin/plugin.json') -Raw -ErrorAction Stop | ConvertFrom-Json).version)" } catch { }
  if (-not (Test-Plain $script:nv) -or ($sv -and -not (Test-Plain $sv))) { $script:nv = ''; return 'skipped: unexpected version' }
  foreach ($v in @($script:nv, $sv)) {
    if ($v -and (Test-Newer $v $script:old)) { return "skipped: would downgrade $($script:old) -> $v" }
  }
  $ih = ''
  if ($ip -and (Test-Path -LiteralPath (Join-Path $ip 'install.ps1')) -and (Test-Path -LiteralPath (Join-Path $ip 'install.sh'))) {
    $p = Start-Process powershell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $ip 'install.ps1'), '-Force') -WindowStyle Hidden -Wait -PassThru
    if ($p.ExitCode -ne 0) { $ih = ' (other hosts: installer failed - run /skillator-update)' }
  } else { $ih = ' (other hosts: no installer in the plugin - run /skillator-update)' }
  $script:NOTE = "skillator updated $($script:old) -> $($script:nv) - restart Claude Code to load it$ih"
  "updated $($script:old) -> $($script:nv)"
}

function Invoke-Run {
  $res = Invoke-Check
  if ($res -like 'newer*') { $res = Invoke-Update }
  if ($res -eq 'offline' -or $res -like 'failed*') { $script:NOTE = "skillator update check: $res - next try in $H h" }
  if (-not $script:NOTE) { $script:NOTE = "$((Get-State).notice)" }
  Set-State (Get-Now) $res $(if ($script:nv) { $script:nv } else { $script:old }) $script:NOTE
  $res
}

function Invoke-DueRun {
  $st = Get-State
  if ($st.notice) { Write-Lf $st.notice; Set-State $st.lastCheck $st.lastResult $st.lastVersion '' }
  if ($env:SKILLATOR_AUTO_UPDATE -eq '0') { return }
  if (-not (Test-Due)) { return }
  $st = Get-State
  Set-State (Get-Now) $st.lastResult $st.lastVersion ''
  Start-Process powershell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath, '-Mode', 'run') -WindowStyle Hidden | Out-Null
}

function Invoke-SelfTest {
  $d = Join-Path ([IO.Path]::GetTempPath()) ("su-" + [guid]::NewGuid().ToString('N'))
  $bin = Join-Path $d 'bin'; $repo = Join-Path $d 'repo'; $inst = Join-Path $d 'inst'; $mkt = Join-Path $d 'mkt'
  foreach ($x in @($bin, (Join-Path $d 'home'), (Join-Path $repo '.git'), $inst, (Join-Path $mkt '.claude-plugin'))) { New-Item -ItemType Directory -Force $x | Out-Null }
  $rg = "$((Get-Command git -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source)"
  $env:SU_D = $d; $env:USERPROFILE = Join-Path $d 'home'; $env:HOME = $env:USERPROFILE; $env:PATH = "$bin;$env:PATH"
  foreach ($v in 'SKILLATOR_AUTO_UPDATE', 'SKILLATOR_UPDATE_HOURS', 'SU_OFFLINE', 'SU_CONFIRM', 'SU_SLEEP', 'SU_DIRTY', 'SU_OLDV', 'SU_NEWV') { Remove-Item "Env:$v" -ErrorAction SilentlyContinue }
  $script:S = Join-Path $env:USERPROFILE '.skillator/self-update.json'
  $log = Join-Path $d 'log'
  Set-Content -LiteralPath (Join-Path $bin 'claude.ps1') -Encoding utf8 -Value @'
Add-Content -LiteralPath "$env:SU_D/log" -Value ("claude " + ($args -join ' '))
$a = $args -join ' '
switch ($a) {
  'plugin list --json' { $v = if (Test-Path "$env:SU_D/updated") { if ($env:SU_NEWV) { $env:SU_NEWV } else { '4.30.0' } } elseif ($env:SU_OLDV) { $env:SU_OLDV } else { '4.29.0' }
    ConvertTo-Json -Compress @(@{ id = 'skillator@skillator'; version = $v; installPath = "$env:SU_D\inst" }, @{ id = 'ops-board@skillator'; version = '0.17.0'; installPath = 'x' }); exit 0 }
  'plugin marketplace update skillator' { if ($env:SU_SLEEP) { Start-Sleep $env:SU_SLEEP }; if ($env:SU_OFFLINE) { exit 1 }; exit 0 }
  'plugin marketplace list --json' { ConvertTo-Json -Compress @(@{ name = 'skillator'; installLocation = "$env:SU_D\mkt" }); exit 0 }
  'plugin update skillator@skillator' { if ($env:SU_CONFIRM) { 'Run again with -y to confirm'; exit 1 }; Set-Content "$env:SU_D/updated" ''; exit 0 }
  'plugin update ops-board@skillator' { exit 0 }
}
exit 1
'@
  Set-Content -LiteralPath (Join-Path $bin 'git.ps1') -Encoding utf8 -Value @'
Add-Content -LiteralPath "$env:SU_D/log" -Value ("git " + ($args -join ' '))
if ($env:SU_REALGIT) { & $env:SU_REALGIT @args; exit $LASTEXITCODE }
if (($args -join ' ') -match 'status') { $env:SU_DIRTY }
'@
  Set-Content -LiteralPath (Join-Path $inst 'install.sh') -Value '#!/bin/sh'
  Set-Content -LiteralPath (Join-Path $inst 'install.ps1') -Encoding utf8 -Value ('Add-Content -LiteralPath "' + $log + '" -Value ("installer ps1 " + ($args -join " "))')
  $script:F = 0
  function T([string]$name, [bool]$ok) { if (-not $ok) { Write-Lf "FAIL: $name"; $script:F = 1 } }
  function Cat-V([string]$v) { Set-Content -LiteralPath (Join-Path $mkt '.claude-plugin/marketplace.json') -Value ('{"name":"skillator","plugins":[{"name":"skillator","version":"' + $v + '"}]}') }
  function Lg { if (Test-Path -LiteralPath $log) { @(Get-Content -LiteralPath $log) } else { @() } }
  function St { if (Test-Path -LiteralPath $script:S) { Get-Content -LiteralPath $script:S -Raw } else { '' } }
  function Reset-T { foreach ($x in @($log, (Join-Path $d 'updated'), (Split-Path $script:S), (Join-Path $repo '.skillator'), (Join-Path $repo 'plugin'))) { Remove-Item -Recurse -Force -LiteralPath $x -ErrorAction SilentlyContinue }; Cat-V '4.30.0' }
  # each mode in a child, as the hook would run it
  function Su([string]$mode) { "$(& powershell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -Mode $mode | Out-String)".TrimEnd() }
  Push-Location $repo
  try {
    Reset-T; New-Item -ItemType Directory -Force (Split-Path $script:S) | Out-Null
    Set-Content -LiteralPath $script:S -Value ('{"lastCheck":' + (Get-Now) + ',"lastResult":"up to date 4.29.0","lastVersion":"4.29.0","notice":""}')
    $o = Su 'due-run'
    T 'not due: no work' (-not $o -and (Lg).Count -eq 0)

    Reset-T; Cat-V '4.29.0'
    T 'due + up to date: check' ((Su 'check') -eq 'up to date 4.29.0')
    Remove-Item -Force -LiteralPath $log -ErrorAction SilentlyContinue
    $o = Su 'run'
    T 'due + up to date: no update call' ($o -eq 'up to date 4.29.0' -and -not ((Lg) -match 'plugin update') -and (St) -match '"lastResult":"up to date 4.29.0"')

    Reset-T
    $o = Su 'run'
    $exp = @('claude plugin list --json', 'claude plugin marketplace update skillator', 'claude plugin marketplace list --json', 'claude plugin update skillator@skillator', 'claude plugin update ops-board@skillator', 'claude plugin list --json', 'installer ps1 -Force')
    T 'due + newer: result' ($o -eq 'updated 4.29.0 -> 4.30.0')
    T 'due + newer: calls in order' (((Lg) -join '|') -eq ($exp -join '|'))
    T 'due + newer: the one-line notice' ((Su 'due-run') -eq 'skillator updated 4.29.0 -> 4.30.0 - restart Claude Code to load it')
    T 'due + newer: notice shown once' (-not (Su 'due-run'))

    Reset-T; $env:SU_OFFLINE = '1'
    T 'offline: check' ((Su 'check') -eq 'offline')
    Reset-T; $env:SU_OFFLINE = '1'
    Su 'run' | Out-Null
    Remove-Item -Force -LiteralPath $log -ErrorAction SilentlyContinue
    $o = Su 'due-run'
    T 'offline: one quiet note, stamped, not retried' ($o -eq 'skillator update check: offline - next try in 24 h' -and (Lg).Count -eq 0 -and (St) -notmatch '"lastCheck":0')
    Remove-Item Env:SU_OFFLINE

    Reset-T; New-Item -ItemType Directory -Force (Join-Path $repo '.skillator') | Out-Null
    Set-Content -LiteralPath (Join-Path $repo '.skillator/run-0001-x.md') -Value "| # | stage | state |`n|---|---|---|`n| 1 | x | ~ |"
    T 'run in flight: skipped' ((Su 'check') -eq 'skipped: a relay run is in flight (run-0001-x.md)' -and -not ((Lg) -match '^claude'))

    Reset-T; New-Item -ItemType Directory -Force (Join-Path $repo 'plugin/.claude-plugin') | Out-Null
    Set-Content -LiteralPath (Join-Path $repo 'plugin/.claude-plugin/plugin.json') -Value '{"name": "skillator"}'
    Su 'check' | Out-Null
    T 'not a skillator source (no installers): no git probe' (-not ((Lg) -match '^git'))
    foreach ($n in 'install.sh', 'install.ps1') { Set-Content -LiteralPath (Join-Path $repo "plugin/$n") -Value '' }
    Remove-Item -Force -LiteralPath $log -ErrorAction SilentlyContinue
    $env:SU_DIRTY = ' M plugin/x'
    T 'dirty plugin: skipped' ((Su 'check') -eq 'skipped: uncommitted plugin edits' -and -not ((Lg) -match '^claude'))
    Remove-Item Env:SU_DIRTY

    Reset-T; $r2 = Join-Path $d 'repo2'; New-Item -ItemType Directory -Force (Join-Path $r2 'plugin/.claude-plugin') | Out-Null
    & $rg init -q $r2; & $rg -C $r2 config core.fsmonitor 'touch fsmon-marker; false'
    Set-Content -LiteralPath (Join-Path $r2 'plugin/.claude-plugin/plugin.json') -Value '{"name": "skillator"}'
    foreach ($n in 'install.sh', 'install.ps1') { Set-Content -LiteralPath (Join-Path $r2 "plugin/$n") -Value '' }
    Push-Location $r2; $env:SU_REALGIT = $rg
    try { $o = Su 'check' } finally { Remove-Item Env:SU_REALGIT; Pop-Location }
    T 'hostile core.fsmonitor: never runs' (-not (Test-Path -LiteralPath (Join-Path $r2 'fsmon-marker')) -and $o -eq 'skipped: uncommitted plugin edits')

    Reset-T; $env:SKILLATOR_AUTO_UPDATE = '0'
    T 'opt-out: check skipped' ((Su 'check') -eq 'skipped: SKILLATOR_AUTO_UPDATE=0')
    $o = Su 'due-run'
    T 'opt-out: due-run does nothing' (-not $o -and (Lg).Count -eq 0 -and -not (St))
    Remove-Item Env:SKILLATOR_AUTO_UPDATE

    Reset-T; $env:SU_CONFIRM = '1'
    $o = Su 'run'
    T 'confirmation prompt: skipped, never -y' ($o -eq 'skipped: needs confirmation' -and -not ((Lg) -match '(^| )(-y|--yes)( |$)'))
    Remove-Item Env:SU_CONFIRM

    Reset-T; $env:SU_NEWV = '4.28.0'
    $o = Su 'run'
    T 'downgrade: refused, no installer' ($o -eq 'skipped: would downgrade 4.29.0 -> 4.28.0' -and -not ((Lg) -match '^installer'))
    Remove-Item Env:SU_NEWV

    Reset-T; $env:SU_OLDV = '4.29.0-evil$(x)'
    $o = Su 'run'
    T 'unexpected version: skipped, kept out of notice and commands' ($o -eq 'skipped: unexpected version' -and (St) -notmatch 'evil' -and -not ((Lg) -match 'evil|plugin update'))
    Remove-Item Env:SU_OLDV

    # in-process, so PowerShell's own start-up is not counted against the second
    Reset-T; $env:SU_SLEEP = '3'
    $sw = [Diagnostics.Stopwatch]::StartNew()
    Invoke-DueRun | Out-Null
    $sw.Stop()
    T 'due-run returns in under 1 s, run detached' ($sw.Elapsed.TotalSeconds -lt 1 -and (St) -match '"lastCheck":[1-9]')
    $i = 0
    while ((St) -notmatch '"lastResult":"updated' -and $i -lt 60) { Start-Sleep 1; $i++ }
    T 'due-run: the detached run finished the update' (@((Lg) -match '^installer').Count -gt 0)
    Remove-Item Env:SU_SLEEP
  } finally {
    Pop-Location
    Start-Sleep -Milliseconds 300
    Remove-Item -Recurse -Force -LiteralPath $d -ErrorAction SilentlyContinue
  }
  if ($script:F -eq 0) { Write-Lf 'ok' }
  exit $script:F
}

switch ($Mode) {
  'check' { Write-Lf (Invoke-Check) }
  'run' { Write-Lf (Invoke-Run) }
  'due-run' { Invoke-DueRun }
  'selftest' { Invoke-SelfTest }
}
exit 0
