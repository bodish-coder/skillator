# remote-cerebro launcher: resolve node, run the bridge. Everything else is in
# cerebro-bridge.mjs. Usage: powershell -NoProfile -File cerebro.ps1 doctor|native|arm|status|stop|selftest ...
# On Windows the bridge resolves cursor-agent.cmd / agent.exe itself (the Git-Bash
# cursor-agent shim launches Node, not the agent).
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = Get-Command node -ErrorAction SilentlyContinue
if ($null -eq $node) {
  [Console]::Error.WriteLine("cerebro: node (>= 20) is not on PATH")
  exit 2
}
& $node.Source (Join-Path $here "cerebro-bridge.mjs") @args
exit $LASTEXITCODE
