# handoff-watch: record usage % and act on it before the session is cut off.
#   -Mode probe [-Then "<original statusline command>"]   (Claude Code statusLine)
#   -Mode gate                                            (Claude Code Stop hook)
#   -Mode check                                           (any host, no stdin - see below)
# Threshold: $env:CLAUDE_USAGE_HANDOFF_PCT, default 92.
#
# ponytail: only Claude Code has a hook that can both see the usage % and inject
# an instruction at turn end. Codex/Cursor/Antigravity get `check`, which reads
# whatever the host leaves on disk and prints the order for the agent to follow.
# Wired by the always-on project file grayskull-power writes, not by a hook.
param([ValidateSet('probe','gate','check')][string]$Mode = 'probe', [string]$Then)

$dir      = Join-Path $HOME '.claude/handoff-watch'
$pctLimit = if ($env:CLAUDE_USAGE_HANDOFF_PCT) { [double]$env:CLAUDE_USAGE_HANDOFF_PCT } else { 92 }
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

function Get-Reason($pct, $limit) {
  "Usage has reached $pct% of the limit (threshold $limit%). Stop the current work and preserve the session now - it can be cut off at any moment. In order: (1) if any subagent, workflow or background task is still running, wait for it or stop it and record what it had done - never leave in-flight agent work undescribed; (2) invoke skillator:ticket-master to sync TICKETS.md - sync statuses only, do NOT start working open tickets, usage is nearly gone: close what actually landed, mark what is half-done as in-progress, and file a ticket for anything discovered this session that has no ticket; (3) invoke skillator:handoff and write the document, whose status table must match TICKETS.md ticket-for-ticket and must list the in-flight agent work from step 1 with the exact prompt needed to resume it. Then tell the user where the file is and stop."
}

if ($Mode -eq 'check') {
  # Codex: the rollout JSONL carries rate_limits.*.used_percent and the context total.
  # CODEX_HOME, same as install.ps1 - a relocated codex home must still be watched.
  $codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }
  $roll = Get-ChildItem (Join-Path $codexHome 'sessions') -Recurse -Filter 'rollout-*.jsonl' -ErrorAction SilentlyContinue |
          Sort-Object LastWriteTime | Select-Object -Last 1
  $pct = $null; $src = 'none'; $key = 'none'
  if ($roll -and $roll.LastWriteTime -gt (Get-Date).AddHours(-$staleHours)) {
    $line = Get-Content $roll.FullName -Tail 400 | Where-Object { $_ -match '"token_count"' } | Select-Object -Last 1
    if ($line) {
      $vals = [regex]::Matches($line, '"used_percent"\s*:\s*([0-9.]+)') | ForEach-Object { [double]$_.Groups[1].Value }
      # last_token_usage is the size of the live context; total_token_usage is
      # cumulative for the whole session and would read well over 100%.
      if ($line -match '"last_token_usage"\s*:\s*\{[^}]*?"total_tokens"\s*:\s*([0-9]+)[^}]*\}[\s\S]*?"model_context_window"\s*:\s*([0-9]+)') {
        $vals += [math]::Round(100 * [double]$Matches[1] / [double]$Matches[2], 1)
      }
      if ($vals) { $pct = ($vals | Measure-Object -Maximum).Maximum; $src = 'codex'; $key = $roll.BaseName }
    }
  }
  # Claude Code: the statusline probe already wrote the number.
  if ($null -eq $pct) {
    $f = Get-ChildItem $dir -File -ErrorAction SilentlyContinue |
         Where-Object { $_.Extension -ne '.done' } | Sort-Object LastWriteTime | Select-Object -Last 1
    if ($f) { $pct = Read-Flag $f.FullName; if ($null -ne $pct) { $src = 'claude-code'; $key = $f.Name } }
  }
  # ponytail: cursor and antigravity expose no usage anywhere on disk - say so
  # rather than invent a number. Upgrade here if either ever writes one.
  if ($null -eq $pct) { "handoff-watch: no usage signal on this host - run skillator:handoff manually before you run out"; exit 0 }
  $done = Join-Path $dir "$key.done"
  if ($pct -ge $pctLimit -and -not (Test-Path $done)) {
    New-Item $dir -ItemType Directory -Force | Out-Null
    New-Item $done -ItemType File -Force | Out-Null
    "HANDOFF NOW ($src $pct%)"; Get-Reason $pct $pctLimit
  } else {
    "handoff-watch: $src $pct% of $pctLimit% - ok"
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
  if ($Then) { $raw | & powershell -NoProfile -ExecutionPolicy Bypass -Command $Then }
  exit 0
}

# gate
if ($raw -match '"stop_hook_active"\s*:\s*true') { exit 0 }   # never loop on ourselves
if (-not (Test-Path $flag)) { exit 0 }
$pct = Read-Flag $flag
if ($null -eq $pct) { exit 0 }
$done = "$flag.done"
if ($pct -lt $pctLimit -or (Test-Path $done)) { exit 0 }
New-Item $done -ItemType File -Force | Out-Null
@{ decision = 'block'; reason = (Get-Reason $pct $pctLimit) } | ConvertTo-Json -Compress
