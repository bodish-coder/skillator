# A162 staged fix

Worktree: `C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0023-final-a162`
Branch: `fix/RUN-0023-A162`; unchanged HEAD `62673a16c8b70676b857eabef5ff34cdb78b1710` (reviewed font fix retained).
Status: 15 scoped files staged; no commit. Independent review required before commit.

Verified cause: pre-F112 PLAN without mode is refused by marathon-run, but marathon-plan's unconditional open-run duplicate filter skips its tickets, leaving no recovery. Quoted JSON mode keys also need property-aware reading rather than searching for an unquoted `mode:` line.

Change: the 13 marathon command/reference texts now route an explicit matching ticket selection to a planning-only legacy recovery branch before duplicate filtering. It backs up the old script, regenerates current-template meta/PLAN from existing pending records, preserves run/worktree/branch/IDs/codes/prompts/dependencies/history, and never executes legacy scripts, allocates stages, invokes chain plan for existing stages, or dispatches workers. Modern plans retain their duplicate guard. Active/uncertain worker state, mixed/ambiguous selection, ownership refusal, held/failed records, or inconsistent records refuse with concrete target guidance. Existing F112 mode tables and host owner/driver clauses remain intact. Both installers pin the six recovery decisions and all host routing text.

Ruling (controller approved): pending-only recovery is the bounded fix. Failed legacy stages require the existing documented retry/replacement flow outside recovery, then planning can use the pending successor. This is conservative policy, NOT a claim that the dispatcher cannot accept `!`: relay-morpheus.sh:1442 accepts pending/failed and reuses failed worktrees at :1494; chain next nevertheless omits failed rows and the documented retry convention creates a successor. No partially built failed stage is automatically replayed here.

Evidence (all under this report directory):
- `A162-focused.py`: deterministic text retrieval/decision fixtures across 13 texts, six legacy/modern/active/mixed/failed/held cases, existing F112 mode rows and stage-code guard. Before edit: `A162-red.txt`, 32 expected failures. After: `A162-green.txt`, 0 failures.
- `A162-extract-checks.py` extracts the actual F112 assertion blocks (including added A162 checks) from current install.sh/install.ps1 into `A162-installer-pins.sh` and `.ps1`; no substitute assertion implementation. `A162-sh-pins.txt` and `A162-ps-pins.txt`: both PASS, including original template over-wide sequential-phase rejection and exact old host pins. Gemini marathon TOML parse passed.
- `git diff --cached --check`: passed. Staged scope is exactly marathon.md, 12 command copies, install.sh/install.ps1. No template, UI/font, boards, run ledgers, or primary RUN worktree edits.

Reproduce focused checks from main checkout:
`python .skillator/reports/A162-focused.py .skillator/worktrees/RUN-0023-final-a162`
`python .skillator/reports/A162-extract-checks.py`
`bash .skillator/reports/F114-shell-bridge.sh sh .skillator/reports/A162-installer-pins.sh`
`powershell -NoProfile -ExecutionPolicy Bypass -File .skillator/reports/A162-installer-pins.ps1`

Limits: prompt retrieval fixtures are not a live model or live legacy-run migration. No paid models, subagents or real legacy script execution. Per controller, full 20-minute installer suites are deferred to one final shared tree including other fixes; not claimed run for A162. Source tests introduce no new flags or grammar.

## Reviewed commit

Controller reported independent scoped automation review LAND and authorized commit.
Committed exactly the staged 15 files as `ba587858c3bbdd6cc87768a15a62f1c4f0461d73`:
`A162: regenerate eligible legacy marathon plans before duplicate filtering`.
Post-commit `git status --short` is empty. Main `codegraph sync C:/tools/Projects/skillator2`
completed successfully (79 changed files, 2,494 nodes). No full installer rerun or run-branch merge.
