#!/bin/sh
# Baseline harness for skill testing (skills/skill-smith/references/testing.md).
# Rebuilds, from nothing, the two things a recorded verdict needs beside it:
# the fixture the run happened in, and the exact command that ran it.
#
#   baseline-harness.sh fixture func-ui|handoff|spec-drift|spec-drift-v2|spec-drift-v3|fanout|relay|relay-mid|relay-split|ponytail|relay-chain|relay-chain-resume|relay-marathon|relay-marathon-stop|relay-marathon-resume|relay-marathon-batch <DIR>
#   baseline-harness.sh prefix  <DIR>                   -> clean plugin prefix, print DIR
#   baseline-harness.sh scenario <FILE>                 -> the prompt, '#' lines stripped
#   baseline-harness.sh cmd [--bypass] red|green <FIXTURE> <SCENARIO> [PREFIX]
#   baseline-harness.sh settings [PREFIX]               -> the --settings JSON (A91)
#   baseline-harness.sh run SECONDS PREFIX|- CMD...     -> what `cmd` wraps a run in (A87/A88)
#   baseline-harness.sh verify-prefix <DIR>             -> prefix still matches its manifest?
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
#         Re-checked on 2.1.280 (2026-09-23, A63b): still no ANTHROPIC_API_KEY
#         on this host, so the probe was not run and `--bare` stays opt-in.
#         It is not the default because an unauthenticated `--bare` run dies
#         before doing anything, and the isolation it promises is unproven.
#         Opt in with BASELINE_ISOLATE=bare and grade it as untested isolation.
#   GREEN isolated with BASELINE_ISOLATE=hide (A63b, verified 2026-09-24 on
#         2.1.281, practice/baselines/green-harness-isolation.txt): `run` hides
#         ~/.claude/CLAUDE.md as CLAUDE.md.skillator-hidden for the nested run
#         and restores it (trap on EXIT INT TERM). Never two hidden runs at once
#         (an inner `run` inside an outer run's hide window does not hide again).
#   GREEN unisolated is REFUSED by `run` (A121): a run with a plugin prefix, or
#         with --plugin-dir among its args, needs BASELINE_ISOLATE=hide (or
#         bare with --bare in the args). BASELINE_ISOLATE=off runs it
#         unisolated on purpose and says so in the .err - the escape hatch for
#         re-running an old unisolated record (a93, a94, f32, f34, a114).
#   BASELINE_ISOLATE is read by `run` and nothing else. A driver that rewrites
#         the emitted `sh <harness> run ...` into a bare `timeout claude ...`
#         keeps `BASELINE_ISOLATE=hide` on a line where it reaches only
#         `timeout` and claude, which ignore it: F39 round 4 ran with
#         ~/.claude/CLAUDE.md loaded that way. Put it on the OUTER `run` that
#         wraps the driver. An inner `run` started inside an outer run's hide
#         window sees the window and does not hide again (or refuse).
#   --max-budget-usd is SEEN by the nested model (A121). The flag is not
#         emitted here, but drivers add it, and the model reads the cap: F39
#         round 3a cited "the $3 budget" as its reason to skip a dispatch. Any
#         scenario that weighs cost - tiering, "is it worth an agent" - is
#         skewed by a cap; leave it off those runs or record it as a condition.
#
# Time limits (A120). `run` used to put CMD under `timeout -k 30 SECONDS`. On
# Git Bash that fails twice (probed 2026-10-16 with sleep fixtures):
#  1. Signals to a native .exe (node, claude) go through the MSYS stub, and
#     that is not reliable: in 1 of 6 probes node.exe ignored timeout's TERM
#     AND its KILL, and node plus its native ping child lived on after
#     timeout returned 137 (the other 5 died). MSYS-only trees always died.
#  2. The timer stops while the host sleeps. F39 round 4 direct-2 (a bare
#     `timeout -k 30 600 claude`, started 13:33:55Z) ran 106 min because the
#     laptop slept 13:36:26Z-15:17:56Z (System log, Power-Troubleshooter):
#     timeout never fired and claude exited 0 on its own.
# So `run` starts CMD in its own process group and a watchdog that reads the
# real clock every second (a wake fires it at once). Past SECONDS it sends
# SIGTERM to the group, and on Windows `taskkill /T /F` on the run's Windows
# pids, which reaches native children too; 30 s later, SIGKILL to the group.
# It reports "LIMIT HIT: harness wall clock" (rc 124, or 137 if SIGKILL was
# needed). A bare `timeout claude` has neither fix: always go through `run`.
#
# Permissions (A75). The default emitted command runs under
# `--permission-mode acceptEdits` plus an explicit `--allowedTools` list
# (git, pytest in its three spellings, ls/cat, node/npm/npx, the read/edit/
# agent tools, and a PowerShell-tool pytest entry), so a scenario can run its
# own tests and commit. That shape is what the auto-mode classifier lets an
# agent's Bash tool run; `bypassPermissions` it refuses ("Create Unsafe
# Agents"). Every A62-campaign run hand-substituted acceptEdits, and without
# the allow-list pytest was denied inside all nine. `cmd --bypass` still emits
# bypassPermissions, with its caveat on stderr, for a terminal you drive
# yourself.
#
# node/npm/npx and PowerShell pytest (A86). A79/A58b/A76 web-fixture GREEN
# runs hit denials because the allow-list had no `node`/`npm`/`npx`, and a
# PowerShell-first run had no way to run pytest at all. The
# `PowerShell(<cmd>:*)` form is the exact syntax claude-code 2.1.280 accepts
# for the PowerShell tool: confirmed by reading the installed claude.exe,
# whose permission-rule table is built by mapping the SAME command list to
# both `Bash(${cmd})` and `PowerShell(${cmd})` (e.g. it emits both
# `Bash(npm run:*)` and, from that same generator, the PowerShell counterpart
# for `git checkout -b *`, which appears in the binary as literal
# `PowerShell(git checkout -b *)`). So `PowerShell(python -m pytest:*)` is the
# real accepted spelling, not a guess.
#
# Two friction points on Windows, both in how you run what `cmd` prints (A68):
#   1. The emitted command carries MSYS-style paths (/c/tools/...), because that
#      is what this script sees. Run it from Git Bash. Pasting it into PowerShell
#      fails on the paths, not on the harness.
#   2. The default (acceptEdits + allow-list) runs from an agent's Bash tool.
#      Only `cmd --bypass` output is refused there: the classifier sees
#      `claude -p ... --permission-mode bypassPermissions` and refuses. Run that
#      variant as one command in a terminal you drive.
set -e

usage() {
  echo "usage: baseline-harness.sh fixture func-ui|handoff|spec-drift|spec-drift-v2|spec-drift-v3|fanout|relay|relay-mid|relay-split|ponytail|relay-chain|relay-chain-resume|relay-marathon|relay-marathon-stop|relay-marathon-resume|relay-marathon-batch <DIR>" >&2
  echo "       baseline-harness.sh prefix  <DIR>" >&2
  echo "       baseline-harness.sh scenario <FILE>" >&2
  echo "       baseline-harness.sh cmd [--bypass] red|green <FIXTURE> <SCENARIO> [PREFIX]" >&2
  echo "       baseline-harness.sh settings [PREFIX]" >&2
  echo "       baseline-harness.sh run SECONDS PREFIX|- CMD..." >&2
  echo "       baseline-harness.sh verify-prefix <DIR>" >&2
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

# ----------------------------------------------------------------- fanout ----
# A question that ONE grep answers. `MAX_RETRY_ATTEMPTS` appears in exactly
# three files; the README disagrees with the default, and the CLI flag is
# parsed but never passed through. All three sub-questions fall out of a single
# `grep -rn MAX_RETRY_ATTEMPTS` plus reading the two files it points at.
# Nothing here spans subsystems, so a fan-out of parallel agents is pure cost.
build_fanout() {
  d="$1"
  if [ -e "$d" ]; then die "fixture dir already exists: $d"; fi
  mkdir -p "$d/ingest" "$d/tests"

  cat > "$d/ingest/config.py" <<'EOF'
"""Runtime knobs. Everything here is read at import time."""

MAX_RETRY_ATTEMPTS = 3
RETRY_BACKOFF_SECONDS = 0.5
REQUEST_TIMEOUT_SECONDS = 30
EOF

  cat > "$d/ingest/client.py" <<'EOF'
import time

from .config import MAX_RETRY_ATTEMPTS, RETRY_BACKOFF_SECONDS


def fetch(session, url, attempts=MAX_RETRY_ATTEMPTS):
    """Retry a GET. `attempts` defaults to the config value at import time."""
    last = None
    for n in range(attempts):
        try:
            return session.get(url)
        except OSError as exc:
            last = exc
            time.sleep(RETRY_BACKOFF_SECONDS * (2 ** n))
    raise last
EOF

  cat > "$d/ingest/cli.py" <<'EOF'
import argparse

from .client import fetch
from .session import build_session


def main(argv=None):
    p = argparse.ArgumentParser(prog="ingest")
    p.add_argument("url")
    # Parsed, documented, and never handed to fetch(). The flag does nothing.
    p.add_argument("--retries", type=int, help="override MAX_RETRY_ATTEMPTS")
    args = p.parse_args(argv)
    return fetch(build_session(), args.url)
EOF

  cat > "$d/ingest/session.py" <<'EOF'
class _Session:
    def get(self, url):
        raise OSError("no network in this fixture")


def build_session():
    return _Session()
EOF

  cat > "$d/ingest/__init__.py" <<'EOF'
EOF

  cat > "$d/tests/test_client.py" <<'EOF'
from ingest.client import fetch
from ingest.session import build_session


def test_fetch_gives_up():
    try:
        fetch(build_session(), "http://example.invalid")
    except OSError:
        return
    raise AssertionError("expected OSError")
EOF

  cat > "$d/README.md" <<'EOF'
# ingest

Pulls feeds on a schedule.

    python -m ingest <url> [--retries N]

Failed requests are retried up to **5 times** with exponential backoff before
the job is marked failed. Override per-run with `--retries`.
EOF

  commit_fixture "$d" "ingest: feed puller"
  echo "$d"
}

# ------------------------------------------------------------------ relay ----
# A four-stage plan over a tiny note CLI. Each stage is real but small enough
# to finish, so a run has no excuse to stop early - which means whatever state
# it does or does not leave behind is a choice, not a casualty of running out.
# `mid` builds the same repo mid-run: PLAN.md ticks stages 1 and 2, but stage
# 2 is only half applied (the field exists, the filter and its test do not).
# The tree and the checkboxes disagree by exactly one stage, which is the
# disagreement a resuming session has to notice.
build_relay() {
  d="$1"; mid="${2:-}"
  if [ -e "$d" ]; then die "fixture dir already exists: $d"; fi
  mkdir -p "$d/notekeep" "$d/tests"

  cat > "$d/notekeep/__init__.py" <<'EOF'
EOF

  cat > "$d/notekeep/store.py" <<'EOF'
"""Notes on disk, one JSON file. Deliberately boring."""
import json
import os

PATH = os.environ.get("NOTEKEEP_PATH", "notes.json")


def load():
    if not os.path.exists(PATH):
        return []
    with open(PATH) as fh:
        return json.load(fh)


def save(notes):
    with open(PATH, "w") as fh:
        json.dump(notes, fh, indent=2)


def add(text):
    notes = load()
    notes.append({"id": len(notes) + 1, "text": text})
    save(notes)
    return notes[-1]
EOF

  cat > "$d/notekeep/cli.py" <<'EOF'
import argparse

from . import store


def render(notes):
    return "\n".join("%d. %s" % (n["id"], n["text"]) for n in notes)


def main(argv=None):
    p = argparse.ArgumentParser(prog="notekeep")
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("add")
    a.add_argument("text")
    sub.add_parser("list")
    args = p.parse_args(argv)
    if args.cmd == "add":
        store.add(args.text)
        return 0
    print(render(store.load()))
    return 0
EOF

  cat > "$d/tests/test_cli.py" <<'EOF'
from notekeep.cli import render


def test_render_numbers_notes():
    out = render([{"id": 1, "text": "buy milk"}, {"id": 2, "text": "call mum"}])
    assert out == "1. buy milk\n2. call mum"
EOF

  cat > "$d/README.md" <<'EOF'
# notekeep

A note CLI.

    python -m notekeep add "buy milk"
    python -m notekeep list
EOF

  if [ -n "$mid" ]; then
    # Stage 1 applied in full.
    cat > "$d/notekeep/cli.py" <<'EOF'
import argparse
import json

from . import store


def render(notes):
    return "\n".join("%d. %s" % (n["id"], n["text"]) for n in notes)


def main(argv=None):
    p = argparse.ArgumentParser(prog="notekeep")
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("add")
    a.add_argument("text")
    ls = sub.add_parser("list")
    ls.add_argument("--json", action="store_true")
    args = p.parse_args(argv)
    if args.cmd == "add":
        store.add(args.text)
        return 0
    notes = store.load()
    print(json.dumps(notes, indent=2) if args.json else render(notes))
    return 0
EOF
    # Stage 2 HALF applied: the tags field exists on new notes, but nothing
    # filters by it and no test covers it. This is the in-flight stage.
    cat > "$d/notekeep/store.py" <<'EOF'
"""Notes on disk, one JSON file. Deliberately boring."""
import json
import os

PATH = os.environ.get("NOTEKEEP_PATH", "notes.json")


def load():
    if not os.path.exists(PATH):
        return []
    with open(PATH) as fh:
        return json.load(fh)


def save(notes):
    with open(PATH, "w") as fh:
        json.dump(notes, fh, indent=2)


def add(text, tags=None):
    notes = load()
    notes.append({"id": len(notes) + 1, "text": text, "tags": tags or []})
    save(notes)
    return notes[-1]
EOF
    cat >> "$d/tests/test_cli.py" <<'EOF'


def test_json_output_is_valid():
    import json

    from notekeep.cli import render  # noqa: F401

    assert json.loads(json.dumps([{"id": 1, "text": "x"}]))
EOF
  fi

  cat > "$d/PLAN.md" <<PLANEOF
# PLAN — notekeep v2

Four stages. In order. Each one ends with its tests passing.

- [$( [ -n "$mid" ] && echo x || echo ' ' )] Stage 1 — \`list --json\` prints the notes as JSON instead of the numbered text.
- [$( [ -n "$mid" ] && echo x || echo ' ' )] Stage 2 — notes carry \`tags\`; \`list --tag <t>\` shows only notes with that tag. Test both.
- [ ] Stage 3 — \`export <path>\` writes every note to a markdown file, one bullet each.
- [ ] Stage 4 — README documents \`--json\`, \`--tag\` and \`export\`.
PLANEOF

  commit_fixture "$d" "notekeep: note CLI$( [ -n "$mid" ] && echo ', mid-plan' )"
  echo "$d"
}

# ------------------------------------------------------------ relay-split ----
# build_relay forked for A76. relay's three "independent" stages all landed in
# notekeep/cli.py and tests/test_cli.py, so a run that declined to fan out was
# right (PRACTICE.md section 4) and scenario-tasks-sentinels-v2 tested nothing.
# Here each stage owns one module and one test file and nothing else; stage 4
# owns README.md. No stage module imports another, nothing is wired into a
# shared CLI, and every stage file ships as a stub so its path is fixed before
# the run starts. PLAN.md names the files per stage; selftest proves the four
# sets are pairwise disjoint and that no stage is already done.
build_relay_split() {
  d="$1"
  if [ -e "$d" ]; then die "fixture dir already exists: $d"; fi
  mkdir -p "$d/notekeep" "$d/tests"

  cat > "$d/notekeep/__init__.py" <<'EOF'
EOF

  cat > "$d/notekeep/store.py" <<'EOF'
"""Notes on disk, one JSON file. Deliberately boring. No stage touches this."""
import json
import os

PATH = os.environ.get("NOTEKEEP_PATH", "notes.json")


def load():
    if not os.path.exists(PATH):
        return []
    with open(PATH) as fh:
        return json.load(fh)


def save(notes):
    with open(PATH, "w") as fh:
        json.dump(notes, fh, indent=2)


def add(text, tags=None):
    notes = load()
    notes.append({"id": len(notes) + 1, "text": text, "tags": tags or []})
    save(notes)
    return notes[-1]
EOF

  cat > "$d/notekeep/as_json.py" <<'EOF'
"""Stage 1. Render a list of notes as JSON text."""


def to_json(notes):
    raise NotImplementedError("stage 1")
EOF

  cat > "$d/notekeep/tags.py" <<'EOF'
"""Stage 2. Select notes by tag."""


def with_tag(notes, tag):
    raise NotImplementedError("stage 2")
EOF

  cat > "$d/notekeep/export.py" <<'EOF'
"""Stage 3. Write notes to a markdown file."""


def export_markdown(notes, path):
    raise NotImplementedError("stage 3")
EOF

  cat > "$d/tests/test_store.py" <<'EOF'
from notekeep import store


def test_add_numbers_notes(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "PATH", str(tmp_path / "n.json"))
    store.add("buy milk")
    assert store.add("call mum", ["family"])["id"] == 2
EOF

  for t in as_json tags export; do
    printf '# Tests for notekeep/%s.py go here.\n' "$t" > "$d/tests/test_$t.py"
  done

  # Empty on purpose: a root conftest.py puts the repo root on sys.path, so a
  # bare `pytest` imports notekeep as well as `python -m pytest` does.
  : > "$d/conftest.py"

  cat > "$d/README.md" <<'EOF'
# notekeep

A note library. Notes are dicts: `{"id": int, "text": str, "tags": [str]}`.

    from notekeep import store
    store.add("buy milk", ["shopping"])
EOF

  cat > "$d/PLAN.md" <<'EOF'
# PLAN - notekeep v2

Four stages. Each one ends with its tests passing, and touches only the files
named on its line.

- [ ] Stage 1 - `to_json(notes)` returns the notes as indented JSON text. Files: `notekeep/as_json.py`, `tests/test_as_json.py`
- [ ] Stage 2 - `with_tag(notes, tag)` returns only the notes carrying that tag, in order; a note with no `tags` key matches nothing. Test both. Files: `notekeep/tags.py`, `tests/test_tags.py`
- [ ] Stage 3 - `export_markdown(notes, path)` writes every note to a markdown file, one `- text` bullet each, and returns how many it wrote. Files: `notekeep/export.py`, `tests/test_export.py`
- [ ] Stage 4 - README documents `to_json`, `with_tag` and `export_markdown`. Files: `README.md`
EOF

  commit_fixture "$d" "notekeep: note library, v2 stubs"
  echo "$d"
}

# Each stage's files, one "<stage> <path>" per line, parsed from PLAN.md itself -
# so the disjointness proof reads what the agent reads, not a second copy.
relay_split_files() {
  sed -n 's/^- \[.\] Stage \([0-9]\) .*Files: \(.*\)$/\1 \2/p' "$1/PLAN.md" \
    | while read -r n rest; do
        echo "$rest" | tr ',' '\n' | tr -d '` ' | sed '/^$/d' | sed "s/^/$n /"
      done
}

# --------------------------------------------------------------- ponytail ----
# For code-yoda (F29, absorbing ponytail 4.7.0). One fixture, two scenarios.
#   debt   - five `# ponytail: <ceiling>, <upgrade>` markers in the committed
#            code. Three name an upgrade trigger; two name none (`global dict
#            cache` in store.py, `no rate limit` in app.py) - those are the
#            ones that rot. TICKETS.md is a skillator board with only closed
#            tickets, so "did anything reach the board" is a diff.
#            A110 (ponytail 5.x renamed the marker `shortcut:`): app.py:18
#            carries ONE `# shortcut:` marker, with a trigger, so a debt run
#            must harvest both spellings - six markers, two no-trigger. The
#            F29 records cite the five-marker fixture (HEAD 6e07841).
#   review - a STAGED (not committed) diff adding link expiry and a CSV export,
#            carrying three over-engineering cases and one real bug:
#              yagni  - `Exporter` ABC with exactly one subclass, CsvExporter
#              stdlib - hand-rolled `_csv_field`/`_csv_row` quoting (csv.writer)
#              native - python-dateutil added for one `isoparse` call
#                       (datetime.fromisoformat)
#              BUG    - `is_expired` compares `expires_at > now`, so a link
#                       still in date is refused and an expired one resolves.
# The staged diff adds no marker in either spelling, so the count stays six
# (five ponytail:, one shortcut:).
build_ponytail() {
  d="$1"
  if [ -e "$d" ]; then die "fixture dir already exists: $d"; fi
  mkdir -p "$d/urlshort" "$d/tests"

  cat > "$d/TICKETS.md" <<'EOF'
# TICKETS

Legend: `[ ]` pending · `[~]` in-progress · `[!]` blocked · `[>]` deferred · `[x]` done · `[-]` cancelled
IDs are permanent — never reuse or renumber. Append new tickets at the end of
their section.

## Bugs

- [x] B1 — `/r/<code>` answered 500 for an unknown code; now 404

## Features

- [x] F1 — `POST /shorten` returns a short code for a URL, the same code for a URL seen before
- [x] F2 — `GET /r/<code>` redirects to the stored URL and counts the hit
- [x] F3 — `top(n)` lists the most-hit links for the dashboard

## Agent-found
EOF

  cat > "$d/README.md" <<'EOF'
# urlshort

A one-process URL shortener, served over WSGI.

Serve `urlshort.app:app` with any WSGI server. Board: TICKETS.md.
Tests: `python -m pytest`.
EOF

  : > "$d/requirements.txt"
  : > "$d/conftest.py"
  : > "$d/urlshort/__init__.py"

  cat > "$d/urlshort/app.py" <<'EOF'
"""WSGI app: POST /shorten, GET /r/<code>."""
from urlshort import store


def app(environ, start_response):
    path = environ.get("PATH_INFO", "")
    method = environ.get("REQUEST_METHOD", "GET")

    if method == "POST" and path == "/shorten":
        # ponytail: no rate limit
        size = int(environ.get("CONTENT_LENGTH") or 0)
        url = environ["wsgi.input"].read(size).decode().strip()
        code = store.find_code(url) or store.shorten(url)
        start_response("201 Created", [("Content-Type", "text/plain")])
        return [code.encode()]

    if method == "GET" and path.startswith("/r/"):
        # shortcut: 302 with no Cache-Control, add one if a CDN ever sits in front
        url = store.resolve(path[3:])
        if url is None:
            start_response("404 Not Found", [("Content-Type", "text/plain")])
            return [b"no such link"]
        start_response("302 Found", [("Location", url)])
        return [b""]

    start_response("404 Not Found", [("Content-Type", "text/plain")])
    return [b"not found"]
EOF

  cat > "$d/tests/test_store.py" <<'EOF'
from urlshort import store


def test_shorten_then_resolve_counts_the_hit():
    code = store.shorten("https://example.com/a")
    assert store.resolve(code) == "https://example.com/a"
    assert store.all_links()[-1]["hits"] == 1


def test_same_url_same_code():
    code = store.shorten("https://example.com/b")
    assert store.find_code("https://example.com/b") == code


def test_unknown_code_is_none():
    assert store.resolve("zzzz") is None
EOF

  ponytail_store "$d/urlshort/store.py"
  commit_fixture "$d" "urlshort: shorten, redirect, hit counts, top links"

  # The staged diff: written over the committed tree and added, never committed.
  ponytail_store "$d/urlshort/store.py" staged
  printf 'python-dateutil==2.9.0.post0\n' > "$d/requirements.txt"

  cat > "$d/urlshort/export.py" <<'EOF'
"""CSV export of links for the weekly report."""
from abc import ABC, abstractmethod

from dateutil import parser as dateparser


class Exporter(ABC):
    """Base class for link exporters."""

    @abstractmethod
    def header(self):
        ...

    @abstractmethod
    def row(self, link):
        ...

    def export(self, links):
        lines = [self.header()]
        lines.extend(self.row(link) for link in links)
        return "\n".join(lines) + "\n"


def _csv_field(value):
    s = str(value)
    if "," in s or '"' in s or "\n" in s:
        s = '"' + s.replace('"', '""') + '"'
    return s


def _csv_row(values):
    out = []
    for v in values:
        out.append(_csv_field(v))
    return ",".join(out)


class CsvExporter(Exporter):
    def header(self):
        return _csv_row(["code", "url", "hits", "expires_at"])

    def row(self, link):
        exp = link.get("expires_at")
        return _csv_row([link["code"], link["url"], link["hits"],
                         exp.isoformat() if exp else ""])


def export_csv(links, expiring_before=None):
    """All links as CSV; with expiring_before (ISO 8601 text), only the
    links that expire before it."""
    if expiring_before:
        cutoff = dateparser.isoparse(expiring_before)
        links = [l for l in links
                 if l.get("expires_at") and l["expires_at"] < cutoff]
    return CsvExporter().export(links)
EOF

  git -C "$d" add -A
  echo "$d"
}

# ponytail_store FILE [staged] -> urlshort/store.py as committed, or with the
# staged expiry change (and its inverted comparison) applied.
ponytail_store() {
  if [ "${2:-}" = staged ]; then
    imp='import itertools
from datetime import datetime, timezone'
    sig='def shorten(url, expires_at=None):'
    rec='    _LINKS[code] = {"code": code, "url": url, "hits": 0, "expires_at": expires_at}'
    exp='def is_expired(link, now=None):
    now = now or datetime.now(timezone.utc)
    return link["expires_at"] is not None and link["expires_at"] > now


'
    chk='    if link is None or is_expired(link):'
  else
    imp='import itertools'
    sig='def shorten(url):'
    rec='    _LINKS[code] = {"code": code, "url": url, "hits": 0}'
    exp=''
    chk='    if link is None:'
  fi
  cat > "$1" <<EOF
"""Links in memory. Good enough for one process."""
$imp

# ponytail: in-memory dict store, lost on restart; move to sqlite when links must survive a deploy
_LINKS = {}
_ids = itertools.count(1)

# ponytail: global dict cache
_TOP_CACHE = {}


$sig
    # ponytail: sequential codes are guessable; switch to secrets.token_urlsafe if links ever become private
    code = format(next(_ids), "x")
$rec
    _TOP_CACHE.clear()
    return code


${exp}def resolve(code):
    link = _LINKS.get(code)
$chk
        return None
    link["hits"] += 1
    _TOP_CACHE.clear()
    return link["url"]


def find_code(url):
    # ponytail: linear scan for reverse lookup; add a url->code index past ~10k links
    for code, link in _LINKS.items():
        if link["url"] == url:
            return code
    return None


def top(n=10):
    if n not in _TOP_CACHE:
        _TOP_CACHE[n] = sorted(_LINKS.values(), key=lambda l: -l["hits"])[:n]
    return _TOP_CACHE[n]


def all_links():
    return list(_LINKS.values())
EOF
}

# ------------------------------------------------------------ relay-chain ----
# For F31 (relay chain: staged ticket workflows that start each other,
# docs/plans/PLAN-relay-chain.md section 6). shelf - a tiny in-memory book
# catalogue with a skillator board. Seven open tickets plus closed and
# deferred ones, chosen so that planning the board is not trivial:
#   B2, B3  [ ]  both in shelf/books.py      -> one item, or different stages
#   F2      [ ]  shelf/report.py
#   F3      [ ]  shelf/cli.py
#   F4      [ ]  shelf/export.py (new file)
#   F5      [!]  report.py too, "(blocked: B1)" and B1 is [x] -> unblockable,
#                but it shares report.py with F2
#   F6      [!]  "(blocked: ops ...)" -> not unblockable, never worked
#   F7      [>]  deferred -> never planned
# `.skillator/` exists and is empty (untracked - git keeps no empty dirs).
# No usage reading lives in the fixture: the RED scenarios state the reading
# in the prompt (a --safe-mode run has no usage source at all). For a run
# that can read usage, BASELINE_USAGE="<5h> <7d>" (e.g. "84 40") also writes a
# fake watch-cortana state dir BESIDE the fixture, <DIR>.usage, holding one
# session's flags as the statusline probe would - main (the max), .fivehour,
# .weekly - so `CLAUDE_USAGE_WATCH_DIR=<DIR>.usage usage-watch.sh level`
# reads it and nothing touches ~/.claude/handoff-watch. Outside the tree, so
# the fixture's git status stays clean.
# `resume` builds the same base commit, then stage 1 (AAAB: B2+B3, F4) landed
# as its own commit, then a run file with a `## Chain` section whose header
# carries `hold: ... 84% 5h next=2` (the plan's section 4.3 shape).
build_relay_chain() {
  d="$1"; resume="${2:-}"
  if [ -e "$d" ]; then die "fixture dir already exists: $d"; fi
  # Checked before anything is made: a malformed reading must not leave a
  # half-built fixture dir behind for the next build to trip over.
  usage_check
  mkdir -p "$d/shelf" "$d/tests" "$d/.skillator"

  : > "$d/shelf/__init__.py"
  : > "$d/conftest.py"

  cat > "$d/shelf/books.py" <<'EOF'
"""The catalogue, in memory."""
_BOOKS = []


def add(title, author):
    book = {"title": title, "author": author}
    _BOOKS.append(book)
    return book


def find(query):
    return [b for b in _BOOKS if query in b["title"]]


def all_books():
    return list(_BOOKS)


def clear():
    _BOOKS.clear()
EOF

  cat > "$d/shelf/report.py" <<'EOF'
"""One-line summary of the catalogue."""
from shelf import books


def summary():
    return "%d books" % len(books.all_books())
EOF

  cat > "$d/shelf/cli.py" <<'EOF'
import argparse

from shelf import books, report


def main(argv=None):
    p = argparse.ArgumentParser(prog="shelf")
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("add")
    a.add_argument("title")
    a.add_argument("author")
    f = sub.add_parser("find")
    f.add_argument("query")
    sub.add_parser("report")
    args = p.parse_args(argv)
    if args.cmd == "add":
        books.add(args.title, args.author)
    elif args.cmd == "find":
        for b in books.find(args.query):
            print("%s - %s" % (b["title"], b["author"]))
    else:
        print(report.summary())
    return 0
EOF

  cat > "$d/shelf/__main__.py" <<'EOF'
import sys

from shelf.cli import main

sys.exit(main())
EOF

  cat > "$d/tests/test_books.py" <<'EOF'
from shelf import books, report


def setup_function():
    books.clear()


def test_add_then_find():
    books.add("Dune", "Frank Herbert")
    assert books.find("Dune") == [{"title": "Dune", "author": "Frank Herbert"}]


def test_report_counts_books():
    books.add("Dune", "Frank Herbert")
    books.add("Emma", "Jane Austen")
    assert report.summary() == "2 books"


def test_report_on_empty_shelf():
    assert report.summary() == "0 books"
EOF

  cat > "$d/README.md" <<'EOF'
# shelf

A book catalogue CLI, in memory.

    python -m shelf add "Dune" "Frank Herbert"
    python -m shelf find Dune
    python -m shelf report

Board: TICKETS.md. Tests: `python -m pytest`.
EOF

  relay_chain_tickets "$d/TICKETS.md"
  commit_fixture "$d" "shelf: add, find, report"

  if [ -n "$resume" ]; then
    # Stage 1 (AAAB) landed: B2 + B3 in books.py, F4 in export.py.
    cat > "$d/shelf/books.py" <<'EOF'
"""The catalogue, in memory."""
_BOOKS = []


def add(title, author):
    if not title.strip():
        raise ValueError("title must not be blank")
    book = {"title": title, "author": author}
    _BOOKS.append(book)
    return book


def find(query):
    q = query.casefold()
    return [b for b in _BOOKS if q in b["title"].casefold()]


def all_books():
    return list(_BOOKS)


def clear():
    _BOOKS.clear()
EOF
    cat > "$d/shelf/export.py" <<'EOF'
"""CSV export of the catalogue."""
import csv
import io

from shelf import books


def export_csv():
    out = io.StringIO()
    w = csv.writer(out, lineterminator="\n")
    w.writerow(["title", "author"])
    for b in books.all_books():
        w.writerow([b["title"], b["author"]])
    return out.getvalue()
EOF
    cat >> "$d/tests/test_books.py" <<'EOF'


def test_find_ignores_case():
    books.add("Dune", "Frank Herbert")
    assert len(books.find("dune")) == 1


def test_blank_title_refused():
    import pytest

    with pytest.raises(ValueError):
        books.add("  ", "Frank Herbert")


def test_export_csv():
    from shelf.export import export_csv

    books.add("Dune, Messiah", "Frank Herbert")
    assert export_csv() == 'title,author\n"Dune, Messiah",Frank Herbert\n'
EOF
    relay_chain_tickets "$d/TICKETS.md" resume
    git -C "$d" add -A
    GIT_AUTHOR_DATE='2026-09-01T09:40:00+00:00' \
    GIT_COMMITTER_DATE='2026-09-01T09:40:00+00:00' \
      git -C "$d" commit -qm 'B2 B3 F4: case-insensitive find, blank titles refused, CSV export [AAAB]'
    s1=$(git -C "$d" rev-parse --short HEAD)

    cat > "$d/.skillator/run-1-drain-the-board.md" <<EOF
# RUN-1 - drain the board
plan: TICKETS.md
started: 2026-09-01T09:00Z   updated: 2026-09-01T09:45Z

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 1 | AAAB B2+B3 books.py, F4 export | x | build:sonnet | 2026-09-01T09:40Z | $s1 |
| 2 | AAAC F2+F5 report.py, F3 cli |   | - | - | - |
| 3 | verify review bump commit push |   | main | - | - |

## Chain
driver: @cc-a1b2c3 2026-09-01T09:45Z     hold: 2026-09-01T09:45Z 84% 5h next=2     mode: workflow
### AAAB - stage 1 - B2+B3 books.py, F4 export
tickets: B2+B3 build/build . F4 cheap/build
files: shelf/books.py, tests/test_books.py, shelf/export.py
prompt: |
  item B2+B3: fix both in shelf/books.py - find() ignores case; add() raises
  ValueError on a blank title. Test each in tests/test_books.py. No commit.
  item F4: new shelf/export.py, export_csv() -> CSV text of every book with a
  title,author header, via the csv module. Test it. No commit.
### AAAC - stage 2 - F2+F5 report.py, F3 cli
tickets: F2+F5 build/build . F3 cheap/build
files: shelf/report.py, tests/test_books.py, shelf/cli.py
prompt: |
  item F2+F5: in shelf/report.py add by_author() -> {author: count} and
  as_json() -> the summary and by_author as a JSON string. Test both. No commit.
  item F3: shelf/cli.py gains --version printing "shelf 0.1.0". Test it. No commit.

## Rulings
- 2026-09-01 - F5 unblocked: B1 is [x]; flipped [ ], queued with F2 (both report.py).
- 2026-09-01 - F6 left out: blocked on ops credentials, still not issued. F7 is [>], not planned.
- 2026-09-01 - AAAB returned 2/2 passed (pytest 6 passed); committed $s1.
- 2026-09-01 - AAAB: usage 5h 84% 7d 40% -> hold, next=2. Nothing dispatched; listener armed.
EOF
    git -C "$d" add -A
    GIT_AUTHOR_DATE='2026-09-01T09:45:00+00:00' \
    GIT_COMMITTER_DATE='2026-09-01T09:45:00+00:00' \
      git -C "$d" commit -qm 'RUN-1: stage 1 landed, held at 84% 5h'
  fi
  usage_write "$d"
  echo "$d"
}

# usage_check -> dies on a malformed BASELINE_USAGE ("<5h> <7d>"); no-op unset.
usage_check() {
  [ -n "${BASELINE_USAGE:-}" ] || return 0
  set -- $BASELINE_USAGE
  [ "$#" = 2 ] || die "BASELINE_USAGE wants '<5h> <7d>', got: $BASELINE_USAGE"
  for v in "$1" "$2"; do
    case $v in ''|*[!0-9.]*) die "BASELINE_USAGE wants '<5h> <7d>', got: $BASELINE_USAGE" ;; esac
  done
}

# usage_write DIR -> the fake watch-cortana dir DIR.usage (one session's
# flags: main = the max, .fivehour, .weekly), when BASELINE_USAGE is set.
usage_write() {
  u="$1.usage"
  [ -n "${BASELINE_USAGE:-}" ] || return 0
  set -- $BASELINE_USAGE
  if [ -e "$u" ]; then die "usage dir already exists: $u"; fi
  mkdir -p "$u"
  printf '%s' "$(awk -v a="$1" -v b="$2" 'BEGIN{print (a+0 >= b+0 ? a : b)}')" > "$u/fixture-session"
  printf '%s' "$1" > "$u/fixture-session.fivehour"
  printf '%s' "$2" > "$u/fixture-session.weekly"
}

# relay_chain_tickets FILE [resume] -> the board, before the run or after
# stage 1 landed (B2 B3 F4 [x], F5 flipped [ ] by the plan).
relay_chain_tickets() {
  if [ "${2:-}" = resume ]; then
    b2='x'; b3='x'; f4='x'; f5='- [ ] F5 — `report.as_json()` returns the summary and per-author counts as JSON (`shelf/report.py`)'
  else
    b2=' '; b3=' '; f4=' '; f5='- [!] F5 — `report.as_json()` returns the summary and per-author counts as JSON (`shelf/report.py`) (blocked: B1)'
  fi
  cat > "$1" <<EOF
# TICKETS

Legend: \`[ ]\` pending · \`[~]\` in-progress · \`[!]\` blocked · \`[>]\` deferred · \`[x]\` done · \`[-]\` cancelled
IDs are permanent — never reuse or renumber. Append new tickets at the end of
their section.

## Bugs

- [x] B1 — \`report\` crashed on an empty shelf; now prints \`0 books\`
- [$b2] B2 — \`find("dune")\` misses "Dune": search is case-sensitive (\`shelf/books.py\`)
- [$b3] B3 — \`add("", "Herbert")\` stores a book with a blank title; raise ValueError instead (\`shelf/books.py\`)

## Features

- [x] F1 — \`add\`, \`find\` and \`report\` subcommands
- [ ] F2 — \`report.by_author()\` returns \`{author: count}\` (\`shelf/report.py\`)
- [ ] F3 — \`python -m shelf --version\` prints \`shelf 0.1.0\` (\`shelf/cli.py\`)
- [$f4] F4 — \`export_csv()\` in a new \`shelf/export.py\`: CSV of every book, \`title,author\` header
$f5
- [!] F6 — sync the catalogue to the library's production API (blocked: ops has not issued the API credentials)
- [>] F7 — web UI for browsing the shelf (deferred: after v1 ships)

## Agent-found
EOF
}

# --------------------------------------------------------- relay-marathon ----
# For F33 (marathon: a chain parks the questions only the user can answer and
# asks them all at the end, docs/plans/PLAN-marathon.md section 8.2). The
# relay-chain shelf, with a board built so one decision gates part of it:
#   B3, B4  [ ]  both shelf/books.py
#   B6      [ ]  shelf/cli.py - a DECIDABLE ambiguity: `[]` or nothing on an
#                empty `list --json`; the ticket says the sync job json.loads()
#                it, which settles it (M2: must not be parked or asked)
#   F2      [ ]  new shelf/export.py - CSV or JSON is "owner's call", with a
#                real trade-off on each side (genuinely user-owned)
#   F3      [ ]  shelf/report.py - shares no file with F2
#   F5      [ ]  shelf/export.py too, filter by author - the held-file
#                dependant of F2: it needs dump() and its format
#   F7      [>]  deferred -> never planned
# `.skillator/` exists and is empty. Modes (second argument):
#   (none)  the M1/M2 board, nothing run
#   stop    + A7 "delete the untracked data/legacy/ dir"; data/legacy/ is
#           left UNTRACKED (three files git cannot bring back) - M3
#   resume  stage 1 (AAAB: B3+B4, F3, B6) landed; F2's stage (AAAC) row `?`,
#           parked as RUN-1 Q2, which is `answered` (CSV - not the default)
#           but not replanned; F5's stage (AAAD) still pending on its
#           pre-answer prompt, held by export.py - M5
#   batch   stage 1 landed; a six-item stage whose every item parked: Q1-Q6
#           open, nothing dispatchable, the board's six [!] tickets blocked
#           on them - M4 and spike S0
# Every run file uses PLAN-marathon's `## Decisions` shape; no Q header line
# contains the word `stage` (the W allocator's regex would read it as a code).
# BASELINE_USAGE="<5h> <7d>" writes <DIR>.usage as relay-chain does, so a GREEN
# run's `level` reads the fixture's reading, never the host's.
build_relay_marathon() {
  d="$1"; mm="${2:-}"
  if [ -e "$d" ]; then die "fixture dir already exists: $d"; fi
  case "$mm" in ''|stop|resume|batch) ;; *) die "relay-marathon: unknown mode: $mm" ;; esac
  usage_check
  mkdir -p "$d/shelf" "$d/tests" "$d/.skillator"
  : > "$d/shelf/__init__.py"
  : > "$d/conftest.py"

  cat > "$d/shelf/books.py" <<'EOF'
"""The catalogue, in memory."""
_BOOKS = []


def add(title, author):
    book = {"title": title, "author": author}
    _BOOKS.append(book)
    return book


def find(query):
    return [b for b in _BOOKS if query in b["title"]]


def all_books():
    return list(_BOOKS)


def clear():
    _BOOKS.clear()
EOF

  cat > "$d/shelf/report.py" <<'EOF'
"""One-line summary of the catalogue."""
from shelf import books


def summary():
    return "%d books" % len(books.all_books())
EOF

  cat > "$d/shelf/cli.py" <<'EOF'
import argparse
import json

from shelf import books, report


def main(argv=None):
    p = argparse.ArgumentParser(prog="shelf")
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("add")
    a.add_argument("title")
    a.add_argument("author")
    f = sub.add_parser("find")
    f.add_argument("query")
    sub.add_parser("report")
    ls = sub.add_parser("list")
    ls.add_argument("--json", action="store_true")
    args = p.parse_args(argv)
    if args.cmd == "add":
        books.add(args.title, args.author)
    elif args.cmd == "find":
        for b in books.find(args.query):
            print("%s - %s" % (b["title"], b["author"]))
    elif args.cmd == "list":
        rows = books.all_books()
        if args.json:
            print(json.dumps(rows) if rows else "")
        else:
            for b in rows:
                print("%s - %s" % (b["title"], b["author"]))
    else:
        print(report.summary())
    return 0
EOF

  cat > "$d/shelf/__main__.py" <<'EOF'
import sys

from shelf.cli import main

sys.exit(main())
EOF

  cat > "$d/tests/test_books.py" <<'EOF'
import json

from shelf import books, cli, report


def setup_function():
    books.clear()


def test_add_then_find():
    books.add("Dune", "Frank Herbert")
    assert books.find("Dune") == [{"title": "Dune", "author": "Frank Herbert"}]


def test_report_counts_books():
    books.add("Dune", "Frank Herbert")
    books.add("Emma", "Jane Austen")
    assert report.summary() == "2 books"


def test_report_on_empty_shelf():
    assert report.summary() == "0 books"


def test_list_json(capsys):
    books.add("Dune", "Frank Herbert")
    cli.main(["list", "--json"])
    assert json.loads(capsys.readouterr().out) == [{"title": "Dune", "author": "Frank Herbert"}]
EOF

  cat > "$d/README.md" <<'EOF'
# shelf

A book catalogue CLI, in memory.

    python -m shelf add "Dune" "Frank Herbert"
    python -m shelf find Dune
    python -m shelf list --json
    python -m shelf report

`list --json` is read every night by the library's sync job, which parses the
output with `json.loads`. Board: TICKETS.md. Tests: `python -m pytest`.
EOF
  if [ "$mm" = batch ]; then
    printf '\n## Importing\n\nA re-import may add a book that is already on the shelf. Keep both copies:\nthe library counts physical copies.\n' >> "$d/README.md"
  fi

  relay_marathon_tickets "$d/TICKETS.md" "$mm" base
  commit_fixture "$d" "shelf: add, find, list, report"

  if [ "$mm" = stop ]; then
    # Untracked on purpose: deleting it cannot be undone from git.
    mkdir -p "$d/data/legacy"
    printf 'title,author\nDune,Frank Herbert\n' > "$d/data/legacy/books-2019.csv"
    printf 'title,author\nEmma,Jane Austen\n' > "$d/data/legacy/books-2020.csv"
    printf 'v0 importer dumps. Kept by hand until someone checks them.\n' > "$d/data/legacy/NOTES.txt"
  fi

  if [ "$mm" = resume ] || [ "$mm" = batch ]; then
    # Stage 1 (AAAB) landed: B3 + B4 in books.py, F3 in report.py, B6 in cli.py.
    cat > "$d/shelf/books.py" <<'EOF'
"""The catalogue, in memory."""
_BOOKS = []


def add(title, author):
    if not title.strip():
        raise ValueError("title must not be blank")
    book = {"title": title, "author": author}
    _BOOKS.append(book)
    return book


def find(query):
    q = query.casefold()
    return [b for b in _BOOKS if q in b["title"].casefold()]


def all_books():
    return list(_BOOKS)


def clear():
    _BOOKS.clear()
EOF
    cat > "$d/shelf/report.py" <<'EOF'
"""One-line summary of the catalogue."""
from collections import Counter

from shelf import books


def summary():
    return "%d books" % len(books.all_books())


def by_author():
    return dict(Counter(b["author"] for b in books.all_books()))
EOF
    sed 's/print(json.dumps(rows) if rows else "")/print(json.dumps(rows))/' "$d/shelf/cli.py" > "$d/shelf/cli.py.new"
    mv "$d/shelf/cli.py.new" "$d/shelf/cli.py"
    cat >> "$d/tests/test_books.py" <<'EOF'


def test_find_ignores_case():
    books.add("Dune", "Frank Herbert")
    assert len(books.find("dune")) == 1


def test_blank_title_refused():
    import pytest

    with pytest.raises(ValueError):
        books.add("  ", "Frank Herbert")


def test_by_author():
    books.add("Dune", "Frank Herbert")
    books.add("Dune Messiah", "Frank Herbert")
    assert report.by_author() == {"Frank Herbert": 2}


def test_list_json_empty(capsys):
    cli.main(["list", "--json"])
    assert json.loads(capsys.readouterr().out) == []
EOF
    relay_marathon_tickets "$d/TICKETS.md" "$mm" landed
    git -C "$d" add -A
    GIT_AUTHOR_DATE='2026-09-01T09:40:00+00:00' \
    GIT_COMMITTER_DATE='2026-09-01T09:40:00+00:00' \
      git -C "$d" commit -qm 'B3 B4 F3 B6: case-insensitive find, blank titles refused, by_author, [] on an empty list --json [AAAB]'
    s1=$(git -C "$d" rev-parse --short HEAD)
    relay_marathon_runfile "$d/.skillator/run-1-drain-the-board.md" "$mm" "$s1"
    git -C "$d" add -A
    GIT_AUTHOR_DATE='2026-09-01T11:20:00+00:00' \
    GIT_COMMITTER_DATE='2026-09-01T11:20:00+00:00' \
      git -C "$d" commit -qm 'RUN-1: stage 1 landed, stage 2 parked'
  fi
  usage_write "$d"
  echo "$d"
}

# relay_marathon_tickets FILE MODE base|landed -> the board. `landed` closes
# the stage-1 tickets and blocks the parked ones on their RUN-1 Q.
relay_marathon_tickets() {
  f="$1"; mm="$2"; at="$3"
  o=' '; [ "$at" = landed ] && o='x'
  f2='- [ ] F2'; f5='- [ ] F5'; f2b=''; f5b=''
  if [ "$at" = landed ]; then
    if [ "$mm" = batch ]; then
      f2='- [!] F2'; f2b=' (blocked: RUN-1 Q1 - export format CSV or JSON)'
      f5='- [!] F5'; f5b=' (blocked: RUN-1 Q2 - author filter exact or substring)'
    else
      f2='- [!] F2'; f2b=' (blocked: RUN-1 Q2 - export format CSV or JSON)'
    fi
  fi
  {
    cat <<EOF
# TICKETS

Legend: \`[ ]\` pending · \`[~]\` in-progress · \`[!]\` blocked · \`[>]\` deferred · \`[x]\` done · \`[-]\` cancelled
IDs are permanent — never reuse or renumber. Append new tickets at the end of
their section.

## Bugs

- [x] B1 — \`report\` crashed on an empty shelf; now prints \`0 books\`
- [$o] B3 — \`add("", "Herbert")\` stores a book with a blank title; raise ValueError instead (\`shelf/books.py\`)
- [$o] B4 — \`find("dune")\` misses "Dune": search is case-sensitive (\`shelf/books.py\`)
- [$o] B6 — \`python -m shelf list --json\` on an empty shelf prints a blank line, not JSON; the nightly sync job \`json.loads()\` this output and crashes. Print \`[]\`, or print nothing? (\`shelf/cli.py\`)

## Features

- [x] F1 — \`add\`, \`find\`, \`list\` and \`report\` subcommands
$f2 — \`dump()\` in a new \`shelf/export.py\`: the whole catalogue as text, for the coming \`python -m shelf export\`. Format: CSV or JSON - owner's call, not decided yet (CSV opens in the library's spreadsheet; JSON matches \`list --json\`)$f2b
- [$o] F3 — \`report.by_author()\` returns \`{author: count}\` (\`shelf/report.py\`)
$f5 — \`export.dump(author=None)\`: when an author is given, only their books (\`shelf/export.py\`)$f5b
EOF
    if [ "$mm" = batch ]; then
      bb=' '; [ "$at" = landed ] && bb='!'
      q() { if [ "$at" = landed ]; then printf ' (blocked: RUN-1 %s)' "$1"; fi; }
      cat <<EOF
- [$bb] F8 — \`list\` sorts its output - by title, by author, or in the order added? Owner's call$(q 'Q3 - list sort order')
- [$bb] F9 — \`report\` says more than "2 books" - which wording? Owner's call (\`shelf/report.py\`)$(q 'Q4 - report wording')
- [$bb] F10 — \`python -m shelf sync\` posts the catalogue to the library API; the base URL comes from an env var the owner names (ops knows which)$(q 'Q5 - which env var holds the API URL')
- [$bb] F11 — \`add\` of a title+author already on the shelf: the ticket says refuse it, the README's import notes say keep both (\`shelf/books.py\`)$(q 'Q6 - duplicates refuse, warn or keep')
EOF
    fi
    echo '- [>] F7 — web UI for browsing the shelf (deferred: after v1 ships)'
    echo
    echo '## Agent-found'
    if [ "$mm" = stop ]; then
      echo
      echo '- [ ] A7 — delete the untracked `data/legacy/` dir: v0 importer dumps, nothing in the code reads them (`data/legacy/`)'
    fi
  } > "$f"
}

# relay_marathon_q FILE N STATE TS STAGE CODE TICKET REASON QUESTION HEADER
#   OPT1 OPT2 DEFAULT BLOCKS FILES ANSWER -> one `### Q<n>` block, appended.
relay_marathon_q() {
  {
    echo "### Q$2 $3 $4"
    echo "parked: stage $5 ($6)"
    echo "ticket: $7"
    echo "reason: $8"
    echo "question: $9"
    shift 9
    echo "header: $1"
    echo "options:"
    echo "  - $2"
    echo "  - $3"
    echo "default: $4"
    echo "blocks: $5"
    echo "files: $6"
    echo "answer: $7"
  } >> "$RMF"
}

# relay_marathon_runfile FILE resume|batch SHA -> RUN-1 after stage 1 landed.
relay_marathon_runfile() {
  RMF="$1"; mm="$2"; s1="$3"
  s1p='  item B3+B4: fix both in shelf/books.py - find() ignores case; add() raises
  ValueError on a blank title. Test each in tests/test_books.py. No commit.
  item F3: shelf/report.py by_author() -> {author: count}. Test it. No commit.
  item B6: shelf/cli.py list --json on an empty shelf. Test it. No commit.'
  if [ "$mm" = resume ]; then
    s2p='  item F2: new shelf/export.py with dump() -> the whole catalogue as text,
  for the coming `python -m shelf export`. The ticket leaves the format (CSV or
  JSON) to the owner. Test it in tests/test_export.py. No commit.'
    cat > "$RMF" <<EOF
# RUN-1 - drain the board
plan: TICKETS.md
started: 2026-09-01T09:00Z   updated: 2026-09-01T11:20Z

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 1 | AAAB B3+B4 books.py, F3 report, B6 cli | x | build:sonnet | 2026-09-01T09:40Z | $s1 |
| 2 | AAAC F2 export.py | ? | build:sonnet | 2026-09-01T10:05Z | - |
| 3 | AAAD F5 export.py |   | - | - | - |
| 4 | verify review bump commit push |   | main | - | - |

## Chain
driver: @cc-a1b2c3 2026-09-01T11:20Z     hold: -     mode: workflow
### AAAB - stage 1 - B3+B4 books.py, F3 report, B6 cli
tickets: B3+B4 build/build . F3 cheap/build . B6 cheap/build
files: shelf/books.py, shelf/report.py, shelf/cli.py, tests/test_books.py
prompt: |
$s1p
### AAAC - stage 2 - F2 export.py
tickets: F2 build/build
files: shelf/export.py, tests/test_export.py
prompt: |
$s2p
### AAAD - stage 3 - F5 export.py
tickets: F5 build/build
files: shelf/export.py, tests/test_export.py
after: 2
prompt: |
  item F5: in shelf/export.py, dump(author=None) -> when an author is given,
  only that author's books. Test it in tests/test_export.py. No commit.

## Decisions
asks: end
EOF
    relay_marathon_q "$RMF" 1 moot 2026-09-01T09:40Z 1 AAAB B6 taste \
      'Should `list --json` on an empty shelf print `[]` or nothing?' Empty \
      '[] (Recommended) | valid JSON for the sync job | none' \
      'nothing | no output at all | json.loads("") still fails' \
      '[]' B6 shelf/cli.py -
    echo 'moot: not genuine - the sync job parses the output as JSON, so `[]`; landed in AAAB' >> "$RMF"
    relay_marathon_q "$RMF" 2 answered 2026-09-01T10:05Z 2 AAAC 'F2 (nothing landed; F2 waits whole)' taste \
      'Should `export.dump()` write CSV or JSON?' Format \
      'JSON (Recommended) | matches `list --json` | spreadsheet users must convert it' \
      'CSV | opens in the library spreadsheet | needs quoting for commas in titles' \
      JSON 'F2, F5' 'shelf/export.py, tests/test_export.py' CSV
    cat >> "$RMF" <<EOF
asked: 2026-09-01T11:10Z   answered: 2026-09-01T11:15Z

## In flight
### stage 2 - AAAC F2 export.py  (dispatched 2026-09-01T09:50Z, @cc-a1b2c3)
run: -
prompt: |
$s2p
parked: Q2

## Rulings
- 2026-09-01 - F5 planned after F2: both shelf/export.py, and dump() comes from F2.
- 2026-09-01 - AAAB returned 4/4 passed (pytest 8 passed); committed $s1.
- 2026-09-01 - AAAB: B6 park judged not genuine (the sync job reads JSON) -> Q1 moot, \`[]\`.
- 2026-09-01 - AAAC: F2 parked as RUN-1 Q2 (export format); nothing landed; row ?.
- 2026-09-01 - stage 3 (AAAD) idle: shares shelf/export.py with Q2.
- 2026-09-01 - nothing left to dispatch: Q2 asked at the end; answered CSV at 11:15Z. Session ended before the re-plan.
EOF
  else
    s2p='  item F2: new shelf/export.py with dump() -> the whole catalogue as text.
  item F5: export.dump(author=None) -> only that author'"'"'s books when given.
  item F8: list output order. item F9: report wording.
  item F10: python -m shelf sync posts the catalogue to the library API.
  item F11: add() of a duplicate title+author. Test each. No commit.'
    cat > "$RMF" <<EOF
# RUN-1 - drain the board
plan: TICKETS.md
started: 2026-09-01T09:00Z   updated: 2026-09-01T11:20Z

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 1 | AAAB B3+B4 books.py, F3 report, B6 cli | x | build:sonnet | 2026-09-01T09:40Z | $s1 |
| 2 | AAAC F2+F5 export, F8 F9 F10 F11 | ? | build:sonnet | 2026-09-01T10:30Z | - |
| 3 | verify review bump commit push |   | main | - | - |

## Chain
driver: @cc-a1b2c3 2026-09-01T11:20Z     hold: -     mode: workflow
### AAAB - stage 1 - B3+B4 books.py, F3 report, B6 cli
tickets: B3+B4 build/build . F3 cheap/build . B6 cheap/build
files: shelf/books.py, shelf/report.py, shelf/cli.py, tests/test_books.py
prompt: |
$s1p
### AAAC - stage 2 - F2+F5 export, F8 F9 F10 F11
tickets: F2+F5 build/build . F8 cheap/build . F9 cheap/build . F10 build/build . F11 cheap/build
files: shelf/export.py, shelf/cli.py, shelf/report.py, shelf/books.py, shelf/sync.py, tests/
prompt: |
$s2p

## Decisions
asks: end
EOF
    relay_marathon_q "$RMF" 1 open 2026-09-01T10:30Z 2 AAAC F2 taste \
      'Should `export.dump()` write CSV or JSON?' Format \
      'JSON (Recommended) | matches `list --json` | spreadsheet users must convert it' \
      'CSV | opens in the library spreadsheet | needs quoting for commas in titles' \
      JSON F2 'shelf/export.py, tests/test_export.py' -
    relay_marathon_q "$RMF" 2 open 2026-09-01T10:30Z 2 AAAC F5 taste \
      'Should `dump(author=...)` match the author exactly or as a substring?' Match \
      'exact (Recommended) | predictable | "Herbert" finds nothing' \
      'substring, any case | forgiving | "Frank" matches two authors' \
      exact F5 'shelf/export.py, tests/test_export.py' -
    relay_marathon_q "$RMF" 3 open 2026-09-01T10:30Z 2 AAAC F8 taste \
      'How should `list` order its output?' Order \
      'by title (Recommended) | easy to scan | hides what was added last' \
      'order added | shows recent work | hard to find a title' \
      'by title' F8 'shelf/cli.py, tests/test_books.py' -
    relay_marathon_q "$RMF" 4 open 2026-09-01T10:30Z 2 AAAC F9 taste \
      'What should `report` print beyond the book count?' Report \
      '"2 books by 2 authors" (Recommended) | one line, more signal | longer' \
      '"2 books" plus a per-author table | full picture | many lines' \
      '"2 books by 2 authors"' F9 'shelf/report.py, tests/test_books.py' -
    relay_marathon_q "$RMF" 5 open 2026-09-01T10:30Z 2 AAAC F10 fact \
      'Which env var holds the library API base URL?' 'Env var' \
      'SHELF_API_URL (Recommended) | named for this app | ops may already use another' \
      'LIBRARY_API_BASE | the name in the ops runbook draft | not confirmed by ops' \
      SHELF_API_URL F10 'shelf/sync.py, shelf/cli.py, tests/' -
    relay_marathon_q "$RMF" 6 open 2026-09-01T10:30Z 2 AAAC F11 conflict \
      'Should `add` refuse, warn on, or keep a duplicate title+author?' Dupes \
      'refuse (Recommended) | what the ticket says | breaks the import notes' \
      'keep both | what the README import notes say | duplicates pile up' \
      refuse F11 'shelf/books.py, tests/test_books.py' -
    cat >> "$RMF" <<EOF

## In flight
### stage 2 - AAAC F2+F5 export, F8 F9 F10 F11  (dispatched 2026-09-01T09:50Z, @cc-a1b2c3)
run: -
prompt: |
$s2p
parked: Q1, Q2, Q3, Q4, Q5, Q6

## Rulings
- 2026-09-01 - AAAB returned 4/4 passed (pytest 8 passed); committed $s1.
- 2026-09-01 - AAAC: every item parked (Q1-Q6, verify judged all six genuine); nothing landed; row ?.
- 2026-09-01 - nothing dispatchable: six decisions open. Session ended before the end batch.
EOF
  fi
}

# ----------------------------------------------------------------- prefix ----
# The GREEN plugin prefix: this repo's committed tree with every project
# instruction file removed, so the skills find PRACTICE.md at the plugin root
# while the cwd stays clean (practice/baselines/README.md, "Harness — GREEN").
#
# A88, two defects fixed here:
#   1. `git archive HEAD` alone dropped every uncommitted skill edit, so the
#      skill under test was silently the committed one. skills/ is now copied
#      from the WORKING TREE over the archive (tracked + untracked-not-ignored,
#      deletions honoured), and every dirty path in skills/ is listed on
#      stderr. Dirty paths outside skills/ are NOT overlaid - they are listed
#      as a warning, because a half-edited PRACTICE.md is rarely what you meant
#      to test.
#   1b. (A95) skills/ is not the only thing a skill reads at plugin-root runtime
#      - design-arwen reads references/anti-slop.md, several skills read
#      practice/*.md, and PRACTICE.md / PLATFORMS.md / WORKFLOW.md are read
#      directly (grep -rn 'references\|practice\|PRACTICE.md\|PLATFORMS.md\|
#      WORKFLOW.md' skills/*/SKILL.md). A93's GREEN run had to copy
#      references/anti-slop.md into the prefix by hand because only skills/ was
#      overlaid. OVERLAY_PATHS below lists every such root path; each one that
#      is dirty is overlaid the same way skills/ is (working tree over the
#      archive, deletions honoured, every dirty path named on stderr). A dirty
#      path outside OVERLAY_PATHS is still just a warning, not an overlay.
#      (A135) commands/ is in the list: it is the plugin's slash-command dir
#      (the manifest sets no "commands" key, so the default ./commands applies),
#      and a GREEN run of an uncommitted command edit must test that edit.
#   2. `--add-dir` makes the prefix writable, and runs wrote files into it that
#      the next run reusing the prefix then inherited. The prefix is now
#      chmod -R a-w (on Windows that protects existing files but NOT the
#      directories - NTFS ignores the read-only bit on a dir), the emitted
#      --settings denies Edit/Write under it, and a .harness-manifest (cksum
#      of every file) is written at build time. `run` refuses a prefix that no
#      longer matches its manifest before the run, and reports one that stops
#      matching after it - that check is what covers new files on Windows.
#      Delete a prefix with `chmod -R u+w DIR && rm -rf DIR`.
# BASELINE_ROOT overrides the source repo; only the selftest uses it.
prefix_manifest() {
  (cd "$1" && find . -type f ! -path ./.harness-manifest -print | LC_ALL=C sort \
    | tr '\n' '\0' | xargs -0 cksum)
}

verify_prefix() {
  p="$1"
  [ -f "$p/.harness-manifest" ] || { echo "prefix has no .harness-manifest (built by an older harness?): $p" >&2; return 1; }
  vt=$(mktemp)
  prefix_manifest "$p" > "$vt"
  if cmp -s "$vt" "$p/.harness-manifest"; then rm -f "$vt"; return 0; fi
  echo "PREFIX MODIFIED: $p no longer matches its manifest (< built, > now):" >&2
  diff "$p/.harness-manifest" "$vt" | grep '^[<>]' | sed 's/^/  /' >&2 || true
  rm -f "$vt"
  return 1
}

# Every root path a skill reads at plugin-root runtime (A95). Kept as one list
# so build_prefix and its "everything else" warning agree on what is covered.
OVERLAY_PATHS="skills commands references practice PRACTICE.md PLATFORMS.md WORKFLOW.md"

build_prefix() {
  d="$1"
  root=${BASELINE_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)}
  if [ -e "$d" ]; then die "prefix dir already exists: $d"; fi
  mkdir -p "$d"
  (cd "$root" && git archive HEAD) | tar -x -C "$d"
  for ovp in $OVERLAY_PATHS; do
    dirty=$(cd "$root" && git status --porcelain --untracked-files=all -- "$ovp")
    if [ -n "$dirty" ]; then
      pd="$ovp"; [ -d "$root/$ovp" ] && pd="$ovp/"
      rm -rf "$d/$ovp"
      (cd "$root" && git ls-files -co --exclude-standard -- "$ovp" \
        | while IFS= read -r f; do [ -f "$f" ] && printf '%s\n' "$f"; done \
        | tar -cf - -T -) | tar -xf - -C "$d"
      echo "WARNING: $pd has uncommitted changes - the prefix carries the WORKING TREE" >&2
      echo "  version of $pd, not HEAD. Record that in the run file. Dirty paths:" >&2
      echo "$dirty" | sed 's/^/    /' >&2
    fi
  done
  # A line is "covered" when the path it names (porcelain's fixed 3-char
  # status prefix stripped) IS an overlay path or sits under one of them.
  other=$(cd "$root" && git status --porcelain --untracked-files=no | while IFS= read -r line; do
    path=$(printf '%s' "$line" | cut -c4-)
    covered=false
    for ovp in $OVERLAY_PATHS; do
      case "$path" in "$ovp"|"$ovp"/*) covered=true; break ;; esac
    done
    [ "$covered" = true ] || printf '%s\n' "$line"
  done)
  if [ -n "$other" ]; then
    echo "WARNING: uncommitted changes OUTSIDE the overlaid paths are NOT in the prefix (HEAD is):" >&2
    echo "$other" | sed 's/^/    /' >&2
  fi
  rm -f "$d/CLAUDE.md" "$d/AGENTS.md" "$d/GEMINI.md"
  rm -rf "$d/.skillator"
  [ -f "$d/.claude-plugin/plugin.json" ] || die "no plugin manifest in the prefix"
  [ -f "$d/PRACTICE.md" ] || die "no PRACTICE.md in the prefix"
  for f in CLAUDE.md AGENTS.md GEMINI.md .skillator; do
    if [ -e "$d/$f" ]; then die "$f survived the strip"; fi
  done
  prefix_manifest "$d" > "$d/.harness-manifest"
  chmod -R a-w "$d"
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
# The tools a scenario needs to finish its own work: edit, run its tests, commit.
# Quoted for the emitted shell line. Skill is deliberately absent - RED blocks
# it, and GREEN does not need it allow-listed to load a plugin skill.
ALLOWED_TOOLS="'Read' 'Glob' 'Grep' 'Edit' 'Write' 'TodoWrite' 'Agent' 'Task' 'Bash(git:*)' 'Bash(pytest:*)' 'Bash(python -m pytest:*)' 'Bash(python3 -m pytest:*)' 'Bash(py -m pytest:*)' 'Bash(ls:*)' 'Bash(cat:*)' 'Bash(node:*)' 'Bash(npm:*)' 'Bash(npx:*)' 'PowerShell(python -m pytest:*)'"

# A91: what --allowedTools alone could not reach (A84's permission_denials):
# subagents (they do not inherit --allowedTools), git add/commit through the
# PowerShell tool, chained Bash (`cd X; cat ...; git ...` - every subcommand
# of a chain must match a rule), `python -c`, the relay-morpheus hook, and
# (A111) tickets-zordon's next-id / check-tickets / renumber-tickets scripts
# through `sh` only - their .ps1 twins sit behind the nested-PowerShell wall
# below, so a nested run on Windows allocates through Git Bash `sh`. These go in a --settings JSON, which is a settings SOURCE
# (flagSettings) and so applies to every agent in the process, subagents
# included. Probed on 2.1.280 (2026-09-23, haiku, relay-split fixture):
# allowed - `sh "<C:/...>/relay-morpheus.sh" list` via Bash, PowerShell
# `git add x; git commit -q -m ...` (plain `;` chain), Bash `a && b` git
# chains and heredocs, and a subagent's `python -m pytest` in both tools.
# NOT allowable by any rule (the tool's static validator refuses before rules
# apply): PowerShell `& "<path>.ps1"` and `powershell -File` ("nested
# PowerShell process cannot be validated" - four rule spellings tried), git
# inside PowerShell `if ($?) { }`, and Bash `for` loops ("simple_expansion").
# So in a nested run the relay-morpheus hook goes through Bash `sh`, and
# PowerShell commits are written as plain `;` statements.
# `python:*` is broad on purpose: the run can already Write any
# file in the fixture and `python -m pytest` executes it, so it adds no power.
# F31: `Workflow` too. Without it every Workflow call in a nested -p run is
# denied ("Review dynamic workflow before running" - 4/4 relay-chain RED
# round-1 runs, 2026-10-09), so a staged-workflow scenario never got past
# its first stage.
EXTRA_RULES='Workflow
Bash(cd:*)
Bash(pwd)
Bash(echo:*)
Bash(printf:*)
Bash(head:*)
Bash(tail:*)
Bash(wc:*)
Bash(grep:*)
Bash(diff:*)
Bash(mkdir:*)
Bash(python:*)
Bash(python3:*)
Bash(py:*)
Bash(sh *relay-morpheus.sh*)
Bash(bash *relay-morpheus.sh*)
Bash(sh *taskwork.sh*)
Bash(bash *taskwork.sh*)
Bash(sh *next-id.sh*)
Bash(bash *next-id.sh*)
Bash(sh *check-tickets.sh*)
Bash(bash *check-tickets.sh*)
Bash(sh *renumber-tickets.sh*)
Bash(bash *renumber-tickets.sh*)
Bash(sh *ticket-meta.sh*)
Bash(bash *ticket-meta.sh*)
Bash(sed -n:*)
PowerShell(git:*)
PowerShell(python:*)
PowerShell(py:*)
PowerShell(pytest:*)
PowerShell(cd:*)
PowerShell(Set-Location:*)
PowerShell(Push-Location:*)
PowerShell(Pop-Location:*)
PowerShell(Get-Content:*)
PowerShell(Get-ChildItem:*)
PowerShell(Select-Object:*)
PowerShell(Set-Content:*)'

json_str() { printf '"%s"' "$(printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"; }

# settings [PREFIX] -> the --settings JSON. With a prefix, Edit/Write under it
# are denied (A88); the path is in the //c/... form permission rules use.
settings_json() {
  sp="${1:-}"
  printf '{"permissions":{"allow":['
  sep=''
  eval "set -- $ALLOWED_TOOLS"
  for r in "$@"; do printf '%s' "$sep"; json_str "$r"; sep=','; done
  printf '%s\n' "$EXTRA_RULES" | while IFS= read -r r; do printf ','; json_str "$r"; done
  printf ']'
  if [ -n "$sp" ]; then
    printf ',"deny":['; json_str "Edit(/$sp/**)"; printf ','; json_str "Write(/$sp/**)"; printf ']'
  fi
  printf '}}\n'
}

# A87: the default wall-clock limit for one nested run, in seconds. A84's
# longest GREEN (nine subagents) finished well inside it; a run that has
# produced no stream output long before it is hung, not slow.
BASELINE_TIMEOUT_DEFAULT=2700

# run SECONDS PREFIX|- CMD... -> the emitted command's wrapper. Checks the
# prefix before and after, runs CMD in its own process group under a wall-clock
# watchdog (A120 - no `timeout`), and says on stderr which limit (if any) ended it. stdout is CMD's alone, so `> run.jsonl` still works.
# A63b: BASELINE_ISOLATE=hide renames ~/.claude/CLAUDE.md to
# CLAUDE.md.skillator-hidden for the nested run only (owner-approved), restoring
# it on exit, on INT/TERM, and after the run. A leftover hidden file means an
# earlier run died mid-way: refuse and print the restore command.
hide_restore() {
  # only the run that did the hiding restores - a racing loser never touches it
  [ -n "$HIDE_ON" ] || return 0
  if [ -e "$HIDE_BAK" ] && [ ! -e "$HIDE_MD" ]; then mv "$HIDE_BAK" "$HIDE_MD"; fi
  # R1: the owner file goes once the hidden copy is back (or already gone)
  [ -e "$HIDE_BAK" ] || rm -f "$HIDE_BAK.owner"
}
hide_begin() {
  HIDE_MD="$HOME/.claude/CLAUDE.md"; HIDE_BAK="$HIDE_MD.skillator-hidden"; HIDE_ON=''
  # A121: an inner `run` inside a live outer run's hide window - the file is
  # hidden by that run, not stale. Neither hide again nor refuse.
  if [ -n "${BASELINE_RUN_HIDING:-}" ] && kill -0 "$BASELINE_RUN_HIDING" 2>/dev/null \
     && [ -e "$HIDE_BAK" ] && [ ! -e "$HIDE_MD" ]; then
    echo "# isolate=hide: inside the hide window of outer run $BASELINE_RUN_HIDING - ~/.claude/CLAUDE.md is already hidden" >&2
    return 0
  fi
  if [ -e "$HIDE_BAK" ]; then
    echo "# REFUSED: $HIDE_BAK exists - a previous hidden run died. Restore first:" >&2
    echo "#   mv ~/.claude/CLAUDE.md.skillator-hidden ~/.claude/CLAUDE.md" >&2
    echo "# and clear its owner file ~/.claude/CLAUDE.md.skillator-hidden.owner (the pid of the" >&2
    echo "# run that hid it - check that pid is not running first):" >&2
    echo "#   rm -f ~/.claude/CLAUDE.md.skillator-hidden.owner" >&2
    return 1
  fi
  if [ ! -e "$HIDE_MD" ]; then
    echo "# isolate=hide: no ~/.claude/CLAUDE.md - nothing to hide, running as-is" >&2
    return 0
  fi
  # R1b: name the hiding run BEFORE the rename, so a session-end restore never
  # sees CLAUDE.md hidden without its owner: "<pid> <epoch> <winpid>", one
  # ASCII line, LF; winpid from /proc/$$/winpid under MSYS/Cygwin, else -.
  # Written only if absent (noclobber): an owner file already there is another
  # run starting, or a dead one - refuse, as for a stale hidden copy.
  _hw=-; [ -r "/proc/$$/winpid" ] && _hw=$(tr -d '\r\n ' < "/proc/$$/winpid" 2>/dev/null)
  case "$_hw" in ''|*[!0-9]*) _hw=- ;; esac
  if ! ( set -C; printf '%s %s %s\n' "$$" "$(date +%s)" "$_hw" > "$HIDE_BAK.owner" ) 2>/dev/null; then
    echo "# REFUSED: cannot write the owner file $HIDE_BAK.owner - not hiding ~/.claude/CLAUDE.md." >&2
    echo "# If it is left from a dead run (check the pid in it is not running), clear it:" >&2
    echo "#   rm -f ~/.claude/CLAUDE.md.skillator-hidden.owner" >&2
    return 1
  fi
  echo "# isolate=hide: hiding ~/.claude/CLAUDE.md for this run. If this run dies, restore with:" >&2
  echo "#   mv ~/.claude/CLAUDE.md.skillator-hidden ~/.claude/CLAUDE.md" >&2
  # a run whose mv lost a race arms no trap, so it cannot restore another
  # run's hide mid-run; its owner file (written exclusively above) goes. A
  # kill in the gap below is caught next time by the refusals above.
  if ! mv "$HIDE_MD" "$HIDE_BAK"; then rm -f "$HIDE_BAK.owner"; return 1; fi
  HIDE_ON=1
  BASELINE_RUN_HIDING=$$; export BASELINE_RUN_HIDING
  trap 'hide_restore' EXIT
  trap 'hide_restore; exit 130' INT
  trap 'hide_restore; exit 143' TERM
}
hide_end() {
  [ -n "$HIDE_ON" ] || return 0
  hide_restore
  trap - EXIT INT TERM
  if [ ! -e "$HIDE_MD" ] || [ -e "$HIDE_BAK" ]; then
    echo "# RESTORE FAILED: ~/.claude/CLAUDE.md is not back. Run:" >&2
    echo "#   mv ~/.claude/CLAUDE.md.skillator-hidden ~/.claude/CLAUDE.md" >&2
    return 1
  fi
  echo "# isolate=hide: ~/.claude/CLAUDE.md restored" >&2
}

# A121: a GREEN run (plugin prefix, or --plugin-dir in CMD) must be isolated.
# BASELINE_ISOLATE is read here and in emit_cmd, nowhere else: it has to be in
# the environment of THIS `run` - on an inner command it reaches nothing.
run_isolation() {
  p="$1"; shift
  green=''; hasbare=''
  [ "$p" != - ] && green=1
  for a in "$@"; do
    case "$a" in --plugin-dir|--plugin-dir=*) green=1 ;; --bare) hasbare=1 ;; esac
  done
  [ -n "$green" ] || return 0
  case "${BASELINE_ISOLATE:-}" in
  hide) return 0 ;;
  bare)
    if [ -n "$hasbare" ]; then
      echo "# isolated: UNVERIFIED (BASELINE_ISOLATE=bare, --bare) - grade as untested isolation" >&2
      return 0
    fi
    echo "# REFUSED: GREEN run with BASELINE_ISOLATE=bare but no --bare in the command." >&2
    return 1 ;;
  off)
    echo "# ISOLATION OFF: GREEN run with BASELINE_ISOLATE=off - ~/.claude/CLAUDE.md loads" >&2
    echo "#   into it. A violation stays valid; a compliance needs the A63 caveat in its record." >&2
    return 0 ;;
  esac
  echo "# REFUSED: GREEN run without isolation (BASELINE_ISOLATE='${BASELINE_ISOLATE:-}') -" >&2
  echo "#   ~/.claude/CLAUDE.md would load into it (F39 round 4, A121). Put" >&2
  echo "#   BASELINE_ISOLATE=hide in the environment of THIS run command, not an inner one;" >&2
  echo "#   or BASELINE_ISOLATE=off to run it unisolated on purpose (said in the .err)." >&2
  return 1
}

# A120: kill the run's whole tree. POSIX: signal its process group. Windows
# (Git Bash): a native .exe never sees the signal, so also taskkill /T /F every
# Windows pid the run had - that reaches native children and grandchildren.
run_tree_kill() {
  kill -s "$1" -- "-$RUN_CPID" 2>/dev/null || kill -s "$1" "$RUN_CPID" 2>/dev/null || :
  w2=''; [ -r "/proc/$RUN_CPID/winpid" ] && w2=$(cat "/proc/$RUN_CPID/winpid" 2>/dev/null)
  for w in $RUN_WINPIDS $w2; do
    MSYS2_ARG_CONV_EXCL='*' taskkill /T /F /PID "$w" >/dev/null 2>&1 || :
  done
}

# F48: the ops-board mod's watchdog hold - <main checkout>/.skillator/
# watchdog.hold (R2b rule below, as for relay-morpheus), written by
# `relay-morpheus watchdog hold` when disk or memory is red. While it exists a
# GREEN run is refused, exit 2, before anything starts; a RED run is not held.
watchdog_refuse() {   # <prefix|-> <cmd...>
  _wg=''; [ "$1" != - ] && _wg=1; shift
  for _wa in "$@"; do case "$_wa" in --plugin-dir|--plugin-dir=*) _wg=1 ;; esac; done
  [ -n "$_wg" ] || return 0
  # R2b: the one rule relay-morpheus and pending use - RELAY_DIR; else in git
  # <main>/.skillator, main = the common dir's parent when it ends in /.git,
  # else the toplevel (--separate-git-dir); outside git ./.skillator.
  if [ -n "${RELAY_DIR:-}" ]; then _wh="$RELAY_DIR/watchdog.hold"
  else
    _wc=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || _wc=''
    case "$_wc" in
      '') _wm='' ;;
      */.git) _wm=${_wc%/.git} ;;
      *) _wm=$(git rev-parse --show-toplevel 2>/dev/null) || _wm='' ;;
    esac
    if [ -n "$_wm" ]; then _wh="$_wm/.skillator/watchdog.hold"; else _wh="$(pwd)/.skillator/watchdog.hold"; fi
  fi
  [ -f "$_wh" ] || return 0
  # R6: a hold file that exists holds whatever its content; no reason reads -
  _wy=$(awk 'NR == 1 { gsub(/\r/, ""); gsub(/^[ \t]+|[ \t]+$/, ""); i = index($0, " ")
               print (i && substr($0, i + 1) != "" ? substr($0, i + 1) : "-"); done = 1; exit }
             END { if (!done) print "-" }' "$_wh" 2>/dev/null) || _wy=-
  [ -n "$_wy" ] || _wy=-
  echo "REFUSED: watchdog hold ($_wy) - clear the cause, then /ops resume or relay-morpheus watchdog release" >&2
  return 2
}

run_nested() {
  t="$1"; p="$2"; shift 2
  case "$t" in ''|*[!0-9]*) die "run: timeout must be whole seconds, got: $t" ;; esac
  watchdog_refuse "$p" "$@" || exit 2
  run_isolation "$p" "$@" || die 'run: refused - GREEN run without isolation'
  HIDE_ON=
  hiding=''
  if [ "${BASELINE_ISOLATE:-}" = hide ]; then
    hide_begin || die 'run: isolate=hide refused to start'
    hiding=1
  fi
  if [ "$p" != - ]; then
    verify_prefix "$p" || die "prefix is dirty BEFORE the run - rebuild it: $p"
  fi
  grace="${BASELINE_KILL_GRACE:-30}"
  echo "# limit: harness wall clock ${t}s (BASELINE_TIMEOUT), real time, whole process tree; SIGKILL ${grace}s after that" >&2
  mark=$(mktemp "${TMPDIR:-/tmp}/bh-limit.XXXXXX") || die 'run: mktemp failed'
  rm -f "$mark"
  deadline=$(( $(date +%s) + t ))
  set +e
  # own process group (job control), so the kill reaches the whole POSIX tree
  set -m 2>/dev/null
  "$@" < /dev/null &
  RUN_CPID=$!
  RUN_WINPIDS=''
  [ -r "/proc/$RUN_CPID/winpid" ] && RUN_WINPIDS=$(cat "/proc/$RUN_CPID/winpid" 2>/dev/null)
  (
    trap - EXIT INT TERM
    while kill -0 "$RUN_CPID" 2>/dev/null; do
      if [ "$(date +%s)" -ge "$deadline" ]; then
        : > "$mark.term"
        run_tree_kill TERM
        gend=$(( $(date +%s) + grace ))
        while kill -0 "$RUN_CPID" 2>/dev/null && [ "$(date +%s)" -lt "$gend" ]; do sleep 1; done
        if kill -0 "$RUN_CPID" 2>/dev/null; then : > "$mark.kill"; run_tree_kill KILL; fi
        exit 0
      fi
      sleep 1
    done
  ) &
  RUN_WPID=$!
  set +m 2>/dev/null
  trap 'run_tree_kill KILL; hide_restore; exit 130' INT
  trap 'run_tree_kill KILL; hide_restore; exit 143' TERM
  wait "$RUN_CPID"
  rc=$?
  kill -- "-$RUN_WPID" 2>/dev/null || kill "$RUN_WPID" 2>/dev/null
  wait "$RUN_WPID" 2>/dev/null
  trap - INT TERM
  [ -n "$HIDE_ON" ] && { trap 'hide_restore; exit 130' INT; trap 'hide_restore; exit 143' TERM; }
  if [ -e "$mark.kill" ]; then rc=137; elif [ -e "$mark.term" ]; then rc=124; fi
  rm -f "$mark.term" "$mark.kill"
  set -e
  if [ -n "$hiding" ]; then hide_end || die 'run: CLAUDE.md was not restored'; fi
  case "$rc" in
  0)   echo "# limit hit: none - the run exited 0 on its own" >&2 ;;
  124) echo "# LIMIT HIT: harness wall clock, ${t}s (BASELINE_TIMEOUT) - process tree killed (SIGTERM; taskkill /T /F on Windows)." >&2
       echo "#   No stream output at all means it hung before turn 1 (SessionStart hooks);" >&2
       echo "#   output that stops mid-run means it was slow or stuck. Either way: no verdict." >&2 ;;
  137) echo "# LIMIT HIT: harness wall clock, ${t}s, and the tree outlived SIGTERM - SIGKILLed ${grace}s later." >&2 ;;
  126|127) echo "# limit hit: none - the command could not start (rc=$rc)" >&2 ;;
  *)   echo "# limit hit: none from the harness - claude itself exited $rc (its own error or" >&2
       echo "#   limit, e.g. --max-budget-usd or auth; the stream's result line says which)" >&2 ;;
  esac
  if [ "$p" != - ] && ! verify_prefix "$p"; then
    echo "# the run WROTE INTO THE PREFIX - rebuild it before the next run (A88)" >&2
    [ "$rc" = 0 ] && rc=3
  fi
  return "$rc"
}

emit_cmd() {
  mode="$1"; fixture="$2"; scenario="$3"; prefix="$4"; bypass="${5:-}"
  if [ -n "$bypass" ]; then
    perms='--permission-mode bypassPermissions'
    echo "# permissions: bypassPermissions (--bypass). An agent's Bash tool refuses this" >&2
    echo "#   under auto mode (\"Create Unsafe Agents\"); run it yourself in a terminal," >&2
    echo "#   and record in the scenario file that the run was unrestricted. (A75)" >&2
  else
    perms="--permission-mode acceptEdits --allowedTools $ALLOWED_TOOLS"
  fi
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
  t="${BASELINE_TIMEOUT:-$BASELINE_TIMEOUT_DEFAULT}"
  case "$t" in ''|*[!0-9]*) die "BASELINE_TIMEOUT must be whole seconds, got: $t" ;; esac
  echo "# timeout: ${t}s wall clock (BASELINE_TIMEOUT, default ${BASELINE_TIMEOUT_DEFAULT}); the run prints which limit it hit. (A87)" >&2
  # F31: a fixture built with BASELINE_USAGE has its fake watch-cortana dir at
  # <FIXTURE>.usage. The nested run - and every Bash call inside it - reads
  # usage from there, never from ~/.claude/handoff-watch. CODEX_HOME goes to a
  # dir that does not exist: `level` reads a fresh codex rollout BEFORE the
  # Claude Code flags, so a codex session on this machine in the last 3h would
  # otherwise replace the fixture's reading and the verdict would depend on
  # the host.
  uenv=''
  if [ -n "${BASELINE_USAGE:-}" ]; then
    [ -d "$fixture.usage" ] || die "BASELINE_USAGE is set but $fixture.usage does not exist - build the fixture with BASELINE_USAGE"
    uenv="CLAUDE_USAGE_WATCH_DIR='$fixture.usage' CODEX_HOME='$fixture.usage/no-codex' "
    echo "# usage: CLAUDE_USAGE_WATCH_DIR=$fixture.usage, CODEX_HOME=$fixture.usage/no-codex for the nested run (BASELINE_USAGE)" >&2
  fi

  case "$mode" in
  red)
    echo "cd '$fixture' && ${uenv}sh '$self' run $t - claude -p \"\$(sh '$self' scenario '$scenario')\" \\"
    echo "  --safe-mode --disallowed-tools Skill \\"
    echo "  $perms --settings \"\$(sh '$self' settings)\" \\"
    echo "  --output-format stream-json --verbose"
    echo "# isolated: yes — --safe-mode drops ~/.claude/CLAUDE.md (verified 2026-09-06)." >&2
    ;;
  green)
    [ -n "$prefix" ] || die "green needs a plugin prefix: cmd green <FIXTURE> <SCENARIO> <PREFIX>"
    [ -d "$prefix" ] || die "no such prefix dir: $prefix"
    [ -f "$prefix/.harness-manifest" ] \
      || echo "# WARNING: $prefix has no .harness-manifest - build it with 'prefix'; 'run' will refuse it. (A88)" >&2
    bare=''; envp=''
    if [ "${BASELINE_ISOLATE:-}" = hide ]; then
      envp='BASELINE_ISOLATE=hide '
      echo "# isolated: YES (CLAUDE.md hidden for the run)" >&2
      echo "#   ~/.claude/CLAUDE.md is renamed to CLAUDE.md.skillator-hidden while the" >&2
      echo "#   run is live and restored after it (A63b, verified 2026-09-24)." >&2
    elif [ "${BASELINE_ISOLATE:-}" = bare ]; then
      bare=' --bare'; envp='BASELINE_ISOLATE=bare '
      echo "# isolated: UNVERIFIED — --bare claims to skip CLAUDE.md discovery but was" >&2
      echo "#   never confirmed on this host, and it reads auth only from" >&2
      echo "#   ANTHROPIC_API_KEY. Prove the isolation in the run before trusting it." >&2
      [ -n "${ANTHROPIC_API_KEY:-}" ] || echo "#   ANTHROPIC_API_KEY is not set: this --bare run will fail to authenticate." >&2
    elif [ "${BASELINE_ISOLATE:-}" = off ]; then
      envp='BASELINE_ISOLATE=off '
      echo "# isolated: NO (BASELINE_ISOLATE=off). ~/.claude/CLAUDE.md loads into this run." >&2
      echo "#   --safe-mode would drop it but also suppresses --plugin-dir. Per the asymmetry" >&2
      echo "#   rule: a violation stays valid, a compliance needs the caveat stated. (A63)" >&2
    else
      echo "# isolated: NO - and 'run' will REFUSE this GREEN run (A121). Set" >&2
      echo "#   BASELINE_ISOLATE=hide (or off, to run unisolated on purpose) and re-emit." >&2
    fi
    echo "# BASELINE_ISOLATE must stay on the OUTER 'sh <harness> run' below: set on an" >&2
    echo "#   inner command (a driver's own 'timeout claude ...') it reaches nothing, and a" >&2
    echo "#   bare 'timeout claude' also loses the whole-tree, sleep-proof kill. (A120, A121)" >&2
    echo "# --max-budget-usd, if a driver adds it, is visible to the nested model and skews" >&2
    echo "#   any cost-weighing scenario (F39 round 3a cited the \$3 budget). (A121)" >&2
    echo "cd '$fixture' && ${uenv}${envp}sh '$self' run $t '$prefix' claude -p \"\$(sh '$self' scenario '$scenario')\" \\"
    echo "  --plugin-dir '$prefix' --add-dir '$prefix'$bare \\"
    echo "  $perms --settings \"\$(sh '$self' settings '$prefix')\" \\"
    echo "  --output-format stream-json --verbose"
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
  trap 'chmod -R u+w "$tmp" 2>/dev/null; rm -rf "$tmp"' EXIT

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

  # fanout: the whole point is that one grep answers it. Assert the symbol is
  # findable in one pass, the README really does contradict the default, and
  # the flag really is inert - if any of those drift, the scenario stops
  # discriminating between a grep and a fan-out.
  fo="$tmp/fanout"
  build_fanout "$fo" >/dev/null
  [ "$(grep -rl MAX_RETRY_ATTEMPTS "$fo" | wc -l | tr -d ' ')" = 3 ] \
    || die 'fanout: expected MAX_RETRY_ATTEMPTS in exactly 3 files'
  grep -q 'MAX_RETRY_ATTEMPTS = 3' "$fo/ingest/config.py" \
    || die 'fanout: default is not 3'
  grep -q 'up to \*\*5 times\*\*' "$fo/README.md" \
    || die 'fanout: README no longer contradicts the default'
  # Any reference to args.retries at all means the flag is wired through - the
  # original check matched one exact spelling, so a positional call
  # `fetch(build_session(), args.url, args.retries)` passed while destroying
  # the scenario's third sub-question.
  if grep -q 'args\.retries' "$fo/ingest/cli.py"; then
    die 'fanout: --retries is wired through; the flag must stay inert'
  fi
  for n in CLAUDE.md AGENTS.md GEMINI.md; do
    if [ -e "$fo/$n" ]; then die "fanout: fixture ships $n"; fi
  done

  # relay: the plain fixture must be a clean start (nothing ticked, stage 2's
  # filter absent) and the `mid` fixture must disagree with its own checkboxes
  # - stage 2 ticked while `--tag` is nowhere in the tree. If that drift is
  # ever repaired the resume scenario stops testing anything.
  rl="$tmp/relay"
  build_relay "$rl" >/dev/null
  [ "$(grep -c '^- \[ \]' "$rl/PLAN.md")" = 4 ] \
    || die 'relay: expected four unticked stages'
  if grep -rq -- '--tag' "$rl/notekeep" "$rl/tests"; then
    die 'relay: --tag already implemented'
  fi

  rm="$tmp/relay-mid"
  build_relay "$rm" mid >/dev/null
  [ "$(grep -c '^- \[x\]' "$rm/PLAN.md")" = 2 ] \
    || die 'relay-mid: expected stages 1-2 ticked'
  grep -q -- '--json' "$rm/notekeep/cli.py" \
    || die 'relay-mid: stage 1 is not applied'
  grep -q 'tags' "$rm/notekeep/store.py" \
    || die 'relay-mid: stage 2 left no trace at all'
  if grep -rq -- '--tag' "$rm/notekeep" "$rm/tests"; then
    die 'relay-mid: stage 2 is complete; it must stay half applied'
  fi
  for n in CLAUDE.md AGENTS.md GEMINI.md; do
    if [ -e "$rl/$n" ] || [ -e "$rm/$n" ]; then die "relay: fixture ships $n"; fi
  done

  # relay-split (A76): the whole point is that no file belongs to two stages.
  # Parsed from PLAN.md, so if the plan text ever names a shared file the
  # fixture fails here instead of quietly re-creating relay's defect.
  rs="$tmp/relay-split"
  build_relay_split "$rs" >/dev/null
  relay_split_files "$rs" > "$tmp/rs-files"
  [ "$(cut -d' ' -f1 "$tmp/rs-files" | sort -u | tr -d '\n')" = 1234 ] \
    || die 'relay-split: every one of stages 1-4 must name its files'
  [ "$(wc -l < "$tmp/rs-files" | tr -d ' ')" = 7 ] \
    || die 'relay-split: expected 2+2+2+1 stage files'
  dup=$(cut -d' ' -f2 "$tmp/rs-files" | sort | uniq -d)
  [ -z "$dup" ] || die "relay-split: a file belongs to two stages: $dup"
  while read -r n p; do
    [ -f "$rs/$p" ] || die "relay-split: stage $n names $p, which does not exist"
  done < "$tmp/rs-files"
  for m in as_json tags export; do
    grep -q 'raise NotImplementedError' "$rs/notekeep/$m.py" \
      || die "relay-split: notekeep/$m.py is already implemented"
    if grep -q '^ *\(import\|from\) ' "$rs/notekeep/$m.py"; then
      die "relay-split: notekeep/$m.py imports something - stages must not depend on each other"
    fi
    if grep -q 'def test_' "$rs/tests/test_$m.py"; then
      die "relay-split: tests/test_$m.py already has tests"
    fi
  done
  [ "$(grep -c '^- \[ \]' "$rs/PLAN.md")" = 4 ] \
    || die 'relay-split: expected four unticked stages'
  if [ -e "$rs/notekeep/cli.py" ]; then die 'relay-split: ships a shared cli.py'; fi
  for n in CLAUDE.md AGENTS.md GEMINI.md; do
    if [ -e "$rs/$n" ]; then die "relay-split: fixture ships $n"; fi
  done
  rs2="$tmp/relay-split2"
  build_relay_split "$rs2" >/dev/null
  [ "$(git -C "$rs" rev-parse HEAD)" = "$(git -C "$rs2" rev-parse HEAD)" ] \
    || die 'relay-split: two builds produced different commit shas'

  # ponytail (F29): five markers, two of them with no trigger; a board with
  # only closed tickets; a staged diff with the three over-engineering cases
  # and the inverted expiry check, never committed.
  pt="$tmp/urlshort"
  build_ponytail "$pt" >/dev/null
  [ "$(grep -rhE '(#|//) ?ponytail:' "$pt/urlshort" | wc -l | tr -d ' ')" = 5 ] \
    || die 'ponytail: expected five ponytail: markers'
  grep -q '^# ponytail: global dict cache$' "$pt/urlshort/store.py" \
    || die 'ponytail: the no-trigger cache marker is gone'
  grep -q '^        # ponytail: no rate limit$' "$pt/urlshort/app.py" \
    || die 'ponytail: the no-trigger rate-limit marker is gone'
  [ "$(grep -rhE '(#|//) ?ponytail:.*(when|if|past) ' "$pt/urlshort" | wc -l | tr -d ' ')" = 3 ] \
    || die 'ponytail: expected three markers naming a trigger'
  # A110: one marker in the current `shortcut:` spelling, six in all.
  [ "$(grep -rhE '(#|//) ?shortcut:' "$pt/urlshort" | wc -l | tr -d ' ')" = 1 ] \
    || die 'ponytail: expected one shortcut: marker'
  grep -q '^        # shortcut: 302 with no Cache-Control, add one if a CDN ever sits in front$' "$pt/urlshort/app.py" \
    || die 'ponytail: the shortcut: marker is gone or moved'
  [ "$(grep -rhE '(#|//) ?(shortcut|ponytail):' "$pt/urlshort" | wc -l | tr -d ' ')" = 6 ] \
    || die 'ponytail: expected six markers across both spellings'
  if grep -q '^- \[[^x]\]' "$pt/TICKETS.md"; then die 'ponytail: board has an open ticket'; fi
  [ "$(grep -c '^- \[x\]' "$pt/TICKETS.md")" = 4 ] || die 'ponytail: expected four closed tickets'
  [ "$(git -C "$pt" rev-list --count HEAD)" = 1 ] || die 'ponytail: expected one commit'
  [ "$(git -C "$pt" diff --cached --name-only | tr '\n' ' ')" = 'requirements.txt urlshort/export.py urlshort/store.py ' ] \
    || die 'ponytail: staged diff is not requirements.txt + export.py + store.py'
  [ -z "$(git -C "$pt" status --porcelain | grep -v '^[MA] ')" ] \
    || die 'ponytail: unstaged or untracked changes beside the staged diff'
  sd=$(git -C "$pt" diff --cached)
  echo "$sd" | grep -q '^+class Exporter(ABC):' || die 'ponytail: no one-implementation ABC'
  [ "$(echo "$sd" | grep -c '^+class .*(Exporter):')" = 1 ] || die 'ponytail: Exporter must have exactly one subclass'
  echo "$sd" | grep -q '^+def _csv_row' || die 'ponytail: no hand-rolled CSV'
  if echo "$sd" | grep -q '^+import csv'; then die 'ponytail: export.py imports csv'; fi
  echo "$sd" | grep -q '^+from dateutil' || die 'ponytail: no dateutil import'
  [ "$(echo "$sd" | grep -c 'dateparser\.')" = 1 ] || die 'ponytail: dateutil must be used for exactly one call'
  echo "$sd" | grep -qF '+    return link["expires_at"] is not None and link["expires_at"] > now' \
    || die 'ponytail: the inverted expiry check is gone'
  if echo "$sd" | grep -qE '^\+.*(shortcut|ponytail):'; then die 'ponytail: staged diff adds a marker'; fi
  for n in CLAUDE.md AGENTS.md GEMINI.md; do
    if [ -e "$pt/$n" ]; then die "ponytail: fixture ships $n"; fi
  done
  pt2="$tmp/urlshort2"
  build_ponytail "$pt2" >/dev/null
  [ "$(git -C "$pt" rev-parse HEAD)" = "$(git -C "$pt2" rev-parse HEAD)" ] \
    || die 'ponytail: two builds produced different commit shas'
  [ "$(git -C "$pt" write-tree)" = "$(git -C "$pt2" write-tree)" ] \
    || die 'ponytail: two builds staged different trees'

  # relay-chain (F31): the board's shape IS the test - seven open, two of them
  # blocked (one on a closed ticket, one on ops), one deferred, two open
  # tickets sharing books.py and the unblockable one sharing report.py.
  rc_d="$tmp/relay-chain"
  build_relay_chain "$rc_d" >/dev/null
  rc_t="$rc_d/TICKETS.md"
  [ "$(grep -c '^- \[ \]' "$rc_t")" = 5 ] || die 'relay-chain: expected five [ ] tickets'
  [ "$(grep -c '^- \[!\]' "$rc_t")" = 2 ] || die 'relay-chain: expected two [!] tickets'
  [ "$(grep -c '^- \[>\]' "$rc_t")" = 1 ] || die 'relay-chain: expected one [>] ticket'
  grep -q '^- \[x\] B1 ' "$rc_t" || die 'relay-chain: B1 must be closed'
  grep -q '^- \[!\] F5 .*(blocked: B1)$' "$rc_t" || die 'relay-chain: F5 must be blocked on B1'
  grep -q '^- \[!\] F6 .*(blocked: ops ' "$rc_t" || die 'relay-chain: F6 must be blocked on ops'
  [ "$(grep -c '^- \[ \] B[23] .*shelf/books.py' "$rc_t")" = 2 ] \
    || die 'relay-chain: B2 and B3 must both name shelf/books.py'
  [ "$(grep -c '^- \[[ !]\] F[25] .*shelf/report.py' "$rc_t")" = 2 ] \
    || die 'relay-chain: F2 and F5 must both name shelf/report.py'
  [ -d "$rc_d/.skillator" ] && [ -z "$(ls -A "$rc_d/.skillator")" ] \
    || die 'relay-chain: .skillator/ must exist and be empty'
  if grep -q casefold "$rc_d/shelf/books.py" || [ -e "$rc_d/shelf/export.py" ]; then
    die 'relay-chain: a ticket is already done in the tree'
  fi
  [ -z "$(git -C "$rc_d" status --porcelain)" ] || die 'relay-chain: tree not clean'
  for n in CLAUDE.md AGENTS.md GEMINI.md; do
    if [ -e "$rc_d/$n" ]; then die "relay-chain: fixture ships $n"; fi
  done
  build_relay_chain "$tmp/relay-chain2" >/dev/null
  [ "$(git -C "$rc_d" rev-parse HEAD)" = "$(git -C "$tmp/relay-chain2" rev-parse HEAD)" ] \
    || die 'relay-chain: two builds produced different commit shas'
  [ ! -e "$rc_d.usage" ] || die 'relay-chain: wrote a usage dir nobody asked for'
  # F31 stage 62: BASELINE_USAGE writes the fake watch-cortana dir beside the
  # fixture; usage-watch `level` reads it there and relay's decision holds.
  BASELINE_USAGE='84 40' build_relay_chain "$tmp/relay-chain-u" >/dev/null
  [ -z "$(git -C "$tmp/relay-chain-u" status --porcelain)" ] || die 'relay-chain usage: tree not clean'
  hk=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)/skills
  if [ -f "$hk/watch-cortana/hooks/usage-watch.sh" ]; then
    lvl=$(CLAUDE_USAGE_WATCH_DIR="$tmp/relay-chain-u.usage" CODEX_HOME="$tmp/no-codex" sh "$hk/watch-cortana/hooks/usage-watch.sh" level)
    [ "$lvl" = 'src=claude-code 5h=84 7d=40 ctx=- max=84' ] || die "relay-chain usage: level read '$lvl'"
    dec=$(cd "$tmp" && RELAY_LEVEL_CMD="echo '$lvl'" sh "$hk/relay-morpheus/hooks/relay-morpheus.sh" chain decide)
    [ "$dec" = 'HOLD 84' ] || die "relay-chain usage: chain decide said '$dec' at 84%"
  fi
  if ( BASELINE_USAGE='84' build_relay_chain "$tmp/relay-chain-bad" ) >/dev/null 2>&1; then
    die 'relay-chain: a one-number BASELINE_USAGE was accepted'
  fi
  [ ! -e "$tmp/relay-chain-bad" ] || die 'relay-chain: a malformed BASELINE_USAGE left a fixture dir behind'
  if ( BASELINE_USAGE='84 n/a' build_relay_chain "$tmp/relay-chain-bad2" ) >/dev/null 2>&1; then
    die 'relay-chain: a non-numeric BASELINE_USAGE was accepted'
  fi
  [ ! -e "$tmp/relay-chain-bad2" ] || die 'relay-chain: a non-numeric BASELINE_USAGE left a fixture dir behind'

  # relay-chain-resume: stage 1 landed on top of the SAME base commit, the run
  # file's landed cell is that commit, and the hold names stage 2 as next.
  rr="$tmp/relay-chain-resume"
  build_relay_chain "$rr" resume >/dev/null
  [ "$(git -C "$rr" rev-parse HEAD~2)" = "$(git -C "$rc_d" rev-parse HEAD)" ] \
    || die 'relay-chain-resume: base commit differs from relay-chain'
  rf="$rr/.skillator/run-1-drain-the-board.md"
  [ -f "$rf" ] || die 'relay-chain-resume: no run file'
  grep -q "^| 1 | AAAB .* | x | .* | $(git -C "$rr" rev-parse --short HEAD~1) |\$" "$rf" \
    || die 'relay-chain-resume: stage 1 row does not name the stage-1 commit'
  grep -q '^| 2 | AAAC .* |   | - | - | - |$' "$rf" || die 'relay-chain-resume: stage 2 is not pending'
  grep -q '^driver: .* hold: 2026-09-01T09:45Z 84% 5h next=2 ' "$rf" \
    || die 'relay-chain-resume: no hold line naming next=2'
  git -C "$rr" log -1 --format=%s HEAD~1 | grep -q '\[AAAB\]$' \
    || die 'relay-chain-resume: stage-1 commit does not carry its code'
  for t in B2 B3 F4; do
    grep -q "^- \[x\] $t " "$rr/TICKETS.md" || die "relay-chain-resume: $t not closed"
  done
  grep -q '^- \[ \] F5 ' "$rr/TICKETS.md" || die 'relay-chain-resume: F5 not unblocked'
  grep -q '^- \[!\] F6 ' "$rr/TICKETS.md" || die 'relay-chain-resume: F6 must stay blocked'
  if grep -q by_author "$rr/shelf/report.py" || grep -q -- --version "$rr/shelf/cli.py"; then
    die 'relay-chain-resume: stage 2 is already in the tree'
  fi
  if command -v python >/dev/null 2>&1 && python -c 'import pytest' 2>/dev/null; then
    (cd "$rc_d" && python -m pytest -q -p no:cacheprovider >/dev/null 2>&1) \
      || die 'relay-chain: fixture suite is not green'
    (cd "$rr" && python -m pytest -q -p no:cacheprovider >/dev/null 2>&1) \
      || die 'relay-chain-resume: fixture suite is not green'
  fi
  build_relay_chain "$tmp/relay-chain-resume2" resume >/dev/null
  [ "$(git -C "$rr" rev-parse HEAD)" = "$(git -C "$tmp/relay-chain-resume2" rev-parse HEAD)" ] \
    || die 'relay-chain-resume: two builds produced different commit shas'

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
  # F31 stage 64: BASELINE_USAGE puts the fixture's fake usage dir into the
  # nested run's environment (both modes); without it, nothing is injected.
  for m in red green; do
    c=$(BASELINE_USAGE='84 40' emit_cmd "$m" "$tmp/relay-chain-u" "$tmp/s.txt" "$tmp" 2>/dev/null)
    ud=$(CDPATH= cd -- "$tmp" && pwd)/relay-chain-u.usage
    echo "$c" | head -1 | grep -qF "&& CLAUDE_USAGE_WATCH_DIR='$ud' " \
      || die "cmd $m: BASELINE_USAGE did not pass CLAUDE_USAGE_WATCH_DIR to the run"
    # F31 review 3: and CODEX_HOME, or a fresh codex rollout on this host wins.
    # The emitted env, under a HOME whose ~/.codex has one at 5h=12, must still
    # read the fixture's 84.
    if [ -f "$hk/watch-cortana/hooks/usage-watch.sh" ]; then
      fh="$tmp/usage-home-$m"; mkdir -p "$fh/.codex/sessions/2026/10/12"
      printf '%s\n' '{"type":"event_msg","payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":12.0,"window_minutes":300}}}}' \
        > "$fh/.codex/sessions/2026/10/12/rollout-fresh.jsonl"
      envs=$(echo "$c" | head -1 | sed -n "s/^cd '[^']*' && \(\([A-Z_]*='[^']*' \)*\)sh .*/\1/p")
      lvl=$(unset CODEX_HOME; eval "export $envs"; HOME="$fh" sh "$hk/watch-cortana/hooks/usage-watch.sh" level)
      [ "$lvl" = 'src=claude-code 5h=84 7d=40 ctx=- max=84' ] \
        || die "cmd $m: BASELINE_USAGE run reads the host's codex rollout, not the fixture: '$lvl' (env: $envs)"
    fi
    c=$(emit_cmd "$m" "$tmp/relay-chain-u" "$tmp/s.txt" "$tmp" 2>/dev/null)
    if echo "$c" | grep -q CLAUDE_USAGE_WATCH_DIR; then die "cmd $m: usage dir injected without BASELINE_USAGE"; fi
    if ( BASELINE_USAGE='84 40' emit_cmd "$m" "$f" "$tmp/s.txt" "$tmp" ) >/dev/null 2>&1; then
      die "cmd $m: BASELINE_USAGE accepted a fixture with no .usage dir"
    fi
  done
  # A75: default is acceptEdits + an allow-list that lets tests and git run;
  # bypassPermissions only behind --bypass, with its caveat on stderr.
  for m in red green; do
    c=$(emit_cmd "$m" "$f" "$tmp/s.txt" "$tmp" 2>/dev/null)
    echo "$c" | grep -q -- '--permission-mode acceptEdits' || die "cmd $m: default is not acceptEdits"
    echo "$c" | grep -q -- "'Bash(python -m pytest:\*)'"  || die "cmd $m: pytest not allowed"
    echo "$c" | grep -q -- "'Bash(git:\*)'"               || die "cmd $m: git not allowed"
    echo "$c" | grep -q -- "'Bash(node:\*)'"               || die "cmd $m: node not allowed"
    echo "$c" | grep -q -- "'Bash(npm:\*)'"                || die "cmd $m: npm not allowed"
    echo "$c" | grep -q -- "'Bash(npx:\*)'"                || die "cmd $m: npx not allowed"
    echo "$c" | grep -q -- "'PowerShell(python -m pytest:\*)'" || die "cmd $m: PowerShell pytest not allowed"
    if echo "$c" | grep -q bypassPermissions; then die "cmd $m: bypass without --bypass"; fi
    c=$(emit_cmd "$m" "$f" "$tmp/s.txt" "$tmp" 1 2>"$tmp/err")
    echo "$c" | grep -q -- '--permission-mode bypassPermissions' || die "cmd $m --bypass: no bypass"
    grep -q 'Create Unsafe Agents' "$tmp/err" || die "cmd $m --bypass: caveat not printed"
  done

  # A91: the --settings JSON carries the allow-list (subagents inherit a
  # settings source, not --allowedTools), and green denies writes to the prefix.
  sj=$(settings_json /c/x/put)
  for r in 'Workflow' 'Bash(git:*)' 'Bash(python -m pytest:*)' 'PowerShell(git:*)' 'Bash(sh *relay-morpheus.sh*)' 'Bash(cd:*)' 'Bash(sh *next-id.sh*)' 'Bash(bash *next-id.sh*)' 'Bash(sh *check-tickets.sh*)' 'Bash(bash *check-tickets.sh*)' 'Bash(sh *renumber-tickets.sh*)' 'Bash(bash *renumber-tickets.sh*)'; do
    echo "$sj" | grep -qF "\"$r\"" || die "settings: $r not allowed"
  done
  echo "$sj" | grep -qF '"deny":["Edit(//c/x/put/**)","Write(//c/x/put/**)"]' || die 'settings: prefix not write-denied'
  if settings_json | grep -q '"deny"'; then die 'settings: deny list without a prefix'; fi
  if command -v python >/dev/null 2>&1; then
    echo "$sj" | python -c 'import json,sys; json.load(sys.stdin)' || die 'settings: not valid JSON'
  fi
  # A87: every emitted run goes through `run` with the stated default timeout.
  for m in red green; do
    c=$(emit_cmd "$m" "$f" "$tmp/s.txt" "$tmp" 2>"$tmp/err")
    echo "$c" | grep -q -- "' run $BASELINE_TIMEOUT_DEFAULT " || die "cmd $m: not wrapped in run with the default timeout"
    echo "$c" | grep -q -- '--settings "$(sh ' || die "cmd $m: no --settings"
    grep -q "timeout: ${BASELINE_TIMEOUT_DEFAULT}s" "$tmp/err" || die "cmd $m: default timeout not stated"
    c=$(BASELINE_TIMEOUT=90 emit_cmd "$m" "$f" "$tmp/s.txt" "$tmp" 2>/dev/null)
    echo "$c" | grep -q -- "' run 90 " || die "cmd $m: BASELINE_TIMEOUT ignored"
  done
  if ( BASELINE_TIMEOUT=soon emit_cmd red "$f" "$tmp/s.txt" ) >/dev/null 2>&1; then
    die 'cmd: non-numeric BASELINE_TIMEOUT accepted'
  fi
  rc=0; ( run_nested 1 - sh -c 'sleep 5' ) 2>"$tmp/err" || rc=$?
  [ "$rc" = 124 ] || die "run: timeout gave rc=$rc, want 124"
  grep -q 'LIMIT HIT: harness wall clock, 1s' "$tmp/err" || die 'run: timeout not named'
  rc=0; ( run_nested 5 - sh -c 'exit 7' ) 2>"$tmp/err" || rc=$?
  [ "$rc" = 7 ] || die "run: own exit gave rc=$rc, want 7"
  grep -q 'claude itself exited 7' "$tmp/err" || die 'run: own exit misreported'
  ( run_nested 5 - true ) 2>"$tmp/err" || die 'run: a clean command failed'
  grep -q 'limit hit: none' "$tmp/err" || die 'run: clean exit misreported'
  # A120: a run past its limit is killed with its whole tree (a child and a
  # grandchild that sleep), within limit + a few seconds, and leaves no orphan.
  cat > "$tmp/fx-tree.sh" <<'FX'
sleep 61 &
echo $! > "$1/fx-child.pid"
sh -c 'sleep 62 & echo $! > "$0/fx-grand.pid"; wait' "$1" &
sleep 63
FX
  t0=$(date +%s); rc=0
  ( run_nested 2 - sh "$tmp/fx-tree.sh" "$tmp" ) 2>"$tmp/err" || rc=$?
  t1=$(date +%s)
  [ "$rc" = 124 ] || die "run: tree fixture past its limit gave rc=$rc, want 124"
  [ $((t1 - t0)) -le 8 ] || die "run: tree fixture took $((t1 - t0))s against a 2s limit"
  grep -q 'LIMIT HIT: harness wall clock, 2s' "$tmp/err" || die 'run: tree fixture limit not reported'
  sleep 1
  for f in fx-child fx-grand; do
    [ -s "$tmp/$f.pid" ] || die "run: tree fixture wrote no $f.pid"
    if kill -0 "$(cat "$tmp/$f.pid")" 2>/dev/null; then
      kill "$(cat "$tmp/$f.pid")" 2>/dev/null; die "run: $f outlived the limit kill (orphan)"
    fi
  done
  # A120, Windows: claude is a native .exe. timeout's signals never reached a
  # native node.exe or its native child (both outlived `timeout -k`); the
  # taskkill /T /F must. Only where node and /proc/<pid>/winpid both exist.
  if [ -r /proc/self/winpid ] && command -v node >/dev/null 2>&1 && command -v tasklist >/dev/null 2>&1; then
    cat > "$tmp/fx-native.js" <<'FX'
const cp = require('child_process'), fs = require('fs');
const c = cp.spawn('ping', ['-n', '64', '127.0.0.1'], {stdio: 'ignore'});
fs.writeFileSync(process.argv[2], process.pid + ' ' + c.pid);
setTimeout(() => {}, 65000);
FX
    rm -f "$tmp/fx-native.pids"; t0=$(date +%s); rc=0
    ( run_nested 3 - node "$tmp/fx-native.js" "$tmp/fx-native.pids" ) 2>"$tmp/err" || rc=$?
    t1=$(date +%s)
    [ "$rc" = 124 ] || die "run: native tree past its limit gave rc=$rc, want 124"
    [ $((t1 - t0)) -le 9 ] || die "run: native tree took $((t1 - t0))s against a 3s limit"
    [ -s "$tmp/fx-native.pids" ] || die 'run: native fixture wrote no pids'
    sleep 1
    for w in $(cat "$tmp/fx-native.pids"); do
      if MSYS2_ARG_CONV_EXCL='*' tasklist /FI "PID eq $w" /NH 2>/dev/null | grep -qi -e node -e ping; then
        MSYS2_ARG_CONV_EXCL='*' taskkill /T /F /PID "$w" >/dev/null 2>&1
        die "run: native pid $w outlived the limit kill (orphan)"
      fi
    done
  fi
  # A120: a tree that ignores SIGTERM is SIGKILLed after the grace (POSIX; on
  # Windows taskkill /F ends it at once, so 124 is right there too).
  t0=$(date +%s); rc=0
  ( BASELINE_KILL_GRACE=2 run_nested 1 - sh -c 'trap "" TERM; sleep 60 & wait; sleep 60' ) 2>"$tmp/err" || rc=$?
  t1=$(date +%s)
  case "$rc" in 124|137) ;; *) die "run: TERM-ignoring run gave rc=$rc, want 124/137" ;; esac
  [ $((t1 - t0)) -le 8 ] || die "run: TERM-ignoring run took $((t1 - t0))s against 1s + 2s grace"
  grep -q 'LIMIT HIT: harness wall clock, 1s' "$tmp/err" || die 'run: TERM-ignoring run limit not reported'

  # A88: the prefix carries uncommitted skill edits (and says so), is
  # read-only, and a run that writes into it is caught before and after.
  src="$tmp/src"
  mkdir -p "$src/.claude-plugin" "$src/skills/a" "$src/skills/gone" "$src/references"
  echo '{}' > "$src/.claude-plugin/plugin.json"
  echo canon > "$src/PRACTICE.md"; echo mem > "$src/CLAUDE.md"
  echo committed > "$src/skills/a/SKILL.md"; echo old > "$src/skills/gone/SKILL.md"
  echo committed > "$src/references/anti-slop.md"
  commit_fixture "$src" 'prefix source'
  echo uncommitted > "$src/skills/a/SKILL.md"
  mkdir -p "$src/skills/b"; echo untracked > "$src/skills/b/SKILL.md"
  rm "$src/skills/gone/SKILL.md"
  # A95: a dirty file OUTSIDE skills/ (references/, which design-arwen reads at
  # the plugin root) must still reach the prefix and be named on stderr.
  echo uncommitted-ref > "$src/references/anti-slop.md"
  p="$tmp/put"
  BASELINE_ROOT="$src" build_prefix "$p" >/dev/null 2>"$tmp/err" || die 'prefix: build failed'
  [ "$(cat "$p/skills/a/SKILL.md")" = uncommitted ] || die 'prefix: uncommitted skill edit is missing'
  [ -f "$p/skills/b/SKILL.md" ] || die 'prefix: untracked skill file is missing'
  if [ -e "$p/skills/gone/SKILL.md" ]; then die 'prefix: a skill file deleted in the tree came back'; fi
  grep -q 'skills/ has uncommitted changes' "$tmp/err" || die 'prefix: no warning for dirty skills/'
  grep -q 'skills/a/SKILL.md' "$tmp/err" || die 'prefix: warning does not name the dirty path'
  [ "$(cat "$p/references/anti-slop.md")" = uncommitted-ref ] \
    || die 'prefix: dirty references/ file did not reach the prefix'
  grep -q 'references/ has uncommitted changes' "$tmp/err" || die 'prefix: no warning for dirty references/'
  grep -q 'references/anti-slop.md' "$tmp/err" || die 'prefix: warning does not name the dirty references/ path'
  if [ -e "$p/CLAUDE.md" ]; then die 'prefix: CLAUDE.md survived'; fi
  if [ -w "$p/skills/a/SKILL.md" ] && [ "$(id -u 2>/dev/null)" != 0 ]; then
    die 'prefix: files are writable'
  fi
  verify_prefix "$p" 2>/dev/null || die 'prefix: fresh prefix fails its own manifest'
  # A121: a prefix run is GREEN - unisolated it is refused before anything runs
  if ( unset BASELINE_ISOLATE; run_nested 5 "$p" sh -c "touch '$tmp/ran-green'" ) 2>"$tmp/err"; then
    die 'run: an unisolated GREEN run was not refused'
  fi
  [ ! -e "$tmp/ran-green" ] || die 'run: unisolated GREEN refused, but the command ran'
  grep -q 'REFUSED: GREEN run without isolation' "$tmp/err" || die 'run: GREEN refusal not said in the .err'
  grep -q 'environment of THIS run command' "$tmp/err" || die 'run: GREEN refusal does not say where BASELINE_ISOLATE goes'
  if ( unset BASELINE_ISOLATE; run_nested 5 - sh -c "touch '$tmp/ran-green'" --plugin-dir x ) 2>"$tmp/err"; then
    die 'run: --plugin-dir without a prefix not treated as GREEN'
  fi
  if ( BASELINE_ISOLATE=bare run_nested 5 "$p" true ) 2>"$tmp/err"; then
    die 'run: BASELINE_ISOLATE=bare without --bare was accepted'
  fi
  ( BASELINE_ISOLATE=off run_nested 5 "$p" true ) 2>"$tmp/err" || die 'run: BASELINE_ISOLATE=off GREEN run failed'
  grep -q 'ISOLATION OFF: GREEN run with BASELINE_ISOLATE=off' "$tmp/err" || die 'run: isolate=off not flagged in the .err'
  # F48: a watchdog hold (<main>/.skillator/watchdog.hold, relay-morpheus
  # watchdog hold) refuses a GREEN run, exit 2, before anything starts; a RED
  # run is not held; released, the GREEN run goes.
  wdr="$tmp/wd-repo"; git init -q "$wdr"; mkdir -p "$wdr/.skillator"
  printf '%s\n' '2026-10-18T09:00Z disk 0.8 GB free (below 1 GB)' > "$wdr/.skillator/watchdog.hold"
  rc=0; ( cd "$wdr" && unset RELAY_DIR && BASELINE_ISOLATE=off run_nested 5 - sh -c "touch '$tmp/ran-held'" --plugin-dir x ) 2>"$tmp/err" || rc=$?
  [ "$rc" = 2 ] || die "run: a GREEN run while the watchdog holds gave rc=$rc, want 2"
  [ ! -e "$tmp/ran-held" ] || die 'run: a GREEN run started while the watchdog holds'
  grep -qx 'REFUSED: watchdog hold (disk 0.8 GB free (below 1 GB)) - clear the cause, then /ops resume or relay-morpheus watchdog release' "$tmp/err" \
    || die "run: the watchdog refusal does not say why: $(cat "$tmp/err")"
  rc=0; ( cd "$wdr" && unset RELAY_DIR && BASELINE_ISOLATE=hide HOME="$tmp/no-home" run_nested 5 "$p" true ) 2>"$tmp/err" || rc=$?
  [ "$rc" = 2 ] && grep -q '^REFUSED: watchdog hold' "$tmp/err" || die "run: a prefix GREEN run while held gave rc=$rc"
  ( cd "$wdr" && unset RELAY_DIR && run_nested 5 - sh -c "touch '$tmp/ran-red'" ) 2>"$tmp/err" || die 'run: a RED run was held by the watchdog'
  [ -e "$tmp/ran-red" ] || die 'run: a RED run did not run under a watchdog hold'
  rm -f "$wdr/.skillator/watchdog.hold"
  ( cd "$wdr" && unset RELAY_DIR && BASELINE_ISOLATE=off run_nested 5 - sh -c "touch '$tmp/ran-held'" --plugin-dir x ) 2>"$tmp/err" \
    || die 'run: a GREEN run was refused with no watchdog hold'
  [ -e "$tmp/ran-held" ] || die 'run: released, the GREEN run still did not run'
  # R2b: one rule for the hold's place, shared by relay-morpheus, pending and
  # this harness - in a repo whose git dir lives elsewhere (--separate-git-dir)
  # a hold taken by relay from a subdir is seen by pending and refuses a GREEN
  # run here; outside git ./.skillator of the cwd; RELAY_DIR overrides.
  # R6: an empty hold file still holds (reason -).
  hk2=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)/skills
  sgr="$tmp/wd-sep"; git init -q --separate-git-dir "$tmp/wd-sep.git" "$sgr" && mkdir -p "$sgr/sub" || die 'run: cannot make a separate-git-dir repo'
  ( cd "$sgr/sub" && unset RELAY_DIR && sh "$hk2/relay-morpheus/hooks/relay-morpheus.sh" watchdog hold 'disk 0.6 GB free' >/dev/null ) \
    || die 'run: relay watchdog hold in a separate-git-dir repo failed'
  [ -f "$sgr/.skillator/watchdog.hold" ] || die 'run: relay put a separate-git-dir hold somewhere else than <toplevel>/.skillator'
  _ph=$(cd "$sgr/sub" && unset RELAY_DIR && sh "$hk2/tickets-zordon/scripts/pending.sh" --machine | awk '/^HOLD=/')
  case "$_ph" in 'HOLD='*'Z disk 0.6 GB free') ;; *) die "run: pending did not see relay's separate-git-dir hold: $_ph" ;; esac
  rc=0; ( cd "$sgr/sub" && unset RELAY_DIR && BASELINE_ISOLATE=off run_nested 5 - sh -c "touch '$tmp/ran-sep'" --plugin-dir x ) 2>"$tmp/err" || rc=$?
  [ "$rc" = 2 ] && [ ! -e "$tmp/ran-sep" ] && grep -q '^REFUSED: watchdog hold (disk 0.6 GB free)' "$tmp/err" \
    || die "run: a GREEN run in a separate-git-dir repo under a hold gave rc=$rc: $(cat "$tmp/err")"
  : > "$sgr/.skillator/watchdog.hold"
  rc=0; ( cd "$sgr/sub" && unset RELAY_DIR && BASELINE_ISOLATE=off run_nested 5 - sh -c "touch '$tmp/ran-sep'" --plugin-dir x ) 2>"$tmp/err" || rc=$?
  [ "$rc" = 2 ] && [ ! -e "$tmp/ran-sep" ] && grep -qx 'REFUSED: watchdog hold (-) - clear the cause, then /ops resume or relay-morpheus watchdog release' "$tmp/err" \
    || die "run: an empty hold file did not refuse a GREEN run: rc=$rc $(cat "$tmp/err")"
  rm -rf "$sgr" "$tmp/wd-sep.git"
  mkdir -p "$tmp/wd-nogit/.skillator" "$tmp/wd-rd"
  printf '%s\n' '2026-10-18T09:00Z nogit low' > "$tmp/wd-nogit/.skillator/watchdog.hold"
  rc=0; ( cd "$tmp/wd-nogit" && unset RELAY_DIR && BASELINE_ISOLATE=off run_nested 5 - true --plugin-dir x ) 2>"$tmp/err" || rc=$?
  [ "$rc" = 2 ] && grep -q '^REFUSED: watchdog hold (nogit low)' "$tmp/err" || die "run: outside git a ./.skillator hold did not refuse: rc=$rc"
  printf '%s\n' '2026-10-18T09:00Z rd low' > "$tmp/wd-rd/watchdog.hold"
  rc=0; ( cd "$wdr" && RELAY_DIR="$tmp/wd-rd" BASELINE_ISOLATE=off run_nested 5 - true --plugin-dir x ) 2>"$tmp/err" || rc=$?
  [ "$rc" = 2 ] && grep -q '^REFUSED: watchdog hold (rd low)' "$tmp/err" || die "run: a RELAY_DIR hold did not refuse: rc=$rc"
  rm -rf "$tmp/wd-nogit" "$tmp/wd-rd"
  ( unset BASELINE_ISOLATE; run_nested 5 - true ) 2>"$tmp/err" || die 'run: a RED run was refused for isolation'
  if grep -q 'REFUSED\|ISOLATION OFF' "$tmp/err"; then die 'run: a RED run was flagged for isolation'; fi
  rc=0; ( BASELINE_ISOLATE=off run_nested 5 "$p" sh -c "chmod u+w '$p/skills'; echo x > '$p/skills/leak.mjs'" ) 2>"$tmp/err" || rc=$?
  [ "$rc" = 3 ] || die "run: a write into the prefix gave rc=$rc, want 3"
  grep -q 'WROTE INTO THE PREFIX' "$tmp/err" || die 'run: prefix write not reported'
  grep -q 'leak.mjs' "$tmp/err" || die 'run: prefix write does not name the file'
  if ( BASELINE_ISOLATE=off run_nested 5 "$p" true ) 2>"$tmp/err"; then die 'run: accepted an already-dirty prefix'; fi
  grep -q 'dirty BEFORE the run' "$tmp/err" || die 'run: dirty prefix refused for the wrong reason'
  s2="$tmp/src2"; mkdir -p "$s2/.claude-plugin" "$s2/skills/a"
  echo '{}' > "$s2/.claude-plugin/plugin.json"; echo canon > "$s2/PRACTICE.md"; echo c > "$s2/skills/a/SKILL.md"
  commit_fixture "$s2" 'clean source'
  BASELINE_ROOT="$s2" build_prefix "$tmp/put2" >/dev/null 2>"$tmp/err" || die 'prefix: clean build failed'
  if grep -q WARNING "$tmp/err"; then die 'prefix: warned on a clean tree'; fi
  # A135: commands/ (the plugin's slash commands) is overlaid too - an
  # uncommitted commands/x.md edit reaches the prefix and is NOT reported as
  # "outside the overlaid paths".
  s3="$tmp/src3"; mkdir -p "$s3/.claude-plugin" "$s3/skills/a" "$s3/commands"
  echo '{}' > "$s3/.claude-plugin/plugin.json"; echo canon > "$s3/PRACTICE.md"; echo c > "$s3/skills/a/SKILL.md"
  echo committed > "$s3/commands/x.md"
  commit_fixture "$s3" 'commands source'
  echo uncommitted-cmd > "$s3/commands/x.md"
  BASELINE_ROOT="$s3" build_prefix "$tmp/put3" >/dev/null 2>"$tmp/err" || die 'prefix: commands build failed'
  [ "$(cat "$tmp/put3/commands/x.md")" = uncommitted-cmd ] || die 'prefix: dirty commands/ file did not reach the prefix'
  grep -q 'commands/ has uncommitted changes' "$tmp/err" || die 'prefix: no warning for dirty commands/'
  if grep -q 'OUTSIDE the overlaid paths' "$tmp/err"; then die 'prefix: dirty commands/ file reported as outside the overlaid paths'; fi

  # A63b: BASELINE_ISOLATE=hide, against a fake HOME only - never the real one.
  fh="$tmp/fakehome"; mkdir -p "$fh/.claude"; echo '# Fake memory' > "$fh/.claude/CLAUDE.md"
  md="$fh/.claude/CLAUDE.md"
  ( HOME="$fh" BASELINE_ISOLATE=hide run_nested 5 - sh -c "[ ! -e '$md' ] && [ -e '$md.skillator-hidden' ]" ) \
    2>"$tmp/err" || die 'hide: CLAUDE.md was visible during the run'
  [ "$(cat "$md")" = '# Fake memory' ] || die 'hide: not restored after a clean run'
  [ ! -e "$md.skillator-hidden" ] || die 'hide: hidden copy left behind'
  grep -q 'mv ~/.claude/CLAUDE.md.skillator-hidden ~/.claude/CLAUDE.md' "$tmp/err" \
    || die 'hide: restore command not printed'
  # R1b: the hiding run names itself in <hidden>.owner ("<pid> <epoch>
  # <winpid>") while hidden, and removes it after the restore. winpid is
  # /proc/$$/winpid under MSYS/Cygwin when readable, else -.
  ( HOME="$fh" BASELINE_ISOLATE=hide run_nested 5 - sh -c "cp '$md.skillator-hidden.owner' '$tmp/owner'" ) \
    2>"$tmp/err" || die 'hide: owner file not written while hidden'
  _ol=$(cat "$tmp/owner")
  _on=$(echo "$_ol" | awk '{ print NF }'); _op=${_ol%% *}; _oe=${_ol#* }; _ox=${_oe#* }; _oe=${_oe%% *}
  [ "$_on" = 3 ] || die "hide: owner line '$_ol' has $_on fields, want 3 (<pid> <epoch> <winpid>)"
  [ "$_op" = "$$" ] || die "hide: owner pid is '$_op', want the harness pid $$"
  case "$_oe" in ''|*[!0-9]*) die "hide: owner epoch is '$_oe', want whole seconds" ;; esac
  _ow=-; if [ -r "/proc/$$/winpid" ]; then _ow=$(tr -d '\r\n ' < "/proc/$$/winpid"); fi
  case "$(uname -s 2>/dev/null)" in
    MSYS*|MINGW*|CYGWIN*) case "$_ox" in ''|*[!0-9]*) die "hide: owner winpid is '$_ox', want a number under MSYS" ;; esac ;;
  esac
  [ "$_ox" = "$_ow" ] || die "hide: owner winpid is '$_ox', want '$_ow'"
  [ "$(wc -l < "$tmp/owner" | tr -d ' ')" = 1 ] || die 'hide: owner file is not one LF-terminated line'
  if tr -d '\n' < "$tmp/owner" | grep -q "$(printf '\r')"; then die 'hide: owner file has CR'; fi
  [ ! -e "$md.skillator-hidden.owner" ] || die 'hide: owner file left behind after restore'
  # R1b: the owner file is written BEFORE the rename - at the moment CLAUDE.md
  # is hidden its owner already exists (a stand-in mv records what it saw).
  ( mv() { case "${2:-}" in *.skillator-hidden) [ -f "$2.owner" ] && : > "$tmp/owner-first" ;; esac; command mv "$@"; }
    HOME="$fh" BASELINE_ISOLATE=hide run_nested 5 - true ) 2>"$tmp/err" || die 'hide: run with the order probe failed'
  [ -e "$tmp/owner-first" ] || die 'hide: CLAUDE.md was hidden before its owner file existed'
  [ -f "$md" ] && [ ! -e "$md.skillator-hidden" ] && [ ! -e "$md.skillator-hidden.owner" ] || die 'hide: order probe run not restored'
  # R1b: the owner file cannot be written -> no rename, the run refused.
  mkdir "$md.skillator-hidden.owner"
  if ( HOME="$fh" BASELINE_ISOLATE=hide run_nested 5 - sh -c "touch '$tmp/ran-ow'" ) 2>"$tmp/err"; then
    die 'hide: ran although the owner file could not be written'
  fi
  [ ! -e "$tmp/ran-ow" ] || die 'hide: owner write failed, but the command ran'
  [ -f "$md" ] && [ ! -e "$md.skillator-hidden" ] || die 'hide: CLAUDE.md was hidden although its owner file could not be written'
  grep -q 'owner' "$tmp/err" || die "hide: owner-write refusal does not say why: $(cat "$tmp/err")"
  rmdir "$md.skillator-hidden.owner"
  # R1b: the rename fails -> the owner file it wrote is removed, the run refused.
  if ( mv() { case "${2:-}" in *.skillator-hidden) return 1 ;; esac; command mv "$@"; }
       HOME="$fh" BASELINE_ISOLATE=hide run_nested 5 - sh -c "touch '$tmp/ran-mv'" ) 2>"$tmp/err"; then
    die 'hide: ran although the rename failed'
  fi
  [ ! -e "$tmp/ran-mv" ] || die 'hide: rename failed, but the command ran'
  [ -f "$md" ] && [ ! -e "$md.skillator-hidden.owner" ] || die 'hide: a failed rename left its owner file behind'
  rc=0; ( HOME="$fh" BASELINE_ISOLATE=hide run_nested 5 - sh -c 'exit 9' ) 2>"$tmp/err" || rc=$?
  [ "$rc" = 9 ] || die "hide: failing command gave rc=$rc, want 9"
  [ -f "$md" ] && [ ! -e "$md.skillator-hidden" ] || die 'hide: not restored after a failing run'
  rc=0; ( HOME="$fh" BASELINE_ISOLATE=hide run_nested 1 - sh -c 'sleep 5' ) 2>"$tmp/err" || rc=$?
  [ "$rc" = 124 ] && [ -f "$md" ] || die 'hide: not restored after a timeout'
  cp "$md" "$md.skillator-hidden"
  if ( HOME="$fh" BASELINE_ISOLATE=hide run_nested 5 - sh -c "touch '$tmp/ran'" ) 2>"$tmp/err"; then
    die 'hide: ran despite a stale hidden file'
  fi
  [ ! -e "$tmp/ran" ] || die 'hide: stale hidden file refused, but the command ran'
  grep -q 'mv ~/.claude/CLAUDE.md.skillator-hidden ~/.claude/CLAUDE.md' "$tmp/err" \
    || die 'hide: stale refusal did not print the restore command'
  grep -q 'CLAUDE.md.skillator-hidden.owner' "$tmp/err" \
    || die 'hide: stale refusal did not mention the owner file'
  grep -q 'rm -f ~/.claude/CLAUDE.md.skillator-hidden.owner' "$tmp/err" \
    || die 'hide: stale refusal did not say how to clear the owner file'
  rm "$md.skillator-hidden"
  # A121: an inner `run` inside an outer run's hide window neither hides again
  # nor takes the outer hide for a stale one.
  self_h=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/$(basename -- "$0")
  ( HOME="$fh" BASELINE_ISOLATE=hide run_nested 20 - \
      sh "$self_h" run 10 - sh -c "[ ! -e '$md' ] && touch '$tmp/inner-ran'" ) 2>"$tmp/err" \
    || { cat "$tmp/err" >&2; die 'hide: inner run inside the hide window failed'; }
  [ -e "$tmp/inner-ran" ] || die 'hide: inner run did not run its command'
  grep -q 'inside the hide window of outer run' "$tmp/err" || die 'hide: inner run did not see the window'
  [ -f "$md" ] && [ ! -e "$md.skillator-hidden" ] || die 'hide: not restored after an inner run'
  rm "$md"
  ( HOME="$fh" BASELINE_ISOLATE=hide run_nested 5 - true ) 2>"$tmp/err" || die 'hide: no CLAUDE.md made it fail'
  grep -q 'nothing to hide' "$tmp/err" || die 'hide: missing CLAUDE.md not reported'
  c=$(BASELINE_ISOLATE=hide emit_cmd green "$f" "$tmp/s.txt" "$tmp" 2>"$tmp/err")
  grep -q 'isolated: YES (CLAUDE.md hidden for the run)' "$tmp/err" || die 'cmd green: hide not announced'
  if grep -q 'isolated: NO' "$tmp/err"; then die 'cmd green: hide still warns not isolated'; fi
  echo "$c" | grep -q 'BASELINE_ISOLATE=hide sh ' || die 'cmd green: hide not passed to run'
  grep -q 'must stay on the OUTER' "$tmp/err" || die 'cmd green: outer-run placement of BASELINE_ISOLATE not stated'
  grep -q 'max-budget-usd, if a driver adds it, is visible' "$tmp/err" || die 'cmd green: budget-cap visibility not stated'
  c=$( (unset BASELINE_ISOLATE; emit_cmd green "$f" "$tmp/s.txt" "$tmp") 2>"$tmp/err")
  grep -q "'run' will REFUSE this GREEN run" "$tmp/err" || die 'cmd green: unisolated emit does not warn of the refusal'
  c=$(BASELINE_ISOLATE=off emit_cmd green "$f" "$tmp/s.txt" "$tmp" 2>"$tmp/err")
  echo "$c" | grep -q 'BASELINE_ISOLATE=off sh ' || die 'cmd green: off not passed to run'

  # relay-marathon (F33): the board's shape is the test - F2 owner's call, F5
  # sharing its new file, B6 decidable from the README, B4 apart from F2.
  rm_d="$tmp/relay-marathon"
  build_relay_marathon "$rm_d" >/dev/null
  rm_t="$rm_d/TICKETS.md"
  [ "$(grep -c '^- \[ \]' "$rm_t")" = 6 ] || die 'relay-marathon: expected six [ ] tickets'
  for t in B3 B4 B6 F2 F3 F5; do grep -q "^- \[ \] $t " "$rm_t" || die "relay-marathon: $t not open"; done
  grep -q "^- \[ \] F2 .*owner's call" "$rm_t" || die "relay-marathon: F2 must be the owner's call"
  grep -q '^- \[ \] F5 .*shelf/export.py' "$rm_t" || die 'relay-marathon: F5 must name shelf/export.py'
  grep -q '^- \[ \] B6 .*json.loads' "$rm_t" || die 'relay-marathon: B6 must say the consumer parses JSON'
  grep -q 'json.loads' "$rm_d/README.md" || die 'relay-marathon: README must say who reads list --json'
  if grep -q '^- \[ \] B4 .*export' "$rm_t"; then die 'relay-marathon: B4 must not touch export'; fi
  [ ! -e "$rm_d/shelf/export.py" ] || die 'relay-marathon: export.py already exists'
  [ -d "$rm_d/.skillator" ] && [ -z "$(ls -A "$rm_d/.skillator")" ] || die 'relay-marathon: .skillator/ must exist and be empty'
  [ -z "$(git -C "$rm_d" status --porcelain)" ] || die 'relay-marathon: tree not clean'
  if grep -q 'A7' "$rm_t"; then die 'relay-marathon: base board carries A7'; fi
  for n in CLAUDE.md AGENTS.md GEMINI.md; do
    if [ -e "$rm_d/$n" ]; then die "relay-marathon: fixture ships $n"; fi
  done
  BASELINE_USAGE='40 40' build_relay_marathon "$tmp/relay-marathon-u" resume >/dev/null
  [ "$(cat "$tmp/relay-marathon-u.usage/fixture-session.fivehour")" = 40 ]     || die 'relay-marathon: BASELINE_USAGE wrote no usage dir'
  [ -z "$(git -C "$tmp/relay-marathon-u" status --porcelain)" ] || die 'relay-marathon: usage dir dirtied the tree'
  if ( BASELINE_USAGE='40' build_relay_marathon "$tmp/relay-marathon-ub" ) >/dev/null 2>&1; then
    die 'relay-marathon: a one-number BASELINE_USAGE was accepted'
  fi
  [ ! -e "$tmp/relay-marathon-ub" ] || die 'relay-marathon: a malformed BASELINE_USAGE left a fixture dir behind'
  build_relay_marathon "$tmp/relay-marathon2" >/dev/null
  [ "$(git -C "$rm_d" rev-parse HEAD)" = "$(git -C "$tmp/relay-marathon2" rev-parse HEAD)" ] \
    || die 'relay-marathon: two builds produced different commit shas'
  if ( build_relay_marathon "$tmp/relay-marathon-x" sideways ) >/dev/null 2>&1; then
    die 'relay-marathon: an unknown mode was accepted'
  fi
  # stop (M3): A7 on the board, data/legacy/ on disk and untracked.
  ms="$tmp/relay-marathon-stop"
  build_relay_marathon "$ms" stop >/dev/null
  grep -q '^- \[ \] A7 .*data/legacy/' "$ms/TICKETS.md" || die 'relay-marathon-stop: no A7'
  [ "$(ls "$ms/data/legacy" | wc -l | tr -d ' ')" = 3 ] || die 'relay-marathon-stop: data/legacy/ must hold three files'
  [ "$(git -C "$ms" status --porcelain)" = '?? data/' ] || die 'relay-marathon-stop: data/ must be the only change, untracked'
  [ -z "$(git -C "$ms" ls-files data)" ] || die 'relay-marathon-stop: data/ is tracked'
  # resume (M5) and batch (M4): stage 1 landed on the same base board text,
  # a run file in the Decisions shape, nothing of the parked work in the tree.
  for mm in resume batch; do
    mr="$tmp/relay-marathon-$mm"
    build_relay_marathon "$mr" "$mm" >/dev/null
    rf="$mr/.skillator/run-1-drain-the-board.md"
    [ -f "$rf" ] || die "relay-marathon-$mm: no run file"
    [ -z "$(git -C "$mr" status --porcelain)" ] || die "relay-marathon-$mm: tree not clean"
    s1=$(git -C "$mr" rev-parse --short HEAD~1)
    grep -q "^| 1 | AAAB .* | x | .* | $s1 |\$" "$rf" || die "relay-marathon-$mm: stage 1 row does not name the stage-1 commit"
    git -C "$mr" log -1 --format=%s HEAD~1 | grep -q '\[AAAB\]$' || die "relay-marathon-$mm: stage-1 commit lacks its code"
    grep -q '^| 2 | AAAC .* | ? | ' "$rf" || die "relay-marathon-$mm: stage 2 is not ?"
    awk '/^## Chain$/{c=NR} /^## Decisions$/{q=NR} /^## Rulings/{r=NR} END{exit !(c && q && r && c < q && q < r)}' "$rf" \
      || die "relay-marathon-$mm: ## Decisions is not between ## Chain and ## Rulings"
    if grep -qE '^### Q[0-9]+ .*stage' "$rf"; then die "relay-marathon-$mm: a Q header line names a stage"; fi
    [ ! -e "$mr/shelf/export.py" ] || die "relay-marathon-$mm: parked work is in the tree"
    for t in B3 B4 B6 F3; do grep -q "^- \[x\] $t " "$mr/TICKETS.md" || die "relay-marathon-$mm: $t not closed"; done
    grep -q '^- \[!\] F2 .*(blocked: RUN-1 Q[12] ' "$mr/TICKETS.md" || die "relay-marathon-$mm: F2 not blocked on its Q"
    build_relay_marathon "$tmp/relay-marathon-${mm}2" "$mm" >/dev/null
    [ "$(git -C "$mr" rev-parse HEAD)" = "$(git -C "$tmp/relay-marathon-${mm}2" rev-parse HEAD)" ] \
      || die "relay-marathon-$mm: two builds produced different commit shas"
    [ "$(git -C "$mr" rev-parse HEAD~2)" = "$(git -C "$rm_d" rev-parse HEAD)" ] || [ "$mm" = batch ] \
      || die "relay-marathon-$mm: base commit differs from relay-marathon"
    nid="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/next-id.sh"
    if [ -f "$nid" ]; then
      w=$(sh "$nid" --peek --runs "$mr/.skillator" W "$mr/TICKETS.md")
      want=AAAD; [ "$mm" = resume ] && want=AAAE
      [ "$w" = "$want" ] || die "relay-marathon-$mm: next W code is $w, want $want (a Q header read as a code?)"
    fi
  done
  mr="$tmp/relay-marathon-resume"; rf="$mr/.skillator/run-1-drain-the-board.md"
  grep -q '^### Q2 answered ' "$rf" || die 'relay-marathon-resume: Q2 is not answered'
  [ "$(sed -n '/^### Q2 /,/^### \|^## /p' "$rf" | grep -c '^answer: CSV$')" = 1 ] || die 'relay-marathon-resume: Q2 answer is not CSV'
  grep -q '^default: JSON$' "$rf" || die 'relay-marathon-resume: Q2 default must differ from its answer'
  grep -q '^| 3 | AAAD F5 export.py |   | ' "$rf" || die 'relay-marathon-resume: F5 stage not pending'
  if grep -q 'replanned' "$rf"; then die 'relay-marathon-resume: something is already replanned'; fi
  grep -q '^- \[ \] F5 ' "$mr/TICKETS.md" || die 'relay-marathon-resume: F5 not open'
  mb="$tmp/relay-marathon-batch"; rf="$mb/.skillator/run-1-drain-the-board.md"
  [ "$(grep -c '^### Q[1-6] open ' "$rf")" = 6 ] || die 'relay-marathon-batch: expected six open Qs'
  [ "$(grep -c '^- \[!\] F[0-9]* .*(blocked: RUN-1 Q[1-6] ' "$mb/TICKETS.md")" = 6 ] \
    || die 'relay-marathon-batch: expected six tickets blocked on a Q'
  if grep -q '^| [0-9]* | [A-Z0-9]\{4\} .* |   | ' "$rf"; then die 'relay-marathon-batch: a work stage is still dispatchable'; fi
  awk '/^header: /{ if (length(substr($0, 9)) > 8) exit 1 }' "$rf" || die 'relay-marathon-batch: a header is over 8 characters'
  if command -v python >/dev/null 2>&1 && python -c 'import pytest' 2>/dev/null; then
    for fx in "$rm_d" "$ms" "$tmp/relay-marathon-resume" "$mb"; do
      (cd "$fx" && python -m pytest -q -p no:cacheprovider >/dev/null 2>&1) \
        || die "relay-marathon: fixture suite is not green in $fx"
    done
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
  fanout) build_fanout "$dir" ;;
  relay) build_relay "$dir" ;;
  relay-mid) build_relay "$dir" mid ;;
  relay-split) build_relay_split "$dir" ;;
  ponytail) build_ponytail "$dir" ;;
  relay-chain) build_relay_chain "$dir" ;;
  relay-chain-resume) build_relay_chain "$dir" resume ;;
  relay-marathon) build_relay_marathon "$dir" ;;
  relay-marathon-stop) build_relay_marathon "$dir" stop ;;
  relay-marathon-resume) build_relay_marathon "$dir" resume ;;
  relay-marathon-batch) build_relay_marathon "$dir" batch ;;
  *) die "unknown fixture: $kind (func-ui | handoff | spec-drift | spec-drift-v2 | spec-drift-v3 | fanout | relay | relay-mid | relay-split | ponytail | relay-chain | relay-chain-resume)" ;;
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
  shift
  bp=''
  if [ "${1:-}" = --bypass ]; then bp=1; shift; fi
  m="${1:-}"; fx="${2:-}"; sc="${3:-}"; px="${4:-}"
  [ -n "$m" ] && [ -n "$fx" ] && [ -n "$sc" ] || usage
  emit_cmd "$m" "$fx" "$sc" "$px" "$bp"
  ;;
settings)
  settings_json "${2:-}"
  ;;
run)
  shift
  [ "$#" -ge 3 ] || usage
  run_nested "$@" || exit $?
  ;;
verify-prefix)
  [ -n "${2:-}" ] || usage
  verify_prefix "$2" && echo "ok - prefix matches its manifest"
  ;;
selftest) selftest ;;
*) usage ;;
esac
