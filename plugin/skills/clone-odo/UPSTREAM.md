# clone-odo upstream

clone-odo absorbs the replica-skill pack by Jake Schincariol (F107): seven of
its eleven skills and all six of its standard-library Python tools, rewritten
as one skill in skillator's voice. This file records what was taken and from
which commit, so a later change upstream can be found and absorbed on purpose.
It is also the manifest that `upstream-check.sh` / `upstream-check.ps1` in this
directory read (thin wrappers over `practice/scripts/upstream-check.sh`, the
checker design-arwen and code-yoda use). Keep the table in its current shape:
the script parses the rows under `## Upstreams`, and a row it cannot parse is
an error, not a skip.

Version numbers are not a signal. Upstream has no tags, and its
`plugin.json` says `1.0.0` at the absorbed commit. The check compares commits,
not versions.

## Upstreams

| Name | Repo | Watched paths | Absorbed commit | Absorbed | clone-odo files / sections |
|---|---|---|---|---|---|
| replica-skill | `Jakeschincariol/replica-skill` | `replica-recon`<br>`replica-design`<br>`replica-diff`<br>`replica-entrepreneur`<br>`replica-brand`<br>`replica-launch`<br>`replica-deploy/preflight.md`<br>`replica-test/test-plan.md`<br>`replica-test/bug-report.md`<br>`tests`<br>`LICENSE` | `77c9436fb3d18c3d58169efb8caf4fe906b0dc51` | 2026-10-26 | `replica-recon/SKILL.md` → SKILL.md §2 + `references/recon.md`, its rules block → SKILL.md §0 + `references/clean-room.md` (flows `F<nn>` → `FL<nn>`; output paths → `.skillator/clone/`; step 7 gains the `ticket` column and SKILL.md §3; step 9 sizing kept); `replica-recon/recon-map.md`, `features.csv` → `templates/recon-map.md`, `templates/features.csv` (`FL01`; `ticket` column); `replica-design/contrast.py`, `tokens.json` → `scripts/contrast.py`, `templates/tokens.json` (docstring paths only); `replica-design/SKILL.md` → one hand-off block in `references/handoffs.md` (the component list, the measured roles, the never-take list), its never-take rules → `references/clean-room.md`; `replica-diff/SKILL.md`, `parity.py`, `imgdiff.py` → SKILL.md §7 + `references/parity.md`, `scripts/parity.py`, `scripts/imgdiff.py` (docstring paths); `replica-entrepreneur/SKILL.md`, `reviews.py`, `themes.json` → SKILL.md §6 + `references/reviews.md`, `scripts/reviews.py`, `scripts/themes.json` (none in the tool); `replica-brand/SKILL.md`, `sweep.py` → SKILL.md §8 + `references/brand.md`, `scripts/sweep.py` (skips `.skillator` not `replica`; `--include-planning`); `replica-launch/SKILL.md`, `listing.py`, `listing.example.json` → SKILL.md §8 (listing lint only) + `references/brand.md` § Listing, `scripts/listing.py`, `templates/listing.example.json`; `replica-deploy/preflight.md` → `references/preflight.md` (commands become `odo.sh …`; host, DNS and Stripe sections not absorbed); `replica-test/test-plan.md`, `bug-report.md` → `templates/` (`FL` ids; bugs go to the board as `B<n>`); `tests/*.py` → `scripts/tests/` (`_load.py` loads `../<name>.py`; `test_repo.py` not absorbed); `LICENSE` → § License below, verbatim. Not absorbed: replica-architect, replica-build, replica-backend (build-jarvis), replica-design's measuring steps (design-arwen), replica-test/SKILL.md and e2e.example.spec.ts (PRACTICE §4, screenshot-argus), replica-deploy/SKILL.md's host/DNS/Stripe sections (deploy-merlin / deploy-niyoj), replica-launch's landing page, pricing and launch plan, README and the plugin manifests |

Notes on the row:

- **Reframed, not copied.** Eleven slash-command skills became one skill with
  laws in SKILL.md and mechanics in `references/`. What is skillator's own: the
  clean-room rules as a standing guard that binds every hand-off (SKILL.md §0),
  `FL01..` flow ids and `FL01-H1` case ids (upstream's `F<nn>` flows and
  `F<nn>-H<n>` cases collide with skillator's F tickets on grep), the `ticket`
  column and the must-haves-as-F-tickets step (SKILL.md §3), the working folder
  `.skillator/clone/` (upstream: `replica/`), bugs on the board as `B<n>`
  (upstream: `replica/bugs.md`), and the `odo.sh` / `odo.ps1` runner that turns
  a missing python3 into one line instead of a traceback.
- **Two behaviour fixes from the RED baselines** (`practice/baselines/
  scenario-clone-odo-{cleanroom,reviews}.txt`): unlinked review rows are
  dropped before counting, not caveated after, and the reply states the kept /
  dropped / duplicate numbers `odo.sh reviews` prints (`references/reviews.md`);
  the original's words are as off-limits as its code, and the sweep runs after
  any screen is built against a saved page (`references/clean-room.md`).
  Upstream has the tools; the rules that their numbers are the only numbers are
  ours.
- **`parity.py --fail-under` is the ship bar (deliberate change from
  upstream).** Upstream compares `overall` (80% features + 20% layout), so a
  perfect layout can lift a 75 feature score over 80. Here it compares the
  feature score and also exits 1 while any must-have is not done, matching
  SKILL.md §7; `test_fail_under_is_the_feature_score_not_overall` and
  `test_fail_under_fails_on_a_missing_must_have` pin it, and upstream's
  `test_cli_fail_under` expects 1 at `--fail-under 10` for that reason. Keep
  this when absorbing a later `parity.py`.
- **Watched paths** are directories where the whole folder landed and files
  where only one file did. replica-architect, replica-build, replica-backend,
  replica-deploy/SKILL.md and replica-test/SKILL.md are not watched: nothing of
  them landed, and a change there is build-jarvis's or deploy-merlin's concern.
- **Absorbed** is the date clone-odo took the content in, not the upstream
  commit date.

## When the check reports a change

Detection only: `changed replica-skill <old>..<new> <compare-url>`, exit 1.
grayskull-power's arming turns that into one `A` ticket,
`absorb replica-skill <old>..<new> into clone-odo`. The procedure is the one in
`skills/design-arwen/UPSTREAM.md` §When the check reports a change, with
`clone-odo` for `arwen`:

1. **Read the diff.** Open the compare URL and read every change to a watched
   path, not only the commit messages. A change with no rule or tool behaviour
   in it still counts as absorbed; skip to step 5.
2. **Map it.** For each changed rule or tool, name the clone-odo file and
   section it lands in, or say why it does not land (another skill owns it, it
   is outside the clean-room scope, it is a hand-off line already).
3. **RED, then GREEN, with `skill-smith`.** Write a scenario today's clone-odo
   fails because the new rule is missing. Run it and keep the failing
   transcript. Then edit clone-odo in its own voice (depth in `references/`,
   SKILL.md within its budget) and rerun until it passes. A tool change ports
   with its tests into `scripts/` and `sh scripts/odo.sh test` must pass. The
   existing clone-odo GREENs are the regression set; they must still pass.
4. **Nothing changed in clone-odo?** That is allowed when step 2 found nothing
   that lands. Say so in the ticket.
5. **Bump this file.** Set the row's absorbed commit to `<new>` (the full SHA),
   set Absorbed to today, and update the sections column. Rerun
   `upstream-check.sh`. That upstream must now print `unchanged`. Close the
   ticket.

A watched path that moves or disappears upstream shows up as an `error` row and
exit 2. Find the new path, update the Watched paths cell, and treat whatever
changed in the move as a normal absorb.

## License

replica-skill is MIT-licensed. The notice below is retained as that license
requires and covers every portion of this skill derived from it: SKILL.md,
`references/`, `templates/` and `scripts/`.

```
MIT License

Copyright (c) 2026 Jake Schincariol

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
