# deploy-merlin upstreams

deploy-merlin absorbs runbooks and incident records from Anthropic's knowledge-work-plugins (F145, F148).
This file records what was taken and from which commit, so a later change upstream can be
found and absorbed on purpose. Keep the table below in its current shape: the script parses
the rows under `## Upstreams`, and a row it cannot parse is an error, not a skip.

## Upstreams

| Name | Repo | Watched paths | Absorbed commit | Absorbed | deploy-merlin files / sections |
|---|---|---|---|---|---|
| knowledge-work-runbook | `anthropics/knowledge-work-plugins` | `operations/skills/runbook/SKILL.md` | `2574e29377c7173d0cecffef29a6ecbd7f8ccb5d` | 2026-10-31 | `references/runbooks.md` (runbook output schema, step structure with owner, prerequisites, exact commands, expected result, failure branch, rollback verification, last-tested revision, unverified tracking for unexecuted checks), `SKILL.md` Step 3 |
| knowledge-work-incident-response | `anthropics/knowledge-work-plugins` | `engineering/skills/incident-response/SKILL.md` | `2574e29377c7173d0cecffef29a6ecbd7f8ccb5d` | 2026-11-05 | `references/incidents.md` (incident record reference: severity, owner, timestamped facts, uncertainty, mitigation, resolution evidence, follow-up ticket IDs; preserves code rollback and forward-only migration rules; rejects automatic paging/posting/channel creation) |

## Notes on the row

### knowledge-work-runbook
- **Source & Commit:** Adapted from `anthropics/knowledge-work-plugins` at commit `2574e29377c7173d0cecffef29a6ecbd7f8ccb5d` (`operations/skills/runbook/SKILL.md#L19-L70`).
- **License:** Apache-2.0 (Anthropic, PBC).
- **Modifications:**
  - Adapted runbook structure to single-VPS deployment handoffs (GitHub Actions CI + SSH to `deploy.sh`).
  - Preserved existing deployment mechanics and copy-pasteable commands.
  - Omitted automatic external publishing to wikis or external communication tools; handoffs remain local markdown files or console output.
  - Enforced that missing or incomplete inputs stop execution before commands run.
  - Enforced that unexecuted checks remain explicitly `unverified`.
  - Added rollback verification and last-tested revision tracking.

### knowledge-work-incident-response
- **Source & Commit:** Adapted from `anthropics/knowledge-work-plugins` at commit `2574e29377c7173d0cecffef29a6ecbd7f8ccb5d` (`engineering/skills/incident-response/SKILL.md#L58-L152`).
- **License:** Apache-2.0 (Anthropic, PBC).
- **Modifications:**
  - Adapted incident record schema for deployment continuity in single-VPS CI environments (deploy-merlin).
  - Preserved git revert rollback (`git revert HEAD --no-edit && git push origin main`) and forward-only migration rules.
  - Omitted automatic paging, chat posting, and channel creation; incident continuity artifacts remain local markdown files.
  - Enforced data sanitization for malicious log payloads to prevent command injection or unauthorized incident manipulation.
  - Required explicit separation of verified facts from uncertainty, with resolution evidence and follow-up ticket IDs required for unproven root causes.
