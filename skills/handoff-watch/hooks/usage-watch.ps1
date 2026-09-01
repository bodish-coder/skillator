# handoff-watch: record usage % from the statusline, act on it at the Stop hook.
#   -Mode probe [-Then "<original statusline command>"]   (statusLine command)
#   -Mode gate                                            (Stop hook)
# Threshold: $env:CLAUDE_USAGE_HANDOFF_PCT, default 97.
param([ValidateSet('probe','gate')][string]$Mode = 'probe', [string]$Then)

$raw  = [Console]::In.ReadToEnd()
$sid  = if ($raw -match '"session_id"\s*:\s*"([^"]+)"') { $Matches[1] } else { 'unknown' }
$dir  = Join-Path $HOME '.claude\handoff-watch'
$flag = Join-Path $dir $sid
$pctLimit = if ($env:CLAUDE_USAGE_HANDOFF_PCT) { [double]$env:CLAUDE_USAGE_HANDOFF_PCT } else { 97 }

if ($Mode -eq 'probe') {
  # ponytail: regex over the raw JSON instead of walking it - catches every
  # used_percentage (5h window, 7d window, context window) whatever the shape.
  $pcts = [regex]::Matches($raw, '"used_percentage"\s*:\s*([0-9.]+)') | ForEach-Object { [double]$_.Groups[1].Value }
  if ($pcts) {
    New-Item $dir -ItemType Directory -Force | Out-Null
    Set-Content $flag (($pcts | Measure-Object -Maximum).Maximum) -Encoding utf8
  }
  if ($Then) { $raw | & powershell -NoProfile -ExecutionPolicy Bypass -Command $Then }
  exit 0
}

# gate
if ($raw -match '"stop_hook_active"\s*:\s*true') { exit 0 }   # never loop on ourselves
if (-not (Test-Path $flag)) { exit 0 }
$pct  = [double]((Get-Content $flag -Raw).Trim())
$done = "$flag.done"
if ($pct -lt $pctLimit -or (Test-Path $done)) { exit 0 }
New-Item $done -ItemType File -Force | Out-Null
@{ decision = 'block'; reason = "Usage has reached $pct% of the limit (threshold $pctLimit%). Stop the current work and preserve the session now - it can be cut off at any moment. In order: (1) if any subagent, workflow or background task is still running, wait for it or stop it and record what it had done - never leave in-flight agent work undescribed; (2) invoke skillator:ticket-master to sync TICKETS.md - sync statuses only, do NOT start working open tickets, usage is nearly gone: close what actually landed, mark what is half-done as in-progress, and file a ticket for anything discovered this session that has no ticket; (3) invoke skillator:handoff and write the document, whose status table must match TICKETS.md ticket-for-ticket and must list the in-flight agent work from step 1 with the exact prompt needed to resume it. Then tell the user where the file is and stop." } | ConvertTo-Json -Compress
