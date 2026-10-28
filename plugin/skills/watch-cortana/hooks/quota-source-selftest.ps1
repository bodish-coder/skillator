# B18: a newly-created rollout must not hide this profile's fresh usage event.
$ErrorActionPreference = 'Stop'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("quota-source-" + [guid]::NewGuid())
$failures = @()
$keep = @{}
foreach ($name in 'CODEX_HOME','CLAUDE_USAGE_WATCH_DIR','CLAUDE_CODE_SESSION_ID') { $keep[$name] = [Environment]::GetEnvironmentVariable($name) }
try {
  $sessions = Join-Path $tmp 'sessions/arbitrary/depth'
  New-Item $sessions -ItemType Directory -Force | Out-Null
  $env:CODEX_HOME = $tmp
  $env:CLAUDE_USAGE_WATCH_DIR = Join-Path $tmp 'no-claude'
  Remove-Item Env:CLAUDE_CODE_SESSION_ID -ErrorAction SilentlyContinue
  $reading = Join-Path $sessions 'rollout-reading.jsonl'
  $empty = Join-Path $sessions 'rollout-starting.jsonl'
  [IO.File]::WriteAllText($reading, '{"type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"total_tokens":10},"model_context_window":100},"rate_limits":{"primary":{"used_percent":0,"window_minutes":10080},"secondary":null}}}')
  [IO.File]::WriteAllText($empty, '{"type":"session_meta","payload":{}}')
  foreach ($kind in 'ps1','sh') {
    (Get-Item $reading).LastWriteTime = (Get-Date).AddMinutes(-2)
    (Get-Item $empty).LastWriteTime = Get-Date
    $script = Join-Path $PSScriptRoot "usage-watch.$kind"
    foreach ($age in 0,4) {
      if ($age) { (Get-Item $reading).LastWriteTime = (Get-Date).AddHours(-$age) }
      if ($kind -eq 'ps1') { $out = & powershell -NoProfile -ExecutionPolicy Bypass -File $script -Mode level }
      else { $out = & 'C:/Program Files/Git/bin/bash.exe' $script level }
      $expected = if ($age) { 'src=none 5h=- 7d=- ctx=- max=-' } else { 'src=codex 5h=- 7d=0.0 ctx=10.0 max=10.0' }
      if ($LASTEXITCODE -ne 0 -or $out -ne $expected) { $failures += "$kind age=$age expected '$expected', got '$out' exit=$LASTEXITCODE" }
    }
  }
  if ($failures.Count) { throw ($failures -join "`n") }
  'ok: both readers skip a starting rollout, preserve zero/weekly-only quota and reject stale fallback'
} finally {
  foreach ($name in $keep.Keys) { [Environment]::SetEnvironmentVariable($name, $keep[$name]) }
  $resolved = [IO.Path]::GetFullPath($tmp)
  if ($resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath())) -and (Split-Path $resolved -Leaf) -like 'quota-source-*') { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
