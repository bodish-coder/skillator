# deploy-niyoj upstreams

deploy-niyoj absorbs the runbook output template from Anthropic's knowledge-work-plugins (F145).
This file records what was taken and from which commit, so a later change upstream can be
found and absorbed on purpose. Keep the table below in its current shape: the script parses
the rows under `## Upstreams`, and a row it cannot parse is an error, not a skip.

## Upstreams

| Name | Repo | Watched paths | Absorbed commit | Absorbed | deploy-niyoj files / sections |
|---|---|---|---|---|---|
| knowledge-work-runbook | `anthropics/knowledge-work-plugins` | `operations/skills/runbook/SKILL.md` | `2574e29377c7173d0cecffef29a6ecbd7f8ccb5d` | 2026-10-31 | `references/runbooks.md` (runbook output schema, step structure with owner, prerequisites, exact commands, expected result, failure branch, rollback verification, last-tested revision, unverified tracking for unexecuted checks), `SKILL.md` Phase 3 and Release ritual |

## Notes on the row

- **Source & Commit:** Adapted from `anthropics/knowledge-work-plugins` at commit `2574e29377c7173d0cecffef29a6ecbd7f8ccb5d` (`operations/skills/runbook/SKILL.md#L19-L70`).
- **License:** Apache-2.0 (Anthropic, PBC).
- **Modifications:**
  - Adapted runbook structure to single-VPS manual deploys over SSH via NiYoj (`BatchMode=yes`).
  - Preserved existing deployment mechanics, release ritual, and revert rollback rules.
  - Omitted automatic external publishing to wikis or external communication tools; handoffs remain local markdown files or console output.
  - Enforced that missing or incomplete inputs stop execution before commands run.
  - Enforced that unexecuted checks remain explicitly `unverified`.
  - Added rollback verification and last-tested revision tracking.
