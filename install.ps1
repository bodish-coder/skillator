# The plugin lives in plugin\ (F91): forward, so .\install.ps1 and pre-F91 clone paths still work.
& (Get-Process -Id $PID).Path -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'plugin/install.ps1') @args
exit $LASTEXITCODE
