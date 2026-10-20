# ops - the skillator ops board beside any CLI.
#   powershell -NoProfile -ExecutionPolicy Bypass -File ops.ps1 [-Repo <dir>] [--ascii] [--no-color] [--once] ...
# Needs node 22.18 or newer (it runs the board's .ts directly). Exit code: the app's.
# Pure ASCII: Windows PowerShell 5.1 reads a BOM-less script in the ANSI code page.
param(
  [string]$Repo = '.',
  [Parameter(ValueFromRemainingArguments = $true)][string[]]$Rest = @()
)
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
# node --import takes a URL (file:///C:/...), not a drive path.
$loader = ([System.Uri](Join-Path $PSScriptRoot 'loader.mjs')).AbsoluteUri
$app = Join-Path $PSScriptRoot 'app.ts'
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
