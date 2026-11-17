# setup.ps1 - teams-uhura first-time setup on Windows (F86). Mirror: setup.sh.
# Walks the first install. Every step checks first and is skipped when already done,
# so it is safe to re-run. The token and the Workflows URL never pass through this
# script: they go in the ops board form (Messages tab, s).
#   powershell -NoProfile -ExecutionPolicy Bypass -File setup.ps1              the walk
#   powershell -NoProfile -ExecutionPolicy Bypass -File setup.ps1 --check      checks + table, changes nothing
#   powershell -NoProfile -ExecutionPolicy Bypass -File setup.ps1 --selftest   offline, every command stubbed
#   ... -File setup.ps1 --status | --arm | --disarm | --ack   the ops board's keys (F177): key=value lines, exit 0
$ErrorActionPreference = 'Stop'
$Team = Join-Path (Split-Path -Parent $PSCommandPath) 'team.mjs'
$Tunnel = 'skillator-teams'
$Modes = @('--status', '--arm', '--disarm', '--ack')
if ($args.Count -gt 1 -or ($args.Count -eq 1 -and $args[0] -notin (@('--check', '-check', '--selftest', '-selftest') + $Modes))) {
  [Console]::Error.WriteLine('usage: setup.ps1 [--check | --selftest] | --status | --arm | --disarm | --ack')
  exit 2
}
$script:Check = $args -contains '--check' -or $args -contains '-check'
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
function Open-TunnelWindow { Start-Process -FilePath (Get-Command devtunnel -CommandType Application | Select-Object -First 1).Source -ArgumentList 'host', $Tunnel -WindowStyle Normal }
function TunnelHosted([string]$name = '', [int]$port = 0, [switch]$Ids) { $target = if ($name) { $name } elseif ($Tunnel) { $Tunnel } else { 'skillator-teams' }; foreach ($p in @(Get-Process devtunnel -ErrorAction SilentlyContinue)) { $cmd = $p.CommandLine; if (-not $cmd -and $p.Id) { try { $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $($p.Id)" -ErrorAction SilentlyContinue).CommandLine } catch {} }; if (-not $cmd -or $cmd -notmatch '\bhost\b' -or $cmd -notmatch ('(^|\s|[`"''\\])' + [regex]::Escape($target) + '($|\s|[`"''\\])')) { continue }; if ($port -gt 0 -and $cmd -match '(?i)(?:-p|--port)\s+(\d+)' -and [int]$Matches[1] -ne $port) { continue }; if ($Ids) { $p.Id; continue }; return $true }; if (-not $Ids) { $false } }

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

# B28: the port's own portUri from `devtunnel show -j` - a named tunnel's URL carries its
# generated id, never its name, so it cannot be built from the Tunnel ID line
function UrlOf([string]$raw, [int]$port) {
  try { $j = $raw | ConvertFrom-Json } catch { return $null }
  foreach ($p in @($j.tunnel.ports)) { if ($p.portNumber -eq $port -and $p.portUri) { return ([string]$p.portUri).TrimEnd('/') } }
  $null
}
function TunnelUrl([int]$port) { UrlOf (Run devtunnel show $Tunnel -j).out $port }

function Get-Config { try { (Run node $Team config show).out | ConvertFrom-Json } catch { $null } }
function ListenerUp([int]$port) { (Run node $Team status --port $port).out -match '(?m)^listener: up' }
function Show-Table($r) { Say ''; foreach ($k in $r.Keys) { Say ('  {0,-11} {1}' -f $k, $r[$k]) } }

# --- F177: the ops board's keys. --status reads; --arm, --disarm and --ack act, each only
# on the owner's key press on the Messages tab. Output: twelve key=value lines.
function StateDir { if ($env:SKILLATOR_TEAMS_STATE) { $env:SKILLATOR_TEAMS_STATE } else { Join-Path $HOME '.skillator\teams' } }
function SeenUrl { try { ([IO.File]::ReadAllText((Join-Path (StateDir) 'tunnel-url'))).Trim() } catch { '' } }
function Save-Url([string]$u) { New-Item -ItemType Directory -Force (StateDir) | Out-Null; [IO.File]::WriteAllText((Join-Path (StateDir) 'tunnel-url'), "$u`n") }
function Mark-Url($a) { $seen = SeenUrl; $a['url_changed'] = $(if ($a['url'] -and $seen -and $seen -ne $a['url']) { '1' } else { '0' }) }
function ExpiryOf([string]$raw) { if ($raw -match '"tunnelExpiration"\s*:\s*"([^"]{1,40})"') { $Matches[1] } else { '' } }
function Stop-Tunnel([int]$port) { foreach ($id in @(TunnelHosted $Tunnel $port -Ids)) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }; Start-Sleep -Milliseconds 300 }
function Show-Arm($a) { foreach ($k in $a.Keys) { Say "$k=$($a[$k])" } }

function Get-Arm {
  $a = [ordered]@{ result = 'status'; why = ''; devtunnel = 'missing'; login = '-'; form = 'notset'; tunnel = '-'; hosted = '0'; listener = 'down'; port = '3978'; url = ''; url_changed = '0'; expires = '' }
  $port = 3978
  if (Has 'node') {
    $c = Get-Config
    if ($c -and $c.port) { $port = [int]$c.port }
    if ($c -and $c.token) { $a['form'] = 'set' }
    if (ListenerUp $port) { $a['listener'] = 'up' }
  }
  $a['port'] = "$port"
  if (Find-Devtunnel) {
    $a['devtunnel'] = 'ok'
    $a['login'] = $(if (LoggedIn) { 'in' } else { 'out' })
    if ($a['login'] -eq 'in') {
      $t = Run devtunnel show $Tunnel -j
      if ($t.code -eq 0 -and $t.out -match ('"portNumber"\s*:\s*' + $port + '\b')) {
        $a['tunnel'] = 'ready'
        $u = UrlOf $t.out $port; if ($u) { $a['url'] = $u }
        $a['expires'] = ExpiryOf $t.out
      } else { $a['tunnel'] = 'none' }
    }
    if (TunnelHosted $Tunnel $port) { $a['hosted'] = '1' }
  }
  Mark-Url $a
  $a
}

function Invoke-Arm {
  $a = @(Get-Arm)[-1]
  $port = [int]$a['port']
  $no = $(if ($a['devtunnel'] -ne 'ok') { 'devtunnel is not installed - s, then First-time setup' }
    elseif ($a['login'] -ne 'in') { 'not signed in to Dev Tunnels - s, then Sign in to Dev Tunnels' }
    elseif ($a['form'] -ne 'set') { 'the form has no token - s, paste the security token, save' }
    elseif ($a['tunnel'] -ne 'ready') { "the tunnel $Tunnel is not created yet - s, then First-time setup" })
  if ($no) { $a['result'] = 'refused'; $a['why'] = $no; return $a }
  # the listener first: the tunnel opens only onto a listener that verifies signatures
  if ($a['listener'] -ne 'up') { [void](Run node $Team start --port $port); if (ListenerUp $port) { $a['listener'] = 'up' } }
  if ($a['listener'] -ne 'up') { $a['result'] = 'failed'; $a['why'] = 'the listener did not come up - the tunnel was not hosted'; return $a }
  if ($a['hosted'] -ne '1') {
    Open-TunnelWindow
    for ($i = 0; $i -lt 20 -and -not (TunnelHosted $Tunnel $port); $i++) { Start-Sleep -Milliseconds 250 }
    if (TunnelHosted $Tunnel $port) { $a['hosted'] = '1' }
  }
  if ($a['hosted'] -ne '1') { $a['result'] = 'failed'; $a['why'] = 'the tunnel window did not start - the listener is up, the tunnel is not'; return $a }
  if (-not $a['url']) { $u = TunnelUrl $port; if ($u) { $a['url'] = $u } }
  if ($a['url'] -and -not (SeenUrl)) { Save-Url $a['url'] }
  Mark-Url $a
  $a['result'] = 'armed'; $a
}

function Invoke-Disarm {
  $port = 3978
  if (Has 'node') { $c = Get-Config; if ($c -and $c.port) { $port = [int]$c.port } }
  Stop-Tunnel $port   # the tunnel first: the public side closes before the listener goes
  if (Has 'node') { [void](Run node $Team stop --port $port) }
  $a = @(Get-Arm)[-1]
  if ($a['hosted'] -eq '1') { $a['result'] = 'failed'; $a['why'] = 'the tunnel is still hosted - close its window' }
  elseif ($a['listener'] -eq 'up') { $a['result'] = 'failed'; $a['why'] = 'the listener is still up - node team.mjs stop' }
  else { $a['result'] = 'disarmed' }
  $a
}

function Invoke-Ack {
  $a = @(Get-Arm)[-1]
  if ($a['url']) { Save-Url $a['url']; Mark-Url $a; $a['result'] = 'acked' } else { $a['result'] = 'failed'; $a['why'] = 'no tunnel URL to remember' }
  $a
}

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
  if (TunnelHosted $Tunnel $port) { Say 'tunnel: already hosted' } else { Open-TunnelWindow; Say "tunnel: hosting $Tunnel in its own window - close that window to stop it" }
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

if ($args -contains '--selftest' -or $args -contains '-selftest') {
  $script:Quiet = $true
  $T = Join-Path ([IO.Path]::GetTempPath()) ('uhura-setup-' + [guid]::NewGuid().ToString('N'))
  $Alias = Join-Path $T 'Microsoft\WindowsApps\winget.exe'
  New-Item -ItemType Directory -Force (Split-Path $Alias) | Out-Null
  $savedPath = $env:Path; $savedLocal = $env:LOCALAPPDATA; $env:LOCALAPPDATA = $T
  $env:SKILLATOR_TEAMS_STATE = Join-Path $T 'state'
  function Has([string]$n) { ($S.has -contains $n) -or ($env:Path -eq 'stored' -and $S.stored -contains $n) }
  function StoredPath { 'stored' }
  function Run {
    $k = $args -join ' '; [void]$S.calls.Add($k)
    if ($k -like '*\winget.exe --version') { return @{ code = $(if ($S.alias) { 0 } else { 1 }); out = 'v1.29' } }
    if ($k -like '*--version') { return @{ code = 0; out = 'v1' } }
    if ($k -eq 'devtunnel user show') { return @{ code = 0; out = $(if ($S.login) { 'Logged in as owner using Microsoft.' } else { 'Not logged in.' }) } }
    if ($k -eq "devtunnel show $Tunnel") { if ($S.tunnel) { return @{ code = 0; out = "Tunnel ID : $Tunnel.euw" } }; return @{ code = 1; out = 'Tunnel not found.' } }
    if ($k -eq "devtunnel show $Tunnel -j") { if ($S.tunnel) { return @{ code = 0; out = ('{"tunnel":{"tunnelId":"skillator-teams.euw","tunnelExpiration":"2026-12-17T00:00:00Z","ports":[{"portNumber":3978,"portUri":"https://' + $(if ($S.id) { $S.id } else { 'ab12cd34' }) + '-3978.euw.devtunnels.ms/"}]}}') } }; return @{ code = 1; out = 'Tunnel not found.' } }
    if ($k -like 'devtunnel create *') { $S.tunnel = $true; return @{ code = 0; out = '' } }
    if ($k -like 'devtunnel port list *') { return @{ code = 0; out = $(if ($S.port) { 'Port 3978 auto' } else { 'Found 0 ports' }) } }
    if ($k -like 'devtunnel port create *') { $S.port = $true; return @{ code = 0; out = '' } }
    if ($k -like '* config show') { return @{ code = 0; out = $(if ($S.saved) { '{"token":true,"workflowUrl":"x.logic.azure.com","port":3978}' } else { '{"token":false,"workflowUrl":null,"port":3978}' }) } }
    if ($k -like '* status --port *') { return @{ code = 0; out = $(if ($S.up) { "listener: up on 127.0.0.1:3978 (pid 1)`nconfig: x" } else { 'listener: not running on port 3978' }) } }
    if ($k -like '* start --port *') { if (-not $S.nostart) { $S.up = $true }; return @{ code = 0; out = '' } }
    if ($k -like '* stop --port *') { $S.up = $false; return @{ code = 0; out = '' } }
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
  function Open-TunnelWindow { [void]$S.calls.Add('host'); if (-not $S.noopen) { $S.hosted = $true } }
  function TunnelHosted { [bool]$S.hosted }
  function Stop-Tunnel { [void]$S.calls.Add('unhost'); $S.hosted = $false }
  function Start-Sleep { }
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
  if ($r.code -ne 0 -or $r.calls -match 'start --port' -or $r.out -notmatch 'https://ab12cd34-3978\.euw\.devtunnels\.ms') { Fail "listener up`n$($r.out)" }
  # whole walk: the Teams steps carry the URL, the form is named, the listener starts after it
  $r = Scenario @{ has = $tools; yes = 'y' } $false
  if ($r.code -ne 0 -or $r.calls -notmatch '(?m)^host' -or $r.calls -notmatch 'start --port 3978') { Fail "walk`n$($r.calls)" }
  if ($r.out -notmatch 'Callback URL: https://ab12cd34-3978\.euw\.devtunnels\.ms' -or $r.out -notmatch 'Messages tab, s') { Fail "walk: Teams steps`n$($r.out)" }
  if ($r.out -notmatch '(?m)^  listener\s+up' -or $r.out -notmatch '(?m)^  form saved\s+set') { Fail "walk: status table`n$($r.out)" }
  # --- F177: the board's modes ---
  function Kv([hashtable]$given, [scriptblock]$mode) {
    $script:S = @{ has = $tools; stored = @(); alias = $false; login = $true; tunnel = $true; port = $true; saved = $true; up = $false; hosted = $false; yes = ''; calls = (New-Object System.Collections.ArrayList) }
    foreach ($k in $given.Keys) { $S[$k] = $given[$k] }
    $script:Check = $false; $script:Out.Clear(); $env:Path = 'shell'
    $a = @(& $mode)[-1]
    @{ a = $a; calls = ($S.calls -join "`n") }
  }
  $U1 = 'https://ab12cd34-3978.euw.devtunnels.ms'; $U2 = 'https://zz99yy88-3978.euw.devtunnels.ms'
  $acts = '(?m)^(host|unhost)$| (start|stop) --port '
  # --status: twelve keys, the facts, nothing changed
  $r = Kv @{} { Get-Arm }
  if (@($r.a.Keys).Count -ne 12 -or (@($r.a.Keys) -join ',') -ne 'result,why,devtunnel,login,form,tunnel,hosted,listener,port,url,url_changed,expires') { Fail "status: keys $(@($r.a.Keys) -join ',')" }
  if ($r.a['result'] -ne 'status' -or $r.a['form'] -ne 'set' -or $r.a['tunnel'] -ne 'ready' -or $r.a['hosted'] -ne '0' -or $r.a['listener'] -ne 'down' -or $r.a['url'] -ne $U1 -or $r.a['expires'] -ne '2026-12-17T00:00:00Z') { Fail "status: facts`n$($r.a | Out-String)" }
  if ($r.calls -match $acts) { Fail "status changed something`n$($r.calls)" }
  Show-Arm $r.a
  if (($script:Out -join "`n") -notmatch '(?m)^result=status$' -or ($script:Out -join "`n") -notmatch '(?m)^url_changed=0$') { Fail 'Show-Arm: not key=value lines' }
  # --arm refuses, and starts nothing: devtunnel missing, signed out, no token, no tunnel
  foreach ($c in @(
      @(@{ has = @('node') }, 'devtunnel is not installed'), @(@{ login = $false }, 'not signed in'),
      @(@{ saved = $false }, 'the form has no token'), @(@{ tunnel = $false }, 'the tunnel skillator-teams is not created yet'))) {
    $r = Kv $c[0] { Invoke-Arm }
    if ($r.a['result'] -ne 'refused' -or $r.a['why'] -notlike "$($c[1])*") { Fail "arm refusal '$($c[1])': $($r.a['result']) / $($r.a['why'])" }
    if ($r.calls -match $acts) { Fail "arm refusal '$($c[1])' started something`n$($r.calls)" }
  }
  # --arm: the listener first, then the tunnel; the URL is remembered on the first arm
  $r = Kv @{} { Invoke-Arm }
  if ($r.a['result'] -ne 'armed' -or $r.a['hosted'] -ne '1' -or $r.a['listener'] -ne 'up' -or $r.a['url'] -ne $U1 -or $r.a['url_changed'] -ne '0') { Fail "arm`n$($r.a | Out-String)" }
  if ($r.calls -notmatch '(?s) start --port 3978.*\nhost(\n|$)') { Fail "arm: the tunnel was hosted before the listener`n$($r.calls)" }
  if ((SeenUrl) -ne $U1) { Fail 'arm: the URL was not remembered' }
  # already up and hosted: neither started again
  $r = Kv @{ up = $true; hosted = $true } { Invoke-Arm }
  if ($r.a['result'] -ne 'armed' -or $r.calls -match $acts) { Fail "arm when armed`n$($r.calls)" }
  # the listener does not come up: failed, the tunnel is not hosted
  $r = Kv @{ nostart = $true } { Invoke-Arm }
  if ($r.a['result'] -ne 'failed' -or $r.a['why'] -notlike 'the listener did not come up*' -or $r.calls -match '(?m)^host$') { Fail "arm without a listener`n$($r.calls)" }
  # the tunnel window does not start: failed
  $r = Kv @{ noopen = $true } { Invoke-Arm }
  if ($r.a['result'] -ne 'failed' -or $r.a['why'] -notlike 'the tunnel window did not start*') { Fail "arm without a window: $($r.a['why'])" }
  # URL guard: unchanged = no warning; changed = warning, kept through --arm, cleared only by --ack
  $r = Kv @{} { Get-Arm };                   if ($r.a['url_changed'] -ne '0') { Fail 'guard: an unchanged URL was flagged' }
  $r = Kv @{ id = 'zz99yy88' } { Get-Arm };   if ($r.a['url'] -ne $U2 -or $r.a['url_changed'] -ne '1') { Fail 'guard: a changed URL was not flagged' }
  $r = Kv @{ id = 'zz99yy88' } { Invoke-Arm }; if ($r.a['url_changed'] -ne '1' -or (SeenUrl) -ne $U1) { Fail 'guard: --arm overwrote the remembered URL' }
  $r = Kv @{ id = 'zz99yy88' } { Invoke-Ack }; if ($r.a['result'] -ne 'acked' -or $r.a['url_changed'] -ne '0' -or (SeenUrl) -ne $U2) { Fail 'guard: --ack did not remember the new URL' }
  # --disarm: the tunnel first, then the listener
  $r = Kv @{ up = $true; hosted = $true } { Invoke-Disarm }
  if ($r.a['result'] -ne 'disarmed' -or $r.a['hosted'] -ne '0' -or $r.a['listener'] -ne 'down') { Fail "disarm`n$($r.a | Out-String)" }
  if ($r.calls -notmatch '(?s)(^|\n)unhost\n.* stop --port 3978') { Fail "disarm: the listener was stopped before the tunnel`n$($r.calls)" }
  if (@([IO.File]::ReadAllBytes($PSCommandPath) | Where-Object { $_ -gt 127 -or $_ -eq 13 }).Count) { Fail 'not pure ASCII + LF' }
  $env:Path = $savedPath; $env:LOCALAPPDATA = $savedLocal; Remove-Item -Recurse -Force $T
  'ok'; exit 0
}

if ($args.Count -eq 1 -and $Modes -contains $args[0]) {
  $a = switch ($args[0]) { '--arm' { @(Invoke-Arm)[-1] } '--disarm' { @(Invoke-Disarm)[-1] } '--ack' { @(Invoke-Ack)[-1] } default { @(Get-Arm)[-1] } }
  Show-Arm $a; exit 0
}
exit (Invoke-Setup)
