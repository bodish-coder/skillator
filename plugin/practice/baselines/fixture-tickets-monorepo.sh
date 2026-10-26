#!/bin/sh
# fixture-tickets-monorepo.sh <DIR> - the F43 RED/GREEN fixture: a small
# monorepo (apps/web, apps/api, packages/ui) with a team file and two authors.
# Deterministic: fixed dates and authors.
set -e
d=${1:?usage: fixture-tickets-monorepo.sh <DIR>}
[ ! -e "$d" ] || { echo "exists: $d" >&2; exit 1; }
mkdir -p "$d" && cd "$d"
git init -q -b main .
export GIT_AUTHOR_DATE=2026-10-01T10:00:00Z GIT_COMMITTER_DATE=2026-10-01T10:00:00Z
v() { git -c user.name=Vidul -c user.email=vidul@ikran.in "$@"; }
a() { git -c user.name=Asha -c user.email=asha@example.com "$@"; }
mkdir -p apps/web/src apps/api/src packages/ui .skillator
printf '{ "name": "shop", "private": true, "workspaces": ["apps/*", "packages/*"] }\n' > package.json
printf '# Team\n\n- @vidul: vidul@ikran.in\n- @asha: asha@example.com\n' > .skillator/team.md
em=$(printf '\342\200\224')
cat > TICKETS.md <<EOF
# TICKETS

Legend: \`[ ]\` pending · \`[~]\` in-progress · \`[!]\` blocked · \`[>]\` deferred · \`[x]\` done · \`[-]\` cancelled
IDs are permanent ${em} never reuse or renumber. Append new tickets at the end of
their section.

## Bugs

- [ ] B1 ${em} cart badge shows 0 after a reload (web)

## Features

- [x] F1 ${em} product grid on the home page
- [x] F2 ${em} /orders endpoint returns the last 20 orders

## Agent-found
EOF
printf 'export const ui = 1;\n' > packages/ui/index.js
v add -A && v commit -q -m "shop: monorepo skeleton"
printf 'export function grid() { return []; }\n' > apps/web/src/grid.js
v add -A && v commit -q -m "F1: product grid on the home page"
printf 'export function orders() { return []; }\n' > apps/api/src/orders.js
a add -A && a commit -q -m "F2: /orders endpoint"
printf 'export function grid() { return [1]; }\n' > apps/web/src/grid.js
a add -A && a commit -q -m "F1: grid shows one placeholder card"
echo "$d"
