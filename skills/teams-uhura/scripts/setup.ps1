# setup.ps1 - teams-uhura first-time setup on Windows (F86). Mirror: setup.sh.
# Walks the first install. Every step checks first and is skipped when already done,
# so it is safe to re-run. The token and the Workflows URL never pass through this
# script: they go in the ops board form (Messages tab, s).
#   powershell -NoProfile -ExecutionPolicy Bypass -File setup.ps1              the walk
#   powershell -NoProfile -ExecutionPolicy Bypass -File setup.ps1 --check      checks + table, changes nothing
#   powershell -NoProfile -ExecutionPolicy Bypass -File setup.ps1 --selftest   offline, every command stubbed
$ErrorActionPreference = 'Stop'
$Team = Join-Path (Split-Path -Parent $PSCommandPath) 'team.mjs'
$Tunnel = 'skillator-teams'
$script:Check = $args -contains '--check'
$script:Out = New-Object System.Collections.ArrayList
$script:Quiet = $false

function Say([string]$s) { [void]$script:Out.Add($s); if (-not $script:Quiet) { Write-Host $s } }
function Has([string]$n) { [bool](Get-Command $n -CommandType Application -ErrorAction SilentlyContinue) }
# a command's exit code and output, never throwing
function Run {
  $exe = $args[0]; $rest = @($args | Select-Object -Skip 1)
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { $o = (& $exe @rest 2>&1 | ForEach-Object { "$_" }) -join "`n"; @{ code = $LASTEXITCODE; out = $o } }
  catch { @{ code = 1; out = "$_" } }
  finally { $ErrorActionPreference = $prev }
}
# an interactive command, on this console
function Live { $exe = $args[0]; $rest = @($args | Select-Object -Skip 1); & $exe @rest | Out-Host; $LASTEXITCODE }
function StoredPath { [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
function Answer([string]$q) { try { Read-Host $q } catch { '' } }
function Ask([string]$q) { if ($script:Check) { return $false }; (Answer "$q [y/N]") -match '^\s*y(es)?\s*$' }
function Repair-Winget {
  try {
    Install-Module Microsoft.WinGet.Client -Scope CurrentUser -Force
    Import-Module Microsoft.WinGet.Client
    Repair-WinGetPackageManager
  } catch { Say "winget: the repair failed - $_" }
}
function Open-TunnelWindow { Start-Process devtunnel -ArgumentList 'host', $Tunnel }
function TunnelHosted { [bool](Get-Process devtunnel -ErrorAction SilentlyContinue) }

function Step-Node {
  if (-not (Has 'node')) { Say 'node: missing - install Node.js 18 or later from https://nodejs.org/ , open a new terminal, run this again'; return $null }
  $v = (Run node --version).out.Trim(); Say "node: $v"; $v
}

# on PATH, else the WindowsApps alias by full path, else this process's PATH refreshed
function Find-Winget {
  if (Has 'winget') { return 'winget' }
  $wa = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\winget.exe'
  if ((Test-Path -LiteralPath $wa) -and (Run $wa --version).code -eq 0) { Say "winget: not on this window's PATH - using $wa"; return $wa }
  $env:Path = StoredPath
  if (Has 'winget') { Say "winget: found after a refresh of this window's PATH"; return 'winget' }
  $null
}

function Step-Winget {
  $w = Find-Winget
  if (-not $w) {
    Say 'winget: not found. The fixes, in order - try the next only if the one before did not help:'
    Say '  1. Register App Installer: Add-AppxPackage -RegisterByFamilyName -MainPackage Microsoft.DesktopAppInstaller_8wekyb3d8bbwe'
    Say '  2. Settings > Apps > Advanced app settings > App execution aliases: turn on winget.exe, open a new terminal'
    Say '  3. Install-Module Microsoft.WinGet.Client -Scope CurrentUser; Repair-WinGetPackageManager'
    if (-not (Ask 'Run fix 3 now (it installs the Microsoft.WinGet.Client module for you)?')) { return $null }
    Repair-Winget
    $w = Find-Winget
    if (-not $w) { Say 'winget: still not found - try fixes 1 and 2, open a new terminal, run this again'; return $null }
  }
  Say "winget: $((Run $w --version).out.Trim())"; $w
}

function Find-Devtunnel { if (Has 'devtunnel') { return $true }; $env:Path = StoredPath; Has 'devtunnel' }

function Step-Devtunnel($w) {
  if (-not (Find-Devtunnel)) {
    if ($script:Check) { Say 'devtunnel: missing - the walk installs it with winget'; return $false }
    if (-not $w) { Say 'devtunnel: missing, and no winget to install it - fix winget, or download it from https://aka.ms/devtunnels/download'; return $false }
    Say 'devtunnel: installing (winget install Microsoft.devtunnel)'
    [void](Live $w install --id Microsoft.devtunnel -e --accept-source-agreements --accept-package-agreements)
    if (-not (Find-Devtunnel)) { Say 'devtunnel: still not found - open a new terminal and run this again'; return $false }
  }
  $o = (Run devtunnel --version).out
  Say "devtunnel: $(if ($o -match 'CLI version:\s*(\S+)') { $Matches[1] } else { 'present' })"; $true
}

function LoggedIn { (Run devtunnel user show).out -match 'Logged in as' }

function Step-Login {
  if (LoggedIn) { Say 'login: signed in to Dev Tunnels'; return $true }
  if ($script:Check) { Say 'login: not signed in to Dev Tunnels'; return $false }
  Say 'login: sign in to Dev Tunnels - your act; a browser opens, this waits for it'
  [void](Live devtunnel user login)
  if (LoggedIn) { Say 'login: signed in'; return $true }
  Say 'login: not signed in - run this again'; $false
}

# the persistent tunnel and its port, each created only when missing
function Step-Tunnel([int]$port) {
  $t = Run devtunnel show $Tunnel
  if ($t.code -ne 0 -or $t.out -match 'not found') {
    if ($script:Check) { Say "tunnel: $Tunnel not created yet"; return $false }
    if ((Run devtunnel create $Tunnel --allow-anonymous).code -ne 0) { Say "tunnel: could not create $Tunnel"; return $false }
    Say "tunnel: created $Tunnel"
  }
  if ((Run devtunnel port list $Tunnel).out -notmatch "\b$port\b") {
    if ($script:Check) { Say "tunnel: $Tunnel has no port $port yet"; return $false }
    if ((Run devtunnel port create $Tunnel -p $port).code -ne 0) { Say "tunnel: could not add port $port"; return $false }
    Say "tunnel: port $port added"
  }
  Say "tunnel: $Tunnel on port $port"; $true
}

# https://<tunnel id>-<port>.<region>.devtunnels.ms, from the tunnel id devtunnel show prints
function TunnelUrl([int]$port) {
  if ((Run devtunnel show $Tunnel).out -match 'Tunnel ID\s*:\s*([\w-]+)\.(\w+)') { return "https://$($Matches[1])-$port.$($Matches[2]).devtunnels.ms" }
  $null
}

function Get-Config { try { (Run node $Team config show).out | ConvertFrom-Json } catch { $null } }
function ListenerUp([int]$port) { (Run node $Team status --port $port).out -match '(?m)^listener: up' }
function Show-Table($r) { Say ''; foreach ($k in $r.Keys) { Say ('  {0,-11} {1}' -f $k, $r[$k]) } }

function Invoke-Setup {
  $r = [ordered]@{ node = 'missing'; winget = 'missing'; devtunnel = 'missing'; login = '-'; tunnel = '-'; listener = '-'; 'form saved' = '-' }
  $v = Step-Node
  if (-not $v -and -not $script:Check) { Show-Table $r; return 1 }
  if ($v) { $r['node'] = $v }
  $w = Step-Winget; if ($w) { $r['winget'] = 'ok' }
  $dt = Step-Devtunnel $w; if ($dt) { $r['devtunnel'] = 'ok' }
  $port = 3978; $saved = $false; $up = $false; $tn = $false
  if ($v) {
    $c = Get-Config
    if ($c -and $c.port) { $port = [int]$c.port }
    $saved = [bool]($c -and $c.token -and $c.workflowUrl)
    $up = ListenerUp $port
    $r['form saved'] = $(if ($saved) { 'set' } else { 'not set' })
    $r['listener'] = $(if ($up) { "up on 127.0.0.1:$port" } else { 'not running' })
  }
  if ($dt) {
    $in = Step-Login; $r['login'] = $(if ($in) { 'signed in' } else { 'not signed in' })
    if ($in) { $tn = Step-Tunnel $port; $r['tunnel'] = $(if ($tn) { "$Tunnel port $port" } else { 'not ready' }) }
  }
  if ($script:Check) { Show-Table $r; return 0 }
  if (-not $tn) { Show-Table $r; return 1 }
  if (-not (Ask "Arm it now: host $Tunnel in its own window and run the listener on 127.0.0.1:$port?")) { Say 'not armed - run this again when you are ready'; Show-Table $r; return 1 }
  if (TunnelHosted) { Say 'tunnel: already hosted' } else { Open-TunnelWindow; Say "tunnel: hosting $Tunnel in its own window - close that window to stop it" }
  $url = TunnelUrl $port
  if ($url) { Say "tunnel URL: $url" } else { $url = '<the https URL in the tunnel window>'; Say 'tunnel URL: read it in the tunnel window' }
  if (-not $saved) {
    Say ''
    Say 'In Teams - these two cannot be scripted:'
    Say "  1. The team > ... > Manage team > Apps > Create an outgoing webhook. Name: skillator. Callback URL: $url"
    Say '     Create, then copy the security token it shows once.'
    Say '  2. The channel > ... > Workflows > "Post to a channel when a webhook request is received" > team, channel > Add workflow;'
    Say '     copy the HTTP POST URL.'
    Say 'Paste both into the ops board form - Messages tab, s - and nowhere else: not a chat, a command line or a file.'
    [void](Answer 'Press Enter when both are saved in the form')
    $c = Get-Config
    $saved = [bool]($c -and $c.token -and $c.workflowUrl)
    $r['form saved'] = $(if ($saved) { 'set' } else { 'not set' })
  }
  if ($up) { Say "listener: already up on 127.0.0.1:$port" }
  elseif ($saved) { [void](Live node $Team start --port $port); $up = ListenerUp $port }
  else { Say 'listener: not started - the form has no token yet; save it, then run this again' }
  $r['listener'] = $(if ($up) { "up on 127.0.0.1:$port" } else { 'not running' })
  Show-Table $r
  if ($up -and $saved) { 0 } else { 1 }
}

if ($args -contains '--selftest') {
  $script:Quiet = $true
  $T = Join-Path ([IO.Path]::GetTempPath()) ('uhura-setup-' + [guid]::NewGuid().ToString('N'))
  $Alias = Join-Path $T 'Microsoft\WindowsApps\winget.exe'
  New-Item -ItemType Directory -Force (Split-Path $Alias) | Out-Null
  $savedPath = $env:Path; $savedLocal = $env:LOCALAPPDATA; $env:LOCALAPPDATA = $T
  function Has([string]$n) { ($S.has -contains $n) -or ($env:Path -eq 'stored' -and $S.stored -contains $n) }
  function StoredPath { 'stored' }
  function Run {
    $k = $args -join ' '; [void]$S.calls.Add($k)
    if ($k -like '*\winget.exe --version') { return @{ code = $(if ($S.alias) { 0 } else { 1 }); out = 'v1.29' } }
    if ($k -like '*--version') { return @{ code = 0; out = 'v1' } }
    if ($k -eq 'devtunnel user show') { return @{ code = 0; out = $(if ($S.login) { 'Logged in as owner using Microsoft.' } else { 'Not logged in.' }) } }
    if ($k -eq "devtunnel show $Tunnel") { if ($S.tunnel) { return @{ code = 0; out = "Tunnel ID : $Tunnel.euw" } }; return @{ code = 1; out = 'Tunnel not found.' } }
    if ($k -like 'devtunnel create *') { $S.tunnel = $true; return @{ code = 0; out = '' } }
    if ($k -like 'devtunnel port list *') { return @{ code = 0; out = $(if ($S.port) { 'Port 3978 auto' } else { 'Found 0 ports' }) } }
    if ($k -like 'devtunnel port create *') { $S.port = $true; return @{ code = 0; out = '' } }
    if ($k -like '* config show') { return @{ code = 0; out = $(if ($S.saved) { '{"token":true,"workflowUrl":"x.logic.azure.com","port":3978}' } else { '{"token":false,"workflowUrl":null,"port":3978}' }) } }
    if ($k -like '* status --port *') { return @{ code = 0; out = $(if ($S.up) { "listener: up on 127.0.0.1:3978 (pid 1)`nconfig: x" } else { 'listener: not running on port 3978' }) } }
    @{ code = 1; out = "unstubbed: $k" }
  }
  function Live {
    $k = $args -join ' '; [void]$S.calls.Add("live $k")
    if ($k -like '* install --id Microsoft.devtunnel*') { $S.has += 'devtunnel' }
    if ($k -eq 'devtunnel user login') { $S.login = $true }
    if ($k -like '* start --port *') { $S.up = $true }
    0
  }
  function Answer([string]$q) { [void]$S.calls.Add('ask'); if ($q -like 'Press Enter*') { $S.saved = $true }; $S.yes }
  function Repair-Winget { [void]$S.calls.Add('repair') }
  function Open-TunnelWindow { [void]$S.calls.Add('host') }
  function TunnelHosted { $false }
  function Scenario([hashtable]$given, [bool]$check) {
    $script:S = @{ has = @(); stored = @(); alias = $false; login = $false; tunnel = $false; port = $false; saved = $false; up = $false; yes = ''; calls = (New-Object System.Collections.ArrayList) }
    foreach ($k in $given.Keys) { $S[$k] = $given[$k] }
    if ($S.alias) { New-Item -ItemType File -Force $Alias | Out-Null } else { Remove-Item -Force -ErrorAction SilentlyContinue $Alias }
    $script:Check = $check; $script:Out.Clear(); $env:Path = 'shell'
    $code = Invoke-Setup
    @{ code = $code; out = ($script:Out -join "`n"); calls = ($S.calls -join "`n") }
  }
  function Fail([string]$m) { $env:Path = $savedPath; $env:LOCALAPPDATA = $savedLocal; Remove-Item -Recurse -Force $T; [Console]::Error.WriteLine("FAIL: $m"); exit 1 }
  $mutate = '(?m)^(ask|repair|host|live |devtunnel (create|port create))'
  $tools = @('node', 'winget', 'devtunnel')

  # winget missing: the three fixes in order; --check asks nothing, changes nothing
  $r = Scenario @{ has = @('node') } $true
  if ($r.out -notmatch '(?s)Add-AppxPackage.*App execution aliases.*Repair-WinGetPackageManager') { Fail "winget missing: the three fixes in order`n$($r.out)" }
  if ($r.calls -match $mutate) { Fail "--check asked or changed something`n$($r.calls)" }
  # Repair-WinGetPackageManager only on the user's yes
  $r = Scenario @{ has = @('node'); yes = '' } $false
  if ($r.calls -match 'repair') { Fail 'repair ran without a yes' }
  $r = Scenario @{ has = @('node'); yes = 'y' } $false
  if ($r.calls -notmatch 'repair') { Fail 'repair did not run on a yes' }
  # alias only: winget by its full path
  $r = Scenario @{ has = @('node'); alias = $true } $true
  if ($r.out -notmatch 'WindowsApps\\winget\.exe' -or $r.out -match 'Add-AppxPackage') { Fail "alias-only: not used by full path`n$($r.out)" }
  # on the stored PATH only: found after refreshing this process's PATH
  $r = Scenario @{ has = @('node'); stored = @('winget') } $true
  if ($r.out -notmatch 'refresh' -or $r.out -match 'Add-AppxPackage') { Fail "stored PATH: not refreshed`n$($r.out)" }
  # devtunnel missing: --check only reports; the walk installs it with winget
  $r = Scenario @{ has = @('node', 'winget') } $true
  if ($r.calls -match $mutate -or $r.out -notmatch 'devtunnel: missing') { Fail "devtunnel missing under --check`n$($r.calls)" }
  $r = Scenario @{ has = @('node', 'winget') } $false
  if ($r.calls -notmatch '(?m)^live winget install --id Microsoft\.devtunnel') { Fail "devtunnel missing: not installed`n$($r.calls)" }
  if ($r.calls -notmatch '(?m)^live devtunnel user login' -or $r.calls -notmatch 'devtunnel create skillator-teams --allow-anonymous' -or $r.calls -notmatch 'devtunnel port create skillator-teams -p 3978') { Fail "fresh walk: login / create / port`n$($r.calls)" }
  if ($r.calls -match '(?m)^(host|live node)') { Fail 'armed without a yes' }
  # tunnel existing: neither created nor given its port again
  $r = Scenario @{ has = $tools; login = $true; tunnel = $true; port = $true; saved = $true; yes = 'y' } $false
  if ($r.calls -match 'create') { Fail "tunnel existing: created again`n$($r.calls)" }
  # listener already up: not started again, URL printed, exit 0
  $r = Scenario @{ has = $tools; login = $true; tunnel = $true; port = $true; saved = $true; up = $true; yes = 'y' } $false
  if ($r.code -ne 0 -or $r.calls -match 'start --port' -or $r.out -notmatch 'https://skillator-teams-3978\.euw\.devtunnels\.ms') { Fail "listener up`n$($r.out)" }
  # whole walk: the Teams steps carry the URL, the form is named, the listener starts after it
  $r = Scenario @{ has = $tools; yes = 'y' } $false
  if ($r.code -ne 0 -or $r.calls -notmatch '(?m)^host' -or $r.calls -notmatch 'start --port 3978') { Fail "walk`n$($r.calls)" }
  if ($r.out -notmatch 'Callback URL: https://skillator-teams-3978\.euw\.devtunnels\.ms' -or $r.out -notmatch 'Messages tab, s') { Fail "walk: Teams steps`n$($r.out)" }
  if ($r.out -notmatch '(?m)^  listener\s+up' -or $r.out -notmatch '(?m)^  form saved\s+set') { Fail "walk: status table`n$($r.out)" }
  if (@([IO.File]::ReadAllBytes($PSCommandPath) | Where-Object { $_ -gt 127 -or $_ -eq 13 }).Count) { Fail 'not pure ASCII + LF' }
  $env:Path = $savedPath; $env:LOCALAPPDATA = $savedLocal; Remove-Item -Recurse -Force $T
  'ok'; exit 0
}

exit (Invoke-Setup)
