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

| # | Current | What it does | a — recommended | b | c |
|---|---|---|---|---|---|
| 1 | `a11y-proof` | Accessibility as the subject — WCAG audits, "can't tab to it", "screen reader reads nothing" | **`a11y-geordi`** — blind; the VISOR *is* assistive tech | `a11y-daredevil` | `a11y-toph` |
| 2 | `brainstorm-build-lite` | Design→build, cheap tier; mechanical parts go to a smaller model | **`build-stark-lite`** — built it in a cave, with scraps | `build-genesis-lite` — a device that makes a world from a spec | `build-holodeck-lite` |
| 3 | `brainstorm-build-mid` | Design→build, all-Opus, autonomous, no ceremony | **`build-stark-mid`** | `build-genesis-mid` | `build-holodeck-mid` |
| 4 | `brainstorm-build-prime` | Design→build, top tier — creative design plus ceremony that survives context loss | **`build-stark-prime`** | `build-genesis-prime` | `build-holodeck-prime` |
| 5 | `deploy-wizard` | **Prepares** a deployment — scaffolds a single-VPS app before it ships | **`deploy-gandalf`** — plans the road, does not walk it | `deployprep-merlin` | `scaffold-yoda` |
| 6 | `deploy-niyoj` | **Executes** it — one-button deploy from the laptop, no CI | **`ship-scotty`** — gets it into production, under protest | `ship-wash` | `launch-bifrost` |
| 7 | `design-arwen` | Build, redesign or critique any UI/UX, native or web | **`design-arwen`** — unchanged, already purpose-first | `design-galadriel` | `design-elrond` |
| 8 | `func-ui` | Turns a UI-only mockup with fake data into a real, wired-up app | **`wire-pinocchio`** — a puppet that becomes real | `realize-galatea` | `func-data` |
| 9 | `grayskull-power` | The session router — arms the standing skills, routes every request | **`power-grayskull`** — keeps the invocation, flips the halves | `route-grayskull` | `devmode-zordon` |
| 10 | `handoff` | Writes a verified session handoff so the next session loses nothing | **`handoff-bilbo`** — hands the quest on, writes the book | `handoff-leonard` — Memento: notes for a self who will forget | `handoff-hermes` |
| 11 | `handoff-resume` | Executes a handoff doc — picks up the pending tasks | **`resume-frodo`** — takes up what Bilbo put down | `resume-samwise` | `resume-lazarus` |
| 12 | `handoff-watch` | Hooks that watch the usage limits and force a handoff before cutoff | **`watch-heimdall`** — sees it coming before it arrives | `watch-cassandra` | `watch-argus` |
| 13 | `live-build` | Runs the app while you work, so the user watches it change | **`live-jarvis`** — always-on, shows the build as it runs | `live-friday` | `live-hal` |
| 14 | `merge-prep` | Normalises a branch before merge — strips stale parts so only real changes land | **`mergeprep-oracle`** — what breaks before you walk in | `mergeprep-palantir` | `mergeprep-tiresias` |
| 15 | `merge-agent` | Consolidates branches and resolves the conflicts | **`merge-smith`** — merges himself into everything | `merge-borg` | `merge-voltron` |
| 16 | `r2d2-relay` | Keeps a staged run recoverable across a dropped session | **`relay-r2d2`** — flipped to purpose-first | `relay-samwise` | `relay-ariadne` |
| 17 | `replicator-agent` | Executes a written plan, one fresh agent per task, reviewed each time | **`tasks-replicator`** — flipped to purpose-first | `dispatch-replicator` | `agents-kamino` |
| 18 | `screenshot-loop` | Reads test screenshots dropped in a folder, acts on them, clears them | **`screenshot-deckard`** — the enhance scene | `screenshot-rekall` | `screenshot-argus` |
| 19 | `sherlock-codes` | Full-application forensic audit — the defects nobody filed | **`audit-sherlock`** — flipped to purpose-first | `audit-poirot` | `audit-columbo` |
| 20 | `skill-smith` | Writes, edits and diagnoses agent skills | **`skills-q`** — builds the gadgets others are issued | `skills-geppetto` | `skills-daedalus` |
| 21 | `spec-trace` | Turns a spoken or chat-only brief into stable requirement ids traced to evidence | **`spec-ariadne`** — the thread back out | `spec-hansel` | `spec-watson` |
| 22 | `ticket-master` | The `TICKETS.md` board — serialised bug / feature / agent-found ids | **`tickets-mycroft`** — holds every record, never leaves the building | `tickets-zordon` | `tickets-fury` |
| 23 | `tui-proof` | Proves a terminal UI actually renders, at every width | **`tui-tron`** — lives inside the terminal | `tui-flynn` | `tui-neo` |

Answer by number and letter — `1a 2b 5c` — and anything unstated takes **a**.

**Clashes, only if a `b`/`c` is picked:** `argus` is 12c and 18c; `daedalus` is
20c, and left rows 2-4 when the build family went sci-only; `cassandra` (12b)
and `tiresias` (14c) are the same joke. One character, one skill.

**Nothing is grandfathered.** `design-arwen`, `grayskull-power`,
`sherlock-codes`, `r2d2-relay` and `replicator-agent` are all in the table —
four of them only conformed under the withdrawn `name-purpose` half.

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
