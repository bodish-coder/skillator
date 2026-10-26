#!/bin/sh
# Has ponytail changed since code-yoda absorbed it? The shared checker
# (practice/scripts/upstream-check.sh, which carries the full reasoning and
# the selftest) pointed at this skill's manifest.
#
#   sh skills/code-yoda/upstream-check.sh [--daily]
#
# Same output and exit codes as the shared script: unchanged / changed / error,
# exit 0 / 1 / 2. --daily keeps its own stamp (upstream-check-code-yoda.day).
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec sh "$here/../../practice/scripts/upstream-check.sh" "$@" "$here/UPSTREAM.md"
