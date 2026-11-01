# clone-odo upstream

clone-odo absorbs the replica-skill pack by Jake Schincariol (F107): all
eleven workflows and all six of its standard-library Python tools, adapted
as one skill with explicit execution handbacks in skillator's voice. This file records what was taken and from
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
| replica-skill | `Jakeschincariol/replica-skill` | `replica-recon`<br>`replica-architect`<br>`replica-design`<br>`replica-build`<br>`replica-backend`<br>`replica-test`<br>`replica-diff`<br>`replica-entrepreneur`<br>`replica-brand`<br>`replica-launch`<br>`replica-deploy`<br>`tests`<br>`LICENSE` | `77c9436fb3d18c3d58169efb8caf4fe906b0dc51` | 2026-11-01 | All eleven workflow contracts mapped below; six tools and tests retained with documented Skillator adaptations. Packaging/README/standalone replica command names are not installed. |

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
- **Watched paths** cover all eleven workflow folders, their templates/tools,
  tests and LICENSE. The 2026-11-01 integration expands the earlier deliberate
  subset at the same upstream commit; this is not a claim of a newer revision.
- **Absorbed** is the date clone-odo took the content in, not the upstream
  commit date.

## Eleven-workflow coverage

The entry point is [the workflow index](references/workflow.md). Every stage has
inputs, outputs, execution ownership and an evidence handback. This is adapted
workflow coverage, not eleven newly installed skills or proof of a live clone.

| Upstream workflow at the pinned commit | Local contract and artifacts |
|---|---|
| [replica-recon](https://github.com/Jakeschincariol/replica-skill/blob/77c9436fb3d18c3d58169efb8caf4fe906b0dc51/replica-recon/SKILL.md) | [SKILL.md](SKILL.md) sections 0-3, [recon](references/recon.md), recon-map/features templates |
| [replica-architect](https://github.com/Jakeschincariol/replica-skill/blob/77c9436fb3d18c3d58169efb8caf4fe906b0dc51/replica-architect/SKILL.md) | [Architecture](references/architecture.md), architecture template, schema/API/jobs/access and build-order handback |
| [replica-design](https://github.com/Jakeschincariol/replica-skill/blob/77c9436fb3d18c3d58169efb8caf4fe906b0dc51/replica-design/SKILL.md) | [Design/build](references/design-build.md), tokens and component templates, platform bindings/gallery/contrast |
| [replica-build](https://github.com/Jakeschincariol/replica-skill/blob/77c9436fb3d18c3d58169efb8caf4fe906b0dc51/replica-build/SKILL.md) | [Design/build](references/design-build.md), build-log template, shell/core-slice/screens/states and matrix/ticket reconciliation |
| [replica-backend](https://github.com/Jakeschincariol/replica-skill/blob/77c9436fb3d18c3d58169efb8caf4fe906b0dc51/replica-backend/SKILL.md) | [Backend](references/backend.md), backend template, migrations/auth/payment test-mode/jobs/integration/security evidence |
| [replica-test](https://github.com/Jakeschincariol/replica-skill/blob/77c9436fb3d18c3d58169efb8caf4fe906b0dc51/replica-test/SKILL.md) | [Testing](references/testing.md), test/bug templates and adapted optional local-only web example; PRACTICE remains shared |
| [replica-diff](https://github.com/Jakeschincariol/replica-skill/blob/77c9436fb3d18c3d58169efb8caf4fe906b0dc51/replica-diff/SKILL.md) | [Parity](references/parity.md), parity.py/imgdiff.py, behavioral report and honest ship gate |
| [replica-entrepreneur](https://github.com/Jakeschincariol/replica-skill/blob/77c9436fb3d18c3d58169efb8caf4fe906b0dc51/replica-entrepreneur/SKILL.md) | [Reviews](references/reviews.md), reviews.py/themes.json, evidence/fixes/angle and handoff to pricing proposals |
| [replica-brand](https://github.com/Jakeschincariol/replica-skill/blob/77c9436fb3d18c3d58169efb8caf4fe906b0dc51/replica-brand/SKILL.md) | [Brand](references/brand.md), sweep.py, independent name/palette/voice and dated checks |
| [replica-launch](https://github.com/Jakeschincariol/replica-skill/blob/77c9436fb3d18c3d58169efb8caf4fe906b0dc51/replica-launch/SKILL.md) | [Launch](references/launch.md), landing/pricing/launch-plan templates and listing.py/root listing.json |
| [replica-deploy](https://github.com/Jakeschincariol/replica-skill/blob/77c9436fb3d18c3d58169efb8caf4fe906b0dc51/replica-deploy/SKILL.md) | [Preflight](references/preflight.md) + [Deploy](references/deploy.md), deploy template, provider/DNS/monitoring/platform and approval handback |

Adaptations: output paths remain `.skillator/clone/`; S and FL IDs and canonical
F/B tickets remain distinct; root listing.json stays compatible with existing
lint/preflight. Existing build/design/deploy skills execute the work. Launch now
prepares research/proposals while the owner retains pricing, account and outbound
action approval. Native platforms keep their own bindings/runners; the optional
web example is not native or backend-idempotency proof. Provider/store values and
requirements are verified when used, not copied as timeless prices, fees or DNS.

The six Python tools remain local adaptations, including the feature-score ship
bar and native-platform screenshot guidance. Their presence and tests do not
resolve every separately logged defect (including A206-A208); no such fix or live
validation is claimed by this workflow integration. MIT notice below covers new
adapted recipes/templates as well; retain it with substantial derived copies
when moving them outside this pack. The optional code example carries it inline. Upstream packaging, plugin metadata and
standalone command names are excluded to preserve one cross-host skill.

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
3. **RED, then GREEN, with `skill-prometheus`.** Write a scenario today's clone-odo
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
