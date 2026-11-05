# handoff-cortana upstreams

handoff-cortana absorbs incident record continuity from Anthropic's knowledge-work-plugins (F148).
This file records what was taken and from which commit, so a later change upstream can be
found and absorbed on purpose. Keep the table below in its current shape: the script parses
the rows under `## Upstreams`, and a row it cannot parse is an error, not a skip.

## Upstreams

| Name | Repo | Watched paths | Absorbed commit | Absorbed | handoff-cortana files / sections |
|---|---|---|---|---|---|
| knowledge-work-incident-response | `anthropics/knowledge-work-plugins` | `engineering/skills/incident-response/SKILL.md` | `2574e29377c7173d0cecffef29a6ecbd7f8ccb5d` | 2026-11-05 | `references/incidents.md` (incident record continuity schema: severity, owner, timestamped facts, uncertainty tracking, mitigation, resolution evidence, follow-up ticket IDs; preserves code rollback and forward-only migration rules; rejects automatic paging/posting/channel creation) |

## Notes on the row

- **Source & Commit:** Adapted from `anthropics/knowledge-work-plugins` at commit `2574e29377c7173d0cecffef29a6ecbd7f8ccb5d` (`engineering/skills/incident-response/SKILL.md#L58-L152`).
- **License:** Apache-2.0 (Anthropic, PBC).
- **Modifications:**
  - Adapted incident response lifecycle into a local continuity record for handoff-cortana sessions.
  - Preserved existing code rollback and forward-only migration rules across handoffs.
  - Omitted automatic external paging, chat posting, and remote war-room channel creation; records remain local Markdown artifacts.
  - Enforced log sanitization to protect against prompt injection in telemetry or log streams.
  - Required explicit separation of verified facts from uncertainty, with resolution evidence and follow-up ticket IDs required for unproven root-cause recoveries.
