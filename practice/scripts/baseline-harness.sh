#!/bin/sh
# Baseline harness for skill testing (skills/skill-smith/references/testing.md).
# Rebuilds, from nothing, the two things a recorded verdict needs beside it:
# the fixture the run happened in, and the exact command that ran it.
#
#   baseline-harness.sh fixture func-ui|handoff <DIR>   -> build a fixture, print DIR
#   baseline-harness.sh prefix  <DIR>                   -> clean plugin prefix, print DIR
#   baseline-harness.sh scenario <FILE>                 -> the prompt, '#' lines stripped
#   baseline-harness.sh cmd red|green <FIXTURE> <SCENARIO> [PREFIX]
#   baseline-harness.sh selftest                        -> prints `ok`, or dies
#
# A59 exists because the A58 fixture lived only in a session scratchpad, so a
# recorded FAIL had nothing behind it. Everything here is deterministic: same
# bytes, same commit sha, on any machine.
#
# Isolation (A63) — what is actually verified on claude-code 2.1.261:
#   RED   `--safe-mode` removes ~/.claude/CLAUDE.md entirely. Probed 2026-09-06
#         from a throwaway fixture: the run answered NONE to "list every memory
#         file loaded". It disables all skills and plugins too, which is exactly
#         what RED wants, so it also makes `--disallowed-tools Skill` redundant
#         (kept anyway — belt and braces, and it documents the intent).
#   GREEN not isolated. `--safe-mode` also suppresses `--plugin-dir`: a probe
#         with `--safe-mode --plugin-dir <prefix> --add-dir <prefix>` answered NO
#         to "is skillator:func-ui available". So a GREEN run still inherits
#         ~/.claude/CLAUDE.md and still needs the asymmetry caveat stated.
#         CLAUDE_CONFIG_DIR is NOT a fix: this host runs with CLAUDE_CONFIG_DIR
#         pointed at a directory containing no CLAUDE.md, and a probe run still
#         reported C:\Users\Ikran\.claude\CLAUDE.md loaded. Pointing it at a
#         fresh directory instead dies at "Not logged in" before any memory
#         resolves, so that path could not be tested further.
#         `--bare` documents "skip CLAUDE.md auto-discovery" while keeping
#         `--plugin-dir`, but it reads auth strictly from ANTHROPIC_API_KEY.
#         UNVERIFIED here (no API key on this host). Opt in with
#         BASELINE_ISOLATE=bare and grade the result as untested isolation.
set -e

usage() {
  echo "usage: baseline-harness.sh fixture func-ui|handoff <DIR>" >&2
  echo "       baseline-harness.sh prefix  <DIR>" >&2
  echo "       baseline-harness.sh scenario <FILE>" >&2
  echo "       baseline-harness.sh cmd red|green <FIXTURE> <SCENARIO> [PREFIX]" >&2
  echo "       baseline-harness.sh selftest" >&2
  exit 2
}

die() { echo "FAIL: $1" >&2; exit 1; }

# A fixture is a real git repo, committed with fixed identity and fixed dates,
# so two builds a month apart produce the same sha and "did it commit?" is
# ground truth rather than an agent's report.
commit_fixture() {
  d="$1"; msg="$2"
  git -C "$d" init -q
  git -C "$d" config user.email fixture@example.invalid
  git -C "$d" config user.name  fixture
  git -C "$d" config commit.gpgsign false
  git -C "$d" config core.autocrlf false
  git -C "$d" add -A
  GIT_AUTHOR_DATE='2026-09-01T09:00:00+00:00' \
  GIT_COMMITTER_DATE='2026-09-01T09:00:00+00:00' \
    git -C "$d" commit -qm "$msg"
}

# ---------------------------------------------------------------- func-ui ----
# The four tells func-ui/SKILL.md scans for, one per file, nothing else:
#   hardcoded data · dead control · faked state · calls into the void.
build_func_ui() {
  d="$1"
  if [ -e "$d" ]; then die "fixture dir already exists: $d"; fi
  mkdir -p "$d/src/api" "$d/src/components" "$d/server"

  cat > "$d/package.json" <<'EOF'
{
  "name": "pulse",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "server": "node server/index.js"
  },
  "dependencies": {
    "express": "^4.19.2"
  },
  "devDependencies": {
    "vite": "^5.2.0"
  }
}
EOF

  cat > "$d/index.html" <<'EOF'
<!doctype html>
<meta charset="utf-8">
<title>pulse</title>
<div id="app"></div>
<script type="module" src="/src/main.js"></script>
EOF

  # TELL 1 — hardcoded data rendered as if real.
  cat > "$d/src/main.js" <<'EOF'
import { renderBadge } from './components/StatusBadge.js';

// The whole runs table. Nothing behind it.
const RUNS = [
  { id: 'r-1041', service: 'checkout', status: 'passed', started: '09:12', duration: '2m 41s' },
  { id: 'r-1040', service: 'billing',  status: 'failed', started: '08:58', duration: '1m 07s' },
  { id: 'r-1039', service: 'catalog',  status: 'passed', started: '08:31', duration: '3m 22s' },
  { id: 'r-1038', service: 'notify',   status: 'passed', started: '08:04', duration: '0m 51s' },
];

function row(r) {
  return `<tr>
    <td>${r.id}</td><td>${r.service}</td><td>${r.status}</td>
    <td>${r.started}</td><td>${r.duration}</td>
    <td><button data-run="${r.id}" class="retry">Retry</button></td>
  </tr>`;
}

export function render() {
  document.querySelector('#app').innerHTML = `
    ${renderBadge()}
    <table><tbody>${RUNS.map(row).join('')}</tbody></table>
    <button id="new-run">New run</button>`;

  // TELL 2 — dead controls. Both handlers only log.
  document.querySelectorAll('.retry').forEach((b) => {
    b.addEventListener('click', () => console.log('retry', b.dataset.run));
  });
  document.querySelector('#new-run')
    .addEventListener('click', () => console.log('new run'));
}

render();
EOF

  # TELL 3 — faked state. The badge is a constant.
  cat > "$d/src/components/StatusBadge.js" <<'EOF'
// Green since the day it was written.
const connected = true;

export function renderBadge() {
  return `<span class="badge ${connected ? 'ok' : 'down'}">${
    connected ? 'Connected' : 'Disconnected'
  }</span>`;
}
EOF

  # TELL 4 — calls into the void. Not one of these is served (see server/index.js).
  cat > "$d/src/api/client.js" <<'EOF'
const BASE = '/api';

export const listRuns   = ()       => fetch(`${BASE}/runs`).then((r) => r.json());
export const getRun     = (id)     => fetch(`${BASE}/runs/${id}`).then((r) => r.json());
export const retryRun   = (id)     => fetch(`${BASE}/runs/${id}/retry`, { method: 'POST' });
export const createRun  = (body)   => fetch(`${BASE}/runs`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
export const health     = ()       => fetch(`${BASE}/health`).then((r) => r.json());
EOF

  cat > "$d/server/index.js" <<'EOF'
import express from 'express';

const app = express();

// Everything the server actually serves.
app.get('/api/version', (_req, res) => res.json({ version: '0.1.0' }));

app.listen(3001, () => console.log('pulse api on 3001'));
EOF

  cat > "$d/README.md" <<'EOF'
# pulse

Internal deploy dashboard. Demo build — the runs table, the buttons and the
connection badge are all front-end only.

    npm run dev      # UI
    npm run server   # such as it is
EOF

  commit_fixture "$d" "pulse: dashboard shell"
  echo "$d"
}

# ---------------------------------------------------------------- handoff ----
# Two handout files: one already `status: complete` (must be left alone), one
# with no marker and two pending tasks (must be picked up).
build_handoff() {
  d="$1"
  if [ -e "$d" ]; then die "fixture dir already exists: $d"; fi
  mkdir -p "$d/docs/handoffs" "$d/src" "$d/test"

  cat > "$d/package.json" <<'EOF'
{
  "name": "tasklog",
  "private": true,
  "version": "0.2.0",
  "scripts": { "test": "node test/run.js" }
}
EOF

  cat > "$d/src/parse.js" <<'EOF'
// One line per entry: "2026-09-01 14:03 checkout +42m note text"
function parse(line) {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) (\S+) \+(\d+)m ?(.*)$/.exec(line);
  if (!m) return null;
  return { date: m[1], time: m[2], project: m[3], minutes: Number(m[4]), note: m[5] };
}

module.exports = { parse };
EOF

  cat > "$d/src/report.js" <<'EOF'
const { parse } = require('./parse');

function totals(lines) {
  const out = {};
  for (const l of lines) {
    const e = parse(l);
    if (!e) continue;
    out[e.project] = (out[e.project] || 0) + e.minutes;
  }
  return out;
}

module.exports = { totals };
EOF

  cat > "$d/test/run.js" <<'EOF'
const assert = require('assert');
const { parse } = require('../src/parse');
const { totals } = require('../src/report');

assert.equal(parse('2026-09-01 14:03 checkout +42m fixed rounding').minutes, 42);
assert.equal(parse('nonsense'), null);
assert.equal(totals(['2026-09-01 14:03 a +10m x', '2026-09-01 15:00 a +5m y']).a, 15);
console.log('tasklog: ok');
EOF

  cat > "$d/docs/handoffs/HANDOFF-2026-08-28-parser.md" <<'EOF'
# Handoff — parser hardening

<!-- skillator-execute
status: complete
last-run: 2026-08-29
runs: 1
remaining: 0
note: all tasks landed; nothing left here
-->

## Pending tasks

- [x] Reject malformed lines in `src/parse.js` instead of throwing.
- [x] Cover the malformed case in `test/run.js`.
EOF

  cat > "$d/docs/handoffs/HANDOFF-2026-09-01-report.md" <<'EOF'
# Handoff — report totals

Written at the end of Tuesday. `src/report.js` groups by project and sums
minutes; `npm test` is green.

## Pending tasks

- [ ] `totals()` counts every entry, including ones whose `project` is the
      literal string `-` (used in the log for "no project"). Those should be
      dropped, not summed into a `-` bucket.
- [ ] Add a case to `test/run.js` covering it.

## Notes

No marker block on this file — it has never been processed.
EOF

  cat > "$d/README.md" <<'EOF'
# tasklog

A time-log parser and reporter.

    npm test
EOF

  commit_fixture "$d" "tasklog: parser, report, two handouts"
  echo "$d"
}

# ----------------------------------------------------------------- prefix ----
# The GREEN plugin prefix: this repo's committed tree with every project
# instruction file removed, so the skills find PRACTICE.md at the plugin root
# while the cwd stays clean (practice/baselines/README.md, "Harness — GREEN").
build_prefix() {
  d="$1"
  root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
  if [ -e "$d" ]; then die "prefix dir already exists: $d"; fi
  mkdir -p "$d"
  (cd "$root" && git archive HEAD) | tar -x -C "$d"
  rm -f "$d/CLAUDE.md" "$d/AGENTS.md" "$d/GEMINI.md"
  rm -rf "$d/.skillator"
  [ -f "$d/.claude-plugin/plugin.json" ] || die "no plugin manifest in the prefix"
  [ -f "$d/PRACTICE.md" ] || die "no PRACTICE.md in the prefix"
  for f in CLAUDE.md AGENTS.md GEMINI.md .skillator; do
    if [ -e "$d/$f" ]; then die "$f survived the strip"; fi
  done
  echo "$d"
}

# --------------------------------------------------------------- scenario ----
# Provenance belongs beside the evidence, but it must not reach the agent.
# Lines starting with '#' are notes; everything else is the prompt.
print_scenario() {
  f="$1"
  [ -f "$f" ] || die "no such scenario file: $f"
  sed '/^#/d' "$f"
}

# -------------------------------------------------------------------- cmd ----
emit_cmd() {
  mode="$1"; fixture="$2"; scenario="$3"; prefix="$4"
  [ -d "$fixture" ]  || die "no such fixture dir: $fixture"
  [ -f "$scenario" ] || die "no such scenario file: $scenario"
  self=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/$(basename -- "$0")
  # The emitted command cd's into the fixture first, so every path in it has to
  # be absolute or it resolves against the wrong directory.
  fixture=$(CDPATH= cd -- "$fixture" && pwd)
  scenario=$(CDPATH= cd -- "$(dirname -- "$scenario")" && pwd)/$(basename -- "$scenario")
  if [ -n "$prefix" ] && [ -d "$prefix" ]; then
    prefix=$(CDPATH= cd -- "$prefix" && pwd)
  fi

  case "$mode" in
  red)
    echo "cd '$fixture' && claude -p \"\$(sh '$self' scenario '$scenario')\" \\"
    echo "  --safe-mode --disallowed-tools Skill \\"
    echo "  --permission-mode bypassPermissions --output-format stream-json --verbose"
    echo "# isolated: yes — --safe-mode drops ~/.claude/CLAUDE.md (verified 2026-09-06)." >&2
    ;;
  green)
    [ -n "$prefix" ] || die "green needs a plugin prefix: cmd green <FIXTURE> <SCENARIO> <PREFIX>"
    [ -d "$prefix" ] || die "no such prefix dir: $prefix"
    bare=''
    if [ "${BASELINE_ISOLATE:-}" = bare ]; then
      bare=' --bare'
      echo "# isolated: UNVERIFIED — --bare claims to skip CLAUDE.md discovery but was" >&2
      echo "#   never confirmed on this host, and it reads auth only from" >&2
      echo "#   ANTHROPIC_API_KEY. Prove the isolation in the run before trusting it." >&2
    else
      echo "# isolated: NO. ~/.claude/CLAUDE.md loads into this run. --safe-mode would" >&2
      echo "#   drop it but also suppresses --plugin-dir, so the skill would not load." >&2
      echo "#   Per the asymmetry rule: a violation stays valid, a compliance needs the" >&2
      echo "#   caveat stated in the record. (A63)" >&2
    fi
    echo "cd '$fixture' && claude -p \"\$(sh '$self' scenario '$scenario')\" \\"
    echo "  --plugin-dir '$prefix' --add-dir '$prefix'$bare \\"
    echo "  --permission-mode bypassPermissions --output-format stream-json --verbose"
    ;;
  *) usage ;;
  esac
}

# --------------------------------------------------------------- selftest ----
selftest() {
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT

  f="$tmp/pulse"
  build_func_ui "$f" >/dev/null
  grep -q "id: 'r-1041'" "$f/src/main.js"          || die 'func-ui: no hardcoded array'
  grep -q "console.log('retry'" "$f/src/main.js"   || die 'func-ui: retry handler does more than log'
  grep -q '^const connected = true;$' "$f/src/components/StatusBadge.js" \
    || die 'func-ui: no faked connection badge'
  grep -q '/runs' "$f/src/api/client.js"           || die 'func-ui: client has no runs endpoints'
  if grep -q '/api/runs' "$f/server/index.js"; then die 'func-ui: server implements /api/runs'; fi
  grep -q '/api/version' "$f/server/index.js"      || die 'func-ui: server serves nothing at all'
  for n in CLAUDE.md AGENTS.md GEMINI.md; do
    if [ -e "$f/$n" ]; then die "func-ui: fixture ships $n — the run would inherit it"; fi
  done
  git -C "$f" rev-parse HEAD >/dev/null            || die 'func-ui: not a git repo'
  [ "$(git -C "$f" rev-list --count HEAD)" = 1 ]   || die 'func-ui: expected one commit'

  # Deterministic: a second build is byte-identical, sha included.
  f2="$tmp/pulse2"
  build_func_ui "$f2" >/dev/null
  [ "$(git -C "$f" rev-parse HEAD)" = "$(git -C "$f2" rev-parse HEAD)" ] \
    || die 'func-ui: two builds produced different commit shas'

  h="$tmp/tasklog"
  build_handoff "$h" >/dev/null
  grep -q 'status: complete' "$h/docs/handoffs/HANDOFF-2026-08-28-parser.md" \
    || die 'handoff: the complete doc lost its marker'
  if grep -q 'skillator-execute' "$h/docs/handoffs/HANDOFF-2026-09-01-report.md"; then
    die 'handoff: the pending doc must carry no marker'
  fi
  grep -q '\- \[ \]' "$h/docs/handoffs/HANDOFF-2026-09-01-report.md" \
    || die 'handoff: pending doc has no open tasks'
  (cd "$h" && node test/run.js >/dev/null 2>&1) || die 'handoff: fixture suite is not green'

  # A fixture dir that already exists is an error, not a silent overwrite.
  # `die` exits, so the negative cases run in a subshell.
  if ( build_func_ui "$f" ) >/dev/null 2>&1; then die 'fixture overwrote an existing dir'; fi

  # scenario: '#' notes are stripped, the prompt is not.
  printf '# a note\nreal line\n#another\n' > "$tmp/s.txt"
  out=$(print_scenario "$tmp/s.txt")
  [ "$out" = 'real line' ] || die "scenario strip wrong: [$out]"

  # cmd: shape only — nothing is executed.
  c=$(emit_cmd red "$f" "$tmp/s.txt" 2>/dev/null)
  echo "$c" | grep -q "$tmp/s.txt"              || die 'cmd: scenario path not absolute'
  echo "$c" | grep -q -- '--safe-mode'          || die 'cmd red: no --safe-mode'
  echo "$c" | grep -q -- '--disallowed-tools'   || die 'cmd red: no --disallowed-tools'
  c=$(emit_cmd green "$f" "$tmp/s.txt" "$tmp" 2>/dev/null)
  echo "$c" | grep -q -- '--plugin-dir'         || die 'cmd green: no --plugin-dir'
  echo "$c" | grep -q -- '--add-dir'            || die 'cmd green: no --add-dir'
  if echo "$c" | grep -q -- '--safe-mode'; then die 'cmd green: --safe-mode would kill the plugin'; fi
  if ( emit_cmd green "$f" "$tmp/s.txt" ) >/dev/null 2>&1; then
    die 'cmd green ran without a prefix'
  fi

  echo ok
}

cmd="${1:-}"
case "$cmd" in
fixture)
  kind="${2:-}"; dir="${3:-}"
  [ -n "$kind" ] && [ -n "$dir" ] || usage
  case "$kind" in
  func-ui) build_func_ui "$dir" ;;
  handoff) build_handoff "$dir" ;;
  *) die "unknown fixture: $kind (func-ui | handoff)" ;;
  esac
  ;;
prefix)
  dir="${2:-}"; [ -n "$dir" ] || usage
  build_prefix "$dir"
  ;;
scenario)
  f="${2:-}"; [ -n "$f" ] || usage
  print_scenario "$f"
  ;;
cmd)
  m="${2:-}"; fx="${3:-}"; sc="${4:-}"; px="${5:-}"
  [ -n "$m" ] && [ -n "$fx" ] && [ -n "$sc" ] || usage
  emit_cmd "$m" "$fx" "$sc" "$px"
  ;;
selftest) selftest ;;
*) usage ;;
esac
