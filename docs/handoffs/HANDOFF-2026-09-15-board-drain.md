# HANDOFF — 2026-09-15 — board drain (A65/A71/A72 shipped, A73/A74 closed, four blocked)

Written at 92% usage by the Stop-hook gate. Session: claude-opus-5, tag `@cc-bx8pru`.

## 1. STOP — there is uncommitted work in the tree

`HEAD` is `fdb4481`. **Seven files are modified and NOT committed.** Everything below
about A73/A74/A33/A63b lives only in the working tree. Losing it loses the session.

```
M  PLATFORMS.md                          MM install.ps1
MM TICKETS.md                            MM install.sh
MM practice/scripts/baseline-harness.sh   M practice/scripts/selftest.sh
 M practice/scripts/taskwork.ps1
```

Full sweep was green at handoff time: `check-tickets` (95 IDs) · `selftest` incl. the
PowerShell twin diff · `baseline-harness selftest` · `context-audit` (exit 0) ·
`check-grayskull-sync` · both installers `--dry-run` · all 20 SKILL.md frontmatter parse.

**A `/code-review high` has NOT been run over this last batch of changes** (the pruner
safety guards, the `taskwork.ps1` encoding fix, the A33/A63b records). The previous batch
went through three review passes; this one has had none. Run it before committing.

## 2. In-flight agent work

**None.** Every subagent and background task completed and its result is recorded:

| Agent / run | Outcome |
|---|---|
| `/code-review high` ×4 | All completed. 6+7+6+6 findings, every one fixed; see §4. |
| `pi` auto-invocation probe (`b8rs4wn5a`) | Completed, empty output — pi hangs on tool-using prompts. Recorded in A62b. |
| `pi` skill-discovery + dedupe probes | Completed. pi lists skillator skills; dedupes by name. A62b / A74. |
| `codex exec` hook tests ×3 | Completed. Hook never fired; cause found (hook trust). A33. |

Nothing needs resuming. Temp fixtures still on disk are listed in §5.

## 3. Status table — must match TICKETS.md ticket-for-ticket

`6 open (0 pending · 3 in-progress · 3 blocked) · 1 deferred · 88 closed (78 done · 10 cancelled) · 95 total`

| ID | Status | State at handoff |
|---|---|---|
| A33 | `[!]` blocked | Codex `Stop` hook. **Mechanism found this session**: hooks are gated on a *persisted hook trust* record; `codex exec` cannot create one, so `exec` can never fire a hook. Per-repo location and the newer build (0.154.0) both tested and eliminated. Blocked on one *interactive* `codex` run that accepts the hook. |
| A58 | `[~]` in-progress | Parent. Closes when A58b closes. |
| A58b | `[!]` blocked | func-ui GREEN re-run. Both prerequisites CLEARED (installer refreshed; prompt names the skill). Blocked on a permission rule for nested `claude -p` — refused from Bash *and* PowerShell, both permission modes. |
| A62 | `[~]` in-progress | Parent. codex row re-runnable once `~/.codex` is re-authed (or via `~/.codex-bodish`). |
| A62b | `[>]` deferred | cursor + antigravity unprobeable here (`cursor-agent` on PATH is node's binary; antigravity is IDE-only). **pi removed from this set** — it authenticates and discovers skills; behavioural grading impossible because pi hangs with no TTY. |
| A63 | `[~]` in-progress | Parent. Closes when A63b closes. |
| A63b | `[!]` blocked | GREEN isolation. `--bare` identified but needs `ANTHROPIC_API_KEY` (never reads OAuth/keychain). **Better untested candidate: `claudeMdExcludes` via `--settings`** — isolates CLAUDE.md while keeping OAuth, plugins, skills. Needs the same nested-`claude -p` rule as A58b. HOME-override avenue probed and closed permanently. |
| A73 | `[x]` done | Premise disproven — Gemini CLI dedupes by name (20 conflict warnings, shared dir wins). Dropped the redundant `~/.gemini/skills` dest, added a pruner, re-probed → 0 conflicts. |
| A74 | `[-]` cancelled | (not work) pi *also* dedupes, silently. Two loaders, no per-turn cost, so the change it named is unwanted. Cursor unmeasured but reframed as a disk duplicate, not a cost. |

## 4. What changed in the uncommitted tree

- **`install.sh` / `install.ps1`** — dropped `~/.gemini/skills`; added `prune_dropped_dest`
  (deletes ONLY a dir matching a repo skill *with* a SKILL.md; docs only if byte-identical
  to ours; `practice/`/`references/` only if a file we ship is inside; never through a
  symlink). `~/.pi/skills` marked `legacy:` — refreshed if present, never created. Shared-row
  marker probes dir **or** `command -v`, and includes antigravity.
- **`practice/scripts/taskwork.ps1`** — `Get-Content -Encoding UTF8` (ANSI codepage was
  turning every em-dash in a design file into mojibake in the build agent's brief) and two
  `-match` → `-cmatch` (awk is case-sensitive).
- **`practice/scripts/selftest.sh`** — fixture gained `—`, `…`, `café` and a lowercase
  `### task` heading so the twin diff can see both classes above.
- **`practice/scripts/baseline-harness.sh`** — corrected the `--bare` paragraph (it had
  quoted the help selectively, omitting "plugin sync" and "skills still resolve via
  /skill-name"); recorded the HOME-override dead end; added the `claudeMdExcludes` candidate;
  corrected A68's stale "PowerShell allows it" claim.
- **`PLATFORMS.md`** — antigravity install-path row now lists `~/.agents/skills` first.
- **`TICKETS.md`** — A33, A58b, A62b, A63b, A71, A73 amended; A74 opened then cancelled.

## 5. Resume instructions

**First, commit.** Run `/code-review high` over the staged diff, fix findings, then commit
and push. Suggested subject: `A73/A74 measured; installer pruner; taskwork.ps1 encoding`.

**Three one-time actions unblock everything else.** Each is the user's to grant:

1. **`claude -p` permission rule** → unblocks **A58b and A63b together**. Add to
   `.claude/settings.local.json` (gitignored, untracked, does not ship):
   ```json
   "permissions": { "allow": ["Bash(claude -p *)", "PowerShell(claude -p *)"] }
   ```
   An agent cannot add this itself — the classifier refuses it as `[Self-Modification]`,
   correctly. Then run, from Git Bash, one line:
   ```
   cd '/tmp/a58green' && claude -p "$(cat '/tmp/a58-prompt.txt')" \
     --plugin-dir '/tmp/a58pfx' --add-dir '/tmp/a58pfx' \
     --permission-mode bypassPermissions --output-format stream-json --verbose \
     > '/tmp/a58-green.jsonl' 2>&1; echo "exit=$?"
   ```
   Windows paths: `C:\Users\Ikran\AppData\Local\Temp\{a58green,a58pfx,a58-prompt.txt}`.
   **Grade on disk, not on self-report**: plan file exists with `assumed:` markers · zero
   new commits · no source file touched. Fixture is clean (1 commit, 0 dirty) as of handoff.

2. **One interactive `codex` run** with a `Stop` hook present, accepting the trust prompt
   → unblocks **A33**. Use `CODEX_HOME=~/.codex-bodish` (authenticates; the default
   `~/.codex` is 401). Then the `exec` re-run costs one command.

3. **`ANTHROPIC_API_KEY`** → the `--bare` route for A63b. *Try `claudeMdExcludes` first* —
   it needs no key and does not strip plugins.

**Do NOT** re-probe these; they are settled and recorded in the harness header: HOME/
USERPROFILE/HOMEDRIVE/HOMEPATH override (Windows resolves the profile via the OS);
`CLAUDE_CONFIG_DIR` (A63a); codex per-repo `.codex/hooks.json`; codex 0.154.0 as a version fix.

Temp fixtures still on disk (throwaway, safe to delete): `%TEMP%\a58green`, `a58pfx`,
`a58-prompt.txt`, `a62pi`, `a33b`, `pidiag`, `prunetest*`, `pt3`–`pt5`, `a63probe`.

## 6. Session log

Board went **3 open → 6 open**, but that is not a regression: pending went **1 → 0**, three
tickets moved from vague-deferred to precisely-blocked with a named unblock, A73 was
measured and closed, and A74 was opened and cancelled inside one session after measurement.

The recurring lesson, three times over: **every "cannot be probed from this machine" claim
on this board was stale.** codex had a newer build *and* working alternate homes; pi had a
working credential; the Gemini cost premise was simply false. Re-testing the blockers cost
less than the tickets had cost to maintain.
