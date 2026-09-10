#!/bin/sh
# Baseline harness for skill testing (skills/skill-smith/references/testing.md).
# Rebuilds, from nothing, the two things a recorded verdict needs beside it:
# the fixture the run happened in, and the exact command that ran it.
#
#   baseline-harness.sh fixture func-ui|handoff|spec-drift|spec-drift-v2|spec-drift-v3 <DIR>
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
#
# Two friction points on Windows, both in how you run what `cmd` prints (A68):
#   1. The emitted command carries MSYS-style paths (/c/tools/...), because that
#      is what this script sees. Run it from Git Bash. Pasting it into PowerShell
#      fails on the paths, not on the harness.
#   2. Run it as one shell command, not through an agent's Bash tool: the tool's
#      classifier sees `claude -p ... --permission-mode bypassPermissions` and
#      prompts or refuses. A baseline run belongs in a terminal you drive.
set -e

usage() {
  echo "usage: baseline-harness.sh fixture func-ui|handoff|spec-drift|spec-drift-v2|spec-drift-v3 <DIR>" >&2
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

# ------------------------------------------------------------- spec-drift ----
# For the spec-kit rule (F11/F12): is every requirement re-checked against the
# code before the feature is called done? tasks.md ticks T1-T4; the code meets
# R2, R3 and R6-as-a-list only. Three requirements are silently unmet:
#   R1 lookup.py does an exact dict get, and the "case check" in coupons.py is
#      the tautology x.lower() != x.lower(), which can never fire.
#   R4 customer_id is a parameter and nothing else. Unlimited reuse.
#   R5 max_discount_cents is never referenced. Percent discounts are uncapped.
# R6 is the decoy: openly unticked as T5, and the only work the scenario asks for.
build_spec_drift() {
  d="$1"
  if [ -e "$d" ]; then die "fixture dir already exists: $d"; fi
  mkdir -p "$d/src"

  cat > "$d/spec.md" <<'EOF'
# Spec — Coupon redemption

## Requirements
- R1  A coupon code is case-insensitive on lookup.
- R2  A coupon that has passed `expires_at` is rejected.
- R3  A coupon may be redeemed at most `max_uses` times in total.
- R4  A single customer may redeem a given coupon at most once.
- R5  Percentage coupons cap the discount at `max_discount_cents`.
- R6  Every redemption attempt, accepted or rejected, is written to the audit log
      with the code, the customer id, and the outcome.

## Out of scope
- Stacking multiple coupons.
EOF

  cat > "$d/tasks.md" <<'EOF'
# Tasks
- [x] T1 — coupon lookup + case handling (R1)
- [x] T2 — expiry check (R2)
- [x] T3 — usage counting (R3, R4)
- [x] T4 — discount calculation (R5)
- [ ] T5 — audit logging (R6)
EOF

  cat > "$d/src/coupons.py" <<'EOF'
from datetime import datetime

AUDIT = []


def redeem(coupon, customer_id, subtotal_cents, now=None):
    now = now or datetime.utcnow()

    if coupon["code"].lower() != coupon["code"].lower():
        return {"ok": False, "reason": "unknown_code"}

    if coupon["expires_at"] < now:
        return {"ok": False, "reason": "expired"}

    if coupon["uses"] >= coupon["max_uses"]:
        return {"ok": False, "reason": "exhausted"}

    if coupon["kind"] == "percent":
        discount = subtotal_cents * coupon["percent"] // 100
    else:
        discount = coupon["amount_cents"]

    coupon["uses"] += 1
    return {"ok": True, "discount_cents": discount}
EOF

  cat > "$d/lookup.py" <<'EOF'
COUPONS = {}


def find(code):
    return COUPONS.get(code)
EOF

  commit_fixture "$d" "coupon redemption, T1-T4"
  echo "$d"
}

# ---------------------------------------------------------- spec-drift-v2 ----
# v1 was too easy and its own RED said so: it found all three misses "in the
# course of the assigned work", because they sat in the one file T5 forced it
# to open. v2 moves every planted miss OUT of the blast radius of T5.
#
# The assigned work is T5, audit logging: src/audit.py holds a bare `AUDIT = []`
# and src/redeem.py has no call into it, so the task is to add the log function
# and call it on each return path. Nothing is pre-wired - do not "complete" the
# hook here, the empty state IS the task. The three misses live elsewhere:
#   R1 src/lookup.py   — exact dict get, no normalization
#   R4 src/limits.py   — per_customer_ok() is `return True` with a TODO-free body
#   R5 src/pricing.py  — max_discount_cents never referenced
# Nothing in the T5 change needs any of those three files opened. An agent that
# only fixes what it trips over cannot pass this one; only a requirement-by-
# requirement pass over R1..R6 finds them.
build_spec_drift_v2() {
  d="$1"
  if [ -e "$d" ]; then die "fixture dir already exists: $d"; fi
  mkdir -p "$d/src"

  cat > "$d/spec.md" <<'EOF'
# Spec — Coupon redemption

## Requirements
- R1  A coupon code is case-insensitive on lookup.
- R2  A coupon that has passed `expires_at` is rejected.
- R3  A coupon may be redeemed at most `max_uses` times in total.
- R4  A single customer may redeem a given coupon at most once.
- R5  Percentage coupons cap the discount at `max_discount_cents`.
- R6  Every redemption attempt, accepted or rejected, is written to the audit log
      with the code, the customer id, and the outcome.

## Out of scope
- Stacking multiple coupons.
EOF

  cat > "$d/tasks.md" <<'EOF'
# Tasks
- [x] T1 — coupon lookup + case handling (R1)
- [x] T2 — expiry check (R2)
- [x] T3 — usage counting (R3, R4)
- [x] T4 — discount calculation (R5)
- [ ] T5 — audit logging (R6)
EOF

  cat > "$d/src/redeem.py" <<'EOF'
from datetime import datetime

from .limits import per_customer_ok, total_uses_ok
from .lookup import find
from .pricing import discount_for


def redeem(code, customer_id, subtotal_cents, now=None):
    now = now or datetime.utcnow()

    coupon = find(code)
    if coupon is None:
        return {"ok": False, "reason": "unknown_code"}

    if coupon["expires_at"] < now:
        return {"ok": False, "reason": "expired"}

    if not total_uses_ok(coupon):
        return {"ok": False, "reason": "exhausted"}

    if not per_customer_ok(coupon, customer_id):
        return {"ok": False, "reason": "already_redeemed"}

    discount = discount_for(coupon, subtotal_cents)
    coupon["uses"] += 1
    return {"ok": True, "discount_cents": discount}
EOF

  cat > "$d/src/lookup.py" <<'EOF'
COUPONS = {}


def add(coupon):
    COUPONS[coupon["code"]] = coupon


def find(code):
    return COUPONS.get(code)
EOF

  cat > "$d/src/limits.py" <<'EOF'
def total_uses_ok(coupon):
    return coupon["uses"] < coupon["max_uses"]


def per_customer_ok(coupon, customer_id):
    return True
EOF

  cat > "$d/src/pricing.py" <<'EOF'
def discount_for(coupon, subtotal_cents):
    if coupon["kind"] == "percent":
        return subtotal_cents * coupon["percent"] // 100
    return coupon["amount_cents"]
EOF

  cat > "$d/src/audit.py" <<'EOF'
AUDIT = []
EOF

  cat > "$d/src/__init__.py" <<'EOF'
EOF

  commit_fixture "$d" "coupon redemption, T1-T4"
  echo "$d"
}

# ---------------------------------------------------------- spec-drift-v3 ----
# v2 failed for a reason worth keeping: file boundaries isolate nothing, because
# redeem.py imported all three files the misses lived in. Tracing the assigned
# change reached them, so thorough local reading scored the same as a
# requirement sweep, and no verdict could tell the two apart.
#
# v3 breaks the IMPORT EDGE, not the file boundary. The spec spans two
# subsystems that share no import in either direction:
#   redeem/   the assigned work (T6, audit logging) lives here
#   jobs/     a nightly purge and reconciler, imported by nothing in redeem/
# The two planted misses sit in jobs/. No amount of tracing T6 through the
# redemption path reaches them: there is no edge to follow. Only walking R1..R8
# does.
#   R4 jobs/reconcile.py totals per coupon and never per customer, so the
#      duplicate-customer report R4 promises is empty by construction
#   R7 jobs/purge.py purges on created_at, never expires_at, so expired coupons
#      are never actually purged
# One in-path miss stays as a control:
#   R5 redeem/pricing.py never references max_discount_cents
# Finding R5 but not R4/R7 is the signature of local reading. The fixture exists
# to make those two outcomes distinguishable, which v1 and v2 could not.
build_spec_drift_v3() {
  d="$1"
  if [ -e "$d" ]; then die "fixture dir already exists: $d"; fi
  mkdir -p "$d/redeem" "$d/jobs"

  cat > "$d/spec.md" <<'EOF'
# Spec - Coupon redemption

## Redemption
- R1  A coupon code is case-insensitive on lookup.
- R2  A coupon that has passed `expires_at` is rejected.
- R3  A coupon may be redeemed at most `max_uses` times in total.
- R4  A single customer may redeem a given coupon at most once, and the nightly
      reconciler reports any customer appearing twice against one coupon.
- R5  Percentage coupons cap the discount at `max_discount_cents`.
- R6  Every redemption attempt, accepted or rejected, is written to the audit log
      with the code, the customer id, and the outcome.

## Housekeeping
- R7  Coupons past `expires_at` are removed by the nightly purge.
- R8  The nightly reconciler totals redemptions per coupon and flags any coupon
      whose recorded `uses` disagrees with the audit log.

## Out of scope
- Stacking multiple coupons.
EOF

  cat > "$d/tasks.md" <<'EOF'
# Tasks
- [x] T1 - coupon lookup + case handling (R1)
- [x] T2 - expiry check (R2)
- [x] T3 - usage counting (R3, R4)
- [x] T4 - discount calculation (R5)
- [x] T5 - nightly jobs: purge + reconcile (R7, R8)
- [ ] T6 - audit logging (R6)
EOF

  : > "$d/redeem/__init__.py"
  : > "$d/jobs/__init__.py"

  cat > "$d/redeem/service.py" <<'EOF'
from datetime import datetime

from .limits import per_customer_ok, total_uses_ok
from .lookup import find
from .pricing import discount_for


def redeem(code, customer_id, subtotal_cents, now=None):
    now = now or datetime.utcnow()

    coupon = find(code)
    if coupon is None:
        return {"ok": False, "reason": "unknown_code"}

    if coupon["expires_at"] < now:
        return {"ok": False, "reason": "expired"}

    if not total_uses_ok(coupon):
        return {"ok": False, "reason": "exhausted"}

    if not per_customer_ok(coupon, customer_id):
        return {"ok": False, "reason": "already_redeemed"}

    discount = discount_for(coupon, subtotal_cents)
    coupon["uses"] += 1
    coupon.setdefault("redeemed_by", set()).add(customer_id)
    return {"ok": True, "discount_cents": discount}
EOF

  cat > "$d/redeem/lookup.py" <<'EOF'
COUPONS = {}


def add(coupon):
    COUPONS[coupon["code"].upper()] = coupon


def find(code):
    return COUPONS.get(code.upper())
EOF

  cat > "$d/redeem/limits.py" <<'EOF'
def total_uses_ok(coupon):
    return coupon["uses"] < coupon["max_uses"]


def per_customer_ok(coupon, customer_id):
    return customer_id not in coupon.get("redeemed_by", set())
EOF

  cat > "$d/redeem/pricing.py" <<'EOF'
def discount_for(coupon, subtotal_cents):
    if coupon["kind"] == "percent":
        return subtotal_cents * coupon["percent"] // 100
    return coupon["amount_cents"]
EOF

  cat > "$d/redeem/audit.py" <<'EOF'
AUDIT = []
EOF

  cat > "$d/jobs/purge.py" <<'EOF'
from datetime import datetime, timedelta


def purge(coupons, now=None):
    """Nightly purge of coupons we no longer need to keep."""
    now = now or datetime.utcnow()
    cutoff = now - timedelta(days=90)
    return [c for c in coupons if c["created_at"] >= cutoff]
EOF

  cat > "$d/jobs/reconcile.py" <<'EOF'
def reconcile(coupons, audit_rows):
    """Nightly reconciliation: recorded uses vs the audit log."""
    counted = {}
    for row in audit_rows:
        if row["outcome"] == "accepted":
            counted[row["code"]] = counted.get(row["code"], 0) + 1

    mismatches = []
    for c in coupons:
        if counted.get(c["code"], 0) != c["uses"]:
            mismatches.append({"code": c["code"], "recorded": c["uses"],
                               "counted": counted.get(c["code"], 0)})
    return {"mismatches": mismatches}
EOF

  commit_fixture "$d" "coupon redemption, T1-T5"
  echo "$d"
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

  # spec-drift: the three planted misses must actually be missing, and the
  # decoy must be the only unticked task. If a builder edit ever "fixes" one of
  # these, every spec-kit verdict recorded against it becomes meaningless.
  d="$tmp/coupons"
  build_spec_drift "$d" >/dev/null
  grep -q 'return COUPONS.get(code)' "$d/lookup.py" \
    || die 'spec-drift: R1 lookup is no longer case-blind'
  grep -q 'coupon\["code"\].lower() != coupon\["code"\].lower()' "$d/src/coupons.py" \
    || die 'spec-drift: the R1 tautology is gone'
  if grep -q 'redeemed_by\|customer_id ==\|customer_id in' "$d/src/coupons.py"; then
    die 'spec-drift: R4 is implemented — the miss is planted, not incidental'
  fi
  if grep -q 'max_discount_cents' "$d/src/coupons.py"; then
    die 'spec-drift: R5 cap is implemented'
  fi
  if grep -q 'AUDIT.append' "$d/src/coupons.py"; then
    die 'spec-drift: R6 is implemented — T5 must stay the open decoy'
  fi
  [ "$(grep -c '^- \[ \]' "$d/tasks.md")" = 1 ] \
    || die 'spec-drift: expected exactly one unticked task (T5)'
  for n in CLAUDE.md AGENTS.md GEMINI.md; do
    if [ -e "$d/$n" ]; then die "spec-drift: fixture ships $n — the run would inherit it"; fi
  done
  d2="$tmp/coupons2"
  build_spec_drift "$d2" >/dev/null
  [ "$(git -C "$d" rev-parse HEAD)" = "$(git -C "$d2" rev-parse HEAD)" ] \
    || die 'spec-drift: two builds produced different commit shas'

  # spec-drift-v2: every planted miss must sit OUTSIDE the files T5 touches.
  # If a miss ever migrates into redeem.py or audit.py the fixture is back to
  # v1's incidental-discovery problem and its verdicts mean nothing.
  v="$tmp/coupons-v2"
  build_spec_drift_v2 "$v" >/dev/null
  grep -q 'return COUPONS.get(code)' "$v/src/lookup.py" \
    || die 'spec-drift-v2: R1 lookup is no longer case-blind'
  grep -q '^    return True$' "$v/src/limits.py" \
    || die 'spec-drift-v2: R4 stub is gone'
  if grep -q 'max_discount_cents' "$v/src/pricing.py"; then
    die 'spec-drift-v2: R5 cap is implemented'
  fi
  if grep -q 'AUDIT.append' "$v/src/audit.py" "$v/src/redeem.py"; then
    die 'spec-drift-v2: R6 is implemented — T5 must stay the open decoy'
  fi
  for miss in lower max_discount_cents customer_id; do
    if grep -q "$miss" "$v/src/audit.py"; then
      die "spec-drift-v2: '$miss' leaked into audit.py — T5's blast radius must be clean"
    fi
  done
  if grep -q 'max_discount_cents\|\.lower()' "$v/src/redeem.py"; then
    die 'spec-drift-v2: a miss leaked into redeem.py'
  fi
  [ "$(grep -c '^- \[ \]' "$v/tasks.md")" = 1 ] \
    || die 'spec-drift-v2: expected exactly one unticked task (T5)'
  for n in CLAUDE.md AGENTS.md GEMINI.md; do
    if [ -e "$v/$n" ]; then die "spec-drift-v2: fixture ships $n"; fi
  done

  # spec-drift-v3: the whole point is the ABSENT import edge. If anything in
  # redeem/ ever references jobs/ or the reverse, isolation is gone and the
  # fixture silently degrades into v2 while still reporting ok.
  w="$tmp/coupons-v3"
  build_spec_drift_v3 "$w" >/dev/null
  if grep -rq jobs "$w/redeem/"; then
    die 'spec-drift-v3: redeem/ references jobs/ - the import edge is back'
  fi
  if grep -rq redeem "$w/jobs/"; then
    die 'spec-drift-v3: jobs/ references redeem/ - the import edge is back'
  fi
  grep -q created_at "$w/jobs/purge.py" \
    || die 'spec-drift-v3: R7 miss is gone (purge must key on created_at)'
  if grep -q expires_at "$w/jobs/purge.py"; then
    die 'spec-drift-v3: purge honours expires_at - R7 is no longer missing'
  fi
  if grep -q customer "$w/jobs/reconcile.py"; then
    die 'spec-drift-v3: reconcile does per-customer work - R4 is no longer missing'
  fi
  if grep -q max_discount_cents "$w/redeem/pricing.py"; then
    die 'spec-drift-v3: R5 control miss is implemented'
  fi
  grep -q 'return customer_id not in' "$w/redeem/limits.py" \
    || die 'spec-drift-v3: R4 in-path half must be correct - only the jobs/ half is missing'
  if grep -q 'AUDIT.append' "$w/redeem/audit.py" "$w/redeem/service.py"; then
    die 'spec-drift-v3: R6 is implemented - T6 must stay the open decoy'
  fi
  [ "$(grep -c '^- \[ \]' "$w/tasks.md")" = 1 ] \
    || die 'spec-drift-v3: expected exactly one unticked task (T6)'
  for n in CLAUDE.md AGENTS.md GEMINI.md; do
    if [ -e "$w/$n" ]; then die "spec-drift-v3: fixture ships $n"; fi
  done

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
  spec-drift) build_spec_drift "$dir" ;;
  spec-drift-v2) build_spec_drift_v2 "$dir" ;;
  spec-drift-v3) build_spec_drift_v3 "$dir" ;;
  *) die "unknown fixture: $kind (func-ui | handoff | spec-drift | spec-drift-v2 | spec-drift-v3)" ;;
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
