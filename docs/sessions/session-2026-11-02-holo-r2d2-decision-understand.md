grade: bounded · critical no · design deep=gpt-6-astra/high · build build=gpt-6-astra/medium · verify build=gpt-6-astra/medium · ceremony full · ui arwen · mode per-task (asked) · usage unobservable

PLATFORM:     antigravity
GRADE:        grade: bounded · critical no · design deep=gpt-6-astra/high · build build=gpt-6-astra/medium · verify build=gpt-6-astra/medium · ceremony full · ui arwen · mode per-task (asked) · usage unobservable
DESIGN_MODEL: gpt-6-astra/high
BUILD_MODEL:  gpt-6-astra/medium

# GOAL

Elevate `holo-r2d2` (`plugin/skills/holo-r2d2/`) to provide rich architectural clarity and visual decision support:
1. Upgrade decision visualization in `wizard.mjs` and `holo.mjs` with rich inline SVG architectural block diagrams (`Current State` -> `Decision Gate` -> `Option Path` -> `Trade-off/Cost` -> `Affected Files/Modules` -> `Downstream Unblocked`) and parallel-lane visual option comparisons.
2. Elevate `wizard.mjs` into a premier decision surface featuring a toggleable Side-by-Side Comparison Matrix, blast-radius/dependency chips with a mini stage-graph strip, keyboard-first navigation (`1`–`9`, `[`/`]`, `Alt+Left/Right`, `?` shortcut dialog, `/` search focus), and an expanded review screen with summary dashboard metrics and one-click `relay-morpheus` answer command copying.
3. Establish 4 first-class modes across CLI and `SKILL.md` output-picker: `decision`, `anatomy`, `md`, and `understand` — introducing `scripts/understand.mjs` inspired by Egonex-AI/Understand-Anything ("graphs that teach > graphs that impress") to render an interactive, self-contained HTML architecture and domain-knowledge explorer (`.skillator/holo/<id>.understand.html`) with semantic grouping, node inspector, search/filter, and step-by-step Guided Tour.
4. Strictly retain `batch` as an automatic marathon end-batch/away mode, removing it from interactive manual format menus.
5. Maintain 100% offline self-contained integrity (zero npm/CDN dependencies, strict XSS-safe DOM construction, no preselected recommendations, light/dark themes, `prefers-reduced-motion` compliance), expand selftests and test suites, and keep the installed skill copy synced.

# REQUIREMENTS

- R1 — Inline SVG architectural block diagrams for single-option inspection in `wizard.mjs` and `holo.mjs` rendering: `Current State` (`now`) -> `Decision Gate` (`Qk`) -> `Option Path` (`does`) -> `Trade-off / Cost` (`tradeoff`) -> `Affected Files & Modules` (`scope`) -> `Downstream Stages & Tickets Unblocked` (`blocks` / `holds`).
- R2 — Inline SVG parallel-lane option comparison diagram in `wizard.mjs` and `holo.mjs` rendering all available options as parallel lanes stemming from gate `Qk` to compare action flows, trade-offs, and blast radii simultaneously.
- R3 — Toggleable Side-by-Side Option Comparison Matrix view in `wizard.mjs` step view comparing options across columns (`Action / Does`, `Trade-offs / Cons`, `Consequences / Blast Radius`, `Recommendation`).
- R4 — Interactive blast-radius and dependency chips in `wizard.mjs` for impacted files, held stages, and blocked tickets.
- R5 — Compact inline SVG mini stage-graph / context strip in `wizard.mjs` highlighting where the current decision sits in the run chain.
- R6 — Keyboard-first navigation in `wizard.mjs` supporting `1`–`9` to preview/select options when not typing in inputs, `[` / `]` or `Alt+Left`/`Alt+Right` for previous/next decision step, `?` for keyboard shortcuts dialog modal, and `Escape` to close modals.
- R7 — Real-time search and filter across decisions in `wizard.mjs` step navigation when more than one decision exists.
- R8 — Richer review and handoff screen in `wizard.mjs` with summary metric cards (answered vs custom vs deferred counts) and blast-radius impact summary.
- R9 — One-click Copy `relay-morpheus` answer commands button on the review screen alongside Download Final JSON, providing formatted single-quoted command output and visual status feedback.
- R10 — Strict XSS-safe DOM construction (`textContent` / `createElementNS`, zero `innerHTML` / `outerHTML` on user/run data) and non-preselected recommendations preserved across all `wizard.mjs` interactions.
- R11 — First-class CLI mode selectors in `holo.mjs` supporting both positional subcommands (`decision`, `anatomy`, `md`, `understand`) and flags (`--decision`/`--wizard`, `--anatomy`, `--md`, `--understand`).
- R12 — Dedicated modular domain-knowledge explorer script `plugin/skills/holo-r2d2/scripts/understand.mjs` generating self-contained offline explorer `.skillator/holo/<id>.understand.html`.
- R13 — Semantic domain grouping (Stages, Files/Modules, Tickets, Decisions) with interactive node inspector and incoming/outgoing connection highlighting in `understand.mjs`.
- R14 — Interactive step-by-step Guided Tour engine in `understand.mjs` walking through run goals, completed stages, active gates, pending stages, and module dependency graph.
- R15 — Upgraded decision cards in `holo.mjs` standalone and artifact HTML pages rendering the upgraded architectural block diagrams and parallel-lane comparisons.
- R16 — `SKILL.md` output-picker workflow updated to offer `decision | anatomy | md | understand` as the primary user-facing modes and strictly document `batch` as an automatic marathon end-batch/away flow only.
- R17 — Zero external npm and CDN dependencies; 100% offline self-contained HTML/SVG; full light and dark theme support; `prefers-reduced-motion` compliance across all new pages and diagrams.
- R18 — Extended test coverage in `node plugin/skills/holo-r2d2/scripts/holo.mjs --selftest` and `node --test plugin/skills/holo-r2d2/scripts/anatomy.test.mjs` covering all 4 modes, SVG diagrams, matrix view, review screen copy, and understand explorer.
- R19 — Automatic synchronization of all modified skill files to the active installed directory `C:\Users\Ikran\.agy-sher\.gemini\antigravity-cli\skills\holo-r2d2\`.

# APPROACHES

**A. Monolithic Expansion in `holo.mjs` and `wizard.mjs`.**
Incorporate the understand architecture explorer, graph layouts, SVG diagrams, comparison matrix, and keyboard navigation directly inside `scripts/holo.mjs` and `scripts/wizard.mjs`.
- *Trade-off:* `holo.mjs` (1,365 lines) and `wizard.mjs` (721 lines) would balloon into dense multi-thousand-line monolithic files, tightly coupling the decision wizard workflow with deep domain architecture exploration, increasing context cost and complicating per-task parallel verification.

**B. Modular Architecture Explorer (`scripts/understand.mjs`) + Shared SVG Architecture Generators + Upgraded Wizard & CLI (Chosen).**
Extract the architecture and domain explorer into a dedicated, self-contained `scripts/understand.mjs` module. Upgrade `scripts/wizard.mjs` to export and render rich SVG block diagrams, parallel lanes, comparison matrix, blast-radius context strip, keyboard shortcuts, and review dashboard copy commands. Upgrade `scripts/holo.mjs` to parse subcommands/flags for `decision|anatomy|md|understand`, wire understand mode, update decision cards, and extend selftests. Update `SKILL.md` to establish the 4 first-class modes and enforce automatic-only `batch`.
- *Trade-off:* Adds one clean, cohesive module `scripts/understand.mjs`. Perfect separation of concerns, high testability, and clean per-task implementer boundaries.

**C. External Library Integration (e.g. Cytoscape, D3, or Vis.js via CDN).**
Use off-the-shelf graphing libraries to draw force-directed network graphs for the understand explorer.
- *Trade-off:* Strictly violates the zero-npm / zero-CDN / offline-first rule of `holo-r2d2` and skillator canon. Cannot run offline or in airgapped environments. Rejected.

# CHOSEN

Approach B: Modular Architecture Explorer (`scripts/understand.mjs`) + Upgraded Decision Wizard (`scripts/wizard.mjs`) + Unified CLI and Card Renderer (`scripts/holo.mjs`) + Sync to installed skill directory.

# DESIGN

## D1. Architectural Flow & Parallel-Lane SVG Diagrams (`wizard.mjs` & `holo.mjs`)

Currently, `optionFlow` in `holo.mjs` and `renderBlockDiagram` in `wizard.mjs` draw basic disconnected action boxes. The upgraded SVG diagrams provide true architectural block semantics:

1. **Single Option Architectural Flow:**
   A structured horizontal/vertical SVG flow pipeline:
   - `[Now: Current State]` (gray pill, input state)
   - `->` connector
   - `[Decision Gate Qk]` (amber accent badge, question summary)
   - `->` connector
   - `[Option Path]` (accent/blue box with option label and `What this action does`)
   - `->` connector branching to:
     - `[Pros / Does]` (green background `#e3f1e8` / dark `#16271c`, green stroke `#2f7d4f`)
     - `[Cons / Trade-off]` (red/amber background `#f8e3e1` / dark `#341a17`, red stroke `#b3261e`)
   - `->` connector
   - `[Impacted Scope]` (files and modules chip list)
   - `->` connector
   - `[Downstream Unblocked]` (held stages unblocked, blocked tickets unlocked)

2. **Parallel-Lane Option Comparison Diagram:**
   Stemming from a single source node (`[Current State & Gate Qk]`), the diagram fans out into $N$ parallel horizontal lanes (one per option $o_1 \dots o_n$), where each lane renders:
   - Option Badge & Label (with `(Recommended)` highlight if applicable)
   - Action block (`does`)
   - Pros card vs Cons card
   - Consequence & Blast-radius pill (`holds stage X \cdot files Y`)
   Allows immediate visual scanning across all options without clicking back and forth.

3. **Responsive SVG ViewBox & Scalability:**
   Uses dynamic viewBox calculation based on option count and content wrapping. Pure inline SVG with embedded marker defs (`#bd-arrow`, `#lane-arrow`), styled via CSS variables (`--ink`, `--line`, `--rec`, `--warn`, `--accent`) for seamless light/dark theme adaptation.

## D2. Upgraded Decision Wizard (`wizard.mjs`)

1. **Side-by-Side Comparison Matrix View:**
   - In `stepView`, provide a view toggle button: `[Flow View] | [Matrix View]`.
   - Matrix View renders a structured comparison grid:
     - Columns: `Attribute`, `Option 1`, `Option 2`, ... `Option N`, `Custom / Something Else`, `Ask / Explain More`.
     - Rows:
       - `Action` (`does` / `explain`)
       - `Pros` (`pros` / `does`)
       - `Cons & Trade-offs` (`tradeoff` / `cons`)
       - `Blast Radius` (files, held stages, blocked tickets)
       - `Recommendation`
       - `Select Option` button (activating the radio option directly from the matrix)

2. **Blast-Radius Chips & Mini Stage-Graph Context Strip:**
   - Above the options, render interactive chips:
     - Files chip: `📄 files: <file1>, <file2>`
     - Stages chip: `⏳ holds: stage <n> (<state>)`
     - Tickets chip: `🎯 blocks: <ticket1>, <ticket2>`
   - A compact mini SVG stage-graph (height: 48px) displaying the chain context: previous stage -> held stage (pulsing purple `?`) -> next downstream stage.

3. **Keyboard Navigation & High-Craft UX:**
   - Global keydown listener on document:
     - If active element is `input`, `textarea`, or `select`, ignore navigation shortcuts.
     - `1`–`9`: Select option 1 through 9.
     - `[` / `Alt+Left`: Navigate to previous decision step.
     - `]` / `Alt+Right`: Navigate to next decision step.
     - `?`: Open keyboard shortcuts dialog (`<dialog id="shortcuts-dlg">`).
     - `/`: Focus the decision search input.
     - `Escape`: Close any open dialog modal.
   - Search/filter input in `<header>` when `SET.decisions.length > 1`: filters decision buttons in the progress list and allows quick jump.

4. **Review Screen Dashboard & Command Copy:**
   - Summary Metric Dashboard:
     - Total decisions, Answered count (green badge), Custom count (blue badge), Deferred/Explain count (amber badge), Incomplete count.
     - Blast Radius Summary: Total unique files impacted across all choices, total stages held, total tickets unblocked.
   - Command Copy Action:
     - Generates exact `sh relay-morpheus.sh <runId> answer Qk '<answer>'` lines using `answersToCommands` logic.
     - Renders a `<pre class="cmd-box">` with a "Copy relay-morpheus commands" button.
     - Uses `navigator.clipboard.writeText` with textarea fallback, updating button text to "Copied!" for 2 seconds.

5. **Security & Governance Invariants:**
   - All text rendered via `textContent` or `document.createTextNode`. Zero `innerHTML` on any run/set data.
   - Recommendations are styled with distinct badges and listed first, but NEVER checked by default (`checked = null`).

## D3. Architecture & Domain Explorer (`scripts/understand.mjs`)

Inspired by Egonex-AI/Understand-Anything ("graphs that teach > graphs that impress"):

1. **Domain Extraction Engine (`extractDomainGraph`):**
   Extracts a multi-layered entity graph from `run` and optional `design`:
   - **Nodes:**
     - `stage`: `{ id: 'stage-1', n: 1, name: '...', state: 'landed'|'inflight'|..., owner, files, tickets, code }`
     - `file`: `{ id: 'file-shelf/books.py', path: 'shelf/books.py', module: 'shelf', stages: [1, 2] }`
     - `ticket`: `{ id: 'ticket-F39', ticket: 'F39', stages: [...], decisions: [...] }`
     - `decision`: `{ id: 'decision-Q1', k: 1, state: 'open'|'answered', question: '...', holds: [...], blocks: [...] }`
   - **Edges:**
     - Stage execution dependencies (`after:`, implicit final stage, replacement/bypass)
     - Stage to File touches (`stage` -> `file`)
     - Stage to Ticket implementation (`stage` -> `ticket`)
     - Decision to Stage holds (`decision` -> `stage`)
     - Decision to Ticket blocks (`decision` -> `ticket`)

2. **Self-Contained Interactive UI Layout:**
   - **Header Bar:** Run metadata, filter pills (Stages, Files, Tickets, Decisions), search input, Guided Tour toggle button.
   - **Main Split View:**
     - Left: Interactive SVG Graph Canvas with pan/zoom controls, semantic layer columns/clusters, color-coded node rectangles with status lamps.
     - Right: Node Inspector Drawer showing selected node details, state, why it matters, linked files, tickets, upstream dependencies, and downstream consumers.
   - **Guided Tour Engine ("Walkthrough"):**
     A floating Guided Tour drawer with 5 structured narrative steps:
     - *Step 1: Run Goal & Scope* (Focuses on Run header, chain driver, total stages)
     - *Step 2: Landed Work & Foundations* (Highlights landed stages with commit SHAs and verified files)
     - *Step 3: Active Gates & Parked Decisions* (Focuses on open decisions, levers, and held stages)
     - *Step 4: Pending Pipeline & Downstream Stages* (Highlights unblocked path to completion)
     - *Step 5: Architectural File Map* (Highlights modules and files modified across the run)
     Each step automatically selects and highlights the relevant nodes on the SVG canvas while dimming the rest.

3. **Offline & Self-Contained Deliverable:**
   Written to `.skillator/holo/<RUN-n>.understand.html`. Embedded JSON data island, pure CSS styling with light and dark theme variables, responsive layout down to mobile widths, and zero CDN dependencies.

## D4. CLI & SKILL.md Output Selection Integration (`holo.mjs`)

1. **CLI Positional Subcommands & Flags:**
   `parseArgs(argv)` in `holo.mjs` is enhanced to support:
   ```sh
   node holo.mjs [run] decision     # or --decision, --wizard
   node holo.mjs [run] anatomy      # or --anatomy
   node holo.mjs [run] md           # or --md
   node holo.mjs [run] understand   # or --understand
   ```
   Both positional subcommands (`decision`, `anatomy`, `md`, `understand`) and flag equivalents are accepted interchangeably.

2. **Decision Cards in Standard Pages:**
   Update `qCard` and `optionFlow` in `holo.mjs` to render the new architectural flow SVG and parallel-lane options, giving `RUN-n.html` and `RUN-n.artifact.html` the same high-craft visual clarity.

3. **SKILL.md Output-Picker Canon:**
   Update the interactive prompt table in `SKILL.md`:
   - Interactive options:
     1. `decision` — upgraded offline interactive Decision Wizard HTML (`.skillator/holo/<id>.wizard.html`)
     2. `understand` — interactive architecture & domain-knowledge explorer (`.skillator/holo/<id>.understand.html`)
     3. `anatomy` — isometric bench-machine view (`.skillator/holo/RUN-n.html` + linked wizard)
     4. `md` — Markdown with Mermaid diagrams (`.skillator/holo/RUN-n.md`)
   - `batch` is strictly documented as an internal automatic marathon end-batch flow (`relay-morpheus` triggered) and is NEVER presented in the interactive menu.

4. **Synchronization to Installed Skill Directory:**
   Every updated and created file under `plugin/skills/holo-r2d2/` (`SKILL.md`, `scripts/holo.mjs`, `scripts/wizard.mjs`, `scripts/understand.mjs`, `scripts/anatomy.test.mjs`) must be synced to `C:\Users\Ikran\.agy-sher\.gemini\antigravity-cli\skills\holo-r2d2\`.

## UI design

Read: offline HTML tools (wizard.html & understand.html) · product · developers & team leads · job understand run architecture & resolve parked gates · dials 3/2/8 · direction terminal-dense system tool · scene staff engineer unblocking a paused marathon on a laptop in a dim room

### 1. Orientation & Direction
- **Mode & Plan**: `build` (for brand-new `understand.html` architecture explorer) and `improve` (for upgraded `wizard.html` and `holo.mjs` decision cards) following `references/build.md §2` and `references/product-ui.md`.
- **Register**: Product. Usability, trust, and fast keyboard scannability lead. Familiarity is a deliberate feature here. System sans is permitted and preferred for all UI chrome; monospace is strictly reserved for literal code symbols, file paths, git SHAs, run IDs, and command strings (`Deliberate: mono for literal machine strings; tabular-nums for metrics`).
- **Dials**: VARIANCE: 3 (trust-first, conventional) · MOTION: 2 (state-change only, 150–200ms ease-out, zero ambient bounce, stilled under `prefers-reduced-motion`) · DENSITY: 8 (dense, dashboard-grade, architectural schematic).
- **Style Lane**: Minimalism (`Chose for you: style Minimalism` — crisp hairline borders, high-contrast semantic badges, zero heavy drop shadows or gradient text).
- **Critique Record**: `critique: self only (subagent UI design pass)` — verified against product register, zero saturated AI looks (no cream body, no untinted black with acid green, no newspaper broadsheet), zero banned typefaces, anti-modal bias maintained with inline disclosure and sticky sidebars.

### 2. The Signature: The Causal Conduit
**"The Causal Conduit: a unified directional conduit rail connecting trigger state, decision gate, option trade-off, and downstream blast radius identically across inline diagrams, comparison matrix columns, and the understand graph canvas."**

The Causal Conduit is the single systematic UX device tying all surfaces together:
1. **In Inline SVG Diagrams (`wizard.mjs` & `holo.mjs`)**: A directional conduit line (`.conduit-path`) connecting:
   - `[Now: Current State]` (neutral gray pill, `var(--bg)` fill, `var(--line)` stroke)
   - `->` Directional arrow marker (`#conduit-arrow`)
   - `[Decision Gate Qk]` (octagonal badge, amber `var(--warn)` or `var(--accent)`)
   - `->` Directional branch
   - `[Option Path]` (accent card with option label and `What this does`)
   - `->` Branching split into `[Pros / Does]` (emerald `var(--rec-bg)`) and `[Cons / Cost]` (coral `var(--warn-bg)`)
   - `->` Terminal conduit to `[Blast Radius Scope]` (file chips) and `[Downstream Unblocked]` (held stages / blocked tickets).
2. **In Side-by-Side Comparison Matrix (`wizard.mjs`)**: The conduit acts as the active column rail:
   - The column header carries the conduit node badge.
   - Selecting any option illuminates the entire column's vertical conduit border (`2px solid var(--accent)`) and tints the column background (`var(--sel)`), giving instant visual feedback of the active path.
3. **In the Understand Explorer (`understand.mjs`)**: The conduit acts as the interactive relationship bus:
   - Inter-lane Bezier paths link Stages -> Decision Gates -> Affected Files -> Linked Tickets.
   - Hovering or selecting any node energizes its incoming and outgoing conduit paths with active accent color (`var(--conduit-active)`) and directional stroke-dash animation (150ms), while dimming unrelated nodes to 30% opacity.

### 3. Visual Tokens & Craft (Color, Type, Spacing, Motion)
- **Color Strategy**: Restrained (tinted neutrals + one accent ≤10%, dedicated semantic status tokens).
  - **Light Theme**:
    - `--bg: #f6f8fa` (cool slate neutral, oklch(0.97 0.005 240))
    - `--card: #ffffff` (elevated white surface)
    - `--surface-alt: #eef2f6` (secondary grouped panels / lane background)
    - `--ink: #1f2328` (deep charcoal text, WCAG AAA > 12:1)
    - `--muted: #656d76` (cool secondary text, WCAG AA > 5.2:1)
    - `--line: #d0d7de` (crisp structural border, 3:1 non-text contrast)
    - `--accent: #0969da` (royal blue: active gates, primary triggers)
    - `--accent-ink: #ffffff`
    - `--rec: #1a7f37` (forest green: landed stages, pros, unblocked tickets)
    - `--rec-bg: #dafbe1` (soft green tint)
    - `--warn: #cf222e` (crimson red: cons, failed stages, parked hold)
    - `--warn-bg: #ffebe9` (soft red tint)
    - `--sel: #ddf4ff` (ice blue active row selection)
    - `--focus: #fd8c73` (high-contrast orange focus ring, WCAG 1.4.11 > 4.5:1)
    - `--conduit: #8c959f` (neutral SVG bus wire stroke)
    - `--conduit-active: #0969da` (energized conduit stroke)
  - **Dark Theme** (`:root[data-theme="dark"]` and `@media (prefers-color-scheme:dark)`):
    - `--bg: #0d1117` (deep dark slate, oklch(0.16 0.01 240))
    - `--card: #161b22` (elevated card surface)
    - `--surface-alt: #21262d` (secondary grouped panels / lanes)
    - `--ink: #f0f6fc` (bright text, WCAG AAA > 14:1)
    - `--muted: #8b949e` (secondary text, WCAG AA > 5.5:1)
    - `--line: #30363d` (dark structural border, 3:1 non-text contrast)
    - `--accent: #58a6ff` (bright royal blue)
    - `--accent-ink: #0d1117`
    - `--rec: #3fb950` (emerald green)
    - `--rec-bg: #11281a` (deep green tint)
    - `--warn: #f85149` (bright coral red)
    - `--warn-bg: #321617` (deep red tint)
    - `--sel: #182c44` (deep blue active selection)
    - `--focus: #f0883e` (high-contrast orange focus ring)
    - `--conduit: #484f58` (neutral SVG bus wire stroke)
    - `--conduit-active: #58a6ff` (energized conduit stroke)
- **Typography**:
  - UI chrome & text: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` (Product register exemption from reflex-reject list).
  - Code, IDs, SHAs, paths, commands: `ui-monospace, "SF Mono", Menlo, Consolas, monospace`.
  - Metrics and numbers: `font-variant-numeric: tabular-nums`.
  - Modular scale (ratio 1.15): 11px (micro tags), 13px (caption/meta), 15px (body text), 17px (card titles), 20px (section headers), 24px (app titles).
- **Spacing Rhythm**: Strict 4px base scale (4px, 8px, 12px, 16px, 24px, 32px, 48px).
- **Motion Character**:
  - 150ms–200ms ease-out (`cubic-bezier(0.16, 1, 0.3, 1)`). State-change only. Zero ambient pulse when motion is reduced.
  - `@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; scroll-behavior: auto !important; } }`.

### 4. Surfaces & Layout Hierarchy

#### A. Understand Architecture Explorer (`.skillator/holo/<RUN-n>.understand.html`)
- **Layout Structure**:
  - Header (52px height, sticky top): Run ID badge `[RUN-12]`, title, Filter segment chips (`[Stages: 8]`, `[Files: 14]`, `[Tickets: 3]`, `[Decisions: 2]`), instant search input (`/` focus), and `[Guided Tour]` button.
  - Main Area (Two-column layout, 70% canvas / 30% inspector):
    - Left Canvas: Interactive multi-lane SVG schematic (`#understand-canvas`):
      - Lane 1: Pipeline Stages (sequential stations, colored by state: landed green, inflight amber pulsing, parked purple, pending gray).
      - Lane 2: Active Decision Gates (`Q1`, `Q2`).
      - Lane 3: Modified Files / Modules (grouped by top-level module directory).
      - Lane 4: Target Tickets (`F39`, `F42`).
      - Inter-lane Causal Conduit curves connecting related nodes.
    - Right Inspector Drawer (sticky, width 360px):
      - Header with node type, title, and status pill.
      - "Why it matters" narrative explanation block.
      - Inbound triggers (who causes/precedes this).
      - Outbound blast radius (files modified, stages held, tickets blocked).
      - Quick-filter link buttons to isolate connected entities.
  - Guided Tour Deck (floating overlay in bottom right, 400px width, z-index 20):
    - 5 structured steps (`Step X of 5`):
      1. Run Goal & Scope
      2. Landed Foundations
      3. Active Gates & Decisions
      4. Pending Pipeline
      5. Architectural File Map
    - Card displays step narrative, auto-highlights relevant nodes on canvas, provides `[Previous]`, `[Next]`, and `[Exit]` controls.

```
+------------------------------------------------------------------------------------------+
| RUN-12: Decision Support  [Stages 8] [Files 14] [Tickets 3] [Decisions 2]  [/ Filter] [Tour] |
+------------------------------------------------------------------+-----------------------+
|  CANVAS (70%)                                                    |  INSPECTOR (30%)      |
|  [Stages Lane]                                                   |  Node: Stage 3        |
|  [ 1: Init (x) ] ===> [ 2: Inflight (~) ] ===> [ 3: Parked (?) ] |  Status: Parked on Q1 |
|          |                                              |        |  Why it matters:      |
|          v                                              v        |  Holds schema change  |
|  [Decision Gates Lane]                                           |  Inbound: Stage 2     |
|          +-----------------------------------> [ Gate Q1 ]       |  Outbound: 4 files    |
|                                                     |            |  - src/db.mjs         |
|  [Files / Modules Lane]                             v            |  - src/schema.sql     |
|  [ file: src/db.mjs ] <-----------------------------+            |  Blocked Tickets:     |
|  [ file: src/schema.sql ] <-------------------------+            |  - F42                |
+------------------------------------------------------------------+-----------------------+
|                                    [Tour Deck: Step 3/5 - Active Gates | < Prev | Next > ] |
+------------------------------------------------------------------------------------------+
```

#### B. Upgraded Decision Wizard (`.skillator/holo/<id>.wizard.html`)
- **Layout Structure**:
  - Top Bar: Set identifier, run title, Progress bar (`3 of 4 answered`), multi-decision search bar (`/` key), navigation step pills.
  - Sub-header Context Bar:
    - Blast-radius summary chips: `📄 4 files impacted` · `⏳ holds stage 3` · `🎯 blocks F42`.
    - Mini Stage-Graph Context Strip: Compact 44px SVG showing `Stage 2 [landed]` -> `Stage 3 [? Q1]` -> `Stage 4 [pending]`.
    - View Mode Switcher: Segmented toggle `[☵ Flow View] | [⊞ Matrix View]`.
  - Content Area:
    - **Flow View**:
      - Inline SVG single-option architectural diagram (`Now` -> `Q1` -> `does` -> `pros/cons` -> `files` -> `unblocks`).
      - Option cards with radio selector, badge, pros chip (green), cons chip (red), and optional explanation block.
      - Custom direction input field and Defer/Discuss expander.
    - **Side-by-Side Comparison Matrix View**:
      - Responsive horizontal scroll table comparing all options side by side.
      - Rows:
        - `Action / Does`: concise summary of execution flow.
        - `Pros`: structural benefits.
        - `Cons & Trade-offs`: costs and limitations.
        - `Blast Radius`: specific files touched, held stages, blocked tickets.
        - `Recommendation`: badge indicator.
        - `Select`: button setting active choice and highlighting the column conduit.
    - Keyboard Shortcuts Dialog (`?` key): `<dialog id="shortcuts-dlg">` documenting `1`–`9`, `[`/`]`, `?`, `/`, `Escape`.
  - Review Screen:
    - Summary Metrics Dashboard: 4 cards (`Answered [N]`, `Custom Directions [N]`, `Deferred / Explain [N]`, `Incomplete [N]`).
    - Blast-Radius Rollup: Aggregated impact table across all decisions.
    - One-Click Command Copy Box: Syntax-highlighted `<pre class="cmd-box">` with copy button, clipboard write, and transient "Copied!" feedback badge.

```
+------------------------------------------------------------------------------------------+
| Decisions · RUN-12: Multi-Stage Migration               [Search Decisions /]  [Shortcuts ?]|
| [ Q1: Database Storage ]  [ Q2: Auth Protocol ]  [ Review & Export ]                     |
| Progress: [===============================>          ] 1 of 2 answered                    |
+------------------------------------------------------------------------------------------+
| Context: [ 📄 3 files ] [ ⏳ holds stage 2 ] [ 🎯 blocks F39 ]     [ View: ☵ Flow | ⊞ Matrix ] |
| Mini-Graph: [ Stage 1 (landed) ] =====> [ Stage 2 (? Q1) ] =====> [ Stage 3 (pending) ]   |
+------------------------------------------------------------------------------------------+
| MATRIX VIEW                                                                              |
| Attribute          | Option 1 (Recommended)    | Option 2                | Custom        |
|--------------------+---------------------------+-------------------------+---------------|
| Action             | SQLite Embedded           | PostgreSQL Service      | User Defined  |
| Pros               | Zero daemon setup         | High concurrent writes  | Bespoke       |
| Cons & Trade-offs  | Single writer bottleneck  | Requires running daemon | Unchecked     |
| Blast Radius       | 2 files, unblocks Stage 2 | 5 files, unblocks St. 2 | Unknown       |
| Recommendation     | [ Recommended ]           | -                       | -             |
| Selection          | ( ) Select Option 1 [1]   | ( ) Select Option 2 [2] | ( ) Custom    |
+------------------------------------------------------------------------------------------+
```

#### C. Decision Cards on `RUN-n.html` and `RUN-n.artifact.html` (`holo.mjs`)
- `qCard` and `optionFlow` upgraded with SVG Causal Conduit diagrams and parallel-lane comparisons matching the wizard's styling and theme token bindings.

### 5. Scale Tests & State Coverage (The 12-Cell Matrix)
- **4 Data Volumes**:
  - **Zero**: Empty state for search filters ("No matching nodes or decisions"), empty state for settled decisions ("No prior settled decisions").
  - **One**: Single decision, single stage, single file (singular wording, e.g. "1 file", never "1 files").
  - **Typical**: 4–12 stages, 2–4 open decisions, 10–25 files, 2–5 tickets (clean balanced spacing, zero overlap).
  - **Thousands / Large**: Runs with 50+ stages and 200+ files (canvas handles pan/zoom and viewport clipping, sticky headers preserve filter context, search narrows focus immediately).
- **3 Conditions**:
  - **Loading**: Pre-rendered static HTML with SVG embedded in initial payload (zero skeleton flash, instantaneous render).
  - **Error**: In-place alert banners (`.err-banner`) with specific recovery actions (e.g. invalid JSON import, unselected required questions before finalization).
  - **No-permission**: Offline standalone execution (explicit guidance that commands must be executed in CLI terminal).
- **8 Element States** (Hover ≠ Focus):
  - Every interactive control (`button`, `input`, `a`, `summary`, `[tabindex]`) explicitly defines: `default`, `hover`, `focus`, `active`, `disabled`, `loading`, `error`, `success`.

### 6. Accessibility Floor (Non-Negotiable)
- **Contrast**:
  - Body text on background: ≥ 12:1 in both light (`#1f2328` on `#f6f8fa`) and dark (`#f0f6fc` on `#0d1117`).
  - Secondary text (`--muted`): ≥ 5.2:1 in light (`#656d76`), ≥ 5.5:1 in dark (`#8b949e`).
  - Non-text contrast: ≥ 3:1 on all input borders, conduit lines, and state badges.
- **Focus Ring**: Visible `outline: 3px solid var(--focus); outline-offset: 2px` on all focused controls (`--focus: #fd8c73` light, `#f0883e` dark). Hover states never use focus styling.
- **Touch & Pointer Targets**: Minimum 44px by 44px on touch; minimum 28px on desktop click targets with generous hitboxes.
- **Keyboard Drivability**:
  - DOM source order strictly matches visual tab order. Skip link (`<a class="skip" href="#main">Skip to main content</a>`) present at page start.
  - Shortcuts `1`–`9`, `[`/`]`, `?`, `/` disabled when any `input`, `textarea`, or `select` is focused.
  - `Escape` closes any open dialog (`#shortcuts-dlg`) or Guided Tour deck.
- **Screen Reader Semantics**:
  - Pure SVG diagrams carry `role="img"` with `<title>` and `<desc>`.
  - Dynamic status changes (e.g. "Commands copied to clipboard", filter result counts) announced via `aria-live="polite"`.
  - Matrix view renders semantic `<table>`, `<th scope="col">`, `<th scope="row">`, and `<caption>`.
- **Motion Reduction**:
  - All transitions and animations stilled under `prefers-reduced-motion: reduce`.
  - Pulsing gate lamps and conduit dash animations stilled to static 35% opacity.

# CONSTRAINTS

- Zero external npm or CDN dependencies: Every generated HTML file (`.wizard.html`, `.understand.html`, `.html`, `.artifact.html`) must run completely self-contained and offline.
- XSS Prevention Invariant: Never use `innerHTML` or `outerHTML` on user input, run markdown content, or decision set strings. Always use `textContent`, `document.createElement`, and `document.createElementNS`.
- Recommendation Neutrality: Recommendations must be clearly labeled and positioned first, but never pre-selected in HTML form controls.
- Automatic Batch Isolation: `--batch` must strictly remain an automatic internal runner mode for marathon end batches; never prompt or offer `--batch` in interactive user menus.
- Exact File Locations & In-Sync Installation:
  - Source: `C:\tools\Projects\skillator2\plugin\skills\holo-r2d2\`
  - Target: `C:\Users\Ikran\.agy-sher\.gemini\antigravity-cli\skills\holo-r2d2\`
  Every change made in source must be mirrored to the target.

# TASKS

### Task 1: Create `plugin/skills/holo-r2d2/scripts/understand.mjs` [build=medium]
SATISFIES: R12, R13, R14, R17

**Files:**
- Create: `plugin/skills/holo-r2d2/scripts/understand.mjs`
- Test:   `plugin/skills/holo-r2d2/scripts/anatomy.test.mjs`

**Interfaces:**
- Consumes: `parseRun(md, holds)` and `parseDesign(md)` from `./holo.mjs`
- Produces:
  - `export function extractDomainGraph(run, design = null): { nodes: Array<Object>, edges: Array<Object>, summary: Object }`
  - `export function understandPage(run, opts = {}): string` (full self-contained HTML page)

- [ ] Step 1: Write failing test in `anatomy.test.mjs` checking `extractDomainGraph` and `understandPage`.
```javascript
// in plugin/skills/holo-r2d2/scripts/anatomy.test.mjs
test("understand mode: extractDomainGraph produces stages, files, tickets, decisions and valid HTML", () => {
  const run = parseRun(FIXTURES["all states"]);
  const graph = extractDomainGraph(run);
  assert.ok(graph.nodes.some(n => n.kind === "stage" && n.n === 1));
  assert.ok(graph.nodes.some(n => n.kind === "decision" && n.id === "Q1"));
  assert.ok(graph.nodes.some(n => n.kind === "file"));
  assert.ok(graph.edges.length > 0);
  const html = understandPage(run, { runPath: "fixture-all-states.md" });
  assert.ok(html.includes("<!doctype html>"));
  assert.ok(html.includes('id="understand-data"'));
  assert.ok(html.includes("Guided Tour"));
  assert.ok(html.includes("node-inspector"));
  assert.ok(!html.includes("<script src="));
});
```
- [ ] Step 2: Run test and confirm failure.
```powershell
node --test plugin/skills/holo-r2d2/scripts/anatomy.test.mjs
# Expected failure: Cannot find module './understand.mjs' or extractDomainGraph is not defined
```
- [ ] Step 3: Implement `plugin/skills/holo-r2d2/scripts/understand.mjs` matching the Causal Conduit UI design.
  - Implement `extractDomainGraph(run, design)`:
    - Map stages to nodes (`id: 'stage-' + s.n`, `kind: 'stage'`, state, files, tickets).
    - Map files to nodes (`id: 'file-' + f`, `kind: 'file'`, module, stages).
    - Map tickets to nodes (`id: 'ticket-' + t`, `kind: 'ticket'`, stages, decisions).
    - Map decisions to nodes (`id: 'decision-' + q.id`, `kind: 'decision'`, question, state, holds, blocks).
    - Map edges: stage execution (`after`, `implicit`, `replacement`), file references, ticket references, decision holds/blocks.
    - Compute summary stats (stages by state, total files, open decisions).
  - Implement `understandPage(run, opts)` rendering self-contained offline HTML/SVG:
    - Structure header (`.understand-head`): Run badge `[RUN-12]`, title, filter button pills (`.filter-pill[data-filter="all|stage|gate|file|ticket"]`), instant search input (`#understand-search` with `/` shortcut), and Guided Tour trigger (`#btn-tour`).
    - Render main area (`.understand-main`):
      - Left SVG canvas (`#understand-canvas`, 70% width, min 540px) structured into 4 semantic lanes:
        - Stages Lane (`.lane-stages`): Station nodes with state lamps (`.node-landed` green, `.node-inflight` pulsing amber, `.node-parked` purple, `.node-pending` gray).
        - Decision Gates Lane (`.lane-gates`): Octagonal Q gate nodes (`.node-gate`).
        - Files / Modules Lane (`.lane-files`): Module-grouped file pills (`.node-file`).
        - Tickets Lane (`.lane-tickets`): Target ticket chips (`.node-ticket`).
        - Inter-lane Causal Conduit curves (`path.conduit-path`) with `#conduit-arrow` markers connecting stages -> gates -> files -> tickets.
      - Right Inspector Drawer (`#node-inspector`, 30% width, sticky sidebar):
        - Selected node title, category tag, and status lamp.
        - "Why it matters" narrative explanation block (`.why-block`).
        - Two-column conduit chips for Inbound Causes (`.inbound-chips`) and Outbound Blast Radius (`.outbound-chips`).
        - Quick-jump filter buttons to isolate connected nodes on canvas.
    - Render Guided Tour Deck (`#guided-tour-deck`): Pinned floating card (bottom right, 400px width, z-index 20) with 5 narrative walkthrough steps:
      - Step 1: Run Goal & Scope (highlights run header & driver)
      - Step 2: Landed Foundations (highlights landed stages & files)
      - Step 3: Active Gates & Decisions (highlights open Qs and held stages)
      - Step 4: Pending Pipeline (highlights downstream unblocked path)
      - Step 5: Architectural File Map (highlights module clusters)
      - Auto-dimming: Sets `.tour-dim` (opacity 0.2) on inactive nodes; provides `[← Prev]`, `[Next →]`, and `[✕ Exit]` controls.
    - Client event engine:
      - Real-time search filter with debouncing (100ms) and live result count announcement (`aria-live="polite"`).
      - Keyboard listener: `/` focuses search, `Escape` closes tour or inspector, `ArrowLeft`/`ArrowRight` navigates tour steps.
      - Node click selection: Energizes connected conduit paths with animated pulse.
      - Strict XSS safety: Pure `textContent`, `document.createElement`, `document.createElementNS`. Zero `innerHTML`.
      - Offline CSS: Light and dark theme tokens (`:root`, `:root[data-theme="dark"]`, `@media (prefers-color-scheme:dark)`), 3px `--focus` ring, touch targets ≥44px, and stilled animations under `prefers-reduced-motion: reduce`.
- [ ] Step 4: Run test and confirm it passes.
```powershell
node --test plugin/skills/holo-r2d2/scripts/anatomy.test.mjs
```
- [ ] Step 5: Verify syntax and exports.
```powershell
node -e "import('./plugin/skills/holo-r2d2/scripts/understand.mjs').then(m => console.log('understand.mjs loaded successfully'))"
```

---

### Task 2: Upgrade `plugin/skills/holo-r2d2/scripts/wizard.mjs` [build=medium]
SATISFIES: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R17

**Files:**
- Modify: `plugin/skills/holo-r2d2/scripts/wizard.mjs`
- Test:   `plugin/skills/holo-r2d2/scripts/anatomy.test.mjs`

**Interfaces:**
- Consumes: `SET_SCHEMA`, `ANSWER_SCHEMA`, `setFromRun`, `checkSet`, `answersToCommands`
- Produces:
  - `export function renderArchitecturalSvg(step, option, label): string`
  - `export function renderParallelLanesSvg(decision, options, label): string`
  - Upgraded `wizardPage(set)` client script and CSS with:
    - Side-by-Side Comparison Matrix toggle
    - Blast-radius chips and mini stage-graph strip
    - Keyboard navigation shortcuts (`1`–`9`, `[`/`]`, `?`, `/`, `Alt+Left/Right`)
    - Search/filter input across decisions
    - Summary metrics dashboard on review screen
    - One-click copy `relay-morpheus` answer commands button

- [ ] Step 1: Write failing test in `anatomy.test.mjs` verifying wizard upgrades.
```javascript
test("wizard upgrades: block diagrams, parallel lanes, matrix view, keyboard shortcuts, review command copy", () => {
  const run = parseRun(FIXTURES["two qs"]);
  const set = setFromRun(run, "repo-two-qs/_run.md");
  const html = wizardPage(set);
  assert.ok(html.includes("comparison-matrix"), "matrix view container included");
  assert.ok(html.includes("blast-radius"), "blast radius chips included");
  assert.ok(html.includes("mini-stage-graph"), "mini stage-graph strip included");
  assert.ok(html.includes("shortcuts-dlg"), "keyboard shortcuts dialog included");
  assert.ok(html.includes("copy-cmds"), "copy commands button included on review screen");
  assert.ok(html.includes("dashboard-summary"), "review dashboard summary included");
  assert.ok(!html.includes("innerHTML"), "no innerHTML usage in wizard code");
});
```
- [ ] Step 2: Run test and confirm failure.
```powershell
node --test plugin/skills/holo-r2d2/scripts/anatomy.test.mjs
# Expected failure: comparison-matrix, blast-radius, shortcuts-dlg not found in html
```
- [ ] Step 3: Implement upgrades in `plugin/skills/holo-r2d2/scripts/wizard.mjs` matching the Causal Conduit UI design.
  - Implement inline SVG generators in client script:
    - `renderArchitecturalSvg(step, option, label)`: Generates single-option Causal Conduit diagram (`Now` input box -> `Gate Qk` diamond -> `Option Path` box -> `Pros / Cons` dual pills -> `Impact Scope` -> `Downstream Unblock`).
    - `renderParallelLanesSvg(decision, options, label)`: Generates multi-lane parallel SVG diagram comparing all options as parallel conduit lanes stemming from gate `Qk`.
  - Upgrade `stepView`:
    - Add view mode toggle button (`#view-mode-toggle`): Segmented control `[☵ Flow View] | [⊞ Matrix View]` managing visibility between the option cards and the comparison matrix.
    - Add blast-radius interactive chip strip (`.blast-radius-chips`): Renders chips for impacted files, held stages, and blocked tickets.
    - Add mini stage-graph strip (`.mini-stage-graph` SVG): 44px height SVG showing previous stage -> held stage (`?` badge) -> next stage.
    - Add Side-by-Side Comparison Matrix (`.comparison-matrix` table):
      - Semantic `<table>` with `<caption>`, `<th scope="col">` for attributes and each option.
      - Rows: `Action / Does`, `Pros`, `Cons & Trade-offs`, `Blast Radius`, `Recommendation` (`.rec-badge`), `Select Option` button (`.btn-select-opt`).
      - Column active state: When an option is selected, the column gets `.col-active` (`border: 2px solid var(--accent); background: var(--sel)`).
  - Add global keyboard navigation listener:
    - Checks `!['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)`.
    - `1`–`9`: Previews/selects option 1 through 9.
    - `[` / `]` or `Alt+Left`/`Alt+Right`: Navigates to previous / next decision step.
    - `?`: Opens `<dialog id="shortcuts-dlg">` (shortcuts cheat-sheet modal).
    - `/`: Focuses multi-decision search bar (`#decision-search`).
    - `Escape`: Closes any open `<dialog>` modal.
  - Add multi-decision search bar (`#decision-search`) in `<header>` when `SET.decisions.length > 1`, filtering decision step buttons in real-time.
  - Upgrade `review()`:
    - Add summary metrics dashboard (`.dashboard-summary`): 4 cards with count badges (`Answered` [green `.b-answered`], `Custom Directions` [blue `.b-custom`], `Deferred / Explain` [amber `.b-deferred`], `Incomplete` [muted `.b-incomplete`]).
    - Add blast-radius summary card (`.blast-summary-card`): Aggregated unique files, stages held, tickets unblocked across all answers.
    - Add one-click copy relay commands:
      - `<pre class="cmd-box"><code>` containing formatted `sh relay-morpheus.sh <id> answer Qk '<answer>'` lines.
      - `#btn-copy-cmds` button calling `navigator.clipboard.writeText` with textarea fallback.
      - Transient visual feedback: Button swaps to `✓ Copied!` with green border for 2000ms.
  - Maintain strict XSS safety (`textContent`, `createElementNS`), recommendation neutrality (unselected radios), light/dark themes (`:root`, `:root[data-theme="dark"]`, `@media (prefers-color-scheme:dark)`), 3px `--focus` ring, touch targets ≥44px, and stilled animations under `prefers-reduced-motion: reduce`.
- [ ] Step 4: Run test and confirm it passes.
```powershell
node --test plugin/skills/holo-r2d2/scripts/anatomy.test.mjs
```
- [ ] Step 5: Verify self-contained syntax.
```powershell
node -e "import('./plugin/skills/holo-r2d2/scripts/wizard.mjs').then(m => console.log('wizard.mjs loaded successfully'))"
```

---

### Task 3: Wire `holo.mjs`, Card Diagrams, `SKILL.md`, and Installed Skill Sync [build=medium]
SATISFIES: R1, R2, R11, R15, R16, R17, R18, R19

**Files:**
- Modify: `plugin/skills/holo-r2d2/scripts/holo.mjs`
- Modify: `plugin/skills/holo-r2d2/SKILL.md`
- Modify: `plugin/skills/holo-r2d2/scripts/anatomy.test.mjs`
- Sync:   `C:\Users\Ikran\.agy-sher\.gemini\antigravity-cli\skills\holo-r2d2\`

**Interfaces:**
- Consumes: `understandPage` from `./understand.mjs`, `wizardPage` from `./wizard.mjs`
- Produces:
  - First-class subcommand routing in `parseArgs` and `main`: `decision`, `anatomy`, `md`, `understand`, `html`, `svg`, `ascii`.
  - Upgraded `qCard` and `optionFlow` rendering architectural flow SVG and parallel lanes.
  - Extended `holo.mjs --selftest` verifying all modes and SVG block diagrams.
  - Synchronized installed skill directory under `C:\Users\Ikran\.agy-sher\.gemini\antigravity-cli\skills\holo-r2d2\`.

- [ ] Step 1: Write failing test in `anatomy.test.mjs` and selftest assertions in `holo.mjs`.
```javascript
// in anatomy.test.mjs
test("cli subcommands: parseArgs accepts positional modes decision, anatomy, md, understand", () => {
  assert.equal(parseArgs(["RUN-1", "decision"]).mode, "wizard");
  assert.equal(parseArgs(["RUN-1", "anatomy"]).anatomy, true);
  assert.equal(parseArgs(["RUN-1", "md"]).mode, "md");
  assert.equal(parseArgs(["RUN-1", "understand"]).mode, "understand");
  assert.equal(parseArgs(["RUN-1", "--understand"]).mode, "understand");
});
```
- [ ] Step 2: Run test and confirm failure.
```powershell
node --test plugin/skills/holo-r2d2/scripts/anatomy.test.mjs
# Expected failure: parseArgs unknown positional mode or unexpected mode
```
- [ ] Step 3: Implement updates in `plugin/skills/holo-r2d2/scripts/holo.mjs` and `SKILL.md` matching the Causal Conduit UI design.
  - In `holo.mjs`:
    - Import `understandPage` from `./understand.mjs`.
    - Update `parseArgs`:
      - Recognize subcommands: if positional arg matches `decision`, `wizard`, `anatomy`, `md`, `understand`, `html`, `svg`, `ascii`, set appropriate mode.
      - Recognize flag `--understand`.
    - Update `main()`:
      - If `o.mode === "understand"`, generate `.skillator/holo/<RUN-n>.understand.html` using `understandPage(run, opts)` and print full absolute path.
    - Upgrade `qCard` and `optionFlow` in `holo.mjs`:
      - Render inline SVG architectural flow diagram with Causal Conduit styling (`now` -> `Qk` -> `does` -> `tradeoff` -> `scope` -> `unblocks`).
      - Render parallel-lane visual option comparison diagram with matching theme tokens (`--conduit`, `--conduit-active`, `--rec`, `--warn`, `--accent`).
    - Extend `selftest()`:
      - Test positional mode parsing for `decision`, `anatomy`, `md`, `understand`.
      - Test understand page generation and data island.
      - Test upgraded block diagrams in decision rendering.
  - In `SKILL.md`:
    - Update Command table to list the 4 first-class modes: `decision`, `anatomy`, `md`, `understand`.
    - Update output selection matrix: remove `batch` from interactive choices; explicitly state `--batch` is strictly an automatic marathon end-batch flow.
    - Document the new keyboard shortcuts and review screen command copy features.
  - Synchronize all files to `C:\Users\Ikran\.agy-sher\.gemini\antigravity-cli\skills\holo-r2d2\`:
    - Copy `SKILL.md`, `scripts/holo.mjs`, `scripts/wizard.mjs`, `scripts/understand.mjs`, `scripts/anatomy.test.mjs`.
- [ ] Step 4: Run both test suites and verify green.
```powershell
node plugin/skills/holo-r2d2/scripts/holo.mjs --selftest
node --test plugin/skills/holo-r2d2/scripts/anatomy.test.mjs
```
- [ ] Step 5: Verify installed copy runs selftest cleanly.
```powershell
node C:\Users\Ikran\.agy-sher\.gemini\antigravity-cli\skills\holo-r2d2\scripts\holo.mjs --selftest
node --test C:\Users\Ikran\.agy-sher\.gemini\antigravity-cli\skills\holo-r2d2\scripts\anatomy.test.mjs
```

# TRACE

| Req | Short Form | Implementation Path:Symbol | Test Path:Test Name |
|---|---|---|---|
| R1 | Single-Option Architectural Flow SVG | `plugin/skills/holo-r2d2/scripts/wizard.mjs:renderArchitecturalSvg` | `plugin/skills/holo-r2d2/scripts/anatomy.test.mjs:wizard upgrades: block diagrams, parallel lanes, matrix view, keyboard shortcuts, review command copy` |
| R2 | Parallel-Lane Option Comparison SVG | `plugin/skills/holo-r2d2/scripts/wizard.mjs:renderParallelLanesSvg` | `plugin/skills/holo-r2d2/scripts/anatomy.test.mjs:wizard upgrades: block diagrams, parallel lanes, matrix view, keyboard shortcuts, review command copy` |
| R3 | Side-by-Side Comparison Matrix | `plugin/skills/holo-r2d2/scripts/wizard.mjs:stepView` | `plugin/skills/holo-r2d2/scripts/anatomy.test.mjs:wizard upgrades: block diagrams, parallel lanes, matrix view, keyboard shortcuts, review command copy` |
| R4 | Blast-Radius Badges & Chips | `plugin/skills/holo-r2d2/scripts/wizard.mjs:stepView` | `plugin/skills/holo-r2d2/scripts/anatomy.test.mjs:wizard upgrades: block diagrams, parallel lanes, matrix view, keyboard shortcuts, review command copy` |
| R5 | Mini Stage-Graph Context Strip | `plugin/skills/holo-r2d2/scripts/wizard.mjs:stepView` | `plugin/skills/holo-r2d2/scripts/anatomy.test.mjs:wizard upgrades: block diagrams, parallel lanes, matrix view, keyboard shortcuts, review command copy` |
| R6 | Keyboard-First UX (1-9, [], ?, /) | `plugin/skills/holo-r2d2/scripts/wizard.mjs:CLIENT` | `plugin/skills/holo-r2d2/scripts/anatomy.test.mjs:wizard upgrades: block diagrams, parallel lanes, matrix view, keyboard shortcuts, review command copy` |
| R7 | Multi-Decision Search & Filter | `plugin/skills/holo-r2d2/scripts/wizard.mjs:header` | `plugin/skills/holo-r2d2/scripts/anatomy.test.mjs:wizard upgrades: block diagrams, parallel lanes, matrix view, keyboard shortcuts, review command copy` |
| R8 | Review Dashboard Summary Metrics | `plugin/skills/holo-r2d2/scripts/wizard.mjs:review` | `plugin/skills/holo-r2d2/scripts/anatomy.test.mjs:wizard upgrades: block diagrams, parallel lanes, matrix view, keyboard shortcuts, review command copy` |
| R9 | One-Click Copy Relay Commands | `plugin/skills/holo-r2d2/scripts/wizard.mjs:review` | `plugin/skills/holo-r2d2/scripts/anatomy.test.mjs:wizard upgrades: block diagrams, parallel lanes, matrix view, keyboard shortcuts, review command copy` |
| R10 | Strict XSS Safety & Unselected Recs | `plugin/skills/holo-r2d2/scripts/wizard.mjs:CLIENT` | `plugin/skills/holo-r2d2/scripts/anatomy.test.mjs:wizard upgrades: block diagrams, parallel lanes, matrix view, keyboard shortcuts, review command copy` |
| R11 | First-Class CLI Subcommands & Flags | `plugin/skills/holo-r2d2/scripts/holo.mjs:parseArgs` | `plugin/skills/holo-r2d2/scripts/anatomy.test.mjs:cli subcommands: parseArgs accepts positional modes decision, anatomy, md, understand` |
| R12 | Understand Mode Script & HTML Output | `plugin/skills/holo-r2d2/scripts/understand.mjs:understandPage` | `plugin/skills/holo-r2d2/scripts/anatomy.test.mjs:understand mode: extractDomainGraph produces stages, files, tickets, decisions and valid HTML` |
| R13 | Semantic Domain Grouping & Inspector | `plugin/skills/holo-r2d2/scripts/understand.mjs:extractDomainGraph` | `plugin/skills/holo-r2d2/scripts/anatomy.test.mjs:understand mode: extractDomainGraph produces stages, files, tickets, decisions and valid HTML` |
| R14 | Guided Tour Walkthrough Engine | `plugin/skills/holo-r2d2/scripts/understand.mjs:CLIENT` | `plugin/skills/holo-r2d2/scripts/anatomy.test.mjs:understand mode: extractDomainGraph produces stages, files, tickets, decisions and valid HTML` |
| R15 | Upgraded Decision Cards in holo.mjs | `plugin/skills/holo-r2d2/scripts/holo.mjs:qCard` | `plugin/skills/holo-r2d2/scripts/holo.mjs:selftest` |
| R16 | SKILL.md Output Modes & Batch Policy | `plugin/skills/holo-r2d2/SKILL.md:## Pick the output` | `plugin/skills/holo-r2d2/scripts/holo.mjs:selftest` |
| R17 | Offline Zero-Dep & Theme Compliance | `plugin/skills/holo-r2d2/scripts/understand.mjs:CSS` | `plugin/skills/holo-r2d2/scripts/anatomy.test.mjs:page rules: both themes, offline, reduced motion stills it, ascii unchanged` |
| R18 | Extended Selftests & Test Suites | `plugin/skills/holo-r2d2/scripts/holo.mjs:selftest` | `plugin/skills/holo-r2d2/scripts/anatomy.test.mjs:cli subcommands: parseArgs accepts positional modes decision, anatomy, md, understand` |
| R19 | Installed Skill Copy Synchronization | `C:\Users\Ikran\.agy-sher\.gemini\antigravity-cli\skills\holo-r2d2\scripts\holo.mjs` | `plugin/skills/holo-r2d2/scripts/holo.mjs:selftest` |

# VERIFICATION

Execute the comprehensive test suites across both source repository and installed skill locations:

```powershell
node plugin/skills/holo-r2d2/scripts/holo.mjs --selftest
node --test plugin/skills/holo-r2d2/scripts/anatomy.test.mjs
node C:\Users\Ikran\.agy-sher\.gemini\antigravity-cli\skills\holo-r2d2\scripts\holo.mjs --selftest
node --test C:\Users\Ikran\.agy-sher\.gemini\antigravity-cli\skills\holo-r2d2\scripts\anatomy.test.mjs
```

Expected output:
- `selftest: ok` for both runs.
- All unit and integration subtests passing (0 failures, 0 errors).
- Clean generation of `.wizard.html`, `.understand.html`, `.html`, `.md`, and `.svg` files under `.skillator/holo/` without external network requests or script errors.

## Decisions

- Ruling: Create `plugin/skills/holo-r2d2/scripts/understand.mjs` as a modular sibling to `wizard.mjs` and `anatomy.mjs`. Inlining the architecture explorer into `holo.mjs` or `wizard.mjs` would overload existing workflows and break single-responsibility boundaries. Cost if wrong: Minimal file overhead, easily consolidated if ever needed.
- Ruling: Support positional mode subcommands (`decision`, `anatomy`, `md`, `understand`) alongside existing flags (`--decision`, `--wizard`, `--anatomy`, `--md`, `--understand`). Ensures CLI ergonomics match modern agent tooling ("holo RUN-12 understand") while preserving 100% backward compatibility with existing automated flags. Cost if wrong: Zero; both forms parse to identical internal configuration.
- Ruling: Strictly remove `batch` from manual interactive menus in `SKILL.md`. Batch is designed for headless/end-of-marathon execution where all artifacts are written at once; presenting it to interactive human users causes confusion with single-mode choices. Cost if wrong: None; automated callers still invoke `--batch` directly.
- Ruling: Clipboard API fallback for Review Screen Command Copy. In secure contexts `navigator.clipboard.writeText` is used; in non-secure or restricted file:// contexts a temporary hidden `<textarea>` with `document.execCommand('copy')` ensures copy commands always work offline without error. Cost if wrong: Zero; guarantees copy functionality across all browsers.

## Outcome

- **Implemented & Verified**:
  - Created `plugin/skills/holo-r2d2/scripts/understand.mjs` (`extractDomainGraph`, `understandPage`) implementing the Understand-Anything inspired 4-lane Causal Conduit architecture explorer (`.understand.html`) with interactive `#node-inspector`, `#understand-search`, `.filter-pill` toggles, and 5-step `#guided-tour-deck`.
  - Upgraded `plugin/skills/holo-r2d2/scripts/wizard.mjs` (`renderArchitecturalSvg`, `renderParallelLanesSvg`, `.comparison-matrix` toggle, `.blast-radius-chips`, `.mini-stage-graph`, keyboard shortcuts `1`-`9`, `[`/`]`, `?` `#shortcuts-dlg`, `/` `#decision-search`, Review screen `.dashboard-summary`, and one-click `#btn-copy-cmds` / `.copy-cmds`).
  - Upgraded `plugin/skills/holo-r2d2/scripts/holo.mjs`, `plugin/skills/holo-r2d2/SKILL.md`, and `plugin/skills/holo-r2d2/scripts/anatomy.test.mjs` with first-class positional and flag modes (`decision | anatomy | md | understand`), keeping `batch` strictly automatic, and synced all files to `C:\Users\Ikran\.agy-sher\.gemini\antigravity-cli\skills\holo-r2d2\`.
  - Verification: `holo.mjs --selftest` (`selftest: ok`) and `anatomy.test.mjs` (`11/11 pass`) in both source and installed skill directories.
