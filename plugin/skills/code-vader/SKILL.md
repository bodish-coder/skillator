---
name: code-vader
description: >-
  Use when the user says "/code-vader", "code-vader", "vader", "pre-commit
  review", "review staged diff", "review before commit", or wants a unified
  pre-commit diff review on non-Claude hosts (Antigravity, Codex, Cursor, Pi,
  OpenCode) combining correctness/safety checks (Claude Code /code-review) and
  restraint/anti-bloat checks (Ponytail / code-yoda) into a binary commit
  verdict. NOT for a whole-app forensic audit (audit-sherlock) or ticket board
  management (tickets-zordon).
---

# code-vader — unified pre-commit review (correctness + restraint)

Replicates both review engines across every host (Antigravity, Codex, Cursor,
Pi, OpenCode, Claude Code) on `git diff --cached` (or unstaged changes when
nothing is staged):

1. **Correctness & Safety Lens** (Claude Code `/code-review` replication)
2. **Restraint & Anti-Bloat Lens** (Ponytail / `code-yoda` replication)

Ends with a definitive binary gate: `READY-TO-COMMIT: YES` or `CHANGES-REQUESTED`.

## 1. Collect the diff and debt context (`scripts/code-vader.{sh,ps1}`)

Run the helper script from this skill's `scripts/` directory (`$VADER`):

- Unix / Git Bash: `sh "$VADER/code-vader.sh" collect [--repo <dir>] [--unstaged|--staged|--auto]`
- Windows PowerShell: `powershell -NoProfile -ExecutionPolicy Bypass -File "$VADER/code-vader.ps1" collect [-Repo <dir>] [-Unstaged|-Staged|-Auto]`

Default mode is `--auto`: uses `git diff --cached` when staged changes exist,
else falls back to unstaged `git diff`. It outputs:

- `target: staged|unstaged|empty` and `files: <count>`
- `changed_files:` (`path` per line)
- `markers:` every added or existing `shortcut:` / `ponytail:` comment in the
  changed files with `<file>:<line> — <what>. ceiling: "<quoted>". trigger: "<quoted>"|no-trigger.`
- `diff:` unified diff with line numbers.

Read the callers and surrounding context of every changed function before
writing a single finding — `yagni:`, `delete:`, `reuse:` and regression claims
are claims about callers, not the diff in isolation.

## 2. Lens 1 — Correctness & Safety (`/code-review` replication)

Audit the diff for real defects that will fail in practice:

- **Logic flaws & edge cases**: off-by-one, wrong boolean/branch condition,
  empty/boundary inputs, silent data truncation or wrong return value.
- **Unchecked error returns & swallowed failures**: ignored exit codes/promises,
  bare `catch`, partial writes without rollback.
- **Null / undefined crashes**: unguarded dereferences, missing key/index
  checks on external or nullable data.
- **Race conditions & ordering**: shared mutable state, TOCTOU file/state
  checks, non-atomic updates, lock ordering hazards.
- **Type unsoundness**: unsafe casts, schema/contract drift between producer and
  consumer, string/number coercion traps.
- **Security vulnerabilities**: command/SQL/path injection, secrets or tokens in
  the diff, missing auth/permission boundary validation, SSRF/XSS.
- **Regression risks**: broken callers, removed guards, changed public
  signatures or exit codes without updating callers/tests.

**Confidence filter**: Score each candidate 0–100. Report **only findings >= 80**
with a concrete failure scenario (`inputs/state -> wrong outcome`). Drop style
opinions, pre-existing untouched code, and linter noise.

## 3. Lens 2 — Restraint & Anti-Bloat (Ponytail / `code-yoda` replication)

Audit the diff for unnecessary complexity, tagged with concrete replacements:

| Tag | What it flags | Required replacement slot |
|---|---|---|
| `reuse:` | Duplicate utility/helper/component the repo already has | Existing helper path (`path/to/file:symbol (-N lines)`) |
| `stdlib:` | Hand-rolled logic the standard library ships | Exact stdlib function (`<fn> (-N lines)`) |
| `native:` | Dependency or code doing what the platform already does | Platform feature (`<feature> (-N lines)`) |
| `yagni:` | Speculative abstraction, interface with one implementation, unrequested config/flags | Inlined form (`inline <what> (-N lines)`) |
| `delete:` | Dead code, unused export, redundant wrapper (grep whole tree first) | `nothing (-N lines)` |
| `merge:` | Near-copies that must change together | Consolidated symbol (`<target> (-N lines)`) |
| `shrink:` | Same behaviour in clearly fewer, plainer lines | Shorter form (`<form> (-N lines)`) |

Also audit `shortcut:` / `ponytail:` debt markers touched or introduced by the
diff:
- A marker naming its ceiling and trigger is a deliberate decision (not bloat)
  unless expected load already crosses that ceiling.
- A marker with **`no-trigger`** is flagged as `important` (`debt: shortcut
  without revisit trigger`) so deferral never quietly becomes permanent.
- Always compute the net line-count estimate: `net: -<N> lines possible.` (or
  `net: 0 lines (lean already).`).

## 4. Ranked Output & Binary Verdict

Format your review in this exact order, or pipe structured findings through
`code-vader.{sh,ps1} format` to validate and render the canonical report:

```text
## Code-Vader Pre-Commit Review
target: staged (3 files, +84/-12)

### Ranked Findings
1. [critical] [correctness] src/auth.ts:42 — Unchecked token verify return allows expired sessions. Fix: check err and return 401.
2. [high] [security] scripts/sync.sh:19 — Unquoted path in eval allows command injection. Fix: pass positional args to sh.
3. [important] [restraint:yagni] src/cache.ts:10 — AbstractCacheProvider has one implementation. Fix: inline into MemoryCache (-28 lines).
4. [important] [restraint:stdlib] src/util.py:55 — Hand-rolled slug loop. Fix: re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-') (-14 lines).
5. [low] [restraint:reuse] src/cli.ts:88 — Duplicate padRight helper. Fix: reuse src/format.ts:padRight (-9 lines).

### Restraint & Debt Ledger
- src/worker.ts:14 — global lock. ceiling: "global lock". trigger: no-trigger.
markers: 1 total, 1 no-trigger.
net: -51 lines possible.

READY-TO-COMMIT: NO (CHANGES-REQUESTED)
```

When there are no blocking findings:

```text
READY-TO-COMMIT: YES
```

When any finding is `critical`, `high`, or `important` (including any
`no-trigger` debt marker on new/changed code):

```text
CHANGES-REQUESTED
```

(Both `READY-TO-COMMIT: YES` and `CHANGES-REQUESTED` are enforced by
`code-vader.{sh,ps1} format` — exit `0` on `READY-TO-COMMIT: YES`, exit `1` on
`CHANGES-REQUESTED`.)

## 5. Self-test

- Unix / Git Bash: `sh "$VADER/code-vader.sh" --selftest`
- Windows PowerShell: `powershell -NoProfile -ExecutionPolicy Bypass -File "$VADER/code-vader.ps1" -SelfTest`
