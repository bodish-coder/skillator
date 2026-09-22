# PLAN — name every skill for a character

**Revive with:** *"continue the rename plan"*. Read this file, check
`.skillator/run.md` for which stages landed, start at the first that has not.

**Convention** (`skill-smith` §1b): **`purpose-name`, purpose always first.**
The purpose is the job in one or two plain words; the name is a character,
concept or artefact **whose defining trait is that job**. Purpose-first without
exception — an agent scanning the list matches on the first token, so every
skill that does the same kind of work sorts together (`handoff-`, `merge-`,
`build-`, `spec-`). The `name-purpose` half of the earlier rule is withdrawn.

**The build family is science fiction only** — no literature, no mythology.

**Board:** F20. **Already done:** `r2d2-relay`, `replicator-agent` (F17),
`grayskull-power`, `design-arwen`, `sherlock-codes`.

---

## Candidate names — NEEDS SIGN-OFF BEFORE ANY `git mv`

Three per skill so the choice is a comparison, not a yes/no. **A** is the
recommendation. The three already conforming (`grayskull-power`,
`design-arwen`, `sherlock-codes`) and the two just done (`r2d2-relay`,
`replicator-agent`) carry alternatives only in case the owner wants them moved.

### Settled — owner sign-off 2026-09-22

| # | Current | New | Note |
|---|---|---|---|
| 1 | `a11y-proof` | `a11y-toph` | |
| 2 | `brainstorm-build-lite` | `build-jarvis` | Marvel AI, one per tier: the original assistant |
| 3 | `brainstorm-build-mid` | `build-ultron` | powerful, autonomous, no ceremony |
| 4 | `brainstorm-build-prime` | `build-vision` | the refined one |
| 5 | `deploy-wizard` | `deploy-merlin` | prepares |
| 6 | `deploy-niyoj` | `deploy-niyoj` | **unchanged by owner's call** |
| 7 | `design-arwen` | `design-arwen` | unchanged |
| 8 | `func-ui` | `designui-galadriel` | owner's coinage — see the note below |
| 9 | `grayskull-power` | `grayskull-power` | **unchanged by owner's call**; the only name-first survivor, kept because it is the invocation |
| 13 | `live-build` | `live-jarvis` | **clashes with 2** — see open question C |
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

Not Marvel (that is the build family). Each option is a matched trio.

| | 10 `handoff` writes the doc | 11 `handoff-resume` executes it | 12 `handoff-watch` fires before cutoff |
|---|---|---|---|
| **a** Middle-earth | `handoff-bilbo` — hands the quest on, writes the book | `resume-frodo` — takes up what Bilbo put down | `watch-palantir` — the stone that shows what is coming |
| **b** Star Trek | `handoff-picard` — the captain's log | `resume-riker` — "you have the bridge" | `watch-uhura` — monitors every channel |
| **c** Harry Potter | `handoff-dumbledore` — leaves the instructions behind | `resume-harry` — carries them out | `watch-moody` — CONSTANT VIGILANCE |

### Open — B: 14/15/16/17, one origin, four names

| | 14 `merge-prep` normalises the branch | 15 `merge-agent` merges, resolves conflicts | 16 `r2d2-relay` staged-run ledger | 17 `replicator-agent` one agent per task |
|---|---|---|---|---|
| **a** The Matrix | `mergeprep-oracle` — tells you what breaks | `merge-smith` — merges into everything he touches | `relay-morpheus` — carries the message through | `tasks-sentinels` — many units, one job each |
| **b** Battlestar Galactica | `mergeprep-oracle` — BSG has its own | `merge-cylon` — resurrection, many into one | `relay-raptor` — the scout that carries word between ships | `tasks-centurion` — built to do one thing |
| **c** Star Wars | `mergeprep-obiwan` — checks the ground first | `merge-vader` — two selves, one body | `relay-r2d2` — **already done, no rename cost** | `tasks-clones` — grown to order, one per post |

`c` is the only option that leaves 16 alone; it was renamed to `r2d2-relay`
an hour ago and `a`/`b` would rename it twice.

### Open — C: the `jarvis` clash

2 is `build-jarvis` and 13 is `live-jarvis`. One character, one skill.

- **c1** — 13 becomes `live-friday`. Stark's *later* always-on assistant; stays
  Marvel, keeps the build family intact, nothing else moves. **Recommended.**
- **c2** — 2 becomes something else and 13 keeps `jarvis`. Costs a name in the
  Marvel trio, which was chosen as a set.
- **c3** — 13 becomes `live-holodeck`. Run it and watch it, no character.

### Open — D: 20 `skill-smith`, more options

| | Name | Why |
|---|---|---|
| **a** | `skills-q` | builds the gadgets other agents are issued |
| **b** | `skills-forge` | X-Men's Forge — inventing devices *is* his power |
| **c** | `skills-shuri` | designs the tech everyone else in the story uses |
| **d** | `skills-geppetto` | makes the thing that then acts on its own |
| **e** | `skills-daedalus` | the maker of makers |
| **f** | `skill-smith` | unchanged — already purpose-first and already says it |

**Two names stay name-first by owner's call:** `grayskull-power` (9) because it
is the invocation, and `deploy-niyoj` (6). The convention still reads
purpose-first without exception; these are recorded exceptions, not a softening
of it, and `skill-smith` §1b should say so rather than let the next reader infer
the rule is optional.

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
| `handoff` | `bilbo-handoff` | Bilbo hands the quest on and writes the book. |
| `handoff-resume` | `frodo-resume` | Frodo takes up what Bilbo put down. |
| `handoff-watch` | `heimdall-watch` | The watchman who sees it coming before it arrives. |
| `merge-prep` | `oracle-merge-prep` | The Oracle tells you what breaks before you walk into it. |
| `merge-agent` | `smith-merge` | Agent Smith merges himself into everything he touches. |
| `deploy-wizard` | `gandalf-deploy` | The wizard who plans the road, not the one who walks it. |
| `deploy-niyoj` | `scotty-ship` | The engineer who actually gets it into production, under protest. |
| `live-build` | `jarvis-live` | Stark's always-on assistant, showing the build as it runs. |
| `brainstorm-build-lite` | `stark-build-lite` | Designs it, then builds it, at three budgets. |
| `brainstorm-build-mid` | `stark-build-mid` | ” |
| `brainstorm-build-prime` | `stark-build-prime` | ” |

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
(`func-ui`, `handoff`, `relay`, `fanout`, `spec-drift*`) — they name a fixture,
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
