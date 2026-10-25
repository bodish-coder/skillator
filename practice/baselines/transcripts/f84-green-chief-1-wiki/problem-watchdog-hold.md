# Problem: low-memory watchdog hold blocks subagents

Sources: `.skillator/watchdog.hold` (content on 2026-10-25:
`2026-10-25T15:53Z mem 0.2 GB free (below 1 GB)`); [serial-subagents](pref-serial-subagents.md).

## History
- 2026-10-25 - A hold file was present. The chief's attempts to re-check free
  memory (PowerShell CIM, `/proc/meminfo`) needed permission it did not have,
  so the hold was respected: no subagents ran this session. As a result, B3,
  B4, B6 and F3 were done in-session (03dbcc3), and both boards
  ([persistence](decision-persistence.md), [export-format](decision-export-format.md))
  were deferred.
- Next session: check whether the hold file still exists and whether memory
  is above 1 GB. If yes, convene the boards one seat at a time. If no, ask
  the owner to free memory or to allow a memory check.
