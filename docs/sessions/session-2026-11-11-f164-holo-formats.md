grade: bounded · critical no · design deep · build opus/sonnet per task · verify opus · ceremony full · ui arwen · mode per-task (ruled) · usage unobservable

PLATFORM:     claude-code (delegated design seat, RUN-0038 worktree)
GRADE:        grade: bounded · critical no · design deep · build opus/sonnet per task · verify opus · ceremony full · ui arwen · mode per-task (ruled) · usage unobservable
DESIGN_MODEL: deep (this seat)
BUILD_MODEL:  opus / sonnet, tagged per task (build=opus / cheap=sonnet)

# F164 - holo-r2d2 multi-format HTML views and themes

Classification (PRACTICE S1): bounded. The flow already exists - `parseRun`
in `plugin/skills/holo-r2d2/scripts/holo.mjs` turns a run file into one
model, and `render` / `renderMarkdown` / `renderSvg` / `renderAscii`,
`wizardPage` (`scripts/wizard.mjs`), `anatomyFigure` (`scripts/anatomy.mjs`)
and `understandPage` (`scripts/understand.mjs`) already present that model
four ways. F164 adds four HTML presentations of the same model plus a theme
selector. It restructures no interface others depend on: the default page is
byte-identical when the new flags are absent (CONSTRAINTS, Task 1 hash pin).
Ceremony is full because the work runs inside a relay run and has 6 tasks.
Critical: no - no auth, money, concurrency, or shared schema; the one
contract at risk is the default output, and it is pinned by hash.

## GOAL

Extend holo-r2d2 (`plugin/skills/holo-r2d2/scripts/holo.mjs`, `SKILL.md`)
with a `--format=<type>` selector and pluggable HTML presentations beyond
the default anatomy/artifact layout - `timeline`, `executive`, `runbook`,
`mindmap` - plus `--theme=dark|light|contrast|print` applied to every HTML
format. Done (ticket): `--format` documented in `SKILL.md`, formats
validated in `holo.mjs --selftest`, standalone HTML for all formats, no
external CDN.

## REQUIREMENTS

- R1 - `--format=timeline|executive|runbook|mindmap` (also `--format <type>`)
  selects a presentation; unknown values are refused with the valid list;
  no positional format word is added; absent `--format` (and absent
  `--theme`) the default Artifact/standalone/ASCII output is byte-identical
  to today.
- R2 - `--theme=dark|light|contrast|print` (also `--theme <type>`) applies
  to the default HTML page and to all four formats; unknown values refused;
  an explicit theme is emitted as `data-theme` on `<html>` of a standalone
  page and locks that theme against `prefers-color-scheme`.
- R3 - `timeline`: interactive timeline of the run - recorded stage times,
  parallel lanes from `layout(run)`, heartbeat markers, and the critical
  path - using only times the run file actually records (DESIGN D2).
- R4 - `executive`: print/PDF-friendly stakeholder summary - progress KPIs,
  decision audit log (all decisions, not only open ones), milestones, and
  risk signals derived from recorded states.
- R5 - `runbook`: step-by-step operational checklist in dependency order,
  one step per stage, with recorded verify evidence or an explicit
  "not recorded" line, artifacts, and reproducible inputs. The page never
  writes the run file; check state is local to the page.
- R6 - `mindmap`: hierarchical tree of the run's tickets - parent-child by
  ticket-id suffix where the parent is in the run, dependency edges kept
  separate from the tree, affected modules per ticket - from the run file
  only.
- R7 - Every format is one standalone HTML file: own doctype, inline CSS/JS
  only, no CDN, no network fetch, no `<script src>`, no `https?://`
  reference (the SVG `xmlns` excepted, as today's selftest excepts it).
  All run-file text is escaped; the ASCII renderer and CLI log lines stay
  pure ASCII.
- R8 - `SKILL.md` documents `--format` and `--theme` (Draw it, output
  picker, Script section); `holo.mjs --selftest` validates every format in
  every theme; `anatomy.test.mjs` still passes.
- R9 - No format invents data: no stage start/end/duration, heartbeat
  meaning, verify command, ticket parent, title, or risk score that the
  run file does not record. What cannot be derived is omitted and the
  omission is shown on the page.
- R10 - Edge cases render without hanging or `NaN`: a run with no stages,
  parallel lanes, a ticket with no parent in the run, a huge run (60+
  stages), an `after:` cycle, unknown stage states, hostile markup in run
  text.

## APPROACHES

**A. Four renderers inside `holo.mjs`, dispatched by an if/else in `main`.**
Like `renderMarkdown` / `renderSvg` today, all in the one file.
- Trade-off: `holo.mjs` is already 1398 lines with the parser, four
  renderers, ticket mode and the selftest. Four more page renderers plus
  four theme blocks make it the file every future format must fight over,
  and the selftest grows with it. Nothing is pluggable: a fifth format is
  another branch in the same crowded file.

**B. New `scripts/formats.mjs`: one renderer per format behind a registry,
sharing the parsed model; `holo.mjs` only parses flags and dispatches
(CHOSEN).** `formats.mjs` exports `FORMATS`, `THEMES`, the four pure model
builders, the four body renderers, `FORMAT_RENDERERS`, `formatPage` (full
standalone page) and `themeCss`. It imports nothing from `holo.mjs` -
`holo.mjs` passes the parsed `run` and the `layout(run)` result in, the
same one-way shape as `anatomy.mjs` (`figureParts(run)`,
`anatomyFigure(run, now)`) and `understand.mjs`
(`extractDomainGraph(run, design)`, `understandPage(run, opts)`), which
already duplicate the tiny `esc`/`clip` helpers rather than import them.
- Trade-off: one new module and a passed-in `layout` value. In return each
  format is testable as a pure model (`timelineModel(run, layout)` etc.),
  a fifth format is one renderer + one registry entry + one selftest row,
  and `holo.mjs` grows by flag parsing and one dispatch branch only.

**C. External HTML template files per format, loaded at runtime.**
- Trade-off: templates still need the same model logic in JS, add runtime
  file reads beside an installed skill whose scripts are copied between
  hosts, and split one renderer across two files. Rejected: no benefit
  over B, more ways to ship a broken install.

## CHOSEN

Approach B - `scripts/formats.mjs` with a `FORMAT_RENDERERS` registry, one
pure model builder + one body renderer per format, `formatPage` returning
the full standalone page (the `understandPage` precedent), and `holo.mjs`
changed only for: additive model fields, `--format`/`--theme` parsing, one
dispatch branch in `main`, the optional `data-theme` on `standalonePage`,
and selftest rows. Why: it is the repo's own pattern for exactly this
problem (anatomy and understand are already separate presentation modules
fed by `parseRun`), it keeps the byte-identical default provable (the
default render path gains no new code except behind an explicit `--theme`),
and it makes each format independently testable and reviewable, which the
6-task build needs because all tasks touch overlapping files and must run
sequentially.

## DESIGN

### D0. What the run model actually has (read from `parseRun`, holo.mjs:76-157, 159-247)

Timing - the honest inventory the timeline must live on:

| Data | Source in the run file | Parsed as | Shape |
|---|---|---|---|
| Run start / update | `started:` / `updated:` in the header (line 90-91) | `run.started`, `run.updated` | one token each, usually ISO, may be `-` or absent |
| Stage heartbeat | Stages table column 5 | `stage.heartbeat` | ISO (`2026-09-01T11:50Z`), `-`, or free text; a last-seen stamp, not a start or an end |
| Stage landed value | Stages table column 6 | `stage.landed` | a commit sha (`4d72860`), `stage 6` for a re-plan, `-`; it is not a timestamp in any fixture |
| Dispatched stamp | `### stage n - ... (dispatched 2026-09-01T11:00Z, ...)` under `## In flight` | only inside `run.inflight[n].head`, unparsed today | ISO in `fixture-all-states.md`; time-only (`09:40`) in `fixture-plain.md` |
| Last seen | `last seen:` under `## In flight` | `stage.lastSeen` via `derive` | free text (`dispatched`), usually not a time |
| Decision stamps | `### Qk <state> <ts>` header; `answered:` / `ruled:` / `replanned:` fields | `q.ts`, `q.f.*` | ISO in fixtures |
| Durations, stage start/end | - | - | **not recorded anywhere. No field, no column.** |

So: there is no stage start time, no stage end time, and no duration in
the model, and `landed` cannot be read as an end time (it is a sha).
A timeline that drew start-to-end bars from these fields would invent
them. D2 below is built only from the rows above.

Everything else the formats need is already parsed: stage `n`, `code`,
`name`, `state` (pending/inflight/landed/failed/parked/replanned/unknown),
`owner`, `tickets`, `files`, `after`, `implicit`, `waits`, `replacedBy`;
decision `id`, `state`, `ts`, `f.*` (question, ticket, reason, blocks,
files, default, answer, ...), `options`, `holds`; `run.qs`, `run.rulings`,
`run.chain {driver, hold, mode}`, `run.plan`, `run.holdsFrom`
(relay/estimate); `layout(run)` (holo.mjs:289) gives dependency depth
(`col`), `lane` within a column, and after/implicit/replaced `edges`, and
already survives an `after:` cycle. There is **no verify-command field**
anywhere (Stages columns and Chain `tickets:`/`files:`/`after:`/
`independent-of:`/`prompt:` are all the fields there are), and **no ticket
title or parent field** in the run model - titles and board parentage live
in `TICKETS.md`, which the run path of `holo.mjs` never reads (only
`--ticket` mode does).

Two additive model enrichments are therefore specified in Task 1, both
derived from text the parser already walks over, both ignored by every
existing renderer (so the default output cannot change):

- `stage.dispatchedAt`: the first ISO timestamp after `dispatched ` in the
  stage's In-flight head, else `""`. Time-only heads (`09:40`) yield `""` -
  the date is not guessed.
- `stage.prompt`: the stage's Chain `prompt:` body (the indented lines the
  parser today skips via `inPrompt`), else its In-flight `prompt:` body,
  else `""`. Captured verbatim, two-space prefix stripped. Field parsing
  inside a prompt stays off - the existing selftest assertion that
  `prompt-body.txt` is not a file (holo.mjs:1212) must still pass.

### D1. Shared plumbing (Task 1)

`scripts/formats.mjs` (new) exports, exactly:

```js
export const FORMATS = ["timeline", "executive", "runbook", "mindmap"];
export const THEMES = ["dark", "light", "contrast", "print"];
export function parseTime(v)            // -> ms since epoch | null
export function timelineModel(run, layoutData)
export function executiveModel(run)
export function runbookModel(run, layoutData)
export function mindmapModel(run)
export function renderTimeline(run, ctx)   // -> body HTML string
export function renderExecutive(run, ctx)
export function renderRunbook(run, ctx)
export function renderMindmap(run, ctx)
export const FORMAT_RENDERERS = { timeline: renderTimeline, executive: renderExecutive, runbook: renderRunbook, mindmap: renderMindmap };
export function formatPage(run, format, opts = {})  // -> full standalone HTML
export function themeCss(theme)         // -> "" for dark/light/undefined; the contrast/print override block otherwise
```

- `ctx` is `{ layout, now, theme, runPath }`: `layout` is the result of
  `layout(run)` computed once in `holo.mjs` and passed in (no import cycle;
  `formats.mjs` imports nothing from `holo.mjs`, duplicating `esc`/`clip`
  as `understand.mjs:7-8` and `anatomy.mjs:33` already do).
- `parseTime(v)`: returns `Date.parse(v)` only when `v` matches
  `/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d/` and parses finite; `null` for `-`,
  `""`, shas, `stage 6`, `dispatched`, time-only strings, and anything
  else. This one function is the only door times enter through (R9).
- `formatPage(run, format, opts)` takes `opts = { theme, now, runPath, layout, designHtml }` and passes that same object to the renderer as `ctx`. It follows `understandPage` (understand.mjs:328): full
  `<!doctype html>` document, `<html lang="en" data-theme="<theme>">` when
  a theme is given (attribute omitted when not), `<title>Holo <RUN-id>
  <format></title>`, `<style>` = format CSS + `themeCss(theme)`, a skip
  link, `<main data-run="<id>" data-format="<format>">`, the renderer's
  body, the shared footer (drawn-from line, holds source, "decides
  nothing" line - same wording source as `render`, holo.mjs:709-711), and
  the format's static `<script>` if it has one. With `--design`, `holo.mjs`
  passes `opts.designHtml` (the existing `designBlock` output) and
  `formatPage` appends it after the format body, unchanged, in all four
  formats.
- File naming follows the understand precedent: default out is
  `.skillator/holo/<RUN-id>.<format>.html`; `--out` overrides;
  `writeGenerated` is reused (it writes the `*` `.gitignore`).
- CLI surface (in `parseArgs`, holo.mjs:942):
  - `--format=<v>` and `--format <v>` set `o.format`; `--theme=<v>` and
    `--theme <v>` set `o.theme`. Values are validated after the scan
    (the `--ticket` validation at holo.mjs:984 is the shape): unknown
    format throws `unknown --format <v> (timeline, executive, runbook,
    mindmap, default)`; unknown theme throws `unknown --theme <v> (dark,
    light, contrast, print)`. `--format=default` is accepted and means
    today's renderer.
  - Refused combinations throw before any file is written: `--format`
    with mode `md|svg|ascii|wizard|understand|batch`, with `--anatomy`,
    `--ticket`, `--decisions`, `--answers`, `--next-wizard`, or
    `--fixture`; and a format on a design-only invocation (no run) throws
    `--format draws a run - name one` (the `--batch` line at holo.mjs:1122
    is the precedent). `--theme` is refused with mode
    `md|svg|ascii|wizard|understand|batch` and with `--ticket`, and
    `--theme` without `--html` and without a new format throws
    `--theme needs --html or --format (a standalone page)` - the Artifact
    fragment has no `<html>` to carry `data-theme`, and silently ignoring
    the flag is worse than refusing it.
  - No positional format word (`holo.mjs RUN-12 timeline` keeps meaning
    two positionals and errors as today). `--format` is the one surface.
- Default-page theme path: `render(run, opts)` gains `opts.theme`;
  `standalonePage(r, theme)` gains an optional second argument. With no
  theme both return exactly today's strings (hash-pinned, Task 1). With a
  theme, `standalonePage` emits `<html lang="en" data-theme="<theme>">`
  and `render` appends `themeCss(theme)` to the CSS. `dark`/`light` need
  no appended CSS (the `:root[data-theme="dark"]` block and the
  `:root:not([data-theme="light"])` guard already exist, holo.mjs:536-537);
  `themeCss` returns the contrast and print blocks only. The wizard and
  understand pages are untouched by `--theme` (refused above, not
  silently half-applied).

### D2. timeline (R3)

Model (`timelineModel(run, layoutData)`):

```js
{ window: { start, end } | null,        // ms, from parseable events only
  events: [{ at, kind, label, n? , q? }],// run started/updated, dispatched, heartbeat, decision stamps
  rows:   [{ n, code, name, state, lane, col, bar: {from, to, kind} | null, points: [{at, kind}] , critical: bool }],
  criticalPath: [n, ...],               // stage numbers, after:-edges only
  laneCount, stepCount }
```

- Events are collected only through `parseTime`: `run.started`,
  `run.updated`, each stage's `dispatchedAt` and `heartbeat`, each
  decision's `q.ts` and parseable `q.f.answered` / `q.f.ruled`. `window`
  is their min/max; with fewer than 2 distinct times `window` is `null`.
- A stage gets a `bar` only when both ends are recorded for that stage:
  `dispatchedAt` and `heartbeat` both parse and `heartbeat >= dispatched`.
  The bar is labelled everywhere it appears as an **observed window**
  ("dispatched -> last heartbeat"), never "duration". A landed stage gets
  no end point from `landed` (a sha is not a time, D0). Every other stage
  is drawn as points on its row (heartbeat point, dispatched point), and
  its row text says `duration not recorded` where a duration would go.
- Lanes come from `layout(run)`: `lane`/`col` per stage, lanes grouped as
  in the stage graph (one column's stages may run side by side). Rows are
  ordered by lane, then stage number. Parallel stages are separate rows in
  the same lane band with overlapping windows allowed - nothing is merged.
- Critical path: the longest chain over `after:` edges only (implicit
  final-stage and replaced edges excluded - the final stage would
  otherwise always win by convention, not by data), computed by memoised
  DFS with an in-stack guard so an `after:` cycle terminates (returning 0
  for the cyclic branch, as `layout`'s `visit` does at holo.mjs:295).
  Ties break to the lowest stage number, so the result is deterministic.
  It is labelled **"critical path (longest after: chain, by stage
  count)"** and the stage numbers are listed; durations are never summed
  (they do not exist, D0). Path stages carry `critical: true`.
- Rendering: a time axis (SVG, `role="img"`, `<title>` + adjacent data
  table - UI design), one row per stage on the Run Rail, heartbeat points
  as diamonds with the raw stamp in the row table, critical-path rows
  carrying a `CP` badge and a thickened rail segment (never colour
  alone). Lane filter buttons (`data-lane`) hide/show rows; all logic
  reads the DOM, no run text is embedded in JS. When `window` is `null`:
  no SVG scale is drawn; the page shows the recorded-times list and the
  line `Not enough recorded times to draw a scale.` - the stage rows and
  table still render.

### D3. executive (R4)

Model (`executiveModel(run)`):

```js
{ kpis: { total, done, pct, landed, inflight, parked, failed, pending, replanned, unknown, openDecisions },
  milestones: [{ n, code, name, landed, heartbeat }],   // landed stages, stage order
  audit: [{ id, state, ts, ticket, question, outcome, holds, answer }],  // every Q, k order
  risks: [{ signal, stages: [n], detail }] }            // derived, see rules
```

- `done = landed + replanned` (the anatomy readout's own count,
  anatomy.mjs:159); `pct = total ? Math.round(100 * done / total) : null`,
  rendered `-` when `total` is 0 - never `NaN%`.
- Milestones are landed stages only, in stage order, showing the recorded
  `landed` value and heartbeat text as recorded. A replanned stage is not
  a milestone; it appears in risks/info with its replacement.
- Audit covers **all** decisions in `Qk` order (the stakeholder question
  is "what was decided", and `otherQs`, holo.mjs:487, already computes the
  closed outcome string - replanned/moot/same-as/answer - which the audit
  reuses in shape). Open/asked rows show `holds` stages.
- Risks are facts restated, with a disclosed mapping and no score:
  failed stages (signal `failed stage`), parked stages with the Qs that
  hold them (`parked on <Qk>`), open/asked decisions (`<k> decisions
  waiting`), unknown-state stages (`state not recognised (<raw>)`),
  inflight stages whose heartbeat does not parse (`no heartbeat
  recorded`), replanned stages (`re-planned to stage <n>`). No
  probability, no RAG rating, no invented severity number; ordering is
  failed, parked/held, unknown, no-heartbeat, replanned. No signals ->
  `No risk signals in the recorded states.`
- Rendering is static HTML (no script): KPI band, milestones on the Run
  Rail, audit as a real `<table>`, risks as a list. It is the print-first
  format (UI design): `@media print` rules live in the format CSS itself,
  so it prints cleanly under any theme, and `--theme=print` is its
  stakeholder-PDF path.

### D4. runbook (R5)

Model (`runbookModel(run, layoutData)`):

```js
{ inputs: { id, title, plan, started, updated, chain, runPath, holdsFrom },
  steps: [{ n, code, name, state, owner, tickets, after, implicit: bool,
            files, prompt, landed, replacedBy,
            verify: { kind: "recorded" | "none", text } }] }
```

- Step order is dependency order: layout columns ascending, stage number
  ascending within a column (the order `renderAscii` already walks,
  holo.mjs:751). Steps in one column are badged `may run side by side`.
  `after` prerequisites and the implicit final-stage convention are named
  on the step.
- Verify, honestly (D0: no verify command exists in the model): when the
  stage is landed, `verify.kind` is `recorded` and the text is the check
  the record supports - `Landed <value> recorded - confirm it is the
  commit/artifact for this step.` When the stage's `prompt` was captured
  it is shown as the step's instructions (in a `<pre>`, escaped), but no
  command is extracted from it - extracting shell lines from prose would
  invent the command. Otherwise `verify.kind` is `none` and the line
  reads `Verify command: not recorded in the run file.` That line is the
  designed behaviour, not a gap to fill with a guessed `npm test`.
- Artifacts per step: `files`, the `landed` value, `replacedBy`. Inputs
  header (reproducible inputs): run id/title, `plan`, `started`,
  `updated`, chain driver/hold/mode, the run file path, and the holds
  source line, exactly as recorded.
- Interactivity: one native checkbox per step (`data-step="<n>"`), a
  sticky progress header (`<n> of <m> steps checked`, `aria-live`), state
  kept in `localStorage` under `holo-runbook-<RUN-id>` (the wizard draft
  precedent) inside try/catch - storage failure leaves in-page checking
  working and says nothing false. The script is a static string; step
  numbers come from the DOM, no run text is embedded in JS. Checking a
  box writes nothing anywhere else: holo decides nothing and writes no
  run file, as ever. Print opens all `<details>` via `beforeprint`.

### D5. mindmap (R6)

Model (`mindmapModel(run)`):

```js
{ roots: [ticketId],                       // no parent in this run, stage order of first appearance
  tickets: [{ id, parent: ticketId | null, stages: [n], state: <of its earliest stage>,
              dependsOn: [ticketId], modules: [name], decisions: [Qk] }],
  modules: [{ name, files: [path], tickets: [ticketId] }] }
```

- The tree is containment, which cannot cycle: run -> stages (stage
  order) -> the tickets that stage works (`stage.tickets`, plus ids in
  the stage's raw name as `derive` already recognises them for ticket
  evidence). Each ticket's tree home is its **earliest stage** (lowest
  layout depth is not available here - earliest by stage number after
  sorting by `after` depth via the passed layout is overkill; home =
  lowest stage number); its other stages are listed on the ticket as
  chips, never as duplicate tree nodes.
- Parent-child is only the id-suffix relation the board itself uses
  (`F90a` is a sub-part of `F90`, TICKETS.md F24): a ticket matching
  `/^([A-Z]{1,3}\d+)([a-z])$/` whose base id is also in the run's ticket
  set gets `parent = base`; it is nested under the base in the "Tickets"
  branch of the tree. Every other ticket has `parent: null` and sits in
  the roots list, labelled `no parent in this run`. A base id that is not
  in the run is named in that label (`parent F90 not in this run`) - the
  parent is never fetched from `TICKETS.md` and never guessed from stage
  order. Stage neighbours are not parents.
- Dependencies are a separate, dashed relation, never tree nesting:
  ticket A `dependsOn` ticket B when A's home stage has an `after:` edge
  to a stage that works B (transitively listed one hop per edge, as
  recorded), plus decisions: a decision whose `blocks`/ticket names the
  ticket is listed under `decisions`. Cycles in `after:` therefore cannot
  loop the renderer - the tree is built from containment only, and
  `dependsOn` is a flat list per ticket.
- Affected modules: from the ticket's stages' `files`, grouped by the
  `topModule` rule `understand.mjs:12` already uses (first two path
  segments, or `root`), duplicated in `formats.mjs`. Decision `files`
  for its decisions are included and marked as decision files.
- Rendering: nested lists with rail guides (UI design), stage branches
  first, then the Tickets branch (parents with children nested), then
  Modules. Branches beyond the first level use `<details>` (native
  keyboard support); `beforeprint` opens them for print. Counts are
  stated (`<t> tickets, <m> modules`); nothing is capped or dropped -
  huge runs collapse, they do not truncate.

### D6. Edge cases (all formats, R10)

| Case | Behaviour |
|---|---|
| Run with no stages | Every format still returns a standalone page. timeline: no axis, `No stage rows in this run file.` plus any recorded header times as a list. executive: `total 0`, pct `-`, empty milestones/audit stated. runbook: 0 steps, progress `0 of 0`, inputs header still shown. mindmap: `No tickets in this run.` |
| Parallel lanes | timeline: separate rows, same lane band, overlaps allowed. runbook: same-column steps contiguous, badged `may run side by side`. mindmap: tickets of one stage are siblings, never parent-child. executive: counts only. |
| Ticket with no parent | mindmap roots list, `parent: null`, labelled as above (D5). |
| Huge runs | Models are O(stages + edges); all rows render. timeline/runbook scroll inside their own box (the `.scroll` precedent, holo.mjs:554); runbook prompts and mindmap branches start collapsed; executive audit is a table. Selftest builds a 60-stage run and asserts 60 rows and no `NaN`. |
| `after:` cycle | `layout` already survives it; `timelineModel`'s critical-path DFS has an in-stack guard; mindmap tree is containment-only. The existing odd-fixture cycle (selftest holo.mjs:1285) is re-rendered in all four formats. |
| Unknown / missing data | Unknown states keep their raw cell (`unknown (z)`, the existing convention); unparseable times are shown as recorded text in tables and omitted from the axis; a stage with no files says `files: not listed in the run file` (holo.mjs:392 wording). |
| Hostile text | The existing nasty fixture (selftest holo.mjs:1271) is rendered in all four formats: no raw `<b>`/`<script>`, no unescaped `</script>` in any embedded JSON. |

### D7. Out of scope

- No new run-file fields are written by anyone; holo still never writes
  the run file or `TICKETS.md`, and runbook checkmarks are not answers
  (no `db` answers path, no relay calls).
- No reading `TICKETS.md` in the run path: mindmap ticket titles,
  board-side parents, and owners stay out (the `--ticket` page owns board
  evidence, F116).
- No PDF generator, no timeline editing or drag, no duration estimation,
  no test-runner guessing, no shell-command extraction from prompts.
- No `--format` for `--md`/`--svg`/`--ascii`/`--wizard`/`--understand`/
  `--batch`/`--ticket`/design-only, no positional format words, no
  `--theme` for the wizard or understand pages (refused, D1).
- No installed-copy sync, no version bump: release/installer steps own
  those, as with every holo change.
- No change to stage-state semantics, holds judgement (`relayHolds`,
  holo.mjs:1007), or any existing renderer's output.

## CONSTRAINTS

CONSTRAINTS:
- Standalone HTML only for the four formats: one file, own doctype, inline CSS/JS, no CDN, no network fetch, no external font or script; the page draws offline (the wizard/understand rule, SKILL.md Script section).
- Default output byte-identical when `--format` and `--theme` are absent: pinned in `--selftest` by the SHA-256 hashes of `artifactPage(render(parseRun(fixture-all-states.md)))`, its `standalonePage`, and `renderAscii` computed on the unmodified code (Task 1, Step 1). New CSS reaches the default page only behind an explicit `--theme`; new model fields (`prompt`, `dispatchedAt`) are read by no existing renderer.
- `--theme` applies to every HTML format (default page + the four formats) and to nothing else; explicit theme = `data-theme` on `<html>`; theme token names are the existing holo vocabulary (`--ground`, `--surface`, `--ink`, `--mid`, `--faint`, `--rule`, `--landed`, `--inflight`, `--parked`, `--failed`, `--replanned`, `--pending`, `--accent`, state `-bg` pairs) in both `holo.mjs` and `formats.mjs`, so one `themeCss` override block serves both.
- Pure ASCII where holo requires it: the ASCII renderer (unchanged), CLI log lines, and `SKILL.md` examples. HTML bodies may use the existing typographic escapes (`\u2026`, `\u00b7`) as the current page does.
- One parsed model: all formats consume `parseRun(md, holds)` output plus the `layout(run)` value passed in; `formats.mjs` never re-parses run text and imports nothing from `holo.mjs`.
- Never invent: times, durations, verify commands, ticket parents/titles, risk scores (R9). `parseTime` is the only time door; the suffix rule is the only parent door.
- Escaping: every run/design string goes through `esc` (formats.mjs duplicates it, the anatomy/understand precedent); any JSON embedded in a page is embedded with `<` escaped as `\u003c` (understand.mjs:9 precedent); client scripts are static strings that read the DOM and embed no run text.
- Generated files land only under `.skillator/holo/` (or `--out`) via `writeGenerated`; nothing is committed but source, tests, and `SKILL.md`.

## TASKS

Tasks run sequentially in number order - every task touches
`formats.mjs` and/or `holo.mjs`, so same-file tasks never fan out
(PRACTICE S4). Each task is test-first: write the failing test, run it,
then implement.

### Task 1: `--format`/`--theme` parsing, theme plumbing, additive model fields [build=opus]

SATISFIES: R1, R2, R9 (parser side)

**Files:**
- Create: `plugin/skills/holo-r2d2/scripts/formats.mjs` (registry, `parseTime`, `themeCss`, `formatPage` shell; renderers register as Tasks 2-5 land - `formatPage` on an unregistered format throws `format <name> is not implemented yet`)
- Create: `plugin/skills/holo-r2d2/scripts/formats.test.mjs`
- Modify: `plugin/skills/holo-r2d2/scripts/holo.mjs` (`parseRun` prompt/dispatched capture; `parseArgs`; `render`/`standalonePage` theme parameter; `main` dispatch branch for formats; `--selftest` baseline hash assertions)

**Interfaces:**
- Consumes: `parseRun(md, holds)`, `layout(run)`, `render(run, opts)`, `standalonePage(r)`, `writeGenerated(root, out, text)` - all existing in `holo.mjs`.
- Produces: `FORMATS`, `THEMES`, `parseTime`, `themeCss`, `formatPage`, `FORMAT_RENDERERS` from `formats.mjs` (D1 signatures); `parseArgs` gains `o.format` / `o.theme`; `stage.prompt` (string, `""` default) and `stage.dispatchedAt` (string, `""` default) on every parsed stage; `standalonePage(r, theme?)`.

- [ ] Step 1: Pin the byte-identical baseline BEFORE editing `holo.mjs`. Run on the unmodified tree and paste the three hashes into the selftest as literals (they were computed for this design on HEAD `21dcb9d` and must reproduce):
```powershell
node --input-type=module -e "import {readFileSync} from 'node:fs'; import {createHash} from 'node:crypto'; const h=await import('./plugin/skills/holo-r2d2/scripts/holo.mjs'); const md=readFileSync('./plugin/skills/holo-r2d2/scripts/fixtures/fixture-all-states.md','utf8'); const run=h.parseRun(md); const r=h.render(run,{runPath:'fixture-all-states.md'}); const sha=(s)=>createHash('sha256').update(s).digest('hex'); console.log(sha(h.artifactPage(r)), sha(h.standalonePage(r)), sha(h.renderAscii(run)))"
# expected: 72fb231a1bf834d6a2e788e0cf19d65374223fa9388b1c386f40b72cc1c4efbd 4372395b6c5980bb4e8ca5ada452600c934d2c72ca2546702bdecbdbc085ede1 c9619d2f1d0c1be9d000e2169b5ae86df8b1ad89e6d80bcbd8289563bf809aae
```
- [ ] Step 2: Write the failing tests in `formats.test.mjs`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { parseRun, render, artifactPage, standalonePage, renderAscii, parseArgs } from "./holo.mjs";
import { FORMATS, THEMES, parseTime, themeCss } from "./formats.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const fx = (n) => readFileSync(join(HERE, "fixtures", n), "utf8");

test("cli: --format/--theme parse in both spellings, refuse unknowns and bad combos", () => {
  assert.equal(parseArgs(["RUN-9", "--format=timeline"]).format, "timeline");
  assert.equal(parseArgs(["RUN-9", "--format", "executive", "--theme=print"]).theme, "print");
  assert.equal(parseArgs(["RUN-9", "--html", "--theme", "dark"]).theme, "dark");
  assert.throws(() => parseArgs(["RUN-9", "--format=bogus"]), /unknown --format bogus \(timeline, executive, runbook, mindmap, default\)/);
  assert.throws(() => parseArgs(["RUN-9", "--theme=bogus", "--html"]), /unknown --theme bogus \(dark, light, contrast, print\)/);
  assert.throws(() => parseArgs(["RUN-9", "--format=timeline", "--md"]), /--format/);
  assert.throws(() => parseArgs(["RUN-9", "--format=timeline", "--anatomy"]), /--format/);
  assert.throws(() => parseArgs(["RUN-9", "--theme=dark"]), /--theme needs --html or --format/);
  assert.throws(() => parseArgs(["RUN-9", "--theme=dark", "--ascii"]), /--theme/);
});

test("parseTime: only full ISO stamps pass", () => {
  assert.equal(parseTime("2026-09-01T11:50Z"), Date.parse("2026-09-01T11:50Z"));
  for (const v of ["-", "", "4d72860", "stage 6", "dispatched", "09:40", "2026-09-01"]) assert.equal(parseTime(v), null, v);
});

test("model: prompt and dispatchedAt captured, fields inside prompts stay inert", () => {
  const run = parseRun(fx("fixture-all-states.md"));
  assert.match(run.stages.find((s) => s.n === 2).prompt, /item F2: export\./);
  assert.equal(run.stages.find((s) => s.n === 2).dispatchedAt, "2026-09-01T11:00Z");
  assert.ok(!run.stages.find((s) => s.n === 2).files.some((f) => f.includes("prompt")), "prompt body is not a field");
  assert.equal(parseRun(fx("fixture-plain.md")).stages.find((s) => s.n === 21).dispatchedAt, "", "time-only head yields no date");
});

test("default output byte-identical; explicit theme only adds data-theme + themeCss", () => {
  const run = parseRun(fx("fixture-all-states.md"));
  const sha = (s) => createHash("sha256").update(s).digest("hex");
  // runPath is printed in the footer, so it is part of the hashed bytes: keep it identical to Task 1 Step 1.
  assert.equal(sha(artifactPage(render(run, { runPath: "fixture-all-states.md" }))), "72fb231a1bf834d6a2e788e0cf19d65374223fa9388b1c386f40b72cc1c4efbd");
  assert.equal(sha(standalonePage(render(run, { runPath: "fixture-all-states.md" }))), "4372395b6c5980bb4e8ca5ada452600c934d2c72ca2546702bdecbdbc085ede1");
  assert.equal(sha(renderAscii(run)), "c9619d2f1d0c1be9d000e2169b5ae86df8b1ad89e6d80bcbd8289563bf809aae");
  const themed = standalonePage(render(run, { runPath: "fixture-all-states.md", theme: "contrast" }), "contrast");
  assert.ok(themed.includes('<html lang="en" data-theme="contrast">'));
  assert.ok(themed.includes(themeCss("contrast")) && themeCss("contrast").includes('[data-theme="contrast"]'));
  assert.equal(themeCss("dark"), "");
  assert.equal(themeCss(undefined), "");
});
```
- [ ] Step 3: Run and confirm failure: `node --test plugin/skills/holo-r2d2/scripts/formats.test.mjs` - expected: `Cannot find module './formats.mjs'` / `parseArgs` throws `unknown flag --format`.
- [ ] Step 4: Implement. In `holo.mjs`: capture prompt bodies where `inPrompt` is set (Chain and In flight), copy `dispatchedAt` (regex `/dispatched\s+(\d{4}-\d\d-\d\dT\S+)/` on the In-flight head) and prompt fallback in `derive`; add `--format`/`--theme` to `parseArgs` with the D1 validation after the scan; `render` appends `themeCss(opts.theme)` only when `opts.theme` is set; `standalonePage(r, theme)` adds the attribute only when `theme` is passed; `main` gains the format branch (resolve run first, refuse design-only, `formatPage(run, o.format, { theme: o.theme, now: Date.now(), runPath: rel(runPath), layout: layout(run), designHtml })`, default out `<RUN-id>.<format>.html`, log line `holo: <id> <n> stages -> <out> (format <f>, theme <t|default>)`, all ASCII). In `formats.mjs`: `FORMATS`, `THEMES`, `parseTime`, the full contrast/print `themeCss` block (UI design token tables), the `FORMAT_RENDERERS` registry (empty entries throw until Tasks 2-5), and the `formatPage` shell (doctype, skip link, `<main data-run data-format>`, footer, designHtml append).
- [ ] Step 5: Run `node --test plugin/skills/holo-r2d2/scripts/formats.test.mjs` (pass), `node plugin/skills/holo-r2d2/scripts/holo.mjs --selftest` (still `selftest: ok` - add the three hash assertions to the selftest in this step), `node --test plugin/skills/holo-r2d2/scripts/anatomy.test.mjs` (pass).
- [ ] Step 6: Commit: `git add plugin/skills/holo-r2d2/scripts/holo.mjs plugin/skills/holo-r2d2/scripts/formats.mjs plugin/skills/holo-r2d2/scripts/formats.test.mjs` then `git commit -m "F164: --format/--theme parsing, theme plumbing, prompt/dispatched capture"`.

### Task 2: timeline format [build=opus]

SATISFIES: R3, R7, R9, R10 (timeline parts)

**Files:**
- Modify: `plugin/skills/holo-r2d2/scripts/formats.mjs` (`timelineModel`, `renderTimeline`, register `timeline`)
- Modify: `plugin/skills/holo-r2d2/scripts/formats.test.mjs` (timeline tests)
- Modify: `plugin/skills/holo-r2d2/scripts/holo.mjs` (`--selftest`: timeline block only)

**Interfaces:**
- Consumes: Task 1's `FORMATS`/`formatPage`/`parseTime`; `run.stages[].dispatchedAt`; `layout(run)` value passed as `ctx.layout` (`{cols, pos, edges}`, `pos.get(n) -> {col, lane}`).
- Produces: `timelineModel(run, layoutData)` and `renderTimeline(run, ctx)` per D2; page markers `data-format="timeline"`, `class="tl-svg"`, `data-stage="<n>"`, `data-lane="<k>"`, `data-critical="1"` on critical rows, and the recorded-times table `class="tl-table"`.

- [ ] Step 1: Write the failing tests:
```js
import { timelineModel } from "./formats.mjs";
import { layout } from "./holo.mjs";

test("timeline: bars only from recorded dispatched->heartbeat, critical path by stage count", () => {
  const run = parseRun(fx("fixture-all-states.md"));
  const m = timelineModel(run, layout(run));
  assert.deepEqual(m.criticalPath, [1, 2, 4], "longest after: chain 1->2->4");
  const s2 = m.rows.find((r) => r.n === 2);
  assert.deepEqual([s2.bar.from, s2.bar.to], [Date.parse("2026-09-01T11:00Z"), Date.parse("2026-09-01T11:50Z")], "observed window");
  assert.equal(m.rows.find((r) => r.n === 1).bar, null, "landed sha is not an end time");
  assert.ok(m.rows.every((r) => r.lane >= 0) && m.laneCount >= 1);
  const html = formatPage(run, "timeline", { layout: layout(run) });
  assert.ok(html.includes('data-format="timeline"') && html.includes('class="tl-svg"') && html.includes('data-critical="1"'));
  assert.ok(html.includes("critical path (longest after: chain, by stage count): 1 -&gt; 2 -&gt; 4"), "labelled chain, HTML-escaped arrow");
  assert.ok(!/duration: \d/.test(html), "no invented duration");
});

test("timeline: no stages and thin times still render", () => {
  const empty = parseRun("# RUN-7 - empty\n");
  const m = timelineModel(empty, layout(empty));
  assert.equal(m.window, null);
  assert.ok(formatPage(empty, "timeline", { layout: layout(empty) }).includes("No stage rows in this run file."));
});
```
- [ ] Step 2: Run `node --test plugin/skills/holo-r2d2/scripts/formats.test.mjs` - expected failure: `timelineModel is not a function` / format not implemented.
- [ ] Step 3: Implement per D2 (event collection via `parseTime` only; memoised cycle-guarded longest-path over `after:`; lane rows from `ctx.layout.pos`; SVG axis only when `window` has 2+ distinct times; the `tl-table` with every recorded stamp as text; lane filter script reading `data-lane`). Register in `FORMAT_RENDERERS`. Add the `--selftest` block: render the all-states fixture and the inline no-stage run, assert `data-format="timeline"`, one `data-stage` row per stage row (regex-read from the fixture, the existing selftest's own method), `1 -> 2 -> 4`, and no `NaN`.
- [ ] Step 4: Run `node --test plugin/skills/holo-r2d2/scripts/formats.test.mjs`, `node plugin/skills/holo-r2d2/scripts/holo.mjs --selftest`, `node --test plugin/skills/holo-r2d2/scripts/anatomy.test.mjs` - all pass.
- [ ] Step 5: Commit: `git add plugin/skills/holo-r2d2/scripts/formats.mjs plugin/skills/holo-r2d2/scripts/formats.test.mjs plugin/skills/holo-r2d2/scripts/holo.mjs` then `git commit -m "F164: timeline format"`.

### Task 3: executive format [cheap=sonnet]

SATISFIES: R4, R7, R9, R10 (executive parts)

**Files:**
- Modify: `plugin/skills/holo-r2d2/scripts/formats.mjs` (`executiveModel`, `renderExecutive`, register `executive`)
- Modify: `plugin/skills/holo-r2d2/scripts/formats.test.mjs`
- Modify: `plugin/skills/holo-r2d2/scripts/holo.mjs` (`--selftest`: executive block only)

**Interfaces:**
- Consumes: Task 1 plumbing; `run.stages`, `run.qs`, `ASKABLE`-equivalent state sets re-declared in `formats.mjs` (open/asked = `["open", "asked"]`, as `anatomy.mjs:34` re-declares them).
- Produces: `executiveModel(run)`, `renderExecutive(run, ctx)` per D3; markers `data-format="executive"`, `class="kpi-band"`, `class="audit-table"`, `class="risk-list"`, milestone rows `data-stage="<n>"`.

- [ ] Step 1: Write the failing tests:
```js
import { executiveModel } from "./formats.mjs";

test("executive: KPIs, audit of every decision, milestones, state-derived risks", () => {
  const run = parseRun(fx("fixture-all-states.md"));
  const m = executiveModel(run);
  assert.equal(m.kpis.total, 8);
  assert.equal(m.kpis.done, 2, "landed + replanned (anatomy readout rule)");
  assert.equal(m.kpis.pct, 25);
  assert.equal(m.kpis.openDecisions, 2);
  assert.deepEqual(m.milestones.map((x) => x.n), [1]);
  assert.equal(m.audit.length, 7, "every decision, not only open ones");
  assert.ok(m.risks.some((r) => r.signal === "failed stage" && r.stages.includes(6)));
  assert.ok(m.risks.some((r) => r.detail.includes("Q1")), "parked stage names its holding decision");
  const html = formatPage(run, "executive", {});
  assert.ok(html.includes('class="kpi-band"') && html.includes('class="audit-table"') && html.includes("Decision audit log"));
  assert.ok(!/<script/.test(html), "executive is static: no script");
  const empty = executiveModel(parseRun("# RUN-7 - empty\n"));
  assert.equal(empty.kpis.pct, null, "no NaN percent on zero stages");
});
```
- [ ] Step 2: Run `node --test plugin/skills/holo-r2d2/scripts/formats.test.mjs` - expected failure: `executiveModel is not a function`.
- [ ] Step 3: Implement per D3 (counts from the recorded states only; audit outcome string shaped like `otherQs`; risks in the D3 order with the D3 wording; static HTML, KPI band first, milestones on the Run Rail, audit `<table>`, risks list; format CSS `@media print` included in this task). Register, and add the `--selftest` block (fixture KPIs, audit row count equals Q count read by regex, empty-run pct line).
- [ ] Step 4: Run `node --test plugin/skills/holo-r2d2/scripts/formats.test.mjs`, `node plugin/skills/holo-r2d2/scripts/holo.mjs --selftest`, `node --test plugin/skills/holo-r2d2/scripts/anatomy.test.mjs` - all pass.
- [ ] Step 5: Commit: `git add plugin/skills/holo-r2d2/scripts/formats.mjs plugin/skills/holo-r2d2/scripts/formats.test.mjs plugin/skills/holo-r2d2/scripts/holo.mjs` then `git commit -m "F164: executive format"`.

### Task 4: runbook format [build=opus]

SATISFIES: R5, R7, R9, R10 (runbook parts)

**Files:**
- Modify: `plugin/skills/holo-r2d2/scripts/formats.mjs` (`runbookModel`, `renderRunbook`, register `runbook`, runbook client script)
- Modify: `plugin/skills/holo-r2d2/scripts/formats.test.mjs`
- Modify: `plugin/skills/holo-r2d2/scripts/holo.mjs` (`--selftest`: runbook block only)

**Interfaces:**
- Consumes: Task 1 plumbing; `stage.prompt`, `stage.dispatchedAt`; `ctx.layout.cols` for dependency order.
- Produces: `runbookModel(run, layoutData)`, `renderRunbook(run, ctx)` per D4; markers `data-format="runbook"`, `class="rb-step" data-step="<n>"`, one `<input type="checkbox" data-check="<n>">` per step, `id="rb-progress"` with `aria-live="polite"`, localStorage key `holo-runbook-<RUN-id>`.

- [ ] Step 1: Write the failing tests:
```js
import { runbookModel } from "./formats.mjs";

test("runbook: dependency order, recorded vs not-recorded verify, no invented commands", () => {
  const run = parseRun(fx("fixture-all-states.md"));
  const m = runbookModel(run, layout(run));
  assert.deepEqual(m.steps.map((s) => s.n), [1, 3, 5, 6, 7, 2, 4, 8], "layout columns, then stage number");
  const s1 = m.steps.find((s) => s.n === 1);
  assert.equal(s1.verify.kind, "recorded");
  assert.ok(s1.verify.text.includes("4d72860"), "landed value is the recorded evidence");
  const s4 = m.steps.find((s) => s.n === 4);
  assert.equal(s4.verify.kind, "none");
  const html = formatPage(run, "runbook", { layout: layout(run) });
  assert.ok(html.includes("Verify command: not recorded in the run file."));
  assert.ok(html.includes('type="checkbox"') && html.includes('id="rb-progress"'));
  assert.ok(html.includes("item F2: export."), "captured prompt is the step instructions");
  assert.ok(!/npm test|pytest|node --test/.test(html), "no guessed verify command anywhere");
});
```
- [ ] Step 2: Run `node --test plugin/skills/holo-r2d2/scripts/formats.test.mjs` - expected failure: `runbookModel is not a function`.
- [ ] Step 3: Implement per D4 (steps from `ctx.layout.cols`; verify rules exactly as D4; inputs header from recorded fields; prompt in `<pre class="rb-prompt">`, escaped; checkbox + progress + localStorage script as one static string reading `data-check`, try/catch around storage; `beforeprint` opens details). Register, and add the `--selftest` block (step count equals fixture stage rows, `not recorded` line present, checkbox count equals step count).
- [ ] Step 4: Run `node --test plugin/skills/holo-r2d2/scripts/formats.test.mjs`, `node plugin/skills/holo-r2d2/scripts/holo.mjs --selftest`, `node --test plugin/skills/holo-r2d2/scripts/anatomy.test.mjs` - all pass.
- [ ] Step 5: Commit: `git add plugin/skills/holo-r2d2/scripts/formats.mjs plugin/skills/holo-r2d2/scripts/formats.test.mjs plugin/skills/holo-r2d2/scripts/holo.mjs` then `git commit -m "F164: runbook format"`.

### Task 5: mindmap format [build=opus]

SATISFIES: R6, R7, R9, R10 (mindmap parts)

**Files:**
- Modify: `plugin/skills/holo-r2d2/scripts/formats.mjs` (`mindmapModel`, `renderMindmap`, register `mindmap`)
- Modify: `plugin/skills/holo-r2d2/scripts/formats.test.mjs`
- Modify: `plugin/skills/holo-r2d2/scripts/holo.mjs` (`--selftest`: mindmap block only)

**Interfaces:**
- Consumes: Task 1 plumbing; `run.stages[].tickets/files/after`, `run.qs[].blocks/files/holds`.
- Produces: `mindmapModel(run)`, `renderMindmap(run, ctx)` per D5; markers `data-format="mindmap"`, `class="mm-tree"`, ticket nodes `data-ticket="<id>" data-parent="<id|none>"`, module nodes `data-module="<name>"`, dependency lists `class="mm-deps"`.

- [ ] Step 1: Write the failing tests:
```js
import { mindmapModel } from "./formats.mjs";

test("mindmap: suffix parent only when in the run, dependencies kept out of the tree", () => {
  const run = parseRun(fx("fixture-all-states.md"));
  const m = mindmapModel(run);
  assert.ok(m.tickets.every((t) => t.parent === null), "no suffix children in this fixture: all roots");
  assert.deepEqual(m.tickets.find((t) => t.id === "F6").dependsOn, ["F2"], "stage 4 is after stage 2");
  assert.ok(m.tickets.find((t) => t.id === "F2").modules.includes("src"));
  const child = parseRun("# RUN-8 - sub\n\n## Stages\n| # | stage | state | owner | heartbeat | landed |\n|---|---|---|---|---|---|\n| 1 | F90 parent work | x | - | - | abc1234 |\n| 2 | F90a child work |   | - | - | - |\n| 3 | F91a orphan sub |   | - | - | - |\n");
  const mm = mindmapModel(child);
  assert.equal(mm.tickets.find((t) => t.id === "F90a").parent, "F90");
  assert.equal(mm.tickets.find((t) => t.id === "F91a").parent, null, "parent F91 not in run: root, never guessed");
  const html = formatPage(child, "mindmap", {});
  assert.ok(html.includes('data-ticket="F91a" data-parent="none"') && html.includes("parent F91 not in this run"));
  assert.ok(html.includes('class="mm-tree"'));
});
```
- [ ] Step 2: Run `node --test plugin/skills/holo-r2d2/scripts/formats.test.mjs` - expected failure: `mindmapModel is not a function`.
- [ ] Step 3: Implement per D5 (ticket set from stage tickets + ids in stage raw names via the same id regex `parseRun` uses; home = lowest stage number; parent = suffix base present in the set; `dependsOn` one hop per `after:` edge plus decision blocks; modules by the two-segment rule; tree built from containment only; stage branch, tickets branch, modules branch; counts line). Register, and add the `--selftest` block (fixture ticket count, F6 dependsOn F2, the inline suffix/orphan run above).
- [ ] Step 4: Run `node --test plugin/skills/holo-r2d2/scripts/formats.test.mjs`, `node plugin/skills/holo-r2d2/scripts/holo.mjs --selftest`, `node --test plugin/skills/holo-r2d2/scripts/anatomy.test.mjs` - all pass.
- [ ] Step 5: Commit: `git add plugin/skills/holo-r2d2/scripts/formats.mjs plugin/skills/holo-r2d2/scripts/formats.test.mjs plugin/skills/holo-r2d2/scripts/holo.mjs` then `git commit -m "F164: mindmap format"`.

### Task 6: SKILL.md documentation and the cross-format selftest sweep [cheap=sonnet]

SATISFIES: R7, R8, R10 (sweep)

**Files:**
- Modify: `plugin/skills/holo-r2d2/SKILL.md` (Draw it block, output picker, Script section)
- Modify: `plugin/skills/holo-r2d2/scripts/holo.mjs` (`--selftest`: cross-format x theme sweep, hostile/huge/cycle renders, offline assertions)
- Test: `plugin/skills/holo-r2d2/scripts/formats.test.mjs` (final CLI-surface tests)

**Interfaces:**
- Consumes: Tasks 1-5 complete (`FORMATS`, `THEMES`, `formatPage`, all renderers registered).
- Produces: the documented CLI surface and the `--selftest` guarantee that every format in every theme is a standalone offline page.

- [ ] Step 1: Write the failing selftest block in `holo.mjs` (inside `selftest()`, after the F116 block's style) and the final test in `formats.test.mjs`:
```js
// in formats.test.mjs
test("all formats x all themes: standalone, offline, themed, escaped", () => {
  const run = parseRun(fx("fixture-all-states.md"));
  for (const f of FORMATS) for (const t of THEMES) {
    const html = formatPage(run, f, { theme: t, layout: layout(run) });
    assert.ok(html.startsWith("<!doctype html>"), `${f}/${t} doctype`);
    assert.ok(html.includes(`data-format="${f}"`) && html.includes(`data-theme="${t}"`), `${f}/${t} markers`);
    assert.ok(!/<script[^>]+src=|<link[^>]+href=|@import|url\(\s*https?:/i.test(html), `${f}/${t} offline`);
    assert.ok(!/https?:\/\//.test(html.replaceAll('xmlns="http://www.w3.org/2000/svg"', "")), `${f}/${t} no external URL`);
  }
  const noTheme = formatPage(run, "timeline", { layout: layout(run) });
  assert.ok(!noTheme.includes("data-theme="), "no theme flag, no theme attribute");
});
```
  The `--selftest` sweep is appended at the end of `selftest()`, just before the `if (fails)` summary, where `run`, `plain`, `nasty` and `odd` are already in scope (all are `const` in that one function):
```js
  // 10. F164: every format stands alone and offline, hostile text stays text
  for (const f of FORMATS) {
    const hp = formatPage(run, f, { layout: layout(run), theme: "contrast" });
    ok(hp.startsWith("<!doctype html>") && hp.includes(`data-format="${f}"`) && hp.includes('data-theme="contrast"'), `F164 ${f}: standalone contrast page`);
    ok(!/<script[^>]+src=|https?:\/\//.test(hp.replaceAll('xmlns="http://www.w3.org/2000/svg"', "")), `F164 ${f}: offline, no external URL`);
    ok(!formatPage(nasty, f, { layout: layout(nasty) }).includes("<b>yes</b>"), `F164 ${f}: hostile text escaped`);
    ok(formatPage(odd, f, { layout: layout(odd) }).length > 0, `F164 ${f}: after: cycle renders`);
    ok(formatPage(parseRun("# RUN-7 - empty\n"), f, { layout: layout(parseRun("# RUN-7 - empty\n")) }).includes("<!doctype html>"), `F164 ${f}: no-stage run renders`);
  }
  const bigMd = "# RUN-60 - big\n\n## Stages\n| # | stage | state | owner | heartbeat | landed |\n|---|---|---|---|---|---|\n" +
    Array.from({ length: 60 }, (_, i) => `| ${i + 1} | stage ${i + 1} | ${i % 3 ? "" : "x"} | - | - | - |`).join("\n") + "\n";
  const bigPage = formatPage(parseRun(bigMd), "timeline", { layout: layout(parseRun(bigMd)) });
  ok((bigPage.match(/data-stage="/g) || []).length >= 60 && !bigPage.includes("NaN"), "F164 timeline: 60 stages, no NaN");
```
- [ ] Step 2: Run `node plugin/skills/holo-r2d2/scripts/holo.mjs --selftest` - expected failure until the sweep is wired: the new assertions fail on any format/theme cell not yet covered (on a correct Tasks 1-5 tree they fail only where the sweep itself is missing - if a cell fails on content, that is a finding for the owning task's fix round, not a reason to weaken the assertion).
- [ ] Step 3: Update `SKILL.md`: in "Draw it", add the four lines `node <SKILL>/scripts/holo.mjs RUN-12 --html --format=timeline|executive|runbook|mindmap [--theme=dark|light|contrast|print]` and the default-page `--theme` line; in "Pick the output", add picker rows (timeline/executive/runbook/mindmap with their file names `RUN-12.<format>.html`) and one paragraph stating: formats are standalone HTML only, refused with `--md`/`--svg`/`--ascii`/wizard/understand/batch/ticket, `--theme` needs a standalone page, the timeline shows recorded times only (observed windows, critical path by stage count), the runbook never invents a verify command, the mindmap reads the run file only. In "Script", extend the `--selftest` sentence to name format x theme coverage. Keep every new example line pure ASCII.
- [ ] Step 4: Run `node --test plugin/skills/holo-r2d2/scripts/formats.test.mjs`, `node plugin/skills/holo-r2d2/scripts/holo.mjs --selftest`, `node --test plugin/skills/holo-r2d2/scripts/anatomy.test.mjs` - all pass; then the full VERIFICATION block below.
- [ ] Step 5: Commit: `git add plugin/skills/holo-r2d2/SKILL.md plugin/skills/holo-r2d2/scripts/holo.mjs plugin/skills/holo-r2d2/scripts/formats.test.mjs` then `git commit -m "F164: document --format/--theme, cross-format selftest sweep"`.

## VERIFICATION

Run from the repo root on the finished tree, in Git Bash (or any POSIX
`sh`; the `node` lines also run verbatim in PowerShell). Every command is
exact; read the whole output (PRACTICE S5).

```sh
node plugin/skills/holo-r2d2/scripts/holo.mjs --selftest
# expected: selftest: ok

node --test plugin/skills/holo-r2d2/scripts/formats.test.mjs
node --test plugin/skills/holo-r2d2/scripts/anatomy.test.mjs
# expected: all tests pass, 0 failures in each

mkdir -p /tmp/f164
for f in timeline executive runbook mindmap; do
  for t in dark light contrast print; do
    node plugin/skills/holo-r2d2/scripts/holo.mjs plugin/skills/holo-r2d2/scripts/fixtures/fixture-all-states.md --format=$f --theme=$t --out /tmp/f164/$f-$t.html || exit 1
  done
done
node plugin/skills/holo-r2d2/scripts/holo.mjs plugin/skills/holo-r2d2/scripts/fixtures/fixture-all-states.md --html --theme=print --out /tmp/f164/default-print.html
node plugin/skills/holo-r2d2/scripts/holo.mjs plugin/skills/holo-r2d2/scripts/fixtures/fixture-plain.md --format=timeline --out /tmp/f164/timeline-notheme.html
```

Each of the 18 files above must contain, checked by eye or `grep`:

| File(s) | Must contain | Must not contain |
|---|---|---|
| all 16 format x theme files | `<!doctype html>`, `data-theme="<t>"`, `data-format="<f>"`, the format marker (timeline `class="tl-svg"` + `1 -> 2 -> 4`; executive `Decision audit log` + `class="audit-table"`; runbook `type="checkbox"` + `Verify command: not recorded in the run file.`; mindmap `class="mm-tree"` + `data-ticket="F6"`) | `<script src`, `<link href`, `@import`, any `http://`/`https://` except the SVG `xmlns` |
| `default-print.html` | `<html lang="en" data-theme="print">`, the default stage graph (`data-stage="1"`) | `data-format=` |
| `timeline-notheme.html` | `<!doctype html>`, `data-format="timeline"`, the recorded-times table listing the plain fixture's ISO heartbeats (`2026-09-01T09:20Z`) | `data-theme=` |

And the refusals (each exits non-zero, writes no file, message names the rule):

```sh
node plugin/skills/holo-r2d2/scripts/holo.mjs RUN-9 --format=bogus
node plugin/skills/holo-r2d2/scripts/holo.mjs plugin/skills/holo-r2d2/scripts/fixtures/fixture-all-states.md --format=timeline --md
node plugin/skills/holo-r2d2/scripts/holo.mjs plugin/skills/holo-r2d2/scripts/fixtures/fixture-all-states.md --theme=dark
```

Byte-identical default: the three SHA-256 assertions in `--selftest`
(Task 1) are the proof; they were computed on the unmodified code for
this design and must still pass on the finished tree. `git diff --stat`
on the finished branch names only `formats.mjs`, `formats.test.mjs`,
`holo.mjs`, `SKILL.md` (plus this design file).

## TRACE

| R | Short form | Satisfied by | Test |
|---|---|---|---|
| R1 | `--format` selector, default byte-identical | `holo.mjs:parseArgs`, `holo.mjs:main` dispatch | `formats.test.mjs:"default output byte-identical..."`, `holo.mjs --selftest` hash assertions |
| R2 | `--theme` on every HTML format | `formats.mjs:themeCss`, `formats.mjs:formatPage`, `holo.mjs:standalonePage` | `formats.test.mjs:"all formats x all themes..."` |
| R3 | timeline from recorded times only | `formats.mjs:timelineModel`, `formats.mjs:renderTimeline` | `formats.test.mjs:"timeline: bars only from recorded..."` |
| R4 | executive KPIs/audit/milestones/risks | `formats.mjs:executiveModel`, `formats.mjs:renderExecutive` | `formats.test.mjs:"executive: KPIs, audit..."` |
| R5 | runbook checklist, honest verify | `formats.mjs:runbookModel`, `formats.mjs:renderRunbook` | `formats.test.mjs:"runbook: dependency order..."` |
| R6 | mindmap tree/deps/modules from run only | `formats.mjs:mindmapModel`, `formats.mjs:renderMindmap` | `formats.test.mjs:"mindmap: suffix parent..."` |
| R7 | standalone, offline, escaped, ASCII logs | `formats.mjs:formatPage`, all renderers | `holo.mjs --selftest` sweep + nasty/cycle/60-stage renders |
| R8 | SKILL.md docs + selftest validation | `plugin/skills/holo-r2d2/SKILL.md`, `holo.mjs:selftest` | VERIFICATION commands above |
| R9 | never invent data | `formats.mjs:parseTime`, D2/D4/D5 rules | the `parseTime`, timeline, runbook, mindmap tests |
| R10 | edge cases render | D6 table, all models | `holo.mjs --selftest` sweep (empty, cycle, huge) |

## Decisions

- Ruling: classification bounded, ceremony full - the holo flow exists to extend (bounded), but the build runs inside a relay run with 6 tasks (full ceremony, session record) - cost if wrong: a lean chat design would lose the task blocks the implementers work from.
- Ruling: mode per-task (ruled) - this is a headless relay design seat, no user to ask the Step 0.8 question; tasks are same-file and run sequentially despite per-task seats - cost if wrong: parallel fan-out on `formats.mjs`/`holo.mjs` would corrupt the shared files.
- Ruling: Approach B, a new `scripts/formats.mjs` registry module - follows the anatomy/understand precedent of presentation modules fed by `parseRun`, keeps each format's model pure and testable - cost if wrong: one more module to keep in sync on install, which the installer already copies wholesale.
- Ruling: `--format` is flag-only (`--format=<v>` and `--format <v>`), no positional word - positional words are output modes today and a format word would collide with that grammar - cost if wrong: users must type the flag, which the ticket itself specifies.
- Ruling: the four formats are always standalone HTML (`<RUN-id>.<format>.html`), refused with `--md`/`--svg`/`--ascii`/`--wizard`/`--understand`/`--batch`/`--ticket`/`--anatomy` and on design-only runs - they are presentations of a run, and mixing output kinds multiplies the test matrix - cost if wrong: no Artifact-fragment timeline; the standalone file is the deliverable the ticket asks for.
- Ruling: `--theme` requires a standalone page (`--html` or a format); with the bare Artifact mode it is refused, not ignored - the fragment has no `<html>` to carry `data-theme` - cost if wrong: one extra `--html` in the command.
- Ruling: byte-identical default is proven by SHA-256 hashes pinned in `--selftest`, computed before any edit (Task 1 Step 1) - a diff-eyeball cannot prove byte identity across a 1398-line file's refactor - cost if wrong: any incidental default change fails the build loudly, which is the point.
- Ruling: contrast/print CSS reaches the default page only behind an explicit `--theme` (appended `themeCss`), never by editing the shared `CSS` string - editing it would change every default byte - cost if wrong: two CSS delivery paths to keep consistent, bounded by the shared token vocabulary.
- Ruling: two additive model fields, `stage.prompt` and `stage.dispatchedAt`, are captured in Task 1 and read by no existing renderer - the runbook's instructions and the timeline's dispatched point are real run-file data the parser currently discards - cost if wrong: parser surface grows slightly; the prompt-inertness test pins the risk.
- Ruling: the timeline draws bars only for recorded dispatched->heartbeat observed windows, points otherwise, and never reads `landed` as a time - `landed` is a sha in every fixture, so any other reading invents durations (R9) - cost if wrong: the timeline looks sparser than a Gantt; it is also true.
- Ruling: the critical path is the longest `after:` chain by stage count, labelled as such, durations never summed - no duration data exists to sum - cost if wrong: stakeholders must not read it as the longest-running path; the label says so on the page.
- Ruling: the runbook's verify line is the recorded landed evidence or the literal `Verify command: not recorded in the run file.` - no verify-command field exists in the run model and extracting shell from prompt prose would invent commands - cost if wrong: operators get a checklist, not runnable buttons; holo decides and executes nothing, as ever.
- Ruling: the mindmap reads the run file only; parent means the id-suffix base is present in the run, otherwise the ticket is a labelled root - `TICKETS.md` titles/parents belong to the `--ticket` page, and stage order is not parentage - cost if wrong: board-only parentage is invisible here until a stage works both tickets.
- Ruling: executive risks are recorded states restated with a disclosed ordering, no score, probability, or RAG rating - the model has no risk data beyond states and holds - cost if wrong: a reader wanting a health score must form it from the listed signals.
- Ruling: huge runs render everything, collapsed or scrolled, never truncated - a dropped stage is the hand-drawn-page failure this skill exists to prevent - cost if wrong: a 200-stage page is heavy; it is complete and searchable in-page.
- Ruling: runbook check state lives in `localStorage` only and is never an answer back to the run - holo's page-writes-nothing invariant (SKILL.md, Answers from the page) is unchanged - cost if wrong: checks do not survive a cleared browser; they were never the record.

## UI design

Read: offline HTML run reports (four new formats + the themed default page) - product - run owner, stakeholders, operators - job: read the same run four ways without re-learning it - dials 3/2/7 - direction Minimalism - scene: an operator on a laptop at a desk, printing the executive page for a stakeholder meeting while a run waits on two decisions.

Design-arwen build mode, product register. No user is present to pick a
style, so: `Chose for you: style Minimalism, from the eight - name another
(Spatial UI, Bento grid, Maximalism, Liquid glass, Glassmorphism,
Brutalism, Skeuomorphism) and the formats get re-mocked.` Critique:
`critique: self only` (design seat). Familiar system sans
(`system-ui, ...`) for all UI text by the product-register exemption;
mono only for literal machine strings (run ids, stage codes, SHAs, file
paths, stamps); numbers `tabular-nums`. VARIANCE 3 (trust-first), MOTION 2
(state-change only, 150-200ms, stilled under `prefers-reduced-motion`),
DENSITY 7 (7 default; executive runs 4, runbook 6 - stated per format).
No cream body, no untinted black with one acid accent, no broadsheet:
the light ground stays holo's existing `#f3f4f1` because identity
preservation beats novelty - the formats must look like the page they
extend.

### The signature: the Run Rail

One systematic device in every format: **a vertical rail on the left of
every stage row, carrying a state lamp (a filled dot in the state's
colour) and the mono `#n` stage chip, in stage order** - the stage graph's
node identity (holo.mjs `stageGraphParts`/`stageList`) flattened into a
list device. Timeline bars hang off the rail, executive milestones sit on
it, runbook checkboxes sit on it, mindmap branches grow from it. Cover
test: any two formats side by side are recognisably the same run because
the rail, the lamp colours, and the `#n CODE name - state` row grammar
are identical. State is never colour alone: every lamp is paired with the
state word (`LABEL` vocabulary: landed, in flight, parked, failed,
re-planned, pending, unknown).

### Tokens (shared vocabulary, CONSTRAINTS)

Light and dark are holo's existing tokens, unchanged (`holo.mjs:520-537`).
The two new themes define the same names:

| Token | contrast (on `#000`) | print (on `#fff`) |
|---|---|---|
| `--ground` / `--surface` | `#000000` / `#000000` | `#ffffff` / `#ffffff` |
| `--ink` | `#ffffff` (21:1) | `#000000` (21:1) |
| `--mid` | `#e8e8e8` (~17:1) | `#333333` (~12.6:1) |
| `--faint` | `#c9c9c9` (~13:1) | `#555555` (~7.5:1) |
| `--rule` | `#ffffff` | `#8a8a8a` |
| `--landed` / `--inflight` / `--parked` / `--failed` | `#33ff99` / `#66ccff` / `#ff99ff` / `#ff8888` (all >= 7:1 on black) | `#14532d` / `#1e3a8a` / `#581c87` / `#7f1d1d` (all >= 8:1 on white) |
| `--accent` / `--focus` | `#ffff00` (~19:1) | `#000000` |
| state `-bg` pairs | black with the state colour as border + text | white with the state colour as border + text |

In `contrast` and `print`, state is carried by border + text on the
page ground, never by a tinted fill alone - that is what makes both
themes survive a black-and-white printer and a forced-colours mode.
`--focus` is a 3px outline in every theme (`outline: 3px solid
var(--focus); outline-offset: 2px`, the wizard's ring weight).

### Per format

**timeline** - Layout: header (run id, title, recorded window), KPI strip
(stages, lanes, steps, critical-path length), then the chart box
(`overflow-x: auto`, the `.scroll` precedent) with a sticky time axis,
lane bands labelled `lane k - may run side by side`, one row per stage on
the Run Rail. Hierarchy: axis > critical-path rows (CP badge + 3px rail
segment) > bars (observed windows, hatched edge + the words `observed:
dispatched -> last heartbeat` in the row) > points (heartbeat diamonds).
Below the chart, the recorded-times table is the text alternative: every
stamp, stage, and `duration not recorded` where that is the truth.
Signature: the rail orders the rows; the CP badge is the only accent use.
Print: `@media print` hides the SVG and the lane filters and prints the
times table full-width - a Gantt that cannot be read on paper is replaced
by the table that can. A11y: each SVG row group is `tabindex="0"` with a
`<title>` (stage, state, recorded stamps); Tab order is stage order, DOM
order; lane filter buttons are real `<button>`s, 44px, `aria-pressed`;
filter results announced in an `aria-live="polite"` count; focus ring
visible on rows and buttons; heartbeat is a diamond shape + label, never
colour alone.

**executive** - Layout: one column, print-first. h1 run line, KPI band
(done %, landed, in flight, open decisions, failed - the `counts` band
grammar of the default page), milestones on the Run Rail, decision audit
table (Q, state, ticket, question, outcome, holds), risk list. Hierarchy
is the stakeholder's order: how far, what landed, what was decided, what
is at risk. Signature: milestones on the rail; everything else is quiet
tables. No script at all. Print: this format's own `@media print` forces
the print palette on paper under any screen theme, `@page` margins,
`break-inside: avoid` on KPI band and audit rows, no page element wider
than the sheet; `--theme=print` makes the screen match the sheet.
A11y: real `<table>` with `<th scope>`, KPI values are text (never a
chart image), risk signals carry their state word, heading order h1 > h2
with no skips, contrast per the token table in all four themes.

**runbook** - Layout: reproducible-inputs header (plan, started, chain,
run path), sticky progress bar (`n of m steps checked`, a real progress
value, `aria-live`), then one step card per stage on the Run Rail:
checkbox + `#n CODE name - state`, prerequisites (`after 2` /
`final stage, after everything by convention`), instructions (captured
prompt in `<pre>`), artifacts (files, landed value), and the verify line
(recorded evidence or `not recorded`). Hierarchy: the next unchecked step
is the visual top weight; landed steps quieten (`--mid` title) but stay
readable. Signature: the checkbox sits **on** the rail - checking a step
fills its lamp. Print: progress and storage note hidden, lamps print as
bordered squares, prompts expand (`beforeprint` opens details;
`max-height` released in print CSS), one step never splits across pages.
A11y: native checkboxes with the whole card label as the hit area
(>= 44px tall), focus ring on the input, progress changes announced
politely, checking is keyboard-complete with no mouse-only path, state
survives reload via localStorage and its loss is never announced as
saved. Reduced motion: the lamp fill is instant, no transition.

**mindmap** - Layout: counts line, then three branches on rail guides:
Stages (each stage a node, its tickets nested), Tickets (parents with
suffix children nested; roots under `Tickets with no parent in this
run`), Modules (module -> files -> tickets). Dependency lists
(`depends on F2 - stage 4 after stage 2`) are dashed, indented, and
labelled as dependencies, visually distinct from the solid tree guides -
the one place the design spends contrast. Hierarchy: ticket ids are the
bold mono anchors; modules are chips, not headings. Signature: the tree
guides are the Run Rail bent into branches - same lamp dot at every stage
node. Print: `beforeprint` opens all `<details>`; the tree prints as an
indented list, module chips become plain text. A11y: `<details>`/
`<summary>` give keyboard expand/collapse for free, summary targets
>= 44px, focus ring on summaries and the Expand all / Collapse all
buttons, the tree is nested lists (`<ul>` in `<li>`) so a screen reader
gets the hierarchy from structure, and `data-parent` relationships are
also written as text (`child of F90`, `no parent in this run`) - never
carried by indentation alone.

### A11y floor (all formats, non-negotiable)

- Contrast: body text >= 4.5:1 and large text >= 3:1 in **every** theme,
  from the token pairs above (light/dark inherit holo's audited pairs);
  non-text (rail, borders, focus ring, chart strokes) >= 3:1.
- Keyboard: every interactive element reachable in DOM order - lane
  filters, checkboxes, summaries, expand/collapse - with the 3px
  `:focus-visible` ring; no keyboard traps; no shortcut that fires while
  typing in an input (the formats have no text inputs, and none are
  added).
- Never colour alone: state word beside every lamp, CP badge beside the
  thickened rail, diamond + label for heartbeats, dashed + the words
  `depends on` for dependencies.
- Targets >= 44px on touch (buttons, summaries, checkbox cards);
  charts have the adjacent data table as their text alternative.
- Motion: 150-200ms state-change only; `prefers-reduced-motion: reduce`
  stills everything and no state change depends on an animation.
- Reflow: at 320px the timeline chart scrolls inside its own box (as the
  stage graph does today), every other format is one column; text
  resizes to 200% without clipping (no fixed-height text boxes).
- Print: every format prints its full content (tables and trees expand,
  interactive chrome hides), black on white regardless of screen theme.

## Self-review (PRACTICE S3, done inline)

1. Coverage: R1 -> Task 1 + Task 6 docs; R2 -> Task 1 + Task 6 sweep;
   R3/R4/R5/R6 -> Tasks 2/3/4/5; R7 -> Tasks 2-6 (each registration is
   asserted standalone/offline in the Task 6 sweep); R8 -> Task 6;
   R9 -> Tasks 1 (`parseTime`), 2, 4, 5 rulings; R10 -> D6, Tasks 2-5
   edge tests + Task 6 sweep. No requirement lacks a task.
2. Placeholders: none - every step names its file, command, and expected
   output; the hash literals in Task 1 are computed values, reproduced by
   the Step 1 command, not placeholders. The one value an implementer must
   re-derive (nothing else) is checked by that same command.
3. Type consistency: `timelineModel(run, layoutData)`,
   `executiveModel(run)`, `runbookModel(run, layoutData)`,
   `mindmapModel(run)`, `formatPage(run, format, opts)`,
   `themeCss(theme)`, `standalonePage(r, theme?)` are spelled identically
   in DESIGN, every task's Interfaces, and the test code. Stage fields
   are `prompt`/`dispatchedAt` everywhere. File names
   (`<RUN-id>.<format>.html`) match SKILL.md's naming pattern for
   understand.
4. Contradictions: `--format=default` is accepted in D1 and listed in
   the Task 1 refusal message - the message lists the four new formats
   plus `default`, matching. The timeline contract (no durations) and
   the ticket's "durations" wording are reconciled by R9/D2: observed
   windows and points are what the data supports, and the page says so.
   `--theme` on the default page requires `--html` (D1) and the
   VERIFICATION refusal list includes the bare `--theme=dark` case.
5. Scope: one new module, one existing script, docs, tests. It does not
   decompose further; the wizard, understand, ticket mode, and ASCII/MD/
   SVG paths are explicitly untouched (D7).
