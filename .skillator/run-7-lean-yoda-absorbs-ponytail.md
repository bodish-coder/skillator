# RUN-7 - lean-yoda absorbs ponytail
plan: TICKETS.md
started: 2026-10-09T16:07Z   updated: 2026-10-09T17:47Z

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 53 | F29 RED baselines | x | build:opus | 2026-10-09T17:47Z | 31159a9 |
| 54 | F29 lean-yoda skill + wiring | x | deep:fable | 2026-10-09T17:47Z | 31159a9 |
| 55 | F29 GREEN | x | build:opus | 2026-10-09T17:47Z | 31159a9 |
| 56 | verify review bump commit push | x | main:opus | 2026-10-09T17:47Z | 31159a9 |

## In flight
### stage 53 - F29 RED baselines  (dispatched, build:opus)
prompt: |
  RUN-7 stage 53, ticket F29. Upstream: ponytail 4.7.0 (MIT) at
  ~/.claude-ikran/plugins/cache/ponytail/ponytail/4.7.0. Record two RED
  baselines with practice/scripts/baseline-harness.sh (read its header and
  skills/skill-smith/references/testing.md first). Add a `ponytail` fixture:
  a small repo with a TICKETS.md, 5 `# ponytail:` / `// ponytail:` comments
  (3 naming an upgrade trigger, 2 naming none), and a staged diff holding 3
  over-engineering cases (one-implementation interface, hand-rolled stdlib,
  a dependency for one native call) plus 1 real correctness bug.
  scenario-lean-yoda-debt.txt: "releasing tomorrow - anything we knowingly
  deferred that should be tracked?" scenario-lean-yoda-review.txt: "review
  the staged diff before I commit". Run each RED twice. Record per run,
  verbatim: did it find the markers, flag the no-trigger ones, put them on
  the board; did the review name the 3 over-engineering cases with a concrete
  replacement or only the bug. Do not write the skill. Do not commit.

### stage 54 - F29 lean-yoda skill + wiring  (dispatched, deep:fable; verify opus)
prompt: |
  RUN-7 stage 54, F29. Write skills/lean-yoda per skill-smith, from upstream
  ponytail 4.7.0 (MIT) and the RED verdicts in
  practice/baselines/scenario-lean-yoda-{debt,review}.txt. SKILL.md: the
  laziness core (ladder, rules, lite/full/ultra), a guard (PONYTAIL MODE
  ACTIVE already in context -> core loaded, use only the modes), Yoda voice
  whenever a reply suggests using the skill; references/review.md,
  audit.md, debt.md (debt fixes the RED: a marker with no trigger is tagged
  no-trigger, never given an invented one; ledger rows go to tickets-zordon
  through its gate); UPSTREAM.md + upstream-check like design-arwen with the
  MIT notice. Wire: grayskull-power arm/route/hosts (+ .skillator/grayskull.md
  sync), plugin.json + marketplace description, README, installers. No commit.

### stage 55 - F29 GREEN + verify 54  (dispatched, build:opus)
prompt: |
  RUN-7 stage 55, F29. Verify skills/code-yoda against skill-smith (desc
  triggers-only, guard, banner, voice, debt no-trigger slot) and the wiring.
  Then GREEN: baseline-harness `cmd green` with the current tree, fixture
  ponytail, scenarios scenario-code-yoda-{debt,review}.txt, twice each,
  BASELINE_ISOLATE=hide. Pass = debt flags both trigger-less markers as
  no-trigger with no invented trigger; review uses the tagged one-line
  format with net line. Write green-code-yoda-{debt,review}.txt. No commit.

## Rulings
- 2026-10-09 - stage 53 RED: debt VIOLATED 2/2 (invents a trigger for a no-trigger marker instead of flagging it); collecting and ticketing markers COMPLIED; review COMPLIED 2/2 (4/4 incl. superseded round). So debt.md carries the no-trigger rule only; review/audit ship as an output-format recipe (tags, replacement, net), not as a behaviour fix, and are labelled so.
- 2026-10-09 - implementer reported usage-watch.sh check hanging in a subagent; not reproduced (0.8s, exit 0, stdin closed). No ticket: no repro.
- 2026-10-09 - owner decisions via AskUserQuestion: one skill `lean-yoda` (core + review/audit/debt modes; gain/help dropped); armed by grayskull, no new hooks; the ponytail plugin stays installed, so lean-yoda skips its core when "PONYTAIL MODE ACTIVE" is already in context; Yoda-voiced when a reply suggests it.
- 2026-10-09 - RED scope: debt ledger and over-engineering review are the two behaviours skillator adds; the laziness core is upstream-benchmarked and not re-baselined. Double-load guard is checked in GREEN only (no RED exists: without the skill there is nothing to double-load).
- 2026-10-09 - Tiers: 53 build:opus (fixture + harness runs); 54 deep:fable fix / opus verify (skill design judgement, as F25); 55 build:opus; 56 main session. Sequential: each stage consumes the last.
- 2026-10-09 - owner change mid-stage-54: lean-yoda is framed as an old master's wisdom, not a lazy developer. Same mechanics (ladder, markers, modes, no-trigger rule); reasoning voiced as earned judgement; wisdom extends to consequence-first, when-not-to-cut as a first-class rule, one line of why, humility. Sent to the stage-54 implementer in flight; name stays lean-yoda.
- 2026-10-09 - owner renamed the skill to `code-yoda` (over lean-/restraint-/simplify-yoda); activation banner "## 🟢 Code less, see more. Begun, the wisdom has." and five Yoda suggestion lines, sent to the stage-54 implementer. Run file keeps its lean-yoda filename (run ids are permanent).
- 2026-10-09 - stage 54 landed (uncommitted). Accepted: code-yoda/SKILL.md 1170 words though grayskull arms it every session (owner content: banner, suggestion table, when-not-to-cut); grayskull-power 796/800. Baselines renamed lean-yoda -> code-yoda. Upstream drift to ponytail 5.1.0 logged as A110, not folded into F29.
- 2026-10-09 - stage 55 returned: body PASS 4/4 (prefixed prompts); description 0/4 on unprefixed prompts (debt routed to tickets-zordon, which dropped the cache marker); with the ponytail plugin enabled ponytail:ponytail-debt won 0/2 and invented triggers. Main session fixed the descriptions (code-yoda gains pre-release "should be tracked" wording; tickets-zordon gains NOT-for ponytail: markers; both within 80). Re-running description GREEN for debt x2 (ponytail disabled) before landing 55. Review not loading unprefixed is expected (NOT-for correctness review). Plugin-conflict question goes to the owner.
- 2026-10-09 - description re-GREEN PASS 2/2 (code-yoda loads unprefixed, both no-trigger markers flagged, none invented). Stage 55 landed. Owner chose (AskUserQuestion): disable ponytail@ponytail on this machine after code-yoda ships. Harness allow-list gap logged as A111.
- 2026-10-09 - review pass 1 (medium): 7 findings. Fixed: per-manifest --daily stamp (sh+ps1, selftests ok; also retires the "unless skipped" special case), banner suppressed when grayskull arms code-yoda, debt scan via git grep excluding docs/transcripts/logs, tickets-zordon triggers restored (NOT-for shortened, within 80). Accepted: code-yoda 1170 words per session (prior ruling); wrapper scripts kept (one per absorbed upstream until a third exists).
- 2026-10-09 - review pass 2 (medium): 10 findings. Fixed: manifest dir resolved before naming the stamp (bare/./ paths; ps1 crash on bare name), ps1 compare case-sensitive like sh, per-skill stamp selftest in both twins (mutation-checked: fails when the rule is reverted), ps1 header, debt scan --untracked + `;` `%` ` * ` prefixes, "NOT an issue tracker" restored (within 80), banner rule = first direct invoke per session. Accepted: "should be tracked" overlap with tickets-zordon - scoped to code markers before release/handover, and GREEN showed code-yoda hands rows to tickets-zordon.
- 2026-10-09 - review pass 3 (final, cap reached): 9 findings. Fixed: ps1 absolute-path stamp (Combine, not Join-Path; reproduced, then caught by a new absolute-path selftest in both twins, mutation-checked), CDPATH-safe cd, case-folded stamp compare in both twins, "A4" trigger restored ("fan out agents" dropped as a synonym of work the board), arming says load-not-invoke for the banner, debt scan drops string literals/fixture text/convention prose by reading the line, docs excluded case-insensitively incl rst/adoc. Accepted with a ponytail: note: two same-named skill dirs would share a stamp. No fourth pass.
