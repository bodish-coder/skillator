# Connector capabilities and fallback behavior

Authoring reference for skills and tool integrations that query external services
and knowledge sources (e.g. enterprise chat, documents, issue trackers). Adapted
from `anthropics/knowledge-work-plugins` (`enterprise-search/CONNECTORS.md`) under
Apache-2.0.

```
A VISIBLE TOOL IS NOT AN AUTHENTICATED TOOL.
AN EMPTY RESULT IS NOT A FAILED SOURCE.
```

---

## 1. Capability categories and tool mapping

Skills must request capabilities by generic intent rather than binding to vendor-specific
APIs. Connectors map capability categories to real tools available in the host environment:

| Capability | Intent | Real tools / services |
|---|---|---|
| `chat_search` | Search channels, threads, and direct messages | Slack (`slack_search`), Microsoft Teams (`teams_read_messages`), Discord |
| `document_search` | Search team knowledge bases, wikis, and cloud files | Google Drive (`gdrive_search`), Notion (`notion_search`), Confluence (`confluence_search`) |
| `code_search` | Search repositories, commits, and diffs | GitHub (`github_search_code`), GitLab (`gitlab_search`) |
| `issue_search` | Search work tickets, bugs, and project boards | Jira (`jira_search`), Linear (`linear_search_issues`), GitHub Issues |
| `customer_search` | Search customer tickets and CRM records | Zendesk (`zendesk_search`), Salesforce (`salesforce_query`) |

---

## 2. Four explicit statuses

Never assume a connector is functional because a tool name is declared or visible in the host
manifest. Every connector must be in one of four explicit runtime states:

1. **`discovered`**:
   The tool declaration or configuration is visible in the environment or host toolset,
   but connectivity, credentials, and API tokens have not yet been proven.
2. **`authenticated`**:
   Valid credentials, tokens, or active sessions are confirmed, but no data payload read
   has succeeded yet.
3. **`read-success`**:
   An actual read request was executed against the source endpoint and returned a valid response.
   The returned dataset may contain records or be empty (`items: []`).
4. **`unavailable`**:
   The connector cannot be queried. The reason must be recorded:
   - `not_discovered`: No matching tool or connector is available in this environment.
   - `auth_failure`: Missing, invalid, expired, or rejected credentials (HTTP 401/403).
   - `rate_limited`: Concurrency or rate ceiling reached (HTTP 429).
   - `source_failed`: Remote service error, 5xx response, network partition, or timeout.
   - `host_unsupported`: Current host does not support this tool type or protocol.

---

## 3. Fallback behaviors

When querying a connector capability, an agent or consumer must apply deterministic fallback rules:

### A. No connector available
- **Condition:** No tool for the requested capability is discovered in the environment.
- **Behavior:** Return status `unavailable` with reason `no_connector`.
- **Fallback:** Degrade gracefully to local repository files, indexed docs, or prompt the user
  with instructions to configure the connector. Never invent synthetic search results or claim
  a source was searched.

### B. Authentication failure
- **Condition:** Connector is discovered, but credentials are missing or rejected.
- **Behavior:** Mark status `unavailable` with reason `auth_failure`.
- **Fallback:** Immediately halt queries to that provider. Do not loop or retry blindly.
  Prompt the user once with the specific configuration requirement.

### C. Rate limit
- **Condition:** Connector returns HTTP 429 or quota limit error.
- **Behavior:** Mark status `unavailable` with reason `rate_limited`. Record `retryAfterMs` if provided.
- **Fallback:** If cached data is available, return it labeled with a staleness warning. Otherwise,
  defer querying until after the backoff window.

### D. Partial coverage
- **Condition:** A capability spans multiple sources (e.g. searching both Slack and Teams), where
  some sources succeed and others fail.
- **Behavior:** Overall status is `read-success` with `partialCoverage: true`.
- **Fallback:** Aggregate items from the working sources (`read-success`), but explicitly list
  the failed sources and their failure reasons in the response ledger. Never swallow errors or
  silently pretend the search had full coverage.

### E. No results vs source failed (Critical distinction)
- **`read-success` with zero items (`count: 0, items: []`):**
  The remote source ran the query successfully and confirmed that no matching records exist.
- **`unavailable` with `reason: "source_failed"`:**
  The remote source encountered a server error, network outage, or request timeout.
- **Rule:** Never mask a source failure as "zero results found". Masking failures creates false
  confidence that information does not exist when the query simply failed to execute.

---

## 4. Host-specific live evidence gate

In accordance with [PLATFORMS.md](../../../PLATFORMS.md), connector capability status on a host
must remain explicit and uninflated:

- **`verified live`**: Only when verified with real credentials and a live endpoint on the specific host.
- **`tested with stubs`**: Validated against offline mock data, fixtures, or simulated responses.
- **`implemented`**: Adapter or mapping written, but unverified.
- **`unverified gap`**: Tool not verified on host.

Offline tests must report `tested with stubs` and must never claim `verified live`.

---

## 5. Reference consumer contract

Consumers implement this minimal interface without requiring a heavyweight registry:

```javascript
// Function signature
function queryCapability(capability, query, sources = [])

// Return shape
{
  capability: string,          // e.g. 'chat_search'
  status: 'read-success' | 'unavailable',
  reason?: string,             // 'no_connector' | 'auth_failure' | 'rate_limited' | 'source_failed'
  partialCoverage?: boolean,   // true if some sources succeeded and some failed
  items: Array<any>,           // retrieved results
  sources: Array<{             // per-source ledger
    tool: string,
    status: 'discovered' | 'authenticated' | 'read-success' | 'unavailable',
    reason?: string,
    itemCount?: number,
    liveEvidence?: 'tested with stubs' | 'verified live' | 'implemented' | 'unverified gap'
  }>
}
```
