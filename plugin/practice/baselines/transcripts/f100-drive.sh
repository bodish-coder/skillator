#!/bin/sh
# drive.sh <run#> <name>... - F100 GREEN, one run per scenario, SEQUENTIAL
# (never two hidden runs at once). Each run is the harness's own emitted
# `cmd green` (its `run` wraps it with BASELINE_ISOLATE=hide), with --settings
# swapped for settings.json (the prefix's route hook + grade gate) and
# --include-hook-events added so the stream shows the UserPromptSubmit hook.
k=$1; shift
W=/c/tools/Projects/skillator2/.skillator/worktrees/RUN-0023-pending-f100-f104/plugin
H=$W/practice/scripts/baseline-harness.sh
B=$W/practice/baselines
S=/c/Users/Ikran/AppData/Local/Temp/claude/C--tools-Projects-skillator2/66a4199e-bee7-472b-9aaa-61fc26982c2a/scratchpad/f100
SETF=C:/Users/Ikran/AppData/Local/Temp/claude/C--tools-Projects-skillator2/66a4199e-bee7-472b-9aaa-61fc26982c2a/scratchpad/f100/settings.json
out=$B/transcripts
for n in "$@"; do
  fx=$S/fix-$n-$k
  rm -rf "$fx"
  sh $H fixture relay-chain "$fx" > /dev/null
  c=$(BASELINE_TIMEOUT=900 BASELINE_ISOLATE=hide sh $H cmd green "$fx" "$B/scenario-build-$n.txt" "$S/put" 2>/dev/null \
      | grep -v '^#' \
      | sed "s#--output-format stream-json --verbose#--output-format stream-json --verbose --include-hook-events#" \
      | sed "s#--settings \"\$(sh '$H' settings '[^']*')\"#--settings '$SETF'#")
  printf '%s\n' "$c" > "$out/f100-$n-$k.cmd"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$S/f100-$n-$k.start"
  sh "$out/f100-$n-$k.cmd" > "$out/f100-$n-$k.jsonl" 2> "$out/f100-$n-$k.err" < /dev/null
  echo $? > "$S/f100-$n-$k.exit"
done
echo "drive: all done"
