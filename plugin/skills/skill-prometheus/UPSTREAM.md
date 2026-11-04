# skill-prometheus upstreams

skill-prometheus adapts external search connector guidance from Anthropic's
knowledge-work-plugins (F146): compact capability-to-tool mappings and fallback
discipline, rewritten in skillator's authoring voice. This file records what
was taken and from which commit, so future upstream modifications can be
tracked and absorbed intentionally. It is also the manifest that
`practice/scripts/upstream-check.sh` and `upstream-check.ps1` read. Keep the
table under `## Upstreams` in its current shape.

## Upstreams

| Name | Repo | Watched paths | Absorbed commit | Absorbed | skill-prometheus files / sections |
|---|---|---|---|---|---|
| enterprise-search | `anthropics/knowledge-work-plugins` | `enterprise-search/CONNECTORS.md` | `2574e29377c7173d0cecffef29a6ecbd7f8ccb5d` | 2026-11-04 | `references/connectors.md` (capability categories, real tool mappings, explicit status distinction, fallback behaviors, and no-results-versus-source-failed discipline) |

Notes on the row:

- **Reframed, not copied.** Upstream describes enterprise search connectors
  and configurations for external enterprise data. Skillator adapts this into a
  compact authoring reference for skills and agent workflows (`references/connectors.md`),
  retaining the capability taxonomy (`chat_search`, `document_search`, `code_search`,
  `issue_search`, `customer_search`).
- **Four explicit states added:** Skillator introduces strict runtime state distinction:
  `discovered`, `authenticated`, `read-success`, and `unavailable`. Visible tools or
  declared connectors are never presumed authenticated or working without evidence.
- **Failures and fallbacks specified:** Upstream lacks mechanical separation between
  an empty search result and an unreachable or broken backend. Skillator adds the
  strict requirement: `read-success` with zero items is distinct from `source_failed`.
  Scenarios for no connector, authentication failure, rate limiting, and partial
  coverage are made explicit with non-crashing fallbacks.
- **Excluded:** Blanket Cowork configuration imports, runtime connector registry
  frameworks, and speculative cloud credential discovery.
- **Absorbed** is the date skill-prometheus took the content in, not the upstream
  commit date.

## When the check reports a change

Detection only: `changed enterprise-search <old>..<new> <compare-url>`, exit 1.
grayskull-power's arming turns that into one `A` ticket,
`absorb enterprise-search <old>..<new> into skill-prometheus`. Follow the procedure
in `skills/design-arwen/UPSTREAM.md` §When the check reports a change: read the diff,
assess capability or contract updates, verify with tests RED then GREEN, and update
the commit and date.

## License

knowledge-work-plugins is licensed under the Apache License, Version 2.0.
The notice and license below are retained as required:

```text
Copyright 2025 Anthropic, PBC.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
