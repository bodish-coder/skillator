# RUN-9 - every state
plan: docs/plans/PLAN-demo.md
started: 2026-09-01T09:00Z   updated: 2026-09-01T12:00Z

## Stages
| # | stage | state | owner | heartbeat | landed |
|---|-------|-------|-------|-----------|--------|
| 1 | AAAB B1 fix | x | build:sonnet | 2026-09-01T09:40Z | 4d72860 |
| 2 | AAAC F2 export <b> | ~ | build:opus | 2026-09-01T11:50Z | - |
| 3 | AAAD F5 author filter | ? | build:sonnet | 2026-09-01T10:30Z | - |
| 4 | AAAE F6 export cmd |   | - | - | - |
| 5 | AAAF B7 retry | > | build:sonnet | 2026-09-01T10:00Z | stage 6 |
| 6 | AAAG B7 retry 2 | ! | build:sonnet | 2026-09-01T11:00Z | - |
| 7 | docs pass | z | - | - | - |
| 8 | verify review bump commit push |   | main | - | - |

## Chain
driver: @cc-a1b2c3 2026-09-01T11:50Z     hold: -     mode: workflow
### AAAB - stage 1 - B1 fix
tickets: B1 cheap/build
files: src/a.py
prompt: |
  item B1: fix it.
### AAAC - stage 2 - F2 export <b>
tickets: F2 build/build
files: src/export.py, tests/
after: 1
prompt: |
  item F2: export.
  files: prompt-body.txt
after: 9
### AAAD - stage 3 - F5 author filter
tickets: F5 build/build
files: src/export.py
prompt: |
  item F5: filter.
### AAAE - stage 4 - F6 export cmd
tickets: F6 cheap/build
files: src/cli.py
after: 2
prompt: |
  item F6: command.
### AAAF - stage 5 - B7 retry
tickets: B7 build/build
files: src/b7.py
prompt: |
  item B7.
### AAAG - stage 6 - B7 retry 2
tickets: B7 build/build
files: src/b7.py
prompt: |
  item B7 again.

## Decisions
asks: end
### Q1 open 2026-09-01T10:30Z
parked: stage 3 (AAAD)
ticket: F5
reason: taste
question: Exact or substring author match?
header: Match
options:
  - exact (Recommended) | predictable | "Herbert" finds nothing
  - substring | forgiving | "Frank" matches two
default: exact
blocks: F5, F6
files: src/export.py
answer: -
### Q2 asked 2026-09-01T10:31Z
parked: stage 3 (AAAD)
ticket: F5
reason: fact
question: Which env var holds the API URL?
header: Env var
options:
  - SHELF_API_URL | named for this app | ops may use another
  - LIBRARY_API_BASE (Recommended) | the runbook name | not confirmed
  - API_URL | short | collides with the other service
default: SHELF_API_URL
blocks: F5
files: src/sync.py
answer: -
### Q3 moot 2026-09-01T10:32Z
parked: planning
ticket: F9
reason: taste
question: Old question?
header: Old
options:
  - a | x | y
  - b | x | y
default: a
blocks: F9
files: src/a.py
answer: -
moot: F9 closed
### Q4 answered 2026-09-01T10:33Z
parked: planning
ticket: F10
reason: taste
question: Answered question?
header: Ans
options:
  - a | x | y
  - b | x | y
default: a
blocks: F10
files: src/ten.py
answer: b
answered: 2026-09-01T11:00Z
### Q5 ruled 2026-09-01T10:34Z
parked: planning
ticket: F11
reason: conflict
question: Ruled question?
header: Rul
options:
  - a | x | y
  - b | x | y
default: a
blocks: F11
files: src/eleven.py
answer: a
ruled: 2026-09-01T11:01Z
### Q6 same-as-Q1 2026-09-01T10:35Z
parked: planning
ticket: F5
reason: taste
question: Exact or substring?
header: Match
options:
  - exact | x | y
  - substring | x | y
default: exact
blocks: F5
files: src/export.py
answer: -
same-as: Q1
### Q100 replanned 2026-09-01T10:36Z
parked: planning
ticket: F12
reason: taste
question: Replanned question?
header: Rep
options:
  - a | x | y
  - b | x | y
default: a
blocks: F12
files: src/twelve.py
answer: a
answered: 2026-09-01T11:02Z
replanned: stage 6 (AAAG)

## In flight
### stage 2 - AAAC F2 export <b>  (dispatched 2026-09-01T11:00Z, @cc-a1b2c3)
run: -
prompt: |
  item F2: export.
last seen: dispatched
### stage 3 - AAAD F5 author filter  (dispatched 2026-09-01T10:00Z, @cc-a1b2c3)
run: -
prompt: |
  item F5: filter.
parked: Q1, Q2

## Rulings
- 2026-09-01 - selftest fixture.
