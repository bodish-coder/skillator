# PLAN — name every skill for a character

**Revive with:** *"continue the rename plan"*. Read this file, check
`.skillator/run.md` for which stages landed, start at the first that has not.

**Convention** (`skill-smith` §1b): `name-purpose` or `purpose-name`, where the
name is a fantasy or sci-fi character **whose defining trait is the job**, and
the purpose is the job in one or two plain words. Both halves, always — an
agent scanning twenty skills reads names before descriptions, and `arwen`
alone says nothing about UI.

**Board:** F20. **Already done:** `r2d2-relay`, `replicator-agent` (F17),
`grayskull-power`, `design-arwen`, `sherlock-codes`.

---

## Candidate names — NEEDS SIGN-OFF BEFORE ANY `git mv`

Three per skill so the choice is a comparison, not a yes/no. **A** is the
recommendation. The three already conforming (`grayskull-power`,
`design-arwen`, `sherlock-codes`) and the two just done (`r2d2-relay`,
`replicator-agent`) carry alternatives only in case the owner wants them moved.

| Current | What it does | A — recommended | B | C |
|---|---|---|---|---|
| `a11y-proof` | Accessibility as the subject — WCAG audits, "can't tab to it", "screen reader reads nothing" | **`geordi-a11y`** — blind; the VISOR *is* assistive tech | `daredevil-a11y` | `toph-a11y` |
| `brainstorm-build-lite` | Design→build at the cheap tier; offloads mechanical parts to a smaller model | **`stark-build-lite`** — designs it, then builds it | `daedalus-build-lite` | `hephaestus-build-lite` |
| `brainstorm-build-mid` | Design→build, all-Opus, autonomous, no ceremony | **`stark-build-mid`** | `daedalus-build-mid` | `hephaestus-build-mid` |
| `brainstorm-build-prime` | Design→build, top tier — creative design plus the ceremony that survives context loss | **`stark-build-prime`** | `daedalus-build-prime` | `hephaestus-build-prime` |
| `deploy-wizard` | **Prepares** a deployment — scaffolds a single-VPS app before it ships | **`gandalf-deploy`** — plans the road, does not walk it | `merlin-deploy` | `yoda-deploy` |
| `deploy-niyoj` | **Executes** it — one-button deploy from the laptop, no CI | **`scotty-ship`** — gets it into production, under protest | `wash-deploy` | `bifrost-deploy` |
| `design-arwen` | Build, redesign or critique any UI/UX, native or web | **keep** | `galadriel-design` | `elrond-design` |
| `func-ui` | Turns a UI-only mockup with fake data into a real, wired-up app | **`pinocchio-ui`** — a puppet that becomes real | `galatea-ui` | `data-ui` |
| `grayskull-power` | The session router — arms the standing skills, routes every request | **keep** | `zordon-power` | `oz-power` |
| `handoff` | Writes a verified session handoff so the next session loses nothing | **`bilbo-handoff`** — hands the quest on, writes the book | `leonard-handoff` | `hermes-handoff` |
| `handoff-resume` | Executes a handoff doc — picks up the pending tasks | **`frodo-resume`** — takes up what Bilbo put down | `samwise-resume` | `lazarus-resume` |
| `handoff-watch` | Hooks that watch the usage limits and force a handoff before cutoff | **`heimdall-watch`** — sees it coming before it arrives | `cassandra-watch` | `argus-watch` |
| `live-build` | Runs the app while you work, so the user watches it change | **`jarvis-live`** — always-on, shows the build as it runs | `friday-live` | `hal-live` |
| `merge-prep` | Normalises a branch before merge — strips stale parts so only real changes land | **`oracle-merge-prep`** — what breaks before you walk in | `palantir-merge-prep` | `tiresias-merge-prep` |
| `merge-agent` | Consolidates branches and resolves the conflicts | **`smith-merge`** — merges himself into everything | `borg-merge` | `voltron-merge` |
| `r2d2-relay` | Keeps a staged run recoverable across a dropped session | **keep** (done) | `samwise-relay` | `ariadne-relay` |
| `replicator-agent` | Executes a written plan, one fresh agent per task, reviewed each time | **keep** (done) | `kamino-agent` | `clone-agent` |
| `screenshot-loop` | Reads test screenshots dropped in a folder, acts on them, clears them | **`deckard-screenshot`** — the enhance scene | `rekall-screenshot` | `argus-screenshot` |
| `sherlock-codes` | Full-application forensic audit — the defects nobody filed | **keep** | `poirot-codes` | `columbo-codes` |
| `skill-smith` | Writes, edits and diagnoses agent skills | **`q-smith`** — builds the gadgets others are issued | `geppetto-skills` | `daedalus-skills` |
| `spec-trace` | Turns a spoken or chat-only brief into stable requirement ids traced to evidence | **`ariadne-spec`** — the thread back out | `hansel-spec` | `watson-spec` |
| `ticket-master` | The `TICKETS.md` board — serialised bug / feature / agent-found ids | **`mycroft-tickets`** — holds every record, never leaves the building | `zordon-tickets` | `fury-tickets` |
| `tui-proof` | Proves a terminal UI actually renders, at every width | **`tron-tui`** — lives inside the terminal | `flynn-tui` | `neo-tui` |

**Known clashes to resolve at sign-off:** `argus` appears twice (B in
`handoff-watch`, C in `screenshot-loop`); `daedalus` and `hephaestus` appear in
both the build family and `skill-smith`; `cassandra` and `tiresias` are the same
joke in `handoff-watch` and `merge-prep`. One character, one skill.

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
