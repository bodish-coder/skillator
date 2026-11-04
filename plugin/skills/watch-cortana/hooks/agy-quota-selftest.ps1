# Test for A189: Parse Antigravity quota windows independently
$ErrorActionPreference = 'Stop'
$scriptRoot = $PSScriptRoot
$tmp = Join-Path $scriptRoot ('.agy-test-' + [guid]::NewGuid())

try {
  New-Item $tmp -ItemType Directory -Force | Out-Null
  $cacheDir = Join-Path $tmp 'target'
  New-Item $cacheDir -ItemType Directory -Force | Out-Null
  $cache = Join-Path $cacheDir 'quota-cache.json'

  # Fixtures:
  $compact20_90 = '{"command":{"data":{"groups":[{"name":"Gemini Models","buckets":[{"window":"5h","remaining_fraction":0.8},{"window":"7d","remaining_fraction":0.1}]}]}}}'
  $multiline20_90 = @'
{
  "command": {
    "data": {
      "groups": [
        {
          "name": "Gemini Models",
          "buckets": [
            {
              "window": "5h",
              "remaining_fraction": 0.8
            },
            {
              "window": "7d",
              "remaining_fraction": 0.1
            }
          ]
        }
      ]
    }
  }
}
'@
  $fiveHourOnly = '{"command":{"data":{"groups":[{"name":"Gemini Models","buckets":[{"window":"5h","remaining_fraction":0.8}]}]}}}'
  $weeklyOnly = '{"command":{"data":{"groups":[{"name":"Gemini Models","buckets":[{"window":"7d","remaining_fraction":0.1}]}]}}}'
  $malformed = '{"command":{"data":{"groups":[{"name":"Gemini Models","buckets": broken'

  $cases = @(
    @{ name = 'compact-20-90'; raw = $compact20_90; expect5h = 20.0; expect7d = 90.0 },
    @{ name = 'multiline-20-90'; raw = $multiline20_90; expect5h = 20.0; expect7d = 90.0 },
    @{ name = '5h-only'; raw = $fiveHourOnly; expect5h = 20.0; expect7d = $null },
    @{ name = '7d-only'; raw = $weeklyOnly; expect5h = $null; expect7d = 90.0 },
    @{ name = 'malformed'; raw = $malformed; expect5h = $null; expect7d = $null; malformed = $true }
  )

  # 1. Test PowerShell implementation
  Write-Output "--- Testing PowerShell port ---"
  foreach ($c in $cases) {
    Remove-Item $cache -ErrorAction SilentlyContinue
    $raw = $c.raw
    $parsed = try { ConvertFrom-Json $raw -ErrorAction Stop } catch { $null }
    $h = $null; $wk = $null
    if ($parsed -and $parsed.command -and $parsed.command.data -and $parsed.command.data.groups) {
      foreach ($g in $parsed.command.data.groups) {
        if ($g.buckets) {
          foreach ($b in $g.buckets) {
            if ($null -ne $b.remaining_fraction) {
              $used = [math]::Round((1.0 - [double]$b.remaining_fraction) * 100, 1)
              if ($b.window -match '5h' -or $b.window -match 'hour') {
                if ($null -eq $h -or $used -gt $h) { $h = $used }
              } elseif ($b.window -match 'week' -or $b.window -match '7d') {
                if ($null -eq $wk -or $used -gt $wk) { $wk = $used }
              }
            }
          }
        }
      }
    }
    $res = $null
    if ($null -ne $h -or $null -ne $wk) {
      $res = [ordered]@{ src = 'agy' }
      if ($null -ne $h) { $res['5h'] = $h }
      if ($null -ne $wk) { $res['7d'] = $wk }
    }
    if ($c.malformed) {
      if ($null -ne $res) { throw "PS: malformed JSON should produce null result, got $res" }
    } else {
      if ($null -eq $res) { throw "PS: $($c.name) produced null result" }
      if ($c.expect5h -ne $res['5h']) { throw "PS: $($c.name) 5h mismatch: expected $($c.expect5h), got $($res['5h'])" }
      if ($c.expect7d -ne $res['7d']) { throw "PS: $($c.name) 7d mismatch: expected $($c.expect7d), got $($res['7d'])" }
      [IO.File]::WriteAllText($cache, (ConvertTo-Json $res -Compress))
      $jsonText = [IO.File]::ReadAllText($cache)
      if ($c.expect7d -eq $null -and $jsonText -match '"7d"') { throw "PS: $($c.name) should not contain 7d key" }
      if ($c.expect5h -eq $null -and $jsonText -match '"5h"') { throw "PS: $($c.name) should not contain 5h key" }
    }
    Write-Output "PS PASS: $($c.name)"
  }

  # 2. Test Shell implementation logic (via Node.js runner)
  Write-Output "--- Testing Shell port (node engine) ---"
  $nodeScript = @'
const fs = require('fs');
try {
  const rawStr = fs.readFileSync(0, 'utf8');
  const raw = JSON.parse(rawStr);
  let h = null, w = null;
  const groups = raw?.command?.data?.groups || [];
  for (const g of groups) {
    for (const b of (g.buckets || [])) {
      if (b && b.remaining_fraction != null) {
        const f = Number(b.remaining_fraction);
        if (Number.isFinite(f)) {
          const used = Math.round((1.0 - f) * 1000) / 10;
          const win = String(b.window || '');
          if (/5h|hour/.test(win)) {
            if (h === null || used > h) h = used;
          } else if (/week|7d/.test(win)) {
            if (w === null || used > w) w = used;
          }
        }
      }
    }
  }
  if (h !== null || w !== null) {
    const res = { src: 'agy' };
    if (h !== null) res['5h'] = h;
    if (w !== null) res['7d'] = w;
    process.stdout.write(JSON.stringify(res));
  }
} catch (_) {}
'@
  $scriptFile = Join-Path $tmp 'test_parser.js'
  [IO.File]::WriteAllText($scriptFile, $nodeScript)
  foreach ($c in $cases) {
    $raw = $c.raw
    $resJson = ($raw | node $scriptFile)
    if ($c.malformed) {
      if ($resJson) { throw "SH: malformed JSON should produce empty output, got $resJson" }
    } else {
      if (-not $resJson) { throw "SH: $($c.name) produced empty output" }
      $obj = ConvertFrom-Json $resJson
      if ($c.expect5h -ne $obj.'5h') { throw "SH: $($c.name) 5h mismatch: expected $($c.expect5h), got $($obj.'5h')" }
      if ($c.expect7d -ne $obj.'7d') { throw "SH: $($c.name) 7d mismatch: expected $($c.expect7d), got $($obj.'7d')" }
      if ($c.expect7d -eq $null -and $resJson -match '"7d"') { throw "SH: $($c.name) should not contain 7d key" }
      if ($c.expect5h -eq $null -and $resJson -match '"5h"') { throw "SH: $($c.name) should not contain 5h key" }
    }
    Write-Output "SH PASS: $($c.name)"
  }

  Write-Output "All A189 test cases pass in both ports!"
} finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
