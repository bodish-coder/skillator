# Merge 2026-10-26 - origin/ccr-0af663c7-2ecnqn INTO main

- mode: into-base · direction confirmed by owner (@sher): "Merge first, then run"
- base: local main at c8a8c98 (57 commits ahead of origin/main, unpushed, not diverged - owner: "here locally")
- integration branch: integration/2026-10-26-ccr-f97-clone-odo (worktree .skillator/worktrees/integration-ccr-f97)
- source: origin/ccr-0af663c7-2ecnqn @ 0b47677 (8 commits, cloud session: F97 clone-odo skill, ship at 4.20.0), merge base c391439
- relay: RUN-0023 stage 174
- attributes: TICKETS.md `merge: tickets` (renumber-tickets driver) - treated as semantic, checked by hand
- risk: med - overlaps main on TICKETS.md, 4 manifests, install.ps1/.sh; no migrations/auth/lockfiles

## Hunks

| file | hunk | class | why | take | who |
|---|---|---|---|---|---|
| .claude-plugin/marketplace.json | description+version | trivial | main changed only version 4.19.0->4.20.0; source changed version to the same 4.20.0 and inserted the clone-odo clause | source | main session (opus) |
| plugin/.claude-plugin/plugin.json | description+version | trivial | same as above | source | main session (opus) |
| plugin/.muse-plugin/marketplace.json | description+version | trivial | same as above | source | main session (opus) |
| plugin/.muse-plugin/plugin.json | version+description | trivial | same as above | source | main session (opus) |
| plugin/install.ps1 | selftest file list, odo selftest | clean | additive, auto-merged | both | git |
| plugin/install.sh | selftest file list, odo selftest | clean | additive, auto-merged | both | git |
| TICKETS.md | F97 collision | semantic | main F97 = ops band session owner; source F97 = clone-odo | renumbered | renumber-tickets.sh |

## Renumbered

map: F97 -> F107 (source lines only; commit messages keep F97)
- TICKETS.md:106, :191
- docs/sessions/session-2026-10-26-clone-odo.md (13 lines)
- plugin/practice/baselines/{green,scenario}-clone-odo-{cleanroom,reviews}.txt:1
- plugin/practice/scripts/baseline-harness.sh:1805, :2106, :3084
- plugin/skills/clone-odo/UPSTREAM.md:3

## Reconcile (merge commit 6d2d846)

- direction 1 (source arrived): 71 paths, 8 FAIL - all `take: renumbered` (TICKETS.md, the session doc, 4 baselines, baseline-harness.sh, UPSTREAM.md: each differs from the source only by F97 -> F107)
- direction 2 (main undisturbed): 52 paths, 5 FAIL - the 4 manifests (`take: source`; main's only change, version 4.20.0, is present) and TICKETS.md (renumbered; main's lines untouched)
- unexplained: none

## Hazard check

- check-tickets.sh: exit 0, no duplicate IDs
- odo.sh selftest: 56 tests ok · check-routing.sh ok · check-muse-manifest.sh ok · check-grayskull-sync.sh ok

## Notes

- Both sides claim 4.20.0. RUN-0023's final stage (172) bumps past it, so the next push carries one version for both.
