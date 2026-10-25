# Decision: persistence (JSON file next to the package, or SQLite) (F8)

Sources: [goal](goal.md); TICKETS.md F8, A2; `shelf/books.py` at `1c182c9`;
board seat agents 2026-10-25: architect `a2e38730f469ae84d`, ops
`a3efe380c61312539`, library staff (in UX's place) `ab1c5e8c050a49eb1`,
product `ad29598dbcc08eba5`. They ran one at a time ([pref](pref-owner.md)).

## History
- 2026-10-25 - The owner put persistence in v1 and left the format open. Its
  stakeholders are the nightly sync job, the library's spreadsheet people and
  the next maintainer ([goal](goal.md)). As of `1c182c9` the catalogue is a module-level
  list in `shelf/books.py`, lost on exit.
- 2026-10-25 - Score 5 (base 1, +1 domains: storage, sync job, spreadsheet,
  maintenance; +1 hard to reverse: an on-disk format; +1 seats expected to
  disagree; +1 changes what consumers do). Board convened, seats run one at
  a time ([pref](pref-owner.md)). Status: open.
- 2026-10-25 - Board synthesis below. Status: open, waiting on the owner (Q1
  in the session report). Security was left off the board: there is no PII or
  access control in a title/author list. The library-staff seat replaced UX.

## Board synthesis (2026-10-25)

### Agree
- **Not next to the package** (all four seats). "Next to the package" is
  inside site-packages: a reinstall or upgrade wipes it, it may be read-only,
  and each virtualenv gets its own catalogue. Every seat proposed a per-user
  data directory (`%APPDATA%\shelf\`, `~/.local/share/shelf/`) with an
  environment-variable override, for tests and the sync host.
- **Atomic writes** (all four): write a temp file, then `os.replace`, so the
  nightly `list --json` never reads a half-written store.
- **The store is private** (architect, ops, product): the contracts are
  `list --json` stdout and the export. Nobody reads the storage file directly,
  so the format stays reversible behind `shelf/books.py`. The README should say so.

### The disagreement
Ops wants **SQLite**: atomic transactions and consistent reads while `add`
runs, plus hot backup (`.backup`) and restore without stopping anything.
Architect, library staff and product want **JSON**: stdlib, diffable, and a
librarian or the next maintainer can open it in Notepad. They see SQLite's
advantages (concurrent writers, scale, queries) as F7-era needs. Ops would
accept JSON if the atomic-replace rule holds. Library staff would switch to
SQLite if several people write from a shared drive.
What it is really about: **whether v1 has concurrent writers**. If there are
none, JSON plus atomic replace is enough. If there are, JSON's lost-update
risk is real.

### Actions
1. Implement the owner's choice behind the existing `books.py` API: path
   resolution (env var, then per-user dir), atomic save, load on start.
   README notes the store is private. Owner: implementer agent. Ticket: F8.
2. Make a missing or corrupt store a loud error, not an empty shelf. The
   sync job would otherwise ingest `[]` as healthy and might wipe its side.
   Corrupt JSON should name the bad line, and the previous copy should be kept
   as `.bak` (ops, library staff). Owner: implementer agent. Ticket: A2.
3. Find out which OS user and machine the nightly sync job runs as. A per-user
   data dir only works if `add` and the sync job share a user, or if the env var
   is set on the sync host. Owner: **the owner**. Ticket: F8 blocker.
4. Contract test that the catalogue survives a restart (subprocess `add`,
   then a new subprocess `list --json`). Owner: implementer agent. Ticket: A1.

### The owner's decision
Will anything write the catalogue concurrently in v1, for example the sync job
writing back, or several staff on a shared drive?
- **A** - No: **JSON file** in the per-user data dir, with an env-var override
  and atomic replace. Readable by anyone, stdlib, cheapest to build and
  maintain. Costs: lost updates if concurrent writers appear later (migrating
  behind `books.py` is cheap while the store stays private).
- **B** - Yes, or not sure: **SQLite** at the same location. Safe concurrent
  access and hot backup. Costs: opaque to staff and to Notepad, plus a schema
  the next maintainer owns.
- **C** - As briefed: **JSON file next to the package**. All four seats were
  against it; a reinstall loses the catalogue.

Recommendation (the chief's): **A**. Three seats chose it outright and ops
accepts it under the atomic-replace rule. While the store stays private the
choice is reversible, so v1 does not pay for concurrency it may not have.
