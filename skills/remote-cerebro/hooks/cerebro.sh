#!/bin/sh
# remote-cerebro launcher: resolve node, run the bridge. Everything else is in
# cerebro-bridge.mjs. Usage: sh cerebro.sh doctor|native|arm|status|stop|selftest ...
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
node_bin=$(command -v node 2>/dev/null)
if [ -z "$node_bin" ]; then
  echo "cerebro: node (>= 20) is not on PATH" >&2
  exit 2
fi
exec "$node_bin" "$here/cerebro-bridge.mjs" "$@"
