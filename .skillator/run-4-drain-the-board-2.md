# RUN-4 - drain the board 2
plan: docs/plans/PLAN-board-drain-2.md
started: 2026-09-24T00:52Z   updated: 2026-09-24T07:30Z

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 30 | A62c antigravity probe | x | build:opus | 2026-09-24T04:22Z | 994309c |
| 31 | A93 anti-slop tells | x | build:opus | 2026-09-24T04:22Z | 994309c |
| 32 | A94 verify F23b rulings | x | build:opus | 2026-09-24T04:22Z | 994309c |
| 33 | A95 prefix carries references | x | build:opus | 2026-09-24T04:22Z | 994309c |
| 34 | A96 installer drops renamed skills | x | build:opus | 2026-09-24T04:22Z | 994309c |
| 35 | A63b hide-CLAUDE.md isolation | x | build:opus | 2026-09-24T07:30Z | 445d689 |
| 36 | A85 isolated GREEN + fixes | ! | build:opus | 2026-09-24T07:26Z | - |

## In flight
### stage 35 - A63b hide-CLAUDE.md isolation  (dispatched)
prompt: |
  (RUN-4 preamble) Ticket A63b. Owner approved (no API key): isolate GREEN
  runs by renaming ~/.claude/CLAUDE.md to ~/.claude/CLAUDE.md.skillator-hidden
  for the duration of each nested run only. Add `BASELINE_ISOLATE=hide`
  to baseline-harness.sh's `run`: refuse if the .skillator-hidden name already
  exists (a previous run died - print the restore command and stop); rename;
  trap EXIT/INT/TERM restore; after restore verify the file is back. Print the
  restore command before renaming. Prove isolation: one nested GREEN whose
  prompt asks the model to quote any user-level CLAUDE.md memory it was given
  or answer NONE - with hide it must say NONE; without hide it quotes it.
  Afterwards `sha256sum ~/.claude/CLAUDE.md` must equal
  9352652d1b1c27258052553df04bb217e749709e2b0cb24b0e8e805c4f798a98.
  Selftest the hide path against a fake HOME. Yours: baseline-harness.sh,
  README harness section, green-harness-isolation.txt, transcripts a63b-*.

### stage 36 - A85 isolated GREEN + fixes  (after 35)
prompt: |
  (RUN-4 preamble) Ticket A85. With BASELINE_ISOLATE=hide, re-run
  practice/baselines/green-design-arwen.txt (unchanged prompt) N=2 on HEAD's
  arwen. Declare half passes 2/2 -> the failure was the owner's CLAUDE.md;
  record, no edit. Fails -> up to 3 fix rounds (owner-approved), each a
  smallest edit to design-arwen + isolated GREEN N=2, reverted if it fails.
  After every run verify the CLAUDE.md checksum above.
### stage 32 - A94 verify F23b rulings  (dispatched)
prompt: |
  (RUN-4 preamble) Ticket A94. RED = arwen as it was before F23b: build the
  prefix from `git archive 933a5c9` (the harness builds from HEAD - do it by
  hand, then diff -r skills/design-arwen and references/ against `git show
  933a5c9:`). GREEN = the working tree (harness prefix now overlays
  references/ too). Two scenarios, each run RED N=2 then GREEN N=2, strictly
  one at a time, timeout 1500:
   S1 product flow - a sign-in page, a long settings form with validation, and
      a destructive-confirm dialog: grade paste/autocomplete allowed, a linked
      error summary, scrim only on the blocking dialog, no default mono face,
      large-text sizes by the 24px / 18.67px-bold threshold.
   S2 brand surface - a hero with an ambient background, a frosted nav, and a
      testimonial strip: grade flat fill vs gradient mesh, translucency with
      prefers-reduced-transparency + contrast fallback, ambient motion
      sparingly (no infinite loop without reduced-motion guard), the Read's
      `job` field, and a fresh-reviewer step reported.
  Per ruling: RED fails and GREEN passes -> keep; RED already passes 2/2 ->
  revert that rule's text (no failing test); GREEN fails -> revert and say so.
  Yours: skills/design-arwen/**, references/anti-slop.md only if a ruling
  lives there, new scenario/green files, transcripts a94-*.
### stage 33 - A95 prefix carries references  (dispatched)
prompt: |
  (RUN-4 preamble) Ticket A95. Yours: practice/scripts/baseline-harness.sh and
  the README harness prefix paragraph. Make `prefix` overlay every uncommitted
  path the skills read at runtime (skills/, references/, practice/,
  PRACTICE.md, PLATFORMS.md, WORKFLOW.md - check what the skills actually
  reference) and name each dirty path; keep the manifest/read-only checks.
  Selftest: a dirty references/ file reaches the prefix. No nested claude runs.

### stage 34 - A96 installer drops renamed skills  (dispatched)
prompt: |
  (RUN-4 preamble) Ticket A96. Yours: install.sh, install.ps1 (mirrors,
  ASCII). Write a manifest of installed skillator skill names per target dir;
  on each install remove folders the previous manifest listed that the repo no
  longer ships. For installs made before any manifest existed, remove only the
  pre-rename names in docs/plans/PLAN-rename.md's mapping table - never a
  folder not on either list. --dry-run prints what would go. Test against a
  temp HOME only, with a fake old install; both mirrors identical.
### common preamble (RUN-4, same text as RUN-3's)
prompt: |
  Repo C:\tools\Projects\skillator2. Read your ticket line first. Edit only
  your files; never TICKETS.md, never commit/push, never write under the
  user's home; UTF-8 I/O; scripts ASCII; verify by running; report exact
  refusals; nested claude runs one at a time with `timeout 1500`, prefix =
  working-tree skill copied in (`diff -r` empty) for GREEN, HEAD's for RED;
  README evidence rules bind (scenario file beside every verdict, N=2).

### stage 30 - A62c antigravity probe  (dispatched)
prompt: |
  Ticket A62c. `agy` is now installed at C:/Users/Ikran/AppData/Local/agy/bin/agy.
  Repeat the A62a/A62b method (practice/baselines/transcripts/a62*, PLATFORMS.md
  Auto-invocation): does antigravity load a skillator skill unprompted from a
  throwaway fixture with no project instruction file, using its project-local
  skill dir (find which dir agy reads; never write the user's home dirs)? N=2
  per prompt (funcui, grayskull). If agy needs a login or credential, report
  exactly that. prime-agent: check whether it is installed; if not, say so.
  Yours: transcripts a62c-*, PLATFORMS.md Auto-invocation rows + prose.

### stage 31 - A93 anti-slop tells  (dispatched)
prompt: |
  Ticket A93 (and docs/plans/F23-upstream/frontend-design.md). Yours:
  skills/design-arwen/references/anti-slop.md, new
  practice/baselines/scenario-arwen-antislop.txt + green-arwen-antislop.txt,
  transcripts a93-*. RED first: a brand landing page prompt naming
  skillator:design-arwen, on HEAD's arwen, N=2; grep the output for each of
  the six tells. Add only the tells the RED actually produced (a tell the
  RED never shows has no failing test - leave it out and say so), in the
  file's existing style. GREEN N=2 on the edit; PASS = those tells absent.

## Rulings
- (RUN-4) A94 runs after A93 finishes - both need nested claude runs and parallel ones were reaped for memory in F23b; they touch different arwen files.
- Owner answers (AskUserQuestion): will set ANTHROPIC_API_KEY (needs a Claude Code restart - only between stages, never with agents in flight; resume with 'continue RUN-4'); will run codex login; PUSH origin/main after RUN-4's final review passes; REINSTALL after RUN-4 - remove only skillator skill folders from ~/.agents/skills, ~/.cursor/skills, ~/.pi/agent/skills (list them to the owner first), then install.sh.
- Queued after the owner acts: A83 + A58d once codex is logged in; A63b then A85 once the key is in the env.
- stage 31 round 1: RED (landing page, N=2) produced 0/6 tells - no edit, no GREEN. Round 2 to the same agent: 'Second RED prompt that invites the tells - a SaaS product page with a feature-card grid, tag chips, pricing tiers and Learn-more links - new version of scenario-arwen-antislop.txt, HEAD arwen, N=2, same grading. Any tell present in either run: add only those lines and GREEN N=2. Still 0/6: stop, report, no edit.' Ruling: 0/6 twice across two prompt shapes -> A93 cancelled as not reproduced (4 runs).
- Owner approved deleting the A62c fixture folders in ~/.gemini/antigravity-cli/scratch/ - done. A94 waits for A95 (it builds prefixes).
- Owner decisions (2nd round): NO API key - isolate by renaming ~/.claude/CLAUDE.md -> CLAUDE.md.skillator-hidden only while A63b/A85 isolated runs execute, restore right after, restore command printed first; runs only after A94 lands (its GREENs must keep one condition). Reinstall: include pre-F20 legacy names (relay, dev-alfred, skillator-*, ticket-checker) in the dry-run list, shown to the owner before removal. ~/.claude/CLAUDE.md content left as is. A85: up to 3 fix rounds once isolated.
- stage 32 A94: kept error summary, no default mono, translucency fallbacks, job field; reverted paste/autocomplete, scrim, ambient motion, flat fill, fresh reviewer. Ruling: the large-text revert is overruled - 24px/18.67px is WCAG's definition (18pt/14pt), not a behaviour rule; the RED passed only because no text sat in the 18-23px band, i.e. the test never reached the condition; restoring a wrong number is a defect, and the stricter correct threshold costs nothing if the ruling is wrong. Sent back: re-apply only the large-text correction everywhere it was reverted, note the ruling in the record.
- RUN-4 review: 3 doc fixes in-session (agy stall claim corrected to the transcripts' SUCCESS evidence; 'gradient mesh' dropped from craft.md's depth list - it contradicted anti-slop's mesh-gradient tell, a consistency fix not a new rule; A62c's prime-agent half split to A62d [>]). Installer fix round 1 to the A96 agent: ownership marker + legacy identity check (a user's lookalike func-ui would have been deleted), ordinal sort, whole-line manifest parse, pre-F20 legacy names. Reinstall held until it is verified.
- A96 fix round 2 (re-review, reproduced): an owned folder later edited by the user is deleted on removal with no content check. Prompt: 'Record the SKILL.md sha256 (CR-stripped) inside .skillator-owned at install/adoption; manifest removal deletes only when the current SKILL.md still matches it and no extra files were added - otherwise keep it and print kept <name> (modified since install). Test: adopt, edit, drop from shipped -> kept, in both mirrors; unmodified -> removed.' Round 3 is the cap.
- Owner's ~/.claude/CLAUDE.md sha256 before isolation: 9352652d1b1c27258052553df04bb217e749709e2b0cb24b0e8e805c4f798a98. Restore if a session dies mid-run: mv ~/.claude/CLAUDE.md.skillator-hidden ~/.claude/CLAUDE.md
- A85 isolated: declare half FAIL 2/2 with CLAUDE.md hidden - the skill, not the owner's file; 3 fix rounds failed (round 2 hook gate VOID: Skill permission). Owner decision: move the rule - with no user present, build, then OPEN the final report with the Design Read and every picked field marked assumed:; drop the 'before any Edit/Write' timing. Round 4 (owner-approved change of rule, not another wording of the old one): edit design-arwen's unattended branch accordingly, isolated GREEN N=2 grading the new wording (report opens with Read + assumed:), plus the continue half.
- Pushed main to origin (f786641..df77d18) on the owner's approval. Reinstall: dry run shown (124 hash-verified renamed-skill removals across 6 host dirs, plus 22 hash-verified skillator folders and 5 doc files/dirs in ~/.agents/skills); owner chose DON'T REINSTALL - nothing in the home dirs was changed. The installer (A96) is ready whenever the owner runs it: sh install.sh --dry-run, then sh install.sh.
