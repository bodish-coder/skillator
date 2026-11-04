# spec-watson upstream

spec-watson absorbs the product outcomes structure from Anthropic's
knowledge-work-plugins (F144): specifically the outcome and measurement
scaffolding from the `write-spec` skill, adapted to skillator's strict
requirement-id and test-traceability discipline. This file records what was taken
and from which commit, so later upstream changes can be tracked and absorbed on
purpose. It is also the manifest that `practice/scripts/upstream-check.sh` and
`upstream-check.ps1` read. Keep the table below in its current shape: the script
parses rows under `## Upstreams`.

Version numbers are not a signal. The check compares commits, not versions.

## Upstreams

| Name | Repo | Watched paths | Absorbed commit | Absorbed | spec-watson files / sections |
|---|---|---|---|---|---|
| write-spec | `anthropics/knowledge-work-plugins` | `product-management/skills/write-spec/SKILL.md` | `2574e29377c7173d0cecffef29a6ecbd7f8ccb5d` | 2026-11-05 | `references/artifacts.md` → Optional Product Outcomes (audience/problem, desired outcome, metric source, baseline, target when known, measurement window, evaluation date); adapted to preserve permanent R IDs and Evidence trace tables, let unknown measurements remain unknown without fabricated targets, and waive PRD ceremony on mechanical edits. |

Notes on the row:

- **Reframed, not copied.** Upstream writes full-ceremony PRDs with narrative
  goals and metrics. Skillator's core law remains: a requirement must carry a
  permanent id (`R1`, `R2`, …) and trace to an evidence file:symbol path. Product
  outcomes are adapted as an optional front matter block for user/product-facing
  briefs.
- **Unknowns remain unknown.** Upstream prompts often encourage projecting or
  estimating targets. In skillator, missing baselines or uninstrumented metrics
  stay explicitly `UNKNOWN` or omitted; fabricating targets is forbidden.
- **No PRD ceremony for mechanical changes.** Tiny technical edits, bug fixes,
  and refactors do not require audience/problem or metric tables; R IDs and trace
  tables suffice.

## Modifications

In accordance with Section 4(b) of the Apache License, Version 2.0, the following
modifications were made to the absorbed upstream content:
- Adapted product outcomes into an optional, lightweight section within `references/artifacts.md`.
- Integrated outcome definitions with spec-watson's strict requirement identifier (`R1`, `R2`, …) discipline and mechanical trace table (`Satisfied by` / `Evidence` paths).
- Explicitly barred fabricated metrics: unknown baselines, targets, and evaluation dates remain unknown.
- Exempted mechanical and tiny technical edits from outcome ceremony.

## License

Derived in part from `anthropics/knowledge-work-plugins` (`product-management/skills/write-spec/SKILL.md`),
licensed under the Apache License, Version 2.0.

```
Copyright 2026 Anthropic, PBC.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, EXPRESS OR IMPLIED.
See the License for the specific language governing permissions and
limitations under the License.
```
