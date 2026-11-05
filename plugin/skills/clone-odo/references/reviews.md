# Reviews — what the original's users hate, in their own words

A straight copy has no reason to exist. This is where the reason comes from:
what the original's users complain about, counted honestly and quoted exactly,
turned into a fix plan for the clone. SKILL.md §6 holds the five rules; they
apply to every step here.

## The numbers are the tool's

Run the tool before saying anything about the reviews:

```sh
sh <this skill>/scripts/odo.sh reviews .skillator/clone/reviews.csv --out .skillator/clone/feedback.md
```

Its first lines are the base: how many reviews it kept, from how many sources,
how many rows it dropped for having no link (or no text), and how many
duplicates it removed. Every count in the reply comes from that output:

- **State the base first, one line:** `<k> reviews kept (<d> dropped for no
  link, <u> duplicates removed)`. Short answers keep this line; it is the
  number, not a caveat.
- **A dropped row is gone.** It is never quoted, never counted in a theme,
  never mentioned as "probably real". Seeing that a row has no URL and
  counting it anyway is the failure this file exists for.
- **Theme counts are the tool's `reviews` column**, not a re-count by hand
  over the CSV.
- **Every quote is a substring of a kept row's `text`, copied exactly, with
  that row's URL.** The tool prints quotes in that shape (returning an exact
  verbatim substring without inserted ellipses and recording `truncated: true`
  separately when clipped to the character limit); use them, or copy another
  sentence of the same row exactly. Never shorten, merge or reword a quote, and
  never put a source name where the URL goes.
- **No python3?** The runner says so in one line. Pass it on; then, if the
  user still wants an answer now, apply the same rules by hand — drop every
  row with no `url`, remove exact repeats (case and spacing ignored), and say
  you counted by hand.

A sample under 30 is a direction, not a ranking; the tool says so and the
reply repeats it.

## Collecting

Aim for 100+ reviews across at least three sources, recent first:

| Source | Where |
|---|---|
| App Store | the app page's ratings and reviews, or Apple's customer-reviews RSS feed (`itunes.apple.com/us/rss/customerreviews/id=<APP_ID>/sortBy=mostRecent/json`) |
| Google Play | the listing, all reviews, newest first |
| G2, Capterra, Trustpilot | the product's review pages, filtered to 1-3 stars too |
| Reddit | "X alternative", "switched from X", "X vs" — or Reddit's official API, within its terms |
| Hacker News | the Algolia API (`hn.algolia.com/api/v1/search?query=…`) or site search |
| the original's own board | its public roadmap or feature-request board, and the vote counts |
| its changelog | what it already shipped, so the clone does not "fix" what is fixed |

One row per review in `.skillator/clone/reviews.csv`:
`source,url,date,rating,text`, the text copied exactly, the URL of that review
or thread. Read the 3- and 4-star ones too — "love it, but…" is where the best
fixes hide. Reading, not scraping: no scraping library against a site whose
terms forbid it.

## Ranking

`odo.sh reviews` sorts reviews into themes (`scripts/themes.json`; pass
`--themes` with an edited copy for the app's category), weights low ratings
and recent reviews higher, marks a theme with fewer than 3 reviews or one
source as **thin**, lists requests in the users' own words, and lists low
ratings that matched no theme. Read that last list by hand; it is often the
best part.

## The three lists and synthesis reporting

Into `.skillator/clone/fixes.md`, categorize items into three lists:

1. **What they hate** — complaints about things the app does.
2. **What is missing** — features people ask for by name.
3. **What is unsolved** — whole jobs or groups the app ignores ("not built for
   teams"). These become positioning.

Thin themes are listed as thin. Three angry comments are not a trend.

Each synthesized item in `.skillator/clone/fixes.md` reports:

- **Problem:** the finding or issue in one line.
- **Evidence:** tool-derived counts (`<n> reviews across <n> sources`). Preserves
  deterministic deduplication and dropped counts. Mentions and review counts must
  never be presented as unique-user counts: if 4 reviews come from one reviewer,
  state `4 reviews across 1 reviewer/source` or `4 mentions`, never `4 users` or
  `4 customers`. A prolific reviewer does not multiply user count.
- **Affected segments:** user cohorts, platforms, plan tiers, or environments
  specifically affected (e.g. mobile field workers, self-hosted admins, free tier),
  identified directly from review context.
- **Impact:** concrete workflow severity or friction (e.g. data loss blocker,
  crash on startup, pricing churn risk, minor annoyance).
- **Quotes:** one or two verbatim linked quotes (`[quote](url)`), copied exactly
  from kept reviews. Dropped rows (missing URL) are never quoted or counted.
- **Contradictory evidence:** conflicting feedback, contrasting experiences, or
  segments where the workflow works well or users express satisfaction, cited with
  verbatim linked quotes and URLs. If no contrary evidence was found in the kept
  dataset, state `None observed in dataset`. Never ignore or fabricate contradictions.
- **Confidence:** calibrated as `High`, `Medium`, or `Low`:
  - `High`: multi-source (2+ distinct sources), substantial volume (5+ reviews),
    consistent sentiment across segments, no unresolved contradictions.
  - `Medium`: moderate volume (3-4 reviews) or single source with multiple reviews,
    or mixed sentiment where contradictions exist but the core issue is documented.
  - `Low`: thin themes (< 3 reviews or 1 source), heavy concentration in a single
    prolific reviewer, or strong contradictory evidence across segments indicating
    niche or conflicting workflows.

## The fix plan

The top 5 to 8 by evidence times cost to fix. For each: what to build or
change, a size (S, M, L), which skill builds it, and the evidence. Each one
becomes a row in `features.csv` with `original` set to `no`. Pricing and
billing complaints feed [the launch pricing proposal](launch.md); research and
present alternatives, with the final pricing decision retained by the owner.

## The angle

Three positioning options, each grounded in a top theme:

```
For <who> who <hate this about the original, in plain words>,
<the clone> <does this instead>.
Evidence: <theme>, <n> reviews across <n> sources.
```

Recommend one; it drives the name and voice (`brand.md`). The original's name
stays out of the clone's name, ads and store listing.

## Never

- invent a review, a quote, a rating, a count, a user or a source;
- present mention or review counts as unique-user counts;
- ignore or omit contradictory evidence found in kept reviews, or fabricate counter-claims;
- post or buy a review — for the clone or against the original (illegal in the
  US under the FTC's 2024 rule, and in many other places);
- put a reviewer's words on the clone's landing page or listing.
