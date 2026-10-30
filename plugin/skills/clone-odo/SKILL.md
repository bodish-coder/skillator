---
name: clone-odo
description: >-
  Use before quoting or counting what users hate about an app - top
  complaints from reviews.csv or .skillator/clone/, quotes and counts
  for an investor or pitch, or review rows lacking a link. "Clone
  this app" (web, Android, iOS, Windows), "build my own version of X", "map
  X's screens", "how close is my clone", "rebrand the clone", or its URL,
  App Store, Google Play or Microsoft Store link. NOT for building screens
  (build-jarvis, design-arwen) or shipping (deploy-merlin, deploy-niyoj).
---

# clone-odo — clean-room cloning, with the station's security chief watching

A clone rebuilds what an app **does** — its features, its flows, the way a
user moves through it — and never what it **owns**: its code, its words, its
assets, its name. The recon map is the contract: every screen, flow and
feature is written down from public sources before a line is built, and the
build works from the map, never from the original. Building, design, testing
and deploy are other skills' work; this skill hands each one on, and the
guard below goes with every hand-off.

**Violating the letter of the guard is violating the spirit of it.**

## 0. The guard

1. **Public sources and the user's own account only.** Never log into an
   account that is not the user's, never ask for a password, never get past a
   paywall or a login by any trick.
2. **Reading, not scraping.** No crawlers, bulk downloads or loops. A browser
   tool on the user's own browser reads pages at human speed, with the user
   there.
3. **No source.** Not the original's HTML, CSS, JavaScript bundles, binaries
   or logged network calls — and a page the user saved from the original's
   site is its source. Public API docs are fine to read.
4. **Check the terms.** If the user's account is under terms that forbid
   building a competitor, say so and work from public sources only.
5. **Screenshots are reference.** They live in `.skillator/clone/screens/`,
   are compared against, and never ship.
6. **Test your clone, never theirs.** No load tests, fuzzing or scripts
   against the original's servers. Using it by hand, as a person, is fine.

This guard binds every skill the clone passes through: a build-jarvis task for
F<n> carries it, design-arwen carries it. **REQUIRED:** read
`references/clean-room.md` once per session — the original's **words** are as
off-limits as its code, and it says what to do when its source is sitting in
the project.

## 1. Where things live

Everything the clone plans lives in the user's project, in `.skillator/clone/`.
Create it at recon. Add `.skillator/clone/screens/` to `.gitignore` when the
repo is public — those are someone else's screenshots.

```
.skillator/clone/
  recon.md            the map (templates/recon-map.md, filled)
  features.csv        the matrix; one row per feature; must rows carry their F id in `ticket`
  screens/            the original's reference screenshots - never shipped
  original/           pages the user saved from the original - moved here, never opened
  clone-screens/      the clone's, same viewport, for imgdiff
  diffs/              imgdiff --json / --out
  bugs/               B<n>.md - a bug's steps and evidence; its board line points here
  reviews.csv         source,url,date,rating,text - copied exactly
  feedback.md         odo.sh reviews --out
  fixes.md            the three lists, the fix plan, the angle
  design/tokens.json  contrast's input (design-arwen writes it)
  brand.md brand.json avoid / domains / colors - sweep reads it; listing gets avoid via --avoid
  listing.json        listing's input
  parity.md           odo.sh parity --markdown
  preflight.md        the gate, filled, before any deploy
```

## 2. The recon map

Scope first: which app, which platform - web, Android, iOS or Windows, each
with its capture route and viewport (`references/recon.md` § Capture) - which
slice (default to the core loop, the one flow users pay for), and who the
clone is for. Propose answers and get a yes. Then fill `templates/recon-map.md` into `.skillator/clone/recon.md`, in
this order:

1. **Sources** — a table with a URL on every row: help center, pricing page,
   changelog, store listing, walkthrough videos, marketing site, the user's own
   account, public API docs.
2. **Screens** `S01..`, numbered by hand in the map, with route, purpose, key
   components and every state seen (empty, loading, error, mobile).
3. **Flows** `FL01..` — a goal and the screens it passes through, the
   happy-path click count, the edge cases. **FL, never F: F<n> is a ticket on
   this board.**
4. **Components** — every repeated UI part, its variants, states and screens.
5. **Inferred data model** — entities and fields, each with its evidence and a
   confidence (high, medium, guess).
6. **`features.csv`** — `feature,area,priority,original,clone,ticket,notes`;
   priority must / should / could; `clone` starts at `no`.
7. **What cannot be cloned** — `skip` rows with a reason: licensed content,
   the network and its users, data the app owns, partner deals, hardware,
   regulated licences.
8. **Size** — S (a weekend), M (weeks), L (a quarter), XL (rescope it), with
   the hard parts named.

Depth, the sources table and the edge-case list: `references/recon.md`. Close
with a five-line summary: the core loop, screen and flow counts, the three
hardest parts, what is out of scope, and the next step (§3).

## 3. Ticket the must-haves

After the matrix is written:

1. Count the `must` rows whose `original` is `yes` and `clone` is not `skip`: `n`.
2. `sh <practice>/scripts/next-id.sh --count <n> F` (Windows: `next-id.ps1`), one id per
   line, in matrix order.
3. Append to `## Features` of `TICKETS.md`, tickets-zordon's line format, title ≤ 60
   chars, the detail after the first `. `:
   `- [ ] F<n> — <feature, as in the matrix>. Clone of <app>, <area>, must (clone-odo FL<xx>, S<yy>). Done = the row's clone column is yes and <the FL case> passes. (@<tag>)`
4. Write the id into the row's `ticket` column. `should` / `could` rows stay on the
   matrix only until the must-haves are done, then get tickets the same way, on request.
5. `clone` flips `no → partial → yes` as build-jarvis closes the ticket; parity.py
   never reads `ticket` (extra columns are ignored - a test proves it stays that way).

`<practice>` is the `practice/` beside the installed skills, resolved the way
`skillator:tickets-zordon` resolves it. Never hand-number an F id.

## 4. Hand-offs

| What clone-odo passes | Skill | What comes back |
|---|---|---|
| Stack, schema, screens, auth, payments: one F ticket at a time, with its recon row, its FL case and the guard | `skillator:build-jarvis` | the screen built from the map, the row's `clone` flipped, the ticket closed |
| The design system and every screen's craft: the component list, the measured roles, the never-take list | `skillator:design-arwen` | `.skillator/clone/design/tokens.json` and the components, original assets only |
| Testing: PRACTICE §4-5, cases `FL<nn>-H<n>` / `-E<n>` / `-N<n>` from `templates/test-plan.md` | `skillator:screenshot-argus` for the drops | a passing suite; bugs on the board as `B<n>` through tickets-zordon, never a `bugs.md` |
| Deploy: `references/preflight.md` filled first, every row passing | `skillator:deploy-merlin` or `skillator:deploy-niyoj` | the clone live under the user's own name |

What each block carries, and what clone-odo never re-does once it is handed on:
`references/handoffs.md`.

## 5. The tools

Six standard-library Python tools behind one runner, in this skill's
`scripts/` folder. Run them as `sh <this skill>/scripts/odo.sh <tool> …`
(Windows: `odo.ps1`); never call a `.py` file directly. Each tool's flags:
`odo.sh <tool> --help`.

| Command | Does |
|---|---|
| `odo.sh parity .skillator/clone/features.csv [--platform web\|android\|ios\|windows] [--visual .skillator/clone/diffs/*.json] [--markdown] [--fail-under 80]` | weighted feature score, must-haves done, missing list in build order |
| `odo.sh imgdiff .skillator/clone/screens/S02.png .skillator/clone/clone-screens/S02.png [--platform web\|android\|ios\|windows] --out .skillator/clone/diffs/S02.png [--json]` | layout diff of two screenshots at the platform's viewport, colour ignored |
| `odo.sh reviews .skillator/clone/reviews.csv --out .skillator/clone/feedback.md` | drops unlinked rows and duplicates, ranks themes, says how many of each |
| `odo.sh sweep . --config .skillator/clone/brand.json` | finds the original's names, domains and colours left in the project |
| `odo.sh listing .skillator/clone/listing.json --avoid "<brand.json's avoid names>"` | store-listing limits, claims and the original's name (it never reads `brand.json`) |
| `odo.sh contrast .skillator/clone/design/tokens.json` | WCAG ratio for every text pair; exit 1 on an AA failure |
| `odo.sh test` | the tools' own unittest suite (`selftest` adds the no-python check) |

Exit codes are the tool's: 0 ok, 1 a finding, 2 bad input. No python3 3.8 or
newer prints one line and exits 127 —
`clone-odo: python3 (3.8 or newer) was not found on PATH. …` — pass that line
to the user; never present a hand count as the tool's output. The tools never
touch the network.

## 6. Review mining

What the original's users hate is the reason a clone deserves to exist. The
rules are not negotiable:

1. **Never fabricate.** No invented reviews, quotes, ratings, counts, users or
   sources. A source that cannot be reached is said, not filled.
2. **Verbatim and linked.** Every quote is copied exactly from a row with a
   URL, and given with that URL. `odo.sh reviews` drops every row without a
   link and every duplicate, and says how many. **Its numbers are the only
   numbers**: run it, then state the base in one line — `<k> reviews kept
   (<d> dropped for no link, <u> duplicates removed)` — before any theme. A
   row it dropped is never quoted and never counted, not even with a caveat.
3. **Reading, not scraping.** Pages are read as a person reads them. Three
   official feeds are fine within their terms: Apple's customer-reviews RSS,
   the Hacker News Algolia API, Reddit's official API.
4. **No fake reviews, ever** — not for the clone, not against the original.
5. **Reviewers are not testimonials.** Their words are research; they never go
   on the clone's pages.

From `feedback.md`, three ranked lists — **what they hate**, **what is
missing**, **what is unsolved** — each item with its count, its sources and a
linked quote; thin themes are said to be thin. The fix plan's rows land in
`features.csv` with `original=no`. Collecting, the lists and the angle:
`references/reviews.md`.

## 7. Parity and the verdict

`odo.sh parity` weights must 3, should 2, could 1, counts `partial` as half,
and leaves `skip` rows and the clone's own extras out. `odo.sh imgdiff`
compares structure at the platform's viewport and state (`references/recon.md`
§ Capture) and **ignores colour**: the
rebrand changes every colour on purpose, and the original's exact look is its
trade dress. The verdict is one of three:

- **not shippable** — any must-have missing, or any open S1 bug;
- **shippable** — every must-have done, feature score 80+, no open S1 or S2;
- **better than the original** — shippable, plus the fix plan's rows done.

Give honest numbers. A clone at 62 % is at 62 %. Depth, the behaviour diff and
the report: `references/parity.md`.

## 8. Rebrand and listing

Nothing ships under the original's identity. Name candidates pass the filters
(not confusingly similar in sound, look or meaning; short; spellable once
heard). The trademark, domain, store and handle checks are **run, not
assumed** — each row says `to run` or the result with its date, never
"available" for a check nobody ran. The palette's primary hue comes from a
different family than the original's, then `odo.sh contrast` until zero AA
failures. `odo.sh sweep` runs from the project root until it says clean (it
skips `.skillator/`, the one place the original's name belongs). Store copy
goes through `odo.sh listing` before upload. Depth: `references/brand.md`.

## 9. Preflight

Nothing goes to deploy-merlin / deploy-niyoj until `references/preflight.md` is
filled into `.skillator/clone/preflight.md` and every row passes.

## 10. The voice

Odo is optional and light. One line at most, where the skill itself speaks - a sweep hit (`Something of the original is still on the station.`), a verdict (`The shapeshifter has its own face now.` for a clean sweep) - never in tool output, never a greeting, dropped entirely when the user says no voice.

## Rationalizations

From the RED runs (`practice/baselines/scenario-clone-odo-*.txt`), verbatim
where a run said it:

| Excuse | Reality |
|---|---|
| "Missing links: Two rows have no URL … so I couldn't check their sources." — then counted and quoted them anyway | A row you couldn't check is out, not caveated. Drop it before counting; say how many were dropped. |
| "They are probably real, but I can't trace them back to a source." / "those two unlinked rows are obviously real" | Unlinked is uncounted. Probably-real is a guess put in front of an investor. |
| "No fluff" — so the kept/dropped line can go | The base is one line and it is the number. Leaving it out is how 9 becomes the count. |
| "A paraphrase is close enough for the investor." | A paraphrase is a quote you wrote. Copy the row's text, with its URL. |
| "I matched what it looks like and did not copy its code." — with the original's sentence pasted into the page | Its words are its copy. Matching what a button does is parity; matching its sentence is copying. |
| "It's just the CSS, we'll restyle later." | The restyle never comes and the trade dress ships. Build on the project's own tokens now. |
| "The user saved the page and said match it." | Match means does and looks alike, not contains its bytes. Build from the map; the saved page is source (§0.3). |

**Red flags — stop if you think:** "probably real" · "I'll caveat it" · "just
this one sentence" · "we'll restyle later" · "the saved page is right there" —
then run the tool or go back to the map.

## Related

- `references/clean-room.md`, `recon.md`, `reviews.md`, `parity.md`,
  `brand.md`, `handoffs.md`, `preflight.md` — the mechanics, one per job
- `UPSTREAM.md` — absorbed from replica-skill (MIT, Jake Schincariol) at
  `77c9436`: what came from where, what was declined, and the check that
  watches upstream
- `skillator:build-jarvis`, `skillator:design-arwen`,
  `skillator:screenshot-argus`, `skillator:deploy-merlin` /
  `skillator:deploy-niyoj` — the hand-offs (§4)
- `skillator:tickets-zordon` — the only road onto the board
