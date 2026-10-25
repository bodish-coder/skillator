# The board meeting - scoring, seats, synthesis

## Score

Start at 1. Add 1 for each that holds:

| Signal | Example |
|---|---|
| Touches 2+ domains | an auth scheme and the clients that call it |
| Hard to reverse | a storage format, a schema, a public API, a delete, a migration |
| The seats are expected to disagree | ops wants the boring option, users want the convenient one |
| Changes what people who use it do | partners' integration code, a team's workflow |
| Security or compliance angle | secrets, PII, licences, access |

1-2 → decide or one seat · 3 → two seats · 4+ → a board.

## Seats

Pick the seats the decision touches, at most 5. The default bench:

| Seat | Asks |
|---|---|
| **architect** | What does this lock in? What does it cost to change later? |
| **security** | What can leak, be forged or be lost? |
| **UX** | What do the people who use it see and have to do? |
| **ops** | What runs it, what breaks at 3am, how is it backed up and restored? |
| **product** | What does the goal need by when, and what can wait? |

A goal with other stakeholders (finance, legal, a named team) may swap a seat
for theirs; say which and why in the synthesis.

## Rules

- **One turn each.** A seat answers once; no back-and-forth.
- **No cross-calls.** Seats never invoke each other or see each other's answers.
- **Depth 2.** Chief → seat → stop. A seat spawns no agents.
- **Never itself.** The chief never convenes a board inside a board.
- **Parallel where the host allows** (Fable on Claude Code, the top reasoning
  tier elsewhere - `grayskull-power/references/hosts.md`). Run serially when the
  owner's rules or the machine say one agent at a time; the rules above still hold.
- **Read-only.** Seats read and argue; they edit nothing.
- A seat that cannot answer from the pointers says what it is missing; the
  chief does not fill the gap for it.

## The brief - the same pointers to every seat

```
You are the <seat> on a board for the goal in .skillator/wiki/<goal>/ .
Read: index.md, decision-<slug>.md, TICKETS.md <ids>, <files at sha>.
Question for your seat: <one question>.
Answer in under 200 words: your position, your strongest reason, the risk
you see that others may not, and what would change your mind. Edit nothing.
```

## Synthesis - exactly these four parts

```markdown
## Agree
<2-3 points two or more seats reached independently, each with its seats>

## The disagreement
<seat A> wants X because ...; <seat B> wants Y because ...
What it is really about: <the trade-off underneath - risk tolerance, time
horizon, who pays>.

## Actions
1. <specific action> - <owner: a seat, an agent, the owner> - <ticket id once filed>
(at most 5; the rest are backlog tickets)

## The owner's decision
<one question>
- **A** - <option>: <what it gives> / <what it costs>
- **B** - <option>: <what it gives> / <what it costs>
Recommendation (the chief's, labelled): <A or B, one line why>.
```

No disagreement among the seats → say "none surfaced" under its heading and
keep the heading; never drop it. Never resolve the disagreement in the
synthesis - the owner decides, and the decision is parked (SKILL.md §4).

## Worked example (shape only)

Session cookies or bearer tokens for an invoicing API, score 5. Architect:
tokens, a mobile client is planned. Security: cookies, tokens in local
storage leak to any XSS. Ops: cookies, revocation is one row delete. Product:
whichever ships the partner beta this month. **The disagreement**: architect
vs security/ops - client reach vs revocation and leak surface; it is really
about whether the mobile client is this year or a maybe. **The owner's
decision**: does a non-browser client ship before Q3? A - no: cookies. B -
yes: short-lived tokens with a refresh endpoint.
