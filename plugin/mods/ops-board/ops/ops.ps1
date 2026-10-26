# ops - the skillator ops board beside any CLI.
#   powershell -NoProfile -ExecutionPolicy Bypass -File ops.ps1 [-Repo <dir>] [-Open] [--ascii] [--no-color] [--once] ...
# Needs node 22.18 or newer (it runs the board's .ts directly). Exit code: the app's.
# F89: -Open (or --open) starts the board in a new tab of the current Windows Terminal
# window when wt is on PATH (the 'skillator ops' profile when its fragment is installed),
# else runs it here as without it.
# Pure ASCII: Windows PowerShell 5.1 reads a BOM-less script in the ANSI code page.
param(
  [string]$Repo = '.',
  [switch]$Open,
  [Parameter(ValueFromRemainingArguments = $true)][string[]]$Rest = @()
)
if ($Rest -contains '--open') { $Open = $true; $Rest = @($Rest | Where-Object { $_ -ne '--open' }) }
try { Set-Location -LiteralPath $Repo -ErrorAction Stop } catch {
  [Console]::Error.WriteLine("ops: no such directory: $Repo")
  exit 2
}
$v = $null
try { $v = (& node -p 'process.versions.node' 2>$null | Select-Object -First 1) } catch { $v = $null }
if ($v) { $v = "$v".Trim() }
$ok = $false
if ($v) {
  $parsed = $null
  if ([version]::TryParse($v, [ref]$parsed)) { $ok = $parsed -ge [version]'22.18' }
}
if (-not $ok) {
  $found = 'none'
  if ($v) { $found = $v }
  [Console]::Error.WriteLine("ops needs node 22.18 or newer (found $found): https://nodejs.org")
  exit 2
}
if ($Open) {
  $wt = Get-Command wt -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($wt) {
    $here = (Get-Location).ProviderPath
    $a = @('-w', '0', 'new-tab', '--title', 'ops')
    if ($env:LOCALAPPDATA -and (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'Microsoft\Windows Terminal\Fragments\skillator\ops.json'))) { $a += @('-p', 'skillator ops') }
    $a += @('-d', $here, 'powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath, '-Repo', $here) + $Rest
    & $wt.Source @a
    exit $LASTEXITCODE
  }
}
# node --import takes a URL (file:///C:/...), not a drive path.
$loader = ([System.Uri](Join-Path $PSScriptRoot 'loader.mjs')).AbsoluteUri
$app = Join-Path $PSScriptRoot 'app.ts'
# A142: the board runs skillator's .ps1 scripts from here, even when started from Git Bash.
$env:SKILLATOR_OPS_SHELL = 'ps1'
# The frame is UTF-8; when this host relays node's output (a pipe), decode it as UTF-8.
$enc = [Console]::OutputEncoding
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false } catch { }
try {
  & node --import $loader $app @Rest
  $code = $LASTEXITCODE
} finally {
  try { [Console]::OutputEncoding = $enc } catch { }
}
exit $code
