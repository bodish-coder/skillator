# watch-cortana: record usage % and act on it before the session is cut off.
#   -Mode probe [-Then "<original statusline command>"]   (Claude Code statusLine)
#   -Mode gate                                            (Claude Code / codex Stop hook)
#   -Mode check                                           (any host, no stdin - see below)
#   -Mode level                                           (any host, no stdin, no side effect)
# Threshold: $env:CLAUDE_USAGE_HANDOFF_PCT, default 92.
# State dir: $env:CLAUDE_USAGE_WATCH_DIR, else $env:CLAUDE_CONFIG_DIR/handoff-watch,
# else ~/.claude/handoff-watch (the first override exists so tests never touch
# a live session's flags; A130: the second keeps a profile's flags its own).
#
# Claude Code and codex (A83: gate reads the rollout named by transcript_path)
# have a Stop hook that can inject. Cursor/Antigravity get `check`, which reads
# whatever the host leaves on disk and prints the order for the agent to follow.
# Wired by the always-on project file grayskull-power writes, not by a hook.
param(
  [ValidateSet('probe','gate','check','level','refresh')][string]$Mode = 'probe',
  [string]$Then,
  [string]$Cli,
  [string]$Dir
)

# The state dir keeps its original name on purpose - see the sh twin.
# A130: a CLAUDE_CONFIG_DIR profile keeps its flags in its own config dir - the
# probe writes there and check/level read there, so one profile never reads
# another's sessions. Same order as the ops-board mod's usage read.
$dir      = if ($env:CLAUDE_USAGE_WATCH_DIR) { $env:CLAUDE_USAGE_WATCH_DIR }
            elseif ($env:CLAUDE_CONFIG_DIR) { Join-Path $env:CLAUDE_CONFIG_DIR 'handoff-watch' }
            else { Join-Path $HOME '.claude/handoff-watch' }
$pctLimit = if ($env:CLAUDE_USAGE_HANDOFF_PCT) { [double]$env:CLAUDE_USAGE_HANDOFF_PCT } else { 92 }
# The 7-day window is watched separately and lower. The 5-hour window refills
# in hours, so crossing it is a pause; the weekly one does not, so crossing it
# ends the week's work - which is why it gets its own threshold and its own
# fourth step: ask where to go next rather than leave the user to guess.
$wkLimit  = if ($env:CLAUDE_USAGE_HANDOFF_WEEKLY_PCT) { [double]$env:CLAUDE_USAGE_HANDOFF_WEEKLY_PCT } else { 90 }
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

# Read a percentage defensively: first numeric token in the file, so a BOM, a
# CR, stray whitespace or a half-written line can never become a bogus number.
function Read-Flag($path) {
  if (-not (Test-Path $path)) { return $null }
  try { $t = [IO.File]::ReadAllText((Convert-Path $path)) } catch { return $null }
  if ($t -match '[0-9]+(\.[0-9]+)?') { return [double]::Parse($Matches[0], $inv) }
  return $null
}

# Step 4 is spliced in BEFORE Get-Reason's closing "Then tell the user where
# the file is and stop." - appending it after put the stop instruction ahead of
# the one step whose whole point is that the session must not stop on a
# summary. The sh twin has always spliced; this is the mirror catching up.
function Get-WeeklyReason($pct, $limit) {
  $tail = ' Then tell the user where the file is and stop.'
  $step4 = ' (4) This is the 7-DAY window, which does not refill for days - the work is over for now, not paused. So after the handoff, do not stop on a summary: use AskUserQuestion to put the next direction to the user as concrete options drawn from the open board and the handoff''s own next-steps, say which one you recommend and why in one line, and make the recommendation the first option.'
  (Get-Reason $pct $limit).Replace($tail, $step4 + $tail)
}

function Get-Reason($pct, $limit) {
  "Usage has reached $pct% of the limit (threshold $limit%). Stop the current work and preserve the session now - it can be cut off at any moment. In order: (1) if any subagent, workflow or background task is still running, wait for it or stop it and record what it had done - never leave in-flight agent work undescribed; (2) invoke skillator:tickets-zordon to sync TICKETS.md - sync statuses only, do NOT start working open tickets, usage is nearly gone: close what actually landed, mark what is half-done as in-progress, and file a ticket for anything discovered this session that has no ticket; (3) invoke skillator:handoff-cortana and write the document, whose status table must match TICKETS.md ticket-for-ticket and must list the in-flight agent work from step 1 with the exact prompt needed to resume it. Then tell the user where the file is and stop."
}

# Last token_count line of a codex rollout, or $null.
function Get-CodexLastTc($path) {
  Get-Content -LiteralPath $path -Tail 400 | Where-Object { $_ -match '"token_count"' } | Select-Object -Last 1
}

# A starting child has no usage event yet; it must not hide a fresh reading.
function Get-CodexRollout($codexHome) {
  $sess = Join-Path $codexHome 'sessions'
  if (-not (Test-Path -LiteralPath $sess)) { return $null }
  $rolls = Get-ChildItem $sess -Recurse -File -Filter 'rollout-*.jsonl' -ErrorAction SilentlyContinue |
           Where-Object { $_.LastWriteTime -gt (Get-Date).AddHours(-$staleHours) } | Sort-Object LastWriteTime -Descending
  foreach ($roll in $rolls) {
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

# F31: the first numeric token of a flag file AS WRITTEN ('12.0' stays '12.0'),
# so `level` prints the same bytes as the sh twin's read_pct; $null if none.
function Read-Token($path) {
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  try { $t = [IO.File]::ReadAllText((Convert-Path -LiteralPath $path)) } catch { return $null }
  if ($t -match '[0-9]+(\.[0-9]+)?') { return $Matches[0] }
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
    if ((Test-Fresh (Join-Path $dir $k)) -or (Test-Fresh (Join-Path $dir "$k.weekly"))) { return $k }
    return $null
  }
  # `.weekly` is written after the main flag, so it is always the newest -
  # the main flag is picked first, by name, never by mtime alone.
  $f = Get-ChildItem $dir -File -ErrorAction SilentlyContinue |
       Where-Object { $_.Extension -notin @('.done', '.weekly', '.fivehour', '.ctx') } | Sort-Object LastWriteTime | Select-Object -Last 1
  if ($f) { if (Test-Fresh $f.FullName) { return $f.Name }; return $null }
  # A101: a weekly flag with no main flag beside it is a real state.
  $f = Get-ChildItem $dir -File -ErrorAction SilentlyContinue |
       Where-Object { $_.Extension -eq '.weekly' } | Sort-Object LastWriteTime | Select-Object -Last 1
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
  $cands = @(
    if ($env:CLAUDE_USAGE_WATCH_DIR) { Join-Path $env:CLAUDE_USAGE_WATCH_DIR 'quota-cache.json' }
    if ($env:SKILLATOR_PROFILE_DIR) { Join-Path $env:SKILLATOR_PROFILE_DIR 'quota-cache.json' }
    if ($env:AGY_CONFIG_DIR) { Join-Path $env:AGY_CONFIG_DIR 'quota-cache.json' }
    if ($env:MUSE_CONFIG_DIR) { Join-Path $env:MUSE_CONFIG_DIR 'quota-cache.json' }
    if ($env:CLAUDE_CONFIG_DIR) { Join-Path $env:CLAUDE_CONFIG_DIR 'quota-cache.json' }
    if ($env:CLAUDE_CONFIG_DIR) { Join-Path $env:CLAUDE_CONFIG_DIR 'handoff-watch\quota-cache.json' }
    Join-Path $dir 'quota-cache.json'
    if ($env:ANTIGRAVITY_APP_DATA_DIR) { Join-Path $env:ANTIGRAVITY_APP_DATA_DIR 'quota-cache.json' }
    Join-Path $HOME '.gemini\antigravity-cli\quota-cache.json'
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

  foreach ($cp in $cands) {
    if (Test-Fresh $cp) {
      try {
        $raw = [IO.File]::ReadAllText((Convert-Path -LiteralPath $cp))
        $s = if ($raw -match '"src"\s*:\s*"([^"]+)"') { $Matches[1] } else { 'none' }
        $h = if ($raw -match '"(?:5h|five)"\s*:\s*([0-9.]+)') { $Matches[1] } else { $null }
        $w = if ($raw -match '"(?:7d|weekly)"\s*:\s*([0-9.]+)') { $Matches[1] } else { $null }
        $n = if ($raw -match '"note"\s*:\s*"([^"]+)"') { $Matches[1] } else { $null }
        $m = if ($raw -match '"max"\s*:\s*([0-9.]+)') { $Matches[1] } else { $null }
        return @{ src = $s; '5h' = $h; '7d' = $w; max = $m; note = $n; path = $cp }
      } catch { }
    }
  }
  return $null
}

function Start-QuotaRefresh([string]$targetCli, [string]$targetDir) {
  if (-not $targetCli -or -not $targetDir) { return }
  $lock = Join-Path $targetDir 'quota-cache.json.refreshing'
  if (Test-Path -LiteralPath $lock) {
    $item = Get-Item -LiteralPath $lock -ErrorAction SilentlyContinue
    if ($item -and $item.LastWriteTime -gt (Get-Date).AddSeconds(-60)) { return }
  }
  New-Item $targetDir -ItemType Directory -Force | Out-Null
  Set-Content -LiteralPath $lock -Value (Get-Date).ToString()

  $ps1 = $MyInvocation.MyCommand.Path
  if (-not $ps1) { $ps1 = $PSCommandPath }
  if ($ps1) {
    $arg = "-NoProfile -ExecutionPolicy Bypass -File `"$ps1`" -Mode refresh -Cli $targetCli -Dir `"$targetDir`""
    try { Start-Process powershell -ArgumentList $arg -WindowStyle Hidden } catch { }
  }
}

if ($Mode -eq 'refresh') {
  if (-not $Cli -or -not $Dir) { exit 0 }
  $lock = Join-Path $Dir 'quota-cache.json.refreshing'
  $cache = Join-Path $Dir 'quota-cache.json'
  try {
    $res = $null
    if ($Cli -eq 'agy') {
      $raw = & agy -p "/usage" --output-format json 2>$null | Out-String
      if ($raw) {
        $parsed = ConvertFrom-Json $raw -ErrorAction SilentlyContinue
        $h = $null; $wk = $null
        if ($parsed.command.data.groups) {
          foreach ($g in $parsed.command.data.groups) {
            if ($g.buckets) {
              foreach ($b in $g.buckets) {
                if ($null -ne $b.remaining_fraction) {
                  $used = [math]::Round((1.0 - [double]$b.remaining_fraction) * 100, 1)
                  if ($b.window -match '5h' -or $b.window -match 'hour') {
                    if ($null -eq $h -or $used -gt $h) { $h = $used }
                  } elseif ($b.window -match 'week' -or $b.window -match '7d') {
                    if ($null -eq $wk -or $used -gt $wk) { $wk = $used }
                  }
                }
              }
            }
          }
        }
        if ($null -ne $h -or $null -ne $wk) {
          $res = @{ src = 'agy'; '5h' = $h; '7d' = $wk }
        }
      }
    } elseif ($Cli -eq 'claude') {
      $oldCfg = $env:CLAUDE_CONFIG_DIR
      $env:CLAUDE_CONFIG_DIR = $Dir
      $raw = & claude -p "/usage" --output-format json 2>$null | Out-String
      $env:CLAUDE_CONFIG_DIR = $oldCfg
      if ($raw) {
        $h = $null; $wk = $null
        if ($raw -match 'Current session:\s*([0-9.]+)%\s*used') { $h = [double]$Matches[1] }
        if ($raw -match 'Current week[^:]*:\s*([0-9.]+)%\s*used') { $wk = [double]$Matches[1] }
        if ($null -ne $h -or $null -ne $wk) {
          $res = @{ src = 'claude-code'; '5h' = $h; '7d' = $wk }
        }
      }
    } elseif ($Cli -eq 'muse') {
      $raw = & muse usage --json 2>$null | Out-String
      if ($LASTEXITCODE -ne 0 -or $raw -match 'not logged in') {
        $res = @{ src = 'muse'; note = 'not logged in' }
      } else {
        $p = ConvertFrom-Json $raw -ErrorAction SilentlyContinue
        if ($p) { $res = @{ src = 'muse'; '5h' = $p.five_hour; '7d' = $p.weekly } }
        else { $res = @{ src = 'muse'; note = 'unparseable' } }
      }
    }
    if ($res) {
      [IO.File]::WriteAllText($cache, (ConvertTo-Json $res -Compress))
    }
  } finally {
    Remove-Item -LiteralPath $lock -ErrorAction SilentlyContinue
  }
  exit 0
}

# level (F31): one machine line for relay-morpheus's chain hold, and nothing
# else - no stdin, no .done, no threshold, no directory created. Same source
# order and same bytes as the sh twin:
#   src=<claude-code|codex|none> 5h=<pct|-> 7d=<pct|-> ctx=<pct|-> max=<pct|->
# On Claude Code 5h is the probe's .fivehour flag; absent, or older than the
# codex freshness window ($staleHours), it prints '-'. max
# is the max of every window, context included, for reading only: relay's
# chain decide never holds on it - with no 5h it uses 7d, else unobservable.
if ($Mode -eq 'level') {
  $src = 'none'; $h = '-'; $wk = '-'; $cx = '-'; $mx = '-'; $noteTag = ''
  $codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }
  $roll = Get-CodexRollout $codexHome
  if ($roll -and $roll.LastWriteTime -gt (Get-Date).AddHours(-$staleHours)) {
    $l = @(Get-CodexLevel $roll.FullName)
    if ($l.Count -eq 3 -and ($l | Where-Object { $_ -ne '-' })) {
      $src = 'codex'; $h = $l[0]; $wk = $l[1]; $cx = $l[2]
      $mx = ($l | Where-Object { $_ -ne '-' } | Sort-Object { [double]::Parse($_, $inv) } | Select-Object -Last 1)
    }
  }
  if ($src -eq 'none') {
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
  if ($src -eq 'none') {
    $cq = Get-CachedQuota
    if ($cq) {
      $src = $cq.src
      if ($cq['5h']) { $h = Fmt1 $cq['5h'] }
      if ($cq['7d']) { $wk = Fmt1 $cq['7d'] }
      if ($cq.max) { $mx = Fmt1 $cq.max }
      elseif ($h -ne '-' -and $wk -ne '-') { $mx = Fmt1 ([math]::Max([double]::Parse($h, $inv), [double]::Parse($wk, $inv))) }
      elseif ($h -ne '-') { $mx = $h } elseif ($wk -ne '-') { $mx = $wk }
      if ($cq.note) { $noteTag = " note=$($cq.note -replace '\s+','_')" }
    } elseif ($env:SKILLATOR_CLI -and $env:SKILLATOR_PROFILE_DIR) {
      Start-QuotaRefresh $env:SKILLATOR_CLI $env:SKILLATOR_PROFILE_DIR
    }
  }
  "src=$src 5h=$h 7d=$wk ctx=$cx max=$mx$noteTag"
  exit 0
}

if ($Mode -eq 'check') {
  # Codex: the rollout JSONL carries rate_limits.*.used_percent and the context total.
  # CODEX_HOME, same as install.ps1 - a relocated codex home must still be watched.
  $codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }
  $roll = Get-CodexRollout $codexHome
  $pct = $null; $wk = $null; $src = 'none'; $key = 'none'
  if ($roll -and $roll.LastWriteTime -gt (Get-Date).AddHours(-$staleHours)) {
    $pct = Get-CodexPct $roll.FullName
    $wk  = Get-CodexWeeklyPct $roll.FullName
    if ($null -ne $pct -or $null -ne $wk) { $src = 'codex'; $key = $roll.BaseName }
  }
  # Claude Code: the statusline probe already wrote the number.
  if ($null -eq $pct -and $null -eq $wk) {
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
      if ($cq['5h']) { $pct = [double]::Parse($cq['5h'], $inv) }
      if ($cq['7d']) { $wk  = [double]::Parse($cq['7d'], $inv) }
      if ($null -ne $pct -or $null -ne $wk) {
        $src = $cq.src
        $key = "$($cq.src)-cache"
      }
    }
  }
  if ($null -eq $pct -and $null -eq $wk) {
    # Check cursor estimated usage ledger
    $cands = @(
      if ($env:CURSOR_LEDGER_PATH) { $env:CURSOR_LEDGER_PATH }
      if ($env:SKILLATOR_PROFILE_DIR) { Join-Path $env:SKILLATOR_PROFILE_DIR 'cursor-ledger.json' }
      if ($env:SKILLATOR_CONFIG_DIR) { Join-Path $env:SKILLATOR_CONFIG_DIR 'cursor-ledger.json' }
      Join-Path $HOME '.skillator\cursor-ledger.json'
      Join-Path $HOME '.cursor\cursor-ledger.json'
      '.skillator\cursor-ledger.json'
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
  if ($null -eq $pct -and $null -eq $wk) { "watch-cortana: no usage signal on this host - run skillator:handoff-cortana manually before you run out"; exit 0 }
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
  # used_percentage (5h window, 7d window, context window) whatever the shape.
  $pcts = [regex]::Matches($raw, '"used_percentage"\s*:\s*([0-9.]+)') | ForEach-Object { [double]$_.Groups[1].Value }
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
  # docs, 2026-10-10); the main flag stays the max of every window. The value
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
