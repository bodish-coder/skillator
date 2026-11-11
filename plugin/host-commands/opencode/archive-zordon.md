---
description: "Archive closed tickets: move [x]/[-] rows closed over 14 days (--days N) from TICKETS.md to TICKETS-archive.md (tickets-zordon)"
---
Load the `tickets-zordon` skill ({{SKILLS}}/tickets-zordon/SKILL.md) and run its "Archive what has stayed closed"
step for this repo's TICKETS.md. Arguments: `$ARGUMENTS` (`--days N`, default 14).

1. `sh {{SKILLS}}/practice/scripts/archive-tickets.sh --dry-run [--days N]` from the repo root; show
   what would move.
2. Nothing would move → say so in one line and stop.
3. Else run it again without `--dry-run`, then `sh {{SKILLS}}/practice/scripts/check-tickets.sh`.
   Commit `TICKETS.md` and `TICKETS-archive.md` together, in their own commit
   (`tickets: archive N closed`). Do not push; it goes with the session's next push.
