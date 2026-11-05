# setup-args.test.ps1 - test argument validation for setup.ps1 (A214)
# Verifies unknown/typo options exit 2 before any setup action,
# while documented options (--check, -Check, --selftest, -Selftest, and no args) are accepted.
$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $PSCommandPath
$setupScript = Join-Path (Split-Path -Parent $scriptDir) 'setup.ps1'

function Assert-Equal($actual, $expected, [string]$msg) {
  if ($actual -ne $expected) {
    throw "FAIL: $msg (expected: '$expected', actual: '$actual')"
  }
}

function Assert-Match($actual, [string]$pattern, [string]$msg) {
  if ($actual -notmatch $pattern) {
    throw "FAIL: $msg (did not match pattern: '$pattern', actual: '$actual')"
  }
}

function Run-Script {
  $scriptArgs = $args
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $o = (& powershell -NoProfile -ExecutionPolicy Bypass -File $setupScript @scriptArgs 2>&1 | ForEach-Object { "$_" }) -join "`n"
    @{ code = $LASTEXITCODE; out = $o }
  } catch {
    @{ code = 1; out = "$_" }
  } finally {
    $ErrorActionPreference = $prev
  }
}

# 1. Test script content has the argument rejection before any action
Write-Host "Verifying setup.ps1 has unknown argument rejection before actions..."
$setupLines = [IO.File]::ReadAllLines($setupScript)
$hasUsage = $false
$hasExit2 = $false
for ($i = 0; $i -lt [Math]::Min(30, $setupLines.Length); $i++) {
  if ($setupLines[$i] -match 'usage:') { $hasUsage = $true }
  if ($setupLines[$i] -match 'exit 2') { $hasExit2 = $true }
}
$hasRejection = $hasUsage -and $hasExit2
Assert-Equal $hasRejection $true "setup.ps1 must reject unknown arguments with exit 2 near line 11 before any setup action"

# 2. Test execution with unknown/typo options
Write-Host "Testing execution with unknown arguments..."
$typoArgs = @('--chek', '-chek', '--unexpected', '-Unknown', 'bogus')
foreach ($arg in $typoArgs) {
  $r = Run-Script $arg
  Assert-Equal $r.code 2 "setup.ps1 $arg must exit with code 2"
  Assert-Match $r.out 'usage: setup\.ps1 \[--check \| --selftest\]' "setup.ps1 $arg output must show usage"
  # Must NOT start full walk or output any setup lines
  if ($r.out -match '(?m)^(node:|winget:|devtunnel:|login:|tunnel:|listener:)') {
    throw "FAIL: setup.ps1 $arg executed setup actions instead of exiting immediately: $($r.out)"
  }
}

# 3. Test multiple arguments rejection
Write-Host "Testing execution with multiple arguments..."
$multi = Run-Script '--check' 'extra'
Assert-Equal $multi.code 2 "setup.ps1 with multiple arguments must exit with code 2"
Assert-Match $multi.out 'usage: setup\.ps1 \[--check \| --selftest\]' "setup.ps1 multiple arguments output must show usage"

# 4. Test documented options retain behavior
Write-Host "Testing documented options retain behavior..."
# --selftest must exit 0 and print ok
$rSelftest = Run-Script '--selftest'
Assert-Equal $rSelftest.code 0 "setup.ps1 --selftest must exit 0"
Assert-Match $rSelftest.out 'ok' "setup.ps1 --selftest output must contain 'ok'"

# -Selftest must exit 0 and print ok
$rSelftest2 = Run-Script '-Selftest'
Assert-Equal $rSelftest2.code 0 "setup.ps1 -Selftest must exit 0"
Assert-Match $rSelftest2.out 'ok' "setup.ps1 -Selftest output must contain 'ok'"

# --check must run check mode (changes nothing, prints table)
$rCheck = Run-Script '--check'
Assert-Match $rCheck.out '(?m)^\s+node\s+' "setup.ps1 --check must display status table"

# -Check must run check mode (changes nothing, prints table)
$rCheck2 = Run-Script '-Check'
Assert-Match $rCheck2.out '(?m)^\s+node\s+' "setup.ps1 -Check must display status table"

# 5. Check ASCII and LF encoding of setup.ps1 and this test file
Write-Host "Checking ASCII and LF encoding..."
foreach ($f in @($setupScript, $PSCommandPath)) {
  $bytes = [IO.File]::ReadAllBytes($f)
  $nonAscii = @($bytes | Where-Object { $_ -gt 127 }).Count
  $crCount = @($bytes | Where-Object { $_ -eq 13 }).Count
  Assert-Equal $nonAscii 0 "$f must be pure ASCII"
  Assert-Equal $crCount 0 "$f must use LF line endings only"
}

Write-Host "ALL TESTS PASSED"
