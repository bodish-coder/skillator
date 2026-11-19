# skillator plugin, self-update (F181). Mirror of self-update.sh - same rules,
# same state file, same output lines. hooks.json runs the sh twin.
#   -Mode check      prints `up to date <v>` | `newer <old> -> <new>` |
#                    `skipped: <why>` | `offline` | `failed: <what>`
#   -Mode run        check, then update when newer; records the result
#   -Mode due-run    prints a pending notice (once), then - only when the last check is
#                    older than SKILLATOR_UPDATE_HOURS (default 24) - starts `run`
#                    detached and returns
#   -Mode selftest   prints `ok`, or the failures and exits 1
# State: ~/.skillator/self-update.json {lastCheck, startedAt, skipAt, lastResult,
# lastVersion, notice}; lastCheck is written when a run finishes, startedAt when
# due-run starts one. Off: SKILLATOR_AUTO_UPDATE=0. Never passes -y.
param([ValidateSet('check','run','due-run','selftest')][string]$Mode = 'check')

$S = Join-Path $env:USERPROFILE '.skillator/self-update.json'
$K = Join-Path $env:USERPROFILE '.skillator/self-update.lock'
# a positive integer (up to 6 digits), else the default
$H = if ("$env:SKILLATOR_UPDATE_HOURS" -match '^[1-9][0-9]{0,5}$') { [int]$env:SKILLATOR_UPDATE_HOURS } else { 24 }
function Write-Lf([string]$s) { [Console]::Out.Write($s + "`n") }
function Get-Now { [int64]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) }
function ConvertTo-N($x) { if ("$x" -match '^\d+$') { [int64]"$x" } else { [int64]0 } }

function Get-State {
  try { $j = Get-Content -LiteralPath $S -Raw -ErrorAction Stop | ConvertFrom-Json } catch { $j = $null }
  if (-not $j) { $j = [pscustomobject]@{ lastCheck = 0; startedAt = 0; skipAt = 0; lastResult = ''; lastVersion = ''; notice = '' } }
  $j
}
function Set-State($lc, $sa, $sk, $res, $ver, $note) {
  $c = { param($x) ([string]$x) -replace '["\\\r\n]', '' }
  try {
    New-Item -ItemType Directory -Force (Split-Path $S) | Out-Null
    $line = '{"lastCheck":' + (ConvertTo-N $lc) + ',"startedAt":' + (ConvertTo-N $sa) + ',"skipAt":' + (ConvertTo-N $sk) + ',"lastResult":"' + (& $c $res) + '","lastVersion":"' + (& $c $ver) + '","notice":"' + (& $c $note) + '"}' + "`n"
    $tmp = "$S.$PID.tmp"
    [IO.File]::WriteAllText($tmp, $line); Move-Item -Force $tmp $S
  } catch { }
}
# From one state read: the last check is H hours old and no run started in the last
# 30 min (an older startedAt is a run that was killed).
function Test-Due($st) {
  $now = Get-Now
  if ($now - (ConvertTo-N $st.startedAt) -lt 1800) { return $false }
  if ("$($st.lastCheck)" -notmatch '^\d+$') { return $true }
  ($now - [int64]$st.lastCheck) -ge ($H * 3600)
}
# Serialize state transactions and updates. The update outlives the due grace period.
function Enter-Lock {
  try { New-Item -ItemType Directory -Force (Split-Path $K) -ErrorAction Stop | Out-Null } catch { return $false }
  $atPath = Join-Path $K 'at'
  try { New-Item -ItemType Directory $K -ErrorAction Stop | Out-Null }
  catch {
    try {
      $a = [IO.File]::ReadAllText($atPath).Trim()
      if ($a -notmatch '^\d+$') { throw 'no stamp' }
      $age = (Get-Now) - [int64]$a
    } catch {
      try { $age = ((Get-Date).ToUniversalTime() - (Get-Item -LiteralPath $K -ErrorAction Stop).LastWriteTimeUtc).TotalSeconds } catch { return $false }
    }
    if ($age -lt 2700) { return $false }
    $takeover = Join-Path $K 'takeover'
    try { New-Item -ItemType Directory $takeover -ErrorAction Stop | Out-Null } catch { return $false }
    $current = "$(Get-Content -LiteralPath $atPath -ErrorAction SilentlyContinue)".Trim()
    if ($current -ne "$a") { Remove-Item -LiteralPath $takeover; return $false }
    Remove-Item -LiteralPath $atPath,(Join-Path $K 'owner'),$takeover -Force -ErrorAction SilentlyContinue
    try {
      [IO.Directory]::Delete($K, $false)
      New-Item -ItemType Directory $K -ErrorAction Stop | Out-Null
    } catch { return $false }
  }
  $script:lockOwner = [guid]::NewGuid().ToString('N')
  [IO.File]::WriteAllText($atPath, "$(Get-Now)")
  [IO.File]::WriteAllText((Join-Path $K 'owner'), $script:lockOwner)
  $true
}

function Exit-Lock {
  $ownerPath = Join-Path $K 'owner'
  $takeover = Join-Path $K 'takeover'
  try { New-Item -ItemType Directory $takeover -ErrorAction Stop | Out-Null } catch { return }
  $owned = "$(Get-Content -LiteralPath $ownerPath -ErrorAction SilentlyContinue)" -ceq $script:lockOwner
  if ($owned) { Remove-Item -LiteralPath (Join-Path $K 'at'),$ownerPath -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $takeover -Force -ErrorAction SilentlyContinue
  if ($owned) { try { [IO.Directory]::Delete($K, $false) } catch { } }
}

# A bare x.y.z - anything else never reaches a notice or a command line.
function Test-Plain([string]$v) { $v -cmatch '^[0-9]+\.[0-9]+\.[0-9]+\z' }
function Test-Newer([string]$a, [string]$b) { try { [version]$b -gt [version]$a } catch { $false } }
function Get-RealPath([string]$p) { try { [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $p -ErrorAction Stop).ProviderPath).TrimEnd('\', '/') } catch { '' } }

# The git checkouts the installer's source pointers name - read, never git-run.
function Get-Clones {
  $h = $env:USERPROFILE
  $cx = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $h '.codex' }
  $xd = if ($env:XDG_CONFIG_HOME) { $env:XDG_CONFIG_HOME } else { Join-Path $h '.config' }
  foreach ($p in @("$h/.claude/skills", "$cx/skills", "$h/.cursor/skills", "$h/.pi/agent/skills", "$h/.gemini/config/skills", "$h/.gemini/skills", "$h/.gemini/antigravity-cli/skills", "$xd/opencode/skills")) {
    $s = try { "$(Get-Content -LiteralPath (Join-Path $p '.skillator-source') -TotalCount 1 -ErrorAction Stop)".Trim().TrimEnd('\', '/') } catch { '' }
    if (-not $s) { continue }
    foreach ($c in @($s, (Split-Path $s -Parent))) {
      if ($c -and (Test-Path -LiteralPath (Join-Path $c '.git'))) { Get-RealPath $c; break }
    }
  }
}

# A ~ row blocks while its heartbeat (else the file mtime) is under 60 min old.
function Test-InFlight($f, [int64]$now) {
  $hb = 0; $u = $false
  foreach ($ln in @(Get-Content -LiteralPath $f.FullName -ErrorAction SilentlyContinue)) {
    if ($ln -notmatch '^\|') { continue }
    $c = $ln -split '\|'
    for ($i = 1; $i -lt $c.Count - 1; $i++) { if ($c[$i].Trim() -eq 'heartbeat') { $hb = $i } }
    if ($ln -notmatch '^\|[^|]*\|[^|]*\|\s*~\s*\|') { continue }
    $t = if ($hb -and $hb -lt $c.Count) { $c[$hb].Trim() } else { '' }
    $e = -1
    if ($t -match '^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)') {
      try { $e = [DateTimeOffset]::new([int]$Matches[1], [int]$Matches[2], [int]$Matches[3], [int]$Matches[4], [int]$Matches[5], 0, [TimeSpan]::Zero).ToUnixTimeSeconds() } catch { }
    }
    if ($e -lt 0) { $u = $true } elseif ($now - $e -lt 3600) { return $true }
  }
  $u -and ((Get-Date).ToUniversalTime() - $f.LastWriteTimeUtc).TotalMinutes -lt 60
}

# Only checkout pointers and registered worktrees are trusted Git targets.
function Test-DirtyCheckout([string]$checkout, [string]$hooksPath) {
  $overrides = @('-c','core.fsmonitor=false','-c',"core.hooksPath=$hooksPath",'-c','core.untrackedCache=false','-c','diff.external=')
  foreach ($filter in @(& git -C $checkout config --name-only --get-regexp '^filter\..*\.(clean|smudge|process|required)$' 2>$null)) {
    $value = if ($filter -like '*.required') { 'false' } else { '' }
    $overrides += @('-c', "$filter=$value")
  }
  # Porcelain status can flag a CRLF-only stat change before checking filters.
  & git --no-optional-locks @overrides -C $checkout diff --quiet --no-ext-diff --no-textconv --ignore-submodules=all -- plugin 2>$null | Out-Null
  if ($LASTEXITCODE -eq 1) { return $true }
  & git --no-optional-locks @overrides -C $checkout diff --cached --quiet --no-ext-diff --no-textconv --ignore-submodules=all -- plugin 2>$null | Out-Null
  if ($LASTEXITCODE -eq 1) { return $true }
  [bool](& git @overrides -C $checkout ls-files --others --exclude-standard -- plugin 2>$null)
}

function Get-WhySkip {
  $r = (Get-Location).Path
  while (-not (Test-Path -LiteralPath (Join-Path $r '.git'))) {
    $n = Split-Path $r -Parent
    if (-not $n -or $n -eq $r) { break }
    $r = $n
  }
  $now = Get-Now
  foreach ($f in @(Get-ChildItem -LiteralPath (Join-Path $r '.skillator') -Filter 'run-*.md' -File -ErrorAction SilentlyContinue)) {
    if (Test-InFlight $f $now) { return "a relay run is in flight ($($f.Name))" }
  }
  $hp = if ($env:OS -eq 'Windows_NT') { 'NUL' } else { '/dev/null' }
  foreach ($checkout in $script:clones) {
    if (Test-DirtyCheckout $checkout $hp) { return 'uncommitted plugin edits' }
    foreach ($row in @(& git -C $checkout -c core.quotePath=false worktree list --porcelain 2>$null)) {
      if ($row -notlike 'worktree *') { continue }
      $tree = $row.Substring(9)
      if ($tree -ne $checkout -and (Test-DirtyCheckout $tree $hp)) { return 'uncommitted plugin edits' }
    }
  }
  ''
}

function Invoke-Bounded([string]$command, [string[]]$arguments, [int]$milliseconds = 120000) {
  $quote = { param($value) "'" + $value.Replace("'", "''") + "'" }
  $line = '& ' + (& $quote $command)
  foreach ($arg in $arguments) { $line += ' ' + (& $quote $arg) }
  $line += '; $ok = $?; if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }; if (-not $ok) { exit 1 }'
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($line))
  $psi = [Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = (Get-Process -Id $PID).Path
  $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -EncodedCommand $encoded"
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $proc = [Diagnostics.Process]::Start($psi)
  try {
    $proc.StandardInput.Close()
    $stdout = $proc.StandardOutput.ReadToEndAsync()
    $stderr = $proc.StandardError.ReadToEndAsync()
    if (-not $proc.WaitForExit($milliseconds)) {
      if ($env:OS -eq 'Windows_NT') {
        & (Join-Path $env:SystemRoot 'System32/taskkill.exe') /T /F /PID $proc.Id *> $null
      }
      if (-not $proc.HasExited) { $proc.Kill() }
      return @{ Code = 124; Out = ''; Error = '' }
    }
    if (-not [Threading.Tasks.Task]::WaitAll(@($stdout, $stderr), 1000)) {
      return @{ Code = 124; Out = ''; Error = '' }
    }
    @{ Code = $proc.ExitCode; Out = $stdout.Result; Error = $stderr.Result }
  } finally { $proc.Dispose() }
}

function Get-List { try { @((Invoke-Bounded claude @('plugin', 'list', '--json')).Out | ConvertFrom-Json) } catch { @() } }
function Get-Plugin($list, [string]$id) { $list | Where-Object { $_.id -eq $id } | Select-Object -First 1 }

$script:m = ''; $script:old = ''; $script:new = ''; $script:L = @(); $script:nv = ''; $script:NOTE = ''
function Invoke-Check {
  if ($env:SKILLATOR_AUTO_UPDATE -eq '0') { return 'skipped: SKILLATOR_AUTO_UPDATE=0' }
  $script:clones = @(Get-Clones)
  $w = Get-WhySkip
  if ($w) { return "skipped: $w" }
  if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { return 'skipped: no claude on PATH - Claude Code not checked' }
  $script:L = Get-List
  $sk = $script:L | Where-Object { "$($_.id)" -like 'skillator@*' } | Select-Object -First 1
  if (-not $sk) { return 'skipped: skillator is not a Claude Code plugin here' }
  $script:m = $sk.id.Substring(10); $script:old = "$($sk.version)"
  if (-not (Test-Plain $script:old)) { $script:old = ''; return 'skipped: unexpected version' }
  $marketUpdate = Invoke-Bounded claude @('plugin', 'marketplace', 'update', $script:m)
  if ($marketUpdate.Code -ne 0) { return 'offline' }
  try {
    $loc = (@((Invoke-Bounded claude @('plugin', 'marketplace', 'list', '--json')).Out | ConvertFrom-Json) | Where-Object { $_.name -eq $script:m } | Select-Object -First 1).installLocation
    $cat = Get-Content -LiteralPath (Join-Path $loc '.claude-plugin/marketplace.json') -Raw | ConvertFrom-Json
    $script:new = "$(($cat.plugins | Where-Object { $_.name -eq 'skillator' } | Select-Object -First 1).version)"
  } catch { $script:new = '' }
  if (-not $script:new) { return "failed: no skillator version in marketplace $($script:m)" }
  if (-not (Test-Plain $script:new)) { $script:new = ''; return 'skipped: unexpected version' }
  if (Test-Newer $script:old $script:new) { "newer $($script:old) -> $($script:new)" }
  elseif (Test-Newer $script:new $script:old) { "skipped: would downgrade $($script:old) -> $($script:new)" }
  else { "up to date $($script:old)" }
}

# Returns '' on success, else the result line.
function Update-Plugin([string]$id) {
  $reply = Invoke-Bounded claude @('plugin', 'update', $id)
  $o = $reply.Out + $reply.Error
  if ($reply.Code -eq 0) { return '' }
  if ($o -match '(?i)confirm|shownCommand|--yes') { return 'skipped: needs confirmation' }
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
    if ($v -and -not (Test-Newer $script:old $v)) {
      $script:nv = $v
      $script:NOTE = "skillator update did not apply ($($script:old) -> $v) - run /skillator-update"
      return "failed: update did not apply ($($script:old) -> $v)"
    }
  }
  # a pointer to a clone: /skillator-update pulls it and installs from there
  if ($script:clones.Count) {
    $script:NOTE = "skillator $($script:old) -> $($script:nv) for Claude Code - run /skillator-update to update the other hosts"
    return "updated $($script:old) -> $($script:nv)"
  }
  $ih = ''
  if ($ip -and (Test-Path -LiteralPath (Join-Path $ip 'install.ps1')) -and (Test-Path -LiteralPath (Join-Path $ip 'install.sh'))) {
    $p = Invoke-Bounded (Join-Path $ip 'install.ps1') @('-Force')
    if ($p.Code -ne 0) { $ih = ' (other hosts: installer failed - run /skillator-update)' }
  } else { $ih = ' (other hosts: no installer in the plugin - run /skillator-update)' }
  $script:NOTE = "skillator updated $($script:old) -> $($script:nv) - restart Claude Code to load it$ih"
  "updated $($script:old) -> $($script:nv)"
}

function Invoke-Run {
  if (-not (Enter-Lock)) { return 'skipped: another update run is in progress' }
  try {
    $res = Invoke-Check
    if ($res -like 'newer*') { $res = Invoke-Update }
    $st = Get-State; $now = Get-Now; $sk = ConvertTo-N $st.skipAt
    if ($res -cne $st.lastResult) { $sk = 0 }
    if ($res -eq 'offline' -or $res -like 'failed*') {
      if (-not $script:NOTE) { $script:NOTE = "skillator update check: $res - next try in $H h" }
    } elseif ($res -like 'skipped: a relay run is in flight*' -or $res -eq 'skipped: needs confirmation' -or $res -like 'skipped: would downgrade*' -or $res -eq 'skipped: unexpected version') {
      # skips that repeat every check: one notice a day, not one per check
      if ($now - $sk -ge 86400) {
        $script:NOTE = "skillator update $res"
        if ($res -eq 'skipped: needs confirmation') {
          $script:NOTE += " ($($script:old) -> $($script:new)) - run /skillator-update"
        }
        $sk = $now
      }
    }
    if (-not $script:NOTE) { $script:NOTE = "$($st.notice)" }
    Set-State $now $st.startedAt $sk $res $(if ($script:nv) { $script:nv } else { $script:old }) $script:NOTE
    $res
  } finally { Exit-Lock }
}

function Invoke-DueRun {
  if (-not (Enter-Lock)) { return }
  try {
    $st = Get-State
    $go = ($env:SKILLATOR_AUTO_UPDATE -ne '0') -and (Test-Due $st)
    if ($st.notice) { Write-Lf $st.notice }
    # startedAt first, so the prompts while `run` works do not start another
    if ($st.notice -or $go) { Set-State $st.lastCheck $(if ($go) { Get-Now } else { $st.startedAt }) $st.skipAt $st.lastResult $st.lastVersion '' }
  } finally { Exit-Lock }
  if ($go) { Start-Process powershell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath, '-Mode', 'run') -WindowStyle Hidden | Out-Null }
}

function Invoke-SelfTest {
  $d = Join-Path ([IO.Path]::GetTempPath()) ("su-" + [guid]::NewGuid().ToString('N'))
  $bin = Join-Path $d 'bin'; $repo = Join-Path $d 'repo'; $inst = Join-Path $d 'inst'; $mkt = Join-Path $d 'mkt'
  foreach ($x in @($bin, (Join-Path $d 'home'), (Join-Path $repo '.git'), $inst, (Join-Path $mkt '.claude-plugin'))) { New-Item -ItemType Directory -Force $x | Out-Null }
  $rg = "$((Get-Command git -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source)"
  $env:SU_D = $d; $env:USERPROFILE = Join-Path $d 'home'; $env:HOME = $env:USERPROFILE; $env:PATH = "$bin;$env:PATH"
  foreach ($v in 'SKILLATOR_AUTO_UPDATE', 'SKILLATOR_UPDATE_HOURS', 'SU_OFFLINE', 'SU_CONFIRM', 'SU_SLEEP', 'SU_DIRTY', 'SU_OLDV', 'SU_NEWV', 'SU_REALGIT', 'CODEX_HOME', 'XDG_CONFIG_HOME', 'GIT_CONFIG_NOSYSTEM') { Remove-Item "Env:$v" -ErrorAction SilentlyContinue }
  $script:S = Join-Path $env:USERPROFILE '.skillator/self-update.json'
  $script:K = Join-Path $env:USERPROFILE '.skillator/self-update.lock'
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
Add-Content -LiteralPath "$env:SU_D/log" -Value ("git " + ($args -join ' ') + " nosys=$env:GIT_CONFIG_NOSYSTEM")
if ($env:SU_REALGIT) { & $env:SU_REALGIT @args; exit $LASTEXITCODE }
if (($args -join ' ') -match 'diff --quiet' -and $env:SU_DIRTY) { exit 1 }
exit 0
'@
  Set-Content -LiteralPath (Join-Path $inst 'install.sh') -Value '#!/bin/sh'
  Set-Content -LiteralPath (Join-Path $inst 'install.ps1') -Encoding utf8 -Value ('Add-Content -LiteralPath "' + $log + '" -Value ("installer ps1 " + ($args -join " "))')
  $script:F = 0
  function T([string]$name, [bool]$ok) { if (-not $ok) { Write-Lf "FAIL: $name"; $script:F = 1 } }
  function Cat-V([string]$v) { Set-Content -LiteralPath (Join-Path $mkt '.claude-plugin/marketplace.json') -Value ('{"name":"skillator","plugins":[{"name":"skillator","version":"' + $v + '"}]}') }
  function Lg { if (Test-Path -LiteralPath $log) { @(Get-Content -LiteralPath $log) } else { @() } }
  function St { if (Test-Path -LiteralPath $script:S) { Get-Content -LiteralPath $script:S -Raw } else { '' } }
  function Reset-T { foreach ($x in @($log, (Join-Path $d 'updated'), (Split-Path $script:S), (Join-Path $env:USERPROFILE '.codex'), (Join-Path $repo '.skillator'), (Join-Path $repo 'plugin'), (Join-Path $d 'clone'), (Join-Path $d 'plain'))) { Remove-Item -Recurse -Force -LiteralPath $x -ErrorAction SilentlyContinue }; Cat-V '4.30.0' }
  function Ws($lc, $sa) { New-Item -ItemType Directory -Force (Split-Path $script:S) | Out-Null; Set-Content -LiteralPath $script:S -Value ('{"lastCheck":' + $lc + ',"startedAt":' + $sa + ',"skipAt":0,"lastResult":"","lastVersion":"4.29.0","notice":""}') }
  function Ptr([string]$p) { $h = Join-Path $env:USERPROFILE '.codex/skills'; New-Item -ItemType Directory -Force $h | Out-Null; Set-Content -LiteralPath (Join-Path $h '.skillator-source') -Value $p }
  function Iso([int64]$t) { [DateTimeOffset]::FromUnixTimeSeconds($t).UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm'Z'") }
  function Set-Mtime($p, [int64]$t) { (Get-Item -LiteralPath $p).LastWriteTimeUtc = [DateTimeOffset]::FromUnixTimeSeconds($t).UtcDateTime }
  # each mode in a child, as the hook would run it
  function Su([string]$mode) { "$(& powershell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -Mode $mode | Out-String)".TrimEnd() }
  $now = Get-Now
  Push-Location $repo
  try {
    Reset-T; Ws $now 0
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
    Reset-T
    Su 'run' | Out-Null
    Remove-Item -Force -LiteralPath $log -ErrorAction SilentlyContinue
    $o = Su 'due-run'
    T 'offline: one quiet note, stamped, not retried' ($o -eq 'skillator update check: offline - next try in 24 h' -and (Lg).Count -eq 0 -and (St) -notmatch '"lastCheck":0')
    Remove-Item Env:SU_OFFLINE

    # 3: a ~ row blocks only while its heartbeat (else the file mtime) is under 60 min old
    Reset-T; New-Item -ItemType Directory -Force (Join-Path $repo '.skillator') | Out-Null; $rf = Join-Path $repo '.skillator/run-0001-x.md'
    Set-Content -LiteralPath $rf -Value "| # | stage | state |`n|---|---|---|`n| 1 | x | ~ |"
    T 'run in flight (fresh mtime): skipped' ((Su 'check') -eq 'skipped: a relay run is in flight (run-0001-x.md)' -and -not ((Lg) -match '^claude'))
    Set-Mtime $rf ($now - 7200)
    T 'stale ~ row (old mtime, no heartbeat column): not blocking' ((Su 'check') -eq 'newer 4.29.0 -> 4.30.0')
    Set-Content -LiteralPath $rf -Value "| # | stage | state | owner | heartbeat |`n|---|---|---|---|---|`n| 1 | x | ~ | b | $(Iso ($now - 7200)) |"
    T 'stale ~ row (old heartbeat, fresh mtime): not blocking' ((Su 'check') -eq 'newer 4.29.0 -> 4.30.0')
    Set-Content -LiteralPath $rf -Value "| # | stage | state | owner | heartbeat |`n|---|---|---|---|---|`n| 1 | x | ~ | b | $(Iso ($now - 300)) |"
    Set-Mtime $rf ($now - 7200)
    T 'live ~ row (fresh heartbeat, old mtime): skipped' ((Su 'check') -eq 'skipped: a relay run is in flight (run-0001-x.md)')
    Su 'run' | Out-Null
    T 'repeated skip: a notice' ((Su 'due-run') -eq 'skillator update skipped: a relay run is in flight (run-0001-x.md)')
    Su 'run' | Out-Null
    T 'repeated skip: the notice once per 24 h' (-not (Su 'due-run'))
    Remove-Item -LiteralPath $rf
    $env:SU_CONFIRM = '1'
    Su 'run' | Out-Null
    Remove-Item Env:SU_CONFIRM
    T 'different skip: notify within the same day' ((Su 'due-run') -eq 'skillator update skipped: needs confirmation (4.29.0 -> 4.30.0) - run /skillator-update')
    Set-State 1 0 0 result version ("before" + [char]13 + "after")
    T 'bare carriage return: valid JSON notice' ((Get-State).notice -eq 'beforeafter')

    # 1: never git in a repo that only looks like skillator; only in the pointer's own clone
    Reset-T; $r3 = Join-Path $d 'fake'; New-Item -ItemType Directory -Force (Join-Path $r3 'plugin/.claude-plugin') | Out-Null
    & $rg init -q $r3
    Set-Content -LiteralPath (Join-Path $r3 'plugin/.claude-plugin/plugin.json') -Value '{"name": "skillator"}'
    foreach ($n in 'install.sh', 'install.ps1') { Set-Content -LiteralPath (Join-Path $r3 "plugin/$n") -Value '' }
    Set-Content -LiteralPath (Join-Path $r3 'plugin/f') -Value 'aaaa'
    Set-Content -LiteralPath (Join-Path $r3 '.gitattributes') -Value '* filter=x'
    & $rg -C $r3 -c core.autocrlf=false add -A; & $rg -C $r3 -c core.autocrlf=false -c user.name=t -c user.email=t@t commit -qm x
    & $rg -C $r3 config filter.x.clean 'touch filter-marker; cat'
    Start-Sleep 1; Set-Content -LiteralPath (Join-Path $r3 'plugin/f') -Value 'bbbb'
    Push-Location $r3; $env:SU_REALGIT = $rg
    try { $o = Su 'check' } finally { Remove-Item Env:SU_REALGIT; Pop-Location }
    T 'lookalike repo with a hostile filter: no git call, no marker' (-not (Test-Path -LiteralPath (Join-Path $r3 'filter-marker')) -and -not ((Lg) -match '^git') -and $o -eq 'newer 4.29.0 -> 4.30.0')
    Reset-T; New-Item -ItemType Directory -Force (Join-Path $repo 'plugin') | Out-Null; Ptr (Join-Path $repo 'plugin')
    $env:SU_DIRTY = ' M plugin/x'
    T 'owner clone (pointer) dirty: skipped' ((Su 'check') -eq 'skipped: uncommitted plugin edits' -and -not ((Lg) -match '^claude') -and @((Lg) -match '^git .*diff .*nosys=$').Count -gt 0)
    Remove-Item Env:SU_DIRTY

    Reset-T; $r2 = Join-Path $d 'repo2'; New-Item -ItemType Directory -Force (Join-Path $r2 'plugin') | Out-Null
    & $rg init -q $r2; & $rg -C $r2 config core.fsmonitor 'touch fsmon-marker; false'
    Set-Content -LiteralPath (Join-Path $r2 'plugin/x') -Value ''
    Ptr (Join-Path $r2 'plugin')
    Push-Location $r2; $env:SU_REALGIT = $rg
    try { $o = Su 'check' } finally { Remove-Item Env:SU_REALGIT; Pop-Location }
    T 'hostile core.fsmonitor in the owner clone: never runs' (-not (Test-Path -LiteralPath (Join-Path $r2 'fsmon-marker')) -and $o -eq 'skipped: uncommitted plugin edits')

    # A242: use Git's checkout normalization and inspect a registered linked tree.
    Reset-T
    $r4 = Join-Path $d 'normal'; $wt4 = Join-Path $d 'linked tree'; $gc = Join-Path $d 'system.gitconfig'
    New-Item -ItemType Directory -Force (Join-Path $r4 'plugin') | Out-Null
    & $rg init -q $r4
    $f4 = Join-Path $r4 'plugin/x'
    [IO.File]::WriteAllText($f4, ("alpha" + [char]10))
    & $rg -C $r4 -c core.autocrlf=false add -- plugin
    & $rg -C $r4 -c user.name=t -c user.email=t@t commit -qm x
    Ptr (Join-Path $r4 'plugin')
    [IO.File]::WriteAllLines($gc, @('[core]', 'autocrlf = true'))
    [IO.File]::WriteAllText($f4, ('alpha' + [char]13 + [char]10))
    $oldGC = $env:GIT_CONFIG_SYSTEM; $env:GIT_CONFIG_SYSTEM = $gc; $env:SU_REALGIT = $rg
    try {
      T 'system line endings: CRLF copy is clean' ((Su 'check') -eq 'newer 4.29.0 -> 4.30.0')
      [IO.File]::WriteAllText($f4, ("alpha" + [char]10))
      & $rg -C $r4 worktree add --detach --quiet $wt4
      Set-Content -LiteralPath (Join-Path $wt4 'plugin/x') -Value 'dirty'
      T 'linked worktree: dirty plugin blocks update from elsewhere' ((Su 'check') -eq 'skipped: uncommitted plugin edits')
    } finally {
      $env:GIT_CONFIG_SYSTEM = $oldGC
      Remove-Item Env:SU_REALGIT
    }

    Reset-T; $env:SKILLATOR_AUTO_UPDATE = '0'
    T 'opt-out: check skipped' ((Su 'check') -eq 'skipped: SKILLATOR_AUTO_UPDATE=0')
    $o = Su 'due-run'
    T 'opt-out: due-run does nothing' (-not $o -and (Lg).Count -eq 0 -and -not (St))
    Remove-Item Env:SKILLATOR_AUTO_UPDATE

    Reset-T; $env:SU_CONFIRM = '1'
    $o = Su 'run'
    T 'confirmation prompt: skipped, never -y' ($o -eq 'skipped: needs confirmation' -and -not ((Lg) -match '(^| )(-y|--yes)( |$)'))
    Remove-Item Env:SU_CONFIRM
    T 'confirmation prompt: the skip notice' ((Su 'due-run') -eq 'skillator update skipped: needs confirmation (4.29.0 -> 4.30.0) - run /skillator-update')

    # 2: decide before installing; an update that did not land is never "updated"
    Reset-T; Cat-V '4.28.0'
    $o = Su 'run'
    T 'marketplace older: refused before any update' ($o -eq 'skipped: would downgrade 4.29.0 -> 4.28.0' -and -not ((Lg) -match 'plugin update'))
    Reset-T; $env:SU_NEWV = '4.29.0'
    $o = Su 'run'
    T 'update did not apply (same version): recorded, no installer' ($o -eq 'failed: update did not apply (4.29.0 -> 4.29.0)' -and -not ((Lg) -match '^installer'))
    T 'update did not apply: the notice' ((Su 'due-run') -eq 'skillator update did not apply (4.29.0 -> 4.29.0) - run /skillator-update')
    Reset-T; $env:SU_NEWV = '4.28.0'
    $o = Su 'run'
    T 'update went down: did not apply, no installer' ($o -eq 'failed: update did not apply (4.29.0 -> 4.28.0)' -and -not ((Lg) -match '^installer'))
    Remove-Item Env:SU_NEWV

    Reset-T; $env:SU_OLDV = '4.29.0-evil$(x)'
    $o = Su 'run'
    T 'unexpected version: skipped, kept out of notice and commands' ($o -eq 'skipped: unexpected version' -and (St) -notmatch 'evil' -and -not ((Lg) -match 'evil|plugin update'))
    Remove-Item Env:SU_OLDV

    # 4: a pointer to a git clone - the other hosts are /skillator-update's job
    Reset-T; New-Item -ItemType Directory -Force (Join-Path $d 'clone/.git'), (Join-Path $d 'clone/plugin') | Out-Null; Ptr (Join-Path $d 'clone/plugin')
    $o = Su 'run'
    T 'pointer to a clone: no installer from the cache' ($o -eq 'updated 4.29.0 -> 4.30.0' -and -not ((Lg) -match '^installer'))
    T 'pointer to a clone: the notice' ((Su 'due-run') -eq 'skillator 4.29.0 -> 4.30.0 for Claude Code - run /skillator-update to update the other hosts')
    Reset-T; New-Item -ItemType Directory -Force (Join-Path $d 'plain/plugin') | Out-Null; Ptr (Join-Path $d 'plain/plugin')
    Su 'run' | Out-Null
    T 'pointer not a git checkout: installer from installPath' (@((Lg) -match '^installer').Count -gt 0)

    # A242: the bounded process and run/state lock are independent of one another.
    Reset-T
    $p = Invoke-Bounded Start-Sleep @('4') 1000
    T 'hung process: bounded call times out' ($p.Code -eq 124)
    $null = Enter-Lock
    Set-Content -LiteralPath (Join-Path $script:K 'owner') -Value 'next-owner'
    Exit-Lock
    T 'lock takeover: old process preserves successor' ((Get-Content -LiteralPath (Join-Path $script:K 'owner')) -eq 'next-owner')
    Reset-T
    Set-Content -LiteralPath (Join-Path $mkt '.claude-plugin/marketplace.json') -Value '{"plugins":[{"version":"4.30.0","name":"skillator"}]}'
    T 'JSON metadata: field order does not affect version lookup' ((Su 'check') -eq 'newer 4.29.0 -> 4.30.0')

    # 6: one run at a time
    Reset-T; New-Item -ItemType Directory -Force $script:K | Out-Null; Set-Content -LiteralPath (Join-Path $script:K 'at') -Value "$now"
    $o = Su 'run'
    T 'lock held: run skipped, no claude call' ($o -eq 'skipped: another update run is in progress' -and -not ((Lg) -match '^claude'))
    Set-Content -LiteralPath (Join-Path $script:K 'at') -Value "$($now - 2000)"
    T 'lock lasts beyond the due grace period' ((Su 'run') -eq 'skipped: another update run is in progress')
    Ws 1 0
    T 'due-run does not rewrite state held by run' (-not (Su 'due-run') -and (St) -match '"startedAt":0')
    Set-Content -LiteralPath (Join-Path $script:K 'at') -Value "$($now - 3600)"
    $o = Su 'run'
    T 'stale lock: taken, released' ($o -eq 'updated 4.29.0 -> 4.30.0' -and -not (Test-Path -LiteralPath $script:K))

    # 8: SKILLATOR_UPDATE_HOURS must be a positive integer
    Reset-T; Ws $now 0; $env:SKILLATOR_UPDATE_HOURS = 'abc'
    $o = Su 'due-run'
    T 'bad SKILLATOR_UPDATE_HOURS: default 24, not due' (-not $o -and (St) -match '"startedAt":0')
    Reset-T; $env:SKILLATOR_UPDATE_HOURS = '0'; $env:SU_OFFLINE = '1'
    $o = Su 'run'
    T 'zero SKILLATOR_UPDATE_HOURS: default 24' ($o -eq 'offline' -and (St) -match 'next try in 24 h')
    Remove-Item Env:SKILLATOR_UPDATE_HOURS; Remove-Item Env:SU_OFFLINE

    # 5: due-run stamps only startedAt; a fresh startedAt stops another spawn
    Reset-T; Ws 0 ($now - 60)
    Su 'due-run' | Out-Null
    T 'run started 1 min ago: no second spawn' ((St) -match ('"startedAt":' + ($now - 60) + ',') -and (Lg).Count -eq 0)
    # in-process, so PowerShell's own start-up is not counted against the second
    Reset-T; Ws 0 ($now - 3600); $env:SU_SLEEP = '3'
    $sw = [Diagnostics.Stopwatch]::StartNew()
    Invoke-DueRun | Out-Null
    $sw.Stop()
    T 'due-run returns in under 1 s, only startedAt written' ($sw.Elapsed.TotalSeconds -lt 1 -and (St) -match '"lastCheck":0,' -and (St) -notmatch ('"startedAt":' + ($now - 3600) + ','))
    $i = 0
    while ((St) -notmatch '"lastCheck":[1-9]' -and $i -lt 60) { Start-Sleep 1; $i++ }
    T 'due-run: the detached run finished the update and wrote lastCheck' (@((Lg) -match '^installer').Count -gt 0 -and (St) -match '"lastResult":"updated')
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
