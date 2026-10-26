#!/bin/sh
# A117 fixture: a mostly shell/PowerShell/Markdown repo with a little Python and
# JS, so codegraph indexes SOMETHING (6 of 16 tracked files: py, js, yaml) and an agent can be
# fooled into trusting it. scripts/build.sh is read by 8 other files; none of
# them is a js/ts/py symbol call codegraph can see (packager.py names it only
# inside a subprocess argv string).
#
#   sh practice/baselines/transcripts/a117-fixture.sh <DIR> [indexed]
#
# `indexed` (round v2) also tracks a .gitignore (.codegraph/) - 17 tracked -
# and runs `codegraph init` after the commit, so the agent meets an existing
# index of 6 files (4 py, 1 js, 1 yaml) as on skillator2, instead of an
# uninitialized one it declines to init under "do not edit".
#
# Ground truth (git grep -l scripts/build.sh, minus build.sh itself):
#   .github/workflows/ci.yml  Makefile  README.md  docs/deploy.md
#   scripts/ci.ps1  scripts/release.sh  scripts/selftest.sh  tools/packager.py
set -e
d="${1:?usage: a117-fixture.sh <DIR> [indexed]}"
mode="${2:-}"
[ ! -e "$d" ] || { echo "FAIL: $d exists" >&2; exit 1; }
mkdir -p "$d/scripts" "$d/tools" "$d/web" "$d/docs" "$d/.github/workflows"

cat > "$d/scripts/build.sh" <<'EOF'
#!/bin/sh
# build.sh --target dev|prod [--out DIR]
set -e
target=dev; out=dist
while [ $# -gt 0 ]; do
  case $1 in
  --target) target=$2; shift 2 ;;
  --out) out=$2; shift 2 ;;
  *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done
mkdir -p "$out"
echo "built $target" > "$out/BUILD"
EOF
cat > "$d/scripts/release.sh" <<'EOF'
#!/bin/sh
set -e
sh scripts/build.sh --target prod --out release
tar -czf release.tgz release
EOF
cat > "$d/scripts/selftest.sh" <<'EOF'
#!/bin/sh
set -e
tmp=$(mktemp -d)
sh scripts/build.sh --target dev --out "$tmp"
grep -q 'built dev' "$tmp/BUILD" && echo ok
EOF
cat > "$d/scripts/clean.sh" <<'EOF'
#!/bin/sh
rm -rf dist release release.tgz
EOF
cat > "$d/scripts/ci.ps1" <<'EOF'
$ErrorActionPreference = 'Stop'
& sh scripts/build.sh --target dev --out dist
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
EOF
cat > "$d/Makefile" <<'EOF'
build:
	sh scripts/build.sh --target dev
release:
	sh scripts/release.sh
EOF
cat > "$d/.github/workflows/ci.yml" <<'EOF'
name: ci
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: sh scripts/build.sh --target prod
      - run: sh scripts/selftest.sh
EOF
cat > "$d/README.md" <<'EOF'
# toolkit

Build with `sh scripts/build.sh --target dev` (or `--target prod`).
See docs/deploy.md for releases.
EOF
cat > "$d/docs/deploy.md" <<'EOF'
# Deploy

1. `sh scripts/build.sh --target prod --out release`
2. Upload `release.tgz`.
EOF
cat > "$d/docs/style.md" <<'EOF'
# Style

Two-space indent in shell, four in Python.
EOF
cat > "$d/tools/packager.py" <<'EOF'
import subprocess


def package(target):
    subprocess.run(["sh", "scripts/build.sh", "--target", target], check=True)
    return "dist"
EOF
cat > "$d/tools/report.py" <<'EOF'
from tools.util import fmt


def report(rows):
    return "\n".join(fmt(r) for r in rows)
EOF
cat > "$d/tools/util.py" <<'EOF'
def fmt(row):
    return " | ".join(str(c) for c in row)
EOF
cat > "$d/tools/__init__.py" <<'EOF'
EOF
cat > "$d/web/app.js" <<'EOF'
export function render(el, rows) {
  el.textContent = rows.join(", ");
}
EOF
cat > "$d/TICKETS.md" <<'EOF'
# Tickets

## Open

- [ ] F1 - rename build.sh's --target flag to --env (dev|prod), same values
EOF

[ "$mode" = indexed ] && echo .codegraph/ > "$d/.gitignore"

git -C "$d" init -q
git -C "$d" config user.email fixture@example.invalid
git -C "$d" config user.name fixture
git -C "$d" config commit.gpgsign false
git -C "$d" config core.autocrlf false
git -C "$d" add -A
GIT_AUTHOR_DATE='2026-09-01T09:00:00+00:00' \
GIT_COMMITTER_DATE='2026-09-01T09:00:00+00:00' \
  git -C "$d" commit -qm 'a117 fixture'
if [ "$mode" = indexed ]; then
  (cd "$d" && codegraph init >/dev/null 2>&1) || { echo "FAIL: codegraph init" >&2; exit 1; }
fi
echo "$d"
