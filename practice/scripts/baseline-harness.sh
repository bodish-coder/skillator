#!/bin/sh
# Baseline harness for skill testing (skills/skill-smith/references/testing.md).
# Rebuilds, from nothing, the two things a recorded verdict needs beside it:
# the fixture the run happened in, and the exact command that ran it.
#
#   baseline-harness.sh fixture func-ui|handoff|spec-drift|spec-drift-v2|spec-drift-v3|fanout|relay|relay-mid|relay-split <DIR>
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
  echo "usage: baseline-harness.sh fixture func-ui|handoff|spec-drift|spec-drift-v2|spec-drift-v3|fanout|relay|relay-mid|relay-split <DIR>" >&2
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
OVERLAY_PATHS="skills references practice PRACTICE.md PLATFORMS.md WORKFLOW.md"

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
# of a chain must match a rule), `python -c`, and the relay-morpheus hook. These go in a --settings JSON, which is a settings SOURCE
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
EXTRA_RULES='Bash(cd:*)
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
# prefix before and after, runs CMD under `timeout`, and says on stderr which
# limit (if any) ended it. stdout is CMD's alone, so `> run.jsonl` still works.
run_nested() {
  t="$1"; p="$2"; shift 2
  case "$t" in ''|*[!0-9]*) die "run: timeout must be whole seconds, got: $t" ;; esac
  if [ "$p" != - ]; then
    verify_prefix "$p" || die "prefix is dirty BEFORE the run - rebuild it: $p"
  fi
  echo "# limit: harness wall clock ${t}s (BASELINE_TIMEOUT), SIGKILL 30s after that" >&2
  set +e
  timeout -k 30 "$t" "$@" < /dev/null
  rc=$?
  set -e
  case "$rc" in
  0)   echo "# limit hit: none - the run exited 0 on its own" >&2 ;;
  124) echo "# LIMIT HIT: harness wall clock, ${t}s (BASELINE_TIMEOUT) - SIGTERM sent." >&2
       echo "#   No stream output at all means it hung before turn 1 (SessionStart hooks);" >&2
       echo "#   output that stops mid-run means it was slow or stuck. Either way: no verdict." >&2 ;;
  137) echo "# LIMIT HIT: harness wall clock, ${t}s, and SIGTERM was ignored - SIGKILLed 30s later." >&2 ;;
  125|126|127) echo "# limit hit: none - timeout could not start the command (rc=$rc)" >&2 ;;
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

  case "$mode" in
  red)
    echo "cd '$fixture' && sh '$self' run $t - claude -p \"\$(sh '$self' scenario '$scenario')\" \\"
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
    bare=''
    if [ "${BASELINE_ISOLATE:-}" = bare ]; then
      bare=' --bare'
      echo "# isolated: UNVERIFIED — --bare claims to skip CLAUDE.md discovery but was" >&2
      echo "#   never confirmed on this host, and it reads auth only from" >&2
      echo "#   ANTHROPIC_API_KEY. Prove the isolation in the run before trusting it." >&2
      [ -n "${ANTHROPIC_API_KEY:-}" ] || echo "#   ANTHROPIC_API_KEY is not set: this --bare run will fail to authenticate." >&2
    else
      echo "# isolated: NO. ~/.claude/CLAUDE.md loads into this run. --safe-mode would" >&2
      echo "#   drop it but also suppresses --plugin-dir, so the skill would not load." >&2
      echo "#   Per the asymmetry rule: a violation stays valid, a compliance needs the" >&2
      echo "#   caveat stated in the record. (A63)" >&2
    fi
    echo "cd '$fixture' && sh '$self' run $t '$prefix' claude -p \"\$(sh '$self' scenario '$scenario')\" \\"
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
  for r in 'Bash(git:*)' 'Bash(python -m pytest:*)' 'PowerShell(git:*)' 'Bash(sh *relay-morpheus.sh*)' 'Bash(cd:*)'; do
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
  rc=0; ( run_nested 5 "$p" sh -c "chmod u+w '$p/skills'; echo x > '$p/skills/leak.mjs'" ) 2>"$tmp/err" || rc=$?
  [ "$rc" = 3 ] || die "run: a write into the prefix gave rc=$rc, want 3"
  grep -q 'WROTE INTO THE PREFIX' "$tmp/err" || die 'run: prefix write not reported'
  grep -q 'leak.mjs' "$tmp/err" || die 'run: prefix write does not name the file'
  if ( run_nested 5 "$p" true ) 2>"$tmp/err"; then die 'run: accepted an already-dirty prefix'; fi
  grep -q 'dirty BEFORE the run' "$tmp/err" || die 'run: dirty prefix refused for the wrong reason'
  s2="$tmp/src2"; mkdir -p "$s2/.claude-plugin" "$s2/skills/a"
  echo '{}' > "$s2/.claude-plugin/plugin.json"; echo canon > "$s2/PRACTICE.md"; echo c > "$s2/skills/a/SKILL.md"
  commit_fixture "$s2" 'clean source'
  BASELINE_ROOT="$s2" build_prefix "$tmp/put2" >/dev/null 2>"$tmp/err" || die 'prefix: clean build failed'
  if grep -q WARNING "$tmp/err"; then die 'prefix: warned on a clean tree'; fi

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
  *) die "unknown fixture: $kind (func-ui | handoff | spec-drift | spec-drift-v2 | spec-drift-v3 | fanout | relay | relay-mid | relay-split)" ;;
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
