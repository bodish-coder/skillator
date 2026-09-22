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
`grayskull-power`, `design-arwen`, `audit-sherlock`.

---

## Candidate names — NEEDS SIGN-OFF BEFORE ANY `git mv`

Three per skill so the choice is a comparison, not a yes/no. **A** is the
recommendation. The three already conforming (`grayskull-power`,
`design-arwen`, `audit-sherlock`) and the two just done (`relay-morpheus`,
`tasks-sentinels`) carry alternatives only in case the owner wants them moved.

### Settled — owner sign-off 2026-09-22

| # | Current | New | Note |
|---|---|---|---|
| 1 | `a11y-proof` | `a11y-toph` | |
| 2 | `brainstorm-build-lite` | `build-jarvis` | Marvel AI, one per tier: the original assistant |
| 3 | `brainstorm-build-mid` | `build-ultron` | powerful, autonomous, no ceremony |
| 4 | `brainstorm-build-prime` | `build-vision` | the refined one |
| 5 | `deploy-wizard` | `deploy-merlin` | prepares |
| 6 | `deploy-niyoj` | `deploy-niyoj` | **unchanged by owner's call** |
| 7 | `design-arwen` | `design-arwen` | unchanged; the only name that already conformed |
| 8 | `func-ui` | `designui-galadriel` | owner's coinage — see the note below |
| 9 | `grayskull-power` | `grayskull-power` | **unchanged by owner's call**; kept because it is the invocation |
| 10 | `handoff` | `handoff-cortana` | **A** — the AI who writes herself down |
| 11 | `handoff-resume` | `resume-cortana` | |
| 12 | `handoff-watch` | `watch-cortana` | rampancy: an AI that knows it is running out of time |
| 13 | `live-build` | `live-friday` | **C** — read as c1; `jarvis` went to row 2 |
| 14 | `merge-prep` | `mergeprep-oracle` | **B = The Matrix** |
| 15 | `merge-agent` | `merge-smith` | merges himself into everything he touches |
| 16 | `r2d2-relay` | `relay-morpheus` | **second rename in a day** — see below |
| 17 | `replicator-agent` | `tasks-sentinels` | many units, one job each |
| 18 | `screenshot-loop` | `screenshot-argus` | |
| 19 | `sherlock-codes` | `audit-sherlock` | |
| 20 | `skill-smith` | `skill-smith` | **unchanged**; already purpose-led |
| 21 | `spec-trace` | `spec-watson` | pairs with `audit-sherlock` |
| 22 | `ticket-master` | `tickets-zordon` | |
| 23 | `tui-proof` | `tui-tron` | |

**This table was destroyed once and rebuilt from the commits.** The S2 sweep
that rewrote bare cross-references ran over it and replaced the *Current*
column with the new names, leaving 23 rows reading `a11y-toph -> a11y-toph`.
The one document recording what was renamed from what stopped recording it, and
nothing failed. A record inside a repo being renamed needs the same protection
as a recorded verdict, and had none.

**Note on 8.** `designui-galadriel`'s job is wiring an existing mockup to real data — it
does not design anything; `design-arwen` (7) owns design. `designui-galadriel`
reads as a second design skill, and an agent choosing between `design-arwen`
and `designui-galadriel` has nothing in the names to go on. Taken as
instructed; flagged once. `wire-galadriel` or `realize-galadriel` keeps the
character and the distinction.

### [ ] S1 — sign-off
The table above, approved or amended. **No `git mv` before this.** A rename is
a breaking change and doing it twice costs double.

### [x] S2 — the mechanical rename (done, grouped by family)

**Landed in five commits, grouped by family rather than one per skill** — the
names were signed off, so the per-skill revert the plan was pricing had no
buyer, and 19 commits of identical churn would bury the four that mattered.

| Family | Skills |
|---|---|
| Cortana | `handoff-cortana` `resume-cortana` `watch-cortana` |
| Marvel AI | `build-jarvis` `build-ultron` `build-vision` `live-friday` |
| The Matrix | `mergeprep-oracle` `merge-smith` `relay-morpheus` `tasks-sentinels` |
| Singles | `a11y-toph` `deploy-merlin` `designui-galadriel` `screenshot-argus` `audit-sherlock` `spec-watson` `tickets-zordon` `tui-tron` |

Three passes were needed per family, and only the first is mechanical:

1. `ren.py` — directory, hook filenames, `name:` frontmatter, baselines, and
   references in shapes that can only be a skill reference.
2. **`# headings`** — 20 of 23 still announced the old name. `ren.py` does not
   touch them and should not: a heading is prose.
3. **Bare cross-references** — the skills name each other without backticks in
   their own descriptions ("use brainstorm-build-mid"), and `WORKFLOW.md` /
   `CASEFILE.md` used bare `-mid` / `-lite` shorthands that became unreadable
   the moment the prefix changed.

Not renamed, deliberately: harness fixture names (`func-ui`, `handoff`,
`relay`), `~/.claude/handoff-watch/` (storage, not a reference — moving it
strands live sessions' flags), and the recorded prose in `TICKETS.md`,
`CASEFILE.md`, `docs/handoffs/` and baseline verdicts.

Per skill: directory · `name:` frontmatter · `# Heading` · every
`skillator:<old>` reference · hook script filenames · `scenario-<skill>.txt`
and `green-<skill>.txt` · the `/slash` name in README.

**Does not follow:** fixture names in `practice/scripts/baseline-harness.sh`
(`designui-galadriel`, `handoff-cortana`, `relay`, `fanout`, `spec-drift*`) — they name a fixture,
not a skill, and every recorded verdict cites them by those names. Renaming
them would break the reproduce-from-a-committed-scenario contract that
`practice/baselines/README.md` is built on.

**Also does not follow:** historical prose in `TICKETS.md` closed entries,
`docs/handoffs/*` and recorded baseline verdicts. Those describe what happened
under the old name. Amending them is rewriting the record.

### [x] S3 — the references nothing greps

Swept by resolving every reference rather than by eye: each `skillator:<name>`,
each `skills/<name>/` path and each `scenario-*.txt` / `green-*.txt` path was
checked against what is actually on disk. Everything still naming an old skill
sits in a **record** — `TICKETS.md` closed entries, `docs/handoffs/`,
and the verdict prose inside baseline files — which is correct: those say what
happened, under the name it happened under.

`CASEFILE.md` is the exception, and it went the other way. The sweep had
already renamed half of it, leaving single findings that named the same skill
two ways. It was finished rather than reverted, because a finding's value is
its `file:line` citation and a citation that does not resolve is worthless —
with a dated note at the top of the file saying the names were rewritten, so
the alteration is not silent. That note is the whole difference between
updating a record and falsifying one.

One distinction the sweep forced: a **path** follows the rename even inside a
record, because a path that does not resolve is a defect whatever the prose
around it says. `practice/baselines/README.md` had five of those. The sentence
"the run answered NO to `skillator:func-ui`" stays as written.

`install.sh` and `install.ps1` name no skill — they enumerate the directory, so
nothing there needed touching. Verified rather than assumed.

`PLATFORMS.md` tables · `PRACTICE.md` §-to-skill map · `CASEFILE.md` ·
`WORKFLOW.md` · every skill's own "Related"/routing lines · `install.sh` and
`install.ps1` if either names a skill explicitly · `.claude-plugin/plugin.json`
description and keywords.

### [~] S4 — prove nothing dangles
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
