# Handoff — skillator board sweep, 2026-09-04

Written because the usage gate fired at 99%. Nothing is committed. Everything
below was verified against the repo, not against what the session claimed.

## State in one line

`main` at `6bea753`, working tree dirty: **55 paths**, 53 staged
(+3804/−858) plus 24 further unstaged edits (+227/−135). Board:
**7 open · 1 deferred · 50 closed (45 done · 5 cancelled) · 58 total**.

**No commit has been made this session.** The user was asked once and never
answered; push was never authorised either.

## What is on disk, in two batches

### Batch 1 — the A14–A27 fix set plus its review (staged before this session's work)

Was already in the tree at session start. Ran the §4 pre-commit gate over it:
three Fable reviewers on the staged diff. Six real defects found and fixed:

1. `board/index.html:501` — a literal `U+0000` in a regex character class. The
   HTML tokenizer turns it into `U+FFFD`, giving "range out of order", a
   SyntaxError that killed the whole inline script. **The board was dead in a
   browser and green in Node**, which is why nothing caught it. Verified fixed
   with `node --check` on the extracted script.
2. `TICKETS.md:33` — a stray `U+0001` (the source of the one the board copied).
3. `references/anti-slop.md` was unreachable on Cursor/Codex/Antigravity/Pi —
   neither installer copied `references/`. Both now do; dry-runs agree.
4. `README.md:180` still ordered `sherlock-codes` before every commit — the rule
   A21 inverted. Now `/code-review`.
5. `PLATFORMS.md` contradicted itself on the Codex `Stop` hook (table said "no
   live run yet", body documented the live run that failed). Table, handoff-watch
   and ticket A33 now agree.
6. `usage-watch.sh`/`.ps1` hard-coded `$HOME/.codex/sessions` while the
   installers had learned `CODEX_HOME`.

### Batch 2 — this session's ticket work

Closed and verified: **F8, A1, A2, A28, A39, A40, A41, A42, A5**. Cancelled:
**A3**. Deferred: **A33**. Details are on each ticket line in `TICKETS.md`.

Deletions performed outside the repo, at the user's explicit instruction:
`ui-to-functional` removed from `.claude`, `.claude-bodish`, `.claude-ikran`;
`design-taste-frontend-v1` removed (real dir in `~/.agents/skills` + three
symlinks). Backup:
`…\scratchpad\deleted-skills-backup\`. Keepers verified intact.

## The one thing the next session must know

**This repo silently corrupts UTF-8 through careless tooling, and it did so
twice today.**

- The A28 description pass double-encoded em dashes to `â€"` in five SKILL.md
  files. Caught and repaired; all six occurrences gone.
- The same pass glued `user-invocable: true` onto the end of design-arwen's
  folded description scalar, **silently deleting that frontmatter key**. My first
  validator only checked that `name` and `description` existed, so it passed.
  Replaced with a real `yaml.safe_load` parse that also detects glued keys — all
  19 skills now parse clean.
- Independently, the ticket-master GREEN test agent's board edit was a silent
  no-op for exactly this reason: `TICKETS.md` is UTF-8 and full of em dashes, and
  a bare Python `open()` on Windows reads it as cp1252, matches nothing, changes
  nothing, exits 0.

A rule for this is now in `ticket-master/SKILL.md:104` — read a board edit back
with `grep` before reporting it; a missing `git diff` hunk is a failed flip.
**Always `io.open(..., encoding='utf-8')` and write with `newline='\n'`.**

## Verification status — what was actually run

| Check | Result |
|---|---|
| `practice/scripts/selftest.sh` | ok |
| `practice/scripts/check-grayskull-sync.sh` | ok |
| `handoff-watch/hooks/selftest.ps1` | ok |
| `install.sh --dry-run` / `install.ps1 -DryRun` | agree, both list `references/` |
| `node --check` on board inline JS | passes |
| YAML parse, all 19 frontmatters | clean, no glued keys |
| Control-character scan, repo-wide | clean |
| Mojibake scan, repo-wide | clean |
| `node board/refresh.mjs` | 58 lines baked, snapshot current |

**Not run:** the full `/code-review` gate over batch 2. Batch 1 was reviewed;
this session's own ~227 lines of edits were not. Do that before committing.

## In-flight work, killed by the gate

**sherlock-codes RED-GREEN test (A9)** — stopped mid-run, then a resume attempt
died on the hard session limit (rate_limit 429, resets 8:10pm IST). GREEN still
has no verdict; do not retry before the limit resets. RED had completed:
it cited `orders.js:42`, the catch at `:50-53`, `cancel` at `:60-66`, all
verified line-for-line, and **did not fall for any of the three planted decoys**.
GREEN never reported, so there is no verdict. Scratch tree at
`…\scratchpad\a9-sherlock\` is intact and untouched.

To resume, dispatch a Fable agent with:

> Repo: C:\tools\projects\skillator. Resume the A9 RED-GREEN test of
> `skills/sherlock-codes/SKILL.md`. The scratch codebase and the RED run already
> exist at `…\scratchpad\a9-sherlock\` — read what is there first, do not rebuild
> it and do not re-run RED. RED cited `orders.js:42`, the catch at `:50-53` and
> `cancel` at `:60-66`, all correct, and fell for none of the three decoys.
> Run only GREEN: a fresh subagent with the same scenario, having it read and
> follow `skills/sherlock-codes/SKILL.md` first. Then report the scenario, the
> RED result as recorded, the GREEN result, a PASS/FAIL verdict, and the top
> loophole quoted from SKILL.md. Note that a RED baseline with no violation is a
> real result per `skill-smith/references/testing.md` reason 3 — do not invent a
> failure. Do not edit the repo or TICKETS.md.

Read `A47` before trusting any A9 result: subagents inherit this repo's
`CLAUDE.md`, which already states the grayskull ground rules, so every RED
baseline is handed rules it is supposed to lack.

## Open board — 7 open, 1 deferred

| ID | State | What |
|---|---|---|
| A9 | `[ ]` | Skill testing, partial — 5 of 19 tested, sherlock incomplete |
| A28 | `[x]` | Done, but see the encoding warning above |
| A43 | `[ ]` | design-arwen: three competing ship gates, no non-text contrast |
| A44 | `[ ]` | design-arwen: signature doctrine contradicts the product register |
| A45 | `[ ]` | design-arwen: no no-user / subagent branch |
| A46 | `[ ]` | design-arwen: `build` mode convenes no SME panel despite the description |
| A47 | `[ ]` | Skill-test methodology confounded by this repo's own CLAUDE.md |
| A48 | `[ ]` | grayskull-power's "no line, no edit" clauses have no consequence |
| A49 | `[x]` | handoff-watch threshold lowered 97 -> 92 (see below) |
| A33 | `[>]` | Codex `Stop` — needs an interactive session or a build newer than 0.153.2 |

## Why the decisions went the way they did

- **A3 cancelled, not fixed.** gstack is a third-party skill repo. Nothing in
  skillator can remove its duplicated boilerplate; the fix belongs upstream.
- **A41 resolved by dropping the claim, not adding the review.** `-mid` and
  `-lite` exist to be ceremony-free and seat no `deep` model. Making them
  dispatch PRACTICE §6's whole-branch reviewer would contradict their identity,
  so they now state exactly which section they drop and why.
- **`design-arwen` (118 words) and `func-ui` (117) left over the 80-word
  budget.** Every word past 80 is a literal trigger phrase or a NOT-for
  exclusion. Cutting them would break skill routing, and that failure is silent
  and far worse than a long description.
- **A5's finding is deliberately unflattering and should stay that way.** The
  end-to-end run produced *"a slightly greener Vercel settings page"*. That is
  the result the ticket existed to obtain; do not soften it in A43–A46.

## Next actions, in order

1. `/code-review` over the unstaged batch-2 edits (not yet reviewed).
2. Commit both batches. Ask the user first — they were asked once and never
   answered. Push is separately unauthorised.
3. After committing, the installed plugin copy is stale: the trimmed
   descriptions need a marketplace update or reinstall to take effect.
4. Resume the sherlock GREEN run with the prompt above.
5. Re-run the grayskull-power A9 test from a cwd without skillator's
   `CLAUDE.md` (A47) — the current PASS is unreliable.

## Change made after the gate fired

**handoff-watch now fires at 92%, not 97%** — at the user's instruction, and this
session is the evidence: the gate fired at 99%, and the hard session limit landed
before the one in-flight agent could report. 97 left no working budget for the
preserve sequence itself.

Changed in `usage-watch.sh`, `usage-watch.ps1`, `selftest.ps1`, the
`handoff-watch` SKILL.md and description, `README.md`, and grayskull-power's
`SKILL.md` / `arming.md` / `routing.md`. The selftest's 95% context-window case
was retuned to 85% so it still tests the fallback read rather than the firing;
`selftest.ps1` passes and `check-grayskull-sync.sh` still matches the template.
`CLAUDE_USAGE_HANDOFF_PCT` is set in no `settings.json`, so the new default is
what actually applies.
