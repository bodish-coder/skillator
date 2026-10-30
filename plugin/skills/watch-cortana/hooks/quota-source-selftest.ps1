# B18: a newly-created rollout must not hide this profile's fresh usage event.
$ErrorActionPreference = 'Stop'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("quota-source-" + [guid]::NewGuid())
$failures = @()
$keep = @{}
foreach ($name in 'CODEX_HOME','CLAUDE_USAGE_WATCH_DIR','CLAUDE_CODE_SESSION_ID','SKILLATOR_PROFILE_DIR','SKILLATOR_CLI') { $keep[$name] = [Environment]::GetEnvironmentVariable($name) }
try {
  $sessions = Join-Path $tmp 'sessions/arbitrary/depth'
  New-Item $sessions -ItemType Directory -Force | Out-Null
  $env:CODEX_HOME = $tmp
  $env:CLAUDE_USAGE_WATCH_DIR = Join-Path $tmp 'no-claude'
  Remove-Item Env:CLAUDE_CODE_SESSION_ID, Env:SKILLATOR_PROFILE_DIR, Env:SKILLATOR_CLI -ErrorAction SilentlyContinue
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

  # F118: live quota cache for agy and muse profiles, plus weekly gate
  $cacheDir = Join-Path $tmp 'agy-profile'
  New-Item $cacheDir -ItemType Directory -Force | Out-Null
  $cacheFile = Join-Path $cacheDir 'quota-cache.json'
  $env:SKILLATOR_PROFILE_DIR = $cacheDir
  $env:SKILLATOR_CLI = 'agy'
  (Get-Item $reading).LastWriteTime = (Get-Date).AddHours(-4)

  [IO.File]::WriteAllText($cacheFile, '{"src":"agy","5h":15.0,"7d":71.0,"max":71.0}')
  foreach ($kind in 'ps1','sh') {
    $script = Join-Path $PSScriptRoot "usage-watch.$kind"
    if ($kind -eq 'ps1') {
      $outL = & powershell -NoProfile -ExecutionPolicy Bypass -File $script -Mode level
      $outC = (& powershell -NoProfile -ExecutionPolicy Bypass -File $script -Mode check) -join "`n"
    } else {
      $outL = & 'C:/Program Files/Git/bin/bash.exe' $script level
      $outC = (& 'C:/Program Files/Git/bin/bash.exe' $script check) -join "`n"
    }
    $expL = 'src=agy 5h=15.0 7d=71.0 ctx=- max=71.0'
    if ($LASTEXITCODE -ne 0 -or $outL -ne $expL) { $failures += "$kind agy level expected '$expL', got '$outL' exit=$LASTEXITCODE" }
    if ($outC -notmatch 'watch-cortana:\s*agy\s*15(\.0)?%\s*of\s*92%\s*-\s*ok') { $failures += "$kind agy check expected ok 15%, got '$outC'" }
  }

  # Test 90% weekly gate for agy
  [IO.File]::WriteAllText($cacheFile, '{"src":"agy","5h":15.0,"7d":91.0,"max":91.0}')
  foreach ($kind in 'ps1','sh') {
    Remove-Item (Join-Path $env:CLAUDE_USAGE_WATCH_DIR '*.done') -ErrorAction SilentlyContinue
    $script = Join-Path $PSScriptRoot "usage-watch.$kind"
    $outC = if ($kind -eq 'ps1') { (& powershell -NoProfile -ExecutionPolicy Bypass -File $script -Mode check) -join "`n" }
            else { (& 'C:/Program Files/Git/bin/bash.exe' $script check) -join "`n" }
    if ($outC -notmatch 'HANDOFF NOW \(agy 7-day 91(\.0)?%\)') { $failures += "$kind agy 90% weekly gate expected handoff, got '$outC'" }
  }

  # Test Muse truthful note
  [IO.File]::WriteAllText($cacheFile, '{"src":"muse","note":"not logged in"}')
  foreach ($kind in 'ps1','sh') {
    $script = Join-Path $PSScriptRoot "usage-watch.$kind"
    $outL = if ($kind -eq 'ps1') { & powershell -NoProfile -ExecutionPolicy Bypass -File $script -Mode level }
            else { & 'C:/Program Files/Git/bin/bash.exe' $script level }
    $expL = 'src=muse 5h=- 7d=- ctx=- max=- note=not_logged_in'
    if ($outL -ne $expL) { $failures += "$kind muse note expected '$expL', got '$outL'" }
  }

  if ($failures.Count) { throw ($failures -join "`n") }
  'ok: both readers skip a starting rollout, preserve zero/weekly-only quota, handle agy/muse live cache and 90% weekly gate'
} finally {
  foreach ($name in $keep.Keys) { [Environment]::SetEnvironmentVariable($name, $keep[$name]) }
  $resolved = [IO.Path]::GetFullPath($tmp)
  if ($resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath())) -and (Split-Path $resolved -Leaf) -like 'quota-source-*') { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
