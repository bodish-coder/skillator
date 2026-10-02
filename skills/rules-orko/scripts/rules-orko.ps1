# rules-orko: the two rule files, read and written from one place (F25).
# Windows twin of rules-orko.sh, which carries the full reasoning; keep the
# two in step. Same files, same line format, so one clone worked from Git
# Bash and PowerShell sees one set of rules.
#
#   rules-orko.ps1 show                      every rule in force here, scope-tagged
#   rules-orko.ps1 add global|project TEXT   append one rule at that scope
#   rules-orko.ps1 paths                     the two files this clone resolves to
#   rules-orko.ps1 -Selftest
#
# GLOBAL: $env:SKILLATOR_HOME\rules.md, default $env:USERPROFILE\.skillator\rules.md
# (HOME when USERPROFILE is unset). PROJECT: <git toplevel>\.skillator\rules.md,
# outside git .\.skillator\rules.md.
param(
  [Parameter(Position = 0)][string]$Command,
  [Parameter(Position = 1)][string]$Scope,
  [Parameter(Position = 2)][string]$Text,
  [switch]$Selftest
)
$ErrorActionPreference = 'Stop'
$prog = 'rules-orko.ps1'

function Usage {
  [Console]::Error.WriteLine("usage: $prog show | paths | add global|project TEXT")
  [Console]::Error.WriteLine("       $prog -Selftest")
  exit 2
}
function Die([string]$msg, [int]$code = 1) { [Console]::Error.WriteLine("${prog}: $msg"); exit $code }

function Invoke-GitQuiet([string[]]$a) {
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { $out = & git @a 2>$null; $code = $LASTEXITCODE } finally { $ErrorActionPreference = $prev }
  return @($code, @($out))
}

function Get-GlobalPath {
  if ($env:SKILLATOR_HOME) { return (Join-Path $env:SKILLATOR_HOME 'rules.md') }
  $h = $env:USERPROFILE; if (-not $h) { $h = $env:HOME }
  if (-not $h) { Die 'neither USERPROFILE nor HOME is set' }
  return (Join-Path (Join-Path $h '.skillator') 'rules.md')
}

function Get-ProjectPath {
  $r = Invoke-GitQuiet @('rev-parse', '--show-toplevel')
  if ($r[0] -eq 0 -and $r[1].Count -gt 0) { return "$([string]$r[1][0])/.skillator/rules.md" }
  return './.skillator/rules.md'
}

function Get-Who {
  $n = (Invoke-GitQuiet @('config', 'user.name'))[1] | Select-Object -First 1
  $e = (Invoke-GitQuiet @('config', 'user.email'))[1] | Select-Object -First 1
  if ($n) { return [string]$n } elseif ($e) { return [string]$e } else { return 'unknown' }
}

# Rule lines only: "- text". Headers and blanks are skipped.
function Get-Rules([string]$f) {
  if (-not (Test-Path -LiteralPath $f -PathType Leaf)) { return @() }
  $out = @()
  foreach ($l in [IO.File]::ReadAllLines($f, [Text.Encoding]::UTF8)) {
    if ($l.StartsWith('- ')) { $out += $l.Substring(2) }
  }
  return $out
}

$headerGlobal = @(
  '# Rules - global', '',
  'How this user works, in every project, on every host. Personal: this file',
  'lives outside every repo and is never committed. rules-orko reads it at',
  'session start; rules-orko.sh add global "<rule>" appends to it.', '')
$headerProject = @(
  '# Rules - project', '',
  'How this codebase is worked on, for everyone who pulls it. Committed with',
  'the repo. rules-orko reads it at session start; rules-orko.sh add project',
  '"<rule>" appends to it. A personal habit does not belong here - it goes to',
  '~/.skillator/rules.md, which follows its owner and nobody else.', '')

# LF, no BOM: the .sh twin and git read these files too.
function Write-Lines([string]$f, [string[]]$lines, [bool]$append) {
  $enc = New-Object Text.UTF8Encoding($false)
  $body = ($lines -join "`n") + "`n"
  if ($append) { [IO.File]::AppendAllText($f, $body, $enc) } else { [IO.File]::WriteAllText($f, $body, $enc) }
}

function Show {
  $g = Get-GlobalPath; $p = Get-ProjectPath
  $gr = @(Get-Rules $g); $pr = @(Get-Rules $p)
  $gs = $g; if (-not (Test-Path -LiteralPath $g -PathType Leaf)) { $gs = "$g, absent" }
  $ps = $p; if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { $ps = "$p, absent" }
  Write-Output ("rules-orko: project {0} ({1}) . global {2} ({3}) . user {4}" -f $pr.Count, $ps, $gr.Count, $gs, (Get-Who))
  foreach ($r in $pr) { Write-Output "project: $r" }
  foreach ($r in $gr) { Write-Output "global:  $r" }
  if ($gr.Count -gt 0 -and $pr.Count -gt 0) {
    [Console]::Error.WriteLine('clash check: read both lists above; a global rule that contradicts a project rule is asked, never settled here')
  }
}

function Add([string]$scope, [string]$text) {
  if (-not $text) { Die 'add: the rule text is empty' 2 }
  if ($text -match "`n") { Die 'add: one rule, one line' 2 }
  $day = (Get-Date).ToString('yyyy-MM-dd')
  switch ($scope) {
    'global'  { $f = Get-GlobalPath;  $line = "- $text ($day)" }
    'project' { $f = Get-ProjectPath; $line = "- $text ($(Get-Who), $day)" }
    default   { Die "add: scope is global or project, got '$scope'" 2 }
  }
  foreach ($r in @(Get-Rules $f)) {
    if (($r -replace ' \([^()]*\)$', '') -ceq $text) {
      [Console]::Error.WriteLine("${prog}: already a $scope rule, nothing added: $text"); return
    }
  }
  $dir = Split-Path -Parent $f
  if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  if (-not (Test-Path -LiteralPath $f -PathType Leaf)) {
    if ($scope -eq 'global') { Write-Lines $f $headerGlobal $false } else { Write-Lines $f $headerProject $false }
  }
  Write-Lines $f @($line) $true
  Write-Output "${prog}: $scope rule added to $f"
  if ($scope -eq 'project') {
    [Console]::Error.WriteLine("${prog}: commit .skillator/rules.md so a teammate's git pull brings it")
  }
}

function Paths {
  Write-Output "global:  $(Get-GlobalPath)"
  Write-Output "project: $(Get-ProjectPath)"
}

function Run-Selftest {
  $me = $PSCommandPath
  $t = Join-Path ([IO.Path]::GetTempPath()) ("rules-orko-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $t | Out-Null
  $gc = @('-c', 'core.hooksPath=NUL', '-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false')
  function G([string]$dir, [string[]]$a) {
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    & git -C $dir @gc @a 2>&1 | Out-Null
    $ErrorActionPreference = $prev
    if ($LASTEXITCODE -ne 0) { throw "git $a failed in $dir" }
  }
  # stdout is the answer (joined lines); stderr lines land in $script:lastErr.
  function Run([string]$dir, [string]$rulesHome, [string[]]$a) {
    Push-Location $dir
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $old = $env:SKILLATOR_HOME
    try {
      if ($rulesHome) { $env:SKILLATOR_HOME = $rulesHome } else { Remove-Item Env:SKILLATOR_HOME -ErrorAction SilentlyContinue }
      $all = & powershell -NoProfile -ExecutionPolicy Bypass -File $me @a 2>&1
      $script:lastCode = $LASTEXITCODE
      $script:lastErr = ($all | Where-Object { $_ -is [Management.Automation.ErrorRecord] } | ForEach-Object { "$_" }) -join "`n"
      $o = $all | Where-Object { $_ -isnot [Management.Automation.ErrorRecord] } | ForEach-Object { "$_" }
      return ($o -join "`n")
    } finally {
      if ($old) { $env:SKILLATOR_HOME = $old } else { Remove-Item Env:SKILLATOR_HOME -ErrorAction SilentlyContinue }
      $ErrorActionPreference = $prev; Pop-Location
    }
  }
  function Fail([string]$msg) { [Console]::Error.WriteLine("SELFTEST FAIL: $msg"); exit 1 }
  $oldProfile = $env:USERPROFILE; $oldCfg = $env:GIT_CONFIG_GLOBAL; $oldNoSys = $env:GIT_CONFIG_NOSYSTEM
  try {
    $env:USERPROFILE = Join-Path $t 'home-nobody'
    # Git for Windows is MSYS: /dev/null is the spelling it understands here.
    $env:GIT_CONFIG_GLOBAL = '/dev/null'; $env:GIT_CONFIG_NOSYSTEM = '1'
    $homeA = Join-Path $t 'homeA'; $homeB = Join-Path $t 'homeB'
    $p1 = Join-Path $t 'p1'; $p2 = Join-Path $t 'p2'
    foreach ($d in @($homeA, $homeB, $p1, $p2, $env:USERPROFILE)) { New-Item -ItemType Directory -Path $d | Out-Null }
    foreach ($d in @($p1, $p2)) {
      G $d @('init', '-q', '-b', 'main', '.'); G $d @('config', 'user.name', 'Ada'); G $d @('config', 'user.email', 'ada@example.invalid')
    }

    # 1. Two projects, one user: a global rule stated in P1 is in force in P2.
    $o = Run $p1 $homeA @('add', 'global', 'always run the tests before committing')
    if (-not (Test-Path -LiteralPath (Join-Path $homeA 'rules.md'))) { Fail "global rule not written to SKILLATOR_HOME: $o" }
    if (Test-Path -LiteralPath (Join-Path $p1 '.skillator')) { Fail 'global rule leaked into the project tree' }
    $o = Run $p2 $homeA @('show')
    if ($o -notmatch '(?m)^global:  always run the tests before committing \(') { Fail "global rule from p1 not shown in fresh p2: $o" }
    if ($o -notmatch '(?m)^rules-orko: project 0 \(.*absent\) \. global 1 \(') { Fail "show header wrong: $o" }

    # 2. A project rule reaches a second clone after git pull.
    $origin = Join-Path $t 'origin.git'
    G $t @('init', '-q', '--bare', '-b', 'main', $origin)
    [IO.File]::WriteAllText((Join-Path $p1 'README'), "x`n")
    G $p1 @('add', 'README'); G $p1 @('commit', '-q', '-m', 'init'); G $p1 @('remote', 'add', 'origin', $origin); G $p1 @('push', '-q', 'origin', 'main')
    $clone2 = Join-Path $t 'clone2'
    G $t @('clone', '-q', $origin, $clone2)
    G $clone2 @('config', 'user.name', 'Bob'); G $clone2 @('config', 'user.email', 'bob@example.invalid')
    $o = Run $p1 $homeA @('add', 'project', 'never edit notekeep/store.py without asking')
    if ($script:lastErr -notmatch 'commit \.skillator/rules\.md') { Fail 'project add did not say to commit' }
    $pf = Join-Path (Join-Path $p1 '.skillator') 'rules.md'
    $raw = [IO.File]::ReadAllText($pf)
    if ($raw -notmatch '(?m)^- never edit notekeep/store\.py without asking \(Ada, 20') { Fail "project rule line wrong: $raw" }
    if ($raw -match "`r") { Fail 'project file has CRLF line endings' }
    if ([IO.File]::ReadAllBytes($pf)[0] -eq 0xEF) { Fail 'project file has a BOM' }
    G $p1 @('add', '.skillator'); G $p1 @('commit', '-q', '-m', 'rules'); G $p1 @('push', '-q', 'origin', 'main')
    $o = Run $clone2 $homeB @('show')
    if ($o -match 'never edit') { Fail 'clone2 saw the project rule before pulling' }
    G $clone2 @('pull', '-q', 'origin', 'main')
    $o = Run (Join-Path $clone2 '.skillator') $homeB @('show')
    if ($o -notmatch '(?m)^project: never edit notekeep/store\.py without asking \(Ada, ') { Fail "project rule not in clone2 after pull (run from a subdir): $o" }

    # 3. A second git user gets the project rules plus THEIR OWN global ones.
    $null = Run $clone2 $homeB @('add', 'global', 'prefer tabs')
    $o = Run $clone2 $homeB @('show')
    if ($o -notmatch '(?m)^project: never edit') { Fail "user B lost the project rule: $o" }
    if ($o -notmatch '(?m)^global:  prefer tabs \(') { Fail "user B lost their own global rule: $o" }
    if ($o -match 'always run the tests') { Fail "user B got user A's global rule: $o" }
    if ($o -notmatch '(?m)user Bob$') { Fail "show does not name the user: $o" }
    if ($script:lastErr -notmatch 'clash check') { Fail 'both scopes present but no clash-check line' }
    $o = Run $p1 $homeA @('show')
    if ($o -match 'prefer tabs') { Fail "user A got user B's global rule: $o" }

    # 4. Default path, dedupe, bad input, headers, outside git.
    $top1 = [string](Invoke-GitQuiet @('-C', $p1, 'rev-parse', '--show-toplevel'))[1][0]
    $o = Run $p1 '' @('paths')
    $wantG = Join-Path (Join-Path $env:USERPROFILE '.skillator') 'rules.md'
    if ($o -notmatch ('(?m)^global:  ' + [regex]::Escape($wantG) + '$')) { Fail "default global path wrong: $o" }
    if ($o -notmatch ('(?m)^project: ' + [regex]::Escape("$top1/.skillator/rules.md") + '$')) { Fail "project path wrong: $o" }
    $null = Run $p1 $homeA @('add', 'global', 'always run the tests before committing')
    if ($script:lastErr -notmatch 'already a global rule') { Fail 'duplicate rule not reported' }
    $n = @([IO.File]::ReadAllLines((Join-Path $homeA 'rules.md')) | Where-Object { $_.StartsWith('- ') }).Count
    if ($n -ne 1) { Fail "duplicate rule appended ($n lines)" }
    if ([IO.File]::ReadAllLines((Join-Path $homeA 'rules.md'))[0] -ne '# Rules - global') { Fail 'global header missing' }
    if ([IO.File]::ReadAllLines($pf)[0] -ne '# Rules - project') { Fail 'project header missing' }
    $null = Run $p1 '' @('add', 'elsewhere', 'x'); if ($script:lastCode -ne 2) { Fail 'bad scope accepted' }
    $null = Run $p1 '' @('add', 'global', ''); if ($script:lastCode -ne 2) { Fail 'empty rule accepted' }
    $null = Run $p1 '' @('bogus'); if ($script:lastCode -ne 2) { Fail 'unknown command accepted' }
    $plain = Join-Path $t 'plain'; New-Item -ItemType Directory -Path $plain | Out-Null
    $env:GIT_CEILING_DIRECTORIES = $t
    try {
      $null = Run $plain '' @('add', 'project', 'plain rule')
      if (-not (Test-Path -LiteralPath (Join-Path (Join-Path $plain '.skillator') 'rules.md'))) { Fail 'outside git: project file not created in cwd' }
      $o = Run $plain '' @('show')
    } finally { Remove-Item Env:GIT_CEILING_DIRECTORIES -ErrorAction SilentlyContinue }
    if ($o -notmatch '(?m)^project: plain rule \(unknown, ') { Fail "outside git: who should be unknown: $o" }
    $src = [IO.File]::ReadAllText($me)
    if ($src -match '[^\x00-\x7F]') { Fail 'script is not pure ASCII' }
    if ($src -match "`r") { Fail 'script has CRLF line endings' }

    Write-Output 'ok - rules-orko.ps1 selftest passed (global follows the user into p2, project reaches clone2 on pull, user B gets project + own global and not A''s, default path, dedupe, bad input, no-git)'
  } finally {
    $env:USERPROFILE = $oldProfile
    if ($oldCfg) { $env:GIT_CONFIG_GLOBAL = $oldCfg } else { Remove-Item Env:GIT_CONFIG_GLOBAL -ErrorAction SilentlyContinue }
    if ($oldNoSys) { $env:GIT_CONFIG_NOSYSTEM = $oldNoSys } else { Remove-Item Env:GIT_CONFIG_NOSYSTEM -ErrorAction SilentlyContinue }
    Remove-Item -Recurse -Force -LiteralPath $t -ErrorAction SilentlyContinue
  }
}

if ($Selftest) { Run-Selftest; exit 0 }
switch ($Command) {
  'show'  { if ($Scope -or $Text) { Usage }; Show }
  'paths' { if ($Scope -or $Text) { Usage }; Paths }
  'add'   { if (-not $Scope -or $null -eq $Text) { Usage }; Add $Scope $Text }
  default { Usage }
}
