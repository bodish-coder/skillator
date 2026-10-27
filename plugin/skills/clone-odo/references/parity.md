# Parity — how close the clone is, in honest numbers

**Parity means it does the same job, not that it looks the same.** The feature
score is the number that matters: can a user do everything they could do in
the original. The layout score checks structure — is the information in the
same places, in the same hierarchy — because that is what makes a switcher
feel at home. It ignores colour on purpose: the rebrand changes every colour,
and the original's exact look is its trade dress. Never chase pixel parity
with the original.

```sh
sh <this skill>/scripts/odo.sh parity .skillator/clone/features.csv --platform web
sh <this skill>/scripts/odo.sh imgdiff .skillator/clone/screens/S02.png .skillator/clone/clone-screens/S02.png --platform web --out .skillator/clone/diffs/S02.png
sh <this skill>/scripts/odo.sh imgdiff .skillator/clone/screens/S02.png .skillator/clone/clone-screens/S02.png --platform web --json > .skillator/clone/diffs/S02.json
sh <this skill>/scripts/odo.sh parity .skillator/clone/features.csv --platform web --visual .skillator/clone/diffs/*.json --markdown > .skillator/clone/parity.md
```

## Step 1: feature parity

Bring `features.csv` up to date first: every row's `clone` is `yes`,
`partial` (with a note), `no`, or `skip` (with a reason). A must row whose F
ticket is closed but whose `clone` still says `no` is drift — fix the row or
reopen the ticket.

`odo.sh parity` weights must 3, should 2, could 1, counts `partial` as half,
leaves out `skip` rows and rows the original does not have (`original=no`),
and prints the score, must-haves done of total, each area weakest first, and
the missing list in build order. Any must-have not done means not shippable,
and it says so. It ignores the `ticket` column. `--fail-under 80` is the ship
bar as an exit code: 1 when the feature score is under 80 or any must-have is
not done; the layout score never lifts it.

## Step 2: layout diff

For each key screen, two screenshots at the **platform's viewport** (`recon.md`
§ Capture: web 1440x900 or 390x844 mobile web, Android 1080x2400,
iOS 1179x2556, Windows 1280x800) in the **same state** (same data shape, same tab,
same login). The original's come from public pages or the user's own account
and live in `.skillator/clone/screens/`; the clone's in
`.skillator/clone/clone-screens/`, same `S<nn>` name.

Layout mode (the default) turns both into edge maps, cuts them into a grid and
compares where things are, scoring only cells with something in them. It
reports the score (matches 90+, close 75+, partly 50+, different), the
regions that differ (in the original's pixel coordinates, biggest first) and a
height difference when one page is much longer. Retina and non-retina compare
fine; both are scaled to one width.

`--mode pixel` is exact comparison: for the clone against itself last week,
never against the original.

## Step 3: behaviour diff

Walk each flow `FL<nn>` in both apps — the original by hand, as a user — and
compare what the scores cannot see: clicks to finish the core flow, what
happens on errors, what is remembered between visits, which emails arrive.
Fewer clicks than the original is a win. One line per difference:

`FL<nn> · original does … · clone does … · fix or keep`

## Step 4: the report

`.skillator/clone/parity.md`: overall score, feature score, layout score per
screen, missing features in build order, behaviour differences, and one
verdict:

| Verdict | When |
|---|---|
| **not shippable** | any must-have missing, or any open S1 bug |
| **shippable** | every must-have done, feature score 80+, no open S1 or S2 |
| **better than the original** | shippable, plus the fix plan's rows (`reviews.md`) done — the goal; a straight copy has no reason to exist |

Bug severities come from the `[S1]`..`[S4]` token on the board's `B<n>`
lines (`templates/bug-report.md`; the grep is in `preflight.md`): S1 data loss, a security
hole, payments wrong or the core flow blocked; S2 a feature broken with no
workaround; S3 broken with a workaround or visibly wrong; S4 cosmetic.

Give honest numbers. A clone at 62 % is at 62 %. Close with the top five
things to build next; each missing must row already has its F ticket.
