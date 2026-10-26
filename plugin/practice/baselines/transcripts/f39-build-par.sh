#!/bin/sh
# par.sh <phase> <prefix> <fixture-dir-prefix> <outdir> <name>...  - F39 routing runs in parallel,
# inside ONE harness `run` (one CLAUDE.md hide window). Each run: own fixture, own timeout.
phase=$1; put=$2; fx=$3; out=$4; shift 4
H=/c/tools/Projects/skillator2/practice/scripts/baseline-harness.sh
B=/c/tools/Projects/skillator2/practice/baselines
for n in "$@"; do
  c=$(sh $H cmd green "$fx-$n" "$B/scenario-build-route-$n.txt" "$put" 2>/dev/null \
      | sed "s#sh '$H' run [0-9]* '[^']*' claude -p#timeout -k 30 ${PER:-600} claude -p#; s#--output-format stream-json --verbose#--output-format stream-json --verbose --max-budget-usd ${BUDGET:-3}#")
  printf '%s\n' "$c" > "$out/f39-$phase-$n.cmd"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$out/f39-$phase-$n.start"
  ( sh "$out/f39-$phase-$n.cmd" > "$out/f39-$phase-$n.jsonl" 2> "$out/f39-$phase-$n.err" < /dev/null; echo $? > "$out/f39-$phase-$n.exit" ) &
done
wait
echo "par: all done"
