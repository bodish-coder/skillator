# Brand — the line between "a clone" and the user's app

Nothing launches under the original's identity. This file is the rebrand
(name, checks, palette, logo brief, voice, the sweep) and the store-listing
lint. Its outputs: `.skillator/clone/brand.md` (the name with its checks, the
palette, the logo brief, the voice) and `.skillator/clone/brand.json`
(`avoid`, `domains`, `colors` — what the sweep reads; the listing lint
takes the same names through `--avoid`, see § Listing).

## Step 1: the name

Start from the angle in `.skillator/clone/fixes.md`. Twenty candidates across
styles — descriptive, compound, invented, metaphor, verb — then cut to five:

- **Not confusingly similar to the original** in sound, look or meaning, nor
  to another app in the same category. That is the test trademark offices use.
  No puns on its name, no near-twin spelling.
- Short, spellable after hearing it once, no awkward meaning in a big language.
- Says something about the angle, or at least does not fight it.

## Step 2: the checks — run, not assumed

For each of the five, one row per check, marked **to run** or with the result
and the date it was run. Never "available" for a check nobody ran.

| Check | Where |
|---|---|
| US trademark | tmsearch.uspto.gov, the app's classes (usually 9 and 42) |
| EU trademark | euipo.europa.eu eSearch, or TMview |
| Canada | the CIPO trademarks database |
| global | WIPO Global Brand Database |
| domain | `whois <name>.com`, or the registrar's search |
| App Store and Play | search the exact name |
| handles | X, Instagram, TikTok, GitHub |
| the web | "<name> <category>" |

These are screening checks, not legal clearance; before money goes on the
name, a trademark lawyer does a proper search.

## Step 3: palette

New values in the same token roles design-arwen set up in
`.skillator/clone/design/tokens.json`. The primary hue comes from a different
family than the original's — if theirs is blue, the clone's is not a nearby
blue. Then:

```sh
sh <this skill>/scripts/odo.sh contrast .skillator/clone/design/tokens.json
```

Zero AA failures (4.5:1 body text; 3:1 large text, input borders, focus
rings); fix it in the tokens, not per component. Add the original's brand
colours to `brand.json` `colors` so the sweep catches any that survive.

## Step 4: logo brief

A brief, not a logo, for whoever makes it: the idea in one line tied to the
name and angle; mark type (wordmark, symbol plus wordmark, monogram); works at
16 px and as a 1024 px app icon; deliverables (SVG, 1024x1024 icon with no
transparency for iOS, favicon set, 1200x630 social image). **It must not
resemble the original's mark** — no shared shape, colour pair or letterform
trick; put the original's logo beside the drafts and check.

## Step 5: voice

Three words for how it sounds, each with what it does not mean ("direct, not
blunt"), and five do / don't pairs. Then rewrite the ten most-seen strings —
sign up, empty states, the main button, the confirmation, the error — in that
voice. All fresh; none echoing the original's phrasing.

## Step 6: the sweep

Replace every placeholder name, colour and string, then from the **project
root**:

```sh
sh <this skill>/scripts/odo.sh sweep . --config .skillator/clone/brand.json
sh <this skill>/scripts/odo.sh sweep . --avoid "Original,Its Company" --domains original.com --colors "#006bff"
```

It searches file contents and file names for the original's names (inside
identifiers too), domains and colours, skipping `node_modules`, build output
and the `.skillator/` folder at the root — the one place the original's name
belongs. `--include-planning` sweeps that too. Run from inside
`.skillator/clone/` it reports everything there, so always run from the root.
Exit 1 means something is left: fix it and rerun until it says clean. A hit
inside a page saved from the original, sitting outside `.skillator/clone/`,
is not ignored: move it into `.skillator/clone/original/` (`clean-room.md`)
and rerun. Then
check by eye what a sweep cannot read: the favicon, page titles, email
templates, the OG image, the app icon.

## Listing

The store listing goes in `.skillator/clone/listing.json` (start from
`templates/listing.example.json`), then:

```sh
sh <this skill>/scripts/odo.sh listing .skillator/clone/listing.json --avoid "<the names in brand.json avoid>"
```

The lint never reads `brand.json`. It takes `--avoid`, or else the listing's
own `avoid` key — and the example file's `avoid` is a placeholder
(`Name Of The Original App`), so replace it with the same names as `brand.json`
`avoid`, or pass `--avoid` every time as above.

It checks the App Store limits (name 30, subtitle 30, promotional text 170,
keywords 100, description 4000) and Google Play's (title 30, short
description 80, full 4000), counting characters the way a person does; flags
ranking and price claims in short fields, emoji, wasted keyword characters,
and any name from `avoid` anywhere in the listing. Exit 1 on an error.

Apple's App Review Guideline 4.1 (Copycats) rejects an app that copies a
popular one or makes minor changes to its name or UI: the fixes and the
clone's own brand are what get it through, so they show in the screenshots
and the description's first lines. No invented proof — no testimonials, user
counts, star ratings or press logos — and no reviewer quotes.

Not here: the landing page (design-arwen builds it), pricing (the owner
decides it), the launch plan.
