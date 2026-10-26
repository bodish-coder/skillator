#!/bin/sh
# go.sh TAG runs... : wait for the hide slot (poll 2 min, <=60 min), then run the driver in one hide window
S=/c/Users/Ikran/AppData/Local/Temp/claude/C--tools-Projects-skillator2/52addc18-083e-4e21-b1ef-2a2e5fcc4d86/scratchpad/f33
H=/c/tools/Projects/skillator2/practice/scripts/baseline-harness.sh
i=0
while :; do
  if [ ! -e "$HOME/.claude/CLAUDE.md.skillator-hidden" ]; then
    BASELINE_ISOLATE=hide sh $H run 6000 $S/prefix sh $S/driver.sh "$@" 2> $S/go-$1.err && { echo "window ok"; cat $S/go-$1.err; exit 0; }
    if grep -q 'refused to start' $S/go-$1.err; then echo "refused, retry"; else echo "window ended rc!=0"; cat $S/go-$1.err; exit 1; fi
  fi
  i=$((i+1)); [ $i -gt 30 ] && { echo "gave up waiting for hide slot"; exit 2; }
  sleep 120
done
