# Recon — the map every other step builds from

SKILL.md §2 is the order. This file is the depth for each step. Everything
downstream — the tickets, the build, the tests, parity — reads what this
writes, so a thin map makes a thin clone. Take the time here.

Output, in the user's project:

```
.skillator/clone/recon.md        templates/recon-map.md, filled
.skillator/clone/features.csv    templates/features.csv, filled
.skillator/clone/screens/        reference screenshots - never shipped
```

The guard (SKILL.md §0, `clean-room.md`) applies to every step below.

## Step 1: scope

Three questions; propose answers and get a yes rather than waiting:

1. **Which app, which platform** — web, iOS, Android, desktop.
2. **Which slice.** "All of Notion" is not a project; "Notion's pages, blocks
   and sharing" is. Default to the core loop: the one flow users pay for.
3. **Who it is for** — the user's own business, a niche, a product to sell.

## Step 2: sources

A table, URL on every row, before anything else. In order of value:

| Source | What it gives |
|---|---|
| help center / docs | the most complete feature list there is, and the settings |
| pricing page | which features matter — they gate them |
| changelog | what was added lately, what the team thinks matters |
| store listing | screenshots of every key screen, the pitch, the ratings |
| public walkthrough videos | real flows, click by click |
| marketing site | positioning, the core loop in their words (read, never reused) |
| the user's own account | every state, driven by the user |
| public API docs | the data model |

A row with no URL is a memory, not a source.

## Step 3: screens

One row per screen, ids `S01`, `S02`, … numbered by hand in the map and never
renumbered — every other file refers to them. They never go through
`next-id.sh`; its `S` kind is a different namespace.

`ID | screen | route or how you reach it | purpose | key components | states seen`

States matter: empty, loading, filled, error, permission denied, mobile. An
empty state not recorded is an empty state not built.

## Step 4: flows

`FL01`, `FL02`, … — never `F` plus a number, which is a ticket on the board.
Each flow is a goal and the screens it passes through:

```
FL01 Guest books a slot
    S01 booking page -> S02 pick a time -> S03 details form -> S04 confirmed
    happy path clicks: 4
    edge: no slots this week, guest in another time zone, slot taken mid-form
```

The happy-path click count is the number to beat. The edge list becomes the
`FL01-E<n>` cases in `templates/test-plan.md`.

## Step 5: components

Every repeated part — buttons, inputs, date pickers, modals, tables, toasts,
navigation — with its variants, its states and the screens that use it. This
is the list design-arwen gets (`handoffs.md`).

## Step 6: inferred data model

Entities, fields and relationships, each with the evidence and a confidence:

```
Booking  id, slot_id, start_at, end_at, guest_name, guest_email,
         status (confirmed | cancelled | rescheduled)
         evidence: S03 form fields, S04 confirmation, help article "Cancel a booking"
         confidence: high
```

Guesses are marked `guess`. build-jarvis turns this into a real schema.

## Step 7: feature matrix

`.skillator/clone/features.csv`, columns
`feature,area,priority,original,clone,ticket,notes`:

- `priority` — must / should / could;
- `original` — `yes` for a feature the original has, `no` for one the clone
  adds (the fix plan's rows, `reviews.md`);
- `clone` — `no` at the start; `partial` (with a note), `yes`, or `skip`
  (with a reason) as the build goes;
- `ticket` — the F id once SKILL.md §3 has run; empty until then.

## Step 8: what cannot be cloned

`skip` rows with a reason, from the list in `clean-room.md` § What cannot be
cloned. Said honestly in the summary, not buried.

## Step 9: size

Screens, flows, entities, and the hard parts: realtime, sync, payments,
calendar or email integrations, offline. Then one size: **S** (a weekend),
**M** (a few weeks), **L** (a quarter), **XL** (rescope it). No promise of a
perfect clone.

## The summary

Five lines, after `recon.md` and `features.csv` are written:

1. the core loop, in one sentence;
2. screen and flow counts;
3. the three hardest parts;
4. what is out of scope;
5. the next step — ticket the must-haves (SKILL.md §3).
