# A169: isolated source-selection checks for both readers; no live refresh.
$ErrorActionPreference = 'Stop'
$tmp = Join-Path $PSScriptRoot ('.quota-source-' + [guid]::NewGuid())
$names = @('HOME','USERPROFILE','CODEX_HOME','CODEX_THREAD_ID','CODEX_SESSION_ID','CLAUDE_CODE_SESSION_ID','CLAUDE_CONFIG_DIR','CLAUDE_USAGE_WATCH_DIR','SKILLATOR_CLI','SKILLATOR_PROFILE_DIR','AGY_CONFIG_DIR','MUSE_CONFIG_DIR','ANTIGRAVITY_APP_DATA_DIR','CURSOR_LEDGER_PATH','SKILLATOR_CONFIG_DIR','CLAUDE_USAGE_HANDOFF_PCT','CLAUDE_USAGE_HANDOFF_WEEKLY_PCT')
$keep = @{}; foreach ($n in $names) { $keep[$n] = [Environment]::GetEnvironmentVariable($n) }
$sh = Get-Command sh -ErrorAction SilentlyContinue
$ps = (Get-Process -Id $PID).Path
$observations = @{}
$count = 0
function Put($path, $value) {
  New-Item (Split-Path $path -Parent) -ItemType Directory -Force | Out-Null
  [IO.File]::WriteAllText($path, $value, (New-Object Text.UTF8Encoding $false))
}
function Roll($profile, $id, $h, $w) {
  $p = Join-Path $profile "sessions/rollout-$id.jsonl"
  Put $p ('{"type":"session_meta","payload":{"id":"' + $id + '"}}' + "`n" + '{"type":"event_msg","payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":' + $h + ',"window_minutes":300},"secondary":{"used_percent":' + $w + ',"window_minutes":10080}}}}')
  $p
}
function ReadUsage($port, $mode) {
  if ($port -eq 'ps') { $out = (& $ps -NoProfile -ExecutionPolicy Bypass -File (Join-Path $tmp 'usage-watch.ps1') -Mode $mode) -join "`n" }
  else { $out = (& $sh.Source (Join-Path $tmp 'usage-watch.sh') $mode) -join "`n" }
  if ($LASTEXITCODE -ne 0) { throw "$port $mode failed: $out" }
  $out
}
function Expect($port, $mode, $pattern) {
  $out = ReadUsage $port $mode
  if ($out -notmatch $pattern) { throw "$port $mode expected $pattern; got $out" }
  if ($mode -eq 'level' -and -not $script:optionalRuntimeProbe) { $observations[$port] += ,$out }
  $script:count++
}
try {
  # Stub the refresh boundary in fixture scripts, never a live CLI.
  Put (Join-Path $tmp 'usage-watch.ps1') ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'usage-watch.ps1')).Replace('# level (F31)', "function Start-QuotaRefresh { }`n# level (F31)"))
  Put (Join-Path $tmp 'usage-watch.sh') ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'usage-watch.sh')).Replace('# level (F31)', "start_quota_refresh() { :; }`n# level (F31)"))
  foreach ($n in $names) { [Environment]::SetEnvironmentVariable($n, $null) }
  $ports = @('ps'); if ($sh) { $ports += 'sh' } else { Write-Output 'UNAVAILABLE: shell port (sh not on PATH)' }
  foreach ($port in $ports) {
    $observations[$port] = @()
    $base = (Join-Path $tmp $port).Replace('\','/')
    $env:HOME = "$base/home"; $env:USERPROFILE = $env:HOME
    $env:CODEX_HOME = "$base/codex-a"; $env:CLAUDE_CONFIG_DIR = "$base/claude"
    $env:CLAUDE_USAGE_WATCH_DIR = "$base/watch"
    $env:AGY_CONFIG_DIR = "$base/agy"; $env:MUSE_CONFIG_DIR = "$base/muse"
    $env:ANTIGRAVITY_APP_DATA_DIR = "$base/agy-app"; $env:CURSOR_LEDGER_PATH = "$base/ledger.json"
    $env:SKILLATOR_CONFIG_DIR = "$base/config"
    $env:SKILLATOR_CLI = $null; $env:SKILLATOR_PROFILE_DIR = $null
    $env:CODEX_THREAD_ID = $null; $env:CODEX_SESSION_ID = $null
    $rp = Roll $env:CODEX_HOME 'cx-a' 10 10
    Put "$base/watch/cc" '95'; Put "$base/watch/cc.fivehour" '95'; Put "$base/watch/cc.weekly" '91'
    $env:CLAUDE_CODE_SESSION_ID = 'cc'
    Expect $port level '^src=claude-code 5h=95 7d=91 '
    Expect $port check '^HANDOFF NOW \(claude-code 7-day 91%\)'
    $env:CLAUDE_CODE_SESSION_ID = $null; $env:SKILLATOR_CLI = 'codex'
    Expect $port level '^src=codex 5h=10.0 7d=10.0 '
    Expect $port check '^watch-cortana: codex 10(\.0)?%.*ok$'
    $rpB = Roll "$base/codex-b" 'cx-b' 75 80
    $env:SKILLATOR_PROFILE_DIR = "$base/codex-b"
    Expect $port level '^src=codex 5h=75.0 7d=80.0 '
    $env:CODEX_THREAD_ID = 'cx-a'
    Expect $port level '^src=none 5h=- 7d=- ctx=- max=-'
    Expect $port check '^watch-cortana: no usage signal'
    $env:CODEX_THREAD_ID = 'cx-b'
    Expect $port level '^src=codex 5h=75.0 7d=80.0 '
    Put "$base/codex-b/sessions/rollout-child.jsonl" '{"type":"session_meta","payload":{"id":"child"}}'
    Expect $port level '^src=codex 5h=75.0 '
    $env:CODEX_THREAD_ID = 'child'
    Expect $port level '^src=none '
    $env:CODEX_THREAD_ID = $null
    Expect $port level '^src=codex 5h=75.0 '
    (Get-Item $rpB).LastWriteTime = (Get-Date).AddHours(-4)
    Expect $port level '^src=none '
    $env:SKILLATOR_PROFILE_DIR = "$base/missing"
    Expect $port level '^src=none '
    Expect $port check '^watch-cortana: no usage signal'
    $env:SKILLATOR_PROFILE_DIR = "$base/codex-b"
    Roll $env:SKILLATOR_PROFILE_DIR 'zero' 0 0 | Out-Null
    $env:CODEX_THREAD_ID = 'zero'
    Expect $port level '^src=codex 5h=0.0 7d=0.0 ctx=- max=0.0$'
    Expect $port check '^watch-cortana: codex 0(\.0)?%.*ok$'
    $env:CLAUDE_CODE_SESSION_ID = 'cc'
    Expect $port level '^src=none .*note=conflicting'
    $env:CODEX_THREAD_ID = $null; $env:CLAUDE_CODE_SESSION_ID = $null
    $env:SKILLATOR_CLI = 'claude'; $env:SKILLATOR_PROFILE_DIR = "$base/claude-selected"
    Put "$base/claude-selected/quota-cache.json" '{"src":"claude-code","5h":0,"7d":0}'
    Expect $port level '^src=claude-code 5h=0.0 7d=0.0 ctx=- max=0.0$'
    Expect $port check '^watch-cortana: claude-code 0(\.0)?%.*ok$'
    $env:CLAUDE_CODE_SESSION_ID = 'missing'
    Expect $port level '^src=none '
    $env:CLAUDE_CODE_SESSION_ID = $null
    $env:SKILLATOR_PROFILE_DIR = "$base/claude-watch-cache"
    Put "$base/claude-watch-cache/handoff-watch/quota-cache.json" '{"src":"claude-code","5h":0,"7d":0}'
    Expect $port level '^src=claude-code 5h=0.0 7d=0.0 ctx=- max=0.0$'
    Expect $port check '^watch-cortana: claude-code 0(\.0)?%.*ok$'
    $env:SKILLATOR_PROFILE_DIR = "$base/claude-missing"
    Expect $port level '^src=none '
    $env:SKILLATOR_PROFILE_DIR = "$base/claude-zero"
    $env:CLAUDE_CODE_SESSION_ID = 'zero'
    Put "$base/claude-zero/handoff-watch/zero" '0'
    Put "$base/claude-zero/handoff-watch/zero.fivehour" '0'
    Put "$base/claude-zero/handoff-watch/zero.weekly" '0'
    Expect $port level '^src=claude-code 5h=0 7d=0 ctx=- max=0$'
    Expect $port check '^watch-cortana: claude-code 0%.*ok$'
    $env:CLAUDE_CODE_SESSION_ID = $null
    # A171: caches are JSON records; artifacts and partial flags are not sessions.
    $env:SKILLATOR_PROFILE_DIR = "$base/schema"
    $cache = "$base/schema/handoff-watch/quota-cache.json"
    Put $cache '{"src":"claude-code","5h":95,"7d":91}'
    Expect $port level '^src=claude-code 5h=95.0 7d=91.0 ctx=- max=95.0$'
    Expect $port check '^HANDOFF NOW \(claude-code 7-day 91(\.0)?%\)'
    Put $cache '[{"src":"claude-code","five":95,"weekly":91}]'
    Expect $port level '^src=none 5h=- 7d=- ctx=- max=-$'
    Expect $port check '^watch-cortana: no usage signal'
    Put $cache '{"SRC":"claude-code","FIVE":95}'
    Expect $port level '^src=none 5h=- 7d=- ctx=- max=-$'
    Expect $port check '^watch-cortana: no usage signal'
    Put $cache '{"src":"claude-code","FIVE":95,"WEEKLY":91,"NOTE":"ignored","MAX":95}'
    Expect $port level '^src=claude-code 5h=- 7d=- ctx=- max=-$'
    Expect $port check '^watch-cortana: no usage signal'
    Put $cache '{"src":"claude-code","5h":95,"7d":91}'
    if ($port -eq 'sh') {
      $savedPath = $env:PATH
      try {
        $script:optionalRuntimeProbe = $true
        # Keep the shell utilities, deliberately exclude the optional JSON runtime.
        $env:PATH = Split-Path $sh.Source -Parent
        Expect $port level '^src=none 5h=- 7d=- ctx=- max=-$'
        Expect $port check '^watch-cortana: no usage signal'
      } finally { $env:PATH = $savedPath; $script:optionalRuntimeProbe = $false }
    }
    foreach ($bad in @('', '{"src":"claude-code","5h":95', '{"src":"claude-code","5h":"95"}', '{"src":"claude-code","5h":-1}', '{"src":"claude-code","5h":101}', '{"src":"claude-code","5h":true}', '{"src":"claude-code","5h":1e999}', '{"src":"claude-code","5h":{}}', '{"src":"claude-code","7d":"91"}', '{"src":"claude-code","max":101}', '{"src":"claude-code","note":5}')) {
      Put $cache $bad
      Expect $port level '^src=none 5h=- 7d=- ctx=- max=-$'
      Expect $port check '^watch-cortana: no usage signal'
    }
    Put $cache '{"src":"claude-code","5h":null,"7d":0}'
    Expect $port level '^src=claude-code 5h=- 7d=0.0 ctx=- max=0.0$'
    Put $cache '{"src":"claude-code","five":0,"weekly":91}'
    Expect $port level '^src=claude-code 5h=0.0 7d=91.0 ctx=- max=91.0$'
    (Get-Item $cache).LastWriteTime = (Get-Date).AddHours(-4)
    Expect $port level '^src=none '
    Put "$base/schema/handoff-watch/quota-cache.json.refreshing" '95'
    Put "$base/schema/handoff-watch/refresh.lock" '95'
    Put "$base/schema/handoff-watch/garbage" 'partial 95'
    Put "$base/schema/handoff-watch/bad.weekly" '91 trailing'
    Expect $port level '^src=none '
    Put "$base/schema/handoff-watch/good" '12.0'
    Put "$base/schema/handoff-watch/garbage" 'partial 95'
    Expect $port level '^src=claude-code 5h=- 7d=- ctx=- max=12.0$'
    Put "$base/schema/handoff-watch/good" ('9' * 400)
    Expect $port level '^src=none '
    Put "$base/schema/handoff-watch/good.weekly" ([string][char]0xfeff + " 91.0`r`n")
    Expect $port level '^src=claude-code 5h=- 7d=91.0 ctx=- max=-$'
    $env:CLAUDE_CODE_SESSION_ID = 'garbage'
    Expect $port level '^src=none '
    $env:CLAUDE_CODE_SESSION_ID = $null
    $env:SKILLATOR_CLI = $null; $env:CLAUDE_CONFIG_DIR = $null
    $env:SKILLATOR_PROFILE_DIR = "$base/unknown-source"
    Put "$base/unknown-source/quota-cache.json" '{"src":"host95","5h":95,"7d":91}'
    Expect $port level '^src=none '
    # Retain B18's weekly-only zero/context case and the agy/muse cache checks.
    $env:SKILLATOR_CLI = 'codex'; $env:SKILLATOR_PROFILE_DIR = "$base/weekly-only"
    Put "$base/weekly-only/sessions/rollout-reading.jsonl" '{"type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"total_tokens":10},"model_context_window":100},"rate_limits":{"primary":{"used_percent":0,"window_minutes":10080}}}}'
    Put "$base/weekly-only/sessions/rollout-starting.jsonl" '{"type":"session_meta","payload":{}}'
    Expect $port level '^src=codex 5h=- 7d=0.0 ctx=10.0 max=10.0$'
    $env:SKILLATOR_CLI = 'agy'; $env:SKILLATOR_PROFILE_DIR = "$base/agy"
    Put "$base/agy/quota-cache.json" '{"src":"agy","5h":15.0,"7d":71.0,"max":71.0}'
    Expect $port level '^src=agy 5h=15.0 7d=71.0 ctx=- max=71.0$'
    Expect $port check '^watch-cortana: agy 15(\.0)?%.*ok$'
    Put "$base/agy/quota-cache.json" '{"src":"agy","5h":15.0,"7d":91.0,"max":91.0}'
    Expect $port check '^HANDOFF NOW \(agy 7-day 91(\.0)?%\)'
    $env:SKILLATOR_CLI = 'muse'; $env:SKILLATOR_PROFILE_DIR = "$base/muse"
    Put "$base/muse/quota-cache.json" '{"src":"muse","note":"not logged in"}'
    Expect $port level '^src=muse 5h=- 7d=- ctx=- max=- note=not_logged_in$'
    # A different host's cache in the selected profile is unavailable.
    $env:SKILLATOR_CLI = 'agy'
    Expect $port level '^src=none '
  }
  if ($sh) {
    if (($observations.ps -join "`n") -cne ($observations.sh -join "`n")) { throw 'Quota level output differs across ports' }
    "ok: $($observations.ps.Count) byte-equal quota level observations across ports"
  }
  "ok: $count source-selection assertions"
} finally {
  foreach ($n in $names) { [Environment]::SetEnvironmentVariable($n, $keep[$n]) }
  $resolved = [IO.Path]::GetFullPath($tmp)
  if ($resolved.StartsWith([IO.Path]::GetFullPath($PSScriptRoot) + [IO.Path]::DirectorySeparatorChar) -and (Split-Path $resolved -Leaf) -like '.quota-source-*' -and (Test-Path $resolved)) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
