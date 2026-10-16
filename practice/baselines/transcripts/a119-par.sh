#!/bin/sh
# a119-par.sh <phase> <prefix> <fixture-dir-prefix> <outdir> <name>... - A119 GREEN:
# f39-build-par-r3.sh with the A119 scenarios (scenario-build-a119-<name>.txt)
# and the harness taken from $H (a private copy while another lane edits the
# live file). Needs SETF = a settings file adding the prefix's route hook.
# Run inside ONE `BASELINE_ISOLATE=hide sh $H run ...` - the OUTER run hides
# ~/.claude/CLAUDE.md; each run here gets its own fixture and timeout.
phase=$1; put=$2; fx=$3; out=$4; shift 4
H=${H:-/c/tools/Projects/skillator2/practice/scripts/baseline-harness.sh}
B=/c/tools/Projects/skillator2/practice/baselines
for n in "$@"; do
  c=$(sh $H cmd green "$fx-$n" "$B/scenario-build-a119-$n.txt" "$put" 2>/dev/null \
      | sed "s#sh '$H' run [0-9]* '[^']*' claude -p#timeout -k 30 ${PER:-600} claude -p#; s#--output-format stream-json --verbose#--output-format stream-json --verbose --include-hook-events --max-budget-usd ${BUDGET:-3}#" | sed "s#--settings \"\$(sh '$H' settings '[^']*')\"#--settings '$SETF'#")
  printf '%s\n' "$c" > "$out/a119-$phase-$n.cmd"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$out/a119-$phase-$n.start"
  ( sh "$out/a119-$phase-$n.cmd" > "$out/a119-$phase-$n.jsonl" 2> "$out/a119-$phase-$n.err" < /dev/null; echo $? > "$out/a119-$phase-$n.exit" ) &
done
wait
echo "par: all done"
