#!/usr/bin/env sh
# The plugin lives in plugin/ (F91): forward, so ./install.sh and pre-F91 clone paths still work.
exec sh "$(dirname -- "$0")/plugin/install.sh" "$@"
