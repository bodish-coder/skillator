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

## Proposed names — NEEDS SIGN-OFF BEFORE ANY `git mv`

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
