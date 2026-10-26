# Clean room — what a clone may take, and what it never takes

SKILL.md §0 is the guard in six lines. This file is what each line means in
practice, and what to do in the cases that come up. It binds every skill the
clone passes through: when clone-odo hands a ticket to build-jarvis or a
screen to design-arwen, this file goes with it.

## The line

A clone rebuilds **functionality and UX patterns**: what the app does, which
screens it has, how a user moves from one to the next, how a form or a modal
behaves. Those are not ownable, and users switching over expect them.

It never takes what the app **owns**:

| Never take | Instead |
|---|---|
| Its HTML, CSS, JavaScript, SVGs, images, bundles or binaries | write every line here, from the recon map and the project's own tokens |
| Its words: labels, headlines, empty states, error text, emails | write every string fresh, in the clone's own voice |
| Its class names, ids and file names | name things for what they are in this project |
| Logos, icons, illustrations, photos, sounds | an open icon set (Lucide, Phosphor, Heroicons, Tabler); your own or commissioned art; never traced |
| Licensed fonts | an open font with the same job (Inter, Geist, IBM Plex, Manrope, Source Serif) |
| Its brand colour as a value | record it as a role (`accent`), use a neutral placeholder, the rebrand sets the value |
| Anything loaded from its domain or CDN | nothing at runtime comes from the original |
| Its private endpoints or OAuth client | official public APIs only, with the user's own keys |

**Matching what a button does is parity. Matching its sentence is copying.**
A run that leaves out the original's class names and colour and still pastes
its headline has taken the part users read first.

## Allowed sources

| Source | Allowed | Note |
|---|---|---|
| Help center, docs, changelog, pricing page, marketing site | yes | read as a person reads them |
| Store listings and their screenshots | yes | reference only, in `.skillator/clone/screens/` |
| Public walkthrough videos | yes | for flows, click by click |
| The user's own account | yes | driven by the user, at human speed; check the terms first |
| Public API docs | yes | the data model, almost for free |
| Someone else's account, a shared login, a paywall workaround | no | never, and never ask for a password |
| View-source, Save Page As, the JS bundle, a HAR or network log | no | that is the original's source, whoever saved it |
| A crawler, a scraping library, a download loop | no | read, don't scrape |

## When the original's source is already in the project

Users save pages. A folder like `original/`, `reference/` or a stray
`booking.html` from the original's site is its source, whoever saved it and
whatever it is called.

1. Do not open it, and do not copy from it — markup, class names, CSS rules,
   colours, fonts, scripts or text. Move it, unopened, into
   `.skillator/clone/original/` (screenshots go in `.skillator/clone/screens/`)
   with `git mv` or `mv`, and tell the user in one line. That folder is inside
   the planning folder the sweep skips, so the page stops failing the sweep
   and can never ship; add it to `.gitignore` when the repo is public.
2. Build from `.skillator/clone/recon.md`. If the map lacks what the screen
   needs, add it to the map first — what the screen does and holds, in your
   words, from screenshots or the live page read as a person reads it — then
   build from the map.
3. Say so in the reply, one line: what the screen was built from (the map's
   `S<nn>` / `FL<nn>`, the project's tokens) and that nothing came from the
   saved page.
4. Before calling the screen done, check the build for leftovers without
   reading the original: from the project root,
   `odo.sh sweep . --config .skillator/clone/brand.json`. Its `avoid` list
   carries the original's names, its `domains` and `colors` the rest; add any
   term the recon map's own notes record as the original's (a product or
   feature name, a tagline heard in a walkthrough) to `avoid` first. Never
   grep with text taken from the saved page — that needs someone to open it.
   A hit in the build is fixed by rewriting, not by renaming one word. A hit
   inside a saved original page outside `.skillator/clone/` is not ignored and
   not rewritten: move the page into `.skillator/clone/original/` (step 1)
   and rerun.
5. The saved page is reference at best and must never ship; in
   `.skillator/clone/original/` it cannot.

"Make ours match it" means the clone **does** and **looks** alike at the level
of the map — the same slots, the same flow, the same states — not that it
contains the original's bytes.

## Terms

Some products' terms forbid using an account to build a competing product. If
the user's account is under terms like that, say so in one line and work from
public sources only. A factual comparison page is a legal question for a
lawyer in the user's country, not something this skill decides.

## What cannot be cloned

Recorded in `features.csv` as `skip` rows with a reason, never quietly left
out:

- licensed content: a music catalogue, a stock library, fonts, data feeds;
- the network and its users: the community, the reviews, the marketplace of
  third-party apps;
- data the app owns: its listings, its index, its users' content;
- partner deals and hardware;
- regulated licences: banking, health, insurance.

"Clone any app" means the features and the flow. It never means what the app
owns.

## Testing

**Test your clone, never theirs.** No load tests, fuzzing, scripted runs or
hammering against the original's servers. Using the original by hand, as a
normal user, to see how it behaves is fine. Every automated test runs against
the clone, on local or staging data.

## Screenshots

Taken at the same viewport and state as the clone's will be, saved in
`.skillator/clone/screens/` as `S<nn>.png`, used by `odo.sh imgdiff` and by
eye. They never go into `public/`, an asset folder or a commit to a public
repo: add `.skillator/clone/screens/` to `.gitignore` when the repo is public.
