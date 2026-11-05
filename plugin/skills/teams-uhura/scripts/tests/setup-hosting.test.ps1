# setup-hosting.test.ps1 - test tunnel hosting verification for setup.ps1 and setup.sh (A215)
# Verifies exact requested tunnel/port identity before reusing a running host.
$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $PSCommandPath
$setupPs1 = Join-Path (Split-Path -Parent $scriptDir) 'setup.ps1'
$setupSh = Join-Path (Split-Path -Parent $scriptDir) 'setup.sh'

function Assert-Equal($actual, $expected, [string]$msg) {
  if ($actual -ne $expected) {
    throw "FAIL: $msg (expected: '$expected', actual: '$actual')"
  }
}

function Assert-True($val, [string]$msg) {
  if (-not $val) {
    throw "FAIL: $msg (expected true, got: '$val')"
  }
}

function Assert-False($val, [string]$msg) {
  if ($val) {
    throw "FAIL: $msg (expected false, got: '$val')"
  }
}

# 1. Verify single-line extraction and evaluation as done in verification-setup-probe.ps1
Write-Host "Extracting TunnelHosted function from setup.ps1..."
$sourceLines = [IO.File]::ReadAllLines($setupPs1)
$hostedLine = $sourceLines | Where-Object { $_ -match '^function TunnelHosted\b' } | Select-Object -First 1
if (-not $hostedLine) {
  throw "FAIL: function TunnelHosted not found in setup.ps1"
}
Invoke-Expression $hostedLine

# 2. Test: Unrelated devtunnel host process fixture must NOT satisfy readiness
Write-Host "Testing unrelated devtunnel host fixture..."
function Get-Process { [pscustomobject]@{ ProcessName = 'devtunnel'; CommandLine = 'devtunnel host unrelated-project' } }
$unrelatedResult = TunnelHosted
Assert-False $unrelatedResult "Unrelated devtunnel host process must NOT satisfy readiness"

# 3. Test: Correct matching devtunnel host fixture IS satisfied and reused
Write-Host "Testing correct matching devtunnel host fixture..."
function Get-Process { [pscustomobject]@{ ProcessName = 'devtunnel'; CommandLine = 'devtunnel host skillator-teams' } }
$matchResult = TunnelHosted
Assert-True $matchResult "Matching devtunnel host process must satisfy readiness"

# 4. Test: Matching tunnel with matching port
Write-Host "Testing matching tunnel with explicit port..."
function Get-Process { [pscustomobject]@{ ProcessName = 'devtunnel'; CommandLine = 'devtunnel host skillator-teams -p 3978' } }
$portMatchResult = TunnelHosted 'skillator-teams' 3978
Assert-True $portMatchResult "Matching tunnel and port must satisfy readiness"

# 5. Test: Matching tunnel but mismatched port must NOT satisfy readiness
Write-Host "Testing matching tunnel with mismatched port..."
function Get-Process { [pscustomobject]@{ ProcessName = 'devtunnel'; CommandLine = 'devtunnel host skillator-teams -p 8080' } }
$portMismatchResult = TunnelHosted 'skillator-teams' 3978
Assert-False $portMismatchResult "Matching tunnel with wrong port must NOT satisfy readiness"

# 6. Test: Substring tunnel name must NOT satisfy readiness
Write-Host "Testing substring tunnel name..."
function Get-Process { [pscustomobject]@{ ProcessName = 'devtunnel'; CommandLine = 'devtunnel host skillator-teams-other' } }
$subResult1 = TunnelHosted 'skillator-teams'
Assert-False $subResult1 "Superset tunnel name must NOT satisfy readiness"

function Get-Process { [pscustomobject]@{ ProcessName = 'devtunnel'; CommandLine = 'devtunnel host my-skillator-teams' } }
$subResult2 = TunnelHosted 'skillator-teams'
Assert-False $subResult2 "Prefixed tunnel name must NOT satisfy readiness"

# 7. Test: Non-host devtunnel command must NOT satisfy readiness
Write-Host "Testing non-host devtunnel command..."
function Get-Process { [pscustomobject]@{ ProcessName = 'devtunnel'; CommandLine = 'devtunnel user show' } }
$nonHostResult = TunnelHosted
Assert-False $nonHostResult "devtunnel user show must NOT satisfy readiness"

# 8. Test: Missing / unknown process identity must NOT satisfy readiness
Write-Host "Testing missing/unknown process identity..."
# Object with null/empty CommandLine
function Get-Process { [pscustomobject]@{ ProcessName = 'devtunnel'; CommandLine = $null } }
$unknownResult = TunnelHosted
Assert-False $unknownResult "devtunnel process with null CommandLine must NOT satisfy readiness"

# Empty process list
function Get-Process { @() }
$emptyResult = TunnelHosted
Assert-False $emptyResult "Empty process list must NOT satisfy readiness"

# 9. Verify shell counterpart setup.sh source verification
Write-Host "Verifying setup.sh tunnel_hosted function..."
$shContent = [IO.File]::ReadAllText($setupSh)
# Must not use the old unqualified "devtunnel host" check that matches any host
if ($shContent -match 'tunnel_hosted\(\)\s*\{\s*pgrep -f "devtunnel host"\s*>/dev/null') {
  throw "FAIL: setup.sh still uses old unqualified pgrep without tunnel name"
}
# Must verify the requested tunnel identity
if ($shContent -notmatch 'tunnel_hosted\(\)\s*\{[^}]*TUNNEL') {
  throw "FAIL: setup.sh tunnel_hosted must reference TUNNEL / requested tunnel"
}

# 10. Check ASCII and LF encoding
Write-Host "Checking ASCII and LF encoding..."
foreach ($f in @($setupPs1, $setupSh, $PSCommandPath)) {
  $bytes = [IO.File]::ReadAllBytes($f)
  $nonAscii = @($bytes | Where-Object { $_ -gt 127 }).Count
  $crCount = @($bytes | Where-Object { $_ -eq 13 }).Count
  Assert-Equal $nonAscii 0 "$f must be pure ASCII"
  Assert-Equal $crCount 0 "$f must use LF line endings only"
}

Write-Host "ALL HOSTING TESTS PASSED"
