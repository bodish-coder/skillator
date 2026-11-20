# watch-cortana: record usage % and act on it before the session is cut off.
#   -Mode probe [-Then "<original statusline command>"]   (Claude Code statusLine)
#   -Mode gate                                            (Claude Code / codex Stop hook)
#   -Mode check                                           (any host, no stdin - see below)
#   -Mode level                                           (any host, no stdin; profile cache refresh)
# Threshold: $env:CLAUDE_USAGE_HANDOFF_PCT, default 96.
# State dir: $env:CLAUDE_USAGE_WATCH_DIR, else $env:CLAUDE_CONFIG_DIR/handoff-watch,
# else ~/.claude/handoff-watch (the first override exists so tests never touch
# a live session's flags; A130: the second keeps a profile's flags its own).
#
# Claude Code and codex (A83: gate reads the rollout named by transcript_path)
# have a Stop hook that can inject. Cursor/Antigravity get `check`, which reads
# whatever the host leaves on disk and prints the order for the agent to follow.
# Wired by the always-on project file grayskull-power writes, not by a hook.
param(
  [ValidateSet('probe','gate','check','level','refresh','on','off','status')][string]$Mode = 'probe',
  [string]$Then,
  [string]$Cli,
  [string]$Dir
)

# The state dir keeps its original name on purpose - see the sh twin.
# A130: a CLAUDE_CONFIG_DIR profile keeps its flags in its own config dir - the
# probe writes there and check/level read there, so one profile never reads
# another's sessions. Same order as the ops-board mod's usage read.
$dir      = if ($Mode -eq 'refresh') { $Dir } # PowerShell names are case-insensitive: preserve -Dir.
            elseif ($env:CLAUDE_USAGE_WATCH_DIR) { $env:CLAUDE_USAGE_WATCH_DIR }
            elseif ($env:CLAUDE_CONFIG_DIR) { Join-Path $env:CLAUDE_CONFIG_DIR 'handoff-watch' }
            else { Join-Path $HOME '.claude/handoff-watch' }
$offFile = Join-Path $(if ($dir) { $dir } else { '.' }) '.watch-cortana.off'
if ($Mode -eq 'off') {
  try {
    [void][IO.Directory]::CreateDirectory($dir)
    [IO.File]::WriteAllText($offFile, '')
  } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
  'watch-cortana: off'; exit 0
}
if ($Mode -eq 'on') {
  try { [IO.File]::Delete($offFile) } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
  'watch-cortana: on'; exit 0
}
if ($Mode -in @('check','gate','status')) {
  $disabled = [IO.File]::Exists($offFile)
  if ($Mode -eq 'status') { if ($disabled) { 'watch-cortana: off' } else { 'watch-cortana: on' }; exit 0 }
  if ($disabled) { if ($Mode -eq 'check') { 'watch-cortana: off' }; exit 0 }
}
$pctLimit = if ($env:CLAUDE_USAGE_HANDOFF_PCT) { [double]$env:CLAUDE_USAGE_HANDOFF_PCT } else { 96 }
# The 7-day window is watched separately and lower. The 5-hour window refills
# in hours, so crossing it is a pause; the weekly one does not, so crossing it
# ends the week's work - which is why it gets its own threshold and its own
# fourth step: ask where to go next rather than leave the user to guess.
$wkLimit  = if ($env:CLAUDE_USAGE_HANDOFF_WEEKLY_PCT) { [double]$env:CLAUDE_USAGE_HANDOFF_WEEKLY_PCT } else { 97 }
$inv      = [Globalization.CultureInfo]::InvariantCulture
# A32: a rollout nobody has written to in this long is not this session's usage.
# Must match $stale_secs in the sh twin (10800).
$staleHours = 3

# The flag file is shared between this script and its sh twin, so it must be
# bare bytes: no BOM, no trailing CRLF, invariant decimal point. Set-Content
# -Encoding utf8 on PS 5.1 writes "EF BB BF 31 32 2E 30 0D 0A", and the sh
# reader's awk then string-compares 0xEF against the threshold and fires at 12%.
function Write-Flag($path, $value) {
  $dirPart = Split-Path $path -Parent
  New-Item $dirPart -ItemType Directory -Force | Out-Null
  # WriteAllText resolves relative to the process cwd, not PowerShell's - be absolute.
  $abs = [IO.Path]::Combine((Convert-Path $dirPart), (Split-Path $path -Leaf))
  [IO.File]::WriteAllText($abs, ([double]$value).ToString($inv))
}

# Flags contain one complete number, with optional legacy BOM/whitespace.
function Read-Flag($path) {
  $t = Read-Token $path
  if ($null -ne $t) { return [double]::Parse($t, $inv) }
  return $null
}

# Step 4 is spliced in BEFORE Get-Reason's closing "Then tell the user where
# the file is and stop." - appending it after put the stop instruction ahead of
# the one step whose whole point is that the session must not stop on a
# summary. The sh twin has always spliced; this is the mirror catching up.
function Get-WeeklyReason($pct, $limit) {
  $tail = ' If Wake Cortana is armed for this run, record the saved handoff with its handoff command. Then tell the user where the file is and stop.'
  $step4 = ' (4) This is the 7-DAY window, which does not refill for days - the work is over for now, not paused. If Wake Cortana is not armed, use AskUserQuestion after the handoff to put the next direction to the user as concrete options drawn from the open board and the handoff''s own next-steps, say which one you recommend and why in one line, and make the recommendation the first option.'
  (Get-Reason $pct $limit).Replace($tail, $step4 + $tail)
}

function Get-Reason($pct, $limit) {
  "Usage has reached $pct% of the limit (threshold $limit%). Stop the current work and preserve the session now - it can be cut off at any moment. In order: (1) if any subagent, workflow or background task is still running, wait for it or stop it and record what it had done - never leave in-flight agent work undescribed; (2) invoke skillator:tickets-zordon to sync TICKETS.md - sync statuses only, do NOT start working open tickets, usage is nearly gone: close what actually landed, mark what is half-done as in-progress, and file a ticket for anything discovered this session that has no ticket; (3) invoke skillator:handoff-cortana and write the document, whose status table must match TICKETS.md ticket-for-ticket and must list the in-flight agent work from step 1 with the exact prompt needed to resume it. If Wake Cortana is armed for this run, record the saved handoff with its handoff command. Then tell the user where the file is and stop."
}

# Last token_count line of a codex rollout, or $null.
function Get-CodexLastTc($path) {
  # Get-Content -Tail is very slow on long JSONL lines in Windows PowerShell.
  # Stream UTF8 once, retaining only the latest match and its distance from EOF.
  $stream = $null
  $reader = $null
  $last = $null
  $after = 400
  try {
    # Codex may still have the rollout open for append while status reads it.
    $stream = [IO.File]::Open((Convert-Path -LiteralPath $path -ErrorAction Stop), [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::UTF8, $true)
    while ($null -ne ($line = $reader.ReadLine())) {
      if ($line -match '"token_count"') { $last = $line; $after = 0 }
      elseif ($after -lt 400) { $after++ }
    }
    if ($after -lt 400) { return $last }
  } catch { Write-Error $_ }
  finally {
    if ($null -ne $reader) { $reader.Dispose() }
    elseif ($null -ne $stream) { $stream.Dispose() }
  }
}

# A starting child has no usage event yet; it must not hide a fresh reading.
function Get-CodexRollout($codexHome) {
  $sess = Join-Path $codexHome 'sessions'
  if (-not (Test-Path -LiteralPath $sess)) { return $null }
  $rolls = Get-ChildItem $sess -Recurse -File -Filter 'rollout-*.jsonl' -ErrorAction SilentlyContinue |
           Where-Object { $_.LastWriteTime -gt (Get-Date).AddHours(-$staleHours) } | Sort-Object LastWriteTime -Descending
  foreach ($roll in $rolls) {
    if ($codexSession) {
      try { $meta = Get-Content -LiteralPath $roll.FullName -Encoding UTF8 -TotalCount 1 | ConvertFrom-Json }
      catch { continue }
      if ($meta.type -ne 'session_meta' -or $meta.payload.id -ne $codexSession) { continue }
    }
    if (Get-CodexLastTc $roll.FullName) { return $roll }
  }
  return $null
}

# Usage % from one codex rollout: the max of every rate_limits used_percent
# whose window is NOT the 7-day one (A98: window_minutes 10080), plus the
# live context on its last token_count line; $null when there is none.
function Get-CodexPct($path) {
  $line = Get-CodexLastTc $path
  if (-not $line) { return $null }
  # @() because a lone used_percent comes back as a scalar, and `+=` on a
  # scalar double ADDS the context % to it (19.0 + 7.3 = 26.3, A83).
  $vals = @([regex]::Matches($line, '\{[^{}]*"used_percent"\s*:\s*[0-9.]+[^{}]*\}') |
    Where-Object { $_.Value -notmatch '"window_minutes"\s*:\s*10080' } |
    ForEach-Object { [double]([regex]::Match($_.Value, '"used_percent"\s*:\s*([0-9.]+)').Groups[1].Value) })
  # last_token_usage is the size of the live context; total_token_usage is
  # cumulative for the whole session and would read well over 100%.
  if ($line -match '"last_token_usage"\s*:\s*\{[^}]*?"total_tokens"\s*:\s*([0-9]+)[^}]*\}[\s\S]*?"model_context_window"\s*:\s*([0-9]+)') {
    $vals += [math]::Round(100 * [double]$Matches[1] / [double]$Matches[2], 1)
  }
  if ($vals.Count) { return ($vals | Measure-Object -Maximum).Maximum }
  return $null
}

# A98: the 10080-minute rate_limits window is codex's 7-day window, the
# counterpart of the Claude path's seven_day.used_percentage - it gets the
# weekly gate (90% hard stop, step-4 question) instead of the 92% one.
# $null when the last token_count line has no such window.
function Get-CodexWeeklyPct($path) {
  $line = Get-CodexLastTc $path
  if (-not $line) { return $null }
  $vals = @([regex]::Matches($line, '\{[^{}]*"used_percent"\s*:\s*[0-9.]+[^{}]*\}') |
    Where-Object { $_.Value -match '"window_minutes"\s*:\s*10080' } |
    ForEach-Object { [double]([regex]::Match($_.Value, '"used_percent"\s*:\s*([0-9.]+)').Groups[1].Value) })
  if ($vals.Count) { return ($vals | Measure-Object -Maximum).Maximum }
  return $null
}

# F31: the validated numeric token AS WRITTEN ('12.0' stays '12.0'),
# so `level` prints the same bytes as the sh twin's read_pct; $null if none.
function Read-Token($path) {
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  try { $t = [IO.File]::ReadAllText((Convert-Path -LiteralPath $path)) } catch { return $null }
  $t = $t.Trim().TrimStart([char]0xfeff).Trim()
  $value = 0.0
  if ($t -match '\A[0-9]+(\.[0-9]+)?\z' -and [double]::TryParse($t, [Globalization.NumberStyles]::AllowDecimalPoint, $inv, [ref]$value) -and $value -le 100) { return $t }
  return $null
}
function Fmt1($v) { ([double]$v).ToString('0.0', $inv) }

# A130: true when $path is a file written inside the freshness window. The
# statusline rewrites every flag on each render, so an older one is a dead or
# idle session's - not a current reading.
function Test-Fresh($path) {
  $i = Get-Item -LiteralPath $path -ErrorAction SilentlyContinue
  [bool]($i -and -not $i.PSIsContainer -and $i.LastWriteTime -gt (Get-Date).AddHours(-$staleHours))
}

# A130: the flag key check/level may read, or $null. Inside Claude Code
# (CLAUDE_CODE_SESSION_ID set) only this session's own flags count - never the
# newest file in the dir, which may be another session's. Elsewhere the newest
# main flag (else the newest .weekly), and only while fresh.
function Get-FlagKey {
  if ($env:CLAUDE_CODE_SESSION_ID) {
    $k = $env:CLAUDE_CODE_SESSION_ID
    if ($k -notmatch '\A[a-zA-Z0-9_-]+\z') { return $null }
    if ($null -ne (Read-Fresh (Join-Path $dir $k) 'Read-Token') -or $null -ne (Read-Fresh (Join-Path $dir "$k.weekly") 'Read-Token')) { return $k }
    return $null
  }
  # `.weekly` is written after the main flag, so it is always the newest -
  # the main flag is picked first, by name, never by mtime alone.
  $f = Get-ChildItem $dir -File -ErrorAction SilentlyContinue |
       Where-Object { $_.Name -cmatch '\A[a-zA-Z0-9_-]+\z' -and $null -ne (Read-Token $_.FullName) } | Sort-Object LastWriteTime | Select-Object -Last 1
  if ($f) { if (Test-Fresh $f.FullName) { return $f.Name }; return $null }
  # A101: a weekly flag with no main flag beside it is a real state.
  $f = Get-ChildItem $dir -File -ErrorAction SilentlyContinue |
       Where-Object { $_.Name -cmatch '\A[a-zA-Z0-9_-]+\.weekly\z' -and $null -ne (Read-Token $_.FullName) } | Sort-Object LastWriteTime | Select-Object -Last 1
  if ($f -and (Test-Fresh $f.FullName)) { return $f.BaseName }
  $null
}
# A fresh flag's value via $reader, else $null.
function Read-Fresh($path, $reader) { if (Test-Fresh $path) { & $reader $path } else { $null } }

# F31: @(5h, 7d, ctx) from one codex rollout, '-' for each one absent. 5h is
# the max of the windows that are NOT 10080 minutes, WITHOUT the context ratio
# - a full context is a compaction, not a quota.
function Get-CodexLevel($path) {
  $line = Get-CodexLastTc $path
  if (-not $line) { return $null }
  $h = $null; $wk = $null; $cx = $null
  foreach ($m in [regex]::Matches($line, '\{[^{}]*"used_percent"\s*:\s*[0-9.]+[^{}]*\}')) {
    $v = [double]::Parse([regex]::Match($m.Value, '"used_percent"\s*:\s*([0-9.]+)').Groups[1].Value, $inv)
    if ($m.Value -match '"window_minutes"\s*:\s*10080') { if ($null -eq $wk -or $v -gt $wk) { $wk = $v } }
    else { if ($null -eq $h -or $v -gt $h) { $h = $v } }
  }
  if ($line -match '"last_token_usage"\s*:\s*\{[^}]*?"total_tokens"\s*:\s*([0-9]+)[^}]*\}[\s\S]*?"model_context_window"\s*:\s*([0-9]+)') {
    if ([double]$Matches[2] -gt 0 -and [double]$Matches[1] -gt 0) { $cx = 100 * [double]$Matches[1] / [double]$Matches[2] }
  }
  @($h, $wk, $cx) | ForEach-Object { if ($null -eq $_) { '-' } else { Fmt1 $_ } }
}

function Get-CachedQuota {
  if ($sourceError -or $codexSession -or $env:CLAUDE_CODE_SESSION_ID) { return $null }
  $cands = @(
    Join-Path $selectedProfile 'quota-cache.json'
    if ($selectedHost -eq 'claude-code') { Join-Path $dir 'quota-cache.json' }
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

  foreach ($cp in $cands) {
    if (Test-Fresh $cp) {
      try {
        $raw = [IO.File]::ReadAllText((Convert-Path -LiteralPath $cp))
        $record = ConvertFrom-Json -InputObject $raw -ErrorAction Stop
        if ($null -eq $record -or $record.GetType() -ne [System.Management.Automation.PSCustomObject]) { return $null }
        # PowerShell member lookup ignores case; admit only exact JSON schema keys.
        $fields = @{}
        foreach ($property in $record.PSObject.Properties) {
          if ($property.Name -cin @('src','5h','five','7d','weekly','max','note','failures','backoff_secs')) { $fields[$property.Name] = $property.Value }
        }
        $record = $fields
        $s = $record.src
        if ($s -cnotin @('claude-code','codex','agy','muse','cursor') -or ($selectedHost -ne 'profile' -and $s -cne $selectedHost)) { return $null }
        foreach ($name in @('5h','five','7d','weekly','max')) {
          $v = $record.$name
          if ($null -ne $v -and (($v -isnot [int] -and $v -isnot [long] -and $v -isnot [double] -and $v -isnot [decimal]) -or [double]::IsNaN($v) -or $v -lt 0 -or $v -gt 100)) { return $null }
        }
        if ($null -ne $record.note -and $record.note -isnot [string]) { return $null }
        if ($null -ne $record.failures) {
          $fl = $record.failures
          if (($fl -isnot [int] -and $fl -isnot [long]) -or $fl -lt 1) { return $null }
        }
        if ($null -ne $record.backoff_secs) {
          $b = $record.backoff_secs
          if (($b -isnot [int] -and $b -isnot [long] -and $b -isnot [double] -and $b -isnot [decimal]) -or [double]::IsNaN([double]$b) -or [double]$b -le 0) { return $null }
          $item = Get-Item -LiteralPath $cp -ErrorAction SilentlyContinue
          if (-not $item -or $item.LastWriteTime -le (Get-Date).AddSeconds(-[double]$b)) { return $null }
        }
        $h = if ($record.ContainsKey('5h')) { $record.'5h' } else { $record.five }
        $w = if ($record.ContainsKey('7d')) { $record.'7d' } else { $record.weekly }
        $n = $record.note
        $m = $null # Derive max from the validated windows, as the shell reader does.
        return @{ src = $s; '5h' = $h; '7d' = $w; max = $m; note = $n; path = $cp }
      } catch { return $null }
    }
  }
  return $null
}

# Resolve once for level/check. Explicit identities never fall through to another host.
if ($Mode -in @('level','check')) {
  $sourceError = $null
  $selectedHost = $env:SKILLATOR_CLI
  if ($selectedHost -eq 'claude') { $selectedHost = 'claude-code' }
  $codexSession = if ($env:CODEX_THREAD_ID) { $env:CODEX_THREAD_ID } else { $env:CODEX_SESSION_ID }
  if (($env:CODEX_THREAD_ID -and $env:CODEX_SESSION_ID -and $env:CODEX_THREAD_ID -ne $env:CODEX_SESSION_ID) -or
      ($codexSession -and $env:CLAUDE_CODE_SESSION_ID) -or
      ($selectedHost -and $codexSession -and $selectedHost -ne 'codex') -or
      ($selectedHost -and $env:CLAUDE_CODE_SESSION_ID -and $selectedHost -ne 'claude-code')) {
    $sourceError = 'conflicting_source_identities'
  }
  if (-not $selectedHost) {
    $selectedHost = if ($env:CLAUDE_CODE_SESSION_ID) { 'claude-code' }
      elseif ($codexSession) { 'codex' }
      elseif ($env:SKILLATOR_PROFILE_DIR) {
        if (Test-Path -LiteralPath (Join-Path $env:SKILLATOR_PROFILE_DIR 'sessions')) { 'codex' } else { 'profile' }
      }
      elseif ($env:CLAUDE_CONFIG_DIR) { 'claude-code' }
      elseif ($env:CODEX_HOME) { 'codex' }
      elseif ($env:AGY_CONFIG_DIR -or $env:ANTIGRAVITY_APP_DATA_DIR) { 'agy' }
      elseif ($env:MUSE_CONFIG_DIR) { 'muse' }
      elseif ($env:CURSOR_LEDGER_PATH) { 'cursor' }
      elseif (Get-CodexRollout (Join-Path $HOME '.codex')) { 'codex' }
      else { 'claude-code' }
  }
  $selectedProfile = if ($env:SKILLATOR_PROFILE_DIR) { $env:SKILLATOR_PROFILE_DIR }
    elseif ($selectedHost -eq 'codex') { if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' } }
    elseif ($selectedHost -eq 'claude-code') { if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' } }
    elseif ($selectedHost -eq 'agy') { if ($env:AGY_CONFIG_DIR) { $env:AGY_CONFIG_DIR } elseif ($env:ANTIGRAVITY_APP_DATA_DIR) { $env:ANTIGRAVITY_APP_DATA_DIR } else { Join-Path $HOME '.gemini/antigravity-cli' } }
    elseif ($selectedHost -eq 'muse') { if ($env:MUSE_CONFIG_DIR) { $env:MUSE_CONFIG_DIR } else { Join-Path $HOME '.muse' } }
    else { Join-Path $HOME ".$selectedHost" }
  if ($selectedHost -eq 'claude-code' -and ($env:SKILLATOR_PROFILE_DIR -or -not $env:CLAUDE_USAGE_WATCH_DIR)) {
    $dir = Join-Path $selectedProfile 'handoff-watch'
  }
  $selectedRoll = if (-not $sourceError -and $selectedHost -eq 'codex') { Get-CodexRollout $selectedProfile } else { $null }
}

function Start-QuotaRefresh([string]$targetCli, [string]$targetDir) {
  if (-not $targetCli -or -not $targetDir) { return }
  $lock = Join-Path $targetDir 'quota-cache.json.refreshing'
  if (Test-Path -LiteralPath $lock) {
    $item = Get-Item -LiteralPath $lock -ErrorAction SilentlyContinue
    # F176: stale at 90 s; keep aligned with ops/reset.ts and usage-watch.sh.
    # This is over the refresh's capped CLI calls (20 s + 30 s), so a read
    # still alive always holds it and a second reader can never start a turn beside it.
    if ($item -and $item.LastWriteTime -gt (Get-Date).AddSeconds(-90)) {
      $script:noteTag = ' note=refresh_pending'
      return
    }
    Remove-Item -LiteralPath $lock -Force -ErrorAction SilentlyContinue
  }
  New-Item $targetDir -ItemType Directory -Force | Out-Null
  $acquired = $false
  try {
    $absLock = [IO.Path]::Combine((Convert-Path -LiteralPath $targetDir), 'quota-cache.json.refreshing')
    $fs = [IO.File]::Open($absLock, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
      $bytes = [Text.Encoding]::UTF8.GetBytes((Get-Date).ToString('o', $inv))
      $fs.Write($bytes, 0, $bytes.Length)
    } finally { $fs.Dispose() }
    $acquired = $true
  } catch { }
  $script:noteTag = ' note=refresh_pending'
  if (-not $acquired) { return }

  $ps1 = $MyInvocation.MyCommand.Path
  if (-not $ps1) { $ps1 = $PSCommandPath }
  if ($ps1) {
    # F176: `ops --status --refresh` waits for the read, under the same lock.
    if ($env:SKILLATOR_QUOTA_REFRESH_WAIT -eq '1') {
      try { & powershell -NoProfile -ExecutionPolicy Bypass -File $ps1 -Mode refresh -Cli $targetCli -Dir $targetDir | Out-Null }
      catch { Remove-Item -LiteralPath $lock -ErrorAction SilentlyContinue }
      return
    }
    $arg = "-NoProfile -ExecutionPolicy Bypass -File `"$ps1`" -Mode refresh -Cli $targetCli -Dir `"$targetDir`""
    try { Start-Process powershell -ArgumentList $arg -WindowStyle Hidden } catch { Remove-Item -LiteralPath $lock -ErrorAction SilentlyContinue }
  }
}

# F176: one claude call capped at $secs, in its own runspace (this script's functions
# carried in); on expiry this process's child tree is killed, so no read outlives the lock.
function Invoke-Capped([int]$secs, [string]$call, $in) {
  $iss = [Management.Automation.Runspaces.InitialSessionState]::CreateDefault()
  foreach ($f in Get-ChildItem function:) { $iss.Commands.Add((New-Object Management.Automation.Runspaces.SessionStateFunctionEntry $f.Name, $f.Definition)) }
  $rs = [runspacefactory]::CreateRunspace($iss); $rs.Open()
  $ps = [powershell]::Create(); $ps.Runspace = $rs
  [void]$ps.AddScript($call)
  $inp = New-Object 'Management.Automation.PSDataCollection[psobject]'
  if ($null -ne $in) { $inp.Add($in) }
  $inp.Complete()
  $out = New-Object 'Management.Automation.PSDataCollection[psobject]'
  try {
    $h = $ps.BeginInvoke($inp, $out)
    if (-not $h.AsyncWaitHandle.WaitOne($secs * 1000)) {
      # A listed child is spared only when provably not ours: created before this process (an
      # orphan whose dead parent's PID was reused). A start time that cannot be read (ours or
      # the child's) kills it - a capped paid turn must never outlive its lock.
      $me = try { (Get-Process -Id $PID).StartTime } catch { $null }
      try { Get-CimInstance Win32_Process -Filter "ParentProcessId=$PID" | Where-Object { -not ($me -and $_.CreationDate -and $_.CreationDate -lt $me) } | ForEach-Object { & taskkill.exe /T /F /PID $_.ProcessId 2>$null | Out-Null } } catch { }
      $null = $ps.BeginStop($null, $null)
      return ''
    }
    try { $null = $ps.EndInvoke($h) } catch { }
    return (@($out) -join "`n")
  } finally { if ($h -and $h.IsCompleted) { $ps.Dispose(); $rs.Dispose() } }
}

if ($Mode -eq 'refresh') {
  if (-not $Cli -or -not $Dir -or $Cli -notin @('agy','claude','codex','muse')) { exit 0 }
  $lock = Join-Path $Dir 'quota-cache.json.refreshing'
  $cache = Join-Path $Dir 'quota-cache.json'
  $oldAgy = $env:AGY_CONFIG_DIR; $oldApp = $env:ANTIGRAVITY_APP_DATA_DIR
  $oldCfg = $env:CLAUDE_CONFIG_DIR; $oldMuse = $env:MUSE_CONFIG_DIR
  try {
    New-Item $Dir -ItemType Directory -Force | Out-Null
    $res = $null; $raw = ''; $verdict = ''
    $isNum = { param($v) $v -is [int] -or $v -is [long] -or $v -is [double] -or $v -is [decimal] }
    # The cache as found after the CLI call (as sh reads it): 'missing', 'corrupt', or the record.
    $readPrev = {
      if (-not (Test-Path -LiteralPath $cache)) { return 'missing' }
      try {
        $p = ConvertFrom-Json ([IO.File]::ReadAllText((Convert-Path -LiteralPath $cache))) -ErrorAction Stop
        if ($p -is [pscustomobject]) { $p } else { 'corrupt' }
      } catch { 'corrupt' }
    }
    $turned = $false
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds(); $started = [DateTime]::UtcNow
    if ($Cli -eq 'codex') {
      $raw = try { & node (Join-Path $PSScriptRoot 'codex-quota.cjs') $Dir 2>$null } catch { $null }
      if ($raw) {
        $parsed = try { ConvertFrom-Json $raw -ErrorAction Stop } catch { $null }
        if ($parsed -and ($null -ne $parsed.'5h' -or $null -ne $parsed.'7d')) {
          $res = [ordered]@{ src = 'codex' }
          foreach ($key in @('at','5h','7d','models')) {
            if ($null -ne $parsed.$key) { $res[$key] = $parsed.$key }
          }
        }
      }
    } elseif ($Cli -eq 'agy') {
      $env:AGY_CONFIG_DIR = $Dir
      $env:ANTIGRAVITY_APP_DATA_DIR = $Dir
      try { $raw = & agy -p "/usage" --output-format json 2>$null | Out-String } catch { $raw = '' }
      if ($raw) {
        $parsed = try { ConvertFrom-Json $raw -ErrorAction Stop } catch { $null }
        $h = $null; $wk = $null; $models = @()
        if ($parsed -and $parsed.command -and $parsed.command.data -and $parsed.command.data.groups) {
          foreach ($g in $parsed.command.data.groups) {
            $gh = $null; $gw = $null
            if ($g.buckets) {
              foreach ($b in $g.buckets) {
                if ($null -ne $b.remaining_fraction) {
                  $used = [math]::Round((1.0 - [double]$b.remaining_fraction) * 100, 1)
                  if ($b.window -match '5h' -or $b.window -match 'hour') {
                    if ($null -eq $gh -or $used -gt $gh) { $gh = $used }
                  } elseif ($b.window -match 'week' -or $b.window -match '7d') {
                    if ($null -eq $gw -or $used -gt $gw) { $gw = $used }
                  }
                }
              }
            }
            if ($null -ne $gh -and ($null -eq $h -or $gh -gt $h)) { $h = $gh }
            if ($null -ne $gw -and ($null -eq $wk -or $gw -gt $wk)) { $wk = $gw }
            if ($g.name -is [string] -and ($null -ne $gh -or $null -ne $gw)) {
              $m = [ordered]@{ name = $g.name }
              if ($null -ne $gh) { $m['5h'] = $gh }
              if ($null -ne $gw) { $m['7d'] = $gw }
              $models += $m
            }
          }
        }
        if ($null -ne $h -or $null -ne $wk) {
          $res = [ordered]@{ src = 'agy' }
          if ($null -ne $h) { $res['5h'] = $h }
          if ($null -ne $wk) { $res['7d'] = $wk }
          if ($models.Count) { $res['models'] = $models }
        }
      }
    } elseif ($Cli -eq 'claude') {
      $env:CLAUDE_CONFIG_DIR = $Dir
      # The CLI's own hooks must never see a forced read (WAIT) and start one themselves.
      $forced = $env:SKILLATOR_QUOTA_REFRESH_WAIT -eq '1'
      $env:SKILLATOR_QUOTA_REFRESH_WAIT = $null
      # F176/B27: the get_usage control request on stdin, no prompt - no model turn.
      $req = '{"type":"control_request","request_id":"u1","request":{"subtype":"get_usage","skip_behaviors":true}}'
      $raw = Invoke-Capped 20 '$input | claude -p --input-format stream-json --output-format stream-json --verbose 2>$null' $req
      $r = $null
      foreach ($l in ($raw -split "`r?`n")) {
        $m = try { ConvertFrom-Json $l -ErrorAction Stop } catch { $null }
        if ($m -and $m.type -eq 'control_response' -and $m.response.request_id -eq 'u1') { $r = $m.response.response }
      }
      # The installed CLI (2.1.x) answers false for API key / Bedrock / Vertex (or a login
      # without profile scope), and null limits when its usage fetch failed - an expired
      # login prints nothing else (the error goes to its debug log).
      if ($r -and $r.rate_limits_available -eq $false) { $verdict = 'APIKEY' }
      elseif ($r -and -not $r.rate_limits) { $verdict = 'NOAUTH' }
      elseif ($r) {
        $L = $r.rate_limits
        $num = { param($v) if ($v -and (& $isNum $v.utilization)) { [math]::Round([double]$v.utilization, 1) } else { $null } }
        $h = & $num $L.five_hour; $wk = & $num $L.seven_day
        $models = @()
        foreach ($pair in @(@('seven_day_opus','Opus'), @('seven_day_sonnet','Sonnet'))) {
          $v = & $num $L.($pair[0])
          if ($null -ne $v) { $models += [ordered]@{ name = $pair[1]; '7d' = $v } }
        }
        foreach ($ms in @($L.model_scoped)) {
          $v = & $num $ms
          if ($ms -and $ms.display_name -is [string] -and $null -ne $v) { $models += [ordered]@{ name = $ms.display_name; '7d' = $v } }
        }
        if ($null -ne $h -or $null -ne $wk) {
          $res = [ordered]@{ src = 'claude-code' }
          if ($null -ne $h) { $res['5h'] = $h }
          if ($null -ne $wk) { $res['7d'] = $wk }
          if ($models.Count) { $res['models'] = $models }
        } else { $verdict = 'NOWINDOWS' }
      }
      # F176 owner ruling: limits but no windows yet from get_usage -> a forced read (WAIT=1,
      # never the background spawn) of a logged-in profile spends ONE tiny turn and reads
      # its rate_limit_event - only while the last 7d known is under 90%. In doubt, no turn:
      # a corrupt or legacy cache is unknown; only no cache file at all, or a failure
      # record that carries `"last":null` (never a reading), counts as blank. A carried
      # reading counts for 7 days from its `at` (a reset is plausible after: unknown), and
      # a turn that gave no limits (`turned_at`) holds turns 24 h.
      # Read only where a turn may follow; 'unread' never passes the gate.
      $gateOk = $false
      if ($verdict -eq 'NOWINDOWS' -and $forced -and (Get-Command node -ErrorAction SilentlyContinue)) {
        & node (Join-Path $PSScriptRoot 'quota-policy.cjs') $cache 2>$null
        $gateOk = $LASTEXITCODE -eq 0
      }
      if ($gateOk -and
          ((Test-Path -LiteralPath (Join-Path $Dir '.credentials.json')) -or $IsMacOS) -and
          $raw -notmatch 'session expired|Failed to authenticate') {
        # The smallest turn: no tools, no MCP, no saved session (flags from `claude --help`;
        # --max-turns is unlisted but parsed). '""' reaches the CLI as an empty --tools list.
        $turn = Invoke-Capped 30 '$null | claude -p 1 --model haiku --max-turns 1 --no-session-persistence --strict-mcp-config --output-format stream-json --verbose --tools ''""'' 2>$null'
        $u = $null
        foreach ($l in ($turn -split "`r?`n")) {
          $m = try { ConvertFrom-Json $l -ErrorAction Stop } catch { $null }
          if ($m -and $m.type -eq 'rate_limit_event' -and $m.rate_limit_info.unifiedWindows) { $u = $m.rate_limit_info.unifiedWindows }
        }
        $tn = { param($v) if ($v -and (& $isNum $v.utilization)) { [math]::Round([double]$v.utilization * 100, 1) } else { $null } }
        if ($u) {
          $h = & $tn $u.five_hour; $wk = & $tn $u.seven_day
          if ($null -ne $h -or $null -ne $wk) {
            $res = [ordered]@{ src = 'claude-code' }
            if ($null -ne $h) { $res['5h'] = $h }
            if ($null -ne $wk) { $res['7d'] = $wk }
            $res['via'] = 'turn'
          }
        }
        $turned = -not $res
      }
    } elseif ($Cli -eq 'muse') {
      $env:MUSE_CONFIG_DIR = $Dir
      try { $raw = & muse usage --json 2>&1 | Out-String } catch { $raw = '' }
      if ($raw -and $raw -notmatch 'not logged in') {
        $p = try { ConvertFrom-Json $raw -ErrorAction Stop } catch { $null }
        $h = if ($p -and $null -ne $p.five_hour) { [double]$p.five_hour } else { $null }
        $wk = if ($p -and $null -ne $p.weekly) { [double]$p.weekly } else { $null }
        if ($null -ne $h -or $null -ne $wk) {
          $res = [ordered]@{ src = 'muse' }
          if ($null -ne $h) { $res['5h'] = $h }
          if ($null -ne $wk) { $res['7d'] = $wk }
        }
      }
    }
    if (-not $res) {
      # Re-read at write time, as sh's carry does: a reading stored during the turn is carried.
      $prev = & $readPrev
      $srcName = if ($Cli -eq 'claude') { 'claude-code' } else { $Cli }
      $failNote = if ($raw -and $raw -match 'not logged in') { 'not logged in' }
                  elseif ($Cli -eq 'claude' -and $raw -and $raw -match 'session expired|Failed to authenticate') { 'login expired - run claude /login' }
                  elseif ($verdict -eq 'NOAUTH') { 'no usage reading - login may have expired, run claude /login' }
                  elseif ($verdict -eq 'APIKEY') { 'no plan rate limits (API key or limited-scope login)' }
                  elseif ($turned) { 'one turn gave no limits' }
                  elseif ($verdict -eq 'NOWINDOWS') { 'no plan rate limits' }
                  elseif ($raw -and $raw.Trim()) { 'unparseable' }
                  else { 'refresh failed' }
      # F176: a failure record carries the last good readings (`last`: 5h, 7d and when),
      # so the turn gate never loses a high 7d; `"last":null` = no reading ever, while a
      # corrupt or legacy cache leaves `last` out (unknown). A turn that gave no limits
      # stamps `turned_at` (carried until a reading replaces the record).
      $prevFailures = 0; $last = 'omit'; $kept = $false
      if ($prev -is [string]) { if ($prev -eq 'missing') { $last = $null } }
      else {
        $h = if (& $isNum $prev.'5h') { $prev.'5h' } elseif (& $isNum $prev.five) { $prev.five } else { $null }
        $wk = if (& $isNum $prev.'7d') { $prev.'7d' } elseif (& $isNum $prev.weekly) { $prev.weekly } else { $null }
        $mt = (Get-Item -LiteralPath $cache).LastWriteTimeUtc
        $at = [long][Math]::Floor(($mt - [datetime]'1970-01-01').TotalSeconds)
        # A236: a reading written strictly after this refresh started is current - kept (a
        # turn's turned_at stamped on it), never moved into last under a failure record.
        if (($null -ne $h -or $null -ne $wk) -and $mt -gt $started) { $kept = $true }
        elseif ($null -ne $h -or $null -ne $wk) {
          $last = [ordered]@{}
          if ($null -ne $h) { $last['5h'] = $h }
          if ($null -ne $wk) { $last['7d'] = $wk }
          $last['at'] = $at
        } else {
          if (($prev.failures -is [int] -or $prev.failures -is [long]) -and $prev.failures -ge 1) { $prevFailures = [int]$prev.failures }
          if ($prev.PSObject.Properties['last']) { $last = $prev.last }
        }
      }
      if ($kept) {
        $res = $prev
        if ($turned) { $res | Add-Member -NotePropertyName turned_at -NotePropertyValue $now -Force }
      } else {
        $failures = $prevFailures + 1
        $backoff = [int][Math]::Min(900, 60 * [Math]::Pow(2, [Math]::Min($failures - 1, 10)))
        $res = [ordered]@{ src = $srcName; note = $failNote; failures = $failures; backoff_secs = $backoff }
        if ($last -isnot [string]) { $res['last'] = $last }
        if ($turned) { $res['turned_at'] = $now }
        elseif ($prev -isnot [string] -and $prev.PSObject.Properties['turned_at']) { $res['turned_at'] = $prev.turned_at }
      }
    }
    $absCache = [IO.Path]::Combine((Convert-Path -LiteralPath $Dir), 'quota-cache.json')
    [IO.File]::WriteAllText($absCache, (ConvertTo-Json $res -Compress -Depth 4), (New-Object Text.UTF8Encoding $false))
  } finally {
    $env:AGY_CONFIG_DIR = $oldAgy; $env:ANTIGRAVITY_APP_DATA_DIR = $oldApp
    $env:CLAUDE_CONFIG_DIR = $oldCfg; $env:MUSE_CONFIG_DIR = $oldMuse
    Remove-Item -LiteralPath $lock -ErrorAction SilentlyContinue
  }
  exit 0
}

# level (F31): one machine line for relay-morpheus's chain hold, and nothing
# else - no stdin, no .done, no threshold. Missing profile caches refresh asynchronously. Same source
# order and same bytes as the sh twin:
#   src=<claude-code|codex|none> 5h=<pct|-> 7d=<pct|-> ctx=<pct|-> max=<pct|->
# On Claude Code 5h is the probe's .fivehour flag; absent, or older than the
# codex freshness window ($staleHours), it prints '-'. max
# is the max of every window, context included, for reading only: relay's
# chain decide never holds on it - with no 5h it uses 7d, else unobservable.
if ($Mode -eq 'level') {
  $src = 'none'; $h = '-'; $wk = '-'; $cx = '-'; $mx = '-'; $noteTag = ''
  $roll = $selectedRoll
  if ($roll -and $roll.LastWriteTime -gt (Get-Date).AddHours(-$staleHours)) {
    $l = @(Get-CodexLevel $roll.FullName)
    if ($l.Count -eq 3 -and ($l | Where-Object { $_ -ne '-' })) {
      $src = 'codex'; $h = $l[0]; $wk = $l[1]; $cx = $l[2]
      $mx = ($l | Where-Object { $_ -ne '-' } | Sort-Object { [double]::Parse($_, $inv) } | Select-Object -Last 1)
    }
  }
  if ($src -eq 'none' -and $selectedHost -eq 'claude-code' -and -not $sourceError) {
    # A130: this session's flags only, and every one inside the same freshness
    # window as a codex rollout: the statusline rewrites them on every render,
    # so an older one is a dead or idle session's - unobservable, not a
    # reading to hold on.
    $key = Get-FlagKey
    if ($key) {
      $src = 'claude-code'
      $v = Read-Fresh (Join-Path $dir $key) ${function:Read-Token};             if ($null -ne $v) { $mx = $v }
      $v = Read-Fresh (Join-Path $dir "$key.fivehour") ${function:Read-Token};  if ($null -ne $v) { $h = $v }
      $v = Read-Fresh (Join-Path $dir "$key.weekly") ${function:Read-Token};    if ($null -ne $v) { $wk = $v }
      $v = Read-Fresh (Join-Path $dir "$key.ctx") ${function:Read-Token};       if ($null -ne $v) { $cx = $v }
    }
  }
  if ($src -eq 'none' -or ($src -eq 'codex' -and $h -eq '-' -and $wk -eq '-')) {
    $cq = Get-CachedQuota
    if ($cq) {
      $src = $cq.src
      if ($null -ne $cq['5h']) { $h = Fmt1 $cq['5h'] }
      if ($null -ne $cq['7d']) { $wk = Fmt1 $cq['7d'] }
      if ($null -ne $cq.max) { $mx = Fmt1 $cq.max }
      elseif ($h -ne '-' -and $wk -ne '-') { $mx = Fmt1 ([math]::Max([double]::Parse($h, $inv), [double]::Parse($wk, $inv))) }
      elseif ($h -ne '-') { $mx = $h } elseif ($wk -ne '-') { $mx = $wk }
      if ($cq.note) { $noteTag = " note=$($cq.note -replace '\s+','_')" }
    } elseif ($env:SKILLATOR_CLI -and $env:SKILLATOR_PROFILE_DIR -and -not $sourceError -and -not $codexSession -and -not $env:CLAUDE_CODE_SESSION_ID -and
              ($selectedHost -in @('claude-code','agy','muse') -or ($selectedHost -eq 'codex' -and (Test-Path -LiteralPath (Join-Path $selectedProfile 'auth.json') -PathType Leaf)))) {
      $refreshCli = if ($selectedHost -eq 'claude-code') { 'claude' } else { $selectedHost }
      Start-QuotaRefresh $refreshCli $selectedProfile
    }
  }
  if ($sourceError) { $noteTag = " note=$sourceError" }
  "src=$src 5h=$h 7d=$wk ctx=$cx max=$mx$noteTag"
  exit 0
}

if ($Mode -eq 'check') {
  # Codex: the rollout JSONL carries rate_limits.*.used_percent and the context total.
  # CODEX_HOME, same as install.ps1 - a relocated codex home must still be watched.
  $roll = $selectedRoll
  $pct = $null; $wk = $null; $src = 'none'; $key = 'none'
  if ($roll -and $roll.LastWriteTime -gt (Get-Date).AddHours(-$staleHours)) {
    $pct = Get-CodexPct $roll.FullName
    $wk  = Get-CodexWeeklyPct $roll.FullName
    if ($null -ne $pct -or $null -ne $wk) { $src = 'codex'; $key = $roll.BaseName }
  }
  # Claude Code: the statusline probe already wrote the number.
  if ($null -eq $pct -and $null -eq $wk -and $selectedHost -eq 'claude-code' -and -not $sourceError) {
    # A130: this session's flags only (Get-FlagKey), each one read only while
    # fresh. A weekly flag with no main flag beside it still counts (A101).
    $k = Get-FlagKey
    if ($k) {
      $pct = Read-Fresh (Join-Path $dir $k) ${function:Read-Flag}
      $wk  = Read-Fresh (Join-Path $dir "$k.weekly") ${function:Read-Flag}
      if ($null -ne $pct -or $null -ne $wk) { $src = 'claude-code'; $key = $k }
    }
  }
  if ($null -eq $pct -and $null -eq $wk) {
    $cq = Get-CachedQuota
    if ($cq) {
      if ($null -ne $cq['5h']) { $pct = [double]$cq['5h'] }
      if ($null -ne $cq['7d']) { $wk  = [double]$cq['7d'] }
      if ($null -ne $pct -or $null -ne $wk) {
        $src = $cq.src
        $key = "$($cq.src)-cache"
      }
    }
  }
  if ($null -eq $pct -and $null -eq $wk -and $selectedHost -eq 'cursor' -and -not $sourceError) {
    # Check cursor estimated usage ledger
    $cands = @(
      if ($env:SKILLATOR_PROFILE_DIR) { Join-Path $selectedProfile 'cursor-ledger.json' }
      elseif ($env:CURSOR_LEDGER_PATH) { $env:CURSOR_LEDGER_PATH }
      else { Join-Path $selectedProfile 'cursor-ledger.json' }
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

    foreach ($clp in $cands) {
      try {
        $rawLedger = [IO.File]::ReadAllText((Convert-Path -LiteralPath $clp))
        $json = ConvertFrom-Json $rawLedger -ErrorAction SilentlyContinue
        $budget = if ($json.budget_tokens) { [double]$json.budget_tokens }
                  elseif ($json.budget_cost) { [double]$json.budget_cost }
                  elseif ($json.budget) { [double]$json.budget }
                  else { $null }
        if ($null -ne $budget -and $budget -gt 0) {
          $bDay = if ($json.billing_day) { [int]$json.billing_day } else { 1 }
          $now = if ($env:SKILLATOR_NOW) { [DateTime]::Parse($env:SKILLATOR_NOW).ToUniversalTime() } else { (Get-Date).ToUniversalTime() }
          $cycleYear = $now.Year
          $cycleMonth = $now.Month
          if ($now.Day -lt $bDay) {
            $cycleMonth--
            if ($cycleMonth -lt 1) { $cycleMonth = 12; $cycleYear-- }
          }
          $daysInMonth = [DateTime]::DaysInMonth($cycleYear, $cycleMonth)
          $clampedDay = [Math]::Min($bDay, $daysInMonth)
          $cycleStart = [DateTime]::new($cycleYear, $cycleMonth, $clampedDay, 0, 0, 0, [DateTimeKind]::Utc)

          $tot = 0.0
          if ($json.runs) {
            foreach ($r in $json.runs) {
              if ($r.timestamp) {
                try {
                  $ts = [DateTime]::Parse($r.timestamp).ToUniversalTime()
                  if ($ts -lt $cycleStart) { continue }
                } catch { }
              }
              if ($json.budget_cost) {
                $c = if ($null -ne $r.cost) { $r.cost } elseif ($null -ne $r.cost_usd) { $r.cost_usd } elseif ($r.usage -and $null -ne $r.usage.cost) { $r.usage.cost } elseif ($r.usage -and $null -ne $r.usage.cost_usd) { $r.usage.cost_usd } else { 0 }
                $tot += [double]$c
              } else {
                $tok = if ($null -ne $r.tokens) { $r.tokens } elseif ($r.usage -and $null -ne $r.usage.total_tokens) { $r.usage.total_tokens } else {
                  $inT = if ($r.usage -and $r.usage.inputTokens) { $r.usage.inputTokens } elseif ($r.usage -and $r.usage.prompt_tokens) { $r.usage.prompt_tokens } else { 0 }
                  $outT = if ($r.usage -and $r.usage.outputTokens) { $r.usage.outputTokens } elseif ($r.usage -and $r.usage.completion_tokens) { $r.usage.completion_tokens } else { 0 }
                  $cR = if ($r.usage -and $r.usage.cacheReadTokens) { $r.usage.cacheReadTokens } else { 0 }
                  $cW = if ($r.usage -and $r.usage.cacheWriteTokens) { $r.usage.cacheWriteTokens } else { 0 }
                  [double]$inT + [double]$outT + [double]$cR + [double]$cW
                }
                $tot += [double]$tok
              }
            }
          }
          $estPct = [Math]::Round(($tot / $budget) * 100)
          "watch-cortana: cursor est $estPct% of budget (skillator runs only) - check cursor.com/settings"
          exit 0
        }
      } catch { }
    }
  }
  # ponytail: cursor and antigravity expose no usage anywhere on disk - say so
  # rather than invent a number. Upgrade here if either ever writes one.
  if ($null -eq $pct -and $null -eq $wk) { "watch-cortana: no usage signal on this host ($selectedHost $sourceError) - run skillator:handoff-cortana manually before you run out"; exit 0 }
  $done   = Join-Path $dir "$key.done"
  $wkDone = Join-Path $dir "$key.weekly.done"
  # The weekly gate applies on every host, not just the one with a Stop hook,
  # and has its own .done so a 5-hour fire earlier in the session cannot eat
  # the weekly order when the 7-day window crosses hours later.
  if ($null -ne $wk -and $wk -ge $wkLimit -and -not (Test-Path $wkDone)) {
    New-Item $dir -ItemType Directory -Force | Out-Null
    New-Item $wkDone -ItemType File -Force | Out-Null
    "HANDOFF NOW ($src 7-day $wk%)"; Get-WeeklyReason $wk $wkLimit
  } elseif ($pct -ge $pctLimit -and -not (Test-Path $done)) {
    New-Item $dir -ItemType Directory -Force | Out-Null
    New-Item $done -ItemType File -Force | Out-Null
    "HANDOFF NOW ($src $pct%)"; Get-Reason $pct $pctLimit
  } else {
    $shown = if ($null -ne $pct) { $pct } else { $wk }
    "watch-cortana: $src $shown% of $pctLimit% - ok"
  }
  exit 0
}

$raw  = [Console]::In.ReadToEnd()
$sid  = if ($raw -match '"session_id"\s*:\s*"([^"]+)"') { $Matches[1] } else { 'unknown' }
$flag = Join-Path $dir $sid

if ($Mode -eq 'probe') {
  # ponytail: regex over the raw JSON instead of walking it - catches every
  # used_percentage (5h window, context window) whatever the shape. B31: not
  # the 7-day one, as on the codex path (A98) - it has its own 97% gate, and in
  # the max a 96% week fired the 92% handoff.
  $pcts = [regex]::Matches(($raw -replace '"seven_day"\s*:\s*\{[^}]*\}', ''), '"used_percentage"\s*:\s*([0-9.]+)') | ForEach-Object { [double]$_.Groups[1].Value }
  if ($pcts) { Write-Flag $flag (($pcts | Measure-Object -Maximum).Maximum) }
  # The weekly number needs its own file: the main flag is read by the sh twin
  # as bare bytes with no line endings (A12), so a second value cannot share it.
  # Greedy `[^}]*`, like the sh twin, so both pick the same used_percentage if
  # seven_day ever carries more than one. NOT byte-identical behaviour: .NET's
  # `\s*` and `[^}]*` cross newlines, while the sh twin strips spaces and tabs
  # then greps line by line - so a pretty-printed payload yields a number here
  # and none there. Claude Code sends one line; if that ever changes, the sh
  # twin is the one that breaks.
  if ($raw -match '"seven_day"\s*:\s*\{[^}]*"used_percentage"\s*:\s*([0-9.]+)') {
    Write-Flag "$flag.weekly" $Matches[1]
  } else {
    Remove-Item "$flag.weekly" -ErrorAction SilentlyContinue   # never let a stale weekly number outlive its payload
  }
  # F31: the 5-hour window and the context on their own, for `level`. The key
  # is rate_limits.five_hour.used_percentage (verified against the statusline
  # docs, 2026-10-10); the main flag stays the max of every non-7-day window. The value
  # is written as the payload spelled it, so both twins read the same bytes.
  foreach ($pair in @(@('five_hour', 'fivehour'), @('context_window', 'ctx'))) {
    if ($raw -match ('"' + $pair[0] + '"\s*:\s*\{[^}]*"used_percentage"\s*:\s*([0-9.]+)')) {
      $p = "$flag.$($pair[1])"; $dp = Split-Path $p -Parent
      New-Item $dp -ItemType Directory -Force | Out-Null
      [IO.File]::WriteAllText([IO.Path]::Combine((Convert-Path $dp), (Split-Path $p -Leaf)), $Matches[1])
    } else {
      Remove-Item "$flag.$($pair[1])" -ErrorAction SilentlyContinue
    }
  }
  if ($Then) { $raw | & powershell -NoProfile -ExecutionPolicy Bypass -Command $Then }
  exit 0
}

# gate
if ($raw -match '"stop_hook_active"\s*:\s*true') { exit 0 }   # never loop on ourselves
# No early return on a missing main flag: the two flags are written
# independently, so "weekly recorded, max not" is a reachable state, and it is
# the one a broken probe leaves behind.
$pct = Read-Flag $flag
$wk = $null
$done = "$flag.done"
# A83: codex has no statusline, so no probe ever wrote a flag. Its Stop stdin
# carries transcript_path, this session's own rollout - read the usage there.
# Only a rollout-*.jsonl counts: Claude Code's Stop sends one too.
# A98: window_minutes 10080 is the 7-day window - Get-CodexWeeklyPct reads it
# separately so it gets the same weekly gate as the Claude path below.
if ($null -eq $pct -and -not (Test-Path "$flag.weekly") -and
    $raw -match '"transcript_path"\s*:\s*"([^"]+)"') {
  $tp = $Matches[1] -replace '\\\\', '/'   # JSON's escaped backslash pair
  if ((Split-Path $tp -Leaf) -like 'rollout-*.jsonl' -and (Test-Path -LiteralPath $tp)) {
    $pct = Get-CodexPct $tp
    $wk  = Get-CodexWeeklyPct $tp
  }
}
# Weekly first, and with its OWN one-shot marker. Sharing `$flag.done` meant a
# 5-hour fire at 10:00 silently ate the weekly order when the 7-day window
# crossed at 14:00 - the one window whose crossing the user has to answer.
if ($null -eq $wk) { $wk = Read-Flag "$flag.weekly" }
if ($null -ne $wk -and $wk -ge $wkLimit -and -not (Test-Path "$flag.weekly.done")) {
  New-Item "$flag.weekly.done" -ItemType File -Force | Out-Null
  @{ decision = 'block'; reason = (Get-WeeklyReason $wk $wkLimit) } | ConvertTo-Json -Compress
  exit 0
}
if (Test-Path $done) { exit 0 }
if ($null -eq $pct -or $pct -lt $pctLimit) { exit 0 }
New-Item $done -ItemType File -Force | Out-Null
@{ decision = 'block'; reason = (Get-Reason $pct $pctLimit) } | ConvertTo-Json -Compress
