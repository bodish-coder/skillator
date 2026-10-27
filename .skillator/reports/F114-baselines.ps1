[CmdletBinding()]
param(
  [ValidateSet('prepare','auth','run','collect')][string]$Mode,
  [string]$Worktree = 'C:/tools/Projects/skillator2',
  [string]$Id = ''
)
$ErrorActionPreference = 'Stop'
$root = 'C:/tools/Projects/skillator2'
$base = "$root/.skillator/baselines/F114"
$bash = 'C:/Program Files/Git/bin/bash.exe'
$harness = "$Worktree/plugin/practice/scripts/baseline-harness.sh"
$enc = New-Object System.Text.UTF8Encoding($false)
$scenarios = [ordered]@{
  'p-web'='scenario-clone-odo-platform-web.txt'
  'p-android'='scenario-clone-odo-platform-android.txt'
  'p-ios'='scenario-clone-odo-platform-ios.txt'
  'p-windows'='scenario-clone-odo-platform-windows.txt'
  'r-reviews'='scenario-clone-odo-reviews.txt'
}
function WriteText($path,$value) { [IO.File]::WriteAllText($path,$value,$enc) }
function Shell([string[]]$argv) {
  & $bash --noprofile --norc "$root/.skillator/reports/F114-shell-bridge.sh" @argv
  if ($LASTEXITCODE -ne 0) { throw "Local shell command failed: exit $LASTEXITCODE" }
}
function RunEvidence([string]$key) {
  $path="$base/logs/$key.jsonl"
  if (-not (Test-Path $path)) { throw "Missing baseline transcript: $key" }
  $records=@(Get-Content -LiteralPath $path | ForEach-Object { $_ | ConvertFrom-Json })
  $init=@($records | Where-Object { $_.type -eq 'system' -and $_.subtype -eq 'init' })
  $result=@($records | Where-Object type -eq 'result')
  $inventory=@($init | ForEach-Object { $_.skills })
  $calls=@($records | Where-Object type -eq 'assistant' | ForEach-Object { $_.message.content } | Where-Object { $_.type -eq 'tool_use' })
  $skills=@($calls | Where-Object name -eq 'Skill' | ForEach-Object { $_.input.skill })
  $rc=Get-Content -LiteralPath "$base/logs/$key.exit" -ErrorAction Stop
  $valid=($rc -eq '0' -and $init.Count -eq 1 -and $result.Count -eq 1 -and ($result[0].subtype -eq 'success') -and ($result[0].is_error -is [bool]) -and ($result[0].is_error -eq $false) -and $inventory.Count -lt 100 -and $inventory -contains 'skillator:clone-odo')
  if (-not $valid) { throw "Invalid infrastructure/discovery result for $key; inspect local logs before continuing." }
  [pscustomobject]@{Id=$key;Exit=$rc;Init=$init.Count;SkillCount=$inventory.Count;Loaded=($skills -contains 'skillator:clone-odo');Skills=$skills;FirstTool=($calls | Select-Object -First 1).name;ResultCount=$result.Count;Cost=$result[0].total_cost_usd}
}
function PriorRunsPass([string]$key) {
  foreach ($prior in $scenarios.Keys) {
    if ($prior -eq $key) { return }
    $first=RunEvidence $prior
    if (-not $first.Loaded) {
      $second=RunEvidence "$prior-2"
      if (-not $second.Loaded) { throw "Prior platform $prior failed twice; stop the baseline queue." }
    }
  }
}
function LiveState {
  foreach ($suffix in @('.skillator-hidden','.skillator-hidden.owner')) {
    if (Test-Path -LiteralPath ('C:/Users/Ikran/.claude/CLAUDE.md'+$suffix)) { throw 'Live instruction hide marker exists; do not start isolated baselines.' }
  }
  $link=Get-Item -LiteralPath 'C:/Users/Ikran/.claude-bodish/skills'
  $hash='absent'
  if (Test-Path -LiteralPath 'C:/Users/Ikran/.claude/CLAUDE.md') { $hash=(Get-FileHash -LiteralPath 'C:/Users/Ikran/.claude/CLAUDE.md').Hash }
  @{LinkType=$link.LinkType;Target=@($link.Target);InstructionHash=$hash} | ConvertTo-Json -Compress
}
function AssertLiveUnchanged {
  $before=[IO.File]::ReadAllText("$base/evidence/live-before.json")
  $after=LiveState
  WriteText "$base/evidence/live-after.json" $after
  if ($before -ne $after) { throw 'Live junction/instruction state changed; stop and inspect before claiming isolation.' }
}
if ($Mode -eq 'prepare') {
  if (Test-Path -LiteralPath $base) { throw 'Baseline root already exists; review it before reuse.' }
  $dirty = @(git -C $Worktree status --porcelain -- plugin/skills/clone-odo)
  if ($LASTEXITCODE -ne 0 -or $dirty.Count) { throw 'Commit reviewed clone-odo source before building immutable prefix.' }
  foreach ($dir in @($base,"$base/profile","$base/fixtures","$base/logs","$base/evidence")) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  WriteText "$base/.gitignore" "*`n"
  git -C $root check-ignore "$base/profile" "$base/logs"
  if ($LASTEXITCODE -ne 0) { throw 'Baseline paths must be ignored.' }
  Shell -argv @('sh',$harness,'prefix',"$base/prefix") 1>"$base/evidence/prefix-build.out" 2>"$base/evidence/prefix-build.err"
  Shell -argv @('sh',$harness,'verify-prefix',"$base/prefix")
  foreach ($key in $scenarios.Keys) {
    Shell -argv @('sh',$harness,'fixture','odo',"$base/fixtures/$key")
    $fixtureSha=git -C "$base/fixtures/$key" rev-parse HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Fixture revision unavailable.' }
    WriteText "$base/evidence/$key.fixture-sha.txt" $fixtureSha
  }
  $settingsText = (Shell -argv @('sh',$harness,'settings',"$base/prefix")) -join "`n"
  $settings = $settingsText | ConvertFrom-Json
  $settings | Add-Member NoteProperty enabledPlugins @{} -Force
  $settings | Add-Member NoteProperty autoMemoryEnabled $false -Force
  $settings | Add-Member NoteProperty claudeMdExcludes @('**') -Force
  $settings | Add-Member NoteProperty pluginConfigs @{'cc-plugin-agents-md@builtin'=@{options=@{instructionFiles='managed-only'}}} -Force
  WriteText "$base/settings.json" ($settings | ConvertTo-Json -Depth 20)
  WriteText "$base/empty-mcp.json" '{"mcpServers":{}}'
  Copy-Item -LiteralPath "$root/.skillator/reports/F114-drive-local.sh" -Destination "$base/drive-local.sh"
  $sha = git -C $Worktree rev-parse HEAD
  WriteText "$base/evidence/source.txt" ($sha+"`n"+(& claude --version))
  WriteText "$base/evidence/prefix-manifest.sha256" (Get-FileHash -LiteralPath "$base/prefix/.harness-manifest").Hash
  $sourceFiles=@(Get-ChildItem -LiteralPath "$Worktree/plugin/skills/clone-odo" -Recurse -File | Where-Object { $_.FullName -notmatch '[\\/]__pycache__[\\/]' })
  foreach ($sourceFile in $sourceFiles) {
    $relative=$sourceFile.FullName.Substring(("$Worktree/plugin/skills/clone-odo").Length).TrimStart('\','/')
    $copyFile=Join-Path "$base/prefix/skills/clone-odo" $relative
    if ((Get-FileHash -LiteralPath $sourceFile.FullName).Hash -ne (Get-FileHash -LiteralPath $copyFile).Hash) { throw "Prefix clone source differs: $relative" }
  }
  WriteText "$base/evidence/live-before.json" (LiveState)
  Get-Item -LiteralPath 'C:/Users/Ikran/.claude-bodish/skills' | Select-Object LinkType,Target | ConvertTo-Json | Set-Content "$base/evidence/junction-before.json"
  if (Test-Path -LiteralPath 'C:/Users/Ikran/.claude/CLAUDE.md') {
    (Get-FileHash -LiteralPath 'C:/Users/Ikran/.claude/CLAUDE.md').Hash | Set-Content "$base/evidence/instruction-before.txt"
  }
  Write-Output 'Prepared isolated baseline fixtures; no model runs performed.'
  exit 0
}
if (-not (Test-Path "$base/settings.json")) { throw 'Prepare local fixtures first.' }
if ($Mode -eq 'collect') {
  foreach ($key in $scenarios.Keys) {
    $path="$base/logs/$key.jsonl"
    if (-not (Test-Path $path)) { Write-Output "$key pending"; continue }
    RunEvidence $key
    if (Test-Path "$base/logs/$key-2.jsonl") { RunEvidence "$key-2" }
  }
  exit 0
}
$scenarioId=$Id -replace '-2$',''
if ($Mode -eq 'run' -and -not $scenarios.Contains($scenarioId)) { throw 'Unknown baseline id.' }
if ($Mode -eq 'run' -and (Test-Path "$base/logs/$Id.jsonl")) { throw 'Never overwrite a baseline run.' }
if ($Mode -eq 'run') {
  PriorRunsPass $scenarioId
  if ($Id -ne $scenarioId) {
    if ($scenarioId -eq 'r-reviews') { throw 'Reviews scenario has one specified run.' }
    $first=RunEvidence $scenarioId
    if ($first.Loaded) { throw 'Retry only a valid completed first run that failed to load.' }
    Shell -argv @('sh',$harness,'fixture','odo',"$base/fixtures/$Id")
    $fixtureSha=git -C "$base/fixtures/$Id" rev-parse HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Retry fixture revision unavailable.' }
    WriteText "$base/evidence/$Id.fixture-sha.txt" $fixtureSha
  }
  AssertLiveUnchanged
  Shell -argv @('sh',$harness,'verify-prefix',"$base/prefix")
}
$oldConfig=$env:CLAUDE_CONFIG_DIR
$oldToken=$env:CLAUDE_CODE_OAUTH_TOKEN
$oldPath=$env:PATH
try {
  $credential = Get-Content -LiteralPath 'C:/Users/Ikran/.claude-bodish/.credentials.json' -Raw | ConvertFrom-Json
  $oauth=$credential.claudeAiOauth
  if (-not $oauth.accessToken) { throw 'Existing subscription credential unavailable.' }
  if ($oauth.expiresAt -and [double]$oauth.expiresAt -le [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) { throw 'Existing credential expired; do not refresh the live profile.' }
  $env:CLAUDE_CODE_OAUTH_TOKEN=$oauth.accessToken
  $credential=$null; $oauth=$null
  $env:CLAUDE_CONFIG_DIR="$base/profile"
  $env:PATH='C:/Program Files/Git/usr/bin;'+$oldPath
  if ($Mode -eq 'auth') {
    $authOutput=& claude auth status 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Isolated-profile authentication failed.' }
    $auth=$authOutput | ConvertFrom-Json
    if (-not $auth.loggedIn) { throw 'Isolated profile is not authenticated.' }
    Write-Output 'Isolated-profile authentication passed; no account details printed.'
  } else {
    Shell -argv @('sh',"$base/drive-local.sh",$Worktree,$base,$Id,"$Worktree/plugin/practice/baselines/$($scenarios[$scenarioId])")
    Shell -argv @('sh',$harness,'verify-prefix',"$base/prefix")
    RunEvidence $Id
  }
} finally {
  $env:CLAUDE_CONFIG_DIR=$oldConfig
  $env:CLAUDE_CODE_OAUTH_TOKEN=$oldToken
  $env:PATH=$oldPath
  AssertLiveUnchanged
}
