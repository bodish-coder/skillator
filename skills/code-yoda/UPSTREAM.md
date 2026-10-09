# code-yoda upstream

code-yoda absorbs the ponytail plugin by Dietrich Gebert (F29): its core
discipline and three of its five skills, rewritten in skillator's voice. This
file records what was taken and from which commit, so a later change upstream
can be found and absorbed on purpose. It is also the manifest that
`upstream-check.sh` / `upstream-check.ps1` in this directory read (thin wrappers
over `practice/scripts/upstream-check.sh`, the checker design-arwen uses). Keep
the table in its current shape: the script parses the rows under
`## Upstreams`, and a row it cannot parse is an error, not a skip.

Version numbers are not a signal. The plugin cache labelled `4.7.0` matches
upstream commit `ff5d093`, two days and several content commits after the
`v4.7.0` tag (`adad50d`). The check compares commits, not versions.

## Upstreams

| Name | Repo | Watched paths | Absorbed commit | Absorbed | code-yoda files / sections |
|---|---|---|---|---|---|
| ponytail | `DietrichGebert/ponytail` | `skills/ponytail/SKILL.md`<br>`skills/ponytail-review/SKILL.md`<br>`skills/ponytail-audit/SKILL.md`<br>`skills/ponytail-debt/SKILL.md`<br>`LICENSE` | `ff5d0936bee1f1267f4f4a7c34a2e6c796254f0b` | 2026-10-09 | `skills/ponytail/SKILL.md` → SKILL.md §2 The ladder, §3 Rules and The marker (`ponytail:` spelling kept), §4 Output, §5 Level (lite/full/ultra and the cache example), §6 Knowing when not to cut (trust boundaries, hardware knob, the one runnable check); `skills/ponytail-review/SKILL.md` → `references/review.md` (tags, line format, `net:`, `Lean already. Ship.`, scope); `skills/ponytail-audit/SKILL.md` → `references/audit.md` (hunt list, ranked format, `net: … deps`); `skills/ponytail-debt/SKILL.md` → `references/debt.md` (grep, ledger row, `no-trigger` tag, totals line). Not absorbed: `ponytail-gain`, `ponytail-help` (promo and help cards), the hooks (the SessionStart banner, the statusline badge, the mode tracker — grayskull-power arms code-yoda instead), `argument-hint` (not portable frontmatter) |

Notes on the row:

- **Reframed, not copied.** Upstream's "lazy senior developer" became an old
  master's restraint (owner ruling, RUN-7 stage 54): every mechanical rule kept,
  the justification rewritten as earned judgement. SKILL.md §0 (the
  `PONYTAIL MODE ACTIVE` guard), §1 See before acting, §8 The voice, and
  `debt.md`'s "From ledger to board" are skillator's own.
- **`debt.md` carries one behaviour fix**, from the F29 RED baseline
  (`practice/baselines/scenario-code-yoda-debt.txt`): a marker with no trigger is
  reported as `no-trigger`, never given a trigger the run composed. Upstream has
  the tag; the rule that nothing else may fill the slot is ours. `review.md` and
  `audit.md` passed RED and ship as output-format recipes.
- **Known upstream movement, not absorbed.** At the time of writing upstream is
  at v5.1.0: `01cbf81` rebuilt the rules, review and audit ("Ponytail 5") and
  `2a1fe84` renamed the code-comment marker from `ponytail:` to a neutral
  `shortcut:`. The first run of the check will therefore print `changed`. The
  `ponytail:` spelling is a deliberate ruling here (existing markers in this repo
  and user repos must still count); whoever absorbs 5.x decides whether `debt.md`
  harvests both spellings.
- **Absorbed** is the date code-yoda took the content in, not the upstream
  commit date.

## When the check reports a change

Detection only: `changed ponytail <old>..<new> <compare-url>`, exit 1.
grayskull-power's arming turns that into one `A` ticket,
`absorb ponytail <old>..<new> into code-yoda`. The procedure is the one in
`skills/design-arwen/UPSTREAM.md` §When the check reports a change, with
`code-yoda` for `arwen`: read the diff, map each changed rule to a section here
or say why it does not land, RED then GREEN with `skill-smith`, then bump the
row's commit and date and rerun until it prints `unchanged`.

## License

ponytail is MIT-licensed. The notice below is retained as that license requires
and covers every portion of this skill derived from it.

```
MIT License

Copyright (c) 2026 DietrichGebert

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
