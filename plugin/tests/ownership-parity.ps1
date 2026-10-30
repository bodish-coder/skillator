# Focused A167 regression: Windows PowerShell 5.1 and Git sh, no installer entrypoint.
param([string]$InstallerDirectory = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
$utf8 = New-Object Text.UTF8Encoding $false
$owned = '.skillator-owned'; $manifest = '.skillator-installed'
$shipped = @()
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $InstallerDirectory 'install.ps1'), [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Installer parse failure' }
foreach ($name in 'Get-RelFiles', 'Get-OwnershipManifest', 'Write-Owned', 'Test-OwnedIntact', 'Test-SameContents', 'Remove-Unshipped') {
  $fn = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
  if (-not $fn) { throw "Missing function $name" }
  . ([scriptblock]::Create($fn.Extent.Text))
}
$shell = [IO.File]::ReadAllText((Join-Path $InstallerDirectory 'install.sh'), $utf8).Replace("`r`n", "`n")
$start = $shell.IndexOf('ownership_manifest() (')
$end = $shell.IndexOf('# pi_ignore <dest>:', $start)
if ($start -lt 0 -or $end -lt 0) { throw 'Missing shell ownership helpers' }
$root = Join-Path ([IO.Path]::GetTempPath()) ('a167-' + [guid]::NewGuid().ToString('N'))
function Invoke-ShellCheck([string]$mode) {
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = (Get-Command sh -ErrorAction Stop).Source
  $info.Arguments = (@($driver, "$shellRoot/source", "$shellRoot/dest/shell", $mode, $shellRoot) | ForEach-Object { '"' + $_ + '"' }) -join ' '
  $info.UseShellExecute = $false; $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
  $process = [Diagnostics.Process]::Start($info)
  try {
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit(30000)) {
      & taskkill /PID $process.Id /T /F | Out-Null
      throw 'Shell ownership check exceeded 30 seconds'
    }
    if ($process.ExitCode -ne 0) { throw "Shell $mode failed ($($process.ExitCode)): $($stdout.Result) $($stderr.Result)" }
    if ($stderr.Result) { throw "Shell warning: $($stderr.Result)" }
  } finally { $process.Dispose() }
}
try {
  $source = Join-Path $root 'source'; $dest = Join-Path $root 'dest'
  $psCopy = Join-Path $dest 'powershell'; $shCopy = Join-Path $dest 'shell'
  New-Item -ItemType Directory -Path (Join-Path $source 'nested dir'), $dest -Force | Out-Null
  # Construct the accent explicitly so Windows PowerShell can read this BOMless script.
  $paths = @('SKILL.md', 'helper.ps1', ('nested dir/caf' + [char]0xe9 + '.txt'))
  foreach ($path in $paths[2..0]) { [IO.File]::WriteAllText((Join-Path $source $path), "identical bytes`r`n", $utf8) }
  Copy-Item -LiteralPath $source -Destination $psCopy -Recurse
  Copy-Item -LiteralPath $source -Destination $shCopy -Recurse
  Write-Owned $psCopy $source
  if (-not (Test-OwnedIntact $psCopy)) { throw 'Unchanged multifile PowerShell copy rejected' }
  $driver = Join-Path $root 'ownership.sh'
  $body = @'
set -eu
PATH=/usr/bin:/bin:$PATH
export PATH
owned=.skillator-owned
manifest=.skillator-installed
shipped=
src="$1"
case "$2" in "$4"/dest/shell) ;; *) exit 90 ;; esac
if [ "$3" = write ]; then
  write_owned "$2" "$1"
  owned_intact "$2"
else
  if owned_intact "$2"; then exit 91; fi
  if same_contents "$2" "$1"; then exit 92; fi
  dry=1; prune_dest "$4/dest"
  dry=; prune_dest "$4/dest"
  [ -f "$2/helper.ps1" ]
fi
'@
  [IO.File]::WriteAllText($driver, ($shell.Substring($start, $end - $start) + "`n" + $body + "`n").Replace("`r`n", "`n"), $utf8)
  $shellRoot = $root.Replace('\', '/')
  Invoke-ShellCheck write
  $psBytes = [IO.File]::ReadAllBytes((Join-Path $psCopy $owned))
  $shBytes = [IO.File]::ReadAllBytes((Join-Path $shCopy $owned))
  if ([Convert]::ToBase64String($psBytes) -cne [Convert]::ToBase64String($shBytes)) { throw 'Marker bytes differ across ports' }
  if ($psBytes -contains 13 -or $psBytes[0] -ne 115) { throw 'Marker has CR or BOM' }
  $lines = $utf8.GetString($psBytes).Split("`n")
  if ($lines.Count -ne 5 -or $lines[0] -cne 'skillator-owned 2' -or $lines[4] -cne '') { throw 'Incorrect marker framing or entry count' }
  for ($i = 0; $i -lt $paths.Count; $i++) {
    if ($lines[$i + 1] -cnotmatch ('^file [0-9a-f]{64} ' + [regex]::Escape($paths[$i]) + '$')) { throw 'Incorrect file entry or ordering' }
  }
  'PASS: unchanged multifile ownership; three sorted entries; LF/no BOM; byte-identical ports'
  foreach ($copy in $psCopy, $shCopy) {
    [IO.File]::WriteAllText((Join-Path $copy $owned), "file SKILL.md helper.ps1`n", $utf8)
    [IO.File]::WriteAllText((Join-Path $copy 'helper.ps1'), "user edit`n", $utf8)
  }
  [IO.File]::WriteAllText((Join-Path $dest $manifest), "powershell`nshell`n", $utf8)
  if (Test-OwnedIntact $psCopy) { throw 'Malformed historical marker accepted' }
  if (Test-SameContents $psCopy $source) { throw 'Migration authorized over edited helper' }
  foreach ($DryRun in @($true, $false)) {
    $output = Remove-Unshipped $dest 6>&1 | Out-String
    if (-not $output.Contains('kept powershell (modified or unverifiable')) { throw 'Missing retention explanation' }
    if (-not (Test-Path -LiteralPath $psCopy)) { throw 'Malformed marker authorized cleanup' }
  }
  Invoke-ShellCheck malformed
  foreach ($copy in $psCopy, $shCopy) {
    if ([IO.File]::ReadAllText((Join-Path $copy 'helper.ps1'), $utf8) -cne "user edit`n") { throw 'User edit changed' }
  }
  'PASS: collapsed historical marker cannot authorize dry-run/actual cleanup or adoption over edits'
} finally {
  $resolved = [IO.Path]::GetFullPath($root)
  $temp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  if (-not $resolved.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $resolved) -notmatch '^a167-[0-9a-f]{32}$') { throw 'Unsafe fixture cleanup path' }
  if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
