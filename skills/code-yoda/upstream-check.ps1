# Has ponytail changed since code-yoda absorbed it? Windows twin of
# upstream-check.sh: the shared checker (practice/scripts/upstream-check.ps1)
# pointed at this skill's manifest.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File skills/code-yoda/upstream-check.ps1 [-Daily]
#
# Same output and exit codes as the shared script: unchanged / changed / error,
# exit 0 / 1 / 2.
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$shared = Join-Path $here '..\..\practice\scripts\upstream-check.ps1'
& $shared @args (Join-Path $here 'UPSTREAM.md')
exit $LASTEXITCODE
