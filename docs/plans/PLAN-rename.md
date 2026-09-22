# PLAN — name every skill for a character

**Revive with:** *"continue the rename plan"*. Read this file, check
`.skillator/run.md` for which stages landed, start at the first that has not.

**Convention** (`skill-smith` §1b): **`purpose-name`, purpose always first.**
The purpose is the job in one or two plain words; the name is a **character,
artefact, concept, place or weapon** **whose defining trait is that job**. When
no character fits the job cleanly, the artefact or the concept usually does —
`watch-palantir`, `watch-rampancy`, `relay-raptor`. Purpose-first without
exception — an agent scanning the list matches on the first token, so every
skill that does the same kind of work sorts together (`handoff-`, `merge-`,
`build-`, `spec-`). The `name-purpose` half of the earlier rule is withdrawn.

**The build family is science fiction only** — no literature, no mythology.

**Board:** F20. **Already done:** `relay-morpheus`, `tasks-sentinels` (F17),
`grayskull-power`, `design-arwen`, `sherlock-codes`.

---

## Candidate names — NEEDS SIGN-OFF BEFORE ANY `git mv`

Three per skill so the choice is a comparison, not a yes/no. **A** is the
recommendation. The three already conforming (`grayskull-power`,
`design-arwen`, `sherlock-codes`) and the two just done (`relay-morpheus`,
`tasks-sentinels`) carry alternatives only in case the owner wants them moved.

### Settled — owner sign-off 2026-09-22

| # | Current | New | Note |
|---|---|---|---|
| 1 | `a11y-proof` | `a11y-toph` | |
| 2 | `build-jarvis` | `build-jarvis` | Marvel AI, one per tier: the original assistant |
| 3 | `build-ultron` | `build-ultron` | powerful, autonomous, no ceremony |
| 4 | `build-vision` | `build-vision` | the refined one |
| 5 | `deploy-wizard` | `deploy-merlin` | prepares |
| 6 | `deploy-niyoj` | `deploy-niyoj` | **unchanged by owner's call** |
| 7 | `design-arwen` | `design-arwen` | unchanged |
| 8 | `func-ui` | `designui-galadriel` | owner's coinage — see the note below |
| 9 | `grayskull-power` | `grayskull-power` | **unchanged by owner's call**; the only name-first survivor, kept because it is the invocation |
| 13 | `live-friday` | `live-jarvis` | **clashes with 2** — see open question C |
| 18 | `screenshot-loop` | `screenshot-argus` | |
| 19 | `sherlock-codes` | `audit-sherlock` | |
| 21 | `spec-trace` | `spec-watson` | pairs with `audit-sherlock` |
| 22 | `ticket-master` | `tickets-zordon` | |
| 23 | `tui-proof` | `tui-tron` | |

**Note on 8.** `func-ui`'s job is wiring an existing mockup to real data — it
does not design anything; `design-arwen` (7) owns design. `designui-galadriel`
reads as a second design skill, and an agent choosing between `design-arwen`
and `designui-galadriel` has nothing in the names to go on. Taken as
instructed; flagged once. `wire-galadriel` or `realize-galadriel` keeps the
character and the distinction.

### Open — A: 10/11/12, one origin, three names

Marvel is the build family, The Matrix is B. Six origins; the last three use
artefacts and concepts where no character fits the job.

| | 10 `handoff-cortana` writes the doc | 11 `resume-cortana` executes it | 12 `watch-cortana` fires before cutoff |
|---|---|---|---|
| **a** Middle-earth | `handoff-bilbo` — hands the quest on, writes the book | `resume-frodo` — takes up what Bilbo put down | `watch-palantir` — the stone that shows what is coming |
| **b** Star Trek | `handoff-picard` — the captain's log | `resume-riker` — "you have the bridge" | `watch-uhura` — monitors every channel |
| **c** Harry Potter | `handoff-dumbledore` — leaves the instructions behind | `resume-harry` — carries them out | `watch-moody` — CONSTANT VIGILANCE |
| **d** Foundation | `handoff-seldon` — records a message for a future he will not see | `resume-foundation` — the ones who carry it out | `watch-vault` — the Time Vault opens exactly at the crisis |
| **e** Doctor Who | `handoff-doctor` — writes this self into the next | `resume-regeneration` — a new body, the same memories | `watch-tardis` — sees the fixed point coming |
| **f** Halo | `handoff-cortana` — the AI who writes herself down | `resume-chief` — carries her and acts on it | `watch-rampancy` — an AI that knows it is running out of time |

**f is the recommendation**, on one word: *rampancy* is an AI counting down its
own remaining life, which is `watch-cortana`'s entire job and is the closest fit
anywhere in this table. **d** is the runner-up — Seldon recording for a future
he will not see is the handoff itself.

### Settled — B, C, D

| # | Current | New | Note |
|---|---|---|---|
| 14 | `mergeprep-oracle` | `mergeprep-oracle` | **B = The Matrix** |
| 15 | `merge-smith` | `merge-smith` | merges himself into everything he touches |
| 16 | `relay-morpheus` | `relay-morpheus` | carries the message through — **second rename in a day**, see below |
| 17 | `tasks-sentinels` | `tasks-sentinels` | many units, one job each |
| 13 | `live-friday` | `live-friday` | **C** — read as c1, the recommendation. Say `c3` if `live-holodeck` was meant. |
| 20 | `skill-smith` | `skill-smith` | **D = f**, unchanged; already purpose-first and already says what it does |

**16 is renamed twice in one day** — `relay` → `relay-morpheus` this morning, now
→ `relay-morpheus`. That is the cost of settling the convention after starting
the renames, not a mistake to hide. Git carries both moves; the baselines
(`scenario-relay-morpheus.txt`, `green-relay-morpheus.txt`) follow it the second time
as they did the first. `r2d2` leaves the library entirely.

**Three names stay as they are by the owner's call:** `grayskull-power` (9),
because it is the invocation and reads name-first; `deploy-niyoj` (6); and
`skill-smith` (20), which already leads with its purpose. Recorded as
exceptions, not as the rule softening — `skill-smith` §1b says so outright, so
the next reader cannot infer the convention is optional.

## Superseded first pass



| Now | Proposed | Why that character |
|---|---|---|
| `a11y-proof` | `geordi-a11y` | Geordi La Forge is blind and his VISOR is assistive tech. The skill's subject is its wearer. |
| `func-ui` | `pinocchio-ui` | A puppet that becomes a real boy — a mock UI that becomes a working one. |
| `screenshot-loop` | `deckard-screenshot` | Blade Runner's enhance scene: read the image, find what's in it, act. |
| `ticket-master` | `mycroft-tickets` | Mycroft holds every record and never leaves the building. Pairs with `sherlock-codes`. |
| `spec-trace` | `ariadne-spec` | The thread you follow back out — requirements traced to evidence. |
| `tui-proof` | `tron-tui` | Tron lives inside the terminal. |
| `skill-smith` | `q-smith` | Q builds the gadgets other agents are issued. |
| `handoff-cortana` | `bilbo-handoff` | Bilbo hands the quest on and writes the book. |
| `resume-cortana` | `frodo-resume` | Frodo takes up what Bilbo put down. |
| `watch-cortana` | `heimdall-watch` | The watchman who sees it coming before it arrives. |
| `mergeprep-oracle` | `oracle-merge-prep` | The Oracle tells you what breaks before you walk into it. |
| `merge-smith` | `smith-merge` | Agent Smith merges himself into everything he touches. |
| `deploy-wizard` | `gandalf-deploy` | The wizard who plans the road, not the one who walks it. |
| `deploy-niyoj` | `scotty-ship` | The engineer who actually gets it into production, under protest. |
| `live-friday` | `jarvis-live` | Stark's always-on assistant, showing the build as it runs. |
| `build-jarvis` | `stark-build-lite` | Designs it, then builds it, at three budgets. |
| `build-ultron` | `stark-build-mid` | ” |
| `build-vision` | `stark-build-prime` | ” |

Two the table deliberately leaves alone: `grayskull-power` and `design-arwen`
already conform, and `sherlock-codes` is the pattern the rest are copying.

## Stages

### [ ] S1 — sign-off
The table above, approved or amended. **No `git mv` before this.** A rename is
a breaking change and doing it twice costs double.

### [ ] S2 — the mechanical rename, one skill per commit
Per skill: directory · `name:` frontmatter · `# Heading` · every
`skillator:<old>` reference · hook script filenames · `scenario-<skill>.txt`
and `green-<skill>.txt` · the `/slash` name in README.

**Does not follow:** fixture names in `practice/scripts/baseline-harness.sh`
(`func-ui`, `handoff-cortana`, `relay`, `fanout`, `spec-drift*`) — they name a fixture,
not a skill, and every recorded verdict cites them by those names. Renaming
them would break the reproduce-from-a-committed-scenario contract that
`practice/baselines/README.md` is built on.

**Also does not follow:** historical prose in `TICKETS.md` closed entries,
`docs/handoffs/*` and recorded baseline verdicts. Those describe what happened
under the old name. Amending them is rewriting the record.

### [ ] S3 — the references nothing greps
`PLATFORMS.md` tables · `PRACTICE.md` §-to-skill map · `CASEFILE.md` ·
`WORKFLOW.md` · every skill's own "Related"/routing lines · `install.sh` and
`install.ps1` if either names a skill explicitly · `.claude-plugin/plugin.json`
description and keywords.

### [ ] S4 — prove nothing dangles
`check-grayskull-sync.sh`, `check-tickets.sh`, `baseline-harness.sh selftest`,
both hook selftests, then a repo-wide grep for each old name that must return
only historical prose. Version bump, `/code-review`, commit.

## Standing decisions

- One skill per commit in S2, so a name that turns out wrong costs one revert.
- The `install.sh` layout resolves skills by directory listing, not a manifest,
  so no installer change is needed for the names themselves — verify, don't
  assume.
- Anyone with these skills installed gets new directories and stale old ones.
  S4 says so in the release note; it does not try to clean a user's machine.
