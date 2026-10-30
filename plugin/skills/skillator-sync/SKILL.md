---
name: skillator-sync
description: >-
  Use when the user says "/skillator-sync", "skillator-sync", "sync upstream
  skills", "check upstream skills", "absorb upstream", or wants to sweep
  tracked UPSTREAM.md manifests (code-yoda, design-arwen, clone-odo), inspect
  upstream commit diffs and rule changes, and absorb new upstream commit hashes
  into local skills. NOT for updating the installed skillator plugin across
  hosts (skillator-update) or syncing TICKETS.md status rows (sync-tickets).
---

# skillator-sync — detect and absorb upstream skill updates

Sweeps every `skills/*/UPSTREAM.md` manifest (`code-yoda`, `design-arwen`,
`clone-odo`), compares each watched path against its recorded absorbed commit
via `practice/scripts/upstream-check.{sh,ps1}`, prints GitHub compare URLs for
any upstream that moved ahead, and walks the structured absorption workflow.

## 1. Sweep (`check`)

Run the helper script from this skill's `scripts/` folder (`$SYNC` below):

- Unix / Git Bash: `sh "$SYNC/skillator-sync.sh" check [$ARGUMENTS]`
- Windows PowerShell: `powershell -NoProfile -ExecutionPolicy Bypass -File "$SYNC/skillator-sync.ps1" check [$ARGUMENTS]`

Flags:
- `[SKILL...]` — optional skill names (e.g. `code-yoda design-arwen`); omit to
  sweep every `skills/*/UPSTREAM.md`.
- `--daily` / `-Daily` — pass through per-skill daily stamp throttle.
- `--skills-dir <DIR>` / `-SkillsDir <DIR>` — override the skills root.

Output per upstream row under `## Upstreams`:

```text
unchanged <skill> <name> <sha7>
changed   <skill> <name> <old7>..<new7> https://github.com/<owner>/<repo>/compare/<old40>...<new40>
error     <skill> <name> <reason>
summary: <u_cnt> unchanged, <c_cnt> changed, <e_cnt> error
```

Exit codes: `0` all unchanged (or skipped), `1` at least one changed (and no
errors), `2` any error.

All unchanged → report the summary line and stop.

## 2. Diff & rule-mapping summary (for each `changed` row)

Never bump an absorbed commit without reading and mapping the upstream diff:

1. **Read the diff.** Fetch the compare range `<old40>...<new40>` for the row's
   `Watched paths` (via `gh api repos/<owner>/<repo>/compare/<old40>...<new40>`
   or the compare URL). Read every hunk in watched paths, not commit titles
   alone.
2. **Present the compare link and rule summary.** Show the user one table per
   changed upstream:
   - The clickable GitHub compare URL (`https://github.com/<owner>/<repo>/compare/<old40>...<new40>`).
   - Each rule or tool change in the watched paths, proposed verdict (`adopt`,
     `adapt`, `reject`, `already held`, or `unchanged`), and the target local
     file/section in `<skill>` (or the reason it does not land).
3. **Confirm before editing local skill files** when interactive; in a headless
   or relay run, apply only clear mechanical updates or log an `A` ticket
   (`absorb <name> <old7>..<new7> into <skill>`) as each manifest's
   `## When the check reports a change` specifies.

## 3. Revise local skill files & record the absorption (`absorb`)

Once the rule mapping is settled for `<skill>` / `<name>`:

1. **Revise the skill.** Edit `<skill>/SKILL.md`, `references/*`, or `scripts/*`
   in skillator's voice for every `adopt` / `adapt` row, and append the
   verdict table to `<skill>/UPSTREAM.md` (and any skill-specific report such as
   `docs/plans/F23-upstream/<name>.md` for `design-arwen`). Run the skill's
   checks/selftests (and RED/GREEN scenarios via `skill-prometheus` when a new
   behavioural rule lands).
2. **Update the absorbed commit hash and date:**
   - Unix: `sh "$SYNC/skillator-sync.sh" absorb <skill> <name> <new-40-hex-sha> [--date YYYY-MM-DD]`
   - Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File "$SYNC/skillator-sync.ps1" absorb <skill> <name> <new-40-hex-sha> [-Date YYYY-MM-DD]`
3. **Re-verify.** Re-run `check <skill>` and confirm the row now prints
   `unchanged <skill> <name> <new7>` with exit `0`.

## 4. Self-test

- Unix: `sh "$SYNC/skillator-sync.sh" --selftest`
- Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File "$SYNC/skillator-sync.ps1" -Selftest`
