# Preflight — the gate before a clone goes to deploy

Copy the checklist below into `.skillator/clone/preflight.md`, run every
check, and paste each result (the command's output line, the count, the date)
beside its box. Every box must be ticked before the hand-off to
`skillator:deploy-merlin` or `skillator:deploy-niyoj`. A box ticked without
its result pasted is unticked.

Not until it is rebranded: a sweep that is not clean stops the gate, with no
exceptions. Nothing goes live without the user's go — show the filled gate and
ask.

```markdown
# Preflight: <the clone's name>

Date: <YYYY-MM-DD>  Commit: <sha>  Go from user: <yes / not yet>

## Gate (all must pass)

- [ ] test suite green: <n passed / n>  (the project's own runner)
- [ ] no open S1 or S2 bug on the board (prints nothing)
      grep -E '^ *- \[[^x-]\] B[0-9]+[a-z]? — .*\[S[12]\]' TICKETS.md
- [ ] parity: every must-have done (<n/n>), feature score <n> (80+), exit 0
      sh <this skill>/scripts/odo.sh parity .skillator/clone/features.csv --fail-under 80
- [ ] every must row's F ticket closed, and every closed one's row says yes
- [ ] rebrand sweep clean (exit 0), run from the project root
      sh <this skill>/scripts/odo.sh sweep . --config .skillator/clone/brand.json
      (a hit in a saved original page outside .skillator/clone/ = move it into
      .skillator/clone/original/ and rerun; never ignored)
- [ ] contrast: zero AA failures
      sh <this skill>/scripts/odo.sh contrast .skillator/clone/design/tokens.json
- [ ] store listing passes (exit 0), if shipping to a store
      sh <this skill>/scripts/odo.sh listing .skillator/clone/listing.json --avoid "<brand.json avoid names>"
- [ ] production build passes
- [ ] nothing in the build loads from the original's domain or CDN
- [ ] `.skillator/clone/screens/` is not in anything that ships
- [ ] privacy policy and terms live, every processor listed
- [ ] account deletion works
- [ ] favicon, page titles, OG image, emails and app icon are the clone's own,
      checked by eye
```

Production, domain, email records, live payments and monitoring are
deploy-merlin's and deploy-niyoj's checklists, not this one. This gate only
answers one question: is this the user's own app, finished and clean, or
still a copy of someone else's?
