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
| ponytail | `DietrichGebert/ponytail` | `skills/ponytail/SKILL.md`<br>`skills/ponytail-review/SKILL.md`<br>`skills/ponytail-audit/SKILL.md`<br>`skills/ponytail-debt/SKILL.md`<br>`LICENSE` | `2a1fe842d078cf66ec7f3e6096a8ca4279c2cad7` | 2026-10-09 | `skills/ponytail/SKILL.md` → SKILL.md §1 See before acting (scope list: callers, tests, fixtures, config, exports), §2 The ladder (reuse rung, house component over native widget, vague request → core job, one line at a glance), §3 Rules (restraint about the solution not the change, keep the codebase's structure and the platform's forms, comment only the why) and The marker (`shortcut:` current, `ponytail:` honoured), §4 Output (risk / unchecked line), §5 Level (lite/full/ultra and the cache example), §6 Knowing when not to cut (trust boundaries, hardware knob, moved code keeps its checks, the one runnable check incl. a whole new script or app); `skills/ponytail-review/SKILL.md` → `references/review.md` (target default, read the callers, numbered one-line format, `reuse:` and `merge:` tags, grep before `delete:`, a marker is a decision, `net:`, `Lean already. Ship.`, scope); `skills/ponytail-audit/SKILL.md` → `references/audit.md` (hunt list incl. duplicate helpers, numbered ranked format, 20-finding cap, unread parts named, `net: … deps`); `skills/ponytail-debt/SKILL.md` → `references/debt.md` (grep for both spellings, keyboard-shortcut false positive, ledger row, `no-trigger` tag, totals line, `No shortcut debt.`). Not absorbed: `ponytail-gain`, `ponytail-help` (promo and help cards), the hooks (the SessionStart banner, the statusline badge, the mode tracker, the SubagentStart injector — grayskull-power arms code-yoda instead), `argument-hint` (not portable frontmatter), and the 5.x widening of review/audit into correctness, security, scale and speed (see § Absorbed 5.x) |

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
- **Two absorptions so far.** F29 took ponytail at `ff5d093` (the 4.7.0 plugin
  cache). A110 took `ff5d093..2a1fe84` (v4.8 to v5.0 plus the marker rename);
  the rule-by-rule record is § Absorbed 5.x below. `LICENSE` did not change in
  that range.
- **Absorbed** is the date code-yoda took the content in, not the upstream
  commit date.

## Absorbed 5.x — ff5d093..2a1fe84 (A110, 2026-10-09)

Every rule-level change to a watched path in that range, and what became of it.
Commits: `dedc97c` comprehension-first guard + reuse rung · `0e3fd0c` trigger on
any coding task · `b6c0448` narrow the marker to real corner-cuts · `446e4ad`
/ `003cd40` `reuse` tag · `6f7a570` grep the tree before `delete:` · `b52dd9b`
block-comment markers, skip build dirs · `1b1a0c5` numbered findings ·
`01cbf81` Ponytail 5 · `2a1fe84` `shortcut:` marker. Upstream gates ruleset
changes on a three-arm agentic benchmark (`.github/CONTRIBUTING.md`;
`benchmarks/results/2026-10-07-agentic.md`: Ponytail 5 vs v4.13, 39 tasks × 5
runs, −10.8 % cost, −8.6 % lines, better on 35/4 tasks). RUN-7's ruling stands:
the core is upstream-benchmarked and not re-baselined here; the two behaviours
skillator adds (debt ledger, over-engineering review) carry the recorded
GREENs, re-run against this absorption (`practice/baselines/green-code-yoda-*.txt`,
A110 sections).

| Upstream change | Verdict | Where / why |
|---|---|---|
| Core: "Before you write" — list every place the change must reach (callers, tests, fixtures, config, exports); what it could destroy or expose; that is scope | adapt | SKILL.md §1 — folded into See before acting, which already demanded reading the callers |
| Core: reuse rung — "already in this codebase? use it the way the surrounding code does" | adopt | SKILL.md §2 rung 2 |
| Core: "stdlib or platform, unless the project has its own; a house component beats a native widget" | adapt | SKILL.md §2 rung 2 — house components yes; a house helper that hand-rolls the stdlib stays a `stdlib:` finding, so core and review never disagree |
| Core: a vague request gets the smallest version that does the core job | adopt | SKILL.md §2 rung 1 |
| Core: "one line a reader gets at a glance"; "a one-liner that needs decoding is not short" | adopt | SKILL.md §2 rung 6, §3 |
| Core: "be lazy about the solution, never about the change — finish callers, tests and fixtures the change breaks" | adapt | SKILL.md §3 first rule, in the restraint voice |
| Core: no wrapper, type conversion, option or boilerplate nobody asked for; keep values in the platform's form; keep the codebase's layers, interfaces, conventions | adapt | SKILL.md §3 — wrapper, type conversion and structure taken; unrequested options and boilerplate fall under the existing "no unrequested abstractions … no config for a value that never changes" rule |
| Core: shortest working diff "once you know everything it must touch" | adopt | SKILL.md §3 |
| Core: comment only the why the code cannot show, in one line | adopt | SKILL.md §3 |
| Core: bug fix — grep every caller, fix the root cause once in the shared code | reject | correctness, not restraint — PRACTICE.md §7 and code-review own root-cause fixing; §1 keeps the reading of every caller |
| Core: code you move or merge keeps its error handling and validation | adopt | SKILL.md §6 |
| Core: a whole new script or app counts as non-trivial (needs its one check) | adopt | SKILL.md §6 |
| Core: end the reply with what was skipped or not checked and any risk the user must know | adapt | SKILL.md §4 — a third line in the existing three-line budget |
| Core: marker renamed `ponytail:` → `shortcut:` | adapt | SKILL.md §3 The marker: `shortcut:` is the spelling, `ponytail:` stays honoured — existing markers in this repo (`taskwork.sh`, the hooks, `upstream-check.sh`) and in user repos are not rewritten; `debt.md` harvests both |
| Core: `b6c0448` marker only for a shortcut with a known ceiling, not every simplification | already held | SKILL.md §3 The marker said so since F29 |
| Core: description "use on any coding task", `0e3fd0c` | reject | skill-smith §2: triggers only, and grayskull-power already arms code-yoda every session; a catch-all description steals every neighbour's traffic |
| Core: ultra becomes "push back before building" | reject | code-yoda's ultra ships the one-liner and challenges the rest in the same breath (§3, §5); stalling on a question the run can default is the thing §3 forbids |
| Core: cache example, "Persistence" block, Caveman pairing removed | reject | the cache example teaches the three levels in one line each and stays; the persistence hype and the Caveman plug were never taken |
| Review: target default — what the user names, else uncommitted changes, else the last commit | adopt | review.md § The target |
| Review: read the diff, then the code it touches — callers of every changed function | adopt | review.md § The target |
| Review/audit: `reuse:` tag (the repo already has this helper, name the path) | adopt | review.md and audit.md tag tables |
| Review/audit: `merge:` near-copies that must change together | adopt | review.md and audit.md — removes lines, inside the lean scope |
| Review/audit: `split:` a function doing several jobs | reject | adds code and lines; a readability refactor, not restraint — out of the "what can we delete" scope |
| Review/audit: number findings so the user can say "fix 2 and 5" | adopt | review.md and audit.md line format |
| Audit: grep the whole tree, tests included, before a `delete:` finding (`6f7a570`) | adopt | review.md § Before a line is written; audit.md cites it |
| Review/audit: a `shortcut:` / `ponytail:` marker naming its limit is a decision, not a finding, unless the expected load crosses it | adopt | review.md § Before a line is written; audit.md |
| Review/audit: every finding needs a concrete case; re-read and confirm | adapt | review.md already refuses hedges; the grep rule above is the confirmable half |
| Audit: big repo — go deep where a mistake costs most; say which parts you did not read | adapt | audit.md § Where to look, "where a cut is worth most" |
| Audit: at most 20 findings, say how many were left out | adopt | audit.md § The report |
| Review/audit: scope widened to bugs, security, scale, missing tests, speed; Must/Should/Nice groups; four-part plain-English findings; `Verdict:`; `What this change does:` | reject | correctness and security review is `code-review:code-review` and `skillator:audit-sherlock` in skillator; code-yoda's modes are complexity-only by the F29 RED/GREEN and the routing in grayskull-power; absorbing this would make three skills review the same diff with three formats |
| Review/audit: `net:` renamed `Lean:`; `Lean already. Ship.` → `Looks good. Ship.` / `Healthy.` | reject | `net:` and `Lean already. Ship.` are the recorded GREEN format; renaming is churn with no behaviour behind it |
| Review/audit/debt: description rewrites | reject | code-yoda's description was tuned by its own GREEN (debt description re-run, 2/2); upstream's trigger words are for upstream's slash commands |
| Debt: grep `(shortcut\|ponytail):` with `/*` prefix, skip `.git`, `node_modules`, `dist`, `build` (`b52dd9b`, `2a1fe84`) | adopt / already held | debt.md § Scan harvests both spellings; the block-comment prefixes and the ignore handling (`git grep --untracked`) were already there since RUN-7 review |
| Debt: the user names their own marker word → grep that instead | reject | a `TODO`/`HACK` names no ceiling or trigger, so every hit would become a `no-trigger` board ticket; listed on request instead (debt.md § Scan) |
| Debt: skip hits that are not a deferral, like a note about a keyboard shortcut | adopt | debt.md § Scan — needed the moment the marker became a common word |
| Debt: `No shortcut debt. Clean ledger.` | adopt | debt.md § The ledger |
| Debt: everything else (ledger row, `no-trigger`, totals, blame) | unchanged | debt.md's own rule that nothing fills an empty trigger slot stays ours |
| LICENSE | unchanged | no commit in range |

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
