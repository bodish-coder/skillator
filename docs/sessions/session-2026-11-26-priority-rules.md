grade: architectural · critical yes (a new rules file format that queue-jarvis and the ops board both depend on) · design deep=fable · build build=opus · verify deep=fable, held · ceremony full · ui tron · mode per-task (asked) · usage 5h 2%

# F203 — Priority rules: a saved, editable rule list for ticket priorities

Ticket: F203 (TICKETS.md). Design seat output, 2026-11-26. No product code written here.

## GOAL

GOAL: The owner keeps a standing list of priority rules (`P1 for bugs in app a b c`, `P1 for features in app c`, `P1 for severity critical`) in one plain-text file, adds / edits / deletes them from the ops board (Claude Code pane and standalone TUI) or in plain words through Claude, and applies them to the board with one Preview and one Save.

## APPROACHES

**A. One rules file, queue.mjs owns the grammar, both UIs speak to the CLI.**
`.skillator/priority-rules.md` holds one rule per line. `queue.mjs` gets a `rules` command family (`list|add|edit|remove|preview|apply`) that is the only parser and the only writer. The pane and the TUI call it through the existing `queue-priority` NODE call and parse fixed stdout lines. Claude edits the same file by hand or through the same commands.
- For: one parser, one writer, one lock discipline; the existing token / lock / atomic-replace machinery is reused; UIs stay thin and the mod still writes no file itself.
- Against: listing costs one `node` spawn per load; `--once` in the standalone TUI must be allowed to run that one read-only call.

**B. UIs read and write the rules file themselves (a TS parser in `hooks/lib`), queue.mjs only applies.**
- For: no spawn to list; the list could ride the board poll.
- Against: two parsers of a new grammar (mjs + ts) that will drift; the mod would write a file (today every write goes through a script, and the pane tests assert `w.writes` is empty); a second lock implementation in TS.

**C. Rules stored as JSON in a board-adjacent config, edited only through the UI.**
- For: trivial parsing.
- Against: fails the owner's "plain words in claude is fine" and the ruling that the file is hand-editable plain text.

## CHOSEN

CHOSEN: Approach A — `.skillator/priority-rules.md` with `queue.mjs rules list|add|edit|remove|preview|apply` as the single parser and writer; the pane and the standalone TUI are thin editors over that CLI, and the existing Auto-assign flow is left untouched.

## DESIGN

### 1. The rules file

Path: `<root>/.skillator/priority-rules.md`. `<root>` is the main checkout by default and the current worktree with `--current-worktree` — the same root `queue.mjs` resolves for `TICKETS.md`. Both UIs always pass `--current-worktree` (as they do today), so they edit the rules of the checkout they display.

Grammar, line by line (lines split on `\r\n` or `\n`; a UTF-8 BOM on line 1 is ignored; the file must decode as UTF-8):

| Line (after trimming) | Meaning |
|---|---|
| empty | ignored |
| starts with `#` | comment, ignored (so Markdown headings are comments) |
| `- P1: type=bug app=a,b,c` | a rule. Marker `-` or `*`; level `P1`..`P5` (any case); `:`; one or more conditions |
| anything else | **invalid line** |

Conditions:
- A condition is `field=value[,value...]`. Fields are exactly the selector fields: `id`, `app`, `src`, `owner`, `type`, `status`, `severity`, `release`, `depends-on`.
- Conditions are separated by whitespace. A new condition starts where whitespace is followed by `word=` (regex `/[ \t]+(?=[a-z-]+=)/i`), so a value may contain spaces: `release=next release app=ops board,web` is `release` = `next release`, `app` = `ops board` or `web`.
- Values are split on `,`, trimmed, lowercased, de-duplicated; empty items are dropped. Matching is exact and case-insensitive, the same as selectors (`app` and `depends-on` match any item of the ticket's comma list).
- There are no inline comments (`#` and `@` occur in values).
- A value cannot contain a comma, and cannot contain whitespace followed by `word=`.

A rule line is invalid (and reported with its 1-based line number and a reason) when: it does not match the rule shape; a field is unknown; a field is repeated in one rule; a field has no value; a `status` value is not a known status; a `type` value is not `bug`, `feature` or `agent-found`; it contains control or format characters.

Semantics:
- Conditions in one rule are AND-ed; values in one condition are OR-ed; rules are OR-ed.
- A ticket that matches rules of several levels gets the highest (P1 beats P2). When several rules of that level match, the lowest rule number is the one reported.
- A rule matches **open** tickets only (`pending`, `in-progress`, `blocked`, `decide`, `testing`, `verified`) unless that rule has a `status` condition, in which case the rule's status values decide. An `id` condition does **not** lift the open filter (unlike a plain `id=` selector).
- A ticket matching no rule is untouched. A matching ticket whose priority differs from the rule's level is changed, including a hand-set priority; a matching ticket already at that level is not listed.

Invalid lines never stop `rules list`, `add`, `edit` or `remove` (they are left byte-for-byte). They **block** `rules preview` and `rules apply` (exit 1, naming the first invalid line), so a typo can never silently drop a rule from an apply.

Rule numbers: valid rules are numbered 1..N in file order. Numbers are positions, not identities — `edit` and `remove` take `--rev` to guard against a changed file.

New file: `rules add` creates `.skillator/` and the file when missing, with this header (LF line ends):

```
# Priority rules
# One rule per line:  - P1: type=bug app=a,b,c
# Conditions in a rule are AND-ed. A comma means any of. Rules of the same level are OR-ed.
# A ticket matching several levels gets the highest. Apply with: queue.mjs rules preview
```

Writes preserve everything else: comments, blank lines, invalid lines, the file's line ending (the first separator found; `\n` for a new file) and its mode. `add` appends `- <rule>` as the last line (adding a line end first if the file lacks one). `edit` replaces only that rule's line, keeping its leading BOM/indent and writing the marker as `-`. `remove` deletes that line and its line end.

Canonical rule text (what `add`/`edit` write after `- `, and what `list` prints): `P1: type=bug app=a,b,c` — level upper-case, conditions in the order given, values lowercased and comma-joined with no spaces.

### 2. CLI contract (`node queue.mjs [--current-worktree] rules <action> ...`)

All output is plain text on stdout, one item per line, `\n`-terminated; errors go to stderr as `Queue Jarvis: <message>` with exit 1. No ANSI when stdout is not a TTY (existing behaviour). The first line is always the heading `Queue Jarvis | <state>`. UIs parse by line regex, never by position after the heading.

`rules list`
```
Queue Jarvis | Priority rules
3 rule(s).
1  P1: type=bug app=a,b,c
2  P1: type=feature app=c
3  P1: severity=critical
Invalid line 9: Unknown field colour. Choose from id, app, src, owner, type, status, severity, release, depends-on. | - P2: colour=red
Rules revision: <64 hex>
```
- Count line: `^(\d+) rule\(s\)\.$`
- Rule line: `^(\d+)  (P[1-5]): (.+)$` — group 3 splits into conditions on `/ +(?=[a-z-]+=)/`, each condition on its first `=`, values on `,`.
- Invalid line: `^Invalid line (\d+): (.+)$` (zero or more, after the rules).
- Revision line, always last, always present: `^Rules revision: ([a-f0-9]{64})$` — sha256 of the file's bytes (of zero bytes when the file is missing).
- Missing or empty file: `0 rule(s).` then the revision line, exit 0.

`rules add <P1..P5> <field=value[,value...]>...`
```
Queue Jarvis | Rule added
4  P2: app=b
Rules revision: <64 hex>
```
Refuses (exit 1): no condition; an invalid condition; a rule equal to an existing one (same level, same fields, same value sets) — `That rule already exists (rule 2).`

`rules edit <n> <P1..P5> <field=value[,value...]>... [--rev <64 hex>]`
```
Queue Jarvis | Rule updated
2  P2: type=feature app=c
Rules revision: <64 hex>
```
`rules remove <n> [--rev <64 hex>]`
```
Queue Jarvis | Rule removed
P1: type=feature app=c
Rules revision: <64 hex>
```
- `--rev` may appear anywhere after `rules`. When given and not equal to the file's current revision: `The rules changed. Reload them and try again.` Both UIs always pass it on `edit` and `remove`; `add` never needs it.
- `<n>` out of range: `No rule <n>. Run rules list.`
- Rules-file lock: `<rules file>.lock`, created `wx`, same owner-check release as the board lock. Held: `priority-rules.md is locked by another edit. Retry after it finishes.`
- Write is temp file + rename (the existing `replaceBoard`).

`rules preview`
```
Queue Jarvis | Rules preview
4 ticket(s) would change.
P1: 3 · P2: 1 · P3: 0 · P4: 0 · P5: 0
B1       Unranked -> P1   rule 1   Crash in a
F3       P3       -> P1   rule 2   Feature in c
A5       P4       -> P2   rule 4   Follow-up
B7       P2       -> P1   rule 1   Bug in b
Preview token: <64 hex>
```
- Count line: `^(\d+) ticket\(s\) would change\.$`
- Levels line: starts `P1: ` — counts of changes by target level.
- Change line: `^([A-Z]{1,3}\d+[a-z]?) +(Unranked|P[1-5]) +-> (P[1-5]) +rule (\d+) +(.*)$`, board order. Built as `id.padEnd(8) + ' ' + from.padEnd(8) + ' -> ' + to + '   rule ' + n + '   ' + label`.
- Token line `^Preview token: ([a-f0-9]{64})$` is present only when the count is above 0.
- Read-only. Takes no selectors (an extra argument is an error: `Rules preview takes no filters.`).
- Refuses: no valid rule — `No priority rules yet. Add one: rules add P1 type=bug`; an invalid line — `Fix line <L> of .skillator/priority-rules.md before applying rules: <reason>`; a matched ticket with a duplicate ID or duplicate priority tags (existing `validateMatches` messages).

`rules apply <preview-token>`
```
Queue Jarvis | Applied
4 ticket(s) updated by the priority rules.
```
- Takes the board lock (`TICKETS.md.lock`, existing message), re-reads the board and the rules, recomputes the plan and compares the token; a mismatch is the existing `The board or rule changed. Run a new preview before applying.` Only `[priority: Pn]` tags change (existing `updateLine`).
- Token = existing `previewToken(boardPath, boardBytes, rule, [])` with `rule = ['rules', <rules revision>, [id, level], ...]` — so a board edit, a rules edit, or a different plan each invalidate it.

`list`, `preview`, `apply`, `auto-preview`, `auto-apply` keep their exact behaviour and output. The usage text gains the six `rules` lines.

### 3. Claude Code pane — Priorities tab (surface: tron)

What it must do, not how it looks.

**Tab body (no form up).** The five-level legend stays. Under each level's legend line sit that level's rules, one pressable row per rule (rule number order inside a level). Below: the existing "Unprioritized tickets follow P5" line, one status area, and the action row.
- Data: `rules list`, loaded when the Priorities tab button is pressed, on `/ops priorities`, after every add / edit / delete, and by Reload. Rendering never starts a run.
- States: *not read yet* (a pane restored onto the tab: one line pointing at Reload); *loading* ("Loading rules…"); *empty* (no rules, no invalid lines: one line saying there are no rules yet and what a rule does); *loaded*; *list error* (the CLI's message; only Reload and Auto-assign are offered); *invalid lines* (each `Invalid line N: …` shown, plus one line saying to fix them in `.skillator/priority-rules.md` and that rules cannot be applied until then; Apply rules is not offered, Add / edit / delete still are).
- Actions: press a rule row → edit form for it; `Add rule` (hotkey `n`); `Apply rules` (hotkey `r`, only with at least one rule and no invalid line) → the preview form; `Reload`; `Auto-assign` (hotkey `a`, unchanged).

**Rule form (add / edit).** A form in the pane body (same mechanism as Auto-assign: Esc cancels, no second pane).
- Level: five buttons P1..P5, the chosen one primary. New rule starts at P1.
- Conditions: one button per field, in `PRIORITY_FILTERS` order, text `<Label> <values joined ", ">` or `<Label> any`. Pressing opens that field's **picker**: a paged multi-select (12 per page) of toggle buttons `[x] value` / `[ ] value`, with Previous / Next / Clear / Done. The picker is always paged buttons — never a `Select` — because it is multi-value; that also keeps it clear of B33 (a Select over 64 options draws nothing).
- Picker options: the values `priorityFilterOptions(board, true)` observes on **open** tickets (ranked or not), plus any value already in the rule that the board does not show (so a hand-written value survives an edit). Comparison is case-insensitive.
- Save: only when at least one condition is chosen; runs `rules add …` or `rules edit <n> … --rev <rev>`; success → toast, form closed, list reloaded; failure → the message in the form, form stays.
- Delete (edit only): asks once in the form (Delete rule? Yes / No); Yes runs `rules remove <n> --rev <rev>`.
- Busy: buttons other than Cancel are not drawn while a run is in flight.

**Preview form (Apply rules).** Opens and immediately runs `rules preview`.
- Shows the count line, the levels line and every change line (`from -> to   rule n`); *zero changes*: "No ticket would change…" and no Save; *error*: the message, Preview offered again.
- `Save` (primary, only with a token) runs `rules apply <token>`; success → toast with the CLI's count line, form closed, board polled; a stale token → the CLI message shown, Save removed, Preview offered.

### 4. Standalone ops TUI — Priorities tab (surface: tron)

Parity with the pane, keys instead of buttons. Every frame stays `rows` × ≤`cols` at 40, 80 and 120 columns.

**Tab body.** Legend with rules under their level, a `›` cursor on the selected rule, the dim "Unprioritized…" line, then a status area pinned below the list (loading / empty / error / invalid lines / delete question). The list windows around the cursor when it is taller than the room.
- Data: `rules list` on entering the tab (key, mouse, `--tab priorities`, and in `--once`, where this one read-only call is allowed), after add / edit / delete, and on `r`.
- Keys: `↑`/`↓` (`k`/`j`) move; `enter` or `e` edit; `n` new rule; `d` delete → the footer asks `y delete` / `n keep` (any key but `y` keeps); `p` apply rules (preview); `a` Auto-assign (unchanged); `r` reload board and rules; tab / digits / `q` as everywhere.
- Mouse: a click on a rule row selects it; a click on the selected row edits it.

**Rule form.** A box. Row 0 is Level, rows 1..9 the fields.
- Keys: `↑`/`↓`/tab move rows; `1`..`5` set the level from any row; `enter`/`space` on Level cycles it, on a field opens its picker; `s` saves; `esc` cancels.
- Picker: `↑`/`↓` move, `space`/`enter` toggle the value under the cursor (multi-select), `esc` back to the form. Options as in the pane.
- Save with no condition: message "Choose at least one condition." and no run. Failure: the CLI message in the box.

**Preview box.** `p` on the tab runs `rules preview`. Shows message, levels line and the change rows (scroll with `↑`/`↓`); `enter` saves (`rules apply <token>`), `p` previews again, `esc` cancels. Zero changes: message only, no save.

### 5. Edge cases

- Rules file missing or empty: `list` shows 0 rules; `preview` refuses with the "No priority rules yet" message; UIs show the empty state.
- Rules path is not a regular file (directory, symlink): `priority-rules.md must be a regular file.`
- CRLF files and a BOM survive every write.
- Hand edit between a UI's list and its edit/remove: `--rev` mismatch, the UI shows the message and reloads.
- Two levels match one ticket: highest wins; preview shows the winning rule's number.
- A ticket with an unreadable priority tag (`[priority: urgent]`) counts as `Unranked` and its tag is replaced.
- Child tickets (indented rows) are tickets like any other.
- A rule whose value no ticket has simply matches nothing.
- Auto-assign and rules are independent: Auto-assign fills unranked tickets from severity/type; rules override on match. Running Auto-assign after rules cannot undo a rule (ranked tickets are not eligible).
- More than 64 values in a field (ticket IDs on a big board): the pane picker pages at 12, the TUI picker windows.
- `node` missing or scripts not found: the list error state shows the host's message.

### 6. Out of scope

- A free-text "other value" entry in the UI pickers. A value no open ticket carries is added by hand, by Claude or by `rules add`; the editor keeps it once it is in the rule.
- Reordering rules, disabling a rule, rule names, negation (`app!=x`), OR across fields in one rule (write two rules).
- Applying rules automatically (on board change, on intake). Apply is always preview-then-confirm.
- Scoping `rules preview` with selectors.
- Paging the rule list in the pane (the pane scrolls).
- Version bumps, release notes, host-command mirrors (`plugin/commands/queue-jarvis.md` and `plugin/host-commands/*` are not touched).

## CONSTRAINTS

CONSTRAINTS:
- Rules file path: `<root>/.skillator/priority-rules.md`; `<root>` = main checkout, or the current worktree with `--current-worktree`. Both UIs always pass `--current-worktree` first, then `rules`, then the action.
- Rule line grammar: `- P1: field=value[,value...] [field=value...]`; marker `-` or `*`; fields exactly `id, app, src, owner, type, status, severity, release, depends-on`; conditions split on `/[ \t]+(?=[a-z-]+=)/i`; values lowercased; a repeated field in one rule is invalid; lines starting `#` and blank lines are ignored; any other line is an invalid line.
- Semantics: AND inside a rule, comma = any of, OR across rules, highest level wins (P1 highest), lowest rule number reported on a tie; open tickets only unless the rule has a `status` condition (`id` does not lift it); matching tickets are overridden; non-matching tickets untouched.
- Invalid lines never block `list|add|edit|remove`; they block `rules preview` and `rules apply`.
- stdout line formats the UIs parse (exact): `^(\d+) rule\(s\)\.$` · `^(\d+)  (P[1-5]): (.+)$` · `^Invalid line (\d+): (.+)$` · `^Rules revision: ([a-f0-9]{64})$` · `^(\d+) ticket\(s\) would change\.$` · levels line starting `P1: ` · `^([A-Z]{1,3}\d+[a-z]?) +(Unranked|P[1-5]) +-> (P[1-5]) +rule (\d+) +(.*)$` · `^Preview token: ([a-f0-9]{64})$`.
- CLI argument shapes: `rules list` · `rules add <P> <cond>...` · `rules edit <n> <P> <cond>... --rev <rev>` · `rules remove <n> --rev <rev>` · `rules preview` · `rules apply <token>`. A `<cond>` argv item is `field=v1,v2` (spaces allowed inside the item).
- Error strings UIs and tests rely on: `The rules changed. Reload them and try again.` · `The board or rule changed. Run a new preview before applying.` · `No priority rules yet. Add one: rules add P1 type=bug`.
- The existing commands `list`, `preview`, `apply`, `auto-preview`, `auto-apply` keep their output and behaviour byte-for-byte; every existing test in `queue.test.mjs`, `tests/assign.test.tsx`, `ops/tests/state.test.mts` and `ops/tests/draw.test.mts` passes unchanged.
- The ops-board mod writes no file: every rules and board change is a `queue-priority` run (`runCall($, 'queue-priority', [...])` in the pane, `run('queue-priority', [...], then)` in the TUI).
- Shared pure module: `plugin/mods/ops-board/hooks/lib/rules.ts` exports `Rule`, `RulesList`, `RulesPreview`, `parseRulesList`, `parseRulesPreview`, `ruleArgs`, `ruleSummary`, `orderedRules`, `ruleOptions`, `toggleValue`, `hasValue`. Field options come from `priorityFilterOptions(board, true)` in `hooks/lib/board.ts` (second parameter `ranked`, default `false`).
- Pane element keys: `rule:<n>`, `rule:add`, `rule:preview`, `rule:reload`, `rule:unloaded`, `rule:loading`, `rule:empty`, `rule:list-error`, `rule:invalid`, `rule:level:P1`..`rule:level:P5`, `rule:field:<field>`, `rule:option:<value>`, `rule:picker-previous`, `rule:picker-next`, `rule:picker-clear`, `rule:picker-back`, `rule:save`, `rule:delete`, `rule:delete-yes`, `rule:delete-no`, `rule:cancel`, `rule:error`, `rule:preview-summary`, `rule:preview-changes`, `rule:preview-error`, `rule:preview-again`, `rule:apply`, `rule:preview-cancel`. Existing keys (`priority:auto-open`, `priority:auto-*`, `tab:priorities`) are unchanged. Pane state atoms (plugin `ops-board`): `priorityRules`, `ruleDraft`, `rulesPreview`.
- TUI keys on the Priorities tab: `n` new, `e`/`enter` edit, `d` delete (`y` confirms), `p` apply rules, `a` Auto-assign, `r` reload, `↑↓`/`jk` move. In the rule form: `1`-`5` level, `enter`/`space` choose or toggle, `s` save, `esc` cancel/back. In the preview box: `enter` save, `p` preview again, `esc` cancel. TUI state fields: `rules`, `ruleEdit`, `rulesPreview`.
- Picker page size in the pane: 12. The rule editor never renders a `Select`.
- Several files this work touches carry another ticket's uncommitted edits (`hooks/assign.tsx`, `hooks/pane.tsx`, `hooks/register.tsx`, `types/index.d.ts`, `tests/assign.test.tsx`, `tests/pane.test.tsx`). Never revert, reformat or restage hunks that are not this task's.

## REQUIREMENTS

- R1. Rules live in `.skillator/priority-rules.md`, one rule per line in the grammar above; comments, blank lines and invalid lines are tolerated and preserved; the root honours `--current-worktree`.
- R2. `rules list` prints every valid rule numbered in file order, every invalid line with its number and reason, and the revision; a missing file is zero rules.
- R3. `rules add|edit|remove` change exactly one rule line under a lock with an atomic replace, create the file with a header when missing, refuse duplicates and bad input, and refuse a stale `--rev`.
- R4. `rules preview` computes, read-only, the change for every ticket matching a rule: AND / any-of / OR semantics, highest level wins, open tickets only unless the rule has a status condition, `from -> to` and the winning rule shown, already-correct tickets not listed, a token when anything would change.
- R5. `rules apply <token>` writes exactly the previewed plan, overriding existing priorities on matching tickets, and refuses when the board, the rules or the plan changed, when the board is locked, or when the rules have an invalid line.
- R6. Every existing queue-jarvis command behaves as before.
- R7. `SKILL.md` tells Claude how to serve plain-words rule requests (add / edit / remove a standing rule, then preview and apply with approval).
- R8. Pane: the Priorities tab lists the rules grouped under their level and shows the loading, empty, list-error and invalid-lines states.
- R9. Pane: a rule can be added, edited and deleted from a form with a level choice and one multi-value paged picker per field; a rule value the board does not show survives an edit.
- R10. Pane: Apply rules previews (`from -> to`) and saves with the token; a stale token is shown and needs a fresh preview; the board refreshes after a save.
- R11. Pane: the Auto-assign button and flow work as before; the mod writes no file.
- R12. TUI: the Priorities tab lists rules under their level with a cursor, loads them on entry (also in `--once`), and shows loading, empty, error and invalid-lines states.
- R13. TUI: `n` / `e` / `d` add, edit and delete a rule through a form with level keys and multi-select pickers.
- R14. TUI: `p` previews the rules and `enter` saves with the token; a rejection needs a fresh preview; the board refreshes after a save.
- R15. TUI: every Priorities frame (tab, form, picker, preview) is `rows` × ≤`cols` at 40, 80 and 120 columns, and Auto-assign (`a`) still works.

## TRACE

| R | Task | Test (name, file) |
|---|---|---|
| R1 | T1 | `rules file: grammar, comments, spaces in values and invalid lines` — `queue.test.mjs` |
| R2 | T1 | same test + `rules add, edit and remove change one line and keep the rest` — `queue.test.mjs` |
| R3 | T1 | `rules add, edit and remove change one line and keep the rest`; `rules edits refuse a stale revision, a duplicate and the lock` — `queue.test.mjs` |
| R4 | T1 | `rules preview ranks matching open tickets, highest level wins` — `queue.test.mjs` |
| R5 | T1 | `rules apply writes the previewed plan and refuses a stale token` — `queue.test.mjs` |
| R6 | T1 | the five existing tests in `queue.test.mjs`, unchanged |
| R7 | T1 | review of `SKILL.md` diff (no test; doc text) |
| R8 | T2 | `the Priorities tab lists rules under their level; empty, error and invalid states` — `tests/rules.test.tsx`; `parseRulesList…` — `tests/rules.test.ts` |
| R9 | T2 | `a rule is added, edited and deleted through the form` — `tests/rules.test.tsx`; `ruleArgs, ruleOptions and toggleValue…` — `tests/rules.test.ts` |
| R10 | T2 | `Apply rules previews, refuses a stale token, then saves and refreshes the board` — `tests/rules.test.tsx` |
| R11 | T2 | existing Auto-assign tests in `tests/assign.test.tsx`, unchanged; `expect(w.writes).toEqual([])` in `tests/rules.test.tsx` |
| R12 | T3 | `F203: entering Priorities loads the rules; the cursor moves over them`; `F203: --once reads the rules list and nothing else from queue-priority` — `ops/tests/rules.test.mts` |
| R13 | T3 | `F203: n adds, enter edits and d deletes a rule through the CLI` — `ops/tests/rules.test.mts` |
| R14 | T3 | `F203: p previews the rules and enter saves with the token` — `ops/tests/rules.test.mts` |
| R15 | T3 | `F203: Priorities frames fit 40, 80 and 120 columns` — `ops/tests/rules.test.mts`; existing F200 tests unchanged |

## TASKS

Tasks run one at a time, in order T1 → T2 → T3, each by one fresh build agent (build=opus). T2 produces the shared pure module T3 consumes; nothing else is shared.

---

### Task T1: rules file + `queue.mjs rules …` (build=opus)

**Files:**
- Modify: `plugin/skills/queue-jarvis/scripts/queue.mjs`
- Modify: `plugin/skills/queue-jarvis/SKILL.md` (body only; leave the frontmatter as it is)
- Test:   `plugin/skills/queue-jarvis/scripts/queue.test.mjs` (append; do not edit existing tests)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the CLI contract in DESIGN §2 / CONSTRAINTS (argument shapes, stdout line formats, error strings) used verbatim by T2 and T3.

- [ ] **Step 1: write the failing tests.** Append to `queue.test.mjs`:

```js
const rulesBoard = [
  '- [ ] B1 — Crash in a [app: a] [severity: low]',
  '- [ ] B2 — Crash in d [app: d]',
  '- [ ] F3 — Feature in c [app: c, a] [priority: P3]',
  '- [ ] F4 — Feature in a [app: a] [severity: critical] [priority: P1]',
  '- [~] A5 — Follow-up [app: b] [priority: P4]',
  '- [x] B6 — Closed bug [app: a]',
  '- [ ] B7 — Bug in b [app: b] [priority: P2]',
].join('\n') + '\n';
const rulesFile = cwd => join(cwd, '.skillator', 'priority-rules.md');
const revisionOf = stdout => stdout.match(/^Rules revision: ([a-f0-9]{64})$/m)?.[1];
function ruled(t) {
  const { cwd, board } = fixture(t);
  writeFileSync(board, rulesBoard);
  for (const rule of [['P1', 'type=bug', 'app=a,b,c'], ['P1', 'type=feature', 'app=c'], ['P1', 'severity=critical'], ['P2', 'app=b']]) {
    const added = run(cwd, 'rules', 'add', ...rule);
    assert.equal(added.status, 0, added.stderr);
  }
  return { cwd, board };
}

test('rules file: grammar, comments, spaces in values and invalid lines', t => {
  const { cwd } = fixture(t);
  const empty = run(cwd, 'rules', 'list');
  assert.equal(empty.status, 0, empty.stderr);
  assert.match(empty.stdout, /^0 rule\(s\)\.$/m);
  assert.ok(revisionOf(empty.stdout));
  assert.equal(existsSync(rulesFile(cwd)), false);
  mkdirSync(join(cwd, '.skillator'));
  const text = '\uFEFF# Priority rules\r\n\r\n- p1: Type=Bug  app=A, b ,c\r\n* P2: release=Next release app=ops board,web\r\n'
    + 'P3: type=bug\r\n- P2: colour=red\r\n- P2: app=a app=b\r\n- P9: app=a\r\n- P2: status=open\r\n';
  writeFileSync(rulesFile(cwd), text);
  const listed = run(cwd, 'rules', 'list');
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /^2 rule\(s\)\.$/m);
  assert.match(listed.stdout, /^1  P1: type=bug app=a,b,c$/m);
  assert.match(listed.stdout, /^2  P2: release=next release app=ops board,web$/m);
  for (const line of [5, 6, 7, 8, 9]) assert.match(listed.stdout, new RegExp(`^Invalid line ${line}: .+`, 'm'));
  assert.match(listed.stdout, /^Invalid line 6: Unknown field colour\./m);
  assert.match(listed.stdout, /^Invalid line 7: Field app is repeated\./m);
  assert.match(listed.stdout, /^Invalid line 9: Unknown status: open/m);
  assert.match(listed.stdout.trimEnd().split('\n').at(-1), /^Rules revision: [a-f0-9]{64}$/);
  assert.notEqual(revisionOf(listed.stdout), revisionOf(empty.stdout));
  const blocked = run(cwd, 'rules', 'preview');
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /Fix line 5 of \.skillator[\\/]priority-rules\.md before applying rules/);
  assert.equal(readFileSync(rulesFile(cwd), 'utf8'), text);
});

test('rules add, edit and remove change one line and keep the rest', t => {
  const { cwd } = fixture(t);
  const added = run(cwd, 'rules', 'add', 'p1', 'TYPE=bug', 'app=A, b,c');
  assert.equal(added.status, 0, added.stderr);
  assert.match(added.stdout, /Rule added\n1  P1: type=bug app=a,b,c\nRules revision: [a-f0-9]{64}\n$/);
  const created = readFileSync(rulesFile(cwd), 'utf8');
  assert.match(created, /^# Priority rules\n# One rule per line:/);
  assert.ok(created.endsWith('- P1: type=bug app=a,b,c\n'));
  writeFileSync(rulesFile(cwd), created.replace(/\n/g, '\r\n') + '\r\n# keep me\r\nnot a rule\r\n  - P3: release=next release');
  assert.equal(run(cwd, 'rules', 'add', 'P2', 'severity=high').status, 0);
  const before = run(cwd, 'rules', 'list').stdout;
  assert.match(before, /^1  P1: type=bug app=a,b,c$/m);
  assert.match(before, /^2  P3: release=next release$/m);
  assert.match(before, /^3  P2: severity=high$/m);
  assert.match(before, /^Invalid line \d+: .*\| not a rule$/m);
  const edited = run(cwd, 'rules', 'edit', '2', 'P4', 'release=next release', 'owner=@Sher', '--rev', revisionOf(before));
  assert.equal(edited.status, 0, edited.stderr);
  assert.match(edited.stdout, /Rule updated\n2  P4: release=next release owner=@sher\n/);
  const removed = run(cwd, 'rules', 'remove', '1', '--rev', revisionOf(edited.stdout));
  assert.equal(removed.status, 0, removed.stderr);
  assert.match(removed.stdout, /Rule removed\nP1: type=bug app=a,b,c\n/);
  const after = readFileSync(rulesFile(cwd), 'utf8');
  assert.ok(after.includes('\r\n# keep me\r\nnot a rule\r\n  - P4: release=next release owner=@sher\r\n- P2: severity=high\r\n'));
  assert.doesNotMatch(after, /type=bug/);
  assert.doesNotMatch(after, /[^\r]\n/);
  assert.equal(existsSync(`${rulesFile(cwd)}.lock`), false);
});

test('rules edits refuse a stale revision, a duplicate and the lock', t => {
  const { cwd } = ruled(t);
  const original = readFileSync(rulesFile(cwd), 'utf8');
  const duplicate = run(cwd, 'rules', 'add', 'P1', 'app=c,b,a', 'type=BUG');
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /already exists \(rule 1\)/);
  assert.match(run(cwd, 'rules', 'remove', '1', '--rev', 'a'.repeat(64)).stderr, /The rules changed\. Reload them and try again\./);
  assert.match(run(cwd, 'rules', 'remove', '9').stderr, /No rule 9\./);
  assert.notEqual(run(cwd, 'rules', 'add', 'P1').status, 0);
  assert.notEqual(run(cwd, 'rules', 'add', 'P6', 'app=a').status, 0);
  assert.notEqual(run(cwd, 'rules', 'add', 'P1', 'app=').status, 0);
  assert.notEqual(run(cwd, 'rules', 'add', 'P1', 'type=story').status, 0);
  assert.notEqual(run(cwd, 'rules', 'preview', 'app=a').status, 0);
  writeFileSync(`${rulesFile(cwd)}.lock`, '321 other\n');
  assert.match(run(cwd, 'rules', 'add', 'P5', 'app=z').stderr, /locked/i);
  assert.equal(readFileSync(`${rulesFile(cwd)}.lock`, 'utf8'), '321 other\n');
  assert.equal(readFileSync(rulesFile(cwd), 'utf8'), original);
});

test('rules preview ranks matching open tickets, highest level wins', t => {
  const { cwd, board } = ruled(t);
  const shown = run(cwd, 'rules', 'preview');
  assert.equal(shown.status, 0, shown.stderr);
  assert.match(shown.stdout, /^4 ticket\(s\) would change\.$/m);
  assert.match(shown.stdout, /^P1: 3 · P2: 1 · P3: 0 · P4: 0 · P5: 0$/m);
  assert.match(shown.stdout, /^B1 +Unranked +-> P1 +rule 1 +Crash in a$/m);
  assert.match(shown.stdout, /^F3 +P3 +-> P1 +rule 2 +Feature in c$/m);
  assert.match(shown.stdout, /^A5 +P4 +-> P2 +rule 4 +Follow-up$/m);
  assert.match(shown.stdout, /^B7 +P2 +-> P1 +rule 1 +Bug in b$/m);
  assert.doesNotMatch(shown.stdout, /^(B2|F4|B6) /m);
  assert.match(shown.stdout, /^Preview token: [a-f0-9]{64}$/m);
  assert.equal(readFileSync(board, 'utf8'), rulesBoard);
  assert.equal(run(cwd, 'rules', 'add', 'P5', 'status=done', 'id=B6').status, 0);
  assert.match(run(cwd, 'rules', 'preview').stdout, /^B6 +Unranked +-> P5 +rule 5 +Closed bug$/m);
  const none = fixture(t);
  assert.match(run(none.cwd, 'rules', 'preview').stderr, /No priority rules yet\. Add one: rules add P1 type=bug/);
});

test('rules apply writes the previewed plan and refuses a stale token', t => {
  const { cwd, board } = ruled(t);
  const token = run(cwd, 'rules', 'preview').stdout.match(/^Preview token: ([a-f0-9]{64})$/m)?.[1];
  assert.ok(token);
  assert.equal(run(cwd, 'rules', 'add', 'P3', 'app=d').status, 0);
  assert.match(run(cwd, 'rules', 'apply', token).stderr, /The board or rule changed\. Run a new preview before applying\./);
  assert.equal(readFileSync(board, 'utf8'), rulesBoard);
  const fresh = run(cwd, 'rules', 'preview').stdout;
  assert.match(fresh, /^5 ticket\(s\) would change\.$/m);
  const next = fresh.match(/^Preview token: ([a-f0-9]{64})$/m)?.[1];
  writeFileSync(`${board}.lock`, '321 ps1\n');
  assert.match(run(cwd, 'rules', 'apply', next).stderr, /locked/i);
  rmSync(`${board}.lock`);
  const applied = run(cwd, 'rules', 'apply', next);
  assert.equal(applied.status, 0, applied.stderr);
  assert.match(applied.stdout, /^5 ticket\(s\) updated by the priority rules\.$/m);
  assert.equal(readFileSync(board, 'utf8'), rulesBoard
    .replace('[app: a] [severity: low]', '[app: a] [priority: P1] [severity: low]')
    .replace('B2 — Crash in d [app: d]', 'B2 — Crash in d [app: d] [priority: P3]')
    .replace('[app: c, a] [priority: P3]', '[app: c, a] [priority: P1]')
    .replace('[app: b] [priority: P2]', '[app: b] [priority: P1]')        // B7 first: A5 becomes P2 on the next line
    .replace('[app: b] [priority: P4]', '[app: b] [priority: P2]'));
  assert.equal(existsSync(`${board}.lock`), false);
  assert.doesNotMatch(run(cwd, 'rules', 'preview').stdout, /Preview token:/);
  assert.notEqual(run(cwd, 'rules', 'apply', next).status, 0);
});
```

Add `mkdirSync` to the test file's `node:fs` import.

- [ ] **Step 2: run, confirm they fail.**

```
node --test plugin/skills/queue-jarvis/scripts/queue.test.mjs
```
Expected: the five existing tests pass; the five new tests fail (first failure: `Queue Jarvis: Unknown command: rules. See --help.` → a non-zero status / missing `0 rule(s).`).

- [ ] **Step 3: implement in `queue.mjs`.** Add `existsSync, mkdirSync` to the `node:fs` import and `dirname` to `node:path`. Then:

Usage — append inside the `usage` template before the `Selectors:` line:
```
  rules list
  rules add P1|P2|P3|P4|P5 field=value[,value...] ...
  rules edit <n> P1|P2|P3|P4|P5 field=value[,value...] ... [--rev <revision>]
  rules remove <n> [--rev <revision>]
  rules preview
  rules apply <preview-token>
```

Root resolution — split `boardPath` so the rules file shares it (behaviour of the board path unchanged):
```js
function repoRoot(currentWorktree) {
  if (currentWorktree) {
    const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
    if (result.error || result.status !== 0 || !result.stdout.trimEnd()) throw new Error('Run Queue Jarvis inside a Git checkout.');
    return result.stdout.trimEnd();
  }
  const result = spawnSync('git', ['worktree', 'list', '--porcelain', '-z'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error('Run Queue Jarvis inside a Git checkout.');
  const [main, ...info] = result.stdout.split('\0');
  if (!main.startsWith('worktree ') || info[0] === 'bare') throw new Error('The main Git checkout is unavailable.');
  return main.slice('worktree '.length);
}
const boardPath = currentWorktree => join(repoRoot(currentWorktree), 'TICKETS.md');
const rulesPath = root => join(root, '.skillator', 'priority-rules.md');
```

Lock — lift the lock out of `apply` so both files use it:
```js
function withLock(path, busy, action) {
  const lock = `${path}.lock`;
  let fd;
  try { fd = openSync(lock, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(busy);
    throw error;
  }
  const owner = `${process.pid} queue-jarvis ${randomUUID()}\n`;
  try { writeFileSync(fd, owner); }
  catch (error) { closeSync(fd); unlinkSync(lock); throw error; }
  closeSync(fd);
  try { return action(); }
  finally {
    try { if (readFileSync(lock, 'utf8') === owner) unlinkSync(lock); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

// plan(tickets) -> { changes: [{ ticket, level }], rule, selectors, done }
function apply(path, token, plan) {
  withLock(path, 'TICKETS.md is locked by another board edit. Retry after it finishes.', () => {
    const { bytes, lines, mode } = boardSnapshot(path);
    const { changes, rule, selectors, done } = plan(ticketRows(lines));
    if (previewToken(path, bytes, rule, selectors) !== token) throw new Error('The board or rule changed. Run a new preview before applying.');
    for (const { ticket, level } of changes) lines[ticket.index] = updateLine(ticket, level);
    if (changes.length) replaceBoard(path, lines.join(''), mode);
    console.log(`${heading('Applied')}\n${changes.length} ticket(s) ${done}.`);
  });
}
const manualPlan = (priority, selectors) => tickets => ({
  changes: plannedChanges(tickets, selectors, priority).map(ticket => ({ ticket, level: priority })),
  rule: priority, selectors, done: 'updated to ' + priority,
});
const automaticPlan = selectors => tickets => {
  const changes = automaticChanges(tickets, selectors);
  return { changes, rule: automaticRule(changes), selectors, done: 'assigned a priority' };
};
```
In `main`, the two existing callers become `apply(boardPath(currentWorktree), token, automaticPlan(parseSelectors(rest)))` and `apply(path, token, manualPlan(priority, selectors))`. Their output strings are unchanged (`N ticket(s) assigned a priority.` / `N ticket(s) updated to P2.`).

Matching — share the per-field test (and use it inside the existing `matching`):
```js
function fieldMatches(attributes, key, value) {
  const actual = attributes.get(key) ?? '';
  if (key === 'app' || key === 'depends-on') return actual.split(',').some(item => item.trim() === value);
  return actual === value;
}
function matching(tickets, selectors) {
  const explicitStatus = selectors.some(([key]) => key === 'status' || key === 'id');
  return tickets.filter(({ attributes }) => (explicitStatus || open.has(attributes.get('status')))
    && selectors.every(([key, value]) => fieldMatches(attributes, key, value)));
}
```

Rules — parse, print, edit:
```js
const ruleLine = /^[-*][ \t]+(P[1-5])[ \t]*:[ \t]*(\S.*)$/i;
const rulesHeader = [
  '# Priority rules',
  '# One rule per line:  - P1: type=bug app=a,b,c',
  '# Conditions in a rule are AND-ed. A comma means any of. Rules of the same level are OR-ed.',
  '# A ticket matching several levels gets the highest. Apply with: queue.mjs rules preview',
];

function parseConditions(parts) {
  const seen = new Set();
  return parts.map(part => {
    const match = /^([a-z-]+)=(.*)$/i.exec(part.trim());
    if (!match || /[\p{Cc}\p{Cf}]/u.test(part)) throw new Error(`Expected field=value: ${clean(part)}`);
    const key = match[1].toLowerCase();
    if (!fields.includes(key)) throw new Error(`Unknown field ${key}. Choose from ${fields.join(', ')}.`);
    if (seen.has(key)) throw new Error(`Field ${key} is repeated. Put its values in one comma list.`);
    seen.add(key);
    const values = [...new Set(match[2].split(',').map(value => value.trim().toLowerCase()).filter(Boolean))];
    if (!values.length) throw new Error(`Field ${key} needs a value.`);
    for (const value of values) {
      if (key === 'status' && !Object.values(statuses).includes(value)) throw new Error(`Unknown status: ${value}`);
      if (key === 'type' && !Object.values(types).includes(value)) throw new Error(`Unknown ticket type: ${value}`);
    }
    return [key, values];
  });
}

const ruleText = ({ level, conditions }) => `${level}: ${conditions.map(([key, values]) => `${key}=${values.join(',')}`).join(' ')}`;
const ruleIdentity = ({ level, conditions }) => JSON.stringify([level, conditions.map(([key, values]) => [key, [...values].sort()]).sort()]);

function rulesSnapshot(path) {
  if (!existsSync(path)) return { mode: 0o644, bytes: Buffer.alloc(0), lines: [''], missing: true };
  const stat = lstatSync(path);
  if (!stat.isFile()) throw new Error('priority-rules.md must be a regular file.');
  const bytes = readFileSync(path);
  const lines = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes).split(/(\r\n|\n)/);
  return { mode: stat.mode & 0o777, bytes, lines, missing: false };
}
const revisionOf = bytes => createHash('sha256').update(bytes).digest('hex');

// lines: the split-with-separators array; even indexes are lines.
function parseRules(lines) {
  const rules = [], invalid = [];
  lines.forEach((raw, index) => {
    if (index % 2) return;
    const text = raw.replace(/^\uFEFF/, '').trim();
    if (!text || text.startsWith('#')) return;
    try {
      const match = ruleLine.exec(text);
      if (!match) throw new Error('Expected "- P1: field=value ..."');
      const conditions = parseConditions(match[2].trim().split(/[ \t]+(?=[a-z-]+=)/i));
      rules.push({ n: rules.length + 1, index, level: match[1].toUpperCase(), conditions });
    } catch (error) { invalid.push({ line: index / 2 + 1, reason: clean(error.message), text: clean(text) }); }
  });
  return { rules, invalid };
}

function parseRuleArgs(args) {
  const level = args[0]?.toUpperCase();
  if (!levels.includes(level) || args.length < 2) throw new Error('A rule needs P1–P5 and at least one field=value condition.');
  return { level, conditions: parseConditions(args.slice(1)) };
}

function editRules(path, rev, change) {
  return withLock(path, 'priority-rules.md is locked by another edit. Retry after it finishes.', () => {
    const snapshot = rulesSnapshot(path);
    if (rev && rev !== revisionOf(snapshot.bytes)) throw new Error('The rules changed. Reload them and try again.');
    const { rules } = parseRules(snapshot.lines);
    const lines = [...snapshot.lines];
    const eol = lines[1] ?? '\n';
    const result = change({ rules, lines, eol, missing: snapshot.missing });
    mkdirSync(dirname(path), { recursive: true });
    const contents = lines.join('');
    if (snapshot.missing) writeFileSync(path, contents, { mode: snapshot.mode, flag: 'wx' });
    else replaceBoard(path, contents, snapshot.mode);
    return { ...result, revision: revisionOf(Buffer.from(contents)) };
  });
}

function rulesCommand(root, args) {
  const at = args.indexOf('--rev');
  const rev = at < 0 ? null : args.splice(at, 2)[1];
  if (at >= 0 && !tokenPattern.test(rev ?? '')) throw new Error('--rev needs the revision printed by rules list.');
  const [action, ...rest] = args;
  const path = rulesPath(root);
  const numbered = rule => `${rule.n}  ${ruleText(rule)}`;
  const pick = (rules, text) => {
    const rule = /^\d+$/.test(text ?? '') ? rules[Number(text) - 1] : undefined;
    if (!rule) throw new Error(`No rule ${clean(text ?? '')}. Run rules list.`);
    return rule;
  };
  const unique = (rules, next, except) => {
    const twin = rules.find(rule => rule !== except && ruleIdentity(rule) === ruleIdentity(next));
    if (twin) throw new Error(`That rule already exists (rule ${twin.n}).`);
  };
  if (action === 'list') {
    if (rest.length) throw new Error('Rules list takes no arguments.');
    const { bytes, lines } = rulesSnapshot(path);
    const { rules, invalid } = parseRules(lines);
    console.log(`${heading('Priority rules')}\n${rules.length} rule(s).`);
    for (const rule of rules) console.log(numbered(rule));
    for (const { line, reason, text } of invalid) console.log(`Invalid line ${line}: ${reason} | ${text}`);
    return console.log(`Rules revision: ${revisionOf(bytes)}`);
  }
  if (action === 'add') {
    const next = parseRuleArgs(rest);
    const { n, revision } = editRules(path, rev, ({ rules, lines, eol, missing }) => {
      unique(rules, next);
      if (missing || !lines.join('')) lines.splice(0, lines.length, rulesHeader.join(eol) + eol);
      else if (!/\n$/.test(lines.join(''))) lines.push(eol);
      lines.push(`- ${ruleText(next)}${eol}`);
      return { n: rules.length + 1 };
    });
    return console.log(`${heading('Rule added')}\n${n}  ${ruleText(next)}\nRules revision: ${revision}`);
  }
  if (action === 'edit') {
    const next = parseRuleArgs(rest.slice(1));
    const { n, revision } = editRules(path, rev, ({ rules, lines }) => {
      const rule = pick(rules, rest[0]);
      unique(rules, next, rule);
      lines[rule.index] = /^\uFEFF?[ \t]*/.exec(lines[rule.index])[0] + `- ${ruleText(next)}`;
      return { n: rule.n };
    });
    return console.log(`${heading('Rule updated')}\n${n}  ${ruleText(next)}\nRules revision: ${revision}`);
  }
  if (action === 'remove') {
    if (rest.length !== 1) throw new Error('Rules remove takes one rule number.');
    const { text, revision } = editRules(path, rev, ({ rules, lines }) => {
      const rule = pick(rules, rest[0]);
      if (rule.index + 1 < lines.length) lines.splice(rule.index, 2);
      else if (rule.index > 0) lines.splice(rule.index - 1, 2);
      else lines[0] = '';
      return { text: ruleText(rule) };
    });
    return console.log(`${heading('Rule removed')}\n${text}\nRules revision: ${revision}`);
  }
  if (action !== 'preview' && action !== 'apply') throw new Error(`Unknown rules command: ${clean(action ?? '')}. See --help.`);
  const board = join(root, 'TICKETS.md');
  const plan = tickets => {
    const { bytes, lines } = rulesSnapshot(path);
    const { rules, invalid } = parseRules(lines);
    if (invalid.length) throw new Error(`Fix line ${invalid[0].line} of ${join('.skillator', 'priority-rules.md')} before applying rules: ${invalid[0].reason}`);
    if (!rules.length) throw new Error('No priority rules yet. Add one: rules add P1 type=bug');
    const changes = ruleChanges(tickets, rules);
    return { changes, rule: ['rules', revisionOf(bytes), ...changes.map(({ ticket, level }) => [ticket.id, level])], selectors: [], done: 'updated by the priority rules' };
  };
  if (action === 'apply') {
    if (rest.length !== 1 || !tokenPattern.test(rest[0])) throw new Error('Rules apply requires a preview token.');
    return apply(board, rest[0], plan);
  }
  if (rest.length) throw new Error('Rules preview takes no filters.');
  const { bytes, lines } = boardSnapshot(board);
  const { changes, rule } = plan(ticketRows(lines));
  console.log(`${heading('Rules preview')}\n${changes.length} ticket(s) would change.`);
  console.log(levels.map(level => `${level}: ${changes.filter(change => change.level === level).length}`).join(' · '));
  for (const { ticket, level, rule: winner } of changes) {
    console.log(`${ticket.id.padEnd(8)} ${(ticket.priority ?? 'Unranked').padEnd(8)} -> ${level}   rule ${winner.n}   ${ticket.label}`);
  }
  if (changes.length) console.log(`Preview token: ${previewToken(board, bytes, rule, [])}`);
}

function ruleChanges(tickets, rules) {
  const hits = tickets.flatMap(ticket => {
    const { attributes } = ticket;
    const rule = rules.filter(({ conditions }) =>
      (conditions.some(([key]) => key === 'status') || open.has(attributes.get('status')))
      && conditions.every(([key, values]) => values.some(value => fieldMatches(attributes, key, value))))
      .sort((a, b) => a.level.localeCompare(b.level) || a.n - b.n)[0];
    return rule ? [{ ticket, level: rule.level, rule }] : [];
  });
  validateMatches(tickets, hits.map(hit => hit.ticket));
  return hits.filter(({ ticket, level }) => ticket.priority !== level);
}
```
In `main`, before the `auto-preview` branch: `if (mode === 'rules') return rulesCommand(repoRoot(currentWorktree), rest);`

`SKILL.md` — append this section to the body (after the selector table and example):

```markdown
## Priority rules

Standing rules live in `.skillator/priority-rules.md` in the main checkout, one per line: `- P1: type=bug app=a,b,c`. Conditions in a rule are AND-ed, a comma means any of, rules are OR-ed, and a ticket matching several levels gets the highest. Rules match open tickets unless the rule names a `status`. Lines starting with `#` are comments.

- `rules list` shows the numbered rules, any invalid line, and the revision.
- `rules add <P1–P5> <field=value[,value...]>...`, `rules edit <n> <P1–P5> <conditions...> --rev <revision>` and `rules remove <n> --rev <revision>` change one rule. For a plain-language request ("make bugs in apps a, b and c P1", "drop the severity rule"), run `rules list`, then the matching command, and report the rule as written. Editing the file by hand is equally valid; run `rules list` afterwards to check for invalid lines.
- `rules preview` shows every ticket the rules would change as `from -> to` with the rule number; it overrides an existing priority on a matching ticket. After the user explicitly approves that preview, run `rules apply <preview-token>`. If the board or the rules changed, show a fresh preview and ask again.

The ops board Priorities tab edits the same file.
```

- [ ] **Step 4: run, confirm it passes.**

```
node --test plugin/skills/queue-jarvis/scripts/queue.test.mjs
```
Expected: `# pass 10`, `# fail 0`.

- [ ] **Step 5: commit.**

```
git add plugin/skills/queue-jarvis/scripts/queue.mjs plugin/skills/queue-jarvis/scripts/queue.test.mjs plugin/skills/queue-jarvis/SKILL.md
git commit -m "F203: queue-jarvis priority rules file and rules list/add/edit/remove/preview/apply"
```

---

### Task T2: Claude Code pane — Rules editor on the Priorities tab (build=opus)

**Files:**
- Create: `plugin/mods/ops-board/hooks/lib/rules.ts` (pure; shared with T3)
- Create: `plugin/mods/ops-board/hooks/rules.tsx`
- Modify: `plugin/mods/ops-board/hooks/lib/board.ts` (`priorityFilterOptions` gains `ranked`)
- Modify: `plugin/mods/ops-board/types/index.d.ts` (three types, three `PluginState` atoms)
- Modify: `plugin/mods/ops-board/hooks/assign.tsx` (export `showForm`; `isFormUp` / `clearForm` know the two new form atoms)
- Modify: `plugin/mods/ops-board/hooks/pane.tsx` (the `tab === 'priorities'` branch; the tab button's `onPress`)
- Modify: `plugin/mods/ops-board/hooks/register.tsx` (one `ui.press` handler, `rule:apply`; one line in the `/ops <word>` handler)
- Test:   `plugin/mods/ops-board/tests/rules.test.ts` (new), `plugin/mods/ops-board/tests/rules.test.tsx` (new)

Precondition (controller): the uncommitted edits already in `assign.tsx`, `pane.tsx`, `register.tsx`, `types/index.d.ts` belong to another ticket; they are landed or left in place — this task adds hunks and commits only its own.

**Interfaces:**
- Consumes (T1): `queue-priority` runs with `['--current-worktree', 'rules', ...]` and the stdout formats in CONSTRAINTS.
- Produces (for T3), `hooks/lib/rules.ts`:

```ts
import type { Priority } from '../../types'
export type Rule = { n: number; level: Priority; conditions: [string, string[]][] }
export type RulesList = { rules: Rule[]; invalid: string[]; revision: string }
export type RulesPreview = { token: string | null; count: string; levels: string; changes: string[] }
export function parseRulesList(out: string): RulesList | null
export function parseRulesPreview(out: string): RulesPreview | null
export function ruleArgs(level: Priority, values: Record<string, string[]>): string[]   // ['P1', 'app=a,b', 'type=bug'] in PRIORITY_FILTERS order
export function ruleSummary(rule: Rule): string                                         // 'type=bug app=a,b,c'
export function orderedRules(rules: Rule[]): Rule[]                                     // by level, then n
export function hasValue(values: string[], value: string): boolean                      // case-insensitive
export function toggleValue(values: string[], value: string): string[]                  // case-insensitive add/remove
export function ruleOptions(observed: string[], chosen: string[]): string[]             // observed, then chosen values not observed
```
- Produces (for T3), `hooks/lib/board.ts`: `priorityFilterOptions(board: Board | null, ranked = false)` — with `ranked` true the eligible tickets are every open ticket, not only the unprioritized ones.

- [ ] **Step 1: write the failing tests.**

`tests/rules.test.ts`:
```ts
import { test, expect } from 'claude-code/testing'
import { parseBoard, priorityFilterOptions } from '../hooks/lib/board'
import { hasValue, orderedRules, parseRulesList, parseRulesPreview, ruleArgs, ruleOptions, ruleSummary, toggleValue } from '../hooks/lib/rules'

const REV = '5'.repeat(64)
const LIST = ['Queue Jarvis | Priority rules', '3 rule(s).', '1  P2: severity=high', '2  P1: type=bug app=a,b,c',
  '3  P1: release=next release app=ops board,web', 'Invalid line 9: Unknown field colour. | - P2: colour=red', 'Rules revision: ' + REV, ''].join('\n')

test('parseRulesList reads rules, invalid lines and the revision; an incomplete list is null', () => {
  const list = parseRulesList(LIST)!
  expect(list.revision).toBe(REV)
  expect(list.rules).toEqual([
    { n: 1, level: 'P2', conditions: [['severity', ['high']]] },
    { n: 2, level: 'P1', conditions: [['type', ['bug']], ['app', ['a', 'b', 'c']]] },
    { n: 3, level: 'P1', conditions: [['release', ['next release']], ['app', ['ops board', 'web']]] },
  ])
  expect(list.invalid).toEqual(['Invalid line 9: Unknown field colour. | - P2: colour=red'])
  expect(orderedRules(list.rules).map(rule => rule.n)).toEqual([2, 3, 1])
  expect(ruleSummary(list.rules[2]!)).toBe('release=next release app=ops board,web')
  expect(parseRulesList('0 rule(s).\nRules revision: ' + REV + '\n')).toEqual({ rules: [], invalid: [], revision: REV })
  expect(parseRulesList(LIST.replace('Rules revision: ' + REV, ''))).toBeNull()
  expect(parseRulesList(LIST.replace('3 rule(s).', '4 rule(s).'))).toBeNull()
})

test('parseRulesPreview needs the count, every change row and a token when anything changes', () => {
  const token = '7'.repeat(64)
  const out = ['Queue Jarvis | Rules preview', '2 ticket(s) would change.', 'P1: 2 · P2: 0 · P3: 0 · P4: 0 · P5: 0',
    'B1       Unranked -> P1   rule 1   Crash in a', 'F3       P3       -> P1   rule 2   Feature in c', 'Preview token: ' + token, ''].join('\n')
  expect(parseRulesPreview(out)).toEqual({ token, count: '2 ticket(s) would change.', levels: 'P1: 2 · P2: 0 · P3: 0 · P4: 0 · P5: 0',
    changes: ['B1 Unranked -> P1 rule 1 Crash in a', 'F3 P3 -> P1 rule 2 Feature in c'] })
  expect(parseRulesPreview('0 ticket(s) would change.\nP1: 0 · P2: 0 · P3: 0 · P4: 0 · P5: 0\n')?.token).toBeNull()
  expect(parseRulesPreview(out.replace('Preview token: ' + token, ''))).toBeNull()
  expect(parseRulesPreview(out.replace('2 ticket(s)', '3 ticket(s)'))).toBeNull()
})

test('ruleArgs, ruleOptions and toggleValue build a rule from picked values', () => {
  expect(ruleArgs('P1', { type: ['bug'], app: ['a', 'b'], owner: [] })).toEqual(['P1', 'app=a,b', 'type=bug'])
  expect(ruleArgs('P3', {})).toEqual(['P3'])
  expect(ruleOptions(['web', 'F3'], ['f3', 'legacy'])).toEqual(['web', 'F3', 'legacy'])
  expect(hasValue(['f3'], 'F3')).toBe(true)
  expect(toggleValue(['f3', 'web'], 'F3')).toEqual(['web'])
  expect(toggleValue(['web'], 'api')).toEqual(['web', 'api'])
})

test('priorityFilterOptions(board, true) offers values of ranked open tickets too', () => {
  const board = parseBoard('- [ ] B1 — one [app: web] [priority: P2]\n- [ ] B2 — two [app: api]\n- [x] B3 — three [app: old]\n', 'T', 1, 1)
  const apps = (ranked: boolean) => priorityFilterOptions(board, ranked).find(field => field.key === 'app')!.values
  expect(apps(false)).toEqual(['api'])
  expect(apps(true)).toEqual(['api', 'web'])
})
```

`tests/rules.test.tsx`:
```tsx
import { test, expect, mock } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'
import type { MockClock } from 'claude-code/testing'

// F203: the Priorities tab's rules editor. Every change is a queue-priority run; the mod writes no file.
const BOARD = `# Tickets

- [~] F3 — cart drawer keeps items on reload [app: web] [owner: @vidul] [priority: P3]
- [ ] B1 — button focus ring missing [app: ui]
- [ ] B2 — orders endpoint 500 [app: api] [severity: critical]
- [x] F1 — product grid [app: old]
`
const REV = '5'.repeat(64), REV2 = '6'.repeat(64), TOKEN = 'b'.repeat(64)
const list = (rules: string[], rev = REV, invalid: string[] = []) =>
  ['Queue Jarvis | Priority rules', `${rules.length} rule(s).`, ...rules.map((rule, i) => `${i + 1}  ${rule}`), ...invalid, 'Rules revision: ' + rev].join('\n')
const ran = (stdout: string, exitCode = 0, stderr = ''): ProcessRunResult =>
  ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false })
type World = { files: Record<string, string>; runs: string[][]; toasts: string[]; writes: string[]; boardReads: number; answer: (args: string[]) => ProcessRunResult | null }

function world(on: On): [World, MockClock] {
  const w: World = { files: { '/r/TICKETS.md': BOARD, '/s/skills/tickets-zordon/scripts/ticket-meta.sh': '#!/bin/sh\n', '/bin/node': 'node' },
    runs: [], toasts: [], writes: [], boardReads: 0, answer: () => null }
  const at = (p: string) => w.files[p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')]
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.env(on, { SKILLATOR_ROOT: '/s', PATH: '/bin' })
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.repo', () => ({ value: { root: '/r', remote: null, internal: false, name: 'r' } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('fs.stat', ($, e) => {
    const f = at(e.path)
    return f !== undefined ? { value: { kind: 'file' as const, size: f.length, mtimeMs: 1000, isLink: false } } : { deny: 'ENOENT ' + e.path }
  })
  on('fs.exists', ($, e) => ({ value: at(e.path) !== undefined }))
  on('fs.read', ($, e) => {
    const f = at(e.path)
    if (/TICKETS\.md$/.test(e.path)) w.boardReads++
    return f !== undefined ? { value: f } : { deny: 'ENOENT ' + e.path }
  })
  on('fs.write', ($, e) => { w.writes.push(e.path); return { deny: 'the mod must not write files' } })
  on('process.run', ($, e) => {
    if (e.argv.join(' ') === 'git config user.email') return { value: ran('vidul@ikran.in\n') }
    const i = e.argv.indexOf('rules')
    if (i < 1 || !e.argv.some(a => /queue\.mjs$/.test(a))) return { value: ran('', 1, 'not in this test') }
    const args = e.argv.slice(i - 1)           // ['--current-worktree', 'rules', ...]
    w.runs.push([...args])
    return { value: w.answer([...args]) ?? ran('', 1, 'unexpected call') }
  })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', ($, e) => { w.toasts.push(e.text); return { value: undefined } })
  on('ui.scroll', () => ({}))
  on('ui.focus', { plugin: '*' }, () => ({ value: undefined }))
  return [w, clock]
}
const props = { title: 'ops board', isFocused: true, bodyColumns: 54, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }
const last = (w: World) => w.runs.at(-1)

test('the Priorities tab lists rules under their level; empty, error and invalid states', async ($, on) => {
  const [w, clock] = world(on)
  let out = ran(list([]))
  w.answer = args => args[2] === 'list' ? out : null
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const pane = await $.ui.mount({ plugin: 'ops-board', surface: 'terminal', component: 'Pane', requestId: 'ops-board', props })
  await pane.press({ key: 'tab:priorities' })
  await clock.settle()
  expect(last(w)).toEqual(['--current-worktree', 'rules', 'list'])
  expect((await pane.find({ key: 'rule:empty' }))?.text).toContain('No priority rules yet')
  expect(await pane.find({ key: 'rule:add' })).toBeDefined()
  expect(await pane.find({ key: 'rule:preview' })).toBeUndefined()
  expect(await pane.find({ key: 'priority:auto-open' })).toBeDefined()

  out = ran(list(['P2: severity=high', 'P1: type=bug app=ui,web', 'P1: severity=critical']))
  await pane.press({ key: 'rule:reload' })
  await clock.settle()
  expect((await pane.find({ key: 'rule:2' }))?.text).toContain('type=bug app=ui,web')
  expect((await pane.find({ key: 'rule:1' }))?.text).toContain('severity=high')
  const order = (await pane.findAll({ type: 'Button' })).map(b => b.key).filter(k => /^rule:\d+$/.test(k ?? ''))
  expect(order).toEqual(['rule:2', 'rule:3', 'rule:1'])          // P1 rules first, then P2
  expect(await pane.find({ key: 'rule:empty' })).toBeUndefined()
  expect(await pane.find({ key: 'rule:preview' })).toBeDefined()

  out = ran(list(['P1: severity=critical'], REV, ['Invalid line 4: Unknown field colour. | - P2: colour=red']))
  await pane.press({ key: 'rule:reload' })
  await clock.settle()
  expect((await pane.find({ key: 'rule:invalid' }))?.text).toContain('Invalid line 4')
  expect((await pane.find({ key: 'rule:invalid' }))?.text).toContain('.skillator/priority-rules.md')
  expect(await pane.find({ key: 'rule:preview' })).toBeUndefined()
  expect(await pane.find({ key: 'rule:1' })).toBeDefined()

  out = ran('', 1, 'Queue Jarvis: priority-rules.md must be a regular file.')
  await pane.press({ key: 'rule:reload' })
  await clock.settle()
  expect((await pane.find({ key: 'rule:list-error' }))?.text).toContain('must be a regular file')
  expect(await pane.find({ key: 'rule:add' })).toBeUndefined()
  expect(await pane.find({ key: 'rule:reload' })).toBeDefined()
  expect(w.writes).toEqual([])
  await pane.unmount()
})

test('a rule is added, edited and deleted through the form', async ($, on) => {
  const [w, clock] = world(on)
  let rules = ['P1: severity=critical', 'P2: app=legacy,web']
  let rev = REV
  let refuse = true
  w.answer = args => {
    if (args[2] === 'list') return ran(list(rules, rev))
    if (args[2] === 'edit' && refuse) { refuse = false; return ran('', 1, 'Queue Jarvis: The rules changed. Reload them and try again.') }
    if (args[2] === 'add') rules = [...rules, 'P3: app=api,ui type=bug']
    if (args[2] === 'edit') rules = ['P1: severity=critical', 'P4: app=legacy']
    if (args[2] === 'remove') rules = rules.slice(1)
    rev = REV2
    return ran('Queue Jarvis | Rule saved\nRules revision: ' + rev)
  }
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const pane = await $.ui.mount({ plugin: 'ops-board', surface: 'terminal', component: 'Pane', requestId: 'ops-board', props })
  await pane.press({ key: 'tab:priorities' })
  await clock.settle()

  // add: level, two fields, multi-select, never a Select
  await pane.press({ key: 'rule:add' })
  expect((await pane.find({ key: 'form:title' }))?.text).toContain('New priority rule')
  expect(await pane.findAll({ type: 'Select' })).toEqual([])
  expect(await pane.find({ key: 'rule:save' })).toBeUndefined()            // no condition yet
  expect(await pane.find({ key: 'rule:delete' })).toBeUndefined()
  expect((await pane.find({ key: 'rule:level:P1' }))?.props.variant).toBe('primary')
  await pane.press({ key: 'rule:level:P3' })
  expect((await pane.find({ key: 'rule:field:app' }))?.text).toBe('App any')
  await pane.press({ key: 'rule:field:app' })
  expect((await pane.find({ key: 'rule:option:web' }))?.text).toBe('[ ] web')   // a ranked open ticket's app is offered
  expect(await pane.find({ key: 'rule:option:old' })).toBeUndefined()           // a closed ticket's app is not
  await pane.press({ key: 'rule:option:api' })
  await pane.press({ key: 'rule:option:ui' })
  await pane.press({ key: 'rule:option:web' })
  await pane.press({ key: 'rule:option:web' })                                  // toggled off again
  expect((await pane.find({ key: 'rule:option:api' }))?.text).toBe('[x] api')
  await pane.press({ key: 'rule:picker-back' })
  expect((await pane.find({ key: 'rule:field:app' }))?.text).toBe('App api, ui')
  await pane.press({ key: 'rule:field:type' })
  await pane.press({ key: 'rule:option:bug' })
  await pane.press({ key: 'rule:picker-back' })
  await pane.press({ key: 'rule:save' })
  await clock.settle()
  expect(w.runs.find(args => args[2] === 'add')).toEqual(['--current-worktree', 'rules', 'add', 'P3', 'app=api,ui', 'type=bug'])
  expect(w.toasts.at(-1)).toContain('Priority rule saved')
  expect(await pane.find({ key: 'form:title' })).toBeUndefined()
  expect((await pane.find({ key: 'rule:3' }))?.text).toContain('app=api,ui type=bug')

  // edit: values load, a value the board does not show survives, a stale revision is shown
  await pane.press({ key: 'rule:2' })
  expect((await pane.find({ key: 'form:title' }))?.text).toContain('Edit rule 2')
  expect((await pane.find({ key: 'rule:level:P2' }))?.props.variant).toBe('primary')
  expect((await pane.find({ key: 'rule:field:app' }))?.text).toBe('App legacy, web')
  await pane.press({ key: 'rule:field:app' })
  expect((await pane.find({ key: 'rule:option:legacy' }))?.text).toBe('[x] legacy')
  await pane.press({ key: 'rule:option:web' })
  await pane.press({ key: 'rule:picker-back' })
  await pane.press({ key: 'rule:level:P4' })
  await pane.press({ key: 'rule:save' })
  await clock.settle()
  expect(last(w)?.slice(0, 2)).toEqual(['--current-worktree', 'rules'])
  expect(w.runs.find(args => args[2] === 'edit')).toEqual(['--current-worktree', 'rules', 'edit', '2', 'P4', 'app=legacy', '--rev', REV2])
  expect((await pane.find({ key: 'rule:error' }))?.text).toContain('The rules changed')
  await pane.press({ key: 'rule:save' })
  await clock.settle()
  expect(await pane.find({ key: 'form:title' })).toBeUndefined()
  expect((await pane.find({ key: 'rule:2' }))?.text).toContain('app=legacy')

  // delete asks once
  await pane.press({ key: 'rule:1' })
  await pane.press({ key: 'rule:delete' })
  expect(w.runs.some(args => args[2] === 'remove')).toBe(false)
  await pane.press({ key: 'rule:delete-no' })
  await pane.press({ key: 'rule:delete' })
  await pane.press({ key: 'rule:delete-yes' })
  await clock.settle()
  expect(w.runs.find(args => args[2] === 'remove')).toEqual(['--current-worktree', 'rules', 'remove', '1', '--rev', REV2])
  expect(w.toasts.at(-1)).toContain('Priority rule deleted')
  expect(await pane.find({ key: 'rule:2' })).toBeUndefined()
  expect(w.writes).toEqual([])
  await pane.unmount()
})

test('the picker pages a long value list', async ($, on) => {
  const [w, clock] = world(on)
  w.files['/r/TICKETS.md'] = BOARD + Array.from({ length: 70 }, (_, i) => `- [ ] B${100 + i} — bug ${i} [app: ui]`).join('\n') + '\n'
  w.answer = args => args[2] === 'list' ? ran(list([])) : null
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const pane = await $.ui.mount({ plugin: 'ops-board', surface: 'terminal', component: 'Pane', requestId: 'ops-board', props })
  await pane.press({ key: 'tab:priorities' })
  await clock.settle()
  await pane.press({ key: 'rule:add' })
  await pane.press({ key: 'rule:field:id' })
  expect((await pane.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('rule:option:')).length).toBe(12)
  expect(await pane.find({ key: 'rule:picker-previous' })).toBeUndefined()
  await pane.press({ key: 'rule:picker-next' })
  await pane.press({ key: 'rule:option:B110' })
  await pane.press({ key: 'rule:picker-clear' })
  await pane.press({ key: 'rule:option:B111' })
  await pane.press({ key: 'rule:picker-back' })
  expect((await pane.find({ key: 'rule:field:id' }))?.text).toBe('Ticket ID B111')
  await pane.press({ key: 'rule:cancel' })
  expect(await pane.find({ key: 'rule:add' })).toBeDefined()
  await pane.unmount()
})

test('Apply rules previews, refuses a stale token, then saves and refreshes the board', async ($, on) => {
  const [w, clock] = world(on)
  let stale = true
  const preview = ['Queue Jarvis | Rules preview', '2 ticket(s) would change.', 'P1: 2 · P2: 0 · P3: 0 · P4: 0 · P5: 0',
    'F3       P3       -> P1   rule 1   cart drawer keeps items on reload', 'B2       Unranked -> P1   rule 2   orders endpoint 500', 'Preview token: ' + TOKEN].join('\n')
  w.answer = args => {
    if (args[2] === 'list') return ran(list(['P1: app=web', 'P1: severity=critical']))
    if (args[2] === 'preview') return ran(preview)
    if (args[2] !== 'apply') return null
    if (stale) { stale = false; return ran('', 1, 'Queue Jarvis: The board or rule changed. Run a new preview before applying.') }
    w.files['/r/TICKETS.md'] = BOARD.replace('[priority: P3]', '[priority: P1]').replace('[severity: critical]', '[priority: P1] [severity: critical]')
    return ran('Queue Jarvis | Applied\n2 ticket(s) updated by the priority rules.')
  }
  await $.session.start({ cwd: '/r', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const pane = await $.ui.mount({ plugin: 'ops-board', surface: 'terminal', component: 'Pane', requestId: 'ops-board', props })
  await pane.press({ key: 'tab:priorities' })
  await clock.settle()
  await pane.press({ key: 'rule:preview' })
  await clock.settle()
  expect(last(w)).toEqual(['--current-worktree', 'rules', 'preview'])
  expect((await pane.find({ key: 'form:title' }))?.text).toContain('Apply priority rules')
  expect((await pane.find({ key: 'rule:preview-summary' }))?.text).toContain('2 ticket(s) would change.')
  expect((await pane.find({ key: 'rule:preview-changes' }))?.text).toContain('F3 P3 -> P1 rule 1')
  expect((await pane.find({ key: 'rule:preview-changes' }))?.text).toContain('B2 Unranked -> P1 rule 2')
  expect(w.runs.some(args => args[2] === 'apply')).toBe(false)
  await pane.press({ key: 'rule:apply' })
  await clock.settle()
  expect(last(w)).toEqual(['--current-worktree', 'rules', 'apply', TOKEN])
  expect((await pane.find({ key: 'rule:preview-error' }))?.text).toContain('Run a new preview')
  expect(await pane.find({ key: 'rule:apply' })).toBeUndefined()
  await pane.press({ key: 'rule:preview-again' })
  await clock.settle()
  const readsBefore = w.boardReads
  await pane.press({ key: 'rule:apply' })
  await clock.settle()
  expect(w.toasts.at(-1)).toContain('2 ticket(s) updated by the priority rules.')
  expect(await pane.find({ key: 'form:title' })).toBeUndefined()
  expect(w.boardReads).toBeGreaterThan(readsBefore)            // the board was read again after the save
  expect(w.writes).toEqual([])
  await pane.unmount()
})
```

- [ ] **Step 2: run, confirm they fail.** Targeted run (the full suite times out on this machine). From the repo root, in Git Bash:

```
S="$(mktemp -d)"; M=plugin/mods/ops-board
cp -r "$M/hooks" "$M/types" "$M/.claude-plugin" "$M/tsconfig.json" "$S/"
mkdir "$S/ops" "$S/tests"
(cd "$M/ops" && tar cf - --exclude=node_modules --exclude=tests .) | tar xf - -C "$S/ops"
cp "$M/tests/rules.test.ts" "$M/tests/rules.test.tsx" "$S/tests/"
C:/Users/Ikran/.local/bin/claude.exe plugin test "$S"
```
Expected: both files fail — `rules.test.ts` cannot resolve `../hooks/lib/rules`; `rules.test.tsx` finds no `rule:empty` / `rule:add`.

- [ ] **Step 3: implement.**

`hooks/lib/board.ts` — `priorityFilterOptions` signature and its first line only:
```ts
export function priorityFilterOptions(board: Board | null, ranked = false): { key: string; label: string; values: string[] }[] {
  const eligible = (board?.tickets ?? []).filter(ticket => isOpen(ticket) && (ranked || !/\[priority:/i.test(ticket.line)))
```

`hooks/lib/rules.ts` (whole file):
```ts
import type { Priority } from '../../types'
import { PRIORITY_FILTERS } from './board'

// F203: the queue-jarvis `rules` output, read by the pane and the standalone TUI. Pure.
export type Rule = { n: number; level: Priority; conditions: [string, string[]][] }
export type RulesList = { rules: Rule[]; invalid: string[]; revision: string }
export type RulesPreview = { token: string | null; count: string; levels: string; changes: string[] }

export function parseRulesList(out: string): RulesList | null {
  const lines = out.split(/\r?\n/)
  const count = lines.map(line => /^(\d+) rule\(s\)\.$/.exec(line)?.[1]).find(Boolean)
  const revision = lines.map(line => /^Rules revision: ([a-f0-9]{64})$/.exec(line)?.[1]).find(Boolean)
  const rules = lines.flatMap((line): Rule[] => {
    const match = /^(\d+)  (P[1-5]): (.+)$/.exec(line)
    if (!match) return []
    const conditions = match[3]!.split(/ +(?=[a-z-]+=)/).map((part): [string, string[]] => {
      const at = part.indexOf('=')
      return [part.slice(0, at), part.slice(at + 1).split(',')]
    })
    return [{ n: Number(match[1]), level: match[2] as Priority, conditions }]
  })
  if (count === undefined || !revision || Number(count) !== rules.length) return null
  return { rules, invalid: lines.filter(line => /^Invalid line \d+: /.test(line)), revision }
}

const CHANGE = /^[A-Z]{1,3}\d+[a-z]? +(?:Unranked|P[1-5]) +-> P[1-5] +rule \d+ +/
export function parseRulesPreview(out: string): RulesPreview | null {
  const lines = out.split(/\r?\n/)
  const count = lines.find(line => /^\d+ ticket\(s\) would change\.$/.test(line))
  const levels = lines.find(line => line.startsWith('P1: '))
  const token = lines.map(line => /^Preview token: ([a-f0-9]{64})$/.exec(line)?.[1]).find(Boolean) ?? null
  const changes = lines.filter(line => CHANGE.test(line)).map(line => line.replace(/ {2,}/g, ' '))
  if (!count || !levels || Number.parseInt(count, 10) !== changes.length || (changes.length > 0 && !token)) return null
  return { token, count, levels, changes }
}

export const ruleArgs = (level: Priority, values: Record<string, string[]>): string[] =>
  [level, ...PRIORITY_FILTERS.flatMap(({ key }) => (values[key]?.length ? [key + '=' + values[key]!.join(',')] : []))]
export const ruleSummary = (rule: Rule) => rule.conditions.map(([key, values]) => key + '=' + values.join(',')).join(' ')
export const orderedRules = (rules: Rule[]) => [...rules].sort((a, b) => a.level.localeCompare(b.level) || a.n - b.n)
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
export const hasValue = (values: string[], value: string) => values.some(item => same(item, value))
export const toggleValue = (values: string[], value: string) =>
  hasValue(values, value) ? values.filter(item => !same(item, value)) : [...values, value]
export const ruleOptions = (observed: string[], chosen: string[]) =>
  [...observed, ...chosen.filter(value => !hasValue(observed, value))]
```

`types/index.d.ts` — beside `AutoPriorityDraft`:
```ts
// F203: the Priorities tab's rules (queue-jarvis `rules list`), the add/edit form and the apply preview.
export type RulesView = { loading: boolean; error: string | null; revision: string; rules: import('../hooks/lib/rules').Rule[]; invalid: string[] }
export type RuleDraft = {
  request: number; n: number | null; level: Priority; values: Record<string, string[]>
  picker: { key: string; page: number } | null; busy: boolean; error: string | null; confirmDelete: boolean; revision: string
}
export type RulesPreviewDraft = { request: number; busy: boolean; error: string | null; preview: import('../hooks/lib/rules').RulesPreview | null }
```
and in the `PluginState` atom block, after `autoPriority: AutoPriorityDraft | null`:
```ts
      priorityRules: RulesView | null; ruleDraft: RuleDraft | null; rulesPreview: RulesPreviewDraft | null   // F203
```

`hooks/assign.tsx` — three small edits:
```ts
// beside autoPriorityA
const ruleDraftA = atom({ plugin: 'ops-board', key: 'ruleDraft' } as const, null)         // F203: rules.tsx's forms
const rulesPreviewA = atom({ plugin: 'ops-board', key: 'rulesPreview' } as const, null)
```
- `showForm` becomes `export async function showForm(...)` (body unchanged).
- `isFormUp`: append `|| (await read($, ruleDraftA)) !== null || (await read($, rulesPreviewA)) !== null`.
- `clearForm`: append `await update($, ruleDraftA, () => null)` and `await update($, rulesPreviewA, () => null)`.

`hooks/rules.tsx` (whole file):
```tsx
import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'
import type { Priority, RuleDraft, RulesPreviewDraft, RulesView } from '../types'
import { PRIORITIES, PRIORITY_FILTERS, priorityFilterOptions } from './lib/board'
import { runCall } from './lib/host'
import { hasValue, orderedRules, parseRulesList, parseRulesPreview, ruleArgs, ruleOptions, ruleSummary, toggleValue } from './lib/rules'
import { clearForm, closeForm, showForm } from './assign'
import { say } from './logtab'

// F203: the Priorities tab's rules editor. queue-jarvis owns .skillator/priority-rules.md;
// every read and write here is a `queue-priority` run - the mod writes no file.
const boardA = atom({ plugin: 'ops-board', key: 'board' } as const, null)
const rulesA = atom({ plugin: 'ops-board', key: 'priorityRules' } as const, null)
const draftA = atom({ plugin: 'ops-board', key: 'ruleDraft' } as const, null)
const previewA = atom({ plugin: 'ops-board', key: 'rulesPreview' } as const, null)
const NONE: RulesView = { loading: false, error: null, revision: '', rules: [], invalid: [] }
const PAGE = 12
const LEVELS = Object.keys(PRIORITIES) as Priority[]
let listRequest = 0
let formRequest = 0

type Ran = { code: number; out: string; err: string }
const rules = ($: EngineInterface, args: string[]): Promise<Ran> =>
  runCall($, 'queue-priority', ['--current-worktree', 'rules', ...args]).catch(err => ({ code: -1, out: '', err: String(err) }))
const failed = (r: Ran) => r.err.trim() || r.out.trim() || `Queue Jarvis exited ${r.code}`

export async function loadRules($: EngineInterface) {
  const request = ++listRequest
  await update($, rulesA, current => ({ ...(current ?? NONE), loading: true }))
  const r = await rules($, ['list'])
  const list = r.code === 0 ? parseRulesList(r.out) : null
  if (request !== listRequest) return
  await update($, rulesA, () => list
    ? { ...NONE, ...list }
    : { ...NONE, error: r.code === 0 ? 'Queue Jarvis returned an incomplete rules list. Reload.' : failed(r) })
}

export async function openRule($: EngineInterface, n: number | null) {
  const view = await read($, rulesA)
  const rule = n === null ? null : view?.rules.find(x => x.n === n)
  if (!view || view.error || (n !== null && !rule)) return
  await clearForm($)
  const request = ++formRequest
  const level = rule?.level ?? 'P1'
  await update($, draftA, () => ({ request, n, level, values: Object.fromEntries(rule?.conditions ?? []), picker: null,
    busy: false, error: null, confirmDelete: false, revision: view.revision }))
  await showForm($, 'rule:level:' + level)
}

// Save (add / edit) or, with remove true, delete. Done: a toast, the form closed, the list read again.
async function writeRule($: EngineInterface, remove: boolean) {
  const draft = await read($, draftA)
  if (!draft || draft.busy) return
  const args = remove ? ['remove', String(draft.n), '--rev', draft.revision]
    : draft.n === null ? ['add', ...ruleArgs(draft.level, draft.values)]
    : ['edit', String(draft.n), ...ruleArgs(draft.level, draft.values), '--rev', draft.revision]
  if (!remove && args.filter(a => a.includes('=')).length === 0) return
  const request = ++formRequest
  let started = false
  await update($, draftA, current => {
    started = current?.request === draft.request && !current.busy
    return started ? { ...draft, request, busy: true, error: null, picker: null } : current
  })
  if (!started) return
  const r = await rules($, args)
  if (r.code !== 0) {
    await update($, draftA, current => current?.request === request ? { ...current, busy: false, confirmDelete: false, error: failed(r) } : current)
    // a stale revision: the list is read again and the form takes the new revision, so a second Save can pass
    await loadRules($)
    const fresh = (await read($, rulesA))?.revision
    if (fresh) await update($, draftA, current => current?.request === request ? { ...current, revision: fresh } : current)
    return
  }
  say($, remove ? '✓ Priority rule deleted' : '✓ Priority rule saved', { timeoutMs: 8000 })
  if ((await read($, draftA))?.request === request) await closeForm($)
  await loadRules($)
}

export async function openRulesPreview($: EngineInterface) {
  await clearForm($)
  const request = ++formRequest
  await update($, previewA, () => ({ request, busy: false, error: null, preview: null }))
  await showForm($, 'rule:preview-cancel')
  await runRulesPreview($)
}

// Preview, or with save true apply the previewed token. True once the board was changed.
export async function runRulesPreview($: EngineInterface, save = false): Promise<boolean> {
  const draft = await read($, previewA)
  if (!draft || draft.busy || (save && !draft.preview?.token)) return false
  const request = ++formRequest
  let started = false
  await update($, previewA, current => {
    started = current?.request === draft.request && !current.busy
    return started ? { request, busy: true, error: null, preview: null } : current
  })
  if (!started) return false
  const finish = (preview: RulesPreviewDraft['preview'], error: string | null) =>
    update($, previewA, current => current?.request === request ? { ...current, busy: false, preview, error } : current)
  const r = await rules($, save ? ['apply', draft.preview!.token!] : ['preview'])
  if (r.code !== 0) { await finish(null, failed(r)); return false }
  if (save) {
    say($, r.out.trim().split(/\r?\n/).at(-1) || 'Priority rules applied.', { timeoutMs: 8000 })
    if ((await read($, previewA))?.request === request) await closeForm($)
    return true
  }
  const preview = parseRulesPreview(r.out)
  await finish(preview, preview ? null : 'Queue Jarvis returned an incomplete preview. Run Preview again.')
  return false
}

// The rules under their level, the status line and the action row: the Priorities tab body below the tab bar.
export async function renderRules($: EngineInterface, e: RenderInput<'Pane'>, ascii: boolean, dot: string): Promise<RenderElement> {
  const { Box, Text, Button } = $.ui.resolve(e)
  const view = await read($, rulesA)
  const shown = orderedRules(view?.rules ?? [])
  const usable = !!view && !view.loading && !view.error
  return (
    <Box flexDirection="column">
      {LEVELS.map(id => (
        <Box key={'level:' + id} flexDirection="column">
          <Text key={id}><Text color={ascii ? undefined : PRIORITIES[id].color}>{ascii ? '' : dot + ' '}{id}</Text>{'  ' + PRIORITIES[id].label}</Text>
          {shown.filter(rule => rule.level === id).map(rule =>
            <Button key={'rule:' + rule.n} plain onPress={() => { void openRule($, rule.n) }}>{'    ' + ruleSummary(rule)}</Button>)}
        </Box>
      ))}
      <Text dimColor>Unprioritized tickets follow P5 in Queue Jarvis.</Text>
      {!view && <Text key="rule:unloaded" dimColor>Rules not read yet. Press Reload.</Text>}
      {view?.loading && <Text key="rule:loading" dimColor>Loading rules…</Text>}
      {view?.error && <Box key="rule:list-error"><Text color="error" wrap="wrap">{view.error}</Text></Box>}
      {usable && !shown.length && !view.invalid.length && <Box key="rule:empty"><Text dimColor wrap="wrap">
        No priority rules yet. A rule ranks every matching open ticket, e.g. P1 for bugs in an app.</Text></Box>}
      {usable && view.invalid.length > 0 && <Box key="rule:invalid"><Text color="warning" wrap="wrap">
        {[...view.invalid, 'Fix these lines in .skillator/priority-rules.md. Rules cannot be applied until then.'].join('\n')}</Text></Box>}
      <Box flexDirection="row" flexWrap="wrap" gap={2}>
        {usable && <Button key="rule:add" plain hotkey="n" onPress={() => { void openRule($, null) }}>Add rule</Button>}
        {usable && shown.length > 0 && !view.invalid.length &&
          <Button key="rule:preview" plain hotkey="r" onPress={() => { void openRulesPreview($) }}>Apply rules</Button>}
        <Button key="rule:reload" plain onPress={() => { void loadRules($) }}>Reload</Button>
      </Box>
    </Box>
  )
}

// The add / edit form, its picker, or the apply preview: whichever is up, else null.
export async function renderRuleForm($: EngineInterface, e: RenderInput<'Pane'>): Promise<RenderElement | null> {
  const { Box, Text, Button } = $.ui.resolve(e)
  const preview = await read($, previewA)
  if (preview) {
    const p = preview.preview
    return (
      <Box flexDirection="column">
        <Box key="form:title"><Text bold>Apply priority rules</Text><Text dimColor>{'  Esc cancels'}</Text></Box>
        <Text dimColor wrap="wrap">A matching ticket takes its rule's priority, replacing the one it has.</Text>
        {preview.busy && <Text dimColor>Working…</Text>}
        {preview.error && <Box key="rule:preview-error"><Text color="error" wrap="wrap">{preview.error}</Text></Box>}
        {p && <Box key="rule:preview-summary" flexDirection="column">
          <Text>{p.count}</Text><Text wrap="wrap">{p.levels}</Text>
          {!p.token && <Text dimColor wrap="wrap">No ticket would change: every matching ticket already has its rule's priority, or no open ticket matches a rule.</Text>}
        </Box>}
        <Box flexDirection="row" flexWrap="wrap" gap={2}>
          {!preview.busy && <Button key="rule:preview-again" plain onPress={() => { void runRulesPreview($) }}>Preview</Button>}
          {p?.token && !preview.busy && <Button key="rule:apply" variant="primary" onPress={() => {}}>Save</Button>}
          <Button key="rule:preview-cancel" plain onPress={() => { void closeForm($) }}>Cancel</Button>
        </Box>
        {p?.changes.length ? <Box key="rule:preview-changes"><Text wrap="wrap">{p.changes.join('\n')}</Text></Box> : null}
      </Box>
    )
  }
  const draft = await read($, draftA)
  if (!draft) return null
  const set = (change: (d: RuleDraft) => RuleDraft) => {
    void update($, draftA, current => current && !current.busy && current.request === draft.request ? change(current) : current)
  }
  const fields = priorityFilterOptions(await read($, boardA), true)
  const picking = draft.picker && fields.find(field => field.key === draft.picker!.key)
  if (draft.picker && picking) {
    const chosen = draft.values[picking.key] ?? []
    const options = ruleOptions(picking.values, chosen)
    const start = draft.picker.page * PAGE
    const page = (by: number) => set(d => d.picker ? { ...d, picker: { ...d.picker, page: d.picker.page + by } } : d)
    return (
      <Box flexDirection="column">
        <Box key="form:title"><Text bold>{picking.label}</Text><Text dimColor>{'  any of the checked values'}</Text></Box>
        {!options.length && <Text dimColor wrap="wrap">No open ticket has a value for this field.</Text>}
        {options.slice(start, start + PAGE).map(value =>
          <Button key={'rule:option:' + value} plain onPress={() => set(d => ({ ...d, error: null,
            values: { ...d.values, [picking.key]: toggleValue(d.values[picking.key] ?? [], value) } }))}>
            {(hasValue(chosen, value) ? '[x] ' : '[ ] ') + value}</Button>)}
        <Box flexDirection="row" flexWrap="wrap" gap={2}>
          {start > 0 && <Button key="rule:picker-previous" plain onPress={() => page(-1)}>Previous</Button>}
          {start + PAGE < options.length && <Button key="rule:picker-next" plain onPress={() => page(1)}>Next</Button>}
          <Button key="rule:picker-clear" plain onPress={() => set(d => ({ ...d, values: { ...d.values, [picking.key]: [] } }))}>Clear</Button>
          <Button key="rule:picker-back" plain onPress={() => set(d => ({ ...d, picker: null }))}>Done</Button>
        </Box>
      </Box>
    )
  }
  const hasCondition = PRIORITY_FILTERS.some(({ key }) => draft.values[key]?.length)
  return (
    <Box flexDirection="column">
      <Box key="form:title"><Text bold>{draft.n === null ? 'New priority rule' : 'Edit rule ' + draft.n}</Text><Text dimColor>{'  Esc cancels'}</Text></Box>
      <Text dimColor wrap="wrap">A ticket matches when every chosen field matches; several values in a field mean any of them.</Text>
      <Box flexDirection="row" flexWrap="wrap" gap={1}>
        {LEVELS.map(level => draft.busy
          ? <Text key={'rule:level:' + level} bold={level === draft.level}>{level}</Text>
          : <Button key={'rule:level:' + level} plain variant={level === draft.level ? 'primary' : undefined}
              onPress={() => set(d => ({ ...d, level, error: null }))}>{level}</Button>)}
      </Box>
      {fields.map(({ key, label }) => {
        const text = label + ' ' + (draft.values[key]?.length ? draft.values[key]!.join(', ') : 'any')
        return draft.busy ? <Text key={'rule:field:' + key} wrap="wrap">{text}</Text>
          : <Button key={'rule:field:' + key} plain onPress={() => set(d => ({ ...d, picker: { key, page: 0 }, confirmDelete: false }))}>{text}</Button>
      })}
      {draft.busy && <Text dimColor>Working…</Text>}
      {draft.error && <Box key="rule:error"><Text color="error" wrap="wrap">{draft.error}</Text></Box>}
      {draft.confirmDelete && !draft.busy
        ? <Box flexDirection="row" flexWrap="wrap" gap={2}>
            <Text>Delete this rule?</Text>
            <Button key="rule:delete-yes" plain onPress={() => { void writeRule($, true) }}>Yes, delete</Button>
            <Button key="rule:delete-no" plain onPress={() => set(d => ({ ...d, confirmDelete: false }))}>No</Button>
          </Box>
        : <Box flexDirection="row" flexWrap="wrap" gap={2}>
            {!draft.busy && hasCondition && <Button key="rule:save" variant="primary" onPress={() => { void writeRule($, false) }}>Save</Button>}
            {!draft.busy && draft.n !== null && <Button key="rule:delete" plain onPress={() => set(d => ({ ...d, confirmDelete: true }))}>Delete</Button>}
            <Button key="rule:cancel" plain onPress={() => { void closeForm($) }}>Cancel</Button>
          </Box>}
    </Box>
  )
}
```
`hooks/pane.tsx`:
- import: `import { loadRules, renderRuleForm, renderRules } from './rules'`
- tab button `onPress`, after the `messages` line: `if (x.id === 'priorities') void loadRules($).catch(() => {})`
- the `tab === 'priorities'` branch becomes:
```tsx
  if (tab === 'priorities') {
    const form = (await renderAutoPriority($, e)) ?? (await renderRuleForm($, e))
    if (form) return form
    return (
      <Box flexDirection="column">
        {bar}
        <Text> </Text>
        {await renderRules($, e, ascii, glyphs.dot)}
        <Button key="priority:auto-open" plain hotkey="a" onPress={() => { void openAutoPriority($) }}>Auto-assign</Button>
      </Box>
    )
  }
```
(the legend lines and the "Unprioritized…" line now come from `renderRules`; `PRIORITIES` may still be imported for other uses in the file — remove the import only if nothing else uses it).

`hooks/register.tsx` — import `loadRules, runRulesPreview` from `./rules`. In the `/ops <word>` handler, directly after `if (tab) await update($, tabA, () => tab)`, add `if (tab === 'priorities') void loadRules($).catch(() => {})` (rendering never starts a run; the list loads on the tab button, on `/ops priorities`, after a rule write, and on Reload — a pane restored straight onto Priorities shows `rule:unloaded` until Reload). Beside the `priority:auto-save` handler:
```tsx
  // F203: Save in the rules preview applies the previewed token, then the board is read again
  on('ui.press', { plugin: 'ops-board', element: 'rule:apply' }, async ($, e) => {
    if (await runRulesPreview($, true)) await poll($, true)
    return { element: e.element }
  })
```

- [ ] **Step 4: run, confirm it passes.** Re-run the Step 2 block (fresh `$S`). Expected: every test in `rules.test.ts` (4) and `rules.test.tsx` (4) passes. Then the regression run for the Auto-assign flow, same block with `cp "$M/tests/assign.test.tsx" "$S/tests/"` as the only test file: expected all pass, in particular `the Auto-assign popup reviews a filtered preview before saving`, `mobile Auto-assign can pick and unset a filter`, `B33 Auto-assign on a board of 70 open tickets draws; Ticket ID pages`.

- [ ] **Step 5: commit** (only this task's hunks — the listed files also hold another ticket's edits; use `git add -p` on the four modified hook/type files):

```
git add plugin/mods/ops-board/hooks/lib/rules.ts plugin/mods/ops-board/hooks/rules.tsx plugin/mods/ops-board/tests/rules.test.ts plugin/mods/ops-board/tests/rules.test.tsx plugin/mods/ops-board/hooks/lib/board.ts
git add -p plugin/mods/ops-board/hooks/assign.tsx plugin/mods/ops-board/hooks/pane.tsx plugin/mods/ops-board/hooks/register.tsx plugin/mods/ops-board/types/index.d.ts
git commit -m "F203: ops board pane - priority rules editor on the Priorities tab"
```

---

### Task T3: standalone ops TUI parity (build=opus)

**Files:**
- Modify: `plugin/mods/ops-board/ops/state.ts`
- Modify: `plugin/mods/ops-board/ops/draw.ts`
- Modify: `plugin/mods/ops-board/ops/engine.ts` (the `--once` read-only gate; rules load at start / readAll)
- Test:   `plugin/mods/ops-board/ops/tests/rules.test.mts` (new)

**Interfaces:**
- Consumes (T1): the `rules` CLI contract. Consumes (T2): `hooks/lib/rules.ts` (`Rule`, `parseRulesList`, `parseRulesPreview`, `ruleArgs`, `ruleSummary`, `orderedRules`, `ruleOptions`, `toggleValue`, `hasValue`) and `priorityFilterOptions(board, true)`.
- Produces: `State.rules`, `State.ruleEdit`, `State.rulesPreview`; `export const loadRulesEffect: () => Effect` (state.ts, used by engine.ts); `PointerAction` kinds `rule-row`, `rule-field`, `rule-option`.

- [ ] **Step 1: write the failing tests.** `ops/tests/rules.test.mts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cells, frame, screen } from '../draw'
import { initial, onBoard, point, reduce, settle } from '../state'
import type { State } from '../state'
import { makeEngine } from '../engine'
import { parseBoard } from '../../hooks/lib/board'

const REV = '5'.repeat(64), TOKEN = '7'.repeat(64)
const BOARD = '- [ ] B1 — First [app: ops-board] [owner: @sher]\n- [ ] F2 — Second [app: web] [priority: P3]\n- [x] B3 — Closed [app: old]\n'
const LIST = `Queue Jarvis | Priority rules\n3 rule(s).\n1  P2: severity=high\n2  P1: type=bug app=ops-board,web\n3  P1: severity=critical\nRules revision: ${REV}\n`
const s0: State = onBoard(initial(80, 24, 0), parseBoard(BOARD, 'T', 1, 1), [], null)
const key = (name: string, extra = {}) => ({ name, ...extra })
const press = (s: State, ...names: string[]) => names.reduce((x, n) => reduce(x, key(n)).state, s)
const ok = (out: string) => ({ code: 0, out, err: '', argv: ['node', 'queue.mjs'] })
const no = (err: string) => ({ code: 1, out: '', err, argv: ['node', 'queue.mjs'] })
const runOf = (step: { effects: any[] }) => step.effects.find(e => e.kind === 'run' && e.call === 'queue-priority')
const loaded = (() => { const entered = reduce(s0, key('9')); return settle(runOf(entered).then(ok(LIST))(entered.state)).state })()
const P = { color: false, ascii: false, plain: true }
const text = (x: State) => frame(x, P).join('\n')

test('F203: entering Priorities loads the rules; the cursor moves over them', () => {
  const entered = reduce(s0, key('9'))
  assert.deepEqual(runOf(entered).args, ['--current-worktree', 'rules', 'list'])
  assert.match(text(entered.state), /Loading priority rules…/)
  assert.deepEqual(loaded.rules?.list.map(rule => rule.n), [1, 2, 3])
  assert.equal(loaded.rules?.revision, REV)
  // grouped by level: P1 rules (2, 3) first, then P2 (1); the cursor starts on the first shown
  const body = text(loaded)
  assert.ok(body.indexOf('type=bug app=ops-board,web') < body.indexOf('severity=critical'))
  assert.ok(body.indexOf('severity=critical') < body.indexOf('● P2'))
  assert.ok(body.indexOf('● P2') < body.indexOf('severity=high'))
  assert.match(body, /›  2  type=bug app=ops-board,web/)
  assert.match(text(press(loaded, 'down', 'down', 'down')), /›  1  severity=high/)
  assert.match(text(press(loaded, 'j', 'k', 'up')), /›  2  type=bug/)
  assert.match(body, /\[n new rule\]/); assert.match(body, /\[p apply rules\]/); assert.match(body, /\[a Auto-assign\]/)
  const empty = settle(runOf(entered).then(ok(`0 rule(s).\nRules revision: ${REV}\n`))(entered.state)).state
  assert.match(text(empty), /No priority rules yet\. Press n to add one/)
  assert.doesNotMatch(text(empty), /\[p apply rules\]/)
  const broken = settle(runOf(entered).then(no('Queue Jarvis: priority-rules.md must be a regular file.'))(entered.state)).state
  assert.match(text(broken), /must be a regular file/)
  const invalid = settle(runOf(entered).then(ok(LIST.replace('Rules revision', 'Invalid line 9: Unknown field colour. | - P2: colour=red\nRules revision')))(entered.state)).state
  assert.match(text(invalid), /Invalid line 9: Unknown field colour/)
  assert.equal(runOf(reduce(invalid, key('p'))), undefined)
  assert.deepEqual(runOf(reduce(loaded, key('r'))).args, ['--current-worktree', 'rules', 'list'])
  assert.ok(press(loaded, 'a').autoPriority?.editing)      // Auto-assign still opens
  assert.equal(reduce(loaded, key('2')).state.tab, 'tickets')
})

test('F203: n adds, enter edits and d deletes a rule through the CLI', () => {
  const form = press(loaded, 'n')
  assert.deepEqual(form.ruleEdit, { n: null, level: 'P1', values: {}, row: 0 })
  assert.match(text(form), /New priority rule/)
  const unsaved = reduce(form, key('s'))
  assert.equal(runOf(unsaved), undefined)
  assert.equal(unsaved.state.ruleEdit?.message, 'Choose at least one condition.')
  // level 3, App row -> picker -> two values toggled, one toggled off again
  let cur = press(form, '3', 'down', 'return')
  assert.equal(cur.ruleEdit?.option, 0)
  assert.match(text(cur), /Choose App/); assert.match(text(cur), /› \[ \] ops-board/); assert.match(text(cur), /\[ \] web/)
  assert.doesNotMatch(text(cur), /\bold\b/)
  cur = press(cur, 'space', 'down', 'return', 'up', 'space', 'space')
  assert.deepEqual(cur.ruleEdit?.values.app, ['web', 'ops-board'])
  cur = press(cur, 'escape')
  assert.equal(cur.ruleEdit?.option, undefined)
  assert.match(text(cur), /App +web, ops-board/)
  const saving = reduce(cur, key('s'))
  assert.deepEqual(runOf(saving).args, ['--current-worktree', 'rules', 'add', 'P3', 'app=web,ops-board'])
  assert.equal(runOf(reduce(saving.state, key('s'))), undefined)               // busy: no second run
  const saved = settle(runOf(saving).then(ok('Queue Jarvis | Rule added\n4  P3: app=web,ops-board\nRules revision: ' + REV))(saving.state))
  assert.equal(saved.state.ruleEdit, undefined)
  assert.equal(saved.state.toast, 'Priority rule saved.')
  assert.deepEqual(runOf(saved).args, ['--current-worktree', 'rules', 'list'])
  const refused = settle(runOf(saving).then(no('Queue Jarvis: That rule already exists (rule 2).'))(saving.state)).state
  assert.match(refused.ruleEdit?.message ?? '', /already exists/)
  assert.equal(press(refused, 'escape').ruleEdit, undefined)

  // edit the selected rule (rule 2): values load; a value the board does not show stays an option
  const editing = press(loaded, 'return')
  assert.deepEqual(editing.ruleEdit, { n: 2, level: 'P1', values: { type: ['bug'], app: ['ops-board', 'web'] }, row: 0 })
  assert.match(text(editing), /Edit rule 2/)
  const edited = reduce(press(editing, '2'), key('s'))
  assert.deepEqual(runOf(edited).args, ['--current-worktree', 'rules', 'edit', '2', 'P2', 'app=ops-board,web', 'type=bug', '--rev', REV])
  assert.equal(press(editing, 'return').ruleEdit?.level, 'P2')                  // enter on the Level row cycles

  // delete asks; any key but y keeps
  const asking = press(loaded, 'd')
  assert.equal(asking.rules?.confirm, true)
  assert.match(text(asking), /Delete rule 2\?/); assert.match(text(asking), /\[y delete\]/)
  assert.equal(press(asking, 'n').rules?.confirm, undefined)
  const removing = reduce(asking, key('y'))
  assert.deepEqual(runOf(removing).args, ['--current-worktree', 'rules', 'remove', '2', '--rev', REV])
  const removed = settle(runOf(removing).then(ok('Queue Jarvis | Rule removed\nP1: type=bug app=ops-board,web\nRules revision: ' + REV))(removing.state))
  assert.equal(removed.state.toast, 'Priority rule deleted.')
  assert.deepEqual(runOf(removed).args, ['--current-worktree', 'rules', 'list'])
  const stale = settle(runOf(removing).then(no('Queue Jarvis: The rules changed. Reload them and try again.'))(removing.state))
  assert.match(stale.state.toast ?? '', /The rules changed/)
  assert.deepEqual(runOf(stale).args, ['--current-worktree', 'rules', 'list'])

  // mouse: a click selects, a click on the selected row edits
  const clicked = point(loaded, { kind: 'rule-row', index: 2 }).state
  assert.equal(clicked.rules?.sel, 2)
  assert.equal(point(clicked, { kind: 'rule-row', index: 2 }).state.ruleEdit?.n, 1)
  assert.ok(screen(loaded, P).hits.some(hit => hit.action.kind === 'rule-row'))
})

test('F203: p previews the rules and enter saves with the token', () => {
  const started = reduce(loaded, key('p'))
  assert.deepEqual(runOf(started).args, ['--current-worktree', 'rules', 'preview'])
  assert.equal(runOf(reduce(started.state, key('return'))), undefined)
  const out = `Queue Jarvis | Rules preview\n2 ticket(s) would change.\nP1: 2 · P2: 0 · P3: 0 · P4: 0 · P5: 0\nB1       Unranked -> P1   rule 2   First\nF2       P3       -> P1   rule 2   Second\nPreview token: ${TOKEN}\n`
  const ready = settle(runOf(started).then(ok(out))(started.state)).state
  assert.match(text(ready), /Apply priority rules/); assert.match(text(ready), /2 ticket\(s\) would change\./)
  assert.match(text(ready), /F2 P3 -> P1 rule 2 Second/); assert.match(text(ready), /\[enter save\]/)
  assert.equal(reduce(ready, key('down')).state.rulesPreview?.preview?.offset, 1)
  assert.equal(press(ready, 'escape').rulesPreview, undefined)
  const saving = reduce(ready, key('return'))
  assert.deepEqual(runOf(saving).args, ['--current-worktree', 'rules', 'apply', TOKEN])
  const rejected = settle(runOf(saving).then(no('Queue Jarvis: The board or rule changed. Run a new preview before applying.'))(saving.state)).state
  assert.match(rejected.rulesPreview?.message ?? '', /Run a new preview/)
  assert.equal(runOf(reduce(rejected, key('return'))), undefined)
  assert.deepEqual(runOf(reduce(rejected, key('p'))).args, ['--current-worktree', 'rules', 'preview'])
  const saved = settle(runOf(saving).then(ok('Queue Jarvis | Applied\n2 ticket(s) updated by the priority rules.'))(saving.state))
  assert.equal(saved.state.rulesPreview, undefined)
  assert.equal(saved.state.toast, '2 ticket(s) updated by the priority rules.')
  assert.deepEqual(saved.effects, [{ kind: 'poll', what: 'board' }])
  const none = settle(runOf(started).then(ok('0 ticket(s) would change.\nP1: 0 · P2: 0 · P3: 0 · P4: 0 · P5: 0\n'))(started.state)).state
  assert.match(none.rulesPreview?.message ?? '', /No ticket would change/)
  assert.equal(runOf(reduce(none, key('return'))), undefined)
})

test('F203: Priorities frames fit 40, 80 and 120 columns', () => {
  const rows = Array.from({ length: 30 }, (_, i) => `B${i + 1} Unranked -> P1 rule 2 Ticket ${i + 1}`)
  const states: State[] = [
    loaded, press(loaded, 'd'), press(loaded, 'n'), press(loaded, 'n', 'down', 'return'), press(loaded, 'return'),
    { ...loaded, rulesPreview: { message: '30 ticket(s) would change.', preview: { token: TOKEN, counts: 'P1: 30 · P2: 0 · P3: 0 · P4: 0 · P5: 0', rows, offset: 0 } } },
    { ...loaded, rules: { ...loaded.rules!, list: Array.from({ length: 40 }, (_, i) => ({ n: i + 1, level: 'P1' as const, conditions: [['app', ['a' + i]]] as [string, string[]][] })), sel: 39 } },
  ]
  for (const cols of [40, 80, 120]) for (const rowsCount of [12, 30]) for (const state of states) {
    const f = frame({ ...state, cols, rows: rowsCount }, P)
    assert.equal(f.length, rowsCount)
    for (const line of f) assert.ok(cells(line) <= cols, `${cells(line)} > ${cols}: ${line}`)
  }
  // the selected rule stays in view in a long list, and the picker/form titles survive 40 columns
  assert.match(frame({ ...states[6]!, cols: 40, rows: 30 }, P).join('\n'), /› 40  app=a39/)
  assert.match(frame({ ...states[3]!, cols: 40, rows: 30 }, P).join('\n'), /Choose App/)
})

test('F203: --once reads the rules list and nothing else from queue-priority', async () => {
  const calls: string[][] = []
  const host = {
    win: false, skillsDir: '/s', repoRoot: '/r', inboxDir: '/common/skillator',
    stat: async () => ({ mtimeMs: 1, size: 20 }),
    read: async (p: string) => (p.endsWith('TICKETS.md') ? BOARD : ''),
    run: async (call: string, args: string[]) => {
      if (call === 'queue-priority') calls.push(args)
      return { code: 0, err: '', argv: [], out: call === 'queue-priority' ? LIST : '' }
    },
    git: async () => ({ code: 0, err: '', out: '', argv: [] }),
    write: async () => undefined,
    bins: async () => ({ npm: [], sh: null, ps: null, make: null }),
    gitEmail: async () => null,
    spawn: () => ({ stop() {} }),
  }
  const e = makeEngine({ host: host as any, state: { ...initial(80, 24, 0), tab: 'priorities' }, email: null, once: true, onChange: () => {}, onQuit: () => {} })
  try {
    await e.readAll()
    assert.deepEqual(calls, [['--current-worktree', 'rules', 'list']])
    assert.match(frame(e.state, P).join('\n'), /type=bug app=ops-board,web/)
  } finally { e.stop() }
})
```

- [ ] **Step 2: run, confirm they fail.**

```
cd plugin/mods/ops-board/ops && node --import ./loader.mjs --test tests/rules.test.mts
```
Expected: all five fail (first: `runOf(entered)` is `undefined` — entering Priorities starts no run).

- [ ] **Step 3: implement.**

**`ops/state.ts`**

Imports: add `import { orderedRules, parseRulesList, parseRulesPreview, ruleArgs, ruleOptions, toggleValue } from '../hooks/lib/rules'` and `import type { Rule } from '../hooks/lib/rules'`.

`PointerAction` — add:
```ts
  | { kind: 'rule-row'; index: number }      // F203: a rule in the Priorities list (index into orderedRules)
  | { kind: 'rule-field'; row: number }      // a row of the rule form (0 = Level)
  | { kind: 'rule-option'; index: number }   // a value in the rule form's picker
```

`State` — beside `autoPriority`:
```ts
  // F203: the saved priority rules (queue-jarvis `rules list`), the add/edit form and the apply preview
  rules?: { loading?: boolean; error?: string; revision: string; list: Rule[]; invalid: string[]; sel: number; confirm?: boolean; busy?: boolean }
  ruleEdit?: RuleEdit
  rulesPreview?: { busy?: boolean; message?: string; preview?: { token: string; counts: string; rows: string[]; offset: number } }
```
with `export type RuleEdit = { n: number | null; level: Priority; values: Record<string, string[]>; row: number; option?: number; busy?: boolean; message?: string }` beside the other exported draft types.

`pointerModal` — add `|| s.ruleEdit || s.rulesPreview || s.rules?.confirm` to the chain.

`point` — after the `priority-option` line:
```ts
  if (a.kind === 'rule-row') {
    if (!s.rules || s.rules.confirm || s.rules.busy || s.ruleEdit || s.rulesPreview) return same
    return s.rules.sel === a.index ? reduce(s, { name: 'return' }) : { state: { ...s, rules: { ...s.rules, sel: a.index } }, effects: [] }
  }
  if (a.kind === 'rule-field') {
    if (!s.ruleEdit || s.ruleEdit.busy || s.ruleEdit.option !== undefined) return same
    return reduce({ ...s, ruleEdit: { ...s.ruleEdit, row: a.row } }, { name: 'return' })
  }
  if (a.kind === 'rule-option') {
    if (!s.ruleEdit || s.ruleEdit.busy || s.ruleEdit.option === undefined) return same
    return reduce({ ...s, ruleEdit: { ...s.ruleEdit, option: a.index } }, { name: 'space' })
  }
```

New functions, placed after `autoPriorityKey`:
```ts
// --- F203: priority rules ---
const RULES = ['--current-worktree', 'rules']
const RULE_LEVELS = Object.keys(PRIORITIES) as Priority[]
const onRules: Then = r => x => {
  const list = r.code === 0 ? parseRulesList(r.out) : null
  if (!list) return { ...x, rules: { revision: '', list: [], invalid: [], sel: 0,
    error: r.code === 0 ? 'Queue Jarvis returned an incomplete rules list. Press r to reload.' : why(r, 'Queue Jarvis') } }
  return { ...x, rules: { revision: list.revision, list: list.rules, invalid: list.invalid,
    sel: Math.max(0, Math.min(x.rules?.sel ?? 0, list.rules.length - 1)) } }
}
export const loadRulesEffect = (): Effect => run('queue-priority', [...RULES, 'list'], onRules)
const loadingRules = (s: State): State =>
  ({ ...s, rules: { revision: '', list: [], invalid: [], sel: 0, ...s.rules, loading: true, error: undefined } })

function previewRules(s: State): Step {
  const done: Then = r => x => {
    if (r.code !== 0) return { ...x, rulesPreview: { message: why(r, 'Queue Jarvis') } }
    const preview = parseRulesPreview(r.out)
    if (!preview) return { ...x, rulesPreview: { message: 'Queue Jarvis did not return a complete preview. Press p to try again.' } }
    if (!preview.token) return { ...x, rulesPreview: { message: 'No ticket would change.' } }
    return { ...x, rulesPreview: { message: preview.count, preview: { token: preview.token, counts: preview.levels, rows: preview.changes, offset: 0 } } }
  }
  return { state: { ...s, rulesPreview: { busy: true, message: 'Checking tickets against the rules…' } }, effects: [run('queue-priority', [...RULES, 'preview'], done)] }
}

function rulesPreviewKey(s: State, k: Key): Step {
  const draft = s.rulesPreview!
  const same = { state: s, effects: [] }
  if (draft.busy) return same
  if (k.name === 'escape' || (k.ctrl && k.name === 'c')) return { state: { ...s, rulesPreview: undefined }, effects: [] }
  if (k.name === 'p') return previewRules(s)
  const preview = draft.preview
  if (!preview) return same
  if (k.name === 'return' || k.name === 'enter') {
    const done: Then = r => x => r.code === 0
      ? { state: toast({ ...x, rulesPreview: undefined }, r.out.trim().split(/\r?\n/).at(-1) || 'Priority rules applied.'), effects: [{ kind: 'poll', what: 'board' }] }
      : { ...x, rulesPreview: { message: why(r, 'Queue Jarvis') } }
    return { state: { ...s, rulesPreview: { busy: true, message: 'Saving priorities…' } }, effects: [run('queue-priority', [...RULES, 'apply', preview.token], done)] }
  }
  const direction = k.name === 'up' || k.name === 'k' ? -1 : k.name === 'down' || k.name === 'j' ? 1 : 0
  if (!direction) return same
  const offset = Math.max(0, Math.min(preview.rows.length - 1, preview.offset + direction))
  return { state: { ...s, rulesPreview: { ...draft, preview: { ...preview, offset } } }, effects: [] }
}

function ruleEditKey(s: State, k: Key): Step {
  const edit = s.ruleEdit!
  const same = { state: s, effects: [] }
  if (edit.busy) return same
  const set = (patch: Partial<RuleEdit>): Step => ({ state: { ...s, ruleEdit: { ...edit, message: undefined, ...patch } }, effects: [] })
  const fields = priorityFilterOptions(s.board, true)
  const submit = k.name === 'return' || k.name === 'enter'
  const cancel = k.name === 'escape' || (k.ctrl && k.name === 'c')
  const direction = k.name === 'up' || k.name === 'k' ? -1 : k.name === 'down' || k.name === 'j' ? 1 : 0
  if (edit.option !== undefined) {
    const field = fields[edit.row - 1]
    if (cancel || !field) return set({ option: undefined })
    const chosen = edit.values[field.key] ?? []
    const options = ruleOptions(field.values, chosen)
    const at = Math.min(edit.option, options.length - 1)
    if (submit || k.name === 'space') return options.length ? set({ option: at, values: { ...edit.values, [field.key]: toggleValue(chosen, options[at]!) } }) : same
    return direction ? set({ option: Math.max(0, Math.min(options.length - 1, at + direction)) }) : same
  }
  if (cancel) return { state: { ...s, ruleEdit: undefined }, effects: [] }
  if (/^[1-5]$/.test(k.name)) return set({ level: ('P' + k.name) as Priority })
  const move = k.name === 'tab' ? (k.shift ? -1 : 1) : direction
  if (move) return set({ row: (edit.row + move + fields.length + 1) % (fields.length + 1) })
  if (submit || k.name === 'space') {
    return edit.row === 0 ? set({ level: RULE_LEVELS[(RULE_LEVELS.indexOf(edit.level) + 1) % RULE_LEVELS.length]! }) : set({ option: 0 })
  }
  if (k.name !== 's') return same
  const args = ruleArgs(edit.level, edit.values)
  if (args.length < 2) return set({ message: 'Choose at least one condition.' })
  const form: RuleEdit = { n: edit.n, level: edit.level, values: edit.values, row: edit.row }
  const done: Then = r => x => r.code === 0
    ? { state: toast({ ...x, ruleEdit: undefined }, 'Priority rule saved.'), effects: [loadRulesEffect()] }
    : { ...x, ruleEdit: { ...form, message: why(r, 'Queue Jarvis') } }
  const call = edit.n === null ? ['add', ...args] : ['edit', String(edit.n), ...args, '--rev', s.rules?.revision ?? '']
  return { state: { ...s, ruleEdit: { ...form, busy: true, message: 'Saving the rule…' } }, effects: [run('queue-priority', [...RULES, ...call], done)] }
}

// The Priorities tab's own keys; null = not ours (tab switching, quit, Auto-assign fall through).
function rulesKey(s: State, k: Key): Step | null {
  if (k.name === 'r') {
    return { state: toast(loadingRules(s), '↻ TICKETS.md and priority rules reloaded'), effects: [{ kind: 'poll', what: 'board' }, { kind: 'poll', what: 'slow' }, loadRulesEffect()] }
  }
  const rules = s.rules
  if (!rules || rules.loading || rules.busy) return null
  const shown = orderedRules(rules.list)
  const rule = shown[rules.sel]
  if (rules.confirm) {
    if (k.name !== 'y' || !rule) return { state: { ...s, rules: { ...rules, confirm: undefined } }, effects: [] }
    const done: Then = r => x => ({
      state: toast({ ...x, rules: x.rules && { ...x.rules, busy: undefined } }, r.code === 0 ? 'Priority rule deleted.' : why(r, 'Queue Jarvis')),
      effects: [loadRulesEffect()],
    })
    return { state: { ...s, rules: { ...rules, confirm: undefined, busy: true } },
      effects: [run('queue-priority', [...RULES, 'remove', String(rule.n), '--rev', rules.revision], done)] }
  }
  if (rules.error) return null
  if (k.name === 'n') return { state: { ...s, ruleEdit: { n: null, level: 'P1', values: {}, row: 0 } }, effects: [] }
  if (k.name === 'p') {
    if (rules.invalid.length) return { state: toast(s, 'Fix the invalid lines in .skillator/priority-rules.md first.'), effects: [] }
    return rules.list.length ? previewRules(s) : { state: toast(s, 'Add a rule first: press n.'), effects: [] }
  }
  const direction = k.name === 'up' || k.name === 'k' ? -1 : k.name === 'down' || k.name === 'j' ? 1 : 0
  if (direction) return { state: { ...s, rules: { ...rules, sel: Math.max(0, Math.min(shown.length - 1, rules.sel + direction)) } }, effects: [] }
  if (!rule) return null
  if (k.name === 'e' || k.name === 'return' || k.name === 'enter') {
    return { state: { ...s, ruleEdit: { n: rule.n, level: rule.level, values: Object.fromEntries(rule.conditions), row: 0 } }, effects: [] }
  }
  if (k.name === 'd') return { state: { ...s, rules: { ...rules, confirm: true } }, effects: [] }
  return null
}
```

`toTab` — add before its `return`:
```ts
  if (tab === 'priorities' && s.tab !== 'priorities') return { state: { ...loadingRules(s), tab, help: null }, effects: [...effects, loadRulesEffect()] }
```

`reduce` — at the top, after the `s.priorityEdit` line:
```ts
  if (s.ruleEdit) return ruleEditKey(s, k)
  if (s.rulesPreview) return rulesPreviewKey(s, k)
```
and directly after the existing `if (s.tab === 'priorities' && k.name === 'a') …` line:
```ts
  if (s.tab === 'priorities') { const step = rulesKey(s, k); if (step) return step }
```

**`ops/draw.ts`**

Imports: `import { hasValue, orderedRules, ruleOptions, ruleSummary } from '../hooks/lib/rules'`.

`keysOf` — after the `s.autoPriority` block:
```ts
  if (s.ruleEdit) {
    if (s.ruleEdit.busy) return [[dim('Working…')]]
    if (s.ruleEdit.option !== undefined) return [move, h('space toggle', 'space'), h('esc back', 'escape')]
    return [move, [dim('1-5 level')], h('enter choose', 'return'), h('s save', 's'), cancel]
  }
  if (s.rulesPreview) {
    if (s.rulesPreview.busy) return []
    if (s.rulesPreview.preview) return [move, h('enter save', 'return'), h('p preview again', 'p'), cancel]
    return [h('p preview again', 'p'), cancel]
  }
```
and the `s.tab === 'priorities'` line becomes:
```ts
  if (s.tab === 'priorities') {
    if (s.rules?.confirm) return [h('y delete', 'y'), h('n keep', 'n')]
    const usable = !!s.rules && !s.rules.loading && !s.rules.error
    const has = usable && s.rules!.list.length > 0
    return [...(has ? [move, h('enter edit', 'return'), h('d delete', 'd')] : []),
      ...(has && !s.rules!.invalid.length ? [h('p apply rules', 'p')] : []),
      ...(usable ? [h('n new rule', 'n')] : []), h('a Auto-assign', 'a'), h('tab switch', 'tab'), quit]
  }
```

New body functions, after `autoPriorityBody`:
```ts
// F203: the legend with each level's rules under it; the status lines stay pinned below the list.
function prioritiesBody(s: State, room: number): Seg[][] {
  const rules = s.rules
  const shown = orderedRules(rules?.list ?? [])
  const lines: Seg[][] = []
  let cursor = 0, index = 0
  for (const [id, { color, label }] of Object.entries(PRIORITIES)) {
    lines.push([{ text: '● ' + id, color }, { text: '  ' + label }])
    for (const rule of shown.filter(r => r.level === id)) {
      const on = index === rules!.sel
      if (on) cursor = lines.length
      lines.push([{ text: (on ? '› ' : '  ') + String(rule.n).padStart(2) + '  ' + ruleSummary(rule),
        color: on ? 'suggestion' : undefined, action: { kind: 'rule-row', index } }])
      index++
    }
  }
  lines.push([dim('Unprioritized tickets follow P5 in Queue Jarvis.')])
  const status: Seg[][] = []
  const selected = shown[rules?.sel ?? 0]
  if (!rules || rules.loading) status.push([dim('Loading priority rules…')])
  else if (rules.error) status.push([{ text: rules.error, color: 'error' }])
  else if (rules.confirm && selected) status.push([{ text: `Delete rule ${selected.n}? ${selected.level}: ${ruleSummary(selected)}`, color: 'warning' }])
  else if (rules.busy) status.push([dim('Working…')])
  else if (!shown.length && !rules.invalid.length) status.push([dim('No priority rules yet. Press n to add one, e.g. P1 for bugs in an app.')])
  if (rules?.invalid.length && !rules.error) {
    status.push(...rules.invalid.slice(0, 3).map(text => [{ text, color: 'warning' as Color }]))
    status.push([dim('Fix these in .skillator/priority-rules.md; rules cannot be applied until then.')])
  }
  const tail = status.slice(0, Math.max(0, room - 1))
  const space = Math.max(1, room - tail.length)
  const offset = Math.max(0, Math.min(cursor - Math.floor(space / 2), lines.length - space))
  return [...lines.slice(offset, offset + space), ...tail].slice(0, room)
}

function ruleEditBody(s: State, room: number): Seg[][] {
  const edit = s.ruleEdit!
  const fields = priorityFilterOptions(s.board, true)
  const picking = edit.option !== undefined ? fields[edit.row - 1] : undefined
  const chosen = picking ? edit.values[picking.key] ?? [] : []
  const rows: Boxed['rows'] = picking
    ? ruleOptions(picking.values, chosen).map((value, index) => ({ text: (hasValue(chosen, value) ? '[x] ' : '[ ] ') + value, action: { kind: 'rule-option', index } }))
    : [{ text: 'Level'.padEnd(12) + edit.level, action: { kind: 'rule-field', row: 0 } },
      ...fields.map(({ key, label }, index) => ({
        text: label.padEnd(12) + (edit.values[key]?.length ? edit.values[key]!.join(', ') : 'any') + ' ▾', action: { kind: 'rule-field' as const, row: index + 1 },
      }))]
  if (picking && !rows.length) rows.push({ text: 'No open ticket has a value for this field.' })
  const active = Math.max(0, Math.min(rows.length - 1, picking ? edit.option! : edit.row))
  const note = edit.message ?? (picking ? 'Checked values: any of them matches.' : 'Every chosen field must match.')
  const page = Math.max(1, room - (room >= 5 ? 3 : 2))
  const offset = Math.max(0, active - page + 1)
  const visible = rows.slice(offset, offset + page).map((row, index) => ({
    ...row, text: (offset + index === active ? '› ' : '  ') + row.text,
    color: offset + index === active ? 'suggestion' as const : undefined,
  }))
  if (room >= 5) visible.push({ text: note, color: edit.message && !edit.busy ? 'warning' as const : undefined, action: undefined })
  return boxBody(s, { title: picking ? 'Choose ' + picking.label : edit.n === null ? 'New priority rule' : 'Edit rule ' + edit.n, rows: visible })
}

function rulesPreviewBody(s: State, room: number): Seg[][] {
  const draft = s.rulesPreview!
  const rows: Boxed['rows'] = [{ text: draft.message ?? '' }]
  if (draft.preview) {
    const counts = cells(draft.preview.counts) <= innerOf(s) ? draft.preview.counts : draft.preview.counts.replace(/: /g, ':').replace(/ · /g, '  ')
    rows.push({ text: counts, color: 'suggestion' })
    const page = Math.max(1, room - 2 - rows.length)
    rows.push(...draft.preview.rows.slice(draft.preview.offset, draft.preview.offset + page).map(text => ({ text })))
  }
  return boxBody(s, { title: 'Apply priority rules', rows })
}
```

`bodyOf` — in the `main` chain, after the `s.autoPriority` arm:
```ts
    : s.ruleEdit ? ruleEditBody(s, room)
    : s.rulesPreview ? rulesPreviewBody(s, room)
```
and the `s.tab === 'priorities'` arm becomes `: s.tab === 'priorities' ? prioritiesBody(s, room)`. Add `s.ruleEdit || s.rulesPreview` to the `boxed` condition.

**`ops/engine.ts`**

- Import `loadRulesEffect` from `./state`.
- The read-only gate (currently `if (once && e.call !== 'relay-decide') return`) becomes:
```ts
    // F203: `rules list` is a read, so --once runs it too; every other queue-priority run stays out
    const reads = e.call === 'relay-decide' || (e.call === 'queue-priority' && e.args.join(' ') === '--current-worktree rules list')
    if (once && !reads) return
```
- `readAll()`, after the `state.tab === 'run'` line: `if (state.tab === 'priorities') await runEffect(loadRulesEffect())` followed by `if (stopped) return`.
- `start()`, beside the other per-tab lines: `if (state.tab === 'priorities') void runEffect(loadRulesEffect())`.

- [ ] **Step 4: run, confirm it passes.**

```
cd plugin/mods/ops-board/ops && node --import ./loader.mjs --test tests/rules.test.mts
```
Expected: `# pass 5`, `# fail 0`. Then the full ops suite:
```
npm.cmd test --prefix plugin/mods/ops-board/ops
```
Expected: no new failures — the same 10 pre-existing failures (usage-string and PowerShell timing tests) and nothing else; the F200 tests in `state.test.mts` and `draw.test.mts` pass.

- [ ] **Step 5: commit.**

```
git add plugin/mods/ops-board/ops/state.ts plugin/mods/ops-board/ops/draw.ts plugin/mods/ops-board/ops/engine.ts plugin/mods/ops-board/ops/tests/rules.test.mts
git commit -m "F203: standalone ops TUI - priority rules list, form and apply preview"
```

## VERIFICATION

Run from the repo root (`C:\tools\Projects\skillator2`), after T3 lands. "held" verify seat: each command is run fresh and its output read in full.

1. **CLI tests** — `node --test plugin/skills/queue-jarvis/scripts/queue.test.mjs` → `# pass 10`, `# fail 0`.

2. **CLI by hand, in a scratch repo** (Git Bash):
```
Q="$PWD/plugin/skills/queue-jarvis/scripts/queue.mjs"; D="$(mktemp -d)"; cd "$D" && git init -q
printf -- '- [ ] B1 — Crash in a [app: a]\n- [ ] F3 — Feature in c [app: c] [priority: P3]\n- [ ] B4 — Critical thing [app: z] [severity: critical]\n- [ ] B5 — Other [app: z]\n' > TICKETS.md
node "$Q" rules add P1 type=bug app=a,b,c && node "$Q" rules add P1 type=feature app=c && node "$Q" rules add P1 severity=critical
node "$Q" rules list
node "$Q" rules preview
```
Expected: `rules list` prints `3 rule(s).`, `1  P1: type=bug app=a,b,c`, `2  P1: type=feature app=c`, `3  P1: severity=critical`, a `Rules revision:` line. `rules preview` prints `3 ticket(s) would change.`, `P1: 3 · P2: 0 · P3: 0 · P4: 0 · P5: 0`, rows `B1 … Unranked -> P1   rule 1`, `F3 … P3 -> P1   rule 2`, `B4 … Unranked -> P1   rule 3`, no `B5` row, and a `Preview token:` line. Then `node "$Q" rules apply <that token>` → `3 ticket(s) updated by the priority rules.`; `grep -c 'priority: P1' TICKETS.md` → `3`; a second `rules preview` → `0 ticket(s) would change.` and no token. `cat .skillator/priority-rules.md` shows the four `#` header lines and three `- P1: …` lines. Keep `$D` for step 5.

3. **Pane render proof** (targeted run — block in T2 Step 2 with `rules.test.ts` and `rules.test.tsx`): all 8 tests pass. The assertions that stand as render proof:
   - `rule:empty` text contains `No priority rules yet`; `rule:preview` absent with no rules.
   - rule buttons in order `['rule:2', 'rule:3', 'rule:1']` (P1 rules above the P2 rule); `rule:2` text contains `type=bug app=ui,web`.
   - `rule:invalid` contains `Invalid line 4` and `.skillator/priority-rules.md`; `rule:list-error` contains the CLI message.
   - the form has no `Select`; `rule:field:app` reads `App api, ui` after two toggles; exactly 12 `rule:option:*` buttons on a 70-ticket board with `rule:picker-next` paging.
   - runs equal `['--current-worktree','rules','add','P3','app=api,ui','type=bug']`, `[…,'edit','2','P4','app=legacy','--rev',REV2]`, `[…,'remove','1','--rev',REV2]`, `[…,'preview']`, `[…,'apply',TOKEN]`.
   - `rule:preview-changes` contains `F3 P3 -> P1 rule 1`; a stale apply shows `Run a new preview` and removes `rule:apply`.
   - `w.writes` is `[]` in every test.
   Regression: the same block with only `tests/assign.test.tsx` → all pass (Auto-assign unchanged).

4. **TUI tests** — `cd plugin/mods/ops-board/ops && node --import ./loader.mjs --test tests/rules.test.mts` → `# pass 5`, `# fail 0`; `npm.cmd test --prefix plugin/mods/ops-board/ops` → only the 10 pre-existing failures.

5. **TUI frame captures at 40, 80 and 120 columns** against the scratch repo `$D` from step 2 (it has three P1 rules), from the repo root:
```
for C in 40 80 120; do node --import ./plugin/mods/ops-board/ops/loader.mjs plugin/mods/ops-board/ops/app.ts "$D" --once --cols $C --rows 30 --no-color --tab priorities; echo "=== $C ==="; done
```
Expected in every capture: 30 lines, none wider than its column count (check with `awk '{ if (length($0) > C) print "WIDE", length($0) }'` per capture — no output; the frames are plain text, box/dot glyphs are single-cell); the legend lines `● P1` … `● P5`; directly under `● P1` the three rule rows, the first with the cursor: `›  1  type=bug app=a,b,c`, then `   2  type=feature app=c`, `   3  severity=critical`; the line `Unprioritized tickets follow P5 in Queue Jarvis.` (cut with `…` at 40); no `Loading priority rules…` line (the `--once` read ran); the key row containing `[n new rule]`, `[p apply rules]`, `[a Auto-assign]` at 80 and 120 (wrapped or shortened per the existing key-row rules at 40). A fourth capture in this repo (no rules file), `node --import ./plugin/mods/ops-board/ops/loader.mjs plugin/mods/ops-board/ops/app.ts --once --cols 80 --rows 30 --no-color --tab priorities`, shows `No priority rules yet. Press n to add one, e.g. P1 for bugs in an app.` and no `[p apply rules]`.

6. **Requirements, line by line** — walk R1..R15 against the TRACE table; each named test exists and passed in the runs above.

## Decisions

- Ruling: rules live in `.skillator/priority-rules.md` in the main checkout (beside TICKETS.md's repo root; honour `--current-worktree` like queue.mjs) — plain text, editable by hand and by Claude for "plain words" requests - one file people and agents can both read - cost: a second board-like file to lock.
- Ruling: one rule per line `- P1: type=bug app=a,b,c`; conditions inside a rule are AND-ed, a comma inside a value means any of, rules for the same level are OR-ed - matches the owner's examples - cost if wrong: owners wanting OR across fields write two rules.
- Ruling: a ticket matching rules of several levels gets the highest (P1 beats P2); open tickets only (status selectors allowed); tickets matching no rule are untouched - least surprise - cost if wrong: an owner expecting "last rule wins" reorders nothing and sees the higher level applied.
- Ruling: rules apply overrides an existing priority on a matching ticket; the preview shows `from -> to` for every change so nothing is silent - rules are the owner's source of truth - cost if wrong: a hand-set priority is overwritten after a confirmed preview.
- Ruling: applying stays preview-then-confirm with a token (same safety as preview/apply); editing the rules file itself needs no preview - the file is the owner's text, the board is the shared record - cost if wrong: a mistaken rule is saved, but it changes no ticket until a preview is confirmed.
- Ruling: mode per-task; T1 → T2 → T3 run one at a time, one fresh build agent each - owner rule, never parallel subagents - cost if wrong: slower than a fan-out, nothing else.
- Ruling: queue.mjs is the only parser and writer of the rules file; both UIs go through the `queue-priority` call and parse fixed stdout lines - one grammar implementation, the mod keeps writing no file - cost if wrong: one `node` spawn per list load, and `--once` needs a one-line read-only allowance.
- Ruling: any non-blank, non-`#` line that is not a valid rule is an invalid line; invalid lines are listed, never rewritten, and block `rules preview` / `rules apply` - a typo must not silently drop a P1 rule from an apply - cost if wrong: one bad line stops applying until it is fixed by hand or by Claude (the UIs show the line number and reason but do not edit invalid lines).
- Ruling: a field may appear once per rule; a repeated field is invalid - the editor holds one value set per field, and "any of" is the comma - cost if wrong: "app has both a and b" cannot be written as a rule.
- Ruling: in a rule only a `status` condition lifts the open-tickets filter; `id` does not (unlike a plain `id=` selector) - "open tickets only (status selectors allowed)" read literally, one sentence to explain - cost if wrong: a rule on a closed ticket's ID needs `status=done` beside it.
- Ruling: values may contain spaces; a new condition starts at whitespace followed by `word=`; no inline comments; values are lowercased - board values like `next release` and `ops board` exist today, and selectors already match case-insensitively - cost if wrong: a value containing a comma or ` word=` cannot be expressed.
- Ruling: rules are addressed by position (1..N in file order) with `--rev <sha256 of the file>` on `edit` / `remove`; both UIs always send it - numbers shift when someone edits the file by hand between list and action - cost if wrong: an occasional "The rules changed. Reload them and try again." after a concurrent hand edit.
- Ruling: `rules preview` takes no selectors and applies every rule - the rules are the scope - cost if wrong: an owner wanting a partial apply uses `preview P1 <selectors>` as today.
- Ruling: the preview names the winning rule (`rule <n>`) on every change line - answers "why did this become P1" without opening the file - cost if wrong: a slightly longer line in narrow terminals (it truncates).
- Ruling: the UI pickers are always paged / windowed multi-select lists, never a `Select`, and offer values seen on open tickets plus values already in the rule - a `Select` is single-value and B33 breaks it past 64 options - cost if wrong: a value no open ticket carries must be typed into the file, said to Claude, or added with `rules add` (no free-text entry in the UI; out of scope).
- Ruling: the rule list in the pane is not paged; the pane scrolls - owners keep tens of rules, not hundreds - cost if wrong: a very long list is a long scroll.
- Ruling: Auto-assign is untouched and independent of rules - it only fills unranked tickets, so it cannot undo a rule - cost if wrong: two ways to rank exist side by side on one tab.
- Ruling: T2's tests live in new files (`tests/rules.test.ts`, `tests/rules.test.tsx`) and T3's in `ops/tests/rules.test.mts`, with their own small mock world - `assign.test.tsx`, `pane.test.tsx`, `state.test.mts` carry another ticket's uncommitted edits and the full pane suite times out here - cost if wrong: ~40 lines of mock world repeated.
- Ruling: the design takes no independent design-review read (PRACTICE §3) - three tasks, sequential, no fan-out, so condition 2 does not hold - cost if wrong: an interface slip surfaces at T2/T3 review instead of now.
- Open for the controller (not ruled here): `hooks/assign.tsx`, `hooks/pane.tsx`, `hooks/register.tsx`, `types/index.d.ts`, `tests/assign.test.tsx` and `tests/pane.test.tsx` have uncommitted edits from other work in the main checkout. Land or park them before dispatching T2, or have T2 stage with `git add -p` as written.
- Open for the controller (not ruled here): whether `.skillator/priority-rules.md` is committed in a repo is the repo owner's choice; nothing here adds it to or removes it from any ignore file.

### Self-review (PRACTICE §3), done inline

1. Coverage — every part of the request maps to a task: the editable UI (T2 pane, T3 TUI), multiple rules per level with AND / any-of (T1 grammar + R4), "plain words in claude" (T1 SKILL.md, R7). R1–R7 → T1, R8–R11 → T2, R12–R15 → T3.
2. Placeholders — none: every step carries its test code, implementation code and command. Fixed during review: `writeRule`'s failure branch read the list twice (now once, and the form takes the fresh revision); the pane list load was a side effect of rendering (now explicit triggers plus a `rule:unloaded` state); T1's expected-board `replace` chain hit A5's line before B7's (reordered); the pane's "board was polled" assertion leaned on collapsed ticket rows (now a board-read counter).
3. Type consistency — checked across tasks: `Rule { n, level, conditions }`, `RulesList { rules, invalid, revision }`, `RulesPreview { token, count, levels, changes }`; `ruleArgs(level, values)`; `priorityFilterOptions(board, true)`; pane atoms `priorityRules` / `ruleDraft` / `rulesPreview`; TUI fields `rules` / `ruleEdit` / `rulesPreview`; `loadRulesEffect`. The TUI's `preview.counts` holds `RulesPreview.levels` and `message` holds `RulesPreview.count` (named so in T3's `previewRules`). `ruleArgs` emits fields in `PRIORITY_FILTERS` order (app, src, owner, id, type, …), which is why the tests expect `app=…` before `type=…`.
4. Contradictions — "open tickets only" vs `id=`: resolved by ruling (only `status` lifts it). "Editing the file needs no preview" vs `--rev`: `--rev` is a staleness guard, not a preview. Invalid lines: listed everywhere, blocking only preview/apply.
5. Scope — one coherent change in three sequential, separately reviewable tasks; nothing wants decomposing further.
