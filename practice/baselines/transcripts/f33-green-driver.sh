#!/bin/sh
# F33 GREEN driver: runs the named scenario/run pairs in parallel inside ONE
# harness `run` window (one CLAUDE.md hide). Usage: driver.sh TAG name-n ...
S=/c/Users/Ikran/AppData/Local/Temp/claude/C--tools-Projects-skillator2/52addc18-083e-4e21-b1ef-2a2e5fcc4d86/scratchpad/f33
R=/c/tools/Projects/skillator2
H=$R/practice/scripts/baseline-harness.sh
T=$R/practice/baselines/transcripts
tag=$1; shift
for sn in "$@"; do
  s=${sn%-*}; n=${sn##*-}
  sc=$R/practice/baselines/scenario-marathon-$s.txt; [ "$s" = marathon ] && sc=$R/practice/baselines/scenario-marathon.txt
  fx=$S/fx/green-$sn
  out=$T/f33-$tag-$sn
  c=$(BASELINE_USAGE='40 40' BASELINE_TIMEOUT=2700 sh $H cmd green "$fx" "$sc" "$S/prefix" 2>/dev/null \
      | sed "s#sh '$H' run 2700 '[^']*' claude -p#timeout -k 30 2700 claude -p#")
  { echo "# F33 $tag $sn - fixture $fx (BASELINE_USAGE 40 40), prefix $S/prefix (HEAD 3313332 + working-tree skills/relay-morpheus), run inside one BASELINE_ISOLATE=hide harness window"; echo "$c"; } > "$out.cmd"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$out.start"
  ( sh -c "$c" > "$out.jsonl" 2> "$out.err"; echo $? > "$out.exit" ) &
done
wait
echo "driver done: $*"
