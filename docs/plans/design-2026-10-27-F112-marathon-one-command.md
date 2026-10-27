grade: bounded · critical no · design deep=fable · build build=opus · verify build=opus · ceremony full (inside RUN-0023) · mode single (ruled: one relay stage) · usage unobservable

# F112 — Marathon: one command, sequential or parallel

Ticket (verbatim): `- [ ] F112 — Marathon: one command, sequential or parallel. Owner 2026-10-27: 'add marathon run one command foe sequential and parallel like pending agent'. Today a Workflow marathon is two commands, /marathon-plan then /marathon-run, and neither takes a mode; /pending-subagent takes [sequential|parallel] [count|max] [IDs] (F88). Done when: one marathon command plans and runs in one go and takes the same arguments as /pending-subagent - no mode = sequential (one stage per phase, one agent at a time), parallel = file-disjoint stages side by side in a phase, a count caps them, IDs limit the tickets - with the same refusals for a bad first word; /marathon-plan and /marathon-run keep working; the host command texts and README say so on every host that has commands; the installer selftests pin it. [owner: @sher] (@cc-9de7d9)`

Base: the branch `run/RUN-0023-pending-f100-f104` (worktree `C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0023-pending-f100-f104`), which carries F101's per-host marathon texts and marathon.md § "Run without the Workflow tool". F109 (marathon.md, relay-morpheus.sh) and F110 (install.sh/ps1, skill-smith → skill-prometheus) land before this build: every edit below is additive (new paragraphs, new selftest block, new table rows) so the rebase is clean; the build re-reads the two shared files before editing.

## GOAL

One typed command — `/marathon-run [sequential|parallel] [N|max] [IDs]` — plans a Workflow marathon and runs it, with `/pending-subagent`'s argument grammar and refusals: no mode = sequential (one ticket per phase, one agent at a time); `parallel` = file-disjoint tickets side by side in one phase; a count caps a phase; IDs limit the tickets. `/marathon-run RUN-<id>` and `/marathon-plan [IDs]` keep working, `/marathon-plan` gaining the same mode words so a saved plan and a one-shot plan mean the same thing. Every host with commands says so in its text, README and PLATFORMS/WORKFLOW say so, and `install.sh --selftest` / `install.ps1 -SelfTest` pin the strings.

## CHOSEN

Three approaches considered:

**A. Extend `/marathon`** (`plugin/commands/marathon.md`). It already means "marathon" and takes IDs. But it runs the *relay-morpheus chain* marathon (Agent tool, `chain next`, no script, no phases) — a different mechanism from the saved Workflow plan; giving it a mode would fork its text into two marathons behind one name and blur its "picked, not assumed" sweep gate. It also exists on Claude Code only: five new host texts, five installer write lists, the PLATFORMS command rows, the B6 scan counts and the manifests would all grow. Most churn, least fit.

**B. `/marathon-run` with a plan step** — when the first word is not a RUN id, the command plans (as `/marathon-plan` does, with the mode) and runs in one go; a RUN id keeps running a saved plan. The owner's own words name it ("add marathon run one command"). Every host already has a `marathon-run` text and install destination (F73/F101), so no installer write lists, scan counts or PLATFORMS command rows change. The argument tokens are disjoint (`RUN-\d+` vs `sequential|parallel|\d+|max|[FBA]\d+[a-z]?`), so no ambiguity. The mode becomes a property of the plan (phase shape), which is exactly what the Workflow script and the no-Workflow hosts already execute phase by phase — no change to how a phase runs.

**C. A new command** (`/marathon-go`, `/marathon-now`). Clean name, but six new texts, every installer list and selftest list, PLATFORMS rows, README — all to say what B says inside a file that already exists on every host.

**Pick: B.** `Ruling: F112 carries on /marathon-run - the owner named it, every host already ships it, and the mode is a plan shape the run already honours phase by phase; /marathon (chain marathon) stays untouched - cost if wrong: one command text per host to split later, no data format to migrate.`

## DESIGN

### Contract — the argument grammar (mirrors /pending-subagent, F88)

`/marathon-run [sequential|parallel] [N|max] [IDs]` **or** `/marathon-run [RUN id]`.

- Mode first (optional): `sequential` or `parallel`. Then an optional count: a whole number ≥ 1 or `max`. Then optional ticket IDs. No mode and no count = `sequential`. A bare count still works (`2 F12`); `sequential` takes no count (`sequential 2`: say so and stop); `parallel 1` runs as `1`. No IDs = every open ticket on TICKETS.md (`[ ]`, `[~]`, `[!]` re-checked), picked through `ticket-meta pick` (F80).
- A RUN id alone (`RUN-0019`) runs the plan `/marathon-plan` saved for it, as saved (today's behaviour). A mode or count beside a RUN id → say the saved plan fixes its shape (`/marathon-plan <mode> <IDs>` plans again) and stop.
- Nothing typed: the one open run with a `.workflow.js` beside it and an unlanded stage → run it (today); two or more → list them and stop (today); none → plan over every open ticket, `sequential`, and run.
- A first word that is neither a mode, a count, a ticket ID nor a RUN id (`0`, `two`) → say it is not an option and stop. Exact sentence in every text: `say it is not an option and stop`.

The table, verbatim in every `/marathon-run` and `/marathon-plan` text and in marathon.md (the installer pins each row):

```
| Typed | Runs | A phase holds | `RELAY_CHAIN_PARALLEL` on `chain dispatch` |
|---|---|---|---|
| nothing, `sequential`, `1` | sequential | one ticket | unset |
| `parallel`, `max`, `parallel max` | parallel | every file-disjoint ticket that fits | the number of stages in the phase |
| `parallel 2`, `2` | parallel, capped | at most 2 file-disjoint tickets | 2 |
```

Two bullets follow it everywhere:
- `sequential` (the default): one ticket per phase, in board order, each stage planned `--after` the one before - one agent at a time (the implementer, then its verifier).
- `parallel`: file-disjoint tickets side by side in one phase, each stage in its own worktree, merged on landing; a count caps a phase. Tickets whose files overlap never share a phase, whatever the mode.

### How the mode maps onto phases (the Workflow script)

The mode is decided at plan time and lives in the plan — `PLAN.mode` in the `.workflow.js` (`'sequential'`, `'parallel'` or `'parallel <N>'`) and in `meta.description`. The run reads phases as before; nothing about how a phase executes changes:

| Mode | Phase shape (marathon.md Plan step 3) | `chain plan` edges | Agents at once |
|---|---|---|---|
| sequential | one ticket per phase, board order (pick order) | every stage `--after` the previous ticket stage | 1 (pipeline runs the implementer, then the verifier) |
| parallel / max | today's F96/F101 rule: a ticket goes in the first phase after every phase holding a ticket that shares one of its files | `--after` the stages it shares files with | the phase's ticket count |
| parallel N | the parallel grouping, then each group split into chunks of at most N in board order; chunk k+1 is a new phase after chunk k | `--after` the shared-file stages **and** the last stage of the previous chunk | at most N |

`Ruling: the count caps tickets per phase, which caps concurrent agents at N because pipeline() moves each item through fix then verify serially - no 2N burst; cost if wrong: a verifier and the next implementer overlap by one agent.`

The script's tail gains one check before `args.phase` is read (the template's own check, F96's precedent):

```js
const cap = PLAN.mode === 'sequential' ? 1 : /^parallel \d+$/.test(PLAN.mode) ? Number(PLAN.mode.slice(9)) : PLAN.mode === 'parallel' ? Infinity : NaN
if (Number.isNaN(cap)) throw new Error(`PLAN.mode must be 'sequential', 'parallel' or 'parallel <N>' - got ${JSON.stringify(PLAN.mode)}`)
PLAN.phases.forEach((p, i) => {
  if (p.length > cap) throw new Error(`PLAN.mode ${PLAN.mode} needs ${cap === 1 ? 'one ticket per phase' : `at most ${cap} tickets per phase`} - phase ${i + 1} holds ${p.length}`)
})
```

A plan written before F112 has no `PLAN.mode`: `undefined` is NaN-cap → the throw names it. `Ruling: an old plan is re-planned (/marathon-plan [mode] <IDs>) rather than defaulted - a plan with no mode line was written by an older template and its phases were grouped parallel; defaulting it to 'parallel' silently would contradict "no mode = sequential"; cost if wrong: one re-plan of a run saved before this release (RUN-0019..0023 have no .workflow.js in flight).`

### Where `RELAY_CHAIN_PARALLEL` comes from

From the table row the typed words resolve to, applied at **dispatch**, per phase:
- sequential: plain `RM chain dispatch <n> --driver … --owner …` — no `RELAY_CHAIN_PARALLEL` (the phase has one stage; the default cap is at least 1, and phases are serial anyway).
- parallel / max: `RELAY_CHAIN_PARALLEL=<stages in the phase>` (today's F101 line, unchanged, which the installer already pins as `RELAY_CHAIN_PARALLEL=`).
- parallel N: `RELAY_CHAIN_PARALLEL=<N>` (the phase holds at most N stages, so it equals or exceeds the stage count; `chain dispatch` treats it as a cap, F37).

It is a gate on `chain dispatch` only (relay-morpheus.sh `parallel_cap`, F37); the agents' concurrency is the phase shape.

### The no-Workflow hosts (F101 § Run without the Workflow tool)

They read `meta.phases` and `PLAN` as data (never execute the file) and already run a phase's tickets at once through a parallel delegate (cursor: several Task calls in one turn; agy/codex/muse: one subagent per ticket) and phases serial. So the mode reaches them through the phase shape with no new mechanism. One sentence per host text: *the mode shapes the phases; a phase's tickets run at once through the delegate; in-session hosts (opencode, gemini, pi without the extension) run a phase's tickets one after another, so `parallel` there plans parallel but runs serial - say so.* `Ruling: parallel is accepted on an in-session host and runs serial with a one-line notice, never refused - the plan is portable and a later session on a delegate host runs it in parallel; cost if wrong: a surprised owner on gemini, told in the first line.`

### When a plan already exists for the tickets

Planning (no RUN id) runs `ticket-meta pick`, then:
1. A picked ticket that is already a stage of an open run with a `.workflow.js` beside it is **skipped**, listed as `planned in RUN-<id>` — never two open runs over one ticket.
2. If every picked ticket sits in one such run and no mode or count was typed → run that run instead (`using RUN-<id>'s plan`); a mode or count typed → the RUN-id refusal above (the saved plan fixes its shape).
3. Nothing left to plan → say so and stop (the `planned in` lines name what to run).

`Ruling: skip-and-point, never re-plan over an open run - chain plan claims tickets (F80) and a second run would fight the first for the claim; cost if wrong: the owner types /marathon-run RUN-<id> once.`

### /marathon-plan

Gains the same first two words: `/marathon-plan [sequential|parallel] [N|max] [IDs]`, same table, same default (`sequential`), same refusals; still no agent, no `chain dispatch`, no Workflow call; ends with `run it: /marathon-run RUN-<0000>` as today. `Ruling: /marathon-plan's default moves from file-disjoint grouping to sequential so a saved plan and a one-shot plan read the same words the same way (the ticket: "no mode = sequential"); a plan that wants today's grouping types parallel; cost if wrong: one word on the command line.` Parked as Q-F112-1 only in that the owner may prefer the old default on `/marathon-plan` alone (see Decisions).

### The one-go flow (Claude Code; the other hosts the same with their delegate)

1. Parse the words (contract above); refusals stop here.
2. Plan — marathon.md Plan steps 1-6 with the mode: pick (F80, plus the `planned in` skip), `RM init`, phases per the mode table, prompt files, `RM chain plan … [--after …]`, the script with `PLAN.mode`, then **show** the plan (stages, phases with tickets/codes/files, skipped tickets and why, agent count, script path).
3. Run — marathon.md Run steps 1-5 straight after, no pause: typing the command is the opt-in (today's rule for `/marathon-run`). Dispatch per phase with the `RELAY_CHAIN_PARALLEL` rule above; one `Workflow({scriptPath, args: {phase: k, worktrees}})` per phase; land; `chain next` to `FINAL`; the end batch; the final stage; the push asked alone (headless: `push: waiting for the owner`).

### Edge cases

- `sequential 2` → "sequential takes no count" and stop. `parallel 1` → runs as `1` (sequential shape, said so).
- `parallel max`, `max`, `parallel` → identical. `0`, `two`, `fast` → not an option, stop. `parallel RUN-0019` → the RUN-id refusal.
- `parallel F12` with one ticket → one phase of one ticket; runs; the summary says 1 ticket.
- IDs naming a ticket owned by someone else → `skip <ID> <owner>` from `ticket-meta pick`, as today.
- Two open planned runs and nothing typed → list and stop (today). Two open planned runs and IDs typed → the IDs decide: the `planned in` rule per ticket.
- An old `.workflow.js` with no `PLAN.mode` run by RUN id → the script throws `PLAN.mode must be …` on the first phase call; the command says re-plan and stops, no stage dispatched after the throw (dispatch of that phase's rows already happened: `RM stage <n> '!'` each with why `plan has no mode`, tickets back to `[ ]`). To avoid even that, the Run step 1 reads the script as text first: no `mode:` line → stop before any dispatch. **Build this pre-check, not the post-throw path.**
- Grayskull on/off: the code-yoda first line rule is unchanged, text kept verbatim beside `.skillator/grayskull.md` (A155 pins).

### Out of scope

- `/marathon` (chain marathon, `plugin/commands/marathon.md`) and relay-morpheus.sh/.ps1 — untouched (F109 builds relay-morpheus.sh beside this).
- The ops-board Engage mode choice (F88 mentions it) — not a marathon surface.
- Muse (`commands: []`): "plan a marathon"/"run a marathon" load relay-morpheus, whose marathon.md carries the table; no muse text exists to edit.
- A `--sequential/--parallel` flag spelling; the F88 words are the contract.
- Changing how `pipeline()` runs a phase, or the VERDICT schema.

## CONSTRAINTS

- The three table rows, exact (pinned by install selftests in every `marathon-run` and `marathon-plan` text, Claude Code + 5 hosts, and in marathon.md):
  - `| nothing, `sequential`, `1` | sequential | one ticket | unset |`
  - `| `parallel`, `max`, `parallel max` | parallel | every file-disjoint ticket that fits | the number of stages in the phase |`
  - `| `parallel 2`, `2` | parallel, capped | at most 2 file-disjoint tickets | 2 |`
  - header `| Typed | Runs | A phase holds | `RELAY_CHAIN_PARALLEL` on `chain dispatch` |` then `|---|---|---|---|`
- The refusal sentence, exact, in every marathon-run and marathon-plan text: `say it is not an option and stop`.
- `argument-hint` of `commands/marathon-run.md` and `host-commands/pi/marathon-run.md`: `"[sequential|parallel] [N|max] [ticket ids, e.g. parallel 2 F12 F14] | [RUN id, e.g. RUN-0019]"`; of `commands/marathon-plan.md` and `host-commands/pi/marathon-plan.md`: `"[sequential|parallel] [N|max] [ticket ids, e.g. parallel 2 F12 F14]"`.
- `PLAN.mode` values: exactly `'sequential'`, `'parallel'`, `'parallel <N>'` (N a whole number ≥ 2; `parallel 1` is written as `'sequential'`). Template line: `  mode: 'sequential', // 'sequential' | 'parallel' | 'parallel <N>' - the mode /marathon-plan or /marathon-run was given (F112)`.
- Script throw messages, exact: `PLAN.mode must be 'sequential', 'parallel' or 'parallel <N>' - got <json>` and `PLAN.mode <mode> needs one ticket per phase - phase <i> holds <n>` / `PLAN.mode <mode> needs at most <N> tickets per phase - phase <i> holds <n>`.
- Strings the existing selftests pin and every edited text must keep: `Workflow` and `skillator:relay-morpheus` in both Claude Code commands; `workflow-authoring` in `commands/marathon-plan.md`; in every host `marathon-run` text `chain dispatch`, `.workflow.js`, `Run without the Workflow tool`, `RELAY_CHAIN_PARALLEL=`, the host's `--owner <task|subagent|session>` words (cursor `task`; pi and the agy skill `subagent` and `session`; gemini toml and opencode `session`; codex/agy `subagent`); `{{SKILLS}}/relay-morpheus/SKILL.md`; no `pending-subagent` in any marathon text; the code-yoda line verbatim on one line with `.skillator/grayskull.md`; `description: "` quoted (B6, no unquoted `: `); agy `name: marathon-run` / `name: marathon-plan`; B6 counts: exactly 5 `.md` files match `marathon-run` and 5 match `marathon-plan` under `commands/` + `host-commands/` (no new .md files).
- The Claude Code `commands/marathon-run.md` text contains `plans the marathon` (one-go pin) and `the saved plan fixes its shape` (RUN-id refusal pin).
- Host argument placeholders stay the host's: cursor and antigravity "the words typed after the command", gemini `{{args}}`, opencode and pi `$ARGUMENTS`, Claude Code `$ARGUMENTS`.
- No edit to anything below `// ---- nothing below is edited per run ----` in a *run's* copy; the template's tail is edited here once, in the template only.
- Pure ASCII in the template; en/em dashes stay out of the `.js`.

## FILES

Modify (19), all under `C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0023-pending-f100-f104/`:

1. `plugin/skills/relay-morpheus/templates/marathon-workflow.js` — `meta.description` mode words, `PLAN.mode`, the shape check, header comment.
2. `plugin/skills/relay-morpheus/references/marathon.md` — § "A saved Workflow marathon": new subsection "Mode - sequential or parallel (F112)" (grammar, table, phase mapping, RELAY_CHAIN_PARALLEL rule, existing-plan rule), Plan step 3 and step 5 edits, Run intro (`/marathon-run [mode] [N|max] [IDs]` plans then runs; the `mode:` pre-check), one sentence in § Run without the Workflow tool step 3.
3. `plugin/commands/marathon-run.md`
4. `plugin/commands/marathon-plan.md`
5. `plugin/host-commands/cursor/marathon-run.md`
6. `plugin/host-commands/cursor/marathon-plan.md`
7. `plugin/host-commands/pi/marathon-run.md`
8. `plugin/host-commands/pi/marathon-plan.md`
9. `plugin/host-commands/opencode/marathon-run.md`
10. `plugin/host-commands/opencode/marathon-plan.md`
11. `plugin/host-commands/gemini/marathon-run.toml`
12. `plugin/host-commands/gemini/marathon-plan.toml`
13. `plugin/host-commands/antigravity/marathon-run/SKILL.md`
14. `plugin/host-commands/antigravity/marathon-plan/SKILL.md`
15. `plugin/install.sh` — new `# F112` selftest block after the `# F88` block (~line 495) and one line in the installed-copies loop (~line 629).
16. `plugin/install.ps1` — the same two places (~line 527 and ~line 661).
17. `README.md` — relay-morpheus bullet, lines 276-282.
18. `plugin/PLATFORMS.md` — the `/marathon-plan`/`/marathon-run` paragraph, lines 235-243.
19. `plugin/WORKFLOW.md` — lines 46-48, one sentence.

No file created, none deleted, no installer write list, manifest or routing change.

## TASKS

Mode single: one implementer (build=opus), the tasks in order in the run/stage worktree, one commit per task, `/code-review` on the staged diff before each commit. Each task re-runs the selftests named; `sh plugin/install.sh --selftest` prints `ok` on green and `FAIL: <why>` + exit 1 on red (run from the worktree root; ~1-2 min); the PowerShell twin is `powershell -NoProfile -ExecutionPolicy Bypass -File plugin/install.ps1 -SelfTest`.

### Task 1: template and reference — the mode as a plan shape (build=build)

**Files:**
- Modify: `plugin/skills/relay-morpheus/templates/marathon-workflow.js` (header comment lines 1-12, `meta` 14-20, `PLAN` 27-35, insert before `const k = args && args.phase` ~line 62)
- Modify: `plugin/skills/relay-morpheus/references/marathon.md` (§ "A saved Workflow marathon - /marathon-plan, /marathon-run (F73)", lines 246-365 on the branch; re-read after F109 lands)
- Test: `plugin/install.sh` (new block after the F88 loop, before `[ -z "$_bad" ]`), `plugin/install.ps1` (after the F88 loop, before `$cmds = @(`)

**Interfaces:**
- Produces: `PLAN.mode` (string, values in CONSTRAINTS); the two throw messages; marathon.md subsection heading `### Mode - sequential or parallel (F112)` and the table (CONSTRAINTS) that Tasks 2-3 copy verbatim.

- [ ] Step 1: write the failing selftest — append to install.sh after the F88 `done` (line ~495):
```sh
  # F112: one marathon command - the mode is a plan shape: the template carries PLAN.mode and refuses a
  # phase wider than the mode allows; marathon.md carries the mode table
  _mw="$root/skills/relay-morpheus/templates/marathon-workflow.js"
  grep -qF "mode: 'sequential'," "$_mw" || { echo "FAIL: marathon-workflow.js PLAN has no mode line (F112)"; exit 1; }
  grep -qF "PLAN.mode must be 'sequential', 'parallel' or 'parallel <N>'" "$_mw" || { echo "FAIL: marathon-workflow.js does not check PLAN.mode (F112)"; exit 1; }
  if command -v node >/dev/null 2>&1; then
    awk '{print} /code: .XXXX., ticket: .F0./ {print "      { stage: 1, code: \047YYYY\047, ticket: \047F1\047, files: [\047b\047], done: \047d\047, prompt: \047p\047 },"}' "$_mw" > "$T/mw.mjs"
    _o=$(node --input-type=module -e "import {pathToFileURL} from 'node:url'; globalThis.args={phase:1}; await import(pathToFileURL(process.argv[1]).href)" -- "$T/mw.mjs" 2>&1)
    printf '%s' "$_o" | grep -qF 'PLAN.mode sequential needs one ticket per phase - phase 1 holds 2' || { echo "FAIL: marathon-workflow.js runs a two-ticket phase under mode sequential (F112): $_o"; exit 1; }
  fi
  for _r in '| nothing, `sequential`, `1` | sequential | one ticket | unset |' '| `parallel`, `max`, `parallel max` | parallel | every file-disjoint ticket that fits | the number of stages in the phase |' '| `parallel 2`, `2` | parallel, capped | at most 2 file-disjoint tickets | 2 |'; do
    grep -qF -- "$_r" "$root/skills/relay-morpheus/references/marathon.md" || { echo "FAIL: marathon.md has no mode row '$_r' (F112)"; exit 1; }
  done
  grep -qF '### Mode - sequential or parallel (F112)' "$root/skills/relay-morpheus/references/marathon.md" || { echo "FAIL: marathon.md has no Mode section (F112)"; exit 1; }
```
  and the ps1 twin after its F88 loop:
```powershell
  # F112: one marathon command - the mode is a plan shape (template PLAN.mode + check; marathon.md mode table)
  $mw = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'skills\relay-morpheus\templates\marathon-workflow.js'))
  if (-not $mw.Contains("mode: 'sequential',")) { return 'marathon-workflow.js PLAN has no mode line (F112)' }
  if (-not $mw.Contains("PLAN.mode must be 'sequential', 'parallel' or 'parallel <N>'")) { return 'marathon-workflow.js does not check PLAN.mode (F112)' }
  if (Get-Command node -ErrorAction SilentlyContinue) {
    $mwt = Join-Path $T 'mw.mjs'
    [IO.File]::WriteAllText($mwt, ($mw -replace "(?m)^(      \{ stage: 0, code: 'XXXX', ticket: 'F0'.*)$", "`$1`n      { stage: 1, code: 'YYYY', ticket: 'F1', files: ['b'], done: 'd', prompt: 'p' },"))
    $o = (& node --input-type=module -e "import {pathToFileURL} from 'node:url'; globalThis.args={phase:1}; await import(pathToFileURL(process.argv[1]).href)" -- $mwt 2>&1 | Out-String)
    if ($o -notmatch [regex]::Escape('PLAN.mode sequential needs one ticket per phase - phase 1 holds 2')) { return "marathon-workflow.js runs a two-ticket phase under mode sequential (F112): $o" }
  }
  $mm = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'skills\relay-morpheus\references\marathon.md'))
  foreach ($r in '| nothing, `sequential`, `1` | sequential | one ticket | unset |', '| `parallel`, `max`, `parallel max` | parallel | every file-disjoint ticket that fits | the number of stages in the phase |', '| `parallel 2`, `2` | parallel, capped | at most 2 file-disjoint tickets | 2 |') {
    if (-not $mm.Contains($r)) { return "marathon.md has no mode row '$r' (F112)" }
  }
  if (-not $mm.Contains('### Mode - sequential or parallel (F112)')) { return 'marathon.md has no Mode section (F112)' }
```
  (`$T` is the selftest temp HOME both scripts already define; check the variable name at the insertion point and use the one in scope.)
- [ ] Step 2: `sh plugin/install.sh --selftest` → `FAIL: marathon-workflow.js PLAN has no mode line (F112)`, exit 1.
- [ ] Step 3: implement the template:
  - header comment, add after line 11: `// PLAN.mode (F112) is the shape /marathon-plan or /marathon-run was given: 'sequential' = one ticket per phase, 'parallel' = file-disjoint tickets per phase, 'parallel <N>' = at most N; the check below refuses a wider phase.`
  - `meta.description`: `'RUN-0000 <title> (<mode>): one implementer per ticket, phases serial where tickets share files, one verifier per ticket in its phase'`
  - `PLAN`: after `runWorktree: …,` add `  mode: 'sequential', // 'sequential' | 'parallel' | 'parallel <N>' - the mode /marathon-plan or /marathon-run was given (F112)`
  - before `const k = args && args.phase` insert the `cap` block from DESIGN verbatim.
- [ ] Step 4: implement marathon.md: rename the section intro's first paragraph to say the plan is written by `/marathon-plan [mode] [N|max] [IDs]` or by `/marathon-run` with the same words in one go; add `### Mode - sequential or parallel (F112)` right after that intro, holding: the grammar paragraph (DESIGN § Contract, host-neutral: "the words after the command"), the table (CONSTRAINTS), the two bullets, the phase-mapping table (DESIGN), the `RELAY_CHAIN_PARALLEL` three-line rule, the existing-plan rule (three points), and the in-session notice. Edit Plan step 3 to begin `Phases follow the mode (Mode above): sequential - one ticket per phase in pick order, each stage --after the previous; parallel - a ticket goes in the first phase after …` (keep the old sentence as the parallel case); step 5: add `, mode (the words typed, 'sequential' when none)` to the `PLAN` fill list. Run intro: `(/marathon-run [RUN id] | [sequential|parallel] [N|max] [IDs]; a RUN id = run as saved; mode words = plan as Plan above with that mode, show it, then run - no pause; a mode beside a RUN id → the saved plan fixes its shape, stop; nothing = the one open run …)`. Run step 1: add `Read the script as text first: no `mode:` line in PLAN → it was written before F112; say re-plan with /marathon-plan and stop before any dispatch.` Run step 2: `RELAY_CHAIN_PARALLEL=<stages in the phase>` → `(sequential: no RELAY_CHAIN_PARALLEL; parallel: RELAY_CHAIN_PARALLEL=<stages in the phase>; parallel N: RELAY_CHAIN_PARALLEL=<N>)`. § Run without the Workflow tool step 3: append `The mode is the phase shape (Mode above): a delegate host runs a phase's tickets at once; an in-session host runs them one after another and says so when the plan is parallel.`
- [ ] Step 5: `sh plugin/install.sh --selftest` → `ok`; `powershell … -SelfTest` → `ok`. Also `node --check plugin/skills/relay-morpheus/templates/marathon-workflow.js` is NOT valid (top-level await + free globals) — instead run the fixture by hand once: `node --input-type=module -e "globalThis.args={phase:1}; await import(new URL('file:///C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0023-pending-f100-f104/plugin/skills/relay-morpheus/templates/marathon-workflow.js'))"` → throws `ReferenceError: phase is not defined` (the shape check passed; the Workflow globals are absent) — that is the expected output for a well-shaped single-ticket phase.
- [ ] Step 6: `git add -A plugin/skills/relay-morpheus plugin/install.sh plugin/install.ps1 && git commit -m "F112: PLAN.mode and its shape check in the marathon template; marathon.md Mode section (sequential | parallel | parallel N)"` (with the attribution line the session reminder gives).

### Task 2: the Claude Code commands — /marathon-run plans and runs, /marathon-plan takes the mode (build=build)

**Files:**
- Modify: `plugin/commands/marathon-run.md` (whole file, 16 lines)
- Modify: `plugin/commands/marathon-plan.md` (frontmatter + first paragraph + one bullet)
- Test: `plugin/install.sh`, `plugin/install.ps1` (extend the F112 block from Task 1)

**Interfaces:**
- Consumes: the table and refusal sentence from Task 1 (verbatim).
- Produces: the Claude Code wording Task 3 mirrors per host.

- [ ] Step 1: failing test — add to the F112 block (sh):
```sh
  for _n in marathon-plan marathon-run; do
    for f in commands/$_n.md; do
      for _r in '| nothing, `sequential`, `1` | sequential | one ticket | unset |' '| `parallel`, `max`, `parallel max` | parallel | every file-disjoint ticket that fits | the number of stages in the phase |' '| `parallel 2`, `2` | parallel, capped | at most 2 file-disjoint tickets | 2 |'; do
        grep -qF -- "$_r" "$root/$f" || { echo "FAIL: $f has no mode row '$_r' (F112)"; exit 1; }
      done
      grep -qF 'say it is not an option and stop' "$root/$f" || { echo "FAIL: $f has no bad-first-word refusal (F112)"; exit 1; }
      grep -q '^argument-hint: "\[sequential|parallel\] \[N|max\]' "$root/$f" || { echo "FAIL: $f argument-hint has no mode (F112)"; exit 1; }
    done
  done
  grep -qF 'plans the marathon' "$root/commands/marathon-run.md" || { echo "FAIL: commands/marathon-run.md does not plan and run in one go (F112)"; exit 1; }
  grep -qF 'the saved plan fixes its shape' "$root/commands/marathon-run.md" || { echo "FAIL: commands/marathon-run.md has no RUN-id mode refusal (F112)"; exit 1; }
```
  (Task 3 widens the inner `for f in` list to the host copies; write it as a list now so Task 3 only appends.) ps1 twin: a `foreach ($n in 'marathon-plan','marathon-run') { foreach ($f in "commands\$n.md") { … Contains($r) …; if ($ct -cnotmatch '(?m)^argument-hint: "\[sequential\|parallel\] \[N\|max\]') { return "$f argument-hint has no mode (F112)" } } }` plus the two `Contains` checks on `commands\marathon-run.md`.
- [ ] Step 2: `sh plugin/install.sh --selftest` → `FAIL: commands/marathon-plan.md has no mode row '| nothing, …' (F112)`.
- [ ] Step 3: write `plugin/commands/marathon-run.md`:
```markdown
---
description: "Plan and run a marathon in one go over the open tickets, or the IDs given - sequential by default (one ticket per phase, one agent at a time) or parallel (file-disjoint tickets side by side in a phase, a count caps them) - or run a plan /marathon-plan saved (a RUN id): each stage written to the run file before its dispatch, one phase per Workflow call, landing and the end batch as in a marathon (relay-morpheus)"
argument-hint: "[sequential|parallel] [N|max] [ticket ids, e.g. parallel 2 F12 F14] | [RUN id, e.g. RUN-0019]"
---

Load `skillator:relay-morpheus` (run file, chain, marathon, landing), `skillator:tickets-zordon`
(the board) and `workflow-authoring` (the Workflow script API) and run a Workflow marathon as
relay-morpheus `references/marathon.md`, "A saved Workflow marathon", says. Arguments: `$ARGUMENTS`

**Arguments** - the same as `/pending-subagent`, plus a RUN id. An optional mode first - `sequential` or
`parallel` - then an optional agent count, then optional ticket IDs (`parallel F12 F14`, `parallel 2`,
`2 F12`, `F12`): the command plans the marathon as `/marathon-plan` does, shows the plan, and runs it, in
one go. No mode and no count = `sequential`. The count is a whole number of at least 1 or `max`; a bare
count still works, `sequential` takes none (`sequential 2`: say so and stop) and `parallel 1` runs as `1`.
No IDs = every open ticket on TICKETS.md (`[ ]`, `[~]`, `[!]` re-checked). A RUN id alone (`RUN-0019`)
runs the plan `/marathon-plan` saved for it, as saved; a mode or count beside a RUN id → say the saved
plan fixes its shape (`/marathon-plan <mode> <IDs>` plans again) and stop. Nothing typed = the one open
run with a `.workflow.js` beside it (two or more → list them and stop; none → plan every open ticket,
`sequential`, and run). A first word that is neither a mode, a count, a ticket ID nor a RUN id (`0`,
`two`) → say it is not an option and stop.

| Typed | Runs | A phase holds | `RELAY_CHAIN_PARALLEL` on `chain dispatch` |
|---|---|---|---|
| nothing, `sequential`, `1` | sequential | one ticket | unset |
| `parallel`, `max`, `parallel max` | parallel | every file-disjoint ticket that fits | the number of stages in the phase |
| `parallel 2`, `2` | parallel, capped | at most 2 file-disjoint tickets | 2 |

- `sequential` (the default): one ticket per phase, in board order, each stage planned `--after` the one
  before - one agent at a time (the implementer, then its verifier).
- `parallel`: file-disjoint tickets side by side in one phase, each stage in its own worktree, merged on
  landing; a count caps a phase. Tickets whose files overlap never share a phase, whatever the mode.

1. **Plan** (no RUN id given): marathon.md Plan with the mode - `ticket-meta pick [IDs]` (F80; a ticket
   already a stage of an open run with a `.workflow.js` is skipped as `planned in RUN-<id>`; every picked
   ticket in one such run and no mode typed → run that run instead and say so; nothing left → say so and
   stop), `init`, `chain plan` (it claims the tickets; a refused claim is said), the script beside the run
   file with `PLAN.mode`. Show the stages, the phases, the agent count and the script's path, then run -
   no pause: typing this command is the opt-in to run the script with the Workflow tool.
2. **Run** (marathon.md Run): a script with no `mode:` line was written before this release - say
   `/marathon-plan` writes it and stop before any dispatch. Phase by phase: `chain decide`, then every
   stage `chain dispatch`ed (row `~`, prompt on disk) before the Workflow call that runs it - sequential:
   plain; parallel: `RELAY_CHAIN_PARALLEL=<stages in the phase>`; `parallel N`: `RELAY_CHAIN_PARALLEL=<N>`.
   With grayskull-power on (`.skillator/grayskull.md` present) every stage prompt opens with this line, and without it does not: `Load skillator:code-yoda first (restraint, full): the smallest diff that meets the ticket - no speculative abstraction, no new dependency, no refactor outside the ticket, no ceremony; run its review lens on your diff before /code-review and cut what it flags.`
   A stage whose ticket someone else owns is refused there (F80, `IDLE <n> owned <ID> <owner>`): leave it
   out of the phase and list it as skipped with its owner; dispatch claims the rest.
3. Land each phase as marathon.md says; park the owner's questions for one end batch; the six stops are
   asked the moment they are reached. Never push unasked: headless or no answer, end with
   `push: waiting for the owner`.
```
- [ ] Step 4: edit `plugin/commands/marathon-plan.md`: `argument-hint: "[sequential|parallel] [N|max] [ticket ids, e.g. parallel 2 F12 F14]"`; description gains `, sequential by default or parallel with an optional cap`; first paragraph: `Arguments: `$ARGUMENTS` - the same as /pending-subagent: an optional mode first (`sequential` or `parallel`), then an optional count (a whole number of at least 1 or `max`), then ticket IDs (none = every open ticket on TICKETS.md). No mode and no count = `sequential`; `sequential` takes no count (`sequential 2`: say so and stop); a first word that is neither a mode, a count nor a ticket ID (`0`, `two`) → say it is not an option and stop.` then the table and the two bullets (verbatim from above); new bullet after "The run file is relay-morpheus's": `- Phases follow the mode (marathon.md, Mode): sequential - one ticket per phase in pick order, each stage `--after` the previous; parallel - file-disjoint tickets per phase, a count splitting a phase at N; `PLAN.mode` records the words typed. A ticket already a stage of an open run with a `.workflow.js` is listed as `planned in RUN-<id>`, not planned again.` Last bullet's ending: `run it: /marathon-run RUN-<id>` unchanged.
- [ ] Step 5: `sh plugin/install.sh --selftest` → `ok`; ps1 → `ok`.
- [ ] Step 6: `git add -A plugin/commands plugin/install.sh plugin/install.ps1 && git commit -m "F112: /marathon-run plans and runs in one go with /pending-subagent's arguments; /marathon-plan takes the mode"`.

### Task 3: the ten host texts (build=build)

**Files:**
- Modify: `plugin/host-commands/{cursor,pi,opencode}/marathon-run.md`, `plugin/host-commands/{cursor,pi,opencode}/marathon-plan.md`, `plugin/host-commands/gemini/marathon-run.toml`, `plugin/host-commands/gemini/marathon-plan.toml`, `plugin/host-commands/antigravity/marathon-run/SKILL.md`, `plugin/host-commands/antigravity/marathon-plan/SKILL.md`
- Test: `plugin/install.sh` (~line 495 block and the installed-copies loop ~line 629), `plugin/install.ps1` (same two places)

**Interfaces:**
- Consumes: Task 2's wording; the host placeholders (CONSTRAINTS).
- Produces: nothing new; every host text now resolves the same words to the same table.

- [ ] Step 1: failing test — in Task 2's F112 block widen the inner list to `for f in commands/$_n.md host-commands/cursor/$_n.md host-commands/pi/$_n.md host-commands/opencode/$_n.md host-commands/antigravity/$_n/SKILL.md host-commands/gemini/$_n.toml; do` and gate the `argument-hint` grep on `case "$f" in commands/*|host-commands/pi/*)` (only those two carry frontmatter hints). In the installed-copies loop (`for _n in marathon-plan marathon-run; do for f in .codex/skills/$_n/SKILL.md:… `, ~line 618-632) add inside the inner loop: `grep -qF -- '| `parallel 2`, `2` | parallel, capped | at most 2 file-disjoint tickets | 2 |' "$T/${f%%:*}" || { echo "FAIL: $_n has no mode table in ${f%%:*} (F112)"; exit 1; }`. ps1: the same two widenings (`foreach ($f in "commands\$n.md", "host-commands\cursor\$n.md", …)`; the hint check only when `$f -like 'commands\*' -or $f -like 'host-commands\pi\*'`; in the installed loop `if (-not (& $has $p[0] '| `parallel 2`, `2` | parallel, capped | at most 2 file-disjoint tickets | 2 |')) { return "$n has no mode table in $($p[0]) (F112)" }`).
- [ ] Step 2: `sh plugin/install.sh --selftest` → `FAIL: host-commands/cursor/marathon-plan.md has no mode row '…' (F112)`.
- [ ] Step 3: edit each `marathon-run` host text. Replace its first paragraph's `Run: <ARGS> (none = the one open run with a `.workflow.js` beside it). Typing this command is the opt-in to run the plan.` with:
  `Arguments: <ARGS> - the same as /pending-subagent, plus a RUN id. An optional mode first - `sequential` or `parallel` - then an optional count (a whole number of at least 1 or `max`), then ticket IDs: the command plans the marathon as /marathon-plan does (relay-morpheus marathon.md, Plan, with the mode), shows it and runs it, in one go. No mode and no count = `sequential`; `sequential` takes no count (`sequential 2`: say so and stop); `parallel 1` runs as `1`; no IDs = every open ticket. A RUN id alone runs the plan saved for it, as saved; a mode beside a RUN id → say the saved plan fixes its shape and stop. Nothing typed = the one open run with a `.workflow.js` beside it (two or more: list them and stop; none: plan every open ticket, sequential, and run). A first word that is neither a mode, a count, a ticket ID nor a RUN id (`0`, `two`) → say it is not an option and stop. Typing this command is the opt-in to run the plan.`
  then the table and two bullets (verbatim), then the existing numbered steps with step 2's `RELAY_CHAIN_PARALLEL=<stages in the phase>` kept and extended: `(sequential: none; parallel: `RELAY_CHAIN_PARALLEL=<stages in the phase>`; `parallel N`: `RELAY_CHAIN_PARALLEL=<N>`)`; step 1 gains `A script with no `mode:` line was written before F112 - say /marathon-plan writes it and stop before any dispatch.`; delegate hosts (cursor, antigravity's agy/codex lines) add to step 2 `a phase's tickets run at once through <the delegate>, so the mode is the phase shape`; in-session hosts (opencode, gemini, pi's else-branch, antigravity's Gemini CLI clause) add `in this session a phase's tickets run one after another - a parallel plan runs serial here, say so in the first line`. `<ARGS>`: cursor/antigravity `the words typed after the command`, gemini `` `{{args}}` ``, opencode/pi `` `$ARGUMENTS` ``. Pi's `argument-hint` → the marathon-run hint in CONSTRAINTS. Descriptions: prefix `Plan and run a marathon in one go (sequential by default, or parallel with an optional cap), or run a plan /marathon-plan saved: ` and drop the leading `Run a planned marathon: `. Keep every pinned string (CONSTRAINTS).
- [ ] Step 4: edit each `marathon-plan` host text: `Tickets: <ARGS> (none = …)` → `Arguments: <ARGS> - the same as /pending-subagent: an optional mode first (`sequential` or `parallel`), then an optional count (a whole number of at least 1 or `max`), then ticket IDs (none = every open ticket on TICKETS.md; only the unassigned and yours, F80). No mode and no count = `sequential`; `sequential` takes no count (`sequential 2`: say so and stop); a first word that is neither a mode, a count nor a ticket ID (`0`, `two`) → say it is not an option and stop.` then the table and bullets; new step after step 1: `Phases follow the mode (marathon.md, Mode): sequential - one ticket per phase in pick order, each stage `--after` the previous; parallel - file-disjoint tickets per phase, a count splitting a phase at N; `PLAN.mode` records the words typed. A ticket already a stage of an open run with a `.workflow.js` is listed as `planned in RUN-<id>`, not planned again.` (renumber). Pi's `argument-hint` → the marathon-plan hint. Descriptions gain `, sequential by default or parallel with an optional cap`.
- [ ] Step 5: `sh plugin/install.sh --selftest` → `ok`; ps1 → `ok`. Spot-check B6: `find plugin/commands plugin/host-commands -name '*.md' | grep -c marathon-run` → `5`.
- [ ] Step 6: `git add -A plugin/host-commands plugin/install.sh plugin/install.ps1 && git commit -m "F112: every host's /marathon-run and /marathon-plan text takes sequential | parallel [N|max] [IDs]"`.

### Task 4: README, PLATFORMS, WORKFLOW (build=build)

**Files:**
- Modify: `README.md:276-282`, `plugin/PLATFORMS.md:235-243`, `plugin/WORKFLOW.md:46-48`
- Test: none runnable (docs); the VERIFICATION greps below are the check.

- [ ] Step 1: README lines 276-282 become: `` `/marathon-run [sequential|parallel] [N|max] [IDs]` (every host with commands; on muse, the plain words "run a marathon" load relay-morpheus) plans a marathon and runs it in one go with `/pending-subagent`'s words - no mode = sequential (one ticket per phase, one agent at a time), `parallel` = file-disjoint tickets side by side in a phase, a count caps a phase, IDs limit the tickets - an implementer and a verifier per ticket, both in the ticket's phase (fix then verify, no separate verify phase); `/marathon-plan [sequential|parallel] [N|max] [IDs]` writes the same plan without running it, `/marathon-run RUN-<id>` runs a saved plan as saved. Each stage is on disk before its dispatch: with the Workflow tool on Claude Code, with the host's delegate elsewhere (cursor Task, agy/codex subagents, muse child agents, pi's subagent extension), in-session where there is none (opencode, gemini, pi without it - a parallel plan runs serial there). ``
- [ ] Step 2: PLATFORMS 235-243: first sentence → `` `/marathon-run [sequential|parallel] [N|max] [IDs]` (F112) plans and runs a marathon in one go, `/marathon-plan` with the same words saves the plan and `/marathon-run [RUN id]` runs a saved one (F73, `relay-morpheus`): `` then the rest as is, adding after `phases serial where tickets share files` the words `, one ticket per phase under sequential (the default), at most N under parallel N - PLAN.mode`.
- [ ] Step 3: WORKFLOW 46-48 append: `The mode (`sequential` default, `parallel`, `parallel N`) is the plan's phase shape; a delegate host runs a phase's tickets at once, an in-session host one after another.`
- [ ] Step 4: `grep -n 'marathon-run \[sequential|parallel\]' README.md plugin/PLATFORMS.md` → one hit each; `grep -n 'phase shape' plugin/WORKFLOW.md` → one hit.
- [ ] Step 5: `git add README.md plugin/PLATFORMS.md plugin/WORKFLOW.md && git commit -m "F112: README, PLATFORMS, WORKFLOW name the one marathon command and its mode"`.

## VERIFICATION

Run from `C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0023-pending-f100-f104` (or the stage worktree dispatch names):

1. `sh plugin/install.sh --selftest` → last line `ok`, exit 0.
2. `powershell -NoProfile -ExecutionPolicy Bypass -File plugin/install.ps1 -SelfTest` → `ok`.
3. Mutation check (the pin is live): `sed -i.bak 's/| nothing, `sequential`, `1` | sequential | one ticket | unset |/| nothing | sequential | one | unset |/' plugin/host-commands/gemini/marathon-run.toml && sh plugin/install.sh --selftest; mv plugin/host-commands/gemini/marathon-run.toml.bak plugin/host-commands/gemini/marathon-run.toml` → `FAIL: host-commands/gemini/marathon-run.toml has no mode row '| nothing, `sequential`, `1` | sequential | one ticket | unset |' (F112)`, exit 1; then `ok` again after the restore.
4. Template shape check by hand: `node --input-type=module -e "globalThis.args={phase:1}; await import(new URL('file:///C:/tools/Projects/skillator2/.skillator/worktrees/RUN-0023-pending-f100-f104/plugin/skills/relay-morpheus/templates/marathon-workflow.js'))"` → `ReferenceError: phase is not defined` (shape passed; Workflow globals absent). With the template copied to a temp `.mjs` and `mode: 'sequential'` replaced by `mode: 'fast'`, the same import → `Error: PLAN.mode must be 'sequential', 'parallel' or 'parallel <N>' - got "fast"`.
5. Every marathon text carries the table and refusal: `grep -rlF 'say it is not an option and stop' plugin/commands/marathon-run.md plugin/commands/marathon-plan.md plugin/host-commands | sort` → the 12 marathon files (plus the 6 pending-subagent files, which carry F88's sentence) - 18 lines.
6. No marathon text regressed a pin: `grep -L 'RELAY_CHAIN_PARALLEL=' plugin/host-commands/*/marathon-run* plugin/host-commands/antigravity/marathon-run/SKILL.md` → empty; `grep -l 'pending-subagent' plugin/host-commands/*/marathon-* plugin/host-commands/antigravity/marathon-*/SKILL.md` → empty.
7. B6 counts: `find plugin/commands plugin/host-commands -name '*.md' | grep -c marathon-plan` → `5`; same for `marathon-run` → `5`.
8. `sh plugin/practice/scripts/check-muse-manifest.sh plugin` → exit 0 (nothing changed for muse; proves no stray file).
9. Regression sweep before each commit as the standing rules say, `/code-review` on the staged diff.
10. Live run (owner testing, [%]): on Claude Code `/marathon-run parallel 2 F12 F14` on a scratch board → the plan shown with two tickets in one phase (file-disjoint) or two phases (shared file), `RELAY_CHAIN_PARALLEL=2` on each dispatch line in the run file's In-flight blocks, one Workflow call per phase; `/marathon-run two` → "not an option"; `/marathon-run parallel RUN-0019` → the "saved plan fixes its shape" line.

## Decisions

- `Ruling: the command is /marathon-run - owner's words, every host ships it, mode = plan shape (CHOSEN).`
- `Ruling: the mode lives in the plan (PLAN.mode + phase shape), not in the run step - the Workflow script and the no-Workflow hosts already execute phase by phase, so no run mechanism changes; cost if wrong: a re-plan to change mode (one command).`
- `Ruling: sequential = one ticket per phase in pick order with --after chaining, so chain next and the Workflow agree on the order; cost if wrong: a slower marathon, never a file clash.`
- `Ruling: parallel N chunks the file-disjoint groups at N per phase, so N caps concurrent agents (pipeline is serial per item); cost if wrong: a verifier overlapping the next implementer by one agent.`
- `Ruling: RELAY_CHAIN_PARALLEL unset under sequential, <stages in the phase> under parallel, <N> under parallel N - the F88 rows' semantics at dispatch; cost if wrong: a dispatch refused by the cap, said by chain dispatch itself.`
- `Ruling: an old plan with no mode: line stops before dispatch and asks for a re-plan, never defaults; cost if wrong: one re-plan of a pre-F112 run.`
- `Ruling: tickets already in an open planned run are skipped as 'planned in RUN-<id>'; the whole set in one run with no mode typed runs that run; cost if wrong: one extra command typed.`
- `Ruling: parallel on an in-session host is accepted, planned parallel, run serial with a first-line notice; cost if wrong: a surprised gemini owner, told up front.`
- `Ruling: /marathon-plan takes the same words and the same default (sequential), so a saved plan and a one-shot plan read alike; cost if wrong: the owner types parallel to get the old grouping.`
- `Ruling: install selftests pin the rows, the refusal sentence, the argument hints, PLAN.mode and the shape throw, plus a node fixture gated on node being present; README/PLATFORMS/WORKFLOW are checked by grep in VERIFICATION, not pinned - a release package without README must still pass.`
- **Q-F112-1 (parked, taste)** — Should `/marathon-plan` alone keep its old default (file-disjoint parallel grouping) while `/marathon-run` defaults to sequential? Options: (a) same default on both - sequential (chosen default); (b) marathon-plan keeps parallel grouping by default, marathon-run defaults sequential. Default: (a) - one vocabulary, the ticket's words. Hurts: an owner used to `/marathon-plan` getting wide phases now types `parallel`.
- **Q-F112-2 (parked, taste)** — Should `parallel` with no count be capped by the usage-derived default (2 below 50 %) instead of "every file-disjoint ticket that fits"? Default: no cap, as F88's `parallel`/`max` row says - the F88 contract is the one the ticket asks to mirror. Hurts: a wide board under `parallel` opens many agents at once; `parallel 2` is the owner's brake.

## Self-review (PRACTICE §3), fixed inline

1. Coverage: one command plans+runs (T2 commands/marathon-run.md, T3 hosts); same arguments and refusals (table + sentence pinned in T1-T3); no mode = sequential one-per-phase one-agent (T1 mapping + template check); parallel file-disjoint side by side, count caps (T1 mapping, template `cap`); IDs limit (pick, as today); /marathon-plan and /marathon-run RUN-id keep working (contract, T2/T3); host texts and README say so (T3, T4); selftests pin (T1-T3). An existing plan (DESIGN rule, T2 step 3 / T3 step 4).
2. Placeholders: none - every text block is written out; the per-host `<ARGS>` is a table of three literal values.
3. Type consistency: `PLAN.mode` string values identical in template, CONSTRAINTS, marathon.md and the throw regex (`/^parallel \d+$/`, `slice(9)` = after `'parallel '`); the table rows identical across tasks (copied from CONSTRAINTS); the selftest file lists reuse the existing F73/F101 list shapes.
4. Ambiguity fixed: `parallel 1` → written as `'sequential'` in `PLAN.mode` (CONSTRAINTS), so the shape check and the summary agree; "nothing typed" has three explicit branches; a mode beside a RUN id is a refusal, not a re-plan.
5. Scope: one coherent change (a plan-shape mode plus the texts that name it); relay-morpheus.sh/.ps1, /marathon and the ops board untouched; the F109/F110 overlap on marathon.md and install.sh/ps1 is additive and re-read at build time.
