# RUN-6 - rules-orko and ticket scale
plan: TICKETS.md
started: 2026-10-02T13:23Z   updated: 2026-10-02T13:24Z

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 49 | F25 rules-orko skill | ~ | deep:fable | 2026-10-02T13:24Z | - |
| 50 | F27 ticket archive | ~ | build:opus | 2026-10-02T13:24Z | - |
| 51 | F26 renumber on every merge | ~ | build:opus | 2026-10-02T13:24Z | - |
| 52 | verify review bump commit |   | - | - | - |

## In flight
preamble: |
  (RUN-6 preamble) Repo C:\tools\Projects\skillator2, a plugin of agent skills
  (Claude Code, codex, cursor, antigravity, pi, prime-agent; host mechanics in
  PLATFORMS.md, process canon in PRACTICE.md). You implement ONE stage. Read
  your ticket's full line in TICKETS.md (grep the ID) - its 'Done when' is the
  closing condition you must prove. Rules: do NOT commit, push, or edit
  TICKETS.md or anything under .skillator/. Touch only the files your stage
  names. Never run git commands that move refs or change the worktree of this
  repo; prove behaviour in throwaway repos/dirs under your temp dir, and never
  write to the real ~/.skillator, ~/.claude, ~/.codex or other home dirs
  (point HOME/USERPROFILE or an env override at a temp dir in tests). Scripts:
  sh + ps1 mirrors where the peer scripts have them (next-id has both, check-
  tickets is sh only), pure ASCII, LF, executable sh. Every new script gets a
  --selftest that fails if its logic breaks. Match the voice of existing
  skills. Return plain text: files changed; how each 'Done when' clause was
  proven (command + output); anything not done and why.

### stage 49 - F25  (dispatched, fix:fable)
prompt: |
  Stage F25: write the new skill skills/rules-orko/ (SKILL.md + references/ +
  any small script) following skills/skill-smith/SKILL.md, including its
  naming rule (purpose-name, one fictional origin per family - orko is from
  He-Man, like grayskull) and its test discipline (RED baseline then GREEN,
  recorded under practice/baselines/ like the other skills; use
  practice/scripts/baseline-harness.sh). Owner decisions, already made: (1)
  GLOBAL rules live in ~/.skillator/rules.md - one plain file outside every
  repo, read at session start on every host, never committed; (2) PROJECT
  rules are committed in the repo (pick the path, e.g. .skillator/rules.md) so
  a teammate's git pull brings them; (3) when a user's global rule contradicts
  a project rule, orko ASKS on each clash (AskUserQuestion on Claude Code, the
  host's equivalent elsewhere) - never silently resolves; (4) orko notes how
  the user works: when the user states a rule ('always X', 'never Y', 'from
  now on'), orko asks or decides global vs project and writes it to the right
  file. A second git user (different git user.email) gets project rules +
  their OWN ~/.skillator/rules.md, never the first user's personal rules. Wire
  it into the grayskull package: arm it in skills/grayskull-power (SKILL.md
  section 1 arm line and section 2 route; references/arming.md and
  references/routing.md), but grayskull-power/SKILL.md is 797 of its 800-word
  budget - pay for any words you add by trimming, and run
  practice/scripts/check-grayskull-sync.sh and practice/scripts/context-
  audit.sh after. Also add rules-orko to .claude-plugin/plugin.json and
  marketplace.json descriptions (do NOT change the version fields) and
  README.md's skill list. Check install.sh/install.ps1 pick the new skill up
  with no change (they copy skills/*); say so. Prove the three 'Done when'
  clauses with temp HOME dirs and two throwaway clones.

### stage 50 - F27  (dispatched, fix:opus)
prompt: |
  Stage F27: archive old closed tickets. Owner decision: [x] and [-] tickets
  closed more than 30 days ago move to TICKETS-archive.md (committed, repo
  root); a parent stays in TICKETS.md until all its sub-parts are closed and
  old enough, and moves with them; closing date comes from git (the commit
  that flipped the line to [x]/[-], e.g. git log -L or blame on the line)
  since lines carry no date. Build practice/scripts/archive-tickets.sh (+ .ps1
  only if you judge a Windows-only user needs it; next-id has a mirror) with
  --dry-run and --selftest. Update practice/scripts/next-id.sh AND next-id.ps1
  so allocation counts IDs in TICKETS-archive.md too (never reuse a number);
  practice/scripts/check-tickets.sh so duplicates are detected across both
  files; skills/tickets-zordon/board/artifact.mjs so the closed section can
  include archived tickets (or states how many are archived); skills/tickets-
  zordon/SKILL.md: a short section on the archive (when to run it - e.g.
  during a drain -, that sessions read only TICKETS.md, and to grep the
  archive for an old ID). Then run it for real on this repo's TICKETS.md and
  TICKETS-archive.md (this one write IS allowed in this stage) and prove:
  every open ticket still in TICKETS.md, line count of both files adds up with
  nothing lost or duplicated (check-tickets passes on both), next-id.sh --peek
  A/B/F returns the same numbers as before archiving, and grep finds an
  archived ID. Do not touch renumber-tickets.sh (stage F26 owns it).

### stage 51 - F26  (dispatched, fix:opus)
prompt: |
  Stage F26: renumber duplicate ticket IDs on every git merge/pull, not only
  inside merge-smith. practice/scripts/renumber-tickets.sh already does the
  renumbering for merge-smith (F24) - reuse it, do not fork it; extend it only
  as needed, keeping its --selftest passing, and make it count IDs in TICKETS-
  archive.md (stage F27 just added the archive) when picking free numbers.
  Wire it so a plain `git pull`/`git merge` that brings in colliding IDs ends
  correct with no manual step: choose between a custom git merge driver for
  TICKETS.md (.gitattributes + merge.<name>.driver config) and a post-merge
  hook - prove which actually works on a real conflicting pull in a throwaway
  repo pair, including a merge that git resolves cleanly (no textual conflict)
  yet leaves duplicate IDs. The install step (git config / hooks are per-
  clone, not committed) is done by tickets-zordon: add it to skills/tickets-
  zordon/SKILL.md as an idempotent one-liner script the session runs when it
  arms, and say what a teammate who never runs a skill gets (check-tickets.sh
  catching it). Renumbering never moves the receiving branch's IDs, keeps `
  (was X)`, carries sub-parts, and updates references only in files the
  incoming side changed. TICKETS.md is committed and pushed with the work -
  state that in tickets-zordon. Do not touch skills/grayskull-power (stage F25
  owns it). merge-smith already calls renumber-tickets.sh: keep that call
  working.

## Rulings
- 2026-10-02 - F25 owner decisions taken 2026-10-02 via AskUserQuestion: global rules at ~/.skillator/rules.md; a personal-vs-project clash is asked every time; F27 archive = closed >30 days, parent moves only with all sub-parts.
- 2026-10-02 - Order: F27 before F26 (both edit tickets-zordon SKILL.md, and F26's renumber must count archived IDs); F25 runs alongside (owns grayskull-power, F26/F27 must not touch it).
- 2026-10-02 - Tiers: F25 fix fable (skill design judgement) / verify opus; F27 and F26 fix opus / verify fable (the allocator and renumbering are contracts every session depends on).
- 2026-10-02 - Version: bump to 4.2.0 (new skill = minor) in the stage-4 commit, per the owner's bump-on-push rule; the push itself is the owner's (classifier blocks it as a public surface).
- 2026-10-02 - stages 49-51 dispatched as workflow wf_02229e47-af5 (resume via Workflow resumeFromRunId). Stage 52 (verify review bump commit) stays in the main session.
