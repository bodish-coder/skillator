# Runnable check for usage-watch.ps1. Run: powershell -File selftest.ps1
$ErrorActionPreference = 'Stop'
$s = Join-Path $PSScriptRoot 'usage-watch.ps1'
$sid = "selftest-$PID"
$flag = Join-Path $HOME ".claude\handoff-watch\$sid"
Remove-Item "$flag","$flag.done" -ErrorAction SilentlyContinue

function Probe($json) { $json | & powershell -NoProfile -File $s -Mode probe }
function Gate($json)  { $json | & powershell -NoProfile -File $s -Mode gate }
$sl = { param($a,$b,$c) "{`"session_id`":`"$sid`",`"rate_limits`":{`"five_hour`":{`"used_percentage`":$a},`"seven_day`":{`"used_percentage`":$b}},`"context_window`":{`"used_percentage`":$c}}" }
$stop = "{`"session_id`":`"$sid`",`"stop_hook_active`":false}"

Probe (& $sl 40 12 55); if ((Get-Content $flag -Raw).Trim() -ne '55') { throw 'probe: max not taken' }
if (Gate $stop) { throw 'gate: fired below threshold' }

Probe (& $sl 98.2 12 55); if ((Get-Content $flag -Raw).Trim() -ne '98.2') { throw 'probe: not updated' }
$r = Gate $stop
if ($r -notmatch '"decision":"block"' -or $r -notmatch '98.2') { throw "gate: no block, got '$r'" }
if (Gate $stop) { throw 'gate: fired twice (done-marker ignored)' }
if (Gate "{`"session_id`":`"$sid`",`"stop_hook_active`":true}") { throw 'gate: ignored stop_hook_active' }

Remove-Item "$flag","$flag.done" -ErrorAction SilentlyContinue
'ok'
